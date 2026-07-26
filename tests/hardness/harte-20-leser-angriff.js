// Härtetest: ANGRIFF auf den Schreibschutz.
// Nicht "klickt ein Leser versehentlich falsch", sondern: Jemand öffnet die
// Entwicklerkonsole und versucht mit Absicht, in die gemeinsame Datei zu
// schreiben. Geprüft wird die unterste Ebene - nicht die Oberfläche.
//
// Wichtig zur Einordnung: Die eigentliche Berechtigung vergibt die IT über die
// Datei-Rechte auf dem Laufwerk. Wer dort Schreibrechte hat, kann die Datei
// immer auch außerhalb der App ändern (Editor, Explorer). Diese Prüfungen
// sichern deshalb den Fall ab, der wirklich zählt: Wer KEINE Schreibrechte
// hat, darf über die App auf keinem Weg fremde Daten verändern.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const check = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };

const ORIGINAL = JSON.stringify({
  format: "werkstatt-kalender-v1",
  savedAt: "2026-01-01T00:00:00.000Z",
  deleted: {},
  config: null,
  entries: [
    { id: "echt1", date: "2026-07-10", category: "ARBEIT", name: "Original-Arbeit", status: "open", prio: "hoch", updatedAt: "2026-07-01T00:00:00.000Z" },
    { id: "config|team", date: "", value: [{ name: "R. Ciraci", rolle: "mech" }], updatedAt: "2026-07-01T00:00:00.000Z" },
  ],
});

