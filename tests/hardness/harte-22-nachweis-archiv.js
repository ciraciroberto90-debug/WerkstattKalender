// Härtetest: PRÜFNACHWEIS und ARCHIV-ERINNERUNG.
//  (A) Nachweis: rechnet die Soll-Termine aus dem Rhythmus - NICHT aus den
//      vorhandenen Einträgen. Sonst meldete er "vollständig", obwohl in
//      Wahrheit nichts erledigt wurde (Soll-Termine sind keine Einträge).
//  (B) Nachweis: künftige Termine sind keine Versäumnisse.
//  (C) Nachweis: Rechtsgrundlagen stehen mit auf dem Blatt.
//  (D) Archiv-Erinnerung: erscheint erst ab drei Jahren Bestand.
//  (E) Archiv: Entfernen ist gesperrt, bis die Archivdatei gesichert wurde.
//  (F) Archiv: nach dem Auslagern sind alte Jahrgänge weg, neuere unberührt.
//  (G) "Später erinnern" hält die Meldung tatsächlich zurück.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const check = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };

async function mach(browser, uhr, eintraege) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.setFixedTime(new Date(uhr));
  await page.addInitScript((d) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(d));
  }, eintraege || []);
  await page.goto(APP);
  await page.waitForTimeout(1400);
  return { page, ctx };
}
const RI = (id, datum, name, status) => ({ id, date: datum, category: "RI", name, status });

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (A)(B)(C) Prüfnachweis ---- */
  {
    // Nur zwei von vielen wöchentlichen Wasserrundgängen abgehakt
    const { page, ctx } = await mach(browser, "2026-09-01T10:00:00", [
      RI("w1", "2026-01-07", "Wasserrundgang", "done"),
      RI("w2", "2026-01-14", "Wasserrundgang", "done"),
    ]);
    await page.getByRole("button", { name: "TPM", exact: true }).first().click();
    await page.waitForTimeout(600);
    // Der Nachweis steckt seit dem Umbau hinter dem Drucken-Knopf oben rechts.
    check("(A) Der Knopf zum Drucken ist da",
      (await page.locator('button[aria-label="Drucken"]').count()) === 1);
    await page.locator('button[aria-label="Drucken"]').click();
    await page.waitForTimeout(500);
    check("(A) Der Prüfnachweis steht im Druck-Dialog zur Wahl",
      (await page.getByRole("button", { name: /^Prüfnachweis 2026/ }).count()) === 1);

    const [blatt] = await Promise.all([ctx.waitForEvent("page"),
      page.locator('div[role="dialog"] button:has-text("Drucken")').click()]);
    await blatt.waitForTimeout(900);
    const t = await blatt.locator("body").innerText();

    check("(A) Meldet NICHT fälschlich 'vollständig', obwohl kaum etwas erledigt ist",
      !/·\s*vollständig/.test(t.split("\n")[3] || ""));
    check("(A) Soll-Termine kommen aus dem Rhythmus (viel mehr als die 2 Einträge)",
      /von \d{3,} bis heute fälligen Terminen/.test(t));
    check("(A) Die tatsächlich erledigten Termine sind belegt",
      t.includes("07.01.2026") && t.includes("14.01.2026"));
    check("(B) Künftige Termine werden gesondert ausgewiesen, nicht als Versäumnis",
      /noch nicht fällig/.test(t));
    check("(B) Kein Termin nach dem Erstellungstag steht unter 'versäumt'",
      !/·\s*(0[1-9]|[12]\d|3[01])\.(1[0-2])\.2026/.test(t.split("VERSÄUMT")[1] || ""));
    check("(C) Rechtsgrundlagen stehen auf dem Blatt",
      /DGUV|DIN|BetrSichV|TrinkwV|ASR/.test(t));
    check("(C) Unterschriftfelder für Werkstattleitung und Prüfer",
      /Unterschrift Werkstattleitung/.test(t) && /Unterschrift Prüfer/.test(t));
    check("(C) Erstellungsdatum ist vermerkt", /Erstellt am 01\.09\.2026/.test(t));
    await blatt.close(); await page.close();
  }

  /* ---- (D) Archiv-Erinnerung: Schwelle ---- */
  {
    // Nur zwei Jahre Bestand -> darf NICHT erscheinen
    const { page } = await mach(browser, "2026-09-01T10:00:00", [
      RI("a1", "2025-03-01", "Wasserrundgang", "done"),
      RI("a2", "2026-03-01", "Wasserrundgang", "done"),
    ]);
    await page.waitForTimeout(900);
    check("(D) Bei zwei Jahren Bestand erscheint KEINE Erinnerung",
      !/aufräumen empfohlen/i.test(await page.locator("body").innerText()));
    await page.close();
  }
  {
    // Vier Jahre Bestand -> muss erscheinen
    const { page } = await mach(browser, "2026-09-01T10:00:00", [
      RI("b1", "2022-03-01", "Wasserrundgang", "done"),
      RI("b2", "2023-03-01", "Wasserrundgang", "done"),
      RI("b3", "2026-03-01", "Wasserrundgang", "done"),
    ]);
    await page.waitForTimeout(1000);
    const t = await page.locator("body").innerText();
    check("(D) Ab drei Jahren Bestand erscheint die Erinnerung", /aufräumen empfohlen/i.test(t));
    check("(D) Sie nennt die Spanne des Bestands", /reicht 4 Jahre zurück/.test(t));
    check("(D) Und den belegten Platz", /KB/.test(t));
    await page.close();
  }

  /* ---- (E)(F) Auslagern ---- */
  {
    const { page } = await mach(browser, "2026-09-01T10:00:00", [
      RI("alt1", "2022-03-01", "Wasserrundgang", "done"),
      RI("alt2", "2023-06-01", "Wasserrundgang", "done"),
      RI("neu1", "2025-06-01", "Wasserrundgang", "done"),
      RI("neu2", "2026-06-01", "Wasserrundgang", "done"),
    ]);
    await page.waitForTimeout(1000);
    const entfernen = page.getByRole("button", { name: /Aus dem Bestand entfernen/ });
    check("(E) Der Entfernen-Knopf ist zunächst gesperrt", await entfernen.isDisabled());

    // Grenzjahr auf 2023 stellen
    await page.locator('select[aria-label="Archiv-Grenzjahr"]').selectOption("2023");
    await page.waitForTimeout(300);
    check("(E) Die Anzahl betroffener Einträge wird angezeigt",
      (await page.locator("body").innerText()).includes("betrifft 2 Einträge"));

    // Herunterladen abfangen
    const dl = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
    await page.getByRole("button", { name: /Archivdatei herunterladen/ }).click();
    const datei = await dl;
    check("(E) Es wird tatsächlich eine Archivdatei erzeugt", !!datei);
    if (datei) check("(E) Ihr Name nennt den Zeitraum", /werkstatt-archiv-bis-2023\.json/.test(datei.suggestedFilename()));
    await page.waitForTimeout(400);
    check("(E) Erst danach ist das Entfernen freigegeben", !(await entfernen.isDisabled()));

    // Entfernen bestätigen
    page.on("dialog", (d) => d.accept());
    await entfernen.click();
    await page.waitForTimeout(1200);
    const rest = await page.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
    check("(F) Alte Jahrgänge sind aus dem Bestand entfernt",
      !rest.some((e) => e.id === "alt1" || e.id === "alt2"));
    check("(F) Neuere Jahrgänge sind unberührt",
      rest.some((e) => e.id === "neu1") && rest.some((e) => e.id === "neu2"));
    check("(F) Der Hinweis schließt sich danach",
      !/aufräumen empfohlen/i.test(await page.locator("body").innerText()));
    await page.close();
  }

  /* ---- (G) Später erinnern ---- */
  {
    const eintraege = [RI("c1", "2022-03-01", "Wasserrundgang", "done"), RI("c2", "2026-03-01", "Wasserrundgang", "done")];
    const { page } = await mach(browser, "2026-09-01T10:00:00", eintraege);
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: /Später erinnern/ }).click();
    await page.waitForTimeout(400);
    check("(G) Nach 'Später erinnern' ist die Meldung weg",
      !/aufräumen empfohlen/i.test(await page.locator("body").innerText()));
    await page.reload();
    await page.waitForTimeout(1400);
    check("(G) Und sie bleibt auch nach dem Neuladen weg",
      !/aufräumen empfohlen/i.test(await page.locator("body").innerText()));
    // Ein Jahr später muss sie wiederkommen
    await page.clock.setFixedTime(new Date("2027-09-01T10:00:00"));
    await page.reload();
    await page.waitForTimeout(1500);
    check("(G) Nach Ablauf der Frist meldet sie sich erneut",
      /aufräumen empfohlen/i.test(await page.locator("body").innerText()));
    await page.close();
  }

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
