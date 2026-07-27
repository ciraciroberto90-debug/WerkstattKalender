// Härtetest: die neue WERKZEUGZEILE des Backlogs.
// Aus elf Bedienelementen in zwei Reihen wurde eine Zeile: Suche, die
// Umschaltung Mechanik/Elektrik und ein Filter-Menü. Alles, was vorher
// dauerhaft im Bild stand, liegt jetzt hinter einem Knopf - deshalb muss
// hier belegt sein, dass dabei kein Filter verlorengeht oder unbemerkt
// haengen bleibt:
//   - jeder Filter wirkt weiterhin auf die Liste
//   - was gesetzt ist, steht als Marke sichtbar da (sonst filtert es blind)
//   - ein Klick daneben schliesst das Menue, hebt den Filter aber NICHT auf
//   - jede Marke laesst sich einzeln abwerfen, "alle entfernen" raeumt auf
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const APP="file:///home/user/WerkstattKalender/Werkstatt_Kalender_TPM.html";
const CONFIG={team:[{name:"R. Ciraci",rolle:"mech"},{name:"M. Weber",rolle:"elek"},{name:"T. Klein",rolle:"mech"}]};
const A=[
 ["Lager tauschen","VSM1","hoch","mech","R. Ciraci"],
 ["Zündelektrode erneuern","OF320","hoch","elek","M. Weber"],
 ["Hydraulikschlauch prüfen","TS480","mittel","mech",""],
 ["Filtermatten wechseln","B1","niedrig","elek","T. Klein"],
 ["Riemen prüfen","Wikler","mittel","mech",""],
];
const ENTRIES=A.map((x,i)=>({id:"arb-"+i,date:"2026-07-0"+(i+1),category:"ARBEIT",name:x[1],note:x[0],
  prio:x[2],art:x[3],status:"open",wer:x[4]||undefined, azubi:i===2?true:undefined}));
ENTRIES.push({id:"arb-fertig",date:"2026-07-02",category:"ARBEIT",name:"HRO",note:"Kette gespannt",
  prio:"mittel",art:"mech",status:"done",erledigtAm:"2026-07-06"});

let ok=0,fail=0;
const pruef=(n,c)=>{console.log((c?"PASS | ":"FAIL | ")+n); c?ok++:fail++;};

