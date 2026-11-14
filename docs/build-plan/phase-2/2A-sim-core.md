# 2A — Simulation core

**Thread:** Claude · **Branch:** `p2/2a-sim` (worktree) · **Phase:** 2 (parallel) · **Needs:** 1A merged; 1B handoff (1D's GMAT vectors join later)

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. Phase 2 builds the first playable, the **Gravity range**: a two-mass field under the inverse-2.5 law where the ship's Newtonian forecasts drift from reality. Read first:
- `docs/CREATIVE_BRIEF.md` §4, §5.
- `docs/DECISIONS.md`: P1 planar, P2 deterministic, P4 normalization, P11 truth/belief boundary.
- `docs/build-plan/README.md` § Conventions; `src/contracts/README.md`.
- Inputs: `docs/physics/derivation.md`, `tests/vectors/physics.json` (1B); `docs/verification/gmat.md`, `tests/vectors/gmat/` (1D); `docs/handoffs/1B.md`, `1D.md`.
- Contracts: `src/contracts/truth/world.ts` (`TruthWorld`, `GravityLaw`, `MassiveBody.gm`), `truth/ship.ts` (`ShipKinematics`, `ActuatorOutput`), `truth/fields.ts` (`EnvironmentField`, `createFieldRegistry`), `truth/events.ts` (`SimEvent`); README § One simulation tick. Fixture to start from: `mockTruthWorld` in `src/contracts/fixtures/truth.ts`. Utilities: `src/lib/` (`v2`, `createFixedStepClock`, `hashState`).

## Goal
The truth simulation: deterministic, fast enough for forecasting, and independently checked against the physics and GMAT vectors. Your implementation is the independent check on 1B's mathematics, so derive from the equations, not from 1B's scripts.

## You own
`src/sim/` (except `src/sim/fields/` files that later sections create), tests under `src/sim/**/*.test.ts`.

## Build
1. Fixed-step integrator per 1B's recommendation (or your reasoned alternative, noted in the handoff).
2. Gravity per P4 as clarified by 1B: a = (gm / r₀²)(r₀ / r)ⁿ with one shared r₀ from `GravityLaw.referenceRadius`; configurable exponent; point sources with collision envelopes, no softening. The same law acts on the ship, asteroids and the massive bodies; bodies that are not `fixed` move under it (the Gravity range binary orbits, DECISIONS P16). If your derivation disagrees with 1B's, request a decision rather than choosing silently.
3. Massive bodies (fixed or orbiting per 1B's playable scale), asteroids as test particles, the ship as a planar rigid body: position, velocity, attitude, angular rate; forces and torques from thrusters at their mounting points, so an offset centre of mass produces torque.
4. Takes `ActuatorOutput` from the ship-systems step (body-frame forces at application points, pure torque, mass properties) and fields from the `FieldRegistry` (none yet beyond gravity; keep the hook). Report the previous step's non-gravitational acceleration so the game layer can fill `EnvironmentEffects.specificForce`.
5. Clearance and contact: ship footprint polygon against body and asteroid radii; report minimum clearance and contacts as events.
6. Snapshot output for the views and an event stream.
7. Pure functions, no DOM, Web Worker friendly. Target: 10⁵ steps in well under 100 ms.

## Tests
- Every case in `tests/vectors/physics.json` within its tolerance.
- Every GMAT case (exponent 2) within DECISIONS P17: 0.05 m, 5e-5 m/s, 1e-6 kg at every sample, run through the game's own propagator at its play step. 1s velocity Verlet misses this by 22–525 m on these low-orbit cases; see P17 for the options. 1D has merged: commit your work, run `git merge main`, and add these tests (read `docs/handoffs/1D.md` § Notes for the next phase first).
- Determinism: same seed and plan give an identical state hash.
- Energy and angular momentum drift bounded over long coasts.

## Done when
All tests pass; a short `src/sim/README.md` covers the API, units, step size and limits; any mismatch with 1B or GMAT is reported, not tuned away.

## Out of scope
Ship systems internals (2B), estimation (2C), rendering.

## Handoff
`docs/handoffs/2A.md` from the template. Contract changes go in "Requests".
