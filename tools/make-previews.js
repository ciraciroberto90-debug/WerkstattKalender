// Erzeugt zwei Artifact-taugliche Vorschau-Dateien (Leser + Bearbeiter) aus dem
// gebauten Ein-Datei-Bundle – OHNE die Produktions-App zu verändern.
// - Body-Inhalt wird aus dem Volldokument extrahiert (Artifact umschließt selbst mit <html>/<head>/<body>).
// - Ein kleines Skript erzwingt den Modus (File System Access vorhanden = Leser, nicht unterstützt = Bearbeiter)
//   und legt Demo-Daten in den localStorage (nur, wenn noch leer).
const fs = require("fs");
const path = require("path");

const ROOT = "/home/user/WerkstattKalender";
const html = fs.readFileSync(path.join(ROOT, "Werkstatt_Kalender_TPM.html"), "utf8");

// WICHTIG: Das JS-Bundle enthält HTML-Vorlagen-Strings (Druck-Export) mit
// <head>/<body>/</body>. Deshalb NICHT per String-Suche zerlegen, sondern nur
// die äußere Dokumenthülle per Position entfernen. Übrig bleibt <head>…</head>
// <body>…</body> am Stück – das legt der Artifact-Host in seinen eigenen <body>.
const htmlOpen = html.match(/<html[^>]*>/i)[0];
const startIdx = html.indexOf(htmlOpen) + htmlOpen.length;
const endIdx = html.lastIndexOf("</html>");
const innerDoc = html.slice(startIdx, endIdx).trim();

// ---- Demo-Daten (klein, aber realistisch) ----
const CONFIG = {
  team: [
    { name: "R. Ciraci", rolle: "mech" },
    { name: "M. Weber", rolle: "elek" },
    { name: "T. Klein", rolle: "mech" },
    { name: "S. Bauer", rolle: "azubi" },
    { name: "A. Fischer", rolle: "elek" },
    { name: "J. Wolf", rolle: "mech" },
  ],
};
const STOER = require("./demo-stoerungen.js");

// Demo-Version: wird sie erhöht, werden die Demo-Daten beim nächsten Laden EINMAL
// neu gesetzt (überschreibt die alten Demo-Daten). Sonst bleibt alles wie es ist,
// damit Herumklicken zwischen zwei F5 nicht verloren geht.
const DEMO_VER = "demo-3";
const seed = `
  try {
    if (localStorage.getItem('wk-demo-ver') !== ${JSON.stringify(DEMO_VER)}) {
      localStorage.setItem('werkstatt-kalender-config', ${JSON.stringify(JSON.stringify(CONFIG))});
      localStorage.setItem('werkstatt-stoerungen-entries', ${JSON.stringify(JSON.stringify(STOER))});
      localStorage.setItem('wk-demo-ver', ${JSON.stringify(DEMO_VER)});
    }
  } catch(e){}
`;

const leserScript = `<script>
(function(){
  // Vorschau LESER: File System Access "vorhanden" -> App bleibt (unverbunden) im Nur-Leser-Modus
  try { if (typeof window.showOpenFilePicker !== 'function') window.showOpenFilePicker = function(){ return Promise.reject(new Error('Vorschau')); }; } catch(e){}
  try { if (typeof window.showSaveFilePicker !== 'function') window.showSaveFilePicker = function(){ return Promise.reject(new Error('Vorschau')); }; } catch(e){}
  ${seed}
})();
</script>`;

const bearbeiterScript = `<script>
(function(){
  // Vorschau BEARBEITER: File System Access "nicht unterstützt" -> volle App (Solo-Betrieb)
  try { delete window.showOpenFilePicker; } catch(e){}
  try { delete window.showSaveFilePicker; } catch(e){}
  try { window.showOpenFilePicker = undefined; } catch(e){}
  try { window.showSaveFilePicker = undefined; } catch(e){}
  ${seed}
})();
</script>`;

const banner = (txt, farbe) => `<div style="position:fixed;left:0;right:0;bottom:0;z-index:99999;background:${farbe};color:#fff;font:600 12px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;text-align:center;padding:5px 10px;">${txt}</div>`;

const outLeser = "<title>Werkstatt-Kalender · Leser-Vorschau</title>\n" + leserScript + "\n" + innerDoc + "\n" +
  banner("VORSCHAU · LESER-ANSICHT — nur zum Anschauen, Daten sind Demo", "#2F6690");
const outBearb = "<title>Werkstatt-Kalender · Bearbeiter-Vorschau</title>\n" + bearbeiterScript + "\n" + innerDoc + "\n" +
  banner("VORSCHAU · BEARBEITER-ANSICHT — nur zum Anschauen, Daten sind Demo", "#C97A2B");

const dir = path.join(ROOT, "scratchpad/preview");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "preview-leser.html"), outLeser);
fs.writeFileSync(path.join(dir, "preview-bearbeiter.html"), outBearb);
console.log("geschrieben:", outLeser.length, "/", outBearb.length, "bytes");
