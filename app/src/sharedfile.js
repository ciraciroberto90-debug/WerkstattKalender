// Gemeinsamer Speicher über eine JSON-Datei auf dem Firmenlaufwerk oder in
// einem synchronisierten OneDrive-Ordner. Genutzt wird die File-System-Access-
// Schnittstelle des Browsers (Edge/Chrome): Die Datei wird einmal ausgewählt,
// der Zugriff gemerkt (IndexedDB) und danach automatisch gelesen/geschrieben.
//
// Damit sich zwei Bearbeiter nicht gegenseitig überschreiben, wird vor jedem
// Speichern der aktuelle Dateiinhalt gelesen und Eintrag für Eintrag
// zusammengeführt (neuerer Zeitstempel gewinnt, Löschungen über Merkliste).

const IDB_NAME = "werkstatt-kalender-fs";
const IDB_STORE = "handles";
const IDB_BACKUP_STORE = "backups";
const BACKUP_MAX_COUNT = 30; // lokale Sicherungen (pro Gerät) - Sicherheitsnetz gegen Datenverlust
const FORMAT = "werkstatt-kalender-v1";
const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 3600 * 1000; // Lösch-Merkliste: 180 Tage aufheben

const ENTRIES_KEY = "werkstatt-kalender-entries";
const CONFIG_KEY = "werkstatt-kalender-config";
const POLL_MS = 30000; // alle 30 s nach Änderungen der anderen schauen

let fileHandle = null;
let accessMode = null; // "readwrite" | "read"
let lastWriteError = null; // technischer Grund, warum das Schreiben zuletzt scheiterte
export function getLastWriteError() { return lastWriteError; }
let lastSavedAt = null;
let pollTimer = null;

/* ---------- Status ---------- */
export function isSupported() {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
}
export function isConnected() {
  return !!fileHandle;
}
export function canWrite() {
  return accessMode === "readwrite";
}
export function fileName() {
  return fileHandle ? fileHandle.name : "";
}

/* ---------- IndexedDB (merkt sich die gewählte Datei) ---------- */
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_BACKUP_STORE)) db.createObjectStore(IDB_BACKUP_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/* ---------- Lokale Sicherungen (Sicherheitsnetz gegen Datenverlust) ---------- */
// Bei jedem bestätigten Speichern bzw. jeder abgeholten Änderung wird der
// komplette Stand zusätzlich lokal (pro Gerät, IndexedDB) abgelegt. Rein
// software-seitig, keine zusätzliche Technik/Server nötig.
async function idbAddBackup(snapshot) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_BACKUP_STORE, "readwrite");
    tx.objectStore(IDB_BACKUP_STORE).put(snapshot, snapshot.ts);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function idbGetAllBackups() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_BACKUP_STORE, "readonly");
    const req = tx.objectStore(IDB_BACKUP_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
async function idbDelBackup(ts) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_BACKUP_STORE, "readwrite");
    tx.objectStore(IDB_BACKUP_STORE).delete(ts);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function recordBackup(entries, config) {
  try {
    const ts = nowISO();
    await idbAddBackup({ ts, entries: entries || [], config: config || null });
    const all = await idbGetAllBackups();
    if (all.length > BACKUP_MAX_COUNT) {
      const sorted = all.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
      const zuViel = sorted.slice(0, sorted.length - BACKUP_MAX_COUNT);
      for (const b of zuViel) await idbDelBackup(b.ts);
    }
  } catch (e) { /* Sicherung ist ein Zusatz - das eigentliche Speichern hat schon geklappt */ }
}
// Neueste zuerst - fürs Anzeigen/Wiederherstellen im Verwalten-Dialog.
export async function listBackups() {
  try {
    const all = await idbGetAllBackups();
    return all.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  } catch (e) { return []; }
}

/* ---------- Ereignisse an die App ---------- */
function dispatchUpdate(data) {
  window.dispatchEvent(new CustomEvent("werkstatt-shared-update", {
    detail: { entries: data.entries, config: data.config, deleted: data.deleted },
  }));
}
export function dispatchError(message) {
  window.dispatchEvent(new CustomEvent("werkstatt-shared-error", { detail: message }));
}
export function dispatchOk() {
  window.dispatchEvent(new CustomEvent("werkstatt-shared-ok"));
}

