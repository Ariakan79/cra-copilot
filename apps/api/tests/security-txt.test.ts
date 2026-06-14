import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mandant, produkt, securityTxtPublikation } from '../src/db/schema';
import { setzeEvidenz } from '../src/domain/evidenz';
import { pruefeIntegritaet } from '../src/portal/audit';
import { generiereSecurityTxt, veroeffentlicheSecurityTxt } from '../src/portal/security-txt';
import { QUELLE, starteTestDB, type TestDB } from './setup';

let t: TestDB;
beforeAll(async () => {
  t = await starteTestDB();
}, 120_000);
afterAll(async () => t?.stop());
beforeEach(async () => t.reset());

async function mandantMit(kontakt?: string) {
  const [m] = await t.db.insert(mandant).values({ name: 'K' }).returning();
  const [p] = await t.db.insert(produkt).values({ mandantId: m!.id, name: 'P' }).returning();
  if (kontakt !== undefined) {
    await setzeEvidenz(t.db, {
      mandantId: m!.id,
      produktId: null,
      feldId: 's_cvd_kontaktstelle',
      wert: kontakt,
      quelle: QUELLE,
    });
  }
  return { mandantId: m!.id, produktId: p!.id };
}

describe('S1: security.txt-Generierung (RFC 9116)', () => {
  it('E-Mail-Kontakt wird zu mailto:, mit Expires + Preferred-Languages', async () => {
    const { mandantId } = await mandantMit('security@firma.de');
    const sec = await generiereSecurityTxt(t.db, mandantId);
    expect(sec.vorhanden).toBe(true);
    expect(sec.inhalt).toMatch(/^Contact: mailto:security@firma\.de$/m);
    expect(sec.inhalt).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
    expect(sec.inhalt).toMatch(/^Preferred-Languages:/m);
  });

  it('https-Kontakt bleibt unverändert', async () => {
    const { mandantId } = await mandantMit('https://firma.de/security');
    const sec = await generiereSecurityTxt(t.db, mandantId);
    expect(sec.inhalt).toMatch(/^Contact: https:\/\/firma\.de\/security$/m);
  });

  it('ohne erfassten Kontakt: kein Inhalt, sondern expliziter Hinweis', async () => {
    const { mandantId } = await mandantMit();
    const sec = await generiereSecurityTxt(t.db, mandantId);
    expect(sec.vorhanden).toBe(false);
    expect(sec.inhalt).toMatch(/Keine Meldekontaktstelle|Block 4/);
  });
});

describe('S1b: Publikation als verketteter Beleg', () => {
  it('Veröffentlichen schreibt einen Ketteneintrag; erneute Publikation einen zweiten', async () => {
    const { mandantId } = await mandantMit('security@firma.de');
    await veroeffentlicheSecurityTxt(t.db, mandantId);
    // Kontakt ändern → neue Publikation mit anderem Inhalt
    await setzeEvidenz(t.db, {
      mandantId,
      produktId: null,
      feldId: 's_cvd_kontaktstelle',
      wert: 'security@neu.de',
      quelle: QUELLE,
    });
    await veroeffentlicheSecurityTxt(t.db, mandantId);

    const pubs = await t.db
      .select()
      .from(securityTxtPublikation)
      .where(eq(securityTxtPublikation.mandantId, mandantId));
    expect(pubs.length).toBe(2);
    expect(pubs.some((p) => p.inhalt.includes('security@firma.de'))).toBe(true);
    expect(pubs.some((p) => p.inhalt.includes('security@neu.de'))).toBe(true);

    const r = await pruefeIntegritaet(t.db);
    expect(r.intakt).toBe(true);
    // Beide Publikationen sind in der Kette erfasst (plus die Evidenzknoten).
    expect(r.geprueft).toBeGreaterThanOrEqual(2);
  });

  it('eine veröffentlichte security.txt ist unveränderlich', async () => {
    const { mandantId } = await mandantMit('security@firma.de');
    await veroeffentlicheSecurityTxt(t.db, mandantId);
    const [pub] = await t.db.select().from(securityTxtPublikation);
    let gefangen: unknown;
    await t.db
      .update(securityTxtPublikation)
      .set({ inhalt: 'manipuliert' })
      .where(eq(securityTxtPublikation.id, pub!.id))
      .catch((e: unknown) => (gefangen = e));
    expect(JSON.stringify(gefangen, Object.getOwnPropertyNames(gefangen ?? {}))).toMatch(
      /unveraenderlich/,
    );
  });
});
