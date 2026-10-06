// Härtetest: OEE IM SCHICHTBERICHT (Robertos Wahl vom 06.10., Vorlage C)
//
// Die OEE-Tabelle der Kachel (Pivot: je Anlage Gutm. · OEE_M · OEE%n, Zeilen
// Tag + FRÜH/MITTAG/NACHT, rechts "Gesamt: …") liefert mehr als die eine
// Zahl: Im Schichtbericht steht je Anlage eine Kachel mit drei Schicht-Balken
// und dem Tageswert, die Gesamt-OEE jeder Schicht als Marke im Tagesblick,
// und der Knopf 📊 OEE klappt den Block zu/auf - OFFEN zu Beginn (Roberto).
// Der PitStop-Knopf wandert nach links neben die TPM-Quote.
//
//  (O1) Knopf 📊 OEE mit dem Tageswert; Block offen; PitStop links neben dem Tacho.
//  (O2) Tagesblick: Gesamt-OEE je Schicht mit Ampel (Früh 66,1 gelb, Spät 76,9 gelb,
//       Nacht 78,6 gelb) - MITTAG der Tabelle = Spät des Berichts.
//  (O3) Kacheln TS200, TS320, VSM1, Gesamt mit Balken: Werte und Ampel (TS320 Früh 51,6 rot,
//       TS320 Nacht 83,2 grün), TS200 Spät ohne Wert.
//  (O4) Klick auf eine Kachel zeigt Gutmenge / Soll (1.927 / 3.514).
//  (O5) Knopf schließt den Block (hidden) und öffnet ihn wieder.
//  (O6) Ohne eingerichtete OEE-Quelle: kein Knopf, keine Marken, kein Block.
//  (O7) Tag ohne Zeilen in der Tabelle (Nachschau 01.10.): Hinweis statt leerer Kacheln.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: gegen den Bau vor dem 06.10. (APP_PFAD) ist (O1) rot - kein Knopf, kein Block.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { arbeitsmappeBauen } = require("../hilfen/xlsx-bauen.js");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };

