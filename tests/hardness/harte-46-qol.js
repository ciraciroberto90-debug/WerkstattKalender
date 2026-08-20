// Härtetest: QOL-RUNDE VOM 19.08. (Robertos Auswahl 1, 4, 5, 6).
//
//  (1) LÖSCH-RÜCKFRAGE: Der Löschen-Knopf im Termin-Dialog fragt erst nach
//      (vorher löschte ein Fehlklick sofort). Abbrechen = Termin bleibt,
//      Bestätigen = Termin weg.
//  (4) EIN-KLICK-ABHAKEN: Der grüne Haken auf der Plan-Kachel erledigt den
//      Termin sofort - auch einen rein errechneten Slot (er wird dabei als
//      echter, erledigter Eintrag angelegt). Leser bekommen keinen Haken.
//  (5) HEUTE-KNOPF: Nach dem Wegblättern führt ein Klick zurück zum
//      aktuellen Monat; im aktuellen Monat gibt es den Knopf nicht (ein
//      toter Knopf wäre Deko). Gleiches im Jahr.
//  (6) ÜBERFÄLLIG-BADGE: Der TPM-Hauptreiter trägt einen roten Zähler wie
//      der Störungs-Reiter - und heißt für Klicks/Vorleser trotzdem
//      weiterhin exakt "TPM" (aria-hidden), sonst bräche jede Suite.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }],
  riItems: [{ id: "r1", name: "Wasserrundgang", type: "weekly", weekday: 1 }],
  team: [],
};

