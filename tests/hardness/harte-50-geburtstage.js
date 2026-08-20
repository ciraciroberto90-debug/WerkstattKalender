// Härtetest: GEBURTSTAGS-ERINNERUNG (Variante A, Robertos Wahl vom 20.08.).
//
//  (A) HEUTE: Steht bei einer Person der heutige Tag (mit Jahr), zeigt die
//      Übersicht die 🎂-Karte "Heute hat … Geburtstag!" samt Alter.
//      Ohne Jahr im Feld erscheint KEIN Alter - das Jahr ist freiwillig.
//  (B) VORSCHAU: Geburtstage der nächsten 7 Tage stehen als "demnächst"
//      auf der Karte (mit Wochentag und "in X Tagen" / "morgen");
//      was weiter weg ist, erscheint nicht.
//  (C) STUMM: Leere und unlesbare Felder ("Quatsch", 32.13.) lösen NICHTS
//      aus - eine falsche Erinnerung wäre schlimmer als keine.
//  (D) WEGKLICKBAR: ✕ schließt die Karte für diesen Tag und dieses Gerät -
//      auch nach einem Neuladen bleibt sie zu; am nächsten Tag käme sie
//      wieder (der Merker trägt das Datum).
//  (E) 29.02.: Wer am 29.02. geboren ist, wird in Nicht-Schaltjahren am
//      28.02. gefeiert (sonst gäbe es nur alle vier Jahre eine Erinnerung);
//      in Schaltjahren zählt der echte 29.02.
//  (F) PFLEGE: Das 🎂-Feld je Person wohnt im ⚙ unter "Team & Schichten",
//      wird mitgespeichert und überlebt das Neuladen (der Ladeweg
//      normalisiert das Team - was er nicht kennt, wäre weg).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

