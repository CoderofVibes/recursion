# Handoff: NIGHT — the judge's run

Thread: Claude (Fable 5.2) · Branch: `p3/night-hardening` (worktree `.worktrees/night`) · Date (Pacific): the night of 2026-11-15

**Interim: kept current as the run goes.** Items 1 and 3 of §NIGHT are done (item 2, the picker, was already merged). Item 4, the judge's run, is in progress: Twin Deeps is played through its whole learning loop; the Well Garden and the Unseen Cathedral are being played now.

## What changed, with commits

| Commit | What |
|---|---|
| `0b656e0` | **Photosensitivity (R43).** The loss sequence holds at most three flashes in any second |
| `0b74c90` | **The opening in the game (R41, A25, R44).** Mounted in `App.tsx`, once per browser; still sky and a plain fade with reduced motion |
| `7142fa0` | Judge's run, Twin Deeps: the hologram after a loss, MODEL's sideways scroll, a label |
| `9eecbbe` | Judge's run, Twin Deeps: **two blockers in the loop** (the model's queue; alerts behind the console) |
| (next) | Judge's run, Well Garden: objectives stated on MISSION; one counted line for many precursors |

### 1. Photosensitivity (R43)

- **Before:** the room's lights and the hologram flickered on free-running sines: measured with the new test's counter, about 13 light flashes and 10 hologram blinks in the busiest second, with a third flicker (three cycles in 0.36 s) on the red frame over the scene.
- **Now** (`src/view3d/room/loss.ts`, `lossSequence` in `src/theme/room.ts`): the loss is an authored schedule, a pure function of the time since the loss. The lights sag toward the cut and drop out in three dips (0.14, 0.6 and 1.1 s); the hologram goes dark only with a dip and for good with the last; the red frame is steady; the cut to black at 1.5 s is the last change. Four changes never fall within one second.
- **The canvas itself goes black at the cut.** Before, the lit room could show for one frame between the last of the shake and the overlay's curtain arriving.
- **Reduced motion** (the opening's own "Reduce motion" choice, or the system's setting): the loss neither shakes nor flickers; the lights sink steadily.
- **Tested** (`src/view3d/room/loss.test.ts`): falls and rises counted separately in every rolling second, at 1 kHz and at 24, 30, 60 and 144 frames a second; the hologram's blinks only on the dips; the overlay stylesheet has no animation. Filmed in the production build (96 frames of a real loss): three dips, black, the pip, the door.

### 3. The opening in the game (R41, A25, R44)

