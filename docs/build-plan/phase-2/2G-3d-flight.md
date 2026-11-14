# 2G — Three-dimensional flight

**Thread:** Claude (Fable) · **Branch:** `p2/2g-3d-flight` (worktree `.worktrees/2g`) · **Phase:** 2 (starts now) · **Needs:** main with 2C update 3 merged (done)

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. The submission deadline is **17:00 PST Sunday, November 15**.

The owner has decided that flight is three-dimensional (DECISIONS A11, replacing P1; `docs/CREATIVE_BRIEF.md` §10, second addendum). Everything below the screen is planar today:
- 2D vectors (`src/lib/vec2.ts`) and 2×2 covariances (`Cov2`);
- attitude as one yaw angle and rate, with one yaw inertia;
- planar footprints, one-angle bearings and sensor sectors;
- a planar physics derivation, planar reference vectors and planar GMAT cases.

This thread makes all of it three-dimensional, end to end. Every check the planar game passes must still pass, and the physics and the model must be re-verified independently in 3D.

The main session is the integrator: it merges every branch and announces merges, after which you commit, run `git merge main` and continue. 2C (model) and 2F (game loop) are stopped while you work, and you own their folders until your handoff. 2D, the control room and every screen, runs alongside you and builds on your contracts.

Read first:
- **Owner and decisions:** `docs/CREATIVE_BRIEF.md` §5, §10 with both addenda, §11, §13 and §14; `docs/DECISIONS.md`, all of it (A11 is this job; mind P2, P4–P7, P11 and A3–A10); `docs/build-plan/README.md` § Conventions.
- **Contracts:** `src/contracts/README.md`.
- **Physics:** `docs/physics/derivation.md`, `tools/physics/`, `tests/vectors/physics.json`, `src/sim/README.md`, `docs/handoffs/2A.md`.
- **GMAT:** `docs/verification/gmat.md`, `tools/gmat/`, `tests/vectors/gmat/`. GMAT R2026a is installed at `%LOCALAPPDATA%\Programs\GMAT\R2026a` (`bin\GmatConsole.exe`); 1D's raw runs are in `%LOCALAPPDATA%\Programs\GMAT\recursion-1d-runs\`.
- **Ship:** `docs/engineering/`, `data/ship-baseline.json`, `src/ship/README.md`, `docs/handoffs/2B.md`.
- **Model:** `docs/model/estimator-spec.md`, `tools/estimator-ref/`, `tests/vectors/estimator/`, `src/model/README.md`, `src/blackbox/README.md`, `docs/handoffs/1G.md`, and `docs/handoffs/2C.md` (all updates).
- **Game:** `src/game/README.md`, `src/app/README.md`, `src/content/gravity-range/README.md`, and `docs/handoffs/2F.md`, especially the slingshot study.
- **What the owner expects to see:** `prototypes/room/world.js` and `holo-flight.js`, and `docs/handoffs/1E.md` Round 3. It's a toy, but it's the 3D flight the owner approved.

## Goal
- The Gravity range flies in three dimensions.
- The model learns the law in three dimensions.
- Every claim the planar game could defend still holds, checked independently.
- The owner plays it in 2D's control room at the Phase 2 playtest.

## What must not change
- **The law (P4):** a = (GM/r₀²)(r₀/r)^2.5 along the line between centres, with one shared r₀ = 1,000 km. Only r becomes a 3D distance.
- **Determinism (P2):** fixed step, seeded streams, exact replay from a seed.
- **Truth and belief (P11):** nothing in `src/model/` imports truth types or `src/sim/`.
- **The model's behaviour** (P5, A4, A5, 1G revision 2):
  - it fits numbers and never invents rules;
  - its forecast widens outside the distances it has sampled and ends at the horizon;
  - the earned hedge applies inside validated spans;
  - calibration ages, and rules face held-out tests.

  Distances the model tracks (support, validated spans) stay radial scalars.
- **P6:** the model forecasts; the player flies and plans.
- **Independent checks:** expected values come from the Python references and GMAT, never from the TypeScript under test.

