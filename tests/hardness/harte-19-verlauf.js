// Härtetest: VERLAUF (wer hat wann was geändert).
// Der Verlauf liegt als eigene Einträge ("log|...") in derselben Datei und erbt
// dadurch die konfliktfreie Zusammenführung: jede Zeile hat eine eindeutige,
// nie wieder veränderte id.
//  (1) Anlegen, Ändern und Löschen werden mit Name und Zeit festgehalten
//  (2) Zwei Bearbeiter gleichzeitig -> beide Zeilen bleiben, keine geht verloren
//  (3) Verlaufszeilen gelangen NIE in die Terminliste der App
//  (4) Ein Wiederholversuch beim Speichern erzeugt keine doppelten Zeilen
//  (5) Änderungen an den Grundeinstellungen werden festgehalten
//  (6) Zeilen älter als 90 Tage fallen heraus
//  (7) Der Urheber steht AM EINTRAG - dauerhaft, nicht nur in der Verlaufszeile
//  (8) Fremde Einträge werden beim eigenen Speichern NICHT überstempelt
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const check = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };
const drive = {};

async function makeUser(browser, uhr, name) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.setFixedTime(new Date(uhr));
  await page.exposeFunction("__fsRead", (n) => drive[n] ?? "");
  await page.exposeFunction("__fsWrite", (n, c) => { drive[n] = c; });
  await page.addInitScript((wer) => {
    if (wer) localStorage.setItem("werkstatt-kalender-name", wer);
    window.__mk = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__fsRead(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__fsWrite(name, b); } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
  }, name || "");
  await page.goto(APP);
  await page.waitForTimeout(900);
  return page;
}

const adopt = (p) => p.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
const setzeEntries = (p, a) => p.evaluate(async (x) => await window.storage.set("werkstatt-kalender-entries", JSON.stringify(x)), a);
const setzeConfig = (p, c) => p.evaluate(async (x) => await window.storage.set("werkstatt-kalender-config", JSON.stringify(x)), c);
const lokaleEntries = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
const datei = () => JSON.parse(drive["kalender-daten.json"] || "{}");
const verlauf = () => (datei().entries || []).filter((e) => String(e.id).startsWith("log|"));
const leer = () => JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: null });

