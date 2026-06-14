import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { behoerdenAnschreiben, mandant, produkt } from '../src/db/schema';
import { setzeEvidenz } from '../src/domain/evidenz';
import { pruefeIntegritaet } from '../src/portal/audit';
import {
  erfasseEingangsbestaetigung,
  erstanschreibenEntwurf,
  versendeErstanschreiben,
} from '../src/portal/erstanschreiben';
import { QUELLE, starteTestDB, type TestDB } from './setup';

let t: TestDB;
beforeAll(async () => {
  t = await starteTestDB();
}, 120_000);
afterAll(async () => t?.stop());
beforeEach(async () => t.reset());

async function mandantMitKontakt() {
  const [m] = await t.db.insert(mandant).values({ name: 'Musterfirma IoT GmbH' }).returning();
  const [p] = await t.db.insert(produkt).values({ mandantId: m!.id, name: 'P' }).returning();
  // Etwas Evidenz, damit die Kette einen Kopf-Hash hat + Kontakt vorhanden ist.
  await setzeEvidenz(t.db, {
    mandantId: m!.id,
    produktId: null,
    feldId: 's_meldung_csirt_zustaendig',
    wert: 'CISO meldet an BSI',
    quelle: QUELLE,
  });
  return { mandantId: m!.id, produktId: p!.id };
}

describe('S3: BSI-Erstanschreiben (Meldebereitschaft)', () => {
  it('Entwurf enthält Mandantenname, Kontakte und den aktuellen Kopf-Hash', async () => {
    const { mandantId, produktId } = await mandantMitKontakt();
    const e = await erstanschreibenEntwurf(t.db, mandantId, produktId);
    expect(e.mandantName).toBe('Musterfirma IoT GmbH');
    expect(e.kopfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(e.kontakte['s_meldung_csirt_zustaendig']).toBe('CISO meldet an BSI');
    expect(e.text).toContain('Art. 14');
    expect(e.text).toContain(e.kopfHash!);
  });

  it('Versand erzeugt einen verketteten Eintrag; Anschreiben unveränderlich', async () => {
    const { mandantId, produktId } = await mandantMitKontakt();
    const { id } = await versendeErstanschreiben(t.db, mandantId, 'CISO', produktId);
    const r = await pruefeIntegritaet(t.db);
    expect(r.intakt).toBe(true);
    // Inhalt nachträglich ändern ist verboten.
    let gefangen: unknown;
    await t.db
      .update(behoerdenAnschreiben)
      .set({ versendetVon: 'x' })
      .where(eq(behoerdenAnschreiben.id, id))
      .catch((e: unknown) => (gefangen = e));
    expect(JSON.stringify(gefangen, Object.getOwnPropertyNames(gefangen ?? {}))).toMatch(
      /unveraenderlich/,
    );
  });

  it('Eingangsbestätigung ist genau einmal nachtragbar (trotz Unveränderlichkeit)', async () => {
    const { mandantId, produktId } = await mandantMitKontakt();
    const { id } = await versendeErstanschreiben(t.db, mandantId, 'CISO', produktId);
    // einmaliges Nachtragen erlaubt
    await erfasseEingangsbestaetigung(t.db, id, 'BSI-AZ-2026-0001');
    const [a] = await t.db
      .select()
      .from(behoerdenAnschreiben)
      .where(eq(behoerdenAnschreiben.id, id));
    expect(a!.eingangsbestaetigung).toBe('BSI-AZ-2026-0001');
    expect(a!.bestaetigtAm).not.toBeNull();
    // Kette bleibt intakt (payload schließt eingangsbestaetigung aus)
    expect((await pruefeIntegritaet(t.db)).intakt).toBe(true);
    // zweites Nachtragen/Ändern verboten
    let gefangen: unknown;
    await t.db
      .update(behoerdenAnschreiben)
      .set({ eingangsbestaetigung: 'andere-az' })
      .where(eq(behoerdenAnschreiben.id, id))
      .catch((e: unknown) => (gefangen = e));
    expect(JSON.stringify(gefangen, Object.getOwnPropertyNames(gefangen ?? {}))).toMatch(
      /unveraenderlich/,
    );
  });
});
