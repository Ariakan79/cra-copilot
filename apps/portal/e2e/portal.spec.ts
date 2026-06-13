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
  // erstes Pflichtfeld füllen
  await entwurf.locator('input').first().fill('Smart-Lock Pro');
  await page.getByTestId('einreichen').click();

  // Stufe ist jetzt als eingereicht markiert.
  await expect(page.getByTestId(`eingereicht-${vid}-fruehwarnung`)).toBeVisible();
});

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
