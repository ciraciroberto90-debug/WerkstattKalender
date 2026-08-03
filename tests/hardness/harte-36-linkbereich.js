// Härtetest: LINKREIHE oben in der Übersicht.
//
// Die Sammlung ist ausdruecklich nur fuer Bearbeiter. Ein Nur-Leser darf sie
// nicht sehen - und zwar wirklich nicht, nicht bloss ausgegraut. Zweitens
// gehoeren die Links in die gemeinsame Datei, damit die Vertretung dieselbe
// Liste vor sich hat; ein Link, der nur auf einem Rechner liegt, waere im
// Vertretungsfall wertlos.
//
// Geprueft wird:
//   (1) Nur-Leser: der Bereich existiert nicht, auch nicht im Quelltext.
//   (2) Bearbeiter: aufklappen, Link anlegen, er steht in der Datei.
//   (3) Umschalten RC/AR trennt die Sammlungen sauber.
//   (4) Ein zweites Geraet sieht den Link, ohne dass jemand neu laedt.
//   (5) Aendern, Sortieren, Loeschen - und der andere Inhaber bleibt heil.
//   (6) Netzwerkpfade werden nicht als Web-Adresse geoeffnet.
//   (7) Die Links ueberstehen einen Neustart der App.
//   (7b) Die Reihe steht ueber den Kennzahlen und bleibt flach.
//   (8) Ueber den Ausliefer-Dienst geoeffnet: Der Klick fragt ihn nach der
//       Datei, mit der Kopfzeile, auf der seine Zugangspruefung beruht.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs");
const http = require("http");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok = 0, fail = 0;
const pruef = (n, c, zusatz) => {
  console.log((c ? "PASS | " : "FAIL | ") + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? ok++ : fail++;
};

const START = {
  format: "werkstatt-kalender-v1", savedAt: "2026-07-20T08:00:00.000Z",
  entries: [{ id: "a1", date: "2026-07-20", category: "TPM", name: "BTS", status: "open", updatedAt: "2026-07-20T08:00:00.000Z" }],
  deleted: {}, config: null,
};

async function seite(browser, platte, nurLesen) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  await p.exposeFunction("__lies", (n) => platte[n] ?? "");
  await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
  await p.addInitScript((lesen) => {
    const h = {
      name: "kalender-daten.json", kind: "file",
      async getFile() { const t = await window.__lies("kalender-daten.json"); return new File([t], "kalender-daten.json", { type: "application/json" }); },
      async createWritable() {
        if (lesen) throw new DOMException("Kein Schreibrecht", "NotAllowedError");
        let b = ""; return { async write(c) { b += c; }, async close() { await window.__schreib("kalender-daten.json", b); }, async abort() {} };
      },
      async queryPermission(o) { return (o && o.mode === "readwrite" && lesen) ? "denied" : "granted"; },
      async requestPermission(o) { return (o && o.mode === "readwrite" && lesen) ? "denied" : "granted"; },
    };
    window.showOpenFilePicker = async () => [h];
    window.showSaveFilePicker = async () => h;
  }, !!nurLesen);
  await p.goto(APP);
  await p.waitForTimeout(1000);
  return p;
}
const verbinde = async (p) => {
  await p.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p.getByText("Vorhandene Datei öffnen …").click();
  await p.waitForTimeout(2500);
};
// Die Reihe traegt sichtbar nur "🔗 Meine Links"; der volle Name steht als
// aria-label am Knopf, damit der Test an der Bedeutung haengt und nicht an
// der Schreibweise in der Reihe.
const kopfzeile = (p) => p.getByRole("button", { name: "Links & Dokumente" });
const linksInDatei = (platte, inhaber) => {
  const d = JSON.parse(platte["kalender-daten.json"] || "{}");
  const e = (d.entries || []).find((x) => x.id === "config|links");
  const alle = (e && e.value && Array.isArray(e.value.eintraege)) ? e.value.eintraege : [];
  return inhaber ? alle.filter((l) => l.inhaber === inhaber) : alle;
};
async function legeAn(p, name, ziel) {
  await p.getByRole("button", { name: "＋ Link" }).click();
  await p.waitForTimeout(300);
  await p.getByPlaceholder(/Bezeichnung/).fill(name);
  await p.getByPlaceholder(/Adresse oder Pfad/).fill(ziel);
  await p.getByRole("button", { name: "Speichern" }).click();
  await p.waitForTimeout(1600);
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });

  /* ---------------- (1) Nur-Leser sieht nichts ---------------- */
  {
    const platte = {
      "kalender-daten.json": JSON.stringify({
        ...START,
        entries: [...START.entries, {
          id: "config|links", updatedAt: "2026-07-20T08:00:00.000Z",
          value: { inhaber: ["RC", "AR"], eintraege: [{ id: "l1", inhaber: "RC", name: "Geheime Liste", ziel: "intranet.firma.de/x", symbol: "🔗" }] },
        }],
      }),
    };
    const p = await seite(b, platte, true);
    const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
    await verbinde(p);
    await p.waitForTimeout(1200);

    pruef("(1) Der Linkbereich ist für Nur-Leser nicht sichtbar", await kopfzeile(p).count() === 0);
    const html = await p.content();
    pruef("(1) Auch der Name des Links steht nicht in der Seite", !/Geheime Liste/.test(html));
    pruef("(1) Die Datei wurde dabei nicht verändert",
          JSON.parse(platte["kalender-daten.json"]).entries.some((e) => e.id === "config|links"));
    pruef("(1) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 1).join(" "));
    await p.context().close();
  }

  /* ---------------- (2)-(6) Bearbeiter ---------------- */
  {
    const platte = { "kalender-daten.json": JSON.stringify(START) };
    const p = await seite(b, platte);
    const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
    await verbinde(p);
    await p.waitForTimeout(800);

    pruef("(2) Der Bearbeiter sieht den Bereich", await kopfzeile(p).count() > 0);
    pruef("(2) Er ist zunächst zugeklappt", await p.getByRole("button", { name: "＋ Link" }).count() === 0);

    await kopfzeile(p).click();
    await p.waitForTimeout(400);
    pruef("(2) Ein Klick klappt ihn auf", await p.getByRole("button", { name: "＋ Link" }).count() > 0);

    await legeAn(p, "Ersatzteile bestellen", "intranet.firma.de/teile");
    const rc = linksInDatei(platte, "RC");
    pruef("(2) Der Link steht in der gemeinsamen Datei", rc.length === 1 && rc[0].name === "Ersatzteile bestellen",
          JSON.stringify(rc.map((l) => l.name)));
    pruef("(2) Er hängt am angezeigten Kürzel RC", rc[0] && rc[0].inhaber === "RC");

    /* ---------------- (3) Umschalten auf AR ---------------- */
    await p.getByRole("button", { name: "AR", exact: true }).click();
    await p.waitForTimeout(400);
    pruef("(3) Nach dem Umschalten ist der Link von RC nicht mehr zu sehen",
          await p.getByText("Ersatzteile bestellen").count() === 0);
    await legeAn(p, "Vertretungsplan", "intranet.firma.de/vertretung");
    pruef("(3) Der neue Link hängt an AR", linksInDatei(platte, "AR").length === 1);
    pruef("(3) Die Sammlung von RC ist unberührt", linksInDatei(platte, "RC").length === 1);

    /* ---------------- (4) Zweites Gerät ---------------- */
    const p2 = await seite(b, platte);
    await verbinde(p2);
    await p2.waitForTimeout(800);
    await kopfzeile(p2).click();
    await p2.waitForTimeout(500);
    pruef("(4) Das zweite Gerät sieht den Link des ersten",
          await p2.getByText("Ersatzteile bestellen").count() > 0);
    await p2.context().close();

    /* ---------------- (5) Ändern, Sortieren, Löschen ---------------- */
    await p.getByRole("button", { name: "RC", exact: true }).click();
    await p.waitForTimeout(400);
    await legeAn(p, "Zweiter Link", "intranet.firma.de/zwei");
    pruef("(5) Vorbedingung: zwei Links bei RC", linksInDatei(platte, "RC").length === 2);

    // Reihenfolge tauschen
    await p.locator('button[title="nach unten"]').first().click();
    await p.waitForTimeout(1600);
    const reihe = linksInDatei(platte, "RC").map((l) => l.name);
    pruef("(5) Die Reihenfolge lässt sich ändern", reihe[0] === "Zweiter Link", reihe.join(" → "));

    // Ändern
    await p.locator('button[title="bearbeiten"]').first().click();
    await p.waitForTimeout(300);
    await p.getByPlaceholder(/Bezeichnung/).fill("Umbenannt");
    await p.getByRole("button", { name: "Speichern" }).click();
    await p.waitForTimeout(1600);
    pruef("(5) Ein Link lässt sich umbenennen",
          linksInDatei(platte, "RC").some((l) => l.name === "Umbenannt"));

    // Löschen (bestätigt)
    p.once("dialog", (d) => d.accept());
    await p.locator('button[title="bearbeiten"]').first().click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: "Löschen" }).click();
    await p.waitForTimeout(1600);
    pruef("(5) Löschen entfernt genau einen Link", linksInDatei(platte, "RC").length === 1);
    pruef("(5) Die Sammlung von AR ist dabei unversehrt", linksInDatei(platte, "AR").length === 1,
          JSON.stringify(linksInDatei(platte, "AR").map((l) => l.name)));

    /* ---------------- (6) Netzwerkpfad ---------------- */
    // Erst im Entwurf: Der Hinweis muss stehen, BEVOR gespeichert wird - sonst
    // erfährt man erst nach dem Klick, dass der Browser den Pfad nicht öffnet.
    await p.getByRole("button", { name: "＋ Link" }).click();
    await p.waitForTimeout(300);
    await p.getByPlaceholder(/Bezeichnung/).fill("Anleitungen");
    await p.getByPlaceholder(/Adresse oder Pfad/).fill("\\\\scheudc1\\PSG_Gruppe\\Anleitungen");
    await p.waitForTimeout(300);
    const entwurfText = await p.locator("body").innerText();
    pruef("(6) Schon im Entwurf steht, dass der Pfad in die Zwischenablage geht",
          /Zwischenablage/i.test(entwurfText) && /Explorer/i.test(entwurfText));
    // Gegenprobe: bei einer Web-Adresse steht dieser Hinweis NICHT.
    await p.getByPlaceholder(/Adresse oder Pfad/).fill("intranet.firma.de/anleitungen");
    await p.waitForTimeout(300);
    const webText = await p.locator("body").innerText();
    pruef("(6) Bei einer Web-Adresse steht stattdessen die Zieladresse",
          !/Zwischenablage/i.test(webText) && /https:\/\/intranet\.firma\.de/.test(webText));
    await p.getByPlaceholder(/Adresse oder Pfad/).fill("\\\\scheudc1\\PSG_Gruppe\\Anleitungen");
    await p.getByRole("button", { name: "Speichern" }).click();
    await p.waitForTimeout(1600);

    let neueSeiten = 0;
    p.context().on("page", () => { neueSeiten++; });
    await p.getByText("Anleitungen").first().click();
    await p.waitForTimeout(900);
    pruef("(6) Ein Netzwerkpfad öffnet KEINEN Browser-Tab", neueSeiten === 0, neueSeiten + " neue Seiten");

    pruef("(2)-(6) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));

    /* ---------------- (7) Neustart ---------------- */
    const p3 = await seite(b, platte);
    await verbinde(p3);
    await p3.waitForTimeout(800);
    await kopfzeile(p3).click();
    await p3.waitForTimeout(500);
    const sichtbar = await p3.locator("body").innerText();
    pruef("(7) Nach einem Neustart sind die Links wieder da", /Umbenannt|Anleitungen/.test(sichtbar));

    /* ---------------- (7b) Platz in der Übersicht ----------------
       Die Reihe gehört ÜBER die Kennzahlen. Stünde sie darunter, wäre sie
       auf einem 1366-Pixel-Bildschirm der Werkstatt schon halb aus dem Bild -
       und ein Link, den man erst herunterscrollen muss, wird nicht benutzt.
       Gemessen wird die Lage auf dem Bildschirm, nicht die Reihenfolge im
       Quelltext: Nur die erste sagt etwas darüber, was man wirklich sieht. */
    const obenLinks = await kopfzeile(p3).boundingBox();
    const obenKpi = await p3.getByText("Heute fällig").first().boundingBox();
    pruef("(7b) Die Linkreihe steht über den Kennzahlen",
          obenLinks && obenKpi && obenLinks.y < obenKpi.y,
          obenLinks && obenKpi ? `Links y=${Math.round(obenLinks.y)}, Kennzahlen y=${Math.round(obenKpi.y)}` : "nicht gefunden");
    // Flach halten ist keine Kosmetik: Die Reihe schiebt die Kennzahlen nach
    // unten. Ueber 130 Pixel faengt sie an, die Uhr aus dem Bild zu draengen.
    // Gemessen wird der Alltagszustand - die Verwaltung ist zugeklappt.
    await kopfzeile(p3).click();
    await p3.waitForTimeout(350);
    const hoehe = await p3.evaluate(() => {
      const k = document.querySelector('button[aria-label="Links & Dokumente"]');
      return k ? Math.round(k.closest("div.wk-karte").getBoundingClientRect().height) : -1;
    });
    pruef("(7b) Die Reihe bleibt flach (unter 130 px)", hoehe > 0 && hoehe < 130, hoehe + " px");

    // Sie lebt in der Übersicht - in den anderen Reitern ist sie nicht da.
    // Das ist die bewusste Kehrseite dieses Platzes und steht hier, damit ein
    // späterer Umzug eine Entscheidung ist und kein Versehen.
    await p3.getByRole("button", { name: /^Störungen/ }).first().click();
    await p3.waitForTimeout(350);
    pruef("(7b) In den Störungen steht sie erwartungsgemäß nicht",
          await kopfzeile(p3).count() === 0);
    await p3.context().close();
    await p.context().close();
  }

  /* ---------------- (9) Die Symbolauswahl ----------------
     Sie ist der Grund, warum niemand das Emoji-Fenster von Windows braucht.
     Damit sie das bleibt, muss sie zwei Dinge einhalten: kein Symbol doppelt
     (sonst sucht man zweimal dasselbe) und jede Reihe auf EINER Zeile - eine
     umbrechende Reihe schiebt die Gruppenbeschriftung von ihren Symbolen weg
     und macht aus der Ordnung wieder ein Suchbild. */
  {
    const platte = { "kalender-daten.json": JSON.stringify(START) };
    const p = await seite(b, platte);
    const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
    await verbinde(p);
    await p.waitForTimeout(600);
    await kopfzeile(p).click();
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "＋ Link" }).click();
    await p.waitForTimeout(400);

    const mass = await p.evaluate(() => {
      const alle = Array.from(document.querySelectorAll('button[title^="Symbol "]'));
      if (!alle.length) return null;
      const proReihe = new Map();
      for (const k of alle) {
        if (!proReihe.has(k.parentElement)) proReihe.set(k.parentElement, []);
        proReihe.get(k.parentElement).push(k);
      }
      const feld = alle[0].closest("div.rounded-lg").getBoundingClientRect();
      const reihen = Array.from(proReihe.values()).map((knoepfe) => ({
        zeilen: new Set(knoepfe.map((k) => Math.round(k.getBoundingClientRect().top))).size,
        rechts: Math.max(...knoepfe.map((k) => k.getBoundingClientRect().right)),
      }));
      const zaehler = {};
      for (const k of alle) zaehler[k.textContent] = (zaehler[k.textContent] || 0) + 1;
      return {
        anzahl: alle.length,
        gruppen: proReihe.size,
        mehrzeilig: reihen.filter((r) => r.zeilen > 1).length,
        ueberBreite: reihen.filter((r) => r.rechts > feld.right + 1).length,
        doppelte: Object.entries(zaehler).filter(([, n]) => n > 1).map(([z]) => z),
      };
    });

    pruef("(9) Die Symbolauswahl ist da", mass !== null && mass.anzahl > 0);
    if (mass) {
      pruef("(9) Es sind deutlich mehr als eine Handvoll Symbole", mass.anzahl >= 100, mass.anzahl + " Symbole in " + mass.gruppen + " Gruppen");
      pruef("(9) Kein Symbol kommt doppelt vor", mass.doppelte.length === 0, mass.doppelte.join(" "));
      pruef("(9) Jede Gruppe steht auf einer Zeile", mass.mehrzeilig === 0, mass.mehrzeilig + " umgebrochen");
      pruef("(9) Keine Reihe ragt aus dem Feld heraus", mass.ueberBreite === 0, mass.ueberBreite + " zu breit");
    }

    // Zeichen wie ⚙ oder ⚠ zeichnet Windows ohne den Zusatz U+FE0F schmal und
    // schwarzweiß. Geprüft wird, dass die Auswahl ihn mitliefert - sonst steht
    // mitten in der bunten Reihe ein blasses Zeichen.
    const ohneZusatz = await p.evaluate(() =>
      Array.from(document.querySelectorAll('button[title^="Symbol "]'))
        .map((k) => k.textContent)
        .filter((z) => Array.from(z).length === 1 && !/\p{Emoji_Presentation}/u.test(z)));
    pruef("(9) Textzeichen tragen den Zusatz für die bunte Darstellung",
          ohneZusatz.length === 0, ohneZusatz.join(" "));

    // Und das Gespeicherte trägt ihn auch - sonst sähe es auf dem zweiten
    // Rechner anders aus als auf dem, wo es angelegt wurde.
    await p.getByPlaceholder(/Bezeichnung/).fill("Warnhinweise");
    await p.getByPlaceholder(/Adresse oder Pfad/).fill("intranet.firma.de/warnung");
    await p.locator('button[title="Symbol ⚠️"]').click();
    await p.getByRole("button", { name: "Speichern" }).click();
    await p.waitForTimeout(1600);
    const gespeichert = linksInDatei(platte, "RC").find((l) => l.name === "Warnhinweise");
    pruef("(9) Das gespeicherte Symbol trägt den Zusatz",
          !!gespeichert && Array.from(gespeichert.symbol).length === 2,
          gespeichert ? JSON.stringify(gespeichert.symbol) : "nicht gespeichert");
    pruef("(9) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 1).join(" "));
    await p.context().close();
  }

  /* ---------------- (8) Über den Ausliefer-Dienst geöffnet ----------------
     Bisher lief alles über file:// - da gibt es niemanden, den man um das
     Öffnen einer Datei bitten könnte. Am Arbeitsplatz kommt die App aber über
     http://localhost:8765/ vom Dienst. Genau dann soll ein Klick auf einen
     Netzwerkpfad die Datei aufmachen statt nur den Pfad zu kopieren.
     Der Dienst wird hier durch abgefangene Anfragen dargestellt; geprüft wird
     die App-Seite: Wird gefragt, mit welchem Pfad, und was passiert danach. */
  {
    const html = fs.readFileSync("/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html", "utf8");
    const platte = {
      "kalender-daten.json": JSON.stringify({
        ...START,
        entries: [...START.entries, {
          id: "config|links", updatedAt: "2026-07-20T08:00:00.000Z",
          value: { inhaber: ["RC", "AR"], eintraege: [
            { id: "p1", inhaber: "RC", name: "Anleitung Presse", ziel: "\\\\scheudc1\\PSG\\Presse.pdf", symbol: "📘" },
            { id: "p2", inhaber: "RC", name: "Fehlt im Ordner", ziel: "\\\\scheudc1\\PSG\\weg.pdf", symbol: "📕" },
          ] },
        }],
      }),
    };
    // Ein echter kleiner Server statt abgefangener Anfragen: Nur so setzt der
    // Browser die Kopfzeile "Sec-Fetch-Site", auf die der Dienst seine
    // Zugangsprüfung stützt. Bei abgefangenen Anfragen fehlt sie - dann hätte
    // der Test die Prüfung stillschweigend übersprungen.
    const gefragt = [];
    const dienst = http.createServer((anfrage, antwort) => {
      const u = new URL(anfrage.url, "http://localhost");
      if (u.pathname === "/__oeffne") {
        const pfad = u.searchParams.get("pfad");
        gefragt.push({ pfad, herkunft: anfrage.headers["sec-fetch-site"] });
        const weg = /weg\.pdf$/.test(pfad || "");
        antwort.writeHead(weg ? 404 : 200, { "Content-Type": "text/plain; charset=utf-8" });
        antwort.end(weg ? "Nicht gefunden." : "geoeffnet");
        return;
      }
      antwort.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      antwort.end(html);
    });
    await new Promise((r) => dienst.listen(0, "127.0.0.1", r));
    const hafen = dienst.address().port;

    const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
    await p.exposeFunction("__lies", (n) => platte[n] ?? "");
    await p.exposeFunction("__schreib", (n, c) => { platte[n] = c; });
    await p.addInitScript(() => {
      const h = {
        name: "kalender-daten.json", kind: "file",
        async getFile() { const t = await window.__lies("kalender-daten.json"); return new File([t], "kalender-daten.json", { type: "application/json" }); },
        async createWritable() { let x = ""; return { async write(c) { x += c; }, async close() { await window.__schreib("kalender-daten.json", x); }, async abort() {} }; },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [h];
      window.showSaveFilePicker = async () => h;
    });
    await p.goto("http://localhost:" + hafen + "/");
    await p.waitForTimeout(1000);
    await verbinde(p);
    await p.waitForTimeout(600);
    await kopfzeile(p).click();
    await p.waitForTimeout(500);

    let neueSeiten = 0;
    ctx.on("page", () => { neueSeiten++; });
    // .first(): Der Link steht im Streifen UND - weil aufgeklappt - in der
    // Verwaltungsliste darunter. Gemeint ist der Chip im Streifen.
    await p.getByText("Anleitung Presse").first().click();
    await p.waitForTimeout(1200);

    pruef("(8) Der Klick fragt den Dienst nach der Datei", gefragt.length === 1, JSON.stringify(gefragt));
    pruef("(8) Der Pfad wird unverändert übergeben",
          gefragt[0] && gefragt[0].pfad === "\\\\scheudc1\\PSG\\Presse.pdf", gefragt[0] && gefragt[0].pfad);
    // Ohne diese Kopfzeile weist der Dienst ab - dann wäre der ganze Weg tot.
    pruef("(8) Die Anfrage trägt die Herkunft same-origin",
          gefragt[0] && gefragt[0].herkunft === "same-origin", gefragt[0] && gefragt[0].herkunft);
    pruef("(8) Es wird kein Browser-Tab geöffnet", neueSeiten === 0, neueSeiten + " neue Seiten");
    const nachOk = await p.locator("body").innerText();
    pruef("(8) Der Erfolg wird am Link gemeldet", /geöffnet/.test(nachOk),
          (nachOk.match(/✓[^\n]{0,40}/) || ["keine Meldung"])[0]);

    // Datei nicht mehr da: Das muss man sehen, statt vergeblich zu warten.
    await p.getByText("Fehlt im Ordner").first().click();
    await p.waitForTimeout(1200);
    const nachFehler = await p.locator("body").innerText();
    pruef("(8) Eine fehlende Datei wird als solche gemeldet", /nicht gefunden/i.test(nachFehler),
          (nachFehler.match(/✗[^\n]{0,50}/) || ["keine Meldung"])[0]);
    pruef("(8) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
    await ctx.close();
    await new Promise((r) => dienst.close(r));
  }

  await b.close();
  console.log(`\nHärte 36 (Linkbereich): ${ok}/${ok + fail}`);
  process.exit(fail ? 1 : 0);
})();
