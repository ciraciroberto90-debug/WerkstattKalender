#!/bin/bash
# Browser-Reserve: die Härtetests für den Dateizugriff ÜBER DEN BROWSER
# (Nutzeraktivierung von requestPermission, Dateidialog, Schreibrecht,
# Ausweg über den Speichern-Dialog, toter Verweis aus der IndexedDB).
#
# Warum getrennt (23.09.): Alle Rechner laufen nur noch als Programm - dort
# liefert die Desktop-Brücke die Erlaubnis ohne Nachfrage, dieser Weg ist die
# Reserve "HTML im Chrome". Die fünf Tests kosten zusammen rund 155 s und
# laufen deshalb VOR EINER FREIGABE, nicht bei jedem Push. Sie sind nicht
# gestrichen: Der Browser-Weg ist der Notnagel ohne IT (Grundregel).
export TZ="${TZ:-Europe/Berlin}"
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$TESTS_DIR" || exit 1

echo "🧪 Browser-Reserve (Dateizugriff über den Browser)"
echo "==========================================="
total_pass=0; total_fail=0; test_count=0
for test_file in browser-reserve/harte-*.js; do
  echo "▶️  Running: $(basename "$test_file" .js)"
  ((test_count++))
  if node "$test_file"; then ((total_pass++)); else ((total_fail++)); fi
  echo ""
done
echo "==========================================="
echo "📊 Summary: $total_pass/$test_count tests passed"
if [ $total_fail -gt 0 ]; then echo "❌ $total_fail test(s) failed"; exit 1; fi
echo "✅ All tests passed!"
