const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const fs = require("fs"), path = require("path");
const STOER = require("/home/user/WerkstattKalender/tools/demo-stoerungen.js");
const APP = "file://" + path.resolve("Werkstatt_Kalender_TPM.html");
const S = "/home/user/WerkstattKalender/scratchpad/shots/";

const CONFIG = { team: [
  { name:"R. Ciraci", rolle:"mech" }, { name:"M. Weber", rolle:"elek" }, { name:"T. Klein", rolle:"mech" },
  { name:"S. Bauer", rolle:"azubi" }, { name:"A. Fischer", rolle:"elek" }, { name:"J. Wolf", rolle:"mech" },
]};
const ENTRIES = [];
["BTS","VSM1","HRO","OF320","TS200","B+T","RRO","B1","LTA1"].forEach((n,i)=>ENTRIES.push({id:"tpm-"+i,date:"2026-07-"+String(i*2+3).padStart(2,"0"),category:"TPM",name:n,status:"done"}));
["Wasserrundgang","Energieaufschreibung","Kompressor Rundgang","Werkstattreinigung"].forEach((n,i)=>ENTRIES.push({id:"ri-"+i,date:"2026-07-"+String(i*3+20).padStart(2,"0"),category:"RI",name:n,status:"open"}));

(async()=>{
  const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium", args:["--no-sandbox"] });
  const p = await b.newPage({ viewport:{width:1280,height:860}, deviceScaleFactor:2 });
  await p.clock.setFixedTime(new Date("2026-07-23T10:00:00"));
  await p.addInitScript((d)=>{
    delete window.showOpenFilePicker; delete window.showSaveFilePicker;
    localStorage.setItem("werkstatt-kalender-config", JSON.stringify(d.CONFIG));
    localStorage.setItem("werkstatt-kalender-entries", JSON.stringify(d.ENTRIES));
    localStorage.setItem("werkstatt-stoerungen-entries", JSON.stringify(d.STOER));
  }, {CONFIG,ENTRIES,STOER});
  await p.goto(APP); await p.waitForTimeout(1800);
  const shot = async (n,w=0)=>{ if(w) await p.waitForTimeout(w); await p.screenshot({path:S+n+".png"}); };
  await shot("cockpit",1600);
  await p.getByRole("button",{name:"TPM",exact:true}).first().click(); await p.waitForTimeout(700); await shot("tpminfo");
  await p.getByRole("button",{name:"Plan",exact:true}).click(); await p.waitForTimeout(800); await shot("plan");
  await p.getByRole("button",{name:"Werkstatt",exact:true}).first().click(); await p.waitForTimeout(500);
  await p.getByRole("button",{name:"Schichtplan",exact:true}).click(); await p.waitForTimeout(700); await shot("schichtplan");
  await p.getByRole("button",{name:"Planung",exact:true}).click(); await p.waitForTimeout(700); await shot("planung");
  await p.getByRole("button",{name:/Störungen/}).first().click(); await p.waitForTimeout(700); await shot("stoerungen");
  console.log("fertig:", fs.readdirSync(S).join(", "));
  await b.close();
})();
