/* BTA-Cockpit · Briefkasten als Node-Programm (Roll-out 65)
 *
 * Für den Prüfstand und für den Fall, dass der Briefkasten einmal auf einem
 * eigenen Rechner im Internet laufen soll (ein Node, kein Zusatzpaket).
 * Die Ablage sind Dateien in einem Ordner: <id>.bin (Bytes) + <id>.json (Meta).
 *
 * Aufruf:  node --no-warnings briefkasten.js [einstellungen.json]
 *   { "port": 8777, "host": "0.0.0.0", "ordner": "./ablage",
 *     "einwurfSchluessel": "…", "abholSchluessel": "…" }
 * oder über Umgebung: BRIEFKASTEN_PORT, BRIEFKASTEN_ORDNER,
 *   BRIEFKASTEN_EINWURF, BRIEFKASTEN_ABHOL
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { behandle, MAX_BYTES, FASSUNG } = require("./kern.js");

function ordnerAblage(ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  const p = (id, endung) => path.join(ordner, id + endung);
  return {
    async lege(id, bytes, meta) {
      // Zwischendatei, dann Umbenennen - nie eine halbe Datei unter dem echten Namen
      fs.writeFileSync(p(id, ".bin.teil"), Buffer.from(bytes)); fs.renameSync(p(id, ".bin.teil"), p(id, ".bin"));
      fs.writeFileSync(p(id, ".json.teil"), JSON.stringify(meta)); fs.renameSync(p(id, ".json.teil"), p(id, ".json"));
    },
    async liste() {
      return fs.readdirSync(ordner).filter((n) => n.endsWith(".json")).map((n) => {
        const id = n.slice(0, -5);
        let meta = {}; try { meta = JSON.parse(fs.readFileSync(p(id, ".json"), "utf8")); } catch (e) { meta = {}; }
        return { id, bytes: fs.existsSync(p(id, ".bin")) ? fs.statSync(p(id, ".bin")).size : 0, meta };
      });
    },
    async hole(id) {
      if (!fs.existsSync(p(id, ".json"))) return null;
      let meta = {}; try { meta = JSON.parse(fs.readFileSync(p(id, ".json"), "utf8")); } catch (e) { meta = {}; }
      const bytes = fs.existsSync(p(id, ".bin")) ? new Uint8Array(fs.readFileSync(p(id, ".bin"))) : new Uint8Array(0);
      return { bytes, meta };
    },
    async loesche(id) { for (const e of [".bin", ".json"]) { try { fs.unlinkSync(p(id, e)); } catch (x) { /* schon weg */ } } },
  };
}

function koerper(req) {
  return new Promise((resolve, reject) => {
    const teile = []; let groesse = 0;
    req.on("data", (d) => { groesse += d.length; if (groesse > MAX_BYTES + 1024) { reject(new Error("Anfrage zu groß")); req.destroy(); return; } teile.push(d); });
    req.on("end", () => resolve(new Uint8Array(Buffer.concat(teile))));
    req.on("error", reject);
  });
}

function starten(e) {
  const ablage = ordnerAblage(e.ordner);
  const schluessel = { einwurf: e.einwurfSchluessel, abhol: e.abholSchluessel };
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, "http://x");
      const antwort = await behandle({ methode: req.method, pfad: u.pathname, kopf: (n) => req.headers[n.toLowerCase()], bytes: () => koerper(req) }, ablage, schluessel);
      res.writeHead(antwort.status, antwort.kopf || {});
      if (antwort.bytes) res.end(Buffer.from(antwort.bytes)); else if (antwort.json !== undefined) res.end(JSON.stringify(antwort.json)); else res.end();
    } catch (x) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ fehler: x.message }));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(e.port, e.host, () => resolve({ port: server.address().port, async stoppen() { await new Promise((r) => server.close(() => r())); } }));
  });
}

function ladeEinstellungen(pfad) {
  let roh = {};
  if (pfad && fs.existsSync(pfad)) roh = JSON.parse(fs.readFileSync(pfad, "utf8"));
  const e = {
    port: Number(roh.port || process.env.BRIEFKASTEN_PORT) || 8777,
    host: roh.host || "0.0.0.0",
    ordner: roh.ordner || process.env.BRIEFKASTEN_ORDNER || path.join(__dirname, "ablage"),
    einwurfSchluessel: String(roh.einwurfSchluessel || process.env.BRIEFKASTEN_EINWURF || "").trim(),
    abholSchluessel: String(roh.abholSchluessel || process.env.BRIEFKASTEN_ABHOL || "").trim(),
  };
  if (!e.einwurfSchluessel || !e.abholSchluessel) throw new Error("Briefkasten: einwurfSchluessel und abholSchluessel müssen gesetzt sein");
  return e;
}

module.exports = { starten, ordnerAblage, ladeEinstellungen, FASSUNG };

if (require.main === module) {
  let e;
  try { e = ladeEinstellungen(process.argv[2] || path.join(__dirname, "einstellungen.json")); } catch (x) { console.error(x.message); process.exit(2); }
  starten(e).then((s) => console.log(`Briefkasten ${FASSUNG} läuft auf Port ${s.port}, Ablage ${e.ordner}`)).catch((x) => { console.error("Briefkasten konnte nicht starten:", x.message); process.exit(1); });
}
