#!/usr/bin/env bash
# The designed learning loop in Twin Deeps, as a judge following the README would play it:
# two short dives with a Recall between, TEST the distance law held out, ADOPT, a third forecast.
# Instance "h" (its own headless Chrome and profile). Real keys and clicks only.
cd "$(dirname "$0")"
export JUDGE=h
D="node do.mjs"
$D start
$D open "${BASE:-http://localhost:4311/}" :: wait 23000 :: key 3 :: wait 1700

dive() { # $1 = delta-v, $2 = tag
  $D click "text=EXPLORATION" :: wait 500 :: click "text=RECORD DESIGN AND SET UP" :: wait 600 \
     :: click "text=PLAN" :: wait 500 :: click "text=+ BURN" :: wait 400 \
     :: click ".cs-page select" :: wait 200 :: key ArrowDown :: key Enter \
     :: fill ".cs-page input[step='0.5']" "$1" :: wait 200 :: click "text=COMMIT" :: wait 3000 \
     :: js "document.querySelector('.cr-status')?.textContent" \
     :: click "text=ENTER GRAVITY RANGE" :: wait 1200 :: shot "$2-entered"
  node watch.mjs 240 "2000×" "$2" --until 08:20
  $D shot "$2-flown" :: click "text=BLACK BOX" :: wait 700 :: click "text=RECALL" :: wait 7000 \
     :: key 3 :: wait 1800 :: js "document.querySelector('.cs-page')?.innerText.slice(0, 900)" :: issues
}

echo "=== dive 1 (9.85 m/s retrograde) ==="
dive 9.85 d1
echo "=== dive 2 (5 m/s retrograde) ==="
dive 5 d2
echo "=== model ==="
$D click "text=MODEL" :: wait 6000 :: js "document.querySelector('.cs-page')?.innerText.slice(0, 260)" \
   :: js "(() => { const t = document.querySelector('.cs-page')?.innerText ?? ''; return t.slice(t.indexOf('HOLD OUT'), t.indexOf('HOLD OUT') + 300); })()" \
   :: click "text=TEST"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  $D wait 10000 :: js "(() => { const t = document.querySelector('.cs-page')?.innerText ?? ''; return t.slice(t.indexOf('DISTANCE LAW'), t.indexOf('DISTANCE LAW') + 380).replace(/\\n+/g, ' | '); })()" | tee "${TMPDIR:-/tmp}/recursion-judge-last.txt"
  if ! grep -q "TESTING" "${TMPDIR:-/tmp}/recursion-judge-last.txt"; then break; fi
done
$D shot model-tested :: click "text=ADOPT" :: wait 6000 :: shot model-adopted \
   :: js "(() => { const t = document.querySelector('.cs-page')?.innerText ?? ''; return [t.slice(0, 200), t.slice(t.indexOf('DISTANCE LAW'), t.indexOf('DISTANCE LAW') + 500), document.querySelector('.cr-status')?.textContent]; })()" :: issues
echo "=== third forecast, with the rule ==="
$D click "text=PLAN" :: wait 500 :: click "text=+ BURN" :: wait 400 :: click ".cs-page select" :: wait 200 :: key ArrowDown :: key Enter \
   :: fill ".cs-page input[step='0.5']" 16 :: wait 200 :: click "text=PREVIEW" :: wait 6000 :: shot plan-with-rule \
   :: js "(() => { const t = document.querySelector('.cs-page')?.innerText ?? ''; return t.slice(t.indexOf('FORECAST'), t.indexOf('FORECAST') + 520); })()" :: issues
echo "=== done ==="
