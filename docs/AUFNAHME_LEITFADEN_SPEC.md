# Aufnahme-Leitfaden — Spezifikation für das Cockpit-Modul

**Zweck:** Strukturiertes Interview pro Produkt, geführt im Workshop. Jede Antwort wird
als Evidenzknoten persistiert (Quelle: "Kundenaussage Aufnahmegespräch", Datum, Person,
Gesprächsleiter). Output: vollständiger Stammdatensatz + SBOM-Profil + Gap-Liste +
Hausaufgabenkatalog. Der Workshop ist abgeschlossen, wenn die erste profilkonforme
SBOM-Lieferung im Portal eingegangen ist.

**Grundprinzipien für die Cockpit-Implementierung:**

1. **Evidenz statt Freitext.** Jede Frage hat definierte Output-Felder (enum, strukturiert,
   referenzierbar). Freitext nur als Ergänzung, nie als primäres Datum.
2. **Lücken sind First-Class.** "Unbekannt" und "existiert nicht" sind gültige, getrennte
   Antworten. Jede Lücke erzeugt automatisch einen Eintrag in der Gap-Liste mit
   Annex-Referenz und Verantwortlichem.
3. **Downstream-Mapping ist Pflicht.** Jedes Output-Feld deklariert, welches generierte
   Dokument es konsumiert (Annex VII technische Doku, Risikobewertung, CVD-Policy,
   Konformitätserklärung, SBOM-Profil). Felder ohne Konsument fliegen raus.
4. **Blockstatus als Ampel.** Pro Block: vollständig / mit Lücken / nicht bearbeitet.
   Bericht generierbar ab "alle Blöcke bearbeitet", auch mit Lücken.
5. **Regulatorische Referenzen versioniert.** Artikel- und Annex-Verweise sind Daten,
   nicht Code — harmonisierte Normen sind in Entwicklung, Templates müssen
   nachziehen können, ohne Migration.

---

## Block 0 — Mandant & Rollen *(einmal pro Kunde, nicht pro Produkt)*

**Ziel:** Rechtliche Identität und Rolle in der Lieferkette festlegen — davon hängt der
gesamte Pflichtenkatalog ab.

**Fragen / Output-Felder:**
- Firmenidentität: Name, Rechtsform, Sitz, handelnde Personen, Compliance-Verantwortlicher
- Rolle(n) je Produktlinie: `hersteller | importeur | haendler | os_steward | auftragsfertiger`
  — Mehrfachrollen möglich, pro Produkt in Block 1 verfeinert
- Bestehende Managementsysteme & Zertifikate: ISO 27001, IEC 62443, TISAX, BSI-Grundschutz
  → jedes Zertifikat als wiederverwendbarer Evidenzknoten (Scope, Gültigkeit, Auditor)
- Bestehende Produktzertifizierungen (CC, FIPS, branchenspezifisch)
- Unternehmensgröße (Kleinst-/Klein-/Mittelunternehmen) → relevante Erleichterungen

**Downstream:** Konformitätserklärung (Identität), technische Doku (Herstellerangaben),
Risikobewertung (vorhandene Prozessreife als mitigierender Faktor).

---

## Block 1 — Produktabgrenzung & Inverkehrbringen

**Ziel:** Den Produktbegriff sauber schneiden. Häufigster Kundenfehler: Remote-Komponenten
und Begleitsoftware werden vergessen.

**Fragen / Output-Felder:**
- Produktname, aktuelle Versionen, Varianten/Editionen (jede Variante = eigenes Produkt
  im Datenmodell oder begründet zusammengefasst)
- Produktumfang: Hardware-Anteil, lokale Software, **entfernte Datenverarbeitung, die
  für die Produktfunktion erforderlich ist** (zählt zum Produkt!), Companion-Apps,
  mitgelieferte Bibliotheken
