// Härtetest 111: DIE NACHTSCHICHT GEHÖRT ZUM TAG IHRES BEGINNS (Roberto 28.10.2026, 06:22,
// Bild der Störungsliste: drei Nacht-Berichte von 05:09–05:14 standen unter „Mi., 28.10.“ -
// „hier stimmt was nicht, die Nacht-Einträge gehören noch zum 27.10.“).
//
//   (1) Liste „nach Datum und Schicht“: ein Nacht-Bericht, der nach Mitternacht erfasst
//       wurde und das Kalenderdatum der Meldung trägt (28.10., 05:09), steht unter dem
//       27.10. bei der Nachtschicht - zusammen mit dem Bericht von 22:30; der 28.10. zeigt
//       nur die Frühschicht.
//   (2) Schichtbericht am Morgen (06:22): die zuletzt beendete Schicht „Nacht 27.10.“
//       enthält den 05:09-Bericht.
//   (3) „Störbericht erfassen“ um 05:20: Schicht Nacht, Datum vorbelegt mit dem VORTAG,
//       Hinweis „Nacht = Tag des Schichtbeginns“; um 06:22 (Früh) bleibt es beim Tag.
//   (4) Ein Nacht-Bericht, der den Vortag schon trägt, wird NICHT noch einmal zurückgesetzt.
// Rot-Nachweis: gegen den Bau d360ef9 (APP_PFAD) steht der 05:09-Bericht unter dem 28.10.
const UMG = require("../umgebung"); // Repo-Ort, App-Datei, Browser (Roll-out 73)
const { chromium } = require("playwright-core");
const APP = UMG.dateiUrl((process.env.APP_PFAD || UMG.APP_PFAD));

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
// Zeiten als ORTSZEIT bauen (Node und Chromium teilen die Zeitzone) - Ende Oktober gilt Winterzeit.
const iso = (ort) => new Date(ort).toISOString();
const config = { tpmAnlagen: [{ id: "a1", name: "TS320", role: "takt" }], riItems: [], team: [{ name: "J Wiesner", rolle: "mech" }] };
const stoerungen = [
  { id: "s1", nr: "2026-0258", date: "2026-10-27", schicht: "Nacht", anlage: "B2 Beschichtungsanlage", stoerung: "Band steht, Sensor verschmutzt", ausfallzeit: 30, offen: false, melder: "JW", gemeldetAt: iso("2026-10-27T22:30:00"), updatedAt: iso("2026-10-27T22:30:00") },
  // Nach Mitternacht erfasst, trägt noch das Kalenderdatum - genau Robertos Fall
  { id: "s2", nr: "2026-0259", date: "2026-10-28", schicht: "Nacht", anlage: "TS320", stoerung: "Gesamtnotaus geht ab und zu einfach so rein", ausfallzeit: 45, offen: false, melder: "JW", gemeldetAt: iso("2026-10-28T05:09:00"), updatedAt: iso("2026-10-28T05:09:00") },
  // Schon richtig auf den Vortag gesetzt (wie die neue Vorbelegung) - darf nicht nochmal wandern
  { id: "s4", nr: "2026-0260", date: "2026-10-27", schicht: "Nacht", anlage: "Masseaufbereitung", stoerung: "Pumpe tropft dauerhaft", ausfallzeit: 120, offen: false, melder: "JW", gemeldetAt: iso("2026-10-28T05:14:00"), updatedAt: iso("2026-10-28T05:14:00") },
  { id: "s3", nr: "2026-0261", date: "2026-10-28", schicht: "Früh", anlage: "TS320", stoerung: "Lichtschranke Einlauf", ausfallzeit: 10, offen: false, melder: "TB", gemeldetAt: iso("2026-10-28T07:00:00"), updatedAt: iso("2026-10-28T07:00:00") },
];

async function start(browser, uhr) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.clock.setFixedTime(new Date(uhr));
  await p.addInitScript(({ s, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-entries", "[]");
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-name", "R. Ciraci");
    const oeffne = window.open.bind(window);
    window.open = (...a) => { const w = oeffne(...a); if (w) { try { w.print = () => {}; } catch (e) { /* egal */ } } return w; };
  }, { s: stoerungen, c: config });
  await p.goto(APP);
  await p.waitForTimeout(900);
  return { p, ctx, fehler };
}
const klappeAlles = async (p) => {
  for (let runde = 0; runde < 3; runde++) {
    const zu = await p.evaluate(() => { const t = Array.from(document.querySelectorAll("tr")).filter((r) => (r.textContent || "").includes("▸")); t.forEach((r) => r.click()); return t.length; });
    await p.waitForTimeout(350);
    if (!zu) break;
  }
};
const inStoerungen = async (p) => {
  await p.locator('button[data-hauptbereich="BERICHTE"]').click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /neue Störung melden/ }).first().click();
  await p.waitForTimeout(500);
};

