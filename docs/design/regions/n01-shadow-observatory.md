# N01 — Shadow Observatory

[ASSUMED] Region specification for S4, preserving **Quiet Baseline** and its engineering question. A9–A13 govern recurrence, variation, controls and travel. Numbers below are authoring bounds to test, not demonstrated playability; see [expedition](../expedition.md).

## 1. Compact catalogue entry

| Field | Specification |
|---|---|
| ID / display name | N01 / Shadow Observatory; a chart annotation after observing the overhang and its sheltered sightline. |
| Kind / branch | Controlled experiment; sensing/navigation. |
| Question | Does more processing improve these observations? Separate pointing, exposure, processing and coverage. |
| Engineering decision | Steady the ship, select a supported sensor mode, reserve recording power and choose which target merits attention. |
| Success teaches | Comparable observations establish a useful sensing schedule; a steadier modest allocation can beat an expensive blurred one. |
| Failure teaches | Residuals and gaps distinguish missing sightline from poor pointing; abort retains the last usable comparison; a trip is recoverable if hardware survives; collision retains only recorded evidence. |
| Model evidence | Time-tagged bearing/range fixes, declared uncertainty, attitude/rates, mode, allocation and recorder gaps. |
| Proceed / objective | Obtain a current track adequate to fly the N02 approach with control and retreat reserves; no requirement to complete a prescribed experiment. |
| Optional / expiry | N01 is on the branch; its experiment expires once the current sensor/condition combination is characterized. Fly the broad corridor; revisit the question after damage, not the place. |
| Systems / cost | D/E/S, light content reuse; 2G motion, 3A operation and 3C sensing depth, then 4B content. No new field system. |

## 2. Place and travel

- **Graph:** C03 → N01 → N02. N01 is a pocket on the same large Lantern shoulder formation as P01, viewed from its shaded side; no shared visit requirement. The author knows the route; measured clear sightlines and the forward glimmer add its chart bearings.
- **Scene / arrival in 3D:** the overhang occupies the upper window while fragments move below and beyond it. Holographic position clouds acquire depth through observations. Gravity remains P4, with shared r₀ = 1,000 km; fixed body masses, sizes and identities are inherited from the formation definition.
- **Per-run variation:** rotate the target cluster by azimuth 0–360° and elevation −25–25° about the outgoing corridor; vary its phase 0–360° and the arrival bearing within ±20°. Target distances are 0.8–1.2 times authored nominal distances, subject to an unobstructed outgoing corridor. These are geometry changes, not changes to sensor laws or hardware.
- **Arrival envelope:** accept actual C03 state, including depleted charge, hot equipment and sensor damage. Validate 0.7–1.3 times nominal approach speed, both stowed/deployed configurations and a single surviving sensor feed. Reject an unsafe generated corridor, never reset the incoming ship to fit it.
- **Timeline:** preparation occurs in open transit before the overhang. Within N01 every screen runs at ≥1×. Stop the comparison before the measured escape margin disappears; leave through the open lateral skirt. Target motion follows run epoch, not discovery time.
- **Transit continuity / glimmer:** all clocks, stores and wear carry into N02. A flicker through the forward gap motivates a second bearing; brightness alone does not establish depth or a spatial connection.

## 3. Experiment, forecast and operation

- **Rival explanations / controlled comparison:** hold target and approximate geometry comparable; alternate supported processing levels, then repeat with a steadier attitude. A missing target cannot be restored by processing. Abort before reserve or clearance margins close; inconclusive samples remain evidence of coverage limits.
- **Acquisition:** use existing camera/star-tracker/gyro and recorder channels. Spend power on a short high-quality burst, then a comparison interval; preserve dropped samples. Mode ratings and exposure behavior come from 1C/3C, not new equipment promised here.
- **P5 adoption and fit:** automatically fit supported sensor/calibration numbers; no new law is needed. Test the resulting uncertainty on an unused target interval, including an obscured interval where no fix should appear.
- **P6 forecast:** issue and retain the player's coast/burn forecast from the measured track and uncertainty. Unsensed fragments remain unknown; a wide envelope is a reason to measure or change the plan.
- **Operating sequence:** select target → reserve bus/recorder load → yaw/pitch to steady it → acquire comparisons → prepare departure. The procedure is valid only for its recorded target range, angular rate, equipment condition and load envelope.
- **Readiness / roll:** require observed track freshness, measured turn authority and whole-ship escape clearance. Roll stays held; yaw/pitch and a different viewpoint must supply the required observation. Do not author a unique slit needing camera roll. No visit or saved-file token gates the exit.

## 4. Consequences and recurrence

- **Outcomes / damage:** usable observation and safe transit may occur separately; inconclusive trials, an aborted dwell, missed viewing window or reduced-quality continuation remain valid. A trip affects sensing/control; impact or unrecoverable power failure can end the run. No scripted blackout.
- **P8 persistence / Black Box:** loss or Recall restarts the whole expedition. Keep acquired fixes, pointing/mode history, uncertainty, gaps, commands, configurations, issued forecasts, model decisions and charted leads. The next seed changes geometry/noise; old coordinates are archival.
- **P9 replay:** retain original start state, phase, sensor condition, resource bounds and model version. Exact conditions reproduce commands; mismatches are shown for manual adaptation, never automatically retimed.
- **Repeat experience / tenth run:** skip the allocation lesson but reacquire the current target. A stale track during a confident close departure still causes collision; heat, power sharing and damaged pointing can make the former cheap mode inadequate.
- **Presentation:** 2D shows measured clouds, coverage gaps and paired fix-quality traces using theme primitives. X transfer conventions are not applicable; this is ordinary visible space.

## 5. Implementation and verification record

[ASSUMED] 4B authors N01 after 2G/3C. Request only missing measurement-quality metadata through integrator-owned contracts; `src/model/` receives measurements, never target truth. Screens need a paired quality/allocation comparison; no new renderer physics. Content and fixtures are light reuse; shared work is budgeted in the expedition dependency plan.

**Acceptance, not executed:** seeded low/high allocation plus steady/unsteady trials; no fix through occlusion; a successful and aborted departure with actual worn state; held-out residuals and immutable forecasts; deterministic replay, archive-only recurrence and a skipped repeat experiment. Record seed, commands, clearance, coverage, reserves, temperatures and damage for the complete sensing route. No S4 flight harness or playtest has been run.
