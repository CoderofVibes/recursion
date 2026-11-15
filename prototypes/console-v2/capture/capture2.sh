#!/usr/bin/env bash
# Continue in Chrome "d" (attempt 3 at arrival, a 16 m/s draft on PLAN): fly the second dive,
# test and adopt the law, dump the model and the forecast with the rule.
# Dumps are written beside this script unless S names another folder.
HERE="$(cd "$(dirname "$0")" && pwd)"
S="${S:-$HERE}"
cd "$HERE/../../../docs/handoffs/night/judge-run"
export JUDGE=d
D="node do.mjs"
X="node $S/dump.mjs"
READY='(() => { const b = [...document.querySelectorAll("button")].find((e) => /^ENTER /i.test(e.textContent.trim()) && !e.closest("[inert]")); return !!b && !b.disabled; })()'
$D click "text=EXPLORATION" :: wait 500 :: click "text=RECORD DESIGN AND SET UP" :: wait 600 :: click "text=PLAN" :: wait 500 \
   :: fill ".cs-page input[step='0.5']" 5 :: wait 300 :: click "text=COMMIT" :: wait 1000
$D waitfor "$READY" 240000 :: js "document.querySelector('.cs-foot__note')?.textContent" :: click "text=ENTER GRAVITY RANGE" :: wait 1200
node watch.mjs 240 "2000×" d3 --until 08:20
$X "$S/B.js" "$S/b-flight-d3.json"
$D click "text=BLACK BOX" :: wait 700 :: click "text=RECALL" :: wait 7000 :: key 3 :: wait 1800 :: issues
echo "=== model ==="
$D click "text=MODEL" :: wait 8000 :: js "(() => { const t = document.querySelector('.cs-page')?.innerText ?? ''; return t.slice(t.indexOf('HOLD OUT'), t.indexOf('HOLD OUT') + 260).replace(/\\n+/g, ' | '); })()" :: click "text=TEST"
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do
  $D wait 10000 :: js "(() => { const t = document.querySelector('.cs-page')?.innerText ?? ''; return t.slice(t.indexOf('DISTANCE LAW'), t.indexOf('DISTANCE LAW') + 300).replace(/\\n+/g, ' | '); })()" | tee "$S/last.txt"
  if ! grep -q "TESTING" "$S/last.txt"; then break; fi
done
$D click "text=ADOPT" :: wait 9000 :: js "document.querySelector('.cs-foot__note')?.textContent" :: issues
$X "$S/C.js" "$S/c-model.json"
echo "=== forecast with the rule ==="
$D click "text=PLAN" :: wait 500 :: click "text=+ BURN" :: wait 400 :: click "text=RETROGRADE" :: wait 200 \
   :: fill ".cs-page input[step='0.5']" 16 :: wait 200 :: click "text=PREVIEW" :: wait 9000 :: js "window.__recursion.desk.note" :: issues
$X "$S/D.js" "$S/d-preview-v3.json"
echo "=== done ==="
