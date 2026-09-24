// Härtetest: KLICK AUF EINE KACHEL ÖFFNET IHRE PFLEGESTELLE (Robertos Wunsch
// vom 24.09.: "Klick auf die Kachel lässt mich die Details dazu bearbeiten,
// in diesem Fall Unfälle")
//
//  (K1) Verwalter, Whiteboard-Kacheln: die Unfälle-Kachel ist ein Knopf mit
//       Hinweis; Klick öffnet das ⚙ im Reiter "Regeln & Listen", gerollt zum
//       Abschnitt "Sicherheit – Unfälle" (Knopf "Unfall hinzufügen" im Bild).
//  (K2) Kosten-Kachel -> ⚙ Regeln & Listen, Abschnitt "Kosten & Budget".
//  (K3) Backlog-Kachel -> Berichte → Backlog; To-dos-Kachel -> Berichte → To-do;
//       TPM-Effizienz -> TPM-Plan (Monat).
//  (K4) Standard-Kacheln: "Offene Störungen" -> Berichte → Störungen.
//  (K5) Im Anordnen-Modus ist die Kachel eingefroren (kein Knopf, kein Sprung).
//  (K6) Leser: die Unfälle-Kachel ist KEIN Knopf (kein ⚙); die Störungs-
//       Kachel führt weiter zu den Störungen (die darf er sehen).
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor haben die Kacheln keine Rolle "button",
// ein Klick öffnet nichts (K1 rot).
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
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }],
  regeln: { sicherheit: { unfaelle: [] }, kosten: { budgetJahr: 0, ausgegeben: 0 } },
};
const entries = [{ id: "t1", date: "2026-09-02", category: "TPM", name: "TS480", status: "done" }];
const stoer = [{ id: "s1", nr: 401, date: HEUTE, schicht: "Früh", anlage: "TS480", stoerung: "Testlauf", offen: true, ausfallzeit: 20, melder: "T. Balles", gemeldetAt: HEUTE + "T07:00:00.000Z" }];
const whiteboard = {
  bloecke: { zahlen: false, quote: false, oee: false, uhr: false }, kacheln: ["k-wbtodo", "k-wbtpm", "k-wbunfall", "k-wbbacklog", "k-wbkosten"],
  kachelDef: { "k-wbtodo": { inhalt: "todoSollIst", form: "halbkreis", zeitraum: "monat" }, "k-wbtpm": { inhalt: "tpmQuote", form: "halbkreis", zeitraum: "monat" }, "k-wbunfall": { inhalt: "unfaelle", form: "zahl" }, "k-wbbacklog": { inhalt: "backlogLive", form: "halbkreis" }, "k-wbkosten": { inhalt: "kosten", form: "halbkreis" } }, vorlage: "whiteboard",
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (benutzer, layout) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
    await p.addInitScript(({ c, e, s, benutzer, layout }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
      localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
      if (layout) localStorage.setItem("wk-uebersicht-layout", JSON.stringify(layout));
    }, { c: config, e: entries, s: stoer, benutzer, layout });
    await p.goto(APP);
    await p.waitForTimeout(1300);
    return { p, fehler, zu: () => ctx.close() };
  };
  const kachel = (p, inhalt) => p.locator(`[data-kachel-inhalt="${inhalt}"]`).first();
  const zahnradZu = async (p) => { await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => p.keyboard.press("Escape")); await p.waitForTimeout(300); };
  const zurUebersicht = async (p) => { await p.getByRole("button", { name: /^Übersicht\s*\d*$/i }).first().click(); await p.waitForTimeout(400); };
  const sichtbarImBild = (p, sel) => p.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; }).catch(() => false);

  /* ================= Verwalter ================= */
  {
    const { p, fehler, zu } = await seite("Chef", whiteboard);
    const unf = kachel(p, "unfaelle");
    ok("(K1) Die Unfälle-Kachel ist ein Knopf mit Hinweis „Unfälle im ⚙ eintragen“",
      (await unf.getAttribute("role")) === "button" && /Unfälle im ⚙ eintragen/.test(await unf.getAttribute("aria-label")) && /Klick:/.test(await unf.getAttribute("title")));
    await unf.click();
    await p.waitForTimeout(700);
    ok("(K1) Klick öffnet das ⚙ im Reiter „Regeln & Listen“, gerollt zu „Sicherheit – Unfälle“",
      (await p.locator("#regeln-sicherheit").count()) === 1 && (await sichtbarImBild(p, "#regeln-sicherheit")) && (await p.locator('button[aria-label="Unfall hinzufügen"]').isVisible()));
    await zahnradZu(p);
    await kachel(p, "kosten").click();
    await p.waitForTimeout(700);
    ok("(K2) Kosten-Kachel -> ⚙ „Kosten & Budget“ (Jahresbudget im Bild)",
      (await sichtbarImBild(p, "#regeln-kosten")) && (await p.locator('input[aria-label="Jahresbudget"]').isVisible()));
    await zahnradZu(p);
    await kachel(p, "backlogLive").click();
    await p.waitForTimeout(500);
    const bl = await p.locator("body").innerText();
    ok("(K3) Backlog-Kachel -> Berichte → Backlog", /Backlog/i.test(bl) && (await p.getByRole("button", { name: /^Backlog\s*\d*$/i }).count()) > 0 && !/Termin-Archiv/.test(bl));
    await zurUebersicht(p);
    await kachel(p, "todoSollIst").click();
    await p.waitForTimeout(500);
    ok("(K3) To-dos-Kachel -> Berichte → To-do", /To-do/i.test(await p.locator("body").innerText()) && !/Termin-Archiv/.test(await p.locator("body").innerText()));
    await zurUebersicht(p);
    await kachel(p, "tpmQuote").click();
    await p.waitForTimeout(600);
    ok("(K3) TPM-Effizienz -> TPM-Plan (Monatsansicht)", /Auswertung/i.test(await p.locator("body").innerText()) && (await p.locator('[data-kachel-inhalt]').count()) === 0);
    await zurUebersicht(p);
    ok("(E) Keine Skriptfehler (Whiteboard)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  {
    const { p, fehler, zu } = await seite("Chef", null);
    await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Personalisieren", exact: true }).click(); await p.waitForTimeout(300);
    await p.locator('button[aria-label="Übersicht direkt anordnen"]').click(); await p.waitForTimeout(600);
    ok("(K5) Im Anordnen-Modus sind die Kacheln keine Knöpfe (eingefroren)", (await p.locator('[data-kachel-inhalt][role="button"]').count()) === 0);
    await p.keyboard.press("Escape"); await p.waitForTimeout(400);
    // Standard-Kachel „Heute fällig“ auf Offene Störungen stellen? Einfacher: die Störungs-Kachel über eine eigene Kachel
    await p.evaluate(() => { const l = JSON.parse(localStorage.getItem("wk-uebersicht-layout") || "{}"); l.kacheln = ["k-s", ...(l.kacheln || [])]; l.kachelDef = { ...(l.kachelDef || {}), "k-s": { inhalt: "stoerOffen", form: "zahl" } }; localStorage.setItem("wk-uebersicht-layout", JSON.stringify(l)); });
    await p.reload(); await p.waitForTimeout(1300);
    await kachel(p, "stoerOffen").click(); await p.waitForTimeout(500);
    // Die Störungsliste ist nach Tag eingeklappt (gemessen: "▸ Do., 24.09.2026 · 1 Eintrag"),
    // deshalb wird der Bereich über Titel und Zähler erkannt, nicht über den Störtext.
    const stoerSeite = async () => { const t = await p.locator("body").innerText(); return /STÖRBERICHTE/i.test(t) && /1 offen/.test(t) && (await p.locator('[data-kachel-inhalt]').count()) === 0; };
    ok("(K4) „Offene Störungen“ -> Berichte → Störungen (Störberichte mit 1 offen)", await stoerSeite());
    ok("(E) Keine Skriptfehler (Standard)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  /* ================= Leser ================= */
  {
    const { p, fehler, zu } = await seite("Lea", { ...whiteboard, kacheln: ["k-s", ...whiteboard.kacheln], kachelDef: { ...whiteboard.kachelDef, "k-s": { inhalt: "stoerOffen", form: "zahl" } } });
    ok("(K6) Leser: die Unfälle-Kachel ist kein Knopf (kein ⚙ für Leser)", (await kachel(p, "unfaelle").getAttribute("role")) !== "button");
    await kachel(p, "stoerOffen").click(); await p.waitForTimeout(500);
    const lt = await p.locator("body").innerText();
    ok("(K6) Leser: die Störungs-Kachel führt zu den Störungen", /STÖRBERICHTE/i.test(lt) && /1 offen/.test(lt) && (await p.locator('[data-kachel-inhalt]').count()) === 0);
    ok("(E) Keine Skriptfehler (Leser)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
