// Gemeinsamer Speicher über eine JSON-Datei auf dem Firmenlaufwerk oder in
// einem synchronisierten OneDrive-Ordner. Genutzt wird die File-System-Access-
// Schnittstelle des Browsers (Edge/Chrome): Die Datei wird einmal ausgewählt,
// der Zugriff gemerkt (IndexedDB) und danach automatisch gelesen/geschrieben.
//
// Damit sich zwei Bearbeiter nicht gegenseitig überschreiben, wird vor jedem
// Speichern der aktuelle Dateiinhalt gelesen und Eintrag für Eintrag
// zusammengeführt (neuerer Zeitstempel gewinnt, Löschungen über Merkliste).
//
// Diese Datei ist als Fabrik (createSharedStore) aufgebaut: Jede Instanz führt
// GENAU DIESELBE erprobte Sync-Logik, nur für eine andere Datei. So teilen sich
// die Hauptdaten und die Störungen exakt denselben Code samt aller Sicherheiten
// (optimistische Sperre, Selbstheilung, Kein-Verlust-Prüfung, Tombstones,
// lokale Sicherungen, Konflikt-Wächter). Isolation je Instanz über eine eigene
// IndexedDB-Datenbank, eigene localStorage-Schlüssel, ein eigenes Dateiformat
// und einen eigenen Ereignis-Präfix.

const IDB_STORE = "handles";
const IDB_BACKUP_STORE = "backups";
const BACKUP_MAX_COUNT = 30; // lokale Sicherungen (pro Gerät) - Sicherheitsnetz gegen Datenverlust
/* Zusätzlich zu den 30 jüngsten wird je Kalendertag der letzte Stand aufgehoben.
   Gemessen ohne diesen Tagesspeicher: Nach einem normalen Arbeitstag (alle zwei
   Minuten eine fremde Änderung, 8 Stunden) reichten die 30 Plätze nur noch
   58 Minuten zurück. Ein Fehler, der erst am nächsten Morgen auffällt, hätte
   also keine Sicherung mehr gehabt - genau der Fall, für den das Netz da ist. */
const BACKUP_TAGE = 14; // zusätzlich: je Kalendertag ein Stand, 14 Tage zurück
const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 3600 * 1000; // Lösch-Merkliste: 180 Tage aufheben
const POLL_MS = 30000; // alle 30 s nach Änderungen der anderen schauen
const POLL_FEHLER_SCHWELLE = 3; // ab 3 Fehlversuchen in Folge (~90s) wird gewarnt

function nowISO() {
  return new Date().toISOString();
}

/* ---------- Fristen: kein Warten ohne Ende ---------- */
// Gemessen am Arbeitsplatz (Chrome 147, Seite ueber file://): Ein Dateiverweis,
// den der Browser aus der IndexedDB zurueckholt, ist unbrauchbar - und zwar
// still. queryPermission, getFile, alles antwortet weder mit Ja noch mit Nein
// noch mit einem Fehler. Der Aufruf kommt einfach nie zurueck.
//
// Ein "await" darauf ist dann kein Warten mehr, sondern Stillstand: Der Start
// der App blieb an dieser Stelle stehen, das Ordnersymbol blieb grau, und der
// Knopf zum Freigeben erschien gar nicht erst, weil die Antwort nie ankam, die
// ihn ausloest.
//
// Deshalb gilt hier ab sofort: Jeder Aufruf an die Datei-Schnittstelle des
// Browsers bekommt eine Frist. Eine ausbleibende Antwort ist ein Ausfall wie
// jeder andere - sie wird gemeldet, nicht abgewartet.
const FRIST_FRAGE = 2500;    // Rechte abfragen: reine Auskunft, muss sofort kommen
const FRIST_NACHFRAGE = 60000; // Rechte erfragen: hier darf ein Dialog auf einen Menschen warten
const FRIST_LESEN = 15000;   // Datei lesen: Netzlaufwerk/OneDrive duerfen langsam sein
const FRIST_PROBE = 6000;    // nur die Frage "lebt der gemerkte Verweis noch?" beim Start
const FRIST_SCHREIBEN = 30000; // Datei schreiben: dito, mit Reserve

export function keineAntwort(e) {
  return !!(e && e.keineAntwort);
}

/* Ist ein fehlgeschlagener Schreibversuch wirklich ein ENTZOGENES RECHT?
   Am 05.08.2026 stand ein Arbeitsplatz dauerhaft auf Schreibschutz, nachdem
   die App versehentlich ein zweites Mal geöffnet worden war. Ursache: Der
   zweite Tab probierte zu schreiben, die Datei war in dem Moment belegt, und
   die App deutete das als "keine Rechte" - und merkte es sich. Weil die
   Merkung am Ursprung hängt und nicht am Tab, galt sie danach für ALLE
   Fenster und überlebte Neustart und neue Verknüpfung.

   Am Fehlernamen allein lässt sich das nicht festmachen: Welchen Namen ein
   schreibgeschütztes Netzlaufwerk liefert, ist nicht verlässlich. Also
   entscheidet ein ZWEITER VERSUCH - das ist der Unterschied, auf den es
   ankommt: Ein belegtes Schloss geht Sekundenbruchteile später auf, ein
   fehlendes Recht bleibt. Nur wenn auch der zweite Versuch scheitert, wird
   auf "nur ansehen" zurückgestuft. */
const ZWEITER_VERSUCH_MS = 600;

function mitFrist(bauer, ms, was) {
  return new Promise((ok, fehl) => {
    let erledigt = false;
    const uhr = setTimeout(() => {
      if (erledigt) return;
      erledigt = true;
      const e = new Error(`${was} antwortet nicht (Frist ${Math.round(ms / 1000)} s überschritten).`);
      e.name = "KeineAntwort";
      e.keineAntwort = true;
      fehl(e);
    }, ms);
    let p;
    try { p = bauer(); }
    catch (e) { clearTimeout(uhr); erledigt = true; fehl(e); return; }
    Promise.resolve(p).then(
      (w) => { if (erledigt) return; erledigt = true; clearTimeout(uhr); ok(w); },
      (e) => { if (erledigt) return; erledigt = true; clearTimeout(uhr); fehl(e); },
    );
  });
}

// Rechte abfragen ist eine Bequemlichkeit, keine Notwendigkeit: Bleibt die
// Auskunft aus, wird sie als "weiss nicht" behandelt und die Wahrheit kommt
// aus dem tatsaechlichen Zugriff auf die Datei.
async function rechteFragen(handle, mode) {
  if (!handle || !handle.queryPermission) return "unbekannt";
  try {
    return await mitFrist(() => handle.queryPermission({ mode }), FRIST_FRAGE, "Die Rechteauskunft des Browsers");
  } catch (e) {
    return "unbekannt";
  }
}

/* ---------- Zusammenführen (exportiert, damit testbar; zustandslos) ---------- */
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

// Beim Vergleich "hat sich wirklich etwas geändert?" bleiben Zeitstempel und
// Urheber außen vor. Sonst gälte jeder Eintrag als geändert, sobald ihn ein
// anderes Gerät zuletzt angefasst hat - und beim nächsten Speichern bekäme der
// ganze Bestand einen neuen Zeitstempel. Das Zusammenführen entscheidet nach
// Zeitstempel; ein solcher Rundumschlag würde die Änderungen der anderen
// verdrängen. Der Vergleich muss also blind für beide Felder sein.
const OHNE_SPUR = ({ updatedAt, geaendertVon, ...rest }) => rest;

// Versieht geänderte/neue Einträge mit Zeitstempel und Urheber und meldet
// Löschungen. Der Urheber steht damit AM EINTRAG - dauerhaft, auch wenn die
// Verlaufszeilen nach 90 Tagen herausaltern oder bei vielen Änderungen auf
// einen Sammeleintrag zusammengefasst wurden.
/* Eine Millisekunde nach dem übergebenen Zeitpunkt. */
function knappDanach(iso) {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? nowISO() : new Date(ms + 1).toISOString();
}

/* Welchen Zeitstempel bekommt eine Änderung?
   Normalerweise die aktuelle Uhrzeit. Trägt der Eintrag aber bereits einen
   Stempel, der GLEICH ODER NEUER ist, wäre die eigene Änderung beim
   Zusammenführen sofort wieder verloren - dort entscheidet allein der größere
   Stempel. Genau das passiert, wenn die Uhr dieses Rechners nachgeht: Alles,
   was von hier kommt, verliert jeden Vergleich, und niemand merkt es, weil
   die Kontroll-Lesung eine fremde neuere Fassung als Bestätigung durchgehen
   lässt (gemessen am 05.08.2026 mit 40 Minuten Versatz).
   Deshalb gilt: Wer eine Fassung vor sich hat und sie ändert, muss danach
   auch den größeren Stempel tragen - unabhängig davon, wie die Uhren stehen. */
function neuerStempel(jetzt, prev) {
  const alt = prev && prev.updatedAt ? String(prev.updatedAt) : "";
  return alt && alt >= jetzt ? knappDanach(alt) : jetzt;
}

export function stampEntries(nextEntries, prevEntries) {
  const strip = OHNE_SPUR;
  const prevById = new Map((prevEntries || []).map((e) => [e.id, e]));
  const t = nowISO();
  const ich = werBinIch();
  const stamped = nextEntries.map((e) => {
    const prev = prevById.get(e.id);
    if (prev && prev.updatedAt && JSON.stringify(strip(prev)) === JSON.stringify(strip(e))) {
      // Unverändert: Zeitstempel UND Urheber des anderen bleiben stehen.
      return { ...e, updatedAt: prev.updatedAt, ...(prev.geaendertVon ? { geaendertVon: prev.geaendertVon } : {}) };
    }
    // Systemeinträge (Einstellungen, Verlaufszeilen) tragen ihren Urheber
    // bereits selbst bzw. gehören niemandem - sie bleiben unberührt.
    if (istSystemEintrag(e)) return { ...e, updatedAt: neuerStempel(t, prev) };
    return { ...e, updatedAt: neuerStempel(t, prev), geaendertVon: ich };
  });
  const removed = [];
  prevById.forEach((_, id) => {
    if (!nextEntries.some((e) => e.id === id)) removed.push(id);
  });
  return { stamped, removed };
}

