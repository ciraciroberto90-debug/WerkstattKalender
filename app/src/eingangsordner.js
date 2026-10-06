// ---------------------------------------------------------------------------
// Eingangsordner für den Reiter „Aufnahme" (Roll-out 61, Stufe 1, 06.10.)
//
// Bilder kommen heute per WhatsApp an den PC und landen als Dateien in einem
// Ordner (bei Roberto: Downloads). Dieses Modul liest diesen Ordner NUR -
// es schreibt, verschiebt und löscht dort nichts. Was sortiert ist, merkt
// sich die App je Rechner (localStorage), die Datei bleibt, wo sie ist.
//
// Zwei Wege, dieselbe Schnittstelle:
//   - Programm-Fassung: ein PFAD über die Brücke (__werkstattDesktop) - jeder
//     Ordner geht, der Pfad überlebt jeden Neustart.
//   - Browser (file://-HTML): ein Ordner-Verweis aus showDirectoryPicker,
//     gemerkt in einer eigenen kleinen IndexedDB. NICHT GEMESSEN (06.10.):
//     ob Chrome/Edge den Downloads-Ordner SELBST freigibt - der Browser sperrt
//     einige Systemordner. Dann hilft ein Unterordner (z. B. Downloads\Eingang)
//     oder die Programm-Fassung.
//   - Browser am Server (http://v-btacockpit-1:8765/app/): kein
//     showDirectoryPicker (unsichere Herkunft) -> unterstuetzt() ist false,
//     die Oberfläche sagt das ehrlich.
//
// Bewusst UNABHÄNGIG von sharedfile.js / server-client.js: Der Eingangsordner
// hat mit dem Zusammenführen und Speichern des Bestands nichts zu tun - und
// darf diese Wege deshalb auch nicht anfassen (Hausregel: Sync-Fehler sind
// ein No-Go, also so wenig Berührung wie möglich).
// ---------------------------------------------------------------------------
import { nsKey } from "./standort.js";

const BRUECKE_SCHLUESSEL = nsKey("bta-aufnahme:eingangsordner");
const IDB_NAME = "bta-aufnahme-verweise";
const IDB_STORE = "verweise";
const IDB_KEY = nsKey("eingangsordner");
// Bildtypen, die der Browser anzeigen kann. HEIC (iPhone-Original) kann Chrome
// nicht darstellen - WhatsApp wandelt beim Versand ohnehin in JPG.
const BILD_ENDUNG = /\.(jpe?g|png|webp|gif|bmp)$/i;
const FRIST_MS = 8000;

let handle = null;      // Ordner-Verweis (Browser) oder Pfad-Hülle (Programm)
let perm = "none";      // "ok" | "needs-permission" | "none"

