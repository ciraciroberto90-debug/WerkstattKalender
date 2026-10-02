// Speicherschicht NEU (Etappe C des Bauplans, doku/BAUPLAN-SERVER-SYSTEM.md):
// Die App spricht mit dem BTA-Cockpit-Dienst statt mit der Datei auf W:.
//
// Was hier bewusst GLEICH bleibt wie in sharedfile.js: die Methodennamen, die
// Ereignisse ("werkstatt-shared-update" usw.) und die Regeln des Zusammen-
// führens (mergeEntries, stampEntries, Verlaufszeilen). Die Oberfläche merkt
// keinen Unterschied - nur der Weg dahinter ist ein anderer:
//
//   - Der Bestand liegt im Dienst (SQLite je Standort). Der Rechner hält
//     einen ÖRTLICHEN SPIEGEL in IndexedDB (nicht localStorage: der ist bei
//     ~5 MB zu Ende, und die Werkstatt ist mit 4,6 + 4,3 MB schon dort).
//   - Beim Start: Spiegel laden, dann nur das DELTA seit der gemerkten Version
//     holen (gemessen 30.09.: 4 ms / 246 Bytes nach einer Änderung).
//   - Speichern = ein Bündel Änderungen mit Basis-Version. Sagt der Dienst 409
//     (jemand war schneller), entscheidet dieselbe Zeitstempel-Regel wie heute
//     und die App bekommt den gelben Kollisions-Hinweis SOFORT.
//   - Live: Server-Sent Events "es gibt Version X" -> Delta holen -> Ereignis
//     an die App. Kein 30-Sekunden-Abgleich mehr.
//   - Fehlt der Server: weiterarbeiten auf dem Spiegel, Änderungen kommen in
//     eine Warteschlange (IndexedDB) und gehen raus, sobald er wieder da ist.
//
// Der Server-Betrieb schaltet sich über die Adresse ein (siehe serverAdresse):
// aufgerufen als http://v-btacockpit-01:8765/app/, über ?server=… oder über
// den gemerkten Schlüssel "bta-server:url". Ohne Adresse läuft alles wie
// bisher über die Datei.

const URL_KEY = "bta-server:url";
const SCHLUESSEL_KEY = "bta-server:schluessel";
const IDB_NAME = "bta-server-spiegel";
const IDB_STORE = "spiegel";
const LOG_PREFIX = "log|";
const CONFIG_PREFIX = "config|";

/* Wo läuft der Dienst? null = kein Server-Betrieb (Datei wie bisher). */
export function serverAdresse() {
  if (typeof window === "undefined" || !window.location) return null;
  try {
    const q = new URLSearchParams(window.location.search || "");
    const ausUrl = (q.get("server") || "").trim();
    // Der Werkstatt-Schlüssel kommt einmal über die Adresse mit (Programm-Hülle,
    // Verknüpfung) - merken und aus der Adresse nehmen, damit er nirgends stehen bleibt.
    const schluesselAusUrl = (q.get("schluessel") || "").trim();
    if (q.has("schluessel")) {
      if (schluesselAusUrl) setzeWerkstattSchluessel(schluesselAusUrl);
      try { q.delete("schluessel"); const rest = q.toString(); window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : "") + window.location.hash); } catch (e) { /* egal */ }
    }
    if (ausUrl === "aus") { try { localStorage.removeItem(URL_KEY); } catch (e) { /* egal */ } return null; }
    if (/^https?:\/\//.test(ausUrl)) {
      const adresse = ausUrl.replace(/\/+$/, "");
      try { localStorage.setItem(URL_KEY, adresse); } catch (e) { /* egal */ }
      return adresse;
    }
    const gemerkt = (localStorage.getItem(URL_KEY) || "").trim();
    if (/^https?:\/\//.test(gemerkt)) return gemerkt.replace(/\/+$/, "");
    // Vom Dienst selbst ausgeliefert (http://server:8765/app/): der Server ist die Herkunft.
    if (/^https?:$/.test(window.location.protocol) && /^\/app(\/|$)/.test(window.location.pathname || "")) return String(window.location.origin);
  } catch (e) { /* kein Zugriff auf localStorage o. ä. */ }
  return null;
}

export function werkstattSchluessel() {
  try { return (localStorage.getItem(SCHLUESSEL_KEY) || "").trim(); } catch (e) { return ""; }
}
export function setzeWerkstattSchluessel(s) {
  try { if (s) localStorage.setItem(SCHLUESSEL_KEY, String(s).trim()); else localStorage.removeItem(SCHLUESSEL_KEY); } catch (e) { /* egal */ }
}

