// Erzeugt zwei Artifact-taugliche Vorschau-Dateien (Leser + Bearbeiter) aus dem
// gebauten Ein-Datei-Bundle – OHNE die Produktions-App zu verändern.
// - Body-Inhalt wird aus dem Volldokument extrahiert (Artifact umschließt selbst mit <html>/<head>/<body>).
// - Ein kleines Skript erzwingt den Modus (File System Access vorhanden = Leser, nicht unterstützt = Bearbeiter)
//   und legt Demo-Daten in den localStorage - AUSSCHLIESSLICH beim allerersten Besuch.
//   Die Vorschau benutzt dieselben Speicher-Schlüssel wie die echte App. Sie darf
//   deshalb niemals von sich aus überschreiben, was jemand hier eingetippt hat;
//   Auffrischen geht nur bewusst über den Knopf im Hinweisbalken (mit Rückfrage).
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

// Die Termine entstehen erst im Browser - relativ zum HEUTIGEN Tag des
// Besuchers. Vorher standen sie fest auf Juli 2026: wer die Vorschau im
// August öffnete, sah eine Monatsquote von 0 % und einen leeren Jahreskalender.
// Eine Demo, die nichts zeigt, ist keine.
const TPM_ANLAGEN = ["Masseaufbereitung", "BTS", "VSM1", "VSM2", "TS200", "OF320", "TS480", "TS320",
  "B+T", "RRO", "HRO", "B1", "B2", "B3", "Wikler", "LTA1", "LTA2"];
const RI_PUNKTE = ["Wasserrundgang", "Elevatorprüfung + Ölen", "HRO Trocknerketten Ölen", "Energieaufschreibung",
  "Leiterkontrolle R+I 9", "Abwasserproben R+I 30", "Werkstattreinigung", "Filterwartung / Schaltschränke",
  "Kompressor Rundgang", "Hygieneplan BTA", "Imissionsmessungen", "Regalkontrolle", "Sprinklerwartung"];

