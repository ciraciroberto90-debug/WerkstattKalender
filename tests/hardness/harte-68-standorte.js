// Härtetest: STANDORT-TRENNUNG (BTA-Cockpit, Robertos Ansage vom 11.09.).
//
// EINE App, mehrere Werkstätten: Beim ersten Start auf einem frischen Rechner
// fragt die App "In welcher Werkstatt arbeitest du?"; die Wahl wird gemerkt.
// Scheurich behält alle alten Schlüssel (Bestandsschutz: laufende Rechner
// bekommen KEINE Frage und verlieren nichts), Soendgen startet BLANKO in
// einem eigenen Namensraum. Ein Standort darf den Bestand des anderen
// niemals sehen, ändern oder zusammenführen - auch nicht über die gemeinsame
// Datei (Standort-Wächter).
//
// Pflicht-Nachweis nach Hausregel (Sync-/Dateiverbindungs-Änderung):
// Dieser Test ist gegen einen Bau OHNE die Trennung gemessen ROT
// (APP_PFAD auf den Alt-Bau zeigen lassen) - siehe S3/S4.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

// Ein unverwechselbarer Scheurich-Bestand unter den ALTEN Schlüsseln.
const SCHEURICH_EINTRAG = { id: "sch-1", date: "2026-09-07", category: "TPM", name: "NUR-SCHEURICH-ANLAGE", status: "open", updatedAt: "2026-09-07T08:00:00.000Z" };
const SCHEURICH_CONFIG = { tpmAnlagen: [{ id: "a1", name: "NUR-SCHEURICH-ANLAGE", role: "takt" }], riItems: [], team: [] };

