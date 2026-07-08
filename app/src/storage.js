// Ersatz für die window.storage-API der Claude-Artifact-Umgebung.
// Gespeichert wird immer zuerst lokal (localStorage). Ist zusätzlich eine
// gemeinsame Datei verbunden (siehe sharedfile.js), wird jede Änderung dort
// eingepflegt – Eintrag für Eintrag zusammengeführt, damit sich zwei
// Bearbeiter nicht gegenseitig überschreiben.
import * as shared from "./sharedfile.js";

const ENTRIES_KEY = "werkstatt-kalender-entries";
const CONFIG_KEY = "werkstatt-kalender-config";

window.storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value === null ? null : { key, value };
  },
  async set(key, value) {
    const prevRaw = localStorage.getItem(key);
    localStorage.setItem(key, value);

    if (shared.isConnected() && shared.canWrite()) {
      try {
        if (key === ENTRIES_KEY) {
          const next = JSON.parse(value);
          const prev = prevRaw ? JSON.parse(prevRaw) : [];
          const merged = await shared.saveEntries(next, prev);
          if (merged) {
            const mergedRaw = JSON.stringify(merged);
            localStorage.setItem(key, mergedRaw);
            // Kamen beim Zusammenführen Einträge der anderen dazu, App informieren.
            if (merged.length !== next.length) {
              window.dispatchEvent(new CustomEvent("werkstatt-shared-update", {
                detail: { entries: merged, config: null },
              }));
            }
          }
        } else if (key === CONFIG_KEY) {
          await shared.saveConfig(JSON.parse(value));
        }
      } catch (e) {
        shared.dispatchError("In der gemeinsamen Datei konnte nicht gespeichert werden (Laufwerk erreichbar? Datei gesperrt?). Lokal ist alles gesichert.");
      }
    }
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return true;
  },
};
