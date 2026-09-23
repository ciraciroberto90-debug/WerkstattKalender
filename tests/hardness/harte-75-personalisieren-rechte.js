// Härtetest: ZAHNRAD "PERSONALISIEREN" (Robertos Auftrag vom 21.09.)
//
//  (A) Rechte-Matrix je Benutzergruppe - liegt in der GEMEINSAMEN Datei:
//      (A1) Standard = Verhalten vor dem 21.09.: Bearbeiter sieht Werkstatt,
//           Berichte, TPM; Leser sieht Übersicht, Schichtplan, Berichte.
//      (A2) Nur der Verwalter hat die Reiter "Personalisieren" und "Benutzer &
//           Rechte" - der Bearbeiter keinen von beiden (GEGENPROBE).
//      (A3) Verwalter stellt um: Bearbeiter Schichtplan "nur ansehen", Planung
//           und TPM "ausgeblendet"; Leser TPM "nur ansehen", Störungen
//           "ausgeblendet". Die Wahl steht als eigener Eintrag config|rechte
//           in der Datei.
//      (A4) Zweiter Rechner, Bearbeiter: kein Werkstatt-, kein TPM-Reiter,
//           "Schichtplan" direkt - und dort STUMM ("nur ansehen"). Ohne die
//           Änderung stünde die volle Reihe da (Werkstatt · TPM).
//      (A5) Zweiter Rechner, Leser: TPM-Reiter NEU da (vorher nie), im Bereich
//           Berichte fehlt "Störungen", und die rote Störungs-Kachel der
//           Übersicht ist weg - obwohl eine offene Störung existiert.
//      (A6) "Standard wiederherstellen" bringt die alte Reihe zurück.
//  (B) Übersicht je Rechner (localStorage, nicht Datei):
//      (B1) Vorlage "Leitstand": Pinnwand und "Heute da" weg, Kennzahlen da.
//      (B2) Die Wahl überlebt den Neustart desselben Rechners.
//      (B3) Ein Haken ("Kennzahlen") macht daraus "Eigene Zusammenstellung".
//      (B4) Reihenfolge: "Offene Störungen nach oben" -> steht vor den Kennzahlen.
//      (B5) Ein ANDERER Rechner (frischer Kontext) hat weiter das Standard-Layout.
//  (C) Anordnen-Modus direkt auf der Übersicht: Rahmen, ✕, Pfeile, ⇄, echtes
//      Ziehen mit der Maus, Esc beendet - die Anordnung bleibt.
//  (D) Schichtplan-Notizen je Gruppe: "Sichtbar für" an der Notiz; Leser,
//      Bearbeiter und Verwalter sehen je nach Stufe eine, zwei oder drei.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  // Die gemeinsame Datei lebt in Node - so teilen sich alle "Rechner" denselben Stand.
  const jetztIso = new Date().toISOString();
  const d = new Date();
  const heuteKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let dateiInhalt = JSON.stringify({
    format: "werkstatt-kalender-v1", savedAt: jetztIso, deleted: {},
    // Drei Schichtplan-Notizen an derselben Zelle - je eine Sichtbarkeit (Teil D)
    entries: [
      { id: "n-alle", category: "SCHICHTNOTIZ", name: "T. Balles", date: heuteKey, note: "NOTIZ-ALLE Zahnarzt", verfasser: "Chef", sichtbarFuer: "alle", updatedAt: jetztIso },
      { id: "n-bearb", category: "SCHICHTNOTIZ", name: "T. Balles", date: heuteKey, note: "NOTIZ-BEARBEITER Gespräch", verfasser: "Chef", sichtbarFuer: "bearbeiter", updatedAt: jetztIso },
      { id: "n-verw", category: "SCHICHTNOTIZ", name: "T. Balles", date: heuteKey, note: "NOTIZ-VERWALTER Abmahnung", verfasser: "Chef", sichtbarFuer: "verwalter", updatedAt: jetztIso },
    ],
    config: {
      tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [],
      team: [{ name: "T. Balles", rolle: "mech" }],
      benutzer: [
        { name: "Chef", rolle: "verwalter", kennwortHash: "" },
        { name: "Bea", rolle: "bearbeiter", kennwortHash: "" },
        { name: "Lea", rolle: "leser", kennwortHash: "" },
      ],
    },
  });

  // Ein "Rechner" = ein Browser-Kontext (eigener localStorage). Der Benutzer
  // wird als gemerkte Anmeldung mitgegeben, damit der Dialog nicht dazwischenfunkt.
  const neueSeite = async (ctx, benutzer) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await p.exposeFunction("__leseDatei", () => dateiInhalt);
    await p.exposeFunction("__schreibeDatei", (t) => { dateiInhalt = t; });
    await p.addInitScript(() => {
      const handle = {
        name: "kalender-daten.json", kind: "file",
        async getFile() { return new File([await window.__leseDatei()], "kalender-daten.json", { type: "application/json" }); },
        async createWritable() { let b = ""; return { async write(t) { b += t; }, async close() { await window.__schreibeDatei(b); } }; },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    await p.addInitScript((name) => {
      try {
        localStorage.setItem("bta-standort", "scheurich");
        localStorage.setItem("werkstatt-kalender-benutzer", name);
        localStorage.setItem("werkstatt-kalender-name", name);
        // Eine offene Störung im örtlichen Zwischenspeicher - für die rote
        // Kachel auf der Übersicht (A5) und die Kachel im Bereich Berichte.
        localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify([
          { id: "s1", date: "2026-09-21", anlage: "TS480", stoerung: "Prüf-Störung offen", offen: true, gemeldetAt: "2026-09-21T06:00:00" },
        ]));
      } catch (e) {}
    }, benutzer);
    await p.goto(APP);
    await p.waitForTimeout(500);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1100);
    await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(400);
    return p;
  };
  const neuerRechner = async (benutzer) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await neueSeite(ctx, benutzer);
    return { ctx, p };
  };
  const hauptReihe = async (p) => (await p.locator("header button, .flex.rounded.overflow-hidden.border.border-white\\/20 button").allInnerTexts()).map((t) => t.replace(/\d+$/, "").trim());
  // Die Bereichs-Knöpfe tragen ggf. eine Zahl (Badge) und CSS-Großschrift -
  // deshalb per Muster statt exakt.
  const tab = (p, name) => p.getByRole("button", { name: new RegExp("^" + name + "\\s*\\d*$", "i") });
  const hatTab = async (p, name) => (await tab(p, name).count()) > 0;

  /* ================= (A1) Standard: alles wie vor dem 21.09. ================= */
  const bea0 = await neuerRechner("Bea");
  ok("(A1) Bearbeiter (Standard) sieht Werkstatt, Berichte und TPM",
    (await hatTab(bea0.p, "Werkstatt")) && (await hatTab(bea0.p, "Berichte")) && (await hatTab(bea0.p, "TPM")),
    (await hauptReihe(bea0.p)).join(" · "));
  ok("(A1) Bearbeiter (Standard) sieht die rote Störungs-Kachel auf der Übersicht",
    /Offene Störungen/i.test(await bea0.p.locator("body").innerText()));
  await bea0.p.locator('button[aria-label="Verwalten"]').click();
  await bea0.p.waitForTimeout(400);
  ok("(A2) GEGENPROBE: Der Bearbeiter hat weder „Personalisieren“ noch „Benutzer & Rechte“",
    !(await hatTab(bea0.p, "Personalisieren")) && !(await hatTab(bea0.p, "Benutzer & Rechte")));
  await bea0.ctx.close();

  const lea0 = await neuerRechner("Lea");
  ok("(A1) Leser (Standard) sieht Übersicht, Schichtplan, Berichte - kein TPM, kein Werkstatt",
    (await hatTab(lea0.p, "Schichtplan")) && (await hatTab(lea0.p, "Berichte")) && !(await hatTab(lea0.p, "TPM")) && !(await hatTab(lea0.p, "Werkstatt")),
    (await hauptReihe(lea0.p)).join(" · "));
  await lea0.ctx.close();

  /* ================= (A3) Verwalter stellt die Matrix um ================= */
  const chef = await neuerRechner("Chef");
  await chef.p.locator('button[aria-label="Verwalten"]').click();
  await chef.p.waitForTimeout(400);
  ok("(A2) Der Verwalter hat die Reiter „Personalisieren“ UND „Benutzer & Rechte“",
    (await hatTab(chef.p, "Personalisieren")) && (await hatTab(chef.p, "Benutzer & Rechte")));
  await chef.p.getByRole("button", { name: "Benutzer & Rechte", exact: true }).click();
  await chef.p.waitForTimeout(400);
  const seite = await chef.p.locator("body").innerText();
  ok("(A3) „Benutzer & Rechte“ vereint Benutzerliste und Rechte-Tabelle an einem Ort",
    (await chef.p.locator('input[aria-label="Benutzername 1"]').count()) === 1 && /Rechte der Benutzergruppen/i.test(seite));
  ok("(A3) Leser-Auswahl bei Schichtplan kennt KEIN „bearbeiten“ (Nur-Leser bleibt Nur-Leser)",
    !(await chef.p.locator('select[aria-label="Leser: Schichtplan"] option').allInnerTexts()).includes("bearbeiten"));
  ok("(A3) Leser bei Störungen darf „bearbeiten“ (eigene Datei, Grundregel) - und steht als Standard so",
    (await chef.p.locator('select[aria-label="Leser: Störungen"]').inputValue()) === "bearbeiten");
  await chef.p.locator('select[aria-label="Bearbeiter: Schichtplan"]').selectOption("sehen");
  await chef.p.waitForTimeout(500);
  await chef.p.locator('select[aria-label="Bearbeiter: Planung"]').selectOption("aus");
  await chef.p.waitForTimeout(500);
  await chef.p.locator('select[aria-label="Bearbeiter: TPM"]').selectOption("aus");
  await chef.p.waitForTimeout(500);
  await chef.p.locator('select[aria-label="Leser: TPM"]').selectOption("sehen");
  await chef.p.waitForTimeout(500);
  await chef.p.locator('select[aria-label="Leser: Störungen"]').selectOption("aus");
  await chef.p.waitForTimeout(900);
  {
    const datei = JSON.parse(dateiInhalt);
    const eintrag = (datei.entries || []).find((e) => e.id === "config|rechte");
    const r = eintrag && eintrag.value;
    ok("(A3) Die Matrix steht als eigener Eintrag config|rechte in der gemeinsamen Datei",
      !!r && r.bearbeiter && r.bearbeiter.SCHICHTPLAN === "sehen" && r.bearbeiter.PLANUNG === "aus" && r.bearbeiter.TPM === "aus"
      && r.leser && r.leser.TPM === "sehen" && r.leser.STOERUNGEN === "aus",
      r ? JSON.stringify({ b: r.bearbeiter.SCHICHTPLAN + "/" + r.bearbeiter.PLANUNG + "/" + r.bearbeiter.TPM, l: r.leser.TPM + "/" + r.leser.STOERUNGEN }) : "kein Eintrag");
  }
  ok("(A3) Der Verwalter selbst bleibt ungebremst (Werkstatt und TPM weiter da)",
    (await hatTab(chef.p, "Werkstatt")) && (await hatTab(chef.p, "TPM")));

  /* ================= (A4) Zweiter Rechner: Bearbeiter ================= */
  const bea = await neuerRechner("Bea");
  ok("(A4) Bearbeiter: kein Werkstatt-Reiter, kein TPM - dafür „Schichtplan“ direkt",
    !(await hatTab(bea.p, "Werkstatt")) && !(await hatTab(bea.p, "TPM")) && (await hatTab(bea.p, "Schichtplan")),
    (await hauptReihe(bea.p)).join(" · "));
  await tab(bea.p, "Schichtplan").click();
  await bea.p.waitForTimeout(600);
  ok("(A4) Im Schichtplan ist der Bearbeiter STUMM („nur ansehen“) - obwohl er schreiben dürfte",
    /Werkstattschichtplan – nur ansehen/.test(await bea.p.locator("body").innerText()));
  ok("(A4) Das Zahnrad bleibt dem Bearbeiter (Aktion „Verwalten“ steht auf erlaubt)",
    (await bea.p.locator('button[aria-label="Verwalten"]').count()) === 1);
  await bea.ctx.close();

  /* ================= (A5) Zweiter Rechner: Leser ================= */
  const lea = await neuerRechner("Lea");
  ok("(A5) Leser: TPM-Reiter ist NEU da (vorher nie für Leser)", await hatTab(lea.p, "TPM"),
    (await hauptReihe(lea.p)).join(" · "));
  ok("(A5) Leser: die rote Störungs-Kachel der Übersicht ist WEG (Störungen ausgeblendet)",
    !/Offene Störungen/i.test(await lea.p.locator("body").innerText()));
  await tab(lea.p, "Berichte").click();
  await lea.p.waitForTimeout(500);
  const berichteReihe = await lea.p.locator("body").innerText();
  ok("(A5) Leser im Bereich Berichte: To-do da, „Störungen“ fehlt in Untermenü und Kacheln",
    /To-do/.test(berichteReihe) && (await tab(lea.p, "Störungen").count()) === 0);
  await tab(lea.p, "TPM").click();
  await lea.p.waitForTimeout(600);
  ok("(A5) Leser kommt in die TPM-Übersicht (Klammer lässt es zu) und bleibt Nur-Leser (kein Zahnrad)",
    /Wartungs-Board/i.test(await lea.p.locator("body").innerText()) && (await lea.p.locator('button[aria-label="Verwalten"]').count()) === 0);
  await lea.ctx.close();

  /* ================= (A6) Standard wiederherstellen ================= */
  await chef.p.getByRole("button", { name: "Standard wiederherstellen" }).click();
  await chef.p.waitForTimeout(900);
  {
    const datei = JSON.parse(dateiInhalt);
    const eintrag = (datei.entries || []).find((e) => e.id === "config|rechte");
    ok("(A6) Standard wiederhergestellt: Bearbeiter TPM wieder „bearbeiten“, Leser Störungen wieder „bearbeiten“",
      !!eintrag && eintrag.value.bearbeiter.TPM === "bearbeiten" && eintrag.value.leser.STOERUNGEN === "bearbeiten");
  }
  const bea2 = await neuerRechner("Bea");
  ok("(A6) Bearbeiter hat Werkstatt und TPM wieder", (await hatTab(bea2.p, "Werkstatt")) && (await hatTab(bea2.p, "TPM")));
  await bea2.ctx.close();

  /* ================= (B) Übersicht je Rechner ================= */
  const vorher = await chef.p.locator("body").innerText();
  await chef.p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => chef.p.keyboard.press("Escape"));
  await chef.p.waitForTimeout(400);
  const standardSicht = await chef.p.locator("body").innerText();
  ok("(B1) Vorher (Standard): Pinnwand und „Heute da“ stehen auf der Übersicht",
    /📌 Pinnwand/i.test(standardSicht) && /👷 Heute da/i.test(standardSicht));
  await chef.p.locator('button[aria-label="Verwalten"]').click();
  await chef.p.waitForTimeout(400);
  await chef.p.getByRole("button", { name: "Personalisieren", exact: true }).click();
  await chef.p.waitForTimeout(300);
  await chef.p.locator('button[aria-label="Vorlage Leitstand"]').click();
  await chef.p.waitForTimeout(300);
  ok("(B1) Die Vorlage ist als „aktiv“ markiert",
    (await chef.p.locator('button[aria-label="Vorlage Leitstand"]').getAttribute("aria-pressed")) === "true");
  await chef.p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => chef.p.keyboard.press("Escape"));
  await chef.p.waitForTimeout(500);
  const leitstand = await chef.p.locator("body").innerText();
  ok("(B1) Leitstand: Pinnwand und „Heute da“ sind weg, die Kennzahl „Heute fällig“ bleibt",
    !/📌 Pinnwand/i.test(leitstand) && !/👷 Heute da/i.test(leitstand) && /Heute fällig/.test(leitstand));
  ok("(B1) Die Wahl liegt im localStorage DIESES Rechners, nicht in der Datei",
    (() => { try { return true; } catch (e) { return false; } })()
    && !dateiInhalt.includes("wk-uebersicht-layout") && !dateiInhalt.includes("leitstand"));
  const gespeichert = await chef.p.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout") || "null"));
  ok("(B1) localStorage trägt die Vorlage", !!gespeichert && gespeichert.vorlage === "leitstand" && gespeichert.bloecke.pinnwand === false);

  /* ---- (B2) Neustart desselben Rechners: neue Seite im selben Kontext
     (derselbe localStorage), die Datei wird wie beim Start neu verbunden ---- */
  await chef.p.close();
  chef.p = await neueSeite(chef.ctx, "Chef");
  const nachNeustart = await chef.p.locator("body").innerText();
  ok("(B2) Nach dem Neustart bleibt der Leitstand (keine Pinnwand)",
    !/📌 Pinnwand/i.test(nachNeustart) && /Heute fällig/.test(nachNeustart));

  /* ---- (B3) Einzelner Haken -> eigene Zusammenstellung ---- */
  await chef.p.locator('button[aria-label="Verwalten"]').click();
  await chef.p.waitForTimeout(400);
  await chef.p.getByRole("button", { name: "Personalisieren", exact: true }).click();
  await chef.p.waitForTimeout(300);
  await chef.p.locator('input[aria-label="Übersicht: Kennzahlen"]').click();
  await chef.p.waitForTimeout(300);
  ok("(B3) Ein Haken weniger: die Vorlage heißt jetzt „Eigene Zusammenstellung“",
    (await chef.p.locator('button[aria-label="Vorlage Leitstand"]').getAttribute("aria-pressed")) === "false"
    && (await chef.p.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout")).vorlage)) === "eigene");
  /* ---- (B4) Reihenfolge ---- */
  // Im Leitstand stehen die Störungen an zweiter Stelle - ein Schritt nach oben genügt
  await chef.p.locator('button[aria-label="Offene Störungen nach oben"]').click();
  await chef.p.waitForTimeout(300);
  const reihenfolge = await chef.p.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout")).reihenfolge);
  ok("(B4) „Offene Störungen“ steht jetzt an erster Stelle", reihenfolge[0] === "stoerungen", reihenfolge.join(" > "));
  // Kennzahlen wieder an, damit sichtbar wird, ob die Störungen VOR ihnen stehen
  await chef.p.locator('input[aria-label="Übersicht: Kennzahlen"]').click();
  await chef.p.waitForTimeout(300);
  await chef.p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => chef.p.keyboard.press("Escape"));
  await chef.p.waitForTimeout(500);
  const text = await chef.p.locator("body").innerText();
  ok("(B4) Auf der Übersicht kommt „Offene Störungen“ VOR „Heute fällig“",
    text.search(/Offene Störungen/i) > -1 && text.indexOf("Heute fällig") > -1 && text.search(/Offene Störungen/i) < text.indexOf("Heute fällig"));

  /* ---- (B5) Anderer Rechner: Standard ---- */
  const chef2 = await neuerRechner("Chef");
  const anderer = await chef2.p.locator("body").innerText();
  ok("(B5) Ein anderer Rechner hat weiter das Standard-Layout (Pinnwand und Heute da da)",
    /📌 Pinnwand/i.test(anderer) && /👷 Heute da/i.test(anderer));
  await chef2.ctx.close();
  await chef.ctx.close();

  /* ================= (C) Anordnen-Modus direkt auf der Übersicht =================
     Robertos Gedanke vom 21.09.: Klick auf "Personalisieren" friert die
     Übersicht ein, Kacheln lassen sich verschieben, tauschen, ausblenden. */
  const an = await neuerRechner("Chef");
  const ap = an.p;
  await ap.locator('button[aria-label="Verwalten"]').click();
  await ap.waitForTimeout(400);
  await ap.getByRole("button", { name: "Personalisieren", exact: true }).click();
  await ap.waitForTimeout(300);
  await ap.locator('button[aria-label="Übersicht direkt anordnen"]').click();
  await ap.waitForTimeout(500);
  ok("(C1) Der Knopf schließt den Dialog und schaltet den Anordnen-Modus ein (Leiste oben)",
    (await ap.locator('[role="region"][aria-label="Übersicht anordnen"]').count()) === 1
    && (await ap.locator('button[aria-label="Verwalten"]').count()) === 1);
  const rahmenZahl = await ap.locator("[data-anordnen]").count();
  // Seit dem 23.09. (Kachel-Inhalt wählbar) sind die vier Zahlen eigene
  // Kacheln: 4 Abschnitte + 7 Kennzahl-Kacheln + 2 Spalten.
  ok("(C1) Jede Kachel hat einen Rahmen: 4 Abschnitte + 7 Kennzahl-Kacheln + 2 Spalten",
    rahmenZahl === 13, String(rahmenZahl));
  ok("(C1) Der Inhalt ist eingefroren: das Pinnwand-Plus nimmt keine Klicks mehr an",
    (await ap.locator('button[aria-label="Neue Notiz anpinnen"]').evaluate((el) => {
      let n = el; while (n) { if (getComputedStyle(n).pointerEvents === "none") return true; n = n.parentElement; } return false;
    })));

  /* ---- (C2) Ausblenden + Einblenden über den Chip ---- */
  await ap.locator('button[aria-label="Heute da ausblenden"]').click();
  await ap.waitForTimeout(300);
  ok("(C2) ✕ blendet „Heute da“ aus - der Rahmen ist weg, oben steht der „+“-Chip",
    (await ap.locator('[data-anordnen="heuteDa"]').count()) === 0
    && (await ap.locator('button[aria-label="Heute da einblenden"]').count()) === 1
    && (await ap.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout")).bloecke.heuteDa)) === false);
  await ap.locator('button[aria-label="Heute da einblenden"]').click();
  await ap.waitForTimeout(300);
  ok("(C2) Der Chip holt „Heute da“ zurück", (await ap.locator('[data-anordnen="heuteDa"]').count()) === 1);

  /* ---- (C3) Pfeile: Abschnitt und Kachel ---- */
  await ap.locator('button[aria-label="Offene Störungen nach oben"]').click();
  await ap.waitForTimeout(200);
  await ap.locator('button[aria-label="Offene Störungen nach oben"]').click();
  await ap.waitForTimeout(300);
  const lay1 = await ap.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout")));
  ok("(C3) Zweimal ▲: „Offene Störungen“ steht ganz oben", lay1.reihenfolge[0] === "stoerungen", lay1.reihenfolge.join(" > "));
  await ap.locator('button[aria-label="Uhr & Schicht nach links"]').click();
  await ap.waitForTimeout(300);
  const lay2 = await ap.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout")));
  ok("(C3) ◀ an der Uhr: sie steht jetzt vor der OEE-Kachel",
    lay2.kacheln.indexOf("uhr") < lay2.kacheln.indexOf("oee"), lay2.kacheln.join(" > "));
  const reiheDom = await ap.locator('[data-anordnen="kennzahlen"] [data-anordnen]').evaluateAll((els) => els.map((e) => e.getAttribute("data-anordnen")));
  ok("(C3) Die Kennzahlen-Reihe zeichnet in der neuen Reihenfolge", reiheDom.join(",") === lay2.kacheln.join(","), reiheDom.join(","));

  /* ---- (C4) Seiten tauschen ---- */
  await ap.locator('button[aria-label="Pinnwand Seite tauschen"]').click();
  await ap.waitForTimeout(300);
  const spaltenDom = await ap.locator('[data-anordnen="hauptzeile"] [data-anordnen]').evaluateAll((els) => els.map((e) => e.getAttribute("data-anordnen")));
  ok("(C4) ⇄ tauscht die Seiten: Pinnwand links, Tagesliste rechts",
    spaltenDom.join(",") === "pinnwand,tagesliste"
    && (await ap.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout")).tausch)) === true, spaltenDom.join(","));

  /* ---- (C5) Ziehen: „Heute da“ auf die Kennzahlen-Reihe ziehen ---- */
  const vorZug = (await ap.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout")))).reihenfolge;
  await ap.locator('[data-anordnen="heuteDa"]').dragTo(ap.locator('[data-anordnen="kennzahlen"]'));
  await ap.waitForTimeout(400);
  const nachZug = (await ap.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout")))).reihenfolge;
  ok("(C5) Ziehen mit der Maus verschiebt den Abschnitt (Heute da auf den Platz der Kennzahlen)",
    nachZug.indexOf("heuteDa") === vorZug.indexOf("kennzahlen") && nachZug.join() !== vorZug.join(),
    vorZug.join(">") + " -> " + nachZug.join(">"));

  /* ---- (C6) Fertig / Esc beendet den Modus, die Anordnung bleibt ---- */
  await ap.keyboard.press("Escape");
  await ap.waitForTimeout(300);
  ok("(C6) Esc beendet den Anordnen-Modus (Leiste und Rahmen weg)",
    (await ap.locator('[role="region"][aria-label="Übersicht anordnen"]').count()) === 0 && (await ap.locator("[data-anordnen]").count()) === 0);
  const text2 = await ap.locator("body").innerText();
  ok("(C6) Die Anordnung bleibt: Offene Störungen stehen vor „Heute fällig“, Pinnwand vor der Tagesliste",
    text2.search(/Offene Störungen/i) < text2.indexOf("Heute fällig") && text2.search(/📌 Pinnwand/i) < text2.search(/HEUTE · /i));
  await an.ctx.close();

  /* ================= (D) Schichtplan-Notizen je Gruppe sichtbar =================
     Robertos Ansage vom 21.09.: an jeder Zellen-Notiz wählbar, welche Gruppe
     sie sehen darf. Drei Notizen an derselben Zelle - Leser, Bearbeiter und
     Verwalter sehen je nach Stufe eine, zwei oder alle drei. */
  const zelle = `button[aria-label="Matrix T. Balles ${heuteKey}"]`;
  const kastenText = async (p, tabName) => {
    await tab(p, tabName).click();
    await p.waitForTimeout(600);
    await p.locator(zelle).hover();
    await p.waitForTimeout(400);
    return await p.locator("body").innerText();
  };
  const lea3 = await neuerRechner("Lea");
  const tL = await kastenText(lea3.p, "Schichtplan");
  ok("(D1) Leser sieht NUR die Notiz „für alle“ - Bearbeiter- und Verwalter-Notiz bleiben unsichtbar",
    /NOTIZ-ALLE/.test(tL) && !/NOTIZ-BEARBEITER/.test(tL) && !/NOTIZ-VERWALTER/.test(tL));
  await lea3.ctx.close();
  const bea3 = await neuerRechner("Bea");
  const tB = await kastenText(bea3.p, "Werkstatt");
  ok("(D2) Bearbeiter sieht „für alle“ und „Bearbeiter“, nicht die Verwalter-Notiz",
    /NOTIZ-ALLE/.test(tB) && /NOTIZ-BEARBEITER/.test(tB) && !/NOTIZ-VERWALTER/.test(tB));
  await bea3.ctx.close();
  const chef3 = await neuerRechner("Chef");
  const tC = await kastenText(chef3.p, "Werkstatt");
  ok("(D3) Verwalter sieht alle drei, mit Schloss-Hinweis an den eingeschränkten",
    /NOTIZ-ALLE/.test(tC) && /NOTIZ-BEARBEITER/.test(tC) && /NOTIZ-VERWALTER/.test(tC) && /nur Verwalter/.test(tC));
  // Die Wahl sitzt direkt an der Notiz: Zelle anklicken -> Notiz ändern -> "Sichtbar für"
  await chef3.p.locator(zelle).click();
  await chef3.p.waitForTimeout(400);
  await chef3.p.getByRole("button", { name: /Notiz ändern/ }).click();
  await chef3.p.waitForTimeout(400);
  const auswahl = chef3.p.locator('select[aria-label="Notiz sichtbar für"]');
  ok("(D4) Der Notiz-Dialog hat die Auswahl „Sichtbar für“ mit drei Stufen",
    (await auswahl.count()) === 1 && (await auswahl.locator("option").count()) === 3);
  await auswahl.selectOption("verwalter");
  await chef3.p.getByRole("button", { name: "Speichern", exact: true }).click();
  await chef3.p.waitForTimeout(900);
  {
    const datei = JSON.parse(dateiInhalt);
    const n = datei.entries.find((e) => e.id === "n-alle");
    ok("(D4) Die Wahl steht am Eintrag in der gemeinsamen Datei (sichtbarFuer = verwalter)",
      !!n && n.sichtbarFuer === "verwalter", n ? n.sichtbarFuer : "Eintrag fehlt");
  }
  await chef3.ctx.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
