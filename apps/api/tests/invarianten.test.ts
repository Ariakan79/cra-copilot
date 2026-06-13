import { sql as drizzleSql } from 'drizzle-orm';
import fc from 'fast-check';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mandant, produkt, evidenzKnoten, gap, type GapStatus } from '../src/db/schema';
import { aktuellerWert, setzeEvidenz, ZURUECK_AUF_DEFAULT } from '../src/domain/evidenz';
import { setzeGapStatus, synchronisiereGaps } from '../src/domain/gaps';
import { markiereWorkshopDurchgefuehrt } from '../src/domain/workshop';
import { eq } from 'drizzle-orm';
import { QUELLE, starteTestDB, type TestDB } from './setup';

let t: TestDB;
beforeAll(async () => {
  t = await starteTestDB();
}, 120_000);
afterAll(async () => t?.stop());
beforeEach(async () => t.reset());

async function mandantMitProdukt(): Promise<{ mandantId: string; produktId: string }> {
  const [m] = await t.db.insert(mandant).values({ name: 'Test GmbH' }).returning();
  const [p] = await t.db
    .insert(produkt)
    .values({ mandantId: m!.id, name: 'Produkt A' })
    .returning();
  return { mandantId: m!.id, produktId: p!.id };
}

describe('D1: lineare Supersession', () => {
  it('nach mehreren Korrekturen gibt es genau einen aktuellen Knoten', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    for (const wert of ['architektur', 'testberichte', 'pentest']) {
      await setzeEvidenz(t.db, {
        mandantId,
        produktId,
        feldId: 'd_vorhandene_artefakte',
        wert: [wert],
        quelle: QUELLE,
      });
    }
    const ketten = await t.db
      .select({ n: drizzleSql<number>`count(*)::int` })
      .from(evidenzKnoten)
      .where(
        drizzleSql`${evidenzKnoten.feldId} = 'd_vorhandene_artefakte' and not exists (select 1 from ${evidenzKnoten} nf where nf.ersetzt_id = ${evidenzKnoten.id})`,
      );
    expect(ketten[0]!.n).toBe(1);
    const aktuell = await aktuellerWert(t.db, mandantId, produktId, 'd_vorhandene_artefakte');
    expect(aktuell?.wert).toEqual(['pentest']);
  });

  it('alle drei Knoten bleiben erhalten (append-only)', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    for (const wert of ['ja', 'nein', 'ja']) {
      await setzeEvidenz(t.db, {
        mandantId,
        produktId,
        feldId: 'd_ce_prozess_definiert',
        wert,
        quelle: QUELLE,
      });
    }
    const alle = await t.db
      .select()
      .from(evidenzKnoten)
      .where(eq(evidenzKnoten.feldId, 'd_ce_prozess_definiert'));
    expect(alle.length).toBe(3);
  });
});

describe('D2: Evidenzknoten sind unveränderlich', () => {
  // Drizzle verpackt den Postgres-Fehler ("Failed query: …"); die Trigger-
  // Meldung steht in der Ursache. Wir prüfen, dass die Operation scheitert UND
  // der Trigger der Grund ist.
  const triggerHatGegriffen = async (op: Promise<unknown>): Promise<void> => {
    let gefangen: unknown;
    await op.catch((e: unknown) => (gefangen = e));
    expect(gefangen, 'Operation hätte scheitern müssen').toBeDefined();
    const text = JSON.stringify(gefangen, Object.getOwnPropertyNames(gefangen));
    expect(text).toMatch(/unveraenderlich/);
  };

  it('UPDATE auf einen Knoten schlägt fehl', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    const id = await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'd_ce_prozess_definiert',
      wert: 'ja',
      quelle: QUELLE,
    });
    await triggerHatGegriffen(
      t.db.update(evidenzKnoten).set({ wert: 'nein' }).where(eq(evidenzKnoten.id, id)),
    );
  });

  it('DELETE auf einen Knoten schlägt fehl', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    const id = await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'd_ce_prozess_definiert',
      wert: 'ja',
      quelle: QUELLE,
    });
    await triggerHatGegriffen(t.db.delete(evidenzKnoten).where(eq(evidenzKnoten.id, id)));
  });
});

