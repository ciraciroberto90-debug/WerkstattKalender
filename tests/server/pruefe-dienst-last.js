// Prüfstand: DIENST UNTER LAST (Etappe A, Bauplan Abschnitt 7 „Last")
//
// Zwei Bestände aus dem Langzeit-Generator (tools/langzeit-daten.js, ohne
// Zufall, wie die Messfahrt vom 11.09.):
//   „heute“  ≈ 7.300 Einträge + 2.900 Störberichte  (Robertos Stand 29.09.: 7.285 / 2.908)
//   „71k“    ≈ 31.000 Einträge + 2.700 Störberichte  (die 4.500-je-Jahr-Rate über 7 Jahre)
// Gemessen werden Import, Vollbestand (stand?seit=0), Delta nach einer
// Änderung, Export und der Import→Export-Vergleich. Die Zahlen stehen im
// Protokoll - sie sind die Messlatte gegen die Datei-Fassung (Start 787 ms,
// Lesen 110 ms bei 4,6 MB, gemessen 29.09.).
//  (L1) Import „heute“: 0 Abweichungen Import→Export, unter 20 s.
//  (L2) Vollbestand „heute“ unter 2 s.
//  (L3) Delta nach einer Änderung unter 300 ms und nur 1 Eintrag groß.
//  (L4) Import „71k“: 0 Abweichungen, unter 60 s; Vollbestand unter 5 s.
//  (L5) 200 Änderungen nacheinander (wie ein Arbeitstag): jede unter 200 ms im Mittel.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const WURZEL = path.resolve(__dirname, "..", "..");
const { baueBestand, baueStoerungen } = require(path.join(WURZEL, "tools", "langzeit-daten.js"));
const PORT = 19765 + Math.floor(Math.random() * 1000);
const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), "bta-last-"));
fs.writeFileSync(path.join(ORDNER, "einstellungen.json"), JSON.stringify({
  port: PORT, host: "127.0.0.1", protokollOrdner: path.join(ORDNER, "protokoll"), sicherungOrdner: path.join(ORDNER, "sicherung"), sicherungUhrzeit: "99:99",
  standorte: { heute: { name: "Heute", datenOrdner: path.join(ORDNER, "heute") }, gross: { name: "71k", datenOrdner: path.join(ORDNER, "gross") } },
}));
const B = `http://127.0.0.1:${PORT}`;
const ms = () => Number(process.hrtime.bigint() / 1000000n);
const post = async (weg, daten) => { const t = ms(); const r = await fetch(B + weg, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(daten) }); const k = await r.json(); return { status: r.status, k, ms: ms() - t }; };
const hol = async (weg) => { const t = ms(); const r = await fetch(B + weg); const text = await r.text(); return { status: r.status, k: JSON.parse(text), bytes: text.length, ms: ms() - t }; };
const vergleich = (a, b) => { const A = new Map(a.map((x) => [x.id, JSON.stringify(x)])); const B2 = new Map(b.map((x) => [x.id, JSON.stringify(x)])); let n = 0; for (const [id, s] of A) if (B2.get(id) !== s) n++; for (const id of B2.keys()) if (!A.has(id)) n++; return n; };

