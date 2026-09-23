// Härtetest: TERMIN-KACHEL MIT DROPDOWN DER ANWESENDEN (Robertos Wahl vom 21.09., Vorlage 2)
//
// Die Tagesliste ("Heute · Montag") bleibt wie sie ist. Rechts im Kopf steht
// ein Knopf "Anwesende"; sein Menü listet die heute Anwesenden nach Schicht
// mit Fortschritt, oben "Termine" = die Tagesliste. Wer fehlt (Schule, Krank,
// Urlaub), steht nicht als Eintrag, sondern grau unter dem Menü. Die Wahl
// einer Person zeigt in der Kachel ihre geplanten Punkte - Arbeiten (wer +
// geplant = heute), fällige To-dos und Planungs-Notizen - zum direkten
// Abhaken und Bearbeiten. Notizen sind abhakbar (= erledigt).
//
//  (1) Menü: Anwesende nach Schicht, Abwesende fehlen, "Termine" ist gewählt.
//  (2) Wahl einer Person: die Punkte der Person - nur die von HEUTE,
//      To-dos mit späterer Frist nur als Zeile, Abwesende grau darunter.
//  (3) Abhaken schreibt in den Bestand (Arbeit, To-do, Notiz), Zähler zählt
//      mit, der Haken lässt sich wieder öffnen.
//  (4) Der Stift öffnet den jeweiligen Dialog (To-do / Arbeit / Notiz).
//  (5) "zurück zu den Terminen" und der Menüpunkt "Termine" führen zurück.
//  (6) LESER: Menü und Liste da, Kästchen gesperrt, kein Stift.
//  (7) RECHTE-MATRIX: To-do "aus" -> keine To-dos in der Liste;
//      Planung "sehen" -> Arbeit steht da, Kästchen gesperrt.
//  (8) Ohne Team: kein Knopf, die Tagesliste wie bisher.
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
  const knopf = (p) => p.locator('button[aria-label="Anwesende wählen"]');
  const menue = (p) => p.locator('[role="menu"][aria-label="Heute anwesend"]');
  const kopf = (p, name) => p.locator(`[role="menuitemradio"][aria-label="Punkte von ${name}"]`);
  const region = (p, name) => p.locator(`[role="region"][aria-label="Punkte von ${name}"]`);
  const oeffne = async (p) => { if ((await menue(p).count()) === 0) { await knopf(p).click(); await p.waitForTimeout(250); } };
  const waehle = async (p, name) => { await oeffne(p); await kopf(p, name).click(); await p.waitForTimeout(400); };
  const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));

  /* ---- (1) Menü ---- */
  const v = await seite();
  const p = v.p;
  ok("(1) Der Knopf „Anwesende“ steht im Kopf der Termin-Kachel - das Menü ist zu", (await knopf(p).count()) === 1 && (await menue(p).count()) === 0);
  ok("(1) Der Knopf nennt die Zahl der Anwesenden und der offenen Punkte", /Anwesende\s*3\s*·\s*4 offen/.test((await knopf(p).innerText()).replace(/\s+/g, " ")), await knopf(p).innerText());
  await oeffne(p);
  ok("(1) Das Menü öffnet sich, „Termine“ ist gewählt",
    (await menue(p).count()) === 1 && (await p.locator('[role="menuitemradio"][aria-label="Termine anzeigen"]').getAttribute("aria-checked")) === "true");
  ok("(1) Anwesende als Einträge: T. Balles und M. Kilic (Früh), K. Wiesner (Spät)",
    (await kopf(p, "T. Balles").count()) === 1 && (await kopf(p, "M. Kilic").count()) === 1 && (await kopf(p, "K. Wiesner").count()) === 1);
  ok("(1) A. Fischer (Urlaub) ist kein Eintrag, steht aber grau unter „Nicht da“",
    (await kopf(p, "A. Fischer").count()) === 0 && /Nicht da:.*A\. Fischer/i.test(await menue(p).innerText()));
  const menueText = await menue(p).innerText();
  ok("(1) Nach Schicht beschriftet, die laufende Schicht heißt „jetzt“", /FRÜH · JETZT/i.test(menueText) && /SPÄT/i.test(menueText), menueText.replace(/\s+/g, " "));
  ok("(1) Am Eintrag steht der Fortschritt (T. Balles: 0 / 3 - Arbeit, To-do, Notiz)",
    /0 \/ 3/.test(await kopf(p, "T. Balles").innerText()) && /3 Punkte offen/.test(await kopf(p, "T. Balles").getAttribute("title")));
  await p.keyboard.press("Escape");
  await p.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await p.waitForTimeout(200);
  ok("(1) Klick daneben schließt das Menü", (await menue(p).count()) === 0);

  /* ---- (2) Punkte einer Person ---- */
  await waehle(p, "T. Balles");
  ok("(2) Nach der Wahl: Menü zu, der Knopf trägt den Namen mit „3 offen“, die Liste „Punkte von T. Balles“ steht da",
    (await menue(p).count()) === 0 && /T\. Balles\s*3 offen/.test((await knopf(p).innerText()).replace(/\s+/g, " ")) && (await region(p, "T. Balles").count()) === 1);
  let t = await region(p, "T. Balles").innerText();
  ok("(2) Arbeit von heute, überfälliges To-do und Planungs-Notiz stehen da",
    /Kettenschutz montieren/.test(t) && /Ersatzteile B2 nachbestellen/.test(t) && /LTA2 mit Wiesner abstimmen/.test(t));
  ok("(2) Die Arbeit von MORGEN steht NICHT da", !/MORGEN/.test(t));
  ok("(2) Das To-do mit späterer Frist nur als Zeile, nicht als Punkt", !/Jahresplanung SPAETER/.test(t) && /1 To-do mit späterer Frist/.test(t));
  ok("(2) Überfälliges To-do zeigt „seit 20.09.2026“", /seit 20\.09\.2026/.test(t));
  ok("(2) Zähler „0 von 3 erledigt“, Abwesende grau darunter", /0 von 3 erledigt/.test(t) && /Nicht da:.*A\. Fischer \(Urlaub\)/.test(t));
  ok("(2) Die Schicht steht am Kopf der Liste (Tagschicht - keine Schicht eingetragen)", /Tagschicht/i.test(t));

  /* ---- (3) Abhaken ---- */
  await p.locator('button[aria-label="Kettenschutz montieren abhaken"]').click();
  await p.waitForTimeout(500);
  let best = await gespeichert(p);
  ok("(3) Arbeit abgehakt: Status „done“ im Bestand, Zähler 1 von 3",
    best.find((e) => e.id === "a-heute").status === "done" && /1 von 3 erledigt/.test(await region(p, "T. Balles").innerText()));
  ok("(3) Der Haken lässt sich wieder öffnen (Knopf „wieder öffnen“)", (await p.locator('button[aria-label="Kettenschutz montieren wieder öffnen"]').count()) === 1);
  await p.locator('button[aria-label="Ersatzteile B2 nachbestellen abhaken"]').click();
  await p.waitForTimeout(500);
  best = await gespeichert(p);
  const todo = best.find((e) => e.id === "t-ueber");
  t = await region(p, "T. Balles").innerText();
  ok("(3) To-do abgehakt: „done“ mit erledigtAm, bleibt heute durchgestrichen stehen, 2 von 3",
    todo.status === "done" && !!todo.erledigtAm && /Ersatzteile B2 nachbestellen/.test(t) && /2 von 3 erledigt/.test(t));
  // Notizen sind abhakbar (Robertos Nachschärfung vom 21.09.): "Zu Markus" ist ein Auftrag.
  await p.locator('button[aria-label="LTA2 mit Wiesner abstimmen abhaken"]').click();
  await p.waitForTimeout(500);
  best = await gespeichert(p);
  const notiz = best.find((e) => e.id === "n-tb");
  ok("(3) Notiz abgehakt: „done“ mit erledigtAm im Bestand, 3 von 3",
    notiz.status === "done" && notiz.erledigtAm === HEUTE && /3 von 3 erledigt/.test(await region(p, "T. Balles").innerText()));
  ok("(3) Der Knopf sagt jetzt „fertig“", /T\. Balles\s*fertig/.test((await knopf(p).innerText()).replace(/\s+/g, " ")), await knopf(p).innerText());
  await p.locator('button[aria-label="LTA2 mit Wiesner abstimmen wieder öffnen"]').click();
  await p.waitForTimeout(500);
  best = await gespeichert(p);
  ok("(3) Notiz wieder geöffnet", best.find((e) => e.id === "n-tb").status !== "done");
  await p.locator('button[aria-label="Kettenschutz montieren wieder öffnen"]').click();
  await p.waitForTimeout(500);
  best = await gespeichert(p);
  ok("(3) Arbeit wieder geöffnet: Status „open“ im Bestand", best.find((e) => e.id === "a-heute").status === "open");

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
  if (await p.locator("textarea").count()) { await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(300); }

  /* ---- (5) Zurück ---- */
  await p.locator('button[aria-label="Zurück zu den Terminen"]').click();
  await p.waitForTimeout(300);
  // Ohne eigene Anlagen sät die App den Muster-Bestand (HRO, Wasserrundgang) -
  // die Termine des Tages sind also die PitStop-/R+I-Karten.
  ok("(5) „zurück zu den Terminen“ zeigt die Termine (PitStop-Karte wieder da), der Knopf heißt wieder „Anwesende“",
    (await region(p, "T. Balles").count()) === 0 && /PitStop/.test(await p.locator("body").innerText()) && /^👷?\s*Anwesende/.test((await knopf(p).innerText()).trim()));
  await waehle(p, "K. Wiesner");
  ok("(5) K. Wiesner (Spät): eigene Arbeit, nichts von T. Balles",
    /Lichtschranke tauschen/.test(await region(p, "K. Wiesner").innerText()) && !/Kettenschutz/.test(await region(p, "K. Wiesner").innerText()));
  await oeffne(p);
  await p.locator('[role="menuitemradio"][aria-label="Termine anzeigen"]').click();
  await p.waitForTimeout(300);
  ok("(5) Der Menüpunkt „Termine“ führt ebenfalls zurück", (await region(p, "K. Wiesner").count()) === 0 && (await menue(p).count()) === 0 && /PitStop/.test(await p.locator("body").innerText()));
  ok("(1-5) Keine Skriptfehler", v.fehler.length === 0, v.fehler.slice(0, 2).join(" | "));
  await v.ctx.close();

  /* ---- (6) Leser ---- */
  const l = await seite({ benutzer: "Lea" });
  ok("(6) LESER: Knopf da", (await knopf(l.p).count()) === 1);
  await waehle(l.p, "T. Balles");
  // Leser-Standard: Planung "aus" (keine Arbeiten, keine Notizen), To-dos "sehen".
  ok("(6) LESER: To-do da, Arbeit nicht (Planung aus), Kästchen gesperrt, kein Stift",
    /Ersatzteile B2 nachbestellen/.test(await region(l.p, "T. Balles").innerText())
    && !/Kettenschutz montieren/.test(await region(l.p, "T. Balles").innerText())
    && (await l.p.locator('button[aria-label="Ersatzteile B2 nachbestellen abhaken"]').isDisabled())
    && (await l.p.locator('button[aria-label="Ersatzteile B2 nachbestellen bearbeiten"]').count()) === 0);
  await l.ctx.close();

  /* ---- (7) Rechte-Matrix ---- */
  const b = await seite({ benutzer: "Bea", rechte: { bearbeiter: { TODO: "aus", PLANUNG: "sehen" } } });
  await waehle(b.p, "T. Balles");
  t = await region(b.p, "T. Balles").innerText();
  ok("(7) To-do „aus“: kein To-do in der Liste, die Arbeit schon", !/Ersatzteile B2/.test(t) && /Kettenschutz montieren/.test(t));
  ok("(7) Planung „sehen“: Kästchen der Arbeit gesperrt, kein Stift",
    (await b.p.locator('button[aria-label="Kettenschutz montieren abhaken"]').isDisabled()) && (await b.p.locator('button[aria-label="Kettenschutz montieren bearbeiten"]').count()) === 0);
  await b.ctx.close();

  /* ---- (8) Ohne Team ---- */
  const o = await seite({ ohneTeam: true });
  ok("(8) Ohne Team: kein Knopf, die Tagesliste steht wie bisher",
    (await knopf(o.p).count()) === 0 && /HEUTE · MONTAG, 21\.09\./.test(await o.p.locator("body").innerText()) && /PitStop/.test(await o.p.locator("body").innerText()));
  await o.ctx.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
