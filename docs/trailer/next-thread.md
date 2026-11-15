# TR, continued — finish the 30-second trailer

**Carried out by the FINAL thread (2026-11-15, afternoon)** through step 7, except the owner's shot review (step 3) and the 12 sounds still to come (step 4): where it stands is `docs/handoffs/tr.md`, Update 2. Steps 3, 4, 8 and 9 remain, with the owner.

**Thread:** Claude (integration and screens) · **Worktree:** `.worktrees/tr` (its `node_modules` is linked) · **Branch:** `p3/tr-trailer` · Written by the first TR thread at the owner's wrap-up, 2026-11-15.

You take over the 30-second demo video end to end: the trailer page the owner records, its timeline, cuts, captions, sound and final card, and the merging of the room shots. The goal hasn't changed: **the owner records the finished video in one take from the page, picture and sound together, and it is the owner's vision.** The owner makes the scope calls; ask before anything large.

## Read first

1. `docs/handoffs/tr.md`: where the trailer stands, the owner's sound files and how each is played, what's left.
2. `docs/handoffs/tv.md` **on `p3/tr-visuals`** (`git show p3/tr-visuals:docs/handoffs/tv.md`): the five room shots, their staged elements, the lattice's light dips, the review stills.
3. `docs/trailer/beats.md` (the timeline as built, the owner's captions), `docs/trailer/audio.md` (every sound, file names and simple prompts), `docs/submission/video.md` (the owner's beat sheet), `docs/submission/requirements.md` (30 s or less; AI-generated audio acknowledged).
4. `docs/build-plan/coordination.md`: the TR and TV rows, R59 (PF's full-quality pin), R64 (TV's exception in `RoomView.ts`). The original brief is `docs/build-plan/phase-3-extras.md` § TR.

## Where it stands

- **The page works end to end:** `src/trailer/`, served by any dev server at `/src/trailer/`. Space or a click plays exactly 30.0 s, R replays, C hides captions, F full screen, H hides the status line; `?from=12.5` plays from 12.5 s, `?still=6.1` holds a frame. Picture and sound run on the audio clock. Title, flickers, snaps, the eight captions (the owner's choices) and a draft final card are built. Tests: `src/trailer/*.test.ts` (the sheet's times, R43 flashes, silence on the snaps).
- **Sound:** the owner's first 10 files are in (3 in `src/trailer/audio/`, 7 of the game's in `public/audio/`), measured, with speed, offset and gain set in `cues.ts` to meet the owner's notes. **12 still to come:** `title-out`, `main-engine`, `well-hum`, `lattice-radiation`, `warning`, `home-reveal` (the game's) and `well-groan`, `ship-creak`, `lattice-strike`, `braid-rush`, `montage-bed`, `final-hit` (the trailer's). Missing files play as silence. The owner generates them and leaves them in Downloads.
- **The five room shots are built** by TV (GPT) on `p3/tr-visuals` through `7f56cf9`, **not yet merged here** and **not yet approved by the owner** (A26 review). TV started from TR's first checkpoint (`93b555c`), so its branch lacks everything since: `main` (PF's changes to `RoomView.ts`), the captions, the sound files and the scheduler fix.
- **The montage (13.1–23.9 s) is not started.** It waits on 3F's redesigned console.
- **The final card** is a draft; the owner settles it last.

## What to do, in order

