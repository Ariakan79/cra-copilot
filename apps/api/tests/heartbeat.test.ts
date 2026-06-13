import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mandant, produkt, sbomLieferung, sbomStream } from '../src/db/schema';
import { bewerteFindings } from '../src/portal/findings';
import { heartbeat } from '../src/portal/heartbeat';
import { ingest } from '../src/portal/ingestion';
import { spiegleOsv, type OsvEingang } from '../src/portal/osv-spiegel';
import { starteTestDB, type TestDB } from './setup';

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

async function aufbau(maxAge: string) {
  const [m] = await t.db.insert(mandant).values({ name: 'K' }).returning();
  const [p] = await t.db.insert(produkt).values({ mandantId: m!.id, name: 'P' }).returning();
  await t.db.insert(sbomStream).values({
    mandantId: m!.id,
    produktId: p!.id,
    name: 'Firmware',
    format: 'cyclonedx',
    tool: 'syft',
    kanal: 'api_token',
    maxAgeHeartbeatTage: maxAge,
  });
  return { mandantId: m!.id, produktId: p!.id };
}

describe('Heartbeat (ADR-026)', () => {
  it('H1: Lieferung jünger als max_age ⇒ aktuell', async () => {
    const { produktId } = await aufbau('90');
    await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-cyclonedx.json'),
    });
    const jetzt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 Tage später
    const hb = await heartbeat(t.db, produktId, jetzt);
    expect(hb[0]!.status).toBe('aktuell');
    expect(hb[0]!.alterTage).toBe(10);
  });

  it('H2: Lieferung älter als max_age ⇒ ueberfaellig', async () => {
    const { produktId } = await aufbau('30');
    await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-cyclonedx.json'),
    });
    const jetzt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000); // 45 Tage später
    const hb = await heartbeat(t.db, produktId, jetzt);
    expect(hb[0]!.status).toBe('ueberfaellig');
  });

  it('ohne Lieferung ⇒ keine_lieferung', async () => {
    const { produktId } = await aufbau('30');
    const hb = await heartbeat(t.db, produktId);
    expect(hb[0]!.status).toBe('keine_lieferung');
  });

  it('H3: neue Findings ändern den Heartbeat nicht (Trennung ADR-026/028)', async () => {
    const { mandantId, produktId } = await aufbau('90');
    await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-cyclonedx.json'),
    });
    const jetzt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const vorher = await heartbeat(t.db, produktId, jetzt);

    // Neue Advisories → neue Findings, ohne neue Lieferung.
    const osv: OsvEingang[] = [
      {
        osvId: 'GHSA-p6mc-m468-83gw',
        ecosystem: 'npm',
        paket: 'lodash',
        behoben: '4.17.21',
        schweregrad: '7.4',
      },
    ];
    await spiegleOsv(t.db, osv);
    await bewerteFindings(t.db, mandantId, produktId);

    const nachher = await heartbeat(t.db, produktId, jetzt);
    expect(nachher[0]!.status).toBe(vorher[0]!.status);
    expect(nachher[0]!.alterTage).toBe(vorher[0]!.alterTage);
  });

  it('nicht-konforme Lieferung zählt nicht als Heartbeat-Lieferung', async () => {
    const { produktId } = await aufbau('30');
    await ingest(t.db, {
      produktId,
      streamName: 'Firmware',
      kanal: 'api_token',
      roh: fixture('sbom-unvollstaendig.json'),
    });
    const hb = await heartbeat(t.db, produktId);
    expect(hb[0]!.status).toBe('keine_lieferung');
    const lieferungen = await t.db
      .select()
      .from(sbomLieferung)
      .where(eq(sbomLieferung.produktId, produktId));
    expect(lieferungen.length).toBe(1); // gespeichert, aber nicht heartbeat-relevant
  });
});
