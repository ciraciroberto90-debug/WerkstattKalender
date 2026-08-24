// Härtetest: SCHWEBE-FENSTER + PLANUNG PER ZIEHEN (Robertos Wünsche 24.08.).
//
//  (K) KALENDER-FENSTER: Das 📅 am Tageslisten-Kopf der Übersicht öffnet den
//      TPM/R+I-Monatskalender als kleines Fenster - mit Terminen (✓ für
//      Erledigtes), Monats-Blättern und Klick-auf-Termin -> Termin-Dialog.
//  (V) VERSCHIEBBAR + GRÖSSE: Das Fenster lässt sich an der Titelzeile
//      ziehen und an der Ecke vergrößern; Lage und Größe überleben ein
//      Neuladen (localStorage je Fenster).
//  (P) BACKLOG-FENSTER: In der Planung öffnet „📋 Backlog" die offenen
//      Arbeiten als Fenster; eine Zeile auf eine Person-Tag-Zelle ziehen
//      weist zu (setzt wer + geplant in einem Zug).
//  (U) UMPLANEN: Ein Arbeit-Chip im Plan lässt sich auf eine andere
//      Person und einen anderen Tag ziehen.
//  (R) AUSPLANEN: Ein Chip zurück ins Backlog-Fenster gezogen nimmt die
//      Zuweisung wieder weg.
//  (L) LESER: Ohne Schreibrecht gibt es keinen Backlog-Knopf und keine
//      ziehbaren Chips - der Kalender (nur ansehen) bleibt erlaubt.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }],
  riItems: [],
  team: [{ name: "M. Weber", rolle: "mech" }, { name: "K. Yilmaz", rolle: "elek" }],
};
const eintraege = [
  { id: "t1", date: "2026-08-24", category: "TPM", name: "TS480", status: "open" },
  { id: "t2", date: "2026-08-21", category: "TPM", name: "TS480", status: "done" },
  { id: "b1", date: "2026-08-20", category: "ARBEIT", name: "TS480", status: "open", note: "Lagerschaden an der Umlenkrolle", prio: "hoch", art: "mech", zeit: "2026-08-20T09:41:00.000Z" },
];

