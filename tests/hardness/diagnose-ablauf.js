// Prüfung der Diagnose-Seite selbst.
//
// Sie ist inzwischen das Werkzeug, mit dem in der Werkstatt gemessen wird -
// also muss sie genauso belegt sein wie die Anwendung. Geprüft wird der
// vollständige geführte Ablauf: vier Auswahl-Schritte, die Rundreise, das
// selbsttätige Neuladen, die Messung danach und der fertige Bericht.
//
// Der Kern: Der Bericht muss das Neuladen ÜBERLEBEN. Genau daran sind die
// Vorgängerfassungen gescheitert - die Ergebnisse von vor dem Neuladen waren
// hinterher weg, und niemandem war es aufgefallen.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const SEITE = "file:///home/user/WerkstattKalender/tools/Werkstatt_Diagnose.html";
let ok = 0, fail = 0;
const pruef = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };

// Ein Browser, in dem die zurückgeholten Verweise entweder arbeiten oder
// verweigern - je nach Schalter.
function bauUmgebung(modus) {
  return `(() => {
    const ablage = new Map();
    const inhalte = {};
    const lebt = (name, kind) => ({
      name, kind,
      async getFile(){ return new File([inhalte[name] || "x".repeat(42)], name); },
      async queryPermission(){ return "granted"; },
      async requestPermission(){ return "granted"; },
      async isSameEntry(){ return true; },
      async createWritable(){ let puf = ""; return { async write(c){ puf += c; }, async close(){ inhalte[name] = puf; }, async abort(){} }; },
      entries(){ return { next: async () => ({ done: true }) }; },
    });
    // Verweigert alles - bis auf die ausdrueckliche Nachfrage, falls der
    // Modus "klick" gilt. Danach arbeitet er wieder.
    const tot = (name, kind) => {
      const nein = () => { const e = new Error("Zugriff verweigert"); e.name = "NotAllowedError"; return Promise.reject(e); };
      let frei = false;
      const gut = lebt(name, kind);
      return {
        name, kind,
        getFile(){ return frei ? gut.getFile() : nein(); },
        queryPermission(){ return frei ? Promise.resolve("granted") : nein(); },
        requestPermission(){
          if (modus !== "klick") return nein();
          frei = true; return Promise.resolve("granted");
        },
        createWritable(){ return frei ? gut.createWritable() : nein(); },
        isSameEntry(){ return frei ? Promise.resolve(true) : nein(); },
        entries(){ return { next: () => frei ? Promise.resolve({ done: true }) : nein() }; },
      };
    };
    const modus = ${JSON.stringify(modus)};
    let zaehler = 0;
    window.showOpenFilePicker = async () => [lebt("datei-" + (++zaehler) + ".json", "file")];
    window.showDirectoryPicker = async () => lebt("ordner", "directory");
    window.showSaveFilePicker = async () => lebt("cockpit-schreibtest.json", "file");

    // IndexedDB durch eine eigene Ablage ersetzen: echte Dateiverweise lassen
    // sich nicht nachbauen, also wird die Schicht ersetzt, aus der die Seite
    // sie holt. Nach dem Neuladen kommt zurück, was der Schalter vorgibt.
    const nachladen = modus !== "gut";
    const store = (db, s) => {
      const k = db + "|" + s;
      if (!ablage.has(k)) ablage.set(k, new Map());
      return ablage.get(k);
    };
    // Ablage über das Neuladen hinweg: die Seite selbst nutzt localStorage,
    // wir hängen unsere Verweis-Namen daran.
    const merkeNamen = () => {
      const m = store("diagnose-cockpit", "merker");
      const namen = {};
      m.forEach((v, k) => { if (v && v.name) namen[k] = [v.name, v.kind]; });
      localStorage.setItem("test-namen", JSON.stringify(namen));
    };
    const holeNamen = () => { try { return JSON.parse(localStorage.getItem("test-namen") || "{}"); } catch(e){ return {}; } };
    Object.entries(holeNamen()).forEach(([k, [n, kind]]) => {
      store("diagnose-cockpit", "merker").set(k, nachladen ? tot(n, kind) : lebt(n, kind));
    });

    const spaeter = (fn) => setTimeout(fn, 0);
    const bauStore = (db, s) => {
      const m = store(db, s);
      return {
        put(w, k){ m.set(k, w); merkeNamen(); return {}; },
        get(k){ const r = {}; spaeter(() => { r.result = m.get(k); r.onsuccess && r.onsuccess(); }); return r; },
        delete(k){ m.delete(k); return {}; },
        getAll(){ const r = {}; spaeter(() => { r.result = [...m.values()]; r.onsuccess && r.onsuccess(); }); return r; },
      };
    };
    const bauDb = (db) => ({
      objectStoreNames: { contains: () => true },
      transaction(s){ const tx = { objectStore: () => bauStore(db, s) }; spaeter(() => tx.oncomplete && tx.oncomplete()); return tx; },
      close(){}, createObjectStore(){},
    });
    Object.defineProperty(window, "indexedDB", { configurable: true, value: {
      open(name){ const r = {}; spaeter(() => { r.result = bauDb(name); r.onsuccess && r.onsuccess(); }); return r; },
      databases: async () => [{ name: "diagnose-cockpit", version: 1 }],
      deleteDatabase(){ return {}; },
    }});
  })()`;
}

