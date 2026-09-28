// Härtetest: ZWISCHENDATEIEN-RESTE IM DATENORDNER (Robertos Explorer-Bild vom
// 28.09.: "hier passiert dauernd etwas - Schreibe-Dateien", fünf Kennungen
// an einem Tag, je zwei 0-KB-Dateien "…schreibe-<pid>.json")
//
// Jede solche Datei ist ein fehlgeschlagener Schreibversuch des Programms.
// Das Cockpit räumt sie beim Verbinden über die vorhandene Brücke weg
// (liste/stat/entferne) - ohne neue Programm-ZIP - und nennt den Befund im ⚙.
//  (Z1) Beim Verbinden wird der alte Rest des eigenen Dateistamms (3 h alt)
//       entfernt; der junge (2 min, anderes Fenster schreibt vielleicht) und
//       der Rest der ANDEREN Datei bleiben.
//  (Z2) ⚙ → Verlauf & Sicherung nennt: 2 gefunden, 1 weggeräumt, 1 noch da.
//  (Z3) Die Zieldatei selbst bleibt unangetastet, die Schreibprobe hinterlässt
//       keine Probedatei.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor bleiben alle Reste liegen (Z1 rot) und
// das ⚙ kennt keinen Befund (Z2 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const APP_PFAD = process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const APP = "file://" + APP_PFAD;

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const bauZeit = (() => {
  const m = fs.readFileSync(APP_PFAD, "utf8").match(/"(20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)"/g) || [];
  return m.map((x) => x.replace(/"/g, "")).sort().slice(-1)[0] || "";
})();
const ORDNER = "W:\\Technik\\Werkstatt_Kalender";
const DATEI = ORDNER + "\\werkstatt-kalender-daten.json";
const jetzt = Date.now();
const jetztIso = new Date(jetzt).toISOString();
const BENUTZER = [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }];
const INHALT = JSON.stringify({
  format: "werkstatt-kalender-v1", standort: "scheurich", schreibMarke: "seed", savedAt: jetztIso, deleted: {}, bauStand: bauZeit,
  entries: [{ id: "config|benutzer", date: "", value: BENUTZER, updatedAt: jetztIso }, { id: "config|programmStand", date: "", value: { Chef: { fassung: bauZeit, gesehen: jetztIso } }, updatedAt: jetztIso }],
  config: { benutzer: BENUTZER, programmStand: { Chef: { fassung: bauZeit, gesehen: jetztIso } } },
});
// Ordner-Attrappe: Pfad -> { inhalt, geaendert }
const dateien = {
  [DATEI]: { inhalt: INHALT, geaendert: jetzt - 60000 },
  [ORDNER + "\\werkstatt-kalender-daten.schreibe-22784.json"]: { inhalt: "", geaendert: jetzt - 3 * 3600 * 1000 }, // alt -> weg
  [ORDNER + "\\werkstatt-kalender-daten.schreibe-19292.json"]: { inhalt: "", geaendert: jetzt - 2 * 60 * 1000 },   // jung -> bleibt
  [ORDNER + "\\werkstatt-stoerungen.schreibe-22784.json"]: { inhalt: "", geaendert: jetzt - 3 * 3600 * 1000 },     // andere Datei -> bleibt (nicht verbunden)
};
const protokoll = [];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.exposeFunction("__d_lese", (pfad) => { const f = dateien[pfad]; return f ? { text: f.inhalt, geaendert: f.geaendert, groesse: f.inhalt.length } : null; });
  await p.exposeFunction("__d_stat", (pfad) => { const f = dateien[pfad]; return f ? { geaendert: f.geaendert, groesse: f.inhalt.length } : null; });
  await p.exposeFunction("__d_schreibe", (pfad, text) => { protokoll.push("schreibe " + pfad.split("\\").pop()); dateien[pfad] = { inhalt: text, geaendert: Date.now() }; return true; });
  await p.exposeFunction("__d_liste", (ordner) => Object.keys(dateien).filter((k) => k.startsWith(ordner + "\\")).map((k) => ({ name: k.split("\\").pop(), pfad: k })));
  await p.exposeFunction("__d_entferne", (pfad) => { protokoll.push("entferne " + pfad.split("\\").pop()); delete dateien[pfad]; return true; });
  await p.exposeFunction("__d_waehleDatei", () => DATEI);
  await p.addInitScript(({ c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-entries", "[]");
    localStorage.setItem("werkstatt-stoerungen-entries", "[]");
    localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
    localStorage.setItem("werkstatt-kalender-name", "Chef");
    const gemerkt = {};
    window.__werkstattDesktop = {
      waehleDatei: () => window.__d_waehleDatei(),
      waehleDateiNeu: async () => null,
      waehleOrdner: async () => null,
      lese: async (pfad) => { const r = await window.__d_lese(pfad); return r ? { bytes: new TextEncoder().encode(r.text), geaendert: r.geaendert, groesse: r.groesse } : null; },
      stat: (pfad) => window.__d_stat(pfad),
      schreibe: (pfad, text) => window.__d_schreibe(pfad, text),
      liste: (ordner) => window.__d_liste(ordner),
      entferne: (pfad) => window.__d_entferne(pfad),
      merke: async (k, w) => { gemerkt[k] = w; return true; },
      gemerkt: async (k) => gemerkt[k] || null,
      oeffnePfad: async () => true,
      pfadInfo: async (pfad) => (pfad && pfad.endsWith(".json") ? "datei" : null),
      aufUpdate: () => {},
      updateOrdnerSetzen: async () => true,
      updateStatus: async () => ({ ordner: "", stand: "" }),
      updatePruefen: async () => true,
      updateUebernehmen: async () => ({ ok: true }),
    };
  }, { c: { tpmAnlagen: [], riItems: [], team: [], benutzer: BENUTZER } });
  await p.goto(APP);
  await p.waitForTimeout(800);
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForTimeout(2000);
  await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(500);

  const namen = Object.keys(dateien).map((k) => k.split("\\").pop()).sort();
  ok("(Z1) Der alte Rest des eigenen Dateistamms ist weg, der junge und der der anderen Datei bleiben",
    !namen.includes("werkstatt-kalender-daten.schreibe-22784.json") && namen.includes("werkstatt-kalender-daten.schreibe-19292.json") && namen.includes("werkstatt-stoerungen.schreibe-22784.json"), namen.join(", "));
  ok("(Z3) Die Zieldatei ist unangetastet (kein Rückschreiben), keine Probedatei bleibt liegen",
    dateien[DATEI] && dateien[DATEI].inhalt === INHALT && !namen.some((n) => n.includes(".probe-")), protokoll.join(" | "));
  await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: /Verlauf/ }).first().click(); await p.waitForTimeout(400);
  const z = p.locator('[data-zwischenreste="Gemeinsame Datei"]');
  const zt = (await z.count()) ? (await z.innerText()).replace(/\s+/g, " ") : "";
  ok("(Z2) ⚙ nennt den Befund: 2 gefunden, 1 weggeräumt, 1 noch da (1 jünger als 10 min), fehlgeschlagene Schreibversuche",
    /2 gefunden, 1 weggeräumt, 1 noch da \(1 jünger als 10 min\)/.test(zt) && /Schreibversuch/.test(zt), zt.slice(0, 240));
  ok("(E) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
