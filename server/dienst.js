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
 *   GET  /api/:standort/quellen              (0.4.0) Excel-Quellen auf dem Server: Liste mit Stand
 *   GET  /api/:standort/quellen/:name        eine Quelle (Bytes), Kopf X-BTA-Stand = Änderungszeit der Vorlage
 *   POST /api/:standort/quellen/:name?stand=ms  Quelle einspielen (Programm mit Laufwerkszugriff); DELETE entfernt sie
 *   POST /api/:standort/briefkasten          (0.5.0) Briefkasten jetzt abholen (sonst im Takt, Vorgabe 30 s)
 *   GET  /app/                               die App (eine HTML)
 *   GET  /zettel                             (0.5.0) der Aufnahme-Zettel fürs Handy (handy/aufnahme-zettel.html), falls neben der App hinterlegt
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
  // Briefkasten-Zugang (0.5.0) wahlweise in einer EIGENEN Datei briefkasten.json
  // neben den Einstellungen: Das Server-Werkzeug schreibt einstellungen.json
  // bei jedem „Einrichten" neu - die kleine Datei daneben bleibt stehen, und
  // Roberto trägt dort Adresse und Abhol-Schlüssel von Hand ein (vier Zeilen).
  const bkPfad = path.join(path.dirname(pfad), "briefkasten.json");
  if (!roh.briefkasten && fs.existsSync(bkPfad)) {
    try { roh.briefkasten = JSON.parse(fs.readFileSync(bkPfad, "utf8").replace(/^﻿/, "")); } catch (x) { throw new Error("briefkasten.json ist kein gültiges JSON: " + x.message); }
  }
  const e = {
    port: Number(roh.port) || 8765,
    host: roh.host || "0.0.0.0",
    appDatei: roh.appDatei || null,
    protokollOrdner: roh.protokollOrdner || path.join(HIER, "protokoll"),
    sicherungOrdner: roh.sicherungOrdner || path.join(HIER, "sicherung"),
    sicherungUhrzeit: roh.sicherungUhrzeit || "02:00",
    sicherungBehalten: Number(roh.sicherungBehalten) || 14,
    // Werkstatt-Schlüssel (Bauplan Abschnitt 12, Lücke 1): leer = jeder im
    // Firmennetz darf schreiben (wie heute die Datei auf W:). Gesetzt = jede
    // schreibende Anfrage braucht den Kopf X-BTA-Schluessel; Lesen bleibt frei.
    schluessel: typeof roh.schluessel === "string" ? roh.schluessel.trim() : "",
    standorte: roh.standorte || {},
    // Briefkasten im Internet (0.5.0, Roll-out 65): der Dienst holt dort ab,
    // was der Aufnahme-Zettel vom Handy eingeworfen hat. Leer = aus.
    briefkasten: roh.briefkasten && typeof roh.briefkasten === "object" && roh.briefkasten.adresse
      ? {
        adresse: String(roh.briefkasten.adresse).trim().replace(/\/+$/, ""),
        schluessel: String(roh.briefkasten.schluessel || "").trim(), // der Abhol-Schlüssel
        standort: String(roh.briefkasten.standort || Object.keys(roh.standorte || {})[0] || "").trim(),
        taktSek: Math.max(5, Number(roh.briefkasten.taktSek) || 30),
        // Sicherheitsnetz (0.6.1): spätestens so oft die volle Liste ziehen, auch ohne neue Marke
        listeAlleSek: Math.max(30, Number(roh.briefkasten.listeAlleSek) || 600),
      }
      : null,
  };
  if (e.briefkasten && !e.standorte[e.briefkasten.standort]) throw new Error("Einstellungen: briefkasten.standort unbekannt: " + e.briefkasten.standort);
  if (!Object.keys(e.standorte).length) throw new Error("Einstellungen: kein Standort angegeben");
  for (const [id, s] of Object.entries(e.standorte)) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Einstellungen: Standort-Kennung nur Kleinbuchstaben/Ziffern: " + id);
    if (!s.datenOrdner) throw new Error("Einstellungen: Standort " + id + " ohne datenOrdner");
  }
  return e;
}

/* ---------- Protokoll ---------- */
/* Serverzeit als „YYYY-MM-DD HH:MM:SS“ - für Protokoll, Sicherungsnamen und
 * Tageswechsel. Roberto sah am 30.09. Dateien „…-13-57_scheurich.sqlite“ um
 * 15:57 Uhr: das war die Weltzeit aus toISOString(). Nach außen (JSON) bleibt
 * ISO/UTC, damit Programme eindeutig rechnen. */
