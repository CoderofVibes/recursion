# P02 — Sunward

S4 proposal on the [encounter template](../encounter-template.md); formerly **Radiator Turn**. All authored ranges, timings and readiness targets are **[ASSUMED]**. Ordinary orientation/cooling mechanisms follow [ESTABLISHED: S01, S02, S11] as catalogued in the [engineering couplings](../../engineering/gameplay-couplings.md). No route is demonstrated.

## 1. Compact catalogue entry

| Field | Design |
|---|---|
| ID / display name | P02 / Sunward; name available after observing the lit formation. |
| Kind / branch | Controlled experiment and flight; power/thermal. |
| Question | Can cooling and useful pointing coexist? |
| Engineering decision | Choose yaw/pitch, permitted array/radiator deployment and activity duty cycle while retaining a track of the exit. |
| Success teaches | A bounded orientation comparison finds an affordable generation/cooling/sensing sequence. |
| Failure teaches | Rising temperature after useful charging identifies limited dwell; tracking loss identifies incompatible pointing. Abort can teach without damage. |
| Model evidence | Measured illumination, solar output, attitude, deployment state, loads, temperature histories, tracked limb and exit uncertainty. |
| Proceed / objective | Traverse the lit approach toward P03 with sustainable operating intervals and clearance for the entire deployed ship. |
| Optional / expiry | The experiment is skippable when supported for current configuration and condition; the transfer remains. Optional P02 → R01 → P03 investigates delayed heat. |
| Systems / cost | D/E/S; medium choreography, with 3A pointing/thermal depth and 2D display. No paired opening: sunlight comes around an ordinary body limb. |

## 2. Place and travel

- **Graph / volume:** P01 → P02 → P03, or P02 → R01 → P03. Sunward is a distinct authored volume; R01 is its thermal pocket. P04 later occupies its far-side sector, not a required repeat visit to this node. Tracking the limb and outbound rocks charts these leads; the authored graph is not automatically visible.
- **Scene / arrival in 3D:** A large limb rises across one side while overlapping silhouettes lie above and below the approach. Sunlight is visible on surfaces, the arrays and room wall, never as a beam in empty vacuum. A3's body-shadow cylinder supplies the buildable illumination geometry. Decorative slabs do not cast gameplay shadows unless a separate occlusion implementation is approved.
- **Per-run variation:** Body masses/radii, solar brightness, heat coefficients and nominal clear gap stay fixed. Change the approach azimuth around the body by ±30°, elevation by ±20°, and orbital phase through 0–360°. Sample the incoming chord's distance from the fixed shadow edge over 0.8–1.2 times its nominal authored offset, rejecting paths without a roll-held feasible exit. Geometry alters illumination duration; do not randomize a thermal law or a hidden timer.
- **Arrival envelope:** Candidate relative speed 10–40 m/s and heading within 30° of the approach axis; all physical state arrives unchanged. Hot/low-charge states may need the exterior illuminated preparation coast, not a granted refill. Measure incident light before assuming generation. The prototype must cover fully deployed and stowed arrivals plus a degraded radiator.
- **Timeline / continuity:** The open incoming coast is safe preparation; the lit limb approach is a live encounter. Orbital phase advances from the run epoch while every screen is open. Before narrowing geometry, a tracked exterior arc permits abort; after commitment, delayed stow and control reserves matter. No scene transition resets heat, charge or motion.
- **Glimmer:** A measured bright edge beyond the body indicates the next trajectory corridor; an apparent small opening is ordinary geometry here, leaving X independent of this branch.

## 3. Experiment, forecast and operation

- **Rivals / controlled comparison:** Separate increased internal load, altered illumination and poorer radiator exposure. Hold workload approximately constant while comparing two yaw/pitch attitudes; then compare a permitted deployment at one attitude. Stop before measured temperature trend consumes the cooling/abort margin. A negative result narrows viable orientations.
- **Acquisition:** Existing camera, output/temperature telemetry and recorder compete for bus power. Retain actual exposure and pointing intervals, not a true sun vector. Sample through the post-load response using supported telemetry cadence/storage.
- **P5 / P6:** Fit numerical load and thermal response against a separate interval; no new law is required. Predict only from measured illumination and existing ship assumptions, with uncertainty beyond tested durations. Freeze each issued plan, including its configuration and power schedule; missing occlusion geometry remains unknown.
- **Sequence / readiness:** Track the exit, select a yaw/pitch attitude, deploy within clearance, perform the comparison, then choose a sustained or alternating operating sequence. Readiness is measured control/tracking, a bounded thermal trend and reserves through exit and abort; not possession of P01 evidence.
- **Roll dependency:** Replace the proposal's “roll starts charging” moment with a yaw/pitch turn plus supported deployment. Do not assume gimbals beyond 1C. A narrow attitude that requires independent roll is excluded from mandatory routes; optional manual-roll optimization awaits owner approval and 2G control support.

## 4. Consequences and recurrence

- **Outcomes / damage:** Useful thermal comparison, successful transit, unresolved illumination, early abort, missed favorable limb phase, hot degraded continuation and loss are distinguishable in telemetry. Overheating affects actual components; contact damages the struck geometry. No X behavior applies.
- **Black Box / P8:** Preserve measured illumination, configuration and load commands, temperature/output traces, coverage gaps, forecasts and abort/exit tracks. Loss/Recall resets the whole expedition at C01; observations, rules, procedures and chart survive with their original geometry.
- **P9 / tenth run:** Thermal limits stay learned, but current phase, incoming heat and worn cooling equipment require fresh measurements. A practiced player shortens the comparison; stale attitude or deployment timing can still overheat or strike the limb debris. Saved procedures include pose, phase, temperatures, condition, coverage and model version; mismatches require manual adaptation.
- **Presentation:** Couple the sensed 3D sun/limb relationship to ship temperatures and output trends. Current and recorded traces distinguish a useful charge from an unsustainable dwell without explanatory prose.

## 5. Implementation and verification record

Proposed owner: 4A after 2G/3A, with 2D instruments. Approximately 120–240 content/data lines and 100–200 harness assertions; shared thermal/pointing work is additional. Request an explicit sensor-derived illumination estimate and continuous deployment geometry. Mesh/slab occlusion is optional new work, not implied by this page.

Acceptance, not executed: roll-held hot/low-charge and degraded-radiator successes; an informative pre-damage abort; held-out thermal response and stale-light uncertainty; extrema of the phase/approach ranges; complete branch reserve accounting; no pause in any view; deterministic saves/replay and whole-run Recall; optional R01 skipped when evidence applies. Report full-ship clearance, temperature peaks, tracking quality and fuel/energy/condition. No playability or duration is demonstrated.
