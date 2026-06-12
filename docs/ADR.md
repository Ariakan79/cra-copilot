# Architecture Decision Records — CRA-Copilot

**Projekt:** CRA-Copilot · **Phase:** 1 (Wizard + Regel-Engine)
**Stand:** 2026-06-12 · **Format:** Ein Dokument, fortlaufend nummerierte ADRs.

Statuswerte: `festgezurrt` (vom Director vorgegeben, nicht verhandelbar),
`vorgeschlagen` (vom Implementierer, **zur Freigabe**), `akzeptiert`, `abgelöst durch ADR-xxx`.

---

## ADR-001 — Regel-Engine als eigenständiges, versioniertes Paket

**Status:** festgezurrt

**Entscheidung:** Die gesamte Entscheidungslogik (Fragenkatalog, Ablaufsteuerung,
Klassifizierung nach `default | wichtig_klasse_1 | wichtig_klasse_2 | kritisch`,
Pflichtenkatalog-Ableitung) lebt in `packages/rules-engine` als reine Funktionen
über deklarativen JSON/YAML-Daten. Kein DOM-Zugriff, kein I/O — die Engine erhält
Regeldaten und Antworten als Argumente und gibt Ergebnisse zurück.

**Konsequenzen:**
- Wizard (Phase 1), Cockpit und Portal (später) konsumieren dieselbe Engine in
  unterschiedlicher Tiefe; Methodik-Duplikation ist verboten (vgl. Spec, Nicht-Ziele:
  Wizard nutzt die Regel-Engine nur in Selbstauskunfts-Tiefe).
- Da die Engine kein I/O macht, ist das **Laden** der Regeldaten Sache des Konsumenten
  (Wizard bündelt sie statisch, ein späteres Backend lädt sie aus der DB). Siehe ADR-010.
- Die Engine ist vollständig ohne Browser testbar (Vitest, Node).

---

## ADR-002 — Wizard vollständig client-seitig

**Status:** festgezurrt

**Entscheidung:** Der Wizard ist eine statische Site. Keine Antwort verlässt den
Browser: kein Backend-Call, kein Tracking, keine Cookies, keine externen Requests
(auch keine CDN-Fonts — alles gebündelt). Ergebnis-Export als druckbare Seite
(Print-CSS → Browser-PDF). Das Versprechen „Ihre Angaben verlassen Ihren Browser
nicht" steht wörtlich in der UI und ist technisch im E2E-Test abgesichert
(Netzwerk-Panel leer außer Asset-Loads, siehe DoD).

**Konsequenzen:** Kein Server-Rendering nötig, Hosting auf beliebigem Webspace /
GitHub Pages. Der Call-to-Action ist ein `mailto:`-Link, kein Formular.

---

## ADR-003 — Regulatorische Referenzen sind Daten, nicht Code

**Status:** festgezurrt

**Entscheidung:** Artikel-/Annex-Verweise, Schwellenwerte, Fragentexte und
Erläuterungen liegen in versionierten Datendateien mit eigenem Versionsfeld
(`rules_version`). Juristische Korrekturen ändern Daten, nie Logik. Inhaltliche
Aussagen zu CRA-Artikeln/Annexen, die der Implementierer generiert, tragen
`review_status: pending` bis zur fachlichen Freigabe durch den Director.

**Konsequenzen:** Regeldaten-Releases werden mit `rules-v0.x` getaggt und im
Changelog geführt — unabhängig vom Code-Stand. Harmonisierte Normen können später
ohne Migration nachgezogen werden (Spec, Grundprinzip 5).

---

## ADR-004 — Sprache: Deutsch zuerst, i18n-Struktur ab Tag 1

**Status:** festgezurrt

**Entscheidung:** UI und Inhalte sind Deutsch. Die Struktur trennt von Anfang an
Texte von Logik (Message-Kataloge, sprachfähige Textfelder in den Regeldaten),
sodass EN später ohne Umbau möglich ist. Ausgestaltung: ADR-011.

---

