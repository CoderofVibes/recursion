# S5 — Evidence, belief and the field interface

[ASSUMED] This is a build proposal for 3B/3C, 2G, the model owner and 2D. It changes no shared contract or decision. The force and exposure definitions are in [wells.md](wells.md) and [lattice.md](lattice.md); those definitions, including their limits, govern this interface.

## 1. What the model is allowed to learn

[ESTABLISHED: `docs/DECISIONS.md` A4–A5, P5–P7, P11] Numbers may be fitted automatically; a new force rule requires the player's action and a held-out test. The model forecasts the player's commands and never chooses a route or command sequence. Its only inputs are recorded measurements, commands, priors and nominal ship design. The 3D contracts already express `Vec3`, body-to-inertial quaternions, 3D covariance and a union of hull prisms. The study branch's simulation and sensors still contain `LIFT(2G)` markers; 3D types do not establish completed 3D dynamics.

### 1.1 Inverse wells: an adopted rule, with locally fitted geometry

[FICTIONAL] **Yes: reversal is `thrust-response-region`, an extension the player adopts.** A negative per-burn response is evidence for a candidate, never automatic adoption. An enabled candidate can be previewed as a candidate; only an adopted, versioned model is used for newly issued forecasts. Previously issued forecasts remain frozen. A successful safe experiment can supply training or held-out evidence without a loss.

[ASSUMED] Replace the planar perpendicular in estimator-spec §6.5 with projectors. For position `x`, measured/estimated well center `c`, `e=(x−c)/|x−c|`, `P=e eᵀ` and `Q=I−P`, use

```text
aT_est = [I + w((kr−1)P + (kt−1)Q)] aT_nominal
```

`aT_nominal` comes from recorded executed commands, nominal engine ratings, estimated engine scale/misalignment, gauged mass and recorded attitude. It never comes from truth's `ActuatorOutput`. The tangent space has two independent directions; there is no unique 3D `tau_hat`. Interior truth for the proposed fiction is `kr=−1, kt=+1`; exterior response is identity. Retain §6.5's wide `1 ± 2` priors as initial play assumptions, with the bounded family `−1 ≤ kr,kt ≤ 1` for this candidate. Report fits at a bound as constrained; a local Gaussian alone does not describe their uncertainty.

[ASSUMED] For the optional overlap rule in wells.md, let `s=1−∏(1−wi)` and `B=(s/Σwi)Σwi Pi`, with `B=0` when every `wi=0`. The same two shared response factors give

```text
aT_est = [I + (kr−1)B + (kt−1)(sI−B)] aT_nominal
```

The owner can approve the single-well rule without approving overlaps. Until overlap behavior is explicitly selected and tested, an overlapping influence region is outside the validated model family; forecasts widen or end there. Do not sequentially reflect forces in an arbitrary field order.

[ASSUMED] Split fitted quantities into three groups:

| Group | Parameters and evidence | What persists |
|---|---|---|
| Rule | Radial/tangent response, smooth profile family, optional composition rule | Adopted structure persists under A4; confidence applies only over tested response conditions |
| Region geometry | `c.x/y/z`, `Rin`, `Rout` and covariance, from observed landmarks plus boundary-bracketing burns | Belongs to this measured region and run geometry; refresh after A10 reseeds |
| Ship | Engine scale/misalignment, accelerometer scale/bias, mass/configuration uncertainty | Carries with the existing age/use/damage inflation; cannot absorb a region-specific reversal silently |

[ASSUMED] Use an ordinary observed core/landmark to initialize the well's center, without granting the influence radii. Fitting an invisible center from one straight powered arc has severe geometric ambiguity. If no center landmark is observable, require powered arcs from several directions and retain competing centers until constrained. A schematic funnel is generated from believed geometry; drawing it does not create a measurement.

[ASSUMED] The minimum useful experiment set is an outside burn, an interior radial burn, interior burns spanning both tangent directions, and a coast before or after. Boundary burns at more than one radius constrain the profile width. For Hinge, force response around `w≈1/2` constrains the shell while coasting verifies that momentum and gravity were not canceled. If the ship cannot excite both tangent directions, the isotropic tangent parameter is an assumption with limited validation, not a measured fact about every direction.

