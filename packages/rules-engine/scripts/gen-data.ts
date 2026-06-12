import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { RegelwerkSchema } from '../src/schema';
import { offeneReviews, pruefeStruktur } from '../src/struktur';

/**
 * YAML-Quelldaten validieren und als JSON für den Bundler generieren (ADR-010).
 * JSON_SCHEMA verhindert, dass YAML Datumsangaben o. Ä. implizit umtypt.
 */

const quelle = fileURLToPath(new URL('../data/regelwerk.yaml', import.meta.url));
const ziel = fileURLToPath(new URL('../src/regelwerk.gen.json', import.meta.url));

const roh = yaml.load(readFileSync(quelle, 'utf8'), { schema: yaml.JSON_SCHEMA });
const geparst = RegelwerkSchema.safeParse(roh);
if (!geparst.success) {
  console.error('Regelwerk-Schema verletzt:');
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
  console.log(`rules_version: ${geparst.data.rules_version}`);
  console.log(`review_status pending: ${pending.length}`);
  for (const id of pending) console.log(`  - ${id}`);
  process.exit(0);
}

writeFileSync(ziel, JSON.stringify(geparst.data, null, 2) + '\n', 'utf8');
console.log(
  `regelwerk.gen.json geschrieben (rules_version ${geparst.data.rules_version}, ` +
    `${geparst.data.fragen.length} Fragen, ${geparst.data.regeln.length} Regeln, ` +
    `${geparst.data.pflichten.length} Pflichten, ${pending.length} pending).`,
);
