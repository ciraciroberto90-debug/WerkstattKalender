/* Macht die Tests tragbar: ersetzt die festen Cloud-Pfade in tests/ durch die
 * gemeinsame Umgebung (tests/umgebung.js). Roll-out 73, 29.10.
 *
 * Aufruf:  node tools/tests-tragbar-machen.js [--pruefen]
 *   --pruefen: ändert nichts, zählt nur, was ersetzt würde, und nennt jede
 *              Stelle mit /home/user, /opt/pw-browsers, /tmp/ oder file://,
 *              die das Skript NICHT kennt (die bleiben Handarbeit).
 *
 * Warum ein Skript statt Handarbeit: 119 Dateien mit sechs wiederkehrenden
 * Mustern - ein Skript ist nachvollziehbar, wiederholbar und übersieht nichts.
 * Was ein Test prüft, bleibt unangetastet; nur Pfade und der Browser-Start
 * ändern sich. Zeilenenden (LF) bleiben erhalten.
 */
const fs = require("fs");
const path = require("path");

const WURZEL = path.resolve(__dirname, "..");
const TESTS = path.join(WURZEL, "tests");
const nurPruefen = process.argv.includes("--pruefen");
/* Nicht angefasst: Electron-Prüfstand (xvfb, pkill - nur Linux) und das
 * Bash-Skript für die PC-Sicherung; beides ist nicht Teil der Härtetest-Suite. */
const AUSGENOMMEN = new Set(["pruefe-programm.js", "umgebung.js", "suite-laufen.js", "run-hardness-tests.js", "run-browser-reserve.js"]);

const CLOUD = "/home/user/WerkstattKalender";
const q = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const C = q(CLOUD);

/* Reihenfolge ist Absicht: erst die speziellen Muster, dann die allgemeinen. */
const REGELN = [
  ["playwright-core über festen Pfad", new RegExp(`require\\((['"])${C}/node_modules/playwright-core\\1\\)`, "g"), 'require("playwright-core")'],
  ["file://-Adresse der App als Text", new RegExp(`(['"])file://${C}/Werkstatt_Kalender_TPM\\.html\\1`, "g"), "UMG.APP"],
  ["file://-Adresse einer anderen Repo-Datei", new RegExp(`(['"])file://${C}/([^'"]+)\\1`, "g"), (m, a, rest) => `UMG.dateiUrl("${rest}")`],
  ["Pfad der App-Datei", new RegExp(`(['"])${C}/Werkstatt_Kalender_TPM\\.html\\1`, "g"), "UMG.APP_PFAD"],
  ["require einer Repo-Datei über festen Pfad", new RegExp(`require\\((['"])${C}/([^'"]+)\\1\\)`, "g"), (m, a, rest) => `require(UMG.WURZEL + "/${rest}")`],
  ["sonstiger Repo-Pfad", new RegExp(`(['"])${C}/([^'"]+)\\1`, "g"), (m, a, rest) => `UMG.WURZEL + "/${rest}"`],
  ["Browser-Pfad", /executablePath:\s*(['"])\/opt\/pw-browsers\/chromium\1/g, "executablePath: UMG.CHROMIUM"],
  ["fester /tmp-Ordner (kaputt)", /(['"])\/tmp\/claude-0\/[^'"]*\/scratchpad\/kaputt\1/g, 'UMG.tmpOrdner("kaputt")'],
  ["fester /tmp-Ordner (scratchpad)", /(['"])\/tmp\/claude-0\/[^'"]*\/scratchpad\1/g, 'UMG.tmpOrdner("scratchpad")'],
  /* "file://" + <Ausdruck>; in einer Zuweisung - der Ausdruck wird durch dateiUrl
   * geführt, die auch mit Windows-Pfaden umgeht. Nur ganze Zuweisungszeilen,
   * damit kein Klammerpaar in einem Aufruf zerbricht. */
  ["file:// + Ausdruck in einer Zuweisung", /^(\s*(?:const|let|var)\s+\w+\s*=\s*)(['"])file:\/\/\2\s*\+\s*([^;\n]+);/gm, (m, kopf, a, ausdruck) => `${kopf}UMG.dateiUrl(${ausdruck});`],
];

const dateien = [];
(function sammle(o) {
  for (const n of fs.readdirSync(o, { withFileTypes: true })) {
    if (n.name === "node_modules" || n.name === "hilfen") continue;
    const p = path.join(o, n.name);
    if (n.isDirectory()) sammle(p);
    else if (n.name.endsWith(".js") && !AUSGENOMMEN.has(n.name)) dateien.push(p);
  }
})(TESTS);

const zaehler = Object.fromEntries(REGELN.map(([n]) => [n, 0]));
const offen = [];
let geaendert = 0;
for (const datei of dateien) {
  const alt = fs.readFileSync(datei, "utf8");
  let neu = alt;
  for (const [name, re, ersatz] of REGELN) {
    neu = neu.replace(re, (...a) => { zaehler[name]++; return typeof ersatz === "function" ? ersatz(...a) : ersatz; });
  }
  if (neu.includes("UMG.") && !/require\((['"])[./]*umgebung\1\)/.test(neu)) {
    /* Die Umgebung vor dem ersten require einbinden - dort stehen in jeder Datei
     * die Einbindungen, der Kopfkommentar bleibt davor. */
    let rel = path.relative(path.dirname(datei), path.join(TESTS, "umgebung.js")).replace(/\\/g, "/").replace(/\.js$/, "");
    if (!rel.startsWith(".")) rel = "./" + rel;
    const zeile = `const UMG = require("${rel}"); // Repo-Ort, App-Datei, Browser (Roll-out 73)\n`;
    const i = neu.search(/^[^\n]*\brequire\(/m);
    neu = i >= 0 ? neu.slice(0, i) + zeile + neu.slice(i) : zeile + neu;
  }
  /* Was das Skript nicht kennt, wird genannt - nicht stillschweigend gelassen. */
  neu.split("\n").forEach((z, nr) => {
    if (/\/home\/user\/|\/opt\/pw-browsers|\/tmp\/claude|(['"])file:\/\/\1\s*\+/.test(z)) offen.push(path.relative(WURZEL, datei) + ":" + (nr + 1) + ": " + z.trim().slice(0, 140));
  });
  if (neu !== alt) { geaendert++; if (!nurPruefen) fs.writeFileSync(datei, neu); }
}

console.log((nurPruefen ? "PRÜFUNG (nichts geändert)" : "UMGESCHRIEBEN") + ` - ${dateien.length} Dateien gesehen, ${geaendert} ${nurPruefen ? "würden sich ändern" : "geändert"}`);
for (const [n, c] of Object.entries(zaehler)) console.log(`  ${String(c).padStart(4)} x ${n}`);
console.log(offen.length ? `\nHANDARBEIT (${offen.length} Stellen):\n  ` + offen.join("\n  ") : "\nKeine unbekannten Stellen übrig.");
process.exit(offen.length ? 1 : 0);
