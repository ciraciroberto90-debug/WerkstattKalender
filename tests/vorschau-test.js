// Prüft die beiden Vorschau-Dateien (Leser + Bearbeiter).
// Sie benutzen dieselben Speicher-Schlüssel wie die echte App. Früher schrieben
// sie bei jeder neuen Demo-Version alles ungefragt neu - hatte jemand hier
// etwas Echtes eingetippt, war es ohne Nachfrage weg.
//  (1) Erster Besuch: Demo wird gefüllt, App läuft
//  (2) Zweiter Besuch mit NEUERER Demo-Version: Eingetipptes bleibt unangetastet
//  (3) Der Hinweisbalken weist auf die neuere Demo hin
//  (4) Zurücksetzen fragt nach und stellt die Beispieldaten wieder her
//  (5) Beide Vorschauen zeigen unverwechselbar, dass es Beispieldaten sind
//  (6) Die echte App enthält keinerlei Demo-Daten
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const path = require("path");
const ROOT = "/home/user/WerkstattKalender";
const DIR = path.join(ROOT, "scratchpad/preview");

let ok = 0, fail = 0;
const check = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };

// Der Artifact-Host legt den Inhalt in seinen eigenen <body> - hier genauso.
// Geschrieben wird in eine echte Datei, weil der Zwischenspeicher des Browsers
// nur auf einer richtigen Herkunft (file://) zur Verfügung steht.
function alsSeite(datei) {
  const inhalt = fs.readFileSync(path.join(DIR, datei), "utf8");
  const ziel = path.join(DIR, "__test-" + datei);
  fs.writeFileSync(ziel, "<!doctype html><html><body>" + inhalt + "</body></html>");
  return "file://" + ziel;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1) Erster Besuch ---- */
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1400, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.goto(alsSeite("preview-bearbeiter.html"), { waitUntil: "load" });
  await page.waitForTimeout(1500);

  const txt1 = await page.locator("body").innerText();
  check("(1) App läuft in der Vorschau", txt1.includes("WERKSTATT") || txt1.includes("Werkstatt"));
  check("(1) Demo-Daten sind da (Team der Beispiel-Werkstatt)",
    await page.evaluate(() => (localStorage.getItem("werkstatt-kalender-config") || "").includes("R. Ciraci")));
  check("(1) Beispiel-Störungen sind da",
    await page.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-stoerungen-entries") || "[]").length > 20));
  check("(1) Keine JS-Fehler", fehler.length === 0);
  if (fehler.length) console.log("   ", fehler.slice(0, 3));

  /* ---- (2) Jemand tippt etwas Echtes ein, danach neue Demo-Version ---- */
  await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
    e.push({ id: "echt-wichtig", date: "2026-08-01", category: "ARBEIT", name: "ECHTE Notiz von Roberto", status: "open", prio: "hoch" });
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    // so, als wäre die Vorschau mit einer älteren Demo befüllt worden
    localStorage.setItem("wk-demo-ver", "demo-alt");
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);

  check("(2) Eingetipptes überlebt eine neuere Demo-Version (wird NICHT überschrieben)",
    await page.evaluate(() => (localStorage.getItem("werkstatt-kalender-entries") || "").includes("ECHTE Notiz von Roberto")));
  check("(2) Die Demo-Kennung bleibt dabei unverändert stehen",
    await page.evaluate(() => localStorage.getItem("wk-demo-ver") === "demo-alt"));

  /* ---- (3) Hinweis auf die neuere Demo ---- */
  check("(3) Hinweisbalken meldet 'Neuere Demo verfügbar'",
    await page.evaluate(() => {
      const h = document.getElementById("wk-demo-hinweis");
      return !!h && h.style.display !== "none";
    }));

  /* ---- (4) Zurücksetzen: mit Rückfrage ---- */
  let gefragt = false;
  page.on("dialog", async (d) => { gefragt = true; await d.accept(); });
  await page.locator("#wk-demo-reset").click();
  await page.waitForTimeout(1800);
  check("(4) Zurücksetzen fragt vorher nach", gefragt);
  check("(4) Danach sind die Beispieldaten wieder da",
    await page.evaluate(() => (localStorage.getItem("werkstatt-kalender-config") || "").includes("R. Ciraci")));
  check("(4) Und das Eingetippte ist erwartungsgemäß weg (der Nutzer hat zugestimmt)",
    await page.evaluate(() => !(localStorage.getItem("werkstatt-kalender-entries") || "").includes("ECHTE Notiz von Roberto")));

  /* ---- (4b) Abgelehnte Rückfrage darf nichts verändern ---- */
  await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
    e.push({ id: "bleibt", date: "2026-08-02", category: "ARBEIT", name: "Soll bleiben", status: "open", prio: "hoch" });
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
  });
  page.removeAllListeners("dialog");
  page.on("dialog", async (d) => { await d.dismiss(); });
  await page.locator("#wk-demo-reset").click();
  await page.waitForTimeout(700);
  check("(4b) Bei abgelehnter Rückfrage bleibt alles unverändert",
    await page.evaluate(() => (localStorage.getItem("werkstatt-kalender-entries") || "").includes("Soll bleiben")));

  await page.close();

  /* ---- (5) Beide Vorschauen sind unverwechselbar gekennzeichnet ---- */
  for (const [datei, wort] of [["preview-leser.html", "LESER"], ["preview-bearbeiter.html", "BEARBEITER"]]) {
    const p = await (await browser.newContext()).newPage({ viewport: { width: 1400, height: 1000 } });
    await p.goto(alsSeite(datei), { waitUntil: "load" });
    await p.waitForTimeout(1200);
    const t = await p.locator("#wk-vorschau-balken").innerText();
    check(`(5) ${wort}-Vorschau ist als Vorschau gekennzeichnet`, /VORSCHAU/.test(t));
    check(`(5) ${wort}-Vorschau sagt, dass es nicht die echte Werkstatt ist`, /nicht die echte Werkstatt/i.test(t));
    await p.close();
  }

  /* ---- (6) Die echte App ist frei von Demo-Daten ---- */
  const echt = fs.readFileSync(path.join(ROOT, "Werkstatt_Kalender_TPM.html"), "utf8");
  check("(6) Echte App enthält keine Demo-Kennung", !echt.includes("wk-demo-ver"));
  check("(6) Echte App enthält keinen Vorschau-Balken", !echt.includes("wk-vorschau-balken"));
  check("(6) Echte App enthält keine erfundenen Störungen", !echt.includes("Hydraulikdruck"));

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
