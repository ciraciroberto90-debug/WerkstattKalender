// Härtetest: FOTOS IN DER PROGRAMM-FASSUNG (Robertos Frage vom 26.08.:
// "wie sieht es mit den fotos aus?").
//
// Bisher sagte der Dialog im Programm ehrlich ab - die Desktop-Brücke
// konnte keine Unterordner anlegen und keine Bilddateien schreiben. Jetzt
// kann sie beides (ordnerAnlegen + schreibeBytes), und die Verweis-
// Übersetzung in sharedfile.js reicht es als getDirectoryHandle/
// createWritable durch - derselbe Foto-Weg wie im Browser.
//
//  (P1) Mit der neuen Brücke: Ordner freigeben ist EIN Klick im Dialog,
//       das Foto landet eingedampft als echte Bytes (JPEG-Kennung) unter
//       Fotos/, der Eintrag trägt nur den Verweis, die JSON bleibt klein.
//  (P2) Vorschau liest die Bilddatei über die Brücke zurück.
//  (P3) Arbeit löschen räumt die Bilddatei mit weg.
//  (P4) ALTE Programm-ZIP (Brücke ohne die zwei neuen Handgriffe): ehrliche
//       Meldung "Programm-ZIP zu alt", kein Foto-Knopf, kein Absturz.
//
// Hausregel erfüllt: Gegen den Build vor dem Einbau schlägt (P1) fehl -
// dort bekommt der Ordner-Verweis nie ein getDirectoryHandle, der
// Foto-Knopf erscheint nicht.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";

let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const config = {
  tpmAnlagen: [{ id: "a1", name: "TS480", role: "takt" }],
  riItems: [], team: [{ name: "M. Weber", rolle: "mech" }],
};
const arbeitZeile = { id: "b1", date: "2026-08-20", category: "ARBEIT", name: "TS480", status: "open", note: "Lagerschaden an der Umlenkrolle", prio: "hoch", art: "mech", zeit: "2026-08-20T09:41:00.000Z" };

