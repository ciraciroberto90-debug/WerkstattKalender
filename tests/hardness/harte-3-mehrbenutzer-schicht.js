// Härtetest: Zwei Bearbeiter setzen GLEICHZEITIG unterschiedliche Schichten
// für verschiedene Personen (SCHICHT-Kategorie), dazu einer eine Planungs-Notiz
// (PLANNOTIZ) - beide müssen nach dem Sync alle Änderungen des jeweils anderen
// sehen, nichts darf verloren gehen (dieselbe Garantie wie für TPM/ARBEIT).
const { chromium } = require('playwright-core');
const drive = { 'kalender-daten.json': '' };
let ok = 0, fail = 0;
function check(n, c) { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n); c ? ok++ : fail++; }

async function makeUser(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.clock.setFixedTime(new Date('2026-07-10T09:00:00'));
  await page.exposeFunction('__fsRead', (n) => drive[n] ?? '');
  await page.exposeFunction('__fsWrite', (n, c) => { drive[n] = c; });
  // addInitScript statt evaluate: überlebt auch ein reload() (neue Dokument-Ladung)
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
    window.showSaveFilePicker = async () => handle;
  });
  await page.goto('file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
  await page.waitForTimeout(800);
  return page;
}
async function connect(page, create) {
  await page.locator('button[aria-label="Gemeinsame Datei"]').click();
  await page.getByText(create ? 'Neue gemeinsame Datei anlegen …' : 'Vorhandene Datei öffnen …').click();
  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  const admin1 = await makeUser(browser);
  await connect(admin1, true);
  // Team anlegen (beide Admins brauchen dasselbe Team dafür)
  await admin1.evaluate(() => {
    localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
      tpmAnlagen: [], riItems: [],
      team: [{ name: 'Person A', rolle: 'mech' }, { name: 'Person B', rolle: 'mech' }],
    }));
  });
  await admin1.reload();
  await admin1.waitForTimeout(600);
  await connect(admin1, false); // erneut verbinden nach Reload

  const admin2 = await makeUser(browser);
  await connect(admin2, false); // Admin2 öffnet dieselbe (jetzt existierende) Datei
  await admin2.waitForTimeout(600);

  // Beide in die Planung
  await admin1.getByRole('button', { name: 'Planung', exact: true }).click();
  await admin2.getByRole('button', { name: 'Planung', exact: true }).click();
  await admin1.waitForTimeout(300);
  await admin2.waitForTimeout(300);

  // Admin1: Schicht für Person A setzen
  await admin1.locator('button[aria-label="Schicht Person A 2026-07-10"]').click();
  await admin1.waitForTimeout(150);
  await admin1.locator('div[style*="fixed"]').last().getByRole('button', { name: 'Früh', exact: true }).click();
  await admin1.waitForTimeout(300);

  // Uhr für admin2 einen Tick weiterstellen (reale Zeit vergeht zwischen zwei Aktionen immer)
  await admin2.clock.setFixedTime(new Date('2026-07-10T09:00:02Z'));
  // Admin2 (fast gleichzeitig, hat den Stand von Admin1 noch NICHT gesehen): Schicht für Person B setzen
  await admin2.locator('button[aria-label="Schicht Person B 2026-07-10"]').click();
  await admin2.waitForTimeout(150);
  await admin2.locator('div[style*="fixed"]').last().getByRole('button', { name: 'Nacht', exact: true }).click();
  await admin2.waitForTimeout(300);

  await admin2.clock.setFixedTime(new Date('2026-07-10T09:00:04Z'));
  // Admin2 zusätzlich: freie Notiz für Person A hinterlassen (ohne Schicht von Person A gesehen zu haben)
  const zelleA_bei2 = admin2.locator('button[aria-label="Schicht Person A 2026-07-10"]').locator('xpath=..');
  await zelleA_bei2.getByRole('button', { name: 'Arbeit oder Notiz eintragen' }).click();
  await admin2.waitForTimeout(150);
  await admin2.getByRole('button', { name: /Stattdessen freie Notiz/ }).click();
  await admin2.waitForTimeout(150);
  await admin2.locator('textarea[placeholder*="Zahnarzt"]').fill('Von Admin2 fuer Person A');
  await admin2.getByRole('button', { name: 'Speichern', exact: true }).click();
  await admin2.waitForTimeout(400);

  await admin1.clock.setFixedTime(new Date('2026-07-10T09:00:06Z'));
  // Beide pollen jetzt (30s-Intervall simulieren wir über den Test-Hook)
  await admin1.evaluate(() => window.__wkSharedTest.poll());
  await admin1.waitForTimeout(500);
  await admin2.evaluate(() => window.__wkSharedTest.poll());
  await admin2.waitForTimeout(500);
  await admin1.evaluate(() => window.__wkSharedTest.poll());
  await admin1.waitForTimeout(500);

  // Admin1 muss jetzt auch Person B (Nacht) UND die Notiz von Admin2 sehen
  const schichtB_bei1 = (await admin1.locator('button[aria-label="Schicht Person B 2026-07-10"]').innerText()).trim().toLowerCase();
  check('Admin1 sieht Schicht von Admin2 (Person B = Nacht)', schichtB_bei1 === 'n');
  const zelleA_bei1 = admin1.locator('button[aria-label="Schicht Person A 2026-07-10"]').locator('xpath=..');
  check('Admin1 sieht die Notiz von Admin2', await zelleA_bei1.locator('button', { hasText: 'Von Admin2' }).count() === 1);

  // Admin2 muss die Schicht von Admin1 sehen (Person A = Früh), OBWOHL Admin2
  // in der Zwischenzeit selbst eine Notiz für dieselbe Person A gespeichert hat
  const schichtA_bei2 = (await admin2.locator('button[aria-label="Schicht Person A 2026-07-10"]').innerText()).trim().toLowerCase();
  check('Admin2 sieht Schicht von Admin1 (Person A = Früh) trotz eigener Notiz-Änderung', schichtA_bei2 === 'f');

  // Beide Schichten UND die Notiz müssen auf der "Festplatte" (drive) present sein
  const daten = JSON.parse(drive['kalender-daten.json']);
  const schichten = daten.entries.filter((e) => e.category === 'SCHICHT');
  check('Beide Wochen-Schichten liegen in der Datei (Person A + Person B)',
    schichten.some((e) => e.name === 'Person A' && e.wert === 'Früh') &&
    schichten.some((e) => e.name === 'Person B' && e.wert === 'Nacht'));
  const notizen = daten.entries.filter((e) => e.category === 'PLANNOTIZ');
  check('Notiz liegt in der Datei', notizen.length === 1 && notizen[0].note.includes('Von Admin2'));

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
