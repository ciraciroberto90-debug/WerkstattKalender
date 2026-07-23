// Erzeugt eine echte, importierbare Störungen-Datei (werkstatt-stoerungen.json)
// im Sync-Format der App - mit den 15 Start-Störungen. Roberto kann sie als seine
// gemeinsame Störungen-Datei ablegen und später normal umpflegen.
const fs = require("fs");
const path = require("path");
const STOER = require("./demo-stoerungen.js");

// Jeder Eintrag braucht ein updatedAt (ISO) für die Zusammenführungs-Logik.
// Wir nehmen den Zeitpunkt "behoben" bzw. sonst "erfasst".
const entries = STOER.map((s) => ({
  ...s,
  updatedAt: (s.behobenAt || s.gemeldetAt || "2026-07-23T08:00:00") + (String(s.behobenAt || s.gemeldetAt || "").length === 19 ? ".000Z" : ""),
}));

const datei = {
  format: "werkstatt-stoerungen-v1",
  savedAt: new Date().toISOString(),
  entries,
  deleted: {},
  config: null,
};

const out = path.join("/home/user/WerkstattKalender", "werkstatt-stoerungen.json");
fs.writeFileSync(out, JSON.stringify(datei, null, 2));
console.log("geschrieben:", out, "-", entries.length, "Störungen");
