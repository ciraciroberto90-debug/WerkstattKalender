// Härtetest: KACHEL-GRÖSSE ZIEHEN (Robertos Wunsch vom 24.09.: "die Größe
// muss anpassbar sein, so wie bei unseren Pop-outs - Kacheln passen sich an")
//
//  (G1) Standard: alle Kacheln 1×1 und exakt gleich breit (nichts verändert).
//  (G2) Anordnen-Modus: jede Kachel hat die Zieh-Ecke; Ecke der ersten Kachel
//       um eine Spalte nach rechts ziehen -> breite 2 im Layout, die Kachel
//       ist (Spalte + Lücke) breiter, die Nachbarn rücken nach.
//  (G3) Weiter nach unten ziehen -> hoehe 2: die Kachel ist doppelt so hoch,
//       der Bogen/die Zahl wächst mit (skala 1,5), die Reihe darunter
//       ordnet sich neu.
//  (G4) ▾-Menü: Chips "Größe 1×1 … 4×2"; "Größe 1×1" setzt zurück.
//  (G5) Zahnrad-Tabelle: Spalte "Größe" für die Leser-Vorlage -> ein Leser-
//       Rechner zeichnet die Kachel breit.
//  (G6) Grenzen: nicht breiter als 4, nicht höher als 3; altes Layout ohne
//       Größe liest sich als 1×1.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor gibt es weder Ecke noch Größen-Chips.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-23";
const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }],
};
const entries = [
  { id: "t1", date: "2026-09-02", category: "TPM", name: "TS480", status: "done" },
  { id: "t2", date: "2026-09-21", category: "TPM", name: "TS480", status: "open" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  let konfig = JSON.stringify(config);
  const seite = async (benutzer, layout) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
    await p.addInitScript(({ c, e, benutzer, layout }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", c);
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
      localStorage.setItem("werkstatt-stoerungen-entries", "[]");
      localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
      if (layout) localStorage.setItem("wk-uebersicht-layout", JSON.stringify(layout));
    }, { c: konfig, e: entries, benutzer, layout });
    await p.goto(APP);
    await p.waitForTimeout(1300);
    const zu = async () => {
      const v = await p.evaluate(() => (JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}").uebersichtVorlagen) || null);
      if (v) konfig = JSON.stringify({ ...JSON.parse(konfig), uebersichtVorlagen: v });
      await ctx.close();
    };
    return { p, fehler, zu };
  };
  const layoutVon = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout") || "null"));
  const masse = (p, sel) => p.locator(sel).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { b: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; }));
  const rahmenMasse = (p) => masse(p, '[data-anordnen="kennzahlen"] [data-anordnen]');

  /* ================= Verwalter: ziehen ================= */
  {
    const { p, fehler, zu } = await seite("Chef", null);
    const huellen = await masse(p, "[data-kachel-huelle]");
    const breiten = [...new Set(huellen.map((m) => m.b))];
    ok("(G1) Standard: sieben Kacheln in einer Reihe, alle exakt gleich breit", huellen.length === 7 && breiten.length === 1 && new Set(huellen.map((m) => m.y)).size === 1, JSON.stringify(breiten));
    const lay0 = await layoutVon(p);
    ok("(G1) Jede Kachel steht mit 1×1 im Layout", !lay0 || Object.values(lay0.kachelDef || {}).every((d) => d.breite === 1 && d.hoehe === 1));

    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Personalisieren", exact: true }).click();
    await p.waitForTimeout(300);
    await p.locator('button[aria-label="Übersicht direkt anordnen"]').click();
    await p.waitForTimeout(600);
    const griffe = await p.locator("[data-groesse-griff]").count();
    ok("(G2) Im Anordnen-Modus hat jede der sieben Kacheln eine Zieh-Ecke", griffe === 7, String(griffe));
    const vorher = await rahmenMasse(p);
    const spalte = vorher[1].x - vorher[0].x; // Spaltenbreite inkl. Lücke
    const griff = p.locator('[data-groesse-griff="heuteFaellig"]');
    const g = await griff.boundingBox();
    // Ecke fassen und eine Spalte nach rechts ziehen (in Schritten, wie eine Maus)
    await p.mouse.move(g.x + g.width - 4, g.y + g.height - 4);
    await p.mouse.down();
    for (let i = 1; i <= 6; i++) { await p.mouse.move(g.x + g.width - 4 + (spalte * i) / 6, g.y + g.height - 4); await p.waitForTimeout(40); }
    await p.mouse.up();
    await p.waitForTimeout(500);
    const lay1 = await layoutVon(p);
    const nachher = await rahmenMasse(p);
    ok("(G2) Nach dem Ziehen: Kachel 1 ist 2 Spalten breit (Layout breite 2, Höhe 1)",
      lay1.kachelDef.heuteFaellig.breite === 2 && lay1.kachelDef.heuteFaellig.hoehe === 1, JSON.stringify(lay1.kachelDef.heuteFaellig));
    ok("(G2) … und misst Spalte + Lücke + Spalte; der Nachbar ist nach rechts gerückt",
      Math.abs(nachher[0].b - (vorher[0].b + spalte)) <= 3 && nachher[1].x > vorher[1].x + spalte - 3, `vorher ${vorher[0].b}, nachher ${nachher[0].b}, Spalte ${spalte}`);
    ok("(G2) Die anderen Kacheln sind unverändert breit (kein Quetschen)", nachher.slice(1).every((m) => Math.abs(m.b - vorher[1].b) <= 3), JSON.stringify(nachher.slice(1).map((m) => m.b)));

    /* (G3) nach unten ziehen */
    const g2 = await griff.boundingBox();
    const hoeheVorher = nachher[0].h;
    await p.mouse.move(g2.x + g2.width - 4, g2.y + g2.height - 4);
    await p.mouse.down();
    for (let i = 1; i <= 6; i++) { await p.mouse.move(g2.x + g2.width - 4, g2.y + g2.height - 4 + (hoeheVorher * i) / 6); await p.waitForTimeout(40); }
    await p.mouse.up();
    await p.waitForTimeout(600);
    const lay2 = await layoutVon(p);
    const m3 = await rahmenMasse(p);
    ok("(G3) Nach unten gezogen: Höhe 2 im Layout, Breite bleibt 2", lay2.kachelDef.heuteFaellig.hoehe === 2 && lay2.kachelDef.heuteFaellig.breite === 2, JSON.stringify(lay2.kachelDef.heuteFaellig));
    ok("(G3) Die Kachel ist rund doppelt so hoch wie die Nachbarn", m3[0].h > m3[1].h * 1.7 && m3[0].h < m3[1].h * 2.4, `${m3[0].h} zu ${m3[1].h}`);
    const zahlGroesse = await p.locator('[data-kachel-inhalt="heuteFaellig"] div.font-extrabold').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const zahlNachbar = await p.locator('[data-kachel-inhalt="heuteErledigt"] div.font-extrabold').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    ok("(G3) Der Inhalt wächst mit (Zahl anderthalbfach)", Math.abs(zahlGroesse / zahlNachbar - 1.5) < 0.05, `${zahlGroesse} / ${zahlNachbar}`);

    /* (G4) Chips im ▾-Menü */
    await p.locator('button[aria-label="Inhalt Heute fällig wählen"]').click();
    await p.waitForTimeout(250);
    const menue = p.locator('[role="menu"][aria-label="Kachel-Inhalt Heute fällig"]');
    ok("(G4) Das ▾-Menü hat die Größen-Chips, 2×2 ist markiert",
      (await menue.locator('[role="menuitemradio"][aria-label^="Größe "]').count()) === 7 && (await menue.locator('[role="menuitemradio"][aria-label="Größe 2×2"]').getAttribute("aria-checked")) === "true");
    await menue.locator('[role="menuitemradio"][aria-label="Größe 1×1"]').click();
    await p.waitForTimeout(500);
    const lay3 = await layoutVon(p);
    const m4 = await rahmenMasse(p);
    ok("(G4) „Größe 1×1“ setzt zurück: wieder gleich breit und hoch wie die Nachbarn",
      lay3.kachelDef.heuteFaellig.breite === 1 && lay3.kachelDef.heuteFaellig.hoehe === 1 && Math.abs(m4[0].b - m4[1].b) <= 3 && Math.abs(m4[0].h - m4[1].h) <= 3, JSON.stringify(m4.slice(0, 2)));
    await menue.locator('[role="menuitemradio"][aria-label="Größe 4×2"]').click();
    await p.waitForTimeout(500);
    const lay4 = await layoutVon(p);
    ok("(G6) 4×2 ist die Obergrenze und wird angenommen", lay4.kachelDef.heuteFaellig.breite === 4 && lay4.kachelDef.heuteFaellig.hoehe === 2);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);

    /* (G5) Zahnrad-Tabelle für die Leser-Vorlage */
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Personalisieren", exact: true }).click();
    await p.waitForTimeout(300);
    const region = p.locator('[role="region"][aria-label="Kennzahlen-Kacheln"]');
    await region.locator('button[aria-label="Kacheln für Leser-Übersicht"]').click();
    await p.waitForTimeout(200);
    await region.locator('button[aria-label="Vorlage mit Standard anlegen"]').click();
    await p.waitForTimeout(600);
    ok("(G5) Die Tabelle hat eine Spalte „Größe“ mit Auswahl je Kachel", (await region.locator('select[aria-label="Größe Kachel 1 leser"]').count()) === 1 && (await region.locator('select[aria-label="Größe Kachel 1 leser"]').inputValue()) === "1x1");
    await region.locator('select[aria-label="Größe Kachel 1 leser"]').selectOption("3x1");
    await p.waitForTimeout(600);
    const v = await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"); return c.uebersichtVorlagen && c.uebersichtVorlagen.leser; });
    ok("(G5) Die Leser-Vorlage trägt 3×1 für Kachel 1", !!v && v.kachelDef[v.kacheln[0]].breite === 3 && v.kachelDef[v.kacheln[0]].hoehe === 1, JSON.stringify(v && v.kachelDef[v.kacheln[0]]));
    ok("(E) Keine Skriptfehler (Verwalter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  /* ================= Leser folgt der Vorlage ================= */
  {
    const { p, fehler, zu } = await seite("Lea", null);
    const huellen = await masse(p, "[data-kachel-huelle]");
    const spalte = huellen[1].b + (huellen[2].x - huellen[1].x - huellen[1].b);
    ok("(G5) Lea sieht Kachel 1 drei Spalten breit, die übrigen normal",
      huellen.length === 7 && Math.abs(huellen[0].b - (3 * spalte - (huellen[2].x - huellen[1].x - huellen[1].b))) <= 4 && Math.abs(huellen[1].b - huellen[2].b) <= 3, JSON.stringify(huellen.slice(0, 3).map((m) => m.b)));
    ok("(E) Keine Skriptfehler (Leser)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  /* ================= altes Layout ohne Größe ================= */
  {
    const { p, fehler, zu } = await seite("Chef", { bloecke: {}, reihenfolge: ["kennzahlen", "heuteDa", "stoerungen", "hauptzeile"], kacheln: ["zahlen", "quote", "oee", "uhr"], kachelDef: { quote: { inhalt: "tpmQuote", form: "halbkreis", zeitraum: "monat", breite: 9, hoehe: 0 } }, vorlage: "eigene" });
    const huellen = await masse(p, "[data-kachel-huelle]");
    // Der Speicher wird beim Lesen nicht umgeschrieben - was zählt, ist das
    // Bild: sechs gleich breite Kacheln, die Quote auf vier Spalten geklemmt.
    const normal = huellen.filter((m, i) => i !== 4);
    ok("(G6) Altes Layout ohne Größe: alles 1×1 und gleich breit; Unsinn (9×0) wird auf 4×1 geklemmt",
      huellen.length === 7 && new Set(normal.map((m) => m.b)).size === 1 && huellen[4].b > 3.6 * normal[0].b && huellen[4].b < 4.4 * normal[0].b && Math.abs(huellen[4].h - normal[0].h) <= 3, JSON.stringify(huellen.map((m) => m.b)));
    ok("(E) Keine Skriptfehler (altes Layout)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
