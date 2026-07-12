import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Printer, StickyNote, X, Download, Upload, Settings, FolderOpen, Tv } from "lucide-react";
import * as sharedFile from "./sharedfile.js";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// TPM-Anlagen: "role" steuert die Rotation, "name" ist frei änderbar in der Verwaltung.
// monday1..monday4 = Montags-Rotation (Reihenfolge!), takt = Taktstraße Rohlingsfertigung,
// b1 = flexible Beschichtung unter der Woche, flexA/flexB = alle-2-Monate-Gruppen.
const DEFAULT_TPM_ANLAGEN = [
  { id: "masseaufbereitung", name: "Masseaufbereitung", role: "flexA" },
  { id: "bts", name: "BTS", role: "takt" },
  { id: "vsm1", name: "VSM1", role: "takt" },
  { id: "vsm2", name: "VSM2", role: "takt" },
  { id: "ts200", name: "TS200", role: "takt" },
  { id: "of320", name: "OF320", role: "takt" },
  { id: "ts480", name: "TS480", role: "takt" },
  { id: "ts320", name: "TS320", role: "takt" },
  { id: "bt", name: "B+T", role: "takt" },
  { id: "rro", name: "RRO", role: "monday2" },
  { id: "hro", name: "HRO", role: "monday1" },
  { id: "b1", name: "B1", role: "b1" },
  { id: "b2", name: "B2", role: "monday3" },
  { id: "b3", name: "B3", role: "monday4" },
  { id: "wikler", name: "Wikler", role: "flexA" },
  { id: "lta1", name: "LTA1", role: "flexB" },
  { id: "lta2", name: "LTA2", role: "flexB" },
];
const ROLE_LABELS = {
  monday1: "Montags-Rotation", monday2: "Montags-Rotation", monday3: "Montags-Rotation", monday4: "Montags-Rotation",
  takt: "Taktstraße (Rohlingsfertigung)",
  b1: "Flexibel (Beschichtung, unter der Woche)",
  flexA: "Flexibel (alle 2 Monate, Gruppe A)",
  flexB: "Flexibel (alle 2 Monate, Gruppe B)",
};
const ADDABLE_ROLES = ["takt", "b1", "flexA", "flexB"];

const OTHER_VALUE = "__SONSTIGES__";

// Backlog-Arbeiten (Kategorie ARBEIT): Prioritäten und Gewerke - Felder 1:1 aus dem Excel-Arbeitsbuch
const ARBEIT_PRIO = {
  hoch: { label: "Prio 1", color: "#B23A34" },
  mittel: { label: "Prio 2", color: "#C97A2B" },
  niedrig: { label: "Prio 3", color: "#8A9099" },
  ohne: { label: "ohne Prio", color: "#D6D9DC" },
};
const ARBEIT_ART = {
  mech: { label: "Mechanisch", kurz: "Mech", color: "#3D8B8B" },
  elek: { label: "Elektrisch", kurz: "Elek", color: "#7C5CBF" },
  beide: { label: "Mech + Elek", kurz: "M+E", color: "#3D8B8B" },
  "": { label: "unbestimmt", kurz: "?", color: "#8A9099" },
};
const PRIO_REIHENFOLGE = { hoch: 0, mittel: 1, niedrig: 2, ohne: 3 };
// Gewerke des Teams - Farben passend zur Arbeits-Art im Backlog
const TEAM_ROLLEN = {
  mech: { label: "Mechaniker", color: "#3D8B8B" },
  elek: { label: "Elektriker", color: "#7C5CBF" },
  azubi: { label: "Azubi", color: "#C97A2B" },
  "": { label: "ohne Gewerk", color: "#5B6572" },
};
// Alte Team-Einträge (reine Namen) in die neue Form {name, rolle} überführen
const normalisiereTeam = (arr) => (Array.isArray(arr) ? arr : [])
  .map((t) => (typeof t === "string" ? { name: t, rolle: "" } : { name: String(t.name || ""), rolle: TEAM_ROLLEN[t.rolle] ? t.rolle : "" }))
  .filter((t) => t.name.trim());

// Werkstattschichtplan - Schichtarten wie das Excel-Dropdown (Blatt "Daten").
// Der Schlüssel ist zugleich der gespeicherte Wert und die Anzeige.
const SCHICHTEN = {
  "Früh": { color: "#2F7D4F", kurz: "F" },
  "Spät": { color: "#C97A2B", kurz: "S" },
  "Spät mit B": { color: "#B8791F", kurz: "SB" },
  "Nacht": { color: "#22262B", kurz: "N" },
  "Bereits.": { color: "#8A9099", kurz: "B" },
  "Schule": { color: "#7C5CBF", kurz: "Sch" },
  "Krank": { color: "#B23A34", kurz: "K" },
  "Urlaub": { color: "#2F6690", kurz: "U" },
  "Mainsite": { color: "#3D8B8B", kurz: "M" },
};
// Wer ganztags fehlt, bekommt in der Zelle kein ＋ (nichts einplanen)
const SCHICHT_ABWESEND = new Set(["Krank", "Urlaub", "Schule"]);

// R+I-Punkte aus Todoist importiert (Stand: Juli 2026). "Wasserrundgang" und
// "Filterwartung / Schaltschränke" liefen doppelt in Todoist - hier zusammengeführt.
// type: "weekly" (weekday), "biweekly" (weekday, anchor), "monthly-day" (day),
// "every-n-months" (n, anchor), "yearly" (month, day), "manual" (kein fester Rhythmus)
const DEFAULT_RI_ITEMS = [
  { id: "wasserrundgang", name: "Wasserrundgang", type: "weekly", weekday: 1 },
  { id: "elevator", name: "Elevatorprüfung + Ölen", type: "weekly", weekday: 4 },
  { id: "hro-trockner", name: "HRO Trocknerketten Ölen", type: "monthly-day", day: 22 },
  { id: "energie", name: "Energieaufschreibung", type: "monthly-day", day: 1 },
  { id: "leiterkontrolle", name: "Leiterkontrolle R+I 9", type: "yearly", month: 9, day: 19 },
  { id: "abwasserproben", name: "Abwasserproben R+I 30", type: "every-n-months", n: 3, anchor: "2026-08-06" },
  { id: "werkstattreinigung", name: "Werkstattreinigung", type: "weekly", weekday: 4 },
  { id: "filterwartung", name: "Filterwartung / Schaltschränke", type: "every-n-months", n: 3, anchor: "2026-07-07" },
  { id: "kompressor", name: "Kompressor Rundgang", type: "biweekly", weekday: 4, anchor: "2026-07-09" },
  { id: "verbrauchsmaterial-bta", name: "Kontrolle der Verbrauchsmaterialien in BTA", type: "monthly-day", day: 7 },
  { id: "hygieneplan-bta", name: "Hygieneplan BTA", type: "monthly-day", day: 8 },
  { id: "fluormessungen", name: "Fluormessungen an den HF Absorbern", type: "every-n-months", n: 2, anchor: "2026-07-10" },
  { id: "imissionsmessungen", name: "Imissionsmessungen", type: "every-n-months", n: 2, anchor: "2026-07-13" },
  { id: "wasserproben-lra", name: "Wasserproben (Abwasser LRA)", type: "every-n-months", n: 3, anchor: "2026-07-14" },
  { id: "sicherheitsrundgang", name: "Sicherheitsrundgang 2 Brandschutz", type: "every-n-months", n: 6, anchor: "2026-07-16" },
  { id: "trinkwasserfilter", name: "Trinkwasserfilter (Prüfung + Rückspülung)", type: "every-n-months", n: 6, anchor: "2026-07-17" },
  { id: "regalkontrolle", name: "Regalkontrolle", type: "manual" },
  { id: "sprinklerwartung", name: "Sprinklerwartung", type: "biweekly", weekday: 3, anchor: "2026-07-15" },
  { id: "stroemungswaechter", name: "Strömungswächter", type: "monthly-day", day: 15 },
];
const RI_TYPE_LABELS = {
  weekly: "Wöchentlich", biweekly: "Alle 2 Wochen", "monthly-day": "Monatlich",
  "every-n-months": "Alle X Monate", yearly: "Jährlich", manual: "Kein fester Rhythmus",
};

const ROTATION_ANCHOR = new Date(2026, 0, 5); // Montag 05.01.2026, Slot 0 = erste Montags-Rolle


const CATS = {
  TPM: { label: "TPM", full: "Wartung (TPM)", color: "#C97A2B" },
  RI: { label: "R+I", full: "Rundgang & Inspektion", color: "#2F6690" },
};

const STATUS_COLORS = {
  done: { bg: "#E5F3EA", fg: "#2F7D4F" },
  open: { bg: "#FBE9E7", fg: "#B23A34" },
  mixed: { bg: "#FCEFD9", fg: "#B8791F" },
  none: { bg: "#F4F5F6", fg: "#C3C7CB" },
};

const STORAGE_KEY = "werkstatt-kalender-entries";
const CONFIG_STORAGE_KEY = "werkstatt-kalender-config";

