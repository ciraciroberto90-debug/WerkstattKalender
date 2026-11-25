// Härtetest: TICKETS IM COCKPIT (Roll-out 85, Roberto 24.11.: "lass es uns bauen")
//
// Die gebaute App (Datei-Weg, also so, wie die Werkstatt heute arbeitet) gegen
// einen echten Dienst mit Wegwerf-Ordnern. Zwei Abteilungsleiter haben schon
// gemeldet (eine "Sofort"-Meldung, eine für "Wenn Zeit ist").
//
//  (K1) Reiter „Tickets“ mit roter Zahl = Zahl der neuen Meldungen (2).
//  (K2) Liste: beide Meldungen, die neueste oben; die Melde-Adresse wird genannt.
//       Seit dem 25.11. (Roberto: „wie eilig muss weg“, Spalte „ganz weg“) gibt es
//       KEINE Spalte „Eile“ und keine Eile-Marke mehr - auch nicht bei Tickets, die
//       am Server noch „sofort“ tragen; sortiert wird nicht mehr danach.
//  (K3) „Annehmen für Test Person“: am Server angenommen + zuständig + To-do-Kennung;
//       in der App ein To-do mit derselben Kennung, Ticket-Nummer, Person, OHNE Prio
//       (auch bei altem „sofort“) - gespeichert über den gewohnten Weg (persist).
//  (K4) Rückfrage: ohne Text ein Hinweis, mit Text steht sie am Server.
//  (K5) Antwort des Melders: Zeile zeigt „NEU vom Melder“, die rote Zahl zählt sie.
//  (K6) Erledigt mit Rückmeldung: am Server erledigt, in der App unter „Erledigt“.
//  (K7) Jemand anderes war schneller: „In Arbeit“ wird abgewiesen, die Zeile zeigt
//       den Server-Stand, am Server ist nichts überschrieben.
//  (K8) Der übrige Bestand ist unberührt: außer den zwei To-dos kam kein Eintrag dazu,
//       die Schicht-Einträge stehen wie vorher.
//  (K9) Leser sehen den Reiter nicht und fragen den Server nicht nach Tickets.
//  (K10) Ohne bekannte Server-Adresse: Hinweis statt Liste, kein Abruf nach außen.
//        Das Adressfeld des Verwalters ist vorbelegt und „Merken“ ist bedienbar
//        (Robertos Bild 24.11.: der graue Beispieltext sah aus wie ausgefüllt).
//  (K11) Dienst weg: gelber Balken, die Liste bleibt stehen.
//  (E)  Keine Skriptfehler.
//
// Rot-Nachweis: APP_PFAD=<Bau vor Roll-out 85> -> K1 rot (kein Reiter „Tickets“).
// Rot-Nachweis 25.11.: APP_PFAD=<Bau mit Spalte „Eile“> -> K2, K3 (Prio), K10 rot.
const UMG = require("../umgebung"); // Repo-Ort, App-Datei, Browser (Roll-out 73)
const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const APP = UMG.APP;
let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };

const PORT = 20765 + Math.floor(Math.random() * 1000);
const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), "bta-harte115-"));
const einst = {
  port: PORT, host: "127.0.0.1", appDatei: path.join(ORDNER, "app", "Werkstatt_Kalender_TPM.html"),
  protokollOrdner: path.join(ORDNER, "protokoll"), sicherungOrdner: path.join(ORDNER, "sicherung"), sicherungUhrzeit: "99:99",
  standorte: { scheurich: { name: "Scheurich", datenOrdner: path.join(ORDNER, "BTA-Scheurich") } },
};
fs.writeFileSync(path.join(ORDNER, "einstellungen.json"), JSON.stringify(einst));
const B = `http://127.0.0.1:${PORT}`;
const holen = async (weg, opt) => { const r = await fetch(B + weg, opt); let k = null; try { k = await r.json(); } catch (e) { k = null; } return { status: r.status, k }; };
const post = (weg, daten, kopf = {}) => holen(weg, { method: "POST", headers: { "Content-Type": "application/json", ...kopf }, body: JSON.stringify(daten) });
const KA = "a".repeat(32), KB = "b".repeat(32);
let kind = null;

