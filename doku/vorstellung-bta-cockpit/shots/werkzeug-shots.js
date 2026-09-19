// Die drei Werkzeug-Fenster (Reiter Einrichten / Selbsttest / Wartung) aus der
// naturgetreuen HTML-Vorlage als Einzelbilder (2x Aufloesung).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const OUT = __dirname;
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const p = await (await b.newContext({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 })).newPage();
  await p.goto("file:///tmp/claude-0/-home-user-WerkstattKalender/8b2eab4a-3225-51dd-900c-dbf3d21c0a06/scratchpad/werkzeug-vorlage.html", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  const wins = p.locator(".win");
  const namen = ["30-werkzeug-einrichten", "31-werkzeug-selbsttest", "32-werkzeug-wartung"];
  for (let i = 0; i < 3; i++) { await wins.nth(i).screenshot({ path: `${OUT}/${namen[i]}.png` }); console.log("shot:", namen[i]); }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
