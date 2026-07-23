// VERÖFFENTLICHUNGS-TEST (Release-Gate) - höchste Stufe.
// Prüft gezielt die Rollout-Risiken, nicht nur Bausteine:
//  S2  Zwei Bearbeiter GLEICHZEITIG an der Hauptdatei -> kein Datenverlust, sauberes Zusammenführen
//  S4  Versions-Mix: ein Feld, das eine ANDERE App-Version geschrieben hat, überlebt das Speichern
//  S5  Neu laden: lokal gesicherte Daten sind nach Reload wieder da (und in der Oberfläche sichtbar)
//  S6  Störungen-Datei: Lesen bewahrt auch unbekannte Felder (Versions-Sicherheit der 2. Datei)
// (S1 Deploy-Integrität + S3 Zwei-Bearbeiter-Störungen laufen separat: S1 im Build-Check, S3 in harte-17.)
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); c ? pass++ : fail++; };
const drive = {};

async function makeUser(browser, uhr, solo) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1400, height: 1200 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.setFixedTime(new Date(uhr));
  await page.exposeFunction("__fsRead", (n) => drive[n] ?? "");
  await page.exposeFunction("__fsWrite", (n, c) => { drive[n] = c; });
  await page.addInitScript((soloFlag) => {
    window.__mk = (name) => ({
      name, kind: "file",
      async getFile() { const t = await window.__fsRead(name); return new File([t], name, { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(c) { b += c; }, async close() { await window.__fsWrite(name, b); } }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    if (soloFlag) { delete window.showOpenFilePicker; delete window.showSaveFilePicker; }
  }, !!solo);
  await page.goto(APP);
  await page.waitForTimeout(900);
  return page;
}
const adoptMain = (page) => page.evaluate(async () => await window.__wkSharedTest.adopt(window.__mk("kalender-daten.json"), "readwrite"));
const adoptStoer = (page) => page.evaluate(async () => await window.__wkStoerTest.adopt(window.__mk("werkstatt-stoerungen.json"), "readwrite"));
const setzeEntries = (page, arr) => page.evaluate(async (a) => await window.storage.set("werkstatt-kalender-entries", JSON.stringify(a)), arr);
const pollMain = (page) => page.evaluate(() => window.__wkSharedTest.poll());
const A = (id, name) => ({ id, date: "2026-07-10", category: "ARBEIT", name, status: "open", prio: "hoch", art: "mech" });

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- S2: Zwei Bearbeiter gleichzeitig, kein Datenverlust ---- */
  {
    drive["kalender-daten.json"] = JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: null, entries: [], deleted: {}, config: { team: [] } });
    const u1 = await makeUser(browser, "2026-07-13T09:00:00");
    const u2 = await makeUser(browser, "2026-07-13T09:00:02");
    await adoptMain(u1); await adoptMain(u2);
    await setzeEntries(u1, [A("A1", "A-Arbeit")]);
    await setzeEntries(u2, [A("B1", "B-Arbeit")]);   // schreibt in dieselbe Datei -> muss zusammenführen
    await pollMain(u1); await pollMain(u2);
    await u1.waitForTimeout(200);
    const file = JSON.parse(drive["kalender-daten.json"]);
    const ids = file.entries.map((e) => e.id);
    ok("S2: beide Bearbeiter-Einträge in der gemeinsamen Datei (kein Verlust)", ids.includes("A1") && ids.includes("B1"));
    const l1 = await u1.evaluate(() => localStorage.getItem("werkstatt-kalender-entries"));
    ok("S2: Bearbeiter 1 sieht nach Abgleich BEIDE Einträge", l1.includes("A1") && l1.includes("B1"));
    await u1.close(); await u2.close();
  }

  /* ---- S4: Versions-Mix - unbekanntes Feld überlebt das Speichern ---- */
  {
    drive["kalender-daten.json"] = JSON.stringify({
      format: "werkstatt-kalender-v1", savedAt: "2026-01-01T00:00:00.000Z", deleted: {}, config: { team: [] },
      entries: [{ id: "X", date: "2026-06-01", category: "ARBEIT", name: "Alt-Eintrag", status: "open", prio: "hoch", updatedAt: "2026-06-01T00:00:00.000Z", _neuesFeld: "kommt-aus-neuerer-version" }],
    });
    const u = await makeUser(browser, "2026-07-13T10:00:00");
    await adoptMain(u); // liest X (samt unbekanntem Feld) in den lokalen Bestand - wie die echte App
    const cur = await u.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
    ok("S4: App liest Alt-Eintrag samt unbekanntem Feld überhaupt ein", cur.some((e) => e.id === "X" && e._neuesFeld === "kommt-aus-neuerer-version"));
    cur.push(A("Y", "Diese-Version-Eintrag")); // wie die echte App: gesamten Bestand behalten + einen ergänzen
    await setzeEntries(u, cur);
    await pollMain(u);
    await u.waitForTimeout(200);
    const file = JSON.parse(drive["kalender-daten.json"]);
    const x = file.entries.find((e) => e.id === "X");
    const y = file.entries.find((e) => e.id === "Y");
    ok("S4: Alt-Eintrag NICHT verloren beim Speichern der neuen Version", !!x);
    ok("S4: unbekanntes Feld (andere Version) überlebt das Speichern", !!x && x._neuesFeld === "kommt-aus-neuerer-version");
    ok("S4: neuer Eintrag ebenfalls gespeichert (beide Versionen koexistieren)", !!y);
    await u.close();
  }

  /* ---- S5: Neu laden - Daten bleiben erhalten UND werden angezeigt ---- */
  {
    const u = await makeUser(browser, "2026-07-13T11:00:00", true); // Solo (volle App, ohne Datei)
    await setzeEntries(u, [A("R1", "Reload-Test-Arbeit")]);
    await u.reload();
    await u.waitForTimeout(1200);
    const l = await u.evaluate(() => localStorage.getItem("werkstatt-kalender-entries"));
    ok("S5: Daten nach Neuladen noch lokal vorhanden", !!l && l.includes("Reload-Test-Arbeit"));
    // in der Oberfläche (Backlog) sichtbar?
    const bl = u.getByRole("button", { name: "Backlog", exact: true });
    if (await bl.count()) { await bl.first().click(); await u.waitForTimeout(400); }
    const sichtbar = (await u.locator("body").innerText()).includes("Reload-Test-Arbeit");
    ok("S5: Eintrag nach Neuladen auch in der Oberfläche sichtbar", sichtbar);
    await u.close();
  }

  /* ---- S6: Störungen-Datei - Lesen bewahrt unbekannte Felder ---- */
  {
    drive["werkstatt-stoerungen.json"] = JSON.stringify({
      format: "werkstatt-stoerungen-v1", savedAt: "2026-01-01T00:00:00.000Z", deleted: {}, config: null,
      entries: [{ id: "ST1", date: "2026-07-15", schicht: "Früh", anlage: "BTS", stoerung: "Testmeldung", offen: true, updatedAt: "2026-07-15T00:00:00.000Z", _neuesFeld: "zukunft-v99" }],
    });
    const u = await makeUser(browser, "2026-07-15T08:00:00");
    const data = await adoptStoer(u);
    const st = data && data.entries && data.entries.find((e) => e.id === "ST1");
    ok("S6: Störungen-Datei wird gelesen (Eintrag vorhanden)", !!st && st.stoerung === "Testmeldung");
    ok("S6: unbekanntes Feld in Störung überlebt das Lesen", !!st && st._neuesFeld === "zukunft-v99");
    await u.close();
  }

  console.log(`\n==== VERÖFFENTLICHUNGS-TEST: ${pass} PASS / ${fail} FAIL ====`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
