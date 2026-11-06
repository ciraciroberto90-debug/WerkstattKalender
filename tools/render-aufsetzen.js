/* Rendert die Aufsetz-Anleitung (tools/aufsetzen-pdf.html) als PDF nach
 * doku/ und in den USB-Stick-Ordner (03-Anleitung). Seit dem 29.09. hat die
 * PDF damit eine Quelle im Repo - vorher lag sie nur fertig gerendert vor.
 * Seit 06.11. läuft das auch auf dem Laptop: Browser und Pfade kommen aus
 * tests/umgebung.js (Roll-out 73), nicht mehr aus festen Cloud-Pfaden.
 *
 * Aufruf:  node tools/render-aufsetzen.js
 */
const fs = require("fs");
const path = require("path");
const WURZEL = path.resolve(__dirname, "..");
const UMG = require(path.join(WURZEL, "tests", "umgebung.js"));
const { chromium } = require(path.join(WURZEL, "tests", "node_modules", "playwright-core"));

const QUELLE = path.join(__dirname, "aufsetzen-pdf.html");
const STAND = (fs.readFileSync(QUELLE, "utf8").match(/class="stand">Stand ([\d.]+)/) || [, "?"])[1];
const ZIELE = [
  path.join(WURZEL, "doku", "Werkstatt-Cockpit-Programm-Aufsetzen.pdf"),
  path.join(WURZEL, "programm", "verteilung", "usb-stick", "03-Anleitung", "Werkstatt-Cockpit-Programm-Aufsetzen.pdf"),
];

(async () => {
  const b = await chromium.launch({ executablePath: UMG.CHROMIUM, headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.goto(UMG.dateiUrl(QUELLE));
  const pdf = await p.pdf({
    format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font-size:8px;color:#8A9099;padding:0 14mm;display:flex;justify-content:space-between"><span>BTA-Cockpit · Aufsetz-Anleitung · Stand ${STAND}</span><span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span></div>`,
  });
  await b.close();
  for (const ziel of ZIELE) { fs.writeFileSync(ziel, pdf); console.log("geschrieben:", path.relative(WURZEL, ziel), (pdf.length / 1024).toFixed(0), "kB"); }
})().catch((e) => { console.error(e); process.exit(1); });
