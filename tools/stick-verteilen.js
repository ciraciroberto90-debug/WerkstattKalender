/* Verteilt den gebauten Stick-Ordner an alle Ablageorte - in einem Befehl, mit
 * Nachmessen (Roll-out 79, 30.10.).
 *
 * Warum: Das Werkzeug liegt an drei Orten (USB-Stick, Server-Kopie, W:). Jede
 * Korrektur musste bisher von Hand an alle drei - und einer blieb alt. Jetzt:
 *   node tools/stick-bauen.js --mit-server && node tools/stick-verteilen.js
 * Oder beides zusammen: node tools/stick-verteilen.js --bauen
 *
 * Regeln:
 *   - Quelle ist programm/ausgabe/BTA-Cockpit-USB-Stick (frischer Bau).
 *   - Ziele, die nicht erreichbar sind (Stick nicht gesteckt, kein Netz),
 *     werden gemeldet und uebersprungen - kein Abbruch.
 *   - Das Programm-ZIP (01-Programm/*.zip, 110 MB) wird NIE geloescht; fehlt es
 *     an einem Ziel, kommt es von einem anderen Ziel, das es hat (--mit-programm),
 *     sonst bleibt es weg (das Werkzeug kann es selbst laden).
 *   - Dateien, die es in der Quelle nicht mehr gibt (alte Werkzeuge), werden am
 *     Ziel entfernt - ausser dem Programm-ZIP und dem Ordner 05-Server/node.
 *   - Jede Datei wird nach dem Kopieren per SHA-256 nachgemessen.
 * Ziele kommen aus tools/stick-ziele.json (Liste von Pfaden); fehlt die Datei,
 * gelten die drei bekannten Orte.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const WURZEL = path.resolve(__dirname, "..");
const QUELLE = path.join(WURZEL, "programm", "ausgabe", "BTA-Cockpit-USB-Stick");
const ZIELE_DATEI = path.join(__dirname, "stick-ziele.json");
const VORGABE_ZIELE = [
  "D:\\BTA-Cockpit-USB-Stick",
  "\\\\v-btacockpit-1\\BTA\\BTA-Programm\\Installation\\BTA-Cockpit-USB-Stick",
  "W:\\16_Technik\\01_Scheurich\\02_Werkstatt\\Arbeitsplanung\\BTA-Cockpit-Stick",
];
const ziele = fs.existsSync(ZIELE_DATEI) ? JSON.parse(fs.readFileSync(ZIELE_DATEI, "utf8")).ziele : VORGABE_ZIELE;
const bauen = process.argv.includes("--bauen");
const mitProgramm = process.argv.includes("--mit-programm");
const nurPruefen = process.argv.includes("--nur-pruefen");

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const istZip = (rel) => /^01-Programm[\\/].*\.zip$/i.test(rel);
const istNode = (rel) => /^05-Server[\\/]node([\\/]|$)/i.test(rel);
function dateien(ordner) {
  const aus = [];
  (function geh(o) { for (const e of fs.readdirSync(o, { withFileTypes: true })) { const p = path.join(o, e.name); if (e.isDirectory()) geh(p); else aus.push(path.relative(ordner, p)); } })(ordner);
  return aus;
}

if (bauen) {
  const r = spawnSync(process.execPath, [path.join(__dirname, "stick-bauen.js"), "--mit-server"], { stdio: "inherit" });
  if (r.status !== 0) { console.log("Stick-Bauer rot - nichts verteilt."); process.exit(1); }
}
if (!fs.existsSync(QUELLE)) { console.log("Quelle fehlt: " + QUELLE + " - erst node tools/stick-bauen.js --mit-server"); process.exit(1); }
const quellDateien = dateien(QUELLE);
console.log(`Quelle: ${QUELLE} (${quellDateien.length} Dateien)${nurPruefen ? "  [NUR PRÜFEN]" : ""}\n`);

let rot = 0;
const zipQuellen = []; // Ziele, die das Programm-ZIP schon haben
for (const z of ziele) { try { const d = path.join(z, "01-Programm"); if (fs.existsSync(d)) for (const n of fs.readdirSync(d)) if (/\.zip$/i.test(n)) zipQuellen.push(path.join(d, n)); } catch (e) { /* nicht erreichbar */ } }

for (const ziel of ziele) {
  let erreichbar = false;
  try { erreichbar = fs.existsSync(path.dirname(ziel)); } catch (e) { erreichbar = false; }
  if (!erreichbar) { console.log(`ÜBERSPRUNGEN  ${ziel}  (nicht erreichbar)`); continue; }
  const t0 = Date.now();
  let kopiert = 0, gleich = 0, entfernt = 0, fehler = 0;
  if (!nurPruefen) fs.mkdirSync(ziel, { recursive: true });
  for (const rel of quellDateien) {
    const q = path.join(QUELLE, rel), z = path.join(ziel, rel);
    const h = sha(q);
    if (fs.existsSync(z) && sha(z) === h) { gleich++; continue; }
    if (nurPruefen) { kopiert++; continue; }
    fs.mkdirSync(path.dirname(z), { recursive: true });
    fs.copyFileSync(q, z);
    if (sha(z) !== h) { fehler++; console.log(`  UNGLEICH nach dem Kopieren: ${rel}`); } else kopiert++;
  }
  /* Veraltetes am Ziel entfernen - nie das Programm-ZIP, nie 05-Server/node. */
  if (fs.existsSync(ziel)) for (const rel of dateien(ziel)) {
    if (quellDateien.includes(rel) || istZip(rel) || istNode(rel)) continue;
    if (/bta-werkzeug-(fehler|selbsttest)\.txt$/.test(rel)) continue;
    if (nurPruefen) { entfernt++; console.log(`  würde entfernen: ${rel}`); continue; }
    fs.unlinkSync(path.join(ziel, rel)); entfernt++;
  }
  /* Programm-ZIP nachliefern, wenn gewuenscht und woanders vorhanden */
  const zipHier = fs.existsSync(path.join(ziel, "01-Programm")) && fs.readdirSync(path.join(ziel, "01-Programm")).some((n) => /\.zip$/i.test(n));
  let zipText = zipHier ? "Programm-ZIP da" : "kein Programm-ZIP";
  if (!zipHier && mitProgramm && zipQuellen.length) {
    const von = zipQuellen[0];
    if (!nurPruefen) { fs.mkdirSync(path.join(ziel, "01-Programm"), { recursive: true }); fs.copyFileSync(von, path.join(ziel, "01-Programm", path.basename(von))); zipText = `Programm-ZIP kopiert von ${von} (${sha(von) === sha(path.join(ziel, "01-Programm", path.basename(von))) ? "byte-gleich" : "UNGLEICH"})`; }
    else zipText = `würde Programm-ZIP von ${von} holen`;
  }
  rot += fehler;
  console.log(`${fehler ? "ROT   " : "OK    "}  ${ziel}\n          ${kopiert} kopiert, ${gleich} schon gleich, ${entfernt} entfernt, ${zipText}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
console.log(rot ? `\n${rot} Datei(en) nicht byte-gleich.` : "\nAlle erreichbaren Ziele sind auf dem Stand der Quelle.");
process.exit(rot ? 1 : 0);
