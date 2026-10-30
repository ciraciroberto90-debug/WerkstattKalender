/* Lässt alle harte-*.js eines Ordners nacheinander laufen und zählt - das
 * Node-Gegenstück zu run-hardness-tests.sh / run-browser-reserve.sh, damit
 * die Suite auch ohne Bash läuft (Roll-out 73, 29.10.).
 *
 * Die Suite läuft in der Zeitzone der Werkstatt-Rechner (Europe/Berlin), es
 * sei denn, TZ ist schon gesetzt - gleiche Regel wie im Bash-Skript (06.09.:
 * harte-38 war im UTC-Prüfstand rot, obwohl die App richtig stempelte).
 *
 * Jeder Lauf schreibt ein Protokoll nach tests/protokolle/<Zeit>-<Ordner>.log
 * (in .gitignore) und am Ende eine Zeile in tests/protokolle/LETZTER-LAUF.txt.
 * Warum (30.10.): Der zweite volle Lauf lief drei Stunden in einem Terminal-
 * Reiter, der über Nacht verschwand - mit ihm das Ergebnis. Eine Datei bleibt.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PROTOKOLLE = path.join(__dirname, "protokolle");

module.exports = function suiteLaufen(ordner, titel, nurDiese) {
  const voll = path.join(__dirname, ordner);
  const env = { ...process.env, TZ: process.env.TZ || "Europe/Berlin" };
  /* Reihenfolge wie die Bash-Schleife (Zeichen für Zeichen, also harte-1,
   * harte-10, harte-100 … vor harte-2) - so bleiben Protokolle vergleichbar. */
  let tests = fs.readdirSync(voll).filter((n) => /^harte-.*\.js$/.test(n)).sort();
  if (nurDiese && nurDiese.length) tests = tests.filter((n) => nurDiese.some((m) => n.includes(m)));

  fs.mkdirSync(PROTOKOLLE, { recursive: true });
  /* Mit Sekunden: zwei Läufe in derselben Minute (30.10.: Probelauf und voller
   * Lauf) würden sonst dieselbe Datei überschreiben. */
  const stempel = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const protokollPfad = path.join(PROTOKOLLE, `${stempel}-${ordner}.log`);
  const protokoll = fs.createWriteStream(protokollPfad);
  const sag = (s) => { process.stdout.write(s + "\n"); protokoll.write(s + "\n"); };

  sag(`🧪 ${titel}\n===========================================\nProtokoll: ${protokollPfad}\n`);
  const start = Date.now();
  let gruen = 0, rot = 0;
  const rote = [];

  const einer = (t) => new Promise((fertig) => {
    sag(`▶️  Running: ${t.replace(/\.js$/, "")}`);
    const t0 = Date.now();
    const kind = spawn(process.execPath, [path.join(voll, t)], { cwd: __dirname, env, stdio: ["ignore", "pipe", "pipe"] });
    /* Ausgabe des Tests gleichzeitig auf den Bildschirm und ins Protokoll. */
    kind.stdout.on("data", (d) => { process.stdout.write(d); protokoll.write(d); });
    kind.stderr.on("data", (d) => { process.stderr.write(d); protokoll.write(d); });
    kind.on("close", (code) => {
      const sek = ((Date.now() - t0) / 1000).toFixed(0);
      if (code === 0) { gruen++; } else { rot++; rote.push(t); }
      sag(`   (${sek} s${code === 0 ? "" : ", Exit " + code})\n`);
      fertig();
    });
  });

  (async () => {
    for (const t of tests) await einer(t);
    const min = ((Date.now() - start) / 60000).toFixed(1);
    const zusammenfassung = `📊 Summary: ${gruen}/${tests.length} tests passed (${min} min)` + (rot ? `\n❌ ${rot} test(s) failed: ${rote.join(", ")}` : "\n✅ All tests passed!");
    sag(`===========================================\n${zusammenfassung}`);
    /* Kurzzeile für den schnellen Blick ohne das ganze Protokoll. */
    fs.writeFileSync(path.join(PROTOKOLLE, "LETZTER-LAUF.txt"), `${new Date().toLocaleString("de-DE")} · ${ordner} · ${gruen}/${tests.length} grün · ${min} min` + (rot ? ` · rot: ${rote.join(", ")}` : "") + `\n${protokollPfad}\n`);
    protokoll.end(() => process.exit(rot ? 1 : 0));
  })();
};
