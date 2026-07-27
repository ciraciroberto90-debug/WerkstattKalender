const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.goto("file://" + path.resolve(__dirname, "update-anleitung.html"));
  await p.waitForTimeout(400);
  await p.pdf({
    path: path.resolve(__dirname, "..", "Werkstatt-Cockpit-Neue-Version.pdf"),
    format: "A4", printBackground: true, preferCSSPageSize: true,
  });
  console.log("PDF geschrieben");
  await b.close();
})();
