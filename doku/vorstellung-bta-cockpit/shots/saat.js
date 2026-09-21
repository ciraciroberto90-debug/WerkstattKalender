// Gemeinsame Saat fuer die Praesentations-Screenshots: ein realistisches
// Werkstatt-Jahr, bereinigt fuer den Stichtag 18.09.2026 09:30 (nichts liegt
// in der Zukunft, Stoerungen tragen Nummern, To-dos sind nicht alle
// ueberfaellig, R+I-Nachweise haengen an den ECHTEN Pruefpunkten der App).
const { baueBestand, baueStoerungen, TEAM } = require("/home/user/WerkstattKalender/tools/langzeit-daten.js");

const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const HEUTE = "2026-09-18";
const JETZT = "2026-09-18T07:30:00.000Z"; // 09:30 Ortszeit
const VON = "2026-01-05";

// Die Pruefpunkte der App (Stand DEFAULT_RI_ITEMS) - Faelligkeiten rechnet die
// App-Funktion riItemOccursOn selbst aus (ueber den Testzugang).
const RI_ITEMS = [
  { id: "wasserrundgang", name: "Wasserrundgang", type: "weekly", weekday: 1 },
  { id: "elevator", name: "Elevatorprüfung + Ölen", type: "weekly", weekday: 4 },
  { id: "hro-trockner", name: "HRO Trocknerketten Ölen", type: "monthly-day", day: 22 },
  { id: "energie", name: "Energieaufschreibung", type: "monthly-day", day: 1 },
  { id: "leiterkontrolle", name: "Leiterkontrolle R+I 9", type: "yearly", month: 9, day: 19 },
  { id: "abwasserproben", name: "Abwasserproben R+I 30", type: "every-n-months", n: 3, anchor: "2026-08-06" },
  { id: "werkstattreinigung", name: "Werkstattreinigung", type: "weekly", weekday: 4 },
  { id: "filterwartung", name: "Filterwartung / Schaltschränke", type: "every-n-months", n: 3, anchor: "2026-07-07" },
  { id: "kompressor", name: "Kompressor Rundgang", type: "biweekly", weekday: 4, anchor: "2026-07-09" },
  { id: "verbrauchsmaterial-bta", name: "Kontrolle der Verbrauchsmaterialien in BTA", type: "monthly-day", day: 7 },
  { id: "hygieneplan-bta", name: "Hygieneplan BTA", type: "monthly-day", day: 8 },
  { id: "fluormessungen", name: "Fluormessungen an den HF Absorbern", type: "every-n-months", n: 2, anchor: "2026-07-10" },
  { id: "imissionsmessungen", name: "Imissionsmessungen", type: "every-n-months", n: 2, anchor: "2026-07-13" },
  { id: "wasserproben-lra", name: "Wasserproben (Abwasser LRA)", type: "every-n-months", n: 3, anchor: "2026-07-14" },
  { id: "sicherheitsrundgang", name: "Sicherheitsrundgang 2 Brandschutz", type: "every-n-months", n: 6, anchor: "2026-07-16" },
  { id: "trinkwasserfilter", name: "Trinkwasserfilter (Prüfung + Rückspülung)", type: "every-n-months", n: 6, anchor: "2026-07-17" },
  { id: "sprinklerwartung", name: "Sprinklerwartung", type: "biweekly", weekday: 3, anchor: "2026-07-15" },
  { id: "stroemungswaechter", name: "Strömungswächter", type: "monthly-day", day: 15 },
];

function streu(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }

// Faelligkeiten je Pruefpunkt ueber die App selbst ermitteln (Testzugang).
async function riFaelligkeiten(ctx) {
  const p = await ctx.newPage();
  await p.goto(APP);
  await p.waitForFunction(() => typeof window.__wkRhythmusTest === "function", null, { timeout: 60000 });
  const treffer = await p.evaluate(({ items, von, bis }) => {
    const aus = [];
    const d = new Date(von + "T00:00:00");
    const ende = new Date(bis + "T00:00:00");
    while (d <= ende) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      for (const it of items) { if (window.__wkRhythmusTest(it, d)) aus.push({ name: it.name, date: key }); }
      d.setDate(d.getDate() + 1);
    }
    return aus;
  }, { items: RI_ITEMS, von: VON, bis: HEUTE });
  await p.close();
  return treffer;
}

