// Prüfstand: BTA-COCKPIT-DIENST (Etappe A des Bauplans, 30.09.2026)
//
// Startet den echten Dienst mit Wegwerf-Ordnern auf einem freien Port und
// prüft die Schnittstelle so, wie die App sie später nutzt.
//  (A1) Start: /api/status kennt beide Standorte (scheurich, soendgen), Version 0.
//  (A2) Leerer Stand: seit=0 liefert nichts, Version 0.
//  (A3) Änderungen anwenden: 2 Einträge + 1 Störung + Konfig -> Version 1;
//       Stand seit 0 enthält alles, Stand seit 1 nichts.
//  (A4) Delta: zweite Änderung -> Version 2; Stand seit 1 enthält NUR sie.
//  (A5) Konflikt: Änderung mit alter Basis auf einen inzwischen geänderten
//       Eintrag -> 409 mit dem Server-Stand; nichts wurde übernommen.
//       Mit erzwingen -> 200.
//  (A6) Löschen: Grabstein erscheint in geloescht, Eintrag fehlt im Stand,
//       Export trägt ihn in deleted.
//  (A7) Standort-Trennung: Soendgen bleibt leer, unbekannter Standort -> 404.
//  (A8) Export im heutigen Format (werkstatt-kalender-v1 / -stoerungen-v1).
//  (A9) Import einer v1-Datei: Zählung stimmt; zweiter Import derselben Datei
//       ändert nichts (0 neu, alles unverändert, Version gleich).
//  (A10) Import -> Export -> Vergleich Eintrag für Eintrag: 0 Abweichungen.
//  (A11) Live: SSE meldet die neue Version nach einer Änderung.
//  (A12) Sicherung: Datenbank-Kopie + zwei Exporte je Standort liegen im Ordner;
//        die Kopie lässt sich öffnen und hat denselben Bestand.
//  (A13) Zwei Schreiber gleichzeitig auf denselben Eintrag mit derselben Basis:
//        genau einer bekommt 200, der andere 409 - nichts geht verloren.
//  (A14) /status liefert eine Seite, /app/ ohne Datei 404, kaputtes JSON 400.
//
// Rot-Nachweis: Ohne den Dienst gibt es nichts zu prüfen; jede Regel oben
// ist gegen eine bewusst falsche Erwartung einmal rot gelaufen (Aufbau).
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const WURZEL = path.resolve(__dirname, "..", "..");
const DIENST = path.join(WURZEL, "server", "dienst.js");
const PORT = 18765 + Math.floor(Math.random() * 1000);
const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), "bta-dienst-"));
const einst = {
  port: PORT, host: "127.0.0.1", appDatei: path.join(ORDNER, "app", "Werkstatt_Kalender_TPM.html"),
  protokollOrdner: path.join(ORDNER, "protokoll"), sicherungOrdner: path.join(ORDNER, "sicherung"), sicherungUhrzeit: "99:99", sicherungBehalten: 3,
  standorte: { scheurich: { name: "Scheurich", datenOrdner: path.join(ORDNER, "BTA-Scheurich") }, soendgen: { name: "Soendgen Keramik", datenOrdner: path.join(ORDNER, "BTA-Soendgen") } },
};
fs.writeFileSync(path.join(ORDNER, "einstellungen.json"), JSON.stringify(einst));
const B = `http://127.0.0.1:${PORT}`;
const holen = async (weg, opt) => { const r = await fetch(B + weg, opt); let k = null; try { k = await r.json(); } catch (e) { k = null; } return { status: r.status, k }; };
const post = (weg, daten) => holen(weg, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(daten) });
const T = "2026-09-30T10:00:00.000Z";

