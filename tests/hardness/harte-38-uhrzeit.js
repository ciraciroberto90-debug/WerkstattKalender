// Härtetest: FALSCH GEHENDE UHR.
//
// Beim Zusammenführen entscheidet allein der Zeitstempel `updatedAt`, und der
// kommt von der Uhr des Rechners, der gerade speichert. Geht die Uhr eines
// Arbeitsplatzes nach - falsche Zeitzone, keine Domänen-Synchronisierung,
// leere BIOS-Batterie -, dann tragen SEINE Änderungen dauerhaft ältere
// Zeitstempel als die der anderen. Ergebnis: Sie verlieren jeden Vergleich.
//
// Der Rechner selbst merkt davon nichts: Die Kontroll-Lesung nach dem
// Schreiben prüft, ob in der Datei ein Eintrag mit `updatedAt >= dem eigenen`
// steht - und die fremde, neuere Fassung erfüllt das. Die eigene Änderung
// gilt damit als bestätigt, obwohl sie verworfen wurde.
//
// Gemessen am 05.08.2026 vor der Reparatur: 40 Minuten Versatz genügten, um
// eine Änderung spurlos verschwinden zu lassen - ohne einen einzigen Hinweis.
//
// Die Reparatur setzt an der Wurzel an: Wer eine Fassung vor sich hat und sie
// ändert, bekommt einen Zeitstempel, der GRÖSSER ist als der dieser Fassung -
// egal wie die Uhren stehen. Damit gewinnt die spätere Bearbeitung immer.
// Die falsche Uhr bleibt trotzdem ein Mangel (alle Uhrzeiten, auch im
// Prüfnachweis, sind falsch), deshalb zusätzlich ein bleibender Hinweis.
//
// Geprüft wird:
//   (1) Die Änderung kommt trotz nachgehender Uhr an
//   (2) Der Rechner mit der falschen Uhr wird darauf hingewiesen
//   (3) Bei gleich gehenden Uhren gibt es KEINE Warnung (kein Fehlalarm)
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};
const platte = {};

async function geraet(browser, uhr, name, lokaleEintraege) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date(uhr));
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript(([wer, vorrat]) => {
    localStorage.setItem("werkstatt-kalender-name", wer);
    // Ein Gerät, das schon einen eigenen Bestand mitbringt (lange offline)
    if (vorrat) localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(vorrat));
    window.__mk = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib(name, b); } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
  }, [name, lokaleEintraege || null]);
  await p.goto(APP);
  await p.waitForTimeout(900);
  await p.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
  await p.waitForTimeout(600);
  return p;
}
const setze = (p, liste) => p.evaluate(async (x) => await window.storage.set("werkstatt-kalender-entries", JSON.stringify(x)), liste);
const inDatei = () => (JSON.parse(platte["kalender-daten.json"] || "{}").entries || [])
  .filter((e) => !String(e.id).startsWith("config|") && !String(e.id).startsWith("log|"));
