# A03 — Borrowed Spin

S3 encounter proposal, 2026-11-14. **Status: design for owner review; no playable route demonstrated.** All authoring choices and ranges below are `[ASSUMED]` unless specifically labelled. The creative brief and DECISIONS A2, A4–A6, A9–A13 and P2/P4–P7/P11 govern. The old template's planar sentence is superseded by A11. This file fills every field of [the encounter template](../../design/encounter-template.md).

## 1. Compact catalogue entry

| Field | Specification |
|---|---|
| ID / display name | `A03` / Borrowed Spin. Initially chart a rotating structure; the display name is a chart label, not evidence that a tether maneuver works. |
| Kind / branch | Optional combined flight, sensing and equipment operation on the sensing/navigation route. |
| Question | Can this arriving ship exchange useful momentum with this measured rotating structure while keeping line load, clearance and release error within its surviving capability? |
| Engineering decision | Select and track an accessible attachment, match its motion, configure the ship and brake, capture, manage payout/load and attitude, then release by hand onto a chosen departure. |
| Success teaches | With main thrust off, tension changes the ship's motion and the structure reacts; a measured release state predicts the subsequent free trajectory. A short capture followed by an early clear release can obtain evidence without a full transit or death. |
| Failure teaches | A miss constrains relative motion/aim; a tension transient constrains capture speed and brake behavior; a clearance loss exposes line/appendage geometry; a late release exposes phase error. Missing measurements can leave the cause unresolved. |
| Model evidence | Feature bearings and any independently justified ranges, ship attitude/rates and specific force, attachment observations, load/payout/rate/brake temperature, executed commands and latch indications; every item includes time, source and uncertainty. Exact structure inertia is never a camera reading. |
| Proceed | Exit with the actual ship on a physically useful Stillwater approach, sufficient correction capability and a clear whole-ship path. No adoption badge, visit flag, successful tether attempt or stored procedure is required. |
| Optional / expiry | Unseen Cathedral also leads directly to Stillwater. The experiment expires once understood for comparable equipment; a momentum-saving detour can remain useful. New geometry, wear or load outside tested support can justify another measurement. Bypass remains available if the tether is absent, used up or damaged. |
| Systems / cost | Reuse D (dynamics), E (engineering) and S (sensing); no W/L/X effects in the close swing volume. Heavy new tether/coupled-rigid-body system, requested from integrator; S1 defines physics, S2 hardware, S3 encounter/model/screen requirements. Not an existing free feature. |

## 2. Place and travel

### Graph and discovery

Preserve A13 and the region proposal: **Unseen Cathedral → Borrowed Spin → Stillwater**, with **Unseen Cathedral → Stillwater** as the ordinary route. The cross-transfer through Well Garden remains unchanged. This detour does not teach or replace the wells/lattice lessons required later at Braided Crossing.

The author knows both connections. The player first sees repeated glints and an arm crossing the stars from the Cathedral's exterior departure. Tracking establishes a nearby rotating object rather than an aperture or distant point light. Only acquired bearings, ranges and departure observations add chart geometry. Stillwater's broad continuation is visible from the observation side when illumination and coverage permit; no reward marker reveals an unobserved route.

### Scene and frames

An abandoned hub has several long arms and visibly distinct attachment features. One passes overhead while another sweeps below the ship's projected approach. The ship stays toward the rear of FLIGHT; the window provides optical scale and the hologram provides measured depth. Trailing broken cables are decorative only outside the maneuver volume unless S1 supplies physical cable collision and motion. Never invite a grappling action on an unmodeled cable.

Use the briefing's right-handed inertial frame, SI units, body-to-inertial quaternions and body-frame angular rates from the 3D contracts. Convert angular rate to inertial before evaluating attachment velocity. Attachment-relative velocity includes **both** bodies' rotation, rather than just their center velocities. P4's `[FICTIONAL]` gravity is `a = (GM/r0^2)(r0/r)^2.5`, with shared `r0 = 1,000,000 m`, applied consistently to ship and structure and any relevant nearby bodies. A fixed, inexhaustible rotating anchor is not acceptable.

Let `R` be S1's authored structure envelope radius, `L` the current paid-out line length and `H` the current ship bounding reach. The authoring collision model contains arms, hub, latch surfaces and full ship hull/appendages; a center-of-mass path alone proves no clearance. Near-field self-gravity/distributed gravity is included or bounded by S1, never introduced as a second fictional law. The structure's initial spin energy and finite inertia are part of the ledger.

