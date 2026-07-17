// Härtetest: Die eigene STÖRUNGEN-Datei (zweite Sync-Instanz).
// Prüft, dass sie dieselben Sicherheiten wie die Hauptdatei hat und dass sie
// unabhängig ist:
//  (1) Auch reine Leser der Hauptdaten (nicht verbunden) dürfen Störungen anlegen.
//  (2) Zwei Bearbeiter, die fast gleichzeitig je eine Störung melden, sehen nach
//      dem Sync beide Störungen (Eintrag-für-Eintrag-Merge, nichts geht verloren).
//  (3) Eine gelöschte Störung bleibt nach dem Abgleich gelöscht (Tombstone).
//  (4) Die Hauptdatei (kalender-daten.json) wird dabei NICHT angefasst.
const { chromium } = require('playwright-core');
const drive = { 'werkstatt-stoerungen.json': '', 'kalender-daten.json': '' };
let ok = 0, fail = 0;
function check(n, c) { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n); c ? ok++ : fail++; }

async function makeUser(browser, t) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1500, height: 1000 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.clock.setFixedTime(new Date(t));
  await page.exposeFunction('__fsRead', (n) => drive[n] ?? '');
  await page.exposeFunction('__fsWrite', (n, c) => { drive[n] = c; });
  await page.addInitScript(() => {
    const mk = (name) => ({
      name, kind: 'file',
      async getFile() { const t = await window.__fsRead(name); return new File([t], name, { type: 'application/json' }); },
      async createWritable() { let b = ''; return { async write(c) { b += c; }, async close() { await window.__fsWrite(name, b); } }; },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
    });
    // Der Störungen-Picker liefert die Störungen-Datei (Hauptdatei wird hier nie verbunden).
    window.showOpenFilePicker = async () => [mk('werkstatt-stoerungen.json')];
    window.showSaveFilePicker = async () => mk('werkstatt-stoerungen.json');
  });
  await page.goto('file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
  await page.waitForTimeout(700);
  return page;
}

// Über den Reiter "Störungen" die Störungen-Datei verbinden
async function verbindeStoer(page, create) {
  await page.getByRole('button', { name: /Störungen/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: create ? /neu anlegen/ : /Störungen-Datei öffnen/ }).click();
  await page.waitForTimeout(700);
}

// Schicht "Früh" in der Liste aufklappen, damit die Zeilen sichtbar werden.
// Idempotent: nur klicken, wenn noch keine Zeile sichtbar ist.
async function zeigeFrueh(page) {
  const zeileDa = await page.getByRole('button', { name: /Hydraulikdruck|halbe Geschwindigkeit/ }).count();
  if (zeileDa > 0) return;
  const kopf = page.getByRole('button', { name: /Früh/i }).first();
  if (await kopf.count()) { await kopf.click(); await page.waitForTimeout(250); }
}

