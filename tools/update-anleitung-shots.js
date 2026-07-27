// Bilder für die Klick-Anleitung "Neue Version" (tools/update-anleitung.html).
// Echte Aufnahmen aus der gebauten App - keine Nachbauten.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs"), path = require("path");
const APP = "file://" + path.resolve(__dirname, "..", "Werkstatt_Kalender_TPM.html");
const S = path.resolve(__dirname, "..", "scratchpad", "update-shots") + "/";

(async () => {
  fs.mkdirSync(S, { recursive: true });
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  await p.clock.setFixedTime(new Date("2026-07-27T09:12:00"));
  // Die Dateiauswahl gibt es im Prüf-Browser nicht; die App fragt nur ab, ob es
  // sie GIBT - eine leere Funktion genügt, damit der Dialog seine Knöpfe zeigt.
  await p.addInitScript(() => { if (!window.showOpenFilePicker) window.showOpenFilePicker = () => {}; });
  await p.goto(APP);
  await p.waitForTimeout(1800);

  // 1) Kopfzeile mit dem Ordner-Symbol rechts
  const kopf = await p.locator("header, .sticky").first().boundingBox().catch(() => null);
  await p.screenshot({ path: S + "kopf.png", clip: { x: 0, y: 0, width: 1280, height: kopf && kopf.height > 30 ? Math.min(kopf.height, 60) : 44 } });

  // 2) Dialog "Gemeinsame Datei"
  await p.locator('button[aria-label="Gemeinsame Datei"]').first().click();
  await p.waitForTimeout(500);
  // Der weiße Kasten selbst: das einzige Element mit fester Breite 480 px.
  await p.locator('div[style*="width: 480px"]').first().screenshot({ path: S + "dialog.png" });
  await p.keyboard.press("Escape").catch(() => {});
  await p.mouse.click(20, 400);
  await p.waitForTimeout(400);

  // 3) Störungen: Knopf zum Verbinden der zweiten Datei
  await p.getByRole("button", { name: /Störungen/ }).first().click();
  await p.waitForTimeout(800);
  const knopf = p.getByRole("button", { name: /Störungen-Datei öffnen/ }).first();
  if (await knopf.count()) {
    const bb = await knopf.boundingBox();
    await p.screenshot({ path: S + "stoerungen.png", clip: { x: 140, y: Math.max(0, bb.y - 20), width: 1000, height: bb.height + 40 } });
  }

  console.log("Bilder:", fs.readdirSync(S).join(", "));
  await b.close();
})();
