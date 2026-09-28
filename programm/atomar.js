/* Atomares Schreiben für das Programm (28.09.2026).
 *
 * Bisher stand der Ablauf direkt in main.js: Zwischendatei schreiben, dann
 * Umbenennen, beim Umbenennen ein zweiter Versuch. Robertos neuer Rechner
 * (über den USB-Stick eingerichtet) zeigte zwei Lücken:
 *
 *  1. Schlug schon das ANLEGEN der Zwischendatei fehl (EPERM beim open auf
 *     dem Netzlaufwerk), gab es keinen zweiten Versuch - und eine halb
 *     angelegte Zwischendatei blieb mit 0 KB im Ordner liegen (zu sehen im
 *     Explorer: "werkstatt-kalender-daten.schreibe-22784.json, 0 KB").
 *  2. Die Fehlermeldung nannte nur den Node-Text ("EPERM: operation not
 *     permitted, open …") - nicht, WELCHER Schritt scheiterte.
 *
 * Jetzt: Jeder Schritt (Anlegen, Umbenennen) bekommt bis zu vier Anläufe mit
 * wachsender Pause (150, 400, 900, 1800 ms) - ein Virenscanner, der die eben
 * angelegte Datei kurz festhält, oder ein Kollege, der die Zieldatei gerade
 * liest, ist nach Sekundenbruchteilen fertig; ein fehlendes Recht bleibt.
 * Scheitert es endgültig, wird die Zwischendatei weggeräumt und der Fehler
 * nennt den Schritt. Vor jedem Schreiben räumt ein Blick in den Ordner alte
 * Zwischendateien (älter als 10 Minuten, von abgebrochenen Läufen) weg.
 *
 * Die Funktion nimmt das Dateisystem als Parameter, damit sie ohne Electron
 * und ohne Laufwerk prüfbar ist (tests/pruefe-programm.js).
 */
const path = require("path");
const { zwischenName } = require("./zwischenname.js");

const PAUSEN_MS = [150, 400, 900, 1800];
const ALT_MS = 10 * 60 * 1000;
// Fehler, bei denen ein erneuter Versuch Sinn hat: kurz belegt oder gesperrt.
const WIEDERHOLBAR = new Set(["EPERM", "EBUSY", "EACCES", "ETXTBSY", "EAGAIN", "EEXIST", "ENOTEMPTY"]);

function mitSchritt(e, schritt, datei) {
  const f = e instanceof Error ? e : new Error(String(e));
  f.schritt = schritt;
  f.message = `${schritt} (${path.basename(String(datei))}): ${f.message}`;
  return f;
}

async function mitAnlaeufen(tu, schritt, datei, pause) {
  let letzter = null;
  for (let i = 0; i <= PAUSEN_MS.length; i++) {
    try { return await tu(); }
    catch (e) {
      letzter = e;
      if (!WIEDERHOLBAR.has(e && e.code) || i === PAUSEN_MS.length) break;
      await pause(PAUSEN_MS[i]);
    }
  }
  throw mitSchritt(letzter, schritt, datei);
}

// Liegengebliebene Zwischendateien desselben Ziels wegräumen - nur alte, denn
// eine junge könnte einem anderen Fenster gehören, das gerade schreibt.
async function raeumeAlteZwischendateien(fs, ziel, jetzt) {
  try {
    const ordner = path.dirname(String(ziel));
    const endung = path.extname(String(ziel));
    const stamm = path.basename(String(ziel), endung);
    const muster = stamm + ".schreibe-";
    const namen = await fs.readdir(ordner);
    for (const n of namen) {
      if (!n.startsWith(muster) || !n.endsWith(endung)) continue;
      const voll = path.join(ordner, n);
      try {
        const st = await fs.stat(voll);
        if (jetzt - st.mtimeMs > ALT_MS) await fs.unlink(voll);
      } catch (e) { /* weg oder gesperrt - dann eben nicht */ }
    }
  } catch (e) { /* Ordner nicht lesbar - das Schreiben selbst entscheidet */ }
}

/**
 * @param fs      promises-Dateisystem (fs.promises oder eine Attrappe)
 * @param ziel    Zielpfad
 * @param inhalt  string oder Buffer
 * @param kennung eindeutige Kennung für die Zwischendatei (z. B. process.pid)
 * @param opts    { pause?: (ms) => Promise, jetzt?: () => number }
 */
async function schreibeAtomar(fs, ziel, inhalt, kennung, opts = {}) {
  const pause = opts.pause || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const jetzt = opts.jetzt || Date.now;
  const zielPfad = String(ziel);
  const tmp = zwischenName(zielPfad, kennung);
  await raeumeAlteZwischendateien(fs, zielPfad, jetzt());
  try {
    await mitAnlaeufen(() => fs.writeFile(tmp, inhalt), "Zwischendatei anlegen", tmp, pause);
  } catch (e) {
    try { await fs.unlink(tmp); } catch (e2) { /* nie angelegt oder gesperrt */ }
    throw e;
  }
  try {
    await mitAnlaeufen(() => fs.rename(tmp, zielPfad), "Zieldatei ersetzen (Umbenennen)", zielPfad, pause);
  } catch (e) {
    try { await fs.unlink(tmp); } catch (e2) { /* Zwischendatei blieb liegen */ }
    throw e;
  }
  return true;
}

module.exports = { schreibeAtomar, PAUSEN_MS, ALT_MS };
