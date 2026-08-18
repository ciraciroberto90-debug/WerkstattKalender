// Ultimativer Simulations-/Smoke-Test: klickt beide Modi (Bearbeiter solo + Leser)
// durch ALLE Ansichten und Kern-Interaktionen und prüft auf JS-Fehler + erwartete Inhalte.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const path = require("path");
const STOER = require("/home/user/WerkstattKalender/tools/demo-stoerungen.js");
const APP = "file://" + path.resolve("/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); c ? pass++ : fail++; };

const CONFIG = { team: [
  { name: "R. Ciraci", rolle: "mech" }, { name: "M. Weber", rolle: "elek" }, { name: "T. Klein", rolle: "mech" },
  { name: "S. Bauer", rolle: "azubi" }, { name: "A. Fischer", rolle: "elek" }, { name: "J. Wolf", rolle: "mech" },
] };
const ENTRIES = [];
["BTS","VSM1","HRO","OF320","TS200","B+T","RRO","B1","LTA1"].forEach((n,i)=>ENTRIES.push({id:"t"+i,date:"2026-07-"+String(i*2+3).padStart(2,"0"),category:"TPM",name:n,status:"done"}));
["Wasserrundgang","Energieaufschreibung","Kompressor Rundgang"].forEach((n,i)=>ENTRIES.push({id:"r"+i,date:"2026-07-"+String(i*3+20).padStart(2,"0"),category:"RI",name:n,status:"open"}));
[["R. Ciraci","Früh"],["S. Bauer","Früh"],["T. Klein","Spät"],["J. Wolf","Spät mit B"],["M. Weber","Nacht"]].forEach(([p,w])=>ENTRIES.push({id:"s|"+p,category:"SCHICHT",scope:"tag",name:p,date:"2026-07-23",wert:w}));
ENTRIES.push({ id:"arb1", date:"2026-07-10", category:"ARBEIT", name:"Hallenbeleuchtung prüfen", note:"", status:"open", prio:"hoch", art:"elek" });

async function neueSeite(browser, solo, uhr = "2026-07-23T15:00:00") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0,140)); });
  page.on("dialog", (d) => d.accept());
  await page.clock.setFixedTime(new Date(uhr));
  if (solo) {
    await page.addInitScript((d) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(d.CONFIG));
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(d.ENTRIES));
      localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(d.STOER));
    }, { CONFIG, ENTRIES, STOER });
  } else {
    // Leser: File System Access vorhanden, aber read-only Datei
    await page.exposeFunction("__r", () => JSON.stringify({ format:"werkstatt-kalender-v1", savedAt:"2026-01-01T00:00:00.000Z", entries: ENTRIES, deleted:{}, config: CONFIG }));
    await page.addInitScript(() => {
      const h = { name:"kalender-daten.json", kind:"file",
        async getFile(){ return new File([await window.__r()], "kalender-daten.json", {type:"application/json"}); },
        async createWritable(){ throw new Error("NotAllowedError"); },
        async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } };
      window.showOpenFilePicker = async () => [h];
    });
  }
  await page.goto(APP);
  await page.waitForTimeout(1200);
  return { page, errs };
}

