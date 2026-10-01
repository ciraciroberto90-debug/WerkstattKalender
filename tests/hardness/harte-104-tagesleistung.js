// Härtetest: KACHEL „TAGESLEISTUNG“ + „TAGESPLAN“ (Robertos Skizze vom 01.10.)
//
// Im Whiteboard-Layout ersetzt die Kachel „Tagesleistung“ die bisherige
// „To-dos · Monat“ (gleiche Kennung k-wbtodo, damit gespeicherte Layouts
// sie an derselben Stelle zeigen). Sie wertet den Tagesplan aus: Soll =
// Plan-Punkte, Termine und To-dos mit Frist heute, Ist = davon erledigt,
// Erfüllungsgrad als kleiner Halbkreis. Die Heute-Liste heißt „Tagesplan“.
//  (T1) Kachel da: Tabelle Soll · Ist · Erfüllungsgrad = 4 · 2 · 50 %
//  (T2) Überschrift der Liste heißt „Tagesplan · …“, nicht mehr „Heute · …“;
//       daneben Datum und Uhrzeit (T2b, 01.10. zweite Runde)
//  (T6) TPM-Kachel des Whiteboards im selben Tabellen-Layout, aus einem
//       gespeicherten Halbkreis-Layout umgeschrieben (wbStand)
//  (T7) Gemessene Harmonie: Köpfe ganz, Zellen gleich hoch, Zahlen bündig
//       mit dem Bogen, keine Fußzeile (Robertos Kritik am ersten Wurf, 3. Runde)
//  (T9) Backlog-Kachel = Tacho (0 · Ziel · Obergrenze), umgeschrieben aus "Backlog live",
//       Zahl unter dem Bogen; (T11) Ziel/Obergrenze aus ⚙ Schwellen & Ziele
//  (T10) Unfälle-Kachel: "BG-meldepflichtige Unfälle", Jahr darunter, grün ohne Unfall
//  (T3) Klick auf die Kachel springt zum Tagesplan
//  (T4) Ein To-do erledigt -> Kachel zeigt 3 · 75 % (ohne Neuladen)
//  (T5) Kein Plan heute -> Kachel ehrlich Soll 0 · Ist 0 · „–“ (ohne Fußzeile)
//  (E)  Keine Skriptfehler
// Rot-Nachweis: Vor dem 01.10. gab es weder die Kennzahl noch die Form
// „tabelle“ (T1 rot), und die Überschrift hieß „Heute“ (T2 rot).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file://" + (process.env.APP_PFAD || "/home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html");

