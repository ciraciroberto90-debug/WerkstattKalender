// Härtetest: GRUNDEINSTELLUNGEN (Anlagen, R+I, Team, Schichtarten, Anlagenteile).
// Bis Step 1 wurden sie als EIN Block gespeichert - wer zeitgleich ein anderes
// Feld pflegte, verlor seine Änderung komplett. Jetzt liegt jedes Feld als
// eigener Eintrag in derselben Liste und wird Eintrag für Eintrag zusammengeführt.
//  (1) Zwei Bearbeiter pflegen GLEICHZEITIG verschiedene Felder -> beide bleiben
//  (2) Zwei Bearbeiter pflegen dasselbe Feld -> der Neuere gewinnt, nichts anderes kippt
//  (3) Eine Datei im ALTEN Format (config als Block) wird verlustfrei übernommen
//  (4) Fachliche Einträge und Config-Einträge vermischen sich nicht
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const check = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };
const drive = {};

async function makeUser(browser, uhr) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.setFixedTime(new Date(uhr));
  await page.exposeFunction("__fsRead", (n) => drive[n] ?? "");
  await page.exposeFunction("__fsWrite", (n, c) => { drive[n] = c; });
  await page.addInitScript(() => {
    window.__mk = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__fsRead(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__fsWrite(name, b); } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
  });
  await page.goto(APP);
  await page.waitForTimeout(900);
  return page;
}

const adopt = (p) => p.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
const setzeConfig = (p, cfg) => p.evaluate(async (c) => await window.storage.set("werkstatt-kalender-config", JSON.stringify(c)), cfg);
const setzeEntries = (p, a) => p.evaluate(async (x) => await window.storage.set("werkstatt-kalender-entries", JSON.stringify(x)), a);
const lokaleConfig = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "null"));
const lokaleEntries = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
const datei = () => JSON.parse(drive["kalender-daten.json"] || "{}");
// Config-Felder aus der Datei zurückbauen (so wie die App es tut)
function configAusDatei() {
  const d = datei();
  const out = {};
  (d.entries || []).filter((e) => String(e.id).startsWith("config|"))
    .forEach((e) => { out[String(e.id).slice(7)] = e.value; });
  return out;
}

