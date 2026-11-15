# Handoff: TR — The 30-second trailer (in progress)

Thread: Claude (Opus 5.5) · Branch: `p3/tr-trailer` · Date (Pacific): 2026-11-15

## Checkpoint 1: the page, with stand-ins

- `src/trailer/`: the trailer page. `index.html` and `main.ts` (start, replay, captions, full screen; picture drawn from the audio clock's output time), `timeline.ts` (beats, flickers, captions), `cues.ts` (every sound on the timeline), `sound.ts` (Web Audio loader and scheduler, with a limiter; a missing file plays as silence), `scene.ts` (the scene interface), `slate.ts` (stand-ins), `scenes/title/` and `scenes/card/` (in the game's title style), `trailer.css`, `audio/` (for the owner's files).
- `docs/trailer/beats.md`: the owner's updates to the beat sheet, the timeline as built, the montage's captions (proposed). `docs/trailer/audio.md`: the cue sheet (the game's cues reused per R56, and the trailer's own nine with ElevenLabs prompts). `docs/trailer/visuals-prompt.md`: thread TV (GPT) for the five room shots (wells, console with Earth, slingshot, lattice, braid) and their shared room rig.

## How to verify

- `npm run check`, `npm run build`. The trailer's tests: `npx vitest run src/trailer`.
- `npm run dev`, then open `/src/trailer/`; Space plays. `?from=12.5` plays from 12.5 s; `?still=6.1` holds a frame.
- [DEMONSTRATED: headless Chrome over CDP, 1536 × 864, dev server] A full run: every beat change within 0.005 s of the sheet (bar 0.05 s), median frame 6.1 ms (the panel's 165 Hz), no page errors.
- [DEMONSTRATED: `timeline.test.ts`] At most three falls and three rises of the frame's brightness in any second, at 24 to 165 frames a second, counted as the game's loss test counts them (R43).
- [DEMONSTRATED: `cues.test.ts`] On both snaps every earlier sound is cut and only `black-cut` plays; the alarm is cut dead at 12.8 s.

## Stand-ins (swap in as each lands)

| Beat | Stand-in now | Real source |
|---|---|---|
| Slingshot | Slate | TV: Twin Deeps' real Beta pass (VX's view), staged shake |
| Wells | Slate | TV's scene (`visuals-prompt.md`) |
| Lattice | Slate | TV: the Cathedral's empty window and the game's damage (real); FLIGHT's lattice (2C's R46, else staged) |
| Braid | Slate | TV: staged, the Braided Crossing in the art bible's look |
| Montage, 8 screens | Slates | 3F's redesigned screens, real played sessions |
| Console | Slate | TV: the opening's first frame (real), the ship's hologram (staged) |

## Staged for the video (the final card's label covers them)

The title's flicker; the slingshot's shake; the wells' turn and the wells on FLIGHT's hologram (TV); the ship's hologram over Earth (TV); the braid and its flicker; FLIGHT's lattice unless R46 lands.

## Open questions

- The montage's captions after the first are proposals for the owner (`timeline.ts`, `MONTAGE`).
- The final card's text and link (`scenes/card/index.ts`) wait until the other work wraps up (owner).
- The lattice's strike is placed at 9.0 s until TV's scene sets the moment; the alarm and the strike's sounds follow `LATTICE_STRIKE` in `cues.ts`.

## Requests outside my ownership

- **Integrator:** fold the owner's beat updates (`docs/trailer/beats.md`) into `docs/submission/video.md`; record thread TV in the ledger (worktree `.worktrees/tv` on `p3/tr-visuals` from `p3/tr-trailer`).
- **Integrator (optional):** `vite.config.ts` `optimizeDeps.entries` could add `src/trailer/*.html`, so the first dev load of the trailer doesn't trigger a dependency re-scan. Not needed today.
- **Integrator: TV's scoped exception (owner authorized, 2026-11-15).** TV may add one additive scripted-frame method to `src/view3d/room/RoomView.ts` for the trailer (holograms visible, frame data and lights at a given time, no clock advance; every existing method unchanged; the game never calls it), placed apart from PF's renderer setup and 3F's region-range code, both unmerged in that file. If needed, an optional explicit time step for the sky's exposure adaptation in `src/view3d/sky/` (VX's), defaulting to today's behaviour. Record it in the ledger and tell 3F, PF and VX.

## Credit

Audio by ElevenLabs (AI-generated), A22: on the final card; the submission's text and the video's metadata must say so too.