## ADR-005 — Monorepo-Layout

**Status:** festgezurrt

**Entscheidung:**

```
packages/rules-engine/   # reine Logik + Regeldaten (ADR-001, ADR-010)
apps/wizard/             # statische Wizard-App (ADR-002)
docs/                    # Spec, ADR, Teststrategie, CLAUDE.md-Quellen
```

Backend-Apps (Cockpit, Portal) kommen später als weitere Workspaces dazu.
Workspace-Tooling: ADR-009.

---

## ADR-006 — Wizard-Frontend: Svelte 5 mit Vite

**Status:** akzeptiert (Freigabe Director 2026-06-12)

**Kontext:** Vorgabe: leichtgewichtig, Vite-basiert. Kandidaten: Vanilla-TS,
React, Svelte. Der Wizard ist eine dünne Schale über der Engine: Fragenfluss,
Fortschritt, Zurück-Navigation, Ergebnisseite mit Print-CSS. Kein Router-Bedarf,
keine Drittkomponenten-Bibliothek, Zielgruppe Laien → Performance und schlanke
Auslieferung zählen.

**Entscheidung:** Svelte 5 (Runes) + Vite. Begründung:
- **Bundle/Performance:** Svelte kompiliert zu imperativem DOM-Code ohne
  Framework-Runtime im klassischen Sinn — für eine statische Site mit
  Produktversprechen „schlank, keine externen Requests" der beste Fit.
- **Reaktivität geschenkt:** Fragenfluss = Antwort ändert sich → sichtbare Frage,
  Fortschritt, Erreichbarkeit nachfolgender Fragen ändern sich. Deklarative
  Reaktivität eliminiert genau die Klasse von UI-Bugs (vergessene Re-Renders),
  die bei Hand-Rendering entsteht.
- **Formulare/A11y:** Svelte arbeitet nah an nativen HTML-Formularelementen —
  gut für Tastaturbedienung und Screenreader ohne Zusatzbibliothek.

**Gegenposition A — Vanilla-TS (keine Abhängigkeit, maximale Langlebigkeit):**
Null Framework-Churn, niemand muss Svelte lernen. **Verworfen, weil** der Wizard
zustandsgetriebenes Re-Rendering braucht (Antworten ↔ sichtbare Fragen ↔
Fortschritt ↔ Ergebnis). Hand-gerollt entsteht ein eigenes, ungetestetes
Mini-Framework — mehr Eigencode und mehr Bugfläche als die Abhängigkeit, die
vermieden werden sollte. „Einfachheit gewinnt" heißt hier: weniger Eigencode.

**Gegenposition B — React (größter Talent-Pool, größtes Ökosystem):**
Zukünftige Entwickler kennen es sicher; Cockpit/Portal könnten Komponenten teilen.
**Verworfen, weil** der Ökosystem-Vorteil hier nicht zieht — der Wizard braucht
bewusst keine Drittkomponenten — während die Kosten real sind: Framework-Runtime
im Bundle, höherer Abhängigkeits-Churn. Das Komponenten-Sharing-Argument ist
spekulativ: Cockpit/Portal sind nicht entschieden, und geteilt wird ohnehin die
Engine, nicht die UI.

**Risiko & Mitigation:** Svelte hat den kleinsten Talent-Pool der drei, und
Svelte 5 (Runes) ist relativ jung. Mitigation: Die gesamte Fachlogik liegt
framework-frei in der Engine (ADR-001); die UI-Schicht ist dünn und in einer
Woche portierbar, falls nötig.

---

## ADR-007 — State-Handling: ein Antwort-Objekt, Engine leitet alles ab

**Status:** akzeptiert (Freigabe Director 2026-06-12)

**Entscheidung:**
- Single Source of Truth ist ein **serialisierbares Antwort-Objekt**
  `Record<frage_id, antwort>` in einem Svelte-Store. Sonst nichts.
