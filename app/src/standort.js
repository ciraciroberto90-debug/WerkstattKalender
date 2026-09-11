// ---------------------------------------------------------------------------
// Standort-Wahl (BTA-Cockpit, Meeting 10.09.): EINE App, mehrere Werkstätten.
//
// Welcher Standort auf diesem Rechner aktiv ist, entscheidet VOR allem
// anderen, welche Daten geladen werden - deshalb ein winziges Modul ohne
// Abhängigkeiten, das sowohl die App als auch die Speicherschicht einbinden.
//
// Die Trennung läuft über Namensräume: Scheurich behält die ALTEN Schlüssel
// und Datenbanknamen (Bestandsschutz - kein laufender Rechner verliert seine
// Daten oder seine gemerkte Dateiverbindung), jeder weitere Standort bekommt
// einen eigenen Vorsatz. So können sich zwei Standorte nie in die Quere
// kommen: eigener Browser-Zwischenspeicher, eigene gemerkte Dateien, eigene
// Sicherungen.
// ---------------------------------------------------------------------------

const WAHL_KEY = "bta-standort"; // bewusst OHNE Namensraum - die Wahl steht über allem

export const STANDORTE = {
  scheurich: { id: "scheurich", name: "Scheurich", ort: "Kleinheubach", bundesland: "BY", blanko: false },
  // Soendgen startet BLANKO: keine Scheurich-Anlagen, -Rundgänge oder
  // -Kostenstellen als Vorbelegung - der Werkstattmeister pflegt alles
  // selbst über das ⚙-Menü ein (Robertos Ansage vom 11.09.).
  soendgen: { id: "soendgen", name: "Soendgen Keramik", ort: "Adendorf", bundesland: "NW", blanko: true },
};

function gemerkteWahl() {
  try { return localStorage.getItem(WAHL_KEY); } catch (e) { return null; }
}

let gewaehlt = gemerkteWahl();

// Bestandsschutz: Ein Rechner, auf dem schon Kalenderdaten liegen, ist ein
// laufender Scheurich-Arbeitsplatz - der bekommt beim Update KEINE Frage
// vorgesetzt (sonst klickt in der Frühschicht jemand versehentlich auf den
// falschen Standort und meldet "alle Daten weg"). Die Frage erscheint nur
// auf frischen Rechnern; wechseln geht jederzeit über das ⚙-Menü.
if (!gewaehlt) {
  try {
    if (localStorage.getItem("werkstatt-kalender-entries") != null ||
        localStorage.getItem("werkstatt-kalender-config") != null) {
      gewaehlt = "scheurich";
      localStorage.setItem(WAHL_KEY, "scheurich");
    }
  } catch (e) { /* ohne Speicher entscheidet die Startseite */ }
}

export const STANDORT_GEWAEHLT = !!(gewaehlt && STANDORTE[gewaehlt]);
export const STANDORT = STANDORTE[gewaehlt] || STANDORTE.scheurich;

// Schlüssel-Namensraum für localStorage: Scheurich = Alt-Schlüssel (unverändert).
export function nsKey(key) {
  return STANDORT.id === "scheurich" ? key : "bta-" + STANDORT.id + ":" + key;
}
// Datenbank-Namensraum für IndexedDB (gemerkte Dateiverbindungen, Sicherungen).
export function nsDb(name) {
  return STANDORT.id === "scheurich" ? name : "bta-" + STANDORT.id + "-" + name;
}

// Wechsel = Wahl merken und neu laden: Alle Schlüssel und Datenbanknamen
// stehen beim Laden der Module fest - ein Neuladen ist der einzige Weg, der
// garantiert KEINEN vermischten Zwischenzustand kennt.
export function standortWaehlen(id) {
  if (!STANDORTE[id]) return;
  try { localStorage.setItem(WAHL_KEY, id); } catch (e) { /* dann bleibt die Frage */ }
  window.location.reload();
}
