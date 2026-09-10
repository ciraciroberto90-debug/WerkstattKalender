// Härtetest: BEREICH "BERICHTE" + TO-DO-LISTE (großer Umbau, Robertos
// Meeting vom 10.09.). Hauptleiste Übersicht | Berichte | Werkstatt | TPM;
// im Bereich Berichte die Kacheln To-do / Störungen / Backlog (nur
// Bearbeiter) / Zeiterfassung (in Klärung). Ein To-do ist eine GANZ NORMALE
// erteilte Aufgabe ohne Störungs-/Zeitbezug (Robertos Klarstellung).
//
//  (B1) Bearbeiter: alle vier Hauptbereiche, Berichte zeigt die Kacheln.
//  (B2) To-do erteilen über die Oberfläche -> liegt mit Titel, Person,
//       Frist und Priorität im Bestand und ÜBERLEBT den Neustart.
//  (B3) Abhaken setzt erledigt (mit Stempel), nochmal klicken öffnet wieder.
//  (B4) Überfällige stehen als eigene rote Gruppe oben; der
//       Berichte-Knopf trägt das Badge.
//  (B5) Leser sehen NUR Übersicht + Berichte, keine Backlog-Kachel,
//       keinen Erteilen-Knopf - aber die To-do-Liste zum Lesen.
//  (B6) Die Störungs-Kachel führt wirklich in die Störungs-Liste.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const p = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-09-10T10:00:00"));
  await p.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    if (localStorage.getItem("harte67-gesaet")) return; // reload() darf den Stand nicht zurücksetzen
    localStorage.setItem("harte67-gesaet", "1");
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([
      { id: "td1", category: "TODO", name: "Ölauffangwanne unter Kompressor 2 stellen", date: "2026-09-08", wer: "T. Balles", bis: "2026-09-09", prio: "hoch", erteiltVon: "Roberto", status: "offen", updatedAt: "2026-09-08T08:00:00.000Z" },
      { id: "a1", category: "ARBEIT", name: "TS 480", date: "2026-09-01", status: "open", note: "Riemen tauschen", art: "mech", prio: "hoch", updatedAt: "2026-09-01T08:00:00.000Z" },
    ]));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
      tpmAnlagen: [{ id: "a1", name: "TS 480", role: "takt" }], riItems: [],
      team: [{ name: "T. Balles", rolle: "mech" }, { name: "M. Kilic", rolle: "elek" }],
    }));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify([
      { id: "s1", nr: "2026-0041", date: "2026-09-10", schicht: "Früh", anlage: "TS 480", stoerung: "Hydraulikleitung undicht", gewerk: "mech", ausfallzeit: 85, offen: true, gemeldetAt: "2026-09-10T07:00:00.000Z", melder: "TB" },
    ]));
  });
  await p.goto(APP);
  await p.waitForTimeout(1300);

  /* ---- (B1) Hauptleiste + Kacheln ---- */
  pruef("(B1) Bearbeiter sieht Übersicht, Berichte, Werkstatt und TPM",
        (await p.getByRole("button", { name: "Übersicht", exact: true }).count()) >= 1 &&
        (await p.getByRole("button", { name: /^Berichte/ }).count()) >= 1 &&
        (await p.getByRole("button", { name: "Werkstatt", exact: true }).count()) === 1 &&
        (await p.getByRole("button", { name: "TPM", exact: true }).count()) === 1);
  /* ---- (B4, Teil 1) Badge am Berichte-Knopf: 1 offene Störung + 1 überfälliges To-do ---- */
  const badgeText = await p.getByRole("button", { name: /^Berichte/ }).first().textContent();
  pruef("(B4) Der Berichte-Knopf trägt das Badge (Störungen + überfällige To-dos)",
        /2/.test(badgeText || ""), (badgeText || "").trim());
  await p.getByRole("button", { name: /^Berichte/ }).first().click();
  await p.waitForTimeout(500);
  const kachelText = await p.locator("body").innerText();
  pruef("(B1) Die Kacheln To-do, Störungen, Backlog und Zeiterfassung stehen da",
        /Aufgaben – erteilt/.test(kachelText) && /neue Störung melden/.test(kachelText)
        && /Arbeiten zum Einplanen/.test(kachelText) && /in Klärung/.test(kachelText));

  /* ---- (B2) To-do erteilen + Neustart ---- */
  await p.getByRole("button", { name: /^To-do/ }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "＋ To-do erteilen" }).click();
  await p.waitForTimeout(300);
  await p.locator('input[aria-label="Aufgabe"]').fill("Werkzeugschrank aufräumen");
  await p.locator('select[aria-label="Für wen"]').selectOption("M. Kilic");
  await p.locator('input[aria-label="Bis wann"]').fill("2026-09-18");
  await p.getByRole("button", { name: "hoch", exact: true }).click();
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.waitForTimeout(600);
  await p.reload();
  await p.waitForTimeout(1300);
  const bestand = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries")));
  const neu = bestand.find((e) => e.category === "TODO" && e.name === "Werkzeugschrank aufräumen");
  pruef("(B2) Das erteilte To-do überlebt den Neustart mit allen Feldern",
        !!neu && neu.wer === "M. Kilic" && neu.bis === "2026-09-18" && neu.prio === "hoch" && neu.status === "offen",
        neu ? `${neu.wer} | bis ${neu.bis} | ${neu.prio}` : "fehlt");

  /* ---- (B4, Teil 2) Überfällig-Gruppe ---- */
  await p.getByRole("button", { name: /^Berichte/ }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /^To-do/ }).first().click();
  await p.waitForTimeout(400);
  const listeText = await p.locator("body").innerText();
  pruef("(B4) Das überfällige To-do steht in der roten Überfällig-Gruppe",
        /ÜBERFÄLLIG \(1\)/i.test(listeText) && /Ölauffangwanne/.test(listeText));

  /* ---- (B3) Abhaken und wieder öffnen ---- */
  await p.locator('button[aria-label="To-do Ölauffangwanne unter Kompressor 2 stellen abhaken"]').click();
  await p.waitForTimeout(500);
  let td1 = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries"))).find((e) => e.id === "td1");
  pruef("(B3) Abhaken setzt erledigt mit Zeitstempel", td1.status === "done" && !!td1.erledigtAm, td1.erledigtAm);
  await p.locator('button[aria-label="To-do Ölauffangwanne unter Kompressor 2 stellen wieder öffnen"]').click();
  await p.waitForTimeout(500);
  td1 = JSON.parse(await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries"))).find((e) => e.id === "td1");
  pruef("(B3) Nochmal klicken öffnet das To-do wieder", td1.status === "offen");

  /* ---- (B6) Störungs-Kachel führt in die Liste ---- */
  await p.getByRole("button", { name: "Alle Berichte", exact: true }).click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /Störungen Berichte ansehen/ }).click();
  await p.waitForTimeout(600);
  pruef("(B6) Die Störungs-Kachel öffnet die Störungs-Liste",
        (await p.getByText("Störbericht erfassen").count()) >= 1);
  pruef("(B1-B6) Keine Skriptfehler (Bearbeiter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  /* ---- (B5) Leser ---- */
  const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const p2 = await ctx2.newPage();
  const fehler2 = [];
  p2.on("pageerror", (e) => fehler2.push(e.message));
  await p2.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([
      { id: "td1", category: "TODO", name: "Ölauffangwanne stellen", date: "2026-09-08", wer: "T. Balles", bis: "2026-09-09", prio: "hoch", erteiltVon: "Roberto", status: "offen", updatedAt: "2026-09-08T08:00:00.000Z" },
    ]));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
      tpmAnlagen: [{ id: "a1", name: "TS 480", role: "takt" }], riItems: [], team: [],
      benutzer: [{ name: "chef", rolle: "leser", kennwortHash: "" }, { name: "rc", rolle: "verwalter", kennwortHash: "" }],
    }));
    localStorage.setItem("werkstatt-kalender-benutzer", "chef");
  });
  await p2.goto(APP);
  await p2.waitForTimeout(1300);
  pruef("(B5) Leser sehen NUR Übersicht + Berichte",
        (await p2.getByRole("button", { name: "Übersicht", exact: true }).count()) >= 1 &&
        (await p2.getByRole("button", { name: /^Berichte/ }).count()) >= 1 &&
        (await p2.getByRole("button", { name: "Werkstatt", exact: true }).count()) === 0 &&
        (await p2.getByRole("button", { name: "TPM", exact: true }).count()) === 0);
  await p2.getByRole("button", { name: /^Berichte/ }).first().click();
  await p2.waitForTimeout(500);
  pruef("(B5) Leser sehen KEINE Backlog-Kachel",
        !(await p2.locator("body").innerText()).includes("Arbeiten zum Einplanen"));
  await p2.getByRole("button", { name: /^To-do/ }).first().click();
  await p2.waitForTimeout(400);
  pruef("(B5) Leser lesen die To-do-Liste, aber ohne Erteilen-Knopf",
        (await p2.getByText("Ölauffangwanne stellen").count()) >= 1 &&
        (await p2.getByRole("button", { name: "＋ To-do erteilen" }).count()) === 0);
  pruef("(B5) Keine Skriptfehler (Leser)", fehler2.length === 0, fehler2.slice(0, 2).join(" | "));

  console.log(`\nHärte 67 (Berichte + To-do): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
