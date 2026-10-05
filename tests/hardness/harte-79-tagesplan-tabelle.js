// Härtetest: TAGESPLAN ALS TABELLE (Robertos Wahl vom 05.10., Vorlage A1 geändert)
//
// Bis zum 04.10. zeigte der Tagesplan nur die Termine und hinter einem
// Personen-Menü ("Anwesende") die Punkte EINER Person - für den Werkstatt-
// Monitor zu unübersichtlich. Jetzt steht ALLES in einer Tabelle:
// Art · Anlage/Ort · Was · Uhrzeit · Wer · Erledigt, nach Schicht gruppiert
// (aus der Uhrzeit, sonst aus der Schicht der zugeteilten Person), innerhalb
// der Gruppe nach Uhrzeit, "ganztags" dahinter. Uhrzeit und Wer sind direkt
// in der Zeile änderbar; eine Zuteilung schreibt den Eintrag und steht damit
// auch in der Planung bei der Person.
//
//  (1) Tabelle statt Menü: Spaltenfolge, alle Arten (PitStop-Plan, Termin,
//      Arbeit, To-do, Notiz), Gruppen FRÜH (jetzt) / SPÄT, Sortierung nach
//      Uhrzeit, Erledigtes durchgestrichen, Zähler im Kopf, Abwesende grau.
//  (2) Zuteilung in der Zeile: PitStop-Punkt ohne Eintrag -> Wer wählen ->
//      Eintrag mit "wer" im Bestand; Planung zeigt ihn bei der Person und am
//      Wartungsplan-Chip; Wiederöffnen/Wegnehmen der Zuteilung.
//  (3) Uhrzeit in der Zeile: schreibt uhrzeit/uhrzeitBis, Zeile rückt in die
//      Zeitfolge, "jetzt"-Markierung bei laufender Uhrzeit.
//  (4) Haken je Art (Arbeit, To-do, Notiz, Termin, Plan-Punkt) schreibt den
//      Status, Zähler zählt mit, Haken lässt sich wieder öffnen.
//  (5) Klick auf Anlage/Ort öffnet den passenden Dialog.
//  (6) LESER: Tabelle da, keine Eingabefelder, Kästchen gesperrt.
//  (7) RECHTE-MATRIX: To-do "aus" -> keine To-do-Zeile; Planung "sehen" ->
//      Arbeit steht da, Kästchen gesperrt, kein Wer-Feld.
//  (8) Ohne Team: Tabelle da, Wer-Spalte ohne Auswahl ("niemand").
//
// Rot-Nachweis: gegen den Bau vor dem 05.10. (APP_PFAD) ist (1) rot - dort gibt
// es die Tabelle nicht, sondern das Menü "Anwesende wählen".
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};

