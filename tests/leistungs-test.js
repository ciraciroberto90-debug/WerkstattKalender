// LEISTUNGS-TEST: Wie verhält sich die App, wenn über Jahre Daten auflaufen?
//
// Hochrechnung für eine Werkstatt mit ~15 Leuten und ~20 Anlagen:
//   Schichtplan   15 Personen x 365 Tage      = ~5.500 Einträge pro Jahr
//   Wartung/TPM   20 Anlagen x 12 Monate      =   ~240 Einträge pro Jahr
//   R+I           6 Punkte, teils wöchentlich =   ~500 Einträge pro Jahr
//   Arbeiten      Backlog                     =   ~200 Einträge pro Jahr
//                                             ------------------------
//                                               ~6.500 Einträge pro Jahr
// Gemessen wird bei 1, 3 und 5 Jahren Bestand - und zusätzlich ein bewusst
// überzogener Fall, um zu sehen, wo die Grenze liegt.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

const PERSONEN = ["R. Ciraci", "M. Weber", "T. Klein", "S. Bauer", "A. Fischer", "J. Wolf",
  "P. Schmitt", "L. Krause", "D. Hoffmann", "N. Berger", "F. Lang", "K. Sommer",
  "H. Vogel", "B. Zimmer", "C. Ritter"];
const ANLAGEN = ["BTS", "VSM1", "VSM2", "HRO", "RRO", "OF320", "TS200", "B+T", "B1", "B2", "B3",
  "LTA1", "LTA2", "Masseaufbereitung", "Presse 1", "Presse 2", "Presse 3", "Foerderband 1",
  "Foerderband 2", "Kompressor"];
const RI = ["Regalkontrolle", "Leiterkontrolle", "Filterwartung", "Trinkwasserfilter",
  "Sicherheitsrundgang", "Sprinklerwartung"];

function baueDaten(jahre) {
  const entries = [];
  const start = new Date(2026, 0, 1);
  const tage = jahre * 365;
  for (let d = 0; d < tage; d++) {
    const tag = new Date(start.getTime() + d * 86400000);
    const iso = tag.toISOString().slice(0, 10);
    const wt = tag.getDay();
    const stamp = tag.toISOString();
    // Schichtplan: jede Person jeden Werktag
    if (wt >= 1 && wt <= 5) {
      PERSONEN.forEach((p, i) => {
        entries.push({ id: `schicht-t|${p}|${iso}`, category: "SCHICHT", scope: "tag", name: p,
          date: iso, wert: ["Früh", "Spät", "Nacht"][(d + i) % 3], updatedAt: stamp });
      });
    }
    // Wartung: montags eine Anlage
    if (wt === 1) {
      const a = ANLAGEN[Math.floor(d / 7) % ANLAGEN.length];
      entries.push({ id: `tpm|${a}|${iso}`, category: "TPM", name: a, date: iso,
        status: d % 4 === 0 ? "open" : "done", updatedAt: stamp });
    }
    // R+I: zwei Punkte pro Woche
    if (wt === 3) {
      RI.slice(0, 2).forEach((r, i) => {
        entries.push({ id: `ri|${r}|${iso}`, category: "RI", name: r, date: iso,
          status: d % 3 === 0 ? "open" : "done", updatedAt: stamp });
      });
    }
    // Arbeiten: gelegentlich
    if (d % 9 === 0) {
      entries.push({ id: `arb|${d}`, category: "ARBEIT", name: `Arbeit Nr. ${d}`, date: iso,
        status: "open", prio: ["hoch", "mittel", "niedrig"][d % 3], art: ["mech", "elek"][d % 2],
        note: "Beschreibung der auszuführenden Tätigkeit mit etwas Text.", updatedAt: stamp });
    }
  }
  return entries;
}

const CONFIG = {
  tpmAnlagen: ANLAGEN.map((n, i) => ({ id: n.toLowerCase().replace(/\W/g, ""), name: n,
    role: ["monday1", "monday2", "monday3", "monday4", "takt", "flexA", "flexB", "b1"][i % 8] })),
  riItems: RI.map((n, i) => ({ id: n.toLowerCase(), name: n, type: ["woechentlich", "monatlich", "jaehrlich"][i % 3] })),
  team: PERSONEN.map((n) => ({ name: n, rolle: ["mech", "elek", "azubi"][n.length % 3] })),
  extraSchichten: [], anlagenteile: [],
};

