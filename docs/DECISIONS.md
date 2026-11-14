# Decisions log

Owned by the integrator (the main Claude session). The owner approves. Worker threads never edit this file directly; they request changes in their handoff note.

Three kinds of entry, kept apart as the brief requires:

- **Approved**: the owner signed off. Treat as direction.
- **Proposed**: an implementation choice in use until the owner vetoes or a result contradicts it. Build against it, but keep it easy to change.
- **Demonstrated**: something the running build or a test has actually shown. Cite the test, playtest or commit.

The owner's own direction lives in [CREATIVE_BRIEF.md](CREATIVE_BRIEF.md) and outranks everything here.

---

## Approved

| ID | Decision | Date |
|---|---|---|
| A1 | Check the game's starting (Newtonian) forecaster against NASA GMAT reference trajectories. GMAT is on the challenge's NASA resource list; record the use in the submission. | 2026-11-14 |
| A2 | The game has a built-in predictive model. It starts from known physics and improves from data the player actually acquires. It is an aid, not a solution: the player still makes engineering decisions and flies the ship. (Brief §13.) | 2026-11-14 |

## Proposed

| ID | Decision | Status |
|---|---|---|
| P1 | **Planar flight, 3D presentation.** Positions, velocities and attitude (one yaw angle and rate) live in one plane. The 3D view shows everything, including structures that extend above and below the plane (lattice strands, well funnels). Physics code uses 2D vectors behind a small vector module so a later move to 3D is a code change, not a rewrite. | In use; owner may veto |
| P2 | **Deterministic fixed-step simulation**, pure TypeScript, seeded random streams, headless tests. Same start state + same command sequence = identical result. Required for honest comparisons and procedure replay. | In use |
| P3 | **Stack:** Vite, TypeScript (strict), React for the console, Three.js for the 3D view, Vitest, static hosting. Pinned exact versions, each at least two weeks old when installed: Vite 8.3.5, React 19.3.1, Three 0.187.0, TypeScript 6.0.3 (typescript-eslint does not support TypeScript 7 yet), Vitest 5.0.5, ESLint 10.14.0. Node 22.12 or later. | In use |
| P4 | **Gravity normalization:** a = (GM / r₀²)(r₀ / r)^2.5, i.e. the law matches Newtonian gravity at a reference radius r₀ (where the ship first calibrated on arrival). The coupling constant then has units m^3.5 s⁻² per body. Unverified consequences to check: near-circular orbits precess about 149° per radial cycle; escape speed ≈ 1.15 × circular speed (Newtonian: 1.41). | Pending physics package 1B |
| P5 | **Predictive model split:** the model updates *numbers* (masses, thruster calibration, sensor biases) automatically from data the player collects, and is confident only where data exists. It never invents a new *rule*. When its structure is wrong, the evidence shows it (residuals that won't shrink, a fitted mass that drifts with distance). The player enables a model extension; the model fits it from retained data; Black Box tests it against a held-out attempt. A correct rule extrapolates to unsampled places; a wrong one visibly fails. | **Awaiting owner answer** (alternative: model also learns rules by itself) |
| P6 | **The model forecasts; it does not plan.** It shows the consequences of the player's plan with an honest uncertainty envelope. Configuration, power allocation, burn timing and flying stay with the player. Things the ship has not sensed are absent from the forecast. | In use |
| P7 | **Measurement realism:** accelerometers sense only non-gravitational acceleration (thrust). Gravity is inferred from tracking (optical navigation fixes), whose quality depends on sensor power, pointing, range and equipment condition. | In use |
| P8 | **Recurrence contract:** triggered by loss of the ship or a voluntary Recall from the console. All physical state resets to the arrival condition (position, velocity, propellant, charge, heat, damage, configuration defaults). Black Box keeps: every record (telemetry, measurements, commands, configurations, issued forecasts), adopted model extensions, saved procedures and the chart of leads. The predictive model is rebuilt from Black Box data, so it carries over. Data up to the moment of loss is kept. | In use; owner may revise |
| P9 | **Saved procedures:** a command sequence that worked can be saved and replayed. It replays exactly only when conditions match; different arrival state means the player adapts it. This is how familiar passages get faster without their rules changing. | In use |
| P10 | **Display semantics:** the dotted line is the *issued forecast* path of the centre of mass, frozen when issued. The solid trail is the measured path. Body axis and thrust direction are short ticks on the ship. The uncertainty envelope widens where the model is extrapolating. | In use; visual thread 1E may refine |
| P11 | **Truth/belief boundary:** the simulation's truth world and the ship's believed world are separate types (`src/contracts/truth/` vs `src/contracts/index.ts`). `src/model/`, `src/blackbox/`, `src/console/`, `src/view3d/` and `src/theme/` may not import truth or `src/sim/` (enforced by lint). The game layer (`src/game/`) is the only code holding both; it turns truth into measurements, sensed events and the view snapshot. Forecasts can only use what the ship has measured or assumed. | In use |
| P12 | **Data as a resource:** Black Box recording rate and sensor processing cost power (and storage); this maps to the challenge's "data" resource. | In use |
| P13 | **Contract conventions:** SI units throughout; body frame +x is the direction the main engine pushes the ship; model parameters and truth's hidden values share dotted IDs (`body.alpha.mu`, `thruster.main-engine.scale`); ship housekeeping reaches the model as telemetry measurements, not as direct state; the ship-systems step carries its seeded noise states in its own state, so it is a pure function and replays exactly. Details in `src/contracts/README.md`. | In use |

## Demonstrated

| ID | Result | Evidence |
|---|---|---|
| D1 | The truth/belief lint boundary (P11) blocks belief-side imports of the simulation, truth contracts and truth fixtures, and allows shared contracts. | `src/contracts/boundary.test.ts` |
| D2 | Seeded named RNG streams are independent of draw order and of each other; state saves and restores exactly; the fixed-step clock does not drift over 10⁶ steps. | `src/lib/lib.test.ts` |
