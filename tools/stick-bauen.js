/* Baut den USB-Installations-Stick aus den Repo-Quellen - reproduzierbar statt
 * einmal von Hand (ROLLOUT "Bei Bedarf tools/stick-bauen.js", 17.09.).
 *
 * Quelle:  programm/verteilung/usb-stick/   (DAS Werkzeug, Einstellungen,
 *          Anleitung, Download-Links, 05-Server)
 * Ausgabe: programm/ausgabe/BTA-Cockpit-USB-Stick/           (der Stick-Ordner)
 *          programm/ausgabe/BTA-Cockpit-USB-Stick-ohne-Programm.zip  (Chat-tauglich)
 *          programm/ausgabe/BTA-Cockpit-Komplettpaket.zip     (mit Programm, ~110 MB;
 *          nur mit --mit-programm: setzt die Teil-Dateien aus verteilung/
 *          zusammen, prueft Byte-Gleichheit gegen ausgabe/*.zip, falls vorhanden,
 *          und nimmt den Zettel HIER-FEHLT-NOCH-DAS-PROGRAMM.txt heraus)
 *
 * Aufruf:  node tools/stick-bauen.js [--mit-programm] [--mit-server] [--mit-node] [--pruefen]
 *   --pruefen: baut nichts, prueft nur, ob die Quellen zusammenpassen.
 *   --mit-server: legt den Dienst (server/dienst.js, db.js,
 *              einstellungen.beispiel.json) nach 05-Server/dienst/ auf den Stick.
 *   --mit-node: laedt Node portabel (NODE_FASSUNG, win-x64, ~35 MB ZIP) von
 *              nodejs.org und legt node.exe nach 05-Server/node/.
 *
 * Seit 30.10. (Roll-out 75/79) laeuft der Bauer auch unter Windows ohne Bash:
 * Zip ueber tar.exe (Windows 10+) bzw. zip (Linux), PowerShell-Parser-Pruefung
 * ueber powershell.exe/pwsh ohne Umweg ueber bash, Node-ZIP ueber curl ohne Shell.
 * Geprueft wird DAS eine Werkzeug (werkzeug/bta-kern.ps1, bta-fenster.ps1,
 * bta-werkzeug.ps1, BTA-Werkzeug.cmd) - die zwei alten Werkzeuge gibt es nicht mehr.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const WURZEL = path.resolve(__dirname, "..");
const QUELLE = path.join(WURZEL, "programm", "verteilung", "usb-stick");
const VERTEILUNG = path.join(WURZEL, "programm", "verteilung");
const AUSGABE = path.join(WURZEL, "programm", "ausgabe");
const STICK = path.join(AUSGABE, "BTA-Cockpit-USB-Stick");
const ZIP_NAME = "Werkstatt-Cockpit-Programm-win64.zip";
const SERVER = path.join(WURZEL, "server");
const DIENST_DATEIEN = ["dienst.js", "db.js", "einstellungen.beispiel.json"];
const NODE_FASSUNG = "v22.23.3";
const NODE_URL = `https://nodejs.org/dist/${NODE_FASSUNG}/node-${NODE_FASSUNG}-win-x64.zip`;
const WIN = process.platform === "win32";
const mitProgramm = process.argv.includes("--mit-programm");
const mitServer = process.argv.includes("--mit-server");
const mitNode = process.argv.includes("--mit-node");
const nurPruefen = process.argv.includes("--pruefen");

const lese = (p) => fs.readFileSync(p, "utf8");
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
let fehler = 0;
const pruef = (n, ok, zusatz) => { console.log((ok ? "OK   " : "FEHLT") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); if (!ok) fehler++; };
const lauf = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", ...opts });
const da = (cmd) => { try { return lauf(WIN ? "where.exe" : "which", [cmd]).status === 0; } catch (e) { return false; } };

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
const weg = lese(path.join(QUELLE, "02-Einstellungen", "verbindungsweg.txt")).trim().toLowerCase();
pruef("verbindungsweg.txt enthält genau 'datei' oder 'server'", weg === "datei" || weg === "server", weg);

/* ---- DAS Werkzeug (Roll-out 79) ---- */
const WZ = path.join(QUELLE, "werkzeug");
const skripte = ["bta-kern.ps1", "bta-fenster.ps1", "bta-werkzeug.ps1"];
for (const s of skripte) pruef(`werkzeug/${s} vorhanden`, fs.existsSync(path.join(WZ, s)));
const kern = lese(path.join(WZ, "bta-kern.ps1"));
pruef("Kern: derselbe Dateiname wie in den Einstellungen", /\$DatenDateiName = "werkstatt-kalender-daten\.json"/.test(kern));
pruef("Kern: Ersatzweg über die Teil-Dateien vorhanden", /\$TeilUrls = @\(/.test(kern) && /WC-Programm-1\.teil/.test(kern) && /WC-Programm-2\.teil/.test(kern));
pruef(`Kern: dieselbe Node-Fassung wie der Stick-Bauer (${NODE_FASSUNG})`, new RegExp(`\\$NodeFassung = "${NODE_FASSUNG.replace(/\./g, "\\.")}"`).test(kern));
pruef("Kern: erwartet 05-Server\\dienst und 05-Server\\node\\node.exe", /05-Server\\dienst/.test(kern) && /05-Server\\node\\node\.exe/.test(kern));
const zaehle = (s, re) => (s.match(re) || []).length;
const alsBefehl = (s) => (s.match(/(?<!\$)\(\s*(if|foreach|for|while|switch|try|do)\s*[\(\{]/g) || []);
for (const s of skripte) {
  const text = lese(path.join(WZ, s));
  pruef(`${s}: Klammern ausgeglichen`, zaehle(text, /\{/g) === zaehle(text, /\}/g) && zaehle(text, /\(/g) === zaehle(text, /\)/g), `${zaehle(text, /\{/g)} { / ${zaehle(text, /\}/g)} } · ${zaehle(text, /\(/g)} ( / ${zaehle(text, /\)/g)} )`);
  pruef(`${s}: nur ASCII (PowerShell 5.1 liest Umlaute je nach Kodierung falsch)`, ![...text].some((c) => c.charCodeAt(0) > 127));
  const t = alsBefehl(text);
  pruef(`${s}: kein Schlüsselwort in runden Klammern ((if …) statt $(if …))`, t.length === 0, t.length ? t.join(" · ") : "");
}
/* Echter Parser: powershell.exe (Windows) oder pwsh (sonst). Fehlt beides: ungemessen, nicht grün. */
const pwsh = WIN ? "powershell.exe" : (da("pwsh") ? "pwsh" : (fs.existsSync(path.join(AUSGABE, "pwsh", "pwsh")) ? path.join(AUSGABE, "pwsh", "pwsh") : null));
if (pwsh) {
  const skript = skripte.map((d) => `$t=$null;$e=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile("${path.join(WZ, d).replace(/\\/g, "\\\\")}",[ref]$t,[ref]$e);$k=@("if","else","elseif","foreach","for","while","switch","try","catch","return","do","until");$s=@($ast.FindAll({$args[0] -is [System.Management.Automation.Language.CommandAst]},$true)|Where-Object{$_.GetCommandName() -in $k});$p=@($ast.FindAll({$args[0] -is [System.Management.Automation.Language.BinaryExpressionAst] -and $args[0].Operator -eq "Plus" -and $args[0].Right -is [System.Management.Automation.Language.ArrayLiteralAst]},$true));"${d}|$($e.Count)|$($s.Count)|$($p.Count)|" + ((($e|ForEach-Object{"Z"+$_.Extent.StartLineNumber+" "+$_.Message})+($s|ForEach-Object{"Z"+$_.Extent.StartLineNumber+" "+$_.Extent.Text})) -join " · ")`).join(";");
  const r = lauf(pwsh, ["-NoProfile", "-Command", skript]);
  for (const zeile of (r.stdout || "").trim().split(/\r?\n/)) {
    const [datei, f, schl, plus, detail] = zeile.split("|");
    if (!datei) continue;
    pruef(`${datei}: PowerShell-Parser ohne Fehler, kein Schlüsselwort als Befehl, kein Plus vor Komma`, f === "0" && schl === "0" && plus === "0", `${f} Fehler, ${schl} Schlüsselwörter, ${plus} Plus${detail ? " – " + detail : ""}`);
  }
} else {
  console.log("UNGEMESSEN | PowerShell-Parser: kein powershell/pwsh vorhanden - nur die Muster-Prüfung oben");
}
pruef("Starter BTA-Werkzeug.cmd zeigt auf werkzeug\\bta-werkzeug.ps1", /werkzeug\\bta-werkzeug\.ps1/.test(lese(path.join(QUELLE, "BTA-Werkzeug.cmd"))));
for (const alt of ["BTA-Cockpit-Werkzeug.cmd", "BTA-Server-Werkzeug.cmd", "werkzeug/cockpit-werkzeug.ps1", "werkzeug/server-werkzeug.ps1"]) pruef(`Altes Werkzeug ist weg: ${alt}`, !fs.existsSync(path.join(QUELLE, alt)));
const liesmich = lese(path.join(QUELLE, "LIESMICH-ZUERST.txt"));
pruef("LIESMICH-ZUERST nennt BTA-Werkzeug.cmd", /BTA-Werkzeug\.cmd/.test(liesmich));
pruef("Aufsetz-Anleitung (PDF) liegt in 03-Anleitung", fs.existsSync(path.join(QUELLE, "03-Anleitung", "Werkstatt-Cockpit-Programm-Aufsetzen.pdf")));
for (const d of DIENST_DATEIEN) pruef(`Dienst-Quelle server/${d} vorhanden`, fs.existsSync(path.join(SERVER, d)));
const dienstFassung = (lese(path.join(SERVER, "dienst.js")).match(/const FASSUNG = "(\d+\.\d+\.\d+)"/) || [])[1];
pruef("Dienst-Fassung steht in dienst.js (FASSUNG)", !!dienstFassung, dienstFassung);
pruef(`Kern verlangt dieselbe Dienst-Fassung ($DienstFassungStick = ${dienstFassung})`, new RegExp(`\\$DienstFassungStick = "${(dienstFassung || "").replace(/\./g, "\\.")}"`).test(kern));
pruef("05-Server/LIESMICH-SERVER.txt vorhanden", fs.existsSync(path.join(QUELLE, "05-Server", "LIESMICH-SERVER.txt")));
if (nurPruefen || fehler) {
  console.log(fehler ? `\n${fehler} Prüfung(en) rot - Stick nicht gebaut.` : "\nQuellen passen zusammen.");
  process.exit(fehler ? 1 : 0);
}

/* ---- Bauen ---- */
fs.rmSync(STICK, { recursive: true, force: true });
fs.mkdirSync(STICK, { recursive: true });
fs.cpSync(QUELLE, STICK, { recursive: true, filter: (q) => !/bta-werkzeug-(fehler|selbsttest)\.txt$/.test(q) });

if (mitServer) {
  const ziel = path.join(STICK, "05-Server", "dienst");
  fs.mkdirSync(ziel, { recursive: true });
  for (const d of DIENST_DATEIEN) {
    fs.copyFileSync(path.join(SERVER, d), path.join(ziel, d));
    pruef(`05-Server/dienst/${d} byte-gleich mit server/${d}`, sha(path.join(SERVER, d)) === sha(path.join(ziel, d)));
  }
}
if (mitNode) {
  const nodeZip = path.join(AUSGABE, `node-${NODE_FASSUNG}-win-x64.zip`);
  if (!fs.existsSync(nodeZip)) {
    console.log(`Lade ${NODE_URL} ...`);
    const r = lauf("curl", ["-fsSL", "--ssl-revoke-best-effort", "-o", nodeZip + ".teil", NODE_URL], { stdio: "inherit" });
    if (r.status === 0) fs.renameSync(nodeZip + ".teil", nodeZip); else fs.rmSync(nodeZip + ".teil", { force: true });
  }
  const summen = lauf("curl", ["-fsSL", "--ssl-revoke-best-effort", `https://nodejs.org/dist/${NODE_FASSUNG}/SHASUMS256.txt`]).stdout || "";
  const erwartet = (summen.match(new RegExp(`^([0-9a-f]{64})\\s+node-${NODE_FASSUNG.replace(/\./g, "\\.")}-win-x64\\.zip$`, "m")) || [])[1];
  pruef(`Node-ZIP: SHA-256 stimmt mit SHASUMS256.txt von nodejs.org`, erwartet && fs.existsSync(nodeZip) && sha(nodeZip) === erwartet, erwartet && fs.existsSync(nodeZip) ? sha(nodeZip).slice(0, 12) + "…" : "keine Zeile oder keine Datei");
  if (erwartet && fs.existsSync(nodeZip) && sha(nodeZip) === erwartet) {
    const nodeZiel = path.join(STICK, "05-Server", "node");
    fs.mkdirSync(nodeZiel, { recursive: true });
    /* Nur node.exe und LICENSE - der Rest der ZIP (npm, Doku) wird auf dem Server nicht gebraucht. */
    if (WIN) {
      lauf("powershell.exe", ["-NoProfile", "-Command", `Add-Type -AssemblyName System.IO.Compression.FileSystem; $a=[System.IO.Compression.ZipFile]::OpenRead("${nodeZip}"); try { foreach ($n in @("node.exe","LICENSE")) { $e=$a.Entries | Where-Object { $_.FullName -eq "node-${NODE_FASSUNG}-win-x64/$n" } | Select-Object -First 1; if ($e) { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path "${nodeZiel}" $n), $true) } } } finally { $a.Dispose() }`]);
    } else {
      lauf("unzip", ["-qoj", nodeZip, `node-${NODE_FASSUNG}-win-x64/node.exe`, `node-${NODE_FASSUNG}-win-x64/LICENSE`, "-d", nodeZiel]);
    }
    const exe = path.join(nodeZiel, "node.exe");
    pruef("05-Server/node/node.exe liegt auf dem Stick", fs.existsSync(exe) && fs.statSync(exe).size > 30 * 1024 * 1024, fs.existsSync(exe) ? (fs.statSync(exe).size / 1024 / 1024).toFixed(1) + " MB" : "fehlt");
  } else {
    fs.rmSync(nodeZip, { force: true });
  }
}
/* Zip ohne Shell: tar.exe (Windows 10+, -a = Format nach Endung) bzw. zip (Linux). */
function zippe(zielZip, ausschluss) {
  if (fs.existsSync(zielZip)) fs.unlinkSync(zielZip);
  let r;
  if (WIN) r = lauf("tar.exe", ["-a", "-c", "-f", zielZip, ...(ausschluss ? ["--exclude", ausschluss] : []), "BTA-Cockpit-USB-Stick"], { cwd: AUSGABE });
  else r = lauf("zip", ["-qr", zielZip, "BTA-Cockpit-USB-Stick", ...(ausschluss ? ["-x", ausschluss] : [])], { cwd: AUSGABE });
  if (r.status !== 0) { console.log("FEHLT | Zip nicht gebaut: " + ((r.stderr || r.stdout || "").trim() || r.error)); fehler++; return false; }
  return true;
}
const zipOhne = path.join(AUSGABE, "BTA-Cockpit-USB-Stick-ohne-Programm.zip");
/* Die kleine ZIP bleibt Chat-tauglich: ohne Programm-ZIP und ohne node.exe (~75 MB). */
if (zippe(zipOhne, WIN ? "BTA-Cockpit-USB-Stick/05-Server/node" : "BTA-Cockpit-USB-Stick/05-Server/node/*")) {
  console.log(`\nStick-Ordner: ${path.relative(WURZEL, STICK)}`);
  console.log(`ZIP ohne Programm${mitNode ? " und ohne node.exe" : ""}: ${path.relative(WURZEL, zipOhne)} (${(fs.statSync(zipOhne).size / 1024).toFixed(0)} kB)`);
}

if (mitProgramm) {
  const zielZip = path.join(STICK, "01-Programm", ZIP_NAME);
  const out = fs.openSync(zielZip, "w");
  for (const t of teile) fs.writeSync(out, fs.readFileSync(t));
  fs.closeSync(out);
  const vergleich = path.join(AUSGABE, ZIP_NAME);
  if (fs.existsSync(vergleich)) pruef("Zusammengesetzte ZIP ist byte-gleich mit ausgabe/" + ZIP_NAME, sha(vergleich) === sha(zielZip));
  fs.rmSync(path.join(STICK, "01-Programm", "HIER-FEHLT-NOCH-DAS-PROGRAMM.txt"), { force: true });
  const komplett = path.join(AUSGABE, "BTA-Cockpit-Komplettpaket.zip");
  if (zippe(komplett, null)) console.log(`Komplettpaket: ${path.relative(WURZEL, komplett)} (${(fs.statSync(komplett).size / 1024 / 1024).toFixed(1)} MB) - Stick-Ordner enthält jetzt das Programm-ZIP`);
}
process.exit(fehler ? 1 : 0);
