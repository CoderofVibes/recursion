#!/usr/bin/env bash
# Twin Deeps' learning loop on the DEV build, dumping real game state for the layout mockups.
# Dumps are written beside this script unless S names another folder.
HERE="$(cd "$(dirname "$0")" && pwd)"
S="${S:-$HERE}"
cd "$HERE/../../../docs/handoffs/night/judge-run"
export JUDGE=d
BASE="${BASE:-http://localhost:5183/}"
D="node do.mjs"
X="node $S/dump.mjs"
echo "(() => window.__d.A())()" > "$S/A.js"
echo "(() => window.__d.B())()" > "$S/B.js"
echo "(async () => await window.__d.C())()" > "$S/C.js"
echo "(() => window.__d.D())()" > "$S/D.js"
$D start
$D open "$BASE" :: wait 2500 :: js "localStorage.setItem('recursion:opening-seen','1')" :: open "$BASE" \
   :: waitfor "!!document.querySelector('.cr') && !!window.__recursion" 60000 :: wait 2500 :: key 3 :: wait 1700
$X "$S/helpers.js"

plan() { # $1 = delta-v (retrograde)
  $D click "text=PLAN" :: wait 500 :: click "text=+ BURN" :: wait 400 \
     :: click ".cs-page select" :: wait 200 :: key ArrowDown :: key Enter \
     :: fill ".cs-page input[step='0.5']" "$1" :: wait 200
}

echo "=== attempt 1: preview 16 m/s on model v0 ==="
$D click "text=EXPLORATION" :: wait 500 :: click "text=RECORD DESIGN AND SET UP" :: wait 600
plan 16
$D click "text=PREVIEW" :: wait 8000 :: js "window.__recursion.desk.note"
$X "$S/A.js" "$S/a-preview-v0.json"

dive() { # $1 = delta-v, $2 = tag
  $D fill ".cs-page input[step='0.5']" "$1" :: wait 200 :: click "text=COMMIT" :: wait 3000 \
     :: js "document.querySelector('.cr-status')?.textContent" \
     :: click "text=ENTER GRAVITY RANGE" :: wait 1200
  node watch.mjs 240 "2000×" "$2" --until 08:20
  $X "$S/B.js" "$S/b-flight-$2.json"
  $D click "text=BLACK BOX" :: wait 700 :: click "text=RECALL" :: wait 7000 :: key 3 :: wait 1800 :: issues
}
echo "=== dive 1 (9.85 m/s retrograde) ==="
dive 9.85 d1
echo "=== dive 2 (5 m/s retrograde) ==="
$D click "text=EXPLORATION" :: wait 500 :: click "text=RECORD DESIGN AND SET UP" :: wait 600
plan 5
dive 5 d2
echo "=== model ==="
$D click "text=MODEL" :: wait 6000 :: click "text=TEST"
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16; do
  $D wait 10000 :: js "(() => { const t = document.querySelector('.cs-page')?.innerText ?? ''; return t.slice(t.indexOf('DISTANCE LAW'), t.indexOf('DISTANCE LAW') + 300).replace(/\\n+/g, ' | '); })()" | tee "$S/last.txt"
  if ! grep -q "TESTING" "$S/last.txt"; then break; fi
done
$D click "text=ADOPT" :: wait 8000 :: js "document.querySelector('.cs-foot__note')?.textContent" :: issues
$X "$S/C.js" "$S/c-model.json"
echo "=== third forecast, with the rule ==="
plan 16
$D click "text=PREVIEW" :: wait 8000 :: js "window.__recursion.desk.note" :: issues
$X "$S/D.js" "$S/d-preview-v3.json"
echo "=== done (chrome d left running) ==="
