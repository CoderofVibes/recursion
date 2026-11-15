# R02 — Hinge

S4 proposal on the [encounter template](../encounter-template.md); formerly **Boundary Drill**. Authored geometry and trial choices are **[ASSUMED]**. **[FICTIONAL]** W reverses radial propulsion locally. A near-zero radial response band is conditional on S5/owner adoption of a smooth transition; it is not a settled rule.

## 1. Compact catalogue entry

| Field | Design |
|---|---|
| ID / display name | R02 / Hinge; optional annotation at a measured Well Garden boundary. |
| Kind / branch | Controlled experiment; optional power/thermal detour. |
| Question | Which side of the well boundary contains each burn? |
| Engineering decision | Use short boundary-bracketing burns with retained transverse motion; select cutoff from current measured approach state. |
| Success teaches | Bounded trials support state-conditioned timing through the measured transition. |
| Failure teaches | A response mismatch exposes boundary or timing uncertainty; a prompt coast/abort can preserve evidence. Blindly repeating the burn can carry the ship into collision. |
| Model evidence | Recorded attitude, commands, accelerometer observations, optical tracks, inferred boundary intervals, condition and forecast residuals. |
| Proceed / objective | Exit onward to P04 with a bounded boundary estimate and usable control reserve, or abandon the test on a tracked exterior line. |
| Optional / expiry | Direct P03 → P04 skips this pocket. Its value expires when timing is supported for the present approach/configuration; changed velocity or damaged control may justify it again. |
| Systems / cost | D/E/S/W; light content after S5 and 3B. No new field law and no overlap interaction. |

## 2. Place and travel

- **Graph / volume:** P03 → R02 → P04. Hinge is an outgoing pocket within Well Garden, not a new well system or a return loop. It remains reachable after either P02 → P03 or N03 → P03. Chart the narrow rocky landmark and outgoing corridor through actual tracking.
- **Scene / arrival in 3D:** A narrow ridge lies above and beyond the ship while isolated rocks supply lateral/depth references. The influence boundary is optically invisible; its instrument shell begins broad. With a smooth profile, a near-radial burn can consume propellant with little radial response while the ship continues coasting; with a sharp profile the observed lesson is a rapid sign change instead.
- **Per-run variation:** Keep the selected well's profile, influence radius R, transition width (if any) and landmark mass/radius fixed. Vary entry angle 15–45° from the local tangent, approach azimuth ±25°, and elevation ±20°; move the observable rock phase through 0–360°. Candidate bracketing sample locations span 0.9R–1.1R. These are trial targets the player may choose, not ship teleports or a truth-supplied boundary.
- **Arrival envelope:** Candidate local speed 5–25 m/s after P03; no reset from a faster or damaged incoming ship. An exterior correction coast permits slowing or skipping the experiment. Preserve the actual heat, charge, control faults, fuel and configuration from either branch order. Roll held with yaw/pitch alignment is sufficient; full appendage sweep must clear the ridge.
- **Timeline / continuity:** Geometry advances from the run epoch. Outside the pocket, safe transit permits preparation; once crossing the well boundary, every screen operates in real time. Keep a measured tangent exit and cutoff reserve. There is no repeated trial reset; another observation starts from the actual changed state. Onward P04 inherits all state.
- **Glimmer:** Track residuals near the ridge suggest a localized transition worth measuring; no luminous true boundary is revealed by merely approaching the pocket.

## 3. Experiment, forecast and operation

- **Rivals / comparison:** Compare uncertain boundary location, thrust calibration error and inadequate control authority. Acquire coast and matched commanded radial/tangential trials on measured sides of the inferred boundary, retaining transverse momentum. Abort when boundary uncertainty intersects the safe exit. A null response is evidence only with adequate measurement quality and actual powered telemetry.
- **Acquisition:** Existing camera, inertial measurements and recorder establish motion and non-gravitational response. Supply control and tracking together; exact allocations depend on current condition/1C ratings. Do not turn commanded thrust into delivered-force truth or fill dropout intervals.
- **P5 / P6:** Refit numeric boundary/response parameters in the adopted W family; if unadopted, the player may enable it and test against an independent retained attempt. Never let this pocket invent a smooth law automatically. Forecasts disclose unsupported transition behavior, preserve issued paths and accept player-authored burn/cutoff timing.
- **Sequence / readiness:** Measure exit and local response, choose a bounded pulse, preserve coast escape, compare evidence, then pass or abandon. Needed margin is current boundary confidence plus tracking, full-ship clearance and control/thermal/propellant reserve. An evidence or visit flag never substitutes for physical feasibility.

## 4. Consequences and recurrence

- **Outcomes / damage:** Supported boundary estimate, inconclusive pulse, exterior abort, missed timing, degraded onward flight and collision/loss leave distinguishable records. The well does not impose damage directly; unwanted acceleration and exhausted control produce contact or equipment stress. X is absent.
- **Black Box / P8:** Retain pulse/cutoff commands, attitude/configuration, actual measurements and gaps, boundary fits/tests and original forecasts. Loss/Recall restarts the whole expedition at C01 with a new seed; physical trial state resets, acquired evidence and adopted W rule remain.
- **P9 / tenth run:** Skip the detailed drill when the current boundary is well observed. New approach velocity and worn thrusters still require a cutoff chosen from present state; a memorized duration can exit into ordinary response too early. Save pose, phase, response support, equipment condition, resources, coverage and model version; mismatches require manual adaptation.
- **Presentation:** Align commands and measured response with a belief-derived boundary shell; show uncertainty through existing 2D primitives. No explanatory caption announces a “neutral zone.”

## 5. Implementation and verification record

Proposed owner: 4A content after 3B/S5, with 2C local-response fitting and 2D comparisons. Approximately 60–140 content/data lines and 100–180 harness assertions. Request a profile-version field in recorded assumptions if S5 allows multiple families; freeze the production law across runs. No smooth boundary is committed by S4.

Acceptance, not executed: a nondamaging bracketing success and informative abort; sharp/smooth authored variant review before choosing one; both branch-order arrivals including lattice damage; extrema of entry speed/angle with roll held; independent W forecast and no truth leakage; deterministic replay, state continuity and whole-run Recall; direct skip after expiry; full branch reserve ledger. Report inferred boundary uncertainty, whole-ship clearance, authority, tracking, resources, heat and condition. No W transition behavior or playability is demonstrated here.
