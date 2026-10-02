// Härtetest: SCHICHTBERICHT-KOPF FÜR DIE MORGENRUNDE (Robertos Wahl vom 02.10.:
// Vorlage A mit Tacho links neben der Überschrift, Knöpfe rechts, farbig statt
// schwarz – „man soll richtig erkennen, dass man es drücken kann“).
//
//  (K1) Tacho „TPM-Quote Oktober“ im Kopf, gerechnet FÄLLIG BIS HEUTE
//       (TPM + R+I mit Datum <= heute): 4 von 5 = 80 %. Die später im Monat
//       geplanten PitStops zählen nicht – die alte Monatsquote hätte 4 von 9
//       = 44 % gezeigt (Rot-Nachweis für die Rechenart).
//  (K2) Reihenfolge im Kopf: Überschrift · Tacho · Knöpfe · Stand.
//  (K3) Knöpfe sind farbig (Orange), nicht schwarz; der Haupt-Knopf gefüllt.
//  (K4) Knopf „TPM-Quote 3 Mon.“ (Roberto 02.10.: PitStop + R+I zusammen, nur
//       die letzten ABGESCHLOSSENEN Monate, der laufende bleibt draußen):
//       Jul 4/5 = 80 %, Aug 4/5 = 80 %, Sep 11/12 = 92 %, gesamt 19/22 = 86 %;
//       Oktober taucht nicht auf. Summe auf dem Knopf. Klick öffnet, zweiter schließt.
//  (K5) Knopf „PitStop“ zeigt heute / nächste 7 Tage / liegengeblieben
//       (offener PitStop vom 21.09. rot).
//  (K6) Top 3 klappt wie bisher (harte-93), die Knöpfe sind im Druck
//       unsichtbar, der Tacho bleibt im Druck stehen.
//  (K7) Datumsauswahl (Roberto 02.10.: "so kann man sich alte Zusammenfassungen
//       anschauen") im ECHTEN Blatt-Fenster: Tag 29.09. wählen -> das Blatt
//       der Morgenrunde vom Di., 29.09. (Schichten Mo. 28.09.), Hinweis
//       „Nachschau“, Tacho „TPM-Quote September“ 11/12 = 92 %, TPM-Quote
//       3 Monate = Jun–Aug 8/10 = 80 %; „↺ Heute“ führt zurück.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor hat das Blatt weder Tacho noch
// PitStop-Knöpfe (K1, K4, K5 rot), und „Top 3“ ist schwarz (K3 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");
const BILD = process.env.BILD_PFAD || "";

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] };
let n = 0;
const t = (date, cat, name, status) => ({ id: `t${n++}`, date, category: cat, name, status, updatedAt: "2026-10-01T06:00:00.000Z" });
const TERMINE = [
  // Juli: 4 PitStops erledigt + 1 R+I offen -> 4/5 = 80 %
  t("2026-07-06", "TPM", "B1", "done"), t("2026-07-13", "TPM", "B2", "done"), t("2026-07-20", "TPM", "TS480", "done"), t("2026-07-27", "TPM", "B3", "done"), t("2026-07-15", "RI", "Energieaufschreibung", "open"),
  // August: 4 PitStops, 3 erledigt + 1 R+I erledigt -> 4/5 = 80 %
  t("2026-08-14", "RI", "Kompressor Rundgang", "done"),
  t("2026-08-05", "TPM", "B1", "done"), t("2026-08-12", "TPM", "B2", "done"), t("2026-08-19", "TPM", "TS480", "done"), t("2026-08-26", "TPM", "B3", "open"),
  // September: 10 PitStops, 9 erledigt + 2 R+I erledigt -> 11/12 = 92 % (der offene 21.09. ist "liegengeblieben")
  t("2026-09-11", "RI", "Werkstattreinigung", "done"), t("2026-09-25", "RI", "Elevatorprüfung", "done"),
  ...["01", "03", "08", "10", "14", "15", "17", "22", "24"].map((d) => t(`2026-09-${d}`, "TPM", "VSM2", "done")), t("2026-09-21", "TPM", "KUKA I", "open"),
  // Oktober bis heute (02.10.): 3 PitStops + 1 R+I erledigt, 1 PitStop offen
  t("2026-10-01", "TPM", "B1", "done"), t("2026-10-01", "TPM", "B4", "done"), t("2026-10-02", "TPM", "VSM2", "done"), t("2026-10-02", "TPM", "B5", "open"), t("2026-10-01", "RI", "Kompressor Rundgang", "done"),
  // Oktober später: 4 geplante PitStops (zählen NICHT in die Quote)
  t("2026-10-05", "TPM", "B2", "open"), t("2026-10-08", "TPM", "TS480", "open"), t("2026-10-12", "TPM", "B3", "open"), t("2026-10-20", "TPM", "B1", "open"),
];
const STOER = [
  { id: "s1", nr: 700, date: "2026-10-01", schicht: "Früh", anlage: "HRO", stoerung: "Test", ursache: "Riemen", offen: false, ausfallzeit: 10, melder: "T. Balles", gemeldetAt: "2026-10-01T07:00:00.000Z" },
  { id: "s2", nr: 690, date: "2026-09-28", schicht: "Spät", anlage: "Heimsoth Rollenofen", stoerung: "Alter Bericht vom Montag", ursache: "Lichtschranke", offen: false, ausfallzeit: 25, melder: "T. Balles", gemeldetAt: "2026-09-28T15:00:00.000Z" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.clock.setFixedTime(new Date("2026-10-02T07:52:00"));
  await p.addInitScript(({ c, s, termine }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(termine));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
    localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
    window.__blatt = "";
    window.open = function () { return { document: { open() {}, write(h) { window.__blatt += h; }, close() {} }, focus() {}, print() {} }; };
  }, { c: config, s: STOER, termine: TERMINE });
  await p.goto(APP);
  await p.waitForTimeout(1300);
  await p.getByRole("button", { name: /^Berichte\s*\d*$/i }).first().click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: /^Störungen\s*\d*$/i }).first().click(); await p.waitForTimeout(400);
  await p.locator('button[aria-label="Schichtbericht anzeigen"]').click(); await p.waitForTimeout(400);
  const html = await p.evaluate(() => window.__blatt);

  const b = await ctx.newPage();
  await b.setViewportSize({ width: 1600, height: 900 });
  await b.setContent(html);
  await b.waitForTimeout(300);

  /* (K1) Tacho */
  const tacho = b.locator("[data-tpm-tacho]");
  const tachoLabel = (await tacho.count()) ? await tacho.getAttribute("aria-label") : "";
  const tachoText = (await tacho.count()) ? (await tacho.innerText()).replace(/\s+/g, " ") : "";
  ok("(K1) Tacho „TPM-Quote Oktober“: fällig bis heute 4 von 5 = 80 % (nicht 4 von 9 = 44 %)",
    tachoLabel === "TPM-Quote Oktober: 80 %, fällig bis heute 4 von 5" && /80 %/.test(tachoText) && (await tacho.locator("svg").count()) === 1, `${tachoLabel} | ${tachoText}`);

  /* (K2) Reihenfolge */
  const reihe = await b.evaluate(() => {
    const x = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().left) : -1; };
    return [x(".kopf h1"), x("[data-tpm-tacho]"), x(".knopfleiste"), x(".kopf .stand")];
  });
  ok("(K2) Kopf von links nach rechts: Überschrift · Tacho · Knöpfe · Stand", reihe.every((v, i) => v >= 0 && (i === 0 || v > reihe[i - 1])), reihe.join(" < "));

  /* (K3) Farbe */
  const farben = await b.evaluate(() => [...document.querySelectorAll(".knopfleiste button")].map((k) => [k.textContent.trim().slice(0, 14), getComputedStyle(k).backgroundColor, getComputedStyle(k).borderTopColor]));
  ok("(K3) Drei Knöpfe, keiner schwarz: Haupt-Knopf orange gefüllt, PitStop und Top 3 orange umrandet",
    farben.length === 3 && farben[0][1] === "rgb(232, 115, 42)" && farben.slice(1).every((f) => f[1] === "rgb(255, 255, 255)" && f[2] === "rgb(232, 115, 42)") && !farben.some((f) => f[1] === "rgb(34, 38, 43)"), JSON.stringify(farben));

  /* (K4) PitStop-Quote */
  const qk = b.locator("[data-pitquote-knopf]"), qa = b.locator("#pitquote");
  const knopfText = (await qk.innerText()).replace(/\s+/g, " ");
  ok("(K4) Knopf „TPM-Quote“ trägt die 3-Monats-Summe (86 %), Abschnitt zunächst zu", /TPM-Quote 3 Mon\. · 86 %/.test(knopfText) && !(await qa.isVisible()), knopfText);
  await qk.click(); await b.waitForTimeout(200);
  const monate = await b.locator("[data-pq-monat]").evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
  const gesamt = await b.locator("[data-pq-gesamt]").innerText();
  ok("(K4) Klick zeigt Jul 80 % (4/5), Aug 80 % (4/5), Sep 92 % (11/12) – PitStop + R+I, ohne Oktober; gesamt 86 %",
    (await qa.isVisible()) && monate.length === 3 && /^80 % Jul · 4 \/ 5$/.test(monate[0]) && /^80 % Aug · 4 \/ 5$/.test(monate[1]) && /^92 % Sep · 11 \/ 12$/.test(monate[2]) && !/Okt/.test(monate.join(" ")) && gesamt.trim() === "86 %" && /schließen/.test(await qk.innerText()),
    monate.join(" | ") + " · " + gesamt);
  await qk.click(); await b.waitForTimeout(200);
  ok("(K4) Zweiter Klick schließt, Knopf zeigt wieder die Summe", !(await qa.isVisible()) && /86 %/.test(await qk.innerText()));

  /* (K5) PitStop-Liste */
  const pk = b.locator("[data-pitliste-knopf]");
  await pk.click(); await b.waitForTimeout(200);
  const pl = async (k) => (await b.locator(`[data-pl="${k}"]`).innerText()).replace(/\s+/g, " ");
  const heute = await pl("heute"), woche = await pl("woche"), liegen = await pl("liegen");
  ok("(K5) PitStop-Liste: heute VSM2 ✓ und B5; nächste 7 Tage B2 (05.10.) und TS480 (08.10.), nicht B3 (12.10.)",
    /VSM2 ✓ erledigt/.test(heute) && /B5/.test(heute) && /B2/.test(woche) && /TS480/.test(woche) && !/B3/.test(woche), `${heute} | ${woche}`);
  const liegenRot = await b.locator('[data-pl="liegen"] .pl-t').evaluate((e) => getComputedStyle(e).color);
  ok("(K5) Liegengeblieben: KUKA I vom 21.09. und B3 vom 26.08., Überschrift rot", /Liegengeblieben \(2\)/i.test(liegen) && /KUKA I/.test(liegen) && /B3/.test(liegen) && liegenRot === "rgb(178, 58, 52)", liegen);
  if (BILD) {
    await b.locator("[data-pitliste-knopf]").click(); await b.locator("[data-pitquote-knopf]").click(); await b.waitForTimeout(200);
    await b.screenshot({ path: BILD, clip: { x: 0, y: 0, width: 1600, height: 330 } });
    await b.locator("[data-pitquote-knopf]").click(); await b.locator("[data-pitliste-knopf]").click(); await b.waitForTimeout(100);
  }

  /* (K6) Top 3 + Druck */
  const tk = b.locator("[data-top3-knopf]");
  await tk.click(); await b.waitForTimeout(150);
  const top3Auf = await b.locator("#top3").isVisible();
  await tk.click(); await b.waitForTimeout(150);
  ok("(K6) Top 3 klappt auf und zu wie bisher", top3Auf && !(await b.locator("#top3").isVisible()));
  await b.emulateMedia({ media: "print" });
  const druck = await b.evaluate(() => ({ leiste: getComputedStyle(document.querySelector(".knopfleiste")).display, tacho: getComputedStyle(document.querySelector("[data-tpm-tacho]")).display }));
  ok("(K6) Im Druck: Knöpfe unsichtbar, Tacho bleibt stehen", druck.leiste === "none" && druck.tacho !== "none", JSON.stringify(druck));

  /* (K7) Datumsauswahl im echten Fenster (ohne abgefangenes window.open) */
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const q = await ctx2.newPage();
    q.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await q.clock.setFixedTime(new Date("2026-10-02T07:52:00"));
    await q.addInitScript(({ c, s, termine }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(termine));
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
      localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
    }, { c: config, s: STOER, termine: TERMINE });
    await q.goto(APP);
    await q.waitForTimeout(1300);
    await q.getByRole("button", { name: /^Berichte\s*\d*$/i }).first().click(); await q.waitForTimeout(300);
    await q.getByRole("button", { name: /^Störungen\s*\d*$/i }).first().click(); await q.waitForTimeout(400);
    const [fenster] = await Promise.all([q.waitForEvent("popup"), q.locator('button[aria-label="Schichtbericht anzeigen"]').click()]);
    await fenster.waitForTimeout(400);
    fenster.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR (Blatt):", e.message); });
    const vorher = await fenster.locator("body").innerText();
    ok("(K7) Blatt zeigt heute die Datumsauswahl mit 02.10., ohne Nachschau-Hinweis", (await fenster.locator("[data-datum-wahl]").inputValue()) === "2026-10-02" && (await fenster.locator("[data-nachschau]").count()) === 0 && !/Alter Bericht vom Montag/.test(vorher));
    await fenster.locator("[data-datum-wahl]").fill("2026-09-29");
    await fenster.waitForTimeout(500);
    const nach = (await fenster.locator("body").innerText()).replace(/\s+/g, " ");
    const tachoAlt = await fenster.locator("[data-tpm-tacho]").getAttribute("aria-label");
    const quoteAlt = (await fenster.locator("[data-pitquote-knopf]").innerText()).replace(/\s+/g, " ");
    ok("(K7) Tag 29.09. gewählt: Nachschau der Morgenrunde Di., 29.09. mit dem Bericht vom Mo., 28.09.",
      (await fenster.locator("[data-nachschau]").count()) === 1 && /Morgenrunde Di\., 29\.09\.2026/.test(nach) && /Alter Bericht vom Montag/.test(nach) && !/HRO Test/.test(nach) && (await fenster.locator("[data-datum-wahl]").inputValue()) === "2026-09-29", nach.slice(0, 260));
    ok("(K7) Kennzahlen auf den 29.09. bezogen: TPM-Quote September 92 % (11 von 12), 3 Monate Jun–Aug 80 %",
      tachoAlt === "TPM-Quote September: 92 %, fällig bis heute 11 von 12" && /TPM-Quote 3 Mon\. · 80 %/.test(quoteAlt), `${tachoAlt} | ${quoteAlt}`);
    await fenster.locator("[data-heute-knopf]").click();
    await fenster.waitForTimeout(500);
    ok("(K7) „↺ Heute“ führt zurück: wieder 02.10., kein Nachschau-Hinweis, Tacho Oktober",
      (await fenster.locator("[data-datum-wahl]").inputValue()) === "2026-10-02" && (await fenster.locator("[data-nachschau]").count()) === 0 && /TPM-Quote Oktober/.test(await fenster.locator("[data-tpm-tacho]").getAttribute("aria-label")));
    if (BILD) {
      await fenster.locator("[data-datum-wahl]").fill("2026-09-29"); await fenster.waitForTimeout(400);
      await fenster.setViewportSize({ width: 1600, height: 900 });
      await fenster.screenshot({ path: BILD.replace(/\.png$/, "-nachschau.png"), clip: { x: 0, y: 0, width: 1600, height: 260 } });
    }
    await ctx2.close();
  }

  ok("(E) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
