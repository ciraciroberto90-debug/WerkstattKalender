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
    // Der Zwischenspeicher des Browsers ist begrenzt (meist ~5 MB). Läuft er
    // voll, darf das NICHT den Weg in die gemeinsame Datei abschneiden - die
    // Datei ist der maßgebliche Bestand und kennt diese Grenze nicht. Früher
    // brach hier alles ab und die Änderung war weder lokal noch in der Datei.
    let lokalGespeichert = true;
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      lokalGespeichert = false;
    }

    if (shared.isConnected() && shared.canWrite()) {
      try {
        if (key === ENTRIES_KEY) {
          const next = JSON.parse(value);
          const prev = prevRaw ? JSON.parse(prevRaw) : [];
          const merged = await shared.saveEntries(next, prev);
          if (merged) {
            const mergedRaw = JSON.stringify(merged);
            try {
              localStorage.setItem(key, mergedRaw);
              lokalGespeichert = true;
            } catch (e) {
              lokalGespeichert = false;
            }
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
          // Auch den vorherigen Stand mitgeben: Nur was dieser Bearbeiter
          // wirklich geändert hat, darf einen neuen Zeitstempel bekommen -
          // sonst würde ein veraltetes Feld aus seiner Maske die frischere
          // Änderung eines anderen Bearbeiters überschreiben.
          await shared.saveConfig(JSON.parse(value), prevRaw ? JSON.parse(prevRaw) : null);
        }
        // KEIN dispatchOk() an dieser Stelle: Das Speichern meldet ein
        // endgültiges Scheitern nicht als Ausnahme, sondern über eine
        // Fehlermeldung. Ein pauschales "alles gut" würde diese Warnung
        // sofort wieder löschen - der Bearbeiter hielte seine Arbeit dann
        // für gesichert, obwohl sie die gemeinsame Datei nie erreicht hat.
        // Die Entwarnung gibt daher nur, wer die Bestätigung wirklich hat.
      } catch (e) {
        shared.dispatchError("In der gemeinsamen Datei konnte nicht gespeichert werden (Laufwerk erreichbar? Datei gesperrt?). Lokal ist alles gesichert – beim nächsten erfolgreichen Speichern wird automatisch abgeglichen.");
      }
    }

    if (!lokalGespeichert) {
      if (shared.isConnected() && shared.canWrite()) {
        // Die Änderung ist in der gemeinsamen Datei angekommen - nur die
        // örtliche Zweitschrift fehlt. Kein Datenverlust, aber ein Zustand,
        // den man kennen muss (nach dem Neuladen fehlen Daten, bis die Datei
        // wieder gelesen wurde).
        shared.dispatchError("Der Zwischenspeicher dieses Browsers ist voll. Deine Änderung steht in der gemeinsamen Datei und ist NICHT verloren – auf diesem Gerät kann sie aber nicht zwischengespeichert werden. Bitte alte Jahrgänge auslagern oder den Browser-Speicher der Seite leeren.");
      } else {
        // Ohne gemeinsame Datei gibt es keine zweite Ablage: Jetzt ist die
        // Änderung wirklich nirgends. Das muss als Fehler durchschlagen,
        // damit die App es meldet statt still weiterzumachen.
        throw new Error("Der Zwischenspeicher dieses Browsers ist voll – die Änderung konnte nirgends gesichert werden. Bitte alte Jahrgänge auslagern oder eine gemeinsame Datei verbinden.");
      }
    }
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return true;
  },
};