(async () => {
  kind = spawn(process.execPath, ["--no-warnings", path.join(UMG.WURZEL, "server", "dienst.js"), path.join(ORDNER, "einstellungen.json")], { stdio: "ignore" });
  let bereit = false;
  for (let i = 0; i < 80 && !bereit; i++) { await new Promise((r) => setTimeout(r, 100)); try { bereit = (await fetch(B + "/api/status")).ok; } catch (e) { /* noch nicht */ } }
  if (!bereit) { console.log("FAIL | Dienst kam nicht hoch"); kind.kill(); process.exit(1); }

  // Reihenfolge mit Absicht: erst die alte „Sofort“-Meldung, dann die jüngere. Ein Bau,
  // der noch nach Eile sortiert, zeigt „sofort“ oben - der neue zeigt die jüngste oben.
  const sofort = (await post("/api/scheurich/tickets", { art: "Anlage / Maschine", ort: "Anlage B2", text: "Band steht\nseit der Spätschicht", eile: "sofort", melder: "K. Muster", abteilung: "Glasur" }, { "X-BTA-Melder": KB })).k.ticket;
  await new Promise((r) => setTimeout(r, 50)); // die Eingangszeit soll sich sicher unterscheiden
  const zeit = (await post("/api/scheurich/tickets", { art: "Gebäude", ort: "Halle 3, Tor 2", text: "Defektes Fenster", eile: "zeit", melder: "M. Beispiel", abteilung: "Versand" }, { "X-BTA-Melder": KA })).k.ticket;

  const browser = await chromium.launch({ executablePath: UMG.CHROMIUM, headless: true, args: ["--no-sandbox"] });
  const vorbereiten = (wer) => (name) => {
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("bta-standort", "scheurich");
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify({ tpmAnlagen: [], riItems: [], team: [{ name: "Test Person", rolle: "mech" }, { name: "Zweite Kraft", rolle: "elek" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }, { name: "Lena", rolle: "leser", kennwortHash: "" }] }));
    if (!localStorage.getItem("werkstatt-kalender-entries")) localStorage.setItem("werkstatt-kalender-entries", JSON.stringify([{ id: "schicht-t|Test Person|2026-11-24", date: "2026-11-24", category: "SCHICHT", name: "Test Person", scope: "tag", wert: "Früh" }]));
    localStorage.setItem("werkstatt-kalender-benutzer", name);
    localStorage.setItem("werkstatt-kalender-name", name);
  };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
  await p.addInitScript(vorbereiten(), "Chef");
  await p.goto(APP + "?ticketserver=" + encodeURIComponent(B));
  const eintraege = async (seite = p) => seite.evaluate(() => JSON.parse(localStorage.getItem("werkstatt-kalender-entries") || "[]"));
  const amServer = async (nr) => (await holen(`/api/scheurich/tickets/${nr}`)).k.ticket;
  const zeile = (nr) => p.locator(`tr[data-ticket="${nr}"]`);

  /* (K1) */
  const reiter = p.locator('button[data-hauptbereich="TICKETS"]');
  let da = true; try { await reiter.waitFor({ timeout: 8000 }); } catch (e) { da = false; }
  let zahl = "";
  if (da) { try { await p.locator('[data-hauptbereich-zahl="TICKETS"]').waitFor({ timeout: 8000 }); zahl = await p.locator('[data-hauptbereich-zahl="TICKETS"]').innerText(); } catch (e) { zahl = "(keine)"; } }
  ok("(K1) Reiter „Tickets“ mit roter 2", da && zahl === "2", da ? "Zahl " + zahl : "Reiter fehlt");
  if (!da) { console.log(`\n${pass} PASS, ${fail} FAIL`); await browser.close(); kind.kill(); process.exit(1); }

  /* (K2) */
  await reiter.click();
  await zeile(sofort.nr).waitFor({ timeout: 8000 });
  const reihenfolge = await p.locator("tr[data-ticket]").evaluateAll((z) => z.map((x) => x.dataset.ticket));
  const meldeAdresse = await p.locator("[data-tickets-meldeadresse]").innerText();
  ok("(K2) Beide Meldungen da, die neueste oben; Melde-Adresse genannt", reihenfolge.length === 2 && reihenfolge[0] === zeit.nr && meldeAdresse === B + "/melden", reihenfolge.join(",") + " | " + meldeAdresse);
  const spalten = await p.locator("[data-tickets] thead th").evaluateAll((z) => z.map((x) => x.textContent.trim()));
  const tabellenText = (await p.locator("[data-tickets] tbody").innerText()).replace(/\s+/g, " ");
  ok("(K2) Keine Spalte „Eile“, keine Eile-Marke in den Zeilen", spalten.length === 5 && !spalten.some((s) => /eile/i.test(s)) && !/Sofort|Diese Woche|Wenn Zeit ist/.test(tabellenText), spalten.join(" | "));

  /* (K3) */
  await zeile(sofort.nr).locator("select[data-ticket-annehmen]").selectOption("Test Person");
  await p.waitForFunction((nr) => { const z = document.querySelector(`tr[data-ticket="${nr}"]`); return z && z.dataset.ticketStand === "angenommen" && z.querySelector("[data-ticket-todo]"); }, sofort.nr, { timeout: 10000 });
  let s1 = await amServer(sofort.nr);
  let alle = await eintraege();
  const todo = alle.find((e) => e.category === "TODO" && e.id === s1.todoId);
  ok("(K3) Server: angenommen, zuständig Test Person, To-do-Kennung, Verlauf nennt „Chef“", s1.stand === "angenommen" && s1.zustaendig === "Test Person" && /^todo-/.test(s1.todoId) && s1.verlauf.slice(-1)[0].wer === "Chef", JSON.stringify(s1.verlauf.slice(-1)[0]));
  ok("(K3) App: To-do mit derselben Kennung, Nummer im Titel, Person, ohne Prio, Melder in der Bemerkung", !!todo && todo.name === `Ticket ${sofort.nr}: Band steht` && todo.wer === "Test Person" && todo.prio === "" && todo.ticketNr === sofort.nr && todo.status === "offen" && /Gemeldet von K\. Muster \(Glasur\)/.test(todo.bemerkung) && /seit der Spätschicht/.test(todo.bemerkung), todo ? todo.name : "kein To-do");

  /* (K4) */
  await zeile(zeit.nr).locator('[data-ticket-tu="frage"]').click();
  await zeile(zeit.nr).locator("[data-ticket-eingabe-senden]").click();
  const hinweis = await zeile(zeit.nr).locator("[data-ticket-meldung]").innerText();
  await zeile(zeit.nr).locator("[data-ticket-eingabe]").fill("Welches Fenster genau?");
  await zeile(zeit.nr).locator("[data-ticket-eingabe-senden]").click();
  await p.waitForFunction((nr) => document.querySelector(`tr[data-ticket="${nr}"]`).dataset.ticketStand === "frage", zeit.nr, { timeout: 10000 });
  let z1 = await amServer(zeit.nr);
  ok("(K4) Rückfrage: leer -> Hinweis; mit Text am Server (Stand frage)", /Frage an den Melder/.test(hinweis) && z1.stand === "frage" && z1.antwort === "Welches Fenster genau?", hinweis);

  /* (K5) */
  await post(`/api/scheurich/tickets/${zeit.nr}/antwort`, { text: "Das neben Tor 2" }, { "X-BTA-Melder": KA });
  await p.getByRole("button", { name: "↻ Aktualisieren" }).click();
  await zeile(zeit.nr).locator("[data-ticket-melderantwort]").waitFor({ timeout: 10000 });
  const antwortText = await zeile(zeit.nr).locator("[data-ticket-melderantwort]").innerText();
  zahl = await p.locator('[data-hauptbereich-zahl="TICKETS"]').innerText();
  ok("(K5) Antwort des Melders: „NEU vom Melder“, rote Zahl 1 (neu vom Melder)", /NEU vom Melder: Das neben Tor 2/.test(antwortText) && zahl === "1", antwortText + " | Zahl " + zahl);

  /* (K6) */
  await zeile(zeit.nr).locator('[data-ticket-tu="erledigt"]').click();
  await zeile(zeit.nr).locator("[data-ticket-eingabe]").fill("Scheibe getauscht.");
  await zeile(zeit.nr).locator("[data-ticket-eingabe-senden]").click();
  await p.waitForFunction((nr) => !document.querySelector(`tr[data-ticket="${nr}"]`), zeit.nr, { timeout: 10000 }); // Filter „Offen“ blendet es aus
  z1 = await amServer(zeit.nr);
  await p.locator('[data-tickets-filter="erledigt"]').click();
  const beiErledigt = await zeile(zeit.nr).count();
  await p.locator('[data-tickets-filter="offen"]').click();
  ok("(K6) Erledigt: Server erledigt mit Rückmeldung, Kennzeichen aus; in der App unter „Erledigt“", z1.stand === "erledigt" && z1.antwort === "Scheibe getauscht." && z1.neuVomMelder === false && beiErledigt === 1 && (await p.locator('[data-hauptbereich-zahl="TICKETS"]').count()) === 0);

  /* (K7) */
  await post(`/api/scheurich/tickets/${sofort.nr}`, { stand: "frage", antwort: "Von einem anderen Rechner", wer: "Anderer" });
  await zeile(sofort.nr).locator('[data-ticket-tu="arbeit"]').click();
  await zeile(sofort.nr).locator("[data-ticket-meldung]").waitFor({ timeout: 10000 });
  const konflikt = await zeile(sofort.nr).locator("[data-ticket-meldung]").innerText();
  s1 = await amServer(sofort.nr);
  ok("(K7) Konflikt: Hinweis, Zeile zeigt den Server-Stand (frage), am Server nichts überschrieben", /Jemand anderes/.test(konflikt) && (await zeile(sofort.nr).getAttribute("data-ticket-stand")) === "frage" && s1.stand === "frage" && s1.antwort === "Von einem anderen Rechner", konflikt.slice(0, 60));

  /* (K8) */
  alle = await eintraege();
  const fachlich = alle.filter((e) => !String(e.id).startsWith("log|") && !String(e.id).startsWith("config|"));
  ok("(K8) Bestand unberührt: 1 Schicht + 1 To-do, kein Ticket in den Einträgen", fachlich.length === 2 && fachlich.filter((e) => e.category === "SCHICHT").length === 1 && fachlich.find((e) => e.category === "SCHICHT").wert === "Früh" && !fachlich.some((e) => e.category === "TICKET"), fachlich.map((e) => e.category).join(","));

  /* (K9) */
  const ctxL = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pl = await ctxL.newPage();
  const abrufeL = []; pl.on("request", (q) => { if (/\/tickets/.test(q.url())) abrufeL.push(q.url()); });
  await pl.addInitScript(vorbereiten(), "Lena");
  await pl.goto(APP + "?ticketserver=" + encodeURIComponent(B));
  await pl.waitForTimeout(2500);
  const istLeser = await pl.evaluate(() => !document.querySelector('button[data-hauptbereich="AUFNAHME"]'));
  ok("(K9) Leser: kein Reiter „Tickets“, kein Abruf der Tickets", istLeser && (await pl.locator('button[data-hauptbereich="TICKETS"]').count()) === 0 && abrufeL.length === 0, `Leser erkannt: ${istLeser}, Abrufe: ${abrufeL.length}`);
  await ctxL.close();

  /* (K10) */
  const ctxO = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const po = await ctxO.newPage();
  const aussen = []; po.on("request", (q) => { if (/^https?:/.test(q.url())) aussen.push(q.url()); });
  await po.addInitScript(vorbereiten(), "Chef");
  await po.goto(APP);
  await po.locator('button[data-hauptbereich="TICKETS"]').click({ timeout: 8000 });
  await po.locator("[data-tickets-ohne-server]").waitFor({ timeout: 8000 });
  await po.waitForTimeout(1500);
  const vorbelegt = await po.locator("[data-tickets-adresse]").inputValue();
  const merkenBedienbar = await po.locator("[data-tickets-adresse-merken]").isEnabled();
  ok("(K10) Ohne Server-Adresse: Hinweis mit Eingabefeld (Verwalter), kein einziger Abruf nach außen", (await po.locator("[data-tickets-adresse]").count()) === 1 && aussen.length === 0, aussen.join(", "));
  ok("(K10) Adressfeld vorbelegt, „Merken“ bedienbar - und trotzdem kein Abruf, solange niemand klickt", vorbelegt === "http://v-btacockpit-1:8765" && merkenBedienbar && aussen.length === 0, vorbelegt + " | Merken: " + merkenBedienbar);
  await ctxO.close();

  /* (K11) */
  await new Promise((r) => { kind.once("exit", r); kind.kill(); });
  await p.getByRole("button", { name: "↻ Aktualisieren" }).click();
  await p.locator("[data-tickets-fehler]").waitFor({ timeout: 20000 });
  const balken = await p.locator("[data-tickets-fehler]").innerText();
  ok("(K11) Dienst weg: gelber Balken „antwortet nicht“ mit letztem Stand, die Zeile bleibt stehen", /antwortet nicht/.test(balken) && /Stand von/.test(balken) && (await zeile(sofort.nr).count()) === 1, balken);

  ok("(E) Keine Skriptfehler", fehler.length === 0, fehler.join("; "));
  await browser.close();
  try { fs.rmSync(ORDNER, { recursive: true, force: true }); } catch (e) { /* Windows hält die Datenbank manchmal noch kurz fest */ }
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FAIL | Abbruch: " + (e && e.stack || e)); try { if (kind) kind.kill(); } catch (x) { /* schon beendet */ } process.exit(1); });
