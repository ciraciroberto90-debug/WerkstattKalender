// Härtetest: REITER „AUFNAHME" (Roll-out 61, Robertos Freigabe 06.10.)
//
// Bilder vom Handy (Einträge der Kategorie AUFNAHME mit Foto-Verweis) und
// Bilder aus dem Eingangsordner des PCs (Dateien, z. B. Downloads) kommen in
// EINEN Eingangskorb und werden in sechs Ziele sortiert. Geprüft wird:
//   (1) Reiter mit Zählkreis; Eingang zeigt alle Karten mit geladenem Bild;
//       Dateien älter als der Zeitraum (14 Tage) bleiben draußen.
//   (2) „→ Arbeit" an einer Datei-Karte: Dialog mit Bild vorbelegt, Speichern
//       legt die Arbeit MIT Foto-Verweis an, die Bilddatei liegt im Fotos/-
//       Ordner, die Karte verschwindet, der Zählkreis sinkt - und die Datei
//       im Eingangsordner bleibt unangetastet.
//   (3) Durchblättern: Notiz + Anlage tippen, Taste 2 öffnet das To-do mit
//       Text und Anlage, Speichern -> To-do mit Foto; die Ansicht springt weiter.
//   (4) Handy-Aufnahme -> Zettel (Taste 4): Zettel mit DEMSELBEN Foto-Verweis
//       (keine zweite Datei), Aufnahme steht auf done + ziel ZETTEL.
//   (5) Abbrechen im Dialog hinterlässt keine Datei und keine Sortierung.
//   (6) „Weg damit" an einer Datei: nur Gedächtnis dieses Rechners - nach
//       dem Neuladen bleibt sie weg, die Datei im Ordner existiert weiter.
//   (7) Tagesfilm zeigt alle Aufnahmen des Tages, Sortiertes blass mit Ziel.
//   (8) Akte aus einer Datei braucht eine Anlage; mit Anlage entsteht ein
//       AUFNAHME-Eintrag (done, AKTE) mit Foto, sichtbar in der Anlagen-Akte.
// Rot-Nachweis: gegen den Bau vor dem 06.10. (APP_PFAD) gibt es keinen Reiter
// „Aufnahme" - (1) und alles danach ist rot.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const JETZT = new Date("2026-10-06T12:00:00");
const HEUTE = "2026-10-06";

const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }, { id: "a2", name: "B2", role: "takt" }], riItems: [], team: [] };
// Eine Handy-Aufnahme von heute 07:42 mit Foto-Verweis (die Datei liegt im Fotos/-Ordner der Attrappe)
const handyAufnahme = { id: "aufn-handy-1", date: HEUTE, category: "AUFNAHME", name: "", status: "open", note: "Kabelkanal B2 offen, Deckel fehlt", fotos: [{ datei: "foto-handy.jpg", wer: "RC", ts: "2026-10-06T05:42:00.000Z" }], wer: "RC", zeit: "2026-10-06T05:42:00.000Z", quelle: "handy", zielWunsch: "ARBEIT" };