async function bauePlatte(ctx) {
  let { entries } = baueBestand({ von: VON, bis: HEUTE });
  // Generator-R+I (nach Anlagen benannt) raus - die echten kommen unten.
  entries = entries.filter((e) => e.category !== "RI");
  // Nichts aus der Zukunft: Eintraege nach dem Stichtag raus, Zeitstempel klemmen.
  entries = entries.filter((e) => String(e.date) <= HEUTE);
  entries.forEach((e) => { if (String(e.updatedAt) > JETZT) e.updatedAt = JETZT; if (String(e.erledigtAm || "") > JETZT) e.erledigtAm = JETZT; });
  // Offene To-dos bekommen Fristen in den naechsten zwei Wochen; drei bleiben ueberfaellig.
  let k = 0;
  entries.forEach((e) => {
    if (e.category === "TODO" && e.status === "offen") {
      const d = new Date(HEUTE + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1 + (k++ % 14));
      e.bis = d.toISOString().slice(0, 10);
    }
  });
  entries.filter((e) => e.category === "TODO" && e.status === "offen").slice(0, 3).forEach((e) => { e.bis = "2026-09-15"; });

  // R+I-Nachweise an den echten Pruefpunkten: ~93 % erledigt, Rest ehrlich versaeumt.
  const faellig = await riFaelligkeiten(ctx);
  faellig.forEach((f, i) => {
    if (f.date === HEUTE) return;                       // heute ist noch offen
    if (streu(f.name + f.date) % 15 === 0) return;      // ein paar Luecken
    entries.push({ id: `ri|${f.name}|${f.date}`, date: f.date, category: "RI", name: f.name, status: "done",
      updatedAt: `${f.date}T08:30:00.000Z` });
  });

  entries.push(
    { id: "pin|1", date: "2026-09-17", category: "NOTIZ", name: "R. Ciraci", veroeffentlicht: true, zeit: "2026-09-17T12:05:00.000Z",
      note: "Ersatz-Lichtschranke für KUKA I liegt im Regal 3, Fach B – bitte nach Einbau Bestand melden.", updatedAt: "2026-09-17T12:05:00.000Z" },
    { id: "pin|2", date: HEUTE, category: "NOTIZ", name: "M. Weber", veroeffentlicht: true, zeit: "2026-09-18T04:20:00.000Z",
      note: "Fremdfirma Hydraulik kommt Freitag 09:00 zur TS 480 – Anlage bitte ab 08:30 freihalten.", updatedAt: "2026-09-18T04:20:00.000Z" },
    { id: "pin|3", date: "2026-09-16", category: "NOTIZ", name: "T. Klein", veroeffentlicht: true, zeit: "2026-09-16T11:40:00.000Z",
      note: "Neue Prüfliste Sprinkler hängt am Schrank, alte bitte nicht mehr verwenden.", updatedAt: "2026-09-16T11:40:00.000Z" },
  );

  let stoerungen = baueStoerungen({ von: VON, bis: "2026-09-16" });
  // Die letzten drei Schichten (Frueh 18.09., Spaet + Nacht 17.09.) wie ein
  // echter Morgenrunden-Tag - damit der Schichtbericht lebt.
  const handgemacht = [
    { id: "st|1709-f1", date: "2026-09-17", schicht: "Früh", anlage: "KUKA I Pal-Roboter", anlagenteil: "Vakuumgreifer", gewerk: "Elektrik", fehlerart: "Störmeldung",
      stoerung: "Roboter nimmt nicht alle Töpfe ab", ursache: "Vakuumventil 1 verschmutzt", getan: "Ventil gereinigt, Saugplatte gesäubert, danach lief er wieder",
      ausfallzeit: 15, offen: false, gemeldetAt: "2026-09-17T08:20:00", melder: "K. Neumann", updatedAt: "2026-09-17T07:00:00.000Z" },
    { id: "st|1709-s1", date: "2026-09-17", schicht: "Spät", anlage: "B3 Be- und Entladeanlage", anlagenteil: "Palettenförderer", gewerk: "Elektrik", fehlerart: "Störmeldung",
      stoerung: "Lichtschranke defekt nach Crash am Palettenförderer", ursache: "Lichtschranke durch den Crash verbogen", getan: "Lichtschranke getauscht und neu ausgerichtet",
      ausfallzeit: 25, offen: false, gemeldetAt: "2026-09-17T15:40:00", melder: "J. Wolf", updatedAt: "2026-09-17T14:30:00.000Z" },
    { id: "st|1709-s2", date: "2026-09-17", schicht: "Spät", anlage: "TS 320 ADL", anlagenteil: "Ölabscheider", gewerk: "Mechanik", fehlerart: "Verschleiß",
      stoerung: "Öl tritt an beiden Vakuumtafeln aus den Abscheidern aus", ursache: "Ölabscheider im Kompressorraum voll, Ablass-Schlauch verstopft",
      getan: "Abscheider pressenseitig gewechselt, Kompressorraum zur Hälfte abgelassen", nochZuTun: "Ablass-Schlauch im Kompressorraum frei machen, Abscheider prüfen",
      ausfallzeit: 30, offen: true, gemeldetAt: "2026-09-17T19:05:00", melder: "P. Hoffmann", updatedAt: "2026-09-17T18:00:00.000Z" },
    { id: "st|1709-n1", date: "2026-09-17", schicht: "Nacht", anlage: "TS 480 ADL", anlagenteil: "Hubeinleger", gewerk: "Elektrik", fehlerart: "Störmeldung",
      stoerung: "Hubeinleger fährt nicht mehr hoch", ursache: "Reedschalter defekt, ließ sich nicht mehr einstellen",
      getan: "Reedschalter gewechselt und neu eingestellt; Ausfallzeit länger wegen Anfahrt der Bereitschaft",
      ausfallzeit: 60, offen: false, gemeldetAt: "2026-09-17T23:30:00", melder: "M. Weber", updatedAt: "2026-09-17T22:40:00.000Z" },
    { id: "st|heute", date: HEUTE, schicht: "Früh", anlage: "TS 480 ADL", anlagenteil: "Hubeinleger", gewerk: "Elektrik", fehlerart: "Störmeldung",
      stoerung: "Hubeinleger bleibt erneut in der unteren Endlage stehen", ursache: "Endschalter unten verklemmt (Formstück unter dem Hubwerk)",
      getan: "Hubwerk hochgefahren und gereinigt, Endschalter provisorisch eingestellt", nochZuTun: "Neuen Endschalter einbauen (Ersatzteil bestellt)",
      ersatzteile: "Endschalter Typ ES-40", nachbestellt: true, ausfallzeit: 45, offen: true,
      gemeldetAt: "2026-09-18T07:10:00", melder: "A. Fischer", updatedAt: "2026-09-18T05:30:00.000Z" },
  ];
  stoerungen.push(...handgemacht);
  stoerungen.sort((a, b) => String(a.gemeldetAt).localeCompare(String(b.gemeldetAt)));
  stoerungen.forEach((s, i) => { s.nr = "2026-" + String(i + 1).padStart(4, "0"); });

  return {
    platte: {
      "kalender-daten.json": JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: JETZT, entries, deleted: {}, config: null }),
      "werkstatt-stoerungen.json": JSON.stringify({ format: "werkstatt-stoerungen-v1", savedAt: JETZT, entries: stoerungen, deleted: {} }),
    },
    anzahl: { entries: entries.length, stoerungen: stoerungen.length, ri: faellig.length },
  };
}

