/* Baut den USB-Installations-Stick aus den Repo-Quellen - reproduzierbar statt
 * einmal von Hand (ROLLOUT "Bei Bedarf tools/stick-bauen.js", 17.09.).
 *
 * Quelle:  programm/verteilung/usb-stick/   (Zettel, Werkzeug, Einstellungen,
 *          Anleitung, Download-Links)
 * Ausgabe: programm/ausgabe/BTA-Cockpit-USB-Stick/           (der Stick-Ordner)
 *          programm/ausgabe/BTA-Cockpit-USB-Stick-ohne-Programm.zip  (Chat-tauglich)
 *          programm/ausgabe/BTA-Cockpit-Komplettpaket.zip     (mit Programm, ~110 MB;
 *          nur mit --mit-programm: setzt die Teil-Dateien aus verteilung/
 *          zusammen, prueft Byte-Gleichheit gegen ausgabe/*.zip, falls vorhanden,
 *          und nimmt den Zettel HIER-FEHLT-NOCH-DAS-PROGRAMM.txt heraus)
 *
 * Aufruf:  node tools/stick-bauen.js [--mit-programm] [--pruefen]
 *   --pruefen: baut nichts, prueft nur, ob die Quellen zusammenpassen
 *              (Teil-Groessen im Download-Zettel, Dateiname der Hauptdatei,
 *              Stand-Zeilen).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const WURZEL = path.resolve(__dirname, "..");
const QUELLE = path.join(WURZEL, "programm", "verteilung", "usb-stick");
const VERTEILUNG = path.join(WURZEL, "programm", "verteilung");
const AUSGABE = path.join(WURZEL, "programm", "ausgabe");
const STICK = path.join(AUSGABE, "BTA-Cockpit-USB-Stick");
const ZIP_NAME = "Werkstatt-Cockpit-Programm-win64.zip";
const mitProgramm = process.argv.includes("--mit-programm");
const nurPruefen = process.argv.includes("--pruefen");

const lese = (p) => fs.readFileSync(p, "utf8");
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
let fehler = 0;
const pruef = (n, ok, zusatz) => { console.log((ok ? "OK   " : "FEHLT") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); if (!ok) fehler++; };

/* ---- Prüfen: passen die Quellen zusammen? ---- */
const teile = [path.join(VERTEILUNG, "WC-Programm-1.teil"), path.join(VERTEILUNG, "WC-Programm-2.teil")];
const links = lese(path.join(QUELLE, "04-Download-Links", "DOWNLOAD-LINKS.txt"));
for (const [i, t] of teile.entries()) {
  const groesse = fs.existsSync(t) ? fs.statSync(t).size : -1;
  const imZettel = (links.match(new RegExp(`Teil ${i + 1} \\([^)]*?([\\d.]+) Bytes\\)`)) || [])[1];
  pruef(`Teil ${i + 1}: Größe im Download-Zettel stimmt mit der Datei überein`, imZettel && Number(imZettel.replace(/\./g, "")) === groesse, `${imZettel} ↔ ${groesse}`);
}
const einst = JSON.parse(lese(path.join(QUELLE, "02-Einstellungen", "standard-einstellungen.json")));
pruef("Einstellungen: Hauptdatei heißt werkstatt-kalender-daten.json (Roberto, 29.09.)", /\/werkstatt-kalender-daten\.json$/.test(einst["werkstatt-kalender-fs:handle"]), einst["werkstatt-kalender-fs:handle"]);
pruef("Einstellungen: Störungs-Datei heißt werkstatt-stoerungen.json", /\/werkstatt-stoerungen\.json$/.test(einst["werkstatt-stoerungen-fs:handle"]));
const ps1 = lese(path.join(QUELLE, "werkzeug", "cockpit-werkzeug.ps1"));
pruef("Werkzeug: derselbe Dateiname wie in den Einstellungen", /\$DatenDateiName = "werkstatt-kalender-daten\.json"/.test(ps1));
pruef("Werkzeug: Ersatzweg über die Teil-Dateien vorhanden", /\$TeilUrls = @\(/.test(ps1) && /WC-Programm-1\.teil/.test(ps1) && /WC-Programm-2\.teil/.test(ps1));
pruef("Werkzeug: Klammern ausgeglichen", (ps1.match(/\{/g) || []).length === (ps1.match(/\}/g) || []).length, `${(ps1.match(/\{/g) || []).length} { / ${(ps1.match(/\}/g) || []).length} }`);
const liesmich = lese(path.join(QUELLE, "LIESMICH-ZUERST.txt"));
pruef("LIESMICH-ZUERST nennt den Stand 29.09.2026", /Stand: 29\.09\.2026/.test(liesmich));
pruef("Aufsetz-Anleitung (PDF) liegt in 03-Anleitung", fs.existsSync(path.join(QUELLE, "03-Anleitung", "Werkstatt-Cockpit-Programm-Aufsetzen.pdf")));
pruef("Starter BTA-Cockpit-Werkzeug.cmd zeigt auf werkzeug\\cockpit-werkzeug.ps1", /werkzeug\\cockpit-werkzeug\.ps1/.test(lese(path.join(QUELLE, "BTA-Cockpit-Werkzeug.cmd"))));
if (nurPruefen || fehler) {
  console.log(fehler ? `\n${fehler} Prüfung(en) rot - Stick nicht gebaut.` : "\nQuellen passen zusammen.");
  process.exit(fehler ? 1 : 0);
}

/* ---- Bauen ---- */
fs.rmSync(STICK, { recursive: true, force: true });
fs.mkdirSync(STICK, { recursive: true });
fs.cpSync(QUELLE, STICK, { recursive: true });
const zipOhne = path.join(AUSGABE, "BTA-Cockpit-USB-Stick-ohne-Programm.zip");
if (fs.existsSync(zipOhne)) fs.unlinkSync(zipOhne);
execSync(`cd "${AUSGABE}" && zip -qr "${zipOhne}" "BTA-Cockpit-USB-Stick"`, { shell: "/bin/bash" });
console.log(`\nStick-Ordner: ${path.relative(WURZEL, STICK)}`);
console.log(`ZIP ohne Programm: ${path.relative(WURZEL, zipOhne)} (${(fs.statSync(zipOhne).size / 1024).toFixed(0)} kB)`);

if (mitProgramm) {
  const zielZip = path.join(STICK, "01-Programm", ZIP_NAME);
  const out = fs.openSync(zielZip, "w");
  for (const t of teile) fs.writeSync(out, fs.readFileSync(t));
  fs.closeSync(out);
  const vergleich = path.join(AUSGABE, ZIP_NAME);
  if (fs.existsSync(vergleich)) pruef("Zusammengesetzte ZIP ist byte-gleich mit ausgabe/" + ZIP_NAME, sha(vergleich) === sha(zielZip));
  fs.rmSync(path.join(STICK, "01-Programm", "HIER-FEHLT-NOCH-DAS-PROGRAMM.txt"), { force: true });
  const komplett = path.join(AUSGABE, "BTA-Cockpit-Komplettpaket.zip");
  if (fs.existsSync(komplett)) fs.unlinkSync(komplett);
  execSync(`cd "${AUSGABE}" && zip -qr "${komplett}" "BTA-Cockpit-USB-Stick"`, { shell: "/bin/bash" });
  console.log(`Komplettpaket: ${path.relative(WURZEL, komplett)} (${(fs.statSync(komplett).size / 1024 / 1024).toFixed(1)} MB) - Stick-Ordner enthält jetzt das Programm-ZIP`);
}
process.exit(fehler ? 1 : 0);
