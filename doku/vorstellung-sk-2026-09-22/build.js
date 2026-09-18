// Vorstellung BTA-Cockpit fuer Soendgen Keramik - Folienbau (pptxgenjs)
// Kapitel 1 (Ausgangslage) + 2 (Das Cockpit im Ueberblick)
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");

const SHOTS = "/tmp/claude-0/-home-user-WerkstattKalender/8b2eab4a-3225-51dd-900c-dbf3d21c0a06/scratchpad/shots";
const LOGOS = "/home/user/WerkstattKalender/doku/logos";
const AUS = path.join(__dirname, "BTA-Cockpit-Vorstellung-SK.pptx");

// Farben (aus der App, kein Hashtag!)
const DUNKEL = "2C3137", ORANGE = "C97A2B", GRUEN = "1F7A3D", BLAU = "2F6690", GELB = "F0C230", ROT = "C0392B";
const GRAU = "5B6572", HELL = "F3F4F6", WEISS = "FFFFFF", LINIE = "D5D9DE", TEXT = "1F2430", HELLGRAU = "AEB4BB";
const FONT = "Calibri";

// Icon-Helfer: react-icons -> PNG (wenn vorhanden), sonst Glyph im Kreis.
let icons = null;
try {
  const React = require("react"), RDS = require("react-dom/server"), sharp = require("sharp"), fa = require("react-icons/fa");
  icons = async (name, farbe) => {
    const Icon = fa[name]; if (!Icon) return null;
    const svg = RDS.renderToStaticMarkup(React.createElement(Icon, { color: "#" + farbe, size: 256 }));
    const buf = await sharp(Buffer.from(svg)).resize(256).png().toBuffer();
    return "image/png;base64," + buf.toString("base64");
  };
} catch (e) { icons = null; }

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.author = "R. Ciraci"; pres.title = "BTA-Cockpit – Vorstellung Soendgen Keramik";
let nr = 0;