let pass = 0, fail = 0;
const ok = (n, c, zusatz) => { console.log((c ? "PASS" : "FAIL") + " | " + n + (zusatz ? "   (" + zusatz + ")" : "")); c ? pass++ : fail++; };
const HEUTE = "2026-10-01";
// Ohne TPM-Anlagen: sonst plant der Takt-Planer PitStops fuer heute, die zu Recht mitzaehlen - hier soll die Rechnung ueberschaubar bleiben.
const config = { tpmAnlagen: [], riItems: [], team: [{ name: "T. Balles", rolle: "mech" }], benutzer: [{ name: "Chef", rolle: "verwalter", kennwortHash: "" }] };
const entries = [
  { id: "te1", date: HEUTE, category: "TERMIN", name: "Schichtübergabe", status: "done", updatedAt: HEUTE + "T06:00:00.000Z" },
  { id: "te2", date: HEUTE, category: "TERMIN", name: "Lieferant Hydraulik", status: "open", updatedAt: HEUTE + "T06:00:00.000Z" },
  { id: "td1", date: "2026-09-29", category: "TODO", name: "Filter bestellen", wer: "T. Balles", bis: HEUTE, prio: "", bemerkung: "", status: "done", updatedAt: HEUTE + "T06:00:00.000Z" },
  { id: "td2", date: "2026-09-29", category: "TODO", name: "Riemen prüfen", wer: "T. Balles", bis: HEUTE, prio: "", bemerkung: "", status: "offen", updatedAt: HEUTE + "T06:00:00.000Z" },
  { id: "td3", date: "2026-09-29", category: "TODO", name: "Später erst", wer: "T. Balles", bis: "2026-10-09", prio: "", bemerkung: "", status: "offen", updatedAt: HEUTE + "T06:00:00.000Z" },
];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const fehler = [];
  const seite = async (eintraege, cfg = config) => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1000 } }); // Robertos Bildschirmbreite: fuenf Kacheln je ~270 px
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { fehler.push(e.message); console.log("PAGEERROR:", e.message); });
    await p.addInitScript(({ c, e }) => {
      localStorage.setItem("bta-standort", "scheurich");
      localStorage.setItem("werkstatt-kalender-config", JSON.stringify(c));
      localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(e));
      localStorage.setItem("werkstatt-kalender-benutzer", "Chef");
      // Gespeichertes Whiteboard-Layout eines Rechners vom 30.09. - mit der ALTEN
      // Kachel-Definition "To-dos Soll/Ist" auf k-wbtodo. Die App muss sie umschreiben.
      localStorage.setItem("wk-uebersicht-layout", JSON.stringify({
        vorlage: "whiteboard",
        kacheln: ["k-wbtodo", "k-wbtpm", "k-wbunfall", "k-wbbacklog", "k-wbkosten"],
        kachelDef: { "k-wbtodo": { inhalt: "todoSollIst", form: "halbkreis", zeitraum: "monat" }, "k-wbtpm": { inhalt: "tpmQuote", form: "halbkreis", zeitraum: "monat" }, "k-wbunfall": { inhalt: "unfaelle", form: "zahl" }, "k-wbbacklog": { inhalt: "backlogLive", form: "halbkreis" }, "k-wbkosten": { inhalt: "kosten", form: "halbkreis" } },
        // Wie bei Roberto: nur die fünf Whiteboard-Kacheln (die sieben alten aus), dadurch ~300 px je Kachel
        bloecke: { zahlen: false, quote: false, oee: false, uhr: false }, bausteine: [{ id: "kennzahlen", breite: 12 }, { id: "tagesliste", breite: 12 }, { id: "pinnwand", breite: 4 }, { id: "einkauf", breite: 4 }, { id: "heuteDa", breite: 4 }, { id: "stoerungen", breite: 12 }],
      }));
    }, { c: cfg, e: eintraege });
    await p.clock.setFixedTime(new Date(HEUTE + "T10:00:00"));
    await p.goto(APP);
    await p.waitForTimeout(1500);
    return { ctx, p };
  };

  const a = await seite(entries);
  // Die Plan-Punkte des Tages kommen aus dem Takt-Planer (auch mit den Vorgabe-
  // Anlagen) - deshalb wird gegen die LISTE gerechnet: Soll der Kachel muss
  // gleich Zeilen der Tagesplan-Liste + To-dos mit Frist heute sein.
  const listeZaehlen = (p) => p.evaluate(() => {
    const kopf = document.getElementById("wk-tagesplan");
    const block = kopf ? kopf.parentElement : null;
    const zeilen = block ? [...block.querySelectorAll("button.wk-karte")] : [];
    const fertig = zeilen.filter((b) => b.querySelector("strong") && getComputedStyle(b.querySelector("strong")).textDecorationLine.includes("line-through")).length;
    return { zeilen: zeilen.length, fertig };
  });
  const kachel = a.p.locator('[data-kachel-inhalt="tagesleistung"]');
  const ariaVon = async () => (await kachel.count()) ? await kachel.first().locator("[aria-label^='Tagesleistung:']").getAttribute("aria-label") : "";
  const zahlen = (aria) => { const m = /Soll (\d+|–), Ist (\d+|–), Erfüllungsgrad (\d+ %|–)/.exec(aria || ""); return m ? { soll: m[1], ist: m[2], grad: m[3] } : null; };
  const l1 = await listeZaehlen(a.p);
  const kText = (await kachel.count()) ? (await kachel.first().innerText()).replace(/\s+/g, " ") : "";
  const z1 = zahlen(await ariaVon());
  const sollErw = l1.zeilen + 2, istErw = l1.fertig + 1, gradErw = `${Math.round((istErw / sollErw) * 100)} %`;
  ok("(T1) Kachel „Tagesleistung“ ersetzt „To-dos · Monat“ im gespeicherten Whiteboard-Layout: Soll = Listenzeilen + 2 To-dos, Ist = erledigte + 1, Erfüllungsgrad passt",
    (await kachel.count()) === 1 && /Tagesleistung/.test(kText) && /Soll/.test(kText) && /Ist/.test(kText) && /Erfüllungsgrad/.test(kText) && z1 && z1.soll === String(sollErw) && z1.ist === String(istErw) && z1.grad === gradErw && (await a.p.locator('[data-kachel-inhalt="todoSollIst"]').count()) === 0,
    `Liste ${l1.zeilen} Zeilen / ${l1.fertig} fertig · Kachel ${JSON.stringify(z1)} · erwartet ${sollErw}/${istErw}/${gradErw}`);

  const body = await a.p.locator("body").innerText();
  ok("(T2) Die Liste heißt „Tagesplan · Donnerstag, 01.10.“ – nicht mehr „Heute ·“", /TAGESPLAN · DONNERSTAG, 01\.10\./i.test(body) && !/HEUTE · DONNERSTAG/i.test(body), (body.match(/TAGESPLAN · [^\n]*/i) || [""])[0]);
  const kopfText = (await a.p.locator("#wk-tagesplan").innerText()).replace(/\s+/g, " ");
  ok("(T2b) Neben der Überschrift stehen Datum UND Uhrzeit („· 10:00 Uhr“, Roberto 01.10.)", /DONNERSTAG, 01\.10\. · 10:00 UHR/i.test(kopfText), kopfText);

  /* (T6) TPM-Kachel im selben Tabellen-Layout - aus einem gespeicherten Layout mit Halbkreis umgeschrieben */
  const tpm = a.p.locator('[data-kachel-inhalt="tpmQuote"][data-kachel-form="tabelle"]');
  const tpmAria = (await tpm.count()) ? await tpm.first().locator("[aria-label^='TPM-Erfüllungsgrad']").getAttribute("aria-label") : "";
  const tpmText = (await tpm.count()) ? (await tpm.first().innerText()).replace(/\s+/g, " ") : "";
  ok("(T6) TPM-Kachel des Whiteboards ist jetzt die Tabelle „TPM-Erfüllungsgrad · Okt“ (gespeichertes Halbkreis-Layout umgeschrieben); ohne Termine ehrlich Soll 0 · Ist 0 · „–“, keine Fußzeile",
    (await tpm.count()) === 1 && (await a.p.locator('[data-kachel-huelle="k-wbtpm"] [data-kachel-form="tabelle"]').count()) === 1 && /^TPM-Erfüllungsgrad · Okt: Soll 0, Ist 0, Erfüllungsgrad –$/.test(tpmAria || "") && /Soll Ist Erfüllungsgrad 0 0 –$/.test(tpmText), `${tpmAria} | ${tpmText}`);

  /* (T7) Harmonie, gemessen (Robertos Bild vom 01.10.: "Abstände/Größen passen gar nicht"):
     Köpfe in einer Zeile und nicht abgeschnitten, drei Werte-Zellen gleich hoch,
     Zahlen und Bogen schließen unten bündig ab, keine Fußzeile mehr. */
  const masse = await a.p.evaluate(() => [...document.querySelectorAll("[data-tabelle]")].map((t) => {
    const r = (el) => el.getBoundingClientRect();
    const koepfe = [...t.children].slice(0, 3), zellen = [...t.children].slice(4, 7);
    const zahlen = [...t.querySelectorAll("[data-tabelle-zahl]")], svg = t.querySelector("svg");
    const karte = t.closest(".wk-karte");
    return {
      breite: Math.round(r(t).width),
      koepfeGanz: koepfe.every((k) => k.scrollWidth <= k.clientWidth),
      koepfeEineZeile: new Set(koepfe.map((k) => Math.round(r(k).top))).size === 1,
      zellenGleich: new Set(zellen.map((z) => Math.round(r(z).height))).size === 1,
      buendig: zahlen.every((z) => Math.abs(r(z).bottom - r(svg).bottom) <= 1),
      // Roberto 01.10. (dritte Runde): keine Fußzeile - die Tabelle ist das letzte Kind der Karte,
      // die Ampelregel steht nur noch im Tooltip
      // Seit dem Körper-Wrapper (Titel oben, Inhalt mittig) steckt die Tabelle eine Ebene tiefer:
      // sie muss das letzte Kind ihres Körpers sein, und der Körper das letzte Kind der Karte.
      ohneFuss: !karte.querySelector("[data-tabelle-fuss]") && t.parentElement.lastElementChild === t && karte.lastElementChild === t.parentElement && /grün ab|Ziel \d+ %/.test(karte.getAttribute("title") || ""),
    };
  }));
  ok("(T7) Beide Tabellen-Kacheln: Köpfe ganz und in einer Zeile, Zellen gleich hoch, Zahlen bündig mit dem Bogen, keine Fußzeile (Regel im Tooltip)",
    masse.length === 2 && masse.every((m) => m.koepfeGanz && m.koepfeEineZeile && m.zellenGleich && m.buendig && m.ohneFuss), JSON.stringify(masse));

  /* (T8) Roberto 01.10.: "Überschriften der Kachel alle einheitlich schwarz (deutlicher)" -
     die erste Zeile jeder Kennzahl-Kachel (Tabelle, Halbkreis, Zahl) hat dieselbe dunkle Farbe. */
  const titelFarben = await a.p.evaluate(() => [...document.querySelectorAll("[data-kachel-inhalt]")].map((k) => {
    const t = k.firstElementChild; return { inhalt: k.getAttribute("data-kachel-inhalt"), text: (t.innerText || "").trim().slice(0, 24), farbe: getComputedStyle(t).color, fett: getComputedStyle(t).fontWeight };
  }));
  ok("(T8) Alle fünf Kachel-Überschriften sind einheitlich dunkel (rgb(34, 38, 43)) und fett",
    titelFarben.length === 5 && titelFarben.every((t) => t.farbe === "rgb(34, 38, 43)" && Number(t.fett) >= 700), JSON.stringify(titelFarben));

  /* (T9) Roberto 01.10.: Backlog als Tacho (Vorschlag A, Ring aus B) - aus dem gespeicherten
     Halbkreis-Layout umgeschrieben; Vorgaben Ziel 200 · Obergrenze 1000; die Zahl steht UNTER dem
     Bogen (kein Überlappen mit dem Zeiger), Skalentexte liegen im Bogenfeld. */
  const tacho = a.p.locator('[data-kachel-huelle="k-wbbacklog"] [data-kachel-inhalt="backlogOffen"][data-kachel-form="tacho"]');
  const tachoAria = (await tacho.count()) ? await tacho.first().locator("[data-tacho]").getAttribute("aria-label") : "";
  const tachoMasse = (await tacho.count()) ? await tacho.first().evaluate((k) => {
    const r = (el) => el.getBoundingClientRect();
    const svg = k.querySelector("[data-tacho]"), zahl = k.querySelector("[data-tacho-zahl]"), titel = k.firstElementChild;
    const texte = [...svg.querySelectorAll("text")].map((t) => t.textContent);
    return { zahlUnterBogen: r(zahl).top >= r(svg).bottom - 1, bogenUnterTitel: r(svg).top >= r(titel).bottom, texte, zahl: zahl.innerText, inKachel: r(zahl).bottom <= r(k).bottom && r(svg).left >= r(k).left && r(svg).right <= r(k).right };
  }) : null;
  ok("(T9) Backlog-Kachel ist der Tacho (umgeschrieben aus „Backlog live“): 0 offen, Ziel 200, Obergrenze 1000; Zahl unter dem Bogen, Skala 0 · 200 · >1.000",
    (await tacho.count()) === 1 && tachoAria === "Backlog · offen: 0 offen, Ziel 200, Obergrenze 1000" && !!tachoMasse && tachoMasse.zahlUnterBogen && tachoMasse.bogenUnterTitel && tachoMasse.inKachel && tachoMasse.texte.join("|") === "0|200|>1.000" && tachoMasse.zahl === "0",
    `${tachoAria} · ${JSON.stringify(tachoMasse)}`);

  /* (T10) Unfälle-Kachel (Vorlage B): Überschrift "BG-meldepflichtige Unfälle", Jahr als zweite Zeile,
     ohne Unfall Zahl und untere Zeile grün. */
  const unf = a.p.locator('[data-kachel-inhalt="unfaelle"]').first();
  const unfInfo = await unf.evaluate((k) => {
    const zeilen = [...k.querySelectorAll("div")].map((d) => ({ t: d.innerText.trim(), c: getComputedStyle(d).color }));
    const titel = k.firstElementChild.innerText.trim(), jahr = k.querySelector("[data-kachel-jahr]");
    const zahl = zeilen.find((z) => z.t === "0"), sub = zeilen.find((z) => /^Ziel 0 ·/.test(z.t)); // ^: nur die Zeile selbst, nicht der Körper um Zahl + Zeile
    return { titel, jahr: jahr ? jahr.innerText.trim() : null, zahl: zahl && zahl.c, sub: sub && sub.t, subFarbe: sub && sub.c };
  });
  ok("(T10) Unfälle-Kachel: „BG-meldepflichtige Unfälle“, Jahr 2026 darunter, 0 und „Ziel 0 · 273 Tage unfallfrei“ beide grün",
    unfInfo.titel === "BG-meldepflichtige Unfälle" && unfInfo.jahr === "2026" && unfInfo.zahl === "rgb(47, 125, 79)" && unfInfo.sub === "Ziel 0 · 273 Tage unfallfrei" && unfInfo.subFarbe === "rgb(47, 125, 79)", JSON.stringify(unfInfo));

  /* (T3) Klick springt zum Tagesplan */
  await a.p.evaluate(() => window.scrollTo(0, 0));
  await kachel.first().click();
  await a.p.waitForTimeout(900);
  const lage = await a.p.evaluate(() => { const el = document.getElementById("wk-tagesplan"); const r = el && el.getBoundingClientRect(); return { da: !!el, top: r ? Math.round(r.top) : null, innen: r ? r.top >= 0 && r.top < window.innerHeight : false }; });
  ok("(T3) Klick auf die Kachel bringt den Tagesplan ins Bild", lage.da && lage.innen, JSON.stringify(lage));

  /* (T4) To-do erledigt -> Ist + 1, ohne Neuladen */
  await a.p.evaluate(async (HEUTE) => {
    const alt = JSON.parse(localStorage.getItem("werkstatt-kalender-entries"));
    const neu = alt.map((e) => (e.id === "td2" ? { ...e, status: "done", updatedAt: HEUTE + "T10:01:00.000Z" } : e));
    window.dispatchEvent(new CustomEvent("werkstatt-shared-update", { detail: { entries: neu, config: null } }));
  }, HEUTE);
  await a.p.waitForTimeout(800);
  const z4 = zahlen(await ariaVon());
  const grad4 = `${Math.round(((istErw + 1) / sollErw) * 100)} %`;
  ok("(T4) Ein To-do erledigt: Ist + 1 und neuer Erfüllungsgrad ohne Neuladen", z4 && z4.soll === String(sollErw) && z4.ist === String(istErw + 1) && z4.grad === grad4, `${JSON.stringify(z4)} · erwartet ${sollErw}/${istErw + 1}/${grad4}`);
  await a.ctx.close();

  /* (T5) Ohne Termine und To-dos heute: nur die Plan-Punkte zählen (oder „–“, wenn nichts geplant ist) */
  const arbeiten = Array.from({ length: 60 }, (_, i) => ({ id: "ab" + i, date: "2026-09-10", category: "ARBEIT", name: "TS480", note: "Arbeit " + i, status: "open", prio: "ohne", art: "mech", updatedAt: HEUTE + "T06:00:00.000Z" }));
  const b = await seite([...entries.filter((e) => e.id === "td3"), ...arbeiten], { ...config, regeln: { schwellen: { backlogZiel: 50, backlogObergrenze: 300 } } });
  /* (T11) Zielwert und Obergrenze kommen aus ⚙ Schwellen & Ziele: 50 / 300 -> 60 offen ist über dem Ziel (gelb) */
  const tb = b.p.locator('[data-kachel-inhalt="backlogOffen"] [data-tacho]');
  const tbAria = (await tb.count()) ? await tb.first().getAttribute("aria-label") : "";
  const tbText = (await tb.count()) ? await tb.first().evaluate((s) => [...s.querySelectorAll("text")].map((t) => t.textContent).join("|")) : "";
  const tbFarbe = (await tb.count()) ? await b.p.locator('[data-kachel-inhalt="backlogOffen"] [data-tacho-zahl]').first().evaluate((z) => getComputedStyle(z).color) : "";
  ok("(T11) Tacho mit eigenen Schwellen (Ziel 50 · Obergrenze 300): 60 offen -> Skala 0 · 50 · >300, Zahl orange (über dem Ziel)",
    tbAria === "Backlog · offen: 60 offen, Ziel 50, Obergrenze 300" && tbText === "0|50|>300" && tbFarbe === "rgb(201, 122, 43)", `${tbAria} · ${tbText} · ${tbFarbe}`);
  const kb = b.p.locator('[data-kachel-inhalt="tagesleistung"]');
  const l5 = await listeZaehlen(b.p);
  const kbText = (await kb.count()) ? (await kb.first().innerText()).replace(/\s+/g, " ") : "";
  const z5 = zahlen((await kb.count()) ? await kb.first().locator("[aria-label^='Tagesleistung:']").getAttribute("aria-label") : "");
  const t5ok = l5.zeilen === 0 ? (z5 && z5.soll === "0" && z5.ist === "0" && z5.grad === "–" && !/nichts an/.test(kbText)) : (z5 && z5.soll === String(l5.zeilen) && z5.ist === String(l5.fertig));
  ok("(T5) Ohne Termine/To-dos heute: Kachel zählt genau die Plan-Zeilen der Liste (bzw. Soll 0 · Ist 0 · „–“ ohne Plan)", !!t5ok, `Liste ${l5.zeilen}/${l5.fertig} · Kachel ${JSON.stringify(z5)}`);
  await b.ctx.close();

  ok("(E) Keine Skriptfehler", fehler.length === 0, fehler.slice(0, 2).join(" | "));
  await browser.close();
  console.log(`\n📊 Summary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
