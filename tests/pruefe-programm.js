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

  // Liegengebliebene Instanzen frueherer Laeufe wegrauemen - ein alter
  // Electron auf demselben Port liesse die Pruefung gegen die falsche
  // Instanz laufen ("bind() failed: Address already in use").
  try { execSync("pkill -9 -f 'electron \\.' || true; pkill -9 -f 'xvfb-run' || true", { shell: "/bin/bash" }); } catch (e) { /* nichts lief */ }
  await new Promise((r) => setTimeout(r, 800));

  // Frischer Programm-Zustand: Das Profil des letzten Laufs (gemerkte Pfade,
  // uebernommene Update-HTML) wuerde sonst in diese Pruefung hineinreichen.
  fs.rmSync(path.join(os.homedir(), ".config", "Werkstatt-Cockpit"), { recursive: true, force: true });
  fs.rmSync(path.join(os.homedir(), ".config", "werkstatt-cockpit"), { recursive: true, force: true });

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
  // Das App-Fenster heraussuchen (CDP kann auch Hilfsseiten listen)
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    page = ctx.pages().find((p) => /app-aktuell\.html|Werkstatt_Kalender_TPM\.html/i.test(p.url()));
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (!page) {
    console.error("App-Fenster nicht gefunden. Seiten:", ctx.pages().map((p) => p.url()).join(" | "));
    console.error("Log:\n" + kindLog.slice(-1500));
    kind.kill();
    process.exit(1);
  }
  // Auf den fertigen App-Start WARTEN statt eine feste Zeit zu raten
  try {
    await page.waitForFunction(() => window.__wkSharedTest && window.__wkDesktopTest, { timeout: 30000 });
  } catch (e) {
    const diag = await page.evaluate(() => ({
      url: location.href,
      titel: document.title,
      bruecke: !!window.__werkstattDesktop,
      shared: !!window.__wkSharedTest,
      bodyLen: document.body ? document.body.innerHTML.length : -1,
    })).catch(() => null);
    console.error("App nicht hochgekommen:", JSON.stringify(diag));
    console.error("Electron-Log:\n" + kindLog.slice(-2000));
    kind.kill();
    process.exit(1);
  }

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
    // adopt merkt bewusst nichts - fuer die Neustart-Pruefung nach dem Update
    // den Pfad so hinterlegen, wie es das normale Verbinden taete
    await window.__werkstattDesktop.merke("werkstatt-kalender-fs:handle", pfad);
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

  /* ---- Programm-Update am echten Rahmen ---- */
  // Update-Ordner mit einer NEUEREN App-HTML (Marker eingebaut, damit die
  // Uebernahme nachweisbar ist), daneben eine halbe Datei als Falle.
  const updateOrdner = fs.mkdtempSync(path.join(os.tmpdir(), "wk-update-"));
  const originalHtml = fs.readFileSync(path.join(wurzel, "Werkstatt_Kalender_TPM.html"), "utf8");
  // Marker ans ENDE haengen - "</html>" kommt auch mitten im JS-Buendel vor
  // (Druckvorlagen), replace() haette den Marker dort vergraben.
  const schnitt = originalHtml.lastIndexOf("</html>");
  const neueHtml = originalHtml.slice(0, schnitt) + "<script>window.__updateMarker='v2'</script></html>";
  fs.writeFileSync(path.join(updateOrdner, "Werkstatt_Kalender_TPM.html"), neueHtml);

  await page.evaluate((ordnerPfad) => window.__werkstattDesktop.updateOrdnerSetzen(ordnerPfad), updateOrdner);
  // updateOrdnerSetzen prueft sofort - die Meldung muss in der App ankommen
  await page.waitForTimeout(1000);
  const leiste = await page.locator("body").innerText();
  pruef("Update: Die Leiste 'Neue Version verfügbar' erscheint",
    /Neue Version verfügbar/.test(leiste));

  // Halbe Datei als NEUESTE hinlegen - sie darf NICHT uebernommen werden
  fs.writeFileSync(path.join(updateOrdner, "Werkstatt_Kalender_TPM (2).html"), neueHtml.slice(0, 150000));
  const fehlErgebnis = await page.evaluate(() => window.__werkstattDesktop.updateUebernehmen());
  pruef("Update: Eine halbe HTML wird NICHT übernommen",
    fehlErgebnis && fehlErgebnis.ok === false && /unvollstaendig|unvollständig/.test(String(fehlErgebnis.grund)),
    String(fehlErgebnis && fehlErgebnis.grund));
  pruef("Update: Die alte Fassung läuft unverändert weiter",
    await page.evaluate(() => !window.__updateMarker && !!window.__werkstattDesktop));

  // Falle wegraeumen, echtes Update durchfuehren -> Seite laedt neu, Marker da
  fs.unlinkSync(path.join(updateOrdner, "Werkstatt_Kalender_TPM (2).html"));
  await page.evaluate(() => { window.__werkstattDesktop.updateUebernehmen(); });
  // Die Seite laedt neu (loadFile) - auf die neue Fassung WARTEN statt raten
  let markerDa = false;
  try {
    await page.waitForFunction(() => window.__updateMarker === "v2", { timeout: 20000 });
    markerDa = true;
  } catch (e) { /* unten als FAIL gemeldet */ }
  pruef("Update: Nach der Übernahme läuft die NEUE Fassung", markerDa);
  let wiederVerbunden = false;
  try {
    await page.waitForFunction(() => window.__wkSharedTest && window.__wkSharedTest.canWrite(), { timeout: 20000 });
    wiederVerbunden = true;
  } catch (e) { /* unten als FAIL gemeldet */ }
  pruef("Update: Und die Datei ist wieder von selbst verbunden", wiederVerbunden, "canWrite nach Update");
  fs.rmSync(updateOrdner, { recursive: true, force: true });

  // Bildschirmfoto des echten Programmfensters
  const foto = path.join(os.tmpdir(), "werkstatt-programm.png");
  await page.screenshot({ path: foto });
  console.log("Bildschirmfoto:", foto);

  /* ---- Neue ZIP schlaegt alte Profil-Fassung (Robertos Fall vom 10.08.) ----
     Der Rahmen bevorzugte die per Update uebernommene Fassung BEDINGUNGSLOS -
     wer eine neue ZIP installierte, bekam trotzdem die alte App aus dem
     Profil und wunderte sich (Kachel "gesamt" statt "Gesamt", kein
     Erneut-versuchen-Knopf). Jetzt gewinnt die juengere Bau-Zeit.
     Nachgestellt: alte Fassung (ohne Bau-Stempel) als app-aktuell.html ins
     Profil legen, Programm neu starten - es MUSS die eingebaute laden. */
  await browser.close();
  // kind ist der xvfb-Wrapper - kill() liesse das Electron dahinter weiterlaufen,
  // und die Pruefung unten verbaende sich mit dem ALTEN Fenster. Deshalb hart
  // aufraeumen wie beim Start, und der zweite Lauf bekommt einen EIGENEN Port.
  kind.kill();
  try { execSync("pkill -9 -f 'electron \\.' || true; pkill -9 -f 'xvfb-run' || true", { shell: "/bin/bash" }); } catch (e) { /* nichts lief */ }
  await new Promise((r) => setTimeout(r, 1500));
  const port2 = port + 1;
  const profil = [path.join(os.homedir(), ".config", "Werkstatt-Cockpit"), path.join(os.homedir(), ".config", "werkstatt-cockpit")]
    .find((p) => fs.existsSync(path.join(p, "app-aktuell.html")));
  pruef("Neustart-Szenario: Die uebernommene Fassung liegt im Profil", !!profil, profil || "—");
  if (profil) {
    fs.copyFileSync(path.join(wurzel, "tests", "hilfen", "alt-fassung.html"), path.join(profil, "app-aktuell.html"));
    const kind2 = spawn("xvfb-run", ["-a", elektronBin, ".", "--no-sandbox", `--remote-debugging-port=${port2}`], {
      cwd: path.join(wurzel, "programm"),
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let browser2 = null;
    for (let i = 0; i < 40 && !browser2; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try { browser2 = await chromium.connectOverCDP(`http://127.0.0.1:${port2}`); } catch (e) { /* noch nicht bereit */ }
    }
    let seite2 = null;
    if (browser2) {
      const ctx2 = browser2.contexts()[0];
      for (let i = 0; i < 40 && !seite2; i++) {
        seite2 = ctx2.pages().find((p) => /app-aktuell\.html|Werkstatt_Kalender_TPM\.html/i.test(p.url()));
        if (!seite2) await new Promise((r) => setTimeout(r, 500));
      }
    }
    pruef("Neustart mit alter Profil-Fassung: Das Programm kommt hoch", !!seite2);
    if (seite2) {
      pruef("Neue ZIP schlaegt alte Profil-Fassung: Es laeuft die EINGEBAUTE (juengere) App",
        /Werkstatt_Kalender_TPM\.html/i.test(seite2.url()) && !/app-aktuell\.html/i.test(seite2.url()),
        seite2.url());
    }
    if (browser2) await browser2.close();
    kind2.kill();
  }

  console.log(`\n==== ECHTES PROGRAMM: ${ok} PASS / ${fail} FAIL ====`);
  fs.rmSync(ordner, { recursive: true, force: true });
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
