// Härtetest: ⚙-KARTE "DOPPELTE STÖRBERICHTE" (Robertos "Ja" zur Sofort-Liste
// vom 29.09., Punkt 2 - Folge des Doppelklick-Fehlers aus ROLLOUT Punkt 28)
//
// Bestand mit vier Fällen:
//  - Paar A: zweimal derselbe Bericht binnen 3 Sekunden, beide gleich leer
//    -> Doppel, es bleibt die KLEINERE Nummer.
//  - Paar B: dreimal derselbe Bericht binnen einer Minute, nur die mittlere
//    Kopie hat Ursache + Maßnahme -> Doppel, es bleibt die VOLLSTÄNDIGSTE.
//  - Paar C: derselbe Text, dieselbe Schicht, aber 40 Minuten auseinander
//    -> KEIN Doppel (zweimal dieselbe Störung ist im Betrieb möglich).
//  - Paar D: gleicher Text, anderes Kürzel -> KEIN Doppel.
//  (D1) Die Karte zählt 3 Doppelte in 2 Gruppen und nennt die Gruppen.
//  (D2) Der Knopf entfernt genau die 3 - es bleiben A1, B2, C1, C2, D1, D2
//       und der echte Einzelbericht.
//  (D3) Danach: keine Doppelten, kein Knopf.
//  (D4) Leser sehen die Karte ohne Knopf.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor gibt es die Karte nicht (D1 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-29";
const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }] };
const b = (id, nr, date, gemeldetAt, anlage, stoerung, melder, extra = {}) => ({ id, nr, date, schicht: "Früh", anlage, stoerung, melder, offen: false, ausfallzeit: 0, gemeldetAt, updatedAt: gemeldetAt, ursache: "", getan: "", ...extra });
const BESTAND = [
  b("a1", "2026-0010", "2026-09-28", "2026-09-28T07:10:00.000Z", "TS480", "Hubeinleger hängt", "TB"),
  b("a2", "2026-0011", "2026-09-28", "2026-09-28T07:10:03.000Z", "TS480", "Hubeinleger hängt", "TB"),
  b("b1", "2026-0012", "2026-09-28", "2026-09-28T09:00:00.000Z", "VSM2", "Band steht", "MK"),
  b("b2", "2026-0013", "2026-09-28", "2026-09-28T09:00:20.000Z", "VSM2", "Band steht", "MK", { ursache: "Sicherung", getan: "getauscht", ausfallzeit: 15 }),
  b("b3", "2026-0014", "2026-09-28", "2026-09-28T09:00:40.000Z", "VSM2", "Band steht", "MK"),
  b("c1", "2026-0015", "2026-09-28", "2026-09-28T11:00:00.000Z", "Presse 3", "Öl tropft", "TB"),
  b("c2", "2026-0016", "2026-09-28", "2026-09-28T11:40:00.000Z", "Presse 3", "Öl tropft", "TB"),
  b("d1", "2026-0017", "2026-09-28", "2026-09-28T13:00:00.000Z", "Rollenofen", "Lichtschranke", "TB"),
  b("d2", "2026-0018", "2026-09-28", "2026-09-28T13:00:05.000Z", "Rollenofen", "Lichtschranke", "MK"),
  b("e1", "2026-0019", "2026-09-29", "2026-09-29T06:00:00.000Z", "TS480", "Sensor verstellt", "TB"),
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (benutzer) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    p.on("dialog", (d) => d.accept());
    await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
    await p.addInitScript(({ c, s, u }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", "[]");
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
      localStorage.setItem("werkstatt-kalender-benutzer", u);
    }, { c: config, s: BESTAND, u: benutzer });
    await p.goto(APP);
    await p.waitForTimeout(1300);
    return { p, fehler, zu: () => ctx.close() };
  };
  const bestand = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-stoerungen-entries") || "[]"));

  /* (D1)(D2)(D3) Verwalter */
  {
    const { p, fehler, zu } = await seite("Chef");
    await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
    await p.getByRole("button", { name: /Verlauf/ }).first().click(); await p.waitForTimeout(400);
    const karte = p.locator("[data-doppelte-berichte]");
    const kt = (await karte.count()) ? (await karte.innerText()).replace(/\s+/g, " ") : "";
    ok("(D1) Die Karte „Doppelte Störberichte“ zählt 3 Doppelte von 2 Berichten",
      (await karte.getAttribute("data-doppelte-berichte")) === "3" && /3 Störberichte sind Doppelte von 2 Berichten/.test(kt), kt.slice(0, 200));
    const gruppen = await p.locator("[data-doppelt-gruppe]").evaluateAll((els) => els.map((e) => e.getAttribute("data-doppelt-gruppe") + "::" + e.textContent.replace(/\s+/g, " ")));
    ok("(D1) Gruppe A behält die kleinere Nummer 0010, weg 0011",
      gruppen.some((g) => g.startsWith("2026-0010::") && /weg: 2026-0011/.test(g)), gruppen.join(" | ").slice(0, 300));
    ok("(D1) Gruppe B behält die vollständigste Kopie 0013 (mit Ursache), weg 0012 und 0014",
      gruppen.some((g) => g.startsWith("2026-0013::") && /weg: 2026-0012, 2026-0014/.test(g)), gruppen.join(" | ").slice(0, 300));
    ok("(D1) 40 Minuten Abstand (C) und anderes Kürzel (D) sind KEINE Doppel", !gruppen.some((g) => /Öl tropft|Lichtschranke/.test(g)));
    await p.locator('button[aria-label="Doppelte Berichte entfernen"]').click(); await p.waitForTimeout(900);
    const nach = await bestand(p);
    ok("(D2) Nach dem Klick bleiben a1, b2, c1, c2, d1, d2, e1",
      nach.map((x) => x.id).sort().join(",") === "a1,b2,c1,c2,d1,d2,e1", nach.map((x) => x.id).sort().join(","));
    ok("(D3) Danach: keine Doppelten, kein Knopf",
      (await karte.getAttribute("data-doppelte-berichte")) === "0" && (await p.locator('button[aria-label="Doppelte Berichte entfernen"]').count()) === 0 && /Keine doppelt gespeicherten/.test(await karte.innerText()));
    ok("(E) Keine Skriptfehler (Verwalter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  /* (D4) Leser: Karte ohne Knopf - Leser haben kein Zahnrad, deshalb über den Verwalter im Leser-Blick */
  {
    const { p, fehler, zu } = await seite("Chef");
    await p.locator('button[aria-label="Ansicht wechseln"]').click(); await p.waitForTimeout(200);
    await p.locator('[role="menu"] [role="menuitemradio"]', { hasText: "Leser" }).click(); await p.waitForTimeout(500);
    ok("(D4) Im Leser-Blick gibt es kein Zahnrad - und damit keinen Knopf zum Entfernen",
      (await p.locator('button[aria-label="Verwalten"]').count()) === 0 && (await p.locator('button[aria-label="Doppelte Berichte entfernen"]').count()) === 0);
    ok("(E) Keine Skriptfehler (Leser-Blick)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
