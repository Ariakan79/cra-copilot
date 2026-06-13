# CRA-Copilot — Repo-Konventionen

Compliance-Produkt zum EU Cyber Resilience Act für deutsche KMU.
Arbeitsteilung: **Director** (Nutzer) entscheidet Architektur und reviewt fachlich;
**Implementierer** (Claude) setzt um, fragt bei Ambiguität nach, schlägt Alternativen
vor statt still anzunehmen.

## Wahrheitsquellen

- `docs/AUFNAHME_LEITFADEN_SPEC.md` — **fachliche Wahrheitsquelle** für alle spätere
  Cockpit-Arbeit (Blöcke 0–8, Evidenzknoten, SBOM-Profil). Vor Cockpit-Aufgaben lesen.
- `docs/ADR.md` — Architekturentscheidungen. Festgezurrte ADRs nie neu verhandeln.
- `docs/TEST_STRATEGY.md` — Teststrategie inkl. Golden-Case-Katalog.

## Architektur (Kurzform — Details im ADR)

- **Ein Backend, ein Domänenmodell, drei Oberflächen** (Wizard, Cockpit, Portal).
  Phase 1 = Wizard + Regel-Engine (fertig). Phase 2 = Cockpit + API + Katalog
  (fertig). Phase 3 = Portal (Ingestion/Monitoring/Meldeworkflow) — offen.
- `packages/rules-engine`: reine Funktionen, kein I/O, kein DOM. Entscheidungslogik
  als deklarative YAML-Daten (Build → validiertes JSON via zod). Wizard, Cockpit und
  Portal nutzen **dieselbe** Engine — Methodik-Duplikation verboten (ADR-001).
- `packages/aufnahme-katalog`: gleiches Daten-Muster wie die Engine — Blöcke 0–8
  als versioniertes YAML (zod + Strukturprüfung). Jedes Feld deklariert Ebene
  (mandant/produkt/mandant_mit_override, ADR-017) und Downstream-Konsumenten
  (Grundprinzip 3, strukturell erzwungen).
- `apps/api`: Fastify + PostgreSQL + Drizzle (ADR-013), bindet 127.0.0.1, lokal
  Single-User ohne Auth (ADR-014), aber Datenmodell von Tag 1 mandantengetrennt.
  Evidenzknoten sind **append-only mit Supersession** (ADR-015, DB-Trigger erzwingt
  Unveränderlichkeit). Gaps/Ampeln sind abgeleiteter Zustand (ADR-019).
- `apps/wizard`: Svelte 5 + Vite, **vollständig client-seitig** — keine externen
  Requests, kein Tracking, keine Cookies, keine Persistenz (ADR-002, ADR-007).
  Das steht als Produktversprechen in der UI und wird im E2E-Test erzwungen.
- `apps/cockpit`: Svelte 5 + Vite, internes Werkzeug; spricht `apps/api` über den
  Vite-Proxy `/api` an. Konsumiert `aufnahme-katalog` direkt fürs Rendering.
- `apps/portal`: Svelte 5 + Vite, **kundenseitig, self-hosted pro Kunde** (ADR-021).
  SBOM-Ingestion (append-only Lieferungen, ADR-024), **lokaler OSV-Spiegel**
  (ADR-022: Matching offline, keine Komponentenliste verlässt das System),
  kontinuierliche Findings (ADR-027/028), Heartbeat (Lieferdisziplin, ADR-026),
  einfaches Login + Ingestion-Tokens (ADR-025). Teilt API/Domänenmodell (ADR-023).
- `packages/meldung-vorlagen`: Art-14-Fristen + Feldvorlagen als versionierte
  Daten (ADR-033, Muster wie Regelwerk/Katalog). **Meldeworkflow** (Phase 4,
  ADR-029–034): Meldevorgang aus Finding (menschliche „aktiv-ausgenutzt"-
  Einstufung, ADR-034) oder frei; Stufen 24h/72h/Abschluss mit abgeleiteten
  Fristen (ADR-032); Entwurf zum **manuellen** Absenden über ENISA/CSIRT
  (ADR-030, kein Auto-Outbound); eingereichte Stufen unveränderlich.
- Regulatorische Referenzen sind **Daten, nicht Code** (ADR-003); Sprache Deutsch,
  i18n-Struktur ohne i18n-Lib (ADR-004, ADR-011).