### Arrival envelope and variation

These are candidate ranges to sweep, **not certified feasible limits**. The seed samples geometry once per run; motion then evolves from that epoch even while the player reads the console. The ship inherits its actual Cathedral exit state, mass, configuration, heat, charge, damage and propellant. The author must reject unsupported route joins at content validation, not teleport the ship into this envelope at runtime.

| Quantity | Proposed authoring range / rule | Measurement or validation needed |
|---|---|---|
| Spin-axis direction | Full azimuth, tilt 20–70° from nominal arrival forward axis; exclude a pole-on capture view only from the introductory seed set, not from physics | Track resolved features from changing viewpoints; axis carries uncertainty |
| Initial phase | `[0, 2π)` at run epoch | Fresh phase required even with perfect archived rate |
| Spin magnitude | Hold S1's selected nominal magnitude fixed in the first content version; geometry alone varies | Subsequent rate changes arise from dynamics and exchange |
| Attachments | Fixed catalogue of three or more pads at cylindrical radii `0.6R–R`, axial offsets within `±0.1R` (all inside the final authored envelope); seed changes phase/pose and the exposed choice | Measure each accessible feature; never randomly change an identical pad's strength |
| Structure inertia | Candidate principal-spin moment `0.8–1.2 I0`, achieved by **fixed-mass ballast configurations within a fixed outer envelope**, each with a physically valid full inertia tensor | Owner decision required; until resolved, `I = I0` in every run. Fit selected configuration afresh from observations/load response |
| Arrival position | Observation shell `6R–10R`, lateral/elevation offset up to `2R` from nominal corridor | Continuous route join and clear outward coast verified for each seed |
| Arrival center-relative velocity | Closing component `1–5 m/s`, transverse components each `−3…3 m/s` | Candidate arrival range only; approach to the pad requires deliberate additional velocity matching |
| Ship attitude | Yaw/pitch up to `±30°` from nominal arrival; inherited roll is held by normal controls | Full ship and line sweep; no mandatory manual roll input (A11) |
| Capture-relative speed | Target `0.2–0.6 × Vcapture(S2)`; hardware's hard rating remains separate | Relative to the attachment at interception, including launcher/capture-device flight and angular motion |
| Propellant/charge/heat/condition | No seeded resets or random new damage here; inherited actual values | Use route sweeps from both branch orders and cross-transfer arrivals, including a worn ship |

**A10 conflict:** A10 keeps massive-body masses and sizes fixed while the S3 prompt requests varying inertia. Treat changed internal distribution as a proposed geometry interpretation, not permission to resample mass or hidden strength. The integrator/owner must approve it. The fixed-inertia fallback is coherent and loses only one source of repeat-run variation.

### Timeline, standoff and abort

Safe preparation belongs to the clear **transit before the encounter**. It has no universal countdown; time still advances and equipment still operates. An observation coast outside the rotating swept volume may also be locally safe, but it is a moving trajectory, not a HOLD command. Author it with an outward escape and enough time to observe at least a substantial fraction of a rotation. A 500 m / 0.02 rad/s kinematic example has a 314.16 s period; this is S3's sensitivity fixture, not an approved content scale.

Commitment is physical: firing while approaching the arms and then taking load removes the simple exterior coast as an escape. There is no invisible trigger that closes the bypass. Before firing, fly outward and continue direct to Stillwater. After a miss, leave the arm sweep rather than chase the moving pad. After latching, an early release/cut plus available translation can reach the exterior only if current geometry supports it. Neither button guarantees rescue. Missed rotational opportunities recur through motion; phase does not reset when a target is selected.

### Useful departure and transit continuity

The player chooses a sensed departure direction toward Stillwater. Candidate local exit test: cross an outward plane at `8R` from the hub, within a disk of radius `2R`, with forward component `5–25 m/s` and transverse speed no more than `2 m/s`. The plane is a handoff/check surface, not a wall, toll or visibly floating target. Its coordinates must come from the authored connecting corridor and its display from charted evidence. These provisional numbers must be replaced if S1's achievable exchange or S4's transfer requires it.

Pass the full physical state and measured released-line configuration into transit; loose hardware does not disappear at a boundary. Track and correct the actual outgoing trajectory. Preserve the exact inertial transform to Stillwater, continuous time, resource use and calibration aging. A wide miss may be a costly but survivable alternative transit. A speed gain alone is not success if it creates a large braking bill at Stillwater.

