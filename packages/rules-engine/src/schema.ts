import { z } from 'zod';

/**
 * Schema des Regelwerks (ADR-010). Eine Quelle, drei Nutzungen:
 * Build-Validierung der YAML-Daten, abgeleitete TS-Typen, Laufzeit-Guard.
 */

export const LokalTextSchema = z.object({ de: z.string().min(1) }).catchall(z.string());

export const ReferenzSchema = z.object({
  dokument: z.string().min(1),
  stelle: z.string().min(1),
});

export const ReviewStatusSchema = z.enum(['pending', 'approved']);

export const BedingungSchema = z.object({
  frage: z.string().min(1),
  ist_eine_von: z.array(z.string().min(1)).min(1),
});

export const OptionSchema = z.object({
  wert: z.string().min(1),
  text: LokalTextSchema,
  erlaeuterung: LokalTextSchema.optional(),
});

export const FrageSchema = z.object({
  id: z.string().min(1),
  typ: z.literal('einfachauswahl'),
  text: LokalTextSchema,
  erlaeuterung: LokalTextSchema.optional(),
  optionen: z.array(OptionSchema).min(2),
  sichtbar_wenn: z.array(BedingungSchema).default([]),
});

export const KategorieSchema = z.enum([
  'default',
  'wichtig_klasse_1',
  'wichtig_klasse_2',
  'kritisch',
]);

export const RolleSchema = z.enum(['hersteller', 'importeur', 'haendler', 'os_steward']);

export const TerminalRegelSchema = z.object({
  id: z.string().min(1),
  art: z.literal('terminal'),
  bedingungen: z.array(BedingungSchema).min(1),
  verdikt: z.enum(['ausserhalb', 'ausgenommen', 'sonderregime_os_steward']),
  titel: LokalTextSchema,
  begruendung: LokalTextSchema,
  referenz: ReferenzSchema,
  review_status: ReviewStatusSchema,
});

export const KategorieRegelSchema = z.object({
  id: z.string().min(1),
  art: z.literal('kategorie'),
  bedingungen: z.array(BedingungSchema).min(1),
  kategorie: KategorieSchema,
  titel: LokalTextSchema,
  begruendung: LokalTextSchema,
  referenz: ReferenzSchema,
  review_status: ReviewStatusSchema,
});

export const RegelSchema = z.discriminatedUnion('art', [TerminalRegelSchema, KategorieRegelSchema]);

export const FristSchema = z.enum(['2026-09', '2027-12']);

export const PflichtSchema = z.object({
  id: z.string().min(1),
  titel: LokalTextSchema,
  beschreibung: LokalTextSchema,
  referenz: ReferenzSchema,
  frist: FristSchema,
  gilt_fuer: z.object({
    rollen: z.array(RolleSchema).min(1),
    kategorien: z.array(KategorieSchema).optional(),
  }),
  review_status: ReviewStatusSchema,
});

export const RegelwerkSchema = z.object({
  rules_version: z.string().min(1),
  stand: z.string().min(1),
  fragen: z.array(FrageSchema).min(1),
  regeln: z.array(RegelSchema).min(1),
  pflichten: z.array(PflichtSchema).min(1),
});

export type LokalText = z.infer<typeof LokalTextSchema>;
export type Referenz = z.infer<typeof ReferenzSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type Bedingung = z.infer<typeof BedingungSchema>;
export type Option = z.infer<typeof OptionSchema>;
export type Frage = z.infer<typeof FrageSchema>;
export type Kategorie = z.infer<typeof KategorieSchema>;
export type Rolle = z.infer<typeof RolleSchema>;
export type TerminalRegel = z.infer<typeof TerminalRegelSchema>;
export type KategorieRegel = z.infer<typeof KategorieRegelSchema>;
export type Regel = z.infer<typeof RegelSchema>;
export type Frist = z.infer<typeof FristSchema>;
export type Pflicht = z.infer<typeof PflichtSchema>;
export type Regelwerk = z.infer<typeof RegelwerkSchema>;
