/* Prüfstand auf dem Server: kopiert alles, was die Härtetest-Suite braucht, vom
 * Laptop nach \\v-btacockpit-1\BTA\BTA-Tests\WerkstattKalender (Roll-out 82, 02.11.).
 *
 * Warum: Der Laptop schläft nachts, der Server läuft rund um die Uhr. Dort lässt
 * eine Aufgabe (03:00, Konto SYSTEM - legt das Werkzeug an: "Nachtlauf der Tests
 * einrichten") die Suite mit dem Node aus dem Dienst-Ordner laufen. Das Ergebnis
 * steht in BTA-Tests\WerkstattKalender\tests\protokolle\LETZTER-LAUF.txt und ist
 * vom Laptop über die Freigabe lesbar.
 *
 * Was kopiert wird (nur, was sich geändert hat - SHA-256 je Datei):
 *   - alle im Git verfolgten Dateien (git ls-files), ohne die Programm-Teile
 *     programm/verteilung/*.teil (115 MB, für Tests unnötig)
 *   - tests/node_modules (playwright-core, 12 MB)
 *   - tests/browser: nur chromium_headless_shell-*, winldd-*, ffmpeg-* (~270 MB;
 *     der volle Chromium-Ordner wird von der Suite nicht gebraucht)
 *   - dazu PRUEFSTAND.txt mit Zeit und Commit
 * Was NIE angefasst wird: tests/protokolle auf dem Server (die Ergebnisse).
 *
 * Aufruf:  node tools/pruefstand-sync.js [--nur-pruefen]
 * Ziel überschreibbar mit BTA_PRUEFSTAND (Umgebungsvariable).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const WURZEL = path.resolve(__dirname, "..");
const ZIEL = process.env.BTA_PRUEFSTAND || "\\\\v-btacockpit-1\\BTA\\BTA-Tests\\WerkstattKalender";
const GIT = process.env.BTA_GIT || (fs.existsSync("C:\\Users\\rciraci\\BTA-Werkzeuge\\git\\cmd\\git.exe") ? "C:\\Users\\rciraci\\BTA-Werkzeuge\\git\\cmd\\git.exe" : "git");
const nurPruefen = process.argv.includes("--nur-pruefen");
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function dateienUnter(ordner, filter) {
  const aus = [];
  if (!fs.existsSync(ordner)) return aus;
  (function geh(o) { for (const e of fs.readdirSync(o, { withFileTypes: true })) { const p = path.join(o, e.name); if (e.isDirectory()) geh(p); else aus.push(path.relative(WURZEL, p)); } })(ordner);
  return filter ? aus.filter(filter) : aus;
}

let erreichbar = false;
try { erreichbar = fs.existsSync(path.dirname(ZIEL)); } catch (e) { erreichbar = false; }
if (!erreichbar) { console.log("Prüfstand nicht erreichbar: " + ZIEL + " - übersprungen."); process.exit(0); }

const verfolgt = spawnSync(GIT, ["ls-files"], { cwd: WURZEL, encoding: "utf8" }).stdout.split(/\r?\n/).filter(Boolean).map((p) => p.replace(/\//g, path.sep)).filter((p) => !/\.teil$/.test(p));
const module_ = dateienUnter(path.join(WURZEL, "tests", "node_modules"));
const browser = dateienUnter(path.join(WURZEL, "tests", "browser"), (p) => /tests[\\/]browser[\\/](chromium_headless_shell-|winldd-|ffmpeg-)/.test(p));
const alle = [...verfolgt, ...module_, ...browser];
const commit = (spawnSync(GIT, ["rev-parse", "--short", "HEAD"], { cwd: WURZEL, encoding: "utf8" }).stdout || "").trim();
console.log(`Prüfstand: ${ZIEL}${nurPruefen ? "  [NUR PRÜFEN]" : ""}\n${verfolgt.length} verfolgte Dateien + ${module_.length} Bibliothek + ${browser.length} Browser-Dateien, Stand ${commit}\n`);

const t0 = Date.now();
let kopiert = 0, gleich = 0, fehler = 0, bytes = 0;
for (const rel of alle) {
  const q = path.join(WURZEL, rel), z = path.join(ZIEL, rel);
  if (!fs.existsSync(q)) continue;
  const h = sha(q);
  if (fs.existsSync(z) && fs.statSync(z).size === fs.statSync(q).size && sha(z) === h) { gleich++; continue; }
  if (nurPruefen) { kopiert++; continue; }
  fs.mkdirSync(path.dirname(z), { recursive: true });
  fs.copyFileSync(q, z);
  bytes += fs.statSync(q).size;
  if (sha(z) !== h) { fehler++; console.log("  UNGLEICH nach dem Kopieren: " + rel); } else kopiert++;
  if (kopiert % 100 === 0) process.stdout.write(`  … ${kopiert} kopiert\r`);
}
if (!nurPruefen) {
  fs.mkdirSync(ZIEL, { recursive: true });
  fs.writeFileSync(path.join(ZIEL, "PRUEFSTAND.txt"), `Prüfstand des BTA-Cockpits - kopiert vom Laptop am ${new Date().toLocaleString("de-DE")}\nStand (Commit): ${commit}\nSuite starten: <Dienst>\\node\\node.exe tests\\run-hardness-tests.js  (Arbeitsordner = dieser Ordner)\nErgebnis: tests\\protokolle\\LETZTER-LAUF.txt\nNICHT von Hand ändern - node tools/pruefstand-sync.js schreibt alles neu.\n`);
}
const sek = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`${fehler ? "ROT" : "OK "}  ${kopiert} kopiert (${(bytes / 1024 / 1024).toFixed(0)} MB), ${gleich} schon gleich, ${fehler} ungleich, ${sek} s`);
process.exit(fehler ? 1 : 0);
