// Härtetest: QOL-RUNDE 2 VOM 19.08. (Robertos "setze ruhig alles um").
//
//  (A) TERMIN VERSCHIEBEN im Dialog: Datumsfeld + Knopf, Notiz wandert mit,
//      Rückgängig bringt ihn zurück.
//  (B) NOTIZ-ZEICHEN auf der Plan-Kachel (✎) samt Notiztext beim Draufzeigen.
//  (C) RÜCKGÄNGIG-LEISTE nach Abhaken und Löschen - acht Sekunden Zeit.
//  (D) NACHTSCHICHT-MODUS über den Auge-Knopf oben rechts; die Wahl
//      überlebt das Neuladen und lässt sich wieder ausschalten.
//  (E) REGISTER-SUCHE mit Trefferzahl.
//  (F) "SEIT DEINEM LETZTEN BESUCH" auf der Übersicht - aus dem Verlauf,
//      wegklickbar; ohne gemerkten Vergleichszeitpunkt erscheint nichts.
//  (G) TAGES-SICHERUNG IM DATENORDNER: einmal am Tag eine Kopie in den
//      Unterordner "Sicherungen" (Konflikt-Wächter-Freigabe), alte Stände
//      werden auf 14 ausgedünnt, und der Wächter frisst die Kopien nie.
//  (H) FEIERTAGS-HINWEIS beim Anlegen eines Termins auf einem Feiertag.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }, { id: "a2", name: "TS320", role: "takt" }],
  riItems: [{ id: "r1", name: "Wasserrundgang", type: "weekly", weekday: 1 }],
  team: [],
};

