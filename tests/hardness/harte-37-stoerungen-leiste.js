// Härtetest: FILTERLEISTE, NUMMER UND LÖSCHEN bei den Störberichten.
//
// Der Umstieg vom alten Schichtbuch soll niemanden zum Suchen zwingen -
// deshalb dieselben Begriffe links und dieselben Zeilen wie bisher. Zwei
// Dinge muessen dabei nachweisbar bleiben:
//
//   (1) Die Zeilen sind NICHT enger geworden. 26 px Bericht, 26 px Tag,
//       25 px Schicht - an der Fassung davor gemessen, nicht behauptet.
//   (2) Eine doppelte Nummer darf nicht unbemerkt bleiben. Wer als Zweiter
//       speichert, rueckt weiter; lesen beide gleichzeitig, sieht auch der
//       Zweite den Ersten nicht - dann MUSS die App es melden.
//
// Dazu: die Ansichten der Leiste, die Zeitraeume, der Schnellzugriff, das
// Nachtragen alter Nummern und das Loeschen aller Berichte (das ueber die
// App laufen MUSS, weil nur dort Loeschvermerke entstehen).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

// Die Masse, die heute gelten. Aendert sie jemand, faellt dieser Test um -
// und genau das ist der Zweck: "nicht verschlechtern" wurde ausdruecklich
// verlangt und ist damit pruefbar statt Absichtserklaerung.
//
// Die Zahlen sind an der Fassung VOR dem Umbau (2e31bca) gemessen, nicht aus
// dem CSS abgelesen: Die Schichtzeile traegt dort height 23px, ist gerendert
// aber 25 px hoch. Wer vom Quelltext auf die Wirklichkeit schliesst, prueft
// gegen eine Zahl, die es nie gab.
const SOLL = { bericht: 26, tag: 26, schicht: 25 };

const BERICHTE = [
  { id: "t1", nr: "2026-0101", date: "2026-08-03", schicht: "Früh", anlage: "B1 Entladeanlage", anlagenteil: "Hydraulik",
    gewerk: "mech", stoerung: "Pallete fuhr nicht raus", ausfallzeit: 25, offen: false, melder: "R. Ciraci",
    gemeldetAt: "2026-08-03T06:40:00.000Z", updatedAt: "2026-08-03T06:40:00.000Z" },
  { id: "t2", nr: "2026-0102", date: "2026-08-03", schicht: "Spät", anlage: "Trapo Förderanlage", anlagenteil: "Antrieb",
    gewerk: "mech", stoerung: "Lagergeräusch am Antrieb", nochZuTun: "Fremdfirma bestellt", ausfallzeit: 180, offen: true,
    melder: "R. Ciraci", gemeldetAt: "2026-08-03T14:50:00.000Z", updatedAt: "2026-08-03T14:50:00.000Z" },
  { id: "t3", nr: "2026-0103", date: "2026-07-02", schicht: "Früh", anlage: "OF320 Taktstraße", anlagenteil: "Lichtschranke",
    gewerk: "elek", stoerung: "Lichtschranke verschmutzt", ausfallzeit: 0, offen: false, melder: "M. Weber",
    gemeldetAt: "2026-07-02T09:15:00.000Z", updatedAt: "2026-07-02T09:15:00.000Z" },
  // Ohne Nummer: ein Bericht aus der Zeit vor der Nummernvergabe.
  { id: "t4", date: "2026-06-10", schicht: "Nacht", anlage: "B2 Beschichtungsanlage", anlagenteil: "Pumpe",
    gewerk: "mech", stoerung: "Dichtsatz undicht", ausfallzeit: 240, offen: false, melder: "S. Klein",
    gemeldetAt: "2026-06-10T22:10:00.000Z", updatedAt: "2026-06-10T22:10:00.000Z" },
];