Evaluate usefulness with paired headless flights from the **same** arrival to the **same** Stillwater arrival envelope: direct route versus tether route, including velocity matching, RCS, correction, braking, heat and charge. Proposed content target: save at least 10 m/s of main-engine-equivalent propulsive effort without consuming the downstream reserve; report actual propellant kilograms separately because main/RCS specific impulses differ. Ten m/s is about 1.45% of the nominal 690 m/s main budget, not a proven saving. If net savings are smaller than execution costs, present this as an optional experiment, not an economy route. S1 supplies attainable exchange; S2 supplies costs; S4/3E prove the complete transfer.

## 3. Experiment, forecast and operation

### Rival explanations and controlled comparison

1. **Fast capture versus weak brake/line:** compare measured attachment-relative closing speed and tension rise at equal commanded brake setting; prior line calibration and payout distinguish these only if recorded. A break alone proves neither cause.
2. **Wrong structure inertia versus wrong tether stiffness:** pre-load spin tracking constrains initial rate; loaded spin change constrains angular impulse/inertia; length/tension transients constrain stiffness and damping. An unforced rotation cannot identify inertia magnitude. Fit only observable combinations.
3. **Bad release phase versus a wrong post-release gravity forecast:** align the executed release time with the measured velocity at that instant, then compare free-flight residuals. A faithful but badly aimed release is the player's plan outcome, not a model error.
4. **Apparent plane match versus out-of-plane miss:** inspect the pad-relative end-on inset and side view; two points overlapping in one projection do not establish 3D capture.

Use a clear-side attachment, low relative speed and modest load, then release outward before the long swing. A successful short trial can constrain loaded response; reserve later observations or a later attempt for checking it. Do not require an intentional snap or death to fit numbers. A very short low-load trial may leave damping/inertia confounded; show the unresolved covariance rather than certify the full swing.

### Acquisition, adoption and forecast

S2's hardware proposal controls actual sensing rates, power, sigma, valid load ranges, latch feedback and storage. Request a burst recording mode spanning aim, capture, loaded motion and release, retaining the pre-event buffer when recording was enabled. It cannot reconstruct an interval never acquired. Camera pointing competes with navigation coverage; load/encoder telemetry is useful in optical occlusion but cannot show unsensed arms.

**Recommendation:** known unilateral tether mechanics and rigid-body exchange belong in the initial equipment model; fit stiffness, damping, payout/brake response and observable structure inertia/spin from data. Selecting equipment is not adopting a new universe rule. P5 still governs actual fictional extensions, and P4 confidence still depends on acquired/validated gravity evidence. See [model-addendum.md](model-addendum.md) for fits, horizons, event branches and held-out checks.

The forecast evaluates only the player's current inputs or explicitly authored capture/brake/release sequence. Before capture, show the free-motion result and a separately labelled conditional captured branch if supported. While taut, zero main thrust means continuing tethered motion, not free coast. With no release command, the line remains attached in the forecast. After a measured release, forecast free motion from the measured release state and any modeled release impulse uncertainty. Never choose a pad, compute a best release, fire when aligned, rank plans or retime a saved procedure.

### Operating sequence and readiness

| Phase | Player work | Observable readiness / consequence |
|---|---|---|
| Prepare in transit | Inspect current ship, compare old evidence, choose likely pad/exit, allocate sensing/recording, configure brake and deploy or stow equipment | Current hardware limits and resource traces; prior procedure mismatch is visible |
| Survey | Track several distinguishable features; change viewpoint if necessary; measure axis/phase and outgoing corridor | Feature coverage, timestamped ranges, rate covariance; unresolved scale/axis remains visible |
| Approach in 3D | Fly yaw/pitch and translation, match local pad velocity, keep line and hull clear | Target-relative longitudinal and transverse motion, whole-ship clearance, approach/capture forecast horizon |
| Arm and capture | Arm, then fire explicitly at the chosen feature; confirm actual latch indication | Command acknowledgement is not capture confirmation; a miss leaves no fabricated tension |
| Take load | Pay out/brake at player-selected limits while aligning the mounting load path and maintaining coverage | Tension/length trends, attitude rate, brake heat, current spin response; no autonomous load-optimized trajectory |
| Swing | Monitor coupled motion, trim only as needed, evaluate a player-chosen release time and direction | Fixed forecast against measured trail; growing covariance and narrowing clearance can justify an early abort |
| Release | Command release at the chosen instant; use cut if the mechanism requires it and hardware permits | Separate command time, acknowledgement and measured separation; neither auto-boost nor automatic retiming |
| Clear and rejoin | Track departure, correct by hand, inspect equipment and compare issued/observed tracks | Actual Stillwater corridor/reserves; no refill or automatic repair |

