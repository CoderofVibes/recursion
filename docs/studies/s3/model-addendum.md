# Borrowed Spin: proposed estimator addendum

S3 proposal, 2026-11-14. This specifies work for 2C and the encounter implementation; it changes no shared contract or implemented estimator. All design choices and numeric examples below are **[ASSUMED]** unless separately labelled. The current 3D contract conventions override planar notation in the older estimator specification.

## Recommendation: known mechanics, unknown numbers

Ship tether mechanics should be available from the ship's nominal design, without a player-adopted `tether-law` extension. The player chooses the attachment, operating configuration, capture attempt, payout and release. The estimator fits stiffness, damping, length bias, structure motion and supported inertia parameters from acquired data. An enabled equipment model is not a new law of nature. This preserves A2/A4/P5 while leaving unfamiliar gravity and other fictional rules under the existing adoption workflow.

[ESTABLISHED: NASA Tethers in Space Handbook](https://ntrs.nasa.gov/api/citations/19980018321/downloads/19980018321.pdf): a tether exchanges momentum between connected bodies; it does not create momentum. S1 owns the actual tension law, capture regularization, conservation vectors, structural limits and release treatment. S2 owns nominal hardware, sensors and operating limits. Neither ordinary elasticity nor conservation needs a discovery unlock. A successful, low-load trial can improve calibration without a death.

The recommended ambitious version forecasts two coupled rigid bodies and the same tension-only line modes S1 implements, with noisy attachment tracking and force telemetry. A smaller version can retain one rigid structure and a single line while omitting reel control and flexible modes. It loses load-management experiments. It must still exchange momentum, carry finite inertia, preserve ship attitude and distinguish slack from taut; an immovable pivot or scripted curved path loses the encounter's premise.

## 1. State, dynamics and measurement boundary (spec §3)

Use the shared inertial frame, SI, body-to-inertial quaternions, body-frame angular rates and full three-axis attitude. Gravity uses the currently adopted/locally calibrated belief law; truth uses P4, shared `r0 = 1,000,000 m` **[FICTIONAL: DECISIONS P4]**. The rotating structure is a mechanically reacting body even if its own gravitational attraction is negligible at S1's scale. Do not substitute hidden or unmeasured GM for a material-mass estimate. P4 does not break the GM-to-mass relation; if self-gravity is too small to measure, constrain mass mechanically or keep a justified nominal prior broad.

The local fit carries ship navigation/attitude, structure translation/attitude/rate, inferred material geometry, line length/rate and mode, and joint covariance. Use a small rotation-error vector for attitude uncertainty, not a covariance of four independently varying quaternion components. A visually estimated geometry origin need not be the structure's centre of mass: keep the CoM offset uncertain until force/torque data constrain it.

For material attachment vectors `aH` and `aS` measured relative to their respective CoMs:

```text
pH = rH + RH aH                 pS = rS + RS aS
vH = vCOM,H + RH (omegaH × aH)   vS = vCOM,S + RS (omegaS × aS)
d = pS - pH                    n = d / |d|
e = |d| - L0                   eDot = n · (vS - vH) - L0Dot
```

Here H is the ship, S is the structure, and angular rates are body-frame. Feed `e`, `eDot` and the commanded/limited reel state to **S1's** tension-only constitutive law. Force on the ship is `+T n`; force on the structure is `-T n`, with the respective attachment torques. Include the ship's actual configuration, CoM and attitude-control response. Do not recenter the tether onto the ship's CoM to remove a difficult torque. A release stops mechanical coupling according to S1's release law; it does not set the ship's velocity to a desired exit vector.

Model modes are `free`, `capture-pending`, `attached-slack`, `attached-taut`, and `released-or-disconnected`. A sensed latch indication and line load establish attachment; a command alone does not. Loss of tension alone can mean slack, break, missed capture or sensor failure, so it must not reveal a hidden cause. Record command execution and sensed events separately. Capture contact can introduce an impulse; smooth slack/taut changes require event-aware integration but no invented impulse.

### Parameters and support

| Parameter group | Fit and carry policy | Missing evidence means |
|---|---|---|
| Ship line stiffness `k`, damping `c`, encoder zero/scale, load-cell bias/scale | Nominal S2 priors; carry hardware calibration with wear/use/condition uncertainty and configuration provenance | Nominal prediction remains broad; never silently substitute truth |
| Structure position, velocity, phase, axis/rate | New state per run/arc, refreshed optically | Old phase is historical evidence, not current navigation |
| Structure inertia and CoM offset | Run/configuration-specific; fit only excited combinations, with nominal geometry priors if actually justified | Passive steady rotation does not measure absolute inertia |
| Attachment position and geometry | Observed material points, with scale and correspondence uncertainty | Unseen rear surfaces/attachments remain absent |
| Capture/release delay, limit and protection response | S2 nominal equipment specification plus recorded executed commands/telemetry | Unknown delay widens event time; no exact hidden trip threshold |

Do not fit every inertia-tensor element from one nearly planar pull. Start with inertia about the measured torque direction; leave orthogonal components prior-dominated. Free rotation can constrain some inertia ratios for a sufficiently rich tumble, but gives no absolute mass/inertia scale without a known torque. A symmetric, torque-free spin contains no such scale information. These are identifiability consequences of the proposed dynamics, not results demonstrated by S3.

Track support in `(length, tension, extension rate, spin rate, attachment/configuration, torque direction)` using retained trial IDs. Keep connected regions or individual trial cells rather than a bounding box that pretends all combinations were sampled. Gravity's validated **radial** spans do not become tether support. Known mechanics remains enabled outside support, but broadens with constitutive/geometry uncertainty and stops at an unsupported mode. Passing a hardware validation refines confidence; it does not adopt a new fictional rule.

## 2. Measure the rotation; do not read the authored axis

[ESTABLISHED: Deng et al., 2022](https://www.mdpi.com/2076-3417/12/24/12625): sequences of optical feature correspondences can estimate a non-cooperative target's rotation; translational recovery depends on additional observability conditions. The game can represent the resulting observations without implementing an image-processing research stack.

S2 should provide camera bearings to acquired feature IDs, their timestamps and uncertainty, with a range measurement only when its hardware/known-size assumptions support one. Use multiple distinguishable features distributed across the structure and successive views. Estimate `p_i(t) = rS(t) + RS(t) a_i` jointly with ship motion/attitude. Subtract apparent motion caused by the ship and camera pointing; the ship gyro measures the **ship**, not the structure. Range, parallax or a justified known dimension is needed for metric attachment radius and speed. An invented known radius would hide the range-scale ambiguity.

Keep frame-specific feature identities, occlusion gaps and covariance. A uniform circular silhouette does not reveal phase; repeated arms may give multiple phase solutions. Preserve those hypotheses or mark phase unresolved. Do not average two opposed phase solutions into a precise third one. A feature near the spin axis carries little rate leverage; one feature cannot generally identify arbitrary 3D attitude. A later reacquisition may restore observability without changing the physics.

The estimated instantaneous rotation axis is `RS omegaS / |omegaS|`, with a direction cone and phase uncertainty. For tumbling motion, show its changing axis rather than claiming a fixed inertial axis. The attachment velocity includes translation and rotation; its covariance includes their correlations and geometry uncertainty. Fresh line load and a measured change in angular momentum can constrain inertia during the swing. Feed raw feature observations **or** a derived pose with its joint covariance into a fit, never both as independent evidence.

## 3. Separate gravity, thrust and tether evidence (spec §3, §6, §9)

P7 means accelerometers sense **non-gravitational force**, including tether force. Engine-off while taut is not a gravity-calibration coast. For an IMU at body offset `b` from the ship CoM, the predicted reading includes:

```text
fIMU = RH^T (Fthrust + Ftether + other nongravitational forces) / mH
       + alphaH × b + omegaH × (omegaH × b) + sensor bias
```

Use the appropriate calibrated sensor scale/axes. Omitting those rotational terms can make line torque look like accelerometer drift. Gravity must still come from tracking. A structure's apparent spin change must not be turned into a gravity-law correction.

The existing `src/model/adapt.ts` selects accelerometer bins during burns and breaks arcs at recorded contacts; `settings.ts` uses 30 s integration, 60 s optical normal points/forecast samples, and 10 s acceleration bins. Those are the current source values, not adequate defaults for capture. Request a local mechanical arc path with event-aligned raw or shorter-bin observations. Exclude attached, capture-transient and poorly classified windows from the gravity profile and engine-only calibration. Resume them only after a recorded disconnection and a transient exclusion interval justified by S1/S2 data. Show residuals by `free coast`, `free thrust`, `capture`, `taut`, `slack`, and `released`, as well as by sensor.

Fit `k` from load against measured extension and `c` from variation in extension rate; a steady taut segment alone cannot separate all terms. Load-cell/length bias, inertia/torque arm and engine/line force can be confounded. Use posterior/prior sigma ratios and correlations as in spec §7.5, with the existing `|rho| > 0.9` warning as an initial play value. Keep the poorly observed directions broad; do not silently report fitted certainty.

Validate hardware prediction on a held-out trial or a predeclared later segment with a different load/phase. Fit trial-local initial state without allowing unrestricted initial-state refits to erase a predicted impulse error. Freeze the training posterior; score whitened tracking, load and attitude residuals, excluding duplicated derived measurements. Separately score event-time intervals and observed mode sequences because a Gaussian residual statistic alone cannot validate a missed capture. Preserve all test outcomes. No prerequisite trial count or death count.

## 4. Forecast contract: consequences of player inputs (spec §8)

| Phase | Input and output | Hard boundary on assistance |
|---|---|---|
| Before capture | Player selects a sensed attachment and sets approach, capture attempt and hardware settings. Show free-flight COM path, target-point track, relative velocity and geometric capture interval. An explicitly requested conditional attached preview may follow | Never pick attachment, intercept burn or best capture time. Capture and miss are distinct branches, not one mean path |
| Capturing/slack | Show delay/extension/load range and possible first-taut event, plus free continuation if attachment is unresolved | A conditional latch is not confirmed by the forecast. No post-capture guarantee if branch geometry is unknown |
| Taut swing | Propagate coupled translation/rotation and tension for the player's current commands. Show COM envelope, attitude/whole-ship sweep, line loading and measured structure rotation | Default forecast stays attached until the player specifies release. No automatic optimum-release marker, countdown or control policy |
| Player requests a release preview | Insert only that chosen release command/time, including actuator delay uncertainty; show the resulting free trajectory and Stillwater crossing if charted and within horizon | A preview is not an executed command. No automatic search over release times or retiming of saved procedures |
| After sensed release | New forecast starts from the observed released state and continues the believed gravity/thrust model | Preserve the earlier issued forecast and its error. Do not retrospectively snap it onto the measured path |

The immediate-release preview is permitted only as an explicit player-selected hypothesis. It can update while selected, but each **issued** snapshot is frozen and separately identified. Current preview, issued forecast and measured trail need distinct semantics. Direct hands-on command changes invalidate the prior preview's assumptions, not the recorded prediction.

Use deterministic positive-weight samples or bounded scenario ensembles of the **joint** estimated state/parameters, plus event-time uncertainty. A linear covariance propagation is acceptable inside one smooth, verified mode. Never average capture/miss or intact/broken outcomes into a reassuring curve. Report each branch as conditional unless calibrated probabilities are available; ensemble membership alone is not a probability estimate. Each branch gets a 3D covariance envelope only where that representation is meaningful. Preserve the common uncertain ship/structure states so relative errors are not counted twice.

At a capture impulse or release event, propagate each member through its own event time and S1's event map. A local covariance approximation must include event-time sensitivity and uncertain impulse/actuator response. Do not copy a pre-capture covariance unchanged into a perfectly known attached state. Release with residual elastic energy or line recoil follows S1/S2's hardware assumption and remains an explicit uncertain input until that work lands.

Local integration and forecast sampling must resolve the fastest S1 elastic period, S2 actuator latency and predicted collision/event interval. Initial acceptance rule: time step at most `min(t_elastic/40, t_actuator/10, t_event_margin/10)`, deterministic event bracketing and a half-step convergence test. This is a proposed accuracy rule, not proof of stable integration; S1's stiffness/integrator may require a different method. Forecast worker latency must be measured before selecting the live refresh rate. An overdue preview displays its age while flight continues at 1×; it never freezes A12's world.

## 5. Horizon: local geometry and modes, not just the nearest planet

Retain spec §8.4's gravity horizon as one stop condition. Add the earliest of the following **per branch**, calculated only from belief and hardware specifications:

1. **Unresolved event:** capture/miss, attachment identity, slack/taut topology or disconnect state cannot be resolved by the supported uncertainty representation. The common path stops before the event. A conditional branch may continue only with an explicit event assumption and its own uncertainty; no single unconditional path crosses it.
2. **Unresolved local clearance:** the uncertainty of full-ship/line versus sensed structure clearance consumes the nominal positive clearance. Initial display threshold is `2 sigma_clearance >= clearance_mean`. Stop the precise local line at that location and show the conflict volume. Already predicted contact is a predicted hazard, not something to suppress by widening a line. Unknown obstacle surfaces also limit clearance claims.
3. **Outside supported hardware model:** a credible member reaches a rated load/extension/reel/attitude boundary for which the model lacks supported failure/protection behavior. Stop before the limit; do not forecast a truth-derived break time. If a known protection law is modeled, branch on its uncertain threshold and latency.
4. **State uncertainty/nonlinearity:** the existing gravity ratio is exceeded, a pose hypothesis becomes multimodal, or a deterministic refinement check shows materially different event order/clearance.

Clearance is between swept **whole geometry**, including the line and appendages, not centres. Intentional hook contact must use the capture interface tolerance rather than being mistaken for a hull collision. For near-contact relative navigation, local uncertainty is in attachment position/velocity and alignment; the distant-body horizon alone is insufficient.

Numerical example from [the S3 reference](../../../tools/studies/s3/generate.py), using assumed inputs rather than S1/S2 ratings: attachment radius 500 m, spin 0.02 rad/s, pose sigma 0.05 degrees, spin sigma 0.00005 rad/s, centre sigma 0.25 m and landmark sigma 0.15 m. The initial transverse sigma is 0.52477 m. With no new fixes, a **3-sigma capture-eligibility** budget exceeds an assumed 2 m radial tolerance after 16.4467 s and reaches 4.767 m at 60 s. This capture criterion is deliberately stricter than the 2-sigma envelope display/clearance stop above; neither is a collision or capture probability. [DEMONSTRATED: `tools/studies/s3/generate.py`, `capture-width-horizon-root`] A distant planet could leave the ordinary gravity horizon hours away while local contact uncertainty has already become decisive. These kinematic checks demonstrate the need for fresh sensing and a local horizon, not a playable route or tether dynamics.

## 6. Black Box and cross-run learning

Store acquired feature observations/IDs, actual rate/load/length readings, recorded command execution, acquisition quality and gaps, latch/disconnect evidence, calibration versions/support and every issued branch/horizon. Store assumed event conditions with forecasts. Measurements never gain an exact structure axis, inertia or unsensed break cause after loss. Reconstruct only from retained data; an unrecorded interval stays a gap.

Scope structure configuration and phase by attempt/run. A10's fixed mass/size rule allows proposed inertia variation only through separately approved fixed-mass configurations, not a hidden mass reroll. Old observations teach mechanics and configuration-dependent properties; current geometry requires reacquisition. Ship hardware calibration carries with physical wear history. Recurrence restores the ship, and its arrival calibration is rebuilt from compatible records rather than carrying the just-destroyed line's wear into the fresh ship.

2C update 3 already warns that per-run carried ship priors are not fully represented. Resolve that interface before pooling tether calibration: different branch histories can reach Borrowed Spin with different CoM, propellant, sensors and tether condition. An attempt's recorded briefing and transit record must carry those measured priors without leaking seeded truth. Saved procedures match configuration, acquired attachment, approach state, spin/phase bounds, sensing support and resources; a mismatch requires player adaptation. No automatic release retiming.

## 7. Requested addendum and implementation slices

| Shared surface | Exact requested change | Owner / estimate |
|---|---|---|
| `docs/model/estimator-spec.md` §3, §6–9, §11 | Add coupled mechanical state/arcs, known-hardware parameter policy, contact-aware observations, conditional forecasts, local horizons, support/validation and persistence above | Integrator/model owner; specification |
| `src/contracts/measurements.ts`, `belief.ts`, `model.ts` | Feature/pose observation provenance with covariance; sensed line state and material attachment geometry; joint rigid-body estimate and configuration-local inertia/support | Integrator after 2G; approximately 250–400 lines |
| `src/contracts/commands.ts`, `forecast.ts`, `attempt.ts` | Capture/payout/release commands with execution result; conditional branch IDs, mode/event intervals, line-load and pose sweep, horizon reasons; archived configuration/calibration inputs | Integrator; approximately 250–400 lines |
| `src/model/dynamics.ts`, new local tether dynamics/fit modules | Independent belief propagator, joint local fit, observability checks and event-aware propagation using agreed S1 equations; no `src/sim/` imports | 2C/encounter model owner; approximately 900–1,500 lines |
| `src/model/adapt.ts`, `tierL.ts`, `forecast.ts`, `report.ts`, `settings.ts`, service/worker | Preserve capture cadence, classify forces correctly, protect gravity/engine fits, branch envelope/horizon computation and UI products | 2C; approximately 650–1,100 lines |
| `src/blackbox/`, store migrations and procedure comparison | Persist extended observations/forecasts/test provenance, retain old-save readability, identify procedure mismatches | 2C; approximately 200–400 lines |
| `src/game/` measurement boundary; `src/ship/`; content/sim truth modules | S2 sensor/equipment support and S1 force/capture events translated to sensed inputs; never send exact seed parameters to model | Other owners; S1/S2 estimate, excluded here |
| `src/console/encounters/borrowed-spin/`, `src/view3d/` | Consume the phase/branch/uncertainty products in S3's interaction specification, using 2D theme primitives | 2D; screen estimate elsewhere in S3 |

Model/contracts/persistence subtotal is approximately **2,250–3,800 production lines**, plus **800–1,400 test lines**. These are planning estimates, excluding S1 physics, S2 hardware, content and screens. Prefer module boundaries over a single extra term in the existing long-coast forecaster.

Required acceptance tests, **not executed by this document**:

- S1's independent 3D vectors reproduced by the belief propagator from explicitly supplied assumed parameters; equal/opposite forces, finite-inertia response, attachment torque and release continuity tested without importing truth into production model code.
- No thrust + taut line produces accelerometer force but no gravity-profile window; displaced IMU rotation terms are accounted for. Known line forces do not corrupt carried engine scale.
- Passive symmetric rotation leaves inertia magnitude unobservable; missing range leaves metric scale broad; near-axis features/occlusion/symmetry do not produce precise phase. No duplicate use of derived/raw observations.
- Blind held-out capture/taut/release forecast scores tracking, load, attitude, event timing and mode. Deliberately wrong stiffness and inertia widen or fail; held-out trials are not refitted into a hidden success.
- Capture/miss and slack/taut alternatives remain separate; no line passes through the mean of incompatible trajectories. Half-step integration agrees within the allocated measurement/clearance error budget.
- A distant gravity body with nearby uncertain arms triggers the local horizon. Unknown backside geometry never gets clearance certification; hook contact is distinguished from hull/line contact.
- Change only unsensed truth inertia/feature geometry: model inputs and issued forecast stay identical until measurements differ. P11 lint guards remain green.
- A new run's phase/arrival/condition is taken from acquired data and its briefing. Compatible calibration carries; old world geometry does not. Frozen issued forecasts survive refit, loss, JSON round-trip and reload unchanged.
- Forecasting preserves the player plan byte for byte, emits no commands, chooses no target/release time, and never pauses the running encounter. A stale worker response cannot overwrite a newer input revision.

## 8. S1/S2 reconciliation status

At initial inspection both `st/s1-tether-physics` and `st/s2-tether-hardware` pointed to `baf65e0` and contained no committed study outputs. The following remain explicit integration inputs: `S1.tensionLaw`, `S1.captureLaw`, `S1.releaseLaw`, `S1.elasticTimescale`, `S1.structureMassInertia`, `S2.lineRatings`, `S2.captureEnvelope`, `S2.reelLimits`, `S2.releaseLatency`, `S2.sensorCadenceNoise`, and `S2.mountGeometry`. S3's final handoff records the latest committed reconciliation; this initial observation is not a claim that those threads will remain unfinished.