// uhr = null: echte Zeit. Gebraucht wird das ueberall dort, wo NACHEINANDER
// gespeichert wird. Beim Zusammenfuehren gewinnt der spaetere Zeitstempel -
// bei eingefrorener Uhr sind alle gleich, und die zweite Aenderung kaeme nie
// an. Das ist eine Eigenschaft des Tests, nicht der App: In der Werkstatt
// laeuft die Uhr.
async function seite(browser, platte, { uhr = "2026-08-03T16:00:00" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const p = await ctx.newPage();
  if (uhr) await p.clock.setFixedTime(new Date(uhr));
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript(() => {
    localStorage.setItem("werkstatt-kalender-name", "R. Ciraci");
    window.__mk = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib(name, b); } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
  });
  await p.goto(APP);
  await p.waitForTimeout(1100);
  await p.evaluate(async () => await window.__wkStoerTest.adopt(window.__mk("stoer.json"), "readwrite"));
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Störungen" }).first().click();
  await p.waitForTimeout(700);
  return p;
}
const dateiBerichte = (platte) => {
  const d = JSON.parse(platte["stoer.json"] || "{}");
  return (d.entries || []).filter((e) => !String(e.id).startsWith("config|") && !String(e.id).startsWith("log|"));
};
// Alle Zeilen aufklappen, damit die Berichte sichtbar sind.
const klappeAlles = async (p) => {
  for (let runde = 0; runde < 3; runde++) {
    const zu = await p.evaluate(() => {
      const treffer = Array.from(document.querySelectorAll("tr")).filter((r) => (r.textContent || "").includes("▸"));
      treffer.forEach((r) => r.click());
      return treffer.length;
    });
    await p.waitForTimeout(350);
    if (!zu) break;
  }
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const leer = () => JSON.stringify({ format: "werkstatt-stoerungen-v1", savedAt: null, entries: [], deleted: {}, config: null });

  /* ---------------- (1) Zeilen sind nicht enger geworden ---------------- */
  {
    const platte = { "stoer.json": JSON.stringify({ format: "werkstatt-stoerungen-v1", savedAt: "2026-08-03T15:00:00.000Z", entries: BERICHTE, deleted: {}, config: null }) };
    const p = await seite(b, platte);
    const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
    await klappeAlles(p);

    const mass = await p.evaluate(() => {
      const zeilen = Array.from(document.querySelectorAll("tbody tr"));
      const hoehe = (r) => Math.round(r.getBoundingClientRect().height);
      const art = (r) => {
        const t = (r.textContent || "");
        if (/\d{2}\.\d{2}\.\d{4}/.test(t) && /Eintr(a|ä)g/.test(t)) return "tag";
        if (/^\s*[▾▸]/.test(t) && /(Früh|Spät|Nacht|ohne Schicht)/.test(t)) return "schicht";
        return "bericht";
      };
      const aus = { tag: [], schicht: [], bericht: [] };
      zeilen.forEach((r) => { const h = hoehe(r); if (h > 0) aus[art(r)].push(h); });
      return { tag: [...new Set(aus.tag)], schicht: [...new Set(aus.schicht)], bericht: [...new Set(aus.bericht)] };
    });
    pruef("(1) Die Berichtszeile ist unverändert hoch", mass.bericht.length === 1 && mass.bericht[0] === SOLL.bericht, JSON.stringify(mass.bericht) + " soll " + SOLL.bericht);
    pruef("(1) Die Tageszeile ist unverändert hoch", mass.tag.length === 1 && mass.tag[0] === SOLL.tag, JSON.stringify(mass.tag) + " soll " + SOLL.tag);
    pruef("(1) Die Schichtzeile ist unverändert hoch", mass.schicht.length === 1 && mass.schicht[0] === SOLL.schicht, JSON.stringify(mass.schicht) + " soll " + SOLL.schicht);

    /* ---------------- (2) Nummer und rote Kante ---------------- */
    const text = await p.locator("body").innerText();
    pruef("(2) Die Nummer steht kurz in der Liste", /\b0101\b/.test(text) && /\b0102\b/.test(text), (text.match(/\b010\d\b/g) || []).join(","));
    pruef("(2) Das Jahr steht NICHT in jeder Zeile", !/2026-0101/.test(text));
    const kante = await p.evaluate(() => {
      const zeilen = Array.from(document.querySelectorAll("tbody tr"));
      const mit = zeilen.filter((r) => {
        const td = r.querySelector("td");
        // Chrome schreibt den Schatten normalisiert zurueck:
        // "rgb(192, 57, 43) 3px 0px 0px inset". Auf die Schreibweise aus dem
        // Quelltext zu pruefen, ginge daneben.
        const sch = td ? (td.style.boxShadow || "") : "";
        return /inset/.test(sch) && /192,\s*57,\s*43/.test(sch);
      });
      return { anzahl: mit.length, texte: mit.map((r) => (r.textContent || "").slice(0, 30)) };
    });
    pruef("(2) Genau der offene Bericht trägt die rote Kante",
          kante.anzahl === 1 && /0102/.test(kante.texte[0] || ""), JSON.stringify(kante));

    /* ---------------- (3) Die Leiste ---------------- */
    pruef("(3) Die Leiste zeigt die Begriffe des alten Schichtbuchs",
          (await p.getByRole("button", { name: "nach Datum und Schicht" }).count()) === 1 &&
          (await p.getByRole("button", { name: "nach Anlage" }).count()) === 1 &&
          (await p.getByRole("button", { name: "nach Nummer" }).count()) === 1 &&
          (await p.getByRole("button", { name: "nach Status" }).count()) === 1);

    await p.getByRole("button", { name: "nach Anlage" }).click();
    await p.waitForTimeout(500);
    const nachAnlage = await p.locator("body").innerText();
    pruef("(3) „nach Anlage“ gruppiert nach Anlage",
          nachAnlage.includes("Trapo Förderanlage") && nachAnlage.includes("B1 Entladeanlage") && !/Frühschicht|Spätschicht/.test(nachAnlage));

    await p.getByRole("button", { name: "nach Nummer" }).click();
    await p.waitForTimeout(500);
    const reihenfolge = await p.evaluate(() =>
      Array.from(document.querySelectorAll("tbody tr td:first-child"))
        .map((td) => (td.textContent || "").trim()).filter((t) => /^\d{4}$/.test(t)));
    pruef("(3) „nach Nummer“ sortiert absteigend", reihenfolge[0] === "0103" && reihenfolge[1] === "0102", reihenfolge.join(" "));

    /* ---------------- (4) Zeitraum und Schnellzugriff ---------------- */
    await p.getByRole("button", { name: "nach Datum und Schicht" }).click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: /^Dieser Monat/ }).click();
    await p.waitForTimeout(500);
    await klappeAlles(p);
    const imMonat = await p.locator("body").innerText();
    pruef("(4) „Dieser Monat“ blendet ältere Berichte aus",
          imMonat.includes("Pallete fuhr nicht raus") && !imMonat.includes("Lichtschranke verschmutzt"));

    await p.getByRole("button", { name: /^Alle \/ Archiv/ }).click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: /Nur offene/ }).click();
    await p.waitForTimeout(500);
    await klappeAlles(p);
    const nurOffen = await p.locator("body").innerText();
    pruef("(4) „Nur offene“ lässt nur den offenen Bericht übrig",
          nurOffen.includes("Lagergeräusch") && !nurOffen.includes("Pallete fuhr nicht raus"));
    // Nochmal klicken hebt den Filter auf - sonst sitzt man fest.
    await p.getByRole("button", { name: /Nur offene/ }).click();
    await p.waitForTimeout(500);
    await klappeAlles(p);
    pruef("(4) Ein zweiter Klick hebt den Filter wieder auf",
          (await p.locator("body").innerText()).includes("Pallete fuhr nicht raus"));

    /* ---------------- (5) Nummern nachtragen ---------------- */
    pruef("(5) Der Hinweis auf Berichte ohne Nummer ist da",
          (await p.getByRole("button", { name: "Nummern nachtragen" }).count()) === 1);
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "Nummern nachtragen" }).click();
    await p.waitForTimeout(1600);
    const nachher = dateiBerichte(platte);
    const t4 = nachher.find((s) => s.id === "t4");
    pruef("(5) Der Bericht ohne Nummer hat jetzt eine", !!(t4 && t4.nr), t4 ? String(t4.nr) : "fehlt");
    pruef("(5) Sie trägt das Jahr des Berichts", !!t4 && String(t4.nr).startsWith("2026-"), t4 ? String(t4.nr) : "");
    pruef("(5) Keine Nummer doppelt", new Set(nachher.map((s) => s.nr)).size === nachher.length,
          nachher.map((s) => s.nr).join(","));
    pruef("(5) Der Hinweis verschwindet danach",
          (await p.getByRole("button", { name: "Nummern nachtragen" }).count()) === 0);
    pruef("(1)-(5) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await p.context().close();
  }

  /* ---------------- (6) Zwei melden gleichzeitig ---------------- */
  {
    // Der gefaehrliche Fall: Beide Geraete lesen denselben Stand, beide
    // greifen nach derselben naechsten Nummer. Danach darf sie es trotzdem
    // nur einmal geben.
    const platte = { "stoer.json": leer() };
    const a = await seite(b, platte, { uhr: null });
    const c = await seite(b, platte, { uhr: null });
    const melde = async (p, text) => {
      await p.getByRole("button", { name: /Störbericht erfassen/ }).click();
      await p.waitForTimeout(600);
      await p.getByPlaceholder("z. B. Presse 3").fill("B1 Entladeanlage");
      await p.getByPlaceholder("Was funktioniert nicht?").fill(text);
      // Ohne Schicht und Status bleibt "Speichern" gesperrt - dieselbe
      // Bedingung, die auch der Werkstatt einen halben Bericht erspart.
      await p.getByRole("button", { name: "Spät", exact: true }).click();
      // "Offen" statt "Erledigt": Bei erledigt verlangt die Maske zusaetzlich
      // Ursache und Sofortmassnahme - hier geht es um die Nummernvergabe,
      // nicht um die Pflichtfelder.
      await p.getByRole("button", { name: "● Offen" }).click();
      await p.waitForTimeout(250);
      await p.getByRole("button", { name: /^Speichern/ }).click();
      await p.waitForTimeout(1600);
    };
    // Bewusst NACHEINANDER ausgeloest, aber beide Seiten haben denselben
    // Ausgangsstand gelesen - genau die Lage, die zur Doppelnummer fuehrt.
    await Promise.all([melde(a, "Meldung von A"), melde(c, "Meldung von C")]);
    await a.evaluate(() => window.__wkStoerTest.poll());
    await c.evaluate(() => window.__wkStoerTest.poll());
    await a.waitForTimeout(900);

    const inDatei = dateiBerichte(platte);
    const nummern = inDatei.map((s) => s.nr).filter(Boolean);
    pruef("(6) Beide Meldungen stehen in der Datei", inDatei.length === 2, inDatei.length + " Berichte");
    pruef("(6) Beide haben eine Nummer", nummern.length === inDatei.length, JSON.stringify(nummern));

    // Zwei Ausgaenge sind moeglich, und beide sind in Ordnung:
    //  - Der Zweite hat den Ersten beim Zusammenfuehren gesehen und ist
    //    weitergerueckt. Dann sind die Nummern schon verschieden.
    //  - Beide haben gleichzeitig gelesen, der Zweite sah den Ersten NICHT.
    //    Dann steht die Nummer zweimal da - und muss GEMELDET werden.
    // Was NICHT sein darf: doppelt und keiner merkt es.
    const doppelt = new Set(nummern).size !== nummern.length;
    if (!doppelt) {
      pruef("(6) Der Zweite ist weitergerückt - Nummern verschieden", true, JSON.stringify(nummern));
    } else {
      const gemeldet = await a.getByRole("button", { name: "Nummern bereinigen" }).count();
      pruef("(6) Die doppelte Nummer wird gemeldet, nicht verschwiegen", gemeldet === 1, JSON.stringify(nummern));
      a.once("dialog", (d) => d.accept());
      await a.getByRole("button", { name: "Nummern bereinigen" }).click();
      await a.waitForTimeout(1800);
      const danach = dateiBerichte(platte).map((s) => s.nr);
      pruef("(6) Nach dem Bereinigen ist jede Nummer einmalig",
            new Set(danach).size === danach.length && danach.every(Boolean), JSON.stringify(danach));
    }
    await a.context().close(); await c.context().close();
  }

  /* ---------------- (7) Löschen wirkt auf allen Geräten ----------------
     Der Sammelknopf "Alle Berichte löschen" ist wieder weg - er hatte genau
     eine Aufgabe (Testdaten vor dem Roll-out) und die ist erledigt. Was
     bleiben MUSS, ist das Wesentliche daran: Eine Löschung in der App
     hinterlässt einen Löschvermerk, und nur der haelt den Eintrag auf den
     anderen Rechnern fern. Ohne ihn braechte der naechste Abgleich des
     Kollegen den Bericht zurueck - beide Seiten werden ja vereinigt. */
  {
    const platte = { "stoer.json": JSON.stringify({ format: "werkstatt-stoerungen-v1", savedAt: "2026-08-03T15:00:00.000Z", entries: BERICHTE, deleted: {}, config: null }) };
    const a = await seite(b, platte, { uhr: null });
    const c = await seite(b, platte, { uhr: null }); // zweites Gerät, kennt die Berichte noch
    await c.waitForTimeout(400);

    pruef("(7) Der Sammelknopf zum Löschen ist nicht mehr da",
          (await a.getByRole("button", { name: /Alle Berichte löschen/ }).count()) === 0);

    // Einen Bericht über die App löschen.
    await klappeAlles(a);
    await a.getByText("Lagergeräusch am Antrieb").first().click();
    await a.waitForTimeout(700);
    // Der Knopf heisst "🔓 Bearbeiten" - ohne Anker, sonst greift das Emoji davor.
    const bearbeiten = a.getByRole("button", { name: /Bearbeiten/ });
    if (await bearbeiten.count()) { await bearbeiten.first().click(); await a.waitForTimeout(600); }
    a.once("dialog", (d) => d.accept());
    // Der Knopf sitzt am unteren Ende der Maske, in einem eigenen Rollbereich -
    // Playwright bekommt ihn dort nicht ins Bild. Das Ereignis wird deshalb
    // direkt ausgeloest; der Weg dahinter ist derselbe wie beim Mausklick.
    await a.getByRole("button", { name: "Löschen", exact: true }).first().dispatchEvent("click");
    await a.waitForTimeout(1800);

    const inDatei = dateiBerichte(platte);
    pruef("(7) Der Bericht ist aus der gemeinsamen Datei verschwunden",
          !inDatei.some((s) => s.id === "t2"), inDatei.length + " Berichte");
    const merkliste = JSON.parse(platte["stoer.json"] || "{}").deleted || {};
    pruef("(7) Und trägt einen Löschvermerk", !!merkliste.t2, JSON.stringify(Object.keys(merkliste)));

    let beiC = "[]";
    for (let i = 0; i < 10; i++) {
      await c.evaluate(() => window.__wkStoerTest.poll());
      await c.waitForTimeout(500);
      beiC = await c.evaluate(() => (localStorage.getItem("werkstatt-stoerungen-entries") || "[]"));
      if (!JSON.parse(beiC).some((s) => s.id === "t2")) break;
    }
    pruef("(7) Das zweite Gerät übernimmt die Löschung",
          !JSON.parse(beiC).some((s) => s.id === "t2"), JSON.parse(beiC).length + " Berichte lokal");
    pruef("(7) Und bringt den Bericht nicht zurück",
          !dateiBerichte(platte).some((s) => s.id === "t2"), dateiBerichte(platte).length + " in der Datei");
    await a.context().close(); await c.context().close();
  }

  await b.close();
  console.log(`\nHärte 37 (Störungen-Leiste): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})();
