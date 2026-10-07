// Baut briefkasten/worker.js: fügt kern.js (ohne module.exports) zwischen die
// Marken KERN-ANFANG / KERN-ENDE ein - eine Datei zum Einfügen im Dashboard.
// Mit --pruefen: nur prüfen, ob die eingebettete Fassung noch zu kern.js passt.
"use strict";
const fs = require("fs");
const path = require("path");
const HIER = __dirname;
const kern = fs.readFileSync(path.join(HIER, "kern.js"), "utf8")
  .replace(/^"use strict";\s*/m, "")
  .replace(/\nmodule\.exports = [^\n]*\n?/, "\n");
const workerPfad = path.join(HIER, "worker.js");
const worker = fs.readFileSync(workerPfad, "utf8");
const neu = worker.replace(/\/\* --- KERN-ANFANG --- \*\/[\s\S]*?\/\* --- KERN-ENDE --- \*\//, `/* --- KERN-ANFANG --- */\n${kern.trim()}\n/* --- KERN-ENDE --- */`);
if (process.argv.includes("--pruefen")) {
  if (neu !== worker) { console.error("worker.js ist nicht auf dem Stand von kern.js - node briefkasten/worker-bauen.js"); process.exit(1); }
  console.log("worker.js passt zu kern.js");
} else {
  fs.writeFileSync(workerPfad, neu);
  console.log("worker.js gebaut (" + neu.length + " Zeichen)");
}
