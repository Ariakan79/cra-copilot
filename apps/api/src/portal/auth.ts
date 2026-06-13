import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { DB } from '../db/client';
import { ingestionToken } from '../db/schema';

/**
 * Auth für den self-hosted Betrieb (ADR-025). Kein native-Argon2 (keine
 * Build-Abhängigkeit) — Passwörter mit scrypt (memory-hard, in node:crypto),
 * Ingestion-Tokens nur als SHA-256-Hash gespeichert.
 */

export function hashPasswort(passwort: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(passwort, salt, 64);
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`;
}

export function pruefePasswort(passwort: string, gespeichert: string): boolean {
  const teile = gespeichert.split('$');
  if (teile.length !== 3 || teile[0] !== 'scrypt') return false;
  const dk = scryptSync(passwort, Buffer.from(teile[1]!, 'hex'), 64);
  const erwartet = Buffer.from(teile[2]!, 'hex');
  return dk.length === erwartet.length && timingSafeEqual(dk, erwartet);
}

export function tokenHash(klartext: string): string {
  return createHash('sha256').update(klartext).digest('hex');
}

/** Erzeugt ein Ingestion-Token; Klartext wird nur einmalig zurückgegeben. */
export function neuesToken(): { klartext: string; hash: string } {
  const klartext = randomBytes(24).toString('base64url');
  return { klartext, hash: tokenHash(klartext) };
}

/** Liefert das Produkt, für das ein (gültiges, nicht widerrufenes) Token gilt. */
export async function produktFuerToken(db: DB, klartext: string): Promise<string | undefined> {
  const hash = tokenHash(klartext);
  const [zeile] = await db
    .select({ produktId: ingestionToken.produktId })
    .from(ingestionToken)
    .where(and(eq(ingestionToken.tokenHash, hash), isNull(ingestionToken.widerrufenAm)));
  return zeile?.produktId;
}