/* Die Lösch-Merkliste altert NICHT nach der Uhr des einzelnen Rechners.
   Grund: Wer die Liste kürzt, kürzt sie für alle - sie steht in der
   gemeinsamen Datei. Ein Rechner, dessen Uhr weit vorgeht (falsches Jahr nach
   leerer Knopfzelle), hätte mit "jetzt minus 180 Tage" die ganze Merkliste
   geleert, und die nächste alte Kopie oder OneDrive-Konfliktkopie hätte
   längst Gelöschtes wieder auferstehen lassen.
   Bezugspunkt ist deshalb der FRÜHERE der beiden Werte: die eigene Uhr oder
   die jüngste Löschmarke in der Datei. Geht eine Uhr vor, gewinnt die Datei;
   steht eine falsche Marke in der Zukunft, gewinnt die Uhr. Beide Fehler
   führen damit in dieselbe, ungefährliche Richtung: Es wird eher zu wenig
   aufgeräumt als zu viel. */
function pruneTombstones(deleted) {
  const marken = Object.keys(deleted).map((id) => Date.parse(deleted[id])).filter((ms) => !Number.isNaN(ms));
  if (marken.length === 0) return;
  const juengste = Math.max(...marken);
  const bezug = Math.min(Date.now(), juengste);
  const cutoff = new Date(bezug - TOMBSTONE_MAX_AGE_MS).toISOString();
  Object.keys(deleted).forEach((id) => {
    if (String(deleted[id]) < cutoff) delete deleted[id];
  });
}

// Die Grundeinstellungen liegen als eigene Einträge in derselben Liste
// (id "config|team", "config|riItems", ...). Diese beiden Helfer trennen sie
// von den fachlichen Einträgen - die App bekommt nie Config-Einträge in ihre
// Terminliste, sonst würde das nächste Speichern sie als gelöscht melden.
const CONFIG_PREFIX = "config|";
const LOG_PREFIX = "log|";
const LOG_MAX_AGE_MS = 90 * 24 * 3600 * 1000; // Verlauf: 90 Tage aufheben
function istConfigEintrag(e) {
  return !!e && String(e.id || "").startsWith(CONFIG_PREFIX);
}
function istLogEintrag(e) {
  return !!e && String(e.id || "").startsWith(LOG_PREFIX);
}
// Einträge, die zur Verwaltung gehören und nicht in die Terminliste der App dürfen.
function istSystemEintrag(e) {
  return istConfigEintrag(e) || istLogEintrag(e);
}
function extractConfigEntries(entries) {
  return (entries || []).filter(istConfigEintrag);
}
function ohneSystemEntries(entries) {
  return (entries || []).filter((e) => !istSystemEintrag(e));
}
/* ---------- Verlauf: wer hat wann was geändert ---------- */
// Verlaufszeilen sind gewöhnliche Einträge mit eindeutiger, nie wieder
// veränderter id. Dadurch können sie beim Zusammenführen nicht kollidieren -
// zwei Bearbeiter schreiben schlicht zwei verschiedene Zeilen.
export function extractLogEntries(entries) {
  return (entries || []).filter(istLogEintrag)
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || ""))); // neueste zuerst
}
function werBinIch() {
  try {
    const n = (localStorage.getItem("werkstatt-kalender-name") || "").trim();
    return n || "Unbekannt";
  } catch (e) { return "Unbekannt"; }
}
function macheLogEintrag(text, ts) {
  const t = ts || nowISO();
  return {
    id: LOG_PREFIX + t + "-" + Math.random().toString(36).slice(2, 8),
    date: t.slice(0, 10),
    ts: t,
    wer: werBinIch(),
    was: text,
    updatedAt: t,
  };
}
// Verlaufszeilen altern heraus. Bewusst NUR nach Alter (nicht nach Anzahl):
// So kommen alle Geräte auf dasselbe Ergebnis und löschen sich nicht
// gegenseitig Zeilen weg, die der andere gerade noch für gültig hält.
function pruneLogs(entries) {
  const cutoff = new Date(Date.now() - LOG_MAX_AGE_MS).toISOString();
  return (entries || []).filter((e) => !istLogEintrag(e) || String(e.ts || e.updatedAt || "") >= cutoff);
}
// Kurzbeschreibung eines Eintrags für den Verlauf ("Wartung BTS am 13.07.2026").
function benenneEintrag(e) {
  if (!e) return "Eintrag";
  const art = { TPM: "Wartung", RI: "R+I", ARBEIT: "Arbeit", SCHICHT: "Schicht", NOTIZ: "Notiz", ZETTEL: "Zettel" }[e.category] || e.category || "Eintrag";
  const name = e.name || e.anlage || e.stoerung || "";
  const datum = e.date ? " am " + String(e.date).split("-").reverse().join(".") : "";
  return (name ? `${art} ${name}` : art) + datum;
}

// Baut aus den Config-Einträgen wieder das Objekt {tpmAnlagen, riItems, team, ...},
// mit dem die App arbeitet. Null, wenn (noch) keine Config-Einträge vorliegen.
function configAusEintraegen(entries) {
  const teile = extractConfigEntries(entries);
  if (teile.length === 0) return null;
  const cfg = {};
  teile.forEach((e) => {
    if (e.value !== undefined) cfg[String(e.id).slice(CONFIG_PREFIX.length)] = e.value;
  });
  return cfg;
}

/* ==================================================================== */
/* Programm-Fassung (Desktop-Brücke)                                    */
/* ==================================================================== */
/* Läuft die App als installierbares Programm (Electron), stellt dessen
   Vorspann-Skript window.__werkstattDesktop bereit: direkte Dateizugriffe
   über echte Pfade, ohne Browser-Sandkasten. Die Brücke wird hier in
   Objekte übersetzt, die GENAU so aussehen wie die Dateiverweise des
   Browsers (getFile / createWritable / queryPermission …).

   Warum dieser Umweg statt eines eigenen Speicherwegs: Die gesamte
   Sync-Logik - Zusammenführen, Kontroll-Lesung, optimistische Sperre,
   Löschmarken - arbeitet ausschließlich über diese Verweis-Schnittstelle.
   Bleibt die Schnittstelle gleich, bleibt die Sync-Logik unangetastet,
   und die 39 bestehenden Prüfreihen gelten für beide Fassungen.

   Was sich dadurch ändert, ist nur die Verbindungsschicht:
   - Verweise sind PFADE (merkbar als Text, gehen nie verloren),
   - Rechte-Fragen entfallen (das Dateisystem entscheidet, nicht der Browser),
   - die Kennkarte zeigt den vollen echten Pfad. */
function desktopBruecke() {
  return (typeof window !== "undefined" && window.__werkstattDesktop) || null;
}
function istDesktop() {
  return !!desktopBruecke();
}
function desktopDateiHandle(pfad) {
  const d = desktopBruecke();
  const name = String(pfad).split(/[\\/]/).pop();
  return {
    kind: "file",
    name,
    pfad, // volle Wegangabe - gibt es im Browser nicht, hier schon
    async getFile() {
      const r = await d.lese(pfad);
      if (!r) { const e = new Error("Datei nicht gefunden: " + pfad); e.name = "NotFoundError"; throw e; }
      return new File([r.bytes], name, { lastModified: r.geaendert });
    },
    async createWritable() {
      let puffer = "";
      return {
        async write(teil) { puffer += teil; },
        // Geschrieben wird erst beim Abschluss, und zwar in einem Zug über
        // eine Zwischendatei mit Umbenennen - halbe Dateien gibt es so nicht.
        async close() { await d.schreibe(pfad, puffer); },
        async abort() { puffer = ""; },
      };
    },
    // Rechtefragen stellt das Programm nicht - ob geschrieben werden darf,
    // entscheiden die Datei-Rechte des Laufwerks beim Schreibversuch selbst,
    // genau wie bei jedem anderen Programm.
    async queryPermission() { return "granted"; },
    async requestPermission() { return "granted"; },
  };
}
function desktopOrdnerHandle(pfad, { nurLesen = false } = {}) {
  const d = desktopBruecke();
  const name = String(pfad).split(/[\\/]/).pop() || String(pfad);
  return {
    kind: "directory",
    name,
    pfad,
    nurLesen,
    async *entries() {
      const liste = await d.liste(pfad);
      for (const eintrag of liste || []) {
        yield [eintrag.name, desktopDateiHandle(eintrag.pfad)];
      }
    },
    async getFileHandle(dateiName) {
      const liste = await d.liste(pfad);
      const treffer = (liste || []).find((e) => e.name === dateiName);
      if (!treffer) { const e = new Error("NotFoundError"); e.name = "NotFoundError"; throw e; }
      return desktopDateiHandle(treffer.pfad);
    },
    async removeEntry(dateiName) {
      // Der OEE-Ordner auf dem Firmenlaufwerk ist ausdrücklich nur lesend -
      // das setzt hier die App durch, nicht erst das Laufwerk.
      if (nurLesen) throw new Error("Dieser Ordner ist nur lesend verbunden.");
      const liste = await d.liste(pfad);
      const treffer = (liste || []).find((e) => e.name === dateiName);
      if (!treffer) { const e = new Error("NotFoundError"); e.name = "NotFoundError"; throw e; }
      await d.entferne(treffer.pfad);
    },
    async resolve(dateiHandle) {
      // Im Programm kennt jeder Verweis seinen vollen Pfad selbst -
      // resolve wird nur der Vollständigkeit halber beantwortet.
      if (dateiHandle && dateiHandle.pfad && String(dateiHandle.pfad).startsWith(String(pfad))) {
        return String(dateiHandle.pfad).slice(String(pfad).length).split(/[\\/]/).filter(Boolean);
      }
      return null;
    },
    async queryPermission() { return "granted"; },
    async requestPermission() { return "granted"; },
  };
}

