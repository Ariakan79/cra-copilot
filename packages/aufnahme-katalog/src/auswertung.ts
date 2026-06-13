import type { Block, Feld, GapRegel, Katalog, Referenz } from './schema';

/**
 * Reine Auswertungslogik des Katalogs (kein I/O). Die API hält die
 * Evidenzknoten und reicht hier den jeweils aktuellen Feldwert herein; die
 * Lücken- und Ampel-Bewertung selbst ist katalogbestimmt und deterministisch.
 */

/** Getrennte Lücken-Verdikte (Spec, Grundprinzip 2). */
export const LUECKE_UNBEKANNT = '__unbekannt__';
export const LUECKE_EXISTIERT_NICHT = '__existiert_nicht__';

export type FeldWert = string | readonly string[];

export function istLueckenWert(wert: FeldWert | undefined): boolean {
  if (wert === undefined) return true;
  const liste = typeof wert === 'string' ? [wert] : wert;
  return (
    liste.length === 0 || liste.every((w) => w === LUECKE_UNBEKANNT || w === LUECKE_EXISTIERT_NICHT)
  );
}

export interface GapBefund {
  feld_id: string;
  prioritaet: GapRegel['prioritaet'];
  annex_referenz: Referenz;
  hinweis: GapRegel['hinweis'];
}

/**
 * Liefert einen Gap-Befund, wenn der aktuelle Wert die Gap-Regel des Feldes
 * auslöst — sonst null. Ohne Gap-Regel erzeugt nur ein fehlender Wert eines
 * Pflichtfeldes (über `blockAmpel`) eine „mit Lücken"-Ampel, aber keinen
 * benannten Gap-Eintrag.
 */
export function gapFuerFeld(feld: Feld, wert: FeldWert | undefined): GapBefund | null {
  const regel = feld.gap_regel;
  if (regel === undefined) return null;

  const liste = wert === undefined ? [] : typeof wert === 'string' ? [wert] : wert;
  const trefferWert =
    regel.bei_werten.length > 0 && liste.some((w) => regel.bei_werten.includes(w));
  const trefferLuecke = regel.bei_luecke && istLueckenWert(wert);

  if (!trefferWert && !trefferLuecke) return null;
  return {
    feld_id: feld.id,
    prioritaet: regel.prioritaet,
    annex_referenz: regel.annex_referenz,
    hinweis: regel.hinweis,
  };
}

export type Ampel = 'vollstaendig' | 'mit_luecken' | 'nicht_bearbeitet';

/**
 * Blockstatus-Ampel als reine Funktion aus den aktuellen Feldwerten (ADR-019,
 * Invariante D3): nicht_bearbeitet, solange kein Pflichtfeld beantwortet ist;
 * vollstaendig nur, wenn alle Pflichtfelder ohne Lücke beantwortet sind und
 * keine Gap-Regel greift; sonst mit_luecken.
 */
export function blockAmpel(block: Block, werte: Readonly<Record<string, FeldWert>>): Ampel {
  const pflichtfelder = block.felder.filter((f) => f.pflicht);
  const beantwortet = (feld: Feld): boolean => werte[feld.id] !== undefined;

  if (!block.felder.some(beantwortet)) return 'nicht_bearbeitet';

  const alleVollstaendig = pflichtfelder.every((feld) => {
    const wert = werte[feld.id];
    if (wert === undefined || istLueckenWert(wert)) return false;
    return gapFuerFeld(feld, wert) === null;
  });
  return alleVollstaendig ? 'vollstaendig' : 'mit_luecken';
}

export function alleFelder(katalog: Katalog): Feld[] {
  return katalog.bloecke.flatMap((block) => block.felder);
}

export function feldNach(katalog: Katalog, feldId: string): Feld | undefined {
  return alleFelder(katalog).find((feld) => feld.id === feldId);
}
