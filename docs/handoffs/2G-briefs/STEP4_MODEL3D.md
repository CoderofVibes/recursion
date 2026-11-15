# 2G step 4: the predictive model in three dimensions (`src/model/`, `src/blackbox/`)

Repository: `C:\Dev\Recursion NASA Hackathon\.worktrees\2g` (branch `p2/2g-3d-flight`). Work only in this folder. Other workers edit other folders of this same tree at the same time. **Never commit, never switch branch, never `git stash`, install nothing.** Touch only the paths listed under "You own".

## Where things stand
Flight is three-dimensional (docs/DECISIONS.md A11). The simulation (`src/sim`) and the ship (`src/ship`, `data/ship-baseline.json`) are now genuinely 3D and committed (checkpoints 2 and 3), so the records a real flight produces are three-dimensional already: bearings carry a real elevation with its noise, the accelerometer and gyro have three axes, attitude fixes are full rotation vectors, the main engine's thrust line sits about 11.7 mrad to the right of the body axis and about 15.7 mrad below it (its gimbal trims through a centre of mass that is 0.105 m below the axis), and hands-on flying fires RCS jets on three axes. The model is the piece still planar. Read `src/ship/README.md` for exactly what the ship emits and which jets fire for each hands-on demand; the model may read only the nominal design (`ShipDefinition`, including its `systems` detail) and recorded commands and measurements, never `src/ship` code, `src/sim` or truth contracts.

Checkpoint 1 (the "lift") is committed: contracts are 3D (`src/contracts/`; read `src/contracts/README.md` § Conventions and § Planar data, and `measurements.ts`, `commands.ts`, `belief.ts`, `forecast.ts`, `model.ts`, `estimates.ts`, `ship.ts`), the maths modules exist (`src/lib/vec3.ts`, `quat.ts`, `sym3.ts`), and `src/model` and `src/blackbox` compile and pass their tests with **planar internals**: the estimator's state, partials, solver, Tier L windows and forecast are still two-dimensional, converting at the edges. The planar shortcuts are marked `// LIFT(2G):` (29 of them; `grep -r "LIFT(2G)" src/model src/blackbox`). Your job is to make the model really three-dimensional and remove every marker.

