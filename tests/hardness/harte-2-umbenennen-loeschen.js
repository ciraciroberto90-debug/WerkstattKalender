// Härtetest: Team-Mitglied umbenennen -> müssen SCHICHT- und PLANNOTIZ-Einträge
// mitziehen (nicht nur ARBEIT/wer). Danach: Team-Mitglied ENTFERNEN -> App darf
// mit den verwaisten Schicht-/Notiz-Einträgen nicht abstürzen.
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
  await page.clock.setFixedTime(new Date('2026-07-10T09:00:00'));
  // Solo-Betrieb ohne File System Access API (wie Firefox/Safari) - dort gilt
  // die App als volle Solo-Instanz, nicht als "noch nicht verbundener Leser".
  await page.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; });
  await page.goto(APP);
  await page.evaluate(() => {
    localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
      tpmAnlagen: [], riItems: [], team: [{ name: 'Alt Name', rolle: 'mech' }],
    }));
    localStorage.setItem('werkstatt-kalender-entries', JSON.stringify([]));
  });
  await page.reload();
  await page.waitForTimeout(400);

  // Schicht + Notiz für "Alt Name" anlegen
  await page.getByRole('button', { name: 'Planung', exact: true }).click();
  await page.waitForTimeout(300);
  await page.locator('button[aria-label="Schicht Alt Name 2026-07-10"]').click();
  await page.waitForTimeout(150);
  await page.locator('div[style*="fixed"]').last().getByRole('button', { name: 'Früh', exact: true }).click();
  await page.waitForTimeout(300);
  const zelle = page.locator('button[aria-label="Schicht Alt Name 2026-07-10"]').locator('xpath=..');
  await zelle.getByRole('button', { name: 'Arbeit oder Notiz eintragen' }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /Stattdessen freie Notiz/ }).click();
  await page.waitForTimeout(150);
  await page.locator('textarea[placeholder*="Zahnarzt"]').fill('Testnotiz für Alt Name');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.waitForTimeout(300);

  // Umbenennen im Verwalten-Dialog
  await page.locator('button[aria-label="Werkstatt-Monitor"]').locator('xpath=preceding-sibling::button[1]').click(); // Zahnrad (Verwalten)
  await page.waitForTimeout(300);
  await page.locator('input[value="Alt Name"]').fill('Neuer Name');
  await page.getByRole('button', { name: /Speichern/ }).first().click();
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: 'Planung', exact: true }).click();
  await page.waitForTimeout(300);
  const schichtNeu = await page.locator('button[aria-label="Schicht Neuer Name 2026-07-10"]').innerText().catch(() => null);
  ok('Nach Umbenennen: Schicht steht unter neuem Namen', schichtNeu !== null && schichtNeu.trim().toLowerCase() === 'f');
  const alterWeg = await page.locator('button[aria-label="Schicht Alt Name 2026-07-10"]').count();
  ok('Alter Name taucht nicht mehr auf', alterWeg === 0);
  const zelleNeu = page.locator('button[aria-label="Schicht Neuer Name 2026-07-10"]').locator('xpath=..');
  ok('Notiz ist unter dem neuen Namen sichtbar', await zelleNeu.locator('button', { hasText: 'Testnotiz' }).count() === 1);

  // Team-Mitglied komplett entfernen -> verwaiste Schicht-/Notiz-Einträge bleiben in den Daten,
  // aber die App darf nicht abstürzen
  await page.locator('button[aria-label="Werkstatt-Monitor"]').locator('xpath=preceding-sibling::button[1]').click();
  await page.waitForTimeout(300);
  await page.locator('button[aria-label="Person entfernen"]').first().click();
  await page.getByRole('button', { name: /Speichern/ }).first().click();
  await page.waitForTimeout(400);

  ok('Kein JS-Fehler nach Entfernen des Team-Mitglieds', errors.length === 0);
  await page.getByRole('button', { name: 'Planung', exact: true }).click();
  await page.waitForTimeout(300);
  ok('Planung rendert weiterhin (kein Crash, zeigt "kein Team"-Hinweis)', (await page.locator('body').innerText()).includes('Noch kein Team angelegt'));
  await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
  await page.waitForTimeout(300);
  ok('Schichtplan-Matrix rendert weiterhin (kein Crash)', (await page.locator('body').innerText()).length > 100);
  if (errors.length) console.log('  Fehler:', errors);

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
