// Härtetest: BERICHTE-STARTSEITE - Score-Halbkreise + bereichsweite Suche
// (Robertos Ansage vom 14.09.). Oben drei Halbkreis-Anzeigen im Stil der
// Übersicht (Überfällige To-dos blau, Backlog orange - beide OHNE Störungs-
// und Zeiterfassungs-Kachel, Robertos Streichung -, Erledigt diese Woche
// grün, je mit "X von Y" darunter). Darunter EINE Suche, die To-dos,
// Störungen, Backlog und Zeiterfassung ZUGLEICH trifft; solange gesucht
// wird, weichen die vertrauten Kacheln der Trefferliste.
//
//  (S1) Die drei Halbkreise stehen mit den richtigen "X von Y"-Zahlen.
//  (S2) Ohne Suche stehen die vier Kacheln wie gehabt.
//  (S3) Ein Suchwort trifft To-do, Störung UND Zeit-Buchung zugleich;
//       die Kacheln sind derweil weg.
//  (S4) Art-Filter engt auf eine Berichts-Art ein.
//  (S5) Status-Filter "Offen" lässt Erledigtes verschwinden.
//  (S6) Klick auf einen Störungs-Treffer springt in die Störungs-Liste
//       und zeigt genau diesen Bericht (Suche mit der Nummer vorgefüllt -
//       dafür durchsucht die Störungs-Suche jetzt auch die Nummer).
//  (S7) "Suche leeren" bringt die Kacheln zurück.
//  (S8) Leser: kein Backlog-Halbkreis, keine Backlog-Pille, keine
//       Backlog-Treffer - To-do- und Störungs-Treffer aber schon.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

