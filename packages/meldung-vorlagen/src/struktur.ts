import type { MeldungVorlagen } from './schema';

/** Strukturprüfung: jede Stufe/Art hat genau eine Frist und eine Vorlage. */
export function pruefeStruktur(daten: MeldungVorlagen): string[] {
  const fehler: string[] = [];

  for (const f of daten.fristen) {
    if ((f.stunden === undefined) === (f.tage === undefined)) {
      fehler.push(`Frist ${f.art}/${f.stufe}: genau eines von stunden|tage angeben.`);
    }
  }

  // Erwartete Kombinationen: je Art die drei Stufen genau einmal.
  for (const art of ['schwachstelle', 'vorfall'] as const) {
    for (const stufe of ['fruehwarnung', 'meldung', 'abschluss'] as const) {
      const fristen = daten.fristen.filter((f) => f.art === art && f.stufe === stufe);
      const vorlagen = daten.vorlagen.filter((v) => v.art === art && v.stufe === stufe);
      if (fristen.length !== 1)
        fehler.push(`Frist fehlt/doppelt: ${art}/${stufe} (${fristen.length}).`);
      if (vorlagen.length !== 1)
        fehler.push(`Vorlage fehlt/doppelt: ${art}/${stufe} (${vorlagen.length}).`);
    }
  }

  for (const v of daten.vorlagen) {
    const lokal = new Set<string>();
    for (const feld of v.felder) {
      if (lokal.has(feld.id))
        fehler.push(`Vorlage ${v.art}/${v.stufe}: doppeltes Feld ${feld.id}.`);
      lokal.add(feld.id);
    }
  }

  // Je Meldungsart genau eine Nutzer-Vorlage (Art. 14 Abs. 8).
  for (const art of ['schwachstelle', 'vorfall'] as const) {
    const n = daten.nutzer_vorlagen.filter((v) => v.art === art);
    if (n.length !== 1) fehler.push(`Nutzer-Vorlage fehlt/doppelt: ${art} (${n.length}).`);
  }

  return fehler;
}

export function offeneReviews(daten: MeldungVorlagen): string[] {
  const offen: string[] = [];
  for (const f of daten.fristen)
    if (f.review_status === 'pending') offen.push(`frist:${f.art}/${f.stufe}`);
  for (const v of daten.vorlagen)
    if (v.review_status === 'pending') offen.push(`vorlage:${v.art}/${v.stufe}`);
  for (const v of daten.nutzer_vorlagen)
    if (v.review_status === 'pending') offen.push(`nutzer:${v.art}`);
  return offen;
}
