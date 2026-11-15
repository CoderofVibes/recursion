# Handoff: OP — The opening

Thread: GPT/Codex · Branch: `p3/op-opening` · Date (Pacific): 2026-11-14

## Delivered

- `src/app/opening/` samples S23's sequence (`3d93895`), lengthened to 16 s by the owner's title (a held black, RECURSION fading in as a whole over 1.5 s, a hold, three flickers, out to black, then 2 s of black before the room), on a visible-time clock. It owns the blackout, title, first-save launch, optional replay and Skip, persistent motion override, and audio cue timing. Live room controls mount at wake-up.
- `src/view3d/opening/` draws the procedural Earth, the localized three-star deflection, and the physical console's cruise and alert indications. `HOME_SHOT` and `createHomeWindow()` are the shared A17/A21 assets.
- R23 adds opt-in camera, window, and lighting hooks to `RoomView`, `outside.ts`, and `shell.ts`. The normal room still gets its sky from the snapshot and uses the existing loss and Recall paths.

## How to verify

- From `.worktrees/op`, run `npm run dev` and open `/src/app/opening/preview.html` on that server. Use a fresh browser profile for the first run. Reload to go straight to the room. Add `?opening=replay` to see the replay Skip control. The preview uses the current encounter's real snapshot and a preview-only opening marker.
- `npm exec -- vitest run src/app/opening/opening.test.ts` tests timeline order, pulse spacing, reduced-motion sampling, cue delivery at 30/60/120 fps, and first-launch/replay/erase eligibility.
- Headless Chrome rendered the console and Earth in one unobstructed pane at 1280×720 and 1920×1080. The title fit at 360×640. The sequence handed off to the live room, skipped on ordinary reload, and exposed a working Skip on explicit replay. The scripted room ignored the live FLIGHT shortcut.
- `npm run check` passed with `VITEST_MAX_WORKERS=6` after 2D's room update. The main suite passed 980 tests with one skipped, and the isolated performance test passed. `npm run build` passed with Vite warnings about bundle size and the lattice field's dynamic import.

## Claims, labelled

- [ASSUMED] The scene uses S23's 250,000 km Earth approach and 83.24° phase with a simplified procedural coastline and seeded clouds. The 2.92° disc follows S23's projection calculation. The surface uses project code and theme colours.
- [FICTIONAL] Three fixed points bend locally in the window just before the cut to suggest the anomaly. The opening sends no force, attitude, time advance or fake loss to the game.
- [DEMONSTRATED: `opening.test.ts`] The authored amber schedule overlaps at most two pulses in any rolling second. The motion option removes the camera offsets, optical deflection, and wake-up nod, and holds the amber strips steady until console power-off. This test checks the programmed schedule.

## Requests outside my ownership

- **R23, app and save owners.** When the C01 expedition route lands, mount `OpeningGate` in the expedition app entry in place of `ControlRoom`, passing its same props plus the canonical `saveSlot` and `hasProgress` from the loaded save. Key the gate by save ID and keep it mounted across recurrence. Pass `replay` only from an explicit replay action outside active flight. Use a quiet loading view before the opening so the wordmark first appears in black. Standalone encounter launches keep their normal entry. The OP branch's dev preview supplies Gravity range as the temporary wake-up scene.
- **Save owner.** The first-launch claim currently uses a namespaced local-storage marker, serialized with Web Locks where supported, and an in-page fallback. The gate clears the marker after a successful erase. Use the canonical expedition save key when mounting. If the expedition store takes over this flag, preserve claim, migration and erase together.
- **AU.** Supply an `OpeningAudio` adapter via the gate's `openingAudio` prop. `cue(id)` receives `opening-rumble`, `opening-alarm`, `loss-failure`, `black-cut`, `opening-title`, `title-out` (the title goes out, 12.2 s; added for the owner's flicker; `opening-title` now marks the first letter at 8.25 s and `room-wake` moved to 14.2 s) and `room-wake` at S23's edges. `ambience(gain)` controls the room bed, `hold(hidden)` follows tab visibility, and `stop()` releases cues on completion, bypass or replay Skip. AU owns browser unlock, missing files, gain, mute and the live-room audio handoff.
- **2D.** Adopt dedicated Earth ocean/land and responsive opening title tokens if the UI lane wants to tune the current theme-based rendering. The ordinary fatal-loss flash cadence is outside this change. Review it separately before using that same sequence in H02.

## Notes for the next phase

- For A17, install `createHomeWindow().scenery` under black using `RoomView.setWindowScenery()`, keep the live room and ordinary walk/look active, and let the player find `HOME_SHOT.position` beside the console. Detach the set piece before disposing it. The opening and ending share sky, phase and framing. The ending's exit outcome and reveal remain with 4D.
- Still to verify on the integrated build are first entry with the actual C01 arrival, the H02 match, and the mix with AU's generated clips.
