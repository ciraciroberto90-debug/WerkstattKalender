#!/usr/bin/env node
/* Einlese-Werkzeug für die ALTE ikom-Datenbank (Lotus Notes, "Structured
   Text"-Export) - Robertos Auftrag vom 09.09.: Die alten Störberichte und
   Zeiterfassungen sind die Wissensdatenbank der Werkstatt und müssen
   VOLLSTÄNDIG und RICHTIG ins Cockpit.

   Grundsätze (gemessen am echten Export vom 09.09., 2.787 Dokumente):
   - Jedes Dokument wird ein EIGENER Störbericht. Die alte LFDNR wird
     wiederverwendet (dieselbe Nummer trägt nachweislich verschiedene
     Störungen) - Zusammenlegen über sie würde Wissen zerstören. Eindeutiger
     Anker ist die VorgangsID (im Export 2787/2787 eindeutig).
   - NICHTS wird stillschweigend verworfen: Jedes Dokument landet im
     Ergebnis oder im Prüfbericht unter "übersprungen" mit Grund.
   - Dokumente mit Zeit-Feldern (zeDauer + Mitarbeiter) erzeugen ZUSÄTZLICH
     einen Zeiterfassungs-Eintrag (Kategorie ZEIT) mit Kostenstelle aus dem
     Maschinen-Feld ("B3 Be- und Entladeanlage 2036223" = Name + Nummer).
   - Das Werkzeug SCHREIBT NIE in Live-Dateien. Es erzeugt Prüf-Ausgaben,
     die bewusst eingespielt werden (Zeiterfassungen über den Import-Knopf
     der App; Störberichte durch Zusammenführen mit der Störungs-Datei via
     --stoerdatei).

   Aufruf:
     node tools/ikom-import.js EXPORT.txt [--bis 2026-08-31] [--von 2020-01-01]
          [--stoerdatei werkstatt-stoerungen.json] [--ziel AUSGABE-ORDNER]

   --bis/--von grenzen nach Störungs-Datum ein (z. B. um Doppel mit dem
   bereits laufenden Cockpit zu vermeiden). --stoerdatei mischt die alten
   Berichte VOR die bestehenden (Ausgabe ist eine NEUE Datei daneben). */
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const quelle = argv.find((a) => !a.startsWith("--"));
const opt = (name) => { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : null; };
if (!quelle) { console.error("Aufruf: node tools/ikom-import.js EXPORT.txt [--bis JJJJ-MM-TT] [--von JJJJ-MM-TT] [--stoerdatei DATEI] [--ziel ORDNER]"); process.exit(2); }
const von = opt("von") || "";
const bis = opt("bis") || "";
const zielOrdner = opt("ziel") || path.dirname(quelle);

/* ---- Structured Text lesen (Latin-1, Formfeed trennt Dokumente) ---- */
const roh = fs.readFileSync(quelle, "latin1");
const bloecke = roh.split("\f");
const docs = [];
const kaputt = [];
bloecke.forEach((b, i) => {
  const felder = {};
  b.split(/\r?\n/).forEach((z) => {
    const m = z.match(/^([A-Za-z_$][^:]*):\s\s?(.*)$/);
    if (m) felder[m[1]] = m[2].trim();
  });
  if (Object.keys(felder).length > 3) docs.push(felder);
  else if (b.trim()) kaputt.push({ block: i, inhalt: b.trim().slice(0, 80) });
});

