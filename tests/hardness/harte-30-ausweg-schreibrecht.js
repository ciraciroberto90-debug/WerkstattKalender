// Härtetest: AUSWEG, wenn der Browser das Nachfragen grundsätzlich ablehnt.
//
// Aus der Werkstatt gemeldet: auch ein frischer Klick auf "Schreibzugriff
// erlauben" endet mit "Not allowed to request permissions in this context".
// Ein frischer Klick hat garantiert gültige Nutzeraktivierung - also liegt
// es NICHT am Timing, sondern der Browser lässt das Nachfragen in dieser
// Umgebung gar nicht zu (z. B. wenn die App über file:// geöffnet wird).
//
// Die App darf sich deshalb nicht auf requestPermission verlassen. Der
// Speichern-Dialog vergibt Schreibrecht unmittelbar, ohne Nachfrage - das
// ist der Ausweg. Geprüft wird hier vor allem das Gefährliche daran:
// dass der vorhandene Datei-Inhalt dabei NICHT verlorengeht.
// Prueft den Ausweg fuer Browser, die das Nachfragen GRUNDSAETZLICH ablehnen
// (requestPermission wirft immer, auch aus einem frischen Klick).
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP = "file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
let ok=0,fail=0; const pruef=(n,c)=>{console.log((c?"PASS | ":"FAIL | ")+n);c?ok++:fail++;};
(async()=>{
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium",headless:true,args:["--no-sandbox"]});
  const p = await (await b.newContext({viewport:{width:1400,height:950}})).newPage();
  await p.addInitScript(()=>{
    // Bestand, der in der Datei schon steht - der darf NICHT verlorengehen.
    const datei = { inhalt: JSON.stringify({format:"werkstatt-kalender-v1",savedAt:"2026-07-20T08:00:00.000Z",
      entries:[{id:"vorhanden-1",date:"2026-07-15",category:"TPM",name:"BTS",status:"done",updatedAt:"2026-07-15T08:00:00.000Z"}],
      deleted:{},config:null}) };
    const bau = (schreibbar) => ({
      name:"kalender-daten.json", kind:"file",
      async getFile(){ return new File([datei.inhalt],"kalender-daten.json",{type:"application/json"}); },
      async createWritable(){
        if(!schreibbar){ const e=new Error("Zugriff verweigert"); e.name="NotAllowedError"; throw e; }
        let puf=""; return { async write(c){puf+=c;}, async close(){datei.inhalt=puf;} };
      },
      async queryPermission(){ return schreibbar ? "granted" : "prompt"; },
      // Dieser Browser laesst das Nachfragen NIE zu - egal wie frisch der Klick ist.
      async requestPermission(){
        const e=new Error("Failed to execute 'requestPermission' on 'FileSystemHandle': Not allowed to request permissions in this context.");
        e.name="SecurityError"; throw e;
      },
    });
    window.__datei = datei;
    window.showOpenFilePicker = async () => [bau(false)];              // nur lesen
    window.showSaveFilePicker = async () => bau(true);                  // Speichern-Dialog: mit Schreibrecht
  });
  const fehler=[]; p.on("pageerror",e=>fehler.push(e.message));
  await p.goto(APP); await p.waitForTimeout(1500);
  await p.getByRole("button",{name:/Gemeinsame Datei/}).first().click(); await p.waitForTimeout(400);
  await p.getByRole("button",{name:/Vorhandene Datei öffnen/}).first().click(); await p.waitForTimeout(2500);

  let t = await p.locator("body").innerText();
  pruef("Hinweis statt stillem Schreibschutz", /Schreibzugriff auf die Datei nicht erteilt/.test(t));
  pruef("Beide Auswege werden angeboten",
    (await p.getByRole("button",{name:/Schreibzugriff erlauben/}).count())>0 &&
    (await p.getByRole("button",{name:/Mit Schreibrecht verbinden/}).count())>0);

  // Weg 1 scheitert - die Meldung muss das erklaeren statt nur zu meckern
  await p.getByRole("button",{name:/Schreibzugriff erlauben/}).first().click(); await p.waitForTimeout(1200);
  t = await p.locator("body").innerText();
  pruef("Fehlermeldung nennt den Grund und den Ausweg",
    /grundsätzlich nicht/.test(t) && /Mit Schreibrecht verbinden/.test(t));
  pruef("Fehlermeldung nennt die Umgebung (Adresse)", /file:/.test(t));

  // Weg 2 muss wirklich helfen
  await p.getByRole("button",{name:/Mit Schreibrecht verbinden/}).first().click(); await p.waitForTimeout(2500);
  t = await p.locator("body").innerText();
  pruef("Danach kein Schreibschutz mehr", !/Schreibschutz/.test(t) && !/nicht erteilt/.test(t));
  pruef("Backlog sichtbar (Bearbeiter)", /BACKLOG/.test(t));

  const inhalt = await p.evaluate(()=>window.__datei.inhalt);
  pruef("Der vorhandene Datei-Inhalt ist NICHT verlorengegangen", /vorhanden-1/.test(inhalt));
  pruef("Keine Skriptfehler", fehler.length===0);
  if(fehler.length) console.log(fehler);
  console.log(`\n==== AUSWEG OHNE NACHFRAGE: ${ok} PASS / ${fail} FAIL ====`);
  await b.close(); process.exit(fail?1:0);
})();
