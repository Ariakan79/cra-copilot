import { RolleSchema, type Bedingung, type Frage, type Regelwerk } from './schema';

/**
 * Strukturelle Integritätsprüfung des Regelwerks — läuft bei der Daten-Generierung
 * (scripts/gen-data.ts) und als Test. Ergänzt das zod-Schema um Prüfungen, die
 * über einzelne Objekte hinausgehen (Referenzen, Abdeckung, Konventionen).
 */
export function pruefeStruktur(regelwerk: Regelwerk): string[] {
  const fehler: string[] = [];
  const fragenNachId = new Map<string, { frage: Frage; index: number }>();

  regelwerk.fragen.forEach((frage, index) => {
    if (fragenNachId.has(frage.id)) fehler.push(`Doppelte Frage-ID: ${frage.id}`);
    fragenNachId.set(frage.id, { frage, index });
    const werte = new Set<string>();
    for (const option of frage.optionen) {
      if (werte.has(option.wert))
        fehler.push(`Frage ${frage.id}: doppelter Optionswert ${option.wert}`);
      werte.add(option.wert);
    }
  });

  const pruefeBedingung = (bedingung: Bedingung, kontext: string, maxIndex?: number): void => {
    const ziel = fragenNachId.get(bedingung.frage);
    if (ziel === undefined) {
      fehler.push(`${kontext}: Bedingung verweist auf unbekannte Frage ${bedingung.frage}`);
      return;
    }
    if (maxIndex !== undefined && ziel.index >= maxIndex) {
      fehler.push(
        `${kontext}: Sichtbarkeitsbedingung verweist auf ${bedingung.frage}, die nicht früher im Katalog steht (Fluss wäre zyklisch)`,
      );
    }
    for (const wert of bedingung.ist_eine_von) {
      if (!ziel.frage.optionen.some((o) => o.wert === wert)) {
        fehler.push(
          `${kontext}: Bedingung nutzt Wert ${wert}, den Frage ${bedingung.frage} nicht anbietet`,
        );
      }
    }
  };

  regelwerk.fragen.forEach((frage, index) => {
    for (const bedingung of frage.sichtbar_wenn) {
      pruefeBedingung(bedingung, `Frage ${frage.id}`, index);
    }
  });

  const regelIds = new Set<string>();
  for (const regel of regelwerk.regeln) {
    if (regelIds.has(regel.id)) fehler.push(`Doppelte Regel-ID: ${regel.id}`);
    regelIds.add(regel.id);
    for (const bedingung of regel.bedingungen) {
      pruefeBedingung(bedingung, `Regel ${regel.id}`);
    }
  }

  const pflichtIds = new Set<string>();
  for (const pflicht of regelwerk.pflichten) {
    if (pflichtIds.has(pflicht.id)) fehler.push(`Doppelte Pflicht-ID: ${pflicht.id}`);
    pflichtIds.add(pflicht.id);
  }

  // Konvention: Frage `rolle` existiert, ihre Werte sind gültige Rollen.
  const rolle = fragenNachId.get('rolle');
  if (rolle === undefined) {
    fehler.push('Konvention verletzt: Frage `rolle` fehlt');
  } else {
    for (const option of rolle.frage.optionen) {
      if (!RolleSchema.safeParse(option.wert).success) {
        fehler.push(`Frage rolle: Wert ${option.wert} ist keine bekannte Rolle`);
      }
    }
  }

  // Konvention: Jede produkttyp-Option ist von mindestens einer Kategorie-Regel
  // abgedeckt — sonst kann die Klassifizierung ins Leere laufen (Totalität).
  const produkttyp = fragenNachId.get('produkttyp');
  if (produkttyp === undefined) {
    fehler.push('Konvention verletzt: Frage `produkttyp` fehlt');
  } else {
    for (const option of produkttyp.frage.optionen) {
      const abgedeckt = regelwerk.regeln.some(
        (r) =>
          r.art === 'kategorie' &&
          r.bedingungen.some(
            (b) => b.frage === 'produkttyp' && b.ist_eine_von.includes(option.wert),
          ),
      );
      if (!abgedeckt) {
        fehler.push(`produkttyp-Option ${option.wert} wird von keiner Kategorie-Regel abgedeckt`);
      }
    }
  }

  return fehler;
}

/** Zählt alle Einträge mit `review_status: pending` (Gate für rules-v0.x-Tags). */
export function offeneReviews(regelwerk: Regelwerk): string[] {
  return [...regelwerk.regeln, ...regelwerk.pflichten]
    .filter((eintrag) => eintrag.review_status === 'pending')
    .map((eintrag) => eintrag.id);
}
