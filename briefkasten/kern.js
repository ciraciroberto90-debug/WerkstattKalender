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
 *   GET    /zettel  (und /)        der Aufnahme-Zettel als HTML, wenn die Hülle ihn mitgibt (0.2.0)
 *                                  - so kommt der Zettel als echte https-Seite aufs Handy (Robertos
 *                                  Android, mobile Daten, 07.10.): Kamera, Teilen, Speicher und
 *                                  „Zum Startbildschirm" brauchen eine https-Herkunft, keine Datei.
 * Zwei Schlüssel, weil das Handy verloren gehen kann: Der Einwurf-Schlüssel
 * darf nur einwerfen - wer ihn hat, liest nichts. Der Abhol-Schlüssel bleibt
 * auf dem Werkstatt-Server.
 */
"use strict";

const FASSUNG = "0.2.0"; // 0.2.0: liefert den Aufnahme-Zettel unter /zettel aus
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

/* schluessel = { einwurf, abhol } - beide Pflicht beim Betrieb.
 * zettel = HTML des Aufnahme-Zettels (Text) oder null - die Hülle reicht ihn herein
 * (Worker: eingebettet beim Bau, Node: handy/aufnahme-zettel.html von der Platte). */
async function behandle(anfrage, ablage, schluessel, jetzt = Date.now(), zettel = null) {
  const methode = String(anfrage.methode || "GET").toUpperCase();
  const pfad = String(anfrage.pfad || "/").replace(/\/+$/, "") || "/";
  if (methode === "OPTIONS") return { status: 204, kopf: { ...CORS, "Access-Control-Max-Age": "86400" } };
  // Der Zettel braucht keinen Schlüssel: Er enthält keinen - der Einwurf-Schlüssel wird erst am Handy
  // eingetragen. Vor der Schlüssel-Prüfung, damit er auch auf einem halb eingerichteten Worker erscheint.
  if ((pfad === "/zettel" || pfad === "/") && (methode === "GET" || methode === "HEAD")) {
    if (!zettel) return json(404, { fehler: "Kein Aufnahme-Zettel hinterlegt (Worker ohne eingebetteten Zettel bzw. handy/aufnahme-zettel.html fehlt)" });
    // no-cache statt no-store: der Browser darf ihn behalten, fragt aber bei jedem Öffnen nach - ein neuer
    // Stand (nach erneutem Deploy) kommt so sofort an, und offline bleibt die letzte Fassung anzeigbar.
    return { status: 200, text: String(zettel), kopf: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...CORS } };
  }
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

module.exports = { behandle, speicherAblage, FASSUNG, MAX_BYTES, HALTEN_MS, CORS };