async function start(browser, { entries = [handyAufnahme], verarbeitet = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.clock.setFixedTime(JETZT);
  await p.addInitScript(({ e, c, verarbeitet }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-name", "M. Weber");
    if (verarbeitet) localStorage.setItem("aufnahme-verarbeitet", JSON.stringify(verarbeitet));
    // Ein "Foto" als JPEG aus dem Canvas - mit Struktur, damit es ein echtes Bild ist
    const bild = (farbe, text) => new Promise((resolve) => {
      const cv = document.createElement("canvas"); cv.width = 1200; cv.height = 800;
      const g = cv.getContext("2d");
      g.fillStyle = farbe; g.fillRect(0, 0, 1200, 800);
      g.fillStyle = "#fff"; g.font = "bold 90px sans-serif"; g.fillText(text, 80, 420);
      for (let i = 0; i < 30; i++) { g.fillStyle = `hsl(${i * 12},60%,50%)`; g.fillRect(i * 40, 600 + (i % 4) * 40, 36, 36); }
      cv.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    });
    // Datenordner-Attrappe (wie harte-51): Fotos/ liegt darin, __fotoDateien() verrät den Inhalt
    const ordnerAus = (knoten) => ({
      kind: "directory", name: "Werkstatt_Kalender",
      async getDirectoryHandle(name, opts) {
        if (!knoten.dirs.has(name)) { if (!opts || !opts.create) { const err = new Error("nicht da"); err.name = "NotFoundError"; throw err; } knoten.dirs.set(name, { dirs: new Map(), files: new Map() }); }
        return ordnerAus(knoten.dirs.get(name));
      },
      async getFileHandle(name, opts) {
        if (!knoten.files.has(name)) { if (!opts || !opts.create) { const err = new Error("nicht da"); err.name = "NotFoundError"; throw err; } knoten.files.set(name, new Blob([])); }
        return { kind: "file", name,
          async createWritable() { const teile = []; return { async write(x) { teile.push(x); }, async close() { knoten.files.set(name, new Blob(teile)); } }; },
          async getFile() { return new File([knoten.files.get(name)], name, { type: "image/jpeg" }); } };
      },
      async removeEntry(name) { if (knoten.files.has(name)) knoten.files.delete(name); else if (knoten.dirs.has(name)) knoten.dirs.delete(name); else { const err = new Error("nicht da"); err.name = "NotFoundError"; throw err; } },
      async *entries() { for (const [n, b] of knoten.files) yield [n, { kind: "file", name: n, async getFile() { return new File([b], n); } }]; },
      async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
    });
    const wurzel = { dirs: new Map([["Fotos", { dirs: new Map(), files: new Map() }]]), files: new Map() };
    window.__mockWurzel = wurzel;
    window.__mockOrdnerHandle = ordnerAus(wurzel);
    window.__fotoDateien = () => [...wurzel.dirs.get("Fotos").files.entries()].map(([n, b]) => ({ name: n, size: b.size }));
    // Eingangsordner-Attrappe ("Downloads"): drei Bilder von heute, eines von vor 20 Tagen, eine PDF
    const dateien = [
      { name: "WhatsApp Image 2026-10-06 at 08.15.jpg", farbe: "#3A4756", text: "Leck TS480", zeit: new Date("2026-10-06T08:15:00").getTime() },
      { name: "IMG_20261006_0930.jpg", farbe: "#6B4A2B", text: "Typenschild", zeit: new Date("2026-10-06T09:30:00").getTime() },
      { name: "WhatsApp Image 2026-10-06 at 11.30.jpg", farbe: "#2B5F6B", text: "Lieferschein", zeit: new Date("2026-10-06T11:30:00").getTime() },
      { name: "alt.jpg", farbe: "#444", text: "alt", zeit: new Date("2026-09-16T10:00:00").getTime() },
      { name: "rechnung.pdf", farbe: "#000", text: "", zeit: new Date("2026-10-06T10:00:00").getTime() },
    ];
    const blobs = new Map();
    window.__eingangZugriffe = [];
    window.__eingangHandle = {
      kind: "directory", name: "Downloads",
      async *entries() {
        for (const d of dateien) {
          yield [d.name, { kind: "file", name: d.name,
            async getFile() {
              window.__eingangZugriffe.push(d.name);
              if (!blobs.has(d.name)) blobs.set(d.name, d.name.endsWith(".pdf") ? new Blob(["%PDF"]) : await bild(d.farbe, d.text));
              return new File([blobs.get(d.name)], d.name, { type: d.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg", lastModified: d.zeit });
            } }];
        }
      },
      async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
    };
    window.__eingangDateienVorhanden = () => dateien.map((d) => d.name);
    window.__handyFotoAnlegen = async () => { wurzel.dirs.get("Fotos").files.set("foto-handy.jpg", await bild("#7A2B2B", "Kabelkanal")); };
  }, { e: entries, c: config, verarbeitet });
  await p.goto(APP);
  await p.waitForTimeout(900);
  await p.evaluate(async () => { await window.__handyFotoAnlegen(); window.__wkSharedTest.adoptFolder(window.__mockOrdnerHandle); if (window.__wkEingangTest) window.__wkEingangTest.adopt(window.__eingangHandle); });
  await p.waitForTimeout(600);
  return { p, ctx, fehler };
}
const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
const inAufnahme = async (p, tab) => {
  await p.locator('button[data-hauptbereich="AUFNAHME"]').click();
  await p.waitForTimeout(400);
  if (tab) { await p.locator(`button[data-aufnahme-tab="${tab}"]`).click(); await p.waitForTimeout(400); }
};
const bilderGeladen = (p) => p.evaluate(() => [...document.querySelectorAll("[data-aufnahme-karte] img[data-aufnahme-bild]")].map((i) => i.naturalWidth > 0));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const { p, ctx, fehler } = await start(browser);

  /* (1) Reiter, Zählkreis, Karten */
  const reiter = p.locator('button[data-hauptbereich="AUFNAHME"]');
  ok("(1) Der Hauptbereich „Aufnahme“ ist da", (await reiter.count()) === 1);
  const zahl = await p.locator('[data-hauptbereich-zahl="AUFNAHME"]').innerText().catch(() => "");
  ok("(1) Zählkreis am Reiter: 4 unsortiert (1 Handy + 3 Dateien von heute; alt.jpg und rechnung.pdf bleiben draußen)", zahl.trim() === "4", `„${zahl}“`);
  await inAufnahme(p);
  await p.waitForFunction(() => document.querySelectorAll("[data-aufnahme-karte]").length === 4 && [...document.querySelectorAll("[data-aufnahme-karte] img[data-aufnahme-bild]")].filter((i) => i.naturalWidth > 0).length === 4, null, { timeout: 8000 }).catch(() => {});
  const karten = await p.locator("[data-aufnahme-karte]").count();
  const geladen = await bilderGeladen(p);
  ok("(1) Eingang: 4 Karten, alle vier Bilder geladen (Handy-Foto aus Fotos/, drei aus dem Eingangsordner)", karten === 4 && geladen.length === 4 && geladen.every(Boolean), `${karten} Karten, Bilder: ${geladen.join(",")}`);
  const texte = await p.locator("[data-aufnahme-karte]").allInnerTexts();
  ok("(1) Die Handy-Karte zeigt Notiz, Uhrzeit und Quelle; die Datei-Karten die Dateizeit und „PC-Ordner“",
    texte.some((t) => /Kabelkanal B2 offen/.test(t) && /07:42/.test(t) && /Handy/.test(t)) && texte.filter((t) => /PC-Ordner/.test(t)).length === 3 && texte.some((t) => /08:15/.test(t)) && texte.some((t) => /11:30/.test(t)),
    texte.map((t) => t.split("\n")[0]).join(" | "));
  ok("(1) Reihenfolge nach Uhrzeit: 07:42 Handy zuerst, 11:30 zuletzt", /07:42/.test(texte[0]) && /11:30/.test(texte[3]));
  const eingangZeile = await p.locator("[data-eingang-lage]").innerText();
  ok("(1) Kopfzeile nennt den Eingangsordner „Downloads“ mit 3 Bildern", /Downloads/.test(eingangZeile) && /3 Bilder/.test(eingangZeile), eingangZeile.slice(0, 120));

  /* (2) Datei-Karte -> Arbeit */
  const karte0815 = p.locator("[data-aufnahme-karte]", { hasText: "08:15" });
  await karte0815.locator('button[data-aufnahme-ziel="ARBEIT"]').click();
  await p.waitForTimeout(1500); // Eindampfen des 1200x800-Bildes
  const dialog = p.getByText("Neue Arbeit – aus der Aufnahme");
  ok("(2) „→ Arbeit“ öffnet den Arbeit-Dialog „aus der Aufnahme“ mit dem Bild als Vorschau",
    (await dialog.count()) === 1 && (await p.locator('div[role="dialog"], .no-print').filter({ hasText: "Neue Arbeit" }).locator("img").count()) >= 1);
  ok("(2) Vor dem Speichern liegt NICHTS im Fotos/-Ordner außer dem Handy-Foto (kein Waisen-Risiko)", (await p.evaluate(() => window.__fotoDateien())).length === 1);
  await p.locator("select").filter({ hasText: "Anlage / Bereich wählen" }).selectOption("TS480");
  await p.locator('textarea[placeholder="Was ist zu tun?"]').fill("Leck Hydraulik TS480, Pfütze");
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.waitForTimeout(900);
  const nach2 = await gespeichert(p);
  const arbeit = nach2.find((e) => e.category === "ARBEIT");
  const fotos2 = await p.evaluate(() => window.__fotoDateien());
  ok("(2) Speichern: Arbeit TS480 mit Foto-Verweis, die Bilddatei liegt im Fotos/-Ordner (Verweis = Dateiname)",
    !!arbeit && arbeit.name === "TS480" && Array.isArray(arbeit.fotos) && arbeit.fotos.length === 1 && fotos2.some((f) => f.name === arbeit.fotos[0].datei && f.size > 5000),
    JSON.stringify({ arbeit: arbeit && arbeit.fotos, fotos: fotos2.map((f) => f.name) }));
  ok("(2) Der Foto-Verweis trägt die DATEIZEIT als Aufnahmezeit (08:15), nicht die Uhrzeit des Sortierens", !!arbeit && /T06:15:00/.test(arbeit.fotos[0].ts), arbeit && arbeit.fotos[0].ts);
  ok("(2) Die Karte ist aus dem Eingang verschwunden, Zählkreis 3", (await p.locator("[data-aufnahme-karte]").count()) === 3 && (await p.locator('[data-hauptbereich-zahl="AUFNAHME"]').innerText()).trim() === "3");
  const merker = await p.evaluate(() => JSON.parse(localStorage.getItem("aufnahme-verarbeitet") || "{}"));
  const merkEintrag = Object.entries(merker).find(([k]) => k.startsWith("WhatsApp Image 2026-10-06 at 08.15.jpg|"));
  ok("(2) Das Gedächtnis dieses Rechners kennt die Datei als „ARBEIT“ mit Kennung der Arbeit", !!merkEintrag && merkEintrag[1].ziel === "ARBEIT" && merkEintrag[1].zielId === arbeit.id, JSON.stringify(merker).slice(0, 160));
  ok("(2) Die Datei im Eingangsordner wurde nicht angefasst (Attrappe kennt weiter 5 Dateien)", (await p.evaluate(() => window.__eingangDateienVorhanden().length)) === 5);
  const zielZahl = await p.locator('[data-aufnahme-zielspalte="ARBEIT"]').innerText();
  ok("(2) Zielspalte „Arbeit → Backlog“ zählt 1 heute", /\b1\s*$/.test(zielZahl.trim()), zielZahl.replace(/\n/g, " · "));

  /* (3) Durchblättern: Notiz, Anlage, Taste 2 = To-do */
  await inAufnahme(p, "BLAETTERN");
  const nr = await p.locator("[data-aufnahme-nr]").innerText();
  ok("(3) Durchblättern zeigt „Nr. 1 von 3“", /Nr\. 1 von 3/.test(nr), nr);
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(250);
  const gross = await p.locator("[data-aufnahme-gross]").getAttribute("data-aufnahme-gross");
  ok("(3) Pfeil rechts blättert zur zweiten Karte (09:30 Typenschild)", /IMG_20261006_0930/.test(gross || "") && /Nr\. 2 von 3/.test(await p.locator("[data-aufnahme-nr]").innerText()), gross);
  await p.locator('input[aria-label="Was ist zu sehen"]').fill("Typenschild SEW R47 fotografieren lassen");
  await p.locator('select[aria-label="Anlage"]').selectOption("B2");
  await p.locator('input[aria-label="Was ist zu sehen"]').blur();
  await p.evaluate(() => document.activeElement && document.activeElement.blur()); // Fokus raus aus dem Feld
  await p.keyboard.press("2");
  await p.waitForTimeout(1500);
  const todoDialog = p.locator('[role="dialog"][aria-label="To-do erteilen"]');
  const titel = await todoDialog.locator('input[aria-label="Aufgabe"]').inputValue().catch(() => "");
  ok("(3) Taste 2 öffnet „To-do erteilen“ mit der Notiz als Aufgabe", (await todoDialog.count()) === 1 && titel === "Typenschild SEW R47 fotografieren lassen", titel);
  await todoDialog.getByRole("button", { name: /To-do (erteilen|speichern)/ }).first().click().catch(async () => { await todoDialog.getByRole("button", { name: /Speichern|Erteilen/ }).first().click(); });
  await p.waitForTimeout(900);
  const nach3 = await gespeichert(p);
  const todo = nach3.find((e) => e.category === "TODO");
  ok("(3) To-do gespeichert: mit Foto-Verweis und Bemerkung „Anlage: B2“", !!todo && Array.isArray(todo.fotos) && todo.fotos.length === 1 && /Anlage: B2/.test(todo.bemerkung || ""), JSON.stringify(todo && { fotos: todo.fotos, bemerkung: todo.bemerkung }));
  ok("(3) Fotos/-Ordner: Handy-Foto + Arbeit + To-do = 3 Dateien", (await p.evaluate(() => window.__fotoDateien())).length === 3);
  // Roberto 07.10.: „beim Anklicken des To-dos wird das Bild nicht angezeigt" -> der To-do-Dialog zeigt den Foto-Bereich
  await p.getByRole("button", { name: /^Berichte/ }).first().click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: "To-do", exact: true }).first().click(); await p.waitForTimeout(500);
  await p.getByText("Typenschild SEW R47 fotografieren lassen").first().click(); await p.waitForTimeout(700);
  const todoDialogBild = p.locator('[role="dialog"][aria-label="To-do bearbeiten"]');
  const bildImDialog = await todoDialogBild.locator("img").evaluateAll((l) => l.map((i) => i.naturalWidth > 0));
  ok("(3) Das gespeicherte To-do zeigt im Dialog sein Foto (geladen) samt ✕ zum Entfernen", (await todoDialogBild.count()) === 1 && bildImDialog.length === 1 && bildImDialog[0] && (await todoDialogBild.getByRole("button", { name: "Foto 1 entfernen" }).count()) === 1, `Bilder: ${JSON.stringify(bildImDialog)}`);
  await todoDialogBild.getByRole("button", { name: "Abbrechen", exact: true }).click(); await p.waitForTimeout(300);
  await inAufnahme(p, "BLAETTERN");
  ok("(3) Die Ansicht springt weiter: „Nr. … von 2“", /von 2/.test(await p.locator("[data-aufnahme-nr]").innerText()));

  /* (4) Handy-Aufnahme -> Zettel */
  await p.locator("[data-aufnahme-streifen] button").first().click();
  await p.waitForTimeout(250);
  ok("(4) Erste Karte = die Handy-Aufnahme (07:42)", /aufn-handy-1/.test((await p.locator("[data-aufnahme-gross]").getAttribute("data-aufnahme-gross")) || ""));
  const vorschlag = await p.locator('[data-aufnahme-grossziele] button[data-aufnahme-ziel="ARBEIT"]').evaluate((b) => getComputedStyle(b).boxShadow);
  ok("(4) Der Vorschlag vom Handy (Arbeit) ist am Ziel-Knopf hervorgehoben", vorschlag && vorschlag !== "none", vorschlag);
  await p.locator('[data-aufnahme-grossziele] button[data-aufnahme-ziel="ZETTEL"]').click();
  await p.waitForTimeout(900);
  const nach4 = await gespeichert(p);
  const zettel = nach4.find((e) => e.category === "NOTIZ");
  const aufn = nach4.find((e) => e.id === "aufn-handy-1");
  ok("(4) Zettel mit Notiztext und DEMSELBEN Foto-Verweis (keine zweite Datei), für alle sichtbar",
    !!zettel && zettel.note === "Kabelkanal B2 offen, Deckel fehlt" && zettel.fotos && zettel.fotos[0].datei === "foto-handy.jpg" && zettel.sichtbar === "alle" && (await p.evaluate(() => window.__fotoDateien())).length === 3,
    JSON.stringify(zettel && { note: zettel.note, fotos: zettel.fotos, sichtbar: zettel.sichtbar }));
  ok("(4) Die Aufnahme steht auf done · ziel ZETTEL · zielId = Zettel, bleibt im Bestand (Tagesfilm)", !!aufn && aufn.status === "done" && aufn.ziel === "ZETTEL" && aufn.zielId === zettel.id && !!aufn.sortiertAm, JSON.stringify(aufn && { status: aufn.status, ziel: aufn.ziel }));

  /* (5) Abbrechen hinterlässt nichts */
  ok("(5) Vorbereitung: noch 1 Karte (11:30 Lieferschein)", /Nr\. 1 von 1/.test(await p.locator("[data-aufnahme-nr]").innerText()));
  await p.keyboard.press("1");
  await p.waitForTimeout(1500);
  ok("(5) Taste 1 öffnet den Arbeit-Dialog", (await p.getByText("Neue Arbeit – aus der Aufnahme").count()) === 1);
  await p.locator('button[aria-label="Schließen"]').last().click();
  await p.waitForTimeout(500);
  ok("(5) Abbrechen: Karte noch da, keine neue Datei im Fotos/-Ordner, kein Gedächtnis-Eintrag",
    (await p.locator("[data-aufnahme-karte], [data-aufnahme-gross]").count()) >= 1 && (await p.evaluate(() => window.__fotoDateien())).length === 3 && !Object.keys(await p.evaluate(() => JSON.parse(localStorage.getItem("aufnahme-verarbeitet") || "{}"))).some((k) => k.startsWith("WhatsApp Image 2026-10-06 at 11.30")));

  /* (8) Akte: ohne Anlage Hinweis, mit Anlage Eintrag */
  await p.locator('select[aria-label="Anlage"]').selectOption("");
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press("5");
  await p.waitForTimeout(500);
  const hinweis = await p.locator('[role="alert"], .no-print').filter({ hasText: /braucht das Bild eine Anlage/ }).count();
  ok("(8) Akte ohne Anlage: Hinweis statt Eintrag", hinweis >= 1 && (await gespeichert(p)).filter((e) => e.category === "AUFNAHME").length === 1);
  await p.locator('select[aria-label="Anlage"]').selectOption("TS480");
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press("5");
  await p.waitForTimeout(1800);
  const nach8 = await gespeichert(p);
  const akte = nach8.find((e) => e.category === "AUFNAHME" && e.ziel === "AKTE");
  ok("(8) Akte mit Anlage TS480: AUFNAHME-Eintrag done · AKTE · quelle pc · Foto geschrieben · Aufnahmezeit = Dateizeit 11:30",
    !!akte && akte.status === "done" && akte.name === "TS480" && akte.quelle === "pc" && akte.fotos && akte.fotos.length === 1 && /T09:30:00/.test(akte.zeit) && (await p.evaluate(() => window.__fotoDateien())).length === 4,
    JSON.stringify(akte && { name: akte.name, zeit: akte.zeit, fotos: akte.fotos }));
  ok("(8) Alles sortiert: Durchblättern meldet es", (await p.locator("[data-aufnahme-leer]").count()) === 1 && /Alles sortiert/.test(await p.locator("[data-aufnahme-leer]").innerText()));
  // Anlagen-Akte TS480 zeigt das Bild (über den Backlog-Weg: Akte-Knopf an der Arbeit)
  await p.getByRole("button", { name: /^Berichte/ }).first().click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Backlog", exact: true }).first().click(); await p.waitForTimeout(500);
  await p.locator('button[title="Anlagen-Akte öffnen"]').first().click().catch(() => {});
  await p.waitForTimeout(600);
  const akteBilder = await p.locator("[data-akte-bilder] img").count();
  ok("(8) Die Anlagen-Akte TS480 zeigt den Abschnitt „Bilder aus der Aufnahme“ mit dem Bild", akteBilder === 1, `${akteBilder} Bild(er)`);
  await p.locator('button[aria-label="Schließen"]').last().click();
  await p.waitForTimeout(300);

  /* (7) Tagesfilm */
  await inAufnahme(p, "FILM");
  const filmZahl = await p.locator("[data-aufnahme-film-zahl]").getAttribute("data-aufnahme-film-zahl");
  const filmKarten = await p.locator("[data-aufnahme-film] [data-aufnahme-karte]").count();
  const blass = await p.locator("[data-aufnahme-film] [data-aufnahme-karte][data-aufnahme-sortiert]").count();
  ok("(7) Tagesfilm heute: 4 Aufnahmen (Handy, zwei Dateien, der Akte-Eintrag ersetzt seine Datei) - alle sortiert, blass mit Ziel", filmZahl === "4" && filmKarten === 4 && blass === 4, `${filmZahl} / ${filmKarten} Karten / ${blass} sortiert`);
  const filmText = await p.locator("[data-aufnahme-film]").innerText();
  ok("(7) Stundenraster 07:00 · 08:00 · 09:00 · 11:00 und Ziele lesbar", /07:00/.test(filmText) && /08:00/.test(filmText) && /09:00/.test(filmText) && /11:00/.test(filmText) && /Pinnwand-Zettel · sortiert/.test(filmText) && /Arbeit → Backlog · sortiert/.test(filmText), filmText.replace(/\n/g, " ").slice(0, 200));
  ok("(1-8) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  await ctx.close();

  /* (6) Weg damit + Neuladen */
  {
    const w = await start(browser, { entries: [] });
    await inAufnahme(w.p);
    await w.p.waitForFunction(() => document.querySelectorAll("[data-aufnahme-karte]").length === 3, null, { timeout: 6000 }).catch(() => {});
    const karte = w.p.locator("[data-aufnahme-karte]", { hasText: "11:30" });
    await karte.locator('button[data-aufnahme-ziel="WEG"]').click();
    await w.p.waitForTimeout(400);
    ok("(6) „Weg damit“ an einer Datei: Karte weg, Zählkreis 2, kein Bestätigungsdialog nötig", (await w.p.locator("[data-aufnahme-karte]").count()) === 2 && (await w.p.locator('[data-hauptbereich-zahl="AUFNAHME"]').innerText()).trim() === "2");
    const merker6 = await w.p.evaluate(() => JSON.parse(localStorage.getItem("aufnahme-verarbeitet") || "{}"));
    const weg = Object.entries(merker6).find(([k]) => k.startsWith("WhatsApp Image 2026-10-06 at 11.30"));
    ok("(6) Gedächtnis: ziel WEG mit Zeitstempel; die Datei selbst bleibt im Ordner", !!weg && weg[1].ziel === "WEG" && !!weg[1].am && (await w.p.evaluate(() => window.__eingangDateienVorhanden().length)) === 5);
    await w.p.reload();
    await w.p.waitForTimeout(900);
    await w.p.evaluate(async () => { window.__wkSharedTest.adoptFolder(window.__mockOrdnerHandle); if (window.__wkEingangTest) window.__wkEingangTest.adopt(window.__eingangHandle); });
    await w.p.waitForTimeout(700);
    await inAufnahme(w.p);
    await w.p.waitForFunction(() => document.querySelectorAll("[data-aufnahme-karte]").length === 2, null, { timeout: 6000 }).catch(() => {});
    ok("(6) Nach dem Neuladen bleibt die Datei weg (Schlüssel Name|Größe|Zeit)", (await w.p.locator("[data-aufnahme-karte]").count()) === 2);
    ok("(6) Keine Skriptfehler", w.fehler.length === 0, w.fehler.slice(0, 2).join(" | "));
    await w.ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
