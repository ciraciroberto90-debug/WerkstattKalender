// Härtetest: ÜBERSCHNEIDUNG - DER UNTERLEGENE BEKOMMT EINEN HINWEIS
// (Robertos Entscheidung vom 23.09. nach der Sonde "zwei Bearbeiter, ein Zettel")
//
// Regel beim Zusammenführen: Der jüngere Zeitstempel gewinnt den GANZEN
// Eintrag. Bisher bekam der Unterlegene "gespeichert" und nie einen Hinweis.
// Jetzt merkt sich jedes Fenster seine jüngsten Änderungen und erkennt am
// eingehenden Stand, ob seine Felder überschrieben wurden.
//
//  (K1) Anna und Bernd ändern DENSELBEN Zettel exakt gleichzeitig. Genau EIN
//       Fenster zeigt danach den Hinweis - mit dem Namen des Gewinners und
//       dem eigenen, überschriebenen Text; der Gewinner sieht keinen.
//  (K2) "Meine Fassung wiederherstellen" schreibt den eigenen Text zurück:
//       Datei und beide Fenster tragen ihn, und der VORHERIGE Gewinner
//       bekommt nun seinerseits den Hinweis. Der Hinweis beim Klicker ist weg.
//  (K3) Kein Fehlalarm: Bernd holt Annas Fassung ab und ändert danach nur
//       die Farbe - Annas Notiz bleibt erhalten, Anna bekommt KEINEN Hinweis.
//  (K4) "Verstanden" räumt den Hinweis weg.
//  (K5) Keine Skriptfehler in beiden Fenstern.
//
// Hausregel (Rot-Nachweis): Gegen den Bau von VOR dem Umbau (APP_PFAD auf die
// alte HTML) schlagen K1, K2 und K4 fehl - dort gibt es den Hinweis nicht.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};

