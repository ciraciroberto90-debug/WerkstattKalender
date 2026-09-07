// Härtetest: AUSWERTUNG ALS DIAGRAMM + QUOTE AUF JEDER VORLAGE.
//
// Robertos Ansage vom 18.08.2026:
//  - Die Monats-Auswertung braucht es auch als Diagramm (am Bildschirm),
//  - Monats- und Jahres-Diagramm zusätzlich als A4-Druckvorlagen,
//  - JEDE Auswertungs-Vorlage (Matrix wie Diagramm) trägt leserlich oben
//    "X von Y erledigt · Z %",
//  - die "Wartungsplan – Tabelle" fällt weg (Bildschirm UND Druck).
//
// Geprüft wird:
//  (1) Das Monats-Diagramm erscheint nach dem Aufklappen der Auswertung
//      und nennt die Quote im Format "X von Y erledigt · Z %".
//  (2) Der Druckdialog bietet das Monats-Diagramm an; das separate
//      Jahres-Diagramm ist seit dem 07.09. auf Robertos Entscheidung
//      entfallen (der freie Zeitraum Jan-Dez liefert dasselbe Blatt).
//  (3) Die Monats-Diagramm-Vorlage: A4 hoch, Balken als SVG, Quote oben,
//      Zahlen als Tabelle.
//  (4) Der Jahres-Blick über den freien Zeitraum Jan-Dez: Quote je Monat,
//      leere Monate ehrlich als "keine Termine", Jahres-Quote oben -
//      dieselben Zusicherungen wie beim alten Jahres-Diagramm.
//  (5) Jahreskalender und Monatsblatt tragen die Quote ebenfalls oben.
//  (6) Die "Wartungsplan – Tabelle" ist verschwunden - am Bildschirm wie
//      im Wartungsplan-Druck.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

