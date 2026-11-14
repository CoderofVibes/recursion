# 2D — Control room and every screen

**Thread:** Claude (Fable) · **Branch:** `p2/2d-control-room` (worktree `.worktrees/2d`) · **Phase:** 2 (starts now) · **Needs:** 1E's close-out merged (the integrator announces it), 2C and 2F merged (done)

This is the single thread for everything on screen. It replaces the earlier 2D (console) and 2E (3D view) prompts, which are kept as inputs and marked superseded, and it takes over 1E's UI lane.

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. The submission deadline is **17:00 PST Sunday, November 15**.

The owner has set the screen composition and answered the questions about it (DECISIONS A8 and A11; `docs/CREATIVE_BRIEF.md` §10 and both addenda). The game has:
- **The control room:** a walkable first-person room, 8 m wide and dressed as a working control room, with a central console and a panoramic window.
- **Time:** it keeps running while the player is in the room.
- **Four views from the console:**
  - **MAP:** a 3D hologram of what has been charted, zooming into each environment's own 3D view.
  - **SHIP:** a detailed 3D technical drawing whose systems isolate with schematic, levels, trends and readouts.
  - **CONSOLE:** a screen the player looks down into.
  - **FLIGHT:** a 3D hologram above the console with the window behind it, and the ship set back so the space ahead is visible.
- **Flying:** three-dimensional and hands-on.
- **A loss:** the screen goes black with a short shake, and the player walks back in at the beginning (A9).

**1E's prototype.** 1E has already built most of this as a working prototype (`prototypes/room/`) that the owner has reviewed and steered. 1E also built the theme, the instrument primitives, the 3D material builders and the UI lab (`src/theme/`). This thread turns the prototype into the real game, wired to the real simulation, ship, model and Black Box. Port it; don't start over.

**3D is arriving underneath you.** Thread **2G** is converting physics, ship, model and game from planar to 3D (A11).
- Its first checkpoint, the lift, makes the contracts 3D with everything still flat (z = 0); later checkpoints make the motion truly 3D.
- Until the lift merges, the snapshot is planar. Build every view in 3D from the start, reading positions through one small adapter so the switch is a type change.
- 2G owns `src/contracts/` during the conversion.

The main session is the integrator: it merges every branch and announces merges, after which you commit, run `git merge main` and continue.

Read first:
- **Owner and decisions:** `docs/CREATIVE_BRIEF.md` (all of it, especially §2, §3 and §10 with both addenda); `docs/DECISIONS.md` (all of it, especially A8–A11, P6, P10–P12 and A3–A6); `docs/build-plan/README.md` § Conventions and § UI lane.
- **What has been built for the screen (1E):**
  - `docs/handoffs/1E.md`, all rounds, including the close-out round, which says what in the prototype is toy and what is real, and what to port first;
  - `prototypes/room/`;
  - `docs/design/visual-direction.md`;
  - `src/theme/README.md`, `src/theme/`, and the UI lab (`npm run dev`, then `/src/theme/lab/index.html`).

  To run the prototype: `node prototypes/visual/serve.mjs`, then open http://localhost:5180/room/. It loads Three.js 0.170 from a CDN; the app uses the `three` package (0.187).
- **What the room shows:**
  - `src/contracts/README.md` (`ViewSnapshot`, the believed world, forecasts, Black Box records).
  - `src/model/README.md`, `src/blackbox/README.md` and `docs/handoffs/2C.md`: `report()`, `burns()`, `empirical()`, `compareAttempts()`, forecasts and `detail.sigmaMajor`.
  - The model's player-facing diagnostics: `docs/model/estimator-spec.md` §9.
  - `src/ship/README.md` and `data/ship-baseline.json`.
  - The game loop: `docs/handoffs/2F.md` (the slingshot study and open questions), `src/app/README.md`, and `GameControls` in `src/game/belief/controls.ts`.
- **What the judges need to see:** `docs/submission/challenge-fit.md` (gaps first) and `docs/handoffs/5C-0.md` (requests 2 and 3).
- **What must be on screen:** `phase-2/2D-console-ui.md` and `phase-2/2E-sensor-view.md`. They're superseded, but their build lists still apply.
- **The 3D conversion:** `phase-2/2G-3d-flight.md`.

## Goal
The Gravity range is playable in the control room, in 3D, for the Phase 2 playtest, held when the owner is ready. Its objective (A6): leave the binary on a slingshot past Beta, through an asteroid belt that orbits Beta. Until the law is learned the model mispredicts both the pull on the ship and the rocks' motion, so a first pass usually fails; failed runs feed Black Box, and the model then helps (A9).

In that playtest the player can, without explanatory text:
- walk in;
- prepare;
- fly by hand;
- see the forecast fail;
- compare attempts in Black Box;
- improve the model, and see the improvement hold.

