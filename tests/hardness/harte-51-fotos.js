// Härtetest: FOTOS ZU STÖRUNGEN UND BACKLOG-ARBEITEN (Robertos Auftrag 21.08.).
//
// Hausregel: Die Änderung berührt die Datei-Ablage - dieser Test schlägt ohne
// sie fehl (ohne den Einbau gibt es weder Foto-Knopf noch Fotos/-Ordner).
//
//  (A) ANHÄNGEN: Ein Foto an einer Backlog-Arbeit landet als Datei im
//      Unterordner "Fotos" des Datenordners; im Eintrag steht NUR der
//      Verweis (die gemeinsame JSON bleibt klein).
//  (B) EINDAMPFEN: Ein 3000x2000-Handyfoto wird vor dem Speichern auf
//      höchstens 1600 px Kante verkleinert und deutlich kleiner als das
//      Original - sonst wüchse der Ordner auf dem Laufwerk zu schnell.
//  (C) ANZEIGEN: Die Backlog-Zeile trägt das 📷-Kennzeichen, der Klick
//      darauf klappt die Vorschau auf (ohne den Dialog zu öffnen), der
//      Klick aufs Bild öffnet die Großansicht, Esc schließt NUR sie.
//  (D) ABBRECHEN: Foto wählen und dann Abbrechen hinterlässt KEINE Datei
//      im Ordner und keinen Verweis - keine Waisen.
//  (E) ENTFERNEN + LÖSCHEN: ✕ am Foto (mit Speichern) löscht die Datei;
//      das Löschen der ganzen Arbeit räumt ihre Fotodateien mit weg.
//  (F) STÖRBERICHT: Auch ein Störbericht nimmt Fotos an; die Ansicht
//      zeigt sie (nur lesend, ohne ✕), die Datei liegt im selben Ordner.
//  (G) OHNE FREIGABE: Ohne Datenordner-Freigabe bleibt alles stumm -
//      kein Knopf, keine Fehler. Ein Eintrag MIT Foto-Verweis zeigt dann
//      "Datei fehlt" statt zu crashen; ebenso bei gelöschter Datei.
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

async function start(browser, { arbeiten = [], mitOrdner = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.clock.setFixedTime(new Date("2026-08-21T10:00:00"));
  await p.addInitScript(({ e, c }) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
    localStorage.setItem("werkstatt-kalender-name", "M. Weber");
    // Nachgebauter Datenordner im Speicher - wie die echte Ordner-Freigabe,
    // nur prüfbar: __fotoDateien() verrät jederzeit, was im Unterordner liegt.
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
  }, { e: arbeiten, c: config });
  await p.goto(APP);
  await p.waitForTimeout(1000);
  if (mitOrdner) await p.evaluate(() => window.__wkSharedTest.adoptFolder(window.__mockOrdnerHandle));
  return { p, ctx, fehler };
}

// Ein "Handyfoto": 3000x2000-JPEG mit genug Struktur gegen die Kompression.
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