// Bestand: 2 offene To-dos (1 überfällig) + 1 diese Woche erledigtes,
// 1 offene + 1 diese Woche erledigte Backlog-Arbeit, 1 Zeit-Buchung,
// 1 offene + 1 diese Woche behobene Störung. Fixe Uhr Montag 14.09.2026:
//   Überfällig 1 von 2 · Backlog 1 von 2 (Jahr) · Erledigt 3 von 6.
const saat = () => {
  delete window.showOpenFilePicker; delete window.showSaveFilePicker;
  localStorage.setItem("bta-standort", "scheurich");
  localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([
    { id: "td1", category: "TODO", name: "Ölauffangwanne unter Kompressor 2 stellen", date: "2026-09-08", wer: "T. Balles", bis: "2026-09-09", prio: "hoch", erteiltVon: "Roberto", status: "offen", updatedAt: "2026-09-08T08:00:00.000Z" },
    { id: "td2", category: "TODO", name: "Leiter-Prüfung Halle 3 vorbereiten", date: "2026-09-10", wer: "M. Kilic", bis: "2026-09-20", prio: "", erteiltVon: "Roberto", status: "offen", updatedAt: "2026-09-10T08:00:00.000Z" },
    { id: "td3", category: "TODO", name: "Feuerlöscher-Standorte abgleichen", date: "2026-09-07", wer: "J. Wiesner", bis: "2026-09-12", prio: "", erteiltVon: "Roberto", status: "done", erledigtAm: "2026-09-14T08:30:00.000Z", erledigtVon: "J. Wiesner", updatedAt: "2026-09-14T08:30:00.000Z" },
    { id: "a1", category: "ARBEIT", name: "TS 480", date: "2026-09-01", status: "open", note: "Riemen tauschen", art: "mech", prio: "hoch", updatedAt: "2026-09-01T08:00:00.000Z" },
    { id: "a2", category: "ARBEIT", name: "Halle 2", date: "2026-08-20", status: "done", note: "Tor-Endschalter prüfen", art: "elek", erledigtAm: "2026-09-14", updatedAt: "2026-09-14T09:00:00.000Z" },
    { id: "z1", category: "ZEIT", name: "T. Balles", date: "2026-09-14", schicht: "Früh", art: "arbeit", ks: "Presserei TS-Anlagen", ksNr: "4711", stunden: 1.5, taetigkeit: "Hydraulik", stoerNr: "2026-0041", updatedAt: "2026-09-14T09:30:00.000Z" },
  ]));
  localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
    tpmAnlagen: [{ id: "a1", name: "TS 480", role: "takt" }], riItems: [],
    team: [{ name: "T. Balles", rolle: "mech" }, { name: "M. Kilic", rolle: "elek" }],
  }));
  localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify([
    { id: "s1", nr: "2026-0041", date: "2026-09-14", schicht: "Früh", anlage: "TS 480", stoerung: "Hydraulikleitung undicht", gewerk: "mech", ausfallzeit: 85, offen: true, gemeldetAt: "2026-09-14T07:00:00.000Z", melder: "T. Balles" },
    { id: "s2", nr: "2026-0040", date: "2026-09-09", schicht: "Spät", anlage: "VSM 1", stoerung: "Lichtschranke verstellt", gewerk: "elek", ausfallzeit: 20, offen: false, gemeldetAt: "2026-09-09T15:00:00.000Z", behobenAt: "2026-09-14T06:30:00.000Z", melder: "M. Kilic" },
  ]));
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ================= Bearbeiter ================= */
  const p = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-09-14T10:00:00"));
  await p.addInitScript(saat);
  await p.goto(APP);
  await p.waitForTimeout(1300);
  await p.getByRole("button", { name: /^Berichte/ }).first().click();
  await p.waitForTimeout(1800); // Einlauf-Animation der Halbkreise abwarten

  /* ---- (S1) Halbkreise mit "X von Y" ---- */
  const startText = await p.locator("body").innerText();
  pruef("(S1) Halbkreis Überfällige To-dos: 1 von 2 offenen",
        /Überfällige To-dos/.test(startText) && /1 von 2 offenen/.test(startText));
  pruef("(S1) Halbkreis Backlog offen: 1 von 2 (Jahr)",
        /Backlog offen/.test(startText) && /1 von 2 \(Jahr\)/.test(startText));
  pruef("(S1) Halbkreis Erledigt diese Woche: 3 von 6 fälligen (To-do + Backlog + Störung gemischt)",
        /Erledigt diese Woche/.test(startText) && /3 von 6 fälligen/.test(startText));
  pruef("(S1) Keine Score-Kachel für Störungen oder Zeiterfassung (Robertos Streichung)",
        !/Offene Störungen/.test(startText) && !/Std\./.test(startText));

  /* ---- (S2) Kacheln stehen ohne Suche ---- */
  pruef("(S2) Ohne Suche stehen die vier Kacheln",
        /Aufgaben – erteilt/.test(startText) && /neue Störung melden/.test(startText)
        && /Arbeiten zum Einplanen/.test(startText) && /in Klärung/.test(startText));

  /* ---- (S3) Ein Wort trifft alle Arten ---- */
  const suchfeld = p.locator('input[placeholder*="Über alle Berichte"]');
  await suchfeld.fill("Balles");
  await p.waitForTimeout(600);
  let text = await p.locator("body").innerText();
  pruef("(S3) „Balles“ trifft To-do, Störung und Zeit-Buchung zugleich",
        /Ölauffangwanne/.test(text) && /Hydraulikleitung/.test(text) && /Presserei TS-Anlagen/.test(text),
        (text.match(/(\d+) Treffer über alle Berichte/i) || [])[1] + " Treffer");
  pruef("(S3) Die Kacheln weichen der Trefferliste",
        !/Aufgaben – erteilt/.test(text) && /Treffer über alle Berichte/i.test(text));

  /* ---- (S4) Art-Filter ---- */
  await p.getByRole("button", { name: "Störungen", exact: true }).last().click();
  await p.waitForTimeout(500);
  text = await p.locator("body").innerText();
  pruef("(S4) Art-Filter Störungen: To-do- und Zeit-Treffer verschwinden",
        /Hydraulikleitung/.test(text) && !/Ölauffangwanne/.test(text) && !/Presserei TS-Anlagen/.test(text));
  await p.getByRole("button", { name: "Alle", exact: true }).first().click();
  await p.waitForTimeout(400);

  /* ---- (S5) Status-Filter Offen ---- */
  await suchfeld.fill("");
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Offen", exact: true }).click();
  await p.waitForTimeout(500);
  text = await p.locator("body").innerText();
  pruef("(S5) Status Offen: Erledigtes und Zeit-Buchungen raus, Offenes bleibt",
        /Ölauffangwanne/.test(text) && /Riemen tauschen/.test(text) && /Hydraulikleitung/.test(text)
        && !/Feuerlöscher-Standorte/.test(text) && !/Lichtschranke/.test(text) && !/Presserei TS-Anlagen/.test(text));

  /* ---- (S6) Sprung in den Störungs-Bericht ---- */
  await p.getByRole("button", { name: /Hydraulikleitung undicht/ }).first().click();
  await p.waitForTimeout(800);
  text = await p.locator("body").innerText();
  pruef("(S6) Klick auf den Störungs-Treffer öffnet die Störungs-Liste mit genau diesem Bericht",
        /Störbericht erfassen/.test(text) && /Hydraulikleitung undicht/.test(text) && !/Lichtschranke verstellt/.test(text));

  /* ---- (S7) Suche leeren bringt die Kacheln zurück ---- */
  await p.getByRole("button", { name: "Alle Berichte", exact: true }).click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Suche leeren" }).click();
  await p.waitForTimeout(500);
  text = await p.locator("body").innerText();
  pruef("(S7) „Suche leeren“ bringt die Kacheln zurück",
        /Aufgaben – erteilt/.test(text) && !/Treffer über alle Berichte/i.test(text));
  pruef("(S1-S7) Keine Skriptfehler (Bearbeiter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  /* ================= (S8) Leser ================= */
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const p2 = await ctx2.newPage();
  const fehler2 = [];
  p2.on("pageerror", (e) => fehler2.push(e.message));
  await p2.clock.setFixedTime(new Date("2026-09-14T10:00:00"));
  await p2.addInitScript(saat);
  await p2.addInitScript(() => {
    const cfg = JSON.parse(localStorage.getItem("werkstatt-kalender-config"));
    cfg.benutzer = [{ name: "chef", rolle: "leser", kennwortHash: "" }, { name: "rc", rolle: "verwalter", kennwortHash: "" }];
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(cfg));
    localStorage.setItem("werkstatt-kalender-benutzer", "chef");
  });
  await p2.goto(APP);
  await p2.waitForTimeout(1300);
  await p2.getByRole("button", { name: /^Berichte/ }).first().click();
  await p2.waitForTimeout(1800);
  let text2 = await p2.locator("body").innerText();
  pruef("(S8) Leser sehen keinen Backlog-Halbkreis und keine Backlog-Filterpille",
        !/Backlog offen/.test(text2) && /Überfällige To-dos/.test(text2)
        && (await p2.getByRole("button", { name: "Backlog", exact: true }).count()) === 0);
  await p2.locator('input[placeholder*="Über alle Berichte"]').fill("tauschen");
  await p2.waitForTimeout(600);
  text2 = await p2.locator("body").innerText();
  pruef("(S8) Die Leser-Suche liefert KEINE Backlog-Treffer",
        !/Riemen tauschen/.test(text2), (text2.match(/(\d+) Treffer/i) || ["", "?"])[1] + " Treffer");
  await p2.locator('input[placeholder*="Über alle Berichte"]').fill("Balles");
  await p2.waitForTimeout(600);
  text2 = await p2.locator("body").innerText();
  pruef("(S8) To-do- und Störungs-Treffer bekommen Leser aber schon",
        /Ölauffangwanne/.test(text2) && /Hydraulikleitung/.test(text2));
  pruef("(S8) Keine Skriptfehler (Leser)", fehler2.length === 0, fehler2.slice(0, 2).join(" | "));

  console.log(`\nHärte 71 (Berichte-Start: Score + Suche): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
