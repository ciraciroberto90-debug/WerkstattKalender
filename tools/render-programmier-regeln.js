// Erzeugt doku/Werkstatt-Cockpit-Programmier-Regeln.pdf aus
// tools/programmier-regeln.html. NICHT parallel zu einer laufenden
// Test-Suite starten (Regel 9).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.goto("file://" + path.resolve(__dirname, "programmier-regeln.html"));
  await p.waitForTimeout(300);
  await p.pdf({
    path: path.resolve(__dirname, "../doku/Werkstatt-Cockpit-Programmier-Regeln.pdf"),
    format: "A4", printBackground: true, preferCSSPageSize: true,
  });
  console.log("PDF geschrieben: doku/Werkstatt-Cockpit-Programmier-Regeln.pdf");
  await b.close();
})();
