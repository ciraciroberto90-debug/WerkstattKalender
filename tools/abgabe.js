/* Abgabe in einem Befehl: bauen, prüfen, einspielen, committen, pushen.
 *
 * Warum (Roberto 30.10.: „wir müssen an den Stand kommen, wo ich hier nur
 * noch Änderungen schreibe und alles andere passiert so gut wie automatisch“):
 * Bisher waren das fünf Handgriffe mit je eigener Kontrolle. Jetzt macht ein
 * Skript sie in fester Reihenfolge, misst nach jedem Schritt und bricht beim
 * ersten roten Befund ab - nichts wird eingespielt oder gepusht, was nicht
 * geprüft ist. Die Hausregeln stecken im Ablauf:
 *   - nie bauen, während eine Suite läuft (Chromium-Prozesse = Abbruch)
 *   - Größe und ein Merkmal der gebauten HTML prüfen
 *   - Tests vor dem Einspielen; rot = kein Einspielen, kein Push
 *   - am Server die alte App-Datei als vor-<Zeit> aufheben, danach die
 *     Status-Seite fragen, ob sie dieselbe Größe sieht
 *   - die Roll-out-Liste gehört in denselben Push (Warnung, wenn sie fehlt)
 *
 * Aufruf:  node tools/abgabe.js [Schalter]
 *   --merkmal <Text>      muss in der gebauten HTML stehen (z. B. ein data-Attribut des Roll-outs)
 *   --tests <a,b,…|voll|keine>   Namensteile der Härtetests (z. B. harte-70,harte-111), voll = alle (~3 h), keine = ohne
 *   --einspielen          App-Datei auf den Server kopieren (\\v-btacockpit-1\BTA\BTA-Programm\App) UND in den
 *                         Update-Ordner auf W: legen (Werkstatt_Kalender_TPM - <Zeit>.html; die Programm-Hülle meldet
 *                         dort „Neue Version“, ein Klick am Rechner übernimmt sie). Bis zum Umschalttag arbeitet die
 *                         Werkstatt über W: (gemessen 30.10.: Datendateien dort werden geschrieben, Server „verbunden: 0“).
 *   --commit "<Text>"     alles committen (git add -A)
 *   --push                nach dem Commit pushen
 *   --ohne-bau            nicht bauen (nur prüfen/einspielen/pushen)
 *   --nur-pruefen         nichts verändern: zeigt, was das Skript tun würde
 * Beispiel: node tools/abgabe.js --merkmal data-stoer-nacht-hinweis --tests harte-111,harte-26 --einspielen --commit "Roll-out 71: …" --push
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const WURZEL = path.resolve(__dirname, "..");
const HTML = path.join(WURZEL, "Werkstatt_Kalender_TPM.html");
const SERVER_APP = process.env.BTA_SERVER_APP || "\\\\v-btacockpit-1\\BTA\\BTA-Programm\\App";
const STATUS_URL = process.env.BTA_STATUS_URL || "http://v-btacockpit-1:8765";
/* Update-Ordner des Datei-Wegs = der Kalender-Ordner auf W: (so steht es in
 * standard-einstellungen.json, Schlüssel programm:update-ordner). */
const W_UPDATE = process.env.BTA_W_UPDATE || "\\\\SCHEUDC1\\PSG_Gruppe\\16_Technik\\01_Scheurich\\02_Werkstatt\\Arbeitsplanung\\Werkstatt_Kalender";
const NODE_ORDNER = path.dirname(process.execPath);
const NPM = process.platform === "win32" ? path.join(NODE_ORDNER, "npm.cmd") : "npm";
const GIT = process.env.BTA_GIT || (fs.existsSync("C:\\Users\\rciraci\\BTA-Werkzeuge\\git\\cmd\\git.exe") ? "C:\\Users\\rciraci\\BTA-Werkzeuge\\git\\cmd\\git.exe" : "git");

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const hat = (name) => process.argv.includes(name);
const merkmal = arg("--merkmal");
const tests = (arg("--tests") || "keine").trim();
const einspielen = hat("--einspielen");
const commitText = arg("--commit");
const push = hat("--push");
const ohneBau = hat("--ohne-bau");
const nurPruefen = hat("--nur-pruefen");

const zeilen = [];
const melde = (schritt, ergebnis, zusatz) => { const z = `${schritt.padEnd(26)} ${ergebnis}${zusatz ? "   (" + zusatz + ")" : ""}`; zeilen.push(z); console.log(z); };
const abbruch = (grund) => { console.log("\nABBRUCH: " + grund + "\n\nBis hierher:\n" + zeilen.join("\n")); process.exit(1); };
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 12);
const lauf = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: WURZEL, stdio: opts.still ? "pipe" : "inherit", encoding: "utf8", shell: /\.cmd$/i.test(cmd), ...opts });
const holeJson = (url) => new Promise((ok, nein) => { http.get(url, { timeout: 10000 }, (r) => { let s = ""; r.on("data", (d) => (s += d)); r.on("end", () => { try { ok(JSON.parse(s)); } catch (e) { nein(e); } }); }).on("error", nein).on("timeout", () => nein(new Error("Zeitüberschreitung"))); });

