import { describe, expect, it } from 'vitest';
import {
  LUECKE_EXISTIERT_NICHT,
  LUECKE_UNBEKANNT,
  alleFelder,
  blockAmpel,
  gapFuerFeld,
  istLueckenWert,
  katalog,
  offeneReviews,
  pruefeStruktur,
  type Feld,
} from '../src/index';

describe('Katalogstruktur', () => {
  it('umfasst die Blöcke 0–8', () => {
    const nummern = katalog.bloecke.map((b) => b.nummer).sort((a, b) => a - b);
    expect(nummern).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('ist strukturell fehlerfrei', () => {
    expect(pruefeStruktur(katalog)).toEqual([]);
  });

  it('jedes Feld hat mindestens einen Downstream-Konsumenten (Grundprinzip 3)', () => {
    for (const feld of alleFelder(katalog)) {
      expect(feld.konsumenten.length, `Feld ${feld.id}`).toBeGreaterThan(0);
    }
  });

  it('Block 0 trägt ausschließlich Mandantenfelder (ADR-017)', () => {
    const block0 = katalog.bloecke.find((b) => b.nummer === 0);
    expect(block0?.felder.every((f) => f.ebene === 'mandant')).toBe(true);
  });

  it('Strukturprüfung schlägt bei einem Feld ohne Konsumenten an', () => {
    const kaputt = structuredClone(katalog);
    (kaputt.bloecke[0]!.felder[0] as Feld).konsumenten = [];
    expect(pruefeStruktur(kaputt).some((f) => f.includes('Downstream-Konsumenten'))).toBe(true);
  });
});

describe('Lücken-Verdikte (Grundprinzip 2)', () => {
  it('unterscheidet unbekannt und existiert-nicht als Lücken', () => {
    expect(istLueckenWert(LUECKE_UNBEKANNT)).toBe(true);
    expect(istLueckenWert(LUECKE_EXISTIERT_NICHT)).toBe(true);
    expect(istLueckenWert(undefined)).toBe(true);
    expect(istLueckenWert([])).toBe(true);
    expect(istLueckenWert('ja')).toBe(false);
    expect(istLueckenWert(['erfuellt'])).toBe(false);
  });
});

describe('Gap-Ableitung', () => {
  const feld = (id: string): Feld => {
    const gefunden = alleFelder(katalog).find((f) => f.id === id);
    if (gefunden === undefined) throw new Error(`Feld ${id} fehlt`);
    return gefunden;
  };

  it('CVD-Policy "nein" erzeugt einen hoch priorisierten Gap', () => {
    const gap = gapFuerFeld(feld('s_cvd_policy_vorhanden'), 'nein');
    expect(gap).not.toBeNull();
    expect(gap?.prioritaet).toBe('hoch');
  });

  it('CVD-Policy "ja" erzeugt keinen Gap', () => {
    expect(gapFuerFeld(feld('s_cvd_policy_vorhanden'), 'ja')).toBeNull();
  });

  it('Anhang-I-Update-Mechanismus "nicht_erfuellt" ist kritisch', () => {
    const gap = gapFuerFeld(feld('r_sf_update_mechanismus'), 'nicht_erfuellt');
    expect(gap?.prioritaet).toBe('kritisch');
  });

  it('Feld mit bei_luecke erzeugt Gap bei unbekannt', () => {
    const gap = gapFuerFeld(feld('sup_eol_kommunikation'), LUECKE_UNBEKANNT);
    expect(gap).not.toBeNull();
  });
});

describe('Blockstatus-Ampel (D3)', () => {
  const block4 = katalog.bloecke.find((b) => b.nummer === 4)!;

  it('ohne Antworten: nicht_bearbeitet', () => {
    expect(blockAmpel(block4, {})).toBe('nicht_bearbeitet');
  });

  it('mit Gap-auslösender Antwort: mit_luecken', () => {
    expect(blockAmpel(block4, { s_cvd_policy_vorhanden: 'nein' })).toBe('mit_luecken');
  });

  it('ist deterministisch (zweimal berechnet identisch)', () => {
    const werte = { s_cvd_policy_vorhanden: 'nein' as const };
    expect(blockAmpel(block4, werte)).toBe(blockAmpel(block4, werte));
  });
});

describe('Review-Status', () => {
  it('alle Katalogfelder sind fachlich freigegeben — Tag-Gate für katalog-v0.1', () => {
    expect(offeneReviews(katalog)).toEqual([]);
  });
});
