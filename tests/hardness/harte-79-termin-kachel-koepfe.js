// Härtetest: TERMIN-KACHEL MIT SEITENLEISTE DER KÖPFE (Robertos Wahl vom 21.09., Vorlage 4)
//
// Die Tagesliste ("Heute · Montag") bleibt wie sie ist. Links steht eine
// schmale Leiste: oben das Klemmbrett (= Termine), darunter die heute
// Anwesenden als Köpfe, nach Schicht gruppiert. Wer fehlt (Schule, Krank,
// Urlaub), steht nicht in der Leiste. Ein Klick auf einen Kopf zeigt rechts
// die geplanten Punkte der Person - Arbeiten (wer + geplant = heute), fällige
// To-dos und Planungs-Notizen - zum direkten Abhaken und Bearbeiten.
//
//  (1) Leiste: Anwesende nach Schicht, Abwesende fehlen, Klemmbrett gedrückt.
//  (2) Klick auf einen Kopf: die Punkte der Person - nur die von HEUTE,
//      To-dos mit späterer Frist nur als Zeile, Abwesende grau darunter.
//  (3) Abhaken schreibt in den Bestand (Arbeit + To-do), Zähler zählt mit,
//      der Haken lässt sich wieder öffnen.
//  (4) Der Stift öffnet den jeweiligen Dialog (To-do / Arbeit / Notiz).
//  (5) Klemmbrett und ✕ führen zu den Terminen zurück.
//  (6) LESER: Leiste und Liste da, Kästchen gesperrt, kein Stift.
//  (7) RECHTE-MATRIX: To-do "aus" -> keine To-dos in der Liste;
//      Planung "sehen" -> Arbeit steht da, Kästchen gesperrt.
//  (8) Ohne Team: keine Leiste, die Tagesliste wie bisher.
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
  { id: "a-heute", category: "ARBEIT", date: "2026-09-18", name: "KUKA II", status: "open", note: "Kettenschutz montieren", prio: "hoch", art: "mech", wer: "T. Balles", geplant: HEUTE },
  { id: "a-morgen", category: "ARBEIT", date: "2026-09-18", name: "TS480", status: "open", note: "Folienabzug MORGEN nachstellen", prio: "ohne", art: "mech", wer: "T. Balles", geplant: "2026-09-22" },
  { id: "a-kw", category: "ARBEIT", date: "2026-09-18", name: "LTA2", status: "open", note: "Lichtschranke tauschen", prio: "ohne", art: "elek", wer: "K. Wiesner", geplant: HEUTE },
  { id: "t-ueber", category: "TODO", date: "2026-09-15", name: "Ersatzteile B2 nachbestellen", wer: "T. Balles", bis: "2026-09-20", prio: "", bemerkung: "", status: "offen" },
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
    return { ctx, p, fehler };
  };
  const kopf = (p, name) => p.locator(`button[aria-label="Punkte von ${name}"]`);
  const region = (p, name) => p.locator(`[role="region"][aria-label="Punkte von ${name}"]`);
  const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));

  /* ---- (1) Leiste ---- */
  const v = await seite();
  const p = v.p;
  ok("(1) Die Leiste „Heute anwesend“ steht in der Termin-Kachel", (await p.locator('[role="toolbar"][aria-label="Heute anwesend"]').count()) === 1);
  ok("(1) Anwesende als Köpfe: T. Balles und M. Kilic (Früh), K. Wiesner (Spät)",
    (await kopf(p, "T. Balles").count()) === 1 && (await kopf(p, "M. Kilic").count()) === 1 && (await kopf(p, "K. Wiesner").count()) === 1);
  ok("(1) A. Fischer (Urlaub) hat keinen Kopf", (await kopf(p, "A. Fischer").count()) === 0);
  const leisteText = await p.locator('[role="toolbar"][aria-label="Heute anwesend"]').innerText();
  ok("(1) Die Leiste ist nach Schicht beschriftet (Früh, Spät)", /FRÜH/i.test(leisteText) && /SPÄT/i.test(leisteText), leisteText.replace(/\s+/g, " "));
  ok("(1) Das Klemmbrett (Termine) ist gedrückt, kein Kopf",
    (await p.locator('button[aria-label="Termine anzeigen"][aria-pressed="true"]').count()) === 1 && (await kopf(p, "T. Balles").getAttribute("aria-pressed")) === "false");
  ok("(1) Am Kopf steht, wie viel offen ist (T. Balles: 2 Punkte)", /2 Punkte offen/.test(await kopf(p, "T. Balles").getAttribute("title")), await kopf(p, "T. Balles").getAttribute("title"));

  /* ---- (2) Punkte einer Person ---- */
  await kopf(p, "T. Balles").click();
  await p.waitForTimeout(400);
  ok("(2) Der Kopf ist gedrückt, rechts steht „Punkte von T. Balles“",
    (await kopf(p, "T. Balles").getAttribute("aria-pressed")) === "true" && (await region(p, "T. Balles").count()) === 1);
  let t = await region(p, "T. Balles").innerText();
  ok("(2) Arbeit von heute, überfälliges To-do und Planungs-Notiz stehen da",
    /Kettenschutz montieren/.test(t) && /Ersatzteile B2 nachbestellen/.test(t) && /LTA2 mit Wiesner abstimmen/.test(t));
  ok("(2) Die Arbeit von MORGEN steht NICHT da", !/MORGEN/.test(t));
  ok("(2) Das To-do mit späterer Frist nur als Zeile, nicht als Punkt", !/Jahresplanung SPAETER/.test(t) && /1 To-do mit späterer Frist/.test(t));
  ok("(2) Überfälliges To-do zeigt „seit 20.09.2026“", /seit 20\.09\.2026/.test(t));
  ok("(2) Zähler „0 von 2 erledigt“, Abwesende grau darunter", /0 von 2 erledigt/.test(t) && /Nicht da:.*A\. Fischer \(Urlaub\)/.test(t));
  ok("(2) Die Schicht steht am Kopf der Liste (Tagschicht - keine Schicht eingetragen)", /Tagschicht/i.test(t));

  /* ---- (3) Abhaken ---- */
  await p.locator('button[aria-label="Kettenschutz montieren abhaken"]').click();
  await p.waitForTimeout(500);
  let best = await gespeichert(p);
  ok("(3) Arbeit abgehakt: Status „done“ im Bestand, Zähler 1 von 2",
    best.find((e) => e.id === "a-heute").status === "done" && /1 von 2 erledigt/.test(await region(p, "T. Balles").innerText()));
  ok("(3) Der Haken lässt sich wieder öffnen (Knopf „wieder öffnen“)", (await p.locator('button[aria-label="Kettenschutz montieren wieder öffnen"]').count()) === 1);
  await p.locator('button[aria-label="Ersatzteile B2 nachbestellen abhaken"]').click();
  await p.waitForTimeout(500);
  best = await gespeichert(p);
  const todo = best.find((e) => e.id === "t-ueber");
  t = await region(p, "T. Balles").innerText();
  ok("(3) To-do abgehakt: „done“ mit erledigtAm, bleibt heute durchgestrichen stehen, 2 von 2",
    todo.status === "done" && !!todo.erledigtAm && /Ersatzteile B2 nachbestellen/.test(t) && /2 von 2 erledigt/.test(t));
  ok("(3) Am Kopf steht jetzt „nichts offen“", /nichts offen/.test(await kopf(p, "T. Balles").getAttribute("title")));
  await p.locator('button[aria-label="Kettenschutz montieren wieder öffnen"]').click();
  await p.waitForTimeout(500);
  best = await gespeichert(p);
  ok("(3) Wieder öffnen: Status „open“ im Bestand", best.find((e) => e.id === "a-heute").status === "open");

  /* ---- (4) Stift ---- */
  await p.locator('button[aria-label="Ersatzteile B2 nachbestellen bearbeiten"]').click();
  await p.waitForTimeout(400);
  ok("(4) Der Stift am To-do öffnet „To-do bearbeiten“", (await p.locator('[role="dialog"][aria-label="To-do bearbeiten"]').count()) === 1);
  await p.locator('[role="dialog"][aria-label="To-do bearbeiten"] button[aria-label="Schließen"]').click();
  await p.waitForTimeout(300);
  await p.locator('button[aria-label="Kettenschutz montieren bearbeiten"]').click();
  await p.waitForTimeout(400);
  ok("(4) Der Stift an der Arbeit öffnet „Arbeit bearbeiten“", /Arbeit bearbeiten/.test(await p.locator("body").innerText()));
  await p.locator('button[aria-label="Schließen"]').last().click();
  await p.waitForTimeout(300);
  await p.locator('button[aria-label="Notiz bearbeiten: LTA2 mit Wiesner abstimmen"]').click();
  await p.waitForTimeout(400);
  const notizFeld = p.locator("textarea");
  ok("(4) Der Stift an der Notiz öffnet den Notiz-Dialog mit dem Text", (await notizFeld.count()) > 0 && /LTA2 mit Wiesner abstimmen/.test(await notizFeld.first().inputValue()));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  if (await p.locator("textarea").count()) { await p.locator('button[aria-label="Schließen"]').last().click().catch(() => {}); await p.waitForTimeout(300); }

  /* ---- (5) Zurück ---- */
  await p.locator('button[aria-label="Zurück zu den Terminen"]').click();
  await p.waitForTimeout(300);
  // Ohne eigene Anlagen sät die App den Muster-Bestand (HRO, Wasserrundgang) -
  // die Termine des Tages sind also die PitStop-/R+I-Karten.
  ok("(5) ✕ führt zu den Terminen zurück (PitStop-Karte wieder da)", (await region(p, "T. Balles").count()) === 0 && /PitStop/.test(await p.locator("body").innerText()));
  await kopf(p, "K. Wiesner").click();
  await p.waitForTimeout(300);
  ok("(5) K. Wiesner (Spät): eigene Arbeit, nichts von T. Balles",
    /Lichtschranke tauschen/.test(await region(p, "K. Wiesner").innerText()) && !/Kettenschutz/.test(await region(p, "K. Wiesner").innerText()));
  await p.locator('button[aria-label="Termine anzeigen"]').click();
  await p.waitForTimeout(300);
  ok("(5) Das Klemmbrett führt ebenfalls zurück", (await region(p, "K. Wiesner").count()) === 0 && (await p.locator('button[aria-label="Termine anzeigen"][aria-pressed="true"]').count()) === 1);
  ok("(1-5) Keine Skriptfehler", v.fehler.length === 0, v.fehler.slice(0, 2).join(" | "));
  await v.ctx.close();

  /* ---- (6) Leser ---- */
  const l = await seite({ benutzer: "Lea" });
  ok("(6) LESER: Leiste da", (await kopf(l.p, "T. Balles").count()) === 1);
  await kopf(l.p, "T. Balles").click();
  await l.p.waitForTimeout(400);
  // Leser-Standard: Planung "aus" (keine Arbeiten), To-dos "sehen".
  ok("(6) LESER: To-do da, Arbeit nicht (Planung aus), Kästchen gesperrt, kein Stift",
    /Ersatzteile B2 nachbestellen/.test(await region(l.p, "T. Balles").innerText())
    && !/Kettenschutz montieren/.test(await region(l.p, "T. Balles").innerText())
    && (await l.p.locator('button[aria-label="Ersatzteile B2 nachbestellen abhaken"]').isDisabled())
    && (await l.p.locator('button[aria-label="Ersatzteile B2 nachbestellen bearbeiten"]').count()) === 0);
  await l.ctx.close();

  /* ---- (7) Rechte-Matrix ---- */
  const b = await seite({ benutzer: "Bea", rechte: { bearbeiter: { TODO: "aus", PLANUNG: "sehen" } } });
  await kopf(b.p, "T. Balles").click();
  await b.p.waitForTimeout(400);
  t = await region(b.p, "T. Balles").innerText();
  ok("(7) To-do „aus“: kein To-do in der Liste, die Arbeit schon", !/Ersatzteile B2/.test(t) && /Kettenschutz montieren/.test(t));
  ok("(7) Planung „sehen“: Kästchen der Arbeit gesperrt, kein Stift",
    (await b.p.locator('button[aria-label="Kettenschutz montieren abhaken"]').isDisabled()) && (await b.p.locator('button[aria-label="Kettenschutz montieren bearbeiten"]').count()) === 0);
  await b.ctx.close();

  /* ---- (8) Ohne Team ---- */
  const o = await seite({ ohneTeam: true });
  ok("(8) Ohne Team: keine Leiste, die Tagesliste steht wie bisher",
    (await o.p.locator('[role="toolbar"][aria-label="Heute anwesend"]').count()) === 0 && /HEUTE · MONTAG, 21\.09\./.test(await o.p.locator("body").innerText()) && /PitStop/.test(await o.p.locator("body").innerText()));
  await o.ctx.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