function ortsZeit(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

function protokollierer(ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  const fehlerLetzte24h = [];
  const schreibe = (stufe, text) => {
    const zeit = ortsZeit();
    const zeile = `${zeit} ${stufe.padEnd(5)} ${text}`;
    try { fs.appendFileSync(path.join(ordner, `dienst-${zeit.slice(0, 10)}.log`), zeile + "\n"); } catch (e) { /* Protokoll darf den Dienst nicht stoppen */ }
    if (stufe === "FEHL") { fehlerLetzte24h.push({ zeit, text, ms: Date.now() }); while (fehlerLetzte24h.length && Date.now() - fehlerLetzte24h[0].ms > 86400000) fehlerLetzte24h.shift(); }
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
/* Rohe Bytes (Fotos) - ohne JSON-Zerlegung. */
function rohLesen(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const teile = []; let groesse = 0;
    req.on("data", (d) => { groesse += d.length; if (groesse > maxBytes) { reject(new Error("Anfrage zu groß")); req.destroy(); return; } teile.push(d); });
    req.on("end", () => resolve(Buffer.concat(teile)));
    req.on("error", reject);
  });
}
/* Fotos liegen als Dateien im fotos-Ordner des Standorts. Nur ein schlichter
   Dateiname ist erlaubt - kein Pfad, keine Punkte am Anfang (Bauplan Abschnitt 4). */
const FOTO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const FOTO_TYPEN = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

/* Excel-Quellen (0.4.0, Roll-out 54): Tabellen, die die App nur LIEST (OEE,
   später Budget-Ist). Sie liegen auf W:, und W: darf der Dienst (Konto SYSTEM)
   nicht lesen (Befund 30.09.). Deshalb hält der Dienst je Standort eine KOPIE
   im Ordner quellen/: ein Cockpit-Programm mit Laufwerkszugriff spielt die
   Datei ein, sobald sie auf W: jünger ist; jeder Rechner - auch der reine
   Browser und der Monitor - liest die Kopie. Eine Quelle ist ein Dateiname,
   wie Excel ihn vergibt (Leerzeichen, Umlaute erlaubt) - aber nie ein Pfad,
   nie mit führendem Punkt, nur Tabellen-Endungen. */
const QUELLE_NAME = /^[^\\/:*?"<>|\x00-\x1f.][^\\/:*?"<>|\x00-\x1f]{0,159}$/;
const QUELLE_TYPEN = { ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12", ".xls": "application/vnd.ms-excel", ".csv": "text/csv; charset=utf-8" };
const MAX_QUELLE = 50 * 1024 * 1024; // Robertos OEE-Auswertung hat wenige MB; 50 MB lässt Luft
function quelleGueltig(name) {
  return QUELLE_NAME.test(name) && !!QUELLE_TYPEN[path.extname(name).toLowerCase()] && !name.startsWith("~$");
}
/* Stand einer Kopie: die Änderungszeit der VORLAGE auf W: (beim Einspielen als
   mtime gesetzt), damit die App „Excel hat die Datei um 06:12 angefasst“ sagt
   und nicht die Zeit des Kopierens. */
function quellenListe(ordner) {
  if (!fs.existsSync(ordner)) return [];
  return fs.readdirSync(ordner).filter(quelleGueltig).map((name) => {
    const st = fs.statSync(path.join(ordner, name));
    return { name, bytes: st.size, stand: Math.round(st.mtimeMs), standIso: new Date(st.mtimeMs).toISOString() };
  }).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function koerperLesen(req) {
  return new Promise((resolve, reject) => {
    const teile = []; let groesse = 0;
    req.on("data", (d) => { groesse += d.length; if (groesse > MAX_KOERPER) { reject(new Error("Anfrage zu groß")); req.destroy(); return; } teile.push(d); });
    // Eine BOM (EF BB BF) am Anfang lässt JSON.parse scheitern - Dateien, die
    // Windows-Werkzeuge geschrieben haben, tragen sie manchmal (Import, Etappe B).
    req.on("end", () => { try { resolve(teile.length ? JSON.parse(Buffer.concat(teile).toString("utf8").replace(/^﻿/, "")) : {}); } catch (e) { reject(new Error("Anfrage ist kein gültiges JSON")); } });
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
    fs.mkdirSync(path.join(s.datenOrdner, "quellen"), { recursive: true });
    log.info(`Standort ${id}: Datenbank ${dbPfad} (Version ${standorte[id].db.version()}), ${quellenListe(path.join(s.datenOrdner, "quellen")).length} Excel-Quelle(n)`);
  }
  /* Die jüngste Sicherung aus dem Ordner, damit ein Neustart des Dienstes
     nicht "noch keine" meldet (Sicherungs-Ampel im Werkzeug, Bauplan Abschnitt 12). */
  let letzteSicherung = null;
  try {
    let juengste = null;
    for (const name of fs.existsSync(e.sicherungOrdner) ? fs.readdirSync(e.sicherungOrdner) : []) {
      if (!/\.sqlite$/.test(name)) continue;
      const st = fs.statSync(path.join(e.sicherungOrdner, name));
      if (!juengste || st.mtimeMs > juengste.ms) juengste = { ms: st.mtimeMs, name };
    }
    if (juengste) letzteSicherung = { zeit: new Date(juengste.ms).toISOString(), grund: "aus dem Sicherungsordner (vor dem Start)", ergebnis: [{ datenbank: path.join(e.sicherungOrdner, juengste.name) }] };
  } catch (x) { /* ohne Ordner: noch keine */ }

  /* Allen verbundenen Rechnern eines Standorts Bescheid geben. */
  function melde(st, version) {
    const zeile = `data: ${JSON.stringify({ version })}\n\n`;
    for (const res of st.lauscher) { try { res.write(zeile); } catch (x) { st.lauscher.delete(res); } }
  }

  /* Sicherung: konsistente Datenbank-Kopie + Export im heutigen Format, je Standort. */
  function sicherungJetzt(grund) {
    const stempel = ortsZeit().replace(/[: ]/g, "-").slice(0, 16); // 2026-09-30-15-57 (Serverzeit)
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
    const tag = ortsZeit(jetzt).slice(0, 10);
    if (hhmm === e.sicherungUhrzeit && letzterSicherungsTag !== tag) { letzterSicherungsTag = tag; sicherungJetzt("nächtlich"); }
  }, 60 * 1000);
  // Lebenszeichen für die SSE-Verbindungen, damit kein Proxy/Router sie für tot hält.
  const herzschlag = setInterval(() => { for (const st of Object.values(standorte)) for (const res of st.lauscher) { try { res.write(": herz\n\n"); } catch (x) { st.lauscher.delete(res); } } }, 25 * 1000);

  /* ---------- Briefkasten-Abholer (0.5.0, Roll-out 65) ----------
     Robertos Weg über mobile Daten ohne Firmennetz: Das Handy wirft Foto +
     Begleitdatei in den Briefkasten im Internet (briefkasten/kern.js), dieser
     Dienst holt im Takt ab - Foto in den fotos-Ordner des Standorts, Aufnahme
     als Eintrag AUFNAHME (Kennung aus der Briefkasten-Kennung, deshalb nie
     doppelt), dann DELETE im Briefkasten. Reihenfolge ist Programm: Erst wenn
     Foto UND Eintrag hier liegen, wird im Briefkasten gelöscht; scheitert
     etwas, bleibt der Einwurf dort und der nächste Takt versucht es neu.
     Der Server braucht dafür nur AUSGEHENDES HTTPS (gemessen 06.10.: Roberto
     „ich habe da Internet"). */
  const bk = e.briefkasten;
  const briefkastenStand = { aktiv: !!bk, adresse: bk ? bk.adresse : "", standort: bk ? bk.standort : "", letzterTakt: null, letzteAbholung: null, abgeholtGesamt: 0, automatischGesamt: 0, imBriefkasten: null, letzterFehler: null, erreichbar: null, nachfragenGesamt: 0, listenGesamt: 0 };
  // Marke des Briefkastens (0.6.1): Kennung des letzten Einwurfs, wie der Dienst sie zuletzt gesehen hat.
  // undefined = noch nie gefragt (erster Takt zieht die Liste). Cloudflare erlaubt kostenlos 1.000 Listen
  // am Tag - der 30-s-Takt mit /liste waren 2.880 und hat das Konto am 07.10. um 21:04 gesperrt.
  let bkMarkeGesehen;
  let bkLetzteListe = 0;
  let bkKanNeu = true; // false: alter Briefkasten (< 0.3.0) ohne /neu - dann wie bisher jede Runde die Liste
  let bkLaeuft = false;
  async function briefkastenAnfrage(weg, opts = {}) {
    const ac = new AbortController();
    const frist = setTimeout(() => ac.abort(), opts.fristMs || 20000);
    try {
      return await fetch(bk.adresse + weg, { method: opts.method || "GET", headers: { "X-BTA-Schluessel": bk.schluessel, ...(opts.headers || {}) }, signal: ac.signal, cache: "no-store" });
    } finally { clearTimeout(frist); }
  }
  /* Automatisch einsortieren (Roll-out 66, Robertos Freigabe 07.10.: „ja freigeben und bauen“).
   * „Klar“ kann nur sein, was der Zettel mitschickt - kein Bild wird gedeutet. Regeln:
   *   AKTE   + bekannte Anlage           -> Aufnahme gleich in die Akte (nur Markierung, kein neuer Eintrag)
   *   TODO   + bekannte Anlage + Notiz   -> offenes To-do mit Foto (Kennung todo-bk-<id>)
   *   ZETTEL + Notiz                     -> Pinnwand-Zettel (Kennung notiz-bk-<id>)
   *   ARBEIT, STOERUNG                   -> immer von Hand (brauchen Datum/Dauer bzw. Zeiten/Ursache)
   * Bekannt = Name steht in der Anlagenliste (Groß/Klein egal). Je Ziel ein Schalter in
   * ⚙ Regeln & Listen (regeln.aufnahme.auto); fehlt die Regel, gilt: an.
   * Alles läuft HIER im Dienst, nicht am PC: ein Ort, die Kennungen leiten sich aus der
   * Briefkasten-Kennung ab - zweimal abholen legt nichts doppelt an. Der PC kann es
   * zurücknehmen („Zurück in die Aufnahme“). */
  const AUTO_STANDARD = { AKTE: true, TODO: true, ZETTEL: true };
  function autoEinsortieren(st, aufnahme, kennung) {
    const ziel = aufnahme.zielWunsch;
    if (!ziel || !(ziel in AUTO_STANDARD)) return null;
    const regeln = st.db.konfigWert("kalender", "regeln");
    const auto = (regeln && regeln.aufnahme && regeln.aufnahme.auto) || {};
    if (!(ziel in auto ? !!auto[ziel] : AUTO_STANDARD[ziel])) return null;
    const anlagen = st.db.konfigWert("kalender", "tpmAnlagen");
    const gesucht = String(aufnahme.name || "").trim().toLowerCase();
    const bekannt = gesucht && Array.isArray(anlagen) ? anlagen.find((a) => a && String(a.name || "").trim().toLowerCase() === gesucht) : null;
    const notiz = String(aufnahme.note || "").trim();
    const jetzt = new Date().toISOString();
    const stempel = { status: "done", ziel, sortiertAm: jetzt, sortiertVon: "automatisch" };
    if (ziel === "AKTE") {
      if (!bekannt) return null;
      Object.assign(aufnahme, stempel, { name: bekannt.name });
      return { neu: [], text: "Akte " + bekannt.name };
    }
    if (ziel === "TODO") {
      if (!bekannt || !notiz) return null;
      const zielId = "todo-bk-" + kennung;
      const todo = {
        id: zielId, category: "TODO", name: notiz.slice(0, 200), date: aufnahme.date, status: "offen",
        wer: "", bis: "", uhrzeit: "", prio: "",
        bemerkung: `Anlage ${bekannt.name} · aus der Aufnahme${aufnahme.wer ? " von " + aufnahme.wer : ""}, automatisch einsortiert`,
        erteiltVon: aufnahme.wer || "Briefkasten", ...(aufnahme.fotos.length ? { fotos: aufnahme.fotos } : {}),
        updatedAt: jetzt, geaendertVon: "Briefkasten",
      };
      Object.assign(aufnahme, stempel, { name: bekannt.name, zielId });
      return { neu: st.db.eintragVorhanden(zielId) ? [] : [todo], text: "To-do „" + notiz.slice(0, 40) + "“" };
    }
    if (ziel === "ZETTEL") {
      if (!notiz) return null;
      const zielId = "notiz-bk-" + kennung;
      const zettel = {
        id: zielId, category: "NOTIZ", name: aufnahme.wer || "Briefkasten", date: aufnahme.date, status: "open",
        note: notiz, zeit: aufnahme.zeit, farbe: "gelb", monitor: false, sichtbar: "verwalter", empfaenger: [],
        konto: aufnahme.wer || "Briefkasten", gueltigBis: "", veroeffentlicht: false,
        ...(aufnahme.fotos.length ? { fotos: aufnahme.fotos } : {}), updatedAt: jetzt, geaendertVon: "Briefkasten",
      };
      Object.assign(aufnahme, stempel, { zielId, ...(bekannt ? { name: bekannt.name } : {}) });
      return { neu: st.db.eintragVorhanden(zielId) ? [] : [zettel], text: "Pinnwand-Zettel" };
    }
    return null;
  }
  async function briefkastenAbholen(grund, { voll = false } = {}) {
    if (!bk || bkLaeuft) return briefkastenStand;
    bkLaeuft = true;
    const st = standorte[bk.standort];
    try {
      briefkastenStand.letzterTakt = new Date().toISOString();
      briefkastenStand.nachfragenGesamt++;
      // Erst die billige Marke: Liste nur bei neuer Marke, nach einem Fehler, auf Anforderung
      // oder spätestens alle listeAlleSek (Sicherheitsnetz gegen eine verpasste Marke).
      let listeNoetig = voll || bkMarkeGesehen === undefined || !!briefkastenStand.letzterFehler || Date.now() - bkLetzteListe > bk.listeAlleSek * 1000;
      if (bkKanNeu) {
        const rn = await briefkastenAnfrage("/neu");
        if (rn.status === 401) throw new Error("Briefkasten weist den Abhol-Schlüssel ab (401)");
        if (rn.status === 404) { bkKanNeu = false; listeNoetig = true; log.info("Briefkasten kennt /neu nicht (Fassung vor 0.3.0) - Liste in jedem Takt"); }
        else if (!rn.ok) throw new Error("Briefkasten antwortet " + rn.status);
        else {
          const marke = (await rn.json()).marke || null;
          if (marke !== bkMarkeGesehen) listeNoetig = true;
          bkMarkeGesehen = marke; // VOR der Liste gemerkt: ein Einwurf während der Liste ändert die Marke erneut
        }
        briefkastenStand.erreichbar = true;
      } else listeNoetig = true;
      if (!listeNoetig) { briefkastenStand.letzterFehler = null; return briefkastenStand; }
      briefkastenStand.listenGesamt++;
      bkLetzteListe = Date.now();
      const r = await briefkastenAnfrage("/liste");
      if (r.status === 401) throw new Error("Briefkasten weist den Abhol-Schlüssel ab (401)");
      if (!r.ok) throw new Error("Briefkasten antwortet " + r.status);
      const liste = (await r.json()).eintraege || [];
      briefkastenStand.erreichbar = true;
      briefkastenStand.imBriefkasten = liste.length;
      let versionNeu = null;
      for (const ein of liste) {
        const kennung = String(ein.id).replace(/[^A-Za-z0-9]/g, "");
        const id = "aufn-bk-" + kennung;
        const b = ein.begleit || {};
        const zeitRoh = new Date(b.zeit || ein.eingeworfen || Date.now());
        const zeit = Number.isNaN(zeitRoh.getTime()) ? new Date().toISOString() : zeitRoh.toISOString();
        const tag = zeit.slice(0, 10);
        if (!st.db.eintragVorhanden(id)) {
          let fotos = [];
          if (Number(ein.bytes) > 0) {
            const rb = await briefkastenAnfrage("/abholen/" + encodeURIComponent(ein.id), { fristMs: 60000 });
            if (!rb.ok) throw new Error(`Briefkasten: Bild ${ein.id} nicht lesbar (${rb.status})`);
            const bytes = Buffer.from(await rb.arrayBuffer());
            if (bytes.length !== Number(ein.bytes)) throw new Error(`Briefkasten: Bild ${ein.id} unvollständig (${bytes.length} von ${ein.bytes} Bytes)`);
            const fotoName = `foto-${tag}-bk${String(ein.id).replace(/[^a-z0-9]/gi, "")}.jpg`;
            const pfad = path.join(st.datenOrdner, "fotos", fotoName);
            fs.mkdirSync(path.dirname(pfad), { recursive: true });
            fs.writeFileSync(pfad + ".teil", bytes); fs.renameSync(pfad + ".teil", pfad);
            if (fs.statSync(pfad).size !== bytes.length) { fs.unlinkSync(pfad); throw new Error("Foto unvollständig geschrieben"); }
            fotos = [{ datei: fotoName, wer: String(b.wer || ""), ts: zeit }];
          }
          const ziel = String(b.ziel || "").toUpperCase();
          const eintrag = {
            id, date: tag, category: "AUFNAHME", name: String(b.anlage || "").slice(0, 80), status: "open",
            note: String(b.notiz || "").slice(0, 1000), fotos, wer: String(b.wer || "").slice(0, 40), zeit, quelle: "briefkasten",
            eingeworfen: ein.eingeworfen || null, updatedAt: new Date().toISOString(), geaendertVon: "Briefkasten",
            ...(["ARBEIT", "TODO", "STOERUNG", "ZETTEL", "AKTE"].includes(ziel) ? { zielWunsch: ziel } : {}),
          };
          // Automatisch einsortieren - Aufnahme und Ziel-Eintrag in EINER Änderung, damit nie
          // ein To-do ohne seine Aufnahme (oder umgekehrt) stehen bleibt.
          const auto = autoEinsortieren(st, eintrag, kennung);
          const res = st.db.aenderungenAnwenden({ benutzer: "Briefkasten", basisVersion: st.db.version(), eintraege: [eintrag, ...((auto && auto.neu) || [])] });
          versionNeu = res.version;
          if (auto) { briefkastenStand.automatischGesamt = (briefkastenStand.automatischGesamt || 0) + 1; log.info(`${st.id}: Aufnahme ${id} automatisch einsortiert -> ${auto.text}`); }
        }
        // Erst jetzt - Foto und Eintrag liegen hier - im Briefkasten löschen
        const rd = await briefkastenAnfrage("/abholen/" + encodeURIComponent(ein.id), { method: "DELETE" });
        if (!rd.ok) throw new Error(`Briefkasten: Löschen von ${ein.id} schlug fehl (${rd.status})`);
        briefkastenStand.abgeholtGesamt++;
        briefkastenStand.letzteAbholung = new Date().toISOString();
        log.info(`${st.id}: Briefkasten -> Aufnahme ${id}${b.anlage ? " (" + b.anlage + ")" : ""}${b.wer ? " von " + b.wer : ""}, ${Number(ein.bytes) || 0} Bytes`);
      }
      if (versionNeu) melde(st, versionNeu);
      briefkastenStand.imBriefkasten = 0;
      briefkastenStand.letzterFehler = null;
    } catch (x) {
      const text = x && x.name === "AbortError" ? "Briefkasten antwortet nicht (Frist)" : (x && x.message) || String(x);
      briefkastenStand.erreichbar = false;
      // Jeder Takt würde sonst dieselbe Zeile ins Protokoll schreiben - nur beim Wechsel
      if (briefkastenStand.letzterFehler !== text) log.fehler(`Briefkasten (${grund}): ${text}`);
      briefkastenStand.letzterFehler = text;
    } finally { bkLaeuft = false; }
    return briefkastenStand;
  }
  const briefkastenUhr = bk ? setInterval(() => { briefkastenAbholen("Takt"); }, bk.taktSek * 1000) : null;
  if (bk) { log.info(`Briefkasten: ${bk.adresse} -> Standort ${bk.standort}, alle ${bk.taktSek} s nachfragen, Liste bei neuer Marke oder alle ${bk.listeAlleSek} s`); setTimeout(() => briefkastenAbholen("Start"), 1500); }

  function statusDaten() {
    const out = { dienst: "bta-cockpit-dienst", fassung: FASSUNG, gestartet: new Date(START).toISOString(), laufzeitSek: Math.round((Date.now() - START) / 1000), port: e.port, standorte: {}, letzteSicherung, fehlerLetzte24h: log.fehlerLetzte24h(), appDatei: e.appDatei && fs.existsSync(e.appDatei) ? { pfad: e.appDatei, bytes: fs.statSync(e.appDatei).size, geaendert: fs.statSync(e.appDatei).mtime.toISOString() } : null, briefkasten: briefkastenStand };
    for (const st of Object.values(standorte)) out.standorte[st.id] = { name: st.name, ...st.db.zaehlen(), verbunden: st.lauscher.size, datenbank: st.db.pfad, quellen: quellenListe(path.join(st.datenOrdner, "quellen")) };
    return out;
  }

  /* Zeiten auf der Status-Seite in Serverzeit (Roberto sah am 30.09. „13:43“
   * statt 15:43 - das war die Weltzeit aus dem ISO-Stempel). Die JSON-Antwort
   * behält ISO/UTC, damit Programme eindeutig rechnen können. */
  function ortszeit(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const z = (n) => String(n).padStart(2, "0");
    return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  function statusSeite() {
    const s = statusDaten();
    const zeilen = Object.entries(s.standorte).map(([id, st]) => `<tr><td>${esc(st.name)} <small>(${esc(id)})</small></td><td>${st.version}</td><td>${st.eintraege}</td><td>${st.stoerungen}</td><td>${st.verlauf.eintraege + st.verlauf.stoerungen}</td><td>${st.system.eintraege + st.system.stoerungen}</td><td>${st.geloescht}</td><td>${(st.bytes / 1024 / 1024).toFixed(2)} MB</td><td>${st.verbunden}</td></tr>`).join("");
    const sich = s.letzteSicherung ? `${esc(ortszeit(s.letzteSicherung.zeit))} (${esc(s.letzteSicherung.grund)})` : "noch keine seit dem Start";
    const fehler = s.fehlerLetzte24h.length ? `<ul>${s.fehlerLetzte24h.slice(-10).map((f) => `<li><code>${esc(f.zeit)}</code> ${esc(f.text)}</li>`).join("")}</ul>` : "<p class=ok>keine</p>";
    const quellen = Object.entries(s.standorte).flatMap(([id, st]) => (st.quellen || []).map((q) => `<li>${esc(id)}: <code>${esc(q.name)}</code> · ${(q.bytes / 1024).toFixed(0)} kB · Stand der Vorlage ${esc(ortszeit(q.standIso))}</li>`));
    const quellenHtml = quellen.length ? `<ul>${quellen.join("")}</ul>` : "<p>noch keine - ein Cockpit-Programm mit Zugriff auf das Laufwerk spielt sie ein (⚙ → OEE → Ordner mit der Tabelle).</p>";
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>BTA-Cockpit-Dienst</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#1F2933}h1{color:#1E2761}table{border-collapse:collapse}td,th{padding:6px 12px;border-bottom:1px solid #E5E9ED;text-align:left}th{font-size:12px;text-transform:uppercase;color:#5B6572}.ok{color:#1F7A3D;font-weight:bold}code{background:#EEF1F4;padding:0 4px}</style></head>
<body><h1>BTA-Cockpit-Dienst <small style="color:#5B6572;font-size:14px">Fassung ${esc(s.fassung)} · Port ${s.port}</small></h1>
<p>Läuft seit ${esc(ortszeit(s.gestartet))} Uhr (${Math.round(s.laufzeitSek / 60)} min). Letzte Sicherung: ${sich}.</p>
<table><tr><th>Standort</th><th>Version</th><th>Einträge</th><th>Störberichte</th><th>Verlauf</th><th>Einstellungen</th><th>gelöscht</th><th>Datenbank</th><th>verbunden</th></tr>${zeilen}</table>
<p><small>Einträge und Störberichte wie die Kennkarte der App: nur fachliche Zeilen. Verlauf = Zeilen „wer hat wann was geändert“ (90 Tage), Einstellungen = Team, Anlagen, Listen.</small></p>
<h2>Fehler der letzten 24 Stunden</h2>${fehler}
<h2>Excel-Quellen</h2>${quellenHtml}
<h2>Briefkasten (Aufnahme vom Handy über das Internet)</h2>${s.briefkasten.aktiv
    ? `<p>${esc(s.briefkasten.adresse)} → Standort <code>${esc(s.briefkasten.standort)}</code> · ${s.briefkasten.erreichbar === null ? "noch nicht abgefragt" : s.briefkasten.erreichbar ? '<span class=ok>erreichbar</span>' : '<strong style="color:#B23A34">nicht erreichbar</strong>'}${s.briefkasten.letzterTakt ? ` · letzter Takt ${esc(ortszeit(s.briefkasten.letzterTakt))}` : ""}</p>
<p>${s.briefkasten.abgeholtGesamt} Aufnahme(n) seit dem Start abgeholt${s.briefkasten.letzteAbholung ? `, zuletzt ${esc(ortszeit(s.briefkasten.letzteAbholung))}` : ""}, davon ${s.briefkasten.automatischGesamt || 0} automatisch einsortiert · ${s.briefkasten.nachfragenGesamt || 0} Nachfragen seit dem Start, davon ${s.briefkasten.listenGesamt || 0} Listen (Cloudflare: 1.000 Listen am Tag frei) · im Briefkasten liegen ${s.briefkasten.imBriefkasten === null ? "?" : s.briefkasten.imBriefkasten}${s.briefkasten.letzterFehler ? `<br><strong style="color:#B23A34">Fehler:</strong> ${esc(s.briefkasten.letzterFehler)}` : ""}</p>`
    : "<p>nicht eingerichtet (einstellungen.json → briefkasten: adresse, schluessel, standort).</p>"}
<h2>App</h2><p>${s.appDatei ? `<a href="/app/">/app/</a> · ${(s.appDatei.bytes / 1024).toFixed(0)} kB · Stand ${esc(ortszeit(s.appDatei.geaendert))}` : "keine App-Datei hinterlegt"}</p>
<p><small>JSON: <a href="/api/status">/api/status</a></small></p></body></html>`;
  }

  async function behandle(req, res) {
    const u = url.parse(req.url, true);
    const teile = u.pathname.split("/").filter(Boolean);
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-BTA-Schluessel" }); return res.end(); }
    try {
      if (teile.length === 0) { res.writeHead(302, { Location: "/status" }); return res.end(); }
      if (teile[0] === "status") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); return res.end(statusSeite()); }
      if (teile[0] === "app") {
        if (!e.appDatei || !fs.existsSync(e.appDatei)) return json(res, 404, { fehler: "Keine App-Datei hinterlegt" });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        return fs.createReadStream(e.appDatei).pipe(res);
      }
      // Der Aufnahme-Zettel (0.5.0): liegt als aufnahme-zettel.html neben der App-Datei.
      // Im WLAN einmal laden, dann "Zum Startbildschirm" - danach läuft er auf dem Handy.
      if (teile[0] === "zettel") {
        const zettel = e.appDatei ? path.join(path.dirname(e.appDatei), "aufnahme-zettel.html") : null;
        if (!zettel || !fs.existsSync(zettel)) return json(res, 404, { fehler: "Kein Aufnahme-Zettel hinterlegt (aufnahme-zettel.html neben der App-Datei)" });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        return fs.createReadStream(zettel).pipe(res);
      }
      if (teile[0] !== "api") return json(res, 404, { fehler: "Unbekannter Weg" });
      if (teile[1] === "status") return json(res, 200, statusDaten());
      const st = standorte[teile[1]];
      if (!st) return json(res, 404, { fehler: "Unbekannter Standort: " + teile[1], bekannt: Object.keys(standorte) });
      const weg = teile[2] || "";
      // Schreibende Wege nur mit Werkstatt-Schlüssel (wenn einer gesetzt ist).
      if ((req.method === "POST" || req.method === "DELETE") && e.schluessel && String(req.headers["x-bta-schluessel"] || "") !== e.schluessel) {
        log.info(`${req.method} ${u.pathname} abgewiesen: Werkstatt-Schlüssel fehlt oder falsch`);
        return json(res, 401, { fehler: "Werkstatt-Schlüssel fehlt oder ist falsch" });
      }

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
        /* Standort-Wächter (Etappe B): die Datei trägt ihren Standort („scheurich“).
           Eine Scheurich-Datei in die Soendgen-Datenbank wäre der Fehler vom
           03.08. in neuem Gewand - nur mit ?erzwingen=1 erlaubt. */
        if (datei && datei.standort && datei.standort !== st.id && u.query.erzwingen !== "1") {
          throw new Error(`Import: Datei gehört zu Standort „${datei.standort}“, Ziel ist „${st.id}“ (erzwingen=1 überschreibt)`);
        }
        const nurPruefen = u.query.nurPruefen === "1";
        const vorher = st.db.zaehlen();
        const r = st.db.importV1(datei, { bereich: u.query.bereich, benutzer: u.query.benutzer || "import", nurPruefen });
        const kopf = { format: datei.format || null, standort: datei.standort || null, savedAt: datei.savedAt || null, schreibMarke: datei.schreibMarke || null, bauStand: datei.bauStand || null };
        if (nurPruefen) {
          log.info(`${st.id}: Import-Vorschau ${r.tabelle}: ${r.gelesen} gelesen, ${r.neu} neu, ${r.geaendert} geändert, ${r.unveraendert} unverändert, ${r.geloescht} gelöscht, ${r.konfig} Konfig - nichts geschrieben`);
          return json(res, 200, { ...r, kopf, stand: { vorher, nachher: vorher } });
        }
        if (r.neu + r.geaendert + r.geloescht + r.konfig > 0) melde(st, r.version);
        /* Nachweis (Bauplan Abschnitt 8, Etappe B): sofort zurücklesen und
           Eintrag für Eintrag mit der eingelesenen Datei vergleichen. */
        const nachweis = vergleicheV1(datei, st.db.exportV1(r.tabelle === "stoerungen" ? "stoerungen" : "kalender"));
        const nachher = st.db.zaehlen();
        log.info(`${st.id}: Import ${r.tabelle}: ${r.gelesen} gelesen, ${r.neu} neu, ${r.geaendert} geändert, ${r.unveraendert} unverändert, ${r.geloescht} gelöscht, ${r.konfig} Konfig -> Version ${r.version}; Nachweis ${nachweis.abweichungen} Abweichungen`);
        if (nachweis.abweichungen > 0) log.fehler(`${st.id}: Import-Nachweis ${r.tabelle}: ${nachweis.abweichungen} Abweichungen - ${nachweis.beispiele.slice(0, 3).join("; ")}`);
        return json(res, 200, { ...r, kopf, nachweis, stand: { vorher, nachher } });
      }
      if (weg === "sicherung" && req.method === "POST") return json(res, 200, sicherungJetzt("auf Anforderung"));
      // Briefkasten jetzt abholen (Werkzeug-Knopf „Prüfen", Prüfstand) - statt auf den Takt zu warten
      if (weg === "briefkasten" && req.method === "POST") { if (!bk) return json(res, 400, { fehler: "Kein Briefkasten eingerichtet" }); return json(res, 200, await briefkastenAbholen("auf Anforderung", { voll: true })); }
      if (weg === "fotos") {
        const name = decodeURIComponent(teile[3] || "");
        if (!FOTO_NAME.test(name)) return json(res, 400, { fehler: "Foto: ungültiger Dateiname" });
        const pfad = path.join(st.datenOrdner, "fotos", name);
        if (req.method === "GET") {
          if (!fs.existsSync(pfad)) return json(res, 404, { fehler: "Foto nicht gefunden" });
          const typ = FOTO_TYPEN[path.extname(name).toLowerCase()] || "application/octet-stream";
          res.writeHead(200, { "Content-Type": typ, "Content-Length": fs.statSync(pfad).size, "Cache-Control": "private, max-age=3600", "Access-Control-Allow-Origin": "*" });
          return fs.createReadStream(pfad).pipe(res);
        }
        if (req.method === "POST") {
          const bytes = await rohLesen(req);
          if (!bytes.length) return json(res, 400, { fehler: "Foto: leere Datei" });
          fs.mkdirSync(path.dirname(pfad), { recursive: true });
          // Erst in eine Zwischendatei, dann umbenennen - nie eine halbe Bilddatei unter dem echten Namen.
          const zwischen = pfad + ".teil";
          fs.writeFileSync(zwischen, bytes);
          fs.renameSync(zwischen, pfad);
          const groesse = fs.statSync(pfad).size; // Kontroll-Lesung wie bei der Datei-Fassung
          if (groesse !== bytes.length) { fs.unlinkSync(pfad); throw new Error("Foto unvollständig geschrieben"); }
          log.info(`${st.id}: Foto ${name} (${groesse} Bytes) von ${u.query.benutzer || "?"}`);
          return json(res, 200, { name, bytes: groesse });
        }
        if (req.method === "DELETE") {
          if (fs.existsSync(pfad)) fs.unlinkSync(pfad);
          log.info(`${st.id}: Foto ${name} gelöscht`);
          return json(res, 200, { name, geloescht: true });
        }
      }
      if (weg === "quellen") {
        const ordner = path.join(st.datenOrdner, "quellen");
        if (teile.length === 3) {
          if (req.method !== "GET") return json(res, 405, { fehler: "Quellen: Liste nur lesen" });
          return json(res, 200, { quellen: quellenListe(ordner) });
        }
        const name = decodeURIComponent(teile[3] || "");
        if (!quelleGueltig(name)) return json(res, 400, { fehler: "Quelle: ungültiger Dateiname (nur .xlsx/.xlsm/.xls/.csv, kein Pfad)" });
        const pfad = path.join(ordner, name);
        if (req.method === "GET") {
          if (!fs.existsSync(pfad)) return json(res, 404, { fehler: `Quelle „${name}“ liegt noch nicht auf dem Server` });
          const stat = fs.statSync(pfad);
          res.writeHead(200, { "Content-Type": QUELLE_TYPEN[path.extname(name).toLowerCase()], "Content-Length": stat.size, "Last-Modified": new Date(stat.mtimeMs).toUTCString(), "X-BTA-Stand": String(Math.round(stat.mtimeMs)), "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-BTA-Stand, Last-Modified" });
          return fs.createReadStream(pfad).pipe(res);
        }
        if (req.method === "POST") {
          const bytes = await rohLesen(req, MAX_QUELLE);
          if (!bytes.length) return json(res, 400, { fehler: "Quelle: leere Datei" });
          const stand = Number(u.query.stand) || Date.now();
          fs.mkdirSync(ordner, { recursive: true });
          // Zwischendatei, dann Umbenennen - ein Leser bekommt nie eine halbe Mappe.
          const zwischen = pfad + ".teil";
          fs.writeFileSync(zwischen, bytes);
          fs.utimesSync(zwischen, new Date(), new Date(stand));
          fs.renameSync(zwischen, pfad);
          const st2 = fs.statSync(pfad);
          if (st2.size !== bytes.length) { fs.unlinkSync(pfad); throw new Error("Quelle unvollständig geschrieben"); }
          log.info(`${st.id}: Excel-Quelle ${name} (${st2.size} Bytes, Stand der Vorlage ${new Date(stand).toISOString()}) von ${u.query.benutzer || "?"}`);
          return json(res, 200, { name, bytes: st2.size, stand: Math.round(st2.mtimeMs) });
        }
        if (req.method === "DELETE") {
          if (fs.existsSync(pfad)) fs.unlinkSync(pfad);
          log.info(`${st.id}: Excel-Quelle ${name} entfernt`);
          return json(res, 200, { name, geloescht: true });
        }
      }
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
          clearInterval(sicherungsUhr); clearInterval(herzschlag); if (briefkastenUhr) clearInterval(briefkastenUhr);
          for (const st of Object.values(standorte)) { for (const r of st.lauscher) { try { r.end(); } catch (x) { /* egal */ } } st.lauscher.clear(); }
          await new Promise((r) => server.close(() => r()));
          for (const st of Object.values(standorte)) st.db.schliessen();
          log.info("Dienst gestoppt.");
        },
      });
    });
  });
}

const FASSUNG = "0.6.1"; // 0.2.x = Etappe B (Import); 0.3.0 = Etappe C: Werkstatt-Schlüssel, Fotos über den Server, letzte Sicherung aus dem Ordner (30.09.); 0.4.0 = Excel-Quellen auf dem Server (02.10.); 0.5.0 = Briefkasten-Abholer (06.10.); 0.6.0 = automatisches Einsortieren aus dem Briefkasten (07.10.); 0.6.1 = Marke statt Liste im Takt (Cloudflare-Kontingent, 08.10.)

/* Import-Nachweis: eingelesene Datei gegen den Export aus der Datenbank.
   Einträge Feld für Feld (JSON-Text je id), Löschliste nach Kennung, Konfig je
   Schlüssel. Einträge ohne id zählen nicht - sie kann der Import nicht
   aufnehmen (die Zählung weist sie als ohneId aus). */
function vergleicheV1(datei, exportiert) {
  const beispiele = [];
  let abweichungen = 0;
  const merke = (t) => { abweichungen++; if (beispiele.length < 10) beispiele.push(t); };
  const exp = new Map((exportiert.entries || []).map((e) => [String(e.id), JSON.stringify(e)]));
  // Ein Durchgang: je id der LETZTE Eintrag der Datei zählt (wie beim Import).
  // Nicht je id die Liste absuchen - das war bei 17.000 Einträgen quadratisch (10 s, gemessen 30.09.).
  const gesehen = new Map();
  for (const e of datei.entries || []) { if (e && e.id != null) gesehen.set(String(e.id), e); }
  // Dieselbe Regel wie Import und App: Löschmarke >= updatedAt -> gelöscht, sonst lebt der Eintrag.
  const loeschliste = datei.deleted && typeof datei.deleted === "object" ? datei.deleted : {};
  const tot = (id) => { const am = loeschliste[id]; const e = gesehen.get(id); return !!am && (!e || String(am) >= String(e.updatedAt || "")); };
  for (const [id, letzte] of gesehen) {
    if (tot(id)) { if (exp.has(id)) merke(`Eintrag ${id} steht mit jüngerer Löschmarke in der Löschliste, ist im Export aber noch da`); continue; }
    if (!exp.has(id)) { merke(`Eintrag ${id} fehlt im Export`); continue; }
    if (exp.get(id) !== JSON.stringify(letzte)) merke(`Eintrag ${id} unterscheidet sich`);
  }
  for (const id of exp.keys()) if (!gesehen.has(id) || tot(id)) merke(`Eintrag ${id} ist im Export, aber nicht (lebend) in der Datei`);
  for (const id of Object.keys(loeschliste)) if (tot(id) && !(exportiert.deleted || {})[id]) merke(`Löschliste: ${id} fehlt im Export`);
  for (const [k, w] of Object.entries(datei.config || {})) if (JSON.stringify((exportiert.config || {})[k]) !== JSON.stringify(w)) merke(`Konfig „${k}“ unterscheidet sich`);
  return { abweichungen, beispiele, eintraegeVerglichen: gesehen.size, exportEintraege: exp.size };
}

module.exports = { starten, ladeEinstellungen, vergleicheV1, FASSUNG };

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
