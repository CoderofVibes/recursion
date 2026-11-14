# 2C — Predictive model and Black Box

**Thread:** Claude · **Branch:** `p2/2c-model` (worktree) · **Phase:** 2 (parallel) · **Needs:** 1A merged; 1G merged; P5 answered (A4)

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. The ship's predictive model starts from known physics and improves from data the player acquires; Black Box preserves evidence across recurrence and helps the player compare attempts. Read first:
- `docs/CREATIVE_BRIEF.md` §2, §3, §5, §13.
- `docs/DECISIONS.md`: A4 (the owner's answer on P5: keep 1G's per-distance calibration; rules only from the player; what carries between encounters), P6, P7, P8, P9, P10, P11, P12.
- `docs/build-plan/README.md` § Conventions; `src/contracts/README.md`.
- Inputs: `docs/model/estimator-spec.md` (start with §0 and §12), `tests/vectors/estimator/` (1G), `tools/estimator-ref/` (the Python reference: `core.py`, `fit.py`, `local.py`), `docs/handoffs/1G.md`. Ship systems (2B) are merged: see `src/ship/README.md` for what measurements and telemetry actually arrive.
- Contracts: `ModelState`, `ParameterEstimate`, `ExtensionState` (with `status`), `CalibrationProfile`, `FitSummary` (`src/contracts/model.ts`); `ForecastDraft` (inputs now carry calibration, noise scale and hedge), `issueForecast` (`forecast.ts`); `AttemptRecord`, `BlackBoxArchive` (`attempt.ts`; read the measurement-order and thrust-segment rules in the README); `Measurement` (`measurements.ts`); `Procedure` (`commands.ts`); parameter-ID convention in `src/contracts/README.md`. Fixtures: `models`, `attempts`, `archive`, `procedure` in `src/contracts/fixtures/index.ts`. Both `src/model/` and `src/blackbox/` are lint-blocked from truth.

## Goal
The believed world: an estimator that learns from measurements, a forecast service that propagates the player's plan with honest uncertainty, and Black Box records and comparisons.

## You own
`src/model/`, `src/blackbox/`, their tests.

## Build
1. **Estimator** per the 1G spec, in the order of spec §12 (the vectors follow it): Tier G global fit with priors; Tier L local fits and the per-body calibration profile (A4); extensions (P5) with fit, held-out validation against a chosen attempt, and visible failure of wrong extensions. The model never adopts a rule by itself. Write the small dense solver (Cholesky or LU, up to about 40×40) in `src/model/`; nothing else needs it yet.
2. **Forecast service:** present state from Tier L, reference law × calibration profile, envelope with the hedge outside sampled distances, and a horizon where the line ends (spec §8; DECISIONS P10). Runs in a Web Worker. Uses its own propagation from believed parameters; it must not import `src/sim/` or truth types (P11, enforced by lint). If you need shared numerical code, request it in `src/lib/` via the handoff.
3. **Issued forecasts are immutable**, versioned by model version.
4. **Black Box recorder:** attempt records per the contract (configuration, plan, executed commands, issued forecasts, measurements, events, outcome); persistence in IndexedDB; rebuild of model state from all records (P8).
5. **Comparison analytics** for two attempts: configuration and plan diff, where outcome diverged from forecast, residual series split into coasting and powered, measured strength against distance (spec §9.2, the diagnostic that carries the game), confounding indicator (§9.3). Missing data is reported as missing.
6. **Procedures** (P9): save a command sequence from an attempt; report whether current conditions match its origin.

## Tests
All 54 claims in `tests/vectors/estimator/` (never pass a vector's `truth` block to the estimator; claims marked `compare: qualitative` check only their inequalities); forecast immutability; rebuild-from-records equals live state (spec §11.3); P11 lint passes. The vectors' sensor noise is 1G's placeholder, not 1C's: that is fine for correctness, and retuning to the real ship's noise belongs to balance (2F, 5A).

## Done when
Tests pass; `src/model/README.md` and `src/blackbox/README.md` describe the APIs the console and game loop will call.

## Out of scope
Truth simulation, UI.

## Handoff
`docs/handoffs/2C.md` from the template.
