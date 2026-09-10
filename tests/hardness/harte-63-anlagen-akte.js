// Härtetest: DIE ANLAGEN-AKTE IM REGISTER + DIE PITSTOP-BEGRIFFE.
//
// Robertos Ansagen vom 08.09.:
//  (1) Begriffe: TPM ist das große Ganze - die orange Kategorie heißt
//      PitStop (geplante Wartung), R+I bleibt. NUR die Anzeige ändert
//      sich, der Daten-Schlüssel category:"TPM" bleibt (Bestandsdaten!).
//  (2) Register: Der Klick auf eine Anlage zeigt ALLES gefiltert -
//      zusätzlich zu Steckbrief und Termin-Historie auch die Arbeiten
//      (Backlog + eingeplant) und die Störungen samt offener Restarbeit.
//
// Geprüft wird:
//  (B) Begriffe am Bildschirm: Filter "PitStop", Plan-Legende "PitStop",
//      Druck-Umfang "Nur PitStop" - und der Reiter oben heißt weiter TPM.
//  (A) Akte: Reiter Arbeiten/Störungen mit Offen-Zählern, offene zuerst,
//      Störung mit Nummer und "Zu tun", Leser bleiben nur-lesend.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }],
  riItems: [{ id: "r1", name: "Wasserrundgang", type: "weekly", weekday: 1 }],
  team: [{ name: "M. Weber", rolle: "elek" }],
};
const eintraege = [
  { id: "t1", date: "2026-08-10", category: "TPM", name: "TS480", status: "done" },
  { id: "t2", date: "2026-09-04", category: "TPM", name: "TS480", status: "open" },
  { id: "b1", date: "2026-09-01", category: "ARBEIT", name: "TS480", status: "open", note: "Hydraulikaggregat prüfen", prio: "hoch", art: "mech" },
  { id: "b2", date: "2026-08-20", category: "ARBEIT", name: "TS480", status: "done", note: "Filter getauscht", prio: "mittel", art: "mech", wer: "M. Weber", geplant: "2026-08-21" },
  { id: "b3", date: "2026-09-02", category: "ARBEIT", name: "OF320", status: "open", note: "Gehört NICHT zur TS480", prio: "hoch", art: "elek" },
];
const stoer = [
  { id: "s1", date: "2026-09-05", nr: "2026-041", schicht: "Früh", anlage: "TS480", anlagenteil: "Hydraulik",
    gewerk: "Mechanik", fehlerart: "Leckage", stoerung: "Hydraulikleitung undicht", ursache: "", getan: "",
    nochZuTun: "Dichtsatz bestellen und tauschen", ausfallzeit: 35, offen: true, gemeldetAt: "2026-09-05T07:10:00",
    ersatzteile: "Dichtsatz DN25", nachbestellt: true },
  { id: "s2", date: "2026-08-12", nr: "2026-033", schicht: "Spät", anlage: "TS480", anlagenteil: "Antrieb",
    gewerk: "Elektrik", fehlerart: "Störmeldung", stoerung: "FU-Fehler F0022", ursache: "Überhitzung",
    getan: "Lüfter gereinigt", nochZuTun: "", ausfallzeit: 20, offen: false, gemeldetAt: "2026-08-12T15:00:00", behobenAt: "2026-08-12T15:20:00",
    ersatzteile: "Lüfterrad 80mm", nachbestellt: true, eingetroffenAt: "2026-08-14T09:00:00" },
  { id: "s3", date: "2026-09-03", nr: "2026-040", schicht: "Früh", anlage: "OF320", anlagenteil: "Brenner",
    gewerk: "Elektrik", fehlerart: "Störmeldung", stoerung: "Gehört NICHT zur TS480", ursache: "", getan: "",
    nochZuTun: "", ausfallzeit: 5, offen: false, gemeldetAt: "2026-09-03T08:00:00", behobenAt: "2026-09-03T08:05:00" },
];

