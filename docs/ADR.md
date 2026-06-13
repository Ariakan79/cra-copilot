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

---

# Phase 2 — Cockpit (Aufnahme-Werkzeug)

Fachliche Wahrheitsquelle: `docs/AUFNAHME_LEITFADEN_SPEC.md`. Vier der folgenden
ADRs weichen bewusst von der Spec ab und sind mit **⚠ Spec-Abweichung** markiert —
mit der Freigabe gilt die entsprechende Spec-Anpassung als beauftragt.

---

## ADR-012 — Phase-2-Zuschnitt: Erfassung komplett, Generierung später

**Status:** akzeptiert (Director-Entscheidung 2026-06-12)

**Entscheidung:** Phase 2 liefert das Cockpit als vollständiges Erfassungswerkzeug:
Blöcke 0–8 als geführtes Interview, Evidenzknoten-Persistenz, Blockstatus-Ampeln,
Gap-Liste, SBOM-Profil-Export (YAML), Ergebnisbericht als Druckansicht (analog
Wizard, kein PDF-Service). **Nicht in Phase 2:** Generierung von Dokument-
Erstentwürfen (CVD-Policy, Support-Zeitraum-Erklärung) und alles Portal-seitige
(Ingestion, Monitoring, Meldeworkflow) — Phase 3.

**Konsequenz:** Die Abschluss-Artefakte 1–2 der Spec entstehen in Phase 2,
Artefakte 3–4 in Phase 3. Downstream-Mapping der Felder wird trotzdem ab sofort
als Daten gepflegt (ADR-016), damit Phase 3 keine Nacherfassung braucht.

---

## ADR-013 — Backend: Fastify + PostgreSQL + Drizzle ORM

**Status:** akzeptiert (Freigabe Director 2026-06-13)

**Entscheidung:** `apps/api` als Node/TS-Backend im Monorepo mit **Fastify**;
Persistenz **PostgreSQL** mit **Drizzle ORM** (Schema in TS, SQL-Migrationen
versioniert im Repo, `drizzle-zod` liefert die zod-Schemas der API-Verträge).
Die Regel-Engine wird als Workspace-Paket konsumiert — dieselbe Engine wie im
Wizard, nur in Bewertungstiefe (ADR-001, kein Methodik-Leak über eine
Zweitimplementierung).

**Gegenposition A — Express:** größtes Ökosystem. **Verworfen, weil** Fastify
TS-first ist und Schema-Validierung nativ integriert — wir validieren ohnehin
alles mit zod; Express bräuchte dafür Middleware-Eigenbau.

**Gegenposition B — NestJS:** vorgegebene Struktur, DI, skaliert personell.
**Verworfen, weil** ein internes Single-User-Werkzeug (ADR-014) keine
DI-Container und Dekorator-Magie rechtfertigt — „Einfachheit gewinnt".

**Gegenposition C — Prisma statt Drizzle:** reifere Migrations-Story, beste DX.
**Verworfen, weil** Prisma eine eigene Schema-DSL und Codegen-Engine mitbringt;
Drizzle bleibt bei TS + SQL (lesbar im Review), ist leichter und integriert
direkt mit zod. Risiko (jüngeres Projekt) akzeptiert, da das Datenmodell
schlank ist.

---

## ADR-014 — Betrieb Phase 2: lokal, Single-User, keine Auth

**Status:** akzeptiert (Director-Entscheidung 2026-06-12)

**Entscheidung:** Cockpit + API laufen auf dem Rechner des Gesprächsleiters
(localhost), PostgreSQL via `docker compose up` (eine `compose.yaml` im Repo).
Keine Authentifizierung in Phase 2; die API bindet ausschließlich an 127.0.0.1.
**Aber:** Das Datenmodell ist von Tag 1 mandantengetrennt (alle Tabellen tragen
`mandant_id`), damit der spätere Serverbetrieb (Portal, Phase 3) keine
Datenmigration erzwingt. Mandantendaten verlassen den Rechner nicht —
dasselbe Datenschutzargument wie beim Wizard, eine Ebene höher.

---

## ADR-015 — Evidenzknoten: append-only mit Supersession

**Status:** akzeptiert (Freigabe Director 2026-06-13)

**Entscheidung:** Der Evidenzknoten ist das zentrale Datenobjekt (Spec,
Grundprinzip 1). Schema:

