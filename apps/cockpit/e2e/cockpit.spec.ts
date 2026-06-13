import { expect, test, type Page } from '@playwright/test';

/**
 * Cockpit-Smoke (TEST_STRATEGY §7.4) gegen echte API + Testcontainers-Postgres:
 * Aufnahme anlegen → Block ausfüllen (inkl. „unbekannt" ⇒ Gap) → Ampel prüfen →
 * Korrektur → SBOM-Export → Bericht-Druckansicht.
 */

async function aufnahmeStarten(page: Page) {
  await page.goto('/');
  await page.getByTestId('mandant').fill('Musterfirma IoT GmbH');
  await page.getByTestId('produkt').fill('Smart-Lock Pro');
  await page.getByTestId('gespraechsleiter').fill('Hr. Leiter');
  await page.getByTestId('person').fill('Frau Kunde');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('blockliste')).toBeVisible();
}

test('Aufnahme anlegen und Block 0 ausfüllen ändert die Ampel auf grün/gelb', async ({ page }) => {
  await aufnahmeStarten(page);
  // Block 0 ist aktiv: Firmenname als Text erfassen.
  await expect(page.getByTestId('ampel-0')).toHaveClass(/nicht_bearbeitet/);
  const firmenname = page.locator('[data-feld-id="m_firmenname"] input').first();
  await firmenname.fill('Musterfirma IoT GmbH (GmbH)');
  await page.locator('[data-feld-id="m_firmenname"] button', { hasText: 'Speichern' }).click();
  await expect(
    page.locator('[data-feld-id="m_firmenname"] [data-testid="gespeichert"]'),
  ).toBeVisible();
  // Ampel ist nicht mehr "nicht_bearbeitet".
  await expect(page.getByTestId('ampel-0')).not.toHaveClass(/nicht_bearbeitet/);
});

test('„unbekannt" auf einem Gap-Feld erzeugt einen Lücken-Eintrag', async ({ page }) => {
  await aufnahmeStarten(page);
  // Zu Block 4 (Schwachstellenmanagement) wechseln.
  await page.locator('.block-tab', { hasText: '4.' }).click();
  // CVD-Policy vorhanden? → "Nein" erzeugt einen Gap.
  const cvd = page.locator('[data-feld-id="s_cvd_policy_vorhanden"]');
  await cvd.getByRole('button', { name: 'Nein', exact: true }).click();
  await expect(page.getByTestId('gap-liste')).toContainText('s_cvd_policy_vorhanden');
});

test('Korrektur einer Antwort schließt den zugehörigen Gap', async ({ page }) => {
  await aufnahmeStarten(page);
  await page.locator('.block-tab', { hasText: '4.' }).click();
  const cvd = page.locator('[data-feld-id="s_cvd_policy_vorhanden"]');
  await cvd.getByRole('button', { name: 'Nein', exact: true }).click();
  await expect(page.getByTestId('gap-liste')).toContainText('s_cvd_policy_vorhanden');
  // Korrektur: doch "Ja" (neuer Evidenzknoten, Supersession serverseitig).
  await cvd.getByRole('button', { name: 'Ja', exact: true }).click();
  await expect(page.getByTestId('gap-liste')).not.toContainText('s_cvd_policy_vorhanden');
});

test('Zahl-Feld (Support-Zeitraum, Block 5) lässt sich ohne Fehler erfassen', async ({ page }) => {
  await aufnahmeStarten(page);
  await page.locator('.block-tab', { hasText: '5.' }).click();
  const jahre = page.locator('[data-feld-id="sup_zeitraum_jahre"]');
  await jahre.locator('input').fill('7');
  await jahre.getByRole('button', { name: 'Speichern' }).click();
  await expect(jahre.getByTestId('gespeichert')).toContainText('7');
  await expect(page.getByTestId('fehler')).toHaveCount(0);
});

test('Block 2: Engine-Vorschlag erscheint und lässt sich übernehmen', async ({ page }) => {
  await aufnahmeStarten(page);
  // Block 0: Rolle Hersteller erfassen (Mandantenebene).
  const rollen = page.locator('[data-feld-id="m_rollen"]');
  await rollen.getByRole('button', { name: 'Hersteller', exact: true }).click();
  await rollen.getByRole('button', { name: 'Auswahl speichern' }).click();

  // Block 1: Produktumfang, Inverkehrbringen, Ausnahmebereich, Produktgruppe.
  await page.locator('.block-tab', { hasText: '1.' }).click();
  const umfang = page.locator('[data-feld-id="p_produktumfang"]');
  await umfang.getByRole('button', { name: 'Lokale Software', exact: true }).click();
  await umfang.getByRole('button', { name: 'Auswahl speichern' }).click();
  const ivk = page.locator('[data-feld-id="p_inverkehrbringen"]');
  await ivk.getByRole('button', { name: 'Bereits am Markt', exact: true }).click();
  const ausn = page.locator('[data-feld-id="p_ausnahmebereich"]');
  await ausn.getByRole('button', { name: 'Keiner', exact: true }).click();
  const oss = page.locator('[data-feld-id="p_oss_konstellation"]');
  await oss.getByRole('button', { name: 'Rein kommerziell', exact: true }).click();
  const typ = page.locator('[data-feld-id="p_produkttyp"]');
  await typ.getByRole('button', { name: 'Passwort-Manager', exact: true }).click();
  await typ.getByRole('button', { name: 'Auswahl speichern' }).click();

  // Block 2: Vorschlag muss wichtig_klasse_1 empfehlen.
  await page.locator('.block-tab', { hasText: '2.' }).click();
  await expect(page.getByTestId('vorschlag-kategorie')).toHaveAttribute(
    'data-wert',
    'wichtig_klasse_1',
  );
  await page.getByTestId('vorschlag-uebernehmen').click();
  // Nach Übernahme ist k_kategorie als Evidenz gesetzt (Chip aktiv).
  await expect(
    page.locator('[data-feld-id="k_kategorie"] [data-testid="gespeichert"]'),
  ).toContainText('wichtig_klasse_1');
});

test('SBOM-Profil-Download liefert YAML', async ({ page }) => {
  await aufnahmeStarten(page);
  const href = await page.getByTestId('sbom-download').getAttribute('href');
  expect(href).toContain('format=yaml');
  const res = await page.request.get(`/api${href!.replace('/api', '')}`);
  expect(res.headers()['content-type']).toContain('yaml');
});

test('Bericht-Druckansicht rendert Blockstatus', async ({ page }) => {
  await aufnahmeStarten(page);
  await page.getByTestId('zum-bericht').click();
  await expect(page.getByTestId('bericht')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('bericht')).toContainText('Blockstatus');
});