- Aktuelle Frage, Fortschritt, Erreichbarkeit, Klassifizierung, Begründungspfad
  und Pflichtenkatalog sind **abgeleiteter Zustand** — reine Engine-Aufrufe
  (`naechsteFrage(regeln, antworten)`, `klassifiziere(regeln, antworten)`),
  nie separat gespeichert. Zurück-Navigation = Antwort entfernen/ändern;
  Folgeantworten, deren Fragen unerreichbar werden, werden verworfen (kein
  inkonsistenter Zustand möglich).
- **Keine Persistenz in v1:** Zustand lebt im Speicher; Reload beginnt von vorn.

**Gegenposition A — State-Machine-Bibliothek (z. B. XState):** Formalisiert
Übergänge, visualisierbar. **Verworfen, weil** die Regel-Engine bereits die
Zustandsmaschine *ist* — deklarativ in den Regeldaten. Ein zweiter Formalismus
in der UI wäre genau die Methodik-Duplikation, die ADR-001 verbietet.

**Gegenposition B — sessionStorage gegen versehentlichen Reload:** Bleibt im
Browser, verletzt ADR-002 also nicht; rettet Antworten bei Reload. **Verworfen
für v1, weil** der Wizard kurz ist (Selbstauskunfts-Tiefe, < 5 Minuten) und das
Datenschutzversprechen in seiner stärksten Form kommunizierbar bleibt: „nichts
wird gespeichert — auch nicht lokal". Revisionierbar, falls Nutzerfeedback
Abbrüche durch Reload zeigt.

---

## ADR-008 — Teststack: Vitest, fast-check, Playwright; ESLint + Prettier

**Status:** akzeptiert (Freigabe Director 2026-06-12)

**Entscheidung:**

| Ebene | Werkzeug | Einsatz |
|---|---|---|
| Unit / Golden Cases | **Vitest** | Table-driven Golden-Cases & Unit-Tests der Engine |
| Invarianten | **fast-check** | Property-based Tests (Terminierung, Begründungspfad, Erreichbarkeit) |
| E2E-Smoke | **Playwright** | Golden-Case-Durchklick bis Ergebnisbericht; Assertion „keine externen Requests" |
| Typen | **tsc `--strict`** | eigener CI-Schritt, kein Build-Nebeneffekt |
| Lint/Format | **ESLint (flat) + Prettier** | mit `eslint-plugin-svelte` / `prettier-plugin-svelte` |

Begründung: Vitest teilt die Vite-Pipeline (keine zweite Transform-Konfiguration);
fast-check ist der De-facto-Standard für Property-Tests in TS; Playwright kann
Netzwerk-Requests abfangen und damit das ADR-002-Versprechen als Test formulieren.

**Gegenposition A — Jest statt Vitest:** Verbreiteter, mehr Dokumentation.
**Verworfen, weil** Jest neben Vite eine zweite Transform-Pipeline (Babel/SWC)
mit eigener ESM-Konfiguration erfordert — laufende Wartungskosten ohne Gegenwert.

**Gegenposition B — Biome statt ESLint + Prettier:** Ein Werkzeug, deutlich
schneller, fast konfigurationsfrei — eigentlich die „Einfachheit gewinnt"-Wahl.
**Verworfen, weil** Biome `.svelte`-Dateien derzeit nicht vollständig unterstützt;
gerade die UI-Komponenten blieben ungelintet. Fällt mit ADR-006; bei Vanilla-TS
oder React wäre Biome meine Empfehlung gewesen.

**Gegenposition C — Cypress statt Playwright:** Reifes Ökosystem. **Verworfen,
weil** Playwright schneller in CI läuft, Request-Interception erstklassig kann
(zentral für unseren E2E-Zweck) und ohne Dienst-Anbindung auskommt.

---

## ADR-009 — Monorepo-Tooling: pnpm-Workspaces, kein Orchestrator

**Status:** akzeptiert (Freigabe Director 2026-06-12)

