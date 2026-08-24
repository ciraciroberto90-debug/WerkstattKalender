// Härtetest: KLASSISCHE DIALOGE VERSCHIEBBAR (Vormerkung 0, Robertos
// "gehe es an" vom 24.08.).
//
//  (Z1) Der Termin-Dialog trägt die ⠿-Lasche und lässt sich daran
//       pixelgenau verschieben.
//  (Z2) Die Ecke unten rechts ändert die Größe der Karte.
//  (Z3) BEWUSST kein Merken: Nach Schließen und Neu-Öffnen steht der
//       Dialog wieder mittig in Ausgangsgröße.
//  (Z4) Die Knöpfe bleiben voll bedienbar - auch nach dem Verschieben
//       (die Lasche liegt AUSSERHALB der Karte und überdeckt nichts).
//  (Z5) Ziehen mit der Maus IN einem Eingabefeld (Text markieren)
//       verschiebt den Dialog NICHT.
//  (Z6) Klick auf die Karte schließt nicht, Klick daneben (Overlay)
//       schließt weiterhin - wie vor dem Umbau.
//  (Z7) Auch Arbeit-Dialog, Störbericht und ⚙-Verwalten tragen die Lasche
//       (alle 21 Dialog-Karten laufen über dieselbe Grundlage).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

