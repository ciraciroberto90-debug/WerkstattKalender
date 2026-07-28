// Sieben Jahre Werkstattbetrieb als Datenbestand.
//
// Erzeugt einen Bestand, wie er nach sieben Jahren täglicher Nutzung wirklich
// aussieht - nicht eine Handvoll Beispielsätze, sondern jeden Arbeitstag mit
// Schichteinträgen für das ganze Team, monatliche TPM- und R+I-Nachweise,
// laufende Backlog-Arbeiten, Notizen und mehrere Störungen pro Woche.
//
// Absichtlich ohne Zufall: Derselbe Aufruf liefert denselben Bestand. Ein
// Härtetest, dessen Datenmenge bei jedem Lauf schwankt, taugt nicht zum
// Vergleichen - und ein Fehlschlag liesse sich nicht nachstellen.

const TEAM = [
  { name: "R. Ciraci", rolle: "mech" }, { name: "M. Weber", rolle: "elek" },
  { name: "T. Klein", rolle: "mech" },  { name: "S. Bauer", rolle: "azubi" },
  { name: "A. Fischer", rolle: "elek" },{ name: "J. Wolf", rolle: "mech" },
  { name: "P. Hoffmann", rolle: "mech" }, { name: "K. Neumann", rolle: "elek" },
];
const ANLAGEN = ["BTS", "VSM1", "HRO", "OF320", "TS200", "B+T", "RRO", "B1", "LTA1"];
const TEILE = ["Proface-Panel", "Hauptantrieb", "Förderband", "Pneumatikventil",
               "Näherungsschalter", "Getriebe", "Heizung", "Druckluftaufbereitung"];
const GEWERKE = ["Mechanik", "Elektrik"];
const FEHLERARTEN = ["Störmeldung", "Verschleiß", "Bedienfehler", "Materialfehler", "Sonstiges"];
const SCHICHTEN = ["Früh", "Spät", "Nacht"];
const WERTE = ["Früh", "Spät", "Nacht", "Urlaub", "Krank", "Schulung"];

