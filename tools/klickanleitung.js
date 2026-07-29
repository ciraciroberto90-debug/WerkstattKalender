// Erzeugt die Klickanleitung als PDF.
//
//   node tools/klickanleitung-bilder.js   # Bildschirmfotos + gemessene Marken
//   node tools/klickanleitung.js          # daraus das PDF
//
// Die Bilder liegen in scratchpad/ und werden nicht versioniert - wer das PDF
// neu bauen will, laesst einfach beide Schritte laufen.
//
// Die Pfeile auf den Bildschirmfotos werden aus den gemessenen Koordinaten
// gesetzt (scratchpad/klickbilder/marken.json), nicht nach Augenmass. Damit
// zeigt ein Pfeil auch dann noch richtig, wenn sich in der App etwas
// verschiebt - man muss nur die Bilder neu aufnehmen.
//
// Die Windows-Schritte (Explorer, schwarzes Fenster, Desktop) sind bewusst
// gezeichnete Schemabilder und als solche gekennzeichnet: Diese Umgebung hat
// kein Windows, und ein nachgebautes Bild als Bildschirmfoto auszugeben waere
// eine Luege - auch eine gut gemeinte.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const path = require("path");

const BILDER = "/home/user/WerkstattKalender/scratchpad/klickbilder";
const marken = JSON.parse(fs.readFileSync(path.join(BILDER, "marken.json"), "utf8"));

// Breite und Hoehe eines PNG aus dem Dateikopf lesen - dafuer lohnt keine
// Bibliothek: Bytes 16..23 nach der Signatur sind Breite und Hoehe.
function pngMasse(datei) {
  const b = fs.readFileSync(datei);
  return { breite: b.readUInt32BE(16), hoehe: b.readUInt32BE(20) };
}

const SKALA = 2;   // deviceScaleFactor der Aufnahme
const SATZ = 182;  // nutzbare Breite auf A4 bei 14 mm Rand

// Ein Bild wird NICHT beschnitten, sondern verkleinert.
//
// Die erste Fassung setzte "max-height" mit "overflow:hidden". Das sieht im
// Entwurf harmlos aus, verschiebt aber jeden Ring: Die Ringe liegen in Prozent
// des Kastens, und der Kasten war nach dem Beschneiden kuerzer als das Bild.
// Der Pfeil zum blauen Knopf zeigte dadurch auf eine leere Stelle - genau der
// Fehler, den eine Klickanleitung nicht machen darf.
//
// Deshalb: Zielhoehe in mm -> Breite in Prozent zurueckrechnen. Das Bild
// bleibt ganz, die Prozentwerte stimmen.
// teile: [{ datei, ziele }] - mehrere Streifen desselben Ausschnitts werden
// untereinander gesetzt und die Auslassung dazwischen wird gekennzeichnet.
function bildBlock(teile, maxHoeheMM, stil) {
  const masse = teile.map((t) => {
    const voll = path.join(BILDER, t.datei);
    const m = pngMasse(voll);
    return { voll, cssBreite: m.breite / SKALA, cssHoehe: m.hoehe / SKALA };
  });
  const cssBreite = masse[0].cssBreite;
  for (const m of masse) {
    if (m.cssBreite !== cssBreite) {
      throw new Error("Streifen verschieden breit - gestapelt saehe das schief aus: " + m.voll);
    }
  }
  const cssHoehe = masse.reduce((s, m) => s + m.cssHoehe, 0);
  const luecken = (teile.length - 1) * 5; // mm fuer die Auslassungszeile

  const vollHoehe = SATZ * cssHoehe / cssBreite;
  const anteilBreite = Math.min(1, Math.max(0, maxHoeheMM - luecken) / vollHoehe);
  const breiteMM = SATZ * anteilBreite;

  const proz = (v) => (v * 100).toFixed(3) + "%";

  const streifen = teile.map((t, i) => {
    const hoeheMM = vollHoehe * anteilBreite * (masse[i].cssHoehe / cssHoehe);
    const cssTeilHoehe = masse[i].cssHoehe;
    const marker = marken1(t.ziele || [], cssBreite, cssTeilHoehe, hoeheMM, stil, proz);
    return `<div class="teil"><img src="file://${masse[i].voll}" alt="">${marker}</div>`;
  }).join(`<div class="luecke"><span>hier steht der Erklärtext – zum Klicken nicht nötig</span></div>`);

  return `<div class="bild${stil === "oben" ? " oben" : ""}" style="width:${breiteMM.toFixed(1)}mm">
    ${streifen}
  </div>`;
}