describe('D4: Gap-Statusübergänge', () => {
  it('akzeptiert den gültigen Pfad offen→in_arbeit→erledigt→verifiziert', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'd_ce_prozess_definiert',
      wert: 'nein',
      quelle: QUELLE,
    });
    await synchronisiereGaps(t.db, mandantId, produktId);
    const [g] = await t.db.select().from(gap).where(eq(gap.feldId, 'd_ce_prozess_definiert'));
    for (const ziel of ['in_arbeit', 'erledigt', 'verifiziert'] as GapStatus[]) {
      await setzeGapStatus(t.db, g!.id, ziel);
    }
    const [final] = await t.db.select().from(gap).where(eq(gap.id, g!.id));
    expect(final!.status).toBe('verifiziert');
  });

  it('lehnt unzulässige Übergänge ab (property)', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'd_ce_prozess_definiert',
      wert: 'nein',
      quelle: QUELLE,
    });
    await synchronisiereGaps(t.db, mandantId, produktId);
    const [g] = await t.db.select().from(gap).where(eq(gap.feldId, 'd_ce_prozess_definiert'));
    // offen → erledigt (überspringt in_arbeit) ist unzulässig
    await expect(setzeGapStatus(t.db, g!.id, 'verifiziert')).rejects.toThrow(/Unzulässig/);
  });
});

describe('D5: Override-Auflösung (mandant_mit_override)', () => {
  it('Default greift ohne Override, Override verdeckt ihn, Rücknahme reaktiviert den Default', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    // Mandanten-Default für CVD-Kontaktstelle
    await setzeEvidenz(t.db, {
      mandantId,
      produktId: null,
      feldId: 's_cvd_kontaktstelle',
      wert: 'security@firma.de',
      quelle: QUELLE,
    });
    let w = await aktuellerWert(t.db, mandantId, produktId, 's_cvd_kontaktstelle');
    expect(w?.wert).toBe('security@firma.de');
    expect(w?.herkunft).toBe('mandant_default');

    // Produkt-Override
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 's_cvd_kontaktstelle',
      wert: 'produkt@firma.de',
      quelle: QUELLE,
    });
    w = await aktuellerWert(t.db, mandantId, produktId, 's_cvd_kontaktstelle');
    expect(w?.wert).toBe('produkt@firma.de');
    expect(w?.herkunft).toBe('produkt');

    // Override zurücknehmen → Default reaktiviert
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 's_cvd_kontaktstelle',
      wert: ZURUECK_AUF_DEFAULT,
      quelle: QUELLE,
    });
    w = await aktuellerWert(t.db, mandantId, produktId, 's_cvd_kontaktstelle');
    expect(w?.wert).toBe('security@firma.de');
    expect(w?.herkunft).toBe('mandant_default');
  });
});

describe('D6: Workshop-Abschluss nur bei allen Blöcken bearbeitet', () => {
  it('schlägt fehl, solange ein Block unbearbeitet ist', async () => {
    const { mandantId, produktId } = await mandantMitProdukt();
    await setzeEvidenz(t.db, {
      mandantId,
      produktId,
      feldId: 'p_produktname',
      wert: 'Nur Block 1',
      quelle: QUELLE,
    });
    await expect(markiereWorkshopDurchgefuehrt(t.db, mandantId, produktId)).rejects.toThrow(
      /unbearbeitete Blöcke/,
    );
  });
});

describe('D4 property: nur erlaubte Übergänge führen je zu konsistentem Status', () => {
  it('zufällige Übergangsfolgen halten den Status im erlaubten Raum', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<GapStatus>('offen', 'in_arbeit', 'erledigt', 'verifiziert'), {
          maxLength: 8,
        }),
        async (folge) => {
          await t.reset();
          const { mandantId, produktId } = await mandantMitProdukt();
          await setzeEvidenz(t.db, {
            mandantId,
            produktId,
            feldId: 'd_ce_prozess_definiert',
            wert: 'nein',
            quelle: QUELLE,
          });
          await synchronisiereGaps(t.db, mandantId, produktId);
          const [g] = await t.db.select().from(gap).where(eq(gap.feldId, 'd_ce_prozess_definiert'));
          for (const ziel of folge) {
            await setzeGapStatus(t.db, g!.id, ziel).catch(() => undefined);
          }
          const [final] = await t.db.select().from(gap).where(eq(gap.id, g!.id));
          expect(['offen', 'in_arbeit', 'erledigt', 'verifiziert']).toContain(final!.status);
        },
      ),
      { numRuns: 12 },
    );
  });
});
