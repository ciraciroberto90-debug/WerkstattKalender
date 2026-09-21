// Härtetest: LINKS AM BENUTZERKONTO + STÖRBERICHTE-DATEI IN DER DATEIVERWALTUNG
// (Robertos Ansagen vom 21.09.)
//
//  Teil A - Link-Sammlung ans Konto gebunden:
//  (A1) Benutzer mit Kürzel (Chef -> RC) sieht im Linkstreifen NUR RC - kein
//       Umschalter, keine AR-Links.
//  (A2) Benutzer ohne Kürzel (Bea) hat den Umschalter wie bisher.
//  (A3) Ein Kürzel, das noch keine Sammlung hat (Max -> MK): der Streifen zeigt
//       MK, der erste Link landet unter MK in der gemeinsamen Ablage.
//  (A4) Im Zahnrad „Benutzer & Rechte“ steht das Feld je Benutzer; die
//       Änderung (Bea -> AR) wird gespeichert und wirkt sofort.
//
//  Teil B - Störberichte-Datei im Datei-Dialog:
//  (B1) Der Abschnitt steht im Dialog „Gemeinsame Datei“ mit „neu anlegen“,
//       „öffnen“ - anlegen verbindet, die Datei trägt das Störungs-Format.
//  (B2) „trennen“ löst die Verbindung wieder.
//  (B3) Auch der LESER hat den Abschnitt (die Datei ist für alle).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};

