// Rendert docs/dokumentation.html → docs/CRA-Copilot-Dokumentation.pdf
// über das in den E2E-Tests ohnehin vorhandene Playwright-Chromium.
// Aufruf aus dem Repo-Wurzelverzeichnis:  node docs/render-pdf.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Playwright aus dem Portal-Workspace auflösen (dort installiert).
const require = createRequire(new URL('../apps/portal/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const html = fileURLToPath(new URL('./dokumentation.html', import.meta.url));
const pdf = fileURLToPath(new URL('./CRA-Copilot-Dokumentation.pdf', import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${html}`, { waitUntil: 'networkidle' });
await page.pdf({
  path: pdf,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '0mm', right: '0mm' },
  displayHeaderFooter: false,
});
await browser.close();
console.log(`PDF geschrieben: ${pdf}`);
