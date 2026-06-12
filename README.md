# CRA-Copilot

Compliance-Werkzeuge zum EU Cyber Resilience Act (CRA) für deutsche KMU.

**Phase 1** (dieses Repo): der öffentliche **Betroffenheits-Wizard** — eine
statische Web-App für die Ersteinschätzung („Gilt der CRA für mein Produkt,
welche Kategorie, welche Pflichten ab wann?") — plus die **Regel-Engine** als
eigenständiges Paket. Cockpit und Kundenportal folgen auf demselben Domänenmodell.

**Produktversprechen des Wizards:** Ihre Angaben verlassen Ihren Browser nicht.
Keine Backend-Calls, kein Tracking, keine Cookies, keine Speicherung — technisch
erzwungen durch einen E2E-Test, der jeden externen Request fehlschlagen lässt.

## Struktur

```
packages/rules-engine/   Reine Entscheidungslogik + Regelwerk (YAML, versioniert)
apps/wizard/             Statische Wizard-App (Svelte 5 + Vite)
docs/                    Spezifikation, ADRs, Teststrategie
```

Details: `docs/ADR.md` (Architekturentscheidungen), `docs/TEST_STRATEGY.md`
(Golden Cases, Invarianten), `CLAUDE.md` (Repo-Konventionen).

## Entwicklung

Voraussetzungen: Node ≥ 22 (`.nvmrc`), pnpm (`corepack enable`).

```bash
pnpm install
pnpm run test         # Engine: Golden Cases, Property-Tests, Strukturprüfung
pnpm run lint         # ESLint + Prettier
pnpm run typecheck    # tsc --strict + svelte-check
pnpm run build        # statischer Wizard-Build nach apps/wizard/dist/
pnpm run e2e          # Playwright-Smoke gegen den gebauten Output
pnpm --filter @cra-copilot/wizard run dev   # lokaler Dev-Server
```

## Deployment (statisch)

Der Build ist eine rein statische Site mit relativen Pfaden (`base: './'`) —
sie läuft auf jedem Webspace, auch in Unterverzeichnissen.

1. `pnpm install && pnpm run build`
2. Den Inhalt von `apps/wizard/dist/` auf den Webserver kopieren (FTP, rsync,
   S3 + CDN — egal; es gibt keine Server-Anforderungen außer statischem Hosting).
3. Fertig. Keine Umgebungsvariablen, keine Datenbank, kein Backend.

**GitHub Pages:** `apps/wizard/dist/` als Artefakt mit `actions/deploy-pages`
veröffentlichen oder den Ordner auf einen `gh-pages`-Branch pushen. Dank
relativer Pfade funktioniert auch `https://<org>.github.io/<repo>/`.

## Regelwerk & fachliche Pflege

Die fachlichen Inhalte (Fragen, Klassifizierungsregeln nach Anhang III/IV,
Pflichten mit Fristen) liegen als Daten in
`packages/rules-engine/data/regelwerk.yaml` — versioniert über `rules_version`,
Änderungen im `CHANGELOG.md` des Pakets, Releases als Git-Tag `rules-vX.Y`.

Jede inhaltliche Aussage trägt `review_status` (`pending`/`approved`).
`pnpm --filter @cra-copilot/rules-engine run pending` listet offene Reviews;
ein `rules-v0.x`-Tag setzt 0 offene Einträge voraus.

**Kein Rechtsrat:** Der Wizard liefert eine unverbindliche Ersteinschätzung.
Alle Artikel-/Annex-Referenzen sind vor Produktiveinsatz juristisch zu prüfen.
