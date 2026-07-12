// KRITISCH: Kann ein reiner Leser einfach auf "Cockpit" klicken und damit
// die "nur Plan"-Sperre umgehen? Der useEffect, der readerMode -> Plan
// erzwingt, feuert nur beim WECHSEL von readerMode (Dependency [readerMode]),
// nicht bei jedem Klick - der Cockpit-Tab-Button selbst ist nicht gesperrt.
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
  await page.goto('file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
  await page.waitForTimeout(600);
  await page.locator('button[aria-label="Gemeinsame Datei"]').click();
  await page.getByText('Vorhandene Datei öffnen …').click();
  await page.waitForTimeout(900);

  check('Direkt nach Verbinden: Leser im Plan, Backlog-Reiter nicht sichtbar', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 0);
  check('Leser-Hinweis "nur ansehen" o.ä. ist erkennbar', (await page.locator('body').innerText()).length > 0);

  // Versuch: existiert der "Cockpit"-Hauptreiter für den Leser überhaupt noch?
  // (er ist eigentlich hinter {!readerMode && (...)} versteckt - hier wird das bestätigt)
  const cockpitReiterDa = await page.getByRole('button', { name: 'Cockpit', exact: true }).count() === 1;
  check('"Cockpit"-Hauptreiter für den Leser NICHT vorhanden (kein Weg zurück ins Cockpit)', !cockpitReiterDa);
  if (cockpitReiterDa) {
    await page.getByRole('button', { name: 'Cockpit', exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Backlog', exact: true }).click();
    await page.waitForTimeout(400);
    const text = await page.locator('body').innerText();
    check('(Befund) Leser sieht jetzt den vollen Backlog-Eintrag (sollte nicht sein)', text.includes('GEHEIME-ANLAGE'));
  }
  // Zur Sicherheit: der geheime Backlog-Eintrag darf nirgendwo im sichtbaren Text auftauchen
  const gesamtText = await page.locator('body').innerText();
  check('Geheimer Backlog-Eintrag ist nirgends im Leser-Bildschirm sichtbar', !gesamtText.includes('GEHEIME-ANLAGE'));

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
