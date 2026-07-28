// Härtetest: TOTER VERWEIS.
//
// Nachgestellt wird eine am Arbeitsplatz gemessene Lage (Chrome 147, Seite über
// file:// von einer Netzwerkfreigabe geöffnet): Der Dateiverweis, den der
// Browser aus der IndexedDB zurückholt, ist unbrauchbar - und zwar STILL.
// queryPermission, getFile, createWritable: keine Antwort. Kein "granted",
// kein "denied", kein Fehler. Der Aufruf kommt nie zurück.
//
// Gemessener Bericht von dort:
//   Gemerkter Verweis: werkstatt-kalender-daten.json – überlebt das Neuladen
//   Schreibrecht ohne Nachfrage: ANTWORTET NICHT (haengt)
//   Leserecht ohne Nachfrage:    ANTWORTET NICHT (haengt)
//   Datei wirklich lesbar:       ANTWORTET NICHT (haengt)
//
// Vorher blieb die App genau hier stehen: Der Start wartete ohne Frist auf eine
// Antwort, die nie kam. Das Ordnersymbol blieb grau, es erschien KEINE Meldung
// und KEIN Knopf - der Nutzer sass vor einer Anwendung, die nichts sagte.
//
// Belegt wird hier:
//   (1) Die App kommt trotz des toten Verweises vollstaendig hoch.
//   (2) Sie sagt klar, was los ist, statt stumm grau zu bleiben.
//   (3) Sie bietet einen Weg heraus - Datei neu waehlen.
//   (4) Der Weg funktioniert und stellt den Schreibzugriff her.
//   (5) Der vorhandene Datei-Inhalt ueberlebt das.
//   (6) Dasselbe fuer die Stoerungen-Datei.
//   (7) Auch ein haengendes SCHREIBEN blockiert die App nicht ewig.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };

