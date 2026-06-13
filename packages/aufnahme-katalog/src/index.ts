import katalogJson from './katalog.gen.json' with { type: 'json' };
import { KatalogSchema, type Katalog } from './schema';

/**
 * Der gebündelte Aufnahme-Katalog, beim Import einmalig gegen das Schema geprüft
 * (Laufzeit-Guard, ADR-016). Die Auswertungsfunktionen nehmen den Katalog als
 * Argument — Konsumenten können auch andere Stände laden.
 */
export const katalog: Katalog = KatalogSchema.parse(katalogJson);

export * from './schema';
export * from './auswertung';
export { pruefeStruktur, offeneReviews } from './struktur';
