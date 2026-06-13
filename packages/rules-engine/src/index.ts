import regelwerkJson from './regelwerk.gen.json' with { type: 'json' };
import { RegelwerkSchema, type Regelwerk } from './schema';

/**
 * Das gebündelte Regelwerk, beim Import einmalig gegen das Schema geprüft
 * (Laufzeit-Guard, ADR-010). Die Engine-Funktionen nehmen das Regelwerk
 * weiterhin als Argument — Konsumenten können auch andere Stände laden.
 */
export const regelwerk: Regelwerk = RegelwerkSchema.parse(regelwerkJson);

export * from './schema';
export * from './engine';
export { pruefeStruktur, offeneReviews } from './struktur';
