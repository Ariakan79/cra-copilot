import { expect, test, type Page } from '@playwright/test';

/**
 * Portal-Smoke (TEST_STRATEGY §8.4) gegen echte API + Testcontainers-Postgres +
 * OSV-Fixture: Login → Heartbeat-Ampel → Findings triagieren → Token erzeugen.
 * Plus: kein Request an ein osv.dev-Origin (Datenlokalität, ADR-021/022).
 */

async function anmelden(page: Page) {
  await page.goto('/');
  await page.getByTestId('benutzername').fill('kunde');
  await page.getByTestId('passwort').fill('portal1234');
  await page.getByTestId('login').click();
  await expect(page.getByTestId('produktliste')).toBeVisible();
}

test('Login zeigt Produkt mit Heartbeat-Ampel „aktuell"', async ({ page }) => {
  await anmelden(page);
  await expect(page.getByTestId('heartbeat')).toContainText('Firmware');
  await expect(page.getByTestId('heartbeat').locator('.ampel')).toHaveClass(/aktuell/);
});

test('Findings-Liste zeigt das Match und lässt sich triagieren', async ({ page }) => {
  await anmelden(page);
  const findings = page.getByTestId('findings');
  await expect(findings).toContainText('GHSA-p6mc-m468-83gw');
  await expect(findings).toContainText('Exploitability');
  // neu → in_pruefung
  await findings.getByRole('button', { name: '→ in_pruefung' }).click();
  await expect(findings).toContainText('in_pruefung');
});

test('CI-Ingestion-Token wird einmalig angezeigt', async ({ page }) => {
  await anmelden(page);
  await page.getByTestId('token-erzeugen').click();
  await expect(page.getByTestId('token')).toBeVisible();
});

test('falsches Passwort meldet Fehler', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('benutzername').fill('kunde');
  await page.getByTestId('passwort').fill('falsch');
  await page.getByTestId('login').click();
  await expect(page.getByTestId('fehler')).toBeVisible();
});

test('Meldeworkflow: Finding einstufen → Meldevorgang mit Fristen → Frühwarnung einreichen', async ({
  page,
}) => {
  await anmelden(page);
  const findings = page.getByTestId('findings');
  await expect(findings).toContainText('GHSA-p6mc-m468-83gw');
  // Das lodash-Finding als aktiv ausgenutzt einstufen.
  await findings.getByRole('button', { name: 'aktiv ausgenutzt', exact: false }).first().click();

  // Meldevorgang erscheint mit Frühwarnung (24h) und Meldung (72h).
  const vorgaenge = page.getByTestId('meldevorgaenge');
  await expect(vorgaenge).toContainText('Frühwarnung (24h)');
  await expect(vorgaenge).toContainText('Meldung (72h)');

  // Frühwarnung-Entwurf öffnen, ausfüllen, einreichen.
  const vorgangId = await vorgaenge
    .locator('[data-testid^="stufe-"]')
    .first()
    .getAttribute('data-testid');
  const vid = vorgangId!.replace('stufe-', '').replace('-fruehwarnung', '');
  await page.getByTestId(`entwurf-${vid}-fruehwarnung`).click();
  const entwurf = page.getByTestId('entwurf');
  await expect(entwurf).toBeVisible();
  // Option 1: Integritäts-Anker (Kopf-Hash) ist Teil des Melde-Entwurfs.
  await expect(page.getByTestId('anker')).toContainText('Integritäts-Anker');
  await expect(page.getByTestId('anker').locator('code')).toHaveText(/[0-9a-f]{64}/);
  // erstes Pflichtfeld füllen
  await entwurf.locator('input').first().fill('Smart-Lock Pro');
  await page.getByTestId('einreichen').click();

  // Stufe ist jetzt als eingereicht markiert.
  await expect(page.getByTestId(`eingereicht-${vid}-fruehwarnung`)).toBeVisible();
});

test('Organisation: Integritäts-Status, security.txt veröffentlichen, Erstanschreiben', async ({
  page,
}) => {
  await anmelden(page);
  // Integritäts-Status sichtbar.
  await expect(page.getByTestId('integritaet')).toContainText('intakt');
  // security.txt veröffentlichen (verketten).
  await page.getByTestId('sec-veroeffentlichen').click();
  await expect(page.getByTestId('sec-ok')).toBeVisible();
  // Erstanschreiben-Entwurf erzeugen → Kopf-Hash im Text → versenden → Eingangsbestätigung.
  await page.getByTestId('erst-erzeugen').click();
  await expect(page.getByTestId('erst-text')).toContainText('Art. 14');
  await page.getByTestId('erst-versenden').click();
  await expect(page.getByTestId('erst-versendet')).toBeVisible();
  await page.getByTestId('erst-az').fill('BSI-AZ-2026-0007');
  await page.getByTestId('erst-bestaetigen').click();
  await expect(page.getByTestId('erst-bestaetigt')).toBeVisible();
});

test('Nutzerbenachrichtigung: Entwurf öffnen und versenden', async ({ page }) => {
  await anmelden(page);
  // Erst einen Meldevorgang anlegen (Finding als aktiv ausgenutzt).
  await page
    .getByTestId('findings')
    .getByRole('button', { name: 'aktiv ausgenutzt', exact: false })
    .first()
    .click();
  await page.getByTestId(`nutzerinfo-${await firstVorgangId(page)}`).click();
  const ne = page.getByTestId('nutzer-entwurf');
  await expect(ne).toBeVisible();
  await ne.locator('input').first().fill('Smart-Lock Pro 2.0');
  await page.getByTestId('nutzer-versenden').click();
  // Nach Versand ist das Formular geschlossen.
  await expect(ne).toBeHidden();
});

async function firstVorgangId(page: import('@playwright/test').Page): Promise<string> {
  const testid = await page
    .getByTestId('meldevorgaenge')
    .locator('[data-testid^="nutzerinfo-"]')
    .first()
    .getAttribute('data-testid');
  return testid!.replace('nutzerinfo-', '');
}

test('Datenlokalität: kein Request an osv.dev', async ({ page }) => {
  const fremde: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('osv.dev') || u.includes('googleapis')) fremde.push(u);
  });
  await anmelden(page);
  await page.getByTestId('findings').waitFor();
  expect(fremde, 'Es darf kein Request an osv.dev gehen (Matching ist lokal)').toEqual([]);
});
