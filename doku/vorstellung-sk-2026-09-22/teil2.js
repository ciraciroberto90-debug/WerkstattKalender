// Kapitel 3-7 der Vorstellung (wird von build.js aufgerufen)
const { execSync } = require("child_process");
const path = require("path");

module.exports = async function ({ pres, titel, fuss, bild, kapitel, bildFolie, zweiBilder, absatzListe, kreisIcon, R, SHOTS, LOGOS, F }) {
  const { DUNKEL, ORANGE, GRUEN, BLAU, GELB, ROT, GRAU, HELL, WEISS, LINIE, TEXT, FONT } = F;
  const ratioVon = (datei) => {
    const sz = execSync(`python3 -c "from PIL import Image; im=Image.open('${datei}'); print(im.width, im.height)"`).toString().trim().split(" ").map(Number);
    return sz[0] / sz[1];
  };
  const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: FONT, margin: 0, isTextBox: true, color: TEXT }, o));
  const karte = (s, x, y, w, h, farbe = HELL) => s.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: farbe }, line: { color: farbe }, rectRadius: 0.1 });
  const pfeil = (s, x, y, w = 0.5, h = 0.3, farbe = ORANGE) => s.addShape(pres.ShapeType.rightArrow, { x, y, w, h, fill: { color: farbe }, line: { color: farbe } });
  const notiz = (s, t) => s.addNotes(t);

  // =====================================================================
  //  KAPITEL 3 - Das Backend
  // =====================================================================
  kapitel(3, "Das Backend – bewusst einfach", "Keine Server, keine Datenbank: eine Programmdatei und zwei Datendateien auf dem Firmenlaufwerk.");

  // ---- 3.1 Wie die Daten liegen (Schaubild) ----
  {
    const s = pres.addSlide();
    titel(s, "Wie die Daten liegen", "Alles auf dem vorhandenen Firmenlaufwerk – jeder Rechner greift auf dieselben Dateien zu");
    // Laufwerk-Kasten
    karte(s, 0.5, 1.4, 4.3, 3.55, HELL);
    T(s, "FIRMENLAUFWERK  ·  \\\\SCHEUDC1\\…\\Werkstatt_Kalender", { x: 0.7, y: 1.52, w: 4.0, h: 0.3, fontSize: 10, bold: true, color: GRAU });
    const dateien = [
      { n: "Werkstatt_Kalender_TPM.html", b: "das Programm – eine einzige Datei (Update-Ordner)", farbe: ORANGE },
      { n: "kalender-daten.json", b: "Schichten, Planung, To-dos, Zeiten, TPM/R+I, Pinnwand", farbe: BLAU },
      { n: "werkstatt-stoerungen.json", b: "die Störberichte – für alle Melder beschreibbar", farbe: ROT },
    ];
    dateien.forEach((d, i) => {
      const y = 1.95 + i * 0.95;
      s.addShape(pres.ShapeType.roundRect, { x: 0.7, y, w: 3.9, h: 0.8, fill: { color: WEISS }, line: { color: LINIE, width: 0.75 }, rectRadius: 0.06 });
      s.addShape(pres.ShapeType.ellipse, { x: 0.85, y: y + 0.25, w: 0.3, h: 0.3, fill: { color: d.farbe }, line: { color: d.farbe } });
      T(s, d.n, { x: 1.3, y: y + 0.08, w: 3.2, h: 0.3, fontSize: 12, bold: true, color: DUNKEL });
      T(s, d.b, { x: 1.3, y: y + 0.38, w: 3.2, h: 0.4, fontSize: 9.5, color: GRAU });
    });
    // Pfeile zu Rechnern
    pfeil(s, 5.0, 2.95, 0.6, 0.35);
    const rechner = [
      { t: "Werkstatt-Rechner", b: "lesen und schreiben – Bearbeiter", farbe: GRUEN },
      { t: "Leser-Rechner / Monitor", b: "nur ansehen – z. B. Morgenrunde, Hallenbildschirm", farbe: BLAU },
      { t: "Zweiter Standort", b: "gleiches Programm, eigene Daten (Kapitel 3.5)", farbe: ORANGE },
    ];
    rechner.forEach((r, i) => {
      const y = 1.4 + i * 1.2;
      karte(s, 5.8, y, 3.7, 1.0, HELL);
      s.addShape(pres.ShapeType.ellipse, { x: 6.0, y: y + 0.33, w: 0.34, h: 0.34, fill: { color: r.farbe }, line: { color: r.farbe } });
      T(s, r.t, { x: 6.5, y: y + 0.15, w: 2.9, h: 0.32, fontSize: 13, bold: true, color: DUNKEL });
      T(s, r.b, { x: 6.5, y: y + 0.48, w: 2.9, h: 0.45, fontSize: 10.5, color: TEXT });
    });
    fuss(s);
    notiz(s, "Kein Server, keine Datenbank, keine Installation: Das Programm ist eine HTML-Datei, die Daten liegen als zwei JSON-Dateien auf dem Laufwerk. Wer den Ordner sehen darf, kann das Cockpit nutzen.");
  }

  // ---- 3.2 Zusammenführen statt Überschreiben ----
  bildFolie("Zusammenführen statt Überschreiben", "Wie das Speichern funktioniert – und warum dabei nichts verloren geht", `${SHOTS}/12-kennkarte.png`, R, [
    "Jedes Speichern liest die ganze Datei, führt Eintrag für Eintrag zusammen und schreibt in einem Zug zurück",
    "Speichern zwei Rechner gleichzeitig, erkennt die Schreibmarke das – der Zweite führt neu zusammen, verlustfrei",
    "Konflikt-Wächter sammelt Kopien wie „…-GERÄTENAME.json“ automatisch ein",
    "Tages-Sicherung von selbst, dazu eine lokale Sicherung je Rechner",
    "Die Kennkarte (Bild) zeigt: verbunden womit, welche Rolle, welcher Stand",
  ], 5.6);

  // ---- 3.3 Rollen & Rechte ----
  {
    const s = pres.addSlide();
    titel(s, "Wer darf was – drei Rollen", "Eine Benutzerliste in der gemeinsamen Datei – die echte Sperre bleiben die Laufwerksrechte");
    const rollen = [
      { t: "Verwalter", farbe: ORANGE, glyph: "V", b: "Schreiben und Benutzer pflegen – Anlagen, Team, Rollen, Kennwörter. In der Regel der Werkstattleiter." },
      { t: "Bearbeiter", farbe: GRUEN, glyph: "B", b: "Einträge anlegen und ändern: Störungen melden, Schichten setzen, To-dos, Zeiten buchen." },
      { t: "Leser", farbe: BLAU, glyph: "L", b: "Nur ansehen: Übersicht, Schichtplan, Berichte. Nach 15 Minuten ohne Eingabe zurück zur Übersicht." },
    ];
    for (let i = 0; i < 3; i++) {
      const r = rollen[i], x = 0.5 + i * 3.1;
      karte(s, x, 1.4, 2.85, 2.55);
      await kreisIcon(s, x + 0.25, 1.62, 0.6, r.farbe, null, r.glyph);
      T(s, r.t, { x: x + 0.25, y: 2.35, w: 2.4, h: 0.35, fontSize: 15, bold: true, color: DUNKEL });
      T(s, r.b, { x: x + 0.25, y: 2.72, w: 2.4, h: 1.15, fontSize: 11.5, valign: "top" });
    }
    karte(s, 0.5, 4.15, 9.0, 0.75, "FDF6DF");
    T(s, "Ehrlich gesagt: Die Rollen sind eine Leitplanke gegen Versehen, kein kryptografisches Schloss. Wer den Datenordner auf dem Laufwerk öffnen darf, käme technisch an der App vorbei – echtes Sperren leisten nur die Laufwerksrechte. Ohne Schreibrecht auf dem Laufwerk schaltet die App von selbst auf „nur ansehen“.",
      { x: 0.7, y: 4.22, w: 8.6, h: 0.65, fontSize: 10.5, color: "6B5000", valign: "middle" });
    fuss(s);
  }

  // ---- 3.4 Updates über den grünen Balken ----
  {
    const s = pres.addSlide();
    titel(s, "Updates über den grünen Balken", "Eine neue Fassung wird einmal abgelegt – jeder Rechner holt sie sich selbst");
    const schritte = [
      { n: "1", t: "Datei ablegen", b: "Die neue Werkstatt_Kalender_TPM.html kommt in den Update-Ordner auf dem Laufwerk." },
      { n: "2", t: "Rechner prüft", b: "Jeder Rechner schaut alle 5 Minuten in den Ordner – ohne dass jemand etwas tut." },
      { n: "3", t: "Grüner Balken", b: "„Neue Version verfügbar“ erscheint oben im Cockpit – mit dem Knopf „Jetzt aktualisieren“." },
      { n: "4", t: "Ein Klick", b: "Die Fassung wird sicher übernommen. Daten bleiben unberührt – sie liegen ja in den JSON-Dateien." },
    ];
    for (let i = 0; i < 4; i++) {
      const st = schritte[i], x = 0.5 + i * 2.3;
      karte(s, x, 1.45, 2.1, 2.5);
      s.addShape(pres.ShapeType.ellipse, { x: x + 0.2, y: 1.65, w: 0.5, h: 0.5, fill: { color: GRUEN }, line: { color: GRUEN } });
      T(s, st.n, { x: x + 0.2, y: 1.65, w: 0.5, h: 0.5, fontSize: 15, bold: true, color: WEISS, align: "center", valign: "middle" });
      T(s, st.t, { x: x + 0.2, y: 2.3, w: 1.8, h: 0.35, fontSize: 12.5, bold: true, color: DUNKEL });
      T(s, st.b, { x: x + 0.2, y: 2.68, w: 1.8, h: 1.2, fontSize: 10.5, valign: "top" });
      if (i < 3) pfeil(s, x + 2.12, 2.55, 0.18, 0.25, GRUEN);
    }
    // Der Balken nachgezeichnet
    s.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 4.2, w: 9.0, h: 0.6, fill: { color: "EAF3EC" }, line: { color: "A9CDB4", width: 1 }, rectRadius: 0.06 });
    T(s, "Neue Version verfügbar – Werkstatt_Kalender_TPM (73).html (17.09., 06:45)", { x: 0.75, y: 4.2, w: 6.3, h: 0.6, fontSize: 11.5, bold: true, color: "1F5A33", valign: "middle" });
    s.addShape(pres.ShapeType.roundRect, { x: 7.2, y: 4.32, w: 1.6, h: 0.36, fill: { color: GRUEN }, line: { color: GRUEN }, rectRadius: 0.05 });
    T(s, "Jetzt aktualisieren", { x: 7.2, y: 4.32, w: 1.6, h: 0.36, fontSize: 10, bold: true, color: WEISS, align: "center", valign: "middle" });
    T(s, "später", { x: 8.9, y: 4.32, w: 0.55, h: 0.36, fontSize: 10, color: GRAU, valign: "middle" });
    fuss(s);
    notiz(s, "Kein Rechner muss einzeln angefasst werden. Der grüne Balken ist derselbe Weg, über den auch Fehlerbehebungen und neue Funktionen kommen.");
  }

  // ---- 3.5 Zwei Standorte ----
  {
    const s = pres.addSlide();
    titel(s, "Zwei Firmen, ein Programm", "Scheurich und Soendgen Keramik: gleiche Updates, komplett getrennte Daten");
    const spalten = [
      { t: "Scheurich", farbe: ORANGE, x: 0.5, logo: "scheurich-frei.png" },
      { t: "Soendgen Keramik", farbe: BLAU, x: 5.2, logo: "soendgen-keramik.png" },
    ];
    spalten.forEach((sp) => {
      karte(s, sp.x, 1.4, 4.3, 2.3);
      T(s, sp.t, { x: sp.x + 0.25, y: 1.55, w: 3.8, h: 0.4, fontSize: 16, bold: true, color: sp.farbe });
      absatzListe(s, ["eigene kalender-daten.json", "eigene werkstatt-stoerungen.json", "eigene Anlagen, Team, R+I-Punkte, Benutzer"], sp.x + 0.25, 2.05, 3.8, 1.5, 12);
    });
    // Gemeinsamer Teil
    karte(s, 0.5, 3.9, 9.0, 0.95, "EAF3EC");
    T(s, "Gemeinsam: dieselbe Programmdatei und derselbe Update-Ordner auf dem Firmenlaufwerk – eine neue Fassung erreicht beide Werkstätten. Beim ersten Start wählt jeder Rechner seine Werkstatt; die Daten der anderen sieht er nie.",
      { x: 0.7, y: 3.95, w: 8.6, h: 0.85, fontSize: 11.5, color: "1F5A33", valign: "middle" });
    fuss(s);
    notiz(s, "Die Standort-Trennung ist seit September eingebaut (Werkstatt-Wahl beim ersten Start). Soendgen Keramik startet mit einem leeren, eigenen Datenbestand.");
  }

  // =====================================================================
  //  KAPITEL 4 - Belastbarkeit
  // =====================================================================
  kapitel(4, "Belastbarkeit", "Messen statt behaupten: ein Stresstest weit jenseits des Alltags und 73 automatische Härtetests vor jeder Auslieferung.");

  // ---- 4.1 Stresstest in Zahlen + Diagramm ----
  {
    const s = pres.addSlide();
    titel(s, "Der Stresstest: 15 Jahre ohne Aufräumen", "Messfahrt vom 11.09.2026 – absichtlich weit jenseits des Betriebsalltags");
    const stats = [
      { z: "71.084", l: "Einträge", farbe: ORANGE },
      { z: "15", l: "Jahrgänge", farbe: BLAU },
      { z: "15,2 MB", l: "Dateigröße", farbe: GRUEN },
    ];
    stats.forEach((st, i) => {
      const y = 1.4 + i * 1.15;
      karte(s, 0.5, y, 2.6, 1.0);
      T(s, st.z, { x: 0.65, y: y + 0.05, w: 2.3, h: 0.6, fontSize: 26, bold: true, color: st.farbe, valign: "middle" });
      T(s, st.l, { x: 0.65, y: y + 0.62, w: 2.3, h: 0.3, fontSize: 11, color: GRAU });
    });
    s.addChart(pres.charts.BAR, [{
      name: "Einträge", labels: ["Schichtplan", "Backlog / Planung", "To-dos", "Zeiterfassung", "Störberichte", "TPM", "R+I", "Pinnwand"],
      values: [31728, 11654, 10660, 10648, 2704, 1647, 1647, 396],
    }], {
      x: 3.4, y: 1.35, w: 6.1, h: 3.55, barDir: "bar", chartColors: [ORANGE], showLegend: false,
      showTitle: true, title: "So verteilt sich der Stress-Bestand", titleFontSize: 11, titleColor: DUNKEL, titleFontFace: FONT,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 9, dataLabelColor: TEXT, dataLabelFormatCode: "#,##0",
      catAxisLabelFontSize: 10, catAxisLabelColor: TEXT, catAxisLabelFontFace: FONT, valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
      catAxisOrientation: "maxMin",
    });
    fuss(s);
    notiz(s, "Die 70.000 sind ein Stresstest, kein Betriebszustand. Ein echtes Werkstattjahr sind rund 4.500 Einträge; mit gepflegtem Jahresarchiv bleibt die Datei bei 5–8 MB.");
  }

  // ---- 4.2 Gemessene Zeiten ----
  {
    const s = pres.addSlide();
    titel(s, "Gemessene Zeiten bei 70.000 Einträgen", "Stoppuhr an der App selbst – die Netz-Geschwindigkeit des Laufwerks kommt obendrauf");
    const zeilen = [
      ["Verbinden (Datei komplett lesen, alles zusammenführen)", "3,1 s", "einmal beim Start"],
      ["Speichern, ein Bearbeiter", "6,8 s", "im Hintergrund – der Dialog schließt sofort"],
      ["Speichern, zwei Bearbeiter im selben Augenblick", "~20 s", "Extremfall, verlustfrei"],
      ["App-Start bis die Oberfläche steht", "0,6 s", ""],
      ["Leichte Bereiche (Übersicht, Berichte, To-do, Planung, TPM)", "0,1–0,9 s", "je Klick"],
      ["Datenreiche Bereiche (Störungen, Backlog, Zeiten, Schichtplan)", "2–10 s", "je Klick, beim Stress-Bestand"],
    ];
    const kopfY = 1.35;
    s.addShape(pres.ShapeType.rect, { x: 0.5, y: kopfY, w: 9.0, h: 0.38, fill: { color: DUNKEL }, line: { color: DUNKEL } });
    T(s, "Vorgang", { x: 0.65, y: kopfY, w: 5.2, h: 0.38, fontSize: 10.5, bold: true, color: WEISS, valign: "middle" });
    T(s, "Zeit", { x: 6.0, y: kopfY, w: 1.2, h: 0.38, fontSize: 10.5, bold: true, color: WEISS, valign: "middle" });
    T(s, "Einordnung", { x: 7.3, y: kopfY, w: 2.1, h: 0.38, fontSize: 10.5, bold: true, color: WEISS, valign: "middle" });
    zeilen.forEach((z, i) => {
      const y = kopfY + 0.38 + i * 0.44;
      if (i % 2 === 0) s.addShape(pres.ShapeType.rect, { x: 0.5, y, w: 9.0, h: 0.44, fill: { color: HELL }, line: { color: HELL } });
      T(s, z[0], { x: 0.65, y, w: 5.2, h: 0.44, fontSize: 11, valign: "middle" });
      T(s, z[1], { x: 6.0, y, w: 1.2, h: 0.44, fontSize: 13, bold: true, color: z[1].startsWith("~") || z[1].startsWith("2–") ? ORANGE : GRUEN, valign: "middle" });
      T(s, z[2], { x: 7.3, y, w: 2.1, h: 0.44, fontSize: 10, color: GRAU, valign: "middle" });
    });
    T(s, "Ehrlich dazugesagt: Beim Stress-Bestand sind die vier datenreichen Bereiche spürbar zäh – das steht als offener Punkt in der Roll-out-Liste. Im Alltag (ein Drittel dieser Menge) sind kürzere Zeiten zu erwarten, dort bislang ungemessen.",
      { x: 0.5, y: 4.5, w: 9.0, h: 0.6, fontSize: 10.5, italic: true, color: GRAU, valign: "top" });
    fuss(s);
  }

  // ---- 4.3 Härtetests ----
  {
    const s = pres.addSlide();
    titel(s, "73 Härtetests vor jeder Auslieferung", "Automatisch, wiederholbar – jede Änderung muss die ganze Suite grün durchlaufen");
    const karten = [
      { t: "Daten & Sync", farbe: ROT, glyph: "⇄", b: "Zwei Rechner speichern gleichzeitig · beschädigte Datei · Konfliktkopien · Massenlöschung · Speicher voll" },
      { t: "Rechte & Leser", farbe: BLAU, glyph: "L", b: "Leser kommt nie an Eingaben · Umgehung geprüft · Benutzerliste · Verbindung nach Neustart" },
      { t: "Zeit & Termine", farbe: ORANGE, glyph: "⏱", b: "Jahreswechsel · falsch gehende Rechneruhr · Zeitumstellung · Feiertage · alle Rhythmen" },
      { t: "Oberfläche & Druck", farbe: GRUEN, glyph: "▤", b: "Alle Druckvorlagen passen auf die Seite · Schichtbericht-Format · Dialoge laufen nicht über · 70.000er-Klickrunde" },
    ];
    for (let i = 0; i < 4; i++) {
      const k = karten[i], x = 0.5 + (i % 2) * 4.6, y = 1.4 + Math.floor(i / 2) * 1.75;
      karte(s, x, y, 4.4, 1.55);
      await kreisIcon(s, x + 0.2, y + 0.2, 0.5, k.farbe, null, k.glyph);
      T(s, k.t, { x: x + 0.85, y: y + 0.18, w: 3.4, h: 0.32, fontSize: 13.5, bold: true, color: DUNKEL });
      T(s, k.b, { x: x + 0.85, y: y + 0.55, w: 3.4, h: 0.95, fontSize: 10.5, valign: "top" });
    }
    T(s, "Grundregel: Eine Änderung am Speichern oder Zusammenführen braucht einen Test, der OHNE die Änderung fehlschlägt – erst dann gilt sie als bewiesen.",
      { x: 0.5, y: 4.85, w: 9.0, h: 0.4, fontSize: 10.5, italic: true, color: GRAU });
    fuss(s);
    notiz(s, "Dazu kommen acht weitere Suiten: Sync-Fokus, Smoke-Test, Stress-15-Jahre, Klickrunde, Suchtempo. Alles läuft in einem echten Chromium gegen die fertige HTML – nicht gegen einzelne Funktionen.");
  }

  // =====================================================================
  //  KAPITEL 5 - Einführung in 5 Minuten
  // =====================================================================
  kapitel(5, "Einführung in 5 Minuten", "Ein Download oder ein USB-Stick, ein Doppelklick, ein grüner Knopf – ohne Adminrechte, ohne IT-Anfrage.");

  // ---- 5.1 Drei Wege, ein Ablauf ----
  {
    const s = pres.addSlide();
    titel(s, "Ein Ablauf für jeden Rechner", "Der Weg zum Paket ist frei wählbar – danach ist es immer dasselbe");
    const wege = [
      { t: "Ein Link", b: "Das Komplettpaket als eine Datei vom Release – der Link bleibt immer derselbe" },
      { t: "USB-Stick", b: "Derselbe Ordner auf dem Stick – für Rechner ohne Internet" },
      { t: "Laufwerk", b: "Oder das Paket liegt schon auf dem Firmenlaufwerk" },
    ];
    wege.forEach((w, i) => {
      const y = 1.4 + i * 0.95;
      karte(s, 0.5, y, 2.7, 0.8);
      T(s, w.t, { x: 0.7, y: y + 0.08, w: 2.3, h: 0.3, fontSize: 12.5, bold: true, color: DUNKEL });
      T(s, w.b, { x: 0.7, y: y + 0.36, w: 2.3, h: 0.45, fontSize: 9.5, color: GRAU });
    });
    pfeil(s, 3.4, 2.45, 0.55, 0.35);
    const schritte = [
      { n: "1", t: "Entpacken", b: "auf dem Rechner (nie vom Stick starten)" },
      { n: "2", t: "Werkzeug starten", b: "Doppelklick auf BTA-Cockpit-Werkzeug.cmd" },
      { n: "3", t: "Einrichten", b: "Standort wählen, Pfade stehen schon drin, grüner Knopf" },
      { n: "4", t: "Fertig", b: "Desktop-Verknüpfung – der erste Start verbindet von selbst" },
    ];
    // Schritt-Abstand 0.72: Schritt 4 endet bei ~4.35, die grüne Box beginnt erst bei 4.5
    schritte.forEach((st, i) => {
      const y = 1.4 + i * 0.72;
      s.addShape(pres.ShapeType.ellipse, { x: 4.2, y: y + 0.1, w: 0.5, h: 0.5, fill: { color: GRUEN }, line: { color: GRUEN } });
      T(s, st.n, { x: 4.2, y: y + 0.1, w: 0.5, h: 0.5, fontSize: 14, bold: true, color: WEISS, align: "center", valign: "middle" });
      T(s, st.t, { x: 4.9, y: y + 0.03, w: 4.5, h: 0.32, fontSize: 13.5, bold: true, color: DUNKEL });
      T(s, st.b, { x: 4.9, y: y + 0.35, w: 4.6, h: 0.35, fontSize: 10.5, color: TEXT });
    });
    karte(s, 0.5, 4.5, 9.0, 0.6, "EAF3EC");
    T(s, "Nicht nötig: Adminrechte · Installation im Windows-Sinn · Server · Datenbank · IT-Ticket. Den Ordner löschen entfernt alles wieder.",
      { x: 0.7, y: 4.5, w: 8.6, h: 0.6, fontSize: 11, bold: true, color: "1F5A33", valign: "middle" });
    fuss(s);
  }

  // ---- 5.2 Das Werkzeug: Einrichten ----
  const rW = ratioVon(`${SHOTS}/30-werkzeug-einrichten.png`);
  bildFolie("Das Werkzeug – Reiter „Einrichten“", "Ein richtiges Windows-Fenster, gebaut mit Bordmitteln – nichts wird installiert", `${SHOTS}/30-werkzeug-einrichten.png`, rW, [
    "Standort-Vorlage: Scheurich oder Soendgen Keramik – die vier Pfade füllen sich passend",
    "Rechner-Art: Arbeitsplatz oder Info-Bildschirm (Autostart, Vollbild für die Morgenrunde)",
    "„Einrichten“ entpackt das Programm, schreibt die Pfade und legt die Verknüpfung an",
    "„Programm herunterladen“ holt den neuesten Stand direkt vom Release",
    "Unten immer sichtbar: Ladebalken und Protokoll – bei Fragen einfach speichern und schicken",
  ], 3.2);

  // ---- 5.3 Selbsttest + Wartung ----
  {
    const rS = ratioVon(`${SHOTS}/31-werkzeug-selbsttest.png`), rM = ratioVon(`${SHOTS}/32-werkzeug-wartung.png`);
    const s = pres.addSlide();
    titel(s, "Das Werkzeug – Selbsttest und Wartung", "„Geht bei dem nicht“ wird in Sekunden zur Ampel; die Pflege-Handgriffe an einem Ort");
    const hL = bild(s, `${SHOTS}/31-werkzeug-selbsttest.png`, 0.5, 1.3, 4.0, rS);
    const hR = bild(s, `${SHOTS}/32-werkzeug-wartung.png`, 5.5, 1.3, 4.0, rM);
    const hMax = Math.max(hL, hR);
    T(s, "Selbsttest: Laufwerk, Datendatei, Schreibrecht (Bearbeiter oder Leser), Update-Ordner, Störungs-Datei – grün, gelb oder rot. Prüfbericht als Textdatei für die Ablage.",
      { x: 0.5, y: 1.3 + hMax + 0.12, w: 4.0, h: 0.75, fontSize: 10.5, valign: "top" });
    T(s, "Wartung: nach Update suchen, Verknüpfung reparieren, an Taskleiste anheften, Datenordner öffnen, Pfade neu speichern – und „Vom Rechner entfernen“ räumt sauber ab.",
      { x: 5.5, y: 1.3 + hMax + 0.12, w: 4.0, h: 0.75, fontSize: 10.5, valign: "top" });
    fuss(s);
    notiz(s, "Die Bilder sind Vorlagen des Werkzeug-Fensters; das echte Fenster sieht so aus und ist auf Windows durchgetestet (Einrichten, Entfernen, Pfade speichern, Verbindung prüfen).");
  }

  // =====================================================================
  //  KAPITEL 6 - Die Arbeit mit Claude
  // =====================================================================
  kapitel(6, "Wie es entstanden ist", "Kein Software-Projekt mit Lastenheft – ein Werkstattleiter und ein KI-Werkzeug, im Gespräch, Tag für Tag.");

  // ---- 6.1 Rollenverteilung ----
  {
    const s = pres.addSlide();
    titel(s, "Zwei Rollen, ein Gespräch", "Der Werkstattleiter bringt den Alltag – Claude baut, prüft und dokumentiert");
    const spalten = [
      { t: "Roberto – Werkstattleiter", farbe: ORANGE, x: 0.5, p: ["Anforderungen aus dem Alltag: „so wie bei Excel“, „für die Morgenrunde“", "Tests am echten System – in der Werkstatt, mit echten Rechnern", "Entscheidungen: was gebaut wird, was nicht, was wann eingeführt wird", "Roll-out, Schulung der Kollegen, Rückmeldungen einsammeln"] },
      { t: "Claude – KI-Werkzeug", farbe: BLAU, x: 5.2, p: ["Bau der Funktionen samt Tests, Doku und Druckvorlagen", "Messen statt behaupten: jede Aussage wird nachgewiesen oder als ungemessen markiert", "Vorschläge mit Vorschau – der Mensch wählt aus", "Roll-out-Liste pflegen: offene Punkte, Stolpersteine, Erledigtes"] },
    ];
    spalten.forEach((sp) => {
      karte(s, sp.x, 1.4, 4.3, 3.4);
      T(s, sp.t, { x: sp.x + 0.25, y: 1.55, w: 3.8, h: 0.4, fontSize: 15, bold: true, color: sp.farbe });
      absatzListe(s, sp.p, sp.x + 0.25, 2.05, 3.8, 2.7, 11.5);
    });
    fuss(s);
  }

  // ---- 6.2 Was mir wichtig war (Hausregeln) ----
  {
    const s = pres.addSlide();
    titel(s, "Was mir dabei wichtig war", "Vier Regeln von Anfang an – sie stehen im Projekt und gelten für jede Änderung");
    const regeln = [
      { t: "Messen statt behaupten", farbe: ORANGE, glyph: "≡", b: "Jede Aussage über Verhalten (Browser, Dateien, Zeiten) wird nachgewiesen. Was nicht gemessen wurde, heißt „ungemessen“." },
      { t: "Keine IT nötig", farbe: GRUEN, glyph: "✓", b: "Alles läuft ohne Adminrechte, ohne Installation, ohne Ticket. Das war die Bedingung, damit es überhaupt starten konnte." },
      { t: "Sync-Fehler sind ein No-Go", farbe: ROT, glyph: "!", b: "Änderungen am Speichern oder Zusammenführen brauchen einen Test, der ohne die Änderung fehlschlägt." },
      { t: "Deutsch, mit dem Warum", farbe: BLAU, glyph: "D", b: "Oberfläche und Programmkommentare auf Deutsch – und jeder Kommentar erklärt, warum etwas so gebaut ist." },
    ];
    for (let i = 0; i < 4; i++) {
      const k = regeln[i], x = 0.5 + (i % 2) * 4.6, y = 1.4 + Math.floor(i / 2) * 1.75;
      karte(s, x, y, 4.4, 1.55);
      await kreisIcon(s, x + 0.2, y + 0.2, 0.5, k.farbe, null, k.glyph);
      T(s, k.t, { x: x + 0.85, y: y + 0.18, w: 3.4, h: 0.32, fontSize: 13.5, bold: true, color: DUNKEL });
      T(s, k.b, { x: x + 0.85, y: y + 0.55, w: 3.4, h: 0.95, fontSize: 10.5, valign: "top" });
    }
    T(s, "Dazu die Roll-out-Liste als Gedächtnis: Neue Aufgaben kommen sofort hinein, Erledigtes wandert nach unten – nichts wird gelöscht.",
      { x: 0.5, y: 4.85, w: 9.0, h: 0.4, fontSize: 10.5, italic: true, color: GRAU });
    fuss(s);
  }

  // ---- 6.3 So kommunizieren wir ----
  {
    const s = pres.addSlide();
    titel(s, "So kommunizieren wir", "Alltagssprache, Bilder, Feedback-Runden – und am Ende immer ein geprüfter Stand");
    const schritte = [
      { t: "Anliegen", b: "in Alltagssprache im Chat – gern mit Foto, Screenshot oder PDF-Scan" },
      { t: "Vorschlag", b: "Claude zeigt eine Vorschau oder mehrere Varianten" },
      { t: "Feedback", b: "so lange nachbessern, bis es passt (Tagesbericht: sechs Runden)" },
      { t: "Bau + Tests", b: "Funktion, Härtetest, ganze Suite grün, Doku" },
      { t: "Update", b: "neue Fassung in den Update-Ordner – grüner Balken auf allen Rechnern" },
    ];
    schritte.forEach((st, i) => {
      const x = 0.5 + i * 1.85;
      karte(s, x, 1.5, 1.65, 2.1);
      s.addShape(pres.ShapeType.ellipse, { x: x + 0.15, y: 1.65, w: 0.45, h: 0.45, fill: { color: ORANGE }, line: { color: ORANGE } });
      T(s, String(i + 1), { x: x + 0.15, y: 1.65, w: 0.45, h: 0.45, fontSize: 13, bold: true, color: WEISS, align: "center", valign: "middle" });
      T(s, st.t, { x: x + 0.15, y: 2.2, w: 1.4, h: 0.32, fontSize: 12.5, bold: true, color: DUNKEL });
      T(s, st.b, { x: x + 0.15, y: 2.52, w: 1.4, h: 1.05, fontSize: 9.5, valign: "top" });
    });
    karte(s, 0.5, 3.85, 9.0, 1.1, HELL);
    T(s, "Ein echtes Beispiel von dieser Woche", { x: 0.7, y: 3.92, w: 8.6, h: 0.3, fontSize: 11, bold: true, color: GRAU });
    T(s, "Mittwoch: Scan des Papier-Schichtprotokolls in den Chat → ins Cockpit-Format übertragen, sechs Feedback-Runden bis zum Morgenrunden-Blatt → Donnerstag in der Morgenrunde gezeigt („hat gepasst, bauen“) → am selben Tag fest in die App gebaut, mit Härtetest 74 abgesichert, Suite 73/73 grün, Update auf allen Rechnern.",
      { x: 0.7, y: 4.2, w: 8.6, h: 0.72, fontSize: 10.5, valign: "top" });
    fuss(s);
  }

  // ---- 6.4 Ein echter Auftrag im Wortlaut ----
  {
    const s = pres.addSlide();
    titel(s, "Ein Auftrag im Wortlaut", "Kein Pflichtenheft – ein Satz aus der Werkstatt, und was am selben Tag daraus wurde");
    // Chat-Blase
    s.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 1.4, w: 5.4, h: 1.5, fill: { color: "FDF6DF" }, line: { color: "E3CE8F", width: 0.75 }, rectRadius: 0.12 });
    T(s, "Roberto, 15.09.:", { x: 0.75, y: 1.5, w: 5.0, h: 0.3, fontSize: 10, bold: true, color: "8A4B00" });
    T(s, "„für bearbeiter eine option eine kachel mit einer ‚Notiz‘ zu versehen im schichtplan (wie bei excel) … außerdem wäre es cool wenn man in der übersicht ‚heute da‘ auch dementsprechend eine markierung sieht sollte dieser mitarbeiter an diesem tag eine notiz haben“",
      { x: 0.75, y: 1.8, w: 5.0, h: 1.05, fontSize: 11, italic: true, color: TEXT, valign: "top" });
    // Ergebnis
    s.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 3.1, w: 5.4, h: 1.75, fill: { color: "EAF3EC" }, line: { color: "A9CDB4", width: 0.75 }, rectRadius: 0.12 });
    T(s, "Ergebnis am selben Tag:", { x: 0.75, y: 3.2, w: 5.0, h: 0.3, fontSize: 10, bold: true, color: "1F5A33" });
    absatzListe(s, ["Zellen-Notiz im Schichtplan mit rotem Eck und Hover – wie der Excel-Kommentar", "Getrennte Datenart, damit Planungs-Notizen nicht im Schichtplan auftauchen (Robertos Nachbesserung)", "Markierung bei „Heute da“ in der Übersicht", "Härtetest 72 (28 Prüfungen) sichert alles ab"], 0.75, 3.5, 5.0, 1.3, 10.5);
    // rechts: Screenshot Schichtplan
    bild(s, `${SHOTS}/02-schichtplan.png`, 6.2, 1.4, 3.3, R);
    T(s, "Am Ende der Vorstellung: ein Auftrag live – Roberto schreibt einen Prompt, wir schauen gemeinsam, was passiert.",
      { x: 6.2, y: 3.6, w: 3.3, h: 1.2, fontSize: 11, italic: true, color: GRAU, valign: "top" });
    fuss(s);
  }

  // ---- 6.5 Was es gekostet hat ----
  {
    const s = pres.addSlide();
    titel(s, "Was es gekostet hat", "Ehrliche Rechnung – keine Lizenzen, kein Server, aber Arbeitszeit");
    const posten = [
      { z: "0 €", l: "Software-Lizenzen", farbe: GRUEN },
      { z: "0 €", l: "Server, Hardware, IT-Aufwand", farbe: GRUEN },
      { z: "Abo", l: "KI-Werkzeug im Monats-Abo statt Lizenz", farbe: BLAU },
      { z: "Zeit", l: "Arbeitszeit des Werkstattleiters: Anforderungen, Tests am echten System, Einführung", farbe: ORANGE },
    ];
    posten.forEach((p, i) => {
      const x = 0.5 + i * 2.3;
      karte(s, x, 1.4, 2.1, 2.2);
      T(s, p.z, { x: x + 0.15, y: 1.5, w: 1.8, h: 0.75, fontSize: 30, bold: true, color: p.farbe, valign: "middle" });
      T(s, p.l, { x: x + 0.15, y: 2.3, w: 1.8, h: 1.2, fontSize: 11, valign: "top" });
    });
    T(s, "Dem gegenüber steht, was täglich wegfällt: Zettel suchen, Excel abgleichen, Nachweise zusammensuchen, Zuruf – und was neu da ist: Zahlen für die Morgenrunde, ein druckfertiger Prüfnachweis, ein Blick für alle.",
      { x: 0.5, y: 3.85, w: 9.0, h: 0.9, fontSize: 11.5, color: TEXT, valign: "top" });
    fuss(s);
    notiz(s, "Zahlen zum Abo und zur Arbeitszeit bei Bedarf mündlich nennen – die Entscheidungsvorlage vom 10.08. enthält die Schätzung (Größenordnung: Abo unter 100 €/Monat).");
  }

  // =====================================================================
  //  KAPITEL 7 - Nutzen für Soendgen Keramik
  // =====================================================================
  kapitel(7, "Nutzen für Soendgen Keramik", "Was SK bekäme, wie der Einstieg aussähe – und was das Cockpit bewusst nicht kann.");

  // ---- 7.1 Was SK bekommt ----
  {
    const s = pres.addSlide();
    titel(s, "Was Soendgen Keramik bekommt", "Dasselbe Programm, eigene Daten, gemeinsame Weiterentwicklung");
    const karten = [
      { t: "Sofort einsatzbereit", farbe: GRUEN, glyph: "✓", b: "Dasselbe erprobte Programm, in fünf Minuten je Rechner eingerichtet – mit eigenem, leerem Datenbestand." },
      { t: "Morgenrunde & Nachweise", farbe: ORANGE, glyph: "▤", b: "Schichtbericht auf Knopfdruck, Prüfnachweis fürs Audit, Hallenmonitor für die Runde." },
      { t: "Eigene Stammdaten", farbe: BLAU, glyph: "A", b: "Anlagen, Team, Prüfpunkte, Kostenstellen im Verwalten – ohne Programmierung, ohne IT." },
      { t: "Gemeinsame Updates", farbe: DUNKEL, glyph: "↑", b: "Jede Verbesserung erreicht beide Werkstätten über den grünen Balken – Wünsche aus SK fließen in dieselbe Roll-out-Liste." },
    ];
    for (let i = 0; i < 4; i++) {
      const k = karten[i], x = 0.5 + (i % 2) * 4.6, y = 1.4 + Math.floor(i / 2) * 1.75;
      karte(s, x, y, 4.4, 1.55);
      await kreisIcon(s, x + 0.2, y + 0.2, 0.5, k.farbe, null, k.glyph);
      T(s, k.t, { x: x + 0.85, y: y + 0.18, w: 3.4, h: 0.32, fontSize: 13.5, bold: true, color: DUNKEL });
      T(s, k.b, { x: x + 0.85, y: y + 0.55, w: 3.4, h: 0.95, fontSize: 10.5, valign: "top" });
    }
    fuss(s);
  }

  // ---- 7.2 Fahrplan ----
  {
    const s = pres.addSlide();
    titel(s, "So könnte der Einstieg aussehen", "Ein Vorschlag – Tempo und Umfang bestimmt Soendgen Keramik");
    const schritte = [
      { t: "Erster Rechner", b: "Werkzeug, Standort „Soendgen Keramik“, in der App die gemeinsame Datei einmalig anlegen" },
      { t: "Stammdaten", b: "Anlagen, Team, Schichtarten, R+I-Punkte und Kostenstellen im Verwalten eintragen" },
      { t: "Weitere Rechner", b: "Werkstatt-Rechner als Bearbeiter, ein Leser-Bildschirm für die Morgenrunde" },
      { t: "Probelauf", b: "Zwei bis vier Wochen parallel zum Bisherigen – Störungen, Schichtplan, Morgenrunde" },
      { t: "Rückmeldung", b: "Wünsche und Stolpersteine in die Roll-out-Liste – Verbesserungen kommen per Update" },
    ];
    schritte.forEach((st, i) => {
      const x = 0.5 + i * 1.85;
      s.addShape(pres.ShapeType.ellipse, { x: x + 0.5, y: 1.5, w: 0.65, h: 0.65, fill: { color: i === 0 ? ORANGE : DUNKEL }, line: { color: i === 0 ? ORANGE : DUNKEL } });
      T(s, String(i + 1), { x: x + 0.5, y: 1.5, w: 0.65, h: 0.65, fontSize: 16, bold: true, color: WEISS, align: "center", valign: "middle" });
      if (i < 4) s.addShape(pres.ShapeType.line, { x: x + 1.15, y: 1.82, w: 0.7, h: 0, line: { color: LINIE, width: 1.5 } });
      T(s, st.t, { x: x, y: 2.3, w: 1.65, h: 0.35, fontSize: 12.5, bold: true, color: DUNKEL, align: "center" });
      T(s, st.b, { x: x, y: 2.65, w: 1.65, h: 1.5, fontSize: 10, align: "center", valign: "top" });
    });
    karte(s, 0.5, 4.3, 9.0, 0.6, HELL);
    T(s, "Begleitung: Roberto richtet den ersten Rechner mit ein; Fragen laufen über denselben Chat, aus dem auch die Scheurich-Werkstatt bedient wird.",
      { x: 0.7, y: 4.3, w: 8.6, h: 0.6, fontSize: 11, color: TEXT, valign: "middle" });
    fuss(s);
  }

  // ---- 7.3 Grenzen ----
  {
    const s = pres.addSlide();
    titel(s, "Was das Cockpit bewusst nicht kann", "Ehrlich benannt – damit die Erwartung stimmt");
    const punkte = [
      ["Ersatzteil-Lager mit Bestellwesen", "Nachbestellungen werden am Störbericht vermerkt – ein Lagersystem ist es nicht."],
      ["Mobile Erfassung per QR-Code", "Das Cockpit lebt auf den Werkstatt-Rechnern; eine Handy-Fassung ist als Idee offen."],
      ["Revisionssicherer Audit-Trail", "Es gibt einen Verlauf mit Urheber, aber keine unveränderbare Protokollierung."],
      ["Zugriffskontrolle", "Rollen sind eine Leitplanke. Wer den Ordner öffnen darf, kommt an die Daten – die Sperre sind die Laufwerksrechte."],
    ];
    punkte.forEach((p, i) => {
      const y = 1.4 + i * 0.8;
      karte(s, 0.5, y, 9.0, 0.68, HELL);
      s.addShape(pres.ShapeType.ellipse, { x: 0.7, y: y + 0.19, w: 0.3, h: 0.3, fill: { color: ROT }, line: { color: ROT } });
      T(s, "×", { x: 0.7, y: y + 0.19, w: 0.3, h: 0.3, fontSize: 12, bold: true, color: WEISS, align: "center", valign: "middle" });
      T(s, p[0], { x: 1.15, y: y + 0.06, w: 3.2, h: 0.56, fontSize: 12.5, bold: true, color: DUNKEL, valign: "middle" });
      T(s, p[1], { x: 4.4, y: y + 0.06, w: 4.95, h: 0.56, fontSize: 10.5, valign: "middle" });
    });
    T(s, "Die Grenze, ab der eine Kauf-Software die bessere Wahl wäre, steht in der Entscheidungsvorlage – bislang ist sie nicht erreicht.",
      { x: 0.5, y: 4.7, w: 9.0, h: 0.4, fontSize: 10.5, italic: true, color: GRAU });
    fuss(s);
  }

  // ---- 7.4 Abschluss ----
  {
    const s = pres.addSlide();
    s.background = { color: DUNKEL };
    T(s, "Fragen & Diskussion", { x: 0.7, y: 1.6, w: 8.6, h: 0.9, fontSize: 40, bold: true, color: WEISS });
    T(s, "Und zum Schluss: ein Auftrag live – ein Satz im Chat, und wir schauen zu, was passiert.", { x: 0.7, y: 2.55, w: 8.6, h: 0.5, fontSize: 16, color: "C7CCD2" });
    T(s, "R. Ciraci · Werkstattleiter BTA Scheurich", { x: 0.7, y: 3.2, w: 8.6, h: 0.4, fontSize: 12.5, color: "9AA1A8" });
    s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 3.95, w: 2.9, h: 0.9, fill: { color: WEISS }, line: { color: WEISS }, rectRadius: 0.08 });
    s.addImage({ path: path.join(LOGOS, "scheurich-group-hauptlogo.png"), x: 0.85, y: 4.13, w: 2.6, h: 0.65 });
    s.addShape(pres.ShapeType.roundRect, { x: 3.8, y: 3.95, w: 1.5, h: 0.9, fill: { color: WEISS }, line: { color: WEISS }, rectRadius: 0.08 });
    s.addImage({ path: path.join(LOGOS, "soendgen-keramik.png"), x: 4.02, y: 4.02, w: 1.06, h: 0.76 });
    fuss(s, true);
  }
};
