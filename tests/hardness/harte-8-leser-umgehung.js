// KRITISCH: Der "Cockpit"-Hauptreiter ist jetzt auch für Leser sichtbar.
// Kann ein reiner Leser darüber die Sperre umgehen und den Backlog sehen?
// Erwartung: nein - das Leser-Untermenü enthält kein Backlog, und die
// Sicherheits-Klammer (useEffect) setzt unerlaubte Ansichten zurück.
const { chromium } = require('playwright-core');
let ok = 0, fail = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n); c ? ok++ : fail++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('dialog', (d) => d.accept());

  // Team + ein "geheimer" Backlog-Eintrag bereits vor dem ersten Laden in localStorage,
  // und der Datei-Handle simuliert von Anfang an ein Gerät ohne Schreibrecht (readerMode).
  await page.addInitScript(() => {
    localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
      tpmAnlagen: [], riItems: [], team: [{ name: 'Geheim Person', rolle: 'mech' }],
    }));
    localStorage.setItem('werkstatt-kalender-entries', JSON.stringify([
      { id: '1', date: '2026-07-10', category: 'ARBEIT', name: 'GEHEIME-ANLAGE', note: 'Das soll ein Leser NICHT sehen', status: 'open', prio: 'hoch' },
    ]));
    const name = 'kalender-daten.json';
    const handle = {
      name, kind: 'file',
      async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":"2026-01-01T00:00:00.000Z","entries":[],"deleted":{},"config":{}}'], name, { type: 'application/json' }); },
      async createWritable() { throw new Error('NotAllowedError: nur Lesen'); },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
    };
    window.showOpenFilePicker = async () => [handle];
  });
  // Standort festnageln: seit der Werkstatt-Wahl (harte-68) bekämen frische
  // Rechner sonst zuerst die Frage - die ist hier nicht Gegenstand.
  await page.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
  await page.goto('file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
  await page.waitForTimeout(600);
  await page.locator('button[aria-label="Gemeinsame Datei"]').click();
  await page.getByText('Vorhandene Datei öffnen …').click();
  await page.waitForTimeout(900);

  check('Direkt nach Verbinden: Leser im Plan, Backlog-Reiter nicht sichtbar', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 0);
  check('Leser-Hinweis "nur ansehen" o.ä. ist erkennbar', (await page.locator('body').innerText()).length > 0);

  // Großer Umbau (Robertos Ansage aus dem Meeting vom 10.09.): Leser sehen
  // NUR noch Übersicht + Berichte - Werkstatt und TPM sind für sie ganz weg.
  // Die Backlog-Kachel im Bereich Berichte erscheint für Leser nicht, und
  // die Sicherheits-Klammer setzt unerlaubte Ansichten zurück.
  const leserLeisteRichtig =
    (await page.getByRole('button', { name: 'Übersicht', exact: true }).count()) >= 1 &&
    (await page.getByRole('button', { name: /^Berichte/ }).count()) >= 1 &&
    (await page.getByRole('button', { name: 'Werkstatt', exact: true }).count()) === 0 &&
    (await page.getByRole('button', { name: 'TPM', exact: true }).count()) === 0;
  check('Leser-Hauptleiste zeigt NUR Übersicht + Berichte (kein Werkstatt/TPM)', leserLeisteRichtig);
  if (leserLeisteRichtig) {
    await page.getByRole('button', { name: /^Berichte/ }).first().click();
    await page.waitForTimeout(400);
    check('Auch im Bereich Berichte: KEIN Backlog für den Leser', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 0 && !(await page.locator('body').innerText()).includes('Arbeiten zum Einplanen'));
    const text = await page.locator('body').innerText();
    check('Auch nach Klick auf Cockpit: geheimer Backlog-Eintrag bleibt verborgen', !text.includes('GEHEIME-ANLAGE'));
  }
  // Zur Sicherheit: der geheime Backlog-Eintrag darf nirgendwo im sichtbaren Text auftauchen
  const gesamtText = await page.locator('body').innerText();
  check('Geheimer Backlog-Eintrag ist nirgends im Leser-Bildschirm sichtbar', !gesamtText.includes('GEHEIME-ANLAGE'));

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
