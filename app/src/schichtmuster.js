/* Schichten fortschreiben (Roberto 06.11.: "Die Schichten Früh / Spät / Spät
 * mit Bereitschaft / Nacht / Bereitschaft am Wochenende müssen für alle
 * Mitarbeiter kontinuierlich weiter gehen im selben Schema für 27").
 *
 * Gemessen am 06.11. in den echten W:-Daten: Die Schichten stehen als
 * Tages-Einträge (scope "tag"), und fast jeder Stammmitarbeiter läuft in
 * einem festen Zyklus (meist 12 Wochen, z. B. Früh → Spät mit B → Nacht →
 * zwei Wochen Tagschicht → Früh mit Bereitschaft Sa/So → Spät → …).
 * Dazwischen stehen Urlaub, Krank, Schule, Mainsite, die NICHT zum Schema
 * gehören. Dieses Modul erkennt den Zyklus je Person aus dem, was schon
 * geplant ist, und schreibt ihn bis zu einem Datum weiter - reine
 * Rechenlogik ohne React, damit sie sich für sich messen lässt.
 *
 * Grundsätze:
 *  - Nichts wird überschrieben: wo schon ein Eintrag steht (Tag oder Woche),
 *    bleibt er. Fortgeschrieben wird nur ab der Woche nach dem letzten
 *    Eintrag der Person (frühestens ab der laufenden Woche).
 *  - Feiertage bleiben frei - so, wie die Werkstatt Weihnachten 2026
 *    von Hand geplant hat (25.12. und 1.1. leer).
 *  - Wer kein Muster hat (Azubis mit Schule, zu wenig Daten, zu viel
 *    Abweichung), wird übersprungen und in der Vorschau so genannt.
 */

// Diese Werte sind das Schema. Alles andere (Urlaub, Krank, Schule, Mainsite,
// Seminar, Lehrgang, "!") ist eine Abwesenheit oder Ausnahme und zählt beim
// Vergleichen als "unbekannt" - weder Treffer noch Fehler.
export const SCHEMA_WERTE = ["Früh", "Spät", "Spät mit B", "Nacht", "Bereits."];
const LEER = ""; // kein Eintrag bzw. "-" = Tagschicht ohne Schicht-Eintrag

const pad = (n) => String(n).padStart(2, "0");
const tagKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const montagVon = (iso) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

/* Alle Schicht-Einträge einer Person als Tages-Werte: { "2026-07-08": "Früh", … }.
   Wochen-Einträge gelten Mo-Fr, ein Tages-Eintrag schlägt die Woche. "-" wird zu LEER. */
export function tagesWerte(entries, person) {
  const werte = new Map();
  const wochen = [];
  entries.forEach((e) => {
    if (e.category !== "SCHICHT" || e.name !== person) return;
    if (e.scope === "woche" && e.woche) wochen.push(e);
  });
  wochen.forEach((w) => {
    // Montag der ISO-Woche: aus "2026-W28" über den 4. Januar (immer in KW 1)
    const [j, kw] = w.woche.split("-W").map(Number);
    const vierter = new Date(j, 0, 4);
    const montag = addDays(vierter, -((vierter.getDay() + 6) % 7) + (kw - 1) * 7);
    for (let i = 0; i < 5; i++) werte.set(tagKey(addDays(montag, i)), w.wert === "-" ? LEER : w.wert);
  });
  entries.forEach((e) => {
    if (e.category === "SCHICHT" && e.name === person && e.scope === "tag" && e.date) werte.set(e.date, e.wert === "-" ? LEER : e.wert);
  });
  return werte;
}

const istSchema = (w) => w === LEER || SCHEMA_WERTE.includes(w);
const istSchicht = (w) => w !== LEER && SCHEMA_WERTE.includes(w);

/* Zyklus erkennen. wochen: Array von 7er-Arrays (Mo..So), chronologisch, letzte = Anker.
   Verglichen wird Tag für Tag jede Woche mit der Woche `p` Wochen später - aber
   nur dort, wo auf BEIDEN Seiten eine Schema-Schicht steht. Leere Tage sagen
   nichts (in den W:-Daten fehlen oft ganze Wochen oder stehen nur halb da),
   Abwesenheiten erst recht nicht. Ergebnis { periode, quote, treffer,
   vergleiche } oder null, wenn nichts Belastbares da ist. */
