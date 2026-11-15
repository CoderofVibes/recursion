# Handoff: NIGHT — the judge's run

Thread: Claude (Fable 5.2) · Branch: `p3/night-hardening` (worktree `.worktrees/night`) · Date (Pacific): the night of 2026-11-15

Items 1 and 3 of §NIGHT are done, and item 4 (the judge's run) has been played through all three regions on the production build. Item 2 (the picker) was already merged. `npm run check` and `npm run build` are green.

## State of the game for judges

**What a judge meets, in order, and it works:** the opening (19.5 s, once per browser), the room, the four views by `1`–`4` or the buttons, the console, the region picker, and in every region: plan, enter, fly, warp, lose, the walk back in, the debrief. No console errors or crashes were met anywhere in the run.

| Region | Plan · fly | Lose · recur | Learn | Leave |
|---|---|---|---|---|
| **Twin Deeps** | Works | Works | **Works on the designed path:** two short dives, TEST, ADOPT, a better forecast, about four minutes of wall time | Not reached in one blind try (lost to a belt rock at the Beta pass, named in the debrief). 2F's hand-flown test reaches it |
| **Well Garden** | Works | Works: the entrance funnel pulls a coasting ship into its throat in under 20 min of ship time | The debrief names the throat. The wells are not yet drawn in the window | Not attempted beyond the first loss |
| **Unseen Cathedral** | Works | Works: the lattice fries both power units about four minutes in | The Black Box channel is now on screen and records frames, **but the model's rebuild supports no strands**, so there is nothing to thread by | **Not possible yet** |

**The honest summary:** Twin Deeps is a complete game loop. The Well Garden and the Unseen Cathedral are previews in which a judge can arrive, meet the hazard and die, and read why. The picker's label already says they are previews.

**For the judge's README** (the integrator's): the opening plays once per browser (`?opening=replay` shows it again, with Skip). The learning recipe in Twin Deeps: MISSION › RECORD DESIGN AND SET UP; PLAN › + BURN, retrograde, about 10 m/s, COMMIT; ENTER; 2000× for about 8 h of ship time; BLACK BOX › RECALL; the same again with about 5 m/s; MODEL › TEST, then ADOPT. Keep each dive to a few hours: a very long attempt makes a poor held-out test (below).

## What changed, with commits

| Commit | What |
|---|---|
| `0b656e0` | **1. Photosensitivity (R43):** the loss sequence holds at most three flashes in any second |
| `0b74c90` | **3. The opening in the game (R41, A25, R44):** mounted in `App.tsx`, once per browser; a still sky and a plain fade with reduced motion |
| `7142fa0` | Judge's run, Twin Deeps: the hologram after a loss, MODEL's sideways scroll, a label |
| `9eecbbe` | Judge's run, Twin Deeps: **two blockers in the loop** (the model's queue; alerts behind the console) |
| `1dc4282` | Judge's run, Well Garden: objectives stated on MISSION; one counted line for many precursors |
| `805cce9` | Judge's run, Unseen Cathedral: FLIGHT opens at the region's scale; the Black Box channel on screen and wired through to the model's lattice |

### 1. Photosensitivity (R43)

- **Before:** the room's lights and the hologram flickered on free-running sines: by the new test's counter, about 13 light flashes and 10 hologram blinks in the busiest second, with a third flicker (three cycles in 0.36 s) on the red frame over the scene.
- **Now** (`src/view3d/room/loss.ts`, `lossSequence` in `src/theme/room.ts`): the loss is an authored schedule, a pure function of the time since the loss. The lights sag toward the cut and drop out in three dips (0.14, 0.6 and 1.1 s); the hologram goes dark only with a dip and for good with the last; the red frame is steady; the cut to black at 1.5 s is the last change. Four changes never fall within one second.
- **The canvas itself goes black at the cut.** Before, the lit room could show for one frame between the last of the shake and the overlay's curtain arriving.
- **Reduced motion** (the opening's own "Reduce motion" choice, or the system's setting): the loss neither shakes nor flickers; the lights sink steadily.
- **Tested** (`src/view3d/room/loss.test.ts`): falls and rises counted separately in every rolling second, at 1 kHz and at 24, 30, 60 and 144 frames a second; the hologram blinks only on the dips; the overlay stylesheet has no animation. **Filmed in the production build** (96 frames of a real loss, brightness measured per frame): three dips, black, the pip, the door.

### 3. The opening in the game (R41, A25, R44)

