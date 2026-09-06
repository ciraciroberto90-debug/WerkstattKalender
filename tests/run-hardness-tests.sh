#!/bin/bash
# Run all hardness tests for WerkstattKalender

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARDNESS_DIR="$TESTS_DIR/hardness"

# Die Suite läuft standardmäßig in der Zeitzone der Werkstatt-Rechner.
# Warum: Im UTC-Prüfstand prüfte die Suite einen anderen Zustand als die
# Wirklichkeit - harte-38 war unter Europe/Berlin rot, obwohl die App richtig
# stempelte (der Test verglich gegen einen hart kodierten UTC-String).
# Gemessen am 06.09.2026: 61/61 unter Europe/Berlin, unter faketime 15.01.2027
# und am Zeitumstellungs-Tag 25.10.2026. Wer bewusst eine andere Zone prüfen
# will, setzt TZ vor dem Aufruf - die Vorgabe greift nur, wenn nichts gesetzt ist.
export TZ="${TZ:-Europe/Berlin}"

cd "$TESTS_DIR" || exit 1

echo "🧪 Running WerkstattKalender Hardness Tests"
echo "==========================================="
echo ""

total_pass=0
total_fail=0
test_count=0

for test_file in hardness/harte-*.js; do
  test_name=$(basename "$test_file" .js)
  echo "▶️  Running: $test_name"
  ((test_count++))

  if node "$test_file"; then
    ((total_pass++))
  else
    ((total_fail++))
  fi
  echo ""
done

echo "==========================================="
echo "📊 Summary: $total_pass/$test_count tests passed"

if [ $total_fail -gt 0 ]; then
  echo "❌ $total_fail test(s) failed"
  exit 1
else
  echo "✅ All tests passed!"
  exit 0
fi
