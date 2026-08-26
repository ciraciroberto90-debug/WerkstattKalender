// Härtetest: VERALTET-WÄCHTER (26.08., nach dem Fund aus dem Betrieb).
//
// Der Fall: Ein Leser-Rechner lief wochenlang mit einer alten
// Programm-Fassung - aktuelle Daten aus der gemeinsamen Datei, aber alte
// Rechenregeln, also ein anderer Wartungsplan. Niemand konnte das sehen,
// denn die Versionsangabe steckt im ⚙, wo ein Leser nie hinkommt.
//
//  (V1) Steht in der Datei eine JÜNGERE Bau-Zeit als die eigene, zeigt die
//       App eine rote Veraltet-Leiste - auch und gerade für NUR-LESER.
//  (V2) Kein Fehlalarm: ohne bauStand-Feld und mit älterem bauStand bleibt
//       die Leiste weg (sonst schrie jede Datei von vor dem Einbau).
//  (V3) Beim Speichern trägt die Fassung ihre Bau-Zeit in die Datei ein -
//       genau den Stempel, der im Build steckt.
//  (V4) Eine ältere Fassung dreht den Vermerk einer neueren NIE zurück:
//       Der jüngste bauStand bleibt beim Speichern erhalten, und der
//       Bearbeiter sieht die Leiste ebenfalls.
//
// Hausregel erfüllt: Gegen den Build ohne den Wächter schlägt (V1) fehl
// (keine Leiste) und (V3) ebenso (kein bauStand in der Datei).
const fsNode = require("fs");
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP_PFAD = "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const APP = "file://" + APP_PFAD;

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

// Die eigene Bau-Zeit so lesen, wie der Programm-Rahmen es tut (main.js):
// erstes ISO-Literal mit Millisekunden im Build.
const EIGENE_BAU_ZEIT = ((fsNode.readFileSync(APP_PFAD, "utf8").match(/"(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)"/) || [])[1]) || "";

const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }],
  riItems: [], team: [],
};

const dateiInhalt = (bauStand) => JSON.stringify({
  format: "werkstatt-kalender-v1", savedAt: "2026-08-20T05:00:00.000Z",
  entries: [{ id: "e1", date: "2026-08-26", category: "TPM", name: "TS480", status: "open" }],
  deleted: {}, config,
  ...(bauStand ? { bauStand } : {}),
});

// Leser-Kontext: Datei nur lesbar, Inhalt fest vorgegeben.
async function leser(browser, inhalt) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-26T10:00:00"));
  await p.addInitScript(({ t, c }) => {
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    const handle = {
      name: "kalender-daten.json", kind: "file",
      async getFile() { return new File([t], "kalender-daten.json", { type: "application/json" }); },
      async createWritable() { const e = new Error("nur Lesen"); e.name = "NotAllowedError"; throw e; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    };
    window.showOpenFilePicker = async () => [handle];
  }, { t: inhalt, c: config });
  await p.goto(APP);
  await p.waitForTimeout(800);
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForTimeout(1200);
  return { p, ctx, fehler };
}

// Bearbeiter-Kontext: gemeinsame "Platte" wie in harte-33, schreibbar.
async function bearbeiter(browser, inhalt) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  const platte = { daten: inhalt };
  await p.clock.setFixedTime(new Date("2026-08-26T10:00:00"));
  await p.exposeFunction("__lies", () => platte.daten);
  await p.exposeFunction("__schreib", (c) => { platte.daten = c; });
  await p.addInitScript((c) => {
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    const handle = {
      name: "kalender-daten.json", kind: "file",
      async getFile() { const t = await window.__lies(); return new File([t], "kalender-daten.json", { type: "application/json" }); },
      async createWritable() { let b = ""; return { async write(x) { b += x; }, async close() { await window.__schreib(b); }, async abort() {} }; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    };
    window.showOpenFilePicker = async () => [handle];
  }, config);
  await p.goto(APP);
  await p.waitForTimeout(800);
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForTimeout(1400);
  return { p, ctx, fehler, platte };
}

