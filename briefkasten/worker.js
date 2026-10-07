/* BTA-Cockpit · Briefkasten als Cloudflare-Worker (Roll-out 65)
 *
 * EINE Datei zum Einfügen im Cloudflare-Dashboard (Workers & Pages -> Worker
 * erstellen -> Code bearbeiten). Keine Kommandozeile nötig - Schritte in
 * LIESMICH-BRIEFKASTEN.md. Der Kern (kern.js) ist hier eingebettet, damit
 * eine Datei reicht; die Ablage ist Workers KV mit Haltefrist 7 Tage.
 *
 * Einrichten im Dashboard:
 *   - KV-Namensraum anlegen (z. B. "bta-briefkasten") und als Variable ABLAGE binden
 *   - Umgebungsvariablen EINWURF_SCHLUESSEL und ABHOL_SCHLUESSEL (als Geheimnis)
 * Danach: https://<name>.<konto>.workers.dev/status antwortet mit {"dienst":"bta-briefkasten"}.
 *
 * ACHTUNG: Diese Datei entsteht aus kern.js + dem Worker-Rahmen unten. Wer
 * kern.js ändert, baut sie mit `node briefkasten/worker-bauen.js` neu.
 */
/* --- KERN-ANFANG --- */
/* BTA-Cockpit · Briefkasten im Internet - der KERN (Roll-out 65, Robertos
 * Favorit 06.10.: „eigener Briefkasten, speichert nichts dauerhaft")
 *
 * Der Briefkasten ist ein Durchgang, kein Speicher: Das Handy (Aufnahme-
 * Zettel) wirft Foto + Begleitdatei ein, der BTA-Dienst auf dem Werkstatt-
 * Server holt alle 30 s ab und löscht sofort. Liegt etwas länger als sieben
 * Tage (Server aus), räumt der Briefkasten es selbst weg.
 *
 * Dieser Kern kennt kein HTTP und keine Ablage - er bekommt beides gereicht:
 *   anfrage = { methode, pfad, kopf(name) -> string, bytes() -> Promise<Uint8Array> }
 *   ablage  = { lege(id, bytes, meta), liste() -> [{id, bytes, meta}], hole(id) -> {bytes, meta}|null, loesche(id) }
 * So läuft derselbe Code als Node-Programm (briefkasten.js, auch im
 * Prüfstand) und als Cloudflare-Worker (worker.js) - und der Prüfstand misst
 * den Kern ohne Netz.
 *
 * Wege (alle Antworten JSON außer dem Abholen der Bytes):
 *   GET    /status                 Lebenszeichen {dienst, fassung}; mit Abhol-Schlüssel auch {anzahl}
 *   POST   /einwurf                Kopf X-BTA-Schluessel (Einwurf- oder Abhol-Schlüssel),
 *                                  Kopf X-BTA-Begleit (JSON, URL-kodiert), Körper = Bild-Bytes (darf leer sein)
 *                                  -> {id, bytes}
 *   GET    /liste                  (Abhol-Schlüssel) -> {eintraege: [{id, bytes, eingeworfen, begleit}]}
 *   GET    /abholen/:id            (Abhol-Schlüssel) -> Bytes, Köpfe X-BTA-Begleit, X-BTA-Eingeworfen
 *   DELETE /abholen/:id            (Abhol-Schlüssel) -> {geloescht: true}
 * Zwei Schlüssel, weil das Handy verloren gehen kann: Der Einwurf-Schlüssel
 * darf nur einwerfen - wer ihn hat, liest nichts. Der Abhol-Schlüssel bleibt
 * auf dem Werkstatt-Server.
 */
const FASSUNG = "0.1.0";
const MAX_BYTES = 3 * 1024 * 1024;      // ein eingedampftes Handyfoto hat 200-400 kB; 3 MB lässt Luft
const MAX_BEGLEIT = 4 * 1024;           // Begleitdatei: Zeit, Kürzel, Anlage, Ziel, Notiz
const HALTEN_MS = 7 * 24 * 3600 * 1000; // länger liegt nichts - der Briefkasten ist kein Archiv
const ID_MUSTER = /^[a-z0-9]{8,40}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-BTA-Schluessel, X-BTA-Begleit",
  "Access-Control-Expose-Headers": "X-BTA-Begleit, X-BTA-Eingeworfen",
};
const json = (status, daten, extra = {}) => ({ status, json: daten, kopf: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS, ...extra } });

