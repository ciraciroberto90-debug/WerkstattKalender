/* Rendert die Aufsetz-Anleitung (tools/aufsetzen-pdf.html) als PDF nach
 * doku/ und in den USB-Stick-Ordner (03-Anleitung). Seit dem 29.09. hat die
 * PDF damit eine Quelle im Repo - vorher lag sie nur fertig gerendert vor.
 *
 * Aufruf:  node tools/render-aufsetzen.js
 */
const { chromium } = require("../node_modules/playwright-core");
const fs = require("fs");
const path = require("path");

const WURZEL = path.resolve(__dirname, "..");
const QUELLE = path.join(__dirname, "aufsetzen-pdf.html");
const ZIELE = [
  path.join(WURZEL, "doku", "Werkstatt-Cockpit-Programm-Aufsetzen.pdf"),
  path.join(WURZEL, "programm", "verteilung", "usb-stick", "03-Anleitung", "Werkstatt-Cockpit-Programm-Aufsetzen.pdf"),
];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.goto("file://" + QUELLE);
  const pdf = await p.pdf({
    format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: '<div style="width:100%;font-size:8px;color:#8A9099;padding:0 14mm;display:flex;justify-content:space-between"><span>BTA-Cockpit · Aufsetz-Anleitung · Stand 29.09.2026</span><span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span></div>',
  });
  await b.close();
  for (const ziel of ZIELE) { fs.writeFileSync(ziel, pdf); console.log("geschrieben:", path.relative(WURZEL, ziel), (pdf.length / 1024).toFixed(0), "kB"); }
})().catch((e) => { console.error(e); process.exit(1); });