// Demo-Version: wird sie erhöht, werden die Demo-Daten beim nächsten Laden EINMAL
// neu gesetzt (überschreibt die alten Demo-Daten). Sonst bleibt alles wie es ist,
// damit Herumklicken zwischen zwei F5 nicht verloren geht.
// Schicht-Zuordnung fürs Team (für "Heute da" + Schichtplan der Vorschau)
const SCHICHT_PLAN = [
  ["R. Ciraci", "Früh"], ["S. Bauer", "Früh"],
  ["T. Klein", "Spät"], ["J. Wolf", "Spät mit B"],
  ["M. Weber", "Nacht"], ["A. Fischer", "Nacht"],
];
const DEMO_VER = "demo-9";
// Die Vorschau schreibt NUR beim allerersten Besuch Demo-Daten hin.
// Grund: Sie benutzt dieselben Speicher-Schlüssel wie die echte App. Früher
// wurde bei jeder neuen Demo-Version alles überschrieben - hatte jemand in der
// Vorschau etwas Echtes eingetippt, war es ohne Nachfrage weg. Ist bereits eine
// Demo geladen, wird nichts mehr angefasst; auffrischen geht nur noch bewusst
// über den Knopf im Hinweisbalken.
const seed = `
  window.__wkDemoVer = ${JSON.stringify(DEMO_VER)};
  window.__wkDemoSetzen = function () {
    var TPM_ANLAGEN = ${JSON.stringify(TPM_ANLAGEN)};
    var RI_PUNKTE = ${JSON.stringify(RI_PUNKTE)};
    var heute = new Date();
    var jahr = heute.getFullYear(), mHeute = heute.getMonth() + 1, tHeute = heute.getDate();
    var datum = function (m, t) {
      var letzter = new Date(jahr, m, 0).getDate();
      return jahr + '-' + String(m).padStart(2, '0') + '-' + String(Math.min(t, letzter)).padStart(2, '0');
    };
    // Vorbei = erledigt, künftig = offen. So stimmen Quote, "überfällig" und
    // "liegengeblieben" zueinander, egal wann jemand die Vorschau öffnet.
    var stand = function (m, t) { return (m < mHeute || (m === mHeute && t <= tHeute)) ? 'done' : 'open'; };
    var ents = [];
    TPM_ANLAGEN.forEach(function (name, i) {
      for (var m = 1 + (i % 3); m <= 12; m += 3) {
        var t = 3 + ((i * 5 + m) % 24);
        ents.push({ id: 'jt-' + i + '-' + m, date: datum(m, t), category: 'TPM', name: name, status: stand(m, t) });
      }
    });
    RI_PUNKTE.forEach(function (name, i) {
      var monate = i % 3 === 0 ? [1,2,3,4,5,6,7,8,9,10,11,12] : i % 3 === 1 ? [2,5,8,11] : [3,9];
      monate.forEach(function (m) {
        var t = 6 + ((i * 3 + m) % 20);
        ents.push({ id: 'jr-' + i + '-' + m, date: datum(m, t), category: 'RI', name: name, status: stand(m, t) });
      });
    });
    // Im laufenden Monat ein paar frisch abgehakte Anlagen. Ohne sie stünde
    // die Monatsquote am Monatsanfang bei fast null - die Demo sähe aus, als
    // hätte die Werkstatt nichts getan.
    ['BTS', 'VSM1', 'HRO', 'OF320', 'TS200', 'B+T'].forEach(function (name, i) {
      var d = new Date(); d.setDate(d.getDate() - (i + 1));
      if (d.getMonth() + 1 !== mHeute) return;         // nur im laufenden Monat
      ents.push({ id: 'frisch-' + i, category: 'TPM', name: name, status: 'done',
        date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') });
    });
    // Ein paar liegengebliebene Punkte kurz vor heute - die Übersicht soll
    // zeigen, wofür die rote Kachel "Überfällig" da ist.
    ['Wasserrundgang', 'Energieaufschreibung', 'Kompressor Rundgang', 'Werkstattreinigung'].forEach(function (name, i) {
      var d = new Date(); d.setDate(d.getDate() - (3 + i * 4));
      ents.push({ id: 'offen-' + i, category: 'RI', name: name, status: 'open',
        date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') });
    });
    // Schichten für heute ± ein paar Tage anlegen, damit "Heute da" und der
    // Schichtplan in der Vorschau immer gefüllt sind - egal an welchem Tag geöffnet.
    var plan = ${JSON.stringify(SCHICHT_PLAN)};
    for (var off = -2; off <= 5; off++) {
      var d = new Date(); d.setDate(d.getDate() + off);
      var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      plan.forEach(function(pw){ ents.push({ id: 'schicht-t|' + pw[0] + '|' + ds, category: 'SCHICHT', scope: 'tag', name: pw[0], date: ds, wert: pw[1] }); });
    }
    localStorage.setItem('werkstatt-kalender-config', ${JSON.stringify(JSON.stringify(CONFIG))});
    localStorage.setItem('werkstatt-kalender-entries', JSON.stringify(ents));
    localStorage.setItem('werkstatt-stoerungen-entries', ${JSON.stringify(JSON.stringify(STOER))});
    localStorage.setItem('wk-demo-ver', ${JSON.stringify(DEMO_VER)});
  };
  try {
    window.__wkDemoStand = localStorage.getItem('wk-demo-ver');
    if (!window.__wkDemoStand) window.__wkDemoSetzen(); // erster Besuch: leer -> befüllen
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

// Hinweisbalken: macht unverwechselbar klar, dass dies eine Vorschau mit
// erfundenen Daten ist, und bietet das Auffrischen der Demo als BEWUSSTE
// Handlung an - mit Rückfrage, weil dabei alles Eingetippte verloren geht.
const banner = (txt, farbe) => `<div id="wk-vorschau-balken" style="position:fixed;left:0;right:0;bottom:0;z-index:99999;background:${farbe};color:#fff;font:600 12px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;text-align:center;padding:6px 10px;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;">
  <span>${txt}</span>
  <span id="wk-demo-hinweis" style="display:none;background:rgba(255,255,255,0.22);padding:2px 8px;border-radius:9px;">Neuere Demo verfügbar</span>
  <button id="wk-demo-reset" style="background:rgba(255,255,255,0.9);color:#22262B;border:0;border-radius:9px;padding:3px 10px;font:700 11px -apple-system,Segoe UI,Roboto,Arial,sans-serif;cursor:pointer;">Demo zurücksetzen</button>
</div>
<script>
(function(){
  try {
    var hinweis = document.getElementById('wk-demo-hinweis');
    if (hinweis && window.__wkDemoStand && window.__wkDemoStand !== window.__wkDemoVer) hinweis.style.display = '';
    var knopf = document.getElementById('wk-demo-reset');
    if (knopf) knopf.addEventListener('click', function(){
      if (!confirm('Die Vorschau wird auf die Beispieldaten zurückgesetzt.\\n\\nAlles, was du hier eingetippt hast, geht dabei verloren. Fortfahren?')) return;
      window.__wkDemoSetzen();
      location.reload();
    });
  } catch(e){}
})();
</script>`;

const outLeser = "<title>Werkstatt-Cockpit · Leser-Vorschau</title>\n" + leserScript + "\n" + innerDoc + "\n" +
  banner("VORSCHAU · LESER-ANSICHT — Beispieldaten, nicht die echte Werkstatt", "#2F6690");
const outBearb = "<title>Werkstatt-Cockpit · Bearbeiter-Vorschau</title>\n" + bearbeiterScript + "\n" + innerDoc + "\n" +
  banner("VORSCHAU · BEARBEITER-ANSICHT — Beispieldaten, nicht die echte Werkstatt", "#C97A2B");

const dir = path.join(ROOT, "scratchpad/preview");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "preview-leser.html"), outLeser);
fs.writeFileSync(path.join(dir, "preview-bearbeiter.html"), outBearb);
console.log("geschrieben:", outLeser.length, "/", outBearb.length, "bytes");