export function periodeErkennen(wochen, optionen = {}) {
  const maxPeriode = optionen.maxPeriode || 16;
  const minVergleiche = optionen.minVergleiche || 20; // rund vier Schichtwochen
  let beste = null;
  for (let p = 1; p <= maxPeriode; p++) {
    let treffer = 0, vergleiche = 0;
    for (let i = 0; i + p < wochen.length; i++) {
      for (let d = 0; d < 7; d++) {
        const a = wochen[i][d], b = wochen[i + p][d];
        if (!istSchicht(a) || !istSchicht(b)) continue;
        vergleiche++;
        if (a === b) treffer++;
      }
    }
    if (vergleiche < minVergleiche) continue;
    const quote = treffer / vergleiche;
    // Kürzester Takt gewinnt, wenn er fast so gut trifft wie der beste (ein
    // doppelt so langer Takt trifft nie schlechter, erklärt aber nichts Neues).
    if (!beste || quote > beste.quote + 0.08) beste = { periode: p, quote, treffer, vergleiche };
  }
  if (!beste || beste.quote < 0.75) return null;
  return beste;
}

/* Vorlage je Zyklus-Position: Mehrheit der Schema-Werte aus den letzten drei
   Durchläufen (Gleichstand: der jüngste), je Wochentag. Position 0 = Ankerwoche
   (die letzte Woche mit Einträgen); Position k = die Woche k nach dem Anker. */
export function vorlageBauen(wochen, periode) {
  const vorlage = [];
  const anker = wochen.length - 1;
  for (let pos = 0; pos < periode; pos++) {
    const tage = [];
    for (let d = 0; d < 7; d++) {
      const zaehl = new Map();
      let juengster = null;
      let bekannt = 0, gesehen = 0;
      // Höchstens sechs Durchläufe zurück (ein älteres Schema soll nicht mitreden),
      // davon zählen die ersten vier mit bekanntem Wert (Urlaub/Krank zählen nicht).
      // Vier statt drei, weil eine einzelne Abweichung (Weihnachtswoche von Hand
      // verschoben) sonst bei Gleichstand den Ausschlag gäbe.
      for (let i = anker - ((periode - pos) % periode); i >= 0 && bekannt < 4 && gesehen < 6; i -= periode) {
        gesehen++;
        const w = wochen[i][d];
        if (!istSchema(w)) continue;
        bekannt++;
        if (juengster === null) juengster = w;
        zaehl.set(w, (zaehl.get(w) || 0) + 1);
      }
      if (!zaehl.size) { tage.push(LEER); continue; }
      const max = Math.max(...zaehl.values());
      const kandidaten = [...zaehl.entries()].filter(([, n]) => n === max).map(([w]) => w);
      tage.push(kandidaten.includes(juengster) ? juengster : kandidaten[0]);
    }
    // Eine Schichtwoche ist im Schema immer eine GANZE Woche Mo-Fr. Hat die
    // Mehrheitsschicht mindestens drei Tage, gilt sie für alle fünf (Feiertage
    // und einzelne Lücken in den alten Daten sollen keine Löcher stanzen); hat
    // keine Schicht drei Tage, war das keine Schichtwoche - Mo-Fr bleiben leer.
    const zaehl = new Map();
    tage.slice(0, 5).forEach((w) => { if (w !== LEER) zaehl.set(w, (zaehl.get(w) || 0) + 1); });
    const mehrheit = [...zaehl.entries()].sort((a, b) => b[1] - a[1])[0];
    const wochenWert = mehrheit && mehrheit[1] >= 3 ? mehrheit[0] : LEER;
    for (let d = 0; d < 5; d++) tage[d] = wochenWert;
    vorlage.push(tage);
  }
  return vorlage;
}

/* Alles in einem für eine Person: Muster erkennen und neue Tages-Einträge bis
   `bis` (ISO-Datum) vorschlagen. feiertage: Set/Map der Feiertags-Schlüssel.
   heute: ISO-Datum - fortgeschrieben wird frühestens ab der laufenden Woche. */
