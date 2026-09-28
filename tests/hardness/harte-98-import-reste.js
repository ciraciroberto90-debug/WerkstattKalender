// Härtetest: IMPORT-RESTE (Robertos Befund vom 28.09.: "wir haben heute den
// 28.09.2026, wir können keine Berichte haben, die in der Zukunft liegen";
// "da steht ein Eintrag, aber es ist nichts eingetragen"; "Schichten ohne
// einen Eintrag - das alles aussortieren ist heftig")
//
//  (I1) Der ikom-Einleser überspringt leere Dokumente (keine Anlage, keine
//       Beschreibung) und Dokumente mit Datum in der Zukunft - die Bilanz
//       nennt beides, übernommen wird nur der echte Bericht.
//  (I2) ⚙ → Verlauf & Sicherung zeigt die Karte "Import-Reste aufräumen" mit
//       der Zahl der leeren und der zukünftigen Berichte im Bestand.
//  (I3) Der Knopf entfernt genau diese - echte Berichte bleiben, auch ein
//       echter Bericht von heute.
//  (I4) Ohne Reste sagt die Karte das, ohne Knopf.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor übernimmt der Einleser beide Reste (I1)
// und das ⚙ kennt keine Karte (I2).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-28";
const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] };
const b = (id, date, schicht, anlage, stoerung, nr) => ({ id, nr, date, schicht, anlage, stoerung, offen: false, ausfallzeit: 10, melder: "Balles", gemeldetAt: date + "T10:00:00.000Z" });
const BESTAND = [
  b("s-echt", "2026-09-10", "Früh", "VSM2", "Massezufuhrband dreht durch", "31301"),
  b("s-heute", HEUTE, "Früh", "TS480", "Hubeinleger hängt", "31400"),
  b("ikom-0830", "2026-09-10", "", "", "", "0830"),   // leer, ohne Schicht (nur Nummer)
  b("ikom-0831", "2026-09-10", "", "", "", "0831"),
  b("ikom-1092", "2026-12-30", "", "", "", "1092"),   // leer UND Zukunft
  b("ikom-zuk", "2026-11-27", "Früh", "Rollenofen", "Lichtschranke", "1200"), // Zukunft mit Inhalt
];
// Structured-Text-Export: drei Dokumente - echt, leer, Zukunft (Blöcke durch \f getrennt)
const doc = (felder) => Object.entries(felder).map(([k, v]) => `${k}:  ${v}`).join("\n");
const EXPORT = [
  doc({ VorgangsID: "V-1", SDatum: "10.09.2026 15:31:00", Schicht: "Früh", Maschine: "VSM2 2032001", ST_Beschreibung: "Massezufuhrband dreht durch", ST_Code: "mechanisch", LFDNR: "31301", Ausfallzeit: "15" }),
  doc({ VorgangsID: "V-2", SDatum: "10.09.2026 15:32:00", Schicht: "", Maschine: "", ST_Beschreibung: "", ST_Code: "", LFDNR: "0830", Ausfallzeit: "" }),
  doc({ VorgangsID: "V-3", SDatum: "30.12.2026 08:00:00", Schicht: "Früh", Maschine: "Rollenofen 2032009", ST_Beschreibung: "Geplante Wartung", ST_Code: "mechanisch", LFDNR: "1092", Ausfallzeit: "0" }),
].join("\f");

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (stoer) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    p.on("dialog", (d) => d.accept());
    await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
    await p.addInitScript(({ c, s }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", "[]");
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
      localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
    }, { c: config, s: stoer });
    await p.goto(APP);
    await p.waitForTimeout(1300);
    await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
    await p.getByRole("button", { name: /Verlauf/ }).first().click(); await p.waitForTimeout(400);
    return { p, fehler, zu: () => ctx.close() };
  };
  const bestand = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-stoerungen-entries") || "[]"));

  /* (I1) Einleser */
  {
    const { p, fehler, zu } = await seite([]);
    await p.locator('input[aria-label="ikom-Export wählen"]').setInputFiles({ name: "neu 1", mimeType: "text/plain", buffer: Buffer.from(EXPORT, "latin1") });
    await p.waitForTimeout(600);
    const bilanz = (await p.locator("body").innerText()).split("\n").filter((l) => /Bilanz|Dokumente gelesen|übersprungen/.test(l)).join(" | ");
    ok("(I1) Bilanz: 3 Dokumente gelesen, 1 neuer Störbericht, 2 übersprungen", /3 Dokumente gelesen/.test(bilanz) && /\b1\b[^|]*neue Störberichte/.test(bilanz) && /2 übersprungen/.test(bilanz), bilanz.slice(0, 240));
    await p.getByRole("button", { name: "Übernehmen", exact: true }).click(); await p.waitForTimeout(900);
    const nach = await bestand(p);
    ok("(I1) Übernommen wird nur der echte Bericht - kein leeres Dokument, keins aus der Zukunft",
      nach.length === 1 && nach[0].id === "ikom-V-1" && nach[0].anlage === "VSM2", nach.map((x) => x.id).join(","));
    ok("(E) Keine Skriptfehler (I1)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  /* (I2)(I3) Aufräumen */
  {
    const { p, fehler, zu } = await seite(BESTAND);
    const karte = p.locator("[data-import-reste]");
    const kt = (await karte.innerText()).replace(/\s+/g, " ");
    ok("(I2) Die Karte „Import-Reste aufräumen“ zählt 4 Reste: 3 ohne Anlage und Beschreibung, 1 mit Datum nach heute",
      (await karte.getAttribute("data-import-reste")) === "4" && /3 ohne Anlage und Beschreibung/.test(kt) && /1 mit Datum nach heute/.test(kt), kt.slice(0, 200));
    await p.locator('button[aria-label="Import-Reste entfernen"]').click(); await p.waitForTimeout(900);
    const nach = await bestand(p);
    ok("(I3) Nach dem Klick bleiben nur die echten Berichte - auch der von heute",
      nach.map((x) => x.id).sort().join(",") === "s-echt,s-heute", nach.map((x) => x.id).join(","));
    ok("(I4) Danach: keine Reste, kein Knopf", (await karte.getAttribute("data-import-reste")) === "0" && (await p.locator('button[aria-label="Import-Reste entfernen"]').count()) === 0 && /Keine leeren Berichte/.test(await karte.innerText()));
    ok("(E) Keine Skriptfehler (I2/I3)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