Readiness is advisory, not a locked checklist. It requires measured geometry sufficiently resolved for this maneuver, operable capture/release hardware, plausible full-ship and line clearance, an available abort, and control/thermal/power margin. Resource estimates use current telemetry and rating uncertainty. Report a low-confidence or physically dangerous attempt honestly but let the player attempt it. Safety protections act only as specified physical equipment controls and are logged; they are not hidden piloting.

The procedure's validity envelope includes pad identity/configuration, measured phase and spin covariance, relative position/velocity, hull deployment, line state/length, structure configuration/inertia support, ship mass/control authority, heat/charge and reserve margins. Numeric bounds come from validated harness cases, not from this nominal design alone.

## 4. Consequences and recurrence

| Outcome | Evidence and physical continuation |
|---|---|
| Successful observation | Better phase/axis estimate and a tested predicted feature arc; player can bypass without attaching |
| Successful transit | Load and spin response plus released trajectory; useful Stillwater arrival with actual remaining resources |
| Inconclusive | Gaps or ambiguous features; broad envelope, no imaginary spin/inertia update |
| Abort before capture | No tension, outward track and spent approach propellant; knowledge persists without a loss |
| Missed window | Measured pad passes the projected capture volume; later geometry may offer another opportunity, at real resource cost |
| Degraded continuation | Brake/winch damage, lost tether, hot hardware or damaged appendage carried forward; cutter use does not restore gear |
| Loss | Physical impact, overload consequences or subsequent loss of control; restart whole expedition, never at this structure |

Damage chains must be causal: excessive line load → mounting/winch/line limit → strain, payout change, permanent damage or break as S1/S2 specify; contact → affected hull/appendage; dissipated energy → brake temperature/protection; RCS saturation → continued attitude error. A line snap need not destroy the ship. A cut under load is a separation event with possible recoil and cable clearance consequences, not a guaranteed no-impulse disappearance. No random failure chance substitutes for load/condition history.

P8 keeps acquired measurements, executed commands/status, configurations, events, old issued forecasts, fit versions, adopted rules, procedures and charted leads through loss or Recall. Keep records up to loss including acquisition gaps. Rebuild belief from those records; never keep hidden seed-derived geometry as measured knowledge. World/ship physical state resets only on recurrence; a new run samples the allowed starting geometry and noise. Old records retain their own attempt's geometry. Surviving continuation does not reset anything.

P9 replay uses the original command timings. A new seed, arrival velocity, phase, ballast configuration or hot brake produces a visible mismatch; the player edits the procedure. Knowledge can eliminate the introductory experiment while leaving capture, line management, 3D clearance and release to execute. On the tenth run, a complacent player can aim at the old projected crossing, load a worn brake, hide a radiator behind the centerline, or release with yesterday's phase. None requires secret new laws, erased calibration or a forced death.

Presentation and nonverbal failure comprehension are specified in [interaction.md](interaction.md). Paired-opening transfer fields from the template are **not applicable**: this is an ordinary continuous trajectory to Stillwater, not system X.

## 5. Implementation and verification record

The integrator assigns the new encounter owner and build phase after reviewing S1–S3. S3 changes documentation/reference artifacts only. [Implementation and acceptance](implementation.md) names modules, contract requests, scope estimates, complete-route tests, no-pause checks and first-player comprehension trials. [Numerical checks](numerical-checks.md) provides reproducible kinematic/sensing examples. Neither proves a captured swing or the route playable.

Sources: the [region proposal](../../handoffs/region-proposal/README.md), [DECISIONS](../../DECISIONS.md), [3D contracts](../../../src/contracts/README.md), [S1 prompt](../../build-plan/studies/S1-tether-physics.md), [S2 prompt](../../build-plan/studies/S2-tether-hardware.md), and the reconciliation record in [README.md](README.md). `[ESTABLISHED: NASA MXER capture study]` Capture, carrying and release are distinct rendezvous/mechanism problems; NASA's proposal does not validate this ship or these numbers ([20070001536](https://ntrs.nasa.gov/citations/20070001536)).