const HEUTE = "2026-09-21"; // Montag, Frühschicht läuft (10 Uhr)
const team = [
  { name: "T. Balles", rolle: "mech" },   // keine Schicht eingetragen = Tagschicht -> Früh
  { name: "M. Kilic", rolle: "elek" },
  { name: "K. Wiesner", rolle: "mech" },
  { name: "A. Fischer", rolle: "mech" },
];
const eintraege = [
  { id: "s-kw", category: "SCHICHT", scope: "tag", name: "K. Wiesner", date: HEUTE, wert: "Spät" },
  { id: "s-af", category: "SCHICHT", scope: "tag", name: "A. Fischer", date: HEUTE, wert: "Urlaub" },
  { id: "te-mr", category: "TERMIN", date: HEUTE, name: "Morgenrunde", note: "Meisterbüro", status: "done", uhrzeit: "07:00" },
  { id: "a-heute", category: "ARBEIT", date: "2026-09-18", name: "KUKA II", status: "open", note: "Kettenschutz montieren", prio: "hoch", art: "mech", wer: "T. Balles", geplant: HEUTE, uhrzeit: "09:00", uhrzeitBis: "11:30" },
  { id: "a-morgen", category: "ARBEIT", date: "2026-09-18", name: "TS480", status: "open", note: "Folienabzug MORGEN nachstellen", prio: "ohne", art: "mech", wer: "T. Balles", geplant: "2026-09-22" },
  { id: "a-kw", category: "ARBEIT", date: "2026-09-18", name: "LTA2", status: "open", note: "Lichtschranke tauschen", prio: "ohne", art: "elek", wer: "K. Wiesner", geplant: HEUTE },
  { id: "t-heute", category: "TODO", date: "2026-09-15", name: "Ersatzteile B2 nachbestellen", wer: "T. Balles", bis: HEUTE, prio: "", bemerkung: "", status: "offen" },
  { id: "t-spaeter", category: "TODO", date: "2026-09-15", name: "Jahresplanung SPAETER", wer: "T. Balles", bis: "2026-10-05", prio: "", bemerkung: "", status: "offen" },
  { id: "n-tb", category: "PLANNOTIZ", date: HEUTE, name: "T. Balles", note: "LTA2 mit Wiesner abstimmen" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async ({ benutzer, rechte, ohneTeam } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
    await p.addInitScript(({ e, t, benutzer, rechte }) => {
      try {
        delete window.showOpenFilePicker; delete window.showSaveFilePicker;
        localStorage.setItem("bta-standort", "scheurich");
        localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
        localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
          tpmAnlagen: [], riItems: [], team: t,
          ...(benutzer ? { benutzer: [
            { name: "Chef", rolle: "verwalter", kennwortHash: "" },
            { name: "Bea", rolle: "bearbeiter", kennwortHash: "" },
            { name: "Lea", rolle: "leser", kennwortHash: "" },
          ] } : {}),
          ...(rechte ? { rechte } : {}),
        }));
        if (benutzer) localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
      } catch (err) {}
    }, { e: eintraege, t: ohneTeam ? [] : team, benutzer, rechte });
    await p.goto(APP);
    await p.waitForTimeout(1200);
    if (await p.locator("textarea").count()) { await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(300); }
    return { ctx, p, fehler };
  };
  const tabelle = (p) => p.locator("table[data-tagesplan-tabelle]");
  const zeilen = (p, art) => p.locator(art ? `tr[data-tagesplan-zeile="${art}"]` : "tr[data-tagesplan-zeile]");
  const zeileMit = (p, text) => p.locator("tr[data-tagesplan-zeile]", { hasText: text }).first();
  const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
  const stand = (p) => p.locator("[data-tagesplan-stand]").innerText().then((t) => t.replace(/\s+/g, " "));
  const reihenfolge = (p) => p.evaluate(() => [...document.querySelectorAll("tr[data-tagesplan-zeile], tr[data-tagesplan-gruppe]")].map((tr) => tr.dataset.tagesplanGruppe ? `#${tr.dataset.tagesplanGruppe}` : tr.querySelector("td:nth-child(3)").textContent.trim()));
  const pos = (folge, anfang) => folge.findIndex((x) => x.startsWith(anfang));

  /* ---- (1) Tabelle statt Menü ---- */
  const v = await seite();
  const p = v.p;
  ok("(1) Die Tabelle steht im Tagesplan, das alte Menü „Anwesende wählen“ ist weg",
    (await tabelle(p).count()) === 1 && (await p.locator('button[aria-label="Anwesende wählen"]').count()) === 0);
  const koepfe = await p.locator("table[data-tagesplan-tabelle] thead th").allInnerTexts();
  // Die Köpfe sind per CSS in Großbuchstaben - verglichen wird ohne Rücksicht auf die Schreibung
  ok("(1) Spaltenfolge: Art · Anlage / Ort · Was · Uhrzeit · Wer · (Erledigt)", koepfe.slice(0, 5).join("|").toLowerCase() === "art|anlage / ort|was|uhrzeit|wer" && koepfe.length === 6, koepfe.join("|"));
  const arten = await p.evaluate(() => [...document.querySelectorAll("tr[data-tagesplan-zeile]")].map((tr) => tr.dataset.tagesplanZeile));
  ok("(1) Alle Arten in EINER Tabelle: PitStop-Plan (Muster-Bestand), Termin, Arbeit, To-do, Notiz",
    arten.includes("TPM") && arten.includes("TERMIN") && arten.includes("ARBEIT") && arten.includes("TODO") && arten.includes("NOTIZ"), arten.join(","));
  const folge = await reihenfolge(p);
  const iMorgen = pos(folge, "Morgenrunde"), iKette = pos(folge, "Kettenschutz"), iLicht = pos(folge, "Lichtschranke"), iSpaet = folge.indexOf("#SPAET"), iFrueh = folge.indexOf("#FRUEH");
  ok("(1) Gruppen: FRÜH vor SPÄT; Morgenrunde 07:00 vor Kettenschutz 09:00 (beide FRÜH); K. Wiesners Arbeit (Spät, ohne Uhrzeit) unter SPÄT",
    iFrueh === 0 && iFrueh < iMorgen && iMorgen < iKette && iKette < iSpaet && iSpaet < iLicht, folge.join(" > "));
  const gruppenText = await p.locator("tr[data-tagesplan-gruppe]").allInnerTexts();
  ok("(1) Die laufende Schicht heißt „· jetzt“ (Frühschicht um 10 Uhr)", gruppenText.some((t) => /Frühschicht.*jetzt/i.test(t)), gruppenText.join(" | "));
  const morgenrunde = zeileMit(p, "Morgenrunde");
  const durchgestrichen = await morgenrunde.locator("td:nth-child(3)").evaluate((td) => getComputedStyle(td).textDecorationLine.includes("line-through"));
  ok("(1) Erledigter Termin bleibt durchgestrichen stehen; die kurze Notiz „Meisterbüro“ steht als Ort in Spalte 2", durchgestrichen && /Meisterbüro/.test(await morgenrunde.locator("td:nth-child(2)").innerText()));
  ok("(1) Uhrzeiten stehen als Text (07:00, 09:00 – 11:30, ganztags) - keine Eingabefelder, solange niemand klickt",
    /07:00/.test(await morgenrunde.locator("td:nth-child(4)").innerText()) && /09:00 – 11:30/.test(await zeileMit(p, "Kettenschutz").locator("td:nth-child(4)").innerText()) && /ganztags/.test(await zeileMit(p, "LTA2 mit Wiesner").locator("td:nth-child(4)").innerText()) && (await tabelle(p).locator('input[type="time"]').count()) === 0);
  ok("(1) Zähler im Kopf: Punkte, 1 erledigt, 3 anwesend; Abwesende grau darunter (A. Fischer Urlaub)",
    /\d+ Punkte 1 erledigt 👷 3 anwesend/.test(await stand(p)) && /Nicht da:.*A\. Fischer \(Urlaub\)/.test(await p.locator("body").innerText()), await stand(p));
  ok("(1) Die Arbeit von MORGEN und das To-do mit späterer Frist stehen NICHT im Tagesplan",
    !/MORGEN/.test(await tabelle(p).innerText()) && !/SPAETER/.test(await tabelle(p).innerText()));
  ok("(1) Die laufende Arbeit (09:00–11:30 um 10 Uhr) ist als „jetzt“ markiert", (await p.locator('tr[data-tagesplan-jetzt="1"]').count()) === 1 && /Kettenschutz/.test(await p.locator('tr[data-tagesplan-jetzt="1"]').innerText()));

  /* ---- (2) Zuteilung in der Zeile ---- */
  const planZeile = zeilen(p, "TPM").first();
  const anlage = (await planZeile.locator("td:nth-child(2)").innerText()).trim();
  await planZeile.locator("select").selectOption("M. Kilic");
  await p.waitForTimeout(500);
  let best = await gespeichert(p);
  const planEintrag = best.find((e) => e.category === "TPM" && e.date === HEUTE && e.name === anlage);
  ok(`(2) Wer-Wahl am PitStop „${anlage}“ legt den Eintrag an: TPM, heute, wer = M. Kilic, offen`, !!planEintrag && planEintrag.wer === "M. Kilic" && planEintrag.status === "open", JSON.stringify(planEintrag || null).slice(0, 120));
  ok("(2) Die Zeile zeigt das Kürzel MK", /MK/.test(await zeilen(p, "TPM").first().locator("td:nth-child(5)").innerText()));
  await p.getByRole("button", { name: "Planung", exact: true }).first().click();
  await p.waitForTimeout(600);
  const zelle = p.locator(`td[data-planzelle="M. Kilic|${HEUTE}"]`);
  const chipInZelle = zelle.locator(`[data-plan-zuteilung="${anlage}"]`);
  const wartungsChip = p.locator(`[data-wartungsplan-chip="${anlage}"]`).first();
  ok("(2) PLANUNG: der PitStop steht in der Zelle von M. Kilic (heute) und der Wartungsplan-Chip trägt „· MK“",
    (await chipInZelle.count()) === 1 && /· MK/.test(await wartungsChip.innerText()), `Zelle ${await chipInZelle.count()}, Chip „${(await wartungsChip.innerText().catch(() => "?")).trim()}“`);
  await p.getByRole("button", { name: "Übersicht", exact: true }).first().click().catch(() => {});
  await p.waitForTimeout(500);
  await zeilen(p, "TPM").first().locator("select").selectOption("");
  await p.waitForTimeout(400);
  best = await gespeichert(p);
  ok("(2) Zuteilung wieder weggenommen: Eintrag bleibt, wer ist leer", !best.find((e) => e.id === planEintrag.id).wer);

  /* ---- (3) Uhrzeit in der Zeile ---- */
  const todoZeile = zeileMit(p, "Ersatzteile B2");
  await todoZeile.locator('button[aria-label^="Uhrzeit ändern"]').click();
  await p.waitForTimeout(200);
  ok("(3) Klick auf „ganztags“ öffnet die zwei Zeitfelder in genau dieser Zeile", (await tabelle(p).locator('input[type="time"]').count()) === 2 && (await todoZeile.locator('input[type="time"]').count()) === 2);
  await todoZeile.locator('input[type="time"]').first().fill("09:45");
  await p.waitForTimeout(400);
  best = await gespeichert(p);
  ok("(3) Uhrzeit am To-do geschrieben (09:45), Zeile rückt zwischen 09:00 und ganztags",
    best.find((e) => e.id === "t-heute").uhrzeit === "09:45");
  const folge2 = await reihenfolge(p);
  ok("(3) Reihenfolge nach der Uhrzeit: Kettenschutz 09:00 vor Ersatzteile 09:45 vor Notiz (ganztags)",
    pos(folge2, "Kettenschutz") < pos(folge2, "Ersatzteile B2") && pos(folge2, "Ersatzteile B2") < pos(folge2, "LTA2 mit Wiesner"), folge2.join(" > "));
  ok("(3) To-do 09:45 ohne Ende läuft um 10 Uhr ebenfalls als „jetzt“ (eine Stunde Vorgabe)", (await p.locator('tr[data-tagesplan-jetzt="1"]').count()) === 2);
  await zeileMit(p, "Ersatzteile B2").locator('input[type="time"]').nth(1).fill("09:50");
  await p.waitForTimeout(400);
  await p.locator('button[aria-label="Uhrzeit fertig"]').click();
  await p.waitForTimeout(200);
  best = await gespeichert(p);
  ok("(3) Ende 09:50 geschrieben - um 10 Uhr nicht mehr „jetzt“; ✓ schließt die Felder, die Zeit steht als „09:45 – 09:50“", best.find((e) => e.id === "t-heute").uhrzeitBis === "09:50" && (await p.locator('tr[data-tagesplan-jetzt="1"]').count()) === 1 && (await tabelle(p).locator('input[type="time"]').count()) === 0 && /09:45 – 09:50/.test(await zeileMit(p, "Ersatzteile B2").locator("td:nth-child(4)").innerText()));

  /* ---- (4) Haken je Art ---- */
  const hake = async (label) => { await p.locator(`button[aria-label="${label}"]`).click(); await p.waitForTimeout(400); };
  await hake("KUKA II: Kettenschutz montieren abhaken");
  best = await gespeichert(p);
  ok("(4) Arbeit abgehakt: Status „done“ im Bestand, Zähler 2 erledigt", best.find((e) => e.id === "a-heute").status === "done" && /2 erledigt/.test(await stand(p)), await stand(p));
  await hake("Ersatzteile B2 nachbestellen abhaken");
  await hake("LTA2 mit Wiesner abstimmen abhaken");
  best = await gespeichert(p);
  ok("(4) To-do und Notiz abgehakt: „done“ mit erledigtAm, Zähler 4 erledigt",
    best.find((e) => e.id === "t-heute").status === "done" && !!best.find((e) => e.id === "t-heute").erledigtAm && best.find((e) => e.id === "n-tb").status === "done" && /4 erledigt/.test(await stand(p)), await stand(p));
  await hake("Meisterbüro: Morgenrunde wieder öffnen");
  best = await gespeichert(p);
  ok("(4) Termin wieder geöffnet: „open“, Zähler 3 erledigt", best.find((e) => e.id === "te-mr").status === "open" && /3 erledigt/.test(await stand(p)));
  await hake(`${anlage}: Wartung nach Plan abhaken`);
  best = await gespeichert(p);
  ok("(4) PitStop-Punkt abgehakt: sein Eintrag steht auf „done“", best.find((e) => e.id === planEintrag.id).status === "done");
  await hake(`${anlage}: Wartung nach Plan wieder öffnen`);
  best = await gespeichert(p);
  ok("(4) … und lässt sich wieder öffnen", best.find((e) => e.id === planEintrag.id).status === "open");
  await hake("KUKA II: Kettenschutz montieren wieder öffnen");
  best = await gespeichert(p);
  ok("(4) Arbeit wieder geöffnet", best.find((e) => e.id === "a-heute").status === "open");

  /* ---- (5) Klick öffnet den Dialog ---- */
  await p.locator('button[aria-label="To-do Ersatzteile B2 nachbestellen öffnen"]').click();
  await p.waitForTimeout(400);
  ok("(5) Klick auf die To-do-Zeile öffnet „To-do bearbeiten“", (await p.locator('[role="dialog"][aria-label="To-do bearbeiten"]').count()) === 1);
  await p.locator('button[aria-label="Schließen"]').last().click();
  await p.waitForTimeout(250);
  await p.locator('button[aria-label="Arbeit KUKA II öffnen"]').click();
  await p.waitForTimeout(400);
  ok("(5) Klick auf die Arbeit öffnet „Arbeit bearbeiten“", /Arbeit bearbeiten/.test(await p.locator("body").innerText()));
  await p.locator('button[aria-label="Schließen"]').last().click();
  await p.waitForTimeout(250);
  await p.locator(`button[aria-label="Termin Meisterbüro öffnen"]`).click();
  await p.waitForTimeout(400);
  ok("(5) Klick auf den Termin öffnet den Termin-Dialog mit Uhrzeit- und Wer-Feld", (await p.locator('input[aria-label="Uhrzeit von"]').count()) >= 1 && (await p.locator('select[aria-label="Wer macht es"]').count()) === 1);
  await p.locator('select[aria-label="Wer macht es"]').selectOption("T. Balles");
  await p.waitForTimeout(400);
  best = await gespeichert(p);
  ok("(5) Wer im Dialog gesetzt: wer = T. Balles am Termin", best.find((e) => e.id === "te-mr").wer === "T. Balles");
  await p.keyboard.press("Escape");
  await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 2000 }).catch(() => {});
  ok("(1-5) Keine Skriptfehler", v.fehler.length === 0, v.fehler.slice(0, 2).join(" | "));
  await v.ctx.close();

  /* ---- (6) Leser ---- */
  const l = await seite({ benutzer: "Lea" });
  const lt = await tabelle(l.p).innerText();
  ok("(6) LESER: Tabelle da, To-do drin, Arbeit nicht (Planung aus), kein Eingabefeld, Kästchen gesperrt",
    /Ersatzteile B2 nachbestellen/.test(lt) && !/Kettenschutz montieren/.test(lt)
    && (await tabelle(l.p).locator("input, select").count()) === 0
    && (await l.p.locator('button[aria-label="Ersatzteile B2 nachbestellen abhaken"]').isDisabled()), lt.replace(/\s+/g, " ").slice(0, 160));
  await l.ctx.close();

  /* ---- (7) Rechte-Matrix ---- */
  const b = await seite({ benutzer: "Bea", rechte: { bearbeiter: { TODO: "aus", PLANUNG: "sehen" } } });
  const bt = await tabelle(b.p).innerText();
  ok("(7) To-do „aus“: keine To-do-Zeile, die Arbeit schon", !/Ersatzteile B2/.test(bt) && /Kettenschutz montieren/.test(bt));
  ok("(7) Planung „sehen“: Kästchen der Arbeit gesperrt, kein Wer-Feld in der Arbeits-Zeile; der Termin bleibt bearbeitbar",
    (await b.p.locator('button[aria-label="KUKA II: Kettenschutz montieren abhaken"]').isDisabled())
    && (await zeileMit(b.p, "Kettenschutz").locator("select").count()) === 0
    && (await zeileMit(b.p, "Morgenrunde").locator("select").count()) === 1);
  await b.ctx.close();

  /* ---- (8) Ohne Team ---- */
  const o = await seite({ ohneTeam: true });
  ok("(8) Ohne Team: Tabelle da mit PitStop-Zeile, Wer-Spalte ohne Auswahl („niemand“), Überschrift unverändert",
    (await tabelle(o.p).count()) === 1 && (await zeilen(o.p, "TPM").count()) >= 1 && (await tabelle(o.p).locator("select").count()) === 0 && /niemand/.test(await tabelle(o.p).innerText()) && /TAGESPLAN · MONTAG, 21\.09\./.test(await o.p.locator("body").innerText()));
  await o.ctx.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
