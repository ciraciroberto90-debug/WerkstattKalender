// Härtetest: PROGRAMM-STAND DER BENUTZER (Robertos Ansage vom 28.09.: "der
// Verwalter muss in den Einstellungen sehen, welche Benutzer auf unserem
// letzten Stand sind - also alle, die auf Aktualisieren geklickt haben")
//
//  (P1) Der Verwalter meldet beim Start seine Fassung: in der Konfiguration
//       steht programmStand.Chef mit der Bau-Zeit dieser Fassung und der
//       festen Uhr als "gesehen"; ein fremder Eintrag (Bea, alte Fassung)
//       bleibt dabei erhalten.
//  (P2) ⚙ Benutzer & Rechte zeigt die Tabelle "Programm-Stand der Benutzer":
//       Chef ✓ aktuell, Bea ⚠ veraltet, Lea noch nicht gemeldet; "1 von 3".
//  (P3) Neustart: kein zweiter Eintrag, der Stand bleibt (einmal je Fassung
//       und höchstens alle 12 Stunden).
//  (P4) Leser (Nur-Lesen) melden nichts - programmStand.Lea bleibt leer.
//  (P5) Bearbeiter Bea startet mit der neuen Fassung: ihr Eintrag springt auf
//       die Bau-Zeit, der Verwalter sieht danach "3 von 3" minus Lea = 2 von 3.
//  (P6) Gemeinsame Datei: config|programmStand als eigener Eintrag, die anderen
//       Felder behalten ihren Zeitstempel, keine Verlaufszeile; ein zweiter
//       Rechner trägt sich ein, ohne den ersten zu verdrängen.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor schreibt niemand programmStand (P1 rot)
// und das Zahnrad kennt die Tabelle nicht (P2 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const APP_PFAD = process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const APP = "file://" + APP_PFAD;

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
// Die Bau-Zeit steht als Zeichenkette in der gebauten HTML (vite: __BUILD_ZEIT__).
const bauZeit = (() => {
  const m = fs.readFileSync(APP_PFAD, "utf8").match(/Version vom|"(20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)"/g) || [];
  const iso = m.map((x) => x.replace(/"/g, "")).filter((x) => /^20\d\d-/.test(x));
  return iso.length ? iso.sort().slice(-1)[0] : "";
})();
const ALT = "2026-01-01T00:00:00.000Z";
const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Bea", rolle: "bearbeiter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }],
  programmStand: { Bea: { fassung: ALT, gesehen: "2026-09-20T06:00:00.000Z" } },
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (benutzer, konfig) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date("2026-09-28T08:00:00"));
    await p.addInitScript(({ c, benutzer }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      if (localStorage.getItem("harte94-gesaet")) return; // reload() darf den Stand nicht zurücksetzen
      localStorage.setItem("harte94-gesaet", "1");
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", c);
      localStorage.setItem("werkstatt-kalender-entries", "[]");
      localStorage.setItem("werkstatt-stoerungen-entries", "[]");
      localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
    }, { c: konfig, benutzer });
    await p.goto(APP);
    await p.waitForTimeout(1800);
    return { p, ctx, fehler, zu: () => ctx.close() };
  };
  const stand = (p) => p.evaluate(() => (JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}").programmStand || null));
  // Der örtliche Spiegel trägt die Benutzerliste nicht - für den nächsten Rechner anhängen.
  const konfigFuerNaechsten = async (p) => JSON.stringify({ ...JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-config")) || "{}"), benutzer: config.benutzer });
  const zahnradBenutzer = async (p) => {
    await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Benutzer & Rechte", exact: true }).click(); await p.waitForTimeout(400);
  };
  const zeile = async (p, name) => (await p.locator(`[data-programmstand-zeile="${name}"]`).innerText()).replace(/\s+/g, " ");

  ok("(Vorab) Die Bau-Zeit der Fassung ist aus der HTML lesbar", /^20\d\d-\d\d-\d\dT/.test(bauZeit), bauZeit);

  /* ---------- (P1)–(P3) Verwalter ---------- */
  let konfigNachChef = null;
  {
    const { p, fehler, zu } = await seite("Chef", JSON.stringify(config));
    const s = await stand(p);
    ok("(P1) Der Verwalter meldet beim Start seine Fassung (programmStand.Chef = Bau-Zeit, gesehen = feste Uhr)",
      !!s && !!s.Chef && s.Chef.fassung === bauZeit && s.Chef.gesehen === "2026-09-28T06:00:00.000Z", JSON.stringify(s && s.Chef));
    ok("(P1) Der fremde Eintrag (Bea, alte Fassung) bleibt erhalten", !!s && !!s.Bea && s.Bea.fassung === ALT);
    await zahnradBenutzer(p);
    const tab = p.locator("[data-programmstand]");
    ok("(P2) ⚙ Benutzer & Rechte zeigt die Tabelle „Programm-Stand der Benutzer“", (await tab.count()) === 1 && /Programm-Stand der Benutzer/i.test(await tab.innerText()));
    const zChef = await zeile(p, "Chef"), zBea = await zeile(p, "Bea"), zLea = await zeile(p, "Lea");
    ok("(P2) Chef ✓ aktuell · Bea ⚠ veraltet (Fassung vom 01.01.2026) · Lea noch nicht gemeldet",
      /✓ aktuell/.test(zChef) && /⚠ veraltet/.test(zBea) && /01\.01\.2026/.test(zBea) && /noch nicht gemeldet/.test(zLea), `${zChef} | ${zBea} | ${zLea}`);
    ok("(P2) Zusammenfassung „1 von 3 aktuell“", /1 von 3 aktuell/.test(await tab.innerText()));
    await p.locator('button[aria-label="Schließen"]').last().click().catch(() => p.keyboard.press("Escape")); await p.waitForTimeout(300);
    await p.reload(); await p.waitForTimeout(1800);
    const s2 = await stand(p);
    ok("(P3) Nach dem Neustart bleibt der Stand (kein zweiter, kein anderer Eintrag)",
      !!s2 && !!s2.Chef && s2.Chef.fassung === bauZeit && s2.Chef.gesehen === "2026-09-28T06:00:00.000Z" && Object.keys(s2).sort().join(",") === "Bea,Chef", JSON.stringify(s2));
    ok("(E) Keine Skriptfehler (Verwalter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    konfigNachChef = await konfigFuerNaechsten(p);
    await zu();
  }
  /* ---------- (P4) Leser ---------- */
  {
    const { p, fehler, zu } = await seite("Lea", konfigNachChef);
    const s = await stand(p);
    ok("(P4) Leser (Nur-Lesen) meldet nichts - programmStand.Lea bleibt leer", !!s && !s.Lea && !!s.Chef, JSON.stringify(Object.keys(s || {})));
    ok("(E) Keine Skriptfehler (Leser)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  /* ---------- (P5) Bearbeiter ---------- */
  {
    const bea = await seite("Bea", konfigNachChef);
    const s = await stand(bea.p);
    ok("(P5) Bearbeiter Bea startet mit der neuen Fassung: ihr Eintrag springt auf die Bau-Zeit",
      !!s && !!s.Bea && s.Bea.fassung === bauZeit && s.Bea.gesehen === "2026-09-28T06:00:00.000Z", JSON.stringify(s && s.Bea));
    const konfigNachBea = await konfigFuerNaechsten(bea.p);
    await bea.zu();
    const chef = await seite("Chef", konfigNachBea);
    await zahnradBenutzer(chef.p);
    ok("(P5) Der Verwalter sieht danach Bea ✓ aktuell und „2 von 3 aktuell“",
      /✓ aktuell/.test(await zeile(chef.p, "Bea")) && /2 von 3 aktuell/.test(await chef.p.locator("[data-programmstand]").innerText()));
    ok("(E) Keine Skriptfehler (Verwalter 2)", chef.fehler.length === 0, chef.fehler.slice(0, 2).join(" | "));
    await chef.zu();
  }

  /* ---------- (P6) Gemeinsame Datei: eigener Eintrag, keine Verlaufszeile, nichts anderes angefasst ---------- */
  {
    // Die Datei lebt in Node - zwei "Rechner" (Chef, Bea) teilen sich denselben Stand.
    const jetztIso = new Date().toISOString();
    let dateiInhalt = JSON.stringify({
      format: "werkstatt-kalender-v1", savedAt: jetztIso, deleted: {},
      entries: [
        { id: "config|tpmAnlagen", date: "", value: [{ id: "a1", name: "TS480", role: "takt" }], updatedAt: jetztIso },
        { id: "config|benutzer", date: "", value: config.benutzer, updatedAt: jetztIso },
        { id: "config|programmStand", date: "", value: { Bea: { fassung: ALT, gesehen: "2026-09-20T06:00:00.000Z" } }, updatedAt: jetztIso },
      ],
      config: { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], benutzer: config.benutzer, programmStand: { Bea: { fassung: ALT, gesehen: "2026-09-20T06:00:00.000Z" } } },
    });
    const rechner = async (benutzer) => {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const p = await ctx.newPage();
      const fehler = [];
      p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
      await p.clock.setFixedTime(new Date("2026-09-28T08:00:00"));
      await p.exposeFunction("__leseDatei", () => dateiInhalt);
      await p.exposeFunction("__schreibeDatei", (t) => { dateiInhalt = t; });
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
      await p.addInitScript((name) => { try { localStorage.setItem("bta-standort", "scheurich"); localStorage.setItem("werkstatt-kalender-benutzer", name); localStorage.setItem("werkstatt-kalender-name", name); } catch (e) {} }, benutzer);
      await p.goto(APP);
      await p.waitForTimeout(500);
      await p.locator('button[aria-label="Gemeinsame Datei"]').click();
      await p.getByText("Vorhandene Datei öffnen …").click();
      await p.waitForTimeout(1800);
      await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
      await p.waitForTimeout(1200);
      return { p, fehler, zu: () => ctx.close() };
    };
    const datei = () => JSON.parse(dateiInhalt);
    const eintrag = (id) => (datei().entries || []).find((e) => e.id === id);
    const chef = await rechner("Chef");
    const ps = eintrag("config|programmStand");
    ok("(P6) In der gemeinsamen Datei steht der Eintrag config|programmStand mit Chef (Bau-Zeit) UND dem alten Bea-Eintrag",
      !!ps && ps.value && ps.value.Chef && ps.value.Chef.fassung === bauZeit && ps.value.Bea && ps.value.Bea.fassung === ALT, JSON.stringify(ps && ps.value));
    ok("(P6) Die anderen Einstellungen sind unangetastet (Anlagen und Benutzer behalten ihren Zeitstempel)",
      eintrag("config|tpmAnlagen") && eintrag("config|tpmAnlagen").updatedAt === jetztIso && eintrag("config|benutzer") && eintrag("config|benutzer").updatedAt === jetztIso);
    ok("(P6) Keine Verlaufszeile für die Meldung (kein „Einstellungen geändert: programmStand“)",
      !(datei().entries || []).some((e) => String(e.id).startsWith("log|") && /programmStand/.test(String(e.was || ""))), (datei().entries || []).filter((e) => String(e.id).startsWith("log|")).map((e) => e.was).join(" | "));
    ok("(E) Keine Skriptfehler (Datei, Chef)", chef.fehler.length === 0, chef.fehler.slice(0, 2).join(" | "));
    await chef.zu();
    const bea = await rechner("Bea");
    const ps2 = eintrag("config|programmStand");
    ok("(P6) Zweiter Rechner (Bea) trägt sich ein, ohne den Chef zu verdrängen",
      !!ps2 && ps2.value.Chef && ps2.value.Chef.fassung === bauZeit && ps2.value.Bea && ps2.value.Bea.fassung === bauZeit, JSON.stringify(ps2 && ps2.value));
    ok("(E) Keine Skriptfehler (Datei, Bea)", bea.fehler.length === 0, bea.fehler.slice(0, 2).join(" | "));
    await bea.zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