(async () => {
  console.log(`Abgabe ${nurPruefen ? "(NUR PRÜFEN - nichts wird verändert)" : ""}\n`);

  /* 0. Läuft gerade eine Suite? Dann würde der Bau die HTML unter den Tests austauschen. */
  if (process.platform === "win32") {
    const t = lauf("tasklist", ["/FI", "IMAGENAME eq chrome-headless-shell.exe", "/FO", "CSV", "/NH"], { still: true, shell: false });
    const laufend = (t.stdout || "").split("\n").filter((z) => /chrome-headless-shell/.test(z)).length;
    melde("Suite läuft gerade?", laufend ? `JA - ${laufend} Chromium-Prozesse` : "nein");
    if (laufend && !ohneBau) abbruch("Es läuft eine Test-Suite (Chromium aktiv). Erst abwarten - der Bau tauscht die HTML unter den Tests aus.");
  }

  /* 1. Bauen */
  if (!ohneBau) {
    const vorher = fs.existsSync(HTML) ? { groesse: fs.statSync(HTML).size, sha: sha(HTML) } : null;
    if (nurPruefen) melde("Bau", "würde laufen (cd app && npm run build)");
    else {
      const r = lauf(NPM, ["run", "build"], { cwd: path.join(WURZEL, "app") });
      if (r.status !== 0) abbruch("npm run build ist rot.");
      const nachher = { groesse: fs.statSync(HTML).size, sha: sha(HTML) };
      melde("Bau", "fertig", `${nachher.groesse.toLocaleString("de-DE")} Bytes, SHA ${nachher.sha}…` + (vorher ? (vorher.sha === nachher.sha ? ", byte-gleich wie vorher" : `, vorher ${vorher.groesse.toLocaleString("de-DE")} Bytes`) : ""));
    }
  }

  /* 2. Größe und Merkmal */
  if (!fs.existsSync(HTML)) abbruch("Werkstatt_Kalender_TPM.html fehlt.");
  const groesse = fs.statSync(HTML).size;
  if (groesse < 1_000_000) abbruch(`Die HTML ist mit ${groesse} Bytes verdächtig klein.`);
  melde("Größe", `${groesse.toLocaleString("de-DE")} Bytes`);
  if (merkmal) {
    const drin = fs.readFileSync(HTML, "utf8").includes(merkmal);
    melde("Merkmal", drin ? "vorhanden" : "FEHLT", merkmal);
    if (!drin) abbruch(`Das Merkmal „${merkmal}“ steht nicht in der gebauten HTML.`);
  } else melde("Merkmal", "nicht geprüft (kein --merkmal)");

  /* 3. Tests */
  if (tests === "keine") melde("Härtetests", "übersprungen (--tests keine)");
  else if (nurPruefen) melde("Härtetests", `würden laufen: ${tests}`);
  else {
    const teile = tests === "voll" ? [] : tests.split(",").map((s) => s.trim()).filter(Boolean);
    const r = lauf(process.execPath, [path.join(WURZEL, "tests", "run-hardness-tests.js"), ...teile]);
    const letzter = (() => { try { return fs.readFileSync(path.join(WURZEL, "tests", "protokolle", "LETZTER-LAUF.txt"), "utf8").split("\n")[0]; } catch (e) { return ""; } })();
    melde("Härtetests", r.status === 0 ? "grün" : "ROT", letzter);
    if (r.status !== 0) abbruch("Härtetests rot - nichts eingespielt, nichts gepusht. Protokoll: tests/protokolle/");
  }

  /* 4. Einspielen */
  if (einspielen) {
    const ziel = path.join(SERVER_APP, "Werkstatt_Kalender_TPM.html");
    if (!fs.existsSync(SERVER_APP)) abbruch(`Server-Freigabe nicht erreichbar: ${SERVER_APP}`);
    const alt = fs.existsSync(ziel) ? { groesse: fs.statSync(ziel).size, sha: sha(ziel) } : null;
    if (alt && alt.sha === sha(HTML)) melde("Server-App", "nichts zu tun - am Server liegt schon diese Datei");
    else if (nurPruefen) melde("Server-App", `würde kopieren nach ${ziel}`, alt ? `dort: ${alt.groesse.toLocaleString("de-DE")} Bytes` : "dort: keine Datei");
    else {
      const stempel = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "-");
      if (alt) { fs.copyFileSync(ziel, path.join(SERVER_APP, `Werkstatt_Kalender_TPM.vor-${stempel}.html`)); melde("Alte aufgehoben", `Werkstatt_Kalender_TPM.vor-${stempel}.html`, `${alt.groesse.toLocaleString("de-DE")} Bytes`); }
      fs.copyFileSync(HTML, ziel);
      const neu = { groesse: fs.statSync(ziel).size, sha: sha(ziel) };
      if (neu.sha !== sha(HTML)) abbruch("Die Datei am Server ist nach dem Kopieren nicht byte-gleich.");
      melde("Server-App", "kopiert, byte-gleich", `${neu.groesse.toLocaleString("de-DE")} Bytes`);
      try {
        const s = await holeJson(STATUS_URL + "/api/status");
        const passt = s.appDatei && s.appDatei.bytes === groesse;
        melde("Status-Seite", passt ? "sieht die neue Datei" : "ZEIGT ANDERE GRÖSSE", `Dienst ${s.fassung}, App ${s.appDatei && s.appDatei.bytes} Bytes`);
        if (!passt) abbruch("Die Status-Seite meldet eine andere Größe als die kopierte Datei.");
      } catch (e) { melde("Status-Seite", "nicht erreichbar", e.message); }
    }

    /* W:-Update-Ordner: neue Datei mit Zeit im Namen, nichts wird überschrieben
     * oder gelöscht. Erst unter Zwischennamen schreiben, dann umbenennen - die
     * Hülle nimmt die jüngste Datei und darf nie eine halbe sehen. */
    if (!fs.existsSync(W_UPDATE)) melde("W:-Update-Ordner", "nicht erreichbar", W_UPDATE);
    else {
      const meinSha = sha(HTML);
      const vorhandene = fs.readdirSync(W_UPDATE).filter((n) => /^Werkstatt_Kalender_TPM.*\.html$/i.test(n)).map((n) => ({ n, p: path.join(W_UPDATE, n), st: fs.statSync(path.join(W_UPDATE, n)) })).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
      const juengste = vorhandene[0];
      if (juengste && juengste.st.size === groesse && sha(juengste.p) === meinSha) melde("W:-Update-Ordner", "nichts zu tun - jüngste Datei ist schon diese", juengste.n);
      else if (nurPruefen) melde("W:-Update-Ordner", "würde ablegen", juengste ? `jüngste dort: ${juengste.n} (${juengste.st.size.toLocaleString("de-DE")} Bytes)` : "dort liegt keine");
      else {
        const stempel = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
        const name = `Werkstatt_Kalender_TPM - ${stempel}.html`;
        const teil = path.join(W_UPDATE, name + ".teil");
        fs.copyFileSync(HTML, teil);
        fs.renameSync(teil, path.join(W_UPDATE, name));
        const dort = path.join(W_UPDATE, name);
        /* Kopieren behält das Änderungsdatum der Quelle; die Hülle wählt nach
         * dem jüngsten Datum - deshalb auf den Ablagezeitpunkt setzen. */
        fs.utimesSync(dort, new Date(), new Date());
        if (sha(dort) !== meinSha) abbruch("Die Datei auf W: ist nach dem Kopieren nicht byte-gleich.");
        melde("W:-Update-Ordner", "abgelegt, byte-gleich", `${name}, ${fs.statSync(dort).size.toLocaleString("de-DE")} Bytes` + (juengste ? `; Vorgänger bleibt: ${juengste.n}` : ""));
      }
    }
  }

  /* 5. Commit und Push */
  if (commitText) {
    const st = lauf(GIT, ["status", "--porcelain"], { still: true, shell: false });
    const geaendert = (st.stdout || "").split("\n").filter(Boolean);
    if (!geaendert.length) melde("Commit", "nichts zu committen");
    else {
      const listeDabei = geaendert.some((z) => /ROLLOUT-LISTE\.md/.test(z));
      melde("Roll-out-Liste im Commit?", listeDabei ? "ja" : "NEIN - Hausregel: neue Aufgaben in denselben Push");
      if (nurPruefen) melde("Commit", `würde ${geaendert.length} Dateien committen`, commitText);
      else {
        lauf(GIT, ["add", "-A"], { still: true, shell: false });
        const c = lauf(GIT, ["commit", "-q", "-m", commitText], { still: true, shell: false });
        if (c.status !== 0) abbruch("git commit ist rot: " + (c.stderr || c.stdout));
        const h = lauf(GIT, ["log", "-1", "--format=%h"], { still: true, shell: false }).stdout.trim();
        melde("Commit", h, `${geaendert.length} Dateien`);
      }
    }
  }
  if (push) {
    if (nurPruefen) melde("Push", "würde pushen");
    else {
      const p = lauf(GIT, ["push"], { still: true, shell: false });
      if (p.status !== 0) abbruch("git push ist rot: " + (p.stderr || p.stdout));
      const voraus = lauf(GIT, ["rev-list", "--count", "@{u}..HEAD"], { still: true, shell: false }).stdout.trim();
      melde("Push", voraus === "0" ? "fertig, Stand bei GitHub = lokal" : `UNVOLLSTÄNDIG (${voraus} voraus)`);
    }
  }

  console.log("\nAbgabe fertig.");
})().catch((e) => abbruch(e.message));
