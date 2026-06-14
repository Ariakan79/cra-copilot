import { z } from 'zod';

/**
 * Schema der Meldung-Vorlagen (ADR-033): Fristwerte und Feldvorlagen je Stufe
 * und Meldungstyp als versionierte Daten. Wie Regelwerk/Katalog: eine Quelle,
 * drei Nutzungen (Build-Validierung, TS-Typen, Laufzeit-Guard).
 */

export const LokalTextSchema = z.object({ de: z.string().min(1) }).catchall(z.string());
export const ReferenzSchema = z.object({ dokument: z.string().min(1), stelle: z.string().min(1) });
export const ReviewStatusSchema = z.enum(['pending', 'approved']);

export const MeldungsartSchema = z.enum(['schwachstelle', 'vorfall']);
export const StufeSchema = z.enum(['fruehwarnung', 'meldung', 'abschluss']);

/** Bezugspunkt, von dem die Frist einer Stufe zählt. */
export const FristBezugSchema = z.enum([
  'eroeffnet_am',
  'korrekturmassnahme_ab',
  'meldung_eingereicht_am',
]);

export const FristSchema = z.object({
  stufe: StufeSchema,
  art: MeldungsartSchema,
  bezug: FristBezugSchema,
  // Frist in Stunden (24/72) oder Tagen — genau eines.
  stunden: z.number().int().positive().optional(),
  tage: z.number().int().positive().optional(),
  referenz: ReferenzSchema,
  review_status: ReviewStatusSchema,
});

export const FeldSchema = z.object({
  id: z.string().min(1),
  label: LokalTextSchema,
  pflicht: z.boolean().default(true),
});

export const VorlageSchema = z.object({
  stufe: StufeSchema,
  art: MeldungsartSchema,
  titel: LokalTextSchema,
  hinweis: LokalTextSchema.optional(),
  felder: z.array(FeldSchema).min(1),
  referenz: ReferenzSchema,
  review_status: ReviewStatusSchema,
});

/** Vorlage für die Nutzerbenachrichtigung (Art. 14 Abs. 8) — je Meldungsart, ohne Stufe. */
export const NutzerVorlageSchema = z.object({
  art: MeldungsartSchema,
  titel: LokalTextSchema,
  hinweis: LokalTextSchema.optional(),
  felder: z.array(FeldSchema).min(1),
  referenz: ReferenzSchema,
  review_status: ReviewStatusSchema,
});

export const MeldungVorlagenSchema = z.object({
  meldung_version: z.string().min(1),
  stand: z.string().min(1),
  empfaenger: LokalTextSchema,
  fristen: z.array(FristSchema).min(1),
  vorlagen: z.array(VorlageSchema).min(1),
  nutzer_vorlagen: z.array(NutzerVorlageSchema).min(1),
});

export type LokalText = z.infer<typeof LokalTextSchema>;
export type Referenz = z.infer<typeof ReferenzSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type Meldungsart = z.infer<typeof MeldungsartSchema>;
export type Stufe = z.infer<typeof StufeSchema>;
export type FristBezug = z.infer<typeof FristBezugSchema>;
export type Frist = z.infer<typeof FristSchema>;
export type Feld = z.infer<typeof FeldSchema>;
export type Vorlage = z.infer<typeof VorlageSchema>;
export type NutzerVorlage = z.infer<typeof NutzerVorlageSchema>;
export type MeldungVorlagen = z.infer<typeof MeldungVorlagenSchema>;
