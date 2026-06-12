import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bereinigeAntworten,
  naechsterSchritt,
  pruefeStruktur,
  regelwerk,
  type Ergebnis,
} from '../src/index';

/**
 * Property-based Tests der Invarianten P1–P6 (TEST_STRATEGY §2).
 * Antwortmengen entstehen flusskonform: Der Wizard beantwortet immer die Frage,
 * die die Engine stellt — genau wie die UI (ADR-007).
 */

const maxSchritte = regelwerk.fragen.length + 1;

function durchlauf(picks: readonly number[]): {
  antworten: Record<string, string>;
  ergebnis: Ergebnis;
} {
  const antworten: Record<string, string> = {};
  for (let schritte = 0; ; schritte++) {
    // P1: Terminierung — nie mehr Schritte als Fragen im Katalog.
    expect(schritte).toBeLessThanOrEqual(maxSchritte);
    const schritt = naechsterSchritt(regelwerk, antworten);
    if (schritt.typ === 'ergebnis') return { antworten, ergebnis: schritt.ergebnis };
    const pick = picks[schritte % picks.length] ?? 0;
    const option = schritt.frage.optionen[pick % schritt.frage.optionen.length];
    if (option === undefined) throw new Error('unerreichbar: Frage ohne Optionen');
    antworten[schritt.frage.id] = option.wert;
  }
}

const picksArb = fc.array(fc.nat({ max: 32 }), { minLength: 1, maxLength: 16 });

describe('Invarianten der Regel-Engine', () => {
  it('P1+P2: jeder Durchlauf terminiert ohne Fehler in einem Ergebnis', () => {
    fc.assert(
      fc.property(picksArb, (picks) => {
        const { ergebnis } = durchlauf(picks);
        expect(['in_scope', 'ausserhalb', 'ausgenommen']).toContain(ergebnis.geltungsbereich);
      }),
    );
  });

  it('P2: auch jede flusskonforme Teil-Antwortmenge liefert Frage oder Ergebnis', () => {
    fc.assert(
      fc.property(picksArb, (picks) => {
        const { antworten } = durchlauf(picks);
        for (const id of Object.keys(antworten)) {
          const teilmenge = { ...antworten };
          delete teilmenge[id];
          const schritt = naechsterSchritt(regelwerk, bereinigeAntworten(regelwerk, teilmenge));
          expect(['frage', 'ergebnis']).toContain(schritt.typ);
        }
      }),
    );
  });

  it('P3: jedes Ergebnis hat einen nicht-leeren Begründungspfad mit existierenden Regel-IDs', () => {
    const regelIds = new Set(regelwerk.regeln.map((r) => r.id));
    fc.assert(
      fc.property(picksArb, (picks) => {
        const { ergebnis } = durchlauf(picks);
        expect(ergebnis.begruendungspfad.length).toBeGreaterThan(0);
        for (const ref of ergebnis.begruendungspfad) {
          expect(regelIds.has(ref.regel_id)).toBe(true);
        }
      }),
    );
  });

  it('P4: jede Frage ist erreichbar und alle Ergebnistypen kommen vor (vollständige Pfad-Enumeration)', () => {
    const gesehen = new Set<string>();
    const ergebnisarten = new Set<string>();
    let pfade = 0;
    const stapel: Record<string, string>[] = [{}];
    while (stapel.length > 0) {
      const antworten = stapel.pop();
      if (antworten === undefined) break;
      const schritt = naechsterSchritt(regelwerk, antworten);
      if (schritt.typ === 'ergebnis') {
        pfade++;
        expect(pfade).toBeLessThan(100_000);
        const e = schritt.ergebnis;
        ergebnisarten.add(e.sonderregime ?? e.kategorie ?? e.geltungsbereich);
        continue;
      }
      gesehen.add(schritt.frage.id);
      for (const option of schritt.frage.optionen) {
        stapel.push({ ...antworten, [schritt.frage.id]: option.wert });
      }
    }
    expect([...gesehen].sort()).toEqual(regelwerk.fragen.map((f) => f.id).sort());
    for (const art of [
      'default',
      'wichtig_klasse_1',
      'wichtig_klasse_2',
      'kritisch',
      'ausserhalb',
      'ausgenommen',
      'os_steward',
    ]) {
      expect(ergebnisarten, `Ergebnistyp ${art} unerreichbar`).toContain(art);
    }
  });

  it('P5: Determinismus — gleiche Antworten ergeben identische Ergebnisse, bereinigen ist stabil', () => {
    fc.assert(
      fc.property(picksArb, (picks) => {
        const erster = durchlauf(picks);
        const zweiter = durchlauf(picks);
        expect(zweiter.ergebnis).toEqual(erster.ergebnis);
        // Flusskonforme Antworten überstehen die Bereinigung unverändert …
        expect(bereinigeAntworten(regelwerk, erster.antworten)).toEqual(erster.antworten);
        // … und Entfernen + identisches Wiedereinsetzen ändert nichts (Zurück-Navigation).
        for (const id of Object.keys(erster.antworten)) {
          const kopie = { ...erster.antworten };
          const wert = kopie[id];
          delete kopie[id];
          if (wert !== undefined) kopie[id] = wert;
          expect(naechsterSchritt(regelwerk, kopie)).toEqual(
            naechsterSchritt(regelwerk, erster.antworten),
          );
        }
      }),
    );
  });

  it('P6: in_scope-Ergebnisse haben nie leere Pflichten; jede Pflicht trägt Referenz und Frist', () => {
    fc.assert(
      fc.property(picksArb, (picks) => {
        const { ergebnis } = durchlauf(picks);
        if (ergebnis.geltungsbereich !== 'in_scope') return;
        expect(ergebnis.pflichten.length).toBeGreaterThan(0);
        for (const pflicht of ergebnis.pflichten) {
          expect(pflicht.referenz.dokument.length).toBeGreaterThan(0);
          expect(pflicht.referenz.stelle.length).toBeGreaterThan(0);
          expect(['2026-09', '2027-12']).toContain(pflicht.frist);
        }
      }),
    );
  });
});

describe('Strukturprüfung des Regelwerks', () => {
  it('das gebündelte Regelwerk ist strukturell fehlerfrei', () => {
    expect(pruefeStruktur(regelwerk)).toEqual([]);
  });
});
