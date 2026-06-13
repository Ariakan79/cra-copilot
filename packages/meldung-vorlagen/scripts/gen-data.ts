import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { MeldungVorlagenSchema } from '../src/schema';
import { offeneReviews, pruefeStruktur } from '../src/struktur';

const quelle = fileURLToPath(new URL('../data/vorlagen.yaml', import.meta.url));
const ziel = fileURLToPath(new URL('../src/vorlagen.gen.json', import.meta.url));

const roh = yaml.load(readFileSync(quelle, 'utf8'), { schema: yaml.JSON_SCHEMA });
const geparst = MeldungVorlagenSchema.safeParse(roh);
if (!geparst.success) {
  console.error('Schema verletzt:', geparst.error.issues);
  process.exit(1);
}
const fehler = pruefeStruktur(geparst.data);
if (fehler.length > 0) {
  console.error('Strukturprüfung fehlgeschlagen:');
  for (const f of fehler) console.error(`  - ${f}`);
  process.exit(1);
}
const pending = offeneReviews(geparst.data);
if (process.argv.includes('--report')) {
  console.log(`meldung_version: ${geparst.data.meldung_version}`);
  console.log(`review_status pending: ${pending.length}`);
  for (const id of pending) console.log(`  - ${id}`);
  process.exit(0);
}
writeFileSync(ziel, JSON.stringify(geparst.data, null, 2) + '\n', 'utf8');
console.log(
  `vorlagen.gen.json geschrieben (meldung_version ${geparst.data.meldung_version}, ` +
    `${geparst.data.fristen.length} Fristen, ${geparst.data.vorlagen.length} Vorlagen, ${pending.length} pending).`,
);
