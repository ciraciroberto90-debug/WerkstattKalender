// Härtetest: KENNZAHL "BACKLOG-ALTER" (Whiteboard vom 23.09.: Backlog > 48 h /
// > 7 Tage / > 14 Tage; gebaut nach Robertos "Ja" zur Sofort-Liste vom
// 29.09., Punkt 5)
//
// Bestand am 29.09.: offene Backlog-Arbeiten, aufgenommen vor 1, 3, 9 und
// 20 Tagen, dazu eine ERLEDIGTE von vor 30 Tagen (zählt nicht).
//  (B1) Die Kennzahl steht im Katalog (⚙-Tabelle bietet "backlogAlter").
//  (B2) Als Zahl: große Zahl 1 (> 14 Tage), Nebenzeile "> 48 h: 3 · > 7 Tage:
//       2 · > 14 Tage: 1".
//  (B3) Als Top 3: die drei ältesten mit "seit N Tagen", die älteste zuerst.
//  (B4) Klick auf die Kachel öffnet den Backlog.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor kennt die Auswahl "backlogAlter" nicht
// (B1 rot, der Lauf bricht dort ab).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-29";
const tagVor = (n) => { const d = new Date(HEUTE + "T12:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] };
const arbeit = (id, tage, status, name) => ({ id, date: tagVor(tage), category: "ARBEIT", name, status, note: "Arbeit " + id, prio: "normal", updatedAt: tagVor(tage) + "T08:00:00.000Z", ...(status === "done" ? { erledigtAm: tagVor(tage - 1) } : {}) });
const entries = [
  arbeit("w1", 1, "open", "TS480"),
  arbeit("w3", 3, "open", "Presse 3"),
  arbeit("w9", 9, "open", "VSM2"),
  arbeit("w20", 20, "open", "Rollenofen"),
  arbeit("w30", 30, "done", "KUKA I"),
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
  await p.addInitScript(({ c, e }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-stoerungen-entries", "[]");
    localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
    // Altes Layout mit sieben Kacheln, damit die ⚙-Tabelle sieben Zeilen hat
    localStorage.setItem("wk-uebersicht-layout", JSON.stringify({ bloecke: {}, reihenfolge: ["kennzahlen", "heuteDa", "stoerungen", "hauptzeile"], kacheln: ["uhr", "zahlen", "quote", "oee"], vorlage: "eigene" }));
  }, { c: config, e: entries });
  await p.goto(APP);
  await p.waitForTimeout(1300);

  /* (B1) Katalog */
  await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Personalisieren", exact: true }).click(); await p.waitForTimeout(300);
  const region = p.locator('[role="region"][aria-label="Kennzahlen-Kacheln"]');
  const select = region.locator('select[aria-label="Inhalt Kachel 1 rechner"]');
  const optionen = await select.locator("option").evaluateAll((els) => els.map((o) => o.value));
  ok("(B1) Die Kennzahl „backlogAlter“ steht im Katalog der ⚙-Tabelle", optionen.includes("backlogAlter"), optionen.length + " Kennzahlen");
  await select.selectOption("backlogAlter"); await p.waitForTimeout(400);
  await region.locator('select[aria-label="Darstellung Kachel 1 rechner"]').selectOption("zahl"); await p.waitForTimeout(400);
  await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);

  /* (B2) Zahl */
  const kachel = p.locator('[data-kachel-inhalt="backlogAlter"]');
  const kt = (await kachel.count()) ? (await kachel.innerText()).replace(/\s+/g, " ") : "";
  ok("(B2) Die Kachel zeigt die große Zahl 1 (> 14 Tage) und die Nebenzeile > 48 h: 3 · > 7 Tage: 2 · > 14 Tage: 1",
    (await kachel.count()) === 1 && /Backlog-Alter/.test(kt) && /> 48 h: 3 · > 7 Tage: 2 · > 14 Tage: 1/.test(kt) && /(^|\s)1(\s|$)/.test(kt), kt.slice(0, 160));

  /* (B3) Top 3 */
  await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Personalisieren", exact: true }).click(); await p.waitForTimeout(300);
  await region.locator('select[aria-label="Darstellung Kachel 1 rechner"]').selectOption("top3"); await p.waitForTimeout(400);
  await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  const t3 = (await kachel.innerText()).replace(/\s+/g, " ");
  const reihenfolge = ["Rollenofen", "VSM2", "Presse 3"].map((n) => t3.indexOf(n));
  ok("(B3) Top 3: Rollenofen seit 20 Tagen zuerst, dann VSM2 (9), dann Presse 3 (3) - die 1-Tage-Arbeit fehlt",
    reihenfolge.every((i) => i >= 0) && reihenfolge[0] < reihenfolge[1] && reihenfolge[1] < reihenfolge[2] && /seit 20 Tagen/.test(t3) && !/TS480/.test(t3), t3.slice(0, 200));

  /* (B4) Klick öffnet den Backlog */
  ok("(B4) Die Kachel ist ein Knopf mit Hinweis „Backlog öffnen“", (await kachel.getAttribute("role")) === "button" && /Backlog öffnen/.test(await kachel.getAttribute("aria-label")));
  await kachel.click();
  await p.waitForTimeout(700);
  const bl = await p.locator("body").innerText();
  ok("(B4) Klick auf die Kachel öffnet Berichte → Backlog", /Backlog/i.test(bl) && (await p.getByRole("button", { name: /^Backlog\s*\d*$/i }).count()) > 0 && !/Termin-Archiv/.test(bl), bl.slice(0, 120).replace(/\n+/g, " / "));
  ok("(E) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
