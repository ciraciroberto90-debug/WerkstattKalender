// Härtetest: SCHREIBRECHT NACH DEM DATEIDIALOG.
//
// Der Dateidialog des Browsers vergibt nur LESE-Zugriff. Schreiben muss
// ausdrücklich erlaubt werden - und diese Frage beantwortet der Browser nur,
// solange die Nutzeraktivierung des Klicks gilt (rund fünf Sekunden). Steht
// das Auswahlfenster länger offen, kommt die Frage nicht mehr durch.
//
// Genau daran ist die App zwischenzeitlich gescheitert: sie schluckte den
// Fehlschlag und landete still im Schreibschutz. Das ist die schlimmste
// Variante - der Nutzer sieht ein Urteil ("du darfst nicht"), wo in
// Wahrheit nur eine Frage nicht gestellt wurde.
//
// Hier wird auseinandergehalten, was gleich aussieht:
//   (1) Frage geht durch                -> Bearbeiter, kein Banner
//   (2) Frage kommt nicht durch         -> Hinweis + Knopf, ein Klick genügt
//   (3) Laufwerk lässt kein Schreiben zu-> ehrlicher Schreibschutz, KEIN Knopf
//   (4) Nutzer lehnt ausdrücklich ab    -> klare Meldung, keine Verbindung
// Prueft die drei Lagen nach dem Dateidialog:
//   1. Schreibfrage geht durch  -> Bearbeiter, kein Banner
//   2. Schreibfrage kommt nicht durch (Dialog zu lange offen)
//      -> KEIN stiller Schreibschutz, sondern Hinweis + Knopf, und der Knopf hilft
//   3. Der Rechner darf wirklich nicht schreiben -> ehrlicher Schreibschutz
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok=0, fail=0; const pruef=(n,c)=>{console.log((c?"PASS | ":"FAIL | ")+n); c?ok++:fail++;};

async function starte(b, { dialogDauer, ersteFrage, schreibenGeht, schreibFehler, nurErsterVersuch }) {
  const p = await (await b.newContext({ viewport:{width:1400,height:950} })).newPage();
  await p.addInitScript(({dialogDauer, ersteFrage, schreibenGeht, schreibFehler, nurErsterVersuch}) => {
    window.__fragen = 0;
    const datei = { inhalt: JSON.stringify({format:"werkstatt-kalender-v1",savedAt:"2026-07-20T08:00:00.000Z",entries:[],deleted:{},config:null}) };
    let darfSchreiben = false;
    const h = {
      name:"kalender-daten.json", kind:"file",
      async getFile(){ return new File([datei.inhalt],"kalender-daten.json",{type:"application/json"}); },
      async createWritable(){
        if (!darfSchreiben) { const e=new Error("Zugriff verweigert"); e.name="NotAllowedError"; throw e; }
        window.__schreibVersuche = (window.__schreibVersuche || 0) + 1;
        // schreibFehler: welcher Fehler beim Schreiben kommt. "nurErsterVersuch"
        // bildet den echten Fall nach - eine belegte Datei ist Sekunden spaeter frei.
        const werfen = !schreibenGeht && (!nurErsterVersuch || window.__schreibVersuche === 1);
        if (werfen) { const e=new Error("Datei belegt"); e.name = schreibFehler || "NotAllowedError"; throw e; }
        let puf=""; return { async write(c){puf+=c;}, async close(){datei.inhalt=puf;} };
      },
      async queryPermission(){ return darfSchreiben ? "granted" : "prompt"; },
      async requestPermission(){
        window.__fragen++;
        // 1. Frage: je nach Fall. Jede weitere Frage (Knopf) kommt aus einem
        //    frischen Klick und geht deshalb durch.
        if (window.__fragen === 1 && ersteFrage === "wirft") {
          const e=new Error("Failed to execute 'requestPermission' on 'FileSystemHandle': Not allowed to request permissions in this context.");
          e.name="SecurityError"; throw e;
        }
        if (window.__fragen === 1 && ersteFrage === "denied") return "denied";
        darfSchreiben = true; return "granted";
      },
    };
    window.showOpenFilePicker = async () => { await new Promise(r=>setTimeout(r,dialogDauer)); return [h]; };
    window.showSaveFilePicker = async () => { await new Promise(r=>setTimeout(r,dialogDauer)); return h; };
  }, {dialogDauer, ersteFrage, schreibenGeht, schreibFehler, nurErsterVersuch});
  const fehler=[]; p.on("pageerror",e=>fehler.push(e.message));
  await p.goto(APP); await p.waitForTimeout(1500);
  await p.getByRole("button",{name:/Gemeinsame Datei/}).first().click(); await p.waitForTimeout(400);
  await p.getByRole("button",{name:/Vorhandene Datei öffnen/}).first().click();
  await p.waitForTimeout(dialogDauer + 3500);
  return { p, fehler };
}

// Liest, was sich die App dauerhaft gemerkt hat. Genau daran hing der Fehler
// vom 05.08.: Der Zustand ueberlebte jeden Neustart.
const gemerkterModus = (p) => p.evaluate(() => new Promise((fertig) => {
  const anfrage = indexedDB.open("werkstatt-kalender-fs");
  anfrage.onerror = () => fertig("(keine Datenbank)");
  anfrage.onsuccess = () => {
    const db = anfrage.result;
    if (!db.objectStoreNames.contains("handles")) return fertig("(kein Speicher)");
    const t = db.transaction("handles", "readonly").objectStore("handles").get("mode");
    t.onsuccess = () => fertig(t.result === undefined ? "(nichts gemerkt)" : String(t.result));
    t.onerror = () => fertig("(Lesefehler)");
  };
}));

