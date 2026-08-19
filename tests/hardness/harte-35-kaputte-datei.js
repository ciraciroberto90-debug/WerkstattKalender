// Härtetest: HALB GESCHRIEBENE UND LEERE DATEI.
//
// Der gefährlichste denkbare Fall in dieser Werkstatt: Der Abgleich bricht
// mitten im Schreiben ab, ein Rechner wird hart ausgeschaltet, oder eine
// Konfliktkopie landet als Torso im Ordner. Die App liest dann eine Datei, die
// kein vollständiges JSON mehr ist - oder eine, die plötzlich 0 Bytes hat.
//
// Der Albtraum waere: Die App liest, was noch lesbar ist, haelt das fuer den
// ganzen Bestand und schreibt es zurueck. Damit waere die Arbeit aller anderen
// in dem Moment geloescht, in dem einer speichert.
//
// Geprueft wird:
//   (1) Verbinden mit halb geschriebener Datei: Meldung statt Zerstoerung,
//       der Torso wird NICHT durch einen kleineren Bestand ersetzt.
//   (2) Speichern gegen eine halb geschriebene Datei scheitert LAUT.
//   (3) Eine ploetzlich leere Datei loescht weder Anzeige noch Bestand -
//       der oertliche Stand traegt sie wieder auf.
//   (4) Nach der Reparatur laeuft alles weiter, ohne dass etwas fehlt.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const GESUND = {
  format: "werkstatt-kalender-v1", savedAt: "2026-07-20T08:00:00.000Z",
  entries: [
    { id: "kollege-1", date: "2026-07-10", category: "NOTIZ", text: "Von Kollege 1", updatedAt: "2026-07-10T08:00:00.000Z" },
    { id: "kollege-2", date: "2026-07-11", category: "NOTIZ", text: "Von Kollege 2", updatedAt: "2026-07-11T08:00:00.000Z" },
    { id: "kollege-3", date: "2026-07-12", category: "TPM", name: "BTS", status: "done", updatedAt: "2026-07-12T08:00:00.000Z" },
  ],
  deleted: {}, config: null,
};
const GANZ = JSON.stringify(GESUND, null, 2);
const TORSO = GANZ.slice(0, Math.floor(GANZ.length * 0.6)); // mitten im Schreiben abgebrochen

