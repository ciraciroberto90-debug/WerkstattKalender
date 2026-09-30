// Prüfstand: DIE APP AM SERVER (Etappe C, Bauplan Abschnitt 8)
//
// Die gebaute App (Werkstatt_Kalender_TPM.html) läuft im echten Chromium
// gegen den ECHTEN Dienst (server/dienst.js) - keine Attrappe. Der Server-
// Betrieb wird über ?server=http://127.0.0.1:PORT eingeschaltet.
//  (C1) Start: Bestand kommt vom Server (30 Einträge), die Kopfzeile nennt den Server.
//  (C2) Speichern (window.storage.set) landet auf dem Server - mit Verlaufszeile.
//  (C3) Zweites Fenster sieht die Änderung LIVE (SSE) binnen 5 s.
//  (C4) Konflikt (409): der jüngere fremde Stand bleibt, die App bekommt den
//       Kollisions-Hinweis SOFORT (Ereignis werkstatt-shared-kollision).
//  (C5) Server weg: Speichern geht in die Warteschlange (rote Meldung, örtlich
//       gesichert); Server wieder da: Warteschlange geht raus, Server hat es.
//  (C6) Ohne Werkstatt-Schlüssel: Server weist ab (401), Meldung nennt den Schlüssel,
//       nichts auf dem Server.
//  (C7) Server weg + Neustart der App: Bestand kommt aus dem örtlichen Spiegel
//       (IndexedDB), Meldung "nicht erreichbar".
//  (C8) Störberichte gehen denselben Weg (zweite Speicherschicht).
//  (E)  Keine Skriptfehler in beiden Fenstern.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const WURZEL = path.resolve(__dirname, "..", "..");
const APP = "file://" + (process.env.APP_PFAD || path.join(WURZEL, "Werkstatt_Kalender_TPM.html"));
const PORT = 20765 + Math.floor(Math.random() * 1000);
const B = `http://127.0.0.1:${PORT}`;
const SCHLUESSEL = "pruef-schluessel";
const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), "bta-app-server-"));
fs.writeFileSync(path.join(ORDNER, "einstellungen.json"), JSON.stringify({
  port: PORT, host: "127.0.0.1", protokollOrdner: path.join(ORDNER, "protokoll"), sicherungOrdner: path.join(ORDNER, "sicherung"), sicherungUhrzeit: "99:99", schluessel: SCHLUESSEL,
  standorte: { scheurich: { name: "Scheurich", datenOrdner: path.join(ORDNER, "scheurich") }, soendgen: { name: "Soendgen Keramik", datenOrdner: path.join(ORDNER, "soendgen") } },
}));
const T = "2026-09-30T10:00:00.000Z";
const HEUTE = "2026-09-30";
const holen = async (weg) => { const r = await fetch(B + weg); return { status: r.status, k: await r.json() }; };
const post = (weg, daten) => fetch(B + weg, { method: "POST", headers: { "Content-Type": "application/json", "X-BTA-Schluessel": SCHLUESSEL }, body: JSON.stringify(daten) }).then(async (r) => ({ status: r.status, k: await r.json() }));
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

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
  for (let i = 0; i < 30; i++) { try { await fetch(B + "/api/status"); await warte(100); } catch (e) { return; } }
}

