/* Tickets im Cockpit (Roll-out 85, Roberto 23./24.11.: "Abteilungsleiter melden
 * darüber alles ... ungern, dass Daten ins Netz gehen" - "lass es uns bauen").
 *
 * Die Abteilungsleiter melden über eine kleine Seite im Browser
 * (http://v-btacockpit-1:8765/melden). Die Tickets liegen beim BTA-Cockpit-Dienst
 * in einer EIGENEN Tabelle - nicht in der gemeinsamen Datei und nicht im
 * Abgleich der Einträge. Dieses Modul holt sie von dort und zeigt sie der
 * Werkstatt.
 *
 * WARUM ein eigener Weg neben der Speicherschicht: Die Werkstatt arbeitet (Stand
 * 24.11.) noch über die Datei auf W:. Tickets sollen trotzdem sofort ankommen -
 * deshalb spricht dieser Reiter direkt mit dem Dienst, egal ob der Rechner sonst
 * über die Datei oder über den Server arbeitet. Speichern und Zusammenführen der
 * Einträge werden davon NICHT berührt; nur "Annehmen" legt über den gewohnten
 * Weg (persist) ein To-do an.
 *
 * Woher der Rechner den Server kennt (in dieser Reihenfolge):
 *   1. Er arbeitet schon am Server (serverBetrieb) - dann ist es derselbe.
 *   2. ?ticketserver=http://… in der Adresse (Prüfstand, Probe).
 *   3. Gemerkt auf diesem Rechner (bta-ticket:server).
 *   4. Die kleine Datei ticket-server.json im Update-Ordner auf W: - dasselbe
 *      Muster wie die Umschalt-Datei (Roll-out 81): EINE Datei hinlegen, und
 *      jedes Cockpit-Programm findet den Server beim nächsten Start selbst.
 * Ohne Adresse wird nie etwas abgefragt (auch kein Test trifft je den echten Server).
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { serverBetrieb } from "./sharedfile.js";
import { werkstattSchluessel } from "./server-client.js";
import { STANDORT } from "./standort.js";

const MERK = "bta-ticket:server";
export const TICKET_SERVER_DATEI = "ticket-server.json";
const adresseGueltig = (a) => /^https?:\/\/[^\s/]+/.test(String(a || ""));
const sauber = (a) => String(a || "").trim().replace(/\/+$/, "");

export function ticketServerGemerkt() {
  try { const a = sauber(localStorage.getItem(MERK)); return adresseGueltig(a) ? a : ""; } catch (e) { return ""; }
}
export function merkeTicketServer(a) {
  try { if (adresseGueltig(a)) localStorage.setItem(MERK, sauber(a)); else localStorage.removeItem(MERK); } catch (e) { /* dann gilt es bis zum Neustart */ }
}
function ticketServerSofort() {
  const amServer = serverBetrieb();
  if (amServer) return sauber(amServer);
  try {
    const q = new URLSearchParams(window.location.search || "");
    const ausUrl = sauber(q.get("ticketserver"));
    if (ausUrl === "aus") { merkeTicketServer(""); return ""; }
    if (adresseGueltig(ausUrl)) { merkeTicketServer(ausUrl); return ausUrl; }
  } catch (e) { /* ohne Adresse weiter */ }
  return ticketServerGemerkt();
}
/* Programm-Fassung: ticket-server.json aus dem Update-Ordner lesen. Gibt die
   Adresse zurück oder "" - und merkt sie nur, wenn der Server auch antwortet
   (kein Rechner soll auf eine tote Adresse zeigen). */
