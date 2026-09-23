// Härtetest: GRUPPEN-VERWALTER (Robertos Ansage vom 21.09.)
//
// Ein Verwalter der Leit-Werkstatt (Scheurich) springt frei zwischen den
// Werkstätten und ist in Soendgen Keramik Verwalter - ohne dort in der
// Benutzerliste zu stehen. Soendgen sieht davon in seinen Einstellungen nichts.
//
//  (1) Anmeldung als Verwalter in Scheurich stellt den Pass auf diesem
//      Rechner aus; in der Kopfzeile erscheint der Wechsel-Knopf.
//  (2) Wechsel nach Soendgen: die App lädt mit dem Soendgen-Bestand, KEIN
//      Anmelde-Dialog, Zahnrad und "Benutzer & Rechte" da - die Soendgen-Liste
//      zeigt nur die Soendgen-Benutzer, der Scheurich-Verwalter steht nicht drin,
//      und die Soendgen-Datei bleibt unangetastet.
//  (3) Mitarbeiter klar getrennt: im Soendgen-Zahnrad steht das Soendgen-Team,
//      nicht das Scheurich-Team.
//  (4) Zurück nach Scheurich: gemerkte Anmeldung gilt weiter.
//  (5) GEGENPROBE: Ein Rechner OHNE Pass bekommt in Soendgen die Anmeldung
//      wie gehabt - und kein Zahnrad.
//  (6) Abmelden in Soendgen nimmt den Pass vom Rechner (Kollege am selben PC
//      bleibt nicht Verwalter).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const jetzt = new Date().toISOString();
  // Zwei getrennte Datendateien - je Werkstatt eine, mit eigener Benutzerliste und eigenem Team
  const dateien = {
    scheurich: JSON.stringify({ format: "werkstatt-kalender-v1", standort: "scheurich", savedAt: jetzt, entries: [], deleted: {},
      config: { tpmAnlagen: [], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
        benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Bea", rolle: "bearbeiter", kennwortHash: "" }] } }),
    soendgen: JSON.stringify({ format: "werkstatt-kalender-v1", standort: "soendgen", savedAt: jetzt, entries: [], deleted: {},
      config: { tpmAnlagen: [], riItems: [], team: [{ name: "K. Meier", rolle: "elek" }],
        benutzer: [{ name: "SKChef", rolle: "verwalter", kennwortHash: "" }, { name: "SKLeser", rolle: "leser", kennwortHash: "" }] } }),
  };

  const neuerRechner = async (start) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await p.exposeFunction("__leseDatei", (st) => dateien[st] || dateien.scheurich);
    await p.exposeFunction("__schreibeDatei", (st, t) => { dateien[st] = t; });
    // Der Datei-Stub liefert je nach gewählter Werkstatt die passende Datei.
    // Beim Neuladen nach dem Wechsel darf die Saat die Wahl NICHT überschreiben.
    await p.addInitScript((start) => {
      try {
        if (!localStorage.getItem("bta-standort")) localStorage.setItem("bta-standort", start.standort);
        if (start.benutzer && !localStorage.getItem("werkstatt-kalender-benutzer")) localStorage.setItem("werkstatt-kalender-benutzer", start.benutzer);
      } catch (e) {}
      const st = () => localStorage.getItem("bta-standort") || "scheurich";
      const handle = {
        name: "kalender-daten.json", kind: "file",
        async getFile() { return new File([await window.__leseDatei(st())], "kalender-daten.json", { type: "application/json" }); },
        async createWritable() { let b = ""; return { async write(t) { b += t; }, async close() { await window.__schreibeDatei(st(), b); } }; },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [handle];
    }, start);
    await p.goto(APP);
    await p.waitForTimeout(600);
    return { ctx, p };
  };
  const verbinde = async (p) => {
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1100);
    await p.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
    await p.waitForTimeout(400);
  };
  const kopf = async (p) => (await p.locator("body").innerText()).slice(0, 400);

  /* ---- (1) Scheurich: Verwalter angemeldet -> Pass + Wechsel-Knopf ---- */
  const r = await neuerRechner({ standort: "scheurich", benutzer: "Chef" });
  await verbinde(r.p);
  const passS = await r.p.evaluate(() => JSON.parse(localStorage.getItem("bta-gruppenverwalter") || "null"));
  ok("(1) Der angemeldete Scheurich-Verwalter bekommt den Gruppen-Pass auf diesem Rechner", !!passS && passS.name === "Chef" && passS.von === "scheurich", JSON.stringify(passS));
  ok("(1) In der Kopfzeile steht der Wechsel-Knopf nach Soendgen", (await r.p.locator('button[aria-label="Wechseln zu Soendgen Keramik"]').count()) === 1);

  /* ---- (2) Wechsel nach Soendgen ---- */
  await r.p.locator('button[aria-label="Wechseln zu Soendgen Keramik"]').click();
  // Der Wechsel lädt die Seite neu - auf den Rückwechsel-Knopf warten statt
  // auf die Uhr (unter Last der vollen Suite dauerte das Neuladen > 1,5 s).
  await r.p.locator('button[aria-label="Wechseln zu Scheurich"]').waitFor({ timeout: 20000 });
  await r.p.waitForTimeout(500);
  ok("(2) Die App läuft jetzt als Soendgen Keramik", /Soendgen Keramik/i.test(await kopf(r.p)));
  await verbinde(r.p);
  ok("(2) KEIN Anmelde-Dialog - der Pass gilt", (await r.p.locator('[aria-label="Anmelden"]').count()) === 0);
  ok("(2) Zahnrad da, Kopfzeile nennt „Gruppen-Verwalter“",
    (await r.p.locator('button[aria-label="Verwalten"]').count()) === 1 && /Gruppen-Verwalter/.test(await kopf(r.p)));
  await r.p.locator('button[aria-label="Verwalten"]').click();
  await r.p.waitForTimeout(400);
  ok("(2) Der Reiter „Benutzer & Rechte“ steht dem Gast offen", (await r.p.getByRole("button", { name: "Benutzer & Rechte", exact: true }).count()) === 1);
  await r.p.getByRole("button", { name: "Benutzer & Rechte", exact: true }).click();
  await r.p.waitForTimeout(300);
  const namen = await r.p.locator('input[aria-label^="Benutzername "]').evaluateAll((els) => els.map((e) => e.value));
  ok("(2) Die Soendgen-Liste zeigt NUR Soendgen-Benutzer - der Scheurich-Verwalter steht nicht drin",
    namen.join(",") === "SKChef,SKLeser", namen.join(","));
  ok("(2) Die Soendgen-Datei kennt den Scheurich-Verwalter nicht (nichts hineingeschrieben)",
    !dateien.soendgen.includes('"Chef"') && dateien.soendgen.includes("SKChef"));

  /* ---- (3) Mitarbeiter getrennt ---- */
  await r.p.getByRole("button", { name: "Team & Schichten", exact: true }).click();
  await r.p.waitForTimeout(300);
  const teamText = await r.p.locator("body").innerText();
  ok("(3) Im Soendgen-Zahnrad steht das Soendgen-Team (K. Meier), nicht das Scheurich-Team (T. Balles)",
    /K\. Meier/.test(teamText) && !/T\. Balles/.test(teamText));
  await r.p.locator('button[aria-label="Schließen"]').last().click().catch(() => r.p.keyboard.press("Escape"));
  await r.p.waitForTimeout(300);

  /* ---- (4) Zurück nach Scheurich ---- */
  await r.p.locator('button[aria-label="Wechseln zu Scheurich"]').click();
  await r.p.locator('button[aria-label="Wechseln zu Soendgen Keramik"]').waitFor({ timeout: 20000 });
  await r.p.waitForTimeout(500);
  await verbinde(r.p);
  ok("(4) Zurück in Scheurich: gemerkte Anmeldung gilt, kein Dialog, Zahnrad da",
    /Scheurich(?! Group)/i.test(await kopf(r.p)) && (await r.p.locator('[aria-label="Anmelden"]').count()) === 0 && (await r.p.locator('button[aria-label="Verwalten"]').count()) === 1);

  /* ---- (5) GEGENPROBE: Rechner ohne Pass in Soendgen ---- */
  const fremd = await neuerRechner({ standort: "soendgen" });
  await verbinde(fremd.p);
  ok("(5) Ohne Pass: Soendgen verlangt die Anmeldung wie gehabt", (await fremd.p.locator('[aria-label="Anmelden"]').count()) === 1);
  ok("(5) Ohne Pass: kein Zahnrad, kein Wechsel-Knopf",
    (await fremd.p.locator('button[aria-label="Verwalten"]').count()) === 0 && (await fremd.p.locator('button[aria-label^="Wechseln zu"]').count()) === 0);
  await fremd.ctx.close();

  /* ---- (6) Abmelden in Soendgen nimmt den Pass ---- */
  await r.p.locator('button[aria-label="Wechseln zu Soendgen Keramik"]').click();
  // Der Wechsel lädt die Seite neu - auf den Rückwechsel-Knopf warten statt
  // auf die Uhr (unter Last der vollen Suite dauerte das Neuladen > 1,5 s).
  await r.p.locator('button[aria-label="Wechseln zu Scheurich"]').waitFor({ timeout: 20000 });
  await r.p.waitForTimeout(500);
  await verbinde(r.p);
  await r.p.locator('button[aria-label="Abmelden"]').click();
  await r.p.waitForTimeout(500);
  ok("(6) Abmelden in Soendgen: Pass weg, Anmelde-Dialog da, kein Zahnrad",
    (await r.p.evaluate(() => localStorage.getItem("bta-gruppenverwalter"))) === null
    && (await r.p.locator('[aria-label="Anmelden"]').count()) === 1
    && (await r.p.locator('button[aria-label="Verwalten"]').count()) === 0);
  await r.ctx.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