1. **Dev server:** `npm run dev -- --port 5190 --strictPort` in `.worktrees/tr`; the page is `http://localhost:5190/src/trailer/`. The in-app Browser pane throttles frames when hidden: time and capture with headless Chrome (NIGHT's driver, `docs/handoffs/night/judge-run/do.mjs`, or TV's `src/trailer/rig/review.mjs`).
2. **Merge TV:** `git merge p3/tr-visuals`. In `src/view3d/room/RoomView.ts` keep PF's code and TV's one additive method, `renderScriptedFrame` (R64). Then `npm run check`, `npm run build`, and a full headless run: every beat change within 0.05 s of the sheet, no page errors.
   - The strike stays at **9.0 s** (`LATTICE_STRIKE` in `cues.ts`); TV's sound alignment needs no move.
   - TV's room-light dips at 9.14, 9.60 and 10.10 s come from the game's loss animation inside the scene: **don't draw a second page veil over them.** TV's `scenes/lattice/light.test.ts` counts them together with the page's flickers and snaps (R43); keep it and `timeline.test.ts` green.
   - The room light holds at about 0.18 through the braid (the lattice's damage carries on). Point it out at review in case the braid reads too dark.
3. **The owner's shot review (A26).** Holds: wells `?still=6.05`, console `?still=25.05`, slingshot `?still=3.55`, lattice `?still=8.8`, braid `?still=11.55`; then full plays. Collect the owner's changes. Small ones you make in the scene folders; larger 3D work can go back to TV through the owner. TV asks for a re-review once VX's per-region skies (R54) are on `main`.
4. **The sound, as files arrive:** copy each from Downloads under its cue name (the tables in `docs/trailer/audio.md`), measure it (decode in the browser: length, peak, silent lead-in), then set `gain`, `rate` (speed) and `offset` (skip a silent start) in `cues.ts`. Even loudness, peaks below about −1 dBFS (the master has a limiter). The game's files go in `public/audio/`, with a note to the integrator, since the game uses them too.
5. **The montage:** once 3F's console is on `main` (`git merge main`), build `src/trailer/scenes/montage/index.ts`: one scene, eight shots of 1.35 s (`MONTAGE` in `timeline.ts`: FLIGHT, MAP, region view, EXPLORE, MODEL, PLAN, BLACK BOX, SHIP with SYSTEMS). The captions are already the page's. Real screens with real data from a played session; never a fabricated record on a real instrument. The quickest honest route: stills of the real screens from a played session, captured at 1536 × 864 CSS and DPR 1.25 (a 1920 × 1080 canvas), shown full screen. If 3F isn't on `main` when the owner wants to record, ask the owner whether to use today's screens.
6. **Full quality while recording:** PF's adaptive render scale (R59) must never lower the trailer. TV's scripted frames don't feed it; check that the composer's pixel ratio stays at the renderer's through a run, and use PF's pin if it lands. Never load the trailer with `?perf`.
7. **Rehearse:** a full timed run (`window.__trailer.record()` lists every beat change), stills of each beat, and a short capture for the owner.
8. **The owner records:** Chrome full screen (F) on the laptop panel (1920 × 1080 at 125% scaling, so 1536 × 864 CSS); Game Bar at 60 fps with app audio on; Chrome set to High performance (the RTX 4050), which is the owner's setting; wait for the full-screen notice to fade, start Game Bar, press Space. Trim to under 30 s in Clipchamp.
9. **The final card:** the owner's text; its link (`coderofvibes.github.io/recursion`) checked from a private window once `main` is pushed and the site redeployed. Then ask the integrator to merge `p3/tr-trailer`: the page is dev-only, and the merge brings the owner's game sound files to `main`.

## Staged for the video (the final card's label covers them; keep the list in the handoff)

The title's flicker; the slingshot's shake and forward camera; the wells' display eye 400 km forward, its turn and the wells on FLIGHT's hologram; the ship's hologram over Earth; the lattice's FLIGHT reconstruction and its look down and up; the braid, all of it, and its flicker. Edited, not staged: the slingshot's real pass at 7,920×, and the held real states of the wells and the lattice.

## Rules

- **Owns:** `src/trailer/`, `docs/trailer/`, `docs/handoffs/tr.md`, `docs/handoffs/tr/`. `RoomView.ts` only through TV's merged method. Requests elsewhere go to the integrator (the owner's main Claude chat) as a ready-to-paste message.
- `npm run check` after every merge (ESLint lints scripts in `docs/` too); `npm run build` stays green, and the trailer stays out of `dist`.
- **Never loosen a test, tolerance or claim.** After TR's checkpoint 3, two full runs had the same two game tests time out at their 60 s limit (`clouds.test.ts` "turns with the binary", `admission-observer.test.ts` "does not change any truth tick"). Alone, each passes in about 20 s; no game, content or simulation code changed since the last green full check, so it reads as load from other threads sharing the machine. If they fail again, rerun them alone and report it; never raise their limits.
- Commit checkpoints and announce each in one line. Update `docs/handoffs/tr.md` as you go.
- On this machine, Bash heredocs containing apostrophes fail: write commit messages and scripts to a file and pass the path.