async function miss(browser, entries, etikett) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1600, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.clock.setFixedTime(new Date("2027-06-15T10:00:00"));
  await page.addInitScript((d) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(d.entries));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(d.config));
  }, { entries, config: CONFIG });

  const t0 = Date.now();
  await page.goto(APP);
  // Warten, bis die Oberfläche wirklich steht (nicht nur das Gerüst)
  await page.waitForFunction(() => {
    const t = document.body.innerText || "";
    return t.includes("HEUTE") || t.includes("Heute");
  }, { timeout: 60000 }).catch(() => {});
  const start = Date.now() - t0;

  const zeiten = { Start: start };
  const wechsle = async (name, exact = true) => {
    const t = Date.now();
    const b = page.getByRole("button", { name, exact });
    if (await b.count()) {
      await b.first().click();
      await page.waitForTimeout(30);
      // auf Ruhe warten: zwei aufeinanderfolgende Frames ohne Arbeit
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    zeiten[name] = Date.now() - t;
  };
  await wechsle("Schichtplan");
  await wechsle("Planung");
  await wechsle("Backlog");
  await wechsle("Störungen", false);
  await wechsle("TPM");
  await wechsle("Plan");
  await wechsle("Auswertung");

  // Speichern (ohne Datei: nur lokal) - misst die Verarbeitung im Programm
  const speichern = await page.evaluate(async () => {
    const cur = JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]");
    cur.push({ id: "neu-" + Date.now(), category: "ARBEIT", name: "Messeintrag", date: "2027-06-16", status: "open", prio: "hoch" });
    const t = performance.now();
    await window.storage.set("werkstatt-kalender-entries", JSON.stringify(cur));
    return Math.round(performance.now() - t);
  });
  zeiten["Speichern"] = speichern;

  const groesse = Math.round(JSON.stringify(entries).length / 1024);
  await page.close();
  return { etikett, anzahl: entries.length, groesse, zeiten, fehler };
}

const ampel = (ms) => (ms < 400 ? "  gut" : ms < 1500 ? " zäh" : "LANGSAM");

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const faelle = [
    ["1 Jahr", baueDaten(1)],
    ["3 Jahre", baueDaten(3)],
    ["5 Jahre", baueDaten(5)],
    ["10 Jahre (überzogen)", baueDaten(10)],
  ];

  const ergebnisse = [];
  for (const [etikett, entries] of faelle) {
    process.stdout.write(`messe ${etikett} (${entries.length} Einträge) ... `);
    const r = await miss(browser, entries, etikett);
    ergebnisse.push(r);
    console.log("fertig");
  }

  console.log("\n" + "=".repeat(78));
  console.log("LEISTUNGS-MESSUNG (Millisekunden)");
  console.log("=".repeat(78));
  const spalten = ["Start", "Schichtplan", "Planung", "Backlog", "Störungen", "TPM", "Plan", "Auswertung", "Speichern"];
  console.log("Fall".padEnd(22) + "Einträge".padStart(9) + "  Größe" + spalten.map((s) => s.slice(0, 9).padStart(11)).join(""));
  console.log("-".repeat(78 + spalten.length * 2));
  ergebnisse.forEach((r) => {
    console.log(
      r.etikett.padEnd(22) +
      String(r.anzahl).padStart(9) +
      (r.groesse + " KB").padStart(8) +
      spalten.map((s) => String(r.zeiten[s] ?? "-").padStart(11)).join("")
    );
  });

  console.log("\nBEWERTUNG (langsamster Wert je Fall)");
  console.log("-".repeat(60));
  let schlecht = 0;
  ergebnisse.forEach((r) => {
    const eintraege = Object.entries(r.zeiten);
    const [wo, ms] = eintraege.reduce((a, b) => (b[1] > a[1] ? b : a));
    console.log(`${r.etikett.padEnd(22)} ${String(ms).padStart(6)} ms  ${ampel(ms)}   (${wo})`);
    if (ms >= 1500 && !r.etikett.includes("überzogen")) schlecht++;
    // Im überzogenen Fall passt der Bestand nicht mehr in den Zwischenspeicher
    // des Browsers - diese Meldung IST das Ergebnis, kein Programmfehler.
    // Wie die App damit umgeht, prüft harte-21-speicher-voll.js.
    if (r.fehler.length) {
      const quote = r.fehler.some((f) => /quota/i.test(f));
      console.log(`   ${quote ? "Grenze erreicht: Bestand passt nicht mehr in den Browser-Zwischenspeicher" : "JS-Fehler: " + r.fehler.slice(0, 2).join(" | ")}`);
    }
  });

  console.log("\nMaßstab: unter 400 ms wirkt sofort, bis 1500 ms merklich, darüber störend.");
  await browser.close();
  process.exit(schlecht > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
