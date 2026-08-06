// Härtetest: OEE LIVE AUS EINER EXCEL-TABELLE.
//
// Die Zahl auf der Übersicht kommt aus einer .xlsx auf dem Firmenlaufwerk.
// Gelesen wird sie ohne fremde Bibliothek: ZIP auspacken
// (DecompressionStream), XML lesen (DOMParser). Geprüft wird an einer ECHTEN
// .xlsx - gebaut von tests/hilfen/xlsx-bauen.js, mit denselben Eigenheiten,
// die Excel erzeugt: Texte in sharedStrings, Datum als Serienzahl mit
// Datumsformat, Prozente als 0,873 mit Prozentformat.
//
// Alle Zeitangaben in den Prüfmustern sind RELATIV zum Zeitpunkt des Laufs -
// mit festen Datumsangaben hätte der Test je nach Kalendertag ein anderes
// Ergebnis, und genau das soll ein Test nicht haben.
//
// Geprüft wird:
//   (1) Die Tabelle wird gelesen, die Spalten von selbst erkannt
//   (2) Die Kachel zeigt das Mittel der LETZTEN 24 STUNDEN über alle Anlagen
//   (3) Fehlt die OEE-Spalte, wird sie aus V × L × Q gerechnet
//   (4) Ändert Excel die Datei, steht die neue Zahl ohne Zutun in der Kachel
//   (5) In die Tabelle wird NIE geschrieben
//   (6) Fehlende Datei: klare Meldung statt stiller Null
//   (7) Alle Kacheln der Übersicht haben exakt dieselben Maße
//   (8) Ein Klick öffnet die Anlagenübersicht, schlechteste Anlage zuerst
//   (9) Hinkt die Tabelle hinterher, sagt die Kachel das - statt eine alte
//       Zahl wie eine frische aussehen zu lassen
//  (10) Die Tabelle darf in einem EIGENEN Ordner liegen (Firmenlaufwerk),
//       getrennt vom Datenordner
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { arbeitsmappeBauen } = require("../hilfen/xlsx-bauen.js");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

// Excel schreibt Datum und Uhrzeit als eine Zahl - der Bauer nimmt ein Date
// und rechnet um. "vor N Stunden" ist damit direkt eine Zelle.
const vorStunden = (h) => new Date(Date.now() - h * 3600e3);

/* Zwei Anlagen. Innerhalb der letzten 24 h: BTS 86,0 und VSM1 82,0 -> 84,0.
   Davor (vor 30/32 h): 79,3 und 76,5 -> 77,9, also ein Plus von 6,1. */
const MAPPE_NORMAL = () => arbeitsmappeBauen([{
  name: "OEE",
  zeilen: [
    ["OEE-Auswertung Halle 1"],                         // Titelzeile: nur eine Zelle
    ["Datum", "Uhrzeit", "Anlage", "Schicht", "Verfügbarkeit", "Leistung", "Qualität", "OEE"],
    [{ datum: vorStunden(32) }, { datum: vorStunden(32) }, "BTS", "Früh", { prozent: 0.91 }, { prozent: 0.88 }, { prozent: 0.99 }, { prozent: 0.793 }],
    [{ datum: vorStunden(30) }, { datum: vorStunden(30) }, "VSM1", "Früh", { prozent: 0.85 }, { prozent: 0.90 }, { prozent: 1.00 }, { prozent: 0.765 }],
    [{ datum: vorStunden(5) }, { datum: vorStunden(5) }, "BTS", "Früh", { prozent: 0.94 }, { prozent: 0.92 }, { prozent: 0.99 }, { prozent: 0.860 }],
    [{ datum: vorStunden(3) }, { datum: vorStunden(3) }, "VSM1", "Früh", { prozent: 0.88 }, { prozent: 0.93 }, { prozent: 1.00 }, { prozent: 0.820 }],
  ],
}]);

// Dieselbe Tabelle, aber Excel hat eine Zeile ergänzt: jetzt 90,0 als Mittel
// (BTS 86,0 + VSM1 82,0 + HRO 102,0 wäre unsinnig - deshalb ersetzt die neue
// Mappe die alten Zeilen durch zwei mit 90,0 und 90,0)
const MAPPE_NEUER = () => arbeitsmappeBauen([{
  name: "OEE",
  zeilen: [
    ["Datum", "Uhrzeit", "Anlage", "Schicht", "Verfügbarkeit", "Leistung", "Qualität", "OEE"],
    [{ datum: vorStunden(4) }, { datum: vorStunden(4) }, "BTS", "Früh", { prozent: 0.96 }, { prozent: 0.95 }, { prozent: 0.99 }, { prozent: 0.900 }],
    [{ datum: vorStunden(2) }, { datum: vorStunden(2) }, "VSM1", "Früh", { prozent: 0.96 }, { prozent: 0.95 }, { prozent: 0.99 }, { prozent: 0.900 }],
  ],
}]);

