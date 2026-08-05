// Härtetest: VERBINDEN ÜBER DEN DATEIDIALOG (Ordnersymbol rechts oben).
//
// Fehlerbild aus der Werkstatt: "Failed to execute 'requestPermission' on
// 'FileSystemHandle': Not allowed to request permissions in this context."
// Ursache: Die Nutzeraktivierung eines Klicks gilt rund fünf Sekunden.
// Solange der Dateiauswahl-Dialog offen steht - Ordner suchen, Datei
// anklicken - läuft sie ab. Die App fragte danach trotzdem noch einmal nach
// der Erlaubnis, obwohl das Auswählen im Dialog die Erlaubnis bereits IST.
//
// Hier wird belegt:
//   (A) Langer Dialog + Erlaubnis schon erteilt -> verbindet, Frage geht durch
//   (B) Langer Dialog + Erlaubnis fehlt + Nachfrage scheitert -> bricht NICHT
//       ab; ob geschrieben werden darf, entscheidet der echte Zugriff
//   (C) Nutzer lehnt ausdrücklich ab -> klare Meldung, kein Verbinden
//   (D) Die Störungen-Datei verhält sich genauso (gleicher Sync-Kern)
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };

async function starte(browser, { dialogDauer, erlaubnis, antwort }) {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  await p.addInitScript(({ dialogDauer, erlaubnis, antwort }) => {
    window.__frageKam = false; window.__frageAktivierung = null;
    const datei = { name: "kalender-daten.json", inhalt: JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: "2026-07-20T08:00:00.000Z", entries: [], deleted: {}, config: null }) };
    const bau = (name, format) => ({
      name, kind: "file",
      async getFile() { return new File([datei.inhalt], name, { type: "application/json" }); },
      async createWritable() { let puf = ""; return { async write(c) { puf += c; }, async close() { datei.inhalt = puf; } }; },
      async queryPermission() { return erlaubnis; },
      async requestPermission() {
        window.__frageKam = true;
        window.__frageAktivierung = navigator.userActivation.isActive;
        if (antwort === "wirft" || (antwort === "echt" && !navigator.userActivation.isActive)) {
          const e = new Error("Failed to execute 'requestPermission' on 'FileSystemHandle': Not allowed to request permissions in this context.");
          e.name = "SecurityError"; throw e;
        }
        return antwort === "denied" ? "denied" : "granted";
      },
    });
    const h = bau("kalender-daten.json");
    window.showOpenFilePicker = async () => { await new Promise(r => setTimeout(r, dialogDauer)); return [h]; };
    window.showSaveFilePicker = async () => { await new Promise(r => setTimeout(r, dialogDauer)); return h; };
  }, { dialogDauer, erlaubnis, antwort });
  const fehler = []; p.on("pageerror", e => fehler.push(e.message));
  await p.goto(APP); await p.waitForTimeout(1500);
  return { p, fehler };
}

