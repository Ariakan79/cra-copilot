# Impressum & Lizenzhinweise

## Anbieterkennzeichnung (§ 5 DDG / § 18 MStV)

> **Hinweis:** Die folgenden Pflichtangaben sind vor einer öffentlichen
> Bereitstellung des Tools (gehostete Instanz) durch den Betreiber zu
> vervollständigen. Für das reine Quellcode-Repository besteht keine
> Impressumspflicht; sie entsteht bei Betrieb eines geschäftsmäßigen
> Online-Angebots.

- **Verantwortlich / Rechteinhaber:** _<Name bzw. Firmierung eintragen>_
- **Anschrift:** _<Straße, PLZ Ort eintragen>_
- **E-Mail:** msieberath@gmail.com
- **Vertretungsberechtigt:** _<falls juristische Person>_
- **USt-IdNr.:** _<falls vorhanden>_

## Haftungs- und Rechtshinweis

CRA-Copilot ist ein technisches Werkzeug zur Unterstützung bei der Umsetzung des
EU Cyber Resilience Act (Verordnung (EU) 2024/2847). Es liefert eine
**unverbindliche Ersteinschätzung** und **keine Rechtsberatung**. Alle
regulatorischen Verweise (Artikel-, Anhang- und Fristangaben) sind nach bestem
Wissen zusammengestellt, aber vor Produktiveinsatz juristisch zu prüfen. Eine
Gewähr für Richtigkeit, Vollständigkeit und Aktualität wird nicht übernommen.

## Lizenz des Werkzeugs

- **Quellcode:** PolyForm Noncommercial License 1.0.0 — frei zur
  **nicht-kommerziellen** Verwendung (siehe `LICENSE`).
- **Dokumentation & regulatorische Daten:** Creative Commons BY-NC 4.0
  (siehe `docs/LICENSE.md`).

---

## Verwendete Open-Source-Komponenten

Dieses Werkzeug nutzt die folgenden quelloffenen Bibliotheken. Die jeweiligen
Lizenzbedingungen und Urheberrechtshinweise der Pakete gelten fort; sie sind in
den installierten Paketen unter `node_modules/<paket>/LICENSE` einsehbar. Die
Versionsangaben entsprechen dem Stand der `pnpm-lock.yaml` zum
Veröffentlichungszeitpunkt.

### Laufzeit- und Anwendungsbibliotheken

| Paket | Version | Lizenz | Projektseite |
| --- | --- | --- | --- |
| Svelte | 5.56.3 | MIT | https://svelte.dev |
| Vite | 7.3.5 | MIT | https://vite.dev |
| @sveltejs/vite-plugin-svelte | 6.2.4 | MIT | https://github.com/sveltejs/vite-plugin-svelte |
| Fastify | 5.8.5 | MIT | https://fastify.dev |
| Drizzle ORM | 0.44.7 | Apache-2.0 | https://orm.drizzle.team |
| postgres (porsager) | 3.4.9 | Unlicense (Public Domain) | https://github.com/porsager/postgres |
| js-yaml | 4.2.0 | MIT | https://github.com/nodeca/js-yaml |
| Zod | 4.4.3 | MIT | https://zod.dev |

### Build-, Test- und Entwicklungswerkzeuge

| Paket | Version | Lizenz | Projektseite |
| --- | --- | --- | --- |
| TypeScript | 5.9.3 | Apache-2.0 | https://www.typescriptlang.org |
| Drizzle Kit | 0.31.10 | MIT | https://orm.drizzle.team |
| Vitest | 3.2.6 | MIT | https://vitest.dev |
| fast-check | 4.8.0 | MIT | https://fast-check.dev |
| tsx | 4.22.4 | MIT | https://tsx.is |
| Testcontainers (Node) | 11.14.0 | MIT | https://testcontainers.com |
| @testcontainers/postgresql | 11.14.0 | MIT | https://testcontainers.com |
| @playwright/test | 1.60.0 | Apache-2.0 | https://playwright.dev |
| @axe-core/playwright | 4.11.3 | MPL-2.0 | https://github.com/dequelabs/axe-core-npm |
| ESLint | 9.39.4 | MIT | https://eslint.org |
| Prettier | 3.8.4 | MIT | https://prettier.io |
| typescript-eslint, eslint-config-prettier, eslint-plugin-svelte, prettier-plugin-svelte, globals, @types/* | siehe Lockfile | MIT | jeweilige Projektseite |

### Infrastruktur und Daten

| Komponente | Lizenz | Hinweis |
| --- | --- | --- |
| PostgreSQL 17 (+ Erweiterung `pgcrypto`) | PostgreSQL License | Datenbank, lokal via Docker betrieben |
| Open Source Vulnerabilities (OSV) | CC-BY 4.0 | Schwachstellendaten; **lokaler Spiegel**, operatorgetrieben befüllt (kein Live-Abruf, ADR-022) |

> **Vollständige Attributionsliste (Volltext):** Die Datei
> [`THIRD-PARTY-LICENSES.txt`](THIRD-PARTY-LICENSES.txt) enthält die Urheberrechts-
> und Lizenzhinweise **aller Produktiv-Abhängigkeiten im Volltext** (maschinell
> erzeugt aus dem installierten Baum). Neu erzeugen mit
> `pnpm run licenses:third-party`. Maßgeblich für den exakten Bestand ist die
> `pnpm-lock.yaml` dieses Repositorys.
