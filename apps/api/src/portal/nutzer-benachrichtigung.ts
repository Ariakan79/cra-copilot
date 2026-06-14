import { nutzerVorlageFuer, type Meldungsart } from '@cra-copilot/meldung-vorlagen';
import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { meldevorgang, nutzerBenachrichtigung } from '../db/schema';
import { aktuellerWert, ValidierungsFehler } from '../domain/evidenz';
import { protokolliere } from './audit';

/**
 * Nutzerbenachrichtigung (Art. 14 Abs. 8, ADR-037): eigenes Artefakt am
 * Meldevorgang. Entwurf aus der Vorlage; Versand ist unveränderlich + verkettet.
 */

export interface NutzerEntwurf {
  vorgangId: string;
  art: Meldungsart;
  titel: string;
  hinweis: string | null;
  versendet: boolean;
  felder: { id: string; label: string; pflicht: boolean; wert: string }[];
}

export async function nutzerEntwurf(db: DB, vorgangId: string): Promise<NutzerEntwurf> {
  const [v] = await db.select().from(meldevorgang).where(eq(meldevorgang.id, vorgangId));
  if (v === undefined) throw new ValidierungsFehler('Meldevorgang nicht gefunden');
  const vorlage = nutzerVorlageFuer(v.art as Meldungsart);
  if (vorlage === undefined) throw new ValidierungsFehler(`Keine Nutzer-Vorlage für ${v.art}`);
  const [row] = await db
    .select()
    .from(nutzerBenachrichtigung)
    .where(eq(nutzerBenachrichtigung.vorgangId, vorgangId));
  const inhalt = (row?.inhalt ?? {}) as Record<string, string>;

  // Produktbezeichnung aus der Evidenz vorbefüllen (Komfort).
  const produktName = await aktuellerWert(db, v.mandantId, v.produktId, 'p_produktname');
  const produktVorbelegung = typeof produktName?.wert === 'string' ? produktName.wert : '';

  return {
    vorgangId,
    art: v.art as Meldungsart,
    titel: vorlage.titel.de,
    hinweis: vorlage.hinweis?.de ?? null,
    versendet: row?.versendetAm != null,
    felder: vorlage.felder.map((f) => ({
      id: f.id,
      label: f.label.de,
      pflicht: f.pflicht,
      wert: inhalt[f.id] ?? (f.id === 'produkt' ? produktVorbelegung : ''),
    })),
  };
}

/** Versendet (markiert) die Nutzerbenachrichtigung: unveränderlich + verkettet. */
export async function versendeNutzerbenachrichtigung(
  db: DB,
  vorgangId: string,
  daten: { inhalt: Record<string, string>; versendetVon: string },
): Promise<void> {
  const [v] = await db
    .select({ mandantId: meldevorgang.mandantId })
    .from(meldevorgang)
    .where(eq(meldevorgang.id, vorgangId));
  if (v === undefined) throw new ValidierungsFehler('Meldevorgang nicht gefunden');
  const [row] = await db
    .select()
    .from(nutzerBenachrichtigung)
    .where(eq(nutzerBenachrichtigung.vorgangId, vorgangId));
  if (row?.versendetAm != null) throw new ValidierungsFehler('Bereits versendet.');

  const werte = { inhalt: daten.inhalt, versendetAm: new Date(), versendetVon: daten.versendetVon };
  let id: string;
  if (row === undefined) {
    const [neu] = await db
      .insert(nutzerBenachrichtigung)
      .values({ vorgangId, mandantId: v.mandantId, ...werte })
      .returning({ id: nutzerBenachrichtigung.id });
    id = neu!.id;
  } else {
    await db.update(nutzerBenachrichtigung).set(werte).where(eq(nutzerBenachrichtigung.id, row.id));
    id = row.id;
  }
  await protokolliere(db, 'nutzer_benachrichtigung', id);
}

export async function speichereNutzerEntwurf(
  db: DB,
  vorgangId: string,
  inhalt: Record<string, string>,
): Promise<void> {
  const [v] = await db
    .select({ mandantId: meldevorgang.mandantId })
    .from(meldevorgang)
    .where(eq(meldevorgang.id, vorgangId));
  if (v === undefined) throw new ValidierungsFehler('Meldevorgang nicht gefunden');
  const [row] = await db
    .select()
    .from(nutzerBenachrichtigung)
    .where(eq(nutzerBenachrichtigung.vorgangId, vorgangId));
  if (row === undefined) {
    await db.insert(nutzerBenachrichtigung).values({ vorgangId, mandantId: v.mandantId, inhalt });
  } else if (row.versendetAm == null) {
    await db
      .update(nutzerBenachrichtigung)
      .set({ inhalt })
      .where(eq(nutzerBenachrichtigung.id, row.id));
  } else {
    throw new ValidierungsFehler('Bereits versendet — nicht mehr änderbar.');
  }
}
