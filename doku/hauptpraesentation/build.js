// BTA-Cockpit - HAUPTPRÄSENTATION (pptxgenjs)
// Nachfolger der "Vorstellung für die Betriebsleitung" vom 08.09.2026, auf den
// Stand vom 21.09.2026 gebracht und FIRMENNEUTRAL: dasselbe Deck dient bei
// Scheurich und bei Soendgen Keramik - deshalb kein Adressat, kein Termin, kein
// Bundesland im Text. Bilder kommen aus shots.js (nicht im Git, vorher laufen lassen).
//
//   node shots.js && node build.js
//   python3 <pptx-skill>/scripts/office/validate.py ../BTA-Cockpit-Hauptpraesentation.pptx
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const pptxgen = require("pptxgenjs");

const SHOTS = path.join(__dirname, "..", "vorstellung-bta-cockpit", "shots");
const LOGOS = path.join(__dirname, "..", "logos");
const AUS = path.join(__dirname, "..", "BTA-Cockpit-Hauptpraesentation.pptx");
const STAND = "21.09.2026";

// Gemessene Zahlen (Quelle in Klammern) - hier an EINER Stelle pflegen.
const Z = {
  haertetests: "79",        // Dateien tests/hardness/harte-*.js, Suite 21.09.: 79/79
  einzelpruefungen: "1.400+", // PASS-Zeilen im Suitenlauf vom 21.09.: 1.416
  stressEintraege: "71.084", // Messfahrt 11.09.2026
  stressJahre: "15",
  stressMB: "15,2 MB",
  verbinden: "3,1 s", speichern: "6,8 s", start: "0,6 s",
  jahresEintraege: "≈ 4.500",
};

// Farben (aus der App, ohne Raute)
const DUNKEL = "2C3137", ORANGE = "C97A2B", GRUEN = "1F7A3D", BLAU = "2F6690", GELB = "F0C230", ROT = "C0392B";
const GRAU = "5B6572", HELL = "F3F4F6", WEISS = "FFFFFF", LINIE = "D5D9DE", TEXT = "1F2430", HELLGRAU = "AEB4BB";
const FONT = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.author = "R. Ciraci"; pres.title = "BTA-Cockpit – Hauptpräsentation";
let nr = 0;

const ratioVon = (datei) => {
  const sz = execSync(`python3 -c "from PIL import Image; im=Image.open('${datei}'); print(im.width, im.height)"`).toString().trim().split(" ").map(Number);
  return sz[0] / sz[1];
};
const pruefeBild = (datei) => { if (!fs.existsSync(datei)) throw new Error("Bild fehlt: " + datei + " - erst `node shots.js` laufen lassen"); return datei; };

// ---------- Bausteine ----------
const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: FONT, margin: 0, isTextBox: true, color: TEXT }, o));
const karte = (s, x, y, w, h, farbe = HELL) => s.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: farbe }, line: { color: farbe }, rectRadius: 0.1 });
const notiz = (s, t) => s.addNotes(t);
function fuss(s, dunkel = false) {
  nr++;
  T(s, "BTA-Cockpit · Instandhaltung digital", { x: 0.5, y: 5.28, w: 6, h: 0.25, fontSize: 9, color: dunkel ? "9AA1A8" : HELLGRAU });
  T(s, String(nr), { x: 9.0, y: 5.28, w: 0.5, h: 0.25, fontSize: 9, color: dunkel ? "9AA1A8" : HELLGRAU, align: "right" });
}
function titel(s, text, sub) {
  // 22 pt: die Vorschau (Ersatzschrift) läuft breiter als Calibri - so bleibt jeder Titel einzeilig
  T(s, text, { x: 0.5, y: 0.32, w: 9, h: 0.55, fontSize: 22, bold: true, color: DUNKEL });
  if (sub) T(s, sub, { x: 0.5, y: 0.86, w: 9, h: 0.3, fontSize: 12.5, color: GRAU });
}
function bild(s, datei, x, y, w, ratio) {
  pruefeBild(datei);
  const h = w / ratio;
  s.addShape(pres.ShapeType.roundRect, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, fill: { color: WEISS }, line: { color: LINIE, width: 0.75 }, rectRadius: 0.05,
    shadow: { type: "outer", blur: 6, offset: 2, angle: 90, color: "000000", opacity: 0.22 } });
  s.addImage({ path: datei, x, y, w, h });
  return h;
}
function kreis(s, x, y, d, farbe, glyph, groesse) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: farbe }, line: { color: farbe } });
  T(s, glyph, { x, y, w: d, h: d, fontSize: groesse || d * 22, bold: true, color: WEISS, align: "center", valign: "middle" });
}
function absatzListe(s, punkte, x, y, w, h, groesse = 12.5) {
  s.addText(punkte.map((p, i) => ({ text: p, options: { bullet: { indent: 12 }, breakLine: i < punkte.length - 1, paraSpaceAfter: 6 } })),
    { x, y, w, h, fontSize: groesse, color: TEXT, fontFace: FONT, valign: "top", margin: 0, isTextBox: true });
}
// Screenshot links, Erklärung rechts
function bildFolie(titelText, sub, datei, punkte, bildBreite = 5.7, unterschrift) {
  const s = pres.addSlide();
  titel(s, titelText, sub);
  const y = sub ? 1.3 : 1.1;
  // 5,7 Zoll Bildbreite: Bild endet bei ~4,9 Zoll, die Unterschrift bleibt über der Fußzeile
  const h = bild(s, datei, 0.5, y, bildBreite, ratioVon(datei));
  absatzListe(s, punkte, 0.5 + bildBreite + 0.35, y + 0.05, 9.5 - bildBreite - 0.35, 3.85, 11.5);
  if (unterschrift) T(s, unterschrift, { x: 0.5, y: y + h + 0.1, w: bildBreite, h: 0.3, fontSize: 9.5, italic: true, color: GRAU });
  fuss(s);
  return s;
}
// Zwei Screenshots nebeneinander mit Bildunterschrift
function zweiBilder(titelText, sub, links, rechts) {
  const s = pres.addSlide();
  titel(s, titelText, sub);
  const y = 1.3, w = 4.4;
  const hL = bild(s, links.datei, 0.5, y, w, ratioVon(links.datei));
  const hR = bild(s, rechts.datei, 5.1, y, w, ratioVon(rechts.datei));
  const hMax = Math.max(hL, hR);
  T(s, links.text, { x: 0.5, y: y + hMax + 0.12, w, h: 0.9, fontSize: 11, valign: "top" });
  T(s, rechts.text, { x: 5.1, y: y + hMax + 0.12, w, h: 0.9, fontSize: 11, valign: "top" });
  fuss(s);
  return s;
}
// Vier bis sechs Karten mit Kreis-Glyph
function kartenFolie(titelText, sub, karten, spalten = 2) {
  const s = pres.addSlide();
  titel(s, titelText, sub);
  const reihen = Math.ceil(karten.length / spalten);
  const w = (9.0 - (spalten - 1) * 0.2) / spalten;
  const hGes = 3.75, h = (hGes - (reihen - 1) * 0.18) / reihen;
  karten.forEach((k, i) => {
    const x = 0.5 + (i % spalten) * (w + 0.2), y = 1.35 + Math.floor(i / spalten) * (h + 0.18);
    karte(s, x, y, w, h);
    kreis(s, x + 0.18, y + 0.17, 0.42, k.farbe, k.glyph, 11);
    // Titel darf zweizeilig sein (Kasten 0,5 Zoll), der Text beginnt erst darunter
    T(s, k.t, { x: x + 0.72, y: y + 0.12, w: w - 0.9, h: 0.5, fontSize: 12, bold: true, color: DUNKEL, valign: "top" });
    T(s, k.b, { x: x + 0.18, y: y + 0.7, w: w - 0.36, h: h - 0.8, fontSize: 9.5, valign: "top" });
  });
  fuss(s);
  return s;
}
const logos = (s) => {
  s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 3.95, w: 2.9, h: 0.9, fill: { color: WEISS }, line: { color: WEISS }, rectRadius: 0.08 });
  s.addImage({ path: path.join(LOGOS, "scheurich-group-hauptlogo.png"), x: 0.85, y: 4.13, w: 2.6, h: 0.65 });
  s.addShape(pres.ShapeType.roundRect, { x: 3.8, y: 3.95, w: 1.5, h: 0.9, fill: { color: WEISS }, line: { color: WEISS }, rectRadius: 0.08 });
  s.addImage({ path: path.join(LOGOS, "soendgen-keramik.png"), x: 4.02, y: 4.02, w: 1.06, h: 0.76 });
};
const S = (name) => path.join(SHOTS, name);

