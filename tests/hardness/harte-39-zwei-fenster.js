// Härtetest: ZWEI FENSTER DERSELBEN APP auf einem Rechner.
//
// Am 05.08.2026 hatte Roberto das Cockpit versehentlich ein zweites Mal
// geöffnet. Das brachte zuerst den Schreibschutz (behoben), beim Durchgehen
// des Codes kam aber ein zweiter, schwererer Fall zutage:
//
// Beide Fenster teilen sich den Zwischenspeicher des Browsers. Aus dem
// Unterschied zwischen "vorher" (Zwischenspeicher) und "jetzt" (eigener
// Stand) leitet die App ab, was der Bediener GELÖSCHT hat. Hat das andere
// Fenster inzwischen etwas angelegt, steht dieser frische Eintrag im
// "vorher", aber nicht im "jetzt" - und wird prompt als Löschung gemeldet,
// mitsamt Löschmarke. Danach ist er auf ALLEN Geräten weg.
//
// Gemessen vor der Reparatur: Eintrag "neu1" aus Fenster 1 verschwand,
// Löschmarken enthielten seine Kennung.
//
// Die Reparatur: Jedes Fenster merkt sich seinen EIGENEN letzten Stand.
// Gelöscht wird nur, was dieses Fenster selbst entfernt hat.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};
const platte = {};
const leer = () => JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: null });
const A = (id, name) => ({ id, date: "2026-08-05", category: "ARBEIT", name, status: "open", prio: "hoch", art: "mech" });
const setze = (p, l) => p.evaluate(async (x) => await window.storage.set("werkstatt-kalender-entries", JSON.stringify(x)), l);
const datei = () => JSON.parse(platte["kalender-daten.json"] || "{}");
const fachlich = () => (datei().entries || [])
  .filter((e) => !String(e.id).startsWith("config|") && !String(e.id).startsWith("log|"));

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  // EIN Kontext = ein Browserprofil = gemeinsamer Zwischenspeicher. Genau so
  // verhalten sich zwei Tabs derselben Seite.
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.exposeBinding("__lies", (s, n) => platte[n] ?? "");
  await ctx.exposeBinding("__schreib", (s, n, c) => { platte[n] = c; });
  await ctx.addInitScript(() => {
    localStorage.setItem("werkstatt-kalender-name", "R. Ciraci");
    window.__mk = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let bb = ""; return { async write(c) { bb += c; }, async close() { await window.__schreib(name, bb); } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
  });
  platte["kalender-daten.json"] = leer();

  const oeffne = async () => {
    const p = await ctx.newPage();
    await p.goto(APP);
    await p.waitForTimeout(900);
    await p.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
    await p.waitForTimeout(500);
    return p;
  };

  const f1 = await oeffne();
  await setze(f1, [A("alt1", "Bestand")]);
  await f1.waitForTimeout(600);

  const f2 = await oeffne();          // zweites Fenster, sieht den Bestand

  // Fenster 1 legt etwas Neues an. Fenster 2 weiß davon noch nichts -
  // der Abgleich läuft nur alle 30 Sekunden.
  await setze(f1, [A("alt1", "Bestand"), A("neu1", "Frisch in Fenster 1")]);
  await f1.waitForTimeout(600);

  // Fenster 2 speichert seinen etwas älteren Stand plus eine eigene Änderung.
  await setze(f2, [A("alt1", "Bestand"), A("neu2", "Frisch in Fenster 2")]);
  await f2.waitForTimeout(900);

  const ids = fachlich().map((e) => e.id);
  pruef("(1) Der Eintrag aus Fenster 1 überlebt", ids.includes("neu1"), ids.join(", "));
  pruef("(1) Der Eintrag aus Fenster 2 ist ebenfalls da", ids.includes("neu2"));
  pruef("(1) Der ursprüngliche Bestand ist unangetastet", ids.includes("alt1"));
  // Die Löschmarke ist das Gefährliche: Sie wirkt auf allen Geräten und
  // überlebt jeden Abgleich - ein Eintrag mit Marke kommt nie zurück.
  pruef("(1) Es entsteht KEINE Löschmarke aus dem bloßen Nebeneinander",
    Object.keys(datei().deleted || {}).length === 0,
    "Marken: " + Object.keys(datei().deleted || {}).join(", "));

  // Gegenprobe: Eine ECHTE Löschung muss weiterhin durchgehen, sonst hätte man
  // den Fehler nur gegen einen anderen getauscht.
  await f2.evaluate(() => window.__wkSharedTest.poll());
  await f2.waitForTimeout(600);
  await setze(f2, [A("alt1", "Bestand"), A("neu1", "Frisch in Fenster 1")]);   // neu2 bewusst entfernt
  await f2.waitForTimeout(900);
  const nachher = fachlich().map((e) => e.id);
  pruef("(2) Eine echte Löschung wirkt weiterhin", !nachher.includes("neu2"), nachher.join(", "));
  pruef("(2) Und hinterlässt ihre Löschmarke",
    Object.keys(datei().deleted || {}).includes("neu2"));

  console.log(`\n==== ZWEI FENSTER: ${ok} PASS / ${fail} FAIL ====`);
  await b.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
