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

  // ---- Reichweite: übersteht das Netz einen Arbeitstag? ----
  // Gemessen ohne Tagesspeicher: Ein normaler Arbeitstag (alle zwei Minuten
  // eine fremde Änderung) spülte alle Sicherungen der Vortage weg - übrig
  // blieb knapp eine Stunde Rückblick. Ein Fehler, der erst am nächsten
  // Morgen auffällt, hätte dann keine Sicherung mehr. Deshalb: je Kalendertag
  // bleibt der letzte Stand erhalten.
  const seite2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seite2.on('pageerror', (e) => console.log('PAGEERROR(2):', e.message));
  await seite2.clock.install({ time: new Date('2026-08-03T06:00:00') });
  await seite2.addInitScript(() => {
    window.__inhalt = JSON.stringify({
      format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
      entries: [], deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [] },
    });
    window.__handle = {
      name: 'werkstatt-kalender-daten.json', kind: 'file',
      async getFile() { return new File([window.__inhalt], 'werkstatt-kalender-daten.json', { type: 'application/json' }); },
      async createWritable() { let b = ''; return { async write(c) { b += c; }, async close() { window.__inhalt = b; } }; },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
    };
    window.showOpenFilePicker = async () => [window.__handle];
  });
  await seite2.goto(APP);
  await seite2.waitForTimeout(300);
  await seite2.evaluate(async () => { await window.__wkSharedTest.adopt(window.__handle, 'readwrite'); });
  await seite2.waitForTimeout(200);

  // Drei Arbeitstage, je 40 fremde Änderungen im Abstand von zwei Minuten.
  // 40 > BACKUP_MAX_COUNT(30): Ohne Tagesspeicher bliebe nach Tag 3 kein
  // einziger Stand von Tag 1 oder Tag 2 übrig.
  for (let tag = 0; tag < 3; tag++) {
    for (let i = 0; i < 40; i++) {
      await seite2.clock.fastForward('02:00');
      await seite2.evaluate(async (n) => {
        const d = JSON.parse(window.__inhalt);
        d.savedAt = new Date().toISOString();
        d.entries.push({ id: 'fremd-' + n, date: '2026-08-03', category: 'NOTE', text: 'x', updatedAt: new Date().toISOString() });
        window.__inhalt = JSON.stringify(d);
        await window.__wkSharedTest.poll();
      }, tag * 100 + i);
    }
    await seite2.clock.fastForward('24:00:00'); // Feierabend bis zum nächsten Arbeitstag
  }

  const stand = await seite2.evaluate(async () => {
    const req = indexedDB.open('werkstatt-kalender-fs', 2);
    const all = await new Promise((res) => {
      req.onsuccess = () => {
        const tx = req.result.transaction('backups', 'readonly');
        const r = tx.objectStore('backups').getAll();
        r.onsuccess = () => res(r.result || []);
      };
    });
    const ts = all.map((x) => x.ts).sort();
    return { anzahl: all.length, tage: [...new Set(ts.map((t) => t.slice(0, 10)))], aeltester: ts[0], neuester: ts[ts.length - 1] };
  });
  const rueckblickStunden = (Date.parse(stand.neuester) - Date.parse(stand.aeltester)) / 3600e3;
  console.log('Sicherungen nach 3 simulierten Arbeitstagen:', stand.anzahl, '- Tage:', stand.tage.join(', '));
  console.log('Rückblick:', rueckblickStunden.toFixed(1), 'Stunden');
  ok('Sicherungen von mindestens 3 verschiedenen Tagen sind erhalten', stand.tage.length >= 3);
  ok('Rückblick reicht über 24 Stunden hinaus', rueckblickStunden > 24);
  ok('Der Speicher bleibt begrenzt (höchstens 44 Sicherungen)', stand.anzahl <= 44);

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
