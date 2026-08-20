// Härtetest: QOL-RUNDE 3 VOM 19.08. (Robertos "alles bis auf 8").
//
//  (1) ANLAGEN-STECKBRIEF im Register: Felder speichern, wieder anzeigen,
//      und die ℹ-Zeile im Störungs-Dialog nennt Partner + Ersatzteile.
//  (2) WARTUNGS-CHECKLISTE je Anlage im Termin-Dialog ("x von y"),
//      Haken landen am Eintrag.
//  (3) NACHBESTELL-ÜBERSICHT: sammelt "nachbestellt", Haken "eingetroffen"
//      räumt ab; Erledigtes und Störungen ohne Teile zählen nicht.
//  (4) SCHICHTÜBERGABE-BLATT: Druckvorlage mit offenen Störungen (samt
//      "was muss die nächste Schicht tun"), heutigen Terminen und NUR den
//      veröffentlichten Pinnwand-Zetteln.
//  (5) ANLAGE AUSSER BETRIEB: die Rotation lässt die Anlage im Zeitraum
//      aus, der Plan nennt den Grund, ECHTE Einträge bleiben stehen.
//  (6) STÖRUNGS-HÄUFUNGS-HINWEIS: ab der dritten Störung derselben Anlage
//      in 30 Tagen; ältere zählen nicht, fremde Anlagen auch nicht.
//  (7) CSV-HERAUSGABE: Menü mit JSON + zwei CSV; die CSV öffnet deutsches
//      Excel (BOM + Semikolon) und enthält die echten Daten.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const TMP = "/tmp/claude-0/-home-user-WerkstattKalender/8b2eab4a-3225-51dd-900c-dbf3d21c0a06/scratchpad";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const basisConfig = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }, { id: "a2", name: "TS320", role: "takt" }],
  riItems: [{ id: "r1", name: "Wasserrundgang", type: "weekly", weekday: 1 }],
  team: [],
};

