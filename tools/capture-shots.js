const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs"), path = require("path");
const STOER = require("/home/user/WerkstattKalender/tools/demo-stoerungen.js");
const APP = "file://" + path.resolve("Werkstatt_Kalender_TPM.html");
const S = "/home/user/WerkstattKalender/scratchpad/shots/";
const HEUTE = "2026-07-23";

const CONFIG = { team: [
  { name:"R. Ciraci", rolle:"mech" }, { name:"M. Weber", rolle:"elek" }, { name:"T. Klein", rolle:"mech" },
  { name:"S. Bauer", rolle:"azubi" }, { name:"A. Fischer", rolle:"elek" }, { name:"J. Wolf", rolle:"mech" },
]};

async function seite(browser, uhr, entries) {
  const ctx = await browser.newContext({ viewport:{width:1280,height:860}, deviceScaleFactor:2 });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date(uhr));
  await p.addInitScript((d)=>{
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(d.CONFIG));
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(d.ENTRIES));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(d.STOER));
  }, {CONFIG, ENTRIES: entries, STOER});
  await p.goto(APP); await p.waitForTimeout(1600);
  return p;
}

/* ---------------------------------------------------------------------
   Schritt 1: die R+I-Termine des Jahres einsammeln.

   Sie stehen NICHT im Bestand - sie ergeben sich aus dem Rhythmus, mit
   Ausweichen auf Wochenenden, Feiertage und zu volle Tage. Sie hier
   nachzurechnen hiesse, die Regel ein zweites Mal zu schreiben und
   damit falsch. Stattdessen wird die Uhr Monat fuer Monat gestellt und
   der Wartungsplan abgelesen - die App rechnet, wir schauen nur zu.
--------------------------------------------------------------------- */
async function riTermineSammeln(browser) {
  const alle = [];
  for (let m = 1; m <= 7; m++) {
    const p = await seite(browser, `2026-${String(m).padStart(2,"0")}-15T10:00:00`, []);
    await p.getByRole("button",{name:"TPM",exact:true}).first().click(); await p.waitForTimeout(500);
    await p.getByRole("button",{name:"Plan",exact:true}).click(); await p.waitForTimeout(900);
    const zeilen = await p.evaluate(()=>
      [...document.querySelectorAll("table tr")].slice(1)
        .map(r=>[...r.children].map(c=>c.innerText.trim()))
        .filter(r=>r[3]==="R+I")
        .map(r=>({ datum:r[0], name:r[2] })));
    zeilen.forEach(z=>{
      const [t,mo,j] = z.datum.split(".");
      alle.push({ date: `${j}-${mo}-${t}`, name: z.name });
    });
    await p.context().close();
  }
  return alle;
}

(async()=>{
  const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium", args:["--no-sandbox"] });

  const riTermine = await riTermineSammeln(b);
  console.log("R+I-Termine Jan-Jul eingesammelt:", riTermine.length);

  const ENTRIES = [];
  ["BTS","VSM1","HRO","OF320","TS200","B+T","RRO","B1","LTA1"].forEach((n,i)=>
    ENTRIES.push({id:"tpm-"+i,date:"2026-07-"+String(i*2+3).padStart(2,"0"),category:"TPM",name:n,status:"done"}));

  // Faellige R+I-Termine als erledigt eintragen - aber nicht alle. Ein
  // Nachweis ohne eine einzige Luecke sieht geschoent aus; die Vorstellung
  // soll zeigen, dass Versaeumtes auch wirklich rot erscheint.
  let offen = 0;
  riTermine.filter(t=>t.date <= HEUTE).forEach((t,i)=>{
    const status = (i % 17 === 5) ? "open" : "done";
    if (status === "open") offen++;
    ENTRIES.push({ id:`ri-${i}`, date:t.date, category:"RI", name:t.name, status });
  });
  console.log("R+I-Eintraege:", ENTRIES.filter(e=>e.category==="RI").length, "| davon offen:", offen);

  const p = await seite(b, "2026-07-23T10:00:00", ENTRIES);
  const shot = async (n,w=0)=>{ if(w) await p.waitForTimeout(w); await p.screenshot({path:S+n+".png"}); };

  await shot("cockpit",1200);
  await p.getByRole("button",{name:"TPM",exact:true}).first().click(); await p.waitForTimeout(700); await shot("tpminfo");
  await p.getByRole("button",{name:"Plan",exact:true}).click(); await p.waitForTimeout(800); await shot("plan");
  await p.getByRole("button",{name:"Auswertung",exact:true}).click(); await p.waitForTimeout(1500); await shot("auswertung");
  // Der Trend steht unter dem Kalender - ohne Scrollen fotografiert man ihn nicht.
  const trend = p.locator("div").filter({ hasText: /^Termintreue – letzte 12 Monate$/ }).first();
  await trend.scrollIntoViewIfNeeded(); await p.waitForTimeout(900);
  const kasten = await trend.locator("xpath=ancestor::div[contains(@class,\'print-bg\')][1]").boundingBox();
  await p.screenshot({ path: S+"trend.png", clip: { x: kasten.x, y: kasten.y, width: kasten.width, height: kasten.height } });
  await p.getByRole("button",{name:"Werkstatt",exact:true}).first().click(); await p.waitForTimeout(500);
  await p.getByRole("button",{name:"Schichtplan",exact:true}).click(); await p.waitForTimeout(700); await shot("schichtplan");
  await p.getByRole("button",{name:"Planung",exact:true}).click(); await p.waitForTimeout(700); await shot("planung");
  await p.getByRole("button",{name:/Störungen/}).first().click(); await p.waitForTimeout(700); await shot("stoerungen");

  // Pruefnachweis oeffnet ein eigenes Fenster - das muss man abfangen,
  // sonst fotografiert man die Seite dahinter.
  await p.getByRole("button",{name:"TPM",exact:true}).first().click(); await p.waitForTimeout(600);
  await p.getByRole("button",{name:"Übersicht",exact:true}).click(); await p.waitForTimeout(800);
  const [nw] = await Promise.all([
    p.context().waitForEvent("page"),
    p.getByRole("button",{name:/Prüfnachweis/}).click(),
  ]);
  // Nur den Kopf des Nachweises: die ganze Tabelle waere auf einer A4-Seite
  // ohnehin unlesbar - und sie liesse die Seite umbrechen.
  await nw.setViewportSize({width:1000,height:620});
  await nw.waitForTimeout(900);
  console.log("Nachweis-Kopf:", (await nw.locator(".summe").innerText()).replace(/\s+/g," "));
  await nw.screenshot({path:S+"nachweis.png"});
  await nw.close();

  console.log("fertig:", fs.readdirSync(S).join(", "));
  await b.close();
})();
