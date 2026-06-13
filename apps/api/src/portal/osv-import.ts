import type { OsvEingang } from './osv-spiegel';

/**
 * Transformiert einen OSV-Datensatz (osv.dev-Schema) in unsere denormalisierten
 * Spiegel-Zeilen (eine je betroffenem Paket-Versionsbereich). Reiner, testbarer
 * Transform — der Download der OSV-Exporte ist operatorgetrieben (osv-sync.ts).
 */
export function osvJsonZuEingaengen(osv: unknown): OsvEingang[] {
  if (typeof osv !== 'object' || osv === null) return [];
  const rec = osv as Record<string, unknown>;
  const osvId = typeof rec['id'] === 'string' ? rec['id'] : null;
  if (osvId === null) return [];
  const zurueckgezogen = typeof rec['withdrawn'] === 'string';
  const zusammenfassung = typeof rec['summary'] === 'string' ? rec['summary'] : null;
  const schweregrad = schwereVon(rec['severity']);

  const eingaenge: OsvEingang[] = [];
  const affected = Array.isArray(rec['affected']) ? rec['affected'] : [];
  for (const a of affected) {
    const af = a as Record<string, unknown>;
    const paket = (af['package'] ?? {}) as Record<string, unknown>;
    const ecosystem = typeof paket['ecosystem'] === 'string' ? paket['ecosystem'] : null;
    const name = typeof paket['name'] === 'string' ? paket['name'] : null;
    if (ecosystem === null || name === null) continue;
    // Ökosystem kann Suffixe tragen (z. B. "Debian:12") — Basis verwenden.
    const eco = ecosystem.split(':')[0]!;

    const ranges = Array.isArray(af['ranges']) ? af['ranges'] : [];
    let hatRange = false;
    for (const r of ranges) {
      const range = r as Record<string, unknown>;
      const events = Array.isArray(range['events']) ? range['events'] : [];
      let eingefuehrt = '0';
      for (const e of events) {
        const ev = e as Record<string, unknown>;
        if (typeof ev['introduced'] === 'string') eingefuehrt = ev['introduced'];
        if (typeof ev['fixed'] === 'string') {
          eingaenge.push({
            osvId,
            ecosystem: eco,
            paket: name,
            eingefuehrt,
            behoben: ev['fixed'],
            schweregrad,
            zusammenfassung,
            zurueckgezogen,
          });
          hatRange = true;
        }
      }
      // Bereich ohne "fixed" (offen bis unbestimmt).
      const hatFixed = events.some(
        (e) => typeof (e as Record<string, unknown>)['fixed'] === 'string',
      );
      if (!hatFixed && events.length > 0) {
        eingaenge.push({
          osvId,
          ecosystem: eco,
          paket: name,
          eingefuehrt,
          behoben: null,
          schweregrad,
          zusammenfassung,
          zurueckgezogen,
        });
        hatRange = true;
      }
    }
    // Keine Ranges, aber explizite Versionen → alle als betroffen (eingefuehrt=version, behoben=null wäre zu breit;
    // wir lassen das hier weg, da Range-basierte Advisories der Normalfall sind).
    if (!hatRange && Array.isArray(af['versions']) && af['versions'].length > 0) {
      for (const v of af['versions'] as unknown[]) {
        if (typeof v === 'string') {
          eingaenge.push({
            osvId,
            ecosystem: eco,
            paket: name,
            eingefuehrt: v,
            behoben: naechsteVersion(v),
            schweregrad,
            zusammenfassung,
            zurueckgezogen,
          });
        }
      }
    }
  }
  return eingaenge;
}

function schwereVon(severity: unknown): string | null {
  if (!Array.isArray(severity) || severity.length === 0) return null;
  const s = severity[0] as Record<string, unknown>;
  return typeof s['score'] === 'string' ? s['score'] : null;
}

/** Für reine Versionslisten: ein „behoben" knapp über v, damit nur v selbst matcht. */
function naechsteVersion(v: string): string {
  return `${v}.0.0.1`;
}
