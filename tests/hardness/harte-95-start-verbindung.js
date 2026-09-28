// Härtetest: START-VERBINDUNG OHNE RÜCKSCHREIBEN + LINKS NUR MIT ZUTEILUNG
// (Robertos Befund vom 28.09.: "das Verbinden der gemeinsamen Datei dauert
// auf einigen Rechnern lange, Bearbeiter sind dann im Lesemodus - Cockpit
// öffnen direkt verbunden, schnell und zuverlässig"; "Bearbeiter hat meinen
// Hyperlink, obwohl keiner zugeteilt ist")
//
//  (V1) Bearbeiter verbindet die unveränderte Datei: KEIN Schreibvorgang
//       (bisher wurde die Datei bei jedem Verbinden komplett neu geschrieben),
//       trotzdem voller Schreibzugriff (To-do erteilen möglich).
//  (V2) Liegt örtlich ein Eintrag, der in der Datei fehlt, wird GENAU einmal
//       geschrieben und der Eintrag steht danach in der Datei.
//  (V3) Datei einer älteren Fassung (ohne Bau-Stand): einmal schreiben, damit
//       der Veraltet-Wächter der Kollegen den Stand kennt - danach nicht mehr.
//  (V4) ⚙ Verlauf & Sicherung zeigt die Zeitmessung "Verbindung beim Start"
//       mit Lesen, Abgleich und "nichts zu schreiben".
//  (V5) Ein Einstellungs-Speichern (Link) lässt Standort-Kennung und
//       Schreibmarke im Dateikopf stehen (fehlten bisher nach saveConfig).
//  (L1) Bearbeiter ohne zugeteilte Sammlung sieht den Linkstreifen NICHT
//       (keine fremde Sammlung RC); der Verwalter sieht ihn mit Umschalter;
//       ein Bearbeiter MIT Zuteilung sieht nur seine Sammlung.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor zählt V1 einen Schreibvorgang, und L1
// zeigt dem Bearbeiter die RC-Links.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const APP_PFAD = process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const APP = "file://" + APP_PFAD;

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const bauZeit = (() => {
  const m = fs.readFileSync(APP_PFAD, "utf8").match(/"(20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)"/g) || [];
  const iso = m.map((x) => x.replace(/"/g, ""));
  return iso.length ? iso.sort().slice(-1)[0] : "";
})();
const jetztIso = new Date().toISOString();
const BENUTZER = [
  { name: "Chef", rolle: "verwalter", kennwortHash: "" },
  { name: "Bea", rolle: "bearbeiter", kennwortHash: "", links: "" },
  { name: "Ben", rolle: "bearbeiter", kennwortHash: "", links: "AR" },
  { name: "Lea", rolle: "leser", kennwortHash: "" },
];
const LINKS = { inhaber: ["RC", "AR"], eintraege: [
  { id: "l1", inhaber: "RC", name: "Robertos Liste", ziel: "intranet.firma.de/rc", symbol: "🔗" },
  { id: "l2", inhaber: "AR", name: "Bens Unterlage", ziel: "intranet.firma.de/ar", symbol: "🔗" },
] };
const STAND = Object.fromEntries(BENUTZER.map((b) => [b.name, { fassung: bauZeit, gesehen: jetztIso }]));
const dateiNeu = (mitBauStand = true) => JSON.stringify({
  format: "werkstatt-kalender-v1", standort: "scheurich", schreibMarke: "seed-1", savedAt: jetztIso, deleted: {},
  entries: [
    { id: "t1", category: "TPM", name: "TS480", date: "2026-09-30", status: "open", updatedAt: jetztIso },
    { id: "config|tpmAnlagen", date: "", value: [{ id: "a1", name: "TS480", role: "takt" }], updatedAt: jetztIso },
    { id: "config|team", date: "", value: [{ name: "T. Balles", rolle: "mech" }], updatedAt: jetztIso },
    { id: "config|benutzer", date: "", value: BENUTZER, updatedAt: jetztIso },
    { id: "config|links", date: "", value: LINKS, updatedAt: jetztIso },
    // Programm-Stand aller Benutzer schon aktuell - sonst schriebe die Meldung
    // beim Start (harte-94) einen zweiten, hier nicht gemeinten Vorgang.
    { id: "config|programmStand", date: "", value: STAND, updatedAt: jetztIso },
  ],
  config: { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], team: [{ name: "T. Balles", rolle: "mech" }], benutzer: BENUTZER, links: LINKS, programmStand: STAND },
  ...(mitBauStand ? { bauStand: bauZeit } : {}),
});

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  // Ein "Rechner" = eigener Kontext mit Datei-Attrappe in Node; jeder Schreibvorgang wird gezählt.
  const rechner = async (benutzer, datei, lokaleEintraege) => {
    const zustand = { inhalt: datei, schreib: 0 };
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.exposeFunction("__leseDatei", () => zustand.inhalt);
    await p.exposeFunction("__schreibeDatei", (t) => { zustand.inhalt = t; zustand.schreib++; });
    await p.addInitScript(() => {
      const handle = {
        name: "kalender-daten.json", kind: "file",
        async getFile() { return new File([await window.__leseDatei()], "kalender-daten.json", { type: "application/json" }); },
        async createWritable() { let b = ""; return { async write(t) { b += t; }, async close() { await window.__schreibeDatei(b); } }; },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    await p.addInitScript(({ name, lokal }) => {
      try {
        localStorage.setItem("bta-standort", "scheurich");
        localStorage.setItem("werkstatt-kalender-benutzer", name);
        localStorage.setItem("werkstatt-kalender-name", name);
        if (lokal) localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(lokal));
      } catch (e) {}
    }, { name: benutzer, lokal: lokaleEintraege || null });
    await p.goto(APP);
    await p.waitForTimeout(500);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1500);
    await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(600);
    return { p, ctx, fehler, zustand, zu: () => ctx.close() };
  };
  const datei = (z) => JSON.parse(z.inhalt);

  /* (V1) Bearbeiter, unveränderte Datei */
  {
    const r = await rechner("Bea", dateiNeu(true));
    ok("(V1) Verbinden mit unveränderter Datei schreibt NICHT (0 Schreibvorgänge)", r.zustand.schreib === 0, "Schreibvorgänge: " + r.zustand.schreib);
    await r.p.getByRole("button", { name: /^Berichte/ }).first().click(); await r.p.waitForTimeout(300);
    await r.p.getByRole("button", { name: /^To-do/ }).first().click(); await r.p.waitForTimeout(400);
    ok("(V1) Der Bearbeiter hat trotzdem vollen Schreibzugriff (To-do erteilen da, kein Anmelde-Dialog)",
      (await r.p.getByRole("button", { name: "＋ To-do erteilen" }).count()) === 1 && (await r.p.locator('[aria-label="Anmelden"]').count()) === 0);
    ok("(E) Keine Skriptfehler (V1)", r.fehler.length === 0, r.fehler.slice(0, 2).join(" | "));
    await r.zu();
  }
  /* (V2) örtlicher Eintrag fehlt in der Datei */
  {
    const lokal = [{ id: "t1", category: "TPM", name: "TS480", date: "2026-09-30", status: "open", updatedAt: jetztIso },
      { id: "td-lokal", category: "TODO", name: "Offline erteilt", date: "2026-09-27", wer: "T. Balles", bis: "2026-09-29", prio: "hoch", erteiltVon: "Bea", status: "offen", updatedAt: jetztIso }];
    const r = await rechner("Bea", dateiNeu(true), lokal);
    const d = datei(r.zustand);
    ok("(V2) Mit örtlichem Eintrag: genau EIN Schreibvorgang, der Eintrag steht in der Datei",
      r.zustand.schreib === 1 && (d.entries || []).some((e) => e.id === "td-lokal"), "Schreibvorgänge: " + r.zustand.schreib);
    ok("(V2) Die anderen Einträge behalten ihren Zeitstempel", (d.entries || []).find((e) => e.id === "t1").updatedAt === jetztIso);
    await r.zu();
  }
  /* (V3) Datei ohne Bau-Stand (ältere Fassung) */
  {
    const r = await rechner("Bea", dateiNeu(false));
    const d = datei(r.zustand);
    ok("(V3) Datei ohne Bau-Stand: einmal schreiben, danach steht der Bau-Stand dieser Fassung drin",
      r.zustand.schreib === 1 && d.bauStand === bauZeit, `Schreibvorgänge: ${r.zustand.schreib}, bauStand: ${d.bauStand}`);
    await r.zu();
  }
  /* (V4) Zeitmessung im ⚙ + (L1) Links Verwalter */
  {
    const r = await rechner("Chef", dateiNeu(true));
    ok("(L1) Der Verwalter sieht den Linkstreifen mit Umschalter RC/AR",
      (await r.p.locator('button[aria-label="Links & Dokumente"]').count()) === 1 && /Robertos Liste/.test(await r.p.locator("body").innerText()));
    await r.p.locator('button[aria-label="Verwalten"]').click(); await r.p.waitForTimeout(300);
    await r.p.getByRole("button", { name: /Verlauf/ }).first().click(); await r.p.waitForTimeout(400);
    const z = r.p.locator("[data-startzeiten]");
    const zt = (await z.count()) ? (await z.innerText()).replace(/\s+/g, " ") : "";
    ok("(V4) ⚙ Verlauf & Sicherung zeigt „Verbindung beim Start“ mit Lesen, Abgleich, „nichts zu schreiben“ und Ergebnis connected",
      /Verbindung beim Start/i.test(zt) && /Gemeinsame Datei: gesamt/.test(zt) && /Lesen \d+ ms/.test(zt) && /Abgleich \d+ ms/.test(zt) && /nichts zu schreiben/.test(zt) && /Ergebnis connected/.test(zt), zt.slice(0, 220));
    await r.p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => r.p.keyboard.press("Escape")); await r.p.waitForTimeout(300);
    // (V5) Ein Einstellungs-Speichern (hier: ein Link) darf den Dateikopf nicht
    // beschneiden - Standort-Kennung und Schreibmarke bleiben in der Datei.
    await r.p.getByRole("button", { name: "Links & Dokumente" }).click(); await r.p.waitForTimeout(300);
    await r.p.getByRole("button", { name: "＋ Link" }).click(); await r.p.waitForTimeout(300);
    await r.p.getByPlaceholder(/Bezeichnung/).fill("Prüfplan-Ordner");
    await r.p.getByPlaceholder(/Adresse oder Pfad/).fill("X:\\Werkstatt\\Pruefplaene");
    await r.p.getByRole("button", { name: "Speichern" }).click(); await r.p.waitForTimeout(1600);
    const dn = datei(r.zustand);
    ok("(V5) Nach dem Einstellungs-Speichern trägt die Datei weiter Standort-Kennung und Schreibmarke",
      dn.standort === "scheurich" && typeof dn.schreibMarke === "string" && dn.schreibMarke.length > 0 && JSON.stringify(dn.config.links).includes("Prüfplan-Ordner"), `standort=${dn.standort} marke=${dn.schreibMarke}`);
    ok("(E) Keine Skriptfehler (Verwalter)", r.fehler.length === 0, r.fehler.slice(0, 2).join(" | "));
    await r.zu();
  }
  /* (L1) Bearbeiter ohne / mit Zuteilung, Leser */
  {
    const bea = await rechner("Bea", dateiNeu(true));
    const t = await bea.p.locator("body").innerText();
    ok("(L1) Bearbeiter OHNE zugeteilte Sammlung: kein Linkstreifen, keine RC-Links",
      (await bea.p.locator('button[aria-label="Links & Dokumente"]').count()) === 0 && !/Robertos Liste/.test(t) && !/🔗\s*Links/i.test(t));
    await bea.zu();
    const ben = await rechner("Ben", dateiNeu(true));
    const t2 = await ben.p.locator("body").innerText();
    ok("(L1) Bearbeiter MIT Zuteilung AR: nur seine Sammlung (Bens Unterlage, nicht Robertos Liste)",
      /Bens Unterlage/.test(t2) && !/Robertos Liste/.test(t2) && (await ben.p.locator('button[aria-label="Links von AR (an dein Konto gebunden)"]').count()) === 1);
    await ben.zu();
    const lea = await rechner("Lea", dateiNeu(true));
    const t3 = await lea.p.locator("body").innerText();
    ok("(L1) Leser ohne Zuteilung: keine fremden Links", !/Robertos Liste/.test(t3) && !/Bens Unterlage/.test(t3));
    ok("(E) Keine Skriptfehler (Leser)", lea.fehler.length === 0, lea.fehler.slice(0, 2).join(" | "));
    await lea.zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
