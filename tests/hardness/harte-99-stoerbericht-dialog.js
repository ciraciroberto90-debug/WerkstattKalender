// Härtetest: STÖRBERICHT-DIALOG NACH ROBERTOS VORGABEN VOM 28.09.
//   "darf nicht so schmal sein"; vorbelegt: Status Erledigt, Schicht nach
//   Uhrzeit, Kürzel leer; "Behoben am" raus; Ursache, Maßnahme, Kürzel,
//   Beschreibung Pflicht; Fotos/Ersatzteile/Weiterleiten ausgegraut "Bald";
//   Anlagen-Liste lässt sich scrollen.
//
//  (D1) Breite: die Karte ist mindestens 860 px breit (vorher 540).
//  (D2) Vorbelegung um 10:00: Status Erledigt, Schicht Früh, Kürzel LEER -
//       auch wenn der Rechner einen Namen gemerkt hat. Um 15:00: Spät, um
//       23:00: Nacht.
//  (D3) "Behoben am" gibt es nicht mehr.
//  (D4) Pflicht: mit Anlage, Beschreibung, Ursache, Maßnahme, aber OHNE Kürzel
//       bleibt Speichern gesperrt und die Meldung nennt "Bearbeiter-Kürzel";
//       mit Kürzel geht es. Bei "Offen" sind Ursache/Maßnahme keine Pflicht.
//  (D5) Ersatzteile und Fotos sind ausgegraut mit BALD, Weiterleiten trägt
//       BALD und ist gesperrt.
//  (D6) Anlagen-Liste: eigene Liste (role=listbox) mit Bildlauf (max. 220 px,
//       overflow-y auto) - 40 Anlagen passen hinein, Tippen filtert, Klick
//       übernimmt.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: Gegen den Bau davor ist die Karte 540 px breit, Status ist
// nicht vorbelegt, das Kürzel vorausgefüllt, "Behoben am" da und die
// Anlagenliste eine Browser-Liste ohne role=listbox.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};
const HEUTE = "2026-09-28";
const anlagen = Array.from({ length: 40 }, (_, i) => ({ id: "a" + i, name: `Anlage ${String(i + 1).padStart(2, "0")}`, role: "takt" }));
const config = { tpmAnlagen: anlagen, riItems: [], team: [{ name: "T. Balles", rolle: "mech" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] };

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const seite = async (zeit) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.clock.setFixedTime(new Date(zeit));
    await p.addInitScript(({ c }) => {
      delete window.showOpenFilePicker; delete window.showSaveFilePicker;
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", "[]");
      localStorage.setItem("werkstatt-stoerungen-entries", "[]");
      localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
      localStorage.setItem("werkstatt-kalender-name", "RC"); // gemerkter Name - darf NICHT vorausgefüllt werden
    }, { c: config });
    await p.goto(APP);
    await p.waitForTimeout(1300);
    await p.getByRole("button", { name: /^Berichte\s*\d*$/i }).first().click(); await p.waitForTimeout(300);
    await p.getByRole("button", { name: /^Störungen\s*\d*$/i }).first().click(); await p.waitForTimeout(400);
    await p.getByRole("button", { name: /Störbericht erfassen/ }).click(); await p.waitForTimeout(500);
    return { p, fehler, zu: () => ctx.close() };
  };
  const karte = (p) => p.locator('div[style*="z-index: 60"] > *').first();
  const statusAktiv = async (p, name) => {
    const b = p.getByRole("button", { name, exact: true });
    return (await b.evaluate((el) => getComputedStyle(el).backgroundColor)) !== "rgba(0, 0, 0, 0)";
  };
  const schichtAktiv = async (p, name) => {
    const b = p.locator('div[style*="z-index: 60"]').getByRole("button", { name, exact: true }).first();
    return (await b.evaluate((el) => getComputedStyle(el).backgroundColor)) !== "rgba(0, 0, 0, 0)";
  };

  /* (D1)(D2)(D3)(D4)(D5) um 10:00 */
  {
    const { p, fehler, zu } = await seite(HEUTE + "T10:00:00");
    const breite = await karte(p).evaluate((el) => el.getBoundingClientRect().width);
    ok("(D1) Die Karte ist mindestens 860 px breit", breite >= 860, `${Math.round(breite)} px`);
    ok("(D2) 10:00 Uhr: Status Erledigt vorbelegt, Schicht Früh, Kürzel leer trotz gemerktem Namen",
      (await statusAktiv(p, "● Erledigt")) && !(await statusAktiv(p, "● Offen")) && (await schichtAktiv(p, "Früh")) && (await p.locator('input[aria-label="Bearbeiter (Kürzel)"]').inputValue()) === "");
    ok("(D3) „Behoben am“ gibt es nicht mehr", !/Behoben am/.test(await p.locator("body").innerText()) && (await p.locator('input[type="datetime-local"]').count()) === 0);
    await p.locator('input[aria-label="Anlage / Bereich"]').fill("Anlage 03");
    await p.getByPlaceholder("Was funktioniert nicht?").fill("Band steht");
    await p.locator('input[aria-label="Störungs Ursache"]').fill("Sicherung");
    await p.locator('textarea[aria-label="Sofort Maßnahme"]').fill("Sicherung getauscht");
    await p.waitForTimeout(200);
    const speichern = p.getByRole("button", { name: "Speichern", exact: true });
    ok("(D4) Ohne Kürzel bleibt Speichern gesperrt, die Meldung nennt „Bearbeiter-Kürzel“",
      (await speichern.isDisabled()) && /Bearbeiter-Kürzel/.test(await p.locator("body").innerText()));
    await p.locator('input[aria-label="Bearbeiter (Kürzel)"]').fill("TB");
    await p.waitForTimeout(200);
    ok("(D4) Mit Kürzel ist Speichern frei", !(await speichern.isDisabled()));
    await p.locator('input[aria-label="Störungs Ursache"]').fill("");
    await p.waitForTimeout(200);
    ok("(D4) Bei Erledigt ist die Ursache Pflicht (leer -> gesperrt, Meldung nennt „Ursache“)", (await speichern.isDisabled()) && /Ursache/.test(await p.locator("body").innerText()));
    await p.getByRole("button", { name: "● Offen", exact: true }).click(); await p.waitForTimeout(200);
    ok("(D4) Bei Offen sind Ursache und Maßnahme keine Pflicht - Speichern frei", !(await speichern.isDisabled()));
    const ers = p.locator('[data-bald="ersatzteile"]'), fot = p.locator('[data-bald="fotos"]');
    ok("(D5) Ersatzteile und Fotos ausgegraut mit BALD; Weiterleiten gesperrt mit BALD",
      (await ers.count()) === 1 && /BALD/.test(await ers.innerText()) && (await ers.locator("input").isDisabled())
      && (await fot.count()) === 1 && /BALD/.test(await fot.innerText())
      && (await p.getByRole("button", { name: /Weiterleiten/ }).isDisabled()) && /Weiterleiten\s*BALD/.test(await p.locator("body").innerText()));
    await speichern.click(); await p.waitForTimeout(800);
    const gespeichert = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-stoerungen-entries") || "[]"));
    ok("(D4) Gespeichert mit Kürzel TB, Anlage 03, Früh, offen", gespeichert.length === 1 && gespeichert[0].melder === "TB" && gespeichert[0].anlage === "Anlage 03" && gespeichert[0].schicht === "Früh" && gespeichert[0].offen === true, JSON.stringify(gespeichert[0] || {}).slice(0, 160));
    ok("(E) Keine Skriptfehler (10:00)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }
  /* (D2) 15:00 und 23:00 */
  {
    const s15 = await seite(HEUTE + "T15:00:00");
    ok("(D2) 15:00 Uhr: Schicht Spät vorbelegt", await schichtAktiv(s15.p, "Spät"));
    await s15.zu();
    const s23 = await seite(HEUTE + "T23:00:00");
    ok("(D2) 23:00 Uhr: Schicht Nacht vorbelegt", await schichtAktiv(s23.p, "Nacht"));
    await s23.zu();
  }
  /* (D6) Anlagen-Liste */
  {
    const { p, fehler, zu } = await seite(HEUTE + "T10:00:00");
    const eingabe = p.locator('input[aria-label="Anlage / Bereich"]');
    await eingabe.click(); await p.waitForTimeout(200);
    const liste = p.locator('[role="listbox"][aria-label="Anlagen-Vorschläge"]');
    const mass = await liste.evaluate((el) => ({ maxH: getComputedStyle(el).maxHeight, ov: getComputedStyle(el).overflowY, h: el.getBoundingClientRect().height, scroll: el.scrollHeight }));
    ok("(D6) Klick ins Feld öffnet die eigene Liste mit allen 40 Anlagen, mit Bildlauf (max. 220 px, overflow-y auto, Inhalt höher als die Liste)",
      (await liste.count()) === 1 && (await liste.locator('[role="option"]').count()) === 40 && mass.maxH === "220px" && mass.ov === "auto" && mass.scroll > mass.h, JSON.stringify(mass));
    await liste.evaluate((el) => { el.scrollTop = 500; });
    ok("(D6) Die Liste lässt sich scrollen", (await liste.evaluate((el) => el.scrollTop)) > 0);
    await eingabe.fill("Anlage 2"); await p.waitForTimeout(200);
    ok("(D6) Tippen filtert („Anlage 2“ -> 10 Treffer 20–29)", (await liste.locator('[role="option"]').count()) === 10);
    await liste.locator('[role="option"]', { hasText: "Anlage 27" }).click(); await p.waitForTimeout(200);
    ok("(D6) Klick übernimmt die Anlage und schließt die Liste", (await eingabe.inputValue()) === "Anlage 27" && (await liste.count()) === 0);
    ok("(E) Keine Skriptfehler (Liste)", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await zu();
  }

  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