// Einen Eintrag über den Anlege-Dialog speichern - der einfachste echte Schreibweg.
async function eintragAnlegen(p) {
  await p.getByRole("button", { name: "TPM", exact: true }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Plan", exact: true }).first().click();
  await p.waitForTimeout(1200);
  await p.locator('button[aria-label="Eintrag hinzufügen"]').first().click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /^tpm$/i }).last().click();
  await p.waitForTimeout(300);
  await p.locator("select").last().selectOption("TS480");
  await p.getByRole("button", { name: "Speichern", exact: true }).click();
  await p.waitForTimeout(1200);
}

(async () => {
  pruef("(V0) Der Build trägt einen Bau-Zeitstempel (Voraussetzung des Wächters)",
        !!EIGENE_BAU_ZEIT, EIGENE_BAU_ZEIT || "kein Stempel gefunden");

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (V1) Leser vor jüngerer Fassung: rote Leiste ---- */
  {
    const { p, ctx, fehler } = await leser(browser, dateiInhalt("2036-01-01T00:00:00.000Z"));
    const text = await p.locator("body").innerText();
    pruef("(V1) Die rote Veraltet-Leiste steht da - beim NUR-LESER",
          /Diese App-Fassung ist VERALTET/.test(text), text.slice(0, 80));
    pruef("(V1) Sie nennt beide Stände (eigener und fremder Bau-Tag)",
          /01\.01\.2036/.test(text) && /26\.08\.2026/.test(text));
    pruef("(V1) Und sagt dem Browser-Nutzer, was zu tun ist (F5 / alte Kopie)",
          /F5/.test(text) && /alte HTML-Kopie/.test(text));
    pruef("(V1) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (V2) Kein Fehlalarm ---- */
  {
    const { p, ctx, fehler } = await leser(browser, dateiInhalt(null));
    pruef("(V2) Datei OHNE bauStand (Bestand von vor dem Einbau): keine Leiste",
          !/Diese App-Fassung ist VERALTET/.test(await p.locator("body").innerText()));
    pruef("(V2) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }
  {
    const { p, ctx } = await leser(browser, dateiInhalt("2020-01-01T00:00:00.000Z"));
    pruef("(V2) Datei mit ÄLTEREM bauStand: keine Leiste (diese Fassung ist ja die jüngere)",
          !/Diese App-Fassung ist VERALTET/.test(await p.locator("body").innerText()));
    await ctx.close();
  }

  /* ---- (V3) Speichern trägt die eigene Bau-Zeit ein ---- */
  {
    const { p, ctx, fehler, platte } = await bearbeiter(browser, dateiInhalt(null));
    await eintragAnlegen(p);
    const danach = JSON.parse(platte.daten);
    pruef("(V3) Nach dem Speichern steht die eigene Bau-Zeit als bauStand in der Datei",
          danach.bauStand === EIGENE_BAU_ZEIT, `bauStand=${danach.bauStand}`);
    pruef("(V3) Der neue Eintrag ist wirklich angekommen (der Schreibweg war echt)",
          danach.entries.some((e) => e.category === "TPM" && e.id !== "e1"));
    pruef("(V3) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (V4) Ältere Fassung dreht den Vermerk nie zurück ---- */
  {
    const { p, ctx, fehler, platte } = await bearbeiter(browser, dateiInhalt("2036-01-01T00:00:00.000Z"));
    pruef("(V4) Auch der BEARBEITER sieht die rote Leiste",
          /Diese App-Fassung ist VERALTET/.test(await p.locator("body").innerText()));
    await eintragAnlegen(p);
    const danach = JSON.parse(platte.daten);
    pruef("(V4) Nach seinem Speichern bleibt der jüngere bauStand stehen (2036, nicht die eigene Zeit)",
          danach.bauStand === "2036-01-01T00:00:00.000Z", `bauStand=${danach.bauStand}`);
    pruef("(V4) Sein Eintrag ist trotzdem normal gespeichert (der Wächter blockiert keine Arbeit)",
          danach.entries.some((e) => e.category === "TPM" && e.id !== "e1"));
    pruef("(V4) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  console.log(`\nHärte 56 (Veraltet-Wächter): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
