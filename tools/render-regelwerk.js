const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.goto("file://" + path.resolve("scratchpad/deliverables/regelwerk.html"));
  await p.waitForTimeout(300);
  await p.pdf({ path: "Werkstatt-Cockpit-Regelwerk.pdf", format: "A4", printBackground: true, preferCSSPageSize: true });
  console.log("PDF geschrieben");
  await b.close();
})();
