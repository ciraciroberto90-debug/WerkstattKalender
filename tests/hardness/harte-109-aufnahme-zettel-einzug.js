// Härtetest: AUFNAHME-ZETTEL + BEGLEITDATEI + EINZUG (Roll-out 64, Robertos
// Auftrag 06.10.: „second Cockpit fürs Handy über OneDrive, Textdatei neben
// dem Foto, Zwischenprogramm holt die Bilder und räumt sie aus der Cloud")
//
//  (Z) Der Aufnahme-Zettel (handy/aufnahme-zettel.html) baut aus Foto, Notiz,
//      Anlage, Ziel und Kürzel ZWEI Dateien mit demselben Stamm
//      (JJJJ-MM-TT_HHMM_Kürzel_xxxx.jpg + .json) und teilt sie; ohne Teilen-
//      Funktion bietet er sie zum Speichern an. Das Bild ist auf 1600 px
//      eingedampft. Ohne Kürzel kein Ablegen.
//  (B) Der Eingang liest die Begleitdatei: Karte mit Notiz, Anlage, Kürzel,
//      Ziel-Vorschlag und der Aufnahmezeit AUS DER DATEI (nicht Dateizeit).
//      Eine von Hand geschriebene .txt („Anlage: …") gilt genauso.
//  (E) Einzug (Programm-Fassung, Brücken-Attrappe wie harte-57): Schalter an
//      -> Bild wird Foto in Fotos/, Aufnahme-Eintrag mit Kennung aus dem
//      Dateinamen und den Angaben der Begleitdatei, Bild + Begleitdatei
//      verschwinden aus dem Ordner. Zweiter Durchlauf: nichts doppelt.
//      Scheitert das Schreiben des Fotos, bleibt die Datei liegen und es
//      entsteht KEIN Eintrag (gelöscht wird erst nach Bestätigung).
//      Ein zweiter PC, der den Eintrag schon vorfindet, räumt nur die Datei.
// Rot-Nachweis: gegen den Bau 52e7ae2 (APP_PFAD) kennt der Eingang weder
// Begleitdatei noch Einzug - (B) und (E) rot; der Zettel ist eine neue Datei.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");
const ZETTEL = "file:///home/user/WerkstattKalender/handy/aufnahme-zettel.html";

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const JETZT = new Date("2026-10-06T12:00:00");
const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }, { id: "a2", name: "B2", role: "takt" }], riItems: [], team: [] };

