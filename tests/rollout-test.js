// ROLLOUT-TEST: Nicht "funktionieren die Bausteine", sondern "hält das der
// Einführung in einer echten Werkstatt stand". Geprüft wird aus Sicht dessen,
// der die App einführen und dafür geradestehen muss.
//
//  A  Bildschirmgrößen: Ist alles erreichbar, was man antippen können muss?
//  B  Erster Tag: Ein neuer Mensch öffnet die App - kommt er allein zurecht?
//  C  Zweiter Mensch stößt dazu und sieht dieselben Daten
//  D  Herausgabe von Daten (Geschäftsführung, Behörde, Nachweis)
//  E  Katastrophe: Datei gelöscht - kommt man wieder an seine Daten?
//  F  Nachweisfähigkeit der R+I-Pflichten (Prüfer steht in der Werkstatt)
//  G  Ausdrucke
//  H  Das Startpaket: enthält die ZIP wirklich den Stand, der hier liegt?
//  I  Neue Version einspielen, ohne die Datei neu anwählen zu müssen
//  J  Der Ausliefer-Dienst, echt gestartet
//  K  Der Kollege ohne Schreibrecht
//  L  Die zweite gemeinsame Datei (Störungen)
//  M  Hält die Doku, was sie verspricht?
//  N  Stimmt die Klickanleitung noch mit der App überein?
//
// Die Abschnitte H bis N sind neu: Sie prüfen nicht die App, sondern die
// Einführung selbst - Paket, Skripte, Anleitung. Genau dort ist bisher am
// meisten schiefgegangen (die ZIP war von Hand gepackt und wochenalt).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync, spawn } = require("child_process");

const WURZEL = "/home/user/WerkstattKalender";
const HTML = path.join(WURZEL, "Werkstatt_Kalender_TPM.html");
const APP = "file://" + HTML;
const PWSH = "/opt/pwsh/pwsh";

let ok = 0, fail = 0, warn = 0;
const check = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};
const merke = (n) => { console.log("HINWEIS | " + n); warn++; };

const drive = {};
async function mach(browser, { breite = 1400, hoehe = 1000, mobil = false, name = "", uhr = "2026-07-23T10:00:00" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: hoehe }, hasTouch: mobil, isMobile: mobil, acceptDownloads: true });
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