The mathematics is not yours to invent. A separate worker has revised the specification and the independent Python reference for 3D, exactly so that your implementation is an independent check of it:
- **`docs/model/estimator-spec.md`, revision 3**: the 3D specification. The table at its top lists what changed from revision 2. Build to it section by section.
- **`tests/vectors/estimator-3d/`** with its `index.json`: the 3D reference vectors and their claims (format in the spec's Appendix A and in `tools/estimator-ref/README.md`).
- **`tests/vectors/estimator/`**: the nine planar vectors, unchanged. They are the regression.
Expected values come from those files only; never from the TypeScript under test.

Read also: `src/model/README.md`, `src/blackbox/README.md`, `docs/handoffs/2C.md` (all updates), `docs/handoffs/1G.md`, `docs/DECISIONS.md` (A4, A5, A6, A9, A10, A11, P5, P6, P10, P11, D7, D8), `docs/handoffs/2F.md` requests 2, 12, 13 (left for 2C; do not take them on).

## You own
`src/model/` (source, tests, README) and, in `src/blackbox/`, only `compare.ts` and its tests (another worker owns the rest of `src/blackbox/` for procedure storage at the same time). Nothing else. Belief side (P11): never import `src/sim`, `src/contracts/truth`, or truth fixtures; lint enforces it. If the spec or a vector looks wrong, or you need a contract or lib change, do not edit them: stop on that point, keep going on the rest, and put it at the top of your report with the evidence.

## What must not change (A11, A4, A5, P5, P6)
- The model fits numbers and never invents rules; rules come only from the player and face a held-out test.
- Its forecast widens outside the distances it has sampled and ends at the horizon; the earned hedge applies only inside validated spans; calibration ages.
- **Distances the model tracks (support, validated spans, calibration-profile nodes) stay radial scalars.**
- The model forecasts; the player flies and plans.
- Deterministic: no randomness; rebuilding from stored Black Box records gives the same model state as the live model (D7).

## Already in the folder: a robustness fix you must keep
Just before you, a worker fixed a failure reported from the control room: after very short attempts (a record ending inside a burn, an attempt with almost no fixes) every model call failed with `luDecompose: singular matrix` and the model never recovered. Read that worker's changes and tests in `src/model/` first (`git diff HEAD -- src/model`, and the new test file it added). Its rule stands in 3D: **one unusable attempt must never stop the model working**; an attempt or window that cannot determine its state is held by its priors or left out with a stated reason that the report carries; a thrust segment never extends past its record; nothing returns NaN. Keep its regression tests passing and extend them to the six-state case (an attempt with too few fixes to determine z, a record ending inside an out-of-plane burn).

## Contract changes made for you (already in `src/contracts/`, additive)
- `ForecastDetail`, `ForecastSigmaBySource` and `AsteroidForecastNote` are now contract types (`src/contracts/forecast.ts`), and `ForecastDraft` has an optional `detail`. Import them from the contracts instead of declaring them in `src/model/forecast.ts`, and **put the detail inside the draft you return** (keep returning it beside the draft too, so the client's existing signature holds). The control room needs it through `preview` and `commit`.
- `ForecastInputs.camera` (values and covariance of the camera misalignment the present state used, spec §8.1) and `ForecastInputs.plannedAttitudes` (the resolved quaternion of each planned burn): fill both.
- Parameter ids (`src/contracts/README.md` § Parameter IDs): the spec's `camera.bias.z` is the contract's `sensor.<camera>.bias` (the planar id, kept), `.x` and `.y` are `sensor.<camera>.bias-x` and `.bias-y`; `engine.dP` is `thruster.<id>.misalignment-pitch`; `rcs.kR` is `thruster.rcs.scale`; body, unmodelled-body and empirical ids gain `.z` / `.az` forms. Vector names stay the spec's; the mapping lives where the planar one does.

## Notes from the reference's author (read the spec for the full statement of each)
- **Bearing residual:** measured minus predicted along the great circle, in the east/north basis of the *measured* direction (§2.1); the east row is whitened by `sigma_az · cos(el_measured)`. Differencing azimuth and elevation directly fails `rotation-invariance / tier-g-pole-equals-flat`.
- **Attitude on fixes:** each fix needs the recorded attitude (the camera misalignment is fixed in the body frame); the adapter attaches the nearest attitude record; absent means identity. The misalignment is applied as an exact rotation.
- **Thrust:** body direction `[cos dP cos dE, cos dP sin dE, sin dP]`, turned by the recorded quaternion; `dP` positive toward body +z (a rotation about body −y).
- **RCS:** a command may carry a body-frame RCS acceleration, scaled by `rcs.kR`; the accelerometer predicts `kA (kE u t_b + kR a_rcs)`; any firing, main or RCS, makes a window powered. Leaving 1.6 m/s of RCS out drags GM 9.6σ from truth, so hands-on RCS translation must be modelled as segments from the executed `fly` commands and the nominal jet ratings (`ShipDefinition`; the ship worker documents which jets fire for each demand in `src/ship/README.md`).
- **Order and layout:** state x, y, z, vx, vy, vz; covariance `[xx, xy, xz, yy, yz, zz]`.
- **Windows:** the sweep is a vector sum of line-of-sight rotation vectors; on a tail merge the sweeps add and the step between the two groups is not counted, as in the planar reference.
- **Empirical terms:** `.R`, `.T`, `.N` with `t = n × r`.
- **Present state:** with a camera prior it has three extra camera parameters (11 in all); the `rotation-invariance` forecast cases set it to null to match the planar vector.
- **Counts:** m, p_eff and ν count three rows per fix with range, so the noise scale differs slightly from the planar reduction (1.070 against 1.064 on the same data).
- **Planar reduction (spec A.3):** hold z, vz, `dP`, camera x and y, and N at zero as fixed numbers and drop the elevation and f_z rows; the reference marks an unused component `sigma: null`. The nine planar vectors run through this reduction.
- **Vector-specific flags:** `solver.arcGrowing: false` and `dataSubset` on the unseen-body fit; `attemptsFrom` on the held-out case of `inv25-exponent-planes`; planned burns are given as resolved `q`, with `attitudeResolution {qBefore, direction, q}` there to test `pointAlong`.
- **"3σ" for several numbers at once:** 4.48 for six, 3.76 for three, 3.44 for two.
- **Not in the reference** (specified, labelled so in the spec; implement to the spec and label your own evidence): powered-window fits and per-burn response, object tracks and closest approaches (§8.7), Inverse Wells, outliers, aging of the new 3D parameters inside a fit. **Object tracks and closest approaches for tracked asteroids are required**: the Gravity range's ring (320 rocks about Beta) is flown by tracking rocks with the camera, which now gives azimuth, elevation and range on a rock it is pointed at (they are known-size targets), so a tracked rock must appear in `objects` and `closestApproaches` in 3D, with its envelope, and in `detail.asteroids`.

## What to build
1. **The estimator in 3D** per revision 3: six-component states per arc and per moving body; the optical fix as azimuth and elevation (with the reported per-component sigmas) plus range; three-axis accelerometer; attitude from the rotation-vector fixes as quaternions; thrust along the recorded attitude with both misalignment angles; partials, solver and initialisation; Tier L windows and local fits; the calibration profile (still indexed by distance alone); extensions; validation; aging.
2. **Adapter** (`adapt.ts`): the new measurement layouts in full; thrust segments from `burn`, `cutoff` and hands-on `fly` commands with full attitude; whatever revision 3 says about RCS translation from `fly`.
3. **Forecast**: 3D mean and a real 3×3 position covariance per sample (`Cov3`), the two-part hedge, the horizon rule as revision 3 defines it, object tracks and closest approaches in 3D with the hull's true reach (`hullReach` from the contracts), the present `ShipEstimate` with its quaternion and body rates. **Planned-burn attitudes** resolve with `quat.pointAlong(attitudeBefore, direction)` from `src/lib` (roll held), the same function the game layer uses when the command executes, so the ship flies the attitude that was forecast.
4. **Diagnostics and report** (`diagnostics.ts`, `report.ts`, `probes.ts`): 3D per revision 3 §9 and §10.
5. **Black Box** (`src/blackbox/compare.ts` only): forecast divergence measured in 3D; remove its planar shortcut.
6. **Tests:**
   - Keep `vectors.test.ts`: all 74 planar claims still hold from fits made by the 3D code on the planar vectors (lifted with z = 0), and the numeric fits stay within the existing tolerance of the reference. Report the worst agreement the way DECISIONS D7 states it (worst deviation in σ over the numeric fits).
   - Add the same harness for `tests/vectors/estimator-3d/` (every claim of every 3D vector, and the worst agreement).
   - Keep every other existing test in both folders passing with its expectations unchanged (`service`, `revision2`, `runs`, `probes`, `blackbox`): 66 tests today.
   - Planar inputs through the 3D code stay planar: z components and out-of-plane covariance terms come out as exact zeros or at rounding level, stated.
7. **Timing** (spec §4.7; the model runs in a Web Worker): measure a global fit, a Tier L refresh, a rule test and a forecast on the same scenarios the READMEs quote, before and after, and say whether each is within the spec's budget.
8. **READMEs** of both folders rewritten for 3D (no "lift" notes left).

## Check and report
`npx vitest run src/model src/blackbox` (some files take tens of seconds), `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep "src/model/\|src/blackbox/"`, `npx eslint src/model src/blackbox`, `npx prettier --check src/model src/blackbox` (format with `--write`), `grep -rc "LIFT(2G)" src/model src/blackbox/compare.ts | grep -v ":0"` (should print nothing). `src/game` drives the model through `src/model/index.ts` and `src/blackbox/index.ts`: keep every exported name and signature unless revision 3 forces a change (say which); when you are green, also run `npx vitest run src/game/model-loop.test.ts src/game/belief` and report what you saw (do not edit `src/game`; other workers may be changing it and the simulation at the same time, so a failure there may not be yours).

Report (short): what you built per file; planar claims held (of 74) and worst agreement; 3D claims held and worst agreement; timings against the budget; any place the spec or a vector was ambiguous or wrong, and what you did; exported names or signatures changed; anything not done.
