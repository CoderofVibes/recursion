# src/model — the predictive model

Owner: 2C. Belief side: never imports `src/sim/` or truth (P11, lint-enforced and tested in `service.test.ts`). Implements 1G's specification, revision 2 (`docs/model/estimator-spec.md`), and DECISIONS A4/A5/A6/P5/P6/P8/P10.

The model fits **numbers** automatically (body masses, engine scale and misalignment, sensor biases, a per-body table of gravity strength at the distances flown). It never adopts a **rule**: the player tests an extension against a held-out attempt and adopts it (A4). The forecast shows the consequences of the player's plan with an honest envelope and ends at a horizon; it does not plan (P6). Carried knowledge helps but never makes a later encounter easy (A5): a rule's tighter envelope applies only at the distances it was tested at, and ship calibrations loosen with time, use and damage until re-measured.

## How the game loop and console use it

```ts
import { createModelClient, contextFromBriefing } from '../model/index.ts';

const model = createModelClient(); // Web Worker in the browser, in-thread in tests
await model.init(contextFromBriefing(briefing, shipDefinition, { arrivalMass }));
await model.load({
  attempts: archive.attempts, // rebuild from Black Box (P8)
  extensions: archive.extensionTests, // every rule test
  adopted: archive.adoptedExtensions,
});

// Each attempt
await model.beginAttempt(recorder.snapshot());
// …every few seconds of play, hand over what Black Box recorded since last time:
const { delta, cursor } = recorder.since(lastCursor);
await model.append(attemptId, delta);
const state = await model.refresh(); // Tier L + present state (cheap, same version)

// The player commits a plan → an issued, frozen forecast (record it in Black Box)
const { forecast, detail } = await model.forecast({ id, issuedAt: t, plan, massProperties });
recorder.recordForecast(forecast);

// Attempt ends (loss, Recall, completion)
const next = await model.endAttempt(recorder.end(outcome, state.version)); // Tier G, version + 1

// Rules come only from the player
const test = await model.testExtension('distance-law', ['attempt-0001', 'attempt-0002'], 'attempt-0003');
archive = withExtensionTest(archive, test); // Black Box keeps every test, never edited
if (test.adoptable && playerAgrees) await model.adopt('distance-law'); // version + 1
await model.revoke('distance-law');
archive = withAdoptedExtensions(archive, await model.adopted());

// Console diagnostics (JSON)
const report = await model.report(); // strength vs distance (ship and asteroid windows), residuals, confounding, coverage
const burns = await model.burns(); // per-burn response (§9.5), one fit per burn
const emp = await model.empirical(); // empirical radial/tangential acceleration (§9.4)
```

Every call returns plain JSON. `ModelState` (contract) is the summary the console shows; forecasts come back already passed through `issueForecast` (deep-frozen, never recomputed).

## Client methods (`client.ts` → `service.ts`)

| Method | Does | Version |
|---|---|---|
| `init(context)` | Briefing priors, believed bodies and asteroids at arrival, nominal ship, settings | 0 |
| `load({ attempts, extensions?, adopted?, version? })` | Full rebuild from records: Tier G over every arc, then Tier L | +1 |
| `beginAttempt(record)`, `append(id, delta)` | The attempt in progress, appended in record order | — |
| `refresh()` | Tier L (ship and asteroid windows, local fits, profiles, noise scale) and present state, Tier G values kept; arcs Tier G has not seen get a fit of their own with the globals frozen | same |
| `refit()` | Tier G now (spec §11.2: in flight at most every so often) | +1 |
| `endAttempt(finalRecord)` | Final record replaces the live copy; Tier G | +1 |
| `forecast({ id, issuedAt, plan, massProperties, duration?, step?, attemptId? })` | `{ forecast, detail }`; `detail.sigmaMajor` splits the envelope by source, `detail.asteroids` says which tracked asteroids were forecast | — |
| `testExtension(ext, training, heldOut)` | Fit on training attempts, held-out test, evidence, identifiability, earned hedge and the validated spans it covered. Never adopts | — |
| `adopt(ext)` / `revoke(ext)` | Only a rule whose latest test passed (`adoptable`) can be adopted. Test records are never edited | +1 |
| `state()`, `extensions()`, `adopted()` | Current `ModelState`; every rule test (for `BlackBoxArchive.extensionTests`); adopted rules (for `adoptedExtensions`) | — |
| `report()`, `burns(attempts?)`, `empirical()` | Diagnostics (`report.ts`) | — |

