# 2B — Ship systems v1

**Thread:** GPT/Codex · **Branch:** `p2/2b-ship` · **Phase:** 2 (parallel) · **Needs:** 1A merged; 1C handoff

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. Ship systems interact through shared state: a power decision changes sensing quality; a configuration change changes footprint, cooling and the centre of mass. Read first:
- `docs/CREATIVE_BRIEF.md` §4.
- `docs/DECISIONS.md`: P1, P2, P7 (accelerometers sense thrust only; tracking quality depends on power, pointing, range and condition), P12 (recording costs power).
- `docs/build-plan/README.md` § Conventions; `src/contracts/README.md`.
- Inputs: `docs/engineering/ship-baseline.md`, `docs/engineering/gameplay-couplings.md`, `data/ship-baseline.json`, `docs/handoffs/1C.md`.

## Goal
A deterministic, tested ship-systems step that turns commands into actuator outputs, measurements and events, using the 1C baseline.

## You own
`src/ship/` (subfolders `power/`, `propulsion/`, `sensors/`, `thermal/`, `massprops/`, `config/`), tests under it.

## Build
Implement the contract signature `(state, config, commands, envEffects, dt) → { state, actuators, measurements, events }`:
1. **Power:** sources, battery state of charge and limits, buses, load priorities, allocation commands, protection trips and load shedding. Life support can't be shed.
2. **Propulsion:** main engine and RCS with thrust, specific impulse, mass flow, minimum impulse bit and mounting misalignment. Output thrust vectors at mounting points (the sim turns them into force and torque). Propellant depletes.
3. **Sensors:** optical tracking produces `Measurement`s whose sigma depends on allocated power, range, pointing and condition; accelerometers report non-gravitational acceleration with noise and bias; star tracker attitude; Black Box recorder load scales with sample rate.
4. **Thermal (stub):** heat from each load into one or two nodes with radiators; enough to report temperatures. Phase 3 deepens it.
5. **Mass properties:** mass, centre of mass, inertia and footprint polygon from configuration and remaining propellant.
6. Randomness only from the seeded streams in `src/lib/`.

## Tests
Per subsystem: energy bookkeeping, rocket equation consistency, shedding order, sigma vs power behaviour, centre-of-mass travel as propellant drains, determinism.

## Done when
Tests pass; `src/ship/README.md` documents modes, commands and every coupling implemented, each traced to a 1C entry.

## Out of scope
Orbital dynamics (2A), estimation (2C), UI.

## Handoff
`docs/handoffs/2B.md` from the template.
