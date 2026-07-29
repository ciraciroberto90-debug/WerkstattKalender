// Bildschirmfotos fuer die Klickanleitung - samt der Koordinaten, auf die
// die Pfeile zeigen sollen.
//
// Die Pfeile werden NICHT nach Augenmass gesetzt. Playwright liefert die
// tatsaechliche Lage jedes Knopfes; die Anleitung rechnet damit. Verschiebt
// sich in der App etwas, wandert der Pfeil mit, statt daneben zu zeigen.
//
// Aufgenommen wird im VERBUNDENEN Zustand - sonst laeuft die App im
// Leser-Modus und das Zahnrad fehlt, das die Anleitung zeigen soll.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const path = require("path");

const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const ZIEL = "/home/user/WerkstattKalender/scratchpad/klickbilder";
fs.mkdirSync(ZIEL, { recursive: true });

const CONFIG = {
  team: [
    { name: "R. Ciraci", rolle: "mech" }, { name: "M. Weber", rolle: "elek" },
    { name: "T. Klein", rolle: "mech" }, { name: "S. Bauer", rolle: "azubi" },
  ],
};
const ENTRIES = [
  { id: "t1", date: "2026-07-29", category: "TPM", name: "BTS", status: "open", updatedAt: "2026-07-29T06:00:00.000Z" },
  { id: "t2", date: "2026-07-29", category: "TPM", name: "VSM1", status: "done", updatedAt: "2026-07-29T06:00:00.000Z" },
  { id: "t3", date: "2026-07-30", category: "RI", name: "HRO", status: "open", updatedAt: "2026-07-29T06:00:00.000Z" },
];

