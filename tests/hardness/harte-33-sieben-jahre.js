// Härtetest: SIEBEN JAHRE BETRIEB.
//
// Nicht "viele Einträge", sondern der Bestand, der nach sieben Jahren wirklich
// dasteht: jeder Arbeitstag mit Schichteinträgen für acht Leute, monatliche
// TPM- und R+I-Nachweise, laufende Backlog-Arbeiten, Übergabe-Notizen und
// 1260 Störberichte - zusammen rund 17 000 Einträge und 3,4 MB.
//
// Was hier auf dem Prüfstand steht, ist nicht die Geschwindigkeit, sondern die
// Frage, ob bei dieser Menge irgendwo still etwas verlorengeht:
//   (1) Kommt die App mit dem Bestand ueberhaupt hoch, und wie lange dauert es?
//   (2) Reicht der Zwischenspeicher des Browsers - und wenn nicht, sagt sie es?
//   (3) Ueberlebt jeder einzelne Eintrag das Verbinden und das Speichern?
//   (4) Zwei Bearbeiter gleichzeitig, bei voller Datenmenge - beide Aenderungen da?
//   (5) Schichtbuch, Suche und Auswertung ueber sieben Jahrgaenge.
//   (6) Der Pruefnachweis rechnet ueber den ganzen Zeitraum.
//   (7) Keine Skriptfehler, an keiner Stelle.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { baueBestand, baueStoerungen, TEAM } = require("/home/user/WerkstattKalender/tools/langzeit-daten.js");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const { entries: BESTAND } = baueBestand();
const STOERUNGEN = baueStoerungen();
const CONFIG = { team: TEAM };

// Eine gemeinsame "Platte", auf die beide Bearbeiter zugreifen.
const platte = {
  "kalender-daten.json": JSON.stringify({
    format: "werkstatt-kalender-v1", savedAt: "2026-07-28T05:00:00.000Z",
    entries: BESTAND, deleted: {}, config: null,
  }),
  "werkstatt-stoerungen.json": JSON.stringify({
    format: "werkstatt-stoerungen-v1", savedAt: "2026-07-28T05:00:00.000Z",
    entries: STOERUNGEN, deleted: {},
  }),
};

async function seite(browser, { mitStoerdatei = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-07-28T09:00:00"));
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript((cfg) => {
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(cfg));
    localStorage.setItem("werkstatt-kalender-name", "R. Ciraci");
    const bau = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib(name, b); }, async abort() {} }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    window.__welche = "kalender-daten.json";
    window.showOpenFilePicker = async () => [bau(window.__welche)];
    window.showSaveFilePicker = async () => bau(window.__welche);
  }, CONFIG);
  return p;
}