// Ein JPEG mit Struktur aus dem Canvas (im Browser gebaut, als Bytes zurück)
const fotoBauen = (p, breite, text) => p.evaluate(({ breite, text }) => {
  const c = document.createElement("canvas"); c.width = breite; c.height = Math.round(breite * 2 / 3);
  const g = c.getContext("2d"); g.fillStyle = "#3A4756"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#fff"; g.font = `bold ${Math.round(breite / 15)}px sans-serif`; g.fillText(text, 40, c.height / 2);
  for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 9},60%,50%)`; g.fillRect(i * (breite / 40), c.height - 60, breite / 50, 40); }
  return c.toDataURL("image/jpeg", 0.92).split(",")[1];
}, { breite, text }).then((b64) => Buffer.from(b64, "base64"));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ================= (Z) Der Aufnahme-Zettel ================= */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
    await p.clock.setFixedTime(JETZT);
    await p.addInitScript(() => {
      // Teilen nachbauen: merkt sich, was geteilt wurde
      window.__geteilt = null;
      navigator.canShare = (d) => !!(d && d.files && d.files.length);
      navigator.share = async (d) => { window.__geteilt = d; };
    });
    await p.goto(ZETTEL);
    await p.waitForTimeout(300);
    ok("(Z) Ohne Kürzel: Einstellungen offen, Hinweis sichtbar", !(await p.locator("#einstellungen").isHidden()) && !(await p.locator("#kuerzel-fehlt").isHidden()));
    await p.locator("#ablegen").click();
    await p.waitForTimeout(200);
    ok("(Z) Ablegen ohne Kürzel wird abgewiesen", /Kürzel/.test(await p.locator("#meldung").innerText()) && (await p.evaluate(() => window.__geteilt)) === null);
    await p.locator("#kuerzel").fill("RC");
    await p.locator("#anlagen-liste").fill("TS480\nB2\nOF320");
    await p.locator("#einstellungen-fertig").click();
    ok("(Z) Kürzel und Anlagen gemerkt, Auswahlliste gefüllt", (await p.locator("#anlagen option").count()) === 3 && /Kürzel RC/.test(await p.locator("#kopf-rechts").innerText()));
    const gross = await fotoBauen(p, 3000, "Leck TS480");
    await p.locator("#kamera").setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: gross });
    await p.waitForFunction(() => document.querySelectorAll("#vorschauen img").length === 1, null, { timeout: 8000 });
    await p.locator('button[data-ziel="ARBEIT"]').click();
    await p.locator("#notiz").fill("Leck Hydraulik TS480, Pfütze");
    await p.locator("#anlage").fill("TS480");
    await p.locator("#ablegen").click();
    await p.waitForFunction(() => !!window.__geteilt, null, { timeout: 8000 });
    const geteilt = await p.evaluate(async () => {
      const d = window.__geteilt;
      const namen = d.files.map((f) => f.name);
      const json = d.files.find((f) => f.name.endsWith(".json"));
      const jpg = d.files.find((f) => f.name.endsWith(".jpg"));
      const bmp = await createImageBitmap(jpg);
      return { namen, json: JSON.parse(await json.text()), jpgBytes: jpg.size, breite: bmp.width, hoehe: bmp.height };
    });
    const stammJpg = geteilt.namen.find((n) => n.endsWith(".jpg")).slice(0, -4);
    ok("(Z) Zwei Dateien mit demselben Stamm JJJJ-MM-TT_HHMM_RC_xxxx (.jpg + .json)",
      geteilt.namen.length === 2 && /^2026-10-06_1200_RC_[a-z0-9]{4}$/.test(stammJpg) && geteilt.namen.includes(stammJpg + ".json"), geteilt.namen.join(", "));
    ok("(Z) Die Begleitdatei trägt Format, Zeit (Ortszeit), Kürzel, Anlage, Ziel, Notiz und den Fotonamen",
      geteilt.json.format === "bta-aufnahme-v1" && /^2026-10-06T12:00:00/.test(geteilt.json.zeit) && geteilt.json.wer === "RC" && geteilt.json.anlage === "TS480" && geteilt.json.ziel === "ARBEIT" && geteilt.json.notiz === "Leck Hydraulik TS480, Pfütze" && geteilt.json.foto === stammJpg + ".jpg",
      JSON.stringify(geteilt.json));
    ok("(Z) Das Bild ist am Handy eingedampft: höchstens 1600 px Kante, deutlich kleiner als das Original", Math.max(geteilt.breite, geteilt.hoehe) <= 1600 && geteilt.jpgBytes < gross.length / 2, `${geteilt.breite}x${geteilt.hoehe}, ${Math.round(geteilt.jpgBytes / 1024)} kB (Original ${Math.round(gross.length / 1024)} kB)`);
    ok("(Z) Danach: Meldung grün, Fotos und Notiz geleert, Anlage bleibt, „Heute abgelegt · 1“",
      /geteilt/.test(await p.locator("#meldung").innerText()) && (await p.locator("#vorschauen img").count()) === 0 && (await p.locator("#notiz").inputValue()) === "" && (await p.locator("#anlage").inputValue()) === "TS480" && (await p.locator("#heute-zahl").innerText()) === "1");
    // Ohne Teilen-Funktion: Dateien zum Speichern
    await p.evaluate(() => { navigator.canShare = () => false; });
    await p.locator("#notiz").fill("Nur eine Notiz, kein Foto");
    await p.locator("#ablegen").click();
    await p.waitForTimeout(300);
    ok("(Z) Kann der Browser nicht teilen: Speichern-Knöpfe je Datei + „Alle speichern“ (hier nur die .json, da ohne Foto)",
      !(await p.locator("#ablage").isHidden()) && (await p.locator("#ablage-knoepfe button").count()) === 2 && /\.json$/.test(await p.locator("#ablage-knoepfe button").first().innerText()));
    ok("(Z) Keine Skriptfehler im Zettel", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ================= (B) + (E) Eingang mit Begleitdatei, Einzug im Programm ================= */
  const start = async (browser, { schreibenKaputt = false, vorhandeneEintraege = [] } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = []; p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    p.on("dialog", (d) => d.accept());
    await p.clock.setFixedTime(JETZT);
    // Zwei Bilder für die Attrappe (als Bytes), gebaut in einer Hilfsseite
    const hilf = await ctx.newPage(); await hilf.goto("about:blank");
    const klein = await fotoBauen(hilf, 1200, "Leck TS480");
    const gross = await fotoBauen(hilf, 3000, "Typenschild");
    await hilf.close();
    await p.addInitScript(({ c, klein, gross, kaputt, eintraege }) => {
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-name", "M. Weber");
      const b64 = (s) => { const r = atob(s); const a = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; };
      const T = (iso) => new Date(iso).getTime();
      const ablage = {
        ordner: { "/werkstatt": true, "/werkstatt/Fotos": true, "/onedrive": true },
        dateien: {
          "/werkstatt/kalender-daten.json": { text: JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: "2026-10-06T05:00:00.000Z", entries: eintraege, deleted: {}, config: c }), geaendert: T("2026-10-06T05:00:00") },
          // Vom Aufnahme-Zettel geteilt: Bild + Begleitdatei
          "/onedrive/2026-10-06_0742_RC_k3f9.jpg": { bytes: b64(klein), geaendert: T("2026-10-06T07:50:00") },
          "/onedrive/2026-10-06_0742_RC_k3f9.json": { text: JSON.stringify({ format: "bta-aufnahme-v1", zeit: "2026-10-06T07:42:13+02:00", wer: "RC", anlage: "TS480", ziel: "ARBEIT", notiz: "Leck Hydraulik TS480, Pfütze", foto: "2026-10-06_0742_RC_k3f9.jpg" }), geaendert: T("2026-10-06T07:50:00") },
          // Von Hand: großes Foto + .txt
          "/onedrive/typenschild.jpg": { bytes: b64(gross), geaendert: T("2026-10-06T09:30:00") },
          "/onedrive/typenschild.txt": { text: "Anlage: B2\nZiel: Akte\nTypenschild SEW R47", geaendert: T("2026-10-06T09:30:00") },
          // Ohne Begleitdatei
          "/onedrive/IMG_1130.jpg": { bytes: b64(klein), geaendert: T("2026-10-06T11:30:00") },
        },
        merk: {},
      };
      window.__ablage = ablage;
      const inhaltVon = (d) => (d.text !== undefined ? new TextEncoder().encode(d.text) : d.bytes);
      let schreibFehler = kaputt;
      window.__schreibenReparieren = () => { schreibFehler = false; };
      const bruecke = {
        waehleDatei: async () => "/werkstatt/kalender-daten.json", waehleDateiNeu: async () => null, waehleOrdner: async () => "/werkstatt",
        lese: async (pf) => { const d = ablage.dateien[pf]; if (!d) return null; const bytes = inhaltVon(d); return { bytes, geaendert: d.geaendert || Date.now(), groesse: bytes.length }; },
        stat: async (pf) => { const d = ablage.dateien[pf]; if (!d) return null; return { geaendert: d.geaendert || Date.now(), groesse: inhaltVon(d).length }; },
        schreibe: async (pf, text) => { ablage.dateien[pf] = { text: String(text), geaendert: Date.now() }; return true; },
        liste: async (o) => Object.keys(ablage.dateien).filter((pf) => pf.startsWith(o + "/") && !pf.slice(o.length + 1).includes("/")).map((pf) => ({ name: pf.split("/").pop(), pfad: pf })),
        entferne: async (pf) => { delete ablage.dateien[pf]; return true; },
        merke: async (k, w) => { if (w === null || w === undefined) delete ablage.merk[k]; else ablage.merk[k] = String(w); return true; },
        gemerkt: async (k) => (k in ablage.merk ? ablage.merk[k] : null),
        oeffnePfad: async () => true,
        pfadInfo: async (pf) => (ablage.ordner[pf] ? "ordner" : ablage.dateien[pf] ? "datei" : null),
        aufUpdate: () => {}, updateOrdnerSetzen: async () => true, updateStatus: async () => ({ ordner: "", stand: "", laeuftAus: "eingebauter Fassung" }), updatePruefen: async () => true, updateUebernehmen: async () => ({ ok: false }),
        ordnerAnlegen: async (pf) => { ablage.ordner[pf] = true; return true; },
        schreibeBytes: async (pf, bytes) => { if (schreibFehler) throw new Error("EPERM: Laufwerk verweigert"); ablage.dateien[pf] = { bytes: new Uint8Array(bytes), geaendert: Date.now() }; return true; },
      };
      window.__werkstattDesktop = bruecke;
      window.__fotoDateien = () => Object.keys(ablage.dateien).filter((pf) => pf.startsWith("/werkstatt/Fotos/")).map((pf) => pf.split("/").pop());
      window.__eingangDateien = () => Object.keys(ablage.dateien).filter((pf) => pf.startsWith("/onedrive/")).map((pf) => pf.split("/").pop()).sort();
    }, { c: config, klein: klein.toString("base64"), gross: gross.toString("base64"), kaputt: schreibenKaputt, eintraege: vorhandeneEintraege });
    await p.goto(APP);
    await p.waitForTimeout(900);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1200);
    await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
    // Datenordner (für Fotos/) und Eingangsordner (OneDrive) über die Brücke
    await p.evaluate(async () => {
      window.__wkSharedTest.adoptFolder(window.__wkDesktopTest.ordnerHandle("/werkstatt"));
      if (window.__wkEingangTest && window.__wkEingangTest.setzePfad) await window.__wkEingangTest.setzePfad("/onedrive");
    });
    await p.waitForTimeout(700);
    return { p, ctx, fehler };
  };
  const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
  const inAufnahme = async (p) => { await p.locator('button[data-hauptbereich="AUFNAHME"]').click(); await p.waitForTimeout(500); };

  /* (B) Begleitdatei */
  {
    const { p, ctx, fehler } = await start(browser);
    await inAufnahme(p);
    await p.waitForFunction(() => document.querySelectorAll("[data-aufnahme-karte]").length === 3, null, { timeout: 8000 }).catch(() => {});
    const texte = await p.locator("[data-aufnahme-karte]").allInnerTexts();
    const zettelKarte = texte.find((t) => /Leck Hydraulik/.test(t)) || "";
    ok("(B) Karte aus Zettel-Dateien: Notiz, Anlage TS480, Kürzel RC, Quelle „Zettel“, Vorschlag Arbeit - und die Zeit 07:42 AUS der Begleitdatei (Dateizeit wäre 07:50)",
      texte.length === 3 && /07:42 · Zettel RC/.test(zettelKarte) && /Anlage: TS480/.test(zettelKarte) && /Vorschlag/.test(zettelKarte), zettelKarte.replace(/\n/g, " · ").slice(0, 160));
    const txtKarte = texte.find((t) => /Typenschild SEW R47/.test(t)) || "";
    ok("(B) Von Hand geschriebene .txt („Anlage: B2 / Ziel: Akte / Text“) füllt die Karte genauso", /Anlage: B2/.test(txtKarte) && /Vorschlag/.test(txtKarte) && /09:30/.test(txtKarte), txtKarte.replace(/\n/g, " · ").slice(0, 120));
    ok("(B) Die Begleitdateien selbst erscheinen nicht als Karten, das Bild ohne Begleitdatei schon („PC-Ordner“)", texte.some((t) => /IMG_1130/.test(t) && /PC-Ordner/.test(t)) && !texte.some((t) => /\.json|\.txt/.test(t)));
    // Begleit-Leser direkt
    const roh = await p.evaluate(() => window.__wkEingangTest.leseBegleit("Anlage: VSM1\nziel: todo\nWer: TB\nLampe tauschen\nzweite Zeile"));
    ok("(B) .txt-Leser: Schlüssel egal in welcher Schreibung, freier Text wird Notiz, Ziel normiert", roh && roh.anlage === "VSM1" && roh.ziel === "TODO" && roh.wer === "TB" && roh.notiz === "Lampe tauschen zweite Zeile", JSON.stringify(roh));
    ok("(B) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

    /* (E) Einzug einschalten */
    const schalter = p.locator("input[data-einzug-schalter]");
    ok("(E) Der Einzug-Schalter ist in der Programm-Fassung da und schaltbar", (await schalter.count()) === 1 && (await schalter.isEnabled()));
    await schalter.check();
    await p.waitForFunction(() => (window.__eingangDateien()).length === 0, null, { timeout: 15000 }).catch(() => {});
    const uebrig = await p.evaluate(() => window.__eingangDateien());
    const fotos = await p.evaluate(() => window.__fotoDateien());
    const nachE = await gespeichert(p);
    const aufn = nachE.filter((e) => e.category === "AUFNAHME");
    const vomZettel = aufn.find((e) => e.id === "aufn-datei-2026-10-06_0742_RC_k3f9");
    const typen = aufn.find((e) => e.id === "aufn-datei-typenschild");
    ok("(E) Einzug: der OneDrive-Ordner ist leer (3 Bilder + 2 Begleitdateien weg), drei Fotos liegen in Fotos/", uebrig.length === 0 && fotos.length === 3, `übrig: ${uebrig.join(", ")} · Fotos: ${fotos.length}`);
    ok("(E) Drei Aufnahme-Einträge mit Kennung aus dem Dateinamen, Quelle Einzug, Foto-Verweis vorhanden", aufn.length === 3 && !!vomZettel && !!typen && aufn.every((e) => e.quelle === "einzug" && e.fotos && e.fotos.length === 1 && fotos.includes(e.fotos[0].datei)), aufn.map((e) => e.id).join(", "));
    ok("(E) Angaben aus der Begleitdatei im Eintrag: Notiz, Anlage TS480, Kürzel RC, Vorschlag ARBEIT, Zeit 07:42 Ortszeit", !!vomZettel && vomZettel.note === "Leck Hydraulik TS480, Pfütze" && vomZettel.name === "TS480" && vomZettel.wer === "RC" && vomZettel.zielWunsch === "ARBEIT" && vomZettel.zeit === "2026-10-06T05:42:13.000Z" && vomZettel.fotos[0].ts === vomZettel.zeit, JSON.stringify(vomZettel && { note: vomZettel.note, name: vomZettel.name, zeit: vomZettel.zeit }));
    const massTypen = await p.evaluate(async (name) => { const d = window.__ablage.dateien["/werkstatt/Fotos/" + name]; const bmp = await createImageBitmap(new Blob([d.bytes])); return { b: bmp.width, h: bmp.height, bytes: d.bytes.length }; }, typen ? typen.fotos[0].datei : "x");
    ok("(E) Das große Hand-Foto (3000 px) wurde beim Einzug eingedampft (≤ 1600 px)", Math.max(massTypen.b, massTypen.h) <= 1600, `${massTypen.b}x${massTypen.h}, ${Math.round(massTypen.bytes / 1024)} kB`);
    const stand = await p.locator("[data-einzug-stand]").innerText();
    ok("(E) Kopfzeile meldet „3 eingezogen“", /3 eingezogen/.test(stand), stand);
    ok("(E) Die Karten sind jetzt Aufnahmen vom Einzug (3 Karten, Quelle Einzug), nicht mehr Dateien", (await p.locator("[data-aufnahme-karte]").count()) === 3 && (await p.locator("[data-aufnahme-karte]").allInnerTexts()).every((t) => /Einzug/.test(t)));
    // Zweiter Durchlauf: nichts doppelt
    await p.evaluate(() => window.dispatchEvent(new Event("focus")));
    await p.waitForTimeout(1500);
    ok("(E) Zweiter Durchlauf: weiter 3 Aufnahmen, 3 Fotos - nichts doppelt", (await gespeichert(p)).filter((e) => e.category === "AUFNAHME").length === 3 && (await p.evaluate(() => window.__fotoDateien())).length === 3);
    ok("(E) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* (E) Schreiben scheitert -> nichts gelöscht, kein Eintrag, Meldung */
  {
    const { p, ctx } = await start(browser, { schreibenKaputt: true });
    await inAufnahme(p);
    await p.locator("input[data-einzug-schalter]").check();
    await p.waitForFunction(() => !!document.querySelector("[data-einzug-stand]"), null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(400);
    const uebrig = await p.evaluate(() => window.__eingangDateien());
    const aufn = (await gespeichert(p)).filter((e) => e.category === "AUFNAHME");
    const stand = await p.locator("[data-einzug-stand]").innerText().catch(() => "");
    ok("(E) Foto-Schreiben scheitert: alle 5 Dateien bleiben im Ordner, KEIN Eintrag, Kopfzeile nennt den Fehler („angehalten“)", uebrig.length === 5 && aufn.length === 0 && /angehalten/.test(stand), `${uebrig.length} Dateien, ${aufn.length} Einträge, „${stand.slice(0, 80)}“`);
    // Laufwerk wieder da -> der nächste Durchlauf zieht ein
    await p.evaluate(() => window.__schreibenReparieren());
    await p.evaluate(() => window.dispatchEvent(new Event("focus")));
    await p.waitForFunction(() => (window.__eingangDateien()).length === 0, null, { timeout: 15000 }).catch(() => {});
    ok("(E) Nach der Reparatur zieht der nächste Durchlauf alles ein", (await p.evaluate(() => window.__eingangDateien())).length === 0 && (await gespeichert(p)).filter((e) => e.category === "AUFNAHME").length === 3);
    await ctx.close();
  }

  /* (E) Zweiter PC: Eintrag schon da -> nur die Datei räumen, kein zweites Foto */
  {
    const vorhanden = [{ id: "aufn-datei-2026-10-06_0742_RC_k3f9", date: "2026-10-06", category: "AUFNAHME", name: "TS480", status: "open", note: "Leck Hydraulik TS480, Pfütze", fotos: [{ datei: "foto-vom-anderen-pc.jpg", wer: "RC", ts: "2026-10-06T05:42:13.000Z" }], wer: "RC", zeit: "2026-10-06T05:42:13.000Z", quelle: "einzug" }];
    const { p, ctx } = await start(browser, { vorhandeneEintraege: vorhanden });
    await inAufnahme(p);
    await p.locator("input[data-einzug-schalter]").check();
    await p.waitForFunction(() => (window.__eingangDateien()).length === 0, null, { timeout: 15000 }).catch(() => {});
    const aufn = (await gespeichert(p)).filter((e) => e.category === "AUFNAHME");
    const fotos = await p.evaluate(() => window.__fotoDateien());
    ok("(E) Zweiter PC: der vorhandene Eintrag bleibt EINER (mit dem Foto des ersten PCs), nur 2 neue Fotos für die zwei anderen Bilder, Ordner leer",
      aufn.length === 3 && aufn.filter((e) => e.id === "aufn-datei-2026-10-06_0742_RC_k3f9").length === 1 && aufn.find((e) => e.id === "aufn-datei-2026-10-06_0742_RC_k3f9").fotos[0].datei === "foto-vom-anderen-pc.jpg" && fotos.length === 2 && (await p.evaluate(() => window.__eingangDateien())).length === 0,
      `${aufn.length} Aufnahmen, ${fotos.length} Fotos`);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
