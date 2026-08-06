/* Prüft das ECHTE Programm (Electron-Rahmen aus programm/), nicht nur die
 * nachgebaute Brücke: startet Electron mit main.js + vorspann.js unter einem
 * virtuellen Bildschirm, verbindet sich über den Chrome-Fernzugang und fährt
 * die App gegen echte Dateien auf der Platte.
 *
 * Braucht: programm/node_modules (cd programm && npm install) und Xvfb.
 * Läuft deshalb als eigene Suite neben den Härtetests - wie die
 * PowerShell-Prüfungen, die auch nur laufen, wo ihr Werkzeug da ist.
 *
 * Aufruf:  node tests/pruefe-programm.js
 */
const { chromium } = require("/home/user/WerkstattKalender/tests/node_modules/playwright-core");
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  const wurzel = path.resolve(__dirname, "..");
  const elektronBin = path.join(wurzel, "programm", "node_modules", ".bin", "electron");
  if (!fs.existsSync(elektronBin)) {
    console.log("UEBERSPRUNGEN: programm/node_modules fehlt (cd programm && npm install)");
    process.exit(0);
  }

  // Echtes Arbeitsverzeichnis mit gemeinsamer Datei
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "wk-electron-"));
  const dateiPfad = path.join(ordner, "werkstatt-kalender-daten.json");
  const jetzt = new Date().toISOString();
  fs.writeFileSync(dateiPfad, JSON.stringify({
    format: "werkstatt-kalender-v1", savedAt: jetzt,
    entries: [{ id: "e1", date: "2026-08-06", category: "SCHICHT", name: "Anna", scope: "tag", wert: "Früh", updatedAt: jetzt }],
    deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [{ name: "Anna", rolle: "mech" }] },
  }, null, 2));

  // Die frisch gebaute HTML ins Programm legen (wie bauen.js es tut)
  fs.mkdirSync(path.join(wurzel, "programm", "app"), { recursive: true });
  fs.copyFileSync(path.join(wurzel, "Werkstatt_Kalender_TPM.html"), path.join(wurzel, "programm", "app", "Werkstatt_Kalender_TPM.html"));

  // Electron unter virtuellem Bildschirm starten, Fernzugang auf Port 9223
  const port = 9223;
  const kind = spawn("xvfb-run", ["-a", elektronBin, ".", "--no-sandbox", `--remote-debugging-port=${port}`], {
    cwd: path.join(wurzel, "programm"),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let kindLog = "";
  kind.stdout.on("data", (d) => { kindLog += d; });
  kind.stderr.on("data", (d) => { kindLog += d; });

  // Auf den Fernzugang warten
  let browser = null;
  for (let i = 0; i < 40 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch (e) { /* noch nicht bereit */ }
  }
  if (!browser) {
    console.error("Electron kam nicht hoch. Log:\n" + kindLog.slice(-2000));
    kind.kill();
    process.exit(1);
  }

  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => /Werkstatt/i.test(p.url()) || true) || ctx.pages()[0];
  await page.waitForTimeout(1500);

  pruef("Das Programm startet und lädt die App",
    (await page.title()).length > 0, await page.title());
  pruef("Die Brücke des Vorspann-Skripts ist da",
    await page.evaluate(() => !!window.__werkstattDesktop));
  pruef("Die App erkennt die Programm-Umgebung",
    await page.evaluate(() => !!(window.__wkSharedTest && true)), "Test-Zugang vorhanden");

  // Verbinden über die ECHTE Brücke (echtes IPC, echtes fs im Hauptprozess)
  await page.evaluate(async (pfad) => {
    const handle = window.__wkDesktopTest.dateiHandle(pfad);
    await window.__wkSharedTest.adopt(handle, "readwrite");
  }, dateiPfad);
  await page.waitForTimeout(800);
  pruef("Verbinden über die echte Brücke klappt",
    await page.evaluate(() => window.__wkSharedTest.canWrite()));
  pruef("Die Kennkarte nennt den vollen echten Pfad",
    (await page.evaluate(() => window.__wkSharedTest.fileInfo().pfad)) === dateiPfad,
    await page.evaluate(() => window.__wkSharedTest.fileInfo().pfad));

  // Speichern -> auf der Platte nachsehen (durch echtes IPC geschrieben)
  await page.evaluate(async () => {
    const alt = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
    await window.storage.set("werkstatt-kalender-entries",
      JSON.stringify(alt.concat([{ id: "programm-1", date: "2026-08-07", category: "SCHICHT", name: "Anna", scope: "tag", wert: "Spät" }])), false);
  });
  await page.waitForTimeout(1000);
  const aufPlatte = JSON.parse(fs.readFileSync(dateiPfad, "utf8"));
  pruef("Das Speichern läuft durch das echte Programm auf die Platte",
    aufPlatte.entries.some((e) => e.id === "programm-1"),
    aufPlatte.entries.filter((e) => !/^(config\||log\|)/.test(e.id)).map((e) => e.id).join(", "));
  pruef("Atomar geschrieben: keine Zwischendatei liegengeblieben",
    !fs.readdirSync(ordner).some((n) => n.includes(".schreibe-")),
    fs.readdirSync(ordner).join(", "));

  // Bildschirmfoto des echten Programmfensters
  const foto = path.join(os.tmpdir(), "werkstatt-programm.png");
  await page.screenshot({ path: foto });
  console.log("Bildschirmfoto:", foto);

  console.log(`\n==== ECHTES PROGRAMM: ${ok} PASS / ${fail} FAIL ====`);
  await browser.close();
  kind.kill();
  fs.rmSync(ordner, { recursive: true, force: true });
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