const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }],
  benutzer: [
    { name: "Chef", rolle: "verwalter", kennwortHash: "", links: "RC" },
    { name: "Bea", rolle: "bearbeiter", kennwortHash: "", links: "" },
    { name: "Max", rolle: "bearbeiter", kennwortHash: "", links: "MK" },
    { name: "Lea", rolle: "leser", kennwortHash: "", links: "" },
  ],
  links: { inhaber: ["RC", "AR"], eintraege: [
    { id: "l1", name: "Plan RC", ziel: "\\\\srv\\rc", symbol: "🔗", inhaber: "RC" },
    { id: "l2", name: "Plan AR", ziel: "\\\\srv\\ar", symbol: "🔗", inhaber: "AR" },
  ] },
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const drive = { "werkstatt-stoerungen.json": "" };
  const seite = async (benutzer, mitStoerStub) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.exposeFunction("__fsRead", (n) => drive[n] ?? "");
    await p.exposeFunction("__fsWrite", (n, c) => { drive[n] = c; });
    await p.addInitScript(({ c, benutzer, stub }) => {
      try {
        localStorage.setItem("bta-standort", "scheurich");
        localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
        localStorage.setItem("werkstatt-kalender-benutzer", benutzer);
      } catch (e) {}
      if (stub) {
        // Nur die Störberichte-Datei wird hier je gewählt - die Hauptdaten bleiben lokal.
        const mk = (name) => ({
          name, kind: "file",
          async getFile() { return new File([await window.__fsRead(name)], name, { type: "application/json" }); },
          async createWritable() { let b = ""; return { async write(t) { b += t; }, async close() { await window.__fsWrite(name, b); } }; },
          async queryPermission() { return "granted"; },
          async requestPermission() { return "granted"; },
        });
        window.showOpenFilePicker = async () => [mk("werkstatt-stoerungen.json")];
        window.showSaveFilePicker = async () => mk("werkstatt-stoerungen.json");
      } else {
        delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      }
    }, { c: config, benutzer, stub: !!mitStoerStub });
    await p.goto(APP);
    await p.waitForTimeout(1200);
    return { ctx, p, fehler };
  };
  // Gebundene Chips tragen ein aria-label, freie Chips heißen schlicht "RC"/"AR" (harte-36).
  const chip = (p, k) => p.locator(`button[aria-label^="Links von ${k}"], button[title="Links von ${k} anzeigen"]`);
  const konfig = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}"));

  /* ---- (A1) Chef -> RC ---- */
  const c = await seite("Chef");
  let text = await c.p.locator("body").innerText();
  ok("(A1) Chef (RC gebunden): nur der RC-Chip, kein AR-Umschalter", (await chip(c.p, "RC").count()) === 1 && (await chip(c.p, "AR").count()) === 0);
  ok("(A1) Der Chip sagt, dass er ans Konto gebunden ist", /an dein Konto gebunden/.test(await chip(c.p, "RC").getAttribute("aria-label")));
  ok("(A1) Nur RC-Links im Streifen: „Plan RC“ ja, „Plan AR“ nein", /Plan RC/.test(text) && !/Plan AR/.test(text));

  /* ---- (A4) Zahnrad: Feld je Benutzer, Bea -> AR ---- */
  await c.p.locator('button[aria-label="Verwalten"]').click();
  await c.p.waitForTimeout(400);
  await c.p.getByRole("button", { name: "Benutzer & Rechte", exact: true }).click();
  await c.p.waitForTimeout(300);
  ok("(A4) Im Zahnrad steht je Benutzer das Feld „Link-Sammlung“ - Chef: RC, Bea: leer",
    (await c.p.locator('input[aria-label="Link-Sammlung 1"]').inputValue()) === "RC" && (await c.p.locator('input[aria-label="Link-Sammlung 2"]').inputValue()) === "");
  await c.p.locator('input[aria-label="Link-Sammlung 2"]').fill("ar");
  await c.p.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await c.p.waitForTimeout(800);
  const k1 = await konfig(c.p);
  ok("(A4) Gespeichert: Bea trägt jetzt AR (großgeschrieben), Chef weiter RC",
    k1.benutzer && k1.benutzer[1].links === "AR" && k1.benutzer[0].links === "RC", JSON.stringify((k1.benutzer || []).map((b) => b.links)));
  ok("(A4) Keine Skriptfehler", c.fehler.length === 0, c.fehler.slice(0, 2).join(" | "));
  await c.ctx.close();

  /* ---- (A2) Bea ohne Kürzel (Ausgangs-Konfiguration, eigener Rechner) ---- */
  const b = await seite("Bea");
  ok("(A2) Bea (ohne Kürzel): Umschalter RC und AR wie bisher", (await chip(b.p, "RC").count()) === 1 && (await chip(b.p, "AR").count()) === 1);
  await chip(b.p, "AR").click();
  await b.p.waitForTimeout(300);
  ok("(A2) Umschalten auf AR zeigt „Plan AR“", /Plan AR/.test(await b.p.locator("body").innerText()));
  await b.ctx.close();

  /* ---- (A3) Max -> MK (noch ohne Sammlung) ---- */
  const m = await seite("Max");
  text = await m.p.locator("body").innerText();
  ok("(A3) Max (MK gebunden, noch keine Links): der Streifen zeigt MK und „Noch keine Links für MK“",
    (await chip(m.p, "MK").count()) === 1 && (await chip(m.p, "RC").count()) === 0 && /Noch keine Links für MK/.test(text));
  await m.p.getByRole("button", { name: "Links & Dokumente" }).click();
  await m.p.waitForTimeout(300);
  await m.p.getByRole("button", { name: "＋ Link" }).click();
  await m.p.waitForTimeout(200);
  await m.p.getByPlaceholder(/Bezeichnung/).fill("Meine Anleitung");
  await m.p.getByPlaceholder(/Adresse oder Pfad/).fill("\\\\srv\\mk\\anleitung.pdf");
  await m.p.getByRole("button", { name: "Speichern" }).click();
  await m.p.waitForTimeout(600);
  const k2 = await konfig(m.p);
  const neu = ((k2.links || {}).eintraege || []).find((l) => l.name === "Meine Anleitung");
  ok("(A3) Der erste Link von Max landet unter MK - die RC/AR-Links bleiben unberührt",
    !!neu && neu.inhaber === "MK" && (k2.links.eintraege || []).length === 3, JSON.stringify(neu));
  ok("(A3) Der Streifen zeigt den neuen Link", /Meine Anleitung/.test(await m.p.locator("body").innerText()));
  await m.ctx.close();

  /* ---- (B1) Störberichte-Datei im Datei-Dialog ---- */
  const s = await seite("Chef", true);
  await s.p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await s.p.waitForTimeout(400);
  const region = s.p.locator('[role="region"][aria-label="Störberichte-Datei"]');
  ok("(B1) Der Dialog „Gemeinsame Datei“ hat den Abschnitt „Störberichte-Datei“ - noch nicht verbunden",
    (await region.count()) === 1 && /Keine Störberichte-Datei verbunden/.test(await region.innerText()));
  ok("(B1) Knöpfe: neu anlegen, vorhandene öffnen",
    (await region.getByRole("button", { name: /Neue Störberichte-Datei anlegen/ }).count()) === 1
    && (await region.getByRole("button", { name: /Vorhandene Störberichte-Datei öffnen/ }).count()) === 1);
  await region.getByRole("button", { name: /Neue Störberichte-Datei anlegen/ }).click();
  await s.p.waitForTimeout(1200);
  const rt = await region.innerText();
  ok("(B1) Anlegen verbindet: „Verbunden mit werkstatt-stoerungen.json (bearbeiten)“", /Verbunden mit werkstatt-stoerungen\.json/.test(rt) && /bearbeiten/.test(rt), rt.slice(0, 200));
  let datei = null;
  try { datei = JSON.parse(drive["werkstatt-stoerungen.json"]); } catch (e) {}
  ok("(B1) Die neue Datei trägt das Störungs-Format", !!datei && datei.format === "werkstatt-stoerungen-v1", drive["werkstatt-stoerungen.json"].slice(0, 80));
  ok("(B1) Die Hauptdaten wurden dabei NICHT verbunden (bleiben lokal)", /nur lokal auf diesem Rechner/.test(await s.p.locator("body").innerText()));

  /* ---- (B2) trennen ---- */
  await region.getByRole("button", { name: /Störberichte-Datei trennen/ }).click();
  await s.p.waitForTimeout(600);
  ok("(B2) Trennen: der Abschnitt meldet wieder „Keine Störberichte-Datei verbunden“", /Keine Störberichte-Datei verbunden/.test(await region.innerText()));
  ok("(B) Keine Skriptfehler", s.fehler.length === 0, s.fehler.slice(0, 2).join(" | "));
  await s.ctx.close();

  /* ---- (B3) Leser ---- */
  const l = await seite("Lea", true);
  await l.p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await l.p.waitForTimeout(400);
  ok("(B3) Auch der Leser hat den Abschnitt mit „Vorhandene Störberichte-Datei öffnen“",
    (await l.p.locator('[role="region"][aria-label="Störberichte-Datei"]').getByRole("button", { name: /Vorhandene Störberichte-Datei öffnen/ }).count()) === 1);
  await l.ctx.close();

  await browser.close();
  console.log(`\n${pass} bestanden, ${fail} durchgefallen`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
