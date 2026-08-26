// Härtetest: REGELTERMINE + TERMIN-ARCHIV FÜR LESER + 30-TAGE-RÄUMUNG
// (Robertos Wünsche vom 24.08.).
//
//  (R1) Anlege-Dialog: eigener TERMIN-Knopf mit Titel, Wiederholung und
//       Pinnwand-Haken - OHNE Gemacht/Offen-Toggle, "bis" schlägt +3 Monate vor.
//  (R2) "Jede Woche" legt ECHTE Einträge mit gemeinsamer serieId an, der
//       Pinnwand-Haken genau EINEN veröffentlichten Zettel.
//  (R3) Der heutige Termin informiert wie R+I: lila Karte in der Tagesliste,
//       Kachel im Monats-Kalender, sichtbar im Kalender-Fenster.
//  (R4) Termine zählen NICHT in die Wartungs-Auswertung - nachgerechnet am
//       gedruckten Blatt, nicht nur behauptet.
//  (R5) "Ganze Reihe löschen" entfernt alle Termine der Reihe auf einmal.
//  (R6) 30-Tage-Regel: Vergangene REGELTERMINE werden beim Laden wirklich
//       gelöscht (einmal am Tag, Marker). Versäumte TPM/R+I verschwinden
//       nur aus der Archiv-ANZEIGE - im Bestand bleiben sie, und das
//       Druckblatt zählt sie weiter ("nachvollziehbar unter TPM", Roberto).
//  (R7) LESER sehen Termin-Karte und Termin-Archiv (nur ansehen) - aber sie
//       räumen NICHT, denn Nur-Leser schreiben nie.
//
// Hausregel erfüllt: Gegen den Build vor dem Einbau schlägt der Test fehl -
// dort gibt es weder den TERMIN-Knopf noch Archiv für Leser noch die Räumung.
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

async function start(browser, eintraege, uhr) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.clock.setFixedTime(new Date(uhr));
  await p.addInitScript(({ e, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
  }, { e: eintraege, c: config });
  await p.goto(APP);
  await p.getByRole("button", { name: "TPM", exact: true }).first().waitFor({ timeout: 8000 });
  await p.waitForTimeout(900);
  return { p, ctx, fehler };
}

