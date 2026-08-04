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
    // Hochformat und Zeilen-Layout: Der Ausdruck soll aussehen wie der
    // Bildschirm, damit man beim Nebeneinanderlegen nicht umdenken muss.
    const planungHtml = await popup.content();
    ok('Planung-Druck: Hochformat', /@page[^}]*size:\s*A4 portrait/.test(planungHtml));
    ok('Planung-Druck: ein Block je Tag statt einer Tagesmatrix',
      (await popup.locator('table').count()) === 7);
    ok('Planung-Druck: Spalten wie am Bildschirm (Person · Schicht · Arbeiten)',
      // innerText gibt den GERENDERTEN Text zurueck - die Kopfzeile steht in
      // Versalien, also wird ohne Ruecksicht auf Gross/Klein verglichen.
      (await popup.locator('thead th').allInnerTexts()).slice(0, 3).join('|').toLowerCase() === 'person|schicht|arbeiten & notizen');
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
        // Der laengste Name der echten Liste, zweimal am selben Tag - daran
        // haengt, ob senkrechte Namen noch in die Tagesspalte passen.
        { id: 'j4', date: '2026-05-21', category: 'RI', name: 'Kontrolle der Verbrauchsmaterialien in BTA', status: 'open' },
        { id: 'j5', date: '2026-05-21', category: 'RI', name: 'Trinkwasserfilter (Prüfung + Rückspülung)', status: 'open' },
        { id: 'j6', date: '2026-05-21', category: 'TPM', name: 'Masseaufbereitung', status: 'open' },
      ]));
      localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
        // Die App nimmt nur vollstaendige Datensaetze an (id/name/role bzw.
        // id/name/type) - sonst bleiben ihre Vorgabelisten stehen und der
        // Test prueft gegen Anlagen, die er gar nicht gesetzt hat.
        tpmAnlagen: [{ id: 'p7', name: 'Presse 7', role: 'takt' }],
        riItems: [
          { id: 'rp9', name: 'Regalprobe 9', type: 'weekly', weekday: 1 },
          { id: 'vb', name: 'Kontrolle der Verbrauchsmaterialien in BTA', type: 'monthly-day', day: 7 },
          { id: 'tw', name: 'Trinkwasserfilter (Prüfung + Rückspülung)', type: 'monthly-day', day: 9 },
        ], team: [],
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

    // Der Knopf klappt drei Umfaenge auf - Roberto druckt je nach Board
    // beides zusammen oder nur eine der beiden Listen.
    await page.locator('button[aria-label="Jahreskalender drucken"]').click();
    await page.waitForTimeout(200);
    ok('Jahreskalender: drei Umfänge zur Wahl',
      (await page.getByRole('button', { name: 'Beide (TPM & R+I)' }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Nur TPM' }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Nur R+I' }).count()) === 1);

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Beide (TPM & R+I)' }).click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    // Die Blattgroesse wird an der bedruckbaren A3-Flaeche gemessen:
    // 420x297 mm minus 10 mm Rand ringsum sind bei 96 dpi 1512 x 1047 px.
    await popup.setViewportSize({ width: 1512, height: 1047 });
    await popup.waitForTimeout(400);
    const html = await popup.content();
    const text = await popup.locator('body').innerText();

    // Der Punkt der ganzen Sache: A3, sonst haengt an der Wand eine Briefmarke.
    ok('Jahreskalender: A3 quer', /@page[^}]*size:\s*A3 landscape/.test(html));
    ok('Jahreskalender: 31 Tagesspalten',
      (await popup.locator('thead th').count()) === 32); // Jahr + 31 Tage
    ok('Jahreskalender: zwölf Monatszeilen',
      (await popup.locator('tbody tr').count()) === 12);
    ok('Jahreskalender: TPM und R+I stehen beide drauf',
      text.includes('Presse 7') && text.includes('Regalprobe 9'));

    // Der Name steht IM Tag, nicht in einer Spalte daneben: Zelle 0 ist der
    // Monat, danach folgen die Tage 1..31 - der 12. Maerz ist also td[12].
    ok('Jahreskalender: der Name steht im richtigen Tag', await popup.evaluate(() => {
      const zeilen = Array.from(document.querySelectorAll('tbody tr'));
      const maerz = Array.from(zeilen[2].querySelectorAll('td'));
      const september = Array.from(zeilen[8].querySelectorAll('td'));
      return maerz[12].textContent.includes('Presse 7') && september[4].textContent.includes('Presse 7');
    }));
    ok('Jahreskalender: Monatsnamen sind hell hinterlegt, nicht schwarz', await popup.evaluate(() => {
      const zelle = document.querySelector('tbody tr td');
      const [r, g, b] = getComputedStyle(zelle).backgroundColor.match(/\d+/g).map(Number);
      return (0.299 * r + 0.587 * g + 0.114 * b) > 200;   // hell = Helligkeit über 200
    }));
    // Kein Name darf stumm aus dem Tag herauslaufen. Weil der Name in der
    // Hoehe umbrechen darf, waechst er bei zu wenig Platz in die BREITE;
    // gemessen wird deshalb beides.
    ok('Jahreskalender: kein Name läuft aus dem Tag heraus', await popup.evaluate(() => {
      const chips = Array.from(document.querySelectorAll('td span[style*="vertical-rl"]'));
      const reihen = Array.from(document.querySelectorAll('td > div[style*="flex"]'));
      return chips.every((s) => s.scrollHeight <= s.clientHeight + 1 && s.scrollWidth <= s.clientWidth + 1)
        && reihen.every((d) => d.scrollWidth <= d.clientWidth + 1);
    }));
    // Ein Termin am Tag heisst: der Name steht vollstaendig da. Gekuerzt wird
    // nur, wenn sich mehrere lange Namen einen Tag teilen - und dann sichtbar.
    ok('Jahreskalender: allein stehende Namen werden nicht gekürzt', await popup.evaluate(() => {
      const zeilen = Array.from(document.querySelectorAll('tbody tr'));
      const mai = Array.from(zeilen[4].querySelectorAll('td'));
      const allein = mai[20].querySelector('span[style*="vertical-rl"]');   // 20. Mai: nur ein Termin
      const gedraengt = Array.from(mai[21].querySelectorAll('span[style*="vertical-rl"]')); // 21. Mai: drei
      return allein.textContent.trim() === 'Regalprobe 9'
        && gedraengt.length === 3
        && gedraengt.some((s) => s.textContent.includes('…'));
    }));
    ok('Jahreskalender: das Blatt passt auf eine A3-Seite',
      (await popup.evaluate(() => document.body.scrollHeight)) <= 1047);
    // Erledigt zeigt sich an der Farbe, nicht an einem Haken vor dem Namen -
    // der Haken kostet in der schmalen Tagesspalte eine ganze Zeile.
    ok('Jahreskalender: erledigt und offen sind an der Farbe unterscheidbar', await popup.evaluate(() => {
      const zeilen = Array.from(document.querySelectorAll('tbody tr'));
      const farbe = (zeile, tag) => getComputedStyle(
        Array.from(zeilen[zeile].querySelectorAll('td'))[tag].querySelector('span[style*="vertical-rl"]')).backgroundColor;
      return farbe(2, 12) === 'rgb(226, 240, 231)'      // 12. Maerz: erledigt, gruen
        && farbe(8, 4) !== 'rgb(226, 240, 231)';        //  4. Sept.: offen
    }));
    ok('Jahreskalender: die Legende erklärt beide Zustände', text.includes('erledigt') && text.includes('offen'));
    await popup.close();

    // Die beiden Filter: was nicht gewaehlt ist, steht auch nicht auf dem Blatt.
    for (const [knopf, drauf, weg] of [['Nur TPM', 'Presse 7', 'Regalprobe 9'], ['Nur R+I', 'Regalprobe 9', 'Presse 7']]) {
      await page.locator('button[aria-label="Jahreskalender drucken"]').click();
      await page.waitForTimeout(200);
      const [p2] = await Promise.all([
        page.waitForEvent('popup'),
        page.getByRole('button', { name: knopf }).click(),
      ]);
      await p2.waitForLoadState('domcontentloaded');
      await p2.waitForTimeout(300);
      const t2 = await p2.locator('body').innerText();
      ok(`Jahreskalender: „${knopf}" zeigt nur diese Liste`, t2.includes(drauf) && !t2.includes(weg));
      await p2.close();
    }
    await page.close();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
