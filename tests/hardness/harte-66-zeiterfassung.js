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
//  (Z9) Störbericht -> Zeiterfassung (Robertos Wunsch 09.09.): In der
//       Berichts-Ansicht öffnet "→ Zeiterfassung" das Formular vorbefüllt
//       (Berichts-Nummer als Verweis, Datum, Schicht, Melder; Kostenstelle
//       nur bei EINDEUTIGEM Anlagen-Treffer) - und der gebuchte Eintrag
//       trägt die Berichtsnummer.
//  (Z10) Im Bearbeiten-Dialog gibt es "Speichern + zur Zeiterfassung":
//       erst speichern (Nummer steht fest), dann Formular vorbefüllt.
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
      // Anlage "TS 480" trifft in den Kostenstellen GENAU "TS 480 ADL" -
      // Grundlage für die Vorbelegung in (Z9).
      tpmAnlagen: [{ id: "a1", name: "TS 480", role: "takt" }], riItems: [],
      team: [{ name: "K. Schmidt", rolle: "mech" }, { name: "P. Wagner", rolle: "elek" }, { name: "A. Helfer", rolle: "", zeiterfassung: false }],
    }));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify([
      { id: "s1", nr: "2026-0002", date: "2026-09-08", schicht: "Spät", anlage: "TS 480", stoerung: "Riemen gerissen", gewerk: "mech", fehlerart: "Mechanisch", ausfallzeit: 45, offen: false, gemeldetAt: "2026-09-08T15:00:00.000Z", behobenAt: "2026-09-08T16:00:00.000Z", melder: "K. Schmidt", ursache: "Verschleiß", getan: "Riemen erneuert", ersatzteile: "" },
      // Zwei ALT-Berichte (ikom-Import) mit derselben alten LFDNR - die alte
      // Datenbank hat Nummern nachweislich wiederverwendet. Der Doppel-Wächter
      // darf hier NICHT anschlagen (Z11): Umnummerieren würde die stoerNr-
      // Verweise der importierten Zeiterfassungen zerreißen.
      { id: "ikom-A1", nr: "31288", date: "2026-08-20", schicht: "Früh", anlage: "B3 Be- und Entladeanlage", stoerung: "Drehkreuz nimmt keine Töpfe", gewerk: "mech", fehlerart: "Mechanisch", ausfallzeit: 20, offen: false, gemeldetAt: "2026-08-20T08:00:00.000Z", behobenAt: "2026-08-20T09:00:00.000Z", melder: "Balles" },
      // ikom-B2 steht OFFEN, obwohl längst abgearbeitet - genau die Lage nach
      // dem ersten Import (alter Status wörtlich genommen). (Z13) räumt auf.
      { id: "ikom-B2", nr: "31288", date: "2026-08-21", schicht: "Früh", anlage: "Masseaufbereitung", stoerung: "Display der Waage flackert", gewerk: "elek", fehlerart: "Elektrisch", ausfallzeit: 10, offen: true, gemeldetAt: "2026-08-21T08:00:00.000Z", behobenAt: null, melder: "Wiesner" },
      // Und ein ECHTES Doppel im neuen Nummernkreis - dafür muss der Wächter
      // weiter anschlagen (Z11), sonst wäre er mit dem Import gestorben.
      // s4 ist ein ECHTER offener Bericht der neuen Erfassung - der
      // Alt-Aufräumer (Z13) darf ihn NICHT anfassen.
      { id: "s4", nr: "2026-0002", date: "2026-08-22", schicht: "Früh", anlage: "TS 480", stoerung: "Sensor verschmutzt", gewerk: "mech", fehlerart: "Mechanisch", ausfallzeit: 5, offen: true, nochZuTun: "Sensor tauschen", gemeldetAt: "2026-08-22T08:00:00.000Z", behobenAt: null, melder: "K. Schmidt" },
    ]));
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

  /* ---- (Z11) Nummern-Wächter und Alt-Nummern aus dem ikom-Import ---- */
  await p.getByRole("button", { name: /Störungen/ }).first().click();
  await p.waitForTimeout(700);
  const doppelHinweis = await p.getByText(/Nummer, die es schon gibt/).textContent().catch(() => "");
  pruef("(Z11) Der Doppel-Wächter meldet NUR das Doppel im neuen Nummernkreis, nicht die alte LFDNR",
        // Der Hinweis nennt die Kurzform "0002"; die alte LFDNR 31288 darf
        // NICHT auftauchen (die alte Datenbank hat Nummern wiederverwendet).
        /0002/.test(doppelHinweis || "") && !/31288/.test(doppelHinweis || ""),
        (doppelHinweis || "kein Hinweis").trim().slice(0, 80));

  /* ---- (Z13) Offene Alt-Berichte per Knopf auf erledigt setzen ----
     Robertos Fund nach dem ersten echten Import: ~270 längst abgearbeitete
     Berichte standen offen. Ein Klick räumt NUR die ikom-Berichte auf. */
  const hinweisAlt = await p.getByText(/aus dem alten ikom-System/).count();
  pruef("(Z13) Der Hinweis auf offene Alt-Berichte steht da", hinweisAlt === 1);
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Alle Alt-Berichte auf erledigt setzen", exact: true }).click();
  await p.waitForTimeout(700);
  const nachAufraeumen = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-stoerungen-entries")));
  const b2 = nachAufraeumen.find((s) => s.id === "ikom-B2");
  const s4 = nachAufraeumen.find((s) => s.id === "s4");
  pruef("(Z13) Der Alt-Bericht ist erledigt (Behoben-Zeit = alter Melde-Stempel), der echte offene bleibt offen",
        !!b2 && b2.offen === false && b2.behobenAt === "2026-08-21T08:00:00.000Z" && !!s4 && s4.offen === true,
        JSON.stringify({ b2: b2 && b2.offen, behobenAt: b2 && b2.behobenAt, s4: s4 && s4.offen }));
  pruef("(Z13) Der Hinweis ist danach verschwunden",
        (await p.getByText(/aus dem alten ikom-System/).count()) === 0);

  /* ---- (Z9) Störbericht -> Zeiterfassung aus der Ansicht ---- */
  await p.locator("tr", { hasText: /08\.09\.2026/ }).first().click();
  await p.waitForTimeout(300);
  await p.locator("tr", { hasText: /Spät/ }).last().click();
  await p.waitForTimeout(300);
  await p.locator("tr", { hasText: "0002" }).last().click().catch(() => {}); // tr-scoped: der Doppel-Hinweis oben enthält die Nummer auch
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "→ Zeiterfassung", exact: true }).click();
  await p.waitForTimeout(400);
  const vorbelegt = {
    stoerNr: await p.locator('input[placeholder^="z. B. 2026-"]').inputValue(),
    ks: await p.locator('input[aria-label="Kostenstelle"]').inputValue(),
    taetigkeit: await p.locator('input[placeholder^="z. B. Lager"]').inputValue(),
    wer: await p.locator('select[aria-label="Mitarbeiter wählen"]').inputValue(),
  };
  pruef("(Z9) Das Formular ist aus dem Bericht vorbefüllt (Nr, Kostenstelle, Melder)",
        vorbelegt.stoerNr === "2026-0002" && vorbelegt.ks === "TS 480 ADL (2032002)"
        && /Riemen gerissen/.test(vorbelegt.taetigkeit) && vorbelegt.wer === "K. Schmidt",
        JSON.stringify(vorbelegt));
  await p.locator('input[aria-label="Arbeitsdauer in Stunden"]').fill("2");
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.waitForTimeout(600);
  const bestand3 = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries")));
  const gebucht = bestand3.find((e) => e.category === "ZEIT" && e.stoerNr === "2026-0002");
  pruef("(Z9) Der gebuchte Eintrag trägt die Berichtsnummer als Verweis",
        !!gebucht && gebucht.stunden === 2 && gebucht.date === "2026-09-08" && gebucht.schicht === "Spät",
        gebucht ? `${gebucht.name} | ${gebucht.stunden} Std | ${gebucht.stoerNr}` : "fehlt");

  /* ---- (Z10) "Speichern + zur Zeiterfassung" im Bearbeiten-Dialog ----
     Die Gruppen stehen nach (Z9) noch aufgeklappt - ein erneuter Klick auf
     die Schicht-Zeile würde sie ZUklappen. Deshalb erst nachsehen. */
  if (!(await p.locator("tr", { hasText: "0002" }).last().isVisible().catch(() => false))) {
    await p.locator("tr", { hasText: /08\.09\.2026/ }).first().click();
    await p.waitForTimeout(300);
    await p.locator("tr", { hasText: /Spät/ }).last().click();
    await p.waitForTimeout(300);
  }
  await p.locator("tr", { hasText: "0002" }).last().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Bearbeiten/ }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Speichern + zur Zeiterfassung", exact: true }).click();
  await p.waitForTimeout(700);
  pruef("(Z10) Nach dem Speichern öffnet die vorbefüllte Zeiterfassung",
        (await p.getByText("Neue Zeiterfassung", { exact: true }).count()) >= 1
        && (await p.locator('input[placeholder^="z. B. 2026-"]').inputValue()) === "2026-0002");
  await p.getByRole("button", { name: "Abbrechen", exact: true }).click();

  /* ---- (Z12) ikom-Import über den Knopf im ⚙ (Verlauf & Sicherung) ----
     Kein Node, keine Kommandozeile - Datei wählen, Bilanz lesen, übernehmen.
     Und: dieselbe Datei ZWEIMAL einlesen darf keine Doppel erzeugen. */
  const os = require("os");
  const path = require("path");
  const feld = (k, v) => `${k}:  ${v}\r\n`;
  const doc1 = feld("VorgangsID", "TESTVID001") + feld("SDatum", "15.03.2026 08:30:00") + feld("Schicht", "Früh")
    + feld("Maschine", "TS 480 ADL 2032002") + feld("ST_Code", "1052 Mechanische Reparatur")
    + feld("ST_Beschreibung", "Drehkreuz nimmt keine Töpfe") + feld("ST_Ursache", "Schlauch ab")
    + feld("SF_Maßnahme", "montiert") + feld("ST_Status", "OK") + feld("Bemerkung", "Balles")
    + feld("LFDNR", "30001") + feld("Ausfallzeit", "20");
  const doc2 = feld("VorgangsID", "TESTVID002") + feld("SDatum", "16.03.2026 14:10:00") + feld("Schicht", "Spät")
    + feld("Maschine", "Masseaufbereitung 20306") + feld("ST_Code", "1051 Elektrische Reparatur")
    + feld("ST_Beschreibung", "Waage flackert") + feld("ST_Status", "OK") + feld("Bemerkung", "Wiesner")
    + feld("LFDNR", "30002") + feld("Ausfallzeit", "10")
    + feld("zeArt", "Reparatur") + feld("zeDauer", "1,50") + feld("zeNotizen", "Kabel getauscht") + feld("Mitarbeiter", "Wiesner Jan");
  const doc3 = feld("VorgangsID", "TESTVID003") + feld("SDatum", "17.03.2026 22:05:00") + feld("Schicht", "Nacht")
    + feld("Maschine", "VSM2 20326") + feld("ST_Code", "5005 Sonstiges (bitte mit Erläuterung)")
    + feld("ST_Beschreibung", "Band schief") + feld("ST_Status", "IBWB") + feld("Bemerkung", "Ott")
    + feld("LFDNR", "30003");
  const fixture = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ikom-")), "ikom-export.txt");
  fs.writeFileSync(fixture, Buffer.from(doc1 + "\f" + doc2 + "\f" + doc3, "latin1"));

  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Verlauf & Sicherung", exact: true }).click();
  await p.waitForTimeout(400);
  await p.locator('input[aria-label="ikom-Export wählen"]').setInputFiles(fixture);
  await p.waitForTimeout(500);
  const bilanz1 = await p.getByText(/Dokumente gelesen/).textContent().catch(() => "");
  pruef("(Z12) Die Bilanz vor dem Übernehmen stimmt (3 Berichte, 1 Zeit-Buchung)",
        /3 Dokumente gelesen/.test(bilanz1) && /3.*neue Störberichte/.test(bilanz1) && /1.*neue Zeit-Buchungen/.test(bilanz1),
        (bilanz1 || "keine Bilanz").trim().slice(0, 100));
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await p.waitForTimeout(800);
  const stoerNachher = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-stoerungen-entries")));
  const zeitNachher = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries")));
  const alt1 = stoerNachher.find((s) => s.id === "ikom-TESTVID001");
  const altZeit = zeitNachher.find((e) => e.id === "ikom-zeit-TESTVID002");
  const alt3 = stoerNachher.find((s) => s.id === "ikom-TESTVID003");
  pruef("(Z12) Die Alt-Berichte stehen richtig in der Störungs-Datei (Umlaute, Gewerk, ALLE erledigt)",
        // Robertos Ansage: Alt-Berichte kommen IMMER erledigt an - auch die
        // mit altem Status IBWB. Der Original-Status bleibt nachlesbar.
        !!alt1 && alt1.stoerung === "Drehkreuz nimmt keine Töpfe" && alt1.gewerk === "mech" && alt1.offen === false
        && alt1.nr === "30001" && alt1.melder === "Balles"
        && !!alt3 && alt3.offen === false && alt3.altSystem && alt3.altSystem.status === "IBWB",
        alt1 ? `${alt1.stoerung} | ${alt1.gewerk} | alt3: ${alt3 && alt3.altSystem && alt3.altSystem.status}` : "fehlt");
  pruef("(Z12) Die Zeit-Buchung daraus trägt Kostenstelle samt Nummer",
        !!altZeit && altZeit.name === "Wiesner Jan" && altZeit.ks === "Masseaufbereitung" && altZeit.ksNr === "20306"
        && altZeit.stunden === 1.5 && altZeit.stoerNr === "30002",
        altZeit ? `${altZeit.name} | ${altZeit.ks} (${altZeit.ksNr}) | ${altZeit.stunden}` : "fehlt");
  // Dieselbe Datei nochmal: Bilanz muss "0 neue" zeigen, nichts wächst.
  await p.locator('input[aria-label="ikom-Export wählen"]').setInputFiles(fixture);
  await p.waitForTimeout(500);
  const bilanz2 = await p.getByText(/Dokumente gelesen/).textContent().catch(() => "");
  const stoerDanach = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-stoerungen-entries")));
  pruef("(Z12) Zweimal einlesen erzeugt KEINE Doppel",
        /0.*neue Störberichte/.test(bilanz2) && /0.*neue Zeit-Buchungen/.test(bilanz2)
        && stoerDanach.length === stoerNachher.length,
        (bilanz2 || "").trim().slice(0, 90));

  pruef("(Z1-Z12) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  console.log(`\nHärte 66 (Zeiterfassung): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
