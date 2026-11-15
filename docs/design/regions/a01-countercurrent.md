# A01 — Countercurrent

S4 proposal on the [encounter template](../encounter-template.md); new optional system, **not approved for implementation**. All geometry, observability and play-value choices are **[ASSUMED]**. Gas drag/loading/heating would be new game physics; preserving ordinary mechanisms does not make this content-only work.

## 1. Compact catalogue entry

| Field | Design |
|---|---|
| ID / display name | A01 / Countercurrent; charted from actual observations, not supplied by the route graph. |
| Kind / branch | Combined flight and experiment; optional power-side braking detour. |
| Question | Does saved propulsion outweigh detour, attitude-control and thermal costs? |
| Engineering decision | Choose sampled flow chord, entry velocity, yaw/pitch and supported deployment; compare net reserve after control and cooling costs. |
| Success teaches | A bounded pass supports a braking benefit for the measured relative-flow and ship configuration. |
| Failure teaches | Excess correction or heat can erase main-engine savings; an early low-density exit or failed hypothesis is useful evidence. |
| Model evidence | Acquired translational/attitude tracks, accelerometer response, commands, configuration, temperatures and observations that actually constrain flow. |
| Proceed / objective | Reach C04 with a measured, affordable exit state; no fixed propellant reward is granted for entering gas. |
| Optional / expiry | P04 → C04 bypasses it. Skip once its benefit is resolved for current state or cannot beat the direct route. Damage and different entry geometry may change the answer. |
| Systems / cost | D/E/S plus proposed gas acceleration, distributed load/torque and heating; heavy new work with an owner yet to be assigned. No W/L/X. |

## 2. Place and travel

- **Graph / volume:** P04 → A01 → C04; a distinct optional authored volume downstream of the eclipse sector. The direct P04 → C04 transfer remains valid. The lead must be observed before charting; its presence never reveals a hidden density field.
- **Scene / arrival in 3D:** A dark moon lies below and a tenuous streamer extends above and behind. Visible scattering requires a supported optical assumption; if that cannot be justified, show tracked particles and unexplained motion residuals instead. The hologram initially contains only measured tracks and unmodeled acceleration, not gas truth.
- **Per-run variation:** Freeze moon mass/radius and the chosen gas density/flow/heat model, intrinsic profile and material coefficients. Rotate the profile and local flow frame ±30° in azimuth and ±20° elevation; sample incoming impact parameter over 0.3–0.8 of fixed stream half-width W, and along-stream entry offset ±0.2W. These vary encounter geometry, not drag strength between runs. Reject samples without a low-density escape corridor. W and physical gas values require a separate feasibility study.
- **Arrival envelope:** Candidate gas-relative speed is 20–80 m/s for feasibility exploration, not a promise of useful drag. Carry the P04 ship's actual condition/heat/fuel and inertial velocity; estimate relative flow rather than changing velocity to enter the band. Outside it, skip or correct in exterior space. Full deployment and one degraded appendage are required test states.
- **Timeline / continuity:** Prepare in safe exterior transit, then knowingly enter the finite gas encounter. Flow evolves deterministically from the run epoch; no pause, scripted impulse or new trial reset. Abort toward the sampled low-density side before attitude/thermal authority is consumed. The actual exit state, including lost mass or damage if modeled, reaches C04.
- **Glimmer:** A correlated streamer/particle drift and coast residual can distinguish a medium from camera error only with repeat observations and suitable coverage.

## 3. Experiment, forecast and operation

- **Rivals / comparison:** Distinguish gas loading, gravity-model error, residual thrust and attitude bias. Compare engine-off shallow passes and two supported orientations, observing both translation and rotation. An ordinary accelerometer can sense non-gravitational force; it cannot independently identify density, drag coefficient and gas velocity from one pass.
- **Acquisition:** Use existing tracking, attitude, temperatures and recorded commands. New gas sensors are not silently installed. If optical tracer velocity cannot be acquired, fit an effective acceleration response with unresolved parameter ambiguity; do not display a definitive density/flow map. Data acquisition still costs bus power/recording.
- **P5 / P6:** A player-selected drag/empirical-response family requires new belief-side modeling and an independent held-out attempt. Fit only identifiable parameters; retain wide uncertainty when flow is ambiguous. Forecast the player's chord/configuration and freeze it; an unsupported gas field means the forecast ends or states its limitation, not a true drag trajectory.
- **Sequence / readiness:** Survey shallow boundary, compare small effects, estimate exit/control reserve, select configuration, commit or skip. Whole-ship distributed loading, thermal limits and roll-hold authority must be included. Yaw/pitch can expose a supported face; mandatory roll-specific sail trim is excluded. If usable braking needs manual roll, defer that route pending owner choice.

## 4. Consequences and recurrence

- **Outcomes / damage:** Useful affordable braking, measurable but uneconomic drag, inconclusive trial, early escape, missed exit, degraded continuation and loss remain distinct. Distributed force/heat acts on actual components, and torque is derived from forces; no universal “gas damage” counter. X does not apply.
- **Black Box / P8:** Preserve acquired coast/attitude/temperature traces, configurations, commands, original forecasts, fit ambiguities and exit estimates. Whole-expedition loss/Recall resets physical state at C01; archive, adopted response family, procedures and chart survive with original run geometry.
- **P9 / tenth run:** A familiar broadside pass can still exceed current roll-hold or cooling authority with a damaged appendage. Refresh relative flow and entry state; compare total main/RCS/energy cost instead of trusting last run's savings. Procedures retain phase, flow support, configuration/condition, resource bounds and model version; no automatic retiming.
- **Presentation:** Show measured unexplained acceleration, attitude correction effort and temperature histories before any gas reconstruction. 2D owns new display vocabulary and theme integration.

## 5. Implementation and verification record

Proposed dependency: optional physics study → integrator-approved gas contracts → distributed force/torque/heat → belief-side estimator → content and 2D instruments. Rough shared cost: 500–1,000 physics/ship lines, 250–500 model lines, 100–200 content/data lines and 300–600 test lines, all order-of-magnitude assumptions excluding polish. Current additive-acceleration fields alone do not supply distributed torque/heat.

Before approval, demonstrate that the actual density, speed and area produce a meaningful measured braking effect; if negligible, omit or redesign the optional region rather than amplify it secretly. Require energy/momentum/heat accounting, convergence, matched no-gas reference, observability and held-out prediction, benign abort, roll-held damaged arrivals, geometry extrema, total reserve advantage against direct P04 → C04, deterministic replay/recurrence, and a full-run ledger. Report clearance, force/torque, tracking, propellant/charge, thermal peaks and condition. No gas model, benefit or playable pass is demonstrated here.