async function start(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-24T10:00:00"));
  await p.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([
      { id: "t1", date: "2026-08-24", category: "TPM", name: "TS480", status: "open" },
      { id: "b1", date: "2026-08-20", category: "ARBEIT", name: "TS480", status: "open", note: "Lagerschaden an der Umlenkrolle", prio: "hoch", art: "mech", zeit: "2026-08-20T09:41:00.000Z" },
    ]));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
      tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [],
      team: [{ name: "M. Weber", rolle: "mech" }],
    }));
  });
  await p.goto(APP);
  await p.waitForTimeout(1000);
  return { p, ctx, fehler };
}
const lasche = (p) => p.locator('div[title="Dialog verschieben"]');
const karteMasse = (p) => p.evaluate(() => {
  const l = document.querySelector('div[title="Dialog verschieben"]');
  const r = l.parentElement.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
});
const oeffneTermin = async (p) => {
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Plan", exact: true }).first().click();
  await p.waitForTimeout(1000);
  await p.locator('button[data-plan-datum="2026-08-24"]', { hasText: "TS480" }).first().click();
  await p.waitForTimeout(500);
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (Z1) bis (Z6): der Termin-Dialog als Musterfall ---- */
  {
    const { p, ctx, fehler } = await start(browser);
    await oeffneTermin(p);
    pruef("(Z1) Der Termin-Dialog trägt die ⠿-Lasche", (await lasche(p).count()) === 1);
    const vorher = await karteMasse(p);

    // Verschieben an der Lasche
    const lb = await lasche(p).boundingBox();
    await p.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await p.mouse.down();
    await p.mouse.move(lb.x + lb.width / 2 - 220, lb.y + lb.height / 2 + 90, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    const verschoben = await karteMasse(p);
    pruef("(Z1) Ziehen an der Lasche verschiebt den Dialog pixelgenau",
          verschoben.x - vorher.x === -220 && verschoben.y - vorher.y === 90,
          `dx=${verschoben.x - vorher.x} dy=${verschoben.y - vorher.y}`);

    // (Z4) Nach dem Verschieben voll bedienbar: "Gemacht" hakt ab
    await p.getByRole("button", { name: /Gemacht/ }).click();
    await p.waitForTimeout(500);
    const stand = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
    pruef("(Z4) Knöpfe funktionieren nach dem Verschieben (Abhaken wirkt)",
          stand.find((e) => e.id === "t1").status === "done");
    // Der Dialog bleibt nach "Gemacht" bewusst offen (Notiz/Löschen) - schließen.
    await p.locator('button[aria-label="Schließen"]').last().click();
    await p.waitForTimeout(300);

    // (Z2) Größe an der Ecke - Dialog wieder öffnen
    await p.locator('button[data-plan-datum="2026-08-24"]', { hasText: "TS480" }).first().click();
    await p.waitForTimeout(500);
    const norm = await karteMasse(p);
    const ecke = await p.locator('div[title="Größe ändern"]').boundingBox();
    await p.mouse.move(ecke.x + 9, ecke.y + 9);
    await p.mouse.down();
    await p.mouse.move(ecke.x + 9 + 160, ecke.y + 9 + 70, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    const gross = await karteMasse(p);
    pruef("(Z2) Die Ecke unten rechts ändert die Größe",
          gross.w - norm.w === 160 && gross.h - norm.h === 70,
          `dw=${gross.w - norm.w} dh=${gross.h - norm.h}`);

    // (Z3) Schließen + neu öffnen: wieder mittig, wieder Ausgangsgröße
    await p.locator('button[aria-label="Schließen"]').last().click();
    await p.waitForTimeout(300);
    await p.locator('button[data-plan-datum="2026-08-24"]', { hasText: "TS480" }).first().click();
    await p.waitForTimeout(500);
    const frisch = await karteMasse(p);
    pruef("(Z3) Neu geöffnet steht er wieder mittig in Ausgangsgröße",
          Math.abs(frisch.x - norm.x) < 2 && Math.abs(frisch.y - norm.y) < 2 &&
          Math.abs(frisch.w - norm.w) < 2 && Math.abs(frisch.h - norm.h) < 2,
          JSON.stringify({ vorher: norm, frisch }));

    // (Z5) Maus-Ziehen im Eingabefeld verschiebt nichts (Text markieren bleibt Text markieren)
    const notiz = await p.locator('textarea[placeholder="Notiz…"]').boundingBox();
    const vorFeld = await karteMasse(p);
    await p.mouse.move(notiz.x + 30, notiz.y + 14);
    await p.mouse.down();
    await p.mouse.move(notiz.x + 140, notiz.y + 40, { steps: 4 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    const nachFeld = await karteMasse(p);
    pruef("(Z5) Ziehen im Eingabefeld verschiebt den Dialog nicht",
          vorFeld.x === nachFeld.x && vorFeld.y === nachFeld.y);

    // (Z6) Klick auf die Karte schließt nicht, Klick aufs Overlay schon
    await p.mouse.click(vorFeld.x + 40, vorFeld.y + 8); // Kopfbereich der Karte (kein Knopf)
    await p.waitForTimeout(300);
    pruef("(Z6) Klick auf die Karte lässt den Dialog offen", (await lasche(p).count()) === 1);
    await p.mouse.click(30, 950); // weit außerhalb: Overlay
    await p.waitForTimeout(300);
    pruef("(Z6) Klick daneben schließt weiterhin", (await lasche(p).count()) === 0);
    pruef("(Z1-Z6) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (Z7) Dieselbe Lasche an Arbeit, Störbericht und ⚙ ---- */
  {
    const { p, ctx, fehler } = await start(browser);
    // Arbeit-Dialog
    await p.getByRole("button", { name: "Backlog", exact: true }).first().click();
    await p.waitForTimeout(600);
    await p.getByText("Lagerschaden an der Umlenkrolle").first().click();
    await p.waitForTimeout(500);
    pruef("(Z7) Arbeit-Dialog trägt die Lasche", (await lasche(p).count()) === 1);
    await p.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await p.waitForTimeout(300);
    // Störbericht
    await p.getByRole("button", { name: /^Störungen/ }).first().click();
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: "📝 Störbericht erfassen" }).first().click();
    await p.waitForTimeout(500);
    pruef("(Z7) Störbericht trägt die Lasche", (await lasche(p).count()) === 1);
    await p.locator('button[aria-label="Schließen"]').last().click();
    await p.waitForTimeout(300);
    // ⚙-Verwalten
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(500);
    pruef("(Z7) ⚙-Verwalten trägt die Lasche", (await lasche(p).count()) === 1);
    // und lässt sich verschieben
    const vorher = await karteMasse(p);
    const lb = await lasche(p).boundingBox();
    await p.mouse.move(lb.x + 20, lb.y + 8);
    await p.mouse.down();
    await p.mouse.move(lb.x + 20 + 180, lb.y + 8 - 40, { steps: 5 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    const nachher = await karteMasse(p);
    pruef("(Z7) Auch ⚙ wandert pixelgenau mit",
          nachher.x - vorher.x === 180 && nachher.y - vorher.y === -40,
          `dx=${nachher.x - vorher.x} dy=${nachher.y - vorher.y}`);
    pruef("(Z7) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  console.log(`\nHärte 53 (Dialoge ziehbar): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
