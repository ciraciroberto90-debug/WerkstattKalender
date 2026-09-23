// Härtetest: WERKSTATT-MONITOR ALS TAFEL (Robertos Erklärung vom 23.09.:
// "diese Übersicht für Leser und Bearbeiter ist auch die Anzeige für den
// Werkstattmonitor")
//
//  (M1) ⚙ Monitor: neues Häkchen "Monitor zeigt die Übersicht" - aus im
//       Standard (die sieben Karten-Häkchen bleiben, harte-64 zählt weiter 7).
//  (M2) Angehakt: steht in der gemeinsamen Einstellung (config.monitor.uebersicht).
//  (M3) Monitor öffnen: statt der Karten läuft die Übersicht in der LESER-
//       Vorlage (Whiteboard: fünf Kacheln + untere Zeile), oben die schmale
//       Tafel-Leiste (Uhr, Datum, Schicht, Beenden), die Menüleiste ist weg,
//       das alte Karten-Vollbild gibt es nicht; unten laufen Störungs-Laufband
//       und Pinnwand-Laufschrift (Zettel für Alle mit 📺).
//  (M4) ESC beendet die Tafel: Menüleiste zurück, der Verwalter sieht wieder
//       SEINE Anordnung (Standard-Kacheln), kein Laufband mehr.
//  (M5) Häkchen wieder aus: der Monitor zeigt wie bisher seine Karten.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor gibt es weder das Häkchen noch die Tafel.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-23";
const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }],
};
const entries = [
  { id: "t1", date: "2026-09-02", category: "TPM", name: "TS480", status: "done" },
  { id: "t2", date: "2026-09-21", category: "TPM", name: "TS480", status: "open" },
  { id: "d1", date: "2026-09-01", category: "TODO", name: "Filter", wer: "T. Balles", bis: "2026-09-30", status: "offen" },
  { id: "z1", date: "2026-09-22", category: "NOTIZ", name: "RC", status: "open", note: "Sprinkler-Prüfung Montag sieben Uhr", zeit: "2026-09-22T08:00:00.000Z", farbe: "rosa", sichtbar: "alle", veroeffentlicht: true, monitor: true },
];
const stoer = [
  { id: "s1", nr: 401, date: "2026-09-22", schicht: "Früh", anlage: "TS480", stoerung: "Testlauf-Störung", offen: true, ausfallzeit: 20, melder: "T. Balles", gemeldetAt: "2026-09-22T08:00:00.000Z" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
  await p.addInitScript(({ c, e, s }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
    localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
  }, { c: config, e: entries, s: stoer });
  await p.goto(APP);
  await p.waitForTimeout(1300);
  const kacheln = () => p.locator("[data-kachel-inhalt]").evaluateAll((els) => els.map((e) => e.getAttribute("data-kachel-inhalt")));
  const zahnradZu = async () => { await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => p.keyboard.press("Escape")); await p.waitForTimeout(300); };
  const WHITEBOARD = "todoSollIst,tpmQuote,unfaelle,backlogLive,kosten";

  /* ---- Vorbereitung: Leser-Vorlage = Whiteboard ---- */
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Personalisieren", exact: true }).click();
  await p.waitForTimeout(300);
  const region = p.locator('[role="region"][aria-label="Kennzahlen-Kacheln"]');
  await region.locator('button[aria-label="Kacheln für Leser-Übersicht"]').click();
  await p.waitForTimeout(200);
  await region.locator('button[aria-label="Vorlage Whiteboard anlegen"]').click();
  await p.waitForTimeout(700);

  /* ---- (M1) Häkchen im Monitor-Reiter ---- */
  await p.getByRole("button", { name: "Monitor", exact: true }).click();
  await p.waitForTimeout(300);
  const schalter = p.locator('input[aria-label="Monitor zeigt die Übersicht"]');
  ok("(M1) Der Reiter Monitor hat das Häkchen „Monitor zeigt die Übersicht“ - im Standard aus, die sieben Karten-Häkchen an",
    (await schalter.count()) === 1 && !(await schalter.isChecked()) && (await p.locator('input[type="checkbox"]:checked').count()) === 7);
  await schalter.click();
  await p.waitForTimeout(700);
  const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"));
  ok("(M2) Die Wahl steht in der gemeinsamen Einstellung (monitor.uebersicht = true), die Karten-Häkchen bleiben an",
    !!cfg.monitor && cfg.monitor.uebersicht === true && cfg.monitor.crew !== false, JSON.stringify(cfg.monitor));
  await zahnradZu();
  const vorher = await kacheln();
  ok("(M3) Vor dem Monitor: der Verwalter sieht seine Standard-Kacheln (Heute fällig zuerst)", vorher[0] === "heuteFaellig", vorher.join(","));

  /* ---- (M3) Tafel ---- */
  await p.locator('button[aria-label="Werkstatt-Monitor"]').click();
  await p.waitForTimeout(1800);
  const tafel = p.locator("#werkstatt-monitor-tafel");
  ok("(M3) Die Tafel-Leiste steht oben (Uhr, Beenden), das Karten-Vollbild nicht",
    (await tafel.count()) === 1 && /10:00/.test(await tafel.innerText()) && /Beenden/.test(await tafel.innerText()) && (await p.locator("#werkstatt-monitor").count()) === 0);
  ok("(M3) Die Menüleiste ist weg (kein Zahnrad, kein Monitor-Knopf sichtbar)",
    !(await p.locator('button[aria-label="Verwalten"]').isVisible()) && !(await p.locator('button[aria-label="Werkstatt-Monitor"]').isVisible()));
  const imMonitor = await kacheln();
  ok("(M3) Auf der Tafel läuft die LESER-Vorlage: die fünf Whiteboard-Kacheln und die untere Zeile",
    imMonitor.join(",") === WHITEBOARD && (await p.locator('[data-zeile="unten"]').count()) === 1, imMonitor.join(","));
  const fuss = p.locator('[data-monitor-fuss="tafel"]');
  const fussText = (await fuss.count()) ? await fuss.innerText() : "";
  ok("(M3) Unten laufen Störungs-Laufband (Testlauf-Störung) und Pinnwand-Laufschrift (Zettel für Alle mit 📺)",
    /Testlauf-Störung/.test(fussText) && /Sprinkler-Prüfung Montag sieben Uhr/.test(fussText) && /1 offen/i.test(fussText), fussText.replace(/\n/g, " | ").slice(0, 160));

  /* ---- (M4) ESC beendet ---- */
  await p.keyboard.press("Escape");
  await p.waitForTimeout(900);
  const nachher = await kacheln();
  ok("(M4) ESC: Tafel und Laufband weg, Menüleiste zurück, der Verwalter sieht wieder seine Anordnung",
    (await tafel.count()) === 0 && (await fuss.count()) === 0 && (await p.locator('button[aria-label="Verwalten"]').isVisible()) && nachher[0] === "heuteFaellig", nachher.join(","));

  /* ---- (M5) Häkchen aus -> Karten wie bisher ---- */
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Monitor", exact: true }).click();
  await p.waitForTimeout(300);
  await p.locator('input[aria-label="Monitor zeigt die Übersicht"]').click();
  await p.waitForTimeout(600);
  await zahnradZu();
  await p.locator('button[aria-label="Werkstatt-Monitor"]').click();
  await p.waitForTimeout(800);
  ok("(M5) Ohne Häkchen zeigt der Monitor wie bisher seine Karten (Jetzt in der Werkstatt, TPM-Score)",
    (await p.locator("#werkstatt-monitor").count()) === 1 && /TPM-SCORE/i.test(await p.locator("#werkstatt-monitor").innerText()) && (await p.locator("#werkstatt-monitor-tafel").count()) === 0);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  ok("(E) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