// ---------- Bausteine ----------
function fuss(s, dunkel = false) {
  nr++;
  s.addText("BTA-Cockpit · Vorstellung für Soendgen Keramik", { x: 0.5, y: 5.28, w: 6, h: 0.25, fontSize: 9, color: dunkel ? "9AA1A8" : HELLGRAU, fontFace: FONT, margin: 0, isTextBox: true });
  s.addText(String(nr), { x: 9.0, y: 5.28, w: 0.5, h: 0.25, fontSize: 9, color: dunkel ? "9AA1A8" : HELLGRAU, fontFace: FONT, align: "right", margin: 0, isTextBox: true });
}
function titel(s, text, sub) {
  s.addText(text, { x: 0.5, y: 0.32, w: 9, h: 0.55, fontSize: 24, bold: true, color: DUNKEL, fontFace: FONT, margin: 0, isTextBox: true });
  if (sub) s.addText(sub, { x: 0.5, y: 0.86, w: 9, h: 0.3, fontSize: 12.5, color: GRAU, fontFace: FONT, margin: 0, isTextBox: true });
}
function bild(s, datei, x, y, w, ratio) {
  const h = w / ratio;
  s.addShape(pres.ShapeType.roundRect, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, fill: { color: WEISS }, line: { color: LINIE, width: 0.75 }, rectRadius: 0.05,
    shadow: { type: "outer", blur: 6, offset: 2, angle: 90, color: "000000", opacity: 0.22 } });
  s.addImage({ path: datei, x: x, y: y, w: w, h: h });
  return h;
}
async function kreisIcon(s, x, y, d, farbe, iconName, glyph) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: farbe }, line: { color: farbe } });
  let data = icons ? await icons(iconName, WEISS) : null;
  if (data) s.addImage({ data, x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52 });
  else s.addText(glyph, { x, y, w: d, h: d, fontSize: d * 22, bold: true, color: WEISS, align: "center", valign: "middle", fontFace: FONT, margin: 0, isTextBox: true });
}
function absatzListe(s, punkte, x, y, w, h, groesse = 12.5) {
  s.addText(punkte.map((p, i) => ({ text: p, options: { bullet: { indent: 12 }, breakLine: i < punkte.length - 1, paraSpaceAfter: 6 } })),
    { x, y, w, h, fontSize: groesse, color: TEXT, fontFace: FONT, valign: "top", margin: 0, isTextBox: true });
}
function kapitel(num, text, teaser) {
  const s = pres.addSlide();
  s.background = { color: DUNKEL };
  // Titel darf zweizeilig werden (z. B. "Das Backend – bewusst einfach"): Box hoch genug, Teaser erst darunter
  s.addShape(pres.ShapeType.ellipse, { x: 0.8, y: 1.75, w: 1.15, h: 1.15, fill: { color: ORANGE }, line: { color: ORANGE } });
  s.addText(String(num), { x: 0.8, y: 1.75, w: 1.15, h: 1.15, fontSize: 30, bold: true, color: WEISS, align: "center", valign: "middle", fontFace: FONT, margin: 0, isTextBox: true });
  s.addText(text, { x: 2.3, y: 1.35, w: 7.2, h: 1.55, fontSize: 30, bold: true, color: WEISS, fontFace: FONT, valign: "middle", margin: 0, isTextBox: true });
  s.addText(teaser, { x: 2.3, y: 3.05, w: 7.0, h: 0.9, fontSize: 15, color: "C7CCD2", fontFace: FONT, valign: "top", margin: 0, isTextBox: true });
  fuss(s, true);
  return s;
}
// Screenshot links, Erklaerung rechts (mit Punkten)
function bildFolie(titelText, sub, datei, ratio, punkte, bildBreite = 6.2) {
  const s = pres.addSlide();
  titel(s, titelText, sub);
  const y = sub ? 1.3 : 1.1;
  bild(s, datei, 0.5, y, bildBreite, ratio);
  absatzListe(s, punkte, 0.5 + bildBreite + 0.35, y + 0.05, 9.5 - bildBreite - 0.35, 3.8, 12.5);
  fuss(s);
  return s;
}
// Zwei Screenshots nebeneinander mit Bildunterschrift
function zweiBilder(titelText, sub, links, rechts) {
  const s = pres.addSlide();
  titel(s, titelText, sub);
  const y = 1.3, w = 4.4;
  const hL = bild(s, links.datei, 0.5, y, w, links.ratio);
  const hR = bild(s, rechts.datei, 5.1, y, w, rechts.ratio);
  const hMax = Math.max(hL, hR);
  s.addText(links.text, { x: 0.5, y: y + hMax + 0.12, w: w, h: 0.7, fontSize: 11.5, color: TEXT, fontFace: FONT, valign: "top", margin: 0, isTextBox: true });
  s.addText(rechts.text, { x: 5.1, y: y + hMax + 0.12, w: w, h: 0.7, fontSize: 11.5, color: TEXT, fontFace: FONT, valign: "top", margin: 0, isTextBox: true });
  fuss(s);
  return s;
}

const R = 3000 / 1880;          // Bereichs-Screenshots
const R_NACHWEIS = 3000 / 2792; // Pruefnachweis
// Schichtbericht: Seitenverhaeltnis aus der (zugeschnittenen) Bilddatei lesen
const R_BERICHT = (() => { try { const { PNG } = {}; } catch (e) {}
  const sz = require("child_process").execSync(`python3 -c "from PIL import Image; im=Image.open('${SHOTS}/21-druck-schichtbericht.jpg'); print(im.width, im.height)"`).toString().trim().split(" ").map(Number);
  return sz[0] / sz[1]; })();