async function seite(browser) {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  await p.addInitScript(() => {
    const dateien = {
      "kalender-daten.json": JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: "2026-07-20T08:00:00.000Z",
        entries: [{ id: "alt-haupt", date: "2026-07-15", category: "TPM", name: "BTS", status: "done", updatedAt: "2026-07-15T08:00:00.000Z" }], deleted: {}, config: null }),
      "werkstatt-stoerungen.json": JSON.stringify({ format: "werkstatt-stoerungen-v1", savedAt: "2026-07-20T08:00:00.000Z",
        entries: [{ id: "alt-stoer", date: "2026-07-15", anlage: "VSM1", stoerung: "Altbestand", offen: false, updatedAt: "2026-07-15T08:00:00.000Z" }], deleted: {} }),
    };
    window.__dateien = dateien;

    const nie = () => new Promise(() => {});          // antwortet nie - der Kern des Falls
    const toterVerweis = (name) => ({
      name, kind: "file",
      getFile: nie, queryPermission: nie, requestPermission: nie, createWritable: nie,
    });

    const lebenderVerweis = (name) => ({
      name, kind: "file",
      async getFile() { return new File([dateien[name]], name, { type: "application/json" }); },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
      async createWritable() {
        let puf = "";
        return { async write(c) { puf += c; }, async close() { dateien[name] = puf; }, async abort() {} };
      },
    });

    window.__naechsteDatei = "kalender-daten.json";
    window.showOpenFilePicker = async () => [lebenderVerweis(window.__naechsteDatei)];
    window.showSaveFilePicker = async () => lebenderVerweis(window.__naechsteDatei);

    /* Eine IndexedDB, die genau das zurueckgibt, was der Browser am
       Arbeitsplatz zurueckgibt: einen Verweis, der nicht mehr antwortet.
       Echte Verweise lassen sich nicht mit Absicht kaputtmachen - also wird
       hier die Schicht ersetzt, aus der die App ihn holt. */
    const ablagen = {};   // "db|store" -> Map
    const hole = (db, store) => (ablagen[db + "|" + store] = ablagen[db + "|" + store] || new Map());
    const spaeter = (fn) => setTimeout(fn, 0);

    // Vorbelegung: beide Dateien gelten als "gemerkt" - aber tot.
    hole("werkstatt-kalender-fs", "handles").set("handle", toterVerweis("kalender-daten.json"));
    hole("werkstatt-kalender-fs", "handles").set("mode", "readwrite");
    hole("werkstatt-stoerungen-fs", "handles").set("handle", toterVerweis("werkstatt-stoerungen.json"));
    hole("werkstatt-stoerungen-fs", "handles").set("mode", "readwrite");

    function bauStore(dbName, storeName) {
      const m = hole(dbName, storeName);
      return {
        put(wert, schluessel) { m.set(schluessel, wert); return { }; },
        get(schluessel) { const r = {}; spaeter(() => { r.result = m.get(schluessel); r.onsuccess && r.onsuccess(); }); return r; },
        delete(schluessel) { m.delete(schluessel); return {}; },
        getAll() { const r = {}; spaeter(() => { r.result = [...m.values()]; r.onsuccess && r.onsuccess(); }); return r; },
      };
    }
    function bauDb(dbName) {
      return {
        objectStoreNames: { contains: () => true },
        transaction(storeName) {
          const tx = { objectStore: () => bauStore(dbName, storeName) };
          spaeter(() => { tx.oncomplete && tx.oncomplete(); });
          return tx;
        },
        close() {},
        createObjectStore() {},
      };
    }
    const gefaelscht = {
      open(name) { const r = {}; spaeter(() => { r.result = bauDb(name); r.onsuccess && r.onsuccess(); }); return r; },
      databases: async () => Object.keys(ablagen).map((k) => ({ name: k.split("|")[0], version: 2 })),
      deleteDatabase() { return {}; },
    };
    // window.indexedDB ist ein reiner Lese-Zugriff - eine einfache Zuweisung
    // verpufft lautlos.
    Object.defineProperty(window, "indexedDB", { value: gefaelscht, configurable: true });
  });
  return p;
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---------------- Hauptdatei ---------------- */
  const p = await seite(b);
  const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
  const start = Date.now();
  await p.goto(APP);

  // (1) Kommt die App ueberhaupt hoch? Frueher blieb sie hier haengen.
  let sichtbar = true;
  try {
    await p.getByRole("button", { name: /Gemeinsame Datei/ }).first().waitFor({ timeout: 20000 });
  } catch (e) { sichtbar = false; }
  pruef("(1) App kommt trotz totem Verweis hoch", sichtbar);

  // Die Meldung braucht die abgelaufene Frist - die kommt nach ein paar Sekunden.
  await p.waitForFunction(() => /nicht mehr frei/.test(document.body.innerText), null, { timeout: 25000 })
    .catch(() => {});
  const dauer = Date.now() - start;
  let t = await p.locator("body").innerText();

  pruef("(2) Die App sagt, dass der gemerkte Verweis tot ist", /nicht mehr frei/.test(t));
  pruef("(2) Der Dateiname steht in der Meldung", /kalender-daten\.json/.test(t));
  pruef("(2) Kein stummes Warten – Meldung binnen 20 s", dauer < 20000);
  pruef("(3) Ein Ausweg wird angeboten", (await p.getByRole("button", { name: /Datei auswählen/ }).count()) > 0);

  await p.getByRole("button", { name: /Datei auswählen/ }).first().click();
  await p.waitForTimeout(2500);
  t = await p.locator("body").innerText();
  pruef("(4) Nach dem Auswählen ist die Meldung weg", !/nicht mehr frei/.test(t));
  pruef("(4) Kein Schreibschutz", !/Schreibzugriff auf die Datei nicht erteilt/.test(t));

  const inhalt = await p.evaluate(() => JSON.parse(window.__dateien["kalender-daten.json"]));
  pruef("(5) Der alte Datei-Inhalt lebt noch",
        inhalt.entries.some((e) => e.id === "alt-haupt" && e.name === "BTS"));

  // Ein Speichern muss jetzt wirklich in der Datei landen.
  await p.evaluate(() => window.storage.set("werkstatt-kalender-entries", JSON.stringify([
    { id: "alt-haupt", date: "2026-07-15", category: "TPM", name: "BTS", status: "done", updatedAt: "2026-07-15T08:00:00.000Z" },
    { id: "neu-1", date: "2026-07-28", category: "TPM", name: "HRO", status: "done", updatedAt: "2026-07-28T09:00:00.000Z" },
  ])));
  await p.waitForTimeout(2500);
  const nachher = await p.evaluate(() => JSON.parse(window.__dateien["kalender-daten.json"]));
  pruef("(4) Gespeichertes landet wirklich in der Datei", nachher.entries.some((e) => e.id === "neu-1"));
  pruef("(5) und der Altbestand ist dabei nicht verloren gegangen",
        nachher.entries.some((e) => e.id === "alt-haupt"));

  pruef("(1) Keine JavaScript-Fehler", fehler.length === 0);
  await p.context().close();

  /* ---------------- Störungen-Datei ---------------- */
  const p2 = await seite(b);
  await p2.addInitScript(() => { window.__naechsteDatei = "werkstatt-stoerungen.json"; });
  await p2.goto(APP);
  await p2.waitForTimeout(9000); // Frist des Probelaufs abwarten
  await p2.getByRole("button", { name: /Störungen/ }).first().click();
  await p2.waitForTimeout(800);
  let t2 = await p2.locator("body").innerText();
  pruef("(6) Auch die Störungen-Datei meldet den toten Verweis", /nicht mehr frei/.test(t2));
  pruef("(6) mit Ausweg", (await p2.getByRole("button", { name: /Datei auswählen/ }).count()) > 0);

  await p2.getByRole("button", { name: /Datei auswählen/ }).first().click();
  await p2.waitForTimeout(2500);
  const stoerInhalt = await p2.evaluate(() => JSON.parse(window.__dateien["werkstatt-stoerungen.json"]));
  pruef("(6) Der Altbestand der Störungen lebt noch",
        stoerInhalt.entries.some((e) => e.id === "alt-stoer"));
  await p2.context().close();

  /* ---------------- Hängendes Schreiben ---------------- */
  // Der Verweis lebt, das Lesen geht - aber createWritable antwortet nie.
  // Die App darf daran nicht dauerhaft festhaengen.
  const p3 = await (await b.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  await p3.addInitScript(() => {
    const nie = () => new Promise(() => {});
    const h = {
      name: "kalender-daten.json", kind: "file",
      async getFile() { return new File(['{"format":"werkstatt-kalender-v1","savedAt":null,"entries":[],"deleted":{}}'], "kalender-daten.json"); },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
      createWritable: nie,
    };
    window.showOpenFilePicker = async () => [h];
    window.showSaveFilePicker = async () => h;
  });
  await p3.goto(APP); await p3.waitForTimeout(1200);
  await p3.getByRole("button", { name: /Gemeinsame Datei/ }).first().click(); await p3.waitForTimeout(400);
  const t0 = Date.now();
  await p3.getByRole("button", { name: /Vorhandene Datei öffnen/ }).first().click();
  let kam = true;
  try {
    await p3.waitForFunction(() => /nur ansehen|nicht erteilt|Schreibzugriff|schreibgeschützt/i.test(document.body.innerText),
                             null, { timeout: 45000 });
  } catch (e) { kam = false; }
  pruef("(7) Hängendes Schreiben endet mit einer Aussage, nicht mit Stillstand", kam);
  pruef("(7) und zwar binnen 45 s", Date.now() - t0 < 45000);
  await p3.context().close();

  await b.close();
  console.log(`\nHärte 32: ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})();
