import type { Feld, Katalog } from './schema';

/**
 * Strukturelle Integritätsprüfung des Katalogs — läuft bei der Generierung und
 * als Test. Übersetzt die Spec-Grundprinzipien in ausführbare Regeln
 * (TEST_STRATEGY §7.1).
 */
export function pruefeStruktur(katalog: Katalog): string[] {
  const fehler: string[] = [];
  const feldIds = new Set<string>();
  const blockNummern = new Set<number>();

  for (const block of katalog.bloecke) {
    if (blockNummern.has(block.nummer)) fehler.push(`Doppelte Blocknummer: ${block.nummer}`);
    blockNummern.add(block.nummer);

    for (const feld of block.felder) {
      if (feldIds.has(feld.id)) fehler.push(`Doppelte Feld-ID: ${feld.id}`);
      feldIds.add(feld.id);

      // Grundprinzip 3: Jedes Output-Feld hat mindestens einen Konsumenten.
      // (Das erzwingt bereits das zod-min(1); hier zur Sicherheit als Klartext.)
      if (feld.konsumenten.length === 0) {
        fehler.push(`Feld ${feld.id} hat keinen Downstream-Konsumenten — gehört entfernt.`);
      }

      // Auswahlfelder brauchen Optionen, Nicht-Auswahlfelder dürfen keine haben.
      const istAuswahl = feld.typ === 'einfachauswahl' || feld.typ === 'mehrfachauswahl';
      if (istAuswahl && feld.optionen.length < 2) {
        fehler.push(`Auswahlfeld ${feld.id} braucht mindestens zwei Optionen.`);
      }
      if (!istAuswahl && feld.optionen.length > 0) {
        fehler.push(`Feld ${feld.id} (${feld.typ}) darf keine Optionen tragen.`);
      }

      const optionWerte = new Set<string>();
      for (const option of feld.optionen) {
        if (optionWerte.has(option.wert)) {
          fehler.push(`Feld ${feld.id}: doppelter Optionswert ${option.wert}`);
        }
        optionWerte.add(option.wert);
      }

      // Gap-Regel, die an Optionswerte knüpft, muss existierende Werte nennen.
      for (const wert of feld.gap_regel?.bei_werten ?? []) {
        if (istAuswahl && !optionWerte.has(wert)) {
          fehler.push(`Feld ${feld.id}: Gap-Regel nutzt unbekannten Wert ${wert}`);
        }
      }

      // Ebenen-Konsistenz (ADR-017): Block-Ebene und Feld-Ebene müssen zusammenpassen.
      pruefeEbene(block.nummer, block.ebene, feld, fehler);
    }
  }

  return fehler;
}

function pruefeEbene(
  blockNummer: number,
  blockEbene: Katalog['bloecke'][number]['ebene'],
  feld: Feld,
  fehler: string[],
): void {
  // Block 0 (Mandant & Rollen) trägt ausschließlich Mandantenfelder.
  if (blockNummer === 0 && feld.ebene !== 'mandant') {
    fehler.push(`Feld ${feld.id} in Block 0 muss Ebene 'mandant' haben (ist '${feld.ebene}').`);
  }
  // Ein reiner Mandantenblock darf keine produktspezifischen Felder enthalten.
  if (blockEbene === 'mandant' && feld.ebene === 'produkt') {
    fehler.push(
      `Feld ${feld.id}: Ebene 'produkt' in einem Mandantenblock (${blockNummer}) ist widersprüchlich.`,
    );
  }
}

/** Zählt alle Felder mit `review_status: pending` (Gate für katalog-vX.Y-Tags). */
export function offeneReviews(katalog: Katalog): string[] {
  return katalog.bloecke
    .flatMap((block) => block.felder)
    .filter((feld) => feld.review_status === 'pending')
    .map((feld) => feld.id);
}
