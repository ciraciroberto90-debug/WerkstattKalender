// Prüft den neuen alternativen Speicher-Weg (Download statt createWritable):
// 1) Bei technischem Fehler (NoModificationAllowedError) wird die Option angeboten
// 2) Bei echter Rechte-Verweigerung (NotAllowedError) NICHT - Sicherheitsgrenze!
// 3) Aktivieren schaltet die volle App frei
// 4) "Speichern" löst einen Download mit korrektem Dateinamen + Inhalt aus
// 5) "Aktualisieren" holt externe Änderungen korrekt ab
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // ---- Test 1: NoModificationAllowedError (technisch) -> Option WIRD angeboten ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
    page.on('pageerror', (e) => console.log('PAGEERROR (T1):', e.message));
    await page.addInitScript(() => {
      window.__mockFileContent = JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
        entries: [{ id: 'a1', date: '2026-07-13', category: 'TPM', name: 'BTS', status: 'open', note: '', updatedAt: new Date().toISOString() }],
        deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [{ name: 'Roberto', rolle: 'mech' }] },
      });
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() { return new File([window.__mockFileContent], 'kalender-daten.json', { type: 'application/json' }); },
        async createWritable() { throw new Error('NoModificationAllowedError: Serverseitig nicht unterstützt'); },
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

    ok('T1: "Alternativen Speicher-Weg nutzen"-Knopf ist sichtbar (technischer Fehler)', await page.getByRole('button', { name: 'Alternativen Speicher-Weg nutzen' }).count() === 1);

    // Aktivieren
    await page.getByRole('button', { name: 'Alternativen Speicher-Weg nutzen' }).click();
    await page.waitForTimeout(500);
    ok('T1: Nach Aktivieren - "Cockpit"-Hauptreiter sichtbar (volle App)', await page.getByRole('button', { name: 'Cockpit', exact: true }).count() === 1);
    ok('T1: "Backlog" erreichbar', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 1);
    ok('T1: "🔄 Aktualisieren"-Knopf sichtbar', await page.getByRole('button', { name: /Aktualisieren/ }).count() === 1);
    ok('T1: "💾 Speichern"-Knopf sichtbar', await page.getByRole('button', { name: /Speichern/ }).count() >= 1);

    // Eine Änderung machen (TPM-Punkt abhaken)
    await page.getByRole('button', { name: 'TPM', exact: true }).click();
    await page.waitForTimeout(300);
    const punkt = page.locator('button[title="Klicken zum Abhaken / Notiz"]').first();
    if (await punkt.count() > 0) {
      await punkt.click();
      await page.waitForTimeout(200);
      const gemachtBtn = page.getByRole('button', { name: '✓ Gemacht' });
      if (await gemachtBtn.count() > 0) { await gemachtBtn.click(); await page.waitForTimeout(200); }
      const schliessenBtn = page.locator('button[aria-label="Schließen"]').first();
      if (await schliessenBtn.count() > 0) await schliessenBtn.click();
      await page.waitForTimeout(300);
    }

    // "Speichern" klicken -> muss einen Download mit richtigem Dateinamen auslösen
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /💾 Speichern/ }).click(),
    ]);
    ok('T1: "Speichern" löst einen Download aus', !!download);
    ok('T1: Download-Dateiname stimmt mit der verbundenen Datei überein', download.suggestedFilename() === 'kalender-daten.json');

    const dlPath = await download.path();
    const fs = require('fs');
    const inhalt = JSON.parse(fs.readFileSync(dlPath, 'utf-8'));
    ok('T1: Download enthält gültiges JSON mit "entries"', Array.isArray(inhalt.entries));
    ok('T1: Ursprünglicher Eintrag (BTS) ist im Download enthalten', inhalt.entries.some((e) => e.name === 'BTS'));

    await page.close();
  }

  // ---- Test 2: NotAllowedError (echte Rechte-Verweigerung) -> Option NICHT angeboten ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (T2):', e.message));
    await page.addInitScript(() => {
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":null,"entries":[],"deleted":{},"config":{}}'], 'kalender-daten.json', { type: 'application/json' }); },
        async createWritable() { const err = new Error('nur Lesen'); err.name = 'NotAllowedError'; throw err; },
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

    ok('T2: "Alternativen Speicher-Weg nutzen"-Knopf ist NICHT sichtbar (echte Rechte-Verweigerung)', await page.getByRole('button', { name: 'Alternativen Speicher-Weg nutzen' }).count() === 0);
    ok('T2: Weiterhin im Nur-Lesen-Zustand ("Cockpit" nicht sichtbar)', await page.getByRole('button', { name: 'Cockpit', exact: true }).count() === 0);
    await page.close();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
