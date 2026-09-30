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
 * Aufruf:  node tools/stick-bauen.js [--mit-programm] [--mit-server] [--mit-node] [--pruefen]
 *   --pruefen: baut nichts, prueft nur, ob die Quellen zusammenpassen
 *              (Teil-Groessen im Download-Zettel, Dateiname der Hauptdatei,
 *              Stand-Zeilen, Klammern in beiden Werkzeugen).
 *   --mit-server: legt den Dienst (server/dienst.js, db.js,
 *              einstellungen.beispiel.json) nach 05-Server/dienst/ auf den
 *              Stick - die Quelle bleibt server/, damit es keine zweite
 *              Fassung gibt (Etappe A, 30.09.).
 *   --mit-node: laedt Node portabel (NODE_FASSUNG, win-x64, ~35 MB ZIP) von
 *              nodejs.org und legt node.exe nach 05-Server/node/. Die ZIP
 *              wird in programm/ausgabe/ behalten, damit ein zweiter Bau
 *              nicht erneut laedt. Ohne --mit-node bleibt der Ordner leer,
 *              das Server-Werkzeug laedt Node dann selbst ("Node
 *              herunterladen"), sofern der Server ins Internet darf.
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
const SERVER = path.join(WURZEL, "server");
const DIENST_DATEIEN = ["dienst.js", "db.js", "einstellungen.beispiel.json"];
/* Dieselbe Fassung wie $NodeFassung im Server-Werkzeug - die Pruefung unten
 * haelt beide zusammen, damit Stick und Werkzeug nie verschiedene Node laden. */
const NODE_FASSUNG = "v22.23.3";
const NODE_URL = `https://nodejs.org/dist/${NODE_FASSUNG}/node-${NODE_FASSUNG}-win-x64.zip`;
const mitProgramm = process.argv.includes("--mit-programm");
const mitServer = process.argv.includes("--mit-server");
const mitNode = process.argv.includes("--mit-node");
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

/* ---- Server-Werkzeug (Etappe A) ---- */
const srv = lese(path.join(QUELLE, "werkzeug", "server-werkzeug.ps1"));
const zaehle = (s, re) => (s.match(re) || []).length;
pruef("Server-Werkzeug: Klammern ausgeglichen", zaehle(srv, /\{/g) === zaehle(srv, /\}/g) && zaehle(srv, /\(/g) === zaehle(srv, /\)/g), `${zaehle(srv, /\{/g)} { / ${zaehle(srv, /\}/g)} } · ${zaehle(srv, /\(/g)} ( / ${zaehle(srv, /\)/g)} )`);
pruef("Server-Werkzeug: nur ASCII (PowerShell 5.1 liest Umlaute je nach Kodierung falsch)", ![...srv].some((c) => c.charCodeAt(0) > 127));
/* Fund 30.09. (Roberto: „Fenster blitzt auf, aber es öffnet nichts"): `(if (…) {…})`
 * in runden Klammern liest PowerShell als Befehl namens „if" - Parser stumm,
 * Laufzeit-Abbruch vor dem Fenster. Richtig ist `$(if …)`. Diese Prüfung war
 * gegen den Stand 5f067f3 rot (1 Treffer, Zeile 666). */
const alsBefehl = (s) => (s.match(/(?<!\$)\(\s*(if|foreach|for|while|switch|try|do)\s*[\(\{]/g) || []);
for (const [name, text] of [["Server-Werkzeug", srv], ["Werkzeug", ps1]]) {
  const t = alsBefehl(text);
  pruef(`${name}: kein Schlüsselwort in runden Klammern ((if …) statt $(if …))`, t.length === 0, t.length ? t.join(" · ") : "");
}
/* Echter Parser, wenn eine PowerShell da ist (pwsh/powershell im Pfad oder
 * ausgabe/pwsh/pwsh): Syntaxfehler und Schlüsselwörter, die als Befehl gelesen
 * werden. Fehlt sie, wird das als ungemessen ausgewiesen, nicht als grün. */
const pwshKandidaten = ["pwsh", "powershell", path.join(AUSGABE, "pwsh", "pwsh")];
const pwsh = pwshKandidaten.find((k) => { try { execSync(`command -v "${k}" >/dev/null 2>&1 || test -x "${k}"`, { shell: "/bin/bash", stdio: "ignore" }); return true; } catch (e) { return false; } });
if (pwsh) {
  const dateien = ["server-werkzeug.ps1", "cockpit-werkzeug.ps1"].map((d) => path.join(QUELLE, "werkzeug", d));
  const skript = `
    foreach ($f in @(${dateien.map((d) => `"${d}"`).join(", ")})) {
      $tokens=$null; $errors=$null
      $ast = [System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$tokens, [ref]$errors)
      $keys = @("if","else","elseif","foreach","for","while","switch","try","catch","return","do","until")
      $treffer = @($ast.FindAll({ $args[0] -is [System.Management.Automation.Language.CommandAst] }, $true) | Where-Object { $_.GetCommandName() -in $keys })
      # Plus vor Komma: "a" + $x + "b", "c" in einer Liste - das Komma bindet staerker,
      # die Liste zerfiel am 30.09. in elf statt acht Zeilen. Erkennbar am AST: ein
      # Plus, dessen rechte Seite eine Komma-Liste ist.
      $treffer += @($ast.FindAll({ $args[0] -is [System.Management.Automation.Language.BinaryExpressionAst] -and $args[0].Operator -eq "Plus" -and $args[0].Right -is [System.Management.Automation.Language.ArrayLiteralAst] }, $true))
      "$([System.IO.Path]::GetFileName($f))|$($errors.Count)|$($treffer.Count)|" + (($errors | ForEach-Object { "Z" + $_.Extent.StartLineNumber + " " + $_.Message }) + ($treffer | ForEach-Object { "Z" + $_.Extent.StartLineNumber + " " + $_.Extent.Text }) -join " · ")
    }`;
  const aus = execSync(`"${pwsh}" -NoProfile -Command '${skript.replace(/'/g, "''")}'`, { shell: "/bin/bash" }).toString().trim().split("\n");
  for (const zeile of aus) {
    const [datei, fehler, schl, detail] = zeile.split("|");
    pruef(`${datei}: PowerShell-Parser ohne Fehler, kein Schlüsselwort als Befehl, kein Plus vor Komma`, fehler === "0" && schl === "0", `${fehler} Fehler, ${schl} Treffer${detail ? " – " + detail : ""}`);
  }
} else {
  console.log("UNGEMESSEN | PowerShell-Parser: kein pwsh/powershell vorhanden - nur die Muster-Prüfung oben");
}
pruef(`Server-Werkzeug: dieselbe Node-Fassung wie der Stick-Bauer (${NODE_FASSUNG})`, new RegExp(`\\$NodeFassung = "${NODE_FASSUNG.replace(/\./g, "\\.")}"`).test(srv));
pruef("Server-Werkzeug: erwartet 05-Server\\dienst und 05-Server\\node\\node.exe", /05-Server\\dienst/.test(srv) && /05-Server\\node\\node\.exe/.test(srv));
pruef("Starter BTA-Server-Werkzeug.cmd zeigt auf werkzeug\\server-werkzeug.ps1", /werkzeug\\server-werkzeug\.ps1/.test(lese(path.join(QUELLE, "BTA-Server-Werkzeug.cmd"))));
for (const d of DIENST_DATEIEN) pruef(`Dienst-Quelle server/${d} vorhanden`, fs.existsSync(path.join(SERVER, d)));
const dienstFassung = (lese(path.join(SERVER, "dienst.js")).match(/const FASSUNG = "(\d+\.\d+\.\d+)"/) || [])[1];
pruef("Dienst-Fassung steht in dienst.js (FASSUNG)", !!dienstFassung, dienstFassung);
/* Werkzeug und Dienst muessen dieselbe Fassung nennen - sonst laeuft der Import
 * gegen einen alten Dienst (30.09., 22:03: leere "davon"-Zeile). */
pruef(`Server-Werkzeug verlangt dieselbe Dienst-Fassung ($DienstFassungStick = ${dienstFassung})`, new RegExp(`\\$DienstFassungStick = "${(dienstFassung || "").replace(/\./g, "\\.")}"`).test(srv));
pruef("05-Server/LIESMICH-SERVER.txt vorhanden", fs.existsSync(path.join(QUELLE, "05-Server", "LIESMICH-SERVER.txt")));
if (nurPruefen || fehler) {
  console.log(fehler ? `\n${fehler} Prüfung(en) rot - Stick nicht gebaut.` : "\nQuellen passen zusammen.");
  process.exit(fehler ? 1 : 0);
}

/* ---- Bauen ---- */
fs.rmSync(STICK, { recursive: true, force: true });
fs.mkdirSync(STICK, { recursive: true });
fs.cpSync(QUELLE, STICK, { recursive: true });

/* ---- Dienst auf den Stick (Etappe A) ----
 * Immer wenn --mit-server: die drei Dateien aus server/ nach 05-Server/dienst/,
 * byte-gleich (SHA-256 geprueft). Ohne den Schalter bleibt 05-Server nur mit
 * dem Zettel - das Server-Werkzeug meldet dann "Stick neu bespielen". */
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
    execSync(`curl -fsSL -o "${nodeZip}.teil" "${NODE_URL}" && mv "${nodeZip}.teil" "${nodeZip}"`, { shell: "/bin/bash", stdio: "inherit" });
  }
  /* Pruefsumme gegen SHASUMS256.txt von nodejs.org - sonst koennte eine
   * abgebrochene oder verfaelschte Ladung als node.exe auf den Server wandern. */
  const summen = execSync(`curl -fsSL "https://nodejs.org/dist/${NODE_FASSUNG}/SHASUMS256.txt"`, { shell: "/bin/bash" }).toString();
  const erwartet = (summen.match(new RegExp(`^([0-9a-f]{64})\\s+node-${NODE_FASSUNG.replace(/\./g, "\\.")}-win-x64\\.zip$`, "m")) || [])[1];
  pruef(`Node-ZIP: SHA-256 stimmt mit SHASUMS256.txt von nodejs.org`, erwartet && sha(nodeZip) === erwartet, erwartet ? sha(nodeZip).slice(0, 12) + "…" : "keine Zeile in SHASUMS256.txt");
  if (erwartet && sha(nodeZip) === erwartet) {
    const nodeZiel = path.join(STICK, "05-Server", "node");
    fs.mkdirSync(nodeZiel, { recursive: true });
    /* Nur node.exe - der Rest der ZIP (npm, Doku) wird auf dem Server nicht gebraucht. */
    execSync(`cd "${nodeZiel}" && unzip -qoj "${nodeZip}" "node-${NODE_FASSUNG}-win-x64/node.exe" "node-${NODE_FASSUNG}-win-x64/LICENSE"`, { shell: "/bin/bash" });
    const exe = path.join(nodeZiel, "node.exe");
    pruef("05-Server/node/node.exe liegt auf dem Stick", fs.existsSync(exe) && fs.statSync(exe).size > 30 * 1024 * 1024, fs.existsSync(exe) ? (fs.statSync(exe).size / 1024 / 1024).toFixed(1) + " MB" : "fehlt");
  } else {
    fs.rmSync(nodeZip, { force: true });
  }
}
const zipOhne = path.join(AUSGABE, "BTA-Cockpit-USB-Stick-ohne-Programm.zip");
if (fs.existsSync(zipOhne)) fs.unlinkSync(zipOhne);
/* Die kleine ZIP bleibt Chat-tauglich: ohne Programm-ZIP und ohne node.exe
 * (~75 MB) - beides holt das jeweilige Werkzeug bei Bedarf selbst. */
execSync(`cd "${AUSGABE}" && zip -qr "${zipOhne}" "BTA-Cockpit-USB-Stick" -x "BTA-Cockpit-USB-Stick/05-Server/node/*"`, { shell: "/bin/bash" });
console.log(`\nStick-Ordner: ${path.relative(WURZEL, STICK)}`);
console.log(`ZIP ohne Programm${mitNode ? " und ohne node.exe" : ""}: ${path.relative(WURZEL, zipOhne)} (${(fs.statSync(zipOhne).size / 1024).toFixed(0)} kB)`);

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
