# Estimator reference (section 1G; 3D by 2G)

Reference implementation of the predictive model's estimator. It generates two sets of test vectors and is never the code under test.

| Set | Vectors | Spec | Package | Inputs |
|---|---|---|---|---|
| Planar (revision 2) | `tests/vectors/estimator/`, 9 files, 74 claims | `docs/model/estimator-spec.md`, the planar reduction (§1, Appendix A.1, A.3) | `estref/` | `assumptions.json` |
| 3D (revision 3, DECISIONS A11) | `tests/vectors/estimator-3d/`, 8 files, 104 claims | the same document | `estref3/` | `assumptions.json` and `assumptions-3d.json` |

The planar package and the nine planar files are exactly as 1G left them. The 3D reference is a separate package beside it, so that the planar regression cannot move.

Needs Python ≥ 3.10 and numpy. Nothing else. `bench.mjs` needs Node.

## Commands

Run from the repository root.

### Regenerate and check the planar set

```bash
python tools/estimator-ref/generate.py --check
```

Regenerates the nine planar vectors in memory and compares with the files on disk. Prints `reproduced` per vector (about 1.5 minutes). **Use `--check`, not a plain run, unless you mean to change the planar regression:** the files are the planar regression that the model's tests read.

```bash
python tools/estimator-ref/generate.py
```

Rewrites all nine vectors and `index.json`. A vector is written only if all of its claims hold. `--only ID` does one vector; `--list` prints the ids.

### Regenerate and check the 3D set

```bash
python tools/estimator-ref/generate.py --3d
```

Rewrites the eight 3D vectors and `tests/vectors/estimator-3d/index.json` (about 2.5 minutes, 4.5 when the machine is busy; `inv25-exponent-planes` is the long one). A vector is written only if all of its claims hold.

```bash
python tools/estimator-ref/generate.py --3d --check
```

Regenerates in memory and compares with the files on disk.

```bash
python tools/estimator-ref/generate.py --3d --only thrust-3d-confounded
```

One vector. `--3d --list` prints the ids. `--only` does not rewrite `index.json`; run the whole set after changing a claim count.

`rotation-invariance` reads `newton-recovers-gm.json` and `forecast-envelope.json` from the planar set. If the planar set is ever regenerated with different numbers, regenerate the 3D set after it.

### Planar reduction check

```bash
python tools/estimator-ref/bridge_planar.py
```

Runs every numeric fit of the nine planar vectors through the 3D reference (z = 0, attitude about +z, out-of-plane unknowns held at zero, out-of-plane rows left out; spec Appendix A.3) and compares with the planar expected values; then runs the planar `forecast-envelope` vector through the 3D Tier L, present-state fit and forecast in the same reduction. The two packages share no dynamics or measurement code, so this shows that every 3D formula reduces to the planar one. About 1 minute. `--quick` runs four vectors' fits in about 20 seconds; `--only ID` one vector's fits; `--forecast` only the forecast part (3 seconds). The planar files are only read.

### Propagator cross-checks

```bash
python tools/estimator-ref/crosscheck_1b.py tests/vectors/physics.json
```

Runs 1B's trajectory cases through the planar propagator and compares with 1B's tolerances.

```bash
python tools/estimator-ref/crosscheck_3d.py
```

Runs the 3D propagator against (1) the planar physics vectors with z = 0, (2) the same cases turned into a plane inclined 55°, against 1B's values turned by the same rotation, and (3) the independent 3D physics vectors in `tests/vectors/physics-3d.json` if the file exists. About 2 minutes; `--short` skips the two 2 000 000 s cases and takes 6 seconds.

### Timing

```bash
node tools/estimator-ref/bench.mjs
```

Times the inner loops in JavaScript for spec §4.7, with the planar sizes and the 3D sizes in one run.

## Changing an assumption

Every input of the planar set is in `assumptions.json`: gravity normalization and r₀, body masses and radii, camera, star tracker, gyro and accelerometer noise, priors, the window rule, the hedge, the validated-range transfer rule, the aging rates per parameter class, seeds. Any edit changes `assumptionsHash` in every planar vector, so regenerate all of them, and then the 3D set.

The 3D set reads `assumptions.json` unchanged and adds `assumptions-3d.json`: the truth of the new ship parameters (pitch misalignment, RCS scale, three-component camera misalignment), their priors and aging classes, the rotation and tolerances of the rotation-invariance vector, and the 3D seeds. It is a separate file on purpose: the planar vectors record a hash of `assumptions.json`, so adding even one entry there would change that hash in all nine planar files. Each 3D vector records both hashes.

