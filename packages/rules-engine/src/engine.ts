import {
  RolleSchema,
  type Bedingung,
  type Frage,
  type Kategorie,
  type KategorieRegel,
  type LokalText,
  type Pflicht,
  type Referenz,
  type Regel,
  type Regelwerk,
  type Rolle,
  type TerminalRegel,
} from './schema';

/**
 * Reine Engine-Funktionen (ADR-001): kein I/O, kein DOM. Das Regelwerk und die
 * Antworten kommen als Argumente, das Ergebnis ist vollständig aus ihnen bestimmt.
 *
 * Konvention (von pruefeStruktur abgesichert): Das Regelwerk enthält die Fragen
 * `rolle` (Werte = RolleSchema) und `produkttyp` (jede Option von mindestens
 * einer Kategorie-Regel abgedeckt).
 */

/** Einfachauswahl: ein Wert. Mehrfachauswahl: Liste gewählter Werte. */
export type AntwortWert = string | readonly string[];
export type Antworten = Readonly<Record<string, AntwortWert>>;

function alsListe(wert: AntwortWert | undefined): readonly string[] | undefined {
  if (wert === undefined) return undefined;
  return typeof wert === 'string' ? [wert] : wert;
}

export interface RegelRef {
  regel_id: string;
  titel: LokalText;
  begruendung: LokalText;
  referenz: Referenz;
}

export interface Ergebnis {
  geltungsbereich: 'in_scope' | 'ausserhalb' | 'ausgenommen';
  kategorie?: Kategorie;
  sonderregime?: 'os_steward';
  begruendungspfad: RegelRef[];
  pflichten: Pflicht[];
}

export interface Fortschritt {
  beantwortet: number;
  gesamt: number;
}

export type Schritt =
  | { typ: 'frage'; frage: Frage; fortschritt: Fortschritt }
  | { typ: 'ergebnis'; ergebnis: Ergebnis };

const SCHWERE: Record<Kategorie, number> = {
  default: 0,
  wichtig_klasse_1: 1,
  wichtig_klasse_2: 2,
  kritisch: 3,
};

function bedingungErfuellt(bedingung: Bedingung, antworten: Antworten): boolean {
  const werte = alsListe(antworten[bedingung.frage]);
  return werte !== undefined && werte.some((wert) => bedingung.ist_eine_von.includes(wert));
}

export function istSichtbar(frage: Frage, antworten: Antworten): boolean {
  return frage.sichtbar_wenn.every((b) => bedingungErfuellt(b, antworten));
}

function regelTrifft(regel: Regel, antworten: Antworten): boolean {
  return regel.bedingungen.every((b) => bedingungErfuellt(b, antworten));
}

function refVon(regel: TerminalRegel | KategorieRegel): RegelRef {
  return {
    regel_id: regel.id,
    titel: regel.titel,
    begruendung: regel.begruendung,
    referenz: regel.referenz,
  };
}

export function pflichtenFuer(
  regelwerk: Regelwerk,
  rolle: Rolle,
  kategorie?: Kategorie,
): Pflicht[] {
  return regelwerk.pflichten.filter((p) => {
    if (!p.gilt_fuer.rollen.includes(rolle)) return false;
    if (p.gilt_fuer.kategorien === undefined) return true;
    return kategorie !== undefined && p.gilt_fuer.kategorien.includes(kategorie);
  });
}

function ersteTerminalregel(regelwerk: Regelwerk, antworten: Antworten): TerminalRegel | null {
  for (const regel of regelwerk.regeln) {
    if (regel.art === 'terminal' && regelTrifft(regel, antworten)) return regel;
  }
  return null;
}

/**
 * Liefert den nächsten Schritt des Fragenflusses: entweder die nächste offene,
 * sichtbare Frage oder das Ergebnis. Terminal-Regeln (Out-of-Scope, Ausnahme,
 * Sonderregime) beenden den Fluss vorzeitig, sobald ihre Bedingungen beantwortet
 * und erfüllt sind — niemand beantwortet acht Fragen, um zu erfahren, dass der
 * CRA nicht anwendbar ist.
 */
