# Changelog — Aufnahme-Katalog (Daten)

Inhaltliche Änderungen an `data/katalog.yaml` werden hier geführt und bei Release
mit `katalog-vX.Y` getaggt. Code-Änderungen an Schema/Auswertung gehören nicht
hierher.

## katalog-v0.1 — 0.1.0 (2026-06-13)

**Erstes Release.** Fachliche Freigabe: Pauschalfreigabe durch den Director am
2026-06-13 (alle 47 Felder `review_status: approved`). Juristische
Detailprüfung der Annex-/Artikel-Referenzen bleibt als Auflage für katalog-v0.2
vermerkt (wie beim Regelwerk rules-v0.2).

- 9 Blöcke (0 Mandant, 1 Produkt, 2 Klassifizierung, 3 Risikokontext,
  4 Schwachstellenmanagement, 5 Support, 6 Lieferkette, 7 SBOM-Profil,
  8 Dokumentation), 47 Felder
- Block 1 enthält die Engine-Eingaben `p_produkttyp` (Annex-III/IV-Gruppe) und
  `p_ausnahmebereich` für den Klassifizierungsvorschlag in Block 2
- Ebenen-Modell (ADR-017): Block 4 und 6-Build/Due-Diligence als
  `mandant_mit_override`, Produktfelder als `produkt`, Block 0 als `mandant`
- Downstream-Mapping je Feld (Grundprinzip 3, strukturell erzwungen)
- Gap-Regeln mit Priorität + Annex-Referenz auf den kritischen Feldern
