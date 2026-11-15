# The 30-second demo video

The owner's vision (2026-11-15), with the owner's later updates folded in. The snap to black is the core of Recursion: the constant death loop. Thread TR owns the video end to end: a trailer page that plays this sequence, its sound and the title, captions and final card ([phase-3-extras.md § TR](../build-plan/phase-3-extras.md#tr--the-30-second-trailer)). Thread TV builds the five room shots for TR (slingshot, wells, lattice, braid, console with Earth). The owner generates the sounds in ElevenLabs from TR's cue sheet (`docs/trailer/audio.md`) and records the page in one take. The exact times live in TR's code (`src/trailer/timeline.ts`, `cues.ts`), held to TR's `docs/trailer/beats.md` by tests. Organizer rules are in [requirements.md](requirements.md): 30 seconds or less, a public link with no sign-in, visible labels on AI-generated media.

## Beats

| Time (s) | Length | Shot | Source |
|---|---:|---|---|
| 0.0–0.5 | 0.5 | Black | — |
| 0.5–2.0 | 1.5 | **RECURSION** appears all at once, in the game's own title style; three flickers (0.95, 1.35, 1.72 s); gone at 2.0 | Staged |
| 2.0–2.3 | 0.3 | Black | — |
| 2.3–4.8 | 2.5 | **Slingshot:** the planet swings across the window, turning slightly with the ship's motion; the view shakes up and down | Real pass (VX's Twin Deeps view); **the shake is theatrical, for the video only** |
| 4.8–7.3 | 2.5 | **Sea of gravity wells:** numerous wells in the space around the ship, from close to far and in different places, seen in the window and on the hologram over the console at the same time; one pulls the ship's back end, the ship rotates and everything in the window moves with it | Real wells (VX, R50); **the rotation is theatrical** (the simulation's pull is a force with no torque) |
| 7.3–10.3 | 3.0 | **The lattice:** look down at FLIGHT and see the lattice field; look back up at the window and see nothing; **the strike at about 9.0 s**: the ship takes damage, shakes, the alarm goes off | FLIGHT's lattice is real since 2C's R46 (supported strands after a few minutes at Thread). The empty window and the damage are real. TV sets the strike's exact moment |
| 10.3–12.8 | 2.5 | **The braid:** fast motion on both sides of the window, the alarm still going; **the flight starts to flicker** (11.6, 12.0, 12.4 s) before the snap | **Staged**: a brief flying visual |
| 12.8–13.1 | 0.3 | **Snap to black.** Everything cuts dead, the alarm (9.0–12.8 s) with it | — |
| 13.1–23.9 | 10.8 | **The instruments**, eight shots of about 1.35 s, each with its own caption (below) | Real screens, after 3F's redesign, with real data from a played session |
| 23.9–26.2 | 2.3 | **The console:** the player's view of the console and the ship's hologram, Earth in the window | Real (the opening's first frame, A21); the hologram over Earth is staged (the opening hides it) |
| 26.2–26.5 | 0.3 | Black | — |
| 26.5–30.0 | 3.5 | **RECURSION** and the link to the playable build | Final card; a draft until the owner settles it |

**Total: 30.0 s.** Export at or under 30 s and measure the file.

**Flashes:** at most three in any second (R43), counted the way the game's loss test counts them, falls and rises separately. TR's tests count the title's flickers, the braid's flickers and every snap; the lattice's damage lights are counted when that scene lands.

## The instrument montage

FLIGHT opens with the line that frames the whole montage; the owner's seven named screens follow in the owner's order. The separate SHIP and SYSTEMS shots are now one; PLAN is new; MAP and the region view both stay. Captions after the first are TR's proposals for the owner to approve or rewrite.

| # | Shot | Caption |
|---:|---|---|
| 1 | FLIGHT | Engineer your way home. |
| 2 | MAP | Chart an unknown universe. *(proposed)* |
| 3 | Region view | Each region has its own physics. *(proposed)* |
| 4 | EXPLORATION (the renamed MISSION, A26) | Find the way out. *(proposed)* |
| 5 | MODEL | Fit the laws from what you measured. *(proposed)* |
| 6 | PLAN | Plan each burn against the forecast. *(proposed)* |
| 7 | BLACK BOX | Every loss leaves a record. *(proposed)* |
| 8 | SHIP, with SYSTEMS displayed | Every watt and kilogram counts. *(proposed)* |

The montage's timing and the final card are settled after the other work wraps up, especially 3F's console.

## Sound

TR's cue sheet (`docs/trailer/audio.md`) reuses the game's own cues where they fit (R56): the game's death cut at every snap to black, the game's warning as the alarm from the strike at 9.0 s to the snap at 12.8 s, and the engine, wells and radiation sounds under their shots. Every snap to black is dead silence.

## Labels on the final card (small, readable)

- Gameplay footage, edited; some shots staged for the video (recommended, for validity: the slingshot's shake, the wells' rotation, the braid and the hologram over Earth aren't in the game).
- Built with AI assistance (Claude, OpenAI Codex); audio by ElevenLabs (AI-generated), if sound is used.
- Physics checked against NASA GMAT.

## Capture

The owner records the trailer page in a visible browser window at 1920 × 1080 with Windows Game Bar (Win+Alt+R), which records the page's sound with the picture, then trims it in Clipchamp if needed. The page plays the whole sequence itself, captions, snaps and sound included, so recording is one take. The page holds the game's rendering at full quality while it plays (R59).

## Open

- The final card and the montage's timing (after 3F).
- The braid: if it later becomes a real moment in the game, the "staged" label can shrink.
- The wells' rotation could become real physics (a torque from the pull's change along the hull). It touches the simulation, the model and every Well Garden flight, so it waits; the trailer stages it.
- The final link needs `main` pushed and the site redeployed, checked from a private window with no sign-in.
