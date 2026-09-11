// KLICKRUNDE BEI 70.000 EINTRÄGEN - was der Benutzer wirklich spürt.
//
// Robertos Frage vom 11.09.: „Ich öffne in 5 Jahren die App und sie hat
// 70.000 Einträge - wie lange dauert App-Start und das Durchklicken der
// einzelnen Bereiche?" Genau das misst diese Runde: einmal öffnen wie im
// Alltag (Neustart + Wiederverbinden), dann jeden Bereich anklicken.
// Jede Stoppuhr endet erst, wenn der Browser die neue Ansicht wirklich
// GEZEICHNET hat (Doppel-requestAnimationFrame) - keine festen Puffer.
//
// Ehrlich dazugesagt: Die Datei liegt im Speicher des Test-Rechners -
// gemessen ist die Arbeit der App, nicht das Netz des Firmenlaufwerks.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { baueBestand, baueStoerungen, TEAM } = require("/home/user/WerkstattKalender/tools/langzeit-daten.js");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

const mess = (n, ms) => console.log("MESS | " + n.padEnd(42) + String(ms).padStart(6) + " ms");

(async () => {
  const VON = "2011-07-01", BIS = "2026-09-11";
  const { entries: BESTAND } = baueBestand({ von: VON, bis: BIS });
  const STOERUNGEN = baueStoerungen({ von: VON, bis: BIS });
  console.log(`Bestand: ${BESTAND.length} Einträge + ${STOERUNGEN.length} Störberichte = ${BESTAND.length + STOERUNGEN.length} gesamt\n`);

  const platte = {
    "kalender-daten.json": JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: "2026-09-11T05:00:00.000Z", entries: BESTAND, deleted: {}, config: null }),
    "werkstatt-stoerungen.json": JSON.stringify({ format: "werkstatt-stoerungen-v1", savedAt: "2026-09-11T05:00:00.000Z", entries: STOERUNGEN, deleted: {} }),
  };
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const p = await (await b.newContext({ viewport: { width: 1500, height: 980 } })).newPage();
  await p.clock.setFixedTime(new Date("2026-09-11T09:00:00"));
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript((cfg) => {
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(cfg));
    const bau = (name) => ({ name, kind: "file",
      async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let x = ""; return { async write(c) { x += c; }, async close() { await window.__schreib(name, x); }, async abort() {} }; },
      async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } });
    window.__welche = "kalender-daten.json";
    window.showOpenFilePicker = async () => [bau(window.__welche)];
  }, { team: TEAM });

  const gezeichnet = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const klick = async (name, wie) => {
    const t0 = Date.now();
    await wie();
    await gezeichnet();
    mess(name, Date.now() - t0);
  };

  /* ---- Öffnen wie im Alltag: Start + Wiederverbinden (einmal je Neustart) ---- */
  let t0 = Date.now();
  await p.goto(APP);
  await p.locator('button[aria-label="Gemeinsame Datei"]').waitFor({ timeout: 60000 });
  await gezeichnet();
  mess("App-Start (bis die Oberfläche steht)", Date.now() - t0);

  t0 = Date.now();
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForFunction(() => !/Vorhandene Datei öffnen/.test(document.body.innerText), null, { timeout: 120000 });
  await gezeichnet();
  mess("Wiederverbinden (70.000 Einträge laden)", Date.now() - t0);
  await p.waitForTimeout(1500);
  const sp = p.getByRole("button", { name: /Später erinnern/ });
  if (await sp.count()) await sp.click();
  // Störungs-Datei dazu (gehört zum vollen Alltagsbild)
  await p.evaluate(() => { window.__welche = "werkstatt-stoerungen.json"; });
  await p.getByRole("button", { name: /^Berichte/ }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /^Störungen/ }).first().click();
  await p.waitForTimeout(400);
  const sk = p.getByRole("button", { name: /Störungen-Datei öffnen/ });
  if (await sk.count()) {
    t0 = Date.now();
    await sk.first().click();
    await p.waitForFunction(() => /behoben/.test(document.body.innerText), null, { timeout: 60000 });
    await gezeichnet();
    mess("Störungs-Datei dazuladen (2.700 Berichte)", Date.now() - t0);
  }
  await p.getByRole("button", { name: "Übersicht", exact: true }).first().click();
  await p.waitForTimeout(600);
  console.log("");

  /* ---- Die Klickrunde durch alle Bereiche ---- */
  await klick("Übersicht", async () => p.getByRole("button", { name: "Übersicht", exact: true }).first().click());
  await klick("Berichte (Kachel-Start)", async () => p.getByRole("button", { name: /^Berichte/ }).first().click());
  await klick("Berichte → To-do", async () => p.getByRole("button", { name: /^To-do/ }).first().click());
  await klick("Berichte → Störungen", async () => p.getByRole("button", { name: /^Störungen/ }).first().click());
  await klick("Berichte → Backlog", async () => p.getByRole("button", { name: "Backlog", exact: true }).first().click());
  await klick("Berichte → Zeiterfassung", async () => p.getByRole("button", { name: "Zeiterfassung", exact: true }).first().click());
  await klick("Werkstatt (Schichtplan)", async () => p.getByRole("button", { name: "Werkstatt", exact: true }).first().click());
  await klick("Werkstatt → Planung", async () => p.getByRole("button", { name: "Planung", exact: true }).first().click());
  await klick("TPM (Willkommen-Board)", async () => p.getByRole("button", { name: "TPM", exact: true }).first().click());
  await klick("TPM → Plan", async () => p.getByRole("button", { name: "Plan", exact: true }).first().click());
  await klick("TPM → Register", async () => p.getByRole("button", { name: "Register", exact: true }).first().click());
  await klick("Zurück zur Übersicht", async () => p.getByRole("button", { name: "Übersicht", exact: true }).first().click());

  /* ---- Zweite Runde: dieselben Klicks bei warmen Bereichen ---- */
  console.log("");
  await klick("2. Runde: Berichte → Störungen", async () => { await p.getByRole("button", { name: /^Berichte/ }).first().click(); await p.getByRole("button", { name: /^Störungen/ }).first().click(); });
  await klick("2. Runde: Berichte → Backlog", async () => p.getByRole("button", { name: "Backlog", exact: true }).first().click());
  await klick("2. Runde: Berichte → Zeiterfassung", async () => p.getByRole("button", { name: "Zeiterfassung", exact: true }).first().click());
  await klick("2. Runde: Werkstatt (Schichtplan)", async () => p.getByRole("button", { name: "Werkstatt", exact: true }).first().click());
  await klick("2. Runde: Übersicht", async () => p.getByRole("button", { name: "Übersicht", exact: true }).first().click());

  const fehlerfrei = await p.evaluate(() => !window.__hatteFehler);
  console.log("\nKlickrunde beendet" + (fehlerfrei ? "" : " (mit Skriptfehlern!)"));
  await b.close();
})();
