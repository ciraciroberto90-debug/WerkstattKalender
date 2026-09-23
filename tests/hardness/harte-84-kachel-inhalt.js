// Härtetest: KACHEL-INHALT WÄHLEN (Robertos Wahl vom 23.09.: K1 Dropdown +
// K4 fünf Darstellungen + K5 Tabelle im Zahnrad je Benutzergruppe)
//
//  (A1) Standard nach dem Umbau: sieben Kacheln (vier Zahlen, Quote, OEE, Uhr)
//       stehen da wie vorher; ein ALTES Layout mit "zahlen" liest sich weiter.
//  (A2) Anordnen-Modus: jede Kachel hat ein ▾; es öffnet EIN gruppiertes Menü
//       (Termine, Quoten, Störungen …) - nur eines offen.
//  (A3) Ein Klick auf "Offene Störungen" macht aus der Uhr-Kachel die
//       Störungs-Kachel, das Menü schließt, das Layout ist gespeichert.
//  (A4) Darstellung: PitStop-Quote als Zahl, Halbkreis, Verlauf, Ampel;
//       Ausfallzeit als Top 3 - jede Form zeichnet ihr eigenes Kennzeichen.
//  (A5) "+ Kachel hinzufügen" legt eine achte Kachel an, ✕ entfernt sie
//       wieder; ✕ an einer festen Kachel blendet sie aus (+-Chip holt sie).
//  (B1) Zahnrad-Tabelle: Reiter "Leser-Übersicht" - Vorlage mit Standard
//       anlegen, Kachel 1 auf "Offene Störungen" als Ampel stellen -> die
//       Vorlage steht in der gemeinsamen Einstellung (config.uebersichtVorlagen).
//  (B2) Ein LESER-Rechner ohne eigene Anordnung zeigt die Vorlage (Ampel als
//       erste Kachel); der Verwalter-Rechner behält seine eigene Anordnung.
//  (B3) Der Verwalter sieht über das Auge ("Ansicht als Leser") dieselbe
//       Leser-Vorlage.
//  (C)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor gibt es weder ▾ noch Tabelle (A2/B1 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-23";
const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }, { id: "a2", name: "KUKA I", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }],
};
const entries = [];
for (let m = 0; m < 6; m++) for (let i = 0; i < 6; i++) { const d = new Date(2026, 8 - m, 2 + i * 4); entries.push({ id: `t${m}-${i}`, date: d.toISOString().slice(0, 10), category: "TPM", name: i % 2 ? "KUKA I" : "TS480", status: (i + m) % 4 === 0 ? "open" : "done" }); }
const stoer = [0, 1, 2, 3].map((i) => ({ id: `s${i}`, nr: 400 + i, date: `2026-09-${String(20 - i * 3).padStart(2, "0")}`, schicht: "Früh", anlage: i % 2 ? "KUKA I" : "TS480", stoerung: "Störung " + i, offen: i < 2, ausfallzeit: 30 + i * 20, melder: "T. Balles", gemeldetAt: `2026-09-${String(20 - i * 3).padStart(2, "0")}T08:00:00.000Z` }));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  let konfig = JSON.stringify(config);
  const seite = async (benutzer, layout) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
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
    // Nur die Gruppen-Vorlagen in den nächsten Rechner mitnehmen: Der örtliche
    // Spiegel der Einstellungen trägt die Benutzerliste nicht (Wächter-Feld,
    // im Echtbetrieb kommt sie aus der gemeinsamen Datei) - hier ohne Datei.
    const zu = async () => {
      const v = await p.evaluate(() => (JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}").uebersichtVorlagen) || null);
      if (v) konfig = JSON.stringify({ ...JSON.parse(konfig), uebersichtVorlagen: v });
      await ctx.close();
    };
    return { p, fehler, zu };
  };
  const layoutVon = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout") || "null"));
  const anordnen = async (p) => {
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Personalisieren", exact: true }).click();
    await p.waitForTimeout(300);
    await p.locator('button[aria-label="Übersicht direkt anordnen"]').click();
    await p.waitForTimeout(500);
  };
  const kachelInhalte = (p) => p.locator('[data-anordnen="kennzahlen"] [data-anordnen]').evaluateAll((els) => els.map((e) => e.getAttribute("data-anordnen")));

  /* ================= Teil A: Verwalter mit ALTEM Layout ================= */
  {
    const { p, fehler, zu } = await seite("Chef", { bloecke: {}, reihenfolge: ["kennzahlen", "heuteDa", "stoerungen", "hauptzeile"], kacheln: ["uhr", "zahlen", "quote", "oee"], vorlage: "eigene" });
    const anzahl = await p.locator("[data-kachel-inhalt]").count();
    ok("(A1) Altes Layout mit „zahlen“: vier Zahlen-Kacheln + Quote zeichnen als Kennzahl-Kacheln (5), Uhr und OEE dazu",
      anzahl === 5 && (await p.getByText("Heute fällig", { exact: true }).count()) >= 1 && (await p.locator('[data-kachel-inhalt="tpmQuote"][data-kachel-form="halbkreis"]').count()) === 1, `Kennzahl-Kacheln ${anzahl}`);
    const lay0 = await layoutVon(p);
    ok("(A1) Uhr steht durch das alte Layout vorn", lay0.kacheln[0] === "uhr", lay0.kacheln.join(","));

    await anordnen(p);
    const reihe = await kachelInhalte(p);
    ok("(A2) Anordnen-Modus: sieben Kachel-Rahmen, Uhr zuerst, dann die vier Zahlen, Quote, OEE",
      reihe.join(",") === "uhr,heuteFaellig,heuteErledigt,ueberfaellig,terminePlan,quote,oee", reihe.join(","));
    const pfeile = await p.locator('[data-anordnen="kennzahlen"] button[aria-label^="Inhalt "][aria-label$=" wählen"]').count();
    ok("(A2) Jede Kachel hat ein ▾ (Inhalt wählen)", pfeile === 7, String(pfeile));
    await p.locator('button[aria-label="Inhalt Uhr & Schicht wählen"]').click();
    await p.waitForTimeout(250);
    const menue = p.locator('[role="menu"][aria-label="Kachel-Inhalt Uhr & Schicht"]');
    const menueText = await menue.innerText();
    ok("(A2) Das Menü ist gruppiert (Termine, Quoten, Störungen, To-dos & Team, Einkauf, Sonstiges) und nur EINS offen",
      (await menue.count()) === 1 && (await p.locator('[role="menu"]').count()) === 1 && /TERMINE/i.test(menueText) && /QUOTEN/i.test(menueText) && /STÖRUNGEN/i.test(menueText) && /EINKAUF/i.test(menueText));
    await p.locator('button[aria-label="Inhalt Heute fällig wählen"]').click();
    await p.waitForTimeout(250);
    ok("(A2) ▾ an einer anderen Kachel: das erste Menü schließt, das zweite öffnet",
      (await p.locator('[role="menu"]').count()) === 1 && (await p.locator('[role="menu"][aria-label="Kachel-Inhalt Heute fällig"]').count()) === 1);
    await p.locator('button[aria-label="Inhalt Heute fällig wählen"]').click(); // wieder zu
    await p.waitForTimeout(200);

    /* (A3) Uhr -> Offene Störungen */
    await p.locator('button[aria-label="Inhalt Uhr & Schicht wählen"]').click();
    await p.waitForTimeout(250);
    await menue.getByRole("menuitemradio", { name: "Offene Störungen", exact: true }).click();
    await p.waitForTimeout(400);
    const lay1 = await layoutVon(p);
    ok("(A3) Klick auf „Offene Störungen“: Menü zu, Kachel zeigt 2 offene, Layout gespeichert",
      (await p.locator('[role="menu"]').count()) === 0 && lay1.kachelDef.uhr.inhalt === "stoerOffen" &&
      (await p.locator('[data-anordnen="uhr"] [data-kachel-inhalt="stoerOffen"]').innerText()).includes("2"), JSON.stringify(lay1.kachelDef.uhr));

    /* (A4) Darstellungen an der Quote-Kachel */
    const quoteRahmen = p.locator('[data-anordnen="quote"]');
    await p.locator('button[aria-label="Inhalt TPM-Quote gesamt wählen"]').click();
    await p.waitForTimeout(250);
    await p.getByRole("menuitemradio", { name: /^PitStop-Quote/ }).click(); // Name trägt den Zeitraum-Hinweis mit
    await p.waitForTimeout(300);
    const formen = {};
    for (const [f, kennzeichen] of [["Zahl", () => quoteRahmen.locator('[data-kachel-form="zahl"]').count()], ["Halbkreis", () => quoteRahmen.locator("svg").count()], ["Verlauf", () => quoteRahmen.locator('[aria-label^="Verlauf "]').count()], ["Ampel", () => quoteRahmen.locator('[aria-label^="Ampel "]').count()]]) {
      await p.locator('button[aria-label="Inhalt PitStop-Quote wählen"]').click();
      await p.waitForTimeout(200);
      await p.getByRole("menuitemradio", { name: `Darstellung ${f}` }).click();
      await p.waitForTimeout(300);
      formen[f] = await kennzeichen();
      await p.locator('button[aria-label="Inhalt PitStop-Quote wählen"]').click(); // zu
      await p.waitForTimeout(150);
    }
    ok("(A4) PitStop-Quote als Zahl, Halbkreis, Verlauf und Ampel - jede Form zeichnet ihr Kennzeichen",
      formen.Zahl === 1 && formen.Halbkreis >= 1 && formen.Verlauf === 1 && formen.Ampel === 1, JSON.stringify(formen));
    const lay2 = await layoutVon(p);
    ok("(A4) Gespeichert: quote = PitStop-Quote als Ampel", lay2.kachelDef.quote.inhalt === "pitstopQuote" && lay2.kachelDef.quote.form === "ampel", JSON.stringify(lay2.kachelDef.quote));
    // Top 3 an der OEE-Kachel: Ausfallzeit, 30 Tage
    await p.locator('button[aria-label="Inhalt OEE (Excel) wählen"]').click();
    await p.waitForTimeout(200);
    await p.getByRole("menuitemradio", { name: /^Ausfallzeit/ }).click();
    await p.waitForTimeout(300);
    await p.locator('button[aria-label="Inhalt Ausfallzeit wählen"]').click();
    await p.waitForTimeout(200);
    await p.getByRole("menuitemradio", { name: "Darstellung Top 3" }).click();
    await p.getByRole("menuitemradio", { name: "Zeitraum 30 Tage" }).click();
    await p.waitForTimeout(300);
    await p.locator('button[aria-label="Inhalt Ausfallzeit wählen"]').click();
    await p.waitForTimeout(200);
    const top3 = await p.locator('[data-anordnen="oee"] [data-kachel-form="top3"]').innerText().catch(() => "");
    ok("(A4) Ausfallzeit als Top 3 über 30 Tage: TS480 und KUKA I mit Minuten", /Top 3/.test(top3) && /TS480/.test(top3) && /KUKA I/.test(top3) && /min/.test(top3), top3.replace(/\s+/g, " ").slice(0, 100));

    /* (A5) + Kachel und ✕ */
    await p.locator('button[aria-label="Kachel hinzufügen"]').click();
    await p.waitForTimeout(300);
    const nachPlus = await kachelInhalte(p);
    ok("(A5) „+ Kachel hinzufügen“ legt eine achte Kachel an (Offene Störungen)", nachPlus.length === 8 && /^k-/.test(nachPlus[7]), nachPlus.join(","));
    await p.locator(`[data-anordnen="${nachPlus[7]}"] button[aria-label$=" ausblenden"]`).click();
    await p.waitForTimeout(300);
    ok("(A5) ✕ an der eigenen Kachel entfernt sie wieder", (await kachelInhalte(p)).length === 7);
    await p.locator('[data-anordnen="heuteFaellig"] button[aria-label$=" ausblenden"]').click();
    await p.waitForTimeout(300);
    ok("(A5) ✕ an „Heute fällig“ blendet die vier Zahlen aus (Haken „Kennzahlen“), der +-Chip steht oben",
      (await kachelInhalte(p)).length === 3 && (await p.locator('button[aria-label="Kennzahlen einblenden"]').count()) === 1);
    await p.locator('button[aria-label="Kennzahlen einblenden"]').click();
    await p.waitForTimeout(300);
    ok("(A5) Der Chip holt sie zurück", (await kachelInhalte(p)).length === 7);
    ok("(C) Keine Skriptfehler (Verwalter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  /* ================= Teil B: Leser-Vorlage im Zahnrad ================= */
  {
    const { p, fehler, zu } = await seite("Chef", { bloecke: {}, reihenfolge: ["kennzahlen", "heuteDa", "stoerungen", "hauptzeile"], kacheln: ["uhr", "zahlen", "quote", "oee"], vorlage: "eigene" });
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Personalisieren", exact: true }).click();
    await p.waitForTimeout(300);
    const region = p.locator('[role="region"][aria-label="Kennzahlen-Kacheln"]');
    ok("(B1) Die Tabelle im Zahnrad hat die Reiter Dieser Rechner / Leser-Übersicht / Bearbeiter-Übersicht",
      (await region.locator('button[aria-label="Kacheln für Dieser Rechner"]').count()) === 1 && (await region.locator('button[aria-label="Kacheln für Leser-Übersicht"]').count()) === 1 && (await region.locator('button[aria-label="Kacheln für Bearbeiter-Übersicht"]').count()) === 1);
    ok("(B1) Reiter „Dieser Rechner“: sieben Zeilen, Zeile 1 = Uhr (aus dem alten Layout)",
      (await region.locator("tbody tr").count()) === 7 && (await region.locator('select[aria-label="Inhalt Kachel 1 rechner"]').inputValue()) === "uhr");
    await region.locator('button[aria-label="Kacheln für Leser-Übersicht"]').click();
    await p.waitForTimeout(200);
    ok("(B1) Leser-Übersicht: noch keine Vorlage, Angebot zum Anlegen", (await region.locator('button[aria-label="Vorlage mit Standard anlegen"]').count()) === 1);
    await region.locator('button[aria-label="Vorlage mit Standard anlegen"]').click();
    await p.waitForTimeout(600);
    await region.locator('select[aria-label="Inhalt Kachel 1 leser"]').selectOption("stoerOffen");
    await p.waitForTimeout(400);
    await region.locator('select[aria-label="Darstellung Kachel 1 leser"]').selectOption("ampel");
    await p.waitForTimeout(600);
    const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"));
    const v = cfg.uebersichtVorlagen && cfg.uebersichtVorlagen.leser;
    ok("(B1) Die Leser-Vorlage steht in der gemeinsamen Einstellung: Kachel 1 = Offene Störungen als Ampel",
      !!v && v.kachelDef[v.kacheln[0]].inhalt === "stoerOffen" && v.kachelDef[v.kacheln[0]].form === "ampel", JSON.stringify(v && v.kachelDef[v.kacheln[0]]));
    const eigenes = await layoutVon(p);
    // Der Rechner hat sein altes Layout nie angefasst - es liegt noch in der
    // alten Form (ohne kachelDef) im Speicher; nur die Vorlage wurde geschrieben.
    ok("(B1) Die eigene Anordnung des Verwalter-Rechners ist unverändert (Uhr vorn, kein Ampel-Umbau)",
      eigenes.kacheln[0] === "uhr" && (!eigenes.kachelDef || !Object.values(eigenes.kachelDef).some((d) => d.form === "ampel")), JSON.stringify(eigenes.kacheln));
    await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => p.keyboard.press("Escape"));
    await p.waitForTimeout(300);
    ok("(B2) Der Verwalter sieht auf seiner Übersicht weiter seine Anordnung (keine Ampel vorn)",
      (await p.locator('[data-kachel-form="ampel"]').count()) === 0);
    /* (B3) Auge: Ansicht als Leser -> Leser-Vorlage */
    await p.locator('button[aria-label="Ansicht wechseln"]').click();
    await p.waitForTimeout(200);
    await p.getByRole("menuitemradio", { name: /Leser/ }).click();
    await p.waitForTimeout(600);
    ok("(B3) In der Leser-Ansicht (Auge) zeigt der Verwalter die Leser-Vorlage: Ampel „Offene Störungen“ als erste Kachel",
      (await p.locator('[data-kachel-inhalt="stoerOffen"][data-kachel-form="ampel"]').count()) === 1);
    ok("(C) Keine Skriptfehler (Zahnrad)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  {
    const { p, fehler, zu } = await seite("Lea", null);
    const erste = await p.locator("[data-kachel-inhalt]").first().getAttribute("data-kachel-inhalt");
    ok("(B2) Leser-Rechner ohne eigene Anordnung folgt der Vorlage: erste Kachel = Offene Störungen als Ampel",
      erste === "stoerOffen" && (await p.locator('[data-kachel-inhalt="stoerOffen"][data-kachel-form="ampel"]').count()) === 1, String(erste));
    ok("(B2) Lea hat kein ▾ und keine Tabelle (nur Verwalter)", (await p.locator('button[aria-label^="Inhalt "][aria-label$=" wählen"]').count()) === 0);
    ok("(C) Keine Skriptfehler (Leser)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
