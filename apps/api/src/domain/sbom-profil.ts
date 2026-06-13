import { eq } from 'drizzle-orm';
import yaml from 'js-yaml';
import type { DB } from '../db/client';
import { sbomStream } from '../db/schema';
import { aktuellerWert } from './evidenz';

/**
 * Pflichtfelder je Konformitätsziel als versionierte Stammdaten (ADR-018):
 * abgeleitet, nicht im Profil redundant gelistet. Quelle bleibt fachlich zu
 * bestätigen (entspricht dem review_status-Vorbehalt des Katalogs).
 */
const PFLICHTFELDER: Record<string, string[]> = {
  bsi_tr_03183_2: [
    'lieferant',
    'name',
    'version',
    'eindeutige_id',
    'abhaengigkeitsbeziehung',
    'ersteller',
    'zeitstempel',
  ],
  ntia_minimum: [
    'lieferant',
    'name',
    'version',
    'eindeutige_id',
    'abhaengigkeitsbeziehung',
    'ersteller',
    'zeitstempel',
  ],
  eigen: [],
};

export interface SbomProfilExport {
  produkt_id: string;
  konformitaetsziel: string | null;
  mindesttiefe: string | null;
  pflichtfelder: string[];
  streams: {
    name: string;
    format: string;
    tool: string;
    ci_job: string | null;
    kanal: string;
    max_age_heartbeat_tage: string | null;
  }[];
}

/**
 * Baut das SBOM-Profil eines Produkts (ADR-018): mehrere Streams, Pflichtfelder
 * aus dem im Block 7 erfassten Konformitätsziel abgeleitet.
 */
export async function baueSbomProfil(
  db: DB,
  mandantId: string,
  produktId: string,
): Promise<SbomProfilExport> {
  const ziel = await aktuellerWert(db, mandantId, produktId, 'sb_konformitaetsziel');
  const tiefe = await aktuellerWert(db, mandantId, produktId, 'sb_mindesttiefe');
  const zielWert = typeof ziel?.wert === 'string' ? ziel.wert : null;

  const streams = await db.select().from(sbomStream).where(eq(sbomStream.produktId, produktId));

  return {
    produkt_id: produktId,
    konformitaetsziel: zielWert,
    mindesttiefe: typeof tiefe?.wert === 'string' ? tiefe.wert : null,
    pflichtfelder: zielWert !== null ? (PFLICHTFELDER[zielWert] ?? []) : [],
    streams: streams.map((s) => ({
      name: s.name,
      format: s.format,
      tool: s.tool,
      ci_job: s.ciJob,
      kanal: s.kanal,
      max_age_heartbeat_tage: s.maxAgeHeartbeatTage,
    })),
  };
}

export function sbomProfilAlsYaml(profil: SbomProfilExport): string {
  return yaml.dump(profil, { lineWidth: 100, noRefs: true });
}
