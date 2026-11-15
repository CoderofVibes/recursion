# S18 — What building the accepted gate would take

This is a request to other owners. S18 owns only its study, reference and handoff. **[ASSUMED]** Scope below combines overlapping S1/S2/S3 work rather than summing their estimates. No tether is implemented in the game by this study.

## Implementation map

| Owner / paths | Concrete work | Rough changed/new production lines [ASSUMED] |
| --- | --- | ---: |
| Integrator: `src/contracts/`, `data/ship-baseline.json` | Finite target tensor/pose; line/material/buffer/thermal/damage state; 275 kg kit; timestamped commands and measured feature/load/quality products; conditional forecast inputs | 450–700 |
| Tether physics: new `src/sim/tether/`, simulation/snapshot integration | Reciprocal 3D dynamics, true endpoint masses and mass flux, compliant buffer, finite reel/brake, event splitting, finite-contact rail/cutter/release, swept line/hull checks | 900–1500 |
| Ship owner: `src/ship/{definition,massprops,propulsion,power,thermal,condition,sensors}/`, new kit module | Inventory and live CoM; real pulsed jet allocator; trim/buffer/catcher; power and heat feedback; permanent damage; cadence-aligned instruments | 900–1400 |
| Model owner: `src/model/`, `src/blackbox/` | Independent belief-only coupled propagator, target feature fit, configuration alternatives and Izz observability, mechanical arc filtering, player-sequence forecasts, frozen evidence and tests | 1800–2800 |
| Game/content: `src/game/`, new `src/content/borrowed-spin/` | Source-to-measurement bridge, clear-span geometry, fixed layout selection, authored route/bypass, continuous surviving-state transfer and replay | 500–900 |
| 2D: `src/console/encounters/borrowed-spin/`, `src/view3d/`, ship inspection | Manual aim/trim/brake/release; measured geometry, load and margins; uncertain alternatives; retained damage and recorded comparisons | 700–1100 |

**[ASSUMED]** Total **5,250–8,400 production lines**, plus roughly **1,800–3,000 test/harness lines**, excluding art, general wrapping, structural finite-element work and performance tuning. This is a substantial mechanics and forecasting feature, not just a new region definition.

## Contract and model seams

**[ASSUMED]** Keep nominal hardware in the shared ship definition. Target selected layout, actual strength, true poses, unobserved contacts and cable material states stay in truth. `Asteroid` and a stateless acceleration field do not supply a reacting rigid body; add the proper type. Model, Black Box and screens continue to obey P11 and may not import `src/sim/` or truth contracts.

Commands need arm/disarm, fire, manual launcher trim, requested reel rate and bounded brake setting, release, and cut. Record receipt, scheduled execution, actual execution and observed outcome separately. A one-second public command grid is sufficient for the long candidate turn if its uncertainty is shown; actuator latency and physical contact still need resolved substeps. The reference's deliberate event at 400 s is an **execution time**, not a promise of instantaneous command response. Add timing-error/latency tests, not an automatically chosen release time.

The shared mechanical output must include same-tick impulse, torque, energy/heat and peak load, plus sensor acquisitions at their actual times. The current previous-interval `specificForce` convention cannot turn a single 1 s snapshot into fifty independent samples. Do not call the entire power/thermal/recorder step at every microstep and multiply costs or RNG draws. Give high-rate instruments their own acquisition schedule.

Engine-off tether force is non-gravitational specific force. Exclude supported/suspected mechanical arcs from gravity and engine-only calibration using commands, load/contact evidence and residuals; never pass a perfect hidden attached mask to the estimator. Keep old measurements available for later mechanical fits.

Forecast the player's chosen approach, trim, hold/slip/reel and release. Preserve capture/miss, slack/taut and failed-disconnect alternatives. End unsupported local clearance or contact forecasts, while allowing a separate supported free-coast branch. No exact tensor appears because the player selected a layout name. Configuration recognition, uncertainty, observed torque and archived compatible calibrations determine the forecast.

## Screens and operating consequences

**[ASSUMED]** Use existing theme primitives. FLIGHT needs two-view rail-relative geometry, measured radial/transverse speed, whole-ship silhouette, measured line angle, tension history, buffer travel, remaining material, local temperature, RCS margin and release/cut access. SHIP shows the added load path and its actual CoM offset, independent power branch, cartridge and jammed deployment. The camera's commanded look and ship's thrust/body/velocity directions remain distinct.

CONSOLE/Black Box compares the original issued trajectory to acquired motion; load and spin-response traces share actual timestamps. Configuration labels carry confidence and provenance. Show a poor inertia fit or unknown absolute scale explicitly. Do not narrate an unseen break cause or render an exact slack-rope shape from endpoints alone.