const bruecke = () => (typeof window !== "undefined" && window.__werkstattDesktop) || null;
const mitFrist = (fn, was) => Promise.race([
  fn(),
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${was} antwortet nicht (${FRIST_MS / 1000} s).`)), FRIST_MS)),
]);

/* ---------- Verweis merken (Browser: IndexedDB; Programm: Pfad in den Einstellungen) ---------- */
function idbOeffnen() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("keine IndexedDB"));
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB-Fehler"));
    req.onblocked = () => reject(new Error("IndexedDB blockiert"));
  });
}
async function idbSetzen(wert) {
  const db = await idbOeffnen();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      if (wert === null) tx.objectStore(IDB_STORE).delete(IDB_KEY); else tx.objectStore(IDB_STORE).put(wert, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function idbLesen() {
  const db = await idbOeffnen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const r = tx.objectStore(IDB_STORE).get(IDB_KEY);
      r.onsuccess = () => resolve(r.result === undefined ? null : r.result);
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}

/* ---------- Programm-Fassung: Pfad-Hülle mit derselben Form wie ein Ordner-Verweis ---------- */
function pfadVerbinden(basis, name) {
  const b = String(basis);
  const t = b.includes("\\") ? "\\" : "/";
  return (b.endsWith(t) ? b : b + t) + String(name);
}
function pfadHuelle(pfad) {
  const d = bruecke();
  const name = String(pfad).split(/[\\/]/).filter(Boolean).pop() || String(pfad);
  return {
    kind: "directory", name, pfad,
    async *entries() {
      const liste = await d.liste(pfad);
      for (const e of liste || []) {
        yield [e.name, {
          kind: "file", name: e.name, pfad: e.pfad,
          // Kurzblick ohne Lesen (Brücke ab 21.09.); ältere Brücken lesen die Datei
          async kurz() {
            if (typeof d.stat === "function") { const s = await d.stat(e.pfad); return s ? { size: s.groesse, lastModified: s.geaendert } : null; }
            const r = await d.lese(e.pfad); return r ? { size: r.groesse, lastModified: r.geaendert } : null;
          },
          async getFile() {
            const r = await d.lese(e.pfad);
            if (!r) { const x = new Error("Datei nicht gefunden: " + e.pfad); x.name = "NotFoundError"; throw x; }
            return new File([r.bytes], e.name, { lastModified: r.geaendert });
          },
        }];
      }
    },
    async queryPermission() { return "granted"; },
    async requestPermission() { return "granted"; },
  };
}

/* ---------- Öffentliche Schnittstelle ---------- */
// Kann dieser Rechner überhaupt einen Eingangsordner lesen?
export function unterstuetzt() {
  if (bruecke()) return true;
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}
// Warum nicht? Für eine ehrliche Zeile in der Oberfläche.
export function grundNichtUnterstuetzt() {
  if (unterstuetzt()) return "";
  if (typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)) {
    return "Im Browser über den Server kann kein Ordner des PCs gelesen werden - dafür die Programm-Fassung oder die HTML-Datei vom Laufwerk nehmen.";
  }
  return "Dieser Browser kann keine Ordner lesen (Chrome oder Edge nötig).";
}
export function status() { return handle ? perm : "none"; }
export function name() { return handle ? handle.name : ""; }
export function pfad() { return handle && handle.pfad ? String(handle.pfad) : ""; }

// Beim Start: gemerkten Ordner wieder anbinden. Im Browser will Chrome die
// Freigabe nach einem Neustart einmal bestätigt haben -> "needs-permission".
export async function wiederherstellen() {
  const d = bruecke();
  try {
    if (d) {
      const p = await d.gemerkt(BRUECKE_SCHLUESSEL);
      if (p) { handle = pfadHuelle(p); perm = "ok"; }
      return status();
    }
    const h = await idbLesen();
    if (h) {
      handle = h;
      let p = "unbekannt";
      try { p = await mitFrist(() => h.queryPermission({ mode: "read" }), "Die Rechteauskunft des Browsers"); } catch (e) { p = "unbekannt"; }
      perm = p === "granted" ? "ok" : "needs-permission";
    }
  } catch (e) { /* keine IndexedDB o. ä. - dann eben ohne gemerkten Ordner */ }
  return status();
}
// Nach einem Neustart im Browser: die Freigabe bestätigen (braucht einen Klick).
export async function freigeben() {
  if (!handle) throw new Error("Kein Eingangsordner gemerkt.");
  if (!handle.requestPermission) { perm = "ok"; return status(); }
  const p = await mitFrist(() => handle.requestPermission({ mode: "read" }), "Die Frage nach dem Ordnerzugriff");
  if (p !== "granted") throw new Error("Der Zugriff auf den Eingangsordner wurde nicht erlaubt.");
  perm = "ok";
  return status();
}
// Ordner wählen: Programm = Dialog des Betriebssystems, Browser = Ordner-Dialog
// (öffnet bei Downloads, weil die Bilder von WhatsApp dort landen).
export async function waehlen() {
  const d = bruecke();
  if (d) {
    const p = await d.waehleOrdner();
    if (!p) { const e = new Error("Abgebrochen"); e.name = "AbortError"; throw e; }
    await setzePfad(p);
    return { name: handle.name, pfad: p };
  }
  if (typeof window.showDirectoryPicker !== "function") throw new Error(grundNichtUnterstuetzt());
  const h = await window.showDirectoryPicker({ mode: "read", id: "bta-eingang", startIn: "downloads" });
  handle = h; perm = "ok";
  try { await idbSetzen(h); } catch (e) { /* gilt dann nur für diese Sitzung */ }
  return { name: h.name, pfad: "" };
}
// Pfad einfügen (nur Programm): "C:\Users\...\Downloads" aus dem Explorer kopiert.
export async function setzePfad(p) {
  const d = bruecke();
  if (!d) throw new Error("Einen Pfad eingeben geht nur in der Programm-Fassung - im Browser den Knopf „Ordner wählen“ nehmen.");
  const sauber = String(p || "").trim().replace(/^"|"$/g, "");
  if (!sauber) throw new Error("Kein Pfad angegeben.");
  const art = typeof d.pfadInfo === "function" ? await d.pfadInfo(sauber) : "ordner";
  if (art !== "ordner") throw new Error(`Unter „${sauber}" liegt kein Ordner - Pfad prüfen.`);
  handle = pfadHuelle(sauber); perm = "ok";
  try { await d.merke(BRUECKE_SCHLUESSEL, sauber); } catch (e) { /* nur diese Sitzung */ }
  return { name: handle.name, pfad: sauber };
}
export async function vergessen() {
  handle = null; perm = "none";
  const d = bruecke();
  try { if (d) await d.merke(BRUECKE_SCHLUESSEL, null); else await idbSetzen(null); } catch (e) { /* egal */ }
}

/* Bilder im Ordner, jüngste zuerst. seitMs: nur Dateien, die jünger sind
   (Downloads sammelt Jahre an - der Eingang zeigt die letzten Tage). Jede
   Zeile bringt datei() mit, das den Inhalt erst holt, wenn er gebraucht wird
   (Vorschau, Eindampfen). Der Schlüssel aus Name, Größe und Änderungszeit
   erkennt dieselbe Datei nach einem Neustart wieder - so bleibt Sortiertes
   sortiert, auch ohne die Datei anzufassen. */
export async function listeBilder({ seitMs = 0, max = 300 } = {}) {
  if (!handle || perm !== "ok") return [];
  const raus = [];
  for await (const [dateiName, h] of handle.entries()) {
    if (!h || h.kind !== "file") continue;
    if (!BILD_ENDUNG.test(dateiName) || dateiName.startsWith(".") || dateiName.startsWith("~")) continue;
    let kurz = null;
    try {
      kurz = typeof h.kurz === "function" ? await h.kurz() : await h.getFile(); // getFile() liest nur die Kennwerte, nicht den Inhalt
    } catch (e) { kurz = null; }
    if (!kurz) continue;
    const geaendert = Number(kurz.lastModified) || 0;
    if (seitMs && geaendert < seitMs) continue;
    raus.push({
      key: `${dateiName}|${kurz.size}|${geaendert}`,
      name: dateiName, groesse: Number(kurz.size) || 0, geaendert,
      datei: () => h.getFile(),
    });
  }
  raus.sort((a, b) => b.geaendert - a.geaendert);
  return raus.slice(0, max);
}

/* Test-Zugang: ein nachgebauter Ordner-Verweis ohne Dialog (harte-108). */
if (typeof window !== "undefined") {
  window.__wkEingangTest = {
    adopt(h) { handle = h; perm = "ok"; try { window.dispatchEvent(new CustomEvent("bta-eingangsordner")); } catch (e) { /* egal */ } },
    status,
  };
}
