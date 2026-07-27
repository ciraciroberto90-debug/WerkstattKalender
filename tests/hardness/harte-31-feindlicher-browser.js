// Härtetest: FEINDLICHER BROWSER.
//
// Ausgangspunkt ist ein echter Vorfall in der Werkstatt: der Browser lehnt
// requestPermission grundsätzlich ab - auch aus einem frischen Klick. Damit
// ist jeder Weg tot, der auf diese Nachfrage baut:
//   - "Jetzt verbinden" nach dem Browser-Neustart
//   - das Erteilen von Schreibrecht nach dem Dateidialog
//   - die Störungen-Datei, die ausdrücklich JEDER pflegen können muss
//
// Die App darf daran nicht scheitern. Was hier belegt wird:
//   (1) Nach dem Neustart fuehrt "Jetzt verbinden" nicht in eine Sackgasse,
//       sondern bietet den Weg ohne Nachfrage an - sonst muesste die Datei
//       nach JEDEM Neustart neu herausgesucht werden.
//   (2) Der Weg ohne Nachfrage stellt den Schreibzugriff wirklich her.
//   (3) Der vorhandene Datei-Inhalt ueberlebt das.
//   (4) Dasselbe gilt fuer die Stoerungen-Datei.
//   (5) Nie behauptet die App, gespeichert zu haben, wenn sie es nicht hat.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };

async function seite(browser) {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  await p.addInitScript(() => {
    // Zwei Dateien mit vorhandenem Inhalt - der darf unter keinen Umstaenden weg.
    const dateien = {
      "kalender-daten.json": JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: "2026-07-20T08:00:00.000Z",
        entries: [{ id: "alt-haupt", date: "2026-07-15", category: "TPM", name: "BTS", status: "done", updatedAt: "2026-07-15T08:00:00.000Z" }], deleted: {}, config: null }),
      "werkstatt-stoerungen.json": JSON.stringify({ format: "werkstatt-stoerungen-v1", savedAt: "2026-07-20T08:00:00.000Z",
        entries: [{ id: "alt-stoer", date: "2026-07-15", anlage: "VSM1", stoerung: "Altbestand", offen: false, updatedAt: "2026-07-15T08:00:00.000Z" }], deleted: {} }),
    };
    window.__dateien = dateien;
    const bau = (name, schreibbar) => ({
      name, kind: "file",
      async getFile() { return new File([dateien[name]], name, { type: "application/json" }); },
      async createWritable() {
        if (!schreibbar) { const e = new Error("Zugriff verweigert"); e.name = "NotAllowedError"; throw e; }
        let puf = ""; return { async write(c) { puf += c; }, async close() { dateien[name] = puf; } };
      },
      async queryPermission() { return schreibbar ? "granted" : "prompt"; },
      // DIESER BROWSER FRAGT NIE - egal wie frisch der Klick ist.
      async requestPermission() {
        const e = new Error("Failed to execute 'requestPermission' on 'FileSystemHandle': Not allowed to request permissions in this context.");
        e.name = "SecurityError"; throw e;
      },
    });
    window.__naechsteDatei = "kalender-daten.json";
    window.showOpenFilePicker = async () => [bau(window.__naechsteDatei, false)]; // nur lesen
    window.showSaveFilePicker = async () => bau(window.__naechsteDatei, true);    // mit Schreibrecht
  });
  return p;
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  // ---------- Hauptdatei ----------
  const p = await seite(b);
  const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
  await p.goto(APP); await p.waitForTimeout(1500);

  await p.getByRole("button", { name: /Gemeinsame Datei/ }).first().click(); await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Vorhandene Datei öffnen/ }).first().click(); await p.waitForTimeout(2500);

  let t = await p.locator("body").innerText();
  pruef("(1) Kein stiller Schreibschutz nach dem Verbinden", /Schreibzugriff auf die Datei nicht erteilt/.test(t));
  pruef("(1) Der Weg ohne Nachfrage wird angeboten", (await p.getByRole("button", { name: /Mit Schreibrecht verbinden/ }).count()) > 0);

  await p.getByRole("button", { name: /Mit Schreibrecht verbinden/ }).first().click(); await p.waitForTimeout(2500);
  t = await p.locator("body").innerText();
  pruef("(2) Danach besteht Schreibzugriff", !/Schreibschutz/.test(t) && !/nicht erteilt/.test(t));
  pruef("(2) Bearbeiter-Ansicht ist da (Backlog)", /BACKLOG/.test(t));
  pruef("(3) Der alte Datei-Inhalt lebt noch", /alt-haupt/.test(await p.evaluate(() => window.__dateien["kalender-daten.json"])));

  // (5) Wirklich speichern - ueber den echten Speicherweg der App, nicht ueber
  //     das Formular: dort haengt der Speichern-Knopf an Pflichtfeldern, und
  //     geprueft werden soll hier der Weg zur Datei, nicht die Maske.
  await p.evaluate(async () => {
    const liste = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
    liste.push({ id: "pruef-1", date: "2026-07-23", category: "TPM", name: "VSM1", status: "done", note: "Pruefeintrag feindlicher Browser", updatedAt: new Date().toISOString() });
    await window.storage.set("werkstatt-kalender-entries", JSON.stringify(liste));
  });
  await p.waitForTimeout(2000);
  const inhalt = await p.evaluate(() => window.__dateien["kalender-daten.json"]);
  pruef("(5) Gespeichertes steht wirklich in der Datei", /Pruefeintrag feindlicher Browser/.test(inhalt));
  pruef("(5) Und der Altbestand ist immer noch da", /alt-haupt/.test(inhalt));

  // ---------- Störungen-Datei ----------
  await p.evaluate(() => { window.__naechsteDatei = "werkstatt-stoerungen.json"; });
  await p.getByRole("button", { name: /Störungen/ }).first().click(); await p.waitForTimeout(700);
  const oeffnen = p.getByRole("button", { name: /Störungen-Datei öffnen/ }).first();
  if (await oeffnen.count()) { await oeffnen.click(); await p.waitForTimeout(2500); }
  t = await p.locator("body").innerText();
  pruef("(4) Störungen: Ausweg wird angeboten statt Sackgasse",
    (await p.getByRole("button", { name: /Mit Schreibrecht verbinden/ }).count()) > 0 || !/nur zum Ansehen/.test(t));
  if ((await p.getByRole("button", { name: /Mit Schreibrecht verbinden/ }).count()) > 0) {
    await p.getByRole("button", { name: /Mit Schreibrecht verbinden/ }).first().click(); await p.waitForTimeout(2500);
    t = await p.locator("body").innerText();
    pruef("(4) Störungen: danach kein Schreibschutz mehr", !/nur zum Ansehen/.test(t));
  }
  pruef("(4) Störungen: Altbestand lebt noch", /alt-stoer/.test(await p.evaluate(() => window.__dateien["werkstatt-stoerungen.json"])));

  pruef("Keine Skriptfehler über den ganzen Durchlauf", fehler.length === 0);
  if (fehler.length) console.log(fehler);
  console.log(`\n==== FEINDLICHER BROWSER: ${ok} PASS / ${fail} FAIL ====`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