- `App.tsx` mounts `OpeningGate` ahead of the room for the region the expedition starts in, so a first visit wakes into the Gravity range.
- **Once per browser:** one marker (`BROWSER_SLOT` in `src/app/opening/launch.ts`) whatever region or save is loaded. A region opened from the picker never replays it. Recorded progress does not bypass it. `?opening=replay` replays an opening this browser has seen, with Skip.
- **A region opened by its own address** (`?encounter=inverse-wells`) keeps its normal entry and leaves the marker alone, so the opening still plays the first time that browser reaches Twin Deeps. **Owner's call:** if the opening should play ahead of whichever region a browser opens first, it is one line (`appOpening` in `launch.ts`).
- **Erasing** Twin Deeps' records (BLACK BOX › ERASE RECORDS) restores the opening, as OP built it.
- **Reduced motion (R44):** a fully still sky (no anomaly in the window), the alarm light steady, and a plain fade to black over the failure, where full motion has the dark swelling over the window and a cut. Tested in `opening.test.ts`.
- Before a first opening the loading screen is plain black, so the title first appears in the dark (OP's request).
- **Checked in the production build:** plays once and hands off to the live room with no dark frame (brightness sampled through the hand-off); skips on reload and on `?encounter=inverse-wells`; with reduced motion the curtain rises smoothly from the failure to black.

### 4. The judge's run: found and fixed

Played on the production build (`npm run build`, served by `vite preview`) in headless Chrome over the DevTools protocol, with real key and mouse events only, at 1348 × 672 (a laptop's browser window). Nothing was installed, and port 4175 was left alone.

**Twin Deeps**

1. **Blocker: the model fell minutes behind, so TEST never answered.** The bridge queued one hand-over to the model each second whether or not the last had come back. On a long record each takes several seconds, so after a 39 h attempt the queue held minutes of work, and everything behind it waited: the fit at the end of the attempt, TEST (still "TESTING" after nine minutes), a commit's forecast (S20's 186 s COMMITTING). Now one timed hand-over is out at a time; what is recorded meanwhile goes in the next, in order; a forecast still takes everything first (`src/game/belief/model-bridge.ts`, tested with a slow stand-in). On the fixed build the same test answered in under 30 s.
2. **Blocker for A12: no alerts behind the console.** The passes ahead and the miss from the forecast are worked out by the flight hologram, which was not updated behind the console's screen, SHIP or the MAP. A ship coasting at warp from the console met no "off the forecast" or close-pass alert and never dropped to 1×. The room now keeps them current five times a second (`RoomView.followFlight`). Verified in the production build: at 2000× with the console up, warp dropped to 1× with "OFF THE FORECAST".
3. **After a loss the hologram turned slowly round** from the dead attempt's heading for up to nine seconds, so the player walked back in to a tilted, unreadable picture. It now starts on the arrival's heading (tested in `flight.test.ts`).
4. MODEL scrolled sideways at laptop width (one long label squeezed its value off the page); a console line's label now wraps.
5. The configuration chip read ALLDEPLOYED; it reads ALL DEPLOYED.

**Well Garden**

6. MISSION named its objectives only as "REACH-REGION · FORWARD TRANSIT". It now states each objective's conditions as the ship believes them: "REACH · Forward transit · a region 700 km across, 1,438 km from the ship" (`objectiveLine` in `src/console/data.ts`, tested).
7. A field of wells announces 216 precursors at once, and FLIGHT stacked 216 copies of one alert ("+212 more"). Sightings of one kind due together are now one line with a count (tested).
8. The debrief named the throat by an internal id (`funnel-0-core`); it now uses the briefing's name.

**Unseen Cathedral**

9. **Dead end: FLIGHT opened at a 1,500 km range** in a region a few kilometres across: an empty hologram, some thirty zoom presses from anything. FLIGHT now opens with the nearest briefed body two thirds of the way to the rim, which is the Gravity range's own framing: 1,500 km there, 160 km in the Well Garden, 2.2 km in the Cathedral; RESET returns to it (`openingRange` in `FlightHolo.ts`, tested).
10. **Dead end: the Black Box function was on no screen.** 3C's panel, 2F's belief-side data for it and 2D's mount point all existed; nothing registered the panel (2D's request 13). It is now beside FLIGHT as "Black Box · channel 03" (brief §6: an unexplained channel with an adjustable allocation), sending 3C's own commands. Live in the production build: Survey or Thread delivers 350 or 1,000 W, the recorder runs at 10 Hz and frames are retained.
11. **The model's rebuild of the lattice never reached the screens.** Once lattice frames are recorded, each hand-over asks the model for the lattice rebuilt from them (`ModelClient.lattice`, 2C) and `BelievedWorld.fields` carries it, where FLIGHT's lattice view draws supported strands. Rebuilds are paced (a rest of four times what the last one took), since their cost grows with the frames. The panel shows the model's own account of what it supports. Belief only (P11). Tested with a stand-in and, in `src/game/lattice-loop.test.ts`, on the real ship, recorder and model.