function marken1(ziele, cssBreite, cssHoehe, hoeheMM, stil, proz) {
  return ziele.map((z) => {
    const x = z.x / cssBreite, y = z.y / cssHoehe;
    const w = z.w / cssBreite, h = z.h / cssHoehe;
    const ringOben = y - 0.02, ringUnten = y + h + 0.02;
    const ring = `<div class="ring" style="left:${proz(x - 0.006)};top:${proz(ringOben)};`
      + `width:${proz(w + 0.012)};height:${proz(ringUnten - ringOben)}"></div>`;

    // Zahl ueber dem Bild, kurzer Stiel nach unten auf den Ring.
    if (stil === "oben") {
      const mitte = x + w / 2;
      const stiel = 4 + ringOben * hoeheMM;      // von -4 mm bis zur Ringkante
      return ring + `
      <div class="obenmarke" style="left:${proz(mitte)}">
        <span class="zahl">${z.nr}</span>
        <span class="stiel" style="height:${stiel.toFixed(1)}mm"></span>
      </div>`;
    }

    // Sonst: Zahl an das rechte Ende des Ringes, halb darueber. Ein langer
    // Pfeil braucht Platz neben dem Ziel - den gibt es bei einem Knopf, der
    // fast die ganze Bildbreite einnimmt, schlicht nicht.
    return ring + `
      <div class="randmarke" style="left:${proz(x + w + 0.006)};top:${proz(y + h / 2)}">
        <span class="zahl">${z.nr}</span>
      </div>`;
  }).join("");
}

const kopfZiele = [
  { ...marken.kopf.ordnersymbol, nr: "4" },
  { ...marken.kopf.stoerungen, nr: "5" },
  { ...marken.kopf.zahnrad, nr: "6" },
];

