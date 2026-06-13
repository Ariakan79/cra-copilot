# Changelog — Aufnahme-Katalog (Daten)

Inhaltliche Änderungen an `data/katalog.yaml` werden hier geführt und bei Release
mit `katalog-vX.Y` getaggt. Code-Änderungen an Schema/Auswertung gehören nicht
hierher.

## [Unreleased] — 0.1.0-draft (Stand 2026-06-13)

Erstbefüllung der Blöcke 0–8 in Aufnahme-Tiefe; **alle Felder
`review_status: pending`**, fachliche Freigabe durch den Director steht aus.
Das Tag `katalog-v0.1` wird erst gesetzt, wenn 0 Felder pending sind.

- 9 Blöcke (0 Mandant, 1 Produkt, 2 Klassifizierung, 3 Risikokontext,
  4 Schwachstellenmanagement, 5 Support, 6 Lieferkette, 7 SBOM-Profil,
  8 Dokumentation)
- Ebenen-Modell (ADR-017): Block 4 und 6-Build/Due-Diligence als
  `mandant_mit_override`, Produktfelder als `produkt`, Block 0 als `mandant`
- Downstream-Mapping je Feld (Grundprinzip 3, strukturell erzwungen)
- Gap-Regeln mit Priorität + Annex-Referenz auf den kritischen Feldern
