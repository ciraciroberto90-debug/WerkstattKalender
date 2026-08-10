/* Name der Zwischendatei fürs atomare Schreiben (erst Zwischendatei, dann
 * Umbenennen - so entstehen nie halbe Dateien).
 *
 * Warum die Endung des ZIELS am Ende stehen muss: Firmenlaufwerke filtern
 * beim Anlegen nach Dateityp (Windows-Dateiprüfung/FSRM). Gemessen am
 * 10.08.2026 auf Robertos Laufwerk (\\SCHEUDC1\...): Das Anlegen von
 * ".daten - Kopie.json.schreibe-44312" scheiterte mit EPERM, während eine
 * .txt-Datei im selben Ordner anstandslos anzulegen war - der Server kennt
 * die Endung ".schreibe-44312" nicht. Trägt die Zwischendatei dieselbe
 * Endung wie das Ziel (.json), fällt sie durch keinen Typ-Filter.
 * Auf den führenden Punkt (versteckte Datei) wird aus demselben Grund
 * verzichtet - sie lebt ohnehin nur Millisekunden.
 */
const path = require("path");

function zwischenName(ziel, kennung) {
  const endung = path.extname(String(ziel));
  const stamm = path.basename(String(ziel), endung);
  return path.join(path.dirname(String(ziel)), stamm + ".schreibe-" + String(kennung) + endung);
}

module.exports = { zwischenName };