async function ticketServerAusDatei() {
  const d = typeof window !== "undefined" ? window.__werkstattDesktop : null;
  if (!d || typeof d.lese !== "function" || typeof d.gemerkt !== "function") return "";
  try {
    const ordner = String((await d.gemerkt("programm:update-ordner")) || "").trim();
    if (!ordner) return "";
    const r = await d.lese(ordner.replace(/[\\/]+$/, "") + "/" + TICKET_SERVER_DATEI);
    if (!r) return "";
    const text = r.bytes ? new TextDecoder().decode(r.bytes) : String(r.text || "");
    const adresse = sauber(JSON.parse(text.replace(/^﻿/, "")).server);
    if (!adresseGueltig(adresse)) return "";
    const ac = new AbortController();
    const frist = setTimeout(() => ac.abort(), 5000);
    try { const a = await fetch(adresse + "/api/status", { signal: ac.signal, cache: "no-store" }); if (!a.ok) return ""; } finally { clearTimeout(frist); }
    merkeTicketServer(adresse);
    return adresse;
  } catch (e) { return ""; }
}

async function frage(adresse, weg, opt = {}, fristMs = 10000) {
  const ac = new AbortController();
  const frist = setTimeout(() => ac.abort(), fristMs);
  const kopf = {};
  const s = werkstattSchluessel(); if (s) kopf["X-BTA-Schluessel"] = s;
  if (opt.body) kopf["Content-Type"] = "application/json";
  try {
    const r = await fetch(`${adresse}/api/${STANDORT.id}/tickets${weg}`, { ...opt, headers: kopf, cache: "no-store", signal: ac.signal });
    if (opt.alsBlob) return { ok: r.ok, status: r.status, blob: r.ok ? await r.blob() : null };
    let k = null; try { k = await r.json(); } catch (e) { k = null; }
    return { ok: r.ok, status: r.status, k };
  } catch (e) {
    return { ok: false, status: 0, k: null, netz: true };
  } finally { clearTimeout(frist); }
}

/* Die Tickets für die App: holt die Liste im Takt (60 s, im geöffneten Reiter
   15 s) und nur, solange das Fenster zu sehen ist. aus = dieser Benutzer darf
   den Reiter nicht sehen - dann wird gar nicht erst gefragt. */
export function useTickets({ imBlick, aus }) {
  const [adresse, setAdresse] = useState(ticketServerSofort);
  const [tickets, setTickets] = useState([]);
  const [fehler, setFehler] = useState(null);
  const [stand, setStand] = useState(null); // Zeitpunkt der letzten gelungenen Abfrage
  const laeuft = useRef(false);

  useEffect(() => {
    if (adresse || aus) return undefined;
    let lebt = true;
    ticketServerAusDatei().then((a) => { if (lebt && a) setAdresse(a); });
    return () => { lebt = false; };
  }, [adresse, aus]);

  const laden = useCallback(async () => {
    if (!adresse || aus || laeuft.current) return;
    laeuft.current = true;
    const r = await frage(adresse, "");
    laeuft.current = false;
    if (!r.ok) { setFehler(r.netz ? "Der BTA-Server antwortet nicht." : r.status === 401 ? "Der Werkstatt-Schlüssel fehlt auf diesem Rechner oder ist falsch." : `Der BTA-Server meldet einen Fehler (${(r.k && r.k.fehler) || r.status}).`); return; }
    setFehler(null);
    setStand(new Date());
    // Gleicher Inhalt -> gleiche Referenz: sonst zeichnet jeder Takt die Liste neu.
    setTickets((alt) => (JSON.stringify(alt) === JSON.stringify(r.k.tickets || []) ? alt : (r.k.tickets || [])));
  }, [adresse, aus]);

  useEffect(() => {
    if (!adresse || aus) return undefined;
    laden();
    const takt = setInterval(() => { if (!document.hidden) laden(); }, imBlick ? 15000 : 60000);
    const sichtbar = () => { if (!document.hidden) laden(); };
    document.addEventListener("visibilitychange", sichtbar);
    return () => { clearInterval(takt); document.removeEventListener("visibilitychange", sichtbar); };
  }, [adresse, aus, imBlick, laden]);

  /* Änderung durch die Werkstatt. Der Dienst prüft mit basisGeaendert, ob
     inzwischen ein anderer Rechner dran war - dann kommt der Server-Stand
     zurück und nichts wird überschrieben. */
  const aendern = useCallback(async (ticket, daten) => {
    const r = await frage(adresse, "/" + encodeURIComponent(ticket.nr), { method: "POST", body: JSON.stringify({ ...daten, basisGeaendert: ticket.geaendert }) });
    const neu = r.k && r.k.ticket;
    if (neu) setTickets((alt) => alt.map((t) => (t.nr === neu.nr ? neu : t)));
    if (r.ok) return { ok: true, ticket: neu };
    if (r.status === 409) return { ok: false, konflikt: true, ticket: neu, fehler: "Jemand anderes hat dieses Ticket gerade geändert. Die Zeile zeigt jetzt den neuen Stand - bitte noch einmal ansehen." };
    return { ok: false, fehler: r.netz ? "NICHT gespeichert: der BTA-Server antwortet nicht." : "NICHT gespeichert: " + ((r.k && r.k.fehler) || r.status) };
  }, [adresse]);

  const fotoHolen = useCallback(async (nr) => {
    const r = await frage(adresse, "/" + encodeURIComponent(nr) + "/foto", { alsBlob: true }, 20000);
    return r.ok ? r.blob : null;
  }, [adresse]);

  const offenZahl = tickets.filter((t) => t.stand === "neu" || t.neuVomMelder).length;
  return { adresse, setAdresse: (a) => { merkeTicketServer(a); setAdresse(adresseGueltig(a) ? sauber(a) : ""); setTickets([]); setFehler(null); setStand(null); }, tickets, fehler, stand, laden, aendern, fotoHolen, offenZahl };
}

