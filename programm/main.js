/* Werkstatt-Cockpit als Programm - der Rahmen um die bestehende App.
 *
 * Die App selbst ist dieselbe HTML wie im Browser (app/Werkstatt_Kalender_TPM.html,
 * beim Bauen hineinkopiert). Dieser Rahmen liefert nur das, was der Browser
 * aus Sicherheitsgründen verweigert: direkte Dateizugriffe über echte Pfade.
 *
 * Grundsätze:
 * - Alles Dateisystem läuft HIER im Hauptprozess, die App bekommt über das
 *   Vorspann-Skript (vorspann.js) nur eine schmale, benannte Schnittstelle.
 * - Geschrieben wird atomar: erst Zwischendatei, dann Umbenennen. Halbe
 *   Dateien gibt es so nicht - derselbe Grundsatz wie im Browser-Sync.
 * - Gemerkte Pfade liegen als schlichter Text in einer Einstellungsdatei im
 *   Profil des Benutzers. Sie überleben jeden Neustart - der ganze
 *   "Verweis tot / Schreibschutz nach Neustart"-Komplex entfällt.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");
const { zwischenName } = require("./zwischenname.js");

/* ---------- Einstellungen (gemerkte Pfade) ---------- */
function einstellungsPfad() {
  return path.join(app.getPath("userData"), "einstellungen.json");
}
function leseEinstellungen() {
  try {
    return JSON.parse(fssync.readFileSync(einstellungsPfad(), "utf8"));
  } catch (e) {
    return {};
  }
}
async function schreibeEinstellungen(obj) {
  const ziel = einstellungsPfad();
  await fs.mkdir(path.dirname(ziel), { recursive: true });
  const tmp = ziel + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await fs.rename(tmp, ziel);
}

/* ---------- Vorbelegung fuer neue Rechner (26.08.) ----------
   Robertos Roll-out-Problem: Jeder frische Rechner brauchte zwei Handgriffe
   im Zahnrad (Update-Ordner, Datendatei) - und ein Nur-Leser kommt dort gar
   nicht hin. Der Leser-Rechner lief deshalb wochenlang ohne Updates.
   Loesung: Liegt NEBEN der EXE eine standard-einstellungen.json, werden
   ihre Eintraege beim Start uebernommen - aber NUR fuer Schluessel, die auf
   diesem Rechner noch nie gesetzt wurden. Eine bewusste Wahl am Geraet
   (anderer Ordner, andere Datei) wird also nie ueberschrieben, und die
   Vorgaben-Datei bleibt reine Starthilfe. Entpacken -> starten -> verbunden. */
async function uebernehmeStandardEinstellungen() {
  const kandidaten = [
    // Portabel entpackt: die Datei liegt neben Werkstatt-Cockpit.exe
    path.join(path.dirname(process.execPath), "standard-einstellungen.json"),
    // Entwicklung/Pruefstand (electron .): neben main.js
    path.join(__dirname, "standard-einstellungen.json"),
  ];
  let vorgaben = null;
  for (const pfad of kandidaten) {
    try {
      vorgaben = JSON.parse(fssync.readFileSync(pfad, "utf8"));
      break;
    } catch (e) { /* Datei fehlt oder unlesbar - Vorgaben sind freiwillig */ }
  }
  if (!vorgaben || typeof vorgaben !== "object" || Array.isArray(vorgaben)) return;
  const alle = leseEinstellungen();
  let geaendert = false;
  for (const [schluessel, wert] of Object.entries(vorgaben)) {
    // Nur einfache Text-Werte (Pfade), nur unbesetzte Schluessel.
    // Schluessel mit fuehrendem "_" sind Hinweise in der Vorgaben-Datei
    // selbst (JSON kennt keine Kommentare) und werden nie uebernommen.
    if (schluessel.startsWith("_")) continue;
    if (typeof wert !== "string" || !wert.trim()) continue;
    if (Object.prototype.hasOwnProperty.call(alle, schluessel)) continue;
    alle[schluessel] = wert;
    geaendert = true;
  }
  if (geaendert) await schreibeEinstellungen(alle);
}

