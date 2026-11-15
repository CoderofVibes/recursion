# Borrowed Spin — build scope and acceptance

`[ASSUMED]` Planning estimates and proposed acceptance criteria, not a commitment to a build phase or claims that tests already exist. S3 implements only the reference checks in [numerical-checks.md](numerical-checks.md). The integrator assigns owners after reviewing S1–S3 and updates decisions; this study does neither.

## Recommended scope and smaller alternative

Build finite-inertia 3D exchange, whole-ship/off-axis loading, a single tension-only compliant line, physical capture and release, manual payout/brake control, rotation/line sensing, event-aware conditional forecasts and persistent evidence. Keep a spacious exterior and a direct bypass to Stillwater. The best version makes the engineering choices matter throughout capture, swing and release, not only when pressing the grapple button.

A smaller coherent first slice has one accessible pad on the near face, fixed line length after capture, passive damping, one ship attachment and manual release. It still needs both rigid bodies, torque, sensed state, slack/taut handling, a break limit, actual momentum exchange and local uncertainty. It loses target selection, active payout/heat tradeoffs and some repeat-run variation. Keep axis/phase/arrival variation and inherited ship wear. Do not reduce to an infinite-mass pivot, scripted arc, guaranteed capture or an automatically selected release. Defer physical loose-cable wrapping only with geometry that excludes it and explicit unsupported slack forecasts; S1's wrap study must determine whether that simplification is viable.

## Work map

The model estimate below is the subtotal from [model-addendum.md](model-addendum.md); it must not be counted twice. Counts are rough **new or substantially changed TypeScript lines**, not elapsed-time estimates. S1/S2 alone can estimate their numerical/hardware implementation adequately.

| Slice | Existing / proposed files and data | Estimate | Dependency and first owner |
|---|---|---:|---|
| Contracts, local estimator, forecasts, persistence | `src/contracts/{measurements,belief,model,commands,forecast,attempt}.ts`; `src/model/{adapt,dynamics,tierL,forecast,report,settings,service}.ts` plus local mechanical modules; `src/blackbox/` | 2,250–3,800 production + 800–1,400 tests | Integrator/2G approves contracts; 2C implements independently of truth physics |
| Content and route | New `src/content/borrowed-spin/{world,briefing,variation,objectives}.ts`; encounter data; Stillwater transfer definition in expedition content | 300–600 production | New encounter owner and S4/3D; accepted S1 geometry and S2 limits |
| Game bridge | `src/game/{environment,truth-step,session}.ts`, `src/game/belief/{controls,view,model-bridge,telemetry}.ts` | 300–550 production | 2G then game owner; sensor/event timestamps, mechanical mode, truthful objective reporting, no-pause rules |
| Screens | New `src/console/encounters/borrowed-spin/`; structure/line presentation under `src/view3d/`; reusable additions only by 2D in `src/theme/` | 800–1,400 production | 2D; acquired-geometry and conditional-forecast fixtures first |
| Integrated acceptance/harness | Encounter tests, game/Black Box tests, future `tools/harness/` cases and report schema | 600–1,000 tests/harness | Encounter owner, 2C, game owner and 3E |
| Truth dynamics and hardware | `src/sim/` tether/rigid-body/collision support; `src/contracts/truth/`; `src/ship/` sensors, assemblies, power/thermal/condition; proposed `data/ship-baseline.json` additions | **Separate S1/S2 estimates; excluded from totals** | Sim/ship owners after integrator review |

S3-covered subtotal: approximately **3,650–6,350 production lines plus 1,400–2,400 test/harness lines**, excluding truth dynamics/hardware. New art, performance tuning, physical wrap simulation and any broad 3D refactor are also excluded. These are substantial new systems; they should not be scheduled as a cosmetic addition to an asteroid encounter.

## Exact shared-interface requests

