// Ersatz für die window.storage-API der Claude-Artifact-Umgebung.
// Gespeichert wird immer zuerst lokal (localStorage). Ist zusätzlich eine
// gemeinsame Datei verbunden (siehe sharedfile.js), wird jede Änderung dort
// eingepflegt – Eintrag für Eintrag zusammengeführt, damit sich zwei
// Bearbeiter nicht gegenseitig überschreiben.
import * as shared from "./sharedfile.js";
import { nsKey } from "./standort.js";

// Je Standort ein eigener Namensraum (Scheurich = Alt-Schlüssel) - siehe standort.js.
const ENTRIES_KEY = nsKey("werkstatt-kalender-entries");
const CONFIG_KEY = nsKey("werkstatt-kalender-config");

/* Der zuletzt von DIESEM Fenster geschriebene Stand.
   Warum nicht einfach der localStorage? Weil ihn sich alle Fenster derselben
   Seite teilen. Aus dem Unterschied zwischen "vorher" und "jetzt" leitet die
   App ab, was der Bediener GELÖSCHT hat - und wenn "vorher" von einem zweiten
   Fenster stammt, sind dessen frische Einträge plötzlich Löschkandidaten.
   Gemessen am 05.08.2026: Zwei Fenster offen, das zweite speichert seinen
   etwas älteren Stand - der Eintrag des ersten bekam eine Löschmarke und war
   danach auf ALLEN Geräten weg. Deshalb merkt sich jedes Fenster seinen
   eigenen letzten Stand; gelöscht wird nur, was dieses Fenster selbst
   entfernt hat. */
const eigenerStand = new Map();

// Bringt ein Abgleich neue Daten, ist das der neue Ausgangspunkt dieses
// Fensters - sonst gälte ein anderswo gelöschter Eintrag beim nächsten
// Speichern noch einmal als eigene Löschung.
["werkstatt-shared-update", "werkstatt-stoer-update"].forEach((ev) => {
  window.addEventListener(ev, (e) => {
    if (e && e.detail && Array.isArray(e.detail.entries)) {
      eigenerStand.set(ev.startsWith("werkstatt-shared") ? ENTRIES_KEY : nsKey("werkstatt-stoerungen-entries"),
        JSON.stringify(e.detail.entries));
    }
  });
});

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

/* ---- Hintergrund-Warteschlange für die gemeinsame Datei ----
   Robertos Fund vom 16.09.: Nach "Speichern" blieb der Dialog sekundenlang
   stehen, weil der Klick auf die KOMPLETTE Datei-Speicher-Kette wartete
   (Sperren-Blick, Schreiben, Schutzpause, Nachkontrolle - bei 70.000
   Einträgen gemessene ~7 s). Dabei ist die Änderung zu diesem Zeitpunkt
   längst im laufenden Bestand und im örtlichen Spiegel gesichert, und der
   Rückgabewert des Speicherns hing schon immer NUR an der lokalen Sicherung.
   Seither: set() kehrt nach der lokalen Sicherung zurück; in die Datei wird
   im Hintergrund geschrieben - streng NACHEINANDER über diese Kette (nie
   zwei Schreiber desselben Fensters zugleich, die Klick-Reihenfolge bleibt
   die Datei-Reihenfolge). Scheitert die Datei, kommt dieselbe rote Warnung
   wie bisher; die Kollisions-Heilung der Dateischicht bleibt unberührt. */
let dateiKette = Promise.resolve();
let dateiOffen = 0; // wie viele Hintergrund-Schreiber noch ausstehen
const setLauf = new Map(); // je Schlüssel die Nummer des jüngsten set()-Aufrufs

// Solange die Datei noch schreibt, warnt der Browser vor dem Schließen -
// sonst könnte man das Fenster zwischen "Dialog zu" und "Datei fertig"
// zumachen. (Die Änderung läge dann zwar im örtlichen Spiegel und würde
// beim nächsten Verbinden zusammengeführt - aber besser gar nicht erst.)
window.addEventListener("beforeunload", (e) => {
  if (dateiOffen > 0) { e.preventDefault(); e.returnValue = ""; }
});

