/* Baut eine echte .xlsx als Prüfmuster - ohne fremde Bibliothek, damit der
   Test dasselbe Format vor sich hat wie die Werkstatt.
   Verwendet in tests/hardness/harte-40-oee-excel.js. */
const zlib = require("zlib");

function crc32(buf) {
  let c, tabelle = crc32.t;
  if (!tabelle) {
    tabelle = crc32.t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelle[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = tabelle[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* dateien: { "pfad" : "inhalt" } -> Buffer mit dem ZIP-Archiv */
function zipBauen(dateien, { unkomprimiert = false } = {}) {
  const stuecke = [];
  const verzeichnis = [];
  let versatz = 0;
  for (const [pfad, inhalt] of Object.entries(dateien)) {
    const name = Buffer.from(pfad, "utf8");
    const roh = Buffer.from(inhalt, "utf8");
    const daten = unkomprimiert ? roh : zlib.deflateRawSync(roh);
    const method = unkomprimiert ? 0 : 8;
    const crc = crc32(roh);
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0);
    lokal.writeUInt16LE(20, 4);
    lokal.writeUInt16LE(method, 8);
    lokal.writeUInt32LE(crc, 14);
    lokal.writeUInt32LE(daten.length, 18);
    lokal.writeUInt32LE(roh.length, 22);
    lokal.writeUInt16LE(name.length, 26);
    stuecke.push(lokal, name, daten);
    const zentral = Buffer.alloc(46);
    zentral.writeUInt32LE(0x02014b50, 0);
    zentral.writeUInt16LE(20, 4);
    zentral.writeUInt16LE(20, 6);
    zentral.writeUInt16LE(method, 10);
    zentral.writeUInt32LE(crc, 16);
    zentral.writeUInt32LE(daten.length, 20);
    zentral.writeUInt32LE(roh.length, 24);
    zentral.writeUInt16LE(name.length, 28);
    zentral.writeUInt32LE(versatz, 42);
    verzeichnis.push(zentral, name);
    versatz += lokal.length + name.length + daten.length;
  }
  const vz = Buffer.concat(verzeichnis);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(Object.keys(dateien).length, 8);
  ende.writeUInt16LE(Object.keys(dateien).length, 10);
  ende.writeUInt32LE(vz.length, 12);
  ende.writeUInt32LE(versatz, 16);
  return Buffer.concat([...stuecke, vz, ende]);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const spalte = (i) => {
  let s = "";
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
};
// Excel zählt Tage ab dem 30.12.1899
const alsSerie = (d) => Math.round((d.getTime() - Date.UTC(1899, 11, 30)) / 86400000);

/* zeilen: Array von Arrays. Zellen: Zahl, String, {datum: Date} oder
   {prozent: 0.87} (als Prozent formatiert, wie es Excel tut). */
function arbeitsmappeBauen(blaetter, optionen = {}) {
  const texte = [];
  const textIndex = new Map();
  const textNr = (s) => {
    if (!textIndex.has(s)) { textIndex.set(s, texte.length); texte.push(s); }
    return textIndex.get(s);
  };

  const blattXml = (zeilen) => {
    const zs = zeilen.map((zeile, r) => {
      const cs = zeile.map((wert, c) => {
        const ref = spalte(c) + (r + 1);
        if (wert == null || wert === "") return "";
        if (wert && wert.datum) return `<c r="${ref}" s="1"><v>${alsSerie(wert.datum)}</v></c>`;
        if (wert && wert.prozent !== undefined) return `<c r="${ref}" s="2"><v>${wert.prozent}</v></c>`;
        if (typeof wert === "number") return `<c r="${ref}"><v>${wert}</v></c>`;
        return `<c r="${ref}" t="s"><v>${textNr(String(wert))}</v></c>`;
      }).join("");
      return `<row r="${r + 1}">${cs}</row>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${zs}</sheetData></worksheet>`;
  };

  const blattDateien = {};
  const sheetEintraege = [];
  const relEintraege = [];
  blaetter.forEach((b, i) => {
    blattDateien[`xl/worksheets/sheet${i + 1}.xml`] = blattXml(b.zeilen);
    sheetEintraege.push(`<sheet name="${esc(b.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`);
    relEintraege.push(`<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`);
  });

  const dateien = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEintraege.join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relEintraege.join("")}</Relationships>`,
    // Stil 1 = Datum (eingebautes Format 14), Stil 2 = Prozent (eigenes Format)
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    ...blattDateien,
  };
  dateien["xl/sharedStrings.xml"] = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${texte.length}" uniqueCount="${texte.length}">${texte.map((t) => `<si><t>${esc(t)}</t></si>`).join("")}</sst>`;
  return zipBauen(dateien, optionen);
}

module.exports = { arbeitsmappeBauen, zipBauen };
