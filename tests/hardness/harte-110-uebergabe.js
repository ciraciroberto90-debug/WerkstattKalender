// Härtetest 110: ÜBERGABE-MAPPE AN DIE VERTRETUNG (Roll-out 69, Roberto 09.10.:
// „listet alle von mir ausgewählten Punkte auf - offene Störungen, To-dos,
// Backlog mit Fotos, Notizen zum Eintragen; muss digital existieren und zum
// Ausdrucken sein, mit Abhak-Funktion“ - Wahl: Mappe ohne Bemerkungsspalte
// mit größeren Bildern, dazu Kompakt-Checkliste, digital mit Live-Haken).
//
//   (1) Berichte zeigt die Kachel „Übergabe“; „Neue Mappe“ legt einen Eintrag
//       UEBERGABE in der gemeinsamen Datei an (Titel, Zeitraum, Vertreter).
//   (2) „Punkte wählen“ bietet alles Offene aus Störungen, To-do, Backlog und
//       Pinnwand; vier Punkte übernommen = vier Schnappschüsse mit Text,
//       Anlage, Frist und Foto-Verweis - das Bild erscheint in der Liste.
//   (3) „+ Notiz“ legt einen freien Punkt an; Haken schreibt wer/wann in die
//       Datei und zählt den Fortschritt; Haken weg = wieder offen.
//   (4) Ursprung im Cockpit erledigt (To-do done, Störung behoben) -> die Mappe
//       hakt von selbst ab („automatisch“), das Kästchen ist nicht klickbar.
//   (5) Drucken „Mappe“ (Vorlage A, Roberto 09.10.): Kopf nur oben, dann je
//       Woche ein Terminblock Mo–Fr AUTOMATISCH aus dem Kalender (PitStop/R+I,
//       Termine, To-dos mit Von/Bis, Arbeiten „geplant für“, Planungs-Notizen),
//       darunter EINE Aufgabenliste nach Dringlichkeit mit den gewählten Punkten
//       ohne festes Datum, ganz am Ende das Notizfeld. Alt: Blatt mit Kopf, fünf Abschnitten, Kästchen je Punkt
//       (angehakt wo erledigt), Bilder geladen, keine Bemerkungsspalte.
//       Drucken „kompakt“: eine Zeile je Punkt, Bilder als nummerierter Anhang.
//   (6) Neu während der Vertretung: Zeile landet in der Datei und auf dem Blatt.
//   (7) Planungs-Notizen (Roberto 09.10.: „sonst muss ich es doppelt schreiben“):
//       die Auswahl bietet die Notizen ab heute mit Person und Tag; im Notiz-
//       Dialog der Planung öffnet „To-do daraus erstellen“ den To-do-Dialog
//       vorbelegt (Text, Person, Frist) - Speichern legt das To-do an und
//       ERSETZT die Notiz: in der Planungszelle steht jetzt ein To-do-Chip
//       (Roberto 09.10.). Oben rechts neben „Backlog“ der Knopf „To-do“ mit
//       Fenster der offenen To-dos.
// Rot-Nachweis: gegen den Bau vor dem 09.10. (APP_PFAD) gibt es keine Kachel
// „Übergabe“ - (1) und alles danach ist rot.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const JETZT = new Date("2026-10-09T10:00:00");
const HEUTE = "2026-10-09";

