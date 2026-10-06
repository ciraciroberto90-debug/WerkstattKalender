// Härtetest: OEE-KACHEL NACH DEM PROGRAMMSTART (Roberto 06.10.: „Ich muss
// jedesmal die OEE-Tabelle prüfen, meistens nach Programmstart")
//
// Nach dem Start las die Kachel zu früh: der gemerkte Quellordner war noch
// nicht wiederhergestellt bzw. das Laufwerk noch nicht da -> „OEE · Tabelle
// prüfen" in Rot, und erst der Minutentakt heilte es. Jetzt gilt:
//   (1) Ein Fehlschlag in den ersten zwei Minuten nach dem Start - solange die
//       Tabelle in dieser Sitzung noch nie gelesen wurde - ist kein Rot, sondern
//       grau „OEE wird gelesen" (der Grund steht im Tooltip). Verschwindet eine
//       schon gelesene Tabelle, bleibt das sofort rot (harte-40 (6)).
//   (2) Danach wird in kurzen Abständen (10 s) nachgelesen, nicht erst nach
//       einer Minute - bis zu sechs Mal.
//   (3) Sobald der Quellordner wiederhergestellt ist, liest die Kachel sofort.
//   (4) Ein Fehlschlag NACH den ersten zwei Minuten bleibt rot wie bisher.
//
// Nachgestellt mit einem Datenordner, dessen Tabelle in den ersten Sekunden
// „nicht da" ist (NotFoundError wie bei einem noch nicht verbundenen W:).
// Rot-Nachweis: gegen den Bau vor dem 06.10. (APP_PFAD) ist (1) rot - die
// Kachel zeigt sofort „Tabelle prüfen" - und (2) rot, weil erst nach 60 s
// nachgelesen wird.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { arbeitsmappeBauen } = require("../hilfen/xlsx-bauen.js");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const vorStunden = (h) => new Date(Date.now() - h * 3600e3);
const MAPPE = () => arbeitsmappeBauen([{ name: "OEE", zeilen: [
  ["Datum", "Uhrzeit", "Anlage", "Schicht", "Verfügbarkeit", "Leistung", "Qualität", "OEE"],
  [{ datum: vorStunden(5) }, { datum: vorStunden(5) }, "BTS", "Früh", { prozent: 0.94 }, { prozent: 0.92 }, { prozent: 0.99 }, { prozent: 0.860 }],
  [{ datum: vorStunden(3) }, { datum: vorStunden(3) }, "VSM1", "Früh", { prozent: 0.88 }, { prozent: 0.93 }, { prozent: 1.00 }, { prozent: 0.820 }],
] }]);

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async ({ fehltMs = 4000 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.addInitScript(({ b64, fehltMs }) => {
      const roh = atob(b64); const arr = new Uint8Array(roh.length); for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i);
      window.__start = Date.now(); window.__leseversuche = [];
      window.__kalender = JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: new Date().toISOString(), entries: [], deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [], oee: { datei: "OEE_Halle1.xlsx", blatt: "OEE", kopfzeile: null, spalten: {} } } });
      const jsonHandle = { name: "werkstatt-kalender-daten.json", kind: "file", async getFile() { return new File([window.__kalender], "werkstatt-kalender-daten.json", { type: "application/json" }); }, async createWritable() { let t = ""; return { async write(c) { t += c; }, async close() { window.__kalender = t; } }; }, async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } };
      const xlsxHandle = { name: "OEE_Halle1.xlsx", kind: "file", async getFile() { return new File([arr], "OEE_Halle1.xlsx", { lastModified: 1000 }); }, async createWritable() { throw new Error("Schreiben verboten"); }, async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } };
      window.__ordnerHandle = { name: "Werkstatt", kind: "directory",
        async *entries() { yield ["werkstatt-kalender-daten.json", jsonHandle]; if (Date.now() - window.__start > fehltMs) yield ["OEE_Halle1.xlsx", xlsxHandle]; },
        async getFileHandle(n) {
          if (n === "werkstatt-kalender-daten.json") return jsonHandle;
          // Die Tabelle ist in den ersten Sekunden "nicht da" (Laufwerk noch nicht verbunden)
          window.__leseversuche.push(Date.now() - window.__start);
          if (n === "OEE_Halle1.xlsx" && Date.now() - window.__start > fehltMs) return xlsxHandle;
          const e = new Error("NotFoundError"); e.name = "NotFoundError"; throw e;
        },
        async removeEntry() {}, async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } };
      window.showOpenFilePicker = async () => [jsonHandle];
      localStorage.setItem("bta-standort", "scheurich");
    }, { b64: MAPPE().toString("base64"), fehltMs });
    await p.goto(APP);
    await p.waitForTimeout(400);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(700);
    await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(150);
    await p.evaluate(() => window.__wkSharedTest.adoptFolder(window.__ordnerHandle));
    await p.waitForTimeout(600);
    return { ctx, p, fehler };
  };
  const kachel = (p) => p.locator("button[title*='OEE']").first();
  const kachelText = async (p) => (await kachel(p).innerText()).replace(/\s+/g, " ");
  const kachelFarbe = (p) => kachel(p).evaluate((b) => getComputedStyle(b.querySelector("div")).color);

  /* (1) + (2) + (3): Tabelle fehlt die ersten 4 s */
  const t0 = Date.now();
  const v = await seite({ fehltMs: 4000 });
  const text1 = await kachelText(v.p);
  const farbe1 = await kachelFarbe(v.p);
  ok("(1) Direkt nach dem Start (Tabelle noch nicht da): grau „OEE wird gelesen“, NICHT rot „Tabelle prüfen“",
    /OEE wird gelesen/.test(text1) && !/Tabelle prüfen/.test(text1) && farbe1 !== "rgb(178, 58, 52)", `${text1} · ${farbe1}`);
  const gruen = await v.p.waitForFunction(() => /84,0/.test((document.querySelector("button[title*='OEE']") || {}).innerText || ""), null, { timeout: 25000 }).then(() => true).catch(() => false);
  const dauer = Math.round((Date.now() - t0) / 1000);
  const versuche = await v.p.evaluate(() => window.__leseversuche.map((t) => Math.round(t / 1000)));
  console.log(`MESSUNG Kachel grün nach ${dauer} s · Leseversuche nach Sekunden: ${versuche.join(", ")}`);
  ok("(2) Ohne Zutun binnen 25 s die Zahl 84,0 – kurze Nachlese (10 s) statt Minutentakt", gruen && dauer < 25, `${dauer} s, Versuche: ${versuche.join(", ")}`);
  // Der erste Takt läuft, bevor der Ordner da ist (kein Griff zur Datei); die
  // Nachlese greift nach ~10 s zur Datei - deutlich vor dem Minutentakt.
  ok("(2) Die Nachlese greift binnen 20 Sekunden zur Tabelle (nicht erst im Minutentakt)", versuche.some((t) => t <= 20), versuche.join(", "));
  ok("(E) Keine Skriptfehler", v.fehler.length === 0, v.fehler.slice(0, 2).join(" | "));
  await v.ctx.close();

  /* (4) Fehlschlag NACH den ersten zwei Minuten bleibt rot: die App-Uhr steht auf +3 min */
  const w = await seite({ fehltMs: 10 * 60 * 1000 });
  // Zwei Minuten „vergehen lassen“: Startmarke der App zurückdrehen, dann einen Takt auslösen
  await w.p.evaluate(() => { if (window.__wkOeeTest) window.__wkOeeTest.startZurueck(3 * 60 * 1000); });
  await w.p.evaluate(() => { window.dispatchEvent(new Event("focus")); });
  await w.p.waitForTimeout(700);
  const text4 = await kachelText(w.p);
  ok("(4) Nach zwei Minuten bleibt ein Fehlschlag rot „OEE · Tabelle prüfen“ – nichts wird dauerhaft verschwiegen", /Tabelle prüfen/.test(text4), text4);
  await w.ctx.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
