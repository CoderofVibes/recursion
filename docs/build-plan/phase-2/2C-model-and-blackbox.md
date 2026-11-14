# 2C — Predictive model and Black Box

**Thread:** Claude · **Branch:** `p2/2c-model` (worktree) · **Phase:** 2 (parallel) · **Needs:** 1A merged; 1G handoff

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. The ship's predictive model starts from known physics and improves from data the player acquires; Black Box preserves evidence across recurrence and helps the player compare attempts. Read first:
- `docs/CREATIVE_BRIEF.md` §2, §3, §5, §13.
- `docs/DECISIONS.md`: P5 (check whether the owner has answered), P6, P7, P8, P9, P11, P12.
- `docs/build-plan/README.md` § Conventions; `src/contracts/README.md`.
- Inputs: `docs/model/estimator-spec.md`, `tests/vectors/estimator/` (1G), `docs/handoffs/1G.md`.

## Goal
The believed world: an estimator that learns from measurements, a forecast service that propagates the player's plan with honest uncertainty, and Black Box records and comparisons.

## You own
`src/model/`, `src/blackbox/`, their tests.

## Build
1. **Estimator** per the 1G spec: parameters and covariance from measurements; extensions mechanism (P5) with fit, held-out validation against a chosen attempt, and visible failure of wrong extensions.
2. **Forecast service:** propagate the believed world with the player's plan and produce predicted states and an uncertainty envelope. Runs in a Web Worker. Uses its own propagation from believed parameters; it must not import `src/sim/` or truth types (P11, enforced by lint). If you need shared numerical code, request it in `src/lib/` via the handoff.
3. **Issued forecasts are immutable**, versioned by model version.
4. **Black Box recorder:** attempt records per the contract (configuration, plan, executed commands, issued forecasts, measurements, events, outcome); persistence in IndexedDB; rebuild of model state from all records (P8).
5. **Comparison analytics** for two attempts: configuration and plan diff, where outcome diverged from forecast, residual series split into coasting and powered, parameter estimate against distance, confounding indicator.
6. **Procedures** (P9): save a command sequence from an attempt; report whether current conditions match its origin.

## Tests
All `tests/vectors/estimator/` cases; forecast immutability; rebuild-from-records equals live state; P11 lint passes.

## Done when
Tests pass; `src/model/README.md` and `src/blackbox/README.md` describe the APIs the console and game loop will call.

## Out of scope
Truth simulation, UI.

## Handoff
`docs/handoffs/2C.md` from the template.