No panel, model fit or archive inspection pauses an encounter (A12). Preview emits no control commands (P6). Learning can make a procedure reliable; new phase and actual damage/clearance still require execution. Normal prepared disconnection and a destructive loaded abort are separate mechanism states, not two animations of the same reset.

## Acceptance required before calling it built

1. **Independent port:** reproduce the JSON ship/target states, tension, heat, recoil energy and event time in TypeScript without importing the Python implementation. Proposed acceptance: positions 0.02 m, velocities 0.0001 m/s, load 5 N, quaternion angle 0.00001 rad, body rate 0.00001 rad/s, relative target angular momentum 10⁻⁸. Require refinement and ledger closure as well as state matching.
2. **Real control:** replace continuous duties with the actual minimum-bit allocator, consumed RCS mass and moving CoM. Test missing pods, hot hardware and both full/empty main states. With no RCS remaining, propagate real rotation and outages; do not grant held roll or secret torque. Keep no-input stable transit behavior intact.
3. **Capture:** simulate launched finite head/line, drag and pickup, moving ship fairlead, trim limits, latch dwell and 60 J contact capacity. Sweep relative speed/phase/lighting. The backward ballistic screen is only an initial candidate, not guaranteed capture.
4. **Structure and clearance:** provide a finite-stiffness load path capable of the proposed rail load, or measure and model its motion. Check target arms/modules, 3D hull, deployed radiators, line and released material throughout the swing. The reference has no collision solver. Unsupported wrapping never becomes a decorative pass-through.
5. **Payout and heat:** implement actual achieved spool motion under 3 kW input/4 kW friction-power limits, finite inventory and brake temperature. Close electrical, mechanical and thermal ledgers, including capstan/slider inertia and line mass flux. Test jam, spool end, loss of motor power, sensor loss and essential decoder loss. Power loss must not create a perfect servo.
6. **Failure:** port the weakened-line event and its half-step timing; resolve/bound line waves and captive-return impacts. Prove the 4 kJ containment requirement at the specified working length. Retain crushed cartridge, broken line, isolated branch and deployed envelope through transit and JSON reload. Reset commands do not repair them; recurrence does. Add material-driven remote break and actual appendage strikes without a universal automatic-death rule.
7. **Observability and P11:** passive scale ambiguity stays broad; tangential-pull Izz fit uses recorded geometry/load/phase and a distinct pre-pull arc. Test scale bias, occlusion, missing load, phase aliases and layout misclassification. Held-out records cannot train the fit. Truth-mutation tests hold acquired records constant and require identical forecasts and displayed beliefs.
8. **Timing/replay:** same command stream, seed and saved substep state reproduce exactly. Test break and command ties, delayed/no-op repeated release, mid-capture JSON restart and frame-rate/warp invariance. Mechanical event refinement does not fabricate observations between recorder samples.
9. **Route and play:** pair direct and tether routes to the same Stillwater state; include approach/correction/braking and kit penalty. Run each shipped seed, new observations versus stale procedure, injured/hot arrivals, both branch histories, survivor abort and successful no-death runs. Demonstrate controls/telemetry and full-route reserve in a human playtest. None has been established by S18.

## Remaining decisions, one at a time through the integrator

Do not re-ask A15 Q11–Q19. They already authorize the bounded prototype, conditional starting kit, one cassette, rail capture, no wrapping, active payout/brake, variable fixed-mass layouts, survivable damage and known-equipment fitting.

1. **Accept this lower-speed load-gate result?** Recommend yes: 17.2 m/s directional change below 3.5 kN, while keeping the 8 kN system limit. This replaces the incompatible S1 fast trajectory; it does not promise its 76 m/s vector change.
2. **Adopt the 20 kg buffer/catcher/trim addition?** Recommend yes, for 275 kg installed and 6.924 m/s ideal main Δv penalty. Do not keep the 255 kg headline while adding unbudgeted recoil protection.
3. **Adopt these exact three layouts as the first content set?** Recommend yes, retaining observable geometry and the optional forced-response trial. Their ordinary swing differences are small; use phase and actual execution for the main challenge instead of increasing inertia contrast secretly.
4. **Accept a permanently deployed damaged mast as the controlled-abort consequence?** Recommend yes, together with crushed cartridge, unusable cassette and isolated tether branch. Additional ship damage must follow real contact; the 30 m containment assumption is not approval of survivable 500 m cuts.

The integrator records accepted choices in `docs/DECISIONS.md`, assigns a tether owner, and updates S3's provisional scale/ship/sensing assumptions. Until that happens these remain S18 recommendations.
