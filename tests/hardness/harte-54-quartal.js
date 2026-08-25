// Härtetest: QUARTALS-ÜBERSICHT "LETZTE 3 MONATE" (Robertos Wunsch 24.08.).
//
//  (Q1) Der Auswertungs-Druckdialog bietet "Letzte 3 Monate" an.
//  (Q2) Das Blatt: A4 hoch, ROLLIEREND laufender Monat + 2 davor, mit
//       Gesamt-Quote oben, Quote-Balken je Monat, Monats-Tabelle mit
//       Gesamt-Zeile und der Aufschlüsselung je Anlage.
//  (Q3) Die Zahlen stimmen mit dem Seed überein - nachgerechnet, nicht
//       nur vorhanden.
//  (Q4) "Nur TPM" filtert die R+I-Termine wirklich heraus.
//  (Q5) Jahreswechsel: Im Januar heißen die drei Monate Nov, Dez, Januar -
//       über die Jahresgrenze hinweg, ohne leere Falsch-Monate.
//  (Q6) Ein leeres Quartal sagt ehrlich "nichts eingetragen".
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
  await p.clock.setFixedTime(new Date(uhr));
  await p.addInitScript(({ e, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
  }, { e: eintraege, c: config });
  await p.goto(APP);
  await p.waitForTimeout(1000);
  return { p, ctx, fehler };
}

