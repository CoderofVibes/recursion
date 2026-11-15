# A02 — Tidal Orchard

S4 proposal on the [encounter template](../encounter-template.md); new optional coupling, **not approved for implementation**. Geometry, test ranges and play-value thresholds are **[ASSUMED]**. **[FICTIONAL]** Distributed attraction must use the same P4 inverse-2.5 law as translation; its new attitude consequence is not a separate magical force.

## 1. Compact catalogue entry

| Field | Design |
|---|---|
| ID / display name | A02 / Tidal Orchard; an optional chart annotation supported by observed landmarks. |
| Kind / branch | Controlled investigation; optional shared arrival-side detour. |
| Question | Can changing attitude with the engine off be explained by gravity acting differently across an extended spacecraft? |
| Engineering decision | Compare supported deployed/stowed configurations and yaw/pitch orientations while tracking translation and control effort. |
| Success teaches | A controlled comparison distinguishes a configuration-dependent gravity-gradient torque from propulsion or pointing error. |
| Failure teaches | An unresolved tiny effect limits the claim; a controlled abort preserves evidence. Excess control effort or collision exposes an unsafe comparison. |
| Model evidence | Acquired attitude/rate, commanded and recorded control behavior, configuration/mass-property estimates, optical trajectories and uncertainty. |
| Proceed / objective | Reach C03 on the outgoing trajectory with a defensible attitude/control comparison and remaining reserves; an inconclusive null result is allowed. |
| Optional / expiry | C02 → C03 bypasses it after C02's required exit. It expires once torque/control behavior is supported at the current scale and configuration. |
| Systems / cost | D/E/S plus distributed gravity-gradient force/torque; medium-to-heavy new coupling, study/implementation owner unassigned. No W/L/X. |

## 2. Place and travel

- **Graph / volume:** C02 → A02 → C03. This is an exterior observation pocket of Twin Deeps, entered **only after the required slingshot past Beta through Beta's orbiting belt**. It cannot replace that exit or reconnect ahead of the belt. A02 lies along the outgoing arc; no return to C02 is required.
- **Scene / arrival in 3D:** Beta occupies one side of the view while elongated tracked fragments move above and below. The display distinguishes translation from attitude and roll-hold control effort. Fragment shapes alone do not prove ship torque; their own modeled motion must follow the same physics.
- **Per-run variation:** Reuse fixed P16 bodies: Alpha GM 1×10¹⁰ m³/s², radius 250 km; Beta GM 2.5×10⁹ m³/s², radius 160 km; shared r₀ = 1,000 km and 4,000 km binary separation. Vary binary phase 0–360°, outgoing pocket bearing ±20° azimuth/±15° elevation, and observation radius 1.05–1.30 times the fixed C02 exit-radius reference after its belt clearance. Reject samples that re-enter the belt or invalidate the C03 continuation. No mass ratio, body size or gravity strength is randomized.
- **Arrival envelope:** Accept the real C02 outgoing state; candidate comparison duration is 60–300 ship seconds on a measured, collision-free coast, not a new low-speed spawn. Track stowed/deployed and damaged-control cases. Do not slow or rotate the ship for free. A pilot may skip if the flyby exit leaves insufficient margin.
- **Timeline / continuity:** Pocket geometry advances with the same binary/run epoch as C02. The safe open connector permits preparation; entering the experiment's tracked-fragment volume resumes local operating risk without a pause option. Abort by ending the comparison and following the already measured outbound coast. Preserve all C02 fuel, condition, heat and calibration aging into C03.
- **Glimmer:** Correlated attitude/control effort across configurations suggests an investigation; no effect is announced from an unmeasured true force gradient.

## 3. Experiment, forecast and operation

- **Rivals / comparison:** Separate gravity-gradient torque from residual engine/RCS command, thruster misalignment and attitude-sensor bias. Compare engine-off coast intervals with supported configuration changes and two yaw/pitch orientations; track the bodies simultaneously. “Engine off” does not mean attitude jets are off. Roll held remains the default: measure compensating control effort, or pitch/yaw response within existing control modes, rather than secretly releasing roll.
- **Acquisition:** Record attitude/gyro observations, actuator commands/available housekeeping, camera fixes and design-derived inertia uncertainty. No new torque sensor or truth-based force readout is assumed. Data cadence must resolve the predicted effect at current noise and control authority; otherwise report an upper bound/null result.
- **P5 / P6:** New extended-body response support must be implemented separately from point-mass translation. The player proposes the family, fits identifiable parameters and validates on an independent retained attempt. Carried gravity-law evidence constrains translation; it does not automatically certify torque prediction. Freeze forecasts and disclose absent attitude modeling.
- **Sequence / readiness:** Track outbound clearance, retain sufficient control, perform a bounded configuration/pointing comparison, restore chosen deployment and depart. Whole-ship sweep, pointing and reserve support count; no experiment completion flag gates C03. No module moving/installation is introduced.

## 4. Consequences and recurrence

- **Outcomes / damage:** Supported torque/control comparison, useful null limit, inconclusive noise, early abort, missed viewing geometry, increased control use and loss have different records. Torque itself is not a scripted damage event; control saturation, excessive load or collision causes actual consequences. No X behavior applies.
- **Black Box / P8:** Keep attitude/track records, control commands, configuration changes, model assumptions/tests, original forecasts and measurement gaps. Loss/Recall resets C01 and all physical state with new seeded geometry, while evidence, procedures and chart persist. Original tracks must not become the new run's obstacle map.
- **P9 / tenth run:** Usually bypass the resolved investigation. When taken, changed outgoing geometry, deployed inertia and worn thrusters alter control reserve; fresh tracking and manual configuration timing remain necessary. Procedures retain pose/rate, phase, configuration, condition, resources, coverage and model version. Mismatches require adaptation rather than automatic replay correction.
- **Presentation:** Compare measured attitude/control traces and a design-derived inertia view with explicit uncertainty. Do not exaggerate tiny physical rotation visually or invent an oscillation to create drama.

## 5. Implementation and verification record

Proposed dependency: magnitude study under P4 and actual 1C inertia → integrator-approved distributed-force contract → 2G-compatible attitude integration/roll-hold → 2C estimate → optional content/2D display. Approximately 200–450 shared physics/ship lines, 120–300 model lines, 60–140 content/data lines and 200–400 test lines, excluding rendering; these are rough assumptions.

The effect may be too small at a useful post-belt radius. Require a predicted attitude or compensating-command signal distinguishable at current sensor quality; proposed screening is >3σ over a supported 60–300 s comparison, or a measurable control-resource consequence. If neither is achieved, defer A02; do not alter Beta's approved mass/radius or amplify gravity solely for drama. Smaller scope keeps a null-result observation exercise but loses the advertised memorable turn and should be presented honestly.

Acceptance, not executed: distributed-force sum and torque against an independent gradient reference, point-mass limit, convergence and conservation, realistic magnitude/noise/control comparison, survivable abort, roll-held deployed/stowed and degraded cases, no belt bypass, full C02–C03 reserve ledger, held-out prediction, deterministic replay and whole-run recurrence. Record full-ship clearance, tracking uncertainty, attitude/control effort, fuel/charge, heat and condition. No perceptible tidal effect or route is demonstrated here.