// Datei OHNE Schreibrecht (wie von der IT vergeben): createWritable schlägt fehl.
async function macheLeser(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.exposeFunction("__lies", () => globalThis.__datei);
  await page.exposeFunction("__schreib", (c) => { globalThis.__schreibversuch = c; });
  await page.addInitScript(() => {
    window.__mk = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__lies(); return new File([t], name, { type: "application/json" }); },
      async createWritable() { throw new DOMException("Kein Schreibrecht", "NotAllowedError"); },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    window.showOpenFilePicker = async () => [window.__mk("kalender-daten.json")];
    window.showSaveFilePicker = async () => window.__mk("kalender-daten.json");
  });
  await page.goto(APP);
  await page.waitForTimeout(900);
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  globalThis.__datei = ORIGINAL;
  globalThis.__schreibversuch = null;

  const p = await macheLeser(browser);
  // Datei verbinden - die App muss dabei selbst merken, dass sie nicht schreiben darf
  await p.evaluate(async () => { try { await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"); } catch (e) {} });
  await p.waitForTimeout(600);

  check("(0) App hat sich selbst auf Nur-Lesen zurückgestuft",
    await p.evaluate(() => !window.__wkSharedTest.canWrite()));
  check("(0) Datei ist unverändert nach dem Verbinden", globalThis.__datei === ORIGINAL);

  /* ---- Angriff 1: direkt die Speicher-Schnittstelle aufrufen ---- */
  await p.evaluate(async () => {
    await window.storage.set("werkstatt-kalender-entries", JSON.stringify([
      { id: "boese1", date: "2026-07-11", category: "ARBEIT", name: "Eingeschmuggelt", status: "open", prio: "hoch" },
    ]));
  });
  await p.waitForTimeout(500);
  check("(1) Direkter Aufruf der Speicher-Schnittstelle ändert die Datei NICHT",
    globalThis.__datei === ORIGINAL && globalThis.__schreibversuch === null);

  /* ---- Angriff 2: die Sync-Funktion direkt aufrufen ---- */
  const ergebnis2 = await p.evaluate(async () => {
    try {
      const r = await window.__wkSharedTest.save([{ id: "boese2", date: "2026-07-12", category: "ARBEIT", name: "Direkt", status: "open" }], []);
      return r === null ? "abgelehnt" : "DURCHGELASSEN";
    } catch (e) { return "abgelehnt"; }
  });
  check("(2) Direkter Aufruf der Speicher-Funktion wird abgelehnt", ergebnis2 === "abgelehnt");
  check("(2) Datei weiterhin unverändert", globalThis.__datei === ORIGINAL);

  /* ---- Angriff 3: Grundeinstellungen überschreiben ---- */
  await p.evaluate(async () => {
    await window.storage.set("werkstatt-kalender-config", JSON.stringify({ team: [{ name: "Eindringling", rolle: "mech" }] }));
  });
  await p.waitForTimeout(500);
  check("(3) Grundeinstellungen lassen sich nicht in die Datei schreiben", globalThis.__datei === ORIGINAL);

  /* ---- Angriff 4: Abgleich anstoßen, um ein Schreiben zu erzwingen ---- */
  await p.evaluate(async () => { try { await window.__wkSharedTest.poll(); } catch (e) {} });
  await p.waitForTimeout(600);
  check("(4) Erzwungener Abgleich schreibt nicht", globalThis.__datei === ORIGINAL);

  /* ---- Angriff 5: Zugriffsart im laufenden Betrieb hochstufen ---- */
  const ergebnis5 = await p.evaluate(async () => {
    try {
      // Erneut übernehmen und dabei "readwrite" behaupten
      await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite");
    } catch (e) { /* erwartbar */ }
    return window.__wkSharedTest.canWrite();
  });
  await p.waitForTimeout(500);
  check("(5) Hochstufen auf Schreibrecht gelingt nicht (Datei bleibt maßgeblich)", ergebnis5 === false);
  check("(5) Datei nach allen Versuchen unverändert", globalThis.__datei === ORIGINAL);

  /* ---- Angriff 6: lokale Sicht verbiegen und neu laden ---- */
  await p.evaluate(() => {
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([
      { id: "boese3", date: "2026-07-13", category: "ARBEIT", name: "Ueber Neuladen", status: "open", prio: "hoch", updatedAt: "2099-01-01T00:00:00.000Z" },
    ]));
  });
  await p.reload();
  await p.waitForTimeout(1400);
  await p.evaluate(async () => { try { await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"); } catch (e) {} });
  await p.waitForTimeout(700);
  check("(6) Verbogener lokaler Bestand gelangt beim Neuladen NICHT in die Datei",
    globalThis.__datei === ORIGINAL);
  check("(6) Auch kein Eintrag mit Zukunfts-Zeitstempel", !String(globalThis.__datei).includes("boese3"));

  /* ---- Angriff 7: Verlauf fälschen ---- */
  await p.evaluate(async () => {
    await window.storage.set("werkstatt-kalender-entries", JSON.stringify([
      { id: "log|2026-07-01T00:00:00.000Z-faelsch", date: "2026-07-01", ts: "2026-07-01T00:00:00.000Z", wer: "Jemand anderes", was: "gelöscht: alles" },
    ]));
  });
  await p.waitForTimeout(500);
  check("(7) Gefälschte Verlaufszeile landet nicht in der Datei",
    !String(globalThis.__datei).includes("Jemand anderes"));

  /* ---- Gegenprobe: mit echtem Schreibrecht klappt es sehr wohl ---- */
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage({ viewport: { width: 1400, height: 1000 } });
  await p2.exposeFunction("__lies", () => globalThis.__datei);
  await p2.exposeFunction("__schreib", (c) => { globalThis.__datei = c; });
  await p2.addInitScript(() => {
    window.__mk = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__lies(); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib(b); } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
  });
  await p2.goto(APP);
  await p2.waitForTimeout(900);
  await p2.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
  await p2.evaluate(async () => {
    await window.storage.set("werkstatt-kalender-entries", JSON.stringify([
      { id: "echt1", date: "2026-07-10", category: "ARBEIT", name: "Original-Arbeit", status: "open", prio: "hoch" },
      { id: "erlaubt", date: "2026-07-14", category: "ARBEIT", name: "Mit Schreibrecht", status: "open", prio: "hoch" },
    ]));
  });
  await p2.waitForTimeout(600);
  check("(G) Gegenprobe: mit echtem Schreibrecht wird sehr wohl geschrieben",
    String(globalThis.__datei).includes("Mit Schreibrecht"));
  check("(G) Der Original-Eintrag blieb dabei erhalten",
    String(globalThis.__datei).includes("Original-Arbeit"));

  /* ---- Betriebsfall: Schreibrecht wird MITTEN IN DER SITZUNG entzogen ---- */
  // Realistischer als jeder Angriff: Die IT ändert die Freigabe, während
  // jemand die App offen hat. Ab da darf nichts mehr in die Datei gelangen,
  // und der Bearbeiter muss es erfahren - stilles Weiterarbeiten wäre der
  // schlimmste Ausgang (er hielte seine Arbeit für gesichert).
  {
    globalThis.__datei = ORIGINAL;
    let schreibenErlaubt = true;
    const ctx3 = await browser.newContext();
    const p3 = await ctx3.newPage({ viewport: { width: 1400, height: 1000 } });
    p3.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await p3.exposeFunction("__lies", () => globalThis.__datei);
    await p3.exposeFunction("__schreib", (c) => { globalThis.__datei = c; });
    await p3.exposeFunction("__darfSchreiben", () => schreibenErlaubt);
    await p3.addInitScript(() => {
      window.__mk = (name) => ({
        name, kind: "file",
        async getFile() { const t = await window.__lies(); return new File([t], name, { type: "application/json" }); },
        async createWritable() {
          if (!(await window.__darfSchreiben())) throw new DOMException("Kein Schreibrecht mehr", "NotAllowedError");
          let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib(b); } };
        },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      });
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    });
    await p3.goto(APP);
    await p3.waitForTimeout(900);
    await p3.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
    await p3.evaluate(async () => {
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify([
        { id: "vorher", date: "2026-07-15", category: "ARBEIT", name: "Noch mit Recht", status: "open", prio: "hoch" },
      ]));
    });
    await p3.waitForTimeout(600);
    check("(E) Solange das Recht besteht, wird geschrieben", String(globalThis.__datei).includes("Noch mit Recht"));

    const standVorEntzug = globalThis.__datei;
    schreibenErlaubt = false; // <- die IT entzieht das Recht

    await p3.evaluate(async () => {
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify([
        { id: "vorher", date: "2026-07-15", category: "ARBEIT", name: "Noch mit Recht", status: "open", prio: "hoch" },
        { id: "danach", date: "2026-07-16", category: "ARBEIT", name: "Nach Entzug", status: "open", prio: "hoch" },
      ]));
    });
    await p3.waitForTimeout(4000); // Wiederholversuche der Sync-Schicht abwarten

    check("(E) Nach dem Entzug gelangt nichts mehr in die Datei",
      globalThis.__datei === standVorEntzug && !String(globalThis.__datei).includes("Nach Entzug"));
    const sichtbar = await p3.locator("body").innerText();
    check("(E) Der Bearbeiter wird deutlich gewarnt (kein stilles Scheitern)",
      /nicht sicher|konnte nicht|Schreibschutz|nur ansehen|nicht gespeichert/i.test(sichtbar));
    check("(E) Die eigene Arbeit ist lokal weiterhin vorhanden",
      await p3.evaluate(() => (localStorage.getItem("werkstatt-kalender-entries") || "").includes("Nach Entzug")));

    await p3.close();
  }

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