(async () => {
  // ================= 1 Titel =================
  {
    const s = pres.addSlide();
    s.background = { color: DUNKEL };
    s.addText("BTA-Cockpit", { x: 0.7, y: 1.35, w: 8.6, h: 1.0, fontSize: 46, bold: true, color: WEISS, fontFace: FONT, margin: 0, isTextBox: true });
    s.addText("Instandhaltung digital – ein Werkzeug für Scheurich und Soendgen Keramik", { x: 0.7, y: 2.35, w: 8.6, h: 0.5, fontSize: 17, color: "C7CCD2", fontFace: FONT, margin: 0, isTextBox: true });
    s.addText("Vorstellung bei Soendgen Keramik · Dienstag, 22.09.2026 · R. Ciraci, Werkstattleiter BTA Scheurich", { x: 0.7, y: 2.95, w: 8.6, h: 0.4, fontSize: 12.5, color: "9AA1A8", fontFace: FONT, margin: 0, isTextBox: true });
    // Logos auf weissen Karten
    s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 3.95, w: 2.9, h: 0.9, fill: { color: WEISS }, line: { color: WEISS }, rectRadius: 0.08 });
    s.addImage({ path: path.join(LOGOS, "scheurich-group-hauptlogo.png"), x: 0.85, y: 4.13, w: 2.6, h: 0.65 });
    s.addShape(pres.ShapeType.roundRect, { x: 3.8, y: 3.95, w: 1.5, h: 0.9, fill: { color: WEISS }, line: { color: WEISS }, rectRadius: 0.08 });
    s.addImage({ path: path.join(LOGOS, "soendgen-keramik.png"), x: 4.02, y: 4.02, w: 1.06, h: 0.76 });
    nr++;
  }

  // ================= 2 Agenda =================
  {
    const s = pres.addSlide();
    titel(s, "Worüber wir heute sprechen", "Sieben Kapitel – mit vielen Bildern aus dem laufenden Betrieb");
    const punkte = [
      ["Ausgangslage", "Warum überhaupt – und was fehlte"],
      ["Das Cockpit im Überblick", "Alle Bereiche, so wie sie täglich aussehen"],
      ["Backend – bewusst einfach", "Dateien statt Server, Rollen, Updates, zwei Standorte"],
      ["Belastbarkeit", "Stresstest mit 71.000 Einträgen, 73 Härtetests"],
      ["Einführung in 5 Minuten", "Das Installations-Werkzeug – ohne IT, ohne Admin"],
      ["Wie es entstanden ist", "Die Arbeit mit Claude: Rollen, Regeln, Kommunikation"],
      ["Nutzen für Soendgen Keramik", "Fahrplan, Grenzen, Diskussion"],
    ];
    for (let i = 0; i < punkte.length; i++) {
      const links = i < 4;
      const x = links ? 0.5 : 5.2, y = 1.35 + (links ? i : i - 4) * 0.95;
      s.addShape(pres.ShapeType.ellipse, { x, y: y + 0.05, w: 0.5, h: 0.5, fill: { color: ORANGE }, line: { color: ORANGE } });
      s.addText(String(i + 1), { x, y: y + 0.05, w: 0.5, h: 0.5, fontSize: 15, bold: true, color: WEISS, align: "center", valign: "middle", fontFace: FONT, margin: 0, isTextBox: true });
      s.addText(punkte[i][0], { x: x + 0.65, y: y, w: 4.2, h: 0.32, fontSize: 14.5, bold: true, color: DUNKEL, fontFace: FONT, margin: 0, isTextBox: true });
      s.addText(punkte[i][1], { x: x + 0.65, y: y + 0.32, w: 4.2, h: 0.4, fontSize: 11, color: GRAU, fontFace: FONT, margin: 0, isTextBox: true });
    }
    fuss(s);
  }

  // ================= 3 Kapitel 1 =================
  kapitel(1, "Ausgangslage", "Wie die Werkstatt vor dem Cockpit gearbeitet hat – und was dabei jeden Tag gefehlt hat.");

  // ================= 4 So lief es bisher =================
  {
    const s = pres.addSlide();
    titel(s, "So lief es bisher", "Drei Werkzeuge, drei Orte, kein gemeinsames Bild");
    const karten = [
      { farbe: ROT, icon: "FaBook", glyph: "✎", t: "Papier-Schichtbuch", b: "Störungen im Heft: nicht durchsuchbar, keine Ausfallzeiten, kein Überblick, was noch offen ist." },
      { farbe: GRUEN, icon: "FaTable", glyph: "▦", t: "Excel & Zuruf", b: "Schichtplan im Excel, Tagesplanung per Zuruf – wer heute da ist und was ansteht, steht nirgends zentral." },
      { farbe: BLAU, icon: "FaClipboardCheck", glyph: "✓", t: "Nachweise von Hand", b: "Wartungs- und Prüfnachweise (TPM, R+I) auf Zetteln – bei Audit und Übergabe mühsam zusammenzusuchen." },
    ];
    for (let i = 0; i < 3; i++) {
      const k = karten[i], x = 0.5 + i * 3.1;
      s.addShape(pres.ShapeType.roundRect, { x, y: 1.4, w: 2.85, h: 2.75, fill: { color: HELL }, line: { color: HELL }, rectRadius: 0.1 });
      await kreisIcon(s, x + 0.25, 1.65, 0.62, k.farbe, k.icon, k.glyph);
      s.addText(k.t, { x: x + 0.2, y: 2.4, w: 2.55, h: 0.35, fontSize: 14, bold: true, color: DUNKEL, fontFace: FONT, margin: 0, isTextBox: true });
      s.addText(k.b, { x: x + 0.25, y: 2.78, w: 2.4, h: 1.25, fontSize: 11.5, color: TEXT, fontFace: FONT, valign: "top", margin: 0, isTextBox: true });
    }
    s.addText("Die Folge: Wissen im Kopf Einzelner, doppelte Arbeit – und keine belastbaren Zahlen für die Morgenrunde.",
      { x: 0.5, y: 4.4, w: 9, h: 0.5, fontSize: 13.5, italic: true, color: GRAU, fontFace: FONT, margin: 0, isTextBox: true });
    fuss(s);
  }

  // ================= 5 Vorher / Nachher =================
  {
    const s = pres.addSlide();
    titel(s, "Was das Cockpit ändert", "Dieselben Aufgaben – an einem Ort, für alle sichtbar");
    const zeilen = [
      ["Heft & Zettel", "Digitales Schichtbuch: Nummer, Suche, Ursache, Ausfallzeit, Ersatzteile"],
      ["Excel-Schichtplan", "Schichtplan und Tagesplanung in einem – Aushang je Woche per Klick"],
      ["Nachweise von Hand", "TPM und R+I mit festem Rhythmus und druckfertigem Prüfnachweis"],
      ["„Was liegt an?“ per Zuruf", "Übersicht: wer ist da, was ist offen, was ist fällig – für alle gleich"],
    ];
    s.addText("Vorher", { x: 0.5, y: 1.3, w: 3.4, h: 0.35, fontSize: 13, bold: true, color: GRAU, fontFace: FONT, margin: 0, isTextBox: true });
    s.addText("Mit dem Cockpit", { x: 4.9, y: 1.3, w: 4.6, h: 0.35, fontSize: 13, bold: true, color: GRUEN, fontFace: FONT, margin: 0, isTextBox: true });
    for (let i = 0; i < zeilen.length; i++) {
      const y = 1.75 + i * 0.8;
      s.addShape(pres.ShapeType.roundRect, { x: 0.5, y, w: 3.4, h: 0.62, fill: { color: HELL }, line: { color: HELL }, rectRadius: 0.08 });
      s.addText(zeilen[i][0], { x: 0.7, y, w: 3.1, h: 0.62, fontSize: 12.5, color: TEXT, fontFace: FONT, valign: "middle", margin: 0, isTextBox: true });
      s.addShape(pres.ShapeType.rightArrow, { x: 4.1, y: y + 0.14, w: 0.6, h: 0.34, fill: { color: ORANGE }, line: { color: ORANGE } });
      s.addShape(pres.ShapeType.roundRect, { x: 4.9, y, w: 4.6, h: 0.62, fill: { color: "EAF3EC" }, line: { color: "EAF3EC" }, rectRadius: 0.08 });
      s.addText(zeilen[i][1], { x: 5.1, y, w: 4.3, h: 0.62, fontSize: 12.5, color: TEXT, fontFace: FONT, valign: "middle", margin: 0, isTextBox: true });
    }
    fuss(s);
  }

  // ================= 6 Die Idee in Zahlen =================
  {
    const s = pres.addSlide();
    titel(s, "Die Idee in Zahlen", "Grundregel von Anfang an: Es muss ohne IT-Projekt laufen");
    const stats = [
      { z: "1", farbe: ORANGE, l: "Programm", b: "eine Datei – kein Server, keine Datenbank, keine Installation" },
      { z: "2", farbe: BLAU, l: "Dateien", b: "auf dem Firmenlaufwerk: Kalender-Daten und Störberichte" },
      { z: "0 €", farbe: GRUEN, l: "Lizenzkosten", b: "läuft auf den vorhandenen PCs und dem vorhandenen Laufwerk" },
      { z: "08/26", farbe: DUNKEL, l: "im Tagesbetrieb", b: "seit August auf allen Werkstatt-Rechnern bei Scheurich (8 Mitarbeiter + Leitung)" },
    ];
    for (let i = 0; i < 4; i++) {
      const st = stats[i], x = 0.5 + i * 2.3;
      s.addShape(pres.ShapeType.roundRect, { x, y: 1.4, w: 2.1, h: 2.9, fill: { color: HELL }, line: { color: HELL }, rectRadius: 0.1 });
      s.addText(st.z, { x: x + 0.15, y: 1.55, w: 1.8, h: 0.95, fontSize: 40, bold: true, color: st.farbe, fontFace: FONT, valign: "middle", margin: 0, isTextBox: true });
      s.addText(st.l, { x: x + 0.15, y: 2.5, w: 1.8, h: 0.35, fontSize: 13.5, bold: true, color: DUNKEL, fontFace: FONT, margin: 0, isTextBox: true });
      s.addText(st.b, { x: x + 0.15, y: 2.88, w: 1.8, h: 1.3, fontSize: 11, color: TEXT, fontFace: FONT, valign: "top", margin: 0, isTextBox: true });
    }
    s.addText("Keine Adminrechte, kein Server, keine Datenbank, keine Anfrage an die IT – das war die Bedingung, damit es überhaupt starten konnte.",
      { x: 0.5, y: 4.5, w: 9, h: 0.5, fontSize: 12.5, italic: true, color: GRAU, fontFace: FONT, margin: 0, isTextBox: true });
    fuss(s);
  }

  // ================= 7 Kapitel 2 =================
  kapitel(2, "Das Cockpit im Überblick", "Alle Bereiche mit echten Bildschirmbildern – so, wie die Werkstatt sie jeden Tag sieht (Beispieldaten).");

  // ================= 8 Uebersicht =================
  {
    const s = pres.addSlide();
    titel(s, "Die Übersicht – der Tag auf einen Blick", "Startseite auf jedem Rechner: Kennzahlen, wer da ist, was offen ist, Pinnwand");
    bild(s, `${SHOTS}/01-uebersicht.png`, 0.5, 1.3, 6.2, R);
    const ks = [
      { farbe: ORANGE, t: "Kennzahlen oben", b: "Heute fällig, erledigt, überfällig, TPM-Score, Uhrzeit und laufende Schicht" },
      { farbe: GRUEN, t: "Heute da", b: "Wer in welcher Schicht arbeitet – direkt aus dem Schichtplan" },
      { farbe: ROT, t: "Offene Störungen", b: "Mit Restarbeit und Ausfallzeit – aus dem digitalen Schichtbuch" },
      { farbe: GELB, t: "Pinnwand", b: "Übergaben und Hinweise für alle – mit einem Klick zur Arbeit gemacht" },
    ];
    for (let i = 0; i < ks.length; i++) {
      const y = 1.3 + i * 0.95;
      s.addShape(pres.ShapeType.ellipse, { x: 7.05, y: y + 0.05, w: 0.22, h: 0.22, fill: { color: ks[i].farbe }, line: { color: ks[i].farbe } });
      s.addText(ks[i].t, { x: 7.38, y, w: 2.2, h: 0.3, fontSize: 12.5, bold: true, color: DUNKEL, fontFace: FONT, margin: 0, isTextBox: true });
      s.addText(ks[i].b, { x: 7.38, y: y + 0.3, w: 2.2, h: 0.62, fontSize: 10.5, color: TEXT, fontFace: FONT, valign: "top", margin: 0, isTextBox: true });
    }
    fuss(s);
  }

  // ================= 9 Schichtplan =================
  bildFolie("Schichtplan", "Monatsmatrix für das ganze Team – ersetzt das Excel-Blatt", `${SHOTS}/02-schichtplan.png`, R, [
    "Ein Klick auf eine Zelle öffnet die Auswahl: Früh, Spät, Nacht, Bereitschaft, Urlaub, Krank, Schule …",
    "Farben je Schichtart, Feiertage und Wochenenden automatisch",
    "Gilt sofort auch in der Planung und in der Übersicht („Heute da“)",
    "Aushang je Kalenderwoche per Knopfdruck (A4 quer)",
    "Notizen an einzelnen Zellen – wie ein Kommentar im Excel",
  ]);

  // ================= 10 Planung =================
  bildFolie("Planung", "Wer macht heute was – je Person, je Tag", `${SHOTS}/03-planung.png`, R, [
    "Wochenansicht: jede Person, jeder Tag, die Arbeiten dazu",
    "Der Wartungsplan (TPM, R+I) fließt automatisch als Termine ein",
    "Arbeiten aus dem Backlog werden per Klick eingeplant",
    "Aushang als A4-Blatt – hängt in der Werkstatt",
  ]);

  // ================= 11 Stoerungen =================
  bildFolie("Störungen – das digitale Schichtbuch", "Jeder Störbericht hat eine Nummer und ist in Sekunden wiedergefunden", `${SHOTS}/06b-stoerungen-offen.png`, R, [
    "Anlage, Teil, Störung, Ursache, Maßnahme, Ausfallzeit, Melder",
    "Offen oder behoben – plus „was muss die nächste Schicht tun“",
    "Ersatzteile und Nachbestellungen direkt am Bericht",
    "Ansichten nach Datum, Anlage, Nummer, Status, Gewerk; Suche über alles",
    "Auswertung: Störungen je Anlage und Monat, Ausfallzeiten",
  ]);

  // ================= 12 Schichtbericht =================
  bildFolie("Der Schichtbericht für die Morgenrunde", "Ein Blatt auf Knopfdruck – seit dieser Woche im Einsatz", `${SHOTS}/21-druck-schichtbericht.jpg`, R_BERICHT, [
    "Die letzten drei Schichten (Früh, Spät, Nacht) auf einer A4-Seite",
    "Kennzahlen oben: Anzahl, offen, Ausfallzeit gesamt",
    "Eigene Spalte „Störungsursache“ – so wird in der Runde gesprochen",
    "Offene Berichte stehen immer zuerst, mit roter Kante",
    "Ausfallzeit als Plakette – ab 60 Minuten rot",
  ], 6.0);

  // ================= 13 Berichte: Start + To-do =================
  zweiBilder("Berichte – alles an einem Ort", "To-dos, Störungen, Backlog und Zeiterfassung unter einem Dach",
    { datei: `${SHOTS}/04-berichte-start.png`, ratio: R, text: "Startseite mit Score (überfällige To-dos, offener Backlog, erledigt diese Woche) und einer Suche über alle Berichte." },
    { datei: `${SHOTS}/05-todo.png`, ratio: R, text: "To-do-Liste: erteilt von, an wen, bis wann, Priorität – erledigt mit Zeitstempel. Ohne Störungs-Bezug, für alles Übrige." });

  // ================= 14 TPM & R+I =================
  {
    const s = pres.addSlide();
    titel(s, "TPM & R+I – Wartung mit Prüfnachweis", "PitStop-Wartung der Anlagen und gesetzlich getaktete Rundgänge und Inspektionen");
    const hL = bild(s, `${SHOTS}/10-tpm-plan.png`, 0.5, 1.3, 5.0, R);
    const hR = bild(s, `${SHOTS}/20-druck-pruefnachweis.png`, 6.0, 1.3, 3.2, R_NACHWEIS);
    s.addText("Plan-Kalender: PitStops je Anlage (Taktstraße, Montags-Rotation, freie Gruppen) und R+I-Punkte mit festem Rhythmus – wöchentlich, monatlich, alle X Monate, jeden ersten Montag …",
      { x: 0.5, y: 1.3 + hL + 0.14, w: 5.0, h: 0.7, fontSize: 10.5, color: TEXT, fontFace: FONT, valign: "top", margin: 0, isTextBox: true });
    s.addText("Prüfnachweis: erledigt und versäumt je Prüfpunkt, mit Rechtsgrundlage (DGUV, DIN, VdS) – druckfertig fürs Audit, mit Unterschriftszeilen.",
      { x: 6.0, y: 1.3 + hR + 0.14, w: 3.5, h: 0.8, fontSize: 10.5, color: TEXT, fontFace: FONT, valign: "top", margin: 0, isTextBox: true });
    fuss(s);
  }

  // ================= 15 Zeiterfassung + Backlog =================
  zweiBilder("Zeiterfassung und Backlog", "Stunden auf Kostenstellen buchen – und Arbeiten sammeln, bis sie eingeplant werden",
    { datei: `${SHOTS}/08-zeiterfassung.png`, ratio: R, text: "Zeiterfassung: je Person und Tag Stunden auf Kostenstellen, mit Tätigkeit und Störungs-Bezug – Jahres-Export für die Auswertung." },
    { datei: `${SHOTS}/07-backlog.png`, ratio: R, text: "Backlog: alle anstehenden Arbeiten je Anlage und Gewerk – offen oder erledigt, von hier aus in die Planung gezogen." });

  // ================= 16 Werkstatt-Monitor =================
  bildFolie("Der Werkstatt-Monitor", "Hallenbildschirm ohne Bedienung – und die Leser-Ansicht für Nur-Ansehen-Rechner", `${SHOTS}/14-monitor.png`, R, [
    "Uhr, laufende Schicht, wer jetzt in der Werkstatt ist",
    "Heute fällig, offener Backlog, TPM-Score mit Verlauf",
    "Offene Störungen im Laufband unten",
    "Leser-Rechner: nur ansehen, kein Eingriff – nach 15 Minuten ohne Eingabe automatisch zurück zur Übersicht",
  ]);

  // ================= 17 Verwalten =================
  bildFolie("Alles Verwalten an einem Ort", "Das Zahnrad: Stammdaten und Einstellungen – ohne Programmierung", `${SHOTS}/13-verwalten.png`, R, [
    "Anlagen & R+I: PitStop-Anlagen mit Rotationsart, Prüfpunkte mit Rhythmus",
    "Team & Schichten: Mitarbeiter, Rollen, Schichtarten, Reihenfolge",
    "Kostenstellen, OEE-Anbindung, Monitor-Einstellungen",
    "Verlauf & Sicherung: Update-Ordner, Tages-Sicherung, Konflikt-Wächter",
    "Benutzerrollen: Verwalter · Bearbeiter · Leser",
  ]);

  // Kapitel 3-7
  await require("./teil2.js")({ pres, titel, fuss, bild, kapitel, bildFolie, zweiBilder, absatzListe, kreisIcon, R, SHOTS, LOGOS,
    F: { DUNKEL, ORANGE, GRUEN, BLAU, GELB, ROT, GRAU, HELL, WEISS, LINIE, TEXT, HELLGRAU, FONT } });
  await pres.writeFile({ fileName: AUS });
  console.log("geschrieben:", AUS, "Folien:", nr);
})().catch((e) => { console.error(e); process.exit(1); });
