import { describe, expect, it } from 'vitest';
import {
  fristFuer,
  meldungVorlagen,
  offeneReviews,
  pruefeStruktur,
  vorlageFuer,
} from '../src/index';

describe('Meldung-Vorlagen', () => {
  it('ist strukturell fehlerfrei', () => {
    expect(pruefeStruktur(meldungVorlagen)).toEqual([]);
  });

  it('Art-14-Fristen: 24h Frühwarnung, 72h Meldung, 14 Tage Abschluss (Schwachstelle)', () => {
    expect(fristFuer('schwachstelle', 'fruehwarnung')?.stunden).toBe(24);
    expect(fristFuer('schwachstelle', 'meldung')?.stunden).toBe(72);
    expect(fristFuer('schwachstelle', 'abschluss')?.tage).toBe(14);
  });

  it('Vorfall-Abschluss: 1 Monat (30 Tage) ab Vorfallmeldung', () => {
    const f = fristFuer('vorfall', 'abschluss');
    expect(f?.tage).toBe(30);
    expect(f?.bezug).toBe('meldung_eingereicht_am');
  });

  it('jede Stufe/Art hat eine Vorlage mit Pflichtfeldern', () => {
    for (const art of ['schwachstelle', 'vorfall'] as const) {
      for (const stufe of ['fruehwarnung', 'meldung', 'abschluss'] as const) {
        const v = vorlageFuer(art, stufe);
        expect(v, `${art}/${stufe}`).toBeDefined();
        expect(v!.felder.some((f) => f.pflicht)).toBe(true);
      }
    }
  });

  it('alle Einträge sind noch ungereviewt (pending) — Tag-Gate', () => {
    expect(offeneReviews(meldungVorlagen).length).toBe(
      meldungVorlagen.fristen.length +
        meldungVorlagen.vorlagen.length +
        meldungVorlagen.nutzer_vorlagen.length,
    );
  });
});
