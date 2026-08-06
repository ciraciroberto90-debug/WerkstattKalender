// Härtetest: OEE LIVE AUS EINER EXCEL-TABELLE.
//
// Die Zahl auf der Übersicht kommt aus einer .xlsx im Datenordner. Gelesen
// wird sie ohne fremde Bibliothek: ZIP auspacken (DecompressionStream), XML
// lesen (DOMParser). Geprüft wird an einer ECHTEN .xlsx - gebaut von
// tests/hilfen/xlsx-bauen.js, mit denselben Eigenheiten, die Excel erzeugt:
// Texte in sharedStrings, Datum als Serienzahl mit Datumsformat, Prozente
// als 0,873 mit Prozentformat.
//
// Geprüft wird:
//   (1) Die Tabelle wird gelesen, die Spalten von selbst erkannt
//   (2) Die Kachel zeigt den Wert des JÜNGSTEN Tages, nicht irgendeinen
//   (3) Fehlt die OEE-Spalte, wird sie aus V × L × Q gerechnet
//   (4) Ändert Excel die Datei, steht die neue Zahl ohne Zutun in der Kachel
//   (5) In die Tabelle wird NIE geschrieben
//   (6) Fehlende Datei / kein Ordner: klare Meldung statt stiller Null
//   (7) Alle Kacheln der Übersicht haben exakt dieselben Maße
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { arbeitsmappeBauen } = require("../hilfen/xlsx-bauen.js");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

// Zwei Tage, zwei Anlagen. Der jüngste Tag (06.08.) mittelt auf 84,0 %.
const MAPPE_NORMAL = arbeitsmappeBauen([{
  name: "OEE",
  zeilen: [
    ["OEE-Auswertung Halle 1"],                         // Titelzeile: nur eine Zelle
    ["Datum", "Anlage", "Schicht", "Verfügbarkeit", "Leistung", "Qualität", "OEE"],
    [{ datum: new Date(Date.UTC(2026, 7, 5)) }, "BTS", "Früh", { prozent: 0.91 }, { prozent: 0.88 }, { prozent: 0.99 }, { prozent: 0.793 }],
    [{ datum: new Date(Date.UTC(2026, 7, 5)) }, "VSM1", "Früh", { prozent: 0.85 }, { prozent: 0.90 }, { prozent: 1.00 }, { prozent: 0.765 }],
    [{ datum: new Date(Date.UTC(2026, 7, 6)) }, "BTS", "Früh", { prozent: 0.94 }, { prozent: 0.92 }, { prozent: 0.99 }, { prozent: 0.860 }],
    [{ datum: new Date(Date.UTC(2026, 7, 6)) }, "VSM1", "Früh", { prozent: 0.88 }, { prozent: 0.93 }, { prozent: 1.00 }, { prozent: 0.820 }],
  ],
}]);

// Dieselben Tage, aber OHNE OEE-Spalte - muss gerechnet werden.
const MAPPE_OHNE_OEE = arbeitsmappeBauen([{
  name: "Tabelle1",
  zeilen: [
    ["Datum", "Anlage", "Verfügbarkeit", "Leistung", "Qualität"],
    [{ datum: new Date(Date.UTC(2026, 7, 6)) }, "BTS", { prozent: 0.90 }, { prozent: 0.80 }, { prozent: 1.00 }],
  ],
}]);

// Nach der "Änderung durch Excel": jüngster Tag ist der 07.08. mit 90,0 %
const MAPPE_NEUER = arbeitsmappeBauen([{
  name: "OEE",
  zeilen: [
    ["Datum", "Anlage", "Schicht", "Verfügbarkeit", "Leistung", "Qualität", "OEE"],
    [{ datum: new Date(Date.UTC(2026, 7, 6)) }, "BTS", "Früh", { prozent: 0.94 }, { prozent: 0.92 }, { prozent: 0.99 }, { prozent: 0.860 }],
    [{ datum: new Date(Date.UTC(2026, 7, 7)) }, "BTS", "Früh", { prozent: 0.96 }, { prozent: 0.95 }, { prozent: 0.99 }, { prozent: 0.900 }],
  ],
}]);

/* Startet die App mit einer gemeinsamen Datei UND einem Datenordner, in dem
   die Excel-Tabelle liegt. Der Ordner-Mock zählt mit, ob jemand schreibend
   auf die Tabelle zugreift - das darf nie passieren. */
