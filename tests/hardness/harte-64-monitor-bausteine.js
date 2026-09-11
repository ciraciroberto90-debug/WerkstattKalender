// Härtetest: DER WERKSTATT-MONITOR IST ÜBER DAS ZAHNRAD ZUSAMMENSTELLBAR.
//
// Robertos Wunsch vom 08.09.: "ich möchte über das Zahnradmenü flexibel die
// Monitoransicht bearbeiten können (was wird angezeigt) - Live-Score,
// Diagramme etc."
//
// Geprüft wird:
//  (M1) Standard: ALLE Bausteine laufen - auch die zwei neuen (TPM-Score,
//       Termintreue-Diagramm). Bestände ohne den Schlüssel zeigen alles.
//  (M2) Das Zahnrad hat den Reiter "Monitor" mit einem Häkchen je Baustein.
//  (M3) Häkchen weg = Baustein weg (Karte, Laufband) - und die Wahl steht
//       in der Konfiguration (gemeinsame Datei), nicht nur am Bildschirm.
//  (M4) Alles abgewählt: der Monitor sagt es ehrlich statt leer zu wirken.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-09-08T10:00:00"));
  await p.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([
      { id: "t1", date: "2026-09-02", category: "TPM", name: "TS480", status: "done" },
      { id: "t2", date: "2026-08-10", category: "TPM", name: "TS480", status: "done" },
      { id: "t3", date: "2026-08-24", category: "TPM", name: "TS480", status: "open" },
    ]));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
      tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }],
      riItems: [], team: [{ name: "M. Weber", rolle: "elek" }],
    }));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify([
      { id: "s1", date: "2026-09-07", anlage: "TS480", stoerung: "Testlauf-Störung", offen: true, gemeldetAt: "2026-09-07T06:00:00" },
    ]));
  });
  // Standort festnageln: seit der Werkstatt-Wahl (harte-68) bekämen frische
  // Rechner sonst zuerst die Frage - die ist hier nicht Gegenstand.
  await p.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
  await p.goto(APP);
  await p.waitForTimeout(1200);

  /* ---- (M1) Standard: alles läuft, inkl. der neuen Bausteine ---- */
  await p.locator('button[aria-label="Werkstatt-Monitor"]').click();
  await p.waitForTimeout(800);
  let text = await p.locator("#werkstatt-monitor").innerText();
  pruef("(M1) Die drei bekannten Karten laufen",
        /JETZT IN DER WERKSTATT/i.test(text) && /HEUTE FÄLLIG/i.test(text) && /BACKLOG/i.test(text));
  pruef("(M1) NEU: der Live-Score (TPM-Quote Monat & Jahr) läuft",
        /TPM-SCORE/i.test(text) && /Jahr 2026/.test(text));
  pruef("(M1) NEU: das Termintreue-Diagramm läuft",
        (await p.locator('#werkstatt-monitor svg[aria-label="Termintreue der letzten 12 Monate"]').count()) === 1);
  pruef("(M1) Das Störungs-Laufband läuft (eine offene Störung)",
        /Testlauf-Störung/.test(text));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);

  /* ---- (M2) Der Zahnrad-Reiter "Monitor" ---- */
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(500);
  pruef("(M2) Das Zahnrad hat den Reiter „Monitor“",
        (await p.getByRole("button", { name: "Monitor", exact: true }).count()) === 1);
  await p.getByRole("button", { name: "Monitor", exact: true }).click();
  await p.waitForTimeout(400);
  pruef("(M2) Je Baustein ein Häkchen - sieben Stück, alle an",
        (await p.locator('input[type="checkbox"]:checked').count()) === 7);

  /* ---- (M3) Abwählen wirkt - am Monitor UND in der Konfiguration ---- */
  await p.locator('input[aria-label="Jetzt in der Werkstatt (Anwesenheit)"]').click();
  await p.waitForTimeout(400);
  await p.locator('input[aria-label="Störungs-Laufband am unteren Rand"]').click();
  await p.waitForTimeout(600);
  const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"));
  pruef("(M3) Die Wahl steht in der Konfiguration (crew aus, Laufband aus, Score an)",
        cfg.monitor && cfg.monitor.crew === false && cfg.monitor.stoerband === false && cfg.monitor.score === true,
        JSON.stringify(cfg.monitor));
  await p.locator('button[aria-label="Schließen"]').last().click().catch(() => p.keyboard.press("Escape"));
  await p.waitForTimeout(400);
  await p.locator('button[aria-label="Werkstatt-Monitor"]').click();
  await p.waitForTimeout(800);
  text = await p.locator("#werkstatt-monitor").innerText();
  pruef("(M3) Die Anwesenheits-Karte ist weg, die übrigen laufen weiter",
        !/JETZT IN DER WERKSTATT/i.test(text) && /BACKLOG/i.test(text) && /TPM-SCORE/i.test(text));
  pruef("(M3) Das Laufband ist weg - trotz offener Störung",
        !/Testlauf-Störung/.test(text));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);

  /* ---- (M4) Alles aus: ehrlicher Hinweis ---- */
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Monitor", exact: true }).click();
  await p.waitForTimeout(300);
  // Immer den ERSTEN angehakten nehmen - die :checked-Liste schrumpft
  // mit jedem Klick, gemerkte Positionen liefen ins Leere.
  for (let i = 0; i < 10 && (await p.locator('input[type="checkbox"]:checked').count()) > 0; i++) {
    await p.locator('input[type="checkbox"]:checked').first().click();
    await p.waitForTimeout(250);
  }
  pruef("(M4) Der Reiter warnt: alles abgewählt = nur noch Uhr",
        /Alles abgewählt/.test(await p.locator("body").innerText()));
  await p.locator('button[aria-label="Schließen"]').last().click().catch(() => p.keyboard.press("Escape"));
  await p.waitForTimeout(400);
  await p.locator('button[aria-label="Werkstatt-Monitor"]').click();
  await p.waitForTimeout(800);
  text = await p.locator("#werkstatt-monitor").innerText();
  pruef("(M4) Der Monitor sagt es ehrlich - mit dem Weg zurück (⚙ → Monitor)",
        /Alle Bausteine sind im ⚙/.test(text));
  pruef("(M4) Uhr und Schicht stehen trotzdem im Kopf", /KW 37|Frühschicht/.test(text));
  pruef("(M1-M4) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  await ctx.close();

  console.log(`\nHärte 64 (Monitor-Bausteine): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
