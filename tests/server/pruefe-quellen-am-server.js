// Prüfstand: EXCEL-QUELLEN IM SERVER-BETRIEB (Roll-out 54, 02.10.2026)
//
// Befund vom 02.10. auf Robertos PC: Programm 1.3 am Server, OEE-Kachel rot
// „Tabelle prüfen“ - die Speicherschicht server-client.js las keine Tabellen.
// Gebaut wurde kein OEE-Sonderweg, sondern ein allgemeiner Weg für Excel-
// Quellen (Roberto: „in Zukunft immer öfter Excel-Daten“, z. B. Budget-Ist):
//   - Der Dienst hält je Standort eine KOPIE der Tabelle (api/<standort>/quellen).
//   - Der reine Browser (Monitor, /app/) liest die Kopie.
//   - Das Programm (Brücke __werkstattDesktop) liest vom Laufwerk und spielt
//     die Datei auf den Server, sobald sie dort fehlt oder älter ist (Zubringer).
//
// Die gebaute App läuft im echten Chromium gegen den ECHTEN Dienst - keine
// Attrappe für den Server. Das Programm wird durch eine Brücken-Attrappe
// nachgestellt, die einen Ordner mit einer echten .xlsx (tests/hilfen/xlsx-bauen)
// bereitstellt und jeden Lesezugriff zählt.
//  (Q1) Browser ohne Kopie auf dem Server: Kachel sagt, dass die Tabelle noch
//       nicht auf dem Server liegt und wie sie dorthin kommt - kein stummes Rot.
//  (Q2) Programm mit Laufwerksordner: Kachel zeigt 84,0 - UND die Datei liegt
//       jetzt als Kopie auf dem Server (Stand = Änderungszeit der Vorlage).
//  (Q3) Der Browser (ohne Laufwerk) zeigt dieselbe Zahl aus der Kopie.
//  (Q4) Excel ändert die Datei auf dem Laufwerk -> das Programm spielt die neue
//       Fassung ein, der Browser sieht 90,0 ohne Zutun (Minutentakt, erzwungen).
//  (Q5) Unverändert: kein zweites Hochladen (Kopierzeit auf dem Server bleibt).
//  (Q6) Auf das Laufwerk wurde NIE geschrieben (die Attrappe hat keinen Schreibweg;
//       jeder Versuch würde als Fehler zählen).
//  (Q7) ⚙ → OEE nennt im Server-Betrieb die Kopie und den Zubringer.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: gegen den Bau VOR dieser Änderung (server-client.js ohne
// Quellen) sind Q1-Q4 rot - gemessen 02.10. (APP_PFAD auf die alte HTML).
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { arbeitsmappeBauen } = require("../hilfen/xlsx-bauen.js");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const WURZEL = path.resolve(__dirname, "..", "..");
const APP = "file://" + (process.env.APP_PFAD || path.join(WURZEL, "Werkstatt_Kalender_TPM.html"));
const PORT = 21765 + Math.floor(Math.random() * 1000);
const B = `http://127.0.0.1:${PORT}`;
const SCHLUESSEL = "pruef-schluessel";
const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), "bta-quellen-"));
fs.writeFileSync(path.join(ORDNER, "einstellungen.json"), JSON.stringify({
  port: PORT, host: "127.0.0.1", protokollOrdner: path.join(ORDNER, "protokoll"), sicherungOrdner: path.join(ORDNER, "sicherung"), sicherungUhrzeit: "99:99", schluessel: SCHLUESSEL,
  standorte: { scheurich: { name: "Scheurich", datenOrdner: path.join(ORDNER, "scheurich") } },
}));
const T = "2026-10-02T06:00:00.000Z";
const holen = async (weg) => { const r = await fetch(B + weg); return { status: r.status, k: await r.json() }; };
const post = (weg, daten) => fetch(B + weg, { method: "POST", headers: { "Content-Type": "application/json", "X-BTA-Schluessel": SCHLUESSEL }, body: JSON.stringify(daten) }).then(async (r) => ({ status: r.status, k: await r.json() }));
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const DATEI = "OEE Halle 1.xlsx";
const vorStunden = (h) => new Date(Date.now() - h * 3600e3);
/* Zwei Anlagen in den letzten 24 h: 86,0 und 82,0 -> 84,0 (wie harte-40) */
const MAPPE_84 = () => arbeitsmappeBauen([{ name: "OEE", zeilen: [
  ["Datum", "Uhrzeit", "Anlage", "Schicht", "Verfügbarkeit", "Leistung", "Qualität", "OEE"],
  [{ datum: vorStunden(5) }, { datum: vorStunden(5) }, "BTS", "Früh", { prozent: 0.94 }, { prozent: 0.92 }, { prozent: 0.99 }, { prozent: 0.860 }],
  [{ datum: vorStunden(3) }, { datum: vorStunden(3) }, "VSM1", "Früh", { prozent: 0.88 }, { prozent: 0.93 }, { prozent: 1.00 }, { prozent: 0.820 }],
] }]);
const MAPPE_90 = () => arbeitsmappeBauen([{ name: "OEE", zeilen: [
  ["Datum", "Uhrzeit", "Anlage", "Schicht", "Verfügbarkeit", "Leistung", "Qualität", "OEE"],
  [{ datum: vorStunden(4) }, { datum: vorStunden(4) }, "BTS", "Früh", { prozent: 0.96 }, { prozent: 0.95 }, { prozent: 0.99 }, { prozent: 0.900 }],
  [{ datum: vorStunden(2) }, { datum: vorStunden(2) }, "VSM1", "Früh", { prozent: 0.96 }, { prozent: 0.95 }, { prozent: 0.99 }, { prozent: 0.900 }],
] }]);

