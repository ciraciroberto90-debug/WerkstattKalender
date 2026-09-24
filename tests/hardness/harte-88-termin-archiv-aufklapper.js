// Härtetest: TERMIN-ARCHIV ALS AUFKLAPPER (Robertos Wunsch vom 24.09.: "Das
// Termin-Archiv sammelt alle Aufgaben, auch Liegengeblieben - Klick öffnet
// im Dropdown dann die Termine")
//
//  (A1) Tagesliste: Liegengebliebenes steht NICHT mehr offen in der Liste;
//       die eine Archiv-Zeile nennt "3 liegengeblieben" und "2 über eine
//       Woche versäumt" und ist zugeklappt (aria-expanded false).
//  (A2) Klick klappt auf: Gruppe "Liegengeblieben (3)", darunter PitStop /
//       R+I für das Ältere mit "vor N Tagen"; Klick auf einen liegengebliebenen
//       Termin öffnet den Termin-Dialog (Verwalter).
//  (A3) Zweiter Klick klappt zu. Kein Dialog mehr (kein div[role=dialog]).
//  (A4) Leser: Zeile da, aufklappen geht, Karten gesperrt, Hinweis ohne
//       "zum Erledigen oder Verschieben".
//  (A5) Untere Zeile: die Pinnwand steckt in einer weißen Karte wie Einkauf
//       und Heute da; zwischen Tagesliste und unterer Zeile liegt Abstand.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor ist die Archiv-Zeile ein Dialog-Öffner
// ohne aria-expanded und Liegengebliebenes steht offen in der Liste (A1 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-24";
const tag = (n) => { const d = new Date(HEUTE + "T12:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const config = {
  tpmAnlagen: [{ id: "a1", name: "VSM1", role: "takt" }, { id: "a2", name: "HRO", role: "takt" }], riItems: [{ id: "r1", name: "Sprinklerwartung", rhythmus: "monat" }],
  team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }],
};
const entries = [
  // drei liegengebliebene (bis eine Woche), zwei ältere (Archiv, unter 30 Tagen)
  { id: "l1", date: tag(1), category: "TPM", name: "VSM1", status: "open" },
  { id: "l2", date: tag(3), category: "TPM", name: "HRO", status: "open" },
  { id: "l3", date: tag(6), category: "RI", name: "Sprinklerwartung", status: "open" },
  { id: "a1", date: tag(10), category: "TPM", name: "VSM1", status: "open" },
  { id: "a2", date: tag(20), category: "RI", name: "Sprinklerwartung", status: "open" },
  { id: "z1", date: tag(1), category: "NOTIZ", name: "RC", status: "open", note: "Zettel für alle", zeit: tag(1) + "T08:00:00.000Z", farbe: "gelb", sichtbar: "alle", veroeffentlicht: true },
];
const whiteboard = {
  bloecke: { neuigkeiten: false, rueckblick: false, zahlen: false, quote: false, oee: false, uhr: false, einkauf: true },
  reihenfolge: ["kennzahlen", "hauptzeile", "stoerungen", "unten", "heuteDa"], zeileUnten: true,
  kacheln: ["k-wbtodo", "k-wbtpm"], kachelDef: { "k-wbtodo": { inhalt: "todoSollIst", form: "halbkreis", zeitraum: "monat" }, "k-wbtpm": { inhalt: "tpmQuote", form: "halbkreis", zeitraum: "monat" } }, vorlage: "whiteboard",
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (benutzer, layout) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
    await p.addInitScript(({ c, e, benutzer, layout }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
      localStorage.setItem("werkstatt-stoerungen-entries", "[]");
      localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
      if (layout) localStorage.setItem("wk-uebersicht-layout", JSON.stringify(layout));
    }, { c: config, e: entries, benutzer, layout });
    await p.goto(APP);
    await p.waitForTimeout(1300);
    return { p, fehler, zu: () => ctx.close() };
  };
  const zeile = (p) => p.locator('button[aria-label="Termin-Archiv öffnen"]');
  const panel = (p) => p.locator('div[aria-label="Termin-Archiv"]');

  /* ================= Verwalter ================= */
  {
    const { p, fehler, zu } = await seite("Chef", whiteboard);
    const body = await p.locator("body").innerText();
    const zt = await zeile(p).innerText();
    ok("(A1) Liegengebliebenes steht nicht mehr offen in der Tagesliste, die Archiv-Zeile ist zu und nennt beide Zahlen",
      (await zeile(p).count()) === 1 && (await zeile(p).getAttribute("aria-expanded")) === "false" && /3 liegengeblieben/.test(zt) && /2 über eine Woche versäumt/.test(zt)
      && !/Liegengeblieben \(3\)/.test(body) && (await panel(p).count()) === 0, zt.replace(/\n/g, " | "));
    await zeile(p).click();
    await p.waitForTimeout(400);
    const pt = (await panel(p).count()) ? await panel(p).innerText() : "";
    ok("(A2) Aufgeklappt: Gruppe Liegengeblieben (3), darunter PitStop und R+I mit „vor N Tagen“, kein Dialog",
      // innerText trägt die CSS-Großschreibung der Gruppentitel mit - deshalb /i
      /Liegengeblieben \(3\)/i.test(pt) && /PitStop – geplante Wartung \(1\)/i.test(pt) && /R\+I – Rundgang & Inspektion \(1\)/i.test(pt) && /vor 10 Tagen/.test(pt) && /vor 20 Tagen/.test(pt)
      && (await zeile(p).getAttribute("aria-expanded")) === "true" && (await p.locator('[role="dialog"][aria-label="Termin-Archiv"]').count()) === 0, pt.replace(/\n/g, " | ").slice(0, 200));
    ok("(A2) Alle fünf Termine stehen als Karten drin (VSM1 ×2, HRO, Sprinklerwartung ×2)", (await panel(p).locator("button.wk-karte").count()) === 5);
    await panel(p).locator("button.wk-karte", { hasText: "HRO" }).first().click();
    await p.waitForTimeout(500);
    // Der Termin-Dialog ist eine ziehbare Karte ohne role=dialog - erkennbar an "Gemacht / Offen / Verschieben auf"
    const dialogText = await p.locator('div[style*="position: fixed"]').evaluateAll((els) => els.map((e) => e.innerText).join("\n"));
    ok("(A2) Klick auf einen liegengebliebenen Termin öffnet den Termin-Dialog (HRO · Gemacht / Verschieben)", /HRO/.test(dialogText) && /Gemacht/.test(dialogText) && /Verschieben/i.test(dialogText));
    // Termin-Karte wieder zu (Schließen-Knopf, sonst Esc) - sie läge sonst über der Archiv-Zeile
    await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => p.keyboard.press("Escape"));
    await p.waitForTimeout(400);
    await zeile(p).click();
    await p.waitForTimeout(300);
    ok("(A3) Zweiter Klick klappt zu", (await panel(p).count()) === 0 && (await zeile(p).getAttribute("aria-expanded")) === "false");

    /* (A5) Abstände in der unteren Zeile */
    const pinn = p.locator('[data-baustein="pinnwand"] > div').first();
    const pinnStil = await pinn.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, radius: s.borderTopLeftRadius }; });
    const abstand = await p.evaluate(() => {
      const archiv = document.querySelector('button[aria-label="Termin-Archiv öffnen"]').getBoundingClientRect();
      const unten = document.querySelector('[data-baustein="pinnwand"]').getBoundingClientRect();
      return Math.round(unten.top - archiv.bottom);
    });
    const koepfe = await p.evaluate(() => ["pinnwand", "einkauf", "heuteDa"].map((k) => Math.round(document.querySelector(`[data-baustein="${k}"] > div`).getBoundingClientRect().top)));
    ok("(A5) Die Pinnwand steckt unten in einer weißen Karte, alle drei Karten beginnen auf gleicher Höhe",
      pinnStil.bg === "rgb(255, 255, 255)" && parseFloat(pinnStil.radius) >= 10 && new Set(koepfe).size === 1, JSON.stringify({ pinnStil, koepfe }));
    ok("(A5) Zwischen Termin-Archiv und unterer Zeile liegen mindestens 12 px", abstand >= 12, `${abstand} px`);
    ok("(E) Keine Skriptfehler (Verwalter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  /* ================= Leser ================= */
  {
    const { p, fehler, zu } = await seite("Lea", null);
    ok("(A4) Leser sehen die Archiv-Zeile mit beiden Zahlen", (await zeile(p).count()) === 1 && /3 liegengeblieben/.test(await zeile(p).innerText()));
    await zeile(p).click();
    await p.waitForTimeout(400);
    const pt = (await panel(p).count()) ? await panel(p).innerText() : "";
    ok("(A4) Aufklappen geht, Karten sind gesperrt, Hinweis ohne „zum Erledigen oder Verschieben“",
      (await panel(p).locator("button.wk-karte:disabled").count()) === 5 && /30 Tagen/.test(pt) && !/zum Erledigen oder Verschieben/.test(pt), pt.slice(0, 120));
    ok("(E) Keine Skriptfehler (Leser)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
