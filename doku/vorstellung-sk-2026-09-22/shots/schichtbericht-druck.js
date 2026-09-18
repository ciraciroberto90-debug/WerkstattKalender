// Schichtbericht aus den Praesentations-Beispieldaten ueber den echten
// Druckweg holen (Drucken -> "Am Bildschirm zeigen"), als A4-PDF rendern,
// in JPG wandeln und auf den Inhalt zuschneiden.
const { chromium } = require("/home/user/WerkstattKalender/node_modules/playwright-core");
const { bauePlatte, seiteLaden } = require("./saat.js");
const fs = require("fs");
const { execSync } = require("child_process");
const OUT = __dirname;

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1500, height: 940 } });
  const { platte } = await bauePlatte(ctx);
  const p = await seiteLaden(ctx, platte);
  await p.getByRole("button", { name: /^Berichte/ }).first().click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: /^Störungen/ }).first().click(); await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Drucken" }).first().click(); await p.waitForTimeout(500);
  await p.getByRole("button", { name: /Am Bildschirm zeigen/ }).click(); await p.waitForTimeout(600);
  const html = await p.evaluate(() => window.__druckHtml || "");
  fs.writeFileSync(`${OUT}/21-druck-schichtbericht.html`, html);
  const pg = await ctx.newPage();
  await pg.setContent(html, { waitUntil: "networkidle" });
  await pg.pdf({ path: `${OUT}/21-druck-schichtbericht.pdf`, landscape: true, format: "A4", printBackground: true, margin: { top: "4mm", bottom: "4mm", left: "4mm", right: "4mm" } });
  await b.close();
  execSync(`cd "${OUT}" && rm -f 21-druck-schichtbericht.jpg 21-sb-*.jpg && pdftoppm -jpeg -r 200 -f 1 -l 1 21-druck-schichtbericht.pdf 21-sb && mv 21-sb-1.jpg 21-druck-schichtbericht.jpg`);
  // Auf den Inhalt zuschneiden (weisser Rand unten weg), kleiner Rand bleibt
  execSync(`python3 - <<'EOF'
from PIL import Image, ImageChops
p = "${OUT}/21-druck-schichtbericht.jpg"
im = Image.open(p).convert("RGB")
bg = Image.new("RGB", im.size, (255, 255, 255))
bbox = ImageChops.difference(im, bg).getbbox()
if bbox:
    l, t, r, bt = bbox
    im.crop((max(0, l - 20), max(0, t - 20), min(im.width, r + 20), min(im.height, bt + 24))).save(p, quality=92)
print("zugeschnitten:", Image.open(p).size)
EOF`, { stdio: "inherit" });
  console.log("druck:", html.length, "Zeichen");
})().catch((e) => { console.error(e); process.exit(1); });