`ModelService` (in-thread, synchronous) has the same methods for code that already runs in a worker; `buildModel(input)` is the pure function underneath.

## Context (`ModelContext`, from the briefing)

- `priors`: `body.<id>.mu` priors define the modelled bodies (the one with the largest μ is the primary). Optional `thruster.<id>.scale`, `thruster.<id>.misalignment`, `sensor.<id>.bias`, `sensor.<id>.scale`, `law.gravity.exponent`. Missing ones use the defaults in `settings.ts`.
- `bodies`: `briefing.knownBodies` (believed positions and velocities at t = 0 set the output frame and the priors on a second body's state). `asteroids`: `briefing.knownAsteroids` (radii for clearances).
- `ship`: the `ShipDefinition` (thrust, Isp, mount direction of each thruster; first `optical-tracker` names the camera bias).
- `arrival`, `arrivalMass?`, `fixedBodies?` (mock worlds only), `settings?` (overrides of any `[ASSUMED]` constant).

## What carries to a later encounter (A4, A5; spec §11.5)

- **Adopted rules**: pass the old `extensionTests` and `adoptedExtensions` to `load()`. The rule's fitted value goes in the new briefing's priors (`law.gravity.exponent` with its σ). Its validated spans apply around every body (A5 "every body", setting `validatedRangeSharedLaw = 1`); a rule about one body applies only there.
- **Ship calibration**: `carriedCalibration(state, transit, { carrying })` gives the thruster and sensor values of the arc that carried the ship onward as priors, with σ² grown by the rest of that attempt and the transit (`AttemptStart.transit`: ship time, Δv, camera power cycles, condition changes counted from the condition `carrying` ended with). 3D puts them in the next briefing.
- **Not carried**: body GMs and calibration profiles.

## Parameter and extension ids

Contract ids (`src/contracts/README.md`): `body.<id>.mu`, `law.gravity.exponent`, `thruster.<id>.scale`, `thruster.<id>.misalignment`, `sensor.<camera>.bias` (rad), `sensor.<accelerometer>.scale`. In `ModelState.parameters` a ship calibration appears once as its **arrival value** (no `arc`) and once per attempt as the **value used there** (`arc` = attempt id: arrival value plus that attempt's deviation, with `freshness`: σ as last measured, σ added by aging since, and the ship time, Δv, power cycles and condition lost since; spec §9.7). Other arc-local values (ship and second-body states, levels of `limited` burns, deviations themselves) stay internal.

Extensions: `distance-law` (adds the exponent; a law shared by every body) and `unmodeled-body:<bodyId>` (seen mode: a tracked body's gravity, §6.3). `empirical-acceleration` is a diagnostic only (§6.4); unseen bodies and `thrust-response-region` are specified by 1G but not built (not vector-tested).

## What happens inside

| File | Holds |
|---|---|
| `linalg.ts` | Dense LU, Cholesky, inverse, Householder least squares (≤ ~60×60) |
| `dynamics.ts` | Believed dynamics (P4 law, moving bodies, thrust segments, local scale, profiles with the two-part hedge, empirical terms, summed parameters), RK4 with segment boundaries as nodes, measurement prediction |
| `solve.ts` | Tier G: Levenberg–Marquardt with priors (§4.4), covariance, p_eff, residuals; arc growing; confounding (§9.3); held-out test (§7.2); evidence (§7.1); identifiability (§7.5) |
| `tierL.ts` | Windows (§5.1), local fits (§5.2), noise scale (§5.3), calibration profile (§5.4), present state (§8.1), forecast core with the envelope split by source (§8.2–8.3), earned hedge and validated range (§7.4) |
| `aging.ts` | Aging of ship calibrations (§3.7): classes, accrual by ship time, use and condition drops, transit histories |
| `probes.ts` | Tracked asteroids as test-particle arcs (§10): asteroid fixes plus the ship's path from its window fits |
| `diagnostics.ts` | Empirical acceleration (§6.4/§9.4), GM-against-distance slope (§9.2), per-burn response (§9.5) |
| `adapt.ts` | Black Box records → arcs: bearing+range pairing, normal points, accelerometer bins while thrusting, thrust segments from executed burns × nominal ratings with recorded attitude, arcs broken at contacts |
| `engine.ts` | `buildModel`: structure from briefing and adopted extensions, Tier G with per-arc deviations of ship calibrations, Tier L per body (ship then asteroid windows), present state, `ModelState`; `carriedCalibration` |
| `forecast.ts` | Plan → segments (attitude targets resolved at ignition from the believed state), envelope, horizon, believed inertial frame, body and asteroid tracks, closest approaches |
| `extensions.ts` | Test / adopt / revoke; validated spans; earned hedge in force per body |
| `report.ts` | Console diagnostics as JSON |
| `service.ts`, `worker.ts`, `rpc.ts`, `client.ts` | Live state, worker, RPC, main-thread client |
| `settings.ts` | Every `[ASSUMED]` constant (stored in `ModelState.settings`), aging rates included |

**Frames.** The estimator works relative to the primary (at rest at each arc epoch, §3.4). Forecast positions are in the briefing's believed inertial frame: the modelled bodies' barycentre moves uniformly from its believed arrival state. `prograde`/`retrograde` mean the direction of that believed inertial velocity, held from ignition for the burn.

**Present state.** From the last two coasting windows of the current attempt (≥ 12 range fixes on the primary); before that, the briefing's arrival estimate. The forecast propagates from there with the burns already executed after it plus the plan.

**Envelope and horizon (P10, A5).** Sources: present state (× s²), every profile node, the hedge outside sampled distances, engine scale and misalignment per thruster, masses of bodies without a profile. The hedge has two parts (§8.2): inside an adopted rule's validated spans the earned σ_e, elsewhere the default σ_h0 = 0.3. `ForecastInputs.hedge` is σ_h0; `earnedHedge` lists, per body, σ_e and the spans where it applied. Planned burns use the current attempt's engine values with σ aged from the last measurement to the time of issue (`ForecastInputs.engine`). The line stops at the first sample whose 1σ major axis exceeds 10% of the distance to the nearest body. `extrapolating` marks samples outside the covered distances of the body that pulls hardest there; `validated` marks those that are inside a validated span.

**Tracked asteroids (§10, A6).** An asteroid fixed with bearing and range (2B gives a range for declared known-size targets) becomes a probe: its fixes, combined with the ship's path from its own window fits, are fixes of each body as seen from the asteroid. Its windows join Tier L at its distances, so the calibration profile covers distances the ship never flew: the safe way to check the law at flyby distances. Forecasts carry each tracked asteroid's track and its closest approach to the ship. Asteroids seen with bearings only are not used.

**Missing data.** `report().coverage[i].missing` names what an attempt lacks ("no coasting fixes", "no accelerometer record during burns", "burns without an attitude record", …). No windows means no strength points; `strength[].points[].probe` marks points from an asteroid.

## Performance (demonstrated in Chrome via the dev server, model in a Web Worker)

Rebuild with two attempts (12 h and 16 h, 482 records each): 348 ms. In-flight refresh: 19 ms. 12 h forecast, 721 samples: 25 ms. A later encounter with a carried rule (24 h of tracking): load and refresh 151 ms, 10 h forecast 16 ms. Local fits are cached by window and reference law, so refreshes stay cheap as attempts accumulate.

## Tests

- `vectors.test.ts`: every fit of 1G's nine vectors (revision 2) rebuilt from their inputs, numeric fits within the vectors' tolerances, all **74 claims** re-evaluated from this implementation. The `truth` blocks are read only to judge claims.
- `service.test.ts`: the vectors as Black Box records through the game layer (GM, thrust and accelerometer calibration, confounding, forecast honesty and horizon, rebuild = live, extension lifecycle with validated spans, forecast immutability, fixtures, P11 lint on every real file).
- `probes.test.ts`: a tracked asteroid at 0.55–0.7 r₀ while the ship flies 1.0–1.3 r₀ in the inverse-2.5 world: its windows follow the true law, its forecast is honest, the clearance is right, and a dive to 0.6 r₀ is forecast without the hedge.
- `revision2.test.ts`: aging and per-attempt engine values through records (a damaged engine in the second attempt), aged engine terms in forecasts, transit aging, and a carried rule in a later encounter (earned hedge inside its span around a new body, default beyond; none with the same-body reading).