function nowISO() {
  return new Date().toISOString();
}

/* ---------- Dateiformat ---------- */
function emptyData() {
  return { format: FORMAT, savedAt: null, entries: [], deleted: {}, config: null };
}
function normalizeData(d) {
  // Auch eine reine Export-Datei (Array von Einträgen) wird als Startbestand akzeptiert.
  if (Array.isArray(d)) return { ...emptyData(), entries: d };
  return {
    format: FORMAT,
    savedAt: typeof d.savedAt === "string" ? d.savedAt : null,
    entries: Array.isArray(d.entries) ? d.entries : [],
    deleted: d.deleted && typeof d.deleted === "object" ? d.deleted : {},
    config: d.config && typeof d.config === "object" ? d.config : null,
  };
}
async function readFileData() {
  const file = await fileHandle.getFile();
  const text = await file.text();
  if (!text.trim()) return emptyData();
  return normalizeData(JSON.parse(text));
}
async function writeFileData(data) {
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

/* ---------- Zusammenführen (exportiert, damit testbar) ---------- */
export function mergeEntries(a, b, deleted) {
  const byId = new Map();
  [...a, ...b].forEach((e) => {
    if (!e || typeof e.id === "undefined") return;
    const prev = byId.get(e.id);
    if (!prev || String(e.updatedAt || "") > String(prev.updatedAt || "")) byId.set(e.id, e);
  });
  const out = [];
  byId.forEach((e) => {
    const delAt = deleted && deleted[e.id];
    if (delAt && String(delAt) >= String(e.updatedAt || "")) return; // gelöscht bleibt gelöscht
    out.push(e);
  });
  out.sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.id).localeCompare(String(y.id)));
  return out;
}

// Versieht geänderte/neue Einträge mit einem Zeitstempel und meldet Löschungen.
export function stampEntries(nextEntries, prevEntries) {
  const strip = ({ updatedAt, ...rest }) => rest;
  const prevById = new Map((prevEntries || []).map((e) => [e.id, e]));
  const t = nowISO();
  const stamped = nextEntries.map((e) => {
    const prev = prevById.get(e.id);
    if (prev && prev.updatedAt && JSON.stringify(strip(prev)) === JSON.stringify(strip(e))) {
      return { ...e, updatedAt: prev.updatedAt };
    }
    return { ...e, updatedAt: t };
  });
  const removed = [];
  prevById.forEach((_, id) => {
    if (!nextEntries.some((e) => e.id === id)) removed.push(id);
  });
  return { stamped, removed };
}

function pruneTombstones(deleted) {
  const cutoff = new Date(Date.now() - TOMBSTONE_MAX_AGE_MS).toISOString();
  Object.keys(deleted).forEach((id) => {
    if (String(deleted[id]) < cutoff) delete deleted[id];
  });
}

/* ---------- Lokalen Zwischenspeicher angleichen ---------- */
function syncLocal(data) {
  try {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(data.entries));
    if (data.config) {
      const { updatedAt, ...cfg } = data.config;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); // alle Felder (tpmAnlagen, riItems, team, ...)
    }
  } catch (e) { /* voller Speicher o. ä. – nicht kritisch */ }
}
function readLocalJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/* ---------- Datei übernehmen (nach Auswahl oder beim Start) ---------- */
// Ob jemand bearbeiten darf, entscheiden die Datei-Rechte auf dem Laufwerk
// (von der IT vergeben): Schlägt das Schreiben dort fehl, schaltet die App
// automatisch auf "nur ansehen" um.
async function adoptCurrentFile(justCreated) {
  let data = justCreated ? emptyData() : await readFileData();

  if (accessMode === "readwrite") {
    // Lokalen Bestand in die Datei einpflegen (erste Übernahme bzw. Wiederverbinden).
    const localEntries = Array.isArray(readLocalJSON(ENTRIES_KEY)) ? readLocalJSON(ENTRIES_KEY) : [];
    let merged = mergeEntries(data.entries, localEntries, data.deleted);
    merged = merged.map((e) => (e.updatedAt ? e : { ...e, updatedAt: nowISO() }));
    let config = data.config;
    if (!config) {
      const localConfig = readLocalJSON(CONFIG_KEY);
      if (localConfig) config = { ...localConfig, updatedAt: nowISO() };
    }
    const candidate = { format: FORMAT, savedAt: nowISO(), entries: merged, deleted: data.deleted, config };
    try {
      await writeFileData(candidate);
      data = candidate;
      lastWriteError = null;
    } catch (e) {
      lastWriteError = `${e && e.name ? e.name : "Fehler"}: ${e && e.message ? e.message : e}`;
      if (justCreated) throw e; // neue Datei ließ sich gar nicht anlegen -> echter Fehler
      accessMode = "read"; // keine Schreibrechte (IT-Freigabe) -> nur ansehen
    }
  }

  lastSavedAt = data.savedAt;
  syncLocal(data);
  dispatchUpdate(data);
  await recordBackup(data.entries, data.config);
  return data;
}

