import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Drizzle-Schema (ADR-013). Alle Tabellen tragen `mandant_id` (ADR-014: schon
 * lokal mandantengetrennt, damit der spätere Serverbetrieb keine Migration
 * erzwingt). Evidenzknoten sind append-only mit Supersession (ADR-015); die
 * Unveränderlichkeit (D2) sichert ein Trigger in der ersten Migration.
 */

export const mandant = pgTable('mandant', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
});

export const produkt = pgTable(
  'produkt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    name: text('name').notNull(),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('produkt_mandant_idx').on(t.mandantId)],
);

/** Quelle eines Evidenzknotens (Spec, Grundprinzip 1). */
export interface Quelle {
  art: 'kundenaussage_aufnahmegespraech' | 'dokument' | 'zertifikat' | 'systempruefung';
  person: string;
  datum: string;
  gespraechsleiter: string;
}

/**
 * Evidenzknoten: das zentrale Datenobjekt. Niemals ändern oder löschen —
 * eine Korrektur erzeugt einen neuen Knoten mit `ersetzt_id` auf den alten.
 * Aktueller Stand = Knoten ohne Nachfolger. `produkt_id` NULL = Mandantenebene.
 */
export const evidenzKnoten = pgTable(
  'evidenz_knoten',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    produktId: uuid('produkt_id').references(() => produkt.id),
    feldId: text('feld_id').notNull(),
    // Wert strukturiert (string | string[] | Lücken-Sentinel), gegen das
    // Feldschema des Katalogs validiert (in der Domänenschicht).
    wert: jsonb('wert').notNull(),
    anmerkung: text('anmerkung'),
    quelle: jsonb('quelle').$type<Quelle>().notNull(),
    ersetztId: uuid('ersetzt_id'),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('evidenz_scope_idx').on(t.mandantId, t.produktId, t.feldId),
    // Eine Supersession-Kette ist linear: kein Knoten wird zweimal ersetzt (D1).
    uniqueIndex('evidenz_ersetzt_unique')
      .on(t.ersetztId)
      .where(sql`${t.ersetztId} is not null`),
  ],
);

export const GAP_STATI = ['offen', 'in_arbeit', 'erledigt', 'verifiziert'] as const;
export type GapStatus = (typeof GAP_STATI)[number];

/**
 * Gap-Lebenszyklus (ADR-019). Existenz eines Gaps ist aus Evidenz + Katalog
 * ableitbar; die *Bearbeitung* (Status, Verantwortlicher, Frist) ist
 * gespeicherter Zustand. Schlüssel: (mandant, produkt, feld).
 */
export const gap = pgTable(
  'gap',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    produktId: uuid('produkt_id').references(() => produkt.id),
    feldId: text('feld_id').notNull(),
    prioritaet: text('prioritaet').notNull(),
    status: text('status').$type<GapStatus>().notNull().default('offen'),
    verantwortlich: text('verantwortlich'),
    frist: text('frist'),
    erzeugtAm: timestamp('erzeugt_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('gap_scope_unique').on(t.mandantId, t.produktId, t.feldId)],
);

/**
 * SBOM-Stream (ADR-018): pro Produkt mehrere Erzeugungspfade (Firmware, Cloud,
 * Companion-App). Pflichtfelder werden aus dem Konformitätsziel abgeleitet,
 * nicht hier gespeichert.
 */
export const sbomStream = pgTable(
  'sbom_stream',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    produktId: uuid('produkt_id')
      .notNull()
      .references(() => produkt.id),
    name: text('name').notNull(),
    format: text('format').notNull(),
    tool: text('tool').notNull(),
    ciJob: text('ci_job'),
    kanal: text('kanal').notNull(),
    maxAgeHeartbeatTage: text('max_age_heartbeat_tage'),
  },
  (t) => [index('sbom_stream_produkt_idx').on(t.produktId)],
);

/**
 * Workshop-Abschluss (ADR-019): zwei getrennte Stati. Phase 2 kann nur
 * `workshop_durchgefuehrt` setzen; `onboarding_abgeschlossen` setzt das Portal
 * (ADR-021: bei erster profilkonformer Lieferung — als Ereignis, kein Phone-home).
 */
