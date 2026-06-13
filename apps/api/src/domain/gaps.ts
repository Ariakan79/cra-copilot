import {
  blockAmpel,
  gapFuerFeld,
  katalog,
  type Ampel,
  type FeldWert,
} from '@cra-copilot/aufnahme-katalog';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import type { DB } from '../db/client';
import { GAP_STATI, gap, type GapStatus } from '../db/schema';
import { alleAktuellenWerte, ValidierungsFehler } from './evidenz';

/** Erlaubte Statusübergänge des Gap-Lebenszyklus (D4). */
const UEBERGAENGE: Record<GapStatus, GapStatus[]> = {
  offen: ['in_arbeit'],
  in_arbeit: ['erledigt', 'offen'],
  erledigt: ['verifiziert', 'in_arbeit'],
  verifiziert: [],
};

/**
 * Synchronisiert die Gap-Tabelle eines Produkts gegen den aktuellen Evidenzstand:
 * für jedes Feld, dessen Wert die Gap-Regel auslöst, wird ein Gap angelegt
 * (falls noch nicht vorhanden). Bestehende Gaps und ihr Lebenszyklus bleiben
 * erhalten — die Existenz ist abgeleitet, die Bearbeitung ist Zustand.
 */
export async function synchronisiereGaps(
  db: DB,
  mandantId: string,
  produktId: string,
): Promise<void> {
  const werte = await alleAktuellenWerte(db, mandantId, produktId);
  const ausloesend: string[] = [];
  for (const block of katalog.bloecke) {
    for (const feld of block.felder) {
      const befund = gapFuerFeld(feld, werte[feld.id]);
      if (befund === null) continue;
      ausloesend.push(feld.id);
      await db
        .insert(gap)
        .values({ mandantId, produktId, feldId: feld.id, prioritaet: befund.prioritaet })
        .onConflictDoNothing({ target: [gap.mandantId, gap.produktId, gap.feldId] });
    }
  }

  // Datenkorrektur: noch unbearbeitete (status 'offen') Gaps, die nicht mehr
  // auslösen, sind durch die neue Evidenz erledigt und verschwinden. Bereits
  // bearbeitete Gaps (in_arbeit/erledigt/verifiziert) bleiben zur Nachvollzieh-
  // barkeit erhalten (Existenz abgeleitet, Bearbeitung ist Zustand — ADR-019).
  const offenWeg = and(
    eq(gap.produktId, produktId),
    eq(gap.status, 'offen'),
    ausloesend.length > 0 ? notInArray(gap.feldId, ausloesend) : undefined,
  );
  await db.delete(gap).where(offenWeg);
}

export async function setzeGapStatus(db: DB, gapId: string, neu: GapStatus): Promise<void> {
  if (!GAP_STATI.includes(neu)) throw new ValidierungsFehler(`Unbekannter Gap-Status: ${neu}`);
  const [vorhanden] = await db.select().from(gap).where(eq(gap.id, gapId));
  if (vorhanden === undefined) throw new ValidierungsFehler(`Gap ${gapId} nicht gefunden`);
  if (!UEBERGAENGE[vorhanden.status].includes(neu)) {
    throw new ValidierungsFehler(`Unzulässiger Übergang ${vorhanden.status} → ${neu} (D4).`);
  }
  await db.update(gap).set({ status: neu }).where(eq(gap.id, gapId));
}

export async function aktualisiereGapMeta(
  db: DB,
  gapId: string,
  meta: { verantwortlich?: string; frist?: string },
): Promise<void> {
  await db.update(gap).set(meta).where(eq(gap.id, gapId));
}

export interface BlockStatus {
  blockId: string;
  nummer: number;
  ampel: Ampel;
}

/** Blockstatus-Ampeln als abgeleiteter Zustand (D3) — nichts wird gespeichert. */
export function blockStatusListe(werte: Readonly<Record<string, FeldWert>>): BlockStatus[] {
  return katalog.bloecke.map((block) => ({
    blockId: block.id,
    nummer: block.nummer,
    ampel: blockAmpel(block, werte),
  }));
}

export async function gapsFuerProdukt(db: DB, mandantId: string, produktId: string) {
  return db
    .select()
    .from(gap)
    .where(and(eq(gap.mandantId, mandantId), eq(gap.produktId, produktId)));
}

export async function mandantGaps(db: DB, mandantId: string) {
  return db
    .select()
    .from(gap)
    .where(and(eq(gap.mandantId, mandantId), isNull(gap.produktId)));
}
