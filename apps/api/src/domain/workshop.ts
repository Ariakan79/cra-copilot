import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { workshop } from '../db/schema';
import { alleAktuellenWerte, ValidierungsFehler } from './evidenz';
import { blockStatusListe } from './gaps';

/**
 * Workshop-Abschluss (ADR-019, D6): `workshop_durchgefuehrt` ist genau dann
 * setzbar, wenn alle Blöcke bearbeitet sind (Status ≠ nicht_bearbeitet —
 * „mit Lücken" zählt, Spec Grundprinzip 4). `onboarding_abgeschlossen` bleibt
 * dem Portal (Phase 3) vorbehalten.
 */
export async function markiereWorkshopDurchgefuehrt(
  db: DB,
  mandantId: string,
  produktId: string,
): Promise<void> {
  const werte = await alleAktuellenWerte(db, mandantId, produktId);
  const offen = blockStatusListe(werte).filter((b) => b.ampel === 'nicht_bearbeitet');
  if (offen.length > 0) {
    throw new ValidierungsFehler(
      `Workshop nicht abschließbar — unbearbeitete Blöcke: ${offen.map((b) => b.nummer).join(', ')}.`,
    );
  }
  await db
    .insert(workshop)
    .values({ produktId, mandantId, workshopDurchgefuehrtAm: new Date() })
    .onConflictDoUpdate({
      target: workshop.produktId,
      set: { workshopDurchgefuehrtAm: new Date() },
    });
}

export async function workshopStatus(db: DB, produktId: string) {
  const [zeile] = await db.select().from(workshop).where(eq(workshop.produktId, produktId));
  return {
    workshop_durchgefuehrt: zeile?.workshopDurchgefuehrtAm ?? null,
    onboarding_abgeschlossen: zeile?.onboardingAbgeschlossenAm ?? null,
  };
}
