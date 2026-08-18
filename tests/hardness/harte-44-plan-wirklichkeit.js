// Härtetest: DER PLAN ZEIGT DIE WIRKLICHKEIT, NICHT NUR DIE RECHNUNG.
//
// Robertos Fund vom 18.08.2026: Plan-Reiter und Auswertung zeigten am selben
// Tag teils VERSCHIEDENE Termine - die Auswertung stimmte. Ursache: Die
// Auswertung zeigt die echten Kalender-Einträge (auch verschobene), der
// Plan-Reiter rechnete stur den Rotations-Plan neu und ignorierte, dass ein
// Termin längst auf einen anderen Tag verschoben oder von Hand angelegt war.
//
// Erwartung seit der Änderung: Ein echter Eintrag ersetzt den berechneten
// Slot seiner Anlage (TPM: je Monat genau ein Wartungstermin, R+I: je Woche);
// gerechnet wird nur, was keinen echten Eintrag hat. Damit zeigen Plan,
// Übersicht und Auswertung dieselben Termine.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const path = require("path");
const APP = "file://" + path.resolve("/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};
const iso = (t) => new Date(t).toISOString();

// Fünf Takt-Anlagen wie in der echten Rotation (je Montag eine, jede genau
// einmal im Monat) und ein wöchentlicher R+I-Punkt - so trifft der Test die
// Regeln, um die es geht: TPM je Anlage ein Termin im Monat, R+I je Woche.
const config = {
  tpmAnlagen: [
    { id: "a1", name: "TS200", role: "takt" },
    { id: "a2", name: "TS320", role: "takt" },
    { id: "a3", name: "TS480", role: "takt" },
    { id: "a4", name: "VSM1", role: "takt" },
    { id: "bt", name: "B+T", role: "takt" },
  ],
  riItems: [{ id: "r1", name: "Wasserrundgang", type: "weekly", weekday: 1 }],
  team: [],
};

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  async function planText(entries) {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => fehler.push(e.message));
    await p.clock.setFixedTime(new Date("2026-08-18T09:15:00"));
    await p.addInitScript(({ e, c }) => {
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    }, { e: entries, c: config });
    await p.goto(APP);
    await p.waitForTimeout(800);
    await p.getByRole("button", { name: "TPM", exact: true }).click();
    await p.waitForTimeout(400);
    // Seit dem 18.08. heißt der verschmolzene Reiter wieder "Plan" -
    // der Plan-Kalender samt Tabelle steht oben, die Auswertung ist
    // eine Ausklappleiste darunter.
    await p.getByRole("button", { name: "Plan", exact: true }).click();
    await p.waitForTimeout(1500);
    const text = await p.locator("body").innerText();
    await ctx.close();
    return { text, fehler };
  }

  /* ---- (1) Ohne echte Einträge: die reine Rechnung ---- */
  const leer = await planText([]);
  const rechnungsTage = (leer.text.match(/(\d{2})\.08\.2026[^\n]*TS480/g) || []);
  pruef("(1) Die Rechnung setzt die Takt-Anlage genau einmal in den Monat",
        rechnungsTage.length === 1, rechnungsTage.join(" · "));

  /* ---- (2) Verschobener TPM-Termin: der echte Eintrag gewinnt ---- */
  // Der Termin wurde (wie im Alltag über das Termin-Fenster) auf den 26.08.
  // verschoben - im Kalender steht der echte, offene Eintrag.
  const verschoben = [{ id: "t1", date: "2026-08-26", category: "TPM", name: "TS480", status: "open", updatedAt: iso("2026-08-18T08:00:00") }];
  const mitVerschobenem = await planText(verschoben);
  const ts480Tage = (mitVerschobenem.text.match(/(\d{2})\.08\.2026[^\n]*TS480/g) || []);
  pruef("(2) Der Plan zeigt die Anlage am VERSCHOBENEN Tag (26.08.)",
        ts480Tage.some((z) => z.startsWith("26.08.")), ts480Tage.join(" · ") || "gar nicht");
  pruef("(2) Die Anlage erscheint NICHT zusätzlich am errechneten Tag (kein Doppel)",
        ts480Tage.length === 1, ts480Tage.length + " Vorkommen");

  /* ---- (3) Verschobener R+I-Termin: gilt je Woche ---- */
  // Der Wasserrundgang der Woche vom 17.08. wurde auf Donnerstag, 20.08.
  // verschoben; die übrigen Wochen bleiben bei der Rechnung.
  const riVorher = (leer.text.match(/(\d{2})\.08\.2026[^\n]*Wasserrundgang/g) || []);
  const riVerschoben = [
    ...verschoben,
    { id: "r1e", date: "2026-08-20", category: "RI", name: "Wasserrundgang", status: "open", updatedAt: iso("2026-08-18T08:00:00") },
  ];
  const mitRi = await planText(riVerschoben);
  const riTage = (mitRi.text.match(/(\d{2})\.08\.2026[^\n]*Wasserrundgang/g) || []);
  pruef("(3) Der Wasserrundgang der Woche steht am echten Tag (20.08.)",
        riTage.some((z) => z.startsWith("20.08.")), riTage.join(" · ") || "gar nicht");
  pruef("(3) In der Woche vom 17.08. steht KEIN zweiter, errechneter Rundgang",
        riTage.filter((z) => ["17.08.", "18.08.", "19.08.", "21.08.", "22.08.", "23.08."].some((t) => z.startsWith(t))).length === 0,
        riTage.join(" · "));
  pruef("(3) Die übrigen Wochen behalten ihre errechneten Rundgänge",
        riTage.length >= Math.max(1, riVorher.length - 1),
        riTage.length + " von vorher " + riVorher.length);

  /* ---- (4) Erledigtes bleibt sichtbar und am echten Tag ---- */
  const erledigt = [{ id: "t2", date: "2026-08-04", category: "TPM", name: "TS480", status: "done", updatedAt: iso("2026-08-04T10:00:00") }];
  const mitErledigtem = await planText(erledigt);
  const erledigtTage = (mitErledigtem.text.match(/(\d{2})\.08\.2026[^\n]*TS480/g) || []);
  pruef("(4) Ein erledigter Termin steht im Plan am Tag der Erledigung (04.08.)",
        erledigtTage.some((z) => z.startsWith("04.08.")), erledigtTage.join(" · ") || "gar nicht");
  pruef("(4) Auch hier kein zweiter, errechneter Termin daneben", erledigtTage.length === 1, erledigtTage.length + " Vorkommen");

  /* ---- (6) Robertos Regel vom 18.08.: NIE zwei TPM-Wartungen am selben Tag ----
     Wird ein Termin auf den errechneten Tag einer ANDEREN Anlage verschoben,
     darf der Plan dort nicht beide zeigen: Der echte Eintrag hat den Tag,
     der errechnete Termin der anderen Anlage weicht auf den nächsten freien
     Werktag aus. */
  // Aus (1): 24.08. gehört rechnerisch TS320. TS480 wird GENAU dorthin verschoben.
  const kollision = [{ id: "t3", date: "2026-08-24", category: "TPM", name: "TS480", status: "open", updatedAt: iso("2026-08-18T08:00:00") }];
  const mitKollision = await planText(kollision);
  const tageProTag = new Map();
  (mitKollision.text.match(/(\d{2})\.08\.2026[^\n]*(TS200|TS320|TS480|VSM1|B\+T)/g) || []).forEach((z) => {
    const tag = z.slice(0, 6);
    tageProTag.set(tag, (tageProTag.get(tag) || 0) + 1);
  });
  const doppelTage = [...tageProTag.entries()].filter(([, n]) => n > 1).map(([t]) => t);
  pruef("(6) Kein Tag trägt zwei TPM-Wartungen", doppelTage.length === 0, doppelTage.join(", ") || "alle einzeln");
  const ts480Neu = (mitKollision.text.match(/(\d{2})\.08\.2026[^\n]*TS480/g) || []);
  pruef("(6) Der verschobene Termin hält seinen Tag (24.08.)",
        ts480Neu.length === 1 && ts480Neu[0].startsWith("24.08."), ts480Neu.join(" · "));
  const ts320Neu = (mitKollision.text.match(/(\d{2})\.08\.2026[^\n]*TS320(?!0)/g) || []);
  pruef("(6) Die verdrängte Anlage weicht aus, statt zu verschwinden",
        ts320Neu.length === 1 && !ts320Neu[0].startsWith("24.08."), ts320Neu.join(" · ") || "verschwunden");

  pruef("(5) Keine Skriptfehler", leer.fehler.length === 0 && mitVerschobenem.fehler.length === 0 && mitRi.fehler.length === 0 && mitKollision.fehler.length === 0,
        [...leer.fehler, ...mitVerschobenem.fehler, ...mitRi.fehler, ...mitKollision.fehler].slice(0, 2).join(" | "));

  await b.close();
  console.log(`\nHärte 44 (Plan zeigt Wirklichkeit): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