const leer = () => JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: null });
const A = (id, name, status = "open") => ({ id, date: "2026-08-05", category: "ARBEIT", name, status, prio: "hoch", art: "mech" });

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1)(2) Ein Rechner geht 40 Minuten nach ---- */
  {
    Object.keys(platte).forEach((k) => delete platte[k]);
    platte["kalender-daten.json"] = leer();
    // Richtige Uhr: 10:00. Falsche Uhr: 09:20 - vierzig Minuten zurück.
    const richtig = await geraet(b, "2026-08-05T10:00:00", "R. Ciraci");
    const falsch = await geraet(b, "2026-08-05T09:20:00", "M. Weber");

    await setze(richtig, [A("g1", "Pumpe prüfen")]);
    await richtig.waitForTimeout(500);
    await falsch.evaluate(() => window.__wkSharedTest.poll());
    await falsch.waitForTimeout(500);

    // Der Rechner mit der falschen Uhr ändert den Eintrag - SPÄTER in der
    // Wirklichkeit, aber mit einem älteren Zeitstempel.
    await setze(falsch, [A("g1", "Pumpe prüfen - Lager getauscht", "done")]);
    await falsch.waitForTimeout(900);

    const stand = inDatei().find((e) => e.id === "g1") || {};
    pruef("(1) Die Änderung kommt trotz nachgehender Uhr in der Datei an",
      /Lager getauscht/.test(String(stand.name || "")), "in der Datei: " + String(stand.name || "—"));
    // Und sie trägt einen Stempel, der über dem der Fassung liegt, auf der sie
    // beruht - sonst würde sie beim nächsten Abgleich wieder verdrängt.
    pruef("(1) Ihr Zeitstempel liegt über dem der Vorgänger-Fassung",
      String(stand.updatedAt || "") > "2026-08-05T10:00:00.000Z", String(stand.updatedAt || "—"));

    const text = await falsch.locator("body").innerText();
    pruef("(2) Der Rechner mit der falschen Uhr wird darauf hingewiesen",
      /Uhr|Uhrzeit|geht nach|Zeit/i.test(text),
      text.split("\n").filter((z) => /Uhr|Zeit/i.test(z)).slice(0, 1).join(" ") || "kein Hinweis gefunden");

    await richtig.context().close(); await falsch.context().close();
  }

  /* ---- (3) Gleich gehende Uhren: kein Fehlalarm ---- */
  {
    Object.keys(platte).forEach((k) => delete platte[k]);
    platte["kalender-daten.json"] = leer();
    const a = await geraet(b, "2026-08-05T10:00:00", "R. Ciraci");
    const c = await geraet(b, "2026-08-05T10:00:05", "M. Weber");
    await setze(a, [A("h1", "Filter wechseln")]);
    await a.waitForTimeout(500);
    await c.evaluate(() => window.__wkSharedTest.poll());
    await c.waitForTimeout(500);
    await setze(c, [A("h1", "Filter wechseln - erledigt", "done")]);
    await c.waitForTimeout(900);

    const stand = inDatei().find((e) => e.id === "h1") || {};
    pruef("(3) Bei gleicher Uhr kommt die Änderung an",
      /erledigt/.test(String(stand.name || "")), String(stand.name || "—"));
    const text = await c.locator("body").innerText();
    pruef("(3) Und es wird NICHT vor der Uhr gewarnt", !/geht nach/i.test(text));
    await a.context().close(); await c.context().close();
  }

  /* ---- (4) Eine Uhr, die weit VORGEHT, darf die Lösch-Merkliste nicht leeren ----
     Die Merkliste steht in der gemeinsamen Datei: Wer sie kürzt, kürzt sie für
     alle. Mit "jetzt minus 180 Tage" hätte ein Rechner mit falschem Jahr
     (leere Knopfzelle) sie komplett geleert - und das nächste Gerät, das lange
     offline war, hätte längst Gelöschtes wieder mitgebracht. */
  {
    Object.keys(platte).forEach((k) => delete platte[k]);
    platte["kalender-daten.json"] = JSON.stringify({
      format: "werkstatt-kalender-v1", savedAt: "2026-08-05T08:00:00.000Z",
      entries: [], config: null,
      // Vor gut 100 Tagen gelöscht - die Marke muss noch lange gelten (180 Tage)
      deleted: { "weg-1": "2026-04-27T09:00:00.000Z" },
    });

    // Der Rechner mit dem falschen Jahr speichert ganz normal etwas.
    const schnell = await geraet(b, "2027-08-05T10:00:00", "M. Weber");
    await setze(schnell, [A("neu-1", "Ventil tauschen")]);
    await schnell.waitForTimeout(900);

    const merkliste = JSON.parse(platte["kalender-daten.json"] || "{}").deleted || {};
    pruef("(4) Die Lösch-Merkliste überlebt einen Rechner mit falschem Jahr",
      !!merkliste["weg-1"], "Marken in der Datei: " + JSON.stringify(merkliste));

    // Und die Probe aufs Exempel: Ein lange abgemeldetes Gerät bringt den
    // gelöschten Eintrag noch mit - er darf nicht zurückkommen.
    const spaet = await geraet(b, "2026-08-05T10:05:00", "A. Radke",
      [{ ...A("weg-1", "Alter Auftrag"), updatedAt: "2026-04-01T07:00:00.000Z" }]);
    await spaet.waitForTimeout(900);
    pruef("(4) Der längst gelöschte Eintrag kommt nicht zurück",
      !inDatei().some((e) => e.id === "weg-1"),
      "in der Datei: " + inDatei().map((e) => e.id).join(", "));

    await schnell.context().close(); await spaet.context().close();
  }

  console.log(`\n==== UHRZEIT: ${ok} PASS / ${fail} FAIL ====`);
  await b.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
