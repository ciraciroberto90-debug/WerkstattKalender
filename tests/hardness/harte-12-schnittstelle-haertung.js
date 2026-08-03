// Prüft die Härtungen der OneDrive/Firmenlaufwerk-Schnittstelle:
// 1) Ein vorübergehender Lesefehler beim Speichern darf NICHT den Bestand
//    der anderen überschreiben (Retry statt "Datei ist leer"-Annahme)
// 2) Merge mit gleicher Anzahl, aber geändertem Inhalt wird SOFORT sichtbar
// 3) Wiederholt scheiternde Verbindung (Poll) wird nach ein paar Versuchen
//    gemeldet, und die Meldung verschwindet automatisch wieder
// 4) "Zuletzt aktualisiert"-Anzeige ist sichtbar und aktuell
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // ---- Test 1: Transienter Lesefehler beim Speichern darf keine Daten der anderen löschen ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    // Der Schichtplan oeffnet den LAUFENDEN Monat. Ohne feste Uhr sucht dieser
    // Test ab August 2026 eine Julizelle, die es nicht mehr gibt - er schlug
    // dann nicht wegen eines Fehlers fehl, sondern wegen des Kalenders.
    await page.clock.setFixedTime(new Date('2026-07-13T09:00:00'));
    page.on('pageerror', (e) => console.log('PAGEERROR (T1):', e.message));
    await page.addInitScript(() => {
      window.__mockFileContent = JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
        entries: [
          { id: 'fremd-1', date: '2026-07-01', category: 'SCHICHT', name: 'Kollege X', scope: 'tag', wert: 'Früh', updatedAt: new Date().toISOString() },
        ],
        deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [{ name: 'Peter Test', rolle: 'mech' }] },
      });
      let getFileAufrufe = 0;
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() {
          getFileAufrufe++;
          // Der ALLERERSTE Lesevorgang während des Speicherns (2. Aufruf insgesamt,
          // da der 1. beim Verbinden passiert) schlägt fehl - simuliert einen
          // kurzen OneDrive-Hänger.
          if (getFileAufrufe === 2) throw new Error('NetworkError: kurzzeitig nicht erreichbar');
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

    // Eigene Schicht setzen -> löst ein Speichern aus, das beim 1. Versuch lesen scheitert
    await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
    await page.waitForTimeout(400);
    await page.locator('button[aria-label="Matrix Peter Test 2026-07-13"]').click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Spät', exact: true }).click();
    await page.waitForTimeout(1500); // Retry-Logik braucht etwas Zeit

    const dateiInhalt = await page.evaluate(() => JSON.parse(window.__mockFileContent));
    ok('T1: Fremder Eintrag (Kollege X) ist NICHT verloren gegangen nach transientem Lesefehler', dateiInhalt.entries.some((e) => e.name === 'Kollege X'));
    ok('T1: Eigene Änderung (Peter Test = Spät) wurde trotzdem übernommen', dateiInhalt.entries.some((e) => e.name === 'Peter Test' && e.wert === 'Spät'));

    await page.close();
  }

  // ---- Test 2: Merge mit gleicher Anzahl, anderem Inhalt wird SOFORT sichtbar ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    // Der Schichtplan oeffnet den LAUFENDEN Monat. Ohne feste Uhr sucht dieser
    // Test ab August 2026 eine Julizelle, die es nicht mehr gibt - er schlug
    // dann nicht wegen eines Fehlers fehl, sondern wegen des Kalenders.
    await page.clock.setFixedTime(new Date('2026-07-13T09:00:00'));
    page.on('pageerror', (e) => console.log('PAGEERROR (T2):', e.message));
    await page.addInitScript(() => {
      window.__mockFileContent = JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
        entries: [{ id: 'geteilt-1', date: '2026-07-13', category: 'PLANNOTIZ', name: 'Peter Test', note: 'alte Notiz', updatedAt: new Date(Date.now() - 5000).toISOString() }],
        deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [{ name: 'Peter Test', rolle: 'mech' }] },
      });
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() {
          // Simuliert: WÄHREND unser Speichern läuft, hat der andere Bearbeiter
          // die Notiz bereits geändert (gleiche ID, neuerer Zeitstempel, gleiche Anzahl).
          const fresh = JSON.parse(window.__mockFileContent);
          fresh.entries = fresh.entries.map((e) => e.id === 'geteilt-1'
            ? { ...e, note: 'NEUE Notiz vom Kollegen', updatedAt: new Date().toISOString() }
            : e);
          window.__mockFileContent = JSON.stringify(fresh);
          return new File([window.__mockFileContent], 'kalender-daten.json', { type: 'application/json' });
        },
        async createWritable() { return { async write(t) {}, async close() {} }; }, // unser Schreibversuch "verpufft" bewusst (siehe unten)
        async queryPermission() { return 'granted' },
        async requestPermission() { return 'granted' },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(800);

    // Irgendeine eigene, unabhängige Änderung auslösen (z. B. Schicht setzen),
    // die intern die gemeinsame Datei neu liest und mergen muss.
    await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
    await page.waitForTimeout(400);
    await page.locator('button[aria-label="Matrix Peter Test 2026-07-13"]').click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Früh', exact: true }).click();
    await page.waitForTimeout(1000);

    const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('werkstatt-kalender-entries') || '[]'));
    const notiz = entries.find((e) => e.id === 'geteilt-1');
    console.log('Notiz nach Merge (lokaler Zustand):', notiz && notiz.note);
    ok('T2: Fremd-Änderung (gleiche Anzahl Einträge) ist SOFORT im lokalen Zustand sichtbar', notiz && notiz.note === 'NEUE Notiz vom Kollegen');

    await page.close();
  }

  // ---- Test 3: Wiederholt scheiternder Poll wird gemeldet + Entwarnung bei Erholung ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    // Der Schichtplan oeffnet den LAUFENDEN Monat. Ohne feste Uhr sucht dieser
    // Test ab August 2026 eine Julizelle, die es nicht mehr gibt - er schlug
    // dann nicht wegen eines Fehlers fehl, sondern wegen des Kalenders.
    await page.clock.setFixedTime(new Date('2026-07-13T09:00:00'));
    page.on('pageerror', (e) => console.log('PAGEERROR (T3):', e.message));
    await page.addInitScript(() => {
      window.__mockFileContent = JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
        entries: [], deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [] },
      });
      window.__pollSollScheitern = false;
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() {
          if (window.__pollSollScheitern) throw new Error('NetworkError: Laufwerk weg');
          return new File([window.__mockFileContent], 'kalender-daten.json', { type: 'application/json' });
        },
        async createWritable() { return { async write(t) { window.__mockFileContent = t; }, async close() {} }; },
        async queryPermission() { return 'granted' },
        async requestPermission() { return 'granted' },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(800);

    // Poll auf "scheitert" schalten und 3x manuell anstoßen (simuliert 3 Intervalle)
    await page.evaluate(() => { window.__pollSollScheitern = true; });
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.__wkSharedTest.poll());
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(300);
    let fehlerText = await page.locator('body').innerText();
    ok('T3: Nach 3 gescheiterten Poll-Versuchen erscheint eine Warnung', fehlerText.includes('nicht erreichbar'));

    // Wieder erreichbar -> nächster Poll sollte die Warnung automatisch entfernen
    await page.evaluate(() => { window.__pollSollScheitern = false; });
    await page.evaluate(() => window.__wkSharedTest.poll());
    await page.waitForTimeout(300);
    fehlerText = await page.locator('body').innerText();
    ok('T3: Nach Erholung verschwindet die Warnung automatisch', !fehlerText.includes('nicht erreichbar'));

    await page.close();
  }

  // ---- Test 4: "Zuletzt aktualisiert"-Anzeige ist sichtbar ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    // Der Schichtplan oeffnet den LAUFENDEN Monat. Ohne feste Uhr sucht dieser
    // Test ab August 2026 eine Julizelle, die es nicht mehr gibt - er schlug
    // dann nicht wegen eines Fehlers fehl, sondern wegen des Kalenders.
    await page.clock.setFixedTime(new Date('2026-07-13T09:00:00'));
    page.on('pageerror', (e) => console.log('PAGEERROR (T4):', e.message));
    await page.addInitScript(() => {
      window.__mockFileContent = JSON.stringify({
        format: 'werkstatt-kalender-v1', savedAt: new Date().toISOString(),
        entries: [], deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [] },
      });
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() { return new File([window.__mockFileContent], 'kalender-daten.json', { type: 'application/json' }); },
        async createWritable() { return { async write(t) { window.__mockFileContent = t; }, async close() {} }; },
        async queryPermission() { return 'granted' },
        async requestPermission() { return 'granted' },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(800);

    const text = await page.locator('body').innerText();
    ok('T4: "Zuletzt aktualisiert"-Anzeige ("gerade eben" o.ä.) ist sichtbar', /gerade eben|vor \d+ (Sek|Min|Std)\./.test(text));

    await page.close();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
