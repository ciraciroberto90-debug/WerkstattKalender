// Härtetest: NOTBREMSE GEGEN MASSENLÖSCHUNG (Fund der 70.000er-Messfahrt, 11.09.).
//
// Oberhalb der ~5-MB-Grenze des Browsers bleibt der örtliche Spiegel leer,
// der Vergleichsstand des Fensters kennt aber den vollen Bestand aus dem
// Verbinden. Speichert dann etwas auf Basis des leeren Spiegels, hielt die
// App die Differenz für GEWOLLTES Löschen: Gemessen am 11.09. verschwanden
// so 68.380 von 68.380 Einträgen aus der Datei - ersetzt durch ebenso viele
// Verlaufszeilen „gelöscht: …". Seit der Notbremse gilt: Eine riesige
// Löschmenge (>1000) bei fast leerem Speicherstand (<100) ist ein kaputter
// Vergleichsstand, kein Wille - die Löschungen werden verworfen, der
// Bestand bleibt, eine laute Meldung erklärt es.
//
// Pflicht-Nachweis der Hausregel: Ohne die Bremse ist dieser Test ROT
// (APP_PFAD auf einen Bau ohne Bremse zeigen lassen - Messung siehe
// Prüfbericht). Die Gegenprobe unten stellt sicher, dass die Bremse
// GEWOLLTE große Löschungen (Archiv-Räumung: viele weg, tausende bleiben)
// NICHT anfasst.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

// 1.500 Einträge - genug, um die 1000er-Schwelle der Bremse zu reißen,
// klein genug für einen schnellen Test (die Speichergrenze selbst wird
// nicht gebraucht: entscheidend ist der leere Spiegel, nicht seine Ursache).
function baueBestand(n) {
  const entries = [];
  for (let i = 0; i < n; i++) {
    const jahr = 2019 + (i % 8);
    entries.push({
      id: `alt|${i}`, date: `${jahr}-0${(i % 9) + 1}-1${i % 9}`, category: "NOTIZ",
      text: `Bestand ${i}`, updatedAt: `${jahr}-01-01T08:00:00.000Z`,
    });
  }
  return entries;
}

async function seite(browser, bestand) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-09-11T09:00:00"));
  const platte = {
    "kalender-daten.json": JSON.stringify({
      format: "werkstatt-kalender-v1", savedAt: "2026-09-11T05:00:00.000Z",
      entries: bestand, deleted: {}, config: null,
    }),
  };
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript(() => {
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({ team: [] }));
    const bau = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let x = ""; return { async write(c) { x += c; }, async close() { await window.__schreib(name, x); }, async abort() {} }; },
      async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
    });
    window.showOpenFilePicker = async () => [bau("kalender-daten.json")];
    window.showSaveFilePicker = async () => bau("kalender-daten.json");
  });
  await p.goto(APP);
  await p.waitForTimeout(900);
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForTimeout(2500);
  const fachlich = () => {
    const d = JSON.parse(platte["kalender-daten.json"]);
    return d.entries.filter((e) => !/^(config\||log\|)/.test(String(e.id)));
  };
  return { p, ctx, fehler, platte, fachlich };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1) Der Messfahrt-Fall: leerer Spiegel, ein neuer Eintrag ---- */
  {
    const { p, ctx, fehler, fachlich, platte } = await seite(browser, baueBestand(1500));
    pruef("(1) Vorbedingung: Bestand steht in der Datei", fachlich().length === 1500, fachlich().length + "");
    // Leeren Spiegel nachstellen (bei 70.000 Einträgen macht das die
    // Speichergrenze von selbst) und wie die App speichern.
    await p.evaluate(async () => {
      localStorage.removeItem("werkstatt-kalender-entries");
      const roh = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
      roh.push({ id: "neu|A", date: "2026-09-11", category: "NOTIZ", text: "Neuer Eintrag", updatedAt: new Date().toISOString() });
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify(roh));
    });
    await p.waitForTimeout(3000);
    const f = fachlich();
    pruef("(1) NOTBREMSE: Der Bestand bleibt vollständig erhalten",
          f.filter((e) => String(e.id).startsWith("alt|")).length === 1500,
          f.length + " fachliche Einträge in der Datei");
    pruef("(1) Der neue Eintrag ist trotzdem angekommen", f.some((e) => e.id === "neu|A"));
    // Ohne Bremse standen hier 1.500 Verlaufszeilen „gelöscht: …" in der Datei.
    const geloeschtZeilen = JSON.parse(platte["kalender-daten.json"]).entries
      .filter((e) => String(e.id).startsWith("log|") && /gelöscht/.test(String(e.was || ""))).length;
    pruef("(1) Keine Flut von „gelöscht“-Verlaufszeilen", geloeschtZeilen < 10, geloeschtZeilen + " Zeilen");
    const meldung = await p.locator("body").innerText();
    pruef("(1) Die App erklärt den Sicherheits-Stopp laut",
          /Sicherheits-Stopp/.test(meldung) && /bleibt vollständig erhalten/.test(meldung));
    pruef("(1) Keine Skriptfehler", fehler.length === 0, fehler.join(" | "));
    await ctx.close();
  }

  /* ---- (2) Gegenprobe: GEWOLLTE große Löschung (Archiv-Räumung) geht weiter ----
     Viele alte Jahrgänge weg, aber tausende aktuelle bleiben - die Bremse
     darf hier NICHT greifen, sonst wäre das Jahres-Archiv tot. */
  {
    const { p, ctx, fachlich } = await seite(browser, baueBestand(3000));
    await p.evaluate(async () => {
      const roh = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
      // Archiv-Verhalten: alles vor 2023 raus, der Rest (weit über 100) bleibt.
      const behalten = roh.filter((e) => String(e.date) >= "2023");
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify(behalten));
    });
    await p.waitForTimeout(3000);
    const f = fachlich();
    const alteWeg = f.every((e) => !(String(e.id).startsWith("alt|") && String(e.date) < "2023"));
    pruef("(2) Gewollte Archiv-Räumung läuft durch (alte Jahrgänge sind weg)", alteWeg,
          f.length + " verbleibend");
    pruef("(2) Die aktuellen Jahrgänge sind noch da", f.some((e) => String(e.date) >= "2023"));
    await ctx.close();
  }

  await browser.close();
  console.log(`\nHärte 69 (Notbremse Massenlöschung): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})();