export const workshop = pgTable('workshop', {
  produktId: uuid('produkt_id')
    .primaryKey()
    .references(() => produkt.id),
  mandantId: uuid('mandant_id')
    .notNull()
    .references(() => mandant.id),
  workshopDurchgefuehrtAm: timestamp('workshop_durchgefuehrt_am', { withTimezone: true }),
  onboardingAbgeschlossenAm: timestamp('onboarding_abgeschlossen_am', { withTimezone: true }),
});

// ===================================================================== Portal

/** UI-Anmeldung des Kundenteams (ADR-025): self-hosted, ein Mandant pro Instanz. */
export const portalUser = pgTable('portal_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  mandantId: uuid('mandant_id')
    .notNull()
    .references(() => mandant.id),
  benutzername: text('benutzername').notNull().unique(),
  passwortHash: text('passwort_hash').notNull(),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
});

/** Ingestion-Token je Produkt für die CI (ADR-025): nur als Hash gespeichert. */
export const ingestionToken = pgTable(
  'ingestion_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    produktId: uuid('produkt_id')
      .notNull()
      .references(() => produkt.id),
    tokenHash: text('token_hash').notNull(),
    bezeichnung: text('bezeichnung'),
    erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
    widerrufenAm: timestamp('widerrufen_am', { withTimezone: true }),
  },
  (t) => [index('ingestion_token_hash_idx').on(t.tokenHash)],
);

/**
 * SBOM-Lieferung (ADR-024): append-only je Eingang. Roh-SBOM bleibt erhalten,
 * die Lieferhistorie ist Compliance-Nachweis (Trigger erzwingt Unveränderlichkeit).
 */
export const sbomLieferung = pgTable(
  'sbom_lieferung',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    produktId: uuid('produkt_id')
      .notNull()
      .references(() => produkt.id),
    streamName: text('stream_name').notNull(),
    format: text('format').notNull(),
    formatVersion: text('format_version'),
    kanal: text('kanal').notNull(),
    trigger: text('trigger'),
    roh: jsonb('roh').notNull(),
    profilKonform: boolean('profil_konform').notNull(),
    validierung: jsonb('validierung').$type<{ fehler: string[] }>(),
    eingegangenAm: timestamp('eingegangen_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sbom_lieferung_scope_idx').on(t.produktId, t.streamName)],
);

/**
 * Komponenten aus der jüngsten profilkonformen Lieferung je Stream (ADR-024).
 * Wird bei neuer Lieferung ersetzt (SBOM-Erneuerung ist ereignisgetrieben, ADR-028).
 */
export const komponente = pgTable(
  'komponente',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    produktId: uuid('produkt_id')
      .notNull()
      .references(() => produkt.id),
    streamName: text('stream_name').notNull(),
    lieferungId: uuid('lieferung_id')
      .notNull()
      .references(() => sbomLieferung.id),
    purl: text('purl'),
    name: text('name').notNull(),
    version: text('version'),
    lieferant: text('lieferant'),
  },
  (t) => [index('komponente_scope_idx').on(t.produktId, t.streamName)],
);

/**
 * Lokaler OSV-Spiegel (ADR-022): periodisch aus den öffentlichen OSV-Exporten
 * gefüllt; das Matching läuft offline gegen diese Tabelle (keine Komponenten-
 * liste verlässt das System). Denormalisiert: eine Zeile je betroffenem
 * Paket-Versionsbereich.
 */
export const osvAdvisory = pgTable(
  'osv_advisory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    osvId: text('osv_id').notNull(),
    ecosystem: text('ecosystem').notNull(),
    paket: text('paket').notNull(),
    eingefuehrt: text('eingefuehrt').notNull().default('0'),
    behoben: text('behoben'),
    schweregrad: text('schweregrad'),
    zusammenfassung: text('zusammenfassung'),
    zurueckgezogen: boolean('zurueckgezogen').notNull().default(false),
  },
  (t) => [index('osv_paket_idx').on(t.ecosystem, t.paket)],
);

