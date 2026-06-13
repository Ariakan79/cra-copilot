import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { osvAdvisory } from '../db/schema';

/**
 * Lokaler OSV-Spiegel & Matching (ADR-022): Das Matching läuft offline gegen die
 * gespiegelten Advisories — die Komponentenliste verlässt das System nicht.
 *
 * Vereinfachung (dokumentiert): Versionsvergleich ist numerisch-gepunktet
 * (semver-nah). Echte ökosystemspezifische Versionssemantik (epochs, prereleases)
 * wäre eine spätere Verfeinerung; für das Matching gegen OSV-Ranges genügt es.
 */

export interface PurlTeile {
  ecosystem: string;
  paket: string;
  version: string;
}

const PURL_ZU_OSV: Record<string, string> = {
  npm: 'npm',
  pypi: 'PyPI',
  maven: 'Maven',
  cargo: 'crates.io',
  golang: 'Go',
  gem: 'RubyGems',
  nuget: 'NuGet',
  composer: 'Packagist',
  generic: 'Generic',
};

/**
 * Zerlegt eine purl in Ökosystem/Paket/Version. Berücksichtigt den Namespace:
 * `pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1` → Paket
 * `org.apache.logging.log4j:log4j-core` (OSV-Schreibweise mit Doppelpunkt);
 * `pkg:npm/%40scope/name@1.0.0` → `@scope/name`.
 */
export function purlZerlegen(purl: string | null): PurlTeile | null {
  if (purl === null || !purl.startsWith('pkg:')) return null;
  const ohnePrefix = purl.slice('pkg:'.length);
  const at = ohnePrefix.lastIndexOf('@');
  if (at < 0) return null;
  const version = decodeURIComponent(ohnePrefix.slice(at + 1).split('?')[0]!);
  const segmente = ohnePrefix
    .slice(0, at)
    .split('/')
    .map((s) => decodeURIComponent(s));
  if (segmente.length < 2) return null;
  const typ = segmente[0]!;
  const name = segmente[segmente.length - 1]!;
  const namespace = segmente.slice(1, -1).join('/');
  // Maven trennt groupId:artifactId mit Doppelpunkt; sonst namespace/name.
  const paket =
    namespace === '' ? name : typ === 'maven' ? `${namespace}:${name}` : `${namespace}/${name}`;
  return { ecosystem: PURL_ZU_OSV[typ] ?? typ, paket, version };
}

/** Numerisch-gepunkteter Vergleich (1.2.10 > 1.2.9); nicht-numerische Teile lexikografisch. */
export function versionVergleich(a: string, b: string): number {
  const ta = a.split(/[.+-]/);
  const tb = b.split(/[.+-]/);
  const n = Math.max(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const sa = ta[i] ?? '0';
    const sb = tb[i] ?? '0';
    const na = Number(sa);
    const nb = Number(sb);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na < nb ? -1 : 1;
    } else if (sa !== sb) {
      return sa < sb ? -1 : 1;
    }
  }
  return 0;
}

/** Version betroffen, wenn eingefuehrt <= version < behoben (behoben null = offen). */
export function istBetroffen(
  version: string,
  eingefuehrt: string,
  behoben: string | null,
): boolean {
  if (versionVergleich(version, eingefuehrt) < 0) return false;
  if (behoben !== null && versionVergleich(version, behoben) >= 0) return false;
  return true;
}

export interface OsvEingang {
  osvId: string;
  ecosystem: string;
  paket: string;
  eingefuehrt?: string;
  behoben?: string | null;
  schweregrad?: string | null;
  zusammenfassung?: string | null;
  zurueckgezogen?: boolean;
}

/**
 * Spiegelt eine Menge OSV-Advisories ein (ersetzt den Bestand vollständig —
 * der Sync liefert immer den aktuellen Gesamtstand je Lauf). Der eigentliche
 * Download der OSV-Exporte ist separat (osv-sync-Skript, nicht in Tests/CI).
 */
export async function spiegleOsv(db: DB, eingaenge: OsvEingang[]): Promise<void> {
  await db.delete(osvAdvisory);
  if (eingaenge.length === 0) return;
  await db.insert(osvAdvisory).values(
    eingaenge.map((e) => ({
      osvId: e.osvId,
      ecosystem: e.ecosystem,
      paket: e.paket,
      eingefuehrt: e.eingefuehrt ?? '0',
      behoben: e.behoben ?? null,
      schweregrad: e.schweregrad ?? null,
      zusammenfassung: e.zusammenfassung ?? null,
      zurueckgezogen: e.zurueckgezogen ?? false,
    })),
  );
}

export interface OsvTreffer {
  osvId: string;
  schweregrad: string | null;
  zusammenfassung: string | null;
}

/** Findet betroffene Advisories für eine konkrete Komponente (offline). */
export async function findeAdvisories(db: DB, purl: string | null): Promise<OsvTreffer[]> {
  const teile = purlZerlegen(purl);
  if (teile === null) return [];
  const kandidaten = await db
    .select()
    .from(osvAdvisory)
    .where(and(eq(osvAdvisory.ecosystem, teile.ecosystem), eq(osvAdvisory.paket, teile.paket)));
  return kandidaten
    .filter((a) => !a.zurueckgezogen && istBetroffen(teile.version, a.eingefuehrt, a.behoben))
    .map((a) => ({
      osvId: a.osvId,
      schweregrad: a.schweregrad,
      zusammenfassung: a.zusammenfassung,
    }));
}
