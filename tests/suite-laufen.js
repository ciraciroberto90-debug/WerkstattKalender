/* Lässt alle harte-*.js eines Ordners nacheinander laufen und zählt - das
 * Node-Gegenstück zu run-hardness-tests.sh / run-browser-reserve.sh, damit
 * die Suite auch ohne Bash läuft (Roll-out 73, 29.10.).
 *
 * Die Suite läuft in der Zeitzone der Werkstatt-Rechner (Europe/Berlin), es
 * sei denn, TZ ist schon gesetzt - gleiche Regel wie im Bash-Skript (06.09.:
 * harte-38 war im UTC-Prüfstand rot, obwohl die App richtig stempelte).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

module.exports = function suiteLaufen(ordner, titel, nurDiese) {
  const voll = path.join(__dirname, ordner);
  const env = { ...process.env, TZ: process.env.TZ || "Europe/Berlin" };
  /* Reihenfolge wie die Bash-Schleife (Zeichen für Zeichen, also harte-1,
   * harte-10, harte-100 … vor harte-2) - so bleiben Protokolle vergleichbar. */
  let tests = fs.readdirSync(voll).filter((n) => /^harte-.*\.js$/.test(n)).sort();
  if (nurDiese && nurDiese.length) tests = tests.filter((n) => nurDiese.some((m) => n.includes(m)));
  console.log(`🧪 ${titel}\n===========================================\n`);
  const start = Date.now();
  let gruen = 0, rot = 0;
  const rote = [];
  for (const t of tests) {
    console.log(`▶️  Running: ${t.replace(/\.js$/, "")}`);
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(voll, t)], { cwd: __dirname, env, stdio: "inherit" });
    const sek = ((Date.now() - t0) / 1000).toFixed(0);
    if (r.status === 0) { gruen++; } else { rot++; rote.push(t); }
    console.log(`   (${sek} s)\n`);
  }
  const min = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`===========================================\n📊 Summary: ${gruen}/${tests.length} tests passed (${min} min)`);
  if (rot) { console.log(`❌ ${rot} test(s) failed: ${rote.join(", ")}`); process.exit(1); }
  console.log("✅ All tests passed!");
};
