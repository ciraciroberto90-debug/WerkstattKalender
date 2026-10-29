/* Holt Chromium für die Härtetests nach tests/browser/ - einmalig je Rechner,
 * ohne Adminrechte, ohne Installation (Roll-out 73, 29.10.).
 *
 * Aufruf:  node tests/browser-holen.js
 * Hinter dem Firmen-Proxy (eigenes Zertifikat) vorher
 *   NODE_EXTRA_CA_CERTS=<PEM mit den Windows-Wurzeln> setzen, sonst lehnt
 *   Node den Download ab. Der Download ist rund 200 MB.
 */
const path = require("path");
const { spawnSync } = require("child_process");
const UMG = require("./umgebung"); // setzt PLAYWRIGHT_BROWSERS_PATH auf tests/browser
const cli = path.join(__dirname, "node_modules", "playwright-core", "cli.js");
console.log("Ablage: " + UMG.BROWSER_ABLAGE);
const r = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit", env: process.env });
process.exit(r.status === null ? 1 : r.status);
