/* Excel-Dateien (.xlsx) lesen - ohne fremde Bibliothek.
 *
 * Warum von Hand: Die App ist eine einzige HTML-Datei, die ohne Installation
 * und ohne Anfrage an die IT laufen muss. Eine Tabellen-Bibliothek würde sie
 * um ein Vielfaches aufblähen und wäre ein weiteres Stück fremder Code im
 * Werksnetz. Chrome bringt alles Nötige mit: DecompressionStream zum
 * Auspacken, DOMParser zum Lesen des XML.
 *
 * Eine .xlsx ist ein ZIP-Archiv mit XML darin:
 *   xl/workbook.xml          - welche Blätter gibt es, wie heißen sie
 *   xl/_rels/workbook.xml.rels - welches Blatt liegt in welcher Datei
 *   xl/sharedStrings.xml     - alle Texte, die Zellen verweisen nur mit Nummer
 *   xl/styles.xml            - Zahlenformate (nur so erkennt man ein Datum)
 *   xl/worksheets/sheetN.xml - die Zellen selbst
 *
 * Gelesen wird nur. Es wird nie in die Tabelle zurückgeschrieben - die
 * Datei gehört jemand anderem, und ein Schreibversuch aus dem Browser wäre
 * genau die Art von Überraschung, die niemand in der Werkstatt braucht.
 */

/* ---------- ZIP auspacken ---------- */

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;

// Das Inhaltsverzeichnis steht am ENDE der Datei, hinter einem Kommentar
// beliebiger Länge - deshalb wird von hinten gesucht.
function findeEOCD(dv) {
  const min = Math.max(0, dv.byteLength - 65557); // 22 Byte + max. Kommentar
  for (let i = dv.byteLength - 22; i >= min; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) return i;
  }
  return -1;
}

async function auspacken(buf, method, von, laenge) {
  const roh = new Uint8Array(buf, von, laenge);
  if (method === 0) return roh.slice();            // unkomprimiert abgelegt
  if (method !== 8) throw new Error(`Unbekanntes Packverfahren (${method}) in der Excel-Datei`);
  // "deflate-raw" - ohne zlib-Kopf, genau so legt ZIP die Daten ab
  const strom = new Blob([roh]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(strom).arrayBuffer());
}

/* Liest das Archiv in eine Zuordnung "Pfad -> Bytes". */
async function zipLesen(buf) {
  const dv = new DataView(buf);
  const eocd = findeEOCD(dv);
  if (eocd < 0) throw new Error("Das ist keine Excel-Datei (kein ZIP-Verzeichnis gefunden)");
  let anzahl = dv.getUint16(eocd + 10, true);
  let start = dv.getUint32(eocd + 16, true);
  // ZIP64 (sehr große Archive): Die echten Werte stehen dann woanders. Für
  // Schichtdaten praktisch nie der Fall - dann lieber klar melden als raten.
  if (start === 0xffffffff || anzahl === 0xffff) {
    throw new Error("Die Excel-Datei ist im ZIP64-Format - bitte in Excel einmal neu speichern");
  }
  const dateien = new Map();
  let p = start;
  for (let i = 0; i < anzahl; i++) {
    if (dv.getUint32(p, true) !== SIG_CEN) break;
    const method = dv.getUint16(p + 10, true);
    const komprimiert = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const kommLen = dv.getUint16(p + 32, true);
    const lokal = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen));
    // Im lokalen Kopf stehen Name und Extrafeld u. U. anders lang als im
    // Verzeichnis - beides muss einzeln übersprungen werden.
    const lNameLen = dv.getUint16(lokal + 26, true);
    const lExtraLen = dv.getUint16(lokal + 28, true);
    const datenVon = lokal + 30 + lNameLen + lExtraLen;
    dateien.set(name, { method, datenVon, komprimiert });
    p += 46 + nameLen + extraLen + kommLen;
  }
  return {
    async text(pfad) {
      const e = dateien.get(pfad);
      if (!e) return null;
      return new TextDecoder().decode(await auspacken(buf, e.method, e.datenVon, e.komprimiert));
    },
    hat: (pfad) => dateien.has(pfad),
    pfade: () => [...dateien.keys()],
  };
}

/* ---------- XML lesen ---------- */

function xml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Die Excel-Datei ist beschädigt (XML nicht lesbar)");
  return doc;
}

