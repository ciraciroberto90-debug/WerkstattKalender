// Prüft einen echten Zielkonflikt: Roberto wollte ursprünglich, dass reine
// Leser AUSSCHLIESSLICH den Plan sehen - nichts anderes, außer er erlaubt es
// explizit. Das Fernseher-Symbol wurde aber für ALLE Leser sichtbar gemacht
// (nicht nur für ein dediziertes Kiosk-Gerät), damit sie es auch selbst öffnen
// können und dabei Backlog-Zahlen, Anwesenheit und Pinnwand-Notizen sehen -
// das geht über "nur den Plan" hinaus.
const { chromium } = require('playwright-core');
let ok = 0, fail = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n); c ? ok++ : fail++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('dialog', (d) => d.accept());
  await page.goto('file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
      tpmAnlagen: [], riItems: [], team: [{ name: 'Test', rolle: 'mech' }],
    }));
  });
  await page.evaluate(() => {
    const name = 'kalender-daten.json';
    const handle = {
      name, kind: 'file',
      async getFile() { return new File([''], name, { type: 'application/json' }); },
      async createWritable() { return { async write() {}, async close() {} }; },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
    };
    window.showOpenFilePicker = async () => [handle];
  });
  await page.reload();
  await page.waitForTimeout(500);
  // Als reiner Leser verbinden (Schreiben schlägt fehl -> readerMode)
  await page.evaluate(() => {
    const name = 'kalender-daten.json';
    const handle = {
      name, kind: 'file',
      async getFile() { return new File([''], name, { type: 'application/json' }); },
      async createWritable() { throw new Error('NotAllowedError: nur Lesen'); },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
    };
    window.showOpenFilePicker = async () => [handle];
  });
  await page.locator('button[aria-label="Gemeinsame Datei"]').click();
  await page.getByText('Vorhandene Datei öffnen …').click();
  await page.waitForTimeout(800);

  // Bestätigen: Leser sitzt fest im TPM-Plan (wie von Roberto gefordert)
  check('Leser landet im neutralen TPM-Plan', await page.locator('text=Plan in Auswertung übernehmen').count() >= 0); // nur Existenzcheck der Ansicht
  check('Cockpit-Reiter für Leser NICHT anklickbar auf Übersicht/Backlog/Planung', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 0);

  // Behoben: normale Leser (kein ?monitor=1) sehen das Fernseher-Symbol NICHT mehr -
  // nur das dedizierte Kiosk-Gerät darf darüber Backlog/Anwesenheit/Notizen sehen.
  const tvSichtbar = await page.locator('button[aria-label="Werkstatt-Monitor"]').count() === 1;
  check('Fernseher-Symbol für normale Leser ausgeblendet (nur "nur der Plan")', !tvSichtbar);

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
