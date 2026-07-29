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

// Eine Seite. Vier Schritte. Nichts, was zum Klicken nicht noetig ist.
//
// Die erste Fassung hatte drei Seiten mit Erklaerungen zum schwarzen Fenster,
// zum Selbsttest und zu neuen Programmversionen. Das steht alles in der
// Anleitung - in einer Klickanleitung macht es die vier Klicks nur unsichtbar.
const kopfZiele = [
  { ...marken.kopf.ordnersymbol, nr: "3" },
  { ...marken.kopf.stoerungen, nr: "4" },
];

const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<title>Werkstatt-Cockpit einrichten</title>
<style>
  @page { size: A4; margin: 13mm 14mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", Verdana, sans-serif; color: #1b2026; margin: 0;
         font-size: 10.5pt; line-height: 1.4; }

  h1 { font-size: 20pt; margin: 0 0 1.5mm; letter-spacing: -0.2pt; }
  .unter { color: #5d666f; font-size: 10pt; margin: 0 0 6mm; }

  .schritt { display: flex; gap: 4.5mm; margin: 0 0 4.5mm; break-inside: avoid; }
  .nr { flex: 0 0 10mm; height: 10mm; border-radius: 50%; background: #C25A26; color: #fff;
        font-size: 14pt; font-weight: 700; display: flex; align-items: center;
        justify-content: center; }
  .txt { flex: 1; padding-top: 0.6mm; }
  .txt h2 { font-size: 12pt; margin: 0 0 1mm; }
  .txt p { margin: 0; }
  .klein { font-size: 8.5pt; color: #5d666f; margin: 1mm 0 0; }
  code { background: #eef1f4; padding: 0.3mm 1.2mm; border-radius: 1mm;
         font-family: "DejaVu Sans Mono", monospace; font-size: 9.5pt; }

  .bild { position: relative; margin: 1mm 0 4mm; border: 0.4mm solid #d3d9df;
          border-radius: 1.5mm; overflow: hidden; break-inside: avoid; }
  .bild .teil { position: relative; }
  .bild img { display: block; width: 100%; }
  .bild.oben { overflow: visible; margin-top: 11mm; }
  .luecke { height: 4.5mm; background: #f4f6f8; display: flex; align-items: center;
            justify-content: center; border-top: 0.3mm dashed #b9c2cb;
            border-bottom: 0.3mm dashed #b9c2cb; }
  .luecke span { font-size: 7pt; color: #8a929b; font-style: italic; }

  .ring { position: absolute; border: 0.9mm solid #D8352A; border-radius: 1.6mm;
          box-shadow: 0 0 0 0.5mm rgba(255,255,255,0.9); }
  .zahl { background: #D8352A; color: #fff; border-radius: 50%; width: 6.2mm; height: 6.2mm;
          display: flex; align-items: center; justify-content: center;
          font-size: 10pt; font-weight: 700; line-height: 1;
          box-shadow: 0 0 0 0.6mm #fff; }
  .obenmarke { position: absolute; top: -9.8mm; transform: translateX(-50%);
               display: flex; flex-direction: column; align-items: center; }
  .obenmarke .stiel { display: block; width: 0.9mm; background: #D8352A; }
  .randmarke { position: absolute; transform: translate(-50%, -50%); }

  .kasten { border-left: 1.2mm solid #C25A26; background: #fdf6f1; padding: 3mm 4mm;
            border-radius: 0 1.5mm 1.5mm 0; margin: 1mm 0 0; break-inside: avoid; }
  .kasten p { margin: 0 0 1.5mm; }
  .kasten p:last-child { margin: 0; }

  .fuss { margin-top: 4mm; padding-top: 2mm; border-top: 0.3mm solid #d3d9df;
          font-size: 8pt; color: #7c848d; }
</style></head>
<body>

<h1>Werkstatt-Cockpit einrichten</h1>
<p class="unter">Einmalig, zwei Minuten. Danach nie wieder.</p>

<div class="schritt">
  <div class="nr">1</div>
  <div class="txt">
    <h2>Verknüpfung auf den Desktop holen</h2>
    <p>Im Werkstatt-Ordner den Ordner <b>Cockpit</b> öffnen und darin
       <b>Verknuepfung anlegen</b> doppelklicken. Auf die Frage <b>ja</b> eintippen, Enter.</p>
    <p class="klein">Ganz unten in der Liste. Es entsteht ein Symbol auf dem Desktop, mehr passiert nicht.</p>
  </div>
</div>

<div class="schritt">
  <div class="nr">2</div>
  <div class="txt">
    <h2>Auf dem Desktop <b>Werkstatt-Cockpit</b> doppelklicken</h2>
    <p>Ein schwarzes Fenster geht auf – das gehört dazu und bleibt offen. Danach
       startet das Cockpit im Browser.</p>
  </div>
</div>

${bildBlock([{ datei: "app-kopf.png", ziele: kopfZiele }], 18, "oben")}

<div class="schritt">
  <div class="nr">3</div>
  <div class="txt">
    <h2>Kalender-Datei verbinden</h2>
    <p>Oben rechts auf das <b>Ordner-Symbol</b>, dann <b>„Vorhandene Datei öffnen …“</b>
       und <code>werkstatt-kalender-daten.json</code> aussuchen.</p>
  </div>
</div>

${bildBlock([
  { datei: "app-dialog-titel.png" },
  { datei: "app-dialog-knoepfe.png", ziele: [{ ...marken.dateikasten.oeffnen, nr: "3" }] },
], 62)}

<div class="schritt">
  <div class="nr">4</div>
  <div class="txt">
    <h2>Störungs-Datei verbinden</h2>
    <p>In den Reiter <b>Störungen</b> wechseln. Dort steht derselbe Hinweis – wieder
       <b>öffnen</b> und diesmal <code>werkstatt-stoerungen.json</code> aussuchen.</p>
  </div>
</div>

<div class="kasten">
  <p><b>Fertig.</b> Nach einem Neustart des Rechners erscheint oben einmal
     <b>„Jetzt verbinden“</b> – ein Klick, und es läuft weiter. Die Dateien müssen nie
     wieder herausgesucht werden.</p>
  <p class="klein">Wenn du magst: oben rechts auf das Zahnrad → deinen Namen eintragen. Dann steht im
     Verlauf, wer etwas geändert hat.</p>
</div>

<p class="fuss">Werkstatt-Cockpit · Einrichtung am Arbeitsplatz · Stand 29.07.2026 · Fragen an Roberto</p>

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
