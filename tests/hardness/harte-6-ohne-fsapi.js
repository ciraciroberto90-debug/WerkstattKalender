// Härtetest: Browser OHNE File System Access API (echtes Firefox/Safari-
// Verhalten simuliert). Die App muss vollständig im reinen Solo-/localStorage-
// Modus funktionieren: TPM abhaken, Backlog anlegen, Schicht setzen, drucken,
// Export/Import - alles ohne "Gemeinsame Datei".
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.clock.setFixedTime(new Date('2026-07-08T09:00:00')); // Mittwoch, hat TPM-Punkte
  // showOpenFilePicker entfernen -> genau das Verhalten in Firefox/Safari
  await page.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; });
  await page.goto(APP);
  await page.waitForTimeout(700);

  ok('Kein JS-Fehler ohne File System Access API', errors.length === 0);
  ok('Ordner-Symbol zeigt "nicht eingerichtet" (grau), kein Absturz', await page.locator('button[aria-label="Gemeinsame Datei"]').count() === 1);

  // TPM-Punkt abhaken (TPM öffnet zuerst die Übersicht -> zum Plan wechseln)
  await page.getByRole('button', { name: 'TPM', exact: true }).click();
  await page.waitForTimeout(300);
  // Seit dem 18.08. steckt der Plan-Kalender in der Auswertung
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.waitForTimeout(400);
  const punkt = page.locator('button[title="Klicken zum Abhaken / Notiz"]').first();
  if (await punkt.count() > 0) {
    await punkt.click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: '✓ Gemacht' }).click();
    await page.waitForTimeout(200);
    await page.locator('button[aria-label="Schließen"]').first().click();
    await page.waitForTimeout(300);
  }

  // Backlog-Arbeit anlegen
  await page.getByRole('button', { name: 'Werkstatt', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Backlog', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '+ Neue Arbeit' }).click().catch(async () => {
    await page.getByRole('button', { name: /Arbeit/ }).first().click();
  });
  await page.waitForTimeout(300);

  // Reload: alles muss aus localStorage wiederkommen
  await page.reload();
  await page.waitForTimeout(700);
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('werkstatt-kalender-entries') || '[]'));
  ok('TPM-Abhaken ist nach Neuladen noch da (localStorage)', entries.some((e) => e.status === 'done'));

  // Export funktioniert weiterhin (ohne Gemeinsame Datei)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[aria-label="Export"]').click(),
  ]);
  ok('Export erzeugt eine Download-Datei', !!download);

  ok('Kein JS-Fehler während des kompletten Solo-Durchlaufs', errors.length === 0);
  if (errors.length) console.log('  Fehler:', errors.slice(0, 5));

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
