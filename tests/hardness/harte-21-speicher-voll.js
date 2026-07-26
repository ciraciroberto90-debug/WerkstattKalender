// Härtetest: VOLLER ZWISCHENSPEICHER DES BROWSERS.
// Der Browser gibt einer Seite nur begrenzt Platz (meist ~5 MB). Bei mehreren
// Jahren Bestand wird das erreicht. Vorher brach das Speichern an dieser Stelle
// ab - BEVOR in die gemeinsame Datei geschrieben wurde. Die Änderung war dann
// weder lokal noch in der Datei, und die App meldete "evtl. kurzzeitig
// überlastet" - eine Fehldiagnose, die zum Abwarten verleitet.
//  (1) Mit verbundener Datei: Änderung erreicht die Datei trotzdem
//  (2) ... und der Bearbeiter erfährt den wahren Grund
//  (3) Ohne Datei (Alleinbetrieb): Fehler schlägt durch, kein stilles Weitermachen
//  (4) Ist wieder Platz, läuft alles normal weiter
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const check = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };

// Lässt den Zwischenspeicher ab einem Schalter "voll" laufen - genau so, wie
// der Browser es tut, wenn das Kontingent erschöpft ist.
const SPEICHER_BREMSE = () => {
  const echt = Storage.prototype.setItem;
  window.__speicherVoll = false;
  Storage.prototype.setItem = function (k, v) {
    if (window.__speicherVoll && /werkstatt-kalender-(entries|config)/.test(k)) {
      const e = new DOMException("exceeded the quota", "QuotaExceededError");
      throw e;
    }
    return echt.call(this, k, v);
  };
};

const EINTRAG = (id, name) => ({ id, date: "2026-07-20", category: "ARBEIT", name, status: "open", prio: "hoch", art: "mech" });

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1)+(2) Mit verbundener gemeinsamer Datei ---- */
  {
    let datei = JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: null });
    const page = await (await browser.newContext()).newPage({ viewport: { width: 1400, height: 1000 } });
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await page.exposeFunction("__lies", () => datei);
    await page.exposeFunction("__schreib", (c) => { datei = c; });
    await page.addInitScript(SPEICHER_BREMSE);
    await page.addInitScript(() => {
      window.__mk = (name) => ({
        name, kind: "file",
        async getFile() { const t = await window.__lies(); return new File([t], name, { type: "application/json" }); },
        async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib(b); } }; },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      });
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    });
    await page.goto(APP);
    await page.waitForTimeout(1000);
    await page.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
    await page.waitForTimeout(300);

    // Ab jetzt ist der Zwischenspeicher voll
    await page.evaluate(() => { window.__speicherVoll = true; });
    await page.evaluate(async (e) => {
      try { await window.storage.set("werkstatt-kalender-entries", JSON.stringify([e])); } catch (err) { window.__fehler = String(err.message); }
    }, EINTRAG("voll1", "Trotz vollem Speicher"));
    await page.waitForTimeout(900);

    check("(1) Änderung erreicht die gemeinsame Datei trotz vollem Zwischenspeicher",
      datei.includes("Trotz vollem Speicher"));
    const sichtbar = await page.locator("body").innerText();
    check("(2) Der wahre Grund wird genannt (voller Speicher, nicht 'überlastet')",
      /Zwischenspeicher/i.test(sichtbar));
    check("(2) Und es wird klargestellt, dass nichts verloren ist",
      /NICHT verloren|nicht verloren/i.test(sichtbar));
    check("(2) Die irreführende Meldung 'kurzzeitig überlastet' erscheint NICHT",
      !/kurzzeitig überlastet/i.test(sichtbar));

    // (4) Wieder Platz -> normaler Betrieb
    await page.evaluate(() => { window.__speicherVoll = false; });
    await page.evaluate(async (e) => {
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify(e));
    }, [EINTRAG("voll1", "Trotz vollem Speicher"), EINTRAG("voll2", "Wieder Platz")]);
    await page.waitForTimeout(900);
    check("(4) Nach dem Freiwerden läuft das Speichern wieder normal",
      datei.includes("Wieder Platz"));
    const danach = await page.locator("body").innerText();
    check("(4) Die Warnung verschwindet wieder", !/Zwischenspeicher/i.test(danach));
    check("(4) Lokale Zweitschrift ist wieder aktuell",
      await page.evaluate(() => (localStorage.getItem("werkstatt-kalender-entries") || "").includes("Wieder Platz")));

    await page.close();
  }

  /* ---- (3) Alleinbetrieb ohne gemeinsame Datei ---- */
  {
    const page = await (await browser.newContext()).newPage({ viewport: { width: 1400, height: 1000 } });
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await page.addInitScript(SPEICHER_BREMSE);
    await page.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; });
    await page.goto(APP);
    await page.waitForTimeout(1000);

    await page.evaluate(() => { window.__speicherVoll = true; });
    const ergebnis = await page.evaluate(async (e) => {
      try { await window.storage.set("werkstatt-kalender-entries", JSON.stringify([e])); return "STILL DURCHGELASSEN"; }
      catch (err) { return String(err.message); }
    }, EINTRAG("solo1", "Ohne Datei"));

    check("(3) Ohne gemeinsame Datei schlägt der Fehler durch (kein stilles Weitermachen)",
      /Zwischenspeicher/i.test(ergebnis));
    check("(3) Die Meldung sagt klar, dass nichts gesichert wurde",
      /nirgends gesichert/i.test(ergebnis));

    await page.close();
  }

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
