// Prüfstand: TICKETS (Dienst 0.7.0, Roll-out 85) und Status-Seite (Roll-out 86)
//
// Startet den echten Dienst mit Wegwerf-Ordnern und MIT Werkstatt-Schlüssel -
// so ist bewiesen, dass die Melde-Seite ohne Schlüssel melden darf, die Liste
// der Werkstatt aber nicht ohne zu lesen ist.
//
//  Schnittstelle
//  (T1)  Status kennt die Tickets (0 offen); die Fassung ist die aus dienst.js.
//  (T2)  Melden OHNE Werkstatt-Schlüssel: Nummer <Jahr>-0001, Stand „neu“.
//  (T3)  Unvollständige Meldung: 400, jede fehlende Angabe wird genannt, nichts gespeichert.
//  (T4)  „Meine Meldungen“: Browser A sieht nur seine, Browser B nur seine.
//  (T5)  Liste der Werkstatt: ohne Schlüssel 401, mit Schlüssel alle + Zahlen.
//  (T6)  Annehmen: Stand, Zuständiger, To-do-Kennung, Verlauf; ohne Schlüssel 401;
//        unbekannter Stand 400; unbekannte Nummer 404.
//  (T7)  Zwei Rechner ändern dasselbe Ticket: der zweite bekommt 409 und den
//        Server-Stand, nichts wird überschrieben.
//  (T8)  Rückfrage -> der Melder antwortet (nur der richtige Browser) -> zurück
//        an die Werkstatt mit Kennzeichen; nächste Werkstatt-Änderung löscht es.
//  (T9)  Foto: Datei liegt am Server, Melder und Werkstatt bekommen sie, ein
//        fremder Browser nicht; eine Textdatei als „Bild“ wird abgewiesen.
//  (T10) Zehn Meldungen gleichzeitig: zehn verschiedene, lückenlose Nummern.
//  (T11) Der Abgleich der Cockpit-Rechner ist unberührt: Version 0, Stand und
//        Export leer - trotz aller Tickets.
//  (T12) Standorte getrennt: Soendgen zählt für sich ab 0001.
//  (T13) Sicherung: die Datenbank-Kopie enthält dieselben Tickets.
//  (T14) Bremse: mehr als ticketsJe10Min von einem Rechner -> 429.
//  (T15) /melden: 404 ohne hinterlegte Seite; mit Seite ist der Standort
//        eingesetzt; unbekannter Standort 404.
//  (T16) Neustart: Tickets sind noch da, die Nummer zählt weiter.
//  (S1)  Roll-out 86: Fehler, die älter als 24 Stunden sind, stehen NICHT mehr
//        in der Liste der Status-Seite - auch wenn kein neuer Fehler dazukam.
//
//  Die Melde-Seite im Browser (Chromium gegen den echten Dienst)
//  (B1)  Leer abschicken nennt, was fehlt (auch Name und Abteilung).
//  (B2)  Meldung „Defektes Fenster“ -> Dank mit Nummer; kein einziger Abruf
//        geht an eine andere Adresse als den Dienst.
//  (B3)  „Meine Meldungen“ zeigt sie als „Neu · wartet auf die Werkstatt“.
//  (B4)  Rückfrage der Werkstatt: rote Zahl am Reiter, Antwortfeld; die Antwort
//        kommt am Server an.
//  (B5)  Nach dem Neuladen kennt der Browser Name und Abteilung noch.
//  (B6)  Foto auswählen -> Vorschau -> mitgeschickt -> „Foto zeigen“ zeigt es.
//  (B7)  390 px Breite: kein seitliches Rollen; keine Skriptfehler.
//  (B8)  Ein zweiter Browser sieht keine fremden Meldungen.
//  (B9)  Dienst weg: „NICHT angekommen“, der Text bleibt im Formular.
//
// Rot-Nachweis: DIENST_ORDNER=<Ordner mit dienst.js/db.js vom Stand 0.6.1>
// node --no-warnings tests/server/pruefe-tickets.js  -> T1 ff. rot (kein Ticket-Weg),
// S1 rot (alte Fehler bleiben stehen).
const UMG = require("../umgebung");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright-core");
const { DatabaseSync } = require("node:sqlite");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const WURZEL = UMG.WURZEL;
const DIENST_ORDNER = process.env.DIENST_ORDNER || path.join(WURZEL, "server");
const DIENST = path.join(DIENST_ORDNER, "dienst.js");
const SEITE = path.join(WURZEL, "melden", "ticket-melden.html");
const PORT = 19765 + Math.floor(Math.random() * 1000);
const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), "bta-tickets-"));
const APP_ORDNER = path.join(ORDNER, "app");
const SCHLUESSEL = "pruef-schluessel";
const einst = {
  port: PORT, host: "127.0.0.1", appDatei: path.join(APP_ORDNER, "Werkstatt_Kalender_TPM.html"),
  protokollOrdner: path.join(ORDNER, "protokoll"), sicherungOrdner: path.join(ORDNER, "sicherung"), sicherungUhrzeit: "99:99", sicherungBehalten: 3,
  schluessel: SCHLUESSEL, ticketsJe10Min: 45,
  standorte: { scheurich: { name: "Scheurich", datenOrdner: path.join(ORDNER, "BTA-Scheurich") }, soendgen: { name: "Soendgen Keramik", datenOrdner: path.join(ORDNER, "BTA-Soendgen") } },
};
fs.mkdirSync(APP_ORDNER, { recursive: true });
fs.writeFileSync(path.join(ORDNER, "einstellungen.json"), JSON.stringify(einst));
const B = `http://127.0.0.1:${PORT}`;
const holen = async (weg, opt) => { const r = await fetch(B + weg, opt); let k = null; try { k = await r.json(); } catch (e) { k = null; } return { status: r.status, k }; };
const KA = "a".repeat(32), KB = "b".repeat(32); // zwei Browser-Kennungen
const alsMelder = (k) => ({ "X-BTA-Melder": k });
const alsWerkstatt = { "X-BTA-Schluessel": SCHLUESSEL };
const post = (weg, daten, kopf) => holen(weg, { method: "POST", headers: { "Content-Type": "application/json", ...kopf }, body: JSON.stringify(daten) });
let gemeldet = 0; // zählt die Meldungen von 127.0.0.1 für die Bremse (T14)
const melde = (st, kennung, mehr = {}) => { gemeldet++; return post(`/api/${st}/tickets`, { art: "Gebäude", ort: "Halle 3, Tor 2", text: "Defektes Fenster", eile: "woche", melder: "M. Beispiel", abteilung: "Versand", ...mehr }, alsMelder(kennung)); };
const JAHR = new Date().getFullYear();
// 1x1-PNG (rot) - das kleinste echte Bild
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

