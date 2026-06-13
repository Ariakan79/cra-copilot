import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { komponente, mandant, produkt, sbomLieferung } from '../src/db/schema';
import { ingest } from '../src/portal/ingestion';
import { neuesToken } from '../src/portal/auth';
import { ingestionToken } from '../src/db/schema';
import { starteTestDB, type TestDB } from './setup';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'),
  );
}

let t: TestDB;
let app: FastifyInstance;
beforeAll(async () => {
  t = await starteTestDB();
  app = buildApp(t.db);
  await app.ready();
}, 120_000);
afterAll(async () => {
  await app?.close();
  await t?.stop();
});
beforeEach(async () => t.reset());

async function mandantMitProdukt() {
  const [m] = await t.db.insert(mandant).values({ name: 'K' }).returning();
  const [p] = await t.db.insert(produkt).values({ mandantId: m!.id, name: 'P' }).returning();
  return { mandantId: m!.id, produktId: p!.id };
}

describe('I1: Lieferungen append-only, Komponenten = jüngste konforme Lieferung', () => {
  it('mehrere Uploads behalten alle Lieferzeilen; Komponenten spiegeln die letzte', async () => {
    const { produktId } = await mandantMitProdukt();
    const r1 = await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-cyclonedx.json'),
    });
    expect(r1.profilKonform).toBe(true);
    expect(r1.komponentenAnzahl).toBe(3);
    const r2 = await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-spdx.json'),
    });
    expect(r2.profilKonform).toBe(true);

    const lieferungen = await t.db
      .select()
      .from(sbomLieferung)
      .where(eq(sbomLieferung.produktId, produktId));
    expect(lieferungen.length).toBe(2);
    const komps = await t.db
      .select()
      .from(komponente)
      .where(and(eq(komponente.produktId, produktId), eq(komponente.streamName, 'Firmware')));
    expect(komps.map((k) => k.name).sort()).toEqual(['requests']);
  });
});

describe('I2: nicht-konforme Lieferung wird gespeichert, ändert Komponenten nicht', () => {
  it('unvollständiges SBOM ist nicht konform und lässt vorhandene Komponenten unangetastet', async () => {
    const { produktId } = await mandantMitProdukt();
    await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-cyclonedx.json'),
    });
    const r = await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-unvollstaendig.json'),
    });
    expect(r.profilKonform).toBe(false);
    expect(r.fehler.length).toBeGreaterThan(0);
    const komps = await t.db.select().from(komponente).where(eq(komponente.produktId, produktId));
    expect(komps.length).toBe(3); // weiterhin die der konformen Lieferung
    const lieferungen = await t.db
      .select()
      .from(sbomLieferung)
      .where(eq(sbomLieferung.produktId, produktId));
    expect(lieferungen.length).toBe(2); // auch die nicht-konforme ist gespeichert
  });
});

describe('I3: Multi-Stream getrennt', () => {
  it('Firmware und Cloud-Backend halten getrennte Komponenten', async () => {
    const { produktId } = await mandantMitProdukt();
    await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-cyclonedx.json'),
    });
    await ingest(t.db, {
      produktId,
      streamName: 'Cloud-Backend',
      kanal: 'api_token',
      roh: fixture('sbom-spdx.json'),
    });
    const fw = await t.db
      .select()
      .from(komponente)
      .where(and(eq(komponente.produktId, produktId), eq(komponente.streamName, 'Firmware')));
    const cloud = await t.db
      .select()
      .from(komponente)
      .where(and(eq(komponente.produktId, produktId), eq(komponente.streamName, 'Cloud-Backend')));
    expect(fw.length).toBe(3);
    expect(cloud.length).toBe(1);
  });
});

describe('I4: Ingestion-Token-Autorisierung', () => {
  it('falsches Token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest',
      headers: { authorization: 'Bearer falsch' },
      payload: { streamName: 'Firmware', sbom: fixture('sbom-cyclonedx.json') },
    });
    expect(res.statusCode).toBe(401);
  });

  it('gültiges Token lädt nur für sein Produkt; Lieferung kommt an', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    const { klartext, hash } = neuesToken();
    await t.db.insert(ingestionToken).values({ mandantId, produktId, tokenHash: hash });
    const res = await app.inject({
      method: 'POST',
      url: '/ingest',
      headers: { authorization: `Bearer ${klartext}` },
      payload: { streamName: 'Firmware', sbom: fixture('sbom-cyclonedx.json') },
    });
    expect(res.statusCode).toBe(201);
    const komps = await t.db.select().from(komponente).where(eq(komponente.produktId, produktId));
    expect(komps.length).toBe(3);
  });

  it('Lieferungen sind unveränderlich (append-only Trigger)', async () => {
    const { produktId } = await mandantMitProdukt();
    const r = await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-cyclonedx.json'),
    });
    let gefangen: unknown;
    await t.db
      .update(sbomLieferung)
      .set({ profilKonform: false })
      .where(eq(sbomLieferung.id, r.lieferungId))
      .catch((e: unknown) => (gefangen = e));
    expect(JSON.stringify(gefangen, Object.getOwnPropertyNames(gefangen ?? {}))).toMatch(
      /unveraenderlich/,
    );
  });
});