async function inDateiSchreiben(key, value, prevRaw, laufNr, lokalFehlte) {
  // "lokalFehlte": der Zwischenspeicher war beim set() voll. Die Warnung
  // dazu kommt bewusst HIER, nach dem Datei-Schreiben - käme sie sofort,
  // würde die Entwarnung des erfolgreichen Datei-Speicherns sie eine
  // Sekunde später wegwischen (harte-34 hat genau das gefangen).
  let lokalImmerNochOffen = !!lokalFehlte;
  try {
    if (key === ENTRIES_KEY) {
      const next = JSON.parse(value);
      const prev = prevRaw ? JSON.parse(prevRaw) : [];
      const merged = await shared.saveEntries(next, prev);
      // Das Zusammenführ-Ergebnis nur übernehmen, wenn seither kein NEUERER
      // set()-Aufruf für diesen Schlüssel kam - sonst würde der ältere
      // Hintergrund-Schreiber den frischeren Stand des Fensters
      // zurückdrehen. Der nächste Ketten-Schritt schreibt den neueren Stand
      // ohnehin und holt sich fremde Änderungen dabei selbst.
      if (merged && setLauf.get(key) === laufNr) {
        const mergedRaw = JSON.stringify(merged);
        eigenerStand.set(key, mergedRaw);
        try {
          localStorage.setItem(key, mergedRaw);
          lokalImmerNochOffen = false; // zweiter Versuch hat geklappt
        } catch (e) { /* Spiegel voll - Datei hat den Stand */ }
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
    shared.dispatchError(lokalImmerNochOffen
      // Doppel-Fall: Zwischenspeicher voll UND Datei nicht erreichbar -
      // die Änderung ist gerade wirklich nirgends dauerhaft gesichert.
      ? "Der Zwischenspeicher dieses Browsers ist voll UND die gemeinsame Datei war nicht erreichbar – die letzte Änderung ist derzeit NICHT gesichert. Bitte Laufwerk prüfen und erneut speichern; alte Jahrgänge auslagern schafft Platz."
      : "In der gemeinsamen Datei konnte nicht gespeichert werden (Laufwerk erreichbar? Datei gesperrt?). Lokal ist alles gesichert – beim nächsten erfolgreichen Speichern wird automatisch abgeglichen.");
    return;
  }
  if (lokalImmerNochOffen) {
    // Die Änderung STEHT jetzt in der gemeinsamen Datei - nur die örtliche
    // Zweitschrift fehlt. Kein Datenverlust, aber ein Zustand, den man
    // kennen muss (nach dem Neuladen fehlen Daten, bis die Datei wieder
    // gelesen wurde).
    shared.dispatchError("Der Zwischenspeicher dieses Browsers ist voll. Deine Änderung steht in der gemeinsamen Datei und ist NICHT verloren – auf diesem Gerät kann sie aber nicht zwischengespeichert werden. Bitte alte Jahrgänge auslagern oder den Browser-Speicher der Seite leeren.");
  }
}

// Testzugang für die Prüfstände (wie __wkSharedTest): auflösbar, sobald
// alle bis JETZT eingereihten Hintergrund-Schreiber durch sind. Ohne ihn
// müssten Sync-Tests raten, wann die Datei den Stand hat - mit Warten auf
// Verdacht statt auf Gewissheit.
window.__wkStorageTest = {
  dateiFertig: () => dateiKette,
  offen: () => dateiOffen,
};

window.storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    if (value !== null) eigenerStand.set(key, value);
    return value === null ? null : { key, value };
  },
  async set(key, value) {
    // Ausgangspunkt ist der eigene letzte Stand, nicht der geteilte Speicher.
    const prevRaw = eigenerStand.has(key) ? eigenerStand.get(key) : localStorage.getItem(key);
    eigenerStand.set(key, value);
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

    const dateiWeg = shared.isConnected() && shared.canWrite() && (key === ENTRIES_KEY || key === CONFIG_KEY);
    if (dateiWeg) {
      const laufNr = (setLauf.get(key) || 0) + 1;
      setLauf.set(key, laufNr);
      dateiOffen++;
      dateiKette = dateiKette
        .then(() => inDateiSchreiben(key, value, prevRaw, laufNr, !lokalGespeichert))
        .catch(() => { /* inDateiSchreiben fängt selbst - die Kette darf nie reißen */ })
        .then(() => { dateiOffen--; });
    }

    if (!lokalGespeichert && !dateiWeg) {
      // Ohne gemeinsame Datei gibt es keine zweite Ablage: Jetzt ist die
      // Änderung wirklich nirgends. Das muss als Fehler durchschlagen,
      // damit die App es meldet statt still weiterzumachen. (MIT Datei-Weg
      // meldet die Hintergrund-Kette den Voll-Zustand nach dem Schreiben.)
      throw new Error("Der Zwischenspeicher dieses Browsers ist voll – die Änderung konnte nirgends gesichert werden. Bitte alte Jahrgänge auslagern oder eine gemeinsame Datei verbinden.");
    }
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return true;
  },
};