- `id`, `mandant_id`, optional `produkt_id` (org-weite Knoten: ADR-017)
- `feld_id` — Referenz auf ein Katalogfeld (ADR-016)
- `wert` — strukturiert (JSON, gegen das Feldschema des Katalogs validiert);
  Freitext nur als ergänzendes `anmerkung`-Feld, nie als primäres Datum
- `quelle` — `{ art: kundenaussage_aufnahmegespraech | dokument | zertifikat |
  systempruefung, person, datum, gespraechsleiter }`
- `ersetzt_id` — Supersession-Kette: **Knoten werden nie geändert oder
  gelöscht**; eine Korrektur erzeugt einen neuen Knoten, der auf den ersetzten
  verweist. Aktueller Stand = Knoten ohne Nachfolger. „Unbekannt" und
  „existiert nicht" sind gültige, getrennte Wertausprägungen (Grundprinzip 2).

**Gegenposition A — mutable Zeilen + History-Tabelle:** einfacher zu queryen.
**Verworfen, weil** ein Compliance-Werkzeug eine beweisbare, lückenlose
Historie braucht — wer hat wann was auf welcher Grundlage gesagt. Genau das
verkaufen wir.

**Gegenposition B — volles Event-Sourcing:** maximale Auditierbarkeit.
**Verworfen, weil** Projektion/Replay-Infrastruktur für ein Erfassungswerkzeug
Overkill ist; append-only Knoten mit Supersession liefern dieselbe Garantie
mit normalem SQL.

---

## ADR-016 — Aufnahme-Katalog als versionierte Daten (`packages/aufnahme-katalog`)

**Status:** akzeptiert (Freigabe Director 2026-06-13)

**Entscheidung:** Die Blöcke 0–8 (Felder, Typen, Enums, Erläuterungen,
Annex-Referenzen, Gap-Regeln) liegen als versionierte YAML-Daten in einem
eigenen Paket — gleiches Muster wie das Regelwerk: zod-Validierung,
Strukturprüfung, `review_status`, `katalog-vX.Y`-Tags, Changelog. Jedes
Output-Feld deklariert seine **Downstream-Konsumenten** (Annex-VII-Doku,
Risikobewertung, CVD-Policy, Konformitätserklärung, SBOM-Profil); die
Strukturprüfung schlägt fehl, wenn ein Feld keinen Konsumenten hat —
„Felder ohne Konsument fliegen raus" (Spec, Grundprinzip 3) wird damit ein
ausführbarer Test. Die Annex-I-Teil-I-Anforderungsliste (Block 3) ist Teil
dieser Stammdaten (Spec, Cockpit-Verhalten Block 3).

**Gegenposition — Blöcke im Code / in der DB:** Code verletzt Grundprinzip 5
(Referenzen sind Daten); DB-Pflege verliert den Git-Review-Workflow mit
`review_status`, der sich beim Regelwerk bewährt hat. **Verworfen.**

---

## ADR-017 — Mandanten-Defaults mit Produkt-Override (Block 0, 4, 6)

**Status:** akzeptiert (Freigabe Director 2026-06-13) · **⚠ Spec-Abweichung**

**Entscheidung:** Felder, die beim typischen Kunden organisationsweit gelten
(Block 4 Schwachstellenmanagement-Prozess, Block 6 Build-Umgebung/Due-Diligence,
Block 0 ohnehin), werden auf Mandantenebene erfasst und gelten als Default für
alle Produkte; pro Produkt sind Overrides möglich (eigener Evidenzknoten mit
`produkt_id`). Der Katalog markiert pro Feld die Ebene:
`ebene: mandant | produkt | mandant_mit_override`.

**Warum Abweichung:** Die Spec führt Block 4/6 pro Produkt. Wörtlich umgesetzt
erfasst der Gesprächsleiter beim dritten Produkt denselben CVD-Prozess dreimal,
und bei einer Prozessänderung divergieren die Kopien. **Gegenposition — Spec
wörtlich (pro Produkt):** maximale Genauigkeit bei wirklich abweichenden
Produktlinien. **Verworfen**, weil der Override-Mechanismus genau diesen Fall
abdeckt, ohne den Normalfall zu verdreifachen.

---

## ADR-018 — SBOM-Profil: mehrere Streams pro Produkt, Pflichtfelder abgeleitet

**Status:** akzeptiert (Freigabe Director 2026-06-13) · **⚠ Spec-Abweichung**

