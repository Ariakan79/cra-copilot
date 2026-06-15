# CRA-Copilot

**Compliance-Werkzeug zum EU Cyber Resilience Act (Verordnung (EU) 2024/2847)
für deutsche KMU** — von der Betroffenheitsanalyse über die geführte Aufnahme
und das kontinuierliche Schwachstellen-Monitoring bis zur vorbereiteten
Behördenmeldung nach Art. 14.

> **Kostenfrei zur nicht-kommerziellen Verwendung.** Quellcode unter
> [PolyForm Noncommercial 1.0.0](LICENSE), Dokumentation und regulatorische
> Daten unter [CC BY-NC 4.0](docs/LICENSE.md).
>
> **Keine Rechtsberatung.** CRA-Copilot liefert eine unverbindliche
> Ersteinschätzung. Alle regulatorischen Verweise sind vor Produktiveinsatz
> juristisch zu prüfen. Siehe [IMPRESSUM.md](IMPRESSUM.md).

---

## Was es tut

CRA-Copilot übersetzt die Pflichten des Cyber Resilience Act in ein geführtes,
evidenzbasiertes Verfahren — mit **einem** Domänenmodell und **einer** Regelbasis
über alle Oberflächen hinweg. Grundhaltung: Das System **strukturiert und
formuliert, bewertet aber nicht automatisch** — jede sicherheits- oder
meldungsrelevante Entscheidung trägt einen menschlichen Urheber. Regulatorische
Verweise sind **versionierte Daten, kein Code**, sodass juristische Korrekturen
ohne Software-Änderung möglich sind.

| Stufe | Oberfläche | Zweck |
| --- | --- | --- |
| 1 | **Wizard** | Öffentliche Selbstauskunft: Gilt der CRA? Welche Kategorie (Anhang III/IV)? Welche Pflichten ab wann? Vollständig client-seitig — die Eingaben verlassen den Browser nicht. |
| 2 | **Cockpit** | Internes Werkzeug: geführtes Aufnahme-Interview (Blöcke 0–8), Klassifizierung, Pflichtenkatalog, Evidenzknoten und Lücken. |
| 3 | **Portal** | Kundenseitig, self-hosted: SBOM-Ingestion (CycloneDX/SPDX), kontinuierliches Schwachstellen-Monitoring gegen einen **lokalen OSV-Spiegel**, Heartbeat/Lieferdisziplin. |
| 4 | **Meldeworkflow** | Art-14-Meldungen: Meldevorgang aus Finding oder frei, Stufen 24h/72h/Abschluss mit abgeleiteten Fristen, Entwurf zum **manuellen** Absenden über CSIRT/ENISA. |

Zusätzlich: **Hash-Verkettung** aller Nachweise (Manipulationsevidenz, SHA-256),
**security.txt** (Art. 13 Abs. 6, RFC 9116), **Nutzerbenachrichtigung**
(Art. 14 Abs. 8) und ein freiwilliges **BSI-Erstanschreiben** zur Meldebereitschaft.

## Architektur in Kürze

```
packages/rules-engine/      Reine Entscheidungslogik + Regelwerk (YAML, versioniert)
packages/aufnahme-katalog/  Aufnahme-Blöcke 0–8 als versioniertes YAML
packages/meldung-vorlagen/  Art-14-Fristen + Feldvorlagen als versionierte Daten
apps/api/                   Fastify + PostgreSQL + Drizzle (bindet 127.0.0.1)
apps/wizard/                Statische Wizard-App (Svelte 5 + Vite, kein Backend)
apps/cockpit/               Internes Cockpit (Svelte 5 + Vite, Proxy /api)
apps/portal/                Kundenportal (Svelte 5 + Vite, Proxy /api)
docs/                       Spezifikation, ADRs, Teststrategie, Projektdoku (PDF)
```

Entwurfsprinzipien sind in [`docs/ADR.md`](docs/ADR.md) festgehalten; die
fachliche Wahrheitsquelle ist [`docs/AUFNAHME_LEITFADEN_SPEC.md`](docs/AUFNAHME_LEITFADEN_SPEC.md),
die Teststrategie in [`docs/TEST_STRATEGY.md`](docs/TEST_STRATEGY.md). Eine
gerenderte Gesamtübersicht liegt als
[`docs/CRA-Copilot-Dokumentation.pdf`](docs/CRA-Copilot-Dokumentation.pdf).