- Inverkehrbringen: bereits in der EU am Markt? Geplanter Zeitpunkt? Vertriebswege?
- Geplante wesentliche Änderungen (lösen Neubewertung aus)
- Open-Source-Konstellation: rein kommerziell / OSS mit kommerzieller Verwertung /
  reiner OSS-Beitrag → Rollenverfeinerung aus Block 0
- Abgrenzung zu ausgenommenen Bereichen (Medizinprodukte, Kfz, Luftfahrt — eigene Regime)

**Downstream:** Klassifizierung (Block 2), technische Doku (Produktbeschreibung),
Betroffenheitsmatrix.

---

## Block 2 — Klassifizierung & Konformitätsroute

**Ziel:** Wizard-Ergebnis verifizieren und verbindlich machen. Der Wizard ist Selbstauskunft;
hier wird mit Fachblick gegengeprüft.

**Fragen / Output-Felder:**
- Kategorie: `default | wichtig_klasse_1 | wichtig_klasse_2 | kritisch` mit
  Begründungspfad (welche Annex-III/IV-Position greift oder warum keine)
- Konformitätsbewertungsroute: interne Kontrolle (Modul A) / EU-Baumusterprüfung /
  umfassende QS / Zertifizierung — abgeleitet, nicht frei wählbar
- Geplante Anwendung harmonisierter Normen (sobald verfügbar) vs. Eigenbewertung
- Zieltermine: Meldepflichten-Readiness, volle Konformität

**Cockpit-Verhalten:** Regel-Engine schlägt Klassifizierung aus Block-1-Daten vor,
Gesprächsleiter bestätigt oder überschreibt mit Begründung (Override wird als
Evidenzknoten mit Begründungstext persistiert).

**Downstream:** Pflichtenkatalog, Konformitätserklärung, Projektplan des Kunden.

---

## Block 3 — Einsatzumgebung & Risikokontext *(Fundament der Risikobewertung, Annex I Teil I)*

**Ziel:** Die Informationen erheben, die kein Scanner liefern kann — bestimmungsgemäße
Verwendung und Bedrohungskontext. Qualitativ der wertvollste Block.

**Fragen / Output-Felder:**
- Bestimmungsgemäße Verwendung (ein Satz, kundenbestätigt) + vernünftigerweise
  vorhersehbare Verwendung und Fehlanwendung
- Einsatzumgebung: `internet_exponiert | unternehmensnetz | isoliert | feldgeraet | cloud`
  (Mehrfachauswahl), typische Betreiberprofile
- Verarbeitete Datenkategorien: personenbezogen / besondere Kategorien / Betriebsgeheimnisse /
  Steuerungsdaten → Schadenspotenzial-Einstufung
- Angriffsoberflächen-Inventar: Netzwerkdienste, lokale Schnittstellen, Funk (relevant für
  spätere Findings-Triage: "exploitierbar im Produktkontext?")
- Sicherheitsfunktions-Assessment gegen Annex I Teil I — pro Anforderung (sichere
  Default-Konfiguration, Zugriffskontrolle, Kryptografie/Datenschutz, Integritätsschutz,
  Datenminimierung, Verfügbarkeit/Resilienz, Schnittstellenminimierung, Update-Mechanismus,
  Logging, …): Status `erfuellt | teilweise | nicht_erfuellt | nicht_anwendbar` + Nachweisreferenz
  + bei nicht_anwendbar: Begründung (Pflichtfeld)

**Cockpit-Verhalten:** Anforderungsliste Annex I Teil I als versionierte Stammdaten der
Regel-Engine. Jeder Status ≠ erfüllt erzeugt Gap-Eintrag mit Priorität aus Schadenspotenzial.

**Downstream:** Risikobewertung (Kernstück), technische Doku, Triage-Heuristiken des
Portals (Einsatzumgebung steuert Exploitability-Vorschläge).

---

## Block 4 — Schwachstellenmanagement-Prozess *(Annex I Teil II)*

