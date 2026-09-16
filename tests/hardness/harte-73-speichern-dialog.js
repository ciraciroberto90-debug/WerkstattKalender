// Härtetest: "SPEICHERN" LÄSST DEN DIALOG NICHT MEHR HÄNGEN
// (Robertos Fund vom 16.09.: "beim Klick auf Speichern muss ich erst aus
// dem Popout raus klicken, damit er weg geht").
//
// Ursache war: Der Speichern-Klick wartete auf die KOMPLETTE
// Datei-Speicher-Kette (bei 70.000 Einträgen ~7 s), obwohl die Änderung
// längst übernommen und lokal gesichert war. Seither kehrt das Speichern
// nach der lokalen Sicherung zurück; die Datei wird im Hintergrund
// beschrieben - streng nacheinander.
//
// Die Datei dieses Tests schreibt KÜNSTLICH LANGSAM (2,5 s je Schreibvorgang):
//  (D1) To-do-Dialog: nach "Speichern" ist die Maske in unter 1,5 s zu.
//  (D2) Schichtplan-Notiz: dito.
//  (D3) Trotzdem landet ALLES in der Datei - beide Änderungen stehen nach
//       dem Hintergrund-Schreiben drin (Warteschlange, nichts geht verloren).
//  (D4) Zwei schnelle Speicher-Aktionen hintereinander: beide in der Datei
//       (die Kette schreibt seriell, die Klick-Reihenfolge bleibt erhalten).
//
// ROT-NACHWEIS: Gegen den Bau vor der Entkopplung stehen die Masken je
// ~2,5 s+ - (D1) und (D2) fallen (gemessen am 16.09.).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const p = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));

  // Gemeinsame Datei mit LANGSAMEM Schreiben (2,5 s) - wie ein zähes
  // Firmenlaufwerk. Lesen bleibt schnell, sonst dauert schon das Verbinden.
  const platte = {
    inhalt: JSON.stringify({
      format: "werkstatt-kalender-v1", savedAt: "2026-09-16T05:00:00.000Z",
      entries: [
        { id: "e1", category: "TODO", name: "Bestehendes To-do", date: "2026-09-15", wer: "T. Balles", bis: "2026-09-20", prio: "", erteiltVon: "Roberto", status: "offen", updatedAt: "2026-09-15T08:00:00.000Z" },
      ],
      deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }, { name: "M. Kilic", rolle: "elek" }] },
    }),
  };
  await p.exposeFunction("__lies", () => platte.inhalt);
  await p.exposeFunction("__schreib", async (c) => {
    await new Promise((r) => setTimeout(r, 2500)); // das zähe Laufwerk
    platte.inhalt = c;
  });
  await p.addInitScript(() => {
    localStorage.setItem("bta-standort", "scheurich");
    const bau = { name: "kalender-daten.json", kind: "file",
      async getFile() { const t = await window.__lies(); return new File([t], "kalender-daten.json", { type: "application/json" }); },
      async createWritable() { let x = ""; return { async write(c) { x += c; }, async close() { await window.__schreib(x); }, async abort() {} }; },
      async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } };
    window.showOpenFilePicker = async () => [bau];
  });
  await p.goto(APP);
  await p.locator('button[aria-label="Gemeinsame Datei"]').waitFor({ timeout: 60000 });
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForFunction(() => !/Vorhandene Datei öffnen/.test(document.body.innerText), null, { timeout: 60000 });
  await p.waitForTimeout(1200);

  /* ---- (D1) To-do-Dialog schließt sofort ---- */
  await p.getByRole("button", { name: /^Berichte/ }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: /^To-do/ }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "＋ To-do erteilen" }).click();
  await p.waitForTimeout(300);
  await p.locator('input[aria-label="Aufgabe"]').fill("Werkbank aufräumen");
  await p.locator('select[aria-label="Für wen"]').selectOption("M. Kilic");
  let t0 = Date.now();
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.locator('input[aria-label="Aufgabe"]').waitFor({ state: "detached", timeout: 10000 });
  const d1 = Date.now() - t0;
  pruef("(D1) To-do-Maske ist nach „Speichern“ sofort zu (unter 1,5 s trotz 2,5-s-Laufwerk)",
        d1 < 1500, d1 + " ms");

  /* ---- (D2) Schichtplan-Notiz schließt sofort ---- */
  await p.getByRole("button", { name: "Werkstatt", exact: true }).click();
  await p.waitForTimeout(700);
  await p.locator('button[aria-label^="Matrix T. Balles"]').first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Notiz anheften/ }).click();
  await p.waitForTimeout(300);
  await p.locator("textarea").fill("Zahnarzt, kommt später");
  t0 = Date.now();
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.locator("textarea").waitFor({ state: "detached", timeout: 10000 });
  const d2 = Date.now() - t0;
  pruef("(D2) Notiz-Dialog ist nach „Speichern“ sofort zu (unter 1,5 s trotz 2,5-s-Laufwerk)",
        d2 < 1500, d2 + " ms");

  /* ---- (D4) Direkt noch eine schnelle Aktion hinterher ---- */
  await p.locator('button[aria-label^="Matrix M. Kilic"]').first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Notiz anheften/ }).click();
  await p.waitForTimeout(300);
  await p.locator("textarea").fill("Zweite Notiz sofort danach");
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.locator("textarea").waitFor({ state: "detached", timeout: 10000 });

  /* ---- (D3+D4) Alles landet in der Datei (Warteschlange) ---- */
  // Drei Schreibvorgänge à 2,5 s laufen jetzt seriell im Hintergrund ab.
  await p.waitForTimeout(9500);
  const datei = JSON.parse(platte.inhalt);
  const namen = datei.entries.map((e) => e.name || e.note);
  pruef("(D3) Das To-do steht in der gemeinsamen Datei",
        datei.entries.some((e) => e.category === "TODO" && e.name === "Werkbank aufräumen"));
  pruef("(D3) Die erste Zellen-Notiz steht in der gemeinsamen Datei",
        datei.entries.some((e) => e.category === "SCHICHTNOTIZ" && e.note === "Zahnarzt, kommt später"));
  pruef("(D4) Auch die sofort folgende zweite Notiz steht in der Datei (nichts überholt, nichts verloren)",
        datei.entries.some((e) => e.category === "SCHICHTNOTIZ" && e.note === "Zweite Notiz sofort danach"),
        `${datei.entries.length} Einträge in der Datei`);
  pruef("(D3) Der Alt-Eintrag ist unangetastet", datei.entries.some((e) => e.id === "e1"), namen.slice(0, 4).join(", "));
  pruef("(D1-D4) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  console.log(`\nHärte 73 (Speichern ohne Dialog-Hänger): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