## You own
- `src/console/` (except `encounters/`), with tests.
- `src/view3d/` (except `fields/`), with tests. The room scene lives in `src/view3d/room/`.
- `src/app/`, except `src/app/game.ts`, which 2G converts. Replace 2F's temporary bench with `ControlRoom`.
- **The UI lane, from 1E:** `src/theme/`, `prototypes/`, `docs/design/visual-direction.md` and `docs/design/img/`. Keep the lab working, and keep every visual value in `src/theme/` (Convention 11 now binds you as the theme's owner).
- `docs/handoffs/2D.md`.

You do not own:
- `src/game/`, `src/content/`, `src/sim/`, `src/ship/`, `src/model/` or `src/blackbox/`. 2G owns them during the conversion; afterwards 2C and 2F own theirs.
- `src/contracts/` or `docs/DECISIONS.md`. Ask through the owner or in your handoff; contract requests are applied after 2G's lift lands.

## Step 1 — Reconcile (short; before building)
1. **Compare.** Check the composition and the prototype against the decisions and the code:
   - P6: the model forecasts, the player flies and plans;
   - P10: display semantics;
   - P11: the window shows only what light shows, and the holograms show only what has been sensed;
   - P12: recording;
   - A3: the sun and its shadows through the window;
   - A5, A6 and A9: carried knowledge, slingshots and the loss;
   - A11: 3D.

   Record each contradiction in your handoff, with a proposed fix and who owns it.
2. **Ask the owner only what is still open, one decision at a time, each with a recommendation.** These are:
   - roll;
   - whether the other crew seats are filled;
   - the room's palette;
   - the window arc;
   - heading-up versus chart-up;
   - the loss sequence's length;
   - whether there is a pause, given that time runs in the room.

   Use 1E's defaults until the owner answers, and never hold the build for these. Everything else in A8 is decided.

## Step 2 — Build, in this order
1. **The room in the app.** Port the prototype's room into `src/view3d/room/` and mount it from `ControlRoom`:
   - walking, the white-dot cursor, the four pads and switching between views;
   - the dressing;
   - the loss sequence back to the door;
   - time running while the player walks.

   `ControlRoom` takes `snapshot()` each frame, plus the services.
2. **CONSOLE screen.** Build these first on `src/contracts/fixtures/`, then on the live loop. Cover everything the old 2D list asks for:
   - **Model panel:**
     - parameters with uncertainty;
     - strength against distance;
     - the confounding indicator;
     - testing an extension against a chosen held-out attempt;
     - adopt and revoke;
     - the model version;
     - calibration freshness (`ParameterEstimate.freshness`, 1G spec §9.7);
     - each adopted rule's validated spans against the distances the flight visits.
   - **Black Box compare** (`compareAttempts()`).
   - **Plan editor** for timed burns (directions relative to the body axis, the velocity or a chosen body; duration and throttle) and sensor pointing. Pointing at a rock to track it is how the player probes the law at distances the ship hasn't flown (A6). Committing a plan issues a frozen forecast.
   - **Equipment and power allocation,** with visible consequences.
   - Recall and save-procedure.
   - **Time controls.**

   Compose everything from the theme's primitives.
3. **FLIGHT view, in 3D.** Build this on 2G's lift contracts as soon as they merge. Cover everything the old 2E list asks for, in three dimensions:
   - **Bodies and rocks** where the ship believes they are, with 3D uncertainty.
   - **Tracked rocks:** forecast tracks and closest-approach alerts, from the forecast's `objects` and `closestApproaches`.
   - **The ship:** a large holographic symbol set back, with its true position and hull marked; centre of mass, the dotted axis, attitude, thrust at the points of application, and velocity.
   - **Forecasts:**
     - the issued forecast dotted and frozen, the measured trail solid;
     - the envelope as a 3D volume that widens outside sampled distances and ends at the horizon (P10);
     - stretches inside a validated span drawn distinctly (`ForecastSample.validated`).
   - **Depth:** cues that work in a volume, such as a reference plane through the ship and stalks for objects off it (1E's prototype does this). The camera must not cause motion sickness.
   - **Coverage:** sensor coverage as cones, with unsensed space reading as unknown.
   - **The two-attempt overlay.**
   - **The window:** it shows what light shows, meaning bodies and sunlit rocks with shadows (A3).
   - **The slingshot pass legible at speed:**
     - the closest approach to Beta;
     - rocks along the path with their uncertainty;
     - which rocks are tracked and which are only seen;
     - clearance alerts and trims.

     Untracked rocks are unknown to the model; never draw them as if forecast.
   - **Flying by hand:**
     - thrust keys on three axes, plus yaw and pitch, using the hands-on seam 2G defines (agree names through the owner);
     - when the keys are released, the coasting forecast appears;
     - committed timed burns stay available for precise trims.
   - **Performance:** 60 fps with a few hundred rocks.
   - **Field plugins:** the interface at `src/view3d/fields/<id>`, documented in `src/view3d/README.md`.
4. **Challenge fit** (5C-0 requests 2 and 3):
   - **Mission-design step:** make preparation a visible step. The player chooses an evidence goal, a reserve or clearance margin, the sensor, recorder and power setup, and an approach. The choices carry into Black Box.
   - **Attempt debrief:** shown on Recall, loss and arrival. It gives the planned constraint, the measured result, the limiting event, the cost, and what changed in the next attempt.
   - **Margins on show:** put propellant, power and heat margin, and recorder capacity where they can be seen changing.
   - **Game state:** this lives in `src/game/`, so put what you need in your handoff, or ask through the owner.
5. **SHIP view.** Port 1E's 3D ship and its system screens, and wire them to the real ship state where `src/ship/` exposes it. Mark placeholders that remain.
6. **MAP view.** Port 1E's 3D map, showing only what has been charted, kept thin for the playtest. Phase 3 (3F) deepens it.

**Seam with the game:** `ControlRoom` uses `GameControls`:
- status;
- warp;
- `advance`;
- `preview` and `commit` of a plan;
- manual `command`;
- the hands-on input (from 2G);
- `recall` / `restart`;
- compare and selection;
- `rules`;
- the model port and Black Box.

Facts from 2F:
- The snapshot is in the briefing's inertial frame.
- An objective's `region.center` follows its target's believed position.
- Time runs only when the shell calls `advance`.
- `burnSteps` builds the commands for one burn.

Anything you need from the game goes in your handoff or through the owner to 2G.

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
- what of the prototype was ported and what remains toy;
- requests: contracts, anything for 2G, 2C and 2F.
