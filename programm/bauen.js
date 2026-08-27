/* Baut das installierbare Programm für Windows (64 Bit).
 *
 * Ablauf:
 *   1. Die fertige App-HTML aus dem Hauptprojekt hierher kopieren
 *   2. @electron/packager packt Rahmen + App + Chromium zu einem Ordner
 *   3. Der Ordner wird zu einer ZIP - entpacken, Doppelklick, fertig.
 *      KEINE Installation, KEINE Adminrechte: Das Programm läuft aus dem
 *      entpackten Ordner heraus (portable), z. B. vom Desktop.
 *
 * Aufruf:  cd programm && npm install && npm run bauen
 *
 * Hinweis Signatur: Die EXE ist nicht signiert. Windows-SmartScreen zeigt
 * beim ersten Start "Weitere Informationen -> Trotzdem ausführen". Für den
 * Regelbetrieb gehört die Signatur zur IT-Übergabe (Roll-out-Liste).
 */
const { packager } = require("@electron/packager");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HIER = __dirname;
const QUELLE_HTML = path.join(HIER, "..", "Werkstatt_Kalender_TPM.html");
const ZIEL_HTML = path.join(HIER, "app", "Werkstatt_Kalender_TPM.html");
const AUSGABE = path.join(HIER, "ausgabe");

(async () => {
  // 1. App-HTML einpacken (immer die frisch gebaute aus dem Hauptprojekt)
  if (!fs.existsSync(QUELLE_HTML)) {
    console.error("Werkstatt_Kalender_TPM.html fehlt - erst `cd app && npm run build` laufen lassen.");
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(ZIEL_HTML), { recursive: true });
  fs.copyFileSync(QUELLE_HTML, ZIEL_HTML);
  console.log("App-HTML uebernommen:", (fs.statSync(ZIEL_HTML).size / 1024).toFixed(0), "kB");

  // 2. Packen fuer Windows x64
  const pfade = await packager({
    dir: HIER,
    out: AUSGABE,
    name: "Werkstatt-Cockpit",
    platform: "win32",
    arch: "x64",
    overwrite: true,
    asar: true,
    // main.js braucht zur Laufzeit nur Electron selbst - node_modules
    // komplett draussen lassen, sonst wandert das Bau-Werkzeug mit ins Paket.
    // verteilung/ enthaelt die GitHub-Teilstuecke der fertigen ZIP - die
    // duerfen nicht wieder IN die naechste ZIP wandern (sonst verdoppelt
    // sich das Paket mit jedem Bau).
    // standard-einstellungen*.json bleiben draussen: Die Vorgaben-Datei
    // gehoert NEBEN die EXE (je Einsatzort gepflegt), nicht fest ins Paket -
    // sonst truege jede ZIP die Pfade des Bau-Rechners in sich.
    ignore: [/^\/ausgabe($|\/)/, /^\/bauen\.js$/, /^\/node_modules($|\/)/, /^\/verteilung($|\/)/, /^\/standard-einstellungen[^/]*\.json$/],
    // Hinweis: Das Symbol IN der EXE-Datei (Explorer-Ansicht) braucht beim
    // Packen unter Linux Wine (rcedit) - hier nicht vorhanden. Das Fenster-
    // und Taskleisten-Symbol kommt aus main.js; fuer Verknuepfungen liegt
    // symbol/symbol.ico im Paket ("Anderes Symbol ..."). Die EXE selbst
    // bekommt ihr Symbol mit dem Signatur-Schritt der IT.
    appCopyright: "Werkstatt",
  });
  const ordner = pfade[0];
  console.log("Gepackt:", ordner);

  // Die .ico zusaetzlich NEBEN die EXE legen: Fuer "Verknuepfung ->
  // Anderes Symbol" muss sie im Explorer anwaehlbar sein - im app.asar
  // steckt sie unerreichbar.
  fs.copyFileSync(path.join(HIER, "symbol", "symbol.ico"), path.join(ordner, "symbol.ico"));

  // Vorlage der Vorbelegung mit ins Paket legen (neben die EXE): einmal in
  // standard-einstellungen.json umbenennen und Pfade eintragen - dann ist
  // ein neuer Rechner nur noch "entpacken, starten, fertig".
  fs.copyFileSync(path.join(HIER, "standard-einstellungen.beispiel.json"), path.join(ordner, "standard-einstellungen.beispiel.json"));

  // 3. ZIP daraus machen
  const zipPfad = path.join(AUSGABE, "Werkstatt-Cockpit-Programm-win64.zip");
  if (fs.existsSync(zipPfad)) fs.unlinkSync(zipPfad);
  execSync(`cd "${ordner}" && zip -qr "${zipPfad}" .`, { stdio: "inherit", shell: "/bin/bash" });
  const mb = (fs.statSync(zipPfad).size / 1024 / 1024).toFixed(1);
  console.log(`Fertig: ${zipPfad} (${mb} MB)`);
})().catch((e) => { console.error(e); process.exit(1); });
