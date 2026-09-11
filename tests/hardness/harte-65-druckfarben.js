// Härtetest: DRUCKVORLAGEN DRUCKEN IHRE FARBEN WIRKLICH (Robertos Fund vom
// 09.09.: Der Schichtplan kam teils ohne Farbe aus dem Drucker, obwohl am
// Drucker Farbdruck gewählt war).
//
// Gemessene Wurzel: Das Chromium-Druckwerk (dasselbe arbeitet im Electron-
// Programm) lässt HINTERGRUNDFARBEN beim Drucken standardmäßig weg - nur
// Text und Ränder kommen aufs Papier. Die Druckereinstellung "Farbe" hat
// damit nichts zu tun. Abhilfe ist die CSS-Anweisung print-color-adjust:
// exact, die jetzt als DRUCK_FARBTREUE in JEDER Druckvorlage steckt.
//
//  (F1) Quell-Wache: Jede @page-Vorlage im Quellcode führt die
//       Farbtreue-Zeile direkt unter ihrer @page-Regel - auch künftige.
//  (F2) Die Schichtplan-Vorlage aus der ECHTEN App trägt die Anweisung.
//  (F3) Der Ausdruck (Chromium-PDF OHNE Hintergrundgrafiken - das
//       Standardverhalten des Druckwerks) enthält die Schichtfarben
//       Früh/Spät/Nacht als Füll-Befehle. Gemessen am 09.09. ohne den
//       Fix: 0 farbige Pixel, keine Füll-Befehle - der Test war rot.
//  (F4) Auch die TPM-Plan-Vorlage (Übersicht) trägt die Anweisung.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const QUELLE = "/home/user/WerkstattKalender/app/src/WerkstattKalender.jsx";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

// PDF-Inhaltsströme aufblasen (Chromium schreibt sie Flate-gepackt) und den
// Klartext der Zeichenbefehle zurückgeben - so messen wir OHNE Zusatzwerkzeug,
// welche Farben wirklich auf dem Blatt landen.
const pdfInhalt = (datei) => {
  const roh = fs.readFileSync(datei);
  let text = "", i = 0;
  while ((i = roh.indexOf("stream", i)) !== -1) {
    let s = i + 6; if (roh[s] === 13) s++; if (roh[s] === 10) s++;
    const e = roh.indexOf("endstream", s); if (e === -1) break;
    try { text += zlib.inflateSync(roh.subarray(s, e)).toString("latin1"); } catch (err) { /* kein Flate-Strom */ }
    i = e + 9;
  }
  return text;
};
// Eine Hex-Farbe als PDF-Füllbefehl, z. B. F0C230 -> ".9412 .7608 .1882 rg"
const fuellBefehl = (hex) => {
  const kanal = (n) => { const s = (n / 255).toFixed(4).replace(/^0/, "").replace(/0+$/, "").replace(/\.$/, ""); return s === "" ? "0" : s; };
  return [0, 2, 4].map((p) => kanal(parseInt(hex.slice(p, p + 2), 16))).join(" ") + " rg";
};