export function naechsterSchritt(regelwerk: Regelwerk, antworten: Antworten): Schritt {
  const terminal = ersteTerminalregel(regelwerk, antworten);
  if (terminal !== null) {
    if (terminal.verdikt === 'sonderregime_os_steward') {
      return {
        typ: 'ergebnis',
        ergebnis: {
          geltungsbereich: 'in_scope',
          sonderregime: 'os_steward',
          begruendungspfad: [refVon(terminal)],
          pflichten: pflichtenFuer(regelwerk, 'os_steward'),
        },
      };
    }
    return {
      typ: 'ergebnis',
      ergebnis: {
        geltungsbereich: terminal.verdikt,
        begruendungspfad: [refVon(terminal)],
        pflichten: [],
      },
    };
  }

  const sichtbare = regelwerk.fragen.filter((f) => istSichtbar(f, antworten));
  const offene = sichtbare.filter((f) => antworten[f.id] === undefined);
  const naechste = offene[0];
  if (naechste !== undefined) {
    return {
      typ: 'frage',
      frage: naechste,
      fortschritt: { beantwortet: sichtbare.length - offene.length, gesamt: sichtbare.length },
    };
  }

  const treffer = regelwerk.regeln.filter(
    (r): r is KategorieRegel => r.art === 'kategorie' && regelTrifft(r, antworten),
  );
  const beste = treffer.reduce(
    (a: KategorieRegel | null, b) =>
      a === null || SCHWERE[b.kategorie] > SCHWERE[a.kategorie] ? b : a,
    null,
  );
  if (beste === null) {
    throw new Error(
      'Keine Kategorie-Regel trifft, obwohl alle Fragen beantwortet sind — Regelwerk unvollständig (siehe pruefeStruktur).',
    );
  }

  // rolle ist per Konvention eine Einfachauswahl, bereinigeAntworten normalisiert auf string.
  const rolle = RolleSchema.parse(antworten['rolle']);
  const pfad = [...treffer].sort((a, b) => SCHWERE[b.kategorie] - SCHWERE[a.kategorie]).map(refVon);

  return {
    typ: 'ergebnis',
    ergebnis: {
      geltungsbereich: 'in_scope',
      kategorie: beste.kategorie,
      begruendungspfad: pfad,
      pflichten: pflichtenFuer(regelwerk, rolle, beste.kategorie),
    },
  };
}

/**
 * Hält das Antwort-Objekt konsistent zum linearen Fragenfluss (ADR-007):
 * Es bleiben genau die Antworten erhalten, die in Katalogreihenfolge sichtbar
 * und gültig sind — bis zur ersten Lücke oder bis eine Terminal-Regel den Fluss
 * beendet. Antworten auf unerreichbar gewordene Folgefragen werden verworfen.
 */
export function bereinigeAntworten(regelwerk: Regelwerk, antworten: Antworten): Antworten {
  const behalten: Record<string, AntwortWert> = {};
  for (const frage of regelwerk.fragen) {
    if (ersteTerminalregel(regelwerk, behalten) !== null) break;
    if (!istSichtbar(frage, behalten)) continue;
    const roh = antworten[frage.id];
    if (roh === undefined) break;
    if (frage.typ === 'einfachauswahl') {
      if (typeof roh !== 'string' || !frage.optionen.some((o) => o.wert === roh)) break;
      behalten[frage.id] = roh;
    } else {
      const gueltige = [
        ...new Set(
          (typeof roh === 'string' ? [roh] : roh).filter((wert) =>
            frage.optionen.some((o) => o.wert === wert),
          ),
        ),
      ];
      if (gueltige.length === 0) break;
      behalten[frage.id] = gueltige;
    }
  }
  return behalten;
}
