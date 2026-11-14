# 2E — 3D sensor view

**Thread:** Claude · **Branch:** `p2/2e-view` (worktree) · **Phase:** 2 (parallel) · **Needs:** 1A merged; 1E handoff

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. While flying, the player sees the ship in a live 3D sensor view; objects appear according to what the ship can actually sense. Read first:
- `docs/CREATIVE_BRIEF.md` §10, §5.
- `docs/DECISIONS.md`: P1 (planar flight, 3D presentation), P6, P10 (display semantics), P11.
- `docs/build-plan/README.md` § Conventions; `src/contracts/README.md`.
- Inputs: `docs/design/visual-direction.md`, `src/theme/`, `prototypes/visual/` (1E).

## Goal
A Three.js view that renders the ship and its surroundings as sensed, plus forecasts, trails and comparisons, from the contract snapshot types.

## You own
`src/view3d/`. Leave `src/view3d/fields/` as a plugin folder for later sections.

## Build
1. A React-mountable component taking the view snapshot, believed world and forecasts as props.
2. Flight plane with depth cues; massive bodies; asteroids drawn where the ship believes they are, with uncertainty when not tracked.
3. Ship with its true footprint for the current configuration, body-axis and thrust-direction ticks, velocity shown distinctly.
4. Issued forecast as a dotted path (frozen), measured trail solid, uncertainty envelope widening into unsampled space (P10).
5. Two-attempt overlay for Black Box comparison.
6. Sensor coverage: unsensed space reads as unknown.
7. Camera: follow ship, free orbit, zoom to fit; smooth, no motion sickness.
8. Field-renderer plugin interface (`src/view3d/fields/<id>`) for wells and lattice later.
9. 60 fps on a mid-range laptop with a few hundred asteroids.

## Done when
Renders all fixtures correctly; plugin interface documented in `src/view3d/README.md`; follows 1E.

## Out of scope
Console panels (2D), real data wiring (2F).

## Handoff
`docs/handoffs/2E.md` from the template, with screenshots.