const platte = {};
const BESTAND = [{ id: "X", date: "2026-09-23", category: "NOTIZ", name: "RC", status: "open", note: "Original", zeit: "2026-09-23T06:00:00.000Z", updatedAt: "2026-09-23T06:00:00.000Z", sichtbar: "alle", veroeffentlicht: true, farbe: "gelb" }];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  platte["kalender-daten.json"] = JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: "2026-09-23T06:00:00.000Z", entries: BESTAND, deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }] } });
  const fenster = async (wer) => {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR " + wer + ":", e.message); });
    await p.exposeFunction("__lese", (n) => platte[n] ?? "");
    await p.exposeFunction("__schreibe", (n, t) => { platte[n] = t; });
    await p.addInitScript((wer) => {
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-name", wer);
      const mk = (name) => ({ name, kind: "file",
        async getFile() { return new File([await window.__lese(name)], name, { type: "application/json" }); },
        async createWritable() { let s = ""; return { async write(t) { s += t; }, async close() { await window.__schreibe(name, s); } }; },
        async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } });
      window.showOpenFilePicker = async () => [mk("kalender-daten.json")];
    }, wer);
    await p.goto(APP);
    await p.waitForTimeout(700);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForFunction(() => !/Vorhandene Datei öffnen/.test(document.body.innerText), null, { timeout: 60000 });
    await p.waitForTimeout(1500);
    return { p, fehler };
  };
  const A = await fenster("Anna");
  const B = await fenster("Bernd");
  // Änderung über den echten Speicherweg der App (wie harte-70).
  const aendere = (p, patch) => p.evaluate(async (patch) => {
    const roh = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
    const x = roh.find((e) => e.id === "X"); Object.assign(x, patch);
    await window.storage.set("werkstatt-kalender-entries", JSON.stringify(roh));
    if (window.__wkStorageTest) await window.__wkStorageTest.dateiFertig();
  }, patch);
  const poll = (p) => p.evaluate(() => window.__wkSharedTest.poll());
  const inDatei = () => JSON.parse(platte["kalender-daten.json"]).entries.find((e) => e.id === "X");
  const sieht = (p) => p.evaluate(() => { const x = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").find((e) => e.id === "X"); return x && x.note; });
  const hinweis = (p) => p.locator('[role="alert"][aria-label="Überschneidung"]');

  /* ---- (K1) exakt gleichzeitig ---- */
  await Promise.all([aendere(A.p, { note: "Text von Anna" }), aendere(B.p, { note: "Text von Bernd" })]);
  await A.p.waitForTimeout(12000); // Heil-Kette wie in harte-70 abwarten
  await poll(A.p); await poll(B.p);
  await A.p.waitForTimeout(500);
  const gewinner = inDatei().note === "Text von Anna" ? "Anna" : (inDatei().note === "Text von Bernd" ? "Bernd" : "?");
  const verlierer = gewinner === "Anna" ? B : (gewinner === "Bernd" ? A : null);
  const sieger = gewinner === "Anna" ? A : B;
  const verliererName = gewinner === "Anna" ? "Bernd" : "Anna";
  ok("(K1) Einer hat gewonnen, beide Fenster zeigen seine Fassung",
    gewinner !== "?" && (await sieht(A.p)) === inDatei().note && (await sieht(B.p)) === inDatei().note, `Gewinner ${gewinner}`);
  const hText = verlierer ? await hinweis(verlierer.p).innerText().catch(() => "") : "";
  ok("(K1) Der Unterlegene sieht den Hinweis mit Gewinner-Name und seinem eigenen Text",
    !!verlierer && (await hinweis(verlierer.p).count()) === 1 && hText.includes(gewinner) && hText.includes(`Text von ${verliererName}`) && /Notiz/.test(hText),
    hText.replace(/\s+/g, " ").slice(0, 160));
  ok("(K1) Der Gewinner sieht KEINEN Hinweis", (await hinweis(sieger.p).count()) === 0);

  /* ---- (K2) Meine Fassung wiederherstellen ---- */
  if (verlierer) {
    await verlierer.p.getByRole("button", { name: "Meine Fassung wiederherstellen" }).click();
    await verlierer.p.waitForTimeout(3000);
    await poll(sieger.p);
    await sieger.p.waitForTimeout(500);
    ok("(K2) Die Datei trägt wieder den Text des vorher Unterlegenen", inDatei().note === `Text von ${verliererName}`, inDatei().note);
    ok("(K2) Beide Fenster zeigen ihn", (await sieht(A.p)) === `Text von ${verliererName}` && (await sieht(B.p)) === `Text von ${verliererName}`);
    ok("(K2) Beim Klicker ist der Hinweis weg", (await hinweis(verlierer.p).count()) === 0);
    const h2 = await hinweis(sieger.p).innerText().catch(() => "");
    ok("(K2) Der vorherige Gewinner bekommt nun den Hinweis - mit SEINEM Text",
      (await hinweis(sieger.p).count()) === 1 && h2.includes(verliererName) && h2.includes(`Text von ${gewinner}`), h2.replace(/\s+/g, " ").slice(0, 160));

    /* ---- (K4) Verstanden ---- */
    await sieger.p.getByRole("button", { name: "Verstanden" }).click();
    await sieger.p.waitForTimeout(300);
    ok("(K4) „Verstanden“ räumt den Hinweis weg", (await hinweis(sieger.p).count()) === 0);
  } else {
    ok("(K2) übersprungen - kein Gewinner feststellbar", false);
  }

  /* ---- (K3) kein Fehlalarm: aufbauen statt überschreiben ---- */
  await aendere(A.p, { note: "Anna dritte Runde" });
  await A.p.waitForTimeout(2500);
  await poll(B.p); // Bernd holt Annas Fassung ab
  await B.p.waitForTimeout(500);
  ok("(K3) Bernd hat Annas Fassung", (await sieht(B.p)) === "Anna dritte Runde");
  await aendere(B.p, { farbe: "gruen" }); // baut darauf auf: andere Felder, Notiz bleibt
  await B.p.waitForTimeout(2500);
  await poll(A.p);
  await A.p.waitForTimeout(500);
  ok("(K3) Annas Notiz ist erhalten, Bernds Farbe dazu", inDatei().note === "Anna dritte Runde" && inDatei().farbe === "gruen", JSON.stringify({ note: inDatei().note, farbe: inDatei().farbe }));
  ok("(K3) Anna bekommt KEINEN Hinweis (Bernd hat auf ihrer Fassung aufgebaut)", (await hinweis(A.p).count()) === 0);
  ok("(K3) Bernd bekommt ebenfalls keinen", (await hinweis(B.p).count()) === 0);

  ok("(K5) Keine Skriptfehler Anna", A.fehler.length === 0, A.fehler.slice(0, 2).join(" | "));
  ok("(K5) Keine Skriptfehler Bernd", B.fehler.length === 0, B.fehler.slice(0, 2).join(" | "));

  await b.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