async function durchlauf(browser, modus, titel) {
  console.log("\n=== " + titel + " ===");
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.addInitScript(bauUmgebung(modus));
  await p.goto(SEITE);

  await p.getByRole("button", { name: "Diagnose starten" }).click();

  // Schritte 1-4: Dateien und Ordner wählen
  for (let i = 1; i <= 4; i++) {
    const knopf = p.getByRole("button", { name: /auswählen …/ });
    await knopf.waitFor({ timeout: 10000 });
    await knopf.click();
    await p.waitForTimeout(400);
  }
  // Schritt 5: Schreibtest
  const anlegen = p.getByRole("button", { name: /Testdatei anlegen/ });
  await anlegen.waitFor({ timeout: 10000 });
  await anlegen.click();
  pruef(titel + ": alle fünf Auswahl-Schritte durchlaufen", true);

  // Rundreise läuft von allein, danach die Explorer-Frage
  const explorer = p.getByRole("button", { name: /Grüner Haken/ });
  await explorer.waitFor({ timeout: 240000 });
  pruef(titel + ": Rundreise beendet, Explorer-Frage erscheint", true);
  await explorer.click();

  await p.waitForFunction(() => /lädt sich jetzt selbst neu/.test(document.body.innerText), null, { timeout: 20000 });
  pruef(titel + ": Seite kündigt das Neuladen selbst an", true);

  // Nach dem Neuladen: automatische Messung, dann die Nachfrage
  const anfordern = p.getByRole("button", { name: "Zugriff jetzt anfordern" });
  await anfordern.waitFor({ timeout: 300000 });
  pruef(titel + ": Nachfrage-Schritt wird angeboten", true);
  await anfordern.click();
  const weiter = p.getByRole("button", { name: "Weiter zum Bericht" });
  await weiter.waitFor({ timeout: 200000 });
  await weiter.click();

  await p.waitForSelector("#bericht", { timeout: 30000 });
  const bericht = await p.locator("#bericht").inputValue();

  pruef(titel + ": Bericht vorhanden", bericht.length > 400);
  pruef(titel + ": Umgebung von VOR dem Neuladen ist noch enthalten", /Browser:/.test(bericht) && /Protokoll:/.test(bericht));
  pruef(titel + ": Rundreise-Ergebnisse überleben das Neuladen", /Rundreise ORIGINAL/.test(bericht));
  pruef(titel + ": Antwort auf die Explorer-Frage steht im Bericht", /Symbol im Explorer/.test(bericht));
  pruef(titel + ": Messung nach dem Neuladen enthalten", /— nach dem Neuladen —/.test(bericht));
  pruef(titel + ": Schreibtest vor dem Neuladen protokolliert", /Schreibtest VORHER – SCHREIBEN/.test(bericht));
  pruef(titel + ": Schreibtest nach dem Neuladen protokolliert", /Schreibtest-Datei – SCHREIBEN/.test(bericht));
  pruef(titel + ": Nachfrage auf gemerkten Verweis gemessen", /NACHFRAGE auf gemerkten Verweis/.test(bericht));
  pruef(titel + ": Kopfzeile mit Befund", /^WERKSTATT-COCKPIT DIAGNOSE/.test(bericht) && /Befund: /.test(bericht));
  pruef(titel + ": Dauer und Abstand zum Seitenstart protokolliert", /\[\d+ ms, \d+ s nach Seitenstart\]/.test(bericht));
  pruef(titel + ": keine JavaScript-Fehler", fehler.length === 0);

  const befund = (bericht.match(/Befund: (.+)/) || [])[1] || "";
  console.log("      Befund: " + befund);
  await ctx.close();
  return befund;
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  const gut = await durchlauf(b, "gut", "Alles in Ordnung");
  pruef("Befund erkennt den unauffälligen Fall", /arbeiten/i.test(gut));

  const tot = await durchlauf(b, "tot", "Nach dem Neuladen tot");
  pruef("Befund erkennt, dass alle Speicherorte betroffen sind", /alle speicherorte/i.test(tot));

  const klick = await durchlauf(b, "klick", "Tot, aber die Nachfrage hilft");
  pruef("Befund erkennt, dass ein Klick genügt", /klick genügt/i.test(klick));

  await b.close();
  console.log(`\nDiagnose-Ablauf: ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})();
