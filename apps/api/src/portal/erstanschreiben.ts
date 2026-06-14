import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { behoerdenAnschreiben, mandant } from '../db/schema';
import { ValidierungsFehler } from '../domain/evidenz';
import { protokolliere, pruefeIntegritaet } from './audit';
import { eskalationskontakte } from './meldung';

/**
 * Freiwilliges BSI-Erstanschreiben „Meldebereitschaft" (ADR-036). Signalisiert
 * die Art-14-Reaktionsfähigkeit und verankert den aktuellen Ketten-Kopf-Hash;
 * die behördliche Eingangsbestätigung ist der eigentliche externe Anker.
 *
 * Hinweis: freiwillig, KEINE CRA-Pflicht.
 */

export interface ErstanschreibenEntwurf {
  mandantName: string;
  kontakte: Record<string, string>;
  kopfHash: string | null;
  ketteIntakt: boolean;
  ketteGeprueft: number;
  text: string;
}

async function baueText(
  db: DB,
  mandantId: string,
  produktId: string | undefined,
): Promise<ErstanschreibenEntwurf> {
  const [m] = await db.select().from(mandant).where(eq(mandant.id, mandantId));
  if (m === undefined) throw new ValidierungsFehler('Mandant unbekannt');
  const integritaet = await pruefeIntegritaet(db);
  const kontakte =
    produktId !== undefined ? await eskalationskontakte(db, mandantId, produktId) : {};

  const text =
    `Betreff: Meldebereitschaft nach Art. 14 CRA (freiwillige Mitteilung)\n\n` +
    `Sehr geehrte Damen und Herren,\n\n` +
    `als Hersteller (${m.name}) zeigen wir hiermit unsere Bereitschaft und ` +
    `Reaktionsfähigkeit zur Meldung aktiv ausgenutzter Schwachstellen und ` +
    `schwerwiegender Vorfälle nach Art. 14 CRA an.\n\n` +
    `Meldekontakt(e):\n` +
    (Object.keys(kontakte).length > 0
      ? Object.entries(kontakte)
          .map(([k, v]) => `  - ${k}: ${v}`)
          .join('\n')
      : '  - (im Cockpit Block 4 zu hinterlegen)') +
    `\n\n` +
    `Zur Nachweisführung verwenden wir eine manipulationsevidente Hash-Kette ` +
    `über unsere compliance-relevanten Datensätze. Der aktuelle Kopf-Hash ` +
    `(SHA-256) lautet:\n  ${integritaet.kopfHash ?? '(noch keine Kette)'}\n\n` +
    `Wir bitten um Eingangsbestätigung zur Aufnahme in Ihre Unterlagen.\n`;

  return {
    mandantName: m.name,
    kontakte,
    kopfHash: integritaet.kopfHash,
    ketteIntakt: integritaet.intakt,
    ketteGeprueft: integritaet.geprueft,
    text,
  };
}

export async function erstanschreibenEntwurf(
  db: DB,
  mandantId: string,
  produktId?: string,
): Promise<ErstanschreibenEntwurf> {
  return baueText(db, mandantId, produktId);
}

/** Markiert das Erstanschreiben als versendet: unveränderlich + verkettet. */
export async function versendeErstanschreiben(
  db: DB,
  mandantId: string,
  versendetVon: string,
  produktId?: string,
): Promise<{ id: string; kopfHash: string | null }> {
  const entwurf = await baueText(db, mandantId, produktId);
  const [zeile] = await db
    .insert(behoerdenAnschreiben)
    .values({
      mandantId,
      art: 'meldebereitschaft',
      inhalt: { text: entwurf.text, kontakte: JSON.stringify(entwurf.kontakte) },
      kopfHash: entwurf.kopfHash,
      versendetAm: new Date(),
      versendetVon,
    })
    .returning({ id: behoerdenAnschreiben.id });
  await protokolliere(db, 'behoerden_anschreiben', zeile!.id);
  return { id: zeile!.id, kopfHash: entwurf.kopfHash };
}

/** Trägt die behördliche Eingangsbestätigung nach (genau einmal erlaubt, Trigger). */
export async function erfasseEingangsbestaetigung(
  db: DB,
  anschreibenId: string,
  aktenzeichen: string,
): Promise<void> {
  await db
    .update(behoerdenAnschreiben)
    .set({ eingangsbestaetigung: aktenzeichen, bestaetigtAm: new Date() })
    .where(eq(behoerdenAnschreiben.id, anschreibenId));
}