const arbeitZeile = { id: "b1", date: "2026-08-20", category: "ARBEIT", name: "TS480", status: "open", note: "Lagerschaden an der Umlenkrolle", prio: "hoch", art: "mech", zeit: "2026-08-20T09:41:00.000Z" };
const inBacklog = async (p) => {
  await p.getByRole("button", { name: "Backlog", exact: true }).first().click();
  await p.waitForTimeout(600);
};
const gespeichert = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---- (A) + (B) + (C) + (E): der Backlog-Hauptweg ---- */
  {
    const { p, ctx, fehler } = await start(browser, { arbeiten: [arbeitZeile] });
    const foto = await handyFoto(p);
    await inBacklog(p);
    await p.getByText("Lagerschaden an der Umlenkrolle").first().click();
    await p.waitForTimeout(500);

    // Anhängen und speichern
    await p.locator('input[aria-label="Foto hinzufügen"]').setInputFiles({ name: "schaden.jpg", mimeType: "image/jpeg", buffer: foto });
    await p.waitForTimeout(1200); // eindampfen braucht einen Moment
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.waitForTimeout(800);

    const dateien = await p.evaluate(() => window.__fotoDateien());
    pruef("(A) Die Bilddatei liegt im Unterordner Fotos/", dateien.length === 1, JSON.stringify(dateien));
    const eintrag = (await gespeichert(p)).find((e) => e.id === "b1");
    pruef("(A) Der Eintrag trägt genau einen Foto-VERWEIS (Dateiname, wer, wann)",
          Array.isArray(eintrag.fotos) && eintrag.fotos.length === 1 &&
          eintrag.fotos[0].datei === (dateien[0] || {}).name && eintrag.fotos[0].wer === "M. Weber",
          JSON.stringify(eintrag.fotos));
    pruef("(A) Die gemeinsame JSON bleibt klein - kein Bild im Eintrag",
          JSON.stringify(eintrag).length < 1000, `${JSON.stringify(eintrag).length} Zeichen`);
    const masse = await p.evaluate(async () => {
      const f = window.__mockWurzel.dirs.get("Fotos");
      const b = [...f.files.values()][0];
      const bmp = await createImageBitmap(b);
      return { breite: bmp.width, hoehe: bmp.height, bytes: b.size };
    });
    pruef("(B) Eingedampft auf höchstens 1600 px Kante",
          Math.max(masse.breite, masse.hoehe) <= 1600 && Math.abs(masse.breite / masse.hoehe - 1.5) < 0.02,
          `${masse.breite}x${masse.hoehe}`);
    pruef("(B) Deutlich kleiner als das Original",
          masse.bytes > 10000 && masse.bytes < foto.length / 2,
          `${Math.round(foto.length / 1024)} kB -> ${Math.round(masse.bytes / 1024)} kB`);

    // (C) Kennzeichen, Vorschau, Großansicht
    const chip = p.getByRole("button", { name: /1 Foto\(s\) zu .* zeigen/ });
    pruef("(C) Die Backlog-Zeile trägt das 📷-Kennzeichen", (await chip.count()) === 1);
    await chip.click();
    await p.waitForTimeout(400);
    pruef("(C) Der Chip klappt die Vorschau auf, ohne den Dialog zu öffnen",
          (await p.getByRole("button", { name: /Foto 1 groß ansehen/ }).count()) === 1 &&
          (await p.getByText("Arbeit bearbeiten").count()) === 0);
    await p.getByRole("button", { name: /Foto 1 groß ansehen/ }).click();
    await p.waitForTimeout(500);
    const gross = p.locator('div[role="dialog"][aria-label="Foto-Großansicht"]');
    pruef("(C) Klick aufs Bild öffnet die Großansicht mit Aufnahme-Info",
          (await gross.count()) === 1 && /M\. Weber/.test(await gross.innerText()), (await gross.innerText()).slice(0, 120));
    pruef("(C) Aus dem Backlog heraus gibt es KEINEN Löschknopf (nur ansehen)",
          (await gross.getByRole("button", { name: "Foto löschen" }).count()) === 0);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
    pruef("(C) Esc schließt die Großansicht", (await gross.count()) === 0);

    // (E) ✕ im Dialog + Speichern löscht die Datei
    await p.getByText("Lagerschaden an der Umlenkrolle").first().click();
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: "Foto 1 entfernen" }).click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.waitForTimeout(800);
    pruef("(E) ✕ + Speichern: Verweis weg UND Datei weg",
          ((await gespeichert(p)).find((e) => e.id === "b1").fotos || []).length === 0 &&
          (await p.evaluate(() => window.__fotoDateien())).length === 0);

    // (E) Arbeit mit Foto ganz löschen -> Datei wird mit weggeräumt
    await p.getByText("Lagerschaden an der Umlenkrolle").first().click();
    await p.waitForTimeout(500);
    await p.locator('input[aria-label="Foto hinzufügen"]').setInputFiles({ name: "schaden2.jpg", mimeType: "image/jpeg", buffer: foto });
    await p.waitForTimeout(1200);
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.waitForTimeout(800);
    pruef("(E) Vorbereitung: wieder 1 Datei im Ordner", (await p.evaluate(() => window.__fotoDateien())).length === 1);
    await p.getByText("Lagerschaden an der Umlenkrolle").first().click();
    await p.waitForTimeout(500);
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "Löschen", exact: true }).click();
    await p.waitForTimeout(800);
    pruef("(E) Arbeit gelöscht: Eintrag weg UND Fotodatei weg",
          (await gespeichert(p)).length === 0 && (await p.evaluate(() => window.__fotoDateien())).length === 0);
    pruef("(A-E) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (D) Abbrechen hinterlässt keine Waisen ---- */
  {
    const { p, ctx, fehler } = await start(browser, { arbeiten: [arbeitZeile] });
    const foto = await handyFoto(p);
    await inBacklog(p);
    await p.getByText("Lagerschaden an der Umlenkrolle").first().click();
    await p.waitForTimeout(500);
    await p.locator('input[aria-label="Foto hinzufügen"]').setInputFiles({ name: "schaden.jpg", mimeType: "image/jpeg", buffer: foto });
    await p.waitForTimeout(1200);
    pruef("(D) Vor dem Speichern zeigt der Dialog die Vorschau-Kachel",
          (await p.getByRole("button", { name: "Foto 1 groß ansehen" }).count()) === 1);
    pruef("(D) Aber im Ordner liegt noch NICHTS (erst Speichern schreibt)",
          (await p.evaluate(() => window.__fotoDateien())).length === 0);
    await p.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await p.waitForTimeout(500);
    pruef("(D) Nach Abbrechen: keine Datei, kein Verweis",
          (await p.evaluate(() => window.__fotoDateien())).length === 0 &&
          !((await gespeichert(p)).find((e) => e.id === "b1").fotos || []).length);
    pruef("(D) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (F) Störbericht mit Foto ---- */
  {
    const { p, ctx, fehler } = await start(browser, {});
    const foto = await handyFoto(p);
    await p.getByRole("button", { name: /^Störungen/ }).first().click();
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: "📝 Störbericht erfassen" }).first().click();
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: "● Offen" }).click();
    await p.getByPlaceholder("z. B. Presse 3").fill("TS480");
    await p.getByRole("button", { name: "Früh", exact: true }).click();
    await p.getByPlaceholder("Was funktioniert nicht?").fill("Halter der Umlenkrolle gebrochen");
    await p.locator('input[aria-label="Foto hinzufügen"]').setInputFiles({ name: "bruch.jpg", mimeType: "image/jpeg", buffer: foto });
    await p.waitForTimeout(1200);
    await p.getByRole("button", { name: "Speichern", exact: true }).click();
    await p.waitForTimeout(900);
    const stoer = await p.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-stoerungen-entries") || "[]"));
    const dateien = await p.evaluate(() => window.__fotoDateien());
    pruef("(F) Der Störbericht trägt den Foto-Verweis, die Datei liegt im Ordner",
          stoer.length === 1 && Array.isArray(stoer[0].fotos) && stoer[0].fotos.length === 1 &&
          dateien.length === 1 && stoer[0].fotos[0].datei === dateien[0].name,
          JSON.stringify((stoer[0] || {}).fotos));
    // Ansicht (nur lesend): Kachel ja, ✕ nein.
    // Die Liste gruppiert zweistufig (Tag -> Schicht), beides erst aufklappen.
    await p.locator("tr", { hasText: /21\.08\.2026/ }).first().click();
    await p.waitForTimeout(400);
    await p.locator("tr", { hasText: /Früh/ }).last().click();
    await p.waitForTimeout(400);
    await p.getByText("Halter der Umlenkrolle gebrochen").first().click();
    await p.waitForTimeout(600);
    pruef("(F) Die Ansicht zeigt das Foto (Großansicht per Klick), aber kein ✕",
          (await p.getByRole("button", { name: "Foto 1 groß ansehen" }).count()) === 1 &&
          (await p.getByRole("button", { name: "Foto 1 entfernen" }).count()) === 0);
    await p.getByRole("button", { name: "Foto 1 groß ansehen" }).click();
    await p.waitForTimeout(400);
    pruef("(F) Großansicht aus der Ansicht heraus funktioniert",
          (await p.locator('div[role="dialog"][aria-label="Foto-Großansicht"]').count()) === 1);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
    pruef("(F) Esc schließt NUR die Großansicht, der Bericht bleibt offen",
          (await p.locator('div[role="dialog"][aria-label="Foto-Großansicht"]').count()) === 0 &&
          (await p.getByText("Halter der Umlenkrolle gebrochen").count()) > 0);
    pruef("(F) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  /* ---- (G) Ohne Freigabe stumm; fehlende Datei crasht nicht ---- */
  {
    const mitVerweis = { ...arbeitZeile, fotos: [{ datei: "foto-gibtsnicht.jpg", wer: "M. Weber", ts: "2026-08-20T09:41:00.000Z" }] };
    const { p, ctx, fehler } = await start(browser, { arbeiten: [mitVerweis], mitOrdner: false });
    await inBacklog(p);
    await p.getByText("Lagerschaden an der Umlenkrolle").first().click();
    await p.waitForTimeout(600);
    pruef("(G) Ohne Ordner-Freigabe gibt es keinen Foto-hinzufügen-Knopf",
          (await p.locator('input[aria-label="Foto hinzufügen"]').count()) === 0);
    pruef("(G) Der vorhandene Verweis zeigt 'Datei fehlt' statt zu crashen",
          /Datei fehlt/.test(await p.locator('div[role="dialog"], .fixed').last().innerText().catch(() => "")) ||
          /Datei fehlt/.test(await p.locator("body").innerText()));
    pruef("(G) Und ein Hinweis nennt die nötige Freigabe",
          /Datenordner-Freigabe/.test(await p.locator("body").innerText()));
    pruef("(G) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }
  {
    // Neuer Zusammenhang: Freigabe da, aber die Bilddatei wurde von Hand gelöscht.
    const mitVerweis = { ...arbeitZeile, fotos: [{ datei: "foto-geloescht.jpg", wer: "M. Weber", ts: "2026-08-20T09:41:00.000Z" }] };
    const { p, ctx, fehler } = await start(browser, { arbeiten: [mitVerweis] });
    await inBacklog(p);
    const chip = p.getByRole("button", { name: /1 Foto\(s\) zu .* zeigen/ });
    await chip.click();
    await p.waitForTimeout(600);
    pruef("(G) Gelöschte Datei: Vorschau zeigt 'fehlt', kein Crash",
          /fehlt/.test(await p.locator("tbody").innerText()) && fehler.length === 0,
          fehler.slice(0, 2).join(" | "));
    await ctx.close();
  }

  console.log(`\nHärte 51 (Fotos): ${ok}/${ok + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ABBRUCH:", e); process.exit(1); });
