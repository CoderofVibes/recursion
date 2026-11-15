#!/usr/bin/env bash
# The played session the montage's stills come from: Twin Deeps on the production build
# (`npm run build`, then `npx vite preview --port 4333 --strictPort`: a dev server reloads the
# page whenever a source file changes), a fresh
# browser profile, real keys and clicks through NIGHT's driver (its learning loop, with 3F's
# labels), at the owner's recording size. Nothing is assigned or edited: every screen shows
# what the game showed.
#   1. node src/trailer/scenes/montage/capture/hold.mjs &     (Chrome, held at 1536 x 864 at 1.25)
#   2. bash src/trailer/scenes/montage/capture/play.sh OUT_DIR [phase ...]
#      phases, in order: open dive1 dive2 model third flight views
#   3. JUDGE=m node docs/handoffs/night/judge-run/do.mjs stop
# The stills land in OUT_DIR as PNG, 1920 x 1080; the eight the montage uses are copied into
# ../stills/ by hand under the montage's shot names (docs/handoffs/tr.md lists which is which).
# Run it from a copy if you mean to edit it meanwhile: bash reads a script as it goes.
# The session of 2026-11-15 ran open to third from this script; its flight and views steps were
# driven by hand through the same driver, in the order views lists them.
OUT="$(cd "$1" && pwd)"
shift
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../../../../../docs/handoffs/night/judge-run" || exit 1
export JUDGE=m
D="node do.mjs"
png() { node "$HERE/png.mjs" "$OUT" "$1"; }
BASE="${BASE:-http://localhost:4333/}"
BLUR="document.activeElement?.blur(); document.querySelector('.cr')?.dataset.mode"
# Focus the visible button with this exact text, then press it with a real Enter.
press() {
  $D js "(() => { const e = [...document.querySelectorAll('button')].find((b) => { if (b.textContent.trim() !== '$1') return false; const r = b.getBoundingClientRect(); if (!r.width) return false; const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return top === b || b.contains(top); }); if (!e) return 'none: $1'; e.focus(); return 'focused ' + e.textContent.trim(); })()" :: key Enter
}
ENTER_READY="!!document.querySelector('.cs-page') && [...document.querySelectorAll('button')].some((b) => /^ENTER /.test(b.textContent.trim()) && !b.disabled)"

dive() { # $1 = delta-v, $2 = tag
  $D click "text=EXPLORATION" :: wait 600 :: click "text=RECORD DESIGN AND SET UP" :: wait 700 \
     :: click "text=PLAN" :: wait 600 :: click "text=+ BURN" :: wait 500 \
     :: click "text=RETROGRADE" :: wait 300 \
     :: fill ".cs-page input[step='0.5']" "$1" :: wait 300 :: click "text=COMMIT" \
     :: waitfor "$ENTER_READY" 60000 :: wait 1500
  png "$2-plan"
  $D click "text=ENTER GRAVITY RANGE" :: wait 1500
  node watch.mjs 420 "2000×" "$2" --until 08:20
  $D click "text=BLACK BOX" :: wait 1200
  png "$2-blackbox-flying"
  $D click "text=RECALL" :: wait 8000 :: key 3 :: wait 2200 :: click "text=BLACK BOX" :: wait 1500
  png "$2-blackbox"
  $D js "document.querySelector('.cs-page')?.innerText.slice(0, 700)" :: issues
}

for phase in "$@"; do
  echo "=== $phase ==="
  case "$phase" in
    open)
      $D open "$BASE" :: wait 24000 :: key 3 :: wait 2000 \
         :: js "[innerWidth, innerHeight, devicePixelRatio, document.querySelector('.cr')?.dataset.mode]"
      png arrival-console
      ;;
    dive1) dive 9.85 d1 ;;
    dive2) dive 5 d2 ;;
    model)
      $D click "text=EXPLORATION" :: wait 1500
      png exploration
      $D click "text=MODEL" :: wait 6000
      png model-before
      $D click "text=TEST"
      for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do
        $D wait 10000 :: js "(() => { const t = document.querySelector('.cs-page')?.innerText ?? ''; return t.slice(t.indexOf('DISTANCE LAW'), t.indexOf('DISTANCE LAW') + 380).replace(/\\n+/g, ' | '); })()" | tee "$OUT/last.txt"
        if ! grep -q "TESTING" "$OUT/last.txt"; then break; fi
      done
      png model-tested
      $D click "text=ADOPT" :: waitfor "[...document.querySelectorAll('button')].some((b) => b.textContent.trim().startsWith('REVOKE'))" 90000 :: wait 2500
      png model-adopted
      $D js "document.querySelector('.cs-page')?.innerText.slice(0, 500)" :: issues
      ;;
    third)
      $D click "text=EXPLORATION" :: wait 600 :: click "text=RECORD DESIGN AND SET UP" :: wait 700 \
         :: click "text=PLAN" :: wait 600 :: click "text=+ BURN" :: wait 500 :: click "text=RETROGRADE" :: wait 300 \
         :: fill ".cs-page input[step='0.5']" 16 :: wait 300 :: click "text=PREVIEW" :: wait 9000
      png plan-with-rule
      $D click "text=COMMIT" :: waitfor "$ENTER_READY" 60000 :: wait 1500
      png plan-committed
      $D js "(() => { const t = document.querySelector('.cs-page')?.innerText ?? ''; return t.slice(0, 900); })()" :: issues
      ;;
    flight)
      # Attempt 3: enter with the 16 m/s plan committed; its burn fires at T+00:10:00. Coast to it
      # at 60x, then fly on at 1x. (Raise warp from the console: once FLIGHT has been opened, the
      # driver's text finder meets the room's hidden time controls first.)
      $D click "text=ENTER GRAVITY RANGE" :: wait 1500
      node watch.mjs 150 "60×" burn --until 00:09
      $D click "text=1×" :: waitfor "(document.querySelector('.cs-foot .cs-time__met')?.textContent.trim() ?? '') >= 'T+00:12:00'" 240000
      ;;
    views)
      # The room's views, by their keys. In MAP and SHIP the driver's text finder meets a hidden
      # twin of the button first, so the visible one is focused by script and pressed with a real
      # Enter; focus is then dropped, so the still shows no keyboard ring.
      $D key Escape :: wait 1500 :: key 1 :: wait 4000
      png map
      press "ENTER REGION"
      $D wait 4500 :: js "$BLUR" :: wait 800
      png region
      $D key Escape :: wait 1200 :: key Escape :: wait 1200 :: key 2 :: wait 3500
      press "POWER"
      $D wait 2500 :: js "$BLUR" :: wait 800
      png ship
      $D key Escape :: wait 1500 :: key 4 :: wait 3500 :: js "$BLUR" :: wait 500
      png flight
      $D issues
      ;;
    *) echo "unknown phase $phase" ;;
  esac
done
echo "=== done ==="