// Seite oeffnen und beide Dateien laden - wie im Alltag.
// extra (optional, seit 21.09. fuer die Hauptpraesentation): { cfg: {...} } wird
// in die Konfiguration gemischt (z. B. Benutzerliste), { speicher: {k: v} } setzt
// weitere localStorage-Schluessel (z. B. gemerkte Anmeldung, Gruppen-Pass).
async function seiteLaden(ctx, platte, extra = {}) {
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-09-18T09:30:00"));
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript(({ cfg, speicher }) => {
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(cfg));
    localStorage.setItem("werkstatt-kalender-name", "R. Ciraci");
    localStorage.setItem("werkstatt-kalender-fest", "2026-09");
    Object.entries(speicher || {}).forEach(([k, v]) => localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)));
    const bau = (name) => ({ name, kind: "file",
      async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let x = ""; return { async write(c) { x += c; }, async close() { await window.__schreib(name, x); }, async abort() {} }; },
      async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } });
    window.__welche = "kalender-daten.json";
    window.showOpenFilePicker = async () => [bau(window.__welche)];
    window.__druckHtml = "";
    window.open = function () { window.__druckHtml = ""; return { document: { open() {}, write(h) { window.__druckHtml += h; }, close() {} }, focus() {}, print() {} }; };
  }, { cfg: Object.assign({ team: TEAM }, extra.cfg || {}), speicher: extra.speicher || {} });
  await p.goto(APP);
  await p.locator('button[aria-label="Gemeinsame Datei"]').waitFor({ timeout: 60000 });
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForFunction(() => !/Vorhandene Datei öffnen/.test(document.body.innerText), null, { timeout: 120000 });
  await p.waitForTimeout(1200);
  const sp = p.getByRole("button", { name: /Später erinnern/ }); if (await sp.count()) await sp.first().click();
  await p.evaluate(() => { window.__welche = "werkstatt-stoerungen.json"; });
  await p.getByRole("button", { name: /^Berichte/ }).first().click(); await p.waitForTimeout(400);
  await p.getByRole("button", { name: /^Störungen/ }).first().click(); await p.waitForTimeout(400);
  const sk = p.getByRole("button", { name: /Störungen-Datei öffnen/ });
  if (await sk.count()) { await sk.first().click(); await p.waitForFunction(() => /behoben/.test(document.body.innerText), null, { timeout: 60000 }); }
  await p.waitForTimeout(600);
  const sp2 = p.getByRole("button", { name: /Später erinnern/ }); if (await sp2.count()) await sp2.first().click();
  return p;
}

module.exports = { bauePlatte, seiteLaden };