export function fortschreibenFuer(entries, person, bis, heute, feiertage) {
  const werte = tagesWerte(entries, person);
  if (!werte.size) return { person, grund: "noch keine Schichten eingetragen", neu: [] };
  const daten = [...werte.keys()].sort();
  // Anker ist die letzte Woche mit einer SCHEMA-Schicht - nicht der letzte Eintrag
  // überhaupt: ein Urlaub, der schon für den Sommer 2027 eingetragen ist, darf
  // nicht alles davor blockieren (und ist auch kein Takt).
  const schichtDaten = daten.filter((k) => istSchicht(werte.get(k)));
  if (!schichtDaten.length) return { person, grund: "noch keine Schichten eingetragen", neu: [] };
  const erster = montagVon(daten[0]);
  const letzter = montagVon(schichtDaten[schichtDaten.length - 1]);
  const wochen = [];
  for (let mo = new Date(erster); mo <= letzter; mo = addDays(mo, 7)) {
    const w = [];
    for (let i = 0; i < 7; i++) { const k = tagKey(addDays(mo, i)); w.push(werte.has(k) ? werte.get(k) : LEER); }
    wochen.push(w);
  }
  const muster = periodeErkennen(wochen);
  if (!muster) return { person, grund: wochen.length < 8 ? "zu wenig Wochen geplant, um ein Muster zu erkennen" : "kein gleichmäßiges Muster erkennbar", neu: [] };
  const vorlage = vorlageBauen(wochen, muster.periode);
  // Start: Woche nach dem Anker, frühestens die laufende Woche
  let start = addDays(letzter, 7);
  const heuteMo = montagVon(heute);
  let versatz = 0; // wie viele Wochen der Start hinter dem Anker liegt (für die Position)
  if (start < heuteMo) start = heuteMo;
  versatz = Math.round((start - letzter) / (7 * 86400000));
  const neu = [];
  const bisDatum = new Date(bis + "T00:00:00");
  for (let mo = new Date(start), k = versatz; mo <= bisDatum; mo = addDays(mo, 7), k++) {
    const tage = vorlage[k % muster.periode];
    for (let i = 0; i < 7; i++) {
      const d = addDays(mo, i);
      if (d > bisDatum) break;
      const key = tagKey(d);
      const wert = tage[i];
      if (wert === LEER) continue;
      if (werte.has(key)) continue; // nie überschreiben
      if (feiertage && (feiertage.has ? feiertage.has(key) : feiertage[key])) continue;
      neu.push({ id: `schicht-t|${person}|${key}`, date: key, category: "SCHICHT", name: person, scope: "tag", wert, fortgeschrieben: heute });
    }
  }
  return { person, periode: muster.periode, quote: muster.quote, vergleiche: muster.vergleiche, vorlage, start: tagKey(start), versatz, neu };
}

/* Kurzform einer Vorlage für die Vorschau: "F · SB · N · – · – · F+B · S …" */
export function vorlageKurz(vorlage, kuerzel) {
  return vorlage.map((tage) => {
    const zaehl = new Map();
    tage.slice(0, 5).forEach((w) => { if (w !== LEER) zaehl.set(w, (zaehl.get(w) || 0) + 1); });
    const mehrheit = [...zaehl.entries()].sort((a, b) => b[1] - a[1])[0];
    const we = tage.slice(5).some((w) => w !== LEER);
    const k = mehrheit ? (kuerzel[mehrheit[0]] || mehrheit[0]) : null;
    const b = kuerzel["Bereits."] || "B";
    // Nur Wochenend-Bereitschaft ohne Wochenschicht: schlicht "B", nicht "–+B"
    return we ? (k ? `${k}+${b}` : b) : (k || "–");
  });
}

// Test-Zugang (harte-114): die reine Rechenlogik direkt messbar machen
if (typeof window !== "undefined") window.__wkSchichtMusterTest = { tagesWerte, periodeErkennen, vorlageBauen, fortschreibenFuer, vorlageKurz };
