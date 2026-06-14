import { createHash } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import {
  auditKette,
  evidenzKnoten,
  meldungStufe,
  sbomLieferung,
  securityTxtPublikation,
} from '../db/schema';

/**
 * Hash-Kette (ADR-035): Manipulationsevidenz über die append-only Datensätze.
 * Die App berechnet `payload_hash` aus der kanonischen JSON der unveränderlichen
 * Geschäftsfelder; die Verkettung (seq/vorgaenger/hash) macht der DB-Trigger.
 *
 * Bewusst nicht im Payload: DB-Zeitstempel (Mikro- vs. Millisekunden-Präzision
 * würde die Re-Verifikation brechen). Reihenfolge/Zeit sind über seq + die
 * Unveränderlichkeit der Zeile ohnehin gebunden.
 */

export type Entitaet =
  | 'evidenz_knoten'
  | 'sbom_lieferung'
  | 'meldung_stufe'
  | 'security_txt_publikation';

/** Stabile Schlüsselsortierung → deterministische Serialisierung. */
function kanonisch(wert: unknown): string {
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(',')}]`;
  if (wert !== null && typeof wert === 'object') {
    const eintraege = Object.entries(wert as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${kanonisch(v)}`);
    return `{${eintraege.join(',')}}`;
  }
  return JSON.stringify(wert ?? null);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function payloadHash(payload: unknown): string {
  return sha256(kanonisch(payload));
}

/** Replikat der Trigger-Formel (muss exakt zu 0004_audit_kette.sql passen). */
function kettenHash(
  vorgaenger: string,
  seq: number,
  entity: string,
  entityId: string,
  ph: string,
): string {
  return sha256([vorgaenger, String(seq), entity, entityId, ph].join('|'));
}

interface EntitaetsDef {
  laden: (db: DB, id: string) => Promise<Record<string, unknown> | undefined>;
  payload: (row: Record<string, unknown>) => Record<string, unknown>;
}

// Eine Definition je Entität — am Schreib- und Prüfpfad identisch genutzt,
// damit kein Drift zwischen erzeugtem und verifiziertem Payload entsteht.
const DEFS: Record<Entitaet, EntitaetsDef> = {
  evidenz_knoten: {
    laden: async (db, id) =>
      (await db.select().from(evidenzKnoten).where(eq(evidenzKnoten.id, id)))[0],
    payload: (r) => ({
      feldId: r['feldId'],
      wert: r['wert'],
      anmerkung: r['anmerkung'],
      quelle: r['quelle'],
      ersetztId: r['ersetztId'],
      produktId: r['produktId'],
      mandantId: r['mandantId'],
    }),
  },
  sbom_lieferung: {
    laden: async (db, id) =>
      (await db.select().from(sbomLieferung).where(eq(sbomLieferung.id, id)))[0],
    payload: (r) => ({
      produktId: r['produktId'],
      streamName: r['streamName'],
      format: r['format'],
      formatVersion: r['formatVersion'],
      kanal: r['kanal'],
      trigger: r['trigger'],
      roh: r['roh'],
      profilKonform: r['profilKonform'],
      validierung: r['validierung'],
    }),
  },
  meldung_stufe: {
    laden: async (db, id) =>
      (await db.select().from(meldungStufe).where(eq(meldungStufe.id, id)))[0],
    payload: (r) => ({
      vorgangId: r['vorgangId'],
      stufe: r['stufe'],
      inhalt: r['inhalt'],
      eingereichtVon: r['eingereichtVon'],
      kanal: r['kanal'],
    }),
  },
  security_txt_publikation: {
    laden: async (db, id) =>
      (await db.select().from(securityTxtPublikation).where(eq(securityTxtPublikation.id, id)))[0],
    payload: (r) => ({ mandantId: r['mandantId'], inhalt: r['inhalt'] }),
  },
};

/** Hängt einen Datensatz an die Hash-Kette an (im selben Transaktionspfad wie der Insert). */
export async function protokolliere(db: DB, entity: Entitaet, entityId: string): Promise<void> {
  const row = await DEFS[entity].laden(db, entityId);
  if (row === undefined) throw new Error(`Audit: ${entity} ${entityId} nicht gefunden`);
  // seq/vorgaengerHash/hash sind Platzhalter — der BEFORE-INSERT-Trigger
  // (0004_audit_kette.sql) überschreibt sie atomar.
  await db.insert(auditKette).values({
    seq: 0,
    entity,
    entityId,
    payloadHash: payloadHash(DEFS[entity].payload(row)),
    vorgaengerHash: '',
    hash: '',
  });
}

export interface IntegritaetsErgebnis {
  intakt: boolean;
  geprueft: number;
  kopfHash: string | null;
  bruch?: { seq: number; entity: string; entityId: string; grund: string };
}

/**
 * Prüft die Kette (ADR-035): (1) Verkettung neu berechnen, (2) jeden
 * Geschäftsdatensatz neu hashen und mit dem gespeicherten payload_hash
 * vergleichen. Erkennt Umsortierung/Löschung und nachträgliche Zeilenänderung.
 */
export async function pruefeIntegritaet(db: DB): Promise<IntegritaetsErgebnis> {
  const eintraege = await db.select().from(auditKette).orderBy(asc(auditKette.seq));
  let vorgaenger = '';
  let geprueft = 0;

  for (const e of eintraege) {
    const erwartet = kettenHash(vorgaenger, e.seq, e.entity, e.entityId, e.payloadHash);
    if (e.vorgaengerHash !== vorgaenger || e.hash !== erwartet) {
      return {
        intakt: false,
        geprueft,
        kopfHash: vorgaenger === '' ? null : vorgaenger,
        bruch: {
          seq: e.seq,
          entity: e.entity,
          entityId: e.entityId,
          grund: 'Verkettung gebrochen',
        },
      };
    }
    const def = DEFS[e.entity as Entitaet];
    if (def !== undefined) {
      const row = await def.laden(db, e.entityId);
      if (row === undefined) {
        return {
          intakt: false,
          geprueft,
          kopfHash: vorgaenger === '' ? null : vorgaenger,
          bruch: { seq: e.seq, entity: e.entity, entityId: e.entityId, grund: 'Datensatz fehlt' },
        };
      }
      if (payloadHash(def.payload(row)) !== e.payloadHash) {
        return {
          intakt: false,
          geprueft,
          kopfHash: vorgaenger === '' ? null : vorgaenger,
          bruch: { seq: e.seq, entity: e.entity, entityId: e.entityId, grund: 'Inhalt geändert' },
        };
      }
    }
    vorgaenger = e.hash;
    geprueft += 1;
  }

  return { intakt: true, geprueft, kopfHash: vorgaenger === '' ? null : vorgaenger };
}