const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }, { id: "a2", name: "B2", role: "takt" }], riItems: [], team: [{ name: "A. Richter", rolle: "mech" }, { name: "T Balles", rolle: "mech" }] }; // Team wie im Zahnrad: name + rolle
const entriesStart = [
  { id: "todo-1", date: HEUTE, category: "TODO", name: "Ölstand prüfen, DTE 25 nachfüllen", status: "offen", von: "2026-10-12", bis: "2026-10-14", bemerkung: "Anlage VSM1", fotos: [{ datei: "foto-todo.jpg", wer: "RC", ts: "2026-10-08T06:00:00.000Z" }] },
  { id: "todo-2", date: HEUTE, category: "TODO", name: "Prüfprotokoll Hebebühne an BG", status: "offen", bis: "2026-10-16" },
  { id: "arb-1", date: HEUTE, category: "ARBEIT", name: "OF320", status: "open", note: "Brennerdüsen tauschen (Teile Schrank 2)", prio: "hoch", geplant: "KW 42" },
  { id: "notiz-1", date: HEUTE, category: "NOTIZ", name: "R. Ciraci", status: "open", note: "Lieferung Hansa annehmen, Lieferschein Ordner Einkauf", zeit: "2026-10-09T07:00:00.000Z", farbe: "gelb", sichtbar: "verwalter", konto: "R. Ciraci" },
  // Planungs-Notizen: eine von heute (T Balles), eine von gestern (gehört nicht in die Übergabe)
  { id: "pn-1", date: HEUTE, category: "PLANNOTIZ", name: "T Balles", note: "Treppenhaus 1 (Zentrale) Griffe hängen teilweise an jeder Türe", verfasser: "R. Ciraci" },
  { id: "pn-alt", date: "2026-10-08", category: "PLANNOTIZ", name: "T Balles", note: "gestern erledigt", verfasser: "R. Ciraci" },
  // Für (7): Notiz am Mittwoch 07.10. - Wochentage, damit die Planungszellen 07./08.10. sichtbar sind (10./11.10. sind Wochenende)
  { id: "pn-2", date: "2026-10-07", category: "PLANNOTIZ", name: "T Balles", note: "Brückentor Flexlift Wartung", verfasser: "R. Ciraci" },
];
const stoerungenStart = [
  { id: "s-1", nr: 412, date: HEUTE, schicht: "Früh", anlage: "TS480", stoerung: "Leck Hydraulik, Pfütze unter Aggregat", nochZuTun: "Schlauch kommt Do., Einbau mit Hansa", offen: true, ausfallzeit: 45, melder: "T. Balles", gemeldetAt: HEUTE + "T06:10:00.000Z" },
  { id: "s-2", nr: 409, date: "2026-10-07", schicht: "Spät", anlage: "B2", stoerung: "Band unrund", offen: false, behobenAt: "2026-10-07T14:00:00.000Z", ausfallzeit: 30, melder: "T. Balles" },
];