**Entscheidung:** Das SBOM-Profil (Block 7) enthält eine **Liste von
SBOM-Streams** pro Produkt — Firmware, Cloud-Backend (entfernte
Datenverarbeitung!) und Companion-App sind getrennte Erzeugungspfade mit je
eigenem Format, Tool, CI-Job, Kanal und Heartbeat. Die `pflichtfelder` werden
**aus `konformitaetsziel` abgeleitet** (versionierte Stammdaten je Zielniveau,
z. B. BSI TR-03183-2) statt im Profil redundant gelistet; Abweichungen laufen
weiter über den `abweichungen`-Mechanismus der Spec.

**Warum Abweichung:** Das Spec-Profil ist 1:1 (`produkt_id` → ein Tool, ein
Kanal) und listet Pflichtfelder zusätzlich zum Zielniveau — redundant und beim
ersten IoT-Kunden (Gerät + Cloud + App) strukturell zu eng. **Gegenposition —
ein Profil pro Produkt, Varianten als eigene Produkte:** verworfen, weil
Block 1 die entfernte Datenverarbeitung ausdrücklich zum *selben* Produkt
zählt — sie als Kunstprodukt abzuspalten widerspräche der eigenen Methodik.

---

## ADR-019 — Gap-Lebenszyklus und getrennte Abschluss-Stati

**Status:** akzeptiert (Freigabe Director 2026-06-13) · **⚠ Spec-Abweichung (Teil 2)**

**Entscheidung:**

1. **Gap-Lebenszyklus:** Jede Lücke trägt einheitlich Priorität (abgeleitet aus
   Schadenspotenzial, überschreibbar mit Begründung), Verantwortlichen, Frist
   und Status `offen → in_arbeit → erledigt → verifiziert` (verifiziert nur
   durch den Gesprächsleiter). Blockstatus-Ampeln sind **abgeleiteter Zustand**
   aus Evidenzknoten + offenen Gaps (analog ADR-007: nie separat gespeichert,
   keine Inkonsistenz möglich).
2. **Abschluss-Stati getrennt:** `workshop_durchgefuehrt` (alle Blöcke
   bearbeitet, Bericht generierbar — auch mit Lücken, Spec Grundprinzip 4)
   und `onboarding_abgeschlossen` (erste profilkonforme SBOM-Lieferung im
   Portal). Phase 2 kann nur Ersteres setzen; Letzteres setzt das Portal in
   Phase 3. Geschäftsregeln (Abo-Beginn) hängen am zweiten Status.

**Warum Abweichung (Teil 2):** Die Spec definiert den Workshop als
abgeschlossen erst mit der SBOM-Lieferung — das koppelt den Projekterfolg des
Workshops an eine Kunden-Hausaufgabe von Wochen. **Gegenposition — Spec
wörtlich:** ein einziger, harter Abschlussbegriff. **Verworfen**, weil zwei
ehrliche Stati genau abbilden, was passiert ist, und der Abo-Trigger erhalten
bleibt.

---

# Phase 3 — Portal (SBOM-Ingestion & kontinuierliches Monitoring)

Fachliche Wahrheitsquelle: `docs/AUFNAHME_LEITFADEN_SPEC.md` (Block 7, Abschnitt
„Wichtige Trennung"). Director-Entscheidungen 2026-06-13: Zuschnitt
Ingestion + Monitoring (Meldeworkflow = Phase 4), Schwachstellenquelle OSV,
Betrieb self-hosted pro Kunde.

---

## ADR-020 — Phase-3-Zuschnitt: Ingestion + Monitoring, Meldeworkflow später

**Status:** festgezurrt (Director 2026-06-13)

**Entscheidung:** Phase 3 liefert: SBOM-Ingestion (Upload + maschineller
Kanal), Validierung der Lieferung gegen das Block-7-Profil, Heartbeat-
Überwachung der Lieferdisziplin, kontinuierlicher Schwachstellen-Abgleich gegen
OSV und eine Findings-Liste mit Triage. **Nicht in Phase 3:** der Melde-/
Eskalationsworkflow an ENISA/CSIRT (24h/72h, Art. 14) — das ist Phase 4.

**Konsequenz:** Findings tragen bereits einen Triage-Status und einen
Exploitability-Hinweis (ADR-027), damit Phase 4 darauf aufsetzen kann, ohne
nachzuerfassen. Die Findings-Daten sind die Eingabe des späteren Meldeworkflows.

---

## ADR-021 — Betrieb: self-hosted pro Kunde (Datenlokalität end-to-end)

**Status:** festgezurrt (Director 2026-06-13)

**Entscheidung:** Das Portal läuft in der Infrastruktur des Kunden (on-prem /
eigene Cloud), eine Instanz pro Kunde. Damit bleibt das „Ihre Daten bleiben
lokal"-Versprechen über die gesamte Produktlinie konsistent (Wizard client-only,
Cockpit lokal, Portal self-hosted).