**Ziel:** Den gelebten (oder fehlenden) Prozess erfassen. Hier entstehen die meisten
Hausaufgaben.

**Fragen / Output-Felder:**
- CVD-Policy: vorhanden? Veröffentlicht? Kontaktstelle (security.txt, E-Mail)?
  → falls fehlt: Generierung aus Template als Hausaufgabe mit Frist
- Interner Prozess: Wer triagiert? SLAs nach Schweregrad? Dokumentationsort?
- Update-/Patch-Verteilung: Mechanismus (auto/manuell), Reichweite (erreichen Updates
  alle Bestandsgeräte?), **Sicherheitsupdates kostenlos und getrennt von
  Funktionsupdates möglich?**
- Meldefähigkeit: Wie würde aktive Ausnutzung erkannt (Telemetrie, Kundenmeldung,
  Researcher)? Eskalationsweg bis zur Geschäftsführung? Wer meldet an ENISA/CSIRT?
- Erreichbarkeit der 24h-Frühwarnung im Ernstfall: realistisch ja/nein + Maßnahmen

**Downstream:** CVD-Policy-Dokument, Prozessbeschreibung für technische Doku,
Meldeworkflow-Konfiguration im Portal (Eskalationskontakte, Vertretungsregeln).

---

## Block 5 — Support-Zeitraum & Lebenszyklus

**Ziel:** Die Festlegung, die der Kunde am liebsten vermeiden würde, verbindlich machen.

**Fragen / Output-Felder:**
- Support-Zeitraum pro Produkt: Festlegung in Jahren mit Begründung — Default-Erwartung
  ist die erwartete Nutzungsdauer, mindestens aber der regulatorische Rahmen
  (Richtwert 5 Jahre); kürzere Festlegung nur mit dokumentierter Begründung
- Versionspolitik: Welche Branches erhalten Sicherheitsupdates? Backport-Strategie?
- EOL-Kommunikation: Wie und wann werden Nutzer informiert? Was passiert mit
  Bestandsgeräten nach EOL?
- Ersatzteil-/Abkündigungslogik bei Hardware-Anteilen

**Downstream:** Support-Zeitraum-Erklärung (kundensichtbares Dokument), technische Doku,
Portal-Konfiguration (Monitoring endet nicht vor Support-Ende → Abo-Laufzeit-Argument).

---

## Block 6 — Lieferkette & Komponenten

**Ziel:** Sorgfaltspflichten gegenüber Zulieferern und die Build-Realität erfassen —
Vorbereitung für das SBOM-Profil.

**Fragen / Output-Felder:**
- Komponentenherkunft: Eigenentwicklung / kommerzielle Drittkomponenten / OSS —
  grobe Anteile, kritische Abhängigkeiten benennen
- Due-Diligence-Praxis bei Drittkomponenten: Auswahlkriterien, Sicherheitszusagen
  der Lieferanten, Weitergabe von Schwachstelleninfos vertraglich geregelt?
- Build-Umgebung: CI-System, Reproduzierbarkeit, Signierung von Artefakten
- Bekannte Altlasten: unmaintainte Abhängigkeiten, gepinnte Uralt-Versionen,
  Vendored Code (wichtig für realistische Triage-Erwartung)

**Downstream:** SBOM-Profil (Block 7), Risikobewertung (Lieferkettenrisiken),
technische Doku.

---

## Block 7 — SBOM-Profil *(maschinenlesbarer Output, JSON/YAML)*

**Ziel:** Der technische Handshake zwischen Workshop und Portal. Pro Produkt ein
Profil, gegen das die Ingestion validiert.

