#!/bin/bash
# Run all hardness tests for WerkstattKalender

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARDNESS_DIR="$TESTS_DIR/hardness"

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
