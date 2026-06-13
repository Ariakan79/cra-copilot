import { z } from 'zod';

/**
 * Schema des Aufnahme-Katalogs (ADR-016). Wie beim Regelwerk: eine Quelle,
 * drei Nutzungen — Build-Validierung der YAML-Daten, abgeleitete TS-Typen,
 * Laufzeit-Guard. Die Strukturprüfung (struktur.ts) ergänzt die
 * objektübergreifenden Regeln (Downstream-Pflicht, Ebenen-Konsistenz).
 */

export const LokalTextSchema = z.object({ de: z.string().min(1) }).catchall(z.string());

export const ReferenzSchema = z.object({
  dokument: z.string().min(1),
  stelle: z.string().min(1),
});

export const ReviewStatusSchema = z.enum(['pending', 'approved']);

/**
 * Erfassungsebene (ADR-017): `mandant` = einmal pro Kunde; `produkt` = pro
 * Produkt; `mandant_mit_override` = Mandanten-Default, pro Produkt überschreibbar.
 */
export const EbeneSchema = z.enum(['mandant', 'produkt', 'mandant_mit_override']);

/** Downstream-Dokumente, die ein Feld konsumiert (Spec, Grundprinzip 3). */
export const KonsumentSchema = z.enum([
  'technische_doku_annex_vii',
  'risikobewertung',
  'cvd_policy',
  'konformitaetserklaerung',
  'sbom_profil',
  'support_zeitraum_erklaerung',
  'betroffenheitsmatrix',
  'portal_konfiguration',
]);

/**
 * Feldtypen der Erfassung. `enum_*` tragen Optionen; alle Typen erlauben die
 * Lücken-Verdikte „unbekannt"/„existiert nicht" über `luecke_erlaubt`
 * (Spec, Grundprinzip 2 — getrennte, gültige Antworten).
 */
export const FeldTypSchema = z.enum([
  'einfachauswahl',
  'mehrfachauswahl',
  'text',
  'zahl',
  'datum',
  'ja_nein',
  'evidenz_referenz',
]);

export const OptionSchema = z.object({
  wert: z.string().min(1),
  text: LokalTextSchema,
  erlaeuterung: LokalTextSchema.optional(),
});

export const GapRegelSchema = z.object({
  // Lücke entsteht, wenn der Wert eine dieser Ausprägungen hat (z. B. "nein",
  // "unbekannt", "nicht_erfuellt") — oder generisch bei jeder Lücken-Antwort.
  bei_werten: z.array(z.string().min(1)).default([]),
  bei_luecke: z.boolean().default(true),
  prioritaet: z.enum(['niedrig', 'mittel', 'hoch', 'kritisch']),
  annex_referenz: ReferenzSchema,
  hinweis: LokalTextSchema,
});

export const FeldSchema = z.object({
  id: z.string().min(1),
  typ: FeldTypSchema,
  frage: LokalTextSchema,
  erlaeuterung: LokalTextSchema.optional(),
  ebene: EbeneSchema,
  pflicht: z.boolean().default(true),
  luecke_erlaubt: z.boolean().default(true),
  optionen: z.array(OptionSchema).default([]),
  konsumenten: z.array(KonsumentSchema).min(1),
  annex_referenz: ReferenzSchema.optional(),
  gap_regel: GapRegelSchema.optional(),
  review_status: ReviewStatusSchema,
});

export const BlockSchema = z.object({
  id: z.string().min(1),
  nummer: z.number().int().min(0),
  titel: LokalTextSchema,
  ziel: LokalTextSchema,
  ebene: EbeneSchema,
  felder: z.array(FeldSchema).min(1),
});

export const KatalogSchema = z.object({
  katalog_version: z.string().min(1),
  stand: z.string().min(1),
  bloecke: z.array(BlockSchema).min(1),
});

export type LokalText = z.infer<typeof LokalTextSchema>;
export type Referenz = z.infer<typeof ReferenzSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type Ebene = z.infer<typeof EbeneSchema>;
export type Konsument = z.infer<typeof KonsumentSchema>;
export type FeldTyp = z.infer<typeof FeldTypSchema>;
export type Option = z.infer<typeof OptionSchema>;
export type GapRegel = z.infer<typeof GapRegelSchema>;
export type Feld = z.infer<typeof FeldSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type Katalog = z.infer<typeof KatalogSchema>;
