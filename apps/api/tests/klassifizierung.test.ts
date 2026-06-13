import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mandant, produkt } from '../src/db/schema';
import { setzeEvidenz } from '../src/domain/evidenz';
import { klassifizierungsvorschlag } from '../src/domain/klassifizierung';
import { QUELLE, starteTestDB, type TestDB } from './setup';

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

describe('Klassifizierungs-Adapter (Cockpit → Regel-Engine)', () => {
  it('schlägt für einen Passwort-Manager wichtig_klasse_1 vor', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId: null,
      feldId: 'm_rollen',
      wert: ['hersteller'],
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktumfang',
      wert: ['lokale_software'],
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_inverkehrbringen',
      wert: 'am_markt',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_ausnahmebereich',
      wert: 'keiner',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_oss_konstellation',
      wert: 'kommerziell',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produkttyp',
      wert: ['passwortmanager'],
      quelle: QUELLE,
    });

    const v = await klassifizierungsvorschlag(t.db, mandantId, produktId);
    expect(v.vorschlag).not.toBeNull();
    expect(v.vorschlag).toMatchObject({
      geltungsbereich: 'in_scope',
      kategorie: 'wichtig_klasse_1',
    });
    expect(v.begruendungspfad.map((b) => b.regel_id)).toContain('k_annex3_passwortmanager');
    expect(v.fehlende_eingaben).toEqual([]);
  });

  it('mehrere Produktgruppen: strengste gewinnt (Router+Firewall → Klasse II)', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId: null,
      feldId: 'm_rollen',
      wert: ['hersteller'],
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktumfang',
      wert: ['hardware'],
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_inverkehrbringen',
      wert: 'am_markt',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_ausnahmebereich',
      wert: 'keiner',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_oss_konstellation',
      wert: 'kommerziell',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produkttyp',
      wert: ['router_modem_switch', 'firewall_ids_ips'],
      quelle: QUELLE,
    });

    const v = await klassifizierungsvorschlag(t.db, mandantId, produktId);
    expect(v.vorschlag).toMatchObject({
      geltungsbereich: 'in_scope',
      kategorie: 'wichtig_klasse_2',
    });
  });

  it('sektorale Ausnahme (Medizin) → ausgenommen', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId: null,
      feldId: 'm_rollen',
      wert: ['hersteller'],
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktumfang',
      wert: ['lokale_software'],
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_inverkehrbringen',
      wert: 'am_markt',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_ausnahmebereich',
      wert: 'medizinprodukt',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produkttyp',
      wert: ['keine_davon'],
      quelle: QUELLE,
    });

    const v = await klassifizierungsvorschlag(t.db, mandantId, produktId);
    expect(v.vorschlag).toMatchObject({ geltungsbereich: 'ausgenommen' });
  });

  it('fehlende Produktgruppe ⇒ kein Vorschlag, fehlende Eingabe benannt', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId: null,
      feldId: 'm_rollen',
      wert: ['hersteller'],
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktumfang',
      wert: ['lokale_software'],
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_inverkehrbringen',
      wert: 'am_markt',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_ausnahmebereich',
      wert: 'keiner',
      quelle: QUELLE,
    });
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_oss_konstellation',
      wert: 'kommerziell',
      quelle: QUELLE,
    });
    // p_produkttyp fehlt bewusst

    const v = await klassifizierungsvorschlag(t.db, mandantId, produktId);
    expect(v.vorschlag).toBeNull();
    expect(v.fehlende_eingaben).toContain('produkttyp');
    expect(v.annahmen.length).toBeGreaterThan(0);
  });
});
