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
  decisions: archive.extensionDecisions, // every adopt and revoke (older saves: `adopted`)
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
if (test.adoptable && playerAgrees) await model.adopt('distance-law'); // version + 1, recorded
await model.revoke('distance-law'); // recorded too
for (const d of (await model.decisions()).slice(archive.extensionDecisions?.length ?? 0))
  archive = withExtensionDecision(archive, d); // keeps adoptedExtensions as the current result

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
| `load({ attempts, extensions?, decisions?, adopted?, version? })` | Full rebuild from records: Tier G over every arc, then Tier L. Each attempt's own briefing (`AttemptStart.briefing`) sets its arrival geometry (A10) | +1 |
| `beginAttempt(record)`, `append(id, delta)` | The attempt in progress, appended in record order | — |
| `refresh()` | Tier L (ship and asteroid windows, local fits, profiles, noise scale) and present state, Tier G values kept; arcs Tier G has not seen get a fit of their own with the globals frozen | same |
| `refit()` | Tier G now (spec §11.2: in flight at most every so often) | +1 |
| `endAttempt(finalRecord)` | Final record replaces the live copy; Tier G | +1 |
| `forecast({ id, issuedAt, plan, massProperties, duration?, step?, attemptId? })` | `{ forecast, detail }`; `detail.sigmaMajor` splits the envelope by source, `detail.asteroids` says which tracked asteroids were forecast | — |
| `testExtension(ext, training, heldOut)` | Fit on training attempts, held-out test, evidence, identifiability, earned hedge and the validated spans it covered. Never adopts | — |
| `adopt(ext, at?)` / `revoke(ext, at?)` | The player's decision, appended to the decision record (`at`: wall-clock ISO time). Only a rule whose latest test passed (`adoptable`) can be adopted; only an adopted one revoked. Test records are never edited | +1 |
| `state()`, `extensions()`, `decisions()`, `adopted()` | Current `ModelState`; every rule test (`BlackBoxArchive.extensionTests`); every adopt and revoke (`extensionDecisions`); the adopted rules they leave (`adoptedExtensions`). A rule's status in `ModelState.extensions` comes from its last decision, so a revoked rule stays revoked after a reload | — |
| `report()`, `burns(attempts?)`, `empirical()` | Diagnostics (`report.ts`) | — |

`ModelService` (in-thread, synchronous) has the same methods for code that already runs in a worker; `buildModel(input)` is the pure function underneath.

## Context (`ModelContext`, from the briefing)

