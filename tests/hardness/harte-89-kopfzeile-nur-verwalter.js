// Härtetest: KOPFZEILE OBEN RECHTS NUR FÜR DEN VERWALTER (Robertos Ansage
// vom 24.09.: "alle Einstellungsmöglichkeiten oben rechts verschwinden aus
// jeder Ansicht außer Ordner-Symbol und Logout - Zugriff auf alle Menüs hat
// nur der Verwalter")
//
//  (K1) Verwalter: Drucken, Auge, Zahnrad, Monitor, Import, Export, Abmelden,
//       Ordner - alles da.
//  (K2) Bearbeiter: Ordner, Abmelden und Drucken (Morgenrunde: Schichtbericht) -
//       kein Auge (auch kein Nachtmodus-Auge), kein Zahnrad, kein Monitor,
//       kein Import/Export. Die Bereiche darunter (Schichtplan, TPM …) bleiben.
//  (K3) Leser: dasselbe wie der Bearbeiter (Ordner + Abmelden + Drucken).
//  (K4) Eine ältere Rechte-Matrix in der Datei, die dem Bearbeiter Monitor,
//       Datensicherung und Zahnrad erlaubte, zieht nicht mehr: beim Lesen
//       werden die drei auf "aus" gedrückt.
//  (K5) Rechte-Tabelle im Zahnrad: die drei Zeilen zeigen "nur Verwalter
//       (fest)" statt einer Auswahl; "Drucken" und "Störung melden" bleiben wählbar.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor hat der Bearbeiter Zahnrad, Drucken und
// Nachtmodus-Auge (K2 rot), die Matrix bietet Selects (K5 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-24";
const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Bea", rolle: "bearbeiter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }],
  // Alte Matrix: dem Bearbeiter war oben rechts alles erlaubt
  rechte: { bearbeiter: { DRUCKEN: "sehen", MONITOR: "sehen", DATEN: "sehen", ZAHNRAD: "sehen", MELDEN: "sehen" }, leser: { DRUCKEN: "sehen", MONITOR: "sehen" } },
};
const entries = [{ id: "t1", date: "2026-09-02", category: "TPM", name: "TS480", status: "done" }];
const KNOEPFE = ["Drucken", "Ansicht wechseln", "Nachtschicht-Modus", "Verwalten", "Werkstatt-Monitor", "Import", "Export", "Abmelden", "Gemeinsame Datei"];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (benutzer) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
    await p.addInitScript(({ c, e, benutzer }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
      localStorage.setItem("werkstatt-stoerungen-entries", "[]");
      localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
    }, { c: config, e: entries, benutzer });
    await p.goto(APP);
    await p.waitForTimeout(1300);
    return { p, fehler, zu: () => ctx.close() };
  };
  const knoepfe = async (p) => { const out = {}; for (const k of KNOEPFE) out[k] = await p.locator(`button[aria-label="${k}"]`).count(); return out; };
  const nur = (o, erlaubt) => KNOEPFE.every((k) => (erlaubt.includes(k) ? o[k] === 1 : o[k] === 0));
  const tab = (p, name) => p.getByRole("button", { name: new RegExp("^" + name + "\\s*\\d*$", "i") });

  {
    const { p, fehler, zu } = await seite("Chef");
    const o = await knoepfe(p);
    ok("(K1) Verwalter: Auge, Zahnrad, Monitor, Import, Export, Abmelden, Ordner (Drucken je nach Bereich)",
      nur({ ...o, Drucken: 0 }, ["Ansicht wechseln", "Verwalten", "Werkstatt-Monitor", "Import", "Export", "Abmelden", "Gemeinsame Datei"]), JSON.stringify(o));
    await tab(p, "TPM").first().click();
    await p.waitForTimeout(400);
    ok("(K1) Im TPM-Bereich hat der Verwalter auch Drucken", (await p.locator('button[aria-label="Drucken"]').count()) === 1);
    /* (K5) Matrix */
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "Benutzer & Rechte", exact: true }).click();
    await p.waitForTimeout(400);
    const matrix = await p.locator("body").innerText();
    ok("(K5) Rechte-Tabelle: Monitor, Datensicherung und Zahnrad stehen fest auf „nur Verwalter“, Drucken und Störung melden bleiben wählbar",
      (matrix.match(/nur Verwalter \(fest\)/g) || []).length === 6
      && (await p.locator('select[aria-label="Bearbeiter: Drucken"]').count()) === 1 && (await p.locator('select[aria-label="Bearbeiter: Verwalten (⚙)"]').count()) === 0
      && (await p.locator('select[aria-label="Bearbeiter: Störung melden"]').count()) === 1, String((matrix.match(/nur Verwalter \(fest\)/g) || []).length));
    ok("(E) Keine Skriptfehler (Verwalter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  {
    const { p, fehler, zu } = await seite("Bea");
    const o = await knoepfe(p);
    ok("(K2) Bearbeiter: oben rechts nur Ordner und Abmelden (Drucken erst in einem Bereich mit Vorlage)", nur(o, ["Abmelden", "Gemeinsame Datei"]), JSON.stringify(o));
    ok("(K2) Die Bereiche bleiben ihm (TPM, Berichte)", (await tab(p, "TPM").count()) > 0 && (await tab(p, "Berichte").count()) > 0);
    await tab(p, "TPM").first().click();
    await p.waitForTimeout(400);
    ok("(K2) Im TPM-Bereich hat der Bearbeiter Drucken (Matrix „sehen“) - der Schichtbericht der Morgenrunde bleibt erreichbar", (await p.locator('button[aria-label="Drucken"]').count()) === 1);
    await tab(p, "Berichte").first().click();
    await p.waitForTimeout(400);
    await tab(p, "Störungen").first().click();
    await p.waitForTimeout(400);
    ok("(K2) Berichte → Störungen: Drucken da, das Angebot nennt den Schichtbericht der letzten 3 Schichten",
      (await p.locator('button[aria-label="Drucken"]').count()) === 1 && (await (async () => { await p.locator('button[aria-label="Drucken"]').click(); await p.waitForTimeout(400); return /letzte 3 Schichten/.test(await p.locator("body").innerText()); })()));
    await p.keyboard.press("Escape");
    await p.waitForTimeout(200);
    ok("(K4) Zahnrad, Monitor, Import/Export bleiben trotz alter Matrix („sehen“) weg",
      (await p.locator('button[aria-label="Verwalten"]').count()) === 0 && (await p.locator('button[aria-label="Werkstatt-Monitor"]').count()) === 0 && (await p.locator('button[aria-label="Export"]').count()) === 0);
    ok("(E) Keine Skriptfehler (Bearbeiter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  {
    const { p, fehler, zu } = await seite("Lea");
    const o = await knoepfe(p);
    ok("(K3) Leser: oben rechts nur Ordner und Abmelden (auf der Übersicht gibt es nichts zu drucken)", nur(o, ["Abmelden", "Gemeinsame Datei"]), JSON.stringify(o));
    ok("(E) Keine Skriptfehler (Leser)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