async function seite(browser, platte) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript(() => {
    const h = {
      name: "kalender-daten.json", kind: "file",
      async getFile() { const t = await window.__lies("kalender-daten.json"); return new File([t], "kalender-daten.json", { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib("kalender-daten.json", b); }, async abort() {} }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    };
    window.showOpenFilePicker = async () => [h];
    window.showSaveFilePicker = async () => h;
  });
  await p.goto(APP);
  await p.waitForTimeout(1000);
  return p;
}
const verbinde = async (p) => {
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForTimeout(2500);
};
const schreibVersuch = (p, entries) => p.evaluate(async (e) => {
  try { await window.storage.set("werkstatt-kalender-entries", JSON.stringify(e)); return { art: "ok" }; }
  catch (err) { return { art: "wurf", meldung: String(err && err.message) }; }
}, entries);

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---------------- (1) Verbinden mit Torso ---------------- */
  {
    const platte = { "kalender-daten.json": TORSO };
    const p = await seite(b, platte);
    const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
    await verbinde(p);
    await p.waitForTimeout(1500);

    pruef("(1) Der Torso wird nicht überschrieben", platte["kalender-daten.json"] === TORSO,
          platte["kalender-daten.json"].length + " Zeichen, vorher " + TORSO.length);
    const text = await p.locator("body").innerText();
    pruef("(1) Die App meldet den Zustand in verständlichem Deutsch",
          /unvollständig/i.test(text) && /nichts überschrieben/i.test(text), text.match(/Die gemeinsame Datei[^\n]{0,80}/)?.[0] || "keine Meldung");
    pruef("(1) Kein roher Text des Browsers in der Meldung",
          !/Expected|SyntaxError|position \d+|JSON at/i.test(text));
    pruef("(1) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 1).join(" "));

    /* ---------------- (2) Speichern gegen den Torso ---------------- */
    const erg = await schreibVersuch(p, [{ id: "meins", date: "2026-07-28", category: "NOTIZ", text: "Meine Arbeit", updatedAt: "2026-07-28T09:00:00.000Z" }]);
    await p.waitForTimeout(2000);
    pruef("(2) Der Torso ist auch nach einem Speicherversuch unverändert",
          platte["kalender-daten.json"] === TORSO);
    const text2 = await p.locator("body").innerText();
    pruef("(2) Das Scheitern wird gemeldet, nicht verschwiegen",
          /unvollständig/i.test(text2), (text2.match(/Die gemeinsame Datei[^\n]{0,70}/) || ["keine Meldung"])[0]);
    // Wortlaut seit 17.08.: Die App repariert eine kaputt geschriebene Datei
    // selbst (Robertos Sackgasse vom selben Tag) - die Meldung kündigt genau
    // das an und nennt als Rückfallebene die Sicherungen.
    pruef("(2) Die Meldung sagt, was zu tun ist",
          /repariert.*automatisch|automatisch.*repar/i.test(text2) && /Sicherungen/.test(text2));
    pruef("(2) Auch hier kein roher Text des Browsers",
          !/Expected|SyntaxError|position \d+|JSON at/i.test(text2));

    /* ---------------- (4) Reparatur ---------------- */
    platte["kalender-daten.json"] = GANZ;
    const erg2 = await schreibVersuch(p, GESUND.entries.concat([
      { id: "meins", date: "2026-07-28", category: "NOTIZ", text: "Meine Arbeit", updatedAt: "2026-07-28T09:00:00.000Z" },
    ]));
    await p.waitForTimeout(2500);
    const nachher = JSON.parse(platte["kalender-daten.json"]);
    const ids = new Set(nachher.entries.map((e) => e.id));
    pruef("(4) Nach der Reparatur wird wieder gespeichert", erg2.art === "ok" && ids.has("meins"));
    pruef("(4) Der Bestand der Kollegen ist vollständig",
          ["kollege-1", "kollege-2", "kollege-3"].every((i) => ids.has(i)), nachher.entries.length + " Einträge");
    await p.context().close();
  }

  /* ---------------- (3) Plötzlich leere Datei ---------------- */
  {
    const platte = { "kalender-daten.json": GANZ };
    const p = await seite(b, platte);
    const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
    await verbinde(p);
    await p.waitForTimeout(1500);

    const vorher = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").length);
    pruef("(3) Vorbedingung: der gesunde Bestand ist lokal angekommen", vorher >= 3, vorher + " Einträge");

    // Die Datei wird auf 0 Bytes gesetzt - so sieht ein abgebrochener
    // Kopiervorgang aus.
    platte["kalender-daten.json"] = "";
    const erg = await schreibVersuch(p, [
      ...GESUND.entries,
      { id: "neu-nach-leer", date: "2026-07-28", category: "NOTIZ", text: "Nach dem Leerlauf", updatedAt: "2026-07-28T10:00:00.000Z" },
    ]);
    await p.waitForTimeout(2500);

    const nachher = JSON.parse(platte["kalender-daten.json"] || "{}");
    const ids = new Set((nachher.entries || []).map((e) => e.id));
    pruef("(3) Die leere Datei wird wieder aufgefüllt, nicht leer gelassen",
          (nachher.entries || []).length > 0, (nachher.entries || []).length + " Einträge");
    pruef("(3) Der Bestand der Kollegen ist dabei zurückgekehrt",
          ["kollege-1", "kollege-2", "kollege-3"].every((i) => ids.has(i)));
    pruef("(3) Die eigene neue Arbeit steht ebenfalls drin", ids.has("neu-nach-leer"), erg.art);

    const lokalNachher = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").length);
    pruef("(3) Die Anzeige wurde nicht leergeräumt", lokalNachher >= 3, lokalNachher + " Einträge lokal");
    pruef("(3) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 1).join(" "));
    await p.context().close();
  }

  await b.close();
  console.log(`\nHärte 35 (kaputte Datei): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})();