/* ---------- kleine Helfer für die Abschnitte H bis N ---------- */
const liesDatei = (p) => fs.readFileSync(path.join(WURZEL, p), "utf8");
// Eine Antwort holen, ohne einer Weiterleitung zu folgen: Genau die
// Weiterleitung ist hier der Prüfgegenstand.
const hole = (adresse, kopf = {}) => new Promise((fertig, schief) => {
  const a = http.get(adresse, { headers: kopf }, (r) => {
    let b = ""; r.setEncoding("utf8");
    r.on("data", (s) => { b += s; });
    r.on("end", () => fertig({ status: r.statusCode, kopf: r.headers, text: b }));
  });
  a.on("error", schief);
  a.setTimeout(8000, () => { a.destroy(new Error("Zeitüberschreitung")); });
});

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ================= A: Bildschirmgrößen ================= */
  console.log("\n--- A: Auf welchen Geräten ist die App bedienbar? ---");
  for (const [etikett, w, mobil] of [["Handy", 390, true], ["Tablet hoch", 768, true], ["Tablet quer", 1024, false], ["Werkstatt-PC", 1366, false], ["Büro", 1920, false]]) {
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
    check(`A: ${etikett} (${w} px) - Seite läuft nicht seitwärts über`, seitenUeberlauf <= 2, seitenUeberlauf + " px");

    // Die Linkreihe steht ganz oben in der Übersicht. Auf einem schmalen
    // Gerät darf sie weder überlaufen noch die Kennzahlen aus dem Bild
    // drängen - sonst hätte der Platz oben seinen Zweck verfehlt.
    await p.getByRole("button", { name: "Übersicht", exact: true }).first().click();
    await p.waitForTimeout(300);
    const reihe = await p.evaluate(() => {
      const k = document.querySelector('button[aria-label="Links & Dokumente"]');
      if (!k) return null;
      // Die Hülle des Streifens ist der Kasten mit dem dunklen Hintergrund.
      let e = k.parentElement;
      while (e && getComputedStyle(e).backgroundColor !== "rgb(44, 49, 55)") e = e.parentElement;
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { hoehe: Math.round(r.height), rechts: Math.round(r.right), fensterBreite: window.innerWidth };
    });
    // Auf einem schmalen Gerät darf der Streifen umbrechen - er darf nur nicht
    // seitwärts hinauslaufen und nicht den halben Bildschirm einnehmen.
    check(`A: ${etikett} (${w} px) - der Linkstreifen passt in die Breite`,
      reihe !== null && reihe.rechts <= reihe.fensterBreite + 2 && reihe.hoehe < 200,
      reihe ? `${reihe.hoehe} px hoch, rechte Kante ${reihe.rechts} von ${reihe.fensterBreite}` : "Streifen nicht gefunden");
    await p.close();
  }

  /* ================= B: Erster Tag ================= */
  console.log("\n--- B: Ein neuer Mensch öffnet die App zum ersten Mal ---");
  {
    const p = await mach(browser, {});
    const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
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
    check("B: Der erste Start wirft keinen Skriptfehler", fehler.length === 0, fehler.slice(0, 1).join(" "));
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

    // Ein Dritter kommt dazu - der Fall am Einführungstag, nicht der Sonderfall.
    const c = await mach(browser, { name: "S. Klein", uhr: "2026-07-23T10:09:10" });
    await c.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
    await c.waitForTimeout(800);
    const beiC = await c.evaluate(() => localStorage.getItem("werkstatt-kalender-entries") || "");
    check("C: Der dritte Arbeitsplatz sieht beides ohne Zutun",
      beiC.includes("Kompressor prüfen") && beiC.includes("Filter wechseln"));
    await a.close(); await b.close(); await c.close();
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
    await p.reload();
    await p.waitForTimeout(1300);

    // Bisher stand hier "hatExport || true" - das konnte nicht fehlschlagen und
    // hat deshalb nichts geprüft. Jetzt wird der Knopf wirklich gedrückt und
    // die herausgegebene Datei gelesen.
    const knopf = p.locator('button[aria-label="Export"]');
    check("D: Es gibt einen Knopf zum Herausgeben der Daten", (await knopf.count()) === 1);
    if (await knopf.count()) {
      const [ladung] = await Promise.all([
        p.waitForEvent("download", { timeout: 10000 }).catch(() => null),
        knopf.click(),
      ]);
      check("D: Der Knopf gibt wirklich eine Datei heraus", ladung !== null,
        ladung ? ladung.suggestedFilename() : "keine Datei angekommen");
      if (ladung) {
        const ziel = path.join(require("os").tmpdir(), "rollout-export.json");
        await ladung.saveAs(ziel);
        let gelesen = null;
        try { gelesen = JSON.parse(fs.readFileSync(ziel, "utf8")); } catch (e) { /* bleibt null */ }
        check("D: Die herausgegebene Datei ist lesbar und vollständig",
          Array.isArray(gelesen) && gelesen.some((e) => e.name === "Regalkontrolle") && gelesen.some((e) => e.name === "BTS"),
          Array.isArray(gelesen) ? gelesen.length + " Einträge" : "nicht lesbar");
        check("D: Der Dateiname sagt, was drin ist und von wann",
          /werkstatt-kalender-export-\d{4}-\d{2}-\d{2}\.json/.test(ladung.suggestedFilename()),
          ladung.suggestedFilename());
        fs.rmSync(ziel, { force: true });
      }
    }
    // Format prüfen: JSON ist für die Geschäftsführung unbrauchbar
    const formate = await p.evaluate(() => {
      const s = document.body.innerHTML;
      return { csv: /CSV|\.csv/i.test(s), excel: /Excel|xlsx/i.test(s) };
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
      await new Promise((r) => setTimeout(r, 500));
      // Sicherungen liegen seit der Reiter-Aufteilung hinter "Verlauf & Sicherung"
      const reiter = [...document.querySelectorAll("button")].find((k) => k.textContent.trim() === "Verlauf & Sicherung");
      if (reiter) reiter.click();
      await new Promise((r) => setTimeout(r, 500));
      return /sicherungen/i.test(document.body.innerText);
    });
    check("E: Es gibt lokale Sicherungen zum Wiederherstellen", sicherungen);
    // Nicht nur "es gibt Sicherungen", sondern: Steht wirklich etwas drin?
    // Eine leere Liste sähe an der Oberfläche genauso aus.
    const inhaltDerSicherung = await p.evaluate(() => new Promise((fertig) => {
      const a = indexedDB.open("werkstatt-kalender-fs", 2);
      a.onsuccess = () => {
        const db = a.result;
        const t = db.transaction("backups", "readonly").objectStore("backups").getAll();
        t.onsuccess = () => {
          db.close();
          const liste = t.result || [];
          fertig({ anzahl: liste.length, hatArbeit: liste.some((s) => JSON.stringify(s).includes("Sehr wichtige Arbeit")) });
        };
        t.onerror = () => { db.close(); fertig({ anzahl: -1, hatArbeit: false }); };
      };
      a.onerror = () => fertig({ anzahl: -1, hatArbeit: false });
    }));
    check("E: In den Sicherungen steht die verlorene Arbeit wirklich drin",
      inhaltDerSicherung.anzahl > 0 && inhaltDerSicherung.hatArbeit, JSON.stringify(inhaltDerSicherung));
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
    // Seit dem 18.08.: Reiter "Plan", die Auswertung ist eine Ausklappleiste.
    const hatAuswertung = (await p.getByRole("button", { name: "Plan", exact: true }).count()) > 0;
    check("F: Es gibt eine Auswertung, um Erledigtes nachzuweisen", hatAuswertung);
    if (hatAuswertung) {
      await p.getByRole("button", { name: "Plan", exact: true }).first().click();
      await p.waitForTimeout(500);
      await p.getByRole("button", { name: /Auswertung.*Druckvorlagen/ }).first().click();
      await p.waitForTimeout(700);
      const t = await p.locator("body").innerText();
      check("F: Die Auswertung zeigt zurückliegende Zeiträume", /2026|2025|Jahr/.test(t));
    }
    // Der Prüfer will ein Blatt in die Hand, keinen Bildschirm.
    await p.getByRole("button", { name: "Übersicht", exact: true }).first().click();
    await p.waitForTimeout(400);
    await p.locator('button[aria-label="Drucken"]').click();
    await p.waitForTimeout(500);
    check("F: Ein Nachweis zum Vorlegen lässt sich drucken",
      (await p.getByRole("button", { name: /^Prüfnachweis/ }).count()) === 1);
    check("F: Der Zeitraum dafür ist wählbar",
      (await p.locator('select[aria-label="Jahr des Prüfnachweises"] option').count()) >= 1);
    // Bevor jemand druckt, sieht er das Blatt - verkleinert, aber echt.
    check("F: Eine Vorschau des Blattes steht daneben",
      (await p.locator('iframe[aria-label="Druckvorschau"]').count()) === 1);
    await p.locator('div[role="dialog"] button[aria-label="Schließen"]').click();
    await p.waitForTimeout(200);
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

    // "no-print" als Klasse zu vergeben genügt nicht - die Regel muss auch
    // greifen. Im Druckbild darf die dunkle Menüleiste nicht auftauchen,
    // sonst ist die halbe Seite schwarz und die Patrone leer.
    await p.emulateMedia({ media: "print" });
    await p.waitForTimeout(300);
    const imDruck = await p.evaluate(() => {
      const el = document.querySelector(".no-print");
      return el ? getComputedStyle(el).display : "kein Element";
    });
    check("G: Im Druckbild sind die Bedienelemente wirklich ausgeblendet",
      imDruck === "none", "display: " + imDruck);
    await p.emulateMedia({ media: "screen" });
    await p.close();
  }

  /* ================= H: Das Startpaket ================= */
  console.log("\n--- H: Die ZIP, die auf die Rechner geht ---");
  {
    // Der teuerste Fehler dieser Einführung war eine von Hand gepackte ZIP mit
    // wochenaltem Inhalt: Die Anleitung versprach etwas, das im Paket nicht
    // drin war. Deshalb wird hier Datei für Datei verglichen, nicht das Datum.
    let aktuell = true, meldung = "";
    try { execFileSync("node", [path.join(WURZEL, "tools/startpaket-bauen.js"), "--pruefen"], { encoding: "utf8" }); }
    catch (e) { aktuell = false; meldung = (e.stdout || "") + (e.stderr || ""); }
    check("H: Die Start-ZIP ist auf dem Stand der Quelldateien", aktuell, meldung.trim().slice(0, 120));

    const zipInhalt = JSON.parse(execFileSync("python3", ["-c", `
import zipfile, json, hashlib
z = zipfile.ZipFile(${JSON.stringify(path.join(WURZEL, "arbeitsplatz/Werkstatt-Cockpit-Start.zip"))})
print(json.dumps({n: hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))
`], { encoding: "utf8" }));

    // Erwartet wird genau die Liste aus dem Bauwerkzeug - nicht mehr (sonst
    // schleppt das Paket Altlasten mit) und nicht weniger.
    const bauer = liesDatei("tools/startpaket-bauen.js");
    const erwartet = {};
    for (const m of bauer.matchAll(/^\s*"([^"]+)":\s*"([^"]+)",/gm)) erwartet[m[1]] = m[2];
    // Das Paket entpackt in einen Ordner "Cockpit" - genau so, wie die
    // Anleitung es beschreibt ("Ordner Cockpit auf den Rechner legen").
    const ORDNER_IM_PAKET = "Cockpit/";
    const dateienImZip = Object.keys(zipInhalt).filter((n) => !n.endsWith("/"));
    const fehlend = Object.keys(erwartet).filter((n) => !(ORDNER_IM_PAKET + n in zipInhalt));
    const zuviel = dateienImZip.filter((n) => !(n.replace(ORDNER_IM_PAKET, "") in erwartet));
    check("H: Die ZIP enthält genau die vorgesehenen Dateien", fehlend.length === 0 && zuviel.length === 0,
      `fehlt: ${fehlend.join(",") || "-"} / zuviel: ${zuviel.join(",") || "-"}`);
    check("H: Alles steckt im Ordner „Cockpit", dateienImZip.length > 0 && dateienImZip.every((n) => n.startsWith(ORDNER_IM_PAKET)),
      dateienImZip.filter((n) => !n.startsWith(ORDNER_IM_PAKET)).join(", ") || "ja");

    const crypto = require("crypto");
    const abweichend = [];
    let verglichen = 0;
    for (const [imPaket, imOrdner] of Object.entries(erwartet)) {
      const schluessel = ORDNER_IM_PAKET + imPaket;
      if (!(schluessel in zipInhalt)) continue;
      verglichen++;
      const roh = fs.readFileSync(path.join(WURZEL, "arbeitsplatz", imOrdner));
      if (crypto.createHash("sha256").update(roh).digest("hex") !== zipInhalt[schluessel]) abweichend.push(imPaket);
    }
    // Die Zahl der Vergleiche gehört in die Bedingung. Ohne sie wäre die
    // Prüfung grün, wenn gar nichts verglichen wurde - genau so hätte sie den
    // veralteten Paketinhalt von damals durchgewinkt.
    check("H: Jede Datei im Paket ist Byte für Byte die aus dem Ordner",
      abweichend.length === 0 && verglichen === Object.keys(erwartet).length,
      `${verglichen} von ${Object.keys(erwartet).length} verglichen` + (abweichend.length ? ", abweichend: " + abweichend.join(", ") : ""));

    // Kein Pfad eines Entwicklungsrechners darf mitreisen - er wäre auf jedem
    // Werkstatt-PC falsch und würde beim Öffnen sofort ins Leere zeigen.
    const verraeter = [];
    for (const datei of Object.values(erwartet)) {
      const t = fs.readFileSync(path.join(WURZEL, "arbeitsplatz", datei), "utf8");
      if (/\/home\/[a-z]+\//i.test(t) || /C:\\Users\\/i.test(t)) verraeter.push(datei);
    }
    check("H: Keine persönlichen Pfade im Paket", verraeter.length === 0, verraeter.join(", "));

    const liesmich = liesDatei("arbeitsplatz/LIESMICH.txt");
    check("H: Die LIESMICH nennt den Starter, den es wirklich gibt",
      liesmich.includes("Cockpit starten") && fs.existsSync(path.join(WURZEL, "arbeitsplatz/Cockpit starten.cmd")));

    // Bewusst KEINE Prüfung auf Windows-Zeilenenden: Die .cmd-Dateien laufen
    // am Arbeitsplatz nachweislich mit den Zeilenenden, die sie haben. Eine
    // Warnung, die bei funktionierender Software angeht, bringt nur bei, sie
    // zu überlesen.
  }

  /* ================= I: Neue Version einspielen ================= */
  console.log("\n--- I: Neue Version in den Ordner legen ---");
  {
    // Das Versprechen aus der Roll-out-Liste: HTML austauschen, F5, fertig -
    // niemand muss die JSON neu anwählen. Der Browser bindet seinen Speicher
    // an den URSPRUNG, nicht an den Dateinamen. Hier wird das ausgeführt.
    const echt = fs.readFileSync(HTML, "utf8");
    let ausgeliefert = echt.replace("</head>", "<!--version-alt--></head>");
    const dienst = http.createServer((a, r) => {
      r.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      r.end(ausgeliefert);
    });
    await new Promise((r) => dienst.listen(0, "127.0.0.1", r));
    const hafen = dienst.address().port;

    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const p = await ctx.newPage();
    await p.exposeFunction("__lies", () => JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: null }));
    await p.exposeFunction("__schreib", () => {});
    await p.addInitScript(() => {
      window.__mk = (name) => ({
        name, kind: "file",
        async getFile() { return new File([await window.__lies()], name, { type: "application/json" }); },
        async createWritable() { return { async write() {}, async close() {} }; },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      });
    });
    await p.goto(`http://localhost:${hafen}/`);
    await p.waitForTimeout(1200);
    check("I: Vor dem Wechsel läuft die alte Version",
      (await p.content()).includes("version-alt"));

    await p.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("werkstatt-kalender-daten.json"), "readwrite"));
    await p.evaluate(async () => {
      await window.storage.set("werkstatt-kalender-entries", JSON.stringify([
        { id: "vorher", date: "2026-07-22", category: "ARBEIT", name: "Vor dem Versionswechsel", status: "open" },
      ]));
    });
    await p.waitForTimeout(900);

    // Der gemerkte Dateiverweis liegt in der IndexedDB "werkstatt-kalender-fs",
    // Fach "handles". Ein echter Verweis lässt sich im Test nicht nachbilden -
    // er ist ein Sonderobjekt des Browsers und nicht kopierbar. Deshalb wird
    // hier derselbe Eintrag an genau derselben Stelle abgelegt wie die App ihn
    // ablegt. Geprüft wird damit das, worauf das Versprechen beruht: dass
    // dieser Speicher am Ursprung hängt und nicht an der HTML-Datei.
    const lege = () => p.evaluate(() => new Promise((fertig) => {
      const a = indexedDB.open("werkstatt-kalender-fs", 2);
      a.onsuccess = () => {
        const db = a.result;
        const s = db.transaction("handles", "readwrite").objectStore("handles");
        s.put("readwrite", "mode");
        s.put("werkstatt-kalender-daten.json", "name");
        db.transaction("handles", "readwrite").oncomplete = null;
        setTimeout(() => { db.close(); fertig(true); }, 150);
      };
      a.onerror = () => fertig(false);
    }));
    const liesGemerkt = (seite) => seite.evaluate(() => new Promise((fertig) => {
      const a = indexedDB.open("werkstatt-kalender-fs", 2);
      a.onsuccess = () => {
        const db = a.result;
        const t = db.transaction("handles", "readonly").objectStore("handles").get("mode");
        t.onsuccess = () => { db.close(); fertig(t.result || null); };
        t.onerror = () => { db.close(); fertig(null); };
      };
      a.onerror = () => fertig(null);
    }));
    await lege();
    check("I: Der Zugang zur Datei ist gemerkt", (await liesGemerkt(p)) === "readwrite", String(await liesGemerkt(p)));

    // ---- Jetzt der Austausch: neue Datei in den Ordner, Seite neu laden ----
    ausgeliefert = echt.replace("</head>", "<!--version-neu--></head>");
    await p.reload();
    await p.waitForTimeout(1400);

    check("I: Nach dem Austausch läuft die neue Version",
      (await p.content()).includes("version-neu") && !(await p.content()).includes("version-alt"));
    check("I: Die Daten sind nach dem Versionswechsel noch da",
      (await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries") || "")).includes("Vor dem Versionswechsel"));
    const gemerktNachher = await liesGemerkt(p);
    check("I: Der gemerkte Zugang überlebt den Versionswechsel - kein neues Anwählen",
      gemerktNachher === "readwrite", String(gemerktNachher));
    check("I: Es erscheint keine Aufforderung, die Datei neu auszusuchen",
      !/Bitte einmal auswählen|Datei auswählen …/.test(await p.locator("body").innerText()));

    // ---- Gegenprobe: dieselbe Seite über 127.0.0.1 ist ein FREMDER Ursprung ----
    // Genau deshalb leitet der Ausliefer-Dienst auf localhost um. Ohne diese
    // Messung wäre die Umleitung eine Behauptung.
    const q = await ctx.newPage();
    await q.goto(`http://127.0.0.1:${hafen}/`);
    await q.waitForTimeout(1200);
    const beiIp = await q.evaluate(() => ({
      eintraege: localStorage.getItem("werkstatt-kalender-entries") || "",
    }));
    const gemerktBeiIp = await liesGemerkt(q);
    check("I: Über 127.0.0.1 ist der Speicher leer - die Umleitung ist nötig",
      !beiIp.eintraege.includes("Vor dem Versionswechsel") && gemerktBeiIp === null,
      `Daten: ${beiIp.eintraege ? "vorhanden" : "leer"}, gemerkter Zugang: ${String(gemerktBeiIp)}`);
    await ctx.close();
    await new Promise((r) => dienst.close(r));
  }

  /* ================= J: Der Ausliefer-Dienst, echt gestartet ================= */
  console.log("\n--- J: Der Ausliefer-Dienst auf dem Arbeitsplatz ---");
  if (!fs.existsSync(PWSH)) {
    merke("J: PowerShell nicht gefunden - der Dienst wurde nicht ausgeführt");
  } else {
    const ordner = fs.mkdtempSync(path.join(require("os").tmpdir(), "rollout-dienst-"));
    // Zwei Versionen im Ordner: Der Dienst muss die NEUERE ausliefern - genau
    // das ist der Ablauf beim Verteilen (neue rein, alte liegt noch da).
    fs.writeFileSync(path.join(ordner, "Werkstatt_Kalender_TPM_alt.html"), "<html><body>alte version</body></html>");
    await new Promise((r) => setTimeout(r, 1100));
    fs.writeFileSync(path.join(ordner, "Werkstatt_Kalender_TPM.html"), "<html><body>neue version</body></html>");

    const lauf = spawn(PWSH, ["-NoProfile", "-File", path.join(WURZEL, "arbeitsplatz/cockpit-server.ps1"),
      "-Ordner", ordner, "-Port", "18765", "-KeinBrowser"], { stdio: ["ignore", "pipe", "pipe"] });
    let ausgabe = "";
    lauf.stdout.on("data", (d) => { ausgabe += d.toString(); });
    lauf.stderr.on("data", (d) => { ausgabe += d.toString(); });

    let adresse = null;
    for (let i = 0; i < 40 && !adresse; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const m = ausgabe.match(/http:\/\/localhost:(\d+)\//);
      if (m) adresse = { basis: `http://localhost:${m[1]}`, ip: `http://127.0.0.1:${m[1]}` };
    }
    check("J: Der Dienst startet und nennt seine Adresse", adresse !== null, ausgabe.trim().split("\n").slice(-2).join(" | "));

    if (adresse) {
      await new Promise((r) => setTimeout(r, 600));
      const start = await hole(adresse.basis + "/").catch((e) => ({ status: 0, text: e.message, kopf: {} }));
      check("J: Er liefert eine Seite aus", start.status === 200, "Status " + start.status);
      check("J: Und zwar die NEUESTE Datei im Ordner, nicht die alte",
        /neue version/.test(start.text) && !/alte version/.test(start.text));

      const ueberIp = await hole(adresse.ip + "/").catch((e) => ({ status: 0, kopf: {}, text: e.message }));
      check("J: 127.0.0.1 wird auf localhost umgeleitet - sonst geht die Verbindung zur Datei verloren",
        ueberIp.status === 302 && /^http:\/\/localhost:/.test(ueberIp.kopf.location || ""),
        `Status ${ueberIp.status}, Ziel ${ueberIp.kopf.location || "-"}`);

      // Die Zugangsprüfung von /__oeffne: Eine Anfrage ohne die Kopfzeile
      // "Sec-Fetch-Site: same-origin" kommt nicht von der eigenen Seite. Eine
      // Seite kann diese Kopfzeile nicht fälschen - deshalb trägt sie die Tür.
      const fremd = await hole(adresse.basis + "/__oeffne?pfad=" + encodeURIComponent("C:\\Windows\\System32\\calc.exe"))
        .catch((e) => ({ status: 0, text: e.message }));
      check("J: /__oeffne weist eine Anfrage ohne eigene Herkunft ab",
        fremd.status === 403, "Status " + fremd.status);

      const nichtDa = await hole(adresse.basis + "/gibtesnicht.html").catch((e) => ({ status: 0 }));
      check("J: Eine unbekannte Adresse endet sauber mit 404", nichtDa.status === 404, "Status " + nichtDa.status);
    }
    lauf.kill("SIGKILL");
    fs.rmSync(ordner, { recursive: true, force: true });
  }

  /* ================= K: Der Kollege ohne Schreibrecht ================= */
  console.log("\n--- K: Ein Kollege hat nur Leserecht auf die Datei ---");
  {
    drive["nurlesen.json"] = JSON.stringify({
      format: "werkstatt-kalender-v1", savedAt: "2026-07-23T08:00:00.000Z",
      entries: [
        { id: "sicht1", date: "2026-07-24", category: "ARBEIT", name: "Kompressor prüfen", status: "open", updatedAt: "2026-07-23T08:00:00.000Z" },
        { id: "config|links", updatedAt: "2026-07-23T08:00:00.000Z", value: { inhaber: ["RC", "AR"], eintraege: [{ id: "l1", inhaber: "RC", name: "Interne Preisliste", ziel: "intranet.firma.de/preise", symbol: "🔗" }] } },
      ],
      deleted: {}, config: null,
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const p = await ctx.newPage();
    await p.exposeFunction("__lies", (n) => drive[n] ?? "");
    await p.addInitScript(() => {
      window.__mkLesen = (name) => ({
        name, kind: "file",
        async getFile() { return new File([await window.__lies(name)], name, { type: "application/json" }); },
        async createWritable() { throw new DOMException("Kein Schreibrecht", "NotAllowedError"); },
        async queryPermission(o) { return (o && o.mode === "readwrite") ? "denied" : "granted"; },
        async requestPermission(o) { return (o && o.mode === "readwrite") ? "denied" : "granted"; },
      });
    });
    await p.goto(APP);
    await p.waitForTimeout(1000);
    await p.evaluate(async () => await window.__wkSharedTest.adopt(window.__mkLesen("nurlesen.json"), "read"));
    await p.waitForTimeout(1400);

    const vorher = drive["nurlesen.json"];
    check("K: Der Nur-Leser sieht die gemeinsamen Daten",
      (await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries") || "")).includes("Kompressor prüfen"));
    check("K: Er sieht die Linksammlung der Bearbeiter NICHT",
      (await p.locator('button[aria-label="Links & Dokumente"]').count()) === 0);
    check("K: Auch der Name des Links steht nicht in der Seite",
      !/Interne Preisliste/.test(await p.content()));
    check("K: Es gibt keinen Export-Knopf, der volle Bearbeiterrechte vortäuscht",
      (await p.locator('button[aria-label="Export"]').count()) === 0);
    check("K: Die gemeinsame Datei wurde dabei nicht verändert", drive["nurlesen.json"] === vorher);
    await ctx.close();
  }

  /* ================= L: Die zweite gemeinsame Datei ================= */
  console.log("\n--- L: Störungen laufen über eine eigene Datei ---");
  {
    drive["stoerungen.json"] = JSON.stringify({ format: "werkstatt-stoerungen-v1", savedAt: null, entries: [], deleted: {}, config: null });
    const a = await mach(browser, { name: "R. Ciraci", uhr: "2026-07-23T11:00:00" });
    const b = await mach(browser, { name: "M. Weber", uhr: "2026-07-23T11:02:00" });
    for (const s of [a, b]) {
      await s.evaluate(async () => await window.__wkStoerTest.adopt(window.__mk("stoerungen.json"), "readwrite"));
      await s.waitForTimeout(500);
    }
    // Störungen laufen NICHT über window.storage - das führt nur die
    // Kalender-Datei. Sie gehen über die zweite Instanz, denselben Weg, den
    // die Melden-Maske nimmt.
    await a.evaluate(async () => {
      const neu = [{ id: "st1", datum: "2026-07-23", anlage: "Presse 3", anlagenteil: "Hydraulik", stoerung: "Druck fällt ab", status: "offen", schicht: "Früh" }];
      await window.__wkStoerTest.save(neu, []);
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(neu));
    });
    await a.waitForTimeout(700);
    let daBeiB = false;
    for (let i = 0; i < 12 && !daBeiB; i++) {
      await b.evaluate(() => window.__wkStoerTest.poll());
      await b.waitForTimeout(400);
      daBeiB = (await b.evaluate(() => localStorage.getItem("werkstatt-stoerungen-entries") || "")).includes("Druck fällt ab");
    }
    check("L: Eine gemeldete Störung erreicht den zweiten Arbeitsplatz", daBeiB);
    check("L: Sie steht in der Störungs-Datei, nicht in der Kalender-Datei",
      (drive["stoerungen.json"] || "").includes("Druck fällt ab") &&
      !(drive["kalender-daten.json"] || "").includes("Druck fällt ab"));
    check("L: Die beiden Dateien haben getrennte Formate",
      JSON.parse(drive["stoerungen.json"]).format === "werkstatt-stoerungen-v1");
    await a.close(); await b.close();
  }

  /* ================= M: Hält die Doku, was sie verspricht? ================= */
  console.log("\n--- M: Anleitungen und Verweise ---");
  {
    // Ein toter Verweis in der Anleitung kostet einen Anruf. Hier werden alle
    // Verweise auf Dateien dieses Ordners nachgeschlagen.
    const quellen = ["README.md", "ROLLOUT-LISTE.md", "doku/ANLEITUNG.md", "arbeitsplatz/Anleitung-Arbeitsplatz.md"];
    const tot = [];
    for (const q of quellen) {
      if (!fs.existsSync(path.join(WURZEL, q))) { tot.push(q + " (Quelle fehlt)"); continue; }
      const text = liesDatei(q);
      for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const ziel = m[1].split("#")[0].trim();
        if (!ziel || /^(https?:|mailto:)/i.test(ziel)) continue;
        const absolut = path.resolve(path.dirname(path.join(WURZEL, q)), decodeURIComponent(ziel));
        if (!fs.existsSync(absolut)) tot.push(`${q} → ${ziel}`);
      }
    }
    check("M: Alle Verweise in der Doku zeigen auf Dateien, die es gibt", tot.length === 0, tot.join(" ; "));

    // Die Klickanleitung ist das Blatt, das an die Mail kommt. Vier Seiten
    // liest niemand - deshalb wurde sie auf eine gekürzt, und das bleibt so.
    const pdf = path.join(WURZEL, "doku/Werkstatt-Cockpit-Einrichtung.pdf");
    check("M: Die Klickanleitung als PDF liegt bereit", fs.existsSync(pdf));
    if (fs.existsSync(pdf)) {
      const roh = fs.readFileSync(pdf, "latin1");
      const seiten = (roh.match(/\/Type\s*\/Page[^s]/g) || []).length;
      check("M: Sie ist eine einzige Seite", seiten === 1, seiten + " Seiten");
    }

    // Der Ordnername steht an genau einer Stelle im Erzeuger. Weicht die
    // Roll-out-Liste davon ab, verschickt jemand eine Anleitung mit dem
    // falschen Ordner - und zehn Kollegen suchen vergeblich.
    const ordnerImErzeuger = (liesDatei("tools/klickanleitung.js").match(/const ORDNER = "([^"]+)"/) || [])[1];
    check("M: Der Ordnername der Anleitung ist eindeutig hinterlegt", !!ordnerImErzeuger, String(ordnerImErzeuger));
    if (ordnerImErzeuger) {
      check("M: Die Roll-out-Liste nennt denselben Ordnernamen",
        liesDatei("ROLLOUT-LISTE.md").includes("`" + ordnerImErzeuger + "`"), ordnerImErzeuger);
    }

    // Die Prüfschritte aus dem README müssen es geben - sonst prüft niemand.
    const readme = liesDatei("README.md");
    const versprochen = ["tests/run-hardness-tests.sh", "tests/smoke-test.js", "tests/rollout-test.js",
      "tests/pruefe-verknuepfung.ps1", "tests/pruefe-oeffnen.ps1", "tools/startpaket-bauen.js"];
    const fehlen = versprochen.filter((f) => readme.includes(f) && !fs.existsSync(path.join(WURZEL, f)));
    check("M: Jede im README genannte Prüfung gibt es auch", fehlen.length === 0, fehlen.join(", "));
  }

  /* ================= N: Anleitung gegen Wirklichkeit ================= */
  console.log("\n--- N: Beschreibt die Klickanleitung die App von heute? ---");
  {
    // Hier NICHT über mach(): Das nimmt der Seite absichtlich die
    // Dateiauswahl weg. Der Dialog zeigt dann die Ersatzmeldung für alte
    // Browser statt der Schritte, die auf dem Blatt stehen - und der Test
    // hätte die Anleitung gegen einen Sonderfall geprüft.
    const ctxN = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const p = await ctxN.newPage();
    await p.addInitScript(() => {
      const h = {
        name: "werkstatt-kalender-daten.json", kind: "file",
        async getFile() { return new File(["{}"], "werkstatt-kalender-daten.json", { type: "application/json" }); },
        async createWritable() { return { async write() {}, async close() {} }; },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [h];
      window.showSaveFilePicker = async () => h;
    });
    await p.goto(APP);
    await p.waitForTimeout(1100);
    // Die Anleitung sagt: "Oben rechts auf das Ordner-Symbol". Wandert der
    // Knopf, führt das Blatt in die Irre - und niemand merkt es, weil das
    // Blatt schon in zwanzig Postfächern liegt.
    const lage = await p.evaluate(() => {
      const b = document.querySelector('button[aria-label="Gemeinsame Datei"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left, y: r.top, breite: window.innerWidth, hoehe: window.innerHeight };
    });
    check("N: Es gibt das Ordner-Symbol, von dem die Anleitung spricht", lage !== null);
    if (lage) {
      check("N: Es sitzt oben rechts, wie beschrieben",
        lage.x > lage.breite * 0.6 && lage.y < 120,
        `x=${Math.round(lage.x)} von ${lage.breite}, y=${Math.round(lage.y)}`);
    }
    // Und der Text im Dialog, den die Anleitung wörtlich zitiert.
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.waitForTimeout(600);
    const dialog = await p.locator("body").innerText();
    check("N: Der Dialog enthält den zitierten Punkt „Vorhandene Datei öffnen …“",
      dialog.includes("Vorhandene Datei öffnen"));
    check("N: Und den Weg für die allererste Einrichtung",
      /Neue Datei|neu anlegen|Neue gemeinsame/i.test(dialog), dialog.slice(0, 0));
    await ctxN.close();
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log(`ROLLOUT-TEST: ${ok} PASS / ${fail} FAIL / ${warn} HINWEISE`);
  console.log("=".repeat(64));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
