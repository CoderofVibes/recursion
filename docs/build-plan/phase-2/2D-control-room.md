# 2D — Control room: reconcile, then build

**Thread:** Claude (Fable) · **Branch:** `p2/2d-control-room` (worktree `.worktrees/2d`) · **Phase:** 2 (starts now) · **Needs:** 1E rounds 1–2 and 2C merged (done); 2F joins as it lands

Replaces the earlier 2D (console) and 2E (3D view) prompts. Both are kept as inputs and marked superseded.

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. The submission deadline is **17:00 PST Sunday**. The owner has set the screen composition (DECISIONS A8, `docs/CREATIVE_BRIEF.md` §10 addendum):
- a walkable first-person control room with a central console and a panoramic window;
- four views from the console: MAP, SHIP, CONSOLE and FLIGHT;
- a loss sequence that brings the player back in at the door.

1E built a walkable mock-up of it and left open questions. This thread turns that direction into the game's real control room. First it makes sure the direction fits everything already decided and built.

The main session is the integrator. It merges every branch, owns `src/contracts/` and `docs/DECISIONS.md`, and announces merges; you then commit, run `git merge main` and continue.

Read first:
- **Owner and decisions:** `docs/CREATIVE_BRIEF.md` (all of it, especially §2, §3, §10 and its addendum); `docs/DECISIONS.md` (all of it: A1–A10, P1–P17, D1–D7); `docs/build-plan/README.md` § Conventions and § UI lane.
- **The look and the mock-up (1E):** `docs/handoffs/1E.md` (both rounds), `docs/design/visual-direction.md`, `src/theme/`, and `prototypes/room/`. To run the mock-up: `node prototypes/visual/serve.mjs`, then open http://localhost:5180/room/. It loads Three.js 0.170 from a CDN; the app uses the `three` package (0.187) from `package.json`.
- **What the room shows:**
  - `src/contracts/README.md` (`ViewSnapshot` in `view.ts`, the believed world, forecasts, Black Box records).
  - 2C's model and Black Box: `src/model/README.md`, `src/blackbox/README.md`, `docs/handoffs/2C.md`. These cover `report()`, `burns()`, `empirical()`, `compareAttempts()`, forecasts and `detail.sigmaMajor`.
  - The model's player-facing diagnostics: `docs/model/estimator-spec.md` §9.
  - What the ship reports: `src/ship/README.md`.
  - The game loop: `docs/build-plan/phase-2/2F-gravity-range-integration.md`, and `docs/handoffs/2F.md` once it exists.
- **What the judges need to see:** `docs/submission/challenge-fit.md` (gaps first) and `docs/handoffs/5C-0.md` (its requests 2 and 3).
- **What must be on screen:** `phase-2/2D-console-ui.md` and `phase-2/2E-sensor-view.md` (superseded, but their build lists still apply).

## Goal
The Gravity range is playable in the control room for the Phase 2 playtest, held when the owner is ready. In that playtest the player can, without explanatory text:
- plan and fly;
- see the forecast fail;
- compare attempts in Black Box;
- improve the model, and see the improvement hold.

## You own
`src/console/` (except `encounters/`) and `src/view3d/` (except `fields/`), with their tests, and `docs/handoffs/2D.md`. The room scene lives in `src/view3d/room/`.

