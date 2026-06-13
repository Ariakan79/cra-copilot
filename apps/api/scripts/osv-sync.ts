import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from '../src/db/client';
import { osvJsonZuEingaengen } from '../src/portal/osv-import';
import { spiegleOsv, type OsvEingang } from '../src/portal/osv-spiegel';

/**
 * OSV-Sync (ADR-022): liest lokal abgelegte OSV-Datensätze und spiegelt sie in
 * die Datenbank. Das Matching bleibt damit vollständig offline — die einzige
 * ausgehende Verbindung ist der Download der ÖFFENTLICHEN OSV-Exporte, den der
 * Betreiber vorab durchführt (enthält keine Kundendaten):
 *
 *   gsutil -m cp -r gs://osv-vulnerabilities/npm ./osv-data
 *   gsutil -m cp -r gs://osv-vulnerabilities/Maven ./osv-data
 *   # oder die per-Ökosystem all.zip von https://osv-vulnerabilities.storage.googleapis.com/
 *
 * Aufruf:  tsx scripts/osv-sync.ts ./osv-data
 *
 * Bewusst NICHT Teil von CI/Tests (Netz/Nicht-Determinismus, TEST_STRATEGY §8.5);
 * die Tests nutzen Fixtures.
 */
const verzeichnis = process.argv[2];
if (verzeichnis === undefined) {
  console.error('Nutzung: tsx scripts/osv-sync.ts <osv-daten-verzeichnis>');
  process.exit(1);
}

function* jsonDateien(wurzel: string): Generator<string> {
  for (const eintrag of readdirSync(wurzel, { withFileTypes: true })) {
    const pfad = join(wurzel, eintrag.name);
    if (eintrag.isDirectory()) yield* jsonDateien(pfad);
    else if (eintrag.name.endsWith('.json')) yield pfad;
  }
}

const eingaenge: OsvEingang[] = [];
let dateien = 0;
for (const datei of jsonDateien(verzeichnis)) {
  dateien++;
  try {
    eingaenge.push(...osvJsonZuEingaengen(JSON.parse(readFileSync(datei, 'utf8'))));
  } catch (e) {
    console.warn(`übersprungen: ${datei} (${e instanceof Error ? e.message : 'Parsefehler'})`);
  }
}

const { sql, db } = connect();
await spiegleOsv(db, eingaenge);
await sql.end();
console.log(`OSV-Spiegel aktualisiert: ${eingaenge.length} Bereiche aus ${dateien} Dateien.`);
