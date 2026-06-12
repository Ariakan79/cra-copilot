# Teststrategie — CRA-Copilot Phase 1

**Stand:** 2026-06-12 · **Status:** zur Freigabe (Phase B)
**Bezug:** ADR-001 (Engine pur), ADR-002 (client-seitig), ADR-008 (Teststack),
ADR-010 (Regeldaten-Validierung).

**Leitgedanke:** Die Regel-Engine ist das Produkt; die UI ist eine dünne Schale.
Entsprechend liegt das Testgewicht auf der Engine (Golden Cases + Invarianten +
Datenvalidierung), die UI bekommt schlanke Smoke-Tests — kein UI-Test-Maximalismus.

---

## 1. Golden Cases (table-driven, Engine)

**Mechanik:** Jeder Fall ist eine YAML-Datei in
`packages/rules-engine/tests/golden/` — lesbar für den Director, der den Katalog
reviewt und erweitert, ohne Code anzufassen:

```yaml
id: GC-01
titel: Passwortmanager (B2C, EU-Vertrieb)
review_status: pending          # fachliche Erwartung vom Director freizugeben
antworten:                      # vollständiger Wizard-Durchlauf als Antwort-Objekt
  rolle: hersteller
  produkt_digital: ja
  # …
erwartung:
  geltungsbereich: in_scope     # in_scope | ausserhalb | ausgenommen
  kategorie: wichtig_klasse_1
  begruendungspfad_enthaelt: [annex_iii_passwortmanager]   # Regel-IDs
  pflichten_stichprobe:         # keine Vollaufzählung — gezielte Anker
    - id: meldepflicht_aktiv_ausgenutzte_schwachstelle
      frist: 2026-09
    - id: ce_kennzeichnung
      frist: 2027-12
```

Ein einziger table-driven Vitest-Test lädt alle Dateien und prüft jede Erwartung.
Neuer Fall = neue Datei, kein Testcode. Fälle mit `review_status: pending` laufen
mit — ein separater Report listet sie, damit nichts unreviewt in `rules-v0.1` geht.

**Fallkatalog v1 (26 Fälle).** Die erwarteten Kategorien sind meine fachliche
Ersteinschätzung nach Annex III/IV — **alle `review_status: pending`**, Director
prüft frei:

| ID | Konstellation | Erwartung |
|---|---|---|
| GC-01 | Passwortmanager (B2C) | wichtig_klasse_1 |
| GC-02 | Smart-Home-Hub mit Sicherheitsfunktion (Schloss, Alarm) | wichtig_klasse_1 |
| GC-03 | Smart-Home-Sprachassistent | wichtig_klasse_1 |
| GC-04 | Consumer-WLAN-Router | wichtig_klasse_1 *(Abgrenzung zu Klasse II bitte prüfen)* |
| GC-05 | Firewall für Industrieumgebung | wichtig_klasse_2 |
| GC-06 | Desktop-/Server-Betriebssystem | wichtig_klasse_2 |
| GC-07 | Hypervisor / Container-Runtime | wichtig_klasse_2 |
| GC-08 | PKI-/Zertifikatsaussteller-Software | wichtig_klasse_2 |
| GC-09 | Manipulationssicherer Mikrocontroller | wichtig_klasse_2 |
| GC-10 | Smart-Meter-Gateway | kritisch (Annex IV) |
| GC-11 | Smartcard / Secure Element | kritisch (Annex IV) |
| GC-12 | Hardware-Gerät mit Security Box (HSM) | kritisch (Annex IV) |
| GC-13 | ERP-Software on-premise | default |
| GC-14 | Offline-Desktopanwendung ohne jede Datenverbindung | ausserhalb (keine Datenverbindung) |
| GC-15 | B2B-SaaS ohne Produktcharakter (reine Dienstleistung) | ausserhalb |
| GC-16 | Cloud-Backend als entfernte Datenverarbeitung eines IoT-Geräts | in_scope, Teil des Produkts (Kategorie folgt Produkt) |
| GC-17 | Reines OSS-Projekt ohne Kommerzialisierung | ausserhalb |
| GC-18 | OSS mit kommerzieller Verwertung (Support / Dual-License) | in_scope, default, Rolle hersteller |
| GC-19 | OSS-Foundation als Steward | in_scope, Sonderregime os_steward |
| GC-20 | Software als Medizinprodukt (MDR) | ausgenommen (sektorales Regime) |
| GC-21 | Kfz-Steuergerät (UNECE R155) | ausgenommen |
| GC-22 | Vernetztes Spielzeug mit Chatfunktion | wichtig_klasse_1 |
| GC-23 | Fitness-Wearable mit Gesundheitsmonitoring | wichtig_klasse_1 |
| GC-24 | Importeur eines Nicht-EU-Smart-Locks | wichtig_klasse_1, Pflichtenkatalog Importeur |
| GC-25 | Antivirus / Endpoint Protection | wichtig_klasse_1 |
| GC-26 | VPN-Client | wichtig_klasse_1 |

Der Katalog deckt ab: alle vier Kategorien, beide Out-of-Scope-Arten (außerhalb
vs. ausgenommen — getrennte Verdikte, vgl. Spec-Grundprinzip 2), die
Remote-Datenverarbeitungs-Falle (GC-15 vs. GC-16 als Gegensatzpaar), die drei
OSS-Konstellationen aus der Spec und eine Nicht-Hersteller-Rolle (GC-24).

