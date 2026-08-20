// Härtetest: KREATIV-RUNDE G1-G8 VOM 19.08. (Robertos "einführen").
//
//  (G1) EIGENER WERKSTATT-NAME: im ⚙ gesetzt, erscheint in Kopfzeile und
//       auf dem Druckkopf (Prüfnachweis); leer = "Werkstatt-Cockpit".
//  (G2) VOLLER MONAT = KLEINES FEST: erscheint einmal, sperrt nichts,
//       kommt im selben Monat nicht wieder; unvollständiger Monat = still.
//  (G3) KENNFARBE JE ANLAGE: linke Kante an der Kachel, stabil über
//       Neuladen, verschiedene Anlagen = verschiedene Farben.
//  (G4) HEUTE-SPALTE: Marke am heutigen Wochentag - nur im laufenden Monat.
//  (G5) SCHICHT-FORTSCHRITTSBALKEN: nennt Schicht, Prozent und Restzeit.
//  (G6) STÖRUNGS-LAUFBAND im Vollbild-Monitor - nur bei offenen Störungen.
//  (G7) TASTATUR-KÜRZEL: N schaltet den Nachtmodus, ? den Spickzettel;
//       in Eingabefeldern bleibt Tippen Tippen.
//  (G8) WOCHEN-RÜCKBLICK: freitags ab 12 Uhr mit den Zahlen der Woche,
//       wegklickbar; dienstags erscheint nichts.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

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