**Entscheidung:** pnpm-Workspaces; Node LTS via `engines` + `.nvmrc` gepinnt.
Kein Turborepo/Nx: bei zwei Workspaces reichen `pnpm -r run test` u. Ä.
TypeScript-Project-References verbinden `apps/wizard` → `packages/rules-engine`.

**Gegenposition — npm-Workspaces (kein zusätzliches Werkzeug):** **Verworfen,
weil** pnpm Phantom-Dependencies strukturell verhindert (strikte `node_modules`-
Isolation) — im Monorepo der häufigste schleichende Kopplungsfehler, genau das,
was „Cockpit darf nicht verbaut werden" vermeiden soll. Installationsgeschwindigkeit
ist Bonus. Turborepo/Nx bleiben bewusst draußen, bis Build-Zeiten es rechtfertigen.

---

## ADR-010 — Regeldaten: YAML als Quellformat, Validierung mit zod

**Status:** akzeptiert (Freigabe Director 2026-06-12)

**Entscheidung:**
- **Quellformat YAML** in `packages/rules-engine/data/` (Fragenkatalog,
  Klassifizierungsregeln, Pflichtenkatalog), mit `rules_version`, pro inhaltlicher
  Aussage `review_status: pending | approved` und regulatorischer Referenz
  (Artikel/Annex) als strukturiertem Feld (Spec, Grundprinzip 5).
- **Build-Zeit:** YAML → validiertes JSON, das der Wizard statisch bündelt.
  Die Engine selbst parst nichts (ADR-001: kein I/O) — sie erhält das geparste
  Objekt als Argument.
- **Validierung mit zod:** Ein Schema, drei Nutzungen — Build-Validierung der
  Daten, abgeleitete TS-Typen für die Engine, Laufzeit-Guard im Engine-Eingang.
  Zusätzliche strukturelle Prüfungen (alle referenzierten Fragen existieren,
  keine Zyklen) laufen als Engine-Funktion im Test (Brücke zu den
  Property-Tests, Phase B).

**Gegenposition — direkt JSON (kein Build-Schritt, nativer Import):**
**Verworfen, weil** die Datendateien das primäre Arbeitsmaterial der
*juristischen* Review sind: mehrzeilige deutsche Erläuterungstexte, Kommentare
zur Begründung von Einstufungen — in JSON ohne Kommentare und mit
Escape-Orgien praktisch nicht reviewbar. Der Build-Schritt existiert ohnehin (Vite).

---

## ADR-011 — i18n: Message-Kataloge ohne i18n-Bibliothek

**Status:** akzeptiert (Freigabe Director 2026-06-12)

**Entscheidung:** Alle UI-Texte liegen in `apps/wizard/src/locales/de.ts`
(typisierter Katalog, Zugriff nur über Schlüssel — kein String-Literal im
Markup). Fachtexte in den Regeldaten nutzen sprachfähige Felder
(`text: { de: "…" }`), sodass EN ein additiver Daten- und Katalog-Job ist.
Keine i18n-Bibliothek in v1.

**Gegenposition — i18next o. Ä. von Anfang an:** Pluralregeln, Interpolation,
Sprachumschaltung gratis. **Verworfen, weil** v1 genau eine Sprache hat und der
Wizard kaum Plural-/Interpolationsbedarf — eine Bibliothek wäre totes Gewicht.
Die Vorgabe (ADR-004) verlangt die *Struktur*, nicht die Bibliothek; die
Struktur (Katalog + sprachfähige Datenfelder) ist das Migrationsfundament.

---

## Offene Punkte (bewusst nicht in Phase A entschieden)

- **Hosting-Ziel** (GitHub Pages vs. eigener Webspace): DoD verlangt nur den
  statischen Build; Entscheidung bei Deployment.
- **Persistenz im Wizard** (ADR-007, Gegenposition B): revisionieren nach
  erstem Nutzerfeedback.
- **Annex-III/IV-Heuristik-Tiefe**: Inhaltliche Festlegung der
  Selbstauskunfts-Fragen erfolgt beim Befüllen der Regeldaten, mit
  `review_status: pending` zur fachlichen Freigabe.
