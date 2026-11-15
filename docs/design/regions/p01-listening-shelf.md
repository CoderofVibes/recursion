# P01 — Listening Shelf

S4 proposal on the [encounter template](../encounter-template.md); formerly **Load Step**. All scene, range, pacing and acceptance choices below are **[ASSUMED]**. A9–A13 govern resets, geometry, 3D flight and time. This page does not establish playability.

## 1. Compact catalogue entry

| Field | Design |
|---|---|
| ID / display name | P01 / Listening Shelf; a chart annotation after the broad face is observed. |
| Kind / branch | Controlled experiment; power/thermal. |
| Question | Which simultaneous loads compromise control? |
| Engineering decision | Sequence camera processing, deployment and discretionary loads across the actual protected buses; shed demand before deliberately resetting a trip. |
| Success teaches | A bounded load comparison maintains tracking and control; total charge alone does not establish available branch power. |
| Failure teaches | A recoverable trip leaves current and command history plus observation gaps; an abort establishes an unsuitable sequence. Continued blind flight can cause collision or loss, without a scripted blackout. |
| Model evidence | Acquired bus current, voltage, charge, protection state, equipment draw, pointing and measurement cadence with their timestamps and missing intervals. |
| Proceed / objective | Leave toward P02 with a player-chosen load sequence that sustains tracking and attitude control. Equivalent evidence counts; no required overload or saved procedure. |
| Optional / expiry | The power route passes this shoulder, but its experiment expires once the current bus/configuration combination is characterized. New damage or changed simultaneous loads can reopen it. |
| Systems / cost | D/E/S, light content. Uses 2G flight, 2B protection and recorder, 3A operating depth; no W/L/X. |

## 2. Place and travel

- **Graph and volume:** C03 → P01 → P02. This is a pocket on the Lantern formation's power-facing shoulder, sharing the large formation with N01 but not requiring passage through it. Ordinary tracking of the lit limb charts the onward route; there is no C03 → C04 shortcut. A player may retreat to the incoming clear approach before entering the shoulder.
- **Scene / arrival in 3D:** A broad face hangs above the window while fragments move at distinct depths below and beyond its edge. The instrument map loses freshness when processing loses power; optical reality does not switch off. Use the same P4 gravity law for every moving object.
- **Per-run variation:** Keep formation mass, radius, electrical ratings and landmark identity fixed. Rotate the outgoing bearing by ±25° azimuth and ±15° elevation relative to its authored nominal; change fragment orbital phase through 0–360° and inclinations within ±10°. Move the experiment pocket laterally by up to 0.10 of the fixed formation radius, rejecting collisions and blocked exits. These are coupled geometry samples, not independent promises of feasibility.
- **Arrival envelope:** Carry actual fuel, charge, temperature, damage and configuration. Candidate local relative speed is 5–25 m/s, with incoming heading within a 30° cone around the clear shoulder approach. Arrivals outside that envelope receive an honest forecast and an exterior correction route, never velocity clamping or restoration. Roll is held; yaw/pitch and deployment suffice for the broad corridor.
- **Timeline / continuity:** Geometry advances from the run epoch. Clear open transit before entry permits preparation; entering the shoulder commits to moving debris and bus workload in real time. All console and ship views continue time; alerts return warp to 1×. Abort by shedding loads and following the previously tracked clear exit. The fixed-step ship continues through both boundaries with no repair/refill.
- **Glimmer:** Repeated reflected flashes beyond the shoulder suggest Sunward, but require camera coverage and a second bearing to distinguish distant illumination from a nearby reflector.

## 3. Experiment, forecast and operation

- **Rival explanations / comparison:** Low state of charge, branch overload and pointing loss can all interrupt a track. Hold geometry and attitude approximately comparable; first run one discretionary load, then add another, then shed it. Abort before current/temperature limits or clearance uncertainty are exhausted. A no-trip comparison is useful evidence too.
- **Acquisition:** Reserve the existing recorder feed and enough camera processing for approach/abort observations. Use existing telemetry cadence and finite storage; no invisible samples fill a trip gap. The exact safe allocation depends on 1C ratings and measured condition.
- **P5 / P6:** Fit observed load/response numbers only within supported equipment states; no new physics extension is required. Check the sequence against a separate recorded interval. Freeze the issued trajectory and resource assumptions; unsupported future load or obstruction states stay uncertain. The model never sequences loads for the player.
- **Operating sequence / readiness:** Track the exit, reduce competing demand, perform a short comparison, recover protection if needed, then depart. A usable measured exit, stable bus supply, whole-ship clearance and enough control/energy for abort define readiness. Inadequate evidence warns rather than locks the route.

## 4. Consequences and recurrence

- **Outcomes / damage:** Supported comparison, inconclusive dropout, deliberate abort, missed viewing interval, degraded onward flight and loss are distinct recorder outcomes. Protection can trip without damage; sustained thermal/electrical faults change the affected component's condition. X transfer behavior is not applicable.
- **Black Box / P8:** Keep commands, allocation/configuration changes, telemetry, protection events, measurements and gaps, original forecasts, departure state estimate and lead observations. Loss or Recall restarts at C01 with a new run seed; retained records, adopted rules and procedures survive, physical state does not.
- **P9 / tenth run:** Skip the resolved load experiment, but refresh current exit tracks and check the actual damaged bus. Stored procedures retain start pose, phase, condition, charge/heat, allocations and model version. Different geometry is a visible mismatch requiring player adaptation; never silently retime commands. A hurried all-on departure can still lose tracking while moving debris crosses the path.
- **Presentation:** Show branch-current and protection histories beside the existing 3D ship selection and measured stale tracks. Use 2D's theme primitives; no explanation banner announces the lesson.

## 5. Implementation and verification record

Proposed owner: 4A after 2G/3A, with 2D screens and 3D state continuity. Budget approximately 80–160 content/data lines plus 80–160 harness assertions, excluding shared ship/UI work. Request measured protection history and record-gap presentation if absent; no truth-backed overload diagnosis. Confirm current protection and thermal ratings with 1C/3A.

Acceptance, not executed: a no-damage trip/recovery and a no-trip success; weak-charge and damaged-bus arrivals; varied geometry with roll held; a complete C03–P04 route ledger; held-out response prediction with frozen forecasts; deterministic seed/replay and whole-run Recall; expired experiment skipped with equivalent evidence. Record minimum full-ship clearance, tracking gaps, charge/propellant, temperature and condition. A12's safe-transit steady operating point must be demonstrated separately. No simulation or playtest has been run for this page.
