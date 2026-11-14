# 2F — Gravity range and game loop

**Thread:** Claude (Fable) · **Branch:** `p2/2f-game` (worktree `.worktrees/2f`) · **Phase:** 2 (starts now, finishes last) · **Needs:** 2A, 2B and 2C merged (done); the 2D control room joins as it lands

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. This section owns the game loop and the first playable encounter. The main session stays the integrator: it merges every branch, owns `src/contracts/` and `docs/DECISIONS.md`, and announces merges; you then commit, run `git merge main` and continue.

Read first:
- `docs/CREATIVE_BRIEF.md`; `docs/DECISIONS.md` (all of it: A1–A5, P1–P17, D1–D6); `docs/build-plan/README.md` § Conventions.
- `src/contracts/README.md`, especially § One simulation tick.
- `src/sim/README.md` (2A) and `src/ship/README.md` (2B): the two halves you wire together. Their handoffs: `docs/handoffs/2A.md`, `2B.md`.
- `docs/physics/derivation.md` §6 (1B's candidate scale, DECISIONS P16); `docs/design/expedition.md` row C02 (1F's framing of this encounter); `docs/model/estimator-spec.md` §0 (what the model will do, 1G).

## Goal
Put the **Gravity range** in the owner's hands and answer one question: can a player notice the forecast is wrong from instruments alone, compare two attempts, help the model improve, and see the improvement hold on a separate observation, without explanatory text?

## You own
`src/game/` (core loop, environment, recurrence v0), `src/content/gravity-range/`, `src/app/`, their tests. Contract or decision changes: ask the integrator (through the owner, or in your handoff); do not edit `src/contracts/` or `docs/DECISIONS.md`.

## Before you build the encounter
The owner is the creative lead. Propose the Gravity range's objective (a moving gap, a rendezvous, a reach-region...) and how it forces flight at a second distance, as **one decision with a recommendation**, and wait for the answer. The game loop, environment builder and recurrence below do not depend on it; start there.

## Build
1. **Game loop:** prepare (safe, paused) → commit plan (forecast issued and frozen) → operate (time warp) → observe → compare → revise → try again. Warp changes how many steps run per frame, never `dt`.
2. **Truth step** in `src/game/` (the only code holding truth and belief, P11): build `EnvironmentEffects` from `SimState`, run the 2B ship step, feed its actuators to the 2A simulation, forward acquired measurements and sensed events toward the model and Black Box. Points that are easy to miss:
   - `specificForce` is the previous step's `SimState.specificForce`.
   - Pass the simulation the average of the previous and new ship mass properties (2B reports end-of-step values; see `src/contracts/README.md`).
   - **Sunlight (A3):** set `sunlight.direction` from `world.sun`, and irradiance 0 when a body's disc blocks the line to the sun (parallel rays: a band behind each body).
   - **What the camera can see:** 2B reads `fieldSignals['ship-environment']` (`visibility`, `knownSizeTargets`, `starsVisible`). Mark targets in shadow, or with the sun close behind them, as not visible. Known-size targets are the bodies whose radius the briefing gives.
   - **Hidden calibration:** 2B never reads `world.hidden`. Map true thrust scale, misalignment and sensor biases into the initial equipment `values` (`thrustScale`, `misalignment`, `biasX`...) when you build the arrival state.
   - **Commands:** resolve prograde, retrograde, toward and away from the *believed* navigation solution into inertial angles before submitting; 2B rejects them unresolved.
   - **Recording cadence:** 2B records at most one packet per tick, so `dt` = 1 s caps every instrument at 1 Hz. That is likely fine for 17-hour orbits but multiplies data volume; choose recorder and camera modes so Black Box storage and the model's fits stay fast, and say what you chose.
   - **Contacts:** turn `StepResult.contacts` into `ShipEvent` `contact`, and decide what speed or impulse loses the ship.
3. **Recurrence v0** (P8): loss or voluntary Recall resets the whole encounter (ship, bodies, asteroids) to `EncounterDefinition.world`; Black Box and the model persist. A9 makes a loss restart the whole expedition; with one encounter, that is this same reset.
4. **Encounter** in `src/content/gravity-range/`: the binary from `circularBinary` at the P16 scale (shared r₀ = 1,000 km; GM 1×10¹⁰ and 2.5×10⁹ m³/s²; separation 4,000 km; radii 250 and 160 km), an asteroid field on the same law, the sun, the real 1C ship from `loadShipDefinition()` (not the contract fixtures' mock ship), arrival near r₀ so the Newtonian forecast looks right at first and drifts as the player explores. Use limited propellant per DECISIONS P14 item 2.
   - The model calibrates gravity by distance on its own (A4), so the encounter must require flying somewhere *new*, where only a discovered law forecasts well. Carried knowledge must not make it easy (A5).
5. **Wiring:** the predictive model and Black Box (2C, merged) and the control room (2D: one `ControlRoom` component taking a `ViewSnapshot` and typed services, which `src/app/` mounts) join as they merge. Until then use `src/contracts/fixtures/` stand-ins, keeping the seams where the real modules will plug in.

## Done when
`npm run check` and `npm run build` pass; the owner has played it. Success criterion: from "the forecast is wrong" to "the model's improved explanation works on a different coast" in about ten minutes; a mass-only fix visibly fails at a second distance.

## Gate
Owner playtest. Results update the Phase 3 prompts before they launch.

## Handoff
`docs/handoffs/2F.md` from the template, including contract requests and every play value you chose (dt, warp steps, recorder modes, loss threshold, objective numbers).
