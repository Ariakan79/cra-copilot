import { and, desc, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { sbomLieferung, sbomStream } from '../db/schema';

/**
 * Heartbeat (ADR-026/028): überwacht ausschließlich die Lieferdisziplin —
 * trifft das jüngste profilkonforme SBOM je Stream noch das vereinbarte
 * Höchstalter? Sagt nichts über die CVE-Lage (die läuft kontinuierlich, ADR-028).
 */

export type HeartbeatStatus = 'aktuell' | 'ueberfaellig' | 'keine_lieferung';

export interface StreamHeartbeat {
  streamName: string;
  maxAgeTage: number | null;
  letzteLieferung: Date | null;
  alterTage: number | null;
  status: HeartbeatStatus;
}

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

export async function heartbeat(
  db: DB,
  produktId: string,
  jetzt: Date = new Date(),
): Promise<StreamHeartbeat[]> {
  const streams = await db.select().from(sbomStream).where(eq(sbomStream.produktId, produktId));
  const ergebnis: StreamHeartbeat[] = [];

  for (const stream of streams) {
    const maxAge =
      stream.maxAgeHeartbeatTage !== null && stream.maxAgeHeartbeatTage !== ''
        ? Number(stream.maxAgeHeartbeatTage)
        : null;

    const [letzte] = await db
      .select({ eingegangenAm: sbomLieferung.eingegangenAm })
      .from(sbomLieferung)
      .where(
        and(
          eq(sbomLieferung.produktId, produktId),
          eq(sbomLieferung.streamName, stream.name),
          eq(sbomLieferung.profilKonform, true),
        ),
      )
      .orderBy(desc(sbomLieferung.eingegangenAm))
      .limit(1);

    if (letzte === undefined) {
      ergebnis.push({
        streamName: stream.name,
        maxAgeTage: maxAge,
        letzteLieferung: null,
        alterTage: null,
        status: 'keine_lieferung',
      });
      continue;
    }

    const alterTage = Math.floor((jetzt.getTime() - letzte.eingegangenAm.getTime()) / MS_PRO_TAG);
    const status: HeartbeatStatus =
      maxAge === null || alterTage <= maxAge ? 'aktuell' : 'ueberfaellig';
    ergebnis.push({
      streamName: stream.name,
      maxAgeTage: maxAge,
      letzteLieferung: letzte.eingegangenAm,
      alterTage,
      status,
    });
  }

  return ergebnis;
}
