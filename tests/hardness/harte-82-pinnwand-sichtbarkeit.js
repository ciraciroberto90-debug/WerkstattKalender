// Härtetest: PINNWAND - SICHTBARKEIT JE ZETTEL, FARBE, GÜLTIG BIS
// (Robertos Entscheidung vom 23.09.: Vorlage Z3, alles in EINEM Dropdown mit
//  Symbolen, Standard "Nur Verwalter")
//
//  Teil A - Verfasser (als Verwalter "Chef"):
//  (A1) Das Dropdown "Sichtbar für" hat fünf Einträge mit Symbol, Standard
//       ist "Nur Verwalter".
//  (A2) Ein Zettel mit Standard landet als sichtbar="verwalter" im Bestand
//       (veroeffentlicht=false, konto=Chef, farbe=gelb).
//  (A3) "Bearbeiter & Verwalter" + Farbe Grün wird gespeichert.
//  (A4) "Alle" setzt zusätzlich veroeffentlicht=true (ältere Stände).
//  (A5) "Nur ich" wird gespeichert.
//  (A6) "Bestimmte Personen": Anpinnen erst nach dem Ankreuzen möglich; die
//       Empfänger stehen am Zettel.
//  (A7) "Gültig bis" gestern: der Zettel hängt sich ab, ist über
//       "abgelaufene Zettel · anzeigen" wieder einsehbar.
//  (A8) Jeder Zettel trägt oben rechts, wer ihn sieht.
//
//  Teil B - Wer sieht was:
//  (B1) Bearbeiterin Bea sieht Bearbeiter-, Alle- und die ALTEN Zettel
//       (veroeffentlicht -> Alle, ohne Angabe -> Bearbeiter) - aber nicht
//       "Nur Verwalter", "Nur ich" und den Zettel für Max.
//  (B2) Bearbeiter Max sieht den Zettel "für Max", aber nicht "Nur ich".
//  (B3) Leserin Lea sieht NUR "Alle"-Zettel und hat keine Bedienknöpfe.
//  (B4) Der Verwalter in der simulierten Leser-Ansicht (Auge) sieht das
//       Gleiche wie Lea.
//
//  Teil C - Nachträglich ändern und Monitor:
//  (C1) Chef stellt "Nur Verwalter" über das Zettel-Dropdown auf "Alle" um -
//       Bea sieht ihn danach.
//  (C2) Farbe am Zettel umschalten (Rosa) färbt den Zettel sofort.
//  (C3) Bea darf fremde Zettel nicht umstellen, ihre eigenen schon.
//  (C4) Monitor: nur "Alle"-Zettel laufen im Laufband, auch wenn 📺 an einem
//       "Nur Verwalter"-Zettel gesetzt ist.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};

