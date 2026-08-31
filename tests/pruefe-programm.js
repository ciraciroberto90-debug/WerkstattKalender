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

  /* ---- Namensregel der Zwischendatei (Robertos Laufwerk, 10.08.) ----
     Gemessen: Das Anlegen von ".daten.json.schreibe-44312" wies das
     Firmenlaufwerk mit EPERM ab (Dateityp-Filter kennt die Endung nicht),
     eine .txt im selben Ordner ging. Die Zwischendatei muss deshalb die
     ENDUNG DES ZIELS tragen und darf nicht versteckt beginnen. */
  const { zwischenName } = require(path.join(wurzel, "programm", "zwischenname.js"));
  const zn = zwischenName("/laufwerk/ordner/daten - Kopie.json", 4431);
  pruef("Zwischendatei endet auf die Endung des Ziels (.json)", zn.endsWith(".json"), zn);
  pruef("Zwischendatei ist eindeutig und liegt im selben Ordner",
    zn === "/laufwerk/ordner/daten - Kopie.schreibe-4431.json", zn);
  pruef("Zwischendatei beginnt nicht mit einem Punkt (keine versteckte Datei)",
    !path.basename(zn).startsWith("."));

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

  /* ---- Vorbelegung fuer neue Rechner (26.08.) vorbereiten ----
     Frisches Profil oben = "neuer Rechner". Die Vorgaben-Datei liegt im
     Pruefstand neben main.js (der __dirname-Kandidat des Rahmens); beim
     portablen Paket liegt sie neben der EXE. Der Update-Ordner entsteht
     hier schon, damit er in den Vorgaben stehen kann - befuellt wird er
     erst in der Update-Pruefung weiter unten. */
  const updateOrdner = fs.mkdtempSync(path.join(os.tmpdir(), "wk-update-"));
  const vorgabenPfad = path.join(wurzel, "programm", "standard-einstellungen.json");
  fs.writeFileSync(vorgabenPfad, JSON.stringify({
    "_hinweis": "Pruefstand-Vorgaben - der Test loescht diese Datei wieder",
    "programm:update-ordner": updateOrdner,
    "werkstatt-kalender-fs:handle": dateiPfad,
    "werkstatt-kalender-fs:folder": ordner,
  }, null, 2));

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

  /* ---- Vorbelegung: entpacken -> starten -> verbunden ---- */
  const vbStatus = await page.evaluate(() => window.__werkstattDesktop.updateStatus());
  pruef("Vorbelegung: Der Update-Ordner sitzt ohne Zahnrad (aus standard-einstellungen.json)",
    vbStatus.ordner === updateOrdner, vbStatus.ordner);
  let vbVerbunden = false;
  try {
    await page.waitForFunction(() => window.__wkSharedTest.canWrite(), { timeout: 15000 });
    vbVerbunden = true;
  } catch (e) { /* unten als FAIL gemeldet */ }
  pruef("Vorbelegung: Die Datendatei ist beim ERSTEN Start von selbst verbunden",
    vbVerbunden && (await page.evaluate(() => window.__wkSharedTest.fileInfo().pfad)) === dateiPfad);
  pruef("Vorbelegung: Der Datenordner (Fotos/Waechter) sitzt von selbst",
    await page.evaluate(() => window.__wkSharedTest.fotosVerfuegbar()));
  const profilEinstellungen = JSON.parse(fs.readFileSync(
    path.join(os.homedir(), ".config", "Werkstatt-Cockpit", "einstellungen.json"), "utf8"));
  pruef("Vorbelegung: Hinweis-Zeilen (_...) werden NICHT uebernommen",
    !Object.keys(profilEinstellungen).some((k) => k.startsWith("_")),
    Object.keys(profilEinstellungen).join(", "));
  // Die Vorgaben-Datei hat ihren Dienst getan - weg damit, ehe sie in einen
  // spaeteren Lauf oder gar einen Bau hineinreicht.
  fs.unlinkSync(vorgabenPfad);

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

  /* ---- Fotos ueber die ECHTE Bruecke (26.08.) ----
     Robertos Frage aus dem Programm: "wie sieht es mit den fotos aus?"
     Gemessen wird der ganze Weg: mkdir + Bytes durch das echte IPC in den
     Unterordner Fotos/ des Datenordners - mit atomarem Schreiben. */
  await page.evaluate((ordnerPfad) => {
    window.__wkSharedTest.adoptFolder(window.__wkDesktopTest.ordnerHandle(ordnerPfad), "ok");
  }, ordner);
  pruef("Fotos: Der Ordner-Verweis der Bruecke kann Unterordner (fotosVerfuegbar)",
    await page.evaluate(() => window.__wkSharedTest.fotosVerfuegbar()));
  await page.evaluate(async () => {
    // Kleines Bild mit JPEG-Kennung - fotoSpeichern schreibt die Bytes 1:1.
    const bytes = new Uint8Array(4096);
    bytes[0] = 0xFF; bytes[1] = 0xD8; bytes[2] = 0xFF; bytes[3] = 0xE0;
    for (let i = 4; i < bytes.length; i++) bytes[i] = (i * 31) % 251;
    await window.__wkSharedTest.fotoSpeichern("pruef-foto.jpg", new Blob([bytes], { type: "image/jpeg" }));
  });
  const fotoPfad = path.join(ordner, "Fotos", "pruef-foto.jpg");
  const fotoDa = fs.existsSync(fotoPfad);
  pruef("Fotos: Die Bilddatei liegt WIRKLICH auf der Platte in Fotos/", fotoDa, fotoPfad);
  if (fotoDa) {
    const kopf = fs.readFileSync(fotoPfad);
    pruef("Fotos: Bytes unversehrt (JPEG-Kennung, volle Groesse)",
      kopf.length === 4096 && kopf[0] === 0xFF && kopf[1] === 0xD8, `${kopf.length} Bytes`);
  }
  pruef("Fotos: Auch hier keine Zwischendatei liegengeblieben",
    fotoDa && !fs.readdirSync(path.join(ordner, "Fotos")).some((n) => n.includes(".schreibe-")));
  pruef("Fotos: Zurueckgelesen kommt dieselbe Datei",
    await page.evaluate(async () => {
      const f = await window.__wkSharedTest.fotoLesen("pruef-foto.jpg");
      return !!f && f.size === 4096;
    }));
  // BEWUSST NICHT loeschen und den Ordner-Verweis NICHT abhaengen: Die
  // Update-Pruefung unten laedt die Seite neu - danach wird gemessen, ob
  // das Foto den NEUSTART uebersteht (Robertos Fund vom 31.08.: angepinnte
  // Fotos waren nur bis zum Neustart sichtbar). Der Ordner kommt beim
  // Neustart aus dem gemerkten Verweis (hier: die Vorbelegung oben).

  /* ---- Programm-Update am echten Rahmen ---- */
  // Update-Ordner mit einer NEUEREN App-HTML (Marker eingebaut, damit die
  // Uebernahme nachweisbar ist), daneben eine halbe Datei als Falle.
  // updateOrdner existiert seit der Vorbelegungs-Vorbereitung oben - jetzt
  // bekommt er die neuere App-HTML.
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

  /* ---- Fotos ueberleben den NEUSTART (Robertos Fund vom 31.08.) ----
     Die Seite wurde durch die Update-Uebernahme neu geladen - das ist der
     "App neu oeffnen"-Fall. Der Ordner-Verweis kommt jetzt aus dem
     gemerkten Profil (Vorbelegung), nicht mehr aus adoptFolder. */
  pruef("Fotos nach Neustart: Der Datenordner ist von selbst wieder da (fotosVerfuegbar)",
    await page.evaluate(() => window.__wkSharedTest.fotosVerfuegbar()));
  pruef("Fotos nach Neustart: Die Bilddatei ist WEITER lesbar (kein Verschwinden)",
    await page.evaluate(async () => {
      const f = await window.__wkSharedTest.fotoLesen("pruef-foto.jpg");
      return !!f && f.size === 4096;
    }));
  pruef("Fotos: Loeschen raeumt die Datei von der Platte",
    (await page.evaluate(() => window.__wkSharedTest.fotoLoeschen("pruef-foto.jpg"))) === true &&
    !fs.existsSync(fotoPfad));

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