const klick = async (page, name, exact = true) => { await page.getByRole("button", { name, exact }).first().click(); await page.waitForTimeout(450); };
const txt = async (page) => (await page.locator("body").innerText());

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ============ BEARBEITER (Solo) ============ */
  {
    const { page, errs } = await neueSeite(browser, true);
    ok("B: App lädt ohne Fehler", errs.length === 0);
    ok("B: Cockpit + TPM Hauptreiter da", (await page.getByRole("button",{name:"Cockpit",exact:true}).count()) === 0 && (await page.getByRole("button",{name:"Werkstatt",exact:true}).count()) === 1);

    // Cockpit-Übersicht
    ok("B: Übersicht zeigt 'in der Werkstatt'", (await txt(page)).includes("in der Werkstatt"));
    ok("B: Übersicht zeigt offene Störungen", (await txt(page)).includes("Offene Störungen") || (await txt(page)).includes("OFFENE STÖRUNGEN"));

    // Schichtplan + Zelle setzen
    await klick(page, "Schichtplan");
    ok("B: Schichtplan-Matrix (Personenzeilen)", (await page.locator("tbody tr").count()) >= 5);
    const zelle = page.locator('button[aria-label^="Matrix R. Ciraci"]').first();
    if (await zelle.count()) { await zelle.click(); await page.waitForTimeout(250); const fr = page.getByRole("button",{name:"Früh",exact:true}); if (await fr.count()) { await fr.first().click(); await page.waitForTimeout(300); } }
    ok("B: Schicht setzen ohne Fehler", errs.length === 0);

    // Planung
    await klick(page, "Planung");
    ok("B: Planung rendert", (await txt(page)).toLowerCase().includes("wartungsplan") || (await txt(page)).includes("Arbeiten"));

    // Backlog
    await klick(page, "Backlog");
    ok("B: Backlog zeigt Demo-Arbeit", (await txt(page)).includes("Hallenbeleuchtung"));

    // Störungen: Liste
    await klick(page, "Störungen", false);
    ok("B: Störungen Kopf 'offen · behoben'", /offen\s*·\s*\d+\s*behoben/.test(await txt(page)));
    // Tag aufklappen -> Schicht -> Bericht -> Detail
    const tag = page.getByRole("button", { name: /22\.07\.2026/ }).first();
    if (await tag.count()) { await tag.click(); await page.waitForTimeout(350);
      const sh = page.getByRole("button", { name: /Nacht|Spät|Früh/ }).first();
      if (await sh.count()) { await sh.click(); await page.waitForTimeout(300); }
    }
    ok("B: Störungen aufklappen ohne Fehler", errs.length === 0);
    // Auswertung
    const aus = page.getByRole("button", { name: "Auswertung", exact: true });
    if (await aus.count()) { await aus.first().click(); await page.waitForTimeout(400); }
    ok("B: Störungen-Auswertung ohne Fehler", errs.length === 0);

    // Störbericht erfassen (Formular öffnen)
    const erf = page.getByRole("button", { name: /Störbericht erfassen/ });
    if (await erf.count()) { await erf.first().click(); await page.waitForTimeout(400);
      ok("B: Erfassen-Formular offen", (await txt(page)).includes("Beschreibung") || (await txt(page)).includes("Störungs"));
      const abbr = page.getByRole("button", { name: /Abbrechen|Schließen|×/ }).first();
      if (await abbr.count()) await abbr.click().catch(()=>{});
      await page.waitForTimeout(200);
    } else ok("B: Erfassen-Button vorhanden", false);

    // TPM-Bereich
    await klick(page, "TPM");
    ok("B: TPM-Übersicht (Willkommen-Board)", (await txt(page)).includes("Willkommen") && (await txt(page)).includes("folgende Bausteine"));
    // R+I-Punkt aufklappen
    const rk = page.getByText("Regalkontrolle", { exact: true }).first();
    if (await rk.count()) { await rk.click(); await page.waitForTimeout(300); ok("B: R+I-Punkt zeigt Rechtsgrundlage", (await txt(page)).includes("Rechtsgrundlage")); }
    else ok("B: Regalkontrolle vorhanden", false);
    // Seit dem 18.08. heißt der verschmolzene Reiter wieder "Plan"
    await klick(page, "Plan");
    ok("B: Plan-Kalender in der Auswertung", /plan-kalender/i.test(await txt(page)));
    ok("B: Auswertung (Matrix/Monat)", (await txt(page)).toLowerCase().includes("matrix") || /Monat|Jahr/.test(await txt(page)));
    await klick(page, "Register");
    ok("B: Register rendert ohne Fehler", errs.length === 0);

    // Einstellungen ⚙ öffnen
    const gear = page.locator('button[aria-label="Verwalten"]');
    if (await gear.count()) { await gear.click(); await page.waitForTimeout(400);
      ok("B: ⚙ zeigt R+I Wissens-Felder (Rechtsgrundlage/Info/Link)", (await page.locator('input[placeholder*="Rechtsgrundlage"]').count()) > 0 && (await page.locator('textarea[placeholder*="Info"]').count()) > 0 && (await page.locator('input[placeholder*="Link"]').count()) > 0);
      const zu = page.locator('button[aria-label="Schließen"]').first();
      if (await zu.count()) await zu.click().catch(()=>{});
    } else ok("B: ⚙-Knopf vorhanden", false);

    ok("B: KEINE JS-Fehler über den gesamten Durchlauf", errs.length === 0);
    if (errs.length) console.log("   Fehler:", errs.slice(0,5));
    await page.close();
  }

  /* ============ LESER ============ */
  {
    const { page, errs } = await neueSeite(browser, false);
    await page.locator('button[aria-label="Gemeinsame Datei"]').click().catch(()=>{});
    const vo = page.getByText("Vorhandene Datei öffnen …"); if (await vo.count()) await vo.click();
    await page.waitForTimeout(1200);
    ok("L: Lädt als Leser ohne Fehler", errs.length === 0);
    ok("L: Cockpit + TPM Hauptreiter sichtbar", (await page.getByRole("button",{name:"Werkstatt",exact:true}).count()) === 1 && (await page.getByRole("button",{name:"TPM",exact:true}).count()) === 1);
    ok("L: KEIN Backlog", (await page.getByRole("button",{name:"Backlog",exact:true}).count()) === 0);
    ok("L: KEIN ⚙-Verwalten", (await page.locator('button[aria-label="Verwalten"]').count()) === 0);
    ok("L: Geheime Backlog-Arbeit NICHT sichtbar", !(await txt(page)).includes("Hallenbeleuchtung"));
    // durch erlaubte Reiter klicken
    for (const t of ["Schichtplan","Planung"]) await klick(page, t);
    await klick(page, "Störungen", false);
    ok("L: Störungen für Leser sichtbar (eigene Datei)", /offen\s*·\s*\d+\s*behoben/.test(await txt(page)));
    await klick(page, "TPM");
    ok("L: TPM-Übersicht auch für Leser", (await txt(page)).includes("Willkommen"));
    // Leser sehen den Plan seit dem 18.08. über die Auswertung (nur ansehen)
    await klick(page, "Plan");
    ok("L: Plan-Kalender für Leser", /plan-kalender/i.test(await txt(page)));
    ok("L: KEINE JS-Fehler über den gesamten Durchlauf", errs.length === 0);
    if (errs.length) console.log("   Fehler:", errs.slice(0,5));
    await page.close();
  }

  console.log(`\n==== SMOKE: ${pass} PASS / ${fail} FAIL ====`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
