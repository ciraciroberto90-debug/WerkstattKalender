// Härtetest: STÖRBERICHT DOPPELT GESPEICHERT / MASKE SCHLIESST LANGSAM
// (Robertos Befund 28.09.: "Berichte speichern teilweise doppelt, außerdem
// Klick auf Speichern beendet das Popout etwas langsam")
//
// Ursache: Die Maske blieb offen, bis die Störungs-Datei auf dem Netzlaufwerk
// geschrieben war (Sekunden) - und der Knopf blieb dabei klickbar. Der zweite
// Klick legte denselben Bericht mit neuer Kennung noch einmal an.
//
// Die Störungs-Datei ist hier eine Attrappe, deren Schreiben 1,5 s dauert
// (wie ein zähes Netzlaufwerk).
//  (S1) Zwei Klicks auf "Speichern" im selben Augenblick: genau EIN Bericht
//       im örtlichen Stand und genau EINER in der Datei.
//  (S2) Die Maske ist nach dem Klick binnen 500 ms zu - nicht erst nach dem
//       Schreiben (1,5 s).
//  (S3) Der Bericht kommt trotzdem vollständig in der Datei an (Anlage,
//       Kürzel, Nummer) - das Schreiben lief im Hintergrund weiter.
//  (S4) Bearbeiten eines vorhandenen Berichts: Maske schließt ebenso schnell,
//       die Änderung steht in der Datei, kein zweiter Bericht.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor stehen nach dem Doppelklick ZWEI Berichte
// (S1 rot) und die Maske schließt erst nach ~1,5 s (S2 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-28";
const SCHREIBDAUER = 1500;
const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }, { id: "a2", name: "VSM2", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] };
const drive = { "werkstatt-stoerungen.json": "" };
const schreibProtokoll = [];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.exposeFunction("__fsRead", (n) => drive[n] ?? "");
  // Das Schreiben dauert wie auf einem zähen Netzlaufwerk.
  await p.exposeFunction("__fsWrite", async (n, c) => { await new Promise((r) => setTimeout(r, SCHREIBDAUER)); drive[n] = c; schreibProtokoll.push(Date.now()); });
  await p.addInitScript(({ c }) => {
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-entries", "[]");
    localStorage.setItem("werkstatt-stoerungen-entries", "[]");
    localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
    // Nur die Störungs-Datei wird gewählt - die Hauptdaten bleiben örtlich.
    const mk = (name) => ({
      name, kind: "file",
      async getFile() { return new File([await window.__fsRead(name)], name, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(t) { b += t; }, async close() { await window.__fsWrite(name, b); } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    window.showOpenFilePicker = async () => [mk("werkstatt-stoerungen.json")];
    window.showSaveFilePicker = async () => mk("werkstatt-stoerungen.json");
  }, { c: config });
  await p.goto(APP);
  await p.waitForTimeout(1200);

  /* Störungs-Datei anlegen und verbinden (wie harte-80 B1) */
  await p.locator('button[aria-label="Gemeinsame Datei"]').click(); await p.waitForTimeout(400);
  const region = p.locator('[role="region"][aria-label="Störberichte-Datei"]');
  await region.getByRole("button", { name: /Neue Störberichte-Datei anlegen/ }).click();
  await p.waitForTimeout(SCHREIBDAUER + 1500);
  const rt = await region.innerText();
  ok("(Vorbereitung) Störungs-Datei verbunden (bearbeiten)", /Verbunden mit werkstatt-stoerungen\.json/.test(rt) && /bearbeiten/.test(rt), rt.slice(0, 160));
  await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(300);
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  schreibProtokoll.length = 0;

  const maske = () => p.locator('div[style*="z-index: 60"]');
  const oertlich = () => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-stoerungen-entries") || "[]"));
  // Neben den Berichten liegen in der Datei Verwaltungs-Einträge (Verlauf "log|",
  // Einstellungen "config|") - die zählen hier nicht mit (wie in harte-17).
  const inDatei = () => { try { return (JSON.parse(drive["werkstatt-stoerungen.json"]).entries || []).filter((e) => !/^(log|config)\|/.test(String(e.id))); } catch (e) { return null; } };

  /* (S1)(S2)(S3) Neuer Bericht, Doppelklick */
  await p.getByRole("button", { name: /^Berichte\s*\d*$/i }).first().click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: /^Störungen\s*\d*$/i }).first().click(); await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Störbericht erfassen/ }).click(); await p.waitForTimeout(500);
  await p.locator('input[aria-label="Anlage / Bereich"]').fill("TS480");
  await p.getByPlaceholder("Was funktioniert nicht?").fill("Hubeinleger hängt");
  await p.locator('input[aria-label="Störungs Ursache"]').fill("Sensor verstellt");
  await p.locator('textarea[aria-label="Sofort Maßnahme"]').fill("Sensor neu justiert");
  await p.locator('input[aria-label="Bearbeiter (Kürzel)"]').fill("TB");
  await p.waitForTimeout(200);
  const speichern = p.getByRole("button", { name: "Speichern", exact: true });
  ok("(Vorbereitung) Speichern ist frei", !(await speichern.isDisabled()));
  const t0 = Date.now();
  // Zwei Klicks im selben Augenblick - wie ein Doppelklick auf einem zähen Rechner.
  await speichern.evaluate((el) => { el.click(); el.click(); });
  let zuNach = null;
  try { await maske().waitFor({ state: "detached", timeout: 3000 }); zuNach = Date.now() - t0; } catch (e) { zuNach = null; }
  ok("(S2) Die Maske ist binnen 500 ms zu - nicht erst nach dem Schreiben (1,5 s)", zuNach !== null && zuNach < 500, zuNach === null ? "noch offen nach 3 s" : `${zuNach} ms`);
  const sofort = await oertlich();
  ok("(S1) Örtlich steht sofort genau EIN Bericht", sofort.length === 1, `${sofort.length} Berichte: ${sofort.map((x) => x.nr).join(",")}`);
  await p.waitForTimeout(SCHREIBDAUER * 2 + 1000);
  const danach = await oertlich();
  const datei = inDatei();
  ok("(S1) Nach dem Schreiben: genau EIN Bericht örtlich und genau EINER in der Datei",
    danach.length === 1 && !!datei && datei.length === 1, `örtlich ${danach.length}, Datei ${datei ? datei.length : "?"}, Schreibvorgänge ${schreibProtokoll.length}`);
  ok("(S3) Der Bericht ist vollständig in der Datei: TS480, Kürzel TB, Nummer, erledigt",
    !!datei && datei.length >= 1 && datei[0].anlage === "TS480" && datei[0].melder === "TB" && !!datei[0].nr && datei[0].offen === false, JSON.stringify((datei || [{}])[0]).slice(0, 200));
  ok("(E) Keine Skriptfehler (neuer Bericht)", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  /* (S4) Bearbeiten */
  schreibProtokoll.length = 0;
  // Die Liste gruppiert nach Tag und Schicht, beides eingeklappt (▸): aufklappen,
  // bis die Berichtszeile da ist.
  for (let i = 0; i < 4 && (await p.locator("tbody tr").filter({ hasText: "Hubeinleger hängt" }).count()) === 0; i++) {
    await p.locator("tbody tr").filter({ hasText: "▸" }).first().click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(250);
  }
  const zeile = p.locator("tbody tr").filter({ hasText: "Hubeinleger hängt" }).first();
  await zeile.click({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(400);
  const bearbeiten = p.getByRole("button", { name: /Bearbeiten/ }).first();
  if (await bearbeiten.count()) { await bearbeiten.click(); await p.waitForTimeout(500); }
  const beschr = p.getByPlaceholder("Was funktioniert nicht?");
  const bearbeitenOffen = (await beschr.count()) === 1;
  if (bearbeitenOffen) {
    await beschr.fill("Hubeinleger hängt - Nachtrag");
    await p.waitForTimeout(200);
    const t1 = Date.now();
    await p.getByRole("button", { name: "Speichern", exact: true }).evaluate((el) => { el.click(); el.click(); });
    let zu2 = null;
    try { await maske().waitFor({ state: "detached", timeout: 3000 }); zu2 = Date.now() - t1; } catch (e) { zu2 = null; }
    await p.waitForTimeout(SCHREIBDAUER * 2 + 1000);
    const d2 = inDatei();
    ok("(S4) Bearbeiten: Maske binnen 800 ms zu, die Änderung steht in der Datei, weiter genau ein Bericht",
      zu2 !== null && zu2 < 800 && !!d2 && d2.length === 1 && d2[0].stoerung === "Hubeinleger hängt - Nachtrag", `${zu2} ms, Datei ${d2 ? d2.length : "?"}: ${d2 && d2[0] ? d2[0].stoerung : ""}`);
  } else {
    ok("(S4) Bearbeiten-Maske ließ sich öffnen", false, "kein Beschreibungsfeld");
  }
  ok("(E) Keine Skriptfehler (Bearbeiten)", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