- Bei Einfachheit vs. Erweiterbarkeit gewinnt Einfachheit, solange ADR-001..005
  nicht verletzt werden.

## Befehle

pnpm-Workspaces, Node-Version aus `.nvmrc`.

```bash
pnpm install
pnpm -r run lint        # ESLint + Prettier-Check
pnpm -r run typecheck   # tsc --strict + svelte-check
pnpm -r run build       # rules-engine, wizard (statischer Output)

# Engine/Katalog/Wizard (kein Docker):
pnpm --filter @cra-copilot/rules-engine run test
pnpm --filter @cra-copilot/aufnahme-katalog run test
pnpm --filter @cra-copilot/wizard run e2e

# Cockpit-/Portal-Stack (braucht Docker):
docker compose up -d                          # lokaler Postgres (Port 5433)
pnpm --filter @cra-copilot/api run migrate     # Schema anlegen
pnpm --filter @cra-copilot/api run dev         # API auf 127.0.0.1:3001
pnpm --filter @cra-copilot/cockpit run dev     # Cockpit (Proxy /api → 3001)
pnpm --filter @cra-copilot/portal run dev      # Portal (Proxy /api → 3001)
pnpm --filter @cra-copilot/api run test        # Testcontainers-Postgres, alle Invarianten
pnpm --filter @cra-copilot/cockpit run e2e     # echter Stack (global-setup startet DB+API)
pnpm --filter @cra-copilot/portal run e2e      # echter Stack + OSV-Fixture

# OSV-Spiegel füllen (operatorgetrieben, NICHT in CI — ADR-022/§8.5):
#   gsutil -m cp -r gs://osv-vulnerabilities/npm ./osv-data   # öffentliche OSV-Exporte
pnpm --filter @cra-copilot/api exec tsx scripts/osv-sync.ts ./osv-data
```

CI (`.github/workflows/ci.yml`) hat zwei Jobs: `einheit` (ohne Docker) und
`integration` (Docker/Testcontainers für API + Cockpit).

## Git-Regeln (verbindlich)

- `main` ist geschützter Trunk; Feature-Branches `feat/...`, `fix/...`, `docs/...`.
- Conventional Commits, kleine Commits pro logischer Einheit.
- **Commit nur bei grünem Teststand.** Nach jedem Arbeitspaket: Tests, Commit,
  kurzes Summary an den Director.
- Datendaten-Änderungen: Regelwerk → `rules-v0.x`; Aufnahme-Katalog →
  `katalog-v0.x`; Meldung-Vorlagen → `meldung-v0.x` (je + Changelog). Tag-Gate
  ist je **0 `review_status: pending`** (Director-Freigabe vollständig).
- DB-Migrationen liegen als nummerierte SQL in `apps/api/drizzle/` (inkl.
  Custom-Trigger); der schlanke Migrator in `src/db/migrate.ts` führt sie der
  Reihe nach aus. Neue Migration = neue `NNNN_*.sql`, nie bestehende ändern.
- Niemals Secrets, Tokens oder Kundendaten ins Repo. Phase 1 braucht keine —
  wer welche braucht, hat ein Designproblem: melden statt einbauen.

## Fachliche Leitplanken

- **Keine Rechtsberatung:** Disclaimer auf Start- und Ergebnisseite;
  „Ersteinschätzung", nie „rechtsverbindlich".
- Jede von Claude generierte inhaltliche CRA-Aussage (Artikel-/Annex-Bezug,
  Einstufung, Frist) trägt in den Datendateien `review_status: pending`, bis der
  Director sie freigibt. Das `rules-v0.1`-Tag setzt **0 pending** voraus.
- Wizard bleibt in Selbstauskunfts-Tiefe — die bewertende Methodik des Cockpits
  wird nicht in den Wizard geleakt (Spec, Nicht-Ziele).
- Fristen-Anker: Meldepflichten ab 09/2026, volle CRA-Anwendung ab 12/2027.

## Freigabe-Gates

Phasen-Dokumente (ADR, Teststrategie) und der Golden-Case-Katalog brauchen
explizite Director-Freigabe, bevor darauf aufgebaut wird. Status-Felder in den
Dokumenten pflegen (`zur Freigabe` → `akzeptiert` mit Datum).
