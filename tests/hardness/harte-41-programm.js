// Härtetest: PROGRAMM-FASSUNG (Desktop-Brücke).
//
// Als installierbares Programm (Electron) bekommt die App über
// window.__werkstattDesktop direkte Dateizugriffe mit echten Pfaden. Dieser
// Test fährt die GEBAUTE App mit genau dieser Brücke - dahinter liegt ein
// echtes Verzeichnis auf der Platte, kein Mock-Objekt im Speicher. Die
// Brücke hier ist dieselbe Schnittstelle, die programm/vorspann.js im
// Electron-Rahmen bereitstellt (waehleDatei, lese, schreibe, liste, merke…).
//
// Gegenprobe: Ohne den Programm-Zweig in sharedfile.js läuft KEINE dieser
// Prüfungen - die App würde nach window.showOpenFilePicker greifen, und den
// gibt es hier nicht (bewusst gelöscht, wie in Electron unter file://).
//
// Geprüft wird, was das Programm dem Browser voraus hat:
//   (1) Verbinden über den Betriebssystem-Dialog (Pfad statt Verweis)
//   (2) Die Kennkarte zeigt den VOLLEN echten Pfad - im Browser unmöglich
//       (gemessen am 05.08.: ein Browser-Verweis kennt keinen Pfad)
//   (3) Speichern landet wirklich in der Datei auf der Platte
//   (4) Fremde Änderung an der Datei kommt per Abgleich herein
//   (5) NEUSTART: Die App verbindet sich VON SELBST wieder - ohne Klick,
//       ohne Rechtefrage, ohne "Jetzt verbinden" (der ganze Komplex vom
//       03.-05.08. existiert im Programm nicht)
//   (6) Es wird dabei kein einziger Dateidialog mehr geöffnet
//   (7) Die Löschmarken-Logik läuft unverändert (dieselbe Sync-Maschine)
//   (8) OEE-Quellordner ist im Programm NUR LESEND - löschen ausgeschlossen
//   (9) Laufwerks-Links öffnen sich direkt über den Rahmen (shell.openPath),
//       statt nur den Pfad zu kopieren
//  (10) OEE: ein eingefügter PFAD genügt - zeigt er auf die .xlsx, werden
//       Ordner und Datei in einem Rutsch übernommen
//  (11) Update-Meldung des Rahmens erscheint als Leiste; "Jetzt
//       aktualisieren" ruft die Übernahme, ein Fehler wird ehrlich gezeigt
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const os = require("os");
const path = require("path");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  // Echtes Arbeitsverzeichnis auf der Platte - wie der OneDrive-Ordner
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "wk-programm-"));
  const dateiPfad = path.join(ordner, "werkstatt-kalender-daten.json");
  const jetzt = new Date().toISOString();
  fs.writeFileSync(dateiPfad, JSON.stringify({
    format: "werkstatt-kalender-v1", savedAt: jetzt,
    entries: [
      { id: "vorhanden-1", date: "2026-08-06", category: "SCHICHT", name: "Anna", scope: "tag", wert: "Früh", updatedAt: jetzt },
    ],
    deleted: {},
    config: { tpmAnlagen: [], riItems: [], team: [{ name: "Anna", rolle: "mech" }] },
  }, null, 2));

  // Gemerkte Pfade des "Programms" (im echten Electron: einstellungen.json)
  const einstellungen = {};
  let dialogAufrufe = 0;
  let schreibSperre = false; // Fall (12): das Laufwerk verweigert das Schreiben

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });

  // Die Brücke: identische Schnittstelle wie programm/vorspann.js, dahinter
  // echtes fs - über exposeFunction laufen die Aufrufe durch Node.
  async function verdrahte(page) {
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await page.exposeFunction("__d_waehleDatei", async () => { dialogAufrufe++; return dateiPfad; });
    await page.exposeFunction("__d_waehleDateiNeu", async (v) => { dialogAufrufe++; return path.join(ordner, String(v)); });
    await page.exposeFunction("__d_waehleOrdner", async () => { dialogAufrufe++; return ordner; });
    await page.exposeFunction("__d_lese", async (p) => {
      try {
        const inhalt = fs.readFileSync(String(p));
        const stat = fs.statSync(String(p));
        return { bytesB64: inhalt.toString("base64"), geaendert: Math.round(stat.mtimeMs), groesse: stat.size };
      } catch (e) { return null; }
    });
    await page.exposeFunction("__d_schreibe", async (p, text) => {
      if (schreibSperre) {
        // Wie ein Firmenlaufwerk ohne Schreibrecht: EPERM beim Umbenennen
        throw new Error("EPERM: operation not permitted, rename '" + String(p) + ".tmp' -> '" + String(p) + "'");
      }
      const tmp = String(p) + ".tmp";
      fs.writeFileSync(tmp, String(text));
      fs.renameSync(tmp, String(p));
      return true;
    });
    await page.exposeFunction("__d_liste", async (p) =>
      fs.readdirSync(String(p), { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => ({ name: e.name, pfad: path.join(String(p), e.name) })));
    await page.exposeFunction("__d_entferne", async (p) => { fs.unlinkSync(String(p)); return true; });
    await page.exposeFunction("__d_merke", async (k, w) => {
      if (w === null || w === undefined) delete einstellungen[k]; else einstellungen[k] = String(w);
      return true;
    });
    await page.exposeFunction("__d_gemerkt", async (k) => (einstellungen[k] === undefined ? null : einstellungen[k]));
    await page.exposeFunction("__d_pfadInfo", async (p) => {
      try {
        const stat = fs.statSync(String(p));
        return stat.isDirectory() ? "ordner" : stat.isFile() ? "datei" : null;
      } catch (e) { return null; }
    });
    await page.addInitScript(() => {
      // Wie in Electron: kein Browser-Dateizugriff, nur die Brücke
      delete window.showOpenFilePicker;
      delete window.showSaveFilePicker;
      delete window.showDirectoryPicker;
      const b64zuBytes = (b64) => {
        const roh = atob(b64);
        const arr = new Uint8Array(roh.length);
        for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i);
        return arr;
      };
      window.__oeffnePfadAufrufe = [];
      window.__updateUebernahmen = 0;
      window.__updateErgebnis = { ok: true };
      window.__werkstattDesktop = {
        waehleDatei: () => window.__d_waehleDatei(),
        waehleDateiNeu: (v) => window.__d_waehleDateiNeu(v),
        waehleOrdner: () => window.__d_waehleOrdner(),
        lese: async (p) => {
          const r = await window.__d_lese(p);
          return r ? { bytes: b64zuBytes(r.bytesB64), geaendert: r.geaendert, groesse: r.groesse } : null;
        },
        schreibe: (p, t) => window.__d_schreibe(p, t),
        liste: (p) => window.__d_liste(p),
        entferne: (p) => window.__d_entferne(p),
        merke: (k, w) => window.__d_merke(k, w),
        gemerkt: (k) => window.__d_gemerkt(k),
        oeffnePfad: async (p) => { window.__oeffnePfadAufrufe.push(p); return true; },
        pfadInfo: (p) => window.__d_pfadInfo(p),
        aufUpdate: (cb) => { window.__updateMelden = cb; },
        updateOrdnerSetzen: async () => true,
        updateStatus: async () => ({ ordner: "", stand: "" }),
        updatePruefen: async () => true,
        updateUebernehmen: async () => { window.__updateUebernahmen++; return window.__updateErgebnis; },
      };
    });
  }

  /* ---- (1)(2)(3) Erstes Verbinden ---- */
  let page = await ctx.newPage();
  await verdrahte(page);
  await page.goto(APP);
  await page.waitForTimeout(600);

  await page.locator('button[aria-label="Gemeinsame Datei"]').click();
  await page.getByText("Vorhandene Datei öffnen …").click();
  await page.waitForTimeout(1000);
  pruef("(1) Verbinden über den Programm-Dialog klappt",
    await page.evaluate(() => window.__wkSharedTest.canWrite()), "canWrite");
  pruef("(1) Der vorhandene Bestand wurde übernommen",
    (await page.locator("body").innerText()).length > 0 &&
    await page.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").some((e) => e.id === "vorhanden-1")));

  // Kennkarte: im Browser steht hier bestenfalls "Ordner / Datei" - nur das
  // Programm kann den vollen Pfad nennen
  const kennkarte = await page.evaluate(() => window.__wkSharedTest.fileInfo());
  pruef("(2) Die Kennkarte kennt den vollen echten Pfad",
    kennkarte && kennkarte.pfad === dateiPfad, (kennkarte && kennkarte.pfad) || "(leer)");
  // Der Verbinden-Dialog schliesst sich nach dem Verbinden - fuer die
  // Kennkarte einmal neu oeffnen, so wie es der Nutzer auch taete.
  await page.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
  await page.waitForTimeout(200);
  await page.locator('button[aria-label="Gemeinsame Datei"]').click();
  await page.waitForTimeout(500);
  const dialogText = await page.locator("body").innerText();
  pruef("(2) Und der Verbinden-Dialog zeigt ihn an",
    dialogText.includes(dateiPfad), dialogText.split("\n").find((z) => z.includes(ordner)) || "(nicht sichtbar)");

  // Speichern -> muss auf der Platte ankommen
  await page.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const alt = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
    await window.storage.set("werkstatt-kalender-entries",
      JSON.stringify(alt.concat([{ id: "neu-1", date: "2026-08-07", category: "SCHICHT", name: "Anna", scope: "tag", wert: "Spät" }])), false);
  });
  await page.waitForTimeout(900);
  let aufPlatte = JSON.parse(fs.readFileSync(dateiPfad, "utf8"));
  pruef("(3) Die Änderung steht wirklich in der Datei auf der Platte",
    aufPlatte.entries.some((e) => e.id === "neu-1"),
    "IDs: " + aufPlatte.entries.filter((e) => !/^(config\||log\|)/.test(e.id)).map((e) => e.id).join(", "));

  /* ---- (4) Fremde Änderung kommt per Abgleich herein ---- */
  aufPlatte = JSON.parse(fs.readFileSync(dateiPfad, "utf8"));
  const fremdZeit = new Date().toISOString();
  aufPlatte.savedAt = fremdZeit;
  aufPlatte.entries.push({ id: "fremd-1", date: "2026-08-08", category: "SCHICHT", name: "Anna", scope: "tag", wert: "Nacht", updatedAt: fremdZeit });
  fs.writeFileSync(dateiPfad, JSON.stringify(aufPlatte, null, 2));
  await page.evaluate(() => window.__wkSharedTest.poll());
  await page.waitForTimeout(600);
  pruef("(4) Die fremde Änderung erscheint nach dem Abgleich",
    await page.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").some((e) => e.id === "fremd-1")));

  /* ---- (7) Löschmarken: dieselbe Sync-Maschine läuft unverändert ---- */
  await page.evaluate(async () => {
    const alt = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
    await window.storage.set("werkstatt-kalender-entries",
      JSON.stringify(alt.filter((e) => e.id !== "vorhanden-1")), false);
  });
  await page.waitForTimeout(900);
  aufPlatte = JSON.parse(fs.readFileSync(dateiPfad, "utf8"));
  pruef("(7) Löschen erzeugt eine Löschmarke in der Datei",
    !!aufPlatte.deleted["vorhanden-1"] && !aufPlatte.entries.some((e) => e.id === "vorhanden-1"),
    "deleted: " + Object.keys(aufPlatte.deleted).join(", "));

  const dialogeVorNeustart = dialogAufrufe;
  await page.close();

  /* ---- (5)(6) Neustart: von selbst wieder verbunden, ohne Dialog ---- */
  page = await ctx.newPage();
  await verdrahte(page);
  await page.goto(APP);
  await page.waitForTimeout(1200);

  pruef("(5) Nach dem Neustart ist die App VON SELBST verbunden",
    await page.evaluate(() => window.__wkSharedTest.canWrite()), "canWrite nach Neustart");
  const text = await page.locator("body").innerText();
  pruef("(5) Kein 'Jetzt verbinden' und keine Rechtefrage",
    !/Jetzt verbinden|Zugriff erlauben|nicht mehr frei/i.test(text));
  pruef("(6) Dabei wurde KEIN Dateidialog geöffnet",
    dialogAufrufe === dialogeVorNeustart, dialogAufrufe + " Dialogaufrufe gesamt");
  pruef("(5) Und der Bestand ist vollständig da",
    await page.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").some((e) => e.id === "fremd-1")));

  /* ---- (8) OEE-Quellordner ist im Programm nur lesend ---- */
  // Die Handle-Fabrik setzt nurLesen selbst durch - egal, was das Laufwerk
  // erlauben würde. Gegenprobe direkt daneben: derselbe Ordner ohne nurLesen
  // darf löschen, sonst wäre die Prüfung wertlos.
  const opfer = path.join(ordner, "wichtige-sicherung.xlsx");
  fs.writeFileSync(opfer, "nicht anfassen");
  const nurLesenErgebnis = await page.evaluate(async ([ordnerPfad, dateiName]) => {
    const gesperrt = window.__wkDesktopTest.ordnerHandle(ordnerPfad, { nurLesen: true });
    try {
      await gesperrt.removeEntry(dateiName);
      return "GELÖSCHT";
    } catch (e) { return "verweigert: " + e.message; }
  }, [ordner, "wichtige-sicherung.xlsx"]);
  pruef("(8) Löschen auf dem nur-lesenden Ordner wird verweigert",
    /verweigert/.test(nurLesenErgebnis) && fs.existsSync(opfer), nurLesenErgebnis);
  const schreibErgebnis = await page.evaluate(async ([ordnerPfad, dateiName]) => {
    const offen = window.__wkDesktopTest.ordnerHandle(ordnerPfad);
    try {
      await offen.removeEntry(dateiName);
      return "gelöscht";
    } catch (e) { return "FEHLER: " + e.message; }
  }, [ordner, "wichtige-sicherung.xlsx"]);
  pruef("(8) Gegenprobe: ohne nurLesen geht das Löschen durch",
    schreibErgebnis === "gelöscht" && !fs.existsSync(opfer), schreibErgebnis);

  /* ---- (9) Laufwerks-Link öffnet sich über den Rahmen ---- */
  // Link anlegen (Linkstreifen ist nur auf der Übersicht sichtbar)
  await page.getByRole("button", { name: "Links & Dokumente" }).click().catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "＋ Link" }).click();
  await page.waitForTimeout(300);
  await page.getByPlaceholder(/Bezeichnung/).fill("Prüfplan-Ordner");
  await page.getByPlaceholder(/Adresse oder Pfad/).fill("X:\\Werkstatt\\Pruefplaene");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.waitForTimeout(1600);
  await page.getByText("Prüfplan-Ordner").first().click();
  await page.waitForTimeout(600);
  const geoeffnet = await page.evaluate(() => window.__oeffnePfadAufrufe);
  pruef("(9) Der Laufwerkspfad wird über den Rahmen geöffnet",
    geoeffnet.length === 1 && geoeffnet[0] === "X:\\Werkstatt\\Pruefplaene", JSON.stringify(geoeffnet));
  pruef("(9) Die Rückmeldung sagt 'geöffnet', nicht 'Pfad kopiert'",
    /✓ geöffnet/.test(await page.locator("body").innerText()));
  // Linkfeld wieder zuklappen - sonst ueberdeckt es die Update-Leiste
  await page.getByRole("button", { name: "Links & Dokumente" }).click().catch(() => {});
  await page.waitForTimeout(300);

  /* ---- (10) OEE über eingefügten Pfad - direkt auf die .xlsx ---- */
  const { arbeitsmappeBauen } = require("../hilfen/xlsx-bauen.js");
  const xlsxOrdner = fs.mkdtempSync(path.join(os.tmpdir(), "wk-oee-"));
  const vorStunden = (h) => new Date(Date.now() - h * 3600e3);
  fs.writeFileSync(path.join(xlsxOrdner, "OEE_Halle1.xlsx"), arbeitsmappeBauen([{
    name: "OEE",
    zeilen: [
      ["Datum", "Uhrzeit", "Anlage", "OEE"],
      [{ datum: vorStunden(2) }, { datum: vorStunden(2) }, "BTS", { prozent: 0.85 }],
    ],
  }]));
  await page.locator('button[aria-label="Verwalten"]').click();
  await page.waitForTimeout(500);
  // Die OEE-Einrichtung liegt seit der Reiter-Aufteilung hinter dem Reiter "OEE"
  await page.getByRole("button", { name: "OEE", exact: true }).click();
  await page.waitForTimeout(250);
  await page.locator('input[aria-label="OEE-Pfad einfügen"]').fill(path.join(xlsxOrdner, "OEE_Halle1.xlsx"));
  await page.getByRole("button", { name: "Pfad übernehmen" }).click();
  await page.waitForTimeout(1200);
  const oeeText = await page.locator("body").innerText();
  pruef("(10) Der eingefügte .xlsx-Pfad setzt Ordner UND Datei",
    /OEE_Halle1\.xlsx/.test(oeeText) && (await page.locator('select[aria-label="Spalte für OEE"]').inputValue().catch(() => "")) === "3",
    "erkannte OEE-Spalte: " + await page.locator('select[aria-label="Spalte für OEE"]').inputValue().catch(() => "—"));
  await page.getByRole("button", { name: "OEE-Quelle übernehmen" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Abbrechen" }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  pruef("(10) Die Kachel zeigt den Wert aus der Tabelle",
    /85,0/.test(await page.locator("button[title*='OEE']").first().innerText()),
    (await page.locator("button[title*='OEE']").first().innerText()).replace(/\n/g, " · "));

  /* ---- (11) Update-Meldung und Übernahme ---- */
  await page.evaluate(() => { window.scrollTo(0, 0); window.__updateMelden && window.__updateMelden({ name: "Werkstatt_Kalender_TPM.html", geaendert: Date.now() }); });
  await page.waitForTimeout(400);
  // Die Leiste liegt unter der klebenden Kopfzeile - fuer den Klick in Sicht scrollen
  await page.getByRole("button", { name: "Jetzt aktualisieren" }).scrollIntoViewIfNeeded();
  pruef("(11) Die Update-Leiste erscheint",
    /Neue Version verfügbar/.test(await page.locator("body").innerText()));
  // Fehlerfall zuerst: Übernahme schlägt fehl -> ehrliche Meldung, App läuft weiter
  await page.evaluate(() => { window.__updateErgebnis = { ok: false, grund: "Die Datei wird gerade noch kopiert - bitte gleich nochmal." }; });
  await page.getByRole("button", { name: "Jetzt aktualisieren" }).click();
  await page.waitForTimeout(500);
  const nachFehler = await page.locator("body").innerText();
  pruef("(11) Ein Fehlschlag wird ehrlich gemeldet",
    /Update nicht übernommen/.test(nachFehler) && /gerade noch kopiert/.test(nachFehler));
  pruef("(11) Und die Übernahme wurde wirklich versucht",
    (await page.evaluate(() => window.__updateUebernahmen)) === 1);
  fs.rmSync(xlsxOrdner, { recursive: true, force: true });

  /* ---- (12) Schreibschutz auf dem Laufwerk: Das Programm zeigt den GRUND
     und den Erneut-versuchen-Knopf OHNE ?verwalten=1 (im Programm gibt es
     keine Adresszeile - Robertos Laufwerks-Probe vom 10.08.). Ohne die
     Änderung blieben Grund und Knopf unsichtbar. ---- */
  {
    schreibSperre = true; // das "Laufwerk" verweigert jedes Schreiben
    const p12 = await ctx.newPage();
    await verdrahte(p12);
    await p12.goto(APP);
    await p12.waitForTimeout(600);
    await p12.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p12.getByText("Vorhandene Datei öffnen …").click();
    await p12.waitForTimeout(1500);
    await p12.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
    await p12.waitForTimeout(400);
    const leiste = await p12.locator("body").innerText();
    pruef("(12) Verweigert das Laufwerk das Schreiben, steht die App auf Schreibschutz",
      /Schreibschutz/.test(leiste));
    pruef("(12) Das Programm nennt den technischen Grund OHNE verwalten=1",
      /Technischer Grund:/.test(leiste), (leiste.match(/Technischer Grund:[^\n]*/) || ["—"])[0].slice(0, 90));
    pruef("(12) Der Erneut-versuchen-Knopf ist im Programm sichtbar",
      (await p12.getByRole("button", { name: "Schreibzugriff erneut versuchen" }).count()) === 1);
    pruef("(12) Der Datei-Wechsel-Knopf bleibt trotzdem versteckt (03.08.-Lehre)",
      (await p12.getByRole("button", { name: "Andere Datei wählen …" }).count()) === 0);
    // Laufwerk gibt das Schreiben wieder frei -> ein Klick heilt die Verbindung
    schreibSperre = false;
    await p12.getByRole("button", { name: "Schreibzugriff erneut versuchen" }).click();
    await p12.waitForTimeout(1200);
    pruef("(12) Nach dem Freigeben heilt der Knopf die Verbindung (Schreibschutz weg)",
      !/Schreibschutz – dieser Rechner/.test(await p12.locator("body").innerText()));
    await p12.close();
  }

  console.log(`\n==== PROGRAMM-FASSUNG: ${ok} PASS / ${fail} FAIL ====`);
  await browser.close();
  fs.rmSync(ordner, { recursive: true, force: true });
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