const leseEintraege = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (R1)-(R5): Bearbeiter am 24.08. ---- */
  {
    const { p, ctx, fehler } = await start(browser, [
      { id: "tpm-heute", date: "2026-08-24", category: "TPM", name: "TS480", status: "done" },
      { id: "t-heute", date: "2026-08-24", category: "TERMIN", name: "Schichtübergabe", status: "open", note: "Halle 2" },
    ], "2026-08-24T10:00:00");

    // (R3a) Tagesliste der Übersicht: lila Termin-Karte mit Chip "Termin".
    const karte = p.locator("button", { has: p.locator(".wk-chip-termin") }).filter({ hasText: "Schichtübergabe" });
    pruef("(R3) Tagesliste: der heutige Regeltermin steht als eigene Termin-Karte da",
          (await karte.count()) === 1 && (await karte.innerText()).includes("Halle 2"));

    // (R3b) Kalender-Fenster (Schwebe-Fenster von der Übersicht aus).
    await p.locator('button[aria-label="Wartungskalender als Fenster öffnen"]').click();
    await p.waitForTimeout(600);
    // Achtung Falle: [aria-label^=…] träfe auch Öffner- und ✕-Knopf - deshalb
    // gezielt das role=dialog-Fenster.
    const fenster = p.locator('div[role="dialog"][aria-label^="Wartungskalender ·"]');
    pruef("(R3) Kalender-Fenster: der Regeltermin ist auch dort sichtbar",
          (await fenster.count()) === 1 && (await fenster.innerText()).includes("Schichtübergabe"));
    await p.locator('button[aria-label="Wartungskalender als Fenster öffnen"]').click();
    await p.waitForTimeout(300);

    // (R3c) Monats-Kalender unter TPM -> Plan: lila Kachel mit data-termin-datum.
    await p.getByRole("button", { name: "TPM", exact: true }).first().click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "Plan", exact: true }).first().click();
    await p.waitForTimeout(1200);
    pruef("(R3) Monats-Kalender: Kachel für den heutigen Regeltermin",
          (await p.locator('button[data-termin-datum="2026-08-24"]').count()) === 1 &&
          (await p.locator('button[data-termin-datum="2026-08-24"]').innerText()).includes("Schichtübergabe"));

    // (R1) Anlege-Dialog am 26.08. öffnen (26. Tag = 26. Plus-Knopf).
    await p.locator('button[aria-label="Eintrag hinzufügen"]').nth(25).click();
    await p.waitForTimeout(400);
    // Achtung Falle: Der Anlege-Dialog trägt KEIN role="dialog", und die
    // CSS-Versalien machen aus „Termin“ den zugänglichen Namen „TERMIN“.
    const terminKnopf = p.getByRole("button", { name: /^termin$/i });
    pruef("(R1) Der Anlege-Dialog bietet den Knopf „Termin“ an",
          (await terminKnopf.count()) === 1);
    await terminKnopf.click();
    await p.waitForTimeout(300);
    pruef("(R1) Termin-Felder da, Gemacht/Offen-Toggle bewusst NICHT",
          (await p.locator('input[aria-label="Termin-Titel"]').count()) === 1 &&
          (await p.locator('select[aria-label="Wiederholung"]').count()) === 1 &&
          (await p.getByRole("button", { name: "✓ Gemacht" }).count()) === 0);
    await p.locator('input[aria-label="Termin-Titel"]').fill("Abteilungsversammlung");
    await p.locator('select[aria-label="Wiederholung"]').selectOption("woche");
    await p.waitForTimeout(200);
    pruef("(R1) „bis“ wird mit +3 Monaten vorgeschlagen (26.11.)",
          (await p.locator('input[aria-label="Wiederholung bis"]').inputValue()) === "2026-11-26");
    await p.locator('input[aria-label="Wiederholung bis"]').fill("2026-09-16");
    await p.getByText("📌 auch als Zettel an die Pinnwand", { exact: false }).locator('input[type="checkbox"]').check()
      .catch(async () => { await p.locator('label:has-text("Pinnwand") input[type="checkbox"]').check(); });
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.waitForTimeout(900);

    // (R2) Reihe + Zettel nachzählen - im gespeicherten Bestand, nicht am Bildschirm.
    const bestand = await leseEintraege(p);
    const reihe = bestand.filter((e) => e.category === "TERMIN" && e.name === "Abteilungsversammlung");
    const daten = reihe.map((e) => e.date).sort();
    pruef("(R2) Jede Woche bis 16.09.: genau 4 echte Einträge (26.08., 02.09., 09.09., 16.09.)",
          reihe.length === 4 && daten.join(",") === "2026-08-26,2026-09-02,2026-09-09,2026-09-16",
          daten.join(","));
    pruef("(R2) Alle 4 tragen dieselbe serieId",
          reihe.length === 4 && new Set(reihe.map((e) => e.serieId)).size === 1 && reihe[0].serieId);
    const zettel = bestand.filter((e) => e.category === "NOTIZ" && e.veroeffentlicht === true);
    pruef("(R2) Pinnwand-Haken: genau EIN veröffentlichter Zettel mit Titel und Rhythmus",
          zettel.length === 1 && /Abteilungsversammlung/.test(zettel[0].note) && /wöchentlich/.test(zettel[0].note),
          zettel.length + " Zettel");
    pruef("(R2) Kachel des neuen Termins steht im August-Kalender",
          (await p.locator('button[data-termin-datum="2026-08-26"]').count()) === 1);

    // (R4) Auswertung bleibt sauber: Das Druckblatt zählt nur die Wartung.
    await p.locator('button[aria-label="Drucken"]').click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: /^Letzte 3 Monate/ }).click();
    await p.waitForTimeout(500);
    const [popup] = await Promise.all([
      p.waitForEvent("popup"),
      p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await popup.waitForTimeout(400);
    const blattText = await popup.locator("body").innerText();
    pruef("(R4) Quote zählt nur die Wartung: 1 von 1 erledigt · 100 % - Termine fließen nicht ein",
          /1 von 1 erledigt · 100 %/.test(blattText) &&
          !/Abteilungsversammlung/.test(blattText) && !/Schichtübergabe/.test(blattText),
          blattText.slice(0, 140));
    await popup.close();
    await p.locator('button[aria-label="Schließen"]').last().click().catch(() => p.keyboard.press("Escape"));
    await p.waitForTimeout(400);

    // (R5) Ganze Reihe löschen aus dem Termin-Dialog.
    await p.locator('button[data-termin-datum="2026-08-26"]').click();
    await p.waitForTimeout(400);
    const reiheKnopf = p.getByRole("button", { name: /Ganze Reihe löschen \(4 Termine\)/ });
    pruef("(R5) Der Termin-Dialog bietet „Ganze Reihe löschen (4 Termine)“ an",
          (await reiheKnopf.count()) === 1);
    await reiheKnopf.click();
    await p.waitForTimeout(900);
    const danach = await leseEintraege(p);
    pruef("(R5) Danach ist die komplette Reihe weg, der Einzeltermin von heute bleibt",
          danach.filter((e) => e.name === "Abteilungsversammlung").length === 0 &&
          danach.filter((e) => e.id === "t-heute").length === 1);
    pruef("(R1-R5) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (R6) 30-Tage-Räumung beim Bearbeiter ---- */
  {
    const { p, ctx, fehler } = await start(browser, [
      { id: "alt-open", date: "2026-07-10", category: "TPM", name: "TS480", status: "open" },     // 45 Tage, offen -> bleibt im Bestand, raus aus der Anzeige
      { id: "alt-done", date: "2026-07-10", category: "TPM", name: "TS480", status: "done" },     // erledigt -> bleibt
      { id: "alt-ri", date: "2026-07-18", category: "RI", name: "Wasserrundgang", status: "open" }, // 37 Tage -> bleibt im Bestand, raus aus der Anzeige
      { id: "genau30", date: "2026-07-25", category: "TPM", name: "TS480", status: "open" },      // Grenzfall genau 30 Tage -> noch in der Anzeige
      { id: "archiv", date: "2026-08-10", category: "TPM", name: "TS480", status: "open" },       // 14 Tage -> im Archiv sichtbar
      { id: "termin-alt", date: "2026-07-01", category: "TERMIN", name: "Alte Versammlung", status: "open" }, // vergangener Regeltermin -> WIRKLICH gelöscht
      { id: "termin-neu", date: "2026-09-02", category: "TERMIN", name: "Nächste Versammlung", status: "open" }, // Zukunft -> bleibt
    ], "2026-08-24T10:00:00");
    await p.waitForTimeout(1600);
    const ids = new Set((await leseEintraege(p)).map((e) => e.id));
    pruef("(R6) Der vergangene Regeltermin ist nach 30 Tagen wirklich GELÖSCHT, der künftige bleibt",
          !ids.has("termin-alt") && ids.has("termin-neu"), [...ids].join(","));
    pruef("(R6) Versäumte TPM/R+I bleiben im BESTAND - Löschen würde die Quoten rückwirkend schönen",
          ids.has("alt-open") && ids.has("alt-ri") && ids.has("alt-done") && ids.has("genau30") && ids.has("archiv"));
    const kachel = p.locator('button[aria-label="Termin-Archiv öffnen"]');
    pruef("(R6) Die Archiv-ANZEIGE endet bei 30 Tagen: 2 Einträge (14 und genau 30 Tage), die älteren nicht mehr",
          (await kachel.count()) === 1 && /2 über eine Woche versäumt/.test(await kachel.innerText()),
          await kachel.innerText().catch(() => "keine Kachel"));
    const marker = await p.evaluate(() => localStorage.getItem("werkstatt-kalender-archiv-raeumung"));
    pruef("(R6) Die Räumung merkt sich den Tag (läuft einmal täglich, nicht bei jedem Klick)",
          marker === "2026-08-24", marker);
    // Robertos Begründung nachgemessen: "Nachvollziehbar ist das ganze ja
    // dann unter TPM" - das gedruckte Blatt zählt die Versäumten WEITER.
    await p.getByRole("button", { name: "TPM", exact: true }).first().click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "Plan", exact: true }).first().click();
    await p.waitForTimeout(1200);
    await p.locator('button[aria-label="Drucken"]').click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: /^Letzte 3 Monate/ }).click();
    await p.waitForTimeout(500);
    const [popup] = await Promise.all([
      p.waitForEvent("popup"),
      p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await popup.waitForTimeout(400);
    const blatt = await popup.locator("body").innerText();
    pruef("(R6) Nachvollziehbar unter TPM: das Druckblatt zählt die Versäumten weiter (1 von 5 · 20 %)",
          /1 von 5 erledigt · 20 %/.test(blatt), blatt.slice(0, 140));
    await popup.close();
    pruef("(R6) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (R7) Leser: informiert und mit Archiv, aber ohne Räumung ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => fehler.push(e.message));
    await p.clock.setFixedTime(new Date("2026-08-24T10:00:00"));
    await p.addInitScript((c) => {
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      const inhalt = JSON.stringify({
        format: "werkstatt-kalender-v1", savedAt: "2026-08-20T00:00:00.000Z", deleted: {},
        entries: [
          { id: "l-termin", date: "2026-08-24", category: "TERMIN", name: "Schichtübergabe", status: "open" },
          { id: "l-archiv", date: "2026-08-10", category: "TPM", name: "TS480", status: "open" },
          { id: "l-uralt", date: "2026-07-10", category: "TPM", name: "URALT-ANLAGE", status: "open" },
        ],
        config: c,
      });
      const handle = {
        name: "kalender-daten.json", kind: "file",
        async getFile() { return new File([inhalt], "kalender-daten.json", { type: "application/json" }); },
        async createWritable() { throw new Error("NotAllowedError: nur Lesen"); },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [handle];
    }, config);
    await p.goto(APP);
    await p.waitForTimeout(800);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1200);
    await p.getByRole("button", { name: "Werkstatt", exact: true }).click();
    await p.waitForTimeout(300);
    const uebersicht = p.getByRole("button", { name: "Übersicht", exact: true });
    if (await uebersicht.count()) { await uebersicht.first().click(); await p.waitForTimeout(500); }

    pruef("(R7) Leser werden informiert: die Termin-Karte steht in ihrer Tagesliste (nur ansehen)",
          (await p.locator("button:disabled", { has: p.locator(".wk-chip-termin") }).filter({ hasText: "Schichtübergabe" }).count()) === 1);
    const kachel = p.locator('button[aria-label="Termin-Archiv öffnen"]');
    pruef("(R7) Leser sehen die Termin-Archiv-Kachel",
          (await kachel.count()) === 1 && /1 über eine Woche versäumt/.test(await kachel.innerText()));
    await kachel.click();
    await p.waitForTimeout(500);
    const archivDlg = p.locator('div[aria-label="Termin-Archiv"]');
    const archivText = await archivDlg.innerText();
    pruef("(R7) Archiv-Dialog: Eintrag nur ansehen (Karte gesperrt), 30-Tage-Hinweis steht drin",
          (await archivDlg.locator("button:disabled", { hasText: "TS480" }).count()) === 1 &&
          /30 Tagen/.test(archivText) && !/zum Erledigen oder Verschieben/.test(archivText));
    pruef("(R7) Über 30 Tage Versäumtes ist auch beim Leser aus der Anzeige gefiltert",
          !(await p.locator("body").innerText()).includes("URALT-ANLAGE"));
    const marker = await p.evaluate(() => localStorage.getItem("werkstatt-kalender-archiv-raeumung"));
    pruef("(R7) Leser räumen NICHT (kein Räumungs-Marker, Nur-Leser schreiben nie)",
          marker === null, String(marker));
    pruef("(R7) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  console.log(`\nHärte 55 (Regeltermine + Leser-Archiv + 30-Tage-Räumung): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
