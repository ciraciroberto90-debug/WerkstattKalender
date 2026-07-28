// Härtetest: VOLLER ZWISCHENSPEICHER.
//
// Der Browser gibt jeder Herkunft nur etwa 5 MB localStorage. Sieben Jahre
// Werkstattbetrieb belegen davon gemessen 3,4 MB - der Rand ist also in Sicht,
// und irgendwann ueberschreitet ihn jemand. Was dann passiert, entscheidet
// darueber, ob eine Schicht Arbeit verlorengeht oder nicht.
//
// Die Regel, nach der gebaut wurde: Der oertliche Zwischenspeicher ist eine
// Zweitschrift, die gemeinsame Datei ist der Bestand. Laeuft die Zweitschrift
// voll, darf das den Weg in die Datei NICHT abschneiden - und wenn es gar
// keine Datei gibt, muss es als Fehler durchschlagen statt still zu scheitern.
//
// Geprueft wird:
//   (1) Mit verbundener Datei: Die Aenderung landet in der Datei, obwohl der
//       Zwischenspeicher voll ist - und der Bediener wird gewarnt.
//   (2) Der vorhandene Bestand bleibt dabei unangetastet.
//   (3) OHNE verbundene Datei: Das Speichern scheitert LAUT, nicht still.
//   (4) Kein "gespeichert" wird behauptet, wo nichts gespeichert wurde.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const ALTBESTAND = [
  { id: "alt-1", date: "2026-07-01", category: "TPM", name: "BTS", status: "done", updatedAt: "2026-07-01T08:00:00.000Z" },
  { id: "alt-2", date: "2026-07-02", category: "TPM", name: "VSM1", status: "done", updatedAt: "2026-07-02T08:00:00.000Z" },
];

async function seite(browser, { mitDatei }) {
  const platte = {
    "kalender-daten.json": JSON.stringify({
      format: "werkstatt-kalender-v1", savedAt: "2026-07-20T08:00:00.000Z",
      entries: ALTBESTAND, deleted: {}, config: null,
    }),
  };
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript(() => {
    // Den Zwischenspeicher bis kurz unter die Grenze fuellen. Ein kleiner Rest
    // bleibt frei, damit die App ueberhaupt starten kann - genau die Lage, in
    // die ein Betrieb nach Jahren hineinwaechst.
    const brocken = "x".repeat(100 * 1024);
    let i = 0;
    try { for (; i < 200; i++) localStorage.setItem("fuellung-" + i, brocken); } catch (e) { /* voll */ }
    for (let k = 0; k < 2; k++) localStorage.removeItem("fuellung-" + (i - 1 - k));
    window.__fuellungsBrocken = i;

    const h = {
      name: "kalender-daten.json", kind: "file",
      async getFile() { const t = await window.__lies("kalender-daten.json"); return new File([t], "kalender-daten.json", { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib("kalender-daten.json", b); }, async abort() {} }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    };
    window.showOpenFilePicker = async () => [h];
    window.showSaveFilePicker = async () => h;
  });
  await p.goto(APP);
  await p.waitForTimeout(1200);
  if (mitDatei) {
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(2500);
  }
  return { p, platte };
}

// Ein Brocken, der sicher nicht mehr in den Rest passt.
const GROSS = (n) => JSON.stringify(
  ALTBESTAND.concat([{
    id: "neu-gross", date: "2026-07-28", category: "NOTIZ",
    text: "N".repeat(n), updatedAt: "2026-07-28T09:00:00.000Z",
  }])
);

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---------------- (1)(2) Mit verbundener Datei ---------------- */
  {
    const { p, platte } = await seite(b, { mitDatei: true });
    const fehler = [];
    p.on("pageerror", (e) => fehler.push(e.message));

    const belegt = await p.evaluate(() => window.__fuellungsBrocken);
    console.log("      Zwischenspeicher künstlich gefüllt mit", belegt, "× 100 KB");

    const ergebnis = await p.evaluate(async (wert) => {
      try { await window.storage.set("werkstatt-kalender-entries", wert); return { art: "ok" }; }
      catch (e) { return { art: "wurf", meldung: String(e && e.message) }; }
    }, GROSS(400 * 1024));
    await p.waitForTimeout(2500);

    const datei = JSON.parse(platte["kalender-daten.json"]);
    const ids = new Set(datei.entries.map((e) => e.id));
    pruef("(1) Die Änderung steht trotz vollem Zwischenspeicher in der Datei", ids.has("neu-gross"));
    pruef("(2) Der Altbestand ist unangetastet", ids.has("alt-1") && ids.has("alt-2"),
          datei.entries.length + " Einträge");

    const text = await p.locator("body").innerText();
    pruef("(1) Der Bediener wird gewarnt", /Zwischenspeicher dieses Browsers ist voll/.test(text));
    pruef("(1) Die Warnung sagt ausdrücklich, dass nichts verloren ist",
          /NICHT verloren/i.test(text));
    pruef("(1) Kein Wurf nach aussen, solange die Datei erreichbar ist", ergebnis.art === "ok",
          ergebnis.meldung || "");
    pruef("(1) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 1).join(" "));
    await p.context().close();
  }

  /* ---------------- (3)(4) Ohne verbundene Datei ---------------- */
  {
    const { p } = await seite(b, { mitDatei: false });
    const fehler = [];
    p.on("pageerror", (e) => fehler.push(e.message));

    const ergebnis = await p.evaluate(async (wert) => {
      try { await window.storage.set("werkstatt-kalender-entries", wert); return { art: "ok" }; }
      catch (e) { return { art: "wurf", meldung: String(e && e.message) }; }
    }, GROSS(400 * 1024));

    pruef("(3) Ohne Datei scheitert das Speichern LAUT", ergebnis.art === "wurf", ergebnis.meldung || "kein Wurf");
    pruef("(3) Die Meldung nennt Ursache und Ausweg",
          /Zwischenspeicher/.test(ergebnis.meldung || "") &&
          /auslagern|gemeinsame Datei/.test(ergebnis.meldung || ""));

    const abgelegt = await p.evaluate(() => (localStorage.getItem("werkstatt-kalender-entries") || "").length);
    pruef("(4) Nichts wird als gespeichert ausgegeben, was nicht gespeichert ist",
          abgelegt < 400 * 1024, abgelegt + " Zeichen lokal");
    pruef("(4) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 1).join(" "));
    await p.context().close();
  }

  await b.close();
  console.log(`\nHärte 34 (voller Zwischenspeicher): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})();