---

## Voraussetzungen

- **Node ≥ 22** (siehe `.nvmrc`) — am einfachsten via `corepack enable`
- **pnpm** (über corepack bereitgestellt)
- **Docker** — nur für den Cockpit-/Portal-Stack (PostgreSQL, Testcontainers).
  Der Wizard braucht weder Docker noch ein Backend.

```bash
corepack enable
pnpm install
```

## Inbetriebnahme

### A) Nur der Wizard (statisch, ohne Backend)

```bash
pnpm --filter @cra-copilot/wizard run dev     # lokaler Dev-Server
# oder ein statisches Produktiv-Bundle:
pnpm --filter @cra-copilot/wizard run build    # Ausgabe: apps/wizard/dist/
```

Der Build ist eine rein statische Site mit relativen Pfaden (`base: './'`) und
läuft auf jedem Webspace (FTP, rsync, S3+CDN, GitHub Pages) — keine
Umgebungsvariablen, keine Datenbank, kein Backend.

### B) Voller Stack — Cockpit & Portal (mit Datenbank)

```bash
docker compose up -d                               # PostgreSQL auf 127.0.0.1:5433
pnpm --filter @cra-copilot/api run migrate          # Schema + Trigger anlegen
pnpm --filter @cra-copilot/api run dev              # API auf 127.0.0.1:3001

pnpm --filter @cra-copilot/cockpit run dev          # Cockpit (Proxy /api → 3001)
pnpm --filter @cra-copilot/portal run dev           # Portal  (Proxy /api → 3001)
```

Das Datenmodell ist von Tag 1 mandantengetrennt; lokal läuft der Stack als
Single-User ohne Auth (ADR-014), und alle Dienste binden ausschließlich an
`127.0.0.1` — Mandantendaten verlassen den Rechner nicht.

### Lokalen OSV-Spiegel befüllen (für das Portal-Monitoring)

Das Schwachstellen-Matching ist **offline** (ADR-022) — es wird kein Live-Abruf
gegen osv.dev gemacht. Der Spiegel wird operatorgetrieben befüllt:

```bash
# öffentliche OSV-Exporte herunterladen (Beispiel npm-Ökosystem):
gsutil -m cp -r gs://osv-vulnerabilities/npm ./osv-data
pnpm --filter @cra-copilot/api exec tsx scripts/osv-sync.ts ./osv-data
```

## Tests, Lint, Typecheck

```bash
pnpm -r run lint         # ESLint + Prettier-Check
pnpm -r run typecheck    # tsc --strict + svelte-check
pnpm -r run build        # Pakete + statischer Wizard-Output

# Ohne Docker:
pnpm --filter @cra-copilot/rules-engine run test
pnpm --filter @cra-copilot/aufnahme-katalog run test
pnpm --filter @cra-copilot/wizard run e2e

# Mit Docker (Testcontainers-PostgreSQL):
pnpm --filter @cra-copilot/api run test
pnpm --filter @cra-copilot/cockpit run e2e
pnpm --filter @cra-copilot/portal run e2e
```

> **Betriebshinweis:** Laufende Demo-Server vor E2E-Läufen beenden, sonst greift
> Playwrights `reuseExistingServer` auf eine veraltete Instanz zu.

## Fachliche Pflege (Regelwerk & Daten)

Die fachlichen Inhalte liegen als versionierte Daten:

- Klassifizierungs- und Pflichtenregeln → `packages/rules-engine/data/`
- Aufnahme-Blöcke 0–8 → `packages/aufnahme-katalog/data/`
- Art-14-Fristen + Meldevorlagen → `packages/meldung-vorlagen/data/`

Jede inhaltliche CRA-Aussage trägt ein Feld `review_status` (`pending`/`approved`);
ein Daten-Release (`rules-vX.Y`, `katalog-vX.Y`, `meldung-vX.Y`) setzt **0
offene Reviews** voraus.

## Lizenz

- **Quellcode:** [PolyForm Noncommercial License 1.0.0](LICENSE) — frei zur
  nicht-kommerziellen Verwendung. Kommerzielle Nutzung bedarf einer gesonderten
  Vereinbarung.
- **Dokumentation & regulatorische Daten:** [CC BY-NC 4.0](docs/LICENSE.md).
- **Open-Source-Komponenten & Anbieterkennzeichnung:** [IMPRESSUM.md](IMPRESSUM.md).