**Konsequenzen:**
- **Keine zentrale Mandantentrennung nötig:** eine Instanz = ein Kunde. Das
  `mandant_id`-Modell aus Phase 2 bleibt erhalten (eine Instanz kann die
  mehreren Produktlinien *eines* Kunden tragen), aber es gibt keine
  cross-tenant-Isolationsanforderung. Auth wird dadurch einfacher (ADR-025).
- **Kein zentrales Abo/Monitoring beim Anbieter:** Der Abo-Trigger der Spec
  („Abo beginnt mit erster profilkonformer SBOM-Lieferung") wird als **Ereignis
  im Portal markiert** (`onboarding_abgeschlossen` auf dem Produkt, ADR-019),
  aber die kaufmännische Abrechnung liegt außerhalb des Portals (kein
  Phone-home). Das Ereignis ist exportierbar, nicht automatisch gemeldet.
- **OSV-Anbindung muss datenlokal sein** → ADR-022.
- Deployment-Artefakt: `docker compose` (Portal-API + Postgres + OSV-Sync), das
  der Kunde startet — Erweiterung der `compose.yaml` aus Phase 2.

---

## ADR-022 — Schwachstellenquelle OSV als lokaler Spiegel, Matching offline

**Status:** Quelle festgezurrt (Director 2026-06-13); Spiegel-Mechanik
vorgeschlagen — zur Freigabe

**Entscheidung:** Schwachstellendaten kommen von **OSV** (purl/package-basiert,
nah an CycloneDX). Das Portal **spiegelt die OSV-Datenbank lokal** (periodischer
Sync der per-Ökosystem-Exporte) und matcht die SBOM-Komponenten **offline**
gegen den Spiegel. Kein Per-Query-Aufruf an osv.dev mit der Komponentenliste.

**Begründung:** ADR-021 verlangt Datenlokalität. Ein Live-Batch-Query an
osv.dev würde die vollständige Abhängigkeitsliste des Kunden an einen Dritten
offenlegen — genau das, was das Produktversprechen ausschließt. Der einzige
ausgehende Verkehr ist der Download der öffentlichen OSV-Datenbank (enthält
keine Kundendaten).

**Gegenposition A — Live OSV-Batch-API (`/v1/querybatch`):** einfacher, immer
aktuell, kein lokaler Speicher. **Verworfen, weil** es die Komponentenliste
(= Architektur-Interna des Kundenprodukts) an osv.dev sendet — Bruch des
Datenlokalitäts-Versprechens (ADR-021). Inakzeptabel.

**Gegenposition B — kein Spiegel, sondern offline-Tool (z. B. osv-scanner als
Subprozess):** delegiert Matching an ein fertiges CLI. **Verworfen, weil** wir
das Matching gegen das **unveränderte, gespeicherte** SBOM kontinuierlich neu
fahren (Spec: ereignisgetriebene Erneuerung vs. kontinuierliche Neubewertung,
ADR-028) und die Findings mit Produktkontext anreichern (ADR-027) — das braucht
Kontrolle über den Matching-Schritt, nicht nur ein Scan-Ergebnis. Der OSV-Sync
selbst darf gern ein schlankes Tool nutzen; das Matching ist eigene Logik.

**Risiko:** OSV deckt proprietäre/Hardware-Komponenten schwächer ab (vom
Director akzeptiert). Mitigation: Das Findings-Modell erlaubt später weitere
Quellen (ADR-027 hält die Finding-Herkunft als Feld vor).

---

## ADR-023 — Portal teilt API & Domänenmodell; neue App `apps/portal`

**Status:** vorgeschlagen — zur Freigabe

**Entscheidung:** „Ein Backend, ein Domänenmodell, drei Oberflächen": Das Portal
ist **kein zweites Backend**. `apps/api` wird um Ingestion-/Monitoring-Endpunkte
und Auth (ADR-025) erweitert; `apps/portal` ist eine neue Svelte-App (kundensicht:
Lieferstatus, Findings, Heartbeat-Ampel). Profil, Evidenz, Produkte stammen aus
demselben Domänenmodell wie das Cockpit — das Portal liest das in Block 7
erfasste SBOM-Profil direkt.

**Gegenposition — eigenständiger Portal-Service:** klarere Trennung
Cockpit/Portal. **Verworfen, weil** beide auf demselben Produkt-/Profil-Modell
operieren; ein zweiter Service bedeutete Schema-Duplikation und Sync zwischen
zwei Datenbanken — genau die Methodik-/Modell-Duplikation, die ADR-001/023 für
das gesamte Produkt ausschließt. Self-hosted (ADR-021) heißt ohnehin eine
Instanz pro Kunde; ein Monolith mit klaren Modulen ist hier richtig.

---

## ADR-024 — Ingestion-Datenmodell: Lieferungen append-only, Komponenten & Findings

**Status:** vorgeschlagen — zur Freigabe

**Entscheidung:** Neue Tabellen (alle mit `mandant_id`/`produkt_id`):
- `sbom_lieferung` — **append-only** je Eingang: Roh-SBOM (als Blob/JSONB),
  Format+Version, Kanal, Trigger, Zeitstempel, `profil_konform` (Validierungs-
  ergebnis), `stream_name` (welcher Block-7-Stream). Nie überschreiben — die
  Lieferhistorie ist Nachweis (analog Evidenzknoten, ADR-015).
- `komponente` — die aus der jüngsten profilkonformen Lieferung extrahierten
  Komponenten (purl, name, version, lieferant) je Stream. Bei neuer Lieferung
  ersetzt (die SBOM-Erneuerung ist ereignisgetrieben, ADR-028).
- `finding` — Treffer aus dem OSV-Matching gegen die aktuellen Komponenten:
  Schwachstellen-ID, betroffene Komponente, Schweregrad, Quelle, Triage-Status,
  Exploitability-Hinweis, erste/letzte Sichtung. Kontinuierlich neu bewertet.

**Validierung der Lieferung** gegen das Block-7-Profil: Format/Version stimmt,
Pflichtfelder (aus `konformitaetsziel` abgeleitet, ADR-018) vorhanden,
Mindesttiefe plausibel. `profil_konform=false` → Lieferung wird gespeichert,
aber nicht als aktuelle Komponentenquelle übernommen; erzeugt eine Warnung.

**Gegenposition — Lieferungen überschreiben statt append-only:** spart Platz.
**Verworfen, weil** die Lieferhistorie (wann kam welches SBOM, war es konform)
selbst Compliance-Nachweis ist — dieselbe Begründung wie bei den Evidenzknoten.

---

## ADR-025 — Auth (self-hosted): Produkt-Ingestion-Tokens + einfache UI-Anmeldung

**Status:** vorgeschlagen — zur Freigabe

**Entscheidung:** Da eine Instanz = ein Kunde (ADR-021), keine Mandanten-
Isolation, aber zwei Zugänge:
- **Ingestion-Token je Produkt** (für CI): zufälliges Token, **nur als Hash
  gespeichert**, im Klartext einmalig bei Erstellung gezeigt. CI sendet es im
  `Authorization`-Header beim SBOM-Upload. Widerrufbar/rotierbar.
- **UI-Anmeldung**: ein einfaches Session-Login (Benutzer+Passwort, Passwort
  als Argon2-Hash) für das Kundenteam. Kein OIDC/Rollenmodell in Phase 3.

**Gegenposition A — gar keine UI-Auth (wie Cockpit, nur Netzwerkperimeter):**
**Verworfen, weil** das Portal kundensichtbare Schwachstellendaten zeigt und
übers Kundennetz erreichbar ist (nicht nur localhost wie das Cockpit) — ein
Minimal-Login ist Pflicht. Die Ingestion braucht ohnehin ein Maschinen-Credential.

**Gegenposition B — volles OIDC/SSO ab Phase 3:** integriert sich in
Kunden-IdP. **Verworfen für Phase 3 (nicht dauerhaft):** „Einfachheit gewinnt";
self-hosted-Kunden sind heterogen, ein erzwungenes OIDC vor erstem Feldfeedback
ist verfrüht. Session-Login ist später additiv durch OIDC ersetzbar.

**Sicherheit:** Tokens nur gehasht; Secrets nie ins Repo (CLAUDE.md-Regel);
Argon2 für Passwörter; das Ingestion-Token autorisiert nur Upload für *sein*
Produkt.

---

## ADR-026 — Heartbeat: geplante Prüfung der Lieferdisziplin (nicht CVE-Aktualität)

**Status:** vorgeschlagen — zur Freigabe

**Entscheidung:** Ein geplanter Job (Intervall konfigurierbar) prüft je Produkt/
Stream das Alter der jüngsten profilkonformen Lieferung gegen
`max_age_heartbeat_tage` aus dem Block-7-Profil. Überschreitung → Heartbeat-
Status `ueberfaellig` (UI-Ampel + Ereignis). Der Heartbeat überwacht **nur
Lieferdisziplin** — er sagt nichts über CVE-Aktualität (die läuft kontinuierlich,
ADR-028). Diese Trennung steht so in der Spec und wird hier 1:1 umgesetzt.

**Gegenposition — Heartbeat an CVE-Funde koppeln:** „kein neues SBOM, aber neue
CVEs → Alarm". **Verworfen, weil** die Spec beide bewusst trennt: ein
unverändertes Produkt braucht kein neues SBOM (ereignisgetrieben), während die
Neubewertung trotzdem läuft. Vermischung erzeugt Fehlalarme („liefere neu",
obwohl sich am Produkt nichts geändert hat).

---

## ADR-027 — Findings & Triage: kontinuierlicher Abgleich, Kontext-Hinweis, kein LLM-Urteil

**Status:** vorgeschlagen — zur Freigabe

**Entscheidung:**
- **Kontinuierlicher Abgleich:** Nach jedem OSV-Sync (und nach neuer Lieferung)
  werden die aktuellen Komponenten neu gegen den OSV-Spiegel gematcht. Neue
  Treffer → neue Findings; verschwundene Treffer (Komponente entfernt oder
  Advisory zurückgezogen) → Finding auf `behoben_durch_daten`.
- **Triage-Lebenszyklus** analog Gaps (ADR-019): `neu → in_pruefung →
  bestaetigt | nicht_relevant → behoben`. Übergänge validiert.
- **Exploitability-Hinweis aus Produktkontext:** Block 3 (`r_einsatzumgebung`,
  Angriffsoberfläche) liefert eine **Heuristik** „im Produktkontext plausibel
  exploitierbar?" als *Vorschlag* — die Spec nennt genau das („Einsatzumgebung
  steuert Exploitability-Vorschläge"). Es bleibt ein Hinweis; **die Bewertung
  trägt einen menschlichen Urheber** (Spec-Nicht-Ziel: keine automatische
  Risikobewertung, kein LLM-Urteil).
- **Finding-Herkunft** als Feld (`quelle: osv | …`), damit weitere Quellen
  später additiv andocken (ADR-022-Risiko-Mitigation).

**Gegenposition — Auto-Triage nach CVSS-Schwelle (z. B. ≥7 = bestätigt):**
spart Handarbeit. **Verworfen, weil** CVSS-Basiswert den Produktkontext
ignoriert (eine „kritische" CVE in einer nicht erreichbaren Komponente ist
irrelevant) und die Spec menschliche Urheberschaft jeder Bewertung verlangt.
CVSS wird angezeigt und sortiert, entscheidet aber nicht.

---

## ADR-028 — Trennung: SBOM-Erneuerung ereignisgetrieben, Neubewertung kontinuierlich

**Status:** vorgeschlagen — zur Freigabe (Umsetzung der Spec-Trennung)

**Entscheidung:** Im Portal sind zwei Takte strikt getrennt:
- **SBOM-Erneuerung = ereignisgetrieben:** Ein neues SBOM entsteht nur bei
  Produktänderung (Release/Hotfix/Dependency-Change) und kommt per Lieferung
  herein. Die `komponente`-Tabelle ändert sich nur dann (ADR-024).
- **Schwachstellen-Neubewertung = kontinuierlich:** Läuft gegen das
  **unveränderte** gespeicherte SBOM, getaktet durch den OSV-Sync — unabhängig
  davon, ob eine neue Lieferung kam.
- Der **Heartbeat** (ADR-026) überwacht ausschließlich, ob Lieferungen
  vereinbart-häufig eintreffen — nicht die CVE-Lage.

**Begründung:** Wörtliche Umsetzung der Spec („Wichtige Trennung"). Ohne diese
Trennung würde man entweder unnötige Neulieferungen verlangen oder neue CVEs an
unveränderten Produkten übersehen.
