import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Printer, StickyNote, X, Download, Upload, Settings, FolderOpen, Tv, LogOut, LogIn, Eye } from "lucide-react";
import * as sharedFile from "./sharedfile.js";
import { leseArbeitsmappe, findeKopfbereich, erkenneSpalten, leseOeeZeilen } from "./xlsx.js";

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

/* Tipp-Insel: Der Zettel-Verfasser hält seinen Text SELBST, statt jeden
   Tastendruck durch die große Cockpit-Komponente zu schicken. Gemessen am
   10.08. (6-fach gedrosselte CPU wie ein Werkstatt-PC): vorher machte JEDER
   Tastendruck ~60 ms Vollzeichnung der ganzen Oberfläche - das war Robertos
   "Nachhängen beim Eintragen". Erst das Anpinnen reicht den fertigen Text
   nach oben. */
function PinnwandVerfasser({ startName, onAnpinnen, onAbbrechen }) {
  const [text, setText] = useState("");
  const [name, setName] = useState(startName || "");
  return (
    <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: "white", border: "1px solid #E2E4E7" }}>
      <textarea
        autoFocus
        spellCheck
        lang="de"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Was sollen die anderen wissen? (z. B. Ersatzteil kommt Do. früh)"
        rows={3}
        className="w-full text-sm border rounded px-3 py-2 mb-2"
        style={{ borderColor: "#D6D9DC", resize: "vertical" }}
      />
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dein Name/Kürzel"
          className="text-sm border rounded px-3 py-1.5"
          style={{ borderColor: "#D6D9DC", width: "160px" }}
        />
        <button
          onClick={() => onAnpinnen(text, name)}
          disabled={!text.trim() || !name.trim()}
          className="text-sm font-bold px-4 py-1.5 rounded text-white disabled:opacity-40"
          style={{ backgroundColor: "#2F7D4F" }}
        >
          Anpinnen
        </button>
        <button onClick={onAbbrechen} className="text-sm px-3 py-1.5 rounded bg-slate-100 text-slate-500">Abbrechen</button>
      </div>
    </div>
  );
}

/* Such-Insel: Das Feld tippt lokal und reicht den Begriff erst nach einer
   kurzen Denkpause (150 ms) nach oben - die Trefferliste braucht die große
   Komponente, das Tippen selbst nicht. Gleiches Mess-Ergebnis wie beim
   Zettel-Verfasser: ohne Insel kostet jeder Tastendruck eine Vollzeichnung. */
function SuchFeld({ wert, onWert, ...rest }) {
  const [lokal, setLokal] = useState(wert || "");
  const timer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  // Von außen nur das LEEREN übernehmen (z. B. Ansichtswechsel). Ein voller
  // Rückabgleich könnte auf einem trägen Rechner gerade Getipptes
  // überschreiben - der Ernstfall dieser Insel ist ja der träge Rechner.
  React.useEffect(() => { if (!wert) setLokal(""); }, [wert]);
  return (
    <input
      {...rest}
      value={lokal}
      onChange={(e) => {
        const v = e.target.value;
        setLokal(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onWert(v), 150);
      }}
    />
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

// Monats-Auswertung als Diagramm (Robertos Ansage vom 18.08.): je Tag ein
// Balken - unten grün das Erledigte, oben rot das Offene. Bewusst Balken statt
// Linie: Im Monat zählt, WAS an welchem Tag steht, nicht die Richtung - die
// liefert der Termintreue-Trend darunter.
function MonatsDiagramm({ tage, monatName, jahr, erledigt, basis, prozent, filter, wochenende, feiertag }) {
  const [aktiv, setAktiv] = React.useState(null);
  const bereich = filter === "ALL" ? "Wartung & R+I" : filter === "TPM" ? "nur Wartung (TPM)" : "nur R+I";
  const leer = tage.every((t) => t.erledigt + t.offen === 0);

  const B = 720, H = 190, L = 28, R = 8, O = 16, U = 24;
  const innenB = B - L - R, innenH = H - O - U;
  const maxWert = Math.max(1, ...tage.map((t) => t.erledigt + t.offen));
  const schritt = innenB / tage.length;
  const balkenB = Math.max(6, Math.floor(schritt * 0.62));
  const hoehe = (n) => (n / maxWert) * innenH;
  // Bei vollen Monaten nicht jede Zwischenlinie beschriften - das würde kleben.
  const linienSchritt = maxWert <= 6 ? 1 : Math.ceil(maxWert / 5);

  return (
    <div className="print-bg p-4 max-w-5xl mx-auto">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <div className="text-sm font-bold uppercase tracking-wide" style={{ color: "#22262B" }}>Monats-Diagramm – {monatName} {jahr}</div>
        <span style={{ fontSize: "0.72rem", color: "#8A9099" }}>{bereich}</span>
        <span className="ml-auto" style={{ fontSize: "0.78rem", fontWeight: 800, color: "#22262B" }}>
          {erledigt} von {basis} erledigt{prozent !== null ? ` · ${prozent} %` : ""}
        </span>
      </div>
      <div style={{ fontSize: "0.7rem", color: "#8A9099", marginBottom: "8px" }}>
        Termine je Tag – grün erledigt, rot offen.
      </div>
      {leer ? (
        <div className="rounded-xl" style={{ backgroundColor: "#fff", border: "1px solid #E2E4E7", padding: "14px", fontSize: "0.75rem", color: "#8A9099" }}>
          Für {monatName} {jahr} ist nichts eingetragen.
        </div>
      ) : (
        <div className="rounded-xl" style={{ backgroundColor: "#fff", border: "1px solid #E2E4E7", padding: "10px 8px 4px" }}>
          <div style={{ overflowX: "auto" }}>
            <svg viewBox={`0 0 ${B} ${H}`} style={{ width: "100%", minWidth: "460px", height: "auto", display: "block" }}
                 role="img" aria-label={`Monats-Diagramm ${monatName} ${jahr}: ${erledigt} von ${basis} Terminen erledigt`}>
              {Array.from({ length: maxWert + 1 }, (_, n) => n).filter((n) => n % linienSchritt === 0).map((n) => (
                <g key={n}>
                  <line x1={L} y1={O + innenH - hoehe(n)} x2={B - R} y2={O + innenH - hoehe(n)} stroke={n === 0 ? "#C3C7CB" : "#EDEFF2"} strokeWidth="1" />
                  <text x={L - 5} y={O + innenH - hoehe(n) + 3} textAnchor="end" style={{ fontSize: "9px", fill: "#A6AEB6" }}>{n}</text>
                </g>
              ))}
              {tage.map((t, i) => {
                const xm = L + i * schritt + schritt / 2;
                const hE = hoehe(t.erledigt), hO = hoehe(t.offen);
                const summe = t.erledigt + t.offen;
                const fei = feiertag(t.tag);
                return (
                  <g key={t.tag}
                     onMouseEnter={() => setAktiv(t.tag)} onMouseLeave={() => setAktiv(null)}
                     style={{ cursor: "default" }}>
                    <rect x={L + i * schritt} y={O} width={schritt} height={innenH} fill="transparent" />
                    {t.erledigt > 0 && <rect x={xm - balkenB / 2} y={O + innenH - hE} width={balkenB} height={hE} fill="#2F7D4F" rx="1" />}
                    {t.offen > 0 && <rect x={xm - balkenB / 2} y={O + innenH - hE - hO} width={balkenB} height={hO} fill="#B23A34" rx="1" />}
                    {summe > 0 && (
                      <text x={xm} y={O + innenH - hE - hO - 4} textAnchor="middle" style={{ fontSize: "8.5px", fill: "#5B6572", fontWeight: 700 }}>{summe}</text>
                    )}
                    <text x={xm} y={H - 8} textAnchor="middle"
                          style={{ fontSize: "8.5px", fontWeight: 700, fill: fei ? "#B23A34" : wochenende(t.tag) ? "#6D93B8" : "#5B6572" }}>{t.tag}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          {aktiv !== null && (() => {
            const t = tage.find((z) => z.tag === aktiv);
            return (
              <div className="no-print" style={{ fontSize: "0.72rem", color: "#22262B", padding: "4px 8px 6px", fontWeight: 600 }}>
                {t.tag}. {monatName}: <strong style={{ color: "#24603D" }}>{t.erledigt} erledigt</strong> · <strong style={{ color: "#B23A34" }}>{t.offen} offen</strong>
              </div>
            );
          })()}
        </div>
      )}
      <div className="no-print flex flex-wrap items-center gap-3 mt-2 px-1 text-slate-400" style={{ fontSize: "11px" }}>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: "#2F7D4F" }} /> Erledigt</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: "#B23A34" }} /> Offen</span>
        <span>Zahl über dem Balken = Termine an dem Tag · als A4 unter „Druckvorlagen …"</span>
      </div>
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
  // Nur Tag und Monat: In der schmalen Kachel ist neben dem Schicht-Schild und
  // der Übergabezeit kein Platz mehr für den Wochentag - und der steht ohnehin
  // direkt darunter über der Tagesliste ("Heute · Donnerstag, 06.08.").
  const datum = jetzt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  const dreh = (grad) => ({ transform: `rotate(${grad}deg)`, transformOrigin: "50px 50px" });

  // Schmal genug für eine Kachel von der Breite aller anderen: Zifferblatt und
  // Uhrzeit nebeneinander, darunter eine Zeile mit Schicht und Übergabe. Vorher
  // lag die Uhr über zwei Kachelbreiten und war die einzige Kachel mit einem
  // anderen Maß - im Raster fiel das sofort auf.
  return (
    <div className="wk-karte px-3 py-3 flex flex-col justify-center" title={`${zeit} Uhr · ${schicht.name} · ${schicht.naechste} ab ${schicht.ab}`}>
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 100 100" style={{ width: "34px", height: "34px", flexShrink: 0 }}
             role="img" aria-label={`${zeit} Uhr, ${schicht.name}, ${schicht.naechste} ab ${schicht.ab}`}>
          <circle cx="50" cy="50" r="46" fill="#fff" stroke="#22262B" strokeWidth="4" />
          <g stroke="#8A9099" strokeWidth="3" strokeLinecap="round">
            <line x1="50" y1="9" x2="50" y2="16" /><line x1="91" y1="50" x2="84" y2="50" />
            <line x1="50" y1="91" x2="50" y2="84" /><line x1="9" y1="50" x2="16" y2="50" />
          </g>
          <line x1="50" y1="50" x2="50" y2="28" stroke="#22262B" strokeWidth="6" strokeLinecap="round" style={dreh((std % 12) * 30 + min * 0.5)} />
          <line x1="50" y1="50" x2="50" y2="18" stroke="#22262B" strokeWidth="4" strokeLinecap="round" style={dreh(min * 6 + sek * 0.1)} />
          <line x1="50" y1="56" x2="50" y2="16" stroke="#C97A2B" strokeWidth="2" strokeLinecap="round" style={dreh(sek * 6)} />
          <circle cx="50" cy="50" r="4" fill="#22262B" />
        </svg>
        <span className="font-mono font-extrabold" style={{ fontSize: "1.55rem", letterSpacing: "-1.4px", fontVariantNumeric: "tabular-nums", color: "#22262B", lineHeight: 1 }}>{zeit}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5" style={{ minWidth: 0 }}>
        <span style={{ fontSize: "0.55rem", fontWeight: 800, padding: "2px 6px", borderRadius: "var(--wk-eck-rund)", backgroundColor: schicht.bg, color: schicht.fg, whiteSpace: "nowrap", flexShrink: 0 }}>
          {schicht.name.slice(0, 4).toUpperCase()}
        </span>
        <span style={{ fontSize: "0.6rem", fontWeight: 600, color: "#6B7480", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {/* Nur der Zeitpunkt der Übergabe - welche Schicht dann kommt, steht
              im Tooltip. Ausgeschrieben passte es nicht in die Kachelbreite
              (gemessen: abgeschnitten bei 1600 px Fensterbreite). */}
          {datum} · ➜ {schicht.ab}
        </span>
      </div>
    </div>
  );
}

/* Punkt-Linien-Diagramm für die OEE-Auswertung im Klick-Popup - bewusst im
   Stil der Termintreue-Kurve bei TPM (Robertos Wunsch vom 07.08.): Linie
   mit Punkten auf fester 0-100-Skala, Fläche dezent gefüllt. Die Punkte
   tragen die Ampelfarben der Excel-Legende (ab 60 % gelb, ab 80 % grün),
   die Schwellen 60/80 sind gestrichelt eingezeichnet. Beschriftet werden
   nur erster, letzter, höchster und tiefster Wert - der Rest steht im
   Maus-Hinweis, sonst wird es Zahlensalat. */
function OeeVerlauf({ daten, breite = 560, hoehe = 150 }) {
  if (!daten || daten.length === 0) return null;
  const L = 30, R = 10, O = 16, U = 22;
  const innenB = breite - L - R, innenH = hoehe - O - U;
  const x = (i) => L + (daten.length === 1 ? innenB / 2 : (i * innenB) / (daten.length - 1));
  const y = (w) => O + innenH - (Math.min(w, 100) / 100) * innenH;
  const farbe = (w) => (w >= 80 ? "#3E9B5F" : w >= 60 ? "#E8B33C" : "#B23A34");

  // Lücken (Einträge ohne Wert) trennen die Linie, statt sie zu überbrücken -
  // eine durchgezogene Linie über eine Lücke wäre eine Behauptung.
  const abschnitte = [];
  let lauf = [];
  daten.forEach((d, i) => {
    if (d.oee == null) { if (lauf.length) abschnitte.push(lauf); lauf = []; }
    else lauf.push(i);
  });
  if (lauf.length) abschnitte.push(lauf);

  // Nur wenige Punkte beschriften: erster, letzter, höchster, tiefster.
  const wertIdx = daten.map((d, i) => (d.oee != null ? i : null)).filter((i) => i != null);
  const beschriftet = new Set();
  if (wertIdx.length) {
    let maxI = wertIdx[0], minI = wertIdx[0];
    wertIdx.forEach((i) => {
      if (daten[i].oee > daten[maxI].oee) maxI = i;
      if (daten[i].oee < daten[minI].oee) minI = i;
    });
    [wertIdx[0], wertIdx[wertIdx.length - 1], maxI, minI].forEach((i) => beschriftet.add(i));
  }

  return (
    <svg viewBox={`0 0 ${breite} ${hoehe}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="OEE-Verlauf">
      {[0, 60, 80, 100].map((m) => (
        <g key={m}>
          <line x1={L} x2={breite - R} y1={y(m)} y2={y(m)} stroke={m === 60 || m === 80 ? "#E7D9A8" : m === 0 ? "#C3C7CB" : "#EEF0F2"} strokeWidth="1" strokeDasharray={m === 60 || m === 80 ? "4 3" : ""} />
          <text x={L - 5} y={y(m) + 3} textAnchor="end" fontSize="9" fill="#8A9099">{m}</text>
        </g>
      ))}
      {abschnitte.map((abschnitt, ai) => {
        const pfad = abschnitt.map((i, k) => `${k === 0 ? "M" : "L"} ${x(i)} ${y(daten[i].oee)}`).join(" ");
        const flaeche = `${pfad} L ${x(abschnitt[abschnitt.length - 1])} ${y(0)} L ${x(abschnitt[0])} ${y(0)} Z`;
        return (
          <g key={ai}>
            {abschnitt.length > 1 && <path d={flaeche} fill="#2F6690" opacity="0.10" />}
            {abschnitt.length > 1 && <path d={pfad} fill="none" stroke="#2F6690" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          </g>
        );
      })}
      {daten.map((d, i) => d.oee != null && (
        <g key={d.beschriftung + i}>
          <circle cx={x(i)} cy={y(d.oee)} r="3.5" fill={farbe(d.oee)} stroke="#fff" strokeWidth="1.5">
            <title>{`${d.titel || d.beschriftung}: ${String(d.oee).replace(".", ",")} %`}</title>
          </circle>
          {beschriftet.has(i) && (
            <text x={x(i)} y={y(d.oee) - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill="#22262B">{Math.round(d.oee)}</text>
          )}
        </g>
      ))}
      {daten.map((d, i) => (
        <text key={"b" + i} x={x(i)} y={hoehe - 8} textAnchor="middle" fontSize={daten.length > 20 ? 7 : 9} fill="#8A9099">{d.beschriftung}</text>
      ))}
    </svg>
  );
}

/* OEE-Kachel: die Zahl aus der Excel-Tabelle, im selben Maß wie die anderen
   Kacheln. Sie zeigt bewusst auch, WORAUS sie kommt (Tag, Zeilen, Datei) -
   eine Kennzahl ohne Herkunft ist in einer Werkstattbesprechung wertlos. */
function OeeKachel({ stand, onKlick, darfEinrichten }) {
  const lage = (stand && stand.lage) || "aus";
  const farbeFuer = (w) => (w == null ? "#8A9099" : w >= 85 ? "#2F7D4F" : w >= 70 ? "#C97A2B" : "#B23A34");

  if (lage === "ok") {
    const wert = stand.oee;
    const diff = stand.vergleich != null && wert != null ? Math.round((wert - stand.vergleich) * 10) / 10 : null;
    const zeitraum = oeeZeitraumText(stand);
    const teile = [stand.verfuegbarkeit, stand.leistung, stand.qualitaet];
    return (
      <button
        onClick={onKlick}
        className="wk-karte px-4 py-3.5 flex flex-col justify-center text-left"
        style={{ boxShadow: `inset 3px 0 0 0 ${stand.veraltet ? "#C97A2B" : farbeFuer(wert)}, var(--wk-schatten)` }}
        title={`OEE über alle Anlagen (${zeitraum}) aus „${stand.datei}", Blatt „${stand.blatt}"`
          + (stand.modus === "summe" ? "\nSummenzeile (GES/Gesamtergebnis) der Tabelle - Zeitraum wie in Excel gefiltert" : `\n${stand.anlagen || 0} Anlage(n), ${stand.zeilen} Zeile(n)`)
          + (stand.juengsterTag && stand.juengsterTagWert != null
              ? `\nJüngster Tag (${new Date(stand.juengsterTag + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}): ${String(stand.juengsterTagWert).replace(".", ",")} %`
              : "")
          + (teile.every((t) => t != null) ? `\nV ${teile[0]} % · L ${teile[1]} % · Q ${teile[2]} %` : "")
          + (stand.veraltet ? `\nAchtung: jüngster Eintrag liegt ${stand.alterStunden} h zurück - Pivot-Filter/Aktualisierung in Excel prüfen` : "")
          + "\nKlicken für die Anlagenübersicht"}
      >
        <div className="flex items-baseline gap-1">
          <span className="font-extrabold" style={{ fontSize: "2.1rem", lineHeight: 1, letterSpacing: "-1.6px", fontVariantNumeric: "tabular-nums", color: farbeFuer(wert) }}>
            {/* Immer eine Nachkommastelle: 90 und 90,0 sind dieselbe Zahl,
                aber die springende Stellenzahl laesst die Kachel zappeln. */}
            {wert != null ? wert.toFixed(1).replace(".", ",") : "–"}
          </span>
          <span className="font-extrabold" style={{ fontSize: "0.9rem", color: farbeFuer(wert) }}>%</span>
          {diff != null && diff !== 0 && (
            <span className="font-bold" style={{ fontSize: "0.62rem", marginLeft: "2px", color: diff > 0 ? "#2F7D4F" : "#B23A34" }}>
              {diff > 0 ? "▲" : "▼"}{Math.abs(diff).toFixed(1).replace(".", ",")}
            </span>
          )}
        </div>
        <div className="font-semibold mt-1.5" style={{ color: "#6B7480", fontSize: "var(--wk-txt-etikett)", letterSpacing: "0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          OEE · {zeitraum}
        </div>
      </button>
    );
  }

  const [zeichen, gross, klein, akzent] = lage === "laedt"
    ? ["…", "", "OEE wird gelesen", "#CBD1D8"]
    : lage === "fehler"
      ? ["!", "", "OEE · Tabelle prüfen", "#B23A34"]
      : ["–", "", darfEinrichten ? "OEE · einrichten" : "OEE · nicht eingerichtet", "#CBD1D8"];
  return (
    <button
      onClick={onKlick}
      className="wk-karte px-4 py-3.5 flex flex-col justify-center text-left"
      style={{ boxShadow: `inset 3px 0 0 0 ${akzent}, var(--wk-schatten)` }}
      title={lage === "fehler" ? String(stand.text || "") : "OEE aus einer Excel-Tabelle anzeigen"}
    >
      <div className="font-extrabold" style={{ fontSize: "2.1rem", lineHeight: 1, letterSpacing: "-1.6px", color: lage === "fehler" ? "#B23A34" : "#C3C7CB" }}>
        {gross || zeichen}
      </div>
      <div className="font-semibold mt-1.5" style={{ color: "#6B7480", fontSize: "var(--wk-txt-etikett)", letterSpacing: "0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {klein}
      </div>
    </button>
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
// Alte Team-Einträge (reine Namen) in die neue Form {name, rolle} überführen.
// geburtstag (seit 20.08., freiwillig) muss hier ausdrücklich mitgenommen
// werden - diese Funktion läuft auf JEDEM Ladeweg, was sie nicht kennt, wäre
// nach dem nächsten Öffnen verloren.
const normalisiereTeam = (arr) => (Array.isArray(arr) ? arr : [])
  .map((t) => (typeof t === "string"
    ? { name: t, rolle: "", geburtstag: "" }
    : { name: String(t.name || ""), rolle: TEAM_ROLLEN[t.rolle] ? t.rolle : "", geburtstag: typeof t.geburtstag === "string" ? t.geburtstag.trim() : "" }))
  .filter((t) => t.name.trim());

/* ---------- Geburtstags-Erinnerung (Robertos Wahl "A" vom 20.08.) ----------
   Frei getipptes Feld je Person: "24.12." oder "24.12.1988". Nur was eindeutig
   lesbar ist, zählt - eine falsche Erinnerung wäre schlimmer als keine.
   Leeres oder unlesbares Feld bleibt komplett stumm, kein Nachfragen. */
const parseGeburtstag = (s) => {
  const m = /^(\d{1,2})\.(\d{1,2})\.?\s*(\d{4})?$/.exec(String(s || "").trim());
  if (!m) return null;
  const tag = Number(m[1]);
  const monat = Number(m[2]);
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;
  return { tag, monat, jahr: m[3] ? Number(m[3]) : null };
};
// Der 29.02. wird in Nicht-Schaltjahren am 28.02. gefeiert - sonst bekäme
// die Person nur alle vier Jahre eine Erinnerung.
const geburtstagInJahr = (g, jahr) => {
  const schaltjahr = (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
  if (g.monat === 2 && g.tag === 29 && !schaltjahr) return { tag: 28, monat: 2 };
  return { tag: g.tag, monat: g.monat };
};

/* ---------- Benutzergruppen (Robertos Wunsch vom 07.08.) ----------
   Eine Namensliste in der gemeinsamen Datei entscheidet, wer schreiben darf -
   damit hängt die Rechtevergabe nicht an den Datei-Freigaben des Laufwerks. Drei Rollen:
   "verwalter" (schreiben + Benutzer pflegen), "bearbeiter" (schreiben),
   "leser" (nur ansehen). Solange die Liste LEER ist, verhält sich die App wie
   bisher - so kann niemand durch ein Update ausgesperrt werden, und Roberto
   legt die Liste selbst an, wenn er soweit ist.
   EHRLICH GESAGT ist das eine Leitplanke gegen Versehen, kein Schloss: Die
   App liegt offen auf dem Laufwerk, wer den Datenordner öffnen darf, kommt
   an ihr vorbei. Echtes Sperren können nur Laufwerksrechte der IT. */
const BENUTZER_ROLLEN = {
  verwalter: "Verwalter (schreiben + Benutzer pflegen)",
  bearbeiter: "Bearbeiter (schreiben)",
  leser: "Leser (nur ansehen)",
};
const normalisiereBenutzer = (roh) => (Array.isArray(roh) ? roh : [])
  .map((b) => ({
    name: typeof (b && b.name) === "string" ? b.name.trim() : "",
    rolle: BENUTZER_ROLLEN[b && b.rolle] ? b.rolle : "bearbeiter",
    // Kennwörter stehen NIE im Klartext in der Datei, nur als SHA-256-Wert.
    // (Auch das ist kein Geheimnis im strengen Sinn - siehe Kommentar oben.)
    kennwortHash: typeof (b && b.kennwortHash) === "string" ? b.kennwortHash : "",
  }))
  .filter((b) => b.name);
const kennwortHashen = async (text) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
};

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
/* Kennfarbe je Anlage (Kreativ-Runde G3): fester, aus dem Namen abgeleiteter
   Farbton als linke Kante an der Kachel und als Punkt im Register. Die
   Grundfarben bleiben (TPM orange, R+I blau - Robertos Wahl vom 18.08.);
   die Kennfarbe kommt nur DAZU, damit man "seine" Maschine ohne Lesen findet. */
const KENN_FARBEN = ["#7A4E9B", "#B2542D", "#2F6690", "#1F7A3D", "#B23A34", "#8A6D1C", "#3E7C7B", "#5B5EA6", "#98572B", "#496A2E"];
const anlagenKennfarbe = (name) => {
  let h = 0;
  for (const z of String(name || "")) h = (h * 31 + z.codePointAt(0)) % 9973;
  return KENN_FARBEN[h % KENN_FARBEN.length];
};

const normalisiereAnlagenteile = (arr) => (Array.isArray(arr) ? arr : [])
  .filter((t) => t && typeof t.name === "string" && t.name.trim() && typeof t.anlage === "string")
  .map((t) => ({
    id: typeof t.id === "string" && t.id ? t.id : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    anlage: t.anlage.trim(),
    name: t.name.trim(),
  }));

/* ---------- Linkbereich (Cockpit-Übersicht, nur für Bearbeiter) ---------- */
// Zwei Sammlungen nebeneinander: die des Werkstattleiters und die der
// Vertretung. Die Kürzel stehen in denselben Daten wie die Links - so bringt
// eine neue Vertretung keinen Eingriff im Code mit sich.
/* ---------- Nummer eines Störberichts ----------
   Jahr und laufende Nummer, z. B. 2026-0214. In der Liste steht nur der
   hintere Teil: Das Jahr sagt bereits die Datumszeile darüber, und eine
   kurze Nummer liest sich am Telefon schneller vor. Auf dem Ausdruck und in
   der Suche gilt die lange Form. */
const stoerNrLang = (s) => String((s && s.nr) || "");
const stoerNrKurz = (s) => {
  const teile = stoerNrLang(s).split("-");
  return teile.length === 2 ? teile[1] : teile[0];
};
// Nächste freie Nummer eines Jahres. Ausgangspunkt ist IMMER die übergebene
// Liste - beim Speichern der frisch zusammengeführte Stand der gemeinsamen
// Datei, nicht der Stand vom Öffnen der Maske.
const naechsteStoerNr = (liste, jahr) => {
  let hoechste = 0;
  for (const s of liste || []) {
    const m = /^(\d{4})-(\d+)$/.exec(stoerNrLang(s));
    if (m && m[1] === String(jahr)) hoechste = Math.max(hoechste, Number(m[2]));
  }
  return `${jahr}-${String(hoechste + 1).padStart(4, "0")}`;
};
// Hat sonst jemand dieselbe Nummer? Dann rückt DER weiter, der gerade
// speichert - nicht der, den eine Regel dazu bestimmt.
//
// Gemessen: Eine symmetrische Regel ("der mit der kleineren Kennung behält
// sie") reicht nicht. Wer zuerst schreibt, sieht den anderen beim
// Zusammenführen noch gar nicht und prüft danach nie wieder. Fällt die Regel
// zu seinen Gunsten aus, bleibt die Nummer doppelt - genau so ist der Test
// (6) umgefallen, bevor das hier stand.
//
// Warum "wer gerade speichert" immer genau einer ist: Das Schreiben in die
// gemeinsame Datei läuft über Lesen-Zusammenführen-Schreiben. Der zweite
// Schreiber sieht den ersten also zwangsläufig, der erste den zweiten nie.
const nummerSchonVergeben = (liste, eigener) =>
  (liste || []).some((x) => x.id !== eigener.id && stoerNrLang(x) && stoerNrLang(x) === stoerNrLang(eigener));

const LINK_INHABER_VORGABE = ["RC", "AR"];
// Hintergrundfarben der Link-Symbole, der Reihe nach vergeben. Feste Folge
// statt Zufall oder Namens-Streuung: Ein Link soll beim nächsten Öffnen an
// derselben Stelle in derselben Farbe liegen - dann findet ihn die Hand, ohne
// dass das Auge lesen muss. Alle Töne sind blass, damit das Symbol trägt.
const LINK_FARBEN = ["#FDF0E2", "#E7EEF4", "#E8F1EA", "#F1ECF6", "#FBEFEF", "#EDF0F3"];
// Manche Zeichen sind im Unicode-Standard "Text zuerst" - ⚙ ⚠ ⏱ ✂ ❄ und
// weitere. Ohne den Zusatz U+FE0F zeichnet Windows sie schmal und schwarzweiß,
// mitten in einer Reihe bunter Symbole. Der Zusatz sagt "als Bild, bitte";
// bei Zeichen, die ohnehin als Bild gelten, ändert er nichts. Zusammengesetzte
// Zeichen (1️⃣, 🧑‍🔧) bleiben unangetastet - dort säße er falsch.
const alsSymbol = (s) => {
  const t = String(s || "");
  if (!t) return t;
  // Als Fluchtzeichen geschrieben, nicht als unsichtbares Zeichen im Quelltext:
  // Sonst sieht man beim Lesen nicht, was hier angehängt wird.
  return (Array.from(t).length === 1 && !/\p{Emoji_Presentation}/u.test(t)) ? t + "\uFE0F" : t;
};

// Wird die App vom Ausliefer-Dienst geliefert (http://localhost:8765/), kann
// sie ihn bitten, eine Datei zu öffnen - der läuft auf demselben Rechner und
// darf, was der Browser nicht darf. Als Datei geöffnet (file://) gibt es
// niemanden, den man fragen könnte; dann bleibt die Zwischenablage.
const ueberDienst = () => {
  try { return /^https?:$/.test(window.location.protocol); } catch (e) { return false; }
};

// Was der Browser selbst öffnen kann und was nicht.
//
// Ein Netzwerkpfad (\\server\...) oder ein Laufwerksbuchstabe lässt sich aus
// einer Webseite heraus NICHT öffnen - Chrome blockiert das, und kein Schalter
// ändert daran etwas. Deshalb geht der Pfad an den Dienst; erst wenn der nicht
// erreichbar ist, wird er in die Zwischenablage gelegt.
const linkArt = (ziel) => {
  const z = String(ziel || "").trim();
  if (/^(https?|mailto|tel):/i.test(z)) return "oeffnen";
  if (/^(\\\\|[A-Za-z]:\\|file:)/i.test(z)) return "pfad";
  // Ohne Schema, aber wie eine Adresse gebaut ("intranet.firma.de/x") - das ist
  // der Fall, den man beim Eintippen am ehesten trifft.
  if (/^[\w.-]+\.[A-Za-z]{2,}(\/|$)/.test(z)) return "oeffnen";
  return "pfad";
};
const linkAdresse = (ziel) => {
  const z = String(ziel || "").trim();
  return /^(https?|mailto|tel):/i.test(z) ? z : "https://" + z;
};

const normalisiereLinks = (roh) => {
  const o = roh && typeof roh === "object" && !Array.isArray(roh) ? roh : {};
  const eintraege = (Array.isArray(o.eintraege) ? o.eintraege : [])
    .filter((l) => l && typeof l.name === "string" && l.name.trim() && typeof l.ziel === "string" && l.ziel.trim())
    .map((l) => ({
      id: typeof l.id === "string" && l.id ? l.id : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      inhaber: String(l.inhaber || "").trim().toUpperCase() || LINK_INHABER_VORGABE[0],
      name: l.name.trim(),
      ziel: l.ziel.trim(),
      symbol: (typeof l.symbol === "string" && l.symbol.trim()) ? l.symbol.trim().slice(0, 4) : "🔗",
    }));
  const gemeldet = (Array.isArray(o.inhaber) ? o.inhaber : LINK_INHABER_VORGABE)
    .filter((k) => typeof k === "string" && k.trim())
    .map((k) => k.trim().toUpperCase());
  // Kürzel, die an Links hängen, müssen in der Leiste auftauchen - sonst wäre
  // ein Link unsichtbar, ohne gelöscht zu sein.
  const inhaber = [...new Set([...(gemeldet.length ? gemeldet : LINK_INHABER_VORGABE), ...eintraege.map((l) => l.inhaber)])];
  return { inhaber, eintraege };
};

/* OEE-Quelle: WO die Tabelle liegt und WELCHE Spalte was bedeutet.
   Das steht in der gemeinsamen Datei, damit es einmal eingerichtet wird und
   nicht auf jedem Rechner erneut. Der Dateiverweis selbst lässt sich NICHT
   teilen (er gilt nur im Browser, der ihn geholt hat) - deshalb steht hier
   nur der Dateiname, gefunden wird die Tabelle über den Datenordner. */
const normalisiereOee = (roh) => {
  const o = roh && typeof roh === "object" && !Array.isArray(roh) ? roh : {};
  const spalten = {};
  ["datum", "zeit", "anlage", "schicht", "oee", "verfuegbarkeit", "leistung", "qualitaet"].forEach((f) => {
    const v = o.spalten && o.spalten[f];
    if (Number.isInteger(v) && v >= 0) spalten[f] = v;
  });
  return {
    datei: typeof o.datei === "string" ? o.datei.trim() : "",
    blatt: typeof o.blatt === "string" ? o.blatt.trim() : "",
    kopfzeile: Number.isInteger(o.kopfzeile) && o.kopfzeile >= 0 ? o.kopfzeile : null,
    spalten,
  };
};
const oeeEingerichtet = (q) => !!(q && q.datei);

/* Aus den Zeilen der Tabelle die Zahlen für die Kachel.
   Gefragt ist die Gesamtübersicht aller Anlagen über die LETZTEN 24 STUNDEN.
   Das geht nur, wenn die Zeilen einen Zeitpunkt tragen (Uhrzeitspalte,
   Uhrzeit im Datum oder wenigstens die Schicht - siehe leseOeeZeilen).
   Trägt die Tabelle nur ein Datum, wäre ein 24-Stunden-Fenster geraten:
   Dann gilt der jüngste Tag, und die Kachel sagt auch "Tag" statt "24 h".
   Gemittelt wird ungewichtet über alle Anlagen - ohne Laufzeit oder Stückzahl
   je Zeile wäre jede Gewichtung erfunden. */
const OEE_FENSTER_MS = 24 * 3600 * 1000;

const oeeMittel = (liste, feld) => {
  const w = liste.map((x) => x[feld]).filter((x) => typeof x === "number");
  return w.length ? Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 10) / 10 : null;
};

// Je Anlage ein Mittel - das ist die Gesamtübersicht, die hinter der Kachel steckt
const oeeProAnlage = (liste) => {
  const map = new Map();
  liste.forEach((z) => {
    const name = z.anlage || "(ohne Anlage)";
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(z);
  });
  return [...map.entries()]
    .map(([anlage, zs]) => ({
      anlage,
      oee: oeeMittel(zs, "oee"),
      verfuegbarkeit: oeeMittel(zs, "verfuegbarkeit"),
      leistung: oeeMittel(zs, "leistung"),
      qualitaet: oeeMittel(zs, "qualitaet"),
      zeilen: zs.length,
    }))
    .sort((a, b) => (a.oee == null ? 1 : b.oee == null ? -1 : a.oee - b.oee)); // schlechteste zuerst
};

const werteOeeAus = (alleZeilen, jetztMs) => {
  if (!alleZeilen.length) return null;
  const jetzt = jetztMs || Date.now();

  /* Robertos Ansage vom 07.08.: "Das ist letztendlich das, was zählt" - die
     GES-Zeile der Pivot, Excels Gesamtergebnis über den gefilterten
     Zeitraum. Steht eine solche Summenzeile in der Tabelle, zeigt die Kachel
     SIE; der jüngste Tag wandert als Zusatzinfo in den Tooltip. Tabellen
     ohne Summenzeile behalten das bisherige Verhalten (24 h bzw. Tag). */
  const summen = alleZeilen.filter((z) => z.istSumme);
  const zeilen = alleZeilen.filter((z) => !z.istSumme);
  /* Tagesreihe für die Diagramme im Klick-Popup: je Tag das Mittel der
     Tageszeilen (in der Pivot ist das genau die eine Tagessummenzeile).
     Enthalten ist, was die Tabelle hergibt - steht der Pivot-Filter auf
     einem Monat, reicht die Reihe genau so weit. */
  const tagesReihe = (() => {
    const proTag = new Map();
    zeilen.forEach((z) => {
      if (!z.tag) return;
      if (!proTag.has(z.tag)) proTag.set(z.tag, []);
      proTag.get(z.tag).push(z);
    });
    return [...proTag.keys()].sort().map((tag) => ({ tag, oee: oeeMittel(proTag.get(tag), "oee") }));
  })();
  if (summen.length) {
    const s = summen[summen.length - 1];
    // Zusatz: der jüngste Tag der Tabelle - als Einordnung und als
    // Frische-Wächter (eine Pivot, deren Filter auf einem alten Monat
    // steht, darf nicht wie eine aktuelle Zahl aussehen).
    const tage = [...new Set(zeilen.map((z) => z.tag).filter(Boolean))].sort();
    const letzter = tage.length ? tage[tage.length - 1] : null;
    const letzterWert = letzter ? oeeMittel(zeilen.filter((z) => z.tag === letzter), "oee") : null;
    const alterStunden = letzter ? Math.round((jetzt - new Date(letzter + "T00:00:00").getTime()) / 3600e3) : null;
    return {
      modus: "summe",
      tagesReihe,
      oee: s.oee,
      verfuegbarkeit: s.verfuegbarkeit, leistung: s.leistung, qualitaet: s.qualitaet,
      zeilen: alleZeilen.length,
      proAnlage: [],
      anlagen: 0,
      vergleich: null,
      juengsterTag: letzter, juengsterTagWert: letzterWert,
      veraltet: alterStunden != null && alterStunden > 48,
      alterStunden,
    };
  }
  if (!zeilen.length) return null;

  const mitZeit = zeilen.filter((z) => z.zeitMs != null);
  const genau = mitZeit.length > 0 && mitZeit.some((z) => z.zeitGenau);

  const bau = (liste, modus, zusatz) => ({
    modus, // "24h" | "tag" | "gesamt"
    tagesReihe,
    oee: oeeMittel(liste, "oee"),
    verfuegbarkeit: oeeMittel(liste, "verfuegbarkeit"),
    leistung: oeeMittel(liste, "leistung"),
    qualitaet: oeeMittel(liste, "qualitaet"),
    zeilen: liste.length,
    proAnlage: oeeProAnlage(liste),
    anlagen: [...new Set(liste.map((z) => z.anlage).filter(Boolean))].length,
    ...zusatz,
  });

  if (genau) {
    const imFenster = mitZeit.filter((z) => z.zeitMs > jetzt - OEE_FENSTER_MS && z.zeitMs <= jetzt + 3600e3);
    if (imFenster.length) {
      // Vergleich: die 24 Stunden davor
      const davor = mitZeit.filter((z) => z.zeitMs > jetzt - 2 * OEE_FENSTER_MS && z.zeitMs <= jetzt - OEE_FENSTER_MS);
      const von = Math.min(...imFenster.map((z) => z.zeitMs));
      const bis = Math.max(...imFenster.map((z) => z.zeitMs));
      return bau(imFenster, "24h", { vergleich: davor.length ? oeeMittel(davor, "oee") : null, von, bis });
    }
    // Nichts in den letzten 24 Stunden - die Tabelle hinkt hinterher. Das
    // darf die Kachel nicht verschweigen, sonst steht dort eine Zahl von
    // vorgestern, die wie die von heute Morgen aussieht.
    const juengste = Math.max(...mitZeit.map((z) => z.zeitMs));
    const letzterTag = new Date(juengste);
    const tagKey = `${letzterTag.getFullYear()}-${String(letzterTag.getMonth() + 1).padStart(2, "0")}-${String(letzterTag.getDate()).padStart(2, "0")}`;
    const liste = zeilen.filter((z) => z.tag === tagKey);
    // "veraltet" nur, wenn die Daten wirklich ZURÜCKliegen. Zeilen in der
    // Zukunft (Planwerte, vertippte Jahreszahl) sind nicht veraltet - sie
    // hier so zu nennen wäre schlicht falsch.
    const alter = Math.round((jetzt - juengste) / 3600e3);
    return bau(liste, "tag", alter > 24 ? { tag: tagKey, veraltet: true, alterStunden: alter } : { tag: tagKey });
  }

  // Nur Tagesdaten: jüngster Tag, Vergleich zum Vortag
  const tage = [...new Set(zeilen.map((z) => z.tag).filter(Boolean))].sort();
  if (!tage.length) return bau(zeilen, "gesamt", {});
  const letzter = tage[tage.length - 1];
  const liste = zeilen.filter((z) => z.tag === letzter);
  const vor = tage.length > 1 ? oeeMittel(zeilen.filter((z) => z.tag === tage[tage.length - 2]), "oee") : null;
  return bau(liste, "tag", { tag: letzter, vergleich: vor });
};

// Beschriftung der Kachel: sagt, WORÜBER die Zahl geht
const oeeZeitraumText = (s) => {
  if (!s) return "";
  if (s.modus === "summe") return s.veraltet ? "Gesamt (veraltet)" : "Gesamt";
  if (s.modus === "24h") return "letzte 24 h";
  if (s.modus === "gesamt") return "gesamt";
  const tag = s.tag ? new Date(s.tag + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) : "";
  return s.veraltet ? `${tag} (veraltet)` : tag;
};

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
  const [auswertungOffen, setAuswertungOffen] = useState(false); // Ausklappleiste "Auswertung" unter dem Plan-Kalender (Diagramm, Matrix, Druckvorlagen)
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
  // Linkstreifen unter der Menüleiste - ob die Verwaltung aufgeklappt ist und
  // wessen Sammlung angezeigt wird, merkt sich das Gerät, nicht die gemeinsame
  // Datei: Das ist eine Vorliebe, keine gemeinsame Angabe.
  const [links, setLinks] = useState(() => normalisiereLinks(null));
  // Beim Öffnen der App ist das Verwaltungsfeld IMMER zu. Vorher merkte sich
  // das Gerät den Zustand - wer einmal etwas angelegt hatte, bekam es danach
  // bei jedem Start aufgeklappt vor die Seite gelegt. Die Chips im Streifen
  // sind ohnehin sichtbar; das Feld darunter braucht man nur zum Bearbeiten.
  const [linksOffen, setLinksOffen] = useState(false);
  /* OEE aus der Excel-Tabelle. Die Einrichtung (oeeQuelle) steht in der
     gemeinsamen Datei, der abgelesene Stand (oeeStand) gilt nur für dieses
     Gerät - er wird ja hier gerade frisch aus der Tabelle gelesen. */
  const [oeeQuelle, setOeeQuelle] = useState(() => normalisiereOee(null));
  const [oeeStand, setOeeStand] = useState({ lage: "aus" }); // aus | laedt | ok | fehler
  const [settingsOee, setSettingsOee] = useState(null); // Entwurf im ⚙-Dialog
  /* ⚙ in Reitern statt einer langen Rolle - Robertos Wunsch vom 07.08.
     ("nicht sortiert, mache eine kleine Menüleiste oben"). */
  const [settingsTab, setSettingsTab] = useState("anlagen"); // anlagen | team | oee | pflege
  /* Programm-Update: Der Rahmen meldet, wenn im Update-Ordner eine neuere
     App-HTML liegt. Bleibender Zustand statt fluechtiger Meldung - ein
     Update soll nicht von der naechsten Erfolgsmeldung weggewischt werden. */
  const [programmUpdate, setProgrammUpdate] = useState(null); // {name, geaendert} | {laeuft} | {fehler}
  const [programmUpdateStatus, setProgrammUpdateStatus] = useState(null); // fuer ⚙
  const [oeeUebersichtOffen, setOeeUebersichtOffen] = useState(false);
  // Nachfrage, wenn die eben verbundene Datei keinen einzigen Eintrag hat.
  const [leereDatei, setLeereDatei] = useState(null);
  // Druck-Auswahl in der Auswertung: erst fragen, was aufs Papier soll.
  const [druckWahlOffen, setDruckWahlOffen] = useState(false);
  const [terminArchivOffen, setTerminArchivOffen] = useState(false); // Archiv der über eine Woche versäumten Termine
  const [druckUmfang, setDruckUmfang] = useState("ALLE");   // ALLE | TPM | RI
  const [druckOption, setDruckOption] = useState("");       // welche Vorlage im Dialog gewählt ist
  const [druckBereich, setDruckBereich] = useState("");     // aus welchem Reiter die Wahl stammt
  const [vorschauSeiten, setVorschauSeiten] = useState(1);  // wie viele Blätter die Vorlage ergibt
  const [druckMonat, setDruckMonat] = useState(new Date().getMonth());
  const [linkInhaber, setLinkInhaber] = useState(() => {
    try { return (localStorage.getItem("werkstatt-links-inhaber") || "").toUpperCase(); } catch (e) { return ""; }
  });
  const [linkEntwurf, setLinkEntwurf] = useState(null); // {id?, name, ziel, symbol} solange bearbeitet wird
  const [linkKopiert, setLinkKopiert] = useState(""); // id des Links, dessen Pfad gerade kopiert wurde
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
  const [settingsBenutzer, setSettingsBenutzer] = useState([]); // Benutzer & Rechte im ⚙-Dialog (nur Verwalter)
  const [settingsSchichten, setSettingsSchichten] = useState([]); // eigene Schichtarten im ⚙-Dialog
  const [settingsAnlagenteile, setSettingsAnlagenteile] = useState([]); // Anlagenteile im ⚙-Dialog
  const [neuesTeilAnlage, setNeuesTeilAnlage] = useState(""); // Auswahl beim Anlegen eines Anlagenteils
  const [neuesTeilName, setNeuesTeilName] = useState("");
  const [neueSchichtName, setNeueSchichtName] = useState("");
  const [backups, setBackups] = useState([]); // lokale Sicherungen (Sicherheitsnetz), neueste zuerst
  const [verlauf, setVerlauf] = useState([]); // wer hat wann was geändert (aus der gemeinsamen Datei), neueste zuerst

  /* ---- QoL-Runde 2 (Robertos Auswahl vom 19.08.) ---- */
  // Immer der frische Bestand für Rückgängig-Aktionen - ein State-Schnappschuss
  // im Klick-Verschluss wäre beim späteren Rückgängig längst veraltet.
  const entriesRef = useRef([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  // Nachtschicht-Modus (Auge-Knopf oben rechts): Leuchtdichte-Umkehr per CSS,
  // die Wahl bleibt am Gerät. Für die Nachtschicht am Störungs-Bildschirm.
  const [nachtModus, setNachtModus] = useState(() => {
    try { return localStorage.getItem("werkstatt-kalender-nachtmodus") === "1"; } catch (e) { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("wk-nacht", nachtModus);
    try { localStorage.setItem("werkstatt-kalender-nachtmodus", nachtModus ? "1" : "0"); } catch (e) { /* Anzeige gilt trotzdem */ }
  }, [nachtModus]);
  // Rückgängig-Leiste: eine Aktion, acht Sekunden Zeit.
  const [rueckgaengig, setRueckgaengig] = useState(null); // { text, mach }
  const rueckgaengigTimer = useRef(null);
  const zeigeRueckgaengig = (text, mach) => {
    if (rueckgaengigTimer.current) clearTimeout(rueckgaengigTimer.current);
    setRueckgaengig({ text, mach });
    rueckgaengigTimer.current = setTimeout(() => setRueckgaengig(null), 8000);
  };
  // Termin verschieben im Dialog
  const [verschiebeDatum, setVerschiebeDatum] = useState("");
  // Register-Suche
  const [registerSuche, setRegisterSuche] = useState("");
  // "Seit deinem letzten Besuch": Vergleichszeitpunkt je Gerät. Der neue
  // Zeitpunkt wird sofort gemerkt - beim nächsten Öffnen zählt dieses Öffnen.
  const [letzterBesuch] = useState(() => {
    try { return localStorage.getItem("werkstatt-kalender-letzter-besuch") || ""; } catch (e) { return ""; }
  });
  useEffect(() => {
    try { localStorage.setItem("werkstatt-kalender-letzter-besuch", new Date().toISOString()); } catch (e) { /* dann eben beim nächsten Mal */ }
  }, []);
  const [neuigkeitenZu, setNeuigkeitenZu] = useState(false);
  const [neuigkeitenAuf, setNeuigkeitenAuf] = useState(false);
  const neuigkeiten = useMemo(
    () => (letzterBesuch ? verlauf.filter((v) => String(v.ts || "") > letzterBesuch) : []),
    [verlauf, letzterBesuch]
  );
  // Tages-Sicherung: kleiner Zähler, damit die Anzeige nach "Jetzt sichern" nachzieht.
  const [sicherungTick, setSicherungTick] = useState(0);

  /* ---- QoL-Runde 3 (Robertos "alles bis auf 8", 19.08.) ---- */
  const [exportMenuOffen, setExportMenuOffen] = useState(false);   // Herausgabe: JSON oder CSV
  const [nachbestellOffen, setNachbestellOffen] = useState(false); // Übersicht offener Nachbestellungen
  const [registerTab, setRegisterTab] = useState("STECKBRIEF");    // Register-Dialog: Steckbrief | Historie
  const [steckbriefDraft, setSteckbriefDraft] = useState(null);    // Bearbeitungsstand im Register-Dialog

  /* ---- Kreativ-Runde G1-G8 (Robertos "einführen", 19.08.) ---- */
  // G1: Eigener Werkstatt-Name - liegt in den gemeinsamen Einstellungen,
  // damit ALLE denselben Namen sehen (Kopfzeile und Druckköpfe).
  const [werkstattName, setWerkstattName] = useState("");
  // G2: Voller Monat = kleines Fest (einmal je Monat und Gerät)
  const [festOffen, setFestOffen] = useState(null); // { monatName, anzahl } | null
  // G7: Tastatur-Spickzettel
  const [kuerzelOffen, setKuerzelOffen] = useState(false);
  // G8: Wochen-Rückblick (freitags), wegklickbar je Woche und Gerät
  const [rueckblickZu, setRueckblickZu] = useState(false);
  // Geburtstags-Karte (Variante A, 20.08.), wegklickbar je Tag und Gerät
  const [geburtstagZu, setGeburtstagZu] = useState(false);
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
  // Manche Browser lehnen das Nachfragen nach Dateirechten grundsätzlich ab
  // (z. B. wenn die App über file:// geöffnet wird). Dann ist "Jetzt
  // verbinden" eine Sackgasse - und der Nutzer müsste die Datei nach JEDEM
  // Browser-Neustart neu heraussuchen. Sobald das einmal aufgetreten ist,
  // blenden wir den Weg über den Speichern-Dialog ein, der ohne Nachfrage
  // auskommt.
  const [verbindenBlockiert, setVerbindenBlockiert] = useState(false);
  const [stoerVerbindenBlockiert, setStoerVerbindenBlockiert] = useState(false);
  const istRechteVerweigerung = (e) => /Not allowed to request permissions/.test(String(e && e.message || ""));
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
  // Benutzergruppen: Liste aus der gemeinsamen Datei; die Anmeldung merkt sich
  // das Gerät - wie von Roberto gewünscht "beim ersten Login für immer".
  const [benutzerListe, setBenutzerListe] = useState([]);
  const [angemeldet, setAngemeldet] = useState(() => localStorage.getItem("werkstatt-kalender-benutzer") || "");
  const [anmeldung, setAnmeldung] = useState({ name: "", kennwort: "", fehler: "" }); // Entwurf im Anmelde-Dialog
  // „Nur ansehen": Der Anmelde-Dialog wurde bewusst weggeklickt - die App
  // läuft dann als Leser (Robertos Regel vom 10.08.: ohne Anmeldung NIE
  // Schreibmodus, aber ansehen wie ein Aushang darf jeder).
  const [anmeldungZu, setAnmeldungZu] = useState(false);
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
  /* Schutz vor stillem Überschreiben: Beim Öffnen der Bearbeiten-Maske wird
     festgehalten, auf welchem Stand der Bericht war. Hat ihn in der Zwischen-
     zeit jemand anderes geändert, wird beim Speichern gefragt statt einfach
     der ältere Stand darübergelegt. Ohne diese Merkung würde die spätere
     Speicherung gewinnen - und niemand erführe davon. */
  const [stoerBasis, setStoerBasis] = useState(null);      // { id, updatedAt }
  const [stoerKonflikt, setStoerKonflikt] = useState(null); // { draft, fremd }
  const [sDraft, setSDraft] = useState(null); // Entwurf im Melden/Bearbeiten-Dialog
  const [stoerErledigteZeigen, setStoerErledigteZeigen] = useState(true); // Schichtbuch: behobene Berichte standardmäßig mit anzeigen
  // Filterleiste links - dieselben Begriffe wie im alten Schichtbuch, damit
  // beim Umstieg niemand suchen muss. Die Wahl merkt sich das Gerät, nicht die
  // gemeinsame Datei: Wie ich sortiere, geht meine Kollegen nichts an.
  const [stoerAnsicht, setStoerAnsicht] = useState(() => {
    try { return localStorage.getItem("werkstatt-stoer-ansicht") || "datum"; } catch (e) { return "datum"; }
  });
  // Vorgabe bewusst "alle": So zeigt die Liste nach dem Umstieg genau das,
  // was sie vorher zeigte. Ein voreingestellter Zeitraum hätte am ersten Tag
  // ausgesehen, als wären Berichte verschwunden.
  const [stoerListeZeitraum, setStoerListeZeitraum] = useState(() => {
    try { return localStorage.getItem("werkstatt-stoer-zeitraum") || "alle"; } catch (e) { return "alle"; }
  });
  const [stoerSchnell, setStoerSchnell] = useState(""); // "", "offen", "restarbeit", "lang"
  const [stoerOffeneTage, setStoerOffeneTage] = useState(null); // aufgeklappte Datums-Gruppen (null = Vorgabe: alle zu)
  const [stoerOffeneSchichten, setStoerOffeneSchichten] = useState(() => new Set()); // aufgeklappte Schichten "datum|schicht"
  const [stoerModus, setStoerModus] = useState("liste"); // "liste" | "auswertung"
  const [stoerZeitraum, setStoerZeitraum] = useState("jahr"); // "monat" | "jahr" | "alle"
  const [stoerSuche, setStoerSuche] = useState(""); // Freitextsuche über alle Störberichte
  const [monitorOpen, setMonitorOpen] = useState(false); // Werkstatt-Monitor (Vollbild)
  const [monitorUhr, setMonitorUhr] = useState(() => new Date());

  // Gemeinsame Datei: beim Start wiederverbinden und auf Änderungen der anderen hören
  useEffect(() => {
    let cancelled = false;
    // Das .catch ist keine Formsache: Ohne es bliebe die App bei einem Fehler
    // beim Prüfen der gemerkten Datei still im Zustand "noch nicht geprüft"
    // stehen - shareChecked würde nie true, also erschiene weder eine
    // Verbindungsleiste noch eine Meldung. Dieselbe Sorte Stillstand wie ein
    // Aufruf ohne Frist, nur eine Ebene höher.
    sharedFile.tryRestore()
      .catch((e) => ({ status: "none", fehler: e && e.message ? e.message : String(e) }))
      .then((st) => {
        if (cancelled) return;
        setShareState(st);
        setShareChecked(true);
        if (st.fehler) setShareErr("Gemeinsame Datei: Die gemerkte Datei ließ sich nicht prüfen – " + st.fehler + " Bitte über das Ordner-Symbol neu verbinden.");
      });
    const onUpdate = (ev) => {
      const d = ev.detail || {};
      // ALLES hier ist Hintergrund-Arbeit (Abgleich alle 30 s bzw. Rücklauf
      // nach dem Speichern) - als "nicht dringend" markiert darf React eine
      // laufende Neuzeichnung UNTERBRECHEN, wenn der Bediener klickt oder
      // tippt. Ohne startTransition fraß die Renderwelle eines fremden
      // Speicherns spürbar Klicks (Robertos "hängt nach", 10.08.).
      React.startTransition(() => {
      // Zusammenführen statt Ersetzen: Ein sehr kurz zurückliegender eigener
      // Speicherstand (z. B. gerade eben bestätigt) darf durch einen von der
      // Datei abgeholten, minimal älteren Stand nicht stillschweigend aus der
      // Ansicht verschwinden - jeweils der neuere Zeitstempel je Eintrag gewinnt.
      if (Array.isArray(d.entries)) {
        setEntries((prev) => {
          const merged = sharedFile.mergeEntries(d.entries, prev || [], d.deleted || {});
          // Unverändertes Ergebnis behält seine Referenz: Ein Abgleich, der
          // inhaltlich nichts Neues bringt (z. B. das Neuverbinden eines
          // Kollegen schreibt die Datei identisch neu), zeichnet dann nichts.
          // Der Vergleich läuft über Kennung+Zeitstempel statt den vollen
          // Inhalt - jede echte Änderung bekommt einen neuen Zeitstempel
          // (stampEntries), und die Voll-Serialisierung von Tausenden
          // Einträgen wäre auf einem Werkstatt-PC selbst schon eine Bremse.
          if (prev && merged.length === prev.length
              && merged.every((e, i) => e.id === prev[i].id && e.updatedAt === prev[i].updatedAt)) return prev;
          return merged;
        });
      }
      if (Array.isArray(d.verlauf)) setVerlauf((alt) => (JSON.stringify(alt) === JSON.stringify(d.verlauf) ? alt : d.verlauf));
      if (d.config) {
        // stabil(): Nur bei INHALTLICH neuem Stand eine neue Referenz setzen.
        // Jeder Abgleich liefert die Einstellungen mit - würden hier immer
        // frische Objekte gesetzt, zeichnete React nach jedem Speichern und
        // jedem Poll die halbe Oberfläche neu (Robertos "hängt nach" am
        // Release-Tag). Gleicher Inhalt -> gleiche Referenz -> kein Neuzeichnen.
        const stabil = (neu) => (alt) => (JSON.stringify(alt) === JSON.stringify(neu) ? alt : neu);
        if (Array.isArray(d.config.tpmAnlagen) && d.config.tpmAnlagen.length > 0) setTpmAnlagen(stabil(d.config.tpmAnlagen));
        if (Array.isArray(d.config.riItems) && d.config.riItems.length > 0) setRiItems(stabil(riMitWissen(d.config.riItems)));
        if (Array.isArray(d.config.team)) setTeam(stabil(normalisiereTeam(d.config.team)));
        if (Array.isArray(d.config.extraSchichten)) setExtraSchichten(stabil(normalisiereExtraSchichten(d.config.extraSchichten)));
        if (Array.isArray(d.config.anlagenteile)) setAnlagenteile(stabil(normalisiereAnlagenteile(d.config.anlagenteile)));
        if (d.config.links) setLinks(stabil(normalisiereLinks(d.config.links)));
        if (d.config.oee) setOeeQuelle(stabil(normalisiereOee(d.config.oee)));
        // Auch eine LEERE Liste übernehmen: Löscht Roberto alle Benutzer,
        // muss die Anmeldepflicht überall wieder verschwinden.
        if (Array.isArray(d.config.benutzer)) setBenutzerListe(stabil(normalisiereBenutzer(d.config.benutzer)));
        if (typeof d.config.werkstattName === "string") setWerkstattName((alt) => (alt === d.config.werkstattName ? alt : d.config.werkstattName));
      }
      });
    };
    const onShareError = (ev) => setShareErr(ev.detail || "Gemeinsame Datei: unbekannter Fehler.");
    const onShareOk = () => setShareErr(null);
    let infoTimer = null;
    const onShareInfo = (ev) => {
      setShareInfo(ev.detail || null);
      if (infoTimer) clearTimeout(infoTimer);
      infoTimer = setTimeout(() => setShareInfo(null), 15000);
    };
    // Programm-Update-Meldungen des Rahmens entgegennehmen (nur im Programm)
    if (window.__werkstattDesktop && window.__werkstattDesktop.aufUpdate) {
      window.__werkstattDesktop.aufUpdate((info) => setProgrammUpdate(info || {}));
    }
    window.addEventListener("werkstatt-shared-update", onUpdate);
    window.addEventListener("werkstatt-shared-error", onShareError);
    window.addEventListener("werkstatt-shared-ok", onShareOk);
    window.addEventListener("werkstatt-shared-info", onShareInfo);

    // ---- Störungen-Datei (eigene Instanz, gleiche Sync-Sicherheiten) ----
    sharedFile.stoer.tryRestore()
      .catch((e) => ({ status: "none", fehler: e && e.message ? e.message : String(e) }))
      .then((st) => {
        if (cancelled) return;
        setStoerState(st);
        setStoerChecked(true);
        if (st.fehler) setStoerErr("Störungen-Datei: Die gemerkte Datei ließ sich nicht prüfen – " + st.fehler + " Bitte im Schichtbuch neu verbinden.");
      });
    const onStoerUpdate = (ev) => {
      const d = ev.detail || {};
      if (Array.isArray(d.entries)) {
        // Hintergrund-Abgleich wie bei der Hauptdatei: nicht dringend, und
        // ein inhaltlich unveränderter Stand behält seine Referenz.
        React.startTransition(() => {
          setStoerungen((prev) => {
            const merged = sharedFile.mergeEntries(d.entries, prev || [], d.deleted || {});
            if (prev && merged.length === prev.length
                && merged.every((e, i) => e.id === prev[i].id && e.updatedAt === prev[i].updatedAt)) return prev;
            return merged;
          });
        });
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
      /* Am 03.08.2026 hat ein Kollege beim Neuanlegen der Verknüpfung eine
         LEERE Datei erwischt statt der gemeinsamen. Ordner-Symbol grün, Name
         richtig, Inhalt leer - aufgefallen ist es Tage später.
         Gefragt wird aber nur beim WIDERSPRUCH: Dieses Gerät hat Einträge,
         die eben gewählte Datei keinen einzigen. Eine leere Datei allein ist
         kein Grund - wer neu anfängt, hat zu Recht nichts drin, und eine
         Rückfrage bei jedem Erststart wäre eine, die man wegklickt, ohne
         hinzusehen. Dass die Datei leer ist, steht ohnehin dauerhaft in der
         Kennkarte. */
      if ((!opts || !opts.create) && sharedFile.canWrite()) {
        // Nur für Bearbeiter. Einem Nur-Leser „Andere Datei wählen" anzubieten
        // wäre dieselbe Einladung, die im Schreibschutz-Balken bewusst
        // versteckt ist - er soll ansehen, nicht die Quelle wechseln. Dass die
        // Datei leer ist, steht für ihn in der Kennkarte.
        const info = sharedFile.fileInfo();
        if (info && info.eintraege === 0 && entries.length > 0) setLeereDatei(info);
      }
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
      setVerbindenBlockiert(false);
      setErr(null);
    } catch (e) {
      if (istRechteVerweigerung(e)) {
        const u = sharedFile.umgebung();
        setVerbindenBlockiert(true);
        setErr(`Dieser Browser erlaubt das Nachfragen nach Dateirechten grundsätzlich nicht (Adresse: ${u.protokoll}, sicherer Kontext: ${u.sichererKontext ? "ja" : "nein"}). Nimm „Mit Schreibrecht verbinden …“ – das kommt ohne Nachfrage aus.`);
      } else {
        setErr("Gemeinsame Datei: " + (e && e.message ? e.message : "Verbinden hat nicht geklappt."));
      }
    }
  };
  // Verbinden ohne jede Rechte-Nachfrage: der Speichern-Dialog vergibt das
  // Schreibrecht unmittelbar. Der Inhalt der Datei bleibt erhalten - er wird
  // vorher gelesen und zusammengeführt.
  const verbindeMitSchreibrecht = async () => {
    try {
      await sharedFile.pickWritable();
      setShareState({ status: "connected", name: sharedFile.fileName(), mode: sharedFile.canWrite() ? "readwrite" : "read" });
      setShareChecked(true);
      setVerbindenBlockiert(false);
      setErr(null);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setErr("Gemeinsame Datei: " + (e && e.message ? e.message : "Verbinden hat nicht geklappt."));
    }
  };
  const disconnectShared = async () => {
    // Das Aufräumen darf scheitern (z. B. IndexedDB gesperrt) - getrennt wird
    // trotzdem. Sonst bliebe ein Klick auf "Trennen" ohne jede sichtbare Wirkung.
    try { await sharedFile.disconnect(); } catch (e) { /* Anzeige zählt */ }
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
      setStoerVerbindenBlockiert(false);
      setStoerErr(null);
    } catch (e) {
      if (istRechteVerweigerung(e)) {
        setStoerVerbindenBlockiert(true);
        setStoerErr("Dieser Browser erlaubt das Nachfragen nach Dateirechten grundsätzlich nicht. Nimm „Mit Schreibrecht verbinden …“ – das kommt ohne Nachfrage aus.");
      } else {
        setStoerErr("Störungen-Datei: " + (e && e.message ? e.message : "Verbinden hat nicht geklappt."));
      }
    }
  };
  // Die Störungen-Datei MUSS für alle beschreibbar sein - auch für Leser der
  // Hauptdaten. Deshalb braucht gerade sie den Weg ohne Rechte-Nachfrage.
  const verbindeStoerMitSchreibrecht = async () => {
    try {
      await sharedFile.stoer.pickWritable();
      setStoerState({ status: "connected", name: sharedFile.stoer.fileName(), mode: sharedFile.stoer.canWrite() ? "readwrite" : "read" });
      setStoerChecked(true);
      setStoerVerbindenBlockiert(false);
      setStoerErr(null);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setStoerErr("Störungen-Datei: " + (e && e.message ? e.message : "Verbinden hat nicht geklappt."));
    }
  };
  const disconnectStoer = async () => {
    try { await sharedFile.stoer.disconnect(); } catch (e) { /* Anzeige zählt */ }
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
  // ---- Benutzergruppen: die Namensliste aus der gemeinsamen Datei ----
  // Sie greift ZUSÄTZLICH zu den Datei-Rechten: Auch wenn das Laufwerk
  // schreiben ließe, bleibt ein "Leser"-Benutzer in der App Nur-Leser.
  // Solange die Anmeldung aussteht, gilt Nur-Lesen - erst der bestätigte
  // Benutzer beweist das Gegenteil (dieselbe Denkweise wie bei der Datei).
  const benutzerAktiv = benutzerListe.length > 0;
  const meinBenutzer = benutzerAktiv ? benutzerListe.find((b) => b.name === angemeldet) || null : null;
  const benutzerDarfSchreiben = !benutzerAktiv || (meinBenutzer != null && meinBenutzer.rolle !== "leser");
  const istVerwalter = !benutzerAktiv || (meinBenutzer != null && meinBenutzer.rolle === "verwalter");
  const anmeldungOffen = benutzerAktiv && meinBenutzer == null && !anmeldungZu;
  const vollzugriff = shareChecked && (shareState.status === "unsupported" || (shareState.status === "connected" && shareState.mode === "readwrite")) && benutzerDarfSchreiben;
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
          return merged;
        }
      } catch (e) {
        setStoerErr("Störung konnte nicht in der gemeinsamen Datei gespeichert werden (Datei erreichbar?). Lokal ist alles gesichert.");
      }
    }
    // Ohne Datei (oder wenn das Schreiben scheiterte) gilt der lokale Stand.
    return next;
  };
  // Beim Öffnen der Bearbeiten-Maske den Ausgangsstand festhalten.
  useEffect(() => {
    if (stoerModal && stoerModal.mode === "edit" && stoerModal.id) {
      const s = stoerungen.find((x) => x.id === stoerModal.id);
      setStoerBasis({ id: stoerModal.id, updatedAt: (s && s.updatedAt) || "" });
    } else if (!stoerModal) {
      setStoerBasis(null);
    }
    // Absicht: NUR beim Wechsel der Maske, nicht bei jeder Änderung der Liste -
    // sonst würde die Basis mitwandern und der Vergleich ginge ins Leere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stoerModal && stoerModal.mode, stoerModal && stoerModal.id]);

  /* Holt den Bericht so, wie er JETZT in der gemeinsamen Datei steht. Der
     Abgleich läuft sonst alle 30 s - beim Speichern lohnt der eine zusätzliche
     Blick, sonst bliebe genau das Zeitfenster offen, um das es hier geht. */
  const frischerStoerStand = async (id) => {
    if (!sharedFile.stoer.isConnected()) return null;
    try {
      await sharedFile.stoer.pollNow();
      const liste = JSON.parse(localStorage.getItem(STOER_STORAGE_KEY) || "[]");
      return liste.find((x) => x.id === id) || null;
    } catch (e) { return null; }   // nicht erreichbar: dann eben ohne Warnung
  };

  // Eine Störung anlegen/ändern/löschen (Kürzel wird wie bei der Pinnwand gemerkt)
  const speichereStoerung = async (draft, erzwingen = false) => {
    // Hat jemand anderes den Bericht angefasst, seit die Maske offen ist?
    if (draft.id && !erzwingen && stoerBasis && stoerBasis.id === draft.id) {
      const fremd = await frischerStoerStand(draft.id);
      if (fremd && fremd.updatedAt && fremd.updatedAt !== stoerBasis.updatedAt) {
        setStoerKonflikt({ draft, fremd });
        return;
      }
    }
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
      const jahr = String(datum).slice(0, 4);
      const s = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...gemeinsam,
        nr: naechsteStoerNr(stoerungen, jahr),
        offen, gemeldetAt: jetzt, behobenAt: offen ? null : (behobenAusFeld() || jetzt),
      };
      const nachher = await persistStoer([...stoerungen, s]);
      // Erst NACH dem Zusammenführen steht fest, ob die Nummer noch frei war:
      // Der Kollege kann in derselben Minute gemeldet haben. Dann rückt genau
      // einer der beiden weiter - wer, entscheidet dieselbe Regel auf beiden
      // Geräten. Der Bericht ist gerade erst entstanden, die Verschiebung sieht
      // also niemand.
      const meiner = (nachher || []).find((x) => x.id === s.id);
      if (meiner && nummerSchonVergeben(nachher, meiner)) {
        const frei = naechsteStoerNr(nachher, jahr);
        await persistStoer((nachher || []).map((x) => (x.id === s.id ? { ...x, nr: frei } : x)));
      }
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
  /* Schichtbericht: alle Störungen der letzten drei Schichten bis jetzt.
     Robertos Ansage vom 13.08.: Nach „Drucken" im Störungs-Bereich einen
     Tagesbericht über die letzten drei Schichten - zum Ausdrucken UND zum
     Zeigen am Bildschirm (dort führt Drucken → „Als PDF speichern" zur PDF).
     Die Schichtfolge ist fest (Früh 06-14, Spät 14-22, Nacht 22-06); die
     Nacht zählt zu dem Tag, an dem sie begonnen hat - so trägt es auch die
     Werkstatt in die Berichte ein. */
  const stoerSchichtSlots = () => {
    const jetzt = new Date();
    const h = jetzt.getHours();
    const tagKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const datum = new Date(jetzt);
    let idx;
    if (h >= 6 && h < 14) idx = 0;
    else if (h >= 14 && h < 22) idx = 1;
    else { idx = 2; if (h < 6) datum.setDate(datum.getDate() - 1); }
    const slots = [];
    for (let i = 0; i < 3; i++) {
      slots.push({ datum: tagKey(datum), schicht: STOER_SCHICHTEN[idx] });
      idx--; if (idx < 0) { idx = 2; datum.setDate(datum.getDate() - 1); }
    }
    return slots; // [laufende Schicht, die davor, die davor]
  };

  /* ---- Schichtübergabe-Blatt (QoL Runde 3) ----
     Ein Blatt für die Übergabe: offene Störungen (mit "was muss die nächste
     Schicht tun"), die heutigen Termine und die veröffentlichten Pinnwand-
     Zettel - Stand auf die Minute, A4 hoch. */
  const buildUebergabeblattHTML = () => {
    const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const jetzt = new Date();
    const h = jetzt.getHours();
    const laufende = h >= 6 && h < 14 ? "Früh" : h >= 14 && h < 22 ? "Spät" : "Nacht";
    const naechste = { "Früh": "Spät", "Spät": "Nacht", "Nacht": "Früh" }[laufende];
    const uebergabeUm = { "Früh": "14:00", "Spät": "22:00", "Nacht": "06:00" }[laufende];
    const stand = jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const wochentag = jetzt.toLocaleDateString("de-DE", { weekday: "long" });

    const offene = stoerungen
      .filter((s) => s.offen)
      .sort((a, b) => String(b.gemeldetAt || b.date).localeCompare(String(a.gemeldetAt || a.date)));
    const heutigeTermine = entries
      .filter((e) => (e.category === "TPM" || e.category === "RI") && e.date === todayKey)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const zettelSichtbar = entries
      .filter((e) => e.category === "NOTIZ" && e.veroeffentlicht)
      .sort((a, b) => String(b.zeit || b.date).localeCompare(String(a.zeit || a.date)))
      .slice(0, 6);

    const stoerZeilen = offene.map((s) => `
      <div style="border-left:3px solid #C0392B;padding:4px 10px;margin-bottom:4px;font-size:12px;color:#22262B;">
        ${stoerNrLang(s) ? `<span style="font-family:monospace;font-weight:700;color:#2F6690;">${esc(stoerNrKurz(s))}</span> · ` : ""}
        <b>${esc(s.anlage || "—")}${s.anlagenteil ? " " + esc(s.anlagenteil) : ""}</b> – ${esc(s.stoerung || "")}
        ${s.nochZuTun && String(s.nochZuTun).trim() ? `<div style="color:#8A4B00;font-weight:600;">➜ ${esc(s.nochZuTun)}</div>` : ""}
      </div>`).join("");

    const terminZeilen = heutigeTermine.length
      ? heutigeTermine.map((e) => `<span style="display:inline-block;margin:1px 10px 1px 0;font-size:12px;color:${e.status === "done" ? "#24603D" : "#B23A34"};font-weight:700;">${e.status === "done" ? "✓" : "✕"} ${esc(e.name)}</span>`).join("")
      : `<span style="font-size:12px;color:#8A9099;font-style:italic;">Heute steht kein Termin an.</span>`;

    const zettelZeilen = zettelSichtbar.length
      ? zettelSichtbar.map((z) => `<div style="font-size:12px;color:#22262B;margin-bottom:3px;">„${esc(z.note || "")}" <span style="color:#8A9099;">(${esc(z.name || "")})</span></div>`).join("")
      : `<div style="font-size:12px;color:#8A9099;font-style:italic;">Keine veröffentlichten Zettel.</div>`;

    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Schichtübergabe ${formatDateDE(todayKey)}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 8px; }
      </style>
    </head><body>
      <div id="blatt" style="width:702px;">
        <div style="border-bottom:2.5px solid #22262B;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end;">
          <div>
            <div style="font-weight:900;font-size:19px;">Schichtübergabe</div>
            <div style="font-size:11px;color:#6B7480;">${esc(wochentag)}, ${formatDateDE(todayKey)} · Übergabe ${laufende} → ${naechste} um ${uebergabeUm} · Stand ${stand} Uhr</div>
          </div>
          <div style="font-size:24px;font-weight:800;">${uebergabeUm}</div>
        </div>
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:#B23A34;margin-bottom:5px;">Offene Störungen (${offene.length})</div>
        ${stoerZeilen || `<div style="font-size:12px;color:#1F7A3D;font-weight:700;margin-bottom:4px;">Keine offene Störung – gute Übergabe.</div>`}
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:#C97A2B;margin:14px 0 5px;">Heutige Termine</div>
        <div>${terminZeilen}</div>
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:#2F6690;margin:14px 0 5px;">Pinnwand</div>
        ${zettelZeilen}
        <div style="margin-top:16px;padding-top:8px;border-top:1px solid #C3C7CB;font-size:10px;color:#6B7480;">
          Erstellt aus dem ${esc(appName)} · Stand ${formatDateDE(todayKey)}, ${stand} Uhr. Einzelheiten zu jeder Störung stehen im Störbericht (Nummer).
        </div>
      </div>
      ${passtAufEinBlatt(702, 1010)}
    </body></html>`;
  };
  /* Feste Farben der drei Bericht-Schichten für die Druckvorlagen. Robertos
     Wahl vom 13.08. (aus drei gezeigten Varianten): Tabellen-Protokoll in
     A4 quer, die Zeilen leicht in der Schichtfarbe hinterlegt - Früh
     gelblich, Spät grünlich, Nacht bläulich; die Gruppenzeile einen Ton
     kräftiger. Offenes bleibt zusätzlich über das rote OFFEN-Schild und die
     orangene Aufgaben-Spalte erkennbar (auch auf Schwarz-Weiß-Druckern). */
  const STOER_DRUCK_FARBEN = {
    "Früh": { chip: "#F0C230", chipText: "#2B2200", zeile: "#FDF6DF", gruppe: "#F6E9BC" },
    "Spät": { chip: "#1F7A3D", chipText: "#fff", zeile: "#EAF3EC", gruppe: "#D8EADD" },
    "Nacht": { chip: "#2F6690", chipText: "#fff", zeile: "#E9F0F7", gruppe: "#D5E3F0" },
  };
  const buildStoerSchichtberichtHTML = () => {
    const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const zeitVon = { "Früh": "06:00–14:00", "Spät": "14:00–22:00", "Nacht": "22:00–06:00" };
    // Die drei Zeitfenster kommen aus der Uhr; ANGEZEIGT wird in der festen
    // Folge Früh -> Spät -> Nacht (Robertos Ansage), nicht chronologisch.
    const slots = [...stoerSchichtSlots()].sort((a, b) => STOER_SCHICHTEN.indexOf(a.schicht) - STOER_SCHICHTEN.indexOf(b.schicht));
    const jetzt = new Date();
    const stand = jetzt.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const proSlot = slots.map((slot) => ({
      ...slot,
      liste: stoerungen
        .filter((s) => s.date === slot.datum && s.schicht === slot.schicht)
        .sort((a, b) => String(a.gemeldetAt || "").localeCompare(String(b.gemeldetAt || ""))),
    }));
    const alle = proSlot.flatMap((x) => x.liste);
    const ausfallGesamt = alle.reduce((m, s) => m + (Number(s.ausfallzeit) || 0), 0);
    const offene = alle.filter((s) => s.offen).length;
    const chip = (sch) => {
      const f = STOER_DRUCK_FARBEN[sch] || { chip: "#8A9099", chipText: "#fff" };
      return `<span style="display:inline-block;padding:1px 8px;border-radius:3px;background:${f.chip};color:${f.chipText};font-weight:800;font-size:8pt;text-transform:uppercase;letter-spacing:0.5px">${esc(sch)}</span>`;
    };
    const gruppe = (slot) => {
      const d = new Date(slot.datum + "T00:00:00");
      const f = STOER_DRUCK_FARBEN[slot.schicht] || { gruppe: "#E9EDF1" };
      const summe = slot.liste.reduce((m, s) => m + (Number(s.ausfallzeit) || 0), 0);
      return `<tr class="gruppe"><td colspan="7" style="background:${f.gruppe}">${chip(slot.schicht)} &nbsp;${d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })} · ${esc(slot.schicht)} (${zeitVon[slot.schicht] || ""}) &nbsp;<span class="gsumme">· ${slot.liste.length} ${slot.liste.length === 1 ? "Bericht" : "Berichte"}${summe > 0 ? " · " + esc(minutenText(summe)) : ""}</span></td></tr>`;
    };
    const zeile = (s, slot) => {
      const f = STOER_DRUCK_FARBEN[slot.schicht] || { zeile: "#fff" };
      return `<tr style="background:${f.zeile}">
        <td class="nr"><span class="mono">${esc(stoerNrLang(s))}</span><div class="klein mono">${(Number(s.ausfallzeit) || 0) > 0 ? esc(minutenText(s.ausfallzeit)) : "–"}</div></td>
        <td><strong>${esc(s.anlage) || "—"}</strong>${s.anlagenteil ? `<div class="klein">${esc(s.anlagenteil)}</div>` : ""}</td>
        <td>${esc(s.stoerung)}${s.ursache ? `<div class="klein">Ursache: ${esc(s.ursache)}</div>` : ""}</td>
        <td>${esc(s.getan || "")}${s.ersatzteile ? `<div class="klein">Ersatzteile: ${esc(s.ersatzteile)}${s.nachbestellt ? " (nachbestellt)" : ""}</div>` : ""}</td>
        <td class="naechste">${s.offen ? esc(s.nochZuTun || "") : ""}</td>
        <td>${s.offen ? '<span class="st offen">OFFEN</span>' : '<span class="st ok">OK</span>'}</td>
        <td>${esc(s.melder) || ""}</td>
      </tr>`;
    };
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Schichtbericht Störungen – Stand ${esc(stand)}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2430; margin: 0; }
        h1 { font-size: 15pt; margin: 0; }
        .kopf { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #22262B; padding-bottom: 2.5mm; margin-bottom: 3mm; }
        .kopf .stand { text-align: right; color: #5B6572; font-size: 8.5pt; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #22262B; color: #fff; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4pt; text-align: left; padding: 1.8mm 2mm; }
        td { font-size: 8.5pt; vertical-align: top; padding: 1.8mm 2mm; border-bottom: 0.5pt solid #D8DCE1; }
        tr.gruppe td { border-bottom: 1pt solid #B9C0C8; padding: 1.4mm 2mm; font-weight: 800; font-size: 9pt; }
        .gsumme { font-weight: 600; color: #5B6572; }
        td.nr { white-space: nowrap; }
        .mono { font-family: ui-monospace, Consolas, monospace; font-size: 8pt; }
        .klein { color: #5B6572; font-size: 7.5pt; margin-top: 0.6mm; }
        .naechste { color: #8A4B00; font-weight: 600; }
        .st { font-weight: 800; font-size: 8pt; padding: 0.5mm 2mm; border-radius: 2.5mm; border: 1.2pt solid; white-space: nowrap; }
        .st.ok { color: #1F7A3D; border-color: #1F7A3D; }
        .st.offen { color: #fff; background: #C0392B; border-color: #C0392B; }
        .leer { color: #8A9099; font-style: italic; }
        .fuss { margin-top: 4mm; display: flex; justify-content: space-between; color: #8A9099; font-size: 7.5pt; border-top: 0.5pt solid #C4CBD2; padding-top: 1.5mm; }
      </style></head><body>
      <div class="kopf">
        <h1>Schichtbericht Störungen</h1>
        <div class="stand">Stand: <strong>${esc(stand)}</strong><br>Letzte drei Schichten · ${alle.length} ${alle.length === 1 ? "Störung" : "Störungen"} · ${offene} offen${ausfallGesamt > 0 ? " · Ausfallzeit " + esc(minutenText(ausfallGesamt)) : ""}</div>
      </div>
      <table>
      <thead><tr><th style="width:20mm">Nr. / Ausfall</th><th style="width:38mm">Anlage · Teil</th><th style="width:55mm">Abweichung / Störung</th><th style="width:62mm">Was wurde unternommen?</th><th style="width:52mm">Was muss die nächste Schicht tun?</th><th style="width:13mm">Status</th><th style="width:20mm">Melder</th></tr></thead>
      <tbody>
      ${proSlot.map((slot) => gruppe(slot) + (slot.liste.length === 0
        ? `<tr><td colspan="7" class="leer">keine Störungen</td></tr>`
        : slot.liste.map((s) => zeile(s, slot)).join(""))).join("")}
      </tbody></table>
      <div class="fuss"><span>${esc(appName)} · Schichtbericht</span><span>gedruckt ${esc(stand)}</span></div>
      </body></html>`;
  };

  /* Monats-Auswertung der Störungen als Druckblatt (Robertos Ansage vom
     13.08.): oben Kennzahlen, darunter das Diagramm und die Anlagen-Liste -
     beides nach ANZAHL der Störungen, nicht nach Ausfallzeit ("die Zeit
     variiert zu stark"). Die Ausfallzeit bleibt als Zusatzangabe an jeder
     Zahl stehen. Unten die Störungen mit Ausfall als Notizen-Liste. */
  const buildStoerMonatsblattHTML = (jahr, monatIdx) => {
    const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const key = `${jahr}-${pad(monatIdx + 1)}`;
    const liste = stoerungen.filter((s) => String(s.date || "").startsWith(key));
    const tageImMonat = new Date(jahr, monatIdx + 1, 0).getDate();
    const jetzt = new Date();
    const stand = jetzt.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const heuteTag = (jetzt.getFullYear() === jahr && jetzt.getMonth() === monatIdx) ? jetzt.getDate() : tageImMonat;
    const gesamtMin = liste.reduce((m, s) => m + (Number(s.ausfallzeit) || 0), 0);
    const offene = liste.filter((s) => s.offen).length;
    const proTag = Array.from({ length: tageImMonat }, (_, i) =>
      liste.filter((s) => Number(String(s.date).slice(8, 10)) === i + 1).length);
    const maxTag = Math.max(1, ...proTag);
    const proAnlage = [...liste.reduce((m, s) => {
      const k = s.anlage || "ohne Anlage";
      if (!m.has(k)) m.set(k, { anlage: k, anzahl: 0, min: 0 });
      const r = m.get(k); r.anzahl++; r.min += Number(s.ausfallzeit) || 0;
      return m;
    }, new Map()).values()].sort((a, b) => b.anzahl - a.anzahl || b.min - a.min);
    // Balkendiagramm Anzahl je Tag - als SVG, damit es im Druck gestochen bleibt
    const w = 760, h = 150, links = 26, unten = 22;
    const bw = (w - links - 6) / tageImMonat;
    const balken = proTag.map((n, i) => {
      const bh = n === 0 ? 0 : Math.max(4, (n / maxTag) * (h - unten - 26));
      const x = links + i * bw, y = h - unten - bh;
      const zukunft = i + 1 > heuteTag;
      return `<rect x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" fill="${zukunft ? "#E2E6EA" : "#2F6690"}" rx="1"/>` +
        (n > 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="8" text-anchor="middle" fill="#5B6572">${n}</text>` : "") +
        `<text x="${(x + bw / 2).toFixed(1)}" y="${h - unten + 10}" font-size="7.5" text-anchor="middle" fill="${(i + 1) % 5 === 0 || i === 0 ? "#5B6572" : "#B7BEC6"}">${i + 1}</text>`;
    }).join("");
    const maxAnz = Math.max(1, ...proAnlage.map((r) => r.anzahl));
    const anlagenBalken = proAnlage.slice(0, 10).map((r) =>
      `<div class="bz"><span class="name">${esc(r.anlage)}</span><span class="balken" style="width:${Math.max(2, (r.anzahl / maxAnz) * 60)}mm"></span><span class="wert">${r.anzahl}×${r.min > 0 ? " · " + esc(minutenText(r.min)) : ""}</span></div>`).join("");
    const notizen = liste
      .filter((s) => (Number(s.ausfallzeit) || 0) > 0 || s.offen)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.gemeldetAt || "").localeCompare(String(b.gemeldetAt || "")));
    const notizZeilen = notizen.map((s) => `<tr>
      <td class="mono">${esc(String(s.date).slice(8, 10))}.${esc(String(s.date).slice(5, 7))}.${s.schicht ? `<div class="klein">${esc(s.schicht)}</div>` : ""}</td>
      <td><strong>${esc(s.anlage) || "—"}</strong>${s.anlagenteil ? `<div class="klein">${esc(s.anlagenteil)}</div>` : ""}</td>
      <td>${esc(s.stoerung)}${s.getan ? `<div class="klein">→ ${esc(s.getan)}</div>` : ""}${s.offen && s.nochZuTun ? `<div class="klein" style="color:#8A4B00;font-weight:600">➜ ${esc(s.nochZuTun)}</div>` : ""}</td>
      <td class="mono" style="text-align:right">${(Number(s.ausfallzeit) || 0) > 0 ? esc(minutenText(s.ausfallzeit)) : "–"}</td>
      <td>${s.offen ? '<span class="st offen">OFFEN</span>' : '<span class="st ok">OK</span>'}</td>
      <td>${esc(s.melder) || ""}</td></tr>`).join("");
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Störungs-Auswertung ${esc(MONTHS[monatIdx])} ${jahr}</title>
      <style>
        @page { size: A4 portrait; margin: 11mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2430; margin: 0; }
        h1 { font-size: 14.5pt; margin: 0; }
        h2 { font-size: 10pt; margin: 4mm 0 1.5mm; text-transform: uppercase; letter-spacing: 0.4pt; color: #5B6572; }
        .kopf { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #22262B; padding-bottom: 2.5mm; margin-bottom: 3mm; }
        .kopf .stand { text-align: right; color: #5B6572; font-size: 8.5pt; line-height: 1.5; }
        .kpis { display: flex; gap: 3mm; margin-bottom: 3mm; }
        .kpi { flex: 1; border: 0.8pt solid #C4CBD2; border-radius: 2mm; padding: 2mm 3mm; }
        .kpi .z { font-size: 14pt; font-weight: 800; }
        .kpi .l { font-size: 7.5pt; color: #5B6572; margin-top: 0.5mm; line-height: 1.3; }
        .kpi.rot .z { color: #C0392B; }
        .mono { font-family: ui-monospace, Consolas, monospace; font-size: 8pt; }
        .bz { display: flex; align-items: center; gap: 2mm; margin-bottom: 1.2mm; font-size: 8pt; }
        .bz .name { flex: 0 0 48mm; text-align: right; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bz .balken { height: 4.2mm; background: #2F6690; border-radius: 0.8mm; }
        .bz .wert { color: #5B6572; font-size: 7.5pt; white-space: nowrap; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4pt; text-align: left; color: #5B6572; padding: 1.4mm 2mm; border-bottom: 1pt solid #22262B; }
        td { font-size: 8.5pt; vertical-align: top; padding: 1.5mm 2mm; border-bottom: 0.5pt solid #DDE1E6; }
        .klein { color: #5B6572; font-size: 7.5pt; margin-top: 0.5mm; }
        .st { font-weight: 800; font-size: 7.5pt; padding: 0.4mm 1.8mm; border-radius: 2.5mm; border: 1.1pt solid; white-space: nowrap; }
        .st.ok { color: #1F7A3D; border-color: #1F7A3D; }
        .st.offen { color: #fff; background: #C0392B; border-color: #C0392B; }
        .leer { color: #8A9099; font-style: italic; font-size: 9pt; }
        .fuss { margin-top: 4mm; display: flex; justify-content: space-between; color: #8A9099; font-size: 7.5pt; border-top: 0.5pt solid #C4CBD2; padding-top: 1.5mm; }
      </style></head><body>
      <div class="kopf">
        <h1>Störungs-Auswertung · ${esc(MONTHS[monatIdx])} ${jahr}</h1>
        <div class="stand">Stand: <strong>${esc(stand)}</strong></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="z">${liste.length}</div><div class="l">Störungen</div></div>
        <div class="kpi"><div class="z">${gesamtMin > 0 ? esc(minutenText(gesamtMin)) : "0 min"}</div><div class="l">Ausfallzeit gesamt</div></div>
        <div class="kpi rot"><div class="z">${offene}</div><div class="l">noch offen</div></div>
        <div class="kpi"><div class="z">${liste.length ? Math.round(gesamtMin / liste.length) + " min" : "–"}</div><div class="l">Ø je Störung</div></div>
      </div>
      ${liste.length === 0 ? `<div class="leer">Keine Störberichte in diesem Monat.</div>` : `
      <h2>Störungen je Tag (Anzahl)</h2>
      <svg viewBox="0 0 ${w} ${h}" style="width:186mm;display:block">
        <line x1="${links}" y1="${h - unten}" x2="${w - 4}" y2="${h - unten}" stroke="#8A9099" stroke-width="1"/>${balken}</svg>
      <h2>Anlagen nach Anzahl der Störungen</h2>
      ${anlagenBalken}
      <h2>Störungen mit Ausfall bzw. offen – Notizen</h2>
      ${notizen.length === 0 ? `<div class="leer">keine</div>` : `<table>
      <thead><tr><th style="width:14mm">Tag</th><th style="width:40mm">Anlage · Teil</th><th>Störung → Maßnahme</th><th style="width:16mm">Ausfall</th><th style="width:13mm">Status</th><th style="width:22mm">Melder</th></tr></thead>
      <tbody>${notizZeilen}</tbody></table>`}`}
      <div class="fuss"><span>${esc(appName)} · Monats-Auswertung Störungen</span><span>gedruckt ${esc(stand)}</span></div>
      </body></html>`;
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
  /* Der Nachweis wird gebaut und zurueckgegeben, nicht sofort gedruckt -
     so kann ihn die Vorschau im Druck-Dialog genauso anzeigen. */
  const buildNachweisHTML = (jahr) => {
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
        <div class="unter">Rundgänge und Inspektionen (R+I) · ${esc(appName)}</div></div>
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
    return html;
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

  /* ---- Filterleiste: Zeitraum und Schnellzugriff ----
     Die Zähler stehen bewusst an der Leiste und nicht über der Liste: Man
     sieht dann, was ein Klick bringen WÜRDE, bevor man ihn macht. */
  const stoerZeitGrenze = (() => {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (stoerListeZeitraum === "woche") { const w = new Date(t); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); return dateKey(w.getFullYear(), w.getMonth(), w.getDate()); }
    if (stoerListeZeitraum === "monat") return dateKey(t.getFullYear(), t.getMonth(), 1);
    if (stoerListeZeitraum === "jahr") return `${t.getFullYear()}-01-01`;
    return null; // "alle"
  })();
  const imZeitraum = (s) => !stoerZeitGrenze || String(s.date || "") >= stoerZeitGrenze;
  const langeStoerung = (s) => (Number(s.ausfallzeit) || 0) >= 60;
  const mitRestarbeit = (s) => !!s.offen && String(s.nochZuTun || "").trim().length > 0;
  const passtSchnell = (s) => {
    if (stoerSchnell === "offen") return !!s.offen;
    if (stoerSchnell === "restarbeit") return mitRestarbeit(s);
    if (stoerSchnell === "lang") return langeStoerung(s);
    return true;
  };
  // Zähler für die Leiste - immer über ALLE Berichte, nicht über die gerade
  // gefilterte Auswahl. Sonst zeigte "Diese Woche 7" nach einem Klick auf
  // "Nur offene" plötzlich 2, und die Zahl wäre wertlos.
  const zaehleZeitraum = (art) => {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let ab = null;
    if (art === "woche") { const w = new Date(t); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); ab = dateKey(w.getFullYear(), w.getMonth(), w.getDate()); }
    else if (art === "monat") ab = dateKey(t.getFullYear(), t.getMonth(), 1);
    else if (art === "jahr") ab = `${t.getFullYear()}-01-01`;
    return stoerungen.filter((s) => !ab || String(s.date || "") >= ab).length;
  };
  const stoerOhneNummer = stoerungen.filter((s) => !stoerNrLang(s));
  // Doppelte Nummern. Beim Speichern wird der übliche Fall abgefangen: Wer als
  // Zweiter schreibt, sieht den Ersten beim Zusammenführen und rückt weiter.
  // Gemessen ist aber auch der Fall, in dem beide gleichzeitig lesen und der
  // Zweite den Ersten deshalb NOCH NICHT sieht - dann steht die Nummer zweimal
  // da, und niemand merkt es. Deshalb wird sie hier gesucht und gemeldet.
  // Bereinigt wird auf Klick, nicht im Hintergrund: In die gemeinsame Datei
  // schreibt diese App nur, wenn jemand es ausgelöst hat.
  const stoerDoppelteNummern = (() => {
    const proNummer = new Map();
    stoerungen.forEach((s) => {
      const n = stoerNrLang(s);
      if (!n) return;
      if (!proNummer.has(n)) proNummer.set(n, []);
      proNummer.get(n).push(s);
    });
    const aus = [];
    proNummer.forEach((liste) => {
      if (liste.length < 2) return;
      // Der älteste Bericht behält die Nummer - die Reihenfolge ist auf jedem
      // Gerät dieselbe, also kommt überall dasselbe Ergebnis heraus.
      const sortiert = liste.slice().sort((a, b) =>
        String(a.gemeldetAt || a.date || "").localeCompare(String(b.gemeldetAt || b.date || "")) ||
        String(a.id).localeCompare(String(b.id)));
      aus.push(...sortiert.slice(1));
    });
    return aus;
  })();

  // ---- Schichtbuch-Gruppierung: nach Datum, darin nach Schicht (Früh/Spät/Nacht) ----
  const stoerSichtbar = stoerungenSortiert
    .filter((s) => s.offen || stoerErledigteZeigen)
    .filter(imZeitraum)
    .filter(passtSchnell);
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
  /* ---- Die übrigen Ansichten der Leiste ----
     Eine Ebene statt zwei: Datum und Schicht sind die einzige Gliederung, die
     zwei Stufen braucht. Bei Anlage, Status oder Gewerk wäre eine zweite Stufe
     nur ein zusätzlicher Klick zwischen dir und dem Bericht. */
  const stoerEinfachGruppen = (() => {
    if (stoerAnsicht === "datum") return null;
    if (stoerAnsicht === "nummer") {
      const liste = [...stoerSichtbar].sort((a, b) => stoerNrLang(b).localeCompare(stoerNrLang(a)) || String(b.gemeldetAt || "").localeCompare(String(a.gemeldetAt || "")));
      return [{ schluessel: "alle", titel: "Alle Berichte, neueste Nummer zuerst", liste, ausfall: summeAusfall(liste), offen: liste.filter((s) => s.offen).length }];
    }
    const schluesselVon = (s) => {
      if (stoerAnsicht === "anlage") return s.anlage || "ohne Anlage";
      if (stoerAnsicht === "status") return s.offen ? "offen" : "behoben";
      if (stoerAnsicht === "gewerk") return (STOER_GEWERK[s.gewerk] && STOER_GEWERK[s.gewerk].label) || "ohne Gewerk";
      return "—";
    };
    const proGruppe = new Map();
    stoerSichtbar.forEach((s) => {
      const k = schluesselVon(s);
      if (!proGruppe.has(k)) proGruppe.set(k, []);
      proGruppe.get(k).push(s);
    });
    return Array.from(proGruppe.keys())
      // Offene zuerst, sonst alphabetisch - die Anlage mit Störung soll oben stehen.
      .sort((a, b) => {
        if (stoerAnsicht === "status") return a === "offen" ? -1 : b === "offen" ? 1 : 0;
        const oa = proGruppe.get(a).filter((s) => s.offen).length;
        const ob = proGruppe.get(b).filter((s) => s.offen).length;
        if (oa !== ob) return ob - oa;
        return a.localeCompare(b, "de");
      })
      .map((k) => {
        const liste = proGruppe.get(k);
        return { schluessel: k, titel: k, liste, ausfall: summeAusfall(liste), offen: liste.filter((s) => s.offen).length };
      });
  })();

  // Berichte aus der Zeit vor den Nummern nachtragen. Ausdrücklich auf Knopf-
  // druck und nicht beim Laden: Ein Schreibvorgang in die gemeinsame Datei,
  // den niemand ausgelöst hat, ist genau die Art Überraschung, die hier nicht
  // passieren darf.
  const nummernNachtragen = async () => {
    const ohne = stoerungen.filter((s) => !stoerNrLang(s));
    if (!ohne.length) return;
    if (!window.confirm(`${ohne.length} Störbericht(e) ohne Nummer bekommen jetzt eine – nach Datum geordnet. Fortfahren?`)) return;
    const geordnet = [...ohne].sort((a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.gemeldetAt || "").localeCompare(String(b.gemeldetAt || "")));
    const neue = new Map();
    const zaehler = new Map(); // Jahr -> zuletzt vergebene Nummer
    for (const s of geordnet) {
      const jahr = String(s.date || s.gemeldetAt || "").slice(0, 4) || String(today.getFullYear());
      if (!zaehler.has(jahr)) zaehler.set(jahr, Number(naechsteStoerNr(stoerungen, jahr).split("-")[1]) - 1);
      const n = zaehler.get(jahr) + 1;
      zaehler.set(jahr, n);
      neue.set(s.id, `${jahr}-${String(n).padStart(4, "0")}`);
    }
    await persistStoer(stoerungen.map((s) => (neue.has(s.id) ? { ...s, nr: neue.get(s.id) } : s)));
  };

  // Doppelte Nummern auflösen: Der älteste Bericht behält seine, die anderen
  // rücken hinten an. Ein Bericht, den jemand schon in der Hand hat, ändert
  // dabei seine Nummer - deshalb steht es ausdrücklich in der Rückfrage.
  const nummernBereinigen = async () => {
    if (!stoerDoppelteNummern.length) return;
    if (!window.confirm(
      `${stoerDoppelteNummern.length} Bericht(e) tragen eine Nummer, die es schon gibt.\n\n` +
      `Sie bekommen die nächsten freien Nummern. Der jeweils ältere Bericht behält seine.\n\n` +
      `Fortfahren?`)) return;
    let liste = stoerungen;
    for (const s of stoerDoppelteNummern) {
      const jahr = String(s.date || s.gemeldetAt || "").slice(0, 4) || String(today.getFullYear());
      const frei = naechsteStoerNr(liste, jahr);
      liste = liste.map((x) => (x.id === s.id ? { ...x, nr: frei } : x));
    }
    await persistStoer(liste);
  };


  // Robertos Ansage vom 13.08.: Die Tages-Gruppen sind beim Öffnen IMMER zu -
  // man sieht erst nur die Tage untereinander (neuester oben) und klappt
  // gezielt auf. Vorher stand der neueste Tag offen.
  const istTagOffen = (d, idx) => stoerOffeneTage !== null && stoerOffeneTage.has(d);
  const toggleStoerTag = (d) => setStoerOffeneTage((prev) => {
    const basis = prev === null ? new Set() : new Set(prev);
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
        {/* Die Nummer steht ganz links - dieselbe Stelle wie die Spalte "Code"
            im alten Schichtbuch. Sie ist schmal genug, dass die Spalten
            dahinter unverändert bleiben. */}
        <th style={{ ...th, width: "72px" }}>Nummer</th>
        <th style={{ ...th, width: "104px" }}>{ersteSpalte}</th>
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
        {/* Offene Berichte tragen eine rote Kante. Bisher verriet nur die
            kleine Pille ganz rechts den Status - also am anderen Ende der
            Zeile, und beim Überfliegen einer langen Liste zu leicht zu
            übersehen. */}
        <td style={{ ...stoerTdBasis, paddingLeft: mitDatum ? "10px" : "38px", boxShadow: s.offen ? "inset 3px 0 0 #C0392B" : "none" }}>
          <span className="font-mono" style={{ fontSize: "0.7rem", fontWeight: 700, color: stoerNrLang(s) ? "#2F6690" : "#C4CBD2" }}>
            {stoerNrLang(s) ? stoerNrKurz(s) : "–"}
          </span>
        </td>
        <td style={stoerTdBasis}>
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

  // Sicherheits-Klammer: solange (noch) Nur-Leser, sind ausschließlich Übersicht,
  // Schichtplan, Planung, TPM-Übersicht und die Auswertung erlaubt (der frühere
  // Plan-Reiter lebt seit dem 18.08. in der Monats-Auswertung - Leser behalten
  // damit ihren Blick auf den Wartungsplan). Jede andere Ansicht wird sofort
  // auf Übersicht zurückgesetzt (z. B. falls Schreibrechte während der Sitzung
  // wegfallen, oder direkt beim allerersten Laden, bevor überhaupt geprüft ist).
  useEffect(() => {
    if (!readerMode) return;
    if (view !== "COCKPIT" && view !== "TPMINFO" && view !== "MONAT" && view !== "JAHR") { setView("COCKPIT"); setCockpitTab("UEBERSICHT"); return; }
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
  // In der PROGRAMM-Fassung gibt es keine Adresszeile - ?verwalten=1 ist dort
  // unerreichbar (Robertos Laufwerks-Probe am 10.08.: Schreibschutz, aber kein
  // Weg zum technischen Grund). Deshalb zeigt das Programm den Grund und den
  // Erneut-versuchen-Knopf immer; die verlockenden Datei-Wechsel-Knöpfe
  // bleiben weiterhin versteckt.
  const istProgramm = typeof window !== "undefined" && !!window.__werkstattDesktop;

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
          if (parsed.links) {
            setLinks(normalisiereLinks(parsed.links));
          }
          if (parsed.oee) {
            setOeeQuelle(normalisiereOee(parsed.oee));
          }
          if (Array.isArray(parsed.benutzer)) {
            setBenutzerListe(normalisiereBenutzer(parsed.benutzer));
          }
          if (typeof parsed.werkstattName === "string") {
            setWerkstattName(parsed.werkstattName);
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

  // WÄCHTER Benutzerliste: nextBenutzer bleibt standardmäßig null = "nicht
  // anfassen". Nur die Benutzer-Maske im ⚙ (Verwalter) übergibt eine Liste.
  // Gemessen (harte-42, Fall 10): Die Vorher/Nachher-Mechanik von saveConfig
  // fing den Überschreib-Fall auch OHNE diesen Wächter ab - er macht das
  // Überleben fremder Rechteänderungen aber strukturell sicher (das Feld wird
  // von Links-/OEE-/Einstellungs-Speichern gar nicht mehr berührt), statt es
  // der Zusammenführung zu überlassen.
  const persistConfig = async (nextTpm, nextRi, nextTeam = team, nextExtraSchichten = extraSchichten, nextAnlagenteile = anlagenteile, nextLinks = links, nextOee = oeeQuelle, nextBenutzer = null, nextWerkstattName = werkstattName) => {
    if (readerMode) return; // letzte Sicherheitsebene - Nur-Leser dürfen nie irgendetwas schreiben
    setTpmAnlagen(nextTpm);
    setRiItems(nextRi);
    setTeam(nextTeam);
    setExtraSchichten(nextExtraSchichten);
    setAnlagenteile(nextAnlagenteile);
    setLinks(nextLinks);
    setOeeQuelle(nextOee);
    if (nextBenutzer) setBenutzerListe(nextBenutzer);
    setWerkstattName(nextWerkstattName);
    const attempt = async (retriesLeft) => {
      try {
        const result = await window.storage.set(
          CONFIG_STORAGE_KEY,
          JSON.stringify({ tpmAnlagen: nextTpm, riItems: nextRi, team: nextTeam, extraSchichten: nextExtraSchichten, anlagenteile: nextAnlagenteile, links: nextLinks, oee: nextOee, werkstattName: nextWerkstattName, ...(nextBenutzer ? { benutzer: nextBenutzer } : {}) }),
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

  /* ---------- OEE aus der Excel-Tabelle ----------------------------------
     "Live" heißt hier: Die Tabelle wird regelmäßig neu gelesen. Gelesen wird
     nur, wenn Excel sie wirklich angefasst hat (Änderungszeit + Größe) -
     eine Mappe mit ein paar tausend Zeilen jede Minute komplett auszupacken
     wäre Arbeit ohne Ergebnis und würde die Übersicht ruckeln lassen.
     Geschrieben wird nie: Die Tabelle gehört jemand anderem. */
  const oeeMerker = useRef({ stempel: "", laeuft: false });
  const OEE_TAKT_MS = 60000;

  // Der OEE-Takt läuft jede Minute - ein UNVERÄNDERTER Stand ("aus", derselbe
  // Fehler) darf dabei keine neue Objekt-Referenz bekommen, sonst zeichnet
  // React die ganze Übersicht im Minutentakt neu (Teil von Robertos
  // "hängt nach" am 10.08.).
  const setOeeStandStabil = (neu) => setOeeStand((alt) => (JSON.stringify(alt) === JSON.stringify(neu) ? alt : neu));
  const leseOee = React.useCallback(async (erzwingen) => {
    const q = oeeQuelle;
    if (!oeeEingerichtet(q)) { setOeeStandStabil({ lage: "aus" }); return; }
    if (oeeMerker.current.laeuft) return;
    oeeMerker.current.laeuft = true;
    try {
      let datei = null;
      try {
        datei = await sharedFile.leseAusOrdner(q.datei);
      } catch (e) {
        // getFileHandle wirft, wenn die Datei nicht (mehr) da ist
        setOeeStandStabil({ lage: "fehler", text: `„${q.datei}" liegt nicht im gewählten Ordner (${sharedFile.quellOrdnerName() || "kein Ordner"}).`, datei: q.datei });
        return;
      }
      if (!datei) {
        setOeeStandStabil({
          lage: "fehler",
          text: "Kein Ordner mit der Tabelle verbunden – nach einem Neustart einmal in ⚙ → OEE freigeben.",
          ordnerFehlt: true, datei: q.datei,
        });
        return;
      }
      const stempel = `${datei.lastModified}-${datei.size}`;
      if (!erzwingen && stempel === oeeMerker.current.stempel) return; // unverändert
      setOeeStand((v) => (v.lage === "ok" ? v : { lage: "laedt" }));
      const mappe = await leseArbeitsmappe(datei);
      const blatt = (q.blatt && mappe.blaetter.find((b) => b.name === q.blatt))
        || mappe.blaetter.find((b) => !b.versteckt)
        || mappe.blaetter[0];
      if (!blatt) throw new Error("Kein Tabellenblatt gefunden");
      const bereich = findeKopfbereich(blatt.zeilen);
      const kopfzeile = q.kopfzeile != null ? q.kopfzeile : bereich.kopfzeile;
      const spalten = Object.keys(q.spalten || {}).length
        ? q.spalten
        : erkenneSpalten(bereich.kopf);
      const zeilen = leseOeeZeilen(blatt.zeilen, spalten, kopfzeile);
      const aus = werteOeeAus(zeilen, Date.now());
      oeeMerker.current.stempel = stempel;
      if (!aus) {
        setOeeStand({
          lage: "fehler", datei: q.datei,
          text: `In „${blatt.name}" wurde keine OEE-Spalte gefunden. Zuordnung in ⚙ → OEE prüfen.`,
        });
        return;
      }
      setOeeStand({
        lage: "ok", ...aus, datei: q.datei, blatt: blatt.name,
        gelesenAm: new Date().toISOString(),
        dateiStand: datei.lastModified,
      });
    } catch (e) {
      setOeeStand({ lage: "fehler", datei: q.datei, text: String((e && e.message) || e) });
    } finally {
      oeeMerker.current.laeuft = false;
    }
  }, [oeeQuelle]);

  useEffect(() => {
    if (!oeeEingerichtet(oeeQuelle)) { setOeeStand({ lage: "aus" }); return; }
    oeeMerker.current.stempel = ""; // Einrichtung geändert -> auf jeden Fall neu lesen
    let lebt = true;
    const tick = () => { if (lebt) leseOee(false); };
    tick();
    const timer = setInterval(tick, OEE_TAKT_MS);
    // Wer aus Excel zurück in die App klickt, will die neue Zahl sofort sehen
    // und nicht bis zu einer Minute warten.
    const beiFokus = () => { if (document.visibilityState === "visible") tick(); };
    window.addEventListener("focus", beiFokus);
    document.addEventListener("visibilitychange", beiFokus);
    return () => {
      lebt = false;
      clearInterval(timer);
      window.removeEventListener("focus", beiFokus);
      document.removeEventListener("visibilitychange", beiFokus);
    };
  }, [oeeQuelle, leseOee]);

  /* ---------- Linkbereich: Anzeigen, Anlegen, Ändern, Sortieren ---------- */
  // Welches Kürzel gerade angezeigt wird. Steht das gemerkte Kürzel nicht mehr
  // in der Liste (umbenannt, entfernt), wird still das erste genommen, statt
  // eine leere Liste zu zeigen.
  const linkInhaberAktiv = links.inhaber.includes(linkInhaber) ? linkInhaber : (links.inhaber[0] || LINK_INHABER_VORGABE[0]);
  const linkListe = links.eintraege.filter((l) => l.inhaber === linkInhaberAktiv);
  const waehleLinkInhaber = (k) => {
    setLinkInhaber(k);
    setLinkEntwurf(null);
    try { localStorage.setItem("werkstatt-links-inhaber", k); } catch (e) { /* Speicher voll o.ä. */ }
  };
  const schalteLinks = () => {
    const next = !linksOffen;
    setLinksOffen(next);
    if (!next) setLinkEntwurf(null);
  };
  const persistLinks = async (nextEintraege, nextInhaber = links.inhaber) => {
    const next = normalisiereLinks({ inhaber: nextInhaber, eintraege: nextEintraege });
    await persistConfig(tpmAnlagen, riItems, team, extraSchichten, anlagenteile, next);
  };
  const speichereLinkEntwurf = async () => {
    const e = linkEntwurf;
    if (!e || !e.name.trim() || !e.ziel.trim()) return;
    // Das Symbol wird schon beim Speichern vereinheitlicht, nicht erst beim
    // Anzeigen: Dann steht in der gemeinsamen Datei für alle dasselbe Zeichen.
    const sauber = { name: e.name.trim(), ziel: e.ziel.trim(), symbol: alsSymbol((e.symbol || "🔗").trim()) || "🔗" };
    const next = e.id
      ? links.eintraege.map((l) => (l.id === e.id ? { ...l, ...sauber } : l))
      : [...links.eintraege, { ...sauber, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, inhaber: linkInhaberAktiv }];
    setLinkEntwurf(null);
    await persistLinks(next);
  };
  const loescheLink = async (id) => {
    const l = links.eintraege.find((x) => x.id === id);
    if (!l || !window.confirm(`„${l.name}" aus der Linkliste entfernen?`)) return;
    setLinkEntwurf(null);
    await persistLinks(links.eintraege.filter((x) => x.id !== id));
  };
  // Verschieben innerhalb des angezeigten Kürzels. Die Gesamtliste enthält auch
  // die Links des anderen Kürzels - getauscht werden deshalb die Plätze in der
  // Gesamtliste, die zu den beiden Nachbarn der gefilterten Liste gehören.
  const verschiebeLink = async (id, richtung) => {
    const sichtbar = linkListe.map((l) => l.id);
    const i = sichtbar.indexOf(id);
    const j = i + richtung;
    if (i < 0 || j < 0 || j >= sichtbar.length) return;
    const a = links.eintraege.findIndex((l) => l.id === sichtbar[i]);
    const b = links.eintraege.findIndex((l) => l.id === sichtbar[j]);
    const next = links.eintraege.slice();
    [next[a], next[b]] = [next[b], next[a]];
    await persistLinks(next);
  };
  // Rückmeldung am Link: was beim letzten Klick passiert ist. Ohne sie klickt
  // man ins Leere - die Datei öffnet sich in einem anderen Fenster, und im
  // Cockpit sieht es aus, als sei nichts geschehen.
  const meldeAmLink = (id, text) => {
    setLinkKopiert({ id, text });
    setTimeout(() => setLinkKopiert((v) => (v && v.id === id ? "" : v)), 3500);
  };
  const oeffneLink = async (l) => {
    if (linkArt(l.ziel) === "oeffnen") {
      window.open(linkAdresse(l.ziel), "_blank", "noopener,noreferrer");
      return;
    }
    // Im Programm: Laufwerks- und Netzwerkpfade direkt öffnen - das kann der
    // Rahmen selbst (shell.openPath), ganz ohne Ausliefer-Dienst. Genau der
    // Fall, in dem bisher nur der Pfad kopiert wurde.
    if (window.__werkstattDesktop && window.__werkstattDesktop.oeffnePfad) {
      meldeAmLink(l.id, "wird geöffnet …");
      try {
        const ergebnis = await window.__werkstattDesktop.oeffnePfad(l.ziel);
        if (ergebnis === true) { meldeAmLink(l.id, "✓ geöffnet"); return; }
        meldeAmLink(l.id, "✗ " + String(ergebnis || "nicht gefunden – liegt die Datei noch dort?"));
        return;
      } catch (e) { /* unten weiter zur Zwischenablage */ }
    }
    // Laufwerks- und Netzwerkpfade: den Dienst bitten. Mit Frist - antwortet er
    // nicht, hängt der Klick nicht, sondern fällt auf die Zwischenablage zurück.
    if (ueberDienst()) {
      meldeAmLink(l.id, "wird geöffnet …");
      try {
        const abbruch = new AbortController();
        const uhr = setTimeout(() => abbruch.abort(), 8000);
        const antwort = await fetch("/__oeffne?pfad=" + encodeURIComponent(l.ziel), { cache: "no-store", signal: abbruch.signal });
        clearTimeout(uhr);
        if (antwort.ok) { meldeAmLink(l.id, "✓ geöffnet"); return; }
        if (antwort.status === 404) { meldeAmLink(l.id, "✗ nicht gefunden – liegt die Datei noch dort?"); return; }
        // 400/403/500: der Dienst hat geantwortet, aber abgelehnt. Der Pfad
        // wird trotzdem kopiert, damit der Weg über den Explorer offen bleibt.
      } catch (e) { /* Dienst antwortet nicht - unten weiter */ }
    }
    try {
      await navigator.clipboard.writeText(l.ziel);
      meldeAmLink(l.id, "✓ Pfad kopiert – im Explorer einfügen (Strg+V)");
    } catch (e) {
      window.prompt("Pfad kopieren (Strg+C, dann im Explorer einfügen):", l.ziel);
    }
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
    // kennwortNeu: Klartext-Entwurf NUR im Dialog; beim Speichern wird gehasht
    setSettingsBenutzer(benutzerListe.map((b) => ({ ...b, kennwortNeu: "" })));
    setSettingsSchichten(extraSchichten.map((s) => ({ ...s })));
    setSettingsAnlagenteile(anlagenteile.map((t) => ({ ...t })));
    setNeueSchichtName("");
    setNeuesTeilAnlage("");
    setNeuesTeilName("");
    setSettingsTab("anlagen");
    setSettingsOpen(true);
    // OEE-Einrichtung als Entwurf: erst beim Übernehmen wandert sie in die
    // gemeinsame Datei - sonst würde jedes Herumprobieren sofort bei allen
    // Kollegen landen.
    setSettingsOee({ ...normalisiereOee(oeeQuelle), lage: "", text: "", dateien: null, blaetter: null });
    sharedFile.listBackups().then(setBackups).catch(() => setBackups([]));
    sharedFile.readLog().then(setVerlauf).catch(() => setVerlauf([]));
    if (window.__werkstattDesktop && window.__werkstattDesktop.updateStatus) {
      window.__werkstattDesktop.updateStatus()
        .then((st) => setProgrammUpdateStatus({ ...st, eingabe: st.ordner || "" }))
        .catch(() => setProgrammUpdateStatus(null));
    }
  };

  /* ---------- OEE einrichten (im ⚙-Dialog) ---------- */
  // Welche Excel-Tabellen liegen im Datenordner? Nur lesen, nichts anfassen.
  const oeeDateienSuchen = async () => {
    setSettingsOee((v) => ({ ...v, lage: "laedt", text: "" }));
    try {
      const liste = await sharedFile.listeOrdnerDateien(".xlsx");
      setSettingsOee((v) => ({
        ...v, lage: liste.length ? "" : "leer", dateien: liste,
        text: liste.length ? "" : "Im Datenordner liegt keine .xlsx-Datei.",
      }));
    } catch (e) {
      setSettingsOee((v) => ({ ...v, lage: "fehler", text: String((e && e.message) || e) }));
    }
  };

  // Tabelle probeweise lesen: Blätter, Kopfzeile und erkannte Spalten zeigen,
  // BEVOR irgendetwas gespeichert wird.
  const oeeTabellePruefen = async (dateiName, blattName) => {
    setSettingsOee((v) => ({ ...v, lage: "laedt", text: "", datei: dateiName }));
    try {
      const datei = await sharedFile.leseAusOrdner(dateiName);
      if (!datei) throw new Error("Der Datenordner ist nicht verbunden.");
      const mappe = await leseArbeitsmappe(datei);
      const blaetter = mappe.blaetter.map((b) => {
        // Kopf als BEREICH: Pivot-Tabellen verteilen ihre Beschriftungen
        // über mehrere Zeilen ("Gesamt:" oben, "OEE%n" darunter).
        const bereich = findeKopfbereich(b.zeilen);
        return { name: b.name, kopfzeile: bereich.kopfzeile, kopf: bereich.kopf, zeilen: b.zeilen.length };
      });
      const gewaehlt = blaetter.find((b) => b.name === blattName) || blaetter.find((b) => Object.keys(erkenneSpalten(b.kopf)).length > 0) || blaetter[0];
      const erkannt = erkenneSpalten(gewaehlt.kopf);
      setSettingsOee((v) => ({
        ...v, lage: "", text: "", datei: dateiName, blaetter,
        blatt: gewaehlt.name, kopfzeile: gewaehlt.kopfzeile,
        // Eine bestehende Zuordnung nicht wegwerfen, nur weil neu gelesen wurde
        spalten: (v.blatt === gewaehlt.name && Object.keys(v.spalten || {}).length) ? v.spalten : erkannt,
      }));
    } catch (e) {
      setSettingsOee((v) => ({ ...v, lage: "fehler", text: String((e && e.message) || e), blaetter: null }));
    }
  };

  const oeeUebernehmen = async () => {
    const q = normalisiereOee(settingsOee);
    await persistConfig(tpmAnlagen, riItems, team, extraSchichten, anlagenteile, links, q);
    // Kein eigener Leseaufruf hier: Der Effekt an oeeQuelle liest ohnehin neu,
    // sobald die Einrichtung steht. Ein zusaetzlicher Aufruf an dieser Stelle
    // haette noch die ALTE Einrichtung vor sich (der Zustand ist im selben
    // Durchlauf noch nicht umgesetzt) und wuerde das frische Ergebnis mit
    // einem "nicht eingerichtet" ueberschreiben - gemessen an harte-40.
    oeeMerker.current.stempel = "";
  };

  const oeeEntfernen = async () => {
    await persistConfig(tpmAnlagen, riItems, team, extraSchichten, anlagenteile, links, normalisiereOee(null));
    setSettingsOee({ ...normalisiereOee(null), lage: "", text: "", dateien: null, blaetter: null });
    setOeeStand({ lage: "aus" });
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
      .map((t) => ({ name: t.name.trim(), rolle: t.rolle || "", geburtstag: (t.geburtstag || "").trim() }))
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

    // Benutzer & Rechte: nur Verwalter dürfen die Liste ändern. Neue Kennwörter
    // werden hier gehasht - in die Datei wandert nie Klartext. null heißt:
    // das Feld in der Datei gar nicht anfassen (Wächter, siehe persistConfig).
    let nextBenutzer = null;
    if (istVerwalter) {
      const entwurf = settingsBenutzer
        .map((b) => ({ ...b, name: b.name.trim() }))
        .filter((b) => b.name);
      // Wächter gegen das Selbst-Aussperren: Eine nicht-leere Liste ohne
      // einen einzigen Verwalter könnte danach niemand mehr bearbeiten.
      if (entwurf.length > 0 && !entwurf.some((b) => b.rolle === "verwalter")) {
        setErr("Benutzerliste nicht gespeichert: Mindestens ein Benutzer muss Verwalter sein - sonst könnte danach niemand mehr Benutzer pflegen.");
        return;
      }
      nextBenutzer = [];
      for (const b of entwurf) {
        nextBenutzer.push({
          name: b.name,
          rolle: BENUTZER_ROLLEN[b.rolle] ? b.rolle : "bearbeiter",
          kennwortHash: b.kennwortNeu ? await kennwortHashen(b.kennwortNeu) : (b.kennwortHash || ""),
        });
      }
    }

    await persistConfig(cleanTpm, cleanRi, cleanTeam, normalisiereExtraSchichten(settingsSchichten), normalisiereAnlagenteile(teileMitRename), links, oeeQuelle, nextBenutzer);
    if (nextEntries !== entries) await persist(nextEntries);
    setSettingsOpen(false);
  };

  /* ---------- Benutzergruppen: An- und Abmelden ---------- */
  const anmelden = async () => {
    // Getippt statt gewählt (Robertos Ansage vom 10.08.): Groß/Klein wird
    // verziehen, Tippfehler nicht. Die Fehlermeldung verrät bewusst NICHT,
    // ob es den Namen gibt - sonst ließen sich Benutzernamen durchprobieren.
    const getippt = anmeldung.name.trim().toLowerCase();
    const b = getippt ? benutzerListe.find((x) => x.name.toLowerCase() === getippt) : null;
    const abweisen = () => setAnmeldung((v) => ({ ...v, fehler: "Benutzername oder Kennwort stimmt nicht." }));
    if (!b) { abweisen(); return; }
    if (b.kennwortHash) {
      const h = await kennwortHashen(anmeldung.kennwort || "");
      if (h !== b.kennwortHash) { abweisen(); return; }
    }
    setAngemeldet(b.name);
    // Der Benutzername ist ab jetzt auch der Urheber im Verlauf und der
    // Melder-Vorschlag bei Störungen - ein Name, eine Wahrheit.
    setZettelName(b.name);
    try {
      localStorage.setItem("werkstatt-kalender-benutzer", b.name);
      localStorage.setItem("werkstatt-kalender-name", b.name);
    } catch (e) { /* Speicher voll o. ä. - dann fragt das Gerät beim nächsten Start erneut */ }
    setAnmeldung({ name: "", kennwort: "", fehler: "" });
  };
  const abmelden = () => {
    setAngemeldet("");
    setAnmeldung({ name: "", kennwort: "", fehler: "" });
    setAnmeldungZu(false); // nach dem Abmelden fragt der Dialog wieder
    try { localStorage.removeItem("werkstatt-kalender-benutzer"); } catch (e) { /* egal */ }
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

  const ladeHerunter = (inhalt, dateiname, typ) => {
    try {
      const blob = new Blob([inhalt], { type: typ });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dateiname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErr("Export ist fehlgeschlagen.");
    }
  };
  const exportData = () => {
    ladeHerunter(JSON.stringify(entries, null, 2),
      `werkstatt-kalender-export-${dateKey(today.getFullYear(), today.getMonth(), today.getDate())}.json`,
      "application/json");
  };
  /* CSV-Herausgabe für Excel (QoL 19.08., Runde 3) - der Rollout-Test mahnte
     seit jeher an, dass es die Daten nur als JSON gibt. Semikolon als Trenner
     und die BOM vorneweg, damit DEUTSCHES Excel die Datei per Doppelklick
     richtig öffnet (Komma wäre dort der Dezimaltrenner, ohne BOM zerfallen
     die Umlaute). */
  const csvZelle = (v) => {
    const s = String(v ?? "").replace(/\r?\n/g, " ");
    return /[;"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const exportTermineCsv = () => {
    const zeilen = entries
      .filter((e) => e.category === "TPM" || e.category === "RI")
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((e) => [formatDateDE(e.date), e.category === "TPM" ? "TPM" : "R+I", e.name,
                   e.status === "done" ? "erledigt" : "offen", e.note || ""].map(csvZelle).join(";"));
    ladeHerunter("\uFEFF" + ["Datum;Art;Anlage / Punkt;Status;Notiz", ...zeilen].join("\r\n"),
      `werkstatt-termine-${todayKey}.csv`, "text/csv;charset=utf-8");
  };
  const exportStoerungenCsv = () => {
    const zeilen = [...stoerungen]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((s) => [stoerNrLang(s) || "", formatDateDE(s.date), s.schicht || "", s.anlage || "",
                   s.anlagenteil || "", STOER_GEWERK[s.gewerk]?.label || "", s.stoerung || "", s.ursache || "",
                   s.getan || "", s.offen ? (s.nochZuTun || "") : "", s.ersatzteile || "",
                   s.nachbestellt ? "ja" : "", Math.round(Number(s.ausfallzeit) || 0) || "",
                   s.offen ? "offen" : "behoben", s.melder || ""].map(csvZelle).join(";"));
    ladeHerunter("\uFEFF" + ["Nr;Datum;Schicht;Anlage;Anlagenteil;Gewerk;Störung;Ursache;Was wurde unternommen;Nächste Schicht;Ersatzteile;Nachbestellt;Ausfall (min);Status;Melder", ...zeilen].join("\r\n"),
      `werkstatt-stoerungen-${todayKey}.csv`, "text/csv;charset=utf-8");
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
      /* Ein Eintrag ohne Kennung („id") verschwindet beim Zusammenführen
         stillschweigend - dort wird nach Kennung zusammengeführt, und was
         keine hat, fällt heraus. Gemeldet würde trotzdem „X Einträge
         importiert". Deshalb bekommt jeder Eintrag ohne Kennung hier eine,
         statt später spurlos zu fehlen. */
      const valid = parsed
        .filter((en) => en && typeof en.date === "string" && typeof en.category === "string" && typeof en.name === "string")
        .map((en) => (en.id === undefined || en.id === null || en.id === ""
          ? { ...en, id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
          : en));
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
          /* Ersetzen heißt: Für die bisherigen Einträge entstehen Löschmarken,
             und die wirken über die gemeinsame Datei auf JEDEM Gerät. Das muss
             in der Frage stehen - sonst denkt man, es beträfe nur einen selbst. */
          const ersetzen = window.confirm(
            `Wirklich ALLE bestehenden ${entries.length} Einträge löschen und durch die ${valid.length} importierten ersetzen?`
            + `\n\nACHTUNG: Das wirkt über die gemeinsame Datei auch bei allen Kollegen – nicht nur auf diesem Rechner.`);
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
    setVerschiebeDatum(entry.date || "");
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
    // Rückfrage wie bei Störungen (Robertos QoL-Auswahl vom 19.08.):
    // vorher löschte ein Fehlklick den Termin sofort und ohne Warnung.
    const eintrag = entries.find((e) => e.id === id);
    const was = eintrag ? `${eintrag.name} am ${formatDateDE(eintrag.date)}` : "diesen Eintrag";
    if (!window.confirm(`„${was}" wirklich löschen?`)) return;
    if (modal && modal.mode === "edit" && modal.id === id) closeModal();
    await persist(entries.filter((e) => e.id !== id));
    if (eintrag) {
      // Rückholen legt den Termin unter NEUER Kennung wieder an - die alte
      // trägt bereits eine Löschmarke, unter ihr käme er nicht zurück.
      const { id: alteId, ...inhalt } = eintrag;
      zeigeRueckgaengig(`„${was}" gelöscht`, async () => {
        await persist([...entriesRef.current, { ...inhalt, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]);
      });
    }
  };

  // Termin verschieben (QoL 19.08.): mitsamt Notiz auf den neuen Tag -
  // vorher ging das nur über Löschen und neu anlegen, obwohl der
  // Archiv-Hinweis das Verschieben längst versprach.
  const verschiebeTermin = async (id) => {
    const ziel = String(verschiebeDatum || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ziel)) return;
    const eintrag = entries.find((e) => e.id === id);
    if (!eintrag || eintrag.date === ziel) return;
    const vorher = eintrag.date;
    await persist(entries.map((e) => (e.id === id ? { ...e, date: ziel } : e)));
    closeModal();
    zeigeRueckgaengig(`${eintrag.name} auf ${formatDateDE(ziel)} verschoben`, async () => {
      await persist(entriesRef.current.map((e) => (e.id === id ? { ...e, date: vorher } : e)));
    });
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

  // Notiz-Zeichen auf der Plan-Kachel (QoL 19.08.): welche Termine tragen
  // eine Notiz? Einmal je Render als Karte, statt je Kachel zu suchen.
  const notizJeTag = useMemo(() => {
    const m = new Map();
    entries.forEach((e) => {
      if ((e.category === "TPM" || e.category === "RI") && e.note && e.note.trim()) m.set(e.date + "|" + e.name, e.note.trim());
    });
    return m;
  }, [entries]);

  // Register-Suche (QoL 19.08.)
  const registerSuchwort = registerSuche.trim().toLowerCase();
  const registerTpm = registerSuchwort ? tpmAnlagen.filter((a) => a.name.toLowerCase().includes(registerSuchwort)) : tpmAnlagen;
  const registerRi = registerSuchwort ? riItems.filter((r) => r.name.toLowerCase().includes(registerSuchwort)) : riItems;

  /* ---- QoL-Runde 3: Helfer ---- */
  // Steckbrief/Checkliste liegen am Anlagen- bzw. R+I-Eintrag der Verwaltung.
  const registerEintragVon = (category, name) =>
    (category === "TPM" ? tpmAnlagen : riItems).find((x) => x.name === name) || null;
  // Außer Betrieb: gilt die Pause einer Anlage an diesem Tag?
  const istPausiert = (a, dateStr) =>
    !!(a && a.pause && a.pause.von && a.pause.von <= dateStr && (!a.pause.bis || dateStr <= a.pause.bis));
  // Offene Nachbestellungen aus den Störungen (Felder gibt es längst -
  // hier nur die Sammel-Sicht, älteste zuerst, denn die warten am längsten).
  const offeneNachbestellungen = useMemo(
    () => stoerungen
      .filter((s) => String(s.ersatzteile || "").trim() && s.nachbestellt && !s.eingetroffenAt)
      .sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [stoerungen]
  );
  const nachbestellungEingetroffen = async (id) => {
    await persistStoer(stoerungen.map((s) => (s.id === id ? { ...s, eingetroffenAt: new Date().toISOString() } : s)));
  };
  // Register-Dialog: beim Öffnen den Bearbeitungsstand aus der Verwaltung laden.
  useEffect(() => {
    if (!registerItem) { setSteckbriefDraft(null); return; }
    const item = registerEintragVon(registerItem.category, registerItem.name);
    setRegisterTab("STECKBRIEF");
    setSteckbriefDraft({
      hersteller: item?.steckbrief?.hersteller || "",
      typ: item?.steckbrief?.typ || "",
      seriennummer: item?.steckbrief?.seriennummer || "",
      standort: item?.steckbrief?.standort || "",
      partner: item?.steckbrief?.partner || "",
      ersatzteile: item?.steckbrief?.ersatzteile || "",
      checkliste: (item?.checkliste || []).join("\n"),
      pauseVon: item?.pause?.von || "",
      pauseBis: item?.pause?.bis || "",
      pauseGrund: item?.pause?.grund || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerItem]);
  // Steckbrief, Checkliste und Außer-Betrieb-Zeitraum an den Verwaltungs-
  // Eintrag schreiben. Leere Felder werden entfernt statt als leere Hüllen
  // gespeichert - die gemeinsame Datei bleibt schlank.
  const speichereSteckbrief = async () => {
    if (!registerItem || !steckbriefDraft || readerMode) return;
    const d = steckbriefDraft;
    const steckbrief = {
      hersteller: d.hersteller.trim(), typ: d.typ.trim(), seriennummer: d.seriennummer.trim(),
      standort: d.standort.trim(), partner: d.partner.trim(), ersatzteile: d.ersatzteile.trim(),
    };
    const steckbriefLeer = Object.values(steckbrief).every((v) => !v);
    const checkliste = d.checkliste.split("\n").map((z) => z.trim()).filter(Boolean);
    const pause = /^\d{4}-\d{2}-\d{2}$/.test(d.pauseVon)
      ? { von: d.pauseVon, bis: /^\d{4}-\d{2}-\d{2}$/.test(d.pauseBis) ? d.pauseBis : "", grund: d.pauseGrund.trim() }
      : null;
    const anpassen = (x) => {
      if (x.name !== registerItem.name) return x;
      const neu = { ...x };
      if (steckbriefLeer) delete neu.steckbrief; else neu.steckbrief = steckbrief;
      if (checkliste.length) neu.checkliste = checkliste; else delete neu.checkliste;
      if (registerItem.category === "TPM") { if (pause) neu.pause = pause; else delete neu.pause; }
      return neu;
    };
    await persistConfig(
      registerItem.category === "TPM" ? tpmAnlagen.map(anpassen) : tpmAnlagen,
      registerItem.category === "RI" ? riItems.map(anpassen) : riItems
    );
    setRegisterItem(null);
  };

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

  /* ---- Kreativ-Runde G1-G8: Berechnungen ---- */
  // G1: Der Name der Werkstatt - überall dort, wo bisher "Werkstatt-Cockpit" stand.
  const appName = werkstattName.trim() || "Werkstatt-Cockpit";
  // G2: Voller Monat = kleines Fest. Feuert einmal je Monat und Gerät, wenn
  // der laufende Monat komplett erledigt ist - und verschwindet von selbst.
  useEffect(() => {
    const prefix = todayKey.slice(0, 7);
    const basis = entries.filter((e) => (e.category === "TPM" || e.category === "RI")
      && String(e.date || "").startsWith(prefix) && (e.status === "done" || e.status === "open"));
    if (basis.length === 0 || !basis.every((e) => e.status === "done")) return undefined;
    let marker = null;
    try { marker = localStorage.getItem("werkstatt-kalender-fest"); } catch (e) { /* dann eben doppelt */ }
    if (marker === prefix) return undefined;
    try { localStorage.setItem("werkstatt-kalender-fest", prefix); } catch (e) { /* Anzeige gilt trotzdem */ }
    setFestOffen({ monatName: MONTHS[Number(prefix.slice(5, 7)) - 1], anzahl: basis.length });
    const t = setTimeout(() => setFestOffen(null), 7000);
    return () => clearTimeout(t);
  }, [entries, todayKey]);
  // (Der Schicht-Fortschrittsbalken G5 lebte hier - auf Robertos Wunsch
  //  vom 20.08. wieder entfernt: zu viel Deko in der Kopfzeile.)
  // G8: Wochen-Rückblick - freitags ab 12 Uhr, je Woche einmal wegklickbar.
  const wochenRueckblick = (() => {
    const jetzt = new Date();
    if (jetzt.getDay() !== 5 || jetzt.getHours() < 12) return null;
    const wochenKennung = `${jetzt.getFullYear()}-KW${getISOWeek(jetzt)}`;
    try { if (localStorage.getItem("werkstatt-kalender-rueckblick") === wochenKennung) return null; } catch (e) { /* dann eben zeigen */ }
    if (rueckblickZu) return null;
    const montag = new Date(jetzt);
    montag.setDate(jetzt.getDate() - ((jetzt.getDay() + 6) % 7));
    const von = dateKey(montag.getFullYear(), montag.getMonth(), montag.getDate());
    const inWoche = (d) => String(d || "") >= von && String(d || "") <= todayKey;
    const termine = entries.filter((e) => (e.category === "TPM" || e.category === "RI") && inWoche(e.date));
    const erledigt = termine.filter((e) => e.status === "done");
    const offen = termine.filter((e) => e.status === "open");
    const quote = erledigt.length + offen.length > 0 ? Math.round((erledigt.length / (erledigt.length + offen.length)) * 100) : null;
    const stoerWoche = stoerungen.filter((s) => inWoche(s.date));
    const behoben = stoerWoche.filter((s) => !s.offen).length;
    const stoerOffen = stoerWoche.filter((s) => s.offen).length;
    if (termine.length === 0 && stoerWoche.length === 0) return null;
    const jeTag = new Map();
    erledigt.forEach((e) => { const w = new Date(e.date + "T00:00:00").toLocaleDateString("de-DE", { weekday: "long" }); jeTag.set(w, (jeTag.get(w) || 0) + 1); });
    const staerksterTag = [...jeTag.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    const jeAnlage = new Map();
    stoerWoche.forEach((s) => { const n = String(s.anlage || "").trim(); if (n) jeAnlage.set(n, (jeAnlage.get(n) || 0) + 1); });
    const sorgenkind = [...jeAnlage.entries()].sort((a, b) => b[1] - a[1]).find(([, z]) => z >= 2) || null;
    return { wochenKennung, kw: getISOWeek(jetzt), erledigt: erledigt.length, quote, behoben, stoerOffen, staerksterTag, sorgenkind };
  })();

  // Geburtstags-Erinnerung (Variante A, Robertos Wahl vom 20.08.): dezente
  // Karte auf der Übersicht - heute plus Vorschau der nächsten 7 Tage. Die
  // Vorschau erscheint auch ohne heutigen Geburtstag, sonst sähe man sie
  // praktisch nie und könnte nichts vorbereiten. Wegklickbar je Tag und
  // Gerät; ohne eingetragene (lesbare) Geburtstage bleibt alles stumm.
  const geburtstagsLage = (() => {
    if (geburtstagZu) return null;
    try { if (localStorage.getItem("werkstatt-kalender-geburtstag-zu") === todayKey) return null; } catch (e) { /* dann eben zeigen */ }
    const heute = [];
    const demnaechst = [];
    team.forEach((t) => {
      const g = parseGeburtstag(t.geburtstag);
      if (!g) return;
      // Nächstes Vorkommen in den kommenden 7 Tagen suchen (über den
      // Jahreswechsel hinweg, darum je Kandidaten-Tag neu gerechnet).
      for (let versatz = 0; versatz <= 7; versatz++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + versatz);
        const feier = geburtstagInJahr(g, d.getFullYear());
        if (feier.tag !== d.getDate() || feier.monat !== d.getMonth() + 1) continue;
        const alter = g.jahr ? d.getFullYear() - g.jahr : null;
        (versatz === 0 ? heute : demnaechst).push({ name: t.name, inTagen: versatz, alter, datum: d });
        break;
      }
    });
    if (heute.length === 0 && demnaechst.length === 0) return null;
    demnaechst.sort((a, b) => a.inTagen - b.inTagen || a.name.localeCompare(b.name, "de"));
    return { heute, demnaechst };
  })();

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

    /* ---- Die Wirklichkeit schlägt die Rechnung (Robertos 18.08.) ----
       Verschobene oder von Hand angelegte Termine stehen als ECHTE Einträge
       im Kalender - die Auswertung zeigt sie richtig, der Plan rechnete
       bisher stur weiter und zeigte am selben Tag teils andere Termine.
       Jetzt gilt: Ein echter TPM-/R+I-Eintrag ersetzt den errechneten Slot
       seiner Anlage (TPM: je Monat - jede Anlage hat in der Rotation genau
       einen Wartungstermin; R+I: je Woche - die laufen mehrfach im Monat).
       Errechnet wird nur, wofür kein echter Eintrag existiert. Der durch
       das Ersetzen frei werdende Tag bleibt frei - kein Nachrücken, sonst
       spränge der restliche Plan. */
    const monatPrefix = `${py}-${pad(pm + 1)}-`;
    const tpmNamen = new Set(tpmAnlagen.map((a) => a.name));
    const riNamen = new Set(riItems.map((r) => r.name));
    const echte = entries.filter((e) =>
      (e.category === "TPM" || e.category === "RI") &&
      typeof e.date === "string" && e.date.startsWith(monatPrefix) &&
      (e.category === "TPM" ? tpmNamen.has(e.name) : riNamen.has(e.name)));
    const echteTpm = new Set(echte.filter((e) => e.category === "TPM").map((e) => e.name));
    const wocheVon = (d) => {
      const dt = new Date(d + "T00:00:00");
      return `${dt.getFullYear()}|${getISOWeek(dt)}`;
    };
    const echteRiWochen = new Set(echte.filter((e) => e.category === "RI").map((e) => `${e.name}|${wocheVon(e.date)}`));
    const errechnete = [...mondayAssignments, ...weekdayAssignments, ...riAssignments].filter((a) =>
      riNamen.has(a.anlage)
        ? !echteRiWochen.has(`${a.anlage}|${wocheVon(a.date)}`)
        : !echteTpm.has(a.anlage));
    const belegt = new Set(errechnete.map((a) => `${a.date}|${a.anlage}`));
    echte.forEach((e) => {
      const k = `${e.date}|${e.name}`;
      if (belegt.has(k)) return; // denselben Termin nicht doppelt zeigen
      belegt.add(k);
      errechnete.push({ day: Number(e.date.slice(8, 10)), date: e.date, anlage: e.name, echt: true });
    });

    /* ---- Robertos Regel: NIE zwei TPM-Wartungen am selben Tag ----
       Belegt ein echter (verschobener) Eintrag den errechneten Tag einer
       anderen Anlage, weicht der ERRECHNETE Termin auf den nächsten freien
       Werktag aus (kein Feiertag, kein anderer TPM-Termin); findet sich
       keiner mehr, setzt die Anlage diesen Monat aus. Echte Einträge stehen
       fest - legt jemand von Hand zwei auf denselben Tag, zeigt der Plan
       sie, wie sie sind, statt still einen zu verstecken. */
    errechnete.sort((a, b) => a.day - b.day);
    const tpmTage = new Set(errechnete.filter((a) => a.echt && !riNamen.has(a.anlage)).map((a) => a.date));
    for (const a of errechnete) {
      if (a.echt || riNamen.has(a.anlage)) continue;
      if (!tpmTage.has(a.date)) { tpmTage.add(a.date); continue; }
      let gefunden = false;
      for (let d = a.day + 1; d <= dim; d++) {
        const dow = new Date(py, pm, d).getDay();
        if (dow === 0 || dow === 6) continue;
        const key = dateKey(py, pm, d);
        if (hol.get(key) || tpmTage.has(key)) continue;
        a.day = d;
        a.date = key;
        tpmTage.add(key);
        gefunden = true;
        break;
      }
      if (!gefunden) a.entfaellt = true;
    }
    /* ---- Außer Betrieb (QoL Runde 3) ----
       Errechnete Termine einer pausierten Anlage entfallen im Pausen-
       zeitraum - die Rotation verteilt nichts auf eine Maschine, die
       gerade umgebaut wird. ECHTE Einträge stehen, wie sie sind: Wer
       trotz Pause von Hand etwas anlegt, meint es so. */
    const pausen = new Map(tpmAnlagen.filter((a) => a.pause && a.pause.von).map((a) => [a.name, a.pause]));
    for (const a of errechnete) {
      if (a.echt) continue;
      const pz = pausen.get(a.anlage);
      if (pz && pz.von <= a.date && (!pz.bis || a.date <= pz.bis)) a.entfaellt = true;
    }
    const bereinigt = errechnete.filter((a) => !a.entfaellt);
    const entfallene = errechnete.filter((a) => a.entfaellt).map((a) => a.anlage);
    const echteSkipped = [...skipped.filter((n) => !echteTpm.has(n)), ...entfallene];

    return {
      assignments: bereinigt.sort((a, b) => a.day - b.day),
      skipped: echteSkipped,
    };
  };

  // Auch bei JAHR berechnen: Der Wartungsplan-Druck ist aus beiden
  // Auswertungs-Ansichten wählbar und braucht die Zuordnungen.
  const maintenancePlanResult = (view === "MONAT" || view === "JAHR") && heavyReady ? computeMaintenancePlan() : { assignments: [], skipped: [] };
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
  /* Robertos Ansage vom 13.08.: Versäumte Termine bleiben höchstens EINE
     Woche unter „Liegengeblieben" in der Übersicht - was älter ist, wandert
     ins Termin-Archiv (nach TPM und R+I getrennt), statt die Übersicht
     monatelang zu belegen. Am Bestand ändert das nichts: Die Einträge
     bleiben offen, zählen im Prüfnachweis weiter als versäumt und lassen
     sich aus dem Archiv genauso öffnen und abhaken. */
  const terminArchivGrenze = (() => {
    const d = new Date(todayKey + "T00:00:00");
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();
  const alleUeberfaelligen = kalenderEntries
    .filter((e) => e.status === "open" && e.date < todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  const ueberfaellige = alleUeberfaelligen.filter((e) => e.date >= terminArchivGrenze);
  const terminArchiv = alleUeberfaelligen.filter((e) => e.date < terminArchivGrenze);
  const quoteFuer = (list) => {
    const d = list.filter((e) => e.status === "done").length;
    const basis = list.filter((e) => e.status === "done" || e.status === "open").length;
    return basis > 0 ? Math.round((d / basis) * 100) : null;
  };
  const quoteMonatHeute = quoteFuer(kalenderEntries.filter((e) => e.date.startsWith(todayKey.slice(0, 7))));
  const quoteJahrHeute = quoteFuer(kalenderEntries.filter((e) => e.date.startsWith(todayKey.slice(0, 4) + "-")));

  const ZETTEL_FARBEN = { gelb: "#FEF9C3", blau: "#E0F2FE", gruen: "#DCFCE7" };
  // Feste Farben je Verfasser (Wunsch: Roberto immer blau, Alexander immer
  // gelb), alle anderen behalten die abwechselnde Zufallsfarbe des Zettels.
  // Seit der Benutzer-Anmeldung heißen die Urheber mit vollem Benutzernamen
  // (RobertoCiraci statt RC) - beide Schreibweisen zählen, sonst wären die
  // alten Zettel anders gefärbt als die neuen desselben Verfassers.
  const zettelFarbeFuer = (z) => {
    const wer = String(z.name || "").trim().toUpperCase();
    if (wer === "RC" || wer === "ROBERTOCIRACI") return ZETTEL_FARBEN.blau;
    if (wer === "AR" || wer === "ALEXANDERRADKE") return ZETTEL_FARBEN.gelb;
    return ZETTEL_FARBEN[z.farbe] || ZETTEL_FARBEN.gelb;
  };
  const addZettel = async (text, name) => {
    if (!String(text || "").trim() || !String(name || "").trim()) return;
    setZettelName(String(name).trim());
    localStorage.setItem("werkstatt-kalender-name", String(name).trim());
    const farben = Object.keys(ZETTEL_FARBEN);
    const zettel = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: todayKey,
      category: "NOTIZ",
      name: String(name).trim(),
      status: "open",
      note: String(text).trim(),
      zeit: new Date().toISOString(),
      farbe: farben[zettelListe.length % farben.length],
      monitor: false,
    };
    await persist([...entries, zettel]);
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

  // Ein-Klick-Abhaken (Robertos QoL-Auswahl vom 19.08.): der grüne Haken auf
  // der Kachel erledigt den Termin sofort - vorher brauchte es Kachel →
  // Dialog → "Gemacht" → Schließen. Der Dialog bleibt für Notiz und Löschen.
  const hakePlanTerminAb = async (p) => {
    if (readerMode) return;
    const vorhanden = entries.find((e) => e.date === p.date && e.name === p.anlage);
    if (vorhanden) {
      if (vorhanden.status !== "done") {
        const vorherStatus = vorhanden.status;
        await persist(entries.map((e) => (e.id === vorhanden.id ? { ...e, status: "done" } : e)));
        zeigeRueckgaengig(`✓ ${p.anlage} abgehakt`, async () => {
          await persist(entriesRef.current.map((e) => (e.id === vorhanden.id ? { ...e, status: vorherStatus } : e)));
        });
      }
      return;
    }
    const category = riItems.some((r) => r.name === p.anlage) ? "RI" : "TPM";
    const neuId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await persist([...entries, {
      id: neuId,
      date: p.date, category, name: p.anlage, status: "done", note: "",
    }]);
    zeigeRueckgaengig(`✓ ${p.anlage} abgehakt`, async () => {
      await persist(entriesRef.current.filter((e) => e.id !== neuId));
    });
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

  /* alsPlan: Der frühere Plan-Reiter ist seit dem 18.08. Teil der Monats-
     Auswertung - sein Druck (der Plan-Kalender, seit Robertos Ansage vom
     18.08. ohne die Tabellen-Seite) bleibt als eigene Vorlage erhalten und
     wird über diesen Schalter angefordert statt über die View. */
  const buildPrintDocument = (alsPlan = false) => {
    const catsToShow = filter === "ALL" ? ["TPM", "RI"] : [filter];
    const kopfTitel = alsPlan ? "Wartungsplan" : printPrefix;
    const kopfZeile = alsPlan ? `${MONTHS[month]} ${year}` : printSuffix;
    let body = `<div style="text-align:center;margin-bottom:18px;">
      <div style="font-weight:900;font-size:22px;text-transform:uppercase;letter-spacing:0.02em;">${escapeHtml(kopfTitel)}</div>
      <div style="font-family:monospace;font-size:13px;margin-top:2px;">${escapeHtml(kopfZeile)}</div>
      ${!alsPlan ? `<div style="font-size:14px;font-weight:800;margin-top:5px;">${doneCount} von ${quoteBasis} erledigt${donePercent !== null ? ` · ${donePercent} %` : ""}</div>` : ""}
    </div>`;

    if (alsPlan) {
      body += `<div style="margin-bottom:24px;">
        <div style="font-weight:700;font-size:13px;text-transform:uppercase;margin-bottom:5px;">Kalender – ${escapeHtml(MONTHS[month])} ${year}</div>
        ${buildPlanCalendarGridHTML()}
      </div>`;
      return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(kopfTitel)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
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
  /* ---- „Passt auf ein Blatt" ----
     Ein Aushang, der auf zwei Seiten rutscht, ist keiner - die zweite Seite
     hängt selten daneben. Deshalb misst sich das fertige Blatt im Druckfenster
     selbst und verkleinert sich so weit, bis es auf eine Seite passt.
     Zwei Dinge sind dabei entscheidend:
     - Die feste Breite in Pixeln. Ohne sie würde am Bildschirm anders
       umbrochen als auf dem Papier, und die Messung wäre wertlos.
     - `zoom` statt `transform`. `transform` verkleinert nur das Bild, der
       Platzbedarf im Seitenfluss bleibt - Chrome würde trotzdem umbrechen.
     Maße bei 96 dpi: A4 hoch mit 10 mm Rand sind 718 x 1047 px, davon gehen
     die 8 px Polster des Körpers ab. */
  const passtAufEinBlatt = (breite, hoehe) => `<script>
    (function () {
      var b = document.getElementById('blatt');
      if (!b) return;
      var f = 1;
      function hoeheBei(x) {
        b.style.zoom = x;
        b.style.width = Math.round(${breite} / x) + 'px';
        return b.getBoundingClientRect().height;
      }
      while (f > 0.45 && hoeheBei(f) > ${hoehe}) f = Math.round((f - 0.02) * 100) / 100;
    })();
  <\/script>`;

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

  /* ---- Druckvorlage Planung: HOCHFORMAT, Zeilen wie am Bildschirm ----
     Vorher war es eine Matrix mit sieben Tagesspalten und kleinen Kacheln
     darin. Am Bildschirm sieht die Planung aber anders aus: ein Block je Tag,
     darin eine Zeile je Person mit Schicht und Arbeiten. Wer den Ausdruck
     neben den Bildschirm legt, soll dasselbe Bild vor sich haben - sonst muss
     er beim Lesen zweimal umdenken.
     Hochformat, weil die Zeilen lang sind und die Tage untereinander stehen. */
  const buildPlanungPrintHTML = () => {
    const kw = getISOWeek(planungMontag);
    const vonStr = planungMontag.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const bisStr = addDays(planungMontag, 6).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

    // Wie am Bildschirm: nur die eigentliche Mannschaft, nach Gewerk sortiert.
    const rang = { mech: 0, elek: 1, azubi: 2 };
    const haupt = [...team].filter((t) => (t.rolle || "") !== "").sort((a, b) => rang[a.rolle] - rang[b.rolle]);

    const chip = (text, farbe, grund) =>
      `<span style="display:inline-block;font-size:9.5px;font-weight:700;color:${farbe};border:1px solid ${farbe};background:${grund};border-radius:3px;padding:0 5px;margin:1px 4px 1px 0;">${text}</span>`;

    /* Nur Montag bis Freitag. Am Wochenende steht in der Werkstatt planmäßig
       niemand; die beiden Blöcke haben nur Platz gekostet und den Rest der
       Seite kleingerechnet. Wer am Samstag jemanden einteilt, sieht das am
       Bildschirm - der Aushang ist für die Arbeitswoche. */
    const bloecke = planungTage.filter((t) => !t.we).map((t, tagNr) => {
      const feiertag = getHolidays(t.datum.getFullYear()).get(t.key);
      const tagesPlan = wochenPlan.filter((p) => p.date === t.key);
      // Sa/So kompakt: nur Personen mit Schicht - genau wie am Bildschirm.
      const tagesPersonen = t.we ? haupt.filter((m) => schichtFuer(m.name, t.key)) : haupt;

      const wartung = tagesPlan.length === 0
        ? `<span style="color:#B7BEC6;font-size:10px;">–</span>`
        : tagesPlan.map((p) => {
            const done = isPlanDone(p);
            const c = done ? "#2F7D4F" : planGroupColor(p.anlage, tpmAnlagen, riItems);
            return chip(`${done ? "✓ " : ""}${escapeHtml(p.anlage)}`, c, done ? "#E5F3EA" : "white");
          }).join("");

      const personZeilen = tagesPersonen.map((mitglied) => {
        const person = mitglied.name;
        const rolle = TEAM_ROLLEN[mitglied.rolle || ""] || { color: "#8A9099" };
        const schicht = schichtFuer(person, t.key);
        const abwesend = schicht && SCHICHT_ABWESEND.has(schicht);
        const farbe = schicht ? SCHICHTEN[schicht] : null;
        const arbeiten = abwesend ? "" : geplantFuer(person, t.key)
          .map((a) => chip(`${escapeHtml(a.name)}: ${escapeHtml(a.note)}`, a.art === "elek" ? ARBEIT_ART.elek.color : ARBEIT_ART.mech.color, "white")).join("");
        const notizen = abwesend ? "" : notizenFuer(person, t.key)
          .map((n) => chip(`📝 ${escapeHtml(n.note)}`, "#8A7A1E", "#FEF9C3")).join("");
        const inhalt = abwesend
          ? `<span style="color:#A2AAB3;font-size:10px;font-style:italic;">abwesend</span>`
          : (arbeiten + notizen) || `<span style="color:#C3C7CB;font-size:10px;">–</span>`;
        return `<tr>
          <td style="padding:2px 8px;border-bottom:1px solid #E2E4E7;border-right:2px solid #22262B;white-space:nowrap;font-size:11px;font-weight:700;${abwesend ? "color:#A2AAB3;" : ""}">
            <span style="display:inline-block;width:15px;height:15px;border-radius:50%;background:${rolle.color};color:white;font-weight:800;font-size:8px;text-align:center;line-height:15px;margin-right:6px;">${escapeHtml(personKuerzel(person))}</span>${escapeHtml(person)}</td>
          <td style="padding:2px 6px;border-bottom:1px solid #E2E4E7;border-right:2px solid #22262B;text-align:center;">
            ${farbe ? `<span style="display:inline-block;font-size:9px;font-weight:800;color:${farbe.text || "white"};background:${farbe.color};border-radius:3px;padding:1px 6px;">${escapeHtml(farbe.kurz || schicht)}</span>` : ""}</td>
          <td style="padding:2px 8px;border-bottom:1px solid #E2E4E7;">${inhalt}</td>
        </tr>`;
      }).join("");

      const leerHinweis = (t.we && tagesPersonen.length === 0)
        ? `<tr><td colspan="3" style="padding:3px 8px;color:#8A9099;font-size:9px;font-style:italic;">Niemand eingeteilt.</td></tr>`
        : "";

      return `<div style="border:1.5px solid #6B7280;border-radius:5px;overflow:hidden;margin-bottom:4px;page-break-inside:avoid;">
        <div style="background:${t.we ? "#7FA6C4" : "#4B5259"};color:white;padding:3px 9px;font-weight:800;font-size:11.5px;text-transform:uppercase;letter-spacing:0.05em;">
          ${t.datum.toLocaleDateString("de-DE", { weekday: "long" })}
          <span style="font-family:monospace;font-weight:400;opacity:0.9;font-size:9px;text-transform:none;letter-spacing:0;margin-left:8px;">${t.datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} · KW ${getISOWeek(t.datum)}</span>
          ${feiertag ? `<span style="font-size:9px;color:#FFE3DE;margin-left:8px;">${escapeHtml(feiertag)}</span>` : ""}
        </div>
        <table>
          <colgroup><col style="width:150px;"><col style="width:52px;"><col></colgroup>
          ${tagNr === 0 ? `<thead><tr>
            <th style="background:#F7F8F9;font-size:8.5px;text-transform:uppercase;color:#8A9099;letter-spacing:0.04em;text-align:left;padding:2px 8px;border-bottom:1.5px solid #6B7280;border-right:2px solid #22262B;">Person</th>
            <th style="background:#F7F8F9;font-size:8.5px;text-transform:uppercase;color:#8A9099;letter-spacing:0.04em;text-align:left;padding:2px 6px;border-bottom:1.5px solid #6B7280;border-right:2px solid #22262B;">Schicht</th>
            <th style="background:#F7F8F9;font-size:8.5px;text-transform:uppercase;color:#8A9099;letter-spacing:0.04em;text-align:left;padding:2px 8px;border-bottom:1.5px solid #6B7280;">Arbeiten &amp; Notizen</th>
          </tr></thead>` : ""}
          <tbody>
            <tr>
              <td style="padding:2px 8px;background:#FBF7F1;border-top:2px solid #22262B;border-bottom:2px solid #22262B;border-right:2px solid #22262B;font-weight:800;color:#C97A2B;white-space:nowrap;font-size:11px;">Wartungsplan</td>
              <td style="background:#FBF7F1;border-top:2px solid #22262B;border-bottom:2px solid #22262B;border-right:2px solid #22262B;"></td>
              <td style="padding:2px 8px;background:#FBF7F1;border-top:2px solid #22262B;border-bottom:2px solid #22262B;">${wartung}</td>
            </tr>
            ${leerHinweis}${personZeilen}
          </tbody>
        </table>
      </div>`;
    }).join("");

    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Planung KW ${kw}</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 8px; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      </style>
    </head><body>
      <div id="blatt" style="width:702px;">
        <div style="text-align:center;margin-bottom:7px;">
          <div style="font-weight:900;font-size:18px;text-transform:uppercase;letter-spacing:0.02em;">Planung</div>
          <div style="font-family:monospace;font-size:11px;margin-top:1px;">KW ${kw} · ${vonStr} – ${addDays(planungMontag, 4).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} · Montag bis Freitag</div>
        </div>
        ${bloecke || "<p>Kein Team angelegt.</p>"}
      </div>
      ${passtAufEinBlatt(702, 1031)}
    </body></html>`;
  };

  const handlePrintPlanung = () => {
    const html = buildPlanungPrintHTML();
    openPrintWindow(html, `werkstatt-planung-kw${getISOWeek(planungMontag)}-${planungMontag.getFullYear()}.html`);
  };

  /* ---- Druckvorlage Schichtplan WOCHENWEISE (quer, ein Blatt je KW) ----
     Die Monatsmatrix daneben ist zum Planen am Bildschirm gedacht: 31 Spalten
     auf einem Blatt sind an der Wand nicht mehr zu lesen. Für den Aushang
     bekommt jede Kalenderwoche ihr eigenes Blatt - dieselben sieben Spalten
     wie in der Planung, damit beide Blätter nebeneinander passen. */
  const buildSchichtplanWochenHTML = () => {
    const my = matrixCursor.getFullYear();
    const mm = matrixCursor.getMonth();
    const feiertage = getHolidays(my);
    const tageImMonat = new Date(my, mm + 1, 0).getDate();

    // Alle Montage sammeln, deren Woche in den Monat hineinragt. Die erste
    // und die letzte Woche gehören meist zwei Monaten - sie werden trotzdem
    // ganz gedruckt, sonst fehlten am Blattrand Tage.
    const montage = [];
    for (let tag = 1; tag <= tageImMonat; tag++) {
      const d = new Date(my, mm, tag);
      const montag = addDays(d, -((d.getDay() + 6) % 7));
      const k = dateKey(montag.getFullYear(), montag.getMonth(), montag.getDate());
      if (!montage.some((m) => m.k === k)) montage.push({ k, d: montag });
    }

    const rang = { mech: 0, elek: 1, azubi: 2 };
    const mannschaft = [...team].sort((a, b) => (rang[a.rolle] ?? 9) - (rang[b.rolle] ?? 9) || String(a.name).localeCompare(String(b.name), "de"));

    const seiten = montage.map(({ d: montag }, idx) => {
      const kw = getISOWeek(montag);
      const tage = Array.from({ length: 7 }, (_, i) => {
        const t = addDays(montag, i);
        return { d: t, key: dateKey(t.getFullYear(), t.getMonth(), t.getDate()), we: t.getDay() === 0 || t.getDay() === 6 };
      });
      const vonStr = montag.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
      const bisStr = addDays(montag, 6).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

      const kopf = tage.map((t) => {
        const ft = feiertage.get(t.key);
        return `<th style="border:1px solid #6B7280;padding:6px 4px;background:${ft ? "#FBE9E7" : t.we ? "#E5F0F8" : "#F7F8F9"};font-weight:800;color:${ft ? "#B23A34" : t.we ? "#5B87AB" : "#5B6572"};font-size:11px;text-transform:uppercase;">
          ${t.d.toLocaleDateString("de-DE", { weekday: "short" })}<div style="font-size:13px;font-weight:900;color:#22262B;">${String(t.d.getDate()).padStart(2, "0")}.${String(t.d.getMonth() + 1).padStart(2, "0")}.</div>
          ${ft ? `<div style="font-size:8px;font-weight:700;">${escapeHtml(ft)}</div>` : ""}</th>`;
      }).join("");

      const zeilen = mannschaft.map((mitglied) => {
        const person = mitglied.name;
        const rolle = TEAM_ROLLEN[mitglied.rolle || ""] || { color: "#8A9099" };
        const zellen = tage.map((t) => {
          const sch = schichtFuer(person, t.key);
          const farbe = sch ? SCHICHTEN[sch] : null;
          return `<td style="border:1px solid #6B7280;padding:0;text-align:center;background:${t.we ? "#EFF5FA" : "white"};height:34px;">
            ${farbe ? `<div style="background:${farbe.color};color:${farbe.text || "white"};font-weight:900;font-size:15px;padding:7px 0;">${escapeHtml(farbe.kurz || sch)}</div>` : ""}</td>`;
        }).join("");
        return `<tr>
          <td style="border:1px solid #6B7280;padding:5px 8px;background:#F7F8F9;font-weight:700;font-size:13px;white-space:nowrap;">
            <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${rolle.color};color:white;font-weight:800;font-size:8px;text-align:center;line-height:16px;margin-right:6px;">${escapeHtml(personKuerzel(person))}</span>${escapeHtml(person)}</td>
          ${zellen}</tr>`;
      }).join("");

      return `<section style="${idx > 0 ? "page-break-before:always;" : ""}">
        <div style="text-align:center;margin-bottom:12px;">
          <div style="font-weight:900;font-size:24px;text-transform:uppercase;letter-spacing:0.02em;">Schichtplan</div>
          <div style="font-family:monospace;font-size:14px;margin-top:3px;">KW ${kw} · ${vonStr} – ${bisStr}</div>
        </div>
        <table>
          <colgroup><col style="width:210px;">${tage.map(() => "<col>").join("")}</colgroup>
          <thead><tr><th style="border:1px solid #6B7280;padding:6px 8px;background:#F7F8F9;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;color:#8A9099;">Mitarbeiter</th>${kopf}</tr></thead>
          <tbody>${zeilen}</tbody>
        </table>
      </section>`;
    }).join("");

    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Schichtplan ${MONTHS[mm]} ${my} – wochenweise</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 10px; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      </style>
    </head><body>${seiten || "<p>Kein Team angelegt.</p>"}</body></html>`;
  };

  const handlePrintSchichtplanWochen = () => {
    openPrintWindow(buildSchichtplanWochenHTML(),
      `werkstatt-schichtplan-wochen-${matrixCursor.getFullYear()}-${pad(matrixCursor.getMonth() + 1)}.html`);
  };

  /* ---- Jahreskalender TPM & R+I fürs Board (A3 quer) ----
     Ein gewöhnlicher Wandkalender: die zwölf Monate stehen oben als Spalten,
     darunter die Tage 1 bis 31 als Zeilen. Der Name der Anlage bzw. des
     R+I-Punktes steht WAAGRECHT im Tag und wird, wenn er zu lang ist, hinten
     mit „…" gekürzt - vollständig steht er im Mauszeiger-Hinweis. Senkrechte
     Namen wären zwar vollständig, liest aber niemand im Vorbeigehen.
     A3 statt A4, weil zwölf Monatsspalten auf A4 zu schmal werden. */
  const buildJahresKalenderHTML = (jahr, art = "ALLE") => {
    const feiertage = getHolidays(jahr);
    const relevant = entries.filter((e) =>
      (e.category === "TPM" || e.category === "RI") &&
      (art === "ALLE" || e.category === art) &&
      String(e.date || "").startsWith(String(jahr)));
    const titel = art === "TPM" ? "TPM" : art === "RI" ? "R+I" : "TPM &amp; R+I";

    const amTag = (m, t) => relevant.filter((e) => e.date === dateKey(jahr, m, t));

    /* Wie hoch eine Tageszeile wird, bestimmt der vollste Monat an diesem Tag:
       stehen am 12. irgendwo drei Termine, braucht die ganze Zeile drei
       Kästchen Höhe. Bleibt das Blatt dadurch zu hoch für A3, werden die
       Kästchen flacher - lieber etwas kleiner als eine zweite Seite. Umgekehrt
       wachsen sie, wenn Platz frei bleibt (ein Blatt „nur TPM" hat kaum
       Doppeltage), damit das Blatt die Seite auch wirklich ausfüllt.
       Die 960 px sind der Platz, der auf der bedruckbaren A3-Fläche (1047 px)
       nach Titel, Kopfzeile und Legende für die Zeilen übrig ist. */
    const proTag = Array.from({ length: 31 }, (_, j) =>
      Math.max(1, ...Array.from({ length: 12 }, (_, m) => amTag(m, j + 1).length)));
    const gesamtHoehe = (h) => proTag.reduce((summe, n) => summe + 4 + h * n, 0);
    let kasten = 9;
    while (kasten < 30 && gesamtHoehe(kasten + 1) <= 960) kasten += 1;
    const kastenSchrift = Math.max(6, Math.min(10, Math.floor(kasten * 0.62)));

    const kopfzeile = MONTHS.map((name) =>
      `<th style="border:1px solid #DCE1E6;background:#FAFBFC;font-size:11px;font-weight:800;color:#5B6572;text-align:left;padding:3px 8px;">${name}</th>`).join("");

    const zeilen = Array.from({ length: 31 }, (_, j) => {
      const t = j + 1;
      const zellen = Array.from({ length: 12 }, (_, m) => {
        if (t > new Date(jahr, m + 1, 0).getDate()) return `<td style="border:1px solid #DCE1E6;background:#EDF0F3;"></td>`;
        const feiertag = feiertage.get(dateKey(jahr, m, t));
        const eintraege = amTag(m, t);
        const grund = feiertag ? "#FDF0EE" : isWeekend(jahr, m, t) ? "#F2F5F8" : "#FFFFFF";
        const kaesten = eintraege.map((e) => {
          const fertig = e.status === "done";
          const farben = fertig ? "background:#E2F0E7;color:#24603D;border-left:3px solid #2F7D4F;"
            : e.category === "TPM" ? "background:#E3EDF5;color:#1F4A6B;border-left:3px solid #2F6690;"
            : "background:#EFE7F5;color:#5B3579;border-left:3px solid #7A4E9B;";
          return `<div title="${escapeHtml(e.name)}" style="${farben}font-size:${kastenSchrift}px;font-weight:700;line-height:${kasten - 2}px;height:${kasten - 1}px;border-radius:2px;padding:0 3px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(e.name)}</div>`;
        }).join("");
        return `<td style="border:1px solid #DCE1E6;background:${grund};padding:1px 2px;vertical-align:top;">
          <div style="display:flex;gap:3px;align-items:flex-start;">
            <span style="flex:0 0 24px;font-size:8px;font-weight:700;color:#98A1AA;line-height:${kasten - 1}px;white-space:nowrap;"><b style="color:#5B6572;font-size:9px;">${t}</b> ${WEEKDAYS[(new Date(jahr, m, t).getDay() + 6) % 7]}</span>
            <div style="flex:1 1 auto;min-width:0;">${kaesten || (feiertag
              ? `<div style="font-size:8px;color:#B23A34;line-height:${kasten - 1}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(feiertag)}</div>`
              : "")}</div>
          </div>
        </td>`;
      }).join("");
      // Die Tageszahl steht IN jedem Tag, nicht in einer Spalte am Rand: Wer
      // im Dezember etwas sucht, will nicht quer über das Blatt zurückschauen.
      return `<tr>${zellen}</tr>`;
    }).join("");

    // Robertos Ansage vom 18.08.: Auf jeder Auswertungs-Vorlage steht die
    // Quote leserlich oben - "X von Y erledigt · Z %", nicht als Kleingedrucktes.
    const jkErledigt = relevant.filter((e) => e.status === "done").length;
    const jkBasis = relevant.filter((e) => e.status === "done" || e.status === "open").length;
    const jkProzent = jkBasis > 0 ? Math.round((jkErledigt / jkBasis) * 100) : null;
    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${titel} Jahreskalender ${jahr}</title>
      <style>
        @page { size: A3 landscape; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 8px; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      </style>
    </head><body>
      <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:8px;">
        <div style="font-weight:900;font-size:21px;">Jahreskalender ${jahr} · ${titel}</div>
        <div style="font-size:13px;font-weight:800;color:#22262B;">${jkErledigt} von ${jkBasis} erledigt${jkProzent !== null ? ` · ${jkProzent} %` : ""}</div>
      </div>
      <table>
        <colgroup>${MONTHS.map(() => "<col>").join("")}</colgroup>
        <thead><tr>${kopfzeile}</tr></thead>
        <tbody>${zeilen}</tbody>
      </table>
      <div style="margin-top:8px;font-size:10px;color:#6B7480;">
        <span style="display:inline-block;border-radius:2px;padding:1px 9px;font-weight:800;background:#E3EDF5;color:#1F4A6B;border-left:4px solid #2F6690;">TPM offen</span>
        &nbsp;<span style="display:inline-block;border-radius:2px;padding:1px 9px;font-weight:800;background:#EFE7F5;color:#5B3579;border-left:4px solid #7A4E9B;">R+I offen</span>
        &nbsp;<span style="display:inline-block;border-radius:2px;padding:1px 9px;font-weight:800;background:#E2F0E7;color:#24603D;border-left:4px solid #2F7D4F;">erledigt</span>
        &nbsp;&nbsp;<span style="display:inline-block;width:12px;height:12px;background:#F2F5F8;border:1px solid #C9D0D8;vertical-align:-2px;"></span> Wochenende
        &nbsp;&nbsp;<span style="display:inline-block;width:12px;height:12px;background:#FDF0EE;border:1px solid #C9D0D8;vertical-align:-2px;"></span> Feiertag
        ${relevant.length ? "" : `&nbsp;&nbsp;· Für ${jahr} ist nichts eingetragen.`}
      </div>
    </body></html>`;
  };

  /* ---- Monatsblatt (A4 hoch) ----
     Derselbe Kalender, nur für einen Monat: die Tage untereinander, daneben
     was ansteht. Für den Aushang am Schrank oder zum Mitnehmen - dafür ist
     ein A3-Bogen zu groß. */
  const buildMonatsKalenderHTML = (jahr, monat, art = "ALLE") => {
    const feiertage = getHolidays(jahr);
    const relevant = entries.filter((e) =>
      (e.category === "TPM" || e.category === "RI") &&
      (art === "ALLE" || e.category === art) &&
      String(e.date || "").startsWith(`${jahr}-${pad(monat + 1)}`));
    const titel = art === "TPM" ? "TPM" : art === "RI" ? "R+I" : "TPM &amp; R+I";

    const zeilen = Array.from({ length: new Date(jahr, monat + 1, 0).getDate() }, (_, j) => {
      const t = j + 1;
      const key = dateKey(jahr, monat, t);
      const feiertag = feiertage.get(key);
      const amTag = relevant.filter((e) => e.date === key);
      const grund = feiertag ? "#FDF0EE" : isWeekend(jahr, monat, t) ? "#F2F5F8" : "#FFFFFF";
      const kaesten = amTag.map((e) => {
        const fertig = e.status === "done";
        const farben = fertig ? "background:#E2F0E7;color:#24603D;border-left:3px solid #2F7D4F;"
          : e.category === "TPM" ? "background:#E3EDF5;color:#1F4A6B;border-left:3px solid #2F6690;"
          : "background:#EFE7F5;color:#5B3579;border-left:3px solid #7A4E9B;";
        return `<span style="${farben}display:inline-block;font-size:10px;font-weight:700;border-radius:2px;padding:1px 6px;margin:1px 4px 1px 0;">${escapeHtml(e.name)}</span>`;
      }).join("");
      return `<tr>
        <td style="border:1px solid #DCE1E6;background:${grund};text-align:right;padding:2px 6px;font-size:11px;font-weight:800;width:34px;">${t}</td>
        <td style="border:1px solid #DCE1E6;background:${grund};padding:2px 6px;font-size:9px;font-weight:700;color:#98A1AA;width:30px;">${WEEKDAYS[(new Date(jahr, monat, t).getDay() + 6) % 7]}</td>
        <td style="border:1px solid #DCE1E6;background:${grund};padding:1px 6px;">${kaesten
          || (feiertag ? `<span style="font-size:9px;color:#B23A34;">${escapeHtml(feiertag)}</span>` : "")}</td>
      </tr>`;
    }).join("");

    // Auch hier: die Quote leserlich oben (Robertos Ansage vom 18.08.).
    const mkErledigt = relevant.filter((e) => e.status === "done").length;
    const mkBasis = relevant.filter((e) => e.status === "done" || e.status === "open").length;
    const mkProzent = mkBasis > 0 ? Math.round((mkErledigt / mkBasis) * 100) : null;
    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${titel} ${MONTHS[monat]} ${jahr}</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 8px; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      </style>
    </head><body>
      <div id="blatt" style="width:702px;">
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:7px;">
          <div style="font-weight:900;font-size:17px;">${MONTHS[monat]} ${jahr} · ${titel}</div>
          <div style="font-size:12px;font-weight:800;color:#22262B;">${mkErledigt} von ${mkBasis} erledigt${mkProzent !== null ? ` · ${mkProzent} %` : ""}</div>
        </div>
        <table><tbody>${zeilen}</tbody></table>
        <div style="margin-top:7px;font-size:10px;color:#6B7480;">
          <span style="display:inline-block;border-radius:2px;padding:1px 9px;font-weight:800;background:#E3EDF5;color:#1F4A6B;border-left:4px solid #2F6690;">TPM offen</span>
          &nbsp;<span style="display:inline-block;border-radius:2px;padding:1px 9px;font-weight:800;background:#EFE7F5;color:#5B3579;border-left:4px solid #7A4E9B;">R+I offen</span>
          &nbsp;<span style="display:inline-block;border-radius:2px;padding:1px 9px;font-weight:800;background:#E2F0E7;color:#24603D;border-left:4px solid #2F7D4F;">erledigt</span>
          ${relevant.length ? "" : `&nbsp;&nbsp;· Für ${MONTHS[monat]} ${jahr} ist nichts eingetragen.`}
        </div>
      </div>
      ${passtAufEinBlatt(702, 1031)}
    </body></html>`;
  };

  /* ---- Monats-Diagramm (A4 hoch) ----
     Robertos Ansage vom 18.08.: die Monats-Auswertung auch als Diagramm aufs
     Papier. Je Tag ein Balken - unten grün das Erledigte, oben rot das
     Offene - und die Quote leserlich oben. Darunter die Zahlen als Tabelle,
     denn ein Balken ohne Zahl lässt sich am Schrank schlecht nachprüfen. */
  const buildDiagrammMonatHTML = (jahr, monat, art = "ALLE") => {
    const feiertage = getHolidays(jahr);
    const relevant = entries.filter((e) =>
      (e.category === "TPM" || e.category === "RI") &&
      (art === "ALLE" || e.category === art) &&
      String(e.date || "").startsWith(`${jahr}-${pad(monat + 1)}`));
    const titel = art === "TPM" ? "TPM" : art === "RI" ? "R+I" : "TPM &amp; R+I";
    const tageImMonat = new Date(jahr, monat + 1, 0).getDate();
    const tage = Array.from({ length: tageImMonat }, (_, i) => {
      const amTag = relevant.filter((e) => e.date === dateKey(jahr, monat, i + 1));
      return {
        tag: i + 1,
        erledigt: amTag.filter((e) => e.status === "done").length,
        offen: amTag.filter((e) => e.status === "open").length,
        eintraege: amTag,
      };
    });
    const erledigt = relevant.filter((e) => e.status === "done").length;
    const basis = relevant.filter((e) => e.status === "done" || e.status === "open").length;
    const prozent = basis > 0 ? Math.round((erledigt / basis) * 100) : null;

    // Feste Zeichenfläche; die Skala richtet sich nach dem vollsten Tag.
    const B = 702, H = 230, L = 26, R = 6, O = 16, U = 22;
    const innenB = B - L - R, innenH = H - O - U;
    const maxWert = Math.max(1, ...tage.map((t) => t.erledigt + t.offen));
    const schritt = innenB / tageImMonat;
    const balkenB = Math.max(6, Math.floor(schritt * 0.62));
    const hoehe = (n) => (n / maxWert) * innenH;

    let balken = "";
    tage.forEach((t, i) => {
      const xm = L + i * schritt + schritt / 2;
      const hE = hoehe(t.erledigt), hO = hoehe(t.offen);
      if (t.erledigt > 0) balken += `<rect x="${(xm - balkenB / 2).toFixed(1)}" y="${(O + innenH - hE).toFixed(1)}" width="${balkenB}" height="${hE.toFixed(1)}" fill="#2F7D4F" rx="1"/>`;
      if (t.offen > 0) balken += `<rect x="${(xm - balkenB / 2).toFixed(1)}" y="${(O + innenH - hE - hO).toFixed(1)}" width="${balkenB}" height="${hO.toFixed(1)}" fill="#B23A34" rx="1"/>`;
      if (t.erledigt + t.offen > 0)
        balken += `<text x="${xm.toFixed(1)}" y="${(O + innenH - hE - hO - 4).toFixed(1)}" text-anchor="middle" style="font-size:8.5px;fill:#5B6572;font-weight:700;">${t.erledigt + t.offen}</text>`;
      const wochenende = isWeekend(jahr, monat, t.tag);
      const feiertag = feiertage.get(dateKey(jahr, monat, t.tag));
      balken += `<text x="${xm.toFixed(1)}" y="${H - 7}" text-anchor="middle" style="font-size:8.5px;font-weight:700;fill:${feiertag ? "#B23A34" : wochenende ? "#6D93B8" : "#5B6572"};">${t.tag}</text>`;
    });
    const linien = Array.from({ length: maxWert + 1 }, (_, n) =>
      (maxWert <= 6 || n % Math.ceil(maxWert / 5) === 0)
        ? `<line x1="${L}" y1="${(O + innenH - hoehe(n)).toFixed(1)}" x2="${B - R}" y2="${(O + innenH - hoehe(n)).toFixed(1)}" stroke="${n === 0 ? "#C3C7CB" : "#EDEFF2"}" stroke-width="1"/>
           <text x="${L - 5}" y="${(O + innenH - hoehe(n) + 3).toFixed(1)}" text-anchor="end" style="font-size:8.5px;fill:#A6AEB6;">${n}</text>`
        : "").join("");

    const zeilen = tage.filter((t) => t.eintraege.length > 0).map((t) => {
      const namen = t.eintraege.map((e) => {
        const fertig = e.status === "done";
        const farben = fertig ? "background:#E2F0E7;color:#24603D;border-left:3px solid #2F7D4F;"
          : e.category === "TPM" ? "background:#E3EDF5;color:#1F4A6B;border-left:3px solid #2F6690;"
          : "background:#EFE7F5;color:#5B3579;border-left:3px solid #7A4E9B;";
        return `<span style="${farben}display:inline-block;font-size:10px;font-weight:700;border-radius:2px;padding:1px 6px;margin:1px 4px 1px 0;">${fertig ? "✓ " : ""}${escapeHtml(e.name)}</span>`;
      }).join("");
      return `<tr>
        <td style="border:1px solid #DCE1E6;text-align:right;padding:2px 6px;font-size:11px;font-weight:800;width:34px;">${t.tag}</td>
        <td style="border:1px solid #DCE1E6;padding:2px 6px;font-size:9px;font-weight:700;color:#98A1AA;width:30px;">${WEEKDAYS[(new Date(jahr, monat, t.tag).getDay() + 6) % 7]}</td>
        <td style="border:1px solid #DCE1E6;text-align:right;padding:2px 8px;font-size:11px;color:#24603D;font-weight:700;width:60px;">${t.erledigt || ""}</td>
        <td style="border:1px solid #DCE1E6;text-align:right;padding:2px 8px;font-size:11px;color:#B23A34;font-weight:700;width:60px;">${t.offen || ""}</td>
        <td style="border:1px solid #DCE1E6;padding:1px 6px;">${namen}</td>
      </tr>`;
    }).join("");

    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Monats-Diagramm ${MONTHS[monat]} ${jahr}</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 8px; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      </style>
    </head><body>
      <div id="blatt" style="width:702px;">
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:2px;">
          <div style="font-weight:900;font-size:17px;">Monats-Diagramm · ${MONTHS[monat]} ${jahr} · ${titel}</div>
          <div style="font-size:13px;font-weight:800;color:#22262B;">${erledigt} von ${basis} erledigt${prozent !== null ? ` · ${prozent} %` : ""}</div>
        </div>
        <div style="font-size:10px;color:#6B7480;margin-bottom:6px;">Termine je Tag – grün erledigt, rot offen.</div>
        ${relevant.length === 0
          ? `<div style="border:1px solid #DCE1E6;border-radius:6px;padding:14px;font-size:12px;color:#6B7480;">Für ${MONTHS[monat]} ${jahr} ist nichts eingetragen.</div>`
          : `<div style="border:1px solid #DCE1E6;border-radius:6px;padding:8px 4px 2px;">
              <svg viewBox="0 0 ${B} ${H}" width="${B - 16}" role="img" aria-label="Termine je Tag im ${MONTHS[monat]} ${jahr}">${linien}${balken}</svg>
            </div>
            <div style="margin-top:6px;font-size:10px;color:#6B7480;">
              <span style="display:inline-block;border-radius:2px;padding:1px 9px;font-weight:800;background:#E2F0E7;color:#24603D;border-left:4px solid #2F7D4F;">erledigt</span>
              &nbsp;<span style="display:inline-block;border-radius:2px;padding:1px 9px;font-weight:800;background:#F7E5E3;color:#B23A34;border-left:4px solid #B23A34;">offen</span>
              &nbsp;&nbsp;Zahl über dem Balken = Termine an dem Tag.
            </div>
            <div style="font-weight:700;font-size:12px;text-transform:uppercase;margin:12px 0 5px;">Die Tage im Einzelnen</div>
            <table><tbody>
              <tr>
                <td style="border:1px solid #DCE1E6;background:#FAFBFC;text-align:right;padding:2px 6px;font-size:9px;font-weight:800;color:#5B6572;width:34px;">Tag</td>
                <td style="border:1px solid #DCE1E6;background:#FAFBFC;width:30px;"></td>
                <td style="border:1px solid #DCE1E6;background:#FAFBFC;text-align:right;padding:2px 8px;font-size:9px;font-weight:800;color:#24603D;width:60px;">Erledigt</td>
                <td style="border:1px solid #DCE1E6;background:#FAFBFC;text-align:right;padding:2px 8px;font-size:9px;font-weight:800;color:#B23A34;width:60px;">Offen</td>
                <td style="border:1px solid #DCE1E6;background:#FAFBFC;padding:2px 6px;font-size:9px;font-weight:800;color:#5B6572;">Termine</td>
              </tr>
              ${zeilen}
            </tbody></table>`}
      </div>
      ${passtAufEinBlatt(702, 1031)}
    </body></html>`;
  };

  /* ---- Jahres-Diagramm (A4 hoch) ----
     Die Termintreue-Linie vom Bildschirm als Aushang: je Kalendermonat die
     Quote auf fester 0-100-Skala, darunter die Zahlen. Monate ohne Termine
     bleiben leer statt fälschlich 0 % zu behaupten - wie am Bildschirm. */
  const buildDiagrammJahrHTML = (jahr, art = "ALLE") => {
    const relevant = entries.filter((e) =>
      (e.category === "TPM" || e.category === "RI") &&
      (art === "ALLE" || e.category === art) &&
      String(e.date || "").startsWith(String(jahr)));
    const titel = art === "TPM" ? "TPM" : art === "RI" ? "R+I" : "TPM &amp; R+I";
    const reihe = Array.from({ length: 12 }, (_, m) => {
      const imMonat = relevant.filter((e) => String(e.date || "").startsWith(`${jahr}-${pad(m + 1)}`));
      const mErledigt = imMonat.filter((e) => e.status === "done").length;
      const mBasis = imMonat.filter((e) => e.status === "done" || e.status === "open").length;
      return { monat: m, erledigt: mErledigt, basis: mBasis, quote: mBasis > 0 ? Math.round((mErledigt / mBasis) * 100) : null };
    });
    const erledigt = relevant.filter((e) => e.status === "done").length;
    const basis = relevant.filter((e) => e.status === "done" || e.status === "open").length;
    const prozent = basis > 0 ? Math.round((erledigt / basis) * 100) : null;
    const mitWert = reihe.filter((r) => r.quote !== null);

    const B = 702, H = 250, L = 32, R = 12, O = 18, U = 24;
    const innenB = B - L - R, innenH = H - O - U;
    const x = (m) => L + (m * innenB) / 11;
    const y = (q) => O + innenH - (q / 100) * innenH;

    // Lücken (Monate ohne Termine) trennen die Linie - wie am Bildschirm.
    const abschnitte = [];
    let lauf = [];
    reihe.forEach((r) => {
      if (r.quote === null) { if (lauf.length) abschnitte.push(lauf); lauf = []; }
      else lauf.push(r);
    });
    if (lauf.length) abschnitte.push(lauf);
    const schnitt = mitWert.length ? Math.round(mitWert.reduce((s, r) => s + r.quote, 0) / mitWert.length) : null;

    let svg = [0, 25, 50, 75, 100].map((q) =>
      `<line x1="${L}" y1="${y(q).toFixed(1)}" x2="${B - R}" y2="${y(q).toFixed(1)}" stroke="${q === 0 ? "#C3C7CB" : "#EDEFF2"}" stroke-width="1"/>
       <text x="${L - 6}" y="${(y(q) + 3.5).toFixed(1)}" text-anchor="end" style="font-size:9px;fill:#A6AEB6;">${q}</text>`).join("");
    if (schnitt !== null) {
      svg += `<line x1="${L}" y1="${y(schnitt).toFixed(1)}" x2="${B - R}" y2="${y(schnitt).toFixed(1)}" stroke="#8A9099" stroke-width="1.5" stroke-dasharray="5 4"/>
        <text x="${B - R}" y="${(y(schnitt) - 5).toFixed(1)}" text-anchor="end" style="font-size:9px;fill:#8A9099;font-weight:700;">⌀ ${schnitt}%</text>`;
    }
    abschnitte.forEach((abschnitt) => {
      const pfad = abschnitt.map((r, k) => `${k === 0 ? "M" : "L"} ${x(r.monat).toFixed(1)} ${y(r.quote).toFixed(1)}`).join(" ");
      if (abschnitt.length > 1) {
        svg += `<path d="${pfad} L ${x(abschnitt[abschnitt.length - 1].monat).toFixed(1)} ${y(0).toFixed(1)} L ${x(abschnitt[0].monat).toFixed(1)} ${y(0).toFixed(1)} Z" fill="#2F6690" opacity="0.10"/>`;
      }
      svg += `<path d="${pfad}" fill="none" stroke="#2F6690" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    reihe.forEach((r) => {
      if (r.quote !== null) {
        // Rand-Beschriftungen nach innen ankern, damit Januar nicht in die
        // Achsen-Zahlen und Dezember nicht aus dem Blatt läuft.
        const anker = r.monat === 0 ? "start" : r.monat === 11 ? "end" : "middle";
        svg += `<circle cx="${x(r.monat).toFixed(1)}" cy="${y(r.quote).toFixed(1)}" r="4" fill="#2F6690" stroke="#fff" stroke-width="2"/>
          <text x="${x(r.monat).toFixed(1)}" y="${(y(r.quote) - 9).toFixed(1)}" text-anchor="${anker}" style="font-size:9.5px;fill:#22262B;font-weight:700;">${r.quote}%</text>`;
      }
      svg += `<text x="${x(r.monat).toFixed(1)}" y="${H - 8}" text-anchor="middle" style="font-size:9px;font-weight:700;fill:${r.quote === null ? "#C3C7CB" : "#5B6572"};">${MONTHS[r.monat].slice(0, 3)}</text>`;
    });

    const zeilen = reihe.map((r) => `<tr>
      <td style="border:1px solid #DCE1E6;padding:3px 8px;font-size:11px;font-weight:700;">${MONTHS[r.monat]}</td>
      <td style="border:1px solid #DCE1E6;text-align:right;padding:3px 10px;font-size:11px;">${r.basis > 0 ? r.erledigt : "–"}</td>
      <td style="border:1px solid #DCE1E6;text-align:right;padding:3px 10px;font-size:11px;">${r.basis > 0 ? r.basis : "–"}</td>
      <td style="border:1px solid #DCE1E6;text-align:right;padding:3px 10px;font-size:11px;font-weight:700;color:${r.quote === null ? "#98A1AA" : "#22262B"};">${r.quote === null ? "keine Termine" : r.quote + " %"}</td>
    </tr>`).join("");

    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Jahres-Diagramm ${jahr}</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 8px; }
        table { border-collapse: collapse; width: 100%; }
      </style>
    </head><body>
      <div id="blatt" style="width:702px;">
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:2px;">
          <div style="font-weight:900;font-size:17px;">Jahres-Diagramm ${jahr} · ${titel}</div>
          <div style="font-size:13px;font-weight:800;color:#22262B;">${erledigt} von ${basis} erledigt${prozent !== null ? ` · ${prozent} %` : ""}</div>
        </div>
        <div style="font-size:10px;color:#6B7480;margin-bottom:6px;">Anteil der erledigten an den geplanten Terminen je Monat. Monate ohne Termine bleiben leer.</div>
        ${mitWert.length === 0
          ? `<div style="border:1px solid #DCE1E6;border-radius:6px;padding:14px;font-size:12px;color:#6B7480;">Für ${jahr} ist nichts eingetragen.</div>`
          : `<div style="border:1px solid #DCE1E6;border-radius:6px;padding:8px 4px 2px;">
              <svg viewBox="0 0 ${B} ${H}" width="${B - 16}" role="img" aria-label="Termintreue je Monat im Jahr ${jahr}">${svg}</svg>
            </div>`}
        <div style="font-weight:700;font-size:12px;text-transform:uppercase;margin:12px 0 5px;">Die Monate im Einzelnen</div>
        <table><tbody>
          <tr>
            <td style="border:1px solid #DCE1E6;background:#FAFBFC;padding:3px 8px;font-size:9px;font-weight:800;color:#5B6572;">Monat</td>
            <td style="border:1px solid #DCE1E6;background:#FAFBFC;text-align:right;padding:3px 10px;font-size:9px;font-weight:800;color:#5B6572;">Erledigt</td>
            <td style="border:1px solid #DCE1E6;background:#FAFBFC;text-align:right;padding:3px 10px;font-size:9px;font-weight:800;color:#5B6572;">Geplant</td>
            <td style="border:1px solid #DCE1E6;background:#FAFBFC;text-align:right;padding:3px 10px;font-size:9px;font-weight:800;color:#5B6572;">Quote</td>
          </tr>
          ${zeilen}
        </tbody></table>
      </div>
      ${passtAufEinBlatt(702, 1031)}
    </body></html>`;
  };


  /* ================= Drucken: ein Knopf, ein Dialog, eine Vorschau =================
     Vorher lagen die Druck-Knöpfe verstreut: in der Kopfleiste, mitten in der
     Werkzeugleiste des Schichtplans, unten in der TPM-Übersicht. Wer drucken
     wollte, musste erst suchen. Jetzt sitzt in jedem Bereich, in dem es etwas
     zu drucken gibt, oben rechts derselbe Knopf; was genau aufs Papier soll,
     wird im Dialog gewählt - mit einer Vorschau daneben, damit niemand blind
     auf „Drucken" klickt und sich hinterher am Drucker wundert. */
  const druckAngebot = () => {
    if (view === "COCKPIT" && cockpitTab === "SCHICHTPLAN") {
      const my = matrixCursor.getFullYear(), mm = matrixCursor.getMonth();
      return {
        titel: "Schichtplan drucken",
        bereich: "schichtplan",
        optionen: [
          { id: "schicht-monat", text: `Monat ${MONTHS[mm]} ${my}`,
            erklaerung: "Die ganze Matrix auf einem Blatt – A4 quer" },
          { id: "schicht-wochen", text: "Wochenweise, je KW ein Blatt",
            erklaerung: "A4 quer – fürs Schwarze Brett, aus der Ferne lesbar" },
        ],
      };
    }
    if (view === "COCKPIT" && cockpitTab === "PLANUNG") {
      return {
        titel: "Arbeitsplanung drucken",
        bereich: "planung",
        optionen: [
          { id: "planung-woche", text: `Woche KW ${getISOWeek(planungMontag)}`,
            erklaerung: "Ein Block je Tag wie am Bildschirm – A4 hoch, immer eine Seite" },
        ],
      };
    }
    if (view === "COCKPIT" && cockpitTab === "STOERUNGEN") {
      return {
        titel: "Störungen drucken",
        bereich: "stoerungen",
        anzeige: true, // zusätzlich zum Drucker: am Bildschirm zeigen (Monitor/Besprechung)
        optionen: [
          { id: "stoer-schichtbericht", text: "Schichtbericht – letzte 3 Schichten",
            erklaerung: "Alle Störungen der laufenden und der zwei vorigen Schichten, Stand jetzt – A4 quer, Zeilen in der Schichtfarbe" },
          { id: "stoer-monat", text: "Monats-Auswertung", monatsWahl: true,
            erklaerung: "Diagramm und Anlagen-Liste nach Anzahl der Störungen, darunter die Ausfälle mit Notizen – A4 hoch" },
          { id: "uebergabe", text: "Schichtübergabe – Stand jetzt",
            erklaerung: "Offene Störungen, heutige Termine und Pinnwand auf einem Blatt – A4 hoch, für die Übergabe" },
        ],
      };
    }
    if (view === "TPMINFO") {
      return {
        titel: "TPM-Übersicht drucken",
        bereich: "tpminfo",
        optionen: [
          { id: "nachweis", text: `Prüfnachweis ${nachweisJahr}`,
            erklaerung: "Wiederkehrende Prüfungen mit Soll, Erledigt und Versäumt – zum Vorlegen" },
        ],
      };
    }
    if (view === "JAHR" || view === "MONAT") {
      return {
        titel: "Auswertung drucken",
        bereich: "auswertung",
        umfang: true,
        optionen: [
          { id: "jahreskalender", text: `Jahreskalender ${year}`,
            erklaerung: "Alle zwölf Monate auf einem Bogen – A3 quer, fürs Board" },
          { id: "monatsblatt", text: "Einzelner Monat", monatsWahl: true,
            erklaerung: "Die Tage untereinander – A4 hoch, für den Schrank" },
          { id: "diagramm-monat", text: "Monats-Diagramm", monatsWahl: true,
            erklaerung: "Erledigt und Offen je Tag als Balken, mit Quote und Zahlen – A4 hoch" },
          { id: "diagramm-jahr", text: `Jahres-Diagramm ${year}`,
            erklaerung: "Die Termintreue je Monat als Linie, mit Quote und Zahlen – A4 hoch" },
          { id: "wartungsplan-monat", text: `Wartungsplan ${MONTHS[month]} ${year}`,
            erklaerung: "Der Plan-Kalender mit allen Terminen – der bisherige Plan-Druck" },
          { id: "liste", text: "Liste wie am Bildschirm",
            erklaerung: "Die Auswertung, so wie sie gerade dasteht" },
        ],
      };
    }
    if (view === "REGISTER") {
      return {
        titel: "Register drucken",
        bereich: "register",
        optionen: [
          { id: "liste", text: "Alle Termine als Liste",
            erklaerung: "Das Register, so wie es am Bildschirm steht" },
        ],
      };
    }
    return null;
  };

  /* Baut die gewählte Vorlage. Rückgabe ist bewusst nur HTML plus Dateiname -
     dieselbe Vorlage geht damit in die Vorschau wie in den Drucker. */
  const druckVorlage = (id) => {
    const kurz = druckUmfang === "TPM" ? "tpm" : druckUmfang === "RI" ? "ri" : "tpm-ri";
    switch (id) {
      case "schicht-monat":
        return { html: buildSchichtplanPrintHTML(),
                 datei: `werkstatt-schichtplan-${matrixCursor.getFullYear()}-${pad(matrixCursor.getMonth() + 1)}.html` };
      case "schicht-wochen":
        return { html: buildSchichtplanWochenHTML(),
                 datei: `werkstatt-schichtplan-wochen-${matrixCursor.getFullYear()}-${pad(matrixCursor.getMonth() + 1)}.html` };
      case "planung-woche":
        return { html: buildPlanungPrintHTML(),
                 datei: `werkstatt-planung-kw${getISOWeek(planungMontag)}-${planungMontag.getFullYear()}.html` };
      case "nachweis":
        return { html: buildNachweisHTML(nachweisJahr), datei: `werkstatt-pruefnachweis-${nachweisJahr}.html` };
      case "wartungsplan-monat":
        return { html: buildPrintDocument(true), datei: `werkstatt-wartungsplan-${year}-${pad(month + 1)}.html` };
      case "stoer-schichtbericht":
        return { html: buildStoerSchichtberichtHTML(), datei: `werkstatt-schichtbericht-${todayKey}.html` };
      case "uebergabe":
        return { html: buildUebergabeblattHTML(), datei: `werkstatt-uebergabe-${todayKey}.html` };
      case "stoer-monat": {
        // Jahr = laufendes Jahr; die Monats-Kacheln im Dialog wählen den Monat.
        const jahrHeute = Number(todayKey.slice(0, 4));
        return { html: buildStoerMonatsblattHTML(jahrHeute, druckMonat),
                 datei: `werkstatt-stoerungen-monat-${jahrHeute}-${pad(druckMonat + 1)}.html` };
      }
      case "jahreskalender":
        return { html: buildJahresKalenderHTML(year, druckUmfang), datei: `werkstatt-jahreskalender-${kurz}-${year}.html` };
      case "monatsblatt":
        return { html: buildMonatsKalenderHTML(year, druckMonat, druckUmfang),
                 datei: `werkstatt-monatskalender-${kurz}-${year}-${pad(druckMonat + 1)}.html` };
      case "diagramm-monat":
        return { html: buildDiagrammMonatHTML(year, druckMonat, druckUmfang),
                 datei: `werkstatt-monatsdiagramm-${kurz}-${year}-${pad(druckMonat + 1)}.html` };
      case "diagramm-jahr":
        return { html: buildDiagrammJahrHTML(year, druckUmfang),
                 datei: `werkstatt-jahresdiagramm-${kurz}-${year}.html` };
      default:
        return { html: buildPrintDocument(),
                 datei: `werkstatt-kalender-${view.toLowerCase()}-${year}${view === "MONAT" ? "-" + pad(month + 1) : ""}.html` };
    }
  };

  const oeffneDruckWahl = () => {
    const angebot = druckAngebot();
    if (!angebot) return;
    // Beim Wechsel des Bereichs mit der ersten Möglichkeit anfangen - sonst
    // stünde im Schichtplan noch die Wahl aus der Auswertung. Innerhalb
    // desselben Bereichs bleibt die zuletzt getroffene Wahl stehen.
    if (angebot.bereich !== druckBereich || !angebot.optionen.some((o) => o.id === druckOption)) {
      setDruckOption(angebot.optionen[0].id);
      setDruckBereich(angebot.bereich);
    }
    setDruckWahlOffen(true);
  };

  const handleDruckWahl = () => {
    setDruckWahlOffen(false);
    const { html, datei } = druckVorlage(druckOption);
    openPrintWindow(html, datei);
  };

  /* Dieselbe Vorlage OHNE Druckdialog öffnen - zum Zeigen am Monitor in der
     Besprechung. Wer eine PDF will, druckt aus diesem Fenster heraus und
     wählt „Als PDF speichern" - dafür braucht es keinen eigenen Weg. */
  const handleDruckAnzeige = () => {
    setDruckWahlOffen(false);
    const { html } = druckVorlage(druckOption);
    let w = null;
    try { w = window.open("", "_blank"); } catch (e) { w = null; }
    if (!w) { setErr("Zum Anzeigen bitte Pop-ups für diese Seite erlauben."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  };

  /* ---- Tastatur-Kürzel (Kreativ-Runde G7) ----
     Greifen NIE, wenn ein Eingabefeld den Fokus hat oder ein Fenster offen
     ist (außer ? und Esc für den Spickzettel) - Tippen bleibt Tippen. Der
     Handler liest über eine Ref immer den frischen Stand, statt sich bei
     jedem Render neu anzumelden. */
  const tastenKontext = useRef({});
  tastenKontext.current = {
    dialogOffen: !!(modal || stoerModal || druckWahlOffen || registerItem || nachbestellOffen || kuerzelOffen),
    nurKuerzel: kuerzelOffen,
    nacht: () => setNachtModus((n) => !n),
    drucken: () => { if (druckAngebot()) oeffneDruckWahl(); },
    heute: () => {
      if (view === "MONAT") { setMonth(today.getMonth()); setYear(today.getFullYear()); }
      else if (view === "JAHR") setYear(today.getFullYear());
    },
    werkstatt: () => { setView("COCKPIT"); setCockpitTab("UEBERSICHT"); },
    tpm: () => setView("TPMINFO"),
    stoerung: () => {
      if (!stoerDarfSchreiben) return;
      setView("COCKPIT");
      setCockpitTab("STOERUNGEN");
      setSDraft({ date: todayKey, schicht: "", anlage: "", anlagenteil: "", gewerk: "", fehlerart: "", stoerung: "", ursache: "", getan: "", nochZuTun: "", ersatzteile: "", nachbestellt: false, ausfallzeit: "", behobenAt: "", status: "", melder: localStorage.getItem("werkstatt-kalender-name") || "" });
      setStoerModal({ mode: "add" });
    },
    spickzettel: () => setKuerzelOffen((o) => !o),
    zu: () => setKuerzelOffen(false),
  };
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ziel = e.target;
      const tag = ziel && ziel.tagName ? ziel.tagName.toUpperCase() : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (ziel && ziel.isContentEditable)) return;
      const k = tastenKontext.current;
      if (e.key === "?") { e.preventDefault(); k.spickzettel(); return; }
      if (e.key === "Escape") { k.zu(); return; }
      if (k.dialogOffen) return;
      const taste = String(e.key || "").toLowerCase();
      if (taste === "n") k.nacht();
      else if (taste === "d") k.drucken();
      else if (taste === "h") k.heute();
      else if (taste === "w") k.werkstatt();
      else if (taste === "t") k.tpm();
      else if (taste === "s") k.stoerung();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* Kennkarte der verbundenen Datei. Zwei Dateien gleichen Namens sind am
     Namen nicht zu unterscheiden - der Browser gibt keinen Pfad heraus. Was
     ihn ersetzt: Zahl der Einträge, Größe, letzte Änderung. Am 03.08. hätte
     „0 Einträge" sofort gestutzt, wo „werkstatt-kalender-daten.json" beruhigt
     hat. */
  const dateiKennkarte = (info) => {
    if (!info || !info.name) return "";
    const teile = [info.pfad || info.name];
    if (info.eintraege !== null && info.eintraege !== undefined) {
      teile.push(info.eintraege === 0 ? "KEINE Einträge" : `${info.eintraege} Einträge`);
    }
    if (info.groesse !== null && info.groesse !== undefined) {
      teile.push(info.groesse >= 1024 * 1024
        ? `${(info.groesse / 1024 / 1024).toFixed(1)} MB`
        : `${Math.max(1, Math.round(info.groesse / 1024))} KB`);
    }
    if (info.geaendert) {
      teile.push("geändert " + new Date(info.geaendert).toLocaleString("de-DE",
        { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }));
    }
    return teile.join(" · ");
  };

  const printPrefix = filter === "ALL" ? "Werkstatt-Cockpit" : CATS[filter].full;
  const printSuffix = view === "JAHR" ? `Jahresübersicht ${year}` : `Monatsübersicht ${MONTHS[month]} ${year}`;

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

      {/* Kopfzeile. Die Klammer außen herum hält Menüleiste und Linkstreifen
          zusammen oben fest: Wäre nur die dunkle Leiste klebend, schöbe sich
          der Streifen beim Scrollen darunter weg - und die Links wären genau
          dann fort, wenn man weiter unten in einer Liste steht. */}
      <div className="no-print sticky top-0 z-10">
      <div
        className="px-4 py-3 flex flex-wrap items-center gap-3 justify-between"
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
            {/* G1: Der Name gehört der Werkstatt - einstellbar im ⚙. */}
            <div className="font-black text-lg tracking-tight uppercase text-white">{appName}</div>
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
                    className="px-3 py-1.5 text-xs font-black uppercase tracking-wide inline-flex items-center"
                    style={{ backgroundColor: active ? "#C97A2B" : "transparent", color: "white" }}
                  >
                    {label}
                    {/* Das rote Überfällig-Badge stand hier - auf Robertos
                        Wunsch vom 20.08. entfernt (Liegengebliebenes steht
                        weiter in der TPM-Übersicht und im Termin-Archiv). */}
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
                {/* Seit dem 18.08. ohne eigenen Plan-Reiter: Der Plan-Kalender
                    steckt in der Auswertung (Robertos Ansage). Leser bekommen
                    dafür die Auswertung - sonst verlören sie den Plan ganz. */}
                {(readerMode
                  ? [["TPMINFO", "Übersicht"], ["AUSWERTUNG", "Plan"]]
                  : [["TPMINFO", "Übersicht"], ["AUSWERTUNG", "Plan"], ["REGISTER", "Register"]]
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
          {view === "MONAT" ? (
            <>
              <button onClick={() => changeMonth(-1)} className="p-1.5 rounded hover:opacity-75 transition-opacity" aria-label="Vorheriger Monat">
                <ChevronLeft size={18} />
              </button>
              <div className="font-mono text-sm w-36 text-center">{MONTHS[month]} {year}</div>
              <button onClick={() => changeMonth(1)} className="p-1.5 rounded hover:opacity-75 transition-opacity" aria-label="Nächster Monat">
                <ChevronRight size={18} />
              </button>
              {/* Zurück zum Heute (QoL 19.08.): erscheint nur, wenn man
                  weggeblättert hat - sonst wäre er ein toter Knopf. */}
              {(month !== today.getMonth() || year !== today.getFullYear()) && (
                <button
                  onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }}
                  className="ml-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide border"
                  style={{ borderColor: "rgba(255,255,255,0.55)", backgroundColor: "rgba(255,255,255,0.12)", color: "#fff" }}
                >
                  Heute
                </button>
              )}
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
              {year !== today.getFullYear() && (
                <button
                  onClick={() => setYear(today.getFullYear())}
                  className="ml-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide border"
                  style={{ borderColor: "rgba(255,255,255,0.55)", backgroundColor: "rgba(255,255,255,0.12)", color: "#fff" }}
                >
                  Heute
                </button>
              )}
            </>
          ) : view === "REGISTER" ? (
            <div className="font-mono text-sm px-2">Alle Termine</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImportFile} />
          {druckAngebot() && (
            <button
              /* Ein Knopf an einer Stelle - oben rechts, in jedem Bereich, in
                 dem es etwas zu drucken gibt. Was genau, wird im Dialog
                 gewählt; vorher lagen die Knöpfe in den Werkzeugleisten der
                 einzelnen Reiter verstreut. */
              onClick={oeffneDruckWahl}
              className="flex items-center gap-2 text-white px-3 py-1.5 rounded font-bold text-sm uppercase tracking-wide hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#C97A2B" }}
              aria-label="Drucken"
            >
              <Printer size={16} /> Drucken
            </button>
          )}
          {/* Nachtschicht-Modus (QoL 19.08., Robertos Ansage: über einen
              Auge-Knopf oben rechts) - auch für Leser, die Wahl ist rein
              örtlich am Gerät. */}
          <button
            onClick={() => setNachtModus((n) => !n)}
            className="flex items-center text-white p-1.5 rounded hover:opacity-90 transition-opacity"
            style={{ backgroundColor: nachtModus ? "#C97A2B" : "#4B5259" }}
            title={nachtModus ? "Nachtschicht-Modus ausschalten" : "Nachtschicht-Modus (dunkle Darstellung)"}
            aria-label="Nachtschicht-Modus"
            aria-pressed={nachtModus}
          >
            <Eye size={14} />
          </button>
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
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setExportMenuOffen((o) => !o)}
                  className="flex items-center text-white p-1.5 rounded hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: "#2F6690" }}
                  title="Herausgabe: JSON-Sicherung oder CSV für Excel"
                  aria-label="Export"
                >
                  <Download size={14} />
                </button>
                {/* Herausgabe-Menü (QoL 19.08., Runde 3): JSON wie bisher,
                    dazu CSV für Excel - der Rollout-Test mahnte das an. */}
                {exportMenuOffen && (
                  <>
                    <div style={{ position: "fixed", inset: 0, zIndex: 59 }} onClick={() => setExportMenuOffen(false)} />
                    <div className="no-print" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 60, backgroundColor: "white", borderRadius: "10px", padding: "10px", width: "310px", boxShadow: "0 12px 40px rgba(0,0,0,0.3)", border: "1px solid #E2E4E7" }}>
                      {[
                        ["Alles als JSON", "vollständige Datensicherung – wie bisher", () => exportData(), "#22262B"],
                        ["Termine als CSV", "Datum · Anlage · TPM/R+I · Status · Notiz – für Excel", () => exportTermineCsv(), "#1F7A3D"],
                        ["Störungen als CSV", "Nr. · Anlage · Störung · Maßnahme · Ausfall · Melder", () => exportStoerungenCsv(), "#1F7A3D"],
                      ].map(([titel, unter, mach, farbe]) => (
                        <button
                          key={titel}
                          onClick={() => { setExportMenuOffen(false); mach(); }}
                          className="w-full text-left rounded-lg px-3 py-2 mb-1 last:mb-0 border hover:bg-slate-50"
                          style={{ borderColor: "#E2E4E7" }}
                        >
                          <span className="block text-sm font-extrabold" style={{ color: farbe }}>{titel}</span>
                          <span className="block text-xs" style={{ color: "#8A9099" }}>{unter}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          {/* Abmelden (Benutzergruppen, Robertos Wunsch vom 10.08.): sichtbar
              für JEDEN Angemeldeten - gerade Leser und Bearbeiter haben sonst
              keinen bequemen Weg, den Benutzer zu wechseln oder an einem
              Gerät eine andere Datei zu verbinden. Der Klick meldet ab; im
              Anmelde-Fenster gibt es dann auch den Weg zur Datei-Verbindung. */}
          {benutzerAktiv && meinBenutzer && (
            <button
              onClick={abmelden}
              className="flex items-center gap-1 text-white p-1.5 rounded hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#4B5259" }}
              title={`Abmelden (angemeldet als ${meinBenutzer.name})`}
              aria-label="Abmelden"
            >
              <LogOut size={14} />
            </button>
          )}
          {/* Gegenstück für „Nur ansehen": Wer ohne Anmeldung schaut, kommt
              hier jederzeit zurück zum Anmelde-Dialog. */}
          {benutzerAktiv && !meinBenutzer && (
            <button
              onClick={() => setAnmeldungZu(false)}
              className="flex items-center gap-1.5 text-white px-2 py-1.5 rounded hover:opacity-90 transition-opacity text-xs font-bold"
              style={{ backgroundColor: "#2F6690" }}
              title="Anmelden (zum Bearbeiten)"
              aria-label="Benutzer anmelden"
            >
              <LogIn size={14} /> Anmelden
            </button>
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
                ? `Gemeinsame Datei verbunden\n${dateiKennkarte(sharedFile.fileInfo())}${shareState.mode === "read" ? "\n(nur ansehen)" : ""}`
                : "Gemeinsame Datei einrichten (Teilen)"}
              aria-label="Gemeinsame Datei"
            >
              <FolderOpen size={14} />
            </button>
          </>
          )}
        </div>
      </div>

      {/* Linkstreifen: eine Zeile unter der Menüleiste, und zwar NUR auf der
          Übersicht. Vorher stand er in jedem Reiter und hat dort Platz und
          Aufmerksamkeit gekostet, ohne zur Arbeit im Reiter zu gehören - die
          Übersicht ist die Startseite, dort holt man sich seine Dokumente ab.
          Nur-Leser sehen ihn gar nicht (nicht ausgegraut, sondern nicht
          vorhanden) - die Sammlung ist Arbeitsmittel der Bearbeiter.
          Ein Klick auf einen Chip öffnet, ohne vorher aufklappen zu müssen;
          Anlegen und Sortieren stecken im Feld hinter „Links". */}
      {!readerMode && view === "COCKPIT" && cockpitTab === "UEBERSICHT" && (
        <div style={{ backgroundColor: "#2C3137", borderTop: "1px solid rgba(255,255,255,0.08)", position: "relative" }}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5">
            <button
              onClick={schalteLinks}
              aria-label="Links & Dokumente"
              aria-expanded={linksOffen}
              title={linksOffen ? "Linkliste schließen" : "Links anlegen, ändern, sortieren"}
              className="flex items-center gap-1.5 shrink-0"
            >
              <span style={{ fontSize: "0.72rem" }}>🔗</span>
              <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: linksOffen ? "#fff" : "#B7BEC6" }}>Links</span>
              {/* Das Dreieck dreht sich - dieselbe Sprache wie im Schichtbuch */}
              <span style={{ color: "#8A9099", fontSize: "0.58rem", display: "inline-block", transform: linksOffen ? "rotate(90deg)" : "none", transition: "transform .15s ease" }}>▶</span>
            </button>
            {/* Kürzel-Umschalter: bestimmt, wessen Sammlung im Streifen steht */}
            <div className="flex items-center gap-1 shrink-0">
              {links.inhaber.map((k) => {
                const an = k === linkInhaberAktiv;
                return (
                  <button
                    key={k}
                    onClick={() => waehleLinkInhaber(k)}
                    className="rounded font-extrabold"
                    style={{
                      fontSize: "0.6rem", letterSpacing: "0.3px", padding: "2px 7px",
                      backgroundColor: an ? "#C97A2B" : "rgba(255,255,255,0.08)",
                      color: an ? "#fff" : "#B7BEC6",
                    }}
                    title={`Links von ${k} anzeigen`}
                  >{k}</button>
                );
              })}
            </div>
            <span className="shrink-0" style={{ width: "1px", height: "14px", backgroundColor: "rgba(255,255,255,0.14)" }} />
            {linkListe.length === 0 ? (
              <span className="text-[11px]" style={{ color: "#8A9099" }}>
                Noch keine Links für {linkInhaberAktiv} – auf <b style={{ color: "#B7BEC6" }}>🔗 Links</b> klicken und anlegen.
              </span>
            ) : linkListe.map((l) => {
              const meldung = linkKopiert && linkKopiert.id === l.id ? linkKopiert.text : "";
              return (
                <button
                  key={l.id}
                  onClick={() => oeffneLink(l)}
                  className="inline-flex items-center gap-1.5 rounded shrink-0"
                  style={{
                    padding: "2px 8px 2px 6px", maxWidth: "230px",
                    backgroundColor: meldung ? "rgba(201,122,43,0.22)" : "rgba(255,255,255,0.07)",
                  }}
                  title={linkArt(l.ziel) === "oeffnen" ? `Im Browser öffnen: ${linkAdresse(l.ziel)}` : `Öffnen: ${l.ziel}`}
                >
                  <span style={{ fontSize: "0.8rem", lineHeight: 1.4 }}>{alsSymbol(l.symbol)}</span>
                  <span className="text-[11px] font-semibold" style={{ color: "#E7EAEE", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                </button>
              );
            })}
            {/* Rückmeldung zum letzten Klick. Ohne sie klickt man ins Leere:
                die Datei geht in einem anderen Fenster auf, im Cockpit sieht
                es aus, als sei nichts geschehen. */}
            {linkKopiert && linkKopiert.text && (
              <span className="text-[11px] font-bold shrink-0" style={{ color: linkKopiert.text.startsWith("✗") ? "#E8A9A3" : "#8FCBA5" }}>
                {linkKopiert.text}
              </span>
            )}
          </div>

          {linksOffen && (
              <div className="px-4 pb-3" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20 }}>
                <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "white", border: "1px solid #E7EAEE", maxWidth: "660px", boxShadow: "0 10px 28px rgba(0,0,0,0.28)" }}>
                <div className="flex items-center gap-2 px-1 pb-1">
                  <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#22262B" }}>Sammlung {linkInhaberAktiv}</span>
                  <span className="inline-flex items-center justify-center rounded-full text-white font-bold" style={{ minWidth: "18px", height: "18px", padding: "0 6px", backgroundColor: "#C97A2B", fontSize: "0.62rem" }}>{linkListe.length}</span>
                  <button
                    onClick={() => setLinkEntwurf({ name: "", ziel: "", symbol: "🔗" })}
                    className="ml-auto text-xs font-bold"
                    style={{ color: "#C97A2B" }}
                  >＋ Link</button>
                </div>
                <div style={{ maxWidth: "640px" }}>
                  {linkListe.length === 0 && !linkEntwurf && (
                    <div className="px-2 py-3 text-xs" style={{ color: "#8A9099" }}>
                      Noch keine Links für <b>{linkInhaberAktiv}</b>. Über <b>＋ Link</b> den ersten anlegen.
                    </div>
                  )}
                  {linkListe.map((l, i) => {
                    const art = linkArt(l.ziel);
                    const meldung = linkKopiert && linkKopiert.id === l.id ? linkKopiert.text : "";
                    return (
                      <div key={l.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-slate-50" style={{ marginBottom: "2px" }}>
                        <button onClick={() => oeffneLink(l)} className="flex items-center gap-2.5 flex-1 text-left" style={{ minWidth: 0 }}
                          title={art === "oeffnen" ? "Im Browser öffnen" : "Öffnen"}>
                          <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: "26px", height: "26px", borderRadius: "8px", backgroundColor: "#F1F4F7", fontSize: "0.9rem" }}>{alsSymbol(l.symbol)}</span>
                          <span style={{ minWidth: 0 }}>
                            <span className="block font-semibold" style={{ fontSize: "0.85rem", color: "#22262B" }}>{l.name}</span>
                            <span className="block" style={{ fontSize: "0.72rem", color: meldung ? (meldung.startsWith("✗") ? "#B23A34" : "#2F7D4F") : "#8A9099", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {meldung || l.ziel}
                            </span>
                          </span>
                        </button>
                        {/* Nur Pfeile, wenn es etwas zu tauschen gibt */}
                        {linkListe.length > 1 && (
                          <span className="flex flex-col flex-shrink-0" style={{ gap: "3px", lineHeight: 1 }}>
                            <button onClick={() => verschiebeLink(l.id, -1)} disabled={i === 0} title="nach oben"
                              style={{ fontSize: "0.58rem", lineHeight: 1, color: i === 0 ? "#DDE2E7" : "#8A9099", padding: "0 4px" }}>▲</button>
                            <button onClick={() => verschiebeLink(l.id, 1)} disabled={i === linkListe.length - 1} title="nach unten"
                              style={{ fontSize: "0.58rem", lineHeight: 1, color: i === linkListe.length - 1 ? "#DDE2E7" : "#8A9099", padding: "0 4px" }}>▼</button>
                          </span>
                        )}
                        <button onClick={() => setLinkEntwurf({ ...l })} className="flex-shrink-0" title="bearbeiten"
                          style={{ fontSize: "0.8rem", color: "#8A9099", padding: "0 4px" }}>✎</button>
                      </div>
                    );
                  })}

                  {linkEntwurf && (
                    <div className="rounded-lg px-3 py-3 mt-1" style={{ backgroundColor: "#F7F9FA", border: "1px solid #E7EAEE" }}>
                      <div className="text-xs font-extrabold uppercase tracking-wide mb-2" style={{ color: "#6B7480" }}>
                        {linkEntwurf.id ? "Link ändern" : `Neuer Link für ${linkInhaberAktiv}`}
                      </div>
                      <div className="flex gap-2 mb-2">
                        <input
                          value={linkEntwurf.symbol}
                          onChange={(e) => setLinkEntwurf({ ...linkEntwurf, symbol: e.target.value })}
                          className="rounded border px-2 py-1.5 text-center"
                          style={{ width: "48px", borderColor: "#D8DEE4", fontSize: "0.95rem" }}
                          title="Symbol"
                        />
                        <input
                          value={linkEntwurf.name}
                          onChange={(e) => setLinkEntwurf({ ...linkEntwurf, name: e.target.value })}
                          placeholder="Bezeichnung, z. B. Betriebsanleitung Presse 3"
                          className="rounded border px-2.5 py-1.5 flex-1"
                          style={{ borderColor: "#D8DEE4", fontSize: "0.85rem" }}
                        />
                      </div>
                      {/* Symbol-Vorschläge, nach Themen geordnet: schneller als das
                          Emoji-Fenster von Windows und auf die Werkstatt gemünzt.
                          Wer etwas anderes will, tippt es links ins Feld.
                          Die letzte Reihe ist zum Kennzeichnen da - Halle 1,
                          Linie 3, roter Bereich: Zahlen und Farbpunkte
                          unterscheiden gleichartige Links auf einen Blick,
                          wofür es sonst kein passendes Bild gibt. */}
                      <div className="mb-2">
                        {[
                          ["Unterlagen", ["🔗", "📘", "📕", "📗", "📙", "📄", "📑", "📃", "📁", "🗂", "📇", "📝", "✏", "📌", "🖨", "📷", "🗺", "🔖"]],
                          ["Werkstatt", ["🔧", "🔩", "⚙", "🛠", "🪛", "🔨", "🪚", "✂", "📏", "📐", "⛓", "🧰", "🧲", "🪜", "🧱", "🪣", "🧹", "🔬"]],
                          ["Technik", ["⚡", "🔌", "💡", "🔦", "🔥", "💧", "🌡", "🧪", "🛢", "🌀", "❄", "📡", "🔋", "🖥", "⌨", "🖱", "📠", "🎛"]],
                          ["Anlagen", ["🏭", "🏗", "🚜", "🛗", "🛞", "🏢", "🏬", "🚪", "🪟", "🧊", "🌬", "🚿", "⛽", "♻", "🪫", "🔔", "🪝", "⏱"]],
                          ["Betrieb", ["🛒", "📞", "✉", "🕐", "⏰", "📅", "🗓", "📊", "📈", "💶", "🚚", "🚛", "📦", "🏷", "👷", "🧑‍🔧", "👥", "💬"]],
                          ["Sicherheit", ["📋", "⚠", "🧯", "🚨", "🦺", "🥽", "🧤", "🥾", "🪖", "🚑", "🩹", "🔒", "🔑", "✅", "❌", "🚫", "☣", "☢"]],
                          ["Kennzeichen", ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "🅰", "🅱", "⭐", "❗", "❓", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "🟤"]],
                        ].map(([gruppe, symbole]) => (
                          // Raster statt frei umbrechender Zeile: Emoji sind
                          // unterschiedlich breit, und mit flex-wrap rutschte
                          // je nach Reihe eines in die nächste Zeile - die
                          // Reihen standen dann verschieden hoch da. Im
                          // Raster liegt jedes Symbol in einer festen Spalte.
                          <div key={gruppe} className="flex items-center gap-1" style={{ marginBottom: "2px" }}>
                            <span style={{ fontSize: "0.62rem", color: "#A2AAB3", width: "62px", flex: "0 0 auto" }}>{gruppe}</span>
                            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${symbole.length}, minmax(0, 1fr))` }}>
                              {symbole.map((s) => (
                                <button key={s} onClick={() => setLinkEntwurf({ ...linkEntwurf, symbol: s })}
                                  title={"Symbol " + alsSymbol(s)}
                                  className="rounded" style={{ fontSize: "0.95rem", lineHeight: 1.3, padding: "2px 0", backgroundColor: alsSymbol(linkEntwurf.symbol) === alsSymbol(s) ? "#E7EEF4" : "transparent" }}>{alsSymbol(s)}</button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <input
                        value={linkEntwurf.ziel}
                        onChange={(e) => setLinkEntwurf({ ...linkEntwurf, ziel: e.target.value })}
                        placeholder="Adresse oder Pfad, z. B. intranet.firma.de/teile oder \\server\Ordner\Datei.pdf"
                        className="rounded border px-2.5 py-1.5 w-full"
                        style={{ borderColor: "#D8DEE4", fontSize: "0.85rem", fontFamily: "ui-monospace, monospace" }}
                      />
                      {/* Vorher sagen, was passieren wird - nicht erst beim Klick */}
                      {linkEntwurf.ziel.trim() && (
                        <div className="mt-1.5" style={{ fontSize: "0.72rem", color: "#6B7480" }}>
                          {linkArt(linkEntwurf.ziel) === "oeffnen"
                            ? <>öffnet sich im Browser: <span style={{ fontFamily: "ui-monospace, monospace" }}>{linkAdresse(linkEntwurf.ziel)}</span></>
                            : ueberDienst()
                              ? "Laufwerks- oder Netzwerkpfad: Der Klick öffnet die Datei über das Cockpit-Fenster. Ist es geschlossen, wird der Pfad stattdessen kopiert."
                              : "Laufwerks- oder Netzwerkpfad: Ein Klick legt ihn in die Zwischenablage, im Explorer einfügen. Direkt öffnen geht nur, wenn das Cockpit über das Desktop-Symbol gestartet wurde."}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={speichereLinkEntwurf}
                          disabled={!linkEntwurf.name.trim() || !linkEntwurf.ziel.trim()}
                          className="rounded px-3 py-1.5 font-bold text-white"
                          style={{ backgroundColor: (!linkEntwurf.name.trim() || !linkEntwurf.ziel.trim()) ? "#C3C7CB" : "#2F6690", fontSize: "0.8rem" }}>
                          Speichern
                        </button>
                        <button onClick={() => setLinkEntwurf(null)} className="rounded px-3 py-1.5 font-bold border"
                          style={{ borderColor: "#D8DEE4", color: "#5B6572", fontSize: "0.8rem" }}>Abbrechen</button>
                        {linkEntwurf.id && (
                          <button onClick={() => loescheLink(linkEntwurf.id)} className="ml-auto rounded px-3 py-1.5 font-bold border"
                            style={{ borderColor: "#E7B9B3", color: "#B23A34", fontSize: "0.8rem" }}>Löschen</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </div>
          )}
        </div>
      )}
      </div>

      {/* Hinweisleisten zur gemeinsamen Datei */}
      {/* Der gemerkte Verweis ist unbrauchbar: Der Browser gibt ihn weder frei
          noch lehnt er ihn ab - er antwortet gar nicht. Gemessen mit Chrome 147
          auf einer über file:// geöffneten Seite. Hier hilft kein Verbinden-Klick,
          nur ein neues Auswählen der Datei. Früher blieb die App an dieser
          Stelle stumm stehen: graues Ordnersymbol, keine Meldung, kein Knopf. */}
      {shareState.status === "verweis-tot" && (
        <div className="no-print px-4 py-2 flex flex-wrap items-center gap-3 text-xs font-bold" style={{ backgroundColor: "#FCE4E4", color: "#A33A3A" }}>
          <span>Dieser Browser gibt die gemerkte Datei „{shareState.name}" nicht mehr frei. Bitte einmal auswählen.</span>
          <button onClick={() => connectShared()} className="px-2.5 py-1 rounded text-white" style={{ backgroundColor: "#A33A3A" }}>
            Datei auswählen …
          </button>
          <button
            onClick={verbindeMitSchreibrecht}
            className="px-2.5 py-1 rounded border"
            style={{ borderColor: "#A33A3A", color: "#A33A3A", backgroundColor: "#fff" }}
            title="Öffnet den Speichern-Dialog. Dieselbe Datei auswählen und „Ersetzen“ bestätigen – der Inhalt bleibt erhalten, er wird vorher gelesen und zusammengeführt."
          >
            Mit Schreibrecht verbinden …
          </button>
          <span className="font-normal">Tipp: Den Tab offen lassen – das Cockpit holt Änderungen von allein alle 30 Sekunden, Neuladen ist nicht nötig.</span>
        </div>
      )}
      {shareState.status === "needs-permission" && (
        <div className="no-print px-4 py-2 flex items-center gap-3 text-xs font-bold" style={{ backgroundColor: "#FCEFD9", color: "#B8791F" }}>
          <span>Gemeinsame Datei „{shareState.name}" ist nach dem Browser-Neustart getrennt.</span>
          <button onClick={reconnectShared} className="px-2.5 py-1 rounded text-white" style={{ backgroundColor: "#B8791F" }}>
            Jetzt verbinden
          </button>
          {verbindenBlockiert && (
            <button
              onClick={verbindeMitSchreibrecht}
              className="px-2.5 py-1 rounded border"
              style={{ borderColor: "#B8791F", color: "#8A5320", backgroundColor: "#fff" }}
              title="Öffnet den Speichern-Dialog. Dieselbe Datei auswählen und „Ersetzen“ bestätigen – der Inhalt bleibt erhalten, er wird vorher gelesen und zusammengeführt."
            >
              Mit Schreibrecht verbinden …
            </button>
          )}
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
              <span>⚠ Dieser Browser hat den Schreibzugriff auf die Datei nicht erteilt.</span>
              {/* Zwei Wege, in dieser Reihenfolge:
                  1. Nachfragen. Das ist der normale Weg und kostet einen Klick.
                  2. Über den Speichern-Dialog verbinden. Manche Browser lehnen
                     das Nachfragen grundsätzlich ab (z. B. wenn die App über
                     file:// geöffnet wird) - dann hilft nur Weg 2, denn der
                     Speichern-Dialog vergibt Schreibrecht ohne Nachfrage. */}
              <button
                onClick={async () => {
                  try {
                    const st = await sharedFile.retryWrite();
                    setShareState(st);
                    setErr(st.mode === "read"
                      ? `Schreibzugriff weiterhin nicht möglich (${sharedFile.getLastWriteError() || "unbekannter Grund"}). Prüfen: Datei schreibgeschützt (Explorer → Eigenschaften)? Gerade in einem anderen Programm geöffnet? Ordner ohne Schreibrechte?`
                      : null);
                  } catch (e2) {
                    const u = sharedFile.umgebung();
                    const roh = e2 && e2.message ? e2.message : "Erneuter Versuch fehlgeschlagen.";
                    setErr(/Not allowed to request permissions/.test(roh)
                      ? `Dieser Browser erlaubt das Nachfragen nach Schreibrecht grundsätzlich nicht (Adresse: ${u.protokoll}, sicherer Kontext: ${u.sichererKontext ? "ja" : "nein"}). Nimm den Knopf „Mit Schreibrecht verbinden …“ – der Speichern-Dialog vergibt das Recht ohne Nachfrage.`
                      : "Gemeinsame Datei: " + roh);
                  }
                }}
                className="px-3 py-1 rounded text-white"
                style={{ backgroundColor: "#B8791F" }}
              >
                Schreibzugriff erlauben
              </button>
              <button
                onClick={async () => {
                  try {
                    await sharedFile.pickWritable();
                    setShareState({ status: "connected", name: sharedFile.fileName(), mode: sharedFile.canWrite() ? "readwrite" : "read" });
                    setErr(null);
                  } catch (e2) {
                    if (e2 && e2.name === "AbortError") return;
                    setErr("Gemeinsame Datei: " + (e2 && e2.message ? e2.message : "Verbinden hat nicht geklappt."));
                  }
                }}
                className="px-3 py-1 rounded border"
                style={{ borderColor: "#B8791F", color: "#8A5320", backgroundColor: "#fff" }}
                title="Öffnet den Speichern-Dialog. Dieselbe Datei auswählen und „Ersetzen“ bestätigen – der Inhalt bleibt erhalten, er wird vorher gelesen und zusammengeführt."
              >
                Mit Schreibrecht verbinden …
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
          {(rettungsModus || istProgramm) && (
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
                      ? `Schreibzugriff weiterhin nicht möglich (${sharedFile.getLastWriteError() || "unbekannter Grund"}). Prüfen: Datei schreibgeschützt (Explorer → Eigenschaften)? Gerade in einem anderen Programm geöffnet? Ordner ohne Schreibrechte? Ordner vom Virenschutz (Defender) geschützt?`
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
              {/* Der Datei-Wechsel bleibt auch im Programm hinter dem
                  Rettungs-Modus - er ist der Knopf, der am 03.08. in die
                  falsche Datei geführt hätte. */}
              {rettungsModus && (
                <button
                  onClick={() => setShareOpen(true)}
                  className="px-2.5 py-1 rounded border"
                  style={{ borderColor: "#2F6690", color: "#2F6690", backgroundColor: "white" }}
                >
                  Andere Datei wählen …
                </button>
              )}
            </>
          )}
        </div>
      )}
      {/* Schreibschutz auf BENUTZER-Ebene: Die Datei dürfte schreiben, aber
          die Rolle (Leser) bzw. die fehlende Anmeldung sagt Nur-Lesen. Ohne
          diese Leiste sähe der Betroffene nur verschwundene Knöpfe und wüsste
          nicht, warum - dieselbe ehrliche Ansage wie beim Datei-Schreibschutz,
          nur mit dem Grund und dem direkten Weg zur Anmeldung. */}
      {shareState.status === "connected" && shareState.mode !== "read" && benutzerAktiv && !benutzerDarfSchreiben && (
        <div className="no-print px-4 py-2 flex flex-wrap items-center gap-3 text-xs font-bold" style={{ backgroundColor: "#E5F0F8", color: "#2F6690" }}>
          <span>
            🔒 Schreibschutz – {meinBenutzer
              ? <>angemeldet als <strong>{meinBenutzer.name}</strong> (Leser): dieser Rechner zeigt den gemeinsamen Stand nur an.</>
              : "ohne Anmeldung zeigt dieser Rechner den gemeinsamen Stand nur an."}
          </span>
          {!meinBenutzer && (
            <button onClick={() => setAnmeldungZu(false)} className="px-2.5 py-1 rounded text-white" style={{ backgroundColor: "#2F6690" }}>
              Anmelden …
            </button>
          )}
          <span className="font-normal" style={{ color: "#5B87AB" }}>Aktualisiert: <SyncAnzeige style={{ color: "#5B87AB" }} /></span>
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

      {/* Filter-Leiste: Seit dem 18.08. nur noch fürs Register - im Plan-Reiter
          sitzen Monat/Jahr und der Filter in der Auswertungs-Leiste unten
          (Robertos Ansage: Plan oben, Auswertung als Ausklappleiste darunter). */}
      {view === "REGISTER" && (
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
        </div>
      )}

      {/* Falsche Uhrzeit: bleibender Hinweis, keine Meldung, die die nächste
          Erfolgsmeldung wegräumt. Der Datenverlust daraus ist behoben - eine
          Änderung trägt jetzt immer einen größeren Zeitstempel als die Fassung,
          auf der sie beruht. Falsch bleiben aber alle Uhrzeiten, auch im
          Prüfnachweis, und das kann nur ein Mensch richten. */}
      {sharedFile.uhrVersatz() > 0 && (
        <div className="no-print mx-4 mt-2 rounded px-3 py-2 text-xs"
             style={{ backgroundColor: "#FBF3DA", border: "1px solid #E7D9A8", color: "#8A5320" }}>
          <strong>⏰ Die Uhrzeit dieses Rechners stimmt vermutlich nicht.</strong>{" "}
          In der gemeinsamen Datei stehen Zeitangaben, die {sharedFile.uhrVersatz()} Minuten in der
          Zukunft liegen. Entweder geht die Uhr hier nach oder die eines anderen Rechners vor.
          Deine Einträge gehen dadurch nicht verloren – aber jede Uhrzeit in der App und im
          Prüfnachweis ist so lange falsch. Bitte die Windows-Zeit prüfen lassen.
        </div>
      )}
      {err && <div className="no-print mx-4 mt-2 text-xs text-red-600">{err}</div>}

      {/* Programm-Update: Im Update-Ordner liegt eine neuere App-HTML. Ein
          Klick übernimmt sie und lädt neu - die Daten sind davon unberührt,
          sie liegen in der gemeinsamen Datei. Bleibender Hinweis, kein
          Popup-Fenster: Wer mitten in einer Eingabe steckt, klickt später. */}
      {programmUpdate && !programmUpdate.fehler && (
        <div className="no-print mx-4 mt-2 rounded px-3 py-2 text-xs flex items-center gap-3 flex-wrap"
             style={{ backgroundColor: "#EAF3EC", border: "1px solid #BFDCC6", color: "#1F5A31" }}>
          <span>
            <strong>⬆ Neue Version verfügbar</strong>
            {programmUpdate.name ? <> – {programmUpdate.name}</> : null}
            {programmUpdate.geaendert ? <> ({new Date(programmUpdate.geaendert).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})</> : null}
          </span>
          <button
            onClick={async () => {
              setProgrammUpdate({ laeuft: true });
              try {
                const r = await window.__werkstattDesktop.updateUebernehmen();
                // Bei Erfolg lädt der Rahmen die Seite neu - diese Zeile
                // sieht man nur, wenn etwas dazwischenkam.
                if (!r || !r.ok) setProgrammUpdate({ fehler: (r && r.grund) || "Update fehlgeschlagen." });
              } catch (e) {
                setProgrammUpdate({ fehler: String((e && e.message) || e) });
              }
            }}
            disabled={!!programmUpdate.laeuft}
            className="font-bold px-3 py-1 rounded text-white"
            style={{ backgroundColor: programmUpdate.laeuft ? "#8A9099" : "#1F7A3D" }}
          >
            {programmUpdate.laeuft ? "wird übernommen …" : "Jetzt aktualisieren"}
          </button>
          <button onClick={() => setProgrammUpdate(null)} className="font-bold" style={{ color: "#5B6572" }}>später</button>
        </div>
      )}
      {programmUpdate && programmUpdate.fehler && (
        <div className="no-print mx-4 mt-2 rounded px-3 py-2 text-xs flex items-center gap-3"
             style={{ backgroundColor: "#FBEAE8", border: "1px solid #E7B9B3", color: "#9A2B22" }}>
          <span><strong>Update nicht übernommen:</strong> {programmUpdate.fehler} Die bisherige Version läuft unverändert weiter.</span>
          <button onClick={() => setProgrammUpdate(null)} className="font-bold" style={{ color: "#5B6572" }}>ok</button>
        </div>
      )}

      {/* Titel nur für den Ausdruck */}
      <div className="print-only text-center py-2">
        <div className="font-black text-2xl uppercase tracking-tight">{printPrefix}</div>
        <div className="font-mono text-sm">{printSuffix}</div>
        <div className="font-mono text-xs mt-1">{doneCount} erledigt · {openCount} offen{donePercent !== null ? ` · ${donePercent} %` : ""}</div>
      </div>

      {/* Cockpit: Störungen (eigene, für alle beschreibbare Datei) */}
      {view === "COCKPIT" && cockpitTab === "STOERUNGEN" && (
        <div className="no-print max-w-7xl mx-auto px-4 mt-4">
        <div className="flex gap-3 items-start">
          {/* ---- Filterleiste links ---------------------------------------
              Die Begriffe sind dieselben wie im alten Schichtbuch ("nach
              Maschine", "nach Nummer", "nach Status"), damit der Umstieg
              niemanden zum Suchen zwingt. Neu sind allein die Zähler: Sie
              sagen vorher, was ein Klick bringen würde.
              Auf schmalen Geräten fällt die Leiste weg - dort wäre für Leiste
              UND Tabelle nebeneinander kein Platz, und die Tabelle hat
              Vorrang. */}
          {stoerModus === "liste" && stoerungen.length > 0 && (
            <div className="wk-karte overflow-hidden shrink-0 hidden lg:block" style={{ width: "198px", border: "1px solid #E2E4E7" }}>
              <div className="px-3 py-2 font-extrabold uppercase tracking-wide" style={{ fontSize: "0.62rem", color: "#22262B", borderBottom: "1px solid #EEF0F2" }}>🔎 Störberichte</div>
              <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.7px", textTransform: "uppercase", color: "#A2AAB3", padding: "9px 12px 4px" }}>Ansicht</div>
              {[["datum", "nach Datum und Schicht"], ["anlage", "nach Anlage"], ["nummer", "nach Nummer"], ["status", "nach Status"], ["gewerk", "nach Gewerk"]].map(([k, label]) => {
                const an = stoerAnsicht === k;
                return (
                  <button key={k} className="w-full text-left flex items-center"
                    onClick={() => { setStoerAnsicht(k); try { localStorage.setItem("werkstatt-stoer-ansicht", k); } catch (e) { /* egal */ } }}
                    style={{ padding: "5px 12px", fontSize: "0.75rem", color: an ? "#A25E14" : "#3C444C", fontWeight: an ? 800 : 400, backgroundColor: an ? "#FDF0E2" : "transparent", boxShadow: an ? "inset 3px 0 0 #C97A2B" : "none" }}>
                    {label}
                  </button>
                );
              })}
              <div style={{ height: "1px", backgroundColor: "#EEF0F2", margin: "7px 0" }} />
              <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.7px", textTransform: "uppercase", color: "#A2AAB3", padding: "0 12px 4px" }}>Zeitraum</div>
              {[["woche", "Diese Woche"], ["monat", "Dieser Monat"], ["jahr", "Dieses Jahr"], ["alle", "Alle / Archiv"]].map(([k, label]) => {
                const an = stoerListeZeitraum === k;
                return (
                  <button key={k} className="w-full text-left flex items-center gap-2"
                    onClick={() => { setStoerListeZeitraum(k); try { localStorage.setItem("werkstatt-stoer-zeitraum", k); } catch (e) { /* egal */ } }}
                    style={{ padding: "5px 12px", fontSize: "0.75rem", color: an ? "#A25E14" : "#3C444C", fontWeight: an ? 800 : 400, backgroundColor: an ? "#FDF0E2" : "transparent", boxShadow: an ? "inset 3px 0 0 #C97A2B" : "none" }}>
                    <span>{label}</span>
                    <span className="ml-auto font-mono font-bold" style={{ fontSize: "0.66rem", color: an ? "#C97A2B" : "#97A0A9" }}>{zaehleZeitraum(k)}</span>
                  </button>
                );
              })}
              <div style={{ height: "1px", backgroundColor: "#EEF0F2", margin: "7px 0" }} />
              <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.7px", textTransform: "uppercase", color: "#A2AAB3", padding: "0 12px 4px" }}>Schnellzugriff</div>
              {[["offen", "⚠ Nur offene", stoerungen.filter((s) => s.offen).length],
                ["restarbeit", "📌 Mit Restarbeit", stoerungen.filter(mitRestarbeit).length],
                ["lang", "🕐 Über 60 min", stoerungen.filter(langeStoerung).length]].map(([k, label, n]) => {
                const an = stoerSchnell === k;
                return (
                  <button key={k} className="w-full text-left flex items-center gap-2"
                    onClick={() => setStoerSchnell(an ? "" : k)}
                    title={an ? "Filter wieder aufheben" : undefined}
                    style={{ padding: "5px 12px", fontSize: "0.75rem", color: an ? "#A25E14" : "#3C444C", fontWeight: an ? 800 : 400, backgroundColor: an ? "#FDF0E2" : "transparent", boxShadow: an ? "inset 3px 0 0 #C97A2B" : "none" }}>
                    <span>{label}</span>
                    <span className="ml-auto font-mono font-bold" style={{ fontSize: "0.66rem", color: an ? "#C97A2B" : "#97A0A9" }}>{n}</span>
                  </button>
                );
              })}
              {/* Hier stand "Alle Berichte löschen". Der Knopf hatte genau eine
                  Aufgabe - die Testdaten vor dem Roll-out wegräumen - und die
                  ist erledigt. Ein Knopf, der alles auf einmal loescht und den
                  niemand mehr braucht, gehoert nicht in eine Werkstatt-App.
                  Die Funktion dahinter (alleStoerungenLoeschen) ist ebenfalls
                  entfernt; einzelne Berichte loescht man weiterhin im Bericht
                  selbst. */}
              <div style={{ height: "6px" }} />
            </div>
          )}

          <div className="flex-1" style={{ minWidth: 0 }}>
          {/* ---- Werkzeugzeile ----------------------------------------------
              Dieselbe Anordnung wie im Backlog: Suche links, Umschalter und
              Hauptknopf rechts. Vorher standen Titel, Umschalter und Zähler in
              einer Reihe und die Suche in einer zweiten darunter - zwei Reihen
              für vier Bedienelemente. Der Titel entfällt: der Reiter oben sagt
              bereits, wo man ist. */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {stoerModus === "liste" && stoerungen.length > 0 && (
              <SuchFeld
                type="search"
                wert={stoerSuche}
                onWert={setStoerSuche}
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

          {/* Offene Nachbestellungen (QoL Runde 3): die Felder "Ersatzteile" +
              "nachbestellt" gibt es je Störung längst - hier die Sammel-Sicht,
              damit nichts still liegen bleibt. */}
          {offeneNachbestellungen.length > 0 && (
            <div className="flex items-center gap-2 mb-2 rounded-lg px-3 py-2" style={{ backgroundColor: "#FBF3E6", border: "1px solid #E8D3AE" }}>
              <span className="text-xs" style={{ color: "#7A5B22" }}>
                🛒 <b>{offeneNachbestellungen.length}</b> {offeneNachbestellungen.length === 1 ? "Ersatzteil ist" : "Ersatzteile sind"} nachbestellt und noch nicht eingetroffen.
              </span>
              <button onClick={() => setNachbestellOffen(true)} className="ml-auto rounded font-bold shrink-0 border"
                style={{ borderColor: "#C9A24B", color: "#7A5B22", backgroundColor: "#fff", padding: "4px 10px", fontSize: "0.72rem" }}>
                Nachbestellungen ansehen
              </button>
            </div>
          )}

          {/* Berichte aus der Zeit vor den Nummern. Der Hinweis steht nur da,
              solange es welche gibt, und trägt sie erst auf Klick nach - ein
              Schreibvorgang in die gemeinsame Datei, den niemand ausgelöst
              hat, wäre genau die falsche Überraschung. */}
          {stoerModus === "liste" && stoerDarfSchreiben && stoerOhneNummer.length > 0 && (
            <div className="flex items-center gap-2 mb-2 rounded-lg px-3 py-2" style={{ backgroundColor: "#FBF4E7", border: "1px solid #EAD9BC" }}>
              <span className="text-xs" style={{ color: "#7A5B22" }}>
                <b>{stoerOhneNummer.length}</b> {stoerOhneNummer.length === 1 ? "Bericht hat" : "Berichte haben"} noch keine Nummer – sie stammen aus der Zeit davor.
              </span>
              <button onClick={nummernNachtragen} className="ml-auto rounded font-bold text-white shrink-0"
                style={{ backgroundColor: "#C97A2B", padding: "4px 10px", fontSize: "0.72rem" }}>
                Nummern nachtragen
              </button>
            </div>
          )}

          {/* Zwei Berichte mit derselben Nummer. Entsteht nur, wenn zwei Leute
              in derselben Sekunde melden und beide noch den Stand von vorher
              gelesen haben. Selten - aber eine Nummer, die es zweimal gibt,
              ist schlimmer als keine, deshalb wird sie hier angezeigt. */}
          {stoerModus === "liste" && stoerDarfSchreiben && stoerDoppelteNummern.length > 0 && (
            <div className="flex items-center gap-2 mb-2 rounded-lg px-3 py-2" style={{ backgroundColor: "#FBEAE8", border: "1px solid #E7B9B3" }}>
              <span className="text-xs" style={{ color: "#9A2B22" }}>
                <b>{stoerDoppelteNummern.length}</b> {stoerDoppelteNummern.length === 1 ? "Bericht trägt" : "Berichte tragen"} eine Nummer, die es schon gibt
                {" "}({stoerDoppelteNummern.map((s) => stoerNrKurz(s)).join(", ")}).
              </span>
              <button onClick={nummernBereinigen} className="ml-auto rounded font-bold text-white shrink-0"
                style={{ backgroundColor: "#C0392B", padding: "4px 10px", fontSize: "0.72rem" }}>
                Nummern bereinigen
              </button>
            </div>
          )}

          {/* Fehler-Banner der Störungen-Datei */}
          {stoerErr && (
            <div className="rounded-lg px-3 py-2 mb-3 text-sm" style={{ backgroundColor: "#FBEAE8", border: "1px solid #C0392B", color: "#9A2B22" }}>{stoerErr}</div>
          )}

          {/* Verbindungs-Hinweise für die Störungen-Datei */}
          {stoerChecked && stoerState.status === "verweis-tot" && (
            <div className="rounded-lg px-3 py-2 mb-3 text-sm flex items-center gap-3 flex-wrap" style={{ backgroundColor: "#FBEAE8", border: "1px solid #C0392B", color: "#9A2B22" }}>
              <span>Dieser Browser gibt die gemerkte Störungen-Datei „{stoerState.name}" nicht mehr frei. Bitte einmal auswählen.</span>
              <button onClick={() => connectStoer()} className="rounded px-3 py-1 text-white font-bold" style={{ backgroundColor: "#C0392B" }}>Datei auswählen …</button>
              <button onClick={verbindeStoerMitSchreibrecht} className="rounded px-3 py-1 font-bold border" style={{ borderColor: "#C0392B", color: "#9A2B22", backgroundColor: "#fff" }}>
                Mit Schreibrecht verbinden …
              </button>
            </div>
          )}
          {stoerChecked && stoerState.status === "needs-permission" && (
            <div className="rounded-lg px-3 py-2 mb-3 text-sm flex items-center gap-3 flex-wrap" style={{ backgroundColor: "#FDF3E7", border: "1px solid #C97A2B", color: "#8A5320" }}>
              <span>Störungen-Datei „{stoerState.name}" ist nach dem Browser-Neustart getrennt.</span>
              <button onClick={reconnectStoer} className="rounded px-3 py-1 text-white font-bold" style={{ backgroundColor: "#C97A2B" }}>Jetzt verbinden</button>
              {stoerVerbindenBlockiert && (
                <button onClick={verbindeStoerMitSchreibrecht} className="rounded px-3 py-1 font-bold border" style={{ borderColor: "#C97A2B", color: "#8A5320", backgroundColor: "#fff" }}>
                  Mit Schreibrecht verbinden …
                </button>
              )}
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
            <div className="rounded-lg px-3 py-2 mb-3 text-sm flex items-center gap-3 flex-wrap" style={{ backgroundColor: "#EEF1F4", border: "1px solid #C4CBD2", color: "#5B6572" }}>
              <span>🔒 Die Störungen-Datei ist auf diesem Gerät nur zum Ansehen freigegeben.</span>
              {/* Diese Datei soll ausdrücklich JEDER pflegen dürfen. Wenn hier
                  Schreibschutz steht, ist das fast immer ein Rechte-Problem des
                  Browsers und kein Wille der IT - deshalb steht der Ausweg hier
                  immer bereit, nicht erst nach einem Fehlversuch. */}
              <button onClick={verbindeStoerMitSchreibrecht} className="rounded px-3 py-1 font-bold border" style={{ borderColor: "#5B6572", color: "#3A424B", backgroundColor: "#fff" }}>
                Mit Schreibrecht verbinden …
              </button>
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
            /* Die übrigen Ansichten der Leiste: eine Ebene, sonst dieselbe
               Zeile wie im Schichtbuch. Ein eigener Zweig statt eines
               Umbaus der Datums-Ansicht - die ist die meistgenutzte und
               soll von den anderen nichts abbekommen. */
            if (stoerEinfachGruppen) {
              if (stoerEinfachGruppen.length === 0) {
                return <div className="text-sm italic mt-6 text-center" style={{ color: "#8A9099" }}>Kein Störbericht in dieser Auswahl.</div>;
              }
              const grpTd = { padding: "0 8px", height: "26px", verticalAlign: "middle", whiteSpace: "nowrap", backgroundColor: "#EDF0F3", borderBottom: "1px solid #DDE1E6" };
              return (
                <div className="wk-karte overflow-hidden" style={{ border: "1px solid #E2E4E7" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "640px" }}>
                      <thead>{stoerKopfzeile(stoerAnsicht === "nummer" ? "Datum" : "Datum / Zeit")}</thead>
                      <tbody>
                        {stoerEinfachGruppen.map((g) => (
                          <React.Fragment key={g.schluessel}>
                            {stoerAnsicht !== "nummer" && (
                              <tr>
                                <td colSpan={4} style={{ ...grpTd, fontWeight: 800, fontSize: "0.75rem", color: "#22262B" }}>
                                  {g.titel}
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
                            )}
                            {g.liste.map((s) => stoerZeileTabelle(s, true))}
                          </React.Fragment>
                        ))}
                      </tbody>
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
                                <td colSpan={4} style={{ ...grpTd, fontWeight: 800, fontSize: "0.75rem", color: "#22262B" }}>
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
                                      <td colSpan={4} style={{ ...schTd, paddingLeft: "24px" }}>
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
        </div>
        </div>
      )}

      {/* Cockpit: Übersicht (Kennzahlen + Tagesliste + Pinnwand) */}
      {/* "Seit deinem letzten Besuch" (QoL 19.08.): was sich seit dem letzten
          Öffnen getan hat - aus dem Verlauf der gemeinsamen Datei, der sonst
          im ⚙ verborgen ist. Wegklickbar, je Sitzung einmal. */}
      {view === "COCKPIT" && cockpitTab === "UEBERSICHT" && !neuigkeitenZu && neuigkeiten.length > 0 && (
        <div className="no-print max-w-7xl mx-auto px-4 mt-3">
          <div className="rounded-xl px-4 py-2.5" style={{ backgroundColor: "white", border: "1px solid #E2E4E7", borderLeft: "4px solid #2F6690", boxShadow: "0 2px 8px rgba(20,22,25,0.06)" }}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#2F6690" }}>Seit deinem letzten Besuch</span>
              <span className="text-xs" style={{ color: "#3d4650" }}>
                {(() => {
                  let angelegt = 0, geaendert = 0, geloescht = 0, sonst = 0;
                  neuigkeiten.forEach((v) => {
                    const s = String(v.was || "");
                    if (s.startsWith("angelegt")) angelegt++;
                    else if (s.startsWith("geändert")) geaendert++;
                    else if (s.startsWith("gelöscht")) geloescht++;
                    else sonst++;
                  });
                  const teile = [];
                  if (angelegt) teile.push(`${angelegt} angelegt`);
                  if (geaendert) teile.push(`${geaendert} geändert`);
                  if (geloescht) teile.push(`${geloescht} gelöscht`);
                  if (sonst) teile.push(`${sonst} weitere`);
                  return teile.join(" · ") || `${neuigkeiten.length} Änderung(en)`;
                })()}
              </span>
              <button onClick={() => setNeuigkeitenAuf((o) => !o)} className="text-xs font-bold hover:underline" style={{ color: "#2F6690" }}>
                {neuigkeitenAuf ? "weniger" : "Einzelheiten"}
              </button>
              <button onClick={() => setNeuigkeitenZu(true)} aria-label="Neuigkeiten schließen" className="ml-auto text-slate-400 hover:text-slate-600"><X size={14} /></button>
            </div>
            {neuigkeitenAuf && (
              <div className="mt-2 flex flex-col gap-1">
                {neuigkeiten.slice(0, 10).map((v) => (
                  <div key={v.id} className="text-xs" style={{ color: "#5B6572" }}>
                    <span className="font-mono" style={{ color: "#98A1AA" }}>
                      {v.ts ? new Date(v.ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>{" "}
                    <strong>{v.wer || "Unbekannt"}</strong>: {v.was}
                  </div>
                ))}
                {neuigkeiten.length > 10 && <div className="text-xs text-slate-400">… und {neuigkeiten.length - 10} weitere (⚙ → Verlauf)</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* G8: Wochen-Rückblick - freitags ab 12 Uhr, je Woche einmal. */}
      {view === "COCKPIT" && cockpitTab === "UEBERSICHT" && wochenRueckblick && (
        <div className="no-print max-w-7xl mx-auto px-4 mt-3">
          <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "white", border: "1px solid #E2E4E7", borderLeft: "4px solid #1F7A3D", boxShadow: "0 2px 8px rgba(20,22,25,0.06)" }}>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span aria-hidden="true" style={{ fontSize: "18px" }}>🏁</span>
              <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#1F5233" }}>Wochen-Rückblick · KW {wochenRueckblick.kw}</span>
              <button
                onClick={() => { setRueckblickZu(true); try { localStorage.setItem("werkstatt-kalender-rueckblick", wochenRueckblick.wochenKennung); } catch (e) { /* bleibt dann bis Freitagabend */ } }}
                aria-label="Wochen-Rückblick schließen"
                className="ml-auto text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[[wochenRueckblick.erledigt, "Termine erledigt", "#2F7D4F"],
                [wochenRueckblick.quote !== null ? `${wochenRueckblick.quote} %` : "–", "Termintreue", "#2F6690"],
                [wochenRueckblick.behoben, "Störungen behoben", "#C97A2B"],
                [wochenRueckblick.stoerOffen, "noch offen", wochenRueckblick.stoerOffen > 0 ? "#B23A34" : "#8A9099"]].map(([z, t, f]) => (
                <div key={t} className="flex-1 text-center border rounded-lg px-2 py-2" style={{ borderColor: "#E2E4E7", minWidth: "110px" }}>
                  <div style={{ fontSize: "20px", fontWeight: 900, color: f }}>{z}</div>
                  <div className="text-[10px] font-bold uppercase" style={{ color: "#8A9099" }}>{t}</div>
                </div>
              ))}
            </div>
            {(wochenRueckblick.staerksterTag || wochenRueckblick.sorgenkind) && (
              <div className="text-xs mt-2" style={{ color: "#3d4650" }}>
                {wochenRueckblick.staerksterTag && <>Stärkster Tag: <strong>{wochenRueckblick.staerksterTag[0]}</strong> ({wochenRueckblick.staerksterTag[1]} erledigt)</>}
                {wochenRueckblick.staerksterTag && wochenRueckblick.sorgenkind && " · "}
                {wochenRueckblick.sorgenkind && <>Sorgenkind: <strong>{wochenRueckblick.sorgenkind[0]}</strong> ({wochenRueckblick.sorgenkind[1]} Störungen)</>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Geburtstags-Karte (Variante A, Robertos Wahl vom 20.08.): dezent,
          wegklickbar je Tag und Gerät. Kein Konfetti, keine Sperre. */}
      {view === "COCKPIT" && cockpitTab === "UEBERSICHT" && geburtstagsLage && (
        <div className="no-print max-w-7xl mx-auto px-4 mt-3">
          <div className="rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap" style={{ background: "linear-gradient(135deg,#FFF8EE,#FDF3E3)", border: "1px solid #E8D3AE", borderLeft: "4px solid #C97A2B", boxShadow: "0 2px 8px rgba(20,22,25,0.06)" }}>
            <span aria-hidden="true" style={{ fontSize: "18px" }}>🎂</span>
            {geburtstagsLage.heute.length > 0 && (
              <span className="text-sm" style={{ color: "#22262B" }}>
                <strong>
                  Heute {geburtstagsLage.heute.length === 1 ? "hat" : "haben"}{" "}
                  {geburtstagsLage.heute.map((p) => p.name + (p.alter !== null ? ` (wird ${p.alter})` : "")).join(" und ")}{" "}
                  Geburtstag!
                </strong>
              </span>
            )}
            {geburtstagsLage.demnaechst.length > 0 && (
              <span className="text-xs" style={{ color: "#8A6D1C" }}>
                demnächst:{" "}
                {geburtstagsLage.demnaechst.map((p) =>
                  `${p.name} am ${p.datum.toLocaleDateString("de-DE", { weekday: "short" })}, ${String(p.datum.getDate()).padStart(2, "0")}.${String(p.datum.getMonth() + 1).padStart(2, "0")}. (${p.inTagen === 1 ? "morgen" : `in ${p.inTagen} Tagen`})${p.alter !== null ? ` – wird ${p.alter}` : ""}`
                ).join(" · ")}
              </span>
            )}
            <button
              onClick={() => { setGeburtstagZu(true); try { localStorage.setItem("werkstatt-kalender-geburtstag-zu", todayKey); } catch (e) { /* dann eben je Sitzung */ } }}
              aria-label="Geburtstags-Erinnerung schließen"
              className="ml-auto text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {view === "COCKPIT" && cockpitTab === "UEBERSICHT" && (
        <div className="no-print max-w-7xl mx-auto px-4 mt-4">
          {/* Kennzahlen-Kacheln (Farbakzent links, ohne Icon) */}
          {/* Sieben Felder nebeneinander gehen erst ab sehr breiten Bildschirmen
              auf. Darunter brechen sie um, statt sich gegenseitig
              zusammenzuquetschen. JEDE Kachel nimmt genau eine Spalte -
              auto-rows-fr sorgt dafür, dass auch die umgebrochenen Reihen
              dieselbe Höhe haben, sonst wären die Maße nur in einer Zeile gleich. */}
          <div className="grid gap-2.5 mb-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-7 auto-rows-fr">
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
            {/* OEE kommt aus der Excel-Tabelle im Datenordner - eingerichtet wird
                sie in ⚙, angezeigt wird sie hier, wo die Schicht sie sieht. */}
            <OeeKachel
              stand={oeeStand}
              darfEinrichten={!readerMode}
              onKlick={() => {
                // Steht eine Zahl da, will man wissen, welche Anlage sie drückt -
                // nicht in die Einrichtung. Die erreicht man aus dem Popup heraus.
                if (oeeStand.lage === "ok") setOeeUebersichtOffen(true);
                else if (!readerMode) openSettings();
              }}
            />
            {/* Hier stand bis zuletzt ein zweiter, gleich beschrifteter Halbkreis für
                das Jahr - die beiden waren kaum auseinanderzuhalten. Die Jahresquote
                steht jetzt in der TPM-Übersicht neben der Monatsquote, wo der
                Vergleich hingehört. An dieser Stelle sagt die Uhr mehr. */}
            <WerkstattUhr />
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
              {/* Was länger als eine Woche versäumt ist, liegt im Archiv -
                  die Übersicht bleibt frei für das, was jetzt zählt.
                  Robertos Ansage vom 18.08.: Für LESER verschwindet
                  Versäumtes nach der Woche ganz - kein Archiv-Knopf.
                  Nachvollziehbar bleibt es für Bearbeiter im TPM-Plan
                  und für Verwalter hier im Termin-Archiv. */}
              {!readerMode && terminArchiv.length > 0 && (
                <button
                  onClick={() => setTerminArchivOffen(true)}
                  className="wk-karte wk-karte-hebt w-full flex items-center gap-2.5 px-3 py-2.5 mt-2 text-left"
                  style={{ backgroundColor: "#F5F6F8", boxShadow: "inset 3px 0 0 0 #8A9099, var(--wk-schatten)" }}
                  aria-label="Termin-Archiv öffnen"
                >
                  <span style={{ fontSize: "0.95rem" }}>🗄</span>
                  <strong className="flex-1" style={{ fontSize: "var(--wk-txt)", color: "#5B6572" }}>Termin-Archiv</strong>
                  <span className="font-mono" style={{ fontSize: "var(--wk-txt-etikett)", color: "#8A9099" }}>{terminArchiv.length} über eine Woche versäumt</span>
                </button>
              )}
            </div>

            {/* Pinnwand */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#22262B" }}>📌 Pinnwand</span>
                <SuchFeld
                  type="search"
                  wert={zettelSuche}
                  onWert={setZettelSuche}
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
                <PinnwandVerfasser startName={zettelName} onAnpinnen={addZettel} onAbbrechen={() => setZettelOpen(false)} />
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

      {/* Der frühere Eingabe-Tageskalender ist seit dem 18.08. mit dem
          Plan-Kalender verschmolzen (ein Raster statt zwei): Der zeigt
          Geplantes UND echte Einträge, und das + je Tag legt wie bisher
          freie Einträge an. */}

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
            <SuchFeld
              type="search"
              wert={blSuche}
              onWert={setBlSuche}
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
                        {/* Tages-Balken. Feiertage (Bayern) bekommen einen roten Balken
                            mit Namen - "Heute" bleibt orange und gewinnt, sonst wüsste
                            man am Feiertag selbst nicht mehr, welcher Tag heute ist. */}
                        <div style={{ background: istHeute ? "#C97A2B" : feiertag ? "#B23A34" : t.we ? "#7FA6C4" : "#4B5259", color: "white", padding: "4px 10px", display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap", fontWeight: 800, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {t.datum.toLocaleDateString("de-DE", { weekday: "long" })}
                          <span className="font-mono" style={{ fontWeight: 400, opacity: 0.9, fontSize: "0.7rem", textTransform: "none", letterSpacing: 0 }}>
                            {t.datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} · KW {getISOWeek(t.datum)}{istHeute ? " · HEUTE" : ""}
                          </span>
                          {feiertag && <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#FFE3DE" }}>★ {feiertag}</span>}
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
                              // Feiertage (Bayern) auch in den Tageszellen färben, nicht nur
                              // im Kopf - Robertos Wunsch vom 10.08.: beim Planen sofort
                              // sehen, wo gar nicht erst eingeteilt werden sollte.
                              const ft = feiertage.get(t.key);
                              const kwStart = t.dow === 1; // Montag = Beginn einer neuen KW - deutliche Abgrenzung zum Sonntag davor
                              const wochenendStart = t.dow === 6; // Samstag = Beginn des Wochenendes - Abgrenzung zum Freitag davor
                              return (
                                <td key={t.key} title={ft || undefined} style={{
                                  border: "1.5px solid #6B7280",
                                  borderLeft: heutig ? "3px solid #C97A2B" : kwStart ? "3px solid #22262B" : wochenendStart ? "3px solid #22262B" : "1.5px solid #6B7280",
                                  borderRight: heutig ? "3px solid #C97A2B" : "1.5px solid #6B7280",
                                  padding: 0,
                                  background: heutig ? "#FDF3E7" : ft ? "#FBEFED" : we ? "#EFF5FA" : "white",
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
              <SuchFeld
                type="search"
                wert={pickerSuche}
                onWert={setPickerSuche}
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
                    {/* Wer zuletzt Hand angelegt hat. Steht am Bericht selbst und
                        überlebt damit das Herausaltern der Verlaufszeilen. Nur
                        anzeigen, wenn es jemand anderes war als der Melder -
                        sonst wiederholt die Zeile sich nur selbst. */}
                    {live.geaendertVon && live.geaendertVon !== live.melder
                      ? ` · zuletzt geändert von ${live.geaendertVon}` : ""}
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
                    {/* Steckbrief-Zeile (QoL Runde 3): Wartungspartner und
                        Ersatzteile direkt neben der Anlage - wer nachts vor
                        der Maschine steht, sucht nicht erst im Register. */}
                    {(() => {
                      const st = registerEintragVon("TPM", String(sDraft.anlage || "").trim())?.steckbrief;
                      const teile = [st?.partner, st?.ersatzteile && `Ersatzteile: ${st.ersatzteile}`].filter(Boolean);
                      return teile.length ? (
                        <div className="text-xs mt-1" style={{ color: "#5B6572" }}>ℹ {teile.join(" · ")}</div>
                      ) : null;
                    })()}
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

                {/* Häufungs-Hinweis (QoL Runde 3): Blick auf die Ursache statt
                    nur aufs Symptom. Zählt Störungen derselben Anlage in den
                    30 Tagen vor dem Berichts-Datum. */}
                {(() => {
                  const anlage = String(sDraft.anlage || "").trim();
                  if (!anlage) return null;
                  const basis = /^\d{4}-\d{2}-\d{2}$/.test(String(sDraft.date || "")) ? sDraft.date : todayKey;
                  const g = new Date(basis + "T00:00:00");
                  g.setDate(g.getDate() - 30);
                  const grenze = dateKey(g.getFullYear(), g.getMonth(), g.getDate());
                  const andere = stoerungen.filter((s) =>
                    s.id !== sDraft.id &&
                    String(s.anlage || "").trim().toLowerCase() === anlage.toLowerCase() &&
                    String(s.date || "") >= grenze && String(s.date || "") <= basis);
                  if (andere.length < 2) return null;
                  const nummern = andere
                    .map((s) => (stoerNrLang(s) ? stoerNrKurz(s) : formatDateDE(s.date)))
                    .slice(0, 4).join(", ");
                  return (
                    <div className="flex gap-2 items-start rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: "#FBF3E6", border: "1px solid #E8D3AE", color: "#8A5B00" }}>
                      <span aria-hidden="true">⚠</span>
                      <span>
                        <strong>{andere.length + 1}. Störung an {anlage} innerhalb von 30 Tagen</strong> ({nummern}{andere.length > 4 ? ", …" : ""}).<br />
                        <span style={{ color: "#A8853F" }}>Häufung – lohnt ein Blick auf die Ursache statt nur auf das Symptom?</span>
                      </span>
                    </div>
                  );
                })()}

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

      {/* Rückgängig-Leiste (QoL 19.08.): fängt Fehlklicks beim Abhaken,
          Löschen und Verschieben ab - acht Sekunden Zeit. */}
      {rueckgaengig && (
        <div className="no-print" style={{ position: "fixed", left: "50%", bottom: "26px", transform: "translateX(-50%)", zIndex: 60, backgroundColor: "#22262B", color: "#fff", borderRadius: "99px", padding: "9px 18px", fontSize: "13px", display: "flex", alignItems: "center", gap: "14px", boxShadow: "0 8px 30px rgba(0,0,0,0.35)" }}>
          <span>{rueckgaengig.text}</span>
          <button
            onClick={async () => {
              const mach = rueckgaengig.mach;
              if (rueckgaengigTimer.current) clearTimeout(rueckgaengigTimer.current);
              setRueckgaengig(null);
              await mach();
            }}
            className="font-extrabold uppercase tracking-wide"
            style={{ color: "#F0C230", fontSize: "12px" }}
          >
            Rückgängig
          </button>
        </div>
      )}

      {/* G2: Voller Monat = kleines Fest. Einmal je Monat und Gerät, dann
          Ruhe. Bewusst OHNE Vollbild-Schleier: Die Karte feiert, sie sperrt
          nicht - die Arbeit dahinter bleibt klickbar. */}
      {festOffen && (
        <div className="no-print" onClick={() => setFestOffen(null)}
          style={{ position: "fixed", top: "84px", left: "50%", transform: "translateX(-50%)", zIndex: 65, cursor: "pointer" }}>
          <div style={{ position: "relative", overflow: "hidden", borderRadius: "12px", background: "linear-gradient(135deg,#E5F3EA,#F2F9F4)", border: "1.5px solid #BFDCC9", padding: "22px 32px", boxShadow: "0 18px 60px rgba(0,0,0,0.35)", textAlign: "center", maxWidth: "420px" }}>
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} aria-hidden="true" className="wk-konfetti" style={{
                left: `${(i * 37) % 100}%`,
                backgroundColor: ["#2F7D4F", "#C97A2B", "#2F6690", "#F0C230"][i % 4],
                animationDelay: `${(i % 8) * 0.28}s`,
              }} />
            ))}
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: "32px" }} aria-hidden="true">🎉</div>
              <div style={{ fontWeight: 900, fontSize: "18px", color: "#1F5233" }}>{festOffen.monatName} komplett!</div>
              <div style={{ fontSize: "13px", color: "#24603D", marginTop: "4px" }}>Alle <strong>{festOffen.anzahl} Termine</strong> erledigt – 100 % Termintreue.</div>
            </div>
          </div>
        </div>
      )}

      {/* G7: Tastatur-Spickzettel (Taste ?) */}
      {kuerzelOffen && (
        <div className="no-print" onClick={() => setKuerzelOffen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(20,22,25,0.5)", padding: "16px" }}>
          <div role="dialog" aria-label="Tastatur-Kürzel" onClick={(ev) => ev.stopPropagation()}
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", width: "440px", maxWidth: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">Tastatur-Kürzel</div>
              <button onClick={() => setKuerzelOffen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>
            {[["W / T", "Werkstatt ↔ TPM wechseln"], ["N", "Nachtschicht-Modus an/aus"], ["D", "Drucken-Dialog öffnen"],
              ["S", "Störbericht erfassen"], ["H", "zurück zu Heute (Monat/Jahr)"], ["?", "diese Karte"], ["Esc", "Karte schließen"]].map(([k, t]) => (
              <div key={k} className="flex items-center gap-3 mb-2">
                <span className="text-center font-mono font-extrabold text-xs rounded px-2 py-1" style={{ minWidth: "58px", backgroundColor: "#F1F3F5", border: "1px solid #C9D0D8", borderBottomWidth: "2.5px", color: "#22262B" }}>{k}</span>
                <span className="text-sm" style={{ color: "#3d4650" }}>{t}</span>
              </div>
            ))}
            <div className="text-xs mt-2" style={{ color: "#8A9099" }}>Nur wenn kein Eingabefeld den Fokus hat – Tippen bleibt Tippen.</div>
          </div>
        </div>
      )}

      {/* Offene Nachbestellungen (QoL Runde 3) */}
      {nachbestellOffen && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => setNachbestellOffen(false)}
        >
          <div
            role="dialog"
            aria-label="Offene Nachbestellungen"
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", width: "540px", maxWidth: "100%", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="font-bold text-sm">Offene Nachbestellungen <span style={{ color: "#C0392B" }}>({offeneNachbestellungen.length})</span></div>
              <button onClick={() => setNachbestellOffen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>
            <div className="text-xs mb-3" style={{ color: "#8A9099" }}>
              Aus den Störungen gesammelt – überall dort, wo „Ersatzteile" mit „nachbestellt" markiert ist.
            </div>
            {offeneNachbestellungen.length === 0 && (
              <div className="text-xs italic text-slate-400 py-3">Nichts offen – alles eingetroffen.</div>
            )}
            {offeneNachbestellungen.map((s) => {
              const tage = Math.max(0, Math.round((Date.parse(todayKey) - Date.parse(String(s.date))) / 86400000));
              return (
                <div key={s.id} className="flex items-center gap-3 border rounded-lg px-3 py-2 mb-2" style={{ borderColor: "#E2E4E7" }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold" style={{ color: "#22262B", wordBreak: "break-word" }}>{s.ersatzteile}</div>
                    <div className="text-xs" style={{ color: "#8A9099" }}>
                      {s.anlage || "—"}{stoerNrLang(s) ? ` · ${stoerNrKurz(s)}` : ""} · seit {formatDateDE(s.date)} ({tage === 0 ? "heute" : `${tage} Tag${tage === 1 ? "" : "e"}`}){tage >= 7 ? " ⚠" : ""}
                    </div>
                  </div>
                  {stoerDarfSchreiben && (
                    <button
                      onClick={() => nachbestellungEingetroffen(s.id)}
                      className="shrink-0 text-xs font-bold px-3 py-1.5 rounded border"
                      style={{ borderColor: "#2F7D4F", color: "#2F7D4F", backgroundColor: "#fff" }}
                    >
                      ✓ eingetroffen
                    </button>
                  )}
                </div>
              );
            })}
          </div>
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

                  {/* Feiertags-Hinweis (QoL 19.08.): der Plan rechnet Feiertage
                      heraus - wer von Hand einen belegt, soll es wissen. */}
                  {(() => {
                    const feiertagName = getHolidays(Number(String(modal.date).slice(0, 4))).get(modal.date);
                    return feiertagName ? (
                      <div className="flex gap-2 items-start rounded px-3 py-2 text-xs mb-3" style={{ backgroundColor: "#FDF0EE", border: "1px solid #E8B4AE", color: "#B23A34" }}>
                        <span aria-hidden="true">⚠</span>
                        <span>
                          <strong>{formatDateDE(modal.date)} ist {feiertagName} (Feiertag).</strong><br />
                          <span style={{ color: "#8A5B57" }}>Termin trotzdem anlegen? Der Plan rechnet Feiertage sonst automatisch heraus.</span>
                        </span>
                      </div>
                    ) : null;
                  })()}

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
                    {/* Verschieben (QoL 19.08.): mitsamt Notiz auf einen neuen
                        Tag - vorher ging das nur über Löschen + neu anlegen. */}
                    <div className="flex flex-col gap-1.5">
                      <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "#5B6572" }}>Verschieben auf</div>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={verschiebeDatum}
                          onChange={(ev) => setVerschiebeDatum(ev.target.value)}
                          aria-label="Neues Datum"
                          className="text-sm border rounded px-3 py-2 flex-1 min-w-0"
                          style={{ borderColor: "#D6D9DC" }}
                        />
                        <button
                          disabled={!/^\d{4}-\d{2}-\d{2}$/.test(verschiebeDatum) || verschiebeDatum === liveEntry.date}
                          onClick={() => verschiebeTermin(liveEntry.id)}
                          className="text-sm font-bold px-4 py-2 rounded text-white disabled:opacity-40"
                          style={{ backgroundColor: "#2F6690" }}
                        >
                          Verschieben
                        </button>
                      </div>
                    </div>
                    {/* Checkliste (QoL Runde 3): die Prüfpunkte der Anlage aus
                        dem Register - macht aus "Gemacht" ein nachvollziehbares
                        Gemacht. Bewusst ohne Zwang: Abhaken mit Lücke geht,
                        die Lücke bleibt nur sichtbar. */}
                    {(() => {
                      const punkte = registerEintragVon(liveEntry.category, liveEntry.name)?.checkliste || [];
                      if (!punkte.length) return null;
                      const erledigt = new Set(Array.isArray(liveEntry.punkte) ? liveEntry.punkte : []);
                      const zaehler = punkte.filter((pkt) => erledigt.has(pkt)).length;
                      const togglePunkt = async (pkt) => {
                        const neu = erledigt.has(pkt) ? [...erledigt].filter((x) => x !== pkt) : [...erledigt, pkt];
                        await persist(entries.map((e) => (e.id === liveEntry.id ? { ...e, punkte: neu } : e)));
                      };
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "#5B6572" }}>
                            Checkliste {liveEntry.name} <span className="font-normal normal-case" style={{ color: "#8A9099" }}>({zaehler} von {punkte.length})</span>
                          </div>
                          {punkte.map((pkt) => {
                            const an = erledigt.has(pkt);
                            return (
                              <button
                                key={pkt}
                                onClick={() => togglePunkt(pkt)}
                                className="flex items-center gap-2 text-sm rounded px-2.5 py-1.5 border text-left"
                                style={{ borderColor: an ? "#BFDCC9" : "#E2E4E7", backgroundColor: an ? "#F2F9F4" : "#fff", color: an ? "#24603D" : "#22262B" }}
                              >
                                <span aria-hidden="true" className="inline-flex items-center justify-center rounded shrink-0" style={{ width: "16px", height: "16px", border: `1.5px solid ${an ? "#2F7D4F" : "#C3C7CB"}`, backgroundColor: an ? "#2F7D4F" : "#fff", color: "#fff", fontSize: "11px" }}>{an ? "✓" : ""}</span>
                                {pkt}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
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
      {/* Druck-Auswahl: links die Möglichkeiten, rechts die Vorschau.
          Die Vorschau ist die echte Druckvorlage in einem Rahmen, nur
          verkleinert - kein nachgebautes Bildchen, das später nicht zum
          Ausdruck passt. Der Maßstab richtet sich nach dem Papierformat,
          das die Vorlage selbst in ihrer @page-Regel nennt. */}
      {/* Zwei an einem Bericht: Wer als Zweiter speichert, würde die Fassung
          des Ersten stumm überschreiben - beim Zusammenführen gewinnt der
          spätere Zeitstempel. Deshalb wird hier gefragt, mit Namen und Zeit
          des anderen, statt es einfach geschehen zu lassen. */}
      {/* Anlagenübersicht hinter der OEE-Kachel: Die eine Zahl sagt, wie es
          steht - hier steht, WER sie drückt. Sortiert nach der schlechtesten
          Anlage zuerst, denn die ist der Grund, warum man hinschaut. */}
      {oeeUebersichtOffen && oeeStand.lage === "ok" && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: "16px" }}
          onClick={() => setOeeUebersichtOffen(false)}
        >
          <div
            role="dialog"
            aria-label="OEE Anlagenübersicht"
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: "white", borderRadius: "var(--wk-eck)", width: "640px", maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", padding: "20px 22px", boxShadow: "0 18px 60px rgba(0,0,0,0.35)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-extrabold" style={{ color: "#22262B" }}>OEE · alle Anlagen</span>
              <span className="text-xs font-bold rounded px-2 py-0.5" style={{ backgroundColor: "#EEF1F4", color: "#5B6572" }}>
                {oeeZeitraumText(oeeStand)}
              </span>
              <button onClick={() => setOeeUebersichtOffen(false)} aria-label="Schließen" className="ml-auto text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="text-xs mb-3" style={{ color: "#8A9099" }}>
              {oeeStand.datei}{oeeStand.blatt ? ` · Blatt ${oeeStand.blatt}` : ""} · {oeeStand.zeilen} Zeile(n)
              {oeeStand.gelesenAm && ` · gelesen ${new Date(oeeStand.gelesenAm).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}
            </div>
            {oeeStand.veraltet && (
              <div className="text-xs rounded px-3 py-2 mb-3" style={{ backgroundColor: "#FBF3DA", color: "#7A5A00" }}>
                Der jüngste Eintrag der Tabelle liegt <strong>{oeeStand.alterStunden} Stunden</strong> zurück.
                In Excel prüfen: Ist der Pivot-Filter (Monat/KW) auf dem laufenden Zeitraum,
                und wurde die Datei nach dem Aktualisieren gespeichert?
              </div>
            )}
            {oeeStand.modus === "summe" && (
              <div className="text-xs mb-3" style={{ color: "#5B6572" }}>
                Gezeigt wird die <strong>Summenzeile</strong> der Tabelle (GES/Gesamtergebnis) –
                der Zeitraum ist der in Excel gefilterte.
                {oeeStand.juengsterTag && oeeStand.juengsterTagWert != null && (
                  <> Jüngster Tag ({new Date(oeeStand.juengsterTag + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}):{" "}
                  <strong>{String(oeeStand.juengsterTagWert).replace(".", ",")} %</strong>.</>
                )}
              </div>
            )}
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-extrabold" style={{ fontSize: "2.4rem", lineHeight: 1, letterSpacing: "-1.8px", color: "#22262B" }}>
                {oeeStand.oee != null ? oeeStand.oee.toFixed(1).replace(".", ",") : "–"}
              </span>
              <span className="font-extrabold" style={{ fontSize: "1rem", color: "#22262B" }}>%</span>
              <span className="text-xs" style={{ color: "#8A9099" }}>
                {/* Im Summen-Modus rechnet die App nichts - die Zahl IST die GES-Zeile */}
                {oeeStand.modus === "summe" ? "Summenzeile der Tabelle" : `Mittel über ${oeeStand.anlagen || 0} Anlage(n)`}
                {[oeeStand.verfuegbarkeit, oeeStand.leistung, oeeStand.qualitaet].every((x) => x != null) &&
                  ` · V ${String(oeeStand.verfuegbarkeit).replace(".", ",")} % · L ${String(oeeStand.leistung).replace(".", ",")} % · Q ${String(oeeStand.qualitaet).replace(".", ",")} %`}
              </span>
            </div>
            {/* Monats- und Jahresverlauf aus den Tageszeilen der Tabelle.
                Robertos Wunsch vom 07.08.: eine kleine Auswertung hinter der
                Kachel. Gezeigt wird, was die Tabelle hergibt - steht der
                Pivot-Filter nur auf einem Monat, ist der Jahresverlauf
                entsprechend kurz, und ein Hinweis sagt das dazu. */}
            {(() => {
              const reihe = oeeStand.tagesReihe || [];
              if (!reihe.length) return null;
              const letzter = reihe[reihe.length - 1].tag;
              const monatKey = letzter.slice(0, 7);
              const monatsTage = reihe.filter((d) => d.tag.startsWith(monatKey))
                .map((d) => ({ beschriftung: String(Number(d.tag.slice(8, 10))), titel: new Date(d.tag + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }), oee: d.oee }));
              const proMonat = new Map();
              reihe.forEach((d) => {
                const k = d.tag.slice(0, 7);
                if (!proMonat.has(k)) proMonat.set(k, []);
                proMonat.get(k).push(d.oee);
              });
              const jahrKey = letzter.slice(0, 4);
              const monate = [...proMonat.keys()].filter((k) => k.startsWith(jahrKey)).sort()
                .map((k) => ({
                  beschriftung: MONTHS_SHORT[Number(k.slice(5, 7)) - 1],
                  titel: `${MONTHS[Number(k.slice(5, 7)) - 1]} ${jahrKey}`,
                  oee: (() => { const w = proMonat.get(k).filter((x) => typeof x === "number"); return w.length ? Math.round((w.reduce((x, y) => x + y, 0) / w.length) * 10) / 10 : null; })(),
                }));
              const monatName = `${MONTHS[Number(monatKey.slice(5, 7)) - 1]} ${monatKey.slice(0, 4)}`;
              return (
                <>
                  <div className="text-xs font-extrabold uppercase tracking-wide mb-1" style={{ color: "#22262B" }}>Monatsverlauf · {monatName}</div>
                  <OeeVerlauf daten={monatsTage} />
                  <div className="text-xs font-extrabold uppercase tracking-wide mb-1 mt-4" style={{ color: "#22262B" }}>Jahresverlauf · {jahrKey}</div>
                  <OeeVerlauf daten={monate} />
                  <div className="text-xs mt-1 mb-2" style={{ color: "#8A9099" }}>
                    Monatspunkte = Mittel der Tageswerte in der Tabelle (ungewichtet).
                    {monate.length <= 1 && <> Für den vollen Jahresverlauf in Excel den Pivot-Filter auf das ganze Jahr {jahrKey} stellen.</>}
                  </div>
                </>
              );
            })()}
            {(oeeStand.proAnlage || []).length > 0 && (
            <table className="w-full" style={{ fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ color: "#8A9099", fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  <th className="text-left font-bold pb-1">Anlage</th>
                  <th className="text-right font-bold pb-1">OEE</th>
                  <th className="text-right font-bold pb-1">V</th>
                  <th className="text-right font-bold pb-1">L</th>
                  <th className="text-right font-bold pb-1">Q</th>
                </tr>
              </thead>
              <tbody>
                {(oeeStand.proAnlage || []).map((a) => {
                  const f = a.oee == null ? "#8A9099" : a.oee >= 85 ? "#2F7D4F" : a.oee >= 70 ? "#C97A2B" : "#B23A34";
                  const zahl = (x) => (x == null ? "–" : x.toFixed(1).replace(".", ","));
                  return (
                    <tr key={a.anlage} style={{ borderTop: "1px solid #F0F2F4" }}>
                      <td className="py-1.5 font-semibold" style={{ color: "#22262B" }}>{a.anlage}</td>
                      <td className="py-1.5 text-right font-extrabold" style={{ color: f, fontVariantNumeric: "tabular-nums" }}>{zahl(a.oee)}</td>
                      <td className="py-1.5 text-right" style={{ color: "#6B7480", fontVariantNumeric: "tabular-nums" }}>{zahl(a.verfuegbarkeit)}</td>
                      <td className="py-1.5 text-right" style={{ color: "#6B7480", fontVariantNumeric: "tabular-nums" }}>{zahl(a.leistung)}</td>
                      <td className="py-1.5 text-right" style={{ color: "#6B7480", fontVariantNumeric: "tabular-nums" }}>{zahl(a.qualitaet)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
            {(oeeStand.proAnlage || []).length > 0 && (
            <div className="text-xs mt-3" style={{ color: "#C3C7CB" }}>
              Ungewichtetes Mittel je Anlage – ohne Laufzeit in der Tabelle wäre jede Gewichtung geraten.
            </div>
            )}
            {!readerMode && (
              <button
                onClick={() => { setOeeUebersichtOffen(false); openSettings(); }}
                className="text-xs font-bold mt-3"
                style={{ color: "#2F6690" }}
              >
                Quelle einrichten …
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nachfrage bei einer leeren Datei. Der Fall vom 03.08.: Ordner-Symbol
          grün, Name richtig, Inhalt leer - und niemand merkt es, weil ein
          leerer Bestand am Anfang normal aussieht. Deshalb einmal fragen,
          direkt nach dem Verbinden, mit den Kenndaten daneben. */}
      {leereDatei && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: "16px" }}
        >
          <div
            role="dialog"
            aria-label="Diese Datei enthält keine Einträge"
            style={{ backgroundColor: "white", borderRadius: "12px", width: "520px", maxWidth: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.35)", overflow: "hidden" }}
          >
            <div className="px-5 py-3" style={{ backgroundColor: "#FBEAE8", borderBottom: "1px solid #E7B9B3" }}>
              <span className="font-black" style={{ fontSize: "1.02rem", color: "#22262B" }}>⚠️ Diese Datei enthält keine Einträge</span>
            </div>
            <div className="px-5 py-4" style={{ fontSize: "0.9rem", color: "#39414B" }}>
              <p className="mb-3">
                Auf diesem Rechner stehen <strong>{entries.length} Einträge</strong> – in der eben
                gewählten Datei steht <strong>kein einziger</strong>. Ist das wirklich die
                gemeinsame Datei der Werkstatt?
              </p>
              <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: "#F7F9FB", border: "1px solid #E7EAED", fontSize: "0.84rem" }}>
                <div className="font-extrabold uppercase mb-1" style={{ fontSize: "0.6rem", letterSpacing: "0.5px", color: "#5B6572" }}>Ausgewählt</div>
                <div style={{ color: "#39414B" }}>{dateiKennkarte(leereDatei)}</div>
              </div>
              <p style={{ color: "#5B6572", fontSize: "0.84rem" }}>
                Zwei Dateien können gleich heißen – der Browser verrät nicht, wo sie liegen.
                Wenn deine Kollegen Einträge haben und hier „KEINE Einträge" steht, ist es
                die falsche.
              </p>
            </div>
            <div className="px-5 py-3 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid #EFF1F3", backgroundColor: "#FAFBFC" }}>
              <button
                onClick={async () => { setLeereDatei(null); await connectShared({ create: false }); }}
                className="rounded-lg font-bold text-white"
                style={{ fontSize: "0.85rem", padding: "8px 14px", backgroundColor: "#C0392B" }}
              >Andere Datei wählen …</button>
              <span className="ml-auto" />
              <button
                onClick={() => setLeereDatei(null)}
                className="rounded-lg font-bold"
                style={{ fontSize: "0.85rem", padding: "8px 14px", backgroundColor: "#EEF1F4", color: "#5B6572" }}
              >Ist richtig so</button>
            </div>
          </div>
        </div>
      )}

      {stoerKonflikt && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: "16px" }}
        >
          <div
            role="dialog"
            aria-label="Bericht wurde inzwischen geändert"
            style={{ backgroundColor: "white", borderRadius: "12px", width: "520px", maxWidth: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.35)", overflow: "hidden" }}
          >
            <div className="px-5 py-3" style={{ backgroundColor: "#FBF3DA", borderBottom: "1px solid #E7D9A8" }}>
              <span className="font-black" style={{ fontSize: "1.02rem", color: "#22262B" }}>⚠️ Dieser Bericht wurde inzwischen geändert</span>
            </div>
            <div className="px-5 py-4" style={{ fontSize: "0.9rem", color: "#39414B" }}>
              <p className="mb-3">
                <strong>{stoerKonflikt.fremd.geaendertVon || "Jemand anderes"}</strong> hat den Bericht
                {stoerKonflikt.fremd.updatedAt
                  ? ` am ${new Date(stoerKonflikt.fremd.updatedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                  : ""} bearbeitet, während deine Maske offen war.
              </p>
              <p className="mb-1" style={{ color: "#5B6572" }}>Speicherst du jetzt, ersetzt deine Fassung die andere.</p>
              <div className="rounded-lg p-3 mt-3" style={{ backgroundColor: "#F7F9FB", border: "1px solid #E7EAED", fontSize: "0.84rem" }}>
                <div className="font-extrabold uppercase mb-1" style={{ fontSize: "0.6rem", letterSpacing: "0.5px", color: "#5B6572" }}>Die andere Fassung sagt</div>
                <div style={{ color: "#39414B", whiteSpace: "pre-wrap" }}>{stoerKonflikt.fremd.stoerung || "—"}</div>
                {stoerKonflikt.fremd.getan && <div className="mt-1" style={{ color: "#5B6572" }}>🔧 {stoerKonflikt.fremd.getan}</div>}
                {stoerKonflikt.fremd.nochZuTun && <div className="mt-1" style={{ color: "#C0392B" }}>📌 {stoerKonflikt.fremd.nochZuTun}</div>}
              </div>
            </div>
            <div className="px-5 py-3 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid #EFF1F3", backgroundColor: "#FAFBFC" }}>
              <button
                onClick={() => {
                  // Die eigene Eingabe wird verworfen, der fremde Stand steht.
                  const f = stoerKonflikt.fremd;
                  setStoerKonflikt(null);
                  setStoerModal({ mode: "view", id: f.id });
                  oeffneStoerDetail(f);
                }}
                className="rounded-lg font-bold"
                style={{ fontSize: "0.85rem", padding: "8px 14px", backgroundColor: "#EEF1F4", color: "#5B6572" }}
              >Andere Fassung übernehmen</button>
              <span className="ml-auto" />
              <button
                onClick={async () => {
                  const d = stoerKonflikt.draft;
                  setStoerKonflikt(null);
                  await speichereStoerung(d, true);
                }}
                className="rounded-lg font-bold text-white"
                style={{ fontSize: "0.85rem", padding: "8px 16px", backgroundColor: "#C0392B" }}
              >Meine Fassung speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* Termin-Archiv: versäumte TPM-/R+I-Termine, die älter als eine Woche
          sind. Nur eine andere Sicht auf dieselben offenen Einträge - Klick
          öffnet den Termin wie aus der Übersicht, dort wird erledigt oder
          verschoben. */}
      {terminArchivOffen && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => setTerminArchivOffen(false)}
        >
          <div
            role="dialog"
            aria-label="Termin-Archiv"
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "22px", width: "680px", maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="font-bold text-sm">🗄 Termin-Archiv</div>
              <button onClick={() => setTerminArchivOffen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>
            <div className="text-xs mb-4" style={{ color: "#8A9099" }}>
              Versäumte Termine, die älter als eine Woche sind. Sie bleiben offen und zählen im Prüfnachweis
              weiter als versäumt – ein Klick öffnet den Termin zum Erledigen oder Verschieben.
            </div>
            {[["TPM", "TPM – Wartung"], ["RI", "R+I – Rundgang & Inspektion"]].map(([kat, titel]) => {
              const liste = terminArchiv.filter((e) => e.category === kat);
              return (
                <div key={kat} className="mb-4">
                  <div className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: "#8A9099" }}>{titel} ({liste.length})</div>
                  {liste.length === 0 && <div className="text-xs italic" style={{ color: "#B7BEC6" }}>nichts im Archiv</div>}
                  {liste.map((e) => {
                    const tage = Math.round((new Date(todayKey + "T00:00:00") - new Date(e.date + "T00:00:00")) / 86400000);
                    return (
                      <button
                        key={e.id}
                        onClick={() => { setTerminArchivOffen(false); openEditModal(e); }}
                        className="wk-karte wk-karte-hebt w-full flex items-center gap-2.5 px-3 py-2.5 mb-2 text-left"
                        style={{ backgroundColor: "#F9FAFB", boxShadow: "inset 3px 0 0 0 #8A9099, var(--wk-schatten)" }}
                      >
                        <span className={`wk-chip wk-chip-${String(e.category).toLowerCase()}`}>{CATS[e.category].label}</span>
                        <strong className="flex-1" style={{ fontSize: "var(--wk-txt)" }}>{e.name}</strong>
                        <span className="font-mono" style={{ fontSize: "var(--wk-txt-etikett)", color: "#B23A34" }}>{formatDateDE(e.date)}</span>
                        <span style={{ fontSize: "var(--wk-txt-etikett)", color: "#8A9099", whiteSpace: "nowrap" }}>vor {tage} Tagen</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {druckWahlOffen && druckAngebot() && (() => {
        const angebot = druckAngebot();
        const gewaehlt = angebot.optionen.find((o) => o.id === druckOption) || angebot.optionen[0];
        const vorlage = druckVorlage(gewaehlt.id);
        // Blattmaße bei 96 dpi, so wie der Drucker sie sieht.
        const quer = /size:\s*A[34] landscape/.test(vorlage.html);
        const a3 = /size:\s*A3/.test(vorlage.html);
        const blattBreite = a3 ? 1587 : quer ? 1123 : 794;
        const blattHoehe = a3 ? 1123 : quer ? 794 : 1123;
        // Robertos Ansage vom 13.08.: Die Vorschau soll deutlich größer sein.
        // Statt fester 430 px nimmt sie sich so viel Platz, wie Blattform und
        // Bildschirm hergeben - begrenzt über Breite UND Höhe, damit das
        // Blatt ohne Blättern im Dialog steht.
        const maxBreite = 640;
        const maxHoehe = Math.max(420, Math.round((typeof window !== "undefined" ? window.innerHeight : 900) * 0.72));
        const massstab = Math.min(maxBreite / blattBreite, maxHoehe / blattHoehe);
        const rahmenBreite = Math.round(blattBreite * massstab);
        return (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
          onClick={() => setDruckWahlOffen(false)}
        >
          <div
            role="dialog"
            aria-label="Was soll gedruckt werden?"
            style={{ backgroundColor: "white", borderRadius: "10px", padding: "22px", width: `${rahmenBreite + 560}px`, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-sm">{angebot.titel}</div>
              <button onClick={() => setDruckWahlOffen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>

            <div className="flex gap-5">
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                {angebot.umfang && (
                  <>
                    <div className="text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: "#8A9099" }}>Umfang</div>
                    <div className="flex gap-2 mb-4 flex-wrap">
                      {[["ALLE", "Beide (TPM & R+I)"], ["TPM", "Nur TPM"], ["RI", "Nur R+I"]].map(([wert, text]) => (
                        <button
                          key={wert}
                          onClick={() => setDruckUmfang(wert)}
                          aria-pressed={druckUmfang === wert}
                          className="px-3 py-1.5 rounded font-bold text-xs border"
                          style={druckUmfang === wert
                            ? { backgroundColor: "#2F6690", borderColor: "#2F6690", color: "white" }
                            : { backgroundColor: "white", borderColor: "#C9D0D8", color: "#5B6572" }}
                        >{text}</button>
                      ))}
                    </div>
                  </>
                )}

                <div className="text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: "#8A9099" }}>Blatt</div>
                <div className="flex flex-col gap-2 mb-4">
                  {angebot.optionen.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setDruckOption(o.id)}
                      aria-pressed={gewaehlt.id === o.id}
                      className="text-left px-3 py-2 rounded border"
                      style={gewaehlt.id === o.id
                        ? { backgroundColor: "#EEF3F8", borderColor: "#2F6690" }
                        : { backgroundColor: "white", borderColor: "#E2E4E7" }}
                    >
                      <div className="font-bold text-xs" style={{ color: "#22262B" }}>{o.text}</div>
                      <div className="text-[11px]" style={{ color: "#8A9099" }}>{o.erklaerung}</div>
                    </button>
                  ))}
                </div>

                {gewaehlt.monatsWahl && (
                  <div className="grid grid-cols-4 gap-1 mb-4">
                    {MONTHS.map((name, i) => (
                      <button
                        key={name}
                        onClick={() => setDruckMonat(i)}
                        aria-pressed={druckMonat === i}
                        className="px-2 py-1.5 rounded font-bold text-[11px] border"
                        style={druckMonat === i
                          ? { backgroundColor: "#2F6690", borderColor: "#2F6690", color: "white" }
                          : { backgroundColor: "white", borderColor: "#C9D0D8", color: "#5B6572" }}
                      >{name}</button>
                    ))}
                  </div>
                )}

                {gewaehlt.id === "nachweis" && (
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: "#8A9099" }}>Jahr</span>
                    <select
                      value={nachweisJahr}
                      onChange={(ev) => setNachweisJahr(Number(ev.target.value))}
                      className="px-2 py-1.5 rounded border bg-white text-xs font-bold"
                      style={{ borderColor: "#C9D0D8", color: "#5B6572" }}
                      aria-label="Jahr des Prüfnachweises"
                    >
                      {nachweisJahre.map((j) => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Vorschau */}
              <div style={{ flex: "0 0 auto", width: `${rahmenBreite}px` }}>
                <div className="text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: "#8A9099" }}>
                  Vorschau · {a3 ? "A3 quer" : quer ? "A4 quer" : "A4 hoch"}
                  {vorschauSeiten > 1 ? ` · Blatt 1 von ${vorschauSeiten}` : ""}
                </div>
                <div
                  style={{ width: `${rahmenBreite}px`, height: `${Math.round(blattHoehe * massstab)}px`,
                           border: "1px solid #C9D0D8", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                           overflow: "hidden", backgroundColor: "white" }}
                >
                  <iframe
                    title="Druckvorschau"
                    aria-label="Druckvorschau"
                    srcDoc={vorlage.html}
                    /* Wie viele Blätter es werden, sagt die Vorlage selbst -
                       gemessen an ihrer Höhe, nicht geschätzt. */
                    onLoad={(ev) => {
                      try {
                        const d = ev.target.contentDocument;
                        const seiten = Math.max(1, Math.ceil(d.body.scrollHeight / blattHoehe - 0.02));
                        setVorschauSeiten((alt) => (alt === seiten ? alt : seiten));
                      } catch (e) { /* ohne Zugriff bleibt es bei einem Blatt */ }
                    }}
                    style={{ width: `${blattBreite}px`, height: `${blattHoehe}px`, border: "none",
                             transform: `scale(${massstab})`, transformOrigin: "top left" }}
                  />
                </div>
                <div className="text-[11px] mt-1" style={{ color: "#8A9099" }}>
                  Verkleinert auf {Math.round(massstab * 100)} % – so kommt es aus dem Drucker.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setDruckWahlOffen(false)}
                className="px-3 py-1.5 rounded font-bold text-xs border"
                style={{ backgroundColor: "white", borderColor: "#C9D0D8", color: "#5B6572" }}
              >Abbrechen</button>
              {angebot.anzeige && (
                <button
                  /* Zum Zeigen am Monitor: dieselbe Vorlage, nur ohne
                     Druckdialog. Von dort aus liefert Drucken → „Als PDF
                     speichern" auch die PDF. */
                  onClick={handleDruckAnzeige}
                  className="px-4 py-1.5 rounded font-bold text-xs uppercase tracking-wide border"
                  style={{ backgroundColor: "white", borderColor: "#2F6690", color: "#2F6690" }}
                >Am Bildschirm zeigen</button>
              )}
              <button
                onClick={handleDruckWahl}
                className="flex items-center gap-2 text-white px-4 py-1.5 rounded font-bold text-xs uppercase tracking-wide"
                style={{ backgroundColor: "#C97A2B" }}
              ><Printer size={14} /> Drucken</button>
            </div>
          </div>
        </div>
);
      })()}

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
              <div className="font-bold text-sm">Gemeinsame Datei (Firmenlaufwerk)</div>
              <button onClick={() => setShareOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>

            {/* Benutzergruppen: Auch Nur-Leser haben dieses Fenster - deshalb
                steht der Benutzerwechsel hier und nicht (nur) im Zahnrad. */}
            {benutzerAktiv && meinBenutzer && (
              <div className="text-xs rounded px-3 py-2 mb-3 flex items-center gap-2" style={{ backgroundColor: "#F1F3F5", color: "#5B6572" }}>
                <span>Angemeldet als <strong>{meinBenutzer.name}</strong> ({BENUTZER_ROLLEN[meinBenutzer.rolle]})</span>
                <button onClick={() => { setShareOpen(false); abmelden(); }} className="ml-auto font-bold underline" style={{ color: "#5B6572" }}>
                  Benutzer wechseln …
                </button>
              </div>
            )}

            {!sharedFile.isSupported() ? (
              <div className="text-sm text-slate-600 leading-relaxed">
                Dieser Browser unterstützt den direkten Dateizugriff nicht. Bitte <strong>Microsoft Edge</strong> oder <strong>Google Chrome</strong> verwenden – dort funktioniert die gemeinsame Datei zuverlässig.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-slate-500 leading-relaxed">
                  Alle Einträge werden in einer JSON-Datei gespeichert, die auf dem Firmenlaufwerk liegt
                  (jeder für alle erreichbare Ordner geht). <strong>Wer die Datei
                  bearbeiten darf, legen die Datei-Rechte auf dem Laufwerk fest</strong> (IT-Freigabe): Mit
                  Schreibrechten kann man Einträge ändern, ohne Schreibrechte zeigt die App automatisch nur den
                  aktuellen Stand an (Aktualisierung alle 30 Sekunden).
                </div>

                {shareState.status === "connected" ? (
                  <div className="text-sm rounded px-3 py-2" style={{ backgroundColor: "#E5F3EA", color: "#2F7D4F" }}>
                    Verbunden mit <strong>{shareState.name}</strong> ({shareState.mode === "read" ? "nur ansehen" : "bearbeiten"}).
                    {/* Die Kennkarte darunter: Ein Pfad ist über den Browser nicht
                        zu bekommen, aber Eintragszahl, Größe und letzte Änderung
                        unterscheiden zwei gleichnamige Dateien zuverlässig. */}
                    <div className="mt-1" style={{ fontSize: "0.78rem", color: "#3F6B4E" }}>
                      {dateiKennkarte(sharedFile.fileInfo()) || "—"}
                    </div>
                    {!sharedFile.fileInfo().pfad && (
                      <div className="mt-0.5" style={{ fontSize: "0.72rem", color: "#5E8B6C" }}>
                        Wo die Datei liegt, kann der Browser nicht sagen. Gib unten den
                        Werkstatt-Ordner frei, dann steht hier auch der Ordnername.
                      </div>
                    )}
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

                {/* Konflikt-Wächter: Sync-Konfliktkopien automatisch einsammeln */}
                {shareState.status === "connected" && shareState.mode !== "read" && (
                  <div className="rounded px-3 py-2.5" style={{ border: "1.5px solid #6B7280", backgroundColor: "#F7F8F9" }}>
                    <div className="text-xs font-bold uppercase mb-1" style={{ color: "#5B6572" }}>Konflikt-Wächter</div>
                    <div className="text-xs mb-2" style={{ color: "#8A9099", lineHeight: 1.5 }}>
                      Nur relevant, falls die Datei je in einem per Cloud synchronisierten Ordner liegt – auf dem
                      Firmenlaufwerk entstehen keine Konfliktkopien. Sync-Programme legen bei Konflikten Kopien wie
                      „…-GERÄTENAME.json" an; mit einmaliger Ordner-Freigabe sammelt die App solche Kopien
                      automatisch ein und übernimmt den Inhalt sicher in die Hauptdatei.
                    </div>
                    {sharedFile.folderStatus() === "ok" ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold" style={{ color: "#2F7D4F" }}>✓ Aktiv – überwacht „{sharedFile.folderName()}"</span>
                        <button
                          onClick={async () => {
                            try { await sharedFile.forgetFolder(); } catch (e) { /* abgeschaltet wird trotzdem */ }
                            setShareState({ ...shareState });
                          }}
                          className="text-xs font-bold underline"
                          style={{ color: "#8A9099" }}
                        >
                          abschalten
                        </button>
                        {/* Tages-Sicherung im Datenordner (QoL 19.08.): nutzt
                            genau diese Freigabe - einmal am Tag eine Kopie in
                            den Unterordner "Sicherungen", dort greift auch die
                            IT-Datensicherung des Laufwerks. */}
                        <div className="w-full flex items-center gap-2 flex-wrap mt-1.5 pt-1.5 border-t" style={{ borderColor: "#E2E4E7" }} data-tick={sicherungTick}>
                          <span className="text-xs" style={{ color: "#5B6572" }}>
                            <strong>Tages-Sicherung:</strong>{" "}
                            {(() => {
                              const st = sharedFile.tagesSicherungStand();
                              return st
                                ? `zuletzt ${new Date(st.ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${st.datei}`
                                : "noch keine – läuft von selbst einmal am Tag";
                            })()}
                          </span>
                          <button
                            onClick={async () => {
                              const ok = await sharedFile.tagesSicherungJetzt().catch(() => false);
                              setSicherungTick((t) => t + 1);
                              if (!ok) setErr("Tages-Sicherung hat nicht geklappt – Ordner-Freigabe und Schreibrecht prüfen.");
                            }}
                            className="text-xs font-bold px-2.5 py-1 rounded text-white"
                            style={{ backgroundColor: "#2F6690" }}
                          >
                            Jetzt sichern
                          </button>
                        </div>
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

      {/* Anmeldung (Benutzergruppen): erscheint, sobald die gemeinsame Datei
          eine Benutzerliste trägt und dieses Gerät noch keinen (gültigen)
          Benutzer gewählt hat. Bewusst OHNE Wegklick-Möglichkeit: Bis zur
          Anmeldung ist die App Nur-Lesen - wer nur schauen will, meldet sich
          als Leser-Benutzer an (z. B. "MWerkstatt"). */}
      {/* Solange das Datei-Fenster offen ist, tritt die Anmeldung zurück -
          so lässt sich VOR der Anmeldung eine andere JSON verbinden
          (z. B. nach dem Umzug aufs Firmenlaufwerk). */}
      {anmeldungOffen && !loading && !shareOpen && (
        <div
          className="no-print"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(20,22,25,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: "16px" }}
        >
          <div role="dialog" aria-label="Anmelden" style={{ backgroundColor: "white", borderRadius: "var(--wk-eck)", width: "380px", maxWidth: "100%", padding: "20px 22px", boxShadow: "0 18px 60px rgba(0,0,0,0.35)" }}>
            <div className="font-extrabold text-sm mb-1" style={{ color: "#22262B" }}>Anmelden</div>
            <div className="text-xs mb-3" style={{ color: "#5B6572" }}>
              Für diese Werkstatt ist eine Benutzerliste eingerichtet. Einmal
              anmelden - dieses Gerät merkt sich die Wahl.
            </div>
            {/* Bewusst SCHREIBFELDER statt einer Auswahlliste (Robertos
                Ansage vom 10.08.): Ein Dropdown würde jedem alle
                Benutzernamen verraten und die Anmeldung auf einen Klick
                verkürzen. Wer sich anmeldet, muss den Namen kennen. */}
            <label className="block text-xs font-bold mb-1" style={{ color: "#5B6572" }}>Benutzername</label>
            <input
              aria-label="Benutzername"
              className="w-full border rounded px-2 py-1.5 text-sm mb-2"
              style={{ borderColor: "#C9CDD2" }}
              value={anmeldung.name}
              autoFocus
              onChange={(e) => setAnmeldung((v) => ({ ...v, name: e.target.value, fehler: "" }))}
              onKeyDown={(e) => { if (e.key === "Enter") anmelden(); }}
            />
            <label className="block text-xs font-bold mb-1" style={{ color: "#5B6572" }}>Kennwort</label>
            <input
              type="password"
              aria-label="Kennwort"
              className="w-full border rounded px-2 py-1.5 text-sm mb-2"
              style={{ borderColor: "#C9CDD2" }}
              value={anmeldung.kennwort}
              onChange={(e) => setAnmeldung((v) => ({ ...v, kennwort: e.target.value, fehler: "" }))}
              onKeyDown={(e) => { if (e.key === "Enter") anmelden(); }}
            />
            <div className="text-xs mb-2" style={{ color: "#8A9099" }}>Ohne vergebenes Kennwort das Feld leer lassen.</div>
            {anmeldung.fehler && (
              <div className="text-xs rounded px-2 py-1.5 mb-2" style={{ backgroundColor: "#FBEAE9", color: "#8C2B26" }}>{anmeldung.fehler}</div>
            )}
            <button
              onClick={anmelden}
              className="w-full rounded px-3 py-2 text-sm font-bold text-white"
              style={{ backgroundColor: "#22262B" }}
            >
              Anmelden
            </button>
            <button
              onClick={() => setAnmeldungZu(true)}
              className="w-full rounded px-3 py-2 text-sm font-bold mt-2 border"
              style={{ color: "#5B6572", borderColor: "#C9CDD2", backgroundColor: "#F7F8F9" }}
            >
              Nur ansehen (ohne Anmeldung)
            </button>
            <div className="text-xs mt-1" style={{ color: "#8A9099" }}>
              Ohne Anmeldung zeigt die App nur den aktuellen Stand – wie ein
              Aushang. Zum Bearbeiten später oben rechts anmelden.
            </div>
            <button
              onClick={() => setShareOpen(true)}
              className="w-full rounded px-3 py-2 text-sm font-bold mt-2 border"
              style={{ color: "#5B6572", borderColor: "#C9CDD2", backgroundColor: "#F7F8F9" }}
            >
              Gemeinsame Datei verbinden / wechseln …
            </button>
            <div className="text-xs mt-3" style={{ color: "#8A9099" }}>
              Benutzername unbekannt? Rechte und Benutzer pflegt der
              Werkstattleiter (Zahnrad → Team &amp; Schichten).
            </div>
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
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">Verwalten</div>
              <button onClick={() => setSettingsOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Schließen"><X size={18} /></button>
            </div>

            {/* Reiterleiste: vier Themen statt einer langen Rolle */}
            <div className="flex gap-1 mb-4 pb-2 border-b" style={{ borderColor: "#E2E4E7" }}>
              {[["anlagen", "Anlagen & R+I"], ["team", "Team & Schichten"], ["oee", "OEE"], ["pflege", "Verlauf & Sicherung"]].map(([k, name]) => (
                <button
                  key={k}
                  onClick={() => setSettingsTab(k)}
                  className="text-xs font-bold px-3 py-1.5 rounded"
                  style={settingsTab === k
                    ? { backgroundColor: "#22262B", color: "#fff" }
                    : { backgroundColor: "#F1F3F5", color: "#5B6572" }}
                >
                  {name}
                </button>
              ))}
            </div>

            {settingsTab === "anlagen" && (<>
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

            </>)}

            {settingsTab === "team" && (<>
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
                  {/* Geburtstag (freiwillig, 20.08.): frei getippt, TT.MM. oder
                      TT.MM.JJJJ. Leer = keine Erinnerung, kein Nachfragen. */}
                  <input
                    value={t.geburtstag || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSettingsTeam((prev) => prev.map((x, i) => (i === idx ? { ...x, geburtstag: v } : x)));
                    }}
                    placeholder="🎂 TT.MM."
                    aria-label={`Geburtstag von ${t.name.trim() || `Person ${idx + 1}`}`}
                    title="Geburtstag (freiwillig): TT.MM. oder TT.MM.JJJJ – mit Jahr steht am Tag auch das Alter. Leer lassen = keine Erinnerung."
                    className="text-xs border rounded px-2 py-1.5"
                    style={{ borderColor: "#D6D9DC", width: "96px", flexShrink: 0 }}
                  />
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

            </>)}

            {settingsTab === "anlagen" && (<>
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

            </>)}

            {settingsTab === "team" && (<>
            <div className="text-xs font-bold uppercase mb-2 pt-3 border-t" style={{ color: "#5B6572", borderColor: "#E2E4E7" }}>Dein Name (dieses Gerät)</div>
            <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
              Wird im Verlauf und bei Störmeldungen als Urheber eingetragen. Bleibt auf diesem Gerät.
              {benutzerAktiv && meinBenutzer && <> Angemeldet als <strong>{meinBenutzer.name}</strong> ({BENUTZER_ROLLEN[meinBenutzer.rolle]}).</>}
            </div>
            <input
              value={zettelName}
              onChange={(e) => { setZettelName(e.target.value); try { localStorage.setItem("werkstatt-kalender-name", e.target.value.trim()); } catch (err) { /* Speicher voll o. ä. */ } }}
              placeholder="z. B. R. Ciraci"
              className="w-full text-sm px-2 py-1.5 rounded border mb-5"
              style={{ borderColor: "#D7DCE1" }}
            />

            {/* G1: Der Name der Werkstatt - Kopfzeile und Druckköpfe. Leer =
                weiterhin "Werkstatt-Cockpit". Gespeichert beim Verlassen des
                Feldes, für alle (gemeinsame Einstellungen). */}
            {!readerMode && (
              <>
                <div className="text-xs font-bold uppercase mb-2" style={{ color: "#5B6572" }}>Name der Werkstatt (Kopfzeile &amp; Ausdrucke)</div>
                <input
                  value={werkstattName}
                  onChange={(e) => setWerkstattName(e.target.value)}
                  onBlur={() => persistConfig(tpmAnlagen, riItems, team, extraSchichten, anlagenteile, links, oeeQuelle, null, werkstattName)}
                  placeholder="z. B. Werkstatt Scheurich"
                  aria-label="Name der Werkstatt"
                  className="w-full text-sm px-2 py-1.5 rounded border mb-5"
                  style={{ borderColor: "#D7DCE1" }}
                />
              </>
            )}

            {/* Benutzer & Rechte: sichtbar für Verwalter - und für alle,
                solange noch KEINE Liste existiert (sonst könnte niemand die
                erste anlegen). Die Rechte hängen nicht an den Datei-Freigaben:
                Datei-Ebene gibt allen dieselbe Datei, die App entscheidet
                nach Benutzername. */}
            {istVerwalter && (<>
            <div className="text-xs font-bold uppercase mb-2 pt-3 border-t" style={{ color: "#5B6572", borderColor: "#E2E4E7" }}>Benutzer &amp; Rechte (Anmeldung)</div>
            <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
              Sobald hier Benutzer stehen, fragt die App beim ersten Start nach dem
              Benutzernamen; das Gerät merkt sich die Wahl. <strong>Leser</strong> können
              nur ansehen (Störungen melden bleibt erlaubt), <strong>Bearbeiter</strong> schreiben,
              <strong> Verwalter</strong> pflegen zusätzlich diese Liste. Kennwort ist freiwillig
              (leer lassen = Änderung/keins). Das ist eine Leitplanke gegen Versehen – echtes
              Sperren leisten nur die Laufwerksrechte der IT.
            </div>
            {settingsBenutzer.map((b, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-1.5">
                <input
                  value={b.name}
                  aria-label={`Benutzername ${idx + 1}`}
                  onChange={(e) => { const v = e.target.value; setSettingsBenutzer((prev) => prev.map((x, i) => (i === idx ? { ...x, name: v } : x))); }}
                  placeholder="z. B. RobertoCiraci"
                  className="flex-1 text-sm px-2 py-1.5 rounded border"
                  style={{ borderColor: "#D7DCE1" }}
                />
                <select
                  value={b.rolle}
                  aria-label={`Rolle ${idx + 1}`}
                  onChange={(e) => { const v = e.target.value; setSettingsBenutzer((prev) => prev.map((x, i) => (i === idx ? { ...x, rolle: v } : x))); }}
                  className="text-sm px-2 py-1.5 rounded border"
                  style={{ borderColor: "#D7DCE1", width: "130px" }}
                >
                  <option value="verwalter">Verwalter</option>
                  <option value="bearbeiter">Bearbeiter</option>
                  <option value="leser">Leser</option>
                </select>
                <input
                  type="password"
                  value={b.kennwortNeu}
                  aria-label={`Kennwort ${idx + 1}`}
                  onChange={(e) => { const v = e.target.value; setSettingsBenutzer((prev) => prev.map((x, i) => (i === idx ? { ...x, kennwortNeu: v } : x))); }}
                  placeholder={b.kennwortHash ? "Kennwort gesetzt" : "Kennwort (optional)"}
                  className="text-sm px-2 py-1.5 rounded border"
                  style={{ borderColor: "#D7DCE1", width: "150px" }}
                />
                <button
                  onClick={() => setSettingsBenutzer((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Benutzer entfernen"
                  className="text-slate-400 hover:text-red-600"
                ><X size={15} /></button>
              </div>
            ))}
            <button
              onClick={() => setSettingsBenutzer((prev) => [...prev, { name: "", rolle: prev.length === 0 ? "verwalter" : "bearbeiter", kennwortHash: "", kennwortNeu: "" }])}
              className="text-xs font-bold mb-2"
              style={{ color: "#22262B" }}
            >
              + Benutzer hinzufügen
            </button>
            <div className="text-xs mb-5" style={{ color: "#8A9099" }}>
              {settingsBenutzer.length === 0
                ? "Ohne Benutzer verhält sich die App wie bisher (keine Anmeldung). Der erste Benutzer sollte der Verwalter sein."
                : "Mindestens ein Verwalter muss bleiben - das prüft die App beim Speichern."}
              {benutzerAktiv && meinBenutzer && (
                <> · <button onClick={() => { setSettingsOpen(false); abmelden(); }} className="font-bold underline" style={{ color: "#5B6572" }}>Benutzer wechseln …</button></>
              )}
            </div>
            </>)}

            </>)}

            {settingsTab === "pflege" && (<>
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

            {/* ---- Programm-Fassung: Updates --------------------------------
                Nur sichtbar, wenn die App als Programm laeuft. Der Rahmen
                schaut in diesem Ordner nach neuen App-HTML-Dateien - dem
                selben Ordner, in den heute schon jede neue Version gelegt
                wird. Der Update-Ablauf der Werkstatt bleibt also derselbe. */}
            {programmUpdateStatus !== null && (
              <>
                <div className="text-xs font-bold uppercase mb-2 pt-3 border-t" style={{ color: "#5B6572", borderColor: "#E2E4E7" }}>Programm-Updates</div>
                <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
                  Das Programm schaut alle 5 Minuten in diesen Ordner. Liegt dort eine neuere
                  <span className="font-mono"> Werkstatt_Kalender_TPM*.html</span>, erscheint oben „Neue Version verfügbar" –
                  ein Klick übernimmt sie. Eine unvollständig kopierte Datei wird nie übernommen.
                </div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <input
                    type="text"
                    value={programmUpdateStatus.eingabe}
                    onChange={(e) => setProgrammUpdateStatus((v) => ({ ...v, eingabe: e.target.value, meldung: "" }))}
                    placeholder={"Pfad einfügen, z. B. \\\\server\\werkstatt\\Werkstatt_Kalender"}
                    className="text-xs rounded px-2 py-1.5 font-mono flex-1"
                    style={{ border: "1px solid #D8DDE3", minWidth: "260px" }}
                    aria-label="Update-Ordner Pfad"
                  />
                  <button
                    onClick={async () => {
                      try {
                        const pfad = (programmUpdateStatus.eingabe || "").trim().replace(/^"|"$/g, "");
                        if (pfad) {
                          const art = await window.__werkstattDesktop.pfadInfo(pfad);
                          if (art !== "ordner") { setProgrammUpdateStatus((v) => ({ ...v, meldung: "Unter diesem Pfad wurde kein Ordner gefunden." })); return; }
                        }
                        await window.__werkstattDesktop.updateOrdnerSetzen(pfad || null);
                        setProgrammUpdateStatus((v) => ({ ...v, ordner: pfad, eingabe: pfad, meldung: pfad ? "✓ übernommen – es wird ab jetzt hier nachgesehen" : "Update-Prüfung ausgeschaltet" }));
                      } catch (e) { setProgrammUpdateStatus((v) => ({ ...v, meldung: String((e && e.message) || e) })); }
                    }}
                    className="text-xs font-bold px-2.5 py-1.5 rounded text-white"
                    style={{ backgroundColor: "#2F6690" }}
                  >
                    Übernehmen
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const pfad = await window.__werkstattDesktop.waehleOrdner();
                        if (!pfad) return;
                        await window.__werkstattDesktop.updateOrdnerSetzen(pfad);
                        setProgrammUpdateStatus((v) => ({ ...v, ordner: pfad, eingabe: pfad, meldung: "✓ übernommen – es wird ab jetzt hier nachgesehen" }));
                      } catch (e) { setProgrammUpdateStatus((v) => ({ ...v, meldung: String((e && e.message) || e) })); }
                    }}
                    className="text-xs font-bold px-2.5 py-1.5 rounded"
                    style={{ backgroundColor: "#EEF1F4", color: "#2F6690" }}
                  >
                    Ordner wählen …
                  </button>
                </div>
                <div className="text-xs mb-5" style={{ color: programmUpdateStatus.meldung && programmUpdateStatus.meldung.startsWith("✓") ? "#1F7A3D" : "#8A9099" }}>
                  {programmUpdateStatus.meldung
                    || (programmUpdateStatus.ordner ? `Aktiv: ${programmUpdateStatus.ordner}` : "Noch kein Update-Ordner eingerichtet.")}
                </div>
              </>
            )}

            </>)}

            {settingsTab === "oee" && (<>
            {/* ---- OEE aus einer Excel-Tabelle ------------------------------
                Die Tabelle liegt im Datenordner neben der gemeinsamen Datei.
                Gespeichert wird nur der DATEINAME und die Spaltenzuordnung -
                ein Dateiverweis lässt sich nicht weitergeben, jedes Gerät
                findet die Tabelle über seinen eigenen Ordnerzugriff.
                Geschrieben wird in die Tabelle nie. */}
            <div className="text-xs font-bold uppercase mb-2 pt-3 border-t" style={{ color: "#5B6572", borderColor: "#E2E4E7" }}>OEE aus Excel</div>
            {settingsOee && (() => {
              const o = settingsOee;
              const blatt = (o.blaetter || []).find((b) => b.name === o.blatt);
              const kopf = blatt ? blatt.kopf : [];
              const felder = [
                ["datum", "Datum"], ["zeit", "Uhrzeit"], ["anlage", "Anlage"], ["schicht", "Schicht"],
                ["oee", "OEE"], ["verfuegbarkeit", "Verfügbarkeit"], ["leistung", "Leistung"], ["qualitaet", "Qualität"],
              ];
              const setzeSpalte = (feld, wert) => setSettingsOee((v) => {
                const s = { ...(v.spalten || {}) };
                if (wert === "") delete s[feld]; else s[feld] = Number(wert);
                return { ...v, spalten: s };
              });
              return (
                <div className="mb-5">
                  <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
                    Die Kachel auf der Übersicht liest die Zahl direkt aus der Tabelle – gelesen wird jede Minute,
                    aber nur wenn Excel die Datei wirklich geändert hat. In die Tabelle wird nie geschrieben.
                  </div>
                  {/* Der Ordner mit der OEE-Tabelle liegt auf dem Firmenlaufwerk,
                      nicht bei den Daten - deshalb ein eigener, rein LESENDER
                      Zugriff. Er gilt pro Gerät: Ein Ordnerzugriff lässt sich
                      nicht weitergeben. Der Dateiname und die Spaltenzuordnung
                      dagegen stehen in der gemeinsamen Datei und gelten für alle. */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-bold" style={{ color: "#5B6572" }}>Ordner mit der Tabelle:</span>
                    {sharedFile.quellOrdnerStatus() === "ok" ? (
                      <span className="text-xs font-mono rounded px-2 py-1" style={{ backgroundColor: "#EAF3EC", color: "#1F7A3D" }}>
                        📁 {sharedFile.quellOrdnerName()}
                      </span>
                    ) : sharedFile.quellOrdnerStatus() === "needs-permission" ? (
                      <button
                        onClick={async () => {
                          try { await sharedFile.reconnectQuellOrdner(); setSettingsOee((v) => ({ ...v, lage: "", text: "" })); await oeeDateienSuchen(); }
                          catch (e) { setSettingsOee((v) => ({ ...v, lage: "fehler", text: String((e && e.message) || e) })); }
                        }}
                        className="text-xs font-bold px-2.5 py-1.5 rounded"
                        style={{ backgroundColor: "#FBF3DA", color: "#7A5A00" }}
                      >
                        „{sharedFile.quellOrdnerName()}" wieder freigeben
                      </button>
                    ) : sharedFile.quellOrdnerStatus() === "ersatz" ? (
                      <span className="text-xs" style={{ color: "#8A9099" }}>
                        keiner gewählt – es wird im Datenordner „{sharedFile.quellOrdnerName()}" gesucht
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "#8A9099" }}>noch keiner gewählt</span>
                    )}
                    <button
                      onClick={async () => {
                        try { await sharedFile.pickQuellOrdner(); setSettingsOee((v) => ({ ...v, lage: "", text: "" })); await oeeDateienSuchen(); }
                        catch (e) { setSettingsOee((v) => ({ ...v, lage: "fehler", text: String((e && e.message) || e) })); }
                      }}
                      className="text-xs font-bold px-2.5 py-1.5 rounded"
                      style={{ backgroundColor: "#EEF1F4", color: "#2F6690" }}
                    >
                      Ordner wählen …
                    </button>
                    {sharedFile.quellOrdnerStatus() !== "none" && sharedFile.quellOrdnerStatus() !== "ersatz" && (
                      <button
                        onClick={async () => { await sharedFile.vergissQuellOrdner(); setSettingsOee((v) => ({ ...v, dateien: null, blaetter: null })); }}
                        className="text-xs font-bold px-2 py-1.5 rounded"
                        style={{ backgroundColor: "#F7F8F9", color: "#B23A34" }}
                      >
                        Ordner vergessen
                      </button>
                    )}
                  </div>
                  {/* Pfadzeile: Wer den Pfad schon in der Zwischenablage hat,
                      soll ihn einfach einfuegen koennen statt sich durch den
                      Dialog zu klicken. Zeigt der Pfad direkt auf die .xlsx,
                      werden Ordner UND Datei in einem Rutsch uebernommen.
                      Nur im Programm - der Browser kann aus einem Pfad-Text
                      keinen Zugriff machen, das verbietet seine Sandbox. */}
                  {window.__werkstattDesktop && (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <input
                        type="text"
                        value={(o.pfadEingabe != null ? o.pfadEingabe : "")}
                        onChange={(e) => setSettingsOee((v) => ({ ...v, pfadEingabe: e.target.value }))}
                        placeholder={"… oder Pfad einfügen (Ordner oder direkt die .xlsx)"}
                        className="text-xs rounded px-2 py-1.5 font-mono flex-1"
                        style={{ border: "1px solid #D8DDE3", minWidth: "260px" }}
                        aria-label="OEE-Pfad einfügen"
                      />
                      <button
                        onClick={async () => {
                          try {
                            const erg = await sharedFile.setzeQuellOrdnerPfad(o.pfadEingabe);
                            setSettingsOee((v) => ({ ...v, lage: "", text: "" }));
                            if (erg.dateiName && erg.dateiName.toLowerCase().endsWith(".xlsx")) {
                              // Datei-Auswahl sichtbar machen, damit man SIEHT, was übernommen wurde
                              setSettingsOee((v) => ({ ...v, dateien: [erg.dateiName] }));
                              await oeeTabellePruefen(erg.dateiName, "");
                            } else {
                              await oeeDateienSuchen();
                            }
                          } catch (e) {
                            setSettingsOee((v) => ({ ...v, lage: "fehler", text: String((e && e.message) || e) }));
                          }
                        }}
                        className="text-xs font-bold px-2.5 py-1.5 rounded text-white"
                        style={{ backgroundColor: "#2F6690" }}
                      >
                        Pfad übernehmen
                      </button>
                    </div>
                  )}
                  <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
                    Der Ordner wird nur <strong>lesend</strong> geöffnet – die App kann auf dem Laufwerk nichts verändern.
                    Er gilt für dieses Gerät; jeder Arbeitsplatz wählt ihn einmal selbst.
                    Die Zuordnung darunter gilt für alle.
                  </div>
                  {sharedFile.quellOrdnerStatus() === "none" ? (
                    <div className="text-xs rounded px-3 py-2 mb-2" style={{ backgroundColor: "#FBF3DA", color: "#7A5A00" }}>
                      Ohne Ordner findet die App die Tabelle nicht. Entweder oben einen wählen –
                      oder die Tabelle liegt im Datenordner, dann genügt dessen Freigabe.
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <button onClick={oeeDateienSuchen} className="text-xs font-bold px-2.5 py-1.5 rounded" style={{ backgroundColor: "#EEF1F4", color: "#2F6690" }}>
                        Tabellen im Ordner suchen
                      </button>
                      {o.dateien && o.dateien.length > 0 && (
                        <select
                          value={o.datei || ""}
                          onChange={(e) => oeeTabellePruefen(e.target.value, "")}
                          className="text-xs rounded px-2 py-1.5"
                          style={{ border: "1px solid #D8DDE3", maxWidth: "260px" }}
                          aria-label="Excel-Tabelle wählen"
                        >
                          <option value="">– Tabelle wählen –</option>
                          {o.dateien.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      )}
                      {o.blaetter && o.blaetter.length > 0 && (
                        <select
                          value={o.blatt || ""}
                          onChange={(e) => oeeTabellePruefen(o.datei, e.target.value)}
                          className="text-xs rounded px-2 py-1.5"
                          style={{ border: "1px solid #D8DDE3" }}
                          aria-label="Tabellenblatt wählen"
                        >
                          {o.blaetter.map((b) => <option key={b.name} value={b.name}>{b.name} ({b.zeilen} Zeilen)</option>)}
                        </select>
                      )}
                    </div>
                  )}
                  {o.lage === "laedt" && <div className="text-xs italic" style={{ color: "#8A9099" }}>Tabelle wird gelesen …</div>}
                  {o.text && <div className="text-xs mb-2" style={{ color: o.lage === "fehler" ? "#B23A34" : "#8A9099" }}>{o.text}</div>}

                  {kopf.length > 0 && (
                    <>
                      <div className="text-xs mb-1.5" style={{ color: "#5B6572" }}>
                        Welche Spalte ist was? (erkannt an der Überschrift – hier änderbar)
                      </div>
                      <div className="grid gap-1.5 mb-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
                        {felder.map(([feld, label]) => (
                          <label key={feld} className="flex items-center gap-1.5 text-xs">
                            <span style={{ color: "#5B6572", minWidth: "84px" }}>{label}</span>
                            <select
                              value={o.spalten && o.spalten[feld] != null ? o.spalten[feld] : ""}
                              onChange={(e) => setzeSpalte(feld, e.target.value)}
                              className="text-xs rounded px-1.5 py-1 flex-1"
                              style={{ border: "1px solid #D8DDE3", minWidth: 0 }}
                              aria-label={`Spalte für ${label}`}
                            >
                              <option value="">– keine –</option>
                              {/* Array.from: der zusammengesetzte Kopf hat Lücken,
                                  und map() würde sie überspringen - dann wären
                                  unbeschriftete Spalten gar nicht wählbar. */}
                              {Array.from(kopf).map((z, i) => (
                                <option key={i} value={i}>{String(z == null || z === "" ? `Spalte ${i + 1}` : z).slice(0, 40)}</option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
                        Fehlt die OEE-Spalte, wird sie aus Verfügbarkeit × Leistung × Qualität gerechnet.
                        Für „letzte 24 Stunden" braucht es einen Zeitpunkt je Zeile: eine Uhrzeitspalte, eine
                        Uhrzeit im Datum oder wenigstens die Schicht. Steht nur ein Datum in der Tabelle,
                        zeigt die Kachel den jüngsten Tag – und schreibt das auch dazu.
                      </div>
                    </>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={oeeUebernehmen}
                      disabled={!o.datei}
                      className="text-xs font-bold px-3 py-1.5 rounded text-white"
                      style={{ backgroundColor: o.datei ? "#2F6690" : "#C3C7CB" }}
                    >
                      OEE-Quelle übernehmen
                    </button>
                    {oeeEingerichtet(oeeQuelle) && (
                      <button onClick={oeeEntfernen} className="text-xs font-bold px-2.5 py-1.5 rounded" style={{ backgroundColor: "#F7F8F9", color: "#B23A34" }}>
                        Entfernen
                      </button>
                    )}
                    <span className="text-xs" style={{ color: "#8A9099" }}>
                      {oeeEingerichtet(oeeQuelle)
                        ? `Aktiv: ${oeeQuelle.datei}${oeeQuelle.blatt ? " · " + oeeQuelle.blatt : ""}`
                        : "Noch keine Tabelle eingerichtet"}
                      {oeeStand.lage === "ok" && ` · zuletzt gelesen ${new Date(oeeStand.gelesenAm).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}
                      {oeeStand.lage === "fehler" && ` · ${oeeStand.text}`}
                    </span>
                  </div>
                </div>
              );
            })()}

            </>)}

            {settingsTab === "pflege" && (<>
            <div className="text-xs font-bold uppercase mb-2 pt-3 border-t" style={{ color: "#5B6572", borderColor: "#E2E4E7" }}>Sicherungen (dieses Gerät)</div>
            <div className="text-xs mb-2" style={{ color: "#8A9099" }}>
              Bei jedem Speichern wird der Stand hier zusätzlich lokal gesichert - falls doch mal etwas schiefgeht, kannst du eine frühere Version wiederherstellen.
              Aufgehoben werden die 30 jüngsten Stände und zusätzlich je Tag der letzte Stand der vergangenen 14 Tage.
            </div>
            {backups.length === 0 ? (
              <div className="text-xs italic mb-5" style={{ color: "#C3C7CB" }}>Noch keine Sicherung vorhanden.</div>
            ) : (
              // Alle anzeigen (die Liste ist von Haus aus begrenzt): Eine
              // Kürzung auf die jüngsten würde genau die Tagesstände verdecken,
              // wegen denen der Speicher überhaupt so weit zurückreicht.
              <div className="flex flex-col gap-1 mb-5" style={{ maxHeight: "220px", overflowY: "auto" }}>
                {backups.map((b) => (
                  <div key={b.ts} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded" style={{ backgroundColor: "#F7F8F9" }}>
                    <span className="text-xs font-mono" style={{ color: "#5B6572" }}>
                      {new Date(b.ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {/* b.anzahl zählt nur die fachlichen Einträge - Einstellungen
                          und Verlaufszeilen stecken zwar mit in der Sicherung,
                          würden die Zahl aber unbrauchbar aufblähen. */}
                      <span style={{ color: "#C3C7CB" }}> · {b.anzahl != null ? b.anzahl : (b.entries || []).length} Einträge</span>
                    </span>
                    <button onClick={() => setRestoreConfirm(b)} className="text-xs font-bold flex-shrink-0" style={{ color: "#2F6690" }}>
                      Wiederherstellen
                    </button>
                  </div>
                ))}
              </div>
            )}

            </>)}

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
            {/* Versionsstand: Wann wurde DIESE App-Fassung gebaut? Gemessen am
                07.08.: Roberto sass beim OEE-Einrichten vor einer aelteren
                Fassung ("Dropdown faengt bei Spalte 4 an"), und nichts in der
                App konnte ihm das sagen. Jetzt steht es hier - jede Frage
                "welche Version laeuft bei dir?" ist ein Blick ins Zahnrad. */}
            <div className="text-xs mt-2 font-mono" style={{ color: "#C3C7CB" }}>
              Version vom {new Date(__BUILD_ZEIT__).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} Uhr
              {typeof window !== "undefined" && window.__werkstattDesktop ? " · Programm-Fassung" : " · Browser-Fassung"}
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
      {/* Matrix und Trend stehen seit dem 18.08. HINTER dem Plan-Kalender
          (weiter unten im Baum): Erst der Blick nach vorn, dann die Historie. */}

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
                {/* Der Nachweis zum Vorlegen steckt jetzt hinter dem
                    Drucken-Knopf oben rechts - samt Jahreswahl und Vorschau. */}
                <span className="text-[11px]" style={{ color: "#8A9099", textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
                  Prüfnachweis: oben rechts über <strong>Drucken</strong>
                </span>
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
      {/* Der frühere Plan-Reiter lebt seit dem 18.08. HIER in der Monats-
          Auswertung weiter (Robertos Ansage: "Plan und Auswertung sind im
          Sinne der Sache dasselbe") - gleicher Kalender, gleiche Farben
          (TPM orange, R+I blau), gleiches Abhaken per Klick. */}
      {view === "MONAT" && (
        <div className="print-bg cal-card p-5 max-w-7xl mx-auto rounded-xl mt-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7", boxShadow: "0 2px 8px rgba(20,22,25,0.06)" }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-sm font-bold uppercase tracking-wide" style={{ color: "#22262B" }}>
              Plan-Kalender – {MONTHS[month]} {year}
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

          {/* Außer Betrieb (QoL Runde 3): der Plan sagt, WARUM eine Anlage
              in diesem Monat fehlt - sonst sähe es wie ein Rechenfehler aus. */}
          {(() => {
            const monatsAnfang = dateKey(year, month, 1);
            const monatsEnde = dateKey(year, month, daysInMonth);
            const pausierte = tpmAnlagen.filter((a) => a.pause && a.pause.von &&
              a.pause.von <= monatsEnde && (!a.pause.bis || a.pause.bis >= monatsAnfang));
            return pausierte.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 mb-3" style={{ backgroundColor: "#FBF3E6", border: "1px solid #E8D3AE" }}>
                <span aria-hidden="true">⏸</span>
                {pausierte.map((a) => (
                  <span key={a.id} className="text-xs font-bold" style={{ color: "#7A5B22" }}>
                    {a.name} – außer Betrieb {a.pause.bis ? `bis ${formatDateDE(a.pause.bis)}` : "bis auf Weiteres"}{a.pause.grund ? ` (${a.pause.grund})` : ""}
                  </span>
                ))}
              </div>
            ) : null;
          })()}

          <div className="flex gap-1.5 mb-1.5">
            <div style={{ width: "30px", flexShrink: 0 }} />
            <div className="grid grid-cols-7 gap-1.5 flex-1">
              {WEEKDAYS.map((w, i) => {
                {/* G4: der heutige Wochentag trägt eine Marke - aber nur im
                    laufenden Monat, sonst zeigt sie auf den falschen Tag. */}
                const heuteSpalte = year === today.getFullYear() && month === today.getMonth() && i === (today.getDay() + 6) % 7;
                return (
                  <div key={w} className="text-center text-xs font-bold uppercase font-mono py-1" style={{ color: heuteSpalte ? "#C97A2B" : i >= 5 ? "#6D93B8" : "#64748b" }}>{heuteSpalte ? "▾ " : ""}{w}</div>
                );
              })}
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
                          /* G4: die Heute-Spalte läuft dezent getönt durch den
                             Monat - Feiertage und Wochenenden behalten Vorrang. */
                          backgroundColor: holName ? "#FBE9E7" : weekend ? "#E5F0F8"
                            : (year === today.getFullYear() && month === today.getMonth() && new Date(year, month, d).getDay() === today.getDay()) ? "#FFF8EE" : "white",
                          borderColor: isToday ? "#C97A2B" : holName ? "#E8B4AE" : weekend ? "#C8DDEE" : "#E2E4E7",
                          borderWidth: isToday ? "2px" : "1px",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs" style={{ color: holName ? "#B23A34" : weekend ? "#5B87AB" : "#5B6572", fontWeight: holName ? 700 : 400 }}>{d}</span>
                          {/* Das + kam mit dem verschmolzenen Eingabe-Kalender
                              hierher: freie Einträge an jedem Tag anlegen. */}
                          {!readerMode && (
                            <button onClick={() => openAddModal(key)} className="text-slate-400 hover:text-slate-700 p-0.5" aria-label="Eintrag hinzufügen">
                              <Plus size={15} />
                            </button>
                          )}
                        </div>
                        {holName && <div className="text-xs font-bold" style={{ color: "#B23A34", marginTop: "-4px" }}>{holName}</div>}
                        <div className="flex flex-col gap-1">
                          {dayPlans.map((p, pi) => {
                            const done = isPlanDone(p);
                            const c = done ? "#2F7D4F" : planGroupColor(p.anlage, tpmAnlagen, riItems);
                            const notiz = notizJeTag.get(p.date + "|" + p.anlage);
                            return (
                              <div key={pi} className="flex items-stretch gap-1">
                                <button
                                  onClick={() => openPlanEntry(p)}
                                  disabled={readerMode}
                                  data-plan-datum={p.date}
                                  className="text-xs font-bold rounded px-1.5 py-1 text-left flex-1 min-w-0"
                                  style={{ position: "relative", color: c, border: `1px solid ${c}`, borderLeft: `4px solid ${anlagenKennfarbe(p.anlage)}`, backgroundColor: done ? "#E5F3EA" : `${c}18`, wordBreak: "break-word", overflowWrap: "break-word", cursor: readerMode ? "default" : "pointer" }}
                                  title={notiz ? `Notiz: ${notiz}` : readerMode ? undefined : "Öffnen für Notiz / Löschen"}
                                >
                                  {done ? "✓ " : ""}{p.anlage}
                                  {/* Notiz-Zeichen (QoL 19.08.): dass eine Notiz existiert,
                                      war vorher erst im Dialog zu sehen. */}
                                  {notiz && (
                                    <span aria-hidden="true" style={{ position: "absolute", top: "-5px", right: "-5px", width: "15px", height: "15px", borderRadius: "99px", backgroundColor: "#C97A2B", color: "#fff", fontSize: "9px", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>✎</span>
                                  )}
                                </button>
                                {/* Ein-Klick-Abhaken (QoL 19.08.): eigener kleiner
                                    Knopf NEBEN der Kachel - ein Knopf im Knopf
                                    wäre kein gültiges HTML. */}
                                {!readerMode && !done && (
                                  <button
                                    onClick={() => hakePlanTerminAb(p)}
                                    aria-label={`${p.anlage} am ${formatDateDE(p.date)} als erledigt abhaken`}
                                    title="Mit einem Klick als erledigt abhaken"
                                    className="shrink-0 rounded font-black inline-flex items-center justify-center"
                                    style={{ width: "20px", border: "1.5px solid #2F7D4F", color: "#2F7D4F", backgroundColor: "#fff", fontSize: "11px" }}
                                  >
                                    ✓
                                  </button>
                                )}
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
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#2F7D4F" }} /> ✓ Erledigt</span>
          </div>

          {/* Die frühere "Wartungsplan – Tabelle" ist weg (Robertos Ansage vom
              18.08.): Sie wiederholte nur, was die Kacheln darüber zeigen. */}
          <div className="no-print text-xs text-slate-400 mt-3">
            Rotation läuft fortlaufend über Monatsgrenzen hinweg (Referenzpunkt 05.01.2026). Fällt ein Rotations-Montag auf einen Feiertag, entfällt der Slot diesen Zyklus.
          </div>
        </div>
      )}

      {/* Ausklappleiste "Auswertung" (Robertos Ansage vom 18.08.): Der
          Plan-Kalender steht oben für den Alltag; wer Diagramm, Matrix oder
          die Druckvorlagen (TPM / R+I / Alle) braucht, klappt hier auf.
          In der Jahres-Sicht ist sie immer offen - dort IST die Matrix
          der Inhalt. */}
      {(view === "MONAT" || view === "JAHR") && (
        <div className="no-print max-w-7xl mx-auto px-4 mt-4">
          <div className="cal-card rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-3" style={{ backgroundColor: "white", border: "1px solid #E2E4E7", boxShadow: "0 2px 8px rgba(20,22,25,0.06)" }}>
            <button
              onClick={() => { if (view === "JAHR") { setView("MONAT"); setAuswertungOffen(true); } else { setAuswertungOffen((o) => !o); } }}
              aria-expanded={view === "JAHR" || auswertungOffen}
              className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide"
              style={{ color: "#22262B" }}
            >
              <span style={{ color: "#5B6572", fontSize: "0.7rem" }}>{view === "JAHR" || auswertungOffen ? "▾" : "▸"}</span>
              Auswertung
              <span className="normal-case font-normal text-xs" style={{ color: "#8A9099" }}>Diagramm · Matrix · Druckvorlagen</span>
            </button>
            {(view === "JAHR" || auswertungOffen) && (
              <div className="flex flex-wrap items-center gap-3 ml-auto">
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
                <button
                  onClick={oeffneDruckWahl}
                  className="flex items-center gap-1.5 text-white px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wide"
                  style={{ backgroundColor: "#C97A2B" }}
                >
                  <Printer size={13} /> Druckvorlagen …
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {((view === "MONAT" && auswertungOffen) || view === "JAHR") && (
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

      {/* Monats-Auswertung als Diagramm (Robertos Ansage vom 18.08.): je Tag
          ein Balken, Erledigtes grün, Offenes rot - dieselbe Datenbasis wie
          die Monats-Matrix darüber, nur auf einen Blick. */}
      {view === "MONAT" && auswertungOffen && heavyReady && (
        <MonatsDiagramm
          tage={Array.from({ length: daysInMonth }, (_, i) => {
            const amTag = entriesForDay(dateKey(year, month, i + 1));
            return {
              tag: i + 1,
              erledigt: amTag.filter((e) => e.status === "done").length,
              offen: amTag.filter((e) => e.status === "open").length,
            };
          })}
          monatName={MONTHS[month]}
          jahr={year}
          erledigt={doneCount}
          basis={quoteBasis}
          prozent={donePercent}
          filter={filter}
          wochenende={(t) => isWeekend(year, month, t)}
          feiertag={(t) => holidays.get(dateKey(year, month, t))}
        />
      )}

      {/* Trend der Termintreue - beantwortet die Frage, die eine Momentaufnahme
          nicht beantworten kann: Wird es besser oder schlechter? Das Diagramm
          gehört zur Auswertungs-Leiste (Robertos Ansage: nicht vergessen!). */}
      {((view === "MONAT" && auswertungOffen) || view === "JAHR") && heavyReady && <TermintreueTrend reihe={termintreueVerlauf} filter={filter} />}

      {/* Register: alle Anlagen & R+I-Punkte, anklickbar für die komplette Historie */}
      {view === "REGISTER" && (
        <div className="no-print cal-card p-5 max-w-7xl mx-auto rounded-xl mt-4" style={{ backgroundColor: "white", border: "1px solid #E2E4E7", boxShadow: "0 2px 8px rgba(20,22,25,0.06)" }}>
          {/* Register-Suche (QoL 19.08.): lohnt, sobald die Listen wachsen. */}
          <div className="flex items-center gap-3 mb-4">
            <input
              value={registerSuche}
              onChange={(e) => setRegisterSuche(e.target.value)}
              placeholder="Anlage oder Prüfpunkt suchen …"
              aria-label="Register durchsuchen"
              className="text-sm border rounded-lg px-3 py-2"
              style={{ borderColor: "#D6D9DC", width: "320px", maxWidth: "100%" }}
            />
            {registerSuchwort && (
              <span className="text-xs" style={{ color: "#8A9099" }}>{registerTpm.length + registerRi.length} Treffer</span>
            )}
          </div>
          <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: CATS.TPM.color }}>TPM-Anlagen</div>
              <div className="flex flex-col gap-1.5">
                {registerSuchwort && registerTpm.length === 0 && (
                  <div className="text-xs text-slate-400 italic">keine Treffer</div>
                )}
                {registerTpm.map((a) => {
                  const stats = registerStats("TPM", a.name);
                  return (
                    <button
                      key={a.id}
                      onClick={() => setRegisterItem({ category: "TPM", name: a.name })}
                      className="wk-hover flex items-center justify-between text-left px-3 py-2 rounded border"
                      style={{ borderColor: "#E2E4E7" }}
                    >
                      <span className="text-sm font-bold flex items-center gap-2">
                        <span aria-hidden="true" className="inline-block rounded-full shrink-0" style={{ width: "9px", height: "9px", backgroundColor: anlagenKennfarbe(a.name) }} />
                        {a.name}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{stats.done} ✓ · {stats.open} ✕</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: CATS.RI.color }}>R+I-Punkte</div>
              <div className="flex flex-col gap-1.5">
                {registerSuchwort && registerRi.length === 0 && (
                  <div className="text-xs text-slate-400 italic">keine Treffer</div>
                )}
                {registerRi.map((r) => {
                  const stats = registerStats("RI", r.name);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRegisterItem({ category: "RI", name: r.name })}
                      className="wk-hover flex items-center justify-between text-left px-3 py-2 rounded border"
                      style={{ borderColor: "#E2E4E7" }}
                    >
                      <span className="text-sm font-bold flex items-center gap-2">
                        <span aria-hidden="true" className="inline-block rounded-full shrink-0" style={{ width: "9px", height: "9px", backgroundColor: anlagenKennfarbe(r.name) }} />
                        {r.name}
                      </span>
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

              {/* Steckbrief & Historie (QoL Runde 3): der Steckbrief macht aus
                  dem Register die Anlagen-Akte - Wartungspartner und Ersatz-
                  teile stehen dann auch im Störungs-Dialog. */}
              <div className="flex gap-1.5 mb-3 mt-1">
                {[["STECKBRIEF", "Steckbrief"], ["HISTORIE", "Historie"]].map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => setRegisterTab(t)}
                    className="text-xs font-extrabold px-3 py-1.5 rounded-full border"
                    style={registerTab === t
                      ? { backgroundColor: "#22262B", color: "#fff", borderColor: "#22262B" }
                      : { backgroundColor: "#fff", color: "#5B6572", borderColor: "#D6D9DC" }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {registerTab === "STECKBRIEF" && steckbriefDraft && (
                <div className="flex flex-col gap-2">
                  {[["hersteller", "Hersteller"], ["typ", "Typ / Baujahr"], ["seriennummer", "Seriennummer"],
                    ["standort", "Standort"], ["partner", "Wartungspartner"], ["ersatzteile", "Wichtige Ersatzteile"]].map(([feld, label]) => (
                    <div key={feld} className="flex items-center gap-2">
                      <span className="text-xs font-bold shrink-0" style={{ color: "#8A9099", width: "128px" }}>{label}</span>
                      {readerMode ? (
                        <span className="text-sm" style={{ color: "#22262B" }}>{steckbriefDraft[feld] || "—"}</span>
                      ) : (
                        <input
                          value={steckbriefDraft[feld]}
                          onChange={(ev) => setSteckbriefDraft({ ...steckbriefDraft, [feld]: ev.target.value })}
                          aria-label={label}
                          className="text-sm border rounded px-2.5 py-1.5 flex-1 min-w-0"
                          style={{ borderColor: "#D6D9DC" }}
                        />
                      )}
                    </div>
                  ))}

                  <div className="text-xs font-bold uppercase tracking-wide mt-2" style={{ color: "#5B6572" }}>Checkliste fürs Abhaken</div>
                  {readerMode ? (
                    <div className="text-sm" style={{ color: "#22262B", whiteSpace: "pre-line" }}>{steckbriefDraft.checkliste || "—"}</div>
                  ) : (
                    <>
                      <textarea
                        value={steckbriefDraft.checkliste}
                        onChange={(ev) => setSteckbriefDraft({ ...steckbriefDraft, checkliste: ev.target.value })}
                        rows={3}
                        placeholder={"eine Zeile je Prüfpunkt, z. B.\nÖlstand prüfen\nKeilriemen sichten"}
                        aria-label="Checkliste"
                        className="text-sm border rounded px-2.5 py-1.5"
                        style={{ borderColor: "#D6D9DC", resize: "vertical" }}
                      />
                      <div className="text-xs" style={{ color: "#8A9099" }}>Die Punkte erscheinen beim Abhaken im Termin-Fenster („x von y").</div>
                    </>
                  )}

                  {registerItem.category === "TPM" && (
                    <>
                      <div className="text-xs font-bold uppercase tracking-wide mt-2" style={{ color: "#5B6572" }}>Außer Betrieb</div>
                      {readerMode ? (
                        <div className="text-sm" style={{ color: "#22262B" }}>
                          {steckbriefDraft.pauseVon
                            ? `${formatDateDE(steckbriefDraft.pauseVon)} – ${steckbriefDraft.pauseBis ? formatDateDE(steckbriefDraft.pauseBis) : "auf Weiteres"}${steckbriefDraft.pauseGrund ? ` (${steckbriefDraft.pauseGrund})` : ""}`
                            : "—"}
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <input type="date" value={steckbriefDraft.pauseVon} onChange={(ev) => setSteckbriefDraft({ ...steckbriefDraft, pauseVon: ev.target.value })} aria-label="Außer Betrieb von" className="text-sm border rounded px-2.5 py-1.5 flex-1 min-w-0" style={{ borderColor: "#D6D9DC" }} />
                            <input type="date" value={steckbriefDraft.pauseBis} onChange={(ev) => setSteckbriefDraft({ ...steckbriefDraft, pauseBis: ev.target.value })} aria-label="Außer Betrieb bis" className="text-sm border rounded px-2.5 py-1.5 flex-1 min-w-0" style={{ borderColor: "#D6D9DC" }} />
                          </div>
                          <input value={steckbriefDraft.pauseGrund} onChange={(ev) => setSteckbriefDraft({ ...steckbriefDraft, pauseGrund: ev.target.value })} placeholder="Grund (z. B. Umbau Absaugung)" aria-label="Grund" className="text-sm border rounded px-2.5 py-1.5" style={{ borderColor: "#D6D9DC" }} />
                          <div className="text-xs" style={{ color: "#8A9099" }}>
                            Im Zeitraum verteilt die Rotation nichts auf diese Anlage; der Plan nennt den Grund.
                            {steckbriefDraft.pauseVon && (
                              <button onClick={() => setSteckbriefDraft({ ...steckbriefDraft, pauseVon: "", pauseBis: "", pauseGrund: "" })} className="ml-2 font-bold underline" style={{ color: "#2F6690" }}>aufheben</button>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {!readerMode && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={speichereSteckbrief} className="flex-1 text-sm font-bold py-2 rounded text-white" style={{ backgroundColor: "#22262B" }}>Speichern</button>
                      <button onClick={() => setRegisterItem(null)} className="flex-1 text-sm font-bold py-2 rounded bg-slate-100 text-slate-500">Abbrechen</button>
                    </div>
                  )}
                </div>
              )}

              {registerTab === "HISTORIE" && (<>
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
              </>)}
            </div>
          </div>
        );
      })()}

      {/* Notizen: eigene Seite, Hochformat, chronologisch */}
      {view !== "TPMINFO" && notesList.length > 0 && (
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
            style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#16181B", color: "#fff", padding: "28px 36px", paddingBottom: stoerOffenCount > 0 ? "72px" : "28px", display: "flex", flexDirection: "column", fontVariantNumeric: "tabular-nums" }}
          >
            {/* G6: Störungs-Laufband - offene Störungen ziehen unten durch,
                von der anderen Hallenseite lesbar. Ohne offene: kein Band. */}
            {stoerOffenCount > 0 && (
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "48px", backgroundColor: "#1a1e23", borderTop: "2px solid #C0392B", display: "flex", alignItems: "center", overflow: "hidden" }}>
                <span style={{ flexShrink: 0, backgroundColor: "#C0392B", color: "#fff", fontWeight: 900, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 16px", lineHeight: "48px", zIndex: 1 }}>
                  {stoerOffenCount} offen
                </span>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div className="wk-laufband" style={{ whiteSpace: "nowrap", fontSize: "16px", color: "#E8EAED" }}>
                    {stoerungenSortiert.filter((s) => s.offen).map((s) =>
                      `🔧 ${stoerNrLang(s) ? stoerNrKurz(s) + " · " : ""}${s.anlage || "—"}${s.anlagenteil ? " " + s.anlagenteil : ""} – ${s.stoerung || ""}${s.nochZuTun && String(s.nochZuTun).trim() ? " → " + s.nochZuTun : ""}`
                    ).join("   +++   ")}
                  </div>
                </div>
              </div>
            )}
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