async function seite(browser, init) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-09-11T09:00:00"));
  await p.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; });
  if (init) await p.addInitScript(init.fn, init.arg);
  await p.goto(APP);
  await p.waitForTimeout(900);
  return { p, ctx, fehler };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (S1) Frischer Rechner: erst die Frage, dann blanko Soendgen ---- */
  {
    const { p, ctx, fehler } = await seite(browser, null);
    pruef("(S1) Frischer Rechner bekommt die Werkstatt-Frage",
          (await p.getByText("In welcher Werkstatt arbeitest du?").count()) === 1);
    pruef("(S1) Vor der Wahl gibt es keine App-Leiste",
          (await p.getByRole("button", { name: "Übersicht", exact: true }).count()) === 0);
    await p.getByRole("button", { name: /Soendgen Keramik/ }).click();
    await p.waitForTimeout(1500);
    const t = await p.locator("body").innerText();
    pruef("(S1) Nach der Wahl läuft die App als Soendgen (BTA-Kopf)",
          /BTA-COCKPIT/i.test(t) && /Soendgen Keramik/.test(t));
    pruef("(S1) Die Wahl ist auf dem Gerät gemerkt",
          (await p.evaluate(() => localStorage.getItem("bta-standort"))) === "soendgen");
    // BLANKO: keine Scheurich-Anlagen, -Rundgänge, -Kostenstellen als Vorgabe.
    await p.locator('button[aria-label="Verwalten"]').click();
    await p.waitForTimeout(500);
    const dialog = await p.locator('div[role="dialog"]').last().innerText().catch(() => p.locator("body").innerText());
    pruef("(S1) Soendgen startet BLANKO (keine vorbelegten Anlagen/R+I)",
          !/TS200|TS480|Masseaufbereitung|Wasserrundgang/.test(dialog));
    await p.getByRole("button", { name: "Kostenstellen" }).click();
    await p.waitForTimeout(400);
    pruef("(S1) Auch die Kostenstellen sind leer (kein Scheurich-Startbestand)",
          !/Presserei|Glasur/.test(await p.locator("body").innerText()));
    pruef("(S1) Keine Skriptfehler", fehler.length === 0, fehler.join(" | "));
    await ctx.close();
  }

  /* ---- (S2) Bestandsschutz: Rechner mit Altbestand bleibt still Scheurich ---- */
  {
    const { p, ctx } = await seite(browser, {
      fn: ({ e, c }) => {
        localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
        localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      },
      arg: { e: [SCHEURICH_EINTRAG], c: SCHEURICH_CONFIG },
    });
    pruef("(S2) Ein Rechner mit Altbestand bekommt KEINE Frage",
          (await p.getByText("In welcher Werkstatt arbeitest du?").count()) === 0);
    pruef("(S2) Er läuft automatisch als Scheurich weiter",
          (await p.evaluate(() => localStorage.getItem("bta-standort"))) === "scheurich" &&
          /Scheurich · Kleinheubach/.test(await p.locator("body").innerText()));
    await ctx.close();
  }

  /* ---- (S3) TRENNUNG: Soendgen sieht Scheurich nicht - und umgekehrt ----
     Ohne die Namensräume liest Soendgen dieselben Schlüssel wie Scheurich:
     Dieser Abschnitt ist am Alt-Bau gemessen ROT. */
  {
    const { p, ctx } = await seite(browser, {
      fn: ({ e, c }) => {
        // Einmal-Marke: addInitScript läuft beim reload() ERNEUT - ohne die
        // Marke stünde der Standort nach dem Rückwechsel wieder auf soendgen.
        if (localStorage.getItem("harte68-gesaet")) return;
        localStorage.setItem("harte68-gesaet", "1");
        localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
        localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
        localStorage.setItem("bta-standort", "soendgen");
      },
      arg: { e: [SCHEURICH_EINTRAG], c: SCHEURICH_CONFIG },
    });
    pruef("(S3) Soendgen sieht den Scheurich-Bestand NICHT",
          !/NUR-SCHEURICH-ANLAGE/.test(await p.locator("body").innerText()));
    // In Soendgen ein To-do erteilen - es muss im EIGENEN Namensraum landen.
    await p.getByRole("button", { name: /^Berichte/ }).first().click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: /^To-do/ }).first().click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "＋ To-do erteilen" }).click();
    await p.waitForTimeout(300);
    await p.locator('input[aria-label="Aufgabe"]').fill("Soendgen-Aufgabe");
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.waitForTimeout(600);
    const lage = await p.evaluate(() => ({
      soendgen: localStorage.getItem("bta-soendgen:werkstatt-kalender-entries") || "",
      scheurich: localStorage.getItem("werkstatt-kalender-entries") || "",
    }));
    pruef("(S3) Das Soendgen-To-do liegt im Soendgen-Namensraum",
          /Soendgen-Aufgabe/.test(lage.soendgen));
    pruef("(S3) Der Scheurich-Bestand blieb unangetastet",
          !/Soendgen-Aufgabe/.test(lage.scheurich) && /NUR-SCHEURICH-ANLAGE/.test(lage.scheurich));
    // Zurück nach Scheurich: dort gibt es das To-do nicht, den Altbestand schon.
    await p.evaluate(() => localStorage.setItem("bta-standort", "scheurich"));
    await p.reload();
    // Nicht auf eine feste Frist verlassen: Unter Suite-Last steht nach
    // 1,2 s manchmal noch "wird geladen…" - erst auf die Leiste warten.
    await p.getByRole("button", { name: "Übersicht", exact: true }).first().waitFor({ timeout: 15000 });
    await p.waitForTimeout(300);
    const zurueck = await p.locator("body").innerText();
    pruef("(S3) Scheurich zeigt seinen Bestand wieder",
          /NUR-SCHEURICH-ANLAGE/.test(zurueck) || /Scheurich · Kleinheubach/.test(zurueck));
    await p.getByRole("button", { name: /^Berichte/ }).first().click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: /^To-do/ }).first().click();
    await p.waitForTimeout(400);
    pruef("(S3) Das Soendgen-To-do taucht in Scheurich NICHT auf",
          !/Soendgen-Aufgabe/.test(await p.locator("body").innerText()));
    await ctx.close();
  }

  /* ---- (S4) Standort-Wächter an der gemeinsamen Datei ----
     Eine Datei der anderen Werkstatt darf nie zusammengeführt werden -
     ohne den Wächter würde ihr Inhalt kommentarlos in den hiesigen
     Bestand einlaufen (am Alt-Bau gemessen ROT). */
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date("2026-09-11T09:00:00"));
    const fremd = {
      format: "werkstatt-kalender-v1", standort: "soendgen", savedAt: "2026-09-10T10:00:00.000Z",
      entries: [{ id: "so-1", date: "2026-09-08", category: "TPM", name: "SOENDGEN-GEHEIM", status: "open", updatedAt: "2026-09-08T08:00:00.000Z" }],
      deleted: {}, config: null,
    };
    await p.addInitScript((datei) => {
      localStorage.setItem("bta-standort", "scheurich");
      const h = {
        name: "soendgen-kalender-daten.json", kind: "file",
        async getFile() { return new File([JSON.stringify(datei)], "soendgen-kalender-daten.json", { type: "application/json" }); },
        async createWritable() { throw new Error("NotAllowedError"); },
        async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [h];
    }, fremd);
    await p.goto(APP);
    await p.waitForTimeout(900);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1200);
    const t = await p.locator("body").innerText();
    pruef("(S4) Die fremde Standort-Datei wird mit klarer Meldung abgewiesen",
          /gehört zur Werkstatt/.test(t) && /Soendgen/.test(t));
    pruef("(S4) Ihr Inhalt wurde NICHT übernommen", !/SOENDGEN-GEHEIM/.test(t));
    const uebernommen = await p.evaluate(() => localStorage.getItem("werkstatt-kalender-entries") || "");
    pruef("(S4) Auch im Zwischenspeicher landete nichts Fremdes", !/SOENDGEN-GEHEIM/.test(uebernommen));
    await ctx.close();
  }

  /* ---- (S4b) Gegenprobe: Alt-Dateien OHNE Kennung gehören Scheurich ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date("2026-09-11T09:00:00"));
    const alt = {
      format: "werkstatt-kalender-v1", savedAt: "2026-09-10T10:00:00.000Z",
      entries: [{ id: "alt-1", date: "2026-09-08", category: "TPM", name: "ALT-DATEI-EINTRAG", status: "open", updatedAt: "2026-09-08T08:00:00.000Z" }],
      deleted: {}, config: null,
    };
    await p.addInitScript((datei) => {
      localStorage.setItem("bta-standort", "scheurich");
      const h = {
        name: "werkstatt-kalender-daten.json", kind: "file",
        async getFile() { return new File([JSON.stringify(datei)], "werkstatt-kalender-daten.json", { type: "application/json" }); },
        async createWritable() { throw new Error("NotAllowedError"); },
        async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [h];
    }, alt);
    await p.goto(APP);
    await p.waitForTimeout(900);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1200);
    const t = await p.locator("body").innerText();
    pruef("(S4b) Eine Alt-Datei ohne Kennung verbindet sich in Scheurich normal",
          !/gehört zur Werkstatt/.test(t) && /ALT-DATEI-EINTRAG/.test(t));
    await ctx.close();
  }

  /* ---- (S5) Feiertage folgen dem Bundesland des Standorts ---- */
  {
    const { p, ctx } = await seite(browser, {
      fn: () => localStorage.setItem("bta-standort", "scheurich"), arg: null,
    });
    const by = await p.evaluate(() => {
      const m = window.__wkFeiertageTest(2027);
      return { dreikoenig: m.get("2027-01-06") || null, himmelfahrtM: m.get("2027-08-15") || null, neujahr: m.get("2027-01-01") || null };
    });
    pruef("(S5) Scheurich (Bayern) kennt Heilige Drei Könige und Mariä Himmelfahrt",
          by.dreikoenig === "Heilige Drei Könige" && by.himmelfahrtM === "Mariä Himmelfahrt" && by.neujahr === "Neujahr");
    await ctx.close();
    const { p: p2, ctx: ctx2 } = await seite(browser, {
      fn: () => localStorage.setItem("bta-standort", "soendgen"), arg: null,
    });
    const nw = await p2.evaluate(() => {
      const m = window.__wkFeiertageTest(2027);
      return { dreikoenig: m.get("2027-01-06") || null, himmelfahrtM: m.get("2027-08-15") || null, allerheiligen: m.get("2027-11-01") || null };
    });
    pruef("(S5) Soendgen (NRW): 6.1. und 15.8. sind Arbeitstage, Allerheiligen bleibt",
          nw.dreikoenig === null && nw.himmelfahrtM === null && nw.allerheiligen === "Allerheiligen");
    await ctx2.close();
  }

  await browser.close();
  console.log(`\nHärte 68 (Standort-Trennung): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})();
