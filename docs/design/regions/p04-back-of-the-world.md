# P04 — Back of the World

S4 proposal on the [encounter template](../encounter-template.md); formerly **Night Coast**. Authored values and acceptance criteria are **[ASSUMED]**. [ESTABLISHED: S01, S02] motivate finite electrical storage and heat rejection; equipment values remain the 1C/3A assumptions.

## 1. Compact catalogue entry

| Field | Design |
|---|---|
| ID / display name | P04 / Back of the World; name inferred from the observed eclipse sector. |
| Kind / branch | Combined operation and flight; power/thermal. |
| Question | Does the load/cooling sequence survive a long transfer? |
| Engineering decision | Choose eclipse chord, load/recording schedule, deployment and exit burn while reserving tracking/control supply. |
| Success teaches | Full-duration measured margins support endurance, beyond a short successful P01/P02 test. |
| Failure teaches | Late depletion or delayed heating distinguishes duration error from a failed component; an early exit can preserve evidence without loss. |
| Model evidence | Time histories of measured generation, charge, loads, temperatures, condition, pointing and tracked exit geometry. |
| Proceed / objective | Reach C04, directly or via optional A01, with observations and control through eclipse exit and onward reserves. |
| Optional / expiry | Duration experiment expires for matching state; the chosen branch still crosses this sector. A longer illuminated exterior chord is a physical alternative within P04, not a node-skipping free ride. |
| Systems / cost | D/E/S, light content after 3A. A01 adds separate proposed gas physics; base P04 needs none. |

## 2. Place and travel

- **Graph / volume:** P03 or R02 → P04 → C04, optionally P04 → A01 → C04. This is a distinct hazardous sector on Sunward's far side within the same authored celestial volume. It does not require revisiting P02 or taking a branch-return loop. The bright exit and camera tracks chart C04; A01 is charted only from its observed lead.
- **Scene / arrival in 3D:** A dark body blocks one side of the window; fragments at different elevations occult stars, and a narrow sunlit limb lies off the velocity vector. Holographic tracks widen as observations become sparse. Use A3's body shadow; there is no magical region switch that turns solar generation off.
- **Per-run variation:** Keep the body mass/radius, distant sun and electrical/thermal laws fixed. Sample eclipse impact parameter over 0.35–0.75 of the fixed shadow-cylinder radius; orbital phase 0–360°; incoming elevation ±20° and exit azimuth ±25° around nominal. Reject chords that remove both early abort and the authored forward exit. Duration follows motion and geometry, never a randomized countdown.
- **Arrival envelope:** Proposed speed through the sector is 15–50 m/s, heading within a 30° approach cone; actual charge/heat/condition/fuel are inherited from either direct P03 or R02. Low reserves may make the darker chord unsuitable. The player can select the longer illuminated route from the exterior approach; no state is clamped to a “sufficient” value.
- **Timeline / continuity:** Explicitly enter P04's eclipse encounter from safe open transit; the hazardous low-generation segment is not A12's indefinitely safe preparation space. Predict the shadow interval before entry. Inside, time advances through all views, and new alerts drop warp to 1×. Abort to the measured limb while still within control reserve. Both exits keep all resources, condition, phase and velocity.
- **Glimmer:** A measured illuminated band locates the forward exit. A dim streamer may suggest A01 only if gas/scattering observations are supported; absent that system the direct C04 lead remains.

## 3. Experiment, forecast and operation

- **Rivals / comparison:** Compare a measured short operating interval to the complete chosen shadow chord. Separate underestimated duration, excess load, declining supply and cooling lag. Reduce one discretionary load while recording current/temperature response; abort before remaining supply cannot support the exit. A successful illuminated alternative is valid engineering.
- **Acquisition:** Retain power/temperature telemetry through the entire coast at the baseline recorder cadence; use deliberate camera windows rather than a hidden perfect exit position. Data and processing consume the same buses as control. Missing low-power observations remain gaps.
- **P5 / P6:** Numerical endurance estimates use actual load/charge and observed shadow geometry; no new rule is required. Check the predicted trend against a later held-out interval. Freeze player-issued power, sensing and burn assumptions with the forecast; uncertain exit timing widens the resource and trajectory envelope. Never optimize the route automatically.
- **Sequence / readiness:** Survey the exit before eclipse, budget essential demand plus abort, configure cooling, then commit and watch measured reserves. Use yaw/pitch and supported deployment with roll held; the broad limb exit must fit the entire ship. Readiness comes from measured duration/control and reserve margins, not prior completion of P01 or P02.

## 4. Consequences and recurrence

- **Outcomes / damage:** Successful duration test/transit, uncertain exit, early illuminated abort, missed best phase, reduced-capability arrival and loss are distinct. Low supply can shed loads before damage; heat or lost control affects actual equipment and collisions. No universal eclipse damage or X transfer applies.
- **Black Box / P8:** Preserve generation/load/thermal histories, pointing and recording changes, forecasts, observed shadow transitions and exit commands through loss. Loss/Recall restarts all physical state at C01; model evidence, procedures and chart persist with the original run briefing.
- **P9 / tenth run:** Skip repeated experiments when valid, but refresh the eclipse chord and current damaged-ship load. A known schedule can still exhaust charge if the pilot takes a longer path or keeps expensive tracking active. Replay includes geometry/phase, arrival heat/charge/condition, allocations and model version; mismatches require adaptation.
- **Presentation:** Show a time-aligned charge/heat history beside tracked exit uncertainty; the quiet window must not imply that simulation is paused. All styling belongs to 2D.

## 5. Implementation and verification record

Proposed owner: 4A after 3A and 3D continuity, with 2D instruments. Approximately 80–160 content/data lines and 100–200 harness assertions. Request duration-sensitive resource forecasts if the current model supports only trajectories; mark unsupported projections meanwhile. Confirm 1C generation, storage and thermal delay parameters; keep safe transit separate from the finite eclipse budget.

Acceptance, not executed: direct and R02 arrivals, weak-charge and hot/failed-radiator states, a full-duration success and informative early abort, long illuminated alternative, held-out reserve trend, phase/geometry extrema, roll-held clearance, continuous onward C04/A01 state, deterministic replay and whole-expedition Recall. Complete branch ledgers must retain homeward margins. No resource capacity, eclipse duration or route is demonstrated by this page.