// "BC" -> 54. Spaltenbuchstaben sind ein Zahlensystem zur Basis 26 ohne Null.
function spalteZuIndex(bez) {
  let n = 0;
  for (const z of bez) {
    const c = z.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/* Zahlenformate: Nur am Format erkennt man, ob 45870 eine Stückzahl oder der
   5. August 2025 ist. Die eingebauten Format-Nummern 14-22 und 45-47 sind
   Datums-/Zeitformate; eigene Formate erkennt man am y/m/d im Muster. */
const EINGEBAUTE_DATUMSFORMATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function leseStile(doc) {
  if (!doc) return { istDatum: () => false };
  const eigene = new Map();
  doc.querySelectorAll("numFmt").forEach((n) => {
    eigene.set(Number(n.getAttribute("numFmtId")), String(n.getAttribute("formatCode") || ""));
  });
  const xfs = [];
  const liste = doc.querySelector("cellXfs");
  if (liste) liste.querySelectorAll("xf").forEach((x) => xfs.push(Number(x.getAttribute("numFmtId") || 0)));
  return {
    istDatum(stilIndex) {
      if (stilIndex == null || stilIndex === "") return false;
      const id = xfs[Number(stilIndex)];
      if (id == null) return false;
      if (EINGEBAUTE_DATUMSFORMATE.has(id)) return true;
      const muster = eigene.get(id);
      if (!muster) return false;
      // Anführungszeichen und [rot] o. ä. raus, sonst zählt ein "Mio" als Monat
      const blank = muster.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
      return /[ymdhs]/i.test(blank) && !/^[#0.,%\s]*$/.test(blank);
    },
  };
}

/* Excel zählt Tage ab dem 30.12.1899 (und glaubt, 1900 sei ein Schaltjahr -
   der Versatz 25569 auf die Unix-Zeit fängt das für alle Daten ab dem
   01.03.1900 auf, und ältere kommen in Schichtdaten nicht vor). */
function serieZuDatum(zahl) {
  const ms = Math.round((zahl - 25569) * 86400000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function leseSharedStrings(doc) {
  if (!doc) return [];
  const raus = [];
  doc.querySelectorAll("sst > si").forEach((si) => {
    // Formatierter Text liegt in mehreren <t>-Stücken (<r><t>…</t></r>).
    // <rPh> ist die japanische Lesehilfe und gehört NICHT zum Text.
    si.querySelectorAll("rPh").forEach((n) => n.remove());
    let s = "";
    si.querySelectorAll("t").forEach((t) => { s += t.textContent; });
    raus.push(s);
  });
  return raus;
}

function leseBlatt(doc, texte, stile) {
  const zeilen = [];
  doc.querySelectorAll("sheetData > row").forEach((row) => {
    const nr = Number(row.getAttribute("r") || 0);
    const zeile = [];
    row.querySelectorAll("c").forEach((c) => {
      const bez = c.getAttribute("r") || "";
      const idx = bez ? spalteZuIndex(bez) : zeile.length;
      const typ = c.getAttribute("t");
      const vEl = c.querySelector("v");
      let wert = null;
      if (typ === "s") {
        const i = Number(vEl ? vEl.textContent : -1);
        wert = texte[i] != null ? texte[i] : "";
      } else if (typ === "inlineStr") {
        const isEl = c.querySelector("is");
        let s = "";
        if (isEl) isEl.querySelectorAll("t").forEach((t) => { s += t.textContent; });
        wert = s;
      } else if (typ === "str") {
        wert = vEl ? vEl.textContent : "";      // Ergebnis einer Formel
      } else if (typ === "b") {
        wert = vEl && vEl.textContent === "1";
      } else if (typ === "e") {
        wert = null;                             // #DIV/0! o. ä. - wie leer behandeln
      } else if (vEl) {
        const zahl = Number(vEl.textContent);
        wert = Number.isNaN(zahl) ? vEl.textContent : (stile.istDatum(c.getAttribute("s")) ? serieZuDatum(zahl) : zahl);
      }
      if (idx >= 0) zeile[idx] = wert;
    });
    // Leere Zeilen zwischen Daten behalten ihre Position (r=…), sonst
    // verschiebt sich alles, sobald jemand eine Zeile freigelassen hat.
    if (nr > 0) zeilen[nr - 1] = zeile;
    else zeilen.push(zeile);
  });
  for (let i = 0; i < zeilen.length; i++) if (!zeilen[i]) zeilen[i] = [];
  return zeilen;
}

/* ---------- Öffentlich ---------- */

/* Liest eine .xlsx und gibt die Blätter mit ihren Zeilen zurück.
   blatt = { name, zeilen: [[Zelle, …], …] } - Zellen sind Zahl, Text,
   Date oder null. */
export async function leseArbeitsmappe(fileOderBuffer) {
  const buf = fileOderBuffer instanceof ArrayBuffer
    ? fileOderBuffer
    : await fileOderBuffer.arrayBuffer();
  const zip = await zipLesen(buf);

  const wbText = await zip.text("xl/workbook.xml");
  if (!wbText) throw new Error("Das ist keine Excel-Arbeitsmappe (xl/workbook.xml fehlt)");
  const wb = xml(wbText);

  // Beziehungs-Kennung -> Dateiname des Blattes
  const rels = new Map();
  const relText = await zip.text("xl/_rels/workbook.xml.rels");
  if (relText) {
    xml(relText).querySelectorAll("Relationship").forEach((r) => {
      rels.set(r.getAttribute("Id"), String(r.getAttribute("Target") || "").replace(/^\/?xl\//, "").replace(/^\//, ""));
    });
  }

  const texte = leseSharedStrings(await zip.text("xl/sharedStrings.xml").then((t) => (t ? xml(t) : null)));
  const stile = leseStile(await zip.text("xl/styles.xml").then((t) => (t ? xml(t) : null)));

  const blaetter = [];
  const sheetEls = [...wb.querySelectorAll("sheets > sheet")];
  for (let i = 0; i < sheetEls.length; i++) {
    const el = sheetEls[i];
    const name = el.getAttribute("name") || `Tabelle${i + 1}`;
    // Ausgeblendete Blätter sind meist Hilfstabellen - mitlesen, aber merken.
    const versteckt = (el.getAttribute("state") || "") !== "";
    const rid = el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
      || el.getAttribute("r:id");
    let pfad = rels.get(rid);
    if (!pfad || !zip.hat("xl/" + pfad)) pfad = `worksheets/sheet${i + 1}.xml`;
    const text = await zip.text("xl/" + pfad);
    if (!text) continue;
    blaetter.push({ name, versteckt, zeilen: leseBlatt(xml(text), texte, stile) });
  }
  if (blaetter.length === 0) throw new Error("Die Excel-Datei enthält kein lesbares Tabellenblatt");
  return { blaetter };
}

/* ---------- Spalten erkennen ---------- */

/* Aus einer Tabelle die Kopfzeile heraussuchen: die erste Zeile, die
   mindestens zwei Texte enthält. Reine Titelzeilen ("OEE Auswertung KW32")
   haben nur eine gefüllte Zelle und werden dadurch übersprungen. */
export function findeKopfzeile(zeilen) {
  for (let i = 0; i < Math.min(zeilen.length, 30); i++) {
    const texte = (zeilen[i] || []).filter((z) => typeof z === "string" && z.trim().length > 0);
    if (texte.length >= 2) return i;
  }
  return -1;
}

/* Pivot-Tabellen haben keinen einzeiligen Kopf: Oben stehen Gruppen
   ("DREH", "Gesamt: OEE%n"), darunter je Block "Gutm. | OEE_M | OEE%n",
   und die Datumsspalte trägt ihre Beschriftung wieder woanders. Gemessen an
   Robertos OEE-Auswertung: Wer nur EINE Zeile als Kopf nimmt, sieht die
   Hälfte der Spalten nicht.
   Deshalb: Der Kopf ist der BEREICH von der ersten Zeile mit mehreren
   Texten bis zur ersten Datenzeile (erste Zeile mit einem Datum oder
   überwiegend Zahlen). Je Spalte werden die Texte des Bereichs
   untereinander zusammengesetzt - aus "Gesamt:" über "OEE%n" wird
   "Gesamt: OEE%n", und jede Spalte hat eine Beschriftung. */
export function findeKopfbereich(zeilen) {
  const istDatenzeile = (zeile) => {
    let daten = 0;
    let zahlen = 0;
    for (const z of zeile || []) {
      if (z instanceof Date) daten++;
      else if (typeof z === "number") zahlen++;
    }
    return daten > 0 || zahlen >= 3;
  };
  const start = findeKopfzeile(zeilen);
  if (start < 0) return { kopfzeile: -1, kopf: [] };
  let ende = start;
  for (let i = start; i < Math.min(zeilen.length, start + 8); i++) {
    if (istDatenzeile(zeilen[i] || [])) break;
    ende = i;
  }
  const kopf = [];
  for (let i = start; i <= ende; i++) {
    (zeilen[i] || []).forEach((z, spalte) => {
      if (typeof z !== "string" || !z.trim()) return;
      kopf[spalte] = kopf[spalte] ? kopf[spalte] + " " + z.trim() : z.trim();
    });
  }
  return { kopfzeile: ende, kopf };
}

const SUCHWORTE = {
  // "zeit" allein wäre zu gierig - es steckt auch in "Ausfallzeit" und
  // "Laufzeit", und die sind etwas ganz anderes.
  zeit: ["uhrzeit", "startzeit", "beginn", "zeitstempel"],
  datum: ["datum", "tag", "date", "schichttag"],
  anlage: ["anlage", "maschine", "linie", "equipment", "kostenstelle", "arbeitsplatz"],
  schicht: ["schicht", "shift"],
  // Das LÄNGSTE passende Suchwort gewinnt. In der Pivot heißen die Spalten
  // "OEE_M" und "OEE%n" je Anlage plus "Gesamt: OEE%n" rechts - gesucht wird
  // deshalb zuerst die Gesamt-Spalte, dann die normierte (%n), dann irgendein
  // "OEE". (Die Normierung unten wirft Sonderzeichen raus: "Gesamt: OEE%n"
  // wird zu "gesamtoeen".)
  oee: ["gesamtoeen", "oeegesamt", "oeen", "oee", "gesamtanlageneffektivität", "gae"],
  verfuegbarkeit: ["verfügbarkeit", "verfuegbarkeit", "availability", "vgrad"],
  leistung: ["leistung", "performance", "lgrad"],
  qualitaet: ["qualität", "qualitaet", "quality", "qgrad"],
};

/* Ordnet den gesuchten Größen eine Spaltennummer zu. Rückgabe z. B.
   { datum: 0, anlage: 1, oee: 5 }. Was nicht gefunden wird, fehlt - die
   Zuordnung lässt sich in den Einstellungen von Hand nachziehen. */
export function erkenneSpalten(kopf) {
  // Alles außer Buchstaben/Ziffern fliegt raus - "Gesamt: OEE%n" und
  // "gesamtoeen" sollen sich treffen, egal wie Excel es schreibt.
  const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  const zellen = (kopf || []).map(norm);
  const treffer = {};
  Object.entries(SUCHWORTE).forEach(([feld, worte]) => {
    let besteSpalte = -1;
    let besteLaenge = -1;
    zellen.forEach((z, i) => {
      if (!z) return;
      worte.forEach((w) => {
        const gesucht = norm(w);
        if (!z.includes(gesucht)) return;
        // Das längste passende Suchwort gewinnt: "verfügbarkeitsgrad" soll
        // nicht als "grad"-Zufallstreffer bei einer anderen Spalte landen.
        if (gesucht.length > besteLaenge) { besteLaenge = gesucht.length; besteSpalte = i; }
      });
    });
    if (besteSpalte >= 0) treffer[feld] = besteSpalte;
  });
  // "Datum/Schicht" beschriftet in der Pivot EINE Spalte - dann gehört sie
  // dem Datum, und die Schichtnamen darunter sind Zeilen, keine Spalte.
  if (treffer.schicht != null && treffer.schicht === treffer.datum) delete treffer.schicht;
  return treffer;
}

/* Prozentwerte kommen in zwei Schreibweisen: 0,87 (als Prozent formatiert)
   oder 87. Beides soll dieselbe Zahl ergeben. */
export function alsProzent(wert) {
  if (wert == null || wert === "") return null;
  let z = typeof wert === "number" ? wert : Number(String(wert).replace("%", "").replace(",", ".").trim());
  if (Number.isNaN(z)) return null;
  if (z > 0 && z <= 1.5) z = z * 100;    // 0,87 -> 87 (1,5 lässt Luft für 105 %-Ausreißer)
  if (z < 0 || z > 200) return null;
  return Math.round(z * 10) / 10;
}

/* Excel-Zelle -> Tagesschlüssel "2026-08-05". Akzeptiert Date, Serienzahl
   und die gängigen Schreibweisen als Text. */
export function alsTagesschluessel(wert) {
  if (wert == null || wert === "") return null;
  let d = null;
  if (wert instanceof Date) d = wert;
  else if (typeof wert === "number") d = serieZuDatum(wert);
  else {
    const s = String(wert).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);
    if (m) {
      const jahr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return `${jahr}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
    }
    const p = Date.parse(s);
    if (!Number.isNaN(p)) d = new Date(p);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  // Ortszeit, nicht UTC: Ein Datum ohne Uhrzeit landet sonst je nach
  // Zeitzone einen Tag daneben.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Tagesbeginn einer Schichtbezeichnung - dieselben Grenzen wie überall in der
   App (6 / 14 / 22 Uhr). Damit bekommt auch eine Tabelle ohne Uhrzeitspalte
   einen brauchbaren Zeitpunkt, sobald sie die Schicht nennt. */
const SCHICHT_BEGINN = [
  [/fr(ü|ue)h|f$|^f\b|morgen/i, 6],
  [/sp(ä|ae)t|^s\b/i, 14],
  [/nacht|^n\b/i, 22],
];
function schichtStunde(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  for (const [muster, stunde] of SCHICHT_BEGINN) if (muster.test(s)) return stunde;
  return null;
}

/* Bruchteil eines Excel-Tages (0,5 = 12:00) oder "07:30" als Minuten. */
function alsTageszeit(wert) {
  if (wert == null || wert === "") return null;
  if (wert instanceof Date) return wert.getHours() * 60 + wert.getMinutes();
  if (typeof wert === "number") {
    const bruch = wert - Math.floor(wert);
    return Math.round(bruch * 24 * 60);
  }
  const m = String(wert).match(/(\d{1,2})[:.](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/* Aus Blatt + Spaltenzuordnung die Zeilen als Datensätze lesen. */
export function leseOeeZeilen(zeilen, spalten, kopfzeile) {
  const start = (kopfzeile == null ? findeKopfzeile(zeilen) : kopfzeile) + 1;
  const raus = [];
  for (let i = Math.max(0, start); i < zeilen.length; i++) {
    const z = zeilen[i] || [];
    const hol = (feld) => (spalten[feld] != null ? z[spalten[feld]] : undefined);
    const tag = alsTagesschluessel(hol("datum"));
    let oee = alsProzent(hol("oee"));
    const v = alsProzent(hol("verfuegbarkeit"));
    const l = alsProzent(hol("leistung"));
    const q = alsProzent(hol("qualitaet"));
    // Steht keine OEE-Spalte in der Tabelle, ergibt sie sich aus den drei
    // Faktoren - so rechnet die Werkstatt sie ohnehin aus.
    if (oee == null && v != null && l != null && q != null) {
      oee = Math.round(((v / 100) * (l / 100) * (q / 100)) * 1000) / 10;
    }
    if (oee == null) continue;
    const schicht = spalten.schicht != null && z[spalten.schicht] != null ? String(z[spalten.schicht]).trim() : "";

    /* Zeitpunkt der Zeile - nötig für ein Fenster "letzte 24 Stunden".
       Drei Quellen, in dieser Reihenfolge, weil jede genauer ist als die
       nächste: eine Uhrzeitspalte, eine Uhrzeit im Datum selbst, sonst der
       Beginn der genannten Schicht. Steht nichts davon in der Tabelle,
       bleibt es beim Tag - das wird dann auch so angezeigt und nicht als
       "letzte 24 h" ausgegeben. */
    let minuten = spalten.zeit != null ? alsTageszeit(z[spalten.zeit]) : null;
    let genau = minuten != null;
    if (minuten == null && spalten.datum != null) {
      const roh = z[spalten.datum];
      const imDatum = (roh instanceof Date && (roh.getHours() || roh.getMinutes()))
        || (typeof roh === "number" && Math.abs(roh - Math.round(roh)) > 1e-6);
      if (imDatum) { minuten = alsTageszeit(roh); genau = true; }
    }
    if (minuten == null) {
      const st = schichtStunde(schicht);
      if (st != null) { minuten = st * 60; genau = true; }
    }
    let zeitMs = null;
    if (tag) {
      const [jj, mm, tt] = tag.split("-").map(Number);
      zeitMs = new Date(jj, mm - 1, tt, 0, minuten != null ? minuten : 0).getTime();
    }

    raus.push({
      tag, zeitMs, zeitGenau: genau,
      anlage: spalten.anlage != null && z[spalten.anlage] != null ? String(z[spalten.anlage]).trim() : "",
      schicht,
      oee, verfuegbarkeit: v, leistung: l, qualitaet: q,
    });
  }
  return raus;
}