async function start(browser, { eintraege = [], config = basisConfig, stoer = [], uhr = "2026-08-18T10:00:00", extraInit = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date(uhr));
  await p.addInitScript(({ e, c, s }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
  }, { e: eintraege, c: config, s: stoer });
  if (extraInit) await p.addInitScript(extraInit);
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

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (G1) Eigener Werkstatt-Name ---- */
  {
    const { p, ctx } = await start(browser, {});
    pruef("(G1) Ohne Einstellung heißt es Werkstatt-Cockpit",
          /WERKSTATT-COCKPIT/i.test(await p.locator("body").innerText()));
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(500);
    // Das Feld wohnt im Reiter "Team & Schichten" (bei "Dein Name").
    await p.getByRole("button", { name: "Team & Schichten" }).click();
    await p.waitForTimeout(400);
    await p.locator('input[aria-label="Name der Werkstatt"]').fill("Werkstatt Scheurich");
    await p.locator('input[aria-label="Name der Werkstatt"]').blur();
    await p.waitForTimeout(600);
    await p.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
    await p.waitForTimeout(300);
    pruef("(G1) Die Kopfzeile trägt den eigenen Namen",
          /WERKSTATT SCHEURICH/i.test(await p.locator("body").innerText()));
    const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"));
    pruef("(G1) Der Name steht in den gemeinsamen Einstellungen", cfg.werkstattName === "Werkstatt Scheurich");
    // Druckkopf: Prüfnachweis nennt jetzt die Werkstatt
    await p.getByRole("button", { name: "TPM", exact: true }).first().click();
    await p.waitForTimeout(500);
    await p.locator('button[aria-label="Drucken"]').click();
    await p.waitForTimeout(300);
    const [popup] = await Promise.all([
      p.waitForEvent("popup"),
      p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await popup.waitForTimeout(400);
    pruef("(G1) Auch der Druckkopf nennt die Werkstatt",
          /Werkstatt Scheurich/.test(await popup.locator("body").innerText()));
    await popup.close();
    await ctx.close();
  }

  /* ---- (G2) Voller Monat = Fest ---- */
  {
    const { p, ctx } = await start(browser, {
      eintraege: [
        { id: "t1", date: "2026-08-03", category: "TPM", name: "TS480", status: "done" },
        { id: "t2", date: "2026-08-10", category: "RI", name: "Wasserrundgang", status: "done" },
      ],
    });
    await p.waitForTimeout(600);
    const text = await p.locator("body").innerText();
    pruef("(G2) Der volle Monat wird gefeiert", /August komplett!/.test(text) && /Alle 2 Termine erledigt/.test(text));
    pruef("(G2) Die Karte sperrt nichts (Knöpfe bleiben klickbar)",
          await p.getByRole("button", { name: "TPM", exact: true }).first().isEnabled());
    await p.reload();
    await p.waitForTimeout(1200);
    pruef("(G2) Im selben Monat wird nicht noch einmal gefeiert",
          !/August komplett!/.test(await p.locator("body").innerText()));
    await ctx.close();
  }
  {
    const { p, ctx } = await start(browser, {
      eintraege: [{ id: "t1", date: "2026-08-03", category: "TPM", name: "TS480", status: "open" }],
    });
    await p.waitForTimeout(600);
    pruef("(G2) Ein unvollständiger Monat bleibt still",
          !/komplett!/.test(await p.locator("body").innerText()));
    await ctx.close();
  }

  /* ---- (G3) Kennfarbe + (G4) Heute-Spalte ---- */
  {
    const { p, ctx } = await start(browser, {
      eintraege: [
        { id: "t1", date: "2026-08-18", category: "TPM", name: "TS480", status: "open" },
        { id: "t2", date: "2026-08-19", category: "TPM", name: "TS320", status: "open" },
      ],
    });
    await inPlan(p);
    const kante = async (datum) => p.locator(`[data-plan-datum="${datum}"]`).first()
      .evaluate((el) => getComputedStyle(el).borderLeftColor + "|" + getComputedStyle(el).borderLeftWidth);
    const k480 = await kante("2026-08-18");
    const k320 = await kante("2026-08-19");
    pruef("(G3) Jede Kachel trägt eine 4-px-Kennfarben-Kante",
          k480.endsWith("|4px") && k320.endsWith("|4px"), k480 + " · " + k320);
    pruef("(G3) Verschiedene Anlagen tragen verschiedene Farben", k480 !== k320);
    await p.reload();
    await p.waitForTimeout(1200);
    await inPlan(p);
    pruef("(G3) Die Farbe bleibt nach dem Neuladen dieselbe", (await kante("2026-08-18")) === k480);

    const kopf = await p.locator("body").innerText();
    pruef("(G4) Der heutige Wochentag trägt die Marke (▾ DI)", /▾\s*DI/i.test(kopf));
    await p.locator('button[aria-label="Nächster Monat"]').click();
    await p.waitForTimeout(500);
    pruef("(G4) In anderen Monaten gibt es keine Heute-Marke",
          !/▾\s*DI/i.test(await p.locator("body").innerText()));
    await ctx.close();
  }

  /* ---- (G5) Schicht-Fortschrittsbalken ---- */
  {
    const { p, ctx } = await start(browser, { uhr: "2026-08-18T10:00:00" }); // 10:00 = 50 % der Frühschicht
    const balken = p.locator('div[aria-label*="Frühschicht"]');
    pruef("(G5) Der Balken nennt Schicht, Prozent und Restzeit",
          (await balken.count()) === 1 && /Frühschicht · 50 % · noch 4 h 00 min/.test(await balken.getAttribute("aria-label")),
          await balken.getAttribute("aria-label").catch(() => "fehlt"));
    await ctx.close();
  }
  {
    const { p, ctx } = await start(browser, { uhr: "2026-08-18T23:00:00" });
    pruef("(G5) Nachts zeigt er die Nachtschicht",
          /Nachtschicht/.test((await p.locator('div[aria-label*="schicht ·"]').first().getAttribute("aria-label")) || ""));
    await ctx.close();
  }

  /* ---- (G6) Störungs-Laufband im Monitor ---- */
  {
    const { p, ctx } = await start(browser, {
      stoer: [{ id: "s1", nr: 41, date: "2026-08-18", schicht: "Früh", anlage: "TS320", stoerung: "Druck fällt ab", nochZuTun: "Druck nach Anlauf prüfen", offen: true, melder: "M", gemeldetAt: "2026-08-18T07:40:00.000Z", updatedAt: "2026-08-18T07:40:00.000Z" }],
    });
    await p.locator('button[aria-label="Werkstatt-Monitor"]').click();
    await p.waitForTimeout(800);
    const band = await p.locator(".wk-laufband").innerText().catch(() => "");
    pruef("(G6) Das Laufband nennt Nummer, Anlage und Auftrag",
          /TS320/.test(band) && /Druck nach Anlauf prüfen/.test(band), band.slice(0, 80));
    await ctx.close();
  }
  {
    const { p, ctx } = await start(browser, {});
    await p.locator('button[aria-label="Werkstatt-Monitor"]').click();
    await p.waitForTimeout(800);
    pruef("(G6) Ohne offene Störungen gibt es kein Band",
          (await p.locator(".wk-laufband").count()) === 0);
    await ctx.close();
  }

  /* ---- (G7) Tastatur-Kürzel ---- */
  {
    const { p, ctx, fehler } = await start(browser, {});
    await p.keyboard.press("n");
    await p.waitForTimeout(300);
    pruef("(G7) Taste N schaltet den Nachtmodus ein",
          await p.evaluate(() => document.documentElement.classList.contains("wk-nacht")));
    await p.keyboard.press("n");
    await p.waitForTimeout(300);
    await p.keyboard.press("?");
    await p.waitForTimeout(300);
    pruef("(G7) Taste ? zeigt den Spickzettel",
          (await p.locator('div[role="dialog"][aria-label="Tastatur-Kürzel"]').count()) === 1);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
    pruef("(G7) Esc schließt ihn wieder",
          (await p.locator('div[role="dialog"][aria-label="Tastatur-Kürzel"]').count()) === 0);
    // In Eingabefeldern bleibt Tippen Tippen: "n" im Namensfeld darf nichts schalten.
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: "Team & Schichten" }).click();
    await p.waitForTimeout(400);
    const feld = p.locator('input[aria-label="Name der Werkstatt"]');
    await feld.click();
    await feld.type("n");
    await p.waitForTimeout(300);
    pruef("(G7) Tippen in Feldern schaltet nichts um",
          !(await p.evaluate(() => document.documentElement.classList.contains("wk-nacht"))) &&
          (await feld.inputValue()) === "n");
    pruef("(G7) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (G8) Wochen-Rückblick ---- */
  {
    // Freitag, 21.08.2026, 13:00 - mit einer Arbeitswoche voller Daten.
    const { p, ctx } = await start(browser, {
      uhr: "2026-08-21T13:00:00",
      eintraege: [
        { id: "t1", date: "2026-08-17", category: "TPM", name: "TS480", status: "done" },
        { id: "t2", date: "2026-08-18", category: "TPM", name: "TS320", status: "done" },
        { id: "t3", date: "2026-08-19", category: "RI", name: "Wasserrundgang", status: "open" },
      ],
      stoer: [
        { id: "s1", date: "2026-08-18", schicht: "Früh", anlage: "TS320", stoerung: "a", offen: false, melder: "M", gemeldetAt: "2026-08-18T08:00:00.000Z", updatedAt: "2026-08-18T08:00:00.000Z" },
        { id: "s2", date: "2026-08-19", schicht: "Früh", anlage: "TS320", stoerung: "b", offen: true, melder: "M", gemeldetAt: "2026-08-19T08:00:00.000Z", updatedAt: "2026-08-19T08:00:00.000Z" },
      ],
    });
    const text = await p.locator("body").innerText();
    pruef("(G8) Freitags erscheint der Wochen-Rückblick", /WOCHEN-RÜCKBLICK · KW 34/i.test(text));
    pruef("(G8) Mit den Zahlen der Woche",
          /2/.test(text) && /67 %/.test(text) && /Sorgenkind:\s*TS320/i.test(text.replace(/\n/g, " ")));
    await p.locator('button[aria-label="Wochen-Rückblick schließen"]').click();
    await p.waitForTimeout(300);
    pruef("(G8) Wegklicken räumt ihn ab", !/WOCHEN-RÜCKBLICK/i.test(await p.locator("body").innerText()));
    await p.reload();
    await p.waitForTimeout(1200);
    pruef("(G8) Und er bleibt diese Woche weg", !/WOCHEN-RÜCKBLICK/i.test(await p.locator("body").innerText()));
    await ctx.close();
  }
  {
    const { p, ctx } = await start(browser, {
      uhr: "2026-08-18T13:00:00", // Dienstag
      eintraege: [{ id: "t1", date: "2026-08-17", category: "TPM", name: "TS480", status: "done" }],
    });
    pruef("(G8) Dienstags erscheint kein Rückblick",
          !/WOCHEN-RÜCKBLICK/i.test(await p.locator("body").innerText()));
    await ctx.close();
  }

  console.log(`\nHärte 49 (Kreativ-Runde G1-G8): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