- `priors`: `body.<id>.mu` priors define the modelled bodies (the one with the largest μ is the primary). Optional `thruster.<id>.scale`, `thruster.<id>.misalignment`, `sensor.<id>.bias`, `sensor.<id>.scale`, `law.gravity.exponent`. Missing ones use the defaults in `settings.ts`.
- `bodies`: `briefing.knownBodies` (believed positions and velocities at t = 0 set the output frame and the priors on a second body's state). `asteroids`: `briefing.knownAsteroids` (radii for clearances). `arrival`: the arrival estimate.
- **Each run starts from different geometry (A10).** When an attempt records the briefing it was given (`AttemptStart.briefing`), its bodies, asteroids and arrival estimate replace the context's for that attempt: the priors on its second body's state, the arrival present state, and the frame and clearances of its forecasts (`contextFor(ctx, record)`). Priors, masses and the ship come from the context. The estimator works relative to the primary, so attempts from different runs fit together.
- `ship`: the `ShipDefinition` (thrust, Isp, mount direction of each thruster; first `optical-tracker` names the camera bias).
- `arrival`, `arrivalMass?`, `fixedBodies?` (mock worlds only), `settings?` (overrides of any `[ASSUMED]` constant).

## What carries to a later encounter (A4, A5; spec §11.5)

- **Adopted rules**: pass the old `extensionTests` and `extensionDecisions` to `load()`. The rule's fitted value goes in the new briefing's priors (`law.gravity.exponent` with its σ). Its validated spans apply around every body (A5 "every body", setting `validatedRangeSharedLaw = 1`); a rule about one body applies only there.
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
| `adapt.ts` | Black Box records → arcs: bearing+range pairing, normal points, accelerometer bins while thrusting, thrust segments from executed burns and hands-on throttle (`fly`) × nominal ratings with recorded attitude, arcs broken at contacts |
| `engine.ts` | `buildModel`: structure from briefing and adopted extensions, Tier G with per-arc deviations of ship calibrations, Tier L per body (ship then asteroid windows), present state, `ModelState`; `carriedCalibration` |
| `forecast.ts` | Plan → segments (attitude targets resolved at ignition from the believed state), envelope, horizon, believed inertial frame, body and asteroid tracks, closest approaches |
| `extensions.ts` | Test / adopt / revoke; validated spans; earned hedge in force per body |
| `report.ts` | Console diagnostics as JSON |
| `service.ts`, `worker.ts`, `rpc.ts`, `client.ts` | Live state, worker, RPC, main-thread client |
| `settings.ts` | Every `[ASSUMED]` constant (stored in `ModelState.settings`), aging rates included |

**3D contracts, planar estimator (A11, first step).** The contracts are three-dimensional; the estimator is still planar and converts only where contract data enters or leaves. In: bearings as their azimuth, attitude as the yaw of a rotation about +z, accelerometer and relative-position records as x and y, covariances as their x–y block, mount directions and attitude targets as angles in the plane. Out: forecast samples, tracks and the present estimate with z = 0, no out-of-plane covariance and a yaw-only attitude. Every such place is marked `// LIFT(2G):`.

**Hands-on thrust.** An executed `fly` with throttle above zero is a burn of the ship's first `main-engine` at that throttle, from its time to the next executed `fly`, a `cutoff` of that engine or of `'all'`, or the last recorded time; direction from the recorded attitude. RCS translation from `fly` is not modelled yet.

**Frames.** The estimator works relative to the primary (at rest at each arc epoch, §3.4). Forecast positions are in the briefing's believed inertial frame: the modelled bodies' barycentre moves uniformly from its believed arrival state. `prograde`/`retrograde` mean the direction of that believed inertial velocity, held from ignition for the burn.

**Present state.** From the last two coasting windows of the current attempt (≥ 12 range fixes on the primary); before that, the briefing's arrival estimate. The forecast propagates from there with the burns already executed after it plus the plan.

**Envelope and horizon (P10, A5).** Sources: present state (× s²), every profile node, the hedge outside sampled distances, engine scale and misalignment per thruster, masses of bodies without a profile. The hedge has two parts (§8.2): inside an adopted rule's validated spans the earned σ_e, elsewhere the default σ_h0 = 0.3. `ForecastInputs.hedge` is σ_h0; `earnedHedge` lists, per body, σ_e and the spans where it applied. Planned burns use the current attempt's engine values with σ aged from the last measurement to the time of issue (`ForecastInputs.engine`). The line stops at the first sample whose 1σ major axis exceeds 10% of the distance to the nearest body. `extrapolating` marks samples outside the covered distances of the body that pulls hardest there; `validated` marks those that are inside a validated span.

**Tracked asteroids (§10, A6).** An asteroid fixed with bearing and range (2B gives a range for declared known-size targets) becomes a probe: its fixes, combined with the ship's path from its own window fits, are fixes of each body as seen from the asteroid. Its windows join Tier L at its distances, so the calibration profile covers distances the ship never flew: the safe way to check the law at flyby distances. Forecasts carry each tracked asteroid's track and its closest approach to the ship. A rule test fits the tracked asteroids of its training and held-out attempts with them, so a passing test's validated span also covers the asteroids' distances, around the body they were measured from (A5); σ_e still comes from the ship's held-out windows. Asteroids seen with bearings only are not used; briefed bodies are never treated as asteroids, modelled or not.

**Missing data.** `report().coverage[i].missing` names what an attempt lacks ("no coasting fixes", "no accelerometer record during burns", "burns without an attitude record", …). No windows means no strength points; `strength[].points[].probe` marks points from an asteroid.

**Attempts the model cannot use.** One bad attempt never stops the model; a call succeeds and the report says what was left out.

- *Too short.* An arc needs three range fixes on the primary at different times (`MIN_ARC_FIXES`; normal points count once). With fewer it is not fitted: `coverage[i].used` is false and `missing` says so. No arc-growing stage cuts an arc below those three fixes (a quarter of a three-fix arc is one fix, which gives no velocity: the cause of the "singular matrix" report).
- *Cut off.* Thrust never runs past the end of its record: a held burn or an open hands-on throttle stops at the last thing recorded, in flight and after a reload alike, so the live arcs equal the rebuilt ones. A forecast carries an executed burn on as commanded, to the forecast's end at most.
- *Unusable.* If the model cannot be built with an attempt (a fit that cannot be solved, or a number that would not be finite), `buildModel` builds every attempt on its own, leaves out those that fail (`ModelDerived.unusable`; `coverage[i].missing` gives "not used by the model: …") and fits the rest. A present-state fit that fails leaves the arrival estimate, so a forecast is always available.
- *Global fit.* If Tier G itself cannot be solved, the numbers stay at their priors, every attempt is fitted on its own, Tier L goes on, and `report().fitFailure` gives the reason.

The verdicts are a function of the records, so a rebuild still equals the live model. A solver error names what the data leave undetermined ("fit: the data do not determine attempt-0001.ship.vx, …").

## Performance (demonstrated in Chrome via the dev server, model in a Web Worker)

Rebuild with two attempts (12 h and 16 h, 482 records each): 348 ms. In-flight refresh: 19 ms. 12 h forecast, 721 samples: 25 ms. A later encounter with a carried rule (24 h of tracking): load and refresh 151 ms, 10 h forecast 16 ms. Local fits are cached by window and reference law, so refreshes stay cheap as attempts accumulate.

## Tests

- `vectors.test.ts`: every fit of 1G's nine vectors (revision 2) rebuilt from their inputs, numeric fits within the vectors' tolerances, all **74 claims** re-evaluated from this implementation. The `truth` blocks are read only to judge claims.
- `service.test.ts`: the vectors as Black Box records through the game layer (GM, thrust and accelerometer calibration, confounding, forecast honesty and horizon, rebuild = live, extension lifecycle with validated spans, forecast immutability, fixtures, P11 lint on every real file).
- `probes.test.ts`: a tracked asteroid at 0.55–0.7 r₀ while the ship flies 1.0–1.3 r₀ in the inverse-2.5 world: its windows follow the true law, its forecast is honest, the clearance is right, and a dive to 0.6 r₀ is forecast without the hedge.
- `runs.test.ts`: attempts from different runs at different binary phases fit together only with their own briefings (A10), and a forecast follows its attempt's geometry; adopt and revoke survive a reload as decisions; asteroids tracked in a rule test widen its validated span (0.6–1.4 r₀ to 0.45–1.79 r₀).
- `short-attempts.test.ts`: the control-room failure (a reload during a held burn, a 40 s attempt, a dive lost at the primary) fed live and rebuilt; attempts with zero to nine fixes; records that end inside a burn or a hands-on throttle, burns with no end, a burn from before the first fix; 150 random short attempts; a record with a fix that is not a number among good ones; a global fit that fails (injected). Nothing throws, nothing is NaN, the reasons are in the report, and rebuild = live throughout.
- `revision2.test.ts`: aging and per-attempt engine values through records (a damaged engine in the second attempt), aged engine terms in forecasts, transit aging, and a carried rule in a later encounter (earned hedge inside its span around a new body, default beyond; none with the same-body reading).
