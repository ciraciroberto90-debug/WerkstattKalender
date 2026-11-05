// Härtetest: SCHICHTPLAN FORTLAUFEND + JAHRES-KACHELN (Roberto 05.11.: "der
// Schichtplan muss für 2027 erweitert werden, bitte fortlaufend, vielleicht kann
// man das Jahr oberhalb des Plans als kleine Kachel zum Anklicken einfügen")
//
//  (J1) Über dem Plan stehen Jahres-Kacheln: dieses Jahr und die zwei nächsten;
//       die Kachel des angezeigten Jahres ist markiert (aria-pressed).
//  (J2) Fortlaufend: Im November 2026 reicht die Tabelle über den 30.11. hinaus
//       (1.12. ist eine Spalte), die Monats-Kopfzeile nennt November und Dezember,
//       die KW-Zählung läuft durch.
//  (J3) Jahresgrenze: Im Dezember 2026 stehen Januar-2027-Spalten daneben, der
//       1.1.2027 trägt "Neujahr" (Feiertage des Folgejahres), KW 53/1 stimmen.
//  (J4) Klick auf die Kachel 2027 springt in den Januar 2027; "Heute" zurück.
//  (J5) Eine Schicht an einem Tag in 2027 lässt sich setzen und steht in der Datei
//       (scope tag, Datum 2027-01-04).
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor (Monat für Monat, keine Kacheln) sind J1-J4 rot
// (gemessen 05.11. mit APP_PFAD gegen den Stand vor diesem Umbau).
const UMG = require("../umgebung"); // Repo-Ort, App-Datei, Browser (Roll-out 73)
const { chromium } = require("playwright-core");
const APP = UMG.APP;
let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };

(async () => {
  const browser = await chromium.launch({ executablePath: UMG.CHROMIUM, headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.clock.setFixedTime(new Date("2026-11-05T10:00:00")); // Donnerstag, KW 45
  await p.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({ tpmAnlagen: [], riItems: [], team: [{ name: "Test Person", rolle: "mech" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] }));
    localStorage.setItem("werkstatt-kalender-entries", "[]");
    localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
    localStorage.setItem("werkstatt-kalender-name", "Chef");
  });
  await p.goto(APP);
  await p.waitForTimeout(800);
  // Cockpit → Werkstatt → Schichtplan
  await p.locator('button[data-hauptbereich="COCKPIT"]').click().catch(() => {});
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Schichtplan", exact: true }).first().click();
  await p.waitForTimeout(600);

  const kacheln = p.locator("[data-schichtplan-jahr]");
  const jahre = await kacheln.evaluateAll((els) => els.map((e) => [e.getAttribute("data-schichtplan-jahr"), e.getAttribute("aria-pressed")]));
  ok("(J1) Jahres-Kacheln 2026, 2027, 2028 - 2026 markiert", jahre.length === 3 && jahre.map((j) => j[0]).join(",") === "2026,2027,2028" && jahre[0][1] === "true" && jahre[1][1] === "false", JSON.stringify(jahre));

  const tageKeys = async () => p.locator("th[data-daykey]").evaluateAll((els) => els.map((e) => e.getAttribute("data-daykey")));
  const monate = async () => p.locator("[data-schichtplan-monat]").evaluateAll((els) => els.map((e) => e.getAttribute("data-schichtplan-monat") + ":" + e.innerText.trim()));
  let keys = await tageKeys();
  ok("(J2) November 2026: Tabelle beginnt am Montag 26.10. und läuft über den 30.11. hinaus (1.12. da, 63 Spalten)", keys[0] === "2026-10-26" && keys.includes("2026-11-30") && keys.includes("2026-12-01") && keys.length === 63, `${keys[0]} … ${keys[keys.length - 1]} (${keys.length})`);
  let mon = await monate();
  ok("(J2) Monats-Kopfzeile: Oktober (ohne Namen, zu kurz), November 2026, Dezember 2026", mon.length === 3 && mon[1] === "2026-11:November 2026" && mon[2] === "2026-12:Dezember 2026", mon.join(" | "));
  const kw = await p.locator("thead tr:nth-child(2) th").evaluateAll((els) => els.slice(1).map((e) => e.innerText.trim()));
  ok("(J2) KW-Zeile läuft durch: KW 44 … KW 52", kw[0] === "KW 44" && kw[kw.length - 1] === "KW 52" && kw.length === 9, kw.join(", "));

  // (J3) Dezember 2026 → Januar 2027 daneben
  await p.locator('button[aria-label="Nächster Monat"]').click(); await p.waitForTimeout(400);
  keys = await tageKeys();
  const neujahr = await p.locator('th[data-daykey="2027-01-01"]').getAttribute("title");
  ok("(J3) Dezember 2026: Januar 2027 steht daneben, 1.1.2027 ist Neujahr", keys.includes("2026-12-31") && keys.includes("2027-01-01") && keys.includes("2027-01-31") && neujahr === "Neujahr", `bis ${keys[keys.length - 1]}, 01.01.: ${neujahr}`);
  mon = await monate();
  ok("(J3) Monats-Kopfzeile nennt Januar 2027", mon.some((m) => m === "2027-01:Januar 2027"), mon.join(" | "));
  const kw2 = await p.locator("thead tr:nth-child(2) th").evaluateAll((els) => els.slice(1).map((e) => e.innerText.trim()));
  ok("(J3) KW-Zeile über den Jahreswechsel: KW 49 … KW 53 … KW 1 …", kw2.includes("KW 53") && kw2.includes("KW 1") && kw2.indexOf("KW 53") < kw2.indexOf("KW 1"), kw2.join(", "));

  // (J4) Kachel 2027 → Januar 2027; Heute → November 2026
  await p.locator('[data-schichtplan-jahr="2027"]').click(); await p.waitForTimeout(400);
  keys = await tageKeys();
  const titel = (await p.locator("span.font-mono.text-sm.font-bold").first().innerText()).trim();
  ok("(J4) Kachel 2027: Januar 2027, Tabelle ab Montag 28.12.2026, Kachel 2027 markiert", titel === "Januar 2027" && keys[0] === "2026-12-28" && keys.includes("2027-02-15") && (await p.locator('[data-schichtplan-jahr="2027"]').getAttribute("aria-pressed")) === "true", `${titel}, ${keys[0]} … ${keys[keys.length - 1]}`);
  // (J5) Schicht am 04.01.2027 setzen
  await p.locator('button[aria-label="Matrix Test Person 2027-01-04"]').click(); await p.waitForTimeout(300);
  await p.locator('div[style*="fixed"]').last().getByRole("button", { name: "Früh", exact: true }).click(); await p.waitForTimeout(500);
  const zelle = (await p.locator('button[aria-label="Matrix Test Person 2027-01-04"]').innerText()).trim();
  const gespeichert = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").filter((e) => e.category === "SCHICHT"));
  ok("(J5) Schicht Früh am 04.01.2027 gesetzt: Zelle zeigt sie, Eintrag in 2027 gespeichert", /Früh/.test(zelle) && gespeichert.some((e) => (e.date === "2027-01-04" || e.woche === "2027-W01") && e.wert === "Früh" && e.name === "Test Person"), JSON.stringify(gespeichert.map((e) => [e.scope, e.date || e.woche, e.wert])));
  await p.getByRole("button", { name: "Heute", exact: true }).click(); await p.waitForTimeout(400);
  ok("(J4) 'Heute' zurück in den November 2026", (await p.locator("span.font-mono.text-sm.font-bold").first().innerText()).trim() === "November 2026");
  ok("(E) Keine Skriptfehler", fehler.length === 0, fehler.join(" | "));

  await browser.close();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
