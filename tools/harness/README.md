# Playability harness (3E)

Run from the repository root with the existing dependencies; no additional installation is needed:

```powershell
npm run harness -- --suite smoke
npm run harness -- --suite reference
npm run harness -- --suite learning
npm run harness -- --suite routes
```

`--suite all` runs all four. `--seed STRING` selects the production C02 world/noise seed for flights and learning; the S8 references and integration fixtures retain their explicitly reported fixed inputs. It does **not** admit a seed to the expedition catalogue. Invalid arguments fail before running.

Each command writes `reports/<suite>.json` and `reports/<suite>.md`. Learning also writes a gzip JSON artifact containing the original acquired records, frozen forecasts, rule tests/adoption and saved procedure. Reports include the invocation, source revision, SHA-256 hashes of actual source/content/harness/reference inputs, Node version, seeds, commands, acquisition schedule and resolution. Reports are overwritten only for the selected suite. Their source hashes include uncommitted input changes; the revision alone is not the provenance certificate.

## What the suites mean

| Suite       | Production path                                                                              | Claim and limits                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke`     | Real game/recorder/model integration probes; C02 navigator flights                           | Positive coast window and a collision negative control. API operations, warp batching, truth-state JSON replay, frozen forecasts and hidden-truth independence. COMMIT's clock hold is a reported blocker. Headless checks do not establish browser behavior.                                                                                                          |
| `reference` | `createSimulation.run`                                                                       | Imported S8 Cartesian states/impulses at 8/4/2 s. Acceptance at 2 s, with coarse failures retained. No systems, rocks, resource or player-evidence claim. No independent study is rerun.                                                                                                                                                                               |
| `learning`  | `createGameSession`, real `ModelService` through `createModelBridge`, real `AttemptRecorder` | Two distinct completed acquired attempts; scripted distance-law test, disjoint held-out attempt, adoption only when admitted. Paired restore of all acquired calibration/rules and the saved procedure, with zero new packets versus fresh acquisition. The 30,300 s deep-dive window is an investigation, not C02 departure or a complete A5/A9 cakewalk certificate. |
| `routes`    | Real C02 game/ship, stand-in navigator                                                       | Authored finite-burn, roll-held slingshot and the same controls with actuator condition 0.7. Author-script feasibility only. The worn fixture is an explicitly assumed sensitivity case, not a supported content envelope.                                                                                                                                             |

Execution completion and acceptance are separate. Exit 1 means an execution error or failed technical check (including an unhealthy model or a mismatched smoke control). A physically valid route that misses its intended outcome is retained as a **finding**, not discarded or turned into a wall. Missing providers and known A12 blockers keep expedition acceptance **incomplete**, even when the executable checks pass. There is no human playtest claim.

## Deterministic execution and evidence boundary

The runner advances production ticks and commands only. It does not implement gravity, ship resource use, damage, sensing, fitting, prediction or a second recorder. `runFlight(flight, suppliedSetup?)` can consume another content owner's `EncounterSetup` when its integration is delivered. The current `GameSession` requires local epoch zero; arbitrary run-frame continuity is deliberately rejected pending 3D's adapter.

Controls are recorded at exact production tick epochs. Attitude references resolve through production belief navigation. The route plan comes from `src/content/gravity-range/slingshot.test.ts`; its foreknowledge is disclosed. The stand-in navigator's forecasts are never labelled fitted-model evidence.

Recorder/model flight runs use a deterministic 300× logical wall clock (300 simulation seconds per 1,000 logical milliseconds), settling every 300 simulation seconds and at control/forecast boundaries. This removes CPU timing from refit order while leaving production model settings and refresh/refit intervals unchanged. The bounded integration probes explicitly use a fixed clock and short forecast window to isolate API semantics; they are not science flights. No uncertainty, aging or horizon constants are tuned by this harness.

Truth-side metrics are evaluated after each tick and never fed into a command policy, recorder or model. Acquisition counts/freshness represent actual production recorded packets. Missing coverage is unresolved, not clear space. Original forecast hashes are checked after later fits/adoption; the gzip artifact retains the forecasts themselves.

## Metrics and incomplete acceptance

JSON reports retain per-component condition, trips, exposure when supplied, charge, power draws and temperatures; main/RCS and other tanks; production generation/load/heat rate extrema and energy integrals; nominal thermal margins; delivered/unserved actuator impulse and roll-rate diagnostics; acquired targets, sample gaps and freshness; forecast horizon and uncertainty; outcome and the first observed failed margin. A first failure is limited to the production state's and event stream's available thresholds, not a new death rule.

Clearance is explicitly qualified by production geometry, step resolution, missing exported information and angular-step limits. Far production clearance events use COM distance; their hull-reach subtraction is conservative only for the reported passes. Read each report's coverage and limitations before treating a minimum as a whole-flight certificate. No metric invents absent exposure or directional control authority.

Pending acceptance is listed in every report, including both single-branch and both cross-transfer orders. To extend it:

1. **3B/3C/3A/2C/2F:** supply integrated W/L providers, supported arrivals, acquired reconstruction, component exposure/damage chronology, and author controls for informed, blind, worn, abort and finite exterior/ballistic/burn-through cases. Approved A15/A16 semantics are inputs, not new questions.
2. **3D/3A and Phase 4:** supply continuous actual-state transitions, sustainable transit and preparation, investigations, and complete route providers. Retain physical state through each leg; never reseed/reload a baseline ship at a region boundary. Full-session checkpoint restore must include pending commands, epochs, RNG, records and model state.
3. **4C:** provide C05 geometry for two-lesson bypass searches. Until measured, the intended gate is not established. Valid alternatives remain valid findings.
4. **4D:** supply S6 moving-opening/partial-crossing and surviving-state Earth cases under approved A15/A17. Only then measure P14's expert-run remaining main/RCS, power/thermal/control margin. No reserve percentage or resource tax is invented here.
5. **2F/integrator:** resolve A18's live COMMIT, depart accounting/real-assist requirement, finite seed catalogue and power-loss behavior. This baseline still has the older mechanics. S21 owns the belt/power design, not this harness.

Optional gas, tidal and tether systems are not implemented or silently substituted. Human comprehension and final difficulty remain owner playtests.

## Verification

Root configuration excludes `tools/`, so these scoped commands are necessary in addition to the project's checks:

```powershell
node node_modules/typescript/bin/tsc -p tools/harness/tsconfig.json
node node_modules/vitest/vitest.mjs run --config tools/harness/vitest.config.ts
npm run check
npm run build
```

The scoped tests exercise exact acquired-record replay, non-tick command rejection, production resume/warp batching and A12 probes, S8 convergence, metric accumulation and missing-data semantics. Do not run the repository's isolated performance check concurrently with long harness flights.
