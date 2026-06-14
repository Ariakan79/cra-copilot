import { feldNach, katalog, type Ebene, type FeldWert } from '@cra-copilot/aufnahme-katalog';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { evidenzKnoten, type Quelle } from '../db/schema';
import { protokolliere } from '../portal/audit';

/** Sentinel-Wert: Override entfernen und auf den Mandanten-Default zurückfallen (D5). */
export const ZURUECK_AUF_DEFAULT = '__zurueck_auf_default__';

/**
 * Normalisiert einen aus JSONB gelesenen Wert auf das Wertmodell des Katalogs
 * (string | string[]): JSONB kann Zahlen/Booleans halten, fachlich sind alle
 * Skalare Text (z. B. `zahl`-Felder wie der Support-Zeitraum).
 */
function normalisiereWert(roh: unknown): FeldWert {
  if (Array.isArray(roh)) return roh.map((e) => String(e));
  if (typeof roh === 'string') return roh;
  return String(roh);
}

export interface NeueEvidenz {
  mandantId: string;
  produktId?: string | null;
  feldId: string;
  wert: FeldWert | typeof ZURUECK_AUF_DEFAULT;
  anmerkung?: string;
  quelle: Quelle;
}

/**
 * Fügt einen Evidenzknoten hinzu. Existiert bereits ein aktueller Knoten für
 * denselben Scope (mandant/produkt/feld), wird er per `ersetztId` superseded —
 * der alte Knoten bleibt unverändert erhalten (ADR-015, append-only).
 */
export async function setzeEvidenz(db: DB, eingabe: NeueEvidenz): Promise<string> {
  const feld = feldNach(katalog, eingabe.feldId);
  if (feld === undefined) throw new ValidierungsFehler(`Unbekanntes Feld: ${eingabe.feldId}`);
  pruefeScope(feld.ebene, eingabe.produktId ?? null);

  const vorhanden = await aktuellerKnotenId(
    db,
    eingabe.mandantId,
    eingabe.produktId ?? null,
    eingabe.feldId,
  );

  const [zeile] = await db
    .insert(evidenzKnoten)
    .values({
      mandantId: eingabe.mandantId,
      produktId: eingabe.produktId ?? null,
      feldId: eingabe.feldId,
      wert: eingabe.wert,
      anmerkung: eingabe.anmerkung ?? null,
      quelle: eingabe.quelle,
      ersetztId: vorhanden ?? null,
    })
    .returning({ id: evidenzKnoten.id });
  await protokolliere(db, 'evidenz_knoten', zeile!.id);
  return zeile!.id;
}

async function aktuellerKnotenId(
  db: DB,
  mandantId: string,
  produktId: string | null,
  feldId: string,
): Promise<string | undefined> {
  // Aktueller Knoten = Knoten ohne Nachfolger (niemand verweist via ersetztId).
  const zeilen = await db
    .select({ id: evidenzKnoten.id })
    .from(evidenzKnoten)
    .where(
      and(
        eq(evidenzKnoten.mandantId, mandantId),
        produktId === null
          ? isNull(evidenzKnoten.produktId)
          : eq(evidenzKnoten.produktId, produktId),
        eq(evidenzKnoten.feldId, feldId),
        sql`not exists (select 1 from ${evidenzKnoten} as nachf where nachf.ersetzt_id = ${evidenzKnoten.id})`,
      ),
    );
  return zeilen[0]?.id;
}

export interface AktuellerWert {
  feldId: string;
  wert: FeldWert;
  herkunft: 'produkt' | 'mandant_default';
  knotenId: string;
}

/**
 * Aktueller Wert eines Feldes im Produktkontext, inkl. Override-Auflösung (D5):
 * - `produkt`-Feld: nur produktspezifischer Knoten
 * - `mandant`-Feld: nur Mandantenknoten
 * - `mandant_mit_override`: produktspezifischer Knoten verdeckt den Default;
 *   ein `ZURUECK_AUF_DEFAULT`-Override reaktiviert den Mandanten-Default.
 */
export async function aktuellerWert(
  db: DB,
  mandantId: string,
  produktId: string,
  feldId: string,
): Promise<AktuellerWert | undefined> {
  const feld = feldNach(katalog, feldId);
  if (feld === undefined) return undefined;

  if (feld.ebene !== 'mandant') {
    const produktKnoten = await ladeAktuellen(db, mandantId, produktId, feldId);
    if (produktKnoten !== undefined && produktKnoten.wert !== ZURUECK_AUF_DEFAULT) {
      return { feldId, wert: produktKnoten.wert, herkunft: 'produkt', knotenId: produktKnoten.id };
    }
    if (feld.ebene === 'produkt') return undefined;
    // mandant_mit_override ohne (gültigen) Override → Default
  }

  const defaultKnoten = await ladeAktuellen(db, mandantId, null, feldId);
  if (defaultKnoten === undefined || defaultKnoten.wert === ZURUECK_AUF_DEFAULT) return undefined;
  return {
    feldId,
    wert: defaultKnoten.wert,
    herkunft: 'mandant_default',
    knotenId: defaultKnoten.id,
  };
}

async function ladeAktuellen(
  db: DB,
  mandantId: string,
  produktId: string | null,
  feldId: string,
): Promise<{ id: string; wert: FeldWert } | undefined> {
  const zeilen = await db
    .select({ id: evidenzKnoten.id, wert: evidenzKnoten.wert })
    .from(evidenzKnoten)
    .where(
      and(
        eq(evidenzKnoten.mandantId, mandantId),
        produktId === null
          ? isNull(evidenzKnoten.produktId)
          : eq(evidenzKnoten.produktId, produktId),
        eq(evidenzKnoten.feldId, feldId),
        sql`not exists (select 1 from ${evidenzKnoten} as nachf where nachf.ersetzt_id = ${evidenzKnoten.id})`,
      ),
    );
  const zeile = zeilen[0];
  return zeile === undefined ? undefined : { id: zeile.id, wert: normalisiereWert(zeile.wert) };
}

/** Alle aktuellen Feldwerte eines Produkts (Produkt-Overrides + Mandanten-Defaults). */
export async function alleAktuellenWerte(
  db: DB,
  mandantId: string,
  produktId: string,
): Promise<Record<string, FeldWert>> {
  const ergebnis: Record<string, FeldWert> = {};
  for (const block of katalog.bloecke) {
    for (const feld of block.felder) {
      const wert = await aktuellerWert(db, mandantId, produktId, feld.id);
      if (wert !== undefined) ergebnis[feld.id] = wert.wert;
    }
  }
  return ergebnis;
}

function pruefeScope(ebene: Ebene, produktId: string | null): void {
  if (ebene === 'mandant' && produktId !== null) {
    throw new ValidierungsFehler('Mandantenfeld darf keine produkt_id tragen.');
  }
  if (ebene === 'produkt' && produktId === null) {
    throw new ValidierungsFehler('Produktfeld erfordert eine produkt_id.');
  }
}

export class ValidierungsFehler extends Error {}