(async () => {
  const browser = await chromium.launch({ executablePath: UMG.CHROMIUM, headless: true, args: ["--no-sandbox"] });

  /* (1) + (2) + (3b): Morgen 06:22 */
  {
    const { p, ctx, fehler } = await start(browser, "2026-10-28T06:22:00");
    await inStoerungen(p);
    await klappeAlles(p);
    const text = await p.locator("body").innerText();
    const i28 = text.indexOf("Mi., 28.10.2026"), i27 = text.indexOf("Di., 27.10.2026");
    const block28 = i28 >= 0 && i27 > i28 ? text.slice(i28, i27) : "";
    const block27 = i27 >= 0 ? text.slice(i27) : "";
    ok("(1) Tageszeilen: „Mi., 28.10.2026 · 1 Eintrag“ (nur Früh) und „Di., 27.10.2026 · 3 Einträge“ (die ganze Nacht)", /Mi\., 28\.10\.2026\s*(HEUTE\s*)?1 Eintrag\b/.test(text) && /Di\., 27\.10\.2026\s*3 Einträge/.test(text), (text.match(/(Mi|Di)\., 2[78]\.10\.2026[^\n]*\n?[^\n]*/g) || []).join(" | ").slice(0, 160));
    ok("(1) Der 05:09-Bericht (Gesamtnotaus) steht unter dem 27.10. bei NACHT, nicht unter dem 28.10.", /Gesamtnotaus/.test(block27) && !/Gesamtnotaus/.test(block28) && /NACHT/.test(block27) && /Band steht/.test(block27), block28.replace(/\n/g, " · ").slice(0, 140));
    ok("(4) Der schon auf den 27.10. gesetzte 05:14-Bericht (Pumpe tropft) bleibt beim 27.10. - kein zweiter Tag zurück", /Pumpe tropft/.test(block27) && !/Mo\., 26\.10\.2026/.test(text));
    ok("(1) Der Früh-Bericht von 07:00 bleibt beim 28.10.", /Lichtschranke Einlauf/.test(block28));
    // (2) Schichtbericht: Nacht 27.10. ist die zuletzt beendete Schicht
    const [blatt] = await Promise.all([p.waitForEvent("popup"), p.locator('button[aria-label="Schichtbericht anzeigen"]').click()]);
    await blatt.waitForTimeout(700);
    const bText = await blatt.locator("body").innerText();
    ok("(2) Schichtbericht 06:22: die Nachtschicht vom 27.10. enthält alle drei Nacht-Berichte, auch den von 05:09", /Gesamtnotaus/.test(bText) && /Pumpe tropft/.test(bText) && /Band steht/.test(bText) && /Nacht/.test(bText), bText.replace(/\n/g, " · ").slice(0, 200));
    await blatt.close();
    // (3b) Erfassen um 06:22: Früh, Datum heute
    await p.getByRole("button", { name: /Störbericht erfassen/ }).click();
    await p.waitForTimeout(400);
    ok("(3) Erfassen um 06:22: Schicht Früh, Datum 28.10. (heute), kein Nacht-Hinweis", (await p.locator('input[aria-label="Datum"]').inputValue()) === "2026-10-28" && (await p.locator("[data-stoer-nacht-hinweis]").count()) === 0);
    ok("(1-3) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* (3a): Erfassen um 05:20 - Nachtschicht läuft noch */
  {
    const { p, ctx, fehler } = await start(browser, "2026-10-28T05:20:00");
    await inStoerungen(p);
    await p.getByRole("button", { name: /Störbericht erfassen/ }).click();
    await p.waitForTimeout(400);
    const datum = await p.locator('input[aria-label="Datum"]').inputValue();
    const schichtText = await p.locator("body").innerText();
    ok("(3) Erfassen um 05:20: Schicht Nacht, Datum vorbelegt mit dem VORTAG 27.10., Hinweis „Nacht = Tag des Schichtbeginns“", datum === "2026-10-27" && /Nacht/.test(schichtText) && (await p.locator("[data-stoer-nacht-hinweis]").count()) === 1, datum);
    ok("(3) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
