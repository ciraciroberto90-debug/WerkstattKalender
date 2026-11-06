// Härtetest: SCHICHTEN FORTSCHREIBEN (Roberto 06.11.: "Die Schichten Früh / Spät /
// Spät mit Bereitschaft / Nacht / Bereitschaft am Wochenende müssen für alle
// Mitarbeiter kontinuierlich weiter gehen im selben Schema für 27")
//
// Aufbau: "Test Person" hat 2026 von KW 2 bis KW 53 einen 12-Wochen-Takt als
// Tages-Einträge (F · SB · N · – · – · F+Bereitschaft Sa/So · S · – · – · – · – · –),
// dazwischen eine Urlaubswoche, ein Krank-Tag und ein leerer Weihnachtstag.
// "Azubi Eins" hat nur Schule, "Neu Dabei" gar nichts. Am 01.03.2027 steht für
// Test Person schon "Urlaub" (darf nicht überschrieben werden).
//
//  (F1) Knopf „Schichten fortschreiben …“ im Schichtplan; Dialog zeigt je Person
//       eine Zeile: Test Person Takt 12, Azubi und Neu Dabei werden übersprungen.
//  (F2) Vorschau-Zahl = Zahl der danach wirklich geschriebenen 2027-Einträge.
//  (F3) Takt stimmt: 11.01. Früh, 16.01. Bereits. (Sa), 18.01. Spät, 08.03. Spät mit B,
//       15.03. Nacht; 04.–08.01. (Takt-Lücke) leer.
//  (F4) Feiertag bleibt frei: Fronleichnam 27.05.2027 leer, 26.05. und 28.05. Früh.
//  (F5) Nichts überschrieben: 01.03.2027 bleibt Urlaub, 2026-Einträge unverändert,
//       keine doppelten Ids.
//  (F6) Azubi und Neu Dabei bekommen keine 2027-Einträge; Fertig-Meldung erscheint.
//  (F7) Rechenlogik direkt: periodeErkennen findet 12; fortschreibenFuer lässt
//       bestehende Einträge stehen (Rückgabe ohne den 01.03.).
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor (ohne Fortschreiben) ist F1 rot, weil der
// Knopf fehlt - gemessen 06.11. mit APP_PFAD gegen den Stand von Commit 3436226.
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
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({ tpmAnlagen: [], riItems: [], team: [{ name: "Test Person", rolle: "mech" }, { name: "Azubi Eins", rolle: "azubi" }, { name: "Neu Dabei", rolle: "elek" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] }));
    // 12-Wochen-Takt ab Montag 05.01.2026 (KW 2) bis KW 53, als Tages-Einträge wie in den W:-Daten
    const TAKT = [["Früh"], ["Spät mit B"], ["Nacht"], [], [], ["Früh", "Bereits."], ["Spät"], [], [], [], [], []];
    const pad = (n) => String(n).padStart(2, "0");
    const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const eintrag = (name, k, wert) => ({ id: `schicht-t|${name}|${k}`, date: k, category: "SCHICHT", name, scope: "tag", wert });
    const entries = [];
    const start = new Date(2026, 0, 5);
    for (let w = 0; w < 52; w++) {
      const [wo, we] = TAKT[w % 12];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(d.getDate() + w * 7 + i);
        const k = key(d);
        if (w === 8) { if (i < 5) entries.push(eintrag("Test Person", k, "Urlaub")); continue; } // Urlaubswoche
        if (w === 18 && i === 0) { entries.push(eintrag("Test Person", k, "Krank")); continue; }
        if (k === "2026-12-25") continue; // Weihnachten von Hand frei gelassen
        if (i < 5 && wo) entries.push(eintrag("Test Person", k, wo));
        if (i >= 5 && we) entries.push(eintrag("Test Person", k, we));
      }
      if (w % 3 === 0) for (let i = 0; i < 2; i++) { const d = new Date(start); d.setDate(d.getDate() + w * 7 + i); entries.push(eintrag("Azubi Eins", key(d), "Schule")); }
    }
    entries.push(eintrag("Test Person", "2027-03-01", "Urlaub")); // steht schon - darf nicht überschrieben werden
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(entries));
    localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
    localStorage.setItem("werkstatt-kalender-name", "Chef");
  });
  await p.goto(APP);
  await p.waitForTimeout(800);
  await p.locator('button[data-hauptbereich="COCKPIT"]').click().catch(() => {});
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Schichtplan", exact: true }).first().click();
  await p.waitForTimeout(600);

  const lies = async () => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]").filter((e) => e.category === "SCHICHT"));
  const vorher = await lies();
  const vorher2026 = JSON.stringify(vorher.filter((e) => e.date < "2027").map((e) => [e.name, e.date, e.wert]).sort());

  // (F1) Knopf und Dialog
  const knopf = p.locator("[data-schichtplan-fortschreiben]");
  ok("(F1) Knopf ‚Schichten fortschreiben …' steht im Schichtplan", (await knopf.count()) === 1);
  if (await knopf.count()) { await knopf.click(); await p.waitForTimeout(600); }
  const zeilen = await p.locator("[data-fortschreiben-person]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-fortschreiben-person"), e.getAttribute("data-fortschreiben-takt"), Number(e.getAttribute("data-fortschreiben-neu")), e.innerText.replace(/\s+/g, " ").trim()]));
  const zTest = zeilen.find((z) => z[0] === "Test Person"), zAzubi = zeilen.find((z) => z[0] === "Azubi Eins"), zNeu = zeilen.find((z) => z[0] === "Neu Dabei");
  ok("(F1) Dialog: Test Person Takt 12 Wochen, Azubi Eins und Neu Dabei werden übersprungen", !!zTest && zTest[1] === "12" && zTest[2] > 0 && !!zAzubi && zAzubi[1] === "" && /übersprungen/.test(zAzubi[3]) && !!zNeu && zNeu[1] === "" && /noch keine Schichten/.test(zNeu[3]), JSON.stringify(zeilen.map((z) => z.slice(0, 3))));
  const vorschau = zTest ? zTest[2] : -1;

  // (F2) eintragen
  await p.locator("[data-fortschreiben-eintragen]").click(); await p.waitForTimeout(800);
  const nachher = await lies();
  const neu2027 = nachher.filter((e) => e.date >= "2027" && e.name === "Test Person" && e.date !== "2027-03-01");
  ok("(F2) Vorschau-Zahl = geschriebene 2027-Einträge", vorschau > 0 && neu2027.length === vorschau, `Vorschau ${vorschau}, geschrieben ${neu2027.length}`);
  ok("(F6) Fertig-Meldung erscheint", (await p.locator("[data-fortschreiben-fertig]").count()) === 1 && /Einträge eingetragen/.test(await p.locator("[data-fortschreiben-fertig]").innerText()));

  // (F3) Takt: KW 53/2026 ist Takt-Position 3 (leer) → W1/2027 leer, W2 Früh+Bereitschaft, W3 Spät, … W9 (01.03.) Früh, W10 Spät mit B, W11 Nacht
  const wert = (k) => { const e = nachher.find((x) => x.name === "Test Person" && x.date === k); return e ? e.wert : ""; };
  ok("(F3) 11.01. Früh, 16.01. Bereits. (Sa), 17.01. Bereits. (So), 18.01. Spät", wert("2027-01-11") === "Früh" && wert("2027-01-15") === "Früh" && wert("2027-01-16") === "Bereits." && wert("2027-01-17") === "Bereits." && wert("2027-01-18") === "Spät", [wert("2027-01-11"), wert("2027-01-16"), wert("2027-01-17"), wert("2027-01-18")].join("/"));
  ok("(F3) 08.03. Spät mit B, 15.03. Nacht; 04.–08.01. (Takt-Lücke) leer", wert("2027-03-08") === "Spät mit B" && wert("2027-03-15") === "Nacht" && ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"].every((k) => wert(k) === ""), [wert("2027-03-08"), wert("2027-03-15"), wert("2027-01-05")].join("/"));
  // (F4) Fronleichnam 27.05.2027 (Do, Bayern) in einer Früh-Woche (Takt-Position 0): frei
  ok("(F4) Feiertag bleibt frei: 27.05.2027 leer, 26.05. und 28.05. Früh", wert("2027-05-27") === "" && wert("2027-05-26") === "Früh" && wert("2027-05-28") === "Früh", [wert("2027-05-26"), wert("2027-05-27"), wert("2027-05-28")].join("/"));
  // (F5) Nichts überschrieben
  const nachher2026 = JSON.stringify(nachher.filter((e) => e.date < "2027").map((e) => [e.name, e.date, e.wert]).sort());
  const ids = nachher.map((e) => e.id);
  ok("(F5) 01.03.2027 bleibt Urlaub, 2026 unverändert, keine doppelten Ids", wert("2027-03-01") === "Urlaub" && wert("2027-03-02") === "Früh" && nachher2026 === vorher2026 && new Set(ids).size === ids.length, `01.03.: ${wert("2027-03-01")}, 02.03.: ${wert("2027-03-02")}, ${ids.length} Einträge`);
  ok("(F6) Azubi Eins und Neu Dabei ohne 2027-Einträge", !nachher.some((e) => e.date >= "2027" && e.name !== "Test Person"));
  ok("(F2) Letzter Eintrag am 31.12.2027 oder davor, keiner danach", neu2027.every((e) => e.date <= "2027-12-31") && neu2027.some((e) => e.date >= "2027-12-20"), neu2027[neu2027.length - 1] && neu2027[neu2027.length - 1].date);

  // (F7) Rechenlogik direkt
  const direkt = await p.evaluate(() => {
    const M = window.__wkSchichtMusterTest;
    const takt = [["Früh"], ["Spät mit B"], ["Nacht"], [], [], ["Früh", "Bereits."], ["Spät"], [], [], [], [], []];
    const wochen = [];
    for (let w = 0; w < 40; w++) {
      const [wo, we] = takt[w % 12];
      wochen.push([0, 1, 2, 3, 4].map(() => (w === 7 ? "Urlaub" : wo || "")).concat([we || "", we || ""]));
    }
    const periode = M.periodeErkennen(wochen);
    const entries = JSON.parse(localStorage.getItem("werkstatt-kalender-entries"));
    const r = M.fortschreibenFuer(entries, "Test Person", "2027-12-31", "2026-11-05", new Set());
    return { periode: periode && periode.periode, quote: periode && periode.quote, neu: r.neu.length, ueberschreibt: r.neu.some((e) => e.date === "2027-03-01"), vorlage: M.vorlageKurz(r.vorlage, { "Früh": "F", "Spät": "S", "Spät mit B": "SB", "Nacht": "N", "Bereits.": "B" }).join(" ") };
  });
  ok("(F7) periodeErkennen findet Takt 12 mit 100 % Treffern", direkt.periode === 12 && direkt.quote === 1, JSON.stringify(direkt));
  ok("(F7) fortschreibenFuer nach dem Eintragen: nichts Neues mehr, nichts würde überschrieben", direkt.neu === 0 && direkt.ueberschreibt === false, `neu ${direkt.neu}, Vorlage ${direkt.vorlage}`);
  ok("(E) Keine Skriptfehler", fehler.length === 0, fehler.join(" | "));

  await browser.close();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