You do not own:
- `src/theme/` or `prototypes/` (1E, the owner's UI lane). Take every visual value from `src/theme/`; if a primitive is missing, build it locally on tokens and list it as a request.
- `src/app/` or `src/game/` (2F mounts your component and runs the loop).
- `src/contracts/` or `docs/DECISIONS.md`. Ask the integrator, through the owner or in your handoff.

## Step 1 — Reconcile (short; before building)
1. **Compare.** Check the owner's composition and 1E's mock-up against the decisions and the code:
   - P1: planar flight;
   - P6: the model forecasts, the player plans;
   - P8: what a loss resets;
   - P10: display semantics;
   - P11: the window shows only what light shows, and the holograms show only what has been sensed;
   - P12: recording;
   - A3: the sun, so shadows are visible through the window;
   - A5 and A6: carried knowledge and slingshots.
2. **Ask the owner, one decision at a time, each with a recommendation.** Go in this order:
   1. **Flying:** live thrust keys, committed plans of timed burns, or both. The forecast, the frozen issued forecast and time warp are built for committed plans (P6, P10, 2C).
   2. **Time:** does the world run while the player walks, or uses the map or ship views?
   3. **Planar flight seen through a window** (P1).
   4. Then 1E's remaining questions as they come up: map scope, room scale, window arc, hologram orientation, loss sequence.

   Don't hold the build for the minor ones; use 1E's defaults until the owner answers. Whether a loss restarts the encounter or the whole expedition is decided: the whole expedition (A9). The loss sequence returns the player to the door at the beginning.
3. **Record findings in your handoff.** List everything in the build plan, contracts or decisions that the composition contradicts, each with a proposed fix and who owns it. The integrator applies contract and decision changes.

## Step 2 — Build, in this order
1. **FLIGHT view:** a hologram above the console with the window behind it. Cover everything the 2E list asks for:
   - The view itself: take `ViewSnapshot` as input; draw the flight plane with depth cues; give the camera follow, orbit and fit modes with no motion sickness; keep 60 fps with a few hundred asteroids.
   - **Bodies and asteroids:** draw both where the ship believes they are, with uncertainty. Tracked asteroids' forecast tracks and closest-approach alerts come from the forecast's `objects` and `closestApproaches` (2C).
   - **Ship:** the true footprint, centre of mass, body axis, thrust ticks and velocity.
   - **Forecasts:**
     - The issued forecast is dotted and frozen; the measured trail is solid.
     - The envelope widens outside sampled distances and ends at the horizon (P10).
     - Draw stretches inside a validated span distinctly (`ForecastSample.validated`, A5).
   - **Comparison and coverage:** the two-attempt overlay; unsensed space reads as unknown.
   - **Field plugins:** the interface at `src/view3d/fields/<id>`, documented in `src/view3d/README.md`.
   - **Window:** it shows what light shows (bodies and sunlit rocks, with shadows from A3).
2. **CONSOLE screen.** Cover everything the 2D list asks for:
   - **Plan editor:** timed burns, with directions relative to the body axis, the velocity or a chosen body; duration and throttle; attitude and sensor-pointing commands. Pointing at an asteroid to track it is how the player probes the law at distances the ship hasn't flown (A6). Commit issues a frozen forecast.
   - **Time controls:** pause, play and warp. Preparation is safe.
   - **Equipment and power allocation,** with visible consequences.
   - **Model panel:** parameters with uncertainty, strength against distance, the confounding indicator, testing an extension against a chosen held-out attempt, adopt and revoke, and the model version. Show calibration freshness for ship calibrations (`ParameterEstimate.freshness`, 1G spec §9.7), and each adopted rule's validated spans against the distances the plan visits.
   - **Black Box compare** (`compareAttempts()`).
   - Recall and save-procedure.
3. **Challenge fit** (5C-0 requests 2 and 3):
   - **Mission-design step:** make the prepare phase a visible step. The player chooses an evidence goal, a reserve or clearance margin, the sensor, recorder and power setup, and an approach. The choices carry into Black Box.
   - **Attempt debrief:** a short debrief on Recall, loss and arrival. It shows the planned constraint, the measured result, the limiting event, the cost, and what changed in the next attempt.
   - Put propellant, power and heat margin, and recorder capacity where they can be seen changing.
   - 2F owns the game state behind these; agree the seam through the owner or your handoff.
4. **Room, MAP and SHIP views:** start from 1E's prototype, kept thin for the playtest:
   - walk to the console; the four pads; the loss sequence back to the door;
   - the ship view from `loadShipDefinition()`;
   - the map showing what has been charted so far.

   Phase 3 (3F) deepens them.

**Seam with 2F:** export one React component (for example `ControlRoom`) that takes a `ViewSnapshot` and typed service interfaces (model client, Black Box, commands and plans, time control). Render from `src/contracts/fixtures/` until 2F wires the real loop; don't wait for 2F.

## Done when
- `npm run check` and `npm run build` pass, with no console errors.
- Every visual value comes from `src/theme/`.
- The owner has played the Gravity range in the control room.

## Gate
Owner playtest (Phase 2). Results update the Phase 3 prompts (3F continues this work).

## Handoff
`docs/handoffs/2D.md` from the template, with:
- screenshots;
- the reconciliation findings;
- every owner decision taken;
- the play values you chose;
- requests: contracts, theme primitives, and anything for 2F.
