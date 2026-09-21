// Screenshot-Fahrt fuer die Hauptpraesentation (2x Aufloesung), Saat aus der
// SK-Vorstellung (../vorstellung-bta-cockpit/shots/saat.js). Erzeugt die
// Bereichsbilder 01-14 neu (aktueller Programmstand) und dazu die Bilder der
// Funktionen vom 21.09.: Benutzer & Rechte, Ansichts-Schalter, Anordnen-Modus,
// Regeln & Listen, Anwesende-Menue in der Termin-Kachel, Werkstatt-Wechsel.
// Die Bilder liegen NICHT im Git (siehe .gitignore) - vor dem Bau einmal
// `node shots.js` laufen lassen.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const path = require("path");
const { bauePlatte, seiteLaden } = require("../vorstellung-bta-cockpit/shots/saat.js");
const OUT = path.join(__dirname, "..", "vorstellung-bta-cockpit", "shots");

// Benutzerliste, damit Rechte-Tabelle, Ansichts-Schalter und Link-Kuerzel wie im
// Betrieb aussehen. R. Ciraci ist angemeldet (Verwalter) und traegt den Gruppen-Pass.
const BENUTZER = [
  { name: "R. Ciraci", rolle: "verwalter", kennwortHash: "", links: "RC" },
  { name: "M. Weber", rolle: "bearbeiter", kennwortHash: "", links: "" },
  { name: "T. Klein", rolle: "bearbeiter", kennwortHash: "", links: "" },
  { name: "Morgenrunde", rolle: "leser", kennwortHash: "", links: "" },
];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 });
  const { platte, anzahl } = await bauePlatte(ctx);
  console.log(`Bestand: ${anzahl.entries} Einträge, ${anzahl.stoerungen} Störberichte, ${anzahl.ri} R+I-Fälligkeiten`);
  const p = await seiteLaden(ctx, platte, {
    cfg: { benutzer: BENUTZER },
    speicher: { "werkstatt-kalender-benutzer": "R. Ciraci", "bta-gruppenverwalter": { name: "R. Ciraci", von: "scheurich", seit: "2026-09-18T07:00:00.000Z" } },
  });

  const ruhe = (ms = 700) => p.waitForTimeout(ms);
  const shot = async (name, opts = {}) => { await ruhe(); await p.screenshot({ path: `${OUT}/${name}.png`, ...opts }); console.log("shot:", name); };
  const klick = async (name, exact = true) => { await p.getByRole("button", exact ? { name, exact: true } : { name }).first().click(); await ruhe(500); };
  const versuche = async (titel, fn) => { try { await fn(); } catch (e) { console.log("!! " + titel + ": " + String(e.message).split("\n")[0]); } };
  const schliessen = async () => { await p.keyboard.press("Escape"); await ruhe(250); const x = p.locator('button[aria-label="Schließen"]'); if (await x.count()) { await x.last().click(); await ruhe(300); } };
  const zahnrad = async (reiter) => { await p.locator('button[aria-label="Verwalten"]').first().click(); await ruhe(600); if (reiter) { await p.getByRole("button", { name: reiter, exact: true }).first().click(); await ruhe(500); } };

  await versuche("Übersicht", async () => { await klick("Übersicht"); await shot("01-uebersicht"); });
  await versuche("Anwesende-Menü", async () => {
    await p.locator('button[aria-label="Anwesende wählen"]').click(); await ruhe(400);
    await shot("18-termin-anwesende");
    const erster = p.locator('[role="menuitemradio"][aria-label^="Punkte von"]').first();
    if (await erster.count()) { await erster.click(); await ruhe(500); await shot("18b-termin-person"); }
    const zurueck = p.locator('button[aria-label="Zurück zu den Terminen"]'); if (await zurueck.count()) { await zurueck.click(); await ruhe(300); }
  });
  await versuche("Ansichts-Schalter", async () => {
    await p.locator('button[aria-label="Ansicht wechseln"]').click(); await ruhe(400);
    await shot("17-ansicht-menue");
    await p.getByRole("menuitemradio", { name: /Leser/ }).click(); await ruhe(700);
    await shot("17b-ansicht-leser");
    await p.locator('button[aria-label="Zurück zur Verwalter-Ansicht"]').click(); await ruhe(500);
  });
  await versuche("Schichtplan", async () => { await klick("Werkstatt"); await shot("02-schichtplan"); });
  await versuche("Planung", async () => { await klick("Planung"); await shot("03-planung"); });
  await versuche("Berichte-Start", async () => { await klick(/^Berichte/, false); await shot("04-berichte-start"); });
  await versuche("To-do", async () => { await klick(/^To-do/, false); await shot("05-todo"); });
  await versuche("Störungen", async () => { await klick(/^Störungen/, false); await shot("06-stoerungen"); });
  await versuche("Störungen aufgeklappt", async () => {
    const heute = p.getByText(/Fr\., 18\.09\.2026/).first(); if (await heute.count()) { await heute.click(); await shot("06b-stoerungen-offen"); }
  });
  await versuche("Störungen Auswertung", async () => { const a = p.getByRole("button", { name: "Auswertung", exact: true }); if (await a.count()) { await a.first().click(); await shot("06c-stoerungen-auswertung"); await p.getByRole("button", { name: "Liste", exact: true }).first().click(); } });
  await versuche("Backlog", async () => { await klick("Backlog"); await shot("07-backlog"); });
  await versuche("Zeiterfassung", async () => { await klick("Zeiterfassung"); await shot("08-zeiterfassung"); });
  await versuche("TPM-Board", async () => { await klick("TPM"); await shot("09-tpm-board"); });
  await versuche("TPM-Plan", async () => { await klick("Plan"); await shot("10-tpm-plan"); });
  await versuche("Register", async () => { await klick("Register"); await shot("11-register"); });
  await versuche("Kennkarte", async () => { await klick("Übersicht"); await p.locator('button[aria-label="Gemeinsame Datei"]').click(); await ruhe(600); await shot("12-kennkarte"); await schliessen(); });
  await versuche("Verwalten", async () => { await zahnrad(null); await shot("13-verwalten"); await schliessen(); });
  await versuche("Benutzer & Rechte", async () => { await zahnrad("Benutzer & Rechte"); await shot("15-benutzer-rechte"); await schliessen(); });
  await versuche("Regeln & Listen", async () => { await zahnrad("Regeln & Listen"); await shot("19-regeln-listen"); await schliessen(); });
  await versuche("Personalisieren", async () => { await zahnrad("Personalisieren"); await shot("16-personalisieren"); });
  await versuche("Anordnen", async () => {
    await p.locator('button[aria-label="Übersicht direkt anordnen"]').click(); await ruhe(800);
    await shot("16b-anordnen");
    await p.locator('button[aria-label="Anordnen fertig"]').click(); await ruhe(300);
  });
  await versuche("Kopfzeile mit Werkstatt-Wechsel", async () => {
    await klick("Übersicht");
    await shot("20-kopfzeile-wechsel", { clip: { x: 0, y: 0, width: 1500, height: 120 } });
  });
  await versuche("Monitor", async () => { await p.locator('button[aria-label="Werkstatt-Monitor"]').first().click(); await ruhe(1200); await shot("14-monitor"); await schliessen(); });

  await b.close();
  console.log("fertig");
})().catch((e) => { console.error(e); process.exit(1); });
