// Pruefstand: DAS Stick-Werkzeug (programm/verteilung/usb-stick/werkzeug/bta-*.ps1),
// Roll-out 79 (30.10.). Laeuft nur unter Windows (PowerShell 5.1, WinForms) -
// anderswo meldet es sich als UNGEMESSEN und endet gruen, damit die Cloud-Suite
// nicht rot wird.
//
// Baut einen Attrappen-Stick (winziges Programm-ZIP mit Werkstatt-Cockpit.exe +
// resources/, verbindungsweg.txt, server-adresse.txt) und ein Test-Profil
// (Desktop/Startup/AppData liegen darunter) und bedient das Werkzeug fensterlos:
//  (W1) Lage: Rolle Rechner, Paket da, Tafel hat sieben Zeilen, Programm rot
//  (W2) Einrichten als Info-Bildschirm: exe entpackt, Vorbelegung mit den vier
//       Pfaden (Datei-Weg), Desktop-Verknuepfung mit --vollbild, Autostart
//  (W3) Tafel danach: Programm, Verbindung, Verknuepfung, Autostart gruen
//  (W4) Server-Weg ein: programm:server-url in der Vorbelegung; aus: wieder weg
//  (W5) Autostart aus + Verknuepfung reparieren: kein Startup-Link, Desktop ohne Vollbild
//  (W6) Entfernen mit Ja: exe und Links weg; ohne Ja: nichts passiert (Exit 1)
//  (W7) Stick sagt "server": Einrichten setzt programm:server-url; ohne
//       server-adresse.txt bricht es mit klarer Meldung ab
//  (W8) Fenster: oeffnet sich und schliesst sich selbst (-AutoSchliessen), fuellt
//       Schritte und Tafel ohne Fehlerdatei
//  (W9) Quelltext: Parser ohne Fehler, kein Schluesselwort als Befehl, nur ASCII,
//       $DienstFassungStick = FASSUNG aus server/dienst.js
//
// Rot-Nachweis: Gegen den Stand vor Roll-out 79 gibt es bta-werkzeug.ps1 nicht -
// der Pruefstand ist dort ab (W1) rot (gemessen 30.10.: "Datei nicht gefunden").
const UMG = require("./umgebung");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const ende = () => { console.log(`\n${pass} bestanden, ${fail} durchgefallen`); process.exit(fail ? 1 : 0); };

if (process.platform !== "win32") { console.log("UNGEMESSEN | Stick-Werkzeug braucht Windows (PowerShell 5.1, WinForms) - hier uebersprungen"); process.exit(0); }

const WERKZEUG = path.join(UMG.WURZEL, "programm", "verteilung", "usb-stick", "werkzeug");
const PS1 = path.join(WERKZEUG, "bta-werkzeug.ps1");
const basis = fs.mkdtempSync(path.join(os.tmpdir(), "bta-werkzeug-"));
const stick = path.join(basis, "stick"), profil = path.join(basis, "profil");
for (const d of ["01-Programm", "02-Einstellungen", "05-Server"]) fs.mkdirSync(path.join(stick, d), { recursive: true });
fs.mkdirSync(profil, { recursive: true });
// Attrappen-Programm als ZIP (Compress-Archive - Node hat kein zip an Bord)
const quelle = path.join(basis, "quelle", "Werkstatt-Cockpit-win64");
fs.mkdirSync(path.join(quelle, "resources"), { recursive: true });
fs.writeFileSync(path.join(quelle, "Werkstatt-Cockpit.exe"), Buffer.alloc(2048, 7));
fs.writeFileSync(path.join(quelle, "resources", "app.txt"), "Attrappe");
const ps = (befehl) => spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", befehl], { encoding: "utf8" });
ps(`Compress-Archive -Path "${quelle}" -DestinationPath "${path.join(stick, "01-Programm", "Werkstatt-Cockpit-Programm-win64.zip")}" -Force`);
fs.writeFileSync(path.join(stick, "02-Einstellungen", "verbindungsweg.txt"), "datei\n");
fs.writeFileSync(path.join(stick, "05-Server", "server-adresse.txt"), "http://v-btacockpit-1:8765\n");

