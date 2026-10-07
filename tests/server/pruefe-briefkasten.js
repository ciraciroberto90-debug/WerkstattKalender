// Prüfstand: BRIEFKASTEN IM INTERNET (Roll-out 65, Robertos Favorit 06.10.)
//
//  (K) Der Kern ohne Netz: Einwurf nur mit Einwurf-Schlüssel, Liste/Abholen/
//      Löschen nur mit Abhol-Schlüssel, Begleitdatei im Kopf, Größengrenze,
//      Haltefrist 7 Tage, CORS für den Zettel im Browser.
//  (W) Derselbe Kern als Cloudflare-Worker (worker.js) mit nachgebautem KV:
//      Lege/Liste/Hole/Lösche - die Datei ist auf dem Stand von kern.js.
//  (N) Das Node-Programm (briefkasten.js) über echtes HTTP.
//  (E) ENDE ZU ENDE: Zettel im Handy-Browser (Playwright) wirft in den
//      laufenden Briefkasten ein -> der BTA-Dienst 0.5.0 holt im Takt ab:
//      Foto im fotos-Ordner (Bytes gleich), Aufnahme AUFNAHME mit Begleit-
//      angaben und Kennung aus der Briefkasten-Kennung, Briefkasten leer,
//      Live-Meldung an den PC. Zweimal abholen = einmal anlegen.
//  (O) OHNE NETZ: Briefkasten weg -> der Zettel legt die Aufnahme in seine
//      IndexedDB-Warteschlange, zeigt „wartet", überlebt das Neuladen der
//      Seite, und schickt sie nach, sobald der Briefkasten wieder da ist.
//  (F) FEHLER am Server: Foto nicht schreibbar -> nichts gelöscht im
//      Briefkasten, kein Eintrag, Status nennt den Fehler; nach Reparatur
//      holt der nächste Takt ab.
//  (H) HANDY ÜBER MOBILE DATEN (07.10., Robertos Android): Der Briefkasten
//      liefert den Zettel selbst unter /zettel aus (Kern 0.2.0, Worker mit
//      eingebettetem Zettel, Node von der Platte). Der so geöffnete Zettel
//      erkennt seinen Briefkasten (eigene Herkunft), übernimmt einen
//      Einrichtungs-Link (#kuerzel=…&schluessel=…) und entfernt ihn aus der
//      Adresszeile; ein Einwurf von dieser Herkunft landet beim Dienst.
//  (A) AUTOMATISCH EINSORTIEREN (Roll-out 66, Robertos Freigabe 07.10.):
//      Der Dienst 0.6.0 sortiert beim Abholen nach den Werkstatt-Regeln:
//      To-do (bekannte Anlage + Notiz) -> To-do mit Foto, Akte (bekannte
//      Anlage) -> Akte, Zettel (Notiz) -> Pinnwand; unbekannte Anlage, ohne
//      Notiz, Störung bleiben offen; Schalter aus -> bleibt offen; nochmal
//      abholen legt nichts doppelt an; der PC nimmt es im Tagesfilm zurück.
// Rot-Nachweis: Dienst 0.5.0 (git show 84be479:server/dienst.js) sortiert
// nichts - (A) rot; Dienst 0.4.0 (git show 2feefe6:server/dienst.js) kennt keinen
// Briefkasten - (E) rot; der Zettel vor 06.10. abends kennt kein Einwerfen.
// Kern 0.1.0 (git show 5ee5b47:briefkasten/kern.js) kennt /zettel nicht -
// (H)-Kern/Worker/Node rot; der Zettel vor 07.10. nachmittags kennt weder
// Einrichtungs-Link noch Erkennung - (H)-Browserfälle rot.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { behandle, speicherAblage, MAX_BYTES, HALTEN_MS } = require("../../briefkasten/kern.js");
const briefkasten = require("../../briefkasten/briefkasten.js");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const WURZEL = path.resolve(__dirname, "..", "..");
const APP = "file://" + (process.env.APP_PFAD || path.join(WURZEL, "Werkstatt_Kalender_TPM.html"));
const ZETTEL = "file://" + path.join(WURZEL, "handy", "aufnahme-zettel.html");
const DIENST_JS = process.env.DIENST_PFAD || path.join(WURZEL, "server", "dienst.js");
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const EINWURF = "einwurf-pruef-schluessel-123", ABHOL = "abhol-pruef-schluessel-456";
const anf = (methode, pfad, kopf = {}, bytes = new Uint8Array(0)) => ({ methode, pfad, kopf: (n) => kopf[n.toLowerCase()], bytes: async () => bytes });
const begleitKopf = (o) => encodeURIComponent(JSON.stringify(o));

