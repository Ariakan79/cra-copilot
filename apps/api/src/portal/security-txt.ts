import type { DB } from '../db/client';
import { mandant, securityTxtPublikation } from '../db/schema';
import { aktuellerMandantWert } from '../domain/evidenz';
import { protokolliere } from './audit';

/**
 * security.txt nach RFC 9116 (Art. 13 Abs. 6, ADR-037): generiert aus der
 * Block-4-Kontaktstelle (`s_cvd_kontaktstelle`) — einzige Quelle, keine
 * Doppelpflege. Der Live-Inhalt ist abgeleitet; eine Publikation wird als
 * verketteter Beleg festgehalten.
 */

const GUELTIGKEIT_TAGE = 365;

function alsContactUri(wert: string): string {
  const k = wert.trim();
  if (/^https?:\/\//i.test(k) || /^mailto:/i.test(k)) return k;
  if (k.includes('@') && !k.includes(' ')) return `mailto:${k}`;
  return k; // Freitext (z. B. „security.txt unter …") unverändert übernehmen
}

export interface SecurityTxt {
  vorhanden: boolean;
  inhalt: string;
}

/** Erzeugt den aktuellen security.txt-Inhalt (abgeleitet, nicht verkettet). */
export async function generiereSecurityTxt(
  db: DB,
  mandantId: string,
  jetzt: Date = new Date(),
): Promise<SecurityTxt> {
  const kontaktRoh = await aktuellerMandantWert(db, mandantId, 's_cvd_kontaktstelle');
  const kontakt = typeof kontaktRoh === 'string' ? kontaktRoh : undefined;
  if (kontakt === undefined || kontakt.trim() === '') {
    return {
      vorhanden: false,
      inhalt:
        '# Keine Meldekontaktstelle erfasst.\n' +
        '# Bitte im Cockpit Block 4 (s_cvd_kontaktstelle) hinterlegen (CRA Art. 13 Abs. 6).\n',
    };
  }
  const expires = new Date(jetzt.getTime() + GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000);
  const inhalt =
    `Contact: ${alsContactUri(kontakt)}\n` +
    `Expires: ${expires.toISOString()}\n` +
    `Preferred-Languages: de, en\n`;
  return { vorhanden: true, inhalt };
}

/** Veröffentlicht den aktuellen Inhalt als unveränderlichen, verketteten Beleg. */
export async function veroeffentlicheSecurityTxt(db: DB, mandantId: string): Promise<SecurityTxt> {
  const sec = await generiereSecurityTxt(db, mandantId);
  const [zeile] = await db
    .insert(securityTxtPublikation)
    .values({ mandantId, inhalt: sec.inhalt })
    .returning({ id: securityTxtPublikation.id });
  await protokolliere(db, 'security_txt_publikation', zeile!.id);
  return sec;
}

/** Self-hosted: liefert den (einzigen) Mandanten für /.well-known/security.txt. */
export async function einzigerMandant(db: DB): Promise<string | undefined> {
  const zeilen = await db.select({ id: mandant.id }).from(mandant).limit(2);
  return zeilen.length === 1 ? zeilen[0]!.id : zeilen[0]?.id;
}