function* werktage(vonISO, bisISO) {
  const d = new Date(vonISO + "T00:00:00Z");
  const bis = new Date(bisISO + "T00:00:00Z");
  while (d <= bis) {
    const wt = d.getUTCDay();
    if (wt !== 0 && wt !== 6) yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

// Ein einfacher, aber fester Streuer: gleiche Eingabe, gleiche Ausgabe.
function streu(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function baueBestand({ von = "2019-07-01", bis = "2026-07-28" } = {}) {
  const entries = [];
  const stempel = (datum, stunde) => `${datum}T${String(stunde).padStart(2, "0")}:00:00.000Z`;
  let tagNr = 0;

  for (const tag of werktage(von, bis)) {
    tagNr++;

    // Schichtplan: jeder im Team an jedem Arbeitstag.
    TEAM.forEach((p, i) => {
      const wert = WERTE[streu(tag + p.name) % WERTE.length];
      entries.push({
        id: `schicht-t|${p.name}|${tag}`, date: tag, category: "SCHICHT",
        name: p.name, scope: "tag", wert, updatedAt: stempel(tag, 6),
      });
    });

    // Backlog-Arbeiten: etwa jeden vierten Tag eine.
    if (tagNr % 4 === 0) {
      const a = ANLAGEN[streu("arbeit" + tag) % ANLAGEN.length];
      entries.push({
        id: `arbeit|${tag}|${tagNr}`, date: tag, category: "ARBEIT",
        name: `${a}: ${TEILE[streu(tag) % TEILE.length]} prüfen`,
        gewerk: GEWERKE[tagNr % 2], status: tagNr % 7 === 0 ? "open" : "done",
        updatedAt: stempel(tag, 7),
      });
    }

    // Notizen: etwa jeden zehnten Tag.
    if (tagNr % 10 === 0) {
      entries.push({
        id: `notiz|${tag}`, date: tag, category: "NOTIZ",
        text: `Übergabe ${tag}: Anlagen liefen bis auf Kleinigkeiten durch.`,
        updatedAt: stempel(tag, 14),
      });
    }
  }

  // TPM und R+I: monatlich je Anlage, erledigt.
  const monate = [];
  {
    const d = new Date(von + "T00:00:00Z");
    const bisD = new Date(bis + "T00:00:00Z");
    while (d <= bisD) { monate.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  }
  monate.forEach((m, mi) => {
    ANLAGEN.forEach((a, ai) => {
      const tag = `${m}-${String(((ai * 3) % 26) + 2).padStart(2, "0")}`;
      entries.push({
        id: `tpm|${a}|${m}`, date: tag, category: "TPM", name: a,
        status: "done", updatedAt: stempel(tag, 9),
      });
      // Nicht jede R+I ist erledigt - ein Nachweis ohne jede Luecke waere
      // geschoent, und die Auswertung soll auch Versaeumtes zeigen koennen.
      entries.push({
        id: `ri|${a}|${m}`, date: tag, category: "RI", name: a,
        status: (mi * 9 + ai) % 23 === 5 ? "open" : "done", updatedAt: stempel(tag, 10),
      });
    });
  });

  return { team: TEAM, entries };
}

function baueStoerungen({ von = "2019-07-01", bis = "2026-07-28" } = {}) {
  const stoerungen = [];
  let n = 0;
  for (const tag of werktage(von, bis)) {
    n++;
    // Im Schnitt an jedem zweiten Arbeitstag etwas, gelegentlich mehreres am
    // selben Tag - so sieht ein Schichtbuch wirklich aus.
    const anzahl = n % 2 === 0 ? 0 : (n % 11 === 0 ? 3 : (n % 5 === 0 ? 2 : 1));
    for (let k = 0; k < anzahl; k++) {
      const s = streu(tag + k);
      const anlage = ANLAGEN[s % ANLAGEN.length];
      const offen = n % 97 === 0 && k === 0;   // ganz selten etwas Offenes
      const beginn = 6 + (s % 16);
      stoerungen.push({
        id: `st|${tag}|${k}`,
        date: tag,
        schicht: SCHICHTEN[s % SCHICHTEN.length],
        anlage,
        anlagenteil: TEILE[(s >> 3) % TEILE.length],
        gewerk: GEWERKE[(s >> 5) % 2],
        fehlerart: FEHLERARTEN[(s >> 7) % FEHLERARTEN.length],
        stoerung: `${anlage} meldet ${FEHLERARTEN[(s >> 7) % FEHLERARTEN.length]} an ${TEILE[(s >> 3) % TEILE.length]}`,
        ursache: offen ? "" : "Verschleiß am Bauteil, Sichtprüfung ergab Riefen",
        getan: offen ? "" : "Bauteil getauscht, Funktion geprüft, Anlage freigegeben",
        nochZuTun: offen ? "Ersatzteil bestellen, dann tauschen" : "",
        ersatzteile: (s % 3 === 0) ? "Lager 6204-2RS" : "",
        nachbestellt: s % 6 === 0,
        ausfallzeit: 10 + (s % 120),
        offen,
        gemeldetAt: `${tag}T${String(beginn).padStart(2, "0")}:15:00`,
        behobenAt: offen ? "" : `${tag}T${String(Math.min(23, beginn + 1)).padStart(2, "0")}:45:00`,
        melder: TEAM[s % TEAM.length].name,
        updatedAt: `${tag}T${String(Math.min(23, beginn + 2)).padStart(2, "0")}:00:00.000Z`,
      });
    }
  }
  return stoerungen;
}

module.exports = { baueBestand, baueStoerungen, TEAM, ANLAGEN };

if (require.main === module) {
  const { entries, team } = baueBestand();
  const st = baueStoerungen();
  const kb = (s) => Math.round(JSON.stringify(s).length / 1024);
  const nachArt = {};
  entries.forEach((e) => { nachArt[e.category] = (nachArt[e.category] || 0) + 1; });
  console.log("Zeitraum:            2019-07-01 bis 2026-07-28 (7,1 Jahre)");
  console.log("Team:               ", team.length, "Personen");
  console.log("Einträge gesamt:    ", entries.length);
  Object.entries(nachArt).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log("   " + k.padEnd(12), v));
  console.log("Störungen:          ", st.length, " davon offen:", st.filter((s) => s.offen).length);
  console.log("");
  console.log("Größe Einträge:     ", kb(entries), "KB");
  console.log("Größe Störungen:    ", kb(st), "KB");
  console.log("Zusammen:           ", kb(entries) + kb(st), "KB");
  console.log("localStorage-Grenze: meist 5120 KB je Herkunft");
}
