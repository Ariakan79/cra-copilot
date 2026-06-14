import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditKette, mandant, produkt } from '../src/db/schema';
import { pruefeIntegritaet } from '../src/portal/audit';
import { setzeEvidenz } from '../src/domain/evidenz';
import { ingest } from '../src/portal/ingestion';
import { QUELLE, starteTestDB, type TestDB } from './setup';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'),
  );
}

let t: TestDB;
beforeAll(async () => {
  t = await starteTestDB();
}, 120_000);
afterAll(async () => t?.stop());
beforeEach(async () => t.reset());

async function mandantMitProdukt() {
  const [m] = await t.db.insert(mandant).values({ name: 'K' }).returning();
  const [p] = await t.db.insert(produkt).values({ mandantId: m!.id, name: 'P' }).returning();
  return { mandantId: m!.id, produktId: p!.id };
}

describe('K1: Kettenwachstum & Verkettung', () => {
  it('jeder geschützte Append erzeugt einen verketteten Eintrag mit fortlaufender seq', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktname',
      wert: 'A',
      quelle: QUELLE,
    });
    await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-cyclonedx.json'),
    });
    const kette = await t.db.select().from(auditKette).orderBy(asc(auditKette.seq));
    expect(kette.length).toBe(2);
    expect(kette.map((k) => k.seq)).toEqual([1, 2]);
    expect(kette[0]!.vorgaengerHash).toBe('');
    expect(kette[1]!.vorgaengerHash).toBe(kette[0]!.hash); // verkettet
    expect(kette.map((k) => k.entity)).toEqual(['evidenz_knoten', 'sbom_lieferung']);
  });
});

describe('K2: Verifikation einer intakten Kette', () => {
  it('meldet intakt bis zum Kopf', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktname',
      wert: 'A',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'k_kategorie',
      wert: 'default',
      quelle: QUELLE,
    });
    const r = await pruefeIntegritaet(t.db);
    expect(r.intakt).toBe(true);
    expect(r.geprueft).toBe(2);
    expect(r.kopfHash).not.toBeNull();
  });

  it('K5: Genesis hat leeren Vorgänger und ist ab seq 1 verifizierbar', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktname',
      wert: 'A',
      quelle: QUELLE,
    });
    const [erster] = await t.db.select().from(auditKette).orderBy(asc(auditKette.seq));
    expect(erster!.seq).toBe(1);
    expect(erster!.vorgaengerHash).toBe('');
    expect((await pruefeIntegritaet(t.db)).intakt).toBe(true);
  });
});

describe('K3: Zeilenmanipulation wird erkannt', () => {
  it('geänderte Evidenzzeile (Trigger umgangen) bricht die Verifikation', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    const id = await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktname',
      wert: 'Original',
      quelle: QUELLE,
    });
    expect((await pruefeIntegritaet(t.db)).intakt).toBe(true);

    // Manipulation: Trigger temporär deaktivieren und Inhalt ändern.
    await t.db.execute(sql`alter table evidenz_knoten disable trigger evidenz_kein_update`);
    await t.db.execute(
      sql`update evidenz_knoten set wert = '"Manipuliert"'::jsonb where id = ${id}`,
    );
    await t.db.execute(sql`alter table evidenz_knoten enable trigger evidenz_kein_update`);

    const r = await pruefeIntegritaet(t.db);
    expect(r.intakt).toBe(false);
    expect(r.bruch?.grund).toBe('Inhalt geändert');
    expect(r.bruch?.entity).toBe('evidenz_knoten');
  });
});

describe('K4: Kettenmanipulation wird erkannt', () => {
  it('ein gelöschtes Kettenglied bricht die Verkettung', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktname',
      wert: 'A',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'k_kategorie',
      wert: 'default',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'sup_zeitraum_jahre',
      wert: '7',
      quelle: QUELLE,
    });

    // Mittleres Glied (seq 2) entfernen — Trigger umgehen.
    await t.db.execute(sql`alter table audit_kette disable trigger audit_kette_kein_delete`);
    await t.db.execute(sql`delete from audit_kette where seq = 2`);
    await t.db.execute(sql`alter table audit_kette enable trigger audit_kette_kein_delete`);

    const r = await pruefeIntegritaet(t.db);
    expect(r.intakt).toBe(false);
    expect(r.bruch?.grund).toBe('Verkettung gebrochen');
    expect(r.bruch?.seq).toBe(3); // an Glied 3 bricht der Vorgänger-Hash
  });
});

describe('K6: audit_kette ist selbst unveränderlich', () => {
  it('UPDATE/DELETE auf einen Ketteneintrag schlägt fehl', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktname',
      wert: 'A',
      quelle: QUELLE,
    });
    const [k] = await t.db.select().from(auditKette);
    let upd: unknown;
    await t.db
      .update(auditKette)
      .set({ hash: 'x' })
      .where(eq(auditKette.seq, k!.seq))
      .catch((e: unknown) => (upd = e));
    expect(JSON.stringify(upd, Object.getOwnPropertyNames(upd ?? {}))).toMatch(/unveraenderlich/);
    let del: unknown;
    await t.db
      .delete(auditKette)
      .where(eq(auditKette.seq, k!.seq))
      .catch((e: unknown) => (del = e));
    expect(JSON.stringify(del, Object.getOwnPropertyNames(del ?? {}))).toMatch(/unveraenderlich/);
  });
});
