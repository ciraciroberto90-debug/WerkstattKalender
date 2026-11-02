// Härtetest: UMSCHALTTAG IM HINTERGRUND (Roll-out 81, Etappe R0; Roberto 30.10.:
// "können die Mitarbeiter ihre Programmversionen auf dem Desktop liegen lassen und
// die Umstellung passiert im Hintergrund?")
//
// Die App in der Programm-Fassung liest beim Start aus dem Update-Ordner die Datei
// umschalten-auf-server.json. Steht dort ein Server, der antwortet, merkt sie sich
// die Adresse (Browser-Speicher + Hülle über merke), zeigt den Vollbild-Hinweis
// und lädt neu. Hier mit Brücken-Attrappe und einem kleinen Test-Server:
//  (U1) Keine Umschalt-Datei: nichts passiert (Normalfall bis zum Umschalttag).
//  (U2) Datei zeigt auf den Test-Server: Hinweis mit Adresse erscheint, Browser-
//       Speicher bta-server:url gesetzt, merke("programm:server-url") gerufen,
//       Schlüssel aus der Datei übernommen, nach dem Neuladen läuft die App am Server.
//  (U3) "ab" liegt in der Zukunft: kein Hinweis, nichts gemerkt.
//  (U4) Server antwortet nicht (toter Port): kein Hinweis, nichts gemerkt.
//  (U5) Rückweg "server": "aus" bei gemerktem Server: Hinweis "zurück", Speicher
//       und Hülle bereinigt.
//  (U6) Browser-Fassung (keine Brücke): die Datei wird gar nicht gelesen.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor (ohne pruefeUmschaltDatei) bleibt der Hinweis
// aus und nichts wird gemerkt - U2 rot (gemessen mit APP_PFAD gegen den Stand 16b4635).
const UMG = require("../umgebung"); // Repo-Ort, App-Datei, Browser (Roll-out 73)
const { chromium } = require("playwright-core");
const http = require("http");
const APP = UMG.APP;

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const ORDNER = "//SCHEUDC1/PSG_Gruppe/Technik/Werkstatt_Kalender";
const UMSCHALT = ORDNER + "/umschalten-auf-server.json";
const BENUTZER = [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }];