let dienst = null;
async function dienstStarten() {
  dienst = spawn(process.execPath, ["--no-warnings", path.join(WURZEL, "server", "dienst.js"), path.join(ORDNER, "einstellungen.json")], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { await warte(100); try { if ((await fetch(B + "/api/status")).ok) return true; } catch (e) { /* noch nicht */ } }
  return false;
}
async function dienstStoppen() {
  if (!dienst) return;
  dienst.kill("SIGTERM");
  await new Promise((r) => { dienst.once("exit", r); setTimeout(r, 2000); });
  dienst = null;
}

(async () => {
  if (!(await dienstStarten())) { console.log("FAIL | Dienst kam nicht hoch"); process.exit(1); }
  /* Bestand mit eingerichteter OEE-Quelle (Dateiname + Zuordnung stehen in der
     gemeinsamen Konfiguration und gelten für alle Rechner - wie auf W:). */
  const config = { tpmAnlagen: [], riItems: [], team: [], benutzer: [{ name: "Chef", rolle: "verwalter" }], oee: { datei: DATEI, blatt: "OEE", kopfzeile: 0, spalten: { datum: 0, zeit: 1, anlage: 2, schicht: 3, verfuegbarkeit: 4, leistung: 5, qualitaet: 6, oee: 7 } } };
  const i1 = await post("/api/scheurich/import?bereich=kalender", { format: "werkstatt-kalender-v1", standort: "scheurich", savedAt: T, entries: [{ id: "e1", date: "2026-10-02", category: "TODO", name: "Aufgabe", status: "open", updatedAt: T }], deleted: {}, config });
  if (i1.status !== 200) { console.log("FAIL | Bestand nicht eingelesen", i1.status); process.exit(1); }

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const fehler = [];
  const LAUFWERK = "W:\\Instandhaltung\\OEE";
  /* Fenster: Browser (ohne Brücke) oder Programm (Brücken-Attrappe mit einem
     Ordner auf dem „Laufwerk“; die Mappe kommt als Base64 hinein). */
  async function fenster(name, { programm = false, mappe = null, stand = 0 } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { fehler.push(name + ": " + e.message); console.log("PAGEERROR(" + name + "):", e.message); });
    await ctx.addInitScript(({ s, programm, mappe, stand, LAUFWERK, DATEI }) => {
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-benutzer", "Chef"); localStorage.setItem("werkstatt-kalender-name", "Chef");
      localStorage.setItem("bta-server:schluessel", s);
      window.__meldungen = [];
      ["werkstatt-shared-error", "werkstatt-shared-info"].forEach((ev) => window.addEventListener(ev, (e) => window.__meldungen.push(ev + ": " + (e.detail || ""))));
      if (!programm) return;
      const entpacke = (b64) => { const roh = atob(b64); const arr = new Uint8Array(roh.length); for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i); return arr; };
      window.__laufwerk = { [DATEI]: { bytes: entpacke(mappe), geaendert: stand } };
      window.__zugriffe = { lese: 0, stat: 0, liste: 0, schreib: 0 };
      const gemerkt = { "werkstatt-kalender-fs:quellordner": LAUFWERK }; // wie nach der Datei-Fassung gemerkt
      const istImOrdner = (pfad) => String(pfad).startsWith(LAUFWERK + "\\");
      const nameVon = (pfad) => String(pfad).split("\\").pop();
      window.__werkstattDesktop = {
        gemerkt: async (k) => gemerkt[k] || null,
        merke: async (k, v) => { if (v == null) delete gemerkt[k]; else gemerkt[k] = v; return true; },
        liste: async (pfad) => { window.__zugriffe.liste++; if (pfad !== LAUFWERK) return []; return Object.keys(window.__laufwerk).map((n) => ({ name: n, pfad: LAUFWERK + "\\" + n })); },
        stat: async (pfad) => { window.__zugriffe.stat++; const d = istImOrdner(pfad) && window.__laufwerk[nameVon(pfad)]; return d ? { groesse: d.bytes.length, geaendert: d.geaendert } : null; },
        lese: async (pfad) => { window.__zugriffe.lese++; const d = istImOrdner(pfad) && window.__laufwerk[nameVon(pfad)]; return d ? { bytes: d.bytes, geaendert: d.geaendert, groesse: d.bytes.length } : null; },
        pfadInfo: async (pfad) => (pfad === LAUFWERK ? "ordner" : istImOrdner(pfad) && window.__laufwerk[nameVon(pfad)] ? "datei" : null),
        waehleOrdner: async () => LAUFWERK,
        // Schreibwege gibt es für die Quelle NICHT - jeder Aufruf ist ein Fehler
        schreibe: async () => { window.__zugriffe.schreib++; throw new Error("Schreiben verboten"); },
        schreibeBytes: async () => { window.__zugriffe.schreib++; throw new Error("Schreiben verboten"); },
        entferne: async () => { window.__zugriffe.schreib++; throw new Error("Löschen verboten"); },
        ordnerAnlegen: async () => { window.__zugriffe.schreib++; throw new Error("Anlegen verboten"); },
      };
    }, { s: SCHLUESSEL, programm, mappe: mappe ? mappe.toString("base64") : null, stand, LAUFWERK, DATEI });
    await p.goto(APP + "?server=" + B);
    await p.waitForFunction(() => window.__wkSharedTest && window.__wkSharedTest.spiegel && window.__wkSharedTest.spiegel().entries.length > 0, null, { timeout: 15000 }).catch(() => {});
    return { ctx, p };
  }
  const kachel = (p) => p.locator("button[title*='OEE']").first();
  const kachelText = async (p) => (await kachel(p).innerText().catch(() => "")).replace(/\n/g, " · ");
  const kachelTitel = async (p) => (await kachel(p).getAttribute("title").catch(() => "")) || "";
  const wartenAuf = (p, re, frist = 8000) => p.waitForFunction(([re]) => { const k = document.querySelector("button[title*='OEE']"); return !!k && new RegExp(re).test((k.innerText || "") + " " + (k.getAttribute("title") || "")); }, [re.source], { timeout: frist }).then(() => true).catch(() => false);

  /* (Q1) Browser, Server hat noch keine Kopie */
  const Br = await fenster("Browser");
  const q1 = await wartenAuf(Br.p, /noch nicht auf dem Server/);
  ok("(Q1) Browser ohne Kopie auf dem Server: Kachel nennt den Grund (noch nicht auf dem Server) und den Weg dorthin", q1 && /Cockpit-Programm/.test(await kachelTitel(Br.p)), (await kachelText(Br.p)) + " | " + (await kachelTitel(Br.p)).slice(0, 120));

  /* (Q2) Programm mit Laufwerk -> Zahl + Kopie auf dem Server */
  const STAND1 = Date.parse("2026-10-02T04:12:00.000Z");
  const Pr = await fenster("Programm", { programm: true, mappe: MAPPE_84(), stand: STAND1 });
  const q2 = await wartenAuf(Pr.p, /84,0/);
  await warte(400);
  const kopien = (await holen("/api/scheurich/quellen")).k.quellen;
  ok("(Q2) Programm: Kachel zeigt 84,0 - und die Datei liegt als Kopie auf dem Server mit dem Stand der Vorlage", q2 && kopien.length === 1 && kopien[0].name === DATEI && Math.abs(kopien[0].stand - STAND1) < 1000, (await kachelText(Pr.p)) + " | " + JSON.stringify(kopien));

  /* (Q3) Browser liest die Kopie - ohne Neustart (nächster Takt wird erzwungen über Fokus) */
  await Br.p.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
  const q3 = await wartenAuf(Br.p, /84,0/);
  ok("(Q3) Browser ohne Laufwerk zeigt dieselbe 84,0 aus der Server-Kopie", q3, await kachelText(Br.p));

  /* (Q4) Excel ändert die Datei auf dem Laufwerk */
  const STAND2 = STAND1 + 3600e3;
  await Pr.p.evaluate(({ mappe, stand, DATEI }) => { const roh = atob(mappe); const arr = new Uint8Array(roh.length); for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i); window.__laufwerk[DATEI] = { bytes: arr, geaendert: stand }; }, { mappe: MAPPE_90().toString("base64"), stand: STAND2, DATEI });
  await Pr.p.evaluate(() => { window.dispatchEvent(new Event("focus")); });
  const q4a = await wartenAuf(Pr.p, /90,0/);
  await warte(400);
  const kopien2 = (await holen("/api/scheurich/quellen")).k.quellen;
  await Br.p.evaluate(() => { window.dispatchEvent(new Event("focus")); });
  const q4b = await wartenAuf(Br.p, /90,0/);
  ok("(Q4) Geänderte Tabelle: Programm zeigt 90,0, Kopie auf dem Server trägt den neuen Stand, Browser zeigt 90,0", q4a && q4b && kopien2.length === 1 && Math.abs(kopien2[0].stand - STAND2) < 1000, `${await kachelText(Pr.p)} | ${await kachelText(Br.p)} | ${JSON.stringify(kopien2)}`);

  /* (Q5) Unverändert: kein erneutes Hochladen. Die Kopierzeit (ctime) der Serverdatei bleibt. */
  const kopiePfad = path.join(ORDNER, "scheurich", "quellen", DATEI);
  const ctimeVon = (p) => (fs.existsSync(p) ? fs.statSync(p).ctimeMs : -1); // -1 = Kopie fehlt (alter Bau)
  const ctimeVorher = ctimeVon(kopiePfad);
  const zugriffeVorher = await Pr.p.evaluate(() => ({ ...window.__zugriffe }));
  await warte(1100);
  await Pr.p.evaluate(() => { window.dispatchEvent(new Event("focus")); });
  await warte(1200);
  const ctimeNachher = ctimeVon(kopiePfad);
  const zugriffeNachher = await Pr.p.evaluate(() => ({ ...window.__zugriffe }));
  // Nur nachgeschaut (stat), nicht die ganze Mappe vom Laufwerk gezogen (lese) -
  // die Datei-Fassung las sie bisher jede Minute komplett.
  ok("(Q5) Unveränderte Tabelle: kein zweites Hochladen (Serverdatei unangetastet); das Programm hat nur nachgeschaut (stat), nicht gelesen", ctimeVorher > 0 && ctimeNachher === ctimeVorher && zugriffeNachher.stat > zugriffeVorher.stat && zugriffeNachher.lese === zugriffeVorher.lese, `ctime ${ctimeVorher} -> ${ctimeNachher}, stat ${zugriffeVorher.stat} -> ${zugriffeNachher.stat}, lese ${zugriffeVorher.lese} -> ${zugriffeNachher.lese}`);

  /* (Q6) nie geschrieben */
  ok("(Q6) Auf das Laufwerk wurde nie geschrieben", zugriffeNachher.schreib === 0, JSON.stringify(zugriffeNachher));

  /* (Q7) ⚙ → OEE im Server-Betrieb */
  await Pr.p.locator('button[aria-label="Verwalten"]').click();
  await Pr.p.waitForTimeout(400);
  await Pr.p.getByRole("button", { name: "OEE", exact: true }).click();
  await Pr.p.waitForTimeout(300);
  const lage = await Pr.p.locator('[data-testid="oee-quellen-lage"]').innerText().catch(() => "");
  const ordnerZeile = await Pr.p.getByText(/Ordner mit der Tabelle:/).locator("..").innerText().catch(() => "");
  ok("(Q7) ⚙ → OEE nennt die Kopie auf dem Server, den Zubringer und den Laufwerksordner", /Kopie auf dem Server/.test(lage) && /Dieser Rechner bringt sie dorthin/.test(lage) && /W:\\Instandhaltung\\OEE/.test(ordnerZeile) && /Server 127\.0\.0\.1/.test(ordnerZeile), (lage + " | " + ordnerZeile).replace(/\s+/g, " ").slice(0, 220));

  ok("(E) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 3).join(" | "));
  await browser.close();
  await dienstStoppen();
  fs.rmSync(ORDNER, { recursive: true, force: true });
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error("ABBRUCH:", e); await dienstStoppen(); process.exit(1); });
