# src/model — the predictive model

Owner: 2C. Belief side: never imports `src/sim/` or truth (P11, lint-enforced and tested in `service.test.ts`). Implements 1G's specification (`docs/model/estimator-spec.md`) and DECISIONS A4/P5/P6/P8/P10.

The model fits **numbers** automatically (body masses, engine scale and misalignment, sensor biases, a per-body table of gravity strength at the distances flown). It never adopts a **rule**: the player tests an extension against a held-out attempt and adopts it (A4). The forecast shows the consequences of the player's plan with an honest envelope and ends at a horizon; it does not plan (P6).

## How the game loop and console use it

```ts
import { createModelClient, contextFromBriefing } from '../model/index.ts';

const model = createModelClient();                 // Web Worker in the browser, in-thread in tests
await model.init(contextFromBriefing(briefing, shipDefinition, { arrivalMass }));
await model.load({ attempts: archive.attempts, extensions });   // rebuild from Black Box (P8)

// Each attempt
await model.beginAttempt(recorder.snapshot());
// …every few seconds of play, hand over what Black Box recorded since last time:
const { delta, cursor } = recorder.since(lastCursor);
await model.append(attemptId, delta);
const state = await model.refresh();               // Tier L + present state (cheap, same version)

// The player commits a plan → an issued, frozen forecast (record it in Black Box)
const { forecast, detail } = await model.forecast({ id, issuedAt: t, plan, massProperties });
recorder.recordForecast(forecast);

// Attempt ends (loss, Recall, completion)
const next = await model.endAttempt(recorder.end(outcome, state.version));  // Tier G, version + 1

// Rules come only from the player
const test = await model.testExtension('distance-law', ['attempt-0001', 'attempt-0002'], 'attempt-0003');
if (test.adoptable && playerAgrees) await model.adopt('distance-law');      // version + 1
await model.revoke('distance-law');

// Console diagnostics (JSON)
const report = await model.report();   // strength vs distance, residuals, confounding, coverage
const burns = await model.burns();     // per-burn response (§9.5), one fit per burn
const emp = await model.empirical();   // empirical radial/tangential acceleration (§9.4)
```

Every call returns plain JSON. `ModelState` (contract) is the summary the console shows; forecasts come back already passed through `issueForecast` (deep-frozen, never recomputed).

## Client methods (`client.ts` → `service.ts`)

| Method | Does | Version |
|---|---|---|
| `init(context)` | Briefing priors, believed bodies at arrival, nominal ship, settings | 0 |
| `load({ attempts, extensions, version? })` | Full rebuild from records: Tier G over every arc, then Tier L | +1 |
| `beginAttempt(record)`, `append(id, delta)` | The attempt in progress, appended in record order | — |
| `refresh()` | Tier L (windows, local fits, profiles, noise scale) and present state, Tier G values kept | same |
| `refit()` | Tier G now (spec §11.2: in flight at most every so often) | +1 |
| `endAttempt(finalRecord)` | Final record replaces the live copy; Tier G | +1 |
| `forecast({ id, issuedAt, plan, massProperties, duration?, step?, attemptId? })` | `{ forecast, detail }`; `detail.sigmaMajor` splits the envelope by source | — |
| `testExtension(ext, training, heldOut)` | Fit on training attempts, held-out test, evidence, identifiability, earned hedge. Never adopts | — |
| `adopt(ext)` / `revoke(ext)` | Only a test that passed (`adoptable`) can be adopted | +1 |
| `state()`, `extensions()` | Current `ModelState`, history of extension tests | — |
| `report()`, `burns(attempts?)`, `empirical()` | Diagnostics (`report.ts`) | — |

`ModelService` (in-thread, synchronous) has the same methods for code that already runs in a worker; `buildModel(input)` is the pure function underneath.

## Context (`ModelContext`, from the briefing)

- `priors`: `body.<id>.mu` priors define the modelled bodies (the one with the largest μ is the primary). Optional `thruster.<id>.scale`, `thruster.<id>.misalignment`, `sensor.<id>.bias`, `sensor.<id>.scale`, `law.gravity.exponent`. Missing ones use the defaults in `settings.ts`.
- `bodies`: `briefing.knownBodies` (believed positions and velocities at t = 0 set the output frame and the priors on a second body's state).
- `ship`: the `ShipDefinition` (thrust, Isp, mount direction of each thruster; first `optical-tracker` names the camera bias).
- `arrival`, `arrivalMass?`, `fixedBodies?` (mock worlds only), `settings?` (overrides of any `[ASSUMED]` constant).
- `carriedCalibration(state)` returns the thruster and sensor estimates as priors for the next encounter's briefing (A4: ship calibration carries; a body's table does not).

