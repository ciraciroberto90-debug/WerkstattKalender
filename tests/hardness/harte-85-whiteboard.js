// Härtetest: WHITEBOARD-ÜBERSICHT (Robertos Tafel vom 23.09., Vorlage U1)
//
//  (A1) Vorlage "Whiteboard" (⚙ Personalisieren) legt fünf Kacheln an:
//       To-dos Soll/Ist, TPM-Effizienz, Unfälle, Backlog live, Kosten - als
//       Halbkreis bzw. Zahl; die alten sieben sind ausgeblendet.
//  (A2) Die Kacheln rechnen richtig: To-dos Soll 3 · Ist 2 (67 %), TPM Soll/
//       Ist aus den Terminen, Unfälle 1 mit Tagen unfallfrei, Backlog Erledigt/
//       Gesamt, Kosten ohne Budget = "Abstimmung Einkauf".
//  (A3) Whiteboard-Zeile: Tagesliste allein in der Hauptzeile, unten die
//       Zeile mit Pinnwand · Technischer Einkauf · Heute da; kein eigener
//       "Heute da"-Abschnitt mehr darüber.
//  (A4) Der Einkauf zählt aus den Störberichten: 1 Bedarf, 2 bestellt,
//       1 davon länger als 7 Tage, 1 eingetroffen.
//  (B1) ⚙ Regeln & Listen: Unfall eintragen + Budget setzen -> in der
//       gemeinsamen Einstellung; die Kosten-Kachel zeigt danach 61 %.
//  (C1) Gruppen-Vorlage: "Whiteboard anlegen" für Leser -> ein Leser-Rechner
//       ohne eigene Anordnung zeigt die fünf Kacheln und die untere Zeile.
//  (D1) Bestandsschutz: ein altes Layout ohne "einkauf"/"zeileUnten" zeigt
//       weder Einkauf-Kachel noch untere Zeile - nichts verändert sich.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor gibt es keine Vorlage "Whiteboard", keine
// Kennzahlen todoSollIst/unfaelle/backlogLive/kosten und keine untere Zeile.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-23";
const tag = (n) => { const d = new Date(HEUTE + "T12:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }, { id: "a2", name: "KUKA I", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Lea", rolle: "leser", kennwortHash: "" }],
  regeln: { sicherheit: { unfaelle: [{ datum: "2026-05-03", text: "Schnitt" }] } },
};
const entries = [
  // TPM im September: 4 Termine, 3 erledigt -> Soll 4 · Ist 3 (75 %)
  { id: "t1", date: "2026-09-02", category: "TPM", name: "TS480", status: "done" },
  { id: "t2", date: "2026-09-09", category: "TPM", name: "KUKA I", status: "done" },
  { id: "t3", date: "2026-09-16", category: "TPM", name: "TS480", status: "done" },
  { id: "t4", date: "2026-09-21", category: "TPM", name: "KUKA I", status: "open" },
  // To-dos mit Frist im September: 3, davon 2 erledigt -> Soll 3 · Ist 2 (67 %); eins ohne Frist zählt nicht
  { id: "d1", date: "2026-09-01", category: "TODO", name: "Filter", wer: "T. Balles", bis: "2026-09-10", status: "done", erledigtAm: "2026-09-09T10:00:00.000Z" },
  { id: "d2", date: "2026-09-01", category: "TODO", name: "Riemen", wer: "T. Balles", bis: "2026-09-15", status: "done", erledigtAm: "2026-09-14T10:00:00.000Z" },
  { id: "d3", date: "2026-09-01", category: "TODO", name: "Öl", wer: "T. Balles", bis: "2026-09-30", status: "offen" },
  { id: "d4", date: "2026-09-01", category: "TODO", name: "ohne Frist", wer: "T. Balles", bis: "", status: "offen" },
  // Backlog 2026: 5 aufgenommen, 2 offen -> Erledigt 3 · Gesamt 5 (60 %)
  ...[0, 1, 2, 3, 4].map((i) => ({ id: `a${i}`, date: `2026-0${3 + i}-10`, category: "ARBEIT", name: "TS480", note: "Arbeit " + i, status: i < 2 ? "open" : "done", erledigtAm: i < 2 ? "" : `2026-0${4 + i}-01`, prio: "ohne", art: "mech" })),
  { id: "z1", date: tag(1), category: "NOTIZ", name: "RC", status: "open", note: "Sprinkler-Prüfung Montag 07:00", zeit: tag(1) + "T08:00:00.000Z", farbe: "rosa", sichtbar: "alle", veroeffentlicht: true },
];
// Einkauf aus Störberichten: s1 Bedarf (Teil, offen, nicht bestellt), s2+s3 bestellt (s3 seit 12 Tagen), s4 eingetroffen vor 3 Tagen
const stoer = [
  { id: "s1", nr: 401, date: tag(1), schicht: "Früh", anlage: "TS480", stoerung: "Endschalter", offen: true, ausfallzeit: 20, melder: "T. Balles", gemeldetAt: tag(1) + "T08:00:00.000Z", ersatzteile: "Endschalter XS", nachbestellt: false },
  { id: "s2", nr: 402, date: tag(2), schicht: "Früh", anlage: "KUKA I", stoerung: "Sensor", offen: false, ausfallzeit: 30, melder: "T. Balles", gemeldetAt: tag(2) + "T08:00:00.000Z", ersatzteile: "Sensor", nachbestellt: true },
  { id: "s3", nr: 403, date: tag(12), schicht: "Früh", anlage: "TS480", stoerung: "Ventil", offen: false, ausfallzeit: 30, melder: "T. Balles", gemeldetAt: tag(12) + "T08:00:00.000Z", ersatzteile: "Ventil", nachbestellt: true },
  { id: "s4", nr: 404, date: tag(20), schicht: "Früh", anlage: "TS480", stoerung: "Lager", offen: false, ausfallzeit: 30, melder: "T. Balles", gemeldetAt: tag(20) + "T08:00:00.000Z", ersatzteile: "Lager", nachbestellt: true, eingetroffenAt: tag(3) + "T10:00:00.000Z" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  let konfig = JSON.stringify(config);
  // Der örtliche Spiegel der Einstellungen führt "regeln" nur mit, wenn das
  // Regeln-Speichern selbst schrieb (Wächter-Feld wie die Benutzerliste; in der
  // gemeinsamen Datei bleibt das Feld beim Zusammenführen erhalten). Deshalb
  // merkt sich der Test den gespeicherten Stand nach (B1) und reicht ihn weiter.
  let regelnMerker = null;
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
    // Nur Vorlagen und Regeln in den nächsten Rechner mitnehmen (wie harte-84:
    // der örtliche Spiegel trägt die Benutzerliste nicht).
    const zu = async () => {
      const v = await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"); return { uebersichtVorlagen: c.uebersichtVorlagen || null, regeln: c.regeln || null }; });
      const alt = JSON.parse(konfig);
      if (v.uebersichtVorlagen) alt.uebersichtVorlagen = v.uebersichtVorlagen;
      if (regelnMerker) alt.regeln = regelnMerker; else if (v.regeln) alt.regeln = v.regeln;
      konfig = JSON.stringify(alt);
      await ctx.close();
    };
    return { p, fehler, zu };
  };
  const kachelText = (p, inhalt) => p.locator(`[data-kachel-inhalt="${inhalt}"]`).first().innerText().catch(() => "");
  const zahnradZu = async (p) => { await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => p.keyboard.press("Escape")); await p.waitForTimeout(300); };
  const kacheln = (p) => p.locator("[data-kachel-inhalt]").evaluateAll((els) => els.map((e) => e.getAttribute("data-kachel-inhalt") + ":" + e.getAttribute("data-kachel-form")));

  /* ================= Teil A: Whiteboard auf dem Verwalter-Rechner ================= */
  {
    const { p, fehler, zu } = await seite("Chef", null);
    const vorher = await kacheln(p);
    ok("(A1) Standard vor dem Umschalten: sieben Kacheln, keine Whiteboard-Kachel, keine untere Zeile",
      vorher.length === 5 && !vorher.some((k) => /todoSollIst|unfaelle|backlogLive|kosten/.test(k)) && (await p.locator('[data-zeile="unten"]').count()) === 0, vorher.join(","));
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Personalisieren", exact: true }).click();
    await p.waitForTimeout(300);
    ok("(A1) Die Layout-Vorlagen kennen „Whiteboard“", (await p.locator('button[aria-label="Vorlage Whiteboard"]').count()) === 1);
    await p.locator('button[aria-label="Vorlage Whiteboard"]').click();
    await p.waitForTimeout(300);
    ok("(A1) Das Häkchen „Whiteboard-Zeile“ ist durch die Vorlage gesetzt", await p.locator('input[aria-label="Übersicht: Whiteboard-Zeile"]').isChecked());
    await zahnradZu(p);
    await p.waitForTimeout(1700); // Halbkreise laufen 1,4 s ein - erst dann sind die Prozente endgültig
    const lay = await p.evaluate(() => JSON.parse(localStorage.getItem("wk-uebersicht-layout") || "null"));
    ok("(A1) Layout gespeichert: Vorlage whiteboard, zeileUnten, Einkauf an, fünf Whiteboard-Kacheln vorn",
      lay && lay.vorlage === "whiteboard" && lay.zeileUnten === true && lay.bloecke.einkauf === true && lay.kacheln.slice(0, 5).join(",") === "k-wbtodo,k-wbtpm,k-wbunfall,k-wbbacklog,k-wbkosten", JSON.stringify(lay && lay.kacheln));
    const reihe = await kacheln(p);
    ok("(A1) Die Reihe zeigt genau die fünf Kacheln: To-dos, TPM, Unfälle (Zahl), Backlog, Kosten - alle anderen ausgeblendet",
      reihe.join(",") === "todoSollIst:halbkreis,tpmQuote:halbkreis,unfaelle:zahl,backlogLive:halbkreis,kosten:halbkreis", reihe.join(","));

    const todo = await kachelText(p, "todoSollIst");
    ok("(A2) To-dos Soll 3 · Ist 2 -> 67 % (ohne Frist zählt nicht)", /Soll 3 · Ist 2/.test(todo) && /67\s*%/.test(todo), todo.replace(/\n/g, " | "));
    const tpm = await kachelText(p, "tpmQuote");
    ok("(A2) TPM-Effizienz · Sep: Soll 4 · Ist 3 -> 75 %", /TPM-Effizienz · Sep/i.test(tpm) && /Soll 4 · Ist 3/.test(tpm) && /75\s*%/.test(tpm), tpm.replace(/\n/g, " | "));
    const unf = await kachelText(p, "unfaelle");
    ok("(A2) Unfälle · 2026: 1, seit dem 03.05. 143 Tage unfallfrei", /Unfälle · 2026/i.test(unf) && /\n1\n/.test("\n" + unf.replace(/\s+\n/g, "\n") + "\n") && /143 Tage unfallfrei/.test(unf), unf.replace(/\n/g, " | "));
    const bl = await kachelText(p, "backlogLive");
    ok("(A2) Backlog live: Erledigt 3 · Gesamt 5 -> 60 %", /Erledigt 3 · Gesamt 5/.test(bl) && /60\s*%/.test(bl), bl.replace(/\n/g, " | "));
    const ko = await kachelText(p, "kosten");
    ok("(A2) Kosten ohne Budget: Bogen leer, „Abstimmung Einkauf“", /Abstimmung Einkauf/.test(ko) && /–/.test(ko), ko.replace(/\n/g, " | "));

    const hauptzeileHatPinnwand = await p.locator('input[aria-label="Pinnwand durchsuchen"]').evaluate((el) => !!el.closest('[data-zeile="unten"]'));
    ok("(A3) Untere Zeile da, Pinnwand steht darin (nicht neben der Tagesliste)", (await p.locator('[data-zeile="unten"]').count()) === 1 && hauptzeileHatPinnwand);
    const untenTeile = await p.locator('[data-zeile="unten"] [data-unten]').evaluateAll((els) => els.map((e) => e.getAttribute("data-unten")));
    ok("(A3) Reihenfolge unten: Pinnwand · Einkauf · Heute da", untenTeile.join(",") === "pinnwand,einkauf,heuteDa", untenTeile.join(","));
    ok("(A3) „Heute da“ gibt es nur einmal (unten), nicht mehr als eigener Abschnitt", (await p.getByText("👷 Heute da").count()) === 1 && (await p.locator('[data-unten="heuteDa"]').count()) === 1);
    const eink = await p.locator('[role="region"][aria-label="Technischer Einkauf"]').innerText();
    // Zahl = die nächste rein numerische Zeile nach der Beschriftung (dazwischen darf ein Hinweis stehen)
    const zeilen = eink.split("\n").map((z) => z.trim());
    const zahlNach = (t) => { const i = zeilen.findIndex((z) => z.startsWith(t)); const n = zeilen.slice(i + 1).find((z) => /^\d+$/.test(z)); return i >= 0 && n !== undefined ? Number(n) : -1; };
    ok("(A4) Einkauf: 1 Bedarf, 2 bestellt, 1 länger als 7 Tage, 1 eingetroffen",
      zahlNach("Bedarf gemeldet") === 1 && zahlNach("Bestellt, unterwegs") === 2 && zahlNach("Davon länger als 7 Tage") === 1 && zahlNach("Eingetroffen · 30 Tage") === 1, eink.replace(/\n/g, " | "));

    /* (B1) Regeln: Unfall dazu, Budget setzen */
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Regeln & Listen", exact: true }).click();
    await p.waitForTimeout(300);
    ok("(B1) Regeln & Listen zeigt den erfassten Unfall (03.05.) und die Kosten-Felder",
      (await p.locator('input[aria-label="Unfall 1 Datum"]').inputValue()) === "2026-05-03" && (await p.locator('input[aria-label="Jahresbudget"]').count()) === 1);
    await p.locator('button[aria-label="Unfall hinzufügen"]').click();
    await p.locator('input[aria-label="Unfall 2 Datum"]').fill("2026-09-20");
    await p.locator('input[aria-label="Unfall 2 Text"]').fill("Sturz");
    await p.locator('input[aria-label="Jahresbudget"]').fill("20000");
    await p.locator('input[aria-label="Bisher ausgegeben"]').fill("12200");
    await p.locator('input[aria-label="Kosten Stand"]').fill(HEUTE);
    await p.getByRole("button", { name: "Speichern", exact: true }).first().click();
    await p.waitForTimeout(900);
    await zahnradZu(p).catch(() => {});
    await p.waitForTimeout(1700);
    const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"));
    const r = cfg.regeln || {};
    regelnMerker = cfg.regeln || null;
    ok("(B1) Gemeinsame Einstellung: zwei Unfälle (sortiert), Budget 20000, ausgegeben 12200, Stand heute",
      r.sicherheit && r.sicherheit.unfaelle.length === 2 && r.sicherheit.unfaelle[1].datum === "2026-09-20" && r.kosten && r.kosten.budgetJahr === 20000 && r.kosten.ausgegeben === 12200 && r.kosten.stand === HEUTE, JSON.stringify(r.kosten));
    const unf2 = await kachelText(p, "unfaelle");
    const ko2 = await kachelText(p, "kosten");
    ok("(B1) Die Kacheln folgen sofort: Unfälle 2 · 3 Tage unfallfrei; Kosten 61 % · 12.200 € von 20.000 €",
      /\n2\n/.test("\n" + unf2 + "\n") && /3 Tage unfallfrei/.test(unf2) && /61\s*%/.test(ko2) && /12\.200 € von 20\.000 €/.test(ko2), (unf2 + " || " + ko2).replace(/\n/g, " | "));

    /* (C1) Gruppen-Vorlage Leser = Whiteboard */
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Personalisieren", exact: true }).click();
    await p.waitForTimeout(300);
    const region = p.locator('[role="region"][aria-label="Kennzahlen-Kacheln"]');
    await region.locator('button[aria-label="Kacheln für Leser-Übersicht"]').click();
    await p.waitForTimeout(200);
    ok("(C1) Leser-Übersicht ohne Vorlage bietet „Whiteboard anlegen“", (await region.locator('button[aria-label="Vorlage Whiteboard anlegen"]').count()) === 1);
    await region.locator('button[aria-label="Vorlage Whiteboard anlegen"]').click();
    await p.waitForTimeout(700);
    const v = await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"); return c.uebersichtVorlagen && c.uebersichtVorlagen.leser; });
    ok("(C1) Die Leser-Vorlage ist das Whiteboard (zeileUnten, Einkauf, fünf Kacheln)",
      !!v && v.zeileUnten === true && v.bloecke.einkauf === true && v.kacheln.slice(0, 5).join(",") === "k-wbtodo,k-wbtpm,k-wbunfall,k-wbbacklog,k-wbkosten", JSON.stringify(v && v.kacheln));
    ok("(C1) Mit Vorlage gibt es „Auf Whiteboard setzen“ in der Fußzeile", (await region.locator('button[aria-label="Vorlage leser auf Whiteboard setzen"]').count()) === 1);
    ok("(E) Keine Skriptfehler (Verwalter)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  /* ================= Teil C: Leser-Rechner folgt der Whiteboard-Vorlage ================= */
  {
    const { p, fehler, zu } = await seite("Lea", null);
    await p.waitForTimeout(1700);
    const reihe = await kacheln(p);
    ok("(C1) Lea ohne eigene Anordnung sieht die fünf Whiteboard-Kacheln",
      reihe.join(",") === "todoSollIst:halbkreis,tpmQuote:halbkreis,unfaelle:zahl,backlogLive:halbkreis,kosten:halbkreis", reihe.join(","));
    const untenTeile = await p.locator('[data-zeile="unten"] [data-unten]').evaluateAll((els) => els.map((e) => e.getAttribute("data-unten")));
    ok("(C1) … und die untere Zeile mit Pinnwand · Einkauf · Heute da", untenTeile.join(",") === "pinnwand,einkauf,heuteDa", untenTeile.join(","));
    const ko = await kachelText(p, "kosten");
    ok("(C1) Die Kosten-Kachel liest Budget und Ausgaben aus der gemeinsamen Einstellung (61 %)", /61\s*%/.test(ko), ko.replace(/\n/g, " | "));
    ok("(E) Keine Skriptfehler (Leser)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  /* ================= Teil D: altes Layout bleibt, wie es war ================= */
  {
    const { p, fehler, zu } = await seite("Chef", { bloecke: {}, reihenfolge: ["kennzahlen", "heuteDa", "stoerungen", "hauptzeile"], kacheln: ["zahlen", "quote", "oee", "uhr"], vorlage: "eigene" });
    await p.waitForTimeout(1700);
    const reihe = await kacheln(p);
    ok("(D1) Altes Layout: die fünf bekannten Kennzahl-Kacheln, kein Einkauf, keine untere Zeile, Pinnwand neben der Tagesliste",
      reihe.length === 5 && !reihe.some((k) => /todoSollIst|unfaelle|backlogLive|kosten/.test(k)) && (await p.locator('[data-zeile="unten"]').count()) === 0
      && (await p.locator('[role="region"][aria-label="Technischer Einkauf"]').count()) === 0 && (await p.locator('input[aria-label="Pinnwand durchsuchen"]').count()) === 1, reihe.join(","));
    ok("(D1) TPM-Kachel im alten Layout zeigt Soll/Ist unter dem Bogen (Soll 4 · Ist 3)", /Soll 4 · Ist 3/.test(await kachelText(p, "tpmQuote")));
    ok("(E) Keine Skriptfehler (altes Layout)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
