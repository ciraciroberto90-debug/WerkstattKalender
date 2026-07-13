// Härtetest: ISO-Wochen am Jahreswechsel. Mo. 29.12.2025 gehört nach ISO 8601
// bereits zu KW01/2026 (Donnerstag dieser Woche, 01.01.2026, liegt in 2026).
// Eine "ganze Woche"-Schicht dort MUSS unter dem Schlüssel 2026-W01 abgelegt
// werden - sonst würde sie beim Blättern in die neue Jahres-KW verschwinden.
const { chromium } = require('playwright-core');
const path = require('path');
const APP = 'file://' + path.resolve('/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.clock.setFixedTime(new Date('2025-12-29T09:00:00')); // Montag, KW01/2026
  // Solo-Betrieb ohne File System Access API (wie Firefox/Safari) - dort gilt
  // die App als volle Solo-Instanz, nicht als "noch nicht verbundener Leser".
  await page.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; });
  await page.goto(APP);
  await page.evaluate(() => {
    localStorage.setItem('werkstatt-kalender-config', JSON.stringify({
      tpmAnlagen: [], riItems: [], team: [{ name: 'Test Person', rolle: 'mech' }],
    }));
    localStorage.setItem('werkstatt-kalender-entries', JSON.stringify([]));
  });
  await page.reload();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Planung', exact: true }).click();
  await page.waitForTimeout(400);

  // Ganze Woche "Früh" setzen am Montag 29.12.2025 (= KW01/2026)
  await page.locator('button[aria-label="Schicht Test Person 2025-12-29"]').click();
  await page.waitForTimeout(150);
  await page.locator('div[style*="fixed"]').last().getByRole('button', { name: 'Früh', exact: true }).click();
  await page.waitForTimeout(300);

  // Alle 5 Tage dieser Woche (29.-31.12.2025 + 01.-02.01.2026) müssen "F" zeigen
  const tage = ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'];
  let alle = true;
  for (const t of tage) {
    const txt = (await page.locator(`button[aria-label="Schicht Test Person ${t}"]`).innerText()).trim().toLowerCase();
    if (txt !== 'f') { alle = false; console.log(`  -> ${t}: "${txt}" (erwartet "f")`); }
  }
  ok('Jahreswechsel-Woche: alle 5 Werktage (29.12.-02.01.) zeigen Früh', alle);

  // Nächste Woche (05.-09.01.2026, KW02) darf NICHT betroffen sein
  await page.getByRole('button', { name: 'Nächste Woche' }).click();
  await page.waitForTimeout(300);
  const naechste = (await page.locator('button[aria-label="Schicht Test Person 2026-01-05"]').innerText()).trim();
  ok('KW02 (05.01.2026) bleibt unberührt ("?")', naechste === '?');

  // In der Schichtplan-Matrix (Monatsansicht) - die Uhr steht fix auf 29.12.2025,
  // die Matrix öffnet also direkt auf Dezember 2025 (kein Blättern nötig)
  await page.getByRole('button', { name: 'Schichtplan', exact: true }).click();
  await page.waitForTimeout(400);
  const matrixTxt = (await page.locator('button[aria-label="Matrix Test Person 2025-12-29"]').innerText()).trim();
  ok('Matrix Dezember 2025: 29.12. zeigt "Früh" (ausgeschrieben)', matrixTxt === 'Früh');

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
