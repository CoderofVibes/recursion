#!/usr/bin/env bash
# The model's strength-against-distance report BEFORE the law is adopted: two dives, then MODEL.
# Dumps are written beside this script unless S names another folder.
HERE="$(cd "$(dirname "$0")" && pwd)"
S="${S:-$HERE}"
cd "$HERE/../../../docs/handoffs/night/judge-run"
export JUDGE=e
BASE="${BASE:-http://localhost:5183/}"
D="node do.mjs"
X="node $S/dump.mjs"
READY='(() => { const b = [...document.querySelectorAll("button")].find((e) => /^ENTER /i.test(e.textContent.trim()) && !e.closest("[inert]")); return !!b && !b.disabled; })()'
echo "(() => { const { game, desk } = window.__recursion; return JSON.stringify({ report: desk.report, model: game.model.state(), attempts: game.blackBox.archive().attempts.map((a) => ({ id: a.id, index: a.index })) }); })()" > "$S/E.js"
echo "(() => { window.__recursion.desk.refreshReport(true); return 'asked'; })()" > "$S/E0.js"
$D start
$D open "$BASE" :: wait 2500 :: js "localStorage.setItem('recursion:opening-seen','1')" :: open "$BASE" \
   :: waitfor "!!document.querySelector('.cr') && !!window.__recursion" 60000 :: wait 2500 :: key 3 :: wait 1700
dive() { # $1 = delta-v, $2 = tag
  $D click "text=EXPLORATION" :: wait 500 :: click "text=RECORD DESIGN AND SET UP" :: wait 600 \
     :: click "text=PLAN" :: wait 500 :: click "text=+ BURN" :: wait 400 \
     :: click "text=RETROGRADE" :: wait 200 \
     :: fill ".cs-page input[step='0.5']" "$1" :: wait 300 :: click "text=COMMIT" :: wait 1000
  $D waitfor "$READY" 240000 :: click "text=ENTER GRAVITY RANGE" :: wait 1200
  node watch.mjs 240 "2000×" "$2" --until 08:20 | tail -2
  $D click "text=BLACK BOX" :: wait 700 :: click "text=RECALL" :: wait 7000 :: key 3 :: wait 1800 :: issues
}
dive 9.85 e1
dive 5 e2
$D click "text=MODEL" :: wait 12000
$X "$S/E0.js"
$D wait 8000 :: js "(() => { const t = document.querySelector('.cs-page')?.innerText ?? ''; return t.slice(t.indexOf('STRENGTH'), t.indexOf('STRENGTH') + 200).replace(/\\n+/g, ' | '); })()"
$X "$S/E.js" "$S/e-report-before.json"
$D stop
echo "=== done ==="