async function verbinde(p, wartezeit) {
  await p.getByRole("button", { name: /Gemeinsame Datei/ }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: /Vorhandene Datei öffnen/ }).first().click();
  await p.waitForTimeout(wartezeit);
  return p.locator("body").innerText();
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  // (A) Dialog steht 7 Sekunden offen, Erlaubnis liegt vor
  {
    const { p, fehler } = await starte(b, { dialogDauer: 7000, erlaubnis: "granted", antwort: "echt" });
    const text = await verbinde(p, 10000);
    pruef("(A) Keine Meldung 'Not allowed to request permissions'", !/Not allowed to request permissions/.test(text));
    pruef("(A) Nach dem Schreibzugriff wird gefragt (sonst gaebe es keinen)", (await p.evaluate(() => window.__frageKam)) === true);
    pruef("(A) Datei gilt als verbunden", !/ist nach dem Browser-Neustart getrennt/.test(text) && !/Verbinden hat nicht geklappt/.test(text));
    pruef("(A) Keine Skriptfehler", fehler.length === 0);
    await p.context().close();
  }

  // (B) Dialog lang, Erlaubnis fehlt, die Nachfrage scheitert an der Aktivierung
  {
    const { p, fehler } = await starte(b, { dialogDauer: 7000, erlaubnis: "prompt", antwort: "wirft" });
    const text = await verbinde(p, 10000);
    pruef("(B) Nachfrage wurde versucht", (await p.evaluate(() => window.__frageKam)) === true);
    pruef("(B) Der Abbruch der Nachfrage stoppt das Verbinden NICHT", !/Not allowed to request permissions/.test(text));
    pruef("(B) Keine Skriptfehler", fehler.length === 0);
    await p.context().close();
  }

  // (C) Der Nutzer lehnt im Browser-Dialog ausdrücklich ab
  {
    const { p } = await starte(b, { dialogDauer: 200, erlaubnis: "prompt", antwort: "denied" });
    const text = await verbinde(p, 2500);
    pruef("(C) Ausdrückliche Ablehnung wird klar gemeldet", /nicht erlaubt/.test(text));
    await p.context().close();
  }

  // (D) Störungen-Datei über denselben Weg
  {
    const { p, fehler } = await starte(b, { dialogDauer: 7000, erlaubnis: "granted", antwort: "echt" });
    await p.getByRole("button", { name: /Störungen/ }).first().click();
    await p.waitForTimeout(600);
    const knopf = p.getByRole("button", { name: /Störungen-Datei öffnen/ }).first();
    if (await knopf.count()) {
      await knopf.click(); await p.waitForTimeout(10000);
      const text = await p.locator("body").innerText();
      pruef("(D) Störungen-Datei: keine Meldung 'Not allowed'", !/Not allowed to request permissions/.test(text));
      pruef("(D) Störungen-Datei: keine Skriptfehler", fehler.length === 0);
    } else {
      pruef("(D) Störungen-Datei: Öffnen-Knopf vorhanden", false);
    }
    await p.context().close();
  }

  /* (E) Die ausgewählte Datei ist LEER.
     Der Fall vom 03.08.2026: Ein Kollege wählte beim Neuanlegen der
     Verknüpfung eine leere Datei statt der gemeinsamen. Ordner-Symbol grün,
     Dateiname richtig, Inhalt leer - aufgefallen ist es Tage später. Der
     Browser gibt keinen Pfad heraus, zwei Dateien gleichen Namens sind also
     nicht zu unterscheiden. Was sich sehr wohl feststellen lässt: dass keine
     Einträge drin sind. Genau danach wird jetzt gefragt. */
  for (const [fall, anzahl, lokal, erwartet] of [
    ["leer, Gerät hat Einträge", 0, 12, true],     // der Widerspruch - hier wird gefragt
    ["leer, Gerät auch leer", 0, 0, false],        // Erststart: leer ist zu Recht leer
    ["gefüllt", 42, 12, false],                    // alles in Ordnung
  ]) {
    const p = await (await b.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
    await p.addInitScript((v) => {
      const n = v.anzahl;
      // Was auf dem Gerät schon liegt - daran entscheidet sich die Rückfrage.
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(
        Array.from({ length: v.lokal }, (_, i) => ({ id: "l" + i, date: "2026-07-01", category: "TPM",
          name: "VSM1", status: "open", updatedAt: "2026-07-01T08:00:00.000Z" }))));
      const inhalt = JSON.stringify({
        format: "werkstatt-kalender-v1", savedAt: "2026-08-01T06:00:00.000Z", deleted: {}, config: null,
        entries: Array.from({ length: n }, (_, i) => ({
          id: "e" + i, date: "2026-07-10", category: "TPM", name: "BTS", status: "done",
          updatedAt: "2026-07-10T08:00:00.000Z" })),
      });
      let darf = false;
      const h = {
        name: "werkstatt-kalender-daten.json", kind: "file",
        async getFile() { return new File([inhalt], "werkstatt-kalender-daten.json", { type: "application/json" }); },
        async createWritable() {
          if (!darf) { const e = new Error("x"); e.name = "NotAllowedError"; throw e; }
          let b2 = ""; return { async write(c) { b2 += c; }, async close() {} };
        },
        async queryPermission() { return darf ? "granted" : "prompt"; },
        async requestPermission() { darf = true; return "granted"; },
      };
      window.showOpenFilePicker = async () => [h];
      window.showSaveFilePicker = async () => h;
    }, { anzahl, lokal });
    await p.goto(APP); await p.waitForTimeout(1400);
    await p.getByRole("button", { name: /Gemeinsame Datei/ }).first().click(); await p.waitForTimeout(400);
    await p.getByRole("button", { name: /Vorhandene Datei öffnen/ }).first().click();
    await p.waitForTimeout(2500);
    const da = (await p.locator('div[role="dialog"][aria-label="Diese Datei enthält keine Einträge"]').count()) === 1;
    pruef(`(E) ${fall}: Nachfrage ${erwartet ? "erscheint" : "erscheint NICHT"}`, da === erwartet);
    if (erwartet && da) {
      const t = await p.locator('div[role="dialog"]').innerText();
      // Die Kenndaten sind der Ersatz für den Pfad, den es nicht gibt.
      pruef("(E) Die Nachfrage nennt die Kenndaten der Datei",
        /KEINE Einträge/.test(t) && /werkstatt-kalender-daten\.json/.test(t));
      pruef("(E) Und bietet an, eine andere zu wählen",
        (await p.getByRole("button", { name: /Andere Datei wählen/ }).count()) === 1);
    }
    await p.context().close();
  }

  console.log(`\n==== DATEIDIALOG: ${ok} PASS / ${fail} FAIL ====`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
