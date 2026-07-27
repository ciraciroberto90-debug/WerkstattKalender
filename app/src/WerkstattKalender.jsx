import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Printer, StickyNote, X, Download, Upload, Settings, FolderOpen, Tv } from "lucide-react";
import * as sharedFile from "./sharedfile.js";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// "Zuletzt aktualisiert"-Anzeige der gemeinsamen Datei: tickt sekündlich,
// aber nur diese kleine Komponente rendert neu - nicht die ganze App.
function SyncAnzeige({ style }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const at = sharedFile.getLastSuccessfulSyncAt();
  if (!at) return null;
  return (
    <span className="font-mono text-[11px]" style={style} title="Zeitpunkt der letzten erfolgreichen Synchronisation mit der gemeinsamen Datei">
      {formatVorZeit(at)}
    </span>
  );
}

// Halbkreis-Anzeige für die Erledigungs-Quoten in der Übersicht: der Bogen füllt
// sich beim Anzeigen weich bis zum Zielwert, die Prozentzahl zählt synchron mit
// hoch, ein kleiner Punkt reitet auf der Bogenspitze und die Farbe richtet sich
// nach dem Wert (grün / gelb / rot).
// Trend der Termintreue über 12 Monate.
// Bewusst eine Linie statt Balken: Gefragt ist die Richtung, nicht der Vergleich
// einzelner Monate. Und bewusst eine feste 0-100-Skala - eine Quote auf ihr
// eigenes Maximum zu strecken lässt kleine Schwankungen dramatisch aussehen.
function TermintreueTrend({ reihe, filter }) {
  const [aktiv, setAktiv] = React.useState(null);
  const mitWert = reihe.filter((r) => r.quote !== null);
  if (mitWert.length < 2) return null;

  const B = 720, H = 168, L = 34, R = 12, O = 14, U = 26; // Zeichenfläche
  const innenB = B - L - R, innenH = H - O - U;
  const x = (i) => L + (reihe.length === 1 ? innenB / 2 : (i * innenB) / (reihe.length - 1));
  const y = (q) => O + innenH - (q / 100) * innenH;

  // Lücken (Monate ohne Termine) trennen die Linie, statt sie zu überbrücken -
  // eine durchgezogene Linie über einen Monat ohne Daten wäre eine Behauptung.
  const abschnitte = [];
  let lauf = [];
  reihe.forEach((r, i) => {
    if (r.quote === null) { if (lauf.length) abschnitte.push(lauf); lauf = []; }
    else lauf.push({ i, r });
  });
  if (lauf.length) abschnitte.push(lauf);

  const schnitt = Math.round(mitWert.reduce((s, r) => s + r.quote, 0) / mitWert.length);
  // Richtung: letztes Drittel gegen das davorliegende Drittel. Einzelne Monate
  // schwanken zu stark, um daraus eine Aussage abzuleiten.
  const teil = Math.max(1, Math.floor(mitWert.length / 3));
  const mittel = (arr) => Math.round(arr.reduce((s, r) => s + r.quote, 0) / arr.length);
  const vorher = mitWert.slice(-2 * teil, -teil);
  const zuletzt = mittel(mitWert.slice(-teil));
  const davor = mittel(vorher.length ? vorher : mitWert.slice(0, teil));
  const delta = zuletzt - davor;
  const steigt = delta >= 3, faellt = delta <= -3;
  const richtungFarbe = steigt ? "#1F7A3D" : faellt ? "#B23A34" : "#5B6572";
  // Pfeil und Wort tragen die Aussage - die Farbe ist nur Verstärkung, damit
  // sie auch bei Farbsehschwäche und im Ausdruck lesbar bleibt.
  const richtungText = steigt ? `▲ ${delta} Punkte besser` : faellt ? `▼ ${Math.abs(delta)} Punkte schlechter` : "▬ unverändert";

  // Nur wenige Punkte beschriften: erster, letzter, höchster, niedrigster.
  const hoechster = mitWert.reduce((a, b) => (b.quote > a.quote ? b : a));
  const tiefster = mitWert.reduce((a, b) => (b.quote < a.quote ? b : a));
  const beschriftet = new Set([mitWert[0].key, mitWert[mitWert.length - 1].key, hoechster.key, tiefster.key]);
  const bereich = filter === "ALL" ? "Wartung & R+I" : filter === "TPM" ? "nur Wartung (TPM)" : "nur R+I";

  return (
    <div className="print-bg p-4 max-w-5xl mx-auto">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <div className="text-sm font-bold uppercase tracking-wide" style={{ color: "#22262B" }}>Termintreue – letzte 12 Monate</div>
        <span style={{ fontSize: "0.72rem", color: "#8A9099" }}>{bereich}</span>
        <span className="ml-auto inline-flex items-center gap-1.5" style={{ fontSize: "0.75rem", fontWeight: 800, color: richtungFarbe }}>
          {richtungText}
        </span>
      </div>
      <div style={{ fontSize: "0.7rem", color: "#8A9099", marginBottom: "8px" }}>
        Anteil der erledigten an den geplanten Terminen je Monat. Monate ohne Termine bleiben leer.
      </div>

      <div className="rounded-xl" style={{ backgroundColor: "#fff", border: "1px solid #E2E4E7", padding: "10px 8px 4px" }}>
        <div style={{ overflowX: "auto" }}>
          <svg viewBox={`0 0 ${B} ${H}`} style={{ width: "100%", minWidth: "460px", height: "auto", display: "block" }}
               role="img" aria-label={`Termintreue der letzten zwölf Monate, Durchschnitt ${schnitt} Prozent, zuletzt ${richtungText}`}>
            {/* Hilfslinien zurückhaltend, feste Skala 0-100 % */}
            {[0, 25, 50, 75, 100].map((q) => (
              <g key={q}>
                <line x1={L} y1={y(q)} x2={B - R} y2={y(q)} stroke={q === 0 ? "#C3C7CB" : "#EDEFF2"} strokeWidth="1" />
                <text x={L - 6} y={y(q) + 3.5} textAnchor="end" style={{ fontSize: "9px", fill: "#A6AEB6" }}>{q}</text>
              </g>
            ))}
            {/* Durchschnitt als neutrale Bezugslinie */}
            <line x1={L} y1={y(schnitt)} x2={B - R} y2={y(schnitt)} stroke="#8A9099" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={B - R} y={y(schnitt) - 5} textAnchor="end" style={{ fontSize: "9px", fill: "#8A9099", fontWeight: 700 }}>⌀ {schnitt}%</text>

            {abschnitte.map((abschnitt, ai) => {
              const pfad = abschnitt.map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.i)} ${y(p.r.quote)}`).join(" ");
              const flaeche = `${pfad} L ${x(abschnitt[abschnitt.length - 1].i)} ${y(0)} L ${x(abschnitt[0].i)} ${y(0)} Z`;
              return (
                <g key={ai}>
                  {abschnitt.length > 1 && <path d={flaeche} fill="#2F6690" opacity="0.10" />}
                  <path d={pfad} fill="none" stroke="#2F6690" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}

            {reihe.map((r, i) => r.quote !== null && (
              <g key={r.key}
                 onMouseEnter={() => setAktiv(r.key)} onMouseLeave={() => setAktiv(null)}
                 style={{ cursor: "default" }}>
                {/* großzügige Trefferfläche, damit der Punkt leicht zu erwischen ist */}
                <rect x={x(i) - 16} y={O} width="32" height={innenH} fill="transparent" />
                <circle cx={x(i)} cy={y(r.quote)} r={aktiv === r.key ? 5.5 : 4} fill="#2F6690" stroke="#fff" strokeWidth="2" />
                {(beschriftet.has(r.key) || aktiv === r.key) && (
                  <text x={x(i)} y={y(r.quote) - 10} textAnchor="middle" style={{ fontSize: "10px", fill: "#22262B", fontWeight: 700 }}>{r.quote}%</text>
                )}
              </g>
            ))}

            {reihe.map((r, i) => (
              <text key={r.key} x={x(i)} y={H - 8} textAnchor="middle"
                    style={{ fontSize: "9px", fill: r.quote === null ? "#C3C7CB" : "#5B6572", fontWeight: 700 }}>{r.label}</text>
            ))}
          </svg>
        </div>

        {aktiv && (() => {
          const r = reihe.find((z) => z.key === aktiv);
          return (
            <div className="no-print" style={{ fontSize: "0.72rem", color: "#22262B", padding: "4px 8px 6px", fontWeight: 600 }}>
              {r.monatVoll} {r.jahr}: <strong>{r.quote}%</strong> · {r.erledigt} von {r.basis} Terminen erledigt
            </div>
          );
        })()}
      </div>

      {/* Zahlen zusätzlich als Tabelle - für den Ausdruck und für alle, die
          die Linie nicht ablesen können oder wollen. */}
      <details className="mt-2">
        <summary style={{ fontSize: "0.72rem", color: "#5B6572", cursor: "pointer", fontWeight: 700 }}>Zahlen anzeigen</summary>
        <div style={{ overflowX: "auto" }}>
          <table className="mt-2" style={{ borderCollapse: "collapse", fontSize: "0.72rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "3px 10px 3px 0", color: "#8A9099", fontWeight: 700 }}>Monat</th>
                <th style={{ textAlign: "right", padding: "3px 10px", color: "#8A9099", fontWeight: 700 }}>Erledigt</th>
                <th style={{ textAlign: "right", padding: "3px 10px", color: "#8A9099", fontWeight: 700 }}>Geplant</th>
                <th style={{ textAlign: "right", padding: "3px 0 3px 10px", color: "#8A9099", fontWeight: 700 }}>Quote</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
              {reihe.map((r) => (
                <tr key={r.key} style={{ borderTop: "1px solid #EDEFF2" }}>
                  <td style={{ padding: "3px 10px 3px 0", fontWeight: 700, color: "#22262B" }}>{r.monatVoll} {r.jahr}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: "#5B6572" }}>{r.basis > 0 ? r.erledigt : "–"}</td>
                  <td style={{ textAlign: "right", padding: "3px 10px", color: "#5B6572" }}>{r.basis > 0 ? r.basis : "–"}</td>
                  <td style={{ textAlign: "right", padding: "3px 0 3px 10px", fontWeight: 700, color: r.quote === null ? "#C3C7CB" : "#22262B" }}>
                    {r.quote === null ? "keine Termine" : r.quote + "%"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function HalbkreisQuote({ prozent, label, sub, titel, dunkel = false }) {
  const hatWert = prozent !== null && prozent !== undefined;
  const ziel = hatWert ? Math.min(100, Math.max(0, prozent)) : 0;
  const [anim, setAnim] = useState(0);
  const [gid] = useState(() => "hkq-" + Math.random().toString(36).slice(2, 8));
  useEffect(() => {
    if (!hatWert) { setAnim(0); return; }
    let raf, start;
    const dauer = 1400;
    const tick = (ts) => {
      if (start === undefined) start = ts;
      const t = Math.min(1, (ts - start) / dauer);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setAnim(ziel * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, 120);
    return () => { clearTimeout(timer); if (raf) cancelAnimationFrame(raf); };
  }, [ziel, hatWert]);

  const umfang = Math.PI * 34; // Länge des Halbkreis-Bogens (Radius 34)
  const frac = Math.min(1, Math.max(0, anim / 100));
  const gefuellt = umfang * frac;
  const theta = Math.PI * (1 - frac); // Winkel der Bogenspitze (links = π, rechts = 0)
  const tipX = 42 + 34 * Math.cos(theta);
  const tipY = 44 - 34 * Math.sin(theta);
  const [gruenHell, gruenDunkel] = ["#43B26F", "#2F7D4F"]; // immer grün
  return (
    <div
      className="px-3.5 py-3 flex flex-col justify-center"
      style={dunkel
        ? { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "var(--wk-eck)", textAlign: "center" }
        : { background: "linear-gradient(180deg,#FFFFFF,#FBFCFD)", borderRadius: "var(--wk-eck)", textAlign: "center", boxShadow: "var(--wk-schatten)" }}
      title={titel || "Anteil erledigter Wartungs- und R+I-Punkte"}
    >
      <svg viewBox="0 0 84 50" style={{ width: "80px", height: "47px", display: "block", margin: "0 auto" }} role="img" aria-label={`${label}${sub ? " " + sub : ""}: ${hatWert ? prozent + " %" : "keine Daten"}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={gruenHell} />
            <stop offset="100%" stopColor={gruenDunkel} />
          </linearGradient>
        </defs>
        {/* Hintergrund-Bogen */}
        <path d="M 8 44 A 34 34 0 0 1 76 44" fill="none" stroke={dunkel ? "rgba(255,255,255,0.16)" : "#EDEEF0"} strokeWidth="8" strokeLinecap="round" />
        {/* gefüllter Bogen mit weichem Farbverlauf + leichtem Schein */}
        {hatWert && frac > 0 && (
          <path
            d="M 8 44 A 34 34 0 0 1 76 44"
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={umfang}
            strokeDashoffset={umfang - gefuellt}
            style={{ filter: `drop-shadow(0 1px 2px ${gruenDunkel}55)` }}
          />
        )}
        {/* mitlaufender Punkt an der Bogenspitze */}
        {hatWert && frac > 0.01 && (
          <circle cx={tipX} cy={tipY} r="4.6" fill="#fff" stroke={gruenDunkel} strokeWidth="2.4" />
        )}
        <text x="42" y="42" textAnchor="middle" fontFamily="ui-monospace,Consolas,monospace" fontWeight="800" fontSize="15" fill={dunkel ? "#fff" : "#22262B"}>
          {hatWert ? `${Math.round(anim)}%` : "–"}
        </text>
      </svg>
      <div className="font-semibold" style={{ color: dunkel ? "#B7BEC6" : "#6B7480", fontSize: "var(--wk-txt-etikett)", lineHeight: 1.15 }}>{label}</div>
      {/* Der Zeitraum stand bisher in 0,58 rem Hellgrau und war praktisch unsichtbar -
          man sah zwei gleich beschriftete Halbkreise und wusste nicht, welcher welcher ist. */}
      {sub && <div style={{ color: dunkel ? "#fff" : "#22262B", fontSize: "0.76rem", fontWeight: 800, lineHeight: 1.25 }}>{sub}</div>}
    </div>
  );
}
// Uhr mit Schichtbezug. Die Uhrzeit allein sagt nichts, was die Wanduhr nicht
// auch sagt - der Nutzen entsteht erst dadurch, dass sie die laufende Schicht
// und die Übergabe mit nennt. Das steht sonst nirgends in der Übersicht.
// Die Schichtgrenzen sind dieselben wie in "Heute da" (6 / 14 / 22 Uhr).
function WerkstattUhr() {
  const [jetzt, setJetzt] = React.useState(() => new Date());
  React.useEffect(() => {
    // Auf die volle Sekunde einschwenken, damit der Zeiger nicht schleift
    let timer = null;
    const tick = () => { setJetzt(new Date()); timer = setTimeout(tick, 1000 - (Date.now() % 1000)); };
    timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => clearTimeout(timer);
  }, []);

  const std = jetzt.getHours(), min = jetzt.getMinutes(), sek = jetzt.getSeconds();
  const schicht =
    std >= 6 && std < 14 ? { name: "Frühschicht", naechste: "Spät", ab: "14:00", bg: "#FBE9AE", fg: "#6B5200" }
    : std >= 14 && std < 22 ? { name: "Spätschicht", naechste: "Nacht", ab: "22:00", bg: "#CDEBD8", fg: "#14512A" }
    : { name: "Nachtschicht", naechste: "Früh", ab: "06:00", bg: "#D3E2EE", fg: "#1E4763" };
  const zeit = `${String(std).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  // Kurzer Wochentag: der lange bricht die Zeile neben der Schichtangabe um
  const datum = jetzt.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const dreh = (grad) => ({ transform: `rotate(${grad}deg)`, transformOrigin: "50px 50px" });

  return (
    <div className="wk-karte px-4 py-3 flex items-center gap-3 justify-center flex-1" title={`${zeit} Uhr · ${schicht.name}`}>
      <svg viewBox="0 0 100 100" style={{ width: "46px", height: "46px", flexShrink: 0 }}
           role="img" aria-label={`${zeit} Uhr, ${schicht.name}, ${schicht.naechste} ab ${schicht.ab}`}>
        <circle cx="50" cy="50" r="46" fill="#fff" stroke="#22262B" strokeWidth="3" />
        <g stroke="#8A9099" strokeWidth="2" strokeLinecap="round">
          <line x1="50" y1="9" x2="50" y2="15" /><line x1="91" y1="50" x2="85" y2="50" />
          <line x1="50" y1="91" x2="50" y2="85" /><line x1="9" y1="50" x2="15" y2="50" />
        </g>
        <line x1="50" y1="50" x2="50" y2="28" stroke="#22262B" strokeWidth="4.5" strokeLinecap="round" style={dreh((std % 12) * 30 + min * 0.5)} />
        <line x1="50" y1="50" x2="50" y2="18" stroke="#22262B" strokeWidth="3" strokeLinecap="round" style={dreh(min * 6 + sek * 0.1)} />
        <line x1="50" y1="56" x2="50" y2="16" stroke="#C97A2B" strokeWidth="1.4" strokeLinecap="round" style={dreh(sek * 6)} />
        <circle cx="50" cy="50" r="3" fill="#22262B" />
      </svg>
      <div style={{ minWidth: 0 }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-extrabold" style={{ fontSize: "1.15rem", letterSpacing: "-0.8px", fontVariantNumeric: "tabular-nums", color: "#22262B", lineHeight: 1 }}>{zeit}</span>
          <span style={{ fontSize: "0.6rem", fontWeight: 800, padding: "2px 8px", borderRadius: "var(--wk-eck-rund)", backgroundColor: schicht.bg, color: schicht.fg, whiteSpace: "nowrap" }}>
            {schicht.name.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: "0.66rem", fontWeight: 600, color: "#6B7480", marginTop: "3px", lineHeight: 1.25 }}>
          {datum} · {schicht.naechste} ab {schicht.ab}
        </div>
      </div>
    </div>
  );
}

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
// Feste Grundausstattung; eigene weitere Schichtarten kommen über den
// ⚙-Verwalten-Dialog dazu und sind IMMER grau (Farbschema ist fix:
// nur Früh/Spät/Nacht sind farbig).
const SCHICHT_GRAU = "#8A9099";
const SCHICHTEN_BASIS = {
  "Früh": { color: "#F0C230", text: "#2B2200", kurz: "F" },
  "Spät": { color: "#1F7A3D", kurz: "S" },
  "Spät mit B": { color: "#1F7A3D", kurz: "SB" },
  "Nacht": { color: "#2F6690", kurz: "N" },
  "Bereits.": { color: SCHICHT_GRAU, kurz: "B" },
  "Schule": { color: SCHICHT_GRAU, kurz: "Sch" },
  "Krank": { color: SCHICHT_GRAU, kurz: "K" },
  "Urlaub": { color: SCHICHT_GRAU, kurz: "U" },
  "Mainsite": { color: SCHICHT_GRAU, kurz: "M" },
};
// Kürzel für eigene Schichtarten: Anfangsbuchstaben der Wörter, sonst die ersten 2 Zeichen.
const schichtKurz = (name) => {
  const woerter = String(name).trim().split(/\s+/).filter(Boolean);
  const k = woerter.length > 1 ? woerter.map((w) => w[0]).join("") : String(name).trim().slice(0, 2);
  return k.slice(0, 3).toUpperCase();
};
const normalisiereExtraSchichten = (arr) => (Array.isArray(arr) ? arr : [])
  .map((s) => (typeof s === "string" ? { name: s } : s))
  .filter((s) => s && typeof s.name === "string" && s.name.trim() && !SCHICHTEN_BASIS[s.name.trim()])
  .map((s) => ({ name: s.name.trim(), kurz: (s.kurz || "").trim() || schichtKurz(s.name) }));
// Wer ganztags fehlt, bekommt in der Zelle kein ＋ (nichts einplanen)
const SCHICHT_ABWESEND = new Set(["Krank", "Urlaub", "Schule"]);

// Schichten für Störberichte (Auswahl beim Melden, wie im Schichtbuch)
const STOER_SCHICHTEN = ["Früh", "Spät", "Nacht"];
// Anlagenteile (pro Anlage) - werden im ⚙-Dialog gepflegt und in der Störungs-
// Maske ausgewählt. Struktur: { id, anlage, name }.
const normalisiereAnlagenteile = (arr) => (Array.isArray(arr) ? arr : [])
  .filter((t) => t && typeof t.name === "string" && t.name.trim() && typeof t.anlage === "string")
  .map((t) => ({
    id: typeof t.id === "string" && t.id ? t.id : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    anlage: t.anlage.trim(),
    name: t.name.trim(),
  }));

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

// Vorbefüllte Wissens-Angaben (Info / Rechtsgrundlage / Link) für die TPM-Übersicht.
// Bewusst NUR die klar gesetzlich/normativ geregelten Punkte - Umwelt/Abwasser (Landesrecht,
// Bescheide) und interne/Hersteller-Punkte bleiben leer und werden bei Bedarf im ⚙ ergänzt.
// Hinweis: Orientierungswerte, keine Rechtsberatung - im Betrieb gegenprüfen.
const RI_WISSEN_DEFAULTS = {
  regalkontrolle: {
    info: "Sichtprüfung aller Regalanlagen auf Verformungen, Anfahrschäden und Überlast durch eine befähigte Person. Beschädigte Regale können einstürzen – Schutz von Mitarbeitern und Ware.",
    rechtsgrundlage: "DGUV Regel 108-007, DIN EN 15635 (jährliche Prüfung durch befähigte Person)",
    link: "https://publikationen.dguv.de",
  },
  leiterkontrolle: {
    info: "Prüfung aller Leitern und Tritte auf sicheren Zustand (Sprossen, Beschläge, Spreizsicherung) vor der Weiterbenutzung.",
    rechtsgrundlage: "DGUV Information 208-016, BetrSichV §14 (Prüfung durch befähigte Person)",
    link: "https://publikationen.dguv.de",
  },
  filterwartung: {
    info: "Wartung der Filter und Kontrolle der Schaltschränke. Prüfung ortsfester elektrischer Anlagen und Betriebsmittel auf ordnungsgemäßen Zustand.",
    rechtsgrundlage: "DGUV Vorschrift 3, DIN VDE 0105-100",
    link: "https://publikationen.dguv.de",
  },
  trinkwasserfilter: {
    info: "Prüfung und Rückspülung des Trinkwasserfilters zur Erhaltung der Trinkwasserqualität und zum Schutz der Hausinstallation.",
    rechtsgrundlage: "TrinkwV, DIN EN 806-5, DIN 1988-200",
    link: "https://www.gesetze-im-internet.de/trinkwv_2023/",
  },
  sicherheitsrundgang: {
    info: "Begehung zum vorbeugenden Brandschutz: Flucht- und Rettungswege frei, Feuerlöscher und Brandschutztüren in Ordnung, keine Brandlasten an kritischen Stellen.",
    rechtsgrundlage: "ASR A2.2, DGUV Vorschrift 1, DGUV Information 205-001",
    link: "https://www.baua.de",
  },
  sprinklerwartung: {
    info: "Funktionskontrolle der Sprinkleranlage (Alarmventil, Wasserdruck, Strömungswächter) als Teil des anlagentechnischen Brandschutzes.",
    rechtsgrundlage: "VdS CEA 4001, DIN EN 12845",
    link: "https://www.vds.de",
  },
};
// Fehlende Wissens-Felder aus den Vorschlägen auffüllen (nur, wenn noch nie gesetzt).
// So erscheinen die Angaben auch in bestehenden Konfigurationen, ohne eigene Eingaben zu überschreiben.
const riMitWissen = (items) => (Array.isArray(items) ? items : []).map((r) => {
  const w = r && RI_WISSEN_DEFAULTS[r.id];
  if (!w) return r;
  const out = { ...r };
  if (out.info === undefined) out.info = w.info;
  if (out.rechtsgrundlage === undefined) out.rechtsgrundlage = w.rechtsgrundlage;
  if (out.link === undefined) out.link = w.link;
  return out;
});

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
const STOER_STORAGE_KEY = "werkstatt-stoerungen-entries"; // eigene Datei für Störungen (für alle beschreibbar)

// Gewerk eines Störberichts (Zuständigkeit)
const STOER_GEWERK = {
  mech: { label: "Mechanik", kurz: "🔧 Mechanik", color: "#2F6690", bg: "#E6EEF4" },
  elek: { label: "Elektrik", kurz: "⚡ Elektrik", color: "#C97A2B", bg: "#FBF3DA" },
  beide: { label: "Mechanik + Elektrik", kurz: "🔧⚡ Beide", color: "#6B4E9E", bg: "#EEE9F5" },
};
// Fehlerart-Kategorien (für Auswertung nach Fehlerbild)
const STOER_FEHLERARTEN = ["Mechanisch", "Elektrisch", "Hydraulisch", "Pneumatisch", "Steuerung/Software", "Verschleiß", "Bedienung", "Sonstiges"];

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

// "vor X Min." usw. für die "zuletzt aktualisiert"-Anzeige der gemeinsamen Datei.
function formatVorZeit(iso) {
  if (!iso) return null;
  const sek = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sek < 15) return "gerade eben";
  if (sek < 60) return `vor ${sek} Sek.`;
  const min = Math.round(sek / 60);
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.round(min / 60);
  return `vor ${std} Std.`;
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
  const [view, setView] = useState("COCKPIT"); // 'COCKPIT' | 'TPMINFO' | 'PLAN' | 'MONAT' | 'JAHR' | 'REGISTER' (TPMINFO = Übersicht, MONAT/JAHR = Auswertung, alles außer COCKPIT = Hauptbereich TPM)
  const [tpmInfoOffen, setTpmInfoOffen] = useState(null); // welcher R+I-Punkt in der TPM-Übersicht aufgeklappt ist (id oder null)
  const [nachweisJahr, setNachweisJahr] = useState(() => new Date().getFullYear()); // Zeitraum für den Prüfnachweis
  const [archivHinweis, setArchivHinweis] = useState(null); // { jahre, groesseKB, aeltestesJahr } sobald der Bestand alt genug ist
  const [archivGrenze, setArchivGrenze] = useState(null); // bis einschließlich welchem Jahr ausgelagert wird
  const [archivGesichert, setArchivGesichert] = useState(false); // Archivdatei wurde heruntergeladen
  const [entries, setEntries] = useState([]);
  const [tpmAnlagen, setTpmAnlagen] = useState(DEFAULT_TPM_ANLAGEN);
  const [riItems, setRiItems] = useState(riMitWissen(DEFAULT_RI_ITEMS));
  const [team, setTeam] = useState([]); // Werkstatt-Team (für Zuweisung & Arbeitsplanung)
  const [extraSchichten, setExtraSchichten] = useState([]); // eigene Schichtarten aus dem ⚙-Dialog (immer grau)
  const [anlagenteile, setAnlagenteile] = useState([]); // Anlagenteile pro Anlage (⚙-Dialog), für Störungs-Maske
  // Alle Schichtarten: feste Grundausstattung + eigene (grau). Der Name ist
  // zugleich der gespeicherte Wert - identisch zur bisherigen Logik.
  const SCHICHTEN = useMemo(() => {
    const out = { ...SCHICHTEN_BASIS };
    extraSchichten.forEach((s) => {
      if (!out[s.name]) out[s.name] = { color: SCHICHT_GRAU, kurz: s.kurz };
    });
    return out;
  }, [extraSchichten]);
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
  const [settingsSchichten, setSettingsSchichten] = useState([]); // eigene Schichtarten im ⚙-Dialog
  const [settingsAnlagenteile, setSettingsAnlagenteile] = useState([]); // Anlagenteile im ⚙-Dialog
  const [neuesTeilAnlage, setNeuesTeilAnlage] = useState(""); // Auswahl beim Anlegen eines Anlagenteils
  const [neuesTeilName, setNeuesTeilName] = useState("");
  const [neueSchichtName, setNeueSchichtName] = useState("");
  const [backups, setBackups] = useState([]); // lokale Sicherungen (Sicherheitsnetz), neueste zuerst
  const [verlauf, setVerlauf] = useState([]); // wer hat wann was geändert (aus der gemeinsamen Datei), neueste zuerst
  const [restoreConfirm, setRestoreConfirm] = useState(null); // Sicherung, die bestätigt werden muss
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
  const [blFilterOffen, setBlFilterOffen] = useState(false); // Filter-Menü der Backlog-Leiste
  const [arbeitModal, setArbeitModal] = useState(null); // null | {mode:'add', ausZettel?} | {mode:'edit', id}
  const [aDraft, setADraft] = useState(null);
  const [akteAnlage, setAkteAnlage] = useState(null); // Anlagen-Akte (Name) | null
  const [planungCursor, setPlanungCursor] = useState(() => new Date()); // Woche der Arbeitsplanung
  const [planungPicker, setPlanungPicker] = useState(null); // {person, datum} | null
  const [pickerArt, setPickerArt] = useState("ALLE"); // Filter im Einplanen-Popup: ALLE | mech | elek | azubi
  const [pickerSuche, setPickerSuche] = useState(""); // Suche im Einplanen-Popup
  const [schichtPicker, setSchichtPicker] = useState(null); // {person, datum} | null - Schicht setzen
  const [schichtGanzeWoche, setSchichtGanzeWoche] = useState(true); // Auswahl im Schicht-Dialog
  const [planNotiz, setPlanNotiz] = useState(null); // {person, datum, id?, text} | null - freie Notiz in Planungszelle
  const [sonstigeOffen, setSonstigeOffen] = useState(false); // Planung: Gruppe "Sonstige" (ohne Gewerk) aufgeklappt?
  const [matrixCursor, setMatrixCursor] = useState(() => new Date()); // Monat der Schichtplan-Matrix
  const [matrixPick, setMatrixPick] = useState(null); // {person, datum, links, oben} | null - Zellen-Dropdown
  // Pinnwand (Cockpit-Übersicht): neuer Zettel
  const [zettelOpen, setZettelOpen] = useState(false);
  const [zettelSuche, setZettelSuche] = useState(""); // Mini-Suche in der Pinnwand
  const [zettelText, setZettelText] = useState("");
  const [zettelName, setZettelName] = useState(() => localStorage.getItem("werkstatt-kalender-name") || "");
  const [shareErr, setShareErr] = useState(null); // bleibt stehen, bis das Speichern in die Datei wieder klappt
  const [shareInfo, setShareInfo] = useState(null); // grüne Hinweis-Meldung (z. B. Konfliktkopie eingesammelt), verschwindet von selbst
  const [shareChecked, setShareChecked] = useState(false); // erst true, wenn die Wiederverbindung beim Start geprüft wurde
  // Störungen: eigene, für alle beschreibbare Datei (getrennt von den Hauptdaten)
  const [stoerungen, setStoerungen] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STOER_STORAGE_KEY) || "[]"); } catch (e) { return []; }
  });
  const [stoerState, setStoerState] = useState({ status: "none" }); // none | unsupported | needs-permission | connected
  const [stoerChecked, setStoerChecked] = useState(false);
  const [stoerErr, setStoerErr] = useState(null); // Fehler der Störungen-Datei (eigener Banner)
  const [stoerModal, setStoerModal] = useState(null); // null | {mode:'add'} | {mode:'edit', id}
  const [sDraft, setSDraft] = useState(null); // Entwurf im Melden/Bearbeiten-Dialog
  const [stoerErledigteZeigen, setStoerErledigteZeigen] = useState(true); // Schichtbuch: behobene Berichte standardmäßig mit anzeigen
  const [stoerOffeneTage, setStoerOffeneTage] = useState(null); // aufgeklappte Datums-Gruppen (null = Vorgabe: neuester Tag offen)
  const [stoerOffeneSchichten, setStoerOffeneSchichten] = useState(() => new Set()); // aufgeklappte Schichten "datum|schicht"
  const [stoerModus, setStoerModus] = useState("liste"); // "liste" | "auswertung"
  const [stoerZeitraum, setStoerZeitraum] = useState("jahr"); // "monat" | "jahr" | "alle"
  const [stoerSuche, setStoerSuche] = useState(""); // Freitextsuche über alle Störberichte
  const [monitorOpen, setMonitorOpen] = useState(false); // Werkstatt-Monitor (Vollbild)
  const [monitorUhr, setMonitorUhr] = useState(() => new Date());

  // Gemeinsame Datei: beim Start wiederverbinden und auf Änderungen der anderen hören
  useEffect(() => {
    let cancelled = false;
    sharedFile.tryRestore().then((st) => { if (!cancelled) { setShareState(st); setShareChecked(true); } });
    const onUpdate = (ev) => {
      const d = ev.detail || {};
      // Zusammenführen statt Ersetzen: Ein sehr kurz zurückliegender eigener
      // Speicherstand (z. B. gerade eben bestätigt) darf durch einen von der
      // Datei abgeholten, minimal älteren Stand nicht stillschweigend aus der
      // Ansicht verschwinden - jeweils der neuere Zeitstempel je Eintrag gewinnt.
      if (Array.isArray(d.entries)) {
        setEntries((prev) => sharedFile.mergeEntries(d.entries, prev || [], d.deleted || {}));
      }
      if (Array.isArray(d.verlauf)) setVerlauf(d.verlauf);
      if (d.config) {
        if (Array.isArray(d.config.tpmAnlagen) && d.config.tpmAnlagen.length > 0) setTpmAnlagen(d.config.tpmAnlagen);
        if (Array.isArray(d.config.riItems) && d.config.riItems.length > 0) setRiItems(riMitWissen(d.config.riItems));
        if (Array.isArray(d.config.team)) setTeam(normalisiereTeam(d.config.team));
        if (Array.isArray(d.config.extraSchichten)) setExtraSchichten(normalisiereExtraSchichten(d.config.extraSchichten));
        if (Array.isArray(d.config.anlagenteile)) setAnlagenteile(normalisiereAnlagenteile(d.config.anlagenteile));
      }
    };
    const onShareError = (ev) => setShareErr(ev.detail || "Gemeinsame Datei: unbekannter Fehler.");
    const onShareOk = () => setShareErr(null);
    let infoTimer = null;
    const onShareInfo = (ev) => {
      setShareInfo(ev.detail || null);
      if (infoTimer) clearTimeout(infoTimer);
      infoTimer = setTimeout(() => setShareInfo(null), 15000);
    };
    window.addEventListener("werkstatt-shared-update", onUpdate);
    window.addEventListener("werkstatt-shared-error", onShareError);
    window.addEventListener("werkstatt-shared-ok", onShareOk);
    window.addEventListener("werkstatt-shared-info", onShareInfo);

    // ---- Störungen-Datei (eigene Instanz, gleiche Sync-Sicherheiten) ----
    sharedFile.stoer.tryRestore().then((st) => { if (!cancelled) { setStoerState(st); setStoerChecked(true); } });
    const onStoerUpdate = (ev) => {
      const d = ev.detail || {};
      if (Array.isArray(d.entries)) {
        setStoerungen((prev) => sharedFile.mergeEntries(d.entries, prev || [], d.deleted || {}));
      }
    };
    const onStoerError = (ev) => setStoerErr(ev.detail || "Störungen-Datei: unbekannter Fehler.");
    const onStoerOk = () => setStoerErr(null);
    window.addEventListener("werkstatt-stoer-update", onStoerUpdate);
    window.addEventListener("werkstatt-stoer-error", onStoerError);
    window.addEventListener("werkstatt-stoer-ok", onStoerOk);
    window.addEventListener("werkstatt-stoer-info", onShareInfo); // grüne Info teilt sich denselben Kanal

    return () => {
      cancelled = true;
      if (infoTimer) clearTimeout(infoTimer);
      window.removeEventListener("werkstatt-shared-update", onUpdate);
      window.removeEventListener("werkstatt-shared-error", onShareError);
      window.removeEventListener("werkstatt-shared-ok", onShareOk);
      window.removeEventListener("werkstatt-shared-info", onShareInfo);
      window.removeEventListener("werkstatt-stoer-update", onStoerUpdate);
      window.removeEventListener("werkstatt-stoer-error", onStoerError);
      window.removeEventListener("werkstatt-stoer-ok", onStoerOk);
      window.removeEventListener("werkstatt-stoer-info", onShareInfo);
    };
  }, []);

  const connectShared = async (opts) => {
    try {
      await sharedFile.pickShared(opts);
      // Ob bearbeitet werden darf, entscheiden die Datei-Rechte auf dem Laufwerk (IT-Freigabe).
      setShareState({ status: "connected", name: sharedFile.fileName(), mode: sharedFile.canWrite() ? "readwrite" : "read" });
      setShareChecked(true);
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
      setShareChecked(true);
      setErr(null);
    } catch (e) {
      setErr("Gemeinsame Datei: " + (e && e.message ? e.message : "Verbinden hat nicht geklappt."));
    }
  };
  const disconnectShared = async () => {
    await sharedFile.disconnect();
    setShareState({ status: sharedFile.isSupported() ? "none" : "unsupported" });
    setShareChecked(true);
    setShareOpen(false);
  };

  // ---- Störungen-Datei verbinden/trennen (eigene, für alle beschreibbare Datei) ----
  const connectStoer = async (opts) => {
    try {
      await sharedFile.stoer.pickShared(opts);
      setStoerState({ status: "connected", name: sharedFile.stoer.fileName(), mode: sharedFile.stoer.canWrite() ? "readwrite" : "read" });
      setStoerChecked(true);
      setStoerErr(null);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setStoerErr("Störungen-Datei: " + (e && e.message ? e.message : "Verbinden hat nicht geklappt."));
    }
  };
  const reconnectStoer = async () => {
    try {
      const st = await sharedFile.stoer.reconnect();
      setStoerState(st);
      setStoerChecked(true);
      setStoerErr(null);
    } catch (e) {
      setStoerErr("Störungen-Datei: " + (e && e.message ? e.message : "Verbinden hat nicht geklappt."));
    }
  };
  const disconnectStoer = async () => {
    await sharedFile.stoer.disconnect();
    setStoerState({ status: sharedFile.stoer.isSupported() ? "none" : "unsupported" });
    setStoerChecked(true);
  };

  // Nur wer NACHWEISLICH Schreibrechte auf die gemeinsame Datei hat (oder die
  // Funktion technisch gar nicht existiert, z. B. Firefox/Safari -> reiner
  // Solo-Betrieb) bekommt die volle App. ALLE anderen Fälle - insbesondere
  // "noch nicht verbunden" (frisch geöffnete App, Verbindung steht noch aus) -
  // gelten bewusst als Nur-Leser, bis das Gegenteil bewiesen ist. So sehen
  // reine Leser nie versehentlich für einen Moment die vollen Cockpit-Tabs.
  // "readwrite" zählt nur, wenn die Verbindung WIRKLICH steht - der Zustand
  // "nach Browser-Neustart getrennt" (needs-permission) trägt zwar den gemerkten
  // Modus, ist aber unbestätigt und gilt deshalb als Nur-Lesen, bis der Nutzer
  // auf "Jetzt verbinden" klickt und die Schreibrechte erneut bewiesen sind.
  const vollzugriff = shareChecked && (shareState.status === "unsupported" || (shareState.status === "connected" && shareState.mode === "readwrite"));
  const readerMode = !vollzugriff;
  // Enger gefasst als readerMode: nur wer TATSÄCHLICH schon verbunden UND
  // bestätigt Nur-Lesen ist. Wichtig für den "Gemeinsame Datei"-Knopf selbst -
  // der muss sichtbar bleiben, bevor überhaupt verbunden wurde (sonst könnte
  // sich niemand jemals verbinden).
  const confirmedReadOnly = shareChecked && shareState.status === "connected" && shareState.mode === "read";

  // ---- Störungen: Zugriff & Speichern (unabhängig von readerMode!) ----
  // Störungen dürfen ALLE bearbeiten - auch reine Leser der Hauptdaten. Maßgeblich
  // ist allein die Störungen-Datei: verbunden mit Schreibrecht ODER technisch ohne
  // Datei-Funktion (Solo/Firefox -> lokal). Sonst nur ansehen.
  const stoerConnected = stoerState.status === "connected";
  const stoerDarfSchreiben = stoerChecked && (stoerState.status === "unsupported" || (stoerConnected && stoerState.mode === "readwrite"));
  const stoerNurLesen = stoerConnected && stoerState.mode === "read";
  const persistStoer = async (next) => {
    const prev = stoerungen;
    setStoerungen(next);
    try { localStorage.setItem(STOER_STORAGE_KEY, JSON.stringify(next)); } catch (e) { /* voll o.ä. */ }
    if (sharedFile.stoer.isConnected() && sharedFile.stoer.canWrite()) {
      try {
        const merged = await sharedFile.stoer.saveEntries(next, prev);
        if (merged) {
          try { localStorage.setItem(STOER_STORAGE_KEY, JSON.stringify(merged)); } catch (e) { /* egal */ }
          setStoerungen(merged);
        }
      } catch (e) {
        setStoerErr("Störung konnte nicht in der gemeinsamen Datei gespeichert werden (Datei erreichbar?). Lokal ist alles gesichert.");
      }
    }
  };
  // Eine Störung anlegen/ändern/löschen (Kürzel wird wie bei der Pinnwand gemerkt)
  const speichereStoerung = async (draft) => {
    const jetzt = new Date().toISOString();
    const melder = String(draft.melder || "").trim();
    if (melder) localStorage.setItem("werkstatt-kalender-name", melder);
    const offen = draft.status === "offen";
    const datum = draft.date || jetzt.slice(0, 10);
    const ausfallzeit = Math.max(0, Math.round(Number(draft.ausfallzeit) || 0));
    // Behoben-am: bei Erledigt aus dem Feld (falls gesetzt), sonst vorheriger Wert / jetzt
    const behobenAusFeld = () => {
      if (offen) return null;
      if (draft.behobenAt) { const d = new Date(draft.behobenAt); if (!isNaN(d)) return d.toISOString(); }
      return null;
    };
    const gemeinsam = {
      date: datum, schicht: draft.schicht || "Früh",
      anlage: draft.anlage, anlagenteil: draft.anlagenteil || "",
      gewerk: draft.gewerk || "", fehlerart: draft.fehlerart || "",
      stoerung: draft.stoerung, ursache: draft.ursache || "",
      getan: draft.getan || "", nochZuTun: offen ? (draft.nochZuTun || "") : "",
      ersatzteile: draft.ersatzteile || "", nachbestellt: !!draft.nachbestellt,
      ausfallzeit, melder,
    };
    if (draft.id) {
      const vorher = stoerungen.find((s) => s.id === draft.id);
      const behobenAt = offen ? null : (behobenAusFeld() || (vorher && vorher.behobenAt) || jetzt);
      const next = stoerungen.map((s) => (s.id === draft.id ? { ...s, ...gemeinsam, offen, behobenAt } : s));
      await persistStoer(next);
    } else {
      const s = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...gemeinsam,
        offen, gemeldetAt: jetzt, behobenAt: offen ? null : (behobenAusFeld() || jetzt),
      };
      await persistStoer([...stoerungen, s]);
    }
    setStoerModal(null);
    setSDraft(null);
  };
  const stoerStatusUmschalten = async (id) => {
    const jetzt = new Date().toISOString();
    await persistStoer(stoerungen.map((s) => (s.id === id
      ? { ...s, offen: !s.offen, behobenAt: !s.offen ? null : (s.behobenAt || jetzt), nochZuTun: !s.offen ? s.nochZuTun : "" }
      : s)));
  };
  const loescheStoerung = async (id) => {
    if (!window.confirm("Diese Störung wirklich löschen?")) return;
    await persistStoer(stoerungen.filter((s) => s.id !== id));
    setStoerModal(null);
    setSDraft(null);
  };
  // Offene "Zu Planende Maßnahme" als Backlog-Aufgabe übernehmen (nur mit Schreibrecht auf die Hauptdaten)
  const stoerungZuBacklog = (s) => {
    if (readerMode) return;
    openArbeitNeu({
      anlage: s.anlage || "",
      note: s.nochZuTun || s.stoerung || "",
      melder: s.melder || "",
      art: s.gewerk === "elek" ? "elek" : "mech",
    });
    setStoerModal(null);
    setSDraft(null);
  };
  // Störbericht als sauberes A4-Blatt in einem eigenen Fenster drucken
  const druckeStoerbericht = (s) => {
    const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const dt = (iso) => iso ? new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    const g = STOER_GEWERK[s.gewerk];
    const zeile = (lab, val) => val && String(val).trim() ? `<tr><th>${esc(lab)}</th><td>${esc(val).replace(/\n/g, "<br>")}</td></tr>` : "";
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Störbericht – ${esc(s.anlage)}</title>
      <style>
        @page { size: A4 portrait; margin: 18mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2430; font-size: 12pt; }
        h1 { font-size: 18pt; margin: 0 0 2mm; }
        .kopf { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #22262B; padding-bottom: 3mm; margin-bottom: 5mm; }
        .status { font-weight: 700; padding: 1mm 4mm; border-radius: 4mm; border: 1.5pt solid; font-size: 10pt; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; vertical-align: top; padding: 2.5mm 3mm; border-bottom: 0.5pt solid #C4CBD2; }
        th { width: 45mm; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #5B6572; }
        td { font-weight: 500; }
        .fuss { margin-top: 10mm; display: flex; justify-content: space-between; color: #5B6572; font-size: 10pt; }
        .sign { margin-top: 16mm; display: flex; gap: 12mm; }
        .sign div { flex: 1; border-top: 0.75pt solid #22262B; padding-top: 1.5mm; font-size: 9pt; color: #5B6572; }
      </style></head><body>
      <div class="kopf">
        <div><h1>Störbericht</h1><div>${esc(s.anlage) || "—"}${s.anlagenteil ? " · " + esc(s.anlagenteil) : ""}</div></div>
        <div class="status" style="color:${s.offen ? "#C0392B" : "#1F7A3D"};border-color:${s.offen ? "#C0392B" : "#1F7A3D"}">${s.offen ? "OFFEN" : "BEHOBEN"}</div>
      </div>
      <table>
        ${zeile("Datum", s.date ? formatDateDE(s.date) : "")}
        ${zeile("Schicht", s.schicht)}
        ${zeile("Gewerk", g ? g.label : "")}
        ${zeile("Fehlerart", s.fehlerart)}
        ${zeile("Ausfallzeit", (Number(s.ausfallzeit) || 0) > 0 ? minutenText(s.ausfallzeit) : "")}
        ${zeile("Störungs Beschreibung", s.stoerung)}
        ${zeile("Störungs Ursache", s.ursache)}
        ${zeile("Sofort Maßnahme", s.getan)}
        ${zeile("Ersatzteile / Material", s.ersatzteile ? s.ersatzteile + (s.nachbestellt ? " (nachbestellt)" : "") : "")}
        ${s.offen ? zeile("Zu Planende Maßnahme", s.nochZuTun) : ""}
      </table>
      <div class="fuss">
        <span>Bearbeiter: <strong>${esc(s.melder) || "—"}</strong></span>
        <span>Erfasst: ${dt(s.gemeldetAt)}${!s.offen && s.behobenAt ? " · Behoben: " + dt(s.behobenAt) : ""}</span>
      </div>
      <div class="sign"><div>Datum / Unterschrift Bearbeiter</div><div>Datum / Unterschrift Werkstattleitung</div></div>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { setStoerErr("Zum Drucken bitte Popups für diese Seite erlauben."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (e) { /* Nutzer kann manuell drucken */ } }, 300);
  };
  // Auswählbare Zeiträume für den Nachweis: alle Jahre, für die überhaupt
  // R+I-Termine vorliegen, dazu immer das laufende Jahr.
  const nachweisJahre = React.useMemo(() => {
    const js = new Set([new Date().getFullYear()]);
    entries.forEach((e) => {
      if (e.category === "RI" && typeof e.date === "string" && e.date.length >= 4) js.add(Number(e.date.slice(0, 4)));
    });
    return [...js].filter((j) => j > 2000 && j < 2200).sort((a, b) => b - a);
  }, [entries]);

  // Nachweis der wiederkehrenden Prüfungen (R+I) für ein Jahr - zum Vorlegen
  // bei einer Prüfung. Bewusst nüchtern: je Punkt die Rechtsgrundlage, alle
  // erledigten Termine mit Datum und was offen blieb. Nichts beschönigen -
  // ein Nachweis, der Lücken verschweigt, ist wertlos.
  const druckeNachweis = (jahr) => {
    const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    // WICHTIG: Die Soll-Termine stehen nicht als Einträge im Bestand - sie
    // ergeben sich aus dem Rhythmus und werden hier genauso berechnet wie im
    // Kalender. Würde man nur die vorhandenen Einträge zählen, meldete der
    // Nachweis "vollständig", obwohl in Wahrheit nichts erledigt wurde.
    const feiertage = getHolidays(jahr);
    const sollJeName = new Map(); // Name -> [Datum, ...]
    for (let m = 0; m < 12; m++) {
      riOccurrencesInMonth(riItems, jahr, m, feiertage).forEach(({ day, name }) => {
        const k = dateKey(jahr, m, day);
        if (!sollJeName.has(name)) sollJeName.set(name, []);
        sollJeName.get(name).push(k);
      });
    }
    const riEintraege = entries.filter((e) => e.category === "RI" && String(e.date || "").slice(0, 4) === String(jahr));
    const erledigtAn = new Set(riEintraege.filter((e) => e.status === "done").map((e) => e.name + "|" + e.date));

    const bloecke = riItems.map((r) => {
      const soll = (sollJeName.get(r.name) || []).sort();
      // Nur was bereits fällig war, darf bewertet werden. Ein Termin im
      // Dezember ist im September kein Versäumnis - ihn als "offen" zu
      // führen, würde jeden laufenden Jahrgang künstlich schlechtreden.
      const faellig = soll.filter((d) => d <= todayKey);
      const kuenftig = soll.length - faellig.length;
      // Zusätzlich abgehakte Termine, die außerhalb des Rhythmus liegen
      // (nachträglich erfasst) - die gehören in den Nachweis, nicht unter den Tisch.
      const zusaetzlich = riEintraege
        .filter((e) => e.name === r.name && e.status === "done" && !soll.includes(e.date))
        .map((e) => e.date);
      const erledigt = [...faellig.filter((d) => erledigtAn.has(r.name + "|" + d)), ...zusaetzlich].sort();
      const offen = faellig.filter((d) => !erledigtAn.has(r.name + "|" + d));
      return { r, erledigt, offen, kuenftig, geplant: faellig.length };
    }).filter((b) => b.geplant > 0 || b.erledigt.length > 0 || b.kuenftig > 0);
    // Lange Datumsketten machen den Nachweis unlesbar. Erledigtes wird
    // vollständig belegt (das ist der Nachweis), Versäumtes gekürzt
    // aufgeführt - die Anzahl daneben bleibt immer vollständig.
    const kette = (liste, max) => {
      if (liste.length === 0) return "";
      const gezeigt = liste.slice(0, max).map((d) => formatDateDE(d)).join(" · ");
      return liste.length > max ? `${gezeigt} <span class="mehr">… und ${liste.length - max} weitere</span>` : gezeigt;
    };

    const zeilen = bloecke.map(({ r, erledigt, offen, kuenftig, geplant }) => {
      const vollstaendig = geplant > 0 && offen.length === 0;
      const farbe = vollstaendig ? "#1F7A3D" : offen.length > 0 ? "#B23A34" : "#8A9099";
      const urteil = geplant === 0 ? "noch nicht fällig" : vollstaendig ? "vollständig" : `${offen.length} versäumt`;
      return `<tr>
        <td class="pkt">
          <div class="name">${esc(r.name)}</div>
          <div class="rhy">${esc(RI_TYPE_LABELS[r.type] || r.type || "")}${kuenftig > 0 ? ` · ${kuenftig} noch nicht fällig` : ""}</div>
          ${r.rechtsgrundlage ? `<div class="rg">${esc(r.rechtsgrundlage)}</div>` : ""}
        </td>
        <td class="dat">${erledigt.length ? kette(erledigt, 40) : "<i>keine</i>"}</td>
        <td class="dat off">${offen.length ? kette(offen, 12) : "—"}</td>
        <td class="urteil" style="color:${farbe}">${esc(urteil)}<div class="quote">${geplant > 0 ? erledigt.length + " / " + geplant : ""}</div></td>
      </tr>`;
    }).join("");

    const gesamtGeplant = bloecke.reduce((s, b) => s + b.geplant, 0);
    const gesamtErledigt = bloecke.reduce((s, b) => s + b.erledigt.length, 0);
    const gesamtKuenftig = bloecke.reduce((s, b) => s + b.kuenftig, 0);
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
      <title>Nachweis wiederkehrender Prüfungen ${esc(jahr)}</title><style>
      @page { size: A4 portrait; margin: 15mm 14mm; }
      body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #22262B; font-size: 10pt; margin: 0; }
      .kopf { border-bottom: 2.5px solid #22262B; padding-bottom: 9px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: flex-end; }
      h1 { font-size: 15pt; margin: 0 0 2px; }
      .unter { font-size: 8.5pt; color: #6B7480; }
      .jahr { font-size: 22pt; font-weight: 800; letter-spacing: -1px; }
      .summe { margin: 10px 0 12px; padding: 7px 10px; background: #F1F3F5; border-radius: 6px; font-size: 9pt; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .7px; color: #6B7480; border-bottom: 1px solid #C3C7CB; padding: 0 6px 4px 0; }
      td { vertical-align: top; padding: 7px 6px 7px 0; border-bottom: 1px solid #E8EAED; }
      tr { break-inside: avoid; }
      .pkt { width: 32%; }
      .name { font-weight: 700; }
      .rhy { font-size: 8pt; color: #6B7480; }
      .rg { font-size: 7.5pt; color: #2F6690; margin-top: 2px; }
      .dat { font-size: 8.5pt; line-height: 1.55; width: 26%; }
      .off { color: #B23A34; }
      .urteil { width: 16%; font-size: 8.5pt; font-weight: 700; text-align: right; }
      .quote { font-weight: 400; color: #8A9099; font-size: 8pt; }
      .mehr { color: #8A9099; font-style: italic; }
      .fuss { margin-top: 14px; padding-top: 8px; border-top: 1px solid #C3C7CB; font-size: 7.5pt; color: #6B7480; }
      .sign { margin-top: 26px; display: flex; gap: 26px; }
      .sign div { flex: 1; border-top: 1px solid #22262B; padding-top: 4px; font-size: 8pt; color: #6B7480; }
      </style></head><body>
      <div class="kopf">
        <div><h1>Nachweis wiederkehrender Prüfungen</h1>
        <div class="unter">Rundgänge und Inspektionen (R+I) · Werkstatt-Cockpit</div></div>
        <div class="jahr">${esc(jahr)}</div>
      </div>
      <div class="summe"><strong>${gesamtErledigt} von ${gesamtGeplant}</strong> bis heute fälligen Terminen erledigt${gesamtGeplant - gesamtErledigt > 0 ? ` · <strong style="color:#B23A34">${gesamtGeplant - gesamtErledigt} versäumt</strong>` : " · vollständig"}${gesamtKuenftig > 0 ? ` · ${gesamtKuenftig} im Zeitraum noch nicht fällig` : ""}</div>
      <table>
        <thead><tr><th>Prüfpunkt / Rechtsgrundlage</th><th>Erledigt am</th><th>Versäumt (fällig, nicht erledigt)</th><th style="text-align:right">Stand</th></tr></thead>
        <tbody>${zeilen || '<tr><td colspan="4"><i>Für diesen Zeitraum liegen keine Einträge vor.</i></td></tr>'}</tbody>
      </table>
      <div class="fuss">Erstellt am ${formatDateDE(todayKey)} aus dem Werkstatt-Cockpit. Grundlage sind die im System erfassten Termine; dieser Ausdruck gibt den Stand zum Erstellungszeitpunkt wieder.</div>
      <div class="sign"><div>Datum / Unterschrift Werkstattleitung</div><div>Datum / Unterschrift Prüfer</div></div>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { setErr("Zum Drucken bitte Popups für diese Seite erlauben."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (e) { /* Nutzer kann manuell drucken */ } }, 300);
  };

  // Sortierung: offene zuerst, darin neueste zuerst
  const stoerungenSortiert = [...stoerungen].sort((a, b) => {
    if (!!a.offen !== !!b.offen) return a.offen ? -1 : 1;
    return String(b.gemeldetAt || b.date).localeCompare(String(a.gemeldetAt || a.date));
  });
  const stoerOffenCount = stoerungen.filter((s) => s.offen).length;
  const stoerOffeneListe = stoerungenSortiert.filter((s) => s.offen); // für die Übersicht-Gedankenstütze
  // Freitextsuche über alle Berichte (Anlage/Teil/Beschreibung/Ursache/Maßnahme/Teile/Bearbeiter/Fehlerart)
  const stoerSucheAktiv = stoerSuche.trim().length > 0;
  const stoerTreffer = (() => {
    if (!stoerSucheAktiv) return null;
    const q = stoerSuche.trim().toLowerCase();
    return stoerungenSortiert.filter((s) => [s.anlage, s.anlagenteil, s.stoerung, s.ursache, s.getan, s.nochZuTun, s.ersatzteile, s.melder, s.fehlerart, STOER_GEWERK[s.gewerk]?.label]
      .some((v) => String(v || "").toLowerCase().includes(q)));
  })();

  // Ausfallzeit immer in Minuten anzeigen (Wunsch: durchgängig Minuten)
  const minutenText = (min) => `${Math.max(0, Math.round(Number(min) || 0))} min`;
  // ISO -> Wert für <input type="datetime-local"> (lokale Zeit)
  const isoZuLocalInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso); if (isNaN(d)) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const summeAusfall = (liste) => liste.reduce((sum, s) => sum + (Number(s.ausfallzeit) || 0), 0);

  // ---- Schichtbuch-Gruppierung: nach Datum, darin nach Schicht (Früh/Spät/Nacht) ----
  const stoerSichtbar = stoerungenSortiert.filter((s) => s.offen || stoerErledigteZeigen);
  const stoerGruppen = (() => {
    const proTag = new Map();
    stoerSichtbar.forEach((s) => {
      const d = s.date || "—";
      if (!proTag.has(d)) proTag.set(d, []);
      proTag.get(d).push(s);
    });
    // innerhalb einer Schicht nach Uhrzeit sortieren (frühestes zuerst)
    const nachZeit = (arr) => [...arr].sort((a, b) => String(a.gemeldetAt || "").localeCompare(String(b.gemeldetAt || "")));
    return Array.from(proTag.keys())
      .sort((a, b) => String(b).localeCompare(String(a)))
      .map((d) => {
        const liste = proTag.get(d);
        const proSchicht = STOER_SCHICHTEN.map((sch) => ({ sch, liste: nachZeit(liste.filter((s) => s.schicht === sch)) }));
        const ohne = nachZeit(liste.filter((s) => !STOER_SCHICHTEN.includes(s.schicht)));
        if (ohne.length) proSchicht.push({ sch: "—", liste: ohne });
        return {
          datum: d, liste,
          proSchicht: proSchicht.filter((x) => x.liste.length > 0).map((x) => ({ ...x, ausfall: summeAusfall(x.liste), offen: x.liste.filter((s) => s.offen).length })),
          offen: liste.filter((s) => s.offen).length,
          ausfall: summeAusfall(liste),
        };
      });
  })();
  const istTagOffen = (d, idx) => (stoerOffeneTage === null ? idx === 0 : stoerOffeneTage.has(d));
  const toggleStoerTag = (d) => setStoerOffeneTage((prev) => {
    const basis = prev === null ? new Set(stoerGruppen[0] ? [stoerGruppen[0].datum] : []) : new Set(prev);
    if (basis.has(d)) basis.delete(d); else basis.add(d);
    return basis;
  });
  const schichtSchluessel = (d, sch) => `${d}|${sch}`;
  const istSchichtOffen = (d, sch) => stoerOffeneSchichten.has(schichtSchluessel(d, sch));
  const toggleStoerSchicht = (d, sch) => setStoerOffeneSchichten((prev) => {
    const next = new Set(prev);
    const k = schichtSchluessel(d, sch);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  // Detailansicht (Popout) einer Störung öffnen - zunächst nur lesend
  const oeffneStoerDetail = (s) => {
    setSDraft({ id: s.id, date: s.date || todayKey, schicht: s.schicht || "", anlage: s.anlage || "", anlagenteil: s.anlagenteil || "", gewerk: s.gewerk || "", fehlerart: s.fehlerart || "", stoerung: s.stoerung || "", ursache: s.ursache || "", getan: s.getan || "", nochZuTun: s.nochZuTun || "", ersatzteile: s.ersatzteile || "", nachbestellt: !!s.nachbestellt, ausfallzeit: s.ausfallzeit ?? "", behobenAt: isoZuLocalInput(s.behobenAt), status: s.offen ? "offen" : "erledigt", melder: s.melder || "" });
    setStoerModal({ mode: "view", id: s.id });
  };

  // ---- Zeilen des Schichtbuchs -------------------------------------------
  // Alles steht in EINER Tabelle mit festen Spalten - Tag, Schicht und Bericht
  // sind nur unterschiedlich gestaltete Zeilen darin. Vorher war jeder Tag eine
  // eigene Kachel mit eigenem Rahmen, und die Angaben hingen rechts aneinander:
  // mal mit Minuten, mal ohne, mal mit "1 offen" dazwischen. Dass die
  // Tagessumme jetzt in derselben Spalte steht wie die Einzelwerte, ist der
  // ganze Unterschied - das Auge kann senkrecht durchlaufen.
  const stoerTdBasis = { padding: "0 8px", height: "26px", borderBottom: "1px solid #EEF0F2", verticalAlign: "middle", whiteSpace: "nowrap" };
  const stoerKopfzeile = (ersteSpalte) => {
    const th = { fontSize: "0.57rem", textTransform: "uppercase", letterSpacing: "0.9px", color: "#8A9099", fontWeight: 800, textAlign: "left", padding: "6px 8px", borderBottom: "1.5px solid #D7DCE1", background: "#FAFBFC", whiteSpace: "nowrap" };
    return (
      <tr>
        <th style={{ ...th, width: "116px" }}>{ersteSpalte}</th>
        <th style={{ ...th, width: "168px" }}>Anlage · Teil</th>
        <th style={th}>Störbeschreibung</th>
        <th style={{ ...th, width: "82px", textAlign: "right" }}>Ausfallzeit</th>
        <th style={{ ...th, width: "96px" }}>Bearbeiter</th>
        <th style={{ ...th, width: "76px" }}>Status</th>
      </tr>
    );
  };
  const stoerZeileTabelle = (s, mitDatum = false) => {
    const zeit = s.gemeldetAt ? new Date(s.gemeldetAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "--:--";
    return (
      <tr key={s.id} onClick={() => oeffneStoerDetail(s)} className="wk-hover" style={{ cursor: "pointer" }} title="Bericht öffnen">
        <td style={{ ...stoerTdBasis, paddingLeft: mitDatum ? "10px" : "38px" }}>
          <span className="font-mono" style={{ fontSize: "0.68rem", color: "#8A9099" }}>{mitDatum ? (s.date ? formatDateDE(s.date) : "—") : zeit}</span>
        </td>
        <td style={stoerTdBasis}>
          <span className="font-extrabold" style={{ fontSize: "0.75rem", color: "#22262B" }}>{s.anlage || "—"}</span>
          {s.anlagenteil && <span style={{ fontSize: "0.68rem", color: "#8A9099" }}> · {s.anlagenteil}</span>}
        </td>
        <td style={{ ...stoerTdBasis, whiteSpace: "normal", fontSize: "0.75rem", color: "#3d4650" }}>
          {s.stoerung || <span className="italic" style={{ color: "#B7BEC6" }}>—</span>}
        </td>
        <td style={{ ...stoerTdBasis, textAlign: "right" }}>
          <span className="font-mono font-bold" style={{ fontSize: "0.72rem", color: (Number(s.ausfallzeit) || 0) > 0 ? "#22262B" : "#C4CBD2" }}>
            {(Number(s.ausfallzeit) || 0) > 0 ? Math.round(Number(s.ausfallzeit)) : "–"}
          </span>
        </td>
        <td style={{ ...stoerTdBasis, fontSize: "0.72rem", color: "#3d4650" }}>{s.melder || <span style={{ color: "#C4CBD2" }}>–</span>}</td>
        <td style={stoerTdBasis}>
          <span className="inline-flex items-center rounded-full font-extrabold" style={{ fontSize: "0.58rem", padding: "1px 7px", backgroundColor: s.offen ? "#FBEAE8" : "#EDF0F3", color: s.offen ? "#B23A34" : "#6B7480" }}>
            {s.offen ? "offen" : "behoben"}
          </span>
        </td>
      </tr>
    );
  };

  // Sicherheits-Klammer: solange (noch) Nur-Leser, ist ausschließlich Übersicht,
  // Schichtplan, Planung oder TPM-Plan erlaubt - jede andere Ansicht wird sofort
  // auf Übersicht zurückgesetzt (z. B. falls Schreibrechte während der Sitzung
  // wegfallen, oder direkt beim allerersten Laden, bevor überhaupt geprüft ist).
  useEffect(() => {
    if (!readerMode) return;
    if (view !== "COCKPIT" && view !== "PLAN" && view !== "TPMINFO") { setView("COCKPIT"); setCockpitTab("UEBERSICHT"); return; }
    // Störungen sind bewusst auch für Nur-Leser erlaubt (eigene, für alle
    // beschreibbare Datei) - daher hier mit aufgeführt.
    if (view === "COCKPIT" && !["UEBERSICHT", "SCHICHTPLAN", "PLANUNG", "STOERUNGEN"].includes(cockpitTab)) setCockpitTab("UEBERSICHT");
  }, [readerMode, view, cockpitTab]);

  // ...html?monitor=1 kennzeichnet ein dediziertes Kiosk-Gerät (Bildschirm in der
  // Werkstatt ohne eigenen Arbeitsplatz). NUR dort ist der Werkstatt-Monitor auch
  // für Nur-Leser erreichbar - ein normaler Leser (Kollege am eigenen PC) soll
  // weiterhin ausschließlich den Plan sehen, wie ursprünglich festgelegt.
  const kioskMonitor = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("monitor") === "1";
  // ...html?verwalten=1: blendet im Schreibschutz-Banner die Rettungs-Knöpfe ein
  // (Schreibzugriff erneut versuchen / Andere Datei wählen) - für den Fall, dass
  // ein BEARBEITER fälschlich im Schreibschutz gelandet ist. Normale Leser sehen
  // diese Knöpfe nicht (zu verlockend).
  const rettungsModus = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("verwalten") === "1";

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
            if (validRi.length > 0) setRiItems(riMitWissen(validRi));
          }
          if (Array.isArray(parsed.team)) {
            setTeam(normalisiereTeam(parsed.team));
          }
          if (Array.isArray(parsed.extraSchichten)) {
            setExtraSchichten(normalisiereExtraSchichten(parsed.extraSchichten));
          }
          if (Array.isArray(parsed.anlagenteile)) {
            setAnlagenteile(normalisiereAnlagenteile(parsed.anlagenteile));
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

  const persistConfig = async (nextTpm, nextRi, nextTeam = team, nextExtraSchichten = extraSchichten, nextAnlagenteile = anlagenteile) => {
    if (readerMode) return; // letzte Sicherheitsebene - Nur-Leser dürfen nie irgendetwas schreiben
    setTpmAnlagen(nextTpm);
    setRiItems(nextRi);
    setTeam(nextTeam);
    setExtraSchichten(nextExtraSchichten);
    setAnlagenteile(nextAnlagenteile);
    const attempt = async (retriesLeft) => {
      try {
        const result = await window.storage.set(
          CONFIG_STORAGE_KEY,
          JSON.stringify({ tpmAnlagen: nextTpm, riItems: nextRi, team: nextTeam, extraSchichten: nextExtraSchichten, anlagenteile: nextAnlagenteile }),
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
    setSettingsSchichten(extraSchichten.map((s) => ({ ...s })));
    setSettingsAnlagenteile(anlagenteile.map((t) => ({ ...t })));
    setNeueSchichtName("");
    setNeuesTeilAnlage("");
    setNeuesTeilName("");
    setSettingsOpen(true);
    sharedFile.listBackups().then(setBackups).catch(() => setBackups([]));
    sharedFile.readLog().then(setVerlauf).catch(() => setVerlauf([]));
  };

  // Sicherung wiederherstellen (Sicherheitsnetz gegen Datenverlust): ersetzt
  // den aktuellen Stand durch den einer früheren, lokal gesicherten Version.
  const restoreBackup = async (backup) => {
    await persist(backup.entries || []);
    if (backup.config) {
      const { tpmAnlagen: bTpm, riItems: bRi, team: bTeam, extraSchichten: bExtra, anlagenteile: bTeile } = backup.config;
      await persistConfig(bTpm || [], bRi || [], bTeam || [], normalisiereExtraSchichten(bExtra), normalisiereAnlagenteile(bTeile));
    }
    setRestoreConfirm(null);
    setSettingsOpen(false);
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

    // Anlagenteile umbenannter Anlagen mitziehen
    const teileMitRename = settingsAnlagenteile.map((t) => (tpmRenames.has(t.anlage) ? { ...t, anlage: tpmRenames.get(t.anlage) } : t));
    await persistConfig(cleanTpm, cleanRi, cleanTeam, normalisiereExtraSchichten(settingsSchichten), normalisiereAnlagenteile(teileMitRename));
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

  // Schichtplan-Matrix: beim Öffnen (bzw. wenn der aktuelle Monat angezeigt wird)
  // automatisch so weit nach rechts scrollen, dass die aktuelle Woche direkt
  // neben der Namensspalte steht - nicht erst ab dem 1. des Monats.
  const matrixScrollRef = useRef(null);
  useEffect(() => {
    const container = matrixScrollRef.current;
    if (!container) return;
    const istAktuellerMonat = matrixCursor.getFullYear() === today.getFullYear() && matrixCursor.getMonth() === today.getMonth();
    if (!istAktuellerMonat) { container.scrollLeft = 0; return; }
    const montag = montagVon(todayKey);
    const zielKey = dateKey(montag.getFullYear(), montag.getMonth(), montag.getDate());
    const zielEl = container.querySelector(`[data-daykey="${zielKey}"]`);
    if (zielEl) {
      // Exakt bündig statt Schätzwert: Die echte Breite der (sticky) Namensspalte
      // messen, damit die Montags-Spalte direkt an der Namensspalte anliegt.
      const nameZelle = container.querySelector("thead th");
      const nameBreite = nameZelle ? nameZelle.getBoundingClientRect().width : 110;
      container.scrollLeft = Math.max(0, zielEl.offsetLeft - nameBreite);
    }
  }, [matrixCursor, cockpitTab, view, team.length]);

  // Planung (Tage untereinander): beim Öffnen der aktuellen Woche direkt zum
  // heutigen Tages-Block springen, statt oben bei Montag anzufangen.
  useEffect(() => {
    if (view !== "COCKPIT" || cockpitTab !== "PLANUNG") return;
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-planungstag="${todayKey}"]`);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110 });
    }, 60);
    return () => clearTimeout(t);
  }, [view, cockpitTab, planungCursor, team.length]);

  const persist = async (next) => {
    if (readerMode) return; // letzte Sicherheitsebene - Nur-Leser dürfen nie irgendetwas schreiben
    setEntries(next);
    const attempt = async (retriesLeft) => {
      try {
        const result = await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
        if (!result) throw new Error("Kein Ergebnis vom Speicher");
        setErr(null);
        return true;
      } catch (e) {
        // Ein voller Zwischenspeicher geht durch Warten nicht weg - dann sofort
        // die echte Ursache melden statt zwei Mal vergeblich zu wiederholen.
        const voll = /Zwischenspeicher|quota|QuotaExceeded/i.test(String(e && e.message));
        if (retriesLeft > 0 && !voll) {
          await new Promise((r) => setTimeout(r, 900));
          return attempt(retriesLeft - 1);
        }
        setErr(voll
          ? String(e.message)
          : "Speichern klappt gerade nicht (evtl. kurzzeitig überlastet). Bitte kurz warten und nochmal versuchen.");
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
  // Termintreue der letzten 12 Monate bis zum betrachteten Monat.
  // Monate ganz ohne Termine bekommen bewusst KEINE 0 %, sondern gar keinen
  // Wert - null Termine sind keine schlechte Quote, sondern keine Aussage.
  const termintreueVerlauf = useMemo(() => {
    const reihe = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(year, month - i, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const imMonat = visibleEntries.filter((e) => String(e.date || "").startsWith(prefix));
      const erledigt = imMonat.filter((e) => e.status === "done").length;
      const basis = imMonat.filter((e) => e.status === "done" || e.status === "open").length;
      reihe.push({
        key: prefix,
        label: MONTHS[d.getMonth()].slice(0, 3),
        jahr: d.getFullYear(),
        monatVoll: MONTHS[d.getMonth()],
        erledigt,
        basis,
        quote: basis > 0 ? Math.round((erledigt / basis) * 100) : null,
      });
    }
    return reihe;
  }, [visibleEntries, year, month]);

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

  // Der Zwischenspeicher des Browsers fasst nur etwa 5 MB. Bei einer Werkstatt
  // mit rund 15 Leuten sind das etwa sieben Jahre. Statt zu warten, bis nichts
  // mehr geht, wird ab drei Jahren Bestand einmal darauf hingewiesen - früh
  // genug, um es in Ruhe zu erledigen.
  useEffect(() => {
    if (readerMode || entries.length === 0 || archivHinweis) return;
    let verschobenBis = "";
    try { verschobenBis = localStorage.getItem("wk-archiv-erinnerung") || ""; } catch (e) { /* egal */ }
    if (verschobenBis && verschobenBis > todayKey) return; // "Später erinnern" läuft noch

    const daten = entries.map((e) => String(e.date || "")).filter((d) => d.length >= 10).sort();
    if (daten.length === 0) return;
    const aeltestes = Number(daten[0].slice(0, 4));
    const jahre = today.getFullYear() - aeltestes;
    if (jahre < 3) return;

    let groesseKB = 0;
    try {
      const a = localStorage.getItem(STORAGE_KEY) || "";
      const b = localStorage.getItem("werkstatt-stoerungen-entries") || "";
      groesseKB = Math.round((a.length + b.length) / 1024);
    } catch (e) { /* egal */ }
    setArchivGrenze(today.getFullYear() - 2); // Vorschlag: die letzten zwei vollen Jahre behalten
    setArchivGesichert(false);
    setArchivHinweis({ jahre, groesseKB, aeltestesJahr: aeltestes });
  }, [entries, readerMode, todayKey, archivHinweis]);

  const archivErinnerungVerschieben = (tage) => {
    const d = new Date(today.getTime() + tage * 86400000);
    try { localStorage.setItem("wk-archiv-erinnerung", dateKey(d.getFullYear(), d.getMonth(), d.getDate())); } catch (e) { /* egal */ }
    setArchivHinweis(null);
  };

  // Schritt 1: Die auszulagernden Jahrgänge als Datei herunterladen. Erst wenn
  // das nachweislich geschehen ist, darf Schritt 2 sie aus dem Bestand nehmen.
  const archivHerunterladen = () => {
    const alt = entries.filter((e) => String(e.date || "").slice(0, 4) <= String(archivGrenze));
    try {
      const inhalt = { format: "werkstatt-kalender-archiv-v1", erstelltAm: new Date().toISOString(), bisJahr: archivGrenze, entries: alt };
      const blob = new Blob([JSON.stringify(inhalt, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `werkstatt-archiv-bis-${archivGrenze}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setArchivGesichert(true);
    } catch (e) {
      setErr("Die Archivdatei konnte nicht erstellt werden - es wurde nichts entfernt.");
    }
  };

  // Schritt 2: Erst jetzt aus dem laufenden Bestand nehmen. Das wirkt über die
  // gemeinsame Datei auf alle Arbeitsplätze - deshalb ausdrücklich bestätigen.
  const archivAuslagern = async () => {
    const alt = entries.filter((e) => String(e.date || "").slice(0, 4) <= String(archivGrenze));
    if (alt.length === 0) { setArchivHinweis(null); return; }
    if (!window.confirm(
      `${alt.length} Einträge bis einschließlich ${archivGrenze} werden jetzt aus dem laufenden Bestand entfernt.\n\n` +
      `Das gilt für ALLE Arbeitsplätze. Die heruntergeladene Archivdatei ist dann der einzige Nachweis dieser Jahrgänge - ` +
      `lege sie an einen sicheren Ort, bevor du fortfährst.\n\nJetzt entfernen?`
    )) return;
    await persist(entries.filter((e) => String(e.date || "").slice(0, 4) > String(archivGrenze)));
    try { localStorage.removeItem("wk-archiv-erinnerung"); } catch (e) { /* egal */ }
    setArchivHinweis(null);
  };

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
    .sort((a, b) => (b.angeheftet ? 1 : 0) - (a.angeheftet ? 1 : 0) || String(b.zeit || b.date).localeCompare(String(a.zeit || a.date)));
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
  // Feste Farben je Verfasser-Kürzel (Wunsch: RC immer blau, AR immer gelb),
  // alle anderen behalten die abwechselnde Zufallsfarbe des Zettels.
  const zettelFarbeFuer = (z) => {
    const wer = String(z.name || "").trim().toUpperCase();
    if (wer === "RC") return ZETTEL_FARBEN.blau;
    if (wer === "AR") return ZETTEL_FARBEN.gelb;
    return ZETTEL_FARBEN[z.farbe] || ZETTEL_FARBEN.gelb;
  };
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
  // Veröffentlichen = auch für Nur-Leser sichtbar. Unveröffentlichte Zettel
  // sind intern - nur für Personen mit Bearbeiter-Rechten gedacht.
  const toggleZettelVeroeffentlicht = async (id) => {
    await persist(entries.map((e) => (e.id === id ? { ...e, veroeffentlicht: !e.veroeffentlicht } : e)));
  };
  const toggleZettelAngeheftet = async (id) => {
    await persist(entries.map((e) => (e.id === id ? { ...e, angeheftet: !e.angeheftet } : e)));
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
  // Gesetzte Filter als Marken über der Liste. Sie sind der Ersatz dafür, dass
  // die Filter selbst nicht mehr dauerhaft sichtbar sind: Was eingestellt ist,
  // steht da - was auf "alle" steht, verschwindet. Vorher standen alle neun
  // Bedienelemente ständig im Bild, auch wenn keines davon eingestellt war.
  const blMarken = [];
  if (blPrio !== "ALLE") blMarken.push({ id: "prio", text: `Prio: ${{ hoch: "1", mittel: "2", niedrig: "3", ohne: "ohne" }[blPrio] || blPrio}`, weg: () => setBlPrio("ALLE") });
  if (blWer !== "ALLE") blMarken.push({ id: "wer", text: blWer === "NIEMAND" ? "nicht zugewiesen" : blWer, weg: () => setBlWer("ALLE") });
  if (blAnlage !== "ALLE") blMarken.push({ id: "anlage", text: blAnlage, weg: () => setBlAnlage("ALLE") });
  if (blAzubi) blMarken.push({ id: "azubi", text: "🎓 Azubi-geeignet", weg: () => setBlAzubi(false) });
  if (blStillstand) blMarken.push({ id: "still", text: "⛔ nur bei Stillstand", weg: () => setBlStillstand(false) });
  if (blErledigte) blMarken.push({ id: "erl", text: "erledigte Arbeiten", weg: () => setBlErledigte(false) });
  const blFilterAlleWeg = () => { setBlPrio("ALLE"); setBlWer("ALLE"); setBlAnlage("ALLE"); setBlAzubi(false); setBlStillstand(false); setBlErledigte(false); };
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
    if (readerMode) return;
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
          if ((m.rolle || "") !== "" && !schichtFuer(m.name, tag)) crew.push({ name: m.name, schicht: null });
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
    if (readerMode) return;
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
    if (readerMode || !planNotiz) return;
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
                  style={{ padding: "2px 8px", fontWeight: 700, whiteSpace: "nowrap", borderRight: "1.5px solid #6B7280", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: "#C3C7CB" }}
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
      html += `<tr><td style="padding:2px 8px;font-weight:700;white-space:nowrap;border-right:1.5px solid #6B7280;">${escapeHtml(name)}</td>`;
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
      html += `<tr><td style="padding:5px 10px;font-weight:700;white-space:nowrap;border-right:1.5px solid #6B7280;">${escapeHtml(name)}</td>`;
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
      html += `<tr style="border-bottom:1.5px solid #6B7280;">
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
      const borderColor = isToday ? "#C97A2B" : holName ? "#E8B4AE" : weekend ? "#C8DDEE" : "#6B7280";
      return `<div style="border:${isToday ? "2px" : "1.5px"} solid ${borderColor};border-radius:6px;padding:5px;min-height:80px;background:${cellBg};">${inner}</div>`;
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
      const borderColor = isToday ? "#C97A2B" : holName ? "#E8B4AE" : weekend ? "#C8DDEE" : "#6B7280";
      return `<div style="border:${isToday ? "2px" : "1.5px"} solid ${borderColor};border-radius:6px;padding:5px;min-height:80px;background:${cellBg};">${inner}</div>`;
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
      html += `<tr style="border-bottom:1.5px solid #6B7280;">
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

  // Gemeinsame Druck-/Popup-Logik, damit TPM-Plan, Schichtplan und Planung
  // dieselbe zuverlässige Fallback-Kette (Popup -> Download bei blockiertem
  // Popup) nutzen, statt sie dreimal separat zu pflegen.
  const openPrintWindow = (html, downloadName) => {
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
        a.download = downloadName;
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

  const handlePrint = () => {
    const html = buildPrintDocument();
    openPrintWindow(html, `werkstatt-kalender-${view.toLowerCase()}-${year}${view === "MONAT" ? "-" + pad(month + 1) : ""}.html`);
  };

  // ---- Druckvorlage Schichtplan (Monatsmatrix, wie im Cockpit-Reiter "Schichtplan") ----
  const buildSchichtplanPrintHTML = () => {
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

    const kwZeile = kwSegmente
      .map((s) => `<th colspan="${s.span}" style="border:1px solid #6B7280;background:#F7F8F9;padding:3px 2px;font-weight:700;color:#8A9099;">KW ${s.kw}</th>`)
      .join("");
    const randFuer = (t) => (t.dow === 1 || t.dow === 6 ? "border-left:2.5px solid #22262B;" : "");
    const tagZeile = tage
      .map((t) => {
        const we = t.dow === 0 || t.dow === 6;
        const ft = feiertage.get(t.key);
        return `<th style="border:1px solid #6B7280;${randFuer(t)}min-width:20px;background:${ft ? "#FBE9E7" : we ? "#E5F0F8" : "#F7F8F9"};padding:2px 1px;font-weight:800;color:${ft ? "#B23A34" : we ? "#5B87AB" : "#8A9099"};">${WEEKDAYS[(t.dow + 6) % 7]}<br/>${t.nr}</th>`;
      })
      .join("");
    const zeileFuer = (mitglied) => {
      const person = mitglied.name;
      const zellen = tage
        .map((t) => {
          const we = t.dow === 0 || t.dow === 6;
          const schicht = schichtFuer(person, t.key);
          const bg = schicht ? SCHICHTEN[schicht].color : we ? "#EFF5FA" : "white";
          const fg = schicht ? (SCHICHTEN[schicht].text || "white") : "#D6D9DC";
          return `<td style="border:1px solid #6B7280;${randFuer(t)}text-align:center;padding:2px 1px;background:${bg};color:${fg};font-weight:800;">${schicht ? escapeHtml(SCHICHTEN[schicht].kurz) : "·"}</td>`;
        })
        .join("");
      return `<tr><td style="border:1px solid #6B7280;background:#F7F8F9;padding:3px 6px;font-weight:700;white-space:nowrap;">${escapeHtml(person)}</td>${zellen}</tr>`;
    };
    // Ausdruck bewusst ohne die "Sonstige"-Gruppe (ohne Gewerk) - auf Papier
    // interessiert nur die eigentliche Werkstatt-Mannschaft.
    const rang = { mech: 0, elek: 1, azubi: 2 };
    const haupt = [...team].filter((m) => (m.rolle || "") !== "").sort((a, b) => rang[a.rolle] - rang[b.rolle]);
    const zeilen = haupt.map(zeileFuer).join("");

    const legende = Object.entries(SCHICHTEN)
      .map(([name, s]) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:11px;font-weight:700;color:#39414B;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${s.color};"></span>${escapeHtml(name)}</span>`)
      .join("");

    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Schichtplan ${escapeHtml(MONTHS[mm])} ${my}</title>
      <style>
        @page { size: A4 landscape; margin: 8mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 12px; }
        table { border-collapse: collapse; font-size: 9px; width: 100%; }
      </style>
    </head><body>
      <div style="text-align:center;margin-bottom:14px;">
        <div style="font-weight:900;font-size:20px;text-transform:uppercase;letter-spacing:0.02em;">Schichtplan</div>
        <div style="font-family:monospace;font-size:12px;margin-top:2px;">${escapeHtml(MONTHS[mm])} ${my}</div>
      </div>
      <table>
        <thead>
          <tr><th style="border:1px solid #6B7280;background:#F7F8F9;padding:3px 6px;text-align:left;"></th>${kwZeile}</tr>
          <tr><th style="border:1px solid #6B7280;background:#F7F8F9;padding:3px 6px;text-align:left;font-weight:800;text-transform:uppercase;color:#8A9099;">Mitarbeiter</th>${tagZeile}</tr>
        </thead>
        <tbody>${zeilen}</tbody>
      </table>
      <div style="margin-top:14px;">${legende}</div>
    </body></html>`;
  };

  const handlePrintSchichtplan = () => {
    const html = buildSchichtplanPrintHTML();
    openPrintWindow(html, `werkstatt-schichtplan-${matrixCursor.getFullYear()}-${pad(matrixCursor.getMonth() + 1)}.html`);
  };

  // ---- Druckvorlage Planung (Wochenansicht, wie im Cockpit-Reiter "Planung") ----
  const buildPlanungPrintHTML = () => {
    const kw = getISOWeek(planungMontag);
    const vonStr = planungMontag.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const bisStr = addDays(planungMontag, 6).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

    const kopfZellen = planungTage
      .map((t) => {
        const feiertag = getHolidays(t.datum.getFullYear()).get(t.key);
        return `<th style="border:1px solid #6B7280;padding:4px 3px;background:${feiertag ? "#FBE9E7" : t.we ? "#E5F0F8" : "#F7F8F9"};font-weight:800;color:${feiertag ? "#B23A34" : t.we ? "#5B87AB" : "#8A9099"};font-size:9px;text-transform:uppercase;">${t.datum.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}${feiertag ? `<div style="font-size:8px;">${escapeHtml(feiertag)}</div>` : ""}</th>`;
      })
      .join("");

    const wartungZeile = `<tr>
      <td style="border:1px solid #6B7280;padding:4px 6px;background:#FBF7F1;font-weight:800;color:#C97A2B;font-size:10px;">Wartungsplan<div style="font-weight:400;color:#8A9099;font-size:9px;">TPM &amp; R+I</div></td>
      ${planungTage
        .map((t) => {
          const eintraege = wochenPlan
            .filter((p) => p.date === t.key)
            .map((p) => {
              const done = isPlanDone(p);
              const c = done ? "#2F7D4F" : planGroupColor(p.anlage, tpmAnlagen, riItems);
              return `<div style="font-size:8.5px;font-weight:700;color:${c};border:1px solid ${c};border-radius:3px;padding:1px 4px;margin-bottom:2px;">${done ? "✓ " : ""}${escapeHtml(p.anlage)}</div>`;
            })
            .join("");
          return `<td style="border:1px solid #6B7280;padding:3px;vertical-align:top;background:${t.we ? "#EFF5FA" : "#FFFDF9"};">${eintraege}</td>`;
        })
        .join("")}
    </tr>`;

    // Ausdruck bewusst ohne die "Sonstige"-Gruppe (ohne Gewerk).
    const rang = { mech: 0, elek: 1, azubi: 2 };
    const alleTeam = [...team].filter((m) => (m.rolle || "") !== "").sort((a, b) => rang[a.rolle] - rang[b.rolle]);
    const personZeilen = alleTeam
      .map((mitglied) => {
        const person = mitglied.name;
        const rolle = TEAM_ROLLEN[mitglied.rolle || ""];
        const zellen = planungTage
          .map((t) => {
            const schicht = schichtFuer(person, t.key);
            const arbeiten = geplantFuer(person, t.key)
              .map((a) => {
                const c = a.art === "elek" ? ARBEIT_ART.elek.color : ARBEIT_ART.mech.color;
                return `<div style="font-size:8.5px;font-weight:700;color:${c};border:1px solid ${c};border-radius:3px;padding:1px 4px;margin-bottom:2px;">${escapeHtml(a.name)}: ${escapeHtml(a.note)}</div>`;
              })
              .join("");
            const notizen = notizenFuer(person, t.key)
              .map((n) => `<div style="font-size:8.5px;font-weight:600;color:#39414B;border:1px solid #E5D77A;background:#FEF9C3;border-radius:3px;padding:1px 4px;margin-bottom:2px;">📝 ${escapeHtml(n.note)}</div>`)
              .join("");
            const schichtBadge = schicht
              ? `<div style="display:inline-block;font-size:8px;font-weight:800;color:${SCHICHTEN[schicht].text || "white"};background:${SCHICHTEN[schicht].color};border-radius:3px;padding:1px 5px;margin-bottom:3px;">${escapeHtml(SCHICHTEN[schicht].kurz)}</div>`
              : "";
            return `<td style="border:1px solid #6B7280;padding:3px;vertical-align:top;background:${t.we ? "#EFF5FA" : "white"};">${schichtBadge}${arbeiten}${notizen}</td>`;
          })
          .join("");
        return `<tr>
          <td style="border:1px solid #6B7280;padding:4px 6px;background:#F7F8F9;font-weight:700;font-size:10px;white-space:nowrap;"><span style="display:inline-block;width:13px;height:13px;border-radius:50%;background:${rolle.color};color:white;font-weight:800;font-size:7px;text-align:center;line-height:13px;vertical-align:middle;margin-right:4px;">${escapeHtml(personKuerzel(person))}</span>${escapeHtml(person)}</td>
          ${zellen}
        </tr>`;
      })
      .join("");

    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Planung KW ${kw}</title>
      <style>
        @page { size: A4 landscape; margin: 8mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 12px; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      </style>
    </head><body>
      <div style="text-align:center;margin-bottom:14px;">
        <div style="font-weight:900;font-size:20px;text-transform:uppercase;letter-spacing:0.02em;">Planung</div>
        <div style="font-family:monospace;font-size:12px;margin-top:2px;">KW ${kw} · ${vonStr} – ${bisStr}</div>
      </div>
      <table>
        <colgroup><col style="width:130px;">${planungTage.map(() => `<col>`).join("")}</colgroup>
        <thead><tr><th style="border:1px solid #6B7280;padding:4px 6px;background:#F7F8F9;text-align:left;font-size:9px;font-weight:800;text-transform:uppercase;color:#8A9099;">Mitarbeiter</th>${kopfZellen}</tr></thead>
        <tbody>${wartungZeile}${personZeilen}</tbody>
      </table>
    </body></html>`;
  };

  const handlePrintPlanung = () => {
    const html = buildPlanungPrintHTML();
    openPrintWindow(html, `werkstatt-planung-kw${getISOWeek(planungMontag)}-${planungMontag.getFullYear()}.html`);
  };

  const printPrefix = view === "PLAN" ? "Wartungsplan" : filter === "ALL" ? "Werkstatt-Cockpit" : CATS[filter].full;
  const printSuffix = view === "JAHR" ? `Jahresübersicht ${year}` : view === "PLAN" ? `${MONTHS[month]} ${year}` : `Monatsübersicht ${MONTHS[month]} ${year}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#EBEDEF" }}>
        <div className="text-sm text-slate-500 font-mono">Werkstatt-Cockpit wird geladen…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans text-slate-800" style={{ backgroundColor: "#EBEDEF" }}>
      <style>{`
        .no-print { }
        .print-only { display: none; }
        /* Dezenter Hover für klickbare Listenzeilen (sticht Inline-Hintergründe) */
        .wk-hover { transition: background-color .12s; }
        .wk-hover:hover { background-color: #E9ECEF !important; cursor: pointer; }
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
        {/* Auf schmalen Geräten (Tablet hochkant, Telefon) ist nebeneinander kein
            Platz. Die Gruppen brechen deshalb um, statt aus dem Bild zu ragen -
            herausragende Knöpfe wären unerreichbar, weil die Seite waagerecht
            nicht scrollt. min-w-0 ist nötig, damit der Umbruch überhaupt greift. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
          {/* Zeichen und Wortmarke gehören zusammen und dürfen beim Umbruch
              nicht auseinandergerissen werden - deshalb in einer eigenen Gruppe.
              Das Zeichen läuft genau einmal beim Laden der Seite ab (siehe
              index.css); es steht danach still, ein Dauerläufer würde bei acht
              Stunden Bildschirmzeit zermürben. */}
          <div className="flex items-center gap-2 shrink-0">
            <svg className="wk-zeichen" viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
              <g><rect x="7" y="16" width="18" height="3.4" rx="1.3" fill="#E0A45B" /><path d="M8.6 19.8 L23.4 19.8 L21 28.6 Q20.8 29.4 20 29.4 L12 29.4 Q11.2 29.4 11 28.6 Z" fill="#C88B5E" /></g>
              <path className="wk-z-stiel" d="M16 17.4 L16 6.6" stroke="#3E8B4E" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              <path className="wk-z-blatt-l" d="M16 11.6 Q10.2 7.6 8.2 12.8 Q12.6 15.6 16 11.6 Z" fill="#4CA05E" />
              <path className="wk-z-blatt-r" d="M16 9 Q21.8 4.8 23.8 10 Q19.4 12.8 16 9 Z" fill="#58B36A" />
            </svg>
            <div className="font-black text-lg tracking-tight uppercase text-white">Werkstatt-Cockpit</div>
          </div>
          {/* Hauptbereiche Cockpit / TPM - für Bearbeiter UND Leser gleich.
              Leser sehen im Untermenü nur die freigegebene, kleinere Auswahl
              (kein Backlog / keine Auswertung / kein Register). Die Sicherheits-
              Klammer (useEffect oben) setzt unerlaubte Ansichten ohnehin zurück. */}
          <>
            <div className="flex rounded overflow-hidden border border-white/20 shrink-0">
              {[["COCKPIT", "Werkstatt"], ["TPM", "TPM"]].map(([v, label]) => {
                const active = v === "COCKPIT" ? view === "COCKPIT" : view !== "COCKPIT";
                return (
                  <button
                    key={v}
                    onClick={() => {
                      if (v === "COCKPIT") { setView("COCKPIT"); setCockpitTab("UEBERSICHT"); }
                      else setView("TPMINFO");
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
              <div className="flex rounded overflow-x-auto border border-white/10 max-w-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", scrollbarWidth: "none" }}>
                {(readerMode
                  ? [["UEBERSICHT", "Übersicht"], ["SCHICHTPLAN", "Schichtplan"], ["PLANUNG", "Planung"], ["STOERUNGEN", "Störungen"]]
                  : [["UEBERSICHT", "Übersicht"], ["SCHICHTPLAN", "Schichtplan"], ["PLANUNG", "Planung"], ["BACKLOG", "Backlog"], ["STOERUNGEN", "Störungen"]]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setCockpitTab(v)}
                    className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide inline-flex items-center shrink-0 whitespace-nowrap"
                    style={{ backgroundColor: cockpitTab === v ? "#4B5259" : "transparent", color: cockpitTab === v ? "#fff" : "#B7BEC6" }}
                  >
                    {label}
                    {v === "STOERUNGEN" && stoerOffenCount > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center rounded-full text-white" style={{ minWidth: "15px", height: "15px", padding: "0 4px", backgroundColor: "#C0392B", fontSize: "0.58rem" }}>{stoerOffenCount}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex rounded overflow-x-auto border border-white/10 max-w-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", scrollbarWidth: "none" }}>
                {(readerMode
                  ? [["TPMINFO", "Übersicht"], ["PLAN", "Plan"]]
                  : [["TPMINFO", "Übersicht"], ["PLAN", "Plan"], ["AUSWERTUNG", "Auswertung"], ["REGISTER", "Register"]]
                ).map(([v, label]) => {
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
          {view !== "COCKPIT" && view !== "TPMINFO" && (
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
          {/* Gemeinsame Datei: kleines Ordner-Symbol + "zuletzt aktualisiert"-Anzeige.
              Grün = verbunden, Grau = noch nicht eingerichtet.
              Nur-Leser sehen das Symbol nicht - sie sollen die Verbindung weder
              trennen noch eine andere Datei wählen können. */}
          {!confirmedReadOnly && (
          <>
            {shareState.status === "connected" && <SyncAnzeige style={{ color: "#B7BEC6" }} />}
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
          </>
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
        <div className="no-print px-4 py-2 flex flex-wrap items-center gap-3 text-xs font-bold" style={{ backgroundColor: sharedFile.schreibfrageOffen() ? "#FCEFD9" : "#E5F0F8", color: sharedFile.schreibfrageOffen() ? "#B8791F" : "#2F6690" }}>
          {/* Zwei sehr verschiedene Lagen sehen sonst gleich aus:
              (1) Dieser Rechner DARF nicht schreiben - dann ist Schreibschutz richtig.
              (2) Der Browser wurde nie gefragt, weil der Dateidialog länger offen
                  stand als die Nutzeraktivierung gilt. Das ist keine Ablehnung,
                  sondern eine nicht gestellte Frage - und ein Klick holt sie nach. */}
          {sharedFile.schreibfrageOffen() ? (
            <>
              <span>⚠ Der Browser wurde nicht nach dem Schreibzugriff gefragt – das Auswahlfenster stand zu lange offen.</span>
              <button
                onClick={async () => {
                  try {
                    const st = await sharedFile.retryWrite();
                    setShareState(st);
                    setErr(st.mode === "read"
                      ? `Schreibzugriff weiterhin nicht möglich (${sharedFile.getLastWriteError() || "unbekannter Grund"}). Prüfen: Datei schreibgeschützt (Explorer → Eigenschaften)? Gerade in einem anderen Programm geöffnet? Ordner ohne Schreibrechte?`
                      : null);
                  } catch (e2) {
                    setErr("Gemeinsame Datei: " + (e2 && e2.message ? e2.message : "Erneuter Versuch fehlgeschlagen."));
                  }
                }}
                className="px-3 py-1 rounded text-white"
                style={{ backgroundColor: "#B8791F" }}
              >
                Schreibzugriff erlauben
              </button>
            </>
          ) : (
            <span>🔒 Schreibschutz – dieser Rechner zeigt den gemeinsamen Stand nur an.</span>
          )}
          <span className="font-normal" style={{ color: sharedFile.schreibfrageOffen() ? "#8A5320" : "#5B87AB" }}>Aktualisiert: <SyncAnzeige style={{ color: sharedFile.schreibfrageOffen() ? "#8A5320" : "#5B87AB" }} /></span>
          {/* Rettungs-Werkzeuge bewusst versteckt: Für echte Leser wäre "Andere Datei
              wählen" zu verlockend. Ein Bearbeiter, der hier fälschlich gelandet ist
              (Datei gesperrt o. ä.), öffnet die App einmalig mit ?verwalten=1 in der
              Adresszeile - dann erscheinen die Knöpfe. */}
          {rettungsModus && (
            <>
              {sharedFile.getLastWriteError() && (
                <span className="font-normal" style={{ color: "#5B87AB" }}>Technischer Grund: {sharedFile.getLastWriteError()}</span>
              )}
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
            </>
          )}
        </div>
      )}
      {shareErr && (
        <div className="no-print px-4 py-2 text-xs font-bold" style={{ backgroundColor: "#FBE9E7", color: "#B23A34" }}>
          ⚠ {shareErr}
        </div>
      )}
      {shareInfo && (
        <div className="no-print px-4 py-2 text-xs font-bold" style={{ backgroundColor: "#E5F3EA", color: "#2F7D4F" }}>
          ✓ {shareInfo}
        </div>
      )}

      {/* Filter + Legende + Stats */}
      {view !== "PLAN" && view !== "COCKPIT" && view !== "TPMINFO" && (
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

      {/* Cockpit: Störungen (eigene, für alle beschreibbare Datei) */}
      {view === "COCKPIT" && cockpitTab === "STOERUNGEN" && (
        <div className="no-print max-w-5xl mx-auto px-4 mt-4">
          {/* ---- Werkzeugzeile ----------------------------------------------
              Dieselbe Anordnung wie im Backlog: Suche links, Umschalter und
              Hauptknopf rechts. Vorher standen Titel, Umschalter und Zähler in
              einer Reihe und die Suche in einer zweiten darunter - zwei Reihen
              für vier Bedienelemente. Der Titel entfällt: der Reiter oben sagt
              bereits, wo man ist. */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {stoerModus === "liste" && stoerungen.length > 0 && (
              <input
                type="search"
                value={stoerSuche}
                onChange={(ev) => setStoerSuche(ev.target.value)}
                placeholder="🔍 Suchen in Anlage, Teil, Beschreibung, Bearbeiter …"
                className="text-sm border rounded-lg px-3 py-1.5"
                style={{ borderColor: "#D7DCE1", flex: "1 1 220px", minWidth: "170px" }}
                aria-label="Störberichte durchsuchen"
              />
            )}
            <div className="inline-flex rounded-lg overflow-hidden shrink-0" style={{ border: "1.5px solid #D7DCE1" }}>
              {[["liste", "Liste"], ["auswertung", "Auswertung"]].map(([k, lab]) => (
                <button key={k} onClick={() => setStoerModus(k)} className="font-bold" style={{ fontSize: "0.75rem", padding: "5px 12px", backgroundColor: stoerModus === k ? "#22262B" : "#fff", color: stoerModus === k ? "#fff" : "#5B6572" }}>{lab}</button>
              ))}
            </div>
            {stoerModus === "liste" && (
              <span className="text-xs font-mono shrink-0" style={{ color: "#5B6572" }}>
                {stoerSucheAktiv ? `${stoerTreffer.length} Treffer` : `${stoerOffenCount} offen · ${stoerungen.length - stoerOffenCount} behoben`}
              </span>
            )}
            {stoerModus === "liste" && stoerungen.length === 0 && <span className="ml-auto" />}
            {stoerDarfSchreiben && (
              <button
                onClick={() => { setSDraft({ date: todayKey, schicht: "", anlage: "", anlagenteil: "", gewerk: "", fehlerart: "", stoerung: "", ursache: "", getan: "", nochZuTun: "", ersatzteile: "", nachbestellt: false, ausfallzeit: "", behobenAt: "", status: "", melder: localStorage.getItem("werkstatt-kalender-name") || "" }); setStoerModal({ mode: "add" }); }}
                className="flex items-center gap-1.5 rounded-lg text-white font-bold shrink-0 ml-auto"
                style={{ backgroundColor: "#C0392B", padding: "6px 12px", fontSize: "0.78rem" }}
              >
                📝 Störbericht erfassen
              </button>
            )}
          </div>

          {/* Fehler-Banner der Störungen-Datei */}
          {stoerErr && (
            <div className="rounded-lg px-3 py-2 mb-3 text-sm" style={{ backgroundColor: "#FBEAE8", border: "1px solid #C0392B", color: "#9A2B22" }}>{stoerErr}</div>
          )}

          {/* Verbindungs-Hinweise für die Störungen-Datei */}
          {stoerChecked && stoerState.status === "needs-permission" && (
            <div className="rounded-lg px-3 py-2 mb-3 text-sm flex items-center gap-3 flex-wrap" style={{ backgroundColor: "#FDF3E7", border: "1px solid #C97A2B", color: "#8A5320" }}>
              <span>Störungen-Datei „{stoerState.name}" ist nach dem Browser-Neustart getrennt.</span>
              <button onClick={reconnectStoer} className="rounded px-3 py-1 text-white font-bold" style={{ backgroundColor: "#C97A2B" }}>Jetzt verbinden</button>
            </div>
          )}
          {stoerChecked && (stoerState.status === "none") && sharedFile.stoer.isSupported() && (
            <div className="rounded-lg px-3 py-2 mb-3 text-sm flex items-center gap-3 flex-wrap" style={{ backgroundColor: "#EEF1F4", border: "1px solid #C4CBD2", color: "#3A424B" }}>
              <span>Die Störungen liegen in einer eigenen Datei, die <strong>alle</strong> bearbeiten dürfen. Einmal pro Gerät verbinden:</span>
              <button onClick={() => connectStoer()} className="rounded px-3 py-1 text-white font-bold" style={{ backgroundColor: "#2F6690" }}>Störungen-Datei öffnen …</button>
              <button onClick={() => connectStoer({ create: true })} className="rounded px-3 py-1 font-bold" style={{ backgroundColor: "#E2E6EA", color: "#3A424B" }}>neu anlegen …</button>
            </div>
          )}
          {stoerNurLesen && (
            <div className="rounded-lg px-3 py-2 mb-3 text-sm" style={{ backgroundColor: "#EEF1F4", border: "1px solid #C4CBD2", color: "#5B6572" }}>
              🔒 Die Störungen-Datei ist auf diesem Gerät nur zum Ansehen freigegeben.
            </div>
          )}

          {/* Auswertung */}
          {stoerModus === "auswertung" && (() => {
            const ymHeute = todayKey.slice(0, 7);
            const jahrHeute = todayKey.slice(0, 4);
            const imZeitraum = stoerungen.filter((s) => {
              if (stoerZeitraum === "alle") return true;
              if (!s.date) return false;
              return stoerZeitraum === "monat" ? s.date.slice(0, 7) === ymHeute : s.date.slice(0, 4) === jahrHeute;
            });
            const gesamt = imZeitraum.length;
            const offen = imZeitraum.filter((s) => s.offen).length;
            const ausfallGesamt = summeAusfall(imZeitraum);
            const schnitt = gesamt > 0 ? Math.round(ausfallGesamt / gesamt) : 0;
            const grp = (keyFn) => {
              const m = new Map();
              imZeitraum.forEach((s) => { const k = keyFn(s); const r = m.get(k) || { key: k, anzahl: 0, ausfall: 0 }; r.anzahl++; r.ausfall += Number(s.ausfallzeit) || 0; m.set(k, r); });
              return [...m.values()];
            };
            const proAnlage = grp((s) => s.anlage || "—");
            const topAusfall = [...proAnlage].sort((a, b) => b.ausfall - a.ausfall || b.anzahl - a.anzahl).slice(0, 8);
            const topAnzahl = [...proAnlage].sort((a, b) => b.anzahl - a.anzahl || b.ausfall - a.ausfall).slice(0, 8);
            const proMonat = grp((s) => (s.date || "").slice(0, 7)).filter((r) => r.key).sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
            const maxAusfall = Math.max(1, ...topAusfall.map((r) => r.ausfall));
            const maxAnzahl = Math.max(1, ...topAnzahl.map((r) => r.anzahl));
            const maxMonat = Math.max(1, ...proMonat.map((r) => r.ausfall));
            const monatLabel = (ym) => { const [y, m] = ym.split("-"); return `${MONTHS[Number(m) - 1].slice(0, 3)} ${y.slice(2)}`; };
            const KPI = ({ zahl, label, farbe }) => (
              <div className="rounded-xl px-3.5 py-3" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
                <div className="font-mono font-extrabold" style={{ fontSize: "1.3rem", color: farbe || "#22262B" }}>{zahl}</div>
                <div className="font-bold uppercase mt-0.5" style={{ color: "#8A9099", fontSize: "0.64rem" }}>{label}</div>
              </div>
            );
            const BalkenListe = ({ daten, max, wertText, farbe }) => (
              daten.length === 0 ? <div className="text-xs italic" style={{ color: "#C3C7CB" }}>keine Daten</div> : (
                <div className="flex flex-col gap-1.5">
                  {daten.map((r) => (
                    <div key={r.key} className="flex items-center gap-2">
                      <span className="flex-shrink-0" style={{ width: "130px", fontSize: "0.8rem", fontWeight: 700, color: "#39414B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.key}>{r.key}</span>
                      <div className="flex-1" style={{ backgroundColor: "#F0F2F5", borderRadius: "4px", height: "18px", position: "relative" }}>
                        <div style={{ width: `${Math.max(3, Math.round((wertText === "min" ? r.ausfall : r.anzahl) / max * 100))}%`, backgroundColor: farbe, height: "100%", borderRadius: "4px" }} />
                      </div>
                      <span className="flex-shrink-0 font-mono" style={{ width: "72px", textAlign: "right", fontSize: "0.74rem", color: "#5B6572" }}>{wertText === "min" ? minutenText(r.ausfall) : r.anzahl}</span>
                    </div>
                  ))}
                </div>
              )
            );
            return (
              <div>
                {/* Zeitraum-Wahl */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold uppercase" style={{ color: "#8A9099" }}>Zeitraum:</span>
                  <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1.5px solid #D6DBE0" }}>
                    {[["monat", MONTHS[today.getMonth()]], ["jahr", String(today.getFullYear())], ["alle", "Alle"]].map(([k, lab]) => (
                      <button key={k} onClick={() => setStoerZeitraum(k)} className="font-bold" style={{ fontSize: "0.76rem", padding: "5px 12px", backgroundColor: stoerZeitraum === k ? "#4B5259" : "transparent", color: stoerZeitraum === k ? "#fff" : "#5B6572" }}>{lab}</button>
                    ))}
                  </div>
                </div>

                {gesamt === 0 ? (
                  <div className="text-sm italic mt-6 text-center" style={{ color: "#8A9099" }}>Keine Störungen in diesem Zeitraum.</div>
                ) : (
                  <>
                    {/* Kennzahlen */}
                    <div className="grid gap-2.5 mb-4" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                      <KPI zahl={gesamt} label="Störungen" />
                      <KPI zahl={offen} label="noch offen" farbe={offen > 0 ? "#C0392B" : "#2F7D4F"} />
                      <KPI zahl={minutenText(ausfallGesamt)} label="Ausfallzeit gesamt" farbe="#2F6690" />
                      <KPI zahl={minutenText(schnitt)} label="Ø je Störung" farbe="#2F6690" />
                    </div>

                    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      {/* Top Ausfallzeit */}
                      <div className="rounded-xl p-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
                        <div className="text-xs font-extrabold uppercase mb-3" style={{ color: "#22262B" }}>⏱ Ausfallzeit je Anlage</div>
                        <BalkenListe daten={topAusfall} max={maxAusfall} wertText="min" farbe="#2F6690" />
                      </div>
                      {/* Top Anzahl */}
                      <div className="rounded-xl p-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
                        <div className="text-xs font-extrabold uppercase mb-3" style={{ color: "#22262B" }}>🔧 Anzahl Störungen je Anlage</div>
                        <BalkenListe daten={topAnzahl} max={maxAnzahl} wertText="anzahl" farbe="#C97A2B" />
                      </div>
                    </div>

                    {/* Monatsverlauf */}
                    <div className="rounded-xl p-4 mt-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
                      <div className="text-xs font-extrabold uppercase mb-3" style={{ color: "#22262B" }}>📈 Ausfallzeit je Monat</div>
                      {proMonat.length === 0 ? <div className="text-xs italic" style={{ color: "#C3C7CB" }}>keine Daten</div> : (
                        <div className="flex items-end gap-2" style={{ height: "140px" }}>
                          {proMonat.map((r) => (
                            <div key={r.key} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }} title={`${minutenText(r.ausfall)} · ${r.anzahl} Störung(en)`}>
                              <span style={{ fontSize: "0.58rem", color: "#8A9099", marginBottom: "2px" }}>{r.ausfall > 0 ? r.ausfall : ""}</span>
                              <div style={{ width: "100%", maxWidth: "46px", height: `${Math.max(2, Math.round(r.ausfall / maxMonat * 100))}%`, backgroundColor: "#2F6690", borderRadius: "4px 4px 0 0" }} />
                              <span style={{ fontSize: "0.6rem", color: "#5B6572", marginTop: "3px", fontWeight: 700 }}>{monatLabel(r.key)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-right mt-1" style={{ fontSize: "0.62rem", color: "#A6AEB6" }}>Werte in Minuten</div>
                    </div>

                    {/* Gewerk + Fehlerart */}
                    <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      {/* Gewerk */}
                      <div className="rounded-xl p-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
                        <div className="text-xs font-extrabold uppercase mb-3" style={{ color: "#22262B" }}>🔧⚡ Mechanik / Elektrik</div>
                        {(() => {
                          const st = { mech: 0, elek: 0, beide: 0, ohne: 0 };
                          imZeitraum.forEach((s) => { st[s.gewerk] !== undefined ? st[s.gewerk]++ : st.ohne++; });
                          const summe = Math.max(1, st.mech + st.elek + st.beide + st.ohne);
                          const teile = [["mech", st.mech], ["elek", st.elek], ["beide", st.beide], ["ohne", st.ohne]];
                          return (
                            <>
                              <div className="flex rounded-lg overflow-hidden" style={{ height: "26px" }}>
                                {teile.map(([k, n]) => n > 0 && (
                                  <div key={k} className="flex items-center justify-center font-bold" style={{ width: `${n / summe * 100}%`, backgroundColor: k === "ohne" ? "#C4CBD2" : STOER_GEWERK[k].color, color: "#fff", fontSize: "0.7rem" }} title={`${k === "ohne" ? "ohne Angabe" : STOER_GEWERK[k].label}: ${n}`}>{n}</div>
                                ))}
                              </div>
                              <div className="flex gap-3 mt-2 flex-wrap">
                                {[["mech", "Mechanik"], ["elek", "Elektrik"], ["beide", "Beide"], ["ohne", "ohne Angabe"]].map(([k, lab]) => (
                                  <span key={k} className="flex items-center gap-1.5" style={{ fontSize: "0.72rem", color: "#5B6572" }}>
                                    <span style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: k === "ohne" ? "#C4CBD2" : STOER_GEWERK[k].color }} />{lab}: <strong>{st[k]}</strong>
                                  </span>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {/* Fehlerart */}
                      <div className="rounded-xl p-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
                        <div className="text-xs font-extrabold uppercase mb-3" style={{ color: "#22262B" }}>📊 Fehlerart</div>
                        {(() => {
                          const fa = grp((s) => s.fehlerart || "ohne Angabe").sort((a, b) => b.anzahl - a.anzahl);
                          const maxFa = Math.max(1, ...fa.map((r) => r.anzahl));
                          return <BalkenListe daten={fa} max={maxFa} wertText="anzahl" farbe="#6B4E9E" />;
                        })()}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Liste im Schichtbuch-Stil: nach Datum gruppiert, aufklappbar -> Schichten */}
          {stoerModus === "liste" && (() => {
            if (stoerungen.length === 0) {
              return <div className="text-sm italic mt-6 text-center" style={{ color: "#8A9099" }}>Keine Störberichte erfasst. {stoerDarfSchreiben ? "Über den roten Knopf legst du den ersten an." : ""}</div>;
            }
            // Bei aktiver Suche: flache Trefferliste quer durch die ganze Historie
            if (stoerSucheAktiv) {
              if (stoerTreffer.length === 0) {
                return <div className="text-sm italic mt-6 text-center" style={{ color: "#8A9099" }}>Kein Störbericht passt zur Suche.</div>;
              }
              return (
                <div className="wk-karte overflow-hidden" style={{ border: "1px solid #E2E4E7" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "640px" }}>
                      <thead>{stoerKopfzeile("Datum")}</thead>
                      <tbody>{stoerTreffer.map((s) => stoerZeileTabelle(s, true))}</tbody>
                    </table>
                  </div>
                </div>
              );
            }
            if (stoerGruppen.length === 0) {
              return <div className="text-sm italic mt-6 text-center" style={{ color: "#8A9099" }}>Keine offenen Störungen. Behobene über den Schalter unten einblenden.</div>;
            }
            return (
              <>
                <div className="wk-karte overflow-hidden" style={{ border: "1px solid #E2E4E7" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "640px" }}>
                      <thead>{stoerKopfzeile("Datum / Zeit")}</thead>
                      <tbody>
                        {stoerGruppen.map((g, idx) => {
                          const auf = istTagOffen(g.datum, idx);
                          const d = g.datum !== "—" ? new Date(g.datum + "T00:00:00") : null;
                          const istHeute = g.datum === todayKey;
                          const grpTd = { padding: "0 8px", height: "26px", verticalAlign: "middle", whiteSpace: "nowrap", backgroundColor: istHeute ? "#FBF4E7" : "#EDF0F3", borderBottom: "1px solid #DDE1E6" };
                          const schTd = { padding: "0 8px", height: "23px", verticalAlign: "middle", whiteSpace: "nowrap", backgroundColor: "#F7F8FA", borderBottom: "1px solid #EEF0F2" };
                          return (
                            <React.Fragment key={g.datum}>
                              {/* Tages-Zeile */}
                              <tr onClick={() => toggleStoerTag(g.datum)} className="wk-hover" style={{ cursor: "pointer" }}>
                                <td colSpan={3} style={{ ...grpTd, fontWeight: 800, fontSize: "0.75rem", color: "#22262B" }}>
                                  <span style={{ color: "#5B6572", fontSize: "0.6rem", marginRight: "6px", display: "inline-block", width: "8px" }}>{auf ? "▾" : "▸"}</span>
                                  {d ? d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "ohne Datum"}
                                  {istHeute && <span className="rounded font-bold uppercase" style={{ fontSize: "0.56rem", padding: "1px 6px", backgroundColor: "#C97A2B", color: "#fff", marginLeft: "8px" }}>heute</span>}
                                  <span style={{ color: "#8A9099", fontWeight: 700, fontSize: "0.68rem", marginLeft: "9px" }}>{g.liste.length} {g.liste.length === 1 ? "Eintrag" : "Einträge"}</span>
                                </td>
                                <td style={{ ...grpTd, textAlign: "right" }}>
                                  {g.ausfall > 0 && <span className="font-mono" style={{ fontSize: "0.72rem", color: "#5B6572", fontWeight: 700 }}>{minutenText(g.ausfall)}</span>}
                                </td>
                                <td style={grpTd} />
                                <td style={grpTd}>
                                  {g.offen > 0 && <span className="inline-flex items-center rounded-full font-extrabold" style={{ fontSize: "0.58rem", padding: "1px 7px", backgroundColor: "#FBEAE8", color: "#B23A34" }}>{g.offen} offen</span>}
                                </td>
                              </tr>
                              {/* Schicht-Zeilen + Berichte */}
                              {auf && g.proSchicht.map(({ sch, liste, ausfall, offen: schOffen }) => {
                                const farbe = SCHICHTEN[sch] || { color: "#8A9099", text: "#fff" };
                                const schichtAuf = istSchichtOffen(g.datum, sch);
                                return (
                                  <React.Fragment key={sch}>
                                    <tr onClick={() => toggleStoerSchicht(g.datum, sch)} className="wk-hover" style={{ cursor: "pointer" }}>
                                      <td colSpan={3} style={{ ...schTd, paddingLeft: "24px" }}>
                                        <span style={{ color: "#8A9099", fontSize: "0.6rem", marginRight: "6px", display: "inline-block", width: "8px" }}>{schichtAuf ? "▾" : "▸"}</span>
                                        <span className="inline-flex items-center rounded font-extrabold uppercase" style={{ fontSize: "0.56rem", letterSpacing: "0.4px", padding: "1px 7px", backgroundColor: farbe.color, color: farbe.text || "#fff" }}>
                                          {sch === "—" ? "ohne Schicht" : sch}
                                        </span>
                                        <span style={{ color: "#A6AEB6", fontSize: "0.66rem", marginLeft: "8px" }}>{liste.length}</span>
                                      </td>
                                      <td style={{ ...schTd, textAlign: "right" }}>
                                        {ausfall > 0 && <span className="font-mono" style={{ fontSize: "0.68rem", color: "#8A9099", fontWeight: 700 }}>{minutenText(ausfall)}</span>}
                                      </td>
                                      <td style={schTd} />
                                      <td style={schTd}>
                                        {schOffen > 0 && <span className="inline-flex items-center rounded-full font-extrabold" style={{ fontSize: "0.55rem", padding: "1px 6px", backgroundColor: "#FBEAE8", color: "#B23A34" }}>{schOffen} offen</span>}
                                      </td>
                                    </tr>
                                    {schichtAuf && liste.map((s) => stoerZeileTabelle(s))}
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                {/* Erledigte ein-/ausblenden */}
                {stoerungen.length - stoerOffenCount > 0 && (
                  <button onClick={() => setStoerErledigteZeigen((v) => !v)} className="mt-4 text-xs font-bold" style={{ color: "#5B6572" }}>
                    {stoerErledigteZeigen ? "▾ behobene Störungen ausblenden" : `▸ ${stoerungen.length - stoerOffenCount} behobene Störung(en) anzeigen`}
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Cockpit: Übersicht (Kennzahlen + Tagesliste + Pinnwand) */}
      {view === "COCKPIT" && cockpitTab === "UEBERSICHT" && (
        <div className="no-print max-w-7xl mx-auto px-4 mt-4">
          {/* Kennzahlen-Kacheln (Farbakzent links, ohne Icon) */}
          {/* Sechs Felder nebeneinander gehen erst ab sehr breiten Bildschirmen auf.
              Darunter brechen sie um, statt sich gegenseitig zusammenzuquetschen -
              sonst bricht die Datumszeile der Uhr auf zwei Zeilen. */}
          <div className="grid gap-2.5 mb-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-7">
            {[
              [heutePlan.length, "Heute fällig", "#22262B", "#C97A2B"],
              [heuteErledigtCount, "Heute erledigt", "#2F7D4F", "#2F7D4F"],
              [ueberfaellige.length, "Überfällig", ueberfaellige.length > 0 ? "#B23A34" : "#2F7D4F", ueberfaellige.length > 0 ? "#B23A34" : "#CBD1D8"],
              [todayPlanResult.assignments.length, "Diesen Monat", "#22262B", "#8A9099"],
            ].map(([num, label, color, akzent]) => (
              <div key={label} className="wk-karte px-4 py-3.5 flex flex-col justify-center" style={{ boxShadow: `inset 3px 0 0 0 ${akzent}, var(--wk-schatten)` }}>
                {/* Ziffern gleicher Breite: sonst springt die Zahl beim Hochzählen */}
                <div className="font-extrabold" style={{ fontSize: "2.1rem", lineHeight: 1, letterSpacing: "-1.6px", fontVariantNumeric: "tabular-nums", color }}>{num}</div>
                {/* Kleinbuchstaben statt Versalien - deutlich schneller zu lesen */}
                <div className="font-semibold mt-1.5" style={{ color: "#6B7480", fontSize: "var(--wk-txt-etikett)", letterSpacing: "0.2px" }}>{label}</div>
              </div>
            ))}
            <HalbkreisQuote prozent={quoteMonatHeute} label="Wartung & R+I" sub={MONTHS[today.getMonth()]} titel="Anteil erledigter Wartungs- und R+I-Punkte im Monat" />
            {/* Hier stand bis zuletzt ein zweiter, gleich beschrifteter Halbkreis für
                das Jahr - die beiden waren kaum auseinanderzuhalten. Die Jahresquote
                steht jetzt in der TPM-Übersicht neben der Monatsquote, wo der
                Vergleich hingehört. An dieser Stelle sagt die Uhr mehr. */}
            <div className="xl:col-span-2 flex"><WerkstattUhr /></div>
          </div>

          {/* Heute da: Schicht-Spalten mit farbigem Kopf + Avatar-Chips (aktuelle Schicht hervorgehoben) */}
          {team.length > 0 && (() => {
            const { aktuell, SCHICHT_INFO, jetztCrew, spalten } = jetztInDerWerkstatt;
            const typFarbe = { FRUEH: { bg: "#F0C230", text: "#3A2E00" }, SPAET: { bg: "#1F7A3D", text: "#fff" }, NACHT: { bg: "#2F6690", text: "#fff" } };
            const initialen = (n) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: "white", border: "1px solid #E7EAEE" }}>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid #EEF0F2" }}>
                  <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#22262B" }}>👷 Heute da</span>
                  <span className="font-mono text-xs" style={{ color: "#8A9099" }}>({SCHICHT_INFO[aktuell].zeit})</span>
                  <span className="inline-flex items-center rounded-full font-bold text-white" style={{ backgroundColor: "#1F7A3D", fontSize: "0.68rem", padding: "3px 10px" }}>{jetztCrew.length} in der Werkstatt</span>
                  <button onClick={() => setCockpitTab("SCHICHTPLAN")} className="ml-auto text-xs font-bold" style={{ color: "#C97A2B" }}>➜ Schichtplan</button>
                </div>
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  {spalten.map(([typ, titel, liste], i) => {
                    const aktiv = typ === aktuell;
                    const tf = typFarbe[typ] || { bg: "#8A9099", text: "#fff" };
                    return (
                      <div key={typ} style={{ padding: "11px 14px", borderRight: i < 2 ? "1px solid #EEF0F2" : "none", backgroundColor: aktiv ? "#F6FBF7" : "transparent" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center rounded font-extrabold uppercase" style={{ fontSize: "0.56rem", letterSpacing: "0.4px", padding: "2px 8px", backgroundColor: tf.bg, color: tf.text }}>{titel}</span>
                          <span className="ml-auto" style={{ fontSize: "0.64rem", color: "#8A9099", fontWeight: 700 }}>{liste.length}</span>
                        </div>
                        {liste.length === 0 ? (
                          <div className="text-xs" style={{ color: "#C3C7CB" }}>–</div>
                        ) : (
                          liste.map((x) => {
                            const sc = x.schicht && SCHICHTEN[x.schicht];
                            // Ohne eingetragene Schichtart ist die Person trotzdem DA (Tag-/Frühdienst) -
                            // daher normal anzeigen, nur mit neutralem Avatar (kein Durchstreichen!).
                            return (
                              <div key={x.name} className="flex items-center gap-2" style={{ padding: "3px 0" }} title={sc ? x.schicht : "Anwesend (keine Schichtart eingetragen)"}>
                                <span className="inline-flex items-center justify-center rounded-full font-extrabold flex-shrink-0" style={{ width: "24px", height: "24px", fontSize: "0.6rem", backgroundColor: sc ? sc.color : "#8A9099", color: sc ? (sc.text || "#fff") : "#fff" }}>{initialen(x.name)}</span>
                                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#22262B" }}>{x.name}</span>
                                {aktiv && <span className="ml-auto inline-flex items-center rounded-full font-extrabold uppercase" style={{ fontSize: "0.5rem", letterSpacing: "0.3px", backgroundColor: "#EAF3EC", color: "#1F7A3D", padding: "1px 6px" }}>jetzt</span>}
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Gedankenstütze: offene Störungen */}
          {stoerOffeneListe.length > 0 && (
            <div className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: "white", border: "1px solid #E7B9B3", borderLeft: "5px solid #C0392B" }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: "#FBEAE8" }}>
                <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#9A2B22" }}>⚠ Offene Störungen</span>
                <span className="inline-flex items-center justify-center rounded-full text-white font-bold" style={{ minWidth: "18px", height: "18px", padding: "0 6px", backgroundColor: "#C0392B", fontSize: "0.62rem" }}>{stoerOffeneListe.length}</span>
                <button onClick={() => setCockpitTab("STOERUNGEN")} className="ml-auto text-xs font-bold" style={{ color: "#C0392B" }}>➜ Störungen</button>
              </div>
              <div className="px-2 py-1.5">
                {stoerOffeneListe.slice(0, 5).map((s) => (
                  <button key={s.id} onClick={() => setCockpitTab("STOERUNGEN")} className="w-full flex items-start gap-2.5 px-2 py-1.5 text-left rounded hover:bg-slate-50" style={{ borderLeft: "3px solid #C0392B", marginBottom: "2px" }}>
                    <span className="font-extrabold flex-shrink-0" style={{ fontSize: "0.82rem", color: "#22262B", minWidth: "0" }}>
                      {s.anlage || "—"}{s.anlagenteil ? <span style={{ fontWeight: 500, color: "#8A9099" }}> · {s.anlagenteil}</span> : ""}
                    </span>
                    <span className="flex-1" style={{ fontSize: "0.8rem", color: "#5B6572", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(s.nochZuTun && String(s.nochZuTun).trim()) ? <span style={{ color: "#C0392B", fontWeight: 600 }}>📌 {s.nochZuTun}</span> : s.stoerung}
                    </span>
                    {(Number(s.ausfallzeit) || 0) > 0 && <span className="flex-shrink-0 font-mono rounded" style={{ fontSize: "0.68rem", padding: "1px 6px", color: "#9A6B00", backgroundColor: "#FBF3DA" }}>{minutenText(s.ausfallzeit)}</span>}
                  </button>
                ))}
                {stoerOffeneListe.length > 5 && (
                  <button onClick={() => setCockpitTab("STOERUNGEN")} className="w-full text-center py-1.5 text-xs font-bold" style={{ color: "#8A9099" }}>+ {stoerOffeneListe.length - 5} weitere</button>
                )}
              </div>
            </div>
          )}

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
                    className="wk-karte wk-karte-hebt w-full flex items-center gap-2.5 px-3 py-2.5 mb-2 text-left"
                  >
                    <span
                      className="flex items-center justify-center font-black text-white"
                      style={{ width: "20px", height: "20px", borderRadius: "7px", fontSize: "0.72rem", flexShrink: 0, backgroundColor: st === "done" ? "#1F7A3D" : "transparent", border: st === "done" ? "none" : "2px solid #C3C7CB" }}
                    >
                      {st === "done" ? "✓" : ""}
                    </span>
                    <span className={`wk-chip wk-chip-${kat.toLowerCase()}`}>{CATS[kat].label}</span>
                    <strong className="flex-1" style={{ fontSize: "var(--wk-txt)", textDecoration: st === "done" ? "line-through" : "none", color: st === "done" ? "#8A9099" : "#22262B" }}>{p.anlage}</strong>
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
                      className="wk-karte wk-karte-hebt w-full flex items-center gap-2.5 px-3 py-2.5 mb-2 text-left"
                      style={{ backgroundColor: "#FDF6F5", boxShadow: "inset 3px 0 0 0 #B23A34, var(--wk-schatten)" }}
                    >
                      <span style={{ width: "20px", height: "20px", borderRadius: "7px", border: "2px solid #C3C7CB", backgroundColor: "white", flexShrink: 0 }} />
                      <span className={`wk-chip wk-chip-${String(e.category).toLowerCase()}`}>{CATS[e.category].label}</span>
                      <strong className="flex-1" style={{ fontSize: "var(--wk-txt)" }}>{e.name}</strong>
                      <span className="font-mono" style={{ fontSize: "var(--wk-txt-etikett)", color: "#B23A34" }}>{formatDateDE(e.date)}</span>
                    </button>
                  ))}
                  {ueberfaellige.length > 8 && <div className="text-xs text-slate-400">… und {ueberfaellige.length - 8} weitere (siehe TPM → Auswertung)</div>}
                </>
              )}
            </div>

            {/* Pinnwand */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#22262B" }}>📌 Pinnwand</span>
                <input
                  type="search"
                  value={zettelSuche}
                  onChange={(e) => setZettelSuche(e.target.value)}
                  placeholder="🔍 Suche …"
                  className="text-xs border rounded px-2 py-1 ml-auto"
                  style={{ borderColor: "#D6D9DC", width: "150px" }}
                  aria-label="Pinnwand durchsuchen"
                />
                {!readerMode && (
                  <button
                    onClick={() => setZettelOpen(!zettelOpen)}
                    className="flex items-center justify-center rounded text-white font-black"
                    style={{ backgroundColor: "#22262B", width: "26px", height: "26px", fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}
                    title="Neue Notiz anpinnen"
                    aria-label="Neue Notiz anpinnen"
                  >
                    +
                  </button>
                )}
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
              {(() => {
                const q = zettelSuche.trim().toLowerCase();
                // Nur-Leser sehen ausschließlich veröffentlichte Zettel (🌐) -
                // alle anderen Notizen sind intern für die Bearbeiter gedacht.
                const basis = readerMode ? zettelListe.filter((z) => z.veroeffentlicht) : zettelListe;
                const sichtbar = q ? basis.filter((z) => `${z.note} ${z.name}`.toLowerCase().includes(q)) : basis;
                if (q && sichtbar.length === 0) return <div className="text-xs italic text-slate-400">Kein Zettel passt zur Suche.</div>;
                const iconStil = (aktiv) => aktiv
                  ? { fontSize: "0.78rem", width: "26px", height: "24px", backgroundColor: "#22262B", color: "white" }
                  : { fontSize: "0.78rem", width: "26px", height: "24px", backgroundColor: "rgba(0,0,0,0.07)", color: "#5B6572" };
                return (
              <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {sichtbar.map((z) => (
                  <div key={z.id} className="relative p-3" style={{ backgroundColor: zettelFarbeFuer(z), borderRadius: "4px 4px 12px 4px", boxShadow: "2px 3px 8px rgba(20,22,25,0.12)" }}>
                    <div className="text-sm" style={{ color: "#39414B", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{z.note}</div>
                    <div className="text-right mt-1.5" style={{ fontSize: "0.62rem", color: "#8A9099" }}>
                      {z.name} · {z.zeit ? new Date(z.zeit).toLocaleDateString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : formatDateDE(z.date)}
                    </div>
                    {!readerMode && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <button
                        onClick={() => zettelZuArbeit(z)}
                        className="font-extrabold uppercase rounded text-white"
                        style={{ fontSize: "0.6rem", padding: "3px 8px", backgroundColor: "#22262B" }}
                      >
                        ➜ Zur Arbeit machen
                      </button>
                      <button
                        onClick={() => toggleZettelAngeheftet(z.id)}
                        className="inline-flex items-center justify-center rounded"
                        style={iconStil(z.angeheftet)}
                        title={z.angeheftet ? "Angeheftet: Zettel bleibt oben – Klick löst ihn" : "Anheften: Zettel bleibt immer oben in der Pinnwand"}
                        aria-label={z.angeheftet ? "Nicht mehr anheften" : "Anheften"}
                      >
                        📌
                      </button>
                      <button
                        onClick={() => toggleZettelMonitor(z.id)}
                        className="inline-flex items-center justify-center rounded"
                        style={iconStil(z.monitor)}
                        title={z.monitor ? "Läuft im Werkstatt-Monitor - Klick schaltet aus" : "Auf dem Werkstatt-Monitor im Laufband anzeigen"}
                        aria-label={z.monitor ? "Nicht mehr im Monitor anzeigen" : "Im Monitor anzeigen"}
                      >
                        📺
                      </button>
                      <button
                        onClick={() => toggleZettelVeroeffentlicht(z.id)}
                        className="inline-flex items-center justify-center rounded"
                        style={iconStil(z.veroeffentlicht)}
                        title={z.veroeffentlicht ? "Veröffentlicht: auch Nur-Leser sehen diesen Zettel - Klick macht ihn wieder intern" : "Veröffentlichen: auch für Nur-Leser sichtbar machen (sonst nur für Bearbeiter)"}
                        aria-label={z.veroeffentlicht ? "Veröffentlichung zurücknehmen" : "Veröffentlichen"}
                      >
                        🌐
                      </button>
                      <button
                        onClick={() => deleteZettel(z.id)}
                        className="inline-flex items-center justify-center rounded font-extrabold"
                        style={{ ...iconStil(false), fontSize: "0.9rem" }}
                        title="Zettel entfernen"
                        aria-label="Zettel entfernen"
                      >
                        ×
                      </button>
                    </div>
                    )}
                  </div>
                ))}
              </div>
                );
              })()}
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
                        borderColor: isToday ? "#C97A2B" : holName ? "#E8B4AE" : weekend ? "#C8DDEE" : "#6B7280",
                        borderWidth: isToday ? "2px" : "1.5px",
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
          {/* ---- Werkzeugzeile ----------------------------------------------
              Vorher standen hier elf Bedienelemente in zwei Reihen (109 Pixel),
              alle gleich laut: Großbuchstaben, fett, jedes im eigenen Kasten.
              Im Alltag benutzt man zwei davon. Deshalb steht draußen nur noch,
              was oft gebraucht wird - Suche und die Umschaltung Mechanik /
              Elektrik; der Rest liegt im Filter-Menü. Was dort eingestellt ist,
              erscheint darunter als abwerfbare Marke, damit kein Filter
              unbemerkt greift. */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input
              type="search"
              value={blSuche}
              onChange={(e) => setBlSuche(e.target.value)}
              placeholder="🔍 Suchen in Anlage und Arbeit …"
              className="text-sm border rounded-lg px-3 py-1.5"
              style={{ borderColor: "#D7DCE1", flex: "1 1 220px", minWidth: "170px" }}
            />
            <div className="flex rounded-lg overflow-hidden border shrink-0" style={{ borderColor: "#D7DCE1" }}>
              {[["ALLE", `Alle ${arbeitenOffen.length}`], ["mech", `Mech ${blZaehl("mech")}`], ["elek", `Elek ${blZaehl("elek")}`]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setBlArt(v)}
                  className="text-xs font-bold px-3 py-1.5"
                  style={blArt === v
                    ? { backgroundColor: v === "mech" ? "#3D8B8B" : v === "elek" ? "#7C5CBF" : "#22262B", color: "#fff" }
                    : { backgroundColor: "#fff", color: "#5B6572" }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative shrink-0">
              <button
                onClick={() => setBlFilterOffen((o) => !o)}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-white flex items-center gap-1.5"
                style={{ borderColor: blMarken.length ? "#22262B" : "#D7DCE1", color: "#22262B" }}
                aria-expanded={blFilterOffen}
              >
                Filter
                {blMarken.length > 0 && (
                  <span className="text-white rounded-full px-1.5" style={{ backgroundColor: "#C97A2B", fontSize: "0.6rem" }}>{blMarken.length}</span>
                )}
                <span style={{ color: "#8A9099", fontSize: "0.6rem" }}>▾</span>
              </button>
              {blFilterOffen && (
                <>
                  {/* Fläche dahinter: ein Klick daneben schließt das Menü. Ohne
                      sie bliebe es offen stehen, bis man den Knopf wiederfindet. */}
                  <div className="fixed inset-0" style={{ zIndex: 30 }} onClick={() => setBlFilterOffen(false)} />
                  <div
                    className="absolute right-0 mt-1 wk-karte p-3 flex flex-col gap-2.5"
                    style={{ zIndex: 31, width: "250px", border: "1px solid #E2E4E7" }}
                  >
                    <label className="flex flex-col gap-1">
                      <span style={{ fontSize: "var(--wk-txt-etikett)", fontWeight: 800, color: "#8A9099", textTransform: "uppercase", letterSpacing: "0.6px" }}>Priorität</span>
                      <select value={blPrio} onChange={(e) => setBlPrio(e.target.value)} className="text-sm">
                        <option value="ALLE">alle</option>
                        <option value="hoch">Prio 1</option>
                        <option value="mittel">Prio 2</option>
                        <option value="niedrig">Prio 3</option>
                        <option value="ohne">ohne Prio</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span style={{ fontSize: "var(--wk-txt-etikett)", fontWeight: 800, color: "#8A9099", textTransform: "uppercase", letterSpacing: "0.6px" }}>Person</span>
                      <select value={blWer} onChange={(e) => setBlWer(e.target.value)} className="text-sm">
                        <option value="ALLE">alle</option>
                        <option value="NIEMAND">– nicht zugewiesen –</option>
                        {team.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span style={{ fontSize: "var(--wk-txt-etikett)", fontWeight: 800, color: "#8A9099", textTransform: "uppercase", letterSpacing: "0.6px" }}>Anlage / Bereich</span>
                      <select value={blAnlage} onChange={(e) => setBlAnlage(e.target.value)} className="text-sm">
                        <option value="ALLE">alle</option>
                        {blAnlagenOptionen.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={blAzubi} onChange={(e) => setBlAzubi(e.target.checked)} />
                      🎓 nur Azubi-geeignete
                    </label>
                    <label className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={blStillstand} onChange={(e) => setBlStillstand(e.target.checked)} />
                      ⛔ nur bei Stillstand
                    </label>
                    <label className="flex items-center gap-2 text-sm pt-2 border-t" style={{ cursor: "pointer", borderColor: "#E2E4E7" }}>
                      <input type="checkbox" checked={blErledigte} onChange={(e) => setBlErledigte(e.target.checked)} />
                      erledigte Arbeiten zeigen
                    </label>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={openArbeitNeu}
              className="text-xs font-bold text-white px-3.5 py-2 rounded-lg shrink-0"
              style={{ backgroundColor: "#22262B" }}
            >
              + Neue Arbeit
            </button>
          </div>

          {blMarken.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {blMarken.map((m) => (
                <button
                  key={m.id}
                  onClick={m.weg}
                  className="wk-chip flex items-center gap-1.5"
                  style={{ backgroundColor: "#EDF0F3", color: "#3d4650", fontSize: "0.66rem", padding: "3px 7px 3px 9px" }}
                  title="Diesen Filter entfernen"
                >
                  {m.text} <span style={{ color: "#8A9099", fontWeight: 800 }}>✕</span>
                </button>
              ))}
              {blMarken.length > 1 && (
                <button onClick={blFilterAlleWeg} className="text-xs font-bold" style={{ color: "#8A9099" }}>alle entfernen</button>
              )}
            </div>
          )}

          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #22262B" }}>
                    <th style={{ width: "40px", padding: "6px 10px" }} title="Priorität">Prio</th>
                    <th style={{ textAlign: "left", padding: "6px 10px", width: "160px" }}>Anlage / Bereich</th>
                    <th style={{ textAlign: "left", padding: "6px 10px" }}>Arbeit</th>
                    <th style={{ textAlign: "left", padding: "6px 10px", width: "90px" }}>Art</th>
                    <th style={{ padding: "8px 6px", width: "72px" }} title="Azubi-geeignet / nur bei Stillstand">🎓⛔</th>
                    <th style={{ textAlign: "left", padding: "6px 10px", width: "110px" }}>Wer</th>
                    <th style={{ textAlign: "left", padding: "6px 10px", width: "100px" }}>{blErledigte ? "Erledigt am" : "Gemeldet"}</th>
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
                        className="wk-hover"
                        style={{ borderBottom: "1px solid #EEF0F2", cursor: "pointer", opacity: a.status === "done" ? 0.6 : 1 }}
                        title="Klicken zum Bearbeiten"
                      >
                        <td style={{ textAlign: "center" }}>
                          <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "50%", backgroundColor: prio.color }} title={prio.label} />
                        </td>
                        <td style={{ padding: "3px 10px", whiteSpace: "nowrap" }}>
                          <button
                            onClick={(ev) => { ev.stopPropagation(); setAkteAnlage(a.name); }}
                            className="font-bold hover:underline"
                            style={{ textDecorationStyle: "dotted", color: "#22262B" }}
                            title="Anlagen-Akte öffnen"
                          >
                            {a.name}
                          </button>
                        </td>
                        <td style={{ padding: "3px 10px" }}>{a.note}</td>
                        <td style={{ padding: "3px 10px" }}>
                          {a.art === "beide" ? (
                            <><span className="text-xs font-bold" style={{ color: ARBEIT_ART.mech.color }}>Mech</span> <span className="text-xs font-bold" style={{ color: ARBEIT_ART.elek.color }}>+ Elek</span></>
                          ) : (
                            <span className="text-xs font-bold" style={{ color: art.color }}>{art.kurz}</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center", fontSize: "0.85rem" }}>{a.azubi ? "🎓" : ""}{a.stillstand ? "⛔" : ""}</td>
                        <td style={{ padding: "3px 10px", whiteSpace: "nowrap" }}>
                          {a.wer ? (
                            <span className="flex items-center gap-1.5">
                              <span className="inline-flex items-center justify-center rounded-full text-white font-extrabold" style={{ width: "20px", height: "20px", fontSize: "0.58rem", backgroundColor: personFarbe(a.wer) }}>{personKuerzel(a.wer)}</span>
                              <span style={{ fontSize: "0.72rem" }}>{a.wer}</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.72rem", color: "#C3C7CB" }}>–</span>
                          )}
                        </td>
                        <td className="font-mono" style={{ padding: "3px 10px", fontSize: "0.72rem", color: "#8A9099" }}>
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
            <button
              onClick={handlePrintPlanung}
              className="flex items-center gap-1.5 text-white px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wide hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#C97A2B" }}
              aria-label="Planung drucken"
            >
              <Printer size={14} /> Drucken
            </button>
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
            (() => {
              // Zeilen-Layout (wie das Excel-KW-Blatt): Tage untereinander als Blöcke,
              // eine Zeile je Person. Personen OHNE Gewerk erscheinen hier bewusst
              // gar nicht - die Planung gilt nur der eigentlichen Werkstatt-Mannschaft.
              const haupt = [...team]
                .filter((t) => (t.rolle || "") !== "")
                .sort((a, b) => ({ mech: 0, elek: 1, azubi: 2 }[a.rolle] - { mech: 0, elek: 1, azubi: 2 }[b.rolle]));
              const thStil = { background: "#F7F8F9", fontSize: "0.6rem", textTransform: "uppercase", color: "#8A9099", letterSpacing: "0.04em", textAlign: "left", padding: "2px 10px", borderBottom: "1.5px solid #6B7280" };
              const trennRand = "2px solid #22262B"; // Trennspalte nach "Person" und nach "Schicht"
              return (
                <div>
                  {planungTage.map((t) => {
                    const istHeute = t.key === todayKey;
                    const feiertag = getHolidays(t.datum.getFullYear()).get(t.key);
                    const tagesPlan = wochenPlan.filter((p) => p.date === t.key);
                    // Sa/So kompakt: nur Personen zeigen, die an dem Tag eine Schicht haben
                    const tagesPersonen = t.we ? haupt.filter((m) => schichtFuer(m.name, t.key)) : haupt;
                    return (
                      <div key={t.key} data-planungstag={t.key} className="overflow-hidden" style={{ border: "1.5px solid #6B7280", borderRadius: "6px", backgroundColor: "white", marginBottom: "6px" }}>
                        {/* Tages-Balken */}
                        <div style={{ background: istHeute ? "#C97A2B" : t.we ? "#7FA6C4" : "#4B5259", color: "white", padding: "4px 10px", display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap", fontWeight: 800, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {t.datum.toLocaleDateString("de-DE", { weekday: "long" })}
                          <span className="font-mono" style={{ fontWeight: 400, opacity: 0.9, fontSize: "0.7rem", textTransform: "none", letterSpacing: 0 }}>
                            {t.datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} · KW {getISOWeek(t.datum)}{istHeute ? " · HEUTE" : ""}
                          </span>
                          {feiertag && <span style={{ fontSize: "0.7rem", color: "#FFE3DE" }}>{feiertag}</span>}
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.75rem" }}>
                            <thead>
                              <tr>
                                <th style={{ ...thStil, width: "170px", borderRight: trennRand }}>Person</th>
                                <th style={{ ...thStil, width: "64px", borderRight: trennRand }}>Schicht</th>
                                <th style={thStil}>Arbeiten &amp; Notizen</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* Wartungsplan-Zeile: durch kräftige schwarze Linien hervorgehoben */}
                              <tr>
                                <td style={{ padding: "3px 10px", background: "#FBF7F1", borderTop: trennRand, borderBottom: trennRand, borderRight: trennRand, fontWeight: 800, color: "#C97A2B", whiteSpace: "nowrap" }}>Wartungsplan</td>
                                <td style={{ background: "#FBF7F1", borderTop: trennRand, borderBottom: trennRand, borderRight: trennRand }}></td>
                                <td style={{ padding: "3px 10px", background: "#FBF7F1", borderTop: trennRand, borderBottom: trennRand }}>
                                  {tagesPlan.length === 0 ? (
                                    <span style={{ color: "#C3C7CB", fontSize: "0.7rem" }}>–</span>
                                  ) : tagesPlan.map((p, i) => {
                                    const done = isPlanDone(p);
                                    const c = done ? "#2F7D4F" : planGroupColor(p.anlage, tpmAnlagen, riItems);
                                    return (
                                      <button key={i} onClick={() => openPlanEntry(p)} className="rounded font-bold" style={{ display: "inline-block", fontSize: "0.68rem", padding: "0 6px", margin: "1px 4px 1px 0", color: c, border: `1px solid ${c}`, backgroundColor: done ? "#E5F3EA" : `${c}18` }}>
                                        {done ? "✓ " : ""}{p.anlage}
                                      </button>
                                    );
                                  })}
                                </td>
                              </tr>
                              {t.we && tagesPersonen.length === 0 && (
                                <tr>
                                  <td colSpan={3} style={{ padding: "3px 10px", borderTop: "1px solid #E2E4E7", color: "#8A9099", fontSize: "0.7rem", fontStyle: "italic" }}>
                                    Niemand eingeteilt – Wochenend-Schichten trägst du am schnellsten im Schichtplan ein.
                                  </td>
                                </tr>
                              )}
                              {tagesPersonen.map((mitglied) => {
                                const person = mitglied.name;
                                const rolle = TEAM_ROLLEN[mitglied.rolle || ""];
                                const schicht = schichtFuer(person, t.key);
                                const abwesend = schicht && SCHICHT_ABWESEND.has(schicht);
                                return (
                                  <tr key={person}>
                                    <td style={{ padding: "2px 10px", borderTop: "1px solid #E2E4E7", borderRight: trennRand, fontWeight: 700, whiteSpace: "nowrap", color: "#22262B" }} title={rolle.label}>
                                      <span className="inline-flex items-center justify-center rounded-full text-white font-extrabold mr-1.5" style={{ width: "17px", height: "17px", fontSize: "0.5rem", backgroundColor: rolle.color, flexShrink: 0, verticalAlign: "middle" }}>{personKuerzel(person)}</span>
                                      {person}
                                    </td>
                                    <td style={{ padding: "2px 8px", borderTop: "1px solid #E2E4E7", borderRight: trennRand }}>
                                      <button
                                        onClick={() => { if (readerMode) return; setSchichtGanzeWoche(!schicht && !t.we); setSchichtPicker({ person, datum: t.key }); }}
                                        disabled={readerMode}
                                        className="inline-flex items-center justify-center rounded font-black"
                                        style={schicht
                                          ? { minWidth: "24px", height: "17px", padding: "0 5px", fontSize: "0.6rem", color: SCHICHTEN[schicht].text || "white", backgroundColor: SCHICHTEN[schicht].color, cursor: readerMode ? "default" : "pointer" }
                                          : { minWidth: "24px", height: "17px", padding: "0 5px", fontSize: "0.6rem", color: "#C3C7CB", backgroundColor: "transparent", border: "1px dashed #D6D9DC", cursor: readerMode ? "default" : "pointer" }}
                                        title={schicht ? `${schicht} – Schicht für ${person} ändern` : `Schicht für ${person} setzen`}
                                        aria-label={`Schicht ${person} ${t.key}`}
                                      >
                                        {schicht ? SCHICHTEN[schicht].kurz : "?"}
                                      </button>
                                    </td>
                                    <td
                                      onClick={(ev) => {
                                        // Klick auf die leere Fläche der Zeile öffnet direkt den Notiz-Dialog
                                        if (readerMode || ev.target !== ev.currentTarget) return;
                                        setPlanNotiz({ person, datum: t.key, text: "" });
                                      }}
                                      title={readerMode ? undefined : "Klick auf freie Fläche: Notiz direkt eintragen"}
                                      style={{ padding: "2px 10px", borderTop: "1px solid #E2E4E7", cursor: readerMode ? "default" : "pointer" }}
                                    >
                                      {geplantFuer(person, t.key).map((a) => {
                                        const c = a.art === "elek" ? ARBEIT_ART.elek.color : ARBEIT_ART.mech.color;
                                        return (
                                          <button key={a.id} onClick={() => openArbeitEdit(a)} className="rounded font-bold text-left" style={{ display: "inline-block", fontSize: "0.68rem", padding: "0 6px", margin: "1px 4px 1px 0", color: c, border: `1px solid ${c}`, backgroundColor: `${c}14`, wordBreak: "break-word" }} title={a.note}>
                                            {a.name}: {a.note.length > 60 ? a.note.slice(0, 60) + "…" : a.note}
                                          </button>
                                        );
                                      })}
                                      {notizenFuer(person, t.key).map((n) => (
                                        <button
                                          key={n.id}
                                          onClick={() => { if (readerMode) return; setPlanNotiz({ person, datum: t.key, id: n.id, text: n.note }); }}
                                          disabled={readerMode}
                                          className="rounded font-semibold text-left"
                                          style={{ display: "inline-block", fontSize: "0.68rem", padding: "0 6px", margin: "1px 4px 1px 0", color: "#39414B", border: "1px solid #E5D77A", backgroundColor: "#FEF9C3", wordBreak: "break-word", cursor: readerMode ? "default" : "pointer" }}
                                          title={n.note}
                                        >
                                          📝 {n.note.length > 60 ? n.note.slice(0, 60) + "…" : n.note}
                                        </button>
                                      ))}
                                      {!abwesend && !readerMode && (
                                        <button
                                          onClick={() => { setPickerArt("ALLE"); setPickerSuche(""); setPlanungPicker({ person, datum: t.key }); }}
                                          className="text-slate-300 hover:text-slate-600 font-black"
                                          style={{ fontSize: "0.8rem", lineHeight: 1, verticalAlign: "middle" }}
                                          title={`Arbeit oder Notiz für ${person} an diesem Tag eintragen`}
                                          aria-label="Arbeit oder Notiz eintragen"
                                        >
                                          ＋
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}

          {/* Schicht-Legende (Kürzel) */}
          {team.length > 0 && (
            <div className="mt-3 flex items-center gap-x-3 gap-y-1 flex-wrap">
              {Object.entries(SCHICHTEN).map(([name, s]) => (
                <span key={name} className="inline-flex items-center gap-1" style={{ fontSize: "0.66rem", fontWeight: 700, color: "#5B6572" }}>
                  <span className="inline-flex items-center justify-center rounded font-black" style={{ minWidth: "22px", height: "18px", padding: "0 5px", fontSize: "0.6rem", color: s.text || "white", backgroundColor: s.color }}>{s.kurz}</span>
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
              <span className="font-mono text-sm font-bold ml-2">{MONTHS[mm]} {my}</span>
              <button onClick={() => setMatrixCursor(new Date(my, mm + 1, 1))} className="px-2.5 py-1.5 rounded border bg-white" style={{ borderColor: "#D6D9DC" }} aria-label="Nächster Monat">›</button>
              <button onClick={() => setMatrixCursor(new Date())} className="px-3 py-1.5 rounded border bg-white text-xs font-bold uppercase" style={{ borderColor: "#D6D9DC" }}>Heute</button>
              <button
                onClick={handlePrintSchichtplan}
                className="flex items-center gap-1.5 text-white px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wide hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#C97A2B" }}
                aria-label="Schichtplan drucken"
              >
                <Printer size={14} /> Drucken
              </button>
              <span className="ml-auto text-xs text-slate-400">Werkstattschichtplan – Klick auf eine Zelle öffnet die Auswahl · gilt sofort auch in der Planung</span>
            </div>

            {team.length === 0 ? (
              <div className="rounded-xl p-8 text-center text-sm text-slate-500" style={{ backgroundColor: "white", border: "1.5px solid #6B7280" }}>
                Noch kein Team angelegt. Öffne den <strong>⚙-Verwalten-Dialog</strong> und trage unter „Team" deine Leute ein.
              </div>
            ) : (
              <div ref={matrixScrollRef} className="rounded-xl" style={{ backgroundColor: "white", border: "1.5px solid #6B7280", overflowX: "auto", padding: "4px" }}>
                <table style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1.5px solid #6B7280", background: "#F7F8F9", fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", color: "#8A9099", padding: "3px 8px", textAlign: "left", position: "sticky", left: 0, zIndex: 2 }}>KW</th>
                      {kwSegmente.map((s, i) => (
                        <th key={i} colSpan={s.span} style={{ border: "1.5px solid #6B7280", background: "#F7F8F9", fontSize: "0.6rem", fontWeight: 800, color: "#8A9099", padding: "3px 2px" }}>KW {s.kw}</th>
                      ))}
                    </tr>
                    <tr>
                      <th style={{ border: "1.5px solid #6B7280", boxShadow: "inset 0 0 0 2px #22262B", background: "#E9ECEF", fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", color: "#5B6572", padding: "3px 8px", textAlign: "left", position: "sticky", left: 0, zIndex: 2 }}>Mitarbeiter</th>
                      {tage.map((t) => {
                        const we = t.dow === 0 || t.dow === 6;
                        const ft = feiertage.get(t.key);
                        const heutig = t.key === todayKey;
                        const kwStart = t.dow === 1; // Montag = Beginn einer neuen KW - deutliche Abgrenzung zum Sonntag davor
                        const wochenendStart = t.dow === 6; // Samstag = Beginn des Wochenendes - Abgrenzung zum Freitag davor
                        return (
                          <th key={t.key} data-daykey={t.key} title={ft || undefined} style={{
                            border: "1.5px solid #6B7280",
                            borderLeft: heutig ? "3px solid #C97A2B" : kwStart ? "3px solid #22262B" : wochenendStart ? "3px solid #22262B" : "1.5px solid #6B7280",
                            borderRight: heutig ? "3px solid #C97A2B" : "1.5px solid #6B7280",
                            borderTop: heutig ? "3px solid #C97A2B" : "1.5px solid #6B7280",
                            minWidth: zellBreite,
                            background: ft ? "#FBE9E7" : heutig ? "#C97A2B" : we ? "#E5F0F8" : "#F7F8F9",
                            fontSize: "0.58rem", fontWeight: 800,
                            color: ft ? "#B23A34" : heutig ? "white" : we ? "#7FA6C4" : "#8A9099",
                            padding: "3px 2px",
                          }}>
                            {WEEKDAYS[(t.dow + 6) % 7]}<br />{t.nr}.
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rang = { mech: 0, elek: 1, azubi: 2 };
                      const haupt = [...team].filter((m) => (m.rolle || "") !== "").sort((a, b) => rang[a.rolle] - rang[b.rolle]);
                      const sonstige = team.filter((m) => (m.rolle || "") === "");
                      const zeile = (mitglied) => {
                        const person = mitglied.name;
                        const rolle = TEAM_ROLLEN[mitglied.rolle || ""];
                        return (
                          <tr key={person}>
                            <td style={{ border: "1.5px solid #6B7280", boxShadow: "inset 0 0 0 2px #22262B", background: "#E9ECEF", padding: "4px 8px", whiteSpace: "nowrap", position: "sticky", left: 0, zIndex: 1 }}>
                              <span className="inline-flex items-center justify-center rounded-full text-white font-extrabold mr-1.5" style={{ width: "18px", height: "18px", fontSize: "0.52rem", backgroundColor: rolle.color, verticalAlign: "middle" }} title={rolle.label}>{personKuerzel(person)}</span>
                              <span style={{ fontSize: "0.72rem", fontWeight: 700 }}>{person}</span>
                            </td>
                            {tage.map((t) => {
                              const we = t.dow === 0 || t.dow === 6;
                              const schicht = schichtFuer(person, t.key);
                              const heutig = t.key === todayKey;
                              const kwStart = t.dow === 1; // Montag = Beginn einer neuen KW - deutliche Abgrenzung zum Sonntag davor
                              const wochenendStart = t.dow === 6; // Samstag = Beginn des Wochenendes - Abgrenzung zum Freitag davor
                              return (
                                <td key={t.key} style={{
                                  border: "1.5px solid #6B7280",
                                  borderLeft: heutig ? "3px solid #C97A2B" : kwStart ? "3px solid #22262B" : wochenendStart ? "3px solid #22262B" : "1.5px solid #6B7280",
                                  borderRight: heutig ? "3px solid #C97A2B" : "1.5px solid #6B7280",
                                  padding: 0,
                                  background: heutig ? "#FDF3E7" : we ? "#EFF5FA" : "white",
                                }}>
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
                                      ? { minWidth: zellBreite, height: "26px", fontSize: "0.58rem", color: SCHICHTEN[schicht].text || "white", backgroundColor: SCHICHTEN[schicht].color, whiteSpace: "nowrap", overflow: "hidden" }
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
                      };
                      return (
                        <>
                          {haupt.map(zeile)}
                          {sonstige.length > 0 && (
                            <tr>
                              <td colSpan={tage.length + 1} style={{ border: "1.5px solid #6B7280", padding: 0, background: "#F0F1F3" }}>
                                {/* Sticky auf dem Knopf selbst, nicht auf der (spaltenübergreifenden) Zelle -
                                    eine so breite Zelle hat sonst keinen Spielraum, in dem "sticky" wirken könnte,
                                    und der Knopf würde beim automatischen Scrollen zur aktuellen Woche aus dem
                                    sichtbaren Bereich verschwinden. */}
                                <button
                                  onClick={() => setSonstigeOffen((o) => !o)}
                                  className="text-left"
                                  style={{ position: "sticky", left: 0, display: "inline-block", whiteSpace: "nowrap", padding: "6px 8px", fontSize: "0.68rem", fontWeight: 800, color: "#5B6572" }}
                                  aria-label="Sonstige auf- oder zuklappen"
                                >
                                  {sonstigeOffen ? "▾" : "▸"} Sonstige ({sonstige.length}) <span style={{ fontWeight: 400, color: "#8A9099" }}>– ohne Gewerk</span>
                                </button>
                              </td>
                            </tr>
                          )}
                          {sonstigeOffen && sonstige.map(zeile)}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}

            {team.length > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {Object.entries(SCHICHTEN).map(([name, s]) => (
                  <span key={name} className="rounded font-black uppercase" style={{ fontSize: "0.6rem", letterSpacing: "0.03em", padding: "2px 7px", color: s.text || "white", backgroundColor: s.color }}>{name}</span>
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
                className="block w-full text-left rounded font-bold mb-0.5"
                style={{ fontSize: "0.7rem", padding: "4px 8px", color: s.text || "white", backgroundColor: s.color }}
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

      {/* Einplanen-Auswahl: offene Arbeit für Person + Tag wählen.
          Rechtsbündig statt mittig, damit der Wochenplan dahinter sichtbar bleibt. */}
      {planungPicker && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.35)", display: "flex", alignItems: "center", justifyContent: "flex-end", zIndex: 60, padding: "16px" }}
          onClick={() => setPlanungPicker(null)}
        >
          <div
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "18px", width: "560px", maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
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
            {/* Filter + Suche, damit man bei vollem Backlog schnell die richtige Arbeit findet */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {[["ALLE", "Alle"], ["mech", "Mechanisch"], ["elek", "Elektrisch"], ["azubi", "🎓 Azubi"]].map(([wert, label]) => (
                <button
                  key={wert}
                  onClick={() => setPickerArt(wert)}
                  className="rounded border px-2 py-1 text-xs font-bold"
                  style={pickerArt === wert
                    ? { backgroundColor: "#22262B", color: "white", borderColor: "#22262B" }
                    : { backgroundColor: "white", color: "#5B6572", borderColor: "#D6D9DC" }}
                >
                  {label}
                </button>
              ))}
              <input
                type="search"
                value={pickerSuche}
                onChange={(e) => setPickerSuche(e.target.value)}
                placeholder="🔍 Anlage, Arbeit …"
                className="text-xs border rounded px-2 py-1 flex-1"
                style={{ borderColor: "#D6D9DC", minWidth: "140px" }}
              />
            </div>
            {(() => {
              const q = pickerSuche.trim().toLowerCase();
              const passt = (a) => {
                if (pickerArt === "azubi" && !a.azubi) return false;
                if ((pickerArt === "mech" || pickerArt === "elek") && a.art !== pickerArt && a.art !== "beide") return false;
                if (q && !`${a.name} ${a.note} ${a.wer || ""}`.toLowerCase().includes(q)) return false;
                return true;
              };
              const treffer = arbeitenOffen.filter(passt);
              if (arbeitenOffen.length === 0) return <div className="text-sm italic text-slate-400 py-4">Keine offenen Arbeiten im Backlog.</div>;
              if (treffer.length === 0) return <div className="text-sm italic text-slate-400 py-4">Keine Arbeit passt zu Filter/Suche.</div>;
              return (
                <div className="flex flex-col gap-1.5">
                  {treffer
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
                          {a.azubi ? <span title="Azubi-geeignet">🎓</span> : null}
                          {belegt && <span className="font-mono" style={{ fontSize: "0.62rem", color: "#B8791F" }} title="bereits eingeplant - wird umgeplant">{a.wer} · {formatDateDE(a.geplant)}</span>}
                        </button>
                      );
                    })}
                </div>
              );
            })()}
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
                  className="rounded px-2 py-2 text-xs font-black uppercase"
                  style={{ backgroundColor: s.color, color: s.text || "white", letterSpacing: "0.03em" }}
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
              onKeyDown={(ev) => {
                // Enter = speichern; neue Zeile weiterhin über Umschalt+Enter möglich
                if (ev.key === "Enter" && !ev.shiftKey) {
                  ev.preventDefault();
                  savePlanNotiz();
                }
              }}
              rows={3}
              autoFocus
              spellCheck
              lang="de"
              placeholder="z. B. ab 8:30 Zahnarzt, kommt später … (Enter = speichern)"
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

      {/* Störbericht erfassen / bearbeiten */}
      {stoerModal && sDraft && (() => {
        const offen = sDraft.status === "offen";
        const statusGewaehlt = sDraft.status === "offen" || sDraft.status === "erledigt";
        // Bei "Erledigt" gehört zur vollständigen Doku auch Ursache + Sofort Maßnahme.
        const erledigtVollstaendig = sDraft.status !== "erledigt" || (String(sDraft.ursache || "").trim() && String(sDraft.getan || "").trim());
        const kannSpeichern = String(sDraft.anlage || "").trim() && String(sDraft.stoerung || "").trim() && String(sDraft.schicht || "").trim() && statusGewaehlt && erledigtVollstaendig;
        const anlagenVorschlaege = Array.from(new Set([
          ...tpmAnlagen.map((a) => a.name),
          ...stoerungen.map((s) => s.anlage).filter(Boolean),
        ]));
        // Anlagenteile zur aktuell gewählten Anlage (von Roberto im ⚙-Dialog gepflegt)
        const teileZurAnlage = anlagenteile.filter((t) => t.anlage === String(sDraft.anlage || "").trim());
        const schliessen = () => { setStoerModal(null); setSDraft(null); };

        // ---- View-Modus: kompletter Bericht, zunächst NUR LESEND ----
        if (stoerModal.mode === "view") {
          const live = stoerungen.find((x) => x.id === stoerModal.id) || {};
          const dObj = sDraft.date ? new Date(sDraft.date + "T00:00:00") : null;
          const farbe = SCHICHTEN[sDraft.schicht] || { color: "#8A9099", text: "#fff" };
          const feld = (lab, val, akzent) => (val && String(val).trim()) ? (
            <div className="py-2.5" style={{ borderTop: "1px solid #EFF1F3" }}>
              <div className="font-extrabold uppercase" style={{ fontSize: "0.62rem", letterSpacing: "0.5px", color: akzent || "#8A9099", marginBottom: "3px" }}>{lab}</div>
              <div style={{ fontSize: "0.94rem", color: "#39414B", whiteSpace: "pre-wrap", wordBreak: "break-word", fontWeight: akzent ? 600 : 400 }}>{val}</div>
            </div>
          ) : null;
          return (
            <div className="no-print" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }} onClick={schliessen}>
              <div style={{ backgroundColor: "white", borderRadius: "12px", width: "560px", maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)", overflow: "hidden" }} onClick={(ev) => ev.stopPropagation()}>
                {/* Kopfband */}
                <div className="px-5 py-3 flex items-center gap-2 flex-wrap" style={{ backgroundColor: offen ? "#FBEAE8" : "#EAF3EC", borderBottom: `1px solid ${offen ? "#E7B9B3" : "#BFE0C6"}` }}>
                  <span className="font-black" style={{ fontSize: "1.05rem", color: "#22262B" }}>Störbericht</span>
                  <span className="inline-flex items-center rounded-full font-extrabold uppercase" style={{ fontSize: "0.6rem", letterSpacing: "0.3px", padding: "3px 9px", backgroundColor: "#fff", color: offen ? "#C0392B" : "#1F7A3D" }}>{offen ? "offen" : "✓ behoben"}</span>
                  <span className="ml-auto" />
                  <button onClick={schliessen} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
                </div>
                <div className="px-5 py-3">
                  {/* Kenndaten */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-extrabold" style={{ fontSize: "1.05rem", color: "#22262B" }}>{sDraft.anlage || "—"}</span>
                    {sDraft.anlagenteil && <span className="rounded" style={{ fontSize: "0.72rem", padding: "2px 8px", backgroundColor: "#EEF1F4", color: "#5B6572", fontWeight: 700 }}>{sDraft.anlagenteil}</span>}
                    {sDraft.schicht && <span className="inline-flex items-center rounded font-extrabold uppercase" style={{ fontSize: "0.62rem", padding: "2px 9px", backgroundColor: farbe.color, color: farbe.text || "#fff" }}>{sDraft.schicht}</span>}
                    {STOER_GEWERK[sDraft.gewerk] && <span className="inline-flex items-center rounded font-bold" style={{ fontSize: "0.66rem", padding: "2px 8px", backgroundColor: STOER_GEWERK[sDraft.gewerk].bg, color: STOER_GEWERK[sDraft.gewerk].color }}>{STOER_GEWERK[sDraft.gewerk].kurz}</span>}
                    {sDraft.fehlerart && <span className="inline-flex items-center rounded font-bold" style={{ fontSize: "0.66rem", padding: "2px 8px", backgroundColor: "#F0F2F5", color: "#5B6572" }}>{sDraft.fehlerart}</span>}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap mb-1" style={{ fontSize: "0.78rem", color: "#8A9099" }}>
                    <span>{dObj ? dObj.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "ohne Datum"}</span>
                    {(Number(sDraft.ausfallzeit) || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 rounded font-bold" style={{ fontSize: "0.74rem", padding: "2px 9px", backgroundColor: "#FBF3DA", color: "#9A6B00" }}>⏱ Ausfallzeit {minutenText(sDraft.ausfallzeit)}</span>
                    )}
                  </div>
                  {feld("⚠ Störungs Beschreibung", sDraft.stoerung)}
                  {feld("🔍 Störungs Ursache", sDraft.ursache)}
                  {feld("🔧 Sofort Maßnahme", sDraft.getan)}
                  {feld("🧩 Ersatzteile / Material", sDraft.ersatzteile ? sDraft.ersatzteile + (sDraft.nachbestellt ? "  ·  🛒 nachbestellt" : "") : "")}
                  {offen && feld("📌 Zu Planende Maßnahme", sDraft.nochZuTun, "#C0392B")}
                  {/* Historie: frühere Berichte derselben Anlage */}
                  {(() => {
                    const anl = String(sDraft.anlage || "").trim().toLowerCase();
                    if (!anl) return null;
                    const frueher = stoerungen
                      .filter((x) => x.id !== stoerModal.id && String(x.anlage || "").trim().toLowerCase() === anl)
                      .sort((a, b) => String(b.gemeldetAt || b.date).localeCompare(String(a.gemeldetAt || a.date)));
                    if (frueher.length === 0) return null;
                    return (
                      <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: "#F7F9FB", border: "1px solid #E7EAED" }}>
                        <div className="font-extrabold uppercase mb-1.5" style={{ fontSize: "0.62rem", letterSpacing: "0.5px", color: "#5B6572" }}>♻️ {frueher.length} frühere(r) Bericht(e) zu dieser Anlage</div>
                        {frueher.slice(0, 4).map((x) => (
                          <div key={x.id} className="flex items-center gap-2" style={{ fontSize: "0.78rem", color: "#5B6572", padding: "1px 0" }}>
                            <span className="font-mono flex-shrink-0" style={{ color: "#8A9099" }}>{x.date ? formatDateDE(x.date) : "—"}</span>
                            {x.anlagenteil && <span className="flex-shrink-0" style={{ color: "#8A9099" }}>{x.anlagenteil}</span>}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.stoerung || "—"}</span>
                          </div>
                        ))}
                        {frueher.length > 4 && <div style={{ fontSize: "0.72rem", color: "#A6AEB6", marginTop: "2px" }}>… und {frueher.length - 4} weitere (siehe Suche)</div>}
                      </div>
                    );
                  })()}
                </div>
                {/* Fuß: Meta + Bearbeiten entsichert */}
                <div className="px-5 py-3 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid #EFF1F3", backgroundColor: "#FAFBFC" }}>
                  <span style={{ fontSize: "0.75rem", color: "#8A9099" }}>
                    {live.melder ? `${live.melder} · ` : ""}erfasst {live.gemeldetAt ? new Date(live.gemeldetAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                    {!offen && live.behobenAt ? ` · behoben ${new Date(live.behobenAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                  </span>
                  <span className="ml-auto" />
                  {offen && !readerMode && sDraft.nochZuTun && String(sDraft.nochZuTun).trim() && (
                    <button onClick={() => stoerungZuBacklog(live)} className="rounded-lg font-bold inline-flex items-center gap-1" style={{ fontSize: "0.8rem", padding: "8px 12px", backgroundColor: "#EEF1F4", color: "#2F6690" }} title="Offene Maßnahme als Backlog-Aufgabe übernehmen">→ Backlog</button>
                  )}
                  <button onClick={() => druckeStoerbericht(live)} className="rounded-lg font-bold inline-flex items-center gap-1" style={{ fontSize: "0.8rem", padding: "8px 12px", backgroundColor: "#EEF1F4", color: "#5B6572" }} title="Störbericht als A4-Blatt drucken">🖨 Drucken</button>
                  {stoerDarfSchreiben ? (
                    <button onClick={() => setStoerModal({ mode: "edit", id: stoerModal.id })} className="rounded-lg font-bold text-white inline-flex items-center gap-1.5" style={{ fontSize: "0.85rem", padding: "8px 16px", backgroundColor: "#22262B" }}>
                      🔓 Bearbeiten
                    </button>
                  ) : (
                    <span className="text-xs italic" style={{ color: "#A6AEB6" }}>nur Ansicht</span>
                  )}
                  <button onClick={schliessen} className="rounded-lg font-bold" style={{ fontSize: "0.85rem", padding: "8px 14px", backgroundColor: "#EEF1F4", color: "#5B6572" }}>Schließen</button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            className="no-print"
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
            onClick={schliessen}
          >
            <div
              style={{ backgroundColor: "white", borderRadius: "12px", padding: "20px", width: "540px", maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="font-black text-base" style={{ color: "#22262B" }}>{stoerModal.mode === "add" ? "📝 Störbericht erfassen" : "Störbericht bearbeiten"}</div>
                <button onClick={() => { setStoerModal(null); setSDraft(null); }} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
              </div>

              {/* Status-Umschalter (Pflicht, nicht vorausgewählt) */}
              <div className="flex items-center gap-2 my-3">
                <span className="text-xs font-bold uppercase" style={{ color: "#8A9099" }}>Status<span style={{ color: "#C0392B" }}> *</span>:</span>
                <div className="inline-flex rounded-lg overflow-hidden" style={{ border: `1.5px solid ${statusGewaehlt ? "#E2E4E7" : "#E7B9B3"}` }}>
                  <button onClick={() => setSDraft({ ...sDraft, status: "offen" })} className="font-bold" style={{ fontSize: "0.84rem", padding: "6px 16px", backgroundColor: sDraft.status === "offen" ? "#C0392B" : "transparent", color: sDraft.status === "offen" ? "#fff" : "#5B6572" }}>● Offen</button>
                  <button onClick={() => setSDraft({ ...sDraft, status: "erledigt" })} className="font-bold" style={{ fontSize: "0.84rem", padding: "6px 16px", backgroundColor: sDraft.status === "erledigt" ? "#1F7A3D" : "transparent", color: sDraft.status === "erledigt" ? "#fff" : "#5B6572" }}>● Erledigt</button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {/* Datum + Schicht (Pflicht, wie im Schichtbuch) */}
                <div className="flex gap-3 flex-wrap">
                  <div>
                    <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>Datum</label>
                    <input type="date" value={sDraft.date || ""} onChange={(ev) => setSDraft({ ...sDraft, date: ev.target.value })} className="text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#D6D9DC" }} />
                  </div>
                  <div className="flex-1" style={{ minWidth: "220px" }}>
                    <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>Schicht<span style={{ color: "#C0392B" }}> *</span></label>
                    <div className="flex gap-2">
                      {STOER_SCHICHTEN.map((sch) => {
                        const aktiv = sDraft.schicht === sch;
                        const farbe = SCHICHTEN[sch] || {};
                        return (
                          <button key={sch} onClick={() => setSDraft({ ...sDraft, schicht: sch })}
                            className="flex-1 rounded-lg font-bold text-center"
                            style={{ padding: "8px 6px", fontSize: "0.82rem", border: `2px solid ${aktiv ? (farbe.color || "#22262B") : "#E2E4E7"}`, backgroundColor: aktiv ? (farbe.color || "#22262B") : "transparent", color: aktiv ? (farbe.text || "#fff") : "#5B6572" }}>
                            {sch}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Anlage + Anlagenteil nebeneinander */}
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1" style={{ minWidth: "200px" }}>
                    <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>Anlage / Bereich<span style={{ color: "#C0392B" }}> *</span></label>
                    <input
                      list="stoer-anlagen"
                      value={sDraft.anlage}
                      onChange={(ev) => setSDraft({ ...sDraft, anlage: ev.target.value, anlagenteil: "" })}
                      placeholder="z. B. Presse 3"
                      className="w-full text-sm border rounded-lg px-3 py-2"
                      style={{ borderColor: "#D6D9DC" }}
                    />
                    <datalist id="stoer-anlagen">{anlagenVorschlaege.map((n) => <option key={n} value={n} />)}</datalist>
                  </div>
                  <div className="flex-1" style={{ minWidth: "200px" }}>
                    <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>Anlagenteil</label>
                    {teileZurAnlage.length > 0 ? (
                      <select value={sDraft.anlagenteil || ""} onChange={(ev) => setSDraft({ ...sDraft, anlagenteil: ev.target.value })} className="w-full text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#D6D9DC" }}>
                        <option value="">– kein bestimmtes Teil –</option>
                        {teileZurAnlage.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                      </select>
                    ) : (
                      <div className="text-xs italic px-1 py-2.5" style={{ color: "#A6AEB6" }}>
                        {String(sDraft.anlage || "").trim() ? "Für diese Anlage sind noch keine Teile hinterlegt (⚙ oben rechts)." : "Erst eine Anlage wählen."}
                      </div>
                    )}
                  </div>
                </div>

                {/* Gewerk + Fehlerart */}
                <div className="flex gap-3 flex-wrap">
                  {/* Mindestmaß muss zu den drei Knöpfen darin passen (3 x 90 px + Abstände),
                      sonst quellen sie über, statt dass die Zeile umbricht. */}
                  <div className="flex-1" style={{ minWidth: "290px" }}>
                    <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>Gewerk</label>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(STOER_GEWERK).map(([key, g]) => {
                        const aktiv = sDraft.gewerk === key;
                        return (
                          <button key={key} onClick={() => setSDraft({ ...sDraft, gewerk: aktiv ? "" : key })}
                            className="flex-1 rounded-lg font-bold text-center"
                            style={{ minWidth: "90px", padding: "8px 6px", fontSize: "0.78rem", border: `2px solid ${aktiv ? g.color : "#E2E4E7"}`, backgroundColor: aktiv ? g.bg : "transparent", color: aktiv ? g.color : "#5B6572" }}>
                            {g.kurz}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>Fehlerart</label>
                    <select value={sDraft.fehlerart || ""} onChange={(ev) => setSDraft({ ...sDraft, fehlerart: ev.target.value })} className="text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#D6D9DC", minWidth: "180px" }}>
                      <option value="">– keine Angabe –</option>
                      {STOER_FEHLERARTEN.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>

                {/* Ausfallzeit (orange hervorgehoben) + Behoben-am bei Erledigt */}
                <div className="flex gap-3 flex-wrap items-start">
                  <div className="rounded-lg p-3" style={{ backgroundColor: "#FBF3DA", border: "1px solid #E7CF8F" }}>
                    <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#9A6B00" }}>⏱ Ausfallzeit (Minuten)</label>
                    <input type="number" min="0" step="5" value={sDraft.ausfallzeit ?? ""} onChange={(ev) => setSDraft({ ...sDraft, ausfallzeit: ev.target.value })} placeholder="0" className="text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#E7CF8F", width: "130px", backgroundColor: "#fff" }} />
                  </div>
                  {sDraft.status === "erledigt" && (
                    <div className="rounded-lg p-3" style={{ backgroundColor: "#EAF3EC", border: "1px solid #BFE0C6" }}>
                      <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#1F7A3D" }}>✓ Behoben am</label>
                      <input type="datetime-local" value={sDraft.behobenAt || ""} onChange={(ev) => setSDraft({ ...sDraft, behobenAt: ev.target.value })} className="text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#BFE0C6", backgroundColor: "#fff" }} />
                      <div className="text-xs mt-1" style={{ color: "#6B9576" }}>leer = jetzt</div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>⚠ Störungs Beschreibung<span style={{ color: "#C0392B" }}> *</span></label>
                  <textarea value={sDraft.stoerung} onChange={(ev) => setSDraft({ ...sDraft, stoerung: ev.target.value })} rows={2} placeholder="Was funktioniert nicht?" className="w-full text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#D6D9DC" }} />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>🔍 Störungs Ursache</label>
                  <input value={sDraft.ursache} onChange={(ev) => setSDraft({ ...sDraft, ursache: ev.target.value })} placeholder="falls bekannt" className="w-full text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#D6D9DC" }} />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>🔧 Sofort Maßnahme</label>
                  <textarea value={sDraft.getan} onChange={(ev) => setSDraft({ ...sDraft, getan: ev.target.value })} rows={2} placeholder="Was wurde sofort getan?" className="w-full text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#D6D9DC" }} />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>🧩 Ersatzteile / Material</label>
                  <input value={sDraft.ersatzteile} onChange={(ev) => setSDraft({ ...sDraft, ersatzteile: ev.target.value })} placeholder="verbaute / benötigte Teile" className="w-full text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#D6D9DC" }} />
                  <label className="flex items-center gap-2 mt-1.5 text-xs" style={{ color: "#5B6572" }}>
                    <input type="checkbox" checked={!!sDraft.nachbestellt} onChange={(ev) => setSDraft({ ...sDraft, nachbestellt: ev.target.checked })} />
                    Ersatzteil nachbestellt
                  </label>
                </div>

                {/* Nur bei Offen: Zu Planende Maßnahme */}
                {offen && (
                  <div className="rounded-lg p-3" style={{ backgroundColor: "#FBEAE8", border: "1px solid #E7B9B3" }}>
                    <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#C0392B" }}>📌 Zu Planende Maßnahme</label>
                    <textarea value={sDraft.nochZuTun} onChange={(ev) => setSDraft({ ...sDraft, nochZuTun: ev.target.value })} rows={2} placeholder="Was muss noch geplant/erledigt werden?" className="w-full text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#D8A9A2" }} />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-extrabold uppercase mb-1" style={{ color: "#5B6572" }}>Bearbeiter (Kürzel)</label>
                  <input value={sDraft.melder} onChange={(ev) => setSDraft({ ...sDraft, melder: ev.target.value })} placeholder="z. B. RC" className="w-full text-sm border rounded-lg px-3 py-2" style={{ borderColor: "#D6D9DC", maxWidth: "160px" }} />
                </div>

                {!kannSpeichern && (
                  <div className="text-xs" style={{ color: "#C0392B" }}>
                    Bitte die Pflichtfelder <strong>*</strong> ausfüllen: Anlage, Beschreibung, Schicht und Status.
                    {sDraft.status === "erledigt" && !erledigtVollstaendig && " Bei Erledigt zusätzlich Ursache und Sofort Maßnahme."}
                  </div>
                )}
                <div className="flex gap-2 items-center mt-1 flex-wrap">
                  <button onClick={() => speichereStoerung(sDraft)} disabled={!kannSpeichern} className="flex-1 text-sm font-bold py-2.5 rounded-lg text-white" style={{ backgroundColor: kannSpeichern ? "#22262B" : "#B7BEC6", minWidth: "120px" }}>Speichern</button>
                  <button
                    disabled
                    title="Weiterleiten kommt in einer späteren Version"
                    className="rounded-lg font-bold inline-flex items-center gap-1"
                    style={{ fontSize: "0.78rem", padding: "9px 12px", border: "1.5px dashed #C4CBD2", color: "#A6AEB6", cursor: "not-allowed" }}
                  >
                    📤 Weiterleiten <span style={{ fontSize: "0.56rem", backgroundColor: "#FBF3DA", color: "#9A6B00", padding: "1px 5px", borderRadius: "10px" }}>bald</span>
                  </button>
                  {stoerModal.mode === "edit" && (
                    <button onClick={() => loescheStoerung(stoerModal.id)} className="text-sm font-bold py-2.5 px-4 rounded-lg" style={{ backgroundColor: "#FBEAE8", color: "#C0392B" }}>Löschen</button>
                  )}
                  <button onClick={() => { if (stoerModal.mode === "edit" && stoerModal.id) { setStoerModal({ mode: "view", id: stoerModal.id }); } else { setStoerModal(null); setSDraft(null); } }} className="text-sm font-bold py-2.5 px-4 rounded-lg bg-slate-100 text-slate-500">Abbrechen</button>
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
                {shareState.status === "connected" && shareState.mode !== "read" && (
                  <button onClick={disconnectShared} className="text-sm font-bold py-2.5 rounded bg-slate-100 text-slate-500">
                    Verbindung trennen (dieser Rechner speichert dann nur lokal)
                  </button>
                )}

                {/* Konflikt-Wächter: OneDrive-Konfliktkopien automatisch einsammeln */}
                {shareState.status === "connected" && shareState.mode !== "read" && (
                  <div className="rounded px-3 py-2.5" style={{ border: "1.5px solid #6B7280", backgroundColor: "#F7F8F9" }}>
                    <div className="text-xs font-bold uppercase mb-1" style={{ color: "#5B6572" }}>Konflikt-Wächter</div>
                    <div className="text-xs mb-2" style={{ color: "#8A9099", lineHeight: 1.5 }}>
                      OneDrive legt bei Sync-Konflikten Kopien wie „…-GERÄTENAME.json" an. Mit einmaliger
                      Ordner-Freigabe sammelt die App solche Kopien automatisch ein: Der Inhalt wird sicher in die
                      Hauptdatei übernommen, die Kopie danach gelöscht – du bekommst dann eine kurze grüne Meldung.
                    </div>
                    {sharedFile.folderStatus() === "ok" ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold" style={{ color: "#2F7D4F" }}>✓ Aktiv – überwacht „{sharedFile.folderName()}"</span>
                        <button
                          onClick={async () => { await sharedFile.forgetFolder(); setShareState({ ...shareState }); }}
                          className="text-xs font-bold underline"
                          style={{ color: "#8A9099" }}
                        >
                          abschalten
                        </button>
                      </div>
                    ) : sharedFile.folderStatus() === "needs-permission" ? (
                      <button
                        onClick={async () => {
                          try { await sharedFile.reconnectFolder(); setShareState({ ...shareState }); }
                          catch (e) { setErr("Konflikt-Wächter: " + (e && e.message ? e.message : "Freigabe fehlgeschlagen.")); }
                        }}
                        className="text-xs font-bold py-2 px-3 rounded text-white"
                        style={{ backgroundColor: "#C97A2B" }}
                      >
                        Ordner-Zugriff erneut erlauben (nach Browser-Neustart)
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          try { await sharedFile.pickFolder(); setShareState({ ...shareState }); }
                          catch (e) { if (e && e.name !== "AbortError") setErr("Konflikt-Wächter: " + (e && e.message ? e.message : "Freigabe fehlgeschlagen.")); }
                        }}
                        className="text-xs font-bold py-2 px-3 rounded text-white"
                        style={{ backgroundColor: "#2F6690" }}
                      >
                        Werkstatt-Ordner freigeben … (Ordner mit der Daten-Datei wählen)
                      </button>
                    )}
                  </div>
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

                  {/* Wissens-Felder für die TPM-Übersicht: Info, Rechtsgrundlage, Link */}
                  <div className="flex flex-col gap-1.5 mt-1 pt-2" style={{ borderTop: "1px dashed #D6D9DC" }}>
                    <textarea
                      value={r.info || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, info: v } : x)));
                      }}
                      placeholder="Info / Zweck (Was wird geprüft? Warum ist es wichtig?)"
                      rows={2}
                      className="text-xs border rounded px-2 py-1.5"
                      style={{ borderColor: "#D6D9DC", resize: "vertical" }}
                    />
                    <div className="flex gap-1.5 items-center flex-wrap">
                      <input
                        value={r.rechtsgrundlage || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, rechtsgrundlage: v } : x)));
                        }}
                        placeholder="Rechtsgrundlage (z. B. DGUV Regel 108-007, DIN EN 15635)"
                        className="flex-1 text-xs border rounded px-2 py-1.5"
                        style={{ borderColor: "#D6D9DC", minWidth: "160px" }}
                      />
                      <input
                        value={r.link || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSettingsRi((prev) => prev.map((x, i) => (i === idx ? { ...x, link: v } : x)));
                        }}
                        placeholder="Link (https://…)"
                        className="flex-1 text-xs border rounded px-2 py-1.5"
                        style={{ borderColor: "#D6D9DC", minWidth: "160px" }}
                      />
                    </div>
                  </div>
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

            <div className="text-xs font-bold uppercase mb-2 pt-3 border-t" style={{ color: "#5B6572", borderColor: "#E2E4E7" }}>Schichtarten</div>
            <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
              Feste Schichtarten (Farben sind fix, nur Früh/Spät/Nacht farbig) plus eigene – neue Schichtarten sind automatisch grau.
            </div>
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {Object.entries(SCHICHTEN_BASIS).map(([name, s]) => (
                <span key={name} className="rounded font-black uppercase" style={{ fontSize: "0.6rem", letterSpacing: "0.03em", padding: "2px 7px", color: s.text || "white", backgroundColor: s.color }}>{name}</span>
              ))}
            </div>
            {settingsSchichten.length > 0 && (
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {settingsSchichten.map((s, idx) => (
                  <span key={s.name} className="inline-flex items-center gap-1 rounded font-black uppercase" style={{ fontSize: "0.6rem", letterSpacing: "0.03em", padding: "2px 4px 2px 7px", color: "white", backgroundColor: SCHICHT_GRAU }}>
                    {s.name} ({s.kurz})
                    <button
                      onClick={() => setSettingsSchichten((prev) => prev.filter((_, i) => i !== idx))}
                      className="hover:opacity-70"
                      aria-label={`Schichtart ${s.name} entfernen`}
                      title="Eigene Schichtart entfernen (bereits eingetragene Schichten bleiben in den Daten)"
                    ><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mb-5">
              <input
                value={neueSchichtName}
                onChange={(e) => setNeueSchichtName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const n = neueSchichtName.trim();
                  if (!n || SCHICHTEN_BASIS[n] || settingsSchichten.some((s) => s.name === n)) return;
                  setSettingsSchichten((prev) => [...prev, { name: n, kurz: schichtKurz(n) }]);
                  setNeueSchichtName("");
                }}
                placeholder="Neue Schichtart, z. B. Lehrgang"
                className="text-sm border rounded px-2 py-1.5"
                style={{ borderColor: "#D6D9DC", width: "220px" }}
                aria-label="Neue Schichtart"
              />
              <button
                onClick={() => {
                  const n = neueSchichtName.trim();
                  if (!n || SCHICHTEN_BASIS[n] || settingsSchichten.some((s) => s.name === n)) return;
                  setSettingsSchichten((prev) => [...prev, { name: n, kurz: schichtKurz(n) }]);
                  setNeueSchichtName("");
                }}
                className="text-xs font-bold"
                style={{ color: "#22262B" }}
              >
                + Schichtart hinzufügen
              </button>
            </div>

            <div className="text-xs font-bold uppercase mb-2 pt-3 border-t" style={{ color: "#5B6572", borderColor: "#E2E4E7" }}>Anlagenteile (für Störberichte)</div>
            <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
              Teile je Anlage – erscheinen beim Melden einer Störung als Auswahl neben der Anlage. Nur du pflegst diese Liste.
            </div>
            {(() => {
              const proAnlage = new Map();
              settingsAnlagenteile.forEach((t) => {
                if (!proAnlage.has(t.anlage)) proAnlage.set(t.anlage, []);
                proAnlage.get(t.anlage).push(t);
              });
              return Array.from(proAnlage.keys()).sort().map((anlage) => (
                <div key={anlage} className="mb-2">
                  <div className="text-xs font-bold" style={{ color: "#39414B" }}>{anlage}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {proAnlage.get(anlage).map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1 rounded" style={{ fontSize: "0.68rem", padding: "2px 4px 2px 8px", color: "#39414B", backgroundColor: "#EEF1F4" }}>
                        {t.name}
                        <button onClick={() => setSettingsAnlagenteile((prev) => prev.filter((x) => x.id !== t.id))} className="hover:opacity-70" aria-label={`Anlagenteil ${t.name} entfernen`} title="Anlagenteil entfernen"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              ));
            })()}
            <div className="flex items-center gap-2 mb-5 mt-2 flex-wrap">
              <select value={neuesTeilAnlage} onChange={(e) => setNeuesTeilAnlage(e.target.value)} className="text-sm border rounded px-2 py-1.5" style={{ borderColor: "#D6D9DC", maxWidth: "200px" }} aria-label="Anlage für neues Teil">
                <option value="">– Anlage wählen –</option>
                {settingsTpm.filter((a) => a.name.trim()).map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
              <input
                value={neuesTeilName}
                onChange={(e) => setNeuesTeilName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const n = neuesTeilName.trim();
                  if (!n || !neuesTeilAnlage) return;
                  setSettingsAnlagenteile((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, anlage: neuesTeilAnlage, name: n }]);
                  setNeuesTeilName("");
                }}
                placeholder="Anlagenteil, z. B. Ventilblock"
                className="text-sm border rounded px-2 py-1.5"
                style={{ borderColor: "#D6D9DC", width: "220px" }}
                aria-label="Neues Anlagenteil"
              />
              <button
                onClick={() => {
                  const n = neuesTeilName.trim();
                  if (!n || !neuesTeilAnlage) return;
                  setSettingsAnlagenteile((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, anlage: neuesTeilAnlage, name: n }]);
                  setNeuesTeilName("");
                }}
                className="text-xs font-bold"
                style={{ color: neuesTeilAnlage && neuesTeilName.trim() ? "#22262B" : "#B7BEC6" }}
              >
                + Anlagenteil hinzufügen
              </button>
            </div>

            <div className="text-xs font-bold uppercase mb-2 pt-3 border-t" style={{ color: "#5B6572", borderColor: "#E2E4E7" }}>Dein Name (dieses Gerät)</div>
            <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
              Wird im Verlauf und bei Störmeldungen als Urheber eingetragen. Bleibt auf diesem Gerät.
            </div>
            <input
              value={zettelName}
              onChange={(e) => { setZettelName(e.target.value); try { localStorage.setItem("werkstatt-kalender-name", e.target.value.trim()); } catch (err) { /* Speicher voll o. ä. */ } }}
              placeholder="z. B. R. Ciraci"
              className="w-full text-sm px-2 py-1.5 rounded border mb-5"
              style={{ borderColor: "#D7DCE1" }}
            />

            <div className="text-xs font-bold uppercase mb-2 pt-3 border-t" style={{ color: "#5B6572", borderColor: "#E2E4E7" }}>Verlauf (wer hat was geändert)</div>
            <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
              Änderungen der letzten 90 Tage aus der gemeinsamen Datei. Wer keinen Namen hinterlegt hat, erscheint als „Unbekannt".
            </div>
            {verlauf.length === 0 ? (
              <div className="text-xs italic mb-5" style={{ color: "#C3C7CB" }}>
                {sharedFile.isConnected() ? "Noch keine Änderungen aufgezeichnet." : "Ohne verbundene gemeinsame Datei wird kein Verlauf geführt."}
              </div>
            ) : (
              <div className="flex flex-col gap-1 mb-5" style={{ maxHeight: "200px", overflowY: "auto" }}>
                {verlauf.slice(0, 60).map((v) => (
                  <div key={v.id} className="flex items-baseline gap-2 px-2 py-1.5 rounded" style={{ backgroundColor: "#F7F8F9" }}>
                    <span className="text-xs font-mono flex-shrink-0" style={{ color: "#8A9099" }}>
                      {new Date(v.ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: "#2F6690" }}>{v.wer}</span>
                    <span className="text-xs" style={{ color: "#22262B" }}>{v.was}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="text-xs font-bold uppercase mb-2 pt-3 border-t" style={{ color: "#5B6572", borderColor: "#E2E4E7" }}>Sicherungen (dieses Gerät)</div>
            <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
              Bei jedem Speichern wird der Stand hier zusätzlich lokal gesichert - falls doch mal etwas schiefgeht, kannst du eine frühere Version wiederherstellen.
            </div>
            {backups.length === 0 ? (
              <div className="text-xs italic mb-5" style={{ color: "#C3C7CB" }}>Noch keine Sicherung vorhanden.</div>
            ) : (
              <div className="flex flex-col gap-1 mb-5" style={{ maxHeight: "160px", overflowY: "auto" }}>
                {backups.slice(0, 15).map((b) => (
                  <div key={b.ts} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded" style={{ backgroundColor: "#F7F8F9" }}>
                    <span className="text-xs font-mono" style={{ color: "#5B6572" }}>
                      {new Date(b.ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      <span style={{ color: "#C3C7CB" }}> · {(b.entries || []).length} Einträge</span>
                    </span>
                    <button onClick={() => setRestoreConfirm(b)} className="text-xs font-bold flex-shrink-0" style={{ color: "#2F6690" }}>
                      Wiederherstellen
                    </button>
                  </div>
                ))}
              </div>
            )}

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

      {/* Sicherung wiederherstellen: bestätigen, da das den aktuellen Stand ersetzt */}
      {/* Erinnerung, alte Jahrgänge auszulagern, bevor der Zwischenspeicher eng wird */}
      {archivHinweis && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 75, padding: "16px" }}
          onClick={() => archivErinnerungVerschieben(30)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: "14px", maxWidth: "540px", width: "100%", padding: "22px", boxShadow: "0 18px 50px rgba(20,22,25,0.3)" }}>
            <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: "#C97A2B" }}>Aufräumen empfohlen</div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800, margin: "5px 0 10px", color: "#22262B" }}>
              Dein Bestand reicht {archivHinweis.jahre} Jahre zurück
            </div>
            <div style={{ fontSize: "0.85rem", lineHeight: 1.55, color: "#4B5259" }}>
              Seit {archivHinweis.aeltestesJahr} sind rund <strong>{archivHinweis.groesseKB} KB</strong> zusammengekommen.
              Der Zwischenspeicher eines Browsers fasst etwa 5 MB – das reicht noch eine Weile, aber es ist der
              richtige Moment, alte Jahrgänge in Ruhe auszulagern statt später unter Druck.
            </div>
            <div style={{ marginTop: "14px", padding: "12px 14px", backgroundColor: "#F7F8F9", borderRadius: "10px" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#22262B", display: "block", marginBottom: "7px" }}>
                Auslagern bis einschließlich Jahr
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={archivGrenze ?? ""}
                  onChange={(e) => { setArchivGrenze(Number(e.target.value)); setArchivGesichert(false); }}
                  aria-label="Archiv-Grenzjahr"
                  className="text-sm rounded border px-2 py-1.5"
                  style={{ borderColor: "#D7DCE1", fontWeight: 700 }}
                >
                  {Array.from({ length: Math.max(1, today.getFullYear() - archivHinweis.aeltestesJahr) }, (_, i) => archivHinweis.aeltestesJahr + i)
                    .map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
                <span style={{ fontSize: "0.78rem", color: "#6B7480" }}>
                  betrifft {entries.filter((e) => String(e.date || "").slice(0, 4) <= String(archivGrenze)).length} Einträge
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#6B7480", marginTop: "9px", lineHeight: 1.5 }}>
                Erst herunterladen, dann entfernen. Die Archivdatei kannst du jederzeit über „Daten einlesen" wieder öffnen.
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  onClick={archivHerunterladen}
                  className="text-xs font-bold py-2 px-3 rounded text-white"
                  style={{ backgroundColor: "#2F6690" }}
                >
                  1. Archivdatei herunterladen
                </button>
                <button
                  onClick={archivAuslagern}
                  disabled={!archivGesichert}
                  className="text-xs font-bold py-2 px-3 rounded"
                  style={{
                    backgroundColor: archivGesichert ? "#B23A34" : "#EDEFF2",
                    color: archivGesichert ? "#fff" : "#B7BEC6",
                    cursor: archivGesichert ? "pointer" : "not-allowed",
                  }}
                  title={archivGesichert ? "" : "Erst die Archivdatei herunterladen"}
                >
                  2. Aus dem Bestand entfernen
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => archivErinnerungVerschieben(90)} className="flex-1 text-sm font-bold py-2.5 rounded bg-slate-100 text-slate-600">
                Später erinnern (3 Monate)
              </button>
              <button onClick={() => archivErinnerungVerschieben(365)} className="flex-1 text-sm font-bold py-2.5 rounded bg-slate-100 text-slate-500">
                Erst nächstes Jahr
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreConfirm && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: "16px" }}
          onClick={() => setRestoreConfirm(null)}
        >
          <div
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", width: "420px", maxWidth: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="font-bold text-sm mb-2">Sicherung wiederherstellen?</div>
            <div className="text-xs mb-4" style={{ color: "#5B6572" }}>
              Der aktuelle Stand wird durch die Sicherung vom{" "}
              <strong>{new Date(restoreConfirm.ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>{" "}
              ersetzt ({(restoreConfirm.entries || []).length} Einträge). Das gilt auch für alle anderen, die die gemeinsame Datei nutzen.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => restoreBackup(restoreConfirm)}
                className="flex-1 text-sm font-bold py-2.5 rounded text-white"
                style={{ backgroundColor: "#B23A34" }}
              >
                Ja, wiederherstellen
              </button>
              <button onClick={() => setRestoreConfirm(null)} className="flex-1 text-sm font-bold py-2.5 rounded bg-slate-100 text-slate-500">
                Abbrechen
              </button>
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

      {/* Trend der Termintreue - beantwortet die Frage, die eine Momentaufnahme
          nicht beantworten kann: Wird es besser oder schlechter? */}
      {(view === "MONAT" || view === "JAHR") && heavyReady && <TermintreueTrend reihe={termintreueVerlauf} filter={filter} />}

      {/* TPM-Übersicht: Wissens- & Sensibilisierungs-Ort (öffnet zuerst beim Klick auf TPM) */}
      {view === "TPMINFO" && (
        <div className="no-print max-w-5xl mx-auto px-4 mt-4 mb-10">
          <div style={{ backgroundColor: "white", border: "1px solid #E7EAEE", borderRadius: "16px", overflow: "hidden", boxShadow: "0 4px 18px rgba(20,22,25,0.07)" }}>

            {/* Willkommens-Hero mit Kennzahlen */}
            <div style={{ position: "relative", background: "radial-gradient(120% 140% at 100% 0%, #33556e 0%, #22262B 55%)", color: "#fff", padding: "26px 26px 24px", overflow: "hidden" }}>
              <span aria-hidden="true" style={{ position: "absolute", right: "-6px", bottom: "-22px", fontSize: "6rem", opacity: 0.08, transform: "rotate(-12deg)", pointerEvents: "none" }}>🔧</span>
              <div style={{ fontSize: "0.66rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1.5px", color: "#E0A45B", marginBottom: "7px" }}>Wartungs-Board</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: "6px" }}>Willkommen 👋</div>
              <p style={{ margin: 0, fontSize: "0.87rem", color: "#D2D8DE", maxWidth: "640px", lineHeight: 1.58, position: "relative", zIndex: 1 }}>
                <strong style={{ color: "#fff" }}>TPM (Total Productive Maintenance)</strong> ist der übergreifende Ansatz, unsere Anlagenverfügbarkeit
                langfristig zu sichern. Dieses Board deckt folgende Bausteine ab: die <strong style={{ color: "#fff" }}>geplante Wartung</strong> zur
                Instandhaltung der Anlagen sowie <strong style={{ color: "#fff" }}>R+I</strong> für die gesetzlichen Kontroll- und Prüfpflichten.
              </p>
              <div style={{ display: "flex", gap: "10px", marginTop: "16px", position: "relative", zIndex: 1, flexWrap: "wrap" }}>
                <div style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "11px", padding: "9px 15px" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, lineHeight: 1 }}>{tpmAnlagen.length}</div>
                  <div style={{ fontSize: "0.66rem", color: "#B7BEC6", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: "3px" }}>Anlagen</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "11px", padding: "9px 15px" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, lineHeight: 1 }}>{riItems.length}</div>
                  <div style={{ fontSize: "0.66rem", color: "#B7BEC6", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: "3px" }}>R+I-Punkte</div>
                </div>
                {/* Monat und Jahr als Halbkreise nebeneinander - hier gehört der
                    Vergleich hin. Als bloße Prozentzahl ließ sich nicht erkennen,
                    ob der Monat über oder unter dem Jahresschnitt liegt. */}
                <HalbkreisQuote dunkel prozent={quoteMonatHeute} label="Wartung & R+I" sub={MONTHS[today.getMonth()]} titel="Anteil erledigter Wartungs- und R+I-Punkte im laufenden Monat" />
                <HalbkreisQuote dunkel prozent={quoteJahrHeute} label="Wartung & R+I" sub={String(today.getFullYear())} titel="Anteil erledigter Wartungs- und R+I-Punkte im laufenden Jahr" />
              </div>
            </div>

            {/* Zwei Bereiche als erhabene Karten */}
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "14px", padding: "18px" }}>
              <div style={{ position: "relative", borderRadius: "13px", padding: "16px", border: "1px solid #E7EAEE", overflow: "hidden", background: "linear-gradient(180deg,#FDF7EF,#fff)" }}>
                <span style={{ position: "absolute", top: "14px", right: "14px", fontSize: "0.68rem", fontWeight: 800, padding: "3px 10px", borderRadius: "20px", backgroundColor: "#fff", color: "#C97A2B", border: "1px solid #EAD3B4" }}>{tpmAnlagen.length} Anlagen</span>
                <div style={{ display: "flex", alignItems: "center", gap: "11px", marginBottom: "9px" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "12px", display: "grid", placeItems: "center", color: "#fff", fontSize: "1.25rem", background: "linear-gradient(135deg,#E0A45B,#C97A2B)", boxShadow: "0 4px 10px rgba(0,0,0,0.13)" }}>🔧</div>
                  <div style={{ fontWeight: 800, fontSize: "1rem" }}>TPM – Wartung<small style={{ display: "block", fontWeight: 600, fontSize: "0.7rem", color: "#5B6572" }}>Total Productive Maintenance</small></div>
                </div>
                <p style={{ margin: 0, fontSize: "0.79rem", color: "#3d4650" }}>Anlagen werden per Rotation gewartet (Taktstraße, Montags-Rotation, flexible Gruppen). Ziel: keine ungeplanten Stillstände.</p>
              </div>
              <div style={{ position: "relative", borderRadius: "13px", padding: "16px", border: "1px solid #E7EAEE", overflow: "hidden", background: "linear-gradient(180deg,#EFF4F9,#fff)" }}>
                <span style={{ position: "absolute", top: "14px", right: "14px", fontSize: "0.68rem", fontWeight: 800, padding: "3px 10px", borderRadius: "20px", backgroundColor: "#fff", color: "#2F6690", border: "1px solid #BFD2E2" }}>{riItems.length} Punkte</span>
                <div style={{ display: "flex", alignItems: "center", gap: "11px", marginBottom: "9px" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "12px", display: "grid", placeItems: "center", color: "#fff", fontSize: "1.25rem", background: "linear-gradient(135deg,#5C93BE,#2F6690)", boxShadow: "0 4px 10px rgba(0,0,0,0.13)" }}>🔍</div>
                  <div style={{ fontWeight: 800, fontSize: "1rem" }}>R+I – Rundgang &amp; Inspektion<small style={{ display: "block", fontWeight: 600, fontSize: "0.7rem", color: "#5B6572" }}>gesetzlich getaktete Kontrollen</small></div>
                </div>
                <p style={{ margin: 0, fontSize: "0.79rem", color: "#3d4650" }}>Wiederkehrende Prüfungen mit festem Rhythmus – viele davon rechtlich vorgeschrieben und nachweispflichtig.</p>
              </div>
            </div>

            {/* R+I-Punkte als aufklappbare Wissensliste */}
            <div style={{ padding: "4px 18px 20px" }}>
              <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.6px", color: "#5B6572", margin: "6px 0 12px" }}>
                R+I-Punkte mit Rechtsgrundlage &amp; Link
                <span style={{ flex: 1, minWidth: "12px", height: "1px", background: "linear-gradient(90deg,#E7EAEE,transparent)" }} />
                {/* Nachweis zum Vorlegen bei einer Prüfung - listet je Punkt die
                    Rechtsgrundlage und alle erledigten Termine des Jahres auf. */}
                <select
                  value={nachweisJahr}
                  onChange={(e) => setNachweisJahr(Number(e.target.value))}
                  aria-label="Jahr für den Nachweis"
                  className="text-xs rounded border px-1.5 py-1"
                  style={{ borderColor: "#D7DCE1", color: "#22262B", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}
                >
                  {nachweisJahre.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
                <button
                  onClick={() => druckeNachweis(nachweisJahr)}
                  className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-white"
                  style={{ backgroundColor: "#2F6690", fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.3px", textTransform: "none" }}
                  aria-label="Prüfnachweis drucken"
                  title="Nachweis der wiederkehrenden Prüfungen für den gewählten Zeitraum drucken"
                >
                  <Printer size={13} /> Nachweis drucken
                </button>
              </div>

              {riItems.map((r) => {
                const offen = tpmInfoOffen === r.id;
                const rhythmus = RI_TYPE_LABELS[r.type] || "";
                const hatInfos = (r.info && r.info.trim()) || (r.rechtsgrundlage && r.rechtsgrundlage.trim()) || (r.link && r.link.trim());
                return (
                  <div key={r.id} style={{ border: `1px solid ${offen ? "#BFD2E2" : "#E7EAEE"}`, borderRadius: "11px", marginBottom: "8px", overflow: "hidden", boxShadow: offen ? "0 3px 12px rgba(20,22,25,0.06)" : "none" }}>
                    <div
                      className="wk-hover flex items-center"
                      onClick={() => setTpmInfoOffen(offen ? null : r.id)}
                      style={{ gap: "12px", padding: "12px 14px", backgroundColor: offen ? "#FAFBFC" : "#fff" }}
                    >
                      <span style={{ width: "9px", height: "9px", borderRadius: "50%", flexShrink: 0, backgroundColor: hatInfos ? "#2F6690" : "#8A9099", boxShadow: `0 0 0 4px ${hatInfos ? "#E9F0F6" : "#EDEFF2"}` }} />
                      <span style={{ fontWeight: 700, fontSize: "0.86rem", flex: 1 }}>{r.name}</span>
                      {r.rechtsgrundlage && r.rechtsgrundlage.trim() && (
                        <span style={{ fontSize: "0.6rem", fontWeight: 800, backgroundColor: "#F1EFFA", color: "#7C5CBF", borderRadius: "6px", padding: "2px 7px" }}>§</span>
                      )}
                      {r.link && r.link.trim() && <span style={{ fontSize: "0.72rem" }}>🔗</span>}
                      <span style={{ fontSize: "0.66rem", color: "#8A9099", fontWeight: 600, backgroundColor: "#F4F6F8", borderRadius: "20px", padding: "3px 9px", whiteSpace: "nowrap" }}>{rhythmus}</span>
                    </div>
                    {offen && (
                      <div style={{ padding: "0 14px 15px 35px", backgroundColor: "#FBFCFD", fontSize: "0.81rem", color: "#3a4650" }}>
                        {r.info && r.info.trim() && (
                          <div style={{ marginTop: "10px", whiteSpace: "pre-wrap" }}>{r.info}</div>
                        )}
                        {r.rechtsgrundlage && r.rechtsgrundlage.trim() && (
                          <div style={{ marginTop: "10px" }}><strong style={{ color: "#22262B" }}>Rechtsgrundlage:</strong> {r.rechtsgrundlage}</div>
                        )}
                        {(r.link && r.link.trim()) && (
                          <div style={{ marginTop: "12px" }}>
                            <a
                              href={r.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.72rem", fontWeight: 800, color: "#fff", background: "linear-gradient(135deg,#5C93BE,#2F6690)", borderRadius: "8px", padding: "7px 12px", textDecoration: "none", boxShadow: "0 3px 8px rgba(47,102,144,0.25)" }}
                            >
                              🔗 Mehr erfahren
                            </a>
                          </div>
                        )}
                        {!hatInfos && (
                          <div style={{ marginTop: "10px", color: "#8A9099", fontStyle: "italic" }}>
                            Noch keine Infos hinterlegt.{!readerMode && " Über das ⚙-Rädchen (oben rechts) kannst du Info, Rechtsgrundlage und Link zu diesem Punkt ergänzen."}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {!readerMode && (
                <div style={{ fontSize: "0.72rem", color: "#8A9099", backgroundColor: "#F6F7F9", border: "1px dashed #CBD1D8", borderRadius: "9px", padding: "9px 12px", marginTop: "14px" }}>
                  ℹ️ Info-Text, Rechtsgrundlage und Link pflegst du je R+I-Punkt im ⚙-Dialog (oben rechts). Die Rechtsangaben sind kein Ersatz für eine rechtsverbindliche Prüfung – bitte selbst gegenprüfen.
                </div>
              )}
            </div>

          </div>
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
                      className="wk-hover flex items-center justify-between text-left px-3 py-2 rounded border"
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
                      className="wk-hover flex items-center justify-between text-left px-3 py-2 rounded border"
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
      {view !== "PLAN" && view !== "TPMINFO" && notesList.length > 0 && (
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

      {view !== "COCKPIT" && view !== "TPMINFO" && (
      <div className="no-print max-w-5xl mx-auto px-4 pb-6 pt-3 text-xs text-slate-400">
        Tipp: "Drucken" öffnet die Druckvorlage in einem neuen Tab (Pop-ups für diese Seite bitte erlauben) – bei der Monatsansicht zuerst als übersichtliche Kalenderseite, danach die Anlagen-Matrix. Falls der Browser Pop-ups blockiert, wird stattdessen automatisch eine Datei heruntergeladen. Filter oben auf "TPM" oder "R+I" stellen für den separaten Ausdruck je Kategorie. Am Jahresende einfach auf "Jahr" umschalten und drucken.
      </div>
      )}

      {/* Werkstatt-Monitor: Vollbild-Dashboard für einen Monitor in der Werkstatt */}
      {monitorOpen && (() => {
        const { aktuell, SCHICHT_INFO, jetztCrew } = jetztInDerWerkstatt;
        const chip = (s) => s ? (
          <span className="inline-flex items-center justify-center rounded font-black" style={{ minWidth: "34px", height: "26px", padding: "0 8px", fontSize: "0.8rem", color: SCHICHTEN[s].text || "white", backgroundColor: SCHICHTEN[s].color, flexShrink: 0, marginRight: "10px" }}>{SCHICHTEN[s].kurz}</span>
        ) : (
          <span className="inline-flex items-center justify-center rounded font-black" style={{ minWidth: "34px", height: "26px", padding: "0 8px", fontSize: "0.8rem", backgroundColor: "#2E3238", color: "#9AA0A6", flexShrink: 0, marginRight: "10px" }}>–</span>
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
            {monitorZettel.length > 0 && (() => {
              const laufschriftText = monitorZettel.map((z) => `${z.note} (${z.name})`).join("   +++   ");
              const dauer = Math.max(15, laufschriftText.length * 0.13);
              return (
                <div style={{ marginTop: "22px", background: "#1F2226", border: "1px solid #2E3238", borderRadius: "12px", padding: "14px 0 14px 20px", overflow: "hidden" }}>
                  <style>{`
                    @keyframes werkstattLaufschrift { from { transform: translateX(0); } to { transform: translateX(-50%); } }
                  `}</style>
                  <div style={{ display: "inline-flex", whiteSpace: "nowrap", animation: `werkstattLaufschrift ${dauer}s linear infinite` }}>
                    <span style={{ fontSize: "1.25rem", color: "#C9CDD2", paddingRight: "80px" }}>{laufschriftText}</span>
                    <span style={{ fontSize: "1.25rem", color: "#C9CDD2", paddingRight: "80px" }}>{laufschriftText}</span>
                  </div>
                </div>
              );
            })()}
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
