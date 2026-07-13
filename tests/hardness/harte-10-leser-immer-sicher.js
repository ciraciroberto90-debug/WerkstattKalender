// Prüft die neue, strengere Regel: Nur-Lesen ist der SICHERE STANDARD, auch
// BEVOR eine Verbindung zur gemeinsamen Datei besteht. Volle Rechte gibt es
// nur nach BESTÄTIGTEM Schreibzugriff (oder in Solo-Browsern ohne FS-Access-API).
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const mockHandle = (mode) => ({
  name: 'kalender-daten.json', kind: 'file',
  async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":null,"entries":[],"deleted":{},"config":{}}'], 'kalender-daten.json', { type: 'application/json' }); },
  async createWritable() {
    if (mode === 'read') throw new Error('NotAllowedError: nur Lesen');
    return { async write() {}, async close() {} };
  },
  async queryPermission() { return 'granted'; },
  async requestPermission() { return 'granted'; },
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // ---- Szenario 1: Frisch geöffnet, NOCH GAR NICHT verbunden ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S1):', e.message));
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await page.goto(APP);
    await page.waitForTimeout(700);

    ok('S1: "Übersicht"-Tab sichtbar (Nur-Lesen-Standard)', await page.getByRole('button', { name: 'Übersicht', exact: true }).count() === 1);
    ok('S1: "Schichtplan"-Tab sichtbar', await page.getByRole('button', { name: 'Schichtplan', exact: true }).count() === 1);
    ok('S1: "TPM-Plan"-Tab sichtbar', await page.getByRole('button', { name: 'TPM-Plan', exact: true }).count() === 1);
    ok('S1: "Backlog"-Tab NICHT sichtbar (noch nicht verbunden = sicherer Standard)', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 0);
    ok('S1: "Planung"-Tab NICHT sichtbar', await page.getByRole('button', { name: 'Planung', exact: true }).count() === 0);
    ok('S1: "Cockpit"-Hauptreiter NICHT sichtbar', await page.getByRole('button', { name: 'Cockpit', exact: true }).count() === 0);
    ok('S1: "Gemeinsame Datei"-Knopf IST sichtbar (sonst könnte sich niemand verbinden!)', await page.locator('button[aria-label="Gemeinsame Datei"]').count() === 1);
    await page.close();
  }

  // ---- Szenario 2: Verbindet sich, bekommt NUR LESEN (readerMode bleibt) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S2):', e.message));
    await page.addInitScript((mode) => {
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":null,"entries":[],"deleted":{},"config":{}}'], 'kalender-daten.json', { type: 'application/json' }); },
        async createWritable() { throw new Error('NotAllowedError: nur Lesen'); },
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

    ok('S2: Nach Verbinden als Leser - "Übersicht" weiterhin sichtbar', await page.getByRole('button', { name: 'Übersicht', exact: true }).count() === 1);
    ok('S2: "Backlog" weiterhin NICHT sichtbar', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 0);
    ok('S2: "Gemeinsame Datei"-Knopf jetzt AUSGEBLENDET (bestätigter Leser)', await page.locator('button[aria-label="Gemeinsame Datei"]').count() === 0);
    await page.close();
  }

  // ---- Szenario 3: Verbindet sich, bekommt SCHREIBRECHTE (volle App) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S3):', e.message));
    await page.addInitScript(() => {
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":null,"entries":[],"deleted":{},"config":{}}'], 'kalender-daten.json', { type: 'application/json' }); },
        async createWritable() { return { async write() {}, async close() {} }; },
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

    ok('S3: Nach Verbinden als Bearbeiter - "Cockpit"-Hauptreiter sichtbar', await page.getByRole('button', { name: 'Cockpit', exact: true }).count() === 1);
    ok('S3: "Backlog" (im Cockpit-Untermenü) erreichbar', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 1);
    ok('S3: "Gemeinsame Datei"-Knopf sichtbar (Bearbeiter darf verwalten)', await page.locator('button[aria-label="Gemeinsame Datei"]').count() === 1);
    await page.close();
  }

  // ---- Szenario 4: Solo-Betrieb ohne File System Access API (Firefox/Safari) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S4):', e.message));
    await page.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; });
    await page.goto(APP);
    await page.waitForTimeout(700);

    ok('S4: Solo-Browser (kein FS-Access) - volle App nutzbar ("Cockpit" sichtbar)', await page.getByRole('button', { name: 'Cockpit', exact: true }).count() === 1);
    ok('S4: "Backlog" erreichbar', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 1);
    await page.close();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