const BASIS = {
  tpmAnlagen: [{ id: "a1", name: "BTS", role: "monday1" }],
  riItems: [{ id: "r1", name: "Regalkontrolle", type: "monatlich" }],
  team: [{ name: "R. Ciraci", rolle: "mech" }],
  extraSchichten: [],
  anlagenteile: [],
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1) Zwei Bearbeiter, verschiedene Felder, gleichzeitig ---- */
  {
    drive["kalender-daten.json"] = JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: null });
    const u1 = await makeUser(browser, "2026-07-20T09:00:00");
    await adopt(u1);
    await setzeConfig(u1, BASIS);           // Ausgangsstand anlegen
    await u1.waitForTimeout(300);

    const u2 = await makeUser(browser, "2026-07-20T09:00:02");
    await adopt(u2);                        // u2 liest denselben Stand
    await u2.waitForTimeout(300);

    // u1 pflegt das TEAM, u2 pflegt zeitgleich die R+I-PUNKTE
    await setzeConfig(u1, { ...BASIS, team: [...BASIS.team, { name: "M. Weber", rolle: "elek" }] });
    await setzeConfig(u2, { ...BASIS, riItems: [...BASIS.riItems, { id: "r2", name: "Leiterkontrolle", type: "jaehrlich" }] });
    await u1.waitForTimeout(400);

    const cfg = configAusDatei();
    check("(1) Team-Änderung von Bearbeiter 1 ist in der Datei",
      Array.isArray(cfg.team) && cfg.team.some((t) => t.name === "M. Weber"));
    check("(1) R+I-Änderung von Bearbeiter 2 ist EBENFALLS in der Datei (kein Verlust)",
      Array.isArray(cfg.riItems) && cfg.riItems.some((r) => r.id === "r2"));
    check("(1) Unbeteiligte Felder unverändert",
      Array.isArray(cfg.tpmAnlagen) && cfg.tpmAnlagen.length === 1 && cfg.tpmAnlagen[0].name === "BTS");

    await u1.close(); await u2.close();
  }

  /* ---- (2) Dasselbe Feld von beiden: Neuerer gewinnt, Rest bleibt ---- */
  {
    drive["kalender-daten.json"] = JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: null });
    const u1 = await makeUser(browser, "2026-07-20T10:00:00");
    await adopt(u1);
    await setzeConfig(u1, BASIS);
    await u1.waitForTimeout(300);

    const u2 = await makeUser(browser, "2026-07-20T10:00:02");
    await adopt(u2);
    await u2.waitForTimeout(300);

    await setzeConfig(u1, { ...BASIS, team: [{ name: "Version A", rolle: "mech" }] });
    await u1.waitForTimeout(250);
    await u2.clock.setFixedTime(new Date("2026-07-20T10:00:20"));
    await setzeConfig(u2, { ...BASIS, team: [{ name: "Version B", rolle: "mech" }] });
    await u2.waitForTimeout(400);

    const cfg = configAusDatei();
    check("(2) Bei gleichem Feld gewinnt die spätere Änderung",
      Array.isArray(cfg.team) && cfg.team.length === 1 && cfg.team[0].name === "Version B");
    check("(2) Andere Felder bleiben dabei unbeschädigt",
      Array.isArray(cfg.riItems) && cfg.riItems.length === 1 && Array.isArray(cfg.tpmAnlagen) && cfg.tpmAnlagen.length === 1);

    await u1.close(); await u2.close();
  }

  /* ---- (3) Datei im ALTEN Format wird verlustfrei übernommen ---- */
  {
    drive["kalender-daten.json"] = JSON.stringify({
      format: "werkstatt-kalender-v1",
      savedAt: "2026-01-01T00:00:00.000Z",
      entries: [{ id: "alt1", date: "2026-06-01", category: "ARBEIT", name: "Alte Arbeit", status: "open", updatedAt: "2026-06-01T00:00:00.000Z" }],
      deleted: {},
      config: { ...BASIS, updatedAt: "2026-01-01T00:00:00.000Z" }, // <- altes Block-Format
    });
    const u = await makeUser(browser, "2026-07-20T11:00:00");
    await adopt(u);
    await u.waitForTimeout(600);

    const cfg = configAusDatei();
    check("(3) Alte Block-Konfiguration in Einzel-Einträge übernommen",
      Array.isArray(cfg.team) && cfg.team[0].name === "R. Ciraci" && Array.isArray(cfg.riItems) && cfg.riItems[0].id === "r1");
    const lokal = await lokaleConfig(u);
    check("(3) App sieht die übernommene Konfiguration",
      lokal && Array.isArray(lokal.tpmAnlagen) && lokal.tpmAnlagen[0].name === "BTS");
    check("(3) Fachlicher Alt-Eintrag ging dabei nicht verloren",
      datei().entries.some((e) => e.id === "alt1"));

    await u.close();
  }

  /* ---- (4) Config-Einträge landen nie in der Terminliste der App ---- */
  {
    drive["kalender-daten.json"] = JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: null });
    const u = await makeUser(browser, "2026-07-20T12:00:00");
    await adopt(u);
    await setzeConfig(u, BASIS);
    await u.waitForTimeout(300);
    await setzeEntries(u, [{ id: "w1", date: "2026-07-21", category: "ARBEIT", name: "Werkstatt-Arbeit", status: "open", prio: "hoch" }]);
    await u.waitForTimeout(400);

    const lokal = await lokaleEntries(u);
    check("(4) Keine config|-Einträge in der Terminliste der App",
      lokal.every((e) => !String(e.id).startsWith("config|")));
    check("(4) Fachlicher Eintrag ist da", lokal.some((e) => e.id === "w1"));

    // Und der entscheidende Folgefehler: Speichern darf die Config NICHT löschen
    await setzeEntries(u, [
      { id: "w1", date: "2026-07-21", category: "ARBEIT", name: "Werkstatt-Arbeit", status: "open", prio: "hoch" },
      { id: "w2", date: "2026-07-22", category: "ARBEIT", name: "Zweite Arbeit", status: "open", prio: "hoch" },
    ]);
    await u.waitForTimeout(500);
    const cfg = configAusDatei();
    check("(4) Konfiguration überlebt weitere Speichervorgänge (keine Grabsteine)",
      Array.isArray(cfg.team) && cfg.team.length === 1 && Array.isArray(cfg.riItems) && cfg.riItems.length === 1);
    check("(4) Keine Löschmarken auf Konfigurations-Felder",
      Object.keys(datei().deleted || {}).every((id) => !String(id).startsWith("config|")));

    await u.close();
  }

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
