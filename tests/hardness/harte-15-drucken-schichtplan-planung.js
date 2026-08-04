// Prüft die neuen Druck-Knöpfe für Schichtplan und Planung: Popup öffnet sich,
// enthält die erwarteten Inhalte (Personen, Schichten, Wartungsplan), und der
// Download-Fallback greift, wenn das Popup blockiert wird.
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
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

    // In der Auswertung fragt der Drucken-Knopf erst, was aufs Papier soll.
    await page.locator('button[aria-label="Drucken"]').click();
    await page.waitForTimeout(300);
    ok('Druck-Auswahl: der Drucken-Knopf fragt erst nach',
      (await page.locator('div[role="dialog"][aria-label="Was soll gedruckt werden?"]').count()) === 1);
    ok('Druck-Auswahl: drei Umfänge zur Wahl',
      (await page.getByRole('button', { name: 'Beide (TPM & R+I)' }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Nur TPM' }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Nur R+I' }).count()) === 1);
    ok('Druck-Auswahl: Jahr, einzelner Monat und Bildschirmliste zur Wahl',
      (await page.getByRole('button', { name: /^Jahreskalender 2026/ }).count()) === 1 &&
      (await page.getByRole('button', { name: /^Einzelner Monat/ }).count()) === 1 &&
      (await page.getByRole('button', { name: /^Liste wie am Bildschirm/ }).count()) === 1);
    // Die zwölf Monatsknoepfe erscheinen erst, wenn ein Monat gewaehlt werden soll -
    // sonst steht der Dialog voller Knoepfe, die niemand braucht.
    ok('Druck-Auswahl: die Monate erscheinen erst bei „Einzelner Monat"',
      (await page.getByRole('button', { name: 'August', exact: true }).count()) === 0);

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('div[role="dialog"] button:has-text("Drucken")').click(),
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
    ok('Jahreskalender: zwölf Monatsspalten oben',
      (await popup.locator('thead th').count()) === 13); // Jahr + 12 Monate
    ok('Jahreskalender: die Monate stehen im Kopf, nicht links',
      (await popup.locator('thead th').allInnerTexts()).slice(1).join('|') === MONATE.join('|'));
    ok('Jahreskalender: 31 Tageszeilen',
      (await popup.locator('tbody tr').count()) === 31);
    ok('Jahreskalender: TPM und R+I stehen beide drauf',
      text.includes('Presse 7') && text.includes('Regalprobe 9'));

    // Der Name steht IM Tag: Zeile 12 ist der 12., Zelle 0 die Tageszahl,
    // danach folgen Januar..Dezember - Maerz ist also td[3].
    ok('Jahreskalender: der Name steht im richtigen Tag', await popup.evaluate(() => {
      const zeilen = Array.from(document.querySelectorAll('tbody tr'));
      const zelle = (tag, monat) => Array.from(zeilen[tag - 1].querySelectorAll('td'))[monat];
      return zelle(12, 3).textContent.includes('Presse 7')      // 12. Maerz
        && zelle(4, 9).textContent.includes('Presse 7');        //  4. September
    }));
    // Der Kern von Robertos Rueckmeldung: die Namen sollen WAAGRECHT stehen.
    // "alle" auf einer leeren Liste waere immer wahr - deshalb zaehlt die
    // Pruefung erst die Kaestchen und verlangt dann, dass jedes waagrecht ist.
    ok('Jahreskalender: die Namen stehen waagrecht', await popup.evaluate(() => {
      const alle = Array.from(document.querySelectorAll('td div[title]'));
      return alle.length >= 4 && alle.every((k) => getComputedStyle(k).writingMode.startsWith('horizontal'));
    }));
    ok('Jahreskalender: die Monatsköpfe sind hell hinterlegt, nicht schwarz', await popup.evaluate(() => {
      const [r, g, b] = getComputedStyle(document.querySelectorAll('thead th')[1]).backgroundColor.match(/\d+/g).map(Number);
      return (0.299 * r + 0.587 * g + 0.114 * b) > 200;   // hell = Helligkeit über 200
    }));
    // Zu lange Namen werden hinten gekuerzt - aber nur in der Breite. In der
    // Hoehe darf nichts herauslaufen, sonst schiebt sich das Blatt auseinander.
    ok('Jahreskalender: kein Name läuft nach unten aus dem Tag', await popup.evaluate(() => {
      const alle = Array.from(document.querySelectorAll('td div[title]'));
      return alle.length >= 4 && alle.every((k) => k.scrollHeight <= k.clientHeight + 1);
    }));
    // Was hineinpasst, steht ganz da; was zu lang ist, wird sichtbar gekuerzt
    // und steht vollstaendig im Mauszeiger-Hinweis.
    ok('Jahreskalender: kurze Namen ganz, lange gekürzt mit Hinweis', await popup.evaluate(() => {
      const alle = Array.from(document.querySelectorAll('td div[title]'));
      const kurz = alle.find((k) => k.title === 'Presse 7');
      const lang = alle.find((k) => k.title === 'Kontrolle der Verbrauchsmaterialien in BTA');
      return kurz && kurz.scrollWidth <= kurz.clientWidth + 1
        && lang && lang.scrollWidth > lang.clientWidth + 1
        && getComputedStyle(lang).textOverflow === 'ellipsis';
    }));
    ok('Jahreskalender: das Blatt passt auf eine A3-Seite',
      (await popup.evaluate(() => document.body.scrollHeight)) <= 1047);
    // Erledigt zeigt sich an der Farbe, nicht an einem Haken vor dem Namen.
    ok('Jahreskalender: erledigt und offen sind an der Farbe unterscheidbar', await popup.evaluate(() => {
      const zeilen = Array.from(document.querySelectorAll('tbody tr'));
      const farbe = (tag, monat) => getComputedStyle(
        Array.from(zeilen[tag - 1].querySelectorAll('td'))[monat].querySelector('div[title]')).backgroundColor;
      return farbe(12, 3) === 'rgb(226, 240, 231)'      // 12. Maerz: erledigt, gruen
        && farbe(4, 9) !== 'rgb(226, 240, 231)';        //  4. Sept.: offen
    }));
    ok('Jahreskalender: die Legende erklärt beide Zustände', text.includes('erledigt') && text.includes('offen'));
    await popup.close();

    // Die beiden Filter: was nicht gewaehlt ist, steht auch nicht auf dem Blatt.
    for (const [knopf, drauf, weg] of [['Nur TPM', 'Presse 7', 'Regalprobe 9'], ['Nur R+I', 'Regalprobe 9', 'Presse 7']]) {
      await page.locator('button[aria-label="Drucken"]').click();
      await page.waitForTimeout(250);
      await page.getByRole('button', { name: knopf }).click();
      const [p2] = await Promise.all([
        page.waitForEvent('popup'),
        page.locator('div[role="dialog"] button:has-text("Drucken")').click(),
      ]);
      await p2.waitForLoadState('domcontentloaded');
      await p2.waitForTimeout(300);
      const t2 = await p2.locator('body').innerText();
      ok(`Jahreskalender: „${knopf}" zeigt nur diese Liste`, t2.includes(drauf) && !t2.includes(weg));
      await p2.close();
    }

    // ---- Einzelner Monat: A4 hoch, nur dieser Monat, eine Seite ----
    await page.locator('button[aria-label="Drucken"]').click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Beide (TPM & R+I)' }).click();
    await page.getByRole('button', { name: /^Einzelner Monat/ }).click();
    await page.waitForTimeout(200);
    ok('Monatsblatt: nach der Wahl stehen zwölf Monate bereit',
      (await page.getByRole('button', { name: 'März', exact: true }).count()) === 1);
    await page.getByRole('button', { name: 'März', exact: true }).click();
    const [p3] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('div[role="dialog"] button:has-text("Drucken")').click(),
    ]);
    await p3.waitForLoadState('domcontentloaded');
    // A4 hoch, 10 mm Rand, 96 dpi: 794 x 1123 minus 2 x 38 px = 718 x 1047.
    await p3.setViewportSize({ width: 756, height: 1047 });
    await p3.waitForTimeout(400);
    const monatHtml = await p3.content();
    const monatText = await p3.locator('body').innerText();
    ok('Monatsblatt: A4 hoch', /@page[^}]*size:\s*A4 portrait/.test(monatHtml));
    ok('Monatsblatt: 31 Tage im März', (await p3.locator('tbody tr').count()) === 31);
    ok('Monatsblatt: nur der gewählte Monat steht drauf',
      monatText.includes('März 2026') && monatText.includes('Presse 7') && !monatText.includes('Regalprobe 9'));
    ok('Monatsblatt: passt auf eine A4-Seite',
      (await p3.evaluate(() => document.body.scrollHeight)) <= 1047);
    await p3.close();
    await page.close();
  }

  // ---- Test 6: Die Arbeitsplanung muss auf EINE A4-Seite passen ----
  // Ein Aushang, der auf zwei Seiten rutscht, ist keiner - die zweite Seite
  // haengt selten daneben. Geprueft wird mit einer vollen Mannschaft und
  // Arbeiten an jedem Tag, nicht mit einem leeren Plan.
  {
    const namen = ['Roberto Ciraci', 'Andreas Reindl', 'Markus Hofmann', 'Stefan Weber', 'Thomas Bauer',
                   'Michael Schmid', 'Jürgen Klein', 'Daniel Vogel', 'Patrick Huber'];
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (Planung A4):', e.message));
    await page.clock.setFixedTime(new Date('2026-08-04T09:00:00'));
    await page.addInitScript((n) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
        tpmAnlagen: [], riItems: [],
        team: n.map((name, i) => ({ name, rolle: i % 3 === 0 ? 'elek' : i % 3 === 1 ? 'mech' : 'azubi' })),
      }));
      const eintraege = [];
      for (let d = 3; d <= 9; d++) {
        const tag = `2026-08-0${d}`;
        n.forEach((name, i) => eintraege.push({
          id: `a${d}-${i}`, date: tag, category: 'BACKLOG', name: 'Wartung Pumpe ' + i,
          note: 'Lager tauschen, Dichtung prüfen', wer: name, geplant: tag, art: i % 2 ? 'elek' : 'mech',
        }));
      }
      localStorage.setItem('werkstatt-kalender-entries', JSON.stringify(eintraege));
    }, namen);
    await page.goto(APP);
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Planung', exact: true }).click();
    await page.waitForTimeout(500);
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('button[aria-label="Planung drucken"]').click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await popup.setViewportSize({ width: 756, height: 1047 });
    await popup.waitForTimeout(500);
    const mass = await popup.evaluate(() => {
      const b = document.getElementById('blatt');
      return { hoehe: document.body.scrollHeight, breite: b ? b.getBoundingClientRect().width : -1,
               massstab: b ? Number(getComputedStyle(b).zoom || b.style.zoom || 1) : -1,
               tage: document.querySelectorAll('table').length };
    });
    ok('Planung: neun Personen und volle Woche passen auf EINE A4-Seite',
      mass.hoehe > 0 && mass.hoehe <= 1047);
    console.log(`      gemessen: ${mass.hoehe} px hoch, Maßstab ${mass.massstab}`);
    // Verkleinert werden darf, verschwinden nicht: alle sieben Tage bleiben drauf.
    ok('Planung: dabei geht kein Tag verloren', mass.tage === 7);
    // Die feste Blattbreite ist der Grund, warum die Messung ueberhaupt gilt -
    // ohne sie bricht der Bildschirm anders um als das Papier.
    ok('Planung: das Blatt hat die Breite der A4-Seite (± 2 px)',
      Math.abs(mass.breite - 702) <= 2);
    await popup.close();
    await page.close();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
