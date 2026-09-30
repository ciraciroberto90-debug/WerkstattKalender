/* BTA-Cockpit-Dienst (Etappe A des Bauplans, 30.09.2026)
 *
 * Das Hintergrundprogramm auf v-btacockpit-01: hält je Standort EINE
 * Datenbank, beantwortet die Cockpit-Programme im Firmennetz, sagt allen
 * verbundenen Rechnern Bescheid, wenn sich etwas ändert, liefert die App aus
 * und macht nachts die Sicherung. Keine Zusatzpakete - nur Node.
 *
 * Aufruf:  node --no-warnings dienst.js [pfad/zu/einstellungen.json]
 *          (ohne Pfad: einstellungen.json neben dieser Datei)
 *
 * Wege (siehe doku/BAUPLAN-SERVER-SYSTEM.md, Abschnitt 4):
 *   GET  /api/status                         Zustand des Dienstes (JSON)
 *   GET  /status                             dasselbe als Seite zum Anschauen
 *   GET  /api/:standort/stand?seit=N         alles seit Version N (0 = Vollbestand)
 *   POST /api/:standort/aenderungen          Bündel Änderungen mit basisVersion; 409 bei Konflikt
 *   GET  /api/:standort/ereignisse           Server-Sent Events: {"version":N} bei jeder Änderung
 *   GET  /api/:standort/export.json?bereich= Bestand im heutigen Dateiformat (kalender|stoerungen)
 *   POST /api/:standort/import               (Etappe B) Datei im v1-Format einlesen, Zählung zurück
 *   POST /api/:standort/sicherung            Sicherung jetzt (Datenbank-Kopie + Export)
 *   GET  /app/                               die App (eine HTML)
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { oeffnen, KonfliktFehler } = require("./db.js");

const HIER = __dirname;
const START = Date.now();
const MAX_KOERPER = 64 * 1024 * 1024; // 64 MB - der heutige Vollbestand hat 9 MB

/* ---------- Einstellungen ---------- */
function ladeEinstellungen(pfad) {
  const roh = JSON.parse(fs.readFileSync(pfad, "utf8"));
  const e = {
    port: Number(roh.port) || 8765,
    host: roh.host || "0.0.0.0",
    appDatei: roh.appDatei || null,
    protokollOrdner: roh.protokollOrdner || path.join(HIER, "protokoll"),
    sicherungOrdner: roh.sicherungOrdner || path.join(HIER, "sicherung"),
    sicherungUhrzeit: roh.sicherungUhrzeit || "02:00",
    sicherungBehalten: Number(roh.sicherungBehalten) || 14,
    standorte: roh.standorte || {},
  };
  if (!Object.keys(e.standorte).length) throw new Error("Einstellungen: kein Standort angegeben");
  for (const [id, s] of Object.entries(e.standorte)) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Einstellungen: Standort-Kennung nur Kleinbuchstaben/Ziffern: " + id);
    if (!s.datenOrdner) throw new Error("Einstellungen: Standort " + id + " ohne datenOrdner");
  }
  return e;
}

/* ---------- Protokoll ---------- */
function protokollierer(ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  const fehlerLetzte24h = [];
  const schreibe = (stufe, text) => {
    const zeit = new Date().toISOString();
    const zeile = `${zeit} ${stufe.padEnd(5)} ${text}`;
    try { fs.appendFileSync(path.join(ordner, `dienst-${zeit.slice(0, 10)}.log`), zeile + "\n"); } catch (e) { /* Protokoll darf den Dienst nicht stoppen */ }
    if (stufe === "FEHL") { fehlerLetzte24h.push({ zeit, text }); while (fehlerLetzte24h.length && Date.now() - Date.parse(fehlerLetzte24h[0].zeit) > 86400000) fehlerLetzte24h.shift(); }
    if (process.stdout.isTTY || process.env.DIENST_LAUT) console.log(zeile);
  };
  return { info: (t) => schreibe("INFO", t), fehler: (t) => schreibe("FEHL", t), fehlerLetzte24h: () => fehlerLetzte24h.slice() };
}