const HEUTE = "2026-10-06"; // Dienstag 07:30 -> Bericht über Mo., 05.10.: Früh / Spät / Nacht
const TAG = new Date(2026, 9, 5);
const PIVOT = () => arbeitsmappeBauen([{
  name: "Pivot",
  zeilen: [
    [], [], [], [null, "ab 60 % bis", 0.8], [], [], [], [], [], [],
    [null, null, null, "DREH", null, null, null, null, null, null, null, null, null, "Gesamt: Gutm.", "Gesamt: OEE_M", "Gesamt: OEE%n"],
    [null, "Datum/Schicht", null, "TS200", null, null, "TS320", null, null, "VSM1", null, null, null, null, null, null],
    [null, null, null, "Gutm.", "OEE_M", "OEE%n", "Gutm.", "OEE_M", "OEE%n", "Gutm.", "OEE_M", "OEE%n", null, null, null, null],
    [null, { datum: TAG }, null, 6818, 10371, { prozent: 0.657 }, 12785, 16941, { prozent: 0.755 }, 3990, 5832, { prozent: 0.684 }, null, 41539, 55337, { prozent: 0.751 }],
    [null, "FRÜH", null, 1927, 3514, { prozent: 0.548 }, 1750, 3388, { prozent: 0.516 }, 380, 632, { prozent: 0.602 }, null, 8844, 13375, { prozent: 0.661 }],
    [null, "MITTAG", null, null, null, null, 5400, 6776, { prozent: 0.797 }, 1195, 2000, { prozent: 0.598 }, null, 12483, 16240, { prozent: 0.769 }],
    [null, "NACHT", null, 4891, 6857, { prozent: 0.713 }, 5635, 6776, { prozent: 0.832 }, 2415, 3200, { prozent: 0.755 }, null, 20212, 25722, { prozent: 0.786 }],
    [null, "GES", null, 73689, 137740, { prozent: 0.535 }, 304865, 394262, { prozent: 0.773 }, 55759, 109718, { prozent: 0.508 }, null, 973491, 1416140, { prozent: 0.687 }],
  ],
}]);
const STOER = [
  { id: "s1", nr: "2026-0061", date: "2026-10-05", schicht: "Früh", anlage: "VSM1", stoerung: "Störung Brems Chopper", ursache: "?", offen: false, ausfallzeit: 20, melder: "XR", gemeldetAt: "2026-10-05T07:00:00.000Z" },
  { id: "s2", nr: "2026-0067", date: "2026-10-05", schicht: "Spät", anlage: "TS320", stoerung: "Kettenbahn", ursache: "Reflextaster", offen: false, ausfallzeit: 0, melder: "Kilic", gemeldetAt: "2026-10-05T15:00:00.000Z" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  /* Wie harte-40: gemeinsame Datei + Datenordner als Attrappe, die OEE-Tabelle
     liegt im Datenordner; die OEE-Quelle steht in der Konfiguration der Datei. */
  const seite = async ({ mitOee = true } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date(HEUTE + "T07:30:00"));
    await p.addInitScript(({ b64, stoer, mitOee }) => {
      const roh = atob(b64); const arr = new Uint8Array(roh.length); for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i);
      window.__kalender = JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: new Date().toISOString(), entries: [], deleted: {}, config: { tpmAnlagen: [], riItems: [], team: [], ...(mitOee ? { oee: { datei: "OEE_Auswertung.xlsx", blatt: "Pivot", kopfzeile: null, spalten: {} } } : {}) } });
      const jsonHandle = { name: "werkstatt-kalender-daten.json", kind: "file", async getFile() { return new File([window.__kalender], "werkstatt-kalender-daten.json", { type: "application/json" }); }, async createWritable() { let t = ""; return { async write(c) { t += c; }, async close() { window.__kalender = t; } }; }, async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } };
      const xlsxHandle = { name: "OEE_Auswertung.xlsx", kind: "file", async getFile() { return new File([arr], "OEE_Auswertung.xlsx", { lastModified: new Date("2026-10-06T06:12:00").getTime() }); }, async createWritable() { throw new Error("Schreiben verboten"); }, async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } };
      window.__ordnerHandle = { name: "Werkstatt", kind: "directory", async *entries() { yield ["werkstatt-kalender-daten.json", jsonHandle]; yield ["OEE_Auswertung.xlsx", xlsxHandle]; }, async getFileHandle(n) { if (n === "werkstatt-kalender-daten.json") return jsonHandle; if (n === "OEE_Auswertung.xlsx") return xlsxHandle; const e = new Error("NotFoundError"); e.name = "NotFoundError"; throw e; }, async removeEntry() {}, async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; } };
      window.showOpenFilePicker = async () => [jsonHandle];
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(stoer));
      window.__blatt = "";
      window.open = function () { return { document: { open() {}, write(h) { window.__blatt += h; }, close() {} }, focus() {}, print() {} }; };
    }, { b64: PIVOT().toString("base64"), stoer: STOER, mitOee });
    await p.goto(APP);
    await p.waitForTimeout(500);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(900);
    await p.locator('button[aria-label="Schließen"]').last().click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(200);
    await p.evaluate(() => window.__wkSharedTest.adoptFolder(window.__ordnerHandle));
    // OEE lesen lassen (Takt 60 s - der Fokus-Blick liest sofort)
    await p.waitForTimeout(400);
    await p.evaluate(() => { window.dispatchEvent(new Event("focus")); });
    if (mitOee) await p.waitForFunction(() => /OEE · letzte|OEE · Tag|OEE · gesamt|%/.test((document.querySelector("button[title*='OEE']") || {}).innerText || ""), null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(300);
    return { ctx, p, fehler };
  };
  const blattHolen = async (p) => {
    await p.getByRole("button", { name: /^Berichte\s*\d*$/i }).first().click(); await p.waitForTimeout(300);
    // Der Schichtbericht-Knopf sitzt im Reiter Störungen (der Bereich startet mit "Alle Berichte")
    await p.getByRole("button", { name: /^Störungen$/i }).first().click(); await p.waitForTimeout(300);
    await p.evaluate(() => { window.__blatt = ""; });
    await p.locator('button[aria-label="Schichtbericht anzeigen"]').click(); await p.waitForTimeout(500);
    return p.evaluate(() => window.__blatt);
  };
  const inSeite = async (ctx, html) => { const q = await ctx.newPage(); await q.setContent(html); await q.waitForTimeout(200); return q; };

  /* (O1)–(O5) mit OEE */
  const v = await seite();
  const html = await blattHolen(v.p);
  const q = await inSeite(v.ctx, html);
  const knopf = q.locator("button[data-oee-knopf]");
  const block = q.locator("#oeeblock");
  ok("(O1) Knopf „📊 OEE“ in der Kopfleiste mit Tageswert 75,1 %; der Block ist zu Beginn OFFEN",
    (await knopf.count()) === 1 && /Tag 75,1 %/.test(await knopf.innerText()) && (await block.count()) === 1 && !(await block.evaluate((el) => el.hasAttribute("hidden"))) && (await knopf.getAttribute("aria-expanded")) === "true", (await knopf.innerText().catch(() => "kein Knopf")).replace(/\s+/g, " "));
  const pitLinks = await q.evaluate(() => { const b = document.querySelector("button[data-pitliste-knopf]"); const t = document.querySelector("[data-tpm-tacho]"); const l = document.querySelector(".knopfleiste"); return b && t && l && b.getBoundingClientRect().left > t.getBoundingClientRect().right && b.getBoundingClientRect().right < l.getBoundingClientRect().left && !l.contains(b); });
  ok("(O1) Der PitStop-Knopf steht links neben der TPM-Quote, nicht mehr in der rechten Knopfleiste", pitLinks === true);
  const marken = await q.evaluate(() => [...document.querySelectorAll("[data-oee-marke]")].map((m) => `${m.dataset.oeeMarke}:${m.textContent.trim()}:${m.className.replace("oeeb", "").trim()}`));
  ok("(O2) Tagesblick: Gesamt-OEE je Schicht mit Ampel – Früh 66,1 % gelb, Spät (= MITTAG) 76,9 % gelb, Nacht 78,6 % gelb", marken.join("|") === "Früh:OEE 66,1 %:y|Spät:OEE 76,9 %:y|Nacht:OEE 78,6 %:y", marken.join(" | "));
  const kacheln = await q.evaluate(() => [...document.querySelectorAll("[data-oee-kachel]")].map((k) => k.dataset.oeeKachel));
  ok("(O3) Kacheln in Tabellen-Reihenfolge: TS200, TS320, VSM1, Gesamt", kacheln.join(",") === "TS200,TS320,VSM1,Gesamt", kacheln.join(","));
  const ts320 = await q.evaluate(() => { const k = document.querySelector('[data-oee-kachel="TS320"]'); const rows = [...k.querySelectorAll(".or")].filter((r) => !r.classList.contains("tag")); return { tag: k.querySelector(".on b").textContent.trim(), tagKl: k.querySelector(".on b").className, zeilen: rows.map((r) => `${r.querySelector(".ol").textContent}=${r.querySelector("b").textContent}:${r.querySelector(".ob i").className}:${r.querySelector(".ob i").style.width}`) }; });
  ok("(O3) TS320: Tag 75,5 % gelb; Früh 51,6 rot (Balken 51,6 %), Spät 79,7 gelb, Nacht 83,2 grün", ts320.tag === "75,5 %" && ts320.tagKl === "y" && ts320.zeilen.join("|") === "Früh=51,6:r:51.6%|Spät=79,7:y:79.7%|Nacht=83,2:g:83.2%", JSON.stringify(ts320));
  const ts200spaet = await q.evaluate(() => { const r = [...document.querySelectorAll('[data-oee-kachel="TS200"] .or')].find((x) => x.querySelector(".ol").textContent === "Spät"); return r.querySelector("b").textContent + ":" + r.querySelector(".ob i").style.width; });
  ok("(O3) TS200 Spät ohne Wert in der Tabelle: „–“ und leerer Balken", ts200spaet === "–:0%", ts200spaet);
  const vorKlick = await q.locator('[data-oee-kachel="TS200"] .or em').first().isVisible();
  await q.locator('[data-oee-kachel="TS200"]').click(); await q.waitForTimeout(150);
  const nachKlick = await q.evaluate(() => { const k = document.querySelector('[data-oee-kachel="TS200"]'); const em = k.querySelector(".or em"); return { sichtbar: getComputedStyle(em).display !== "none", text: em.textContent, tag: k.querySelector(".or.tag em").textContent }; });
  ok("(O4) Klick auf die Kachel zeigt Gutmenge / Soll: Früh 1.927 / 3.514, Tag 6.818 / 10.371 (vorher verborgen)", !vorKlick && nachKlick.sichtbar && nachKlick.text === "1.927 / 3.514" && nachKlick.tag === "6.818 / 10.371", JSON.stringify(nachKlick));
  await knopf.click(); await q.waitForTimeout(150);
  const zu = await block.evaluate((el) => el.hasAttribute("hidden"));
  await knopf.click(); await q.waitForTimeout(150);
  const auf = await block.evaluate((el) => !el.hasAttribute("hidden"));
  ok("(O5) Knopf schließt den Block und öffnet ihn wieder", zu && auf && (await knopf.getAttribute("aria-expanded")) === "true");

  /* (O7) Nachschau auf einen Tag ohne Zeilen */
  const html7 = await v.p.evaluate(() => window.__wkSchichtberichtFuer("2026-10-01"));
  const q7 = await inSeite(v.ctx, html7);
  ok("(O7) Nachschau 01.10. (nicht in der Tabelle): Hinweis „steht für diesen Tag (noch) nichts“, keine Kacheln, keine Marken",
    /steht für diesen Tag \(noch\) nichts/.test(await q7.locator("#oeeblock").innerText()) && (await q7.locator("[data-oee-kachel]").count()) === 0 && (await q7.locator("[data-oee-marke]").count()) === 0);
  ok("(E) Keine Skriptfehler", v.fehler.length === 0, v.fehler.slice(0, 2).join(" | "));
  await v.ctx.close();

  /* (O6) ohne OEE-Quelle */
  const o = await seite({ mitOee: false });
  const html6 = await blattHolen(o.p);
  ok("(O6) Ohne OEE-Quelle: kein Knopf, kein Block, keine Marken – der Bericht wie bisher (PitStop-Knopf links bleibt)",
    !/data-oee-knopf/.test(html6) && !/data-oeeblock/.test(html6) && !/data-oee-marke/.test(html6) && /data-pitliste-knopf/.test(html6));
  await o.ctx.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
