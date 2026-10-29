/* Umgebung der Tests: wo das Repo liegt, wo die App-Datei liegt, welcher
 * Browser läuft - ein Ort statt fester Cloud-Pfade in jeder Datei.
 *
 * Warum (Roll-out 73, 29.10.): Bis dahin trugen 119 Testdateien die festen
 * Pfade /home/user/WerkstattKalender und /opt/pw-browsers/chromium aus der
 * Cloud-Umgebung. Auf Robertos Laptop liefen sie deshalb nicht. Jetzt findet
 * jeder Test das Repo über diese Datei (ihr eigener Ort ist tests/), und der
 * Browser kommt aus PW_CHROMIUM oder aus Playwrights eigener Ablage im
 * Benutzerprofil (node tests/node_modules/playwright-core/cli.js install chromium).
 *
 * APP_PFAD bleibt der Weg für den Rot-Nachweis gegen einen alten Bau:
 *   APP_PFAD=<alte html> node tests/hardness/harte-NN.js
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { pathToFileURL } = require("url");

const WURZEL = path.resolve(__dirname, "..");
const APP_PFAD = path.resolve(process.env.APP_PFAD || path.join(WURZEL, "Werkstatt_Kalender_TPM.html"));

/* file://-Adresse aus einem Pfad - unter Windows ist "file://" + "C:\..." keine
 * gültige Adresse, pathToFileURL macht daraus file:///C:/... Relative Pfade
 * gelten ab dem Repo-Wurzelordner. */
const dateiUrl = (p) => pathToFileURL(path.isAbsolute(p) ? p : path.join(WURZEL, p)).href;
const APP = dateiUrl(APP_PFAD);

/* Der Browser liegt im Repo unter tests/browser/ (in .gitignore), nicht in
 * Playwrights Vorgabe %LOCALAPPDATA%\ms-playwright. Warum: Ein Ort, den jede
 * Shell auf dem Rechner sieht - gemessen 29.10.: die Sandbox der Desktop-App
 * täuscht Schreibzugriffe unter AppData nur vor, im Repo-Ordner sind sie echt.
 * Muss VOR dem ersten require("playwright-core") gesetzt sein; deshalb bindet
 * jeder Test zuerst diese Datei ein. Einmalig je Rechner:
 *   node tests/browser-holen.js
 * undefined bei CHROMIUM heißt: playwright-core nimmt den Browser aus dieser
 * Ablage. PW_CHROMIUM überstimmt das, z. B. in der Cloud. */
const BROWSER_ABLAGE = path.join(__dirname, "browser");
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && !process.env.PW_CHROMIUM) process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSER_ABLAGE;
const CHROMIUM = process.env.PW_CHROMIUM || undefined;

/* Fester Arbeitsordner je Test unter dem Temp-Ordner des Benutzers - statt
 * eines festen /tmp-Pfades aus der Cloud. Wird angelegt, falls er fehlt. */
const tmpOrdner = (name) => {
  const o = path.join(os.tmpdir(), "bta-tests", name);
  fs.mkdirSync(o, { recursive: true });
  return o;
};

module.exports = { WURZEL, APP_PFAD, APP, CHROMIUM, BROWSER_ABLAGE, dateiUrl, tmpOrdner };