const STAND = { neu: ["Neu", "#E7ECF8", "#1E2761"], angenommen: ["Angenommen", "#FDF3E7", "#8A4E12"], arbeit: ["In Arbeit", "#FFF4C2", "#6B5310"], frage: ["Rückfrage", "#FBE9E7", "#B23A34"], erledigt: ["Erledigt", "#E3F2E8", "#1F5E33"] };
/* Keine Eile mehr (Roberto 25.11.: „wie eilig muss weg“, Spalte „ganz weg“): Der
   Melder stuft nicht ein, also zeigt und sortiert das Cockpit auch nicht danach.
   Das Feld `eile` steht weiter in den Tickets am Server (Dienst 0.7.0 verlangt
   es), wird hier aber nicht mehr gelesen. */
// Vorschlag für das Adressfeld des Verwalters. Nur ein Text im Feld - abgerufen
// wird erst nach „Merken“ (sonst träfe jeder Test den echten Server).
const SERVER_VORSCHLAG = "http://v-btacockpit-1:8765";
const zeitText = (iso) => { const d = new Date(iso); const z = (n) => String(n).padStart(2, "0"); return isNaN(d) ? "" : `${z(d.getDate())}.${z(d.getMonth() + 1)}. ${z(d.getHours())}:${z(d.getMinutes())}`; };
const chip = (text, bg, fg) => <span style={{ display: "inline-block", borderRadius: "999px", padding: "2px 10px", fontSize: "0.72rem", fontWeight: 800, whiteSpace: "nowrap", backgroundColor: bg, color: fg }}>{text}</span>;
const knopf = { border: "1px solid #D6D9DC", backgroundColor: "#fff", borderRadius: "8px", padding: "4px 9px", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer", margin: "0 4px 4px 0" };

/* Der Reiter. darf = diese Gruppe darf bearbeiten (sonst nur ansehen).
   todoAnlegen(ticket, person, todoId, fotoBlob) legt über den gewohnten Weg ein
   To-do an und gibt true/false zurück. todos = die To-dos der App, um zu zeigen,
   ob das verknüpfte To-do schon abgehakt ist. */
export function TicketAnsicht({ daten, team, angemeldet, darf, istVerwalter, todos, todoAnlegen, todoOeffnen }) {
  const { adresse, tickets, fehler, stand, laden, aendern, fotoHolen, setAdresse } = daten;
  const [filter, setFilter] = useState("offen"); // offen | erledigt | alle
  const [eingabe, setEingabe] = useState(null); // { nr, art: "frage" | "erledigt", text }
  const [meldung, setMeldung] = useState(null); // { nr, text } - Fehler/Hinweis an der Zeile
  const [arbeitet, setArbeitet] = useState(null); // nr, an der gerade gespeichert wird
  const [bilder, setBilder] = useState({}); // nr -> Blob-Adresse | "fehlt"
  // Vorbelegt statt leer (Robertos Bild 24.11.): Der graue Beispieltext im leeren
  // Feld sah aus wie schon ausgefüllt, „Merken“ blieb aber grau.
  const [adresseEntwurf, setAdresseEntwurf] = useState(SERVER_VORSCHLAG);
  const wer = angemeldet || "Werkstatt";

  const tu = async (t, datenNeu) => {
    setArbeitet(t.nr); setMeldung(null);
    const r = await aendern(t, { ...datenNeu, wer });
    setArbeitet(null);
    if (!r.ok) setMeldung({ nr: t.nr, text: r.fehler });
    return r;
  };
  const annehmen = async (t, person) => {
    if (!person) return;
    // Die To-do-Kennung steht schon in der Annahme: so gibt es nie ein angenommenes
    // Ticket, das auf kein To-do zeigt, nur weil zwischen zwei Schritten etwas ausfiel.
    const todoId = `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const r = await tu(t, { stand: "angenommen", zustaendig: person, todoId });
    if (!r.ok) return;
    setArbeitet(t.nr);
    const foto = t.foto ? await fotoHolen(t.nr) : null;
    const ok = await todoAnlegen(r.ticket, person, todoId, foto);
    setArbeitet(null);
    if (!ok) {
      await aendern(r.ticket, { todoId: "", wer });
      setMeldung({ nr: t.nr, text: "Angenommen - aber das To-do konnte NICHT gespeichert werden. Bitte „To-do anlegen“ drücken, sobald das Speichern wieder geht." });
    }
  };
  const todoNachholen = async (t) => {
    const todoId = `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const r = await tu(t, { todoId });
    if (!r.ok) return;
    const foto = t.foto ? await fotoHolen(t.nr) : null;
    const ok = await todoAnlegen(r.ticket, t.zustaendig, todoId, foto);
    if (!ok) { await aendern(r.ticket, { todoId: "", wer }); setMeldung({ nr: t.nr, text: "Das To-do konnte NICHT gespeichert werden." }); }
  };
  const eingabeSenden = async (t) => {
    const text = String((eingabe && eingabe.text) || "").trim();
    if (eingabe.art === "frage" && !text) { setMeldung({ nr: t.nr, text: "Bitte die Frage an den Melder aufschreiben." }); return; }
    const r = await tu(t, eingabe.art === "frage" ? { stand: "frage", antwort: text } : { stand: "erledigt", ...(text ? { antwort: text } : {}) });
    if (r.ok) setEingabe(null);
  };
  const bildZeigen = async (t) => {
    if (bilder[t.nr]) { setBilder((b) => { const n = { ...b }; if (n[t.nr] !== "fehlt") URL.revokeObjectURL(n[t.nr]); delete n[t.nr]; return n; }); return; }
    const blob = await fotoHolen(t.nr);
    setBilder((b) => ({ ...b, [t.nr]: blob ? URL.createObjectURL(blob) : "fehlt" }));
  };

  if (!adresse) {
    return (
      <div data-tickets-ohne-server className="rounded-lg border bg-white" style={{ borderColor: "#D6D9DC", padding: "18px 20px", maxWidth: "720px" }}>
        <div className="font-black" style={{ color: "#1E2761", fontSize: "1.05rem" }}>Tickets: dieser Rechner kennt den BTA-Server noch nicht</div>
        <p style={{ color: "#5B6572", fontSize: "0.85rem", margin: "6px 0 12px" }}>
          Die Meldungen der Abteilungsleiter liegen am BTA-Server im Haus. Normalerweise findet das Programm ihn selbst über die Datei <code>{TICKET_SERVER_DATEI}</code> im Update-Ordner.
          {istVerwalter ? " Als Verwalter kannst du die Adresse hier auch von Hand eintragen - sie gilt nur für diesen Rechner. Die übliche Adresse steht schon im Feld: mit „Merken“ bestätigen." : " Bitte dem Verwalter Bescheid geben."}
        </p>
        {istVerwalter && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input data-tickets-adresse value={adresseEntwurf} onChange={(e) => setAdresseEntwurf(e.target.value)} placeholder="http://v-btacockpit-1:8765" className="rounded border px-3 py-2" style={{ borderColor: "#D6D9DC", flex: "1 1 260px", fontSize: "0.85rem" }} />
            <button data-tickets-adresse-merken onClick={() => setAdresse(adresseEntwurf)} disabled={!adresseGueltig(adresseEntwurf)} className="rounded px-3 py-2 font-bold text-white" style={{ backgroundColor: adresseGueltig(adresseEntwurf) ? "#1E2761" : "#A8B0B8", fontSize: "0.85rem" }}>Merken</button>
          </div>
        )}
      </div>
    );
  }

  const sortiert = [...tickets]
    .filter((t) => (filter === "alle" ? true : filter === "erledigt" ? t.stand === "erledigt" : t.stand !== "erledigt"))
    .sort((a, b) => (a.stand === "erledigt") - (b.stand === "erledigt") || (b.neuVomMelder === true) - (a.neuVomMelder === true) || String(b.angelegt).localeCompare(String(a.angelegt)));
  const zahl = (f) => tickets.filter((t) => (f === "erledigt" ? t.stand === "erledigt" : f === "offen" ? t.stand !== "erledigt" : true)).length;
  const meldeAdresse = adresse + "/melden" + (STANDORT.id === "scheurich" ? "" : "/" + STANDORT.id);

  return (
    <div data-tickets>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
        <div className="font-black" style={{ color: "#1E2761", fontSize: "1.1rem" }}>Tickets</div>
        <div className="flex rounded overflow-hidden border" style={{ borderColor: "#D6D9DC" }}>
          {[["offen", "Offen"], ["erledigt", "Erledigt"], ["alle", "Alle"]].map(([f, name]) => (
            <button key={f} data-tickets-filter={f} onClick={() => setFilter(f)} className="px-3 py-1 text-xs font-bold" style={{ backgroundColor: filter === f ? "#1E2761" : "#fff", color: filter === f ? "#fff" : "#5B6572" }}>{name} {zahl(f)}</button>
          ))}
        </div>
        <button onClick={laden} style={knopf} title="Jetzt beim Server nachsehen">↻ Aktualisieren</button>
        <span style={{ marginLeft: "auto", fontSize: "0.74rem", color: "#5B6572" }}>
          Melde-Seite für die Abteilungsleiter: <code data-tickets-meldeadresse style={{ backgroundColor: "#EEF1F4", padding: "1px 6px", borderRadius: "4px", userSelect: "all" }}>{meldeAdresse}</code>
        </span>
      </div>
      {fehler && (
        <div data-tickets-fehler className="rounded border" style={{ backgroundColor: "#FBF3DA", borderColor: "#E3CE8F", color: "#6B5310", padding: "8px 12px", fontSize: "0.82rem", marginBottom: "10px" }}>
          <b>{fehler}</b> {stand ? `Die Liste zeigt den Stand von ${zeitText(stand.toISOString())} Uhr.` : "Es konnte noch keine Liste geladen werden."}
        </div>
      )}
      <div className="rounded-lg border bg-white" style={{ borderColor: "#D6D9DC", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
          <thead>
            <tr>{["Nr. · Eingang", "Von", "Meldung", "Stand", "Tun"].map((k) => <th key={k} data-tickets-spalte={k} style={{ textAlign: "left", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: ".03em", color: "#8A9099", borderBottom: "1.5px solid #C4CBD2", padding: "7px 9px" }}>{k}</th>)}</tr>
          </thead>
          <tbody>
            {sortiert.length === 0 && (
              <tr><td colSpan={5} data-tickets-leer style={{ padding: "22px", textAlign: "center", color: "#5B6572" }}>{tickets.length === 0 ? (stand ? "Noch keine Meldungen." : "Die Liste wird geladen …") : "In dieser Auswahl ist nichts."}</td></tr>
            )}
            {sortiert.map((t) => {
              const [standName, sBg, sFg] = STAND[t.stand] || [t.stand, "#EEF1F4", "#4B5259"];
              const todo = t.todoId ? (todos || []).find((x) => x.id === t.todoId) : null;
              const todoFertig = todo && todo.status === "done";
              const beschaeftigt = arbeitet === t.nr;
              const offen = t.stand !== "erledigt";
              return (
                <tr key={t.nr} data-ticket={t.nr} data-ticket-stand={t.stand} style={{ opacity: offen ? 1 : 0.6, backgroundColor: t.neuVomMelder ? "#FFF9E8" : "transparent" }}>
                  <td style={{ borderBottom: "1px solid #E5E9ED", padding: "9px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "Consolas, monospace" }}>{t.nr}</span>
                    <div style={{ color: "#8A9099", fontSize: "0.74rem" }}>{zeitText(t.angelegt)}</div>
                  </td>
                  <td style={{ borderBottom: "1px solid #E5E9ED", padding: "9px", verticalAlign: "top" }}>{t.melder}<div style={{ color: "#8A9099", fontSize: "0.74rem" }}>{t.abteilung}</div></td>
                  <td style={{ borderBottom: "1px solid #E5E9ED", padding: "9px", verticalAlign: "top", minWidth: "240px" }}>
                    <b style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{t.text}</b>
                    <div style={{ color: "#8A9099", fontSize: "0.76rem", overflowWrap: "anywhere" }}>
                      {t.art} · {t.ort}
                      {t.foto && <> · <button data-ticket-foto={t.nr} onClick={() => bildZeigen(t)} style={{ background: "none", border: 0, padding: 0, color: "#2952CC", textDecoration: "underline", cursor: "pointer", fontSize: "inherit" }}>📷 {bilder[t.nr] ? "Foto ausblenden" : "Foto zeigen"}</button></>}
                    </div>
                    {bilder[t.nr] && (bilder[t.nr] === "fehlt"
                      ? <div style={{ color: "#B23A34", fontSize: "0.76rem" }}>Das Foto konnte nicht geladen werden.</div>
                      : <img data-ticket-bild={t.nr} src={bilder[t.nr]} alt="Foto zur Meldung" style={{ maxWidth: "100%", maxHeight: "320px", borderRadius: "8px", marginTop: "6px", display: "block" }} />)}
                    {t.antwort && <div style={{ marginTop: "6px", borderLeft: "3px solid #C97A2B", backgroundColor: "#FDF8F1", padding: "4px 9px", fontSize: "0.8rem", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><b>Werkstatt:</b> {t.antwort}</div>}
                    {t.melderAntwort && <div data-ticket-melderantwort={t.nr} style={{ marginTop: "4px", borderLeft: "3px solid " + (t.neuVomMelder ? "#B23A34" : "#9AA3AD"), backgroundColor: t.neuVomMelder ? "#FBE9E7" : "#F4F6F8", padding: "4px 9px", fontSize: "0.8rem", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><b>{t.neuVomMelder ? "NEU vom Melder:" : "Melder:"}</b> {t.melderAntwort}</div>}
                    {eingabe && eingabe.nr === t.nr && (
                      <div style={{ marginTop: "8px" }}>
                        <textarea data-ticket-eingabe={t.nr} autoFocus value={eingabe.text} onChange={(e) => setEingabe({ ...eingabe, text: e.target.value })} maxLength={2000} placeholder={eingabe.art === "frage" ? "Frage an den Melder" : "Rückmeldung an den Melder (ein Satz, darf leer bleiben)"} className="rounded border" style={{ width: "100%", minHeight: "56px", borderColor: "#D6D9DC", padding: "6px 9px", fontSize: "0.84rem" }} />
                        <div style={{ marginTop: "4px" }}>
                          <button data-ticket-eingabe-senden={t.nr} disabled={beschaeftigt} onClick={() => eingabeSenden(t)} style={{ ...knopf, backgroundColor: eingabe.art === "frage" ? "#1E2761" : "#1F7A3D", borderColor: "transparent", color: "#fff" }}>{eingabe.art === "frage" ? "Rückfrage senden" : "Als erledigt schließen"}</button>
                          <button onClick={() => setEingabe(null)} style={knopf}>Abbrechen</button>
                        </div>
                      </div>
                    )}
                    {meldung && meldung.nr === t.nr && <div data-ticket-meldung={t.nr} style={{ marginTop: "6px", color: "#B23A34", fontSize: "0.78rem", fontWeight: 700 }}>{meldung.text}</div>}
                  </td>
                  <td style={{ borderBottom: "1px solid #E5E9ED", padding: "9px", verticalAlign: "top" }}>
                    {chip(standName, sBg, sFg)}
                    <div style={{ color: "#8A9099", fontSize: "0.74rem" }}>{t.zustaendig}</div>
                    {todo && <button data-ticket-todo={t.nr} onClick={() => todoOeffnen && todoOeffnen(todo)} style={{ background: "none", border: 0, padding: 0, color: todoFertig ? "#1F7A3D" : "#2952CC", textDecoration: "underline", cursor: "pointer", fontSize: "0.74rem" }}>{todoFertig ? "✓ To-do abgehakt" : "→ To-do"}</button>}
                  </td>
                  <td style={{ borderBottom: "1px solid #E5E9ED", padding: "9px", verticalAlign: "top", minWidth: "190px" }}>
                    {!darf ? <span style={{ color: "#8A9099", fontSize: "0.74rem" }}>nur ansehen</span>
                      : !offen ? <button data-ticket-tu="neu" disabled={beschaeftigt} onClick={() => tu(t, { stand: t.zustaendig ? "angenommen" : "neu" })} style={knopf}>Wieder öffnen</button>
                      : (
                        <>
                          {!t.zustaendig ? (
                            <select data-ticket-annehmen={t.nr} disabled={beschaeftigt} value="" onChange={(e) => annehmen(t, e.target.value)} style={{ ...knopf, fontWeight: 600, minWidth: "150px" }}>
                              <option value="">Annehmen für …</option>
                              {(team || []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                            </select>
                          ) : (
                            <>
                              {t.stand !== "arbeit" && <button data-ticket-tu="arbeit" disabled={beschaeftigt} onClick={() => tu(t, { stand: "arbeit" })} style={knopf}>In Arbeit</button>}
                              {!todo && <button data-ticket-todo-anlegen={t.nr} disabled={beschaeftigt} onClick={() => todoNachholen(t)} style={knopf}>To-do anlegen</button>}
                            </>
                          )}
                          <button data-ticket-tu="frage" disabled={beschaeftigt} onClick={() => { setMeldung(null); setEingabe({ nr: t.nr, art: "frage", text: "" }); }} style={knopf}>Rückfrage</button>
                          <button data-ticket-tu="erledigt" disabled={beschaeftigt} onClick={() => { setMeldung(null); setEingabe({ nr: t.nr, art: "erledigt", text: "" }); }} style={{ ...knopf, backgroundColor: "#1F7A3D", borderColor: "#1F7A3D", color: "#fff" }}>Erledigt</button>
                          {todoFertig && <div style={{ fontSize: "0.72rem", color: "#1F5E33", fontWeight: 700 }}>Das To-do ist abgehakt - Ticket noch schließen.</div>}
                        </>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: "0.72rem", color: "#8A9099", marginTop: "8px" }}>
        {stand ? `Stand ${zeitText(stand.toISOString())} Uhr · ` : ""}Server {adresse.replace(/^https?:\/\//, "")} · „Annehmen“ legt ein To-do für die Person an · erledigte Tickets bleiben 60 Tage in der Liste
        {istVerwalter && !serverBetrieb() && <> · <button data-tickets-adresse-aendern onClick={() => setAdresse("")} style={{ background: "none", border: 0, padding: 0, color: "#2952CC", textDecoration: "underline", cursor: "pointer", fontSize: "inherit" }}>Server-Adresse ändern</button></>}
      </div>
    </div>
  );
}