[ASSUMED] Freeze a supported gravity calibration while fitting a first thrust candidate; then refit jointly with its uncertainty included. A fitted center, radius, engine scale and response strength can trade off. Apply the existing identifiability gate (posterior sigma below half the prior sigma and pair correlation below 0.98), add a rank/conditioning check on the scaled design matrix, and report the missing excitation. Do not tighten a radius estimate from a burn whose location uncertainty is larger than the measured transition.

[ASSUMED] Validate using a distinct recorded attempt as estimator-spec §7 requires; voluntary recall can create it without death. Fit only the training attempts, retain the training posterior, and apply §7.2's held-out consistency statistic and §7.1 evidence threshold. Include a radial direction, boundary crossing or well not used to train. A uniform engine scale can fit one reversed radial burn but fails the positive tangential and outside responses. A field that also alters coasting fails the coast control.

[ASSUMED] The existing `ValidatedSpan {body,rMin,rMax}` is insufficient for wells. Add a field-scoped support record: believed region ID, run/frame association, sampled normalized radius `(r−Rin)/(Rout−Rin)`, radial/tangent excitation, throttle range, boundary speeds, overlap status, parameter covariance and held-out attempt IDs. Transfer the *adopted structure* to another well; require its own geometry measurement and local response check. Never transfer a smaller uncertainty envelope solely because two wells share a radius in metres. No automatic claim that a tested isolated well validates a multiwell overlap.

### 1.2 Resolve accelerometer semantics explicitly

[ESTABLISHED: `src/contracts/truth/ship.ts`, `src/contracts/measurements.ts`] `EnvironmentEffects.specificForce` currently means non-gravitational specific force **after** field modification. Estimator-spec §13.3 leaves this undecided and recommends an alternative in which tracking alone sees the correction. These are incompatible measurement models.

[FICTIONAL] **Recommend retaining the contract's meaning:** the accelerometer senses the transformed COM thrust, with its ordinary noise, scale, bias and lever-arm correction uncertainty. It does not sense gravity. The well contributes a COM translational correction and no extra torque; ordinary nozzle moments and wheel torque remain. This is the bounded force-response fiction, not a claim that an actual engine nozzle reverses its force locally.

[ASSUMED] A radial burn then makes the sign discrepancy visible promptly. That does not establish center, boundary, unchanged tangent response, applicability to another well or a successful flight procedure. Preserve that honest instrument evidence instead of withholding it to lengthen discovery. The alternative is possible only as a separately declared fiction: add a propulsion-coupled body force that accelerates the sensor proof mass too, then change both sensor and estimator equations. Do not merely omit the correction from the accelerometer output.

[ASSUMED] Record the actual acquisition interval. The current loop hands the sensor the previous step's force; labeling that average as an instantaneous reading at the new tick can shift the inferred boundary by a tick. Proposed metadata `{start,end,frameAt}` or an equivalent interval sample must make the prediction integrate the same interval and rotate using the appropriate attitude. Store an inertial impulse and rotate at the declared frame time, or integrate body-frame specific force over the sensor interval; do not mix the two conventions. This is especially important at cutoff, field entry and fuel exhaustion.

### 1.3 Lattice reconstruction is a measurement product

[ESTABLISHED: `docs/CREATIVE_BRIEF.md` §6; `data/ship-baseline.json`, `sensing.latticeProcessing`] The reconstruction uses existing hardware. The current assumed equipment chain is `camera`, `imu-a`, `star-tracker-a` and `science-processor`, with `black-box` recording. The baseline already names a fictional processing mode at 350–1,000 W and 0.2–2 updates/s. These are power/cadence targets, not measured hardware capabilities. Processing never shields the ship or repairs equipment.

[FICTIONAL] Make the sensing departure explicit: the lattice imprints structured features in the existing camera's acquired channel that the Black Box processing can extract. Ordinary local intensity samples alone cannot specify a remote 3D lattice. A truth-side acquisition adapter may synthesize noisy angular fragments/junction features visible through the camera's actual field of view and occlusion mask; it must not send the full strand list, exact world points, true layer IDs or truth pose to belief code. The original unprocessed channel and processed detections are retained when recording capacity permits.

