# TV — The trailer's visuals: five room shots

**Thread:** GPT/Codex (GPT-6 Astra) · **Branch:** `p3/tr-visuals`, from `p3/tr-trailer` · **Worktree:** `.worktrees/tv` · **Reports to:** TR (the trailer's thread), through the owner

The 30-second demo video plays from TR's trailer page (`src/trailer/`). TR owns the video: the page, its timeline, the cuts, the captions, the title, the final card, the instrument montage and all the sound. **You build the five shots seen from the control room**, each a scene that plugs into the page with no change anywhere else. Until a scene exists, its beat shows a stand-in slate, so each shot can land on its own.

A lighter bar (A26): done when the owner approves each shot in the trailer page. Order: **the wells first** (the owner's priority), then the console with Earth, the slingshot, the lattice and the braid. Commit each shot as its own checkpoint and announce it in one line, so TR can merge it while you build the next.

## Read

- **The video:** `docs/submission/video.md` (the owner's beat sheet) and `docs/trailer/beats.md` (the owner's later updates and the timeline as built). The beat sheet is the owner's: propose changes in a checkpoint line, don't make them.
- **The page:** `src/trailer/scene.ts` (the interface you implement), `src/trailer/main.ts` (how scenes are found, prepared, cut and drawn), `src/trailer/timeline.ts` (beats and flickers), `src/trailer/cues.ts` (the sound, so the picture can meet it).
- **The look:** `docs/art/art-bible.md` (Twin Deeps, the Well Garden, the Unseen Cathedral, the Braided Crossing) and `src/theme/`. Every colour, line and motion value comes from the theme (Convention 11).
- **The room:** `src/view3d/room/RoomView.ts` (`frame(dt, data, cameraOverride)`, `setWindowScenery`, `renderScriptedShot`, the `scripted` option), `src/view3d/room/loss.ts` and the theme's `lossSequence` (the game's damage: shake, light dips, the hologram dying), `src/view3d/opening/home.ts` (`HOME_SHOT`, `createHomeWindow`: Earth), OP's handoff `docs/handoffs/op.md` on the scripted-shot hooks.
- **The window and the holograms:** VX's handoffs `docs/handoffs/vx-missions.md` and `vx-art.md` (the sky, Twin Deeps' bodies, the belt and crescent, the Cathedral's rocks, the Well Garden's optical producer `src/game/funnel-window.ts`); 3B's FLIGHT funnel view `src/view3d/fields/wells/`; 3C's FLIGHT lattice view `src/view3d/fields/lattice/` and the Cathedral's layout `src/content/chain-link/`; S22's field (`docs/handoffs/s22.md`, `src/content/inverse-wells/`).
- **Real sessions:** NIGHT's driver, `docs/handoffs/night/judge-run/` (real keys and clicks in headless Chrome; the dev build exposes `window.__recursion`), to fly to each moment.
- DECISIONS A19 (wells are real, visible funnels), A16 (the lattice is invisible to the eye), A21 and A17 (Earth at the console), A26; ledger R43 (flashes) and R46 (the Cathedral's model) in `docs/build-plan/coordination.md`.

## What every shot shares

- **Real wherever the game can show it.** Bodies, rocks, wells, the sky and the room come from the game's own data and rendering, at a state the game really reaches. Prefer states reached by playing. **Never invent an object or move a real one.** Anything the game doesn't do is **staged**: build it in the game's style and list it in your handoff (the final card says "some shots staged for the video").
- **Time can be compressed.** A real pass takes minutes and its shot lasts 2.5 s, so replaying real recorded states faster is an edit, not staging. Give the factor for each shot in your handoff.
- **One room rig.** Build a shared rig in `src/trailer/rig/`: one scripted `RoomView` (one WebGL context, its CSS label layer included) that every room scene uses, swapping window scenery, frame data and camera per shot. Scenes attach the rig's canvas to their own element when they render. If the rig can't cover a shot, say why before adding a second context.
- **Deterministic.** `render(beat, local)` draws the frame `local` seconds into the beat and depends only on its arguments: every run, every replay and a jump to any moment (`?still=`) draw the same frame. Capture each shot's real states once into a fixture in its scene folder (or rebuild them deterministically in `prepare()`), and record where each came from (build commit, region, attempt time, inputs) so it can be made again. Keep each fixture to a couple of megabytes.
- **No hitches.** `prepare()` loads everything and compiles every shader (render each shot once off screen); Start waits for it.
- **The recording:** a full-screen Chrome window at 1920 × 1080 physical pixels, 125% scaling, so 1536 × 864 CSS pixels at a device pixel ratio of 1.25, on a 165 Hz laptop panel (RTX 4050). Hold 60 frames a second there through every shot.
- **Flashes (R43): at most three in any second across the whole video.** The page already spends that budget on the snaps and the flickers (`timeline.ts`). A scene changes the whole frame's brightness by a tenth or more only where planned below, and gives TR the exact times and levels; TR adds them to the timeline and its test recounts. No alarm light pulses: it comes on and holds, and the sound carries the pulse.
- **No captions or HUD** in these shots: the room's 3D and its own hologram labels only.
- **The sound is TR's**, already scheduled to the times below. If your picture's moment lands elsewhere, give TR the time and the cue moves.

## The five shots

### 1. Sea of gravity wells — `scenes/wells`, 4.8–7.3 s (2.5 s)

**The owner's vision:** numerous wells in the space around the player, from close to far, in different places across the window, seen in the window and on the hologram over the console at the same time. Then, from the sheet: one well pulls the ship's back end; the ship rotates, and everything in the window moves with it.

- **Window (real):** the Well Garden's real field through VX's optical producer and the room's window rendering. Pick a ship state where many wells show at once, near and far, spread across the panes (VX's walkthrough saw 91 active, 15 ramping and 9 precursors at T+20:38). If a hand-placed position in the real field frames it better, that's allowed and listed as staged.
- **Hologram (staged):** the owner calls it "the map view". In the game MAP is the region chart and draws no wells; the hologram that shows the space around the ship is FLIGHT, which draws wells (3B's funnel view) only from geometry the ship has acquired, and the game doesn't acquire any yet (R32). So draw on FLIGHT's hologram the wells the window shows, from the same state, with 3B's funnel view and the theme's styles. Window and hologram show the same wells at the same moment and turn together.
- **Framing:** the hologram over the console in the foreground and the window beyond, both in frame throughout.
- **The pull and the turn (staged):** about 0.6 s of establishing drift, then a near well behind the ship pulls its tail and the ship yaws, building to the cut; the window and the hologram turn together. Display only: physics, the ship's state and the field are untouched. TR's ship creak starts 0.6 s into the beat.
- Steady brightness: no wells born or flickering in this beat.

### 2. The console, Earth in the window — `scenes/console`, 23.9–26.2 s (2.3 s)

The calm after the montage, and the shot the ending answers (A17, A21): the player standing at the console on the way home.

- **Real:** `HOME_SHOT`'s pose and `createHomeWindow()`'s Earth and stars (no lens) as the window's scenery, the room at its normal level, no alarm.
- **The ship's hologram over the console:** the projector showing the ship, as FLIGHT shows it, with its level disc and no bodies near. The game's opening hides the hologram in this frame, so the hologram over Earth is **staged**: list it. Its labels follow the real hologram's style.
- **Motion:** a very slow push toward the window, or a held frame; the hologram turning slowly. Propose which.
- Ends in a hard cut to black at 26.2 s.

### 3. The slingshot — `scenes/slingshot`, 2.3–4.8 s (2.5 s)

The first shot after the title: Twin Deeps' slingshot past Beta, its exit (A6, A13).

- **Real:** a real pass from a played session, VX's Twin Deeps view: Beta at its exact angular size and lit face, the belt's rocks and the striated violet crescent (VX reached the Beta pass and belt at about T+29:48 after the published 14 m/s prograde burn at 3,960 s). The planet swings across the window from one side toward the other, and the view turns slightly as the ship turns. Compress time as needed.
- **Framing:** from the room looking out through the forward panes, the mullions and the console's edge framing the window. No hologram focus.
- **The shake (staged):** the view shakes up and down through the whole beat, like the game's loss shake (`lossSequence.shake`, `lossSequence.roll`) but steady and a little lighter. Smooth motion, no jolts that read as cuts.
- TR's sound under it: the main engine, the rumble and the hull straining.

### 4. The lattice — `scenes/lattice`, 7.3–10.3 s (3.0 s)

The Unseen Cathedral's lattice is invisible to the eye (A16): FLIGHT shows it, the window doesn't, and then it hits.

- **7.3–about 8.4 s, look down at FLIGHT:** the camera looks down into the FLIGHT hologram over the console, the ship at its centre among the lattice's strands. If 2C's R46 has landed, FLIGHT draws the supported strands from a real played session. Otherwise draw them with 3C's lattice view from the Cathedral's real layout: **staged**, listed.
- **About 8.4–9.0 s, look up at the window:** the camera tilts up to the window: the Cathedral's real rock field, sunlit faces and black unlit sides, and nothing else.
- **About 9.0 s, the strike (real):** the game's own damage, from `sampleLoss`: the shake, the room's light dips and the hologram dying with the last dip, **without** the game's cut to black (the video's snap comes later, at 12.8 s). The alarm light comes on at the strike and holds. Starting at 9.0 s, the loss sequence's three dips (at +0.14, +0.6 and +1.1 s) end before the braid at 10.3 s; give TR the strike time and the dips' times and levels.
- TR's sound: the strike, the game's failure clip and radiation texture, and the alarm (the game's warning) from the strike, repeating until 12.8 s.

### 5. The braid — `scenes/braid`, 10.3–12.8 s (2.5 s)

Flying through the Braided Crossing (C05), a region the game doesn't have yet: **staged**, all of it, in the art bible's look.

- **The picture:** streams of fine sparkling debris crossing at shallow, different angles, like loose braids, with black space between and gaps that never line up; a few separate funnels beyond, seen nearly end-on as fine violet rings around bright throats; lit warm by a small far sun. At speed: the near debris streaks past **both sides** of the window, with parallax between near and far streams.
- **Framing:** from the room looking out the forward panes, so the window frames the motion. The alarm light from the lattice still on; a lighter shake continuing.
- **The flicker is the page's:** it dims the whole frame at 11.6, 12.0 and 12.4 s (`BRAID_DIPS`). The scene keeps its own brightness steady, and its debris sparkle stays small and fine (no large areas pulsing).
- Hard cut to black at 12.8 s: the alarm and every sound cut with it.

## The scene contract

- Each scene: `src/trailer/scenes/<id>/index.ts` exports `createScene`, a `SceneFactory` whose scene has that `id` (`wells`, `console`, `slingshot`, `lattice`, `braid`). The page finds it by folder.
- Use the room's existing hooks. If you need one it lacks, or anything in TR's page or the scene interface to change, ask TR or the integrator through the owner; don't edit those files.

## Owns

`src/trailer/rig/`, `src/trailer/scenes/{wells,console,slingshot,lattice,braid}/`, `docs/handoffs/tv.md` and stills in `docs/handoffs/tv/`. Read anything. Nothing else under `src/` is edited: `src/view3d/` and `src/theme/` are 3F's (and PF's, for `RoomView`'s renderer), `src/game/` 2F's, `src/content/` the encounters', the rest of `src/trailer/` TR's.

## Check

- `npm run check` and `npm run build` stay green, and the trailer isn't in the production build, so the game's bundle doesn't change. Never loosen a test.
- Preview with a dev server on a free port (for example `npm run dev -- --port 5191`): `/src/trailer/?from=4.5` plays from 4.5 s (Space starts, R replays); `/src/trailer/?still=5.5` holds the frame at 5.5 s.
- For each shot, in your handoff: stills at its start, middle and end; the state it uses and how to make it again; its time compression; **every staged element**; its brightness changes for TR, if any; a frame-rate check at 1536 × 864, DPR 1.25 (NIGHT's driver runs headless Chrome over CDP and gives honest frame times).