// In den Auswertungs-Druckdialog und die Quartals-Vorlage als Popup öffnen.
async function quartalsBlatt(p, umfang) {
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Plan", exact: true }).first().click();
  await p.waitForTimeout(1200);
  await p.locator('button[aria-label="Drucken"]').click();
  await p.waitForTimeout(400);
  if (umfang) {
    await p.getByRole("button", { name: umfang, exact: true }).click();
    await p.waitForTimeout(300);
  }
  await p.getByRole("button", { name: /^Letzte 3 Monate/ }).click();
  await p.waitForTimeout(500);
  const [popup] = await Promise.all([
    p.waitForEvent("popup"),
    p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
  ]);
  await popup.waitForLoadState("domcontentloaded");
  await popup.waitForTimeout(400);
  return { html: await popup.content(), text: await popup.locator("body").innerText() };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (Q1)-(Q4): Normalfall am 24.08. - Juni, Juli, August ---- */
  {
    // Juni: 2 TPM, beide erledigt (100 %). Juli: 1 TPM erledigt + 1 TPM offen
    // (50 %). August: 1 TPM erledigt + 1 R+I offen (mit R+I 50 %, nur TPM 100 %).
    // Mai (außerhalb) darf NICHT einfließen.
    const { p, ctx, fehler } = await start(browser, [
      { id: "m0", date: "2026-05-05", category: "TPM", name: "TS480", status: "open" },
      { id: "j1", date: "2026-06-08", category: "TPM", name: "TS480", status: "done" },
      { id: "j2", date: "2026-06-22", category: "TPM", name: "TS480", status: "done" },
      { id: "u1", date: "2026-07-06", category: "TPM", name: "TS480", status: "done" },
      { id: "u2", date: "2026-07-20", category: "TPM", name: "TS480", status: "open" },
      { id: "a1", date: "2026-08-10", category: "TPM", name: "TS480", status: "done" },
      { id: "a2", date: "2026-08-17", category: "RI", name: "Wasserrundgang", status: "open" },
    ], "2026-08-24T10:00:00");

    await p.getByRole("button", { name: "TPM", exact: true }).first().click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "Plan", exact: true }).first().click();
    await p.waitForTimeout(1200);
    await p.locator('button[aria-label="Drucken"]').click();
    await p.waitForTimeout(400);
    pruef("(Q1) Der Druckdialog bietet „Letzte 3 Monate“ an",
          (await p.getByRole("button", { name: /^Letzte 3 Monate/ }).count()) === 1);
    await p.locator('button[aria-label="Schließen"]').last().click().catch(() => p.keyboard.press("Escape"));
    await p.waitForTimeout(300);

    const { html, text } = await quartalsBlatt(p);
    pruef("(Q2) Das Blatt ist A4 hoch", /@page[^}]*size:\s*A4 portrait/.test(html));
    pruef("(Q2) Rollierender Zeitraum steht im Kopf", /Jun 2026 – Aug 2026/.test(text), text.slice(0, 120));
    pruef("(Q2) Quote-Balken je Monat als SVG",
          (html.match(/<rect[^>]*fill="#2F6690"/g) || []).length === 3);
    pruef("(Q2) Monats-Tabelle mit Gesamt-Zeile", /Juni 2026/.test(text) && /Juli 2026/.test(text) && /August 2026/.test(text) && /Gesamt/.test(text));
    pruef("(Q2) Aufschlüsselung je Anlage vorhanden",
          /Je Anlage über die drei Monate/i.test(text) && /TS480/.test(text) && /Wasserrundgang/.test(text));
    pruef("(Q3) Gesamt-Quote stimmt: 4 von 6 erledigt · 67 %", /4 von 6 erledigt · 67 %/.test(text), text.slice(0, 160));
    pruef("(Q3) Monats-Quoten stimmen (100 / 50 / 50)",
          /100 %/.test(text) && (text.match(/50 %/g) || []).length >= 2);
    pruef("(Q3) Der Mai (außerhalb der drei Monate) fließt nicht ein", !/Mai/.test(text));
    pruef("(Q1-Q3) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (Q4) "Nur TPM" filtert R+I heraus ---- */
  {
    const { p, ctx } = await start(browser, [
      { id: "a1", date: "2026-08-10", category: "TPM", name: "TS480", status: "done" },
      { id: "a2", date: "2026-08-17", category: "RI", name: "Wasserrundgang", status: "open" },
    ], "2026-08-24T10:00:00");
    const { text } = await quartalsBlatt(p, "Nur TPM");
    pruef("(Q4) Nur TPM: 1 von 1 erledigt · 100 %, kein Wasserrundgang",
          /1 von 1 erledigt · 100 %/.test(text) && !/Wasserrundgang/.test(text), text.slice(0, 160));
    await ctx.close();
  }

  /* ---- (Q5) Jahreswechsel: Januar zeigt Nov, Dez, Januar ---- */
  {
    const { p, ctx, fehler } = await start(browser, [
      { id: "n1", date: "2026-11-09", category: "TPM", name: "TS480", status: "done" },
      { id: "d1", date: "2026-12-07", category: "TPM", name: "TS480", status: "open" },
      { id: "ja", date: "2027-01-11", category: "TPM", name: "TS480", status: "done" },
    ], "2027-01-20T10:00:00");
    const { text } = await quartalsBlatt(p);
    pruef("(Q5) Zeitraum läuft über die Jahresgrenze: Nov 2026 – Jan 2027", /Nov 2026 – Jan 2027/.test(text), text.slice(0, 120));
    pruef("(Q5) Alle drei Monate stehen mit Zahlen da",
          /November 2026/.test(text) && /Dezember 2026/.test(text) && /Januar 2027/.test(text) && /2 von 3 erledigt · 67 %/.test(text));
    pruef("(Q5) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (Q6) Leeres Quartal bleibt ehrlich ---- */
  {
    const { p, ctx, fehler } = await start(browser, [
      { id: "alt", date: "2026-01-05", category: "TPM", name: "TS480", status: "done" },
    ], "2026-08-24T10:00:00");
    const { text } = await quartalsBlatt(p);
    pruef("(Q6) Ohne Termine im Zeitraum: ehrliche Leermeldung",
          /ist nichts eingetragen/.test(text), text.slice(0, 160));
    pruef("(Q6) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  console.log(`\nHärte 54 (Quartals-Übersicht): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