async function start(browser, team, zeit) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date(zeit || "2026-08-18T10:00:00"));
  await p.addInitScript(({ c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([]));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
  }, { c: { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team } });
  await p.goto(APP);
  await p.waitForTimeout(1000);
  return { p, ctx, fehler };
}
const karte = (p) => p.locator("div", { has: p.locator('button[aria-label="Geburtstags-Erinnerung schließen"]') }).last();

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (A) Heute, mit und ohne Jahr + (B) Vorschau ---- */
  {
    const { p, ctx, fehler } = await start(browser, [
      { name: "M. Weber", rolle: "mech", geburtstag: "18.08.1990" },   // heute, wird 36
      { name: "K. Yilmaz", rolle: "elek", geburtstag: "20.08." },      // in 2 Tagen, ohne Jahr
      { name: "A. Brandt", rolle: "mech", geburtstag: "19.08.2001" },  // morgen, wird 25
      { name: "R. Fuchs", rolle: "azubi", geburtstag: "27.08.1999" },  // in 9 Tagen: zu weit weg
    ], "2026-08-18T10:00:00");
    const text = (await karte(p).innerText()).replace(/\s+/g, " ");
    pruef("(A) Am Tag selbst erscheint die Karte mit Namen", /Heute hat M\. Weber/.test(text), text);
    pruef("(A) Mit Jahr im Feld steht das Alter dabei", /wird 36/.test(text), text);
    pruef("(B) Morgen-Geburtstag steht in der Vorschau", /A\. Brandt am Mi\.?, 19\.08\. \(morgen\)/.test(text), text);
    pruef("(B) In-2-Tagen steht mit Wochentag und Abstand", /K\. Yilmaz am Do\.?, 20\.08\. \(in 2 Tagen\)/.test(text), text);
    pruef("(B) Ohne Jahr im Feld erscheint kein Alter", !/K\. Yilmaz[^·]*wird/.test(text), text);
    pruef("(B) Mehr als 7 Tage entfernt bleibt draußen", !/R\. Fuchs/.test(text), text);
    pruef("(A) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (C) Leere und unlesbare Felder bleiben stumm ---- */
  {
    const { p, ctx, fehler } = await start(browser, [
      { name: "M. Weber", rolle: "mech" },                        // Feld fehlt ganz
      { name: "K. Yilmaz", rolle: "elek", geburtstag: "" },       // leer
      { name: "A. Brandt", rolle: "mech", geburtstag: "Quatsch" },// unlesbar
      { name: "R. Fuchs", rolle: "azubi", geburtstag: "32.13." }, // kein echtes Datum
    ], "2026-08-18T10:00:00");
    pruef("(C) Ohne lesbaren Geburtstag gibt es keine Karte",
          (await p.locator('button[aria-label="Geburtstags-Erinnerung schließen"]').count()) === 0);
    pruef("(C) Und keine Skriptfehler durch die Quatsch-Werte", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (D) Wegklicken gilt für den Tag - auch über ein Neuladen ---- */
  {
    const { p, ctx } = await start(browser, [
      { name: "M. Weber", rolle: "mech", geburtstag: "18.08.1990" },
    ], "2026-08-18T10:00:00");
    await p.locator('button[aria-label="Geburtstags-Erinnerung schließen"]').click();
    await p.waitForTimeout(300);
    pruef("(D) ✕ schließt die Karte",
          (await p.locator('button[aria-label="Geburtstags-Erinnerung schließen"]').count()) === 0);
    pruef("(D) Der Merker trägt das Tagesdatum",
          (await p.evaluate(() => localStorage.getItem("werkstatt-kalender-geburtstag-zu"))) === "2026-08-18");
    await p.reload();
    await p.waitForTimeout(1000);
    pruef("(D) Nach dem Neuladen bleibt sie am selben Tag zu",
          (await p.locator('button[aria-label="Geburtstags-Erinnerung schließen"]').count()) === 0);
    // Gegenprobe: Ein Merker von GESTERN hält die Karte nicht mehr auf.
    await p.evaluate(() => localStorage.setItem("werkstatt-kalender-geburtstag-zu", "2026-08-17"));
    await p.reload();
    await p.waitForTimeout(1000);
    pruef("(D) Am nächsten Tag käme sie wieder (alter Merker zählt nicht)",
          (await p.locator('button[aria-label="Geburtstags-Erinnerung schließen"]').count()) === 1);
    await ctx.close();
  }

  /* ---- (E) Der 29.02.-Fall ---- */
  {
    // 2027 ist KEIN Schaltjahr: gefeiert wird am 28.02.
    const { p, ctx } = await start(browser, [
      { name: "S. Petrov", rolle: "mech", geburtstag: "29.02.1996" },
    ], "2027-02-28T10:00:00");
    const text = (await karte(p).innerText()).replace(/\s+/g, " ");
    pruef("(E) Im Nicht-Schaltjahr wird am 28.02. gefeiert",
          /Heute hat S\. Petrov/.test(text) && /wird 31/.test(text), text);
    await ctx.close();
  }
  {
    // 2028 IST ein Schaltjahr: am 28.02. ist noch nichts, der echte
    // 29.02. steht als "morgen" in der Vorschau.
    const { p, ctx } = await start(browser, [
      { name: "S. Petrov", rolle: "mech", geburtstag: "29.02.1996" },
    ], "2028-02-28T10:00:00");
    const text = (await karte(p).innerText().catch(() => "")).replace(/\s+/g, " ");
    pruef("(E) Im Schaltjahr zählt der echte 29.02.",
          !/Heute hat/.test(text) && /S\. Petrov am Di\.?, 29\.02\. \(morgen\)/.test(text), text);
    await ctx.close();
  }

  /* ---- (F) Pflege im ⚙ und Überleben des Neuladens ---- */
  {
    const { p, ctx } = await start(browser, [
      { name: "M. Weber", rolle: "mech" },
    ], "2026-08-18T10:00:00");
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: "Team & Schichten" }).click();
    await p.waitForTimeout(400);
    const feld = p.locator('input[aria-label="Geburtstag von M. Weber"]');
    pruef("(F) Je Person gibt es ein Geburtstags-Feld im ⚙", (await feld.count()) === 1);
    await feld.fill("18.08.1990");
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.waitForTimeout(600);
    const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"));
    pruef("(F) Der Geburtstag steht nach dem Speichern in den Einstellungen",
          Array.isArray(cfg.team) && cfg.team[0] && cfg.team[0].geburtstag === "18.08.1990", JSON.stringify(cfg.team));
    pruef("(F) Die Karte erscheint sofort nach dem Speichern",
          (await p.locator('button[aria-label="Geburtstags-Erinnerung schließen"]').count()) === 1);
    await ctx.close();
    // Neustart mit GENAU dem eben gespeicherten Stand: der Ladeweg
    // normalisiert das Team - der Geburtstag muss das überleben. (Ein
    // schlichtes reload() taugt hier nicht: das Test-Startskript würde die
    // Einstellungen wieder mit dem Ursprungsstand überschreiben.)
    const { p: p2, ctx: ctx2 } = await start(browser, cfg.team, "2026-08-18T10:00:00");
    pruef("(F) Der Geburtstag überlebt das Neuladen (Normalisierung nimmt ihn mit)",
          /Heute hat M\. Weber/.test((await karte(p2).innerText()).replace(/\s+/g, " ")));
    await ctx2.close();
  }

  console.log(`\nHärte 50 (Geburtstags-Erinnerung): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
