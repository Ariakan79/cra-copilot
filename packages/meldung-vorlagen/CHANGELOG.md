# Changelog — Meldung-Vorlagen (Daten)

Inhaltliche Änderungen an `data/vorlagen.yaml` werden hier geführt und bei Release
mit `meldung-vX.Y` getaggt. Code-Änderungen gehören nicht hierher.

## [Unreleased] — 0.1.0-draft (Stand 2026-06-13)

Erstbefüllung der Art-14-Fristen und Feldvorlagen; **alle Einträge
`review_status: pending`**. Das Tag `meldung-v0.1` wird erst gesetzt, wenn
0 Einträge pending sind (fachliche/juristische Freigabe durch den Director).

- Fristen: 24h Frühwarnung / 72h Meldung / 14 Tage (Schwachstelle) bzw. 1 Monat
  (Vorfall) Abschluss — am Verordnungstext (Art. 14) geprüft, Review ausstehend.
- Feldvorlagen je Stufe (Frühwarnung/Meldung/Abschluss) und Typ
  (Schwachstelle/Vorfall) mit Art.-Referenzen.
- Auflage meldung-v0.2: Abgleich mit den konkreten Feldvorgaben der
  einheitlichen Meldeplattform (Art. 16), sobald veröffentlicht.
- Ergänzte Felder (nach Abgleich cra-ready.de/Art-14-Checkliste, alle pending):
  Frühwarnung „böswillige Handlung?", Meldung „IoC", Abschluss „CVSS /
  betroffene Versionen / Update-Status" (CVSS im Entwurf aus dem Finding
  vorbefüllt). Offen für v0.2-Review: Bezug der Vorfall-Abschlussfrist
  („nach Erstmeldung" vs. „nach 72h-Meldung").