## You own (until your handoff)
- `src/contracts/`, as a one-time exception for this conversion. The integrator makes no other contract edits meanwhile. Other threads' contract requests are applied after your lift lands, coordinated with you if they collide.
- **Code:** `src/lib/`, `src/sim/` (including `fields/`), `src/ship/`, `src/model/`, `src/blackbox/`, `src/game/`, `src/content/` and `src/app/game.ts`, plus the smallest compile fixes in `src/app/bench/` (2D replaces the bench).
- **Data, docs and tools:** `data/ship-baseline.json`, `docs/physics/`, `docs/model/`, `docs/verification/`, and `docs/engineering/` where the 3D geometry needs it; `tools/physics/`, `tools/estimator-ref/`, `tools/gmat/` and `tests/vectors/`.
- `docs/handoffs/2G.md`.

You do not own:
- `src/console/`, `src/view3d/`, `src/theme/`, `prototypes/` or the rest of `src/app/`; these belong to 2D.
- `docs/DECISIONS.md`. Propose changes in your handoff.

## Work in green checkpoints
Every checkpoint must:
- pass `npm run check` and `npm run build`;
- be committed;
- be announced to the owner in one line ("2G checkpoint N ready: …") so the integrator can merge it and 2D can build on it.

Never hand over a half-converted step. Once the lift has landed, steps 2–4 touch separate folders, so you may run them in parallel with your own subagents; merge each as its own green checkpoint.

