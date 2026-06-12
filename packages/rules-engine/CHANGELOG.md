# Changelog — Regelwerk (Regeldaten)

Inhaltliche Änderungen an `data/regelwerk.yaml` werden hier geführt und bei
Release mit `rules-vX.Y` getaggt (siehe CLAUDE.md). Code-Änderungen an der
Engine gehören nicht hierher.

## [Unreleased] — 0.2.0-draft (Stand 2026-06-12)

Annex-III-Abdeckung vervollständigt und Art.-2-Sonderfälle ergänzt (alle neuen
Einträge `review_status: pending`):

- **10 neue Produktgruppen (Klasse I):** Identitäts-/Zugriffsverwaltung, Browser,
  Netzwerkmanagement, SIEM, Boot-Manager, Fernzugriff, MDM, Netzwerkschnittstellen,
  Chips mit Sicherheitsfunktionen (nicht manipulationssicher),
  **Firewall/IDS nicht-industriell** — Letzteres schließt die gefährlichste Lücke:
  Unternehmens-Firewalls liefen bisher fälschlich auf `default`.
- **3 neue Sonderfälle:** Schiffsausrüstung (ausgenommen), Verteidigung/nationale
  Sicherheit (ausgenommen), Ersatzteile für identische Komponenten (außerhalb).
- Produkttyp-Erläuterung: bei Mehrfach-Zutreffen die strengste Gruppe wählen
  (Mehrfachauswahl als v1.1-Kandidat zurückgestellt).
- 6 neue Golden Cases (GC-27 bis GC-32).

## [Unreleased] — 0.1.0-draft (Stand 2026-06-12)

Erstbefüllung in Selbstauskunfts-Tiefe; **alle Einträge `review_status: pending`**,
fachliche Freigabe durch den Director steht aus. Das Tag `rules-v0.1` wird erst
gesetzt, wenn 0 Einträge pending sind (TEST_STRATEGY §3).

- 8 Fragen (Rolle, Produktart, Remote-Datenverarbeitung, Datenverbindung,
  EU-Markt, Ausnahmebereiche, OSS-Konstellation, Produkttyp-Heuristik)
- 9 Terminal-Regeln (Geltungsbereich, sektorale Ausnahmen, OSS, Steward-Sonderregime)
- 17 Kategorie-Regeln (Annex-III/IV-Heuristik + Default)
- 19 Pflichten (Hersteller, Importeur, Händler, OSS-Steward; Fristen 09/2026 und 12/2027)