[ASSUMED] The ambitious reconstruction pipeline is:

1. Acquire anonymous angular feature fragments with timestamp, camera/calibration identity, angular covariance, quality, processing draw and exposure. Seed only measurement noise using stable sensor streams; field exposure and failures are deterministic.
2. Combine recorded attitude and navigation estimates with multiple observed viewpoints. Associate features as hypotheses, triangulate them, and fit finite line segments/sheet patches with uncertainty. Use a second/third viewpoint to reject ambiguous associations. A fit may regularize toward a grid but must not fill unobserved cells with certain strands or certain holes.
3. Retain covariance/correlation in the fitted patch frame, feature lineage and coverage. Pose error moves an entire reconstructed patch together; it is not independent point noise that can be averaged away by recording many nearby pixels.
4. Forecast the player's full moving ship/configuration envelope against this believed geometry and an uncertainty inflation. Carry local exposure and condition estimates from telemetry, not truth damage integrals. Freeze the reconstruction version and geometry assumptions with each issued forecast.

[ASSUMED] For a concrete starting policy, let `f=clamp((Pdelivered−350)/650,0,1)`. Below 350 W, emit no new processed detections. At or above it, target `0.2+1.8f` updates/s. Actual cadence is capped by source acquisition, recorder throughput, pointing, thermal state and hardware health. Begin with 1 m transverse and 3 m depth standard deviations at 1 km range for a well-constrained full-power patch, scaling by `(range/1000) / condition / max(0.25,f)`; this is an assumed reconstruction tuning target, not a camera specification or substitute for triangulation covariance. A bearing-only patch with insufficient parallax retains unbounded/unresolved depth regardless of this target. Measure achievable precision in the implementation before claiming these values.

[ASSUMED] A lower processing allocation produces fewer/coarser detections and less support. It does not delete previously measured strands. Store coverage as `unobserved`, `unresolved`, or `supported` with the observation interval, view directions, resolution, detection threshold and lineage. Store a separate predicted intensity interval. A cell may be displayed as **clear-supported** only when its conservative upper intensity bound is zero under the selected compact-support model *and* coverage resolves strand-scale structure. Compute that bound over a declared joint confidence set (initial operational assumption: 3-sigma, including common pose error), not over the unbounded support of a Gaussian. Thus clear-supported is conditional on that confidence set and the measured detection capability, not an absolute safety guarantee. Non-detection alone is not zero intensity. If a patch lacks a calibrated detection bound, it cannot certify a clear corridor. This is the Missing Room lesson.

[ASSUMED] In the current run, retained static geometry stays available after power drops, while uncertainty grows with navigation drift or unsupported motion. After recurrence, retain archived geometry/evidence but mark its coordinates as belonging to the old run; A10 changes layout. New observations can establish a new association. They never obtain the new layout by applying the old truth seed or silently reusing old world coordinates.

[ASSUMED] Lattice geometry fitting needs no new adopted force rule: it is a sensor reconstruction product. An optional quantitative exposure forecast uses an explicit assumed compact profile and component susceptibility model. Fit its strength/width only from observed intensity, passage geometry and component telemetry; do not read truth `D0`, `w`, condition thresholds or exact layer tilts. Conservative exposure intervals remain appropriate when the profile is poorly constrained. Knowing the processing mode and exposure interpretation carries; current geometry, coverage and component calibration must be re-earned.

## 2. Proposed simulation seam

[ESTABLISHED: `src/contracts/truth/fields.ts`] The current field API supplies `acceleration`, `modifyThrust`, `intensity`, `signal` and optional `inside`. It can evaluate a point, but cannot itself describe a component sweep, certify clearance, integrate dose, preserve acquisition coverage, or find two crossings whose endpoints are both outside. These are requests to the contract owner, not source edits.

[ASSUMED] Keep JSON factories/registry and scalar point intensity. Add narrow operations and a coordinator; do not give a field control over ship inventory, sensors, model state or random streams. The following names are a proposed shape, not compilable contract code:

```ts
// TRUTH SIDE ONLY; m, s, N, J, and fictional lattice units.
interface FieldQuery3 {
  t: number;
  position: Vec3;                 // inertial COM
}
interface ThrustCorrection3 {
  deltaForce: Vec3;               // inertial, added at COM; no added torque
  response: readonly number[];    // row-major 3×3, optional diagnostic
}
interface WellGroup3 {
  responseAt(q: FieldQuery3, deliveredForce: Vec3): ThrustCorrection3;
  surfaces(): readonly SphereSurface3[]; // core, Rin, Rout; truth event support
}
interface LatticeField3 {
  intensityAt(q: FieldQuery3): number;
  candidates(bounds: SweptAabb3): readonly StrandCandidate3[];
}
interface ComponentSweep3 {
  equipment: EquipmentId;
  interval: readonly [number, number];
  geometryAt(t: number): readonly ConvexShape3[];
  motionBound(t0: number, t1: number): number; // max point travel, m
}
interface ExposureIntegral3 {
  equipment: EquipmentId;
  interval: readonly [number, number];
  rawIntegral: number;            // integral of raw component intensity, unit*s
  rawIntegralErrorBound: number;  // conservative numerical bracket
  aboveThresholdIntervals: readonly TimeInterval3[];
  minimumMargin: number;          // strand support clearance; truth diagnostic
}
```

[ASSUMED] `SphereSurface3`, `StrandCandidate3`, `SweptAabb3` and `ConvexShape3` carry their frames and finite bounds explicitly. They are truth implementation types; shared `HullPrism[]` remains the ship geometry source. Equipment geometry is linked to the same deployment trajectories as mass properties and cooling. Computing a different fast/stowed geometry for the field would invalidate the clearance claim. `geometryAt` must include rotation, translation, COM motion relative to the datum, and intermediate appendage positions.

[ASSUMED] The field coordinator composes **all** active well responses once from actual delivered propulsion, after engine condition/misalignment/throttle/fuel limitations. It adds gravity separately and never changes preexisting velocity. The work ledger receives `v·deltaForce`; changing mass requires the full accounting in wells.md. No field work is credited to batteries or fuel. Nominal actuator moments are calculated once, independently of the COM correction.

[ASSUMED] The same coordinator evaluates each component's raw intensity as `Ic(t)=sup(x in component) Σlayers I_layer(x,t)` for the conservative appendage policy. `Σlayers sup I_layer` is an upper bound and can be used to prune/refine, but is not generally equal to that supremum. The field integrator returns raw dose and threshold intervals; ship radiation code applies susceptibility exactly once. The existing `EnvironmentEffects.intensity` point/rate map alone is insufficient: passing a one-tick average loses short severe dwell and can miss failure chronology.

[ASSUMED] Add a time-integrated field-effects input to the ship radiation update. It contains no inferred diagnosis: it is truth coupling between sim/game/ship. Preserve separate cumulative exposure, transient upset state, protection trips, powered burnout dwell and permanent condition. Off equipment continues accumulating exposure with its susceptibility; its protection/event policy follows the baseline. Use the real bus topology and heat ledger when a component latches or leaks.

### 2.1 Fixed ticks, deterministic chronology

[ASSUMED] Keep the outer P2 tick unchanged; warp only runs more ticks. Use the same deterministic interval-splitting policy for truth and any reference predictor that represents these fields. Split at commands, fuel exhaustion, deployment/sensor schedule changes, localized well surfaces and radiation thresholds. Spatial guards and sweep bounds are in wells.md and lattice.md. Ordinary event callbacks may not choose a wall-clock-dependent step.

[ASSUMED] A concrete integration order is:

1. Apply commands due at the boundary and snapshot the full state including RNG states. Prepare prospective power, propulsion, configuration and thermal evolution for the next declared subinterval.
2. Propagate the prospective pose/velocity; integrate component sweeps and evaluate the earliest exposure, burnout, contact or known system event. Keep raw measurements/events provisional.
3. If an event lies inside that interval, discard the provisional result, localize the event deterministically, rerun from the snapshot to that time, apply the event, and continue the remaining interval with new actuator/power availability. Do not let a failed engine keep thrusting until the next 1 s tick. Discarding a trial must also discard its random draws and records.
4. Commit measurements/events in canonical acquisition order. Tied permanent failures precede trips, which precede upsets, matching the existing baseline. Save all cumulative state and event cursors; resume must reproduce the same result.

[ASSUMED] The simple implementation may use fixed small substeps with bounded event delay, but must declare that delay, resolve the 0.1 s burnout dwell, and pass step-halving checks. It cannot advertise exact event chronology. A refinement cap must fail the content/test or report unresolved numerical error; silently returning zero dose or a clearance certificate is not acceptable.

### 2.2 The belief-safe seam

[ASSUMED] Extend the shared measurement format with a versioned field payload or a separate typed measurement union. The current untyped `field-signal.value[]` and `BelievedField.visual` are inadequate for auditable reconstruction. Required fields are acquisition interval and frame, anonymous observation/track IDs, angular data/covariance, coverage and validity, source equipment, actual processing draw, algorithm version and record lineage. A derived reconstruction carries estimated finite segments/patches, joint or correlated uncertainty, association hypotheses and coverage; a visual field consumes that derived product, not truth `params`.

[ASSUMED] Retain `field-signal` only as a transport category if convenient; do not smuggle an exact strand JSON object through it. Add belief-side field support/geometry types and immutable forecast field inputs. The game layer owns the truth-to-sensor conversion; the model reconstructs from the resulting recorded data and imports neither the truth registry nor field implementation. A view receives only the believed field. Ordinary windows may show visible rocks/cores; invisible strands appear only through the reconstructed display.

## 3. Work packages and screens

[ASSUMED] These are engineering estimates of new/changed TypeScript, excluding generated data and the full 2G conversion. They are not delivery dates; refine after agreeing the contracts.

| Owner / paths to request | Work | Approximate code |
|---|---|---:|
| 2G / integrator: `src/contracts/truth/fields.ts`, `truth/ship.ts`, `measurements.ts`, `belief.ts`, `model.ts`, `forecast.ts`, `view.ts` | Typed 3D seams, interval samples, field support and frozen forecast geometry | 250–450 lines |
| 3B: `src/sim/fields/inverse-well.ts`, well content | Profile, bounded group response, core/surface queries, work diagnostics | 200–350 lines |
| 3C: `src/sim/fields/lattice.ts`, lattice content | Finite sheets/segments, spatial queries, intensity and sweep integration | 500–900 lines |
| 2G / 3A / game integration: `src/sim/`, `src/game/`, `src/ship/` | Shared interval coordinator, swept deployment geometry, dose/trip/heat and chronology | 500–900 lines |
| Model owner: `src/model/dynamics.ts`, `engine.ts`, `extensions.ts`, `forecast.ts`, reconstruction module; `src/blackbox/` | Well fits, support, sensor reconstruction, evidence lineage and persistence | 900–1,600 lines |
| 3C / 2D: `src/ship/sensors/`, `src/console/encounters/`, `src/view3d/fields/` | Acquisition/processing mode, patch views, clearance and evidence displays | 600–1,100 lines |
| Owning threads' tests | Reference vectors, property tests, truth-boundary and coupled-loop checks | 700–1,200 lines |

[ASSUMED] Data changes include encounter well centers/radii/cores; finite lattice poses, offsets, tilts, endpoints, width and peak intensity; component 3D footprints and deployment trajectories; field acquisition settings; and baseline radiation/processing parameters already present in `data/ship-baseline.json`. Keep law parameters fixed across runs; A10 varies authored geometry through seeded streams, not failure thresholds in response to player success.

[ASSUMED] 2D needs four linked views, composed from `src/theme/`:

- Flight: uncertain well influence surfaces, radial response and thrust/velocity ticks; reconstructed strands, unresolved volumes and the whole predicted ship sweep. Show the threatened component and first lost margin, not only the COM path.
- Ship: live deployment/transition, component dose estimate/condition, breaker state, power/temperature and available cooling. Stowing trades clearance against cooling and timing.
- Console: per-burn measured/commanded response in radial and two tangent directions; training/held-out selection; fit support and uncertain geometry. A candidate remains visibly separate from an adopted model.
- Black Box: original forecast, sensed trail, power/configuration history, first exposure/electrical consequence and retained coverage. Comparing attempts requires explicit geometry/frame alignment.

[ESTABLISHED: `docs/DECISIONS.md` A11–A12] Controls currently hold roll and offer yaw/pitch by hand. Author traversable poses for those controls; region prose mentioning roll does not authorize a new manual-roll requirement. Preparation is possible in transit, but no encounter UI freezes physics while the player studies a fit.

[ASSUMED] The ambitious version performs feature-based reconstruction and coupled event chronology. A smaller version can emit bounded noisy 3D patch measurements through the same existing-hardware mode as an explicitly stronger sensing fiction, and keep separated static wells and fixed deployment endpoints during a pass. It loses parallax/association investigations and moving-appendage maneuvers. It still must preserve unknown coverage, finite extents, whole-ship clearance, power cost, per-component accumulated damage, learned-rule adoption and fresh geometry. A truth mesh toggle, COM-only checks or universal hit counter is not an acceptable smaller version.

## 4. Acceptance the code threads must supply

[ASSUMED] These are required implementation tests, **not claims that this study ran them**. Numerical field vectors in `tools/studies/s5/` are an independent reference for their covered cases; they do not validate the estimator, sensors or gameplay.

| Test | Required result |
|---|---|
| Well model recovery | Fit synthetic recorded 3D radial/tangent/outside/coast arcs with uncertainty; recover the selected response/profile and reject a global engine-scale explanation on held-out data |
| Identifiability | Radial-only or no-parallax data leave missing dimensions wide; a prior or fit bound must not masquerade as acquired support |
| Measurement semantics | Acceleration excludes gravity and includes the selected well response over exactly the recorded interval; command/cutoff/boundary timing has no one-tick bias |
| Rule lifecycle | Candidate does not enter adopted forecasts; held-out evidence never trains its own candidate; adoption/revocation creates versions and leaves issued forecasts unchanged |
| Truth isolation | Changing hidden unseen strands while holding recorded measurements fixed leaves belief, view and forecast byte-equivalent; boundary lint remains passing |
| Reconstruction coverage | Low power, occlusion, poor parallax and failed hardware produce unknown/unresolved regions, never invented holes; old supported strands remain archived |
| Sensor/resource coupling | Delivered power, recorder rate/capacity, pointing and heat limit products; processing draw becomes heat; no added physical equipment and no shielding effect |
| Pose/covariance | Rigidly rotate a full scene and measurement frame; reconstruction and covariance rotate with it. Shared pose errors do not shrink like independent pixels |
| Clearance | All S5 sweep vectors pass in 3D, including the COM-clear/deployed-radiator-unsafe case and motion between endpoints; pose uncertainty can change a narrow passage to unresolved |
| Damage chronology | Dose partitioning across intervals preserves totals; off-state dose persists; a short powered severe dwell trips/fails in time; subsequent power/thrust uses the changed state |
| Recurrence | Physical exposure/condition resets under P8; records and adopted structure persist; old coordinates are not current A10 geometry; JSON save/resume preserves event cursors and RNG |
| Determinism/convergence | Same seed/commands gives same records and result independent of warp/batching; halving field integration resolution converges within the declared vector tolerances |
| Encounter validation | Fly each named region and Braided Crossing with current controls and surviving ship. Include a successful cautious experiment, finite exterior bypass, an expert passage and a carried-knowledge/no-fresh-measurements run |

[ASSUMED] Before implementation, the integrator should resolve one decision at a time: (1) accelerometers sense the modified thrust — recommend yes; (2) COM-only field correction preserves nominal actuator torque — recommend yes; (3) use the observation/triangulation reconstruction above or the explicitly stronger noisy-patch sensing fiction — recommend observation/triangulation. The other S5 documents list field-profile and content choices. None of these decisions has been silently written to `docs/DECISIONS.md`.