(async () => {
  if (!(await dienstStarten())) { console.log("FAIL | Dienst kam nicht hoch"); process.exit(1); }
  /* Bestand: 30 Einträge + Einstellungen (Benutzer Chef), 3 Störberichte */
  const entries = Array.from({ length: 30 }, (_, i) => ({ id: "e" + i, date: HEUTE, category: "TODO", name: "Aufgabe " + i, status: "open", updatedAt: T }));
  const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] };
  const stoer = Array.from({ length: 3 }, (_, i) => ({ id: "s" + i, nr: "2026-000" + (i + 1), date: HEUTE, schicht: "F", anlage: "TS480", stoerung: "Störung " + i, offen: false, updatedAt: T }));
  const i1 = await post("/api/scheurich/import?bereich=kalender", { format: "werkstatt-kalender-v1", standort: "scheurich", savedAt: T, entries, deleted: {}, config });
  const i2 = await post("/api/scheurich/import?bereich=stoerungen", { format: "werkstatt-stoerungen-v1", standort: "scheurich", savedAt: T, entries: stoer, deleted: {}, config: {} });
  if (i1.status !== 200 || i2.status !== 200) { console.log("FAIL | Bestand nicht eingelesen", i1.status, i2.status); process.exit(1); }

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const fehler = { A: [], B: [], C: [] };
  const KEY = "werkstatt-kalender-entries";
  async function fenster(name, { mitSchluessel = true, kontext = null } = {}) {
    const ctx = kontext || await browser.newContext({ viewport: { width: 1500, height: 950 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { fehler[name].push(e.message); console.log("PAGEERROR(" + name + "):", e.message); });
    if (!kontext) {
      await ctx.addInitScript(({ s }) => {
        localStorage.setItem("bta-standort", "scheurich");
        localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
        localStorage.setItem("werkstatt-kalender-name", "Chef");
        if (s) localStorage.setItem("bta-server:schluessel", s);
        window.__meldungen = []; window.__kollisionen = [];
        ["werkstatt-shared-error", "werkstatt-shared-info", "werkstatt-stoer-error"].forEach((ev) => window.addEventListener(ev, (e) => window.__meldungen.push(ev + ": " + (e.detail || ""))));
        window.addEventListener("werkstatt-shared-kollision", (e) => window.__kollisionen.push(e.detail));
      }, { s: mitSchluessel ? SCHLUESSEL : "" });
    }
    await p.goto(APP + "?server=" + B);
    return { ctx, p };
  }
  const bereit = (p, frist = 15000) => p.waitForFunction(() => window.__wkSharedTest && window.__wkSharedTest.spiegel && window.__wkSharedTest.spiegel().entries.length > 0, null, { timeout: frist }).then(() => true).catch(() => false);

  /* (C1) */
  const A = await fenster("A");
  const t0 = Date.now();
  const aBereit = await bereit(A.p);
  const ladeMs = Date.now() - t0;
  const standA = await A.p.evaluate(async () => { const s = window.__wkSharedTest.spiegel(); const g = await window.storage.get("werkstatt-kalender-entries"); return { n: s.entries.filter((e) => !String(e.id).startsWith("log|")).length, v: s.version, ausStorage: JSON.parse(g.value).length, config: !!s.config.benutzer }; });
  await A.p.waitForTimeout(800);
  const kopfTitel = await A.p.locator('button[aria-label="Gemeinsame Datei"]').getAttribute("title").catch(() => "");
  console.log(`MESSUNG App-Start am Server: ${ladeMs} ms bis der Spiegel steht`);
  ok("(C1) Start: 30 Einträge vom Server, Version > 0, Einstellungen (Benutzer) da, window.storage liefert den Server-Bestand, Kopfzeile nennt den Server", aBereit && standA.n === 30 && standA.v > 0 && standA.config && standA.ausStorage === 30 && /Server/.test(kopfTitel || ""), JSON.stringify(standA) + " | " + String(kopfTitel).slice(0, 80));

  /* (C3 vorbereiten) zweites Fenster */
  const Bf = await fenster("B");
  await bereit(Bf.p);

  /* (C2) */
  await A.p.evaluate(async (KEY) => {
    const alt = JSON.parse((await window.storage.get(KEY)).value);
    await window.storage.set(KEY, JSON.stringify(alt.concat([{ id: "neu-1", date: "2026-09-30", category: "TODO", name: "Filter tauschen", status: "open" }])));
    await window.__wkStorageTest.dateiFertig();
  }, KEY);
  await warte(300);
  const nachC2 = (await holen("/api/scheurich/stand?seit=0")).k;
  const neu1 = nachC2.eintraege.find((e) => e.id === "neu-1");
  const verlauf = nachC2.eintraege.filter((e) => String(e.id).startsWith("log|"));
  ok("(C2) Speichern landet auf dem Server: Eintrag neu-1 mit Stempel und Urheber Chef, eine Verlaufszeile 'angelegt'", !!neu1 && neu1.geaendertVon === "Chef" && !!neu1.updatedAt && verlauf.length === 1 && /angelegt/.test(verlauf[0].was || ""), JSON.stringify({ neu1: !!neu1, wer: neu1 && neu1.geaendertVon, verlauf: verlauf.map((v) => v.was) }));

  /* (C3) */
  const t3 = Date.now();
  const liveB = await Bf.p.waitForFunction(() => window.__wkSharedTest.spiegel().entries.some((e) => e.id === "neu-1"), null, { timeout: 5000 }).then(() => true).catch(() => false);
  const liveMs = Date.now() - t3;
  const bAusStorage = await Bf.p.evaluate(async () => JSON.parse((await window.storage.get("werkstatt-kalender-entries")).value).some((e) => e.id === "neu-1"));
  console.log(`MESSUNG Live-Meldung ins zweite Fenster: ${liveMs} ms`);
  ok("(C3) Zweites Fenster sieht neu-1 live (SSE) binnen 5 s - auch über window.storage", liveB && bAusStorage, `${liveMs} ms`);

  /* (C4) Konflikt: B ändert e5 (jünger), A schickt eine ÄLTERE Fassung mit veralteter Basis */
  await Bf.p.evaluate(async (KEY) => {
    const alt = JSON.parse((await window.storage.get(KEY)).value);
    await window.storage.set(KEY, JSON.stringify(alt.map((e) => (e.id === "e5" ? { ...e, name: "Aufgabe 5 (B-Fassung)" } : e))));
    await window.__wkStorageTest.dateiFertig();
  }, KEY);
  await warte(300);
  const vB = (await holen("/api/scheurich/stand?seit=0")).k.version;
  const konflikt = await A.p.evaluate(async ({ vB }) => {
    const s = window.__wkSharedTest.spiegel();
    const alt = s.entries.filter((e) => !String(e.id).startsWith("log|"));
    const meinAlt = alt.map((e) => (e.id === "e5" ? { ...e, name: "Aufgabe 5 (A-Fassung, älter)", updatedAt: "2026-09-30T09:00:00.000Z", geaendertVon: "Chef" } : e));
    window.__wkSharedTest.setzeVersion(vB - 2); // veraltete Basis -> 409
    const merged = await window.__wkSharedTest.save(meinAlt, meinAlt); // unverändert gegen prev = kein neuer Stempel
    await window.__wkSharedTest.dateiFertig();
    const e5 = window.__wkSharedTest.spiegel().entries.find((e) => e.id === "e5");
    return { spiegelName: e5 && e5.name, kollisionen: window.__kollisionen.length, felder: window.__kollisionen[0] && window.__kollisionen[0].felder.map((f) => f.feld), version: window.__wkSharedTest.version(), mergedName: (merged.find((e) => e.id === "e5") || {}).name };
  }, { vB });
  const e5Server = (await holen("/api/scheurich/stand?seit=0")).k.eintraege.find((e) => e.id === "e5");
  ok("(C4) Konflikt 409: jüngere B-Fassung bleibt auf dem Server und im Spiegel von A, A bekommt sofort den Kollisions-Hinweis (Feld name)", e5Server && /B-Fassung/.test(e5Server.name) && /B-Fassung/.test(konflikt.spiegelName || "") && konflikt.kollisionen === 1 && konflikt.felder && konflikt.felder.includes("name") && konflikt.version >= vB, JSON.stringify(konflikt));

  /* (C5) Server weg */
  await dienstStoppen();
  const offline = await A.p.evaluate(async (KEY) => {
    window.__meldungen.length = 0;
    const alt = JSON.parse((await window.storage.get(KEY)).value);
    await window.storage.set(KEY, JSON.stringify(alt.concat([{ id: "offline-1", date: "2026-09-30", category: "TODO", name: "Während des Ausfalls", status: "open" }])));
    await window.__wkStorageTest.dateiFertig();
    return { warteschlange: window.__wkSharedTest.warteschlange(), meldungen: window.__meldungen.slice(), imSpiegel: window.__wkSharedTest.spiegel().entries.some((e) => e.id === "offline-1"), ausStorage: JSON.parse((await window.storage.get(KEY)).value).some((e) => e.id === "offline-1") };
  }, KEY);
  ok("(C5a) Server weg: Änderung in der Warteschlange (1), örtlich im Spiegel und in window.storage, rote Meldung 'nicht erreichbar'", offline.warteschlange === 1 && offline.imSpiegel && offline.ausStorage && offline.meldungen.some((m) => /nicht erreichbar/.test(m)), JSON.stringify(offline).slice(0, 220));
  const t5 = Date.now();
  await dienstStarten();
  const leer = await A.p.waitForFunction(() => window.__wkSharedTest.warteschlange() === 0, null, { timeout: 25000 }).then(() => true).catch(() => false);
  const nachholMs = Date.now() - t5;
  await warte(300);
  const offlineServer = (await holen("/api/scheurich/stand?seit=0")).k.eintraege.find((e) => e.id === "offline-1");
  const infoA = await A.p.evaluate(() => window.__meldungen.filter((m) => /info/.test(m)));
  console.log(`MESSUNG Warteschlange nach Server-Neustart geleert: ${nachholMs} ms`);
  ok("(C5b) Server wieder da: Warteschlange leer, offline-1 auf dem Server, grüne Meldung", leer && !!offlineServer && infoA.some((m) => /Wartende Änderungen/.test(m)), `${nachholMs} ms, Server ${!!offlineServer}, Info ${infoA.length}`);

  /* (C6) ohne Schlüssel */
  const C = await fenster("C", { mitSchluessel: false });
  await bereit(C.p);
  const ohne = await C.p.evaluate(async (KEY) => {
    window.__meldungen.length = 0;
    const alt = JSON.parse((await window.storage.get(KEY)).value);
    await window.storage.set(KEY, JSON.stringify(alt.concat([{ id: "fremd-1", date: "2026-09-30", category: "TODO", name: "ohne Schlüssel", status: "open" }])));
    await window.__wkStorageTest.dateiFertig();
    return { meldungen: window.__meldungen.slice(), warteschlange: window.__wkSharedTest.warteschlange() };
  }, KEY);
  const fremd = (await holen("/api/scheurich/stand?seit=0")).k.eintraege.find((e) => e.id === "fremd-1");
  ok("(C6) Ohne Werkstatt-Schlüssel: 401 -> Meldung nennt den Schlüssel, nichts auf dem Server, keine Warteschlange", !fremd && ohne.meldungen.some((m) => /Schlüssel/.test(m)) && ohne.warteschlange === 0, JSON.stringify(ohne).slice(0, 200));
  await C.ctx.close();

  /* (C8) Störberichte */
  await A.p.evaluate(async () => {
    const s = window.__wkStoerTest.spiegel().entries.filter((e) => !String(e.id).startsWith("log|"));
    await window.__wkStoerTest.save(s.concat([{ id: "s-neu", nr: "2026-0004", date: "2026-09-30", schicht: "S", anlage: "VSM2", stoerung: "Neu am Server", offen: true }]), s);
    await window.__wkStoerTest.dateiFertig();
  });
  await warte(300);
  const stoerServer = (await holen("/api/scheurich/stand?seit=0")).k.stoerungen;
  const sNeu = stoerServer.find((e) => e.id === "s-neu");
  const sLiveB = await Bf.p.waitForFunction(() => window.__wkStoerTest.spiegel().entries.some((e) => e.id === "s-neu"), null, { timeout: 5000 }).then(() => true).catch(() => false);
  ok("(C8) Störbericht s-neu auf dem Server (Tabelle stoerungen, Urheber Chef) und live im zweiten Fenster", !!sNeu && sNeu.geaendertVon === "Chef" && sLiveB, JSON.stringify({ sNeu: !!sNeu, live: sLiveB, n: stoerServer.length }));

  /* (C7) Server weg + Neustart der App: Spiegel */
  await dienstStoppen();
  const D = await fenster("A", { kontext: A.ctx });
  await D.p.waitForTimeout(2500);
  const ausSpiegel = await D.p.evaluate(async () => { const s = window.__wkSharedTest.spiegel(); const g = await window.storage.get("werkstatt-kalender-entries"); return { n: s.entries.filter((e) => !String(e.id).startsWith("log|")).length, ausStorage: JSON.parse(g.value).length, erreichbar: window.__wkSharedTest.erreichbar(), meldungen: window.__meldungen.filter((m) => /nicht erreichbar/.test(m)).length }; });
  ok("(C7) Server weg, App neu gestartet: 32 Einträge aus dem örtlichen Spiegel (IndexedDB), Meldung 'nicht erreichbar'", ausSpiegel.n === 32 && ausSpiegel.ausStorage === 32 && !ausSpiegel.erreichbar && ausSpiegel.meldungen >= 1, JSON.stringify(ausSpiegel));

  ok("(E) Keine Skriptfehler in den Fenstern", fehler.A.length === 0 && fehler.B.length === 0 && fehler.C.length === 0, [...fehler.A, ...fehler.B, ...fehler.C].slice(0, 3).join(" | "));
  await browser.close();
  await dienstStoppen();
  fs.rmSync(ORDNER, { recursive: true, force: true });
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error("ABBRUCH:", e); await dienstStoppen(); process.exit(1); });
