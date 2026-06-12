# Changelog — Regelwerk (Regeldaten)

Inhaltliche Änderungen an `data/regelwerk.yaml` werden hier geführt und bei
Release mit `rules-vX.Y` getaggt (siehe CLAUDE.md). Code-Änderungen an der
Engine gehören nicht hierher.

## [Unreleased] — 0.3.0-draft (Stand 2026-06-12)

Selbstprüfung gegen den finalen Verordnungstext (EUR-Lex / Anhang-Volltexte).
Drei Einstufungen aus 0.1/0.2 beruhten auf dem **Entwurf von 2022** und waren in
der finalen Fassung falsch:

- **Betriebssysteme: Klasse II → Klasse I** (final Anhang III Klasse I Nr. 11).
- **PKI/Zertifikatsausstellung: Klasse II → Klasse I** (final Nr. 9).
- **Firewalls/IDS/IPS: eine Position, Klasse II, ohne Industrie-Einschränkung**
  (final Klasse II Nr. 2) — die 0.2.0-Aufteilung in nicht-industriell (I) /
  industriell (II) entsprach dem Entwurf und wurde zu einer Option
  `firewall_ids_ips` zusammengeführt.
- Router-Option ohne „Endkundenbereich"-Einschränkung, jetzt inkl. Switches
  (final Nr. 12, neuer Wert `router_modem_switch`).
- Wearables: „oder für Kinder" ergänzt (final Nr. 19).
- Art.-2-Referenzen präzisiert (Kfz Abs. 2, Schiff Abs. 4, Ersatzteil Abs. 6,
  Verteidigung Abs. 7).
- Golden Cases GC-04/05/06/08/27 entsprechend angepasst.
- Hinweis: Durchführungsverordnung (EU) 2025/2392 (technische Beschreibungen der
  Anhang-III/IV-Kategorien) als Quelle für künftige Erläuterungstexte vormerken.

## 0.2.0-draft (Stand 2026-06-12)

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