- `App.tsx` mounts `OpeningGate` ahead of the room for the region the expedition starts in, so a first visit wakes into the Gravity range.
- **Once per browser:** one marker (`BROWSER_SLOT` in `src/app/opening/launch.ts`) whatever region or save is loaded. A region opened from the picker never replays it. Recorded progress does not bypass it. `?opening=replay` replays an opening this browser has seen, with Skip.
- **A region opened by its own address** (`?encounter=inverse-wells`) keeps its normal entry and leaves the marker alone, so the opening still plays the first time that browser reaches Twin Deeps. **Owner's call:** if the opening should play ahead of whichever region a browser opens first, it is one line (`appOpening` in `launch.ts`).
- **Erasing** Twin Deeps' records (BLACK BOX › ERASE RECORDS) restores the opening, as OP built it.
- **Reduced motion (R44):** a fully still sky (no anomaly in the window), the alarm light steady, and a plain fade to black over the failure, where full motion has the dark swelling over the window and a cut. Tested in `opening.test.ts`.
- Before a first opening the loading screen is plain black, so the title first appears in the dark (OP's request).
- **Checked in headless Chrome on the production build:** plays once (19.5 s) and hands off to the live room with no dark frame; skips on reload and on `?encounter=inverse-wells`; no console errors. There is a hitch of about 0.6 s at the hand-off while the live room starts (the opening and the room each build their own scene).

### 4. The judge's run: found and fixed

Played on the production build (`npm run build`, served by `vite preview`) in headless Chrome over the DevTools protocol, with real key and mouse events only, at 1348 × 672 (a laptop's browser window). Nothing was installed.

**Twin Deeps**

1. **Blocker: the model fell minutes behind, so TEST never answered.** The bridge queued one hand-over to the model each second whether or not the last had come back. On a long record each takes several seconds, so after a 39 h attempt the queue held minutes of work, and everything behind it waited: the fit at the end of the attempt, TEST (still "TESTING" after nine minutes), a commit's forecast (S20's 186 s COMMITTING). Now one timed hand-over is out at a time; what is recorded meanwhile goes in the next, in order; a forecast still takes everything first (`src/game/belief/model-bridge.ts`, tested with a slow stand-in). On the fixed build the same test answered in under 30 s.
2. **Blocker for A12: no alerts behind the console.** The passes ahead and the miss from the forecast are worked out by the flight hologram, which was not updated behind the console's screen, SHIP or the MAP. A ship coasting at warp from the console met no "off the forecast" or close-pass alert and never dropped to 1×. The room now keeps them current five times a second (`RoomView.followFlight`).
3. **After a loss the hologram turned slowly round** from the dead attempt's heading for up to nine seconds, so the player walked back in to a tilted, unreadable picture. It now starts on the arrival's heading (tested in `flight.test.ts`).
4. MODEL scrolled sideways at laptop width (one long label squeezed its value off the page); a console line's label now wraps.
5. The configuration chip read ALLDEPLOYED; it reads ALL DEPLOYED.

**Well Garden**

6. MISSION named its objectives only as "REACH-REGION · FORWARD TRANSIT". It now states each objective's conditions as the ship believes them: "REACH · Forward transit · a region … across, … from the ship" (`objectiveLine` in `src/console/data.ts`, tested).
7. A field of wells announces 216 precursors at once, and FLIGHT stacked 216 copies of the same alert ("+212 more"). Sightings of one kind due together are now one line with a count (tested).

## What works, as played

- **Load, opening, room, picker:** the opening plays, the room is walkable, `1`–`4` and the buttons reach the four views, the picker reloads into each region and back.
- **Twin Deeps, the whole loop:** MISSION, PLAN (preview, commit), ENTER, warp, the forecast failing ("OFF THE FORECAST", warp to 1×), a loss into Alpha with the loss sequence and the walk back in, the debrief, Recall, MODEL. **The designed learning loop passes on the production build:** two short dives (9.85 and 5 m/s retrograde, about 9 h each, Recall after each), TEST the distance law (answered in about 20 s: T/ν 1.02 against 1.11, exponent 2.5001 ± 0.00003), ADOPT (fit χ²/ν 1.04), and the next forecast reaches Alpha's closest approach (128.5 ± 12.3 km for a 16 m/s dive). About four minutes of wall time end to end.
- A reload keeps the records and does not burn an attempt that had not been entered.

## Found, not fixed (ranked)

1. **The true law fails its held-out test on long or messy attempts** (model, 2C). With a 39 h attempt held out: "fails · T/ν 926,160,514 against 1.05", though the fitted exponent is 2.5001. With that attempt as the fit and a 6 h attempt with a misaligned 40 m/s burn held out: "fails · T/ν 73.7 against 1.13", RMS 7,929 m → 116 m. The page says "the held-out attempt departs from it", which reads as "the law is wrong". A judge who flies freely will likely meet this; one who flies two short clean dives will not. Not touched: the test's threshold and statistics are claims, and loosening them is not a fix. **For the judge's README:** two dives of a few hours each, Recall after each, then TEST.
2. **The Well Garden's wells are not in the window.** FLIGHT says "precursor in the window" and the window shows stars only. The seam exists (`EncounterSetup.window`, `WindowView.fields`, the drawing in `funnelSky.ts`), and the Gravity range's clouds fill it; the wells' hook (`withFunnels` in `src/game/funnels.ts`) gives dynamics and hazards but no `window`. See "Requests".
3. **An attempt flown without RECORD DESIGN AND SET UP** shows "no design was recorded" and the debrief has nothing to judge it against. Allowed by design; a judge may not notice the button is what sets the camera and recorder.
4. The 0.6 s hitch as the opening hands off to the live room.
5. At laptop width, two readouts on MODEL are cut short with an ellipsis ("314 m ± n …", a parameter's unit).
6. `motion.flicker` (60 ms, two cycles: the visual direction's damage flicker) is defined in the theme and used nowhere. If something adopts it, many items damaged together could exceed three flashes a second: gate it then.

## Requests outside my ownership

- **Integrator, `tools/studies/s15` and `s20` runners:** they wait for `.cr` on a fresh profile, which now arrives after the 19.5 s opening. Set the marker first: `localStorage.setItem('recursion:opening-seen', '1')` before the page's scripts run (`Page.addScriptToEvaluateOnNewDocument`), or load `?encounter=…`.
- **Integrator, the judge's README:** the opening plays once; `?opening=replay` shows it again. The learning recipe above.

## How to verify

```powershell
npm run check
npm run build
npx vitest run src/view3d/room/loss.test.ts src/app/opening/opening.test.ts src/game/belief/model-bridge.test.ts src/view3d/flight/flight.test.ts src/console
```

`npm run check` passed after items 1 and 3 (1,241 tests, 1 skipped, plus the speed suite); it is rerun before the final checkpoint.
