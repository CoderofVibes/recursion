# 1A — Foundation and contracts

**Thread:** Claude, main session (integrator) · **Branch:** `main` · **Phase:** 1 (parallel)

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. Read first:
- `docs/CREATIVE_BRIEF.md`: the owner's direction. Authoritative.
- `docs/DECISIONS.md`: approved and proposed implementation choices.
- `docs/build-plan/README.md`: phases, file ownership, conventions.

## Goal
Give every Phase 2 thread a working project, stable shared types and mock data, so they can build in parallel without touching each other's files.

## You own
`package.json`, lockfile, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, lint/format config, `index.html`, `.gitignore`, `src/main.tsx`, `src/app/`, `src/contracts/`, `src/lib/`, `docs/DECISIONS.md`, `docs/build-plan/`, `docs/handoffs/TEMPLATE.md`, root `README.md`.

## Deliverables
1. Vite + TypeScript (strict) + React + Three.js + Vitest. `npm run dev`, `npm test`, `npm run build` all work. Pin exact dependency versions.
2. `src/lib/`: small 2D vector module (P1), seeded RNG with named streams, fixed-step clock, state hashing for determinism tests.
3. `src/contracts/`: types and tiny helpers only, documented in `src/contracts/README.md`:
   - Units: SI internally (m, kg, s, W, J, K). Sim time in seconds.
   - **Truth world** (bodies, asteroids, fields, ship physical state) vs **believed world** (what the ship's model holds). Separate types (P11).
   - Ship: pose, velocity, attitude and rate, mass properties (mass, centre of mass, inertia, footprint polygon per configuration), consumables, equipment states and condition, configuration.
   - Commands and plans: a plan is a timed sequence of commands (burns, attitude, power allocation, equipment modes, sensor pointing).
   - Ship-systems step signature: `(state, config, commands, envEffects, dt) → { state, actuators, measurements, events }`.
   - Environment field interface: a field can add acceleration, modify thrust response, or produce exposure. Registry so later fields (wells, lattice) plug in.
   - Measurement: kind, time, value, sigma, source equipment.
   - Forecast: issued time, model version, inputs, predicted states with uncertainty. Immutable once issued.
   - Attempt record (Black Box): start state, configuration, plan, commands actually executed, issued forecasts, measurements, events, outcome.
   - Model state: parameters, covariance, enabled extensions, version.
   - Encounter definition and view snapshot.
4. `src/contracts/fixtures/`: realistic mock data (a short attempt with forecasts, measurements and two attempts to compare) so console and 3D-view threads can work before the sim exists.
5. Lint rule: nothing under `src/model/` may import truth types or `src/sim/`.
6. Folder skeleton with a one-line `README.md` per owned folder naming its owner section.
7. Placeholder app screen.
8. Exclude `.worktrees/` and `.claude/` from TypeScript, Vitest, lint and the Vite dev-server file watcher, so worker worktrees inside the project folder are never compiled, tested or watched by the main checkout.

## Done when
Build, tests and lint pass on `main`; contracts README explains every type; fixtures load in a test; Phase 2 prompts reference real paths.

## Out of scope
Physics, ship systems, UI beyond a placeholder.
