# C02 — Twin Deeps

Earlier catalogue: **Gravity Range**. [ASSUMED] Proposed 3D content under [the expedition](../expedition.md); fixed values follow [P16, A6 and A10](../../DECISIONS.md). Numeric variation ranges are candidates awaiting the 2G/2F harness.

## 1. Compact catalogue entry

| Field | Specification |
|---|---|
| ID / display name | C02 / Twin Deeps; recognizable after both bodies are tracked. |
| Kind / branch | Combined flight, observation and experiment; shared. |
| Question | Is the two-mass asteroid field wrong in mass, distance law or omitted second-body influence? |
| Engineering decision | Spend tracking time at distinct distances, compare coast/powered arcs, then plan and fly a Beta assist through its belt. |
| Success teaches | A rule that fits one arc predicts an independent arc; tracked belt asteroids can probe close-pass distances without sacrificing the ship. |
| Failure teaches | A mass adjustment that fixes one range but spoils another is evidence of structural error; powered-only residuals still admit engine error. |
| Model evidence | Time-tagged ship/body/asteroid fixes, viewing geometry, thrust commands, attitude, calibration and frozen forecasts. |
| Proceed / objective | Fly past moving Beta, traverse its orbiting asteroid belt, then satisfy the measured departure-distance/speed objective. A6 requires the assist; no direct C01→C03 bypass. |
| Optional / expiry | Supported investigations may be skipped; the physical assist and belt remain. A02 is optional only after the required Beta/belt departure. |
| Systems / cost | D/E/S, medium content; 2G/2F own Gravity range work. No new well/lattice/X physics. |

## 2. Place and travel

- **Graph:** C01 → C02 → C03, or C02 → A02 → C03 after the same exit. C02 is distinct authored volume V01. A broad outer observation skirt supports aborted approach/replanning without resetting the world. The chart earns exits from observations, not completion counts.
- **Scene and 3D arrival:** Alpha above/forward, Beta below/starboard; inclined tracks occupy depth around them. [FICTIONAL: P4] `a = (GM/r₀²)(r₀/r)^2.5`, with shared `r₀ = 1,000 km`. Hold **GM Alpha = 1×10¹⁰ m³/s², GM Beta = 2.5×10⁹ m³/s², collision radii = 250/160 km and binary separation = 4,000 km** fixed across seeds. These are P16's current authored constants, not universal physical measurements. Any later tuning changes the content version, never secretly a run seed.
- **Per-run variation:** binary phase 0°…360°; rotate its whole orbital plane by up to 20° from the authored reference; asteroid phases 0°…360° and inclinations −12°…+12° relative to their authored belt plane; arrival bearing ±15° and transverse offset ±5% of the nominal safe-arrival radius. Do not vary mass ratio, body size or binary separation. Rotate associated positions/velocities coherently; never randomize velocities independently into invalid orbits.
- **Arrival envelope:** actual C01 departure carries through. Generate a safe approach corridor around the supported arrival, not a replacement ship. Test approved stowed/deployed configurations, damaged but controllable states, and the admitted velocity envelope from 2F's assist study. Absolute speed/closest-approach limits remain 2F validation work; the quoted A6 close flyby is not a safe recipe.
- **Timeline / continuity:** seed plus run time determines phase; observations do not restart it. Local commitment occurs when the chosen burn removes the measured escape margin. Observation skirts are not stable equilibrium parking points. Prepare before entry; all planning, fitting and view changes inside remain live at ≥1×, with fixed-step resources and no refill.
- **Glimmer / roll:** the belt's observed departure corridor reveals C03/A02. Yaw/pitch and lateral translation suffice; inclination is not a requirement for player-commanded roll.

## 3. Experiment, forecast and operation

- **Rivals / comparison:** mass-only, wrong distance exponent, missing Beta contribution and propulsion bias predict different near/far, coast/burn and body-pointing residuals. Observe two distance bands and an independent arc; keep Beta contributions in the fit. Abort a dive early while still outside the measured unsafe envelope.
- **Acquisition:** optical tracking supplies gravity evidence; accelerometers measure non-gravitational acceleration. Allocate camera, recorder and control power together. Candidate datasets include ≥2 radial bands and ≥1 held-out trajectory; sufficiency is statistical, never a count gate. Track asteroids at the intended flyby distances rather than assuming inherited support covers them.
- **P5 / P6:** fit masses/calibrations automatically, retain radial support, and let the player enable the distance-law family. Validate on an independent recorded arc in a different AttemptId under the current contract. The [S4 register](../../studies/S4/README.md) requests continuous same-run experiment record boundaries for zero-loss local adoption; a second interval of the same record is not currently held-out evidence. Manual learning does not require adoption. Shared-law validated spans transfer under A5, but current body/asteroid state still needs tracking. Forecast only the player's plan, ending/widening outside support; preserve the originally issued prediction.
- **Operation / readiness:** gather evidence, fit/test, reserve power and cooling, point/burn, coast past Beta, track the belt and correct. Readiness comprises forecast full-hull/appendage clearance, flyby timing, control authority and departure/abort reserves. The game must not require an extension flag if a player physically succeeds with another evidence-supported method.

## 4. Consequences and recurrence

- **Outcomes / damage:** successful experiment, correct assist, safe broad miss, inconclusive fit, missed belt opportunity, survivable impact or loss each retain measured evidence. Ordinary collision/control/resource consequences apply; no artificial failure for choosing the wrong law.
- **Black Box / P8:** preserve fixes, sensor gaps, commands, arrival briefing, actual configuration and frozen forecasts through loss. Loss/Recall restarts C01 with a new run seed; physical state resets while all acquired records, adopted rules, procedures and chart survive.
- **P9 / tenth run:** knowing the exponent enables a cheaper route but does not refresh asteroid phase or perform the assist. Compare saved start state, model, resources, condition, coverage and phase; never replay yesterday's coordinates as current geometry or silently adapt burns.
- **Presentation:** measured tracks peel from frozen forecasts in 3D; a separate-range residual view exposes competing explanations. X transfer behavior is not applicable.

## 5. Implementation and verification record

Proposed build: 2G converts, 2F reconciles the belt/assist, 2C supports multi-body tracking, 2D displays belief, 3E verifies. Request a physical Beta-assist/belt objective witness in game-side truth evaluation, exposed only through sensed events; a generic distance/speed gate alone must not accidentally award a powered bypass. Request seeded geometry plus recorded run/briefing identity. No new physics is authorized.

Acceptance: test safe learning/abort, both inclination extremes, learned and Newtonian approaches, full-ship belt clearance, a complete route's main/RCS budget, stale tracking, forecast immutability, deterministic replay and recurrence retention. Report actual assist departure speed and minimum clearance, not only visit flags. Existing 2F studies establish useful inputs; **this changed 3D seeded belt route has not been demonstrated by S4**.
