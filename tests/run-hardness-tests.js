/* Härtetests ohne Bash:  node tests/run-hardness-tests.js [Namensteil …]
 * Mit Namensteilen laufen nur die passenden Dateien, z. B. "harte-70 harte-1-". */
require("./suite-laufen")("hardness", "Running WerkstattKalender Hardness Tests", process.argv.slice(2));