async function start(browser, { entries = entriesStart, stoerungen = stoerungenStart } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.clock.setFixedTime(JETZT);
  await p.addInitScript(({ e, s, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-name", "M. Weber");
    const bild = (farbe, text) => new Promise((resolve) => {
      const cv = document.createElement("canvas"); cv.width = 1200; cv.height = 800;
      const g = cv.getContext("2d"); g.fillStyle = farbe; g.fillRect(0, 0, 1200, 800);
      g.fillStyle = "#fff"; g.font = "bold 90px sans-serif"; g.fillText(text, 80, 420);
      cv.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    });
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
    window.__mockOrdnerHandle = ordnerAus(wurzel);
    window.__fotoAnlegen = async () => { wurzel.dirs.get("Fotos").files.set("foto-todo.jpg", await bild("#3A4756", "Ölstand")); };
    // Druckfenster: print() stummschalten, damit der Kopflos-Browser nicht hängt
    const oeffne = window.open.bind(window);
    window.open = (...a) => { const w = oeffne(...a); if (w) { try { w.print = () => {}; } catch (e) { /* egal */ } } return w; };
  }, { e: entries, s: stoerungen, c: config });
  await p.goto(APP);
  await p.waitForTimeout(900);
  await p.evaluate(async () => { await window.__fotoAnlegen(); window.__wkSharedTest.adoptFolder(window.__mockOrdnerHandle); });
  await p.waitForTimeout(600);
  return { p, ctx, fehler };
}
const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
const mappeAus = async (p) => (await gespeichert(p)).find((e) => e.category === "UEBERGABE");
const inUebergabe = async (p) => {
  await p.locator('button[data-hauptbereich="BERICHTE"]').click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Mappe für die Vertretung/ }).first().click();
  await p.waitForTimeout(400);
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const { p, ctx, fehler } = await start(browser);

  /* (1) Kachel + neue Mappe */
  await p.locator('button[data-hauptbereich="BERICHTE"]').click();
  await p.waitForTimeout(400);
  const kachel = p.getByRole("button", { name: /Mappe für die Vertretung/ }); // die Kachel, nicht der Reiter im Untermenü
  ok("(1) Berichte zeigt die Kachel „Übergabe“ und den Reiter im Untermenü", (await kachel.count()) === 1 && (await p.getByRole("button", { name: /^Übergabe$/ }).count()) === 1);
  await kachel.first().click();
  await p.waitForTimeout(400);
  await p.locator("[data-uebergabe-neu]").click();
  await p.locator('input[aria-label="Titel der Mappe"]').fill("Vertretung 13.–24.10.");
  await p.locator('input[aria-label="Von"]').fill("2026-10-13");
  await p.locator('input[aria-label="Bis"]').fill("2026-10-24");
  await p.locator('input[aria-label="Vertreter"]').fill("A. Richter");
  await p.locator("[data-uebergabe-speichern]").click();
  await p.waitForTimeout(600);
  const m1 = await mappeAus(p);
  ok("(1) „Neue Mappe“: Eintrag UEBERGABE mit Titel, Zeitraum, Vertreter, Ersteller M. Weber, offen, ohne Punkte", !!m1 && m1.name === "Vertretung 13.–24.10." && m1.von === "2026-10-13" && m1.bis === "2026-10-24" && m1.vertreter === "A. Richter" && m1.ersteller === "M. Weber" && m1.status === "open" && Array.isArray(m1.punkte) && m1.punkte.length === 0, JSON.stringify(m1 && { name: m1.name, vertreter: m1.vertreter, ersteller: m1.ersteller }));
  ok("(1) Kopf zeigt die Mappe mit 0 von 0 erledigt", (await p.locator("[data-uebergabe-kopf]").innerText()).includes("Vertretung 13.–24.10.") && (await p.locator("[data-uebergabe-stand]").getAttribute("data-uebergabe-stand")) === "0/0");

  /* (2) Punkte wählen */
  await p.locator("[data-uebergabe-waehlen]").click();
  await p.waitForTimeout(300);
  const angebot = await p.locator("[data-uebergabe-wahl-punkt]").evaluateAll((l) => l.map((i) => i.getAttribute("data-uebergabe-wahl-punkt")));
  ok("(2) Auswahl bietet genau das Offene: 1 Störung (behobene fehlt), 2 To-dos, 1 Backlog-Arbeit, 1 Planungs-Notiz ab heute (gestrige fehlt), 1 Pinnwand-Zettel", angebot.length === 6 && angebot.includes("STOERUNG:s-1") && !angebot.includes("STOERUNG:s-2") && angebot.includes("TODO:todo-1") && angebot.includes("TODO:todo-2") && angebot.includes("ARBEIT:arb-1") && angebot.includes("PLANNOTIZ:pn-1") && !angebot.includes("PLANNOTIZ:pn-alt") && !angebot.includes("PLANNOTIZ:pn-2") && angebot.includes("NOTIZ:notiz-1"), angebot.join(","));
  // Filter (Roberto 09.10., 130 Backlog-Zeilen): Suchwort, Art, Anlage, Person, nur hohe Prio
  await p.locator("[data-uebergabe-filter-text]").fill("ölstand");
  await p.waitForTimeout(200);
  const nachText = await p.locator("[data-uebergabe-wahl-punkt]").evaluateAll((l) => l.map((i) => i.getAttribute("data-uebergabe-wahl-punkt")));
  await p.locator("[data-uebergabe-filter-text]").fill("");
  await p.locator('[data-uebergabe-filter-art="ARBEIT"]').click();
  const nachArt = await p.locator("[data-uebergabe-wahl-punkt]").evaluateAll((l) => l.map((i) => i.getAttribute("data-uebergabe-wahl-punkt")));
  await p.locator('[data-uebergabe-filter-art="ALLE"]').click();
  await p.locator("[data-uebergabe-filter-anlage]").selectOption("TS480");
  const nachAnlage = await p.locator("[data-uebergabe-wahl-punkt]").evaluateAll((l) => l.map((i) => i.getAttribute("data-uebergabe-wahl-punkt")));
  await p.locator("[data-uebergabe-filter-anlage]").selectOption("");
  await p.locator("[data-uebergabe-filter-wer]").selectOption("T Balles");
  const nachWer = await p.locator("[data-uebergabe-wahl-punkt]").evaluateAll((l) => l.map((i) => i.getAttribute("data-uebergabe-wahl-punkt")));
  await p.locator("[data-uebergabe-filter-wer]").selectOption("");
  await p.locator("[data-uebergabe-filter-prio]").check();
  const nachPrio = await p.locator("[data-uebergabe-wahl-punkt]").evaluateAll((l) => l.map((i) => i.getAttribute("data-uebergabe-wahl-punkt")));
  await p.locator("[data-uebergabe-filter-prio]").uncheck();
  ok("(2) Filter: Suchwort „ölstand“ → nur das To-do; Art Backlog → nur die Arbeit; Anlage TS480 → nur die Störung; Person T Balles → nur die Planungs-Notiz (die Störung meldete „T. Balles“ mit Punkt); nur hohe Prio → nur die Arbeit; Zähler „6 von 6“ ohne Filter",
    nachText.join() === "TODO:todo-1" && nachArt.join() === "ARBEIT:arb-1" && nachAnlage.join() === "STOERUNG:s-1" && nachWer.join() === "PLANNOTIZ:pn-1" && nachPrio.join() === "ARBEIT:arb-1" && (await p.locator("[data-uebergabe-filter-zahl]").innerText()) === "6 von 6", JSON.stringify({ nachText, nachArt, nachAnlage, nachWer, nachPrio }));
  await p.locator('[data-uebergabe-filter-art="TODO"]').click();
  await p.locator('[data-uebergabe-alle-waehlen="TODO"]').click();
  await p.locator('[data-uebergabe-filter-art="ALLE"]').click();
  ok("(2) „alle 2 wählen“ bei To-dos hakt beide an; der Übernehmen-Knopf zählt 2", (await p.locator('[data-uebergabe-wahl-punkt="TODO:todo-1"]').isChecked()) && (await p.locator('[data-uebergabe-wahl-punkt="TODO:todo-2"]').isChecked()) && /2 Punkt/.test(await p.locator("[data-uebergabe-wahl-uebernehmen]").innerText()));
  await p.locator('[data-uebergabe-wahl-punkt="TODO:todo-2"]').uncheck();
  for (const k of ["STOERUNG:s-1", "ARBEIT:arb-1", "PLANNOTIZ:pn-1", "NOTIZ:notiz-1"]) await p.locator(`[data-uebergabe-wahl-punkt="${k}"]`).check();
  await p.locator("[data-uebergabe-wahl-uebernehmen]").click();
  await p.waitForTimeout(600);
  const m2 = await mappeAus(p);
  const pk = (k) => (m2 ? m2.punkte.find((x) => x.key === k) : null);
  ok("(2) Fünf Punkte als Schnappschuss in der Datei: Störung mit Nr 412, Anlage TS480, Text + „Noch zu tun“; To-do mit Frist und Foto-Verweis; Backlog mit Anlage OF320, KW 42, „hohe Prio“; Planungs-Notiz mit Person T Balles und Tag; Zettel-Text",
    !!m2 && m2.punkte.length === 5 && pk("PLANNOTIZ:pn-1").zusatz === "T Balles" && pk("PLANNOTIZ:pn-1").bis === HEUTE && /Treppenhaus 1/.test(pk("PLANNOTIZ:pn-1").text) && pk("STOERUNG:s-1").nr === "412" && pk("STOERUNG:s-1").anlage === "TS480" && /Leck Hydraulik/.test(pk("STOERUNG:s-1").text) && /Noch zu tun: Schlauch/.test(pk("STOERUNG:s-1").text)
    && pk("TODO:todo-1").von === "2026-10-12" && pk("TODO:todo-1").bis === "2026-10-14" && pk("TODO:todo-1").fotos.length === 1 && pk("TODO:todo-1").fotos[0].datei === "foto-todo.jpg"
    && pk("ARBEIT:arb-1").anlage === "OF320" && pk("ARBEIT:arb-1").bis === "KW 42" && pk("ARBEIT:arb-1").zusatz === "hohe Prio" && /Lieferung Hansa/.test(pk("NOTIZ:notiz-1").text),
    JSON.stringify(m2 && m2.punkte.map((x) => x.key)));
  await p.waitForFunction(() => { const i = document.querySelector("[data-uebergabe-bild]"); return !!i && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
  ok("(2) Das Foto des To-dos ist in der Mappe sichtbar (geladen), 100 × 72 px", await p.evaluate(() => { const i = document.querySelector("[data-uebergabe-bild]"); const r = i && i.getBoundingClientRect(); return !!i && i.naturalWidth > 0 && r.width >= 96 && r.height >= 68; })); // 100 × 72 außen, 1 px Rand
  // Anklicken -> Großansicht (Roberto 09.10.), Escape schließt
  await p.locator("[data-uebergabe-bild]").first().click();
  await p.waitForTimeout(300);
  const gross = p.locator('[role="dialog"][aria-label="Foto-Großansicht"]');
  ok("(2) Klick auf das Bild öffnet die Großansicht mit dem Foto", (await gross.count()) === 1 && await gross.locator("img").evaluate((i) => i.naturalWidth > 0).catch(() => false));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  ok("(2) Escape schließt die Großansicht", (await gross.count()) === 0);
  ok("(2) Die Liste führt fünf Punkte in fünf Abschnitten, alle offen", (await p.locator("[data-uebergabe-punkt]").count()) === 5 && (await p.locator('[data-uebergabe-erledigt="offen"]').count()) === 5);

  /* (3) Notiz + Haken */
  await p.locator('input[aria-label="Notiz für die Mappe"]').fill("Zählerstände Druckluft montags eintragen");
  await p.locator("[data-uebergabe-notiz-dazu]").click();
  await p.waitForTimeout(500);
  const m3 = await mappeAus(p);
  ok("(3) „+ Notiz“: sechster Punkt der Art FREI mit dem Text", !!m3 && m3.punkte.length === 6 && m3.punkte[5].art === "FREI" && m3.punkte[5].text === "Zählerstände Druckluft montags eintragen");
  await p.locator('[data-uebergabe-punkt="TODO:todo-1"] input[type="checkbox"]').check();
  await p.waitForTimeout(500);
  const m3b = await mappeAus(p);
  const h = m3b.punkte.find((x) => x.key === "TODO:todo-1").erledigt;
  ok("(3) Haken am To-do-Punkt: erledigt {wer M. Weber, am heute} in der Datei, Fortschritt 1/6, Zeile als „hand“ markiert", !!h && h.wer === "M. Weber" && String(h.am).startsWith(HEUTE) && (await p.locator("[data-uebergabe-stand]").getAttribute("data-uebergabe-stand")) === "1/6" && (await p.locator('[data-uebergabe-punkt="TODO:todo-1"]').getAttribute("data-uebergabe-erledigt")) === "hand", JSON.stringify(h));
  await p.locator('[data-uebergabe-punkt="TODO:todo-1"] input[type="checkbox"]').uncheck();
  await p.waitForTimeout(500);
  ok("(3) Haken weg: Punkt wieder offen, 0/6", (await mappeAus(p)).punkte.find((x) => x.key === "TODO:todo-1").erledigt === null && (await p.locator("[data-uebergabe-stand]").getAttribute("data-uebergabe-stand")) === "0/6");
  ok("(1-3) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  const mappeStand = await mappeAus(p);
  await ctx.close();

  /* (4) Automatisch erledigt + (5) Druck + (6) Neu - mit erledigtem Ursprung */
  {
    // Kalender im Zeitraum: ein PitStop (Mi 14.10.) und ein erledigter R+I (Mo 19.10.) - nur die gehören in den Terminblock
    const entries2 = entriesStart.map((e) => (e.id === "arb-1" ? { ...e, status: "done", erledigtAm: "2026-10-15" } : e)).concat([mappeStand,
      { id: "k1", date: "2026-10-14", category: "TPM", name: "TS480", status: "open", wer: "GG", uhrzeit: "08:00" },
      { id: "k2", date: "2026-10-19", category: "RI", name: "Wasserrundgang", status: "done", wer: "J" },
      { id: "k3", date: "2026-10-11", category: "TPM", name: "B2", status: "open" }]);
    const stoer2 = stoerungenStart.map((s) => (s.id === "s-1" ? { ...s, offen: false, behobenAt: "2026-10-16T09:00:00.000Z" } : s));
    const w = await start(browser, { entries: entries2, stoerungen: stoer2 });
    await inUebergabe(w.p);
    const arten = await w.p.locator("[data-uebergabe-punkt]").evaluateAll((l) => Object.fromEntries(l.map((i) => [i.getAttribute("data-uebergabe-punkt"), i.getAttribute("data-uebergabe-erledigt")])));
    ok("(4) Arbeit erledigt und Störung behoben: beide Punkte „automatisch“ abgehakt, die anderen offen, Stand 2/6", arten["ARBEIT:arb-1"] === "automatisch" && arten["STOERUNG:s-1"] === "automatisch" && arten["TODO:todo-1"] === "offen" && arten["NOTIZ:notiz-1"] === "offen" && (await w.p.locator("[data-uebergabe-stand]").getAttribute("data-uebergabe-stand")) === "2/6", JSON.stringify(arten));
    ok("(4) Das automatische Kästchen ist nicht klickbar, die Zeile nennt den Grund „Störung behoben“", await w.p.locator('[data-uebergabe-punkt="STOERUNG:s-1"] input[type="checkbox"]').isDisabled() && /Störung behoben/.test(await w.p.locator('[data-uebergabe-punkt="STOERUNG:s-1"]').innerText()));

    /* (6) Neu während der Vertretung */
    await w.p.locator('input[aria-label="Neu während der Vertretung"]').fill("Kompressor 2 tropft, Dichtung bestellt");
    await w.p.keyboard.press("Enter");
    await w.p.waitForTimeout(500);
    const m6 = await mappeAus(w.p);
    ok("(6) „Neu während der Vertretung“: Zeile mit Text, wer, wann in der Datei und in der Liste", !!m6 && m6.neu.length === 1 && m6.neu[0].text === "Kompressor 2 tropft, Dichtung bestellt" && m6.neu[0].wer === "M. Weber" && /Kompressor 2 tropft/.test(await w.p.locator("[data-uebergabe-neu-liste]").innerText()));

    /* (5) Druck Mappe */
    await w.p.waitForFunction(() => { const i = document.querySelector("[data-uebergabe-bild]"); return !!i && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
    const [blatt] = await Promise.all([w.p.waitForEvent("popup"), w.p.locator('[data-uebergabe-drucken="mappe"]').click()]);
    await blatt.waitForTimeout(700);
    const bText = await blatt.locator("body").innerText();
    const bildOk = await blatt.evaluate(() => [...document.querySelectorAll("img")].some((i) => i.naturalWidth > 0));
    ok("(5) Blatt „Mappe“ (Vorlage A, Stand 10.10.): Kopf mit Titel, Zeitraum, Vertreter; Terminblöcke KW 42 (Di 13. – So 18.) und KW 43 (Mo 19. – Sa 24.) mit ALLEN Tagen Mo–So, NUR PitStop/R+I/Termine: PitStop TS480 08:00 am Mi 14.10., erledigter R+I am Mo 19.10.; PitStop B2 vom 11.10. liegt vor dem Zeitraum; keine To-do-Chips im Block",
      /Vertretung 13\.–24\.10\./.test(bText) && /13\.10\.2026 – 24\.10\.2026/.test(bText) && /A\. Richter/.test(bText) && /KW 42/.test(bText) && /KW 43/.test(bText) && (await blatt.locator("h4.block").count()) === 2 && (await blatt.locator(".tage tr").count()) === 12 && /Mi 14\.10\.[^\n]*08:00[^\n]*PitStop TS480/.test(bText) && /Mo 19\.10\.[^\n]*✓[^\n]*R\+I Wasserrundgang/.test(bText) && !/PitStop B2/.test(bText) && (await blatt.locator(".chip.td").count()) === 0 && (await blatt.locator(".tage tr.we").count()) === 3 && /Di 13\.10\./.test(bText) && /Sa 24\.10\./.test(bText) && !/Mo 12\.10\./.test(bText), bText.replace(/\n/g, " · ").slice(0, 1400));
    ok("(5) Blatt „Mappe“: darunter EINE Aufgabenliste nach Dringlichkeit mit ALLEN sechs Punkten je einmal (Störung zuerst, dann das To-do mit Zeitraum 12.–14.10., Backlog hohe Prio, Planungs-Notiz mit Person, Zettel, Notiz); zwei Kästchen angehakt; keine Spalte „Bemerkung“",
      (await blatt.locator(".liste tr").count()) === 6 && (await blatt.locator(".liste .k").count()) === 6 && (await blatt.locator(".liste .k.ok").count()) === 2 && (await blatt.locator(".liste tr").first().innerText()).includes("STÖR") && (await blatt.locator(".liste tr").nth(1).innerText()).includes("Ölstand") && /12\.10\.2026 – 14\.10\.2026/.test(await blatt.locator(".liste").innerText()) && /T Balles/.test(await blatt.locator(".liste").innerText()) && !/Bemerkung/.test(bText), (await blatt.locator(".liste").innerText()).replace(/\n/g, " · ").slice(0, 200));
    ok("(5) Blatt „Mappe“: das Foto des To-dos steht klein (48 px) in der Aufgabenzeile und ist geladen; „neu dazukam“ und das Notizfeld stehen EINMAL ganz am Ende", bildOk && (await blatt.locator(".liste img").first().evaluate((i) => i.style.height)) === "48px" && /Kompressor 2 tropft/.test(bText) && (await blatt.locator(".notizfeld").count()) === 1 && await blatt.evaluate(() => { const n = document.querySelector(".notizfeld"); const b = document.body; return !!n && n.getBoundingClientRect().top > [...b.querySelectorAll("table")].pop().getBoundingClientRect().top; }));
    await blatt.close();

    /* (5) Druck kompakt */
    const [blatt2] = await Promise.all([w.p.waitForEvent("popup"), w.p.locator('[data-uebergabe-drucken="kompakt"]').click()]);
    await blatt2.waitForTimeout(700);
    const kText = await blatt2.locator("body").innerText();
    ok("(5) Blatt „kompakt“: Terminblock Mo–So mit Kästchen je Tag (12 Tage), darunter sechs Aufgabenzeilen mit Kürzeln STÖR/TODO/BACK/PLAN/ZETTEL/NOTIZ, „Bild 1“ am To-do und Anhang mit Bild 1, zwei Kästchen angehakt",
      (await blatt2.locator(".tage tr").count()) === 12 && (await blatt2.locator(".tage .k").count()) === 12 && (await blatt2.locator(".liste tr").count()) === 6 && /STÖR/.test(kText) && /TODO/.test(kText) && /BACK/.test(kText) && /PLAN/.test(kText) && /ZETTEL/.test(kText) && /NOTIZ/.test(kText) && /Bild 1/.test(await blatt2.locator(".liste").innerText()) && (await blatt2.locator(".anhang img").count()) === 1 && (await blatt2.locator(".liste .k.ok").count()) === 2, kText.replace(/\n/g, " · ").slice(0, 220));
    await blatt2.close();
    ok("(4-6) Keine Skriptfehler", w.fehler.length === 0, w.fehler.slice(0, 2).join(" | "));
    await w.ctx.close();
  }

  /* (7) Planungs-Notiz -> To-do */
  {
    const w = await start(browser);
    await w.p.locator('button[data-hauptbereich="WERKSTATT"]').click();
    await w.p.waitForTimeout(400);
    await w.p.getByRole("button", { name: "Planung", exact: true }).first().click();
    await w.p.waitForTimeout(600);
    await w.p.getByRole("button", { name: /Brückentor Flexlift/ }).first().click();
    await w.p.waitForTimeout(400);
    ok("(7) Notiz-Dialog der Planung zeigt „To-do daraus erstellen“", (await w.p.locator("[data-notiz-todo]").count()) === 1 && /Notiz – T Balles, 07\.10\.2026/.test(await w.p.locator("body").innerText()));
    await w.p.locator("[data-notiz-todo]").click();
    await w.p.waitForTimeout(400);
    // Vorbelegung steckt in den Feldwerten (value), nicht im sichtbaren Text
    const vorbelegt = await w.p.evaluate(() => [...document.querySelectorAll("input, textarea, select")].map((i) => i.value).filter(Boolean));
    ok("(7) Der To-do-Dialog öffnet sich vorbelegt: Text als Titel, T Balles als Zuständiger, Von und Bis = 07.10.2026, Bemerkung nennt die Notiz", vorbelegt.some((v) => /^Brückentor Flexlift Wartung/.test(v)) && vorbelegt.includes("T Balles") && vorbelegt.filter((v) => v === "2026-10-07").length === 2 && vorbelegt.some((v) => /aus der Planungs-Notiz vom 07\.10\.2026/.test(v)), JSON.stringify(vorbelegt).slice(0, 200));
    // Mehrtägig (Roberto 09.10.): Bis auf den 08.10. setzen
    await w.p.locator('input[aria-label="Bis wann"]').fill("2026-10-08");
    await w.p.getByRole("button", { name: "Speichern", exact: true }).first().click();
    await w.p.waitForTimeout(600);
    const alle = await gespeichert(w.p);
    const todo = alle.find((e) => e.category === "TODO" && /Brückentor Flexlift/.test(e.name));
    ok("(7) Speichern: neues To-do mit Text, wer T Balles, von 07.10. bis 08.10.2026 (mehrtägig), offen - die Planungs-Notiz ist durch das To-do ersetzt, die andere Notiz bleibt", !!todo && todo.wer === "T Balles" && todo.von === "2026-10-07" && todo.bis === "2026-10-08" && todo.status === "offen" && !alle.some((e) => e.id === "pn-2") && alle.some((e) => e.id === "pn-1"), JSON.stringify(todo && { name: todo.name, wer: todo.wer, von: todo.von, bis: todo.bis }));
    const chips = await w.p.locator('[data-planzelle="T Balles|2026-10-07"]').innerText();
    ok("(7) In der Planungszelle von T Balles steht am 07.10. jetzt ein To-do-Chip (📋) statt der Notiz (📝)", (await w.p.locator(`[data-planzelle="T Balles|2026-10-07"] [data-plan-todo="${todo && todo.id}"]`).count()) === 1 && /📋 Brückentor/.test(chips) && !/📝/.test(chips), chips.replace(/\n/g, " · ").slice(0, 120));
    ok("(7) Mehrtägig: der Chip steht auch am 08.10., nicht am 09.10.; die Notiz vom 09.10. bleibt ein 📝", (await w.p.locator('[data-planzelle="T Balles|2026-10-08"] [data-plan-todo]').count()) === 1 && (await w.p.locator('[data-planzelle="T Balles|2026-10-09"] [data-plan-todo]').count()) === 0 && /📝 Treppenhaus 1/.test(await w.p.locator('[data-planzelle="T Balles|2026-10-09"]').innerText()));
    const knopf = w.p.locator("[data-planung-todos]");
    ok("(7) Oben rechts neben „Backlog“ steht „To-do (3)“ - die offenen To-dos", (await knopf.count()) === 1 && /To-do \(3\)/.test(await knopf.innerText()), await knopf.innerText());
    await knopf.click(); await w.p.waitForTimeout(400);
    ok("(7) Das To-do-Fenster listet die drei offenen To-dos mit Zuständigem und Zeitraum", (await w.p.locator("[data-planung-todo-zeile]").count()) === 3 && /für T Balles · 07\.10\.2026 – 08\.10\.2026/.test(await w.p.locator("[data-planung-todo-fenster]").innerText()));
    await knopf.click(); await w.p.waitForTimeout(200);
    await w.p.locator('button[data-hauptbereich="BERICHTE"]').click(); await w.p.waitForTimeout(300);
    await w.p.getByRole("button", { name: /Aufgaben – erteilt/ }).first().click(); await w.p.waitForTimeout(400); // die To-do-Kachel
    const listeText = await w.p.locator("body").innerText();
    ok("(7) Die To-do-Liste zeigt den Zeitraum „07.10.2026 – 08.10.2026“ statt nur „bis“", /07\.10\.2026 – 08\.10\.2026/.test(listeText), (listeText.match(/[^\n]*Brückentor[^\n]*/) || [""])[0].slice(0, 120));
    ok("(7) Keine Skriptfehler", w.fehler.length === 0, w.fehler.slice(0, 2).join(" | "));
    await w.ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
