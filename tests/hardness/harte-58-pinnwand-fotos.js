// Härtetest: BILDER AN DER PINNWAND (Robertos Wunsch vom 26.08.).
//
// Zettel können jetzt Fotos tragen - gleiche Mechanik wie bei Arbeit und
// Störung: Datei im Unterordner Fotos/, am Zettel nur der Verweis.
//
//  (Z1) Im Verfasser hängt „📷 Foto an den Zettel“ ein Bild an; nach dem
//       Anpinnen liegt die Datei EINGEDAMPFT in Fotos/, der Zettel trägt
//       den Verweis, die JSON bleibt klein, die Vorschau steht am Zettel.
//  (Z2) Klick auf die Vorschau öffnet die Großansicht.
//  (Z3) LESER sehen das Foto eines VERÖFFENTLICHTEN Zettels (nur ansehen).
//  (Z4) „Zur Arbeit machen“: Der Foto-Verweis wandert mit zur Arbeit, die
//       Bilddatei bleibt ERHALTEN (der entfallende Zettel räumt sie nicht weg).
//  (Z5) Zettel löschen räumt die Bilddatei mit weg.
//  (Z6) Abbrechen im Verfasser hinterlässt keine Datei (keine Waisen).
//
// Hausregel erfüllt: Gegen den Build ohne die Änderung schlägt (Z1) fehl -
// dort gibt es den Anhänge-Knopf im Verfasser nicht.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }],
  riItems: [], team: [],
};

