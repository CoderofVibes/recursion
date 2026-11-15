# The trailer's beats, as TR builds them

The owner's beat sheet is [`docs/submission/video.md`](../submission/video.md). This page records the owner's later updates, given to TR directly, so the page and the sheet can be reconciled. The numbers live in code in `src/trailer/timeline.ts` (picture) and `src/trailer/cues.ts` (sound); the tests in the same folder hold them to this page.

**Proposed for the integrator:** fold the updates below into `video.md` (its Beats table and "Labels").

## Owner's updates (2026-11-15)

1. **The braid flickers before the snap.** The flight through the braid starts to flicker, at most three flashes a second (R43), before the snap to black at 12.8 s.
2. **Montage captions.** Each montage shot gets its own caption: MAP, the region view, EXPLORE, MODEL, PLAN, BLACK BOX, and the SHIP view with SYSTEMS displayed. "Engineer your way home." comes first. The sheet's separate SHIP and SYSTEMS shots become one shot; PLAN is new.
3. **Map view and region view** both stay in the montage.
4. **The final card and the montage's timing** are settled after the other work wraps up, especially 3F's console.
5. **The gravity wells** (4.8–7.3 s): numerous wells in the space around the player, from close to far, in different places in the window, seen in the window and on the hologram over the console at the same time. Built by thread TV (GPT) with the other room shots, from [`visuals-prompt.md`](visuals-prompt.md).

## The timeline TR builds

| Time (s) | Length | Shot | Notes |
|---|---:|---|---|
| 0.0–0.5 | 0.5 | Black | |
| 0.5–2.0 | 1.5 | **RECURSION**, all at once; three flickers (0.95, 1.35, 1.72 s); gone at 2.0 | Staged. The game's own title style |
| 2.0–2.3 | 0.3 | Black | |
| 2.3–4.8 | 2.5 | Slingshot | Real pass, staged shake |
| 4.8–7.3 | 2.5 | Gravity wells | Real wells, staged rotation; see update 5 |
| 7.3–10.3 | 3.0 | Lattice | Strike at about 9.0 s (TV sets the exact moment) |
| 10.3–12.8 | 2.5 | Braid, flickering from 11.6 s (11.6, 12.0, 12.4) | Staged |
| 12.8–13.1 | 0.3 | **Snap to black** | Everything cuts dead |
| 13.1–23.9 | 8 × 1.35 | Montage, one caption per shot (below) | Real screens after 3F |
| 23.9–26.2 | 2.3 | Console, Earth in the window, the ship's hologram | Real; the hologram over Earth is staged (the opening hides it) |
| 26.2–26.5 | 0.3 | Black | |
| 26.5–30.0 | 3.5 | Final card | Draft until the owner settles it (update 4) |

Flashes, counted the way the game's loss test counts them (falls and rises each at most three in any second): the title's rise at 0.5 s, its three dips, its fall at 2.0 s and the slingshot's rise at 2.3 s; the braid's three dips and the snap at 12.8 s; the snaps around the final card. The lattice's damage lights are added when that scene lands, and the test re-counts.

## Montage shots and captions

FLIGHT opens the montage and carries "Engineer your way home."; the seven screens the owner named follow in the owner's order. **The owner chose every caption (2026-11-15).** Each fits its 1.35 s (about 27 characters at most). One line each in `src/trailer/timeline.ts`.

| # | Shot | Caption |
|---:|---|---|
| 1 | FLIGHT | Engineer your way home. |
| 2 | MAP | Chart an unknown universe. |
| 3 | Region view | Every region is a clue. *(one universe, one set of laws; each region adds a piece: A5, A10)* |
| 4 | EXPLORE | Search for the way home. |
| 5 | MODEL | Measure. Fit. Test. Adopt. |
| 6 | PLAN | Forecast. Plan. Burn. *(P6: the model forecasts, the player plans)* |
| 7 | BLACK BOX | Adapt from every failure. *(the owner's alternative: "Learn from every failure.")* |
| 8 | SHIP with SYSTEMS | Every watt and kilogram counts. |

The montage has **one sound under all eight screens**, the montage's bed: nothing changes on the cuts between screens (owner, 2026-11-15).

"EXPLORE" follows the sheet; 3F named the tab EXPLORATION (A26). The shot shows whichever the game says.
