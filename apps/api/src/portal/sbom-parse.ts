/**
 * SBOM-Parser: CycloneDX- und SPDX-JSON → einheitliche Komponentenliste
 * (ADR-024). Bewusst tolerant — Validierung gegen das Profil passiert getrennt
 * (profil.ts), hier wird nur extrahiert.
 */

export interface ParsedKomponente {
  purl: string | null;
  name: string;
  version: string | null;
  lieferant: string | null;
}

export interface ParsedSbom {
  format: 'cyclonedx' | 'spdx' | 'unbekannt';
  formatVersion: string | null;
  ersteller: string | null;
  zeitstempel: string | null;
  komponenten: ParsedKomponente[];
}

export function parseSbom(roh: unknown): ParsedSbom {
  if (typeof roh !== 'object' || roh === null) {
    return {
      format: 'unbekannt',
      formatVersion: null,
      ersteller: null,
      zeitstempel: null,
      komponenten: [],
    };
  }
  const obj = roh as Record<string, unknown>;
  if (obj['bomFormat'] === 'CycloneDX' || Array.isArray(obj['components']))
    return parseCycloneDx(obj);
  if (typeof obj['spdxVersion'] === 'string' || Array.isArray(obj['packages']))
    return parseSpdx(obj);
  return {
    format: 'unbekannt',
    formatVersion: null,
    ersteller: null,
    zeitstempel: null,
    komponenten: [],
  };
}

function parseCycloneDx(obj: Record<string, unknown>): ParsedSbom {
  const metadata = (obj['metadata'] ?? {}) as Record<string, unknown>;
  const komponenten = (Array.isArray(obj['components']) ? obj['components'] : []).map(
    (c): ParsedKomponente => {
      const k = c as Record<string, unknown>;
      const supplier = (k['supplier'] ?? {}) as Record<string, unknown>;
      return {
        purl: typeof k['purl'] === 'string' ? k['purl'] : null,
        name: typeof k['name'] === 'string' ? k['name'] : '',
        version: typeof k['version'] === 'string' ? k['version'] : null,
        lieferant: typeof supplier['name'] === 'string' ? (supplier['name'] as string) : null,
      };
    },
  );
  return {
    format: 'cyclonedx',
    formatVersion: typeof obj['specVersion'] === 'string' ? (obj['specVersion'] as string) : null,
    ersteller: erstellerVonCycloneDx(metadata),
    zeitstempel:
      typeof metadata['timestamp'] === 'string' ? (metadata['timestamp'] as string) : null,
    komponenten: komponenten.filter((k) => k.name !== ''),
  };
}

function erstellerVonCycloneDx(metadata: Record<string, unknown>): string | null {
  const tools = metadata['tools'];
  if (Array.isArray(tools) && tools.length > 0) {
    const t = tools[0] as Record<string, unknown>;
    if (typeof t['name'] === 'string') return t['name'];
  }
  if (tools !== null && typeof tools === 'object') {
    const comps = (tools as Record<string, unknown>)['components'];
    if (Array.isArray(comps) && comps.length > 0) {
      const c = comps[0] as Record<string, unknown>;
      if (typeof c['name'] === 'string') return c['name'];
    }
  }
  return null;
}

function parseSpdx(obj: Record<string, unknown>): ParsedSbom {
  const creationInfo = (obj['creationInfo'] ?? {}) as Record<string, unknown>;
  const creators = Array.isArray(creationInfo['creators']) ? creationInfo['creators'] : [];
  const komponenten = (Array.isArray(obj['packages']) ? obj['packages'] : []).map(
    (p): ParsedKomponente => {
      const pkg = p as Record<string, unknown>;
      const refs = Array.isArray(pkg['externalRefs']) ? pkg['externalRefs'] : [];
      const purlRef = refs.find(
        (r) => (r as Record<string, unknown>)['referenceType'] === 'purl',
      ) as Record<string, unknown> | undefined;
      const supplier = typeof pkg['supplier'] === 'string' ? pkg['supplier'] : null;
      return {
        purl:
          purlRef && typeof purlRef['referenceLocator'] === 'string'
            ? (purlRef['referenceLocator'] as string)
            : null,
        name: typeof pkg['name'] === 'string' ? pkg['name'] : '',
        version: typeof pkg['versionInfo'] === 'string' ? (pkg['versionInfo'] as string) : null,
        lieferant: supplier,
      };
    },
  );
  return {
    format: 'spdx',
    formatVersion: typeof obj['spdxVersion'] === 'string' ? (obj['spdxVersion'] as string) : null,
    ersteller: typeof creators[0] === 'string' ? (creators[0] as string) : null,
    zeitstempel:
      typeof creationInfo['created'] === 'string' ? (creationInfo['created'] as string) : null,
    komponenten: komponenten.filter((k) => k.name !== ''),
  };
}
