import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { finding, mandant, produkt } from '../src/db/schema';
import { setzeEvidenz } from '../src/domain/evidenz';
import { bewerteFindings, setzeFindingTriage } from '../src/portal/findings';
import { ingest } from '../src/portal/ingestion';
import { spiegleOsv, type OsvEingang } from '../src/portal/osv-spiegel';
import { QUELLE, starteTestDB, type TestDB } from './setup';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'),
  );
}

// Lokales OSV-Fixture: trifft log4j-core 2.14.1 (Log4Shell) und lodash 4.17.20.
const OSV_FIXTURE: OsvEingang[] = [
  {
    osvId: 'GHSA-jfh8-c2jp-5v3q',
    ecosystem: 'Maven',
    paket: 'org.apache.logging.log4j:log4j-core',
    eingefuehrt: '2.0',
    behoben: '2.15.0',
    schweregrad: '10.0',
    zusammenfassung: 'Log4Shell RCE',
  },
  {
    osvId: 'GHSA-p6mc-m468-83gw',
    ecosystem: 'npm',
    paket: 'lodash',
    eingefuehrt: '0',
    behoben: '4.17.21',
    schweregrad: '7.4',
    zusammenfassung: 'Prototype pollution',
  },
];

let t: TestDB;
beforeAll(async () => {
  t = await starteTestDB();
}, 120_000);
afterAll(async () => t?.stop());
beforeEach(async () => t.reset());

async function produktMitSbom(einsatz?: string) {
  const [m] = await t.db.insert(mandant).values({ name: 'K' }).returning();
  const [p] = await t.db.insert(produkt).values({ mandantId: m!.id, name: 'P' }).returning();
  if (einsatz !== undefined) {
    await setzeEvidenz(t.db, {
      mandantId: m!.id,
      produktId: p!.id,
      feldId: 'r_einsatzumgebung',
      wert: [einsatz],
      quelle: QUELLE,
    });
  }
  await ingest(t.db, {
    produktId: p!.id,
    streamName: 'Firmware',
    kanal: 'api_token',
    roh: fixture('sbom-cyclonedx.json'),
  });
  return { mandantId: m!.id, produktId: p!.id };
}

describe('M1: Match erzeugt Findings', () => {
  it('betroffene Komponenten ergeben Findings mit Schweregrad und Quelle osv', async () => {
    const { mandantId, produktId } = await produktMitSbom();
    await spiegleOsv(t.db, OSV_FIXTURE);
    await bewerteFindings(t.db, mandantId, produktId);
    const fs = await t.db.select().from(finding).where(eq(finding.produktId, produktId));
    const ids = fs.map((f) => f.schwachstelleId).sort();
    expect(ids).toEqual(['GHSA-jfh8-c2jp-5v3q', 'GHSA-p6mc-m468-83gw']);
    expect(fs.every((f) => f.quelle === 'osv')).toBe(true);
    expect(fs.find((f) => f.schwachstelleId === 'GHSA-jfh8-c2jp-5v3q')?.schweregrad).toBe('10.0');
  });
});

describe('M2: kontinuierliche Neubewertung gegen unverändertes SBOM', () => {
  it('neues Advisory im Spiegel erzeugt ein Finding ohne neue Lieferung', async () => {
    const { mandantId, produktId } = await produktMitSbom();
    await spiegleOsv(t.db, []); // anfangs leer
    await bewerteFindings(t.db, mandantId, produktId);
    expect((await t.db.select().from(finding).where(eq(finding.produktId, produktId))).length).toBe(
      0,
    );

    await spiegleOsv(t.db, OSV_FIXTURE); // Advisory kommt später hinzu
    await bewerteFindings(t.db, mandantId, produktId);
    const fs = await t.db
      .select()
      .from(finding)
      .where(and(eq(finding.produktId, produktId), eq(finding.behobenDurchDaten, false)));
    expect(fs.length).toBe(2);
  });
});

describe('M3: Behebung/Rückzug', () => {
  it('unbearbeitetes Finding verschwindet (behoben_durch_daten), wenn Advisory entfällt', async () => {
    const { mandantId, produktId } = await produktMitSbom();
    await spiegleOsv(t.db, OSV_FIXTURE);
    await bewerteFindings(t.db, mandantId, produktId);
    await spiegleOsv(t.db, []); // alle Advisories zurückgezogen
    await bewerteFindings(t.db, mandantId, produktId);
    const offen = await t.db
      .select()
      .from(finding)
      .where(and(eq(finding.produktId, produktId), eq(finding.behobenDurchDaten, false)));
    expect(offen.length).toBe(0);
    // Die Finding-Zeilen bleiben (als behoben_durch_daten) erhalten.
    expect((await t.db.select().from(finding).where(eq(finding.produktId, produktId))).length).toBe(
      2,
    );
  });

  it('bearbeitetes Finding bleibt sichtbar, auch wenn das Advisory entfällt', async () => {
    const { mandantId, produktId } = await produktMitSbom();
    await spiegleOsv(t.db, OSV_FIXTURE);
    await bewerteFindings(t.db, mandantId, produktId);
    const [f] = await t.db.select().from(finding).where(eq(finding.produktId, produktId));
    await setzeFindingTriage(t.db, f!.id, 'in_pruefung'); // in Bearbeitung genommen
    await spiegleOsv(t.db, []);
    await bewerteFindings(t.db, mandantId, produktId);
    const [danach] = await t.db.select().from(finding).where(eq(finding.id, f!.id));
    expect(danach!.behobenDurchDaten).toBe(false); // bleibt offen sichtbar
  });
});

describe('M4: Triage-Übergänge', () => {
  it('gültiger Pfad neu→in_pruefung→bestaetigt→behoben; unzulässig wird abgelehnt', async () => {
    const { mandantId, produktId } = await produktMitSbom();
    await spiegleOsv(t.db, OSV_FIXTURE);
    await bewerteFindings(t.db, mandantId, produktId);
    const [f] = await t.db.select().from(finding).where(eq(finding.produktId, produktId));
    await setzeFindingTriage(t.db, f!.id, 'in_pruefung');
    await setzeFindingTriage(t.db, f!.id, 'bestaetigt');
    await setzeFindingTriage(t.db, f!.id, 'behoben');
    const [final] = await t.db.select().from(finding).where(eq(finding.id, f!.id));
    expect(final!.triageStatus).toBe('behoben');
    await expect(setzeFindingTriage(t.db, f!.id, 'neu')).rejects.toThrow(/Unzulässig/);
  });
});

describe('M5: Exploitability-Hinweis aus Produktkontext', () => {
  it('internet_exponiert → erhöht; isoliert → eingeschränkt (jeweils als Vorschlag)', async () => {
    const exponiert = await produktMitSbom('internet_exponiert');
    await spiegleOsv(t.db, OSV_FIXTURE);
    await bewerteFindings(t.db, exponiert.mandantId, exponiert.produktId);
    const [fe] = await t.db
      .select()
      .from(finding)
      .where(eq(finding.produktId, exponiert.produktId));
    expect(fe!.exploitabilityHinweis).toMatch(/erhöht/);

    const isoliert = await produktMitSbom('isoliert');
    await bewerteFindings(t.db, isoliert.mandantId, isoliert.produktId);
    const [fi] = await t.db.select().from(finding).where(eq(finding.produktId, isoliert.produktId));
    expect(fi!.exploitabilityHinweis).toMatch(/eingeschränkt/);
  });
});