const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", Verdana, sans-serif; color: #1b2026; margin: 0;
         font-size: 10.5pt; line-height: 1.45; }

  h1 { font-size: 21pt; margin: 0 0 2mm; letter-spacing: -0.2pt; }
  .unter { color: #5d666f; font-size: 10pt; margin: 0 0 7mm; }

  .schritt { display: flex; gap: 5mm; margin: 0 0 6mm; break-inside: avoid; }
  .nr { flex: 0 0 11mm; height: 11mm; border-radius: 50%; background: #C25A26; color: #fff;
        font-size: 15pt; font-weight: 700; display: flex; align-items: center;
        justify-content: center; }
  .txt { flex: 1; padding-top: 1mm; }
  .txt h2 { font-size: 12.5pt; margin: 0 0 1.5mm; }
  .txt p { margin: 0 0 1.5mm; }
  .klein { font-size: 9pt; color: #5d666f; }
  code { background: #eef1f4; padding: 0.4mm 1.2mm; border-radius: 1mm;
         font-family: "DejaVu Sans Mono", monospace; font-size: 9.5pt; }

  .bild { position: relative; margin: 2mm 0 6mm; border: 0.4mm solid #d3d9df;
          border-radius: 1.5mm; overflow: hidden; break-inside: avoid; }
  .bild .teil { position: relative; }
  .bild img { display: block; width: 100%; }
  /* Marken ueber dem Bild brauchen Luft nach oben und duerfen hinausragen. */
  .bild.oben { overflow: visible; margin-top: 12mm; }
  .luecke { height: 5mm; background: #f4f6f8; display: flex; align-items: center;
            justify-content: center; border-top: 0.3mm dashed #b9c2cb;
            border-bottom: 0.3mm dashed #b9c2cb; }
  .luecke span { font-size: 7pt; color: #8a929b; font-style: italic; }

  .ring { position: absolute; border: 0.9mm solid #D8352A; border-radius: 1.6mm;
          box-shadow: 0 0 0 0.5mm rgba(255,255,255,0.9); }
  .zahl { background: #D8352A; color: #fff; border-radius: 50%; width: 6.4mm; height: 6.4mm;
          display: flex; align-items: center; justify-content: center;
          font-size: 10.5pt; font-weight: 700; line-height: 1;
          box-shadow: 0 0 0 0.6mm #fff; }
  .obenmarke { position: absolute; top: -10.4mm; transform: translateX(-50%);
               display: flex; flex-direction: column; align-items: center; }
  .obenmarke .stiel { display: block; width: 0.9mm; background: #D8352A; }
  .randmarke { position: absolute; transform: translate(-50%, -50%); }

  /* Schemabilder fuer die Windows-Schritte */
  .schema { border: 0.4mm solid #d3d9df; border-radius: 1.5mm; overflow: hidden;
            margin: 2mm 0 2mm; break-inside: avoid; }
  .schema .leiste { background: #e9edf1; padding: 1.6mm 3mm; font-size: 9pt; color: #47505a;
                    border-bottom: 0.3mm solid #d3d9df; }
  .schema .inhalt { padding: 2.5mm 3mm; background: #fff; }
  .zeile { display: flex; align-items: center; gap: 2.5mm; padding: 1.3mm 2mm; font-size: 10pt; }
  .zeile.markiert { background: #fdeceb; border: 0.5mm solid #D8352A; border-radius: 1mm; font-weight: 700; }
  .sym { width: 4.5mm; height: 4.5mm; border-radius: 0.8mm; background: #7d8791; flex: 0 0 auto; }
  .sym.cmd { background: #1b2026; }
  .sym.ps { background: #2b5aa8; }
  .sym.txtd { background: #c9d0d7; }
  .konsole { background: #14181c; color: #dbe3ea; font-family: "DejaVu Sans Mono", monospace;
             font-size: 8.5pt; padding: 3mm; line-height: 1.5; }
  .konsole .gruen { color: #6fd08c; }
  .schemahinweis { font-size: 8pt; color: #8a929b; margin: 0 0 5mm; font-style: italic; }

  .kasten { border-left: 1.2mm solid #C25A26; background: #fdf6f1; padding: 3mm 4mm;
            border-radius: 0 1.5mm 1.5mm 0; margin: 0 0 6mm; break-inside: avoid; }
  .kasten h3 { margin: 0 0 1.5mm; font-size: 11pt; }
  .kasten p { margin: 0 0 1.5mm; }
  .kasten p:last-child { margin: 0; }

  .fuss { margin-top: 4mm; padding-top: 2.5mm; border-top: 0.3mm solid #d3d9df;
          font-size: 8.5pt; color: #7c848d; }
  .seitenumbruch { break-before: page; }
</style></head>
<body>

<h1>Werkstatt-Cockpit einrichten</h1>
<p class="unter">Einmalig, etwa drei Minuten. Danach startet alles von allein.</p>

<div class="schritt">
  <div class="nr">1</div>
  <div class="txt">
    <h2>Den Ordner „Cockpit“ öffnen</h2>
    <p>Im Explorer den <b>OneDrive-Ordner der Werkstatt</b> öffnen – denselben, in dem
       <code>werkstatt-kalender-daten.json</code> liegt. Dort gibt es einen Ordner <b>Cockpit</b>.</p>
  </div>
</div>

<div class="schritt">
  <div class="nr">2</div>
  <div class="txt">
    <h2>„Verknuepfung anlegen.cmd“ doppelklicken</h2>
    <p>Auf die Frage nach dem automatischen Start <b>ja</b> eintippen und Enter drücken.</p>
    <p class="klein">Es entsteht ein Symbol auf dem Desktop. Mehr passiert nicht.</p>
  </div>
</div>

<div class="schema">
  <div class="leiste">📁 &nbsp;OneDrive – Werkstatt &rsaquo; Cockpit</div>
  <div class="inhalt">
    <div class="zeile"><span class="sym txtd"></span> Anleitung.md</div>
    <div class="zeile"><span class="sym cmd"></span> Cockpit starten.cmd</div>
    <div class="zeile"><span class="sym ps"></span> cockpit-selbsttest.ps1</div>
    <div class="zeile"><span class="sym ps"></span> cockpit-server.ps1</div>
    <div class="zeile"><span class="sym ps"></span> cockpit-sicherung.ps1</div>
    <div class="zeile"><span class="sym ps"></span> cockpit-verknuepfung.ps1</div>
    <div class="zeile"><span class="sym txtd"></span> LIESMICH.txt</div>
    <div class="zeile"><span class="sym cmd"></span> Selbsttest.cmd</div>
    <div class="zeile"><span class="sym cmd"></span> Sicherung zurueckholen.cmd</div>
    <div class="zeile markiert"><span class="sym cmd"></span> Verknuepfung anlegen.cmd &nbsp;&nbsp;← die hier, ganz unten</div>
  </div>
</div>
<p class="schemahinweis">Schematische Darstellung – die Reihenfolge kann bei dir leicht abweichen.
Windows blendet Datei-Endungen oft aus; dann steht dort nur <b>Verknuepfung anlegen</b>.</p>

<div class="schritt">
  <div class="nr">3</div>
  <div class="txt">
    <h2>Auf dem Desktop „Werkstatt-Cockpit“ doppelklicken</h2>
    <p>Es öffnet sich ein kleines <b>schwarzes Fenster</b> – das gehört dazu und muss
       offen bleiben. Minimieren ist in Ordnung. Danach startet der Browser mit dem Cockpit.</p>
  </div>
</div>

<div class="schema">
  <div class="leiste">⬛ &nbsp;Werkstatt-Cockpit – dieses Fenster offen lassen</div>
  <div class="konsole">
    &nbsp;&nbsp;Werkstatt-Cockpit - Ausliefer-Dienst<br>
    &nbsp;&nbsp;------------------------------------<br><br>
    &nbsp;&nbsp;Ordner:&nbsp;&nbsp;&nbsp;&nbsp; \\\\scheudc1\\...\\Werkstatt_Kalender<br>
    &nbsp;&nbsp;Startseite: Werkstatt_Kalender_TPM.html<br>
    &nbsp;&nbsp;<span class="gruen">Adresse:&nbsp;&nbsp;&nbsp; http://localhost:8765/</span>
  </div>
</div>
<p class="schemahinweis">Schematische Darstellung. Steht dort eine Fehlermeldung: siehe letzte Seite.</p>

<div class="seitenumbruch"></div>

<h1>Im Cockpit: drei Klicks</h1>
<p class="unter">Diese drei Schritte nur beim allerersten Mal.</p>

${bildBlock([{ datei: "app-kopf.png", ziele: kopfZiele }], 16, "oben")}
<p class="schemahinweis">So sieht die Kopfzeile aus, wenn alles verbunden ist.</p>

<div class="schritt">
  <div class="nr">4</div>
  <div class="txt">
    <h2>Ordner-Symbol oben rechts</h2>
    <p>Anklicken, dann <b>„Vorhandene Datei öffnen …“</b> wählen und
       <code>werkstatt-kalender-daten.json</code> aussuchen.</p>
  </div>
</div>

${bildBlock([
  { datei: "app-dialog-titel.png" },
  { datei: "app-dialog-knoepfe.png", ziele: [{ ...marken.dateikasten.oeffnen, nr: "4" }] },
], 68)}

<div class="schritt">
  <div class="nr">5</div>
  <div class="txt">
    <h2>Reiter „Störungen“</h2>
    <p>Dort erscheint derselbe Hinweis. Auf <b>„Störungen-Datei öffnen …“</b> klicken und
       <code>werkstatt-stoerungen.json</code> aussuchen.</p>
  </div>
</div>

<div class="schritt">
  <div class="nr">6</div>
  <div class="txt">
    <h2>Zahnrad → eigenen Namen eintragen</h2>
    <p>Damit im Verlauf steht, wer etwas geändert hat. Der Name bleibt auf diesem Gerät.</p>
  </div>
</div>

${bildBlock([{ datei: "app-name.png", ziele: [{ ...marken.name.feld, nr: "6" }] }], 31)}

<div class="kasten">
  <p><b>Fertig.</b> Ab morgen startet das Cockpit beim Anmelden von allein, und die Datei
     muss nie wieder herausgesucht werden.</p>
</div>

<div class="seitenumbruch"></div>

<h1>Der Alltag danach</h1>
<p class="unter">Zwei Dinge, die immer wieder vorkommen – und was dann zu tun ist.</p>

<div class="kasten">
  <h3>Nach einem Neustart des Rechners</h3>
  <p>Oben erscheint eine Leiste mit <b>„Jetzt verbinden“</b>. Ein Klick, fertig.</p>
  <p class="klein">Die Datei muss dabei <b>nicht</b> neu herausgesucht werden. Der Browser
     fragt aus Sicherheitsgründen einmal nach – das ist normal.</p>
</div>

<div class="kasten">
  <h3>Das schwarze Fenster</h3>
  <p>Nicht schließen, solange gearbeitet wird. Minimieren ist in Ordnung.</p>
  <p class="klein">Wird es geschlossen, ist das Cockpit nicht mehr erreichbar. Den Daten
     passiert nichts – sie liegen in der gemeinsamen Datei.</p>
</div>

<div class="kasten">
  <h3>Neue Programmversion</h3>
  <p><b>Nichts zu tun.</b> Die App wird bei jedem Öffnen frisch geladen.</p>
</div>

<div class="kasten">
  <h3>Wenn etwas klemmt</h3>
  <p>Im Ordner <b>Cockpit</b> liegt <code>Selbsttest.cmd</code>. Doppelklick – der Bericht
     landet automatisch in der Zwischenablage. Den einfach an Roberto schicken.</p>
  <p class="klein">Der Test verändert nichts. Er schaut nur nach, ob Laufwerk, Dateien und
     Dienst in Ordnung sind.</p>
</div>

<div class="kasten">
  <h3>Häufigster Fall: „Der Ordner ist nicht erreichbar“</h3>
  <p>Das Netzlaufwerk war beim Anmelden noch nicht verbunden. Schwarzes Fenster schließen,
     den Werkstatt-Ordner im Explorer einmal öffnen, dann das Desktop-Symbol erneut
     anklicken.</p>
</div>

<p class="fuss">Werkstatt-Cockpit · Einrichtung am Arbeitsplatz · Stand 29.07.2026 ·
Fragen an Roberto</p>

</body></html>`;

const htmlDatei = path.join(BILDER, "klickanleitung.html");
fs.writeFileSync(htmlDatei, html);

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.goto("file://" + htmlDatei);
  await p.waitForTimeout(900);
  const ziel = "/home/user/WerkstattKalender/doku/Werkstatt-Cockpit-Einrichtung.pdf";
  await p.pdf({ path: ziel, format: "A4", printBackground: true, preferCSSPageSize: true });
  console.log("PDF geschrieben:", ziel, Math.round(fs.statSync(ziel).size / 1024) + " KB");
  await b.close();
})();