const A = (id, name, date = "2026-07-10") => ({ id, date, category: "ARBEIT", name, status: "open", prio: "hoch", art: "mech" });

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1) Anlegen / Ändern / Löschen ---- */
  {
    drive["kalender-daten.json"] = leer();
    const u = await makeUser(browser, "2026-07-20T08:00:00", "R. Ciraci");
    await adopt(u);

    await setzeEntries(u, [A("w1", "Hallenbeleuchtung")]);
    await u.waitForTimeout(350);
    const nachAnlegen = verlauf();
    check("(1) Anlegen wird festgehalten",
      nachAnlegen.some((v) => v.was.startsWith("angelegt") && v.was.includes("Hallenbeleuchtung")));
    check("(1) Mit Namen des Bearbeiters", nachAnlegen.every((v) => v.wer === "R. Ciraci"));
    check("(1) Mit Zeitstempel", nachAnlegen.every((v) => typeof v.ts === "string" && v.ts.length >= 20));

    await u.clock.setFixedTime(new Date("2026-07-20T08:05:00"));
    await setzeEntries(u, [{ ...A("w1", "Hallenbeleuchtung"), status: "done" }]);
    await u.waitForTimeout(350);
    check("(1) Ändern wird festgehalten",
      verlauf().some((v) => v.was.startsWith("geändert") && v.was.includes("Hallenbeleuchtung")));

    await u.clock.setFixedTime(new Date("2026-07-20T08:10:00"));
    await setzeEntries(u, []);
    await u.waitForTimeout(350);
    check("(1) Löschen wird festgehalten - der wichtigste Fall",
      verlauf().some((v) => v.was.startsWith("gelöscht") && v.was.includes("Hallenbeleuchtung")));

    await u.close();
  }

  /* ---- (2) Zwei Bearbeiter gleichzeitig ---- */
  {
    drive["kalender-daten.json"] = leer();
    const u1 = await makeUser(browser, "2026-07-21T09:00:00", "R. Ciraci");
    const u2 = await makeUser(browser, "2026-07-21T09:00:01", "M. Weber");
    await adopt(u1); await adopt(u2);

    await setzeEntries(u1, [A("a1", "Arbeit-A")]);
    await setzeEntries(u2, [A("b1", "Arbeit-B")]);
    await u1.evaluate(() => window.__wkSharedTest.poll());
    await u2.evaluate(() => window.__wkSharedTest.poll());
    await u1.waitForTimeout(400);

    const v = verlauf();
    check("(2) Zeile von Bearbeiter 1 vorhanden", v.some((x) => x.wer === "R. Ciraci" && x.was.includes("Arbeit-A")));
    check("(2) Zeile von Bearbeiter 2 EBENFALLS vorhanden (nichts überschrieben)",
      v.some((x) => x.wer === "M. Weber" && x.was.includes("Arbeit-B")));
    check("(2) Alle Verlaufszeilen haben eindeutige Kennungen",
      new Set(v.map((x) => x.id)).size === v.length);

    await u1.close(); await u2.close();
  }

  /* ---- (3) Verlauf sickert nicht in die Terminliste ---- */
  {
    drive["kalender-daten.json"] = leer();
    const u = await makeUser(browser, "2026-07-22T10:00:00", "R. Ciraci");
    await adopt(u);
    await setzeEntries(u, [A("x1", "Sichtbare Arbeit")]);
    await u.waitForTimeout(400);

    const lokal = await lokaleEntries(u);
    check("(3) Keine log|-Einträge in der Terminliste", lokal.every((e) => !String(e.id).startsWith("log|")));
    check("(3) Fachlicher Eintrag ist da", lokal.some((e) => e.id === "x1"));
    check("(3) In der Datei liegt der Verlauf aber sehr wohl", verlauf().length > 0);

    // Folgefehler-Probe: Weiterspeichern darf keine Löschmarken auf den Verlauf setzen
    await u.clock.setFixedTime(new Date("2026-07-22T10:05:00"));
    await setzeEntries(u, [A("x1", "Sichtbare Arbeit"), A("x2", "Zweite Arbeit")]);
    await u.waitForTimeout(400);
    check("(3) Keine Löschmarken auf Verlaufszeilen",
      Object.keys(datei().deleted || {}).every((id) => !String(id).startsWith("log|")));
    check("(3) Frühere Verlaufszeilen noch da", verlauf().some((v) => v.was.includes("Sichtbare Arbeit")));

    await u.close();
  }

  /* ---- (4) Ein Vorgang, eine Zeile - auch bei Wiederholversuchen ---- */
  {
    drive["kalender-daten.json"] = leer();
    const u = await makeUser(browser, "2026-07-23T11:00:00", "R. Ciraci");
    await adopt(u);
    await setzeEntries(u, [A("d1", "Einmalige Arbeit")]);
    await u.waitForTimeout(400);
    // Selbstheilung läuft ~1,2 s nach dem Speichern nochmal an - bis dahin warten
    await u.waitForTimeout(1600);
    const treffer = verlauf().filter((v) => v.was.includes("Einmalige Arbeit"));
    check("(4) Ein Vorgang erzeugt genau eine Verlaufszeile", treffer.length === 1);
    await u.close();
  }

  /* ---- (5) Grundeinstellungen ---- */
  {
    drive["kalender-daten.json"] = leer();
    const u = await makeUser(browser, "2026-07-24T12:00:00", "R. Ciraci");
    await adopt(u);
    const basis = { tpmAnlagen: [{ id: "a1", name: "BTS", role: "monday1" }], riItems: [], team: [], extraSchichten: [], anlagenteile: [] };
    await setzeConfig(u, basis);
    await u.waitForTimeout(350);
    await u.clock.setFixedTime(new Date("2026-07-24T12:05:00"));
    await setzeConfig(u, { ...basis, team: [{ name: "Neue Person", rolle: "mech" }] });
    await u.waitForTimeout(400);

    check("(5) Änderung an den Einstellungen wird festgehalten",
      verlauf().some((v) => v.was.includes("Einstellungen geändert") && v.was.includes("Team")));
    check("(5) Unbeteiligte Bereiche werden nicht mitgemeldet",
      verlauf().filter((v) => v.was.includes("Einstellungen geändert")).every((v) => !v.was.includes("Anlagen,")));

    await u.close();
  }

  /* ---- (6) Alte Zeilen fallen heraus ---- */
  {
    const alt = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString();
    drive["kalender-daten.json"] = JSON.stringify({
      format: "werkstatt-kalender-v1", savedAt: null, deleted: {}, config: null,
      entries: [
        { id: "log|" + alt + "-aaaaaa", date: alt.slice(0, 10), ts: alt, wer: "Alt", was: "angelegt: Uralt", updatedAt: alt },
        A("k1", "Aktuelle Arbeit"),
      ],
    });
    const u = await makeUser(browser, new Date().toISOString(), "R. Ciraci");
    await adopt(u);
    await setzeEntries(u, [A("k1", "Aktuelle Arbeit"), A("k2", "Noch eine")]);
    await u.waitForTimeout(500);
    check("(6) Verlaufszeile älter als 90 Tage wurde entfernt",
      !verlauf().some((v) => v.was.includes("Uralt")));
    check("(6) Fachliche Einträge bleiben unabhängig davon erhalten",
      (datei().entries || []).some((e) => e.id === "k1"));
    await u.close();
  }

  /* ---- (7) Der Urheber steht am Eintrag selbst ----
     Die Verlaufszeilen altern nach 90 Tagen heraus und werden ab vier
     Änderungen zu einer Sammelzeile ("geändert: 7 Einträge") zusammengefasst.
     Danach ist nicht mehr zu sehen, wer einen einzelnen Bericht angefasst hat.
     Deshalb trägt jeder Eintrag seinen letzten Urheber selbst. */
  {
    drive["kalender-daten.json"] = leer();
    const u = await makeUser(browser, "2026-07-25T08:00:00", "R. Ciraci");
    await adopt(u);
    await setzeEntries(u, [A("u1", "Pumpe tauschen")]);
    await u.waitForTimeout(400);
    const nachAnlegen = (datei().entries || []).find((e) => e.id === "u1");
    check("(7) Angelegter Eintrag trägt den Urheber",
      !!nachAnlegen && nachAnlegen.geaendertVon === "R. Ciraci");

    // Ein zweiter Bearbeiter ändert denselben Eintrag - der Urheber wandert mit.
    const u2 = await makeUser(browser, "2026-07-25T08:05:00", "M. Weber");
    await adopt(u2);
    await u2.evaluate(() => window.__wkSharedTest.poll());
    await u2.waitForTimeout(400);
    await setzeEntries(u2, [{ ...A("u1", "Pumpe tauschen"), status: "done" }]);
    await u2.waitForTimeout(400);
    const nachAendern = (datei().entries || []).find((e) => e.id === "u1");
    check("(7) Nach der Änderung steht der neue Urheber am Eintrag",
      !!nachAendern && nachAendern.geaendertVon === "M. Weber");
    check("(7) Der Urheber steht auch in der Datei, nicht nur im Speicher des Geräts",
      JSON.stringify(datei()).includes('"geaendertVon":"M. Weber"'));
    await u.close(); await u2.close();
  }

  /* ---- (8) Fremde Einträge bleiben unberührt ----
     Der gefährliche Fall: Wenn beim Speichern ALLE Einträge einen neuen
     Zeitstempel bekämen, würde der zuletzt Speichernde beim Zusammenführen
     immer gewinnen - auch für Einträge, die er nie angefasst hat. Damit wären
     die Änderungen der anderen still verdrängt. */
  {
    drive["kalender-daten.json"] = leer();
    const u1 = await makeUser(browser, "2026-07-26T08:00:00", "R. Ciraci");
    await adopt(u1);
    await setzeEntries(u1, [A("f1", "Von Roberto")]);
    await u1.waitForTimeout(400);
    const vorher = (datei().entries || []).find((e) => e.id === "f1");

    const u2 = await makeUser(browser, "2026-07-26T09:00:00", "M. Weber");
    await adopt(u2);
    await u2.evaluate(() => window.__wkSharedTest.poll());
    await u2.waitForTimeout(400);
    // Weber legt etwas EIGENES an und rührt den fremden Eintrag nicht an.
    await setzeEntries(u2, [A("f1", "Von Roberto"), A("f2", "Von Weber")]);
    await u2.waitForTimeout(400);
    const nachher = (datei().entries || []).find((e) => e.id === "f1");
    check("(8) Der fremde Eintrag behält seinen Urheber",
      !!nachher && nachher.geaendertVon === "R. Ciraci");
    check("(8) Der fremde Eintrag behält seinen Zeitstempel",
      !!nachher && !!vorher && nachher.updatedAt === vorher.updatedAt);
    check("(8) Der eigene neue Eintrag trägt den eigenen Urheber",
      ((datei().entries || []).find((e) => e.id === "f2") || {}).geaendertVon === "M. Weber");
    // Und der Verlauf meldet keine Änderung, die es nie gab.
    check("(8) Keine erfundene Änderungsmeldung im Verlauf",
      !verlauf().some((v) => v.wer === "M. Weber" && v.was.includes("Von Roberto")));
    await u1.close(); await u2.close();
  }

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