export const MELDE_ARTEN = ['schwachstelle', 'vorfall'] as const;
export const MELDE_STATI = ['offen', 'gemeldet', 'abgeschlossen', 'eingestellt'] as const;
export const MELDE_STUFEN = ['fruehwarnung', 'meldung', 'abschluss'] as const;
export type MeldeArt = (typeof MELDE_ARTEN)[number];
export type MeldeStatus = (typeof MELDE_STATI)[number];
export type MeldeStufe = (typeof MELDE_STUFEN)[number];

/**
 * Meldevorgang (ADR-031): aus einem als aktiv-ausgenutzt eingestuften Finding
 * oder als freie Vorfallmeldung. Die Eröffnung ist die menschliche
 * Meldeentscheidung (ADR-034), `begruendung` + `eroeffnet_von` halten den Urheber.
 */
export const meldevorgang = pgTable(
  'meldevorgang',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    produktId: uuid('produkt_id')
      .notNull()
      .references(() => produkt.id),
    art: text('art').$type<MeldeArt>().notNull(),
    quelleFindingId: uuid('quelle_finding_id').references(() => finding.id),
    titel: text('titel').notNull(),
    status: text('status').$type<MeldeStatus>().notNull().default('offen'),
    begruendung: text('begruendung'),
    korrekturmassnahmeAb: timestamp('korrekturmassnahme_ab', { withTimezone: true }),
    eroeffnetVon: text('eroeffnet_von').notNull(),
    eroeffnetAm: timestamp('eroeffnet_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('meldevorgang_produkt_idx').on(t.produktId)],
);

/**
 * Meldestufe (ADR-031): bis zu drei je Vorgang. Ab gesetzter `eingereicht_am`
 * unveränderlich (Trigger) — der Nachweis, was wann gemeldet wurde, ist beweisfest.
 */
export const meldungStufe = pgTable(
  'meldung_stufe',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vorgangId: uuid('vorgang_id')
      .notNull()
      .references(() => meldevorgang.id),
    stufe: text('stufe').$type<MeldeStufe>().notNull(),
    inhalt: jsonb('inhalt').$type<Record<string, string>>(),
    eingereichtAm: timestamp('eingereicht_am', { withTimezone: true }),
    eingereichtVon: text('eingereicht_von'),
    kanal: text('kanal'),
  },
  (t) => [uniqueIndex('meldung_stufe_unique').on(t.vorgangId, t.stufe)],
);

export const FINDING_STATI = [
  'neu',
  'in_pruefung',
  'bestaetigt',
  'nicht_relevant',
  'behoben',
] as const;
export type FindingStatus = (typeof FINDING_STATI)[number];

/**
 * Finding (ADR-027): Treffer aus dem OSV-Abgleich gegen die aktuellen
 * Komponenten. Kontinuierlich neu bewertet (ADR-028); Triage trägt einen
 * menschlichen Urheber (kein LLM-Urteil, Spec-Nicht-Ziel).
 */
export const finding = pgTable(
  'finding',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandantId: uuid('mandant_id')
      .notNull()
      .references(() => mandant.id),
    produktId: uuid('produkt_id')
      .notNull()
      .references(() => produkt.id),
    komponentePurl: text('komponente_purl'),
    komponenteName: text('komponente_name'),
    schwachstelleId: text('schwachstelle_id').notNull(),
    schweregrad: text('schweregrad'),
    quelle: text('quelle').notNull().default('osv'),
    triageStatus: text('triage_status').$type<FindingStatus>().notNull().default('neu'),
    exploitabilityHinweis: text('exploitability_hinweis'),
    behobenDurchDaten: boolean('behoben_durch_daten').notNull().default(false),
    ersteSichtung: timestamp('erste_sichtung', { withTimezone: true }).notNull().defaultNow(),
    letzteSichtung: timestamp('letzte_sichtung', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('finding_scope_unique').on(t.produktId, t.schwachstelleId, t.komponentePurl)],
);