async function start(browser, eintraege, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-18T10:00:00"));
  await p.addInitScript(({ e, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
  }, { e: eintraege, c: config });
  await p.goto(APP);
  await p.waitForTimeout(1000);
  return { p, ctx, fehler };
}
const inPlan = async (p) => {
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Plan", exact: true }).first().click();
  await p.waitForTimeout(1200);
};
const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1) Lösch-Rückfrage ---- */
  {
    const { p, ctx } = await start(browser, [
      { id: "t1", date: "2026-08-18", category: "TPM", name: "TS480", status: "open" },
    ]);
    await inPlan(p);
    await p.locator('[data-plan-datum="2026-08-18"]').first().click();
    await p.waitForTimeout(500);

    // Erst ABBRECHEN: der Termin muss überleben.
    let frage = "";
    p.once("dialog", (d) => { frage = d.message(); d.dismiss(); });
    await p.getByRole("button", { name: "Löschen", exact: true }).click();
    await p.waitForTimeout(400);
    pruef("(1) Löschen fragt erst nach", frage.length > 0, frage);
    pruef("(1) Die Frage nennt den Termin", /TS480/.test(frage) && /18\.08\.2026/.test(frage), frage);
    pruef("(1) Abbrechen: der Termin bleibt", (await gespeichert(p)).length === 1);

    // Dann BESTÄTIGEN: jetzt darf er gehen.
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "Löschen", exact: true }).click();
    await p.waitForTimeout(500);
    pruef("(1) Bestätigen: der Termin ist weg", (await gespeichert(p)).length === 0);
    await ctx.close();
  }

  /* ---- (4) Ein-Klick-Abhaken ---- */
  {
    const { p, ctx, fehler } = await start(browser, [
      { id: "t1", date: "2026-08-18", category: "TPM", name: "TS480", status: "open" },
    ]);
    await inPlan(p);
    // Echter offener Eintrag: ein Klick auf den Haken erledigt ihn.
    await p.getByRole("button", { name: /TS480 am 18\.08\.2026 als erledigt abhaken/ }).click();
    await p.waitForTimeout(500);
    const nachher = await gespeichert(p);
    pruef("(4) Ein Klick erledigt den echten Termin",
          nachher.length === 1 && nachher[0].status === "done", JSON.stringify(nachher[0] || null));
    pruef("(4) Die Kachel zeigt jetzt den grünen Haken",
          /✓\s*TS480/.test(await p.locator('[data-plan-datum="2026-08-18"]').first().innerText()));
    pruef("(4) Der Abhak-Knopf verschwindet nach dem Abhaken",
          (await p.getByRole("button", { name: /TS480 am 18\.08\.2026 als erledigt/ }).count()) === 0);

    // Errechneter Slot (Wasserrundgang Montag 24.08.): Abhaken legt den
    // Eintrag als echten, erledigten an.
    await p.getByRole("button", { name: /Wasserrundgang am 24\.08\.2026 als erledigt abhaken/ }).click();
    await p.waitForTimeout(500);
    const mitSlot = await gespeichert(p);
    const slot = mitSlot.find((e) => e.date === "2026-08-24");
    pruef("(4) Auch ein errechneter Slot lässt sich abhaken (wird echter Eintrag)",
          !!slot && slot.status === "done" && slot.category === "RI", JSON.stringify(slot || null));
    pruef("(4) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (4b) Leser bekommen keinen Abhak-Knopf ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date("2026-08-18T10:00:00"));
    const daten = { format: "werkstatt-kalender-v1", savedAt: "2026-08-01T00:00:00.000Z",
      entries: [{ id: "t1", date: "2026-08-18", category: "TPM", name: "TS480", status: "open", updatedAt: "2026-08-01T00:00:00.000Z" }],
      deleted: {}, config };
    await p.exposeFunction("__r", () => JSON.stringify(daten));
    await p.addInitScript(() => {
      const h = {
        name: "kalender-daten.json", kind: "file",
        async getFile() { return new File([await window.__r()], "kalender-daten.json", { type: "application/json" }); },
        async createWritable() { throw new Error("NotAllowedError"); },
        async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [h];
    });
    await p.goto(APP);
    await p.waitForTimeout(1200);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click().catch(() => {});
    const vo = p.getByText("Vorhandene Datei öffnen …");
    if (await vo.count()) await vo.click();
    await p.waitForTimeout(1300);
    await p.getByRole("button", { name: "TPM", exact: true }).first().click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "Plan", exact: true }).first().click();
    await p.waitForTimeout(1200);
    pruef("(4b) Leser sehen die Kachel, aber keinen Abhak-Knopf",
          (await p.locator('[data-plan-datum="2026-08-18"]').count()) > 0 &&
          (await p.getByRole("button", { name: /als erledigt abhaken/ }).count()) === 0);
    await ctx.close();
  }

  /* ---- (5) Heute-Knopf ---- */
  {
    const { p, ctx } = await start(browser, []);
    await inPlan(p);
    pruef("(5) Im aktuellen Monat gibt es keinen Heute-Knopf",
          (await p.getByRole("button", { name: "Heute", exact: true }).count()) === 0);
    await p.locator('button[aria-label="Nächster Monat"]').click();
    await p.locator('button[aria-label="Nächster Monat"]').click();
    await p.waitForTimeout(400);
    pruef("(5) Nach dem Wegblättern erscheint er",
          (await p.getByRole("button", { name: "Heute", exact: true }).count()) === 1);
    await p.getByRole("button", { name: "Heute", exact: true }).click();
    await p.waitForTimeout(400);
    pruef("(5) Ein Klick führt zurück zum aktuellen Monat",
          /August 2026/.test(await p.locator("body").innerText()));
    pruef("(5) Danach verschwindet der Knopf wieder",
          (await p.getByRole("button", { name: "Heute", exact: true }).count()) === 0);
    // Jahres-Sicht (der Umschalter sitzt in der Auswertungs-Ausklappleiste)
    await p.getByRole("button", { name: /Auswertung.*Druckvorlagen/ }).first().click();
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: /^Jahr$/ }).first().click();
    await p.waitForTimeout(500);
    await p.locator('button[aria-label="Nächstes Jahr"]').click();
    await p.waitForTimeout(300);
    pruef("(5) Auch im Jahr: weggeblättert = Heute-Knopf da",
          (await p.getByRole("button", { name: "Heute", exact: true }).count()) === 1);
    await p.getByRole("button", { name: "Heute", exact: true }).click();
    await p.waitForTimeout(300);
    pruef("(5) Und er führt zurück ins laufende Jahr",
          (await p.getByRole("button", { name: "Heute", exact: true }).count()) === 0);
    await ctx.close();
  }

  /* ---- (6) Überfällig-Badge am TPM-Reiter ----
     Am 19.08. eingebaut, am 20.08. auf Robertos Wunsch WIEDER ENTFERNT.
     Geprüft wird seither das Gegenteil: Der Reiter bleibt auch mit
     Überfälligen ein schlichtes "TPM" - Liegengebliebenes steht in der
     TPM-Übersicht und im Termin-Archiv. */
  {
    const { p, ctx } = await start(browser, [
      { id: "u1", date: "2026-08-12", category: "TPM", name: "TS480", status: "open" },
      { id: "u2", date: "2026-08-14", category: "RI", name: "Wasserrundgang", status: "open" },
      { id: "u3", date: "2026-08-17", category: "RI", name: "Wasserrundgang", status: "open" },
    ]);
    const tpmKnopf = p.getByRole("button", { name: "TPM", exact: true }).first();
    pruef("(6) Der TPM-Reiter trägt auch mit Überfälligen KEIN Badge (Robertos Wunsch vom 20.08.)",
          (await tpmKnopf.count()) === 1 && (await tpmKnopf.innerText()).replace(/\s+/g, " ").trim() === "TPM");
    await ctx.close();
  }

  console.log(`\nHärte 46 (QoL-Runde 19.08.): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
