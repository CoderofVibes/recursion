# Phase 3 extras: the opening, visuals, audio, and the morning threads

Added by the owner on 2026-11-14 to be built before the submission; the morning threads (3F, VX's next pass, 2C and 2F resuming) were added on 2026-11-15 after the owner's playtest (A26) and are at the end of this file. Same conventions as [phase-3.md](phase-3.md): read [the build plan README](README.md) (Conventions, Path releases) and [the coordination ledger](coordination.md) first. Write only your listed paths. Request anything else from its owner through the integrator. Keep `npm run check` and `npm run build` green, and checkpoint as you go: committed, announced in one line.

---

## OP — The opening

**Thread:** Claude (Opus 5.5) · **Branch:** `p3/op-opening` · **Worktree:** `.worktrees/op`

**Read:**
- DECISIONS **A21** (the owner's opening), A8, A9, A12, A17 (the ending, which mirrors it) and A22;
- `docs/CREATIVE_BRIEF.md` §1 and §10 with its addenda;
- `docs/design/visual-direction.md`;
- `src/view3d/README.md`, `src/theme/README.md` and `src/app/`;
- GPT study S23's beat sheet when it lands (`docs/studies/s23/`).

**Goal:** build the opening exactly as the owner describes it (A21):
1. The game opens with the player looking at the main console, Earth in the distance, on the way home.
2. Lights start flashing and the ship shakes. The player's view shakes as they try to keep their balance.
3. Then dark. The title, RECURSION, enters the dark screen.
4. The player wakes up in the new, recursive universe.

This is the first thing every judge sees, so make it land.

**Owns:**
- `src/view3d/opening/` and `src/app/opening/` (both new).
- **A scoped exception:** add a small, additive hook API to the room (window sky, lighting cues, camera shake, fade, title card) that changes no existing behaviour. Tell 2D through the integrator before committing it (ledger R23).

Use the theme's existing tokens, and request new ones from 2D.

**Rules:**
- It plays on a new save's first launch only, and never on recurrence (A9).
- It can be skipped after the first time.
- Flashes stay at 3 per second or fewer, and there's a reduced-motion option for the shake.
- It's a scripted scene before the game starts, so add no new physics to the simulation.
- **Make the console-and-Earth framing reusable:** the ending (A17) returns to the same view.

**Order:**
1. The sequence engine and the room hooks first, with placeholder beats.
2. S23's beat sheet when it lands.
3. Sound cues as thread AU's audio arrives.

---

## VX — Window and sky visuals

**Thread:** GPT/Codex (GPT-6 Astra) · **Branch:** `p3/vx-visuals` · **Worktree:** `.worktrees/vx`

**Read:**
- DECISIONS A3, A8, A11, A16–A19, A21 (with the opening as built), A23 (MidJourney images are references only) and A25;
- `docs/design/visual-direction.md`;
- **`docs/art/`**: the art thread's `art-bible.md`, `selections.md` and `window-prompts.md`. They're still growing, so merge main often.
- `docs/studies/s23/`, `docs/handoffs/op.md` and `docs/handoffs/2D.md` (the window and the funnels in it);
- `src/view3d/README.md`;
- S15's release check (A18 (7)).

**Goal:** make what the player sees through the window, and the opening, beautiful. The owner says the visuals are still goofy. Show what you can do: the window is the game's first impression.

1. **A shared sky for this universe** in `src/view3d/sky/` (new): procedural stars with realistic brightness and colour and an unfamiliar arrangement, galaxies, nebulae and gas, and this universe's small far sun. Draw it on a dome around the eye, seeded per run where A10 allows. **Distant scenery only:** nothing the physics would contradict, such as a near planet that should pull the ship (A23).
2. **The opening's look.** Take over `src/view3d/opening/` (OP is done):
   - Earth with real colours, a terminator and an atmospheric limb, at S23's honest size;
   - the lens anomaly and the dark, as awe, not goofiness;
   - the title's typography.

   Keep OP's timings, the photosensitivity rule (at most 3 flashes per second) and reduced motion.
3. **Looks for the encounters' phenomena,** as reusable shader helpers in `src/view3d/fx/` (new) that others mount:
   - the funnels' violet glow and contour rings (3B's view; 2D's window);
   - the radiation clouds' crescent (A18; 2F's `WindowView` slot; 2D draws it);
   - a well's precursor shimmer.

   Hand them over as small functions, and request the integration from 2D and 3B through the integrator.
4. **Performance:** stay inside S15's release check. Measure with S15's runner on the modest profile, and use level of detail.

**Owns:** `src/view3d/sky/`, `src/view3d/fx/` and `src/view3d/opening/`.

**Requests:** 2D mounts the sky in the room's window (`src/view3d/room/outside.ts`) and adopts the helpers; 3B adopts the funnel look; 2D adds Earth and title tokens.

Follow `docs/art/art-bible.md` as it lands. Where it's silent, propose a look, with screenshots in your handoff. No generated image ships (A23): everything is drawn by code.

---

## NIGHT — The judge's run (overnight)

**Thread:** Claude (Fable 5.2), one long run · **Branch:** `p3/night-hardening` · **Worktree:** `.worktrees/night`

**Read:**
- [the coordination ledger](coordination.md), its "Overnight" section first;
- `docs/CREATIVE_BRIEF.md`, and `docs/DECISIONS.md` A8–A25;
- the handoffs of 2D, 2F, 2C, 3B, 3C, OP and 3E;
- S20's findings (`docs/studies/s20/`).

**While you run, the owner is asleep and 2D, 2F and 2C are paused.** You hold their lanes for fixes until morning:
- `src/app/`, `src/console/`, `src/theme/`, `src/game/`, `src/content/gravity-range/`, `src/model/` and `src/blackbox/`;
- `src/view3d/`, except `src/view3d/sky/`, `src/view3d/fx/`, `src/view3d/opening/` and `src/view3d/room/outside.ts`, which **VX** (GPT) holds tonight.

GPT threads keep their own lanes: VX (visuals), AU (audio), 3C (sensors, including the wells' channel) and 3B (its encounter and the harness). Run `git merge main` first.

**Goal:** when the owner wakes up, a judge who opens the site plays a game that works, end to end, and is a joy to meet.

1. **Photosensitivity (ledger R43), first:** the ordinary loss sequence (A8) flickers faster than 3 times a second. Keep every flash at 3 or fewer in any second, and test it.
2. **The region picker (A25, R40):**
   - Twin Deeps, the Well Garden (`?encounter=inverse-wells`) and the Unseen Cathedral (`?encounter=chain-link`), through 2F's loader, each with its own save;
   - labelled honestly: "Preview regions: the route between them isn't built yet; each starts with a fresh ship";
   - keyboard-reachable.
3. **The opening in the game (R41):**
   - mount `OpeningGate` in `src/app/App.tsx` ahead of the room, waking into the Gravity range;
   - gate it once per browser, not once per save (A25);
   - with reduced motion on, a fully still sky with the alarm light and a plain fade to black (R44).
4. **The judge's run.** Play the production build in headless Chrome, driven over the DevTools protocol with plain Node (install nothing), as a cold judge would:
   - load, the opening, the room, the picker;
   - each region: plan, fly, lose, recur, learn, leave.

   Fix every blocker, crash, console error, confusing dead end and performance cliff you find, most important first. Use 3E's harness (`npm run harness`) and S20's findings.
5. **Rules:**
   - keep `npm run check` and `npm run build` green;
   - commit a checkpoint after each group of fixes;
   - never loosen a test, tolerance or claim;
   - no new features beyond items 1–3; keep truth and belief apart (P11);
   - leave port 4175 to S15's runner, and don't edit the ledger (it's the integrator's).
6. **The morning report:** keep `docs/handoffs/night.md` current as you go:
   - what you fixed, with commits;
   - what you found but didn't fix, ranked;
   - screenshots in `docs/handoffs/night/`, with no user paths in any committed file;
   - a short "state of the game for judges" for the owner.

---

## AU — Basic audio

**Thread:** GPT/Codex · **Branch:** `p3/au-audio` · **Worktree:** `.worktrees/au`

**Read:**
- DECISIONS **A22** (audio, generated by the owner with ElevenLabs), A8, A12 (cautions and warnings drop warp to 1×), A16, A17, A19 and A21;
- `src/app/` (the loop), and the `ViewSnapshot` contract in `src/contracts/`;
- `docs/handoffs/2D.md`;
- GPT study S23's sound cues when they land.

**Goal:** basic, good-sounding audio for the submission. The owner generates every sound in ElevenLabs, and you write what to generate and wire it in.

1. **First, the cue list, as your first checkpoint.** Write `docs/audio/cues.md`, a table with one row per sound:
   - its file name and folder (`public/audio/`);
   - when it plays, what triggers it, and what it does as the game state changes;
   - one-shot or loop, and duration;
   - its mood;
   - **a ready-to-paste ElevenLabs text prompt.**

   Cover at least:
   - the opening (A21): the room's hum, alarms, rumble, the dark, the title;
   - the room's ambience;
   - console clicks;
   - the main engine and RCS thrusters;
   - an advisory, a caution and a warning, distinct and never shrill;
   - the loss sequence (A8);
   - recurrence and waking;
   - the Black Box recording;
   - the wells' hum and their pull (A19);
   - the lattice's radiation (A16);
   - the ending's reveal (A17).

   Keep the total small enough for S15's load budget, and use a format every browser plays (MP3).
2. **The audio system:** a small Web Audio module in `src/audio/` (new) that maps game events from the snapshot to cues. It needs:
   - volume and mute settings;
   - starting only after the first user gesture, as browsers require;
   - lazy loading after first interaction, so the cold load doesn't grow;
   - silence, never an error, for any file not yet generated.
3. **Mounting it:** a scoped exception allows **one mount line** in `src/app/` (2D's), and a mute control requested from 2D. Agree it through the integrator (ledger R24).
4. **Credits:** list ElevenLabs as the audio source in your handoff, for the README credits, the submission and the AI disclosure (S12, S13).

**Owns:** `src/audio/`, `public/audio/` and `docs/audio/`.

**Relaunch (owner, 2026-11-15).** AU's first launch left no work on the branch, so it starts again from current `main`: the opening is in the game, and the console and room now belong to 3F. What changed since the prompt above:
- **The mute control already exists.** `src/app/sound.ts` keeps the player's choice (`soundMuted()`, `setSoundMuted()`, `onSoundMuted()`), and the room shows "M ▸ SOUND ON" and answers the `M` key. Read it; don't build another.
- **The mount line** (R24) goes in 3F's `src/app/App.tsx`, still one line under your scoped exception; tell 3F through the integrator before committing it. 3F hides the sound switch until audio exists: export a way to tell (for example `soundAvailable()` from `src/audio/`) and name it in your checkpoint.
- **The opening's cue times** moved with the 19.5 s opening (R42): opening-rumble 6.5 s, alarms 6.6, 7.8 and 8.47 s, loss-failure 9.35 s, black-cut 10.65 s, opening-title 11.95 s, **new** title-out 15.9 s, room-wake 17.9 s. With reduced motion the opening is a still sky and a plain fade (R44); the loss holds at most three flashes a second (R43), so its sounds follow NIGHT's schedule in `src/view3d/room/loss.ts`.
- **The cue list comes first, as before**, because the owner generates every file in ElevenLabs from it. Commit `docs/audio/cues.md` as your first checkpoint and say so in one line.
- **The lighter bar applies** (A26, below): done means a judge hears the game respond to what happens, and nothing breaks without the files. Keep check and build green; never loosen a test.
- **The demo video shares some of your sounds.** Thread TR owns the 30-second video's sound and will reuse your alarm and rumble (file names and prompts) so the video and the game match. Put those two near the top of your cue list.

---

# The morning threads (2026-11-15, A26)

The owner played the merged build and decided A26. Four threads follow from it.

**The bar.** 3F (the console) works to the full bar written in its section. **VX, 2C and 2F work to the lighter bar (A26 (4)):** done means a judge following the README can play the region and understand what happened. Claims stay honestly labelled. No new evidence suites, admission matrices or performance studies are required. No test, tolerance or claim is loosened anywhere: fix the cause, or report it.

Everyone: run `git merge main` first. NIGHT, VX's first pass, 3C, 3B, ART and S23 are merged; read `docs/handoffs/night.md` (the judge's run) and [the coordination ledger](coordination.md). Keep `npm run check` and `npm run build` green, commit checkpoints as you go and announce each in one line; the integrator merges them as they come. NIGHT's driver in `docs/handoffs/night/judge-run/` plays the production build in headless Chrome with real keys and clicks (read its header); use it to check your work as a judge would meet it.

---

## 3F — Console v2: the engineering, made legible

**Thread:** Claude, driven live by the owner · **Branch:** `p3/3f-console-v2` · **Worktree:** `.worktrees/3f`

This replaces 3F in [phase-3.md](phase-3.md), which extended the console for an expedition that isn't being built.

**Read:**
- `docs/CREATIVE_BRIEF.md`; DECISIONS A8, A12, A21, A24, A25, **A26**, P10 and P11;
- `docs/handoffs/2D.md` (the control room as built: you take over its lane), `docs/handoffs/night.md` (what a cold player met) and S9's first-five-minutes study (`docs/studies/s9/`);
- `docs/design/visual-direction.md`, `src/theme/README.md` and `src/view3d/README.md`;
- the game itself: play the production build through all three regions before changing anything.

**The owner's critique (A26):** MISSION, PLAN, MODEL and BLACK BOX are walls of text. A judge sees screens full of writing and planning, and can't tell where the engineering work is done or what is going on.

**Goal:** a judge who has never seen the game can tell, from the screens alone, what they are deciding, what the ship predicts, what actually happened, and what they learned. The engineering is the game: make it visible.

1. **Design with the owner first.** Before rebuilding, propose two or three layouts, as screenshots of quick mockups on real data (or in the UI lab), each built around one spine a judge can follow. One starting idea, the owner's to keep or drop: organise the console around the loop itself (explore, design, predict, fly, compare, learn) instead of one page per subsystem. The owner chooses; then build.
2. **MISSION becomes EXPLORATION** (A26): the player is exploring, trying to find the way out of this universe. Rename it everywhere: tabs, keys, labels, help text, tests, and the click targets in NIGHT's driver.
3. **Less text, more instrument.** Every number a judge needs stays, but explanations shrink to labels with detail on demand. Parameter dumps (for example `FUNNEL-0-CORE.MU × MAIN-ENGINE.SCALE ρ −0.00`) become readable names and pictures, or fold away. After a flight, the predicted-against-flown comparison is the most visible thing on the console.
4. **FLIGHT:**
   - **Keep the reference disc level**, parallel to the console. Today heading-up turns the whole chart by the inverse of the ship's full attitude (`FlightHolo.ts`, `rot.quaternion` from `displayQ`), so pitch and roll tilt the disc and grid: at −13° pitch the disc leans 13°. Turn the chart by heading (yaw) only; show pitch and roll on the ship model.
   - **Explain the pink thrust markers.** The chevrons and dashed line of action (commanded thrust, `colour.thrust`) appear for every firing, attitude-hold pulses included, with no label. Label them, or show them only for burns the player commanded, with attitude control drawn more quietly.
   - **Turning by hand:** Q/E turn the 30 t ship about a degree every two seconds, and FLIGHT says nothing while a key is held (NIGHT's finding 7). Show the turn in progress.
5. **2D's open screen items, now yours:**
   - the radiation monitor's reading and caution on SYSTEMS (R37; it reads "no reading" today);
   - the loss review's radiation block on the debrief (2C's update 7 request);
   - MODEL's truncated readouts at laptop width, and FLIGHT's right column below the fold (NIGHT's finding 10);
   - the "M ▸ SOUND ON" switch, shown while the game has no audio: hide it until audio exists. AU is relaunched and will tell you how to know (for example `soundAvailable()` from `src/audio/`), and it adds one mount line to `App.tsx` under its scoped exception (R24).
6. **Keep every capability** the console has today: planning burns and pointing; PREVIEW, COMMIT and CUTOFF; procedures and RECALL; records, debrief and compare; the model's TEST and ADOPT; the encounter panels; systems and configuration. Redesign how they are found and read, not whether they exist.

**Owns** (2D hands over its whole lane; it is paused and does not resume on these paths):
- `src/console/` except `encounters/`. You may change the **layout and presentation** of the encounter panels in `src/console/encounters/` (3B and 3C are done), keeping their data and commands unchanged.
- `src/view3d/` except `fields/` and VX's paths: `sky/`, `fx/`, `opening/`, `room/outside.ts`, and VX's two `outside.followEye(...)` calls in `room/RoomView.ts`. PF (speed, GPT) holds `src/view3d/perf/` and may change `RoomView.ts`'s renderer and composer setup and add one quality hook in `frame()`, telling you first through the integrator. PF sends you measured requests for FLIGHT's hologram.
- The UI lane: `src/theme/`, `prototypes/`, `docs/design/visual-direction.md`.
- `src/app/` except `game.ts`.
- In `docs/handoffs/night/judge-run/`, the click targets only, to follow renamed labels.

**The bar is the full one** (the owner kept it for the console):
- `npm run check` and `npm run build` green; new behaviour tested, including the level disc and every renamed or moved control;
- every control reachable by keyboard, with visible focus; readable at 1366 × 768 with no sideways scroll;
- every visual value from `src/theme/` (Convention 11); no truth imports in screens (P11); uncertainty shown wherever a value is believed;
- A12 live operation: time keeps running, and alerts drop warp to 1× from every view;
- at most three flashes in any second; reduced motion respected;
- S15's views measured on the modest profile before and after (set the opening marker first, ledger R48): no view gets slower;
- a cold judge's run on the production build with NIGHT's driver: the opening, the picker, Twin Deeps' learning loop through ADOPT, the Well Garden and the Cathedral to their losses, with no page errors;
- before-and-after screenshots of every screen in your handoff (`docs/handoffs/3F.md`, with images in `docs/handoffs/3f/`);
- never loosen a test, tolerance or claim;
- the gate: the owner plays it.

---

## VX — next: each mission's whole view

**For the running VX thread.** The owner pastes this after VX's current atlas pass (Galaxy, Ember Wheel, Needle, Hollow and Eye).

> The owner's next direction for VX (DECISIONS A26 (3)): design what the player sees for the whole of each mission, not only the sky. Run `git merge main` first, and read the morning threads' preamble in `docs/build-plan/phase-3-extras.md` (the lighter bar).
>
> 1. **Twin Deeps:** the entire slingshot sequence, from arrival through the Alpha approach, the Beta pass and the belt, to departure. The bodies, the belt's rocks and the radiation clouds' crescent, at honest sizes and directions, from the data the window receives.
> 2. **The Well Garden:** the whole flight with the wells visible: precursors, births, the funnels' glow and rings, the throat, as the ship flies among some 2,600 sites.
> 3. **The wells' optical producer (R31, your request 1) is yours**, under a scoped exception: on the truth side, call 3B's `projectFunnelOptics` (`src/content/inverse-wells/optics.ts`) with the actual eye, occlusion and lifecycle, and with culling and level of detail at the source, and fill `EncounterSetup.window` with `WindowFunnel` entries. Write the producer in a new file of your own; add only its one call in `withFunnels` (`src/game/funnels.ts`, 2F's file, which 2F leaves alone). No catalogue geometry crosses into the renderer (P11).
> 4. **The Unseen Cathedral:** the lattice stays invisible to the eye (A16). Design the region's view as the art bible allows: the rock field and the sky through it.
>
> **Ownership:** `src/view3d/sky/`, `fx/`, `opening/`, `room/outside.ts`, plus the producer file and its one call. 3F now owns the rest of `src/view3d/` and `RoomView.ts`; ask the integrator for anything there.
>
> **The bar is lighter (A26):** done means a judge playing the region sees it and it reads well. Production-build screenshots of each region go in your handoff. Keep check and build green, never loosen a test, and don't make S15's numbers worse (level of detail first). No new evidence suites.

---

## 2C resumes (2026-11-15)

**For the paused 2C thread** (`.worktrees/2c`, `p2/2c-model`). The owner pastes:

> 2C resumes (DECISIONS A26). Run `git merge main` first, then read the morning threads' preamble in `docs/build-plan/phase-3-extras.md` (the lighter bar), `docs/handoffs/night.md` (found-not-fixed 1 and 2) and ledger rows R32, R46 and R47.
>
> 1. **R47, first: Twin Deeps' held-out TEST fails on long or messy attempts**, though the fitted exponent is right (2.5001): with a 39 h attempt held out, "T/ν 926,160,514 against 1.05"; with a 6 h attempt and a misaligned 40 m/s burn held out, "73.7 against 1.13". Find the cause and fix it, so a judge who flies freely and has the right law gets an honest pass. When a test does fail, the page says why in plain words (the held-out attempt carries something the model can't explain), instead of reading as "the law is wrong". Don't loosen the threshold or the statistics.
> 2. **R46: make the Cathedral threadable.** On the twenty-fence lattice nearly every fragment starts its own track: 18,999 tracks, 2,952 fitted features, 0 supported. Fix association so fragments of one strand join. Done when a judge recording at Thread for a few minutes sees supported strands in FLIGHT and can fly between them. Repro: `src/game/lattice-loop.test.ts` with `survey` → `thread`. Don't lower the gates to draw strands that aren't there.
> 3. **The Well Garden (R32, lighter):** the model learns a funnel's pull from the flight's own evidence (motion and IMU first; the camera's contour bearings once VX's producer feeds the camera), so a later forecast shows the pull and a judge can plan around a throat. No catalogue coordinates become belief.
>
> **Owns:** `src/model/`, `src/blackbox/`. **The bar is lighter (A26)**, except that no test, tolerance or claim is loosened. Checkpoint as you go; write handoff update 8.

---

## 2F resumes (2026-11-15)

**For the paused 2F thread** (`.worktrees/2f`, `p2/2f-game`). The owner pastes:

> 2F resumes (DECISIONS A26). Run `git merge main` first, then read the morning threads' preamble in `docs/build-plan/phase-3-extras.md` (the lighter bar), `docs/handoffs/night.md` and ledger rows R20, R37 and R39.
>
> 1. **R37, the game's half:** the environment supplies the radiation monitor's point signal from every active field, including the Gravity range's clouds and the Cathedral's lattice. `session.ts` consumes the recorded caution at once, drops warp to 1× and stops that frame's remaining ticks. Then restore the clouds tripwire to its 20 s figure (R39). 3C's APIs are in `src/ship/sensors/RADIATION.md`. Today the lattice's first warning at warp is "Critical power short", one second before the loss.
> 2. **R20:** sensors acquire at their own times within the tick, not only at each tick's start (at 350 W the Cathedral's frames arrive once in six seconds).
> 3. **The end of a forecast at warp:** make it impossible to miss, consistent with A6 and A12. NIGHT's finding 5: the forecast ended at T+11 h and the ship coasted 20 h at 2000× into a belt rock with no warp drop.
> 4. **The Well Garden, finishable:** the funnels' lifecycle survives save and reload (3B's request 3), with the pull's work ledger (request 4), enough that an attempt, a RECALL and a reload never break the field.
> 5. Anything else in the game loop that stops a judge finishing the Well Garden or the Cathedral, found by playing them with NIGHT's driver.
>
> **Owns:** `src/game/` (including `truth-step.ts`), `src/content/gravity-range/`, `src/app/game.ts`. VX adds one call in `withFunnels` (`src/game/funnels.ts`) for the wells' window producer: leave that call alone. PF (speed) holds `src/game/belief/standin-model.ts`: keep out of it, and ask PF through the integrator if you need a change there. **The bar is lighter (A26)**, except that no test, tolerance or claim is loosened. Checkpoint as you go; write handoff update 4.

---

## PF — Speed: pass S15's release check

**Thread:** GPT/Codex (GPT-6 Astra) · **Branch:** `p3/pf-speed` · **Worktree:** `.worktrees/pf`

**Read:**
- DECISIONS **A18 (7)**, the gate: on S15's modest profile, cold load within 2.5 s and 1× frame p95 within 33 ms in every view, any frame over 100 ms investigated, plus one check on a real modest laptop. Also A12 (time keeps running), A20 (faster coasting) and A26 (the lighter bar);
- S15: `docs/studies/s15/`, `docs/handoffs/s15.md` and `tools/studies/s15/README.md` (the runner and what each setting means);
- 2G's speed pass (`docs/handoffs/2G.md`), VX's performance section (`docs/handoffs/vx.md`, `docs/handoffs/vx/performance.json`) and NIGHT's report (`docs/handoffs/night.md`, finding 8: a 0.6 s hitch as the opening hands off to the room);
- ledger rows R11, R18, R48 and R49.

**Where it stands** (VX's run on its own branch, 4× CPU throttle, Intel UHD, an uncontrolled host): frame p95 Room 54.7 ms, FLIGHT 109.1, SHIP 97.0, MAP 72.8, SYSTEMS 42.3, PLAN 30.3, MISSION 18.1, BLACK BOX 18.0, MODEL 12.2 (one 163 ms long task); cold room readiness 3.4 s and 2.4 s in two runs. Profiles pointed at Three's program setup and draw submission, the belief-side snapshot helpers in `src/game/belief/standin-model.ts`, and cloud transforms. Room, FLIGHT, MAP and SHIP all had long tasks. Facts from the code, to confirm rather than assume as causes: the app ships as one 1.47 MB main chunk; the room renders an antialiased scene through a full-resolution bloom pass (`RoomView.ts`, `EffectComposer` with `UnrealBloomPass`).

**Goal:** the production build passes A18 (7) on S15's modest profile, measured honestly, without changing what the player sees in meaning. Where a view can't pass, your handoff says exactly what is left, what it costs and why.

1. **First, fix the runners for the opening (R48).** S15's and S20's runners and `prototypes/shots/capture.mjs` wait for the room on a fresh profile, which now meets the 19.5 s opening first. Set `localStorage['recursion:opening-seen'] = '1'` with `Page.addScriptToEvaluateOnNewDocument` before page scripts run. Measure cold load two ways: the opening's first frame on a fresh profile (what a first-time judge waits for), and the room's readiness with the marker set.
2. **Rebaseline merged `main`** with every view, all three regions (the Well Garden's 2,600 sites and the Cathedral's lattice may cost more than Twin Deeps), cold and warm loads, and profiles of the worst cells. Other threads build and test on this machine while you run: record the machine's load before each run, repeat runs, report medians with their spread, and flag contention. Don't call a number quiet when it wasn't.
3. **Fix, biggest measured cost first.** Candidates, to confirm by profile:
   - render cost on an integrated GPU: bloom resolution, antialiasing under post-processing, render scale; perhaps a quality governor that lowers render scale or bloom detail when frames run long, and restores it when they don't;
   - FLIGHT's hologram: line counts and per-frame rebuilds;
   - the belief-side snapshot helpers in `standin-model.ts`;
   - shader compilation at load and on first view (precompile, warm up);
   - load: split the main chunk so each region's heavy code (the lattice, the wells) loads with its region;
   - the 0.6 s hitch at the opening's hand-off, and any other frame over 100 ms.
4. **Re-measure after each fix** with the same settings, and keep a before-and-after table per view and region. Also report achieved warp at 2000× on the modest profile (R11, R18).
5. **The real-laptop check:** give the owner a simple way to run it, for example a `?perf` readout of frame p95 and load time (in your `src/view3d/perf/`, mounted with one line agreed through the integrator), and a short procedure in your handoff.

**Owns:**
- `tools/studies/s15/`, `tools/studies/s20/` and `prototypes/shots/capture.mjs` (R48); port 4175 is yours;
- `src/view3d/perf/` (new): the quality governor, the readout and any other speed helpers;
- `docs/handoffs/pf.md` and `docs/handoffs/pf/`.

**Scoped exceptions** (other threads are working near these files now; keep each change small and say what you changed in your checkpoint line):
- `src/game/belief/standin-model.ts` (2F's lane; 2F keeps out of it while you hold it);
- in 3F's `src/view3d/room/RoomView.ts`: the renderer and composer setup in the constructor, and one quality hook in `frame()`. Tell 3F through the integrator before you commit; VX's `followEye` calls stay;
- `vite.config.ts`: build and chunking options only (root config is the integrator's).

**Everything else goes as a request**, with the measured saving and a proposed diff in your handoff, through the integrator: FLIGHT's hologram and the rest of `src/view3d/` to 3F; the sky, clouds and funnels in `src/view3d/sky/` and `fx/` to VX; the truth tick and environment to 2F.

**Rules:**
- **The gate's numbers stay as they are:** 2.5 s and 33 ms are the target, and the report says plainly which views pass and which don't. Never loosen a test, tolerance or claim.
- Lower resolution, bloom or detail when you must, but never remove information the player needs, and never change the simulation: the command tape and its fingerprints stay identical (2G's and 3A's tests).
- No visual value hard-coded outside `src/theme/` (Convention 11); at most three flashes in any second; reduced motion respected.
- **The lighter bar (A26) applies to process:** S15's runner is your evidence; no new evidence suites.
- Keep `npm run check` and `npm run build` green; commit checkpoints and announce each in one line.

---

## TR — The 30-second trailer

**Thread:** GPT/Codex (GPT-6 Astra) by default; the owner may choose Claude · **Branch:** `p3/tr-trailer` · **Worktree:** `.worktrees/tr`

**Starts now** (owner, 2026-11-15). TR owns the 30-second demo video end to end: the page that plays it, the staged visuals, and its sound. Real scenes from other threads arrive as they merge; build with stand-ins until then.

**Read:**
- **`docs/submission/video.md`: the owner's beat sheet, which this video follows exactly**, and `docs/submission/requirements.md` (the organizer's rules: 30 seconds or less, labels on AI-generated media, AI audio acknowledged in text and metadata);
- `docs/art/art-bible.md`; DECISIONS A16, A21, A22 (audio from ElevenLabs, credited) and A26; ledger R43 (flashes);
- the handoffs of VX (the sky, the fx helpers, and its preview page, which isn't part of the app), OP (the room's hooks for scripted shots: `RoomView`'s `scripted` option and its scripted-frame method) and NIGHT; 3F's as it lands;
- AU's cue list, `docs/audio/cues.md`, once AU's first checkpoint merges;
- NIGHT's driver in `docs/handoffs/night/judge-run/`, to prepare real sessions.

**Goal:** the owner records the finished video in one take from your page, picture and sound together, and it is the owner's vision. The snap to black is the core of Recursion, the constant death loop: make every cut land.

**The page**
1. **Separate from the game:** `src/trailer/index.html`, with its code in `src/trailer/`, served by the dev server. The game never imports it and it isn't in the production build, so the game's bundle and S15's numbers don't change.
2. **Start and replay:** a black page; Space or a click starts it (so the owner starts recording first); R replays it; every run plays the same, exactly 30.0 s.
3. **Cuts:** the snaps to black are hard cuts. No black between the montage and the console shot.
4. **Captions and the final card** in the page, with the theme's fonts and the labels from `video.md`. A key hides the captions for a clean take.
5. **At most three flashes in any second**, the title's flicker and the snaps included: a black snap between two bright shots counts as a flash.
6. **Smooth enough to record:** 60 frames a second at 1920 × 1080 on the owner's machine. Compile shaders and load every scene and sound before Start, so nothing hitches.

**The visuals**
- **Staged, yours to build now**, in the art bible's style with VX's helpers:
  - the title: RECURSION appears all at once, flickers, gone;
  - the slingshot's shake: the view shaking up and down, the planet turning slightly with the motion;
  - the wells' rotation: one well dragging the ship's tail, the ship turning, everything in the window moving with it;
  - the braid: fast motion streaking past both sides of the window;
  - FLIGHT's lattice, only if 2C's R46 hasn't landed.
- **Real, from other threads as they merge:** Twin Deeps' pass and the wells in the window (VX, R50), the lattice in FLIGHT (2C, R46), the redesigned screens including EXPLORE (3F). The console with Earth in the window is already on `main` (the opening's first frame). Until each lands, use the closest thing on `main` as a stand-in, list it in your handoff, and swap it in when it merges (`git merge main`).
- **Real sessions for the montage:** prepare them by playing (NIGHT's driver can), and load them as saved states. Never fabricate a record and show it on a real instrument.
- List every staged element in your handoff; the final card's "some shots staged" label covers them.

**The sound** (A22: the owner generates every file in ElevenLabs)
1. **Your first checkpoint: the cue sheet**, `docs/trailer/audio.md`, so the owner can generate files while you build. One row per sound, timed to the beats: its start and length, what it does at the cuts, its mood, and a ready-to-paste ElevenLabs prompt (sound effects; and music for the montage's bed, if the owner wants it). Cover at least:
   - the title's hit and the crackle of its flicker;
   - the slingshot's roar and the hull straining;
   - the wells' deep groan and the ship creaking as it turns;
   - the lattice's strike and the alarm;
   - the braid's rush, the alarm still going;
   - **dead silence on every snap to black** (the alarm cuts at 12.8 s);
   - the montage's bed;
   - the console's hum, with Earth in the window;
   - the final hit under RECURSION.
2. **Where the game has the same sound** (the alarm, the rumble), use AU's cue, its file name and prompt, so the video and the game match. Ask through the integrator rather than making a second version: AU owns the game's sounds, you own the video's.
3. **In sync:** the page schedules every sound on the timeline with Web Audio, locked to the picture, so Game Bar records both together. A missing file plays as silence. Keep the loudness even and the peaks below clipping (about −1 dBFS).
4. **Credit ElevenLabs** on the final card and in your handoff, and note the AI-generated audio for the submission's text and metadata.

**Owns:** `src/trailer/` (the page, the staged effects, the timeline, and the video's sound files in `src/trailer/audio/`), `docs/trailer/`, `docs/handoffs/tr.md` and `docs/handoffs/tr/`. Read anything; ask the integrator for changes elsewhere, and prefer the room's existing scripted-shot hooks to new ones. The beat sheet is the owner's: propose changes in a checkpoint line, don't make them.

**Order:**
1. The cue sheet.
2. The page: timeline, cuts, captions and final card, with stand-ins.
3. The staged visuals.
4. The sound, as the owner's files arrive.
5. Real scenes, swapped in as they merge.
6. A rehearsal: a timestamped run showing each beat within 0.05 s of the sheet, one still per beat, and a short screen capture of the page for the owner.

**The bar is lighter (A26):** done when the owner records a take they're happy with. Keep `npm run check` and `npm run build` green, leave the game's bundle and S15's numbers unchanged, and never loosen a test. Commit checkpoints and announce each in one line.
