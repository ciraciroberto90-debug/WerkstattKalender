// Härtetest: SCHICHTBERICHT MIT EINEM KLICK + KLUGE SCHICHTWAHL (Robertos
// Ansage vom 28.09.: "bei Störungen oben rechts ein extra Button, der mir die
// PDF anzeigt - letzte 3 Schichten; montags oder bei Feiertag nach dem
// Wochenende die letzten 3 Schichten mit Eintrag")
//
//  (S1) Mittwoch: der Knopf "Schichtbericht anzeigen" steht im Störungs-
//       Bereich; Klick öffnet das bekannte Blatt ohne Druck-Dialog mit den
//       drei Schichten von jetzt (Mi Früh, Di Nacht, Di Spät) - kein Hinweis.
//  (S2) Montag 08:00, Wochenende leer: das Blatt zeigt die drei Freitag-
//       Schichten, dazu der Hinweis "Nach Wochenende oder Feiertag …"; kein
//       Sonntag im Blatt.
//  (S3) Montag, ein Bericht am Samstag Früh: er zählt mit (Sa Früh, Fr Nacht,
//       Fr Spät) - der Freitag Früh fällt heraus.
//  (S4) Dienstag nach Pfingstmontag (25.05.2026): die letzten drei Schichten
//       mit Einträgen liegen am Freitag/Donnerstag davor; kein 25.05. im Blatt.
//  (S5) Montag mit einem Bericht in der laufenden Frühschicht: sie zählt mit.
//  (S6) Montag ohne einen einzigen Bericht in 30 Tagen: das Blatt bleibt beim
//       Fenster von jetzt (kein Hinweis).
//  (S7) Leser: der Knopf ist da (Anschauen ist Lesen).
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor gibt es keinen Knopf "Schichtbericht
// anzeigen" (S1 rot), und montags stünden Sonntag Nacht/Spät leer im Blatt (S2).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }],
};
let nr = 500;
const bericht = (date, schicht, text) => ({ id: `s${nr}`, nr: nr++, date, schicht, anlage: "TS480", stoerung: text, offen: false, ausfallzeit: 10, melder: "T. Balles", gemeldetAt: date + "T10:00:00.000Z" });
const FREITAG = [bericht("2026-09-25", "Früh", "FrFrueh"), bericht("2026-09-25", "Spät", "FrSpaet"), bericht("2026-09-25", "Nacht", "FrNacht")];
const WOCHE = [bericht("2026-09-22", "Spät", "DiSpaet"), bericht("2026-09-23", "Früh", "MiFrueh")];
const MAI = [bericht("2026-05-21", "Nacht", "MaiDoNacht"), bericht("2026-05-22", "Früh", "MaiFrFrueh"), bericht("2026-05-22", "Spät", "MaiFrSpaet")];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (benutzer, zeit, stoer) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date(zeit));
    await p.addInitScript(({ c, s, benutzer }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", "[]");
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
      localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
      // Das Blatt-Fenster abfangen: den geschriebenen HTML-Text sammeln.
      window.__blatt = "";
      window.open = function () { return { document: { open() {}, write(h) { window.__blatt += h; }, close() {} }, focus() {}, print() {} }; };
    }, { c: config, s: stoer, benutzer });
    await p.goto(APP);
    await p.waitForTimeout(1300);
    await p.getByRole("button", { name: /^Berichte\s*\d*$/i }).first().click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: /^Störungen\s*\d*$/i }).first().click();
    await p.waitForTimeout(400);
    return { p, fehler, zu: () => ctx.close() };
  };
  const knopf = (p) => p.locator('button[aria-label="Schichtbericht anzeigen"]');
  const blatt = async (p) => {
    await p.evaluate(() => { window.__blatt = ""; });
    await knopf(p).click();
    await p.waitForTimeout(400);
    return p.evaluate(() => window.__blatt);
  };
  // Gruppenzeilen des Blatts als "dd.mm.yyyy Schicht" (Anzeigefolge Früh -> Spät -> Nacht)
  const gruppen = (html) => Array.from(html.matchAll(/(\d{2}\.\d{2}\.\d{4}) · (Früh|Spät|Nacht) \(/g)).map((m) => `${m[1]} ${m[2]}`);
  const hinweis = (html) => /data-nach-frei/.test(html);

  /* (S1) Mittwoch 23.09.2026 10:00 */
  {
    const { p, fehler, zu } = await seite("Chef", "2026-09-23T10:00:00", [...WOCHE, ...FREITAG]);
    ok("(S1) Der Knopf „Schichtbericht anzeigen“ steht im Störungs-Bereich", (await knopf(p).count()) === 1 && /Schichtbericht/.test(await knopf(p).innerText()));
    const h = await blatt(p);
    const g = gruppen(h);
    ok("(S1) Klick öffnet das Blatt ohne Druck-Dialog (Titel „Schichtbericht Störungen“, kein Dialog offen)",
      /<h1>Schichtbericht Störungen<\/h1>/.test(h) && !/Blatt wählen/.test(await p.locator("body").innerText()));
    ok("(S1) Mittwoch: die drei Schichten von jetzt (Mi Früh, Di Spät, Di Nacht), kein Hinweis",
      g.join(",") === "23.09.2026 Früh,22.09.2026 Spät,22.09.2026 Nacht" && !hinweis(h) && /MiFrueh/.test(h) && /DiSpaet/.test(h), g.join(","));
    ok("(E) Keine Skriptfehler (Mittwoch)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  /* (S2) Montag 28.09.2026 08:00, Wochenende leer */
  {
    const { p, fehler, zu } = await seite("Chef", "2026-09-28T08:00:00", [...WOCHE, ...FREITAG]);
    const h = await blatt(p);
    const g = gruppen(h);
    ok("(S2) Montag: die drei Freitag-Schichten statt Sonntag Nacht/Spät",
      g.join(",") === "25.09.2026 Früh,25.09.2026 Spät,25.09.2026 Nacht" && /FrFrueh/.test(h) && /FrSpaet/.test(h) && /FrNacht/.test(h) && !/27\.09\.2026/.test(h), g.join(","));
    ok("(S2) Der Hinweis „Nach Wochenende oder Feiertag …“ steht im Blatt", hinweis(h) && /Nach Wochenende oder Feiertag/.test(h));
    ok("(E) Keine Skriptfehler (Montag)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  /* (S3) Montag, ein Bericht am Samstag Früh */
  {
    const { p, zu } = await seite("Chef", "2026-09-28T08:00:00", [...FREITAG, bericht("2026-09-26", "Früh", "SaFrueh")]);
    const h = await blatt(p);
    const g = gruppen(h);
    ok("(S3) Samstag Früh zählt mit: Sa Früh, Fr Spät, Fr Nacht - Freitag Früh fällt heraus",
      g.join(",") === "26.09.2026 Früh,25.09.2026 Spät,25.09.2026 Nacht" && /SaFrueh/.test(h) && !/FrFrueh/.test(h), g.join(","));
    await zu();
  }
  /* (S4) Dienstag 26.05.2026 nach Pfingstmontag */
  {
    const { p, zu } = await seite("Chef", "2026-05-26T08:00:00", MAI);
    const h = await blatt(p);
    const g = gruppen(h);
    ok("(S4) Nach dem Feiertag: Fr Früh, Fr Spät, Do Nacht - kein Pfingstmontag im Blatt",
      g.join(",") === "22.05.2026 Früh,22.05.2026 Spät,21.05.2026 Nacht" && hinweis(h) && !/25\.05\.2026/.test(h), g.join(","));
    await zu();
  }
  /* (S5) Montag mit Bericht in der laufenden Frühschicht */
  {
    const { p, zu } = await seite("Chef", "2026-09-28T08:00:00", [...FREITAG, bericht("2026-09-28", "Früh", "MoFrueh")]);
    const h = await blatt(p);
    const g = gruppen(h);
    ok("(S5) Die laufende Frühschicht zählt mit: Mo Früh, Fr Spät, Fr Nacht",
      g.join(",") === "28.09.2026 Früh,25.09.2026 Spät,25.09.2026 Nacht" && /MoFrueh/.test(h) && !/FrFrueh/.test(h), g.join(","));
    await zu();
  }
  /* (S6) Montag ohne einen Bericht in 30 Tagen */
  {
    const { p, zu } = await seite("Chef", "2026-09-28T08:00:00", [bericht("2026-08-10", "Früh", "AltAug")]);
    const h = await blatt(p);
    const g = gruppen(h);
    ok("(S6) Ohne Einträge in 30 Tagen bleibt das Fenster von jetzt (Mo Früh, So Spät, So Nacht), kein Hinweis",
      g.join(",") === "28.09.2026 Früh,27.09.2026 Spät,27.09.2026 Nacht" && !hinweis(h) && !/AltAug/.test(h), g.join(","));
    await zu();
  }
  /* (S7) Leser */
  {
    const { p, fehler, zu } = await seite("Lea", "2026-09-28T08:00:00", FREITAG);
    ok("(S7) Leser: der Knopf ist da und öffnet das Blatt", (await knopf(p).count()) === 1 && /<h1>Schichtbericht Störungen<\/h1>/.test(await blatt(p)));
    ok("(E) Keine Skriptfehler (Leser)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
