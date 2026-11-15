# Phase 3 extras: the opening and basic audio

Added by the owner on 2026-11-14 to be built before the submission. Same conventions as [phase-3.md](phase-3.md): read [the build plan README](README.md) (Conventions, Path releases) and [the coordination ledger](coordination.md) first. Write only your listed paths. Request anything else from its owner through the integrator. Keep `npm run check` and `npm run build` green, and checkpoint as you go: committed, announced in one line.

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