/* ---------- IndexedDB-Spiegel (mit Frist - der Start darf nie hängen) ---------- */
function idbOeffnen() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("keine IndexedDB"));
    const frist = setTimeout(() => reject(new Error("IndexedDB antwortet nicht (Frist)")), 4000);
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onblocked = () => { clearTimeout(frist); reject(new Error("IndexedDB blockiert")); };
    req.onsuccess = () => { clearTimeout(frist); resolve(req.result); };
    req.onerror = () => { clearTimeout(frist); reject(req.error || new Error("IndexedDB-Fehler")); };
  });
}
async function idbLesen(schluessel) {
  const db = await idbOeffnen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const r = tx.objectStore(IDB_STORE).get(schluessel);
      r.onsuccess = () => resolve(r.result === undefined ? null : r.result);
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
async function idbSchreiben(schluessel, wert) {
  const db = await idbOeffnen();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(wert, schluessel);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

const istLog = (e) => !!e && String(e.id || "").startsWith(LOG_PREFIX);
const istConfig = (e) => !!e && String(e.id || "").startsWith(CONFIG_PREFIX);

/* cfg: { standort, bereich: "kalender"|"stoerungen", entriesKey, configKey, evPrefix, adresse }
   helfer: aus sharedfile.js - mergeEntries, stampEntries, macheLogEintrag,
   benenneEintrag, ohneSystemEntries, extractLogEntries, werBinIch, nowISO
   (dieselben Regeln wie die Datei, deshalb hier keine zweite Fassung davon). */
export function createServerStore(cfg, helfer) {
  const H = helfer;
  const BASIS = cfg.adresse;
  const STANDORT = cfg.standort || "scheurich";
  const BEREICH = cfg.bereich === "stoerungen" ? "stoerungen" : "kalender";
  const TABELLE = BEREICH === "stoerungen" ? "stoerungen" : "eintraege";
  const EV = cfg.evPrefix;
  const ENTRIES_KEY = cfg.entriesKey;
  const SPIEGEL_KEY = `${STANDORT}:${BEREICH}`;
  const WARTE_KEY = `${STANDORT}:${BEREICH}:warteschlange`;
  const API = `${BASIS}/api/${STANDORT}`;
  const HOST = (() => { try { return new URL(BASIS).host; } catch (e) { return BASIS; } })();

  // Der örtliche Spiegel: alle lebenden Zeilen des Dienstes (fachlich + Verlauf),
  // Einstellungen aus der konfig-Tabelle, Version des Standes.
  const spiegel = { version: 0, entries: new Map(), config: {}, deleted: {} };
  let bereitAufloesen = null;
  const bereit = new Promise((r) => { bereitAufloesen = r; }); // erfüllt, sobald der Start durch ist (mit oder ohne Server)
  let gestartet = false;
  let erreichbar = false;       // letzte Antwort des Dienstes war gut
  let lastWriteError = null;
  let lastSuccessfulSyncAt = null;
  let letzteAntwortMs = null;
  let eventSource = null;
  let nachholTimer = null;
  let warteschlange = [];       // [{ bündel }] - nicht zugestellte Änderungen
  let schreibKette = Promise.resolve();
  const startMessung = { begonnen: null, verweis: null, rechte: null, lesen: null, abgleich: null, gesamt: null, geschrieben: null, groesse: null, status: null, phase: null, vorher: null };
  const PHASEN_NAMEN = { spiegel: "örtlichen Spiegel laden", server: "Stand vom Server holen", abgleich: "Zusammenführen", warteschlange: "Wartende Änderungen senden", fertig: "fertig" };

  /* ---------- Ereignisse ---------- */
  const dispatch = (name, detail) => { try { window.dispatchEvent(new CustomEvent(EV + name, detail === undefined ? undefined : { detail })); } catch (e) { /* egal */ } };
  const dispatchError = (m) => { lastWriteError = m; dispatch("-error", m); };
  const dispatchOk = () => dispatch("-ok");
  const dispatchInfo = (m) => dispatch("-info", m);

  const lebende = () => [...spiegel.entries.values()].filter((e) => !istConfig(e));
  const fachliche = () => lebende().filter((e) => !istLog(e));
  function dispatchUpdate() {
    const liste = lebende();
    spiegelnInLocalStorage(liste);
    dispatch("-update", { entries: H.ohneSystemEntries(liste), config: Object.keys(spiegel.config).length ? { ...spiegel.config } : null, deleted: { ...spiegel.deleted }, verlauf: H.extractLogEntries(liste), version: spiegel.version });
  }
  // Best-effort-Spiegel in localStorage (die App liest an zwei Stellen dort
  // direkt; ist der Zwischenspeicher voll, bleibt der IndexedDB-Spiegel maßgeblich).
  function spiegelnInLocalStorage(liste) {
    try { localStorage.setItem(ENTRIES_KEY, JSON.stringify(H.ohneSystemEntries(liste))); } catch (e) { /* voll - egal, IndexedDB hat den Stand */ }
  }

  /* ---------- HTTP ---------- */
  async function anfrage(weg, opts = {}) {
    const t0 = Date.now();
    const kopf = { ...(opts.headers || {}) };
    if (opts.body !== undefined) { kopf["Content-Type"] = "application/json"; }
    const schluessel = werkstattSchluessel();
    if (schluessel) kopf["X-BTA-Schluessel"] = schluessel;
    const steuer = new AbortController();
    const frist = setTimeout(() => steuer.abort(), opts.fristMs || 20000);
    try {
      const r = await fetch(weg, { method: opts.method || "GET", headers: kopf, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: steuer.signal, cache: "no-store" });
      const text = await r.text();
      let daten = null;
      try { daten = text ? JSON.parse(text) : null; } catch (e) { daten = { fehler: "Antwort ist kein JSON" }; }
      letzteAntwortMs = Date.now() - t0;
      erreichbar = true;
      return { status: r.status, daten };
    } catch (e) {
      erreichbar = false;
      throw new Error("Server nicht erreichbar: " + (e && e.name === "AbortError" ? "keine Antwort binnen " + Math.round((opts.fristMs || 20000) / 1000) + " s" : (e && e.message) || String(e)));
    } finally { clearTimeout(frist); }
  }

  /* ---------- Spiegel: laden, anwenden, sichern ---------- */
  async function spiegelLaden() {
    try {
      const roh = await idbLesen(SPIEGEL_KEY);
      if (roh && typeof roh === "object" && Array.isArray(roh.entries)) {
        spiegel.version = Number(roh.version) || 0;
        spiegel.entries = new Map(roh.entries.map((e) => [String(e.id), e]));
        spiegel.config = roh.config && typeof roh.config === "object" ? roh.config : {};
        spiegel.deleted = roh.deleted && typeof roh.deleted === "object" ? roh.deleted : {};
      }
      const w = await idbLesen(WARTE_KEY);
      if (Array.isArray(w)) warteschlange = w;
    } catch (e) { /* ohne Spiegel: Vollbestand vom Server */ }
  }
  let sicherTimer = null;
  function spiegelSichernBald() {
    if (sicherTimer) clearTimeout(sicherTimer);
    sicherTimer = setTimeout(spiegelSichern, 250);
  }
  async function spiegelSichern() {
    sicherTimer = null;
    try { await idbSchreiben(SPIEGEL_KEY, { version: spiegel.version, entries: [...spiegel.entries.values()], config: spiegel.config, deleted: spiegel.deleted, gesichert: H.nowISO() }); } catch (e) { /* egal */ }
  }
  async function warteschlangeSichern() {
    try { await idbSchreiben(WARTE_KEY, warteschlange); } catch (e) { /* egal */ }
  }
  /* Delta oder Vollbestand vom Dienst in den Spiegel einarbeiten. */
  function standAnwenden(stand) {
    const zeilen = stand[TABELLE] || [];
    const geloescht = (stand.geloescht && stand.geloescht[TABELLE]) || [];
    const konfig = (stand.konfig && stand.konfig[BEREICH]) || {};
    if (Number(stand.seit) === 0) { spiegel.entries = new Map(); spiegel.deleted = {}; spiegel.config = {}; }
    for (const e of zeilen) if (e && e.id != null) { spiegel.entries.set(String(e.id), e); delete spiegel.deleted[String(e.id)]; }
    for (const g of geloescht) { spiegel.entries.delete(String(g.id)); spiegel.deleted[String(g.id)] = g.am || H.nowISO(); }
    for (const [k, w] of Object.entries(konfig)) spiegel.config[k] = w;
    spiegel.version = Number(stand.version) || spiegel.version;
    return zeilen.length + geloescht.length + Object.keys(konfig).length;
  }
  let warUnerreichbar = false; // für die grüne Meldung, wenn der Server zurück ist
  async function deltaHolen() {
    const seit = spiegel.version;
    let r;
    try { r = await anfrage(`${API}/stand?seit=${seit}`); } catch (x) { warUnerreichbar = true; throw x; }
    if (r.status !== 200 || !r.daten) throw new Error("Stand nicht lesbar (" + r.status + ")");
    const n = standAnwenden(r.daten);
    lastSuccessfulSyncAt = H.nowISO();
    if (n > 0 || seit === 0) { spiegelSichernBald(); dispatchUpdate(); }
    if (warUnerreichbar) { warUnerreichbar = false; if (!warteschlange.length) { dispatchOk(); dispatchInfo("Der Server " + HOST + " ist wieder erreichbar."); } }
    return n;
  }

  /* ---------- Fotos über den Server (Bauplan Entscheidung 5) ---------- */
  const fotoWeg = (name) => `${API}/fotos/${encodeURIComponent(name)}`;
  async function fotoSpeichern(dateiName, blob) {
    const kopf = {}; const s = werkstattSchluessel(); if (s) kopf["X-BTA-Schluessel"] = s;
    const r = await fetch(fotoWeg(dateiName) + "?benutzer=" + encodeURIComponent(H.werBinIch()), { method: "POST", headers: kopf, body: blob, cache: "no-store" });
    if (r.status === 401) throw new Error("Foto abgewiesen: Werkstatt-Schlüssel fehlt oder ist falsch.");
    if (!r.ok) throw new Error("Foto nicht gespeichert (" + r.status + ")");
    const antwort = await r.json();
    // Kontroll-Lesung wie bei der Datei-Fassung: erst wenn die Bytes zurückkommen, gilt „gespeichert“.
    const probe = await fetch(fotoWeg(dateiName), { cache: "no-store" });
    const groesse = probe.ok ? (await probe.blob()).size : 0;
    if (groesse !== blob.size || antwort.bytes !== blob.size) throw new Error(`Die Fotodatei „${dateiName}" ist auf dem Server nicht vollständig (${groesse} von ${blob.size} Bytes).`);
    return true;
  }
  async function fotoLesen(dateiName) {
    try {
      const r = await fetch(fotoWeg(dateiName));
      if (!r.ok) return null;
      const blob = await r.blob();
      return new File([blob], dateiName, { type: blob.type || "image/jpeg" });
    } catch (e) { return null; }
  }
  async function fotoLoeschen(dateiName) {
    try {
      const kopf = {}; const s = werkstattSchluessel(); if (s) kopf["X-BTA-Schluessel"] = s;
      const r = await fetch(fotoWeg(dateiName), { method: "DELETE", headers: kopf });
      return r.ok;
    } catch (e) { return false; }
  }

  /* ---------- Excel-Quellen (Roll-out 54, 02.10.) ----------
     Die App LIEST Tabellen (OEE heute, Budget-Ist morgen). Im Server-Betrieb
     gibt es zwei Wege zu ihnen, und beide gehen durch dieselben Methoden wie
     in der Datei-Fassung (leseAusOrdner, listeOrdnerDateien, …):
       1. Die KOPIE auf dem Server (api/<standort>/quellen). Sie liest jeder -
          Browser, Monitor, Programm. Der Dienst selbst kommt nicht an W: heran
          (Konto SYSTEM, Befund 30.09.), die Kopie muss also jemand hinbringen.
       2. Der ZUBRINGER: läuft die App im Programm (Brücke __werkstattDesktop)
          und hat einen Quellordner auf dem Laufwerk gemerkt (derselbe Schlüssel
          wie in der Datei-Fassung, deshalb muss niemand ihn neu wählen), liest
          sie die Tabelle direkt von dort - und spielt sie auf den Server, wenn
          die Kopie dort fehlt oder älter ist. So reicht EIN Rechner mit
          Laufwerkszugriff, damit alle die aktuelle Zahl sehen. */
  const bruecke = () => (typeof window !== "undefined" && window.__werkstattDesktop) || null;
  const QUELL_SCHLUESSEL = (cfg.dbName || `werkstatt-${BEREICH}-fs`) + ":quellordner";
  let quellPfad = null;          // gemerkter Ordner auf dem Laufwerk (nur Programm)
  let quellPfadGeladen = false;
  let quellenAufServer = null;   // letzte Liste vom Server (Name -> {bytes, stand})
  const quelleWeg = (name) => `${API}/quellen/${encodeURIComponent(name)}`;
  const pfadVerbinden = (basis, name) => { const b = String(basis); const t = b.includes("\\") ? "\\" : "/"; return (b.endsWith(t) ? b : b + t) + String(name); };
  const ordnerName = (pfad) => String(pfad).split(/[\\/]/).filter(Boolean).pop() || String(pfad);
  async function quellPfadLaden() {
    if (quellPfadGeladen) return quellPfad;
    quellPfadGeladen = true;
    const d = bruecke();
    if (d && typeof d.gemerkt === "function") { try { quellPfad = (await d.gemerkt(QUELL_SCHLUESSEL)) || null; } catch (e) { quellPfad = null; } }
    return quellPfad;
  }
  async function quellenListeHolen() {
    const r = await anfrage(`${API}/quellen`, { fristMs: 8000 });
    if (r.status !== 200 || !r.daten) throw new Error("Quellen-Liste nicht lesbar (" + r.status + ")");
    quellenAufServer = new Map((r.daten.quellen || []).map((q) => [q.name, q]));
    return quellenAufServer;
  }
  async function quelleVomServer(name) {
    const r = await fetch(quelleWeg(name), { cache: "no-store" });
    if (r.status === 404) {
      const e = new Error(`„${name}" liegt noch nicht auf dem Server ${HOST}. Sie kommt dorthin, sobald ein Cockpit-Programm mit Zugriff auf das Laufwerk läuft (⚙ → OEE → Ordner mit der Tabelle).`);
      e.name = "NotFoundError"; e.quellenHinweis = true; throw e;
    }
    if (!r.ok) throw new Error(`Quelle „${name}" nicht lesbar (${r.status})`);
    const blob = await r.blob();
    const stand = Number(r.headers.get("X-BTA-Stand")) || Date.now();
    erreichbar = true;
    return new File([blob], name, { type: blob.type || "", lastModified: stand });
  }
  /* Zubringer: Datei vom Laufwerk lesen und - wenn der Server sie nicht oder
     älter hat - einspielen. Gibt die Datei zurück, oder null, wenn sie am
     gemerkten Ort nicht liegt (dann gilt die Server-Kopie). Ein Fehlschlag beim
     Hochladen ist kein Grund, die Zahl nicht zu zeigen: die Datei ist ja da. */
  async function zubringer(name) {
    const d = bruecke();
    const pfad = await quellPfadLaden();
    if (!d || !pfad) return null;
    let kurz = null;
    try { kurz = typeof d.stat === "function" ? await d.stat(pfadVerbinden(pfad, name)) : null; } catch (e) { kurz = null; }
    const voll = kurz ? null : await d.lese(pfadVerbinden(pfad, name)).catch(() => null);
    if (!kurz && !voll) return null;
    const stand = Math.round((kurz || voll).geaendert);
    const groesse = (kurz || voll).groesse;
    let liste = quellenAufServer;
    try { liste = await quellenListeHolen(); } catch (e) { liste = quellenAufServer; }
    const dort = liste && liste.get(name);
    const istNeuer = !dort || Number(dort.stand) < stand || Number(dort.bytes) !== groesse;
    let bytes = voll ? voll.bytes : null;
    if (istNeuer) {
      try {
        if (!bytes) { const r = await d.lese(pfadVerbinden(pfad, name)); if (!r) return null; bytes = r.bytes; }
        const kopf = {}; const s = werkstattSchluessel(); if (s) kopf["X-BTA-Schluessel"] = s;
        const r = await fetch(quelleWeg(name) + `?stand=${stand}&benutzer=${encodeURIComponent(H.werBinIch())}`, { method: "POST", headers: kopf, body: new Blob([bytes]), cache: "no-store" });
        if (r.ok) { const a = await r.json(); if (quellenAufServer) quellenAufServer.set(name, { name, bytes: a.bytes, stand: a.stand }); }
        else dispatchError(r.status === 401 ? `Die Tabelle „${name}" konnte nicht auf den Server: Werkstatt-Schlüssel fehlt oder ist falsch.` : `Die Tabelle „${name}" konnte nicht auf den Server (${r.status}).`);
      } catch (e) { /* Server nicht erreichbar - die Datei vom Laufwerk zählt trotzdem */ }
    }
    if (bytes) return new File([bytes], name, { lastModified: stand });
    // Unverändert und noch nicht gelesen: die Bytes erst holen, wenn jemand sie
    // wirklich braucht. Der OEE-Takt vergleicht jede Minute nur Stand und Größe -
    // eine Mappe mit tausenden Zeilen dafür jedes Mal über das Netz zu ziehen
    // wäre Arbeit ohne Ergebnis.
    return {
      name, size: groesse, lastModified: stand, type: "",
      async arrayBuffer() { const r = await d.lese(pfadVerbinden(pfad, name)); if (!r) { const e = new Error("Datei nicht gefunden: " + name); e.name = "NotFoundError"; throw e; } return r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength); },
    };
  }
  async function leseAusOrdner(name) {
    if (!name) return null;
    const vomLaufwerk = await zubringer(name);
    if (vomLaufwerk) return vomLaufwerk;
    return quelleVomServer(name);
  }
  async function listeOrdnerDateien(endung) {
    const passt = (n) => (!endung || n.toLowerCase().endsWith(String(endung).toLowerCase())) && !n.startsWith("~$");
    const namen = new Set();
    try { for (const n of (await quellenListeHolen()).keys()) if (passt(n)) namen.add(n); } catch (e) { /* Server weg: nur das Laufwerk */ }
    const d = bruecke(); const pfad = await quellPfadLaden();
    if (d && pfad) { try { for (const e of (await d.liste(pfad)) || []) if (passt(e.name)) namen.add(e.name); } catch (e) { /* Laufwerk weg */ } }
    return [...namen].sort((a, b) => a.localeCompare(b, "de"));
  }
  async function quellOrdnerSetzen(pfad) {
    quellPfad = pfad || null; quellPfadGeladen = true;
    const d = bruecke();
    if (d && typeof d.merke === "function") { try { await d.merke(QUELL_SCHLUESSEL, quellPfad); } catch (e) { /* nur diese Sitzung */ } }
  }
  async function pickQuellOrdner() {
    const d = bruecke();
    if (!d) { dispatchInfo("Im Browser liest das Cockpit die Tabelle aus der Kopie auf " + HOST + ". Einen Ordner wählen kann nur die Programm-Fassung - sie bringt die Tabelle vom Laufwerk auf den Server."); return null; }
    const pfad = await d.waehleOrdner();
    if (!pfad) return null;
    await quellOrdnerSetzen(pfad);
    return { name: ordnerName(pfad) };
  }
  async function setzeQuellOrdnerPfad(pfad) {
    const d = bruecke();
    if (!d) throw new Error("Pfad einfügen geht nur in der Programm-Fassung.");
    const sauber = String(pfad || "").trim().replace(/^"|"$/g, "");
    if (!sauber) throw new Error("Kein Pfad angegeben.");
    const art = await d.pfadInfo(sauber);
    if (!art) throw new Error(`Unter „${sauber}" wurde nichts gefunden - Pfad und Laufwerk prüfen.`);
    let ordnerPfad = sauber; let dateiName = "";
    if (art === "datei") { const teile = sauber.split(/[\\/]/); dateiName = teile.pop(); ordnerPfad = teile.join(sauber.includes("\\") ? "\\" : "/"); }
    await quellOrdnerSetzen(ordnerPfad);
    return { name: ordnerName(ordnerPfad), dateiName };
  }
  async function vergissQuellOrdner() { await quellOrdnerSetzen(null); }
  // "ok" = lesebereit. Im Server-Betrieb gibt es keinen Ordner, der erst
  // freigegeben werden müsste - die Kopie auf dem Server ist immer da.
  function quellOrdnerStatus() { return gestartet ? "ok" : "none"; }
  function quellOrdnerName() {
    if (!quellPfadGeladen) quellPfadLaden();
    return quellPfad ? `${quellPfad} → Server ${HOST}` : `Kopie auf dem Server ${HOST}`;
  }
  // Für die Oberfläche: woher kommt die Tabelle gerade, und bringt dieser Rechner sie auf den Server?
  function quellenLage() { return { server: HOST, zubringer: !!(bruecke() && quellPfad), laufwerk: quellPfad, kopien: quellenAufServer ? [...quellenAufServer.values()] : null }; }

  /* ---------- Live-Meldungen (SSE) ---------- */
  function lauschen() {
    if (typeof EventSource === "undefined" || eventSource) return;
    try {
      eventSource = new EventSource(`${API}/ereignisse`);
      eventSource.onmessage = (ev) => {
        let d = null; try { d = JSON.parse(ev.data); } catch (e) { return; }
        erreichbar = true;
        // "hallo" = (Wieder-)Verbindung: immer einmal abgleichen - so kommt nach
        // einem Ausfall die grüne Meldung binnen Sekunden, nicht erst beim 60-s-Kurzblick.
        if (d && (d.hallo || Number(d.version) > spiegel.version)) nachholenBald();
        if (d && d.hallo && warteschlange.length) warteschlangeSenden();
      };
      eventSource.onerror = () => { erreichbar = false; /* der Browser verbindet selbst neu */ };
    } catch (e) { eventSource = null; }
  }
  function nachholenBald() {
    if (nachholTimer) return;
    nachholTimer = setTimeout(() => { nachholTimer = null; deltaHolen().catch(() => {}); }, 150);
  }
  // Sicherheitsnetz, falls SSE hängt (Proxy, Schlaf): alle 60 s ein Kurzblick.
  let pollTimer = null;
  function pollingStarten() {
    if (pollTimer) return;
    pollTimer = setInterval(() => { deltaHolen().then(() => { if (warteschlange.length) warteschlangeSenden(); }).catch(() => {}); }, 60000);
  }

  /* ---------- Speichern ---------- */
  function fehlerAusAntwort(r) {
    if (r.status === 401) return "Der Server hat die Änderung abgewiesen: Werkstatt-Schlüssel fehlt oder ist falsch (Zahnrad -> Server). Örtlich ist alles gesichert.";
    return "Der Server hat die Änderung abgewiesen (" + r.status + "): " + ((r.daten && r.daten.fehler) || "unbekannt");
  }
  /* Ein Bündel senden. 409 = jemand war schneller: Zeitstempel-Regel wie heute,
     dann mit neuer Basis erneut. Gibt true zurück, wenn der Server es hat. */
  async function buendelSenden(buendel) {
    for (let versuch = 0; versuch < 8; versuch++) {
      const r = await anfrage(`${API}/aenderungen`, { method: "POST", body: { ...buendel, basisVersion: spiegel.version } });
      if (r.status === 200 && r.daten) {
        // Eigene Änderungen sofort in den Spiegel (die Delta-Antwort brächte sie gleich noch einmal - schadlos).
        for (const e of buendel[TABELLE] || []) { spiegel.entries.set(String(e.id), e); delete spiegel.deleted[String(e.id)]; }
        for (const id of (buendel.loeschen && buendel.loeschen[TABELLE]) || []) { spiegel.entries.delete(String(id)); spiegel.deleted[String(id)] = H.nowISO(); }
        for (const [k, w] of Object.entries((buendel.konfig && buendel.konfig[BEREICH]) || {})) spiegel.config[k] = w;
        // Version NICHT blind übernehmen: dazwischen können fremde Änderungen liegen - Delta holen.
        await deltaHolen().catch(() => { spiegel.version = Number(r.daten.version) || spiegel.version; spiegelSichernBald(); });
        lastSuccessfulSyncAt = H.nowISO();
        return true;
      }
      if (r.status === 409 && r.daten && Array.isArray(r.daten.konflikte)) {
        // Fremder Stand je Eintrag: dieselbe Regel wie beim Zusammenführen der Datei.
        const fremd = new Map(r.daten.konflikte.map((k) => [String(k.id), k]));
        const behalten = [];
        for (const e of buendel[TABELLE] || []) {
          const k = fremd.get(String(e.id));
          if (!k) { behalten.push(e); continue; }
          if (k.geloescht) { behalten.push(e); continue; } // gelöscht gegen bearbeitet: die Bearbeitung lebt (wie mergeEntries ohne jüngere Löschmarke)
          const gewinner = H.mergeEntries([k.server], [e], {})[0];
          if (gewinner && String(gewinner.updatedAt || "") === String(e.updatedAt || "") && JSON.stringify(gewinner) === JSON.stringify(e)) { behalten.push(e); continue; }
          // Der Kollege war schneller UND jünger: sein Stand bleibt, die App bekommt den Hinweis sofort.
          spiegel.entries.set(String(e.id), k.server);
          const felder = Object.keys({ ...e, ...k.server }).filter((f) => !["updatedAt", "geaendertVon", "basis", "_basis"].includes(f) && JSON.stringify(e[f]) !== JSON.stringify(k.server[f]));
          if (felder.length) dispatch("-kollision", { id: String(e.id), wer: k.server.geaendertVon || "Ein Kollege", zeit: H.nowISO(), felder: felder.map((f) => ({ feld: f, mein: e[f], fremd: k.server[f] })), meinEintrag: e, fremdEintrag: k.server });
        }
        // Löschungen: ein inzwischen fremd geänderter Eintrag wird nicht gelöscht (Bearbeiten schlägt Löschen).
        const loeschen = ((buendel.loeschen && buendel.loeschen[TABELLE]) || []).filter((id) => !fremd.has(String(id)));
        buendel = { ...buendel, [TABELLE]: behalten, loeschen: { [TABELLE]: loeschen } };
        // Erst den fremden Stand einarbeiten (neue Basis), dann erneut.
        await deltaHolen().catch(() => { spiegel.version = Number(r.daten.version) || spiegel.version; });
        if (behalten.length === 0 && loeschen.length === 0 && !Object.keys((buendel.konfig && buendel.konfig[BEREICH]) || {}).length) { dispatchUpdate(); return true; }
        continue;
      }
      if (r.status === 401 || r.status === 400) { throw Object.assign(new Error(fehlerAusAntwort(r)), { abgewiesen: true }); }
      throw new Error("Server-Antwort " + r.status + ": " + ((r.daten && r.daten.fehler) || "unbekannt"));
    }
    throw new Error("Nach 8 Anläufen immer noch Konflikt - bitte noch einmal speichern.");
  }
  async function warteschlangeSenden() {
    if (!warteschlange.length) return;
    await (schreibKette = schreibKette.then(async () => {
      while (warteschlange.length) {
        const b = warteschlange[0];
        try { await buendelSenden(b); } catch (e) {
          if (e && e.abgewiesen) { warteschlange.shift(); await warteschlangeSichern(); dispatchError(e.message); continue; }
          return; // Server weg - beim nächsten Lebenszeichen weiter
        }
        warteschlange.shift(); await warteschlangeSichern();
      }
      dispatchInfo("Wartende Änderungen sind jetzt auf dem Server.");
      dispatchOk();
    }).catch(() => {}));
  }
  /* Änderungen, die den Server nicht erreichen, werden örtlich angewendet
     und in die Warteschlange gelegt - der Bearbeiter arbeitet weiter. */
  async function inWarteschlange(buendel) {
    for (const e of buendel[TABELLE] || []) { spiegel.entries.set(String(e.id), e); delete spiegel.deleted[String(e.id)]; }
    for (const id of (buendel.loeschen && buendel.loeschen[TABELLE]) || []) { spiegel.entries.delete(String(id)); spiegel.deleted[String(id)] = H.nowISO(); }
    for (const [k, w] of Object.entries((buendel.konfig && buendel.konfig[BEREICH]) || {})) spiegel.config[k] = w;
    warteschlange.push(buendel);
    await warteschlangeSichern();
    spiegelSichernBald();
  }

  async function saveEntries(nextEntries, prevEntries) {
    await bereit;
    let { stamped, removed } = H.stampEntries(nextEntries, prevEntries, cfg.istFremd || null);
    // Notbremse Massenlöschung wie in der Datei-Fassung (11.09.) - hier zusätzlich
    // gegen einen leeren Vergleichsstand nach Neustart. Seit dem 02.10. LAUT:
    // 2.905 Einträge gingen still (stampEntries lässt Unsichtbares inzwischen
    // gar nicht mehr in removed - die Bremse ist das zweite Netz).
    if (removed.length > 1000 && nextEntries.length < 100) {
      dispatchError(`Sicherheits-Stopp: Dieser Speichervorgang hätte ${removed.length} Einträge auf einen Schlag als gelöscht markiert, obwohl er selbst fast leer ist. Das deutet auf einen kaputten Vergleichsstand hin, nicht auf gewolltes Löschen - der Bestand auf ${HOST} bleibt vollständig, nur die neuen Änderungen wurden übernommen.`);
      removed = [];
    }
    const ts = H.nowISO();
    const geaendert = stamped.filter((e) => e && e.id != null && !istConfig(e) && JSON.stringify(spiegel.entries.get(String(e.id))) !== JSON.stringify(e));
    const logZeilen = H.baueVerlauf ? H.baueVerlauf(nextEntries, prevEntries, removed, ts) : [];
    const buendel = { benutzer: H.werBinIch(), [TABELLE]: geaendert.concat(logZeilen), loeschen: { [TABELLE]: removed.map(String) } };
    if (!geaendert.length && !removed.length) { return H.mergeEntries(H.ohneSystemEntries(lebende()), [], {}); }
    await (schreibKette = schreibKette.then(async () => {
      try {
        if (warteschlange.length) { await inWarteschlange(buendel); warteschlangeSenden(); return; }
        await buendelSenden(buendel);
        dispatchOk();
      } catch (e) {
        if (e && e.abgewiesen) { dispatchError(e.message); return; }
        await inWarteschlange(buendel);
        dispatchError("Der Server ist gerade nicht erreichbar (" + HOST + "). Die Änderung ist örtlich gesichert und wird gesendet, sobald er wieder da ist.");
      }
    }).catch(() => {}));
    spiegelnInLocalStorage(lebende());
    return H.ohneSystemEntries(lebende());
  }

  async function saveConfig(configObj, prevConfigObj) {
    await bereit;
    const geaendert = {};
    for (const k of Object.keys(configObj || {})) {
      if (k === "updatedAt") continue;
      if (JSON.stringify(spiegel.config[k]) !== JSON.stringify(configObj[k])) geaendert[k] = configObj[k];
    }
    if (!Object.keys(geaendert).length) return null;
    const benennung = { tpmAnlagen: "Anlagen", riItems: "R+I-Punkte", team: "Team", extraSchichten: "Schichtarten", anlagenteile: "Anlagenteile" };
    const felder = Object.keys(geaendert).filter((k) => k !== "programmStand").map((k) => benennung[k] || k);
    const logZeilen = felder.length ? [H.macheLogEintrag("Einstellungen geändert: " + felder.join(", "), H.nowISO())] : [];
    const buendel = { benutzer: H.werBinIch(), [TABELLE]: logZeilen, konfig: { [BEREICH]: geaendert } };
    await (schreibKette = schreibKette.then(async () => {
      try {
        if (warteschlange.length) { await inWarteschlange(buendel); warteschlangeSenden(); return; }
        await buendelSenden(buendel);
        dispatchOk();
      } catch (e) {
        if (e && e.abgewiesen) { dispatchError(e.message); return; }
        await inWarteschlange(buendel);
        dispatchError("Der Server ist gerade nicht erreichbar (" + HOST + "). Die Einstellungen sind örtlich gesichert und werden gesendet, sobald er wieder da ist.");
      }
    }).catch(() => {}));
    return { ...spiegel.config };
  }

  /* ---------- Start ---------- */
  async function tryRestore() {
    if (gestartet) return { status: "connected", name: fileName(), mode: "readwrite", server: BASIS, erreichbar };
    gestartet = true;
    const t0 = Date.now();
    startMessung.begonnen = H.nowISO();
    startMessung.phase = "spiegel";
    await spiegelLaden();
    startMessung.verweis = Date.now() - t0;
    const t1 = Date.now();
    startMessung.phase = "server";
    let fehler = null;
    try {
      await deltaHolen();
      startMessung.lesen = Date.now() - t1;
    } catch (e) {
      fehler = e && e.message ? e.message : String(e);
      startMessung.lesen = Date.now() - t1;
    }
    if (spiegel.entries.size || Object.keys(spiegel.config).length) { const t2 = Date.now(); dispatchUpdate(); startMessung.abgleich = Date.now() - t2; }
    lauschen();
    pollingStarten();
    if (warteschlange.length && erreichbar) { startMessung.phase = "warteschlange"; warteschlangeSenden(); }
    startMessung.gesamt = Date.now() - t0;
    startMessung.groesse = spiegel.entries.size;
    startMessung.phase = "fertig";
    startMessung.status = erreichbar ? "connected" : "offline";
    bereitAufloesen();
    if (fehler) dispatchError("Der Server " + HOST + " ist beim Start nicht erreichbar - es gilt der örtliche Spiegel (Stand Version " + spiegel.version + "). Änderungen werden gesammelt und später gesendet. (" + fehler + ")");
    return { status: "connected", name: fileName(), mode: "readwrite", server: BASIS, erreichbar };
  }

  /* ---------- Status-Auskünfte (dieselben Namen wie die Datei-Fassung) ---------- */
  function fileName() { return `Server ${HOST} · ${STANDORT} · ${BEREICH === "stoerungen" ? "Störberichte" : "Kalender"}`; }
  function fileInfo() {
    // "pfad" ist die Zeile, die die Kennkarte im Kopf zeigt: Server, Standort, Stand.
    return { name: fileName(), ordner: HOST, pfad: `Server ${HOST} · ${STANDORT} · Version ${spiegel.version}${erreichbar ? "" : " · NICHT ERREICHBAR"}${warteschlange.length ? ` · ${warteschlange.length} wartend` : ""}`, groesse: null, geaendert: lastSuccessfulSyncAt, eintraege: fachliche().length, version: spiegel.version, server: BASIS, erreichbar, warteschlange: warteschlange.length, antwortMs: letzteAntwortMs };
  }
  function umgebung() {
    return { protokoll: window.location ? window.location.protocol : "?", sichererKontext: !!window.isSecureContext, herkunft: window.location ? String(window.location.origin) : "?", programm: !!(window.__werkstattDesktop), server: BASIS, standort: STANDORT };
  }
  const nichts = async () => null;
  const nichtImServerBetrieb = async () => { dispatchInfo("Im Server-Betrieb gibt es keine Datei zu wählen - der Bestand liegt auf " + HOST + "."); return null; };

  const _test = {
    version: () => spiegel.version,
    setzeVersion: (v) => { spiegel.version = Number(v) || 0; }, // Prüfstand: veraltete Basis erzwingen (409-Weg)
    spiegel: () => ({ version: spiegel.version, entries: lebende(), config: { ...spiegel.config }, deleted: { ...spiegel.deleted } }),
    warteschlange: () => warteschlange.length,
    erreichbar: () => erreichbar,
    dateiFertig: () => schreibKette,
    delta: deltaHolen,
    senden: warteschlangeSenden,
    save: saveEntries,
    fileInfo,
    fotos: { speichern: fotoSpeichern, lesen: fotoLesen, loeschen: fotoLoeschen },
    quellen: { lese: leseAusOrdner, liste: listeOrdnerDateien, lage: quellenLage, setzePfad: quellOrdnerSetzen },
  };

  return {
    isSupported: () => true,
    isConnected: () => gestartet,
    canWrite: () => true,
    fileName, fileInfo, ermittlePfad: nichts, umgebung,
    uhrVersatz: () => 0,
    fassungVeraltet: () => false,
    startZeiten: () => (startMessung.begonnen ? { ...startMessung } : null),
    phaseName: (p) => PHASEN_NAMEN[p] || p || "?",
    zwischenResteStand: () => ({}),
    getLastWriteError: () => lastWriteError,
    getLastSuccessfulSyncAt: () => lastSuccessfulSyncAt,
    listBackups: async () => [],
    pickShared: nichtImServerBetrieb, tryRestore,
    reconnect: async () => tryRestore(),
    retryWrite: async () => { if (warteschlange.length) { await warteschlangeSenden(); } else { await deltaHolen().catch(() => {}); } return warteschlange.length === 0; },
    disconnect: async () => { /* im Server-Betrieb gibt es kein Trennen */ },
    schreibfrageOffen: () => false,
    pickWritable: nichtImServerBetrieb,
    folderStatus: () => "none", folderName: () => "", folderPfad: () => "", pickFolder: nichtImServerBetrieb, reconnectFolder: nichts, forgetFolder: nichts,
    sammleKonfliktkopien: async () => ({ eingesammelt: 0 }),
    tagesSicherungJetzt: async () => ({ uebersprungen: true, grund: "Im Server-Betrieb sichert der Dienst nachts um 02:00 (C:\\BTA\\BTA-Sicherung)." }),
    tagesSicherungStand: () => ({ server: true }),
    // Fotos liegen im fotos-Ordner des Standorts auf dem Server (Bauplan Entscheidung 5).
    fotosVerfuegbar: () => gestartet, fotoLage: () => (gestartet ? "ok" : "kein-ordner"), fotoSpeichern, fotoLesen, fotoLoeschen,
    // Excel-Quellen: Kopie auf dem Server + Zubringer über die Programm-Brücke (siehe oben)
    leseAusOrdner, listeOrdnerDateien,
    pickQuellOrdner, reconnectQuellOrdner: async () => ({ name: quellOrdnerName() }), vergissQuellOrdner, quellOrdnerStatus, quellOrdnerName, setzeQuellOrdnerPfad, quellenLage,
    saveEntries, saveConfig,
    // Stand des Spiegels für storage.js (Bestand ohne Verwaltungszeilen + Einstellungen)
    standJetzt: () => ({ entries: H.ohneSystemEntries(lebende()), config: Object.keys(spiegel.config).length ? { ...spiegel.config } : null, version: spiegel.version, geladen: gestartet }),
    readLog: async () => H.extractLogEntries(lebende()),
    dispatchError, dispatchOk,
    pollNow: () => deltaHolen(),
    bereit: () => bereit,
    _test,
  };
}
