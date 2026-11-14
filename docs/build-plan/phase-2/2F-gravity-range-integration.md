# 2F — Gravity range and game loop (integration)

**Thread:** Claude, main session (integrator) · **Branch:** `main` · **Phase:** 2 (starts in parallel, finishes last) · **Needs:** all Phase 2 handoffs to finish

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. This section owns the game loop and the first playable encounter, and merges every Phase 2 branch. Read first: the brief, `docs/DECISIONS.md`, `docs/build-plan/README.md`, all Phase 1 and Phase 2 handoffs.

## Goal
Put the **Gravity range** in the owner's hands and answer one question: can a player notice the forecast is wrong from instruments alone, compare two attempts, help the model improve, and see the improvement hold on a separate observation, without explanatory text?

## You own
`src/game/`, `src/content/gravity-range/`, `src/app/`, `src/contracts/` (changes requested by other sections), `docs/DECISIONS.md`.

## Build
1. **Game loop:** prepare (safe, paused) → commit plan (forecast issued and frozen) → operate (time warp) → observe → compare → revise → try again.
2. **Recurrence v0** (P8): loss or voluntary Recall resets all physical state to the arrival condition; Black Box and the model persist.
3. **Encounter:** two massive bodies at 1B's playable scale, an asteroid field on the same law, a moving gap or rendezvous objective, limited propellant. Arrival calibration at r₀ makes the Newtonian forecast look right at first and drift as the player explores.
4. Wire 2A truth + 2B ship systems → measurements → 2C model and Black Box → 2D console + 2E view, following `src/contracts/README.md` § One simulation tick. `src/game/` builds `EnvironmentEffects` and `ViewSnapshot`; it is the only code holding truth and belief. `mockEncounter` (`src/contracts/fixtures/truth.ts`) stands in until `src/content/gravity-range/` exists.
5. Merge Phase 2 branches; resolve contract requests; update `docs/DECISIONS.md` (move proven items to Demonstrated).

## Done when
`npm test` and `npm run build` pass on `main`; the owner has played it. Success criterion: from "the forecast is wrong" to "the model's improved explanation works on a different coast" in about ten minutes; a mass-only fix visibly fails at a second distance.

## Gate
Owner playtest. Results update the Phase 3 prompts before they launch.