(async () => {
  const kind = spawn(process.execPath, ["--no-warnings", path.join(WURZEL, "server", "dienst.js"), path.join(ORDNER, "einstellungen.json")], { stdio: "ignore" });
  let bereit = false;
  for (let i = 0; i < 60 && !bereit; i++) { await new Promise((r) => setTimeout(r, 100)); try { bereit = (await fetch(B + "/api/status")).ok; } catch (e) { /* noch nicht */ } }
  if (!bereit) { console.log("FAIL | Dienst kam nicht hoch"); kind.kill(); process.exit(1); }
  const T = "2026-09-30T10:00:00.000Z";
  const mitStempel = (l) => l.map((e) => ({ ...e, updatedAt: e.updatedAt || T }));

  /* (L1)(L2)(L3) heute */
  const heute = baueBestand({ jeJahr: 1030 });
  const heuteStoer = baueStoerungen();
  const dateiH = { format: "werkstatt-kalender-v1", standort: "heute", savedAt: T, entries: mitStempel(heute.entries), deleted: {}, config: { team: heute.team } };
  const dateiHS = { format: "werkstatt-stoerungen-v1", standort: "heute", savedAt: T, entries: mitStempel(heuteStoer), deleted: {}, config: {} };
  const kbH = Math.round((JSON.stringify(dateiH).length + JSON.stringify(dateiHS).length) / 1024);
  let i1 = await post("/api/heute/import?bereich=kalender", dateiH);
  let i2 = await post("/api/heute/import?bereich=stoerungen", dateiHS);
  const exH = await hol("/api/heute/export.json?bereich=kalender");
  const exHS = await hol("/api/heute/export.json?bereich=stoerungen");
  const abwH = vergleich(dateiH.entries, exH.k.entries) + vergleich(dateiHS.entries, exHS.k.entries);
  console.log(`MESSUNG heute: ${dateiH.entries.length} Einträge + ${dateiHS.entries.length} Störberichte, ${kbH} kB JSON · Import ${i1.ms} + ${i2.ms} ms · Export ${exH.ms} + ${exHS.ms} ms`);
  ok(`(L1) Import „heute“ (${dateiH.entries.length} + ${dateiHS.entries.length}): 0 Abweichungen, unter 20 s`, i1.status === 200 && i2.status === 200 && abwH === 0 && i1.ms + i2.ms < 20000, `Abweichungen ${abwH}, ${i1.ms + i2.ms} ms`);
  const vollH = await hol("/api/heute/stand?seit=0");
  console.log(`MESSUNG heute: Vollbestand stand?seit=0 ${vollH.ms} ms, ${Math.round(vollH.bytes / 1024)} kB`);
  ok("(L2) Vollbestand „heute“ unter 2 s", vollH.status === 200 && vollH.k.eintraege.length === dateiH.entries.length && vollH.ms < 2000, `${vollH.ms} ms`);
  const v0 = vollH.k.version;
  const a1 = await post("/api/heute/aenderungen", { benutzer: "Chef", basisVersion: v0, eintraege: [{ id: "neu-1", date: "2026-09-30", category: "TODO", name: "Filter", updatedAt: T }] });
  const delta = await hol(`/api/heute/stand?seit=${v0}`);
  console.log(`MESSUNG heute: eine Änderung ${a1.ms} ms · Delta ${delta.ms} ms, ${delta.bytes} Bytes`);
  ok("(L3) Delta nach einer Änderung: 1 Eintrag, unter 300 ms", delta.k.eintraege.length === 1 && delta.k.eintraege[0].id === "neu-1" && delta.ms < 300 && a1.ms < 500, `${delta.ms} ms, Änderung ${a1.ms} ms`);

  /* (L4) 71k */
  const gross = baueBestand();
  const dateiG = { format: "werkstatt-kalender-v1", standort: "gross", savedAt: T, entries: mitStempel(gross.entries), deleted: {}, config: { team: gross.team } };
  const kbG = Math.round(JSON.stringify(dateiG).length / 1024);
  const i3 = await post("/api/gross/import?bereich=kalender", dateiG);
  const exG = await hol("/api/gross/export.json?bereich=kalender");
  const abwG = vergleich(dateiG.entries, exG.k.entries);
  const vollG = await hol("/api/gross/stand?seit=0");
  const dbBytes = (await hol("/api/status")).k.standorte.gross.bytes;
  console.log(`MESSUNG 71k: ${dateiG.entries.length} Einträge, ${kbG} kB JSON · Import ${i3.ms} ms · Export ${exG.ms} ms · Vollbestand ${vollG.ms} ms, ${Math.round(vollG.bytes / 1024)} kB · Datenbank ${Math.round(dbBytes / 1024 / 1024)} MB`);
  ok(`(L4) Import „71k“ (${dateiG.entries.length}): 0 Abweichungen, unter 60 s; Vollbestand unter 5 s`, i3.status === 200 && abwG === 0 && i3.ms < 60000 && vollG.ms < 5000, `Abweichungen ${abwG}, Import ${i3.ms} ms, Voll ${vollG.ms} ms`);

  /* (L5) 200 Änderungen nacheinander auf dem großen Bestand */
  let v = vollG.k.version; const zeiten = [];
  for (let i = 0; i < 200; i++) {
    const r = await post("/api/gross/aenderungen", { benutzer: "Tag", basisVersion: v, eintraege: [{ id: "tag-" + i, date: "2026-09-30", category: "TODO", name: "Aufgabe " + i, updatedAt: T }] });
    v = r.k.version; zeiten.push(r.ms);
  }
  const mittel = Math.round(zeiten.reduce((a, b) => a + b, 0) / zeiten.length), max = Math.max(...zeiten);
  console.log(`MESSUNG 71k: 200 Änderungen nacheinander · Mittel ${mittel} ms · Max ${max} ms`);
  ok("(L5) 200 Änderungen: Mittel unter 200 ms", mittel < 200, `Mittel ${mittel} ms, Max ${max} ms`);

  kind.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 300));
  fs.rmSync(ORDNER, { recursive: true, force: true });
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
