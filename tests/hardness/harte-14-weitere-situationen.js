// Weitere Situationen für die Schnittstelle Daten (OneDrive/Laufwerk) <-> App,
// zusätzlich zu harte-12 (Grundhärtung) und harte-13 (2 Bearbeiter, große Menge):
// A) Drei Bearbeiter schreiben gleichzeitig (nicht nur zwei)
// B) Löschen durch einen, gleichzeitig Bearbeiten durch einen anderen - die
//    Bearbeitung muss gewinnen (steht so schon in der Merge-Regel, hier belegt)
// C) Mehrere kurz aufeinanderfolgende Lesefehler beim Speichern (nicht nur einer)
//    werden intern durchgehalten - keine Fehlermeldung, wenn es am Ende klappt
// D) Schnelles zweimaliges eigenes Speichern (Doppel-Klick-artig) verliert dabei
//    nicht die zwischenzeitliche Änderung eines anderen Bearbeiters
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

async function makeUser(browser, drive, uhrzeit) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  if (uhrzeit) await page.clock.setFixedTime(new Date(uhrzeit));
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

  // ---- Situation A: drei Bearbeiter gleichzeitig ----
  {
    const team = [{ name: 'Anna', rolle: 'mech' }, { name: 'Bernd', rolle: 'elek' }, { name: 'Carla', rolle: 'azubi' }];
    const drive = { 'kalender-daten.json': JSON.stringify({
      format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
      entries: [], deleted: {}, config: { tpmAnlagen: [], riItems: [], team },
    }) };
    const p1 = await makeUser(browser, drive, '2026-07-13T09:00:00');
    const p2 = await makeUser(browser, drive, '2026-07-13T09:00:02');
    const p3 = await makeUser(browser, drive, '2026-07-13T09:00:04');
    await connect(p1); await connect(p2); await connect(p3);

    await Promise.all([
      setzeSchicht(p1, 'Anna', 'Früh'),
      setzeSchicht(p2, 'Bernd', 'Nacht'),
      setzeSchicht(p3, 'Carla', 'Urlaub'),
    ]);
    await Promise.all([p1.waitForTimeout(4000), p2.waitForTimeout(4000), p3.waitForTimeout(4000)]);

    const inhalt = JSON.parse(drive['kalender-daten.json']);
    const finde = (n) => inhalt.entries.find((e) => e.name === n && e.date === '2026-07-13');
    ok('A: Drei gleichzeitige Bearbeiter - Anna = Früh gespeichert', finde('Anna') && finde('Anna').wert === 'Früh');
    ok('A: Drei gleichzeitige Bearbeiter - Bernd = Nacht gespeichert', finde('Bernd') && finde('Bernd').wert === 'Nacht');
    ok('A: Drei gleichzeitige Bearbeiter - Carla = Urlaub gespeichert', finde('Carla') && finde('Carla').wert === 'Urlaub');

    await Promise.all([p1, p2, p3].map((p) => p.evaluate(() => window.__wkSharedTest.poll())));
    await Promise.all([p1.waitForTimeout(300), p2.waitForTimeout(300), p3.waitForTimeout(300)]);
    const lokal = async (p) => p.evaluate(() => JSON.parse(localStorage.getItem('werkstatt-kalender-entries') || '[]'));
    const [l1, l2, l3] = await Promise.all([lokal(p1), lokal(p2), lokal(p3)]);
    const sieht = (liste, n, w) => liste.some((e) => e.name === n && e.date === '2026-07-13' && e.wert === w);
    ok('A: Bearbeiter 1 sieht am Ende alle drei Schichten', sieht(l1, 'Anna', 'Früh') && sieht(l1, 'Bernd', 'Nacht') && sieht(l1, 'Carla', 'Urlaub'));
    ok('A: Bearbeiter 3 sieht am Ende alle drei Schichten', sieht(l3, 'Anna', 'Früh') && sieht(l3, 'Bernd', 'Nacht') && sieht(l3, 'Carla', 'Urlaub'));

    await p1.close(); await p2.close(); await p3.close();
  }

  // ---- Situation B: Löschen durch einen, gleichzeitig Bearbeiten durch anderen - Bearbeitung gewinnt ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (B):', e.message));
    await page.addInitScript(() => {
      window.__mockFileContent = JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
        entries: [{ id: 'plan-1', date: '2026-07-13', category: 'PLANNOTIZ', name: 'Peter Test', note: 'ursprüngliche Notiz', updatedAt: new Date(Date.now() - 10000).toISOString() }],
        deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [{ name: 'Peter Test', rolle: 'mech' }] },
      });
      let getFileAufrufeB = 0;
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() {
          getFileAufrufeB++;
          // Der 1. Aufruf ist das Verbinden (Eintrag muss dabei normal ankommen).
          // ERST ab dem 2. Aufruf (das ist die Lesung innerhalb unseres eigenen
          // Speicherversuchs) hat ein anderer Bearbeiter den Eintrag inzwischen
          // gelöscht (Tombstone mit ÄLTEREM Zeitstempel als unsere Bearbeitung).
          if (getFileAufrufeB >= 2) {
            const fresh = JSON.parse(window.__mockFileContent);
            if (!fresh.deleted['plan-1']) {
              fresh.deleted['plan-1'] = new Date(Date.now() - 2000).toISOString();
              window.__mockFileContent = JSON.stringify(fresh);
            }
          }
          return new File([window.__mockFileContent], 'kalender-daten.json', { type: 'application/json' });
        },
        async createWritable() { return { async write(t) { window.__mockFileContent = t; }, async close() {} }; },
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(800);

    // Eigene, NEUERE Bearbeitung derselben Notiz auslösen - direkt über die Storage-API,
    // genau wie es die App beim Speichern einer bearbeiteten Notiz intern täte.
    await page.evaluate(() => {
      const prev = JSON.parse(localStorage.getItem('werkstatt-kalender-entries') || '[]');
      const next = prev.map((e) => (e.id === 'plan-1' ? { ...e, note: 'NEUE Bearbeitung nach der Löschung' } : e));
      window.storage.set('werkstatt-kalender-entries', JSON.stringify(next));
    });
    await page.waitForTimeout(1500);

    const inhaltB = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    const eintragB = inhaltB.entries.find((e) => e.id === 'plan-1');
    ok('B: Bearbeitung NACH einer fremden Löschung gewinnt (Eintrag bleibt/kehrt zurück)', !!eintragB && eintragB.note === 'NEUE Bearbeitung nach der Löschung');

    await page.close();
  }

  // ---- Situation C: mehrere aufeinanderfolgende Lesefehler beim Speichern werden durchgehalten ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    // Feste Uhr wie bei den anderen Seiten dieses Tests: Der Schichtplan
    // oeffnet den laufenden Monat, und die Zelle unten liegt im Juli 2026.
    await page.clock.setFixedTime(new Date('2026-07-13T09:00:00'));
    page.on('pageerror', (e) => console.log('PAGEERROR (C):', e.message));
    await page.addInitScript(() => {
      window.__mockFileContent = JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
        entries: [{ id: 'fremd-c', date: '2026-07-01', category: 'SCHICHT', name: 'Kollege C', scope: 'tag', wert: 'Früh', updatedAt: new Date().toISOString() }],
        deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [{ name: 'Peter Test', rolle: 'mech' }] },
      });
      let getFileAufrufe = 0;
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() {
          getFileAufrufe++;
          // Aufruf 1 = beim Verbinden. Aufrufe 2 UND 3 (die ersten zwei Lesungen
          // innerhalb des Speicherversuchs) schlagen fehl - erst der 3. Versuch
          // (insgesamt Aufruf 4+) klappt. Das muss innerhalb des Retry-Budgets
          // (5 Versuche) noch glatt durchgehen, ohne Fehlermeldung an den Nutzer.
          if (getFileAufrufe === 2 || getFileAufrufe === 3) throw new Error('NetworkError: kurzzeitig nicht erreichbar');
          return new File([window.__mockFileContent], 'kalender-daten.json', { type: 'application/json' });
        },
        async createWritable() { return { async write(t) { window.__mockFileContent = t; }, async close() {} }; },
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
    await page.waitForTimeout(400);
    await page.locator('button[aria-label="Matrix Peter Test 2026-07-13"]').click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Nacht', exact: true }).click();
    await page.waitForTimeout(2200); // genug Zeit für mehrere Retry-Runden

    const inhaltC = await page.evaluate(() => JSON.parse(window.__mockFileContent));
    ok('C: Trotz zwei aufeinanderfolgenden Lesefehlern wird die eigene Änderung gespeichert', inhaltC.entries.some((e) => e.name === 'Peter Test' && e.wert === 'Nacht'));
    ok('C: Fremder Bestand bleibt dabei erhalten', inhaltC.entries.some((e) => e.name === 'Kollege C'));
    const textC = await page.locator('body').innerText();
    ok('C: Keine Fehlermeldung sichtbar, da es am Ende geklappt hat', !textC.includes('konnte nicht sicher') && !textC.includes('nicht erreichbar'));

    await page.close();
  }

  // ---- Situation D: schnelles doppeltes eigenes Speichern verliert nicht die Änderung eines anderen ----
  {
    const drive = { 'kalender-daten.json': JSON.stringify({
      format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
      entries: [], deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [{ name: 'Dora', rolle: 'mech' }, { name: 'Elias', rolle: 'elek' }] },
    }) };
    const p1 = await makeUser(browser, drive, '2026-07-13T09:00:00');
    const p2 = await makeUser(browser, drive, '2026-07-13T09:00:01');
    await connect(p1); await connect(p2);

    // p1 schreibt zweimal schnell hintereinander (unterschiedliche Werte),
    // während p2 currently unabhängig für eine andere Person schreibt.
    // Die Uhr von p1 ist für deterministisches "heute" eingefroren - zwischen
    // den zwei schnellen Klicks muss sie trotzdem minimal weiterlaufen, genau
    // wie die echte Uhrzeit es zwischen zwei Klicks täte (sonst bekämen beide
    // Änderungen exakt denselben Zeitstempel und die Merge-Regel "neuer
    // Zeitstempel gewinnt" könnte gar nicht greifen - das wäre ein
    // Test-Artefakt, kein echtes Verhalten).
    const schnellDoppelt = (async () => {
      await setzeSchicht(p1, 'Dora', 'Früh');
      await p1.clock.setFixedTime(new Date('2026-07-13T09:00:00.500Z'));
      await setzeSchicht(p1, 'Dora', 'Spät'); // sofort danach nochmal ändern
    })();
    const andererBearbeiter = setzeSchicht(p2, 'Elias', 'Urlaub');
    await Promise.all([schnellDoppelt, andererBearbeiter]);
    await p1.waitForTimeout(4000);
    await p2.waitForTimeout(4000);

    const inhaltD = JSON.parse(drive['kalender-daten.json']);
    const dora = inhaltD.entries.find((e) => e.name === 'Dora' && e.date === '2026-07-13');
    const elias = inhaltD.entries.find((e) => e.name === 'Elias' && e.date === '2026-07-13');
    ok('D: Nach schnellem doppeltem Speichern steht der letzte eigene Wert (Dora = Spät)', dora && dora.wert === 'Spät');
    ok('D: Die zeitgleiche Änderung des anderen Bearbeiters ist nicht verloren (Elias = Urlaub)', elias && elias.wert === 'Urlaub');

    await p1.close(); await p2.close();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