/* ==================================================================== */
/* Fabrik: eine unabhängige Sync-Instanz je Datei                       */
/* ==================================================================== */
function createSharedStore(cfg) {
  const DB_NAME = cfg.dbName;
  const FORMAT = cfg.format;
  const ENTRIES_KEY = cfg.entriesKey;
  const CONFIG_KEY = cfg.configKey;
  const SUGGESTED_NAME = cfg.suggestedName;
  const EV = cfg.evPrefix; // z. B. "werkstatt-shared" -> Ereignis "werkstatt-shared-update"

  let fileHandle = null;
  // Beim Start gemerkter Verweis auf die zuletzt benutzte Datei.
  // WARUM das hier liegt und nicht erst beim Klick geholt wird:
  // requestPermission darf der Browser nur beantworten, solange die
  // Nutzeraktivierung des Klicks gilt - gemessen rund fuenf Sekunden. Sie
  // ueberlebt ein await, aber nicht beliebig lange. Wuerde reconnect() den
  // Verweis erst aus der IndexedDB holen, laege dazwischen zweimal ein
  // vollstaendiges Oeffnen der Datenbank. Auf einem frisch hochgefahrenen
  // Rechner (kalte Platte, Virenscanner, OneDrive) dauert das laenger als
  // die Aktivierung haelt, und der Browser antwortet mit
  // "Not allowed to request permissions in this context".
  let gemerkterHandle = null;
  let gemerkterModus = "readwrite";
  // true, wenn die Frage nach dem Schreibzugriff gar nicht erst beim Browser
  // ankam (abgelaufene Nutzeraktivierung). Dann ist der Schreibschutz KEIN
  // Urteil ueber die Rechte, sondern nur eine nicht gestellte Frage - und die
  // Oberflaeche bietet einen Knopf an, sie nachzuholen.
  let schreibfrageOffen = false;
  let accessMode = null; // "readwrite" | "read"
  let lastWriteError = null; // technischer Grund, warum das Schreiben zuletzt scheiterte
  let lastSavedAt = null;
  let pollTimer = null;
  // Konflikt-Wächter: Ordner-Zugriff, um OneDrive-Konfliktkopien automatisch einzusammeln
  let folderHandle = null;
  /* Kennkarte der verbundenen Datei. Der Browser gibt einen Pfad nicht heraus -
     ein Dateiverweis kennt nur getFile/createWritable/move, sonst nichts. Zwei
     Dateien gleichen Namens sind damit am Namen NICHT zu unterscheiden, und
     genau daran ist der 03.08. gescheitert. Was sich sehr wohl feststellen
     lässt: Größe, letzte Änderung, Zahl der Einträge - und, sofern der
     Werkstatt-Ordner freigegeben ist, der Weg innerhalb dieses Ordners. */
  let uhrVersatzMs = 0;      // wie weit die Zeitangaben in der Datei in der Zukunft liegen
  let dateiInfo = null;   // { groesse, geaendert, eintraege }
  let dateiPfad = "";     // z. B. "Werkstatt/werkstatt-kalender-daten.json"
  let folderPerm = "none"; // "ok" | "needs-permission" | "none"
  // Zweiter, rein lesender Ordner für fremde Tabellen (OEE auf dem Firmenlaufwerk)
  let quellHandle = null;
  let quellPerm = "none";

  /* ---------- Status ---------- */
  function isSupported() {
    if (istDesktop()) return true; // Programm-Fassung: Dateizugriff immer da
    return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
  }
  function isConnected() {
    return !!fileHandle;
  }
  function canWrite() {
    return accessMode === "readwrite";
  }
  /* Alles, woran sich zwei gleichnamige Dateien auseinanderhalten lassen. */
  function fileInfo() {
    return {
      name: fileHandle ? fileHandle.name : "",
      ordner: folderHandle ? folderHandle.name : "",
      pfad: dateiPfad,
      groesse: dateiInfo ? dateiInfo.groesse : null,
      geaendert: dateiInfo ? dateiInfo.geaendert : null,
      eintraege: dateiInfo ? dateiInfo.eintraege : null,
    };
  }
  /* Wo liegt die Datei innerhalb des freigegebenen Ordners? Das ist die einzige
     Wegangabe, die der Browser herausgibt - und auch nur dann. */
  async function ermittlePfad() {
    dateiPfad = "";
    // Im Programm kennt der Verweis seinen vollen Pfad selbst - das ist die
    // Angabe, die der Browser nie herausgibt und an der der 03.08. scheiterte.
    if (fileHandle && fileHandle.pfad) { dateiPfad = fileHandle.pfad; return; }
    if (!folderHandle || !fileHandle) return;
    try {
      const teile = await folderHandle.resolve(fileHandle);
      if (teile) dateiPfad = [folderHandle.name].concat(teile).join(" / ");
    } catch (e) { /* ohne Ordner-Freigabe bleibt es beim Namen */ }
  }

  function fileName() {
    return fileHandle ? fileHandle.name : "";
  }
  function getLastWriteError() { return lastWriteError; }

  /* ---------- IndexedDB (merkt sich die gewählte Datei) ---------- */
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
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

  /* ---------- Verweise merken: Browser vs. Programm ----------------------
     Im Browser wird der Dateiverweis selbst in der IndexedDB abgelegt (nur
     dort lebt er). Im Programm ist der Verweis ein PFAD - schlichter Text,
     der in der Einstellungsdatei des Programms liegt und jeden Neustart
     unbeschadet uebersteht. Genau dieser Unterschied beerdigt die ganze
     Klasse "Verweis tot / Rechte weg / Schreibschutz nach Neustart". */
  async function merkeVerweis(schluessel, handle) {
    const d = desktopBruecke();
    if (d && handle && handle.pfad) return d.merke(DB_NAME + ":" + schluessel, handle.pfad);
    return idbSet(schluessel, handle);
  }
  async function holeVerweis(schluessel, alsOrdner, ordnerOpts) {
    const d = desktopBruecke();
    if (d) {
      const pfad = await d.gemerkt(DB_NAME + ":" + schluessel);
      if (!pfad) return null;
      return alsOrdner ? desktopOrdnerHandle(pfad, ordnerOpts) : desktopDateiHandle(pfad);
    }
    return idbGet(schluessel);
  }
  async function vergissVerweis(schluessel) {
    const d = desktopBruecke();
    if (d) return d.merke(DB_NAME + ":" + schluessel, null);
    return idbDel(schluessel);
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
  /* Welche Sicherungen bleiben liegen? Zwei Körbe, die sich überschneiden dürfen:
     die 30 jüngsten (feinmaschig für "eben gerade") und je Kalendertag der
     letzte Stand für 14 Tage (grobmaschig für "gestern war es noch da").
     Ohne den zweiten Korb spülen ein paar Stunden Normalbetrieb den ganzen
     Vortag aus dem Speicher - siehe Messung bei BACKUP_TAGE. */
  function behalteSicherungen(alle) {
    const neuesteZuerst = alle.slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    const behalten = new Set(neuesteZuerst.slice(0, BACKUP_MAX_COUNT).map((b) => b.ts));
    const tage = new Set();
    for (const b of neuesteZuerst) {
      const tag = String(b.ts).slice(0, 10);
      if (tage.has(tag)) continue;      // je Tag reicht der jüngste Stand
      if (tage.size >= BACKUP_TAGE) break;
      tage.add(tag);
      behalten.add(b.ts);
    }
    return behalten;
  }

  async function recordBackup(entries, config) {
    try {
      const ts = nowISO();
      await idbAddBackup({ ts, entries: entries || [], config: config || null });
      const all = await idbGetAllBackups();
      const behalten = behalteSicherungen(all);
      for (const b of all) {
        if (!behalten.has(b.ts)) await idbDelBackup(b.ts);
      }
    } catch (e) { /* Sicherung ist ein Zusatz - das eigentliche Speichern hat schon geklappt */ }
  }
  // Neueste zuerst - fürs Anzeigen/Wiederherstellen im Verwalten-Dialog.
  // "anzahl" ist bewusst die Zahl der FACHLICHEN Einträge: In den Sicherungen
  // stehen auch Einstellungen und Verlaufszeilen. Gemessen an einem Beispiel
  // mit einem einzigen Termin zeigte die Liste "5 Einträge" - nach dieser Zahl
  // sucht man sich aber den Wiederherstellungspunkt aus.
  async function listBackups() {
    try {
      const all = await idbGetAllBackups();
      return all
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
        .map((b) => ({ ...b, anzahl: ohneSystemEntries(b.entries).length }));
    } catch (e) { return []; }
  }

  /* ---------- Ereignisse an die App ---------- */
  function dispatchUpdate(data) {
    window.dispatchEvent(new CustomEvent(EV + "-update", {
      detail: { entries: ohneSystemEntries(data.entries), config: configAusEintraegen(data.entries) || data.config, deleted: data.deleted, verlauf: extractLogEntries(data.entries) },
    }));
  }
  function dispatchConfigUpdate(entries) {
    // Nur die Grundeinstellungen melden (bewusst OHNE entries): Nach dem
    // eigenen Speichern kann die Kontroll-Lesung eine frische Änderung der
    // ANDEREN enthalten - z. B. eine Rechteänderung in der Benutzerliste.
    // Der 30-Sekunden-Abgleich schweigt danach aber (lastSavedAt = eigener
    // Stand); die App erführe die Änderung erst, wenn ein FREMDES Gerät die
    // Datei erneut anfasst. Gemessen in harte-42, Fall (11): Ein
    // herabgestufter Bearbeiter behielte seine Rechte auf unbestimmte Zeit.
    const cfg = configAusEintraegen(entries);
    if (cfg) window.dispatchEvent(new CustomEvent(EV + "-update", { detail: { config: cfg } }));
  }
  function dispatchError(message) {
    window.dispatchEvent(new CustomEvent(EV + "-error", { detail: message }));
  }
  function dispatchOk() {
    window.dispatchEvent(new CustomEvent(EV + "-ok"));
  }
  // Grüne Hinweis-Meldung (kein Fehler), z. B. "Konfliktkopie eingesammelt"
  function dispatchInfo(message) {
    window.dispatchEvent(new CustomEvent(EV + "-info", { detail: message }));
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
  /* Die Zeitstempel in der Datei kommen von den Uhren der beteiligten Rechner.
     Liegen sie deutlich in der Zukunft, stimmt eine dieser Uhren nicht - und
     zwar so, dass jede Zeitangabe in der App und im Prüfnachweis daneben
     liegt. Der Datenverlust daraus ist behoben (siehe neuerStempel), die
     falsche Uhrzeit bleibt aber ein Mangel, den nur ein Mensch beheben kann.
     Drei Minuten Spielraum: Normale Rechner im Firmennetz liegen weit darunter. */
  const UHR_TOLERANZ_MS = 3 * 60 * 1000;
  function pruefeUhr(data) {
    let groesster = String(data.savedAt || "");
    (data.entries || []).forEach((e) => {
      const u = String(e.updatedAt || "");
      if (u > groesster) groesster = u;
    });
    if (!groesster) return;
    const versatz = Date.parse(groesster) - Date.now();
    // Als bleibender Zustand, nicht als Fehlermeldung: Eine falsche Uhr ist
    // kein Vorfall, der vorübergeht - die nächste Erfolgsmeldung würde einen
    // Hinweis sofort wieder wegräumen, und niemand hätte ihn gesehen.
    uhrVersatzMs = Number.isNaN(versatz) || versatz <= UHR_TOLERANZ_MS ? 0 : versatz;
  }
  // Wie viele Minuten die Zeitangaben in der Datei vorausliegen (0 = in Ordnung).
  function uhrVersatz() {
    return uhrVersatzMs > 0 ? Math.round(uhrVersatzMs / 60000) : 0;
  }

  async function readFileData() {
    const file = await mitFrist(() => fileHandle.getFile(), FRIST_LESEN, "Das Öffnen der Datei");
    const text = await mitFrist(() => file.text(), FRIST_LESEN, "Das Lesen der Datei");
    dateiInfo = { groesse: file.size, geaendert: file.lastModified, eintraege: null };
    if (!text.trim()) { dateiInfo.eintraege = 0; return emptyData(); }
    try {
      const gelesen = normalizeData(JSON.parse(text));
      dateiInfo.eintraege = ohneSystemEntries(gelesen.entries).length;
      pruefeUhr(gelesen);
      return gelesen;
    } catch (e) {
      // Gemessen, wie es ohne diese Stelle aussah: "Expected double-quoted
      // property name in JSON at position 182 (line 9 column 2)". Das ist der
      // rohe Text des JavaScript-Lesers - fuer die Werkstatt unbrauchbar.
      // Es passiert bei einem mitten im Schreiben abgebrochenen Abgleich, und
      // in dem Moment braucht der Bediener zwei Auskuenfte: Es ist nichts
      // kaputtgeschrieben, und was er tun soll.
      const fehler = new Error(
        `Die gemeinsame Datei „${fileHandle ? fileHandle.name : ""}" ist unvollständig ` +
        `(${text.length} Zeichen gelesen, Ende fehlt). Das passiert, wenn ein Abgleich ` +
        `mitten im Schreiben abbricht – etwa weil ein Rechner ausgeschaltet wurde. ` +
        `Es wurde nichts überschrieben, deine Arbeit ist lokal gesichert. ` +
        `Meist ist die Datei nach dem nächsten OneDrive-Abgleich wieder vollständig – ` +
        `kurz warten und erneut speichern. Bleibt es dabei: ⚙ → Sicherungen.`,
      );
      fehler.name = "DateiUnvollstaendig";
      fehler.dateiKaputt = true;
      throw fehler;
    }
  }
  async function writeFileData(data) {
    const inhalt = JSON.stringify(data, null, 2);
    const writable = await mitFrist(() => fileHandle.createWritable(), FRIST_SCHREIBEN, "Das Öffnen zum Schreiben");
    try {
      await mitFrist(() => writable.write(inhalt), FRIST_SCHREIBEN, "Das Schreiben");
      await mitFrist(() => writable.close(), FRIST_SCHREIBEN, "Das Abschliessen des Schreibens");
    } catch (e) {
      // Ein halb geschriebener Datenstrom darf nicht offen liegen bleiben - sonst
      // haelt der Browser die Datei fest und der naechste Versuch scheitert auch.
      try { await mitFrist(() => writable.abort(), 2000, "Der Abbruch"); } catch (e2) { /* dann eben nicht */ }
      throw e;
    }
  }

  /* ---------- Lokalen Zwischenspeicher angleichen ---------- */
  function syncLocal(data) {
    try {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(ohneSystemEntries(data.entries)));
      const cfg = configAusEintraegen(data.entries);
      if (cfg) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
      } else if (data.config) {
        // Datei im alten Format (Config als Block) - bis zur Übernahme weiter lesen
        const { updatedAt, ...alt } = data.config;
        localStorage.setItem(CONFIG_KEY, JSON.stringify(alt));
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
    // Kennkarte: Wegangabe nachtragen. Im Programm ist das der volle echte
    // Pfad des Verweises; im Browser geht es nur ueber den freigegebenen
    // Ordner. Hier ist der eine Punkt, durch den JEDER Verbindungsweg laeuft.
    ermittlePfad();
    let data = justCreated ? emptyData() : await readFileData();

    if (accessMode === "readwrite") {
      // Lokalen Bestand in die Datei einpflegen (erste Übernahme bzw. Wiederverbinden).
      const localEntries = Array.isArray(readLocalJSON(ENTRIES_KEY)) ? readLocalJSON(ENTRIES_KEY) : [];
      let merged = mergeEntries(data.entries, localEntries, data.deleted);
      merged = merged.map((e) => (e.updatedAt ? e : { ...e, updatedAt: nowISO() }));
      // Alt-Format (config als Block) einmalig in Config-Einträge überführen; sonst lokalen Stand einpflegen.
      const vorhandeneConfigIds = new Set(extractConfigEntries(merged).map((e) => e.id));
      const quelle = data.config || readLocalJSON(CONFIG_KEY);
      if (quelle && typeof quelle === "object") {
        Object.keys(quelle).forEach((key) => {
          if (key === "updatedAt") return;
          const id = "config|" + key;
          if (vorhandeneConfigIds.has(id)) return; // Datei-Stand hat Vorrang
          merged.push({ id, date: "", value: quelle[key], updatedAt: nowISO() });
        });
      }
      const candidate = { format: FORMAT, savedAt: nowISO(), entries: merged, deleted: data.deleted, config: configAusEintraegen(merged) || data.config };
      let geschrieben = false;
      let letzterFehler = null;
      // Zwei Anläufe: Der erste kann an einer belegten Datei scheitern (zweites
      // Fenster, OneDrive-Abgleich, Virenscanner). Erst wenn auch der zweite
      // scheitert, fehlt das Recht wirklich.
      for (let versuch = 0; versuch < 2 && !geschrieben; versuch++) {
        if (versuch > 0) await new Promise((r) => setTimeout(r, ZWEITER_VERSUCH_MS));
        try {
          await writeFileData(candidate);
          geschrieben = true;
        } catch (e) {
          letzterFehler = e;
          if (justCreated) throw e; // neue Datei ließ sich gar nicht anlegen -> echter Fehler
        }
      }
      if (geschrieben) {
        data = candidate;
        lastWriteError = null;
      } else {
        const e = letzterFehler;
        lastWriteError = `${e && e.name ? e.name : "Fehler"}: ${e && e.message ? e.message : e}`;
        accessMode = "read"; // auch der zweite Versuch scheiterte -> nur ansehen
        // WICHTIG: Zurückstufung auch merken. Sonst stünde nach dem nächsten
        // Browser-Neustart fälschlich "readwrite" in der Merkliste und ein reiner
        // Leser würde bis zum Klick auf "Jetzt verbinden" als Bearbeiter gelten.
        try { await idbSet("mode", "read"); } catch (e2) { /* egal */ }
      }
    }

    lastSavedAt = data.savedAt;
    syncLocal(data);
    dispatchUpdate(data);
    await recordBackup(data.entries, data.config);
    return data;
  }

  /* ---------- Verbinden / Trennen ---------- */
  async function pickShared({ create = false } = {}) {
    const types = [{ description: "Werkstatt-Cockpit Daten", accept: { "application/json": [".json"] } }];
    let handle;
    const bruecke = desktopBruecke();
    if (bruecke) {
      // Programm: echter Dateidialog des Betriebssystems, Ergebnis ist ein Pfad.
      const pfad = create
        ? await bruecke.waehleDateiNeu(SUGGESTED_NAME)
        : await bruecke.waehleDatei();
      if (!pfad) { const e = new Error("Abgebrochen"); e.name = "AbortError"; throw e; }
      handle = desktopDateiHandle(pfad);
    } else if (create) {
      handle = await window.showSaveFilePicker({ suggestedName: SUGGESTED_NAME, types });
    } else {
      [handle] = await window.showOpenFilePicker({ types });
    }
    // Der Dateidialog gibt nur LESE-Zugriff. Schreiben muss ausdruecklich
    // erlaubt werden - und diese Frage muss als ALLERERSTES kommen, ohne ein
    // einziges await davor. Die Nutzeraktivierung gilt nur rund fuenf
    // Sekunden, und der Dateidialog hat davon schon einen Teil verbraucht.
    // (Ein queryPermission vorweg waere genau so ein await zu viel.)
    schreibfrageOffen = false;
    if (handle.requestPermission) {
      try {
        const p = await mitFrist(() => handle.requestPermission({ mode: "readwrite" }),
                                 FRIST_NACHFRAGE, "Die Frage nach dem Schreibzugriff");
        if (p === "denied") throw new Error("Der Zugriff auf die Datei wurde nicht erlaubt.");
      } catch (e) {
        if (keineAntwort(e) || /Not allowed to request permissions/.test(String(e && e.message || ""))) {
          // Die Frage kam nicht mehr durch, weil der Dialog zu lange offen
          // stand. Das ist KEINE Ablehnung - deshalb hier nicht abbrechen,
          // sondern merken. Die Oberflaeche bietet dann einen Knopf an, die
          // Frage aus einem frischen Klick heraus nachzuholen.
          schreibfrageOffen = true;
        } else { throw e; }
      }
    }
    fileHandle = handle;
    accessMode = "readwrite"; // adoptCurrentFile stuft bei fehlenden Laufwerks-Rechten auf "read" zurück
    try {
      await merkeVerweis("handle", handle);
      await idbSet("mode", "readwrite");
    } catch (e) {
      // Verweis lässt sich nicht merken (z. B. IndexedDB blockiert) – Verbindung gilt
      // trotzdem für diese Sitzung, nach dem Neustart muss die Datei neu gewählt werden.
    }
    const data = await adoptCurrentFile(create);
    startPolling();
    return data;
  }

  async function tryRestore() {
    if (!isSupported()) return { status: "unsupported" };
    let handle = null;
    let mode = "readwrite";
    try {
      handle = await holeVerweis("handle");
      mode = (await idbGet("mode")) || "readwrite";
    } catch (e) { /* IndexedDB nicht verfügbar */ }
    if (!handle) return { status: "none" };
    gemerkterHandle = handle;   // fuer den spaeteren Klick auf "Jetzt verbinden"
    gemerkterModus = mode;
    // Konflikt-Wächter: gemerkten Ordner mit wiederherstellen (falls eingerichtet)
    try {
      const fh = await holeVerweis("folder", true);
      if (fh) {
        folderHandle = fh;
        ermittlePfad();          // Weg innerhalb des Ordners nachtragen
        const fp = await rechteFragen(fh, "readwrite");
        folderPerm = fp === "granted" ? "ok" : "needs-permission";
      }
    } catch (e) { /* IndexedDB nicht verfügbar */ }
    // Quellordner (OEE-Tabelle auf dem Firmenlaufwerk) mit wiederherstellen
    try {
      const qh = await holeVerweis("quellordner", true, { nurLesen: true });
      if (qh) {
        quellHandle = qh;
        const qp = await rechteFragen(qh, "read");
        quellPerm = qp === "granted" ? "ok" : "needs-permission";
      }
    } catch (e) { /* IndexedDB nicht verfügbar */ }

    // Solange der Browser eine Auskunft GIBT, gilt sie - auch ein "prompt".
    // Das ist keine Formsache: "prompt" heisst, der Zugriff ist noch nicht
    // erteilt. Wer sich darueber mit einem Leseversuch hinwegsetzt, landet
    // schweigend im Schreibschutz, sobald nur das Lesen erlaubt ist. Der
    // Nutzer soll stattdessen einmal auf "Jetzt verbinden" klicken.
    //
    // Der Probelauf greift ausschliesslich dann, wenn GAR KEINE Antwort kommt -
    // der am Arbeitsplatz gemessene Fall. Vorher war er auch bei "prompt" aktiv
    // und hat damit das Wiederverbinden nach dem Browser-Neustart uebergangen.
    const perm = await rechteFragen(handle, mode);
    if (perm !== "granted" && perm !== "unbekannt") {
      return { status: "needs-permission", name: handle.name, mode };
    }

    if (perm === "unbekannt") {
      try {
        // Kuerzere Frist als beim normalen Lesen: Hier geht es nur um die Frage,
        // ob der Verweis ueberhaupt noch lebt. Der Nutzer soll beim Start nicht
        // eine Viertelminute vor einem grauen Symbol sitzen.
        await mitFrist(() => handle.getFile(), FRIST_PROBE, "Das Öffnen der gemerkten Datei");
      } catch (e) {
        if (keineAntwort(e)) {
          // Der Verweis ist tot: Der Browser gibt ihn weder frei noch lehnt er
          // ihn ab. Kein Klick der Welt loest das - die Datei muss neu gewaehlt
          // werden. Frueher blieb die App genau hier haengen.
          return { status: "verweis-tot", name: handle.name, mode };
        }
        // Echte Ablehnung (NotAllowedError) oder Laufwerk weg -> ein Klick hilft.
        return { status: "needs-permission", name: handle.name, mode };
      }
    }

    fileHandle = handle;
    accessMode = mode;
    try {
      await adoptCurrentFile(false);
    } catch (e) {
      if (keineAntwort(e)) {
        fileHandle = null;
        return { status: "verweis-tot", name: handle.name, mode };
      }
      dispatchError("Gemeinsame Datei konnte nicht gelesen werden (Laufwerk erreichbar?).");
    }
    startPolling();
    return { status: "connected", name: handle.name, mode: accessMode };
  }

  // Zugriff nach Browser-Neustart wieder freigeben (braucht einen Klick des Nutzers).
  //
  // ACHTUNG - die Reihenfolge ist hier keine Geschmacksfrage:
  // requestPermission MUSS als Erstes kommen, ohne ein einziges await davor.
  // Der Browser beantwortet die Frage nur, solange die Nutzeraktivierung des
  // Klicks gilt. Frueher stand hier zweimal ein Lesen aus der IndexedDB - auf
  // einem gerade hochgefahrenen Rechner dauerte das laenger als die
  // Aktivierung haelt, und das Verbinden schlug mit
  // "Not allowed to request permissions in this context" fehl.
  async function reconnect() {
    const handle = gemerkterHandle || (await holeVerweis("handle"));
    const mode = gemerkterHandle ? gemerkterModus : ((await idbGet("mode")) || "readwrite");
    if (!handle) throw new Error("Keine gemerkte Datei gefunden.");
    const p = await mitFrist(() => handle.requestPermission({ mode }),
                             FRIST_NACHFRAGE, "Die Frage nach dem Zugriff");
    if (p !== "granted") throw new Error("Zugriff wurde nicht erlaubt.");
    fileHandle = handle;
    accessMode = mode;
    await adoptCurrentFile(false);
    startPolling();
    return { status: "connected", name: handle.name, mode: accessMode };
  }

  // Schreibzugriff erneut versuchen (z. B. wenn die Datei beim ersten Verbinden
  // gesperrt/schreibgeschützt war und man eigentlich Bearbeiter ist).
  async function retryWrite() {
    if (!fileHandle) throw new Error("Keine Datei verbunden.");
    if (fileHandle.requestPermission) {
      const p = await mitFrist(() => fileHandle.requestPermission({ mode: "readwrite" }),
                               FRIST_NACHFRAGE, "Die Frage nach dem Schreibzugriff");
      if (p !== "granted") throw new Error("Der Browser hat den Schreibzugriff nicht erlaubt.");
    }
    accessMode = "readwrite";
    schreibfrageOffen = false; // die Frage ist gestellt und beantwortet
    try { await idbSet("mode", "readwrite"); } catch (e) { /* egal */ }
    await adoptCurrentFile(false); // testet das Schreiben - fällt bei Verbot automatisch auf "read" zurück
    startPolling();
    return { status: "connected", name: fileHandle.name, mode: accessMode };
  }

  // Ausweg, wenn der Browser das Nachfragen nach Schreibrecht ueberhaupt
  // verweigert ("Not allowed to request permissions in this context").
  //
  // Der Speichern-Dialog vergibt Schreibrecht unmittelbar - ohne
  // requestPermission. Die Datei wird dabei NICHT geleert: geleert wird erst
  // beim Schreiben, und vorher liest adoptCurrentFile(false) den vorhandenen
  // Inhalt und fuehrt ihn wie bei jedem normalen Verbinden zusammen.
  async function pickWritable() {
    const types = [{ description: "Werkstatt-Cockpit Daten", accept: { "application/json": [".json"] } }];
    const vorschlag = fileHandle ? fileHandle.name : SUGGESTED_NAME;
    let handle;
    const bruecke = desktopBruecke();
    if (bruecke) {
      const pfad = await bruecke.waehleDateiNeu(vorschlag);
      if (!pfad) { const e = new Error("Abgebrochen"); e.name = "AbortError"; throw e; }
      handle = desktopDateiHandle(pfad);
    } else {
      handle = await window.showSaveFilePicker({ suggestedName: vorschlag, types });
    }
    fileHandle = handle;
    accessMode = "readwrite";
    schreibfrageOffen = false;
    gemerkterHandle = handle;
    gemerkterModus = "readwrite";
    try {
      await merkeVerweis("handle", handle);
      await idbSet("mode", "readwrite");
    } catch (e) { /* gilt dann nur fuer diese Sitzung */ }
    const data = await adoptCurrentFile(false); // vorhandenen Inhalt uebernehmen, NICHT neu anlegen
    startPolling();
    return data;
  }

  // Warum das Nachfragen scheitern kann - fuer eine ehrliche Fehlermeldung.
  function umgebung() {
    if (typeof window === "undefined") return {};
    return {
      protokoll: window.location ? window.location.protocol : "?",
      sichererKontext: !!window.isSecureContext,
      herkunft: window.location ? String(window.location.origin) : "?",
      programm: istDesktop(), // laeuft als installierbares Programm (Electron)
    };
  }

  async function disconnect() {
    stopPolling();
    fileHandle = null;
    accessMode = null;
    lastSavedAt = null;
    folderHandle = null;
    folderPerm = "none";
    try {
      await vergissVerweis("handle");
      await idbDel("mode");
      await vergissVerweis("folder");
    } catch (e) { /* egal */ }
  }

  /* Von Hand angelegte Sicherungen erkennt man an diesen Wörtern im Anhang.
     Sie werden nie eingesammelt - siehe istKonfliktkopie(). */
  const SICHERUNGS_WOERTER = [
    "sicherung", "kopie", "backup", "archiv", "alt", "old", "copy", "test",
  ];

  /* Ist das wirklich eine Konfliktkopie von OneDrive?
     OneDrive hängt den GERÄTENAMEN an: "werkstatt-kalender-daten-L-RCIRACI".
     Von Hand angelegte Sicherungen tragen dagegen ein Datum oder ein Wort wie
     "Sicherung": "werkstatt-kalender-daten-2026-08-05.json".
     Die Unterscheidung ist wichtig, weil eine erkannte Kopie nach dem
     Einsammeln GELÖSCHT wird - eine zu weite Regel räumt also fremde
     Sicherungen weg. Im Zweifel gilt deshalb: lieber nicht erkennen. Eine
     nicht erkannte Kopie bleibt liegen und wird vom Selbsttest gemeldet, das
     kostet einen Handgriff. Eine falsch erkannte Sicherung ist dagegen weg. */
  function istKonfliktkopie(basis, name) {
    if (!name.startsWith(basis + "-")) return false;
    const anhang = name.slice(basis.length + 1).replace(/\.json$/i, "");
    if (!anhang) return false;
    if (/^\d/.test(anhang)) return false;             // beginnt mit Ziffer -> Datum
    if (/\d{4}/.test(anhang)) return false;           // Jahreszahl -> Datum
    if (/\d+[-_.]\d+[-_.]\d+/.test(anhang)) return false; // 05.08.26 -> Datum
    const klein = anhang.toLowerCase();
    if (SICHERUNGS_WOERTER.some((w) => klein.split(/[-_.]/).includes(w))) return false;
    return /^[A-Za-z][A-Za-z0-9_.-]*$/.test(anhang);
  }

  /* ---------- Konflikt-Wächter ---------- */
  // OneDrive kann Konflikte bei JSON-Dateien nicht selbst zusammenführen - es
  // legt Kopien wie "werkstatt-kalender-daten-GERAET.json" an. Mit einmaliger
  // Ordner-Freigabe sammelt die App solche Kopien automatisch ein: Inhalt wird
  // Eintrag für Eintrag in die Hauptdatei gemerged (dieselbe Logik wie beim
  // gleichzeitigen Bearbeiten), danach wird die Kopie gelöscht.
  function folderStatus() {
    return folderHandle ? folderPerm : "none";
  }
  function folderName() {
    return folderHandle ? folderHandle.name : "";
  }
  async function pickFolder() {
    const bruecke = desktopBruecke();
    if (bruecke) {
      const pfad = await bruecke.waehleOrdner();
      if (!pfad) { const e = new Error("Abgebrochen"); e.name = "AbortError"; throw e; }
      folderHandle = desktopOrdnerHandle(pfad);
      folderPerm = "ok";
      ermittlePfad();
      try { await merkeVerweis("folder", folderHandle); } catch (e) { /* nur diese Sitzung */ }
      await sammleKonfliktkopien();
      return { name: folderHandle.name };
    }
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    // Gleiche Regel wie bei der Datei: zuerst fragen, ohne await davor.
    if (handle.requestPermission) {
      try {
        const p = await mitFrist(() => handle.requestPermission({ mode: "readwrite" }),
                                 FRIST_NACHFRAGE, "Die Frage nach dem Ordnerzugriff");
        if (p === "denied") throw new Error("Der Zugriff auf den Ordner wurde nicht erlaubt.");
      } catch (e) {
        if (!keineAntwort(e) && !/Not allowed to request permissions/.test(String(e && e.message || ""))) throw e;
      }
    }
    folderHandle = handle;
    folderPerm = "ok";
    ermittlePfad();
    try { await merkeVerweis("folder", handle); } catch (e) { /* gilt dann nur für diese Sitzung */ }
    await sammleKonfliktkopien();
    return { name: handle.name };
  }
  async function reconnectFolder() {
    // Auch hier gilt: kein await vor requestPermission, solange der Verweis
    // schon im Speicher liegt (tryRestore hat ihn beim Start geholt).
    const h = folderHandle || (await holeVerweis("folder", true));
    if (!h) throw new Error("Kein gemerkter Ordner gefunden.");
    const p = await mitFrist(() => h.requestPermission({ mode: "readwrite" }),
                             FRIST_NACHFRAGE, "Die Frage nach dem Ordnerzugriff");
    if (p !== "granted") throw new Error("Der Zugriff wurde nicht erlaubt.");
    folderHandle = h;
    folderPerm = "ok";
    await sammleKonfliktkopien();
    return { name: h.name };
  }
  async function forgetFolder() {
    folderHandle = null;
    folderPerm = "none";
    try { await vergissVerweis("folder"); } catch (e) { /* egal */ }
  }

  /* ---------- Quellordner: fremde Dateien NUR LESEN ----------------------
     Gedacht für die OEE-Tabelle. Die liegt auf dem Firmenlaufwerk, also NICHT
     im Datenordner - deshalb ein zweiter, eigener Ordnerzugriff.
     Zwei Dinge sind hier anders als beim Datenordner:
     - Er wird ausdrücklich nur LESEND angefragt (mode: "read"). Damit kann die
       App auf diesem Laufwerk gar nichts anrichten, auch nicht durch einen
       Fehler. Die Tabelle gehört jemand anderem.
     - Er gilt pro Gerät. Ein Ordnerzugriff lässt sich nicht weitergeben, er
       gilt nur in dem Browser, der ihn erteilt bekommen hat. In der
       gemeinsamen Datei steht deshalb nur der DATEINAME; den Ordner wählt
       jeder Arbeitsplatz einmal selbst an.
     Ist kein Quellordner eingerichtet, wird ersatzweise im Datenordner
     nachgesehen - liegt die Tabelle dort, spart das den zweiten Handgriff. */
  async function pickQuellOrdner() {
    const bruecke = desktopBruecke();
    if (bruecke) {
      const pfad = await bruecke.waehleOrdner();
      if (!pfad) { const e = new Error("Abgebrochen"); e.name = "AbortError"; throw e; }
      // nurLesen setzt die App selbst durch - loeschen ist auf diesem
      // Ordner ausgeschlossen, egal was das Laufwerk erlauben wuerde.
      quellHandle = desktopOrdnerHandle(pfad, { nurLesen: true });
      quellPerm = "ok";
      try { await merkeVerweis("quellordner", quellHandle); } catch (e) { /* nur diese Sitzung */ }
      return { name: quellHandle.name };
    }
    const handle = await window.showDirectoryPicker({ mode: "read" });
    if (handle.requestPermission) {
      try {
        const p = await mitFrist(() => handle.requestPermission({ mode: "read" }),
                                 FRIST_NACHFRAGE, "Die Frage nach dem Ordnerzugriff");
        if (p === "denied") throw new Error("Der Zugriff auf den Ordner wurde nicht erlaubt.");
      } catch (e) {
        if (!keineAntwort(e) && !/Not allowed to request permissions/.test(String(e && e.message || ""))) throw e;
      }
    }
    quellHandle = handle;
    quellPerm = "ok";
    try { await merkeVerweis("quellordner", handle); } catch (e) { /* gilt dann nur für diese Sitzung */ }
    return { name: handle.name };
  }
  async function reconnectQuellOrdner() {
    const h = quellHandle || (await holeVerweis("quellordner", true, { nurLesen: true }));
    if (!h) throw new Error("Kein gemerkter Quellordner gefunden.");
    const p = await mitFrist(() => h.requestPermission({ mode: "read" }),
                             FRIST_NACHFRAGE, "Die Frage nach dem Ordnerzugriff");
    if (p !== "granted") throw new Error("Der Zugriff wurde nicht erlaubt.");
    quellHandle = h;
    quellPerm = "ok";
    return { name: h.name };
  }
  /* Quellordner direkt ueber einen eingefuegten Pfad setzen - nur im
     Programm moeglich (der Browser kann aus einem Pfad-Text keinen Zugriff
     machen, das erlaubt seine Sandbox nicht). Zeigt der Pfad auf eine
     .xlsx-DATEI, wird ihr Ordner genommen und der Dateiname mit
     zurueckgegeben - so genuegt ein einziger kopierter Pfad fuer alles. */
  async function setzeQuellOrdnerPfad(pfad) {
    const d = desktopBruecke();
    if (!d) throw new Error("Pfad einfügen geht nur in der Programm-Fassung.");
    const sauber = String(pfad || "").trim().replace(/^"|"$/g, ""); // Windows kopiert gern mit Anfuehrungszeichen
    if (!sauber) throw new Error("Kein Pfad angegeben.");
    const art = await d.pfadInfo(sauber);
    if (!art) throw new Error(`Unter „${sauber}" wurde nichts gefunden - Pfad und Laufwerk prüfen.`);
    let ordnerPfad = sauber;
    let dateiName = "";
    if (art === "datei") {
      // Trenner beibehalten, wie er im eingefuegten Pfad steht
      const trenner = sauber.includes("\\") ? "\\" : "/";
      const teile = sauber.split(/[\\/]/);
      dateiName = teile.pop();
      ordnerPfad = teile.join(trenner);
    }
    quellHandle = desktopOrdnerHandle(ordnerPfad, { nurLesen: true });
    quellPerm = "ok";
    try { await merkeVerweis("quellordner", quellHandle); } catch (e) { /* nur diese Sitzung */ }
    return { name: quellHandle.name, dateiName };
  }

  async function vergissQuellOrdner() {
    quellHandle = null;
    quellPerm = "none";
    try { await vergissVerweis("quellordner"); } catch (e) { /* egal */ }
  }
  function quellOrdnerStatus() {
    // "none" = keiner eingerichtet, "needs-permission" = nach Neustart einmal
    // bestätigen, "ok" = lesebereit
    if (quellHandle) return quellPerm;
    return folderHandle && folderPerm === "ok" ? "ersatz" : "none";
  }
  function quellOrdnerName() {
    if (quellHandle) return quellHandle.name;
    return folderHandle && folderPerm === "ok" ? folderHandle.name : "";
  }
  // Welcher Ordner gilt gerade? Erst der eigene Quellordner, sonst der Datenordner.
  function leseOrdner() {
    if (quellHandle && quellPerm === "ok") return quellHandle;
    if (folderHandle && folderPerm === "ok") return folderHandle;
    return null;
  }
  async function leseAusOrdner(name) {
    const ordner = leseOrdner();
    if (!ordner || !name) return null;
    const handle = await ordner.getFileHandle(name); // NotFoundError, wenn sie fehlt
    return await handle.getFile();
  }
  async function listeOrdnerDateien(endung) {
    const ordner = leseOrdner();
    if (!ordner) return [];
    const raus = [];
    for await (const [name, handle] of ordner.entries()) {
      if (!handle || handle.kind !== "file") continue;
      if (endung && !name.toLowerCase().endsWith(String(endung).toLowerCase())) continue;
      if (name.startsWith("~$")) continue; // Excel-Sperrdatei einer offenen Mappe
      raus.push(name);
    }
    return raus.sort((a, b) => a.localeCompare(b, "de"));
  }

  // Inhalt einer Konfliktkopie in die Hauptdatei einpflegen (mit Kontroll-Lesung
  // und optimistischer Sperre wie beim normalen Speichern). Gibt zurück, wie
  // viele Einträge aus der Kopie tatsächlich neu übernommen wurden.
  async function mergeKopieInDatei(kopie) {
    let letzterFehler = null;
    for (let versuch = 0; versuch < 5; versuch++) {
      try {
        const fileData = await readFileData();
        const deleted = { ...fileData.deleted };
        Object.entries(kopie.deleted || {}).forEach(([id, at]) => {
          if (!deleted[id] || String(deleted[id]) < String(at)) deleted[id] = at;
        });
        pruneTombstones(deleted);
        const merged = mergeEntries(fileData.entries, kopie.entries, deleted);
        const vorher = new Map(fileData.entries.map((e) => [e.id, String(e.updatedAt || "")]));
        let uebernommen = 0;
        kopie.entries.forEach((e) => {
          const delAt = deleted[e.id];
          if (delAt && String(delAt) >= String(e.updatedAt || "")) return;
          const alt = vorher.get(e.id);
          if (alt === undefined || String(e.updatedAt || "") > alt) uebernommen++;
        });
        let config = fileData.config;
        if (kopie.config && (!config || String(kopie.config.updatedAt || "") > String(config.updatedAt || ""))) {
          config = kopie.config;
        }
        const out = { format: FORMAT, savedAt: nowISO(), entries: merged, deleted, config };
        const nochAktuell = await readFileData();
        if (String(nochAktuell.savedAt || "") !== String(fileData.savedAt || "")) {
          throw new Error("Kollision: Datei wurde zwischenzeitlich geändert");
        }
        await writeFileData(out);
        lastSavedAt = out.savedAt;
        const kontrolle = await readFileData();
        if (String(kontrolle.savedAt || "") !== String(out.savedAt || "")) {
          throw new Error("Kontroll-Lesung stimmt nicht überein");
        }
        syncLocal(out);
        dispatchUpdate(out);
        await recordBackup(merged, config);
        return uebernommen;
      } catch (e) {
        letzterFehler = e;
      }
      await new Promise((r) => setTimeout(r, 150 + versuch * 150));
    }
    throw letzterFehler || new Error("Zusammenführen nicht bestätigt");
  }

  let konfliktScanLaeuft = false;
  let konfliktScanStart = 0;
  // Falls der Durchlauf selbst haengenbleibt (das Auflisten eines Ordners hat
  // keine Frist, die man ihm umhaengen koennte), darf die Sperre nicht ewig
  // stehen bleiben - sonst laeuft der Waechter nie wieder an.
  const KONFLIKT_SPERRE_MAX_MS = 5 * 60 * 1000;
  async function sammleKonfliktkopien() {
    if (!fileHandle || accessMode !== "readwrite" || !folderHandle || folderPerm !== "ok") return;
    if (konfliktScanLaeuft && Date.now() - konfliktScanStart < KONFLIKT_SPERRE_MAX_MS) return;
    konfliktScanLaeuft = true;
    konfliktScanStart = Date.now();
    try {
      const basis = fileHandle.name.replace(/\.json$/i, "");
      const kandidaten = [];
      for await (const [name, handle] of folderHandle.entries()) {
        if (!handle || handle.kind !== "file") continue;
        if (!/\.json$/i.test(name)) continue;
        if (name === fileHandle.name) continue;
        if (!istKonfliktkopie(basis, name)) continue;
        kandidaten.push([name, handle]);
      }
      for (const [name, handle] of kandidaten) {
        try {
          const file = await mitFrist(() => handle.getFile(), FRIST_LESEN, "Das Öffnen der Konfliktkopie");
          const text = await mitFrist(() => file.text(), FRIST_LESEN, "Das Lesen der Konfliktkopie");
          if (!text.trim()) {
            await folderHandle.removeEntry(name);
            continue;
          }
          const kopie = normalizeData(JSON.parse(text));
          // Inhalt der Kopie sicherheitshalber lokal aufheben, BEVOR sie gelöscht wird
          await recordBackup(kopie.entries, kopie.config);
          const uebernommen = await mergeKopieInDatei(kopie);
          await folderHandle.removeEntry(name);
          dispatchInfo(`OneDrive-Konfliktkopie „${name}" automatisch eingesammelt${uebernommen > 0 ? ` – ${uebernommen} Änderung(en) übernommen` : " – sie enthielt nichts Neues"}. Die Kopie wurde gelöscht, eine lokale Sicherung liegt unter ⚙ → Sicherungen.`);
        } catch (e) {
          // Merge nicht bestätigt -> Kopie NICHT löschen; der nächste Abgleich versucht es erneut.
        }
      }
    } catch (e) {
      // Ordner gerade nicht erreichbar - nächster Abgleich versucht es wieder.
    } finally {
      konfliktScanLaeuft = false;
    }
  }

  // Vergleicht vorher/nachher und macht daraus lesbare Verlaufszeilen.
  // Bewusst grob: eine Zeile je Vorgang, nicht je Feld - der Verlauf soll die
  // Frage "wer hat das geändert" beantworten, nicht die Daten verdoppeln.
  function baueVerlauf(nextEntries, prevEntries, removed, ts) {
    const zeilen = [];
    const prevById = new Map((prevEntries || []).map((e) => [e.id, e]));
    const strip = OHNE_SPUR;   // dieselbe Blindheit wie beim Stempeln
    const neu = [];
    const geaendert = [];
    (nextEntries || []).forEach((e) => {
      if (istSystemEintrag(e)) return;
      const alt = prevById.get(e.id);
      if (!alt) neu.push(e);
      else if (JSON.stringify(strip(alt)) !== JSON.stringify(strip(e))) geaendert.push(e);
    });
    const geloescht = (removed || []).map((id) => prevById.get(id)).filter((e) => e && !istSystemEintrag(e));

    // Löschungen einzeln - das ist der Fall, den man später nachvollziehen muss.
    geloescht.forEach((e) => zeilen.push(macheLogEintrag("gelöscht: " + benenneEintrag(e), ts)));
    const fasse = (liste, wort) => {
      if (liste.length === 0) return;
      if (liste.length <= 3) liste.forEach((e) => zeilen.push(macheLogEintrag(wort + ": " + benenneEintrag(e), ts)));
      else zeilen.push(macheLogEintrag(`${wort}: ${liste.length} Einträge`, ts));
    };
    fasse(neu, "angelegt");
    fasse(geaendert, "geändert");
    return zeilen;
  }

  // Verträglichkeit mit noch laufenden älteren Fassungen: Die Einstellungen
// liegen zwar als eigene Einträge vor, werden aber ZUSÄTZLICH weiterhin als
// Block mitgeschrieben. Ältere Fassungen lesen nur diesen Block - ohne ihn
// stünden sie ohne Anlagen, R+I-Punkte und Team da. Neuere Fassungen bevorzugen
// die Einträge, der Block ist für sie nur Beiwerk.
  /* ---------- Speichern (wird von storage.js aufgerufen) ---------- */
  // Mit Kontroll-Lesung: Schreiben zwei Bearbeiter im exakt selben Moment,
  // würde sonst stumm der Letzte gewinnen. Deshalb wird nach dem Schreiben
  // kurz zurückgelesen und geprüft, ob die eigenen Änderungen wirklich in der
  // Datei stehen - falls nicht, wird neu zusammengeführt und nachgespeichert.
  async function saveEntries(nextEntries, prevEntries) {
    if (!fileHandle || accessMode !== "readwrite") return null;
    const { stamped, removed } = stampEntries(nextEntries, prevEntries);
    const delStamp = nowISO();
    let merged = null;
    let letzterFehler = null;
    // Verlaufszeilen NUR EINMAL vorab bilden - bei einem Wiederholversuch
    // dürfen nicht dieselben Änderungen ein zweites Mal protokolliert werden.
    const logZeilen = baueVerlauf(nextEntries, prevEntries, removed, delStamp);

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

        merged = pruneLogs(mergeEntries(fileData.entries, stamped.concat(logZeilen), deleted));
        const out = { format: FORMAT, savedAt: nowISO(), entries: merged, deleted, config: configAusEintraegen(merged) || fileData.config };

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
          await recordBackup(bestaetigt, null);
          nachpruefenUndHeilen(stamped, removed, delStamp);
          dispatchConfigUpdate(bestaetigt);
          dispatchOk(); // Entwarnung erst hier: Die Änderung steht nachweislich in der Datei.
          return ohneSystemEntries(bestaetigt);
        }
      } catch (e) {
        letzterFehler = e;
      }
      // Kollision oder vorübergehender Fehler: kurz warten (steigend), dann neuer Versuch
      await new Promise((r) => setTimeout(r, 150 + versuch * 150 + Math.floor(Math.random() * 150)));
    }
    // Nach mehreren Versuchen weiterhin nicht bestätigt - nicht mehr still weitermachen,
    // sondern deutlich warnen. Lokal ist nichts verloren (localStorage + Sicherung).
    // Steht die Ursache schon als verstaendlicher Satz fest (unvollstaendige
    // Datei, ausbleibende Antwort), dann diesen Satz zeigen - und nicht in eine
    // zweite Meldung schachteln, an deren Ende der rohe Text des Browsers steht.
    if (letzterFehler && (letzterFehler.dateiKaputt || letzterFehler.keineAntwort)) {
      dispatchError(letzterFehler.message);
    } else {
      const grund = letzterFehler ? ` (${letzterFehler.name || "Fehler"}: ${letzterFehler.message || letzterFehler})` : "";
      dispatchError(`Deine letzte Änderung konnte nicht sicher in der gemeinsamen Datei bestätigt werden${grund}. Nichts ist verloren - bitte kurz warten, dann erscheint automatisch ein Hinweis zum erneuten Versuch.`);
    }
    if (merged) await recordBackup(merged, null);
    return merged ? ohneSystemEntries(merged) : merged; // Restfall: lokale Sicht - die Selbstheilung gleicht beim nächsten Speichern ab
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

  // Die Grundeinstellungen werden NICHT als ein Block geschrieben, sondern je
  // Feld als eigener Eintrag (id "config|team", "config|riItems", ...). Damit
  // gilt für sie dieselbe Eintrag-für-Eintrag-Zusammenführung wie für alle
  // anderen Daten: Ändert einer das Team und ein anderer gleichzeitig die
  // R+I-Punkte, überleben beide Änderungen statt sich gegenseitig zu löschen.
  async function saveConfig(configObj, prevConfigObj) {
    if (!fileHandle || accessMode !== "readwrite") return null;
    let letzterFehler = null;
    // Verlaufszeile einmal vorab bilden (nicht in der Wiederholschleife, sonst
    // stünde derselbe Vorgang bei einem zweiten Versuch doppelt im Verlauf).
    // Was geändert wurde, ergibt sich allein aus vorher/nachher dieses
    // Bearbeiters - dafür muss die Datei nicht gelesen werden.
    const benennung = { tpmAnlagen: "Anlagen", riItems: "R+I-Punkte", team: "Team", extraSchichten: "Schichtarten", anlagenteile: "Anlagenteile" };
    const geaenderteFelder = prevConfigObj && typeof prevConfigObj === "object"
      ? Object.keys(configObj || {})
          .filter((k) => k !== "updatedAt" && JSON.stringify(prevConfigObj[k]) !== JSON.stringify(configObj[k]))
          .map((k) => benennung[k] || k)
      : [];
    const logZeilen = geaenderteFelder.length
      ? [macheLogEintrag("Einstellungen geändert: " + geaenderteFelder.join(", "), nowISO())]
      : [];
    for (let versuch = 0; versuch < 5; versuch++) {
      try {
        const fileData = await readFileData();
        const inDatei = extractConfigEntries(fileData.entries);
        // Vergleichsgrundlage ist der Stand, den DIESER Bearbeiter zuletzt
        // kannte - mit dem Zeitstempel aus der Datei. Felder, die er nicht
        // angefasst hat, behalten dadurch ihren alten Zeitstempel und
        // verlieren beim Zusammenführen gegen eine fremde, neuere Änderung.
        const zeitstempel = new Map(inDatei.map((e) => [e.id, e.updatedAt]));
        const vorher = prevConfigObj && typeof prevConfigObj === "object"
          ? Object.keys(prevConfigObj)
              .filter((k) => k !== "updatedAt")
              .map((k) => ({ id: CONFIG_PREFIX + k, date: "", value: prevConfigObj[k], updatedAt: zeitstempel.get(CONFIG_PREFIX + k) }))
              .filter((e) => e.updatedAt)
          : inDatei;
        const nachher = Object.keys(configObj || {})
          .filter((k) => k !== "updatedAt")
          .map((k) => ({ id: CONFIG_PREFIX + k, date: "", value: configObj[k] }));
        // stampEntries stempelt nur die wirklich geänderten Felder neu -
        // unveränderte behalten ihren alten Zeitstempel und verlieren daher
        // niemals gegen eine fremde, neuere Änderung desselben Feldes.
        const { stamped } = stampEntries(nachher, vorher);
        // Fällt eine Änderung in dieselbe Millisekunde wie der Stand in der
        // Datei, wäre der Zeitstempel nur gleich und nicht neuer - das
        // Zusammenführen würde sie dann stillschweigend verwerfen.
        const vorherById = new Map(vorher.map((e) => [e.id, e]));
        stamped.forEach((e) => {
          const alt = vorherById.get(e.id);
          if (alt && String(e.updatedAt || "") <= String(alt.updatedAt || "") &&
              JSON.stringify(alt.value) !== JSON.stringify(e.value)) {
            e.updatedAt = new Date(Date.parse(alt.updatedAt) + 1).toISOString();
          }
        });
        const t = nowISO();
        const merged = pruneLogs(mergeEntries(fileData.entries, stamped.concat(logZeilen), fileData.deleted));
        const out = { format: FORMAT, savedAt: t, entries: merged, deleted: fileData.deleted, config: configAusEintraegen(merged) || fileData.config };

        // Optimistische Sperre wie bei saveEntries: nicht auf Basis eines
        // veralteten Stands schreiben, sonst könnte eine zeitgleiche
        // Einträge-Änderung von jemand anderem überschrieben werden.
        const nochAktuell = await readFileData();
        if (String(nochAktuell.savedAt || "") !== String(fileData.savedAt || "")) {
          throw new Error("Kollision: Datei wurde zwischenzeitlich von anderer Stelle geändert");
        }

        await writeFileData(out);
        lastSavedAt = t;
        const kontrolle = await readFileData();
        const bestaetigt = extractConfigEntries(kontrolle.entries);
        const allesDa = stamped.every((s) => {
          const k = bestaetigt.find((e) => e.id === s.id);
          return k && String(k.updatedAt || "") >= String(s.updatedAt || "");
        });
        if (allesDa) {
          await recordBackup(kontrolle.entries, null);
          const zurueck = {};
          bestaetigt.forEach((e) => { zurueck[e.id.slice(CONFIG_PREFIX.length)] = e.value; });
          dispatchConfigUpdate(kontrolle.entries);
          dispatchOk(); // Entwarnung erst hier: Die Einstellungen stehen nachweislich in der Datei.
          return zurueck;
        }
      } catch (e) {
        letzterFehler = e;
      }
      await new Promise((r) => setTimeout(r, 150 + versuch * 150 + Math.floor(Math.random() * 150)));
    }
    const grund = letzterFehler ? ` (${letzterFehler.name || "Fehler"}: ${letzterFehler.message || letzterFehler})` : "";
    dispatchError(`Die Anlagen-/Team-Liste konnte nicht sicher in der gemeinsamen Datei bestätigt werden${grund}. Nichts ist verloren - bitte kurz warten und erneut versuchen.`);
    return null;
  }

  // Verlauf aus der Datei lesen (neueste zuerst). Ohne verbundene Datei gibt es
  // keinen gemeinsamen Verlauf - im Alleinbetrieb ist die Frage "wer war das"
  // ohnehin schon beantwortet.
  async function readLog() {
    if (!fileHandle) return [];
    try {
      const data = await readFileData();
      return extractLogEntries(data.entries);
    } catch (e) { return []; }
  }

  /* ---------- Änderungen der anderen abholen ---------- */
  let pollFehlerFolge = 0; // aufeinanderfolgende gescheiterte Poll-Versuche
  let pollWarnungAktiv = false;
  let lastSuccessfulSyncAt = null; // für die "zuletzt aktualisiert"-Anzeige
  function getLastSuccessfulSyncAt() { return lastSuccessfulSyncAt; }

  async function pollNow() {
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
      // Konflikt-Wächter: bei jedem Abgleich nach OneDrive-Konfliktkopien schauen
      sammleKonfliktkopien();
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
    // Direkt beim Verbinden einmal nach liegengebliebenen Konfliktkopien schauen
    sammleKonfliktkopien();
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // Test-Zugang (für automatisierte Tests, ohne Datei-Dialog)
  const _test = {
    async adopt(handle, mode) {
      fileHandle = handle;
      accessMode = mode || "readwrite";
      const data = await adoptCurrentFile(false);
      startPolling();
      return data;
    },
    poll: pollNow,
    canWrite, // nur lesende Statusabfrage - verleiht kein Recht
    save: saveEntries, // greift dieselbe Prüfung ab wie jeder andere Weg
    getLastSuccessfulSyncAt: () => lastSuccessfulSyncAt,
    adoptFolder(handle) {
      folderHandle = handle;
      folderPerm = "ok";
    },
    sammle: sammleKonfliktkopien,
    adoptQuellOrdner(handle) { quellHandle = handle; quellPerm = "ok"; },
    fileInfo, // Kennkarte auch fuer Pruefungen ablesbar
  };

  return {
    isSupported, isConnected, canWrite, fileName, fileInfo, ermittlePfad, uhrVersatz, getLastWriteError, getLastSuccessfulSyncAt,
    listBackups, pickShared, tryRestore, reconnect, retryWrite, disconnect,
    schreibfrageOffen: () => schreibfrageOffen,
    pickWritable, umgebung,
    folderStatus, folderName, pickFolder, reconnectFolder, forgetFolder, sammleKonfliktkopien,
    leseAusOrdner, listeOrdnerDateien,
    pickQuellOrdner, reconnectQuellOrdner, vergissQuellOrdner, quellOrdnerStatus, quellOrdnerName, setzeQuellOrdnerPfad,
    saveEntries, saveConfig, readLog, dispatchError, dispatchOk, pollNow, _test,
  };
}

/* ==================================================================== */
/* Instanz 1: Hauptdaten (Kalender, Team, Backlog, Planung ...)          */
/* ==================================================================== */
const main = createSharedStore({
  dbName: "werkstatt-kalender-fs",
  format: "werkstatt-kalender-v1",
  entriesKey: "werkstatt-kalender-entries",
  configKey: "werkstatt-kalender-config",
  suggestedName: "werkstatt-kalender-daten.json",
  evPrefix: "werkstatt-shared",
});

// Bestehende, unveränderte öffentliche Schnittstelle (storage.js + App bleiben gleich).
export const isSupported = main.isSupported;
export const isConnected = main.isConnected;
export const canWrite = main.canWrite;
export const fileName = main.fileName;
export const fileInfo = main.fileInfo;
export const uhrVersatz = main.uhrVersatz;
export const getLastWriteError = main.getLastWriteError;
export const getLastSuccessfulSyncAt = main.getLastSuccessfulSyncAt;
export const listBackups = main.listBackups;
export const pickShared = main.pickShared;
export const tryRestore = main.tryRestore;
export const reconnect = main.reconnect;
export const retryWrite = main.retryWrite;
export const schreibfrageOffen = main.schreibfrageOffen;
export const pickWritable = main.pickWritable;
export const umgebung = main.umgebung;
export const disconnect = main.disconnect;
export const folderStatus = main.folderStatus;
export const folderName = main.folderName;
export const pickFolder = main.pickFolder;
export const reconnectFolder = main.reconnectFolder;
export const forgetFolder = main.forgetFolder;
export const sammleKonfliktkopien = main.sammleKonfliktkopien;
// Weitere Dateien im Datenordner mitlesen (OEE-Tabelle) - nur lesend
export const leseAusOrdner = main.leseAusOrdner;
export const listeOrdnerDateien = main.listeOrdnerDateien;
// Eigener, rein lesender Ordner fuer die OEE-Tabelle auf dem Firmenlaufwerk
export const pickQuellOrdner = main.pickQuellOrdner;
export const reconnectQuellOrdner = main.reconnectQuellOrdner;
export const vergissQuellOrdner = main.vergissQuellOrdner;
export const quellOrdnerStatus = main.quellOrdnerStatus;
export const quellOrdnerName = main.quellOrdnerName;
export const setzeQuellOrdnerPfad = main.setzeQuellOrdnerPfad;
export const saveEntries = main.saveEntries;
export const saveConfig = main.saveConfig;
export const readLog = main.readLog;
export const dispatchError = main.dispatchError;
export const dispatchOk = main.dispatchOk;
export const pollNow = main.pollNow;

/* ==================================================================== */
/* Instanz 2: Störungen (eigene, für alle beschreibbare Datei)           */
/* ==================================================================== */
// Getrennte Datei mit denselben Sicherheiten. Sie wird in OneDrive für ALLE
// (auch Nur-Leser der Hauptdatei) mit Bearbeiten-Recht freigegeben, damit jeder
// Störungen melden/ändern/löschen kann, ohne die geschützten Hauptdaten anzurühren.
export const stoer = createSharedStore({
  dbName: "werkstatt-stoerungen-fs",
  format: "werkstatt-stoerungen-v1",
  entriesKey: "werkstatt-stoerungen-entries",
  configKey: "werkstatt-stoerungen-config",
  suggestedName: "werkstatt-stoerungen.json",
  evPrefix: "werkstatt-stoer",
});

/* ---------- Test-Zugang ---------- */
if (typeof window !== "undefined") {
  window.__wkSharedTest = main._test;
  window.__wkStoerTest = stoer._test;
  // Programm-Fassung: die Handle-Fabriken fuer Pruefungen erreichbar machen
  window.__wkDesktopTest = { dateiHandle: desktopDateiHandle, ordnerHandle: desktopOrdnerHandle };
}