## 2. Property-based Tests (fast-check, Engine)

Invarianten über zufällig generierte gültige und teilgültige Antwortmengen:

| # | Invariante | Warum |
|---|---|---|
| P1 | **Terminierung:** Jede Antwortsequenz erreicht in ≤ N Schritten ein Ergebnis oder eine nächste Frage; nie ein Zyklus | Wizard darf nie hängen |
| P2 | **Totalität:** Die Engine wirft auf keiner gültigen (Teil-)Antwortmenge; Ergebnis ist immer Kategorie, Out-of-Scope-Verdikt oder nächste Frage | Keine Sackgassen |
| P3 | **Begründungspfad:** Jedes Klassifizierungsergebnis hat einen nicht-leeren Pfad; jede referenzierte Regel-ID existiert im Katalog | Spec: keine Bewertung ohne Begründung |
| P4 | **Erreichbarkeit:** Jede Frage des Katalogs ist durch mindestens eine Antwortkombination erreichbar | Tote Fragen = tote Daten |
| P5 | **Determinismus:** Gleiche Antworten ⇒ identisches Ergebnis (Engine ist pur); Antwort entfernen und identisch neu setzen ⇒ identisches Ergebnis | Absicherung ADR-007 (Zurück-Navigation) |
| P6 | **Pflichten-Konsistenz:** Jede ausgegebene Pflicht trägt Artikel-Referenz und Zeithorizont; Pflichtenmenge ist Funktion von (Kategorie, Rolle), nie leer bei in_scope | Kein Pflichtenkatalog ohne Quelle |

P4 ist faktisch ein statischer Daten-Check, läuft aber als Property über den
Regeldaten — so schlägt er auch bei künftigen `rules-v0.x`-Ständen automatisch an.

## 3. Regeldaten-Validierung (Build & Test)

- zod-Schema (ADR-010) validiert Struktur bei jedem Build: Pflichtfelder,
  Enum-Werte, `rules_version` vorhanden.
- Strukturprüfungen als Engine-Funktion + Test: alle Fragen-/Regel-Referenzen
  auflösbar, keine Zyklen im Fragengraph, jedes Textfeld hat `de`, jede
  inhaltliche Aussage hat `review_status`.
- CI-Report: Anzahl `review_status: pending` — Gate für `rules-v0.1`-Tag ist
  **0 pending** (Director-Freigabe vollständig).

## 4. Wizard-E2E (Playwright, Smoke)

Bewusst schmal — ein Spec-File, gegen den **gebauten** statischen Output
(`vite preview`), Chromium reicht in v1:

1. **Ein Durchlauf pro Ergebnistyp** (default, Klasse I, Klasse II, kritisch,
   außerhalb, ausgenommen — je ein Golden Case als Drehbuch): durchklicken bis
   Ergebnisseite, Kategorie + Begründungspfad + Fristen sichtbar.
2. **Keine externen Requests:** Request-Interception bricht den Test bei jedem
   Request ab, der nicht vom Preview-Origin kommt — das ADR-002-Versprechen als
   ausführbarer Test (DoD-Kriterium).
3. **Zurück-Navigation:** Antwort ändern ⇒ abhängige Folgeantworten sind
   verworfen, Fortschritt korrekt (ADR-007-Semantik in der UI).
4. **Druckansicht:** Ergebnisseite unter `media: print` rendert, zentrale
   Elemente vorhanden (kein Pixel-Vergleich).
5. **A11y-Smoke:** ein axe-Scan auf Frage- und Ergebnisseite, nur
   `critical`-Verstöße schlagen fehl (Laienzielgruppe; bewusst kein volles Audit).

Nicht getestet auf E2E-Ebene: jede Fragenkombination (das leisten Golden Cases +
Properties in der Engine — die UI rendert nur, was die Engine sagt).

## 5. CI (GitHub Actions)

Ein Workflow `ci.yml`, läuft auf PRs und `main`-Pushes:

```
pnpm install (frozen lockfile, Cache)
→ lint (ESLint + Prettier-Check)
→ typecheck (tsc --strict, beide Workspaces)
→ test (Vitest: Unit + Golden + Properties + Datenvalidierung)
→ build (rules-engine, dann wizard)
→ e2e (Playwright gegen vite preview)
```

Node-Version aus `.nvmrc`. Alles blockierend — „Commit nur bei grünem Teststand"
gilt identisch lokal und in CI. Coverage wird reportet (Vitest), aber in v1 nicht
als Prozent-Gate erzwungen — die Properties + 26 Golden Cases decken die Engine
strukturell ab; ein Zahlen-Gate käme erst, wenn Engine-Code ohne Datenbezug wächst.

## 6. Was bewusst nicht getestet wird (v1)

- **Visuelle Regression / Screenshots** — UI ist dünn, Aufwand übersteigt Nutzen.
- **Browser-Matrix** (Firefox/WebKit) — statisches HTML + Svelte-Output ist
  risikoarm; nachrüstbar mit einer Zeile Playwright-Config, falls Felddaten
  Probleme zeigen.
- **Lasttests** — statische Site ohne Backend.
- **Fachliche Korrektheit der CRA-Einstufungen** — die sichert kein Test, sondern
  das `review_status`-Verfahren mit Director-Freigabe; Tests sichern nur, dass
  die Engine die freigegebenen Daten korrekt anwendet.
