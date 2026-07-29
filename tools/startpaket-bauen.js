// Baut arbeitsplatz/Werkstatt-Cockpit-Start.zip aus den Dateien in arbeitsplatz/.
//
//   node tools/startpaket-bauen.js          # neu bauen
//   node tools/startpaket-bauen.js --pruefen # nur melden, ob die ZIP veraltet ist
//
// Warum ueberhaupt ein Skript: Die ZIP war von Hand gepackt. Als sich
// cockpit-verknuepfung.ps1 aenderte, blieb die ZIP stehen - und die haetten die
// Kollegen bekommen. Eine Anleitung, die etwas verspricht, was das mitgelieferte
// Skript nicht tut, ist schlimmer als gar keine.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const WURZEL = path.resolve(__dirname, "..");
const QUELLE = path.join(WURZEL, "arbeitsplatz");
const ZIEL = path.join(QUELLE, "Werkstatt-Cockpit-Start.zip");

// name in der ZIP  <-  Datei in arbeitsplatz/
const INHALT = {
  "Cockpit starten.cmd": "Cockpit starten.cmd",
  "Selbsttest.cmd": "Selbsttest.cmd",
  "Sicherung zurueckholen.cmd": "Sicherung zurueckholen.cmd",
  "Verknuepfung anlegen.cmd": "Verknuepfung anlegen.cmd",
  "cockpit-server.ps1": "cockpit-server.ps1",
  "cockpit-selbsttest.ps1": "cockpit-selbsttest.ps1",
  "cockpit-sicherung.ps1": "cockpit-sicherung.ps1",
  "cockpit-verknuepfung.ps1": "cockpit-verknuepfung.ps1",
  "LIESMICH.txt": "LIESMICH.txt",
  // Im Paket heisst sie schlicht "Anleitung" - dort ist der Zusammenhang klar.
  "Anleitung.md": "Anleitung-Arbeitsplatz.md",
};

function lies(nameInZip) {
  return fs.readFileSync(path.join(QUELLE, INHALT[nameInZip]));
}

function inhaltDerZip() {
  if (!fs.existsSync(ZIEL)) return null;
  const roh = execFileSync("python3", ["-c", `
import zipfile, json, base64, sys
z = zipfile.ZipFile(${JSON.stringify(ZIEL)})
aus = {}
for n in z.namelist():
    if n.endswith("/"): continue
    aus[n] = base64.b64encode(z.read(n)).decode()
sys.stdout.write(json.dumps(aus))
`]).toString();
  return JSON.parse(roh);
}

function vergleiche() {
  const da = inhaltDerZip();
  if (!da) return ["Die ZIP fehlt ganz"];
  const abweichungen = [];
  const erwartet = new Set(Object.keys(INHALT).map((n) => "Cockpit/" + n));
  for (const n of Object.keys(da)) {
    if (!erwartet.has(n)) abweichungen.push(`zuviel in der ZIP: ${n}`);
  }
  for (const n of Object.keys(INHALT)) {
    const inZip = da["Cockpit/" + n];
    if (inZip === undefined) { abweichungen.push(`fehlt in der ZIP: ${n}`); continue; }
    if (Buffer.from(inZip, "base64").compare(lies(n)) !== 0) {
      abweichungen.push(`veraltet in der ZIP: ${n}`);
    }
  }
  return abweichungen;
}

const nurPruefen = process.argv.includes("--pruefen");
const abweichungen = vergleiche();

if (nurPruefen) {
  if (abweichungen.length === 0) { console.log("Startpaket ist aktuell."); process.exit(0); }
  console.error("Startpaket ist NICHT aktuell:");
  for (const a of abweichungen) console.error("  - " + a);
  console.error("\nNeu bauen: node tools/startpaket-bauen.js");
  process.exit(1);
}

if (abweichungen.length === 0) {
  console.log("Startpaket war schon aktuell - nichts zu tun.");
  process.exit(0);
}

const bau = path.join(WURZEL, "scratchpad", "startpaket");
fs.rmSync(bau, { recursive: true, force: true });
fs.mkdirSync(path.join(bau, "Cockpit"), { recursive: true });
for (const n of Object.keys(INHALT)) {
  fs.writeFileSync(path.join(bau, "Cockpit", n), lies(n));
}
fs.rmSync(ZIEL, { force: true });
execFileSync("python3", ["-c", `
import zipfile, os, sys
basis = ${JSON.stringify(bau)}
z = zipfile.ZipFile(${JSON.stringify(ZIEL)}, "w", zipfile.ZIP_DEFLATED)
z.writestr(zipfile.ZipInfo("Cockpit/"), "")
for n in sorted(os.listdir(os.path.join(basis, "Cockpit"))):
    z.write(os.path.join(basis, "Cockpit", n), "Cockpit/" + n)
z.close()
`]);
fs.rmSync(bau, { recursive: true, force: true });

const rest = vergleiche();
if (rest.length > 0) {
  console.error("Nach dem Bauen stimmt es immer noch nicht:", rest);
  process.exit(1);
}
console.log("Startpaket neu gebaut:", ZIEL,
  Math.round(fs.statSync(ZIEL).size / 1024) + " KB,",
  Object.keys(INHALT).length + " Dateien");
for (const a of abweichungen) console.log("  geaendert: " + a);
