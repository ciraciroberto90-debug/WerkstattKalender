/* Browser-Reserve ohne Bash:  node tests/run-browser-reserve.js
 * Die fünf Tests für den Dateizugriff über den Browser (vor einer Freigabe,
 * nicht bei jedem Push - siehe run-browser-reserve.sh). */
require("./suite-laufen")("browser-reserve", "Browser-Reserve (Dateizugriff über den Browser)", process.argv.slice(2));
