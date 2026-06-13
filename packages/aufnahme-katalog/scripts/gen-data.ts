import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { KatalogSchema } from '../src/schema';
import { offeneReviews, pruefeStruktur } from '../src/struktur';

/**
 * YAML-Quelldaten validieren und als JSON für die Konsumenten generieren
 * (ADR-016, gleiches Muster wie das Regelwerk).
 */

const quelle = fileURLToPath(new URL('../data/katalog.yaml', import.meta.url));
const ziel = fileURLToPath(new URL('../src/katalog.gen.json', import.meta.url));

const roh = yaml.load(readFileSync(quelle, 'utf8'), { schema: yaml.JSON_SCHEMA });
const geparst = KatalogSchema.safeParse(roh);
if (!geparst.success) {
  console.error('Katalog-Schema verletzt:');
  console.error(geparst.error.issues);
  process.exit(1);
}

const strukturFehler = pruefeStruktur(geparst.data);
if (strukturFehler.length > 0) {
  console.error('Strukturprüfung fehlgeschlagen:');
  for (const fehler of strukturFehler) console.error(`  - ${fehler}`);
  process.exit(1);
}

const pending = offeneReviews(geparst.data);

if (process.argv.includes('--report')) {
  console.log(`katalog_version: ${geparst.data.katalog_version}`);
  console.log(`review_status pending: ${pending.length}`);
  for (const id of pending) console.log(`  - ${id}`);
  process.exit(0);
}

writeFileSync(ziel, JSON.stringify(geparst.data, null, 2) + '\n', 'utf8');
const felderGesamt = geparst.data.bloecke.reduce((n, b) => n + b.felder.length, 0);
console.log(
  `katalog.gen.json geschrieben (katalog_version ${geparst.data.katalog_version}, ` +
    `${geparst.data.bloecke.length} Blöcke, ${felderGesamt} Felder, ${pending.length} pending).`,
);
