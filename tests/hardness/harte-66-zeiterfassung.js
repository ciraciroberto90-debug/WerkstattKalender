// Härtetest: ZEITERFASSUNG / SCHICHTBERICHT (Robertos Auftrag vom 09.09.).
// Ersatz für das alte ikom-ZE: Stunden je Mitarbeiter auf Kostenstellen,
// Abwesenheiten wie früher, Jahres-Summen je Kostenstelle als CSV für Excel.
//
//  (Z1) Ein über die OBERFLÄCHE angelegter Eintrag landet mit Kostenstelle,
//       Nummer und Stunden im Bestand - und ÜBERLEBT den Neustart. (Der
//       Start-Lader verwirft Einträge ohne name-Feld; beim ersten Wurf trug
//       der Mitarbeiter das Feld "wer" - jeder Neustart hätte alle
//       Zeiterfassungen verschluckt. Deshalb prüft dieser Punkt den Reload.)
//  (Z2) Eine frei getippte Kostenstelle wird abgewiesen - sonst zerfällt die
//       Jahres-Summe in Tippfehler-Zeilen.
//  (Z3) Abwesenheit wie im alten Formular (Grund-Auswahl), ohne Kostenstelle.
//  (Z4) Jahres-Summen: je Kostenstelle richtig addiert, Abwesenheiten zählen
//       NICHT mit (Robertos Ansage: laufen in keine Kostenstelle).
//  (Z5) CSV-Export für Excel: Kostenstelle;Nummer;Stunden, deutsches Komma,
//       Gesamtzeile, keine Abwesenheiten.
//  (Z6) Kostenstellen: Bestände OHNE den config-Schlüssel bekommen den
//       150er-Startbestand; im ⚙ ist die Liste durchsuchbar und erweiterbar.
//  (Z7) ZE-Berechtigung je Team-Mitglied: nur Berechtigte stehen im
//       Formular zur Wahl; der Haken im ⚙ schaltet ab.
//  (Z8) Der Mitarbeiter-Filter über der Liste filtert wirklich.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-09-09T10:00:00"));
  await p.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    // Der Seed darf nur EINMAL greifen: addInitScript läuft auch beim
    // reload() in (Z1) wieder - ohne die Marke würde der Test seinen
    // eigenen frisch gespeicherten Eintrag zurücksetzen.
    if (localStorage.getItem("harte66-gesaet")) return;
    localStorage.setItem("harte66-gesaet", "1");
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([
      { id: "z1", category: "ZEIT", art: "arbeit", date: "2026-09-08", schicht: "Spät", name: "P. Wagner", ks: "B2 Beschichtungsanlage", ksNr: "2036202", taetigkeit: "Düsen gereinigt", stunden: 3, bemerkung: "", stoerNr: "", updatedAt: "2026-09-08T20:00:00.000Z" },
      { id: "z2", category: "ZEIT", art: "abwesenheit", date: "2026-09-08", schicht: "Früh", name: "K. Schmidt", grund: "Urlaub", stunden: 8, bemerkung: "", updatedAt: "2026-09-08T08:00:00.000Z" },
    ]));
    // BEWUSST ohne "kostenstellen"-Schlüssel und ohne "zeiterfassung"-Felder
    // bei zweien: Bestände von vor dem 09.09. müssen den Startbestand und die
    // Vollzähligkeit von selbst bekommen (Z6/Z7).
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
      tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [],
      team: [{ name: "K. Schmidt", rolle: "mech" }, { name: "P. Wagner", rolle: "elek" }, { name: "A. Helfer", rolle: "", zeiterfassung: false }],
    }));
  });
  await p.goto(APP);
  await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "Zeiterfassung", exact: true }).click();
  await p.waitForTimeout(500);

  /* ---- (Z2) Frei getippte Kostenstelle wird abgewiesen ---- */
  await p.getByRole("button", { name: /Neue Zeiterfassung/ }).click();
  await p.waitForTimeout(400);
  await p.locator('input[aria-label="Kostenstelle"]').fill("Quatschstelle 123");
  await p.locator('input[aria-label="Arbeitsdauer in Stunden"]').fill("1,5");
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.waitForTimeout(400);
  const abgewiesen = await p.getByText(/Kostenstelle aus der Liste/).count();
  const bestand1 = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries")));
  pruef("(Z2) Frei getippte Kostenstelle wird mit Hinweis abgewiesen",
        abgewiesen === 1 && bestand1.filter((e) => e.category === "ZEIT").length === 2);

  /* ---- (Z1) Gültig anlegen, dann NEUSTART ---- */
  await p.locator('input[aria-label="Kostenstelle"]').fill("TS 480 ADL (2032002)");
  await p.locator('input[placeholder^="z. B. Lager"]').fill("Riemen getauscht");
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.waitForTimeout(600);
  await p.reload();
  await p.waitForTimeout(1200);
  const nachReload = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries")));
  const neu = nachReload.find((e) => e.category === "ZEIT" && e.taetigkeit === "Riemen getauscht");
  pruef("(Z1) Der UI-Eintrag trägt Kostenstelle, Nummer, Stunden und Mitarbeiter",
        !!neu && neu.ks === "TS 480 ADL" && neu.ksNr === "2032002" && neu.stunden === 1.5 && neu.name === "K. Schmidt" && neu.date === "2026-09-09",
        neu ? `${neu.name} | ${neu.ks} | ${neu.stunden}` : "fehlt");
  await p.getByRole("button", { name: "Zeiterfassung", exact: true }).click();
  await p.waitForTimeout(500);
  pruef("(Z1) Nach dem Neustart steht der Eintrag noch in der Liste",
        (await p.getByText("Riemen getauscht").count()) >= 1);

  /* ---- (Z3) Abwesenheit wie im alten Formular ---- */
  await p.getByRole("button", { name: /Neue Zeiterfassung/ }).click();
  await p.waitForTimeout(400);
  await p.getByText("Abwesenheit", { exact: true }).click();
  await p.locator('select[aria-label="Abwesenheitsgrund"]').selectOption("Zeitausgleich");
  await p.locator('input[aria-label="Arbeitsdauer in Stunden"]').fill("8");
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.waitForTimeout(600);
  const bestand2 = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries")));
  const abw = bestand2.find((e) => e.category === "ZEIT" && e.grund === "Zeitausgleich");
  pruef("(Z3) Abwesenheit gespeichert: Grund ja, Kostenstelle nein",
        !!abw && abw.art === "abwesenheit" && abw.ks === undefined && Number(abw.stunden) === 8,
        abw ? JSON.stringify({ grund: abw.grund, stunden: abw.stunden }) : "fehlt");
  pruef("(Z3) Die Liste zeigt die Abwesenheit mit Grund",
        (await p.getByText(/Abwesenheit: ?/).count()) >= 1);

  /* ---- (Z8) Mitarbeiter-Filter ---- */
  await p.locator('select[aria-label="Mitarbeiter filtern"]').selectOption("P. Wagner");
  await p.waitForTimeout(400);
  const nurWagner = (await p.getByText("Düsen gereinigt").count()) === 1 && (await p.getByText("Riemen getauscht").count()) === 0;
  pruef("(Z8) Der Mitarbeiter-Filter zeigt nur die gewählte Person", nurWagner);
  await p.locator('select[aria-label="Mitarbeiter filtern"]').selectOption("ALLE");
  await p.waitForTimeout(300);

  /* ---- (Z4) Jahres-Summen ---- */
  await p.getByRole("button", { name: "Jahres-Summen", exact: true }).click();
  await p.waitForTimeout(400);
  const tabelle = await p.locator("table").last().textContent();
  pruef("(Z4) Summen je Kostenstelle stimmen, Abwesenheiten zählen nicht",
        /TS 480 ADL/.test(tabelle) && /1,5/.test(tabelle) && /B2 Beschichtungsanlage/.test(tabelle)
        && !/Urlaub/.test(tabelle) && !/Zeitausgleich/.test(tabelle) && /Gesamt/.test(tabelle) && /4,5/.test(tabelle),
        tabelle.replace(/\s+/g, " ").slice(0, 120));

  /* ---- (Z5) CSV für Excel ---- */
  const [dl] = await Promise.all([
    p.waitForEvent("download"),
    p.getByRole("button", { name: /Für Excel herunterladen/ }).click(),
  ]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  pruef("(Z5) CSV: Kopf, Zeile je Kostenstelle, deutsches Komma, Gesamtzeile, ohne Abwesenheit",
        csv.includes("Kostenstelle;Nummer;Stunden 2026")
        && csv.includes("TS 480 ADL;2032002;1,5") && csv.includes("B2 Beschichtungsanlage;2036202;3")
        && csv.includes("Gesamt;;4,5") && !csv.includes("Urlaub") && !csv.includes("Zeitausgleich"),
        csv.split("\r\n").slice(0, 2).join(" / "));
  pruef("(Z5) Der Dateiname nennt Zeiterfassung und Jahr",
        /werkstatt-zeiterfassung-kostenstellen-2026\.csv/.test(dl.suggestedFilename()), dl.suggestedFilename());

  /* ---- (Z6) ⚙: Startbestand, Suche, Erweitern ---- */
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Kostenstellen", exact: true }).click();
  await p.waitForTimeout(400);
  pruef("(Z6) Ohne config-Schlüssel steht der 150er-Startbestand bereit",
        (await p.getByText(/150 Einträge/).count()) === 1);
  await p.locator('input[aria-label="Kostenstellen durchsuchen"]').fill("TS 480");
  await p.waitForTimeout(300);
  const sichtbar = await p.locator('input[aria-label^="Kostenstelle"][aria-label$="Name"]').evaluateAll((els) => els.filter((el) => el.offsetParent !== null).length);
  pruef("(Z6) Die Suche engt die Liste ein", sichtbar === 1, sichtbar + " sichtbar");
  await p.getByRole("button", { name: "+ Kostenstelle hinzufügen" }).click();
  await p.waitForTimeout(300);
  const letzteZeile = p.locator('input[aria-label^="Kostenstelle"][aria-label$="Name"]').last();
  await letzteZeile.fill("Neue Halle Presse");
  await p.locator('input[aria-label^="Kostenstelle"][aria-label$="Nummer"]').last().fill("999999");
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.waitForTimeout(700);
  const cfg = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-config")));
  pruef("(Z6) Die neue Kostenstelle steht nach dem Speichern in der gemeinsamen Config",
        Array.isArray(cfg.kostenstellen) && cfg.kostenstellen.length === 151
        && cfg.kostenstellen.some((k) => k.name === "Neue Halle Presse" && k.nr === "999999"),
        (cfg.kostenstellen || []).length + " Kostenstellen");

  /* ---- (Z7) ZE-Berechtigung ---- */
  await p.getByRole("button", { name: /Neue Zeiterfassung/ }).click();
  await p.waitForTimeout(400);
  const optionen1 = await p.locator('select[aria-label="Mitarbeiter wählen"] option').allTextContents();
  pruef("(Z7) Nicht-Berechtigte (A. Helfer) fehlen im Formular, Alt-Bestände sind vollzählig",
        optionen1.includes("K. Schmidt") && optionen1.includes("P. Wagner") && !optionen1.includes("A. Helfer"),
        optionen1.join(", "));
  await p.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await p.waitForTimeout(300);
  // Haken im ⚙ abschalten und nachmessen
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Team & Schichten", exact: true }).click();
  await p.waitForTimeout(400);
  await p.locator('input[aria-label="Zeiterfassung für P. Wagner"]').uncheck();
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.waitForTimeout(700);
  await p.getByRole("button", { name: /Neue Zeiterfassung/ }).click();
  await p.waitForTimeout(400);
  const optionen2 = await p.locator('select[aria-label="Mitarbeiter wählen"] option').allTextContents();
  pruef("(Z7) Der ⚙-Haken nimmt jemanden aus der Auswahl",
        optionen2.includes("K. Schmidt") && !optionen2.includes("P. Wagner"), optionen2.join(", "));
  await p.getByRole("button", { name: "Abbrechen", exact: true }).click();

  pruef("(Z1-Z8) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  console.log(`\nHärte 66 (Zeiterfassung): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