/* ---------- Verbinden / Trennen ---------- */
export async function pickShared({ create = false } = {}) {
  const types = [{ description: "Werkstatt-Kalender Daten", accept: { "application/json": [".json"] } }];
  let handle;
  if (create) {
    handle = await window.showSaveFilePicker({ suggestedName: "werkstatt-kalender-daten.json", types });
  } else {
    [handle] = await window.showOpenFilePicker({ types });
  }
  if (handle.requestPermission) {
    const p = await handle.requestPermission({ mode: "readwrite" });
    if (p !== "granted") throw new Error("Der Zugriff auf die Datei wurde nicht erlaubt.");
  }
  fileHandle = handle;
  accessMode = "readwrite"; // adoptCurrentFile stuft bei fehlenden Laufwerks-Rechten auf "read" zurück
  try {
    await idbSet("handle", handle);
    await idbSet("mode", "readwrite");
  } catch (e) {
    // Verweis lässt sich nicht merken (z. B. IndexedDB blockiert) – Verbindung gilt
    // trotzdem für diese Sitzung, nach dem Neustart muss die Datei neu gewählt werden.
  }
  const data = await adoptCurrentFile(create);
  startPolling();
  return data;
}

export async function tryRestore() {
  if (!isSupported()) return { status: "unsupported" };
  let handle = null;
  let mode = "readwrite";
  try {
    handle = await idbGet("handle");
    mode = (await idbGet("mode")) || "readwrite";
  } catch (e) { /* IndexedDB nicht verfügbar */ }
  if (!handle) return { status: "none" };
  let perm = "prompt";
  try {
    perm = await handle.queryPermission({ mode });
  } catch (e) { /* ältere Browser */ }
  if (perm === "granted") {
    fileHandle = handle;
    accessMode = mode;
    try {
      await adoptCurrentFile(false);
    } catch (e) {
      dispatchError("Gemeinsame Datei konnte nicht gelesen werden (Laufwerk erreichbar?).");
    }
    startPolling();
    return { status: "connected", name: handle.name, mode: accessMode };
  }
  return { status: "needs-permission", name: handle.name, mode };
}

// Zugriff nach Browser-Neustart wieder freigeben (braucht einen Klick des Nutzers).
export async function reconnect() {
  const handle = await idbGet("handle");
  const mode = (await idbGet("mode")) || "readwrite";
  if (!handle) throw new Error("Keine gemerkte Datei gefunden.");
  const p = await handle.requestPermission({ mode });
  if (p !== "granted") throw new Error("Zugriff wurde nicht erlaubt.");
  fileHandle = handle;
  accessMode = mode;
  await adoptCurrentFile(false);
  startPolling();
  return { status: "connected", name: handle.name, mode: accessMode };
}

// Schreibzugriff erneut versuchen (z. B. wenn die Datei beim ersten Verbinden
// gesperrt/schreibgeschützt war und man eigentlich Bearbeiter ist).
export async function retryWrite() {
  if (!fileHandle) throw new Error("Keine Datei verbunden.");
  if (fileHandle.requestPermission) {
    const p = await fileHandle.requestPermission({ mode: "readwrite" });
    if (p !== "granted") throw new Error("Der Browser hat den Schreibzugriff nicht erlaubt.");
  }
  accessMode = "readwrite";
  try { await idbSet("mode", "readwrite"); } catch (e) { /* egal */ }
  await adoptCurrentFile(false); // testet das Schreiben - fällt bei Verbot automatisch auf "read" zurück
  startPolling();
  return { status: "connected", name: fileHandle.name, mode: accessMode };
}