// August 2026: 3 erledigt + 2 offen = "3 von 5 erledigt · 60 %".
// Januar: 1 von 1 (100 %). März bleibt bewusst LEER -> "keine Termine".
const eintraege = [
  { id: "a1", date: "2026-08-03", category: "TPM", name: "TS200", status: "done" },
  { id: "a2", date: "2026-08-10", category: "TPM", name: "TS320", status: "done" },
  { id: "a3", date: "2026-08-17", category: "RI", name: "Wasserrundgang", status: "done" },
  { id: "a4", date: "2026-08-24", category: "TPM", name: "TS480", status: "open" },
  { id: "a5", date: "2026-08-25", category: "RI", name: "Regalkontrolle", status: "open" },
  { id: "j1", date: "2026-01-12", category: "TPM", name: "TS200", status: "done" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-18T09:00:00"));
  await p.addInitScript((d) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(d));
  }, eintraege);
  await p.goto(APP);
  await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Plan", exact: true }).first().click();
  await p.waitForTimeout(600);

  /* ---- (6) Bildschirm: keine Wartungsplan-Tabelle mehr ---- */
  const vorher = await p.locator("body").innerText();
  pruef("(6) Am Bildschirm gibt es keine 'Wartungsplan – Tabelle' mehr",
        !/Wartungsplan – Tabelle/i.test(vorher));

  /* ---- (1) Monats-Diagramm am Bildschirm ---- */
  pruef("(1) Vor dem Aufklappen ist das Monats-Diagramm nicht da",
        !/MONATS-DIAGRAMM/i.test(vorher));
  await p.getByRole("button", { name: /Auswertung.*Druckvorlagen/ }).first().click();
  await p.waitForTimeout(1100);
  const offen = await p.locator("body").innerText();
  pruef("(1) Nach dem Aufklappen steht das Monats-Diagramm da",
        /MONATS-DIAGRAMM – AUGUST 2026/i.test(offen));
  pruef("(1) Es nennt die Quote als 'X von Y erledigt · Z %'",
        /3 von 5 erledigt · 60 %/.test(offen));
  pruef("(1) Die Balken sind echtes SVG (Erledigt grün, Offen rot)",
        (await p.locator('svg[aria-label*="Monats-Diagramm"] rect[fill="#2F7D4F"]').count()) === 3 &&
        (await p.locator('svg[aria-label*="Monats-Diagramm"] rect[fill="#B23A34"]').count()) === 2);

  /* ---- (2) Der Druckdialog bietet die Diagramme an ---- */
  await p.locator('button[aria-label="Drucken"]').click();
  await p.waitForTimeout(300);
  const dialog = p.locator('div[role="dialog"][aria-label="Was soll gedruckt werden?"]');
  pruef("(2) Der Druckdialog fragt erst", (await dialog.count()) === 1);
  const blattWahl = p.locator('select[aria-label="Blatt wählen"]');
  pruef("(2) Das Monats-Diagramm steht im Aufklappfeld zur Wahl",
        (await blattWahl.locator('option[value="diagramm-monat"]').count()) === 1);
  pruef("(2) Das alte Jahres-Diagramm ist bewusst NICHT mehr im Angebot",
        (await blattWahl.locator("option", { hasText: "Jahres-Diagramm" }).count()) === 0);

  /* ---- (3) Monats-Diagramm als A4-Vorlage ---- */
  await blattWahl.selectOption("diagramm-monat");
  await p.waitForTimeout(400);
  const [popupM] = await Promise.all([
    p.waitForEvent("popup"),
    p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
  ]);
  await popupM.waitForLoadState("domcontentloaded");
  await popupM.waitForTimeout(400);
  const htmlM = await popupM.content();
  const textM = await popupM.locator("body").innerText();
  pruef("(3) Monats-Diagramm: A4 hoch", /@page[^}]*size:\s*A4 portrait/.test(htmlM));
  pruef("(3) Monats-Diagramm: die Quote steht leserlich oben",
        /3 von 5 erledigt · 60 %/.test(textM));
  pruef("(3) Monats-Diagramm: die Balken sind da (3 grün, 2 rot)",
        (await popupM.locator('svg rect[fill="#2F7D4F"]').count()) === 3 &&
        (await popupM.locator('svg rect[fill="#B23A34"]').count()) === 2);
  pruef("(3) Monats-Diagramm: die Zahlen stehen als Tabelle darunter",
        /Die Tage im Einzelnen/i.test(textM) && textM.includes("TS480") && textM.includes("✓ TS200"));
  await popupM.close();

  /* ---- (4) Jahres-Blick: freier Zeitraum Jan-Dez ---- */
  await p.locator('button[aria-label="Drucken"]').click();
  await p.waitForTimeout(300);
  await p.locator('select[aria-label="Blatt wählen"]').selectOption("diagramm-quartal");
  await p.waitForTimeout(400);
  await p.locator('select[aria-label="Zeitraum von"]').selectOption("2026-01");
  await p.waitForTimeout(300);
  await p.locator('select[aria-label="Zeitraum bis"]').selectOption("2026-12");
  await p.waitForTimeout(400);
  const [popupJ] = await Promise.all([
    p.waitForEvent("popup"),
    p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
  ]);
  await popupJ.waitForLoadState("domcontentloaded");
  await popupJ.waitForTimeout(400);
  const htmlJ = await popupJ.content();
  const textJ = await popupJ.locator("body").innerText();
  pruef("(4) Jahres-Blick: A4 hoch", /@page[^}]*size:\s*A4 portrait/.test(htmlJ));
  // Jahr 2026 gesamt: 4 erledigt von 6 = 67 %
  pruef("(4) Jahres-Blick: die Jahres-Quote steht leserlich oben",
        /4 von 6 erledigt · 67 %/.test(textJ));
  pruef("(4) Jahres-Blick: die Monats-Quoten stehen als Zahlen da",
        /100 %/.test(textJ) && /60 %/.test(textJ));
  pruef("(4) Jahres-Blick: leere Monate heißen ehrlich 'keine Termine', nicht 0 %",
        // Nur die MONATS-Zeilen zählen: In der Anlagen-Tabelle ist "0 %"
        // ehrlich (0 von 1 erledigt) - beim alten Jahres-Diagramm gab es
        // diese Tabelle nicht.
        (textJ.match(/keine Termine/g) || []).length === 10 &&
        textJ.split("\n").filter((z) => /^\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) 2026/.test(z) && /\b0 %/.test(z)).length === 0,
        `${(textJ.match(/keine Termine/g) || []).length} mal "keine Termine"`);
  await popupJ.close();

  /* ---- (5) Auch Jahreskalender und Monatsblatt tragen die Quote ---- */
  await p.locator('button[aria-label="Drucken"]').click();
  await p.waitForTimeout(300);
  await p.locator('select[aria-label="Blatt wählen"]').selectOption("jahreskalender");
  await p.waitForTimeout(300);
  const [popupK] = await Promise.all([
    p.waitForEvent("popup"),
    p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
  ]);
  await popupK.waitForLoadState("domcontentloaded");
  await popupK.waitForTimeout(400);
  pruef("(5) Jahreskalender: '4 von 6 erledigt · 67 %' steht oben",
        /4 von 6 erledigt · 67 %/.test(await popupK.locator("body").innerText()));
  await popupK.close();

  await p.locator('button[aria-label="Drucken"]').click();
  await p.waitForTimeout(300);
  await p.locator('select[aria-label="Blatt wählen"]').selectOption("monatsblatt");
  await p.waitForTimeout(300);
  const [popupE] = await Promise.all([
    p.waitForEvent("popup"),
    p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
  ]);
  await popupE.waitForLoadState("domcontentloaded");
  await popupE.waitForTimeout(400);
  pruef("(5) Monatsblatt: '3 von 5 erledigt · 60 %' steht oben",
        /3 von 5 erledigt · 60 %/.test(await popupE.locator("body").innerText()));
  await popupE.close();

  /* ---- (6) Wartungsplan-Druck ohne Tabellen-Seite ---- */
  await p.locator('button[aria-label="Drucken"]').click();
  await p.waitForTimeout(300);
  await p.locator('select[aria-label="Blatt wählen"]').selectOption("wartungsplan-monat");
  await p.waitForTimeout(300);
  const [popupW] = await Promise.all([
    p.waitForEvent("popup"),
    p.locator('div[role="dialog"] button:has-text("Drucken")').last().click(),
  ]);
  await popupW.waitForLoadState("domcontentloaded");
  await popupW.waitForTimeout(400);
  const textW = await popupW.locator("body").innerText();
  pruef("(6) Der Wartungsplan-Druck hat keine Tabellen-Seite mehr",
        !/Wartungsplan – Tabelle/i.test(textW));
  pruef("(6) Der Kalender selbst ist noch da", /KALENDER – AUGUST 2026/i.test(textW) || /Kalender – August 2026/.test(textW));
  await popupW.close();

  pruef("(7) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  await browser.close();
  console.log(`\nHärte 45 (Auswertungs-Diagramme + Quote): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
