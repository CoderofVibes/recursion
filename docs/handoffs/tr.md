# Handoff: TR — The 30-second trailer

Thread: Claude (Opus 5.5) · Branch: `p3/tr-trailer` · Date (Pacific): 2026-11-15 · **Status: paused at the owner's wrap-up; the page works end to end with stand-ins and the first sound files**

## Where it stands

- **The page** (`src/trailer/`, dev only, `/src/trailer/` on any dev server): a black page; Space or a click plays exactly 30.0 s, R replays, C hides captions, F full screen, H hides the status line; `?from=12.5` plays from 12.5 s, `?still=6.1` holds a frame. The picture is drawn from the audio clock's output time and every sound is scheduled on it at Start, so Game Bar records both in sync.
- **Built and final:** the timeline (owner's sheet and updates, `timeline.ts`), the title in the game's style with three flickers, the braid's flicker before the snap, hard cuts and snaps, the eight montage captions as the owner chose them, the sound scheduler and limiter (`sound.ts`, `cues.ts`).
- **Draft:** the final card (`scenes/card/index.ts`): RECURSION, `coderofvibes.github.io/recursion` and the three labels from `video.md`. The owner settles it last.
- **Stand-ins (slates):** the five room shots (TV is building them) and the eight montage screens (not started; see below).
- **Sound:** 7 of the video's 19 files are in (below); the other 12 play as silence until they land.

## Left to do, in order

1. **Merge TV** (`p3/tr-visuals`, prompt `docs/trailer/visuals-prompt.md`) into `p3/tr-trailer` as each shot lands; its scenes drop in by folder, no other change. Then set `LATTICE_STRIKE` in `cues.ts` to TV's strike time, and add the lattice scene's light dips to `timeline.ts` so `timeline.test.ts` re-counts the flashes (R43).
2. **The montage (13.1–23.9 s), not started.** One scene, `src/trailer/scenes/montage/index.ts`, drawing each of the eight screens (`MONTAGE` in `timeline.ts`: FLIGHT, MAP, region view, EXPLORE, MODEL, PLAN, BLACK BOX, SHIP with SYSTEMS) for 1.35 s with real data from a played session, after 3F's console merges. Fastest honest route if time is short: stills of the real screens from a played session (NIGHT's driver in `docs/handoffs/night/judge-run/` can play and screenshot at 1536 × 864), shown full screen; the captions are already the page's.
3. **The rest of the sound** as the owner's files arrive: names and simple prompts in `docs/trailer/audio.md` (trailer-only files into `src/trailer/audio/`, the game's into `public/audio/`). Balance gains in `cues.ts` by ear.
4. **Full quality while recording:** PF's adaptive render scale (R59) must not lower the trailer's room shots; TV's scripted frames don't feed it; use PF's pin when it lands; never `?perf`.
5. **Rehearse and record:** a full run (beat changes within 0.05 s; the page's `window.__trailer.record()` lists them), then the owner records: Chrome full screen (F), Game Bar at 60 fps, Chrome on the RTX 4050 (High performance), Space; trim to under 30 s in Clipchamp.
6. **The final card's link:** `main` pushed and the site redeployed, opened from a private window.

## The owner's sound files (2026-11-15)

Copied from the owner's Downloads under the cue names; measured by decoding in the browser.

| File | Where | Measured | In the trailer |
|---|---|---|---|
| `title-hit.mp3` | `src/trailer/audio/` | 1.68 s, sound 1.34 s, peak −5.3 dBFS | Slowed to 0.89× to fill the title's 1.5 s (owner's note) |
| `flicker-crackle.mp3` | `src/trailer/audio/` | 2.0 s, sound 0.37 s, peak −19.7 | Gain lifted to 1.8 |
| `hull-strain.mp3` | `src/trailer/audio/` | 2.0 s, sound 1.76 s, peak −5.9 | As planned |
| `opening-rumble.mp3` | `public/audio/` | 3.0 s, sound 0.35–2.06 s, peak −21.8 | Starts at 0.35 s, slowed to 0.68×, gain 3.5 (owner: slower, louder) |
| `loss-failure.mp3` | `public/audio/` | 5.0 s, sound to 4.13 s, peak −3.6 | As planned; cut at the snap |
| `black-cut.mp3` | `public/audio/` | 1.48 s, sound to 1.0 s, peak −7.4 | Cut after 0.3 s by the next shot |
| `room-hum.mp3` | `public/audio/` | 7.8 s loop, peak −5.4, RMS −25.1 | As planned |
| `opening-alarm.mp3` | `public/audio/` | 3.0 s, sound to 2.92 s, peak −1.2 | Not in the trailer (game only) |
| `opening-title.mp3` | `public/audio/` | 1.68 s, peak −12.1 | Not in the trailer (game only) |
| `console-click.mp3` | `public/audio/` | 0.49 s, sound 0.01–0.14 s, peak −3.0 | Not in the trailer (game only) |

## How to verify

- `npm run check`, `npm run build` (the trailer isn't in `dist`). The trailer's own tests: `npx vitest run src/trailer`.
- [DEMONSTRATED: headless Chrome over CDP, 1536 × 864, dev server, with the 7 files] A full run ended normally: 19 beat changes, the worst 0.016 s after the sheet (bar 0.05 s), no page errors. Without files: within 0.005 s, frames at the panel's 165 Hz.
- [DEMONSTRATED: `timeline.test.ts`] At most three falls and three rises of the frame's brightness in any second, at 24 to 165 frames a second (R43, counted like the loss test).
- [DEMONSTRATED: `cues.test.ts`] On both snaps every earlier sound is cut and only `black-cut` plays; the alarm is cut dead at 12.8 s.
- **Fixed with the first files:** the scheduler called `stop()` before `start()` on each sound, which Web Audio refuses, so Space did nothing once any file existed. Found by a browser run, not a test; the scheduler has no unit test (it needs a real AudioContext).
- **Not verified:** the mix by ear (levels are measured guesses), and the room shots and montage (stand-ins).

## Staged for the video (the final card's label covers them)

The title's flicker; the slingshot's shake; the wells' turn and the wells on FLIGHT's hologram; the ship's hologram over Earth; the braid and its flicker; FLIGHT's lattice unless 2C's R46 lands.

## Requests outside my ownership

- **Integrator, the game's sound files:** this branch carries seven of the owner's files in `public/audio/` (AU's names). Merging TR brings them to `main`; or copy them from the owner's Downloads. For the game: `opening-alarm` is 3 s long where the game expects about 0.5 s (its alarms are 1.2 and 0.67 s apart, so each cuts the last); `opening-rumble` starts 0.35 s late and peaks at −22 dBFS (the owner asked for it slower and louder; AU's mixer has no speed control); the owner asked for `opening-title` louder (AU's `SHOT_GAIN`); `black-cut` sounds for 1.0 s where 0.2 s was planned.
- **Done (integrator):** the owner's beat updates in `video.md`; TV's worktree, ledger row and scoped exception (R64); R56; R62 (the opening's black-cut timing) to AU.
- **Open, R59 (PF):** the full-quality pin.
- **Optional:** `vite.config.ts` `optimizeDeps.entries` could add `src/trailer/*.html`.

## Credit

Audio by ElevenLabs (AI-generated), A22: on the final card; the submission's text and the video's metadata must say so too.