export async function disconnect() {
  stopPolling();
  fileHandle = null;
  accessMode = null;
  lastSavedAt = null;
  try {
    await idbDel("handle");
    await idbDel("mode");
  } catch (e) { /* egal */ }
}

/* ---------- Speichern (wird von storage.js aufgerufen) ---------- */
// Mit Kontroll-Lesung: Schreiben zwei Bearbeiter im exakt selben Moment,
// würde sonst stumm der Letzte gewinnen. Deshalb wird nach dem Schreiben
// kurz zurückgelesen und geprüft, ob die eigenen Änderungen wirklich in der
// Datei stehen - falls nicht, wird neu zusammengeführt und nachgespeichert.
export async function saveEntries(nextEntries, prevEntries) {
  if (!fileHandle || accessMode !== "readwrite") return null;
  const { stamped, removed } = stampEntries(nextEntries, prevEntries);
  const delStamp = nowISO();
  let merged = null;
  let letzterFehler = null;

  for (let versuch = 0; versuch < 5; versuch++) {
    try {
      // WICHTIG: Ein Lesefehler hier darf NIE stillschweigend als "Datei ist
      // leer" behandelt werden - das würde sonst beim Schreiben den ganzen
      // Bestand der anderen überschreiben. Schlägt das Lesen fehl, gilt das
      // wie eine Kollision: kurz warten, neuer Versuch.
      const fileData = await readFileData();
      const deleted = { ...fileData.deleted };
      removed.forEach((id) => {
        if (!deleted[id] || String(deleted[id]) < delStamp) deleted[id] = delStamp;
      });
      pruneTombstones(deleted);
      merged = mergeEntries(fileData.entries, stamped, deleted);
      const out = { format: FORMAT, savedAt: nowISO(), entries: merged, deleted, config: fileData.config };

      // Optimistische Sperre: unmittelbar vor dem Schreiben nochmal ganz kurz
      // prüfen, ob die Datei seit unserem Lesen oben noch denselben Stand hat.
      // Hat inzwischen jemand anderes geschrieben (echte Gleichzeitigkeit),
      // würden wir sonst dessen bereits bestätigte Änderung unbemerkt
      // überschreiben - lieber jetzt abbrechen und mit dem NEUEN Stand neu
      // zusammenführen, statt das erst nach dem Schreiben zu bemerken.
      const nochAktuell = await readFileData();
      if (String(nochAktuell.savedAt || "") !== String(fileData.savedAt || "")) {
        throw new Error("Kollision: Datei wurde zwischenzeitlich von anderer Stelle geändert");
      }

      await writeFileData(out);
      lastSavedAt = out.savedAt;

      const kontrolle = await readFileData();
      if (changesConfirmed(kontrolle, stamped, removed, delStamp) && keinVerlustGegenueber(fileData, kontrolle, removed)) {
        // Frischesten Stand zurückgeben (enthält ggf. auch gerade eingetroffene Änderungen der anderen)
        lastSavedAt = kontrolle.savedAt;
        const bestaetigt = mergeEntries(kontrolle.entries, [], kontrolle.deleted);
        await recordBackup(bestaetigt, kontrolle.config);
        nachpruefenUndHeilen(stamped, removed, delStamp);
        return bestaetigt;
      }
    } catch (e) {
      letzterFehler = e;
    }
    // Kollision oder vorübergehender Fehler: kurz warten (steigend), dann neuer Versuch
    await new Promise((r) => setTimeout(r, 150 + versuch * 150 + Math.floor(Math.random() * 150)));
  }
  // Nach mehreren Versuchen weiterhin nicht bestätigt - nicht mehr still weitermachen,
  // sondern deutlich warnen. Lokal ist nichts verloren (localStorage + Sicherung).
  const grund = letzterFehler ? ` (${letzterFehler.name || "Fehler"}: ${letzterFehler.message || letzterFehler})` : "";
  dispatchError(`Deine letzte Änderung konnte nicht sicher in der gemeinsamen Datei bestätigt werden${grund}. Nichts ist verloren - bitte kurz warten, dann erscheint automatisch ein Hinweis zum erneuten Versuch.`);
  if (merged) await recordBackup(merged, null);
  return merged; // Restfall: lokale Sicht - die Selbstheilung gleicht beim nächsten Speichern ab
}