Claims that fail are named in the output. A claim can fail because a scenario depends on scale (for example arc durations chosen for a 17 h orbit); in that case adjust the scenario in `estref/scenarios*.py` or `estref3/scenarios*.py`, not the claim.

## Files

| File | Holds |
|---|---|
| `assumptions.json` | every `[ASSUMED]` input of the planar set, with label and source |
| `assumptions-3d.json` | the inputs the 3D set adds |
| `generate.py` | both generators (`--3d` selects the 3D set) |
| `bridge_planar.py` | planar reduction check |
| `crosscheck_1b.py`, `crosscheck_3d.py` | propagator cross-checks |
| `bench.mjs` | timing probe, planar and 3D |
| **Planar package `estref/`** | |
| `estref/core.py` | believed dynamics (P4 law, moving bodies, thrust, calibration profile with the two-part hedge), measurement prediction, RK4, batched over perturbed parameter sets |
| `estref/fit.py` | Tier G: Levenberg–Marquardt with priors, covariance, residual summary, confounding, held-out consistency |
| `estref/local.py` | Tier L: windows, local fits, noise scale, calibration profile, present state, forecast, earned hedge and validated range |
| `estref/aging.py` | process noise for ship calibration parameters (spec §3.7) |
| `estref/diag.py` | Tier L tables and the empirical-acceleration fit on the calibrated law |
| `estref/common.py` | truth construction, sensor noise models, initial guesses, parameter builders, JSON helpers |
| `estref/scenarios.py`, `scenarios_b.py`, `scenarios_c.py` | the seven revision 1 vectors and their claims |
| `estref/scenarios_d.py` | `carried-rule-forecast` and `parameter-aging` (DECISIONS A5) |
| `estref/jsonfmt.py` | compact JSON writer and numeric comparison (used by both sets) |
| **3D package `estref3/`** | |
| `estref3/quat.py` | unit quaternions, scalar first, body to inertial; the roll-held pointing rule |
| `estref3/core.py` | 3D dynamics (the same law with the 3D distance, six-state bodies, thrust with two misalignment angles and the recorded quaternion, RCS segments, radial / tangential / orbit-normal empirical terms, the radial profile and hedge), the bearing residual in the tangent plane, the body-frame camera misalignment, the three-axis accelerometer, RK4 |
| `estref3/fit.py` | Tier G in 3D: the planar solver (`estref.fit.Problem.solve`) on the 3D residuals; residual summary along / normal / range; held-out consistency |
| `estref3/local.py` | Tier L in 3D: vector sweep windows, seven-parameter local fits, present state with the camera term, forecast with a 3×3 covariance per sample. The profile, noise scale, earned hedge and spans are imported from `estref.local`: they are radial |
| `estref3/diag.py` | Tier L tables and the three-component empirical fit |
| `estref3/common.py` | orbit planes, truth construction, tangent-plane sensor noise, initial guesses, parameter builders, JSON helpers |
| `estref3/bridge.py` | lifts a planar vector's structures and data for the planar reduction |
| `estref3/scenarios.py` | `inclined-newton-recovers-gm` and helpers shared by the 3D vectors |
| `estref3/scenarios_b.py` | `inv25-two-planes`, `inv25-exponent-planes`, `offplane-body-signature` |
| `estref3/scenarios_c.py` | `thrust-3d-confounded` |
| `estref3/scenarios_d.py` | `forecast-envelope-3d`, `carried-rule-other-plane` |
| `estref3/scenarios_e.py` | `rotation-invariance` |

## Method notes

- Truth and model share one propagator per package (fixed-step RK4, 60 s). It is checked two ways: each vector records the difference against a 15 s step (`integrationCheck_m`), and the cross-checks match independent integrators: the planar one to about 1e-6 m, the 3D one to 1e-6 m over 20 000 s on rotated planar cases and 1e-4 m over 2 000 000 s on the 3D physics vectors.
- Jacobians are central finite differences on a batch of perturbed parameter rows (in 3D, of the whitened residuals), so the reference shares no derivative code with an implementation that uses variational equations.
- The 3D package reuses from the planar one only what does not depend on dimension: the Levenberg–Marquardt loop, the profile and hedge arithmetic, aging, JSON formatting, assumptions. Its dynamics, measurement model, windows and forecast are written again, which is what makes `bridge_planar.py` a real check.
- Noise comes from `numpy.random.default_rng(seed)` with one seed per vector. In 3D a pointing error is two tangent-plane draws (east, north), then range. Measurements are stored in the vectors, so an implementation never needs this generator.
- Reproduction was checked on one machine (Windows, Python 3.14, numpy 2.4). Across machines the stored measurements may differ in the last bits; `--check` compares inputs to 1e-10 relative and fitted outputs to 1e-6.