(async () => {
  /* ================= (K) Kern ================= */
  {
    const ab = speicherAblage(); const S = { einwurf: EINWURF, abhol: ABHOL };
    const r0 = await behandle(anf("GET", "/status"), ab, S);
    ok("(K) /status ohne Schlüssel: Lebenszeichen ohne Anzahl", r0.status === 200 && r0.json.dienst === "bta-briefkasten" && r0.json.anzahl === undefined);
    const falsch = await behandle(anf("POST", "/einwurf", { "x-bta-schluessel": "falsch" }, new Uint8Array([1])), ab, S);
    ok("(K) Einwurf mit falschem Schlüssel: 401, nichts abgelegt", falsch.status === 401 && ab._groesse() === 0);
    const bild = new Uint8Array(5000); for (let i = 0; i < bild.length; i++) bild[i] = i % 251;
    const e1 = await behandle(anf("POST", "/einwurf", { "x-bta-schluessel": EINWURF, "x-bta-begleit": begleitKopf({ zeit: "2026-10-06T07:42:13+02:00", wer: "RC", anlage: "TS480", ziel: "ARBEIT", notiz: "Leck Hydraulik" }) }, bild), ab, S);
    ok("(K) Einwurf mit Einwurf-Schlüssel: 200, Kennung (Zeit+Zufall, nur Kleinbuchstaben/Ziffern), Bytes gezählt", e1.status === 200 && /^[a-z0-9]{12,}$/.test(e1.json.id) && e1.json.bytes === 5000, JSON.stringify(e1.json));
    const nurText = await behandle(anf("POST", "/einwurf", { "x-bta-schluessel": EINWURF, "x-bta-begleit": begleitKopf({ notiz: "nur Text" }) }), ab, S);
    ok("(K) Einwurf ohne Bild, nur Begleitdatei: erlaubt", nurText.status === 200 && nurText.json.bytes === 0);
    const leer = await behandle(anf("POST", "/einwurf", { "x-bta-schluessel": EINWURF }), ab, S);
    ok("(K) Einwurf ohne Bild UND ohne Begleitdatei: 400", leer.status === 400);
    const zuGross = await behandle(anf("POST", "/einwurf", { "x-bta-schluessel": EINWURF }, new Uint8Array(MAX_BYTES + 1)), ab, S);
    ok("(K) Bild über der Grenze (3 MB): 413", zuGross.status === 413);
    const kaputt = await behandle(anf("POST", "/einwurf", { "x-bta-schluessel": EINWURF, "x-bta-begleit": "%7Bkein json" }, bild), ab, S);
    ok("(K) Begleitdatei kein JSON: 400", kaputt.status === 400);
    const l401 = await behandle(anf("GET", "/liste", { "x-bta-schluessel": EINWURF }), ab, S);
    ok("(K) Liste mit EINWURF-Schlüssel: 401 - wer nur einwerfen darf, liest nichts", l401.status === 401);
    const l = await behandle(anf("GET", "/liste", { "x-bta-schluessel": ABHOL }), ab, S);
    ok("(K) Liste mit Abhol-Schlüssel: 2 Einwürfe, älteste zuerst, mit Begleitdatei und Bytes", l.status === 200 && l.json.eintraege.length === 2 && l.json.eintraege[0].id === e1.json.id && l.json.eintraege[0].begleit.anlage === "TS480" && l.json.eintraege[0].bytes === 5000, JSON.stringify(l.json.eintraege.map((x) => x.id)));
    const h = await behandle(anf("GET", "/abholen/" + e1.json.id, { "x-bta-schluessel": ABHOL }), ab, S);
    ok("(K) Abholen: dieselben Bytes, Begleitdatei und Einwurfzeit im Kopf, CORS offengelegt", h.status === 200 && h.bytes.length === 5000 && h.bytes.every((b, i) => b === i % 251) && JSON.parse(decodeURIComponent(h.kopf["X-BTA-Begleit"])).notiz === "Leck Hydraulik" && /^2026-/.test(h.kopf["X-BTA-Eingeworfen"]) && /X-BTA-Begleit/.test(h.kopf["Access-Control-Expose-Headers"]));
    const d = await behandle(anf("DELETE", "/abholen/" + e1.json.id, { "x-bta-schluessel": ABHOL }), ab, S);
    const nachD = await behandle(anf("GET", "/abholen/" + e1.json.id, { "x-bta-schluessel": ABHOL }), ab, S);
    ok("(K) Löschen: weg (404 danach), 1 bleibt", d.status === 200 && d.json.geloescht && nachD.status === 404 && ab._groesse() === 1);
    const alt = await behandle(anf("GET", "/liste", { "x-bta-schluessel": ABHOL }), ab, S, Date.now() + HALTEN_MS + 60000);
    ok("(K) Nach sieben Tagen räumt die Liste Liegengebliebenes selbst weg", alt.status === 200 && alt.json.eintraege.length === 0 && ab._groesse() === 0);
    const opt = await behandle(anf("OPTIONS", "/einwurf"), ab, S);
    ok("(K) OPTIONS (Browser-Vorabfrage): 204 mit erlaubten Köpfen X-BTA-Schluessel/X-BTA-Begleit", opt.status === 204 && /X-BTA-Begleit/.test(opt.kopf["Access-Control-Allow-Headers"]));
    const ohne = await behandle(anf("GET", "/status"), ab, { einwurf: "", abhol: "" });
    ok("(K) Ohne eingerichtete Schlüssel: 500 mit klarem Text", ohne.status === 500 && /nicht eingerichtet/.test(ohne.json.fehler));
    const zOhne = await behandle(anf("GET", "/zettel"), ab, S);
    const zMit = await behandle(anf("GET", "/zettel"), ab, S, Date.now(), "<!doctype html><title>Aufnahme-Zettel</title>");
    const wurzel = await behandle(anf("GET", "/"), ab, { einwurf: "", abhol: "" }, Date.now(), "<!doctype html><title>Aufnahme-Zettel</title>");
    ok("(H) Kern: /zettel ohne hinterlegten Zettel 404; mit Zettel 200 als text/html, kein Schlüssel nötig; / liefert ihn auch - noch vor der Schlüssel-Prüfung", zOhne.status === 404 && zMit.status === 200 && /^text\/html/.test(zMit.kopf["Content-Type"]) && /Aufnahme-Zettel/.test(zMit.text) && wurzel.status === 200 && /no-cache/.test(wurzel.kopf["Cache-Control"]));
  }

  /* ================= (W) Worker mit nachgebautem KV ================= */
  {
    const quelle = fs.readFileSync(path.join(WURZEL, "briefkasten", "worker.js"), "utf8");
    ok("(W) worker.js ist auf dem Stand von kern.js", require("child_process").spawnSync(process.execPath, [path.join(WURZEL, "briefkasten", "worker-bauen.js"), "--pruefen"]).status === 0);
    // ES-Modul-Export in eine Funktion verwandeln, damit Node es ohne Datei-Import ausführt
    const code = quelle.replace(/export default\s*\{/, "module.exports = {");
    const m = { exports: {} };
    new Function("module", "exports", "require", code)(m, m.exports, require);
    const kv = new Map();
    const KV = {
      async put(k, v, o) { kv.set(k, { v: typeof v === "string" ? v : new Uint8Array(v), ttl: o && o.expirationTtl }); },
      async get(k, o) { const e = kv.get(k); if (!e) return null; if (o && o.type === "arrayBuffer") { const u = e.v instanceof Uint8Array ? e.v : new TextEncoder().encode(e.v); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); } return typeof e.v === "string" ? e.v : new TextDecoder().decode(e.v); },
      async delete(k) { kv.delete(k); },
      async list(o) { return { keys: [...kv.keys()].filter((k) => k.startsWith(o.prefix || "")).map((name) => ({ name })), list_complete: true }; },
    };
    const env = { ABLAGE: KV, EINWURF_SCHLUESSEL: EINWURF, ABHOL_SCHLUESSEL: ABHOL };
    const req = (methode, pfad, kopf = {}, body = null) => new Request("https://bk.test" + pfad, { method: methode, headers: kopf, body });
    const bild = new Uint8Array(3000).map((_, i) => (i * 7) % 256);
    const e = await m.exports.fetch(req("POST", "/einwurf", { "X-BTA-Schluessel": EINWURF, "X-BTA-Begleit": begleitKopf({ anlage: "B2", notiz: "Worker" }) }, bild), env);
    const ej = await e.json();
    const l = await (await m.exports.fetch(req("GET", "/liste", { "X-BTA-Schluessel": ABHOL }), env)).json();
    const h = await m.exports.fetch(req("GET", "/abholen/" + ej.id, { "X-BTA-Schluessel": ABHOL }), env);
    const hb = new Uint8Array(await h.arrayBuffer());
    const d = await (await m.exports.fetch(req("DELETE", "/abholen/" + ej.id, { "X-BTA-Schluessel": ABHOL }), env)).json();
    ok("(W) Worker: Einwurf -> KV (Bytes + Meta mit 7-Tage-Frist) -> Liste -> Abholen (gleiche Bytes) -> Löschen", e.status === 200 && kv.size === 0 && l.eintraege.length === 1 && l.eintraege[0].begleit.anlage === "B2" && hb.length === 3000 && hb.every((b, i) => b === (i * 7) % 256) && d.geloescht, `kv danach ${kv.size}`);
    const ttl = (() => { const kv2 = new Map(); return kv2; })();
    void ttl;
    const ohneAblage = await m.exports.fetch(req("GET", "/status"), { EINWURF_SCHLUESSEL: EINWURF, ABHOL_SCHLUESSEL: ABHOL });
    ok("(W) Ohne gebundenen KV-Namensraum: 500 mit Hinweis ABLAGE", ohneAblage.status === 500 && /ABLAGE/.test((await ohneAblage.json()).fehler));
    const zettelDatei = fs.readFileSync(path.join(WURZEL, "handy", "aufnahme-zettel.html"), "utf8");
    const wz = await m.exports.fetch(req("GET", "/zettel"), env);
    const wzText = await wz.text();
    const wWurzel = await m.exports.fetch(req("GET", "/"), env);
    ok("(H) Worker: /zettel liefert den eingebetteten Aufnahme-Zettel - Zeichen für Zeichen handy/aufnahme-zettel.html, als text/html; / ebenso", wz.status === 200 && /^text\/html/.test(wz.headers.get("Content-Type")) && wzText === zettelDatei && wWurzel.status === 200 && (await wWurzel.text()) === zettelDatei, `${wzText.length} Zeichen`);
  }

  /* ================= (N) Node-Programm über HTTP ================= */
  const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), "bta-briefkasten-"));
  const PORT_BK = 20900 + Math.floor(Math.random() * 500);
  let bk = await briefkasten.starten({ port: PORT_BK, host: "127.0.0.1", ordner: path.join(ORDNER, "ablage"), einwurfSchluessel: EINWURF, abholSchluessel: ABHOL });
  const BK = `http://127.0.0.1:${PORT_BK}`;
  {
    const s = await (await fetch(BK + "/status", { headers: { "X-BTA-Schluessel": ABHOL } })).json();
    ok("(N) Node-Briefkasten läuft, /status mit Abhol-Schlüssel nennt die Anzahl 0", s.dienst === "bta-briefkasten" && s.anzahl === 0);
    const r = await fetch(BK + "/einwurf", { method: "POST", headers: { "X-BTA-Schluessel": EINWURF, "X-BTA-Begleit": begleitKopf({ notiz: "http" }) }, body: new Uint8Array([9, 8, 7]) });
    const j = await r.json();
    const dateien = fs.readdirSync(path.join(ORDNER, "ablage"));
    ok("(N) Einwurf über HTTP landet als <id>.bin + <id>.json im Ordner", r.status === 200 && dateien.includes(j.id + ".bin") && dateien.includes(j.id + ".json"), dateien.join(", "));
    await fetch(BK + "/abholen/" + j.id, { method: "DELETE", headers: { "X-BTA-Schluessel": ABHOL } });
    ok("(N) Löschen räumt beide Dateien", fs.readdirSync(path.join(ORDNER, "ablage")).length === 0);
    const nz = await fetch(BK + "/zettel");
    const nzText = await nz.text();
    ok("(H) Node: /zettel liefert handy/aufnahme-zettel.html von der Platte (text/html, Titel Aufnahme-Zettel)", nz.status === 200 && /^text\/html/.test(nz.headers.get("content-type")) && /<title>Aufnahme-Zettel<\/title>/.test(nzText) && nzText === fs.readFileSync(briefkasten.ZETTEL_PFAD, "utf8"));
  }

  /* ================= (E) Ende zu Ende: Zettel -> Briefkasten -> Dienst -> PC ================= */
  const PORT_D = 21500 + Math.floor(Math.random() * 500);
  const D = `http://127.0.0.1:${PORT_D}`;
  const SCHLUESSEL = "pruef-schluessel";
  const datenOrdner = path.join(ORDNER, "scheurich");
  fs.mkdirSync(datenOrdner, { recursive: true });
  fs.writeFileSync(path.join(ORDNER, "einstellungen.json"), JSON.stringify({ port: PORT_D, host: "127.0.0.1", appDatei: path.join(WURZEL, "Werkstatt_Kalender_TPM.html"), protokollOrdner: path.join(ORDNER, "protokoll"), sicherungOrdner: path.join(ORDNER, "sicherung"), schluessel: SCHLUESSEL, standorte: { scheurich: { name: "Scheurich", datenOrdner } } }));
  // Briefkasten-Zugang in der EIGENEN Datei neben den Einstellungen (so bleibt sie beim Werkzeug-Einrichten stehen)
  fs.writeFileSync(path.join(ORDNER, "briefkasten.json"), JSON.stringify({ adresse: BK, schluessel: ABHOL, standort: "scheurich", taktSek: 5 }));
  let dienst = null;
  const dienstStarten = async () => {
    dienst = spawn(process.execPath, ["--no-warnings", DIENST_JS, path.join(ORDNER, "einstellungen.json")], { stdio: "ignore" });
    for (let i = 0; i < 60; i++) { await warte(100); try { if ((await fetch(D + "/api/status")).ok) return true; } catch (e) { /* noch nicht */ } }
    return false;
  };
  const dienstStoppen = async () => {
    if (!dienst) return;
    dienst.kill("SIGTERM");
    await new Promise((r) => { dienst.once("exit", r); setTimeout(r, 2000); });
    dienst = null;
    for (let i = 0; i < 30; i++) { try { await fetch(D + "/api/status"); await warte(100); } catch (e) { return; } }
  };
  if (!(await dienstStarten())) { console.log("FAIL | Dienst kam nicht hoch"); process.exit(1); }
  const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [], benutzer: [{ name: "Chef", rolle: "verwalter" }] };
  await fetch(D + "/api/scheurich/import?bereich=kalender", { method: "POST", headers: { "Content-Type": "application/json", "X-BTA-Schluessel": SCHLUESSEL }, body: JSON.stringify({ format: "werkstatt-kalender-v1", standort: "scheurich", savedAt: "2026-10-06T05:00:00.000Z", entries: [{ id: "e1", date: "2026-10-06", category: "TODO", name: "Aufgabe", status: "open", updatedAt: "2026-10-06T05:00:00.000Z" }], deleted: {}, config }) });
  const status0 = await (await fetch(D + "/api/status")).json();
  ok("(E) Dienst 0.6.0 liest briefkasten.json: Briefkasten aktiv, Adresse, Standort scheurich", status0.fassung === "0.6.0" && status0.briefkasten && status0.briefkasten.aktiv && status0.briefkasten.adresse === BK && status0.briefkasten.standort === "scheurich", JSON.stringify(status0.briefkasten));
  await warte(2000);
  const status1 = await (await fetch(D + "/api/status")).json();
  ok("(E) Erster Takt: Briefkasten erreichbar, 0 im Briefkasten, kein Fehler", status1.briefkasten.erreichbar === true && status1.briefkasten.imBriefkasten === 0 && !status1.briefkasten.letzterFehler, JSON.stringify(status1.briefkasten));

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const fehler = [];
  const handy = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const hp = await handy.newPage();
  hp.on("pageerror", (e) => { fehler.push("Z:" + e.message); console.log("PAGEERROR(Zettel):", e.message); });
  await handy.addInitScript(({ bk, s }) => { localStorage.setItem("bta-zettel:kuerzel", "RC"); localStorage.setItem("bta-zettel:anlagen", "TS480\nB2"); localStorage.setItem("bta-zettel:bkAdresse", bk); localStorage.setItem("bta-zettel:bkSchluessel", s); }, { bk: BK, s: EINWURF });
  await hp.goto(ZETTEL);
  await hp.waitForTimeout(400);
  ok("(E) Zettel mit Briefkasten: der Knopf heißt „Einwerfen“, Teilen bleibt als zweiter Weg", /Einwerfen/.test(await hp.locator("#ablegen").innerText()) && !(await hp.locator("#teilen-stattdessen").isHidden()));
  await hp.locator("#knopf-einstellungen").click();
  await hp.locator("#bk-pruefen").click();
  await hp.waitForFunction(() => /erreichbar|Verbindung|antwortet/.test(document.getElementById("bk-pruefung").textContent), null, { timeout: 8000 });
  ok("(E) „Verbindung prüfen“ im Zettel: grün erreichbar", /✓ Briefkasten erreichbar/.test(await hp.locator("#bk-pruefung").innerText()), await hp.locator("#bk-pruefung").innerText());
  await hp.locator("#einstellungen-fertig").click();
  const fotoB64 = await hp.evaluate(() => { const c = document.createElement("canvas"); c.width = 2400; c.height = 1600; const g = c.getContext("2d"); g.fillStyle = "#3A4756"; g.fillRect(0, 0, 2400, 1600); g.fillStyle = "#fff"; g.font = "bold 160px sans-serif"; g.fillText("Briefkasten", 100, 800); for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 9},60%,50%)`; g.fillRect(i * 60, 1200, 50, 50); } return c.toDataURL("image/jpeg", 0.92).split(",")[1]; });
  await hp.locator("#kamera").setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: Buffer.from(fotoB64, "base64") });
  await hp.waitForFunction(() => document.querySelectorAll("#vorschauen img").length === 1, null, { timeout: 8000 });
  await hp.locator('button[data-ziel="ARBEIT"]').click();
  await hp.locator("#notiz").fill("Leck Hydraulik TS480, Pfütze");
  await hp.locator("#anlage").fill("TS480");
  const tE = Date.now();
  await hp.locator("#ablegen").click();
  await hp.waitForFunction(() => /Eingeworfen/.test(document.getElementById("meldung").textContent), null, { timeout: 10000 }).catch(() => {});
  const einwurfMs = Date.now() - tE;
  const meld = await hp.locator("#meldung").innerText();
  const imBk = await (await fetch(BK + "/liste", { headers: { "X-BTA-Schluessel": ABHOL } })).json();
  ok("(E) Einwerfen vom Zettel: Meldung „Eingeworfen“, ein Einwurf mit Begleitdatei im Briefkasten (oder schon abgeholt), Heute-Liste zeigt ✓", /Eingeworfen/.test(meld) && (await hp.locator('[data-heute-status="eingeworfen"]').count()) === 1, `${einwurfMs} ms · im Briefkasten: ${imBk.eintraege.length} · ${meld.slice(0, 60)}`);
  // Der Dienst holt im 5-s-Takt ab
  const tA = Date.now();
  let stand = null;
  for (let i = 0; i < 60; i++) { await warte(500); stand = await (await fetch(D + "/api/scheurich/stand?seit=0")).json(); if (stand.eintraege.some((e) => e.category === "AUFNAHME")) break; }
  const abholMs = Date.now() - tA;
  const aufn = stand.eintraege.find((e) => e.category === "AUFNAHME");
  const fotoDatei = aufn && aufn.fotos && aufn.fotos[0] ? path.join(datenOrdner, "fotos", aufn.fotos[0].datei) : null;
  const fotoBytes = fotoDatei && fs.existsSync(fotoDatei) ? fs.readFileSync(fotoDatei) : null;
  const geteilteBytes = await hp.evaluate(async () => { const f = window.__letzteDateien.find((d) => d.name.endsWith(".jpg")); return f ? Array.from(new Uint8Array(await f.arrayBuffer())).length : -1; });
  console.log(`MESSUNG Zettel -> Briefkasten -> Dienst: Einwurf ${einwurfMs} ms, Abholung nach ${abholMs} ms`);
  ok("(E) Der Dienst holt ab: Aufnahme AUFNAHME mit Notiz, Anlage TS480, Kürzel RC, Vorschlag ARBEIT, Zeit aus der Begleitdatei, Quelle Briefkasten, Kennung aufn-bk-…", !!aufn && aufn.note === "Leck Hydraulik TS480, Pfütze" && aufn.name === "TS480" && aufn.wer === "RC" && aufn.zielWunsch === "ARBEIT" && aufn.quelle === "briefkasten" && /^aufn-bk-[a-z0-9]+$/.test(aufn.id) && aufn.status === "open" && Math.abs(new Date(aufn.zeit).getTime() - Date.now()) < 120000, JSON.stringify(aufn && { id: aufn.id, note: aufn.note, name: aufn.name, wer: aufn.wer, zeit: aufn.zeit }));
  ok("(E) Das Foto liegt im fotos-Ordner des Standorts - Byte für Byte das Bild vom Handy (eingedampft, < 400 kB)", !!fotoBytes && fotoBytes.length === geteilteBytes && fotoBytes.length > 5000 && fotoBytes.length < 400000, `${fotoBytes ? fotoBytes.length : "?"} Bytes`);
  const bkLeer = await (await fetch(BK + "/liste", { headers: { "X-BTA-Schluessel": ABHOL } })).json();
  const status2 = await (await fetch(D + "/api/status")).json();
  ok("(E) Danach ist der Briefkasten leer; Status zählt 1 abgeholt, im Briefkasten 0", bkLeer.eintraege.length === 0 && status2.briefkasten.abgeholtGesamt === 1 && status2.briefkasten.imBriefkasten === 0, JSON.stringify(status2.briefkasten));
  const fotoUeberDienst = await fetch(D + "/api/scheurich/fotos/" + encodeURIComponent(aufn.fotos[0].datei));
  ok("(E) Das Foto ist über den Dienst abrufbar (für PC und Handy-Ansicht)", fotoUeberDienst.status === 200 && (await fotoUeberDienst.arrayBuffer()).byteLength === fotoBytes.length);
  // Zweimal abholen = einmal anlegen: denselben Einwurf nochmal einwerfen lassen, aber der Dienst kennt die Kennung
  const doppel = await fetch(BK + "/einwurf", { method: "POST", headers: { "X-BTA-Schluessel": EINWURF, "X-BTA-Begleit": begleitKopf({ notiz: "zweiter Einwurf" }) }, body: new Uint8Array([1, 2, 3, 4]) });
  const doppelId = (await doppel.json()).id;
  // Vorab denselben Eintrag anlegen, wie ihn ein anderer Takt schon geschrieben hätte
  await fetch(D + "/api/scheurich/aenderungen", { method: "POST", headers: { "Content-Type": "application/json", "X-BTA-Schluessel": SCHLUESSEL }, body: JSON.stringify({ benutzer: "Test", basisVersion: status2.standorte.scheurich.version, eintraege: [{ id: "aufn-bk-" + doppelId, date: "2026-10-06", category: "AUFNAHME", name: "", status: "open", note: "schon da", fotos: [], updatedAt: new Date().toISOString() }] }) });
  await fetch(D + "/api/scheurich/briefkasten", { method: "POST", headers: { "X-BTA-Schluessel": SCHLUESSEL } });
  const stand3 = await (await fetch(D + "/api/scheurich/stand?seit=0")).json();
  const dop = stand3.eintraege.filter((e) => e.id === "aufn-bk-" + doppelId);
  const bkNach = await (await fetch(BK + "/liste", { headers: { "X-BTA-Schluessel": ABHOL } })).json();
  ok("(E) Kennung schon vorhanden: nichts doppelt angelegt (Eintrag bleibt „schon da“), der Einwurf wird trotzdem aus dem Briefkasten geräumt", dop.length === 1 && dop[0].note === "schon da" && bkNach.eintraege.length === 0 && fs.readdirSync(path.join(datenOrdner, "fotos")).length === 1);
  /* ================= (A) Automatisch einsortieren (Roll-out 66) ================= */
  const einwurf = async (begleit, bytes = new Uint8Array([7, 7, 7, 7, 7, 7])) => { const r = await fetch(BK + "/einwurf", { method: "POST", headers: { "X-BTA-Schluessel": EINWURF, "X-BTA-Begleit": begleitKopf(begleit) }, body: bytes }); return String((await r.json()).id).replace(/[^A-Za-z0-9]/g, ""); };
  const abholen = () => fetch(D + "/api/scheurich/briefkasten", { method: "POST", headers: { "X-BTA-Schluessel": SCHLUESSEL } }).then((r) => r.json());
  const standAlle = async () => (await (await fetch(D + "/api/scheurich/stand?seit=0")).json()).eintraege;
  const regelSetzen = async (auto) => { const v = (await (await fetch(D + "/api/status")).json()).standorte.scheurich.version; await fetch(D + "/api/scheurich/aenderungen", { method: "POST", headers: { "Content-Type": "application/json", "X-BTA-Schluessel": SCHLUESSEL }, body: JSON.stringify({ benutzer: "Test", basisVersion: v, eintraege: [], konfig: { kalender: { regeln: { aufnahme: { auto } } } } }) }); };
  let autoTodoId = null;
  {
    const kTodo = await einwurf({ zeit: new Date().toISOString(), wer: "RC", anlage: "ts480", ziel: "TODO", notiz: "Ölstand prüfen" });
    const kAkte = await einwurf({ wer: "RC", anlage: "TS480", ziel: "AKTE", notiz: "Typenschild" });
    const kZettel = await einwurf({ wer: "RC", ziel: "ZETTEL", notiz: "Ersatzteil kommt Do." });
    const kUnbekannt = await einwurf({ wer: "RC", anlage: "Presse 9", ziel: "TODO", notiz: "x" });
    const kOhneNotiz = await einwurf({ wer: "RC", anlage: "TS480", ziel: "TODO" });
    const kStoer = await einwurf({ wer: "RC", anlage: "TS480", ziel: "STOERUNG", notiz: "Leck" });
    const r = await abholen();
    const alle = await standAlle();
    const auf = (k) => alle.find((e) => e.id === "aufn-bk-" + k) || {};
    const todo = alle.find((e) => e.id === "todo-bk-" + kTodo);
    autoTodoId = "aufn-bk-" + kTodo;
    ok("(A) Ziel To-do + bekannte Anlage (klein geschrieben) + Notiz: offenes To-do mit der Notiz als Titel, demselben Foto, Anlage in der Bemerkung; Aufnahme „automatisch“ → TODO, Anlage TS480", !!todo && todo.category === "TODO" && todo.status === "offen" && todo.name === "Ölstand prüfen" && /TS480/.test(todo.bemerkung) && !!(todo.fotos && todo.fotos[0] && auf(kTodo).fotos && auf(kTodo).fotos[0]) && todo.fotos[0].datei === auf(kTodo).fotos[0].datei && auf(kTodo).status === "done" && auf(kTodo).ziel === "TODO" && auf(kTodo).zielId === todo.id && auf(kTodo).sortiertVon === "automatisch" && auf(kTodo).name === "TS480", JSON.stringify(todo && { name: todo.name, bemerkung: todo.bemerkung }));
    ok("(A) Ziel Akte + bekannte Anlage: Aufnahme gleich in der Akte (done, Ziel AKTE), kein neuer Eintrag", auf(kAkte).status === "done" && auf(kAkte).ziel === "AKTE" && auf(kAkte).sortiertVon === "automatisch" && !alle.some((e) => e.id.endsWith("-bk-" + kAkte) && e.id !== "aufn-bk-" + kAkte));
    const zettel = alle.find((e) => e.id === "notiz-bk-" + kZettel);
    ok("(A) Ziel Pinnwand-Zettel + Notiz: gelber Zettel (NOTIZ, sichtbar Verwalter) mit Foto; Aufnahme → ZETTEL", !!zettel && zettel.category === "NOTIZ" && zettel.note === "Ersatzteil kommt Do." && zettel.farbe === "gelb" && zettel.sichtbar === "verwalter" && !!(zettel.fotos && zettel.fotos.length === 1) && auf(kZettel).ziel === "ZETTEL" && auf(kZettel).zielId === zettel.id);
    ok("(A) Nicht eindeutig bleibt offen: unbekannte Anlage, To-do ohne Notiz, Ziel Störung - drei offene Aufnahmen, keine neuen Einträge", [kUnbekannt, kOhneNotiz, kStoer].every((k) => auf(k).status === "open" && !auf(k).ziel) && !alle.some((e) => [kUnbekannt, kOhneNotiz, kStoer].some((k) => e.id === "todo-bk-" + k)), JSON.stringify([kUnbekannt, kOhneNotiz, kStoer].map((k) => auf(k).status)));
    ok("(A) Der Abholer-Stand zählt drei automatisch Einsortierte", r.automatischGesamt === 3, JSON.stringify(r.automatischGesamt));
    // Schalter aus (⚙ Regeln & Listen → regeln.aufnahme.auto.TODO) - der Dienst hält sich daran
    await regelSetzen({ TODO: false });
    const kAus = await einwurf({ wer: "RC", anlage: "TS480", ziel: "TODO", notiz: "bleibt offen" });
    await abholen();
    const alle2 = await standAlle();
    const aufAus = alle2.find((e) => e.id === "aufn-bk-" + kAus);
    ok("(A) Schalter „To-do“ aus: dieselbe Aufnahme bleibt offen, kein To-do", !!aufAus && aufAus.status === "open" && !alle2.some((e) => e.id === "todo-bk-" + kAus));
    await regelSetzen({ TODO: true });
    await abholen();
    ok("(A) Nochmal abholen legt nichts doppelt an: genau ein To-do zur ersten Aufnahme", (await standAlle()).filter((e) => e.id === "todo-bk-" + kTodo).length === 1);
  }

  // PC sieht die Karte mit Bild vom Server
  const pc = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const pp = await pc.newPage();
  pp.on("pageerror", (e) => { fehler.push("PC:" + e.message); console.log("PAGEERROR(PC):", e.message); });
  await pc.addInitScript((s) => { localStorage.setItem("bta-standort", "scheurich"); localStorage.setItem("werkstatt-kalender-benutzer", "Chef"); localStorage.setItem("werkstatt-kalender-name", "Chef"); localStorage.setItem("bta-server:schluessel", s); }, SCHLUESSEL);
  await pp.goto(APP + "?server=" + D);
  await pp.waitForFunction(() => window.__wkSharedTest && window.__wkSharedTest.spiegel && window.__wkSharedTest.spiegel().entries.length > 0, null, { timeout: 15000 }).catch(() => {});
  await pp.locator('button[data-hauptbereich="AUFNAHME"]').click();
  const pcKarte = await pp.waitForFunction(() => { const i = document.querySelector("[data-aufnahme-karte] img[data-aufnahme-bild]"); return !!i && i.naturalWidth > 0; }, null, { timeout: 10000 }).then(() => true).catch(() => false);
  const pcText = (await pp.locator("[data-aufnahme-karte]").allInnerTexts()).join(" | ");
  ok("(E) PC: Reiter Aufnahme zeigt die Karte mit Bild vom Server, Quelle „Briefkasten RC“, Anlage TS480, Vorschlag", pcKarte && /Briefkasten RC/.test(pcText) && /TS480/.test(pcText) && /Vorschlag/.test(pcText), pcText.replace(/\n/g, " · ").slice(0, 160));
  // (A) Tagesfilm: automatisch Sortiertes ist gekennzeichnet und zurücknehmbar
  await pp.locator('button[data-aufnahme-tab="FILM"]').click();
  await pp.waitForTimeout(600);
  const autoKarte = pp.locator(`[data-aufnahme-karte="${autoTodoId}"]`);
  const autoText = await autoKarte.innerText().catch(() => "");
  ok("(A) PC-Tagesfilm: die automatisch sortierte Aufnahme steht blass mit „To-do · automatisch“ und dem Knopf „Zurück in die Aufnahme“", /To-do · automatisch/.test(autoText) && (await autoKarte.locator("[data-aufnahme-zurueck]").count()) === 1, autoText.replace(/\n/g, " · ").slice(0, 120));
  await autoKarte.locator("[data-aufnahme-zurueck]").click().catch(() => {});
  let zurueck = null;
  for (let i = 0; i < 40; i++) { await warte(250); const alle = await standAlle(); const a = alle.find((e) => e.id === autoTodoId); if (a && a.status === "open" && !alle.some((e) => e.id === "todo-bk-" + autoTodoId.slice(8))) { zurueck = a; break; } }
  ok("(A) „Zurück in die Aufnahme“ am PC: das To-do ist auf dem Server weg, die Aufnahme wieder offen ohne Ziel", !!zurueck && !zurueck.ziel && !zurueck.sortiertVon, JSON.stringify(zurueck && { status: zurueck.status, ziel: zurueck.ziel }));
  await pc.close();

  /* ================= (H) Handy über mobile Daten: Zettel vom Briefkasten selbst ================= */
  {
    // Frischer Handy-Kontext ohne jede Einstellung - wie Robertos Android beim ersten Öffnen der https-Adresse
    const handy2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const h2 = await handy2.newPage();
    h2.on("pageerror", (e) => { fehler.push("H:" + e.message); console.log("PAGEERROR(Zettel vom Briefkasten):", e.message); });
    await h2.goto(BK + "/zettel");
    const erkannt = await h2.waitForFunction(() => window.__zettelErkannt, null, { timeout: 8000 }).then(() => true).catch(() => false);
    const gemerkt = await h2.evaluate(() => ({ adresse: localStorage.getItem("bta-zettel:bkAdresse"), knopf: document.getElementById("ablegen").textContent, einst: !document.getElementById("einstellungen").hidden }));
    ok("(H) Zettel vom Briefkasten geöffnet: er erkennt seine Herkunft als Briefkasten-Adresse, der Knopf heißt „Einwerfen“, Einstellungen sind offen (Kürzel fehlt noch)", erkannt && gemerkt.adresse === BK && /Einwerfen/.test(gemerkt.knopf) && gemerkt.einst, JSON.stringify(gemerkt));
    // Einrichtungs-Link (z. B. als QR-Code vom Werkstattleiter): Kürzel, Schlüssel, Anlagen - ohne Tippen.
    // Erst als Raute-Wechsel auf der offenen Seite (kein Neuladen), dann als frisches Öffnen wie am Handy.
    const linkLesen = () => h2.evaluate(() => ({ kuerzel: localStorage.getItem("bta-zettel:kuerzel"), schluessel: localStorage.getItem("bta-zettel:bkSchluessel"), anlagen: localStorage.getItem("bta-zettel:anlagen"), hash: location.hash, url: location.href, meldung: document.getElementById("meldung").textContent, kopf: document.getElementById("kopf-rechts").textContent, einst: !document.getElementById("einstellungen").hidden }));
    await h2.goto(BK + "/zettel#kuerzel=XY&schluessel=" + encodeURIComponent(EINWURF) + "&anlagen=TS480|B2");
    await h2.waitForTimeout(500);
    const nachWechsel = await linkLesen();
    ok("(H) Einrichtungs-Link bei offener Seite (nur die Raute wechselt): Kürzel XY, Schlüssel, Anlagen übernommen, Einstellungen zu", nachWechsel.kuerzel === "XY" && nachWechsel.schluessel === EINWURF && nachWechsel.anlagen === "TS480\nB2" && nachWechsel.hash === "" && !nachWechsel.einst && /Kürzel XY/.test(nachWechsel.kopf), nachWechsel.url + " · " + nachWechsel.meldung.slice(0, 60));
    await h2.goto("about:blank");
    await h2.goto(BK + "/zettel#kuerzel=RC&schluessel=" + encodeURIComponent(EINWURF));
    await h2.waitForTimeout(500);
    const nachLink = await linkLesen();
    ok("(H) Einrichtungs-Link frisch geöffnet: Kürzel RC und Einwurf-Schlüssel übernommen, Meldung „Einrichtung übernommen“, der Schlüssel ist aus der Adresszeile verschwunden", nachLink.kuerzel === "RC" && nachLink.schluessel === EINWURF && nachLink.hash === "" && !nachLink.url.includes(EINWURF) && /Einrichtung übernommen/.test(nachLink.meldung) && /Kürzel RC/.test(nachLink.kopf), nachLink.url + " · " + nachLink.meldung.slice(0, 60));
    await h2.reload();
    await h2.waitForTimeout(400);
    const nachReload = await h2.evaluate(() => ({ kuerzel: localStorage.getItem("bta-zettel:kuerzel"), adresse: localStorage.getItem("bta-zettel:bkAdresse"), einst: !document.getElementById("einstellungen").hidden }));
    ok("(H) Nach dem Neuladen ohne Link bleibt alles eingerichtet, die Einstellungen bleiben zu", nachReload.kuerzel === "RC" && nachReload.adresse === BK && !nachReload.einst);
    // Einwurf von dieser Herkunft (Text-Aufnahme ohne Foto) - der Dienst holt sie ab
    await h2.locator("#notiz").fill("Probe vom Briefkasten-Zettel");
    await h2.locator("#ablegen").click();
    await h2.waitForFunction(() => /Eingeworfen/.test(document.getElementById("meldung").textContent), null, { timeout: 10000 }).catch(() => {});
    let standH = null;
    for (let i = 0; i < 60; i++) { await warte(500); standH = await (await fetch(D + "/api/scheurich/stand?seit=0")).json(); if (standH.eintraege.some((e) => e.category === "AUFNAHME" && e.note === "Probe vom Briefkasten-Zettel")) break; }
    const probeH = standH.eintraege.find((e) => e.category === "AUFNAHME" && e.note === "Probe vom Briefkasten-Zettel");
    ok("(H) Einwurf aus dem vom Briefkasten gelieferten Zettel: „Eingeworfen“, der Dienst holt die Aufnahme mit Kürzel RC ab", /Eingeworfen/.test(await h2.locator("#meldung").innerText()) && !!probeH && probeH.wer === "RC" && probeH.quelle === "briefkasten", JSON.stringify(probeH && { id: probeH.id, wer: probeH.wer }));
    await handy2.close();
  }

  /* ================= (O) Ohne Netz: Warteschlange im Zettel ================= */
  await bk.stoppen(); bk = null;
  await hp.locator("#kamera").setInputFiles({ name: "IMG_0002.jpg", mimeType: "image/jpeg", buffer: Buffer.from(fotoB64, "base64") });
  await hp.waitForFunction(() => document.querySelectorAll("#vorschauen img").length === 1, null, { timeout: 8000 });
  await hp.locator("#notiz").fill("Außenlager Lampe defekt");
  await hp.locator("#ablegen").click();
  await hp.waitForFunction(() => !!document.querySelector("[data-wartend]") && !document.getElementById("bk-wartend").hidden, null, { timeout: 10000 }).catch(() => {});
  const wartendText = await hp.locator("#bk-wartend").innerText().catch(() => "");
  const warteDb = await hp.evaluate(() => window.__zettelTest.warteAlle().then((l) => l.map((e) => ({ id: e.id, bytes: e.bytes ? e.bytes.size : 0, notiz: e.begleit.notiz }))));
  ok("(O) Briefkasten weg: die Aufnahme wartet in der IndexedDB des Handys (Bild + Begleitdatei), gelber Hinweis, Heute-Liste ⏳", /1 Aufnahme wartet/.test(wartendText) && warteDb.length === 1 && warteDb[0].bytes > 5000 && warteDb[0].notiz === "Außenlager Lampe defekt" && (await hp.locator('[data-heute-status="wartet"]').count()) === 1, JSON.stringify(warteDb) + " · " + wartendText.slice(0, 50));
  await hp.reload();
  await hp.waitForTimeout(800);
  const nachReload = await hp.evaluate(() => window.__zettelTest.warteAlle().then((l) => l.length));
  ok("(O) Nach dem Neuladen der Seite wartet die Aufnahme weiter (nicht nur im Tab)", nachReload === 1 && !(await hp.locator("#bk-wartend").isHidden()));
  bk = await briefkasten.starten({ port: PORT_BK, host: "127.0.0.1", ordner: path.join(ORDNER, "ablage"), einwurfSchluessel: EINWURF, abholSchluessel: ABHOL });
  const tO = Date.now();
  await hp.evaluate(() => window.__zettelTest.warteSenden());
  await hp.waitForFunction(() => document.getElementById("bk-wartend").hidden, null, { timeout: 10000 }).catch(() => {});
  const warteDanach = await hp.evaluate(() => window.__zettelTest.warteAlle().then((l) => l.length));
  let stand4 = null;
  for (let i = 0; i < 60; i++) { await warte(500); stand4 = await (await fetch(D + "/api/scheurich/stand?seit=0")).json(); if (stand4.eintraege.some((e) => e.category === "AUFNAHME" && e.note === "Außenlager Lampe defekt")) break; }
  const nachMs = Date.now() - tO;
  console.log(`MESSUNG Nachsenden aus der Warteschlange bis zur Aufnahme auf dem Dienst: ${nachMs} ms`);
  ok("(O) Briefkasten wieder da: Warteschlange leer, die Aufnahme „Außenlager“ ist auf dem Dienst (mit Foto), Heute-Liste ✓", warteDanach === 0 && stand4.eintraege.some((e) => e.category === "AUFNAHME" && e.note === "Außenlager Lampe defekt" && e.fotos.length === 1) && (await hp.locator('[data-heute-status="eingeworfen"]').count()) === 2, `${nachMs} ms`);

  /* ================= (F) Fehler am Server: Foto nicht schreibbar ================= */
  {
    const fotosOrdner = path.join(datenOrdner, "fotos");
    // Den Foto-Ordner durch eine DATEI ersetzen - schreiben scheitert dann sicher
    const vorherFotos = fs.readdirSync(fotosOrdner);
    for (const f of vorherFotos) fs.renameSync(path.join(fotosOrdner, f), path.join(ORDNER, "weg-" + f));
    fs.rmdirSync(fotosOrdner); fs.writeFileSync(fotosOrdner, "sperre");
    await fetch(BK + "/einwurf", { method: "POST", headers: { "X-BTA-Schluessel": EINWURF, "X-BTA-Begleit": begleitKopf({ notiz: "Fehlerfall" }) }, body: new Uint8Array([5, 5, 5, 5, 5]) });
    const r = await (await fetch(D + "/api/scheurich/briefkasten", { method: "POST", headers: { "X-BTA-Schluessel": SCHLUESSEL } })).json();
    const bkF = await (await fetch(BK + "/liste", { headers: { "X-BTA-Schluessel": ABHOL } })).json();
    const standF = await (await fetch(D + "/api/scheurich/stand?seit=0")).json();
    ok("(F) Foto nicht schreibbar: Einwurf bleibt im Briefkasten, kein Eintrag „Fehlerfall“, Status nennt den Fehler", bkF.eintraege.length === 1 && !standF.eintraege.some((e) => e.note === "Fehlerfall") && !!r.letzterFehler, String(r.letzterFehler).slice(0, 80));
    fs.unlinkSync(fotosOrdner); fs.mkdirSync(fotosOrdner);
    for (const f of vorherFotos) fs.renameSync(path.join(ORDNER, "weg-" + f), path.join(fotosOrdner, f));
    const r2 = await (await fetch(D + "/api/scheurich/briefkasten", { method: "POST", headers: { "X-BTA-Schluessel": SCHLUESSEL } })).json();
    const standF2 = await (await fetch(D + "/api/scheurich/stand?seit=0")).json();
    ok("(F) Nach der Reparatur holt der nächste Takt ab: Eintrag da, Briefkasten leer, Fehler gelöscht", standF2.eintraege.some((e) => e.note === "Fehlerfall" && e.fotos.length === 1) && r2.imBriefkasten === 0 && !r2.letzterFehler);
  }
  const statusSeite = await (await fetch(D + "/status")).text();
  ok("(E) Die Status-Seite hat den Abschnitt Briefkasten mit Adresse und Zähler", /<h2>Briefkasten/.test(statusSeite) && statusSeite.includes(BK) && /Aufnahme\(n\) seit dem Start abgeholt/.test(statusSeite));
  ok("(Z) Keine Skriptfehler (Zettel, PC)", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  await handy.close();
  await browser.close();
  await dienstStoppen();
  if (bk) await bk.stoppen();
  fs.rmSync(ORDNER, { recursive: true, force: true });
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error("ABBRUCH:", e); process.exit(1); });
