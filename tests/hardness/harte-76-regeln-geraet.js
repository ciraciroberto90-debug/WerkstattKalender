// Härtetest: REGELN & LISTEN + DIESER RECHNER (Robertos Wahl vom 21.09.)
//
//  (R) ⚙ → "Regeln & Listen" (gemeinsame Datei, config.regeln):
//      (R1) Bundesland umstellen (BY -> NW), eigene freie Tage, eine neue
//           Fehlerart, Schwellen, Textbausteine, ein Pflichtfeld - mit
//           "Speichern" übernommen, steht in der Konfiguration.
//      (R2) Feiertage folgen dem Bundesland (kein Dreikönig mehr, Allerheiligen
//           bleibt) und die Betriebsferien zählen wie Feiertage.
//      (R3) Störbericht: neue Fehlerart in der Auswahl, Textbaustein setzt
//           Text ein, das Pflichtfeld hält "Speichern" zurück.
//      (R4) To-do-Vorwarnung: Frist in zwei Tagen wird orange (⏳).
//      (R5) Schwelle "lang": 45 Minuten zählen ab 30 als lang (Filter-Zähler).
//      (R6) Pinnwand: Textbaustein-Auswahl füllt den Zettel.
//  (G) ⚙ → Personalisieren → "Dieser Rechner" (localStorage, nur hier):
//      (G1) Startansicht Schichtplan + Zoom 125 % - gilt sofort und beim
//           nächsten Öffnen desselben Rechners; ein anderer Rechner bleibt normal.
//      (G2) Nachtmodus-Automatik nach Zeitfenster (21 Uhr dunkel, 8 Uhr hell).
//      (G3) Leser-Rücksprung mit 2 statt 15 Minuten.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const heute = new Date();
  const inZwei = new Date(heute); inZwei.setDate(inZwei.getDate() + 2);

  // Örtlicher Betrieb ohne Datei-Anbindung (wie harte-64): Konfiguration und
  // Bestand im localStorage, kein Benutzer -> alles wie ein Verwalter.
  // Läuft IM Browser - deshalb kommen alle Werte als Argument, nicht per Closure.
  const saat = (extra) => {
    try {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
        tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [],
        team: [{ name: "T. Balles", rolle: "mech" }],
        ...(extra.benutzer ? { benutzer: extra.benutzer } : {}),
      }));
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([
        { id: "todo1", category: "TODO", name: "Filter tauschen", status: "open", date: extra.heute, bis: extra.inZwei, wer: "T. Balles" },
      ]));
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify([
        { id: "s1", date: extra.heute, anlage: "TS480", stoerung: "Band stand 45 Minuten", offen: false, ausfallzeit: 45, gemeldetAt: extra.heute + "T06:00:00", behobenAt: extra.heute + "T06:45:00", nr: 1 },
      ]));
      if (extra.geraet) localStorage.setItem("wk-geraet", JSON.stringify(extra.geraet));
      if (extra.benutzerName) localStorage.setItem("werkstatt-kalender-benutzer", extra.benutzerName);
    } catch (e) {}
  };
  const neueSeite = async (ctx, extra = {}, clock = null) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    if (clock) await p.clock.install({ time: clock });
    await p.addInitScript(saat, { heute: key(heute), inZwei: key(inZwei), ...extra });
    await p.goto(APP);
    await p.waitForTimeout(1200);
    return p;
  };
  const tab = (p, name) => p.getByRole("button", { name: new RegExp("^" + name + "\\s*\\d*$", "i") });

  /* ================= (R1) Regeln setzen ================= */
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await neueSeite(ctx);
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(400);
  ok("(R1) Das Zahnrad hat den Reiter „Regeln & Listen“", (await p.getByRole("button", { name: "Regeln & Listen", exact: true }).count()) === 1);
  await p.getByRole("button", { name: "Regeln & Listen", exact: true }).click();
  await p.waitForTimeout(400);
  await p.locator('select[aria-label="Bundesland"]').selectOption("NW");
  await p.locator('button[aria-label="Freie Tage hinzufügen"]').click();
  await p.locator('input[aria-label="Freie Tage 1 von"]').fill("2026-12-24");
  await p.locator('input[aria-label="Freie Tage 1 bis"]').fill("2026-12-31");
  await p.locator('input[aria-label="Freie Tage 1 Name"]').fill("Betriebsferien");
  await p.locator('button[aria-label="Fehlerart hinzufügen"]').click();
  const fehlerarten = p.locator('input[aria-label^="Fehlerart "]');
  await fehlerarten.last().fill("Sensorik");
  await p.locator('input[aria-label="Störung zählt als lang ab"]').fill("30");
  await p.locator('input[aria-label="To-do-Vorwarnung"]').fill("3");
  await p.locator('input[aria-label="TPM-Quote Ziel"]').fill("90");
  await p.locator('button[aria-label="Textbaustein Pinnwand hinzufügen"]').click();
  await p.locator('input[aria-label="Textbaustein Pinnwand 1"]').fill("Ersatzteil bestellt, kommt Do.");
  await p.locator('button[aria-label="Textbaustein Störbericht hinzufügen"]').click();
  await p.locator('input[aria-label="Textbaustein Störbericht 1"]').fill("Sicherung getauscht, Anlage wieder frei");
  await p.locator('input[aria-label="Pflichtfeld Fehlerart"]').check();
  await p.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await p.waitForTimeout(900);
  const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"));
  const r = cfg.regeln || {};
  ok("(R1) Die Regeln stehen in der Konfiguration (Bundesland, freie Tage, Fehlerart, Schwellen, Bausteine, Pflichtfeld)",
    r.feiertage && r.feiertage.bundesland === "NW" && r.feiertage.eigene.length === 1 && r.feiertage.eigene[0].bis === "2026-12-31"
    && r.listen && r.listen.fehlerarten.includes("Sensorik") && r.schwellen && r.schwellen.ausfallHochMin === 30 && r.schwellen.todoWarnTage === 3
    && r.vorlagen && r.vorlagen.zettel[0] === "Ersatzteil bestellt, kommt Do." && r.vorlagen.pflicht.fehlerart === true,
    JSON.stringify({ bl: r.feiertage && r.feiertage.bundesland, lang: r.schwellen && r.schwellen.ausfallHochMin }));

  /* ================= (R2) Feiertage folgen der Regel ================= */
  const fei = await p.evaluate(() => { const m = window.__wkFeiertageTest(2026); return { drei: m.get("2026-01-06") || null, aller: m.get("2026-11-01") || null, ferien: m.get("2026-12-28") || null, silvester: m.get("2026-12-31") || null }; });
  ok("(R2) NRW: kein Dreikönigstag mehr, Allerheiligen bleibt", fei.drei === null && fei.aller === "Allerheiligen", JSON.stringify(fei));
  ok("(R2) Betriebsferien 24.–31.12. zählen wie Feiertage (28.12. und 31.12.)", fei.ferien === "Betriebsferien" && fei.silvester === "Betriebsferien");

  /* ================= (R3) Störbericht: Liste, Baustein, Pflichtfeld ================= */
  await tab(p, "Berichte").click();
  await p.waitForTimeout(400);
  await tab(p, "Störungen").first().click();
  await p.waitForTimeout(600);
  const seitenText = await p.locator("body").innerText();
  ok("(R5) Der Schnellfilter heißt jetzt „Über 30 min“ und zählt die 45-Minuten-Störung", /Über 30 min/.test(seitenText) && /Über 30 min\s*1/.test(seitenText.replace(/\n/g, " ")));
  await p.getByRole("button", { name: /Störbericht erfassen/ }).click();
  await p.waitForTimeout(500);
  const fehlerartOpt = await p.locator("select").filter({ has: p.locator('option[value="Sensorik"]') }).count();
  ok("(R3) Die neue Fehlerart „Sensorik“ steht im Störbericht zur Auswahl", fehlerartOpt >= 1);
  const bausteinSel = p.locator('select[aria-label="Textbaustein Sofort Maßnahme"]');
  ok("(R3) Textbaustein-Auswahl an „Sofort Maßnahme“ vorhanden", (await bausteinSel.count()) === 1);
  await bausteinSel.selectOption("Sicherung getauscht, Anlage wieder frei");
  await p.waitForTimeout(200);
  const getan = await p.locator('textarea[placeholder="Was wurde sofort getan?"]').inputValue();
  ok("(R3) Der Baustein steht im Feld", getan === "Sicherung getauscht, Anlage wieder frei", getan);
  ok("(R3) Das Pflichtfeld Fehlerart wird in der Pflichtfeld-Meldung genannt", /Laut Werkstatt-Regel außerdem: Fehlerart/.test(await p.locator("body").innerText()));
  await p.keyboard.press("Escape");
  await p.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
  await p.waitForTimeout(300);

  /* ================= (R4) To-do-Vorwarnung ================= */
  await tab(p, "To-do").first().click();
  await p.waitForTimeout(500);
  const todoText = await p.locator("body").innerText();
  ok("(R4) Frist in zwei Tagen: das Datum trägt die Vorwarnung (⏳ bis …)", /⏳ bis/.test(todoText), (todoText.match(/⏳ bis [^\n]*/) || [""])[0]);

  /* ================= (R6) Pinnwand-Baustein ================= */
  await tab(p, "Übersicht").click();
  await p.waitForTimeout(400);
  await p.locator('button[aria-label="Neue Notiz anpinnen"]').click();
  await p.waitForTimeout(300);
  const zettelSel = p.locator('select[aria-label="Textbaustein Pinnwand"]');
  ok("(R6) Die Pinnwand bietet den Textbaustein an", (await zettelSel.count()) === 1);
  await zettelSel.selectOption("Ersatzteil bestellt, kommt Do.");
  await p.waitForTimeout(200);
  ok("(R6) Der Baustein steht im Zettel", (await p.locator("textarea").first().inputValue()).includes("Ersatzteil bestellt, kommt Do."));

  /* ================= (G1) Dieser Rechner: Startansicht + Zoom ================= */
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Personalisieren", exact: true }).click();
  await p.waitForTimeout(300);
  await p.locator('select[aria-label="Startansicht"]').selectOption("SCHICHTPLAN");
  await p.locator('select[aria-label="Zoom"]').selectOption("125");
  await p.waitForTimeout(300);
  ok("(G1) Zoom wirkt sofort über die Wurzel-Schriftgröße (125 %)", (await p.evaluate(() => document.documentElement.style.fontSize)) === "125%");
  const geraet = await p.evaluate(() => JSON.parse(localStorage.getItem("wk-geraet") || "null"));
  ok("(G1) Die Wahl liegt im localStorage dieses Rechners", !!geraet && geraet.startansicht === "SCHICHTPLAN" && geraet.zoom === 125);
  await p.close();
  const p2 = await neueSeite(ctx);
  const t2 = await p2.locator("body").innerText();
  ok("(G1) Derselbe Rechner öffnet beim nächsten Mal im Schichtplan, mit Zoom",
    /Werkstattschichtplan/.test(t2) && (await p2.evaluate(() => document.documentElement.style.fontSize)) === "125%");
  await p2.close();
  const ctxAnders = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p3 = await neueSeite(ctxAnders);
  ok("(G1) Ein anderer Rechner startet weiter auf der Übersicht in normaler Größe",
    !/Werkstattschichtplan/.test(await p3.locator("body").innerText()) && (await p3.evaluate(() => document.documentElement.style.fontSize)) === "");
  await p3.close();
  await ctxAnders.close();

  /* ================= (G2) Nachtmodus-Automatik ================= */
  const ctxN = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const pN = await neueSeite(ctxN, { geraet: { nachtAuto: true, nachtVon: "20:00", nachtBis: "06:00" } }, new Date("2026-09-21T21:00:00"));
  ok("(G2) Um 21 Uhr schaltet die Automatik den Nachtmodus ein", await pN.evaluate(() => document.documentElement.classList.contains("wk-nacht")));
  await pN.clock.setSystemTime(new Date("2026-09-22T08:00:00"));
  await pN.clock.runFor(61000);
  await pN.waitForTimeout(200);
  ok("(G2) Um 8 Uhr (eine Minute später geprüft) ist er wieder aus", !(await pN.evaluate(() => document.documentElement.classList.contains("wk-nacht"))));
  await pN.close();
  await ctxN.close();

  /* ================= (G3) Leser-Rücksprung 2 Minuten ================= */
  const ctxL = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const pL = await neueSeite(ctxL, {
    geraet: { ruecksprungMin: 2 },
    benutzer: [{ name: "lea", rolle: "leser", kennwortHash: "" }, { name: "rc", rolle: "verwalter", kennwortHash: "" }],
    benutzerName: "lea",
  }, new Date("2026-09-21T10:00:00"));
  await tab(pL, "Berichte").click();
  await pL.waitForTimeout(500);
  ok("(G3) Leser steht im Bereich Berichte", /Aufgaben – erteilt/.test(await pL.locator("body").innerText()));
  await pL.clock.fastForward("01:30");
  await pL.waitForTimeout(300);
  ok("(G3) Nach 1,5 Minuten noch kein Rücksprung", /Aufgaben – erteilt/.test(await pL.locator("body").innerText()));
  await pL.clock.fastForward("01:00");
  await pL.waitForTimeout(300);
  ok("(G3) Nach 2,5 Minuten Stille zurück auf der Übersicht (statt erst nach 15)", !/Aufgaben – erteilt/.test(await pL.locator("body").innerText()) && /HEUTE ·/i.test(await pL.locator("body").innerText()));
  await pL.close();
  await ctxL.close();
  await ctx.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
