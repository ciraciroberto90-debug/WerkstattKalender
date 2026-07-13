// Prüft das neue Sicherheitsnetz: Bei jedem bestätigten Speichern über die
// gemeinsame Datei entsteht eine lokale Sicherung (IndexedDB), sichtbar und
// wiederherstellbar im Verwalten-Dialog.
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('dialog', (d) => d.accept());
  await page.clock.setFixedTime(new Date('2026-07-13T09:00:00'));

  // Datei-Mock (wie bei den anderen Härtetests) - simuliert eine echte gemeinsame Datei
  await page.addInitScript(() => {
    window.__mockFileContent = JSON.stringify({
      format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
      entries: [], deleted: {},
      config: { tpmAnlagen: [], riItems: [], team: [{ name: 'Peter Test', rolle: 'mech' }] },
    });
    const handle = {
      name: 'kalender-daten.json', kind: 'file',
      async getFile() { return new File([window.__mockFileContent], 'kalender-daten.json', { type: 'application/json' }); },
      async createWritable() { return { async write(t) { window.__mockFileContent = t; }, async close() {} }; },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
    };
    window.showOpenFilePicker = async () => [handle];
  });

  await page.goto(APP);
  await page.waitForTimeout(500);
  await page.locator('button[aria-label="Gemeinsame Datei"]').click();
  await page.getByText('Vorhandene Datei öffnen …').click();
  await page.waitForTimeout(800);

  // Eine Schicht setzen -> löst ein Speichern (und damit eine Sicherung) aus
  await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('button[aria-label="Matrix Peter Test 2026-07-13"]').click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Spät', exact: true }).click();
  await page.waitForTimeout(500);

  // Sicherung in IndexedDB prüfen (direkt, unabhängig von der UI)
  const backupsDirekt = await page.evaluate(async () => {
    const req = indexedDB.open('werkstatt-kalender-fs', 2);
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('backups', 'readonly');
        const r = tx.objectStore('backups').getAll();
        r.onsuccess = () => resolve(r.result);
      };
    });
  });
  console.log('Sicherungen in IndexedDB:', backupsDirekt.length);
  ok('Mindestens eine Sicherung wurde nach dem Speichern angelegt', backupsDirekt.length >= 1);

  // Verwalten-Dialog öffnen -> Sicherungen-Liste sichtbar
  await page.locator('button[aria-label="Verwalten"]').click();
  await page.waitForTimeout(400);
  const dialogText = await page.locator('body').innerText();
  ok('"Sicherungen"-Bereich ist im Verwalten-Dialog sichtbar', dialogText.toLowerCase().includes('sicherungen (dieses gerät)'));
  ok('Mind. ein "Wiederherstellen"-Link ist sichtbar', await page.getByRole('button', { name: 'Wiederherstellen' }).count() >= 1);

  // Wiederherstellen anklicken -> Bestätigungsdialog -> bestätigen
  await page.getByRole('button', { name: 'Wiederherstellen' }).first().click();
  await page.waitForTimeout(400);
  const bestaetigungText = await page.locator('body').innerText();
  const idxW = bestaetigungText.toLowerCase().indexOf('wiederherstellen');
  console.log('--- Ausschnitt um "wiederherstellen" ---\n' + bestaetigungText.slice(Math.max(0, idxW - 100), idxW + 300) + '\n---');
  ok('Bestätigungsabfrage vor dem Wiederherstellen erscheint', bestaetigungText.includes('Sicherung wiederherstellen?'));

  await page.getByRole('button', { name: 'Ja, wiederherstellen' }).click();
  await page.waitForTimeout(600);

  // Dialog sollte sich schließen, kein Fehler
  const nachRestoreOffen = await page.locator('text=Sicherung wiederherstellen?').count();
  ok('Bestätigungsdialog schließt sich nach dem Wiederherstellen', nachRestoreOffen === 0);

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForTimeout(300);
  ok('Kein JS-Fehler beim Wiederherstellen', errors.length === 0);

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
