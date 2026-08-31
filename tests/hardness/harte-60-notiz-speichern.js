// Härtetest: NOTIZ-SPEICHERN MIT RÜCKMELDUNG (Robertos Fund vom 31.08.:
// "der speichern button geht nicht anständig es passiert teilweise nichts").
//
// Gemessen: Gespeichert wurde immer - aber ohne jede Rückmeldung und bei
// offen bleibendem Dialog sah Erfolg aus wie Ausfall. Und wer nach dem
// Tippen erst „Gemacht" klickte und dann über ✕ schloss, verlor die Notiz
// wirklich - still.
//
//  (N1) „Notiz speichern": Der Knopf wird kurz grün „✓ Gespeichert", der
//       Dialog schließt von selbst, die Notiz steht im Bestand.
//  (N2) Beim Wieder-Öffnen steht die Notiz im Feld.
//  (N3) DER STILLE VERLUST: Notiz tippen, „Gemacht" klicken, über ✕
//       schließen - Status UND Notiz sind gespeichert.
//  (N4) Kein Fehlalarm: „Gemacht" ohne Tipperei lässt die bestehende
//       Notiz unangetastet.
//
// Hausregel erfüllt: Gegen den Build ohne die Änderung schlagen (N1) und
// (N3) fehl (keine Rückmeldung, Dialog bleibt offen; Notiz verloren).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const config = {
  tpmAnlagen: [{ id: "a1", name: "B2", role: "takt" }, { id: "a2", name: "VSM7", role: "takt" }],
  riItems: [], team: [],
};
const eintraege = [
  { id: "t1", date: "2026-08-31", category: "TPM", name: "B2", status: "open", note: "" },
  { id: "t2", date: "2026-08-31", category: "TPM", name: "VSM7", status: "open", note: "Alte Notiz bleibt" },
];

const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-31T10:00:00"));
  await p.addInitScript(({ e, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
  }, { e: eintraege, c: config });
  await p.goto(APP);
  await p.getByRole("button", { name: "TPM", exact: true }).first().waitFor({ timeout: 8000 });
  await p.waitForTimeout(900);

  // Über den Plan-Kalender an den Eintrag (Klick auf die Termin-Kachel).
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Plan", exact: true }).first().click();
  await p.waitForTimeout(1200);

  /* ---- (N1) Speichern mit Rückmeldung, Dialog schließt selbst ---- */
  await p.locator('button[data-plan-datum="2026-08-31"]', { hasText: "B2" }).first().click()
    .catch(async () => { await p.locator("button", { hasText: "B2" }).first().click(); });
  await p.waitForTimeout(500);
  await p.locator('textarea[placeholder="Notiz…"]').fill("Rep Masse.");
  await p.getByRole("button", { name: "Notiz speichern", exact: true }).click();
  await p.waitForTimeout(250);
  pruef("(N1) Der Knopf meldet sichtbar „✓ Gespeichert“",
        (await p.getByRole("button", { name: "✓ Gespeichert" }).count()) === 1);
  await p.waitForTimeout(900);
  pruef("(N1) Danach schließt der Dialog von selbst",
        (await p.locator('textarea[placeholder="Notiz…"]').count()) === 0);
  pruef("(N1) Die Notiz steht im Bestand",
        (await gespeichert(p)).find((e) => e.id === "t1").note === "Rep Masse.");

  /* ---- (N2) Wieder öffnen: Notiz steht im Feld ---- */
  await p.locator('button[data-plan-datum="2026-08-31"]', { hasText: "B2" }).first().click();
  await p.waitForTimeout(500);
  pruef("(N2) Beim Wieder-Öffnen steht die Notiz im Feld",
        (await p.locator('textarea[placeholder="Notiz…"]').inputValue()) === "Rep Masse.");

  /* ---- (N3) Der stille Verlust: tippen, „Gemacht“, ✕ ---- */
  await p.locator('textarea[placeholder="Notiz…"]').fill("Rep Masse. Dichtung neu.");
  await p.getByRole("button", { name: "✓ Gemacht", exact: true }).click();
  await p.waitForTimeout(500);
  await p.locator('button[aria-label="Schließen"]').last().click();
  await p.waitForTimeout(500);
  const t1 = (await gespeichert(p)).find((e) => e.id === "t1");
  pruef("(N3) „Gemacht“ nimmt die getippte Notiz MIT - nichts geht still verloren",
        t1.status === "done" && t1.note === "Rep Masse. Dichtung neu.",
        `status=${t1.status}, note=${t1.note}`);

  /* ---- (N4) Kein Fehlalarm: „Gemacht“ ohne Tipperei ---- */
  await p.locator('button[data-plan-datum="2026-08-31"]', { hasText: "VSM7" }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "✓ Gemacht", exact: true }).click();
  await p.waitForTimeout(500);
  const t2 = (await gespeichert(p)).find((e) => e.id === "t2");
  pruef("(N4) Ohne Tipperei bleibt die bestehende Notiz unangetastet",
        t2.status === "done" && t2.note === "Alte Notiz bleibt",
        `note=${t2.note}`);

  pruef("(N1-N4) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  await ctx.close();

  console.log(`\nHärte 60 (Notiz speichern mit Rückmeldung): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
