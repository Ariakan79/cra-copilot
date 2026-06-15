# Mitwirken an CRA-Copilot

Beiträge sind willkommen. Bitte beachten Sie vor dem ersten Pull Request die
folgenden Punkte.

## Lizenz & CLA (wichtig)

CRA-Copilot wird im **Dual-Licensing-Modell** betrieben (nicht-kommerziell
kostenlos, kommerziell auf Lizenz — siehe [COMMERCIAL.md](COMMERCIAL.md)). Damit
beigesteuerter Code Teil beider Lizenzwege werden kann, ist für jeden Beitrag das
**[Contributor License Agreement (CLA.md)](CLA.md)** erforderlich.

Die einfachste Form der Zustimmung ist der **DCO-Sign-off** an jedem Commit:

```bash
git commit -s -m "fix: ..."
```

Das fügt eine Zeile `Signed-off-by: Ihr Name <mail>` hinzu und bestätigt
zugleich den [DCO](https://developercertificate.org/) und Ihr Einverständnis mit
dem CLA. Pull Requests ohne Sign-off können nicht übernommen werden.

## Bevor Sie einen PR öffnen

Bitte stellen Sie sicher, dass der Stand grün ist:

```bash
pnpm install
pnpm -r run lint        # ESLint + Prettier
pnpm -r run typecheck   # tsc --strict + svelte-check
pnpm -r run build
# Tests je nach betroffenem Bereich, siehe README.
```

- **Conventional Commits**, kleine Commits pro logischer Einheit.
- Branch-Präfixe: `feat/…`, `fix/…`, `docs/…`.
- **Fachliche/regulatorische Inhalte** liegen als versionierte Daten und tragen
  `review_status: pending`, bis sie fachlich freigegeben sind — bitte keine
  CRA-Aussagen als `approved` markieren ohne Freigabe.
- Architekturentscheidungen sind in [`docs/ADR.md`](docs/ADR.md) dokumentiert;
  festgezurrte ADRs bitte nicht ohne Diskussion umstoßen.

## Fragen

Fachliche oder Lizenzfragen: **license@ariakan.eu**.