### 1. Lift: 3D types, everything still flat (first, and fast)
- **Vectors:** a 3D vector module in place of `vec2`.
- **Covariance:** a 3D position covariance (six unique terms) as a tuple. Fix `DeepReadonly` so tuples keep their shape; today `Forecast` turns `Cov2` into `number[]` (1E's request).
- **Attitude:** a unit quaternion (body to inertial) and an angular-velocity vector, with inertia as principal moments and axes.
- **Footprints:** 3D hull shapes (a convex hull or a few boxes; your choice, documented). The four deployment configurations keep their meaning.
- **Measurements:**
  - optical fixes as two angles (or a unit vector) plus range;
  - attitude fixes on three axes;
  - accelerometers and gyros on three axes;
  - sensor sectors become cones.
- **Encounters:** regions, objective bands and the `depart` objective in 3D (spheres and shells).
- **Hands-on control seam:** define the input the shell sends each frame for flying by hand, and add it to `GameControls`:
  - translation on three axes;
  - yaw and pitch rates, with roll held;
  - main-engine throttle.

  Releasing the controls issues a coasting forecast. Agree the names with 2D through the owner. A stub is fine until step 3.
- **Prove it changed nothing:** give every value z = 0 and keep rotations about z, so every existing test, physics vector, estimator vector and GMAT comparison passes unchanged.
- **Docs and fixtures:** update `src/contracts/README.md` and the fixtures. Add some out-of-plane content to the fixtures so 2D can draw 3D before the physics is real.

### 2. Physics in 3D (`src/sim/`, derivation, vectors, GMAT)
- **The simulation:**
  - the gravity sum, the binary and the asteroids in 3D;
  - rigid-body attitude with quaternions and Euler's equations, integrated deterministically. Say which scheme you used and why, and report energy and angular-momentum drift;
  - contact between the 3D hull and spheres;
  - the sun (A3) as a 3D direction, with spherical shadows;
  - `sim/fields/` generalised.
- **Derivation:** extend `docs/physics/derivation.md` to 3D and mark what is new:
  - orbits about one body stay in a plane, because the force is central;
  - the binary keeps its own plane;
  - particles off that plane: vertical oscillation, and nodal precession under the 2.5 law versus Newton;
  - the Jacobi constant with z.
- **Independent vectors:** extend `tools/physics/generate_vectors.py` with an inclined orbit about Alpha, a particle crossing the binary plane, and a 3D spin case with a known invariant. Check the simulation against them.
- **GMAT:** add inclined Newtonian cases (at least one inclined orbit and one 3D finite burn) under `tools/gmat/`. Run them in GMAT and compare as 1D did, updating `docs/verification/gmat.md`. This keeps A1 true in 3D.

### 3. Ship in 3D (`src/ship/`, `data/ship-baseline.json`)
- **Geometry:** give every assembly a 3D position. Take heights from `prototypes/room/ship-data.js` where 1E set them, so the ship view and the physics agree.
- **Thrust and attitude:**
  - thrusters and RCS pods with 3D directions, giving torque on three axes;
  - a two-axis engine gimbal;
  - principal inertia for each configuration;
  - attitude control on three axes, with deadband and slew limit.
- **Sensing and power:** sensors with 3D boresights, and solar incidence in 3D.
- **Hands-on seam:** implement it.

### 4. Model in 3D (`src/model/`, `docs/model/`, `tools/estimator-ref/`, `tests/vectors/estimator/`)
- **Spec:** revise the estimator spec for 3D, section by section:
  - the state;
  - measurement models (§2);
  - partials (§4.3);
  - Tier L windows;
  - extensions;
  - the forecast envelope as a 3D uncertainty (§8.3), and the horizon;
  - diagnostics (§9).
- **Python reference:** extend `tools/estimator-ref` to 3D and regenerate the vectors with out-of-plane cases. Keep the planar cases as regression.
- **The model:** convert it.
  - Keep all 74 claims in `src/model/vectors.test.ts` and 2C's tests. Report the worst agreement as D7 does.
  - Keep the model's timings within the spec's budget (§4.7; it runs in a worker), and report them.

### 5. Game and the Gravity range in 3D (`src/game/`, `src/content/`, `src/app/game.ts`)
- **The game:** the believed world, maneuvers (`burnSteps` in 3D), the shell's game wiring and Black Box records.
- **The Gravity range in 3D, with its objective (owner, A6):** leave the binary on a slingshot past Beta, through an asteroid belt that orbits Beta.
  - **Objective fields:** replace the low-orbit band with kind `depart` (`depart: { beyond, minSpeed: 50 m/s }`, `maxDeltaV: 16 m/s`).
  - **The owner's intent:** two large masses pull the ship in ways the model doesn't predict while it threads the belt at speed. The model helps only once failed runs have gathered data (A9).
  - **The belt:**
    - Put it where the pass goes, on the same law, so the model mispredicts the rocks as well as the ship. Tracking rocks is then how the player both dodges and probes the law.
    - Check it stays bound to Beta over a run (Hill region about 1,700 km; orbits precess).
    - Untracked rocks are unknown to the model.
  - **Pass direction matters:** with the belt's flow, relative speeds are slow; against it, they're fast and deadly.
  - **Density is a play value:** a blind pass should usually fail, and an informed pass with trims should usually succeed. Check the RCS cost of dodging against the 300 kg RCS load.
  - **Use the third dimension where it makes play:** for example an arrival off the binary plane, or a belt inclined to it. Only do this where the numbers above still hold.
- **Re-run 2F's slingshot study in 3D.** Report:
  - turn angles under the true law and under Newton;
  - minimum speed, burn budget, and pass shift per m/s;
  - belt band, rock count and sizes;
  - relative speeds and propellant used on the pass;
  - how many runs a first-time player is likely to need.

## Left for 2C and 2F (they resume after your handoff)
- **2C:** its unfinished, uncommitted work in `.worktrees/2c` is still planar and not on main: two moving bodies (2F requests 2, 12 and 13). Leave it alone.
- **2F:** asteroid ranging from known-size rocks, A10's per-run seeds, and `EncounterBriefing.referenceRadius`. Take these only if they fall out of step 5 for free.

## If time runs short
Tell the owner at once, with options and your recommendation. Merged checkpoints stand on their own.

## Done when
- `npm run check` and `npm run build` pass.
- These all hold in 3D, with the worst errors reported:
  - the physics vectors, planar and new;
  - GMAT, the old cases and the inclined ones;
  - the estimator vectors (74 claims plus the 3D cases).
- The Gravity range flies in 3D through the game shell, by hand, with a coasting forecast.
- The handoff is written.

## Handoff
`docs/handoffs/2G.md` from the template, with:
- what changed in each area;
- verification results, with the worst errors;
- performance: frame step, model timings;
- the choices you made (attitude scheme, hull shape, roll);
- the 3D slingshot study;
- requests: DECISIONS changes, anything for 2D, and the follow-ups for 2C and 2F.
