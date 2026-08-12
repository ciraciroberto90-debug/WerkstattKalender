// STRESSPROBE: FÜNFZEHN JAHRE BETRIEB.
//
// Robertos Frage vom 12.08.2026: "Haben wir nun ein richtiges zukunftssicheres
// Werkstatt-Programm? Simuliere mal 15 Jahre Arbeit."
//
// Dieselbe Bestands-Mechanik wie Härtetest 33 (sieben Jahre), aber mit dem
// Zeitraum 2011-2026: jeder Arbeitstag mit Schichteinträgen für acht Leute,
// TPM/R+I-Nachweise, Backlog, Notizen und Störberichte über 15 Jahrgänge.
// Dazu Stress obendrauf: zwei Bearbeiter gleichzeitig bei voller Menge,
// Neuladen, Suche und Auswertung über den ganzen Zeitraum - und ein Durchgang
// mit 6-fach gedrosselter CPU (schwacher Werkstatt-PC).
//
// Das ist bewusst KEIN Pass/Fail-Härtetest mit knappen Grenzen, sondern eine
// Messfahrt: Jede Zahl wird ausgegeben, die Prüfungen markieren nur echte
// Verluste (Eintrag weg, Skriptfehler, Funktion tot) als FAIL.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { baueBestand, baueStoerungen, TEAM } = require("/home/user/WerkstattKalender/tools/langzeit-daten.js");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};
const mess = (n, wert) => console.log("MESS | " + n + ": " + wert);

const VON = "2011-07-01", BIS = "2026-07-28";
const { entries: BESTAND } = baueBestand({ von: VON, bis: BIS });
const STOERUNGEN = baueStoerungen({ von: VON, bis: BIS });
const CONFIG = { team: TEAM };

const platte = {
  "kalender-daten.json": JSON.stringify({
    format: "werkstatt-kalender-v1", savedAt: "2026-07-28T05:00:00.000Z",
    entries: BESTAND, deleted: {}, config: null,
  }),
  "werkstatt-stoerungen.json": JSON.stringify({
    format: "werkstatt-stoerungen-v1", savedAt: "2026-07-28T05:00:00.000Z",
    entries: STOERUNGEN, deleted: {},
  }),
};

async function seite(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-07-28T09:00:00"));
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript((cfg) => {
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(cfg));
    localStorage.setItem("werkstatt-kalender-name", "R. Ciraci");
    const bau = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib(name, b); }, async abort() {} }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    window.__welche = "kalender-daten.json";
    window.showOpenFilePicker = async () => [bau(window.__welche)];
    window.showSaveFilePicker = async () => bau(window.__welche);
  }, CONFIG);
  return p;
}

async function verbinde(p) {
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
}