const HEUTE = "2026-09-23";
const GESTERN = "2026-09-22";
const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [
    { name: "Chef", rolle: "verwalter", kennwortHash: "" },
    { name: "Bea", rolle: "bearbeiter", kennwortHash: "" },
    { name: "Max", rolle: "bearbeiter", kennwortHash: "" },
    { name: "Lea", rolle: "leser", kennwortHash: "" },
  ],
};
// Alte Zettel ohne Sichtbarkeits-Angabe (Stand vor dem 23.09.).
const altBestand = [
  { id: "alt-oeff", date: "2026-09-20", category: "NOTIZ", name: "RC", status: "open", note: "ALT OEFFENTLICH Sommerfest", zeit: "2026-09-20T08:00:00.000Z", veroeffentlicht: true },
  { id: "alt-int", date: "2026-09-20", category: "NOTIZ", name: "RC", status: "open", note: "ALT INTERN Gehaltsrunde", zeit: "2026-09-20T08:05:00.000Z" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  // Der Bestand lebt in Node - so sehen alle Benutzer denselben Stand
  // (wie über die gemeinsame Datei, hier über localStorage je Kontext).
  let bestand = JSON.stringify(altBestand);
  const seite = async (benutzer) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
    await p.addInitScript(({ c, benutzer, e }) => {
      try {
        delete window.showOpenFilePicker; delete window.showSaveFilePicker;
        localStorage.setItem("bta-standort", "scheurich");
        localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
        localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
        localStorage.setItem("werkstatt-kalender-entries", e);
      } catch (x) {}
    }, { c: config, benutzer, e: bestand });
    await p.goto(APP);
    await p.waitForTimeout(1200);
    const zu = async () => {
      bestand = await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries") || "[]");
      await ctx.close();
    };
    return { p, fehler, zu };
  };
  const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
  const wandText = (p) => p.locator('h2:has-text("Pinnwand"), h3:has-text("Pinnwand")').first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]").innerText().catch(async () => p.locator("body").innerText());
  const sieht = async (p, text) => (await p.getByText(text, { exact: false }).count()) > 0;
  // Verfasser öffnen, Text und Sichtbarkeit setzen, anpinnen.
  const anpinnen = async (p, text, { sichtbar, farbe, gueltigBis, empfaenger } = {}) => {
    await p.locator('button[aria-label="Neue Notiz anpinnen"]').click();
    await p.waitForTimeout(200);
    await p.locator("textarea").first().fill(text);
    if (sichtbar) await p.locator('select[aria-label="Sichtbar für"]').selectOption(sichtbar);
    // Die Farbwahl gibt es auch an jedem Zettel auf der Wand - hier nur die im Verfasser.
    if (farbe) await p.locator("div").filter({ has: p.locator("textarea") }).last().getByRole("radio", { name: `Farbe ${farbe}` }).click();
    if (gueltigBis) await p.locator('input[aria-label="Gültig bis"]').fill(gueltigBis);
    if (empfaenger) for (const n of empfaenger) await p.getByRole("checkbox", { name: `Empfänger ${n}` }).click();
    const name = p.getByPlaceholder(/Dein Name/);
    if (!(await name.inputValue())) await name.fill("Chef");
    await p.getByRole("button", { name: "Anpinnen", exact: true }).click();
    await p.waitForTimeout(400);
  };

  /* ================= Teil A: Verfasser als Chef ================= */
  {
    const { p, fehler, zu } = await seite("Chef");
    await p.locator('button[aria-label="Neue Notiz anpinnen"]').click();
    await p.waitForTimeout(200);
    const dd = p.locator('select[aria-label="Sichtbar für"]');
    const optionen = await dd.locator("option").allInnerTexts();
    ok("(A1) Dropdown „Sichtbar für“ mit fünf Einträgen und Symbolen, Standard „Nur Verwalter“",
      optionen.length === 5 && /🛡 Nur Verwalter/.test(optionen[0]) && /✏️ Bearbeiter & Verwalter/.test(optionen[1]) &&
      /👥 Alle/.test(optionen[2]) && /🔒 Nur ich/.test(optionen[3]) && /👤 Bestimmte Personen/.test(optionen[4]) &&
      (await dd.inputValue()) === "verwalter", optionen.join(" | "));
    await p.locator("textarea").first().fill("NUR VERWALTER Kündigung Lieferant");
    await p.getByPlaceholder(/Dein Name/).fill("Chef");
    await p.getByRole("button", { name: "Anpinnen", exact: true }).click();
    await p.waitForTimeout(400);
    let z = (await gespeichert(p)).find((e) => /NUR VERWALTER/.test(e.note));
    ok("(A2) Standard-Zettel: sichtbar=verwalter, veroeffentlicht=false, konto=Chef, farbe=gelb",
      z && z.sichtbar === "verwalter" && z.veroeffentlicht === false && z.konto === "Chef" && z.farbe === "gelb", JSON.stringify(z && { s: z.sichtbar, v: z.veroeffentlicht, k: z.konto, f: z.farbe }));

    await anpinnen(p, "BEARBEITER Zeiterfassung KW 38 nachtragen", { sichtbar: "bearbeiter", farbe: "Grün" });
    z = (await gespeichert(p)).find((e) => /BEARBEITER Zeiterfassung/.test(e.note));
    ok("(A3) Bearbeiter-Zettel in Grün gespeichert", z && z.sichtbar === "bearbeiter" && z.farbe === "gruen" && z.veroeffentlicht === false, JSON.stringify(z && { s: z.sichtbar, f: z.farbe }));

    await anpinnen(p, "ALLE Sprinkler-Prüfung Montag", { sichtbar: "alle" });
    z = (await gespeichert(p)).find((e) => /ALLE Sprinkler/.test(e.note));
    ok("(A4) Alle-Zettel: sichtbar=alle UND veroeffentlicht=true (für ältere Stände)", z && z.sichtbar === "alle" && z.veroeffentlicht === true);

    await anpinnen(p, "NUR ICH Einkauf Rahmenvertrag", { sichtbar: "ich" });
    z = (await gespeichert(p)).find((e) => /NUR ICH/.test(e.note));
    ok("(A5) Nur-ich-Zettel gespeichert", z && z.sichtbar === "ich" && z.konto === "Chef");

    await p.locator('button[aria-label="Neue Notiz anpinnen"]').click();
    await p.waitForTimeout(200);
    await p.locator("textarea").first().fill("FUER MAX Drehmomentschlüssel zurückbringen");
    await p.locator('select[aria-label="Sichtbar für"]').selectOption("personen");
    await p.waitForTimeout(150);
    const chips = await p.getByRole("group", { name: "Empfänger" }).getByRole("checkbox").allInnerTexts();
    const vorher = await p.getByRole("button", { name: "Anpinnen", exact: true }).isDisabled();
    await p.getByRole("checkbox", { name: "Empfänger Max" }).click();
    const nachher = await p.getByRole("button", { name: "Anpinnen", exact: true }).isDisabled();
    await p.getByRole("button", { name: "Anpinnen", exact: true }).click();
    await p.waitForTimeout(400);
    z = (await gespeichert(p)).find((e) => /FUER MAX/.test(e.note));
    ok("(A6) Bestimmte Personen: vier Benutzer-Chips, Anpinnen erst nach Ankreuzen, Empfänger=[Max]",
      chips.length === 4 && vorher === true && nachher === false && z && z.sichtbar === "personen" && JSON.stringify(z.empfaenger) === '["Max"]',
      `chips=${chips.length} vorher=${vorher} nachher=${nachher} empf=${JSON.stringify(z && z.empfaenger)}`);

    await anpinnen(p, "ABGELAUFEN Fremdfirma war gestern da", { sichtbar: "alle", gueltigBis: GESTERN });
    z = (await gespeichert(p)).find((e) => /ABGELAUFEN/.test(e.note));
    const abgelaufenKnopf = p.locator('button[aria-label="Abgelaufene Zettel anzeigen"]');
    ok("(A7) Gültig bis gestern: gespeichert, auf der Wand NICHT zu sehen, Hinweis „1 abgelaufener Zettel · anzeigen“",
      z && z.gueltigBis === GESTERN && !(await sieht(p, "ABGELAUFEN Fremdfirma")) && (await abgelaufenKnopf.count()) === 1 &&
      /1 abgelaufener Zettel/.test(await abgelaufenKnopf.innerText()));
    await abgelaufenKnopf.click();
    await p.waitForTimeout(200);
    ok("(A7) Nach dem Klick ist der abgelaufene Zettel sichtbar, mit „abgelaufen am 22.09.“",
      (await sieht(p, "ABGELAUFEN Fremdfirma")) && (await sieht(p, "abgelaufen am 22.09.")));
    await p.locator('button[aria-label="Abgelaufene Zettel ausblenden"]').click();
    await p.waitForTimeout(200);

    const body = await p.locator("body").innerText();
    ok("(A8) Jeder Zettel trägt sein Sichtbarkeits-Schild (🛡 Nur Verwalter, ✏️ Bearbeiter, 👥 Alle, 🔒 Nur ich, 👤 Max)",
      /🛡 Nur Verwalter/.test(body) && /✏️ Bearbeiter & Verwalter/.test(body) && /👥 Alle/.test(body) && /🔒 Nur ich/.test(body) && /👤 Max/.test(body));
    ok("(A8) Der Chef sieht als Verwalter alle sieben Zettel (fünf neue + zwei alte), den abgelaufenen nur auf Wunsch",
      (await sieht(p, "NUR VERWALTER")) && (await sieht(p, "BEARBEITER Zeiterfassung")) && (await sieht(p, "ALLE Sprinkler")) &&
      (await sieht(p, "NUR ICH")) && (await sieht(p, "FUER MAX")) && (await sieht(p, "ALT OEFFENTLICH")) && (await sieht(p, "ALT INTERN")) &&
      !(await sieht(p, "ABGELAUFEN Fremdfirma")));
    ok("(A) Keine Seitenfehler", fehler.length === 0, fehler.join(" / "));
    await zu();
  }

  /* ================= Teil B: Wer sieht was ================= */
  {
    const { p, zu } = await seite("Bea");
    ok("(B1) Bea (Bearbeiterin) sieht Bearbeiter-, Alle- und beide ALTEN Zettel",
      (await sieht(p, "BEARBEITER Zeiterfassung")) && (await sieht(p, "ALLE Sprinkler")) && (await sieht(p, "ALT OEFFENTLICH")) && (await sieht(p, "ALT INTERN")));
    ok("(B1) Bea sieht NICHT: Nur Verwalter, Nur ich, für Max",
      !(await sieht(p, "NUR VERWALTER")) && !(await sieht(p, "NUR ICH")) && !(await sieht(p, "FUER MAX")));
    // (C3) Bea darf fremde Zettel nicht umstellen - eigene schon.
    const fremdeSelects = await p.locator('select[aria-label="Sichtbarkeit Zettel"]').count();
    await anpinnen(p, "BEAS ZETTEL Ölwechsel KUKA", { sichtbar: "bearbeiter" });
    const eigeneSelects = await p.locator('select[aria-label="Sichtbarkeit Zettel"]').count();
    ok("(C3) Bea hat an fremden Zetteln KEIN Sichtbarkeits-Dropdown, an ihrem eigenen schon",
      fremdeSelects === 0 && eigeneSelects === 1, `fremd=${fremdeSelects} eigen=${eigeneSelects}`);
    await zu();
  }
  {
    const { p, zu } = await seite("Max");
    ok("(B2) Max sieht den Zettel „für Max“, aber weder „Nur ich“ noch „Nur Verwalter“",
      (await sieht(p, "FUER MAX")) && !(await sieht(p, "NUR ICH")) && !(await sieht(p, "NUR VERWALTER")));
    await zu();
  }
  {
    const { p, zu } = await seite("Lea");
    ok("(B3) Lea (Leserin) sieht NUR die Alle-Zettel (neu + alt veröffentlicht)",
      (await sieht(p, "ALLE Sprinkler")) && (await sieht(p, "ALT OEFFENTLICH")) &&
      !(await sieht(p, "ALT INTERN")) && !(await sieht(p, "BEARBEITER Zeiterfassung")) && !(await sieht(p, "NUR VERWALTER")) && !(await sieht(p, "BEAS ZETTEL")));
    ok("(B3) Lea hat keine Bedienknöpfe (kein +, kein Dropdown, keine Farbwahl)",
      (await p.locator('button[aria-label="Neue Notiz anpinnen"]').count()) === 0 &&
      (await p.locator('select[aria-label="Sichtbarkeit Zettel"]').count()) === 0 &&
      (await p.getByRole("radiogroup", { name: "Zettel-Farbe" }).count()) === 0);
    await zu();
  }

  /* ================= Teil C: nachträglich ändern, Auge, Monitor ================= */
  {
    const { p, zu } = await seite("Chef");
    // (B4) simulierte Leser-Ansicht über das Auge
    await p.locator('button[aria-label="Ansicht wechseln"]').click();
    await p.waitForTimeout(200);
    await p.getByRole("menuitemradio", { name: /Leser/ }).click();
    await p.waitForTimeout(500);
    ok("(B4) Der Verwalter in der Leser-Ansicht (Auge) sieht nur Alle-Zettel - wie Lea",
      (await sieht(p, "ALLE Sprinkler")) && !(await sieht(p, "NUR VERWALTER")) && !(await sieht(p, "ALT INTERN")) && !(await sieht(p, "NUR ICH")));
    await p.locator('button[aria-label="Ansicht wechseln"]').click();
    await p.waitForTimeout(200);
    await p.getByRole("menuitemradio", { name: /Verwalter/ }).click();
    await p.waitForTimeout(500);

    // (C1) Nur Verwalter -> Alle über das Zettel-Dropdown
    const karte = p.locator("div", { hasText: /^.*NUR VERWALTER Kündigung/ }).filter({ has: p.locator('select[aria-label="Sichtbarkeit Zettel"]') }).last();
    await karte.locator('select[aria-label="Sichtbarkeit Zettel"]').selectOption("alle");
    await p.waitForTimeout(400);
    let z = (await gespeichert(p)).find((e) => /NUR VERWALTER/.test(e.note));
    ok("(C1) Umstellen auf „Alle“: sichtbar=alle, veroeffentlicht=true", z && z.sichtbar === "alle" && z.veroeffentlicht === true, JSON.stringify(z && { s: z.sichtbar, v: z.veroeffentlicht }));

    // (C2) Farbe am Zettel
    await karte.getByRole("radio", { name: "Farbe Rosa" }).click();
    await p.waitForTimeout(400);
    z = (await gespeichert(p)).find((e) => /NUR VERWALTER/.test(e.note));
    const hinter = await p.locator("div", { hasText: /NUR VERWALTER Kündigung/ }).filter({ has: p.locator('select[aria-label="Sichtbarkeit Zettel"]') }).last()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    ok("(C2) Farbe Rosa: gespeichert und sofort auf dem Zettel (rgb(250, 220, 230))", z && z.farbe === "rosa" && hinter === "rgb(250, 220, 230)", `farbe=${z && z.farbe} bg=${hinter}`);

    // (C4) Monitor: 📺 am (jetzt Alle-)Zettel UND am Bearbeiter-Zettel - nur der Alle-Zettel läuft.
    await karte.locator('button[aria-label="Im Monitor anzeigen"]').click();
    await p.waitForTimeout(300);
    const karteB = p.locator("div", { hasText: /BEARBEITER Zeiterfassung/ }).filter({ has: p.locator('select[aria-label="Sichtbarkeit Zettel"]') }).last();
    await karteB.locator('button[aria-label="Im Monitor anzeigen"]').click();
    await p.waitForTimeout(300);
    const monitorFlags = (await gespeichert(p)).filter((e) => e.monitor).map((e) => e.note.slice(0, 12));
    await p.locator('button[aria-label="Werkstatt-Monitor"]').click();
    await p.waitForTimeout(800);
    const mon = await p.locator("#werkstatt-monitor").innerText();
    ok("(C4) Monitor: beide Zettel tragen 📺, im Laufband läuft NUR der Alle-Zettel",
      monitorFlags.length === 2 && /NUR VERWALTER Kündigung/.test(mon) && !/BEARBEITER Zeiterfassung/.test(mon), `flags=${monitorFlags.join(",")}`);
    await zu();
  }
  {
    const { p, zu } = await seite("Bea");
    ok("(C1) Bea sieht den umgestellten Zettel jetzt", await sieht(p, "NUR VERWALTER Kündigung"));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
