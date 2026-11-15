# src/model — the predictive model

Owner: 2C; converted to three dimensions by 2G (DECISIONS A11). Belief side: never imports `src/sim/` or truth (P11, lint-enforced and tested in `service.test.ts`). Implements 1G's specification, revision 3 (`docs/model/estimator-spec.md`), and DECISIONS A4/A5/A6/A11/P5/P6/P8/P10.

The model fits **numbers** automatically (body masses, the engine's scale and its two misalignment angles, the RCS scale, the accelerometer scale, the camera's misalignment to the star trackers, a per-body table of gravity strength at the distances flown). It never adopts a **rule**: the player tests an extension against a held-out attempt and adopts it (A4). The forecast shows the consequences of the player's plan with an honest envelope (an ellipsoid per sample) and ends at a horizon; it does not plan (P6). Carried knowledge helps but never makes a later encounter easy (A5): a rule's tighter envelope applies only at the distances it was tested at, and ship calibrations loosen with time, use and damage until re-measured.

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
recorder.recordForecast(forecast); // forecast.detail === detail: it travels with the forecast

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
const report = await model.report(); // strength vs distance and direction, residuals by direction, confounding, camera, coverage
const burns = await model.burns(); // per-burn response (§9.5), three factors per burn
const emp = await model.empirical(); // empirical radial, tangential and orbit-normal acceleration (§9.4)
```

Every call returns plain JSON. `ModelState` (contract) is the summary the console shows; forecasts come back already passed through `issueForecast` (deep-frozen, never recomputed).

**The entry point (`index.ts`) exports values only from the light modules**: `createModelClient`, `contextFromBriefing` and `contextFor` (`context.ts`), and the settings; everything else is exported as types. Importing it therefore does not put the estimator in the page's bundle: the model runs in its worker, and the in-thread fallback (tests, no `Worker`) imports `service.ts` on its first call (S15 rank 5). Calls run one at a time in the order they are made (worker and fallback alike), even those made before `init` has resolved, and none runs after `terminate`.

**Redundant work (S20).** A `refresh` or `refit` still waiting, with only `append`s queued after it, is superseded by a later `refresh` or `refit`, which rebuilds from everything appended; the earlier caller gets the later result. A refit is superseded only by a refit. Nothing else is merged, dropped or reordered: appends always run, and nothing crosses a forecast, a load or a rule decision. `busy()` says what is running and since when, how many calls wait, and how many were superseded, so a screen can show honest progress during a long refit. Code that runs the model in-thread directly (tests, tools) imports the module it needs (`./service.ts`, `./engine.ts`, …).

## Client methods (`client.ts` → `service.ts`)

| Method | Does | Version |
|---|---|---|
| `init(context)` | Briefing priors, believed bodies and asteroids at arrival, nominal ship, settings | 0 |
| `load({ attempts, extensions?, decisions?, adopted?, version? })` | Full rebuild from records: Tier G over every arc, then Tier L. Each attempt's own briefing (`AttemptStart.briefing`) sets its arrival geometry (A10) | +1 |
| `beginAttempt(record)`, `append(id, delta)` | The attempt in progress, appended in record order | — |
| `refresh()` | Tier L (ship and asteroid windows, local fits, profiles, noise scale) and present state, Tier G values kept; arcs Tier G has not seen get a fit of their own with the globals frozen | same |
| `refit()` | Tier G now (spec §11.2: in flight at most every so often) | +1 |
| `endAttempt(finalRecord)` | Final record replaces the live copy; Tier G | +1 |
| `forecast({ id, issuedAt, plan, massProperties, duration?, step?, attemptId? })` | `{ forecast, detail }`; the detail is also inside the draft (`ForecastDraft.detail`): the envelope split by source (with the other bodies' share), the present state's source, time and body (`presentBody`), its age and whether it is stale, which tracked asteroids were forecast. Computed **as of `issuedAt`** (A18): records after it are not used, and the plan's own executed commands are never counted twice, so a forecast asked for at the moment of commitment is the same however much has been recorded by the time it is served | — |
| `testExtension(ext, training, heldOut)` | Fit on training attempts, held-out test, evidence, identifiability, earned hedge and the validated spans it covered. Never adopts | — |
| `adopt(ext, at?)` / `revoke(ext, at?)` | The player's decision, appended to the decision record (`at`: wall-clock ISO time). Only a rule whose latest test passed (`adoptable`) can be adopted; only an adopted one revoked. Test records are never edited | +1 |
| `state()`, `extensions()`, `decisions()`, `adopted()` | Current `ModelState`; every rule test (`BlackBoxArchive.extensionTests`); every adopt and revoke (`extensionDecisions`); the adopted rules they leave (`adoptedExtensions`). A rule's status in `ModelState.extensions` comes from its last decision, so a revoked rule stays revoked after a reload | — |
| `report()`, `burns(attempts?)`, `empirical()` | Diagnostics (`report.ts`) | — |
| `lattice(attemptId?, now?)` | The lattice rebuilt from an attempt's own records (A16): one `BelievedField` per recorded field, `visual` in 3C's `lattice-observations-v1` display schema, for `BelievedWorld.fields`. Default: the attempt in progress. `now`: only frames delivered by then. An earlier attempt comes back in its own frame (an archive view). `ModelService.latticeDetail` gives the full reconstruction | — |
| `busy()` | What the model is doing (above); synchronous, on the client only | — |

`ModelService` (in-thread, synchronous) has the same methods for code that already runs in a worker; `buildModel(input)` is the pure function underneath.

## The lattice (A16; 3C R9; S17 `docs/studies/s17/black-box.md`)

`lattice/` rebuilds the lattice from recorded `lattice.angular-fragments.v2` frames (3C's channel: anonymous gnomonic image fragments in a measured body-frame camera basis, `field-signal` measurements). Recorded inputs only: no layout, seed, strand or layer identity, true pose or mesh crosses (P11).

- `frames.ts`: 3C's own decoders (`decodeLatticeFrame`, `decodeLatticeDiagnostic` in `src/ship/sensors/`, recorded data only) into 3C's typed contracts (`src/contracts/lattice-acquisition.ts`): one definition of the wire format for sensor and model; anything malformed or unknown is rejected, never guessed. Frames in canonical acquisition order; a product counts only once delivered. Test records are written with 3C's `encodeLatticeFrame` (`lattice-harness.ts`).
- `poses.ts`: the camera's believed pose at each frame's **acquisition** (not product delivery): the star tracker's recorded attitude; the ship's believed path from the arc's solution (Tier G, or the arc's own fit), else the arrival estimate carried forward under the law in force with the executed thrust; position and velocity covariance (× s²), never smaller than the arrival survey's.
- `reconstruct.ts` (`LATTICE_RECONSTRUCTION_VERSION` 2; settings hashed into every result):
  1. per frame, each fragment endpoint is a sighting and each fragment an observed edge; endpoints that coincide in the image are noted as twins (adjacent fragments of a strand share theirs, but so may two points far apart in depth that line up);
  2. sightings are linked by **voting on depth** (R46). For each sighting, the sightings of the last 30 s within 0.05 rad of its ray and within 4σ of its epipolar line (with the believed path's drift), crossing it in front of both cameras and within range, are its partners, and each gives a depth. Only the true point gives the same depth from frame after frame; a neighbour on the same strand, lying along the same epipolar line, gives a different depth with each baseline. A sighting takes the depth the most other frames agree on (within 2σ, from pairs that fix depth to 15%), if at least two do and any conflicting depth has at most half that support; otherwise it stays unresolved, never settled from a truth mesh. Two sightings are linked when each supports the other's depth; tracks are the linked groups, twins in one frame are combined, and a group holding two different points of one frame gives that frame up. (Linking each frame to the last, as S17's case allows, failed on the Cathedral: 3C's sensor rasters 96 of several hundred candidates per frame, so a node returns only every several frames.)
  3. each track is triangulated on its earlier observations (a linear ray fit, then Gauss–Newton on its slope residuals), then all are fitted together with the pass's pose error, an offset and a drift held by the believed poses' covariance (bundle adjustment: drifting navigation is estimated from the scene); the later observations test each point (held-out share 10%, at least 3; χ²/n ≤ 1 + 3√(2/n)); tracks that fail are dropped from the pose estimate and the rest refitted;
  4. a point's covariance is the fit's own (slope noise, the frame-common rotation of the measured basis, the attitude) plus the pose error's share; the common offset the data cannot see stays at its prior and does not average away. With no drift prior this is exactly S17's fit;
  5. strands are chains of supported points along edges observed in at least two frames: observed connected support only. A strand point has a fragment on each side, so at a node with three or more edges an edge needs half the frames of the node's second-best; and an edge over 3× the field's median supported edge is not one fragment `[ASSUMED: one processor cuts fragments of comparable length]`: its ends lined up in some frames (two fences, R46);
  6. coverage is `unresolved` over the volume the recorded views pointed at, and absent elsewhere (unknown). Nothing is `clear-supported`: that needs an independently calibrated detection model, which does not exist yet.
- `visual.ts`: the `BelievedField` entries. `frameId` and `attemptId` name the run; `processing` comes from the latest processed frame (none: never live); `enabled` from the science processor's last commanded mode; `reconstruction` (outside 3C's schema, ignored by its reader) records the version, settings hash, model version and what was rejected and why.
- Never stored: rebuilt from the records (P8), cached in memory per snapshot and record size only. Changing the algorithm bumps the version.
- Rebuilt incrementally in flight (R61): the attempt in progress keeps a `LatticeMemo` of each frame's sightings, each pair of frames' partner links and each sighting's vote, keyed by the frames' identity and exact believed pose, so a rebuild costs about the new frames' share (1.5 s at 250 frames against 6 s from scratch). The result equals a rebuild from scratch [DEMONSTRATED: `lattice-flight.test.ts`]; a changed pose misses and is recomputed; archived attempts are rebuilt without it. Earlier runs are archive views in their own frame, never current obstacles (S17).

[DEMONSTRATED: `src/model/lattice.test.ts`] S17's reference reproduced: four junctions within 1e-6 m of S17's positions, both covariances to 1e-6, held-out RMS to 1e-6, 48 trained and 6 held out; six frames, no parallax, an occluded corner and no records give what S17's do. [DEMONSTRATED: `src/model/lattice-flight.test.ts`] A flight-like fence through the service (fragments made as 3C's sensor makes them, navigation on the arrival survey alone): every supported point within its own covariance (none beyond 5σ, at most 2% beyond 3.76), strands only between real neighbours, σ never below the survey's 0.5 m, rebuild from the archive equal to live, frames counted only once delivered, an earlier run in its own frame, and nothing drawn where association is ambiguous. [DEMONSTRATED: `src/model/lattice-cathedral.test.ts`] The Cathedral's twenty fences, three minutes at Thread on the real game, ship, recorder and model: the believed field is detected, with over 25 strands and 150 drawn points, and every drawn edge lies along one true strand within 3σ (a strand turns only at a sheet's corner). On three recordings judged offline against truth, 234–300 features were supported. On runs 1 and 2 every one lay within 3σ of a true point (Mahalanobis, worst 1.9σ). On run 0 they lay 1–3.5σ off, all shifted the same way: its arrival survey's velocity is a 2.7σ draw on one axis, and every point shares that pose error, as its covariance says. A rebuild of three minutes of frames takes 5–6.5 s in the worker.

## Context (`ModelContext`, from the briefing)

- `priors`: `body.<id>.mu` priors define the modelled bodies (the one with the largest μ is the primary). Optional ship priors (below), `law.gravity.exponent`. Missing ones use the defaults in `settings.ts`.
- `bodies`: `briefing.knownBodies` (believed positions and velocities at t = 0 set the output frame and the priors on a second body's six state numbers). `asteroids`: `briefing.knownAsteroids` (radii for clearances). `arrival`: the arrival estimate (3D position and velocity with their covariances).
- **Each run starts from different geometry (A10).** When an attempt records the briefing it was given (`AttemptStart.briefing`), its bodies, asteroids and arrival estimate replace the context's for that attempt (`contextFor(ctx, record)`). Priors, masses and the ship come from the context.
- `ship`: the `ShipDefinition`: thrust, Isp and mount direction of each thruster; the first `main-engine` is what a hands-on throttle drives; the first `optical-tracker` names the camera. RCS translation comes from `systems.propulsion.rcs.translationForcePerBank` (the 1C baseline) or else from the `rcs-thruster` mounts.
- `arrival`, `arrivalMass?`, `fixedBodies?` (mock worlds only), `settings?` (overrides of any `[ASSUMED]` constant).
- `settings.planar = 1` runs the **planar reduction** (spec §1 and Appendix A.3) for records that hold nothing out of the x–y plane: z and vz of the ship and of every body, the pitch misalignment, the camera components about body x and y and the orbit-normal empirical term are the fixed number 0, the elevation and accelerometer-z rows are left out, and the present state holds the camera fixed. The model then gives revision 2's numbers exactly; the planar vectors and the planar game-layer tests run this way. The game runs the default, 0: everything three-dimensional.

## What carries to a later encounter (A4, A5; spec §11.5)

- **Adopted rules**: pass the old `extensionTests` and `extensionDecisions` to `load()`. The rule's fitted value goes in the new briefing's priors (`law.gravity.exponent` with its σ). Its validated spans (distances only: no direction is stored, A11) apply around every body (A5 "every body", setting `validatedRangeSharedLaw = 1`); a rule about one body applies only there.
- **Ship calibration**: `carriedCalibration(state, transit, { carrying })` gives the thruster and sensor values of the arc that carried the ship onward as priors (both misalignment angles, the RCS scale and the three camera components included), with σ² grown by the rest of that attempt and the transit. 3D puts them in the next briefing.
- **Not carried**: body GMs and calibration profiles.

## Parameter and extension ids

Contract ids (`src/contracts/README.md`) against the spec's names: `body.<id>.mu` (`mu.{body}`), `law.gravity.exponent` (`law.n`), `thruster.<id>.scale` (`engine.kE`), `thruster.<id>.misalignment` (`engine.dE`, about body +z), `thruster.<id>.misalignment-pitch` (`engine.dP`, about body −y), `thruster.rcs.scale` (`rcs.kR`), `sensor.<camera>.bias-x`, `.bias-y`, `.bias` (`camera.bias.x, .y, .z`: the planar bias is the z component), `sensor.<accelerometer>.scale` (`accel.kA`). In `ModelState.parameters` a ship calibration appears once as its **arrival value** (no `arc`) and once per attempt as the **value used there** (`arc` = attempt id: arrival value plus that attempt's deviation, with `freshness`; spec §9.7). Other arc-local values (six-number ship and second-body states, levels of `limited` burns, deviations themselves) stay internal.

Extensions: `distance-law` (adds the exponent; a law shared by every body) and `unmodeled-body:<bodyId>` (seen mode: a tracked body's gravity, §6.3). `empirical-acceleration` is a diagnostic only (§6.4); unseen bodies and `thrust-response-region` are specified by 1G but not built.

## What happens inside

| File | Holds |
|---|---|
| `linalg.ts` | Dense LU, Cholesky, inverse, Householder least squares, symmetric eigen-decomposition (Jacobi) |
| `dynamics.ts` | Believed dynamics in 3D (P4 law, moving bodies with six state numbers, thrust along the recorded attitude with both misalignment angles and a mount, RCS translation, local scale, profiles with the two-part hedge, empirical R, T, N, summed parameters), RK4 with segment boundaries as nodes, and the measurement residuals: the bearing in the tangent plane at the measured direction (§2.1), the camera misalignment as an exact rotation carried by the attitude at each fix, three-axis accelerometer; unused rows (`sigma: null`) leave no row |
| `solve.ts` | Tier G: Levenberg–Marquardt with priors (§4.4), central differences of the whitened residuals, covariance, p_eff, residuals by direction (along, normal, range, accel; §9.1); arc growing (on a long arc the first stage starts within `arcGrowthFirstSpan`, 3 h, and doubles up to the spec's 25%: a 39 h attempt's 10 h first stage lost the fit, R47); confounding and the multiple correlation of the engine scale with both angles (§9.3); held-out test (§7.2); evidence (§7.1); identifiability (§7.5) |
| `verdict.ts` | Why a held-out test came out as it did, in plain words (R47), from its own numbers: consistent; the training never settled; the held-out fit never settled; the values pulled many σ (named); the misfit is in a burn (with its times); in one stretch (with its times, and whether the rest agrees); or all along. Changes no statistic: `ExtensionRecord.heldOutTest.diagnosis` |
| `tierL.ts` | Windows with a vector sweep, their orbit normal and direction (§5.1), six-state local fits (§5.2), noise scale (§5.3), calibration profile indexed by distance alone (§5.4), present state with the camera misalignment (§8.1), forecast core with a 3×3 covariance per sample split by source and the sensitivities shared sources need (§8.2–8.3, §8.7), earned hedge and validated range (§7.4) |
| `aging.ts` | Aging of ship calibrations (§3.7): classes (the pitch angle ages like the yaw one, each camera component like the planar bias, the RCS scale on its own rates), accrual by ship time, use and condition drops, transit histories. Condition drops come from `condition-changed` events by the ship's own equipment ids (R27): a thruster's and the camera's by their ids, the accelerometer scale by the accelerometer's, the RCS scale by the ship's `rcs-thruster` equipment (the four pods, not the RCS tanks; `groupMembers`), each pod followed on its own, also across a transit (`conditionsAtEnd`). Only the event's `condition`, the reported condition by contract, is read: faults, trips, recoveries and doses age nothing |
| `probes.ts` | Tracked asteroids as test-particle arcs (§10): asteroid fixes (azimuth, elevation, range) plus the ship's path from its window fits, with 3×3 position covariances |
| `diagnostics.ts` | Empirical radial, tangential and orbit-normal acceleration (§6.4/§9.4), GM-against-distance slope and departure from the profile (§9.2), per-burn response with three factors (§9.5) |
| `adapt.ts` | Black Box records → arcs: azimuth+elevation+range pairing with the attitude at each fix, normal points on the sphere, three-axis accelerometer bins while anything fires, thrust segments from executed burns and hands-on `fly` (throttle and RCS translation) × nominal ratings with the full recorded attitude, arcs broken at contacts |
| `engine.ts` | `buildModel`: structure from briefing and adopted extensions, Tier G with per-arc deviations of ship calibrations, Tier L per body (ship then asteroid windows), present state, `ModelState`; `carriedCalibration` |
| `forecast.ts` | Plan → segments with attitudes resolved in time order, roll held (`quat.pointAlong`), envelope, horizon, believed inertial frame, body and asteroid tracks, closest approaches |
| `extensions.ts` | Test / adopt / revoke; validated spans; earned hedge in force per body |
| `report.ts` | Console diagnostics as JSON |
| `service.ts`, `worker.ts`, `rpc.ts`, `client.ts` | Live state, worker, RPC, main-thread client |
| `settings.ts` | Every `[ASSUMED]` constant (stored in `ModelState.settings`), aging rates and `planar` included |

**Thrust.** Body +x turned by `dP` about body −y and by `dE` about body +z, then by the recorded attitude (§3.3). A burn is cut into segments at most `maxSegment` long and at attitude records that differ from the last cut by more than `attitudeSplit`; each piece takes the recorded attitude at its middle (interpolated between star-tracker records). An executed `fly` with throttle above zero is a burn of the ship's first `main-engine` at that throttle; its translation demand is an RCS segment of the group `rcs` (demand × nominal force on that body axis ÷ believed mass, scaled by `thruster.rcs.scale`); both run until the next executed `fly`, a `cutoff` (`'all'` for the RCS), or the last recorded time. Any firing, main or RCS, is "powered" for Tier L windows and the residual split.

**Frames.** The estimator works relative to the primary (at rest at each arc epoch, §3.4); a forecast works relative to the body its present state was fixed against (`detail.presentBody`, below). Forecast positions are in the briefing's believed inertial frame: the modelled bodies' barycentre moves uniformly from its believed arrival state. **Every covariance in a forecast is relative to `presentBody`**: the ship's samples and the other bodies' tracks; that body's own track carries none. Closest approaches use the covariance of the ship relative to each body.

**Other bodies in the reference law.** Tier L and the forecast hold another modelled body at its believed state: from the arc's solution when a converged Tier G made it, or when the arc tracked that body; otherwise from the briefing propagated under the **law in force** (`lawInForce`: the exponent and masses the model holds now, the exponent once its rule is adopted; the priors before any fit; 2F request 2). A fit of one arc with the globals at their priors places a body it never saw only by what the ship's motion asks of it under a law that may be wrong (in the Gravity range, Beta ended 2,900 km from where it was), and windows fitted around such a body are spoiled.

**What a fit is not believed about.** A converged global fit is not believed for a body that no arc ever fixed when it moves that body's mass, or its state in an arc, beyond `settings.bodyPriorPullLimit` (3) σ of its prior. With nothing measuring the body, the fit is using it to absorb what its law cannot explain. A Newtonian fit of an inverse-2.5 dive put Beta's μ at 1.4e10 (prior 2.2e9 ± 8e8) and moved Beta 870 km in 3.6 h; every forecast from it was confidently wrong. The mass is then held at its prior with the prior's σ wherever the values are in force, and the body's path comes from the briefing. This errs wide: a prior that is itself badly wrong loses what the data say about it.

**The other bodies' own motion (2F request 13).** The model moves the bodies about each other under its law, which is unsampled at their separation (4 r₀ in the Gravity range) unless the ship has flown there. `bodiesAt` gives each other body's state relative to the reference body with what the model knows of it: the fit's covariance (central differences over the parameters that move the bodies, × s²) or the briefing's carried to that time, and how the hedge has moved it since the pair was last fixed. The hedge acts on the bodies' mutual pulls as it does on the ship (`Structure.bodyProfiles`: the hedge factor only, outside each pulling body's covered range; the mean stays the bare law, as fitted). A pair counts as fixed at the earlier of its two bodies' last range fixes, and the body pulling hardest on the ship counts as fixed at the last fix on any body (the ship's own orbit pins it). In a forecast those states are six uncertain sources per body, coupled to the same hedge exponents as the ship (one exponent for the whole forecast); in the present-state fit they are prior-held parameters. So Beta's track carries its uncertainty, the horizon and the clearances use the covariance relative to each body, and the present state near Alpha is not biased by a Beta the model has misplaced.

**Present state.** From the last two coasting windows of the current attempt on **whichever body the camera fixed most recently** (≥ 12 range fixes on it; ties to the primary; 2F request 12): six numbers relative to that body, a local scale and slope, the camera misalignment's three components held by a prior at the values the attempt uses with their σ (11 parameters; §8.1), and each other modelled body's state held by a prior at what the model knows of it at the first fix (above). The hedge exponents of every body's pull and the masses of the bodies without a profile are **consider parameters** of that fit: it is solved with them at their means, as the forecast's mean is, and `Anchor.hedge` gives the present state's error per unit of each (from the fit's own Jacobian, S = P Jxᵀ Jη, and the propagation to the last fix). The forecast moves the starting state with each such source (`xNowEta`), so one exponent acts consistently on the present state and on everything after it. The camera's share is in the 6×6 covariance, so the out-of-plane envelope is never thinner than the picture's unknown orientation (about 10⁻⁴ rad × distance). Before enough fixes, the briefing's arrival estimate. The forecast propagates from there with the burns already executed after it (except those of the plan being forecast) plus the plan. `detail.presentAge` is the issue time minus the present state's time, and `detail.stale` is true when that exceeds `settings.presentStaleAfter` (3,600 s): nothing was tracked lately, and the forecast says so.

**Planned attitudes (§3.3).** The plan is resolved in time order with one running attitude, starting at the latest recorded one: an `inertial` target replaces it, `direction`, `prograde`/`retrograde` (the forecast's own mean velocity) and `toward`/`away` turn it by the smallest rotation (`quat.pointAlong`, which the game layer also uses), a `rate` turns it at that body rate, a hands-on yaw or pitch at the design's `handsOnTurnRate`. A burn uses its own target if it has one, otherwise the running attitude, and holds it while it fires. `ForecastInputs.plannedAttitudes` records each planned burn's attitude.

**Envelope and horizon (P10, A5).** Sources: present state (× s²), every profile node, the hedge outside sampled distances, the engine's scale and both angles per thruster, the RCS scale, masses of bodies without a profile, the other bodies' states (`detail.sigmaMajor[k].bodies`); each a 3×3 term per sample. The hedge has two parts (§8.2): inside an adopted rule's validated spans the earned σ_e, elsewhere the default σ_h0 = 0.3. Planned burns use the current attempt's engine values with σ aged to the time of issue (`ForecastInputs.engine`); the camera misalignment the present state used is in `ForecastInputs.camera`. The line stops at the first sample whose longest 1σ semi-axis, relative to the nearest body, exceeds 10% of the distance to it (§8.4). `extrapolating` marks samples outside the covered distances of the body that pulls hardest there; `validated` those inside a validated span.

**Tracked asteroids (§10, §8.7, A6).** An asteroid fixed with bearing and range (2B gives a range for declared known-size targets) becomes a probe: its fixes, combined with the ship's path from its own window fits, are fixes of each body as seen from the asteroid. Its windows join Tier L at its distances. Forecasts carry each tracked asteroid's track (its own present state, six numbers, propagated under the same law, with a 3×3 envelope) and its closest approach: the smallest distance along the samples inside both horizons, refined by a parabola, clearance = distance − the asteroid's radius − the hull's reach (`hullReach`, 3D), σ along the line between the centres from the covariance of the relative position, in which the sources both paths share (profile nodes, hedge, masses) enter once, as the difference of their sensitivities. A rule test fits the tracked asteroids of its training and held-out attempts with them. Asteroids seen with bearings only are not used; briefed bodies are never treated as asteroids. An asteroid's present state, like the ship's, is fitted on the body its probe arc fixed last (a rock of Beta's belt, tracked while the camera alternates with Beta, is forecast relative to Beta). Windows the 20% rule (spec §13.7) leaves out of the calibration profile are still fitted for the ship's path in attempts that tracked rocks: between the bodies, where Alpha pulls half as hard as Beta, every window is left out, and without them no rock there could be referred to the ship. Its own forecast holds the other bodies at their believed states, so their uncertainty is not in the rock's own envelope (a stated limit). A closest approach at the last sample inside the horizon is reported there: the closest the forecast shows.

**Missing data.** `report().coverage[i].missing` names what an attempt lacks ("no coasting fixes", "no accelerometer record during burns", "burns without an attitude record", …). `report().engineAngles` says, per thruster, how the engine scale and the two angles share their uncertainty (R(kE | dE, dP), ρ(dE, dP), both posterior/prior ratios) and what would help; `report().camera` gives the camera misalignment's principal σ against its prior and the direction the data have never constrained (the turn axis, §9.7).

**Attempts the model cannot use.** One bad attempt never stops the model; a call succeeds and the report says what was left out.

- *Too short.* An arc needs three range fixes on the primary at different times (`MIN_ARC_FIXES`; normal points count once): nine numbers for the six of the state. With fewer it is not fitted: `coverage[i].used` is false and `missing` says so. No arc-growing stage cuts an arc below those three fixes.
- *Cut off.* Thrust never runs past the end of its record: a held burn, an open hands-on throttle or RCS translation stops at the last thing recorded, in flight and after a reload alike, so the live arcs equal the rebuilt ones. A forecast carries an executed burn on as commanded, to the forecast's end at most.
- *Unusable.* If the model cannot be built with an attempt (a fit that cannot be solved, such as bearings recorded without an elevation, which leave z undetermined; or a number that would not be finite), `buildModel` builds every attempt on its own, leaves out those that fail (`ModelDerived.unusable`; `coverage[i].missing` gives "not used by the model: …") and fits the rest. A present-state fit that fails leaves the arrival estimate, so a forecast is always available.
- *Global fit.* If Tier G itself cannot be solved, the numbers stay at their priors, every attempt is fitted on its own, Tier L goes on, and `report().fitFailure` gives the reason.

The verdicts are a function of the records, so a rebuild still equals the live model. A solver error names what the data leave undetermined ("fit: the data do not determine attempt-0001.ship.vx, attempt-0001.ship.vy, attempt-0001.ship.vz").

## Performance

Node, in-thread, best of several runs; the planar vectors as records (`forecast-envelope`: rebuild of two attempts, 12 h and 16 h; an in-flight refresh of the third; a 12 h forecast with 721 samples; `extension-validation`: a distance-law test, two attempts trained, one held out). Figures move by about 20% from run to run.

| Operation | dt 60 s: planar model (before) | dt 60 s: 3D | dt 60 s: planar reduction | dt 30 s: planar model (before) | dt 30 s: 3D | dt 30 s: planar reduction |
|---|---|---|---|---|---|---|
| Rebuild, two attempts (Tier G + Tier L) | 252 ms | 308 ms | 328 ms | 502 ms | 840 ms | 605 ms |
| Refresh, cold / warm | 22 / 7.8 ms | 33 / 12.7 ms | 32 / 11.4 ms | 32 / 13.8 ms | 72 / 25 ms | 63 / 20 ms |
| Forecast, 12 h, 721 samples | 12.5 ms | 18 ms | 25 ms | 15 ms | 30 ms | 31 ms |
| Rule test | 544 ms | 624 ms | 652 ms | 973 ms | 1,695 ms | 1,337 ms |

The game runs the 3D column at the model's own step (`settings.dt`, 30 s by default). Against the spec's budget (§4.7): the forecast stays inside 4–50 ms (a live preview at a few Hz), a refresh is tens of milliseconds, and a rebuild or a rule test is a worker job of about a second.

**Two moving bodies (update 4, 2C).** The bodies' own uncertainty, the consider parameters and the body priors cost time. Measured in-thread on the owner's machine, best of 4 alternating runs, the model at the merge of revision 3 (`e44da6c`) against this one, on a 12 h attempt tracking Alpha in the binary (360 fixes, inverse-2.5 truth, Newtonian model):

| Operation | dt 60 s: before → after | dt 30 s: before → after |
|---|---|---|
| Refit (Tier G with the attempt in progress) | 2.7 → 3.0 s | 4.4 → 4.1 s |
| Refresh | 64 → 165 ms | 111 → 233 ms |
| Forecast, 12 h, 721 samples | 70 → 103 ms | 89 → 144 ms |

This scenario is heavier than the table above (two bodies, a 12 h arc): it was already over the forecast budget before this change. Where the new time goes: `bodiesAt` differentiates the bodies' states through the arc from its epoch (twice: at the present state's first fix and at its last), the present-state fit has up to six more parameters and one more Jacobian (the consider sources), and the forecast has six more sources per body. All of it runs in the worker; the page is not held.

## Tests

- `vectors.test.ts`: every fit of 1G's nine planar vectors (revision 2) rebuilt by the 3D code in the planar reduction, numeric fits within the vectors' tolerances, all **74 claims** re-evaluated; out-of-plane state, covariance and forecast terms exactly zero. Worst agreement over the 19 numeric fits: 2.7×10⁻⁵ σ in an estimate.
- `vectors3d.test.ts`: every fit, Tier L, present state and forecast point of 1G's eight 3D vectors (revision 3), all **104 claims** re-evaluated, the rotation-invariance equalities with this implementation's own numbers. Worst agreement over the 22 numeric fits: 1.0×10⁻⁴ σ in an estimate.
- `service.test.ts`: the planar vectors as Black Box records through the game layer in the planar reduction (GM, thrust and accelerometer calibration, confounding, forecast honesty and horizon, rebuild = live, extension lifecycle with validated spans, forecast immutability, fixtures in 3D, P11 lint on every real file).
- `service3d.test.ts`: the 3D vectors as Black Box records (azimuth and elevation, rotation-vector attitudes, three-axis accelerometer, burns and hands-on `fly` with RCS translation): GM on an inclined orbit, both misalignment angles of a plane change, the RCS scale; a 3D forecast with the camera in the present state, a flat coasting ellipsoid and a plane change resolved with roll held; a tracked rock on an inclined orbit with its track, envelope and closest approach.
- `probes.test.ts`, `runs.test.ts`, `revision2.test.ts` (planar scenarios, in the planar reduction): tracked asteroids as probes of the law, geometry per run (A10) and decisions across reloads, aging and per-attempt engine values, a carried rule in a later encounter.
- `binary.test.ts` (3D, the Gravity range's binary and survey σ): the present state from Beta after six hours on it, and a plain stale report when nothing was tracked; Beta's track and the ship honest with the wrong law and Beta never looked at; the closest approach to Beta; briefing propagation under the law in force; a forecast asked for at commitment, the same after an hour more of records and the plan's own burn, and honest after a refresh.
- `s8.test.ts`: S8's states carried by this integrator within S8's tolerances; the model on S8's wrong-law dive (the forecast frozen at commitment, and fresh forecasts down to contact: honest, none claims a safe pass, contact shown ahead) and on its informed ring crossing (rock 140's closest approach and σ).
- `client.test.ts`: the lazy in-thread client's order and termination; superseded refreshes and refits (every record still arrives, nothing crosses a forecast, a refresh never replaces a refit).
- `lattice.test.ts`, `lattice-flight.test.ts` (`lattice-harness.ts` writes test records with 3C's encoder): above.
- `condition.test.ts`: 3A's real `stepCondition` events on the baseline ship (R27): the RCS group is the four pods, a pod's drop ages the RCS scale and a tank's does not, each calibration ages with its own equipment's reported drops, a transit counts each pod from its own end condition.
- `short-attempts.test.ts`: the control-room failure and every short or cut-off attempt (planar reduction), and the same rule with six state numbers: one fix cannot give a velocity (z included), bearings without an elevation leave z undetermined and the attempt is left out with the reason, a record ending inside an out-of-plane burn. Nothing throws, nothing is NaN, rebuild = live throughout.
