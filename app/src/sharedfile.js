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
const FORMAT = "werkstatt-kalender-v1";
const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 3600 * 1000; // Lösch-Merkliste: 180 Tage aufheben

const ENTRIES_KEY = "werkstatt-kalender-entries";
const CONFIG_KEY = "werkstatt-kalender-config";
const POLL_MS = 30000; // alle 30 s nach Änderungen der anderen schauen

let fileHandle = null;
let accessMode = null; // "readwrite" | "read"
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
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
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

/* ---------- Ereignisse an die App ---------- */
function dispatchUpdate(data) {
  window.dispatchEvent(new CustomEvent("werkstatt-shared-update", {
    detail: { entries: data.entries, config: data.config },
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
      localStorage.setItem(CONFIG_KEY, JSON.stringify({
        tpmAnlagen: data.config.tpmAnlagen,
        riItems: data.config.riItems,
      }));
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
    } catch (e) {
      if (justCreated) throw e; // neue Datei ließ sich gar nicht anlegen -> echter Fehler
      accessMode = "read"; // keine Schreibrechte (IT-Freigabe) -> nur ansehen
    }
  }

  lastSavedAt = data.savedAt;
  syncLocal(data);
  dispatchUpdate(data);
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
export async function saveEntries(nextEntries, prevEntries) {
  if (!fileHandle || accessMode !== "readwrite") return null;
  const fileData = await readFileData().catch(() => emptyData());
  const { stamped, removed } = stampEntries(nextEntries, prevEntries);
  const deleted = { ...fileData.deleted };
  const t = nowISO();
  removed.forEach((id) => { deleted[id] = t; });
  pruneTombstones(deleted);
  const merged = mergeEntries(fileData.entries, stamped, deleted);
  const out = { format: FORMAT, savedAt: t, entries: merged, deleted, config: fileData.config };
  await writeFileData(out);
  lastSavedAt = t;
  return merged;
}

export async function saveConfig(configObj) {
  if (!fileHandle || accessMode !== "readwrite") return null;
  const fileData = await readFileData().catch(() => emptyData());
  const t = nowISO();
  const out = { ...fileData, format: FORMAT, savedAt: t, config: { ...configObj, updatedAt: t } };
  await writeFileData(out);
  lastSavedAt = t;
  return out.config;
}

/* ---------- Änderungen der anderen abholen ---------- */
export async function pollNow() {
  if (!fileHandle) return;
  try {
    const data = await readFileData();
    if (data.savedAt && data.savedAt !== lastSavedAt) {
      lastSavedAt = data.savedAt;
      syncLocal(data);
      dispatchUpdate(data);
    }
  } catch (e) { /* Laufwerk kurz weg – nächster Versuch beim nächsten Intervall */ }
}
function startPolling() {
  stopPolling();
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
  };
}
