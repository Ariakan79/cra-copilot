# Teststrategie — CRA-Copilot Phase 1

**Stand:** 2026-06-12 · **Status:** akzeptiert (Freigabe Director 2026-06-12)
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
| GC-04 | WLAN-Router (Privat- und Unternehmenskunden) | wichtig_klasse_1 |
| GC-05 | Firewall für Industrieumgebung | wichtig_klasse_2 |
| GC-06 | Desktop-/Server-Betriebssystem | wichtig_klasse_1 *(final, Entwurf 2022 sagte II)* |
| GC-07 | Hypervisor / Container-Runtime | wichtig_klasse_2 |
| GC-08 | PKI-/Zertifikatsaussteller-Software | wichtig_klasse_1 *(final, Entwurf 2022 sagte II)* |
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

---

## 7. Phase 2 — Cockpit & API (Ergänzung, akzeptiert 2026-06-13)

Der Leitgedanke bleibt: Domänenlogik trägt das Testgewicht, UI bekommt Smoke.
Neu ist die Persistenzschicht — dort testen wir gegen **echtes PostgreSQL**, nie
gegen ein Ersatz-Backend.

### 7.1 Katalog-Strukturtests (`packages/aufnahme-katalog`)

Gleiches Muster wie das Regelwerk (zod + Strukturprüfung als Test), plus die
Spec-Grundprinzipien als ausführbare Regeln:

- **Jedes Output-Feld hat ≥ 1 Downstream-Konsumenten** (Grundprinzip 3 —
  „Felder ohne Konsument fliegen raus" schlägt als Testfehler auf).
- Jedes Feld erlaubt die Verdikte „unbekannt" und „existiert nicht" als
  getrennte Werte, wo der Feldtyp das vorsieht (Grundprinzip 2).
- Jede Annex-Referenz ist versioniert, jeder Eintrag trägt `review_status`.
- Ebenen-Konsistenz (ADR-017): `mandant`-Felder liegen nicht in produktspezifischen
  Blöcken; Block 0 enthält keine `produkt`-Felder.

### 7.2 Domänen-Invarianten (Vitest + fast-check, gegen Postgres)

| # | Invariante |
|---|---|
| D1 | Supersession-Ketten sind azyklisch und linear: je Feld/Kontext genau ein Knoten ohne Nachfolger (aktueller Stand) |
| D2 | Evidenzknoten sind unveränderlich: UPDATE/DELETE auf Knoten schlägt fehl (DB-Constraint/Trigger, als Test verifiziert) |
| D3 | Blockstatus-Ampel ist reine Funktion aus (Evidenzknoten, offenen Gaps) — zweimal berechnen ⇒ identisch; kein gespeicherter Ampelwert |
| D4 | Gap-Statusübergänge folgen `offen → in_arbeit → erledigt → verifiziert`; unzulässige Übergänge werden abgelehnt |
| D5 | Override-Auflösung (ADR-017): Produkt-Knoten verdeckt Mandanten-Default; ohne Override gilt der Default; Löschen des Overrides (Supersession auf „zurück auf Default") reaktiviert den Default |
| D6 | `workshop_durchgefuehrt` ist genau dann setzbar, wenn alle Blöcke Status ≠ `nicht_bearbeitet` haben (auch „mit Lücken" zählt) |

### 7.3 API-Tests

- Vitest gegen die laufende Fastify-App mit **Testcontainers-PostgreSQL**
  (pro Testlauf frische DB, Migrationen laufen im Test — das testet die
  Migrationskette gleich mit).
- Golden-Aufnahme: ein Fixture-Mandant („Musterfirma IoT GmbH", 2 Produkte,
  geteilte CVD-Policy als Mandanten-Default, Produkt 2 mit Override) wird per
  API durch alle Blöcke geführt; erwartet: definierter Gap-Report,
  Blockstatus-Ampeln, SBOM-Profil-Export (YAML, 2 Streams bei Produkt 1).
  Fixtures als YAML — Director-reviewbar wie Golden Cases.
- Kein Auth-Testbedarf in Phase 2 (ADR-014), aber ein Test verifiziert
  Binding an 127.0.0.1.

**Gegenposition — SQLite/in-memory für Tests:** schneller, kein Docker.
**Verworfen, weil** Dialekt-Drift (JSONB, Constraints, Trigger aus D2) genau
die Fehlerklasse ist, die wir testen wollen; Testcontainers hält den Lauf
unter einer Minute.

### 7.4 Cockpit-E2E (Playwright, Smoke)

Wie beim Wizard bewusst schmal: Aufnahme anlegen → einen Block ausfüllen
(inkl. „unbekannt"-Antwort ⇒ Gap erscheint) → Ampel prüfen → Korrektur einer
Antwort (Supersession sichtbar in der Historie) → Profil-Export lädt herunter →
Bericht-Druckansicht rendert. Gegen echte API + Testcontainers-Postgres.

### 7.5 CI-Erweiterung

Bestehende Pipeline + ein Job mit Docker-in-CI (GitHub Actions unterstützt
Testcontainers nativ). Engine-/Wizard-Jobs bleiben unverändert schnell.

---

## 8. Phase 3 — Portal (Ingestion & Monitoring, akzeptiert 2026-06-13)

Leitgedanke unverändert: Domänenlogik trägt das Testgewicht. Neu ist
externer-Daten-Abgleich (OSV) — dafür wird ein **lokales OSV-Fixture**
verwendet, nie das Live-osv.dev (ADR-022: datenlokal; im Test zusätzlich
deterministisch und offline).

### 8.1 Ingestion & Profil-Validierung (Vitest + Testcontainers-Postgres)

- **Golden-Lieferungen** als Fixtures: echte CycloneDX- und SPDX-SBOMs (klein,
  je 3–5 Komponenten) — director-/reviewbar wie die Golden Cases.
- Validierung gegen das Block-7-Profil: Format/Version passt, abgeleitete
  Pflichtfelder vorhanden, Mindesttiefe plausibel ⇒ `profil_konform`.
- Invarianten:
  - I1 **Lieferungen append-only:** mehrere Uploads → alle Zeilen bleiben; die
    Komponenten spiegeln die *jüngste profilkonforme* Lieferung.
  - I2 Nicht-konforme Lieferung wird gespeichert, ändert aber die Komponenten
    nicht und erzeugt eine Warnung.
  - I3 Komponenten-Extraktion: purl/name/version je Stream korrekt; mehrere
    Streams (Firmware + Cloud) bleiben getrennt.
  - I4 Ingestion-Token: falsches/fehlendes Token ⇒ 401; Token autorisiert nur
    sein eigenes Produkt (kein Cross-Produkt-Upload).

### 8.2 OSV-Matching & Findings (Vitest, lokales OSV-Fixture)

- **OSV-Fixture**: eine Handvoll Advisories als lokale JSON (purl-Ranges), die
  einen Teil der Golden-Komponenten treffen.
- M1 Match: betroffene Komponente (purl + Versionsbereich) ⇒ Finding mit
  Schweregrad und Quelle `osv`.
- M2 **Kontinuierliche Neubewertung gegen unverändertes SBOM** (ADR-028): neues
  Advisory im Spiegel ⇒ neues Finding ohne neue Lieferung.
- M3 Rückzug/Behebung: Advisory entfällt oder Komponente verschwindet ⇒ Finding
  `behoben_durch_daten` (offene, unbearbeitete Findings verschwinden; bearbeitete
  bleiben — analog Gap-Logik ADR-019/027).
- M4 Triage-Übergänge `neu → in_pruefung → bestaetigt|nicht_relevant → behoben`;
  unzulässige Übergänge abgelehnt.
- M5 Exploitability-Hinweis: bei `r_einsatzumgebung = isoliert` schlägt die
  Heuristik „eingeschränkt exploitierbar" vor, bei `internet_exponiert`
  „erhöht" — **als Vorschlag**, ohne automatische Bewertung (Spec-Nicht-Ziel).

### 8.3 Heartbeat (Vitest)

- H1 Lieferung jünger als `max_age_heartbeat_tage` ⇒ Status `aktuell`.
- H2 Älter ⇒ `ueberfaellig` (mit fixierter „jetzt"-Zeit, deterministisch).
- H3 Heartbeat ignoriert die CVE-Lage (neue Findings ohne neue Lieferung ändern
  den Heartbeat nicht — ADR-026/028-Trennung).

### 8.4 Portal-E2E (Playwright, Smoke)

Gegen echte API + Testcontainers-Postgres + OSV-Fixture, via global-setup wie
beim Cockpit: Login → SBOM per Token hochladen → Lieferung als konform sehen →
Findings-Liste erscheint → ein Finding triagieren → Heartbeat-Ampel prüfen.
Plus: ein Test verifiziert, dass **kein** Request an ein osv.dev-Origin geht
(Datenlokalität als ausführbare Zusicherung, analog ADR-002 beim Wizard).

### 8.5 CI

Der `integration`-Job deckt das Portal mit ab (Docker vorhanden). Der OSV-Sync
selbst (Netzzugriff) läuft **nicht** in CI/Tests — Tests nutzen das Fixture; der
Sync hat einen eigenen, manuell/skriptgetriebenen Smoke außerhalb der Pipeline.

---

## 9. Phase 4 — Meldeworkflow (akzeptiert 2026-06-13)

Leitgedanke unverändert. Schwerpunkt: Eröffnung, Fristenberechnung,
Einreichungs-Audit. Zeitbezogene Tests nutzen eine **fixierte „jetzt"-Zeit**
(deterministisch, kein Echtzeit-Warten).

### 9.1 Eröffnung eines Meldevorgangs (Vitest + Testcontainers-Postgres)

- R1 Aus Finding: ein als „aktiv ausgenutzt" eingestuftes Finding eröffnet einen
  Vorgang `art=schwachstelle` mit `quelle_finding_id`; ohne diese Einstufung
  entsteht **kein** Vorgang (ADR-034 — `bestaetigt` allein reicht nicht).
- R2 Freie Vorfallmeldung: Vorgang `art=vorfall` ohne Finding lässt sich eröffnen.
- R3 Triage-Trennung: ein Finding kann `bestaetigt` sein, ohne dass ein
  Meldevorgang existiert.

### 9.2 Fristenberechnung & Überfälligkeit (deterministisch)

- R4 Frühwarnung = eröffnet + 24 h, Meldung = eröffnet + 72 h.
- R5 Abschluss (Schwachstelle) = `korrekturmassnahme_ab` + 14 Tage; (Vorfall) =
  Einreichung der Meldung + 1 Monat.
- R6 Überfällig = Frist < jetzt und Stufe nicht eingereicht — reine Funktion aus
  (Vorgang, jetzt); eingereichte Stufe ist nie überfällig.
- R7 Fristwerte stammen aus den versionierten Meldungsdaten (ADR-033), nicht aus
  Code-Konstanten (ein Test prüft die Herkunft).

### 9.3 Einreichung & Audit (Append-only)

- R8 Stufe einreichen setzt `eingereicht_am/von/inhalt`; danach ist die Stufe
  unveränderlich (DB-Trigger — UPDATE/DELETE schlägt fehl, analog Evidenz/Lieferung).
- R9 Entwurfserzeugung: je Stufe/Typ wird ein strukturierter Entwurf aus den
  versionierten Feldvorlagen + Vorgangsdaten erzeugt (Pflichtfelder vorhanden).

### 9.4 Eskalation

- R10 Überfällige Stufe liefert die Eskalationskontakte aus der Block-4-Evidenz
  (`s_meldung_csirt_zustaendig` u. a.), nicht aus portal-eigenen Feldern.

### 9.5 Portal-E2E (Playwright, Ergänzung)

Im bestehenden Portal-E2E: Finding als „aktiv ausgenutzt" einstufen → Meldevorgang
erscheint mit 24h/72h-Fristen → Frühwarnung-Entwurf öffnen → als eingereicht
markieren → Stufe ist gesperrt. Plus weiterhin „kein automatischer Outbound an
osv.dev/ENISA" (Datenlokalität, ADR-021/030).

### 9.6 CI

Im bestehenden `integration`-Job mitgedeckt; keine neuen externen Abhängigkeiten
(kein Echt-Versand an Behörden in Tests).
