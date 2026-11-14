# 2D — Console UI

**Thread:** Claude · **Branch:** `p2/2d-console` (worktree) · **Phase:** 2 (parallel) · **Needs:** 1A merged; 1E handoff

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. The player works from a command table in a dim compartment. Instruments, motion and restrained feedback; no explanatory prose; no universal countdown. Read first:
- `docs/CREATIVE_BRIEF.md` §2, §3, §10.
- `docs/DECISIONS.md`: P5, P6, P8, P9, P10.
- `docs/build-plan/README.md` § Conventions; `src/contracts/README.md`.
- Inputs: `docs/design/visual-direction.md`, `src/theme/`, `prototypes/visual/` (1E).
- Contracts: `ViewSnapshot` (`src/contracts/view.ts`), `BelievedShip`/`EquipmentStatus` (`belief.ts`), `ModelState` (`model.ts`), `Plan`/`Command`/`Procedure` (`commands.ts`), `AttemptRecord` (`attempt.ts`). Fixtures: `viewSnapshot`, `viewSnapshotCompare`, `archive`, `models`, `shipDefinition`, `briefing` from `src/contracts/fixtures/index.ts`. `src/console/` is lint-blocked from truth.

## Goal
The console panels for the Gravity range, built against the fixtures in `src/contracts/fixtures/` so they work before the simulation is wired in.

## You own
`src/console/` (shell, panels, hooks). Leave `src/console/encounters/` empty for later sections.

## Build
1. **Layout:** a slot for the 3D view (2E mounts there), equipment rack, power allocation, plan timeline, time controls, Black Box drawer, model panel.
2. **Equipment:** selecting an item shows its controls, readings, related components and recent history.
3. **Power allocation:** competing loads and their consequences, visibly (for example tracking sigma growing as sensor power drops).
4. **Plan editor:** timed burns with direction relative to body axis, velocity, or a chosen body; duration and throttle; attitude and sensor-pointing commands. Commit issues a forecast.
5. **Time controls:** pause, play, warp. Preparation is safe and unhurried.
6. **Black Box compare:** pick two attempts; show what changed, where the outcome diverged from its forecast, residuals split into coasting and powered, parameter estimate against distance.
7. **Model panel:** parameters with uncertainty, extension toggles, test-against-a-record, model version.
8. **Recall** control (voluntary recurrence, P8) and save-procedure control (P9).

## Done when
Every panel renders from fixtures with no console errors; interactions call typed service interfaces (stubbed) that 2F will connect; follows 1E's tokens.

## Out of scope
The 3D scene (2E), real services (2C), game flow (2F).

## Handoff
`docs/handoffs/2D.md` from the template, with screenshots.