/* Test-Server: antwortet auf /api/status, sonst 404 - mehr braucht der Umschalt-Check nicht. */
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-BTA-Schluessel");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.url.startsWith("/api/status")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ dienst: "test", fassung: "test", standorte: {} })); }
  res.writeHead(404, { "Content-Type": "application/json" }); res.end("{}");
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const PORT = server.address().port;
  const SERVER = "http://127.0.0.1:" + PORT;
  const TOT = "http://127.0.0.1:1"; // niemand hört dort
  const browser = await chromium.launch({ executablePath: UMG.CHROMIUM, headless: true, args: ["--no-sandbox"] });

  async function seite({ umschaltDatei, mitBruecke = true, serverGemerkt = "" }) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    const gemerkt = {}; const merkungen = [];
    await p.exposeFunction("__d_merke", (k, w) => { merkungen.push([k, w]); if (w === null || w === undefined) delete gemerkt[k]; else gemerkt[k] = String(w); return true; });
    await p.exposeFunction("__d_gemerkt", (k) => (k in gemerkt ? gemerkt[k] : null));
    await p.exposeFunction("__d_lese", (pfad) => (pfad === UMSCHALT && umschaltDatei ? { text: JSON.stringify(umschaltDatei), geaendert: Date.now(), groesse: 10 } : null));
    gemerkt["programm:update-ordner"] = ORDNER;
    await p.addInitScript(({ c, mitBruecke, serverGemerkt }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", "[]");
      localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
      localStorage.setItem("werkstatt-kalender-name", "Chef");
      if (serverGemerkt) localStorage.setItem("bta-server:url", serverGemerkt);
      if (!mitBruecke) return;
      window.__werkstattDesktop = {
        waehleDatei: async () => null, waehleDateiNeu: async () => null, waehleOrdner: async () => null,
        lese: async (pfad) => { const r = await window.__d_lese(pfad); return r ? { bytes: new TextEncoder().encode(r.text), geaendert: r.geaendert, groesse: r.groesse } : null; },
        stat: async () => null, schreibe: async () => true, liste: async () => [], entferne: async () => true,
        merke: (k, w) => window.__d_merke(k, w === undefined ? null : w),
        gemerkt: (k) => window.__d_gemerkt(k),
        oeffnePfad: async () => true, pfadInfo: async () => null, aufUpdate: () => {},
        updateOrdnerSetzen: async () => true, updateStatus: async () => ({ ordner: "", stand: "" }), updatePruefen: async () => true, updateUebernehmen: async () => ({ ok: true }),
      };
    }, { c: { tpmAnlagen: [], riItems: [], team: [], benutzer: BENUTZER }, mitBruecke, serverGemerkt });
    await p.goto(APP);
    await p.waitForTimeout(1500);
    return { p, ctx, fehler, gemerkt, merkungen, hinweis: p.locator("[data-umschaltung]") };
  }
  const ls = (p, k) => p.evaluate((k) => localStorage.getItem(k), k);

  /* (U1) */
  {
    const s = await seite({ umschaltDatei: null });
    ok("(U1) Ohne Umschalt-Datei: kein Hinweis, nichts gemerkt, kein Server im Browser-Speicher", (await s.hinweis.count()) === 0 && !s.merkungen.length && !(await ls(s.p, "bta-server:url")));
    ok("(E) Keine Skriptfehler (U1)", s.fehler.length === 0, s.fehler.join(" | "));
    await s.ctx.close();
  }
  /* (U2) */
  {
    const s = await seite({ umschaltDatei: { server: SERVER, schluessel: "geheim-123" } });
    const da = (await s.hinweis.count()) === 1;
    ok("(U2) Umschalt-Datei mit erreichbarem Server: der Vollbild-Hinweis erscheint und nennt die Adresse", da && (await s.hinweis.getAttribute("data-umschaltung")) === SERVER && /auf den BTA-Server umgestellt/.test(await s.hinweis.innerText()), da ? (await s.hinweis.innerText()).slice(0, 80) : "kein Hinweis");
    ok("(U2) Browser-Speicher: bta-server:url = Test-Server, Schlüssel übernommen", (await ls(s.p, "bta-server:url")) === SERVER && (await ls(s.p, "bta-server:schluessel")) === "geheim-123", (await ls(s.p, "bta-server:url")) + " / " + (await ls(s.p, "bta-server:schluessel")));
    ok("(U2) Hülle: merke(programm:server-url) und merke(bta-server:schluessel) gerufen", s.gemerkt["programm:server-url"] === SERVER && s.gemerkt["bta-server:schluessel"] === "geheim-123", JSON.stringify(s.merkungen));
    // Neuladen passiert von selbst nach 4 s - danach läuft die App am Server (Adresse aus dem Speicher).
    await s.p.waitForTimeout(4500);
    const amServer = await s.p.evaluate(() => { try { return localStorage.getItem("bta-server:url"); } catch (e) { return null; } });
    ok("(U2) Nach dem Neuladen: Hinweis weg, Server-Adresse bleibt gemerkt (die App startet am Server)", (await s.hinweis.count()) === 0 && amServer === SERVER, "gemerkt: " + amServer);
    ok("(E) Keine Skriptfehler (U2)", s.fehler.length === 0, s.fehler.join(" | "));
    await s.ctx.close();
  }
  /* (U3) */
  {
    const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const s = await seite({ umschaltDatei: { server: SERVER, ab: morgen } });
    ok("(U3) 'ab' morgen: kein Hinweis, nichts gemerkt", (await s.hinweis.count()) === 0 && !s.merkungen.length && !(await ls(s.p, "bta-server:url")), "ab " + morgen);
    await s.ctx.close();
  }
  /* (U4) */
  {
    const s = await seite({ umschaltDatei: { server: TOT } });
    await s.p.waitForTimeout(6000); // Frist des Erreichbarkeits-Checks abwarten
    ok("(U4) Server antwortet nicht: kein Hinweis, nichts gemerkt (kein Rechner auf einem toten Weg)", (await s.hinweis.count()) === 0 && !s.merkungen.length && !(await ls(s.p, "bta-server:url")));
    ok("(E) Keine Skriptfehler (U4)", s.fehler.length === 0, s.fehler.join(" | "));
    await s.ctx.close();
  }
  /* (U5) */
  {
    const s = await seite({ umschaltDatei: { server: "aus" }, serverGemerkt: SERVER });
    const da = (await s.hinweis.count()) === 1;
    ok("(U5) Rückweg 'aus' bei gemerktem Server: Hinweis 'wieder über die gemeinsame Datei'", da && (await s.hinweis.getAttribute("data-umschaltung")) === "aus" && /wieder über die gemeinsame Datei/.test(await s.hinweis.innerText()), da ? "" : "kein Hinweis");
    ok("(U5) Browser-Speicher geleert, Hülle: merke(programm:server-url, null)", !(await ls(s.p, "bta-server:url")) && s.merkungen.some(([k, w]) => k === "programm:server-url" && w === null), JSON.stringify(s.merkungen));
    await s.ctx.close();
  }
  /* (U6) */
  {
    const s = await seite({ umschaltDatei: { server: SERVER }, mitBruecke: false });
    ok("(U6) Browser-Fassung ohne Brücke: kein Hinweis, Datei nie gelesen", (await s.hinweis.count()) === 0 && !(await ls(s.p, "bta-server:url")));
    await s.ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); server.close(); process.exit(1); });
