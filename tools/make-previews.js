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
  { id: "demo-st-2", date: "2026-07-23", schicht: "Früh", anlage: "VSM1", anlagenteil: "Antrieb",
    gewerk: "Mechanik", fehlerart: "Verschleiß", stoerung: "Ungewöhnliches Laufgeräusch am Antrieb",
    ursache: "", getan: "", nochZuTun: "Lager prüfen und ggf. tauschen",
    ersatzteile: "", nachbestellt: false, ausfallzeit: 0, offen: true,
    gemeldetAt: "2026-07-23T06:15:00", behobenAt: null, melder: "RC" },
  { id: "demo-st-3", date: "2026-07-21", schicht: "Spät", anlage: "TS200", anlagenteil: "Spannzylinder",
    gewerk: "Pneumatik", fehlerart: "Pneumatik", stoerung: "Zylinder fährt nicht vollständig aus",
    ursache: "Pneumatikschlauch undicht", getan: "Schlauch ersetzt, Funktion geprüft", nochZuTun: "",
    ersatzteile: "Pneumatikschlauch 8 mm", nachbestellt: false, ausfallzeit: 45, offen: false,
    gemeldetAt: "2026-07-21T15:10:00", behobenAt: "2026-07-21T15:55:00", melder: "TK" },
  { id: "demo-st-4", date: "2026-07-20", schicht: "Nacht", anlage: "HRO", anlagenteil: "Trocknerkette",
    gewerk: "Mechanik", fehlerart: "Kettenriss", stoerung: "Trocknerkette gerissen, Anlagenstopp",
    ursache: "Kettenglied ausgeschlagen", getan: "Kette instand gesetzt und neu gespannt", nochZuTun: "",
    ersatzteile: "Kettenschloss", nachbestellt: false, ausfallzeit: 120, offen: false,
    gemeldetAt: "2026-07-20T02:30:00", behobenAt: "2026-07-20T04:30:00", melder: "JW" },
  { id: "demo-st-5", date: "2026-07-19", schicht: "Früh", anlage: "OF320", anlagenteil: "Frequenzumrichter",
    gewerk: "Elektrik", fehlerart: "Antrieb", stoerung: "Frequenzumrichter Fehler F0022",
    ursache: "Überhitzung des FU", getan: "FU-Lüfter gereinigt, Fehler quittiert", nochZuTun: "",
    ersatzteile: "", nachbestellt: false, ausfallzeit: 25, offen: false,
    gemeldetAt: "2026-07-19T09:05:00", behobenAt: "2026-07-19T09:30:00", melder: "AF" },
  { id: "demo-st-6", date: "2026-07-18", schicht: "Spät", anlage: "Masseaufbereitung", anlagenteil: "Förderpumpe",
    gewerk: "Beide", fehlerart: "Leckage", stoerung: "Leckage an der Förderpumpe",
    ursache: "", getan: "", nochZuTun: "Gleitringdichtung bestellen und tauschen",
    ersatzteile: "Gleitringdichtung", nachbestellt: true, ausfallzeit: 15, offen: true,
    gemeldetAt: "2026-07-18T14:20:00", behobenAt: null, melder: "RC" },
  { id: "demo-st-7", date: "2026-07-17", schicht: "Früh", anlage: "B1", anlagenteil: "Förderband",
    gewerk: "Mechanik", fehlerart: "Bandlauf", stoerung: "Förderband läuft schief",
    ursache: "Bandführung verstellt", getan: "Band neu justiert und Lauf kontrolliert", nochZuTun: "",
    ersatzteile: "", nachbestellt: false, ausfallzeit: 20, offen: false,
    gemeldetAt: "2026-07-17T07:40:00", behobenAt: "2026-07-17T08:00:00", melder: "TK" },
  { id: "demo-st-8", date: "2026-07-16", schicht: "Nacht", anlage: "VSM2", anlagenteil: "Endlage",
    gewerk: "Elektrik", fehlerart: "Sensor defekt", stoerung: "Endlagensensor meldet nicht",
    ursache: "Näherungsschalter defekt", getan: "Sensor getauscht und eingelernt", nochZuTun: "",
    ersatzteile: "Näherungsschalter M12", nachbestellt: false, ausfallzeit: 35, offen: false,
    gemeldetAt: "2026-07-16T23:15:00", behobenAt: "2026-07-16T23:50:00", melder: "MW" },
  { id: "demo-st-9", date: "2026-07-15", schicht: "Spät", anlage: "TS480", anlagenteil: "Hydraulikaggregat",
    gewerk: "Beide", fehlerart: "Hydraulik", stoerung: "Hydraulikdruck zu niedrig",
    ursache: "", getan: "", nochZuTun: "Hydraulikaggregat prüfen, Ölstand und Filter kontrollieren",
    ersatzteile: "", nachbestellt: false, ausfallzeit: 0, offen: true,
    gemeldetAt: "2026-07-15T16:45:00", behobenAt: null, melder: "AF" },
  { id: "demo-st-10", date: "2026-07-14", schicht: "Früh", anlage: "B+T", anlagenteil: "Umlenkrolle",
    gewerk: "Mechanik", fehlerart: "Lagerschaden", stoerung: "Lagergeräusch an der Umlenkrolle",
    ursache: "Lager eingelaufen", getan: "Lager erneuert, Rundlauf geprüft", nochZuTun: "",
    ersatzteile: "Rillenkugellager 6205", nachbestellt: false, ausfallzeit: 60, offen: false,
    gemeldetAt: "2026-07-14T08:10:00", behobenAt: "2026-07-14T09:10:00", melder: "JW" },
  { id: "demo-st-11", date: "2026-07-12", schicht: "Nacht", anlage: "RRO", anlagenteil: "Not-Aus-Kreis",
    gewerk: "Elektrik", fehlerart: "Störmeldung", stoerung: "Not-Aus ausgelöst, Anlage aus",
    ursache: "Not-Aus-Taster verklemmt", getan: "Taster gangbar gemacht und geprüft", nochZuTun: "",
    ersatzteile: "", nachbestellt: false, ausfallzeit: 10, offen: false,
    gemeldetAt: "2026-07-12T01:05:00", behobenAt: "2026-07-12T01:15:00", melder: "MW" },
  { id: "demo-st-12", date: "2026-07-10", schicht: "Spät", anlage: "Wikler", anlagenteil: "Tänzerwalze",
    gewerk: "Mechanik", fehlerart: "Bandlauf", stoerung: "Wickelspannung schwankt stark",
    ursache: "", getan: "", nochZuTun: "Tänzerwalze und Bremse prüfen, Spannung neu einstellen",
    ersatzteile: "", nachbestellt: false, ausfallzeit: 0, offen: true,
    gemeldetAt: "2026-07-10T17:30:00", behobenAt: null, melder: "TK" },
  { id: "demo-st-13", date: "2026-07-08", schicht: "Früh", anlage: "LTA1", anlagenteil: "Filterstufe",
    gewerk: "Beide", fehlerart: "Verschleiß", stoerung: "Absaugleistung zu gering",
    ursache: "Filter zugesetzt", getan: "Filter gereinigt bzw. getauscht", nochZuTun: "",
    ersatzteile: "Taschenfilter", nachbestellt: false, ausfallzeit: 40, offen: false,
    gemeldetAt: "2026-07-08T10:00:00", behobenAt: "2026-07-08T10:40:00", melder: "AF" },
  { id: "demo-st-14", date: "2026-06-30", schicht: "Nacht", anlage: "TS320", anlagenteil: "SPS",
    gewerk: "Elektrik", fehlerart: "Softwarefehler", stoerung: "SPS-Kommunikation gestört",
    ursache: "Netzwerkkabel defekt", getan: "Patchkabel ersetzt, Verbindung wiederhergestellt", nochZuTun: "",
    ersatzteile: "Patchkabel Cat.6", nachbestellt: false, ausfallzeit: 50, offen: false,
    gemeldetAt: "2026-06-30T03:20:00", behobenAt: "2026-06-30T04:10:00", melder: "RC" },
  { id: "demo-st-15", date: "2026-06-25", schicht: "Spät", anlage: "B3", anlagenteil: "Antriebsmotor",
    gewerk: "Mechanik", fehlerart: "Überhitzung", stoerung: "Motor sehr heiß gelaufen",
    ursache: "", getan: "", nochZuTun: "Motorlager und Lüfter prüfen, ggf. Motor tauschen",
    ersatzteile: "E-Motor 5,5 kW", nachbestellt: true, ausfallzeit: 90, offen: true,
    gemeldetAt: "2026-06-25T18:50:00", behobenAt: null, melder: "JW" },
];

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
