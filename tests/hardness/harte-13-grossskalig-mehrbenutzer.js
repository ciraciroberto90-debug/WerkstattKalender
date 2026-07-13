// Prüft die Schnittstelle mit realistischer Datenmenge (wie nach dem
// Excel-Import: ~1600+ Einträge, 21 Personen) UND gleichzeitigem Schreiben
// von zwei Bearbeitern - genau das Szenario, das jetzt live läuft.
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

function grossbestand() {
  const team = [];
  for (let i = 0; i < 21; i++) team.push({ name: `Person ${i}`, rolle: ['mech', 'elek', 'azubi'][i % 3] });
  const entries = [];
  const start = new Date('2025-11-05');
  for (let i = 0; i < 21; i++) {
    for (let tag = 0; tag < 116; tag++) {
      const d = new Date(start); d.setDate(d.getDate() + tag);
      if (Math.random() < 0.35) continue;
      const key = d.toISOString().slice(0, 10);
      entries.push({
        id: `schicht-t|Person ${i}|${key}`, date: key, category: 'SCHICHT',
        name: `Person ${i}`, scope: 'tag', wert: ['Früh', 'Spät', 'Nacht', 'Urlaub'][tag % 4],
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return { team, entries };
}

const drive = { 'kalender-daten.json': '' };

async function makeUser(browser, uhrzeit) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.clock.setFixedTime(new Date(uhrzeit));
  await page.exposeFunction('__fsRead', (n) => drive[n] ?? '');
  await page.exposeFunction('__fsWrite', (n, c) => { drive[n] = c; });
  await page.addInitScript(() => {
    const name = 'kalender-daten.json';
    const handle = {
      name, kind: 'file',
      async getFile() { const t = await window.__fsRead(name); return new File([t], name, { type: 'application/json' }); },
      async createWritable() { let b = ''; return { async write(c) { b += c; }, async close() { await window.__fsWrite(name, b); } }; },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
    };
    window.showOpenFilePicker = async () => [handle];
  });
  await page.goto(APP);
  await page.waitForTimeout(500);
  return page;
}
async function connect(page) {
  await page.locator('button[aria-label="Gemeinsame Datei"]').click();
  await page.getByText('Vorhandene Datei öffnen …').click();
  await page.waitForTimeout(1000);
}
const setzeSchicht = async (page, person, schicht) => {
  await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
  await page.waitForTimeout(300);
  await page.locator(`button[aria-label="Matrix ${person} 2026-07-13"]`).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: schicht, exact: true }).click();
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
  const { team, entries } = grossbestand();
  console.log('Simulierter Bestand:', entries.length, 'Einträge,', team.length, 'Personen');
  drive['kalender-daten.json'] = JSON.stringify({
    format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(), entries, deleted: {},
    config: { tpmAnlagen: [], riItems: [], team },
  });

  const page1 = await makeUser(browser, '2026-07-13T09:00:00');
  const t0 = Date.now();
  await connect(page1);
  ok('Verbinden mit ~' + entries.length + ' Einträgen dauert < 8s', Date.now() - t0 < 8000);

  const t1 = Date.now();
  await page1.getByRole('button', { name: 'Schichtplan', exact: true }).click();
  await page1.waitForTimeout(700);
  ok('Schichtplan-Matrix mit 21 Personen öffnet zügig (< 6s)', Date.now() - t1 < 6000);
  ok('21 Personenzeilen in der Matrix', await page1.locator('tbody tr').count() === 21);

  const page2 = await makeUser(browser, '2026-07-13T09:00:05');
  await connect(page2);

  // Beide setzen GLEICHZEITIG eine unterschiedliche Schicht für UNTERSCHIEDLICHE Personen
  await Promise.all([
    setzeSchicht(page1, 'Person 0', 'Nacht'),
    setzeSchicht(page2, 'Person 1', 'Urlaub'),
  ]);
  await page1.waitForTimeout(4000);
  await page2.waitForTimeout(4000);

  const endInhalt = JSON.parse(drive['kalender-daten.json']);
  const p0 = endInhalt.entries.find((e) => e.name === 'Person 0' && e.date === '2026-07-13');
  const p1e = endInhalt.entries.find((e) => e.name === 'Person 1' && e.date === '2026-07-13');
  ok('Gleichzeitiges Schreiben (2 Bearbeiter, großer Bestand): Person 0 = Nacht korrekt gespeichert', p0 && p0.wert === 'Nacht');
  ok('Gleichzeitiges Schreiben (2 Bearbeiter, großer Bestand): Person 1 = Urlaub korrekt gespeichert', p1e && p1e.wert === 'Urlaub');
  ok('Gesamtzahl Einträge in der Datei ist nicht kleiner geworden (kein Datenverlust)', endInhalt.entries.length >= entries.length);

  // Beide Seiten müssen nach kurzer Zeit (Poll) BEIDE Änderungen sehen
  await page1.evaluate(() => window.__wkSharedTest.poll());
  await page2.evaluate(() => window.__wkSharedTest.poll());
  await page1.waitForTimeout(300);
  await page2.waitForTimeout(300);
  const entries1 = await page1.evaluate(() => JSON.parse(localStorage.getItem('werkstatt-kalender-entries') || '[]'));
  const entries2 = await page2.evaluate(() => JSON.parse(localStorage.getItem('werkstatt-kalender-entries') || '[]'));
  ok('Bearbeiter 1 sieht nach Poll auch die Änderung von Bearbeiter 2 (Person 1 = Urlaub)', entries1.some((e) => e.name === 'Person 1' && e.date === '2026-07-13' && e.wert === 'Urlaub'));
  ok('Bearbeiter 2 sieht nach Poll auch die Änderung von Bearbeiter 1 (Person 0 = Nacht)', entries2.some((e) => e.name === 'Person 0' && e.date === '2026-07-13' && e.wert === 'Nacht'));

  await page1.close();
  await page2.close();

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
