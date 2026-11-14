# 1B — Physics derivation

**Thread:** GPT/Codex · **Branch:** `p1/1b-physics` · **Phase:** 1 (parallel)

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. A crewed ship returning from Mars enters an unfamiliar universe where gravity falls off as an inverse-2.5 power of distance. Other physics is ordinary unless we explicitly choose a fictional departure. Read first:
- `docs/CREATIVE_BRIEF.md`, especially §5 (two-mass gravity), §7 (Inverse Wells), §6 (Chain Link Fence) and §11 (this assignment).
- `docs/DECISIONS.md`, especially P1 (planar flight), P4 (proposed normalization), P5, P7.
- `docs/build-plan/README.md` § Conventions.
- Bibliography: `References/BIBLIOGRAPHY.md`. R03 (motion in a nearly circular orbit) and S23 (CODATA constants) are directly relevant. Local copies under `References/local-copies/` may be absent on your machine; use the public links.

## Goal
A bounded, written derivation of the physics the game must simulate, with equations, units, normalization, assumptions and limits, plus machine-readable test values that an independent implementation can be checked against. Everything you produce is **proposed mathematics** until Claude's implementation passes your tests.

## You own
`docs/physics/`, `tests/vectors/physics.json`, `tools/physics/` (scripts that generate the vectors; Python is fine).

## Priorities
**Must: inverse-2.5 gravity**
1. A dimensionally consistent normalization. Evaluate P4, a = (GM / r₀²)(r₀ / r)^2.5, and at least one alternative. State the units of every constant and what r₀ means physically and in play. Recommend one.
2. Potential, energy, angular momentum, effective potential. Circular orbit speed and period scaling. Stability of circular orbits. Apsidal angle and precession of near-circular orbits. Escape speed. Eccentric orbit shapes. Check P4's stated consequences (≈149° precession per radial cycle, escape ≈ 1.15 × circular).
3. Two massive bodies under the same law: two-body reduction, the binary's own motion, equilibrium points (the analogues of Lagrange points) and whether they're stable, and how asteroids behave in the field.
4. What a Newtonian model calibrated at r₀ gets wrong: forecast error growth against distance and time. The apparent "mass" a Newtonian fit infers at distance r (expected GM·(r₀/r)^0.5). Quantitative signatures that separate **wrong distance law**, **wrong mass estimate** and **missing second body**, and why comparing coasting against powered motion isolates gravity from propulsion errors.
5. Maneuver planning consequences: what still holds (rocket equation, Oberth effect), what doesn't (Kepler's laws, Hohmann closed forms), and what that means for burn timing and scheduling.
6. Numerical method for a deterministic fixed-step browser sim (P2): recommend an integrator (e.g. velocity Verlet / leapfrog vs RK4), step size near close approach, energy drift, and a performance budget (forecasts need ~10⁵ steps in well under 100 ms).
7. **A playable scale:** body masses and radii, separation, r₀, typical ship distances and speeds, and the time scales that result, so an encounter takes minutes at reasonable time warp and fits a plausible delta-v budget. Assume a crewed ship of tens of tonnes with chemical main engine and RCS (ship baseline is being written in parallel by section 1C; state your assumptions).
8. Demands on the ship: delta-v, burn durations, scheduling, power and cooling implications.

**Should: Inverse Wells (brief §7)**
Formulate the fictional rule: inside a well's influence, the radial component of the thrust-produced acceleration reverses; tangential is unchanged. Propose profile options (hard boundary vs smooth blend), state that this breaks momentum conservation as a deliberate fiction, and check for exploits (free-energy loops, runaway acceleration).

**Could: Chain Link Fence (brief §6)**
An exposure field for overlapping lattice layers in the flight plane: dose rate as a steep function of distance to the nearest strand, integrated over an extended ship footprint (several sample points or components). Estimate the probability that a blind straight-line traversal survives for a given layer count and spacing.

## Deliverables
1. `docs/physics/derivation.md`: the derivation, with every claim labelled `[ESTABLISHED: source]`, `[ASSUMED]` or `[FICTIONAL]`. Units on every equation. A short "limits and open questions" section.
2. `tests/vectors/physics.json`:
   ```json
   { "version": 1, "units": "SI",
     "cases": [ { "id": "circ-speed-r0", "description": "...",
                  "law": { "exponent": 2.5, "normalization": "P4", "GM": 0, "r0": 0 },
                  "initial": { "r": [0,0], "v": [0,0] },
                  "expect": [ { "quantity": "speed", "at_t": 0, "value": 0, "tolerance": 0 } ] } ] }
   ```
   Include closed-form checks (circular speed, period ratios, apsidal angle, escape speed, energy conservation) **and** trajectory checkpoints from a high-accuracy integration (state at given times) for both exponent 2 and 2.5, single body and two bodies.
3. `tools/physics/`: the script that generated the vectors, runnable, with its integrator and tolerances stated.

## Done when
A reader can implement the gravity law from `derivation.md` alone, every vector is reproducible from the script, and open questions are listed rather than hidden.

## Out of scope
Anything under `src/`. Game design choices beyond proposing scale.

## Handoff
Write `docs/handoffs/1B.md` from `docs/handoffs/TEMPLATE.md`. Contact the owner only for a real blocker or if you think P1 or P4 is wrong.
