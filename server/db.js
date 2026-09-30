/* BTA-Cockpit-Dienst: Datenbank-Schicht (Etappe A des Bauplans, 30.09.2026)
 *
 * WARUM SQLite über node:sqlite: keine Zusatzpakete, kein Compiler, kein
 * Datenbank-Server – der Dienst ist ein Ordner mit node.exe und .js-Dateien.
 * WARUM die Einträge 1:1 als JSON-Spalte: Der Import von den heutigen
 * Dateien (werkstatt-kalender-v1 / werkstatt-stoerungen-v1) ist damit
 * verlustfrei und nachzählbar, die Oberfläche muss keine Felder umlernen.
 * Kernfelder liegen zusätzlich als echte Spalten (Suche, Sortierung).
 * WARUM Version statt Zeitstempel: Jede Änderung zählt eine Server-Version
 * hoch; wer auf einer älteren Version aufsetzt, bekommt einen Konflikt
 * gemeldet – sofort, ohne fremde Rechner-Uhren.
 * WARUM Löschen = Markierung: wie die heutige deleted-Liste; nichts geht
 * still verloren, „Kürzlich gelöscht" wird ein Filter.
 */
"use strict";
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  schluessel TEXT PRIMARY KEY,
  wert TEXT
);
CREATE TABLE IF NOT EXISTS eintraege (
  id TEXT PRIMARY KEY,
  category TEXT,
  date TEXT,
  name TEXT,
  status TEXT,
  updated_at TEXT,
  version INTEGER NOT NULL,
  geloescht INTEGER NOT NULL DEFAULT 0,
  geloescht_am TEXT,
  daten TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_eintraege_version ON eintraege(version);
CREATE INDEX IF NOT EXISTS ix_eintraege_cat_date ON eintraege(category, date);
CREATE TABLE IF NOT EXISTS stoerungen (
  id TEXT PRIMARY KEY,
  nr TEXT,
  date TEXT,
  schicht TEXT,
  anlage TEXT,
  offen INTEGER,
  updated_at TEXT,
  version INTEGER NOT NULL,
  geloescht INTEGER NOT NULL DEFAULT 0,
  geloescht_am TEXT,
  daten TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_stoerungen_version ON stoerungen(version);
CREATE INDEX IF NOT EXISTS ix_stoerungen_date ON stoerungen(date);
CREATE TABLE IF NOT EXISTS konfig (
  bereich TEXT NOT NULL,          -- 'kalender' oder 'stoerungen' (die zwei heutigen Dateien haben je eine config)
  schluessel TEXT NOT NULL,
  version INTEGER NOT NULL,
  daten TEXT NOT NULL,
  PRIMARY KEY (bereich, schluessel)
);
CREATE TABLE IF NOT EXISTS aenderungen (
  lfd INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL,
  zeit TEXT NOT NULL,
  benutzer TEXT,
  tabelle TEXT NOT NULL,
  id TEXT NOT NULL,
  art TEXT NOT NULL               -- 'neu' | 'geaendert' | 'geloescht' | 'import'
);
CREATE INDEX IF NOT EXISTS ix_aenderungen_version ON aenderungen(version);
`;

const TABELLEN = { eintraege: "eintraege", stoerungen: "stoerungen" };

class KonfliktFehler extends Error {
  constructor(konflikte) {
    super("Konflikt: " + konflikte.length + " Eintrag/Einträge wurden inzwischen geändert");
    this.name = "KonfliktFehler";
    this.konflikte = konflikte;
  }
}

function jetztIso() { return new Date().toISOString(); }

/* Öffnet (oder legt an) die Datenbank eines Standorts. */
function oeffnen(dateiPfad, { standort } = {}) {
  fs.mkdirSync(path.dirname(dateiPfad), { recursive: true });
  const db = new DatabaseSync(dateiPfad);
  // WAL: Leser blockieren Schreiber nicht, ein Absturz hinterlässt keine halbe Datei.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  const meta = {
    get: (k) => { const r = db.prepare("SELECT wert FROM meta WHERE schluessel = ?").get(k); return r ? r.wert : null; },
    set: (k, w) => db.prepare("INSERT INTO meta(schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert").run(k, String(w)),
  };
  if (meta.get("version") === null) meta.set("version", "0");
  if (standort && meta.get("standort") === null) meta.set("standort", standort);
  if (meta.get("angelegt") === null) meta.set("angelegt", jetztIso());

  const version = () => Number(meta.get("version") || 0);

  const stmts = {
    eintragLesen: db.prepare("SELECT * FROM eintraege WHERE id = ?"),
    stoerungLesen: db.prepare("SELECT * FROM stoerungen WHERE id = ?"),
    konfigLesen: db.prepare("SELECT * FROM konfig WHERE bereich = ? AND schluessel = ?"),
    eintragSchreiben: db.prepare(`INSERT INTO eintraege(id, category, date, name, status, updated_at, version, geloescht, geloescht_am, daten)
      VALUES (@id, @category, @date, @name, @status, @updated_at, @version, 0, NULL, @daten)
      ON CONFLICT(id) DO UPDATE SET category=excluded.category, date=excluded.date, name=excluded.name, status=excluded.status,
        updated_at=excluded.updated_at, version=excluded.version, geloescht=0, geloescht_am=NULL, daten=excluded.daten`),
    stoerungSchreiben: db.prepare(`INSERT INTO stoerungen(id, nr, date, schicht, anlage, offen, updated_at, version, geloescht, geloescht_am, daten)
      VALUES (@id, @nr, @date, @schicht, @anlage, @offen, @updated_at, @version, 0, NULL, @daten)
      ON CONFLICT(id) DO UPDATE SET nr=excluded.nr, date=excluded.date, schicht=excluded.schicht, anlage=excluded.anlage, offen=excluded.offen,
        updated_at=excluded.updated_at, version=excluded.version, geloescht=0, geloescht_am=NULL, daten=excluded.daten`),
    eintragLoeschen: db.prepare("UPDATE eintraege SET geloescht = 1, geloescht_am = ?, version = ? WHERE id = ?"),
    stoerungLoeschen: db.prepare("UPDATE stoerungen SET geloescht = 1, geloescht_am = ?, version = ? WHERE id = ?"),
    grabstein: {
      eintraege: db.prepare("INSERT INTO eintraege(id, version, geloescht, geloescht_am, daten) VALUES (?, ?, 1, ?, '{}') ON CONFLICT(id) DO UPDATE SET geloescht=1, geloescht_am=excluded.geloescht_am, version=excluded.version"),
      stoerungen: db.prepare("INSERT INTO stoerungen(id, version, geloescht, geloescht_am, daten) VALUES (?, ?, 1, ?, '{}') ON CONFLICT(id) DO UPDATE SET geloescht=1, geloescht_am=excluded.geloescht_am, version=excluded.version"),
    },
    konfigSchreiben: db.prepare(`INSERT INTO konfig(bereich, schluessel, version, daten) VALUES (?, ?, ?, ?)
      ON CONFLICT(bereich, schluessel) DO UPDATE SET version=excluded.version, daten=excluded.daten`),
    journal: db.prepare("INSERT INTO aenderungen(version, zeit, benutzer, tabelle, id, art) VALUES (?, ?, ?, ?, ?, ?)"),
  };

  const zeilenEintrag = (e, v) => ({
    id: String(e.id), category: e.category == null ? null : String(e.category), date: e.date == null ? null : String(e.date),
    name: e.name == null ? null : String(e.name), status: e.status == null ? null : String(e.status),
    updated_at: e.updatedAt == null ? null : String(e.updatedAt), version: v, daten: JSON.stringify(e),
  });
  const zeilenStoerung = (s, v) => ({
    id: String(s.id), nr: s.nr == null ? null : String(s.nr), date: s.date == null ? null : String(s.date),
    schicht: s.schicht == null ? null : String(s.schicht), anlage: s.anlage == null ? null : String(s.anlage),
    offen: s.offen ? 1 : 0, updated_at: s.updatedAt == null ? null : String(s.updatedAt), version: v, daten: JSON.stringify(s),
  });

  /* In einer Transaktion ausführen; bei Fehler alles zurück. */
  function transaktion(fn) {
    db.exec("BEGIN IMMEDIATE");
    try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { try { db.exec("ROLLBACK"); } catch (x) { /* schon zurückgerollt */ } throw e; }
  }

  /* Alles seit Version `seit` (0 = Vollbestand). Grabsteine kommen als Liste
     der gelöschten Kennungen mit, damit der Rechner sie austragen kann. */
  function standSeit(seit) {
    seit = Number(seit) || 0;
    const v = version();
    const eintraege = db.prepare("SELECT daten FROM eintraege WHERE version > ? AND geloescht = 0").all(seit).map((r) => JSON.parse(r.daten));
    const stoerungen = db.prepare("SELECT daten FROM stoerungen WHERE version > ? AND geloescht = 0").all(seit).map((r) => JSON.parse(r.daten));
    const geloescht = {
      eintraege: db.prepare("SELECT id, geloescht_am FROM eintraege WHERE version > ? AND geloescht = 1").all(seit).map((r) => ({ id: r.id, am: r.geloescht_am })),
      stoerungen: db.prepare("SELECT id, geloescht_am FROM stoerungen WHERE version > ? AND geloescht = 1").all(seit).map((r) => ({ id: r.id, am: r.geloescht_am })),
    };
    const konfig = { kalender: {}, stoerungen: {} };
    for (const r of db.prepare("SELECT bereich, schluessel, daten FROM konfig WHERE version > ?").all(seit)) {
      konfig[r.bereich] = konfig[r.bereich] || {};
      konfig[r.bereich][r.schluessel] = JSON.parse(r.daten);
    }
    return { version: v, seit, eintraege, stoerungen, geloescht, konfig };
  }

  /* Ein Bündel Änderungen anwenden.
     aenderung = { benutzer, basisVersion, erzwingen,
                   eintraege: [{...eintrag}], stoerungen: [{...}],
                   konfig: { kalender: {schluessel: wert}, stoerungen: {...} },
                   loeschen: { eintraege: [id], stoerungen: [id] } }
     Konflikt: Ein betroffener Eintrag hat auf dem Server eine Version, die
     jünger ist als die Basis des Absenders. Dann wird NICHTS übernommen und
     der Server-Stand der Konfliktzeilen zurückgegeben – die App zeigt den
     bekannten gelben Hinweis, sofort. `erzwingen` überschreibt bewusst. */
  function aenderungenAnwenden(a) {
    const basis = Number(a.basisVersion) || 0;
    const benutzer = a.benutzer ? String(a.benutzer) : null;
    return transaktion(() => {
      const konflikte = [];
      const pruefe = (tabelle, id, lesen) => {
        const alt = lesen.get(String(id));
        if (alt && alt.version > basis && !a.erzwingen) {
          konflikte.push({ tabelle, id: String(id), version: alt.version, geloescht: !!alt.geloescht, server: alt.geloescht ? null : JSON.parse(alt.daten) });
        }
        return alt;
      };
      for (const e of a.eintraege || []) pruefe("eintraege", e.id, stmts.eintragLesen);
      for (const s of a.stoerungen || []) pruefe("stoerungen", s.id, stmts.stoerungLesen);
      for (const id of (a.loeschen && a.loeschen.eintraege) || []) pruefe("eintraege", id, stmts.eintragLesen);
      for (const id of (a.loeschen && a.loeschen.stoerungen) || []) pruefe("stoerungen", id, stmts.stoerungLesen);
      for (const bereich of ["kalender", "stoerungen"]) {
        for (const k of Object.keys((a.konfig && a.konfig[bereich]) || {})) {
          const alt = stmts.konfigLesen.get(bereich, k);
          if (alt && alt.version > basis && !a.erzwingen) konflikte.push({ tabelle: "konfig", id: bereich + "|" + k, version: alt.version, server: JSON.parse(alt.daten) });
        }
      }
      if (konflikte.length) throw new KonfliktFehler(konflikte);

      const neu = version() + 1;
      const zeit = jetztIso();
      let anzahl = 0;
      for (const e of a.eintraege || []) {
        if (!e || e.id == null) throw new Error("Eintrag ohne id");
        const vorher = stmts.eintragLesen.get(String(e.id));
        stmts.eintragSchreiben.run(zeilenEintrag(e, neu));
        stmts.journal.run(neu, zeit, benutzer, "eintraege", String(e.id), vorher && !vorher.geloescht ? "geaendert" : "neu");
        anzahl++;
      }
      for (const s of a.stoerungen || []) {
        if (!s || s.id == null) throw new Error("Störung ohne id");
        const vorher = stmts.stoerungLesen.get(String(s.id));
        stmts.stoerungSchreiben.run(zeilenStoerung(s, neu));
        stmts.journal.run(neu, zeit, benutzer, "stoerungen", String(s.id), vorher && !vorher.geloescht ? "geaendert" : "neu");
        anzahl++;
      }
      for (const id of (a.loeschen && a.loeschen.eintraege) || []) {
        stmts.grabstein.eintraege.run(String(id), neu, zeit);
        stmts.journal.run(neu, zeit, benutzer, "eintraege", String(id), "geloescht");
        anzahl++;
      }
      for (const id of (a.loeschen && a.loeschen.stoerungen) || []) {
        stmts.grabstein.stoerungen.run(String(id), neu, zeit);
        stmts.journal.run(neu, zeit, benutzer, "stoerungen", String(id), "geloescht");
        anzahl++;
      }
      for (const bereich of ["kalender", "stoerungen"]) {
        for (const [k, w] of Object.entries((a.konfig && a.konfig[bereich]) || {})) {
          stmts.konfigSchreiben.run(bereich, k, neu, JSON.stringify(w));
          stmts.journal.run(neu, zeit, benutzer, "konfig", bereich + "|" + k, "geaendert");
          anzahl++;
        }
      }
      if (anzahl === 0) return { version: version(), anzahl: 0 };
      meta.set("version", neu);
      return { version: neu, anzahl };
    });
  }

  /* Export im heutigen Dateiformat – Rückfallnetz und Handexport.
     bereich 'kalender' -> werkstatt-kalender-v1, 'stoerungen' -> werkstatt-stoerungen-v1 */
  function exportV1(bereich) {
    const tabelle = bereich === "stoerungen" ? "stoerungen" : "eintraege";
    const format = bereich === "stoerungen" ? "werkstatt-stoerungen-v1" : "werkstatt-kalender-v1";
    const entries = db.prepare(`SELECT daten FROM ${tabelle} WHERE geloescht = 0 ORDER BY rowid`).all().map((r) => JSON.parse(r.daten));
    const deleted = {};
    for (const r of db.prepare(`SELECT id, geloescht_am FROM ${tabelle} WHERE geloescht = 1`).all()) deleted[r.id] = r.geloescht_am;
    const config = {};
    for (const r of db.prepare("SELECT schluessel, daten FROM konfig WHERE bereich = ? ORDER BY schluessel").all(bereich)) config[r.schluessel] = JSON.parse(r.daten);
    const out = { format, standort: meta.get("standort") || undefined, savedAt: jetztIso(), schreibMarke: "server-" + version(), entries, deleted, config };
    const bau = meta.get("bauStand"); if (bau) out.bauStand = bau;
    return out;
  }

  /* Import aus dem heutigen Dateiformat (Etappe B, hier schon für die
     Prüfstände). Wiederholbar: Was Byte für Byte gleich ist, wird nicht
     erneut geschrieben – zweimal einlesen ändert nichts. Gibt die Zählung
     zurück, die der Import-Nachweis braucht. */
  function importV1(datei, { bereich, benutzer = "import", nurPruefen = false } = {}) {
    if (!datei || !Array.isArray(datei.entries)) throw new Error("Import: keine gültige Datei (entries fehlt)");
    const istStoer = bereich === "stoerungen" || /stoerungen/.test(String(datei.format || ""));
    const tabelle = istStoer ? "stoerungen" : "eintraege";
    const konfigBereich = istStoer ? "stoerungen" : "kalender";
    const lesen = istStoer ? stmts.stoerungLesen : stmts.eintragLesen;
    const schreiben = istStoer ? stmts.stoerungSchreiben : stmts.eintragSchreiben;
    const zeilen = istStoer ? zeilenStoerung : zeilenEintrag;
    const zaehlung = { gelesen: datei.entries.length, neu: 0, geaendert: 0, unveraendert: 0, geloescht: 0, konfig: 0, ohneId: 0 };
    /* Zwei Durchgänge IN EINER Transaktion: erst nur LESEN und entscheiden
       (das ist die Vorschau für Robertos „Nur prüfen“ im Werkzeug - Etappe B),
       dann SCHREIBEN. Die Vorschau schreibt nichts und kehrt vor dem zweiten
       Durchgang zurück. Auch das Lesen gehört in die Transaktion: außerhalb
       zahlt jede der 17.000 Einzelabfragen ihren eigenen Sperr-Aufwand
       (gemessen 30.09.: 0,8 s -> 9 s). */
    return transaktion(() => {
      const plan = { eintraege: [], grabsteine: [], konfig: [] };
      for (const e of datei.entries) {
        if (!e || e.id == null) { zaehlung.ohneId++; continue; }
        const daten = JSON.stringify(e);
        const alt = lesen.get(String(e.id));
        if (alt && !alt.geloescht && alt.daten === daten) { zaehlung.unveraendert++; continue; }
        plan.eintraege.push(e);
        if (alt && !alt.geloescht) zaehlung.geaendert++; else zaehlung.neu++;
      }
      for (const [id, am] of Object.entries(datei.deleted || {})) {
        const alt = lesen.get(String(id));
        if (alt && alt.geloescht) continue;
        plan.grabsteine.push([String(id), am]);
        zaehlung.geloescht++;
      }
      for (const [k, w] of Object.entries(datei.config || {})) {
        const daten = JSON.stringify(w);
        const alt = stmts.konfigLesen.get(konfigBereich, k);
        if (alt && alt.daten === daten) continue;
        plan.konfig.push([k, daten]);
        zaehlung.konfig++;
      }
      const anzahl = plan.eintraege.length + plan.grabsteine.length + plan.konfig.length;
      if (nurPruefen) return { ...zaehlung, version: version(), tabelle, nurPruefen: true, wuerdeAendern: anzahl };
      const neu = version() + 1;
      const zeit = jetztIso();
      for (const e of plan.eintraege) {
        schreiben.run(zeilen(e, neu));
        stmts.journal.run(neu, zeit, benutzer, tabelle, String(e.id), "import");
      }
      for (const [id, am] of plan.grabsteine) {
        stmts.grabstein[tabelle].run(id, neu, typeof am === "string" ? am : zeit);
        stmts.journal.run(neu, zeit, benutzer, tabelle, id, "geloescht");
      }
      for (const [k, daten] of plan.konfig) stmts.konfigSchreiben.run(konfigBereich, k, neu, daten);
      if (datei.bauStand && !istStoer) meta.set("bauStand", String(datei.bauStand));
      if (anzahl > 0) meta.set("version", neu);
      return { ...zaehlung, version: version(), tabelle };
    });
  }

  /* Konsistente Kopie im laufenden Betrieb (VACUUM INTO) - für die nächtliche
     Sicherung, die die IT-Netzsicherung dann mitnimmt. */
  function sicherungNach(zielPfad) {
    fs.mkdirSync(path.dirname(zielPfad), { recursive: true });
    if (fs.existsSync(zielPfad)) fs.unlinkSync(zielPfad);
    db.exec(`VACUUM INTO '${String(zielPfad).replace(/'/g, "''")}'`);
    return fs.statSync(zielPfad).size;
  }

  function zaehlen() {
    const z = (sql) => db.prepare(sql).get().n;
    return {
      version: version(),
      eintraege: z("SELECT COUNT(*) AS n FROM eintraege WHERE geloescht = 0"),
      stoerungen: z("SELECT COUNT(*) AS n FROM stoerungen WHERE geloescht = 0"),
      geloescht: z("SELECT COUNT(*) AS n FROM eintraege WHERE geloescht = 1") + z("SELECT COUNT(*) AS n FROM stoerungen WHERE geloescht = 1"),
      konfig: z("SELECT COUNT(*) AS n FROM konfig"),
      aenderungen: z("SELECT COUNT(*) AS n FROM aenderungen"),
      bytes: fs.existsSync(dateiPfad) ? fs.statSync(dateiPfad).size : 0,
    };
  }

  function schliessen() { try { db.close(); } catch (e) { /* schon zu */ } }

  return { pfad: dateiPfad, version, standSeit, aenderungenAnwenden, exportV1, importV1, sicherungNach, zaehlen, schliessen, meta, KonfliktFehler };
}

module.exports = { oeffnen, KonfliktFehler, TABELLEN };
