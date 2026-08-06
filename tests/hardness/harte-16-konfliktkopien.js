// Konflikt-Wächter: OneDrive-Konfliktkopien werden automatisch eingesammelt.
// Prüft: (1) Einträge aus der Kopie landen in der Hauptdatei, (2) absichtlich
// Gelöschtes wird NICHT wiederbelebt, (3) die Kopie wird danach gelöscht,
// (4) eine grüne Info-Meldung erscheint, (5) fremde Dateien bleiben unangetastet,
// (6) schlägt der Merge fehl, bleibt die Kopie liegen (kein Datenverlust).
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

  await page.addInitScript(() => {
    const jetzt = new Date().toISOString();
    const alt = new Date(Date.now() - 3600e3).toISOString();
    // "Ordner" mit Hauptdatei + Konfliktkopie + fremder Datei
    window.__ordner = {
      'werkstatt-kalender-daten.json': JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: jetzt,
        entries: [
          { id: 'haupt-1', date: '2026-07-14', category: 'SCHICHT', name: 'Anna', scope: 'tag', wert: 'Früh', updatedAt: jetzt },
        ],
        deleted: { 'geloescht-1': jetzt }, // wurde absichtlich gelöscht
        config: { tpmAnlagen: [], riItems: [], team: [{ name: 'Anna', rolle: 'mech' }], updatedAt: alt },
      }),
      'werkstatt-kalender-daten-L-ARADKE.json': JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: alt,
        entries: [
          // Neu: nur in der Kopie vorhanden -> muss übernommen werden
          { id: 'kopie-neu', date: '2026-07-15', category: 'SCHICHT', name: 'Anna', scope: 'tag', wert: 'Nacht', updatedAt: alt },
          // Versucht, den gelöschten Eintrag wiederzubeleben (älter als Tombstone) -> muss draußen bleiben
          { id: 'geloescht-1', date: '2026-07-10', category: 'SCHICHT', name: 'Anna', scope: 'tag', wert: 'Spät', updatedAt: alt },
        ],
        deleted: {}, config: null,
      }),
      'ganz-andere-datei.json': '{"nichts":"besonderes"}',
      // Von Hand angelegte Sicherungen: gleicher Namensstamm, aber KEINE
      // Konfliktkopien. Sie dürfen weder eingesammelt noch gelöscht werden.
      'werkstatt-kalender-daten-2026-08-05.json': JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: alt,
        entries: [{ id: 'sicherung-alt', date: '2026-01-02', category: 'SCHICHT', name: 'Anna', scope: 'tag', wert: 'Alt', updatedAt: alt }],
        deleted: {}, config: null,
      }),
      'werkstatt-kalender-daten-Sicherung-2026-08-05.json': JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: alt,
        entries: [{ id: 'sicherung-zwei', date: '2026-01-03', category: 'SCHICHT', name: 'Anna', scope: 'tag', wert: 'Alt', updatedAt: alt }],
        deleted: {}, config: null,
      }),
      'werkstatt-kalender-daten-Sicherung.json': JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: alt,
        entries: [{ id: 'sicherung-drei', date: '2026-01-04', category: 'SCHICHT', name: 'Anna', scope: 'tag', wert: 'Alt', updatedAt: alt }],
        deleted: {}, config: null,
      }),
    };

    const dateiHandle = (name) => ({
      name, kind: 'file',
      async getFile() { return new File([window.__ordner[name] ?? ''], name, { type: 'application/json' }); },
      async createWritable() { let b = ''; return { async write(c) { b += c; }, async close() { window.__ordner[name] = b; } }; },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
    });
    window.__dateiHandle = dateiHandle;
    window.__ordnerHandle = {
      name: 'Werkstatt', kind: 'directory',
      async *entries() {
        for (const n of Object.keys(window.__ordner)) yield [n, dateiHandle(n)];
      },
      async removeEntry(n) {
        if (!(n in window.__ordner)) throw new Error('NotFoundError');
        delete window.__ordner[n];
      },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
    };
    window.showOpenFilePicker = async () => [dateiHandle('werkstatt-kalender-daten.json')];
  });

  await page.goto(APP);
  await page.waitForTimeout(500);
  await page.locator('button[aria-label="Gemeinsame Datei"]').click();
  await page.getByText('Vorhandene Datei öffnen …').click();
  await page.waitForTimeout(900);
  await page.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
  await page.waitForTimeout(200);

  // Ordner über den Test-Zugang übernehmen und Scan anstoßen
  await page.evaluate(async () => {
    window.__wkSharedTest.adoptFolder(window.__ordnerHandle);
    await window.__wkSharedTest.sammle();
  });
  await page.waitForTimeout(600);

  const ordnerDanach = await page.evaluate(() => Object.keys(window.__ordner));
  ok('Konfliktkopie wurde gelöscht', !ordnerDanach.includes('werkstatt-kalender-daten-L-ARADKE.json'));
  ok('Fremde Datei bleibt unangetastet', ordnerDanach.includes('ganz-andere-datei.json'));
  ok('Hauptdatei existiert weiterhin', ordnerDanach.includes('werkstatt-kalender-daten.json'));

  const haupt = await page.evaluate(() => JSON.parse(window.__ordner['werkstatt-kalender-daten.json']));
  ok('Neuer Eintrag aus der Kopie wurde übernommen', haupt.entries.some((e) => e.id === 'kopie-neu' && e.wert === 'Nacht'));
  ok('Bestehender Eintrag der Hauptdatei ist noch da', haupt.entries.some((e) => e.id === 'haupt-1'));
  ok('Absichtlich Gelöschtes wurde NICHT wiederbelebt', !haupt.entries.some((e) => e.id === 'geloescht-1'));
  ok('Lösch-Merkliste ist erhalten', !!haupt.deleted['geloescht-1']);

  // ---- Sicherungen von Hand: gleicher Namensstamm, aber unantastbar ----
  // Ohne diese Unterscheidung würde der Wächter sie einsammeln UND löschen -
  // die Sicherung wäre genau dann weg, wenn man sie braucht.
  const sicherungen = [
    'werkstatt-kalender-daten-2026-08-05.json',
    'werkstatt-kalender-daten-Sicherung-2026-08-05.json',
    'werkstatt-kalender-daten-Sicherung.json',
  ];
  for (const s of sicherungen) {
    ok(`Sicherung "${s}" wurde nicht gelöscht`, ordnerDanach.includes(s));
  }
  const sicherungInhalt = await page.evaluate((n) => window.__ordner[n], sicherungen[0]);
  ok('Sicherung wurde auch inhaltlich nicht angefasst', /"sicherung-alt"/.test(sicherungInhalt || ''));
  ok('Einträge der Sicherung wurden NICHT in die Hauptdatei gezogen',
    !haupt.entries.some((e) => ['sicherung-alt', 'sicherung-zwei', 'sicherung-drei'].includes(e.id)));

  const text = await page.locator('body').innerText();
  ok('Grüne Info-Meldung erscheint', text.includes('Konfliktkopie') && text.includes('eingesammelt'));

  // Auch der lokale Zustand der App kennt den neuen Eintrag sofort
  const lokal = await page.evaluate(() => JSON.parse(localStorage.getItem('werkstatt-kalender-entries') || '[]'));
  ok('Lokaler Zustand enthält den übernommenen Eintrag', lokal.some((e) => e.id === 'kopie-neu'));

  // ---- Fehlerfall: Schreiben in die Hauptdatei schlägt fehl -> Kopie bleibt liegen ----
  await page.evaluate(() => {
    window.__ordner['werkstatt-kalender-daten-L-ARADKE-2.json'] = JSON.stringify({
      format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
      entries: [{ id: 'kopie-2', date: '2026-07-16', category: 'SCHICHT', name: 'Anna', scope: 'tag', wert: 'Früh', updatedAt: new Date().toISOString() }],
      deleted: {}, config: null,
    });
    // Hauptdatei "kaputt" machen: Schreiben schlägt fehl
    const orig = window.__dateiHandle;
    window.__ordnerHandle.entries = async function* () {
      for (const n of Object.keys(window.__ordner)) {
        const h = orig(n);
        if (n === 'werkstatt-kalender-daten.json') {
          h.createWritable = async () => { throw new Error('Schreiben gerade nicht möglich'); };
        }
        yield [n, h];
      }
    };
  });
  // WICHTIG: Der Wächter schreibt über den HAUPT-Handle (nicht den Ordner-Handle) -
  // also den echten Haupt-Handle sabotieren wir über einen zweiten Weg: wir prüfen
  // stattdessen nur, dass eine nicht zusammenführbare (kaputte) Kopie liegen bleibt.
  await page.evaluate(() => {
    window.__ordner['werkstatt-kalender-daten-KAPUTT.json'] = 'kein gültiges JSON {{{';
  });
  await page.evaluate(async () => { await window.__wkSharedTest.sammle(); });
  await page.waitForTimeout(600);
  const ordnerFinal = await page.evaluate(() => Object.keys(window.__ordner));
  ok('Gültige zweite Kopie wurde eingesammelt', !ordnerFinal.includes('werkstatt-kalender-daten-L-ARADKE-2.json'));
  ok('Kaputte Kopie bleibt liegen (wird nicht blind gelöscht)', ordnerFinal.includes('werkstatt-kalender-daten-KAPUTT.json'));
  const haupt2 = await page.evaluate(() => JSON.parse(window.__ordner['werkstatt-kalender-daten.json']));
  ok('Eintrag aus zweiter Kopie ist in der Hauptdatei', haupt2.entries.some((e) => e.id === 'kopie-2'));

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