(async()=>{
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium",headless:true,args:["--no-sandbox"]});

  // (1) alles glatt
  { const {p,fehler} = await starte(b,{dialogDauer:300,ersteFrage:"ok",schreibenGeht:true});
    const t = await p.locator("body").innerText();
    pruef("(1) Zuegiger Dialog: KEIN Schreibschutz", !/Schreibschutz/.test(t));
    pruef("(1) Backlog sichtbar (Bearbeiter)", /BACKLOG/.test(t));
    pruef("(1) Keine Skriptfehler", fehler.length===0);
    await p.context().close(); }

  // (2) Dialog zu lange offen -> Frage kam nicht durch
  { const {p,fehler} = await starte(b,{dialogDauer:7000,ersteFrage:"wirft",schreibenGeht:true});
    let t = await p.locator("body").innerText();
    // Der Text behauptet bewusst KEINE Ursache mehr. Die erste Fassung sagte
    // "das Auswahlfenster stand zu lange offen" - das war geraten und falsch.
    pruef("(2) Kein stiller Schreibschutz, sondern klarer Hinweis", /Schreibzugriff auf die Datei nicht erteilt/.test(t));
    pruef("(2) Knopf 'Schreibzugriff erlauben' ist da", (await p.getByRole("button",{name:/Schreibzugriff erlauben/}).count())>0);
    await p.getByRole("button",{name:/Schreibzugriff erlauben/}).first().click();
    await p.waitForTimeout(2500);
    t = await p.locator("body").innerText();
    pruef("(2) Ein Klick genuegt - Hinweis weg", !/Schreibzugriff auf die Datei nicht erteilt/.test(t));
    pruef("(2) Danach kein Schreibschutz mehr", !/Schreibschutz/.test(t));
    pruef("(2) Backlog jetzt sichtbar", /BACKLOG/.test(t));
    pruef("(2) Keine Skriptfehler", fehler.length===0);
    await p.context().close(); }

  // (3) Echter Leser: Der Browser erlaubt es, aber das Laufwerk laesst kein
  //     Schreiben zu (OneDrive nur zum Ansehen freigegeben). Dann ist der
  //     Schreibschutz ein Urteil - kein Knopf soll das Gegenteil versprechen.
  { const {p} = await starte(b,{dialogDauer:300,ersteFrage:"ok",schreibenGeht:false});
    const t = await p.locator("body").innerText();
    pruef("(3) Echter Leser bekommt ehrlichen Schreibschutz", /Schreibschutz/.test(t));
    pruef("(3) Kein irrefuehrender 'erlauben'-Knopf fuer echte Leser",
      (await p.getByRole("button",{name:/Schreibzugriff erlauben/}).count())===0);
    // Gegenprobe zu (5): Bei einem ECHTEN Rechteentzug MUSS die Ruecktufung
    // gemerkt werden - sonst gaelte ein reiner Leser nach dem naechsten Start
    // wieder als Bearbeiter.
    pruef("(3) Die Ruecktufung wird gemerkt", (await gemerkterModus(p)) === "read");
    await p.context().close(); }

  /* (5) Die Datei ist nur BELEGT - kein Rechteentzug.
     Am 05.08.2026 stand ein Arbeitsplatz dauerhaft auf Schreibschutz, nachdem
     das Cockpit versehentlich ein zweites Mal geoeffnet worden war: Der zweite
     Tab wollte schreiben, die Datei war in dem Moment belegt, und die App
     schrieb "nur ansehen" in die Merkliste. Weil die am Ursprung haengt und
     nicht am Tab, galt sie danach fuer alle Fenster - Neustart und neue
     Verknuepfung halfen nicht. Eine belegte Datei darf deshalb NIE als
     Rechteentzug festgeschrieben werden. */
  { const {p} = await starte(b,{dialogDauer:300,ersteFrage:"ok",schreibenGeht:false,
      schreibFehler:"NoModificationAllowedError", nurErsterVersuch:true});
    const t = await p.locator("body").innerText();
    pruef("(5) Belegte Datei fuehrt NICHT in den Schreibschutz", !/Schreibschutz/.test(t));
    pruef("(5) Der Grund wird trotzdem gemeldet", /belegt|nicht beschreiben/.test(t));
    pruef("(5) Und nichts Falsches gemerkt - der Modus bleibt schreibend",
      (await gemerkterModus(p)) !== "read");
    pruef("(5) Bearbeiten ist weiterhin moeglich", /BACKLOG/.test(t));
    await p.context().close(); }

  // (4) Ausdrueckliche Ablehnung im Browser-Dialog: gar keine Verbindung,
  //     dafuer eine klare Meldung.
  { const {p} = await starte(b,{dialogDauer:300,ersteFrage:"denied",schreibenGeht:true});
    const t = await p.locator("body").innerText();
    pruef("(4) Ablehnung wird klar gemeldet", /nicht erlaubt/.test(t));
    pruef("(4) Kein stiller Schreibschutz nach Ablehnung", !/Schreibschutz/.test(t));
    await p.context().close(); }

  console.log(`\n==== SCHREIBRECHT NACH DIALOG: ${ok} PASS / ${fail} FAIL ====`);
  await b.close(); process.exit(fail?1:0);
})();