/* ---------- Datei-Schnittstelle für die App ---------- */
ipcMain.handle("datei-waehlen", async (ev) => {
  const fenster = BrowserWindow.fromWebContents(ev.sender);
  const r = await dialog.showOpenDialog(fenster, {
    title: "Gemeinsame Datei öffnen",
    filters: [{ name: "Werkstatt-Cockpit Daten", extensions: ["json"] }],
    properties: ["openFile"],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

ipcMain.handle("datei-neu", async (ev, vorschlag) => {
  const fenster = BrowserWindow.fromWebContents(ev.sender);
  const r = await dialog.showSaveDialog(fenster, {
    title: "Neue gemeinsame Datei anlegen",
    defaultPath: String(vorschlag || "werkstatt-kalender-daten.json"),
    filters: [{ name: "Werkstatt-Cockpit Daten", extensions: ["json"] }],
  });
  return r.canceled || !r.filePath ? null : r.filePath;
});

ipcMain.handle("ordner-waehlen", async (ev) => {
  const fenster = BrowserWindow.fromWebContents(ev.sender);
  const r = await dialog.showOpenDialog(fenster, {
    title: "Ordner wählen",
    properties: ["openDirectory"],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

ipcMain.handle("lese", async (ev, pfad) => {
  try {
    const [inhalt, stat] = await Promise.all([fs.readFile(String(pfad)), fs.stat(String(pfad))]);
    return { bytes: inhalt, geaendert: Math.round(stat.mtimeMs), groesse: stat.size };
  } catch (e) {
    if (e && e.code === "ENOENT") return null; // fehlt -> die App macht NotFoundError daraus
    throw e;
  }
});

ipcMain.handle("schreibe", async (ev, pfad, text) => {
  // Atomar: Zwischendatei im selben Ordner, dann Umbenennen. Bricht der
  // Rechner mittendrin ab, ist die Zieldatei unangetastet. Die Namensregel
  // steckt in zwischenname.js - samt der Lehre von Robertos Laufwerk
  // (Dateityp-Filter weisen unbekannte Endungen mit EPERM ab).
  const ziel = String(pfad);
  const tmp = zwischenName(ziel, process.pid);
  await fs.writeFile(tmp, String(text), "utf8");
  try {
    await fs.rename(tmp, ziel);
  } catch (e) {
    // Windows: rename über eine gerade gelesene Datei kann EPERM werfen -
    // dann einmal kurz warten und erneut, danach aufräumen und Fehler melden.
    await new Promise((r) => setTimeout(r, 150));
    try {
      await fs.rename(tmp, ziel);
    } catch (e2) {
      try { await fs.unlink(tmp); } catch (e3) { /* Zwischendatei blieb liegen */ }
      throw e2;
    }
  }
  return true;
});

/* Fotos (26.08.): Die App legt Bilddateien im Unterordner "Fotos" des
   Datenordners ab. Dafür braucht die Brücke zwei Handgriffe, die es bisher
   nicht gab - Ordner anlegen und Bytes schreiben. Beides bleibt so schmal
   wie der Rest: benannte Pfade, kein allgemeiner Dateizugriff. */
ipcMain.handle("ordner-anlegen", async (ev, pfad) => {
  await fs.mkdir(String(pfad), { recursive: true });
  return true;
});

ipcMain.handle("schreibe-bytes", async (ev, pfad, bytes) => {
  // Gleicher atomarer Weg wie beim Text-Schreiben: Zwischendatei mit der
  // ENDUNG DES ZIELS (.jpg), dann Umbenennen - die Dateityp-Filter des
  // Laufwerks (EPERM-Lehre vom 10.08.) gelten für Bilder genauso.
  const ziel = String(pfad);
  const tmp = zwischenName(ziel, process.pid);
  await fs.writeFile(tmp, Buffer.from(bytes));
  try {
    await fs.rename(tmp, ziel);
  } catch (e) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      await fs.rename(tmp, ziel);
    } catch (e2) {
      try { await fs.unlink(tmp); } catch (e3) { /* Zwischendatei blieb liegen */ }
      throw e2;
    }
  }
  return true;
});

ipcMain.handle("liste", async (ev, ordnerPfad) => {
  const eintraege = await fs.readdir(String(ordnerPfad), { withFileTypes: true });
  return eintraege
    .filter((e) => e.isFile())
    .map((e) => ({ name: e.name, pfad: path.join(String(ordnerPfad), e.name) }));
});

ipcMain.handle("entferne", async (ev, pfad) => {
  await fs.unlink(String(pfad));
  return true;
});

ipcMain.handle("merke", async (ev, schluessel, wert) => {
  const alle = leseEinstellungen();
  if (wert === null || wert === undefined) delete alle[String(schluessel)];
  else alle[String(schluessel)] = String(wert);
  await schreibeEinstellungen(alle);
  return true;
});

ipcMain.handle("gemerkt", async (ev, schluessel) => {
  const alle = leseEinstellungen();
  const wert = alle[String(schluessel)];
  return wert === undefined ? null : wert;
});

// Laufwerkspfade direkt im Explorer öffnen - im Browser brauchte das den
// Ausliefer-Dienst, hier kann es das Programm selbst.
ipcMain.handle("oeffne-pfad", async (ev, pfad) => {
  const fehler = await shell.openPath(String(pfad));
  return fehler === "" ? true : fehler;
});

// Was ist an diesem Pfad? Fuer die Pfad-Eingabezeile (OEE-Ordner): Der
// Nutzer fuegt einen kopierten Pfad ein, wir sagen, ob dort eine Datei oder
// ein Ordner liegt - ohne Dialog.
ipcMain.handle("pfad-info", async (ev, pfad) => {
  try {
    const stat = await fs.stat(String(pfad));
    return stat.isDirectory() ? "ordner" : stat.isFile() ? "datei" : null;
  } catch (e) {
    return null;
  }
});

/* ---------- Programm-Updates ------------------------------------------
   Der Rahmen ist absichtlich duenn - alles, was sich je aendert, steckt in
   der App-HTML. Deshalb funktioniert das Update wie bisher in der Werkstatt:
   Die neue HTML wird in den Netzwerkordner gelegt. Das Programm schaut dort
   regelmaessig nach, meldet "Neue Version verfuegbar", und ein Klick
   uebernimmt die Datei ins eigene Profil und laedt neu.

   Sicherung gegen halbe Dateien: Eine HTML, die gerade erst zur Haelfte auf
   das Laufwerk kopiert ist, darf NIE uebernommen werden. Deshalb wird
   (1) zweimal im Abstand gemessen, ob die Datei noch waechst,
   (2) der Inhalt geprueft (beginnt mit <!doctype, endet mit </html>,
       plausible Groesse) und
   (3) atomar ins Profil geschrieben. Schlaegt irgendetwas fehl, laeuft die
   bisherige Fassung unveraendert weiter. */
const UPDATE_TAKT_MS = 5 * 60 * 1000;
const HTML_MUSTER = /^Werkstatt_Kalender_TPM.*\.html$/i;

function bauZeit(text) {
  // Der Bau-Zeitstempel steckt genau einmal als Literal in der App-HTML
  // (vite traegt __BUILD_ZEIT__ ein). Fassungen ohne Stempel sind aelter
  // als der Stempel selbst - sie gelten als uralt.
  const m = String(text || "").match(/"(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)"/);
  return m ? (Date.parse(m[1]) || 0) : 0;
}
function aktuelleHtml() {
  // Vom Update uebernommene Fassung im Profil ODER die eingebaute - es
  // gewinnt die JUENGERE Bau-Zeit. Robertos Fall vom 10.08.: Neue ZIP
  // installiert, aber eine frueher per Update uebernommene, aeltere Fassung
  // aus dem Profil gewann bedingungslos - die neue ZIP lief nie.
  const uebernommen = path.join(app.getPath("userData"), "app-aktuell.html");
  const eingebaut = path.join(__dirname, "app", "Werkstatt_Kalender_TPM.html");
  try {
    if (fssync.existsSync(uebernommen)) {
      const textU = fssync.readFileSync(uebernommen, "utf8");
      if (htmlPlausibel(textU) && bauZeit(textU) >= bauZeit(fssync.readFileSync(eingebaut, "utf8"))) {
        return uebernommen;
      }
    }
  } catch (e) { /* im Zweifel laeuft die eingebaute Fassung */ }
  return eingebaut;
}
function htmlPlausibel(text) {
  const t = String(text || "");
  return t.length > 200000
    && /^\s*<!doctype html/i.test(t)
    && /<\/html>\s*$/i.test(t);
}
async function findeNeuesteHtml(ordner) {
  const eintraege = await fs.readdir(String(ordner), { withFileTypes: true });
  let beste = null;
  for (const e of eintraege) {
    if (!e.isFile() || !HTML_MUSTER.test(e.name)) continue;
    const voll = path.join(String(ordner), e.name);
    const stat = await fs.stat(voll);
    if (!beste || stat.mtimeMs > beste.mtimeMs) beste = { pfad: voll, name: e.name, mtimeMs: stat.mtimeMs, groesse: stat.size };
  }
  return beste;
}
let updateGemeldet = ""; // damit dieselbe Version nicht alle 5 Minuten neu poppt
async function pruefeUpdate(fenster) {
  const einstellungen = leseEinstellungen();
  const ordner = einstellungen["programm:update-ordner"];
  if (!ordner) return;
  let neueste = null;
  try {
    neueste = await findeNeuesteHtml(ordner);
  } catch (e) { return; /* Laufwerk gerade nicht da - naechster Takt */ }
  if (!neueste) return;
  const stand = String(einstellungen["programm:html-stand"] || "");
  const kennung = `${neueste.mtimeMs}-${neueste.groesse}`;
  if (kennung === stand || kennung === updateGemeldet) return;
  updateGemeldet = kennung;
  const ziel = fenster || BrowserWindow.getAllWindows()[0];
  if (ziel) {
    ziel.webContents.send("update-verfuegbar", {
      name: neueste.name,
      geaendert: Math.round(neueste.mtimeMs),
      groesse: neueste.groesse,
    });
  }
}

ipcMain.handle("update-ordner-setzen", async (ev, pfad) => {
  const alle = leseEinstellungen();
  if (pfad) alle["programm:update-ordner"] = String(pfad);
  else delete alle["programm:update-ordner"];
  await schreibeEinstellungen(alle);
  updateGemeldet = "";
  await pruefeUpdate(BrowserWindow.fromWebContents(ev.sender));
  return true;
});

ipcMain.handle("update-status", async () => {
  const alle = leseEinstellungen();
  return {
    ordner: alle["programm:update-ordner"] || "",
    stand: alle["programm:html-stand"] || "",
    laeuftAus: aktuelleHtml().includes("app-aktuell.html") ? "uebernommener Fassung" : "eingebauter Fassung",
  };
});

ipcMain.handle("update-pruefen", async (ev) => {
  updateGemeldet = "";
  await pruefeUpdate(BrowserWindow.fromWebContents(ev.sender));
  return true;
});

ipcMain.handle("update-uebernehmen", async (ev) => {
  const einstellungen = leseEinstellungen();
  const ordner = einstellungen["programm:update-ordner"];
  if (!ordner) return { ok: false, grund: "Kein Update-Ordner eingerichtet." };
  const neueste = await findeNeuesteHtml(ordner);
  if (!neueste) return { ok: false, grund: "Im Update-Ordner liegt keine App-HTML." };

  // (1) Waechst die Datei noch? Dann kopiert der Explorer gerade.
  const vorher = await fs.stat(neueste.pfad);
  await new Promise((r) => setTimeout(r, 600));
  const nachher = await fs.stat(neueste.pfad);
  if (vorher.size !== nachher.size || vorher.mtimeMs !== nachher.mtimeMs) {
    return { ok: false, grund: "Die Datei wird gerade noch kopiert - bitte gleich nochmal." };
  }

  // (2) Inhalt pruefen - eine halbe HTML faellt hier durch
  const text = await fs.readFile(neueste.pfad, "utf8");
  if (!htmlPlausibel(text)) {
    return { ok: false, grund: "Die Datei ist unvollstaendig oder keine App-HTML - nichts uebernommen." };
  }

  // (3) Atomar ins Profil schreiben, Stand merken, neu laden
  const ziel = path.join(app.getPath("userData"), "app-aktuell.html");
  const tmp = ziel + ".tmp";
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, ziel);
  const alle = leseEinstellungen();
  alle["programm:html-stand"] = `${nachher.mtimeMs}-${nachher.size}`;
  await schreibeEinstellungen(alle);
  const fenster = BrowserWindow.fromWebContents(ev.sender);
  if (fenster) fenster.loadFile(ziel);
  return { ok: true };
});

/* ---------- Fenster ---------- */
function erstelleFenster() {
  const fenster = new BrowserWindow({
    width: 1500,
    height: 950,
    title: "Werkstatt-Cockpit",
    // Schild mit Zahnrad - Robertos Wahl vom 07.08. Windows nimmt die .ico
    // (alle Groessen enthalten), andere Systeme das grosse PNG.
    icon: path.join(__dirname, "symbol", process.platform === "win32" ? "symbol.ico" : "symbol-512.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "vorspann.js"),
      // Die App bleibt eine normale Webseite ohne Node-Zugriff - alles
      // Dateisystem läuft über die schmale Schnittstelle oben.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);

  // Weblinks (Linkbereich) im normalen Browser öffnen, nicht im Programm.
  // Druckfenster (about:blank) dagegen gehören zum Programm.
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  fenster.loadFile(aktuelleHtml());
  // Nach dem Laden einmal nach Updates schauen, danach im Takt
  fenster.webContents.once("did-finish-load", () => pruefeUpdate(fenster));
  return fenster;
}

// Zweites Öffnen holt das vorhandene Fenster nach vorn, statt eine zweite
// Instanz zu starten - die Zwei-Fenster-Falle vom 05.08. gibt es hier nicht.
const einzig = app.requestSingleInstanceLock();
if (!einzig) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [fenster] = BrowserWindow.getAllWindows();
    if (fenster) {
      if (fenster.isMinimized()) fenster.restore();
      fenster.focus();
    }
  });
  app.whenReady().then(async () => {
    // Vorgaben VOR dem Fenster uebernehmen - die App liest die gemerkten
    // Pfade beim Laden, da muessen sie schon sitzen.
    await uebernehmeStandardEinstellungen().catch(() => { /* Starthilfe, kein Muss */ });
    erstelleFenster();
    setInterval(() => pruefeUpdate(null), UPDATE_TAKT_MS);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) erstelleFenster();
    });
  });
  app.on("window-all-closed", () => {
    app.quit();
  });
}