// Ohne OEE-Spalte: 0,90 × 0,80 × 1,00 = 72,0
const MAPPE_OHNE_OEE = () => arbeitsmappeBauen([{
  name: "Tabelle1",
  zeilen: [
    ["Datum", "Uhrzeit", "Anlage", "Verfügbarkeit", "Leistung", "Qualität"],
    [{ datum: vorStunden(2) }, { datum: vorStunden(2) }, "BTS", { prozent: 0.90 }, { prozent: 0.80 }, { prozent: 1.00 }],
  ],
}]);

// Die Tabelle hinkt drei Tage hinterher
const MAPPE_ALT = () => arbeitsmappeBauen([{
  name: "OEE",
  zeilen: [
    ["Datum", "Uhrzeit", "Anlage", "Schicht", "OEE"],
    [{ datum: vorStunden(72) }, { datum: vorStunden(72) }, "BTS", "Früh", { prozent: 0.55 }],
  ],
}]);

/* Startet die App mit gemeinsamer Datei, Datenordner und - je nach Fall -
   einem zweiten Ordner fürs Firmenlaufwerk. Beide Ordner-Mocks zählen mit,
   ob jemand schreibend auf eine Tabelle zugreift: Das darf nie passieren. */
async function starte(browser, { imDatenordner = {}, imQuellordner = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await p.addInitScript(([daten, quelle]) => {
    window.__schreibversuche = [];
    const entpacke = (map) => {
      const raus = {};
      Object.entries(map || {}).forEach(([n, b64]) => {
        const roh = atob(b64);
        const arr = new Uint8Array(roh.length);
        for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i);
        raus[n] = { bytes: arr, stand: 1000 };
      });
      return raus;
    };
    window.__tabellen = entpacke(daten);
    window.__quellTabellen = quelle ? entpacke(quelle) : null;

    window.__kalender = JSON.stringify({
      format: "werkstatt-kalender-v1", savedAt: new Date().toISOString(),
      entries: [], deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [] },
    });
    const jsonHandle = {
      name: "werkstatt-kalender-daten.json", kind: "file",
      async getFile() { return new File([window.__kalender], "werkstatt-kalender-daten.json", { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { window.__kalender = b; } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    };
    const xlsxHandle = (topf, name) => ({
      name, kind: "file",
      async getFile() {
        const t = topf[name];
        return new File([t.bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", lastModified: t.stand });
      },
      async createWritable() { window.__schreibversuche.push(name); throw new Error("Schreiben verboten"); },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    const ordnerAus = (topf, name, mitJson) => ({
      name, kind: "directory",
      async *entries() {
        if (mitJson) yield ["werkstatt-kalender-daten.json", jsonHandle];
        for (const n of Object.keys(topf)) yield [n, xlsxHandle(topf, n)];
      },
      async getFileHandle(n) {
        if (mitJson && n === "werkstatt-kalender-daten.json") return jsonHandle;
        if (topf[n]) return xlsxHandle(topf, n);
        const e = new Error("NotFoundError");
        e.name = "NotFoundError";
        throw e;
      },
      async removeEntry() {},
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    window.__ordnerHandle = ordnerAus(window.__tabellen, "Werkstatt", true);
    if (window.__quellTabellen) {
      window.__quellOrdnerHandle = ordnerAus(window.__quellTabellen, "OEE-Auswertung", false);
      // Der Ordnerdialog gibt genau diesen Ordner zurück
      window.showDirectoryPicker = async (opts) => {
        window.__ordnerModus = opts && opts.mode;   // muss "read" sein
        return window.__quellOrdnerHandle;
      };
    }
    window.showOpenFilePicker = async () => [jsonHandle];
  }, [imDatenordner, imQuellordner]);

  await p.goto(APP);
  await p.waitForTimeout(500);
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForTimeout(900);
  await p.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
  await p.waitForTimeout(200);
  await p.evaluate(() => window.__wkSharedTest.adoptFolder(window.__ordnerHandle));
  return p;
}

// OEE einrichten - über die Oberfläche, nicht an ihr vorbei
async function richteEin(p, datei, { eigenerOrdner = false } = {}) {
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(400);
  if (eigenerOrdner) {
    await p.getByRole("button", { name: "Ordner wählen …" }).click();
    await p.waitForTimeout(700);
  } else {
    await p.getByRole("button", { name: "Tabellen im Ordner suchen" }).click();
    await p.waitForTimeout(400);
  }
  await p.locator('select[aria-label="Excel-Tabelle wählen"]').selectOption(datei);
  await p.waitForTimeout(900);
  const zuordnung = await p.locator('select[aria-label="Spalte für OEE"]').inputValue().catch(() => "");
  await p.getByRole("button", { name: "OEE-Quelle übernehmen" }).click();
  await p.waitForTimeout(900);
  await p.getByRole("button", { name: "Abbrechen" }).first().click().catch(() => {});
  await p.waitForTimeout(700);
  return zuordnung;
}

const kachel = (p) => p.locator("button[title*='OEE']").first();

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1)(2)(4)(5)(7)(8) Normalfall ---- */
  {
    const p = await starte(b, { imDatenordner: { "OEE_Halle1.xlsx": MAPPE_NORMAL().toString("base64") } });
    const zuordnung = await richteEin(p, "OEE_Halle1.xlsx");
    pruef("(1) Die OEE-Spalte wird von selbst erkannt", zuordnung === "7", "erkannte Spalte: " + zuordnung);

    const text = await kachel(p).innerText();
    pruef("(2) Die Kachel zeigt das Mittel der letzten 24 Stunden", /84,0/.test(text), text.replace(/\n/g, " · "));
    pruef("(2) Und sagt, dass es die letzten 24 h sind", /letzte 24 h/.test(text), text.replace(/\n/g, " · "));
    // Die 24 Stunden davor: 77,9 -> Plus von 6,1
    pruef("(2) Der Vergleich zu den 24 h davor steht daneben", /▲/.test(text) && /6,1/.test(text), text.replace(/\n/g, " · "));
    const titel = await kachel(p).getAttribute("title");
    pruef("(2) Der Tooltip nennt Anlagenzahl und Herkunft",
      /2 Anlage/.test(String(titel)) && /OEE_Halle1\.xlsx/.test(String(titel)), String(titel || "").split("\n")[1]);

    /* (8) Klick auf die Kachel -> Anlagenübersicht */
    await kachel(p).click();
    await p.waitForTimeout(400);
    const dialog = p.locator('[aria-label="OEE Anlagenübersicht"]');
    pruef("(8) Ein Klick öffnet die Anlagenübersicht", await dialog.count() === 1);
    const zeilenTexte = await dialog.locator("tbody tr").allInnerTexts();
    pruef("(8) Jede Anlage steht mit ihrem Wert darin",
      zeilenTexte.length === 2 && zeilenTexte.some((z) => /BTS/.test(z) && /86,0/.test(z)) && zeilenTexte.some((z) => /VSM1/.test(z) && /82,0/.test(z)),
      zeilenTexte.join(" | "));
    pruef("(8) Die schlechteste Anlage steht oben", /VSM1/.test(zeilenTexte[0] || ""), (zeilenTexte[0] || "").replace(/\n/g, " "));
    await p.locator('[aria-label="OEE Anlagenübersicht"] button[aria-label="Schließen"]').click();
    await p.waitForTimeout(300);

    /* (7) Alle Kacheln exakt gleich groß */
    const masse = await p.evaluate(() => {
      const raster = [...document.querySelectorAll(".grid")].find((g) => getComputedStyle(g).gridTemplateColumns.split(" ").length === 7);
      if (!raster) return null;
      return [...raster.children].map((k) => {
        const r = k.getBoundingClientRect();
        return { b: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
      });
    });
    const breiten = masse ? [...new Set(masse.map((m) => m.b))] : [];
    const hoehen = masse ? [...new Set(masse.map((m) => m.h))] : [];
    pruef("(7) Es sind sieben Kacheln", masse && masse.length === 7, masse ? masse.length + " Kacheln" : "Raster nicht gefunden");
    pruef("(7) Alle Kacheln sind exakt gleich breit", breiten.length === 1, "Breiten: " + breiten.join(", "));
    pruef("(7) Alle Kacheln sind exakt gleich hoch", hoehen.length === 1, "Höhen: " + hoehen.join(", "));

    /* (4) Excel schreibt die Datei neu - ohne Zutun muss die Zahl nachziehen */
    await p.evaluate((b64) => {
      const roh = atob(b64);
      const arr = new Uint8Array(roh.length);
      for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i);
      window.__tabellen["OEE_Halle1.xlsx"] = { bytes: arr, stand: 2000 };
      window.dispatchEvent(new Event("focus")); // wie ein Klick zurück in die App
    }, MAPPE_NEUER().toString("base64"));
    await p.waitForTimeout(1500);
    const text2 = await kachel(p).innerText();
    pruef("(4) Nach der Änderung in Excel steht die neue Zahl in der Kachel",
      /90,0/.test(text2), text2.replace(/\n/g, " · "));

    pruef("(5) In die Excel-Tabelle wurde nie geschrieben",
      (await p.evaluate(() => window.__schreibversuche)).length === 0);

    await p.context().close();
  }

  /* ---- (3) Ohne OEE-Spalte: aus V x L x Q rechnen ---- */
  {
    const p = await starte(b, { imDatenordner: { "Schichtdaten.xlsx": MAPPE_OHNE_OEE().toString("base64") } });
    await richteEin(p, "Schichtdaten.xlsx");
    const text = await kachel(p).innerText();
    pruef("(3) Ohne OEE-Spalte wird aus V × L × Q gerechnet", /72,0/.test(text), text.replace(/\n/g, " · "));
    await p.context().close();
  }

  /* ---- (9) Tabelle hinkt hinterher ---- */
  {
    const p = await starte(b, { imDatenordner: { "OEE_alt.xlsx": MAPPE_ALT().toString("base64") } });
    await richteEin(p, "OEE_alt.xlsx");
    const text = await kachel(p).innerText();
    pruef("(9) Bei alten Daten steht NICHT 'letzte 24 h' an der Kachel", !/letzte 24 h/.test(text), text.replace(/\n/g, " · "));
    pruef("(9) Sondern der Hinweis, dass die Zahl veraltet ist", /veraltet/i.test(text), text.replace(/\n/g, " · "));
    await kachel(p).click();
    await p.waitForTimeout(400);
    const warnung = await p.locator('[aria-label="OEE Anlagenübersicht"]').innerText();
    pruef("(9) Die Übersicht nennt das Alter in Stunden", /7[0-9] Stunden|8[0-9] Stunden/.test(warnung),
      (warnung.match(/.*Stunden.*/) || ["—"])[0].trim().slice(0, 90));
    await p.context().close();
  }

  /* ---- (10) Tabelle in einem EIGENEN Ordner (Firmenlaufwerk) ---- */
  {
    const p = await starte(b, {
      imDatenordner: {},                                       // im Datenordner liegt KEINE Tabelle
      imQuellordner: { "OEE_Halle1.xlsx": MAPPE_NORMAL().toString("base64") },
    });
    const zuordnung = await richteEin(p, "OEE_Halle1.xlsx", { eigenerOrdner: true });
    pruef("(10) Auch aus einem eigenen Ordner wird die Spalte erkannt", zuordnung === "7", "erkannte Spalte: " + zuordnung);
    const text = await kachel(p).innerText();
    pruef("(10) Die Zahl steht in der Kachel, obwohl der Datenordner leer ist",
      /84,0/.test(text), text.replace(/\n/g, " · "));
    // Der Ordner darf ausschließlich LESEND angefragt worden sein
    const modus = await p.evaluate(() => window.__ordnerModus || null);
    pruef("(10) Der Ordner wurde nur lesend angefragt", modus === null || modus === "read", String(modus));
    pruef("(10) Auch hier wurde nie geschrieben",
      (await p.evaluate(() => window.__schreibversuche)).length === 0);
    await p.context().close();
  }

  /* ---- (6) Datei verschwindet: klare Meldung, keine stille Null ---- */
  {
    const p = await starte(b, { imDatenordner: { "OEE_Halle1.xlsx": MAPPE_NORMAL().toString("base64") } });
    await richteEin(p, "OEE_Halle1.xlsx");
    await p.evaluate(() => { delete window.__tabellen["OEE_Halle1.xlsx"]; window.dispatchEvent(new Event("focus")); });
    await p.waitForTimeout(1500);
    const titel = await kachel(p).getAttribute("title");
    const text = await kachel(p).innerText();
    pruef("(6) Fehlt die Tabelle, sagt die Kachel das", /prüfen/i.test(text), text.replace(/\n/g, " · "));
    pruef("(6) Und nennt im Klartext, was fehlt",
      /liegt nicht im gewählten Ordner/i.test(String(titel || "")), String(titel || "—"));
    pruef("(6) Es steht keine erfundene Zahl da", !/\d,\d\s*%/.test(text), text.replace(/\n/g, " · "));
    await p.context().close();
  }

  console.log(`\n==== OEE AUS EXCEL: ${ok} PASS / ${fail} FAIL ====`);
  await b.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
