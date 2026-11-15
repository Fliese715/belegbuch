#!/bin/sh
# Führt alle Rauchtests aus (Node.js + Playwright mit Chromium nötig).
# Ein Test gilt als bestanden, wenn er ohne Absturz durchläuft und keinen Seitenfehler meldet.
cd "$(dirname "$0")/.." || exit 1
fail=0
for t in tests/*.test.js; do
  out=$(node "$t" 2>&1)
  if [ $? -eq 0 ] && echo "$out" | grep -q "Fehler[^:]*: keine" && ! echo "$out" | grep -q "Fehler[^:]*: [^k]"; then
    echo "ok    $t"
  else
    echo "FEHLT $t"; echo "$out" | tail -5; fail=1
  fi
done
exit $fail