// Letzte Sicherheitsebene gegen ein extrem seltenes, aber reales Zeitfenster:
// Zwischen unserer eigenen Bestätigung (kontrolle oben) und diesem Moment kann
// ein anderer Bearbeiter, der VOR unserem Schreiben zu lesen begonnen hatte,
// seinerseits noch schreiben und dabei unversehens genau unsere gerade erst
// bestätigte Änderung überschreiben - das eigene Speichern hat zu diesem
// Zeitpunkt aber schon "erfolgreich" zurückgemeldet. Ohne diese Nachprüfung
// bliebe das nur lokal sichtbar (siehe Merge in onUpdate), aber in der Datei
// selbst dauerhaft verschwunden. Läuft im Hintergrund, meldet dem Nutzer
// nichts (kein Grund zur Sorge) und heilt sich selbst.
function nachpruefenUndHeilen(stamped, removed, delStamp) {
  setTimeout(async () => {
    if (!fileHandle || accessMode !== "readwrite") return;
    try {
      const data = await readFileData();
      if (changesConfirmed(data, stamped, removed, delStamp)) return; // alles noch da - nichts zu tun
      const deleted = { ...data.deleted };
      removed.forEach((id) => {
        if (!deleted[id] || String(deleted[id]) < delStamp) deleted[id] = delStamp;
      });
      pruneTombstones(deleted);
      const merged = mergeEntries(data.entries, stamped, deleted);
      const out = { format: FORMAT, savedAt: nowISO(), entries: merged, deleted, config: data.config };
      await writeFileData(out);
      lastSavedAt = out.savedAt;
      const kontrolle = await readFileData();
      if (changesConfirmed(kontrolle, stamped, removed, delStamp)) {
        lastSavedAt = kontrolle.savedAt;
        syncLocal(kontrolle);
        dispatchUpdate(kontrolle);
        await recordBackup(mergeEntries(kontrolle.entries, [], kontrolle.deleted), kontrolle.config);
      }
    } catch (e) {
      // Nächster planmäßiger Poll bzw. die nächste eigene Bearbeitung gleicht ohnehin ab.
    }
  }, 1200);
}

// Zusätzlich zu changesConfirmed: ist gegenüber dem gelesenen Ausgangsstand
// (fileData) unerwartet etwas verschwunden? Das schließt das letzte, sehr
// kleine Zeitfenster zwischen der optimistischen Prüfung und dem
// tatsächlichen Schreiben - falls dort doch zwei Schreibvorgänge ineinander
// gerieten, würde die einfache "ist meine Änderung drin"-Prüfung das nicht
// bemerken, wenn ausgerechnet unser eigener Schreibvorgang zuletzt gewonnen,
// dabei aber die Änderung der anderen Seite verdrängt hat.
function keinVerlustGegenueber(fileData, kontrolle, removed) {
  const removedSet = new Set(removed);
  const kontrolleIds = new Set(kontrolle.entries.map((e) => e.id));
  for (const e of fileData.entries) {
    if (removedSet.has(e.id) || kontrolleIds.has(e.id)) continue;
    const delAt = kontrolle.deleted && kontrolle.deleted[e.id];
    if (delAt && String(delAt) >= String(e.updatedAt || "")) continue; // zwischenzeitlich legitim gelöscht
    return false; // unerwartet verschwunden
  }
  return true;
}

// Stehen alle eigenen Änderungen (und Löschungen) im zurückgelesenen Stand?
function changesConfirmed(data, stamped, removed, delStamp) {
  const byId = new Map(data.entries.map((e) => [e.id, e]));
  for (const e of stamped) {
    const v = byId.get(e.id);
    if (v && String(v.updatedAt || "") >= String(e.updatedAt || "")) continue;
    const delAt = data.deleted && data.deleted[e.id];
    if (delAt && String(delAt) >= String(e.updatedAt || "")) continue; // inzwischen bewusst gelöscht
    return false;
  }
  for (const id of removed) {
    const v = byId.get(id);
    if (!v) continue; // Eintrag ist weg - gut
    if (String(v.updatedAt || "") > delStamp) continue; // nach der Löschung neu bearbeitet - Bearbeitung gewinnt
    const delAt = data.deleted && data.deleted[id];
    if (!delAt || String(delAt) < delStamp) return false;
  }
  return true;
}

