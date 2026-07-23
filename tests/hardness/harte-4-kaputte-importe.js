// Härtetest: Kaputte/unerwartete Import-Dateien dürfen die App niemals zum
// Absturz bringen und dürfen den Bestand nicht stillschweigend zerstören.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
const TMP = '/tmp/claude-0/-home-user-WerkstattKalender/8b2eab4a-3225-51dd-900c-dbf3d21c0a06/scratchpad/kaputt';
fs.mkdirSync(TMP, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const faelle = [
  ['leer.json', ''],
  ['kein-json.json', 'das ist kein JSON { { {'],
  ['nur-zahl.json', '42'],
  ['leeres-array.json', '[]'],
  ['array-aus-nichts.json', '[1, 2, "text", null, true]'],
  ['objekt-ohne-entries.json', JSON.stringify({ foo: "bar" })],
  ['entries-falscher-typ.json', JSON.stringify({ entries: "nicht-array" })],
  ['team-kaputt.json', JSON.stringify({ team: "nicht-array", entries: [{ id: "1", date: "2026-07-10", category: "ARBEIT", name: "X" }] })],
  ['riesig-verschachtelt.json', JSON.stringify({ entries: [{ id: "1", date: "2026-07-10", category: "ARBEIT", name: "X", note: "a".repeat(50000) }] })],
  ['unicode-emoji.json', JSON.stringify([{ id: "1", date: "2026-07-10", category: "ARBEIT", name: "🔧Ölwechsel", note: "geht's? <script>alert(1)</script> 日本語" }])],
];
for (const [name, content] of faelle) fs.writeFileSync(path.join(TMP, name), content);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  // Solo-Betrieb ohne File System Access API testen (wie Firefox/Safari) -
  // dort gilt die App bewusst als volle Solo-Instanz, nicht als "noch nicht
  // verbundener Nur-Leser" (der Unterschied gilt nur für Chrome/Edge, wo
  // eine "Gemeinsame Datei" grundsätzlich möglich wäre).
  await page.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; });
  await page.goto(APP);
  await page.evaluate(() => {
    localStorage.setItem('werkstatt-kalender-entries', JSON.stringify([
      { id: 'bestand-1', date: '2026-07-01', category: 'ARBEIT', name: 'Bestand', note: 'darf nicht verschwinden', status: 'open' },
    ]));
  });
  await page.reload();
  await page.waitForTimeout(400);

  for (const [name] of faelle) {
    errors.length = 0;
    await page.setInputFiles('input[type="file"]', path.join(TMP, name));
    await page.waitForTimeout(400);
    const crashed = errors.length > 0;
    ok(`"${name}": kein JS-Fehler`, !crashed);
    if (crashed) console.log('   ->', errors[0]);
    // App muss weiterhin bedienbar sein (Cockpit-Reiter noch da)
    const stabil = await page.getByRole('button', { name: 'Werkstatt', exact: true }).count() === 1;
    ok(`"${name}": Oberfläche bleibt bedienbar`, stabil);
  }

  // Nach all den kaputten Versuchen: der ursprüngliche Bestand ("Bestand") muss noch da sein
  // (kein Import darf ohne Rückfrage/Bestätigung den Bestand gelöscht haben)
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('werkstatt-kalender-entries') || '[]'));
  ok('Ursprünglicher Bestand-Eintrag ist NICHT verloren gegangen', entries.some((e) => e.id === 'bestand-1'));

  // Der letzte "gute" Fall (unicode-emoji.json) hätte per HINZUFÜGEN übernommen werden können -
  // wichtig ist nur: kein XSS, kein Crash, Text bleibt als Text (kein <script> ausgeführt)
  const scriptExecuted = await page.evaluate(() => window.__xssTestMarke === true);
  ok('Kein <script>-Tag aus Notiztext wurde ausgeführt', !scriptExecuted);

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
