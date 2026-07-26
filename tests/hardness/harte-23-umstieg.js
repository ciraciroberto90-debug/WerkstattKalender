// Härtetest: UMSTIEG von der laufenden auf die neue Fassung.
// Die App ist seit zwei Wochen im Echtbetrieb. Die neue Fassung legt die
// Grundeinstellungen anders ab (Feld für Feld statt als Block) und schreibt
// zusätzlich einen Verlauf. Vor dem Ausrollen muss feststehen:
//  (1) Die neue Fassung liest eine Datei der alten Fassung vollständig.
//  (2) Sie übernimmt die Einstellungen in die neue Form, ohne sie zu verlieren.
//  (3) Während der Umstellung laufen beide Fassungen gleichzeitig - dabei darf
//      NICHTS verlorengehen, in keiner Richtung.
//  (4) Die alte Fassung kommt mit den neuen Verwaltungs-Einträgen klar und
//      zeigt sie nicht als Termine an.
//  (5) Rückweg: Wer zur alten Fassung zurückmuss, verliert seine Termine nicht.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const NEU = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const ALT = "file:///tmp/alt/alt.html";

let ok = 0, fail = 0;
const check = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };
const drive = {};

// So sieht die Datei nach zwei Wochen Betrieb mit der alten Fassung aus:
// Einstellungen als ein Block, Termine als Einträge, keine Verwaltungs-Einträge.
const ALT_DATEI = () => JSON.stringify({
  format: "werkstatt-kalender-v1",
  savedAt: "2026-07-20T08:00:00.000Z",
  deleted: {},
  config: {
    tpmAnlagen: [{ id: "bts", name: "BTS", role: "monday1" }, { id: "hro", name: "HRO", role: "takt" }],
    riItems: [{ id: "regal", name: "Regalkontrolle", type: "yearly", month: 8, day: 15 }],
    team: [{ name: "R. Ciraci", rolle: "mech" }, { name: "M. Weber", rolle: "elek" }, { name: "T. Klein", rolle: "mech" }],
    extraSchichten: [{ name: "Lehrgang", farbe: "grau" }],
    anlagenteile: [{ anlage: "BTS", name: "Ventilblock" }],
  },
  entries: [
    { id: "echt1", date: "2026-07-14", category: "ARBEIT", name: "Kompressor prüfen", status: "open", prio: "hoch", art: "mech", updatedAt: "2026-07-14T09:00:00.000Z" },
    { id: "echt2", date: "2026-07-16", category: "TPM", name: "BTS", status: "done", updatedAt: "2026-07-16T11:00:00.000Z" },
    { id: "schicht-t|R. Ciraci|2026-07-20", category: "SCHICHT", scope: "tag", name: "R. Ciraci", date: "2026-07-20", wert: "Früh", updatedAt: "2026-07-20T06:00:00.000Z" },
  ],
});

