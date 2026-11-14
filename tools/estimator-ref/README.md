# Estimator reference (section 1G)

Reference implementation of the predictive model's estimator, used to generate `tests/vectors/estimator/`. The specification is `docs/model/estimator-spec.md`. Owner: section 1G.

Needs Python ≥ 3.10 and numpy. Nothing else. `bench.mjs` needs Node.

## Commands

Run from the repository root.

```bash
python tools/estimator-ref/generate.py
```

Regenerates all nine vectors and `index.json` (about 2.5 minutes). A vector is written only if all of its claims hold.

```bash
python tools/estimator-ref/generate.py --check
```

Regenerates in memory and compares with the files on disk. Prints `reproduced` per vector.

```bash
python tools/estimator-ref/generate.py --only parameter-aging
```

One vector. `--list` prints the ids.

```bash
python tools/estimator-ref/crosscheck_1b.py tests/vectors/physics.json
```

Runs 1B's trajectory cases through this propagator and compares with 1B's tolerances.

```bash
node tools/estimator-ref/bench.mjs
```

Times the inner loops in JavaScript for spec §4.7.

## Changing an assumption

Every input is in `assumptions.json`: gravity normalization and r₀, body masses and radii, camera, star tracker, gyro and accelerometer noise, priors, the window rule, the hedge, the validated-range transfer rule, the aging rates per parameter class, seeds. Edit the values, then run `generate.py`. Any edit changes `assumptionsHash` in every vector, so regenerate all of them.

Claims that fail are named in the output. A claim can fail because a scenario depends on scale (for example arc durations chosen for a 17 h orbit); in that case adjust the scenario in `estref/scenarios*.py`, not the claim.

## Files

| File | Holds |
|---|---|
| `assumptions.json` | every `[ASSUMED]` input, with label and source |
| `estref/core.py` | believed dynamics (P4 law, moving bodies, thrust, calibration profile with the two-part hedge), measurement prediction, RK4, batched over perturbed parameter sets |
| `estref/fit.py` | Tier G: Levenberg–Marquardt with priors, covariance, residual summary, confounding, held-out consistency |
| `estref/local.py` | Tier L: windows, local fits, noise scale, calibration profile, present state, forecast, earned hedge and validated range |
| `estref/aging.py` | process noise for ship calibration parameters (spec §3.7) |
| `estref/diag.py` | Tier L tables and the empirical-acceleration fit on the calibrated law |
| `estref/common.py` | truth construction, sensor noise models, initial guesses, parameter builders, JSON helpers |
| `estref/scenarios.py`, `scenarios_b.py`, `scenarios_c.py` | the seven revision 1 vectors and their claims |
| `estref/scenarios_d.py` | `carried-rule-forecast` and `parameter-aging` (DECISIONS A5) |
| `estref/jsonfmt.py` | compact JSON writer and numeric comparison |
| `generate.py`, `crosscheck_1b.py`, `bench.mjs` | the commands above |

## Method notes

- Truth and model share one propagator (fixed-step RK4, 60 s). It is checked two ways: each vector records the difference against a 15 s step (`integrationCheck_m`), and `crosscheck_1b.py` matches 1B's independent integrator to about 1e-6 m.
- Jacobians are central finite differences on a batch of perturbed parameter rows, so the reference shares no derivative code with an implementation that uses variational equations.
- Noise comes from `numpy.random.default_rng(seed)` with one seed per vector. Measurements are stored in the vectors, so an implementation never needs this generator.
- Reproduction was checked on one machine (Windows, Python 3.14, numpy 2.4). Across machines the stored measurements may differ in the last bits; `--check` compares inputs to 1e-10 relative and fitted outputs to 1e-6.