1. **Measured geometry and dynamics:** stable acquired feature IDs scoped to structure/configuration, timestamped bearings/ranges or derived poses with provenance/joint covariance, uncertain feature-to-CoM offsets, rotation and inertia support. No authored axis/inertia/feature catalog as a hidden extra briefing field. Author-known nominal hardware belongs in ship design; the alien structure's geometry does not.
2. **Line hardware and commands:** S2-rated assembly data and measured load/encoder/brake/latch state; commands for arm/fire, payout/reel, brake, release and cut with legal states, power/cost, execution status, timestamp and latency. A command is not a latch observation. Mechanical line connectivity is truth-side; belief carries sensed/inferred alternatives.
3. **Forecasts:** optional mechanical state/input block, explicit conditional branches with assumptions and mode/event intervals, full-ship/line clearance data, load/attitude/temperature predictions only where modeled, and a machine-readable horizon reason. Preserve the existing free-flight path and old saves. State the epoch for each preview and reject stale worker responses by input revision.
4. **Fit support:** retain hardware/configuration trial provenance, observable parameter directions, covariance, unfit/confounded directions and held-out check results. Do not misuse `ValidatedSpan` gravity radius fields for line load. Tag loaded observations so Tier L cannot fit tether acceleration as gravity.
5. **Archive/run identity:** save all issued branches, assumptions, data manifests, command/event records and per-attempt measured arrival priors. Resolve 2C update 3's different-carried-ship-prior issue before pooling attempts. Changing a frame for display does not rewrite archived coordinates.
6. **Physics/time contract:** S1 event order and command quantization must agree in truth/model/replay. Add line capture/release/contact events only through sensor/event production. Use full-ship/line swept collision; keep global deterministic time, no view-driven pause, and no hidden solver that chooses control inputs.
7. **Objective and transfer:** extend the current sphere/departure objective if necessary for a sensed, oriented exit corridor and velocity bounds. Preserve actual ship/line state and elapsed time into Stillwater. Do not gate on tether usage; log momentum exchange as evidence, not a mandatory completion token.

## Verification ladder

### Already executed by S3

`python tools/studies/s3/generate.py --check` checks 26 deterministic algebra/reference assertions and exact JSON regeneration. The report separates three-dimensional feature kinematics, covariance, stale-contact horizon, release sensitivity and observability. It includes isolated torque-free Euler dynamics checks but does **not** integrate a physical tether or validate game/ship behavior.

### Required before physical integration is accepted

- Independently reproduce S1's clean capture/release, excessive-speed break, slack-wrap and wrong-phase vectors. Include linear/angular momentum and energy ledgers with modeled damping, brake heat, gravity, expelled mass and cut/release energy sinks. Use half-step refinement and event-order checks, not solely matching one trace.
- Rotate/translate a full nonplanar fixture and confirm equivalent physical results after the frame transform. Test both attachment torques, body-to-inertial rates, current ship CoM and whole hull deployment. Include near-pole viewing and out-of-plane line/arm contact.
- Same seeded start and timestamped commands reproduce results; save/JSON/reload mid-slack, mid-load and at release remains deterministic. New run noise differs by seed; the same old record never counts twice as new evidence.
- Sensor tests cover feature occlusion, wrong/absent metric scale, common camera bias, ambiguous repeated arms, load-cell failure and sample gaps. Engine-off tension enters specific force and cannot contaminate gravity calibration. Passive spin alone must leave inertia scale unobserved.
- Truth mutation test: with identical acquired records and player inputs, changing unsensed inertia, backside geometry or break thresholds cannot alter the forecast, rendered belief or Black Box explanation. Keep P11 lint/import-boundary tests.

### Required before forecasts and screens are accepted

