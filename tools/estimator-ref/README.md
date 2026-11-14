# Estimator reference (section 1G)

Reference implementation of the predictive model's estimator, used to generate `tests/vectors/estimator/`. The specification is `docs/model/estimator-spec.md`. Owner: section 1G.

Needs Python ≥ 3.10 and numpy. Nothing else. `bench.mjs` needs Node.

## Commands

Run from the repository root.

```bash
python tools/estimator-ref/generate.py
```

Regenerates every vector and `index.json` (about 100 s). A vector is written only if all of its claims hold.

```bash
python tools/estimator-ref/generate.py --check
```

Regenerates in memory and compares with the files on disk. Prints `reproduced` per vector.

```bash
python tools/estimator-ref/generate.py --only forecast-envelope
```

One vector. `--list` prints the ids.

```bash
python tools/estimator-ref/crosscheck_1b.py tests/vectors/physics.json
```

Runs 1B's trajectory cases through this propagator and compares with 1B's tolerances. `physics.json` arrives when 1B merges.

```bash
node tools/estimator-ref/bench.mjs
```

Times the inner loops in JavaScript for spec §4.7.

## When 1B or 1C land

Every input is in `assumptions.json`: gravity normalization and r₀, body masses and radii, camera, star tracker, gyro and accelerometer noise, priors, the window rule, the hedge, seeds. Edit the values, then run `generate.py`. Claims that fail are named in the output; a claim can fail because a threshold depends on scale (for example arc durations chosen for a 17 h orbit), in which case adjust the scenario in `estref/scenarios*.py`, not the claim.

## Files

| File | Holds |
|---|---|
| `assumptions.json` | every `[ASSUMED]` input, with label and source |
| `estref/core.py` | believed dynamics (P4 law, moving bodies, thrust), measurement prediction, RK4, batched over perturbed parameter sets |
| `estref/fit.py` | Tier G: Levenberg–Marquardt with priors, covariance, residual summary, confounding, held-out consistency |
| `estref/local.py` | Tier L: windows, local fits, noise scale, calibration profile, present state, forecast, earned hedge |
| `estref/diag.py` | Tier L tables and the empirical-acceleration fit on the calibrated law |
| `estref/common.py` | truth construction, sensor noise models, initial guesses, parameter builders, JSON helpers |
| `estref/scenarios*.py` | the seven vectors and their claims |
| `estref/jsonfmt.py` | compact JSON writer and numeric comparison |
| `generate.py`, `crosscheck_1b.py`, `bench.mjs` | the commands above |

## Method notes

- Truth and model share one propagator (fixed-step RK4, 60 s). It is checked two ways: each vector records the difference against a 15 s step (`integrationCheck_m`, at most 0.35 m), and `crosscheck_1b.py` matches 1B's independent integrator to about 1e-6 m.
- Jacobians are central finite differences on a batch of perturbed parameter rows, so the reference shares no derivative code with an implementation that uses variational equations.
- Noise comes from `numpy.random.default_rng(seed)` with one seed per vector. Measurements are stored in the vectors, so an implementation never needs this generator.
- Reproduction was checked on one machine (Windows, Python 3.14, numpy 2.4). Across machines the stored measurements may differ in the last bits; `--check` compares inputs to 1e-10 relative and fitted outputs to 1e-6.
