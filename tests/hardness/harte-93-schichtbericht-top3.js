// Härtetest: TOP 3 IM SCHICHTBERICHT + RECHT „SCHICHTBERICHT" (Robertos
// Ansage vom 28.09.: "oben im geöffneten Blatt ein Knopf 'Top 3' - unsere
// aktuellen Top 3 aus diesem Schichtbericht mit kleiner Analyse, z. B. TS480
// Hubeinleger und daneben '4× letzte 7 Tage'; und ich muss wählen können,
// wer den Schichtbericht-Knopf sieht")
//
//  (T1) Das Blatt trägt oben den Knopf „Top 3“ und einen zunächst
//       verborgenen Abschnitt; Klick zeigt ihn, zweiter Klick verbirgt ihn.
//  (T2) Drei Karten, nach Häufigkeit in 7 Tagen: Platz 1 TS 480 · Hubeinleger
//       mit „4×“ und „letzte 7 Tage“, Analyse „Wiederholt sich: 4 Berichte in
//       7 Tagen“, „30 Tage: 5×“, „Häufigste Ursache: Reedschalter defekt (3×)“;
//       Platz 2 KUKA „2×“; Platz 3 Rollenofen „1×“ „Einmalig“.
//  (T3) Im Druck ist der Knopf unsichtbar (nur am Bildschirm).
//  (T4) Leeres Blatt: „Keine Störungen im Blatt“.
//  (T5) PitStop-Zeile: „Aktuell PitStop“ (heute, erledigte mit ✓) und
//       „Nächster PitStop“ (erster Tag nach heute, dazu die zwei danach).
//  (R1) Rechte-Tabelle: Zeile „Schichtbericht“ für Bearbeiter und Leser,
//       Standard „sehen“; Verwalter stellt Leser auf „aus“ -> Leser ohne Knopf,
//       Verwalter behält ihn.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor kennt das Blatt keinen Knopf „Top 3“ (T1
// rot) und die Rechte-Tabelle keine Zeile „Schichtbericht“ (R1 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Bea", rolle: "bearbeiter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }],
};
let nr = 600;
const b = (date, schicht, anlage, teil, stoerung, ursache, min, offen) => ({ id: `s${nr}`, nr: nr++, date, schicht, anlage, anlagenteil: teil, stoerung, ursache, offen: !!offen, ausfallzeit: min, melder: "T. Balles", gemeldetAt: date + "T10:00:00.000Z" });
// Montag 28.09. 08:00 -> Blatt = Freitag 25.09. (Früh/Spät/Nacht). 7 Tage = 22.–28.09., 30 Tage ab 30.08.
const HUB = ["TS 480 ADL", "Hubeinleger"];
const STOER = [
  b("2026-09-25", "Früh", ...HUB, "Hubeinleger fährt nicht hoch", "Reedschalter defekt", 20, false),
  b("2026-09-25", "Spät", ...HUB, "Hubeinleger fährt nicht hoch", "Reedschalter defekt", 60, true),
  b("2026-09-23", "Früh", ...HUB, "Hubeinleger hängt", "Reedschalter defekt", 15, false),
  b("2026-09-22", "Spät", ...HUB, "Hubeinleger hängt", "Führung trocken", 10, false),
  b("2026-09-05", "Früh", ...HUB, "Hubeinleger hängt", "Führung trocken", 10, false), // nur 30 Tage
  b("2026-09-25", "Früh", "KUKA I Pal-Roboter", "Vakuum", "Nimmt nicht alle Töpfe ab", "Ventil verschmutzt", 5, false),
  b("2026-09-24", "Nacht", "KUKA I Pal-Roboter", "Vakuum", "Nimmt nicht alle Töpfe ab", "Ventil verschmutzt", 5, false),
  b("2026-09-25", "Nacht", "Heimsoth Rollenofen", "Lichtschranke", "Ofen stoppt am Einlauf", "Lichtschranke verstellt", 25, false),
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (benutzer, stoer, konfig, termine) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date("2026-09-28T08:00:00"));
    await p.addInitScript(({ c, s, benutzer, t }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", c);
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(t || []));
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
      localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
      window.__blatt = "";
      window.open = function () { return { document: { open() {}, write(h) { window.__blatt += h; }, close() {} }, focus() {}, print() {} }; };
    }, { c: konfig || JSON.stringify(config), s: stoer, benutzer, t: termine || [] });
    await p.goto(APP);
    await p.waitForTimeout(1300);
    return { p, ctx, fehler, zu: () => ctx.close() };
  };
  const zuStoerungen = async (p) => {
    await p.getByRole("button", { name: /^Berichte\s*\d*$/i }).first().click(); await p.waitForTimeout(300);
    await p.getByRole("button", { name: /^Störungen\s*\d*$/i }).first().click(); await p.waitForTimeout(400);
  };
  const knopf = (p) => p.locator('button[aria-label="Schichtbericht anzeigen"]');
  const blatt = async (p) => { await p.evaluate(() => { window.__blatt = ""; }); await knopf(p).click(); await p.waitForTimeout(400); return p.evaluate(() => window.__blatt); };

  /* ---------- Blatt mit Top 3 ---------- */
  {
    const { p, ctx, fehler, zu } = await seite("Chef", STOER);
    await zuStoerungen(p);
    const html = await blatt(p);
    // Das abgefangene Blatt in einer eigenen Seite darstellen - so lässt sich klicken und messen.
    const b2 = await ctx.newPage();
    await b2.setViewportSize({ width: 1400, height: 900 });
    await b2.setContent(html);
    await b2.waitForTimeout(300);
    const kn = b2.locator("[data-top3-knopf]");
    const ab = b2.locator("#top3");
    ok("(T1) Das Blatt trägt oben den Knopf „Top 3“, der Abschnitt ist zunächst verborgen",
      (await kn.count()) === 1 && /Top 3/.test(await kn.innerText()) && (await ab.count()) === 1 && !(await ab.isVisible()));
    await kn.click(); await b2.waitForTimeout(200);
    ok("(T1) Klick zeigt die Top 3 (Knopf: „Top 3 schließen“)", (await ab.isVisible()) && /schließen/.test(await kn.innerText()) && (await kn.getAttribute("aria-expanded")) === "true");
    const karten = b2.locator("[data-top3-karte]");
    const k1 = (await karten.nth(0).innerText()).replace(/\s+/g, " ");
    const k2 = (await karten.nth(1).innerText()).replace(/\s+/g, " ");
    const k3 = (await karten.nth(2).innerText()).replace(/\s+/g, " ");
    ok("(T2) Drei Karten", (await karten.count()) === 3);
    ok("(T2) Platz 1: TS 480 ADL · Hubeinleger mit „4×“ und „letzte 7 Tage“",
      /^1 TS 480 ADL Hubeinleger/.test(k1) && /\b4×/.test(k1) && /letzte 7 Tage/i.test(k1), k1.slice(0, 120));
    ok("(T2) Platz 1: kleine Analyse - wiederholt sich, 30 Tage, offen, häufigste Ursache, zuletzt",
      /Wiederholt sich: 4 Berichte in 7 Tagen/.test(k1) && /30 Tage: 5×/.test(k1) && /1 offen/.test(k1) && /Häufigste Ursache: Reedschalter defekt \(3×\)/.test(k1) && /Zuletzt: Fr\., 25\.09\. Spät/.test(k1) && /105 min Ausfall/.test(k1), k1.slice(0, 260));
    ok("(T2) Platz 2: KUKA „2×“ · Platz 3: Rollenofen „1×“ „Einmalig“",
      /^2 KUKA I Pal-Roboter/.test(k2) && /\b2×/.test(k2) && /Zweimal in 7 Tagen/.test(k2) && /^3 Heimsoth Rollenofen/.test(k3) && /\b1×/.test(k3) && /Einmalig/.test(k3), k2.slice(0, 60) + " | " + k3.slice(0, 60));
    const zahl = await karten.nth(0).locator(".tk-zahl").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const anlage = await karten.nth(0).locator(".tk-anlage").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    ok("(T2) Groß und deutlich: Zahl ≥ 30 px, Anlagenname ≥ 17 px", zahl >= 30 && anlage >= 17, `${zahl}/${anlage}`);
    ok("(T2) Sieben Tagesbalken je Karte", (await karten.nth(0).locator(".tb1").count()) === 7);
    await kn.click(); await b2.waitForTimeout(200);
    ok("(T1) Zweiter Klick verbirgt die Top 3 wieder", !(await ab.isVisible()) && (await kn.getAttribute("aria-expanded")) === "false");
    await b2.emulateMedia({ media: "print" });
    ok("(T3) Im Druck ist der Knopf unsichtbar", !(await kn.isVisible()));
    await b2.emulateMedia({ media: "screen" });
    ok("(E) Keine Skriptfehler (Blatt)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  /* ---------- PitStop-Zeile: Aktuell (heute) und Nächster (Roberto 28.09.) ---------- */
  {
    const termine = [
      { id: "p1", date: "2026-09-28", category: "TPM", name: "RRO", status: "open" },
      { id: "p2", date: "2026-09-28", category: "TPM", name: "VSM2", status: "done" },
      { id: "p3", date: "2026-10-01", category: "TPM", name: "B1", status: "open" },
      { id: "p4", date: "2026-10-02", category: "TPM", name: "VSM2", status: "open" },
      { id: "p5", date: "2026-09-25", category: "TPM", name: "ALT", status: "open" },
    ];
    const { p, zu } = await seite("Chef", STOER, null, termine);
    await zuStoerungen(p);
    const html = await blatt(p);
    const zeile = (html.match(/<div class="hinweis pit"[\s\S]*?<\/div>/) || [""])[0];
    ok("(T5) Die Zeile nennt den heutigen PitStop („Aktuell PitStop: RRO, VSM2 ✓“) UND den nächsten („Do., 01.10.2026 · B1 · danach: 02.10. VSM2“)",
      /Aktuell PitStop: <b>RRO<\/b>, <b>VSM2<\/b> ✓/.test(zeile) && /Nächster PitStop: <b>Do\., 01\.10\.2026<\/b> · <b>B1<\/b>/.test(zeile) && /danach: 02\.10\. VSM2/.test(zeile) && !/ALT/.test(zeile) && !/Nach Wochenende/.test(html), zeile.replace(/<[^>]+>/g, "").slice(0, 160));
    await zu();
  }
  /* ---------- Leeres Blatt ---------- */
  {
    const { p, ctx, zu } = await seite("Chef", []);
    await zuStoerungen(p);
    const html = await blatt(p);
    const b2 = await ctx.newPage(); await b2.setContent(html);
    await b2.locator("[data-top3-knopf]").click(); await b2.waitForTimeout(200);
    ok("(T4) Leeres Blatt: „Keine Störungen im Blatt“", /Keine Störungen im Blatt/.test(await b2.locator("#top3").innerText()));
    await zu();
  }
  /* ---------- Recht „Schichtbericht“ ---------- */
  {
    const { p, fehler, zu } = await seite("Chef", STOER);
    await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Benutzer & Rechte", exact: true }).click(); await p.waitForTimeout(400);
    const lesSel = p.locator('select[aria-label="Leser: Schichtbericht"]');
    const beaSel = p.locator('select[aria-label="Bearbeiter: Schichtbericht"]');
    ok("(R1) Die Rechte-Tabelle hat die Zeile „Schichtbericht“ - Standard „sehen“ für Bearbeiter und Leser",
      (await lesSel.count()) === 1 && (await beaSel.count()) === 1 && (await lesSel.inputValue()) === "sehen" && (await beaSel.inputValue()) === "sehen");
    await lesSel.selectOption("aus"); await p.waitForTimeout(700);
    // Der örtliche Spiegel trägt die Benutzerliste nicht mit (Wächter-Feld,
    // wie harte-84/85) - für die nächsten Rechner wird sie wieder angehängt,
    // sonst gäbe es dort keine Anmeldung und damit keine Gruppe.
    const konfig = JSON.stringify({ ...JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-config")) || "{}"), benutzer: config.benutzer });
    const r = JSON.parse(konfig || "{}").rechte;
    ok("(R1) Die Wahl steht in der Konfiguration (leser.SCHICHTBERICHT = aus)", !!r && r.leser && r.leser.SCHICHTBERICHT === "aus", JSON.stringify(r && r.leser && r.leser.SCHICHTBERICHT));
    await p.locator('button[aria-label="Schließen"]').last().click().catch(() => p.keyboard.press("Escape")); await p.waitForTimeout(300);
    await zuStoerungen(p);
    ok("(R1) Der Verwalter behält den Knopf", (await knopf(p).count()) === 1);
    ok("(E) Keine Skriptfehler (Verwalter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
    // Leser mit derselben Konfiguration
    const lea = await seite("Lea", STOER, konfig);
    await zuStoerungen(lea.p);
    ok("(R1) Leser auf „aus“: kein Schichtbericht-Knopf (Störungen selbst bleiben sichtbar)",
      (await knopf(lea.p).count()) === 0 && /Störberichte/i.test(await lea.p.locator("body").innerText()));
    ok("(E) Keine Skriptfehler (Leser)", lea.fehler.length === 0, lea.fehler.slice(0, 2).join(" | "));
    await lea.zu();
    const bea = await seite("Bea", STOER, konfig);
    await zuStoerungen(bea.p);
    ok("(R1) Bearbeiter (weiter „sehen“) behält den Knopf", (await knopf(bea.p).count()) === 1);
    await bea.zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