function werkzeug(args, mitFenster) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1, ...(mitFenster ? [] : ["-OhneFenster"]), "-Profil", profil, "-Stick", stick, "-Rolle", "rechner", ...args], { encoding: "utf8", timeout: 180000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (e) { /* kein JSON (Fenster) */ }
  return { code: r.status, json, stdout: r.stdout, stderr: r.stderr };
}
const lage = (zweck) => { const r = werkzeug(zweck ? ["-Zweck", zweck] : []); return r.json; };
const dateiIm = (unter) => { const o = path.join(profil, unter); return fs.existsSync(o) ? fs.readdirSync(o) : []; };
const vorbelegung = () => { const f = findeDatei(path.join(profil, "LocalAppData"), "standard-einstellungen.json"); return f ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
function findeDatei(ordner, name) { if (!fs.existsSync(ordner)) return null; for (const e of fs.readdirSync(ordner, { withFileTypes: true })) { const p = path.join(ordner, e.name); if (e.isDirectory()) { const t = findeDatei(p, name); if (t) return t; } else if (e.name === name) return p; } return null; }
const lnkArg = (lnk) => ps(`(New-Object -ComObject WScript.Shell).CreateShortcut("${lnk}").Arguments`).stdout.trim();

(async () => {
  /* (W1) */
  let L = lage();
  ok("(W1) Fensterlos: Lage und Tafel als JSON, Rolle Rechner, Paket auf dem Stick", !!L && L.lage.istServer === false && L.lage.programmZipDa === true && L.lage.verbindungswegStick === "datei", L ? `zip=${L.lage.programmZipDa} weg=${L.lage.verbindungswegStick}` : "kein JSON");
  ok("(W1) Tafel hat sieben Zeilen, 'Programm auf diesem Rechner' rot mit Reparatur 'einrichten'", L && L.tafel.length === 7 && L.tafel[1].Farbe === "rot" && L.tafel[1].Reparatur === "einrichten", L && L.tafel.map((z) => z.Farbe).join(","));
  /* (W2) */
  let r = werkzeug(["-Tue", "einrichten", "-Zweck", "info", "-Ja"]);
  ok("(W2) Einrichten als Info-Bildschirm: Exit 0, exe entpackt, Vorbelegung geschrieben", r.code === 0 && r.json && r.json.ok && /Werkstatt-Cockpit\.exe$/.test(r.json.ergebnis.Exe) && fs.existsSync(r.json.ergebnis.Exe), r.json ? (r.json.fehler || r.json.ergebnis.Getan.join(", ")) : r.stderr.slice(0, 200));
  const v = vorbelegung();
  ok("(W2) Vorbelegung: die vier Datei-Pfade (Scheurich), kein server-url", !!v && /werkstatt-kalender-daten\.json$/.test(v["werkstatt-kalender-fs:handle"]) && /werkstatt-stoerungen\.json$/.test(v["werkstatt-stoerungen-fs:handle"]) && !!v["programm:update-ordner"] && !v["programm:server-url"], v && Object.keys(v).join(","));
  const desk = path.join(profil, "Desktop", "Werkstatt-Cockpit.lnk"), start = path.join(profil, "Startup", "Werkstatt-Cockpit.lnk");
  ok("(W2) Desktop-Verknuepfung mit --vollbild und Autostart-Verknuepfung", fs.existsSync(desk) && fs.existsSync(start) && lnkArg(desk) === "--vollbild", `desktop=${fs.existsSync(desk)} start=${fs.existsSync(start)} arg=${fs.existsSync(desk) ? lnkArg(desk) : "-"}`);
  /* (W3) */
  L = lage("info");
  const farben = Object.fromEntries(L.tafel.map((z) => [z.Id, z.Farbe]));
  ok("(W3) Tafel danach: Programm, Verbindung, Verknuepfung, Autostart gruen", farben.programm === "gruen" && farben.verbindung === "gruen" && farben.verknuepfung === "gruen" && farben.autostart === "gruen", JSON.stringify(farben));
  ok("(W3) Lage: Vollbild erkannt, Weg des Rechners = datei", L.lage.vollbild === true && L.lage.autostart === true && L.lage.verbindungswegRechner === "datei");
  /* (W4) */
  r = werkzeug(["-Tue", "serverweg-ein", "-Ja"]);
  let v2 = vorbelegung();
  ok("(W4) Server-Weg ein: Exit 0, programm:server-url in der Vorbelegung, Lage sagt server", r.code === 0 && v2 && v2["programm:server-url"] === "http://v-btacockpit-1:8765" && lage().lage.verbindungswegRechner === "server", v2 && v2["programm:server-url"]);
  r = werkzeug(["-Tue", "serverweg-aus", "-Ja"]);
  v2 = vorbelegung();
  ok("(W4) Server-Weg aus: server-url weg, Lage sagt datei", r.code === 0 && v2 && !v2["programm:server-url"] && lage().lage.verbindungswegRechner === "datei");
  /* (W5) */
  r = werkzeug(["-Tue", "autostart-aus", "-Ja"]);
  const r2 = werkzeug(["-Tue", "verknuepfung", "-Ja"]);
  ok("(W5) Autostart aus + Verknuepfung reparieren: kein Startup-Link, Desktop-Link ohne Vollbild", r.code === 0 && r2.code === 0 && !fs.existsSync(start) && fs.existsSync(desk) && lnkArg(desk) === "", `start=${fs.existsSync(start)} arg='${lnkArg(desk)}'`);
  /* (W6) */
  r = werkzeug(["-Tue", "entfernen"]);
  ok("(W6) Entfernen OHNE -Ja: Exit 1, nichts geloescht (Rueckfrage gilt als Nein)", r.code === 1 && fs.existsSync(desk) && !!lage().lage.exe, `exit=${r.code}`);
  r = werkzeug(["-Tue", "entfernen", "-Ja"]);
  L = lage();
  ok("(W6) Entfernen mit -Ja: exe und Verknuepfungen weg, Tafel 'Programm' wieder rot", r.code === 0 && !L.lage.exe && !fs.existsSync(desk) && L.tafel[1].Farbe === "rot", r.json && r.json.protokoll.filter((z) => /entfernt/.test(z)).length + " entfernt");
  /* (W7) */
  fs.writeFileSync(path.join(stick, "02-Einstellungen", "verbindungsweg.txt"), "server\n");
  r = werkzeug(["-Tue", "einrichten", "-Zweck", "arbeitsplatz", "-Ja"]);
  v2 = vorbelegung();
  ok("(W7) Stick sagt 'server': Einrichten setzt programm:server-url, Weg im Ergebnis = server", r.code === 0 && v2 && v2["programm:server-url"] === "http://v-btacockpit-1:8765" && r.json.ergebnis.Weg === "server", r.json && r.json.ergebnis && r.json.ergebnis.Verbindung);
  fs.unlinkSync(path.join(stick, "05-Server", "server-adresse.txt"));
  werkzeug(["-Tue", "entfernen", "-Ja"]);
  r = werkzeug(["-Tue", "einrichten", "-Ja"]);
  ok("(W7) Ohne server-adresse.txt bricht der Server-Weg mit klarer Meldung ab (Exit 1)", r.code === 1 && r.json && /server-adresse\.txt/.test(r.json.fehler || ""), r.json && r.json.fehler);
  fs.writeFileSync(path.join(stick, "05-Server", "server-adresse.txt"), "http://v-btacockpit-1:8765\n");
  fs.writeFileSync(path.join(stick, "02-Einstellungen", "verbindungsweg.txt"), "datei\n");
  /* (W8) Fenster */
  const selbsttest = path.join(WERKZEUG, "bta-werkzeug-selbsttest.txt"), fehlerDatei = path.join(WERKZEUG, "bta-werkzeug-fehler.txt");
  for (const f of [selbsttest, fehlerDatei]) if (fs.existsSync(f)) fs.unlinkSync(f);
  const t0 = Date.now();
  r = werkzeug(["-AutoSchliessen", "4"], true);
  const dauer = Date.now() - t0;
  const st = fs.existsSync(selbsttest) ? fs.readFileSync(selbsttest, "utf8") : "";
  ok("(W8) Fenster oeffnet sich, fuellt Schritte und Tafel, schliesst sich nach 4 s - keine Fehlerdatei", r.code === 0 && /7 Tafelzeilen, 3 Karten/.test(st) && !fs.existsSync(fehlerDatei), `exit=${r.code}, ${(dauer / 1000).toFixed(1)} s, '${st}'${fs.existsSync(fehlerDatei) ? " FEHLER: " + fs.readFileSync(fehlerDatei, "utf8").slice(0, 200) : ""}`);
  if (fs.existsSync(selbsttest)) fs.unlinkSync(selbsttest);
  /* (W9) Quelltext */
  const dateien = ["bta-kern.ps1", "bta-werkzeug.ps1", "bta-fenster.ps1"];
  const pruefung = ps(dateien.map((d) => `$t=$null;$e=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile("${path.join(WERKZEUG, d)}",[ref]$t,[ref]$e);$k=@("if","else","elseif","foreach","for","while","switch","try","catch","return","do","until");$s=@($ast.FindAll({$args[0] -is [System.Management.Automation.Language.CommandAst]},$true)|Where-Object{$_.GetCommandName() -in $k});$p=@($ast.FindAll({$args[0] -is [System.Management.Automation.Language.BinaryExpressionAst] -and $args[0].Operator -eq "Plus" -and $args[0].Right -is [System.Management.Automation.Language.ArrayLiteralAst]},$true));"${d}|$($e.Count)|$($s.Count)|$($p.Count)"`).join(";"));
  const zeilen = pruefung.stdout.trim().split(/\r?\n/);
  ok("(W9) Alle drei Skripte: Parser ohne Fehler, kein Schluesselwort als Befehl, kein Plus vor Komma", zeilen.length === 3 && zeilen.every((z) => /\|0\|0\|0$/.test(z)), zeilen.join(" · "));
  const nichtAscii = dateien.map((d) => [d, (fs.readFileSync(path.join(WERKZEUG, d), "utf8").match(/[^\x00-\x7F]/g) || []).length]);
  ok("(W9) Nur ASCII im Quelltext (PowerShell 5.1 liest Umlaute je nach Kodierung falsch)", nichtAscii.every(([, n]) => n === 0), nichtAscii.map(([d, n]) => d + ":" + n).join(", "));
  const fassung = (fs.readFileSync(path.join(UMG.WURZEL, "server", "dienst.js"), "utf8").match(/const FASSUNG = "([\d.]+)"/) || [])[1];
  const kern = fs.readFileSync(path.join(WERKZEUG, "bta-kern.ps1"), "utf8");
  ok("(W9) $DienstFassungStick im Kern = FASSUNG in server/dienst.js", new RegExp(`\\$DienstFassungStick = "${fassung.replace(/\./g, "\\.")}"`).test(kern), fassung);
  ok("(W9) Startdatei BTA-Werkzeug.cmd zeigt auf werkzeug\\bta-werkzeug.ps1", /werkzeug\\bta-werkzeug\.ps1/.test(fs.readFileSync(path.join(UMG.WURZEL, "programm", "verteilung", "usb-stick", "BTA-Werkzeug.cmd"), "utf8")));
  try { fs.rmSync(basis, { recursive: true, force: true }); } catch (e) { /* Temp bleibt */ }
  ende();
})();