const platte = {
  "werkstatt-kalender-daten.json": JSON.stringify({
    format: "werkstatt-kalender-v1", savedAt: "2026-07-29T06:00:00.000Z",
    entries: ENTRIES, deleted: {}, config: null,
  }),
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-07-29T08:00:00"));
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript((d) => {
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(d.CONFIG));
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(d.ENTRIES));
    const h = {
      name: "werkstatt-kalender-daten.json", kind: "file",
      async getFile() { const t = await window.__lies(h.name); return new File([t], h.name, { type: "application/json" }); },
      async createWritable() { let x = ""; return { async write(c) { x += c; }, async close() { await window.__schreib(h.name, x); }, async abort() {} }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    };
    window.showOpenFilePicker = async () => [h];
    window.showSaveFilePicker = async () => h;
  }, { CONFIG, ENTRIES });
  await p.goto(APP);
  await p.waitForTimeout(1200);

  const marken = {};
  const merke = async (bild, name, locator, versatz) => {
    const k = await locator.boundingBox();
    if (!k) throw new Error("Kein Kasten fuer " + name);
    marken[bild] = marken[bild] || {};
    marken[bild][name] = {
      x: Math.round(k.x - (versatz ? versatz.x : 0)),
      y: Math.round(k.y - (versatz ? versatz.y : 0)),
      w: Math.round(k.width), h: Math.round(k.height),
    };
  };

  /* ---------- Bild 1: der Datei-Kasten, noch nicht verbunden ---------- */
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.waitForTimeout(500);
  const oeffnen = p.getByText("Vorhandene Datei öffnen …").first();
  const titel = p.getByText(/^Gemeinsame Datei \(/).first();
  const zustand = p.getByText(/Zurzeit wird nur lokal/).first();
  const tk = await titel.boundingBox();
  const bk = await oeffnen.boundingBox();
  const zk = await zustand.boundingBox();

  // Zwei Streifen statt eines Bildes: Ueberschrift und Knoepfe.
  //
  // Der Kasten besteht zu drei Vierteln aus Erklaertext. Nimmt man ihn ganz
  // auf, muss er im PDF so klein werden, dass die Knopfbeschriftung nicht mehr
  // zu lesen ist - und darum geht es hier ja gerade. Der weggelassene Teil
  // wird in der Anleitung sichtbar als Luecke gekennzeichnet, damit niemand
  // glaubt, bei ihm stuende zu viel.
  const links = Math.max(0, Math.min(tk.x, bk.x) - 22);
  const rechts = Math.min(1280, Math.max(tk.x + tk.width, bk.x + bk.width) + 22);
  const breite = rechts - links;

  const streifenTitel = { x: links, y: Math.max(0, tk.y - 20), width: breite };
  streifenTitel.height = tk.y + tk.height + 14 - streifenTitel.y;
  await p.screenshot({ path: path.join(ZIEL, "app-dialog-titel.png"), clip: streifenTitel });

  const streifenKnopf = { x: links, y: zk.y - 14, width: breite };
  streifenKnopf.height = bk.y + bk.height + 10 - streifenKnopf.y;
  await merke("dateikasten", "oeffnen", oeffnen, { x: streifenKnopf.x, y: streifenKnopf.y });
  const mk = marken.dateikasten.oeffnen;
  if (mk.x < 0 || mk.y < 0 || mk.x + mk.w > breite || mk.y + mk.h > streifenKnopf.height) {
    throw new Error("Marke liegt ausserhalb des Knopf-Streifens: " + JSON.stringify(mk));
  }
  await p.screenshot({ path: path.join(ZIEL, "app-dialog-knoepfe.png"), clip: streifenKnopf });

  /* ---------- verbinden, damit die volle Oberflaeche erscheint ---------- */
  await oeffnen.click();
  await p.waitForTimeout(2500);

  /* ---------- Bild 2: Kopfzeile im verbundenen Zustand ----------
     Nur die rechte Haelfte. Ueber die volle Breite waere ein Symbol im
     gedruckten A4-Blatt keine 4 mm gross - darauf einen Pfeil zu setzen
     hilft niemandem. Der Ausschnitt beginnt mitten in den Reitern, damit
     man trotzdem sieht, wo oben man ist. */
  const KOPF = { x: 600, y: 0, width: 680, height: 56 };
  const vKopf = { x: KOPF.x, y: KOPF.y };
  await merke("kopf", "ordnersymbol", p.locator('button[aria-label="Gemeinsame Datei"]'), vKopf);
  await merke("kopf", "stoerungen", p.getByRole("button", { name: /^störungen$/i }).first(), vKopf);
  const zahn = p.locator('button[aria-label="Werkstatt-Monitor"]').locator("xpath=preceding-sibling::button[1]");
  await merke("kopf", "zahnrad", zahn, vKopf);
  for (const [n, k] of Object.entries(marken.kopf)) {
    if (k.x < 0 || k.y < 0 || k.x + k.w > KOPF.width || k.y + k.h > KOPF.height) {
      throw new Error(`Marke ${n} liegt ausserhalb des Kopf-Ausschnitts: ${JSON.stringify(k)}`);
    }
  }
  await p.screenshot({ path: path.join(ZIEL, "app-kopf.png"), clip: KOPF });

  /* ---------- Bild 3: Namensfeld im Einstellungs-Dialog ---------- */
  await zahn.click();
  await p.waitForTimeout(900);
  // Das Feld steht unter der Ueberschrift "Dein Name (dieses Geraet)" und hat
  // weder Kennung noch Platzhalter - also ueber die Ueberschrift greifen.
  const ueberschrift = p.getByText(/Dein Name/i).first();
  let feldDa = true;
  try { await ueberschrift.waitFor({ timeout: 4000 }); } catch (e) { feldDa = false; }
  if (feldDa) {
    const feld = ueberschrift.locator("xpath=following::input[1]");
    await feld.scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    const uk = await ueberschrift.boundingBox();
    const fk = await feld.boundingBox();
    if (!uk || !fk) { feldDa = false; }
    else {
      const links = Math.max(0, Math.min(uk.x, fk.x) - 16);
      const oben = Math.max(0, uk.y - 14);
      const breite = Math.min(1280 - links, Math.max(uk.width, fk.width) + 32);
      const hoehe = Math.min(820 - oben, (fk.y + fk.height) - oben + 14);
      const v3 = { x: links, y: oben };
      await merke("name", "feld", feld, v3);
      await p.screenshot({ path: path.join(ZIEL, "app-name.png"), clip: { x: links, y: oben, width: breite, height: hoehe } });
    }
  }
  if (!feldDa) { console.log("HINWEIS: Namensfeld nicht gefunden - Bild 3 entfaellt"); }
  marken.__namensbild = feldDa;

  fs.writeFileSync(path.join(ZIEL, "marken.json"), JSON.stringify(marken, null, 2));
  console.log("Bilder:", fs.readdirSync(ZIEL).join(", "));
  console.log(JSON.stringify(marken, null, 1));
  await b.close();
})();
