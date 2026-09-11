// Prüft die neue, strengere Regel: Nur-Lesen ist der SICHERE STANDARD, auch
// BEVOR eine Verbindung zur gemeinsamen Datei besteht. Volle Rechte gibt es
// nur nach BESTÄTIGTEM Schreibzugriff (oder in Solo-Browsern ohne FS-Access-API).
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const mockHandle = (mode) => ({
  name: 'kalender-daten.json', kind: 'file',
  async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":null,"entries":[],"deleted":{},"config":{}}'], 'kalender-daten.json', { type: 'application/json' }); },
  async createWritable() {
    if (mode === 'read') throw new Error('NotAllowedError: nur Lesen');
    return { async write() {}, async close() {} };
  },
  async queryPermission() { return 'granted'; },
  async requestPermission() { return 'granted'; },
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });

  // ---- Szenario 1: Frisch geöffnet, NOCH GAR NICHT verbunden ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S1):', e.message));
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    // Standort festnageln: seit der Werkstatt-Wahl (harte-68) bekämen frische
    // Rechner sonst zuerst die Frage - die ist hier nicht Gegenstand.
    await page.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
    await page.goto(APP);
    await page.waitForTimeout(700);

    ok('S1: "Übersicht"-Tab sichtbar (Nur-Lesen-Standard)', await page.getByRole('button', { name: 'Übersicht', exact: true }).count() === 1);
    // Seit dem 10.09. sehen Leser NUR Übersicht + Berichte (Ansage der
    // Geschäftsführung) - Werkstatt und TPM sind für sie ganz verschwunden.
    ok('S1: "Berichte"-Tab sichtbar (Leser-Standard)', await page.getByRole('button', { name: /^Berichte/ }).count() >= 1);
    ok('S1: "Schichtplan"-Tab NICHT sichtbar (Leser sehen nur Übersicht + Berichte)', await page.getByRole('button', { name: 'Schichtplan', exact: true }).count() === 0);
    ok('S1: "TPM"-Hauptreiter NICHT sichtbar (Leser sehen nur Übersicht + Berichte)', await page.getByRole('button', { name: 'TPM', exact: true }).count() === 0);
    ok('S1: "Backlog"-Tab NICHT sichtbar (noch nicht verbunden = sicherer Standard)', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 0);
    ok('S1: "Werkstatt"-Hauptreiter NICHT sichtbar (Leser sehen nur Übersicht + Berichte)', await page.getByRole('button', { name: 'Werkstatt', exact: true }).count() === 0);
    ok('S1: "Gemeinsame Datei"-Knopf IST sichtbar (sonst könnte sich niemand verbinden!)', await page.locator('button[aria-label="Gemeinsame Datei"]').count() === 1);
    await page.close();
  }

  // ---- Szenario 2: Verbindet sich, bekommt NUR LESEN (readerMode bleibt) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S2):', e.message));
    await page.addInitScript((mode) => {
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":null,"entries":[],"deleted":{},"config":{}}'], 'kalender-daten.json', { type: 'application/json' }); },
        async createWritable() { throw new Error('NotAllowedError: nur Lesen'); },
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    // Standort festnageln: seit der Werkstatt-Wahl (harte-68) bekämen frische
    // Rechner sonst zuerst die Frage - die ist hier nicht Gegenstand.
    await page.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(800);

    ok('S2: Nach Verbinden als Leser - "Übersicht" weiterhin sichtbar', await page.getByRole('button', { name: 'Übersicht', exact: true }).count() === 1);
    ok('S2: "Backlog" weiterhin NICHT sichtbar', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 0);
    ok('S2: "Gemeinsame Datei"-Knopf jetzt AUSGEBLENDET (bestätigter Leser)', await page.locator('button[aria-label="Gemeinsame Datei"]').count() === 0);
    await page.close();
  }

  // ---- Szenario 3: Verbindet sich, bekommt SCHREIBRECHTE (volle App) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S3):', e.message));
    await page.addInitScript(() => {
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":null,"entries":[],"deleted":{},"config":{}}'], 'kalender-daten.json', { type: 'application/json' }); },
        async createWritable() { return { async write() {}, async close() {} }; },
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    // Standort festnageln: seit der Werkstatt-Wahl (harte-68) bekämen frische
    // Rechner sonst zuerst die Frage - die ist hier nicht Gegenstand.
    await page.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(800);

    ok('S3: Nach Verbinden als Bearbeiter - "Cockpit"-Hauptreiter sichtbar', await page.getByRole('button', { name: 'Werkstatt', exact: true }).count() === 1);
    // Backlog wohnt seit dem 10.09. im Bereich Berichte
    await page.getByRole('button', { name: /^Berichte/ }).first().click();
    await page.waitForTimeout(400);
    ok('S3: "Backlog" (im Bereich Berichte) erreichbar', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 1);
    ok('S3: "Gemeinsame Datei"-Knopf sichtbar (Bearbeiter darf verwalten)', await page.locator('button[aria-label="Gemeinsame Datei"]').count() === 1);
    await page.close();
  }

  // ---- Szenario 4: Solo-Betrieb ohne File System Access API (Firefox/Safari) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S4):', e.message));
    await page.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; });
    // Standort festnageln: seit der Werkstatt-Wahl (harte-68) bekämen frische
    // Rechner sonst zuerst die Frage - die ist hier nicht Gegenstand.
    await page.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
    await page.goto(APP);
    await page.waitForTimeout(700);

    ok('S4: Solo-Browser (kein FS-Access) - volle App nutzbar ("Cockpit" sichtbar)', await page.getByRole('button', { name: 'Werkstatt', exact: true }).count() === 1);
    await page.getByRole('button', { name: /^Berichte/ }).first().click();
    await page.waitForTimeout(400);
    ok('S4: "Backlog" (im Bereich Berichte) erreichbar', await page.getByRole('button', { name: 'Backlog', exact: true }).count() === 1);
    await page.close();
  }

  // ---- Szenario 5: Leser darf "Planung" ANSEHEN, aber NICHTS darin ändern ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S5):', e.message));
    await page.addInitScript(() => {
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":null,"entries":[],"deleted":{},"config":{"team":[{"name":"Leser Test","rolle":"mech"}]}}'], 'kalender-daten.json', { type: 'application/json' }); },
        async createWritable() { throw new Error('NotAllowedError: nur Lesen'); },
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    // Standort festnageln: seit der Werkstatt-Wahl (harte-68) bekämen frische
    // Rechner sonst zuerst die Frage - die ist hier nicht Gegenstand.
    await page.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(800);

    // Seit dem großen Umbau (Robertos Ansage vom 10.09.) sehen Leser die
    // Planung GAR NICHT mehr - nur noch Übersicht + Berichte. Die alten
    // Nur-Ansehen-Wächter in der Planung bleiben im Code, sind für Leser
    // aber unerreichbar; die Sicherheits-Klammer wirft sie zurück.
    ok('S5: "Planung" ist für den Leser NICHT mehr sichtbar', await page.getByRole('button', { name: 'Planung', exact: true }).count() === 0);
    ok('S5: "Werkstatt"-Hauptbereich ist für den Leser NICHT sichtbar', await page.getByRole('button', { name: 'Werkstatt', exact: true }).count() === 0);
    ok('S5: Der Bereich Berichte bleibt dem Leser erhalten', await page.getByRole('button', { name: /^Berichte/ }).count() >= 1);

    await page.close();
  }

  // ---- Szenario 6: Schreibschutz-Banner für Leser ist schlicht (keine verlockenden Knöpfe) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S6):', e.message));
    await page.addInitScript(() => {
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":"2026-01-01T00:00:00.000Z","entries":[],"deleted":{},"config":{}}'], 'kalender-daten.json', { type: 'application/json' }); },
        async createWritable() { const e = new Error('nur Lesen'); e.name = 'NotAllowedError'; throw e; },
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    // Standort festnageln: seit der Werkstatt-Wahl (harte-68) bekämen frische
    // Rechner sonst zuerst die Frage - die ist hier nicht Gegenstand.
    await page.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(900);

    const text = await page.locator('body').innerText();
    ok('S6: Banner zeigt "Schreibschutz"', text.includes('Schreibschutz'));
    ok('S6: Banner zeigt die Aktualisierungs-Anzeige', text.includes('Aktualisiert:') && /gerade eben|vor \d+ (Sek|Min|Std)\./.test(text));
    ok('S6: KEIN "Andere Datei wählen" für Leser', !text.includes('Andere Datei wählen'));
    ok('S6: KEIN "Schreibzugriff erneut versuchen" für Leser', !text.includes('Schreibzugriff erneut versuchen'));

    // Zurückstufung wurde gemerkt: Nach Browser-Neustart darf der Leser nie
    // wieder (auch nicht kurz) als Bearbeiter gelten.
    const gemerkterModus = await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open('werkstatt-kalender-fs');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('handles', 'readonly');
        const g = tx.objectStore('handles').get('mode');
        g.onsuccess = () => { db.close(); resolve(g.result); };
        g.onerror = () => { db.close(); resolve(null); };
      };
      req.onerror = () => resolve(null);
    }));
    ok('S6: Gemerkter Modus in IndexedDB ist "read" (nicht mehr fälschlich "readwrite")', gemerkterModus === 'read');

    await page.close();
  }

  // ---- Szenario 7: ?verwalten=1 blendet die Rettungs-Knöpfe wieder ein (für Bearbeiter) ----
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => console.log('PAGEERROR (S7):', e.message));
    await page.addInitScript(() => {
      const handle = {
        name: 'kalender-daten.json', kind: 'file',
        async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":"2026-01-01T00:00:00.000Z","entries":[],"deleted":{},"config":{}}'], 'kalender-daten.json', { type: 'application/json' }); },
        async createWritable() { const e = new Error('nur Lesen'); e.name = 'NotAllowedError'; throw e; },
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    // Standort festnageln: seit der Werkstatt-Wahl (harte-68) bekämen frische
    // Rechner sonst zuerst die Frage - die ist hier nicht Gegenstand.
    await page.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
    await page.goto(APP + '?verwalten=1');
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click();
    await page.getByText('Vorhandene Datei öffnen …').click();
    await page.waitForTimeout(900);

    const text = await page.locator('body').innerText();
    ok('S7: Mit ?verwalten=1 ist "Schreibzugriff erneut versuchen" sichtbar', text.includes('Schreibzugriff erneut versuchen'));
    ok('S7: Mit ?verwalten=1 ist "Andere Datei wählen" sichtbar', text.includes('Andere Datei wählen'));

    await page.close();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
