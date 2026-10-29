// Härtetest: ATOMARES SCHREIBEN DES PROGRAMMS MIT ANLÄUFEN (Robertos neuer
// Rechner vom 28.09.: "EPERM: operation not permitted, open '…schreibe-45252
// .json'" beim Speichern, im Ordner blieben 0-KB-Zwischendateien liegen)
//
// Reine Node-Prüfung von programm/atomar.js mit einer Dateisystem-Attrappe -
// ohne Electron, ohne Laufwerk.
//  (A1) Ein EPERM beim Anlegen der Zwischendatei wird wiederholt; klappt der
//       zweite Anlauf, kommt die Datei an - kein Fehler, keine Reste.
//  (A2) Scheitert das Anlegen endgültig (EPERM bei jedem Anlauf): Fehler nennt
//       den Schritt "Zwischendatei anlegen", die Zwischendatei ist weggeräumt.
//  (A3) Ein EPERM beim Umbenennen (Kollege liest gerade) wird wiederholt.
//  (A4) Alte Zwischendateien desselben Ziels (älter als 10 min) werden vor dem
//       Schreiben weggeräumt, junge (anderes Fenster schreibt gerade) nicht.
//  (A5) Ein nicht wiederholbarer Fehler (ENOENT: Ordner weg) wird sofort
//       gemeldet - ohne vier Anläufe.
//  (A6) Der Erfolgsweg schreibt genau einmal und benennt genau einmal um.
//
// Rot-Nachweis: Gegen den Bau davor (Ablauf direkt in main.js) gibt es beim
// Anlegen keinen zweiten Anlauf (A1 rot) und keinen Schritt im Fehler (A2 rot).
const UMG = require("../umgebung"); // Repo-Ort, App-Datei, Browser (Roll-out 73)
const path = require("path");
const { schreibeAtomar, ALT_MS } = require(UMG.WURZEL + "/programm/atomar.js");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const fehler = (code) => Object.assign(new Error(`${code}: operation not permitted`), { code });
const ZIEL = "/laufwerk/Werkstatt_Kalender/werkstatt-kalender-daten.json";

// Dateisystem-Attrappe: Dateien als Map, Fehler nach Drehbuch je Schritt.
// Schlüssel immer mit "/" - atomar.js baut Pfade mit path.join, das unter
// Windows "\" liefert; ohne Angleich fände die Attrappe ihre eigenen Dateien
// nicht wieder (harte-97 A4 war auf dem Laptop rot, Roll-out 73).
const N = (p) => String(p).replace(/\\/g, "/");
function attrappe({ writeFehler = [], renameFehler = [], vorhandene = {} } = {}) {
  const dateien = new Map(Object.entries(vorhandene).map(([k, v]) => [N(k), v])); // pfad -> { inhalt, mtimeMs }
  const protokoll = [];
  let jetzt = 1_000_000_000;
  return {
    dateien, protokoll,
    jetzt: () => jetzt,
    fs: {
      async writeFile(p, inhalt) {
        protokoll.push("write " + path.posix.basename(N(p)));
        const f = writeFehler.shift();
        if (f) { if (f !== "leer") throw fehler(f); dateien.set(N(p), { inhalt: "", mtimeMs: jetzt }); throw fehler("EPERM"); }
        dateien.set(N(p), { inhalt: String(inhalt), mtimeMs: jetzt });
      },
      async rename(a, b) {
        protokoll.push("rename " + path.posix.basename(N(a)));
        const f = renameFehler.shift();
        if (f) throw fehler(f);
        if (!dateien.has(N(a))) throw fehler("ENOENT");
        dateien.set(N(b), dateien.get(N(a))); dateien.delete(N(a));
      },
      async unlink(p) { protokoll.push("unlink " + path.posix.basename(N(p))); if (!dateien.has(N(p))) throw fehler("ENOENT"); dateien.delete(N(p)); },
      async readdir(ordner) { return [...dateien.keys()].filter((p) => path.posix.dirname(p) === N(ordner)).map((p) => path.posix.basename(p)); },
      async stat(p) { if (!dateien.has(N(p))) throw fehler("ENOENT"); return { mtimeMs: dateien.get(N(p)).mtimeMs, size: dateien.get(N(p)).inhalt.length }; },
    },
  };
}
const pausen = [];
const pause = async (ms) => { pausen.push(ms); };

