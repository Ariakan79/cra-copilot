import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * E2E-Smoke (TEST_STRATEGY §4): ein Durchlauf pro Ergebnistyp gegen den gebauten
 * statischen Output, dazu Netzwerk-Versprechen (ADR-002), Zurück-Navigation
 * (ADR-007), Druckansicht und ein axe-Smoke. Kein UI-Test-Maximalismus.
 */

/** Drehbücher = Antworten der Golden Cases GC-01/05/10/13/14/20. */
const drehbuecher = {
  klasse1: {
    rolle: 'hersteller',
    produktart: 'software_produkt',
    datenverbindung: 'ja',
    eu_markt: 'ja',
    ausnahmebereich: 'keiner',
    oss: 'nicht_oss',
    produkttyp: 'passwortmanager',
  },
  klasse2: {
    rolle: 'hersteller',
    produktart: 'hardware_mit_software',
    datenverbindung: 'ja',
    eu_markt: 'ja',
    ausnahmebereich: 'keiner',
    oss: 'nicht_oss',
    produkttyp: 'firewall_ids_ips',
  },
  kritisch: {
    rolle: 'hersteller',
    produktart: 'hardware_mit_software',
    datenverbindung: 'ja',
    eu_markt: 'ja',
    ausnahmebereich: 'keiner',
    oss: 'nicht_oss',
    produkttyp: 'smart_meter_gateway',
  },
  default: {
    rolle: 'hersteller',
    produktart: 'software_produkt',
    datenverbindung: 'ja',
    eu_markt: 'ja',
    ausnahmebereich: 'keiner',
    oss: 'nicht_oss',
    produkttyp: 'keine_davon',
  },
  ausserhalb: {
    rolle: 'hersteller',
    produktart: 'software_produkt',
    datenverbindung: 'nein',
  },
  ausgenommen: {
    rolle: 'hersteller',
    produktart: 'software_produkt',
    datenverbindung: 'ja',
    eu_markt: 'ja',
    ausnahmebereich: 'medizinprodukt',
  },
} as const;

async function starten(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Check starten' }).click();
}

async function durchklicken(page: Page, antworten: Record<string, string>) {
  for (let schritt = 0; schritt < 20; schritt++) {
    await page.locator('[data-testid="ergebnis"], [data-testid="frage"]').first().waitFor();
    if (await page.getByTestId('ergebnis').isVisible()) return;
    const frage = page.getByTestId('frage');
    const frageId = await frage.getAttribute('data-frage-id');
    const wert = frageId === null ? undefined : antworten[frageId];
    if (wert === undefined) throw new Error(`Drehbuch hat keine Antwort für Frage ${frageId}`);
    await frage.locator(`input[value="${wert}"]`).check();
    await page.getByRole('button', { name: 'Weiter' }).click();
  }
  throw new Error('Ergebnis nach 20 Schritten nicht erreicht — Fluss hängt?');
}

test('Durchlauf Klasse I: Passwortmanager bis zum Ergebnisbericht', async ({ page }) => {
  await starten(page);
  await durchklicken(page, drehbuecher.klasse1);
  await expect(page.getByTestId('geltungsbereich')).toHaveAttribute('data-wert', 'in_scope');
  await expect(page.getByTestId('kategorie')).toHaveAttribute('data-wert', 'wichtig_klasse_1');
  await expect(page.getByTestId('begruendungspfad')).toContainText('Passwort-Manager');
  await expect(page.getByTestId('frist').first()).toHaveAttribute('data-wert', '2026-09');
});

test('Durchlauf Klasse II: industrielle Firewall', async ({ page }) => {
  await starten(page);
  await durchklicken(page, drehbuecher.klasse2);
  await expect(page.getByTestId('kategorie')).toHaveAttribute('data-wert', 'wichtig_klasse_2');
});

test('Durchlauf kritisch: Smart-Meter-Gateway', async ({ page }) => {
  await starten(page);
  await durchklicken(page, drehbuecher.kritisch);
  await expect(page.getByTestId('kategorie')).toHaveAttribute('data-wert', 'kritisch');
});

test('Durchlauf Standardkategorie: ERP on-premise', async ({ page }) => {
  await starten(page);
  await durchklicken(page, drehbuecher.default);
  await expect(page.getByTestId('kategorie')).toHaveAttribute('data-wert', 'default');
});

test('Durchlauf außerhalb: Offline-Produkt endet vorzeitig', async ({ page }) => {
  await starten(page);
  await durchklicken(page, drehbuecher.ausserhalb);
  await expect(page.getByTestId('geltungsbereich')).toHaveAttribute('data-wert', 'ausserhalb');
  await expect(page.getByTestId('keine-pflichten')).toBeVisible();
});

test('Durchlauf ausgenommen: Medizinprodukt', async ({ page }) => {
  await starten(page);
  await durchklicken(page, drehbuecher.ausgenommen);
  await expect(page.getByTestId('geltungsbereich')).toHaveAttribute('data-wert', 'ausgenommen');
});

test('ADR-002: kein einziger Request verlässt den Preview-Origin', async ({ page, baseURL }) => {
  const fremde: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(baseURL ?? '')) fremde.push(request.url());
  });
  await starten(page);
  await durchklicken(page, drehbuecher.klasse1);
  await page.getByTestId('ergebnis').waitFor();
  expect(fremde, 'Externe Requests gefunden — Produktversprechen verletzt').toEqual([]);
});

test('ADR-007: Antwortänderung verwirft unerreichbare Folgeantworten', async ({ page }) => {
  await starten(page);
  // reine Dienstleistung → Zusatzfrage erscheint und wird beantwortet
  await durchklicken(page, {
    rolle: 'hersteller',
    produktart: 'reine_dienstleistung',
    dienstleistung_fuer_produkt: 'ja',
    // bei datenverbindung stoppen: keine Antwort hinterlegt → Drehbuch endet hier
  }).catch(() => {});
  await expect(page.getByTestId('frage')).toHaveAttribute('data-frage-id', 'datenverbindung');

  // zweimal zurück: dienstleistung_fuer_produkt → produktart
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByTestId('frage')).toHaveAttribute(
    'data-frage-id',
    'dienstleistung_fuer_produkt',
  );
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByTestId('frage')).toHaveAttribute('data-frage-id', 'produktart');

  // Antwort ändern: Zusatzfrage wird unerreichbar, ihre Antwort muss verfallen
  await page.getByTestId('frage').locator('input[value="software_produkt"]').check();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByTestId('frage')).toHaveAttribute('data-frage-id', 'datenverbindung');

  // Zurück von hier überspringt die verworfene Zusatzfrage
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByTestId('frage')).toHaveAttribute('data-frage-id', 'produktart');
});

test('Druckansicht: Bericht rendert, Bedienelemente verschwinden', async ({ page }) => {
  await starten(page);
  await durchklicken(page, drehbuecher.klasse1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('kategorie')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Aufnahme-Gespräch anfragen' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Check neu beginnen' })).toBeHidden();
});

test('A11y-Smoke: keine kritischen axe-Verstöße auf Frage- und Ergebnisseite', async ({ page }) => {
  await starten(page);
  await page.getByTestId('frage').waitFor();
  const frageScan = await new AxeBuilder({ page }).analyze();
  expect(frageScan.violations.filter((v) => v.impact === 'critical')).toEqual([]);

  await durchklicken(page, drehbuecher.klasse1);
  const ergebnisScan = await new AxeBuilder({ page }).analyze();
  expect(ergebnisScan.violations.filter((v) => v.impact === 'critical')).toEqual([]);
});
