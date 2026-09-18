// Druckvorlagen abgreifen: je Lauf eine frische Seite, damit kein Dialog haengt.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { bauePlatte, seiteLaden } = require("./saat.js");
const fs = require("fs");
const OUT = __dirname;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 });
  const { platte } = await bauePlatte(ctx);

  const ablegen = async (p, datei) => {
    const html = await p.evaluate(() => window.__druckHtml || "");
    fs.writeFileSync(`${OUT}/${datei}.html`, html);
    const pg = await ctx.newPage();
    await pg.setContent(html, { waitUntil: "networkidle" });
    await pg.waitForTimeout(600);
    await pg.screenshot({ path: `${OUT}/${datei}.png`, fullPage: true });
    await pg.close();
    console.log("druck:", datei, html.length + " Zeichen");
  };

  const laeufe = [
    { datei: "20-druck-pruefnachweis", bereich: async (p) => { await p.getByRole("button", { name: "TPM", exact: true }).first().click(); }, option: /Prüfnachweis/ },
    { datei: "21-druck-schichtbericht", bereich: async (p) => { await p.getByRole("button", { name: /^Berichte/ }).first().click(); await p.waitForTimeout(300); await p.getByRole("button", { name: /^Störungen/ }).first().click(); }, option: /Schichtbericht/ },
    { datei: "22-druck-schichtplan", bereich: async (p) => { await p.getByRole("button", { name: "Werkstatt", exact: true }).first().click(); }, option: null },
    { datei: "23-druck-planung", bereich: async (p) => { await p.getByRole("button", { name: "Planung", exact: true }).first().click(); }, option: null },
    { datei: "24-druck-stoer-monat", bereich: async (p) => { await p.getByRole("button", { name: /^Berichte/ }).first().click(); await p.waitForTimeout(300); await p.getByRole("button", { name: /^Störungen/ }).first().click(); }, option: /Monats-Auswertung/ },
  ];
  for (const l of laeufe) {
    try {
      const p = await seiteLaden(ctx, platte);
      await l.bereich(p); await p.waitForTimeout(500);
      await p.locator('button[aria-label="Drucken"]').first().click(); await p.waitForTimeout(600);
      if (l.option) { const o = p.getByText(l.option); if (await o.count()) { await o.first().click(); await p.waitForTimeout(300); } }
      await p.screenshot({ path: `${OUT}/${l.datei}-dialog.png` });
      await p.getByRole("button", { name: /^Drucken$/ }).last().click(); await p.waitForTimeout(800);
      await ablegen(p, l.datei);
      await p.close();
    } catch (e) { console.log("!! " + l.datei + ": " + String(e.message).split("\n")[0]); }
  }
  await b.close();
  console.log("fertig");
})().catch((e) => { console.error(e); process.exit(1); });
