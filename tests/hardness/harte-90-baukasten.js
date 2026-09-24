// Härtetest: BAUKASTEN, STUFE 1 (Robertos Richtung vom 24.09.: "jeder Bereich
// oder Kachel personalisierbar wie in einem Baukasten" - Kennzahlen als Block)
//
//  (B1) Bestandsschutz: ein altes Layout ohne "bausteine" wird übersetzt -
//       Standard = Kennzahlen 12 · Heute da 12 · Störungen 12 · Tagesliste 6 ·
//       Pinnwand 6; "tausch" dreht Pinnwand vor die Tagesliste; die alte
//       Whiteboard-Zeile wird zu Pinnwand 4 · Einkauf 4 · Heute da 4.
//  (B2) Gezeichnet wird ein 12er-Raster: Tagesliste und Pinnwand nebeneinander,
//       je halbe Breite; die abgeleitete Abschnitts-Folge bleibt für ältere
//       Programmstände lesbar.
//  (B3) Anordnen-Modus: jeder Bereich hat Zieh-Ecke, Pfeile ◀ ▶ und ▾. Ecke der
//       Tagesliste um drei Spalten ziehen -> breite 9, die Pinnwand rutscht
//       in die nächste Zeile (kein Platz mehr daneben).
//  (B4) ▾ am Bereich: Chips "Breite 3 … 12 Spalten"; "Breite 12" macht die
//       Tagesliste ganz breit; ◀ an der Pinnwand schiebt sie vor die Tagesliste.
//  (B5) Zahnrad: Liste "Bausteine" mit Breite-Auswahl und ▲▼ - die Leser-
//       Vorlage übernimmt Reihenfolge und Breite, ein Leser-Rechner zeichnet sie.
//  (B6) Schmaler Bildschirm (800 px): alle Bausteine untereinander, volle Breite.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor gibt es weder "bausteine" im Layout noch
// Zieh-Ecken an Bereichen (B1/B3 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-24";
const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }],
};
const entries = [
  { id: "t1", date: HEUTE, category: "TPM", name: "TS480", status: "open" },
  { id: "z1", date: HEUTE, category: "NOTIZ", name: "RC", status: "open", note: "Zettel für alle", zeit: HEUTE + "T08:00:00.000Z", farbe: "gelb", sichtbar: "alle", veroeffentlicht: true },
];
const stoer = [{ id: "s1", nr: 401, date: HEUTE, schicht: "Früh", anlage: "TS480", stoerung: "Testlauf", offen: true, ausfallzeit: 20, melder: "T. Balles", gemeldetAt: HEUTE + "T07:00:00.000Z" }];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  let konfig = JSON.stringify(config);
  const seite = async (benutzer, layout, breite = 1600) => {
    const ctx = await browser.newContext({ viewport: { width: breite, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
    await p.addInitScript(({ c, e, s, benutzer, layout }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", c);
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
      localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
      if (layout) localStorage.setItem("wk-uebersicht-layout", JSON.stringify(layout));
    }, { c: konfig, e: entries, s: stoer, benutzer, layout });
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
  const bs = (l) => l.bausteine.map((b) => `${b.id}:${b.breite}`).join(",");
  const dom = (p) => p.locator("[data-baukasten] > [data-baustein], [data-baukasten] > [data-anordnen]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute("data-baustein") || e.getAttribute("data-anordnen"), x: Math.round(r.left), y: Math.round(r.top), b: Math.round(r.width) }; }));
  const alt = (extra) => ({ bloecke: {}, reihenfolge: ["kennzahlen", "heuteDa", "stoerungen", "hauptzeile"], kacheln: ["zahlen", "quote", "oee", "uhr"], vorlage: "eigene", ...extra });

  /* ================= (B1/B2) Übersetzung alter Layouts ================= */
  {
    const { p, fehler, zu } = await seite("Chef", alt({}));
    await p.waitForTimeout(400);
    const d = await dom(p);
    const tl = d.find((x) => x.id === "tagesliste"), pw = d.find((x) => x.id === "pinnwand");
    ok("(B2) Standard-Layout: Kennzahlen, Heute da, Störungen, dann Tagesliste und Pinnwand nebeneinander, je halbe Breite",
      d.map((x) => x.id).join(",") === "kennzahlen,heuteDa,stoerungen,tagesliste,pinnwand" && tl && pw && tl.y === pw.y && Math.abs(tl.b - pw.b) <= 2 && pw.x > tl.x, JSON.stringify(d));
    // Ein Klick im Anordnen-Modus schreibt das Layout - dann ist die Übersetzung im Speicher sichtbar
    await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Personalisieren", exact: true }).click(); await p.waitForTimeout(300);
    ok("(B5) Zahnrad: Liste „Bausteine“ mit Breite je Baustein, Tagesliste steht auf 6 / 12",
      (await p.locator('[role="list"][aria-label="Bausteine"] [role="listitem"]').count()) === 6 && (await p.locator('select[aria-label="Breite Tagesliste"]').inputValue()) === "6");
    await p.locator('button[aria-label="Übersicht direkt anordnen"]').click(); await p.waitForTimeout(600);
    // Der Speicher wird beim Lesen nicht umgeschrieben - erst die erste Änderung
    // (hier: Tagesliste hin und zurück) legt die übersetzten Bausteine ab.
    ok("(B1) Vor der ersten Änderung liegt das alte Layout unverändert im Speicher", !(await layoutVon(p)).bausteine);
    await p.locator('button[aria-label="Tagesliste nach hinten"]').click(); await p.waitForTimeout(300);
    await p.locator('button[aria-label="Tagesliste nach vorn"]').click(); await p.waitForTimeout(300);
    const lay1 = await layoutVon(p);
    ok("(B1) Übersetzt: kennzahlen 12 · heuteDa 12 · stoerungen 12 · tagesliste 6 · pinnwand 6 · einkauf 12 (aus), Abschnitts-Folge bleibt lesbar",
      !!lay1.bausteine && bs(lay1) === "kennzahlen:12,heuteDa:12,stoerungen:12,tagesliste:6,pinnwand:6,einkauf:12" && lay1.reihenfolge.join(",") === "kennzahlen,heuteDa,stoerungen,hauptzeile,unten", lay1.bausteine ? bs(lay1) : "keine Bausteine");

    /* (B3) Ecke ziehen */
    const griffe = await p.locator("[data-groesse-griff]").evaluateAll((els) => els.map((e) => e.getAttribute("data-groesse-griff")));
    ok("(B3) Jeder Bereich hat eine Zieh-Ecke (Kennzahlen, Heute da, Störungen, Tagesliste, Pinnwand)",
      ["kennzahlen", "heuteDa", "stoerungen", "tagesliste", "pinnwand"].every((k) => griffe.includes(k)), griffe.join(","));
    const vor = await dom(p);
    const spalte = (await p.locator("[data-baukasten]").evaluate((el) => el.getBoundingClientRect().width + 16)) / 12;
    const g = await p.locator('[data-groesse-griff="tagesliste"]').boundingBox();
    await p.mouse.move(g.x + g.width - 4, g.y + g.height - 4);
    await p.mouse.down();
    for (let i = 1; i <= 6; i++) { await p.mouse.move(g.x + g.width - 4 + (3 * spalte * i) / 6, g.y + g.height - 4); await p.waitForTimeout(40); }
    await p.mouse.up();
    await p.waitForTimeout(500);
    const lay2 = await layoutVon(p);
    const nach = await dom(p);
    const tl2 = nach.find((x) => x.id === "tagesliste"), pw2 = nach.find((x) => x.id === "pinnwand");
    ok("(B3) Ecke der Tagesliste um drei Spalten gezogen: breite 9, die Pinnwand rutscht in die nächste Zeile",
      lay2.bausteine.find((b) => b.id === "tagesliste").breite === 9 && pw2.y > tl2.y && tl2.b > vor.find((x) => x.id === "tagesliste").b * 1.4, `breite=${lay2.bausteine.find((b) => b.id === "tagesliste").breite} tl.y=${tl2.y} pw.y=${pw2.y}`);

    /* (B4) ▾ und ◀ */
    await p.locator('button[aria-label="Breite Tagesliste wählen"]').click(); await p.waitForTimeout(250);
    const menue = p.locator('[role="menu"][aria-label="Baustein Tagesliste"]');
    ok("(B4) ▾ am Bereich öffnet die Breiten-Chips 3 · 4 · 6 · 8 · 9 · 12, 9 ist markiert",
      (await menue.locator('[role="menuitemradio"]').count()) === 6 && (await menue.locator('[role="menuitemradio"][aria-label="Breite 9 Spalten"]').getAttribute("aria-checked")) === "true");
    await menue.locator('[role="menuitemradio"][aria-label="Breite 12 Spalten"]').click(); await p.waitForTimeout(400);
    const tl3 = (await dom(p)).find((x) => x.id === "tagesliste");
    ok("(B4) „Breite 12“: die Tagesliste füllt die ganze Zeile", (await layoutVon(p)).bausteine.find((b) => b.id === "tagesliste").breite === 12 && tl3.b > spalte * 11.5, String(tl3.b));
    await p.locator('button[aria-label="Pinnwand nach vorn"]').click(); await p.waitForTimeout(400);
    const d4 = await dom(p);
    ok("(B4) ◀ an der Pinnwand: sie steht jetzt vor der Tagesliste", d4.findIndex((x) => x.id === "pinnwand") < d4.findIndex((x) => x.id === "tagesliste"), d4.map((x) => x.id).join(","));
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);

    /* (B5) Leser-Vorlage mit Breiten */
    await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Personalisieren", exact: true }).click(); await p.waitForTimeout(300);
    const region = p.locator('[role="region"][aria-label="Kennzahlen-Kacheln"]');
    await region.locator('button[aria-label="Kacheln für Leser-Übersicht"]').click(); await p.waitForTimeout(200);
    await region.locator('button[aria-label="Vorlage aus diesem Rechner anlegen"]').click(); await p.waitForTimeout(700);
    const v = await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"); return c.uebersichtVorlagen && c.uebersichtVorlagen.leser; });
    ok("(B5) Die Leser-Vorlage trägt die Bausteine dieses Rechners (Pinnwand 6 vor Tagesliste 12)",
      !!v && bs(v).includes("pinnwand:6,tagesliste:12"), v && bs(v));
    ok("(E) Keine Skriptfehler (Verwalter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  /* ================= (B1) tausch und Whiteboard-Zeile übersetzen ================= */
  {
    const { p, fehler, zu } = await seite("Chef", alt({ tausch: true }));
    const d = await dom(p);
    ok("(B1) Altes „tausch“: Pinnwand links, Tagesliste rechts, beide halbe Breite",
      d.findIndex((x) => x.id === "pinnwand") === d.findIndex((x) => x.id === "tagesliste") - 1 && d.find((x) => x.id === "pinnwand").x < d.find((x) => x.id === "tagesliste").x, d.map((x) => x.id).join(","));
    await zu();
    const w = await seite("Chef", { bloecke: { einkauf: true }, reihenfolge: ["kennzahlen", "hauptzeile", "stoerungen", "unten", "heuteDa"], zeileUnten: true, kacheln: ["zahlen", "quote", "oee", "uhr"], vorlage: "eigene" });
    const d2 = await dom(w.p);
    const y = ["pinnwand", "einkauf", "heuteDa"].map((k) => d2.find((x) => x.id === k));
    ok("(B1) Alte Whiteboard-Zeile: Tagesliste ganz breit, darunter Pinnwand · Einkauf · Heute da nebeneinander (je 4 Spalten)",
      d2.map((x) => x.id).join(",") === "kennzahlen,tagesliste,stoerungen,pinnwand,einkauf,heuteDa" && y.every((m) => m && m.y === y[0].y) && Math.abs(y[0].b - y[2].b) <= 2, d2.map((x) => x.id).join(","));
    ok("(E) Keine Skriptfehler (Übersetzung)", fehler.length === 0 && w.fehler.length === 0);
    await w.zu();
  }

  /* ================= (B5) Leser folgt, (B6) schmal ================= */
  {
    const { p, fehler, zu } = await seite("Lea", null);
    const d = await dom(p);
    ok("(B5) Lea ohne eigene Anordnung zeichnet die Vorlage: Pinnwand vor der breiten Tagesliste",
      d.findIndex((x) => x.id === "pinnwand") < d.findIndex((x) => x.id === "tagesliste") && d.find((x) => x.id === "tagesliste").b > d.find((x) => x.id === "pinnwand").b * 1.5, d.map((x) => `${x.id}:${x.b}`).join(","));
    ok("(E) Keine Skriptfehler (Leser)", fehler.length === 0);
    await zu();
    const s = await seite("Chef", alt({}), 800);
    const d2 = await dom(s.p);
    const raster = await s.p.locator("[data-baukasten]").evaluate((el) => el.getBoundingClientRect().width);
    ok("(B6) Auf 800 px Breite stehen alle Bausteine untereinander in voller Breite", d2.length >= 5 && d2.every((x) => Math.abs(x.b - raster) <= 2) && new Set(d2.map((x) => x.y)).size === d2.length, d2.map((x) => `${x.id}:${x.b}`).join(","));
    await s.zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
