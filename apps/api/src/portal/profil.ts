import type { DB } from '../db/client';
import { aktuellerWert } from '../domain/evidenz';
import type { ParsedSbom } from './sbom-parse';

/**
 * Validierung einer Lieferung gegen das in Block 7 erfasste SBOM-Profil
 * (ADR-024). Pflichtfelder werden aus dem Konformitätsziel abgeleitet (ADR-018).
 */

const PFLICHT_JE_ZIEL: Record<
  string,
  ('purl' | 'version' | 'lieferant' | 'ersteller' | 'zeitstempel')[]
> = {
  bsi_tr_03183_2: ['purl', 'version', 'lieferant', 'ersteller', 'zeitstempel'],
  ntia_minimum: ['purl', 'version', 'lieferant', 'ersteller', 'zeitstempel'],
  eigen: [],
};

export interface ProfilPruefung {
  konform: boolean;
  fehler: string[];
}

export async function pruefeGegenProfil(
  db: DB,
  mandantId: string,
  produktId: string,
  sbom: ParsedSbom,
): Promise<ProfilPruefung> {
  const fehler: string[] = [];

  if (sbom.format === 'unbekannt') fehler.push('Format nicht erkannt (weder CycloneDX noch SPDX).');
  if (sbom.komponenten.length === 0) fehler.push('SBOM enthält keine Komponenten.');

  const zielWert = await aktuellerWert(db, mandantId, produktId, 'sb_konformitaetsziel');
  const ziel = typeof zielWert?.wert === 'string' ? zielWert.wert : 'bsi_tr_03183_2';
  const pflicht = PFLICHT_JE_ZIEL[ziel] ?? PFLICHT_JE_ZIEL['bsi_tr_03183_2']!;

  if (pflicht.includes('ersteller') && sbom.ersteller === null)
    fehler.push('Pflichtfeld „ersteller" fehlt im SBOM-Kopf.');
  if (pflicht.includes('zeitstempel') && sbom.zeitstempel === null)
    fehler.push('Pflichtfeld „zeitstempel" fehlt im SBOM-Kopf.');

  // Komponenten-Pflichtfelder: Stichprobe über alle, Sammelmeldung.
  const ohnePurl = sbom.komponenten.filter(
    (k) => pflicht.includes('purl') && k.purl === null,
  ).length;
  const ohneVersion = sbom.komponenten.filter(
    (k) => pflicht.includes('version') && k.version === null,
  ).length;
  const ohneLieferant = sbom.komponenten.filter(
    (k) => pflicht.includes('lieferant') && k.lieferant === null,
  ).length;
  if (ohnePurl > 0) fehler.push(`${ohnePurl} Komponente(n) ohne eindeutige ID (purl).`);
  if (ohneVersion > 0) fehler.push(`${ohneVersion} Komponente(n) ohne Version.`);
  if (ohneLieferant > 0) fehler.push(`${ohneLieferant} Komponente(n) ohne Lieferant.`);

  return { konform: fehler.length === 0, fehler };
}
