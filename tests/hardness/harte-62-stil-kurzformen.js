// Härtetest: CSS-KURZFORM-FALLEN (Nachlese zu Robertos Störbericht-Fund
// vom 31.08. - "prüfe bitte direkt weitere Bereiche wo das zutreffen könnte").
//
// Das Muster: Mischt ein React-Style die KURZFORM (border/overflow/...) mit
// einer LANGFORM derselben Eigenschaft, und ändert sich die Kurzform bei
// einem Update, setzt React nur die Kurzform neu - der Browser räumt dabei
// die Langform mit ab, und React setzt sie nie nach (ihr Wert "blieb ja
// gleich"). Systematisch wurden alle 1140 Style-Objekte durchkämmt; ein
// zweiter echter Treffer fand sich - und wird hier festgenagelt:
//
//  (K1) Plan-Kachel: Beim Ein-Klick-Abhaken wechselt der Rahmen auf grün -
//       die 4px-Kennfarben-Kante links MUSS dabei stehen bleiben.
//       (Gemessen vor dem Fix: Die Kante war nach dem Haken weg -
//       border: "1px solid grün" hatte sie überschrieben.)
//  (K2) Die Quelle ist sauber: KEIN Style-Objekt mischt mehr eine
//       variable border-Kurzform mit einer border-Langform, und kein
//       ZiehbareKarte-Stil nutzt die overflow-Kurzform (Störbericht-Lehre).
//
// Hausregel erfüllt: Gegen den Build ohne den Fix schlägt (K1) fehl.
const fsNode = require("fs");
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const QUELLE = "/home/user/WerkstattKalender/app/src/WerkstattKalender.jsx";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  /* ---- (K2) Quell-Wache: keine gefährlichen Mischungen mehr ---- */
  {
    const quelle = fsNode.readFileSync(QUELLE, "utf8");
    const bloecke = [];
    for (let i = 0; i < quelle.length; i++) {
      const start = quelle.indexOf("style={{", i);
      if (start < 0) break;
      let tiefe = 0, j = start + 7;
      for (; j < quelle.length; j++) {
        if (quelle[j] === "{") tiefe++;
        else if (quelle[j] === "}") { tiefe--; if (tiefe === 0) break; }
      }
      bloecke.push({ zeile: quelle.slice(0, start).split("\n").length, text: quelle.slice(start, j + 1) });
      i = j;
    }
    // Gefährlich ist die VARIABLE Kurzform (Template/Ternary im Wert) neben
    // einer Langform - eine konstante Kurzform ändert sich nie und kann
    // beim Update nichts überschreiben.
    const gefaehrlich = bloecke.filter((b) =>
      /\bborder\s*:\s*[`$]|\bborder\s*:\s*[^,}]*\?/.test(b.text) &&
      /\bborder(Left|Right|Top|Bottom|Color|Width|Style)\s*:/.test(b.text));
    pruef("(K2) Keine variable border-Kurzform neben einer border-Langform",
          gefaehrlich.length === 0, gefaehrlich.map((b) => "Zeile " + b.zeile).join(", "));
    // ZiehbareKarte-Stile: nie die overflow-Kurzform (Recycle-Falle vom 31.08.)
    const karten = [...quelle.matchAll(/<ZiehbareKarte[\s\S]{0,600}?style=\{\{[\s\S]*?\}\}/g)]
      .filter((m) => /[^a-zA-Z]overflow\s*:/.test(m[0]));
    pruef("(K2) Kein ZiehbareKarte-Stil nutzt die overflow-KURZFORM",
          karten.length === 0, `${karten.length} Treffer`);
  }

  /* ---- (K1) Plan-Kachel behält die Kennfarben-Kante beim Abhaken ---- */
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const p = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-31T10:00:00"));
  await p.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([]));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({ tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [] }));
  });
  await p.goto(APP);
  await p.getByRole("button", { name: "TPM", exact: true }).first().waitFor({ timeout: 8000 });
  await p.waitForTimeout(900);
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Plan", exact: true }).first().click();
  await p.waitForTimeout(1200);

  // Die Kachel über ihren TEXT festhalten - die Reihenfolge in der Tages-
  // Zelle ändert sich durchs Abhaken, ein "erste Kachel"-Griff verrutscht.
  const vorher = await p.evaluate(() => {
    const k = [...document.querySelectorAll("button[data-plan-datum]")].find((el) => el.textContent.trim() === "TS480");
    return { kante: getComputedStyle(k).borderLeft };
  });
  pruef("(K1) Vorher: Die Kachel trägt die 4px-Kennfarben-Kante",
        /4px/.test(vorher.kante), vorher.kante);
  // Den ✓-Haken GENAU dieser Kachel klicken (Ein-Klick-Abhaken, QoL 19.08.)
  await p.evaluate(() => {
    const k = [...document.querySelectorAll("button[data-plan-datum]")].find((el) => el.textContent.trim() === "TS480");
    k.parentElement.querySelector("button:not([data-plan-datum])").click();
  });
  await p.waitForTimeout(700);
  const nachher = await p.evaluate(() => {
    const k = [...document.querySelectorAll("button[data-plan-datum]")].find((el) => /TS480/.test(el.textContent));
    return { text: k.textContent.trim(), kante: getComputedStyle(k).borderLeft, rahmen: getComputedStyle(k).borderTop };
  });
  pruef("(K1) Die Kachel ist wirklich abgehakt (grüner Rahmen, ✓)",
        nachher.text.startsWith("✓") && /rgb\(47, 125, 79\)/.test(nachher.rahmen), JSON.stringify(nachher));
  pruef("(K1) Die 4px-Kennfarben-Kante ist NICHT verloren gegangen",
        nachher.kante === vorher.kante, `vorher=${vorher.kante} nachher=${nachher.kante}`);
  pruef("(K1-K2) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  console.log(`\nHärte 62 (Stil-Kurzform-Fallen): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
