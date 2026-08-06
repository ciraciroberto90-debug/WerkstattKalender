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
  // Rechner mittendrin ab, ist die Zieldatei unangetastet.
  const ziel = String(pfad);
  const tmp = path.join(path.dirname(ziel), "." + path.basename(ziel) + ".schreibe-" + process.pid);
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

/* ---------- Fenster ---------- */
function erstelleFenster() {
  const fenster = new BrowserWindow({
    width: 1500,
    height: 950,
    title: "Werkstatt-Cockpit",
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

  fenster.loadFile(path.join(__dirname, "app", "Werkstatt_Kalender_TPM.html"));
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
  app.whenReady().then(() => {
    erstelleFenster();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) erstelleFenster();
    });
  });
  app.on("window-all-closed", () => {
    app.quit();
  });
}
