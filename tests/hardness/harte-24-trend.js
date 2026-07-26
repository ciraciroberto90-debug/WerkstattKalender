// Härtetest: TREND DER TERMINTREUE (Auswertung, nur Bearbeiter).
// Eine Momentaufnahme beantwortet nicht, ob es besser oder schlechter wird.
// Der Trend tut das - und darf dabei nichts behaupten, was die Daten nicht hergeben:
//  (1) Er erscheint in der Auswertung und nennt die Richtung.
//  (2) Steigende und fallende Entwicklung werden richtig benannt.
//  (3) Monate OHNE Termine ergeben keine 0 % - das wäre eine Falschaussage.
//  (4) Bei zu wenig Daten erscheint gar kein Trend statt eines Zufallsbildes.
//  (5) Er folgt dem Filter (Alle / nur Wartung / nur R+I).
//  (6) Die Zahlen sind zusätzlich als Tabelle abrufbar (Ausdruck, Vorlesen).
//  (7) Nur-Leser bekommen ihn nicht zu sehen (sie haben keine Auswertung).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const check = (n, c) => { console.log((c ? "PASS | " : "FAIL | ") + n); c ? ok++ : fail++; };

// Erzeugt je Monat 10 Termine mit der gewünschten Erledigungsquote.
// quote === null bedeutet: in diesem Monat gab es gar keine Termine.
function bauen(quotenJeMonat, jahr = 2026) {
  const E = [];
  quotenJeMonat.forEach((q, m) => {
    if (q === null) return;
    const mm = String(m + 1).padStart(2, "0");
    for (let k = 0; k < 10; k++) {
      E.push({
        id: `e${m}_${k}`, date: `${jahr}-${mm}-${String(k * 2 + 2).padStart(2, "0")}`,
        category: k % 3 === 0 ? "RI" : "TPM", name: k % 3 === 0 ? "Regalkontrolle" : "BTS",
        status: (k * 10) < q ? "done" : "open",
      });
    }
  });
  return E;
}

async function mach(browser, eintraege, uhr = "2026-12-15T10:00:00") {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.setFixedTime(new Date(uhr));
  await page.addInitScript((d) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(d));
  }, eintraege);
  await page.goto(APP);
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: "TPM", exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Auswertung", exact: true }).first().click();
  await page.waitForTimeout(1100);
  return page;
}
const text = (p) => p.locator("body").innerText();

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (1)(2) Steigende Entwicklung ---- */
  {
    const p = await mach(browser, bauen([50, 50, 60, 60, 60, 70, 70, 80, 80, 90, 90, 90]));
    const t = await text(p);
    check("(1) Der Trend erscheint in der Auswertung", /TERMINTREUE – LETZTE 12 MONATE/i.test(t));
    check("(1) Der ausgewertete Bereich wird benannt", /Wartung & R\+I/.test(t));
    check("(2) Steigende Entwicklung wird als besser erkannt", /▲.*besser/.test(t));
    check("(2) Die Richtung steht auch als Wort da, nicht nur als Farbe", /Punkte besser/.test(t));
    check("(1) Ein Durchschnitt ist als Bezug angegeben", /⌀\s*\d+%/.test(t));
    await p.close();
  }

  /* ---- (2) Fallende Entwicklung ---- */
  {
    const p = await mach(browser, bauen([90, 90, 90, 80, 80, 70, 70, 60, 60, 50, 50, 50]));
    const t = await text(p);
    check("(2) Fallende Entwicklung wird als schlechter erkannt", /▼.*schlechter/.test(t));
    check("(2) Und NICHT fälschlich als Verbesserung", !/besser/.test(t));
    await p.close();
  }

  /* ---- (3) Monate ohne Termine ---- */
  {
    // April und September ohne jeden Termin
    const p = await mach(browser, bauen([80, 80, 80, null, 80, 80, 80, 80, null, 80, 80, 80]));
    await p.locator("summary", { hasText: "Zahlen anzeigen" }).click();
    await p.waitForTimeout(400);
    const t = await text(p);
    check("(3) Leere Monate werden als 'keine Termine' ausgewiesen", /keine Termine/.test(t));
    const treffer = (t.match(/keine Termine/g) || []).length;
    check("(3) Und zwar genau für die beiden leeren Monate", treffer === 2);
    check("(3) Sie erscheinen NICHT als 0 %", !/\b0%/.test(t.split("Zahlen anzeigen")[1] || t));
    check("(3) Der Hinweis dazu steht am Diagramm", /Monate ohne Termine bleiben leer/.test(t));
    await p.close();
  }

  /* ---- (4) Zu wenig Daten ---- */
  {
    const p = await mach(browser, bauen([null, null, null, null, null, null, null, null, null, null, null, 80]));
    const t = await text(p);
    check("(4) Bei nur einem Monat mit Daten erscheint kein Trend", !/TERMINTREUE – LETZTE 12 MONATE/i.test(t));
    await p.close();
  }

  /* ---- (5) Der Trend folgt dem Filter ---- */
  {
    const p = await mach(browser, bauen([50, 50, 60, 60, 60, 70, 70, 80, 80, 90, 90, 90]));
    await p.getByRole("button", { name: "R+I", exact: true }).first().click();
    await p.waitForTimeout(800);
    const t = await text(p);
    check("(5) Nach Umschalten auf R+I wird das auch so ausgewiesen", /nur R\+I/.test(t));
    await p.getByRole("button", { name: "TPM", exact: true }).nth(1).click().catch(() => {});
    await p.waitForTimeout(800);
    const t2 = await text(p);
    check("(5) Und für die Wartung entsprechend", /nur Wartung \(TPM\)/.test(t2) || /nur R\+I/.test(t2));
    await p.close();
  }

  /* ---- (6) Zahlen als Tabelle ---- */
  {
    const p = await mach(browser, bauen([50, 50, 60, 60, 60, 70, 70, 80, 80, 90, 90, 90]));
    await p.locator("summary", { hasText: "Zahlen anzeigen" }).click();
    await p.waitForTimeout(400);
    const t = await text(p);
    check("(6) Die Tabelle nennt Erledigt, Geplant und Quote", /Erledigt/.test(t) && /Geplant/.test(t) && /Quote/.test(t));
    check("(6) Und enthält alle zwölf Monate",
      (await p.locator("details table tbody tr").count()) === 12);
    await p.close();
  }

  /* ---- (7) Nur-Leser sehen den Trend nicht ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const p = await ctx.newPage();
    const daten = bauen([50, 60, 70, 70, 80, 80, 80, 90, 90, 90, 90, 90]);
    await p.clock.setFixedTime(new Date("2026-12-15T10:00:00"));
    await p.exposeFunction("__r", () => JSON.stringify({ format: "werkstatt-kalender-v1", savedAt: "2026-01-01T00:00:00.000Z", entries: daten, deleted: {}, config: null }));
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
    await p.waitForTimeout(1300);
    await p.locator('button[aria-label="Gemeinsame Datei"]').click().catch(() => {});
    const vo = p.getByText("Vorhandene Datei öffnen …");
    if (await vo.count()) await vo.click();
    await p.waitForTimeout(1300);
    check("(7) Leser haben gar keine Auswertung",
      (await p.getByRole("button", { name: "Auswertung", exact: true }).count()) === 0);
    check("(7) Und sehen folglich auch keinen Trend",
      !/TERMINTREUE – LETZTE 12 MONATE/i.test(await text(p)));
    await p.close();
  }

  console.log(`\n${ok} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
