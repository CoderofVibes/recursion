# R04 — Crooked Ship

[ASSUMED] S4 specification preserving **Loaded Turn**. This is a deliberate maneuver drill inside a Stillwater pocket; open transit and C04 preparation remain safe under A12. It does not grant new module-installation hardware.

## 1. Compact catalogue entry

| Field | Specification |
|---|---|
| ID / display name | R04 / Crooked Ship; annotation of a trial area, not a new vessel received by the player. |
| Kind / branch | Controlled experiment; optional shared detour. |
| Question | Does this configuration still turn and fit? |
| Engineering decision | Compare supported deployment states and a bounded burn/attitude maneuver using actual mass distribution and compensation limits. |
| Success teaches | Observed turn response and footprint support a maneuver for the current surviving ship. |
| Failure teaches | Overshoot or off-axis response rejects assumed authority; abort retains the response history; recoverable actuator trips differ from damage; collision retains the first recorded lost margin. |
| Model evidence | Configuration, gauged depletion, actuator commands, attitude/rate and track measurements, condition telemetry and frozen forecasts. |
| Proceed / objective | Rejoin C05 with a measured control/clearance envelope and current reserve for a missed maneuver. |
| Optional / expiry | C04 → C05 bypasses the drill. Skip when existing evidence applies to current condition and configuration. |
| Systems / cost | D/E/S, light content reuse after 2G/3A; proposed 4C content. Moving/installing modules or new ballast would be separate unapproved work. |

## 2. Place and travel

- **Graph:** C04 → R04 → C05. R04 is a marked-by-observations maneuver pocket within Stillwater's larger region; no required return to C04. A drift corridor and tracked rocks supply references without becoming a racecourse.
- **Scene / arrival in 3D:** tracked fragments surround a roomy central volume. The ship hologram exposes estimated center of mass, body axis, engine line and appendage motion. Actual fixed equipment and consumable/deployment state determine properties; obstacle motion follows P4.
- **Per-run variation:** reference-object phases 0–360°; maneuver axis azimuth 0–360°, elevation −30–30°; observed gap offsets ±0.15 nominal gap width. Keep object masses/sizes fixed. Ship asymmetry is carried depletion, deployment or damage, never a randomly inserted fault.
- **Arrival envelope:** accept either branch or cross-transfer's actual C04 state, both supported deployment configurations, and 0.5–1.2 nominal drill-entry speed. Evaluate a healthy ship, unequal tank depletion and one degraded attitude branch. Cannot assume a spare produces an axis it lacks.
- **Timeline:** C04/open transit offers preparation for as long as the sustainable ship configuration permits; the drill becomes active only when the player flies into its bounded test volume. No HOLD during trial. Forecast an exterior escape and stop the trial before it is unavailable; all reference motion uses run epoch.
- **Transit continuity / glimmer:** a mismatched previous forecast and the current ship overlay motivate the drill. No scene boundary replenishes propellant, clears heat or corrects attitude. The rejoin is ahead toward C05.

## 3. Experiment, forecast and operation

- **Rival explanations / controlled comparison:** separate off-axis thrust, shifted mass properties and insufficient compensation. Use a short burn at one supported configuration and a coast/turn comparison; then change one deployment condition. Avoid using unmeasured true inertia as the explanation.
- **Acquisition:** existing attitude/rate, accelerometer, optical and housekeeping channels, with recording across command onset and recovery. Accelerometers report non-gravitational acceleration, not gravity. Reserve control and recorder power while actuators load their buses.
- **P5 adoption and fit:** fit supported engine/attitude calibration parameters from measurements; design-based mass estimates use gauged depletion and known configuration. Test the updated response on a separate bounded maneuver; if model support is absent, retain an empirical procedure with explicit uncertainty rather than invent a new exact estimator.
- **P6 forecast:** issue the player's burn, turn and configuration schedule; include whole-ship motion and uncertainty. Freeze the old prediction when new calibration arrives. The model never chooses a corrective configuration automatically.
- **Operating sequence:** inspect estimated geometry → reserve control → trial burn/turn → compare coast response → choose supported deployment → verify → exit. The validity envelope records propellant distribution, hardware condition, temperatures and actuator readiness.
- **Readiness / roll:** yaw/pitch maneuvers and roll-held stabilization must suffice for the main test and exit. Roll torque can be measured as an unwanted disturbance; no commanded roll target or intentional roll passage is required. If held-roll authority is exhausted, forecast the limitation instead of granting invisible control.

## 4. Consequences and recurrence

- **Outcomes / damage:** a supported response, safe transit, inconclusive calibration, aborted pulse, missed alignment or degraded exit are distinct. Actual actuator load, heat, propellant consumption and impact cause consequences; no scripted “crooked” penalty.
- **P8 persistence / Black Box:** retain measured configuration/control histories, gauges, forecasts, gaps, model changes and the procedure's start envelope. Loss/Recall restarts the entire expedition. Old control evidence persists but ages with use/damage; new geometry demands current clearance observations.
- **P9 replay:** preserve tested mass estimate, reserves, condition, temperature, start state, phase and model. Matching inputs reproduce; mismatches require player adaptation and a new issued forecast, never silent retiming.
- **Repeat experience / tenth run:** the experiment often expires, but a damaged thruster, hot actuator or depleted tank makes blindly replayed turn duration unsafe. The physical C05 approach still needs current authority.
- **Presentation:** distinguish center of mass, body axis, thrust line and measured rotation in the existing ship/flight views. Align the first response discrepancy with commands and telemetry. X is not involved.

## 5. Implementation and verification record

[ASSUMED] 4C authors the pocket after 2G mass properties/attitude and 3A depth. Model request: expose existing calibration uncertainty and unsupported attitude predictions honestly; no truth inertia imported into belief. 2D needs a measured response comparison and configuration overlay. Novel module movement is explicitly outside this content scope.

**Acceptance, not executed:** both branch arrivals and cross-orders; healthy/depleted/degraded states; bounded success/abort; roll-held saturation and whole-ship swept clearance; held-out forecast and uncertainty; replay/recurrence/frozen history; bypass after current calibration exists. Full-run reserves must account for trial burns. Separately prove the sustainable preparation state required by A12 instead of hiding depletion with a pause. No S4 flight result is claimed.
