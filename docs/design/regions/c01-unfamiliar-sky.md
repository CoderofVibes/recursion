# C01 — Unfamiliar Sky

Earlier catalogue: **Arrival Watch**. [ASSUMED] Authoring proposal under [the expedition](../expedition.md); [A8–A12 and P4–P11](../../DECISIONS.md) govern. All ranges below are candidate content ranges, not demonstrated flight envelopes. The template's old planar instruction is superseded by A11.

## 1. Compact catalogue entry

| Field | Specification |
|---|---|
| ID / display name | C01 / Unfamiliar Sky; a player chart label after the first observations. |
| Kind / branch | Controlled experiment; shared arrival. |
| Question | Can tracking distinguish a coast from a small burn? |
| Engineering decision | Point the existing camera, allocate recording and choose a bounded burn while retaining attitude control. |
| Success teaches | A coast and a powered interval support a usable tracking/propulsion baseline without a loss. |
| Failure teaches | Missing fixes identify coverage failure; powered residuals suggest calibration; an aborted trial preserves evidence without claiming its cause is known. |
| Model evidence | Recorded fixes, uncertainties, attitude, commanded thrust, configuration and power history. |
| Proceed / objective | Depart toward C02 with a currently tracked approach and sufficient measured control/abort margin; no mandatory trial or saved procedure. |
| Optional / expiry | The experiment expires with relevant evidence. The departure is still flown; changed equipment or stale tracking can justify a new check. |
| Systems / cost | D/E/S, light content reuse; 2G motion, 2B ship and 2C model foundations. No new physics. |

## 2. Place and travel

- **Graph:** expedition start → C01 → C02. C01 is the broad arrival/preparation pocket V00 outside Twin Deeps, not a second planetary system. Bearings reveal C02; the author graph is not a prefilled player map. The player can coast away from the local test before returning to the outbound approach.
- **Scene and 3D arrival:** a distant limb below and fragments above/aside make depth ambiguous. A lateral translation turns one apparent star into a nearby tracked fragment. Use the same normalized inverse-2.5 attraction for all relevant objects [FICTIONAL: P4]; there is no special tutorial gravity.
- **Per-run variation:** rotate the fixed landmark arrangement in azimuth by −20°…+20° and elevation by −10°…+10°; choose fragment orbital phase over 0°…360° and inclination within ±12° of its authored orbit. Arrival offset is bounded to ±5% of the fixed preparation-pocket radius in each transverse coordinate. Masses, radii, law and outgoing connection stay fixed; reject unsafe seeds.
- **Arrival envelope:** recurrence supplies the same physical ship baseline with the seeded arrival geometry. Support yaw/pitch offsets within ±15° of the approach, zero commanded roll and the full approved baseline configuration range. Later drift is simulated, not clamped back into this envelope.
- **Timeline and continuity:** phase comes from the run seed and ship clock. Leaving the clear preparation volume toward nearby debris marks commitment, not opening FLIGHT. All views run at ≥1× inside an encounter. Transit must offer A12's indefinite preparation through a feasible steady power/thermal state; proving that state is a build dependency, not permission to drain reserves while the player thinks. No refill or hidden timer reset.
- **Glimmer / roll:** the limb's changing bearing and observed parallax identify Twin Deeps. Yaw/pitch and lateral motion expose it; replacing the proposal's roll-dependent viewing with these controls is intentional.

## 3. Experiment, forecast and operation

- **Rivals / comparison:** compare engine-off tracking against a short player-selected burn at similar range. Distinguish untracked depth, pointing loss and powered calibration mismatch; this single interval cannot establish a new gravity law. Cut off and coast while clear if the measurement or thermal margin degrades.
- **Acquisition:** use the existing optical camera, attitude telemetry and recorder; a candidate comparison records at least 3 distinct fixes before, during and after thrust, with time tags and uncertainties. This sampling count is an experiment target, not an unlock. Poor allocation/pointing creates recorded gaps.
- **P5 / P6:** the model may fit numerical ship calibration and tracked motion; rules require a player choice and independent held-out data. Issue a frozen forecast for the player's coast/burn plan. Unsensed obstacles remain absent, and stale tracking widens uncertainty.
- **Operation / readiness:** reserve camera/recorder power, stabilize by yaw/pitch, observe, burn, cut off, observe again, then choose departure. Use actual 1C equipment and surviving thermal/control margins. Readiness is a measured envelope for both departure and cutoff/coast escape, never a trial-completion flag.

## 4. Consequences and recurrence

- **Outcomes / damage:** useful baseline, inconclusive comparison, safe cutoff, delayed departure, degraded sensing or collision are distinct. There is no finite departure window to miss; any later opportunity follows moving geometry. Ordinary impacts/overload can damage real components; no scripted starter failure.
- **Black Box / P8:** keep every acquired comparison, issued forecast, commands, configuration, uncertainty and data gap through loss. Loss or Recall restarts the whole expedition and resets physical state; the archive, adopted rules, procedures and chart persist. No local checkpoint.
- **P9 / tenth run:** refresh current bearings even with a learned law. Replaying a departure requires matching pose, velocity, configuration, condition, resources, model version, coverage and phase; expose differences, never retime automatically. Experts can skip the long experiment but still steer the ship into a new debris arrangement.
- **Presentation:** show measured parallax, forecast/trail disagreement and recorder gaps on existing 2D-owned instruments. No omniscient tutorial labels. X behavior is not applicable here.

## 5. Implementation and verification record

[ASSUMED] Proposed owner: 2F/content integration after 2G, with 2D screens and 3D recurrence. Request seed/briefing identity and transit preparation-state contracts through the integrator. No new hardware or independent roll control is required.

Acceptance: reproduce success and informative cutoff for extreme arrival seeds, depleted post-test states and missed camera coverage; check full-ship clearance, propellant/charge, heat and condition; repeat identical commands exactly; preserve issued forecasts after refit; exercise a zero-loss departure and a learned-procedure mismatch. A whole-route run must include this departure cost. **No new gameplay test or playability result has been executed for this page.**