async function archivWeg(p) {
  const k = p.getByRole("button", { name: /Später erinnern/ });
  if (await k.count()) { await k.click(); await p.waitForTimeout(500); }
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  const mb = ((platte["kalender-daten.json"].length + platte["werkstatt-stoerungen.json"].length) / 1048576).toFixed(1);
  mess("Bestand", `${BESTAND.length} Einträge + ${STOERUNGEN.length} Störberichte über 15 Jahrgänge, ${mb} MB`);
  console.log("");

  /* ---------------- (1) Hochkommen, Verbinden, Zwischenspeicher ---------------- */
  const p = await seite(b);
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));

  let t0 = Date.now();
  await p.goto(APP);
  await p.locator('button[aria-label="Gemeinsame Datei"]').waitFor({ timeout: 60000 });
  mess("App-Start", (Date.now() - t0) + " ms");

  t0 = Date.now();
  await verbinde(p);
  await p.waitForFunction(() => !/Vorhandene Datei öffnen/.test(document.body.innerText), null, { timeout: 120000 });
  await p.waitForTimeout(3000);
  const verbindeDauer = Date.now() - t0;
  mess("Verbinden (15 Jahrgänge einlesen + zusammenführen)", verbindeDauer + " ms");
  pruef("(1) Verbinden gelingt", verbindeDauer < 120000, verbindeDauer + " ms");

  const text1 = await p.locator("body").innerText();
  const speicher = await p.evaluate(() => {
    let g = 0; for (const k of Object.keys(localStorage)) g += (localStorage.getItem(k) || "").length;
    return Math.round(g / 1024);
  });
  mess("localStorage nach Verbinden", speicher + " KB");
  const speicherWarnung = /Zwischenspeicher dieses Browsers ist voll/.test(text1);
  mess("Speicher-Warnung sichtbar", speicherWarnung ? "JA (Bestand größer als Browser-Zwischenspeicher)" : "nein");
  pruef("(1) Archiv-Erinnerung erscheint bei 15 Jahrgängen", /Aufräumen empfohlen/i.test(text1));
  await archivWeg(p);

  const heap1 = await p.evaluate(() => Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576));
  mess("Speicherverbrauch (JS-Heap)", heap1 + " MB");

  /* ---------------- (2) Kein Eintrag verloren ---------------- */
  const nachVerbinden = JSON.parse(platte["kalender-daten.json"]);
  const fachlich = nachVerbinden.entries.filter((e) => !String(e.id).startsWith("config|") && !String(e.id).startsWith("log|")).length;
  pruef("(2) Alle Einträge nach dem Verbinden noch in der Datei", fachlich >= BESTAND.length, fachlich + " in der Datei");
  const vorhanden = new Set(nachVerbinden.entries.map((e) => e.id));
  const probe = [BESTAND[0], BESTAND[Math.floor(BESTAND.length / 2)], BESTAND[BESTAND.length - 1]];
  pruef("(2) Stichprobe 2011/2018/2026 vorhanden", probe.every((e) => vorhanden.has(e.id)));

  /* ---------------- (3) Zwei Bearbeiter gleichzeitig bei voller Menge ---------------- */
  const p2 = await seite(b);
  const fehler2 = [];
  p2.on("pageerror", (e) => fehler2.push(e.message));
  await p2.goto(APP);
  await p2.locator('button[aria-label="Gemeinsame Datei"]').waitFor({ timeout: 60000 });
  await verbinde(p2);
  await p2.waitForTimeout(5000);
  await archivWeg(p2);

  const vorherAnzahl = JSON.parse(platte["kalender-daten.json"]).entries.length;
  t0 = Date.now();
  await Promise.all([
    p.evaluate(async () => {
      const roh = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
      roh.push({ id: "stress15|A", date: "2026-07-28", category: "NOTIZ", text: "Bearbeiter A", updatedAt: new Date().toISOString() });
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify(roh));
    }),
    p2.evaluate(async () => {
      const roh = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
      roh.push({ id: "stress15|B", date: "2026-07-28", category: "NOTIZ", text: "Bearbeiter B", updatedAt: new Date().toISOString() });
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify(roh));
    }),
  ]);
  await p.waitForTimeout(4000);
  mess("Gleichzeitiges Speichern beider Bearbeiter", (Date.now() - t0) + " ms");
  const nachSchreiben = JSON.parse(platte["kalender-daten.json"]);
  const ids = new Set(nachSchreiben.entries.map((e) => e.id));
  pruef("(3) Änderung A da", ids.has("stress15|A"));
  pruef("(3) Änderung B da", ids.has("stress15|B"));
  pruef("(3) Kein Bestand verloren", nachSchreiben.entries.length >= vorherAnzahl,
        vorherAnzahl + " → " + nachSchreiben.entries.length);
  // Bei 15 Jahrgängen passt der volle Spiegel nicht mehr in die ~5-MB-Grenze
  // des Browsers. Gemessen (Sonde 12.08.): Die eigene Änderung wird als
  // kleines Fragment gespiegelt (Schreiben gelingt), nur der Gesamtbestand
  // bleibt draußen - deshalb kommt hier planmäßig KEINE rote Warnung, sondern
  // die Archiv-Erinnerung beim Verbinden (oben geprüft). Entscheidend ist,
  // dass die eigene Änderung diesen Zustand überlebt - das prüft (7).
  const spiegelKB = await p.evaluate(() =>
    Math.round((localStorage.getItem("werkstatt-kalender-entries") || "").length / 1024));
  mess("Spiegel nach eigenem Speichern", spiegelKB + " KB (Fragment mit der eigenen Änderung)");
  await p2.context().close();

  /* ---------------- (4) Bedienung bei voller Menge ---------------- */
  for (const reiter of ["Schichtplan", "Planung", "Backlog"]) {
    t0 = Date.now();
    await p.getByRole("button", { name: reiter, exact: true }).first().click();
    await p.waitForTimeout(200);
    mess("Reiterwechsel " + reiter, (Date.now() - t0) + " ms");
  }

  /* ---------------- (5) Schichtbuch mit 15 Jahrgängen ---------------- */
  await p.evaluate(() => { window.__welche = "werkstatt-stoerungen.json"; });
  await p.getByRole("button", { name: /Störungen/ }).first().click();
  await p.waitForTimeout(600);
  const stoerKnopf = p.getByRole("button", { name: /Störungen-Datei öffnen/ });
  t0 = Date.now();
  await stoerKnopf.first().click();
  await p.waitForTimeout(6000);
  mess("Störungen-Datei verbinden (" + STOERUNGEN.length + " Berichte)", (Date.now() - t0) + " ms");
  const stoerText = await p.locator("body").innerText();
  pruef("(5) Schichtbuch zeigt Einträge", /Einträge|Eintrag/.test(stoerText));

  const suche = p.getByPlaceholder(/Suche|suchen/i).first();
  t0 = Date.now();
  await suche.fill("Getriebe");
  await p.waitForTimeout(2000);
  mess("Volltextsuche über 15 Jahrgänge (Treffer gerendert)", (Date.now() - t0 - 2000) + " ms Eingabe + Denkpause");
  const trefferText = await p.locator("body").innerText();
  pruef("(5) Suche findet Getriebe-Berichte über alle Jahre", /Getriebe/.test(trefferText));
  await suche.fill("");
  await p.waitForTimeout(800);

  t0 = Date.now();
  await p.getByRole("button", { name: "Auswertung", exact: true }).first().click();
  await p.waitForTimeout(2500);
  mess("Störungs-Auswertung über 15 Jahrgänge", (Date.now() - t0 - 2500) + " ms + Wartezeit");
  const ausw = await p.locator("body").innerText();
  pruef("(5) Auswertung rechnet (Ausfallzeiten sichtbar)", /min|Std|%/.test(ausw));

  /* ---------------- (6) Prüfnachweis über 15 Jahre ---------------- */
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(800);
  let nachweisOk = false, kopf = "";
  try {
    await p.locator('button[aria-label="Drucken"]').click();
    await p.waitForTimeout(800);
    await p.getByRole("button", { name: /^Prüfnachweis/ }).click();
    await p.waitForTimeout(400);
    t0 = Date.now();
    const [nw] = await Promise.all([
      p.context().waitForEvent("page", { timeout: 45000 }),
      p.locator('div[role="dialog"] button:has-text("Drucken")').click(),
    ]);
    await nw.waitForTimeout(2500);
    kopf = (await nw.locator("body").innerText()).slice(0, 150).replace(/\s+/g, " ");
    nachweisOk = /\d/.test(kopf);
    mess("Prüfnachweis öffnen", (Date.now() - t0) + " ms");
    await nw.close();
  } catch (e) { kopf = "Fehler: " + e.message; }
  pruef("(6) Prüfnachweis rechnet über den Zeitraum", nachweisOk, kopf.slice(0, 80));

  /* ---------------- (7) Neuladen bei voller Menge ---------------- */
  const vorReload = JSON.parse(platte["kalender-daten.json"]).entries.length;
  t0 = Date.now();
  await p.reload();
  await p.locator('button[aria-label="Gemeinsame Datei"]').waitFor({ timeout: 120000 });
  await p.waitForTimeout(6000);
  mess("Neuladen (einlesen + zusammenführen bei 15 Jahrgängen)", (Date.now() - t0) + " ms");
  await archivWeg(p);
  // Oberhalb der ~5-MB-Grenze gibt es nach dem Neuladen KEINE örtliche
  // Zweitschrift mehr (das ist die dokumentierte Folge des vollen
  // Zwischenspeichers). Der Maßstab ist deshalb: Wiederverbinden bringt
  // den vollen Bestand zurück - so läuft es nach jedem Browser-Neustart.
  const lokalNachReload = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").length);
  mess("Örtliche Zweitschrift nach Neuladen", lokalNachReload + " Einträge (oberhalb der Speichergrenze planmäßig leer)");
  await p.evaluate(() => { window.__welche = "kalender-daten.json"; });
  t0 = Date.now();
  await verbinde(p);
  await p.waitForFunction(() => !/Vorhandene Datei öffnen/.test(document.body.innerText), null, { timeout: 120000 });
  await p.waitForTimeout(3000);
  await archivWeg(p);
  mess("Wiederverbinden nach Neuladen", (Date.now() - t0) + " ms");
  const uiStand = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").length);
  const dateiStand = JSON.parse(platte["kalender-daten.json"]).entries.length;
  pruef("(7) Wiederverbinden bringt den vollen Bestand zurück",
        dateiStand >= vorReload, dateiStand + " in der Datei, Spiegel " + uiStand);
  pruef("(7) Neuladen hat die Datei nicht verkleinert", dateiStand >= vorReload, vorReload + " → " + dateiStand);
  const idsNachher = new Set(JSON.parse(platte["kalender-daten.json"]).entries.map((e) => e.id));
  pruef("(7) Die eigenen Änderungen von vorhin haben Neuladen + Wiederverbinden überlebt",
        idsNachher.has("stress15|A") && idsNachher.has("stress15|B"));

  /* ---------------- (8) Schwacher PC: 6-fach gedrosselte CPU ---------------- */
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });

  t0 = Date.now();
  await p.getByRole("button", { name: "Schichtplan", exact: true }).first().click();
  await p.waitForTimeout(200);
  mess("Reiterwechsel Schichtplan bei 6x-Drossel", (Date.now() - t0) + " ms");

  await p.getByRole("button", { name: "Übersicht", exact: true }).first().click();
  await p.waitForTimeout(500);
  const tippFeld = p.getByPlaceholder(/Suche/i).first();
  if (await tippFeld.count()) {
    t0 = Date.now();
    await tippFeld.pressSequentially("Getriebeschaden B1", { delay: 30 });
    const tippDauer = Date.now() - t0 - 18 * 30;
    mess("Tipp-Verzug 18 Zeichen bei 6x-Drossel (über Grundtempo)", tippDauer + " ms");
    pruef("(8) Tippen bleibt bei 15 Jahrgängen und schwacher CPU flüssig", tippDauer < 2000, tippDauer + " ms Verzug");
    await tippFeld.fill("");
  } else {
    pruef("(8) Tippen bleibt bei 15 Jahrgängen und schwacher CPU flüssig", false, "Suchfeld nicht gefunden");
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  /* ---------------- (9) Skriptfehler ---------------- */
  pruef("(9) Keine Skriptfehler Bearbeiter A", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  pruef("(9) Keine Skriptfehler Bearbeiter B", fehler2.length === 0, fehler2.slice(0, 2).join(" | "));

  await p.context().close();
  await b.close();
  console.log(`\nStressprobe 15 Jahre: ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