function neueId() {
  // Zeit zuerst (sortierbar, älteste zuerst beim Abholen), dann Zufall gegen zwei Einwürfe in derselben Millisekunde
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
// Die Begleitdatei kommt URL-kodiert im Kopf, weil der Körper die Bild-Bytes trägt.
function leseBegleitKopf(roh) {
  if (!roh) return {};
  let text = String(roh);
  try { text = decodeURIComponent(text); } catch (e) { /* war nicht kodiert */ }
  if (text.length > MAX_BEGLEIT) throw new Error("Begleitdatei zu groß");
  try {
    const o = JSON.parse(text);
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch (e) { throw new Error("Begleitdatei ist kein gültiges JSON"); }
}
const zeitVergleich = (a, b) => String(a.id).localeCompare(String(b.id)); // ids beginnen mit der Zeit (Basis 36)

/* schluessel = { einwurf, abhol } - beide Pflicht beim Betrieb. */
async function behandle(anfrage, ablage, schluessel, jetzt = Date.now()) {
  const methode = String(anfrage.methode || "GET").toUpperCase();
  const pfad = String(anfrage.pfad || "/").replace(/\/+$/, "") || "/";
  if (methode === "OPTIONS") return { status: 204, kopf: { ...CORS, "Access-Control-Max-Age": "86400" } };
  if (!schluessel || !schluessel.einwurf || !schluessel.abhol) return json(500, { fehler: "Briefkasten nicht eingerichtet: Einwurf- und Abhol-Schlüssel fehlen" });
  const gegeben = String(anfrage.kopf("x-bta-schluessel") || "").trim();
  const darfAbholen = gegeben && gegeben === schluessel.abhol;
  const darfEinwerfen = darfAbholen || (gegeben && gegeben === schluessel.einwurf);

  if (pfad === "/status" && methode === "GET") {
    const aus = { dienst: "bta-briefkasten", fassung: FASSUNG };
    if (darfAbholen) aus.anzahl = (await ablage.liste()).length;
    return json(200, aus);
  }
  if (pfad === "/einwurf" && methode === "POST") {
    if (!darfEinwerfen) return json(401, { fehler: "Einwurf-Schlüssel fehlt oder ist falsch" });
    let begleit;
    try { begleit = leseBegleitKopf(anfrage.kopf("x-bta-begleit")); } catch (e) { return json(400, { fehler: e.message }); }
    const bytes = await anfrage.bytes();
    if (bytes.length > MAX_BYTES) return json(413, { fehler: `Bild zu groß (${bytes.length} Bytes, erlaubt ${MAX_BYTES})` });
    if (!bytes.length && !Object.keys(begleit).length) return json(400, { fehler: "Weder Bild noch Begleitdatei" });
    const id = neueId();
    await ablage.lege(id, bytes, { eingeworfen: new Date(jetzt).toISOString(), begleit, bytes: bytes.length });
    return json(200, { id, bytes: bytes.length });
  }
  if (pfad === "/liste" && methode === "GET") {
    if (!darfAbholen) return json(401, { fehler: "Abhol-Schlüssel fehlt oder ist falsch" });
    const alle = await ablage.liste();
    const raus = [];
    for (const e of alle) {
      const alter = jetzt - new Date(e.meta && e.meta.eingeworfen || 0).getTime();
      if (alter > HALTEN_MS) { try { await ablage.loesche(e.id); } catch (x) { /* dann beim nächsten Mal */ } continue; }
      raus.push({ id: e.id, bytes: Number(e.meta && e.meta.bytes) || 0, eingeworfen: e.meta && e.meta.eingeworfen, begleit: (e.meta && e.meta.begleit) || {} });
    }
    raus.sort(zeitVergleich);
    return json(200, { eintraege: raus });
  }
  const m = /^\/abholen\/([^/]+)$/.exec(pfad);
  if (m) {
    if (!darfAbholen) return json(401, { fehler: "Abhol-Schlüssel fehlt oder ist falsch" });
    const id = m[1];
    if (!ID_MUSTER.test(id)) return json(400, { fehler: "ungültige Kennung" });
    if (methode === "GET") {
      const e = await ablage.hole(id);
      if (!e) return json(404, { fehler: "nicht (mehr) im Briefkasten" });
      return { status: 200, bytes: e.bytes, kopf: { "Content-Type": "image/jpeg", "Content-Length": String(e.bytes.length), "Cache-Control": "no-store", "X-BTA-Begleit": encodeURIComponent(JSON.stringify((e.meta && e.meta.begleit) || {})), "X-BTA-Eingeworfen": String((e.meta && e.meta.eingeworfen) || ""), ...CORS } };
    }
    if (methode === "DELETE") {
      await ablage.loesche(id);
      return json(200, { id, geloescht: true });
    }
  }
  return json(404, { fehler: "Unbekannter Weg: " + methode + " " + pfad });
}

/* Ablage im Arbeitsspeicher - für den Prüfstand und als Vorlage für echte Ablagen. */
function speicherAblage() {
  const m = new Map();
  return {
    async lege(id, bytes, meta) { m.set(id, { bytes: new Uint8Array(bytes), meta }); },
    async liste() { return [...m.entries()].map(([id, e]) => ({ id, bytes: e.bytes.length, meta: e.meta })); },
    async hole(id) { const e = m.get(id); return e ? { bytes: e.bytes, meta: e.meta } : null; },
    async loesche(id) { m.delete(id); },
    _groesse: () => m.size,
  };
}
/* --- KERN-ENDE --- */

const HALTEN_SEK = 7 * 24 * 3600;
function kvAblage(kv) {
  return {
    async lege(id, bytes, meta) {
      await kv.put("e:" + id, bytes, { expirationTtl: HALTEN_SEK });
      await kv.put("m:" + id, JSON.stringify(meta), { expirationTtl: HALTEN_SEK });
    },
    async liste() {
      const raus = [];
      let cursor;
      do {
        const seite = await kv.list({ prefix: "m:", cursor });
        for (const k of seite.keys) {
          const id = k.name.slice(2);
          let meta = {}; try { meta = JSON.parse((await kv.get(k.name)) || "{}"); } catch (e) { meta = {}; }
          raus.push({ id, bytes: Number(meta.bytes) || 0, meta });
        }
        cursor = seite.list_complete ? null : seite.cursor;
      } while (cursor);
      return raus;
    },
    async hole(id) {
      const metaText = await kv.get("m:" + id);
      if (!metaText) return null;
      const bytes = await kv.get("e:" + id, { type: "arrayBuffer" });
      let meta = {}; try { meta = JSON.parse(metaText); } catch (e) { meta = {}; }
      return { bytes: new Uint8Array(bytes || new ArrayBuffer(0)), meta };
    },
    async loesche(id) { await kv.delete("e:" + id); await kv.delete("m:" + id); },
  };
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const anfrage = {
      methode: request.method,
      pfad: u.pathname,
      kopf: (n) => request.headers.get(n),
      bytes: async () => new Uint8Array(await request.arrayBuffer()),
    };
    const schluessel = { einwurf: env.EINWURF_SCHLUESSEL, abhol: env.ABHOL_SCHLUESSEL };
    if (!env.ABLAGE) return new Response(JSON.stringify({ fehler: "KV-Namensraum ABLAGE ist nicht gebunden" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } });
    const antwort = await behandle(anfrage, kvAblage(env.ABLAGE), schluessel);
    const body = antwort.bytes ? antwort.bytes : antwort.json !== undefined ? JSON.stringify(antwort.json) : null;
    return new Response(body, { status: antwort.status, headers: antwort.kopf || {} });
  },
};
