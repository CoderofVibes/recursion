# R01 — Red Wall

S4 proposal on the [encounter template](../encounter-template.md); formerly **Heat Soak**. Authored values and acceptance criteria are **[ASSUMED]**. [ESTABLISHED: S02, S09, S10, S11] support finite thermal storage/transport, as used in the [engineering couplings](../../engineering/gameplay-couplings.md). No new radiative environment is implied.

## 1. Compact catalogue entry

| Field | Design |
|---|---|
| ID / display name | R01 / Red Wall; an optional chart annotation after observing the surface. |
| Kind / branch | Controlled experiment; optional power/thermal detour. |
| Question | Was the cooling test too short? |
| Engineering decision | Extend a bounded load interval, then observe the cooldown; choose pump mode, radiator deployment and duty cycle. |
| Success teaches | A sufficiently long recorded comparison supports duration; stopping the load need not stop a component's temperature rise immediately. |
| Failure teaches | An early abort exposes a persistent rising trend; a short flat trace is inconclusive. Continuing past limits may damage the particular component. |
| Model evidence | Recorded load, current, temperature, configuration, pump state, illumination and timestamps through both heating and cooldown. |
| Proceed / objective | Rejoin P03 with a player-selected duty cycle and enough thermal/control reserve for transit; a conservative abort also completes the useful investigation. |
| Optional / expiry | P02 → P03 bypasses it. It expires when duration is supported for current cooling capacity; changed condition, configuration or incoming heat reopens the question. |
| Systems / cost | D/E/S; light content using 3A thermal transport/delays. No W/L/X and no compulsory radiation model. |

## 2. Place and travel

- **Graph / volume:** P02 → R01 → P03. A Sunward pocket offset from the direct exit, rejoining farther ahead; it is not an out-and-back room. An exterior approach permits abandoning the test before the local moving-rock corridor. Chart it from observed surface bearings and a measured forward exit.
- **Scene / arrival in 3D:** A warm-lit face fills one side of the window while cold-looking darkness extends above and below. The ship hologram shows different component temperatures responding at different rates. Surface color is a landmark, not proof of incident infrared heating; adding a hot-body radiation field would require separately approved physics/data.
- **Per-run variation:** Keep the parent body's mass/radius, thermal network and surface identity fixed. Vary pocket bearing ±20° in azimuth and ±15° in elevation, and outgoing fragment phases through 0–360°. Its offset from the direct P02–P03 corridor varies over 0.8–1.2 of the fixed nominal offset, with a tracked forward escape required. Arrival temperature/condition varies through play, not reseeding.
- **Arrival envelope:** Candidate local speed 5–20 m/s with a 30° incoming direction cone; real stowed/deployed and hot/damaged arrivals are supported as tests, not repaired. Select a test workload below measured component headroom. Roll held, yaw/pitch plus supported radiator motion suffice; no mandatory roll optimization.
- **Timeline / continuity:** Safe open transit allows preparation before entering the pocket. Inside, the thermal experiment and all menus run at ≥1×; there is no artificial “wait for result” freeze. Run-epoch geometry continues while the player monitors trends. Cut the discretionary load and take the measured exit before cooling or clearance reserve is lost; the cooldown continues into P03 unchanged.
- **Glimmer:** Temperature histories suggesting delayed response make the warm face worth investigating; the map only adds a place after its position is observed, not because a tutorial step is due.

## 3. Experiment, forecast and operation

- **Rivals / comparison:** Distinguish stored heat, rising external input and declining transport. Hold pointing and configuration approximately constant while extending a previously short load, then cut it and retain the cooldown. Compare measured illumination and pump status before attributing lag. Abort on an unsafe trend; a contradictory trace is still evidence.
- **Acquisition:** Existing thermal/power housekeeping and camera observations use the actual recorder cadence and finite capacity. Reserve enough recording duration for cooldown; dropping late samples must leave a visible gap. No direct access to hidden thermal-node truth is allowed.
- **P5 / P6:** Estimate numeric response/duration only for supported operating states; no new rule family is required. Test against a separate retained heating/cooling interval. Forecast the player's duty cycle using measured initial temperatures and uncertainty; do not claim thermal projections if the implemented model lacks them. Preserve every issued forecast.
- **Sequence / readiness:** Track exit, configure cooling, schedule a bounded load, observe through cutoff, then choose sustained or intermittent operation and depart. Current measurements, clearance, control authority and thermal reserve define readiness, not a mandatory successful test flag. Equal evidence from P02/P04 or a previous run counts.

## 4. Consequences and recurrence

- **Outcomes / damage:** Supported endurance estimate, inconclusive short trace, conservative abort, missed exit opportunity, warm degraded continuation and loss remain distinct. Excess temperatures affect the corresponding equipment and cooling path; no scripted damage occurs for refusing the experiment. X behavior is not applicable.
- **Black Box / P8:** Keep commands, equipment telemetry, configuration, illumination measurements, forecast versions and heating/cooldown gaps through the last acquired sample. A loss or Recall restarts C01 with new geometry; retained records, rules, leads and procedures persist with their original conditions.
- **P9 / tenth run:** Usually skip the resolved experiment. If chosen with a worn radiator or warmer ship, adapt duration and departure timing rather than replaying an old dwell blindly. Save initial heat/charge/condition, pose, phase, workload, coverage and model version; exact replay needs matching conditions. Ordinary moving geometry and finite cooling still punish inattention.
- **Presentation:** Overlay component-specific load/cutoff/temperature histories with the current 3D deployment; the rising trace after cutoff provides the lesson without narration.

## 5. Implementation and verification record

Proposed owner: 4A after 3A thermal depth, plus 2D history controls. Approximately 60–140 content/data lines and 80–160 harness assertions. Request temperature-history and supported-duration projections if absent. Confirm network time constants and pump/radiator conditions with 1C/3A; no invented post-cutoff rise if the actual network does not produce it.

Acceptance, not executed: a useful nondamaging long test and early abort; hot/degraded arrivals; a held-out cooldown; continuous heat across P02/R01/P03; geometry extrema and roll-held escape; deterministic record/replay and whole-run Recall; direct bypass after expiry; full branch resource margins. Record peak temperatures, lag, tracked clearance, control, propellant/charge and component condition. No thermal effect or route is demonstrated here.