/* ---- Helfer ---- */
const datumISO = (s) => {
  const m = String(s || "").match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return { tag: `${m[3]}-${m[2]}-${m[1]}`, iso: `${m[3]}-${m[2]}-${m[1]}T${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}.000Z` };
};
// "B3 Be- und Entladeanlage 2036223" -> Name + Kostenstellen-Nummer
const maschineZerlegen = (s) => {
  const m = String(s || "").trim().match(/^(.*?)\s+(\d{4,})$/);
  return m ? { name: m[1].trim(), nr: m[2] } : { name: String(s || "").trim(), nr: "" };
};
const gewerkAus = (code) => {
  const c = String(code || "").toLowerCase();
  if (c.includes("elektrisch")) return "elek";
  if (c.includes("mechanisch")) return "mech";
  return "";
};
const fehlerartAus = (code) => {
  const c = String(code || "").toLowerCase();
  if (c.includes("elektrisch")) return "Elektrisch";
  if (c.includes("mechanisch")) return "Mechanisch";
  if (c.includes("steuerung") || c.includes("software")) return "Steuerung/Software";
  return c ? "Sonstiges" : "";
};
const stundenZahl = (s) => {
  const n = Number(String(s || "").replace(".", "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const letzterSessionStempel = (d) => {
  const teile = String(d.SessionTimes || "").split(",").map((t) => datumISO(t.trim())).filter(Boolean);
  return teile.length ? teile[teile.length - 1].iso : null;
};

/* ---- Umsetzen ---- */
const stoerAlt = [];
const zeitAlt = [];
const uebersprungen = [];
const ohneVorgang = [];
docs.forEach((d, i) => {
  const sd = datumISO(d.SDatum) || datumISO(d.DocCreated);
  if (!sd) { uebersprungen.push({ grund: "kein lesbares Datum (SDatum/DocCreated)", VorgangsID: d.VorgangsID || "?", zeile: i }); return; }
  if (von && sd.tag < von) { uebersprungen.push({ grund: `vor --von ${von}`, VorgangsID: d.VorgangsID, datum: sd.tag }); return; }
  if (bis && sd.tag > bis) { uebersprungen.push({ grund: `nach --bis ${bis}`, VorgangsID: d.VorgangsID, datum: sd.tag }); return; }
  const kennung = d.VorgangsID || `ohne-vorgangsid-${i}`;
  if (!d.VorgangsID) ohneVorgang.push(i);
  const masch = maschineZerlegen(d.Maschine);
  const offen = String(d.ST_Status || "").toUpperCase() !== "OK";
  const schicht = ["Früh", "Spät", "Nacht"].includes(d.Schicht) ? d.Schicht : "Früh";
  stoerAlt.push({
    id: `ikom-${kennung}`,
    nr: String(d.LFDNR || ""),
    date: sd.tag, schicht,
    anlage: masch.name, anlagenteil: String(d.zeAnlagenteil || ""),
    gewerk: gewerkAus(d.ST_Code), fehlerart: fehlerartAus(d.ST_Code),
    stoerung: String(d.ST_Beschreibung || ""),
    ursache: String(d.ST_Ursache || ""),
    getan: String(d["SF_Maßnahme"] || ""),
    nochZuTun: offen ? String(d["ST_Maßnahme"] || "") : "",
    ersatzteile: "", nachbestellt: false,
    ausfallzeit: Math.max(0, Math.round(Number(d.Ausfallzeit) || 0)),
    melder: String(d.Bemerkung || ""),
    offen,
    gemeldetAt: sd.iso,
    behobenAt: offen ? null : (letzterSessionStempel(d) || sd.iso),
    // Herkunft bleibt nachvollziehbar - für die Wissensdatenbank und für
    // jeden späteren Abgleich mit dem alten System.
    altSystem: { vorgangsId: d.VorgangsID || "", lfdnr: String(d.LFDNR || ""), stCode: String(d.ST_Code || ""), status: String(d.ST_Status || ""), anlageBereich: String(d.Anlage || ""), werk: String(d.Werk || "") },
  });
  // Zeit-Buchung im selben Dokument?
  const dauer = stundenZahl(d.zeDauer);
  if (dauer && d.Mitarbeiter) {
    zeitAlt.push({
      id: `ikom-zeit-${kennung}`,
      category: "ZEIT", art: "arbeit",
      date: sd.tag, schicht,
      name: String(d.Mitarbeiter).trim(),
      ks: masch.name, ksNr: masch.nr,
      taetigkeit: [String(d.zeArt || "").trim(), String(d.zeNotizen || "").trim()].filter(Boolean).join(" – "),
      stunden: dauer,
      bemerkung: "",
      stoerNr: String(d.LFDNR || ""),
      altSystem: { vorgangsId: d.VorgangsID || "" },
    });
  } else if ((d.zeDauer && !dauer) || (dauer && !d.Mitarbeiter)) {
    uebersprungen.push({ grund: "Zeit-Felder unvollständig (Dauer/Mitarbeiter) - Störbericht übernommen, Zeit-Buchung NICHT", VorgangsID: d.VorgangsID, zeDauer: d.zeDauer, Mitarbeiter: d.Mitarbeiter || "" });
  }
});

/* ---- Kontrollrechnung: nichts verloren ---- */
const bilanzOk = stoerAlt.length + uebersprungen.filter((u) => !String(u.grund).startsWith("Zeit-Felder")).length === docs.length;

/* ---- Ausgaben ---- */
fs.mkdirSync(zielOrdner, { recursive: true });
const fZeit = path.join(zielOrdner, "ikom-zeiterfassungen-alt.json");
const fStoer = path.join(zielOrdner, "ikom-stoerberichte-alt.json");
fs.writeFileSync(fZeit, JSON.stringify(zeitAlt, null, 1));
fs.writeFileSync(fStoer, JSON.stringify(stoerAlt, null, 1));
let fGemischt = null;
const stoerdatei = opt("stoerdatei");
if (stoerdatei) {
  const bestehend = JSON.parse(fs.readFileSync(stoerdatei, "utf8"));
  const vorhandene = new Set(bestehend.map((s) => s.id));
  const neu = stoerAlt.filter((s) => !vorhandene.has(s.id));
  fGemischt = path.join(zielOrdner, "werkstatt-stoerungen-mit-alt.json");
  // Alt vor Neu, je Datum aufsteigend - die App sortiert ohnehin selbst.
  fs.writeFileSync(fGemischt, JSON.stringify([...neu, ...bestehend], null, 1));
}

/* ---- Prüfbericht ---- */
const jahre = {};
stoerAlt.forEach((s) => { jahre[s.date.slice(0, 4)] = (jahre[s.date.slice(0, 4)] || 0) + 1; });
const zeitJeMa = {};
zeitAlt.forEach((z) => { zeitJeMa[z.name] = Math.round(((zeitJeMa[z.name] || 0) + z.stunden) * 100) / 100; });
console.log("==== ikom-Import, Prüfbericht ====");
console.log("Quelle:", quelle);
console.log("Dokumente im Export:", docs.length, kaputt.length ? `(+${kaputt.length} unlesbare Blöcke!)` : "(alle Blöcke lesbar)");
console.log("Störberichte übernommen:", stoerAlt.length, "| Jahre:", JSON.stringify(jahre));
console.log("Zeit-Buchungen daraus:", zeitAlt.length, "| Stunden je Mitarbeiter:", JSON.stringify(zeitJeMa));
console.log("Übersprungen:", uebersprungen.length);
uebersprungen.slice(0, 10).forEach((u) => console.log("  -", JSON.stringify(u)));
if (uebersprungen.length > 10) console.log("  … und", uebersprungen.length - 10, "weitere (stehen in ikom-uebersprungen.json)");
fs.writeFileSync(path.join(zielOrdner, "ikom-uebersprungen.json"), JSON.stringify(uebersprungen, null, 1));
if (ohneVorgang.length) console.log("ACHTUNG: Dokumente ohne VorgangsID:", ohneVorgang.length);
console.log("Bilanz Dokumente = übernommen + übersprungen:", bilanzOk ? "stimmt" : "STIMMT NICHT - NICHT EINSPIELEN");
console.log("Ausgaben:", fStoer, "|", fZeit, fGemischt ? "| " + fGemischt : "");
process.exit(bilanzOk && kaputt.length === 0 ? 0 : 1);
