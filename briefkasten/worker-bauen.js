// Baut briefkasten/worker.js: fügt kern.js (ohne module.exports) zwischen die
// Marken KERN-ANFANG / KERN-ENDE ein und den Aufnahme-Zettel (handy/aufnahme-
// zettel.html) als Text-Konstante zwischen ZETTEL-ANFANG / ZETTEL-ENDE - eine
// Datei zum Einfügen im Dashboard, die den Zettel unter /zettel ausliefert.
// Mit --pruefen: nur prüfen, ob die eingebettete Fassung noch zu beiden passt.
"use strict";
const fs = require("fs");
const path = require("path");
const HIER = __dirname;
const kern = fs.readFileSync(path.join(HIER, "kern.js"), "utf8")
  .replace(/^"use strict";\s*/m, "")
  .replace(/\nmodule\.exports = [^\n]*\n?/, "\n");
// JSON.stringify macht aus dem HTML eine JS-Zeichenkette (Anführungszeichen, Zeilenumbrüche, Schrägstriche
// sauber maskiert); U+2028/2029 zusätzlich maskieren, weil ältere Laufzeiten sie in Zeichenketten ablehnen.
const zettelHtml = fs.readFileSync(path.join(HIER, "..", "handy", "aufnahme-zettel.html"), "utf8");
const zettel = JSON.stringify(zettelHtml).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const workerPfad = path.join(HIER, "worker.js");
const worker = fs.readFileSync(workerPfad, "utf8");
const neu = worker
  .replace(/\/\* --- KERN-ANFANG --- \*\/[\s\S]*?\/\* --- KERN-ENDE --- \*\//, `/* --- KERN-ANFANG --- */\n${kern.trim()}\n/* --- KERN-ENDE --- */`)
  .replace(/\/\* --- ZETTEL-ANFANG --- \*\/[\s\S]*?\/\* --- ZETTEL-ENDE --- \*\//, () => `/* --- ZETTEL-ANFANG --- */\n// handy/aufnahme-zettel.html, ${zettelHtml.length} Zeichen - nicht von Hand ändern, worker-bauen.js baut neu\nconst ZETTEL = ${zettel};\n/* --- ZETTEL-ENDE --- */`);
if (process.argv.includes("--pruefen")) {
  if (neu !== worker) { console.error("worker.js ist nicht auf dem Stand von kern.js / aufnahme-zettel.html - node briefkasten/worker-bauen.js"); process.exit(1); }
  console.log("worker.js passt zu kern.js");
} else {
  fs.writeFileSync(workerPfad, neu);
  console.log("worker.js gebaut (" + neu.length + " Zeichen)");
}