## Parameter and extension ids

Contract ids (`src/contracts/README.md`): `body.<id>.mu`, `law.gravity.exponent`, `thruster.<id>.scale`, `thruster.<id>.misalignment`, `sensor.<camera>.bias` (rad), `sensor.<accelerometer>.scale`. Arc-local values (ship and second-body states per attempt, levels of `limited` burns) stay internal.

Extensions: `distance-law` (adds the exponent) and `unmodeled-body:<bodyId>` (seen mode: a tracked body's gravity, §6.3). `empirical-acceleration` is a diagnostic only (§6.4); unseen bodies and `thrust-response-region` are specified by 1G but not built (not vector-tested).

## What happens inside

| File | Holds |
|---|---|
| `linalg.ts` | Dense LU, Cholesky, inverse, Householder least squares (≤ ~60×60) |
| `dynamics.ts` | Believed dynamics (P4 law, moving bodies, thrust segments, local scale, profiles, empirical terms), RK4 with segment boundaries as nodes, measurement prediction |
| `solve.ts` | Tier G: Levenberg–Marquardt with priors (§4.4), covariance, p_eff, residuals; arc growing; confounding (§9.3); held-out test (§7.2); evidence (§7.1); identifiability (§7.5) |
| `tierL.ts` | Windows (§5.1), local fits (§5.2), noise scale (§5.3), calibration profile (§5.4), present state (§8.1), forecast core with the envelope split by source (§8.2–8.3), earned hedge (§7.4) |
| `diagnostics.ts` | Empirical acceleration (§6.4/§9.4), GM-against-distance slope (§9.2), per-burn response (§9.5) |
| `adapt.ts` | Black Box records → arcs: bearing+range pairing, normal points, accelerometer bins while thrusting, thrust segments from executed burns × nominal ratings with recorded attitude, arcs broken at contacts |
| `engine.ts` | `buildModel`: structure from briefing and adopted extensions, Tier G, Tier L per body, present state, `ModelState` |
| `forecast.ts` | Plan → segments (attitude targets resolved at ignition from the believed state), envelope, horizon, believed inertial frame, body tracks, closest approaches |
| `extensions.ts` | Test / adopt / revoke; hedge in force |
| `report.ts` | Console diagnostics as JSON |
| `service.ts`, `worker.ts`, `rpc.ts`, `client.ts` | Live state, worker, RPC, main-thread client |
| `settings.ts` | Every `[ASSUMED]` constant (stored in `ModelState.settings`) |

**Frames.** The estimator works relative to the primary (at rest at each arc epoch, §3.4). Forecast positions are in the briefing's believed inertial frame: the modelled bodies' barycentre moves uniformly from its believed arrival state. `prograde`/`retrograde` mean the direction of that believed inertial velocity, held from ignition for the burn.

**Present state.** From the last two coasting windows of the current attempt (≥ 12 range fixes on the primary); before that, the briefing's arrival estimate. The forecast propagates from there with the burns already executed after it plus the plan.

**Envelope and horizon (P10).** Sources: present state (× s²), every profile node, hedge outside sampled distances (σ_h = 0.3, smaller once a validated rule earned it), engine scale and misalignment per thruster, masses of bodies without a profile. The line stops at the first sample whose 1σ major axis exceeds 10% of the distance to the nearest body. `extrapolating` marks samples outside the covered distances of the body that pulls hardest there.

**Missing data.** `report().coverage[i].missing` names what an attempt lacks ("no coasting fixes", "no accelerometer record during burns", "burns without an attitude record", …). No windows means no strength points.

## Performance (demonstrated in Chrome via the dev server, model in a Web Worker)

Rebuild with two attempts (12 h and 16 h, 482 records each): 348 ms. In-flight refresh: 19 ms. 12 h forecast, 721 samples: 25 ms. Local fits are cached by window and reference law, so refreshes stay cheap as attempts accumulate.

## Tests

- `vectors.test.ts`: every fit of 1G's seven vectors rebuilt from their inputs, numeric fits within the vectors' tolerances, all **54 claims** re-evaluated from this implementation. The `truth` blocks are read only to judge claims.
- `service.test.ts`: the same vectors as Black Box records through the game layer (GM, thrust and accelerometer calibration, confounding, forecast honesty and horizon, rebuild = live, extension lifecycle including a wrong rule failing visibly, forecast immutability, fixtures, P11 lint on every real file).