// Nachgebaute Desktop-Brücke mit Ablage im Seitenspeicher. mitFotoHandgriffen
// = false stellt eine ALTE Programm-ZIP dar (Rahmen ohne die zwei neuen
// Funktionen) - genau der Unterschied, an dem die App die Fähigkeit erkennt.
async function start(browser, { mitFotoHandgriffen = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.clock.setFixedTime(new Date("2026-08-26T10:00:00"));
  await p.addInitScript(({ c, arbeit, neu }) => {
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-name", "M. Weber");
    const ablage = {
      ordner: { "/werkstatt": true },
      dateien: {
        "/werkstatt/kalender-daten.json": { text: JSON.stringify({
          format: "werkstatt-kalender-v1", savedAt: "2026-08-25T05:00:00.000Z",
          entries: [arbeit], deleted: {}, config: c,
        }) },
      },
      merk: {},
    };
    window.__ablage = ablage;
    const inhaltVon = (d) => (d.text !== undefined ? new TextEncoder().encode(d.text) : d.bytes);
    const bruecke = {
      waehleDatei: async () => "/werkstatt/kalender-daten.json",
      waehleDateiNeu: async () => null,
      waehleOrdner: async () => "/werkstatt",
      lese: async (pf) => {
        const d = ablage.dateien[pf];
        if (!d) return null;
        const bytes = inhaltVon(d);
        return { bytes, geaendert: Date.now(), groesse: bytes.length };
      },
      schreibe: async (pf, text) => { ablage.dateien[pf] = { text: String(text) }; return true; },
      liste: async (o) => Object.keys(ablage.dateien)
        .filter((pf) => pf.startsWith(o + "/") && !pf.slice(o.length + 1).includes("/"))
        .map((pf) => ({ name: pf.split("/").pop(), pfad: pf })),
      entferne: async (pf) => { delete ablage.dateien[pf]; return true; },
      merke: async (k, w) => { if (w === null || w === undefined) delete ablage.merk[k]; else ablage.merk[k] = String(w); return true; },
      gemerkt: async (k) => (k in ablage.merk ? ablage.merk[k] : null),
      oeffnePfad: async () => true,
      pfadInfo: async (pf) => (ablage.ordner[pf] ? "ordner" : ablage.dateien[pf] ? "datei" : null),
      aufUpdate: () => {},
      updateOrdnerSetzen: async () => true,
      updateStatus: async () => ({ ordner: "", stand: "", laeuftAus: "eingebauter Fassung" }),
      updatePruefen: async () => true,
      updateUebernehmen: async () => ({ ok: false }),
    };
    if (neu) {
      bruecke.ordnerAnlegen = async (pf) => { ablage.ordner[pf] = true; return true; };
      bruecke.schreibeBytes = async (pf, bytes) => { ablage.dateien[pf] = { bytes: new Uint8Array(bytes) }; return true; };
    }
    window.__werkstattDesktop = bruecke;
  }, { c: config, arbeit: arbeitZeile, neu: mitFotoHandgriffen });
  await p.goto(APP);
  await p.waitForTimeout(900);
  // Verbinden wie im Programm: über die Brücke (der Dialog nutzt waehleDatei).
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForTimeout(1400);
  return { p, ctx, fehler };
}

// Ein "Handyfoto" wie in harte-51: groß genug, dass das Eindampfen messbar ist.
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

const inArbeit = async (p) => {
  await p.getByRole("button", { name: "Backlog", exact: true }).first().click();
  await p.waitForTimeout(600);
  await p.getByText("Lagerschaden an der Umlenkrolle").first().click();
  await p.waitForTimeout(500);
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (P1)-(P3): neue Brücke, der volle Foto-Weg ---- */
  {
    const { p, ctx, fehler } = await start(browser, { mitFotoHandgriffen: true });
    const foto = await handyFoto(p);
    await inArbeit(p);

    // Freigabe ist EIN Klick im Dialog (wie im Browser seit dem 24.08.).
    const freigeben = p.getByRole("button", { name: "Werkstatt-Ordner freigeben …" });
    pruef("(P1) Der Dialog bietet die Ein-Klick-Freigabe des Datenordners an",
          (await freigeben.count()) === 1);
    await freigeben.click();
    await p.waitForTimeout(600);
    pruef("(P1) Nach der Freigabe ist der Foto-Knopf da - kein „zu alt“-Hinweis",
          (await p.locator('input[aria-label="Foto hinzufügen"]').count()) === 1 &&
          !(await p.locator("body").innerText()).includes("Programm-ZIP zu alt"));

    await p.locator('input[aria-label="Foto hinzufügen"]').setInputFiles({ name: "schaden.jpg", mimeType: "image/jpeg", buffer: foto });
    await p.waitForTimeout(1200); // eindampfen braucht einen Moment
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.waitForTimeout(1000);

    const lage = await p.evaluate(() => {
      const fotos = Object.keys(window.__ablage.dateien).filter((pf) => pf.startsWith("/werkstatt/Fotos/"));
      const d = fotos.length ? window.__ablage.dateien[fotos[0]] : null;
      return {
        ordnerDa: !!window.__ablage.ordner["/werkstatt/Fotos"],
        fotos,
        groesse: d && d.bytes ? d.bytes.length : 0,
        jpegKennung: !!(d && d.bytes && d.bytes[0] === 0xFF && d.bytes[1] === 0xD8),
        eintrag: JSON.parse(window.__ablage.dateien["/werkstatt/kalender-daten.json"].text).entries.find((e) => e.id === "b1"),
      };
    });
    pruef("(P1) Der Unterordner Fotos/ wurde über die Brücke angelegt", lage.ordnerDa);
    pruef("(P1) Die Bilddatei liegt als ECHTE Bytes mit JPEG-Kennung darin",
          lage.fotos.length === 1 && lage.jpegKennung, JSON.stringify(lage.fotos));
    pruef("(P1) Eingedampft: deutlich kleiner als das Original, aber kein leerer Rest",
          lage.groesse > 10000 && lage.groesse < foto.length / 2,
          `${Math.round(foto.length / 1024)} kB -> ${Math.round(lage.groesse / 1024)} kB`);
    pruef("(P1) Der Eintrag in der gemeinsamen Datei trägt nur den Verweis",
          Array.isArray(lage.eintrag.fotos) && lage.eintrag.fotos.length === 1 &&
          ("/werkstatt/Fotos/" + lage.eintrag.fotos[0].datei) === lage.fotos[0] &&
          JSON.stringify(lage.eintrag).length < 1000,
          JSON.stringify(lage.eintrag.fotos));

    // (P2) Vorschau: die Backlog-Zeile liest das Bild über die Brücke zurück.
    const chip = p.getByRole("button", { name: /1 Foto\(s\) zu .* zeigen/ });
    pruef("(P2) Die Backlog-Zeile trägt das 📷-Kennzeichen", (await chip.count()) === 1);
    await chip.click();
    await p.waitForTimeout(500);
    pruef("(P2) Die Vorschau klappt auf (Bild über die Brücke zurückgelesen)",
          (await p.getByRole("button", { name: /Foto 1 groß ansehen/ }).count()) === 1);

    // (P3) Arbeit löschen räumt die Bilddatei mit weg.
    await p.getByText("Lagerschaden an der Umlenkrolle").first().click();
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: "Löschen", exact: true }).click();
    await p.waitForTimeout(1000);
    pruef("(P3) Arbeit gelöscht -> die Bilddatei ist von der Ablage verschwunden",
          (await p.evaluate(() => Object.keys(window.__ablage.dateien).filter((pf) => pf.startsWith("/werkstatt/Fotos/")).length)) === 0);
    pruef("(P1-P3) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (P4) Alte Programm-ZIP: ehrlich bleiben, nicht stürzen ---- */
  {
    const { p, ctx, fehler } = await start(browser, { mitFotoHandgriffen: false });
    await inArbeit(p);
    await p.getByRole("button", { name: "Werkstatt-Ordner freigeben …" }).click();
    await p.waitForTimeout(600);
    const text = await p.locator("body").innerText();
    pruef("(P4) Alte ZIP: ehrliche Meldung „Programm-ZIP zu alt“ statt Foto-Knopf",
          /Programm-ZIP zu alt/i.test(text) &&
          (await p.locator('input[aria-label="Foto hinzufügen"]').count()) === 0);
    pruef("(P4) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  console.log(`\nHärte 57 (Fotos in der Programm-Fassung): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
