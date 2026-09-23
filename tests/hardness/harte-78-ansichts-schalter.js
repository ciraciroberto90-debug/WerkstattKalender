// Härtetest: ANSICHTS-SCHALTER DES VERWALTERS (Robertos Ansage vom 21.09.)
//
// Das Auge oben rechts ist für den Verwalter kein Nachtmodus-Knopf mehr,
// sondern ein Schalter: das Cockpit so sehen, wie es ein Bearbeiter oder ein
// Leser sieht. Nur der Verwalter hat ihn; Bearbeiter behalten das Auge als
// Nachtschicht-Modus.
//
//  (1) Verwalter: das Auge öffnet ein Menü mit Verwalter / Bearbeiter / Leser
//      und dem Nachtmodus.
//  (2) "Leser": Hinweisleiste, Bereiche wie beim Leser (kein Werkstatt, kein
//      TPM), Zahnrad weg - Schreiben gesperrt (Pinnwand-Plus weg).
//  (3) "Bearbeiter": Werkstatt und TPM zurück, Zahnrad da, aber ohne
//      "Benutzer & Rechte" und "Personalisieren" - und die Rechte-Matrix des
//      Bearbeiters greift (Planung ausgeblendet -> kein Untermenü Planung).
//  (4) "Zurück zur Verwalter-Ansicht": alles wieder da.
//  (5) Nachtmodus über das Menü schaltbar.
//  (6) GEGENPROBE Bearbeiter: das Auge ist der Nachtschicht-Modus, kein Menü.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (benutzer) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await p.addInitScript((benutzer) => {
      try {
        delete window.showOpenFilePicker; delete window.showSaveFilePicker;
        localStorage.setItem("bta-standort", "scheurich");
        localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
          tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
          benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Bea", rolle: "bearbeiter", kennwortHash: "" }],
          // Rechte-Matrix: Bearbeiter sehen keine Planung - das muss die Simulation übernehmen
          rechte: { bearbeiter: { PLANUNG: "aus" } },
        }));
        localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
      } catch (e) {}
    }, benutzer);
    await p.goto(APP);
    await p.waitForTimeout(1200);
    return { ctx, p };
  };
  const tab = (p, name) => p.getByRole("button", { name: new RegExp("^" + name + "\\s*\\d*$", "i") });
  const hat = async (p, name) => (await tab(p, name).count()) > 0;

  /* ---- (1) Verwalter: Auge = Menü ---- */
  const v = await seite("Chef");
  const p = v.p;
  ok("(1) Der Verwalter hat das Auge als „Ansicht wechseln“ - nicht als Nachtmodus",
    (await p.locator('button[aria-label="Ansicht wechseln"]').count()) === 1 && (await p.locator('button[aria-label="Nachtschicht-Modus"]').count()) === 0);
  await p.locator('button[aria-label="Ansicht wechseln"]').click();
  await p.waitForTimeout(300);
  ok("(1) Das Menü bietet Verwalter, Bearbeiter, Leser und den Nachtmodus",
    (await p.locator('[role="menu"] [role="menuitemradio"]').count()) === 3 && (await p.locator('[role="menu"] button[aria-label="Nachtschicht-Modus"]').count()) === 1);

  /* ---- (2) Leser ---- */
  await p.getByRole("menuitemradio", { name: /Leser/ }).click();
  await p.waitForTimeout(600);
  const tL = await p.locator("body").innerText();
  ok("(2) Hinweisleiste „Ansicht als Leser“ steht oben", /Ansicht als Leser/.test(tL));
  ok("(2) Bereiche wie beim Leser: Schichtplan direkt, kein Werkstatt, kein TPM",
    (await hat(p, "Schichtplan")) && !(await hat(p, "Werkstatt")) && !(await hat(p, "TPM")));
  ok("(2) Zahnrad weg, Pinnwand-Plus weg (Schreiben gesperrt) - das Auge bleibt",
    (await p.locator('button[aria-label="Verwalten"]').count()) === 0 && (await p.locator('button[aria-label="Neue Notiz anpinnen"]').count()) === 0
    && (await p.locator('button[aria-label="Ansicht wechseln"]').count()) === 1);

  /* ---- (3) Bearbeiter ---- */
  await p.locator('button[aria-label="Ansicht wechseln"]').click();
  await p.waitForTimeout(200);
  await p.getByRole("menuitemradio", { name: /Bearbeiter/ }).click();
  await p.waitForTimeout(600);
  // Mit "Planung ausgeblendet" steht dem Bearbeiter statt "Werkstatt" der
  // Schichtplan direkt in der Hauptreihe (so baut es die Rechte-Matrix).
  ok("(3) Als Bearbeiter: TPM zurück, Zahnrad da - und die Rechte-Matrix greift (Schichtplan direkt, keine Planung)",
    (await hat(p, "TPM")) && (await p.locator('button[aria-label="Verwalten"]').count()) === 1
    && (await hat(p, "Schichtplan")) && !(await hat(p, "Werkstatt")) && !(await hat(p, "Planung")));
  await tab(p, "Schichtplan").click();
  await p.waitForTimeout(400);
  ok("(3) Der Schichtplan öffnet sich für den simulierten Bearbeiter", /Werkstattschichtplan/.test(await p.locator("body").innerText()));
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(400);
  ok("(3) Im Zahnrad fehlen „Benutzer & Rechte“ und „Personalisieren“ - wie beim echten Bearbeiter",
    !(await hat(p, "Benutzer & Rechte")) && !(await hat(p, "Personalisieren")) && (await hat(p, "Team & Schichten")));
  await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => p.keyboard.press("Escape"));
  await p.waitForTimeout(300);

  /* ---- (4) Zurück ---- */
  await p.locator('button[aria-label="Zurück zur Verwalter-Ansicht"]').click();
  await p.waitForTimeout(500);
  ok("(4) Zurück zur Verwalter-Ansicht: Hinweis weg, „Werkstatt“ mit Planung wieder da",
    !/Ansicht als/.test(await p.locator("body").innerText()) && (await hat(p, "Werkstatt")) && (await hat(p, "Planung")));
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(400);
  ok("(4) Zahnrad wieder mit „Benutzer & Rechte“", await hat(p, "Benutzer & Rechte"));
  await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => p.keyboard.press("Escape"));
  await p.waitForTimeout(300);

  /* ---- (5) Nachtmodus über das Menü ---- */
  await p.locator('button[aria-label="Ansicht wechseln"]').click();
  await p.waitForTimeout(200);
  await p.locator('[role="menu"] button[aria-label="Nachtschicht-Modus"]').click();
  await p.waitForTimeout(300);
  ok("(5) Der Nachtmodus ist über das Menü erreichbar", await p.evaluate(() => document.documentElement.classList.contains("wk-nacht")));
  await v.ctx.close();

  /* ---- (6) Bearbeiter: Auge = Nachtmodus ---- */
  const b = await seite("Bea");
  ok("(6) GEGENPROBE Bearbeiter: das Auge ist der Nachtschicht-Modus, kein Ansichts-Menü",
    (await b.p.locator('button[aria-label="Nachtschicht-Modus"]').count()) === 1 && (await b.p.locator('button[aria-label="Ansicht wechseln"]').count()) === 0);
  await b.ctx.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
