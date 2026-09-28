// Härtetest: DER START DARF NIE HÄNGEN (Robertos Befund vom 28.09.: "an
// einem der Rechner hängt sich die App beim Verbinden auf, das ist öfter
// vorgefallen - es muss nun funktionieren")
//
//  (H1) Die Merkliste des Browsers (IndexedDB) antwortet nie - der Fall, wenn
//       ein zweites Fenster der App die Datenbank festhält. Bisher wartete
//       der Start stumm für immer. Jetzt: nach der Frist läuft die App weiter,
//       nennt die Merkliste als Ursache und bietet das Verbinden an.
//  (H2) Ein gemerkter Verweis, dessen Datei nie antwortet (Laufwerk hängt):
//       der Start endet innerhalb der Lese-Frist mit "verweis-tot", die
//       Zeitmessung im ⚙ zeigt es.
//  (H3) Start-Protokoll: Blieb der vorige Start hängen (Vermerk ohne
//       "fertig"), zeigt das ⚙ beim nächsten Start rot, WO er hing.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor bleibt H1 ohne Meldung stehen (die
// Merkliste hatte keine Frist) und H3 kennt keinen Vermerk.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const config = { tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] };

// Merklisten-Attrappe: "haengt" = open() antwortet nie; "handle" = liefert einen
// gemerkten Verweis, dessen Datei nie antwortet.
const merklisteAttrappe = (modus) => `(() => {
  const spaeter = (f) => setTimeout(f, 5);
  const werte = new Map("${modus}" !== "handle" ? [] : [["handle", { name: "kalender-daten.json", kind: "file",
    queryPermission: async () => "granted", requestPermission: async () => "granted",
    getFile: () => new Promise(() => {}), createWritable: () => new Promise(() => {}) }], ["mode", "readwrite"]]);
  // Protokoll-Vermerk des vorigen Starts (H3) bleibt in localStorage - die Attrappe fasst ihn nicht an.
  const bauStore = () => ({
    put(w, k) { werte.set(k, w); return {}; },
    get(k) { const r = {}; spaeter(() => { r.result = werte.get(k); r.onsuccess && r.onsuccess(); }); return r; },
    delete(k) { werte.delete(k); return {}; },
    getAll() { const r = {}; spaeter(() => { r.result = []; r.onsuccess && r.onsuccess(); }); return r; },
    add() { return {}; },
  });
  const bauDb = () => ({ objectStoreNames: { contains: () => true }, transaction() { const tx = { objectStore: () => bauStore() }; spaeter(() => tx.oncomplete && tx.oncomplete()); return tx; }, close() {}, createObjectStore() {} });
  Object.defineProperty(window, "indexedDB", { configurable: true, value: {
    open() { const r = {}; if ("${modus}" !== "haengt") spaeter(() => { r.result = bauDb(); r.onsuccess && r.onsuccess(); }); return r; },
    databases: async () => [], deleteDatabase() { return {}; },
  } });
  // Die Dateiwahl muss es "geben", sonst gilt der Browser als ungeeignet und der Start prüft gar nichts.
  // Im Modus "leer" (H3) dagegen Solo-Betrieb ohne Dateiwahl - dort braucht der Verwalter sein Zahnrad.
  if ("${modus}" === "leer") { delete window.showOpenFilePicker; delete window.showSaveFilePicker; }
  else window.showOpenFilePicker = async () => { throw Object.assign(new Error("Abgebrochen"), { name: "AbortError" }); };
})()`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (modus, protokoll) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.addInitScript(merklisteAttrappe(modus));
    await p.addInitScript(({ c, protokoll }) => {
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", "[]");
      localStorage.setItem("werkstatt-stoerungen-entries", "[]");
      localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
      if (protokoll) localStorage.setItem("werkstatt-kalender-fs:start-protokoll", JSON.stringify(protokoll));
    }, { c: config, protokoll: protokoll || null });
    const t0 = Date.now();
    await p.goto(APP);
    return { p, fehler, t0, zu: () => ctx.close() };
  };
  const zahnradPflege = async (p) => {
    await p.locator('button[aria-label="Verwalten"]').click(); await p.waitForTimeout(300);
    await p.getByRole("button", { name: /Verlauf/ }).first().click(); await p.waitForTimeout(400);
    return (await p.locator("[data-startzeiten]").innerText()).replace(/\s+/g, " ");
  };

  /* (H1) Merkliste antwortet nie */
  {
    const { p, fehler, t0, zu } = await seite("haengt");
    await p.getByText(/Merkliste des Browsers/).first().waitFor({ timeout: 12000 }).catch(() => {});
    const dauer = Date.now() - t0;
    const text = await p.locator("body").innerText();
    ok("(H1) Merkliste antwortet nie: die App läuft nach der Frist weiter und nennt die Merkliste als Ursache (< 12 s)",
      /Merkliste des Browsers/.test(text) && /zweiten Fenster/.test(text) && dauer < 12000, `nach ${dauer} ms`);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click(); await p.waitForTimeout(400);
    ok("(H1) Das Ordner-Symbol bietet das Verbinden an (kein Hänger)", /Vorhandene Datei öffnen/.test(await p.locator("body").innerText()));
    ok("(E) Keine Skriptfehler (H1)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  /* (H2) gemerkter Verweis, Datei antwortet nie */
  {
    const { p, fehler, t0, zu } = await seite("handle");
    // Lese-Frist 15 s: spätestens dann ist der Start zu Ende - mit Befund.
    // Ohne schreibbare Datei gibt es kein Zahnrad (Nur-Lesen) - der Befund
    // steht als rote Leiste: "gibt die gemerkte Datei … nicht mehr frei".
    await p.getByText(/nicht mehr frei/).first().waitFor({ timeout: 25000 }).catch(() => {});
    const dauer = Date.now() - t0;
    const text = await p.locator("body").innerText();
    ok("(H2) Datei antwortet nie: der Start endet innerhalb der Lese-Frist mit „verweis-tot“ (< 25 s) und der roten Leiste „Datei auswählen“",
      dauer < 25000 && /nicht mehr frei/.test(text) && /Datei auswählen/.test(text), `nach ${dauer} ms`);
    const protokoll = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem("werkstatt-kalender-fs:start-protokoll")); } catch (e) { return null; } });
    ok("(H2) Das Start-Protokoll ist trotzdem „fertig“ (der Start kam ans Ziel, mit Befund)", !!protokoll && protokoll.fertig === true, JSON.stringify(protokoll));
    ok("(E) Keine Skriptfehler (H2)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  /* (H3) Start-Protokoll des vorigen, hängen gebliebenen Starts */
  {
    const vorher = { begonnen: "2026-09-28T05:05:00.000Z", phase: "lesen", seit: 14000, fertig: false };
    const { p, fehler, zu } = await seite("leer", vorher);
    await p.waitForTimeout(1500);
    const zt = await zahnradPflege(p);
    const h = p.locator("[data-start-haenger]");
    ok("(H3) ⚙ zeigt rot: der Start davor blieb bei „Datei lesen“ hängen, nach 14,0 s",
      (await h.count()) === 1 && /Datei lesen/.test(await h.innerText()) && /14,0 s/.test(await h.innerText()), zt.slice(0, 200));
    ok("(H3) Dieser Start selbst ist fertig (Vermerk auf „fertig“)",
      await p.evaluate(() => { try { return JSON.parse(localStorage.getItem("werkstatt-kalender-fs:start-protokoll")).fertig === true; } catch (e) { return false; } }));
    ok("(E) Keine Skriptfehler (H3)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
