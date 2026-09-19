// Screenshot-Fahrt fuer die SK-Praesentation (2x Aufloesung), Saat aus saat.js.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { bauePlatte, seiteLaden } = require("./saat.js");
const OUT = __dirname;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 });
  const { platte, anzahl } = await bauePlatte(ctx);
  console.log(`Bestand: ${anzahl.entries} Einträge, ${anzahl.stoerungen} Störberichte, ${anzahl.ri} R+I-Fälligkeiten`);
  const p = await seiteLaden(ctx, platte);

  const ruhe = (ms = 700) => p.waitForTimeout(ms);
  const shot = async (name) => { await ruhe(); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot:", name); };
  const klick = async (name, exact = true) => { await p.getByRole("button", exact ? { name, exact: true } : { name }).first().click(); await ruhe(500); };
  const versuche = async (titel, fn) => { try { await fn(); } catch (e) { console.log("!! " + titel + ": " + String(e.message).split("\n")[0]); } };
  const schliessen = async () => { await p.keyboard.press("Escape"); await ruhe(250); const x = p.locator('button[aria-label="Schließen"]'); if (await x.count()) { await x.last().click(); await ruhe(300); } };

  await versuche("Übersicht", async () => { await klick("Übersicht"); await shot("01-uebersicht"); });
  await versuche("Schichtplan", async () => { await klick("Werkstatt"); await shot("02-schichtplan"); });
  await versuche("Planung", async () => { await klick("Planung"); await shot("03-planung"); });
  await versuche("Berichte-Start", async () => { await klick(/^Berichte/, false); await shot("04-berichte-start"); });
  await versuche("To-do", async () => { await klick(/^To-do/, false); await shot("05-todo"); });
  await versuche("Störungen", async () => { await klick(/^Störungen/, false); await shot("06-stoerungen"); });
  await versuche("Störungen aufgeklappt", async () => {
    // Heutigen Tag aufklappen, damit ein Bericht sichtbar ist
    const heute = p.getByText(/Fr\., 18\.09\.2026/).first(); if (await heute.count()) { await heute.click(); await shot("06b-stoerungen-offen"); }
  });
  await versuche("Störungen Auswertung", async () => { const a = p.getByRole("button", { name: "Auswertung", exact: true }); if (await a.count()) { await a.first().click(); await shot("06c-stoerungen-auswertung"); await p.getByRole("button", { name: "Liste", exact: true }).first().click(); } });
  await versuche("Backlog", async () => { await klick("Backlog"); await shot("07-backlog"); });
  await versuche("Zeiterfassung", async () => { await klick("Zeiterfassung"); await shot("08-zeiterfassung"); });
  await versuche("TPM-Board", async () => { await klick("TPM"); await shot("09-tpm-board"); });
  await versuche("TPM-Plan", async () => { await klick("Plan"); await shot("10-tpm-plan"); });
  await versuche("Register", async () => { await klick("Register"); await shot("11-register"); });
  await versuche("Kennkarte", async () => { await klick("Übersicht"); await p.locator('button[aria-label="Gemeinsame Datei"]').click(); await ruhe(600); await shot("12-kennkarte"); await schliessen(); });
  await versuche("Verwalten", async () => { await p.locator('button[aria-label="Verwalten"]').first().click(); await ruhe(800); await shot("13-verwalten"); await schliessen(); });
  await versuche("Monitor", async () => { await p.locator('button[aria-label="Werkstatt-Monitor"]').first().click(); await ruhe(1200); await shot("14-monitor"); await schliessen(); });

  await b.close();
  console.log("fertig");
})().catch((e) => { console.error(e); process.exit(1); });
