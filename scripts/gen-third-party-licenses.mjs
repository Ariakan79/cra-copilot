/**
 * Erzeugt THIRD-PARTY-LICENSES.txt aus dem installierten Abhängigkeitsbaum.
 *
 * Nur Produktiv-Abhängigkeiten (`pnpm licenses list --prod`), Volltext: für
 * jedes Paket wird die im Paket mitgelieferte LICENSE-/COPYING-Datei eingelesen
 * und wörtlich übernommen (erfüllt die Attributionspflicht von MIT/BSD/ISC etc.).
 * Kein externes Werkzeug, keine Netzwerkzugriffe — liest nur node_modules.
 *
 * Aufruf (aus dem Repo-Wurzelverzeichnis):
 *   pnpm licenses list --prod --json | node scripts/gen-third-party-licenses.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LIZENZ_DATEI = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

function liesStdin() {
  return new Promise((res) => {
    let s = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (s += d));
    process.stdin.on('end', () => res(s));
  });
}

function lizenztext(pfad) {
  let datei;
  try {
    datei = readdirSync(pfad).find((f) => LIZENZ_DATEI.test(f));
  } catch {
    return null;
  }
  if (!datei) return null;
  try {
    return readFileSync(join(pfad, datei), 'utf8').trimEnd();
  } catch {
    return null;
  }
}

const gruppen = JSON.parse(await liesStdin());

// flache, alphabetisch sortierte Paketliste
const pakete = Object.values(gruppen)
  .flat()
  .sort((a, b) => a.name.localeCompare(b.name));

const ohneText = [];
const teile = [];

teile.push(
  'DRITTANBIETER-LIZENZEN — CRA-Copilot',
  '',
  'Diese Datei wird maschinell aus dem installierten Produktiv-Abhängigkeitsbaum',
  'erzeugt (pnpm licenses list --prod). Sie enthält die Urheberrechts- und',
  'Lizenzhinweise der mitgelieferten Open-Source-Komponenten im Volltext, soweit',
  'das jeweilige Paket eine Lizenzdatei beilegt. Maßgeblich für den exakten',
  'Bestand ist die pnpm-lock.yaml dieses Repositorys.',
  '',
  `Stand der Generierung: ${new Date().toISOString().slice(0, 10)}`,
  `Anzahl Produktiv-Pakete: ${pakete.length}`,
  '',
  'Neu erzeugen mit:',
  '  pnpm licenses list --prod --json | node scripts/gen-third-party-licenses.mjs',
  '',
  '='.repeat(78),
  '',
);

for (const p of pakete) {
  const version = (p.versions || []).join(', ');
  teile.push(
    `Paket:   ${p.name}${version ? `@${version}` : ''}`,
    `Lizenz:  ${p.license || 'unbekannt'}`,
    ...(p.homepage ? [`Quelle:  ${p.homepage}`] : []),
    ...(p.author
      ? [`Autor:   ${typeof p.author === 'string' ? p.author : p.author.name || ''}`]
      : []),
    '',
  );
  const text = (p.paths || []).map(lizenztext).find(Boolean);
  if (text) {
    teile.push(text, '');
  } else {
    ohneText.push(`${p.name} (${p.license || 'unbekannt'})`);
    teile.push(
      '[Keine Lizenzdatei im Paket gefunden. Es gilt der oben genannte',
      ` SPDX-Lizenzbezeichner: ${p.license || 'unbekannt'}.]`,
      '',
    );
  }
  teile.push('-'.repeat(78), '');
}

if (ohneText.length) {
  teile.push(
    '',
    'HINWEIS — Pakete ohne mitgelieferte Lizenzdatei (nur SPDX-Kennung vorhanden):',
    ...ohneText.map((x) => `  - ${x}`),
    '',
  );
}

writeFileSync('THIRD-PARTY-LICENSES.txt', teile.join('\n') + '\n');
console.error(
  `THIRD-PARTY-LICENSES.txt geschrieben: ${pakete.length} Pakete, ` +
    `${ohneText.length} ohne mitgelieferten Lizenztext.`,
);
