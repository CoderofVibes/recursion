# 1D — GMAT reference trajectories

**Thread:** GPT/Codex, running on the owner's machine · **Branch:** `p1/1d-gmat` · **Phase:** 1 (parallel)

## Context
Recursion's predictive model starts from "the universe as we know it": Newtonian gravity and an ordinary rocket. The owner approved checking that starting layer against NASA's General Mission Analysis Tool (GMAT), which is on the Space Apps challenge's NASA resource list (`docs/DECISIONS.md` A1). GMAT checks only the Newtonian layer; it is not expected to run the game's fictional inverse-2.5 law. Read first:
- `docs/DECISIONS.md` (A1, P1 planar flight, P2 deterministic fixed-step sim).
- `docs/build-plan/README.md` § Conventions.

## Goal
Independent, reproducible reference trajectories from GMAT that the game's simulation tests will compare against.

## Requirement
GMAT must be installed locally (NASA open-source desktop application). **Do not download or install software yourself.** If GMAT is not available, write the scripts and the doc, then stop and ask the owner to install it.

## You own
`tools/gmat/`, `tests/vectors/gmat/`, `docs/verification/gmat.md`.

## Cases
All in a single plane (equatorial, inclination 0), point-mass central body, every perturbation off (no harmonics, third bodies, drag or solar pressure). Use Earth's GM as GMAT defines it, or a custom body; state which.
1. **C1 circular:** low circular orbit, 3 periods.
2. **C2 eccentric:** e ≈ 0.6, 3 periods.
3. **C3 hyperbolic flyby:** periapsis close to the body, from well outside to well outside.
4. **C4 finite burn:** from C1's circular orbit, a constant-thrust prograde burn with stated thrust, specific impulse and initial mass (choose plausible chemical values), then coast one period. Mass must decrease per the rocket equation.

## Deliverables
1. `tools/gmat/*.script`: one script per case, with a high-accuracy propagator (e.g. RungeKutta89 or PrinceDormand78 with tight tolerances).
2. `tests/vectors/gmat/<case>.csv`: columns `t_s,x_m,y_m,vx_mps,vy_mps,mass_kg` at a fixed output interval, SI units (convert from km if needed), plus a header comment with GM, initial state and burn parameters.
3. `docs/verification/gmat.md`: GMAT version, propagator and tolerances, frames, unit conversions, how to rerun each case, and a recommended comparison tolerance for a fixed-step game integrator (position and velocity error over the run).
4. A short paragraph, ready to paste into the submission, describing how GMAT was used.

## Done when
Each CSV regenerates from its script, units are SI, and the doc lets someone else rerun everything.

## Out of scope
Game code under `src/`. The fictional gravity law.

## Handoff
Write `docs/handoffs/1D.md` from `docs/handoffs/TEMPLATE.md`.
