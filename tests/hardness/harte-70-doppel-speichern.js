// Härtetest: EXAKT GLEICHZEITIGES SPEICHERN VERLIERT NICHTS MEHR.
//
// Fund der Kollisions-Sonde vom 11.09. (bei der Tempo-Arbeit an Robertos
// „unter 5 Sekunden"): Speicherten zwei Fenster EXAKT gleichzeitig bei
// voller Menge, ging in fast jeder Runde eine der beiden Änderungen
// verloren - und BEIDE Bearbeiter bekamen „gespeichert" gemeldet. Zwei
// Ursachen, beide behoben:
//   1. savedAt ist nur millisekundengenau - zwei gleichzeitige Schreiber
//      können denselben Stempel erzeugen, die optimistische Sperre war
//      dann blind. Seit dem 11.09. trägt jeder Schreibvorgang eine
//      eindeutige Zufalls-SCHREIBMARKE, die Sperre vergleicht die Marke.
//   2. Der Heil-Blick nach dem Speichern kam einmalig nach 1,2 s - ein
//      parallel noch laufender 14-MB-Schreibvorgang landete später.
//      Jetzt prüft eine dreistufige Kette (1,2/4/10 s, je zuerst mit
//      billigem Kopf-Blick) und schreibt Verdrängtes selbst nach.
//
// Pflicht-Nachweis der Hausregel (gemessen am 11.09.): Gegen einen Bau
// OHNE Heil-Kette und Schutzpausen ist dieser Test ROT (5/9 - jede Runde
// verliert eine Änderung dauerhaft). Der Bau von VOR dem Umbau verlor im
// Sofort-Blick ebenfalls fast jede Runde, heilte aber einstufig binnen
// Sekunden - der DAUERHAFTE Verlust war eine Regression des ersten
// Tempo-Zwischenstands, die genau diese Messung gefangen hat, bevor
// irgendetwas ausgeliefert wurde.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { baueBestand, TEAM } = require("/home/user/WerkstattKalender/tools/langzeit-daten.js");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  // Voller 15-Jahre-Bestand: oberhalb der Speichergrenze gibt es keine
  // örtliche Zweitschrift - ein Verlust wäre hier ENDGÜLTIG. Genau darum
  // wird in dieser Lage gemessen.
  const { entries: BESTAND } = baueBestand({ von: "2011-07-01", bis: "2026-09-11" });
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const platte = { "kalender-daten.json": JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: "2026-09-11T05:00:00.000Z", entries: BESTAND, deleted: {}, config: null }) };

  async function fenster() {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => fehler.push(e.message));
    await p.clock.setFixedTime(new Date("2026-09-11T09:00:00"));
    await p.exposeFunction("__lies", (n) => platte[n] ?? "");
    await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
    await p.addInitScript((cfg) => {
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(cfg));
      const bau = (name) => ({ name, kind: "file",
        async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
        async createWritable() { let x = ""; return { async write(c) { x += c; }, async close() { await window.__schreib(name, x); }, async abort() {} }; },
        async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } });
      window.showOpenFilePicker = async () => [bau("kalender-daten.json")];
    }, { team: TEAM });
    await p.goto(APP);
    await p.waitForTimeout(700);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForFunction(() => !/Vorhandene Datei öffnen/.test(document.body.innerText), null, { timeout: 120000 });
    await p.waitForTimeout(1500);
    const sp = p.getByRole("button", { name: /Später erinnern/ });
    if (await sp.count()) await sp.click();
    return { p, fehler };
  }

  const { p: pA, fehler: fA } = await fenster();
  const { p: pB, fehler: fB } = await fenster();
  const speichere = (p, id) => p.evaluate(async (kennung) => {
    const roh = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
    roh.push({ id: kennung, date: "2026-09-11", category: "NOTIZ", text: kennung, updatedAt: new Date().toISOString() });
    await window.storage.set("werkstatt-kalender-entries", JSON.stringify(roh));
  }, id);

  for (let runde = 1; runde <= 3; runde++) {
    await Promise.all([speichere(pA, `r${runde}|A`), speichere(pB, `r${runde}|B`)]);
    // Ehrliche Semantik: Exakt gleichzeitige Schreiber heilen sich binnen
    // ~11 s selbst (dreistufige Nachprüfung) - der Bestand zählt DANACH.
    await pA.waitForTimeout(12000);
    const ids = new Set(JSON.parse(platte["kalender-daten.json"]).entries.map((e) => e.id));
    pruef(`(R${runde}) Änderung von Bearbeiter A ist in der Datei`, ids.has(`r${runde}|A`));
    pruef(`(R${runde}) Änderung von Bearbeiter B ist in der Datei`, ids.has(`r${runde}|B`));
  }

  const fachlich = JSON.parse(platte["kalender-daten.json"]).entries
    .filter((e) => !/^(config\||log\|)/.test(String(e.id))).length;
  pruef("(S) Kein Bestand verloren", fachlich >= BESTAND.length + 6, fachlich + " fachliche Einträge");
  pruef("(S) Keine Skriptfehler A", fA.length === 0, fA.slice(0, 2).join(" | "));
  pruef("(S) Keine Skriptfehler B", fB.length === 0, fB.slice(0, 2).join(" | "));

  await b.close();
  console.log(`\nHärte 70 (Doppel-Speichern ohne Verlust): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})();
