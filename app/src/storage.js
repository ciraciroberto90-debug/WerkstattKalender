// Ersatz für die window.storage-API der Claude-Artifact-Umgebung.
// Gespeichert wird immer zuerst lokal (localStorage). Ist zusätzlich eine
// gemeinsame Datei verbunden (siehe sharedfile.js), wird jede Änderung dort
// eingepflegt – Eintrag für Eintrag zusammengeführt, damit sich zwei
// Bearbeiter nicht gegenseitig überschreiben.
import * as shared from "./sharedfile.js";

const ENTRIES_KEY = "werkstatt-kalender-entries";
const CONFIG_KEY = "werkstatt-kalender-config";

// Erkennt jede inhaltliche Abweichung zwischen dem, was gerade gespeichert
// werden sollte, und dem tatsächlich zusammengeführten Ergebnis - nicht nur
// eine andere Anzahl. Sonst würde z. B. eine zeitgleich geänderte Notiz des
// anderen Bearbeiters (gleiche Anzahl Einträge, aber anderer Inhalt) erst
// beim nächsten Hintergrund-Abgleich (bis zu 30s später) sichtbar werden.
function unterscheidetSichVon(next, merged) {
  if (next.length !== merged.length) return true;
  const strip = ({ updatedAt, ...rest }) => rest;
  const nextById = new Map(next.map((e) => [e.id, JSON.stringify(strip(e))]));
  for (const e of merged) {
    if (nextById.get(e.id) !== JSON.stringify(strip(e))) return true;
  }
  return false;
}

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
            // Kam beim Zusammenführen irgendetwas anderes heraus als das, was
            // gerade gespeichert werden sollte (neue Einträge, gelöschte,
            // oder inhaltlich geänderte) - App sofort informieren, nicht erst
            // beim nächsten Hintergrund-Abgleich.
            if (unterscheidetSichVon(next, merged)) {
              window.dispatchEvent(new CustomEvent("werkstatt-shared-update", {
                detail: { entries: merged, config: null },
              }));
            }
          }
        } else if (key === CONFIG_KEY) {
          await shared.saveConfig(JSON.parse(value));
        }
        shared.dispatchOk();
      } catch (e) {
        shared.dispatchError("In der gemeinsamen Datei konnte nicht gespeichert werden (Laufwerk erreichbar? Datei gesperrt?). Lokal ist alles gesichert – beim nächsten erfolgreichen Speichern wird automatisch abgeglichen.");
      }
    }
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return true;
  },
};