async function start(browser, { eintraege = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.clock.setFixedTime(new Date("2026-08-26T10:00:00"));
  await p.addInitScript(({ e, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-name", "M. Weber");
    // Nachgebauter Datenordner im Speicher (Muster aus harte-51).
    const ordnerAus = (knoten) => ({
      kind: "directory", name: "Werkstatt_Kalender",
      async getDirectoryHandle(name, opts) {
        if (!knoten.dirs.has(name)) {
          if (!opts || !opts.create) { const err = new Error("nicht da"); err.name = "NotFoundError"; throw err; }
          knoten.dirs.set(name, { dirs: new Map(), files: new Map() });
        }
        return ordnerAus(knoten.dirs.get(name));
      },
      async getFileHandle(name, opts) {
        if (!knoten.files.has(name)) {
          if (!opts || !opts.create) { const err = new Error("nicht da"); err.name = "NotFoundError"; throw err; }
          knoten.files.set(name, new Blob([]));
        }
        return {
          kind: "file", name,
          async createWritable() {
            const teile = [];
            return { async write(x) { teile.push(x); }, async close() { knoten.files.set(name, new Blob(teile)); } };
          },
          async getFile() { return new File([knoten.files.get(name)], name, { type: "image/jpeg" }); },
        };
      },
      async removeEntry(name) {
        if (knoten.files.has(name)) knoten.files.delete(name);
        else if (knoten.dirs.has(name)) knoten.dirs.delete(name);
        else { const err = new Error("nicht da"); err.name = "NotFoundError"; throw err; }
      },
      async *entries() { for (const [n, b] of knoten.files) yield [n, { kind: "file", name: n, async getFile() { return new File([b], n); } }]; },
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
    });
    const wurzel = { dirs: new Map(), files: new Map() };
    window.__mockWurzel = wurzel;
    window.__mockOrdnerHandle = ordnerAus(wurzel);
    window.__fotoDateien = () => {
      const f = wurzel.dirs.get("Fotos");
      return f ? [...f.files.entries()].map(([n, b]) => ({ name: n, size: b.size })) : [];
    };
  }, { e: eintraege, c: config });
  await p.goto(APP);
  await p.waitForTimeout(1000);
  await p.evaluate(() => window.__wkSharedTest.adoptFolder(window.__mockOrdnerHandle));
  return { p, ctx, fehler };
}

// Ein "Handyfoto" wie in harte-51.
async function handyFoto(p) {
  const dataUrl = await p.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 3000; c.height = 2000;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 3000, 2000);
    grad.addColorStop(0, "#3A4756"); grad.addColorStop(1, "#8A5A2B");
    g.fillStyle = grad; g.fillRect(0, 0, 3000, 2000);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `hsl(${i * 6}, 55%, ${30 + (i % 5) * 10}%)`;
      g.beginPath(); g.arc(50 + i * 49, (i * 137) % 2000, 90, 0, Math.PI * 2); g.fill();
    }
    return c.toDataURL("image/jpeg", 0.95);
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
const verfasserAuf = async (p) => {
  await p.locator('button[title="Neue Notiz anpinnen"]').click();
  await p.waitForTimeout(400);
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (Z1)+(Z2)+(Z4)+(Z5): der volle Weg beim Bearbeiter ---- */
  {
    const { p, ctx, fehler } = await start(browser, {});
    const foto = await handyFoto(p);

    // (Z1) Zettel mit Foto anpinnen
    await verfasserAuf(p);
    pruef("(Z1) Der Verfasser bietet „📷 Foto an den Zettel“ an",
          (await p.locator('input[aria-label="Zettel-Foto hinzufügen"]').count()) === 1);
    await p.locator('input[aria-label="Zettel-Foto hinzufügen"]').setInputFiles({ name: "regal.jpg", mimeType: "image/jpeg", buffer: foto });
    await p.waitForTimeout(1200); // eindampfen
    await p.locator('textarea[placeholder^="Was sollen die anderen wissen"]').fill("Regal B ist umgeräumt - siehe Bild");
    await p.getByRole("button", { name: "Anpinnen", exact: true }).click();
    await p.waitForTimeout(900);

    const dateien = await p.evaluate(() => window.__fotoDateien());
    pruef("(Z1) Die Bilddatei liegt eingedampft in Fotos/",
          dateien.length === 1 && dateien[0].size > 10000 && dateien[0].size < foto.length / 2,
          `${Math.round(foto.length / 1024)} kB -> ${dateien[0] ? Math.round(dateien[0].size / 1024) : "?"} kB`);
    const zettel = (await gespeichert(p)).find((e) => e.category === "NOTIZ");
    pruef("(Z1) Der Zettel trägt nur den Verweis, die JSON bleibt klein",
          zettel && Array.isArray(zettel.fotos) && zettel.fotos.length === 1 &&
          zettel.fotos[0].datei === dateien[0].name && JSON.stringify(zettel).length < 1000,
          JSON.stringify(zettel && zettel.fotos));
    const thumb = p.getByRole("button", { name: "Zettel-Foto 1 groß ansehen" });
    pruef("(Z1) Die Vorschau steht direkt auf dem Zettel", (await thumb.count()) === 1);

    // (Z2) Großansicht
    await thumb.click();
    await p.waitForTimeout(400);
    pruef("(Z2) Klick öffnet die Großansicht",
          (await p.getByText("Foto 1 von 1").count()) === 1);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);

    // (Z4) Zur Arbeit machen: Verweis wandert mit, Datei bleibt
    await p.getByRole("button", { name: "➜ Zur Arbeit machen" }).click();
    await p.waitForTimeout(500);
    pruef("(Z4) Der Arbeit-Dialog zeigt das Zettel-Foto schon im Foto-Bereich",
          (await p.getByRole("button", { name: /^Foto 1 groß ansehen$/ }).count()) === 1);
    await p.locator('div[role="dialog"] select').first().selectOption("TS480").catch(() => p.locator("select").first().selectOption("TS480"));
    await p.getByRole("button", { name: "Speichern & Zettel entfernen", exact: true }).click();
    await p.waitForTimeout(900);
    const nachher = await gespeichert(p);
    const arbeit = nachher.find((e) => e.category === "ARBEIT");
    pruef("(Z4) Die Arbeit trägt den Foto-Verweis, der Zettel ist weg",
          arbeit && Array.isArray(arbeit.fotos) && arbeit.fotos.length === 1 &&
          !nachher.some((e) => e.category === "NOTIZ"),
          JSON.stringify(arbeit && arbeit.fotos));
    pruef("(Z4) Die Bilddatei ist ERHALTEN geblieben (kein Aufräumen beim Umwandeln)",
          (await p.evaluate(() => window.__fotoDateien())).length === 1);

    // (Z5) Arbeit wieder löschen räumt die Datei weg (Bestandsverhalten,
    // hier als Gegenstück: die Datei gehört jetzt der Arbeit).
    await p.getByRole("button", { name: "Backlog", exact: true }).first().click();
    await p.waitForTimeout(600);
    await p.getByText("Regal B ist umgeräumt").first().click();
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: "Löschen", exact: true }).click();
    await p.waitForTimeout(900);
    pruef("(Z5) Löschen des Trägers räumt die Bilddatei mit weg",
          (await p.evaluate(() => window.__fotoDateien())).length === 0);
    pruef("(Z1-Z5) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (Z5b) Zettel direkt löschen räumt ebenfalls auf ---- */
  {
    const { p, ctx } = await start(browser, {});
    const foto = await handyFoto(p);
    await verfasserAuf(p);
    await p.locator('input[aria-label="Zettel-Foto hinzufügen"]').setInputFiles({ name: "r.jpg", mimeType: "image/jpeg", buffer: foto });
    await p.waitForTimeout(1200);
    await p.locator('textarea[placeholder^="Was sollen die anderen wissen"]').fill("Kurzer Zettel mit Bild");
    await p.getByRole("button", { name: "Anpinnen", exact: true }).click();
    await p.waitForTimeout(900);
    await p.getByRole("button", { name: "Zettel entfernen" }).click();
    await p.waitForTimeout(900);
    pruef("(Z5) Zettel löschen räumt die Bilddatei mit weg",
          (await p.evaluate(() => window.__fotoDateien())).length === 0 &&
          !(await gespeichert(p)).some((e) => e.category === "NOTIZ"));
    await ctx.close();
  }

  /* ---- (Z6) Abbrechen hinterlässt keine Waisen ---- */
  {
    const { p, ctx } = await start(browser, {});
    const foto = await handyFoto(p);
    await verfasserAuf(p);
    await p.locator('input[aria-label="Zettel-Foto hinzufügen"]').setInputFiles({ name: "w.jpg", mimeType: "image/jpeg", buffer: foto });
    await p.waitForTimeout(1200);
    await p.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await p.waitForTimeout(500);
    pruef("(Z6) Abbrechen: keine Datei im Ordner, kein Zettel im Bestand",
          (await p.evaluate(() => window.__fotoDateien())).length === 0 &&
          !(await gespeichert(p)).some((e) => e.category === "NOTIZ"));
    await ctx.close();
  }

  /* ---- (Z3) Leser sehen das Foto veröffentlichter Zettel ---- */
  {
    // Zettel mit Verweis liegt im Bestand, die Bilddatei im Mock-Ordner;
    // der Leser kommt über eine NUR-LESE-Datei herein (Muster harte-8).
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => fehler.push(e.message));
    await p.clock.setFixedTime(new Date("2026-08-26T10:00:00"));
    await p.addInitScript((c) => {
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      const inhalt = JSON.stringify({
        format: "werkstatt-kalender-v1", savedAt: "2026-08-26T05:00:00.000Z", deleted: {}, config: c,
        entries: [
          { id: "z1", date: "2026-08-26", category: "NOTIZ", name: "Roberto", status: "open", zeit: "2026-08-26T08:00:00.000Z", note: "Bild für alle", farbe: "blau", monitor: false, veroeffentlicht: true, fotos: [{ datei: "zettel-bild.jpg", wer: "Roberto", ts: "2026-08-26T08:00:00.000Z" }] },
          { id: "z2", date: "2026-08-26", category: "NOTIZ", name: "Roberto", status: "open", zeit: "2026-08-26T08:01:00.000Z", note: "INTERNER ZETTEL", farbe: "gelb", monitor: false, fotos: [{ datei: "intern.jpg", wer: "Roberto", ts: "2026-08-26T08:01:00.000Z" }] },
        ],
      });
      const handle = {
        name: "kalender-daten.json", kind: "file",
        async getFile() { return new File([inhalt], "kalender-daten.json", { type: "application/json" }); },
        async createWritable() { const e = new Error("nur Lesen"); e.name = "NotAllowedError"; throw e; },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [handle];
      // Bilddatei im Mock-Ordner bereitstellen (Leser haben die Ordner-
      // Freigabe im Programm über die Vorbelegung - hier nachgestellt).
      const bild = new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4])], { type: "image/jpeg" });
      window.__mockOrdnerHandle = {
        kind: "directory", name: "Werkstatt_Kalender",
        async getDirectoryHandle(name) {
          if (name !== "Fotos") { const e = new Error("nicht da"); e.name = "NotFoundError"; throw e; }
          return {
            kind: "directory", name: "Fotos",
            async getFileHandle(datei) {
              if (datei !== "zettel-bild.jpg") { const e = new Error("nicht da"); e.name = "NotFoundError"; throw e; }
              return { kind: "file", name: datei, async getFile() { return new File([bild], datei, { type: "image/jpeg" }); } };
            },
            async queryPermission() { return "granted"; },
          };
        },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      };
    }, config);
    await p.goto(APP);
    await p.waitForTimeout(800);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1200);
    await p.evaluate(() => window.__wkSharedTest.adoptFolder(window.__mockOrdnerHandle));
    await p.getByRole("button", { name: "Werkstatt", exact: true }).click();
    await p.waitForTimeout(300);
    const uebersicht = p.getByRole("button", { name: "Übersicht", exact: true });
    if (await uebersicht.count()) { await uebersicht.first().click(); await p.waitForTimeout(600); }

    pruef("(Z3) Der Leser sieht die Foto-Vorschau am veröffentlichten Zettel",
          (await p.getByRole("button", { name: "Zettel-Foto 1 groß ansehen" }).count()) === 1);
    pruef("(Z3) Der interne Zettel (samt Bild) bleibt dem Leser verborgen",
          !(await p.locator("body").innerText()).includes("INTERNER ZETTEL"));
    await p.getByRole("button", { name: "Zettel-Foto 1 groß ansehen" }).click();
    await p.waitForTimeout(400);
    pruef("(Z3) Auch die Großansicht öffnet für den Leser (nur ansehen)",
          (await p.getByText("Foto 1 von 1").count()) === 1);
    pruef("(Z3) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  console.log(`\nHärte 58 (Pinnwand-Fotos): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