**Profilfelder:**
```yaml
produkt_id: ...
format: cyclonedx | spdx          # inkl. Versionsangabe
konformitaetsziel: bsi_tr_03183_2 # Zielniveau; Abweichungen unten begründet
mindesttiefe: vollstaendig_transitiv | top_level_plus_known_critical
pflichtfelder: [lieferant, name, version, eindeutige_id, abhaengigkeitsbeziehung, ersteller, zeitstempel]
erzeugung:
  tool: syft | trivy | cdxgen | eigenbau
  ci_job: <referenz>
  verantwortlich: <person/rolle>
lieferung:
  kanal: ci_webhook | api_token | manueller_upload
  trigger: [release, hotfix, dependency_change]
  max_age_heartbeat_tage: 90      # Bestätigung oder Neulieferung, sonst Eskalation
abweichungen:
  - feld: ...
    begruendung: ...
    befristet_bis: ...
```

**Cockpit-Verhalten:** Profil wird im Gespräch ausgefüllt, Plausibilitätsprüfung gegen
Block 6 (z. B. "manueller Upload" bei vorhandener CI → Rückfrage). Export als Datei +
Hausaufgabenpaket: konkreter Tool-Aufruf, Token, Ziel-Endpoint.

**Wichtige Trennung (im Profil dokumentiert, im Portal implementiert):**
SBOM-Erneuerung ist **ereignisgetrieben** (Produktänderung); Schwachstellen-Neubewertung
läuft **kontinuierlich** gegen das unveränderte SBOM. Der Heartbeat überwacht nur
Lieferdisziplin, nicht CVE-Aktualität.

---

## Block 8 — Bestandsaufnahme Dokumentation & Konformität *(Annex-VII-Mapping)*

**Ziel:** Gap-Analyse gegen die technische Dokumentation — was existiert, was generiert
das Portal, was muss der Kunde liefern.

**Fragen / Output-Felder:**
- Vorhandene Artefakte: Architektur-Doku, Testberichte, Pentest-Reports,
  Entwicklungsprozess-Doku, Benutzerinformationen/Anleitungen → jedes Artefakt als
  Evidenzknoten (Ort, Stand, Verantwortlicher)
- Mapping auf Annex-VII-Gliederung: pro Pflichtbestandteil Status
  `vorhanden | generierbar_aus_aufnahme | fehlt`
- CE-Kennzeichnungsprozess: Wer zeichnet die Konformitätserklärung? Prozess definiert?
- Benutzerinformationspflichten: Sind die kundensichtbaren Angaben (Kontaktstelle,
  Support-Zeitraum, Update-Anleitung) in Produkt/Doku integriert?

**Downstream:** Gliederung und Befüllungsgrad der generierten technischen Dokumentation;
Rest-Gap-Liste als Projektplan.

---

## Abschluss-Artefakte des Workshops

1. **Ergebnisbericht** (PDF): Klassifizierung, Pflichtenkatalog, Blockstatus-Ampeln,
   priorisierte Gap-Liste mit Verantwortlichen und Fristen
2. **SBOM-Profil** (YAML) + Einrichtungsanleitung für die Kunden-CI
3. **Erstentwürfe** der generierbaren Dokumente (CVD-Policy, Support-Zeitraum-Erklärung)
   — als Entwurf gekennzeichnet, Freigabe durch Kunden
4. **Portal-Provisionierung**: Mandant, Produkt(e), Profile, Eskalationskontakte angelegt;
   Abo beginnt mit erster profilkonformer SBOM-Lieferung

## Nicht-Ziele / Abgrenzung

- Das Cockpit erstellt **keine Rechtsberatung**. Alle Artikel-/Annex-Referenzen sind vor
  Produktiveinsatz juristisch gegenzuprüfen und als versionierte Daten gepflegt.
- Keine automatische Risikobewertung durch LLM: Das LLM formuliert und strukturiert,
  bewertet aber nicht. Jede Bewertung trägt einen menschlichen Urheber.
- Der Wizard (Stufe 1) nutzt dieselbe Regel-Engine wie Block 2, aber nur in der
  Selbstauskunfts-Tiefe — keine Methodik-Duplikation, kein Methodik-Leak.
