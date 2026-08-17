// Härtetest: DIE ROTE MELDUNG DARF NICHT KLEBEN.
//
// Robertos Fund vom 17.08.2026, im Programm auf dem Firmenlaufwerk: Nach dem
// Start stand "Gemeinsame Datei konnte nicht gelesen werden (Laufwerk
// erreichbar?)" - und blieb stehen, obwohl das Laufwerk längst wieder da war
// (dieselbe App erkannte gleichzeitig die Programm-Aktualisierung vom selben
// Laufwerk). Ursache: Die Meldung kommt aus dem Wiederherstellen des
// gemerkten Zugriffs beim Start (tryRestore). Dieser Pfad setzte das
// Heilungs-Flag des Abgleichs nicht - der nächste erfolgreiche Abgleich gab
// deshalb NIE Entwarnung; nur die Poll-eigene "seit 90 s nicht
// erreichbar"-Warnung heilte sich.
//
// Der Test läuft wie das echte Programm (Desktop-Brücke, gemerkte Pfade,
// Neustart als neue Seite) und schlug vor der Änderung fehl:
//   (1) Verbinden, Programm "neu starten", während das Laufwerk das Lesen
//       verweigert -> rote Meldung aus dem Start-Pfad.
//   (2) Laufwerk wieder da, der nächste automatische Abgleich (30 s) liest.
//   (3) Die rote Meldung MUSS verschwinden - ohne Klick, ohne Speichern.
//   (4) Bestand: Die Poll-Warnung ("seit 90 s nicht erreichbar") heilt
//       weiterhin wie bisher.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const os = require("os");
const path = require("path");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "wk-entwarnung-"));
  const dateiPfad = path.join(ordner, "werkstatt-kalender-daten.json");
  const jetzt = new Date().toISOString();
  fs.writeFileSync(dateiPfad, JSON.stringify({
    format: "werkstatt-kalender-v1", savedAt: jetzt,
    entries: [{ id: "e1", date: "2026-08-17", category: "NOTIZ", text: "Bestand", updatedAt: jetzt }],
    deleted: {}, config: null,
  }, null, 2));

  const einstellungen = {}; // gemerkte Pfade des "Programms" - überleben den Neustart
  let leseSperre = false;   // das "Laufwerk" verweigert das Lesen mit einem echten Fehler

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const fehler = [];

  async function verdrahte(page) {
    page.on("pageerror", (e) => fehler.push(e.message));
    await page.exposeFunction("__d_waehleDatei", async () => dateiPfad);
    await page.exposeFunction("__d_waehleDateiNeu", async (v) => path.join(ordner, String(v)));
    await page.exposeFunction("__d_waehleOrdner", async () => ordner);
    await page.exposeFunction("__d_lese", async (p) => {
      // Kein Timeout, sondern ein sofortiger Fehler - so meldet sich ein
      // Netzlaufwerk, dessen Verbindung gerade abgerissen ist.
      if (leseSperre) throw new Error("EIO: i/o error, read '" + String(p) + "'");
      try {
        const inhalt = fs.readFileSync(String(p));
        const stat = fs.statSync(String(p));
        return { bytesB64: inhalt.toString("base64"), geaendert: Math.round(stat.mtimeMs), groesse: stat.size };
      } catch (e) { return null; }
    });
    await page.exposeFunction("__d_schreibe", async (p, text) => {
      if (leseSperre) throw new Error("EIO: i/o error, write");
      const tmp = String(p) + ".tmp";
      fs.writeFileSync(tmp, String(text));
      fs.renameSync(tmp, String(p));
      return true;
    });
    await page.exposeFunction("__d_liste", async (p) =>
      fs.readdirSync(String(p), { withFileTypes: true }).filter((e) => e.isFile())
        .map((e) => ({ name: e.name, pfad: path.join(String(p), e.name) })));
    await page.exposeFunction("__d_entferne", async (p) => { fs.unlinkSync(String(p)); return true; });
    await page.exposeFunction("__d_merke", async (k, w) => {
      if (w === null || w === undefined) delete einstellungen[k]; else einstellungen[k] = String(w);
      return true;
    });
    await page.exposeFunction("__d_gemerkt", async (k) => (einstellungen[k] === undefined ? null : einstellungen[k]));
    await page.exposeFunction("__d_pfadInfo", async (p) => {
      try { const s = fs.statSync(String(p)); return s.isDirectory() ? "ordner" : s.isFile() ? "datei" : null; }
      catch (e) { return null; }
    });
    await page.addInitScript(() => {
      delete window.showOpenFilePicker;
      delete window.showSaveFilePicker;
      delete window.showDirectoryPicker;
      const b64zuBytes = (b64) => {
        const roh = atob(b64);
        const arr = new Uint8Array(roh.length);
        for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i);
        return arr;
      };
      window.__werkstattDesktop = {
        waehleDatei: () => window.__d_waehleDatei(),
        waehleDateiNeu: (v) => window.__d_waehleDateiNeu(v),
        waehleOrdner: () => window.__d_waehleOrdner(),
        lese: async (p) => {
          const r = await window.__d_lese(p);
          return r ? { bytes: b64zuBytes(r.bytesB64), geaendert: r.geaendert, groesse: r.groesse } : null;
        },
        schreibe: (p, t) => window.__d_schreibe(p, t),
        liste: (p) => window.__d_liste(p),
        entferne: (p) => window.__d_entferne(p),
        merke: (k, w) => window.__d_merke(k, w),
        gemerkt: (k) => window.__d_gemerkt(k),
        oeffnePfad: async () => true,
        pfadInfo: (p) => window.__d_pfadInfo(p),
        aufUpdate: () => {},
        updateOrdnerSetzen: async () => true,
        updateStatus: async () => ({ ordner: "", stand: "" }),
        updatePruefen: async () => true,
        updateUebernehmen: async () => ({ ok: true }),
      };
    });
  }

  /* ---- Erst normal verbinden, wie am Stichtag ---- */
  let page = await ctx.newPage();
  await verdrahte(page);
  await page.goto(APP);
  await page.waitForTimeout(800);
  await page.locator('button[aria-label="Gemeinsame Datei"]').click();
  await page.getByText("Vorhandene Datei öffnen …").click();
  await page.waitForTimeout(1500);
  await page.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
  const verbunden = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").length);
  pruef("(0) Vorbedingung: Programm ist verbunden, Bestand da", verbunden >= 1, verbunden + " Einträge");
  await page.close();

  /* ---- (1) Neustart, während das Laufwerk nicht lesbar ist ---- */
  leseSperre = true;
  page = await ctx.newPage();
  await verdrahte(page);
  await page.clock.install({ time: new Date("2026-08-17T09:00:00") });
  await page.goto(APP);
  await page.waitForTimeout(2500);
  const t1 = await page.locator("body").innerText();
  pruef("(1) Der Start-Pfad meldet das unlesbare Laufwerk",
        /konnte nicht gelesen werden/.test(t1),
        (t1.match(/Gemeinsame Datei konnte[^\n]{0,55}/) || ["keine Meldung"])[0]);

  /* ---- (2) Laufwerk wieder da, der Abgleich liest von selbst ---- */
  leseSperre = false;
  await page.clock.fastForward(31000);
  await page.waitForTimeout(1500);

  /* ---- (3) Die Meldung muss von selbst verschwinden ---- */
  const t2 = await page.locator("body").innerText();
  pruef("(3) Die rote Meldung verschwindet nach dem ersten erfolgreichen Abgleich",
        !/konnte nicht gelesen werden/.test(t2),
        /konnte nicht gelesen werden/.test(t2) ? "Meldung klebt" : "Entwarnung kam");
  pruef("(3) Der Bestand ist nach der Heilung da",
        await page.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").length >= 1));

  /* ---- (4) Bestand: die Poll-Warnung heilt weiterhin ---- */
  leseSperre = true;
  // fastForward feuert jeden Zeitgeber höchstens EINMAL - für drei
  // gescheiterte Abgleiche also drei einzelne Sprünge.
  for (let i = 0; i < 3; i++) { await page.clock.fastForward(31000); await page.waitForTimeout(300); }
  await page.waitForTimeout(700);
  const t3 = await page.locator("body").innerText();
  pruef("(4) Poll-Ausfall meldet sich nach ~90 s", /nicht erreichbar/.test(t3),
        (t3.match(/Gemeinsame Datei ist seit[^\n]{0,45}/) || ["keine Meldung"])[0]);
  leseSperre = false;
  await page.clock.fastForward(31000);
  await page.waitForTimeout(1000);
  const t4 = await page.locator("body").innerText();
  pruef("(4) Und heilt wieder, sobald das Laufwerk zurück ist",
        !/nicht erreichbar \(/.test(t4) && !/konnte nicht gelesen werden/.test(t4));

  pruef("(5) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  await ctx.close();
  await browser.close();
  fs.rmSync(ordner, { recursive: true, force: true });
  console.log(`\nHärte 43 (Entwarnung): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
