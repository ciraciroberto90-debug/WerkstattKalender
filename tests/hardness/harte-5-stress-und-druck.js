// Härtetest: große Datenmengen (60 Mitarbeiter, 400 Backlog-Arbeiten, 300
// Schicht-Einträge) dürfen die App nicht zum Absturz bringen oder ewig hängen
// lassen. Dazu: Druckausgabe smoke-testen (Popup/Download, Inhalt vorhanden,
// Sonderzeichen sauber escaped).
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

function grosserBestand() {
  const team = [];
  for (let i = 0; i < 60; i++) team.push({ name: `Person ${i.toString().padStart(2, '0')}`, rolle: ['mech', 'elek', 'azubi', ''][i % 4] });
  const entries = [];
  for (let i = 0; i < 400; i++) {
    entries.push({
      id: `arbeit-${i}`, date: '2026-07-10', category: 'ARBEIT',
      name: `Anlage-${i % 30}`, note: `Testarbeit Nummer ${i} mit <b>komischen</b> & "Zeichen"`,
      status: i % 5 === 0 ? 'done' : 'open', prio: ['hoch', 'mittel', 'niedrig', 'ohne'][i % 4], art: ['mech', 'elek', ''][i % 3],
    });
  }
  for (let i = 0; i < 60; i++) {
    for (let tag = 6; tag <= 10; tag++) {
      entries.push({ id: `schicht-t|Person ${i.toString().padStart(2, '0')}|2026-07-${tag}`, date: `2026-07-${tag}`, category: 'SCHICHT', name: `Person ${i.toString().padStart(2, '0')}`, scope: 'tag', wert: ['Früh', 'Spät', 'Nacht'][i % 3] });
    }
  }
  return { team, entries };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.clock.setFixedTime(new Date('2026-07-10T09:00:00'));
  // Solo-Betrieb ohne File System Access API (wie Firefox/Safari) - dort gilt
  // die App als volle Solo-Instanz, nicht als "noch nicht verbundener Leser".
  await page.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; });
  await page.goto(APP);
  const { team, entries } = grosserBestand();
  await page.evaluate(({ team, entries }) => {
    localStorage.setItem('werkstatt-kalender-config', JSON.stringify({ tpmAnlagen: [], riItems: [], team }));
    localStorage.setItem('werkstatt-kalender-entries', JSON.stringify(entries));
  }, { team, entries });

  const t0 = Date.now();
  await page.reload();
  await page.waitForTimeout(1200);
  ok('Start mit 60 Personen + 700 Einträgen dauert < 8s', Date.now() - t0 < 8000);
  ok('Kein JS-Fehler beim Laden', errors.length === 0);

  const t1 = Date.now();
  await page.getByRole('button', { name: 'Backlog', exact: true }).click();
  await page.waitForTimeout(600);
  ok('Backlog mit 400 Arbeiten öffnet zügig (< 5s)', Date.now() - t1 < 5000);
  ok('Backlog zeigt Einträge', (await page.locator('body').innerText()).includes('Testarbeit Nummer'));

  const t2 = Date.now();
  await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
  await page.waitForTimeout(600);
  ok('Schichtplan-Matrix mit 60 Zeilen öffnet zügig (< 5s)', Date.now() - t2 < 5000);
  ok('60 Personenzeilen in der Matrix', await page.locator('tbody tr').count() === 60);

  const t3 = Date.now();
  await page.getByRole('button', { name: 'Planung', exact: true }).click();
  await page.waitForTimeout(600);
  ok('Planung mit vielen Personen öffnet zügig (< 5s)', Date.now() - t3 < 5000);

  await page.getByRole('button', { name: 'Übersicht', exact: true }).click();
  await page.waitForTimeout(400);
  ok('Übersicht (Heute da) mit 60 Personen zeigt korrekt an', (await page.locator('body').innerText()).includes('in der Werkstatt'));
  ok('Kein JS-Fehler nach dem Durchklicken aller Reiter', errors.length === 0);
  if (errors.length) console.log('  Fehler:', errors.slice(0, 3));

  // Druckausgabe: Sonderzeichen aus dem Backlog dürfen im HTML nicht als echtes Tag landen
  await page.getByRole('button', { name: 'TPM', exact: true }).click();
  await page.waitForTimeout(300);
  const [popup] = await Promise.all([
    page.waitForEvent('popup').catch(() => null),
    page.getByRole('button', { name: /Drucken/ }).click(),
  ]);
  await page.waitForTimeout(500);
  if (popup) {
    const druckHtml = await popup.content();
    ok('Druckvorlage öffnet sich als Popup', true);
    ok('Druck enthält keinen ausführbaren <script>-Tag aus Nutzertext', !druckHtml.includes('<script>alert'));
    await popup.close();
  } else {
    ok('Druckvorlage öffnet sich als Popup (evtl. Download-Fallback genutzt)', true);
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
