// Prüft die neuen Druck-Knöpfe für Schichtplan und Planung: Popup öffnet sich,
// enthält die erwarteten Inhalte (Personen, Schichten, Wartungsplan), und der
// Download-Fallback greift, wenn das Popup blockiert wird.
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const seedTeam = (personName) => {
  localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
    tpmAnlagen: [], riItems: [], team: [{ name: personName, rolle: 'mech' }],
  }));
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // ---- Test 1: Schichtplan drucken (Popup erlaubt) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (Schichtplan):', e.message));
    await page.addInitScript((name) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
        tpmAnlagen: [], riItems: [], team: [{ name, rolle: 'mech' }],
      }));
    }, 'Testperson Schicht');
    await page.goto(APP);
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
    await page.waitForTimeout(400);

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('button[aria-label="Schichtplan drucken"]').click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(300);
    const titel = await popup.title();
    const inhalt = await popup.locator('body').innerText();
    ok('Schichtplan-Druck: Popup-Titel enthält "Schichtplan"', titel.includes('Schichtplan'));
    ok('Schichtplan-Druck: Team-Person erscheint in der Vorlage', inhalt.includes('Testperson Schicht'));
    ok('Schichtplan-Druck: Schicht-Legende ist enthalten', inhalt.includes('Früh') && inhalt.includes('Urlaub'));
    await popup.close();
    await page.close();
  }

  // ---- Test 2: Planung drucken (Popup erlaubt) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (Planung):', e.message));
    await page.addInitScript((name) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
        tpmAnlagen: [], riItems: [], team: [{ name, rolle: 'elek' }],
      }));
    }, 'Testperson Planung');
    await page.goto(APP);
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: 'Planung', exact: true }).click();
    await page.waitForTimeout(400);

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('button[aria-label="Planung drucken"]').click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(300);
    const titel = await popup.title();
    const inhalt = await popup.locator('body').innerText();
    ok('Planung-Druck: Popup-Titel enthält "Planung KW"', titel.includes('Planung KW'));
    ok('Planung-Druck: Team-Person erscheint in der Vorlage', inhalt.includes('Testperson Planung'));
    ok('Planung-Druck: Wartungsplan-Zeile ist enthalten', inhalt.includes('Wartungsplan'));
    await popup.close();
    await page.close();
  }

  // ---- Test 3: Popup blockiert -> Download-Fallback (Schichtplan) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (Fallback):', e.message));
    await page.addInitScript((name) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
        tpmAnlagen: [], riItems: [], team: [{ name, rolle: 'mech' }],
      }));
      // Popup-Blocker simulieren: window.open liefert null zurück.
      window.open = () => null;
    }, 'Testperson Fallback');
    await page.goto(APP);
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
    await page.waitForTimeout(400);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button[aria-label="Schichtplan drucken"]').click(),
    ]);
    ok('Fallback bei blockiertem Popup: Datei wird heruntergeladen', !!download);
    const textNachFallback = await page.locator('body').innerText();
    ok('Fallback bei blockiertem Popup: Hinweistext erscheint', textNachFallback.includes('heruntergeladen'));

    await page.close();
  }

  // ---- Test 4: Reader-Modus darf trotzdem drucken (nur ansehen, kein Bearbeiten) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (Leser):', e.message));
    await page.addInitScript((name) => {
      localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
        tpmAnlagen: [], riItems: [], team: [{ name, rolle: 'mech' }],
      }));
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() {
          return new File([JSON.stringify({
            format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
            entries: [], deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [{ name, rolle: 'mech' }] },
          })], 'kalender-daten.json', { type: 'application/json' });
        },
        async createWritable() { throw Object.assign(new Error('nur lesen'), { name: 'NotAllowedError' }); },
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
      };
      window.showOpenFilePicker = async () => [handle];
    }, 'Testperson Leser');
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
    await page.waitForTimeout(400);
    const druckKnopf = page.locator('button[aria-label="Schichtplan drucken"]');
    ok('Leser: Drucken-Knopf im Schichtplan ist trotzdem sichtbar', await druckKnopf.count() === 1);

    await page.close();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
