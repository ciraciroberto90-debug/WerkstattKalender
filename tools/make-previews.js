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
const STOER = [
  { id: "demo-st-1", date: "2026-07-22", schicht: "Nacht", anlage: "BTS", anlagenteil: "Proface-Panel",
    gewerk: "Elektrik", fehlerart: "Störmeldung", stoerung: "Proface auf Störung – Anlage steht",
    ursache: "Sicherung F12 ausgelöst", getan: "Sicherung getauscht, Anlage neu gestartet", nochZuTun: "",
    ersatzteile: "Feinsicherung 6,3 A", nachbestellt: false, ausfallzeit: 30, offen: false,
    gemeldetAt: "2026-07-22T22:54:00", behobenAt: "2026-07-22T23:24:00", melder: "MW" },
  { id: "demo-st-2", date: "2026-07-23", schicht: "Früh", anlage: "VSM1", anlagenteil: "",
    gewerk: "Mechanik", fehlerart: "Verschleiß", stoerung: "Ungewöhnliches Laufgeräusch am Antrieb",
    ursache: "", getan: "", nochZuTun: "Lager prüfen und ggf. tauschen",
    ersatzteile: "", nachbestellt: false, ausfallzeit: 0, offen: true,
    gemeldetAt: "2026-07-23T06:15:00", behobenAt: null, melder: "RC" },
];

const seed = `
  try {
    if (!localStorage.getItem('werkstatt-kalender-config')) localStorage.setItem('werkstatt-kalender-config', ${JSON.stringify(JSON.stringify(CONFIG))});
    if (!localStorage.getItem('werkstatt-stoerungen-entries')) localStorage.setItem('werkstatt-stoerungen-entries', ${JSON.stringify(JSON.stringify(STOER))});
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
