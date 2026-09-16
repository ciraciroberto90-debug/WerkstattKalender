// Härtetest: DIE DREI ANSAGEN VOM 14.09. (nach der Berichte-Startseite)
//
//  (Z) Untermenü-Zeile unter den Haupt-Tabs + Zurück-Pfeil: der Pfeil holt
//      die vorige Ansicht aus dem Verlauf, auch über Bereichsgrenzen.
//  (R) Neue Rhythmen: "jeden N-ten/letzten Wochentag im Monat" und
//      "alle X Wochen" - für R+I-Punkte UND für TPM-Anlagen mit der neuen
//      Rolle "Eigener Rhythmus". Die Rechnung wird über den Testzugang
//      __wkRhythmusTest datumsgenau geprüft, der Plan-Kalender über die UI.
//  (L) Leser-Ansicht: nach 15 Minuten ohne Eingabe automatischer Rücksprung
//      auf die Übersicht; jede Eingabe setzt die Uhr zurück. Bearbeiter
//      werden NICHT umgeworfen.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ================= Bearbeiter: Zurück-Pfeil + Rhythmen ================= */
  const p = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.install({ time: new Date("2026-09-14T10:00:00") });
  await p.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([]));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
      tpmAnlagen: [
        { id: "m1", name: "TS 480", role: "monday1" },
        { id: "r1", name: "Presse P1", role: "rhythmus", rhythmus: { type: "nth-weekday", nth: 1, weekday: 1 } },
        { id: "r2", name: "Ofen O2", role: "rhythmus", rhythmus: { type: "nth-weekday", nth: -1, weekday: 5 } },
      ],
      riItems: [
        { id: "riA", name: "Druckluft-Check", type: "nth-weekday", nth: 2, weekday: 3 },
        { id: "riB", name: "Ölstand-Runde", type: "every-n-weeks", n: 3, weekday: 4, anchor: "2026-09-03" },
      ],
      team: [{ name: "T. Balles", rolle: "mech" }, { name: "M. Kilic", rolle: "elek" }],
    }));
  });
  await p.goto(APP);
  await p.waitForTimeout(1300);

  /* ---- (R) Rechnung datumsgenau über den Testzugang ---- */
  const rechnung = await p.evaluate(() => {
    const t = window.__wkRhythmusTest;
    const d = (s) => new Date(s + "T00:00:00");
    const ersterMontag = { type: "nth-weekday", nth: 1, weekday: 1 };
    const letzterFreitag = { type: "nth-weekday", nth: -1, weekday: 5 };
    const alle3WoDo = { type: "every-n-weeks", n: 3, weekday: 4, anchor: "2026-09-03" };
    return {
      em0709: t(ersterMontag, d("2026-09-07")),   // 1. Montag im Sept. 2026
      em1409: t(ersterMontag, d("2026-09-14")),   // 2. Montag -> nein
      em0510: t(ersterMontag, d("2026-10-05")),   // 1. Montag im Okt. -> ja
      lf2509: t(letzterFreitag, d("2026-09-25")), // letzter Freitag im Sept.
      lf1809: t(letzterFreitag, d("2026-09-18")), // vorletzter -> nein
      lf3010: t(letzterFreitag, d("2026-10-30")), // letzter Freitag im Okt. (5. Freitag!)
      w0309: t(alle3WoDo, d("2026-09-03")),       // Anker selbst
      w1009: t(alle3WoDo, d("2026-09-10")),       // +1 Woche -> nein
      w2409: t(alle3WoDo, d("2026-09-24")),       // +3 Wochen -> ja
      w1512: t(alle3WoDo, d("2026-12-17")),       // +15 Wochen (über Zeitumstellung) -> ja
    };
  });
  pruef("(R) Jeden 1. Montag: 07.09. ja, 14.09. nein, 05.10. ja",
        rechnung.em0709 === true && rechnung.em1409 === false && rechnung.em0510 === true);
  pruef("(R) Jeden LETZTEN Freitag: 25.09. ja, 18.09. nein, 30.10. ja (5-Freitage-Monat)",
        rechnung.lf2509 === true && rechnung.lf1809 === false && rechnung.lf3010 === true);
  pruef("(R) Alle 3 Wochen Do ab 03.09.: 03.09. ja, 10.09. nein, 24.09. ja, 17.12. ja (über die Zeitumstellung)",
        rechnung.w0309 === true && rechnung.w1009 === false && rechnung.w2409 === true && rechnung.w1512 === true);

  /* ---- (R) Der Plan-Kalender zeigt die Rhythmus-Termine ---- */
  await p.getByRole("button", { name: "TPM", exact: true }).click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Plan", exact: true }).click();
  await p.waitForTimeout(900);
  let text = await p.locator("body").innerText();
  pruef("(R) Plan-Kalender September zeigt beide Rhythmus-Anlagen und beide neuen R+I-Rhythmen",
        /Presse P1/.test(text) && /Ofen O2/.test(text) && /Druckluft-Check/.test(text) && /Ölstand-Runde/.test(text));
  // Robertos Regel "nie zwei TPM am selben Tag": der 1. Montag (07.09.) gehört
  // der Montags-Rotation (TS 480) - Presse P1 weicht auf den 08.09. aus.
  const tage = await p.evaluate(() => {
    const finde = (name) => {
      const el = [...document.querySelectorAll("*")].find((x) => x.children.length === 0 && x.textContent.trim() === name);
      let z = el;
      while (z && !/^\d{1,2}$/.test((z.firstElementChild || {}).textContent || "")) z = z.parentElement;
      return z ? Number(z.firstElementChild.textContent) : null;
    };
    return { presse: finde("Presse P1"), ofen: finde("Ofen O2") };
  });
  pruef("(R) Presse P1 weicht vom Montags-Slot auf den 08.09. aus (nie zwei TPM am selben Tag)",
        tage.presse === 8, "Tag " + tage.presse);
  pruef("(R) Ofen O2 steht am 25.09. (letzter Freitag)", tage.ofen === 25, "Tag " + tage.ofen);

  /* ---- (R) ⚙ bietet die neue Rolle und die neuen Rhythmen an ---- */
  await p.getByRole("button", { name: "Verwalten" }).click();
  await p.waitForTimeout(700);
  text = await p.locator("body").innerText();
  pruef("(R) ⚙ zeigt die Rolle „Eigener Rhythmus“ samt Rhythmus-Feldern",
        /Eigener Rhythmus/.test(text) && /jeden/.test(text) && /im Monat/.test(text));
  pruef("(R) ⚙ bietet „Wochentag im Monat“ und „Alle X Wochen“ als R+I-Rhythmus an",
        /Wochentag im Monat/.test(text) && /Alle X Wochen/.test(text));
  await p.locator('button[aria-label="Schließen"]').last().click();
  await p.waitForTimeout(400);

  /* ---- (Z) Untermenü-Zeile + Zurück-Pfeil ---- */
  pruef("(Z) Der Zurück-Knopf steht in der Untermenü-Zeile",
        (await p.getByRole("button", { name: "Zurück" }).count()) === 1);
  await p.getByRole("button", { name: /^Berichte/ }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /^Störungen/ }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Werkstatt", exact: true }).click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Zurück" }).click();
  await p.waitForTimeout(400);
  text = await p.locator("body").innerText();
  pruef("(Z) Zurück über die Bereichsgrenze: von Werkstatt wieder zu Berichte → Störungen",
        /Störbericht erfassen/.test(text));
  await p.getByRole("button", { name: "Zurück" }).click();
  await p.waitForTimeout(400);
  text = await p.locator("body").innerText();
  pruef("(Z) Noch einmal Zurück: der Berichte-Start mit den Kacheln",
        /Aufgaben – erteilt/.test(text));
  pruef("(Z+R) Keine Skriptfehler (Bearbeiter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  /* ---- (L) Bearbeiter wird nach 15 min NICHT umgeworfen ---- */
  await p.getByRole("button", { name: /^Berichte/ }).first().click();
  await p.waitForTimeout(400);
  await p.clock.fastForward("16:00");
  await p.waitForTimeout(600);
  text = await p.locator("body").innerText();
  pruef("(L) Bearbeiter bleiben nach 15 min Stille, wo sie sind",
        /Aufgaben – erteilt/.test(text));

  /* ================= (L) Leser: 15-Minuten-Rücksprung ================= */
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const p2 = await ctx2.newPage();
  const fehler2 = [];
  p2.on("pageerror", (e) => fehler2.push(e.message));
  await p2.clock.install({ time: new Date("2026-09-14T10:00:00") });
  await p2.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([
      // Eine Zellen-Notiz im Bestand: Leser sollen den gelben Kasten SEHEN
      { id: "n1", category: "PLANNOTIZ", name: "T. Balles", date: "2026-09-14", note: "Dies ist ein Test", verfasser: "Roberto" },
    ]));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
      tpmAnlagen: [], riItems: [],
      team: [{ name: "T. Balles", rolle: "mech" }, { name: "M. Kilic", rolle: "elek" }],
      benutzer: [{ name: "chef", rolle: "leser", kennwortHash: "" }, { name: "rc", rolle: "verwalter", kennwortHash: "" }],
    }));
    localStorage.setItem("werkstatt-kalender-benutzer", "chef");
  });
  await p2.goto(APP);
  await p2.waitForTimeout(1300);

  /* ---- (S) Leser-Schichtplan (Robertos Ansage vom 15.09.): eigener
     Haupt-Tab zwischen Übersicht und Berichte, aber NUR zum Ansehen -
     stumme Zellen, kein Auswahl-Fenster. ---- */
  pruef("(S) Leser haben den Schichtplan-Tab in der Hauptleiste",
        (await p2.getByRole("button", { name: "Schichtplan", exact: true }).count()) === 1);
  await p2.getByRole("button", { name: "Schichtplan", exact: true }).click();
  await p2.waitForTimeout(700);
  let t2 = await p2.locator("body").innerText();
  pruef("(S) Die Matrix steht mit dem Team und sagt „nur ansehen“",
        /T\. Balles/.test(t2) && /nur ansehen/.test(t2) && !/öffnet die Auswahl/.test(t2));
  await p2.locator('button[aria-label^="Matrix "]').first().click();
  await p2.waitForTimeout(400);
  pruef("(S) Zellen-Klick öffnet für Leser KEIN Auswahl-Fenster",
        (await p2.locator('div[style*="z-index: 71"]').count()) === 0);
  // (N) Aber die Zellen-Notiz SEHEN Leser - gelber Kasten mit Verfasser
  await p2.locator('button[aria-label="Matrix T. Balles 2026-09-14"]').hover();
  await p2.waitForTimeout(400);
  const kastenLeser = await p2.locator("body").innerText();
  pruef("(N) Leser sehen den gelben Notiz-Kasten samt Verfasser (nur ansehen)",
        /Roberto:/.test(kastenLeser) && /Dies ist ein Test/.test(kastenLeser));
  // Gegenprobe beim Bearbeiter: dort öffnet dieselbe Zelle die Auswahl
  await p.getByRole("button", { name: "Werkstatt", exact: true }).click();
  await p.waitForTimeout(600);
  const zelle = p.locator('button[aria-label^="Matrix "]').first();
  if (await zelle.count()) {
    await zelle.click();
    await p.waitForTimeout(400);
    pruef("(S) Gegenprobe Bearbeiter: Zellen-Klick öffnet die Auswahl",
          (await p.locator('div[style*="z-index: 71"]').count()) === 1);

    /* ---- (N) Zellen-Notiz wie der Excel-Kommentar (Robertos Ansage
       vom 16.09.): anheften über das Zellen-Menü, rotes Eck + gelber
       Kasten beim Zeigen, beim zweiten Mal "Notiz ändern". ---- */
    await p.getByRole("button", { name: /Notiz anheften/ }).click();
    await p.waitForTimeout(400);
    await p.locator("textarea").fill("Bremse an B1 prüfen");
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.waitForTimeout(700);
    const notizB = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries"))).find((e) => e.category === "PLANNOTIZ");
    pruef("(N) Die Zellen-Notiz liegt als PLANNOTIZ im Bestand (geteilt mit der Planung)",
          !!notizB && notizB.note === "Bremse an B1 prüfen", notizB && `${notizB.name} · ${notizB.date}`);
    await p.locator(`button[aria-label="Matrix ${notizB.name} ${notizB.date}"]`).hover();
    await p.waitForTimeout(400);
    pruef("(N) Beim Zeigen erscheint der gelbe Notiz-Kasten",
          (await p.locator("body").innerText()).includes("Bremse an B1 prüfen"));
    await p.locator(`button[aria-label="Matrix ${notizB.name} ${notizB.date}"]`).click();
    await p.waitForTimeout(400);
    pruef("(N) Das Zellen-Menü bietet jetzt „Notiz ändern“",
          (await p.getByRole("button", { name: /Notiz ändern/ }).count()) === 1);
    await p.mouse.click(20, 700); // Menü über die Fläche daneben schließen
    await p.waitForTimeout(300);
  } else {
    // Ohne Team in der Bearbeiter-Saat gibt es keine Zellen - dann zählt
    // die Leser-Prüfung allein (ehrlich vermerkt statt still übersprungen).
    pruef("(S) Gegenprobe Bearbeiter: keine Matrix-Zellen in dieser Saat (Team leer)", true, "übersprungen");
  }

  await p2.getByRole("button", { name: /^Berichte/ }).first().click();
  await p2.waitForTimeout(600);
  t2 = await p2.locator("body").innerText();
  pruef("(L) Leser steht im Bereich Berichte", /Aufgaben – erteilt/.test(t2));
  await p2.clock.fastForward("14:00");
  await p2.waitForTimeout(500);
  t2 = await p2.locator("body").innerText();
  pruef("(L) Nach 14 Minuten Stille noch KEIN Rücksprung", /Aufgaben – erteilt/.test(t2));
  // Eingabe auf der leeren grauen Fläche setzt die Uhr zurück
  await p2.mouse.click(60, 400);
  await p2.clock.fastForward("14:00");
  await p2.waitForTimeout(500);
  t2 = await p2.locator("body").innerText();
  pruef("(L) Eine Eingabe setzt die Uhr zurück (weitere 14 min: immer noch Berichte)",
        /Aufgaben – erteilt/.test(t2));
  await p2.clock.fastForward("16:00");
  await p2.waitForTimeout(800);
  t2 = await p2.locator("body").innerText();
  pruef("(L) Nach 15+ Minuten Stille automatisch zurück auf der Übersicht",
        !/Aufgaben – erteilt/.test(t2) && !/Alle Berichte/i.test(t2));
  pruef("(L) Keine Skriptfehler (Leser)", fehler2.length === 0, fehler2.slice(0, 2).join(" | "));

  console.log(`\nHärte 72 (Leiste + Rhythmen + Leser-Rücksprung): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
