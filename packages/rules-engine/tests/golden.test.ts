import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  bereinigeAntworten,
  naechsterSchritt,
  regelwerk,
  type Antworten,
  type Ergebnis,
  type Kategorie,
  type ReviewStatus,
} from '../src/index';

/**
 * Table-driven Golden Cases (TEST_STRATEGY §1): Jeder Fall ist eine YAML-Datei
 * in tests/golden/ — der Director reviewt und erweitert den Katalog ohne
 * Testcode anzufassen.
 */

interface GoldenFall {
  id: string;
  titel: string;
  review_status: ReviewStatus;
  antworten: Antworten;
  erwartung: {
    geltungsbereich: Ergebnis['geltungsbereich'];
    kategorie?: Kategorie;
    sonderregime?: 'os_steward';
    begruendungspfad_enthaelt?: string[];
    pflichten_stichprobe?: { id: string; frist: string }[];
  };
}

const ordner = fileURLToPath(new URL('./golden/', import.meta.url));
const faelle = readdirSync(ordner)
  .filter((datei) => datei.endsWith('.yaml'))
  .sort()
  .map(
    (datei) =>
      yaml.load(readFileSync(join(ordner, datei), 'utf8'), {
        schema: yaml.JSON_SCHEMA,
      }) as GoldenFall,
  );

describe('Golden Cases', () => {
  it('Katalog umfasst mindestens 20 Fälle', () => {
    expect(faelle.length).toBeGreaterThanOrEqual(20);
  });

  it.each(faelle.map((fall) => [`${fall.id} ${fall.titel}`, fall] as const))(
    '%s',
    (_name, fall) => {
      const schritt = naechsterSchritt(regelwerk, fall.antworten);
      if (schritt.typ === 'frage') {
        throw new Error(`${fall.id}: Antworten unvollständig — offene Frage ${schritt.frage.id}`);
      }
      const ergebnis = schritt.ergebnis;

      expect(ergebnis.geltungsbereich).toBe(fall.erwartung.geltungsbereich);
      if (fall.erwartung.kategorie !== undefined) {
        expect(ergebnis.kategorie).toBe(fall.erwartung.kategorie);
      }
      if (fall.erwartung.sonderregime !== undefined) {
        expect(ergebnis.sonderregime).toBe(fall.erwartung.sonderregime);
      }

      const pfadIds = ergebnis.begruendungspfad.map((ref) => ref.regel_id);
      for (const regelId of fall.erwartung.begruendungspfad_enthaelt ?? []) {
        expect(pfadIds, `${fall.id}: Begründungspfad`).toContain(regelId);
      }

      for (const stichprobe of fall.erwartung.pflichten_stichprobe ?? []) {
        const pflicht = ergebnis.pflichten.find((p) => p.id === stichprobe.id);
        expect(pflicht, `${fall.id}: Pflicht ${stichprobe.id} fehlt`).toBeDefined();
        expect(pflicht?.frist, `${fall.id}: Frist von ${stichprobe.id}`).toBe(stichprobe.frist);
      }

      // Integrität der Falldaten: keine veralteten/unerreichbaren Antworten im YAML.
      expect(bereinigeAntworten(regelwerk, fall.antworten)).toEqual(fall.antworten);
    },
  );
});