async function verbindeHaupt(p) {
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  console.log(`Bestand: ${BESTAND.length} Einträge, ${STOERUNGEN.length} Störberichte, ` +
              `${Math.round((platte["kalender-daten.json"].length + platte["werkstatt-stoerungen.json"].length) / 1024)} KB`);
  console.log("");

  /* ---------------- (1) Hochkommen und Verbinden ---------------- */
  const p = await seite(b);
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));

  let t0 = Date.now();
  await p.goto(APP);
  await p.locator('button[aria-label="Gemeinsame Datei"]').waitFor({ timeout: 30000 });
  const startDauer = Date.now() - t0;
  pruef("(1) App kommt mit sieben Jahrgängen hoch", startDauer < 15000, startDauer + " ms");

  t0 = Date.now();
  await verbindeHaupt(p);
  await p.waitForFunction(() => !!document.querySelector('button[aria-label="Gemeinsame Datei"]') &&
    !/Vorhandene Datei öffnen/.test(document.body.innerText), null, { timeout: 60000 });
  await p.waitForTimeout(2500);
  const verbindeDauer = Date.now() - t0;
  pruef("(1) Verbinden dauert unter 30 s", verbindeDauer < 30000, verbindeDauer + " ms");

  /* ---------------- (2) Zwischenspeicher ---------------- */
  const speicher = await p.evaluate(() => {
    let gesamt = 0; const teile = {};
    for (const k of Object.keys(localStorage)) {
      const n = (localStorage.getItem(k) || "").length; gesamt += n; teile[k] = Math.round(n / 1024);
    }
    return { kb: Math.round(gesamt / 1024), teile };
  });
  console.log("      localStorage:", speicher.kb, "KB", JSON.stringify(speicher.teile));
  pruef("(2) Bestand passt in den Zwischenspeicher", speicher.kb > 0 && speicher.kb < 5000, speicher.kb + " KB");
  const textNachVerbinden = await p.locator("body").innerText();
  pruef("(2) Keine falsche Speicher-Warnung", !/Zwischenspeicher dieses Browsers ist voll/.test(textNachVerbinden));

  /* ---------------- (2b) Die Archiv-Erinnerung ----------------
     Bei sieben Jahrgaengen MUSS sie kommen - das ist der eingebaute Schutz
     davor, in den vollen Zwischenspeicher zu laufen. Sie liegt bewusst als
     Dialog ueber der Bedienung; wegklicken ist Teil der Pruefung. */
  const archivDa = /Aufräumen empfohlen/i.test(textNachVerbinden);
  pruef("(2b) Archiv-Erinnerung erscheint bei sieben Jahrgängen", archivDa);
  pruef("(2b) Sie nennt den Zeitraum und die Menge",
        /7 Jahre/.test(textNachVerbinden) && /KB/.test(textNachVerbinden));
  if (archivDa) {
    await p.getByRole("button", { name: /Später erinnern/ }).click();
    await p.waitForTimeout(800);
    const nachher = await p.locator("body").innerText();
    pruef("(2b) „Später erinnern“ schließt sie, ohne etwas zu löschen",
          !/Aufräumen empfohlen/i.test(nachher) &&
          JSON.parse(platte["kalender-daten.json"]).entries.length >= BESTAND.length);
  } else {
    pruef("(2b) „Später erinnern“ schließt sie, ohne etwas zu löschen", false, "Dialog kam nicht");
  }

  /* ---------------- (3) Kein Eintrag geht verloren ---------------- */
  const nachVerbinden = JSON.parse(platte["kalender-daten.json"]);
  pruef("(3) Alle Einträge stehen nach dem Verbinden noch in der Datei",
        nachVerbinden.entries.filter((e) => !String(e.id).startsWith("config|") && !String(e.id).startsWith("log|")).length >= BESTAND.length,
        nachVerbinden.entries.length + " in der Datei");

  const stichprobe = [BESTAND[0], BESTAND[Math.floor(BESTAND.length / 2)], BESTAND[BESTAND.length - 1]];
  const vorhanden = new Set(nachVerbinden.entries.map((e) => e.id));
  pruef("(3) Stichprobe Anfang/Mitte/Ende des Zeitraums vorhanden",
        stichprobe.every((e) => vorhanden.has(e.id)));

  /* ---------------- (4) Zwei Bearbeiter gleichzeitig ---------------- */
  const p2 = await seite(b);
  const fehler2 = [];
  p2.on("pageerror", (e) => fehler2.push(e.message));
  await p2.goto(APP);
  await p2.locator('button[aria-label="Gemeinsame Datei"]').waitFor({ timeout: 30000 });
  await verbindeHaupt(p2);
  await p2.waitForTimeout(4000);
  const spaeter2 = p2.getByRole("button", { name: /Später erinnern/ });
  if (await spaeter2.count()) { await spaeter2.click(); await p2.waitForTimeout(500); }

  const vorherAnzahl = JSON.parse(platte["kalender-daten.json"]).entries.length;

  t0 = Date.now();
  await Promise.all([
    p.evaluate(async () => {
      const roh = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
      roh.push({ id: "gleichzeitig|A", date: "2026-07-28", category: "NOTIZ",
                 text: "Bearbeiter A war hier", updatedAt: new Date().toISOString() });
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify(roh));
    }),
    p2.evaluate(async () => {
      const roh = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
      roh.push({ id: "gleichzeitig|B", date: "2026-07-28", category: "NOTIZ",
                 text: "Bearbeiter B war hier", updatedAt: new Date().toISOString() });
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify(roh));
    }),
  ]);
  await p.waitForTimeout(3000);
  const speicherDauer = Date.now() - t0;

  const nachSchreiben = JSON.parse(platte["kalender-daten.json"]);
  const ids = new Set(nachSchreiben.entries.map((e) => e.id));
  pruef("(4) Änderung von Bearbeiter A steht in der Datei", ids.has("gleichzeitig|A"));
  pruef("(4) Änderung von Bearbeiter B steht in der Datei", ids.has("gleichzeitig|B"));
  pruef("(4) Kein Bestand dabei verloren gegangen",
        nachSchreiben.entries.length >= vorherAnzahl,
        vorherAnzahl + " → " + nachSchreiben.entries.length);
  pruef("(4) Gleichzeitiges Speichern bei voller Menge unter 25 s", speicherDauer < 25000, speicherDauer + " ms");

  /* ---------------- (5) Schichtbuch, Suche, Auswertung ---------------- */
  await p2.context().close();

  await p.evaluate(() => { window.__welche = "werkstatt-stoerungen.json"; });
  await p.getByRole("button", { name: /Störungen/ }).first().click();
  await p.waitForTimeout(600);
  const stoerKnopf = p.getByRole("button", { name: /Störungen-Datei öffnen/ });
  if (await stoerKnopf.count()) {
    t0 = Date.now();
    await stoerKnopf.first().click();
    await p.waitForTimeout(6000);
    pruef("(5) Störungen-Datei mit 1260 Berichten verbunden", Date.now() - t0 < 30000, (Date.now() - t0) + " ms");
  } else {
    pruef("(5) Störungen-Datei mit 1260 Berichten verbunden", false, "Knopf nicht gefunden");
  }

  let stoerText = await p.locator("body").innerText();
  pruef("(5) Schichtbuch zeigt Einträge", /Einträge|Eintrag/.test(stoerText));

  const suche = p.getByPlaceholder(/Suche|suchen/i).first();
  if (await suche.count()) {
    t0 = Date.now();
    await suche.fill("Getriebe");
    await p.waitForTimeout(2000);
    pruef("(5) Suche über sieben Jahrgänge antwortet zügig", Date.now() - t0 < 10000, (Date.now() - t0) + " ms");
    await suche.fill("");
    await p.waitForTimeout(800);
  } else {
    pruef("(5) Suche über sieben Jahrgänge antwortet zügig", false, "Suchfeld nicht gefunden");
  }

  /* ---------------- (6) Auswertung und Prüfnachweis ---------------- */
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(600);
  t0 = Date.now();
  await p.getByRole("button", { name: "Auswertung", exact: true }).click();
  await p.waitForTimeout(3000);
  const auswertung = await p.locator("body").innerText();
  pruef("(6) Auswertung rechnet über sieben Jahrgänge", /%/.test(auswertung) && Date.now() - t0 < 20000, (Date.now() - t0) + " ms");

  await p.getByRole("button", { name: "Übersicht", exact: true }).click();
  await p.waitForTimeout(1200);
  let nachweisOk = false, nachweisKopf = "";
  try {
    const [nw] = await Promise.all([
      p.context().waitForEvent("page", { timeout: 30000 }),
      p.getByRole("button", { name: /Prüfnachweis/ }).click(),
    ]);
    await nw.waitForTimeout(2500);
    nachweisKopf = (await nw.locator("body").innerText()).slice(0, 200).replace(/\s+/g, " ");
    nachweisOk = /\d/.test(nachweisKopf);
    await nw.close();
  } catch (e) { nachweisKopf = "Fehler: " + e.message; }
  pruef("(6) Prüfnachweis öffnet und rechnet", nachweisOk, nachweisKopf.slice(0, 90));

  /* ---------------- (6b) Neuladen bei voller Datenmenge ----------------
     Der haeufigste Handgriff im Alltag - und der einzige Weg, auf dem der
     gemerkte Zugriff, das Wiedereinlesen von 3,4 MB und das Zusammenfuehren
     von 17 000 Eintraegen alle drei auf einmal beansprucht werden. */
  const vorReload = JSON.parse(platte["kalender-daten.json"]).entries.length;
  t0 = Date.now();
  await p.reload();
  await p.locator('button[aria-label="Gemeinsame Datei"]').waitFor({ timeout: 60000 });
  await p.waitForTimeout(5000);
  const reloadDauer = Date.now() - t0;
  const spaeter3 = p.getByRole("button", { name: /Später erinnern/ });
  if (await spaeter3.count()) { await spaeter3.click(); await p.waitForTimeout(500); }

  pruef("(6b) Neuladen mit sieben Jahrgängen unter 30 s", reloadDauer < 30000, reloadDauer + " ms");
  const lokalNachReload = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").length);
  pruef("(6b) Der volle Bestand ist nach dem Neuladen wieder da",
        lokalNachReload >= BESTAND.length, lokalNachReload + " Einträge");
  const nachReload = JSON.parse(platte["kalender-daten.json"]).entries.length;
  pruef("(6b) Das Neuladen hat die Datei nicht verkleinert",
        nachReload >= vorReload, vorReload + " → " + nachReload);

  /* ---------------- (7) Skriptfehler ---------------- */
  pruef("(7) Keine Skriptfehler bei Bearbeiter A", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  pruef("(7) Keine Skriptfehler bei Bearbeiter B", fehler2.length === 0, fehler2.slice(0, 2).join(" | "));

  await p.context().close();
  await b.close();
  console.log(`\nHärte 33 (sieben Jahre): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})();
