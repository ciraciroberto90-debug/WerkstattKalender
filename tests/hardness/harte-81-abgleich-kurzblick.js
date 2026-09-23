// Härtetest: ABGLEICH-KURZBLICK (Robertos Auftrag vom 21.09., aus dem
// Gedankenspiel "71.000 Einträge je Jahr")
//
// Der 30-Sekunden-Abgleich las bisher bei JEDEM Durchlauf die ganze Datei.
// Jetzt schaut er zuerst nur auf Größe und Änderungszeit und liest den
// Inhalt nur, wenn sich etwas geändert hat. Gezählt wird hier NICHT über den
// eingebauten Zähler allein, sondern über die echten Inhalts-Lesungen der
// Datei (file.text()) - ohne den Kurzblick zählt jeder Abgleich eine Lesung,
// mit ihm keine. So fällt der Test ohne die Änderung rot.
//
//  (1) Datei unverändert: fünf Abgleiche, NULL Inhalts-Lesungen.
//  (2) Ein anderer Rechner schreibt (neue Größe, neue Änderungszeit): der
//      nächste Abgleich liest, der neue Eintrag erscheint in der App.
//  (3) Vorsichtsregel: Änderungszeit jünger als 5 s -> wird gelesen, auch
//      bei gleicher Größe (sekundengenaue Laufwerke, zwei Schreiber).
//  (4) Nach eigenem Speichern: der nächste Abgleich liest NICHT erneut
//      (eigener Stand ist bekannt).
//  (5) Programm-Fassung: ein Handle mit "kurz()" (Größe + Zeit ohne Bytes)
//      wird bevorzugt - getFile() bleibt beim unveränderten Abgleich aus;
//      die Brücken-Funktion liefert aus "stat" die richtigen Werte.
//  (6) Kaputte Datei bleibt erkennbar: nach dem Abriss liest der Abgleich
//      weiter (keine falsche "unverändert"-Kennkarte), die Meldung kommt.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};

