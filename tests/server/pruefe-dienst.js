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
  schluessel: "pruef-schluessel", // Werkstatt-Schlüssel: jede POST-Anfrage im Prüfstand trägt ihn (B6 prüft das Fehlen)
  standorte: { scheurich: { name: "Scheurich", datenOrdner: path.join(ORDNER, "BTA-Scheurich") }, soendgen: { name: "Soendgen Keramik", datenOrdner: path.join(ORDNER, "BTA-Soendgen") } },
};
fs.writeFileSync(path.join(ORDNER, "einstellungen.json"), JSON.stringify(einst));
const B = `http://127.0.0.1:${PORT}`;
const holen = async (weg, opt) => { const r = await fetch(B + weg, opt); let k = null; try { k = await r.json(); } catch (e) { k = null; } return { status: r.status, k }; };
const post = (weg, daten, kopf = { "X-BTA-Schluessel": "pruef-schluessel" }) => holen(weg, { method: "POST", headers: { "Content-Type": "application/json", ...kopf }, body: JSON.stringify(daten) });
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

  /* (B1)-(B4) Etappe B: Vorschau, Standort-Wächter, Nachweis, Vergleicher */
  const dateiB = { ...datei, entries: datei.entries.map((e) => (e.id === "i3" ? { ...e, name: "Anlage 3 umbenannt" } : e)).concat([{ id: "neu-b", date: "2026-09-30", category: "TODO", name: "Neu aus Etappe B", updatedAt: T }]) };
  const vor = await post("/api/soendgen/import?nurPruefen=1", dateiB);
  const standNachVorschau = (await holen("/api/soendgen/export.json")).k;
  ok("(B1) Vorschau (nurPruefen=1): zählt 1 neu, 1 geändert, 50 unverändert, davon 51 fachlich + 1 Verlauf; Stand zählt wie die Kennkarte (50 fachlich, 1 Verlauf) - schreibt aber nichts",
    vor.status === 200 && vor.k.nurPruefen === true && vor.k.neu === 1 && vor.k.geaendert === 1 && vor.k.unveraendert === 50 && vor.k.wuerdeAendern === 2 && vor.k.version === 1 && vor.k.kopf && vor.k.kopf.standort === "soendgen" && vor.k.stand.vorher.eintraege === 50 && vor.k.stand.vorher.verlauf.eintraege === 1 && vor.k.davon.fachlich === 51 && vor.k.davon.verlauf === 1
      && standNachVorschau.schreibMarke === "server-1" && standNachVorschau.entries.find((e) => e.id === "i3").name === "Anlage 3",
    JSON.stringify(vor.k).slice(0, 200));
  const falsch = await post("/api/scheurich/import", datei);
  ok("(B2) Standort-Wächter: Soendgen-Datei in Scheurich -> 400 mit Hinweis, Scheurich unverändert", falsch.status === 400 && /Standort/.test(falsch.k.fehler) && (await holen("/api/scheurich/export.json")).k.entries.every((e) => !String(e.id).startsWith("i")), JSON.stringify(falsch.k));
  const echt = await post("/api/soendgen/import", dateiB);
  ok("(B3) Echter Import: 1 neu, 1 geändert -> Version 2; Nachweis 0 Abweichungen; Stand fachlich vorher 50 -> nachher 51 (+1 Verlauf); Kopf mit savedAt",
    echt.status === 200 && echt.k.neu === 1 && echt.k.geaendert === 1 && echt.k.version === 2 && echt.k.nachweis && echt.k.nachweis.abweichungen === 0 && echt.k.nachweis.eintraegeVerglichen === 52 && echt.k.stand.vorher.eintraege === 50 && echt.k.stand.nachher.eintraege === 51 && echt.k.stand.nachher.verlauf.eintraege === 1 && echt.k.kopf.savedAt === T,
    JSON.stringify({ z: echt.k.neu + "/" + echt.k.geaendert, v: echt.k.version, n: echt.k.nachweis, s: echt.k.stand }).slice(0, 220));
  /* (B5) Löschliste nach Zeitstempel wie die App (Robertos Import 30.09.: 8 von 7.306 fehlten):
     „wieder“ steht in der Löschliste (T1) UND als Eintrag mit jüngerem updatedAt (T2) -> lebt;
     „tot“ steht als Eintrag (T1) und in der Löschliste mit jüngerer Marke (T2) -> gelöscht, nicht geschrieben. */
  const T1 = "2026-09-01T00:00:00.000Z", T2 = "2026-09-20T00:00:00.000Z";
  const dateiB5 = { ...dateiB, entries: dateiB.entries.concat([{ id: "wieder", date: "2026-09-20", category: "TODO", name: "Nach dem Löschen neu angelegt", updatedAt: T2 }, { id: "tot", date: "2026-09-01", category: "TODO", name: "Gelöscht bleibt gelöscht", updatedAt: T1 }]), deleted: { ...dateiB.deleted, wieder: T1, tot: T2 } };
  const b5 = await post("/api/soendgen/import", dateiB5);
  const exB5 = (await holen("/api/soendgen/export.json")).k;
  ok("(B5) Löschliste nach Zeitstempel: „wieder“ lebt (1 neu, kein Grabstein), „tot“ verworfen (1 Grabstein, nicht geschrieben); Nachweis 0; Stand 52 fachlich",
    b5.status === 200 && b5.k.neu === 1 && b5.k.geloescht === 1 && b5.k.davon.verworfen === 1 && b5.k.davon.lebtTrotzLoeschliste === 1 && b5.k.nachweis.abweichungen === 0
      && exB5.entries.some((e) => e.id === "wieder") && !exB5.entries.some((e) => e.id === "tot") && exB5.deleted.tot === T2 && !exB5.deleted.wieder && b5.k.stand.nachher.eintraege === 52,
    JSON.stringify({ neu: b5.k.neu, gel: b5.k.geloescht, davon: b5.k.davon, n: b5.k.nachweis.abweichungen, stand: b5.k.stand.nachher.eintraege }));
  /* (B6) Werkstatt-Schlüssel (Bauplan Abschnitt 12, Lücke 1): Schreiben ohne oder
     mit falschem Schlüssel -> 401 und nichts geändert; Lesen bleibt frei. */
  const vorB6 = (await holen("/api/soendgen/stand?seit=0")).k.version;
  const ohne = await post("/api/soendgen/aenderungen", { benutzer: "Fremd", basisVersion: vorB6, eintraege: [{ id: "eindringling", date: "2026-09-30", category: "TODO", name: "ohne Schlüssel", updatedAt: T }] }, {});
  const falschS = await post("/api/soendgen/aenderungen", { benutzer: "Fremd", basisVersion: vorB6, eintraege: [{ id: "eindringling", date: "2026-09-30", category: "TODO", name: "falscher Schlüssel", updatedAt: T }] }, { "X-BTA-Schluessel": "falsch" });
  const nachB6 = (await holen("/api/soendgen/stand?seit=0")).k;
  ok("(B6) Werkstatt-Schlüssel: ohne -> 401, falsch -> 401, Version unverändert, Lesen ohne Schlüssel erlaubt",
    ohne.status === 401 && falschS.status === 401 && /Schlüssel/.test(ohne.k.fehler) && nachB6.version === vorB6 && !nachB6.eintraege.some((x) => x.id === "eindringling"),
    `ohne ${ohne.status}, falsch ${falschS.status}, Version ${vorB6} -> ${nachB6.version}`);
  // Der Vergleicher muss Abweichungen auch FINDEN (sonst wäre der Nachweis wertlos): fehlend, verändert, überzählig, Löschliste, Konfig.
  const { vergleicheV1 } = require(path.join(WURZEL, "server", "dienst.js"));
  const links = { entries: [{ id: "a", x: 1 }, { id: "b", x: 2 }, { id: "c", x: 3 }], deleted: { d: "2026-01-01T00:00:00.000Z" }, config: { team: [1, 2] } };
  const rechts = { entries: [{ id: "a", x: 1 }, { id: "b", x: 99 }, { id: "z", x: 0 }], deleted: {}, config: { team: [1] } };
  const v = vergleicheV1(links, rechts);
  ok("(B4) Vergleicher findet 5 Abweichungen (c fehlt, b anders, z überzählig, Löschliste d, Konfig team) und 0 bei Gleichheit", v.abweichungen === 5 && vergleicheV1(links, JSON.parse(JSON.stringify(links))).abweichungen === 0, v.beispiele.join(" | "));

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
  /* Dateiname in Serverzeit (Roberto sah „13-57“ um 15:57, 30.09.) - mit TZ=Europe/Berlin laufen lassen, sonst ist UTC = Ortszeit */
  const jetzt = new Date(), z = (n) => String(n).padStart(2, "0");
  const erwartetStunde = `${jetzt.getFullYear()}-${z(jetzt.getMonth() + 1)}-${z(jetzt.getDate())}-${z(jetzt.getHours())}-`;
  ok("(A12) Sicherungsname trägt die Serverzeit, nicht die Weltzeit", dateien.every((n) => n.startsWith(erwartetStunde)), `${dateien[0]} ↔ erwartet ${erwartetStunde}… (TZ=${process.env.TZ || "System"})`);
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
  ok("(A14) /app/ ohne App-Datei -> 404; kaputtes JSON -> 400", (await fetch(B + "/app/")).status === 404 && (await fetch(B + "/api/scheurich/aenderungen", { method: "POST", body: "{kaputt", headers: { "Content-Type": "application/json", "X-BTA-Schluessel": "pruef-schluessel" } })).status === 400);

  kind.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 300));
  const protokoll = fs.readdirSync(einst.protokollOrdner);
  ok("(E) Protokoll geschrieben, keine Fehlerzeile", protokoll.length === 1 && !/ FEHL /.test(fs.readFileSync(path.join(einst.protokollOrdner, protokoll[0]), "utf8")), protokoll.join(","));
  fs.rmSync(ORDNER, { recursive: true, force: true });
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
