import vorlagenJson from './vorlagen.gen.json' with { type: 'json' };
import {
  MeldungVorlagenSchema,
  type Frist,
  type MeldungVorlagen,
  type Stufe,
  type Meldungsart,
  type NutzerVorlage,
  type Vorlage,
} from './schema';

/** Gebündelte Meldung-Vorlagen, beim Import gegen das Schema geprüft (ADR-033). */
export const meldungVorlagen: MeldungVorlagen = MeldungVorlagenSchema.parse(vorlagenJson);

export function fristFuer(art: Meldungsart, stufe: Stufe): Frist | undefined {
  return meldungVorlagen.fristen.find((f) => f.art === art && f.stufe === stufe);
}

export function vorlageFuer(art: Meldungsart, stufe: Stufe): Vorlage | undefined {
  return meldungVorlagen.vorlagen.find((v) => v.art === art && v.stufe === stufe);
}

export function nutzerVorlageFuer(art: Meldungsart): NutzerVorlage | undefined {
  return meldungVorlagen.nutzer_vorlagen.find((v) => v.art === art);
}

export * from './schema';
export { pruefeStruktur, offeneReviews } from './struktur';
