import { and, eq, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { komponente, produkt, sbomLieferung, workshop } from '../db/schema';
import { ValidierungsFehler } from '../domain/evidenz';
import { pruefeGegenProfil } from './profil';
import { parseSbom } from './sbom-parse';

export interface LieferungEingabe {
  produktId: string;
  streamName: string;
  kanal: 'api_token' | 'manueller_upload';
  trigger?: string;
  roh: unknown;
}

export interface LieferungErgebnis {
  lieferungId: string;
  profilKonform: boolean;
  fehler: string[];
  komponentenAnzahl: number;
}

/**
 * Optionaler Re-Matching-Hook: wird nach einer profilkonformen Lieferung
 * aufgerufen (ADR-028: Komponenten geändert → Neubewertung). Das eigentliche
 * OSV-Matching liefert das findings-Modul (Phase-3-Paket 2); hier nur der Hook,
 * damit die Ingestion entkoppelt testbar bleibt.
 */
export type RematchHook = (db: DB, mandantId: string, produktId: string) => Promise<void>;

export async function ingest(
  db: DB,
  eingabe: LieferungEingabe,
  rematch?: RematchHook,
): Promise<LieferungErgebnis> {
  const [p] = await db
    .select({ mandantId: produkt.mandantId })
    .from(produkt)
    .where(eq(produkt.id, eingabe.produktId));
  if (p === undefined) throw new ValidierungsFehler('Produkt unbekannt');
  const mandantId = p.mandantId;

  const sbom = parseSbom(eingabe.roh);
  const pruefung = await pruefeGegenProfil(db, mandantId, eingabe.produktId, sbom);

  // Lieferung immer speichern (append-only) — auch nicht-konforme als Nachweis.
  const [lieferung] = await db
    .insert(sbomLieferung)
    .values({
      mandantId,
      produktId: eingabe.produktId,
      streamName: eingabe.streamName,
      format: sbom.format,
      formatVersion: sbom.formatVersion,
      kanal: eingabe.kanal,
      trigger: eingabe.trigger ?? null,
      roh: eingabe.roh,
      profilKonform: pruefung.konform,
      validierung: { fehler: pruefung.fehler },
    })
    .returning({ id: sbomLieferung.id });
  const lieferungId = lieferung!.id;

  if (!pruefung.konform) {
    // Nicht-konforme Lieferung ändert die Komponenten nicht (I2).
    return { lieferungId, profilKonform: false, fehler: pruefung.fehler, komponentenAnzahl: 0 };
  }

  // Komponenten dieses Streams durch die neue Lieferung ersetzen (ADR-024/028).
  await db
    .delete(komponente)
    .where(
      and(
        eq(komponente.produktId, eingabe.produktId),
        eq(komponente.streamName, eingabe.streamName),
      ),
    );
  if (sbom.komponenten.length > 0) {
    await db.insert(komponente).values(
      sbom.komponenten.map((k) => ({
        mandantId,
        produktId: eingabe.produktId,
        streamName: eingabe.streamName,
        lieferungId,
        purl: k.purl,
        name: k.name,
        version: k.version,
        lieferant: k.lieferant,
      })),
    );
  }

  // Onboarding-Ereignis bei erster profilkonformer Lieferung (ADR-021).
  await db
    .insert(workshop)
    .values({ produktId: eingabe.produktId, mandantId, onboardingAbgeschlossenAm: new Date() })
    .onConflictDoUpdate({
      target: workshop.produktId,
      set: { onboardingAbgeschlossenAm: new Date() },
      setWhere: sql`${workshop.onboardingAbgeschlossenAm} is null`,
    });

  if (rematch !== undefined) await rematch(db, mandantId, eingabe.produktId);

  return {
    lieferungId,
    profilKonform: true,
    fehler: [],
    komponentenAnzahl: sbom.komponenten.length,
  };
}