async function start(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-24T10:00:00")); // Montag
  await p.addInitScript(({ e, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
  }, { e: eintraege, c: config });
  await p.goto(APP);
  await p.waitForTimeout(1000);
  return { p, ctx, fehler };
}

// HTML5-Ziehen nachstellen (Playwright-Mausziehen füllt kein dataTransfer):
// dragstart an der Quelle, dragover + drop am Ziel, ein geteiltes DataTransfer.
const ziehe = (p, quelleSel, zielSel) => p.evaluate(({ q, z }) => {
  const quelle = document.querySelector(q);
  const ziel = document.querySelector(z);
  if (!quelle || !ziel) return `fehlt: ${!quelle ? q : z}`;
  const dt = new DataTransfer();
  quelle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
  ziel.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
  ziel.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  return "ok";
}, { q: quelleSel, z: zielSel });

const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (K) + (V): Kalender-Fenster ---- */
  {
    const { p, ctx, fehler } = await start(browser);
    await p.locator('button[aria-label="Wartungskalender als Fenster öffnen"]').click();
    await p.waitForTimeout(600);
    const fenster = p.locator('div[role="dialog"][aria-label^="Wartungskalender"]');
    pruef("(K) 📅 öffnet das Kalender-Fenster mit dem laufenden Monat",
          (await fenster.count()) === 1 && /August 2026/i.test(await fenster.innerText()));
    const text = (await fenster.innerText()).replace(/\s+/g, " ");
    pruef("(K) Der heutige Termin steht im Raster", /TS480/.test(text), text.slice(0, 120));
    pruef("(K) Erledigtes trägt den Haken", /✓ TS480/.test(text));
    // Blättern
    await p.locator('button[aria-label="Nächster Monat (Fenster)"]').click();
    await p.waitForTimeout(400);
    pruef("(K) › blättert in den nächsten Monat", /September 2026/i.test(await fenster.innerText()));
    await p.getByRole("button", { name: "Heute", exact: true }).last().click();
    await p.waitForTimeout(400);
    pruef("(K) Heute führt zurück", /August 2026/i.test(await fenster.innerText()));
    // Klick auf Termin öffnet den Termin-Dialog
    await fenster.locator('button[title^="TS480"]').first().click();
    await p.waitForTimeout(500);
    pruef("(K) Klick auf den Termin öffnet den Termin-Dialog",
          (await p.getByRole("button", { name: "Löschen", exact: true }).count()) >= 1);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);

    // (V) Verschieben an der Titelzeile
    const vorher = await fenster.boundingBox();
    const titel = fenster.locator("div").first();
    await p.mouse.move(vorher.x + 120, vorher.y + 14);
    await p.mouse.down();
    await p.mouse.move(vorher.x + 120 - 300, vorher.y + 14 + 120, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    const nachher = await fenster.boundingBox();
    pruef("(V) Das Fenster lässt sich an der Titelzeile verschieben",
          Math.round(nachher.x - vorher.x) === -300 && Math.round(nachher.y - vorher.y) === 120,
          `dx=${Math.round(nachher.x - vorher.x)} dy=${Math.round(nachher.y - vorher.y)}`);
    // Größe an der Ecke
    await p.mouse.move(nachher.x + nachher.width - 6, nachher.y + nachher.height - 6);
    await p.mouse.down();
    await p.mouse.move(nachher.x + nachher.width - 6 + 140, nachher.y + nachher.height - 6 + 90, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    const gross = await fenster.boundingBox();
    pruef("(V) Die Ecke unten rechts ändert die Größe",
          Math.round(gross.width - nachher.width) === 140 && Math.round(gross.height - nachher.height) === 90,
          `dw=${Math.round(gross.width - nachher.width)} dh=${Math.round(gross.height - nachher.height)}`);
    // Lage überlebt das Neuladen
    await p.reload();
    await p.waitForTimeout(1000);
    await p.locator('button[aria-label="Wartungskalender als Fenster öffnen"]').click();
    await p.waitForTimeout(500);
    const nachReload = await p.locator('div[role="dialog"][aria-label^="Wartungskalender"]').boundingBox();
    pruef("(V) Lage und Größe überleben das Neuladen",
          Math.abs(nachReload.x - gross.x) < 2 && Math.abs(nachReload.y - gross.y) < 2 &&
          Math.abs(nachReload.width - gross.width) < 2 && Math.abs(nachReload.height - gross.height) < 2,
          JSON.stringify({ x: nachReload.x, y: nachReload.y, w: nachReload.width }));
    await p.locator('button[aria-label^="Wartungskalender"][aria-label$="schließen"]').click();
    await p.waitForTimeout(300);
    pruef("(V) ✕ schließt das Fenster",
          (await p.locator('div[role="dialog"][aria-label^="Wartungskalender"]').count()) === 0);
    pruef("(K/V) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (P) + (U) + (R): Backlog-Fenster und Ziehen in der Planung ---- */
  {
    const { p, ctx, fehler } = await start(browser);
    await p.getByRole("button", { name: "Planung", exact: true }).first().click();
    await p.waitForTimeout(800);
    await p.getByRole("button", { name: /📋 Backlog/ }).click();
    await p.waitForTimeout(500);
    const popout = p.locator('div[role="dialog"][aria-label="Backlog – ziehen zum Zuweisen"]');
    pruef("(P) Der Backlog-Knopf öffnet das Fenster mit der offenen Arbeit",
          (await popout.count()) === 1 && /Lagerschaden an der Umlenkrolle/.test(await popout.innerText()));

    // Zeile -> Person-Tag-Zelle ziehen = zuweisen
    const r1 = await ziehe(p,
      'div[role="dialog"][aria-label="Backlog – ziehen zum Zuweisen"] div[draggable="true"]',
      'td[data-planzelle="M. Weber|2026-08-24"]');
    await p.waitForTimeout(600);
    const nachZuweisen = (await gespeichert(p)).find((e) => e.id === "b1");
    pruef("(P) Ziehen auf die Zelle setzt Person UND Tag",
          r1 === "ok" && nachZuweisen.wer === "M. Weber" && nachZuweisen.geplant === "2026-08-24",
          JSON.stringify({ r1, wer: nachZuweisen.wer, geplant: nachZuweisen.geplant }));
    pruef("(P) Der Chip steht jetzt in der Zeile der Person",
          /TS480: Lagerschaden/.test(await p.locator('td[data-planzelle="M. Weber|2026-08-24"]').innerText()));
    pruef("(P) Das Fenster zeigt die Einplanung an",
          /eingeplant: M\. Weber · 24\.08\.2026/.test(await popout.innerText()));

    // (U) Chip auf andere Person + anderen Tag ziehen
    const r2 = await ziehe(p,
      'td[data-planzelle="M. Weber|2026-08-24"] button[draggable="true"]',
      'td[data-planzelle="K. Yilmaz|2026-08-25"]');
    await p.waitForTimeout(600);
    const nachUmplanen = (await gespeichert(p)).find((e) => e.id === "b1");
    pruef("(U) Umplanen per Ziehen: andere Person, anderer Tag",
          r2 === "ok" && nachUmplanen.wer === "K. Yilmaz" && nachUmplanen.geplant === "2026-08-25",
          JSON.stringify({ r2, wer: nachUmplanen.wer, geplant: nachUmplanen.geplant }));
    pruef("(U) Alte Zelle leer, neue Zelle trägt den Chip",
          !/TS480:/.test(await p.locator('td[data-planzelle="M. Weber|2026-08-24"]').innerText()) &&
          /TS480: Lagerschaden/.test(await p.locator('td[data-planzelle="K. Yilmaz|2026-08-25"]').innerText()));

    // (R) Chip zurück ins Fenster = ausplanen
    const r3 = await ziehe(p,
      'td[data-planzelle="K. Yilmaz|2026-08-25"] button[draggable="true"]',
      'div[role="dialog"][aria-label="Backlog – ziehen zum Zuweisen"] .p-2');
    await p.waitForTimeout(600);
    const nachAusplanen = (await gespeichert(p)).find((e) => e.id === "b1");
    pruef("(R) Zurück ins Fenster gezogen: Zuweisung ist weg",
          r3 === "ok" && !nachAusplanen.wer && !nachAusplanen.geplant,
          JSON.stringify({ r3, wer: nachAusplanen.wer || null, geplant: nachAusplanen.geplant || null }));
    pruef("(P-R) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (L) Leser: kein Backlog-Knopf, keine ziehbaren Chips ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date("2026-08-24T10:00:00"));
    const daten = { format: "werkstatt-kalender-v1", savedAt: "2026-08-01T00:00:00.000Z",
      entries: eintraege.map((e) => ({ ...e, wer: e.id === "b1" ? "M. Weber" : undefined, geplant: e.id === "b1" ? "2026-08-24" : undefined, updatedAt: "2026-08-01T00:00:00.000Z" })),
      deleted: {}, config };
    await p.exposeFunction("__r", () => JSON.stringify(daten));
    await p.addInitScript(() => {
      const h = {
        name: "kalender-daten.json", kind: "file",
        async getFile() { return new File([await window.__r()], "kalender-daten.json", { type: "application/json" }); },
        async createWritable() { throw new Error("NotAllowedError"); },
        async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [h];
    });
    await p.goto(APP);
    await p.waitForTimeout(1200);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click().catch(() => {});
    const vo = p.getByText("Vorhandene Datei öffnen …");
    if (await vo.count()) await vo.click();
    await p.waitForTimeout(1300);
    await p.getByRole("button", { name: "Planung", exact: true }).first().click();
    await p.waitForTimeout(800);
    pruef("(L) Leser sehen keinen Backlog-Fenster-Knopf",
          (await p.getByRole("button", { name: /📋 Backlog/ }).count()) === 0);
    pruef("(L) Der eingeplante Chip ist für Leser nicht ziehbar",
          (await p.locator('td[data-planzelle="M. Weber|2026-08-24"] button[draggable="true"]').count()) === 0 &&
          /TS480:/.test(await p.locator('td[data-planzelle="M. Weber|2026-08-24"]').innerText()));
    await ctx.close();
  }

  console.log(`\nHärte 52 (Schwebe-Fenster + Planung): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
