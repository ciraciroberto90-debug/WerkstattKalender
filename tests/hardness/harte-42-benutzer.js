// Härtetest: BENUTZERGRUPPEN (Robertos Wunsch vom 07.08.).
//
// Eine Namensliste in der gemeinsamen Datei entscheidet, wer schreiben darf -
// die Rechtevergabe hängt damit nicht an den Datei-Freigaben. Geprüft wird:
//   (1) Ohne Benutzerliste verhält sich die App wie bisher (keine Anmeldung)
//   (2) Verwalter legt Benutzer über die Oberfläche an; Kennwörter stehen
//       NIE im Klartext in der Datei
//   (3) Nach dem Anlegen fragt die App nach der Anmeldung
//   (4) Falsches Kennwort wird abgelehnt
//   (5) Ein "Leser" ist nach der Anmeldung Nur-Leser: kein Zahnrad -
//       die GEGENPROBE zur Sperre (ohne die Änderung wäre das Zahnrad da)
//   (6) Das Gerät merkt sich die Anmeldung über einen Neustart
//   (7) Benutzerwechsel über das Datei-Fenster (auch für Nur-Leser erreichbar)
//   (8) Der letzte Verwalter kann nicht herabgestuft werden (Selbst-Aussperr-Wächter)
//   (9) Ein "Bearbeiter" darf schreiben, sieht aber die Benutzerverwaltung nicht
const { chromium } = require("playwright-core");
const path = require("path");
const APP = "file://" + path.resolve("/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");
let pass = 0, fail = 0;
const ok = (n, c, zusatz) => {
  console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : ""));
  c ? pass++ : fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });

  // Dateiinhalt lebt in Node - so überlebt er den "Neustart" (zweite Seite)
  // Zwei Pinnwand-Zettel: einer veröffentlicht, einer intern. Ein Leser darf
  // NUR den veröffentlichten sehen - dieselbe Regel wie bei Datei-Lesern.
  const jetztIso = new Date().toISOString();
  let dateiInhalt = JSON.stringify({
    format: "werkstatt-kalender-v1", savedAt: jetztIso,
    entries: [
      { id: "z-oeffentlich", date: "2026-08-10", category: "NOTIZ", name: "RC", status: "open", note: "AUSHANG Sommerfest", zeit: jetztIso, veroeffentlicht: true, updatedAt: jetztIso },
      { id: "z-intern", date: "2026-08-10", category: "NOTIZ", name: "RC", status: "open", note: "INTERN Gehaltsrunde", zeit: jetztIso, updatedAt: jetztIso },
    ], deleted: {},
    config: { tpmAnlagen: [], riItems: [], team: [{ name: "Peter Test", rolle: "mech" }] },
  });

  const neueSeite = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await p.exposeFunction("__leseDatei", () => dateiInhalt);
    await p.exposeFunction("__schreibeDatei", (t) => { dateiInhalt = t; });
    await p.addInitScript(() => {
      const handle = {
        name: "kalender-daten.json", kind: "file",
        async getFile() { return new File([await window.__leseDatei()], "kalender-daten.json", { type: "application/json" }); },
        async createWritable() { let b = ""; return { async write(t) { b += t; }, async close() { await window.__schreibeDatei(b); } }; },
        async queryPermission() { return "granted"; },
        async requestPermission() { return "granted"; },
      };
      window.showOpenFilePicker = async () => [handle];
    });
    await p.goto(APP);
    await p.waitForTimeout(500);
    return p;
  };
  const verbinde = async (p) => {
    await p.locator('button[aria-label="Gemeinsame Datei"]').click();
    await p.getByText("Vorhandene Datei öffnen …").click();
    await p.waitForTimeout(1000);
    await p.locator('button[aria-label="Schließen"]').last().click().catch(() => {});
    await p.waitForTimeout(300);
  };

  /* ---- (1) Ohne Benutzerliste: alles wie bisher ---- */
  const p = await neueSeite();
  await verbinde(p);
  ok("(1) Ohne Benutzerliste erscheint KEIN Anmelde-Dialog", (await p.locator('[aria-label="Anmelden"]').count()) === 0);
  ok("(1) Das Zahnrad ist da wie bisher", (await p.locator('button[aria-label="Verwalten"]').count()) === 1);

  /* ---- (2) Verwalter legt Benutzer an - über die Oberfläche ---- */
  await p.locator('button[aria-label="Verwalten"]').click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Team & Schichten", exact: true }).click();
  await p.waitForTimeout(300);
  ok("(2) Die Benutzerverwaltung ist sichtbar (noch für alle - Liste ist leer)",
    /Benutzer & Rechte/i.test(await p.locator("body").innerText()));
  await p.getByRole("button", { name: "+ Benutzer hinzufügen" }).click();
  await p.locator('input[aria-label="Benutzername 1"]').fill("RobertoCiraci");
  // Erster Benutzer steht von selbst auf Verwalter - so bleibt niemand ausgesperrt
  ok("(2) Der erste Benutzer steht von selbst auf Verwalter",
    (await p.locator('select[aria-label="Rolle 1"]').inputValue()) === "verwalter");
  await p.getByRole("button", { name: "+ Benutzer hinzufügen" }).click();
  await p.locator('input[aria-label="Benutzername 2"]').fill("MWerkstatt");
  await p.locator('select[aria-label="Rolle 2"]').selectOption("leser");
  await p.locator('input[aria-label="Kennwort 2"]').fill("Leser");
  await p.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await p.waitForTimeout(900);

  const conf = JSON.parse(dateiInhalt).config || {};
  ok("(2) Beide Benutzer stehen in der gemeinsamen Datei",
    Array.isArray(conf.benutzer) && conf.benutzer.length === 2
    && conf.benutzer.some((b) => b.name === "RobertoCiraci" && b.rolle === "verwalter")
    && conf.benutzer.some((b) => b.name === "MWerkstatt" && b.rolle === "leser"),
    JSON.stringify(conf.benutzer || []).slice(0, 120));
  const mw = (conf.benutzer || []).find((b) => b.name === "MWerkstatt") || {};
  ok("(2) Das Kennwort steht NICHT im Klartext in der Datei, sondern als Hash",
    /^[0-9a-f]{64}$/.test(mw.kennwortHash || "") && !dateiInhalt.includes('"kennwortHash":"Leser"'),
    (mw.kennwortHash || "—").slice(0, 16) + "…");

  /* ---- (3) Jetzt verlangt die App eine Anmeldung ---- */
  await p.waitForTimeout(400);
  ok("(3) Nach dem Anlegen der Liste erscheint der Anmelde-Dialog",
    (await p.locator('[aria-label="Anmelden"]').count()) === 1);

  /* ---- (3b) „Nur ansehen" (Robertos Regel vom 10.08.): ohne Anmeldung
     NIE Schreibmodus - aber ansehen wie ein Aushang darf jeder ---- */
  await p.getByRole("button", { name: "Nur ansehen (ohne Anmeldung)" }).click();
  await p.waitForTimeout(400);
  ok("(3b) 'Nur ansehen' schließt den Dialog", (await p.locator('[aria-label="Anmelden"]').count()) === 0);
  ok("(3b) Ohne Anmeldung ist die App NUR-LESER (kein Zahnrad, trotz schreibbarer Datei)",
    (await p.locator('button[aria-label="Verwalten"]').count()) === 0);
  ok("(3b) Oben rechts steht jetzt der Anmelden-Knopf",
    (await p.locator('button[aria-label="Benutzer anmelden"]').count()) === 1);
  await p.locator('button[aria-label="Benutzer anmelden"]').click();
  await p.waitForTimeout(400);
  ok("(3b) Der Knopf holt den Anmelde-Dialog zurück",
    (await p.locator('[aria-label="Anmelden"]').count()) === 1);

  /* ---- (4) Schreibfelder statt Auswahlliste (Robertos Ansage vom 10.08.):
     Der Dialog darf die Benutzernamen NICHT verraten ---- */
  ok("(4) Der Anmelde-Dialog hat KEIN Dropdown mit den Benutzernamen",
    (await p.locator('[aria-label="Anmelden"] select').count()) === 0
    && !(await p.locator('[aria-label="Anmelden"]').innerText()).includes("RobertoCiraci"));
  await p.locator('input[aria-label="Benutzername"]').fill("Unbekannt");
  await p.getByRole("button", { name: "Anmelden", exact: true }).click();
  await p.waitForTimeout(300);
  const fehlerUnbekannt = await p.locator('[aria-label="Anmelden"]').innerText();
  await p.locator('input[aria-label="Benutzername"]').fill("MWerkstatt");
  await p.locator('input[aria-label="Kennwort"]').fill("falsch");
  await p.getByRole("button", { name: "Anmelden", exact: true }).click();
  await p.waitForTimeout(300);
  const fehlerKennwort = await p.locator('[aria-label="Anmelden"]').innerText();
  ok("(4) Falscher Name und falsches Kennwort: gleiche Meldung, kein Zugang",
    /Benutzername oder Kennwort stimmt nicht/.test(fehlerUnbekannt)
    && /Benutzername oder Kennwort stimmt nicht/.test(fehlerKennwort)
    && (await p.locator('[aria-label="Anmelden"]').count()) === 1);

  /* ---- (5) Als Leser angemeldet: Nur-Lesen ---- */
  await p.locator('input[aria-label="Kennwort"]').fill("Leser");
  await p.getByRole("button", { name: "Anmelden", exact: true }).click();
  await p.waitForTimeout(600);
  ok("(5) Mit richtigem Kennwort ist die Anmeldung durch",
    (await p.locator('[aria-label="Anmelden"]').count()) === 0);
  ok("(5) GEGENPROBE Leser: Das Zahnrad ist WEG - obwohl die Datei schreibbar wäre",
    (await p.locator('button[aria-label="Verwalten"]').count()) === 0);
  ok("(5) Der Urheber-Name dieses Geräts ist jetzt der Benutzername",
    (await p.evaluate(() => localStorage.getItem("werkstatt-kalender-name"))) === "MWerkstatt");
  // Robertos Nachfrage vom 10.08.: ALLE bisherigen Leser-Regeln gelten auch
  // fuer Benutzer-Leser - hier die schaerfste: unveroeffentlichte Zettel
  // bleiben unsichtbar, veroeffentlichte nicht.
  const leserSicht = await p.locator("body").innerText();
  ok("(5) Leser sieht den VERÖFFENTLICHTEN Pinnwand-Zettel",
    /AUSHANG Sommerfest/.test(leserSicht));
  ok("(5) GEGENPROBE: Der interne Zettel bleibt für den Leser unsichtbar",
    !/INTERN Gehaltsrunde/.test(leserSicht));

  /* ---- (5b) Abmelden-Knopf oben rechts (Robertos Wunsch vom 10.08.):
     auch Leser und Bearbeiter kommen damit zur Anmeldung UND zur
     Datei-Verbindung ---- */
  ok("(5b) Der Abmelden-Knopf steht oben rechts - auch für Leser",
    (await p.locator('button[aria-label="Abmelden"]').count()) === 1);
  await p.locator('button[aria-label="Abmelden"]').click();
  await p.waitForTimeout(400);
  ok("(5b) Abmelden öffnet die Anmeldung wieder",
    (await p.locator('[aria-label="Anmelden"]').count()) === 1);
  await p.getByRole("button", { name: "Gemeinsame Datei verbinden / wechseln …" }).click();
  await p.waitForTimeout(400);
  ok("(5b) Aus der Anmeldung heraus erreichbar: das Datei-Fenster (andere JSON verbinden)",
    /Gemeinsame Datei \(Firmenlaufwerk/.test(await p.locator("body").innerText())
    && (await p.locator('[aria-label="Anmelden"]').count()) === 0);
  await p.locator('button[aria-label="Schließen"]').last().click();
  await p.waitForTimeout(400);
  ok("(5b) Datei-Fenster zu -> die Anmeldung ist wieder da",
    (await p.locator('[aria-label="Anmelden"]').count()) === 1);
  // Wieder anmelden, damit der Neustart-Fall (6) den gemerkten Benutzer hat
  await p.locator('input[aria-label="Benutzername"]').fill("MWerkstatt");
  await p.locator('input[aria-label="Kennwort"]').fill("Leser");
  await p.getByRole("button", { name: "Anmelden", exact: true }).click();
  await p.waitForTimeout(500);

  /* ---- (6) Neustart: Das Gerät erinnert sich ---- */
  const p2 = await neueSeite();
  await verbinde(p2);
  await p2.waitForTimeout(600);
  ok("(6) Nach dem Neustart KEINE erneute Anmelde-Frage",
    (await p2.locator('[aria-label="Anmelden"]').count()) === 0);
  ok("(6) Und der Leser bleibt Nur-Leser (kein Zahnrad)",
    (await p2.locator('button[aria-label="Verwalten"]').count()) === 0);

  /* ---- (7) Benutzerwechsel über das Datei-Fenster ---- */
  await p2.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p2.waitForTimeout(300);
  ok("(7) Das Datei-Fenster zeigt, wer angemeldet ist",
    /Angemeldet als/.test(await p2.locator("body").innerText()));
  await p2.getByRole("button", { name: "Benutzer wechseln …" }).click();
  await p2.waitForTimeout(400);
  ok("(7) Der Wechsel öffnet den Anmelde-Dialog",
    (await p2.locator('[aria-label="Anmelden"]').count()) === 1);
  // Getippt, absichtlich in anderer Schreibung: Groß/Klein wird verziehen
  await p2.locator('input[aria-label="Benutzername"]').fill("robertociraci");
  await p2.getByRole("button", { name: "Anmelden", exact: true }).click();
  await p2.waitForTimeout(600);
  ok("(7) Als Verwalter (ohne Kennwort) angemeldet: Zahnrad ist da",
    (await p2.locator('button[aria-label="Verwalten"]').count()) === 1);

  /* ---- (8) Selbst-Aussperr-Wächter ---- */
  await p2.locator('button[aria-label="Verwalten"]').click();
  await p2.waitForTimeout(400);
  await p2.getByRole("button", { name: "Team & Schichten", exact: true }).click();
  await p2.waitForTimeout(300);
  await p2.locator('select[aria-label="Rolle 1"]').selectOption("leser"); // der EINZIGE Verwalter
  await p2.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await p2.waitForTimeout(600);
  ok("(8) Der letzte Verwalter lässt sich nicht herabstufen - klare Meldung",
    /Mindestens ein Benutzer muss Verwalter sein/.test(await p2.locator("body").innerText()));
  ok("(8) Die Datei blieb unangetastet (Roberto ist weiter Verwalter)",
    (JSON.parse(dateiInhalt).config.benutzer.find((b) => b.name === "RobertoCiraci") || {}).rolle === "verwalter");

  /* ---- (9) Bearbeiter: schreiben ja, Benutzer pflegen nein ---- */
  await p2.locator('select[aria-label="Rolle 1"]').selectOption("verwalter"); // zurück
  await p2.locator('select[aria-label="Rolle 2"]').selectOption("bearbeiter");
  await p2.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await p2.waitForTimeout(900);
  await p2.locator('button[aria-label="Gemeinsame Datei"]').click();
  await p2.waitForTimeout(300);
  await p2.getByRole("button", { name: "Benutzer wechseln …" }).click();
  await p2.waitForTimeout(400);
  await p2.locator('input[aria-label="Benutzername"]').fill("MWerkstatt");
  await p2.locator('input[aria-label="Kennwort"]').fill("Leser");
  await p2.getByRole("button", { name: "Anmelden", exact: true }).click();
  await p2.waitForTimeout(600);
  ok("(9) Als Bearbeiter ist das Zahnrad wieder da",
    (await p2.locator('button[aria-label="Verwalten"]').count()) === 1);
  const bearbeiterSicht = await p2.locator("body").innerText();
  ok("(9) Der Bearbeiter sieht auch den INTERNEN Pinnwand-Zettel",
    /INTERN Gehaltsrunde/.test(bearbeiterSicht) && /AUSHANG Sommerfest/.test(bearbeiterSicht));
  await p2.locator('button[aria-label="Verwalten"]').click();
  await p2.waitForTimeout(400);
  await p2.getByRole("button", { name: "Team & Schichten", exact: true }).click();
  await p2.waitForTimeout(300);
  ok("(9) Aber die Benutzerverwaltung sieht nur der Verwalter",
    !/Benutzer & Rechte/i.test(await p2.locator("body").innerText()));
  await p2.getByRole("button", { name: "Abbrechen" }).first().click().catch(() => {});
  await p2.waitForTimeout(400);

  /* ---- (10) WÄCHTER: Fremde Rechteänderungen überleben jedes andere
     Speichern. Nachgestellt: Der Vertreter ändert an einem anderen PC eine
     Rolle (direkt in der Datei, Stempel wenige Sekunden alt), dieses Gerät
     hat einen Zwischenspeicher ohne benutzer-Feld - und legt dann nur einen
     Link an. Gemessen am 10.08.: Schon die Vorher/Nachher-Mechanik von
     saveConfig fing das ab; seither fasst der Link-/OEE-/Einstellungs-Pfad
     das Benutzer-Feld zusätzlich GAR NICHT mehr an (persistConfig,
     nextBenutzer=null). Diese Prüfung nagelt die Zusage fest. ---- */
  {
    // Vertreter am anderen PC: MWerkstatt wird Leser (frischer Zeitstempel)
    const datei = JSON.parse(dateiInhalt);
    const eintrag = datei.entries.find((e) => e.id === "config|benutzer");
    ok("(10) Vorbereitung: Die Benutzerliste liegt als eigener Eintrag in der Datei", !!eintrag);
    // Die Änderung des Vertreters liegt REALISTISCH ein paar Sekunden zurück -
    // ein Zukunfts-Stempel würde sie künstlich schützen und den Fall verfehlen.
    eintrag.value = eintrag.value.map((b) => (b.name === "MWerkstatt" ? { ...b, rolle: "leser" } : b));
    eintrag.updatedAt = new Date(Date.now() - 5000).toISOString();
    datei.savedAt = new Date(Date.now() - 4000).toISOString();
    dateiInhalt = JSON.stringify(datei);
    // Alter Zwischenspeicher dieses Geräts: config-Block OHNE benutzer-Feld
    await p2.evaluate(() => {
      const roh = JSON.parse(localStorage.getItem("werkstatt-kalender-config") || "{}");
      delete roh.benutzer;
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(roh));
    });
    // Und jetzt: nur einen Link anlegen - mit den Benutzern hat das nichts zu tun
    await p2.getByRole("button", { name: "Links & Dokumente" }).click();
    await p2.waitForTimeout(300);
    await p2.getByRole("button", { name: "＋ Link" }).click();
    await p2.waitForTimeout(300);
    await p2.getByPlaceholder(/Bezeichnung/).fill("Prüfplan-Ordner");
    await p2.getByPlaceholder(/Adresse oder Pfad/).fill("X:\\Werkstatt\\Pruefplaene");
    await p2.getByRole("button", { name: "Speichern" }).click();
    await p2.waitForTimeout(1600);
    const nachher = JSON.parse(dateiInhalt);
    const benutzerNachher = (nachher.entries.find((e) => e.id === "config|benutzer") || {}).value || [];
    ok("(10) Der Link ist gespeichert (der Speicherpfad lief wirklich)",
      JSON.stringify((nachher.entries.find((e) => e.id === "config|links") || {}).value || {}).includes("Prüfplan-Ordner"));
    ok("(10) WÄCHTER: Die Rechteänderung des Vertreters ÜBERLEBT das Link-Speichern",
      (benutzerNachher.find((b) => b.name === "MWerkstatt") || {}).rolle === "leser",
      "MWerkstatt: " + ((benutzerNachher.find((b) => b.name === "MWerkstatt") || {}).rolle || "—"));

    /* ---- (11) Die Herabstufung greift LIVE: Das betroffene Gerät ist
       als MWerkstatt angemeldet - beim nächsten Abgleich verliert es die
       Bearbeiter-Rechte von selbst, ohne Ab-/Anmelden, ohne Neustart. */
    await p2.evaluate(() => window.__wkSharedTest.poll());
    await p2.waitForTimeout(1200);
    ok("(11) Nach dem Abgleich ist das Gerät von selbst Nur-Leser (Zahnrad weg)",
      (await p2.locator('button[aria-label="Verwalten"]').count()) === 0);
    ok("(11) Die Schreibschutz-Leiste sagt es dem Betroffenen klar",
      /Schreibschutz/.test(await p2.locator("body").innerText()));
    ok("(11) Angemeldet bleibt er trotzdem (kein Rauswurf, nur weniger Rechte)",
      (await p2.evaluate(() => localStorage.getItem("werkstatt-kalender-benutzer"))) === "MWerkstatt");
  }

  console.log(`\n==== BENUTZERGRUPPEN: ${pass} PASS / ${fail} FAIL ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