## Found, not fixed (ranked)

1. **The Cathedral cannot be threaded: the rebuild supports no strands on the real lattice** (model, 2C, with 3C). With the function at 1,000 W for 150 s the ship records 201 frames and 19,296 fragments; the model makes 18,999 tracks of them and fits 2,952 features, and **every one is rejected as "too few" observations: 0 supported**. Nearly every fragment starts its own track, so nothing is seen often enough to pass its held-out test. 2C's flight test passes on a single 160 m fence; the encounter has twenty overlapping fences. The panel now says this in the model's words ("0 of 2,495 fitted features supported by held-out frames"). Also, at 350 W frames arrive about once in six seconds (2F's note: sensors acquire at each tick's start; R20 is open). Not touched: the association gates and support thresholds are 2C's stated settings, and loosening them could draw strands that are not there. Reproduce with `src/game/lattice-loop.test.ts` (change `survey` to `thread` and print the field's `visual.reconstruction`).
2. **The true law fails its held-out test on long or messy attempts** (model, 2C). With a 39 h attempt held out: "fails · T/ν 926,160,514 against 1.05", though the fitted exponent is 2.5001. With that attempt as the fit and a 6 h attempt with a misaligned 40 m/s burn held out: "fails · T/ν 73.7 against 1.13", RMS 7,929 m → 116 m. The page says "the held-out attempt departs from it", which reads as "the law is wrong". A judge who flies freely will likely meet this; one who flies two short clean dives will not. Not touched: the threshold and statistics are claims.
3. **The Well Garden's wells are not in the window** (R31, 2D's request 19). FLIGHT says "216 precursors in the window" and the window shows stars. The seam exists (`EncounterSetup.window`, `WindowView.fields`, the drawing in `funnelSky.ts`), and the Gravity range's clouds fill it; the wells' hook (`withFunnels` in `src/game/funnels.ts`) gives dynamics and hazards but no `window`. Filling it means calling 3B's `projectFunnelOptics` for some 2,600 sites with culling and level of detail at the source: a feature, not a fix, so it was left.
4. **No radiation caution before the lattice kills** (R37, open): at warp the first sign is "Critical power short", one second before the loss. The loss review 2C built (the dose-rate spike, the failures in order) is not on the debrief yet, so "SHIP LOST · POWER" is all the Cathedral's debrief says.
5. **After a forecast ends there are no pass alerts.** On the slingshot the forecast ended at T+11 h, and the ship coasted 20 h at 2000× into a belt rock with no warp drop. By design a forecast must be re-issued on the way (A6); a judge may not know. "Past the forecast horizon" is an advisory and does not drop warp.
6. **An attempt flown without RECORD DESIGN AND SET UP** has no design to be judged against. Allowed by design; a judge may not notice the button.
7. **Turning by hand feels unresponsive.** Flying by hand works (in the Well Garden, holding `W` six seconds took the speed from 44.7 to 49.5 m/s and 46 kg of propellant, and releasing issued a coasting forecast), but `Q`/`E` turn the 30 t ship about a degree every two seconds, so a judge may think the keys do nothing. PLAN's turn line states the time honestly ("80° turn needs 3.4 min"); FLIGHT says nothing while a key is held.
8. A hitch of about 0.6 s as the opening hands off to the live room (each builds its own scene).
9. The Cathedral's record is large for its length: 97,351 records in four minutes of ship time.
10. At laptop width two readouts on MODEL are cut short with an ellipsis; FLIGHT's right column runs below the fold once the Cathedral's panel is in it (it scrolls).
11. `motion.flicker` (60 ms, two cycles: the visual direction's damage flicker) is defined in the theme and used nowhere. If something adopts it, many items damaged together could exceed three flashes a second: gate it then.

## Requests outside my ownership

- **Integrator, `tools/studies/s15` and `s20` runners, and `prototypes/shots/capture.mjs`:** they wait for `.cr` (or the dev handle) on a fresh profile, which now arrives after the 19.5 s opening. Set the marker before the page's scripts run (`Page.addScriptToEvaluateOnNewDocument` with `localStorage.setItem('recursion:opening-seen', '1')`), or load a region by `?encounter=…`.
- **Integrator, ledger:** R41, R43 and R44 are done here. 2D's request 13 (register `ChainLinkPanel`) is done here, in 3C's folder `src/console/encounters/chain-link/index.ts`: tell 3C. R20, R31 and R37 are still open and are what items 1, 3 and 4 above wait on.
- **VX:** `RoomView.ts` changed in the loss (`stepDeath`, the end of `frame`, `lose`, the constructor's options) and gained `followFlight` and `setFlightRange`; nothing in the window parts. `outside.ts` is untouched.
- **2C:** items 1 and 2 above.

## How to verify

```powershell
npm run check
npm run build
npx vitest run src/view3d/room/loss.test.ts src/app/opening/opening.test.ts src/game/belief/model-bridge.test.ts src/game/lattice-loop.test.ts src/view3d/flight/flight.test.ts src/console
npm run harness -- --suite smoke
npm run harness -- --suite learning
```

- `npm run check`: typecheck and lint pass; **1,254 tests pass, 1 skipped** (not mine), plus the speed suite. Main had 1,234.
- `npm run build`: passes (the existing chunk-size and dynamic-import warnings).
- `npm run harness -- --suite smoke`: its three flights pass. `--suite learning` (the real model through the changed bridge): execution completed, no model errors, the held-out test, adoption and live adopt/revoke checks hold, and the fitted exponent is 2.4997512, the same as in 3E's handoff. Acceptance stays incomplete, as 3E reports it. The harness's reports were not committed.
- No test, tolerance or claim was loosened. One assertion changed, for R44, which replaces what it stated: reduced motion now has no anomaly in the sky at all, where the test held the anomaly's dark under a cap.

## Playing it again the same way

`docs/handoffs/night/judge-run/` holds the driver used for the run: installed headless Chrome over the DevTools protocol, plain Node, nothing installed, real key and mouse events only. It writes its browser profile, state and screenshots to the system's temporary folder, never into the repository.

```powershell
npm run build
npx vite preview --port 4311 --strictPort
```

```powershell
node docs/handoffs/night/judge-run/do.mjs start
node docs/handoffs/night/judge-run/do.mjs open http://localhost:4311/ :: wait 23000 :: key 3 :: wait 1700 :: text .cs-screen 600 :: shot mission :: issues
node docs/handoffs/night/judge-run/watch.mjs 60 2000× dive --until 08:20
node docs/handoffs/night/judge-run/do.mjs stop
```

- `do.mjs` runs steps against a Chrome that stays up between calls (`open`, `key`, `hold`, `click`, `fill`, `wait`, `waitfor`, `text`, `shot`, `js`, `issues`, `media reduced`, `size`, `clear`). `issues` prints every page error and console error or warning since the last call.
- `watch.mjs` follows an attempt at warp, prints each change (alerts, warp drops with their reason, the phase), raises warp again after a drop if asked, and films a loss frame by frame.
- `learning-loop.sh` (Git Bash) plays Twin Deeps' designed learning loop unattended, from a fresh browser through the opening to the adopted law: about four minutes.
- `JUDGE=<name>` gives a second, separate browser.

## Screenshots

In `docs/handoffs/night/`, from the production build:

| File | Shows |
|---|---|
| `01-opening-earth.jpg`, `02-opening-title.jpg`, `03-room-after-opening.jpg` | The opening in the game, and the room it wakes into |
| `04-opening-reduced-motion-fade.jpg` | Reduced motion: a still sky, the plain fade |
| `05-twin-deeps-mission-picker.jpg` | MISSION with the region picker |
| `06-twin-deeps-off-the-forecast.jpg` | FLIGHT as the Newtonian forecast fails |
| `07-loss-shake.jpg`, `08-loss-pip.jpg` | The loss sequence |
| `09-twin-deeps-law-adopted.jpg`, `10-twin-deeps-forecast-with-rule.jpg` | The distance law adopted, and the forecast it gives |
| `11-well-garden-precursors-before-fix.jpg`, `14-well-garden-after.jpg` | The stacked alerts at 1,500 km, before fixes 7 and 9; one counted line at 160 km, after |
| `12-cathedral-flight-before-fix.jpg` | The empty hologram, before fix 9 |
| `13-cathedral-black-box-channel.jpg` | The Cathedral at 2.2 km with the Black Box channel reporting |