async function meldeStoerung(page, anlage, text) {
  await page.getByRole('button', { name: /Störbericht erfassen/ }).click();
  await page.waitForTimeout(250);
  // Modal-Bereich (zIndex 60) zum Eingrenzen der Klicks
  const dlg = page.locator('div[style*="z-index: 60"]');
  await dlg.getByRole('button', { name: 'Früh', exact: true }).click(); // Schicht ist Pflicht
  await dlg.getByRole('button', { name: /Offen/ }).first().click(); // Status ist Pflicht (nicht vorausgewählt)
  await page.locator('input[list="stoer-anlagen"]').fill(anlage);
  await page.locator('textarea[placeholder*="funktioniert"]').fill(text);
  await page.getByRole('button', { name: /^Speichern$/ }).click();
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // Nutzer 1 legt die Störungen-Datei an (ist NICHT mit der Hauptdatei verbunden = reiner Leser)
  const u1 = await makeUser(browser, '2026-07-17T08:00:00Z');
  const reader1 = await u1.evaluate(() => document.body.innerText.includes('Schreibschutz') || true);
  check('(1) Auch ohne Hauptdatei-Verbindung ist der Störungen-Reiter erreichbar',
    await u1.getByRole('button', { name: /Störungen/ }).count() > 0);
  await verbindeStoer(u1, true);
  check('(1) Nach Verbinden darf der Leser Störungen melden (Knopf da)',
    await u1.getByRole('button', { name: /Störbericht erfassen/ }).count() > 0);

  await meldeStoerung(u1, 'Presse 3', 'Hydraulikdruck faellt ab');
  await zeigeFrueh(u1); // Schicht aufklappen, damit die Zeilen sichtbar werden
  check('(1) Störung von Nutzer 1 sichtbar', (await u1.locator('body').innerText()).includes('Presse 3'));

  // Nutzer 2 öffnet dieselbe Störungen-Datei
  const u2 = await makeUser(browser, '2026-07-17T08:00:02Z');
  await verbindeStoer(u2, false);
  await u2.waitForTimeout(300);
  await zeigeFrueh(u2);
  check('(2) Nutzer 2 sieht die Störung von Nutzer 1', (await u2.locator('body').innerText()).includes('Presse 3'));

  // Nutzer 2 meldet fast gleichzeitig eine zweite Störung
  await u2.clock.setFixedTime(new Date('2026-07-17T08:00:04Z'));
  await meldeStoerung(u2, 'Foerderband 2', 'Laeuft nur halbe Geschwindigkeit');

  // Beide pollen -> jeder muss beide Störungen sehen (Schicht bleibt aufgeklappt)
  await u1.clock.setFixedTime(new Date('2026-07-17T08:00:06Z'));
  await u1.evaluate(() => window.__wkStoerTest.poll());
  await u1.waitForTimeout(500);
  await u2.evaluate(() => window.__wkStoerTest.poll());
  await u2.waitForTimeout(500);

  const b1 = await u1.locator('body').innerText();
  check('(2) Nutzer 1 sieht BEIDE Störungen (Merge, nichts verloren)',
    b1.includes('Presse 3') && b1.includes('Foerderband 2'));
  const b2 = await u2.locator('body').innerText();
  check('(2) Nutzer 2 sieht BEIDE Störungen', b2.includes('Presse 3') && b2.includes('Foerderband 2'));

  // In der Datei liegen beide
  const datei = JSON.parse(drive['werkstatt-stoerungen.json']);
  check('(2) Beide Störungen liegen in der Störungen-Datei',
    datei.entries.filter((e) => e.anlage === 'Presse 3' || e.anlage === 'Foerderband 2').length === 2);
  check('(2) Störungen-Datei hat eigenes Format', datei.format === 'werkstatt-stoerungen-v1');
  check('(2) Gewählte Schicht wird gespeichert', datei.entries.every((e) => e.schicht === 'Früh'));

  // Detail-Popout: Klick auf die Zeile öffnet den kompletten Bericht (nur lesend)
  await u1.getByRole('button', { name: /Presse 3/ }).first().click();
  await u1.waitForTimeout(300);
  check('(P) Zeilen-Klick öffnet den Störbericht als Popout',
    (await u1.getByRole('button', { name: /Bearbeiten/ }).count()) > 0 &&
    (await u1.locator('body').innerText()).includes('Störbericht'));

  // (3) Nutzer 1 löscht die Presse-3-Störung über Popout -> Bearbeiten -> Löschen;
  // Nutzer 2 (hatte sie noch) darf sie nach dem Abgleich NICHT wiederbeleben.
  await u1.clock.setFixedTime(new Date('2026-07-17T08:00:10Z'));
  u1.on('dialog', (d) => d.accept()); // window.confirm beim Löschen bestätigen
  await u1.getByRole('button', { name: /Bearbeiten/ }).click(); // entsichert
  await u1.waitForTimeout(300);
  await u1.getByRole('button', { name: /^Löschen$/ }).click();
  await u1.waitForTimeout(400);

  await u1.evaluate(() => window.__wkStoerTest.poll());
  await u2.clock.setFixedTime(new Date('2026-07-17T08:00:12Z'));
  await u2.evaluate(() => window.__wkStoerTest.poll());
  await u2.waitForTimeout(500);
  await u1.evaluate(() => window.__wkStoerTest.poll());
  await u1.waitForTimeout(500);

  const datei2 = JSON.parse(drive['werkstatt-stoerungen.json']);
  check('(3) Gelöschte Störung ist aus der Datei raus', !datei2.entries.some((e) => e.anlage === 'Presse 3'));
  check('(3) Löschung als Tombstone vermerkt', datei2.deleted && Object.keys(datei2.deleted).length >= 1);
  const b2n = await u2.locator('body').innerText();
  check('(3) Nutzer 2 zeigt die gelöschte Störung nicht mehr an', !b2n.includes('Presse 3'));
  check('(3) Foerderband 2 ist noch da', datei2.entries.some((e) => e.anlage === 'Foerderband 2'));

  // (4) Hauptdatei blieb unberührt
  check('(4) Hauptdatei (kalender-daten.json) wurde NICHT beschrieben', drive['kalender-daten.json'] === '');

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