async function starte(browser, tabellen) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await p.addInitScript((dateien) => {
    window.__schreibversuche = [];
    window.__tabellen = {};
    Object.entries(dateien).forEach(([n, b64]) => {
      const roh = atob(b64);
      const arr = new Uint8Array(roh.length);
      for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i);
      window.__tabellen[n] = { bytes: arr, stand: 1000 };
    });
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
    const xlsxHandle = (name) => ({
      name, kind: "file",
      async getFile() {
        const t = window.__tabellen[name];
        return new File([t.bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", lastModified: t.stand });
      },
      async createWritable() { window.__schreibversuche.push(name); throw new Error("Schreiben verboten"); },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    window.__ordnerHandle = {
      name: "Werkstatt", kind: "directory",
      async *entries() {
        yield ["werkstatt-kalender-daten.json", jsonHandle];
        for (const n of Object.keys(window.__tabellen)) yield [n, xlsxHandle(n)];
      },
      async getFileHandle(n) {
        if (n === "werkstatt-kalender-daten.json") return jsonHandle;
        if (window.__tabellen[n]) return xlsxHandle(n);
        const e = new Error("NotFoundError");
        e.name = "NotFoundError";
        throw e;
      },
      async removeEntry() {},
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    };
    window.showOpenFilePicker = async () => [jsonHandle];
  }, tabellen);

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
async function richteEin(p, datei) {
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Tabellen im Ordner suchen" }).click();
  await p.waitForTimeout(400);
  await p.locator('select[aria-label="Excel-Tabelle wählen"]').selectOption(datei);
  await p.waitForTimeout(900);
  const zuordnung = await p.locator('select[aria-label="Spalte für OEE"]').inputValue().catch(() => "");
  await p.getByRole("button", { name: "OEE-Quelle übernehmen" }).click();
  await p.waitForTimeout(900);
  await p.getByRole("button", { name: "Abbrechen" }).first().click().catch(() => {});
  await p.waitForTimeout(600);
  return zuordnung;
}

const kachelText = (p) => p.locator("button[title*='OEE']").first().innerText().catch(() => "");

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1)(2)(4)(5) Normalfall ---- */
  {
    const p = await starte(b, { "OEE_Halle1.xlsx": MAPPE_NORMAL.toString("base64") });
    const zuordnung = await richteEin(p, "OEE_Halle1.xlsx");
    pruef("(1) Die OEE-Spalte wird von selbst erkannt", zuordnung === "6", "erkannte Spalte: " + zuordnung);

    const text = await kachelText(p);
    // Jüngster Tag ist der 06.08.: (86,0 + 82,0) / 2 = 84,0
    pruef("(2) Die Kachel zeigt den Wert des jüngsten Tages", /84,0/.test(text), text.replace(/\n/g, " · "));
    pruef("(2) Und nennt den Tag, aus dem die Zahl stammt", /06\.08/.test(text), text.replace(/\n/g, " · "));
    // Vortag war (79,3 + 76,5) / 2 = 77,9 -> Pfeil nach oben, +6,1
    pruef("(2) Der Vergleich zum Vortag steht daneben", /▲/.test(text) && /6,1/.test(text), text.replace(/\n/g, " · "));

    // (4) Excel schreibt die Datei neu - ohne Zutun muss die Zahl nachziehen
    await p.evaluate((b64) => {
      const roh = atob(b64);
      const arr = new Uint8Array(roh.length);
      for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i);
      window.__tabellen["OEE_Halle1.xlsx"] = { bytes: arr, stand: 2000 };
      window.dispatchEvent(new Event("focus")); // wie ein Klick zurück in die App
    }, MAPPE_NEUER.toString("base64"));
    await p.waitForTimeout(1500);
    const text2 = await kachelText(p);
    pruef("(4) Nach der Änderung in Excel steht die neue Zahl in der Kachel",
      /90,0/.test(text2) && /07\.08/.test(text2), text2.replace(/\n/g, " · "));

    pruef("(5) In die Excel-Tabelle wurde nie geschrieben",
      (await p.evaluate(() => window.__schreibversuche)).length === 0);

    /* ---- (7) Alle Kacheln exakt gleich groß ---- */
    const masse = await p.evaluate(() => {
      // Die Kachelreihe ist das erste Raster mit sieben Spalten
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

    await p.context().close();
  }

  /* ---- (3) Ohne OEE-Spalte: aus V x L x Q rechnen ---- */
  {
    const p = await starte(b, { "Schichtdaten.xlsx": MAPPE_OHNE_OEE.toString("base64") });
    await richteEin(p, "Schichtdaten.xlsx");
    const text = await kachelText(p);
    // 0,90 * 0,80 * 1,00 = 72,0
    pruef("(3) Ohne OEE-Spalte wird aus V × L × Q gerechnet", /72,0/.test(text), text.replace(/\n/g, " · "));
    await p.context().close();
  }

  /* ---- (6) Datei verschwindet: klare Meldung, keine stille Null ---- */
  {
    const p = await starte(b, { "OEE_Halle1.xlsx": MAPPE_NORMAL.toString("base64") });
    await richteEin(p, "OEE_Halle1.xlsx");
    await p.evaluate(() => { delete window.__tabellen["OEE_Halle1.xlsx"]; window.dispatchEvent(new Event("focus")); });
    await p.waitForTimeout(1500);
    const kachel = p.locator("button[title*='OEE']").first();
    const titel = await kachel.getAttribute("title");
    const text = await kachel.innerText();
    pruef("(6) Fehlt die Tabelle, sagt die Kachel das",
      /prüfen/i.test(text), text.replace(/\n/g, " · "));
    pruef("(6) Und nennt im Klartext, was fehlt",
      /liegt nicht im Datenordner/i.test(String(titel || "")), String(titel || "—"));
    pruef("(6) Es steht keine erfundene Zahl da", !/\d,\d\s*%/.test(text), text.replace(/\n/g, " · "));
    await p.context().close();
  }

  console.log(`\n==== OEE AUS EXCEL: ${ok} PASS / ${fail} FAIL ====`);
  await b.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