(async () => {
  const kind = spawn(process.execPath, ["--no-warnings", DIENST, path.join(ORDNER, "einstellungen.json")], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DIENST_LAUT: "1" } });
  let ausgabe = ""; kind.stdout.on("data", (d) => { ausgabe += d; }); kind.stderr.on("data", (d) => { ausgabe += d; });
  let bereit = false;
  for (let i = 0; i < 60 && !bereit; i++) { await new Promise((r) => setTimeout(r, 100)); try { const r = await fetch(B + "/api/status"); bereit = r.ok; } catch (e) { /* noch nicht */ } }
  if (!bereit) { console.log("FAIL | Dienst kam nicht hoch\n" + ausgabe); kind.kill(); process.exit(1); }

  /* (A1) */
  let s = (await holen("/api/status")).k;
  ok("(A1) /api/status kennt beide Standorte mit Version 0", s && s.standorte && s.standorte.scheurich && s.standorte.soendgen && s.standorte.scheurich.version === 0 && s.standorte.soendgen.version === 0, JSON.stringify(s && Object.keys(s.standorte || {})));

  /* (A2) */
  let st = (await holen("/api/scheurich/stand?seit=0")).k;
  ok("(A2) Leerer Stand: nichts drin, Version 0", st.version === 0 && st.eintraege.length === 0 && st.stoerungen.length === 0 && st.geloescht.eintraege.length === 0);

  /* (A3) */
  const e1 = { id: "e1", date: "2026-09-30", category: "SCHICHT", name: "Anna", scope: "tag", wert: "Früh", updatedAt: T };
  const e2 = { id: "e2", date: "2026-09-30", category: "TODO", name: "Filter tauschen", status: "open", updatedAt: T };
  const s1 = { id: "s1", nr: "2026-0001", date: "2026-09-30", schicht: "Früh", anlage: "TS480", stoerung: "Hubeinleger hängt", offen: false, melder: "TB", gemeldetAt: T, updatedAt: T };
  let r = await post("/api/scheurich/aenderungen", { benutzer: "Chef", basisVersion: 0, eintraege: [e1, e2], stoerungen: [s1], konfig: { kalender: { team: [{ name: "Anna", rolle: "mech" }] } } });
  ok("(A3) Änderungen angenommen -> Version 1, 4 Stücke", r.status === 200 && r.k.version === 1 && r.k.anzahl === 4, JSON.stringify(r.k));
  st = (await holen("/api/scheurich/stand?seit=0")).k;
  ok("(A3) Stand seit 0: 2 Einträge, 1 Störung, Konfig team", st.version === 1 && st.eintraege.length === 2 && st.stoerungen.length === 1 && st.konfig.kalender.team[0].name === "Anna" && st.eintraege.find((x) => x.id === "e1").wert === "Früh");
  ok("(A3) Stand seit 1: leer", (await holen("/api/scheurich/stand?seit=1")).k.eintraege.length === 0);

  /* (A4) */
  r = await post("/api/scheurich/aenderungen", { benutzer: "Bea", basisVersion: 1, eintraege: [{ ...e2, status: "done", updatedAt: "2026-09-30T11:00:00.000Z" }] });
  st = (await holen("/api/scheurich/stand?seit=1")).k;
  ok("(A4) Delta seit 1 enthält NUR die geänderte Aufgabe (Version 2)", r.k.version === 2 && st.eintraege.length === 1 && st.eintraege[0].id === "e2" && st.eintraege[0].status === "done" && st.stoerungen.length === 0);

  /* (A5) */
  r = await post("/api/scheurich/aenderungen", { benutzer: "Chef", basisVersion: 1, eintraege: [{ ...e2, status: "open", note: "doch nicht", updatedAt: "2026-09-30T11:00:05.000Z" }] });
  ok("(A5) Alte Basis auf geänderten Eintrag -> 409 mit Server-Stand", r.status === 409 && r.k.konflikte.length === 1 && r.k.konflikte[0].id === "e2" && r.k.konflikte[0].server.status === "done" && r.k.version === 2, JSON.stringify(r.k).slice(0, 160));
  st = (await holen("/api/scheurich/stand?seit=0")).k;
  ok("(A5) Nichts übernommen: Version bleibt 2, Aufgabe bleibt done", st.version === 2 && st.eintraege.find((x) => x.id === "e2").status === "done");
  r = await post("/api/scheurich/aenderungen", { benutzer: "Chef", basisVersion: 1, erzwingen: true, eintraege: [{ ...e2, status: "open", note: "doch nicht", updatedAt: "2026-09-30T11:00:05.000Z" }] });
  ok("(A5) Mit erzwingen -> 200, Version 3", r.status === 200 && r.k.version === 3);

  /* (A6) */
  r = await post("/api/scheurich/aenderungen", { benutzer: "Chef", basisVersion: 3, loeschen: { eintraege: ["e1"] } });
  st = (await holen("/api/scheurich/stand?seit=3")).k;
  const ex = (await holen("/api/scheurich/export.json")).k;
  ok("(A6) Löschen: Grabstein im Delta, Eintrag fehlt im Bestand, Export trägt deleted", r.k.version === 4 && st.geloescht.eintraege.length === 1 && st.geloescht.eintraege[0].id === "e1" && !(await holen("/api/scheurich/stand?seit=0")).k.eintraege.some((x) => x.id === "e1") && ex.deleted.e1 && ex.entries.length === 1);

  /* (A7) */
  const so = (await holen("/api/soendgen/stand?seit=0")).k;
  ok("(A7) Soendgen ist unberührt (Version 0, leer); unbekannter Standort -> 404", so.version === 0 && so.eintraege.length === 0 && (await holen("/api/formwerk/stand")).status === 404);

  /* (A8) */
  const exS = (await holen("/api/scheurich/export.json?bereich=stoerungen")).k;
  ok("(A8) Export im heutigen Format: kalender-v1 mit Konfig, stoerungen-v1 mit dem Bericht", ex.format === "werkstatt-kalender-v1" && ex.standort === "scheurich" && ex.config.team && ex.schreibMarke === "server-4" && exS.format === "werkstatt-stoerungen-v1" && exS.entries[0].nr === "2026-0001");

  /* (A9) Import in Soendgen */
  const datei = { format: "werkstatt-kalender-v1", standort: "soendgen", savedAt: T, bauStand: "2026-09-29T12:00:00.000Z", deleted: { "alt-1": "2026-09-01T00:00:00.000Z" }, config: { team: [{ name: "Otto", rolle: "elek" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] },
    entries: Array.from({ length: 50 }, (_, i) => ({ id: "i" + i, date: "2026-09-" + String(1 + (i % 28)).padStart(2, "0"), category: i % 2 ? "TPM" : "RI", name: "Anlage " + i, status: i % 3 ? "done" : "open", updatedAt: T })).concat([{ id: "log|2026-09-30T10:00:00.000Z-abc", date: "2026-09-30", category: "LOG", text: "angelegt", updatedAt: T }]) };
  r = await post("/api/soendgen/import", datei);
  ok("(A9) Import zählt: 51 gelesen, 51 neu, 1 gelöscht, 2 Konfig -> Version 1", r.status === 200 && r.k.gelesen === 51 && r.k.neu === 51 && r.k.geloescht === 1 && r.k.konfig === 2 && r.k.version === 1, JSON.stringify(r.k));
  const r2 = await post("/api/soendgen/import", datei);
  ok("(A9) Zweiter Import derselben Datei: 0 neu, 51 unverändert, Version bleibt 1", r2.k.neu === 0 && r2.k.unveraendert === 51 && r2.k.geloescht === 0 && r2.k.konfig === 0 && r2.k.version === 1, JSON.stringify(r2.k));

  /* (A10) */
  const exSo = (await holen("/api/soendgen/export.json")).k;
  const nachId = (l) => Object.fromEntries(l.map((x) => [x.id, JSON.stringify(x)]));
  const a = nachId(datei.entries), b = nachId(exSo.entries);
  const abweichungen = Object.keys(a).filter((id) => a[id] !== b[id]).concat(Object.keys(b).filter((id) => !(id in a)));
  // Der Export sortiert die Konfig-Schlüssel - deshalb Schlüssel für Schlüssel vergleichen, nicht als Ganzes.
  const konfigGleich = Object.keys(datei.config).length === Object.keys(exSo.config).length && Object.keys(datei.config).every((k) => JSON.stringify(datei.config[k]) === JSON.stringify(exSo.config[k]));
  ok("(A10) Import -> Export: 51 Einträge Byte für Byte gleich, deleted und config gleich, bauStand übernommen",
    abweichungen.length === 0 && exSo.entries.length === 51 && JSON.stringify(exSo.deleted) === JSON.stringify(datei.deleted) && konfigGleich && exSo.bauStand === datei.bauStand,
    `Abweichungen ${abweichungen.length}: ${abweichungen.slice(0, 3).join(",")} | entries ${exSo.entries.length} | deleted ${JSON.stringify(exSo.deleted) === JSON.stringify(datei.deleted)} | config ${konfigGleich} | bauStand ${exSo.bauStand}`);

  /* (A11) SSE */
  const ereignisse = [];
  const ac = new AbortController();
  const sse = fetch(B + "/api/scheurich/ereignisse", { signal: ac.signal }).then(async (res) => {
    const leser = res.body.getReader(); const dec = new TextDecoder(); let rest = "";
    try { while (true) { const { value, done } = await leser.read(); if (done) break; rest += dec.decode(value, { stream: true }); let i; while ((i = rest.indexOf("\n\n")) >= 0) { const block = rest.slice(0, i); rest = rest.slice(i + 2); const d = block.split("\n").find((z) => z.startsWith("data: ")); if (d) ereignisse.push(JSON.parse(d.slice(6))); } } } catch (e) { /* abgebrochen */ }
  });
  await new Promise((r) => setTimeout(r, 300));
  await post("/api/scheurich/aenderungen", { benutzer: "Chef", basisVersion: 4, eintraege: [{ id: "e9", date: "2026-10-01", category: "TODO", name: "Live-Test", updatedAt: T }] });
  await new Promise((r) => setTimeout(r, 400));
  ok("(A11) SSE: Begrüßung mit Version 4, dann Meldung Version 5", ereignisse.length >= 2 && ereignisse[0].hallo === true && ereignisse[0].version === 4 && ereignisse[ereignisse.length - 1].version === 5, JSON.stringify(ereignisse));
  ok("(A11) /api/status zählt den verbundenen Rechner", (await holen("/api/status")).k.standorte.scheurich.verbunden === 1);
  ac.abort(); await sse;

  /* (A12) Sicherung */
  r = await post("/api/scheurich/sicherung", {});
  const dateien = fs.readdirSync(einst.sicherungOrdner).sort();
  ok("(A12) Sicherung: je Standort Datenbank-Kopie + 2 Exporte (6 Dateien)", r.status === 200 && dateien.length === 6 && dateien.filter((n) => n.endsWith(".sqlite")).length === 2 && dateien.some((n) => /scheurich_kalender\.json$/.test(n)), dateien.join(","));
  {
    const { oeffnen } = require(path.join(WURZEL, "server", "db.js"));
    const kopie = oeffnen(path.join(einst.sicherungOrdner, dateien.find((n) => /_scheurich\.sqlite$/.test(n))));
    const z = kopie.zaehlen(); kopie.schliessen();
    ok("(A12) Die Kopie lässt sich öffnen und hat denselben Bestand (Version 5, 2 Einträge, 1 Störung, 1 gelöscht)", z.version === 5 && z.eintraege === 2 && z.stoerungen === 1 && z.geloescht === 1, JSON.stringify(z));
  }

  /* (A13) Zwei Schreiber gleichzeitig */
  const basis = (await holen("/api/scheurich/stand?seit=0")).k.version;
  const [w1, w2] = await Promise.all([
    post("/api/scheurich/aenderungen", { benutzer: "Anna", basisVersion: basis, eintraege: [{ id: "e9", date: "2026-10-01", category: "TODO", name: "Anna war hier", updatedAt: "2026-09-30T12:00:00.000Z" }] }),
    post("/api/scheurich/aenderungen", { benutzer: "Bernd", basisVersion: basis, eintraege: [{ id: "e9", date: "2026-10-01", category: "TODO", name: "Bernd war hier", updatedAt: "2026-09-30T12:00:00.000Z" }] }),
  ]);
  const gewinner = [w1, w2].filter((x) => x.status === 200), verlierer = [w1, w2].filter((x) => x.status === 409);
  const e9 = (await holen("/api/scheurich/stand?seit=0")).k.eintraege.find((x) => x.id === "e9");
  ok("(A13) Gleichzeitig auf denselben Eintrag: genau ein 200, ein 409; der Konflikt nennt den Gewinner-Stand", gewinner.length === 1 && verlierer.length === 1 && verlierer[0].k.konflikte[0].server.name === e9.name && /war hier/.test(e9.name), `${w1.status}/${w2.status} -> ${e9 && e9.name}`);

  /* (A14) */
  const seite = await fetch(B + "/status"); const html = await seite.text();
  /* Zeit in Serverzeit „dd.mm.yyyy hh:mm Uhr“ – nicht der ISO-Stempel (Roberto sah 13:43 statt 15:43, 30.09.) */
  ok("(A14) /status ist eine Seite mit beiden Standorten und Serverzeit", seite.status === 200 && /BTA-Cockpit-Dienst/.test(html) && /Scheurich/.test(html) && /Soendgen/.test(html) && /Läuft seit \d{2}\.\d{2}\.\d{4} \d{2}:\d{2} Uhr/.test(html) && !/Läuft seit \d{4}-\d{2}-\d{2}T/.test(html), (html.match(/Läuft seit [^(]*/) || [""])[0]);
  ok("(A14) /app/ ohne App-Datei -> 404; kaputtes JSON -> 400", (await fetch(B + "/app/")).status === 404 && (await fetch(B + "/api/scheurich/aenderungen", { method: "POST", body: "{kaputt", headers: { "Content-Type": "application/json" } })).status === 400);

  kind.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 300));
  const protokoll = fs.readdirSync(einst.protokollOrdner);
  ok("(E) Protokoll geschrieben, keine Fehlerzeile", protokoll.length === 1 && !/ FEHL /.test(fs.readFileSync(path.join(einst.protokollOrdner, protokoll[0]), "utf8")), protokoll.join(","));
  fs.rmSync(ORDNER, { recursive: true, force: true });
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
