// Härtetest: ERLEDIGTE ARBEITEN BLEIBEN IN DER PLANUNG (Robertos Ansage
// vom 27.08.: "erledigt gemeldete arbeiten dürfen nicht aus der planung
// verschwinden").
//
// Der Wochenplan ist auch der Beleg, wer was an dem Tag gemacht hat.
// Vorher filterte die Zelle auf OFFENE Arbeiten - "Erledigt melden" ließ
// den Chip verschwinden, der Tag sah aus wie nie geplant.
//
//  (E1) Eine erledigte, eingeplante Arbeit steht als grüner ✓-Chip in der
//       Zelle - nicht mehr ziehbar; die offene daneben bleibt ziehbar.
//       Erledigte OHNE Einplanung tauchen in keiner Zelle auf.
//  (E2) DER KERNFALL: "Erledigt melden" im Dialog - der Chip bleibt stehen
//       und bekommt den Haken, statt zu verschwinden.
//  (E3) Klick auf den ✓-Chip öffnet die Arbeit wie gewohnt.
//  (E4) Auch das Wochen-Druckblatt der Planung zeigt die Erledigte (✓).
//
// Hausregel erfüllt: Gegen den Build ohne die Änderung schlagen (E1), (E2)
// und (E4) fehl - dort verschwindet der Chip.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }],
  riItems: [],
  team: [{ name: "A. Muster", rolle: "mech" }],
};
const eintraege = [
  { id: "b-open", date: "2026-08-24", category: "ARBEIT", name: "TS480", status: "open", note: "Ölstand prüfen", prio: "hoch", art: "mech", wer: "A. Muster", geplant: "2026-08-26", zeit: "2026-08-24T08:00:00.000Z" },
  { id: "b-done", date: "2026-08-24", category: "ARBEIT", name: "B2", status: "done", erledigtAm: "2026-08-25", note: "Filter getauscht", prio: "ohne", art: "mech", wer: "A. Muster", geplant: "2026-08-26", zeit: "2026-08-24T08:01:00.000Z" },
  { id: "b-frei", date: "2026-08-24", category: "ARBEIT", name: "HRO", status: "done", erledigtAm: "2026-08-25", note: "NIRGENDS-CHIP ohne Einplanung", prio: "ohne", art: "mech", zeit: "2026-08-24T08:02:00.000Z" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-26T10:00:00"));
  await p.addInitScript(({ e, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
  }, { e: eintraege, c: config });
  await p.goto(APP);
  await p.getByRole("button", { name: "TPM", exact: true }).first().waitFor({ timeout: 8000 });
  await p.waitForTimeout(900);
  await p.getByRole("button", { name: "Planung", exact: true }).first().click();
  await p.waitForTimeout(1000);

  const zelle = p.locator('td[data-planzelle="A. Muster|2026-08-26"]');

  /* ---- (E1) Erledigte steht grün in der Zelle ---- */
  const doneChip = zelle.locator("button", { hasText: "✓ B2: Filter getauscht" });
  pruef("(E1) Die erledigte, eingeplante Arbeit steht als ✓-Chip in der Zelle",
        (await doneChip.count()) === 1);
  pruef("(E1) Der ✓-Chip ist nicht mehr ziehbar, der offene Chip schon",
        (await doneChip.getAttribute("draggable")) === "false" &&
        (await zelle.locator("button", { hasText: "TS480: Ölstand prüfen" }).getAttribute("draggable")) === "true");
  pruef("(E1) Erledigte OHNE Einplanung tauchen in keiner Zelle auf",
        !(await p.locator("body").innerText()).includes("NIRGENDS-CHIP"));

  /* ---- (E3) Klick auf den ✓-Chip öffnet die Arbeit ---- */
  await doneChip.click();
  await p.waitForTimeout(400);
  pruef("(E3) Klick auf den ✓-Chip öffnet den Arbeit-Dialog",
        (await p.getByText("Arbeit bearbeiten").count()) === 1);
  await p.locator('button[aria-label="Schließen"]').last().click();
  await p.waitForTimeout(400);

  /* ---- (E2) Der Kernfall: Erledigt melden -> Chip bleibt ---- */
  await zelle.locator("button", { hasText: "TS480: Ölstand prüfen" }).click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Erledigt melden/ }).click();
  await p.waitForTimeout(800);
  await p.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
  await p.waitForTimeout(400);
  pruef("(E2) Nach „Erledigt melden“ bleibt der Chip stehen - jetzt mit Haken",
        (await zelle.locator("button", { hasText: "✓ TS480: Ölstand prüfen" }).count()) === 1,
        await zelle.innerText());
  pruef("(E2) Und verschwunden ist nichts: beide Chips stehen in der Zelle",
        (await zelle.locator("button", { hasText: "Filter getauscht" }).count()) === 1);

  /* ---- (E4) Wochen-Druckblatt der Planung ---- */
  await p.locator('button[aria-label="Drucken"]').click();
  await p.waitForTimeout(400);
  const [popup] = await Promise.all([
    p.waitForEvent("popup"),
    p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
  ]);
  await popup.waitForLoadState("domcontentloaded");
  await popup.waitForTimeout(400);
  const blatt = await popup.locator("body").innerText();
  pruef("(E4) Das Wochen-Druckblatt zeigt die Erledigte mit Haken",
        /✓ B2: Filter getauscht/.test(blatt) && /✓ TS480: Ölstand prüfen/.test(blatt),
        blatt.slice(0, 120));
  await popup.close();

  pruef("(E1-E4) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  await ctx.close();

  console.log(`\nHärte 59 (Erledigt bleibt im Plan): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