/* ---------- Hilfen ---------- */
function json(res, status, daten, extra = {}) {
  const text = JSON.stringify(daten);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", ...extra });
  res.end(text);
}
function koerperLesen(req) {
  return new Promise((resolve, reject) => {
    const teile = []; let groesse = 0;
    req.on("data", (d) => { groesse += d.length; if (groesse > MAX_KOERPER) { reject(new Error("Anfrage zu groß")); req.destroy(); return; } teile.push(d); });
    req.on("end", () => { try { resolve(teile.length ? JSON.parse(Buffer.concat(teile).toString("utf8")) : {}); } catch (e) { reject(new Error("Anfrage ist kein gültiges JSON")); } });
    req.on("error", reject);
  });
}
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- Der Dienst ---------- */
function starten(einstellungen, { still = false } = {}) {
  const e = einstellungen;
  const log = protokollierer(e.protokollOrdner);
  const standorte = {};
  for (const [id, s] of Object.entries(e.standorte)) {
    const dbPfad = path.join(s.datenOrdner, "cockpit.sqlite");
    standorte[id] = { id, name: s.name || id, datenOrdner: s.datenOrdner, db: oeffnen(dbPfad, { standort: id }), lauscher: new Set() };
    fs.mkdirSync(path.join(s.datenOrdner, "fotos"), { recursive: true });
    log.info(`Standort ${id}: Datenbank ${dbPfad} (Version ${standorte[id].db.version()})`);
  }
  let letzteSicherung = null;

  /* Allen verbundenen Rechnern eines Standorts Bescheid geben. */
  function melde(st, version) {
    const zeile = `data: ${JSON.stringify({ version })}\n\n`;
    for (const res of st.lauscher) { try { res.write(zeile); } catch (x) { st.lauscher.delete(res); } }
  }

  /* Sicherung: konsistente Datenbank-Kopie + Export im heutigen Format, je Standort. */
  function sicherungJetzt(grund) {
    const stempel = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const ergebnis = [];
    for (const st of Object.values(standorte)) {
      try {
        const zielDb = path.join(e.sicherungOrdner, `${stempel}_${st.id}.sqlite`);
        const bytes = st.db.sicherungNach(zielDb);
        const kal = path.join(e.sicherungOrdner, `${stempel}_${st.id}_kalender.json`);
        const sto = path.join(e.sicherungOrdner, `${stempel}_${st.id}_stoerungen.json`);
        fs.writeFileSync(kal, JSON.stringify(st.db.exportV1("kalender")));
        fs.writeFileSync(sto, JSON.stringify(st.db.exportV1("stoerungen")));
        ergebnis.push({ standort: st.id, datenbank: zielDb, bytes, export: [kal, sto] });
        log.info(`Sicherung (${grund}) ${st.id}: ${zielDb} (${bytes} Bytes) + Export`);
      } catch (x) {
        log.fehler(`Sicherung ${st.id} fehlgeschlagen: ${x.message}`);
        ergebnis.push({ standort: st.id, fehler: x.message });
      }
    }
    // Ältere Stände wegräumen - die IT-Netzsicherung hebt sie länger auf.
    try {
      const alle = fs.readdirSync(e.sicherungOrdner).filter((n) => /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}_/.test(n)).sort();
      const staende = [...new Set(alle.map((n) => n.slice(0, 16)))];
      for (const alt of staende.slice(0, Math.max(0, staende.length - e.sicherungBehalten))) {
        for (const n of alle.filter((x) => x.startsWith(alt))) fs.unlinkSync(path.join(e.sicherungOrdner, n));
      }
    } catch (x) { log.fehler("Aufräumen der Sicherungen: " + x.message); }
    letzteSicherung = { zeit: new Date().toISOString(), grund, ergebnis };
    return letzteSicherung;
  }

  /* Nächtliche Sicherung: jede Minute prüfen, ob die eingestellte Uhrzeit erreicht ist. */
  let letzterSicherungsTag = null;
  const sicherungsUhr = setInterval(() => {
    const jetzt = new Date();
    const hhmm = `${String(jetzt.getHours()).padStart(2, "0")}:${String(jetzt.getMinutes()).padStart(2, "0")}`;
    const tag = jetzt.toISOString().slice(0, 10);
    if (hhmm === e.sicherungUhrzeit && letzterSicherungsTag !== tag) { letzterSicherungsTag = tag; sicherungJetzt("nächtlich"); }
  }, 60 * 1000);
  // Lebenszeichen für die SSE-Verbindungen, damit kein Proxy/Router sie für tot hält.
  const herzschlag = setInterval(() => { for (const st of Object.values(standorte)) for (const res of st.lauscher) { try { res.write(": herz\n\n"); } catch (x) { st.lauscher.delete(res); } } }, 25 * 1000);

  function statusDaten() {
    const out = { dienst: "bta-cockpit-dienst", fassung: FASSUNG, gestartet: new Date(START).toISOString(), laufzeitSek: Math.round((Date.now() - START) / 1000), port: e.port, standorte: {}, letzteSicherung, fehlerLetzte24h: log.fehlerLetzte24h(), appDatei: e.appDatei && fs.existsSync(e.appDatei) ? { pfad: e.appDatei, bytes: fs.statSync(e.appDatei).size, geaendert: fs.statSync(e.appDatei).mtime.toISOString() } : null };
    for (const st of Object.values(standorte)) out.standorte[st.id] = { name: st.name, ...st.db.zaehlen(), verbunden: st.lauscher.size, datenbank: st.db.pfad };
    return out;
  }

  function statusSeite() {
    const s = statusDaten();
    const zeilen = Object.entries(s.standorte).map(([id, st]) => `<tr><td>${esc(st.name)} <small>(${esc(id)})</small></td><td>${st.version}</td><td>${st.eintraege}</td><td>${st.stoerungen}</td><td>${st.geloescht}</td><td>${(st.bytes / 1024 / 1024).toFixed(2)} MB</td><td>${st.verbunden}</td></tr>`).join("");
    const sich = s.letzteSicherung ? `${esc(s.letzteSicherung.zeit.replace("T", " ").slice(0, 16))} (${esc(s.letzteSicherung.grund)})` : "noch keine seit dem Start";
    const fehler = s.fehlerLetzte24h.length ? `<ul>${s.fehlerLetzte24h.slice(-10).map((f) => `<li><code>${esc(f.zeit)}</code> ${esc(f.text)}</li>`).join("")}</ul>` : "<p class=ok>keine</p>";
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>BTA-Cockpit-Dienst</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#1F2933}h1{color:#1E2761}table{border-collapse:collapse}td,th{padding:6px 12px;border-bottom:1px solid #E5E9ED;text-align:left}th{font-size:12px;text-transform:uppercase;color:#5B6572}.ok{color:#1F7A3D;font-weight:bold}code{background:#EEF1F4;padding:0 4px}</style></head>
<body><h1>BTA-Cockpit-Dienst <small style="color:#5B6572;font-size:14px">Fassung ${esc(s.fassung)} · Port ${s.port}</small></h1>
<p>Läuft seit ${esc(s.gestartet.replace("T", " ").slice(0, 16))} (${Math.round(s.laufzeitSek / 60)} min). Letzte Sicherung: ${sich}.</p>
<table><tr><th>Standort</th><th>Version</th><th>Einträge</th><th>Störberichte</th><th>gelöscht</th><th>Datenbank</th><th>verbunden</th></tr>${zeilen}</table>
<h2>Fehler der letzten 24 Stunden</h2>${fehler}
<h2>App</h2><p>${s.appDatei ? `<a href="/app/">/app/</a> · ${(s.appDatei.bytes / 1024).toFixed(0)} kB · Stand ${esc(s.appDatei.geaendert.replace("T", " ").slice(0, 16))}` : "keine App-Datei hinterlegt"}</p>
<p><small>JSON: <a href="/api/status">/api/status</a></small></p></body></html>`;
  }

  async function behandle(req, res) {
    const u = url.parse(req.url, true);
    const teile = u.pathname.split("/").filter(Boolean);
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }); return res.end(); }
    try {
      if (teile.length === 0) { res.writeHead(302, { Location: "/status" }); return res.end(); }
      if (teile[0] === "status") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); return res.end(statusSeite()); }
      if (teile[0] === "app") {
        if (!e.appDatei || !fs.existsSync(e.appDatei)) return json(res, 404, { fehler: "Keine App-Datei hinterlegt" });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        return fs.createReadStream(e.appDatei).pipe(res);
      }
      if (teile[0] !== "api") return json(res, 404, { fehler: "Unbekannter Weg" });
      if (teile[1] === "status") return json(res, 200, statusDaten());
      const st = standorte[teile[1]];
      if (!st) return json(res, 404, { fehler: "Unbekannter Standort: " + teile[1], bekannt: Object.keys(standorte) });
      const weg = teile[2] || "";

      if (weg === "stand" && req.method === "GET") return json(res, 200, st.db.standSeit(u.query.seit));
      if (weg === "aenderungen" && req.method === "POST") {
        const a = await koerperLesen(req);
        try {
          const r = st.db.aenderungenAnwenden(a);
          if (r.anzahl > 0) { melde(st, r.version); log.info(`${st.id}: ${r.anzahl} Änderung(en) von ${a.benutzer || "?"} -> Version ${r.version}`); }
          return json(res, 200, r);
        } catch (x) {
          if (x instanceof KonfliktFehler) return json(res, 409, { fehler: x.message, version: st.db.version(), konflikte: x.konflikte });
          throw x;
        }
      }
      if (weg === "ereignisse" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" });
        res.write(`data: ${JSON.stringify({ version: st.db.version(), hallo: true })}\n\n`);
        st.lauscher.add(res);
        req.on("close", () => st.lauscher.delete(res));
        return;
      }
      if (weg === "export.json" && req.method === "GET") {
        const bereich = u.query.bereich === "stoerungen" ? "stoerungen" : "kalender";
        return json(res, 200, st.db.exportV1(bereich), { "Content-Disposition": `attachment; filename="${st.id}-${bereich}.json"` });
      }
      if (weg === "import" && req.method === "POST") {
        const datei = await koerperLesen(req);
        const r = st.db.importV1(datei, { bereich: u.query.bereich, benutzer: u.query.benutzer || "import" });
        if (r.neu + r.geaendert + r.geloescht + r.konfig > 0) melde(st, r.version);
        log.info(`${st.id}: Import ${r.tabelle}: ${r.gelesen} gelesen, ${r.neu} neu, ${r.geaendert} geändert, ${r.unveraendert} unverändert, ${r.geloescht} gelöscht, ${r.konfig} Konfig -> Version ${r.version}`);
        return json(res, 200, r);
      }
      if (weg === "sicherung" && req.method === "POST") return json(res, 200, sicherungJetzt("auf Anforderung"));
      return json(res, 404, { fehler: "Unbekannter Weg: " + u.pathname });
    } catch (x) {
      // Eine kaputte Anfrage (kein JSON, zu groß, ohne id) ist ein Fehler des
      // Absenders, kein Fehler des Dienstes - sie steht als INFO im Protokoll,
      // damit die Fehlerliste der Status-Seite echte Dienst-Fehler zeigt.
      const absender = !!(x.message && /JSON|zu groß|ohne id|Import:/.test(x.message));
      if (absender) log.info(`${req.method} ${u.pathname} abgewiesen: ${x.message}`); else log.fehler(`${req.method} ${u.pathname}: ${x.message}`);
      return json(res, absender ? 400 : 500, { fehler: x.message });
    }
  }

  const server = http.createServer((req, res) => { behandle(req, res); });
  server.keepAliveTimeout = 65 * 1000;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(e.port, e.host, () => {
      const adresse = server.address();
      log.info(`Dienst gestartet: http://${e.host}:${adresse.port} (Standorte: ${Object.keys(standorte).join(", ")})`);
      resolve({
        port: adresse.port, standorte, sicherungJetzt, statusDaten, log,
        async stoppen() {
          clearInterval(sicherungsUhr); clearInterval(herzschlag);
          for (const st of Object.values(standorte)) { for (const r of st.lauscher) { try { r.end(); } catch (x) { /* egal */ } } st.lauscher.clear(); }
          await new Promise((r) => server.close(() => r()));
          for (const st of Object.values(standorte)) st.db.schliessen();
          log.info("Dienst gestoppt.");
        },
      });
    });
  });
}

const FASSUNG = "0.1.0";

module.exports = { starten, ladeEinstellungen, FASSUNG };

if (require.main === module) {
  const pfad = process.argv[2] || path.join(HIER, "einstellungen.json");
  let e;
  try { e = ladeEinstellungen(pfad); } catch (x) { console.error("Einstellungen konnten nicht gelesen werden:", x.message, "\nPfad:", pfad); process.exit(2); }
  starten(e).then((d) => {
    const runter = async (signal) => { d.log.info("Beende (" + signal + ") …"); await d.stoppen(); process.exit(0); };
    process.on("SIGINT", () => runter("SIGINT"));
    process.on("SIGTERM", () => runter("SIGTERM"));
  }).catch((x) => { console.error("Dienst konnte nicht starten:", x.message); process.exit(1); });
}