async function start(browser, { eintraege = [], config = basisConfig, stoer = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-18T10:00:00"));
  await p.addInitScript(({ e, c, s }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
  }, { e: eintraege, c: config, s: stoer });
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
const zuStoerungen = async (p) => {
  await p.getByRole("button", { name: "Werkstatt", exact: true }).first().click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /^Störungen/ }).first().click();
  await p.waitForTimeout(600);
};
const stoerBericht = (nr, tage, anlage, extra = {}) => ({
  id: `s${nr}`, nr, date: `2026-08-${String(18 - tage).padStart(2, "0")}`, schicht: "Früh",
  anlage, stoerung: "Testfall", offen: true, melder: "T",
  gemeldetAt: `2026-08-${String(18 - tage).padStart(2, "0")}T08:00:00.000Z`,
  updatedAt: `2026-08-${String(18 - tage).padStart(2, "0")}T08:00:00.000Z`, ...extra,
});

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (7) CSV-Herausgabe ---- */
  {
    const { p, ctx } = await start(browser, {
      eintraege: [{ id: "t1", date: "2026-08-18", category: "TPM", name: "TS480", status: "open", note: "Ölstand; prüfen" }],
      stoer: [stoerBericht(1, 0, "TS320", { getan: "Dichtung getauscht" })],
    });
    await p.locator('button[aria-label="Export"]').click();
    await p.waitForTimeout(300);
    pruef("(7) Der Export-Knopf öffnet ein Menü mit drei Wegen",
          (await p.getByRole("button", { name: /Alles als JSON/ }).count()) === 1 &&
          (await p.getByRole("button", { name: /Termine als CSV/ }).count()) === 1 &&
          (await p.getByRole("button", { name: /Störungen als CSV/ }).count()) === 1);
    const [dlT] = await Promise.all([
      p.waitForEvent("download"),
      p.getByRole("button", { name: /Termine als CSV/ }).click(),
    ]);
    pruef("(7) Termine-CSV trägt einen sprechenden Namen", /werkstatt-termine-.*\.csv$/.test(dlT.suggestedFilename()), dlT.suggestedFilename());
    const zielT = TMP + "/harte48-termine.csv";
    await dlT.saveAs(zielT);
    const csvT = fs.readFileSync(zielT, "utf8");
    pruef("(7) BOM + Semikolon: deutsches Excel öffnet die Datei per Doppelklick",
          csvT.charCodeAt(0) === 0xFEFF && csvT.includes("Datum;Art;Anlage / Punkt;Status;Notiz"));
    pruef("(7) Die Zeile enthält den echten Termin, Strichpunkt im Text ist gekapselt",
          csvT.includes('18.08.2026;TPM;TS480;offen;"Ölstand; prüfen"'), csvT.split("\r\n")[1]);
    await p.locator('button[aria-label="Export"]').click();
    await p.waitForTimeout(300);
    const [dlS] = await Promise.all([
      p.waitForEvent("download"),
      p.getByRole("button", { name: /Störungen als CSV/ }).click(),
    ]);
    const zielS = TMP + "/harte48-stoerungen.csv";
    await dlS.saveAs(zielS);
    const csvS = fs.readFileSync(zielS, "utf8");
    pruef("(7) Störungs-CSV enthält Anlage und Maßnahme",
          csvS.includes("Nr;Datum;Schicht;Anlage") && /TS320/.test(csvS) && /Dichtung getauscht/.test(csvS));
    await ctx.close();
  }

  /* ---- (6) Häufungs-Hinweis ---- */
  {
    const { p, ctx } = await start(browser, {
      stoer: [stoerBericht(1, 3, "TS320"), stoerBericht(2, 10, "TS320"),
              // 40 Tage alt - darf NICHT mitzählen
              { ...stoerBericht(3, 0, "TS320"), date: "2026-07-08", gemeldetAt: "2026-07-08T08:00:00.000Z" }],
    });
    await zuStoerungen(p);
    await p.getByRole("button", { name: /Störbericht erfassen/ }).click();
    await p.waitForTimeout(500);
    await p.locator('input[list="stoer-anlagen"]').fill("TS320");
    await p.waitForTimeout(400);
    const text = await p.locator("body").innerText();
    pruef("(6) Ab der dritten Störung in 30 Tagen erscheint der Hinweis",
          /3\. Störung an TS320 innerhalb von 30 Tagen/.test(text));
    pruef("(6) Er fragt nach der Ursache statt zu schimpfen", /Ursache/.test(text));
    await p.locator('input[list="stoer-anlagen"]').fill("TS480");
    await p.waitForTimeout(400);
    pruef("(6) Für eine unauffällige Anlage bleibt es still",
          !/innerhalb von 30 Tagen/.test(await p.locator("body").innerText()));
    await ctx.close();
  }

  /* ---- (3) Nachbestell-Übersicht ---- */
  {
    const { p, ctx } = await start(browser, {
      stoer: [
        stoerBericht(1, 6, "TS320", { ersatzteile: "Dichtsatz DN25", nachbestellt: true }),
        stoerBericht(2, 13, "TS480", { ersatzteile: "Filter F-220", nachbestellt: true }),
        stoerBericht(3, 2, "TS320", { ersatzteile: "Keilriemen", nachbestellt: true, eingetroffenAt: "2026-08-17T08:00:00.000Z" }),
        stoerBericht(4, 1, "TS480", { nachbestellt: true }), // ohne Teil -> zählt nicht
      ],
    });
    await zuStoerungen(p);
    const text = await p.locator("body").innerText();
    pruef("(3) Die Leiste zählt nur die wirklich offenen (2)",
          /2 Ersatzteile sind nachbestellt/.test(text));
    await p.getByRole("button", { name: "Nachbestellungen ansehen" }).click();
    await p.waitForTimeout(400);
    const dialog = await p.locator('div[role="dialog"][aria-label="Offene Nachbestellungen"]').innerText();
    pruef("(3) Der Dialog nennt Teil, Anlage und Wartedauer",
          /Dichtsatz DN25/.test(dialog) && /Filter F-220/.test(dialog) && /13 Tage/.test(dialog));
    pruef("(3) Lange Wartezeiten tragen ein Warnzeichen", /13 Tage.*⚠|⚠/.test(dialog));
    await p.getByRole("button", { name: "✓ eingetroffen" }).first().click();
    await p.waitForTimeout(500);
    const danach = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-stoerungen-entries") || "[]"));
    pruef("(3) 'eingetroffen' wird am Bericht festgehalten",
          danach.filter((s) => s.eingetroffenAt).length === 2);
    pruef("(3) Die Übersicht schrumpft auf 1",
          /\(1\)/.test(await p.locator('div[role="dialog"][aria-label="Offene Nachbestellungen"]').innerText()));
    await ctx.close();
  }

  /* ---- (4) Schichtübergabe-Blatt ---- */
  {
    const { p, ctx } = await start(browser, {
      eintraege: [
        { id: "t1", date: "2026-08-18", category: "TPM", name: "TS480", status: "done" },
        { id: "z1", date: "2026-08-18", category: "NOTIZ", name: "RC", status: "open", note: "Kärcher bleibt beim Nachbarn", zeit: "2026-08-18T08:00:00.000Z", veroeffentlicht: true },
        { id: "z2", date: "2026-08-18", category: "NOTIZ", name: "RC", status: "open", note: "Interner Merkzettel", zeit: "2026-08-18T08:05:00.000Z" },
      ],
      stoer: [stoerBericht(1, 0, "TS320", { nochZuTun: "Druck nach Anlauf prüfen" })],
    });
    await zuStoerungen(p);
    await p.locator('button[aria-label="Drucken"]').click();
    await p.waitForTimeout(300);
    pruef("(4) Der Druckdialog bietet die Schichtübergabe an",
          (await p.getByRole("button", { name: /^Schichtübergabe/ }).count()) === 1);
    await p.getByRole("button", { name: /^Schichtübergabe/ }).click();
    await p.waitForTimeout(300);
    const [popup] = await Promise.all([
      p.waitForEvent("popup"),
      p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await popup.waitForTimeout(400);
    const html = await popup.content();
    const text = await popup.locator("body").innerText();
    pruef("(4) A4 hoch", /@page[^}]*size:\s*A4 portrait/.test(html));
    pruef("(4) Die offene Störung steht drauf - samt Auftrag an die nächste Schicht",
          /TS320/.test(text) && /Druck nach Anlauf prüfen/.test(text));
    pruef("(4) Die heutigen Termine stehen drauf", /✓ TS480/.test(text));
    pruef("(4) Nur der VERÖFFENTLICHTE Zettel steht drauf",
          /Kärcher bleibt beim Nachbarn/.test(text) && !/Interner Merkzettel/.test(text));
    pruef("(4) Übergabezeit und Stand sind genannt", /Übergabe Früh → Spät um 14:00/.test(text) && /Stand 10:00/.test(text));
    await popup.close();
    await ctx.close();
  }

  /* ---- (1) Steckbrief ---- */
  {
    const { p, ctx } = await start(browser, {});
    await p.getByRole("button", { name: "TPM", exact: true }).first().click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "Register", exact: true }).first().click();
    await p.waitForTimeout(600);
    await p.getByRole("button", { name: /^TS480/ }).click();
    await p.waitForTimeout(500);
    pruef("(1) Der Register-Dialog öffnet auf dem Steckbrief",
          (await p.locator('input[aria-label="Hersteller"]').count()) === 1);
    await p.locator('input[aria-label="Hersteller"]').fill("Trumpf");
    await p.locator('input[aria-label="Wartungspartner"]').fill("Trumpf Service · 07156 303-0");
    await p.locator('input[aria-label="Wichtige Ersatzteile"]').fill("Dichtsatz DN25");
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.waitForTimeout(600);
    const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"));
    const ts480 = (cfg.tpmAnlagen || []).find((a) => a.name === "TS480");
    pruef("(1) Der Steckbrief steht in der Verwaltung",
          ts480 && ts480.steckbrief && ts480.steckbrief.hersteller === "Trumpf", JSON.stringify(ts480 && ts480.steckbrief));
    // Wieder öffnen: die Felder sind gefüllt
    await p.getByRole("button", { name: /^TS480/ }).click();
    await p.waitForTimeout(500);
    pruef("(1) Wieder geöffnet zeigt er die Werte",
          (await p.locator('input[aria-label="Hersteller"]').inputValue()) === "Trumpf");
    await p.locator('button[aria-label="Schließen"]').last().click();
    await p.waitForTimeout(300);
    // ℹ-Zeile im Störungs-Dialog
    await zuStoerungen(p);
    await p.getByRole("button", { name: /Störbericht erfassen/ }).click();
    await p.waitForTimeout(500);
    await p.locator('input[list="stoer-anlagen"]').fill("TS480");
    await p.waitForTimeout(400);
    pruef("(1) Der Störungs-Dialog nennt Partner und Ersatzteile zur Anlage",
          /Trumpf Service.*Ersatzteile: Dichtsatz DN25/.test(await p.locator("body").innerText()));
    await ctx.close();
  }

  /* ---- (2) Checkliste im Termin-Dialog ---- */
  {
    const config = JSON.parse(JSON.stringify(basisConfig));
    config.tpmAnlagen[0].checkliste = ["Ölstand prüfen", "Keilriemen sichten"];
    const { p, ctx } = await start(browser, {
      config,
      eintraege: [{ id: "t1", date: "2026-08-18", category: "TPM", name: "TS480", status: "open" }],
    });
    await inPlan(p);
    await p.locator('[data-plan-datum="2026-08-18"]').first().click();
    await p.waitForTimeout(500);
    const dialogText = await p.locator("body").innerText();
    pruef("(2) Die Checkliste erscheint mit Zähler", /CHECKLISTE TS480/i.test(dialogText) && /0 von 2/.test(dialogText));
    await p.getByRole("button", { name: /Ölstand prüfen/ }).click();
    await p.waitForTimeout(500);
    pruef("(2) Ein Haken zählt hoch", /1 von 2/.test(await p.locator("body").innerText()));
    const stand = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
    pruef("(2) Der Haken steht am Eintrag selbst",
          Array.isArray(stand[0].punkte) && stand[0].punkte.includes("Ölstand prüfen"), JSON.stringify(stand[0].punkte));
    await ctx.close();
  }

  /* ---- (5) Anlage außer Betrieb ---- */
  {
    // Gegenprobe zuerst: OHNE Pause bekommt TS480 einen Slot im August.
    const ohne = await start(browser, {});
    await inPlan(ohne.p);
    const slotsOhne = await ohne.p.$$eval("[data-plan-datum]", (els) => els.map((el) => el.textContent));
    pruef("(5) Gegenprobe: ohne Pause plant die Rotation TS480 ein",
          slotsOhne.some((t) => /TS480/.test(t)), slotsOhne.join(" · "));
    await ohne.ctx.close();

    const config = JSON.parse(JSON.stringify(basisConfig));
    config.tpmAnlagen[0].pause = { von: "2026-08-01", bis: "2026-08-31", grund: "Umbau Absaugung" };
    const { p, ctx, fehler } = await start(browser, {
      config,
      // ECHTER Eintrag trotz Pause - der muss stehen bleiben.
      eintraege: [{ id: "t1", date: "2026-08-26", category: "TPM", name: "TS480", status: "open" }],
    });
    await inPlan(p);
    const slots = await p.$$eval("[data-plan-datum]", (els) => els.map((el) => el.getAttribute("data-plan-datum") + " " + el.textContent));
    pruef("(5) Im Pausen-Monat verteilt die Rotation nichts auf TS480",
          slots.filter((t) => /TS480/.test(t)).length === 1, slots.filter((t) => /TS480/.test(t)).join(" · "));
    pruef("(5) Der ECHTE Eintrag vom 26.08. bleibt stehen",
          slots.some((t) => t.startsWith("2026-08-26") && /TS480/.test(t)));
    const text = await p.locator("body").innerText();
    pruef("(5) Der Plan nennt Pause und Grund",
          /TS480 – außer Betrieb bis 31\.08\.2026 \(Umbau Absaugung\)/.test(text));
    pruef("(5) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  console.log(`\nHärte 48 (QoL-Runde 3): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