const START = { format: "werkstatt-kalender-v1", standort: "scheurich", savedAt: "2026-09-21T06:00:00.000Z", deleted: {}, config: { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [] },
  entries: [{ id: "n1", date: "2026-09-21", category: "NOTIZ", name: "Chef", note: "ERSTER ZETTEL", veroeffentlicht: true, zeit: "2026-09-21T05:00:00.000Z", updatedAt: "2026-09-21T05:00:00.000Z" }] };

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  // "Laufwerk": Inhalt + Änderungszeit, getrennt steuerbar
  const platte = { text: JSON.stringify(START, null, 2), mtime: Date.now() - 60000 };
  const zaehler = { inhalt: 0, oeffnen: 0 };

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.exposeFunction("__lies", () => ({ text: platte.text, mtime: platte.mtime }));
  await p.exposeFunction("__schreib", (t) => { platte.text = t; platte.mtime = Date.now(); });
  await p.exposeFunction("__zaehle", (was) => { zaehler[was]++; });
  await p.addInitScript(() => {
    try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {}
    const handle = {
      name: "kalender-daten.json", kind: "file",
      async getFile() {
        await window.__zaehle("oeffnen");
        const { text, mtime } = await window.__lies();
        const f = new File([text], "kalender-daten.json", { type: "application/json", lastModified: mtime });
        // Echte Inhalts-Lesung zählen - genau die soll der Kurzblick einsparen.
        const orig = f.text.bind(f);
        f.text = async () => { await window.__zaehle("inhalt"); return orig(); };
        return f;
      },
      async createWritable() { let b = ""; return { async write(t) { b += t; }, async close() { await window.__schreib(b); }, async abort() {} }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    };
    window.showOpenFilePicker = async () => [handle];
    window.__handle = handle;
  });
  await p.goto(APP);
  await p.waitForTimeout(800);
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForFunction(() => /ERSTER ZETTEL/.test(document.body.innerText), null, { timeout: 30000 });
  await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(600);
  const poll = () => p.evaluate(() => window.__wkSharedTest.poll());
  const appZaehler = () => p.evaluate(() => window.__wkSharedTest.leseZaehler());

  /* ---- (1) unverändert ---- */
  const vor1 = zaehler.inhalt;
  for (let i = 0; i < 5; i++) await poll();
  await p.waitForTimeout(200);
  ok("(1) Fünf Abgleiche bei unveränderter Datei: NULL Inhalts-Lesungen", zaehler.inhalt === vor1, `Lesungen ${zaehler.inhalt - vor1}`);
  const z1 = await appZaehler();
  ok("(1) Der eingebaute Zähler meldet fünf Kurzblicke", z1 && z1.kurz >= 5, JSON.stringify(z1));

  /* ---- (2) fremde Änderung ---- */
  const fremd = JSON.parse(platte.text);
  fremd.entries.push({ id: "n2", date: "2026-09-21", category: "NOTIZ", name: "Kollege", note: "ZWEITER ZETTEL VOM ANDEREN RECHNER", veroeffentlicht: true, zeit: "2026-09-21T07:00:00.000Z", updatedAt: "2026-09-21T07:00:00.000Z" });
  fremd.savedAt = "2026-09-21T07:00:00.000Z";
  platte.text = JSON.stringify(fremd, null, 2);
  platte.mtime = Date.now() - 20000; // vor 20 s geschrieben - älter als die Ruhefrist
  const vor2 = zaehler.inhalt;
  await poll();
  await p.waitForTimeout(600);
  ok("(2) Fremde Änderung (neue Größe/Zeit): der Abgleich liest genau einmal", zaehler.inhalt === vor2 + 1, `Lesungen ${zaehler.inhalt - vor2}`);
  ok("(2) Der fremde Zettel steht in der App", /ZWEITER ZETTEL VOM ANDEREN RECHNER/.test(await p.locator("body").innerText()));
  const vor2b = zaehler.inhalt;
  await poll(); await poll();
  ok("(2) Danach wieder Ruhe: zwei weitere Abgleiche ohne Lesung", zaehler.inhalt === vor2b);

  /* ---- (3) Ruhefrist: frische Änderungszeit, gleiche Größe ---- */
  platte.mtime = Date.now() - 1000; // gerade eben "berührt", Inhalt gleich groß
  const vor3 = zaehler.inhalt;
  await poll();
  ok("(3) Änderungszeit jünger als 5 s: wird trotz gleicher Größe gelesen (Vorsichtsregel)", zaehler.inhalt === vor3 + 1, `Lesungen ${zaehler.inhalt - vor3}`);
  platte.mtime = Date.now() - 30000;
  await poll(); // nimmt die neue (alte) Zeit als bekannt auf
  const vor3b = zaehler.inhalt;
  await poll();
  ok("(3) Mit alter Änderungszeit wieder Kurzblick ohne Lesung", zaehler.inhalt === vor3b);

  /* ---- (4) eigenes Speichern ---- */
  await p.locator('button[aria-label="Neue Notiz anpinnen"]').click();
  await p.waitForTimeout(300);
  await p.locator("textarea").first().fill("MEIN EIGENER ZETTEL");
  await p.getByPlaceholder(/Dein Name/).first().fill("Chef");
  await p.getByRole("button", { name: "Anpinnen", exact: true }).first().click();
  await p.waitForFunction(() => window.__wkStorageTest && typeof window.__wkStorageTest.dateiFertig === "function" ? window.__wkStorageTest.dateiFertig() : true, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  ok("(4) Der eigene Zettel steht in der Datei", /MEIN EIGENER ZETTEL/.test(platte.text));
  // Die Datei wurde soeben geschrieben - Ruhefrist abwarten (Zeit zurückdrehen statt warten)
  platte.mtime = Date.now() - 30000;
  const eigen = JSON.parse(platte.text);
  await p.evaluate(() => window.__wkSharedTest.poll()); // nimmt die zurückgedrehte Zeit als bekannt auf
  const vor4 = zaehler.inhalt;
  await poll(); await poll();
  ok("(4) Nach eigenem Speichern und Ruhefrist: Abgleiche ohne Lesung", zaehler.inhalt === vor4, `Lesungen ${zaehler.inhalt - vor4}`);
  ok("(4) Kein anderer Eintrag verloren (beide fremden Zettel noch da)", eigen.entries.some((e) => e.id === "n1") && eigen.entries.some((e) => e.id === "n2"));

  /* ---- (6) kaputte Datei bleibt erkennbar ---- */
  const heil = platte.text;
  platte.text = heil.slice(0, Math.floor(heil.length / 2)); // Abriss mitten im Schreiben
  platte.mtime = Date.now() - 30000;
  const vor6 = zaehler.inhalt;
  await poll(); await poll(); await poll();
  await p.waitForTimeout(800);
  ok("(6) Kaputte Datei: jeder Abgleich liest weiter (keine falsche „unverändert“-Kennkarte)", zaehler.inhalt >= vor6 + 2, `Lesungen ${zaehler.inhalt - vor6}`);
  const heilung = /repariert|beschädigt|unvollständig|Reparatur/i.test(await p.locator("body").innerText()) || /ERSTER ZETTEL/.test(platte.text) && platte.text.trim().endsWith("}");
  ok("(6) Die App meldet den Schaden oder hat ihn repariert", heilung);
  ok("(1-6) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  await ctx.close();

  /* ---- (5) Programm-Fassung: Handle mit kurz() ---- */
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p2 = await ctx2.newPage();
  const z2 = { getFile: 0, kurz: 0, stat: 0 };
  await p2.exposeFunction("__z2", (was) => { z2[was]++; });
  await p2.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
  await p2.goto(APP);
  await p2.waitForTimeout(800);
  await p2.evaluate(async (start) => {
    const text = JSON.stringify(start, null, 2);
    const mtime = Date.now() - 60000;
    const handle = {
      name: "kalender-daten.json", kind: "file",
      async getFile() { await window.__z2("getFile"); return new File([text], "kalender-daten.json", { type: "application/json", lastModified: mtime }); },
      async kurz() { await window.__z2("kurz"); return { size: new Blob([text]).size, lastModified: mtime }; },
      async createWritable() { return { async write() {}, async close() {}, async abort() {} }; },
      async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
    };
    await window.__wkSharedTest.adopt(handle, "read");
  }, START);
  await p2.waitForTimeout(600);
  const g0 = z2.getFile;
  for (let i = 0; i < 4; i++) await p2.evaluate(() => window.__wkSharedTest.poll());
  ok("(5) Handle mit kurz(): vier Abgleiche fragen nur kurz() - getFile() bleibt aus", z2.kurz >= 4 && z2.getFile === g0, JSON.stringify(z2));
  // Brücken-Funktion: aus "stat" der Programm-Brücke wird der Kurzblick
  const brueckenKurz = await p2.evaluate(async () => {
    window.__werkstattDesktop = { stat: async () => ({ groesse: 4711, geaendert: 1700000000000 }), lese: async () => null };
    const h = window.__wkDesktopTest.dateiHandle("C:\\Werkstatt\\kalender-daten.json");
    const k = await h.kurz();
    window.__werkstattDesktop = { lese: async () => null }; // alte Fassung ohne stat
    const alt = await window.__wkDesktopTest.dateiHandle("C:\\x.json").kurz();
    return { k, alt };
  });
  ok("(5) Programm-Brücke: kurz() liefert Größe und Zeit aus „stat“, alte Brücke ohne stat -> null (Rückfall aufs volle Lesen)",
    brueckenKurz.k && brueckenKurz.k.size === 4711 && brueckenKurz.k.lastModified === 1700000000000 && brueckenKurz.alt === null, JSON.stringify(brueckenKurz));
  await ctx2.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