(async () => {
  /* (A1) EPERM beim Anlegen, zweiter Anlauf klappt */
  {
    pausen.length = 0;
    const a = attrappe({ writeFehler: ["EPERM"] });
    let e = null;
    try { await schreibeAtomar(a.fs, ZIEL, '{"x":1}', 4711, { pause, jetzt: a.jetzt }); } catch (x) { e = x; }
    ok("(A1) EPERM beim Anlegen wird wiederholt - die Datei kommt an, kein Fehler",
      !e && a.dateien.has(ZIEL) && a.dateien.get(ZIEL).inhalt === '{"x":1}', e ? e.message : a.protokoll.join(", "));
    ok("(A1) Keine Zwischendatei bleibt liegen, eine Pause von 150 ms dazwischen",
      ![...a.dateien.keys()].some((p) => p.includes(".schreibe-")) && pausen.join(",") === "150", pausen.join(","));
  }
  /* (A2) Anlegen scheitert endgültig */
  {
    pausen.length = 0;
    const a = attrappe({ writeFehler: ["leer", "EPERM", "EPERM", "EPERM", "EPERM"] });
    let e = null;
    try { await schreibeAtomar(a.fs, ZIEL, "{}", 4711, { pause, jetzt: a.jetzt }); } catch (x) { e = x; }
    ok("(A2) Scheitert das Anlegen fünfmal: Fehler nennt den Schritt „Zwischendatei anlegen“ und den Node-Grund",
      !!e && /Zwischendatei anlegen/.test(e.message) && /EPERM/.test(e.message) && e.schritt === "Zwischendatei anlegen", e && e.message);
    ok("(A2) Die halb angelegte 0-KB-Zwischendatei ist weggeräumt, die Zieldatei unangetastet",
      ![...a.dateien.keys()].some((p) => p.includes(".schreibe-")) && !a.dateien.has(ZIEL), [...a.dateien.keys()].join(","));
    ok("(A2) Vier Pausen mit wachsender Länge (150, 400, 900, 1800 ms)", pausen.join(",") === "150,400,900,1800", pausen.join(","));
  }
  /* (A3) EPERM beim Umbenennen */
  {
    pausen.length = 0;
    const a = attrappe({ renameFehler: ["EPERM", "EPERM"], vorhandene: { [ZIEL]: { inhalt: "alt", mtimeMs: 1 } } });
    let e = null;
    try { await schreibeAtomar(a.fs, ZIEL, "neu", 4711, { pause, jetzt: a.jetzt }); } catch (x) { e = x; }
    ok("(A3) Zweimal EPERM beim Umbenennen (Kollege liest gerade): der dritte Anlauf ersetzt die Zieldatei",
      !e && a.dateien.get(ZIEL).inhalt === "neu" && pausen.join(",") === "150,400", e ? e.message : pausen.join(","));
  }
  /* (A4) alte Zwischendateien wegräumen */
  {
    const a = attrappe();
    const ordner = path.posix.dirname(ZIEL);
    const alt = path.posix.join(ordner, "werkstatt-kalender-daten.schreibe-22784.json");
    const jung = path.posix.join(ordner, "werkstatt-kalender-daten.schreibe-31337.json");
    const fremd = path.posix.join(ordner, "werkstatt-stoerungen.schreibe-22784.json");
    a.dateien.set(alt, { inhalt: "", mtimeMs: a.jetzt() - ALT_MS - 1000 });
    a.dateien.set(jung, { inhalt: "", mtimeMs: a.jetzt() - 5000 });
    a.dateien.set(fremd, { inhalt: "", mtimeMs: a.jetzt() - ALT_MS - 1000 });
    await schreibeAtomar(a.fs, ZIEL, "{}", 4711, { pause, jetzt: a.jetzt });
    ok("(A4) Die alte 0-KB-Zwischendatei desselben Ziels ist weg, die junge (anderes Fenster) und die eines anderen Ziels bleiben",
      !a.dateien.has(alt) && a.dateien.has(jung) && a.dateien.has(fremd) && a.dateien.has(ZIEL), [...a.dateien.keys()].map((p) => path.basename(p)).join(","));
  }
  /* (A5) nicht wiederholbarer Fehler */
  {
    pausen.length = 0;
    const a = attrappe({ writeFehler: ["ENOENT"] });
    let e = null;
    try { await schreibeAtomar(a.fs, ZIEL, "{}", 4711, { pause, jetzt: a.jetzt }); } catch (x) { e = x; }
    ok("(A5) ENOENT (Ordner weg) wird sofort gemeldet - ohne Anläufe", !!e && /ENOENT/.test(e.message) && pausen.length === 0, e && e.message);
  }
  /* (A6) Erfolgsweg */
  {
    const a = attrappe();
    await schreibeAtomar(a.fs, ZIEL, "{}", 4711, { pause, jetzt: a.jetzt });
    ok("(A6) Erfolgsweg: genau ein Anlegen, genau ein Umbenennen, kein Löschen",
      a.protokoll.join(" | ") === "write werkstatt-kalender-daten.schreibe-4711.json | rename werkstatt-kalender-daten.schreibe-4711.json", a.protokoll.join(" | "));
  }

  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