(async () => {
  // ================= 1 Titel =================
  {
    const s = pres.addSlide();
    s.background = { color: DUNKEL };
    T(s, "BTA-Cockpit", { x: 0.7, y: 1.2, w: 8.6, h: 1.0, fontSize: 46, bold: true, color: WEISS });
    T(s, "Instandhaltung, Schichtbuch und Störberichte – ein Programm auf jedem Werkstatt-Rechner.", { x: 0.7, y: 2.2, w: 8.6, h: 0.5, fontSize: 17, color: "C7CCD2" });
    T(s, `Vorstellung · Stand ${STAND} · R. Ciraci, Werkstattleiter BTA`, { x: 0.7, y: 2.85, w: 8.6, h: 0.4, fontSize: 12.5, color: "9AA1A8" });
    logos(s);
    nr++;
    notiz(s, "Begrüßung. Ein Werkzeug, das die Werkstatt selbst eingeführt hat und das produktiv auf den Werkstatt-Rechnern läuft - als Desktop-Programm, mit den Daten auf dem Firmenlaufwerk. Dasselbe Programm für jede Werkstatt, mit eigenen Daten je Standort.");
  }

  // ================= 2 Agenda =================
  {
    const s = pres.addSlide();
    titel(s, "Worum es heute geht", "Acht Stationen – mit vielen Bildschirmfotos aus dem laufenden Betrieb (Beispieldaten)");
    const punkte = [
      ["Wo wir standen – wo wir heute sind", "Vorher / heute"],
      ["Was ist das BTA-Cockpit?", "Programm, Dateien, mehrere Werkstätten"],
      ["Die App im Alltag", "Übersicht · PitStops · Planung · Schichtplan · Störberichte · Berichte"],
      ["Beim Audit", "Nachweise auf Knopfdruck"],
      ["Rollen, Rechte, Personalisieren", "Wer sieht was – und wie jeder Rechner aussieht"],
      ["Nutzung und Verlässlichkeit", "Sicher zusammenführen, gemessen statt behauptet"],
      ["Kosten, Ersparnis, Kaufsoftware", "Ehrlich in beide Richtungen"],
      ["Was noch kommt – der Einstieg", "Ausblick, drei Schritte je Arbeitsplatz"],
    ];
    punkte.forEach((p, i) => {
      const links = i < 4;
      const x = links ? 0.5 : 5.2, y = 1.35 + (links ? i : i - 4) * 0.95;
      kreis(s, x, y + 0.05, 0.5, ORANGE, String(i + 1), 15);
      T(s, p[0], { x: x + 0.65, y, w: 3.7, h: 0.32, fontSize: 13, bold: true, color: DUNKEL });
      T(s, p[1], { x: x + 0.65, y: y + 0.34, w: 3.7, h: 0.5, fontSize: 10.5, color: GRAU, valign: "top" });
    });
    fuss(s);
    notiz(s, "Kurzer Überblick über den Ablauf - acht Stationen, am Ende der Ausblick und das Angebot zum Rundgang am echten System.");
  }

  // ================= 3 Vorher / Heute =================
  {
    const s = pres.addSlide();
    titel(s, "Wo wir standen – und wo wir heute sind");
    T(s, "VORHER", { x: 0.5, y: 1.15, w: 4.0, h: 0.3, fontSize: 11, bold: true, color: ROT });
    T(s, "HEUTE", { x: 5.3, y: 1.15, w: 4.2, h: 0.3, fontSize: 11, bold: true, color: GRUEN });
    const zeilen = [
      ["Stände und Zahlen steckten in Köpfen, Ordnern und Excel-Tabellen", "Transparenz für alle: Quoten, Trends und Ausfallzeiten als Zahlen und Diagramme"],
      ["Schichtübergabe aus dem Gedächtnis – Wichtiges ging unter", "Übersicht, Pinnwand und Schichtbericht: die nächste Schicht sieht alles sofort"],
      ["Jeder kannte nur seinen Teil – das Ganze war schwer zu durchschauen", "Eine Oberfläche für alles – als Werkstatt einfach zu verstehen, jeder wird abgeholt"],
      ["Die Leistung der Werkstatt blieb unsichtbar", "Erledigte Wartung und behobene Störungen stehen schwarz auf weiß"],
      ["Entscheidungen aus dem Bauch heraus", "Entscheiden mit Zahlen: wo sich Störungen häufen, welche Anlage Zeit frisst"],
    ];
    zeilen.forEach((z, i) => {
      const y = 1.5 + i * 0.62;
      karte(s, 0.5, y, 4.0, 0.54, "FBEDEC");
      T(s, z[0], { x: 0.65, y, w: 3.75, h: 0.54, fontSize: 10.5, valign: "middle" });
      s.addShape(pres.ShapeType.rightArrow, { x: 4.65, y: y + 0.14, w: 0.5, h: 0.26, fill: { color: ORANGE }, line: { color: ORANGE } });
      karte(s, 5.3, y, 4.2, 0.54, "E8F3EC");
      T(s, z[1], { x: 5.45, y, w: 3.95, h: 0.54, fontSize: 10.5, valign: "middle" });
    });
    T(s, "Gebaut aus der Werkstatt heraus – ohne Server, ohne Datenbank, ohne eine einzige IT-Anfrage.", { x: 0.5, y: 4.7, w: 9.0, h: 0.4, fontSize: 11.5, italic: true, color: GRAU, align: "center" });
    fuss(s);
    notiz(s, "Der rote Faden ist Transparenz: Zahlen statt Bauchgefühl, eine Oberfläche, die jeder versteht. Die einzelnen Funktionen kommen auf den nächsten Folien.");
  }

  // ================= 4 Was ist das BTA-Cockpit =================
  {
    const s = pres.addSlide();
    titel(s, "Was ist das BTA-Cockpit?", "Bewusst einfach: ein Programm-Ordner, zwei Datendateien, kein Server");
    const stats = [
      { z: "1", l: "Programm-Ordner je Rechner – entpacken, starten, fertig", farbe: ORANGE },
      { z: "2", l: "Datendateien im gemeinsamen Werkstatt-Ordner auf dem Laufwerk", farbe: BLAU },
      { z: "30 s", l: "automatischer Abgleich – fremde Änderungen erscheinen von selbst", farbe: GRUEN },
      { z: "0", l: "Server, Datenbanken, Clouds, Installationen, Adminrechte", farbe: DUNKEL },
    ];
    stats.forEach((st, i) => {
      const x = 0.5 + i * 2.3;
      karte(s, x, 1.35, 2.1, 1.55);
      T(s, st.z, { x: x + 0.15, y: 1.42, w: 1.8, h: 0.65, fontSize: 30, bold: true, color: st.farbe, valign: "middle" });
      T(s, st.l, { x: x + 0.15, y: 2.08, w: 1.8, h: 0.78, fontSize: 9.5, color: GRAU, valign: "top" });
    });
    T(s, "Das Programm läuft auf jedem Werkstatt-Rechner; App-Datei und Datendateien liegen im Werkstatt-Ordner auf dem Firmenlaufwerk. Wer bearbeiten darf, regeln die Laufwerks-Rechte – ohne Schreibrecht schaltet die App von selbst auf „nur ansehen“.",
      { x: 0.5, y: 3.1, w: 9.0, h: 0.6, fontSize: 11.5, valign: "top" });
    T(s, "Eine neue Version verteilen heißt: eine Datei in den Ordner legen. An jedem Rechner meldet sich ein grüner Balken „Neue Version verfügbar“ – ein Klick, fertig.",
      { x: 0.5, y: 3.72, w: 9.0, h: 0.5, fontSize: 11.5, valign: "top" });
    karte(s, 0.5, 4.3, 9.0, 0.7, "E9F0F6");
    T(s, [{ text: "Mehrere Werkstätten, ein Programm: ", options: { bold: true, color: BLAU } },
      { text: "Jede Werkstatt hat ihre eigenen Datendateien, ihr eigenes Team, eigene Anlagen und Feiertage. Ein Gruppen-Verwalter springt in der Kopfzeile zwischen den Werkstätten – Mitarbeiter und Daten bleiben klar getrennt." }],
      { x: 0.7, y: 4.3, w: 8.6, h: 0.7, fontSize: 10.5, valign: "middle", fontFace: FONT, margin: 0, isTextBox: true, color: TEXT });
    fuss(s);
    notiz(s, "Kernbotschaft: bewusst einfach. Alles bleibt im Haus, die Rechte regelt das Laufwerk, Updates verteilen sich von selbst. Seit September trägt dasselbe Programm mehrere Werkstätten mit getrennten Daten.");
  }

  // ================= 5 Übersicht =================
  bildFolie("Die Übersicht: die Lage auf einen Blick", "Der Startbildschirm jedes Rechners – ohne einen einzigen Klick", S("01-uebersicht.png"), [
    "Kennzahlen des Tages: fällig, erledigt, überfällig – dazu die TPM-Monatsquote (PitStops & R+I) und OEE aus der Excel-Tabelle.",
    "Wer ist jetzt da? Schichten mit Anwesenheit, live aus dem Schichtplan.",
    "Offene Störungen stehen rot ganz oben – nichts geht zwischen den Schichten unter.",
    "Tagesliste mit den Terminen von heute, Pinnwand mit Bildern – für alle sichtbar, auch am Leser-Rechner.",
    "Linkstreifen: Dokumente und Laufwerks-Pfade je Benutzer, ein Klick öffnet sie.",
  ], 5.7, "Beispieldaten · Kennzahlen, Anwesenheit, offene Störungen, Tagesliste und Pinnwand.");
  notiz(pres.slides[pres.slides.length - 1], "Der Startbildschirm jedes Rechners. Alles Wichtige ohne einen einzigen Klick - auch für reine Leser wie Betriebsleitung oder Nachbarabteilungen.");

  // ================= 6 Tagesliste + Anwesende =================
  zweiBilder("Tagesliste: was heute anliegt, wer es macht", "Neu seit dem 21.09.: die heute Anwesenden und ihre geplanten Punkte direkt in der Kachel",
    { datei: S("18-termin-anwesende.png"), text: "Der Knopf „Anwesende“ zeigt, wer heute da ist – nach Früh, Spät und Nacht, mit Fortschritt. Wer fehlt (Schule, Krank, Urlaub), steht grau darunter." },
    { datei: S("18b-termin-person.png"), text: "Ein Kollege gewählt: seine eingeplanten Arbeiten, fälligen To-dos und Notizen des Tages – Kästchen hakt direkt ab, der Stift öffnet den Dialog." });
  notiz(pres.slides[pres.slides.length - 1], "Die Tagesliste bleibt, wie sie war. Zusätzlich kann die Runde am Morgen je Kollegen durchgehen, was heute anliegt, und direkt abhaken.");

  // ================= 7 PitStops & Rundgänge =================
  bildFolie("PitStops & Rundgänge pflegen sich selbst", "TPM ist das Ganze – PitStops sind die geplanten Wartungen, R+I die Rundgänge", S("10-tpm-plan.png"), [
    "Automatische Rotation über die Wochen – Feiertage des eigenen Bundeslands und Betriebsferien eingerechnet.",
    "Ein Klick hakt ab – direkt auf der Kachel, die Kennfarbe der Anlage bleibt stehen.",
    "Regeltermine mit Serie: Abteilungsversammlung & Co., auf Wunsch mit Pinnwand-Zettel.",
    "Versäumtes bleibt sichtbar, bis es erledigt oder bewusst verschoben ist – das Termin-Archiv zeigt es auch den Lesern.",
  ], 5.7, "Der Plan-Kalender im September – Kennfarben je Anlage, grüner Haken = erledigt.");
  notiz(pres.slides[pres.slides.length - 1], "Niemand schreibt den Plan mehr von Hand fort - die Rotation rechnet die App, Liegengebliebenes bleibt ehrlich sichtbar. Feiertage und freie Tage stellt jede Werkstatt selbst ein.");

  // ================= 8 Wochenplanung =================
  bildFolie("Wochenplanung: Arbeiten per Ziehen verteilen", "Backlog neben dem Plan – die Wocheneinteilung entsteht in Minuten", S("03-planung.png"), [
    "Backlog neben dem Plan: alle offenen Arbeiten in einem frei verschiebbaren Fenster, nach Gewerk filterbar.",
    "Zuweisen = Ziehen: Arbeit auf die Zeile von Person und Tag ziehen – fertig. Umplanen genauso.",
    "Erledigtes verschwindet nicht: der Chip wird grün mit Haken und bleibt stehen – die Woche bleibt nachvollziehbar.",
    "Notizen in der Zelle sind Aufträge: abhaken heißt erledigt.",
    "Prioritäten und Gewerke (Mechanik / Elektrik) farblich sofort zu unterscheiden.",
  ], 5.7, "Der Wochenplan – Arbeiten auf Person und Tag ziehen.");

  // ================= 9 Schichtplan =================
  bildFolie("Schichtplan: eine Matrix für den ganzen Monat", "Je Person und Tag eine Schicht – mit Notizen, die nur die richtige Gruppe sieht", S("02-schichtplan.png"), [
    "Früh, Spät, Nacht, Urlaub, Krank, Schule und eigene Schichtarten – ein Klick in die Zelle, Tag oder ganze Woche.",
    "Notizen an der Zelle (Zahnarzt, Gespräch, Hinweis) mit Sichtbarkeit: alle, nur Bearbeiter oder nur Verwalter.",
    "Feiertage stehen rot, die Anwesenheit auf der Übersicht kommt live aus dieser Matrix.",
    "Zwei Ausdrucke: Monat quer und je Kalenderwoche ein Blatt fürs Schwarze Brett.",
  ], 5.7, "Die Monatsmatrix – Farben je Schichtart, Feiertage rot.");

  // ================= 10 Störberichte =================
  bildFolie("Störberichte: dokumentiert, mit Foto", "Das digitale Schichtbuch – eine eigene Datei, die alle beschreiben dürfen", S("06b-stoerungen-offen.png"), [
    "Fortlaufende Nummer je Jahr – jeder Bericht ist eindeutig zitierbar.",
    "Ausfallzeit je Anlage ausgewertet – Häufungen (3. Störung in 30 Tagen) meldet die App von selbst.",
    "Fotos vom Schaden direkt aus der Handy-Kamera – sagt der nächsten Schicht mehr als drei Sätze.",
    "Offene Maßnahmen wandern per Klick als Arbeit ins Backlog – nichts bleibt vergraben.",
    "Schichtbericht der letzten drei Schichten auf Knopfdruck – für die Morgenrunde.",
  ], 5.7, "Alle Störberichte nach Datum und Schicht – mit Ausfallzeit und Status.");

  // ================= 11 Berichte =================
  zweiBilder("Berichte: To-dos, Backlog und Zeiterfassung", "Der Bereich Berichte bündelt, was sonst in Listen und Zetteln verstreut war",
    { datei: S("05-todo.png"), text: "To-do-Liste: erteilt von, für wen, bis wann – überfällig rot, Vorwarnung orange. Abhaken hält fest, wer es erledigt hat." },
    { datei: S("08-zeiterfassung.png"), text: "Zeiterfassung je Mitarbeiter und Kostenstelle mit Jahres-Export nach Excel; dazu der Backlog aller offenen Arbeiten und eine Suche über alle Berichte." });

  // ================= 12 Audit =================
  bildFolie("Beim Audit: Nachweise auf Knopfdruck", "Der Auditor fragt – die App antwortet: Register öffnen oder Blatt drucken", S("20-druck-pruefnachweis-dialog.png"), [
    "Prüfnachweis als A4-Ausdruck: unterschriftsfähig, mit Anlage, Soll und Erledigt-Stand – direkt aus der App.",
    "Termintreue schwarz auf weiß: „X von Y erledigt · Z %“ je Monat – Zeitraum frei wählbar, dazu die Aufschlüsselung je Anlage.",
    "Lückenlose Historie je Anlage: die Anlagen-Akte mit allen Terminen, Arbeiten, Störungen, Ersatzteilen und Ausfallzeiten – über Jahre.",
    "Wer hat wann was geändert: der Verlauf der gemeinsamen Datei beantwortet es in Sekunden.",
  ], 5.7, "Der Druckdialog mit echter Vorschau – hier der Prüfnachweis.");

  // ================= 13 Rollen & Rechte =================
  zweiBilder("Rollen und Rechte: wer sieht was, wer darf was", "Drei Benutzergruppen – und eine Rechte-Tabelle, die der Verwalter selbst pflegt",
    { datei: S("15-benutzer-rechte.png"), text: "Verwalter, Bearbeiter, Leser – je Bereich „ausgeblendet“, „nur ansehen“ oder „bearbeiten“. Gilt sofort auf allen Rechnern. Je Benutzer eine eigene Link-Sammlung." },
    { datei: S("17-ansicht-menue.png"), text: "Der Ansichts-Schalter (Auge): der Verwalter sieht das Cockpit so, wie es ein Bearbeiter oder Leser sieht – prüfen, bevor Rechte verteilt werden." });
  notiz(pres.slides[pres.slides.length - 1], "Rechte in der App sind eine Leitplanke gegen Versehen. Echtes Sperren leisten die Laufwerksrechte - beides zusammen ergibt das Bild.");

  // ================= 14 Personalisieren & Regeln =================
  zweiBilder("Personalisieren & Regeln: je Werkstatt, je Rechner", "Was auf dem Bildschirm steht und was im Haus gilt, wird eingestellt – nicht programmiert",
    { datei: S("16b-anordnen.png"), text: "Übersicht anordnen: Kacheln ziehen, ausblenden, tauschen – oder eine Layout-Vorlage (Morgenrunde, Leitstand, Planung, Schlank) wählen. Gilt je Rechner." },
    { datei: S("19-regeln-listen.png"), text: "Regeln & Listen: Bundesland und freie Tage, Fehlerarten, Abwesenheitsgründe, Gewerk-Namen, Schwellen und Ziele, Textbausteine, Pflichtfelder – für alle Rechner." });

  // ================= 15 Mehrere Werkstätten =================
  {
    const s = pres.addSlide();
    titel(s, "Mehrere Werkstätten – ein Programm", "Getrennte Daten, gemeinsame Weiterentwicklung");
    const h = bild(s, S("20-kopfzeile-wechsel.png"), 0.5, 1.3, 9.0, ratioVon(S("20-kopfzeile-wechsel.png")));
    T(s, "Die Kopfzeile: aktuelle Werkstatt links, daneben der Wechsel-Knopf des Gruppen-Verwalters.", { x: 0.5, y: 1.3 + h + 0.08, w: 9.0, h: 0.3, fontSize: 9.5, italic: true, color: GRAU });
    const karten = [
      { t: "Eigene Daten je Werkstatt", farbe: BLAU, glyph: "≠", b: "Team, Anlagen, Prüfpunkte, Störberichte, Schichtplan, Rechte und Regeln liegen je Werkstatt in eigenen Dateien – nichts vermischt sich." },
      { t: "Gruppen-Verwalter", farbe: ORANGE, glyph: "⇄", b: "Ein Verwalter der Leit-Werkstatt springt frei zwischen den Werkstätten und ist dort Verwalter – ohne in deren Benutzerliste zu stehen." },
      { t: "Ein Programm, alle Updates", farbe: GRUEN, glyph: "↑", b: "Jede Verbesserung erreicht alle Werkstätten über den grünen Balken. Wünsche aus jeder Werkstatt fließen in dieselbe Roll-out-Liste." },
    ];
    karten.forEach((k, i) => {
      const x = 0.5 + i * 3.07, y = 1.3 + h + 0.5, w = 2.87, hh = 5.05 - y;
      karte(s, x, y, w, hh);
      kreis(s, x + 0.18, y + 0.17, 0.42, k.farbe, k.glyph, 12);
      T(s, k.t, { x: x + 0.72, y: y + 0.17, w: w - 0.85, h: 0.42, fontSize: 12, bold: true, color: DUNKEL, valign: "middle" });
      T(s, k.b, { x: x + 0.18, y: y + 0.72, w: w - 0.36, h: hh - 0.85, fontSize: 10, valign: "top" });
    });
    fuss(s);
    notiz(s, "Der zweite Standort war der Anlass, das Programm sauber zu trennen: ein Build, je Werkstatt ein Datenordner. Der Gruppen-Pass liegt auf dem Rechner des Verwalters, die andere Werkstatt sieht davon in ihren Einstellungen nichts.");
  }

  // ================= 16 Gemeinsame Nutzung =================
  kartenFolie("Gemeinsam nutzen, ohne sich zu überschreiben", "Sicherheit in zwei Richtungen: gegen Datenverlust und gegen Abfluss", [
    { t: "Eintrag für Eintrag zusammengeführt", farbe: GRUEN, glyph: "⇄", b: "Vor jedem Speichern wird der Datei-Stand gelesen, danach zurückgeprüft. Fremde Änderungen erscheinen alle 30 Sekunden von selbst." },
    { t: "Rechte über das Laufwerk", farbe: BLAU, glyph: "L", b: "Ohne Schreibrecht automatisch „nur ansehen“. Dazu die Benutzergruppen in der App mit Rechte-Tabelle je Bereich." },
    { t: "Sicherungen im Hintergrund", farbe: ORANGE, glyph: "S", b: "Je Gerät 30 Stände plus 14 Tages-Stände, täglich eine Kopie in den Datenordner – dort greift die IT-Sicherung." },
    { t: "Laufwerk kurz weg?", farbe: DUNKEL, glyph: "!", b: "Die App speichert lokal weiter, meldet es und gleicht beim nächsten Speichern ab. Eine beschädigte Datei heilt sie selbst." },
    { t: "Wächter gegen stille Fehler", farbe: ROT, glyph: "W", b: "Alte Programmfassung? Rote Leiste. Falsch gehende Uhr? Gemeldet, ohne eine Änderung zu verlieren. Massenlöschung? Notbremse." },
    { t: "Alles bleibt im Haus", farbe: GRUEN, glyph: "✓", b: "Keine Cloud, keine fremden Server: Programm und Daten liegen ausschließlich auf dem Firmenlaufwerk." },
  ], 3);

  // ================= 17 Verlässlichkeit =================
  {
    const s = pres.addSlide();
    titel(s, "Verlässlichkeit: gemessen, nicht behauptet", `Vollständiger Suitenlauf vom ${STAND} – vor jeder Auslieferung`);
    const stats = [
      { z: Z.haertetests, l: "automatische Härtetests", u: "in einem echten Browser gegen die fertige App", farbe: ORANGE },
      { z: Z.einzelpruefungen, l: "Einzelprüfungen im Volllauf", u: `vom ${STAND}`, farbe: BLAU },
      { z: Z.stressEintraege, l: "Einträge im Stresstest", u: `≈ ${Z.stressJahre} Werkstatt-Jahre in einer Datei`, farbe: GRUEN },
      { z: "100 %", l: "bestanden", u: "sonst geht keine Version aufs Laufwerk", farbe: DUNKEL },
    ];
    stats.forEach((st, i) => {
      const x = 0.5 + i * 2.3;
      karte(s, x, 1.35, 2.1, 1.85);
      T(s, st.z, { x: x + 0.15, y: 1.42, w: 1.8, h: 0.6, fontSize: 26, bold: true, color: st.farbe, valign: "middle" });
      // Beschriftung darf zweizeilig sein - eigener Kasten, Unterzeile erst darunter
      T(s, st.l, { x: x + 0.15, y: 2.05, w: 1.8, h: 0.5, fontSize: 11, bold: true, color: DUNKEL, valign: "top" });
      T(s, st.u, { x: x + 0.15, y: 2.6, w: 1.8, h: 0.55, fontSize: 9.5, color: GRAU, valign: "top" });
    });
    T(s, "Geprüfte Grenzfälle: beschädigte Datei (heilt sich selbst) · zwei gleichzeitig offene Fenster · zwei Rechner speichern im selben Augenblick · falsch gehende Uhr, verstellte Zeitzone und der Zeitumstellungs-Tag · volle Speichergrenze · echte Excel-Tabelle · Rechte-Entzug im laufenden Betrieb · Leser kommt nie an Eingaben.",
      { x: 0.5, y: 3.35, w: 9.0, h: 0.8, fontSize: 10.5, valign: "top" });
    karte(s, 0.5, 4.25, 9.0, 0.8);
    T(s, [{ text: "Hausregel: ", options: { bold: true, color: DUNKEL } }, { text: "Jede Änderung am Speichern oder Zusammenführen braucht einen Test, der ohne die Änderung fehlschlägt. Vor jeder Auslieferung läuft die komplette Suite – und was nicht gemessen wurde, wird als ungemessen gekennzeichnet." }],
      { x: 0.7, y: 4.25, w: 8.6, h: 0.8, fontSize: 10.5, valign: "middle", fontFace: FONT, margin: 0, isTextBox: true, color: TEXT });
    fuss(s);
    notiz(s, `Das unterscheidet das Cockpit von einer gewachsenen Excel-Lösung: Alles ist automatisiert getestet. Die Zahlen stammen aus dem Volllauf vom ${STAND}: ${Z.haertetests} Härtetests, über 1.400 Einzelprüfungen, dazu acht weitere Suiten (Sync-Fokus, Smoke-Test, Stress, Klickrunde, Suchtempo).`);
  }

  // ================= 18 Daten =================
  {
    const s = pres.addSlide();
    titel(s, "Daten: getestet weit über den Alltag hinaus", "Hochrechnung und Gegensteuern – die Datei bleibt klein und schnell");
    T(s, "SO VIEL HÄLT ES AUS – DIE MESSFAHRT ALS HOCHRECHNUNG", { x: 0.5, y: 1.25, w: 4.4, h: 0.3, fontSize: 10, bold: true, color: ORANGE });
    const links = [
      ["Ein volles Jahr Werkstattbetrieb", `${Z.jahresEintraege} Einträge`],
      ["Stress-Messfahrt (gemessen, 11.09.)", `${Z.stressEintraege} Einträge · ${Z.stressJahre} Jahrgänge · ${Z.stressMB}`],
      ["Gemessene Zeiten beim Stress-Bestand", `Verbinden ${Z.verbinden} · Speichern ${Z.speichern} im Hintergrund · Start ${Z.start}`],
    ];
    links.forEach((z, i) => {
      const y = 1.6 + i * 0.95;
      karte(s, 0.5, y, 4.4, 0.85);
      T(s, z[0], { x: 0.65, y: y + 0.08, w: 4.1, h: 0.3, fontSize: 11, bold: true, color: DUNKEL });
      T(s, z[1], { x: 0.65, y: y + 0.4, w: 4.1, h: 0.4, fontSize: 10.5, color: TEXT, valign: "top" });
    });
    T(s, "Die 70.000 sind ein Stresstest, kein Betriebszustand. Im Alltag liegt die Datei bei einem Bruchteil – die vier datenreichen Bereiche waren beim Stress-Bestand spürbar zäh und stehen als offener Punkt in der Roll-out-Liste.",
      { x: 0.5, y: 4.5, w: 4.4, h: 0.7, fontSize: 9.5, italic: true, color: GRAU, valign: "top" });
    T(s, "UND SO WIRD GEGENGESTEUERT, LANGE BEVOR ES ENG WIRD", { x: 5.1, y: 1.25, w: 4.4, h: 0.3, fontSize: 10, bold: true, color: GRUEN });
    const rechts = [
      ["Speicher-Warnung und Jahres-Archiv", "Nähert sich die Datei der Grenze (rund 5 MB), meldet die App es sichtbar. Das Jahres-Archiv lagert alte Jahrgänge in eigene Dateien aus – die Hauptdatei bleibt klein."],
      ["Große Brocken bleiben draußen", "Fotos wandern nie in die Datendatei – sie liegen als Bilddateien im Fotos-Ordner daneben. Gelöschtes wird über eine Merkliste sauber ausgetragen."],
      ["Die Daten gehören der Werkstatt", "Lesbarer Klartext (JSON), jederzeit nach Excel/CSV exportierbar – kein Herstellerformat, kein Wechsel-Hindernis."],
    ];
    rechts.forEach((z, i) => {
      const y = 1.6 + i * 1.15;
      karte(s, 5.1, y, 4.4, 1.05, "E8F3EC");
      T(s, z[0], { x: 5.25, y: y + 0.08, w: 4.1, h: 0.3, fontSize: 11, bold: true, color: DUNKEL });
      T(s, z[1], { x: 5.25, y: y + 0.38, w: 4.1, h: 0.65, fontSize: 9.5, color: TEXT, valign: "top" });
    });
    fuss(s);
    notiz(s, "Die Hochrechnung: Ein volles Werkstatt-Jahr sind rund 4.500 Einträge - die Messfahrt entspricht rund 15 Jahren ohne Aufräumen. Dazu die Steuerung: Speicher-Warnung plus Jahres-Archiv, Fotos außerhalb der Datei, Klartext-Format.");
  }

  // ================= 19 Kosten =================
  {
    const s = pres.addSlide();
    titel(s, "Was hat es gekostet – und was sparen wir?");
    T(s, "GEKOSTET", { x: 0.5, y: 1.15, w: 4.0, h: 0.3, fontSize: 11, bold: true, color: DUNKEL });
    T(s, "DAS ENTFÄLLT SEITDEM", { x: 5.0, y: 1.15, w: 4.5, h: 0.3, fontSize: 11, bold: true, color: GRUEN });
    const kosten = [["0 €", "Anschaffung – aus der Werkstatt heraus entwickelt"], ["0 €", "laufende Kosten: keine Lizenzen, keine Server, keine Cloud"], ["0 h", "IT-Aufwand – läuft auf den vorhandenen Rechnern und dem vorhandenen Laufwerk"]];
    kosten.forEach((k, i) => {
      const y = 1.5 + i * 1.0;
      karte(s, 0.5, y, 4.0, 0.88);
      T(s, k[0], { x: 0.65, y, w: 1.2, h: 0.88, fontSize: 28, bold: true, color: ORANGE, valign: "middle" });
      T(s, k[1], { x: 1.9, y, w: 2.5, h: 0.88, fontSize: 10.5, valign: "middle" });
    });
    const spart = ["Wartungsplan von Hand fortschreiben und abtippen", "Doppelte Pflege: Zettel, Excel-Listen, Aushänge nebeneinander", "Suchen vor Audits – Nachweise entstehen jetzt auf Knopfdruck", "Verlorene Störungs-Infos zwischen den Schichten – und die Rückfragen danach", "Wochenplanung und Übergabe aus dem Gedächtnis"];
    spart.forEach((t, i) => {
      const y = 1.5 + i * 0.58;
      karte(s, 5.0, y, 4.5, 0.5, "E8F3EC");
      T(s, "✓", { x: 5.15, y, w: 0.35, h: 0.5, fontSize: 14, bold: true, color: GRUEN, valign: "middle" });
      T(s, t, { x: 5.55, y, w: 3.85, h: 0.5, fontSize: 10.5, valign: "middle" });
    });
    T(s, "Die eingesparte Zeit steckt jede Woche in Planung, Übergabe und Audit-Vorbereitung – sie bleibt in der Werkstatt.", { x: 0.5, y: 4.6, w: 9.0, h: 0.4, fontSize: 11.5, italic: true, color: GRAU, align: "center" });
    fuss(s);
    notiz(s, "Kurz und ehrlich: Es gab keine Anschaffung, es gibt keine laufenden Kosten und keinen IT-Betriebsaufwand. Der Gewinn ist Zeit - beim Planen, bei der Übergabe, vor Audits - und dass nichts mehr verloren geht.");
  }

  // ================= 20 Warum nicht kaufen =================
  {
    const s = pres.addSlide();
    titel(s, "Und warum nicht einfach kaufen?", "Ein ehrlicher Vergleich – beide Wege haben Licht und Schatten");
    T(s, "BTA-COCKPIT (EIGENBAU)", { x: 0.5, y: 1.3, w: 4.4, h: 0.3, fontSize: 11, bold: true, color: ORANGE });
    T(s, "GEKAUFTE INSTANDHALTUNGS-SOFTWARE", { x: 5.1, y: 1.3, w: 4.4, h: 0.3, fontSize: 11, bold: true, color: BLAU });
    const eigen = [["+", "Keine Anschaffung, keine Lizenzen, kein Server – 0 € im Jahr"], ["+", "Exakt auf die Abläufe der Werkstatt zugeschnitten – nichts Überflüssiges"], ["+", "Wünsche sind in Tagen umgesetzt, nicht im nächsten Jahres-Release"], ["+", "Daten als lesbarer Klartext im Haus – jederzeit exportierbar"], ["–", "Kein Hersteller-Support – Pflege und Weiterentwicklung liegen bei uns (Übergabe-Plan in der Roll-out-Liste)"], ["–", "EXE noch unsigniert – der SmartScreen-Hinweis bleibt, bis die IT signiert"]];
    const kauf = [["+", "Hersteller-Support, Schulungen, garantierte Updates"], ["+", "Großer Funktionsumfang ab Tag 1 (Lager, Einkauf, Mobile-Apps)"], ["+", "Verantwortung für Betrieb und Sicherheit liegt beim Anbieter"], ["–", "Lizenz- und Wartungskosten – jedes Jahr, oft je Benutzer"], ["–", "Einführung als IT-Projekt: Server, Schnittstellen, Monate Vorlauf"], ["–", "Abläufe müssen sich der Software anpassen – Sonderwünsche kosten extra; Daten oft in Cloud oder Herstellerformat"]];
    const liste = (arr, x) => arr.forEach((z, i) => {
      const y = 1.65 + i * 0.5;
      T(s, z[0], { x, y, w: 0.3, h: 0.46, fontSize: 14, bold: true, color: z[0] === "+" ? GRUEN : ROT, valign: "top" });
      T(s, z[1], { x: x + 0.3, y, w: 4.1, h: 0.46, fontSize: 10, valign: "top" });
    });
    liste(eigen, 0.5); liste(kauf, 5.1);
    T(s, "Für die Größe und die Abläufe unserer Werkstätten rechnet sich der Eigenbau – und der Wechsel bliebe jederzeit möglich, weil die Daten uns gehören.", { x: 0.5, y: 4.7, w: 9.0, h: 0.45, fontSize: 11, italic: true, color: GRAU, align: "center" });
    fuss(s);
    notiz(s, "Bewusst ehrlich in beide Richtungen: Gekaufte Systeme bringen Support und Funktionsbreite, kosten aber jedes Jahr und zwingen die Abläufe in ihr Korsett. Der Eigenbau ist passgenau und kostenfrei; die offene Flanke - Pflege und Übergabe - ist benannt.");
  }

  // ================= 21 Ausblick =================
  {
    const s = pres.addSlide();
    titel(s, "Was kommt noch – und was ist möglich?");
    T(s, "VORGEMERKT (besprochen, wird gebaut)", { x: 0.5, y: 1.15, w: 4.4, h: 0.3, fontSize: 11, bold: true, color: ORANGE });
    T(s, "MÖGLICH, WENN GEWÜNSCHT", { x: 5.1, y: 1.15, w: 4.4, h: 0.3, fontSize: 11, bold: true, color: BLAU });
    const vor = [["GitHub-Release", "ein einziger Download-Knopf für Programm und Startpaket"], ["Signierte EXE mit der IT", "kein SmartScreen-Hinweis mehr beim ersten Start"], ["Papierkorb „Kürzlich gelöscht“", "versehentlich Gelöschtes selbst zurückholen"], ["Ersatzteil-Übersicht", "Bestände und Bestell-Liste – die Nachbestell-Markierung aus den Störberichten ist der Anfang"]];
    const moegl = [["Weitere Abteilungen als Leser", "Betriebsleitung, Produktion & Co. schauen live mit – ohne Mehraufwand"], ["Zuständige Person am Störbericht", "Restarbeiten erscheinen dann direkt beim Kollegen in der Tagesliste"], ["Monitor-Umlauf und Prioritätsstufen", "auf Zuruf – die Bausteine sind da"], ["Weitere Werkstätten", "ein neuer Standort ist ein neuer Datenordner – das Programm bleibt dasselbe"]];
    const liste = (arr, x, farbe) => arr.forEach((z, i) => {
      const y = 1.5 + i * 0.8;
      karte(s, x, y, 4.4, 0.7);
      s.addShape(pres.ShapeType.rect, { x, y, w: 0.08, h: 0.7, fill: { color: farbe }, line: { color: farbe } });
      T(s, z[0], { x: x + 0.22, y: y + 0.06, w: 4.1, h: 0.3, fontSize: 11.5, bold: true, color: DUNKEL });
      T(s, z[1], { x: x + 0.22, y: y + 0.36, w: 4.1, h: 0.32, fontSize: 9.5, color: GRAU });
    });
    liste(vor, 0.5, ORANGE); liste(moegl, 5.1, BLAU);
    T(s, "Wünsche aus Werkstatt und Führungskreis wandern in die Roll-out-Liste – dort wird entschieden, was als Nächstes kommt.", { x: 0.5, y: 4.75, w: 9.0, h: 0.4, fontSize: 11, italic: true, color: GRAU, align: "center" });
    fuss(s);
    notiz(s, "Links: fest vorgemerkt. Rechts: möglich auf Zuruf. Seit dem 08.09. gebaut und deshalb hier nicht mehr aufgeführt: Jahres-Archiv, Feiertage je Standort, zweiter Standort, Rechte je Gruppe, Personalisieren.");
  }

  // ================= 22 Neuer Arbeitsplatz =================
  {
    const s = pres.addSlide();
    titel(s, "Ein neuer Arbeitsplatz: drei Schritte, keine IT", "Vom Laufwerk oder vom USB-Startpaket – ohne Adminrechte");
    const schritte = [
      ["Programm-Ordner kopieren", "Die fertige Master-Kopie liegt auf dem Laufwerk (oder auf dem USB-Stick) – einfach auf den Rechner kopieren, z. B. auf den Desktop."],
      ["BTA-Cockpit starten", "Beim allerersten Start einmal die Windows-Nachfrage bestätigen. Werkstatt wählen, Datei-Verbindung sitzt dank Vorbelegung von selbst."],
      ["Arbeiten", "Ab dann: Doppelklick, App geht auf, Stand ist aktuell. Neue Versionen meldet der grüne Balken – ein Klick genügt."],
    ];
    schritte.forEach((st, i) => {
      const x = 0.5 + i * 3.07;
      kreis(s, x + 1.1, 1.45, 0.7, i === 0 ? ORANGE : DUNKEL, String(i + 1), 20);
      if (i < 2) s.addShape(pres.ShapeType.line, { x: x + 1.95, y: 1.8, w: 1.6, h: 0, line: { color: LINIE, width: 1.5 } });
      T(s, st[0], { x, y: 2.3, w: 2.87, h: 0.4, fontSize: 13.5, bold: true, color: DUNKEL, align: "center" });
      T(s, st[1], { x: x + 0.1, y: 2.75, w: 2.67, h: 1.4, fontSize: 10.5, align: "center", valign: "top" });
    });
    karte(s, 0.5, 4.3, 9.0, 0.7);
    T(s, "Aufwand je Arbeitsplatz: wenige Minuten, ohne Adminrechte-Installation. Die bebilderte Aufsetz-Anleitung (PDF) liegt bei – für Bearbeiter- wie Leser-Rechner.", { x: 0.7, y: 4.3, w: 8.6, h: 0.7, fontSize: 11, valign: "middle" });
    fuss(s);
    notiz(s, "Einmalig die Master-Kopie auf den Rechner, ab dann kommen alle Updates über den grünen Balken vom Laufwerk. Die PDF-Anleitung führt Schritt für Schritt durch.");
  }

  // ================= 23 Abschluss =================
  {
    const s = pres.addSlide();
    s.background = { color: DUNKEL };
    T(s, "Ein Programm. Eine Datei je Werkstatt.\nAlles nachweisbar.", { x: 0.7, y: 0.9, w: 8.6, h: 1.5, fontSize: 26, bold: true, color: WEISS, valign: "top" });
    const punkte = ["Rundgang in der App – 15 Minuten am echten System", "Lesezugang für Betriebsleitung und Nachbarabteilungen ist sofort möglich", "Fragen & Wünsche fließen in die Roll-out-Liste ein"];
    punkte.forEach((p, i) => T(s, "▸  " + p, { x: 0.7, y: 2.6 + i * 0.4, w: 8.6, h: 0.38, fontSize: 14, color: "C7CCD2" }));
    logos(s);
    T(s, "R. Ciraci · Werkstattleiter BTA", { x: 5.6, y: 4.2, w: 3.9, h: 0.4, fontSize: 12.5, color: "9AA1A8", align: "right" });
    fuss(s, true);
    notiz(s, "Abschluss: Angebot für einen Rundgang am echten System. Lesezugang kostet nichts und zeigt mehr als jede Folie.");
  }

  await pres.writeFile({ fileName: AUS });
  console.log("geschrieben:", AUS, "Folien:", nr);
})().catch((e) => { console.error(e); process.exit(1); });