- Reproduce S3 endpoint/covariance vectors in independent TypeScript tests; test wrong spin sign and symmetric aliases. For actual noisy S1/S2 trajectories, train on one trial and hold out a different observed load/geometry trial. Report tracking, attitude, tension and event-time errors plus residual statistics, coverage and inconclusive fits. Never refit the held-out future into an allegedly original forecast.
- Test before capture, during taut motion, slack, after release, and failed/late release. The no-input forecast must continue tether dynamics. Conditional capture/miss paths stay separate; unsupported contact, load, slack geometry or local clearance ends the relevant path. Known collision remains a visible predicted hazard. Frozen issued forecasts are byte-identical after refit and reload.
- P6 spy checks: preview/issue emits no commands, does not alter the player plan or select/retime target, payout or release. Saved procedure mismatch is surfaced; exact replay is available only for matching recorded conditions.
- A12 interaction test advances a loaded swing at 1× while switching views, reading plots, scrubbing archive, changing allocations and waiting for a slow worker. Time, load and resource state keep evolving. Release and cut remain reachable; command receipt, execution and observed separation are distinct.
- Run the eight-player nonverbal comprehension trial in [interaction.md](interaction.md), including an unresolved cause. Verify color-independent cues, depth interpretation and command discoverability. Record outcomes rather than describing the design as proven legible.

### Required before calling the route playable

The future integrated harness must emit content/ship/model versions, seed, start state, acquired briefing, command sequence, outcome and the following report fields: minimum whole-ship and line clearance; capture relative speed and latch time; peak tension/extension/acceleration; attitude/control saturation; structure spin change with its measurement uncertainty; consumed main/RCS propellant; minimum charge; peak brake/ship temperatures; component damage; tracking/recording gaps; predicted-versus-actual release and Stillwater arrival; full transfer reserve.

The author must check **every shipped seed** if using a curated finite seed set. For larger procedural ranges, test all boundary combinations relevant to capture plus a declared deterministic sample, and report remaining untested space. A suggested first study set is 32 declared seeds with four carried-ship cases: nominal sensing-branch arrival, damaged/hot arrival, power-first cross-transfer, and sensing-first extended route. Revalidate after parameter-range changes. Do not silently retry random layouts at runtime until an omniscient solver finds a solution.

Required route cases: survivable success; low-load evidence-and-abort; recoverable miss or early release; direct bypass with no tether; loss and whole-expedition restart; mismatched saved procedure; stale-knowledge/no-new-measurement cakewalk test; freshly measured expert pass; complete Cathedral → detour/bypass → Stillwater transfer; downstream reserve into the home route. Equivalent evidence elsewhere and zero-loss completion must remain possible. Failing stale-data runs must fail because of real state/geometry/uncertainty, not an enforced missing-measurement flag.

Use the paired direct/tether comparison in the encounter specification to decide whether momentum savings matter. If correction/control/thermal costs overwhelm the exchange, revise the authoring ranges or keep it as an optional investigation. S3's 12 m/s release surrogate is **not** 12 m/s of earned delta-v.

## Owner decisions, presented separately

Each item is one decision with a recommendation; submit in this order through the integrator, not as an assumed approval:

1. **Include Borrowed Spin as an optional new physical system?** Recommend yes after S1 demonstrates a useful, conservatively simulated exchange and S2 fits it to the ship; retain the Cathedral → Stillwater bypass. Costs exceed a content-only encounter.
2. **Is tether mechanics known equipment physics?** Recommend yes: automatic parameter fitting, confidence earned from observations, no P5 adoption gate. Reserve rule discovery for actual departures from known physics.
3. **May inertia vary through fixed-mass internal configuration under A10?** Recommend a small visible/estimable configuration set with the same total mass and outer envelope. Keep inertia fixed if the owner prefers the strict interpretation; never secretly resample mass or strength.
4. **Retain active payout/brake control in the first accepted version?** Recommend yes if S1/S2 establish its controllable load/heat tradeoff; otherwise start with the fixed-length/passive-damping slice above and explicitly defer those experiments.

Exact structure scale, strength, sensor performance and resource budgets remain S1/S2 integration parameters; no new permission request is needed to complete this study with placeholders. A12 and P6 are settled constraints, not questions to reopen.
