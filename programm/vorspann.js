/* Vorspann-Skript: die Brücke zwischen App und Programm.
 *
 * Stellt der App window.__werkstattDesktop bereit - genau die Schnittstelle,
 * die app/src/sharedfile.js unter "Programm-Fassung" erwartet. Mehr nicht:
 * Die App bekommt keinen allgemeinen Node-Zugriff, nur diese benannten
 * Handgriffe, und jeder davon läuft im Hauptprozess (main.js).
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__werkstattDesktop", {
  // Dateidialoge des Betriebssystems - Ergebnis ist ein echter Pfad oder null
  waehleDatei: () => ipcRenderer.invoke("datei-waehlen"),
  waehleDateiNeu: (vorschlag) => ipcRenderer.invoke("datei-neu", vorschlag),
  waehleOrdner: () => ipcRenderer.invoke("ordner-waehlen"),
  // Dateizugriffe über Pfade
  lese: (pfad) => ipcRenderer.invoke("lese", pfad),
  schreibe: (pfad, text) => ipcRenderer.invoke("schreibe", pfad, text),
  liste: (ordnerPfad) => ipcRenderer.invoke("liste", ordnerPfad),
  entferne: (pfad) => ipcRenderer.invoke("entferne", pfad),
  // Fotos (26.08.): Unterordner "Fotos" anlegen und Bilddateien als Bytes
  // schreiben - an diesen beiden erkennt die App, dass der Rahmen Fotos kann.
  ordnerAnlegen: (pfad) => ipcRenderer.invoke("ordner-anlegen", pfad),
  schreibeBytes: (pfad, bytes) => ipcRenderer.invoke("schreibe-bytes", pfad, bytes),
  // Gemerkte Pfade (Einstellungsdatei im Benutzerprofil)
  merke: (schluessel, wert) => ipcRenderer.invoke("merke", schluessel, wert),
  gemerkt: (schluessel) => ipcRenderer.invoke("gemerkt", schluessel),
  // Laufwerkspfade im Explorer öffnen (ersetzt den Ausliefer-Dienst-Trick)
  oeffnePfad: (pfad) => ipcRenderer.invoke("oeffne-pfad", pfad),
  // Liegt an diesem Pfad eine Datei, ein Ordner - oder nichts?
  pfadInfo: (pfad) => ipcRenderer.invoke("pfad-info", pfad),
  // Programm-Updates: neue App-HTML aus dem Netzwerkordner uebernehmen
  aufUpdate: (cb) => ipcRenderer.on("update-verfuegbar", (ev, info) => cb(info)),
  updateOrdnerSetzen: (pfad) => ipcRenderer.invoke("update-ordner-setzen", pfad),
  updateStatus: () => ipcRenderer.invoke("update-status"),
  updatePruefen: () => ipcRenderer.invoke("update-pruefen"),
  updateUebernehmen: () => ipcRenderer.invoke("update-uebernehmen"),
});