let laufendesKind = null; // damit ein Abbruch mitten im Lauf keinen Dienst zurücklässt
function starteDienst() {
  const kind = laufendesKind = spawn(process.execPath, ["--no-warnings", DIENST, path.join(ORDNER, "einstellungen.json")], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DIENST_LAUT: "1" } });
  kind.ausgabe = ""; kind.stdout.on("data", (d) => { kind.ausgabe += d; }); kind.stderr.on("data", (d) => { kind.ausgabe += d; });
  return kind;
}
async function warteAufDienst(kind) {
  for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 100)); try { if ((await fetch(B + "/api/status")).ok) return true; } catch (e) { /* noch nicht */ } }
  console.log("FAIL | Dienst kam nicht hoch\n" + kind.ausgabe); kind.kill(); process.exit(1);
}
const beende = (kind) => new Promise((r) => { kind.once("exit", r); kind.kill(); });

(async () => {
  let kind = starteDienst();
  await warteAufDienst(kind);

  /* (T1) */
  let s = (await holen("/api/status")).k;
  const FASSUNG = require(DIENST).FASSUNG;
  ok("(T1) Status kennt Tickets je Standort (0 offen), Fassung " + FASSUNG, s.fassung === FASSUNG && s.standorte.scheurich.tickets && s.standorte.scheurich.tickets.offen === 0 && s.standorte.soendgen.tickets.gesamt === 0, JSON.stringify(s.standorte.scheurich.tickets));

  /* (T2) */
  let r = await melde("scheurich", KA);
  const t1 = r.k && r.k.ticket;
  ok("(T2) Melden ohne Werkstatt-Schlüssel -> " + JAHR + "-0001, Stand neu", r.status === 200 && t1 && t1.nr === JAHR + "-0001" && t1.stand === "neu" && t1.melder === "M. Beispiel" && t1.abteilung === "Versand" && t1.verlauf.length === 1, JSON.stringify(r.k).slice(0, 140));
  ok("(T2) Die Kennung des Browsers steht NICHT im Ticket", t1 && !JSON.stringify(t1).includes(KA));

  /* (T3) */
  gemeldet++;
  r = await post("/api/scheurich/tickets", { art: "", ort: " ", text: "", eile: "irgendwann", melder: "", abteilung: "" }, alsMelder(KA));
  ok("(T3) Leere Meldung -> 400, alle sechs Angaben genannt", r.status === 400 && r.k.fehlt.length === 6 && /Worum es geht fehlt/.test(r.k.fehler) && /Wie eilig fehlt/.test(r.k.fehler), JSON.stringify(r.k));
  gemeldet++;
  r = await post("/api/scheurich/tickets", { art: "Gebäude", ort: "Halle 1", text: "x".repeat(2001), eile: "zeit", melder: "A", abteilung: "B" }, alsMelder(KA));
  ok("(T3) Zu langer Text -> 400 mit Hinweis, nichts wird still gekürzt", r.status === 400 && /zu lang/.test(r.k.fehler), r.k && r.k.fehler);
  gemeldet++;
  r = await post("/api/scheurich/tickets", { art: "Gebäude", ort: "Halle 1", text: "ohne Kennung", eile: "zeit", melder: "A", abteilung: "B" }, {});
  ok("(T3) Ohne Browser-Kennung -> 400", r.status === 400 && /Kennung/.test(r.k.fehler), r.k && r.k.fehler);
  ok("(T3) Nichts davon gespeichert: A hat weiter genau 1 Meldung", (await holen("/api/scheurich/tickets", { headers: alsMelder(KA) })).k.tickets.length === 1);

  /* (T4) */
  await melde("scheurich", KA, { text: "Lampe flackert", art: "Strom / Licht", eile: "zeit" });
  const rb = await melde("scheurich", KB, { text: "Band ruckelt", art: "Anlage / Maschine", eile: "sofort", melder: "K. Muster", abteilung: "Glasur" });
  const meineA = (await holen("/api/scheurich/tickets", { headers: alsMelder(KA) })).k.tickets;
  const meineB = (await holen("/api/scheurich/tickets", { headers: alsMelder(KB) })).k.tickets;
  ok("(T4) Browser A sieht seine 2, Browser B seine 1 - keiner die des anderen", meineA.length === 2 && meineA.every((t) => t.melder === "M. Beispiel") && meineB.length === 1 && meineB[0].text === "Band ruckelt" && rb.k.ticket.nr === JAHR + "-0003", meineA.map((t) => t.nr).join(",") + " | " + meineB.map((t) => t.nr).join(","));

  /* (T5) */
  r = await holen("/api/scheurich/tickets");
  ok("(T5) Liste der Werkstatt ohne Schlüssel -> 401", r.status === 401, String(r.status));
  r = await holen("/api/scheurich/tickets", { headers: alsWerkstatt });
  ok("(T5) Mit Schlüssel: alle 3, Zahlen 3 offen / 3 neu", r.status === 200 && r.k.tickets.length === 3 && r.k.zahlen.offen === 3 && r.k.zahlen.neu === 3, JSON.stringify(r.k.zahlen));

  /* (T6) */
  const nr1 = JAHR + "-0001";
  r = await post(`/api/scheurich/tickets/${nr1}`, { stand: "angenommen", zustaendig: "L Becker", todoId: "todo-123", wer: "Roberto" }, {});
  ok("(T6) Annehmen ohne Schlüssel -> 401", r.status === 401, String(r.status));
  r = await post(`/api/scheurich/tickets/${nr1}`, { stand: "angenommen", zustaendig: "L Becker", todoId: "todo-123", wer: "Roberto" }, alsWerkstatt);
  const t1a = r.k && r.k.ticket;
  ok("(T6) Annehmen: Stand, Zuständiger, To-do, Verlauf mit Namen", r.status === 200 && t1a.stand === "angenommen" && t1a.zustaendig === "L Becker" && t1a.todoId === "todo-123" && t1a.verlauf.length === 2 && t1a.verlauf[1].wer === "Roberto" && /zugeteilt an L Becker/.test(t1a.verlauf[1].was), JSON.stringify(t1a && t1a.verlauf[1]));
  ok("(T6) Unbekannter Stand -> 400, unbekannte Nummer -> 404", (await post(`/api/scheurich/tickets/${nr1}`, { stand: "vielleicht" }, alsWerkstatt)).status === 400 && (await post(`/api/scheurich/tickets/${JAHR}-9999`, { stand: "arbeit" }, alsWerkstatt)).status === 404);

  /* (T7) */
  r = await post(`/api/scheurich/tickets/${nr1}`, { stand: "arbeit", wer: "Rechner 1", basisGeaendert: t1a.geaendert }, alsWerkstatt);
  const r2 = await post(`/api/scheurich/tickets/${nr1}`, { stand: "erledigt", antwort: "fertig", wer: "Rechner 2", basisGeaendert: t1a.geaendert }, alsWerkstatt);
  const jetzt1 = (await holen(`/api/scheurich/tickets/${nr1}`, { headers: alsWerkstatt })).k.ticket;
  ok("(T7) Zweiter Rechner mit altem Stand -> 409 mit dem Server-Stand; nichts überschrieben", r.status === 200 && r2.status === 409 && r2.k.ticket.stand === "arbeit" && jetzt1.stand === "arbeit" && jetzt1.antwort === "", r2.status + " " + jetzt1.stand);

  /* (T8) */
  r = await post(`/api/scheurich/tickets/${nr1}`, { stand: "frage", antwort: "Welches Fenster genau?", wer: "L Becker" }, alsWerkstatt);
  let beimMelder = (await holen("/api/scheurich/tickets", { headers: alsMelder(KA) })).k.tickets.find((t) => t.nr === nr1);
  ok("(T8) Rückfrage steht beim Melder", r.status === 200 && beimMelder.stand === "frage" && beimMelder.antwort === "Welches Fenster genau?");
  r = await post(`/api/scheurich/tickets/${nr1}/antwort`, { text: "Das neben Tor 2" }, alsMelder(KB));
  ok("(T8) Ein fremder Browser kann nicht antworten -> 404", r.status === 404, String(r.status));
  r = await post(`/api/scheurich/tickets/${nr1}/antwort`, { text: "  " }, alsMelder(KA));
  ok("(T8) Leere Antwort -> 400", r.status === 400);
  r = await post(`/api/scheurich/tickets/${nr1}/antwort`, { text: "Das neben Tor 2" }, alsMelder(KA));
  ok("(T8) Antwort des Melders: zurück an die Werkstatt (angenommen), Kennzeichen gesetzt", r.status === 200 && r.k.ticket.stand === "angenommen" && r.k.ticket.neuVomMelder === true && r.k.ticket.melderAntwort === "Das neben Tor 2" && r.k.ticket.verlauf.slice(-1)[0].was === "Antwort vom Melder");
  r = await post(`/api/scheurich/tickets/${nr1}`, { stand: "erledigt", antwort: "Scheibe getauscht.", wer: "L Becker" }, alsWerkstatt);
  ok("(T8) Erledigt: Kennzeichen wieder aus, Antwort steht, Zahlen 2 offen", r.k.ticket.stand === "erledigt" && r.k.ticket.neuVomMelder === false && (await holen("/api/scheurich/tickets", { headers: alsWerkstatt })).k.zahlen.offen === 2);

  /* (T9) */
  r = await melde("scheurich", KA, { text: "Mit Foto", foto: "data:image/png;base64," + PNG.toString("base64") });
  const tf = r.k.ticket;
  const fotoPfad = path.join(einst.standorte.scheurich.datenOrdner, "ticket-fotos", tf.foto || "fehlt");
  ok("(T9) Foto liegt als Datei am Server, byte-gleich", r.status === 200 && tf.foto === tf.nr + ".png" && fs.existsSync(fotoPfad) && fs.readFileSync(fotoPfad).equals(PNG), tf.foto);
  const fotoHolen = async (kopf) => { const x = await fetch(`${B}/api/scheurich/tickets/${tf.nr}/foto`, { headers: kopf }); return { status: x.status, bytes: x.ok ? Buffer.from(await x.arrayBuffer()) : null }; };
  const fa = await fotoHolen(alsMelder(KA)), fb = await fotoHolen(alsMelder(KB)), fw = await fotoHolen(alsWerkstatt);
  ok("(T9) Melder und Werkstatt bekommen das Foto, ein fremder Browser nicht (401)", fa.status === 200 && fa.bytes.equals(PNG) && fw.status === 200 && fb.status === 401, [fa.status, fb.status, fw.status].join("/"));
  gemeldet++;
  r = await post("/api/scheurich/tickets", { art: "Gebäude", ort: "Halle 1", text: "falsches Bild", eile: "zeit", melder: "A", abteilung: "B", foto: "data:image/jpeg;base64," + Buffer.from("Das ist kein Bild").toString("base64") }, alsMelder(KA));
  ok("(T9) Textdatei als „Bild“ -> 400", r.status === 400 && /kein Bild/.test(r.k.fehler), r.k && r.k.fehler);

  /* (T10) */
  const vorher = (await holen("/api/scheurich/tickets", { headers: alsWerkstatt })).k.zahlen.gesamt;
  const zehn = await Promise.all(Array.from({ length: 10 }, (_, i) => melde("scheurich", KB, { text: "gleichzeitig " + i })));
  const nummern = zehn.map((x) => x.k && x.k.ticket && x.k.ticket.nr).sort();
  const erwartet = Array.from({ length: 10 }, (_, i) => JAHR + "-" + String(vorher + 1 + i).padStart(4, "0"));
  ok("(T10) Zehn Meldungen gleichzeitig: zehn verschiedene, lückenlose Nummern", JSON.stringify(nummern) === JSON.stringify(erwartet), nummern[0] + " … " + nummern[9]);

  /* (T11) */
  const stand = (await holen("/api/scheurich/stand?seit=0")).k;
  const ex = (await holen("/api/scheurich/export.json")).k;
  ok("(T11) Abgleich unberührt: Version 0, Stand leer, Export leer", stand.version === 0 && stand.eintraege.length === 0 && stand.stoerungen.length === 0 && ex.entries.length === 0 && ex.schreibMarke === "server-0", "Version " + stand.version);

  /* (T12) */
  r = await melde("soendgen", KA, { text: "Soendgen meldet" });
  ok("(T12) Soendgen zählt für sich: " + JAHR + "-0001; Scheurich sieht es nicht", r.k.ticket.nr === JAHR + "-0001" && !(await holen("/api/scheurich/tickets", { headers: alsWerkstatt })).k.tickets.some((t) => t.text === "Soendgen meldet"));

  /* (T13) */
  r = await post("/api/scheurich/sicherung", {}, alsWerkstatt);
  const kopie = r.k.ergebnis.find((x) => x.standort === "scheurich").datenbank;
  const db = new DatabaseSync(kopie);
  let inKopie = -1; try { inKopie = db.prepare("SELECT COUNT(*) AS n FROM tickets").get().n; } catch (e) { inKopie = -1; } db.close();
  ok("(T13) Die Sicherungs-Kopie enthält dieselben Tickets", inKopie === vorher + 10, inKopie + " von " + (vorher + 10));

  /* (T15) vor der Bremse, solange noch Meldungen frei sind */
  r = await holen("/melden");
  ok("(T15) /melden ohne hinterlegte Seite -> 404 mit Hinweis", r.status === 404 && /ticket-melden\.html/.test(r.k.fehler));
  fs.copyFileSync(SEITE, path.join(APP_ORDNER, "ticket-melden.html"));
  const seite = await (await fetch(B + "/melden")).text();
  const seiteSo = await (await fetch(B + "/melden/soendgen")).text();
  ok("(T15) /melden: Standort eingesetzt (scheurich), kein Platzhalter übrig; /melden/soendgen entsprechend", /data-standort="scheurich"/.test(seite) && /data-standort-name="Scheurich"/.test(seite) && !/__BTA_/.test(seite) && /data-standort="soendgen"/.test(seiteSo) && /Soendgen Keramik/.test(seiteSo));
  ok("(T15) /melden/irgendwo -> 404; Status-Seite nennt Tickets und Melde-Seite", (await holen("/melden/irgendwo")).status === 404 && /Tickets \(Meldungen an die Werkstatt\)/.test(await (await fetch(B + "/status")).text()) && /\/melden\/scheurich/.test(await (await fetch(B + "/status")).text()));

  /* ---------- Die Melde-Seite im Browser ---------- */
  const browser = await chromium.launch({ executablePath: UMG.CHROMIUM, headless: true, args: ["--no-sandbox"] });
  const kontext = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const p = await kontext.newPage();
  const skriptfehler = []; p.on("pageerror", (e) => skriptfehler.push(e.message));
  const fremd = []; p.on("request", (q) => { if (!q.url().startsWith(B) && !q.url().startsWith("data:") && !q.url().startsWith("blob:")) fremd.push(q.url()); });
  await p.goto(B + "/melden");

  /* (B1) */
  await p.locator("#senden").click();
  const fehlt = await p.locator("#fehlt").innerText();
  ok("(B1) Leer abschicken nennt Name, Abteilung, worum, wo, was", /dein Name/.test(fehlt) && /deine Abteilung/.test(fehlt) && /worum es geht/.test(fehlt) && /\bwo\b/.test(fehlt) && /was los ist/.test(fehlt), fehlt);

  /* (B2) */
  await p.locator("#werN").fill("B. Browser");
  await p.locator("#werA").fill("Brennerei");
  await p.locator('.kachel[data-art="Gebäude"]').click();
  await p.locator("#ort").fill("Halle 1, Sozialraum");
  await p.locator("#text").fill("Defektes Fenster, Scheibe hat einen Sprung");
  gemeldet++;
  await p.locator("#senden").click();
  await p.locator("#danke:not([hidden])").waitFor({ timeout: 10000 });
  const danke = (await p.locator("#danke").innerText()).replace(/\s+/g, " ");
  const nrB = (danke.match(/Meldung (\d{4}-\d{4})/) || [])[1];
  const amServer = (await holen("/api/scheurich/tickets", { headers: alsWerkstatt })).k.tickets.find((t) => t.nr === nrB);
  ok("(B2) Dank mit Nummer; das Ticket liegt am Server mit Name, Abteilung, Art, Eile „woche“", !!nrB && amServer && amServer.melder === "B. Browser" && amServer.abteilung === "Brennerei" && amServer.art === "Gebäude" && amServer.eile === "woche" && amServer.ort === "Halle 1, Sozialraum", danke.slice(0, 60));
  ok("(B2) Kein einziger Abruf an eine fremde Adresse", fremd.length === 0, fremd.join(", "));

  /* (B3) */
  await p.locator('[data-reiter="meine"]').click();
  await p.locator("#meineListe .karte").first().waitFor({ timeout: 10000 });
  let karte = (await p.locator("#meineListe .karte").first().innerText()).replace(/\s+/g, " ");
  ok("(B3) Meine Meldungen: 1 Karte, „Neu“, „wartet auf die Werkstatt“", (await p.locator("#meineListe .karte").count()) === 1 && /Neu/.test(karte) && /wartet auf die Werkstatt/.test(karte) && karte.includes(nrB), karte.slice(0, 110));

  /* (B4) */
  await post(`/api/scheurich/tickets/${nrB}`, { stand: "frage", zustaendig: "T Balles", antwort: "Welches Fenster genau?", wer: "T Balles" }, alsWerkstatt);
  await p.goto(B + "/melden#meine");
  await p.reload(); // nur die Raute zu ändern lädt nicht neu
  await p.locator("#meineListe [data-antwort]").waitFor({ timeout: 10000 });
  const zahl = await p.locator("#zahlFrage").innerText();
  karte = (await p.locator("#meineListe .karte").first().innerText()).replace(/\s+/g, " ");
  ok("(B4) Rückfrage: rote 1 am Reiter, Frage der Werkstatt und Antwortfeld sichtbar", zahl === "1" && /Rückfrage/.test(karte) && /Welches Fenster genau\?/.test(karte) && /bei T Balles/.test(karte), zahl + " | " + karte.slice(0, 120));
  await p.locator("#meineListe [data-antwort]").fill("Das linke, vom Eingang aus");
  await p.locator("#meineListe [data-antworten]").click();
  await p.locator("#meineListe .meine").waitFor({ timeout: 10000 });
  const nachAntwort = (await holen(`/api/scheurich/tickets/${nrB}`, { headers: alsWerkstatt })).k.ticket;
  ok("(B4) Antwort kommt am Server an; Stand zurück auf „angenommen“, Zahl am Reiter weg", nachAntwort.melderAntwort === "Das linke, vom Eingang aus" && nachAntwort.stand === "angenommen" && nachAntwort.neuVomMelder === true && (await p.locator("#zahlFrage").isHidden()));

  /* (B5) */
  await p.goto(B + "/melden");
  await p.reload();
  const werZeile = (await p.locator("#werZeile").innerText()).replace(/\s+/g, " ");
  ok("(B5) Nach dem Neuladen: Name und Abteilung bekannt, Abfrage zu", /B\. Browser · Brennerei/.test(werZeile) && (await p.locator("#werKasten").isHidden()), werZeile);

  /* (B6) */
  await p.locator('.kachel[data-art="Sonstiges"]').click();
  await p.locator("#ort").fill("Lager");
  await p.locator("#text").fill("Meldung mit Bild");
  await p.locator("#fotoDatei").setInputFiles({ name: "bild.png", mimeType: "image/png", buffer: PNG });
  await p.locator("#fotoFeld img").waitFor({ timeout: 10000 });
  gemeldet++;
  await p.locator("#senden").click();
  await p.locator("#danke:not([hidden])").waitFor({ timeout: 10000 });
  await p.locator('[data-reiter="meine"]').click();
  await p.locator("[data-bild]").first().waitFor({ timeout: 10000 });
  await p.locator("[data-bild]").first().click();
  await p.locator("#meineListe .bild img").first().waitFor({ timeout: 10000 });
  const mitBild = (await holen("/api/scheurich/tickets", { headers: alsWerkstatt })).k.tickets.find((t) => t.text === "Meldung mit Bild");
  const bildOk = await p.locator("#meineListe .bild img").first().evaluate((img) => new Promise((f) => { if (img.complete) f(img.naturalWidth > 0); else { img.onload = () => f(img.naturalWidth > 0); img.onerror = () => f(false); } }));
  ok("(B6) Foto: als JPG am Server, „Foto zeigen“ zeigt es", mitBild && /\.jpg$/.test(mitBild.foto) && fs.existsSync(path.join(einst.standorte.scheurich.datenOrdner, "ticket-fotos", mitBild.foto)) && bildOk, mitBild && mitBild.foto);

  /* (B7) */
  await p.setViewportSize({ width: 390, height: 800 });
  await p.locator('[data-reiter="melden"]').click();
  const ueberMelden = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await p.locator('[data-reiter="meine"]').click();
  const ueberMeine = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("(B7) 390 px: kein seitliches Rollen (beide Reiter); keine Skriptfehler", ueberMelden <= 0 && ueberMeine <= 0 && skriptfehler.length === 0, `${ueberMelden}/${ueberMeine} ${skriptfehler.join("; ")}`);

  /* (B8) */
  const kontext2 = await browser.newContext();
  const p2 = await kontext2.newPage();
  await p2.goto(B + "/melden#meine");
  await p2.locator("#meineListe .leer").waitFor({ timeout: 10000 });
  ok("(B8) Ein zweiter Browser sieht keine fremden Meldungen", (await p2.locator("#meineListe .karte").count()) === 0);
  await kontext2.close();

  /* (T14) Bremse - zuletzt, sie sperrt diesen Rechner für zehn Minuten */
  let letzte = null;
  while (gemeldet < einst.ticketsJe10Min) letzte = await melde("scheurich", KB, { text: "auffüllen " + gemeldet });
  const zuViel = await melde("scheurich", KB, { text: "eine zu viel" });
  ok("(T14) Bremse: Meldung " + einst.ticketsJe10Min + " geht noch, die nächste -> 429 mit lesbarem Satz", (!letzte || letzte.status === 200) && zuViel.status === 429 && /Zu viele Meldungen/.test(zuViel.k.fehler), `${letzte ? letzte.status : "-"} / ${zuViel.status}`);

  /* (T16) Neustart */
  const vorNeustart = (await holen("/api/scheurich/tickets", { headers: alsWerkstatt })).k.zahlen;
  await beende(kind);
  /* (B9) Dienst weg */
  await p.setViewportSize({ width: 1180, height: 900 });
  await p.locator('[data-reiter="melden"]').click();
  await p.locator('.kachel[data-art="Gebäude"]').click();
  await p.locator("#ort").fill("Halle 9");
  await p.locator("#text").fill("Dieser Text darf nicht verloren gehen");
  await p.locator("#senden").click();
  await p.waitForFunction(() => /NICHT angekommen/.test(document.getElementById("fehlt").textContent), null, { timeout: 40000 });
  ok("(B9) Dienst weg: „NICHT angekommen“, Text und Ort stehen noch im Formular", (await p.locator("#text").inputValue()) === "Dieser Text darf nicht verloren gehen" && (await p.locator("#ort").inputValue()) === "Halle 9" && (await p.locator("#danke").isHidden() || !/Halle 9/.test(await p.locator("#danke").innerText())), (await p.locator("#fehlt").innerText()).slice(0, 80));
  await browser.close();

  kind = starteDienst();
  await warteAufDienst(kind);
  const nachNeustart = (await holen("/api/scheurich/tickets", { headers: alsWerkstatt })).k.zahlen;
  r = await melde("scheurich", KA, { text: "nach dem Neustart" }); // die Bremse lebt nur im Speicher - nach dem Neustart ist sie leer
  ok("(T16) Neustart: Tickets noch da, die Nummer zählt weiter", nachNeustart.gesamt === vorNeustart.gesamt && nachNeustart.offen === vorNeustart.offen && r.status === 200 && r.k.ticket.nr === JAHR + "-" + String(vorNeustart.gesamt + 1).padStart(4, "0"), `${vorNeustart.gesamt} -> ${r.k && r.k.ticket && r.k.ticket.nr}`);
  await beende(kind);

  /* (S1) Roll-out 86: die Fehlerliste der Status-Seite mit einer gestellten Uhr */
  const { protokollierer } = require(DIENST);
  let uhr = Date.parse("2026-11-20T19:07:41");
  let alteFehler = -1, frischeFehler = -1;
  if (typeof protokollierer === "function") {
    const log = protokollierer(path.join(ORDNER, "protokoll-uhr"), () => uhr);
    log.fehler("Briefkasten (Takt): Briefkasten antwortet nicht (Frist)");
    uhr += 2 * 3600 * 1000; frischeFehler = log.fehlerLetzte24h().length;
    uhr += 3 * 86400000; alteFehler = log.fehlerLetzte24h().length; // drei Tage später, kein neuer Fehler
  }
  ok("(S1) Fehler von vor drei Tagen steht nicht mehr unter „letzte 24 Stunden“ (nach 2 h noch: 1)", frischeFehler === 1 && alteFehler === 0, `nach 2 h: ${frischeFehler}, nach 3 Tagen: ${alteFehler}`);

  try { fs.rmSync(ORDNER, { recursive: true, force: true }); } catch (e) { /* Windows hält die Datenbank manchmal noch kurz fest */ }
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FAIL | Abbruch: " + (e && e.stack || e)); try { if (laufendesKind) laufendesKind.kill(); } catch (x) { /* schon beendet */ } process.exit(1); });
