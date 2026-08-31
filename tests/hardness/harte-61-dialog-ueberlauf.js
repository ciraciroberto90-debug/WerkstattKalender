// Härtetest: DIALOG-INHALT QUILLT NICHT MEHR AUS DER KARTE (Robertos
// Bilder vom 31.08.: Im Störbericht-Dialog standen Fehlerart, Ausfallzeit
// und "Behoben am" AUSSERHALB der weißen Karte frei auf dem Hintergrund).
//
// Gemessene Wurzel - ein React-Klassiker: Der Ansichts-Dialog mischte die
// Kurzform overflow:"hidden" mit der Langform overflowY:"auto". Beim
// Wechsel Ansicht -> Bearbeiten recycelt React dieselbe Karte, entfernt das
// weggefallene overflow (der Browser löscht dabei AUCH overflow-y) und
// setzt overflowY nie neu, weil es in beiden Objekten "auto" heißt.
// Ergebnis: Karte ganz ohne overflow-y - der Inhalt lief unten heraus.
//
//  (D1) Nach Ansicht -> Bearbeiten hat die Karte wirklich overflow-y:auto.
//  (D2) Der lange Inhalt SCROLLT in der Karte (unten nichts frei sichtbar).
//  (D3) Auch nach dem Kleiner-Ziehen an der Größen-Ecke scrollt die Karte.
//
// Hausregel erfüllt: Gegen den Build ohne die Änderung steht die Karte auf
// overflow-y:visible - (D1) und (D2) schlagen fehl.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const p = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-31T10:00:00"));
  await p.addInitScript(() => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([]));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({ tpmAnlagen: [{ id: "a1", name: "Wikler", role: "takt" }], riItems: [], team: [] }));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify([
      { id: "s1", nr: "2026-0002", date: "2026-08-28", schicht: "Spät", anlage: "Wikler", stoerung: "Test", gewerk: "mech", fehlerart: "Mechanisch", ausfallzeit: 85, offen: false, gemeldetAt: "2026-08-28T11:37:00.000Z", behobenAt: "2026-08-28T13:00:00.000Z", melder: "RC", ersatzteile: "lager" },
    ]));
  });
  await p.goto(APP);
  await p.waitForTimeout(1100);
  await p.getByRole("button", { name: /Störungen/ }).first().click();
  await p.waitForTimeout(700);
  // Bericht zweistufig aufklappen, Ansicht öffnen, dann Bearbeiten - genau
  // der Weg, auf dem React die Karte recycelt.
  await p.locator("tr", { hasText: /28\.08\.2026/ }).first().click();
  await p.waitForTimeout(300);
  await p.locator("tr", { hasText: /Spät/ }).last().click();
  await p.waitForTimeout(300);
  await p.getByText("0002").first().click().catch(() => {});
  await p.waitForTimeout(400);
  const bearb = p.getByRole("button", { name: /Bearbeiten/ }).first();
  if (await bearb.count()) { await bearb.click(); await p.waitForTimeout(400); }
  pruef("(Vorbedingung) Der Bearbeiten-Dialog ist offen",
        (await p.getByText("Störbericht bearbeiten").count()) === 1);

  const messen = () => p.evaluate(() => {
    const ecke = [...document.querySelectorAll('div[title="Größe ändern"]')].pop();
    const wrapper = ecke.parentElement;
    const karte = [...wrapper.children].find((c) => c !== ecke && c.getAttribute("title") !== "Dialog verschieben");
    const s = getComputedStyle(karte);
    const k = karte.getBoundingClientRect();
    // Ein tief unten liegendes Element: sichtbar dürfte es unterhalb der
    // Kartenunterkante NIE sein - dort muss das dunkle Overlay liegen.
    const unten = [...document.querySelectorAll("*")].find((el) => el.textContent.trim() === "Ersatzteil nachbestellt" && el.children.length === 0);
    let freiSichtbar = false;
    if (unten) {
      const u = unten.getBoundingClientRect();
      if (u.y > k.y + k.height && u.y < innerHeight) {
        const treffer = document.elementFromPoint(Math.min(u.x + 5, innerWidth - 2), Math.min(u.y + 5, innerHeight - 2));
        freiSichtbar = !!(treffer && (treffer === unten || unten.contains(treffer) || treffer.contains(unten)));
      }
    }
    return { overflowY: s.overflowY, scrollt: karte.scrollHeight > karte.clientHeight + 2, freiSichtbar };
  });

  /* ---- (D1)+(D2): direkt nach Ansicht -> Bearbeiten ---- */
  const m1 = await messen();
  pruef("(D1) Die Karte hat nach Ansicht->Bearbeiten wirklich overflow-y:auto",
        m1.overflowY === "auto", m1.overflowY);
  pruef("(D2) Der lange Inhalt scrollt IN der Karte, nichts steht frei auf dem Hintergrund",
        m1.scrollt && !m1.freiSichtbar, JSON.stringify(m1));

  /* ---- (D3) Kleiner ziehen an der Größen-Ecke ---- */
  const ecke = p.locator('div[title="Größe ändern"]').last();
  const eb = await ecke.boundingBox();
  await p.mouse.move(eb.x + 9, eb.y + 9);
  await p.mouse.down();
  await p.mouse.move(eb.x - 150, eb.y - 380, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  const m2 = await messen();
  pruef("(D3) Auch klein gezogen scrollt die Karte statt überzulaufen",
        m2.overflowY === "auto" && m2.scrollt && !m2.freiSichtbar, JSON.stringify(m2));
  pruef("(D1-D3) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

  console.log(`\nHärte 61 (Dialog-Überlauf): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
