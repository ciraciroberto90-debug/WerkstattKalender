// Härtetest: SCHICHTBERICHT-DRUCK im Morgenrunden-Format (Robertos Ansage
// vom 17.09., in der Morgenrunde abgestimmt und danach in die App gebaut).
//
// Das Blatt für die Morgenrunde hat feste Merkmale, die nicht wieder
// verlorengehen dürfen - deshalb hier gemessen statt behauptet:
//   - Tagesblick-Zeile (Früh/Spät/Nacht mit Anzahl + Ausfallzeit),
//   - eigene Spalte "Störungsursache",
//   - OFFENE Berichte je Schicht-Block ZUERST, mit roter Kante,
//   - Ausfallzeit als Plakette: 0 min = "–", ab 60 min rot ("hoch"),
//   - Farbe nur in Schicht-Balken und erster Spalte,
//   - Kennzahlen fett, "offen" rot wenn > 0, sonst grün,
//   - leere Schicht steht kompakt als "keine Störungen".
//
// Der Druck läuft über window.open + document.write; die Sonde faengt das
// Fenster ab und liest den HTML-Text.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c, z) => { console.log((c ? "PASS | " : "FAIL | ") + n + (z ? "   (" + z + ")" : "")); c ? ok++ : fail++; };

// Alle drei Schichten am 17.09.2026 (feste Uhr 18.09. 05:00 -> Slots = 17.09.).
// f1 = OK/0 min (früher gemeldet), f2 = OFFEN/15 min (später gemeldet, muss
// trotzdem oben stehen), s1 = OK/60 min (rote Plakette), Nacht leer.
const BERICHTE = [
  { id: "f1", nr: "2026-4001", date: "2026-09-17", schicht: "Früh", anlage: "KUKA I Pal-Roboter", anlagenteil: "2032007",
    stoerung: "Kuka nimmt nicht alle Töpfe ab", ursache: "Vakuumventil 1 verschmutzt", getan: "Ventil gereinigt",
    ausfallzeit: 0, offen: false, melder: "MelderOK", gemeldetAt: "2026-09-17T06:10:00.000Z" },
  { id: "f2", nr: "2026-4002", date: "2026-09-17", schicht: "Früh", anlage: "B2 Bezeichnungsanlage", anlagenteil: "Etikettierer",
    stoerung: "Etikettierer fördert keine Etiketten", ursache: "Kugelschalter verstellt, Stempelhalter verbogen",
    getan: "Kugelschalter gerichtet", nochZuTun: "Stempel morgen nachkontrollieren",
    ausfallzeit: 15, offen: true, melder: "MelderOFFEN", gemeldetAt: "2026-09-17T07:00:00.000Z" },
  { id: "s1", nr: "2026-4003", date: "2026-09-17", schicht: "Spät", anlage: "TS 480 ADL", anlagenteil: "2032002",
    stoerung: "Hubeinleger fährt nicht mehr hoch", ursache: "Reedschalter defekt", getan: "Reedschalter gewechselt",
    ausfallzeit: 60, offen: false, melder: "Becker", gemeldetAt: "2026-09-17T15:00:00.000Z" },
];

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const platte = { "stoer.json": JSON.stringify({ entries: BERICHTE }) };
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-09-18T05:00:00"));
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript(() => {
    localStorage.setItem("werkstatt-kalender-name", "R. Ciraci");
    try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {}
    window.__mk = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let x = ""; return { async write(c) { x += c; }, async close() { await window.__schreib(name, x); } }; },
      async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
    });
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    // Druckfenster abfangen: den geschriebenen HTML-Text sammeln.
    window.__druckHtml = "";
    window.open = function () {
      return { document: { open() {}, write(h) { window.__druckHtml += h; }, close() {} }, focus() {}, print() {} };
    };
  });
  await p.goto(APP);
  await p.waitForTimeout(1100);
  await p.evaluate(async () => await window.__wkStoerTest.adopt(window.__mk("stoer.json"), "readwrite"));
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: /^Berichte/ }).first().click();
  await p.waitForTimeout(350);
  await p.getByRole("button", { name: /^Störungen/ }).first().click();
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Drucken" }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Am Bildschirm zeigen/ }).click();
  await p.waitForTimeout(500);

  const html = await p.evaluate(() => window.__druckHtml || "");

  pruef("(1) Druck-HTML wurde erzeugt", html.length > 500, html.length + " Zeichen");
  pruef("(2) Tagesblick-Zeile vorhanden", /class="tagesblick"/.test(html));
  pruef("(3) Spalte 'Störungsursache' im Kopf", />Störungsursache</.test(html));
  pruef("(4) Kennzahl: 3 Störungen", /3 Störungen/.test(html));
  pruef("(5) Kennzahl '1 offen' in Rot", /color:#C0392B[^"]*">1 offen/.test(html));
  pruef("(6) Kennzahl: Ausfallzeit 75 min", /Ausfallzeit 75 min/.test(html));
  pruef("(7) Ausfall-Plakette 'hoch' bei 60 min", /ausfall hoch">60 min/.test(html));
  pruef("(8) Ausfall-Plakette 'null' bei 0 min", /ausfall null">–/.test(html));
  pruef("(9) Leere Nacht-Schicht: 'keine Störungen'", /keine Störungen/.test(html));
  pruef("(10) Erste Spalte in Schichtfarbe (Früh)", /class="nr frueh"/.test(html));
  pruef("(11) Erste Spalte in Schichtfarbe (Spät)", /class="nr spaet"/.test(html));
  pruef("(12) Störungsursache-Zelle gefüllt", /class="ursache">Vakuumventil 1 verschmutzt/.test(html));
  pruef("(13) Offener Bericht trägt die rote Kante (zoffen)", /class="zoffen"/.test(html));
  const iO = html.indexOf("MelderOFFEN"), iK = html.indexOf("MelderOK");
  pruef("(14) OFFEN steht im Früh-Block VOR dem OK-Bericht", iO > -1 && iK > -1 && iO < iK, "offen@" + iO + " ok@" + iK);
  pruef("(15) Status OFFEN und OK beide vorhanden", /st offen">OFFEN/.test(html) && /st ok">OK/.test(html));

  await b.close();
  console.log(`\nSUMME: ${ok} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