export async function saveConfig(configObj) {
  if (!fileHandle || accessMode !== "readwrite") return null;
  let saved = null;
  let letzterFehler = null;
  for (let versuch = 0; versuch < 5; versuch++) {
    try {
      const fileData = await readFileData();
      const t = nowISO();
      const out = { ...fileData, format: FORMAT, savedAt: t, config: { ...configObj, updatedAt: t } };

      // Optimistische Sperre wie bei saveEntries: nicht auf Basis eines
      // veralteten Stands schreiben, sonst könnte eine zeitgleiche
      // Einträge-Änderung von jemand anderem überschrieben werden.
      const nochAktuell = await readFileData();
      if (String(nochAktuell.savedAt || "") !== String(fileData.savedAt || "")) {
        throw new Error("Kollision: Datei wurde zwischenzeitlich von anderer Stelle geändert");
      }

      await writeFileData(out);
      lastSavedAt = t;
      saved = out.config;
      const kontrolle = await readFileData();
      if (kontrolle.config && String(kontrolle.config.updatedAt || "") >= t) {
        await recordBackup(kontrolle.entries, kontrolle.config);
        return saved;
      }
    } catch (e) {
      letzterFehler = e;
    }
    await new Promise((r) => setTimeout(r, 150 + versuch * 150 + Math.floor(Math.random() * 150)));
  }
  const grund = letzterFehler ? ` (${letzterFehler.name || "Fehler"}: ${letzterFehler.message || letzterFehler})` : "";
  dispatchError(`Die Anlagen-/Team-Liste konnte nicht sicher in der gemeinsamen Datei bestätigt werden${grund}. Nichts ist verloren - bitte kurz warten und erneut versuchen.`);
  return saved;
}

/* ---------- Änderungen der anderen abholen ---------- */
let pollFehlerFolge = 0; // aufeinanderfolgende gescheiterte Poll-Versuche
let pollWarnungAktiv = false;
let lastSuccessfulSyncAt = null; // für die "zuletzt aktualisiert"-Anzeige
export function getLastSuccessfulSyncAt() { return lastSuccessfulSyncAt; }
const POLL_FEHLER_SCHWELLE = 3; // ab 3 Fehlversuchen in Folge (~90s) wird gewarnt

export async function pollNow() {
  if (!fileHandle) return;
  try {
    const data = await readFileData();
    lastSuccessfulSyncAt = nowISO();
    if (pollFehlerFolge >= POLL_FEHLER_SCHWELLE || pollWarnungAktiv) {
      // War zwischenzeitlich nicht erreichbar, jetzt wieder da - Entwarnung geben.
      dispatchOk();
      pollWarnungAktiv = false;
    }
    pollFehlerFolge = 0;
    if (data.savedAt && data.savedAt !== lastSavedAt) {
      lastSavedAt = data.savedAt;
      syncLocal(data);
      dispatchUpdate(data);
      await recordBackup(data.entries, data.config);
    }
  } catch (e) {
    pollFehlerFolge++;
    if (pollFehlerFolge === POLL_FEHLER_SCHWELLE) {
      pollWarnungAktiv = true;
      dispatchError(`Gemeinsame Datei ist seit ca. ${Math.round((POLL_FEHLER_SCHWELLE * POLL_MS) / 1000)} Sekunden nicht erreichbar (${e && e.name ? e.name : "Fehler"}). Deine Eingaben bleiben lokal gesichert - die App versucht automatisch weiter, es wieder zu verbinden.`);
    }
  }
}
function startPolling() {
  stopPolling();
  pollFehlerFolge = 0;
  pollWarnungAktiv = false;
  lastSuccessfulSyncAt = nowISO();
  pollTimer = setInterval(pollNow, POLL_MS);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/* ---------- Test-Zugang (für automatisierte Tests, ohne Datei-Dialog) ---------- */
if (typeof window !== "undefined") {
  window.__wkSharedTest = {
    async adopt(handle, mode) {
      fileHandle = handle;
      accessMode = mode || "readwrite";
      const data = await adoptCurrentFile(false);
      startPolling();
      return data;
    },
    poll: pollNow,
    getLastSuccessfulSyncAt: () => lastSuccessfulSyncAt,
  };
}
