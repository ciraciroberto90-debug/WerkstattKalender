import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Printer, StickyNote, X, Download, Upload, Settings, FolderOpen } from "lucide-react";
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
  const doneDates = allEntries
    .filter((e) => e.category === "TPM" && e.name === anlage && e.status === "done")
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
  const [view, setView] = useState("MONAT"); // 'MONAT' | 'JAHR'
  const [entries, setEntries] = useState([]);
  const [tpmAnlagen, setTpmAnlagen] = useState(DEFAULT_TPM_ANLAGEN);
  const [riItems, setRiItems] = useState(DEFAULT_RI_ITEMS);
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareState, setShareState] = useState({ status: "none" }); // none | unsupported | needs-permission | connected

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
      }
    };
    const onShareError = (ev) => setErr(ev.detail || "Gemeinsame Datei: unbekannter Fehler.");
    window.addEventListener("werkstatt-shared-update", onUpdate);
    window.addEventListener("werkstatt-shared-error", onShareError);
    return () => {
      cancelled = true;
      window.removeEventListener("werkstatt-shared-update", onUpdate);
      window.removeEventListener("werkstatt-shared-error", onShareError);
    };
  }, []);

  const connectShared = async (opts) => {
    try {
      await sharedFile.pickShared(opts);
      setShareState({ status: "connected", name: sharedFile.fileName(), mode: opts.readOnly ? "read" : "readwrite" });
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

  const persistConfig = async (nextTpm, nextRi) => {
    setTpmAnlagen(nextTpm);
    setRiItems(nextRi);
    const attempt = async (retriesLeft) => {
      try {
        const result = await window.storage.set(
          CONFIG_STORAGE_KEY,
          JSON.stringify({ tpmAnlagen: nextTpm, riItems: nextRi }),
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

    let nextEntries = entries;
    if (tpmRenames.size > 0 || riRenames.size > 0) {
      nextEntries = entries.map((e) => {
        if (e.category === "TPM" && tpmRenames.has(e.name)) return { ...e, name: tpmRenames.get(e.name) };
        if (e.category === "RI" && riRenames.has(e.name)) return { ...e, name: riRenames.get(e.name) };
        return e;
      });
    }

    await persistConfig(cleanTpm, cleanRi);
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
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Ungültiges Format");
      const valid = parsed.filter(
        (en) => en && typeof en.date === "string" && typeof en.category === "string" && typeof en.name === "string"
      );
      if (valid.length === 0) throw new Error("Keine gültigen Einträge in der Datei gefunden");
      const rejected = parsed.length - valid.length;
      if (entries.length > 0) {
        const ok = window.confirm(
          `${valid.length} Einträge importieren und deine aktuellen ${entries.length} Einträge ersetzen?${rejected > 0 ? `\n(${rejected} ungültige Zeilen werden übersprungen.)` : ""}`
        );
        if (!ok) { e.target.value = ""; return; }
      }
      await persist(valid);
      setErr(rejected > 0 ? `Import ok, aber ${rejected} ungültige Zeile(n) übersprungen.` : null);
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
    () => entries.filter((e) => filter === "ALL" || e.category === filter),
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
  const openCount = scopeEntries.filter((e) => e.status === "open").length;
  const notesList = scopeEntries.filter((e) => e.note && e.note.trim()).sort((a, b) => a.date.localeCompare(b.date));

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
  const computeMaintenancePlan = () => {
    const dim = daysInMonth;
    const taktNames = tpmAnlagen.filter((a) => a.role === "takt").map((a) => a.name);
    const monday34Names = tpmAnlagen.filter((a) => a.role === "monday3" || a.role === "monday4").map((a) => a.name);
    const flexANames = tpmAnlagen.filter((a) => a.role === "flexA").map((a) => a.name);
    const flexBNames = tpmAnlagen.filter((a) => a.role === "flexB").map((a) => a.name);
    const b1Item = tpmAnlagen.find((a) => a.role === "b1");

    const mondayAssignments = [];
    for (let d = 1; d <= dim; d++) {
      const dow = new Date(year, month, d).getDay();
      if (dow !== 1) continue;
      const key = dateKey(year, month, d);
      if (holidays.get(key)) continue; // Feiertags-Montag: Slot entfällt diesen Zyklus
      const anlage = mondayAnlage(new Date(year, month, d), tpmAnlagen);
      if (anlage) mondayAssignments.push({ day: d, date: key, anlage });
    }

    const taktDoneThisMonth = new Set(
      mondayAssignments.filter((m) => taktNames.includes(m.anlage)).map((m) => m.anlage)
    );
    const taktQueue = taktNames.filter((a) => !taktDoneThisMonth.has(a));

    const b2b3Weeks = new Set(
      mondayAssignments.filter((m) => monday34Names.includes(m.anlage)).map((m) => weekBucketKey(year, month, m.day))
    );
    // Randfall: Beginnt der Monat nicht an einem Montag, kann der Montag der ersten (Teil-)Woche
    // noch im Vormonat liegen - dessen Rolle wird sonst übersehen.
    {
      const firstDow = new Date(year, month, 1).getDay(); // 0=So..6=Sa
      if (firstDow !== 1) {
        const boundaryMonday = new Date(year, month, 1 - ((firstDow + 6) % 7));
        const boundaryKey = dateKey(boundaryMonday.getFullYear(), boundaryMonday.getMonth(), boundaryMonday.getDate());
        if (!getHolidays(boundaryMonday.getFullYear()).get(boundaryKey)) {
          const boundaryAnlage = mondayAnlage(boundaryMonday, tpmAnlagen);
          if (monday34Names.includes(boundaryAnlage)) {
            b2b3Weeks.add(weekBucketKey(year, month, 1));
          }
        }
      }
    }

    const monthIndexAbs = year * 12 + month;
    const flexPair = monthIndexAbs % 2 === 0 ? flexANames : flexBNames;

    const mondayUsedKeys = new Set(mondayAssignments.map((m) => m.date));

    const candidateDays = [];
    for (let d = 1; d <= dim; d++) {
      const dow = new Date(year, month, d).getDay(); // 2..5 = Di..Fr
      if (dow < 2 || dow > 5) continue;
      const key = dateKey(year, month, d);
      if (holidays.get(key)) continue;
      if (dow === 2) {
        const prevKey = dateKey(year, month, d - 1);
        if (mondayUsedKeys.has(prevKey)) continue; // Dienstag nach genutztem Montag frei lassen
      }
      candidateDays.push(d);
    }

    // Kein Fallback mehr, der die B2/B3-Wochen-Regel ignoriert: findet sich kein freier Tag
    // außerhalb der B2/B3-Woche, setzt B1 in diesem Monat schlicht aus (wie B+T/flexible Gruppe).
    let b1Day = b1Item ? candidateDays.find((d) => !b2b3Weeks.has(weekBucketKey(year, month, d))) : undefined;

    const remainingDays = candidateDays.filter((d) => d !== b1Day);
    // Priorität: die Taktstraßen-Anlage mit der stabilen id "bt" gilt (laut Absprache) wie die
    // flexible Gruppe als unkritisch und darf bei Platzmangel zuerst einen Monat aussetzen.
    const planReference = new Date(year, month, 1);
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
      weekdayAssignments.push({ day: b1Day, date: dateKey(year, month, b1Day), anlage: b1Item.name });
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
    placed.forEach((p) => weekdayAssignments.push({ day: p.day, date: dateKey(year, month, p.day), anlage: p.anlage }));

    const riAssignments = riOccurrencesInMonth(riItems, year, month, holidays).map((r) => ({
      day: r.day,
      date: dateKey(year, month, r.day),
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
      ${view !== "PLAN" ? `<div style="font-family:monospace;font-size:11px;margin-top:4px;">${doneCount} erledigt · ${openCount} offen</div>` : ""}
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
          <div className="flex rounded overflow-hidden border border-white/20">
            {[["MONAT", "Monat"], ["JAHR", "Jahr"], ["PLAN", "Plan"], ["REGISTER", "Register"]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-2.5 py-1 text-xs font-bold uppercase tracking-wide"
                style={{ backgroundColor: view === v ? "#C97A2B" : "transparent", color: "white" }}
              >
                {label}
              </button>
            ))}
          </div>
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
          ) : (
            <div className="font-mono text-sm px-2">Alle Termine</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImportFile} />
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 text-white px-2.5 py-1.5 rounded font-bold text-xs uppercase tracking-wide hover:opacity-90 transition-opacity"
            style={{ backgroundColor: shareState.status === "connected" ? "#2F7D4F" : "#4B5259" }}
            title={shareState.status === "connected" ? `Gemeinsame Datei: ${shareState.name}` : "Gemeinsame Datei einrichten"}
          >
            <FolderOpen size={14} /> {shareState.status === "connected" ? (shareState.mode === "read" ? "Ansicht" : "Geteilt") : "Teilen"}
          </button>
          <button
            onClick={openSettings}
            className="flex items-center gap-1.5 text-white px-2.5 py-1.5 rounded font-bold text-xs uppercase tracking-wide hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#4B5259" }}
          >
            <Settings size={14} /> Verwalten
          </button>
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            className="flex items-center gap-1.5 text-white px-2.5 py-1.5 rounded font-bold text-xs uppercase tracking-wide hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#2F6690" }}
          >
            <Upload size={14} /> Import
          </button>
          <button
            onClick={exportData}
            className="flex items-center gap-1.5 text-white px-2.5 py-1.5 rounded font-bold text-xs uppercase tracking-wide hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#2F6690" }}
          >
            <Download size={14} /> Export
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 text-white px-3 py-1.5 rounded font-bold text-sm uppercase tracking-wide hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#C97A2B" }}
          >
            <Printer size={16} /> Drucken
          </button>
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
        <div className="no-print px-4 py-2 text-xs font-bold" style={{ backgroundColor: "#E5F0F8", color: "#2F6690" }}>
          Nur ansehen – angezeigt wird der gemeinsame Stand aus „{shareState.name}". Eigene Änderungen werden nicht in die Datei geschrieben.
        </div>
      )}

      {/* Filter + Legende + Stats */}
      {view !== "PLAN" && (
        <div className="no-print px-4 py-3 flex flex-wrap items-center gap-4 border-b bg-white" style={{ borderColor: "#D6D9DC" }}>
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

          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" /> Gemacht</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" /> Nicht gemacht</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: "#FBE9E7", border: "1px solid #B23A34" }} /> Feiertag</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: "#E5F0F8", border: "1px solid #C8DDEE" }} /> Wochenende</span>
          </div>

          <div className="flex gap-3 ml-auto text-xs font-mono">
            <span className="text-emerald-700 font-bold">{doneCount} erledigt</span>
            <span className="text-red-700 font-bold">{openCount} offen</span>
          </div>
        </div>
      )}

      {err && <div className="no-print mx-4 mt-2 text-xs text-red-600">{err}</div>}

      {/* Titel nur für den Ausdruck */}
      <div className="print-only text-center py-2">
        <div className="font-black text-2xl uppercase tracking-tight">{printPrefix}</div>
        <div className="font-mono text-sm">{printSuffix}</div>
        {view !== "PLAN" && <div className="font-mono text-xs mt-1">{doneCount} erledigt · {openCount} offen</div>}
      </div>

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
        </div>
      )}

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
                  (Netzlaufwerk oder ein per Explorer synchronisierter OneDrive-Ordner). Wer die Datei
                  <strong> zum Bearbeiten</strong> öffnet, kann Einträge ändern – wer sie <strong>nur ansieht</strong>, bekommt
                  automatisch den aktuellen Stand angezeigt (Aktualisierung alle 30 Sekunden).
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
                  Vorhandene Datei öffnen (bearbeiten) …
                </button>
                <button
                  onClick={() => connectShared({ readOnly: true })}
                  className="text-sm font-bold py-2.5 rounded border"
                  style={{ borderColor: "#2F6690", color: "#2F6690", backgroundColor: "white" }}
                >
                  Vorhandene Datei nur ansehen …
                </button>
                {shareState.status === "connected" && (
                  <button onClick={disconnectShared} className="text-sm font-bold py-2.5 rounded bg-slate-100 text-slate-500">
                    Verbindung trennen (dieser Rechner speichert dann nur lokal)
                  </button>
                )}

                <div className="text-xs text-slate-400 leading-relaxed">
                  Tipp: Der Chef legt die Datei einmal auf dem gemeinsamen Laufwerk an. Der Vertreter öffnet sie
                  über „bearbeiten", alle anderen über „nur ansehen". Nach einem Browser-Neustart fragt der Browser
                  aus Sicherheitsgründen einmal kurz nach – oben erscheint dann „Jetzt verbinden".
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
      </div>
      )}

      {/* Wartungsplan: fortlaufende Rotation für den gewählten Monat */}
      {view === "PLAN" && (
        <div className="print-bg cal-card p-5 max-w-7xl mx-auto rounded-xl mt-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7", boxShadow: "0 2px 8px rgba(20,22,25,0.06)" }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-sm font-bold uppercase tracking-wide" style={{ color: "#22262B" }}>
              Kalender – {MONTHS[month]} {year}
            </div>
            <div className="no-print flex items-center gap-2">
              <button
                onClick={applyPlanToCalendar}
                className="text-xs font-bold uppercase tracking-wide text-white px-3 py-2 rounded hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#22262B" }}
              >
                Plan in Kalender übernehmen
              </button>
            </div>
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
                            const c = planGroupColor(p.anlage, tpmAnlagen, riItems);
                            return (
                              <div key={pi} className="text-xs font-bold rounded px-1.5 py-1" style={{ color: c, border: `1px solid ${c}`, backgroundColor: `${c}18`, wordBreak: "break-word", overflowWrap: "break-word" }}>
                                {p.anlage}
                              </div>
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

      <div className="no-print max-w-5xl mx-auto px-4 pb-6 pt-3 text-xs text-slate-400">
        Tipp: "Drucken" öffnet die Druckvorlage in einem neuen Tab (Pop-ups für diese Seite bitte erlauben) – bei der Monatsansicht zuerst als übersichtliche Kalenderseite, danach die Anlagen-Matrix. Falls der Browser Pop-ups blockiert, wird stattdessen automatisch eine Datei heruntergeladen. Filter oben auf "TPM" oder "R+I" stellen für den separaten Ausdruck je Kategorie. Am Jahresende einfach auf "Jahr" umschalten und drucken.
      </div>
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