async function start(browser, eintraege, extraInit) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-18T10:00:00"));
  await p.addInitScript(({ e, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
  }, { e: eintraege, c: config });
  if (extraInit) await p.addInitScript(extraInit);
  await p.goto(APP);
  await p.waitForTimeout(1000);
  return { p, ctx, fehler };
}
const inPlan = async (p) => {
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Plan", exact: true }).first().click();
  await p.waitForTimeout(1200);
};
const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (A) Verschieben + (B) Notiz-Zeichen ---- */
  {
    const { p, ctx } = await start(browser, [
      { id: "t1", date: "2026-08-18", category: "TPM", name: "TS480", status: "open", note: "Ölstand prüfen" },
      { id: "t2", date: "2026-08-19", category: "TPM", name: "TS320", status: "open" },
    ]);
    await inPlan(p);
    const kachel = p.locator('[data-plan-datum="2026-08-18"]').first();
    pruef("(B) Kachel mit Notiz trägt das Notiz-Zeichen", /✎/.test(await kachel.innerText()));
    pruef("(B) Beim Draufzeigen steht der Notiztext", /Ölstand prüfen/.test(await kachel.getAttribute("title")));
    pruef("(B) Kachel ohne Notiz bleibt ohne Zeichen",
          !/✎/.test(await p.locator('[data-plan-datum="2026-08-19"]').first().innerText()));

    await kachel.click();
    await p.waitForTimeout(500);
    await p.locator('input[aria-label="Neues Datum"]').fill("2026-08-25");
    await p.getByRole("button", { name: "Verschieben", exact: true }).click();
    await p.waitForTimeout(500);
    let stand = await gespeichert(p);
    const verschoben = stand.find((e) => e.id === "t1");
    pruef("(A) Der Termin steht auf dem neuen Tag", verschoben && verschoben.date === "2026-08-25", JSON.stringify(verschoben));
    pruef("(A) Die Notiz ist mitgewandert", verschoben && verschoben.note === "Ölstand prüfen");
    pruef("(A) Der Dialog hat sich geschlossen", (await p.locator('input[aria-label="Neues Datum"]').count()) === 0);
    pruef("(A) Die Rückgängig-Leiste erscheint", /verschoben/.test(await p.locator("body").innerText()));
    await p.getByRole("button", { name: "Rückgängig", exact: true }).click();
    await p.waitForTimeout(500);
    stand = await gespeichert(p);
    pruef("(A) Rückgängig bringt ihn auf den alten Tag zurück",
          stand.find((e) => e.id === "t1")?.date === "2026-08-18");
    await ctx.close();
  }

  /* ---- (C) Rückgängig nach Abhaken und Löschen ---- */
  {
    const { p, ctx, fehler } = await start(browser, [
      { id: "t1", date: "2026-08-18", category: "TPM", name: "TS480", status: "open" },
    ]);
    await inPlan(p);
    await p.getByRole("button", { name: /TS480 am 18\.08\.2026 als erledigt abhaken/ }).click();
    await p.waitForTimeout(400);
    pruef("(C) Nach dem Abhaken: Leiste mit Rückgängig",
          /abgehakt/.test(await p.locator("body").innerText()) &&
          (await p.getByRole("button", { name: "Rückgängig", exact: true }).count()) === 1);
    await p.getByRole("button", { name: "Rückgängig", exact: true }).click();
    await p.waitForTimeout(500);
    pruef("(C) Rückgängig macht den Termin wieder offen",
          (await gespeichert(p)).find((e) => e.id === "t1")?.status === "open");

    // Löschen (bestätigt) und zurückholen
    await p.locator('[data-plan-datum="2026-08-18"]').first().click();
    await p.waitForTimeout(400);
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "Löschen", exact: true }).click();
    await p.waitForTimeout(500);
    pruef("(C) Nach dem Löschen ist er weg", (await gespeichert(p)).length === 0);
    await p.getByRole("button", { name: "Rückgängig", exact: true }).click();
    await p.waitForTimeout(500);
    const zurueck = await gespeichert(p);
    pruef("(C) Rückgängig holt ihn zurück (neuer Kennung, gleicher Inhalt)",
          zurueck.length === 1 && zurueck[0].name === "TS480" && zurueck[0].date === "2026-08-18" && zurueck[0].id !== "t1",
          JSON.stringify(zurueck[0] || null));
    // Acht Sekunden später ist die Leiste von selbst weg
    await p.clock.fastForward(9000);
    await p.waitForTimeout(300);
    pruef("(C) Nach acht Sekunden verschwindet die Leiste von selbst",
          (await p.getByRole("button", { name: "Rückgängig", exact: true }).count()) === 0);
    pruef("(C) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (D) Nachtschicht-Modus über den Auge-Knopf ---- */
  {
    const { p, ctx } = await start(browser, []);
    const auge = p.locator('button[aria-label="Nachtschicht-Modus"]');
    pruef("(D) Der Auge-Knopf sitzt oben rechts", (await auge.count()) === 1);
    pruef("(D) Vorher: normale Darstellung",
          !(await p.evaluate(() => document.documentElement.classList.contains("wk-nacht"))));
    await auge.click();
    await p.waitForTimeout(300);
    pruef("(D) Ein Klick schaltet dunkel",
          await p.evaluate(() => document.documentElement.classList.contains("wk-nacht")));
    await p.reload();
    await p.waitForTimeout(1000);
    pruef("(D) Die Wahl überlebt das Neuladen",
          await p.evaluate(() => document.documentElement.classList.contains("wk-nacht")));
    await p.locator('button[aria-label="Nachtschicht-Modus"]').click();
    await p.waitForTimeout(300);
    pruef("(D) Noch ein Klick schaltet zurück",
          !(await p.evaluate(() => document.documentElement.classList.contains("wk-nacht"))));
    await ctx.close();
  }

  /* ---- (E) Register-Suche ---- */
  {
    const { p, ctx } = await start(browser, []);
    await p.getByRole("button", { name: "TPM", exact: true }).first().click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "Register", exact: true }).first().click();
    await p.waitForTimeout(600);
    await p.locator('input[aria-label="Register durchsuchen"]').fill("wasser");
    await p.waitForTimeout(400);
    const text = await p.locator("body").innerText();
    pruef("(E) Trefferzahl wird genannt", /1 Treffer/.test(text));
    pruef("(E) Nur der Treffer bleibt stehen",
          (await p.getByRole("button", { name: "Wasserrundgang" }).count()) === 1 &&
          (await p.getByRole("button", { name: /TS480/ }).count()) === 0);
    pruef("(E) Die leere Spalte sagt es ehrlich", /keine Treffer/.test(text));
    await p.locator('input[aria-label="Register durchsuchen"]').fill("");
    await p.waitForTimeout(300);
    pruef("(E) Leeres Feld zeigt wieder alles",
          (await p.getByRole("button", { name: /TS480/ }).count()) === 1);
    await ctx.close();
  }

  /* ---- (F) "Seit deinem letzten Besuch" ---- */
  {
    const jetzt = "2026-08-18T09:55:00.000Z";
    const { p, ctx } = await start(browser, [], () => {
      localStorage.setItem("werkstatt-kalender-letzter-besuch", "2026-08-17T15:42:00.000Z");
      const daten = {
        format: "werkstatt-kalender-v1", savedAt: "2026-08-18T09:55:00.000Z",
        entries: [
          { id: "e1", date: "2026-08-18", category: "TPM", name: "TS480", status: "open", updatedAt: "2026-08-18T09:55:00.000Z" },
          { id: "log|2026-08-18T09:50:00.000Z-abc123", date: "2026-08-18", ts: "2026-08-18T09:50:00.000Z", wer: "M. Weber", was: "angelegt: Wartung TS480 am 18.08.2026", updatedAt: "2026-08-18T09:50:00.000Z" },
          { id: "log|2026-08-16T09:00:00.000Z-alt111", date: "2026-08-16", ts: "2026-08-16T09:00:00.000Z", wer: "K. Yilmaz", was: "geändert: Wartung TS320 am 16.08.2026", updatedAt: "2026-08-16T09:00:00.000Z" },
        ],
        deleted: {}, config: null,
      };
      const h = {
        name: "kalender-daten.json", kind: "file",
        async getFile() { return new File([JSON.stringify(daten)], "kalender-daten.json", { type: "application/json" }); },
        async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { } }; },
        async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [h];
    });
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1000);
    await p.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
    await p.waitForTimeout(400);
    const text = await p.locator("body").innerText();
    pruef("(F) Die Übersicht meldet, was seit dem letzten Besuch geschah",
          /SEIT DEINEM LETZTEN BESUCH/i.test(text));
    pruef("(F) Nur NEUERE Verlaufszeilen zählen (1 angelegt, die ältere nicht)",
          /1 angelegt/.test(text) && !/1 geändert/.test(text));
    await p.getByRole("button", { name: "Einzelheiten" }).click();
    await p.waitForTimeout(300);
    pruef("(F) Einzelheiten nennen Bearbeiter und Vorgang",
          /M\. Weber/.test(await p.locator("body").innerText()));
    await p.locator('button[aria-label="Neuigkeiten schließen"]').click();
    await p.waitForTimeout(300);
    pruef("(F) Wegklicken räumt die Leiste ab",
          !/SEIT DEINEM LETZTEN BESUCH/i.test(await p.locator("body").innerText()));
    await ctx.close();
  }
  {
    // Ohne gemerkten Vergleichszeitpunkt (erster Besuch) erscheint nichts.
    const { p, ctx } = await start(browser, []);
    pruef("(F) Beim allerersten Besuch erscheint keine Leiste",
          !/SEIT DEINEM LETZTEN BESUCH/i.test(await p.locator("body").innerText()));
    await ctx.close();
  }

  /* ---- (G) Tages-Sicherung im Datenordner ---- */
  {
    const { p, ctx } = await start(browser, [], () => {
      window.__ordnerDateien = {};      // oberste Ebene
      window.__sicherungen = {};        // Unterordner "Sicherungen"
      // 15 alte Stände: nach dem nächsten Sichern muss ausgedünnt sein.
      for (let i = 1; i <= 15; i++) {
        window.__sicherungen[`kalender-daten-sicherung-2026-07-${String(i).padStart(2, "0")}.json`] = "{}";
      }
      const dateiHandle = (speicher, name) => ({
        name, kind: "file",
        async getFile() { return new File([speicher[name] ?? ""], name, { type: "application/json" }); },
        async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { speicher[name] = b; } }; },
        async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
      });
      const unterordner = {
        name: "Sicherungen", kind: "directory",
        async getFileHandle(n, o) { if (!(n in window.__sicherungen) && !(o && o.create)) throw new Error("NotFoundError"); return dateiHandle(window.__sicherungen, n); },
        async *entries() { for (const n of Object.keys(window.__sicherungen)) yield [n, dateiHandle(window.__sicherungen, n)]; },
        async removeEntry(n) { delete window.__sicherungen[n]; },
        async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
      };
      window.__ordnerHandle = {
        name: "Werkstatt", kind: "directory",
        async getDirectoryHandle(n, o) { if (n === "Sicherungen") return unterordner; throw new Error("NotFoundError"); },
        async *entries() { for (const n of Object.keys(window.__ordnerDateien)) yield [n, dateiHandle(window.__ordnerDateien, n)]; },
        async removeEntry(n) { delete window.__ordnerDateien[n]; },
        async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
      };
      window.__ordnerDateien["kalender-daten.json"] = JSON.stringify({
        format: "werkstatt-kalender-v1", savedAt: "2026-08-18T08:00:00.000Z",
        entries: [{ id: "e1", date: "2026-08-18", category: "TPM", name: "TS480", status: "open", updatedAt: "2026-08-18T08:00:00.000Z" }],
        deleted: {}, config: null,
      });
      window.showOpenFilePicker = async () => [dateiHandle(window.__ordnerDateien, "kalender-daten.json")];
    });
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1000);
    // Ordner-Freigabe wie beim Konflikt-Wächter über den Test-Zugang
    await p.evaluate(() => { window.__wkSharedTest.adoptFolder(window.__ordnerHandle); });
    // Der nächste Abgleich legt die Tages-Sicherung an
    await p.evaluate(async () => { await window.__wkSharedTest.poll(); });
    await p.waitForTimeout(600);
    let dateien = await p.evaluate(() => Object.keys(window.__sicherungen));
    pruef("(G) Der Abgleich legt die heutige Sicherung in 'Sicherungen' ab",
          dateien.includes("kalender-daten-sicherung-2026-08-18.json"), dateien.slice(-3).join(", "));
    pruef("(G) Alte Stände sind auf 14 ausgedünnt", dateien.length === 14, dateien.length + " Dateien");
    const inhalt = await p.evaluate(() => JSON.parse(window.__sicherungen["kalender-daten-sicherung-2026-08-18.json"]));
    pruef("(G) Die Sicherung enthält den echten Bestand",
          Array.isArray(inhalt.entries) && inhalt.entries.some((e) => e.name === "TS480"));
    // Zweiter Abgleich am selben Tag: KEIN zweites Schreiben (Marker greift)
    await p.evaluate(() => { window.__sicherungen["kalender-daten-sicherung-2026-08-18.json"] = "MARKER"; });
    await p.evaluate(async () => { await window.__wkSharedTest.poll(); });
    await p.waitForTimeout(500);
    pruef("(G) Am selben Tag wird nicht noch einmal geschrieben",
          (await p.evaluate(() => window.__sicherungen["kalender-daten-sicherung-2026-08-18.json"])) === "MARKER");
    // Der Konflikt-Wächter lässt die Sicherungs-Kopien in Ruhe ("sicherung" = Schutzwort)
    await p.evaluate(async () => { await window.__wkSharedTest.sammle(); });
    await p.waitForTimeout(400);
    dateien = await p.evaluate(() => Object.keys(window.__sicherungen));
    pruef("(G) Der Konflikt-Wächter frisst die Sicherungen nicht", dateien.length === 14);
    await ctx.close();
  }

  /* ---- (H) Feiertags-Hinweis beim Anlegen ---- */
  {
    const { p, ctx } = await start(browser, []);
    await inPlan(p);
    // Die "+"-Knöpfe stehen je Tageszelle in Monatsreihenfolge: nth(14) = 15.08.
    await p.locator('button[aria-label="Eintrag hinzufügen"]').nth(14).click();
    await p.waitForTimeout(400);
    const dialogText = await p.locator("body").innerText();
    pruef("(H) Der Dialog warnt am Feiertag",
          /15\.08\.2026 ist Mariä Himmelfahrt \(Feiertag\)/.test(dialogText));
    pruef("(H) Und fragt, statt zu verbieten", /trotzdem anlegen/i.test(dialogText));
    await p.locator('button[aria-label="Schließen"]').first().click();
    await p.waitForTimeout(300);
    await p.locator('button[aria-label="Eintrag hinzufügen"]').nth(17).click(); // 18.08., kein Feiertag
    await p.waitForTimeout(400);
    // "Feiertag" allein steht auch im Rotations-Hinweis der Seite - geprüft
    // wird deshalb der Warnsatz selbst.
    pruef("(H) An normalen Tagen bleibt der Dialog still",
          !/trotzdem anlegen/i.test(await p.locator("body").innerText()));
    await ctx.close();
  }

  console.log(`\nHärte 47 (QoL-Runde 2): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