async function mach(browser, app, uhr, name) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.setFixedTime(new Date(uhr));
  await page.exposeFunction("__lies", (n) => drive[n] ?? "");
  await page.exposeFunction("__schreib", (n, c) => { drive[n] = c; });
  await page.addInitScript((wer) => {
    if (wer) localStorage.setItem("werkstatt-kalender-name", wer);
    window.__mk = (nm) => ({
      name: nm, kind: "file",
      async getFile() { const t = await window.__lies(nm); return new File([t], nm, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib(nm, b); } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
  }, name || "");
  await page.goto(app);
  await page.waitForTimeout(1200);
  return page;
}
const adopt = (p) => p.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
const lokal = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
const lokalCfg = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "null"));
const datei = () => JSON.parse(drive["kalender-daten.json"] || "{}");
const fachlich = () => (datei().entries || []).filter((e) => !/^(log|config)\|/.test(String(e.id)));
const setze = (p, arr) => p.evaluate(async (a) => await window.storage.set("werkstatt-kalender-entries", JSON.stringify(a)), arr);

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1)(2) Neue Fassung öffnet die Datei aus dem Echtbetrieb ---- */
  {
    drive["kalender-daten.json"] = ALT_DATEI();
    const p = await mach(browser, NEU, "2026-07-27T08:00:00", "R. Ciraci");
    await adopt(p);
    await p.waitForTimeout(900);

    const e = await lokal(p);
    check("(1) Alle Termine aus dem Echtbetrieb sind da",
      e.some((x) => x.id === "echt1") && e.some((x) => x.id === "echt2") && e.some((x) => String(x.id).startsWith("schicht-t|")));

    const cfg = await lokalCfg(p);
    check("(1) Anlagen übernommen", !!cfg && Array.isArray(cfg.tpmAnlagen) && cfg.tpmAnlagen.length === 2);
    check("(1) R+I-Punkte übernommen", !!cfg && Array.isArray(cfg.riItems) && cfg.riItems.some((r) => r.name === "Regalkontrolle"));
    check("(1) Team übernommen (3 Personen)", !!cfg && Array.isArray(cfg.team) && cfg.team.length === 3);
    check("(1) Eigene Schichtarten übernommen", !!cfg && Array.isArray(cfg.extraSchichten) && cfg.extraSchichten.some((s) => s.name === "Lehrgang"));
    check("(1) Anlagenteile übernommen", !!cfg && Array.isArray(cfg.anlagenteile) && cfg.anlagenteile.some((t) => t.name === "Ventilblock"));

    const sichtbar = await p.locator("body").innerText();
    check("(1) Das Team steht auch in der Oberfläche", /R\. Ciraci/.test(sichtbar));

    // Jetzt etwas ändern -> die Einstellungen müssen in die neue Form wandern,
    // ohne dass der alte Block dabei verlorengeht.
    const bestand = await lokal(p);
    bestand.push({ id: "neu1", date: "2026-07-27", category: "ARBEIT", name: "Nach dem Umstieg", status: "open", prio: "hoch" });
    await setze(p, bestand);
    await p.waitForTimeout(900);

    check("(2) Alte Termine nach dem ersten Speichern noch in der Datei",
      fachlich().some((x) => x.id === "echt1") && fachlich().some((x) => x.id === "echt2"));
    check("(2) Der neue Termin ist dazugekommen", fachlich().some((x) => x.id === "neu1"));
    const d = datei();
    const altBlockDa = d.config && Array.isArray(d.config.team) && d.config.team.length === 3;
    check("(2) Der alte Einstellungs-Block bleibt als Rückfallebene erhalten", altBlockDa);
    await p.close();
  }

  /* ---- (3) Beide Fassungen gleichzeitig (der eigentliche Umstellungstag) ---- */
  {
    drive["kalender-daten.json"] = ALT_DATEI();
    const alt = await mach(browser, ALT, "2026-07-27T09:00:00", "M. Weber");
    const neu = await mach(browser, NEU, "2026-07-27T09:02:00", "R. Ciraci");
    await adopt(alt);
    await adopt(neu);
    await alt.waitForTimeout(500);
    await neu.waitForTimeout(500);

    // Der Kollege auf der ALTEN Fassung meldet eine Arbeit
    const aBestand = await lokal(alt);
    aBestand.push({ id: "vonAlt", date: "2026-07-27", category: "ARBEIT", name: "Von alter Fassung", status: "open", prio: "hoch" });
    await setze(alt, aBestand);
    await alt.waitForTimeout(800);

    // Du auf der NEUEN Fassung meldest eine andere
    const nBestand = await lokal(neu);
    nBestand.push({ id: "vonNeu", date: "2026-07-27", category: "ARBEIT", name: "Von neuer Fassung", status: "open", prio: "hoch" });
    await setze(neu, nBestand);
    await neu.waitForTimeout(800);

    // Beide gleichen ab
    for (let i = 0; i < 8; i++) {
      await alt.evaluate(() => window.__wkSharedTest.poll());
      await neu.evaluate(() => window.__wkSharedTest.poll());
      await alt.waitForTimeout(300);
    }

    const inDatei = fachlich().map((x) => x.id);
    check("(3) Eintrag der ALTEN Fassung liegt in der Datei", inDatei.includes("vonAlt"));
    check("(3) Eintrag der NEUEN Fassung liegt in der Datei", inDatei.includes("vonNeu"));
    check("(3) Die zwei Wochen Bestand sind unangetastet",
      inDatei.includes("echt1") && inDatei.includes("echt2"));

    const altSicht = (await lokal(alt)).map((x) => x.id);
    const neuSicht = (await lokal(neu)).map((x) => x.id);
    check("(3) Die alte Fassung sieht die Arbeit der neuen", altSicht.includes("vonNeu"));
    check("(3) Die neue Fassung sieht die Arbeit der alten", neuSicht.includes("vonAlt"));

    /* ---- (4) Die alte Fassung darf an den Verwaltungs-Einträgen nicht ersticken ---- */
    // Sie kennt die Präfixe nicht und trägt die Verwaltungs-Einträge deshalb in
    // ihrem Bestand mit. Das ist hinnehmbar, solange sie dadurch weder etwas
    // Falsches anzeigt noch etwas zerstört - genau das wird hier geprüft.
    const altText = await alt.locator("body").innerText();
    check("(4) Die alte Fassung zeigt nichts von der Verwaltung an",
      !/config\||log\|/.test(altText) && !/angelegt: |geändert: |gelöscht: /.test(altText));
    check("(4) Keine Fehlermeldung in der alten Fassung", !/Etwas ist schiefgelaufen/.test(altText));
    check("(4) Sie zerstört die Verwaltungs-Einträge auch nicht",
      (datei().entries || []).some((e) => String(e.id).startsWith("config|")));
    check("(4) Und setzt keine Löschmarken darauf",
      Object.keys(datei().deleted || {}).every((id) => !/^(log|config)\|/.test(id)));

    // Das Team muss auf BEIDEN Seiten vollständig bleiben
    const cfgAlt = await lokalCfg(alt);
    const cfgNeu = await lokalCfg(neu);
    check("(4) Team in der alten Fassung vollständig", !!cfgAlt && cfgAlt.team && cfgAlt.team.length === 3);
    check("(4) Team in der neuen Fassung vollständig", !!cfgNeu && cfgNeu.team && cfgNeu.team.length === 3);

    await alt.close(); await neu.close();
  }

  /* ---- (5) Rückweg: zurück auf die alte Fassung ---- */
  {
    const p = await mach(browser, ALT, "2026-07-27T12:00:00", "R. Ciraci");
    await adopt(p);
    await p.waitForTimeout(900);
    const e = (await lokal(p)).map((x) => x.id);
    check("(5) Nach Rückkehr zur alten Fassung sind alle Termine da",
      e.includes("echt1") && e.includes("echt2") && e.includes("vonAlt") && e.includes("vonNeu"));
    const rueckText = await p.locator("body").innerText();
    check("(5) Auch beim Rückweg zeigt die alte Fassung nichts von der Verwaltung",
      !/config\||log\|/.test(rueckText) && !/angelegt: |geändert: |gelöscht: /.test(rueckText));
    const cfg = await lokalCfg(p);
    check("(5) Und die Einstellungen sind noch vollständig",
      !!cfg && cfg.team && cfg.team.length === 3 && cfg.tpmAnlagen && cfg.tpmAnlagen.length === 2);
    await p.close();
  }

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
