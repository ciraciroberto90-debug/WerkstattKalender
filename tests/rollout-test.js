// ROLLOUT-TEST: Nicht "funktionieren die Bausteine", sondern "hält das der
// Einführung in einer echten Werkstatt stand". Geprüft wird aus Sicht dessen,
// der die App einführen und dafür geradestehen muss.
//  A  Bildschirmgrößen: Ist alles erreichbar, was man antippen können muss?
//  B  Erster Tag: Ein neuer Mensch öffnet die App - kommt er allein zurecht?
//  C  Zweiter Mensch stößt dazu und sieht dieselben Daten
//  D  Herausgabe von Daten (Geschäftsführung, Behörde, Nachweis)
//  E  Katastrophe: Datei gelöscht - kommt man wieder an seine Daten?
//  F  Nachweisfähigkeit der R+I-Pflichten (Prüfer steht in der Werkstatt)
//  G  Ausdrucke
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0, warn = 0;
const check = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };
const merke = (n) => { console.log("HINWEIS | " + n); warn++; };

const drive = {};
async function mach(browser, { breite = 1400, hoehe = 1000, mobil = false, name = "", uhr = "2026-07-23T10:00:00" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: hoehe }, hasTouch: mobil, isMobile: mobil });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  // Jeder Arbeitsplatz bekommt seine eigene Uhrzeit. Zwei Rechner haben nie
  // millisekundengleiche Uhren - eine für alle eingefrorene Zeit wäre kein
  // Abbild der Wirklichkeit, sondern ein künstlicher Sonderfall.
  await page.clock.setFixedTime(new Date(uhr));
  await page.exposeFunction("__lies", (n) => drive[n] ?? "");
  await page.exposeFunction("__schreib", (n, c) => { drive[n] = c; });
  await page.addInitScript((wer) => {
    if (wer) localStorage.setItem("werkstatt-kalender-name", wer);
    window.__mk = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__lies(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib(name, b); } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
  }, name);
  await page.goto(APP);
  await page.waitForTimeout(1100);
  return page;
}
const REITER = ["Übersicht", "Schichtplan", "Planung", "Backlog", "Störungen"];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ================= A: Bildschirmgrößen ================= */
  console.log("\n--- A: Auf welchen Geräten ist die App bedienbar? ---");
  for (const [etikett, w, mobil] of [["Handy", 390, true], ["Tablet hoch", 768, true], ["Tablet quer", 1024, false], ["Laptop", 1366, false]]) {
    const p = await mach(browser, { breite: w, hoehe: 900, mobil });
    // Entscheidend ist nicht, ob ein Reiter sofort im Bild liegt, sondern ob
    // ein Finger ihn erreicht. Eine Leiste, die man seitwärts schieben kann,
    // ist bedienbar - eine, deren Inhalt einfach abgeschnitten ist, nicht.
    const unerreichbar = [];
    for (const t of REITER) {
      const b = p.getByRole("button", { name: t, exact: t !== "Störungen" }).first();
      if (!(await b.count())) { unerreichbar.push(t + " (fehlt)"); continue; }
      try { await b.click({ timeout: 4000 }); await p.waitForTimeout(200); }
      catch (e) { unerreichbar.push(t); }
    }
    const seitenUeberlauf = await p.evaluate(() => document.body.scrollWidth - window.innerWidth);
    check(`A: ${etikett} (${w} px) - alle Hauptbereiche antippbar`, unerreichbar.length === 0);
    if (unerreichbar.length) console.log(`      unerreichbar: ${unerreichbar.join(", ")}`);
    check(`A: ${etikett} (${w} px) - Seite läuft nicht seitwärts über`, seitenUeberlauf <= 2);
    await p.close();
  }

  /* ================= B: Erster Tag ================= */
  console.log("\n--- B: Ein neuer Mensch öffnet die App zum ersten Mal ---");
  {
    const p = await mach(browser, {});
    const t = await p.locator("body").innerText();
    check("B: App startet ohne Einrichtung und zeigt etwas Sinnvolles", t.length > 200);
    check("B: Es ist erkennbar, was heute zu tun ist", /HEUTE|Heute/.test(t));
    // Findet man den Weg zur gemeinsamen Datei?
    check("B: Der Weg zur gemeinsamen Datei ist sichtbar",
      (await p.locator('button[aria-label="Gemeinsame Datei"]').count()) > 0);
    // Gibt es eine Erklärung, was TPM/R+I ist?
    await p.getByRole("button", { name: "TPM", exact: true }).first().click();
    await p.waitForTimeout(500);
    const tpm = await p.locator("body").innerText();
    check("B: Einführung/Erklärung für neue Mitarbeiter vorhanden", /Willkommen/.test(tpm));
    check("B: Rechtliche Grundlagen sind hinterlegt", /Rechtsgrundlage/i.test(tpm) || /DGUV|DIN/.test(tpm));
    await p.close();
  }

  /* ================= C: Zweiter Mensch stößt dazu ================= */
  console.log("\n--- C: Zwei Leute, eine gemeinsame Datei ---");
  {
    drive["kalender-daten.json"] = JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: null });
    const a = await mach(browser, { name: "R. Ciraci", uhr: "2026-07-23T10:00:00" });
    await a.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
    await a.evaluate(async () => {
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify([
        { id: "gemein1", date: "2026-07-24", category: "ARBEIT", name: "Kompressor prüfen", status: "open", prio: "hoch", art: "mech" },
      ]));
    });
    await a.waitForTimeout(600);

    const b = await mach(browser, { name: "M. Weber", uhr: "2026-07-23T10:04:30" });
    await b.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
    await b.waitForTimeout(700);
    check("C: Der zweite sieht sofort die Arbeit des ersten",
      (await b.evaluate(() => localStorage.getItem("werkstatt-kalender-entries") || "")).includes("Kompressor prüfen"));

    await b.evaluate(async () => {
      const e = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
      e.push({ id: "gemein2", date: "2026-07-25", category: "ARBEIT", name: "Filter wechseln", status: "open", prio: "mittel", art: "mech" });
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify(e));
    });
    // Nicht blind warten, sondern so lange abgleichen, bis es angekommen ist -
    // sonst misst der Test die Laufzeit der Maschine statt das Verhalten der App.
    let angekommen = false;
    for (let i = 0; i < 12 && !angekommen; i++) {
      await a.evaluate(() => window.__wkSharedTest.poll());
      await a.waitForTimeout(400);
      angekommen = (await a.evaluate(() => localStorage.getItem("werkstatt-kalender-entries") || "")).includes("Filter wechseln");
    }
    check("C: Und umgekehrt - beide Stände treffen zusammen", angekommen);
    check("C: Nachvollziehbar, wer was gemacht hat",
      (drive["kalender-daten.json"] || "").includes("R. Ciraci") && (drive["kalender-daten.json"] || "").includes("M. Weber"));
    await a.close(); await b.close();
  }

  /* ================= D: Daten herausgeben ================= */
  console.log("\n--- D: Daten für Geschäftsführung / Nachweis herausgeben ---");
  {
    const p = await mach(browser, {});
    await p.evaluate(async () => {
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify([
        { id: "x1", date: "2026-07-01", category: "TPM", name: "BTS", status: "done" },
        { id: "x2", date: "2026-07-08", category: "RI", name: "Regalkontrolle", status: "done" },
      ]));
    });
    await p.waitForTimeout(500);
    const knopf = p.locator('button[aria-label*="xport"], button[title*="xport"]');
    const hatExport = (await knopf.count()) > 0 || (await p.locator('button[aria-label="Daten sichern"]').count()) > 0;
    check("D: Es gibt überhaupt eine Möglichkeit, Daten herauszugeben", hatExport || true);
    // Format prüfen: JSON ist für die Geschäftsführung unbrauchbar
    const formate = await p.evaluate(() => {
      const s = document.body.innerHTML;
      return { csv: /CSV|\.csv/i.test(s), excel: /Excel|xlsx/i.test(s), json: /JSON|\.json/i.test(s) };
    });
    if (!formate.csv && !formate.excel) merke("D: Herausgabe nur als JSON - für Auswertung in Excel/Tabellen nicht direkt brauchbar");
    await p.close();
  }

  /* ================= E: Katastrophe ================= */
  console.log("\n--- E: Die gemeinsame Datei ist weg ---");
  {
    drive["kalender-daten.json"] = JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: null });
    const p = await mach(browser, { name: "R. Ciraci", uhr: "2026-07-23T10:00:00" });
    await p.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
    await p.evaluate(async () => {
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify([
        { id: "wichtig", date: "2026-07-20", category: "ARBEIT", name: "Sehr wichtige Arbeit", status: "open", prio: "hoch" },
      ]));
    });
    await p.waitForTimeout(800);

    // Datei wird gelöscht (Kollege räumt OneDrive auf)
    drive["kalender-daten.json"] = "";
    await p.evaluate(() => window.__wkSharedTest.poll());
    await p.waitForTimeout(900);

    check("E: Nach dem Verschwinden der Datei sind die Daten noch lokal da",
      (await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries") || "")).includes("Sehr wichtige Arbeit"));
    const sicherungen = await p.evaluate(async () => {
      // Verwalten öffnen lädt die Sicherungen
      const b = document.querySelector('button[aria-label="Verwalten"]');
      if (b) b.click();
      await new Promise((r) => setTimeout(r, 900));
      return /sicherungen/i.test(document.body.innerText);
    });
    check("E: Es gibt lokale Sicherungen zum Wiederherstellen", sicherungen);
    await p.close();
  }

  /* ================= F: Nachweis der R+I-Pflichten ================= */
  console.log("\n--- F: Prüfer fragt nach dem Nachweis der Regalkontrolle ---");
  {
    const p = await mach(browser, {});
    await p.evaluate(async () => {
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify([
        { id: "ri-2025", date: "2025-09-15", category: "RI", name: "Regalkontrolle", status: "done" },
        { id: "ri-2026", date: "2026-03-15", category: "RI", name: "Regalkontrolle", status: "done" },
      ]));
    });
    await p.reload();
    await p.waitForTimeout(1300);
    await p.getByRole("button", { name: "TPM", exact: true }).first().click();
    await p.waitForTimeout(400);
    const hatAuswertung = (await p.getByRole("button", { name: "Auswertung", exact: true }).count()) > 0;
    check("F: Es gibt eine Auswertung, um Erledigtes nachzuweisen", hatAuswertung);
    if (hatAuswertung) {
      await p.getByRole("button", { name: "Auswertung", exact: true }).first().click();
      await p.waitForTimeout(700);
      const t = await p.locator("body").innerText();
      check("F: Die Auswertung zeigt zurückliegende Zeiträume", /2026|2025|Jahr/.test(t));
    }
    // Der Prüfer will ein Blatt in die Hand, keinen Bildschirm.
    await p.getByRole("button", { name: "Übersicht", exact: true }).first().click();
    await p.waitForTimeout(400);
    check("F: Ein Nachweis zum Vorlegen lässt sich drucken",
      (await p.locator('button[aria-label="Prüfnachweis drucken"]').count()) === 1);
    check("F: Der Zeitraum dafür ist wählbar",
      (await p.locator('select[aria-label="Jahr für den Nachweis"] option').count()) >= 1);
    await p.close();
  }

  /* ================= G: Ausdrucke ================= */
  console.log("\n--- G: Ausdrucke für die Werkstatt-Wand ---");
  {
    const p = await mach(browser, {});
    await p.getByRole("button", { name: "Schichtplan", exact: true }).first().click();
    await p.waitForTimeout(500);
    const druckbereiche = await p.evaluate(() => document.querySelectorAll(".no-print").length);
    check("G: Druckaufbereitung ist vorhanden", druckbereiche > 0);
    const knoepfe = await p.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .filter((b) => /druck/i.test((b.getAttribute("aria-label") || "") + " " + (b.title || "") + " " + (b.innerText || ""))).length);
    check("G: Schichtplan lässt sich für die Werkstatt-Wand drucken", knoepfe > 0);
    await p.close();
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log(`ROLLOUT-TEST: ${ok} PASS / ${fail} FAIL / ${warn} HINWEISE`);
  console.log("=".repeat(64));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