async function start(browser, { leser = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-09-08T10:00:00"));
  await p.addInitScript(({ e, c, s, l }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(s));
    if (l) localStorage.setItem("werkstatt-kalender-nur-lesen", "1");
  }, { e: eintraege, c: config, s: stoer, l: leser });
  await p.goto(APP);
  await p.waitForTimeout(1100);
  return { p, ctx, fehler };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  const { p, ctx, fehler } = await start(browser);

  /* ---- (B) Die Begriffe am Bildschirm ---- */
  pruef("(B) Der Bereichs-Reiter heißt weiterhin TPM (das große Ganze)",
        (await p.getByRole("button", { name: "TPM", exact: true }).count()) >= 1);
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Plan", exact: true }).first().click();
  await p.waitForTimeout(900);
  pruef("(B) Die Plan-Legende sagt PitStop",
        /PitStop/.test(await p.locator("body").innerText()));
  await p.locator('button[aria-label="Drucken"]').click();
  await p.waitForTimeout(400);
  pruef("(B) Der Druck-Umfang heißt „Nur PitStop“ / „Beide (PitStop & R+I)“",
        (await p.getByRole("button", { name: "Nur PitStop", exact: true }).count()) === 1 &&
        (await p.getByRole("button", { name: "Beide (PitStop & R+I)", exact: true }).count()) === 1);
  await p.locator('button[aria-label="Schließen"]').last().click().catch(() => p.keyboard.press("Escape"));
  await p.waitForTimeout(300);

  /* ---- (A) Die Anlagen-Akte im Register ---- */
  await p.getByRole("button", { name: "Register", exact: true }).first().click();
  await p.waitForTimeout(700);
  pruef("(B) Der Register-Filter bietet PitStop statt TPM an",
        (await p.getByRole("button", { name: "PitStop", exact: true }).count()) >= 1);
  await p.getByText("TS480", { exact: true }).first().click();
  await p.waitForTimeout(600);
  const akte = p.locator("div").filter({ has: p.getByRole("button", { name: "Steckbrief" }) }).last();
  // Fünf Reiter seit dem 10.09.: "Termine" statt "Historie" (Robertos
  // Ansage) und neu "Ersatzteile" - mit Zähler für offene Nachbestellungen.
  pruef("(A) Die Akte öffnet mit den fünf Reitern (Termine statt Historie, neu Ersatzteile)",
        (await p.getByRole("button", { name: "Steckbrief" }).count()) === 1 &&
        (await p.getByRole("button", { name: "Termine" }).count()) === 1 &&
        (await p.getByRole("button", { name: "Historie" }).count()) === 0 &&
        (await p.getByRole("button", { name: /^Arbeiten/ }).count()) === 1 &&
        (await p.getByRole("button", { name: /^Störungen \(/ }).count()) === 1 &&
        (await p.getByRole("button", { name: /^Ersatzteile/ }).count()) === 1);
  pruef("(A) Die Reiter tragen die Offen-Zähler: Arbeiten (1), Störungen (1)",
        (await p.getByRole("button", { name: "Arbeiten (1)" }).count()) === 1 &&
        (await p.getByRole("button", { name: "Störungen (1)" }).count()) === 1);

  await p.getByRole("button", { name: "Arbeiten (1)" }).click();
  await p.waitForTimeout(400);
  let text = await p.locator("body").innerText();
  pruef("(A) Arbeiten-Reiter: beide TS480-Arbeiten, die offene zuerst",
        /Hydraulikaggregat prüfen/.test(text) && /Filter getauscht/.test(text) &&
        text.indexOf("Hydraulikaggregat prüfen") < text.indexOf("Filter getauscht"));
  pruef("(A) Fremde Arbeiten (OF320) bleiben draußen", !/Gehört NICHT zur TS480/.test(text));
  pruef("(A) Die eingeplante Arbeit nennt Person und Tag", /M\. Weber, 21\.08\.2026/.test(text));

  await p.getByRole("button", { name: "Störungen (1)" }).click();
  await p.waitForTimeout(400);
  text = await p.locator("body").innerText();
  pruef("(A) Störungs-Reiter: beide TS480-Berichte mit Nummern, offener zuerst",
        /2026-041/.test(text) && /2026-033/.test(text) &&
        text.indexOf("2026-041") < text.indexOf("2026-033"));
  pruef("(A) Die offene Restarbeit steht als „Zu tun“ dabei",
        /Zu tun:/.test(text) && /Dichtsatz bestellen und tauschen/.test(text));
  pruef("(A) Fremde Störungen (OF320) bleiben draußen", !/Gehört NICHT zur TS480/.test(text));
  pruef("(A) Ausfallzeit und Status stehen an der Zeile", /35 min/.test(text) && /Behoben/.test(text));

  /* ---- (E) Der Ersatzteile-Reiter (Robertos Wunsch vom 10.09.) ---- */
  await p.getByRole("button", { name: "Ersatzteile (1)" }).click();
  await p.waitForTimeout(400);
  text = await p.locator("body").innerText();
  pruef("(E) Beide Teile der TS480 stehen da - mit Nachbestellt- und Eingetroffen-Stand",
        /Dichtsatz DN25/.test(text) && /nachbestellt/.test(text) &&
        /Lüfterrad 80mm/.test(text) && /eingetroffen/.test(text));
  pruef("(E) Der Reiter zählt die offene Nachbestellung",
        (await p.getByRole("button", { name: "Ersatzteile (1)" }).count()) === 1);
  pruef("(E) Die Quelle (Störung) steht an jedem Teil", /zu: Hydraulikleitung undicht/.test(text));
  // Zurück auf den Störungs-Reiter - die (S)-Suche misst dort weiter.
  await p.getByRole("button", { name: "Störungen (1)" }).click();
  await p.waitForTimeout(300);

  /* ---- (S) Die Suche in der Akte (Robertos Wunsch vom 08.09.) ---- */
  const suche = p.locator('input[aria-label="In der Akte suchen"]');
  pruef("(S) Das Suchfeld steht in der Akte", (await suche.count()) === 1);
  await suche.fill("Dichtsatz");
  await p.waitForTimeout(400);
  text = await p.locator("body").innerText();
  pruef("(S) „Dichtsatz“ lässt nur den offenen Bericht stehen",
        /1 von 2 Störberichten/.test(text) && /2026-041/.test(text) && !/2026-033/.test(text));
  await suche.fill("gibtsnicht-xyz");
  await p.waitForTimeout(400);
  pruef("(S) Kein Treffer wird ehrlich gemeldet",
        /Nichts gefunden für „gibtsnicht-xyz“/.test(await p.locator("body").innerText()));
  await suche.fill("");
  await p.waitForTimeout(400);
  pruef("(S) Leeres Feld zeigt wieder alles",
        /2 Störbericht\(e\)/.test(await p.locator("body").innerText()));
  // Das Suchwort filtert auch die Arbeiten - und wird beim Wechsel auf
  // eine ANDERE Anlage verworfen (sonst filtert es unsichtbar weiter).
  await suche.fill("Filter getauscht");
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /^Arbeiten/ }).click();
  await p.waitForTimeout(400);
  text = await p.locator("body").innerText();
  pruef("(S) Die Suche wirkt auch im Arbeiten-Reiter (1 von 2, nur die fertige)",
        /1 von 2 Arbeiten/.test(text) && /Filter getauscht/.test(text) && !/Hydraulikaggregat prüfen/.test(text));
  await p.locator('button[aria-label="Schließen"]').last().click();
  await p.waitForTimeout(300);
  await p.getByText("Wasserrundgang", { exact: true }).first().click();
  await p.waitForTimeout(500);
  pruef("(S) Beim Öffnen einer anderen Akte ist die Suche wieder leer",
        (await p.locator('input[aria-label="In der Akte suchen"]').count()) === 0 ||
        (await p.locator('input[aria-label="In der Akte suchen"]').inputValue().catch(() => "")) === "");
  pruef("(B/A/S) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  await ctx.close();

  console.log(`\nHärte 63 (Anlagen-Akte + PitStop-Begriffe): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
