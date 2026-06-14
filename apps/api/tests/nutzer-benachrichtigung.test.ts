import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { finding, mandant, nutzerBenachrichtigung, produkt } from '../src/db/schema';
import { setzeEvidenz } from '../src/domain/evidenz';
import { bewerteFindings } from '../src/portal/findings';
import { ingest } from '../src/portal/ingestion';
import { eroeffneAusFinding } from '../src/portal/meldung';
import {
  nutzerEntwurf,
  versendeNutzerbenachrichtigung,
} from '../src/portal/nutzer-benachrichtigung';
import { pruefeIntegritaet } from '../src/portal/audit';
import { spiegleOsv, type OsvEingang } from '../src/portal/osv-spiegel';
import { QUELLE, starteTestDB, type TestDB } from './setup';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'),
  );
}
const OSV: OsvEingang[] = [
  {
    osvId: 'GHSA-p6mc-m468-83gw',
    ecosystem: 'npm',
    paket: 'lodash',
    behoben: '4.17.21',
    schweregrad: '7.4',
  },
];

let t: TestDB;
beforeAll(async () => {
  t = await starteTestDB();
}, 120_000);
afterAll(async () => t?.stop());
beforeEach(async () => t.reset());

async function vorgangMitProdukt() {
  const [m] = await t.db.insert(mandant).values({ name: 'K' }).returning();
  const [p] = await t.db.insert(produkt).values({ mandantId: m!.id, name: 'P' }).returning();
  await setzeEvidenz(t.db, {
    mandantId: m!.id,
    produktId: p!.id,
    feldId: 'p_produktname',
    wert: 'Smart-Lock Pro 2.0',
    quelle: QUELLE,
  });
  await ingest(t.db, {
    produktId: p!.id,
    streamName: 'Firmware',
    kanal: 'api_token',
    roh: fixture('sbom-cyclonedx.json'),
  });
  await spiegleOsv(t.db, OSV);
  await bewerteFindings(t.db, m!.id, p!.id);
  const [f] = await t.db.select().from(finding).where(eq(finding.produktId, p!.id));
  const vorgangId = await eroeffneAusFinding(t.db, {
    findingId: f!.id,
    titel: 'X',
    begruendung: 'y',
    eroeffnetVon: 'CISO',
  });
  return { mandantId: m!.id, produktId: p!.id, vorgangId };
}

describe('S2: Nutzerbenachrichtigung (Art. 14 Abs. 8)', () => {
  it('Entwurf je Vorgang aus Vorlage, Produktname vorbefüllt', async () => {
    const { vorgangId } = await vorgangMitProdukt();
    const e = await nutzerEntwurf(t.db, vorgangId);
    expect(e.art).toBe('schwachstelle');
    expect(e.versendet).toBe(false);
    expect(e.felder.some((f) => f.pflicht)).toBe(true);
    expect(e.felder.find((f) => f.id === 'produkt')?.wert).toBe('Smart-Lock Pro 2.0');
  });

  it('Versand wird unveränderlich festgehalten und verkettet', async () => {
    const { vorgangId } = await vorgangMitProdukt();
    await versendeNutzerbenachrichtigung(t.db, vorgangId, {
      inhalt: {
        produkt: 'Smart-Lock Pro 2.0',
        sachverhalt: 'Lücke',
        risiko: 'mittel',
        massnahmen: 'Update 2.1',
        handlungsempfehlung: 'aktualisieren',
      },
      versendetVon: 'Support',
    });
    const [nb] = await t.db
      .select()
      .from(nutzerBenachrichtigung)
      .where(eq(nutzerBenachrichtigung.vorgangId, vorgangId));
    expect(nb!.versendetAm).not.toBeNull();

    // unveränderlich nach Versand
    let gefangen: unknown;
    await t.db
      .update(nutzerBenachrichtigung)
      .set({ versendetVon: 'x' })
      .where(eq(nutzerBenachrichtigung.id, nb!.id))
      .catch((e: unknown) => (gefangen = e));
    expect(JSON.stringify(gefangen, Object.getOwnPropertyNames(gefangen ?? {}))).toMatch(
      /unveraenderlich/,
    );

    // in der Hash-Kette erfasst, Kette intakt
    const r = await pruefeIntegritaet(t.db);
    expect(r.intakt).toBe(true);

    // kein zweiter Versand
    await expect(
      versendeNutzerbenachrichtigung(t.db, vorgangId, { inhalt: {}, versendetVon: 'Y' }),
    ).rejects.toThrow(/Bereits versendet/);
  });
});
