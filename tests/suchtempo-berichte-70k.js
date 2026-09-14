// SUCHTEMPO der Berichte-Startsuche bei 70.000 Einträgen.
//
// Die neue bereichsweite Suche (14.09.) verspricht: der blanke Start bleibt
// frei von Suchkosten, und eine Suche muss die 2,0 s der alten
// Störungs-Volltextsuche einhalten oder unterbieten. Das wird hier GEMESSEN,
// nicht behauptet - mit derselben ehrlichen Stoppuhr wie die Klickrunde
// (Doppel-requestAnimationFrame als "gezeichnet"-Signal, keine Puffer).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { baueBestand, baueStoerungen, TEAM } = require("/home/user/WerkstattKalender/tools/langzeit-daten.js");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

const mess = (n, ms) => console.log("MESS | " + n.padEnd(52) + String(ms).padStart(6) + " ms");

(async () => {
  const VON = "2011-07-01", BIS = "2026-09-11";
  const { entries: BESTAND } = baueBestand({ von: VON, bis: BIS });
  const STOERUNGEN = baueStoerungen({ von: VON, bis: BIS });
  console.log(`Bestand: ${BESTAND.length} + ${STOERUNGEN.length} Störberichte = ${BESTAND.length + STOERUNGEN.length}\n`);

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

  // Verbinden wie im Alltag
  await p.goto(APP);
  await p.locator('button[aria-label="Gemeinsame Datei"]').waitFor({ timeout: 60000 });
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForFunction(() => !/Vorhandene Datei öffnen/.test(document.body.innerText), null, { timeout: 120000 });
  await p.waitForTimeout(1500);
  const sp = p.getByRole("button", { name: /Später erinnern/ });
  if (await sp.count()) await sp.click();
  // Störungs-Datei dazu
  await p.evaluate(() => { window.__welche = "werkstatt-stoerungen.json"; });
  await p.getByRole("button", { name: /^Berichte/ }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /^Störungen/ }).first().click();
  await p.waitForTimeout(400);
  const sk = p.getByRole("button", { name: /Störungen-Datei öffnen/ });
  if (await sk.count()) {
    await sk.first().click();
    await p.waitForFunction(() => /behoben/.test(document.body.innerText), null, { timeout: 60000 });
  }

  // Auf die Berichte-Startseite - der blanke Start (Kacheln + Halbkreise)
  let t0 = Date.now();
  await p.getByRole("button", { name: "Alle Berichte", exact: true }).click();
  await gezeichnet();
  mess("Berichte-Start öffnen (Halbkreise + Kacheln, 70k)", Date.now() - t0);

  // Suchen: das Feld dämpft 150 ms - die Stoppuhr läuft ab dem Tippen bis
  // die Trefferliste GEZEICHNET ist (so erlebt es der Benutzer).
  const feld = p.locator('input[placeholder*="Über alle Berichte"]');
  for (const wort of ["Getriebe", "Riemen", "4711"]) {
    t0 = Date.now();
    await feld.fill(wort);
    await p.waitForFunction(() => /Treffer über alle Berichte/i.test(document.body.innerText), null, { timeout: 60000 });
    await gezeichnet();
    const zeile = (await p.locator("body").innerText()).match(/(\d+) Treffer über alle Berichte/i);
    mess(`Suche "${wort}" bis zur gezeichneten Trefferliste`, Date.now() - t0);
    console.log("       Treffer: " + (zeile ? zeile[1] : "?"));
    t0 = Date.now();
    await feld.fill("");
    await p.waitForFunction(() => !/Treffer über alle Berichte/i.test(document.body.innerText), null, { timeout: 60000 });
    await gezeichnet();
    mess("Suche leeren (Kacheln wieder gezeichnet)", Date.now() - t0);
  }

  // Filter-Pille ohne Suchwort: schlimmster Fall "Alle einer Art"
  t0 = Date.now();
  await p.getByRole("button", { name: "Zeiterfassung", exact: true }).last().click();
  await p.waitForFunction(() => /Treffer über alle Berichte/i.test(document.body.innerText), null, { timeout: 60000 });
  await gezeichnet();
  mess("Filter-Pille Zeiterfassung ohne Suchwort (10.648 Buchungen)", Date.now() - t0);

  console.log("\nSuchtempo-Messung beendet");
  await b.close();
})();