(async () => {
  /* ---- (F1) Quell-Wache über ALLE Vorlagen ---- */
  {
    const zeilen = fs.readFileSync(QUELLE, "utf8").split("\n");
    let vorlagen = 0; const ohne = [];
    zeilen.forEach((z, i) => {
      if (/^\s*@page \{ size: A[34]/.test(z)) {
        vorlagen++;
        // Direkt darunter darf noch die @page-notes-Nebenregel stehen.
        const danach = (zeilen[i + 1] || "") + (zeilen[i + 2] || "");
        if (!danach.includes("${DRUCK_FARBTREUE}")) ohne.push("Zeile " + (i + 1));
      }
    });
    pruef("(F1) Jede @page-Druckvorlage im Quellcode führt die Farbtreue-Zeile",
          vorlagen >= 15 && ohne.length === 0, vorlagen + " Vorlagen" + (ohne.length ? ", ohne: " + ohne.join(", ") : ""));
  }

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-09-09T10:00:00"));
  await p.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    // Druckfenster abfangen: Die App schreibt die fertige Vorlage in ein
    // Popup - der Test sammelt sie stattdessen ein.
    window.__druckHTML = "";
    window.open = () => ({
      document: { open() {}, write(h) { window.__druckHTML += h; }, close() {} },
      focus() {}, print() {},
    });
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([
      { id: "s1", category: "SCHICHT", scope: "tag", name: "Robert", date: "2026-09-07", wert: "Früh", updatedAt: "2026-09-01T08:00:00.000Z" },
      { id: "s2", category: "SCHICHT", scope: "tag", name: "Robert", date: "2026-09-08", wert: "Spät", updatedAt: "2026-09-01T08:00:00.000Z" },
      { id: "s3", category: "SCHICHT", scope: "tag", name: "Robert", date: "2026-09-09", wert: "Nacht", updatedAt: "2026-09-01T08:00:00.000Z" },
    ]));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({
      tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [],
      team: [{ id: "m1", name: "Robert", rolle: "mech" }],
    }));
  });
  // Standort festnageln: seit der Werkstatt-Wahl (harte-68) bekämen frische
  // Rechner sonst zuerst die Frage - die ist hier nicht Gegenstand.
  await p.addInitScript(() => { try { localStorage.setItem("bta-standort", "scheurich"); } catch (e) {} });
  await p.goto(APP);
  await p.waitForTimeout(1200);

  /* ---- (F2)+(F3) Schichtplan-Vorlage aus der echten App drucken ---- */
  await p.getByRole("button", { name: /Schichtplan/ }).first().click();
  await p.waitForTimeout(600);
  await p.locator('button[aria-label="Drucken"]').click();
  await p.waitForTimeout(400);
  await p.locator('div[role="dialog"] button:has-text("Drucken")').last().click();
  await p.waitForTimeout(600);
  const schichtHtml = await p.evaluate(() => window.__druckHTML);
  pruef("(F2) Die Schichtplan-Vorlage trägt die Farbtreue-Anweisung",
        /Schichtplan/.test(schichtHtml) && schichtHtml.includes("print-color-adjust: exact"),
        schichtHtml.length + " Zeichen");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "druckfarben-"));
  const htmlDatei = path.join(tmp, "schichtplan.html");
  const pdfDatei = path.join(tmp, "schichtplan.pdf");
  fs.writeFileSync(htmlDatei, schichtHtml);
  const p2 = await browser.newPage();
  await p2.goto("file://" + htmlDatei);
  await p2.waitForTimeout(300);
  // printBackground:false = das Häkchen "Hintergrundgrafiken", das im
  // Druckdialog standardmäßig AUS ist. Genau so entstand Robertos Ausdruck.
  await p2.pdf({ path: pdfDatei, printBackground: false, preferCSSPageSize: true });
  await p2.close();
  const inhalt = pdfInhalt(pdfDatei);
  const farben = { "Früh F0C230": "F0C230", "Spät 1F7A3D": "1F7A3D", "Nacht 2F6690": "2F6690" };
  const fehlend = Object.entries(farben).filter(([, hex]) => !inhalt.includes(fuellBefehl(hex))).map(([n]) => n);
  pruef("(F3) Der Ausdruck ohne Hintergrundgrafiken enthält alle Schichtfarben",
        inhalt.length > 1000 && fehlend.length === 0,
        fehlend.length ? "es fehlen: " + fehlend.join(", ") : inhalt.length + " Zeichen Zeichenbefehle");

  /* ---- (F4) Auch die TPM-Plan-Vorlage (Übersicht) trägt die Anweisung ---- */
  await p.getByRole("button", { name: /^TPM$/ }).first().click().catch(() => {});
  await p.waitForTimeout(500);
  await p.evaluate(() => { window.__druckHTML = ""; });
  await p.locator('button[aria-label="Drucken"]').first().click();
  await p.waitForTimeout(400);
  await p.locator('div[role="dialog"] button:has-text("Drucken")').last().click();
  await p.waitForTimeout(600);
  const planHtml = await p.evaluate(() => window.__druckHTML);
  pruef("(F4) Die TPM-Plan-Vorlage trägt die Farbtreue-Anweisung",
        planHtml.length > 500 && planHtml.includes("print-color-adjust: exact"),
        planHtml.length + " Zeichen");

  pruef("(F1-F4) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nHärte 65 (Druckfarben): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