function pad(n) {
  return n.toString().padStart(2, "0");
}
function dateKey(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function formatDateDE(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

// Wochen-Schlüssel für Schicht-Einträge, z. B. "2026-W28". Das ISO-Jahr ist das
// Jahr des Donnerstags der Woche (wichtig am Jahreswechsel).
function isoWocheKey(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  return `${d.getFullYear()}-W${pad(getISOWeek(date))}`;
}
function montagVon(iso) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function chunkIntoWeeks(cells) {
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function weekLabel(week, year, month) {
  const firstDay = week.find((d) => d !== null && d !== undefined);
  if (firstDay == null) return "";
  return String(getISOWeek(new Date(year, month, firstDay)));
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Gesetzliche Feiertage Bayern
function getHolidays(year) {
  const easter = easterSunday(year);
  const map = new Map();
  const add = (date, name) => map.set(dateKey(date.getFullYear(), date.getMonth(), date.getDate()), name);
  add(new Date(year, 0, 1), "Neujahr");
  add(new Date(year, 0, 6), "Heilige Drei Könige");
  add(addDays(easter, -2), "Karfreitag");
  add(addDays(easter, 1), "Ostermontag");
  add(new Date(year, 4, 1), "Tag der Arbeit");
  add(addDays(easter, 39), "Christi Himmelfahrt");
  add(addDays(easter, 50), "Pfingstmontag");
  add(addDays(easter, 60), "Fronleichnam");
  add(new Date(year, 7, 15), "Mariä Himmelfahrt");
  add(new Date(year, 9, 3), "Tag der Deutschen Einheit");
  add(new Date(year, 10, 1), "Allerheiligen");
  add(new Date(year, 11, 25), "1. Weihnachtstag");
  add(new Date(year, 11, 26), "2. Weihnachtstag");
  return map;
}

function isWeekend(y, m, d) {
  const dow = new Date(y, m, d).getDay();
  return dow === 0 || dow === 6;
}

function countValidMondaysForward(fromDate, toDate) {
  // Zählt Montage ohne Feiertag von fromDate (inkl.) bis toDate (inkl.), Schrittweite 7 Tage.
  let count = 0;
  let cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  while (cursor.getTime() <= toDate.getTime()) {
    const y = cursor.getFullYear();
    const key = dateKey(y, cursor.getMonth(), cursor.getDate());
    if (!getHolidays(y).get(key)) count++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
  }
  return count;
}

function mondayAnlage(date, tpmAnlagen) {
  const mondayItems = tpmAnlagen
    .filter((a) => a.role && a.role.startsWith("monday"))
    .sort((a, b) => a.role.localeCompare(b.role));
  const taktItems = tpmAnlagen.filter((a) => a.role === "takt");
  const cycleLength = mondayItems.length + (taktItems.length > 0 ? 1 : 0);
  if (cycleLength === 0) return "";

  // Position von "date" unter den feiertagsfreien Montagen seit dem Referenzpunkt - ein
  // Feiertags-Montag verschiebt die Rotation dadurch automatisch um eine Woche, statt
  // eine Rolle ganz zu überspringen (das hielt sonst die "max. 5 Wochen"-Regel nicht ein).
  let idx;
  if (date.getTime() >= ROTATION_ANCHOR.getTime()) {
    idx = countValidMondaysForward(ROTATION_ANCHOR, date) - 1;
  } else {
    const dayBeforeAnchor = new Date(ROTATION_ANCHOR.getTime() - 7 * 24 * 3600 * 1000);
    idx = -countValidMondaysForward(date, dayBeforeAnchor);
  }
  const slotIndex = ((idx % cycleLength) + cycleLength) % cycleLength;
  const cycleNumber = Math.floor(idx / cycleLength);

  if (slotIndex < mondayItems.length) return mondayItems[slotIndex].name;
  if (taktItems.length === 0) return "";
  const taktIdx = ((cycleNumber % taktItems.length) + taktItems.length) % taktItems.length;
  return taktItems[taktIdx].name;
}

function weekBucketKey(y, m, d) {
  const dt = new Date(y, m, d);
  const dow = (dt.getDay() + 6) % 7; // Montag = 0
  const monday = new Date(y, m, d - dow);
  return dateKey(monday.getFullYear(), monday.getMonth(), monday.getDate());
}

function planGroupLabel(anlage, tpmAnlagen, riItems) {
  const tpmItem = tpmAnlagen.find((a) => a.name === anlage);
  if (tpmItem) {
    if (tpmItem.role && tpmItem.role.startsWith("monday")) return "Montags-Rotation";
    if (tpmItem.role === "takt") return "Taktstraße";
    if (tpmItem.role === "b1") return "Beschichtung (flexibel)";
    if (tpmItem.role === "flexA" || tpmItem.role === "flexB") return "Flexibel (alle 2 Monate)";
  }
  if (riItems.some((r) => r.name === anlage)) return "R+I";
  return "";
}

function planGroupColor(anlage, tpmAnlagen, riItems) {
  const tpmItem = tpmAnlagen.find((a) => a.name === anlage);
  if (tpmItem) return "#C97A2B";
  if (riItems.some((r) => r.name === anlage)) return "#2F6690";
  return "#3D8B8B";
}

function riItemOccursOn(item, date) {
  switch (item.type) {
    case "weekly":
      return date.getDay() === item.weekday;
    case "biweekly": {
      if (date.getDay() !== item.weekday) return false;
      const anchor = new Date(item.anchor + "T00:00:00");
      const diffWeeks = Math.round((date.getTime() - anchor.getTime()) / (7 * 24 * 3600 * 1000));
      return ((diffWeeks % 2) + 2) % 2 === 0;
    }
    case "monthly-day":
      return date.getDate() === item.day;
    case "every-n-months": {
      const anchor = new Date(item.anchor + "T00:00:00");
      if (date.getDate() !== anchor.getDate()) return false;
      const monthsDiff = (date.getFullYear() - anchor.getFullYear()) * 12 + (date.getMonth() - anchor.getMonth());
      return ((monthsDiff % item.n) + item.n) % item.n === 0;
    }
    case "yearly":
      return date.getMonth() === item.month && date.getDate() === item.day;
    case "manual":
    default:
      return false;
  }
}

const RI_LOAD_THRESHOLD = 3; // ab wann ein Tag als "zu voll" für R+I gilt und ausgewichen wird

function isValidRiDay(year, month, day, daysInMonth, holidaysMap) {
  if (day < 1 || day > daysInMonth) return false;
  if (isWeekend(year, month, day)) return false;
  const key = dateKey(year, month, day);
  if (holidaysMap.get(key)) return false;
  return true;
}

function riOccurrencesInMonth(riItems, year, month, holidaysMap) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const natural = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    riItems.forEach((item) => {
      if (riItemOccursOn(item, date)) natural.push({ item, day: d });
    });
  }

  const dayLoad = new Map();
  const out = [];
  natural.forEach(({ item, day }) => {
    let finalDay = day;
    if (!isValidRiDay(year, month, day, daysInMonth, holidaysMap)) {
      // Energieaufschreibung darf laut Regel nie vor dem 1. liegen -> nur vorwärts verschieben
      const forwardOnly = item.id === "energie";
      const candidates = [];
      for (let dist = 1; dist <= 7; dist++) {
        const fwd = day + dist;
        if (isValidRiDay(year, month, fwd, daysInMonth, holidaysMap)) candidates.push({ day: fwd, dist });
        if (!forwardOnly) {
          const back = day - dist;
          if (isValidRiDay(year, month, back, daysInMonth, holidaysMap)) candidates.push({ day: back, dist });
        }
      }
      candidates.sort((a, b) => a.dist - b.dist);
      const underThreshold = candidates.find((c) => (dayLoad.get(c.day) || 0) < RI_LOAD_THRESHOLD);
      if (underThreshold) {
        finalDay = underThreshold.day;
      } else if (candidates.length > 0) {
        candidates.sort((a, b) => (dayLoad.get(a.day) || 0) - (dayLoad.get(b.day) || 0) || a.dist - b.dist);
        finalDay = candidates[0].day;
      }
      // sonst: kein gültiger Tag im Monat gefunden -> seltener Randfall, Originaltag bleibt
    }
    dayLoad.set(finalDay, (dayLoad.get(finalDay) || 0) + 1);
    out.push({ day: finalDay, name: item.name });
  });

  return out;
}

function daysSinceLastDone(anlage, allEntries, referenceDate) {
  // Es zählen nur Erledigungen VOR dem Referenztag (Monatsanfang): Sonst würde
  // jedes Abhaken den laufenden Monatsplan sofort neu mischen und die Anlage
  // im Plan auf einen anderen Tag springen. So bleibt der Plan im Monat stabil,
  // die Rotation über die Monatsgrenzen hinweg rechnet weiter wie gehabt.
  const refKey = dateKey(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const doneDates = allEntries
    .filter((e) => e.category === "TPM" && e.name === anlage && e.status === "done" && e.date < refKey)
    .map((e) => e.date)
    .sort();
  if (doneDates.length === 0) return Infinity; // noch nie gemacht -> gilt als am dringendsten
  const latest = new Date(doneDates[doneDates.length - 1] + "T00:00:00");
  return (referenceDate.getTime() - latest.getTime()) / (24 * 3600 * 1000);
}

function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  // Start immer im Cockpit auf der Übersicht; Hauptreiter springen stets auf ihren ersten Unterpunkt
  const [view, setView] = useState("COCKPIT"); // 'COCKPIT' | 'PLAN' | 'MONAT' | 'JAHR' | 'REGISTER' (MONAT/JAHR = Auswertung, alles außer COCKPIT = Hauptbereich TPM)
  const [entries, setEntries] = useState([]);
  const [tpmAnlagen, setTpmAnlagen] = useState(DEFAULT_TPM_ANLAGEN);
  const [riItems, setRiItems] = useState(DEFAULT_RI_ITEMS);
  const [team, setTeam] = useState([]); // Werkstatt-Team (für Zuweisung & Arbeitsplanung)
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [modal, setModal] = useState(null); // null | {mode:'add', date} | {mode:'edit', id}
  const [draftCat, setDraftCat] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [draftCustom, setDraftCustom] = useState(false);
  const [draftStatus, setDraftStatus] = useState("done");
  const [draftNote, setDraftNote] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [heavyReady, setHeavyReady] = useState(false);
  const [registerItem, setRegisterItem] = useState(null); // { category, name } | null
  const [settingsTpm, setSettingsTpm] = useState([]);
  const [settingsRi, setSettingsRi] = useState([]);
  const [settingsTeam, setSettingsTeam] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareState, setShareState] = useState({ status: "none" }); // none | unsupported | needs-permission | connected
  // Cockpit: Untermenü + Backlog-Filter + Arbeit-Dialog
  const [cockpitTab, setCockpitTab] = useState("UEBERSICHT"); // UEBERSICHT | BACKLOG
  const [blArt, setBlArt] = useState("ALLE"); // ALLE | mech | elek
  const [blPrio, setBlPrio] = useState("ALLE"); // ALLE | hoch | mittel | niedrig | ohne
  const [blAnlage, setBlAnlage] = useState("ALLE");
  const [blWer, setBlWer] = useState("ALLE"); // ALLE | NIEMAND | Personenname
  const [blAzubi, setBlAzubi] = useState(false);
  const [blStillstand, setBlStillstand] = useState(false);
  const [blErledigte, setBlErledigte] = useState(false);
  const [blSuche, setBlSuche] = useState("");
  const [arbeitModal, setArbeitModal] = useState(null); // null | {mode:'add', ausZettel?} | {mode:'edit', id}
  const [aDraft, setADraft] = useState(null);
  const [akteAnlage, setAkteAnlage] = useState(null); // Anlagen-Akte (Name) | null
  const [planungCursor, setPlanungCursor] = useState(() => new Date()); // Woche der Arbeitsplanung
  const [planungPicker, setPlanungPicker] = useState(null); // {person, datum} | null
  const [schichtPicker, setSchichtPicker] = useState(null); // {person, datum} | null - Schicht setzen
  const [schichtGanzeWoche, setSchichtGanzeWoche] = useState(true); // Auswahl im Schicht-Dialog
  const [planNotiz, setPlanNotiz] = useState(null); // {person, datum, id?, text} | null - freie Notiz in Planungszelle
  const [sonstigeOffen, setSonstigeOffen] = useState(false); // Planung: Gruppe "Sonstige" (ohne Gewerk) aufgeklappt?
  const [matrixCursor, setMatrixCursor] = useState(() => new Date()); // Monat der Schichtplan-Matrix
  const [matrixPick, setMatrixPick] = useState(null); // {person, datum, links, oben} | null - Zellen-Dropdown
  // Pinnwand (Cockpit-Übersicht): neuer Zettel
  const [zettelOpen, setZettelOpen] = useState(false);
  const [zettelText, setZettelText] = useState("");
  const [zettelName, setZettelName] = useState(() => localStorage.getItem("werkstatt-kalender-name") || "");
  const [shareErr, setShareErr] = useState(null); // bleibt stehen, bis das Speichern in die Datei wieder klappt
  const [monitorOpen, setMonitorOpen] = useState(false); // Werkstatt-Monitor (Vollbild)
  const [monitorUhr, setMonitorUhr] = useState(() => new Date());

  // Gemeinsame Datei: beim Start wiederverbinden und auf Änderungen der anderen hören
  useEffect(() => {
    let cancelled = false;
    sharedFile.tryRestore().then((st) => { if (!cancelled) setShareState(st); });
    const onUpdate = (ev) => {
      const d = ev.detail || {};
      if (Array.isArray(d.entries)) setEntries(d.entries);
      if (d.config) {
        if (Array.isArray(d.config.tpmAnlagen) && d.config.tpmAnlagen.length > 0) setTpmAnlagen(d.config.tpmAnlagen);
        if (Array.isArray(d.config.riItems) && d.config.riItems.length > 0) setRiItems(d.config.riItems);
        if (Array.isArray(d.config.team)) setTeam(normalisiereTeam(d.config.team));
      }
    };
    const onShareError = (ev) => setShareErr(ev.detail || "Gemeinsame Datei: unbekannter Fehler.");
    const onShareOk = () => setShareErr(null);
    window.addEventListener("werkstatt-shared-update", onUpdate);
    window.addEventListener("werkstatt-shared-error", onShareError);
    window.addEventListener("werkstatt-shared-ok", onShareOk);
    return () => {
      cancelled = true;
      window.removeEventListener("werkstatt-shared-update", onUpdate);
      window.removeEventListener("werkstatt-shared-error", onShareError);
      window.removeEventListener("werkstatt-shared-ok", onShareOk);
    };
  }, []);

  const connectShared = async (opts) => {
    try {
      await sharedFile.pickShared(opts);
      // Ob bearbeitet werden darf, entscheiden die Datei-Rechte auf dem Laufwerk (IT-Freigabe).
      setShareState({ status: "connected", name: sharedFile.fileName(), mode: sharedFile.canWrite() ? "readwrite" : "read" });
      setErr(null);
      setShareOpen(false);
    } catch (e) {
      if (e && e.name === "AbortError") return; // Dateiauswahl abgebrochen
      setErr("Gemeinsame Datei: " + (e && e.message ? e.message : "Verbinden hat nicht geklappt."));
    }
  };
  const reconnectShared = async () => {
    try {
      const st = await sharedFile.reconnect();
      setShareState(st);
      setErr(null);
    } catch (e) {
      setErr("Gemeinsame Datei: " + (e && e.message ? e.message : "Verbinden hat nicht geklappt."));
    }
  };
  const disconnectShared = async () => {
    await sharedFile.disconnect();
    setShareState({ status: sharedFile.isSupported() ? "none" : "unsupported" });
    setShareOpen(false);
  };

  // Nur-Leser (keine Schreibrechte auf die gemeinsame Datei) sehen ausschließlich den Plan.
  const readerMode = shareState.status === "connected" && shareState.mode === "read";
  useEffect(() => {
    if (readerMode) setView("PLAN");
  }, [readerMode]);

  // ...html?monitor=1 kennzeichnet ein dediziertes Kiosk-Gerät (Bildschirm in der
  // Werkstatt ohne eigenen Arbeitsplatz). NUR dort ist der Werkstatt-Monitor auch
  // für Nur-Leser erreichbar - ein normaler Leser (Kollege am eigenen PC) soll
  // weiterhin ausschließlich den Plan sehen, wie ursprünglich festgelegt.
  const kioskMonitor = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("monitor") === "1";

  // Werkstatt-Monitor: Uhr sekündlich aktualisieren, ESC beendet den Vollbild-Modus,
  // Bildschirm bleibt wach (wichtig für einen Kiosk-Rechner ohne Nutzereingaben)
  useEffect(() => {
    if (!monitorOpen) return;
    const t = setInterval(() => setMonitorUhr(new Date()), 1000);
    const onKey = (e) => { if (e.key === "Escape") setMonitorOpen(false); };
    window.addEventListener("keydown", onKey);
    let wakeLock = null;
    if (navigator.wakeLock) {
      navigator.wakeLock.request("screen").then((wl) => { wakeLock = wl; }).catch(() => {});
    }
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [monitorOpen]);

  // Kiosk-Gerät: Monitor automatisch öffnen, sobald die gemeinsame Datei verbunden ist.
  useEffect(() => {
    if (!kioskMonitor) return;
    if (shareState.status === "connected") setMonitorOpen(true);
  }, [shareState.status]);

  useEffect(() => {
    let cancelled = false;
    const load = async (retriesLeft) => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (!cancelled && res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter(
              (e) => e && typeof e.date === "string" && typeof e.category === "string" && typeof e.name === "string" && typeof e.id !== "undefined"
            );
            setEntries(valid);
          }
        }
      } catch (e) {
        if (retriesLeft > 0) {
          await new Promise((r) => setTimeout(r, 900));
          if (!cancelled) return load(retriesLeft - 1);
        }
        // Nach mehreren Versuchen ohne Treffer: Key existiert vermutlich noch nicht -> leerer Kalender
      }
      if (!cancelled) setLoading(false);
    };
    load(2);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadConfig = async (retriesLeft) => {
      try {
        const res = await window.storage.get(CONFIG_STORAGE_KEY, false);
        if (!cancelled && res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed.tpmAnlagen)) {
            const validTpm = parsed.tpmAnlagen.filter(
              (a) => a && typeof a.id === "string" && typeof a.name === "string" && typeof a.role === "string"
            );
            if (validTpm.length > 0) setTpmAnlagen(validTpm);
          }
          if (Array.isArray(parsed.riItems)) {
            const validRi = parsed.riItems.filter(
              (r) => r && typeof r.id === "string" && typeof r.name === "string" && typeof r.type === "string"
            );
            if (validRi.length > 0) setRiItems(validRi);
          }
          if (Array.isArray(parsed.team)) {
            setTeam(normalisiereTeam(parsed.team));
          }
        }
      } catch (e) {
        if (retriesLeft > 0) {
          await new Promise((r) => setTimeout(r, 900));
          if (!cancelled) return loadConfig(retriesLeft - 1);
        }
        // Key existiert vermutlich noch nicht -> Standardlisten bleiben aktiv
      }
    };
    loadConfig(2);
    return () => { cancelled = true; };
  }, []);

  const persistConfig = async (nextTpm, nextRi, nextTeam = team) => {
    setTpmAnlagen(nextTpm);
    setRiItems(nextRi);
    setTeam(nextTeam);
    const attempt = async (retriesLeft) => {
      try {
        const result = await window.storage.set(
          CONFIG_STORAGE_KEY,
          JSON.stringify({ tpmAnlagen: nextTpm, riItems: nextRi, team: nextTeam }),
          false
        );
        if (!result) throw new Error("Kein Ergebnis vom Speicher");
        setErr(null);
        return true;
      } catch (e) {
        if (retriesLeft > 0) {
          await new Promise((r) => setTimeout(r, 900));
          return attempt(retriesLeft - 1);
        }
        setErr("Speichern der Anlagenliste hat nicht geklappt. Bitte kurz warten und nochmal versuchen.");
        return false;
      }
    };
    await attempt(2);
  };

  const registerIndex = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      const key = `${e.category}|${e.name}`;
      let rec = map.get(key);
      if (!rec) { rec = { done: 0, open: 0 }; map.set(key, rec); }
      if (e.status === "done") rec.done++; else rec.open++;
    });
    return map;
  }, [entries]);
  const registerStats = (category, name) => registerIndex.get(`${category}|${name}`) || { done: 0, open: 0 };

  const openSettings = () => {
    setSettingsTpm(tpmAnlagen.map((a) => ({ ...a })));
    setSettingsRi(riItems.map((r) => ({ ...r })));
    // _orig merkt sich den Namen beim Öffnen - so bleiben Umbenennungen auch
    // nach Umsortieren (↑/↓) der richtigen Person zugeordnet
    setSettingsTeam(team.map((t) => ({ ...t, _orig: t.name })));
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    const cleanTpm = settingsTpm.filter((a) => a.name.trim());
    const cleanRi = settingsRi.filter((r) => r.name.trim());

    const tpmRenames = new Map();
    tpmAnlagen.forEach((old) => {
      const updated = cleanTpm.find((a) => a.id === old.id);
      if (updated && updated.name.trim() !== old.name) tpmRenames.set(old.name, updated.name.trim());
    });
    const riRenames = new Map();
    riItems.forEach((old) => {
      const updated = cleanRi.find((r) => r.id === old.id);
      if (updated && updated.name.trim() !== old.name) riRenames.set(old.name, updated.name.trim());
    });

    const cleanTeam = settingsTeam
      .map((t) => ({ name: t.name.trim(), rolle: t.rolle || "" }))
      .filter((t) => t.name);
    const teamRenames = new Map();
    settingsTeam.forEach((t) => {
      if (t._orig && t.name.trim() && t.name.trim() !== t._orig) {
        teamRenames.set(t._orig, t.name.trim());
      }
    });

    let nextEntries = entries;
    if (tpmRenames.size > 0 || riRenames.size > 0 || teamRenames.size > 0) {
      nextEntries = entries.map((e) => {
        if (e.category === "TPM" && tpmRenames.has(e.name)) return { ...e, name: tpmRenames.get(e.name) };
        if (e.category === "RI" && riRenames.has(e.name)) return { ...e, name: riRenames.get(e.name) };
        if (e.category === "ARBEIT" && e.wer && teamRenames.has(e.wer)) return { ...e, wer: teamRenames.get(e.wer) };
        if ((e.category === "SCHICHT" || e.category === "PLANNOTIZ") && teamRenames.has(e.name)) return { ...e, name: teamRenames.get(e.name) };
        return e;
      });
    }

    await persistConfig(cleanTpm, cleanRi, cleanTeam);
    if (nextEntries !== entries) await persist(nextEntries);
    setSettingsOpen(false);
  };

  const addSettingsTpm = () => {
    setSettingsTpm((prev) => [...prev, { id: `custom-${Date.now()}`, name: "", role: "takt" }]);
  };
  const addSettingsRi = () => {
    setSettingsRi((prev) => [...prev, { id: `custom-${Date.now()}`, name: "", type: "manual" }]);
  };

  useEffect(() => {
    setHeavyReady(false);
    const t = setTimeout(() => setHeavyReady(true), 0);
    return () => clearTimeout(t);
  }, [view, year, month, filter, loading]);

  const fileInputRef = useRef(null);

  const persist = async (next) => {
    setEntries(next);
    const attempt = async (retriesLeft) => {
      try {
        const result = await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
        if (!result) throw new Error("Kein Ergebnis vom Speicher");
        setErr(null);
        return true;
      } catch (e) {
        if (retriesLeft > 0) {
          await new Promise((r) => setTimeout(r, 900));
          return attempt(retriesLeft - 1);
        }
        setErr("Speichern klappt gerade nicht (evtl. kurzzeitig überlastet). Bitte kurz warten und nochmal versuchen.");
        return false;
      }
    };
    await attempt(2);
  };

  const exportData = () => {
    try {
      const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `werkstatt-kalender-export-${dateKey(today.getFullYear(), today.getMonth(), today.getDate())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErr("Export ist fehlgeschlagen.");
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let parsed = JSON.parse(text);
      // Migrations-Format: { entries: [...], team: [...] } - Team wird in die Verwaltung übernommen
      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.entries)) {
        if (Array.isArray(parsed.team)) {
          const neuTeam = normalisiereTeam(parsed.team).filter((t) => !team.some((v) => v.name === t.name));
          if (neuTeam.length > 0 && window.confirm(`${neuTeam.length} neue Team-Mitglieder in der Datei gefunden. Zum Team hinzufügen?`)) {
            await persistConfig(tpmAnlagen, riItems, [...team, ...neuTeam]);
          }
        }
        parsed = parsed.entries;
      }
      if (!Array.isArray(parsed)) throw new Error("Ungültiges Format");
      const valid = parsed.filter(
        (en) => en && typeof en.date === "string" && typeof en.category === "string" && typeof en.name === "string"
      );
      if (valid.length === 0) throw new Error("Keine gültigen Einträge in der Datei gefunden");
      const rejected = parsed.length - valid.length;
      let next = valid;
      let meldung = rejected > 0 ? `Import ok, aber ${rejected} ungültige Zeile(n) übersprungen.` : null;
      if (entries.length > 0) {
        const hinzu = window.confirm(
          `${valid.length} Einträge gefunden.${rejected > 0 ? `\n(${rejected} ungültige Zeilen werden übersprungen.)` : ""}\n\nOK = zu den bestehenden ${entries.length} Einträgen HINZUFÜGEN\nAbbrechen = weiter zur Frage "komplett ersetzen"`
        );
        if (hinzu) {
          const vorhandeneIds = new Set(entries.map((x) => x.id));
          const neue = valid.filter((x) => !vorhandeneIds.has(x.id));
          next = [...entries, ...neue];
          meldung = `${neue.length} Einträge hinzugefügt${valid.length - neue.length > 0 ? `, ${valid.length - neue.length} bereits vorhandene übersprungen` : ""}.`;
        } else {
          const ersetzen = window.confirm(`Wirklich ALLE bestehenden ${entries.length} Einträge löschen und durch die ${valid.length} importierten ersetzen?`);
          if (!ersetzen) { e.target.value = ""; return; }
          meldung = `Bestand ersetzt: ${valid.length} Einträge importiert.` + (rejected > 0 ? ` (${rejected} ungültige übersprungen)` : "");
        }
      }
      await persist(next);
      setErr(meldung);
    } catch (importErr) {
      setErr("Import ist fehlgeschlagen. Ist das die richtige Export-Datei?");
    }
    e.target.value = "";
  };

  const resetDraft = () => {
    setDraftCat(null);
    setDraftName("");
    setDraftCustom(false);
    setDraftStatus("done");
    setDraftNote("");
  };

  const closeModal = () => {
    setModal(null);
    resetDraft();
    setNoteDraft("");
  };

  const openAddModal = (dateKey) => {
    resetDraft();
    setModal({ mode: "add", date: dateKey });
  };

  const openEditModal = (entry) => {
    setNoteDraft(entry.note || "");
    setModal({ mode: "edit", id: entry.id });
  };

  const pickDraftCat = (c) => {
    setDraftCat(c);
    setDraftName("");
    setDraftCustom(false);
  };

  const saveEntry = async () => {
    if (!modal || modal.mode !== "add" || !draftCat || !draftName.trim()) return;
    setSaving(true);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: modal.date,
      category: draftCat,
      name: draftName.trim(),
      status: draftStatus,
      note: draftNote.trim(),
    };
    await persist([...entries, entry]);
    setSaving(false);
    closeModal();
  };

  const setEntryStatus = async (id, status) => {
    await persist(entries.map((e) => (e.id === id ? { ...e, status } : e)));
  };

  const saveNote = async (id) => {
    await persist(entries.map((e) => (e.id === id ? { ...e, note: noteDraft.trim() } : e)));
  };

  const deleteEntry = async (id) => {
    if (modal && modal.mode === "edit" && modal.id === id) closeModal();
    await persist(entries.filter((e) => e.id !== id));
  };

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Montag = 0
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const visibleEntries = useMemo(
    () => entries.filter((e) => (e.category === "TPM" || e.category === "RI") && (filter === "ALL" || e.category === filter)),
    [entries, filter]
  );
  const entriesByDate = useMemo(() => {
    const map = new Map();
    visibleEntries.forEach((e) => {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    });
    return map;
  }, [visibleEntries]);
  const entriesForDay = (key) => entriesByDate.get(key) || [];

  const monthPrefix = `${year}-${pad(month + 1)}`;
  const yearPrefix = `${year}-`;
  const monthEntries = visibleEntries.filter((e) => e.date.startsWith(monthPrefix));
  const yearEntries = visibleEntries.filter((e) => e.date.startsWith(yearPrefix));
  const scopeEntries = view === "JAHR" ? yearEntries : monthEntries;
  const doneCount = scopeEntries.filter((e) => e.status === "done").length;
  // Erledigt-Quote in Prozent (bezogen auf erledigt + offen im gewählten Zeitraum)
  const quoteBasis = scopeEntries.filter((e) => e.status === "done" || e.status === "open").length;
  const donePercent = quoteBasis > 0 ? Math.round((doneCount / quoteBasis) * 100) : null;

  const openCount = scopeEntries.filter((e) => e.status === "open").length;
  const notesList = scopeEntries.filter((e) => e.note && e.note.trim()).sort((a, b) => a.date.localeCompare(b.date));

  // Kleine Legende + Zähler unter dem Kalender (statt in der Filterleiste - die bleibt schlank)
  const legendeKlein = (
    <div className="no-print flex flex-wrap items-center gap-3 mt-2 px-1 text-slate-400" style={{ fontSize: "11px" }}>
      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-600" /> Gemacht</span>
      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-600" /> Nicht gemacht</span>
      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded" style={{ backgroundColor: "#FBE9E7", border: "1px solid #B23A34" }} /> Feiertag</span>
      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded" style={{ backgroundColor: "#E5F0F8", border: "1px solid #C8DDEE" }} /> Wochenende</span>
      <span className="ml-auto font-mono">
        <span className="text-emerald-700 font-bold">{doneCount} erledigt</span> · <span className="text-red-700 font-bold">{openCount} offen</span>
        {donePercent !== null && <> · <span className="font-bold" style={{ color: "#22262B" }}>{donePercent} %</span></>}
      </span>
    </div>
  );

  const changeMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m);
    setYear(y);
  };
  const changeYear = (delta) => setYear((y) => y + delta);

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const holidays = useMemo(() => getHolidays(year), [year]);


  // ---- Wartungsplan (fortlaufende Rotation) ----
  const computeMaintenancePlan = (py = year, pm = month) => {
    const hol = getHolidays(py);
    const dim = new Date(py, pm + 1, 0).getDate();
    const taktNames = tpmAnlagen.filter((a) => a.role === "takt").map((a) => a.name);
    const monday34Names = tpmAnlagen.filter((a) => a.role === "monday3" || a.role === "monday4").map((a) => a.name);
    const flexANames = tpmAnlagen.filter((a) => a.role === "flexA").map((a) => a.name);
    const flexBNames = tpmAnlagen.filter((a) => a.role === "flexB").map((a) => a.name);
    const b1Item = tpmAnlagen.find((a) => a.role === "b1");

    const mondayAssignments = [];
    for (let d = 1; d <= dim; d++) {
      const dow = new Date(py, pm, d).getDay();
      if (dow !== 1) continue;
      const key = dateKey(py, pm, d);
      if (hol.get(key)) continue; // Feiertags-Montag: Slot entfällt diesen Zyklus
      const anlage = mondayAnlage(new Date(py, pm, d), tpmAnlagen);
      if (anlage) mondayAssignments.push({ day: d, date: key, anlage });
    }

    const taktDoneThisMonth = new Set(
      mondayAssignments.filter((m) => taktNames.includes(m.anlage)).map((m) => m.anlage)
    );
    const taktQueue = taktNames.filter((a) => !taktDoneThisMonth.has(a));

    const b2b3Weeks = new Set(
      mondayAssignments.filter((m) => monday34Names.includes(m.anlage)).map((m) => weekBucketKey(py, pm, m.day))
    );
    // Randfall: Beginnt der Monat nicht an einem Montag, kann der Montag der ersten (Teil-)Woche
    // noch im Vormonat liegen - dessen Rolle wird sonst übersehen.
    {
      const firstDow = new Date(py, pm, 1).getDay(); // 0=So..6=Sa
      if (firstDow !== 1) {
        const boundaryMonday = new Date(py, pm, 1 - ((firstDow + 6) % 7));
        const boundaryKey = dateKey(boundaryMonday.getFullYear(), boundaryMonday.getMonth(), boundaryMonday.getDate());
        if (!getHolidays(boundaryMonday.getFullYear()).get(boundaryKey)) {
          const boundaryAnlage = mondayAnlage(boundaryMonday, tpmAnlagen);
          if (monday34Names.includes(boundaryAnlage)) {
            b2b3Weeks.add(weekBucketKey(py, pm, 1));
          }
        }
      }
    }

    const monthIndexAbs = py * 12 + pm;
    const flexPair = monthIndexAbs % 2 === 0 ? flexANames : flexBNames;

    const mondayUsedKeys = new Set(mondayAssignments.map((m) => m.date));

    const candidateDays = [];
    for (let d = 1; d <= dim; d++) {
      const dow = new Date(py, pm, d).getDay(); // 2..5 = Di..Fr
      if (dow < 2 || dow > 5) continue;
      const key = dateKey(py, pm, d);
      if (hol.get(key)) continue;
      if (dow === 2) {
        // Dienstag nach genutztem Montag frei lassen - auch über die Monatsgrenze:
        // Ist der 1. ein Dienstag, liegt der Vortag-Montag noch im Vormonat.
        const prev = new Date(py, pm, d - 1);
        const prevKey = dateKey(prev.getFullYear(), prev.getMonth(), prev.getDate());
        const prevHoliday = !!getHolidays(prev.getFullYear()).get(prevKey);
        if (!prevHoliday && mondayAnlage(prev, tpmAnlagen) !== "") continue;
      }
      candidateDays.push(d);
    }

    // Kein Fallback mehr, der die B2/B3-Wochen-Regel ignoriert: findet sich kein freier Tag
    // außerhalb der B2/B3-Woche, setzt B1 in diesem Monat schlicht aus (wie B+T/flexible Gruppe).
    let b1Day = b1Item ? candidateDays.find((d) => !b2b3Weeks.has(weekBucketKey(py, pm, d))) : undefined;

    const remainingDays = candidateDays.filter((d) => d !== b1Day);
    // Priorität: die Taktstraßen-Anlage mit der stabilen id "bt" gilt (laut Absprache) wie die
    // flexible Gruppe als unkritisch und darf bei Platzmangel zuerst einen Monat aussetzen.
    const planReference = new Date(py, pm, 1);
    const lowPriorityItem = tpmAnlagen.find((a) => a.id === "bt");
    const lowPriorityName = lowPriorityItem ? lowPriorityItem.name : null;
    const priorityTakt = taktQueue
      .filter((a) => a !== lowPriorityName)
      .sort((a, b) => daysSinceLastDone(b, entries, planReference) - daysSinceLastDone(a, entries, planReference));
    const lowPriorityTakt = taktQueue.filter((a) => a === lowPriorityName);
    const queue = [...priorityTakt, ...lowPriorityTakt, ...flexPair];

    const weekdayAssignments = [];
    const usedDays = new Set();
    if (b1Day !== undefined && b1Item) {
      weekdayAssignments.push({ day: b1Day, date: dateKey(py, pm, b1Day), anlage: b1Item.name });
      usedDays.add(b1Day);
    }

    const placed = [];
    const skipped = [];
    let idx = 0;
    for (const name of queue) {
      while (idx < remainingDays.length && usedDays.has(remainingDays[idx])) idx++;
      if (idx >= remainingDays.length) {
        skipped.push(name); // Kein Tag mit Lücke mehr frei – Ein-Tag-Abstand hat Vorrang, Anlage fällt diesen Monat aus
        continue;
      }
      placed.push({ day: remainingDays[idx], anlage: name });
      usedDays.add(remainingDays[idx]);
      idx += 2; // eine Lücke von einem Tag einhalten
    }
    placed.forEach((p) => weekdayAssignments.push({ day: p.day, date: dateKey(py, pm, p.day), anlage: p.anlage }));

    const riAssignments = riOccurrencesInMonth(riItems, py, pm, hol).map((r) => ({
      day: r.day,
      date: dateKey(py, pm, r.day),
      anlage: r.name,
    }));

    return {
      assignments: [...mondayAssignments, ...weekdayAssignments, ...riAssignments].sort((a, b) => a.day - b.day),
      skipped,
    };
  };

  const maintenancePlanResult = view === "PLAN" && heavyReady ? computeMaintenancePlan() : { assignments: [], skipped: [] };
  const maintenancePlan = maintenancePlanResult.assignments;
  const planSkipped = maintenancePlanResult.skipped;

  // ---- Cockpit-Übersicht: alles bezogen auf HEUTE (unabhängig vom angezeigten Monat) ----
  const todayPlanResult = view === "COCKPIT" && heavyReady
    ? computeMaintenancePlan(today.getFullYear(), today.getMonth())
    : { assignments: [], skipped: [] };
  const kalenderEntries = entries.filter((e) => e.category === "TPM" || e.category === "RI");
  const zettelListe = entries
    .filter((e) => e.category === "NOTIZ")
    .sort((a, b) => String(b.zeit || b.date).localeCompare(String(a.zeit || a.date)));
  const heutePlan = todayPlanResult.assignments.filter((p) => p.date === todayKey);
  const statusFuerPlanPunkt = (p) => {
    const e = kalenderEntries.find((x) => x.date === p.date && x.name === p.anlage);
    return e ? e.status : null;
  };
  const heuteErledigtCount = kalenderEntries.filter((e) => e.date === todayKey && e.status === "done").length;
  const ueberfaellige = kalenderEntries
    .filter((e) => e.status === "open" && e.date < todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  const quoteFuer = (list) => {
    const d = list.filter((e) => e.status === "done").length;
    const basis = list.filter((e) => e.status === "done" || e.status === "open").length;
    return basis > 0 ? Math.round((d / basis) * 100) : null;
  };
  const quoteMonatHeute = quoteFuer(kalenderEntries.filter((e) => e.date.startsWith(todayKey.slice(0, 7))));
  const quoteJahrHeute = quoteFuer(kalenderEntries.filter((e) => e.date.startsWith(todayKey.slice(0, 4) + "-")));

  const ZETTEL_FARBEN = { gelb: "#FEF9C3", blau: "#E0F2FE", gruen: "#DCFCE7" };
  const addZettel = async () => {
    if (!zettelText.trim() || !zettelName.trim()) return;
    localStorage.setItem("werkstatt-kalender-name", zettelName.trim());
    const farben = Object.keys(ZETTEL_FARBEN);
    const zettel = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: todayKey,
      category: "NOTIZ",
      name: zettelName.trim(),
      status: "open",
      note: zettelText.trim(),
      zeit: new Date().toISOString(),
      farbe: farben[zettelListe.length % farben.length],
      monitor: false,
    };
    await persist([...entries, zettel]);
    setZettelText("");
    setZettelOpen(false);
  };
  const deleteZettel = async (id) => {
    if (!window.confirm("Diesen Zettel entfernen?")) return;
    await persist(entries.filter((e) => e.id !== id));
  };
  const toggleZettelMonitor = async (id) => {
    await persist(entries.map((e) => (e.id === id ? { ...e, monitor: !e.monitor } : e)));
  };

  // ---- Personen-Helfer (Zuweisung & Planung) ----
  const personKuerzel = (n) => String(n).trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const rolleVon = (name) => {
    const t = team.find((x) => x.name === name);
    return t ? t.rolle : "";
  };
  const personFarbe = (n) => TEAM_ROLLEN[rolleVon(n)].color;

  // ---- Backlog (Kategorie ARBEIT) ----
  const arbeiten = entries.filter((e) => e.category === "ARBEIT");
  const arbeitenOffen = arbeiten.filter((e) => e.status !== "done");
  const saeubere = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const backlogListe = (blErledigte ? arbeiten.filter((e) => e.status === "done") : arbeitenOffen)
    .filter((e) => blArt === "ALLE" || e.art === blArt || e.art === "beide")
    .filter((e) => blPrio === "ALLE" || (e.prio ?? "ohne") === blPrio)
    .filter((e) => blAnlage === "ALLE" || e.name === blAnlage)
    .filter((e) => blWer === "ALLE" || (blWer === "NIEMAND" ? !e.wer : e.wer === blWer))
    .filter((e) => !blAzubi || e.azubi)
    .filter((e) => !blStillstand || e.stillstand)
    .filter((e) => {
      const q = blSuche.trim().toLowerCase();
      return !q || `${e.name} ${e.note}`.toLowerCase().includes(q);
    })
    .sort((a, b) => blErledigte
      ? String(b.erledigtAm || b.date).localeCompare(String(a.erledigtAm || a.date))
      : (PRIO_REIHENFOLGE[a.prio ?? "ohne"] - PRIO_REIHENFOLGE[b.prio ?? "ohne"]) || a.name.localeCompare(b.name, "de"));
  const blZaehl = (art) => arbeitenOffen.filter((e) => e.art === art || e.art === "beide").length;
  const blAnlagenOptionen = useMemo(
    () => Array.from(new Set(arbeiten.map((a) => a.name))).filter(Boolean).sort((a, b) => a.localeCompare(b, "de")),
    [entries]
  );
  const bereichOptionen = useMemo(() => {
    const s = new Set(tpmAnlagen.map((a) => a.name));
    arbeiten.forEach((a) => s.add(a.name));
    return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b, "de"));
  }, [tpmAnlagen, entries]);

  const openArbeitNeu = (vorgabe = {}) => {
    setADraft({
      anlage: vorgabe.anlage || "", anlageCustom: "", note: vorgabe.note || "",
      prio: "ohne", art: vorgabe.art || "mech", azubi: false, stillstand: false,
      wer: "", geplant: "", melder: vorgabe.melder || "",
    });
    setArbeitModal({ mode: "add", ausZettel: vorgabe.ausZettel || null });
  };
  const openArbeitEdit = (a) => {
    setADraft({
      anlage: a.name, anlageCustom: "", note: a.note || "", prio: a.prio || "ohne",
      art: a.art ?? "", azubi: !!a.azubi, stillstand: !!a.stillstand,
      wer: a.wer || "", geplant: a.geplant || "", melder: a.melder || "",
    });
    setArbeitModal({ mode: "edit", id: a.id });
  };
  // Zettel -> Arbeit: bekannten Anlagennamen im Text erraten
  const rateAnlage = (text) => {
    const t = String(text).toLowerCase();
    let best = "";
    bereichOptionen.forEach((b) => {
      if (b.length > best.length && t.includes(b.toLowerCase())) best = b;
    });
    return best;
  };
  const zettelZuArbeit = (z) => {
    openArbeitNeu({ note: z.note, melder: z.name, ausZettel: z.id, anlage: rateAnlage(z.note) });
  };
  const saveArbeit = async () => {
    const anlage = saeubere(aDraft.anlage === OTHER_VALUE ? aDraft.anlageCustom : aDraft.anlage);
    const note = saeubere(aDraft.note);
    if (!anlage || !note) return;
    if (arbeitModal.mode === "add") {
      const a = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date: todayKey, category: "ARBEIT", name: anlage, status: "open", note,
        prio: aDraft.prio, art: aDraft.art, azubi: aDraft.azubi, stillstand: aDraft.stillstand,
        wer: aDraft.wer || undefined, geplant: aDraft.geplant || undefined, melder: aDraft.melder || undefined,
        zeit: new Date().toISOString(),
      };
      // Kam die Arbeit von einem Pinnwand-Zettel, wird er in derselben Speicherung entfernt
      const basis = arbeitModal.ausZettel ? entries.filter((e) => e.id !== arbeitModal.ausZettel) : entries;
      await persist([...basis, a]);
    } else {
      await persist(entries.map((e) => e.id === arbeitModal.id
        ? { ...e, name: anlage, note, prio: aDraft.prio, art: aDraft.art, azubi: aDraft.azubi, stillstand: aDraft.stillstand, wer: aDraft.wer || undefined, geplant: aDraft.geplant || undefined }
        : e));
    }
    setArbeitModal(null);
  };
  const setArbeitStatus = async (id, status) => {
    await persist(entries.map((e) => e.id === id
      ? { ...e, status, erledigtAm: status === "done" ? todayKey : undefined }
      : e));
  };
  // ---- Anlagen-Akte ----
  const akteDaten = (() => {
    if (!akteAnlage) return null;
    const offene = arbeitenOffen.filter((a) => a.name === akteAnlage);
    const erledigte = arbeiten
      .filter((a) => a.name === akteAnlage && a.status === "done")
      .sort((x, y) => String(y.erledigtAm || y.date).localeCompare(String(x.erledigtAm || x.date)))
      .slice(0, 5);
    const historie = kalenderEntries
      .filter((e) => e.name === akteAnlage || (e.category === "RI" && e.name.toLowerCase().includes(akteAnlage.toLowerCase())))
      .sort((x, y) => y.date.localeCompare(x.date))
      .slice(0, 10);
    const tpm12 = kalenderEntries.filter((e) => {
      if (e.category !== "TPM" || e.name !== akteAnlage) return false;
      const grenze = new Date(); grenze.setDate(grenze.getDate() - 365);
      return new Date(e.date + "T00:00:00") >= grenze;
    });
    const quote = quoteFuer(tpm12);
    const tpmItem = tpmAnlagen.find((a) => a.name === akteAnlage);
    const naechste = todayPlanResult.assignments.find((p) => p.anlage === akteAnlage && p.date >= todayKey);
    return { offene, erledigte, historie, quote, tpmItem, naechste };
  })();

  // ---- Arbeitsplanung (Wochenraster) ----
  const planungMontag = (() => {
    const d = new Date(planungCursor);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const planungTage = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const d = addDays(planungMontag, i);
    return { datum: d, key: dateKey(d.getFullYear(), d.getMonth(), d.getDate()), we: i >= 5 };
  });
  // TPM/R+I-Termine der Woche (Woche kann über die Monatsgrenze gehen -> beide Monate rechnen)
  const wochenPlan = (() => {
    if (view !== "COCKPIT" || cockpitTab !== "PLANUNG" || !heavyReady) return [];
    const monate = new Map();
    planungTage.forEach((t) => monate.set(`${t.datum.getFullYear()}-${t.datum.getMonth()}`, [t.datum.getFullYear(), t.datum.getMonth()]));
    const alle = [];
    monate.forEach(([y, m]) => alle.push(...computeMaintenancePlan(y, m).assignments));
    const keys = new Set(planungTage.map((t) => t.key));
    return alle.filter((p) => keys.has(p.date));
  })();
  const geplantFuer = (person, tagKey) =>
    arbeitenOffen.filter((a) => a.wer === person && a.geplant === tagKey);
  const einplanen = async (arbeitId, person, tagKey) => {
    await persist(entries.map((e) => (e.id === arbeitId ? { ...e, wer: person, geplant: tagKey } : e)));
    setPlanungPicker(null);
  };

  // ---- Werkstattschichtplan ----
  // Schicht-Einträge: scope "woche" (gilt Mo-Fr, id schicht-w|Person|2026-W28) und
  // scope "tag" (Tages-Ausnahme, id schicht-t|Person|2026-07-08). Tag schlägt Woche.
  // wert "-" als Tages-Ausnahme heißt: an diesem Tag keine Schicht trotz Wochen-Schicht.
  const schichtFuer = (person, tagKey) => {
    const tag = entries.find((e) => e.category === "SCHICHT" && e.scope === "tag" && e.name === person && e.date === tagKey);
    if (tag) return SCHICHTEN[tag.wert] ? tag.wert : null;
    const d = new Date(tagKey + "T00:00:00");
    if (d.getDay() === 0 || d.getDay() === 6) return null; // Wochen-Schicht gilt nur Mo-Fr
    const wKey = isoWocheKey(d);
    const woche = entries.find((e) => e.category === "SCHICHT" && e.scope === "woche" && e.name === person && e.woche === wKey);
    return woche && SCHICHTEN[woche.wert] ? woche.wert : null;
  };

  // ---- Werkstatt-Monitor: wer ist JETZT da (Früh 06-14, Spät 14-22, Nacht 22-06) ----
  // Genutzt vom Cockpit-Übersicht-Kachel "Heute da" und vom Vollbild-Monitor.
  const jetztInDerWerkstatt = (() => {
    const jetzt = new Date();
    const stunde = jetzt.getHours();
    const aktuell = stunde >= 6 && stunde < 14 ? "FRUEH" : stunde >= 14 && stunde < 22 ? "SPAET" : "NACHT";
    const tagKeyVon = (d) => dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    // Nach Mitternacht (0-6 Uhr) läuft noch die Nachtschicht vom Vortag
    const bezugsTag = aktuell === "NACHT" && stunde < 6 ? tagKeyVon(addDays(jetzt, -1)) : tagKeyVon(jetzt);
    // Crew einer Schicht an einem Tag; Früh enthält auch alle mit Gewerk
    // OHNE eingetragene Schicht (= Tagschicht), "Sonstige" bleiben draußen
    const crewFuer = (typ, tag) => {
      const arten = { FRUEH: ["Früh"], SPAET: ["Spät", "Spät mit B"], NACHT: ["Nacht"] }[typ];
      const crew = team
        .map((m) => ({ name: m.name, rolle: m.rolle || "", schicht: schichtFuer(m.name, tag) }))
        .filter((x) => x.schicht && arten.includes(x.schicht));
      if (typ === "FRUEH") {
        team.forEach((m) => {
          if ((m.rolle || "") !== "" && !schichtFuer(m.name, tag)) crew.push({ name: m.name, schicht: "Früh" });
        });
      }
      return crew;
    };
    const SCHICHT_INFO = {
      FRUEH: { label: "Frühschicht", zeit: "06:00 – 14:00" },
      SPAET: { label: "Spätschicht", zeit: "14:00 – 22:00" },
      NACHT: { label: "Nachtschicht", zeit: "22:00 – 06:00" },
    };
    const jetztCrew = crewFuer(aktuell, bezugsTag);
    const heuteKey2 = tagKeyVon(jetzt);
    const spalten = [
      ["FRUEH", "Früh"],
      ["SPAET", "Spät / Spät mit B"],
      ["NACHT", "Nacht"],
    ].map(([typ, titel]) => [typ, titel, crewFuer(typ, heuteKey2)]);
    return { aktuell, SCHICHT_INFO, jetztCrew, spalten };
  })();

  const setzeSchicht = async (person, tagKey, wert, ganzeWoche) => {
    const montag = montagVon(tagKey);
    const wKey = isoWocheKey(montag);
    const wochenTage = [0, 1, 2, 3, 4].map((i) => { const d = addDays(montag, i); return dateKey(d.getFullYear(), d.getMonth(), d.getDate()); });
    let next;
    if (ganzeWoche) {
      // Wochen-Schicht setzen und alle Tages-Ausnahmen dieser Woche aufräumen
      next = entries.filter((e) => !(e.category === "SCHICHT" && e.name === person &&
        ((e.scope === "woche" && e.woche === wKey) || (e.scope === "tag" && wochenTage.includes(e.date)))));
      if (SCHICHTEN[wert]) {
        next = [...next, { id: `schicht-w|${person}|${wKey}`, date: dateKey(montag.getFullYear(), montag.getMonth(), montag.getDate()), category: "SCHICHT", name: person, scope: "woche", woche: wKey, wert }];
      }
    } else {
      next = entries.filter((e) => !(e.category === "SCHICHT" && e.scope === "tag" && e.name === person && e.date === tagKey));
      const hatWoche = entries.some((e) => e.category === "SCHICHT" && e.scope === "woche" && e.name === person && e.woche === wKey);
      if (SCHICHTEN[wert] || hatWoche) {
        // "-" wird nur als Ausnahme gespeichert, wenn eine Wochen-Schicht zu überstimmen ist
        next = [...next, { id: `schicht-t|${person}|${tagKey}`, date: tagKey, category: "SCHICHT", name: person, scope: "tag", wert: SCHICHTEN[wert] ? wert : "-" }];
      }
    }
    await persist(next);
    setSchichtPicker(null);
  };

  // Freie Notizen in Planungszellen (Kategorie PLANNOTIZ)
  const notizenFuer = (person, tagKey) =>
    entries.filter((e) => e.category === "PLANNOTIZ" && e.name === person && e.date === tagKey);
  const savePlanNotiz = async () => {
    if (!planNotiz) return;
    const text = saeubere(planNotiz.text || "");
    if (!text) { setPlanNotiz(null); return; }
    let next;
    if (planNotiz.id) {
      next = entries.map((e) => (e.id === planNotiz.id ? { ...e, note: text } : e));
    } else {
      next = [...entries, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: planNotiz.datum, category: "PLANNOTIZ", name: planNotiz.person, note: text }];
    }
    await persist(next);
    setPlanNotiz(null);
  };
  const deletePlanNotiz = async () => {
    if (!planNotiz || !planNotiz.id) return;
    await persist(entries.filter((e) => e.id !== planNotiz.id));
    setPlanNotiz(null);
  };

  const deleteArbeit = async (id) => {
    if (!window.confirm("Diese Arbeit endgültig löschen?")) return;
    await persist(entries.filter((e) => e.id !== id));
    setArbeitModal(null);
  };

  // Erledigt-Abgleich für den Plan: gibt es zu einem Plan-Punkt (Datum + Anlage)
  // einen Kalender-Eintrag mit Status "done", wird er im Plan grün dargestellt.
  const planDoneKeys = useMemo(() => {
    const set = new Set();
    entries.forEach((e) => {
      if (e.category !== "TPM" && e.category !== "RI") return;
      if (e.status === "done") set.add(`${e.date}|${e.name}`);
    });
    return set;
  }, [entries]);
  const isPlanDone = (p) => planDoneKeys.has(`${p.date}|${p.anlage}`);

  // Bearbeiten direkt aus dem Plan: Klick auf einen Plan-Punkt öffnet den
  // Eintrag (Gemacht/Offen/Notiz). Gibt es noch keinen Kalender-Eintrag zu
  // diesem Punkt, wird er dabei automatisch angelegt (Status: offen).
  const openPlanEntry = async (p) => {
    if (readerMode) return;
    let entry = entries.find((e) => e.date === p.date && e.name === p.anlage);
    if (!entry) {
      const category = riItems.some((r) => r.name === p.anlage) ? "RI" : "TPM";
      entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date: p.date,
        category,
        name: p.anlage,
        status: "open",
        note: "",
      };
      await persist([...entries, entry]);
    }
    openEditModal(entry);
  };

  const applyPlanToCalendar = async () => {
    const riNamesNow = riItems.map((r) => r.name);
    const existingKeys = new Set(entries.map((e) => `${e.date}|${e.category}|${e.name}`));
    const newEntries = maintenancePlan
      .map((p) => ({ ...p, category: riNamesNow.includes(p.anlage) ? "RI" : "TPM" }))
      .filter((p) => !existingKeys.has(`${p.date}|${p.category}|${p.anlage}`))
      .map((p) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${p.day}`,
        date: p.date,
        category: p.category,
        name: p.anlage,
        status: "open",
        note: "",
      }));
    if (newEntries.length > 0) {
      await persist([...entries, ...newEntries]);
    }
  };

  // ---- Matrix Helfer ----
  const buildMonthIndex = (catEntries) => {
    const map = new Map();
    catEntries.forEach((e) => {
      const key = `${e.date}|${e.name}`;
      let rec = map.get(key);
      if (!rec) { rec = { done: 0, open: 0, hasNote: false }; map.set(key, rec); }
      if (e.status === "done") rec.done++; else rec.open++;
      if (e.note && e.note.trim()) rec.hasNote = true;
    });
    return map;
  };

  const buildYearIndex = (catEntries) => {
    const map = new Map();
    catEntries.forEach((e) => {
      const prefix = e.date.slice(0, 7); // YYYY-MM
      const key = `${e.name}|${prefix}`;
      let rec = map.get(key);
      if (!rec) { rec = { done: 0, open: 0, hasNote: false }; map.set(key, rec); }
      if (e.status === "done") rec.done++; else rec.open++;
      if (e.note && e.note.trim()) rec.hasNote = true;
    });
    return map;
  };

  const monthCellStatus = (index, name, day) => {
    const rec = index.get(`${dateKey(year, month, day)}|${name}`);
    if (!rec) return { state: "none", hasNote: false };
    return { state: rec.done > 0 ? "done" : "open", hasNote: rec.hasNote };
  };

  const yearCellStatus = (index, name, mIdx) => {
    const rec = index.get(`${name}|${year}-${pad(mIdx + 1)}`);
    if (!rec) return { state: "none", d: 0, o: 0, hasNote: false };
    let state = "none";
    if (rec.done > 0 && rec.open > 0) state = "mixed";
    else if (rec.done > 0) state = "done";
    else if (rec.open > 0) state = "open";
    return { state, d: rec.done, o: rec.open, hasNote: rec.hasNote };
  };

  const rowsForCategory = (category, catEntries) => {
    if (category === "TPM") return tpmAnlagen.map((a) => a.name);
    if (category === "RI") return riItems.map((r) => r.name);
    return Array.from(new Set(catEntries.map((e) => e.name))).sort();
  };

  const renderMonthMatrix = (category) => {
    const catEntries = entries.filter((e) => e.category === category);
    const rows = rowsForCategory(category, catEntries);
    if (rows.length === 0) {
      return <div className="text-xs italic text-slate-400 py-2">Noch keine {CATS[category].full}-Einträge.</div>;
    }
    const index = buildMonthIndex(catEntries);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "10px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "3px 8px", background: "white" }}>Anlage</th>
              {days.map((d) => (
                <th key={d} style={{ padding: "2px 2px", fontWeight: 600, color: holidays.get(dateKey(year, month, d)) ? "#B23A34" : isWeekend(year, month, d) ? "#6D93B8" : "#8A9099", minWidth: "22px" }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((name) => (
              <tr key={name}>
                <td
                  style={{ padding: "2px 8px", fontWeight: 700, whiteSpace: "nowrap", borderRight: "1px solid #E2E4E7", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: "#C3C7CB" }}
                  onClick={() => setRegisterItem({ category, name })}
                  title="Historie anzeigen"
                >
                  {name}
                </td>
                {days.map((d) => {
                  const { state: st, hasNote } = monthCellStatus(index, name, d);
                  const c = STATUS_COLORS[st];
                  return (
                    <td key={d} style={{ padding: "1.5px", textAlign: "center" }}>
                      <div
                        style={{
                          position: "relative",
                          width: "20px",
                          height: "20px",
                          margin: "0 auto",
                          borderRadius: "5px",
                          backgroundColor: c.bg,
                          border: `1px solid ${c.fg}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: c.fg,
                          fontSize: "12px",
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >
                        {st === "done" ? "✓" : st === "open" ? "✕" : ""}
                        {hasNote && (
                          <div style={{ position: "absolute", top: "-2px", right: "-2px", width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#22262B" }} />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderYearMatrix = (category) => {
    const catEntries = entries.filter((e) => e.category === category);
    const rows = rowsForCategory(category, catEntries);
    if (rows.length === 0) {
      return <div className="text-xs italic text-slate-400 py-2">Noch keine {CATS[category].full}-Einträge.</div>;
    }
    const index = buildYearIndex(catEntries);
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "11px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "3px 8px" }}>Anlage</th>
              {MONTHS_SHORT.map((m) => (
                <th key={m} style={{ padding: "3px 4px", fontWeight: 600, color: "#8A9099" }}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((name) => (
              <tr key={name}>
                <td
                  style={{ padding: "3px 8px", fontWeight: 700, whiteSpace: "nowrap", borderRight: "1px solid #E2E4E7", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: "#C3C7CB" }}
                  onClick={() => setRegisterItem({ category, name })}
                  title="Historie anzeigen"
                >
                  {name}
                </td>
                {MONTHS_SHORT.map((m, mIdx) => {
                  const { state, d, o, hasNote } = yearCellStatus(index, name, mIdx);
                  const c = STATUS_COLORS[state];
                  return (
                    <td key={m} style={{ padding: "2px" }}>
                      <div style={{ minWidth: "58px", padding: "3px 5px", borderRadius: "5px", textAlign: "center", backgroundColor: c.bg, border: `1px solid ${c.fg}` }}>
                        {state === "none" ? (
                          <span style={{ color: c.fg, fontWeight: 700, fontSize: "11px" }}>–</span>
                        ) : (
                          <>
                            <div style={{ color: "#2F7D4F", fontWeight: 700, fontSize: "10px", lineHeight: 1.4 }}>{d} gemacht</div>
                            <div style={{ color: "#B23A34", fontWeight: 700, fontSize: "10px", lineHeight: 1.4 }}>{o} offen</div>
                          </>
                        )}
                        {hasNote && <div style={{ fontSize: "9px", color: "#22262B", marginTop: "1px" }}>•</div>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCategoryBlock = (category, breakBefore) => (
    <div style={breakBefore ? { breakBefore: "page" } : undefined}>
      <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: CATS[category].color }}>
        {CATS[category].full}
      </div>
      {view === "MONAT" ? renderMonthMatrix(category) : renderYearMatrix(category)}
    </div>
  );

  // ---- Eigenständiges Druck-Dokument (unabhängig vom Tailwind-Stylesheet, funktioniert per Popup oder Download) ----
  const escapeHtml = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const buildMonthMatrixHTML = (category) => {
    const catEntries = entries.filter((e) => e.category === category);
    const rows = rowsForCategory(category, catEntries);
    if (rows.length === 0) {
      return `<p style="font-size:11px;color:#9AA1A9;font-style:italic;">Noch keine ${escapeHtml(CATS[category].full)}-Einträge.</p>`;
    }
    const index = buildMonthIndex(catEntries);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    let html = `<table style="border-collapse:collapse;font-size:10px;"><thead><tr><th style="text-align:left;padding:3px 8px;">Anlage</th>`;
    days.forEach((d) => {
      const color = holidays.get(dateKey(year, month, d)) ? "#B23A34" : isWeekend(year, month, d) ? "#6D93B8" : "#8A9099";
      html += `<th style="padding:2px;font-weight:600;color:${color};min-width:22px;">${d}</th>`;
    });
    html += `</tr></thead><tbody>`;
    rows.forEach((name) => {
      html += `<tr><td style="padding:2px 8px;font-weight:700;white-space:nowrap;border-right:1px solid #E2E4E7;">${escapeHtml(name)}</td>`;
      days.forEach((d) => {
        const { state, hasNote } = monthCellStatus(index, name, d);
        const c = STATUS_COLORS[state];
        const symbol = state === "done" ? "✓" : state === "open" ? "✕" : "";
        html += `<td style="padding:1.5px;text-align:center;"><div style="position:relative;width:20px;height:20px;margin:0 auto;border-radius:5px;background:${c.bg};border:1px solid ${c.fg};display:flex;align-items:center;justify-content:center;color:${c.fg};font-size:12px;font-weight:700;line-height:1;">${symbol}`;
        if (hasNote) html += `<div style="position:absolute;top:-2px;right:-2px;width:5px;height:5px;border-radius:50%;background:#22262B;"></div>`;
        html += `</div></td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table>`;
    return html;
  };

  const buildYearMatrixHTML = (category) => {
    const catEntries = entries.filter((e) => e.category === category);
    const rows = rowsForCategory(category, catEntries);
    if (rows.length === 0) {
      return `<p style="font-size:11px;color:#9AA1A9;font-style:italic;">Noch keine ${escapeHtml(CATS[category].full)}-Einträge.</p>`;
    }
    const index = buildYearIndex(catEntries);
    let html = `<div style="display:flex;justify-content:center;"><table style="border-collapse:collapse;font-size:14px;"><thead><tr><th style="text-align:left;padding:6px 10px;">Anlage</th>`;
    MONTHS_SHORT.forEach((m) => { html += `<th style="padding:6px 3px;font-weight:600;color:#8A9099;">${m}</th>`; });
    html += `</tr></thead><tbody>`;
    rows.forEach((name) => {
      html += `<tr><td style="padding:5px 10px;font-weight:700;white-space:nowrap;border-right:1px solid #E2E4E7;">${escapeHtml(name)}</td>`;
      MONTHS_SHORT.forEach((m, mIdx) => {
        const { state, d, o, hasNote } = yearCellStatus(index, name, mIdx);
        const c = STATUS_COLORS[state];
        const inner = state === "none"
          ? `<span style="color:${c.fg};font-weight:700;font-size:14px;">–</span>`
          : `<div style="color:#2F7D4F;font-weight:700;font-size:11px;line-height:1.4;white-space:nowrap;">${d} gemacht</div><div style="color:#B23A34;font-weight:700;font-size:11px;line-height:1.4;white-space:nowrap;">${o} offen</div>`;
        html += `<td style="padding:3px 2px;"><div style="min-width:62px;padding:4px 4px;border-radius:6px;text-align:center;background:${c.bg};border:1px solid ${c.fg};">${inner}${hasNote ? `<div style="font-size:11px;color:#22262B;">•</div>` : ""}</div></td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
  };

  const buildNotesTableHTML = () => {
    let html = `<table style="border-collapse:collapse;font-size:11px;width:100%;"><thead><tr style="border-bottom:2px solid #22262B;">
      <th style="text-align:left;padding:4px 8px;">Datum</th>
      <th style="text-align:left;padding:4px 8px;">Kategorie</th>
      <th style="text-align:left;padding:4px 8px;">Anlage / Punkt</th>
      <th style="text-align:left;padding:4px 8px;">Status</th>
      <th style="text-align:left;padding:4px 8px;">Notiz</th>
    </tr></thead><tbody>`;
    notesList.forEach((e) => {
      html += `<tr style="border-bottom:1px solid #E2E4E7;">
        <td style="padding:4px 8px;font-family:monospace;white-space:nowrap;">${escapeHtml(formatDateDE(e.date))}</td>
        <td style="padding:4px 8px;font-weight:700;color:${CATS[e.category].color};">${escapeHtml(CATS[e.category].label)}</td>
        <td style="padding:4px 8px;font-weight:600;">${escapeHtml(e.name)}</td>
        <td style="padding:4px 8px;font-weight:700;color:${e.status === "done" ? "#2F7D4F" : "#B23A34"};">${e.status === "done" ? "Gemacht" : "Offen"}</td>
        <td style="padding:4px 8px;">${escapeHtml(e.note)}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    return html;
  };

  const buildCalendarGridHTML = () => {
    const weekdayHeaders = WEEKDAYS.map(
      (w, i) => `<div style="text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:${i >= 5 ? "#6D93B8" : "#8A9099"};padding:3px 0;">${w}</div>`
    ).join("");

    const buildDayCell = (d) => {
      if (d === null) return `<div></div>`;
      const key = dateKey(year, month, d);
      const dayEntries = entriesForDay(key);
      const isToday = key === todayKey;
      const holName = holidays.get(key);
      const weekend = isWeekend(year, month, d);
      let inner = `<div style="font-family:monospace;font-size:10px;color:${holName ? "#B23A34" : weekend ? "#5B87AB" : "#5B6572"};font-weight:${holName ? "700" : "400"};margin-bottom:2px;">${d}</div>`;
      if (holName) {
        inner += `<div style="font-size:9px;font-weight:700;color:#B23A34;margin-bottom:2px;">${escapeHtml(holName)}</div>`;
      }
      dayEntries.forEach((e) => {
        const bg = e.status === "done" ? "#E5F3EA" : "#FBE9E7";
        const fg = e.status === "done" ? "#2F7D4F" : "#B23A34";
        inner += `<div style="display:flex;gap:3px;align-items:center;background:${bg};color:${fg};border:1px solid ${fg};border-radius:4px;padding:1px 5px;margin-bottom:2px;font-size:10px;font-weight:700;line-height:1.3;">
          <span style="text-transform:uppercase;color:${CATS[e.category].color};">${escapeHtml(CATS[e.category].label)}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(e.name)}</span>
          ${e.note && e.note.trim() ? `<span style="color:#22262B;">&bull;</span>` : ""}
        </div>`;
      });
      const cellBg = holName ? "#FBE9E7" : weekend ? "#E5F0F8" : "white";
      const borderColor = isToday ? "#C97A2B" : holName ? "#E8B4AE" : weekend ? "#C8DDEE" : "#E2E4E7";
      return `<div style="border:${isToday ? "2px" : "1px"} solid ${borderColor};border-radius:6px;padding:5px;min-height:80px;background:${cellBg};">${inner}</div>`;
    };

    const weekRows = chunkIntoWeeks(cells)
      .map((week) => {
        const label = weekLabel(week, year, month);
        const dayCells = week.map(buildDayCell).join("");
        return `<div style="display:flex;gap:5px;margin-bottom:5px;">
          <div style="width:26px;flex-shrink:0;display:flex;align-items:flex-start;justify-content:center;padding-top:6px;font-family:monospace;font-size:10px;font-weight:700;color:#B7BEC6;">${label}</div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;flex:1;">${dayCells}</div>
        </div>`;
      })
      .join("");

    return `<div style="display:flex;gap:5px;margin-bottom:6px;">
        <div style="width:26px;flex-shrink:0;"></div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;flex:1;">${weekdayHeaders}</div>
      </div>
      ${weekRows}`;
  };

  const buildPlanCalendarGridHTML = () => {
    const planByDay = new Map();
    maintenancePlan.forEach((p) => {
      if (!planByDay.has(p.day)) planByDay.set(p.day, []);
      planByDay.get(p.day).push(p);
    });
    const weekdayHeaders = WEEKDAYS.map(
      (w, i) => `<div style="text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:${i >= 5 ? "#6D93B8" : "#8A9099"};padding:3px 0;">${w}</div>`
    ).join("");

    const buildDayCell = (d) => {
      if (d === null) return `<div></div>`;
      const key = dateKey(year, month, d);
      const isToday = key === todayKey;
      const holName = holidays.get(key);
      const weekend = isWeekend(year, month, d);
      let inner = `<div style="font-family:monospace;font-size:10px;color:${holName ? "#B23A34" : weekend ? "#5B87AB" : "#5B6572"};font-weight:${holName ? "700" : "400"};margin-bottom:2px;">${d}</div>`;
      if (holName) {
        inner += `<div style="font-size:9px;font-weight:700;color:#B23A34;margin-bottom:2px;">${escapeHtml(holName)}</div>`;
      }
      const dayPlans = planByDay.get(d) || [];
      // Druckvorlage bleibt bewusst neutral (ohne Erledigt-Status): Sie wird am
      // Monatsanfang ausgehängt; der Live-Status ist am Bildschirm zu sehen.
      dayPlans.forEach((p) => {
        const c = planGroupColor(p.anlage, tpmAnlagen, riItems);
        inner += `<div style="background:${c}18;color:${c};border:1px solid ${c};border-radius:4px;padding:2px 5px;margin-bottom:2px;font-size:10px;font-weight:700;line-height:1.3;word-break:break-word;overflow-wrap:break-word;">${escapeHtml(p.anlage)}</div>`;
      });
      const cellBg = holName ? "#FBE9E7" : weekend ? "#E5F0F8" : "white";
      const borderColor = isToday ? "#C97A2B" : holName ? "#E8B4AE" : weekend ? "#C8DDEE" : "#E2E4E7";
      return `<div style="border:${isToday ? "2px" : "1px"} solid ${borderColor};border-radius:6px;padding:5px;min-height:80px;background:${cellBg};">${inner}</div>`;
    };

    const weekRows = chunkIntoWeeks(cells)
      .map((week) => {
        const label = weekLabel(week, year, month);
        const dayCells = week.map(buildDayCell).join("");
        return `<div style="display:flex;gap:5px;margin-bottom:5px;">
          <div style="width:26px;flex-shrink:0;display:flex;align-items:flex-start;justify-content:center;padding-top:6px;font-family:monospace;font-size:10px;font-weight:700;color:#B7BEC6;">${label}</div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;flex:1;">${dayCells}</div>
        </div>`;
      })
      .join("");

    return `<div style="display:flex;gap:5px;margin-bottom:6px;">
        <div style="width:26px;flex-shrink:0;"></div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;flex:1;">${weekdayHeaders}</div>
      </div>
      ${weekRows}`;
  };

  const buildPlanTableHTML = () => {
    let html = `<table style="border-collapse:collapse;font-size:13px;width:100%;"><thead><tr style="border-bottom:2px solid #22262B;">
      <th style="text-align:left;padding:5px 10px;">Datum</th>
      <th style="text-align:left;padding:5px 10px;">Wochentag</th>
      <th style="text-align:left;padding:5px 10px;">Anlage</th>
      <th style="text-align:left;padding:5px 10px;">Gruppe</th>
    </tr></thead><tbody>`;
    maintenancePlan.forEach((p) => {
      const dt = new Date(year, month, p.day);
      const wd = dt.toLocaleDateString("de-DE", { weekday: "long" });
      html += `<tr style="border-bottom:1px solid #E2E4E7;">
        <td style="padding:5px 10px;font-family:monospace;">${escapeHtml(formatDateDE(p.date))}</td>
        <td style="padding:5px 10px;">${escapeHtml(wd)}</td>
        <td style="padding:5px 10px;font-weight:700;">${escapeHtml(p.anlage)}</td>
        <td style="padding:5px 10px;color:#8A9099;">${escapeHtml(planGroupLabel(p.anlage, tpmAnlagen, riItems))}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    return html;
  };

  const buildPrintDocument = () => {
    const catsToShow = filter === "ALL" ? ["TPM", "RI"] : [filter];
    let body = `<div style="text-align:center;margin-bottom:18px;">
      <div style="font-weight:900;font-size:22px;text-transform:uppercase;letter-spacing:0.02em;">${escapeHtml(printPrefix)}</div>
      <div style="font-family:monospace;font-size:13px;margin-top:2px;">${escapeHtml(printSuffix)}</div>
      ${view !== "PLAN" ? `<div style="font-family:monospace;font-size:11px;margin-top:4px;">${doneCount} erledigt · ${openCount} offen${donePercent !== null ? ` · ${donePercent} %` : ""}</div>` : ""}
    </div>`;

    if (view === "PLAN") {
      body += `<div style="margin-bottom:24px;">
        <div style="font-weight:700;font-size:13px;text-transform:uppercase;margin-bottom:5px;">Kalender – ${escapeHtml(MONTHS[month])} ${year}</div>
        ${buildPlanCalendarGridHTML()}
      </div>`;
      body += `<div style="break-before:page;page:notes;">
        <div style="font-weight:700;font-size:13px;text-transform:uppercase;margin-bottom:8px;">Wartungsplan – Tabelle</div>
        ${buildPlanTableHTML()}
      </div>`;
      return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(printPrefix)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          @page notes { size: A4 portrait; margin: 15mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 16px; }
          table { border-collapse: collapse; }
        </style>
      </head><body>${body}</body></html>`;
    }

    let matrixSection = "";
    catsToShow.forEach((cat, idx) => {
      const labelAlign = view === "JAHR" ? "center" : "left";
      const labelSize = view === "JAHR" ? "16px" : "12px";
      matrixSection += `<div style="${idx > 0 ? "break-before:page;" : ""}margin-bottom:24px;">
        <div style="font-weight:700;font-size:${labelSize};text-align:${labelAlign};text-transform:uppercase;letter-spacing:0.03em;color:${CATS[cat].color};margin-bottom:10px;">${escapeHtml(CATS[cat].full)}</div>
        ${view === "MONAT" ? buildMonthMatrixHTML(cat) : buildYearMatrixHTML(cat)}
      </div>`;
    });

    if (view === "MONAT") {
      body += `<div style="margin-bottom:24px;">
        <div style="font-weight:700;font-size:13px;text-transform:uppercase;margin-bottom:5px;">Kalender – ${escapeHtml(MONTHS[month])} ${year}</div>
        ${buildCalendarGridHTML()}
      </div>`;
      body += `<div style="break-before:page;">${matrixSection}</div>`;
    } else {
      body += matrixSection;
    }

    if (notesList.length > 0) {
      body += `<div style="break-before:page;page:notes;">
        <div style="font-weight:700;font-size:13px;text-transform:uppercase;margin-bottom:8px;">Notizen – ${escapeHtml(view === "JAHR" ? `Jahr ${year}` : `${MONTHS[month]} ${year}`)}</div>
        ${buildNotesTableHTML()}
      </div>`;
    }

    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(printPrefix)}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        @page notes { size: A4 portrait; margin: 15mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 16px; }
        table { border-collapse: collapse; }
      </style>
    </head><body>${body}</body></html>`;
  };

  const handlePrint = () => {
    const html = buildPrintDocument();
    let popup = null;
    try {
      popup = window.open("", "_blank");
    } catch (e) {
      popup = null;
    }
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      setTimeout(() => {
        try { popup.print(); } catch (e) { /* falls print() selbst blockiert ist, bleibt das Fenster offen */ }
      }, 300);
      setErr(null);
    } else {
      try {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `werkstatt-kalender-${view.toLowerCase()}-${year}${view === "MONAT" ? "-" + pad(month + 1) : ""}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setErr('Pop-up wurde blockiert. Die Druckvorlage wurde als Datei heruntergeladen – bitte öffnen und von dort drucken.');
      } catch (e) {
        setErr("Drucken hat nicht geklappt. Bitte Pop-up-Blocker für diese Seite deaktivieren und erneut versuchen.");
      }
    }
  };

  const printPrefix = view === "PLAN" ? "Wartungsplan" : filter === "ALL" ? "Werkstatt-Kalender" : CATS[filter].full;
  const printSuffix = view === "JAHR" ? `Jahresübersicht ${year}` : view === "PLAN" ? `${MONTHS[month]} ${year}` : `Monatsübersicht ${MONTHS[month]} ${year}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#EBEDEF" }}>
        <div className="text-sm text-slate-500 font-mono">Kalender wird geladen…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans text-slate-800" style={{ backgroundColor: "#EBEDEF" }}>
      <style>{`
        .no-print { }
        .print-only { display: none; }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          @page notes { size: A4 portrait; margin: 15mm; }
          .notes-page { page: notes; break-before: page; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-bg { background: white !important; }
          .cal-card { border: none !important; box-shadow: none !important; border-radius: 0 !important; }
        }
      `}</style>

      {/* Kopfzeile */}
      <div
        className="no-print sticky top-0 z-10 px-4 py-3 flex flex-wrap items-center gap-3 justify-between"
        style={{ backgroundColor: "#22262B" }}
      >
        <div className="flex items-center gap-3">
          <div className="font-black text-lg tracking-tight uppercase text-white">Werkstatt-Kalender</div>
          {!readerMode && (
            <>
              {/* Hauptbereiche */}
              <div className="flex rounded overflow-hidden border border-white/20">
                {[["COCKPIT", "Cockpit"], ["TPM", "TPM"]].map(([v, label]) => {
                  const active = v === "COCKPIT" ? view === "COCKPIT" : view !== "COCKPIT";
                  return (
                    <button
                      key={v}
                      onClick={() => {
                        if (v === "COCKPIT") { setView("COCKPIT"); setCockpitTab("UEBERSICHT"); }
                        else setView("PLAN");
                      }}
                      className="px-3 py-1.5 text-xs font-black uppercase tracking-wide"
                      style={{ backgroundColor: active ? "#C97A2B" : "transparent", color: "white" }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {/* Untermenü des aktiven Hauptbereichs (kleiner und dezenter abgesetzt) */}
              {view === "COCKPIT" ? (
                <div className="flex rounded overflow-hidden border border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  {[["UEBERSICHT", "Übersicht"], ["SCHICHTPLAN", "Schichtplan"], ["PLANUNG", "Planung"], ["BACKLOG", "Backlog"]].map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setCockpitTab(v)}
                      className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                      style={{ backgroundColor: cockpitTab === v ? "#4B5259" : "transparent", color: cockpitTab === v ? "#fff" : "#B7BEC6" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex rounded overflow-hidden border border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  {[["PLAN", "Plan"], ["AUSWERTUNG", "Auswertung"], ["REGISTER", "Register"]].map(([v, label]) => {
                    const active = v === "AUSWERTUNG" ? (view === "MONAT" || view === "JAHR") : view === v;
                    return (
                      <button
                        key={v}
                        onClick={() => setView(v === "AUSWERTUNG" ? "MONAT" : v)}
                        className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: active ? "#4B5259" : "transparent", color: active ? "#fff" : "#B7BEC6" }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1 text-white">
          {view === "MONAT" || view === "PLAN" ? (
            <>
              <button onClick={() => changeMonth(-1)} className="p-1.5 rounded hover:opacity-75 transition-opacity" aria-label="Vorheriger Monat">
                <ChevronLeft size={18} />
              </button>
              <div className="font-mono text-sm w-36 text-center">{MONTHS[month]} {year}</div>
              <button onClick={() => changeMonth(1)} className="p-1.5 rounded hover:opacity-75 transition-opacity" aria-label="Nächster Monat">
                <ChevronRight size={18} />
              </button>
            </>
          ) : view === "JAHR" ? (
            <>
              <button onClick={() => changeYear(-1)} className="p-1.5 rounded hover:opacity-75 transition-opacity" aria-label="Vorheriges Jahr">
                <ChevronLeft size={18} />
              </button>
              <div className="font-mono text-sm w-20 text-center">{year}</div>
              <button onClick={() => changeYear(1)} className="p-1.5 rounded hover:opacity-75 transition-opacity" aria-label="Nächstes Jahr">
                <ChevronRight size={18} />
              </button>
            </>
          ) : view === "REGISTER" ? (
            <div className="font-mono text-sm px-2">Alle Termine</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImportFile} />
          {view !== "COCKPIT" && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 text-white px-3 py-1.5 rounded font-bold text-sm uppercase tracking-wide hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#C97A2B" }}
            >
              <Printer size={16} /> Drucken
            </button>
          )}
          {!readerMode && (
            <button
              onClick={openSettings}
              className="flex items-center text-white p-1.5 rounded hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#4B5259" }}
              title="Anlagen & R+I-Punkte verwalten"
              aria-label="Verwalten"
            >
              <Settings size={14} />
            </button>
          )}
          {(!readerMode || kioskMonitor) && (
            <button
              onClick={() => setMonitorOpen(true)}
              className="flex items-center text-white p-1.5 rounded hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#4B5259" }}
              title="Werkstatt-Monitor (Vollbild)"
              aria-label="Werkstatt-Monitor"
            >
              <Tv size={14} />
            </button>
          )}
          {!readerMode && (
            <>
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                className="flex items-center text-white p-1.5 rounded hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#2F6690" }}
                title="Datensicherung einlesen (Import)"
                aria-label="Import"
              >
                <Upload size={14} />
              </button>
              <button
                onClick={exportData}
                className="flex items-center text-white p-1.5 rounded hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#2F6690" }}
                title="Alle Einträge als Datei sichern (Export)"
                aria-label="Export"
              >
                <Download size={14} />
              </button>
            </>
          )}
          {/* Gemeinsame Datei: immer nur das kleine Ordner-Symbol, ganz rechts.
              Grün = verbunden, Grau = noch nicht eingerichtet.
              Nur-Leser sehen das Symbol nicht - sie sollen die Verbindung weder
              trennen noch eine andere Datei wählen können. */}
          {!readerMode && (
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center text-white p-1.5 rounded hover:opacity-90 transition-opacity"
            style={{ backgroundColor: shareState.status === "connected" ? "#2F7D4F" : "#4B5259" }}
            title={shareState.status === "connected"
              ? `Gemeinsame Datei verbunden: ${shareState.name}${shareState.mode === "read" ? " (nur ansehen)" : ""}`
              : "Gemeinsame Datei einrichten (Teilen)"}
            aria-label="Gemeinsame Datei"
          >
            <FolderOpen size={14} />
          </button>
          )}
        </div>
      </div>

      {/* Hinweisleisten zur gemeinsamen Datei */}
      {shareState.status === "needs-permission" && (
        <div className="no-print px-4 py-2 flex items-center gap-3 text-xs font-bold" style={{ backgroundColor: "#FCEFD9", color: "#B8791F" }}>
          <span>Gemeinsame Datei „{shareState.name}" ist nach dem Browser-Neustart getrennt.</span>
          <button onClick={reconnectShared} className="px-2.5 py-1 rounded text-white" style={{ backgroundColor: "#B8791F" }}>
            Jetzt verbinden
          </button>
        </div>
      )}
      {shareState.status === "connected" && shareState.mode === "read" && (
        <div className="no-print px-4 py-2 flex flex-wrap items-center gap-3 text-xs font-bold" style={{ backgroundColor: "#E5F0F8", color: "#2F6690" }}>
          <span>
            Nur ansehen – für „{shareState.name}" bestehen keine Schreibrechte. Angezeigt wird der gemeinsame Stand; eigene Änderungen werden nicht gespeichert.
            {sharedFile.getLastWriteError() && (
              <span className="block font-normal" style={{ color: "#5B87AB" }}>Technischer Grund: {sharedFile.getLastWriteError()}</span>
            )}
          </span>
          <button
            onClick={async () => {
              try {
                const st = await sharedFile.retryWrite();
                setShareState(st);
                setErr(st.mode === "read"
                  ? `Schreibzugriff weiterhin nicht möglich (${sharedFile.getLastWriteError() || "unbekannter Grund"}). Prüfen: Datei schreibgeschützt (Explorer → Eigenschaften)? Gerade in einem anderen Programm geöffnet? Ordner ohne Schreibrechte? Ordner von OneDrive/Defender geschützt?`
                  : null);
              } catch (e2) {
                setErr("Gemeinsame Datei: " + (e2 && e2.message ? e2.message : "Erneuter Versuch fehlgeschlagen."));
              }
            }}
            className="px-2.5 py-1 rounded text-white"
            style={{ backgroundColor: "#2F6690" }}
          >
            Schreibzugriff erneut versuchen
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="px-2.5 py-1 rounded border"
            style={{ borderColor: "#2F6690", color: "#2F6690", backgroundColor: "white" }}
          >
            Andere Datei wählen …
          </button>
        </div>
      )}
      {shareErr && (
        <div className="no-print px-4 py-2 text-xs font-bold" style={{ backgroundColor: "#FBE9E7", color: "#B23A34" }}>
          ⚠ {shareErr}
        </div>
      )}

      {/* Filter + Legende + Stats */}
      {view !== "PLAN" && view !== "COCKPIT" && (
        <div className="no-print px-4 py-3 flex flex-wrap items-center gap-4 border-b bg-white" style={{ borderColor: "#D6D9DC" }}>
          {(view === "MONAT" || view === "JAHR") && (
            <div className="flex rounded overflow-hidden border" style={{ borderColor: "#D6D9DC" }}>
              {[["MONAT", "Monat"], ["JAHR", "Jahr"]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${view === v ? "text-white" : "bg-white text-slate-600"}`}
                  style={view === v ? { backgroundColor: "#C97A2B" } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex rounded overflow-hidden border" style={{ borderColor: "#D6D9DC" }}>
            {["ALL", "TPM", "RI"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${filter === f ? "text-white" : "bg-white text-slate-600"}`}
                style={filter === f ? { backgroundColor: f === "ALL" ? "#22262B" : CATS[f].color } : {}}
              >
                {f === "ALL" ? "Alle" : CATS[f].label}
              </button>
            ))}
          </div>

        </div>
      )}

      {err && <div className="no-print mx-4 mt-2 text-xs text-red-600">{err}</div>}

      {/* Titel nur für den Ausdruck */}
      <div className="print-only text-center py-2">
        <div className="font-black text-2xl uppercase tracking-tight">{printPrefix}</div>
        <div className="font-mono text-sm">{printSuffix}</div>
        {view !== "PLAN" && <div className="font-mono text-xs mt-1">{doneCount} erledigt · {openCount} offen{donePercent !== null ? ` · ${donePercent} %` : ""}</div>}
      </div>

      {/* Cockpit: Übersicht (Kennzahlen + Tagesliste + Pinnwand) */}
      {view === "COCKPIT" && cockpitTab === "UEBERSICHT" && (
        <div className="no-print max-w-7xl mx-auto px-4 mt-4">
          {/* Kennzahlen-Kacheln */}
          <div className="grid gap-2.5 mb-4" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
            {[
              [heutePlan.length, "Heute fällig", "#22262B"],
              [heuteErledigtCount, "Heute erledigt", "#2F7D4F"],
              [ueberfaellige.length, "Überfällig", ueberfaellige.length > 0 ? "#B23A34" : "#2F7D4F"],
              [todayPlanResult.assignments.length, "Diesen Monat geplant", "#22262B"],
              [quoteMonatHeute !== null ? quoteMonatHeute + " %" : "–", "Quote " + MONTHS[today.getMonth()], "#2F7D4F"],
              [quoteJahrHeute !== null ? quoteJahrHeute + " %" : "–", "Quote " + today.getFullYear(), "#2F7D4F"],
            ].map(([num, label, color]) => (
              <div key={label} className="rounded-xl px-3.5 py-3" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
                <div className="font-mono font-extrabold" style={{ fontSize: "1.4rem", color }}>{num}</div>
                <div className="text-xs font-bold uppercase mt-0.5" style={{ color: "#8A9099", fontSize: "0.68rem" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Heute da: zeigt nur die gerade LAUFENDE Schicht (Früh 06-14, Spät 14-22, Nacht 22-06) */}
          {team.length > 0 && (() => {
            const { aktuell, SCHICHT_INFO, jetztCrew, spalten } = jetztInDerWerkstatt;
            const chip = (s) => (
              <span className="inline-flex items-center justify-center rounded font-black text-white" style={{ minWidth: "22px", height: "18px", padding: "0 5px", fontSize: "0.6rem", backgroundColor: SCHICHTEN[s].color, flexShrink: 0 }} title={s}>{SCHICHTEN[s].kurz}</span>
            );
            return (
              <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#22262B" }}>👷 Heute da</span>
                  <span className="font-mono text-xs" style={{ color: "#8A9099" }}>({SCHICHT_INFO[aktuell].zeit}) <strong style={{ color: "#22262B" }}>{jetztCrew.length} in der Werkstatt</strong></span>
                  <button onClick={() => setCockpitTab("SCHICHTPLAN")} className="ml-auto text-xs font-bold" style={{ color: "#C97A2B" }}>➜ Schichtplan</button>
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  {spalten.map(([typ, titel, liste]) => (
                    <div key={typ}>
                      <div className="text-xs font-bold uppercase mb-1.5" style={{ color: typ === aktuell ? "#C97A2B" : "#8A9099", fontSize: "0.62rem" }}>
                        {titel}
                      </div>
                      {liste.length === 0 ? (
                        <div className="text-xs" style={{ color: "#C3C7CB" }}>–</div>
                      ) : (
                        liste.map((x) => (
                          <div key={x.name} className="flex items-center gap-1.5 mb-1" style={{ fontSize: "0.76rem", fontWeight: 700, color: typ === aktuell ? "#22262B" : "#8A9099" }}>
                            {chip(x.schicht)}{x.name}
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="grid gap-4" style={{ gridTemplateColumns: "1.05fr 1fr" }}>
            {/* Tagesliste */}
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wide mb-2" style={{ color: "#22262B" }}>
                Heute · {today.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}
              </div>
              {heutePlan.length === 0 && (
                <div className="text-xs italic text-slate-400 mb-3">Heute steht laut Plan nichts an.</div>
              )}
              {heutePlan.map((p) => {
                const st = statusFuerPlanPunkt(p);
                const kat = riItems.some((r) => r.name === p.anlage) ? "RI" : "TPM";
                return (
                  <button
                    key={p.anlage}
                    onClick={() => openPlanEntry(p)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg mb-1.5 text-left"
                    style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}
                  >
                    <span
                      className="flex items-center justify-center rounded font-black text-white"
                      style={{ width: "20px", height: "20px", fontSize: "0.7rem", backgroundColor: st === "done" ? "#2F7D4F" : "transparent", border: st === "done" ? "none" : "2px solid #C3C7CB" }}
                    >
                      {st === "done" ? "✓" : ""}
                    </span>
                    <span className="text-xs font-bold uppercase" style={{ color: CATS[kat].color }}>{CATS[kat].label}</span>
                    <strong className="text-sm flex-1" style={{ textDecoration: st === "done" ? "line-through" : "none", color: st === "done" ? "#8A9099" : "#22262B" }}>{p.anlage}</strong>
                  </button>
                );
              })}

              {ueberfaellige.length > 0 && (
                <>
                  <div className="text-xs font-extrabold uppercase tracking-wide mt-4 mb-2" style={{ color: "#B23A34" }}>Liegengeblieben ({ueberfaellige.length})</div>
                  {ueberfaellige.slice(0, 8).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => openEditModal(e)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg mb-1.5 text-left"
                      style={{ backgroundColor: "#FDF6F5", border: "1px solid #E8B4AE" }}
                    >
                      <span className="rounded" style={{ width: "20px", height: "20px", border: "2px solid #C3C7CB", backgroundColor: "white" }} />
                      <span className="text-xs font-bold uppercase" style={{ color: CATS[e.category].color }}>{CATS[e.category].label}</span>
                      <strong className="text-sm flex-1">{e.name}</strong>
                      <span className="font-mono text-xs" style={{ color: "#B23A34" }}>{formatDateDE(e.date)}</span>
                    </button>
                  ))}
                  {ueberfaellige.length > 8 && <div className="text-xs text-slate-400">… und {ueberfaellige.length - 8} weitere (siehe TPM → Auswertung)</div>}
                </>
              )}
            </div>

            {/* Pinnwand */}
            <div>
              <div className="flex items-center mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#22262B" }}>📌 Pinnwand</span>
                <button
                  onClick={() => setZettelOpen(!zettelOpen)}
                  className="ml-auto flex items-center justify-center rounded text-white font-black"
                  style={{ backgroundColor: "#22262B", width: "26px", height: "26px", fontSize: "1rem", lineHeight: 1 }}
                  title="Neue Notiz anpinnen"
                  aria-label="Neue Notiz anpinnen"
                >
                  +
                </button>
              </div>

              {zettelOpen && (
                <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
                  <textarea
                    autoFocus
                    spellCheck
                    lang="de"
                    value={zettelText}
                    onChange={(e) => setZettelText(e.target.value)}
                    placeholder="Was sollen die anderen wissen? (z. B. Ersatzteil kommt Do. früh)"
                    rows={3}
                    className="w-full text-sm border rounded px-3 py-2 mb-2"
                    style={{ borderColor: "#D6D9DC", resize: "vertical" }}
                  />
                  <div className="flex gap-2">
                    <input
                      value={zettelName}
                      onChange={(e) => setZettelName(e.target.value)}
                      placeholder="Dein Name/Kürzel"
                      className="text-sm border rounded px-3 py-1.5"
                      style={{ borderColor: "#D6D9DC", width: "160px" }}
                    />
                    <button
                      onClick={addZettel}
                      disabled={!zettelText.trim() || !zettelName.trim()}
                      className="text-sm font-bold px-4 py-1.5 rounded text-white disabled:opacity-40"
                      style={{ backgroundColor: "#2F7D4F" }}
                    >
                      Anpinnen
                    </button>
                    <button onClick={() => setZettelOpen(false)} className="text-sm px-3 py-1.5 rounded bg-slate-100 text-slate-500">Abbrechen</button>
                  </div>
                </div>
              )}

              {zettelListe.length === 0 && !zettelOpen && (
                <div className="text-xs italic text-slate-400">Noch keine Notizen. Über das + hinterlässt du eine Notiz für alle – z. B. für die Übergabe an deinen Vertreter.</div>
              )}
              <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {zettelListe.map((z) => (
                  <div key={z.id} className="relative p-3" style={{ backgroundColor: ZETTEL_FARBEN[z.farbe] || ZETTEL_FARBEN.gelb, borderRadius: "4px 4px 12px 4px", boxShadow: "2px 3px 8px rgba(20,22,25,0.12)" }}>
                    <div className="text-sm" style={{ color: "#39414B", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{z.note}</div>
                    <div className="text-right mt-1.5" style={{ fontSize: "0.62rem", color: "#8A9099" }}>
                      {z.name} · {z.zeit ? new Date(z.zeit).toLocaleDateString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : formatDateDE(z.date)}
                    </div>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      <button
                        onClick={() => zettelZuArbeit(z)}
                        className="font-extrabold uppercase rounded text-white"
                        style={{ fontSize: "0.6rem", padding: "3px 8px", backgroundColor: "#22262B" }}
                      >
                        ➜ Zur Arbeit machen
                      </button>
                      <button
                        onClick={() => toggleZettelMonitor(z.id)}
                        className="font-extrabold uppercase rounded"
                        style={z.monitor
                          ? { fontSize: "0.6rem", padding: "3px 8px", backgroundColor: "#22262B", color: "white" }
                          : { fontSize: "0.6rem", padding: "3px 8px", backgroundColor: "rgba(0,0,0,0.07)", color: "#5B6572" }}
                        title="Auf dem Werkstatt-Monitor im Laufband anzeigen"
                      >
                        📺 {z.monitor ? "Im Monitor" : "In Monitor anzeigen"}
                      </button>
                      <button
                        onClick={() => deleteZettel(z.id)}
                        className="font-extrabold uppercase rounded"
                        style={{ fontSize: "0.6rem", padding: "3px 8px", backgroundColor: "rgba(0,0,0,0.07)", color: "#5B6572" }}
                        title="Zettel entfernen"
                      >
                        × Zettel entfernen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tages-Kalender (nur Monatsansicht, nur zur Eingabe, nicht im Druck) */}
      {view === "MONAT" && (
        <div className="no-print print-bg cal-card p-5 max-w-7xl mx-auto rounded-xl mt-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7", boxShadow: "0 2px 8px rgba(20,22,25,0.06)" }}>
          <div className="flex gap-1.5 mb-1.5">
            <div style={{ width: "30px", flexShrink: 0 }} />
            <div className="grid grid-cols-7 gap-1.5 flex-1">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className="text-center text-xs font-bold uppercase font-mono py-1" style={{ color: i >= 5 ? "#6D93B8" : "#64748b" }}>{w}</div>
              ))}
            </div>
          </div>
          {chunkIntoWeeks(cells).map((week, wi) => (
            <div key={wi} className="flex gap-1.5 mb-1.5">
              <div className="flex items-start justify-center pt-1.5" style={{ width: "30px", flexShrink: 0 }}>
                <span className="font-mono text-xs font-bold" style={{ color: "#B7BEC6" }}>{weekLabel(week, year, month)}</span>
              </div>
              <div className="grid grid-cols-7 gap-1.5 flex-1">
                {week.map((d, di) => {
                  if (d === null) return <div key={`blank-${wi}-${di}`} />;
                  const key = dateKey(year, month, d);
                  const dayEntries = entriesForDay(key);
                  const isToday = key === todayKey;
                  const holName = holidays.get(key);
                  const weekend = isWeekend(year, month, d);
                  return (
                    <div
                      key={key}
                      className="relative border rounded-md p-1.5 flex flex-col gap-1"
                      style={{
                        minHeight: "132px",
                        backgroundColor: holName ? "#FBE9E7" : weekend ? "#E5F0F8" : "white",
                        borderColor: isToday ? "#C97A2B" : holName ? "#E8B4AE" : weekend ? "#C8DDEE" : "#E2E4E7",
                        borderWidth: isToday ? "2px" : "1px",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs" style={{ color: holName ? "#B23A34" : weekend ? "#5B87AB" : "#5B6572", fontWeight: holName ? 700 : 400 }}>{d}</span>
                        <button onClick={() => openAddModal(key)} className="text-slate-400 hover:text-slate-700 p-0.5" aria-label="Eintrag hinzufügen">
                          <Plus size={15} />
                        </button>
                      </div>
                      {holName && (
                        <div style={{ fontSize: "9px", fontWeight: 700, color: "#B23A34", marginTop: "-4px" }}>{holName}</div>
                      )}

                      <div className="flex flex-col gap-1" style={{ maxHeight: "108px", overflowY: "auto", overflowX: "hidden" }}>
                        {dayEntries.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => openEditModal(e)}
                            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-bold leading-tight text-left w-full"
                            style={{
                              backgroundColor: e.status === "done" ? "#E5F3EA" : "#FBE9E7",
                              color: e.status === "done" ? "#2F7D4F" : "#B23A34",
                              border: `1px solid ${e.status === "done" ? "#2F7D4F" : "#B23A34"}`,
                            }}
                          >
                            <span className="uppercase" style={{ color: CATS[e.category].color }}>{CATS[e.category].label}</span>
                            <span className="truncate flex-1">{e.name}</span>
                            {e.note && e.note.trim() && <StickyNote size={11} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {legendeKlein}
        </div>
      )}

      {/* Cockpit: Backlog (Arbeiten aus dem Arbeitsbuch) */}
      {view === "COCKPIT" && cockpitTab === "BACKLOG" && (
        <div className="no-print max-w-7xl mx-auto px-4 mt-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {[["ALLE", `Alle (${arbeitenOffen.length})`], ["mech", `Mechanisch (${blZaehl("mech")})`], ["elek", `Elektrisch (${blZaehl("elek")})`]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setBlArt(v)}
                className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide border ${blArt === v ? "text-white" : "bg-white text-slate-600"}`}
                style={blArt === v ? { backgroundColor: v === "mech" ? "#3D8B8B" : v === "elek" ? "#7C5CBF" : "#22262B", borderColor: "transparent" } : { borderColor: "#D6D9DC" }}
              >
                {label}
              </button>
            ))}
            <span style={{ width: "6px" }} />
            <select
              value={blPrio}
              onChange={(e) => setBlPrio(e.target.value)}
              className="text-xs font-bold uppercase border rounded px-2 py-1.5 bg-white"
              style={{ borderColor: blPrio === "ALLE" ? "#D6D9DC" : "#22262B", color: blPrio === "ALLE" ? "#5B6572" : "#22262B" }}
              title="Nach Priorität filtern"
            >
              <option value="ALLE">Prio: alle</option>
              <option value="hoch">Prio 1</option>
              <option value="mittel">Prio 2</option>
              <option value="niedrig">Prio 3</option>
              <option value="ohne">ohne Prio</option>
            </select>
            <select
              value={blWer}
              onChange={(e) => setBlWer(e.target.value)}
              className="text-xs font-bold uppercase border rounded px-2 py-1.5 bg-white"
              style={{ borderColor: blWer === "ALLE" ? "#D6D9DC" : "#22262B", color: blWer === "ALLE" ? "#5B6572" : "#22262B" }}
              title="Nach Person filtern"
            >
              <option value="ALLE">Person: alle</option>
              <option value="NIEMAND">– nicht zugewiesen –</option>
              {team.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
            <select
              value={blAnlage}
              onChange={(e) => setBlAnlage(e.target.value)}
              className="text-xs font-bold uppercase border rounded px-2 py-1.5 bg-white"
              style={{ borderColor: blAnlage === "ALLE" ? "#D6D9DC" : "#22262B", color: blAnlage === "ALLE" ? "#5B6572" : "#22262B", maxWidth: "190px" }}
              title="Nach Anlage/Bereich filtern"
            >
              <option value="ALLE">Anlage: alle</option>
              {blAnlagenOptionen.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            {[[blAzubi, setBlAzubi, "🎓 Azubi"], [blStillstand, setBlStillstand, "⛔ Stillstand"], [blErledigte, setBlErledigte, "Erledigte"]].map(([wert, setter, label]) => (
              <button
                key={label}
                onClick={() => setter(!wert)}
                className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide border ${wert ? "text-white" : "bg-white text-slate-600"}`}
                style={wert ? { backgroundColor: "#22262B", borderColor: "transparent" } : { borderColor: "#D6D9DC" }}
              >
                {label}
              </button>
            ))}
            <input
              type="search"
              value={blSuche}
              onChange={(e) => setBlSuche(e.target.value)}
              placeholder="🔍 Suche: Anlage, Arbeit …"
              className="text-sm border rounded px-3 py-1.5"
              style={{ borderColor: "#D6D9DC", minWidth: "220px" }}
            />
            <button
              onClick={openArbeitNeu}
              className="ml-auto text-xs font-bold uppercase tracking-wide text-white px-3.5 py-2 rounded"
              style={{ backgroundColor: "#22262B" }}
            >
              + Neue Arbeit
            </button>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #22262B" }}>
                    <th style={{ width: "40px", padding: "8px 10px" }} title="Priorität">Prio</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", width: "160px" }}>Anlage / Bereich</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Arbeit</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", width: "90px" }}>Art</th>
                    <th style={{ padding: "8px 6px", width: "72px" }} title="Azubi-geeignet / nur bei Stillstand">🎓⛔</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", width: "110px" }}>Wer</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", width: "100px" }}>{blErledigte ? "Erledigt am" : "Gemeldet"}</th>
                  </tr>
                </thead>
                <tbody>
                  {backlogListe.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-slate-400 italic" style={{ padding: "24px" }}>Keine Arbeiten gefunden.</td></tr>
                  )}
                  {backlogListe.map((a) => {
                    const prio = ARBEIT_PRIO[a.prio ?? "ohne"] || ARBEIT_PRIO.ohne;
                    const art = ARBEIT_ART[a.art ?? ""] || ARBEIT_ART[""];
                    return (
                      <tr
                        key={a.id}
                        onClick={() => openArbeitEdit(a)}
                        style={{ borderBottom: "1px solid #E2E4E7", cursor: "pointer", opacity: a.status === "done" ? 0.6 : 1 }}
                        title="Klicken zum Bearbeiten"
                      >
                        <td style={{ textAlign: "center" }}>
                          <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "50%", backgroundColor: prio.color }} title={prio.label} />
                        </td>
                        <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                          <button
                            onClick={(ev) => { ev.stopPropagation(); setAkteAnlage(a.name); }}
                            className="font-bold hover:underline"
                            style={{ textDecorationStyle: "dotted", color: "#22262B" }}
                            title="Anlagen-Akte öffnen"
                          >
                            {a.name}
                          </button>
                        </td>
                        <td style={{ padding: "7px 10px" }}>{a.note}</td>
                        <td style={{ padding: "7px 10px" }}>
                          {a.art === "beide" ? (
                            <><span className="text-xs font-bold" style={{ color: ARBEIT_ART.mech.color }}>Mech</span> <span className="text-xs font-bold" style={{ color: ARBEIT_ART.elek.color }}>+ Elek</span></>
                          ) : (
                            <span className="text-xs font-bold" style={{ color: art.color }}>{art.kurz}</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center", fontSize: "0.85rem" }}>{a.azubi ? "🎓" : ""}{a.stillstand ? "⛔" : ""}</td>
                        <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                          {a.wer ? (
                            <span className="flex items-center gap-1.5">
                              <span className="inline-flex items-center justify-center rounded-full text-white font-extrabold" style={{ width: "20px", height: "20px", fontSize: "0.58rem", backgroundColor: personFarbe(a.wer) }}>{personKuerzel(a.wer)}</span>
                              <span style={{ fontSize: "0.72rem" }}>{a.wer}</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.72rem", color: "#C3C7CB" }}>–</span>
                          )}
                        </td>
                        <td className="font-mono" style={{ padding: "7px 10px", fontSize: "0.72rem", color: "#8A9099" }}>
                          {formatDateDE(blErledigte ? (a.erledigtAm || a.date) : a.date)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            {blErledigte
              ? `${backlogListe.length} erledigte Arbeiten (Archiv). Klick auf eine Zeile zum Ansehen oder Zurückholen.`
              : `${backlogListe.length} von ${arbeitenOffen.length} offenen Arbeiten angezeigt · Klick auf eine Zeile öffnet die Arbeit.`}
          </div>
        </div>
      )}

      {/* Cockpit: Arbeitsplanung (Wochenraster) */}
      {view === "COCKPIT" && cockpitTab === "PLANUNG" && (
        <div className="no-print max-w-7xl mx-auto px-4 mt-4">
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <button onClick={() => setPlanungCursor(addDays(planungMontag, -7))} className="px-2.5 py-1.5 rounded border bg-white" style={{ borderColor: "#D6D9DC" }} aria-label="Vorige Woche">‹</button>
            {/* KW-Leiste: Wochen rund um die gewählte direkt anklickbar */}
            {[-2, -1, 0, 1, 2, 3, 4].map((off) => {
              const m = addDays(planungMontag, off * 7);
              const aktiv = off === 0;
              const heutig = isoWocheKey(m) === isoWocheKey(new Date());
              return (
                <button
                  key={off}
                  onClick={() => setPlanungCursor(m)}
                  className="px-2.5 py-1.5 rounded border font-mono text-xs font-bold"
                  style={aktiv
                    ? { backgroundColor: "#C97A2B", color: "white", borderColor: "#C97A2B" }
                    : { backgroundColor: "white", color: "#5B6572", borderColor: "#D6D9DC", outline: heutig ? "2px solid #C97A2B" : "none" }}
                  title={`${m.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${addDays(m, 6).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`}
                >
                  KW {getISOWeek(m)}
                </button>
              );
            })}
            <button onClick={() => setPlanungCursor(addDays(planungMontag, 7))} className="px-2.5 py-1.5 rounded border bg-white" style={{ borderColor: "#D6D9DC" }} aria-label="Nächste Woche">›</button>
            <button onClick={() => setPlanungCursor(new Date())} className="px-3 py-1.5 rounded border bg-white text-xs font-bold uppercase" style={{ borderColor: "#D6D9DC" }}>Heute</button>
            {/* Sprung zu jeder beliebigen Woche (z. B. Urlaub weit im Voraus eintragen) */}
            <select
              value=""
              onChange={(ev) => { if (ev.target.value) setPlanungCursor(new Date(ev.target.value + "T00:00:00")); }}
              className="px-2 py-1.5 rounded border bg-white text-xs font-bold"
              style={{ borderColor: "#D6D9DC", color: "#5B6572" }}
              aria-label="KW wählen"
            >
              <option value="">📅 KW wählen …</option>
              {Array.from({ length: 71 }, (_, i) => {
                const m = addDays(montagVon(dateKey(today.getFullYear(), today.getMonth(), today.getDate())), (i - 6) * 7);
                const v = dateKey(m.getFullYear(), m.getMonth(), m.getDate());
                return (
                  <option key={v} value={v}>
                    KW {getISOWeek(m)} · {m.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – {addDays(m, 6).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </option>
                );
              })}
            </select>
            <span className="font-mono text-sm font-bold ml-2">
              {planungMontag.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – {addDays(planungMontag, 6).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>

          {team.length === 0 ? (
            <div className="rounded-xl p-8 text-center text-sm text-slate-500" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
              Noch kein Team angelegt. Öffne den <strong>⚙-Verwalten-Dialog</strong> und trage unter „Team" deine Leute ein – danach kannst du hier Arbeiten auf Personen und Tage verteilen.
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "150px repeat(5, 1fr) 0.55fr 0.55fr", minWidth: "980px" }}>
                  {/* Kopfzeile */}
                  <div style={{ padding: "8px 10px", background: "#F7F8F9", borderBottom: "2px solid #22262B", fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", color: "#8A9099" }}>Mitarbeiter</div>
                  {planungTage.map((t) => {
                    const istHeute = t.key === todayKey;
                    const feiertag = getHolidays(t.datum.getFullYear()).get(t.key);
                    return (
                      <div key={t.key} style={{ padding: "8px 6px", textAlign: "center", background: istHeute ? "#FDF3E7" : t.we ? "#E5F0F8" : "#F7F8F9", borderBottom: "2px solid #22262B", fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", color: feiertag ? "#B23A34" : istHeute ? "#C97A2B" : t.we ? "#7FA6C4" : "#8A9099" }}>
                        {t.datum.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}{feiertag ? <div style={{ fontSize: "0.6rem" }}>{feiertag}</div> : null}
                      </div>
                    );
                  })}

                  {/* Feste Zeile: Wartungsplan */}
                  <div style={{ padding: "8px 10px", borderBottom: "1px solid #E2E4E7", background: "#FBF7F1", fontSize: "0.72rem", fontWeight: 800, color: "#C97A2B" }}>Wartungsplan<br /><span style={{ fontWeight: 400, color: "#8A9099" }}>TPM &amp; R+I (fest)</span></div>
                  {planungTage.map((t) => (
                    <div key={t.key} style={{ padding: "6px", borderBottom: "1px solid #E2E4E7", borderLeft: "1px solid #EDEEF0", background: t.we ? "#EFF5FA" : "#FFFDF9", minHeight: "56px" }}>
                      {wochenPlan.filter((p) => p.date === t.key).map((p, i) => {
                        const done = isPlanDone(p);
                        const c = done ? "#2F7D4F" : planGroupColor(p.anlage, tpmAnlagen, riItems);
                        return (
                          <button key={i} onClick={() => openPlanEntry(p)} className="block w-full text-left rounded font-bold mb-1" style={{ fontSize: "0.66rem", padding: "2px 6px", color: c, border: `1px solid ${c}`, backgroundColor: done ? "#E5F3EA" : `${c}18` }}>
                            {done ? "✓ " : ""}{p.anlage}
                          </button>
                        );
                      })}
                    </div>
                  ))}

                  {/* Eine Zeile pro Person; ohne Gewerk gesammelt unter "Sonstige" (zugeklappt) */}
                  {(() => {
                    const haupt = [...team]
                      .filter((t) => (t.rolle || "") !== "")
                      .sort((a, b) => ({ mech: 0, elek: 1, azubi: 2 }[a.rolle] - { mech: 0, elek: 1, azubi: 2 }[b.rolle]));
                    const sonstige = team.filter((t) => (t.rolle || "") === "");
                    const zeile = (mitglied) => {
                    const person = mitglied.name;
                    const rolle = TEAM_ROLLEN[mitglied.rolle || ""];
                    return (
                    <React.Fragment key={person}>
                      <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.25)", background: rolle.color, display: "flex", flexDirection: "column", justifyContent: "center" }} title={rolle.label}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "white", lineHeight: 1.15 }}>{person}</span>
                        <span style={{ fontSize: "0.56rem", fontWeight: 600, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{rolle.label}</span>
                      </div>
                      {planungTage.map((t) => {
                        const schicht = schichtFuer(person, t.key);
                        const abwesend = schicht && SCHICHT_ABWESEND.has(schicht);
                        return (
                        <div key={t.key} style={{ padding: "6px", borderBottom: "1px solid #E2E4E7", borderLeft: "1px solid #EDEEF0", background: t.we ? "#EFF5FA" : t.key === todayKey ? "#FFFDF9" : "white", minHeight: "56px", position: "relative" }}>
                          {/* Schicht (Werkstattschichtplan) als Kürzel: Klick = ändern */}
                          <button
                            onClick={() => { setSchichtGanzeWoche(!schicht && !t.we); setSchichtPicker({ person, datum: t.key }); }}
                            className="inline-flex items-center justify-center rounded font-black mb-1"
                            style={schicht
                              ? { minWidth: "22px", height: "18px", padding: "0 5px", fontSize: "0.6rem", color: "white", backgroundColor: SCHICHTEN[schicht].color }
                              : { minWidth: "22px", height: "18px", padding: "0 5px", fontSize: "0.6rem", color: "#C3C7CB", backgroundColor: "transparent", border: "1px dashed #D6D9DC" }}
                            title={schicht ? `${schicht} – Schicht für ${person} ändern` : `Schicht für ${person} setzen`}
                            aria-label={`Schicht ${person} ${t.key}`}
                          >
                            {schicht ? SCHICHTEN[schicht].kurz : "?"}
                          </button>
                          {geplantFuer(person, t.key).map((a) => {
                            const c = a.art === "elek" ? ARBEIT_ART.elek.color : ARBEIT_ART.mech.color;
                            return (
                              <button key={a.id} onClick={() => openArbeitEdit(a)} className="block w-full text-left rounded font-bold mb-1" style={{ fontSize: "0.66rem", padding: "2px 6px", color: c, border: `1px solid ${c}`, backgroundColor: `${c}14`, wordBreak: "break-word" }} title={a.note}>
                                {a.name}: {a.note.length > 34 ? a.note.slice(0, 34) + "…" : a.note}
                              </button>
                            );
                          })}
                          {/* Freie Notizen/Infos (gelb) */}
                          {notizenFuer(person, t.key).map((n) => (
                            <button key={n.id} onClick={() => setPlanNotiz({ person, datum: t.key, id: n.id, text: n.note })} className="block w-full text-left rounded font-semibold mb-1" style={{ fontSize: "0.66rem", padding: "2px 6px", color: "#39414B", border: "1px solid #E5D77A", backgroundColor: "#FEF9C3", wordBreak: "break-word" }} title={n.note}>
                              📝 {n.note.length > 34 ? n.note.slice(0, 34) + "…" : n.note}
                            </button>
                          ))}
                          {!abwesend && (
                            <button
                              onClick={() => setPlanungPicker({ person, datum: t.key })}
                              className="text-slate-300 hover:text-slate-600 font-black"
                              style={{ fontSize: "0.85rem", lineHeight: 1 }}
                              title={`Arbeit oder Notiz für ${person} an diesem Tag eintragen`}
                              aria-label="Arbeit oder Notiz eintragen"
                            >
                              ＋
                            </button>
                          )}
                        </div>
                        );
                      })}
                    </React.Fragment>
                    );
                    };
                    return (
                      <>
                        {haupt.map(zeile)}
                        {sonstige.length > 0 && (
                          <button
                            onClick={() => setSonstigeOffen((o) => !o)}
                            className="text-left"
                            style={{ gridColumn: "1 / -1", padding: "8px 10px", borderBottom: "1px solid #E2E4E7", background: "#F0F1F3", fontSize: "0.72rem", fontWeight: 800, color: "#5B6572" }}
                            aria-label="Sonstige auf- oder zuklappen"
                          >
                            {sonstigeOffen ? "▾" : "▸"} Sonstige ({sonstige.length}) <span style={{ fontWeight: 400, color: "#8A9099" }}>– ohne Gewerk · zum {sonstigeOffen ? "Zuklappen" : "Aufklappen"} klicken</span>
                          </button>
                        )}
                        {sonstigeOffen && sonstige.map(zeile)}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Schicht-Legende (Kürzel) */}
          {team.length > 0 && (
            <div className="mt-3 flex items-center gap-x-3 gap-y-1 flex-wrap">
              {Object.entries(SCHICHTEN).map(([name, s]) => (
                <span key={name} className="inline-flex items-center gap-1" style={{ fontSize: "0.66rem", fontWeight: 700, color: "#5B6572" }}>
                  <span className="inline-flex items-center justify-center rounded font-black text-white" style={{ minWidth: "22px", height: "18px", padding: "0 5px", fontSize: "0.6rem", backgroundColor: s.color }}>{s.kurz}</span>
                  {name}
                </span>
              ))}
              <span className="text-xs text-slate-400">· Klick auf das Kürzel in einer Zelle ändert die Schicht (Tag oder ganze Woche)</span>
            </div>
          )}

          {/* Noch nicht eingeplante offene Arbeiten */}
          {team.length > 0 && (
            <div className="mt-2 text-xs text-slate-400">
              {(() => {
                const unverplant = arbeitenOffen.filter((a) => !a.geplant);
                return `${unverplant.length} offene Arbeiten sind noch keinem Tag zugeordnet – über ＋ in einer Zelle oder im Backlog (Feld „geplant für") einplanen.`;
              })()}
            </div>
          )}
        </div>
      )}

      {/* Cockpit: Schichtplan-Matrix - Monat wie das Excel-Blatt "Daten", nur zum Schichten eintragen */}
      {view === "COCKPIT" && cockpitTab === "SCHICHTPLAN" && (() => {
        const my = matrixCursor.getFullYear();
        const mm = matrixCursor.getMonth();
        const tageImMonat = new Date(my, mm + 1, 0).getDate();
        const feiertage = getHolidays(my);
        const tage = Array.from({ length: tageImMonat }, (_, i) => {
          const d = new Date(my, mm, i + 1);
          return { nr: i + 1, key: dateKey(my, mm, i + 1), dow: d.getDay(), kw: getISOWeek(d) };
        });
        const kwSegmente = [];
        tage.forEach((t) => {
          const letzte = kwSegmente[kwSegmente.length - 1];
          if (letzte && letzte.kw === t.kw) letzte.span++;
          else kwSegmente.push({ kw: t.kw, span: 1 });
        });
        const zellBreite = "66px";
        return (
          <div className="no-print max-w-7xl mx-auto px-4 mt-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <button onClick={() => setMatrixCursor(new Date(my, mm - 1, 1))} className="px-2.5 py-1.5 rounded border bg-white" style={{ borderColor: "#D6D9DC" }} aria-label="Voriger Monat">‹</button>
              <button onClick={() => setMatrixCursor(new Date())} className="px-3 py-1.5 rounded border bg-white text-xs font-bold uppercase" style={{ borderColor: "#D6D9DC" }}>Heute</button>
              <button onClick={() => setMatrixCursor(new Date(my, mm + 1, 1))} className="px-2.5 py-1.5 rounded border bg-white" style={{ borderColor: "#D6D9DC" }} aria-label="Nächster Monat">›</button>
              <span className="font-mono text-sm font-bold ml-2">{MONTHS[mm]} {my}</span>
              <span className="ml-auto text-xs text-slate-400">Werkstattschichtplan – Klick auf eine Zelle öffnet die Auswahl · gilt sofort auch in der Planung</span>
            </div>

            {team.length === 0 ? (
              <div className="rounded-xl p-8 text-center text-sm text-slate-500" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
                Noch kein Team angelegt. Öffne den <strong>⚙-Verwalten-Dialog</strong> und trage unter „Team" deine Leute ein.
              </div>
            ) : (
              <div className="rounded-xl" style={{ backgroundColor: "white", border: "1px solid #E2E4E7", overflowX: "auto", padding: "4px" }}>
                <table style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1px solid #E2E4E7", background: "#F7F8F9", fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", color: "#8A9099", padding: "3px 8px", textAlign: "left", position: "sticky", left: 0, zIndex: 2 }}>KW</th>
                      {kwSegmente.map((s, i) => (
                        <th key={i} colSpan={s.span} style={{ border: "1px solid #E2E4E7", background: "#F7F8F9", fontSize: "0.6rem", fontWeight: 800, color: "#8A9099", padding: "3px 2px" }}>KW {s.kw}</th>
                      ))}
                    </tr>
                    <tr>
                      <th style={{ border: "1px solid #E2E4E7", background: "#F7F8F9", fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", color: "#8A9099", padding: "3px 8px", textAlign: "left", position: "sticky", left: 0, zIndex: 2 }}>Mitarbeiter</th>
                      {tage.map((t) => {
                        const we = t.dow === 0 || t.dow === 6;
                        const ft = feiertage.get(t.key);
                        const heutig = t.key === todayKey;
                        return (
                          <th key={t.key} title={ft || undefined} style={{ border: "1px solid #E2E4E7", minWidth: zellBreite, background: ft ? "#FBE9E7" : heutig ? "#FDF3E7" : we ? "#E5F0F8" : "#F7F8F9", fontSize: "0.58rem", fontWeight: 800, color: ft ? "#B23A34" : heutig ? "#C97A2B" : we ? "#7FA6C4" : "#8A9099", padding: "3px 2px" }}>
                            {WEEKDAYS[(t.dow + 6) % 7]}<br />{t.nr}.
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((mitglied) => {
                      const person = mitglied.name;
                      const rolle = TEAM_ROLLEN[mitglied.rolle || ""];
                      return (
                        <tr key={person}>
                          <td style={{ border: "1px solid #E2E4E7", background: "#F7F8F9", padding: "4px 8px", whiteSpace: "nowrap", position: "sticky", left: 0, zIndex: 1 }}>
                            <span className="inline-flex items-center justify-center rounded-full text-white font-extrabold mr-1.5" style={{ width: "18px", height: "18px", fontSize: "0.52rem", backgroundColor: rolle.color, verticalAlign: "middle" }} title={rolle.label}>{personKuerzel(person)}</span>
                            <span style={{ fontSize: "0.72rem", fontWeight: 700 }}>{person}</span>
                          </td>
                          {tage.map((t) => {
                            const we = t.dow === 0 || t.dow === 6;
                            const schicht = schichtFuer(person, t.key);
                            return (
                              <td key={t.key} style={{ border: "1px solid #E2E4E7", padding: 0, background: we ? "#EFF5FA" : t.key === todayKey ? "#FFFDF9" : "white" }}>
                                <button
                                  onClick={(ev) => {
                                    const r = ev.currentTarget.getBoundingClientRect();
                                    setMatrixPick({
                                      person,
                                      datum: t.key,
                                      links: Math.max(8, Math.min(r.left, window.innerWidth - 200)),
                                      oben: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 400)),
                                    });
                                  }}
                                  className="block w-full font-extrabold"
                                  style={schicht
                                    ? { minWidth: zellBreite, height: "26px", fontSize: "0.58rem", color: "white", backgroundColor: SCHICHTEN[schicht].color, whiteSpace: "nowrap", overflow: "hidden" }
                                    : { minWidth: zellBreite, height: "26px", fontSize: "0.7rem", color: "#D6D9DC", backgroundColor: "transparent" }}
                                  title={`${person} · ${formatDateDE(t.key)}${schicht ? " · " + schicht : ""}`}
                                  aria-label={`Matrix ${person} ${t.key}`}
                                >
                                  {schicht || "·"}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {team.length > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {Object.entries(SCHICHTEN).map(([name, s]) => (
                  <span key={name} className="rounded font-black uppercase" style={{ fontSize: "0.6rem", letterSpacing: "0.03em", padding: "2px 7px", color: "white", backgroundColor: s.color }}>{name}</span>
                ))}
                <span className="text-xs text-slate-400">· Reihenfolge der Leute änderst du im ⚙-Verwalten-Dialog (↑/↓) · ganze Wochen setzt du am schnellsten in der Planung</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Zellen-Dropdown der Schichtplan-Matrix */}
      {matrixPick && (
        <div className="no-print" style={{ position: "fixed", inset: 0, zIndex: 70 }} onClick={() => setMatrixPick(null)}>
          <div
            style={{ position: "fixed", left: matrixPick.links, top: matrixPick.oben, backgroundColor: "white", borderRadius: "8px", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", padding: "6px", width: "190px", zIndex: 71 }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="text-xs font-bold px-1 pb-1" style={{ color: "#8A9099" }}>{matrixPick.person} · {formatDateDE(matrixPick.datum)}</div>
            {Object.entries(SCHICHTEN).map(([name, s]) => (
              <button
                key={name}
                onClick={() => { setzeSchicht(matrixPick.person, matrixPick.datum, name, false); setMatrixPick(null); }}
                className="block w-full text-left rounded font-bold text-white mb-0.5"
                style={{ fontSize: "0.7rem", padding: "4px 8px", backgroundColor: s.color }}
              >
                {name}
              </button>
            ))}
            <button
              onClick={() => { setzeSchicht(matrixPick.person, matrixPick.datum, "-", false); setMatrixPick(null); }}
              className="block w-full text-left rounded font-bold border"
              style={{ fontSize: "0.7rem", padding: "4px 8px", backgroundColor: "white", color: "#5B6572", borderColor: "#D6D9DC" }}
            >
              – keine Schicht
            </button>
          </div>
        </div>
      )}

      {/* Einplanen-Auswahl: offene Arbeit für Person + Tag wählen */}
      {planungPicker && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => setPlanungPicker(null)}
        >
          <div
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "18px", width: "560px", maxWidth: "100%", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">
                Arbeit einplanen – {planungPicker.person}, {formatDateDE(planungPicker.datum)}
              </div>
              <button onClick={() => setPlanungPicker(null)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>
            <button
              onClick={() => { const p = planungPicker; setPlanungPicker(null); setPlanNotiz({ person: p.person, datum: p.datum, text: "" }); }}
              className="w-full text-left rounded px-2.5 py-2 border mb-3 font-semibold"
              style={{ borderColor: "#E5D77A", backgroundColor: "#FEF9C3", fontSize: "0.8rem", color: "#39414B" }}
            >
              📝 Stattdessen freie Notiz eintragen (Info, Termin, Hinweis – ohne Backlog)
            </button>
            {arbeitenOffen.length === 0 ? (
              <div className="text-sm italic text-slate-400 py-4">Keine offenen Arbeiten im Backlog.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {arbeitenOffen
                  .slice()
                  .sort((a, b) => (PRIO_REIHENFOLGE[a.prio ?? "ohne"] - PRIO_REIHENFOLGE[b.prio ?? "ohne"]) || a.name.localeCompare(b.name, "de"))
                  .map((a) => {
                    const prio = ARBEIT_PRIO[a.prio ?? "ohne"] || ARBEIT_PRIO.ohne;
                    const belegt = a.geplant && a.wer;
                    return (
                      <button
                        key={a.id}
                        onClick={() => einplanen(a.id, planungPicker.person, planungPicker.datum)}
                        className="flex items-center gap-2 text-left rounded px-2.5 py-1.5 border hover:bg-slate-50"
                        style={{ borderColor: "#E2E4E7", fontSize: "0.8rem" }}
                      >
                        <span style={{ display: "inline-block", width: "9px", height: "9px", borderRadius: "50%", backgroundColor: prio.color, flexShrink: 0 }} />
                        <strong style={{ whiteSpace: "nowrap" }}>{a.name}</strong>
                        <span className="flex-1" style={{ color: "#39414B" }}>{a.note.length > 60 ? a.note.slice(0, 60) + "…" : a.note}</span>
                        {belegt && <span className="font-mono" style={{ fontSize: "0.62rem", color: "#B8791F" }} title="bereits eingeplant - wird umgeplant">{a.wer} · {formatDateDE(a.geplant)}</span>}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schicht setzen (Werkstattschichtplan) */}
      {schichtPicker && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => setSchichtPicker(null)}
        >
          <div
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "18px", width: "440px", maxWidth: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">Schicht – {schichtPicker.person}</div>
              <button onClick={() => setSchichtPicker(null)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSchichtGanzeWoche(true)}
                className="flex-1 rounded px-2 py-2 text-xs font-bold uppercase border"
                style={schichtGanzeWoche ? { backgroundColor: "#22262B", color: "white", borderColor: "#22262B" } : { backgroundColor: "white", color: "#5B6572", borderColor: "#D6D9DC" }}
              >
                Ganze Woche (Mo–Fr)
              </button>
              <button
                onClick={() => setSchichtGanzeWoche(false)}
                className="flex-1 rounded px-2 py-2 text-xs font-bold uppercase border"
                style={!schichtGanzeWoche ? { backgroundColor: "#22262B", color: "white", borderColor: "#22262B" } : { backgroundColor: "white", color: "#5B6572", borderColor: "#D6D9DC" }}
              >
                Nur {formatDateDE(schichtPicker.datum)}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {Object.entries(SCHICHTEN).map(([name, s]) => (
                <button
                  key={name}
                  onClick={() => setzeSchicht(schichtPicker.person, schichtPicker.datum, name, schichtGanzeWoche)}
                  className="rounded px-2 py-2 text-xs font-black uppercase text-white"
                  style={{ backgroundColor: s.color, letterSpacing: "0.03em" }}
                >
                  {name}
                </button>
              ))}
              <button
                onClick={() => setzeSchicht(schichtPicker.person, schichtPicker.datum, "-", schichtGanzeWoche)}
                className="rounded px-2 py-2 text-xs font-black uppercase border"
                style={{ backgroundColor: "white", color: "#5B6572", borderColor: "#D6D9DC" }}
              >
                – keine Schicht
              </button>
            </div>
            <div className="mt-3 text-xs text-slate-400">
              „Ganze Woche" setzt Mo–Fr dieser KW und räumt Tages-Ausnahmen auf. „Nur Tag" ändert nur diesen einen Tag (z. B. Mittwoch Mainsite, Rest Früh).
            </div>
          </div>
        </div>
      )}

      {/* Freie Notiz in einer Planungszelle */}
      {planNotiz && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => setPlanNotiz(null)}
        >
          <div
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "18px", width: "440px", maxWidth: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">📝 Notiz – {planNotiz.person}, {formatDateDE(planNotiz.datum)}</div>
              <button onClick={() => setPlanNotiz(null)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>
            <textarea
              value={planNotiz.text}
              onChange={(ev) => setPlanNotiz({ ...planNotiz, text: ev.target.value })}
              rows={3}
              autoFocus
              spellCheck
              lang="de"
              placeholder="z. B. ab 8:30 Zahnarzt, kommt später …"
              className="w-full rounded border px-2.5 py-2 text-sm"
              style={{ borderColor: "#D6D9DC", backgroundColor: "#FEF9C3" }}
            />
            <div className="flex gap-2 mt-3">
              <button onClick={savePlanNotiz} className="flex-1 rounded px-3 py-2 text-sm font-bold text-white" style={{ backgroundColor: "#22262B" }}>Speichern</button>
              {planNotiz.id && (
                <button onClick={deletePlanNotiz} className="rounded px-3 py-2 text-sm font-bold" style={{ backgroundColor: "#FBE9E7", color: "#B23A34" }}>Löschen</button>
              )}
              <button onClick={() => setPlanNotiz(null)} className="rounded px-3 py-2 text-sm font-bold" style={{ backgroundColor: "#F4F5F6", color: "#8A9099" }}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Anlagen-Akte */}
      {akteAnlage && akteDaten && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => setAkteAnlage(null)}
        >
          <div
            style={{ backgroundColor: "white", borderRadius: "12px", padding: "20px 22px", width: "860px", maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 16px 50px rgba(0,0,0,0.35)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span style={{ fontSize: "1.15rem", fontWeight: 900 }}>{akteAnlage}</span>
              {akteDaten.tpmItem && <span className="b tpm text-xs font-bold uppercase px-2 py-0.5 rounded" style={{ backgroundColor: "#F7E8D8", color: "#C97A2B", border: "1px solid #C97A2B" }}>{planGroupLabel(akteAnlage, tpmAnlagen, riItems) || "TPM-Anlage"}</span>}
              <span className="font-mono text-xs" style={{ color: "#8A9099" }}>
                {akteDaten.quote !== null && <>TPM-Quote 12 Mon.: <strong style={{ color: "#2F7D4F" }}>{akteDaten.quote} %</strong> · </>}
                {akteDaten.naechste ? <>nächste Wartung: <strong>{formatDateDE(akteDaten.naechste.date)}</strong></> : null}
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  onClick={() => { const n = akteAnlage; setAkteAnlage(null); openArbeitNeu({ anlage: n }); }}
                  className="text-xs font-bold uppercase px-3 py-1.5 rounded text-white"
                  style={{ backgroundColor: "#22262B" }}
                >
                  + Arbeit melden
                </button>
                <button onClick={() => setAkteAnlage(null)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
              </span>
            </div>

            <button
              onClick={() => { setBlAnlage(akteAnlage); setBlErledigte(false); setBlArt("ALLE"); setBlPrio("ALLE"); setBlWer("ALLE"); setBlSuche(""); setAkteAnlage(null); setCockpitTab("BACKLOG"); setView("COCKPIT"); }}
              className="w-full flex items-center gap-3 rounded-lg px-3.5 py-2.5 mb-4 text-left"
              style={{ backgroundColor: "#FDF6F5", border: "1px solid #E8B4AE" }}
            >
              <span className="text-sm font-bold" style={{ color: "#B23A34" }}>{akteDaten.offene.length} offene {akteDaten.offene.length === 1 ? "Arbeit" : "Arbeiten"} zu dieser Anlage</span>
              <span className="ml-auto text-xs font-bold uppercase px-3 py-1.5 rounded text-white" style={{ backgroundColor: "#B23A34" }}>➜ Im Backlog anzeigen</span>
            </button>

            <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <div className="text-xs font-extrabold uppercase mb-1.5" style={{ color: "#2F7D4F" }}>Zuletzt erledigt</div>
                {akteDaten.erledigte.length === 0 && <div className="text-xs italic text-slate-400">Noch nichts erledigt.</div>}
                {akteDaten.erledigte.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs" style={{ backgroundColor: "#F7F8F9", marginBottom: "4px" }}>
                    <span className="font-mono" style={{ color: "#8A9099", minWidth: "58px" }}>{formatDateDE(a.erledigtAm || a.date)}</span>
                    <span className="flex-1">{a.note}</span>
                    <span style={{ color: "#2F7D4F", fontWeight: 700 }}>✓</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs font-extrabold uppercase mb-1.5" style={{ color: "#8A9099" }}>Wartungs-Historie (TPM &amp; R+I)</div>
                {akteDaten.historie.length === 0 && <div className="text-xs italic text-slate-400">Noch keine Wartungseinträge.</div>}
                {akteDaten.historie.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs" style={{ backgroundColor: "#F7F8F9", marginBottom: "4px" }}>
                    <span className="font-mono" style={{ color: "#8A9099", minWidth: "58px" }}>{formatDateDE(e.date)}</span>
                    <span className="font-bold uppercase" style={{ color: CATS[e.category].color, fontSize: "0.62rem" }}>{CATS[e.category].label}</span>
                    <span className="flex-1">{e.category === "TPM" ? "Wartung" : e.name}{e.note && e.note.trim() ? <span style={{ color: "#8A9099" }}> 📝 „{e.note}"</span> : null}</span>
                    <span style={{ color: e.status === "done" ? "#2F7D4F" : "#B23A34", fontWeight: 700 }}>{e.status === "done" ? "✓" : "✕"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Arbeit anlegen / bearbeiten */}
      {arbeitModal && aDraft && (() => {
        const live = arbeitModal.mode === "edit" ? entries.find((e) => e.id === arbeitModal.id) : null;
        if (arbeitModal.mode === "edit" && !live) return null;
        return (
          <div
            className="no-print"
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
            onClick={() => setArbeitModal(null)}
          >
            <div
              style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", width: "520px", maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="font-bold text-sm">
                  {arbeitModal.mode === "add" ? "Neue Arbeit" : "Arbeit bearbeiten"}
                  {arbeitModal.ausZettel && aDraft.melder && <span className="font-normal text-slate-400"> – aus Notiz von {aDraft.melder}</span>}
                </div>
                <button onClick={() => setArbeitModal(null)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <select
                    value={aDraft.anlage}
                    onChange={(ev) => setADraft({ ...aDraft, anlage: ev.target.value })}
                    className="flex-1 text-sm border rounded px-3 py-2"
                    style={{ borderColor: "#D6D9DC" }}
                  >
                    <option value="">– Anlage / Bereich wählen –</option>
                    {bereichOptionen.map((b) => <option key={b} value={b}>{b}</option>)}
                    <option value={OTHER_VALUE}>Neuer Bereich …</option>
                  </select>
                  {aDraft.anlage === OTHER_VALUE && (
                    <input
                      autoFocus
                      value={aDraft.anlageCustom}
                      onChange={(ev) => setADraft({ ...aDraft, anlageCustom: ev.target.value })}
                      placeholder="z. B. Halle 3"
                      className="flex-1 text-sm border rounded px-3 py-2"
                      style={{ borderColor: "#D6D9DC" }}
                    />
                  )}
                </div>

                <textarea
                  value={aDraft.note}
                  onChange={(ev) => setADraft({ ...aDraft, note: ev.target.value })}
                  placeholder="Was ist zu tun?"
                  rows={3}
                  spellCheck
                  lang="de"
                  className="text-sm border rounded px-3 py-2"
                  style={{ borderColor: "#D6D9DC", resize: "vertical" }}
                />

                <div className="flex gap-2">
                  <select value={aDraft.prio} onChange={(ev) => setADraft({ ...aDraft, prio: ev.target.value })} className="flex-1 text-sm border rounded px-2 py-2" style={{ borderColor: "#D6D9DC" }}>
                    {Object.entries(ARBEIT_PRIO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <select value={aDraft.art} onChange={(ev) => setADraft({ ...aDraft, art: ev.target.value })} className="flex-1 text-sm border rounded px-2 py-2" style={{ borderColor: "#D6D9DC" }}>
                    <option value="mech">Mechanisch</option>
                    <option value="elek">Elektrisch</option>
                    <option value="beide">Mech + Elek</option>
                    <option value="">unbestimmt</option>
                  </select>
                </div>

                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={aDraft.azubi} onChange={(ev) => setADraft({ ...aDraft, azubi: ev.target.checked })} /> 🎓 Azubi-geeignet</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={aDraft.stillstand} onChange={(ev) => setADraft({ ...aDraft, stillstand: ev.target.checked })} /> ⛔ nur bei Stillstand</label>
                </div>

                <div className="flex gap-2">
                  <select
                    value={aDraft.wer}
                    onChange={(ev) => setADraft({ ...aDraft, wer: ev.target.value })}
                    className="flex-1 text-sm border rounded px-2 py-2"
                    style={{ borderColor: "#D6D9DC" }}
                    title="Zugewiesen an"
                  >
                    <option value="">– niemand zugewiesen –</option>
                    {team.map((t) => <option key={t.name} value={t.name}>{t.name} ({TEAM_ROLLEN[t.rolle || ""].label})</option>)}
                    {aDraft.wer && !team.some((t) => t.name === aDraft.wer) && <option value={aDraft.wer}>{aDraft.wer}</option>}
                  </select>
                  <input
                    type="date"
                    value={aDraft.geplant}
                    onChange={(ev) => setADraft({ ...aDraft, geplant: ev.target.value })}
                    className="text-sm border rounded px-2 py-2"
                    style={{ borderColor: "#D6D9DC", width: "160px" }}
                    title="Geplant für (Tag)"
                  />
                </div>
                {team.length === 0 && (
                  <div className="text-xs text-slate-400">Tipp: Dein Team legst du im ⚙-Verwalten-Dialog an – dann kannst du Arbeiten zuweisen und im Reiter „Planung" auf Tage verteilen.</div>
                )}
                {aDraft.melder && (
                  <div className="text-xs text-slate-400">📌 gemeldet von {aDraft.melder}</div>
                )}

                {arbeitModal.mode === "edit" && live && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setArbeitStatus(live.id, live.status === "done" ? "open" : "done")}
                      className={`flex-1 text-sm font-bold py-2 rounded ${live.status === "done" ? "bg-slate-100 text-slate-600" : "bg-emerald-600 text-white"}`}
                    >
                      {live.status === "done" ? "↩ Wieder öffnen" : "✓ Erledigt melden"}
                    </button>
                    <button onClick={() => deleteArbeit(live.id)} className="text-sm font-bold py-2 px-4 rounded bg-red-50 text-red-700 border border-red-200">Löschen</button>
                  </div>
                )}

                <div className="flex gap-2 mt-1">
                  <button
                    disabled={!saeubere(aDraft.anlage === OTHER_VALUE ? aDraft.anlageCustom : aDraft.anlage) || !saeubere(aDraft.note)}
                    onClick={saveArbeit}
                    className="flex-1 text-sm font-bold py-2.5 rounded text-white disabled:opacity-40"
                    style={{ backgroundColor: "#22262B" }}
                  >
                    {arbeitModal.ausZettel ? "Speichern & Zettel entfernen" : "Speichern"}
                  </button>
                  <button onClick={() => setArbeitModal(null)} className="flex-1 text-sm font-bold py-2.5 rounded bg-slate-100 text-slate-500">Abbrechen</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Eintrag hinzufügen / bearbeiten: geräumiges Modal statt enger Zellen-Erweiterung */}
      {modal && (() => {
        const liveEntry = modal.mode === "edit" ? entries.find((e) => e.id === modal.id) : null;
        if (modal.mode === "edit" && !liveEntry) return null;
        return (
          <div
            className="no-print"
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}
            onClick={closeModal}
          >
            <div
              style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", width: "400px", maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
              onClick={(ev) => ev.stopPropagation()}
            >
              {modal.mode === "add" ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-bold text-sm">Neuer Eintrag <span className="font-mono text-slate-400 font-normal">– {formatDateDE(modal.date)}</span></div>
                    <button onClick={closeModal} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
                  </div>

                  {!draftCat ? (
                    <div className="flex gap-2">
                      {["TPM", "RI"].map((c) => (
                        <button
                          key={c}
                          onClick={() => pickDraftCat(c)}
                          className="flex-1 text-sm font-bold uppercase py-3 rounded text-white hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: CATS[c].color }}
                        >
                          {CATS[c].label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between text-xs font-bold uppercase" style={{ color: CATS[draftCat].color }}>
                        <span>{CATS[draftCat].label}</span>
                        <button onClick={() => setDraftCat(null)} className="text-slate-400 normal-case font-normal hover:underline">
                          ändern
                        </button>
                      </div>

                      {draftCat === "TPM" && !draftCustom && (
                        <select
                          autoFocus
                          value={draftName}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === OTHER_VALUE) { setDraftCustom(true); setDraftName(""); }
                            else setDraftName(v);
                          }}
                          className="text-sm border rounded px-3 py-2"
                          style={{ borderColor: "#D6D9DC" }}
                        >
                          <option value="">– Anlage wählen –</option>
                          {tpmAnlagen.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                          <option value={OTHER_VALUE}>Sonstiges (Gebäude/Abwasser/Kompressor …)</option>
                        </select>
                      )}
                      {draftCat === "TPM" && draftCustom && (
                        <div className="flex flex-col gap-1.5">
                          <input
                            autoFocus
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEntry(); }}
                            placeholder="z. B. Kompressorenrundgang"
                            className="text-sm border rounded px-3 py-2"
                            style={{ borderColor: "#D6D9DC" }}
                          />
                          <button onClick={() => { setDraftCustom(false); setDraftName(""); }} className="text-xs text-slate-400 hover:underline text-left">
                            ← zurück zur Liste
                          </button>
                        </div>
                      )}
                      {draftCat === "RI" && !draftCustom && (
                        <select
                          autoFocus
                          value={draftName}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === OTHER_VALUE) { setDraftCustom(true); setDraftName(""); }
                            else setDraftName(v);
                          }}
                          className="text-sm border rounded px-3 py-2"
                          style={{ borderColor: "#D6D9DC" }}
                        >
                          <option value="">– R+I-Punkt wählen –</option>
                          {riItems.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                          <option value={OTHER_VALUE}>Sonstiges …</option>
                        </select>
                      )}
                      {draftCat === "RI" && draftCustom && (
                        <div className="flex flex-col gap-1.5">
                          <input
                            autoFocus
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEntry(); }}
                            placeholder="z. B. Rundgang Halle 1"
                            className="text-sm border rounded px-3 py-2"
                            style={{ borderColor: "#D6D9DC" }}
                          />
                          <button onClick={() => { setDraftCustom(false); setDraftName(""); }} className="text-xs text-slate-400 hover:underline text-left">
                            ← zurück zur Liste
                          </button>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => setDraftStatus("done")}
                          className={`flex-1 text-sm font-bold py-2 rounded ${draftStatus === "done" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}
                        >
                          ✓ Gemacht
                        </button>
                        <button
                          onClick={() => setDraftStatus("open")}
                          className={`flex-1 text-sm font-bold py-2 rounded ${draftStatus === "open" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-500"}`}
                        >
                          ✕ Offen
                        </button>
                      </div>
                      <textarea
                        spellCheck
                        lang="de"
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                        placeholder="Notiz (optional)"
                        rows={3}
                        className="text-sm border rounded px-3 py-2"
                        style={{ borderColor: "#D6D9DC", resize: "vertical" }}
                      />
                      <div className="flex gap-2 mt-1">
                        <button
                          disabled={!draftName.trim() || saving}
                          onClick={saveEntry}
                          className="flex-1 text-sm font-bold py-2.5 rounded text-white disabled:opacity-40"
                          style={{ backgroundColor: "#22262B" }}
                        >
                          Speichern
                        </button>
                        <button onClick={closeModal} className="flex-1 text-sm font-bold py-2.5 rounded bg-slate-100 text-slate-500">
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase" style={{ color: CATS[liveEntry.category].color }}>{CATS[liveEntry.category].label}</span>
                      <span className="font-bold text-sm">{liveEntry.name}</span>
                    </div>
                    <button onClick={closeModal} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
                  </div>
                  <div className="font-mono text-xs text-slate-400 mb-3">{formatDateDE(liveEntry.date)}</div>

                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEntryStatus(liveEntry.id, "done")}
                        className={`flex-1 text-sm font-bold py-2 rounded ${liveEntry.status === "done" ? "bg-emerald-600 text-white" : "bg-white text-slate-500 border border-slate-300"}`}
                      >
                        ✓ Gemacht
                      </button>
                      <button
                        onClick={() => setEntryStatus(liveEntry.id, "open")}
                        className={`flex-1 text-sm font-bold py-2 rounded ${liveEntry.status === "open" ? "bg-red-600 text-white" : "bg-white text-slate-500 border border-slate-300"}`}
                      >
                        ✕ Offen
                      </button>
                    </div>
                    <textarea
                      spellCheck
                      lang="de"
                      value={noteDraft}
                      onChange={(ev) => setNoteDraft(ev.target.value)}
                      placeholder="Notiz…"
                      rows={3}
                      className="text-sm border rounded px-3 py-2"
                      style={{ borderColor: "#D6D9DC", resize: "vertical" }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveNote(liveEntry.id)}
                        className="flex-1 text-sm font-bold py-2.5 rounded text-white"
                        style={{ backgroundColor: "#22262B" }}
                      >
                        Notiz speichern
                      </button>
                      <button
                        onClick={() => deleteEntry(liveEntry.id)}
                        className="flex-1 text-sm font-bold py-2.5 rounded bg-red-50 text-red-700 border border-red-200"
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Gemeinsame Datei einrichten */}
      {shareOpen && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => setShareOpen(false)}
        >
          <div
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", width: "480px", maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">Gemeinsame Datei (Firmenlaufwerk / OneDrive)</div>
              <button onClick={() => setShareOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>

            {!sharedFile.isSupported() ? (
              <div className="text-sm text-slate-600 leading-relaxed">
                Dieser Browser unterstützt den direkten Dateizugriff nicht. Bitte <strong>Microsoft Edge</strong> oder <strong>Google Chrome</strong> verwenden – dort funktioniert die gemeinsame Datei zuverlässig.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-slate-500 leading-relaxed">
                  Alle Einträge werden in einer JSON-Datei gespeichert, die auf einem gemeinsamen Laufwerk liegt
                  (Netzlaufwerk oder ein per Explorer synchronisierter OneDrive-Ordner). <strong>Wer die Datei
                  bearbeiten darf, legen die Datei-Rechte auf dem Laufwerk fest</strong> (IT-Freigabe): Mit
                  Schreibrechten kann man Einträge ändern, ohne Schreibrechte zeigt die App automatisch nur den
                  aktuellen Stand an (Aktualisierung alle 30 Sekunden).
                </div>

                {shareState.status === "connected" ? (
                  <div className="text-sm rounded px-3 py-2" style={{ backgroundColor: "#E5F3EA", color: "#2F7D4F" }}>
                    Verbunden mit <strong>{shareState.name}</strong> ({shareState.mode === "read" ? "nur ansehen" : "bearbeiten"}).
                  </div>
                ) : (
                  <div className="text-sm rounded px-3 py-2" style={{ backgroundColor: "#F4F5F6", color: "#5B6572" }}>
                    Zurzeit wird nur lokal auf diesem Rechner gespeichert.
                  </div>
                )}

                <button
                  onClick={() => connectShared({ create: true })}
                  className="text-sm font-bold py-2.5 rounded text-white"
                  style={{ backgroundColor: "#22262B" }}
                >
                  Neue gemeinsame Datei anlegen …
                </button>
                <button
                  onClick={() => connectShared({})}
                  className="text-sm font-bold py-2.5 rounded text-white"
                  style={{ backgroundColor: "#2F6690" }}
                >
                  Vorhandene Datei öffnen …
                </button>
                {shareState.status === "connected" && (
                  <button onClick={disconnectShared} className="text-sm font-bold py-2.5 rounded bg-slate-100 text-slate-500">
                    Verbindung trennen (dieser Rechner speichert dann nur lokal)
                  </button>
                )}

                <div className="text-xs text-slate-400 leading-relaxed">
                  Tipp: Die Datei einmal auf dem gemeinsamen Laufwerk anlegen, danach öffnen alle anderen sie über
                  „Vorhandene Datei öffnen". Schreibrechte auf die Datei bekommen nur die Bearbeiter (über die
                  IT-Freigabe) – bei allen anderen schaltet die App automatisch auf „nur ansehen". Nach einem
                  Browser-Neustart fragt der Browser aus Sicherheitsgründen einmal kurz nach – oben erscheint dann
                  „Jetzt verbinden".
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Anlagen & R+I-Punkte verwalten */}
      {settingsOpen && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", width: "680px", maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-sm">Anlagen &amp; R+I-Punkte verwalten</div>
              <button onClick={() => setSettingsOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>

            <div className="text-xs font-bold uppercase mb-2" style={{ color: CATS.TPM.color }}>TPM-Anlagen</div>
            <div className="flex flex-col gap-1.5 mb-2">
              {settingsTpm.map((a, idx) => (
                <div key={a.id} className="flex gap-1.5 items-center">
                  <input
                    value={a.name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSettingsTpm((prev) => prev.map((x, i) => (i === idx ? { ...x, name: v } : x)));
                    }}
                    className="flex-1 text-sm border rounded px-2 py-1.5"
                    style={{ borderColor: "#D6D9DC" }}
                  />
                  <select
                    value={a.role}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSettingsTpm((prev) => prev.map((x, i) => (i === idx ? { ...x, role: v } : x)));
                    }}
                    className="text-xs border rounded px-1.5 py-1.5"
                    style={{ borderColor: "#D6D9DC", width: "190px" }}
                  >
                    <option value="monday1">Montags-Rotation 1</option>
                    <option value="monday2">Montags-Rotation 2</option>
                    <option value="monday3">Montags-Rotation 3</option>
                    <option value="monday4">Montags-Rotation 4</option>
                    <option value="takt">Taktstraße</option>
                    <option value="b1">Flexibel (B1-artig)</option>
                    <option value="flexA">Flexibel Gruppe A (2 Mon.)</option>
                    <option value="flexB">Flexibel Gruppe B (2 Mon.)</option>
                  </select>
                  <button onClick={() => setSettingsTpm((prev) => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-600 p-1" aria-label="Löschen">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addSettingsTpm} className="text-xs font-bold mb-5" style={{ color: CATS.TPM.color }}>
              + Anlage hinzufügen
            </button>

            <div className="text-xs font-bold uppercase mb-2" style={{ color: CATS.RI.color }}>R+I-Punkte</div>
            <div className="flex flex-col gap-1.5 mb-2">
              {settingsRi.map((r, idx) => (
                <div key={r.id} className="flex flex-col gap-1 p-2 rounded" style={{ backgroundColor: "#F7F8F9" }}>
                  <div className="flex gap-1.5 items-center">
                    <input
                      value={r.name}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, name: v } : x)));
                      }}
                      className="flex-1 text-sm border rounded px-2 py-1.5"
                      style={{ borderColor: "#D6D9DC" }}
                    />
                    <select
                      value={r.type}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, type: v } : x)));
                      }}
                      className="text-xs border rounded px-1.5 py-1.5"
                      style={{ borderColor: "#D6D9DC", width: "150px" }}
                    >
                      {Object.entries(RI_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <button onClick={() => setSettingsRi((prev) => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-600 p-1" aria-label="Löschen">
                      <X size={14} />
                    </button>
                  </div>

                  {(r.type === "weekly" || r.type === "biweekly") && (
                    <div className="flex gap-1.5 items-center">
                      <select
                        value={r.weekday ?? 1}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, weekday: v } : x)));
                        }}
                        className="text-xs border rounded px-1.5 py-1"
                        style={{ borderColor: "#D6D9DC" }}
                      >
                        <option value={1}>Montag</option>
                        <option value={2}>Dienstag</option>
                        <option value={3}>Mittwoch</option>
                        <option value={4}>Donnerstag</option>
                        <option value={5}>Freitag</option>
                        <option value={6}>Samstag</option>
                        <option value={0}>Sonntag</option>
                      </select>
                      {r.type === "biweekly" && (
                        <input
                          type="date"
                          value={r.anchor || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, anchor: v } : x)));
                          }}
                          className="text-xs border rounded px-1.5 py-1"
                          style={{ borderColor: "#D6D9DC" }}
                        />
                      )}
                    </div>
                  )}

                  {r.type === "monthly-day" && (
                    <div className="flex gap-1.5 items-center">
                      <span className="text-xs text-slate-500">Tag im Monat:</span>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={r.day ?? 1}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, day: v } : x)));
                        }}
                        className="text-xs border rounded px-1.5 py-1"
                        style={{ borderColor: "#D6D9DC", width: "60px" }}
                      />
                    </div>
                  )}

                  {r.type === "every-n-months" && (
                    <div className="flex gap-1.5 items-center flex-wrap">
                      <span className="text-xs text-slate-500">alle</span>
                      <input
                        type="number"
                        min={2}
                        max={12}
                        value={r.n ?? 2}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, n: v } : x)));
                        }}
                        className="text-xs border rounded px-1.5 py-1"
                        style={{ borderColor: "#D6D9DC", width: "50px" }}
                      />
                      <span className="text-xs text-slate-500">Monate, ab</span>
                      <input
                        type="date"
                        value={r.anchor || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, anchor: v } : x)));
                        }}
                        className="text-xs border rounded px-1.5 py-1"
                        style={{ borderColor: "#D6D9DC" }}
                      />
                    </div>
                  )}

                  {r.type === "yearly" && (
                    <div className="flex gap-1.5 items-center">
                      <select
                        value={r.month ?? 0}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, month: v } : x)));
                        }}
                        className="text-xs border rounded px-1.5 py-1"
                        style={{ borderColor: "#D6D9DC" }}
                      >
                        {MONTHS.map((m, mi) => <option key={m} value={mi}>{m}</option>)}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={r.day ?? 1}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, day: v } : x)));
                        }}
                        className="text-xs border rounded px-1.5 py-1"
                        style={{ borderColor: "#D6D9DC", width: "60px" }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addSettingsRi} className="text-xs font-bold mb-5" style={{ color: CATS.RI.color }}>
              + R+I-Punkt hinzufügen
            </button>

            <div className="text-xs font-bold uppercase mb-2" style={{ color: "#22262B" }}>Team (für Zuweisung &amp; Arbeitsplanung)</div>
            <div className="flex flex-col gap-1.5 mb-2">
              {settingsTeam.map((t, idx) => (
                <div key={idx} className="flex gap-1.5 items-center">
                  <span className="inline-flex items-center justify-center rounded-full text-white font-extrabold" style={{ width: "22px", height: "22px", fontSize: "0.58rem", backgroundColor: TEAM_ROLLEN[t.rolle || ""].color, flexShrink: 0 }}>
                    {t.name.trim() ? t.name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "?"}
                  </span>
                  <input
                    value={t.name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSettingsTeam((prev) => prev.map((x, i) => (i === idx ? { ...x, name: v } : x)));
                    }}
                    placeholder="Name, z. B. K. Schmidt"
                    className="flex-1 text-sm border rounded px-2 py-1.5"
                    style={{ borderColor: "#D6D9DC" }}
                  />
                  <select
                    value={t.rolle || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSettingsTeam((prev) => prev.map((x, i) => (i === idx ? { ...x, rolle: v } : x)));
                    }}
                    className="text-xs border rounded px-1.5 py-1.5 font-bold"
                    style={{ borderColor: "#D6D9DC", width: "130px", color: TEAM_ROLLEN[t.rolle || ""].color }}
                  >
                    <option value="mech">Mechaniker</option>
                    <option value="elek">Elektriker</option>
                    <option value="azubi">Azubi</option>
                    <option value="">ohne Gewerk</option>
                  </select>
                  <button
                    onClick={() => setSettingsTeam((prev) => { if (idx === 0) return prev; const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n; })}
                    className="text-slate-400 hover:text-slate-700 p-1 font-bold"
                    aria-label="Person nach oben"
                    title="Nach oben (Reihenfolge in Schichtplan & Planung)"
                  >↑</button>
                  <button
                    onClick={() => setSettingsTeam((prev) => { if (idx >= prev.length - 1) return prev; const n = [...prev]; [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; return n; })}
                    className="text-slate-400 hover:text-slate-700 p-1 font-bold"
                    aria-label="Person nach unten"
                    title="Nach unten (Reihenfolge in Schichtplan & Planung)"
                  >↓</button>
                  <button onClick={() => setSettingsTeam((prev) => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-600 p-1" aria-label="Person entfernen">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setSettingsTeam((prev) => [...prev, { name: "", rolle: "mech" }])} className="text-xs font-bold mb-5" style={{ color: "#22262B" }}>
              + Person hinzufügen
            </button>

            <div className="flex gap-2 pt-2 border-t" style={{ borderColor: "#E2E4E7" }}>
              <button
                onClick={saveSettings}
                className="flex-1 text-sm font-bold py-2.5 rounded text-white"
                style={{ backgroundColor: "#22262B" }}
              >
                Speichern
              </button>
              <button onClick={() => setSettingsOpen(false)} className="flex-1 text-sm font-bold py-2.5 rounded bg-slate-100 text-slate-500">
                Abbrechen
              </button>
            </div>
            <div className="text-xs text-slate-400 mt-3">
              Umbenennen überträgt sich automatisch auf bestehende Kalender-Einträge. Montags-Rotation-Slots und die B1-Rolle sollten je nur einmal vergeben sein, sonst greift automatisch der erste Treffer.
            </div>
          </div>
        </div>
      )}

      {/* Matrix: klar erkennbar was gemacht / nicht gemacht wurde (Monat) bzw. Jahresübersicht */}
      {(view === "MONAT" || view === "JAHR") && (
      <div className="print-bg p-4 max-w-5xl mx-auto">
        <div className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "#22262B" }}>
          {view === "MONAT" ? `Monats-Matrix – ${MONTHS[month]} ${year}` : `Jahresübersicht ${year}`}
        </div>
        {!heavyReady ? (
          <div className="no-print text-xs text-slate-400 py-4">Wird berechnet …</div>
        ) : filter === "ALL" ? (
          <div className="flex flex-col gap-6">
            {renderCategoryBlock("TPM", false)}
            {renderCategoryBlock("RI", true)}
          </div>
        ) : (
          renderCategoryBlock(filter, false)
        )}
        {view === "JAHR" && legendeKlein}
      </div>
      )}

      {/* Wartungsplan: fortlaufende Rotation für den gewählten Monat */}
      {view === "PLAN" && (
        <div className="print-bg cal-card p-5 max-w-7xl mx-auto rounded-xl mt-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7", boxShadow: "0 2px 8px rgba(20,22,25,0.06)" }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-sm font-bold uppercase tracking-wide" style={{ color: "#22262B" }}>
              Kalender – {MONTHS[month]} {year}
            </div>
            {!readerMode && (
              <div className="no-print flex items-center gap-2">
                <button
                  onClick={applyPlanToCalendar}
                  className="text-xs font-bold uppercase tracking-wide text-white px-3 py-2 rounded hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: "#22262B" }}
                >
                  Plan in Auswertung übernehmen
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-1.5 mb-1.5">
            <div style={{ width: "30px", flexShrink: 0 }} />
            <div className="grid grid-cols-7 gap-1.5 flex-1">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className="text-center text-xs font-bold uppercase font-mono py-1" style={{ color: i >= 5 ? "#6D93B8" : "#64748b" }}>{w}</div>
              ))}
            </div>
          </div>
          {(() => {
            const planByDay = new Map();
            maintenancePlan.forEach((p) => {
              if (!planByDay.has(p.day)) planByDay.set(p.day, []);
              planByDay.get(p.day).push(p);
            });
            return chunkIntoWeeks(cells).map((week, wi) => (
              <div key={wi} className="flex gap-1.5 mb-1.5">
                <div className="flex items-start justify-center pt-1.5" style={{ width: "30px", flexShrink: 0 }}>
                  <span className="font-mono text-xs font-bold" style={{ color: "#B7BEC6" }}>{weekLabel(week, year, month)}</span>
                </div>
                <div className="grid grid-cols-7 gap-1.5 flex-1">
                  {week.map((d, di) => {
                    if (d === null) return <div key={`planblank-${wi}-${di}`} />;
                    const key = dateKey(year, month, d);
                    const isToday = key === todayKey;
                    const holName = holidays.get(key);
                    const weekend = isWeekend(year, month, d);
                    const dayPlans = planByDay.get(d) || [];
                    return (
                      <div
                        key={key}
                        className="border rounded-md p-1.5 flex flex-col gap-1"
                        style={{
                          minHeight: "116px",
                          backgroundColor: holName ? "#FBE9E7" : weekend ? "#E5F0F8" : "white",
                          borderColor: isToday ? "#C97A2B" : holName ? "#E8B4AE" : weekend ? "#C8DDEE" : "#E2E4E7",
                          borderWidth: isToday ? "2px" : "1px",
                        }}
                      >
                        <span className="font-mono text-xs" style={{ color: holName ? "#B23A34" : weekend ? "#5B87AB" : "#5B6572", fontWeight: holName ? 700 : 400 }}>{d}</span>
                        {holName && <div className="text-xs font-bold" style={{ color: "#B23A34", marginTop: "-4px" }}>{holName}</div>}
                        <div className="flex flex-col gap-1">
                          {dayPlans.map((p, pi) => {
                            const done = isPlanDone(p);
                            const c = done ? "#2F7D4F" : planGroupColor(p.anlage, tpmAnlagen, riItems);
                            return (
                              <button
                                key={pi}
                                onClick={() => openPlanEntry(p)}
                                disabled={readerMode}
                                className="text-xs font-bold rounded px-1.5 py-1 text-left w-full"
                                style={{ color: c, border: `1px solid ${c}`, backgroundColor: done ? "#E5F3EA" : `${c}18`, wordBreak: "break-word", overflowWrap: "break-word", cursor: readerMode ? "default" : "pointer" }}
                                title={readerMode ? undefined : "Klicken zum Abhaken / Notiz"}
                              >
                                {done ? "✓ " : ""}{p.anlage}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}

          <div className="mt-3 flex items-center gap-3 text-xs font-bold flex-wrap">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#C97A2B" }} /> TPM</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATS.RI.color }} /> R+I</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#2F7D4F" }} /> ✓ Erledigt</span>
          </div>

          <div style={{ breakBefore: "page" }}>
            <div className="text-sm font-bold uppercase tracking-wide mt-6 mb-3" style={{ color: "#22262B" }}>
              Wartungsplan – Tabelle
            </div>
            <table style={{ borderCollapse: "collapse", fontSize: "13px", width: "100%" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #22262B" }}>
                  <th style={{ textAlign: "left", padding: "5px 10px" }}>Datum</th>
                  <th style={{ textAlign: "left", padding: "5px 10px" }}>Wochentag</th>
                  <th style={{ textAlign: "left", padding: "5px 10px" }}>Anlage</th>
                  <th style={{ textAlign: "left", padding: "5px 10px" }}>Gruppe</th>
                </tr>
              </thead>
              <tbody>
                {maintenancePlan.map((p) => {
                  const dt = new Date(year, month, p.day);
                  const wd = dt.toLocaleDateString("de-DE", { weekday: "long" });
                  return (
                    <tr key={p.date + p.anlage} style={{ borderBottom: "1px solid #E2E4E7" }}>
                      <td style={{ padding: "5px 10px", fontFamily: "monospace" }}>{formatDateDE(p.date)}</td>
                      <td style={{ padding: "5px 10px" }}>{wd}</td>
                      <td style={{ padding: "5px 10px", fontWeight: 700 }}>{p.anlage}</td>
                      <td style={{ padding: "5px 10px", color: "#8A9099" }}>{planGroupLabel(p.anlage, tpmAnlagen, riItems)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="no-print text-xs text-slate-400 mt-3">
            Rotation läuft fortlaufend über Monatsgrenzen hinweg (Referenzpunkt 05.01.2026). Fällt ein Rotations-Montag auf einen Feiertag, entfällt der Slot diesen Zyklus.
          </div>
        </div>
      )}

      {/* Register: alle Anlagen & R+I-Punkte, anklickbar für die komplette Historie */}
      {view === "REGISTER" && (
        <div className="no-print cal-card p-5 max-w-7xl mx-auto rounded-xl mt-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7", boxShadow: "0 2px 8px rgba(20,22,25,0.06)" }}>
          <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: CATS.TPM.color }}>TPM-Anlagen</div>
              <div className="flex flex-col gap-1.5">
                {tpmAnlagen.map((a) => {
                  const stats = registerStats("TPM", a.name);
                  return (
                    <button
                      key={a.id}
                      onClick={() => setRegisterItem({ category: "TPM", name: a.name })}
                      className="flex items-center justify-between text-left px-3 py-2 rounded border hover:opacity-80 transition-opacity"
                      style={{ borderColor: "#E2E4E7" }}
                    >
                      <span className="text-sm font-bold">{a.name}</span>
                      <span className="text-xs font-mono text-slate-400">{stats.done} ✓ · {stats.open} ✕</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: CATS.RI.color }}>R+I-Punkte</div>
              <div className="flex flex-col gap-1.5">
                {riItems.map((r) => {
                  const stats = registerStats("RI", r.name);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRegisterItem({ category: "RI", name: r.name })}
                      className="flex items-center justify-between text-left px-3 py-2 rounded border hover:opacity-80 transition-opacity"
                      style={{ borderColor: "#E2E4E7" }}
                    >
                      <span className="text-sm font-bold">{r.name}</span>
                      <span className="text-xs font-mono text-slate-400">{stats.done} ✓ · {stats.open} ✕</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historie-Fenster: alle Termine einer einzelnen Anlage/eines R+I-Punkts */}
      {registerItem && (() => {
        const historyEntries = entries
          .filter((e) => e.category === registerItem.category && e.name === registerItem.name)
          .sort((a, b) => b.date.localeCompare(a.date));
        return (
          <div
            className="no-print"
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
            onClick={() => setRegisterItem(null)}
          >
            <div
              style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", width: "460px", maxWidth: "100%", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase" style={{ color: CATS[registerItem.category].color }}>{CATS[registerItem.category].label}</span>
                  <span className="font-bold text-sm">{registerItem.name}</span>
                </div>
                <button onClick={() => setRegisterItem(null)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
              </div>
              <div className="text-xs text-slate-400 mb-3">{historyEntries.length} Termin(e) insgesamt</div>
              {historyEntries.length === 0 ? (
                <div className="text-xs italic text-slate-400 py-4">Noch keine Einträge für diesen Punkt.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {historyEntries.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded"
                      style={{ backgroundColor: e.status === "done" ? "#E5F3EA" : "#FBE9E7" }}
                    >
                      <span className="text-xs font-mono font-bold" style={{ color: e.status === "done" ? "#2F7D4F" : "#B23A34", minWidth: "78px" }}>{formatDateDE(e.date)}</span>
                      <span className="text-xs font-bold" style={{ color: e.status === "done" ? "#2F7D4F" : "#B23A34", minWidth: "68px" }}>{e.status === "done" ? "✓ Gemacht" : "✕ Offen"}</span>
                      {e.note && e.note.trim() && <span className="text-xs text-slate-500 italic flex-1" style={{ wordBreak: "break-word" }}>{e.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Notizen: eigene Seite, Hochformat, chronologisch */}
      {view !== "PLAN" && notesList.length > 0 && (
        <div className="notes-page print-bg p-4 max-w-4xl mx-auto" style={{ marginTop: "8px" }}>
          <div className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "#22262B" }}>
            Notizen – {view === "JAHR" ? `Jahr ${year}` : `${MONTHS[month]} ${year}`}
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: "11px", width: "100%" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #22262B" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Datum</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Kategorie</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Anlage / Punkt</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Status</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Notiz</th>
              </tr>
            </thead>
            <tbody>
              {notesList.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid #E2E4E7" }}>
                  <td style={{ padding: "4px 8px", fontFamily: "monospace", whiteSpace: "nowrap" }}>{formatDateDE(e.date)}</td>
                  <td style={{ padding: "4px 8px", fontWeight: 700, color: CATS[e.category].color }}>{CATS[e.category].label}</td>
                  <td style={{ padding: "4px 8px", fontWeight: 600 }}>{e.name}</td>
                  <td style={{ padding: "4px 8px", fontWeight: 700, color: e.status === "done" ? "#2F7D4F" : "#B23A34" }}>
                    {e.status === "done" ? "Gemacht" : "Offen"}
                  </td>
                  <td style={{ padding: "4px 8px" }}>{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view !== "COCKPIT" && (
      <div className="no-print max-w-5xl mx-auto px-4 pb-6 pt-3 text-xs text-slate-400">
        Tipp: "Drucken" öffnet die Druckvorlage in einem neuen Tab (Pop-ups für diese Seite bitte erlauben) – bei der Monatsansicht zuerst als übersichtliche Kalenderseite, danach die Anlagen-Matrix. Falls der Browser Pop-ups blockiert, wird stattdessen automatisch eine Datei heruntergeladen. Filter oben auf "TPM" oder "R+I" stellen für den separaten Ausdruck je Kategorie. Am Jahresende einfach auf "Jahr" umschalten und drucken.
      </div>
      )}

      {/* Werkstatt-Monitor: Vollbild-Dashboard für einen Monitor in der Werkstatt */}
      {monitorOpen && (() => {
        const { aktuell, SCHICHT_INFO, jetztCrew } = jetztInDerWerkstatt;
        const chip = (s) => (
          <span className="inline-flex items-center justify-center rounded font-black text-white" style={{ minWidth: "34px", height: "26px", padding: "0 8px", fontSize: "0.8rem", backgroundColor: SCHICHTEN[s].color, flexShrink: 0, marginRight: "10px" }}>{SCHICHTEN[s].kurz}</span>
        );
        const prioHoch = arbeitenOffen.filter((a) => a.prio === "hoch").length;
        const prioMittel = arbeitenOffen.filter((a) => a.prio === "mittel").length;
        const wocheGrenze = dateKey(addDays(monitorUhr, -7).getFullYear(), addDays(monitorUhr, -7).getMonth(), addDays(monitorUhr, -7).getDate());
        const erledigtWoche = arbeiten.filter((a) => a.status === "done" && a.erledigtAm && a.erledigtAm >= wocheGrenze).length;
        const monitorZettel = zettelListe.filter((z) => z.monitor);
        return (
          <div
            id="werkstatt-monitor"
            className="no-print"
            style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#16181B", color: "#fff", padding: "28px 36px", display: "flex", flexDirection: "column", fontVariantNumeric: "tabular-nums" }}
          >
            <div className="flex items-baseline gap-6" style={{ borderBottom: "2px solid #2E3238", paddingBottom: "16px", marginBottom: "22px" }}>
              <span style={{ fontSize: "4rem", fontWeight: 900, fontFamily: "ui-monospace,Consolas,monospace", lineHeight: 1 }}>
                {monitorUhr.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span style={{ fontSize: "1.3rem", color: "#9AA0A6" }}>
                {monitorUhr.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })} · KW {getISOWeek(monitorUhr)}<br />
                {SCHICHT_INFO[aktuell].label} ({SCHICHT_INFO[aktuell].zeit})
              </span>
              <button
                onClick={() => setMonitorOpen(false)}
                className="ml-auto rounded font-bold"
                style={{ backgroundColor: "#2E3238", color: "#fff", padding: "8px 16px", fontSize: "1rem" }}
              >
                × Beenden (ESC)
              </button>
            </div>
            <div className="grid gap-6" style={{ gridTemplateColumns: "1.2fr 1fr 1fr", flex: 1, minHeight: 0 }}>
              <div style={{ background: "#1F2226", border: "1px solid #2E3238", borderRadius: "14px", padding: "20px 22px", overflow: "auto" }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9AA0A6", marginBottom: "14px" }}>
                  Jetzt in der Werkstatt · {jetztCrew.length}
                </div>
                {jetztCrew.length === 0 ? (
                  <div style={{ fontSize: "1.2rem", color: "#6B7178" }}>Gerade ist laut Schichtplan niemand eingetragen.</div>
                ) : (
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 2 }}>
                    {jetztCrew.map((x) => (
                      <div key={x.name}>{chip(x.schicht)}{x.name}</div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ background: "#1F2226", border: "1px solid #2E3238", borderRadius: "14px", padding: "20px 22px", overflow: "auto" }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9AA0A6", marginBottom: "14px" }}>Heute fällig</div>
                {heutePlan.length === 0 ? (
                  <div style={{ fontSize: "1.2rem", color: "#6B7178" }}>Heute steht laut Plan nichts an.</div>
                ) : (
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 2 }}>
                    {heutePlan.map((p) => {
                      const st = statusFuerPlanPunkt(p);
                      return (
                        <div key={p.anlage} style={{ color: st === "done" ? "#7FD1A0" : "#fff" }}>
                          {st === "done" ? "✅" : "⬜"} {p.anlage}
                        </div>
                      );
                    })}
                  </div>
                )}
                {ueberfaellige.length > 0 && (
                  <div style={{ marginTop: "18px", display: "flex", alignItems: "baseline", gap: "12px" }}>
                    <span style={{ fontSize: "4.5rem", fontWeight: 900, fontFamily: "ui-monospace,Consolas,monospace", lineHeight: 1, color: "#E8A0A0" }}>{ueberfaellige.length}</span>
                    <span style={{ fontSize: "1.1rem", color: "#9AA0A6" }}>überfällige<br />Wartungen</span>
                  </div>
                )}
              </div>
              <div style={{ background: "#1F2226", border: "1px solid #2E3238", borderRadius: "14px", padding: "20px 22px", overflow: "auto" }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9AA0A6", marginBottom: "14px" }}>Backlog</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                  <span style={{ fontSize: "4.5rem", fontWeight: 900, fontFamily: "ui-monospace,Consolas,monospace", lineHeight: 1 }}>{arbeitenOffen.length}</span>
                  <span style={{ fontSize: "1.1rem", color: "#9AA0A6" }}>offene<br />Arbeiten</span>
                </div>
                {prioHoch > 0 && <div style={{ fontSize: "1.35rem", fontWeight: 800, marginTop: "14px", color: "#E8A0A0" }}>🔴 {prioHoch} × Prio 1</div>}
                {prioMittel > 0 && <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#F0B27A" }}>🟠 {prioMittel} × Prio 2</div>}
                <div style={{ fontSize: "1.2rem", marginTop: "14px", color: "#7FD1A0" }}>✓ {erledigtWoche} erledigt diese Woche</div>
              </div>
            </div>
            {monitorZettel.length > 0 && (
              <div style={{ marginTop: "22px", background: "#1F2226", border: "1px solid #2E3238", borderRadius: "12px", padding: "14px 20px", fontSize: "1.25rem", color: "#C9CDD2", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {monitorZettel.map((z) => `${z.note} (${z.name})`).join("   +++   ")}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("Werkstatt-Kalender Fehler:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#EBEDEF", padding: "24px", fontFamily: "Arial, sans-serif" }}>
          <div style={{ backgroundColor: "white", borderRadius: "10px", padding: "28px", maxWidth: "440px", textAlign: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px", color: "#22262B" }}>Etwas ist schiefgelaufen</div>
            <div style={{ fontSize: "13px", color: "#5B6572", marginBottom: "18px", lineHeight: 1.6 }}>
              Deine gespeicherten Daten sind davon nicht betroffen - das war nur ein Anzeigefehler. Bitte lade die Seite neu. Hilft das nicht, exportiere zur Sicherheit deine Daten sobald der Kalender wieder lädt und melde dich.
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{ backgroundColor: "#22262B", color: "white", border: "none", borderRadius: "6px", padding: "10px 22px", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
            >
              Seite neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
