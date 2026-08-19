// Beweis-Test: "Failed to execute 'requestPermission' ... Not allowed to
// request permissions in this context".
//
// Chrome erlaubt requestPermission nur, solange die Nutzeraktivierung des
// Klicks noch gilt - gemessen rund 5 Sekunden. Sie ueberlebt ein await,
// aber nicht beliebig lange. reconnect() liest vorher ZWEIMAL aus der
// IndexedDB, und jedes Lesen oeffnet die Datenbank neu. Auf einem frisch
// hochgefahrenen Rechner (kalte Platte, Virenscanner, Kopiervorgang) dauert das.
//
// Der Test stellt genau das nach: langsame IndexedDB, echter Klick.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const p = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await p.addInitScript(() => {
    window.__idbVerzoegerung = 0;
    window.__frageAktivierung = null;   // Aktivierung im Moment von requestPermission
    window.__frageKam = false;

    const datei = { name: "kalender-daten.json", inhalt: JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: "2026-07-20T08:00:00.000Z", entries: [], deleted: {}, config: null }) };
    const handle = {
      name: datei.name, kind: "file",
      async getFile() { return new File([datei.inhalt], datei.name, { type: "application/json" }); },
      async createWritable() { let puffer = ""; return { async write(c) { puffer += c; }, async close() { datei.inhalt = puffer; } }; },
      async queryPermission() { return "prompt"; },   // wie nach einem Neustart
      async requestPermission() {
        window.__frageKam = true;
        window.__frageAktivierung = navigator.userActivation.isActive;
        // Chrome wirft hier, wenn die Aktivierung weg ist - genau die Meldung des Nutzers
        if (!navigator.userActivation.isActive) {
          const e = new Error("Failed to execute 'requestPermission' on 'FileSystemHandle': Not allowed to request permissions in this context.");
          e.name = "SecurityError"; throw e;
        }
        return "granted";
      },
    };

    // Ersatz-IndexedDB: haelt den Verweis im Speicher (echte IndexedDB kann
    // ein Objekt mit Methoden nicht ablegen) und ist auf Wunsch langsam.
    const ablage = new Map([["handle", handle], ["mode", "readwrite"]]);
    const spaeter = (fn) => setTimeout(fn, window.__idbVerzoegerung);
    // window.indexedDB ist ein schreibgeschuetzter Zugriffspunkt - eine
    // einfache Zuweisung verpufft still. defineProperty ersetzt ihn wirklich.
    const ersatzIDB = {
      open() {
        const req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null };
        spaeter(() => {
          req.result = {
            objectStoreNames: { contains: () => true },
            createObjectStore: () => {}, close: () => {},
            transaction: () => ({
              objectStore: () => ({
                get(k) { const r = { onsuccess: null, onerror: null, result: ablage.get(k) }; spaeter(() => r.onsuccess && r.onsuccess()); return r; },
                put(v, k) { ablage.set(k, v); const r = { onsuccess: null, onerror: null }; spaeter(() => r.onsuccess && r.onsuccess()); return r; },
                delete(k) { ablage.delete(k); const r = { onsuccess: null }; spaeter(() => r.onsuccess && r.onsuccess()); return r; },
                getAllKeys() { const r = { onsuccess: null, result: [...ablage.keys()] }; spaeter(() => r.onsuccess && r.onsuccess()); return r; },
              }),
              set oncomplete(fn) { spaeter(fn); }, set onerror(fn) {},
            }),
          };
          req.onsuccess && req.onsuccess();
        });
        return req;
      },
    };
    Object.defineProperty(window, "indexedDB", { value: ersatzIDB, configurable: true });
    // NICHT loeschen - sonst haelt die App die Technik fuer nicht verfuegbar
    // und zeigt den Verbinden-Knopf gar nicht erst an.
    window.showOpenFilePicker = async () => { throw new Error("im Test nicht benutzt"); };
    window.showSaveFilePicker = async () => { throw new Error("im Test nicht benutzt"); };
  });

  const fehler = [];
  p.on("pageerror", e => fehler.push(e.message));
  await p.goto(APP);
  await p.waitForTimeout(1800);

  let ok = 0, schlecht = 0;
  const pruef = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : schlecht++; };

  const banner = await p.locator("body").innerText();
  pruef("Nach dem Start steht die Datei als getrennt da", /nach dem Browser-Neustart getrennt/.test(banner));

  // Kalte Platte nachstellen: jede IndexedDB-Antwort braucht 3 Sekunden.
  await p.evaluate(() => { window.__idbVerzoegerung = 3000; });

  const knopf = p.getByRole("button", { name: /Jetzt verbinden/ }).first();
  await knopf.click();
  await p.waitForTimeout(12000);

  const kam = await p.evaluate(() => window.__frageKam);
  const akt = await p.evaluate(() => window.__frageAktivierung);
  const text = await p.locator("body").innerText();

  pruef("Der Klick fragt den Browser ueberhaupt nach der Erlaubnis", kam === true);
  pruef("Die Nutzeraktivierung gilt dabei noch (kein await davor)", akt === true);
  pruef("Keine Meldung 'Not allowed to request permissions'", !/Not allowed to request permissions/.test(text));
  pruef("Die Warnleiste ist verschwunden - die Datei ist verbunden", !/nach dem Browser-Neustart getrennt/.test(text));
  pruef("Keine Skriptfehler", fehler.length === 0);
  if (fehler.length) console.log(fehler);

  console.log(`\n==== WIEDERVERBINDEN NACH NEUSTART: ${ok} PASS / ${schlecht} FAIL ====`);
  await b.close();
  process.exit(schlecht ? 1 : 0);
})();
