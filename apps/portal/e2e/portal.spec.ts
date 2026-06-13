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
