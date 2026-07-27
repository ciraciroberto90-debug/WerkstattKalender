// Härtetest: das SCHICHTBUCH als eine Tabelle mit festen Spalten.
// Vorher war jeder Tag eine eigene Kachel mit eigenem Rahmen; die Angaben
// hingen rechts aneinander - mal mit Minuten, mal ohne, mal mit "1 offen"
// dazwischen. Jetzt steht alles in einer Tabelle, und die Tagessumme steht
// in DERSELBEN Spalte wie die Einzelwerte. Genau das muss hier belegt sein:
//   - Tag- und Schichtsummen stimmen rechnerisch mit den Einzelwerten überein
//   - Auf- und Zuklappen von Tag und Schicht funktioniert weiterhin
//   - ein Klick auf eine Zeile öffnet den Bericht (nur lesend)
//   - die Suche liefert eine flache Trefferliste mit Datumsspalte
//   - behobene Berichte lassen sich aus- und wieder einblenden
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const STOER = require("/home/user/WerkstattKalender/tools/demo-stoerungen.js");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const CONFIG = { team: [{ name: "R. Ciraci", rolle: "mech" }] };

let ok = 0, fail = 0;
const pruef = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-07-23T10:00:00"));
  await p.addInitScript((d) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(d.CONFIG));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(d.STOER));
  }, { CONFIG, STOER });
  await p.goto(APP); await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /Störungen/ }).first().click(); await p.waitForTimeout(900);

  // ---- Aufbau ----
  const spalten = await p.locator("thead th").allInnerTexts();
  pruef("Sechs feste Spalten mit Ausfallzeit und Bearbeiter",
    spalten.length === 6 && /AUSFALLZEIT/i.test(spalten[3]) && /BEARBEITER/i.test(spalten[4]));

  const zeile = (t) => p.locator("tbody tr").filter({ hasText: t }).first();

  // ---- Rechnerische Probe: Tagessumme = Summe der Schichten = Summe der Berichte ----
  // Der neueste Tag ist von Haus aus aufgeklappt und hat selbst eine
  // FRÜH-Zeile. Ohne ihn zuzuklappen misst man dessen Schicht statt der
  // gesuchten - die Summe kaeme dann nicht hin.
  await zeile("23.07.2026").click(); await p.waitForTimeout(300);
  await zeile("15.07.2026").click(); await p.waitForTimeout(400);
  const soll = STOER.filter((s) => s.date === "2026-07-15").reduce((a, s) => a + (Number(s.ausfallzeit) || 0), 0);
  const tagText = await zeile("15.07.2026").innerText();
  pruef(`Tagessumme 15.07. zeigt ${soll} min`, new RegExp(`${soll}\\s*min`).test(tagText));
  pruef("Tag zeigt die Anzahl der Berichte", /8 Einträge/.test(tagText));

  let schichtSumme = 0;
  for (const sch of ["FRÜH", "SPÄT", "NACHT"]) {
    const t = await p.locator("tbody tr").filter({ hasText: sch }).first().innerText();
    const m = t.match(/(\d+)\s*min/);
    if (m) schichtSumme += Number(m[1]);
  }
  pruef(`Schichtsummen ergeben zusammen die Tagessumme (${schichtSumme} = ${soll})`, schichtSumme === soll);

  // ---- Auf- und Zuklappen ----
  const vorher = await p.locator("tbody tr").count();
  await p.locator("tbody tr").filter({ hasText: "SPÄT" }).first().click(); await p.waitForTimeout(350);
  const nachAuf = await p.locator("tbody tr").count();
  pruef("Schicht aufklappen zeigt die Berichte", nachAuf > vorher);
  await p.locator("tbody tr").filter({ hasText: "SPÄT" }).first().click(); await p.waitForTimeout(350);
  pruef("Schicht wieder zuklappen", await p.locator("tbody tr").count() === vorher);
  await zeile("15.07.2026").click(); await p.waitForTimeout(350);
  pruef("Tag zuklappen entfernt die Schichtzeilen", await p.locator("tbody tr").count() < vorher);

  // ---- Bericht öffnen ----
  await zeile("15.07.2026").click(); await p.waitForTimeout(300);
  await p.locator("tbody tr").filter({ hasText: "SPÄT" }).first().click(); await p.waitForTimeout(350);
  await p.locator("tbody tr").filter({ hasText: "Brenner zündet nicht" }).first().click(); await p.waitForTimeout(600);
  const text = await p.locator("body").innerText();
  pruef("Klick auf eine Zeile öffnet den Bericht", /Zündelektrode verrußt/.test(text));
  pruef("Bericht öffnet zunächst nur lesend", /Bearbeiten/.test(text));
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);

  // ---- Suche ----
  await p.locator('input[type="search"]').fill("hydraulik"); await p.waitForTimeout(600);
  const treffer = await p.locator("tbody tr").count();
  pruef("Suche liefert eine flache Trefferliste", treffer > 0 && treffer < 20);
  pruef("Trefferliste zeigt das Datum in der ersten Spalte",
    /DATUM$/i.test((await p.locator("thead th").first().innerText()).trim()));
  pruef("Trefferzahl steht in der Werkzeugzeile", /Treffer/.test(await p.locator("body").innerText()));
  await p.locator('input[type="search"]').fill(""); await p.waitForTimeout(500);

  // ---- Behobene aus- und einblenden ----
  const alleTage = await p.locator("tbody tr").count();
  // Der Schalter steht ganz unten; beim Heranscrollen kann ihn die
  // mitlaufende Kopfleiste verdecken. Deshalb direkt ausloesen.
  await p.locator("button").filter({ hasText: "behobene Störungen ausblenden" }).first().evaluate((el) => el.click()); await p.waitForTimeout(500);
  const nurOffen = await p.locator("tbody tr").count();
  pruef("Behobene ausblenden verkürzt die Liste", nurOffen < alleTage);
  await p.locator("button").filter({ hasText: /behobene Störung\(en\) anzeigen/ }).first().evaluate((el) => el.click()); await p.waitForTimeout(500);
  pruef("Behobene wieder einblenden stellt sie her", await p.locator("tbody tr").count() === alleTage);

  pruef("Keine Skriptfehler", fehler.length === 0);
  if (fehler.length) console.log(fehler);
  console.log(`\n==== SCHICHTBUCH-TABELLE: ${ok} PASS / ${fail} FAIL ====`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