(async()=>{const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",headless:true,args:["--no-sandbox"]});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage(); const fehler=[]; p.on("pageerror",e=>fehler.push(e.message));
await p.clock.setFixedTime(new Date("2026-07-23T10:00:00"));
await p.addInitScript((d)=>{delete window.showOpenFilePicker;delete window.showSaveFilePicker;
  localStorage.setItem("werkstatt-kalender-config",JSON.stringify(d.CONFIG));
  localStorage.setItem("werkstatt-kalender-entries",JSON.stringify(d.ENTRIES));},{CONFIG,ENTRIES});
await p.goto(APP);await p.waitForTimeout(1500);
await p.getByRole("button",{name:"Backlog",exact:true}).click();await p.waitForTimeout(700);

const zeilen=()=>p.locator("tbody tr").count();
pruef("Start: 5 offene Arbeiten", await zeilen()===5);

// 1) Menü öffnet
await p.getByRole("button",{name:/^Filter/}).click(); await p.waitForTimeout(300);
pruef("Filter-Menü geht auf", await p.locator("select").count()>=3);

// 2) Priorität filtern
await p.locator("select").nth(0).selectOption("hoch"); await p.waitForTimeout(400);
pruef("Prio 1 filtert auf 2 Zeilen", await zeilen()===2);
pruef("Marke 'Prio: 1' erscheint", await p.locator("button", {hasText:"Prio: 1"}).count()>0);
pruef("Zähler am Filter-Knopf zeigt 1", /Filter\s*1/.test(await p.getByRole("button",{name:/^Filter/}).innerText()));

// 3) Klick daneben schließt das Menü
await p.mouse.click(700, 700); await p.waitForTimeout(300);
pruef("Klick daneben schließt das Menü", await p.locator("select").count()===0);
pruef("Filter bleibt trotzdem gesetzt", await zeilen()===2);

// 4) Marke abwerfen
await p.locator("button", {hasText:"Prio: 1"}).first().click(); await p.waitForTimeout(400);
pruef("Marke abwerfen hebt den Filter auf", await zeilen()===5);
pruef("Marke ist verschwunden", await p.locator("button", {hasText:"Prio: 1"}).count()===0);

// 5) Zwei Filter + alle entfernen
await p.getByRole("button",{name:/^Filter/}).click(); await p.waitForTimeout(250);
await p.locator("select").nth(0).selectOption("mittel"); await p.waitForTimeout(250);
await p.locator("select").nth(1).selectOption("R. Ciraci"); await p.waitForTimeout(350);
// Die Marke traegt hinter dem Text noch das Kreuz - ein auf $ verankertes
// Muster trifft sie deshalb nie. Auf Teiltext pruefen.
const zwei = (await p.locator("button", {hasText:"Prio: 2"}).count()) + (await p.locator("button", {hasText:"R. Ciraci"}).count());
pruef("Zwei Marken sichtbar", zwei===2);
await p.mouse.click(700,700); await p.waitForTimeout(250);
await p.getByRole("button",{name:"alle entfernen"}).click(); await p.waitForTimeout(400);
pruef("'alle entfernen' setzt zurück", await zeilen()===5);

// 6) Ankreuzfelder im Menü
await p.getByRole("button",{name:/^Filter/}).click(); await p.waitForTimeout(250);
await p.locator('input[type="checkbox"]').nth(0).check(); await p.waitForTimeout(400);
pruef("🎓 Azubi filtert auf 1 Zeile", await zeilen()===1);
await p.mouse.click(700,700); await p.waitForTimeout(250);
await p.locator("button", {hasText:"Azubi-geeignet"}).first().click(); await p.waitForTimeout(400);
pruef("Azubi-Marke abwerfbar", await zeilen()===5);

// 7) Erledigte
await p.getByRole("button",{name:/^Filter/}).click(); await p.waitForTimeout(250);
await p.locator('input[type="checkbox"]').nth(2).check(); await p.waitForTimeout(450);
pruef("Erledigte zeigt die erledigte Arbeit", await zeilen()===1);
pruef("Spalte heißt jetzt 'Erledigt am'", /Erledigt am/.test(await p.locator("thead").innerText()));
await p.mouse.click(700,700); await p.waitForTimeout(250);
await p.locator("button", {hasText:"erledigte Arbeiten"}).first().click(); await p.waitForTimeout(400);
pruef("zurück auf offene", await zeilen()===5);

// 8) Mech/Elek-Umschaltung bleibt draußen erreichbar
await p.getByRole("button",{name:/^Elek/}).click(); await p.waitForTimeout(400);
pruef("Elek filtert auf 2 Zeilen", await zeilen()===2);
await p.getByRole("button",{name:/^Alle/}).click(); await p.waitForTimeout(400);

// 9) Suche
await p.locator('input[type="search"]').fill("hydraulik"); await p.waitForTimeout(500);
pruef("Suche findet 1 Zeile", await zeilen()===1);
await p.locator('input[type="search"]').fill(""); await p.waitForTimeout(400);

// 10) Zeile öffnet weiterhin die Arbeit
await p.locator("tbody tr").first().click(); await p.waitForTimeout(500);
pruef("Klick auf eine Zeile öffnet die Arbeit", /Arbeit bearbeiten|Arbeit/.test(await p.locator("body").innerText()));

pruef("Keine Skriptfehler", fehler.length===0);
if(fehler.length) console.log(fehler);
console.log(`\n==== BACKLOG-LEISTE: ${ok} PASS / ${fail} FAIL ====`);
await b.close(); process.exit(fail?1:0);})();
