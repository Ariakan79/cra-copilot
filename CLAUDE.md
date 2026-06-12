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
  Phase 1 = nur Wizard + Regel-Engine.
- `packages/rules-engine`: reine Funktionen, kein I/O, kein DOM. Entscheidungslogik
  als deklarative YAML-Daten (Build → validiertes JSON via zod). Wizard, Cockpit und
  Portal nutzen **dieselbe** Engine — Methodik-Duplikation verboten (ADR-001).
- `apps/wizard`: Svelte 5 + Vite, **vollständig client-seitig** — keine externen
  Requests, kein Tracking, keine Cookies, keine Persistenz (ADR-002, ADR-007).
  Das steht als Produktversprechen in der UI und wird im E2E-Test erzwungen.
- Regulatorische Referenzen sind **Daten, nicht Code** (ADR-003); Sprache Deutsch,
  i18n-Struktur ohne i18n-Lib (ADR-004, ADR-011).
- Bei Einfachheit vs. Erweiterbarkeit gewinnt Einfachheit, solange ADR-001..005
  nicht verletzt werden.

## Befehle

pnpm-Workspaces, Node-Version aus `.nvmrc`.

```bash
pnpm install
pnpm -r run test        # Vitest: Unit + Golden Cases + Properties + Datenvalidierung
pnpm -r run lint        # ESLint + Prettier-Check
pnpm -r run typecheck   # tsc --strict
pnpm -r run build       # rules-engine, dann wizard (statischer Output)
pnpm --filter wizard e2e  # Playwright gegen vite preview
```

(Befehle entstehen mit dem Scaffolding — bei Abweichung diese Datei aktualisieren.)

## Git-Regeln (verbindlich)

- `main` ist geschützter Trunk; Feature-Branches `feat/...`, `fix/...`, `docs/...`.
- Conventional Commits, kleine Commits pro logischer Einheit.
- **Commit nur bei grünem Teststand.** Nach jedem Arbeitspaket: Tests, Commit,
  kurzes Summary an den Director.
- Regeldaten-Änderungen (Fragenkatalog, Klassifizierungsregeln): Git-Tag
  `rules-v0.x` + Changelog-Eintrag.
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
