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

  // ---- Test 4: Schichtplan WOCHENWEISE (quer, ein Blatt je KW) ----
  // Fuer den Aushang. Geprueft wird, dass wirklich mehrere Seiten entstehen
  // und dass jede quer steht - ein Wochenplan im Hochformat waere unbrauchbar.
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (Wochen):', e.message));
    await page.clock.setFixedTime(new Date('2026-08-04T09:00:00'));
    await page.addInitScript(() => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      const eintraege = [];
      for (let tag = 1; tag <= 31; tag++) {
        eintraege.push({ id: 's' + tag, date: `2026-08-${String(tag).padStart(2, '0')}`,
          category: 'SCHICHT', name: 'Testperson Woche', scope: 'tag', wert: 'Früh' });
      }
      localStorage.setItem('werkstatt-kalender-entries', JSON.stringify(eintraege));
      localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
        tpmAnlagen: [], riItems: [], team: [{ name: 'Testperson Woche', rolle: 'mech' }],
      }));
    });
    await page.goto(APP);
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
    await page.waitForTimeout(500);

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('button[aria-label="Schichtplan wochenweise drucken"]').click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(400);
    const html = await popup.content();
    const text = await popup.locator('body').innerText();

    ok('Wochenblatt: Querformat', /@page[^}]*size:\s*A4 landscape/.test(html));
    const seiten = (html.match(/page-break-before:\s*always/g) || []).length + 1;
    ok('Wochenblatt: mehrere Seiten, eine je Kalenderwoche', seiten >= 4 && seiten <= 6);
    ok('Wochenblatt: Kalenderwoche steht im Kopf', /KW \d{1,2} · \d{2}\.\d{2}\.\d{4}/.test(text));
    ok('Wochenblatt: die Person steht drauf', text.includes('Testperson Woche'));
    ok('Wochenblatt: sieben Tagesspalten je Seite',
      (await popup.locator('thead th').count()) === seiten * 8); // 1 Namensspalte + 7 Tage
    await popup.close(); await page.close();
  }

  // ---- Test 5: TPM/R+I Jahreskalender (A3 quer, fuers Board) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (Jahreskalender):', e.message));
    await page.clock.setFixedTime(new Date('2026-08-04T09:00:00'));
    await page.addInitScript(() => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem('werkstatt-kalender-entries', JSON.stringify([
        { id: 'j1', date: '2026-03-12', category: 'TPM', name: 'Presse 7', status: 'done' },
        { id: 'j2', date: '2026-09-04', category: 'TPM', name: 'Presse 7', status: 'open' },
        { id: 'j3', date: '2026-05-20', category: 'RI', name: 'Regalprobe 9', status: 'done' },
      ]));
      localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
        // Die App nimmt nur vollstaendige Datensaetze an (id/name/role bzw.
        // id/name/type) - sonst bleiben ihre Vorgabelisten stehen und der
        // Test prueft gegen Anlagen, die er gar nicht gesetzt hat.
        tpmAnlagen: [{ id: 'p7', name: 'Presse 7', role: 'takt' }],
        riItems: [{ id: 'rp9', name: 'Regalprobe 9', type: 'weekly', weekday: 1 }], team: [],
      }));
    });
    await page.goto(APP);
    await page.waitForTimeout(900);
    // Der Knopf gehoert in die Jahresansicht - dort ist das Jahr gewaehlt.
    await page.getByRole('button', { name: 'TPM', exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Auswertung', exact: true }).first().click();
    await page.waitForTimeout(500);
    const jahr = page.getByRole('button', { name: /^Jahr$/ });
    if (await jahr.count()) { await jahr.first().click(); await page.waitForTimeout(500); }

    ok('Jahreskalender: Knopf ist in der Jahresansicht da',
      (await page.locator('button[aria-label="Jahreskalender drucken"]').count()) === 1);

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('button[aria-label="Jahreskalender drucken"]').click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(400);
    const html = await popup.content();
    const text = await popup.locator('body').innerText();

    // Der Punkt der ganzen Sache: A3, sonst haengt an der Wand eine Briefmarke.
    ok('Jahreskalender: A3 quer', /@page[^}]*size:\s*A3 landscape/.test(html));
    ok('Jahreskalender: zwölf Monatsspalten',
      (await popup.locator('thead th').count()) === 13); // Name + 12 Monate
    ok('Jahreskalender: TPM und R+I stehen beide drauf',
      text.includes('Presse 7') && text.includes('Regalprobe 9'));
    ok('Jahreskalender: der Termin steht im richtigen Monat', await popup.evaluate(() => {
      const zeile = Array.from(document.querySelectorAll('tbody tr')).find((r) => r.textContent.includes('Presse 7'));
      if (!zeile) return false;
      const zellen = Array.from(zeile.querySelectorAll('td'));
      // Spalte 0 = Name, danach Jan..Dez. Maerz = Index 3, September = Index 9.
      return /12/.test(zellen[3].textContent) && /04/.test(zellen[9].textContent);
    }));
    ok('Jahreskalender: erledigt und offen sind unterscheidbar', /✓/.test(text) && /offen/.test(text));
    await popup.close(); await page.close();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
