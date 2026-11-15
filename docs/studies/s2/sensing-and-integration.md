# S2 — Sensing, commands and implementation boundary

**Status: [ASSUMED] proposal for the integrator and owner.** This is an implementation specification, not implemented flight software or a demonstrated encounter. The hardware, mode budgets and command durations are in [hardware.md](hardware.md). The terms below are fully three-dimensional; the inherited planar ship internals are not a valid tether implementation.

## Recommendation

**[ASSUMED]** Fit a local load cell, a separate payout measuring wheel/encoder, brake and motor temperature sensors, ship-side position switches, and a small camera looking along the fairlead. Keep the existing IMUs and navigation camera. Present tension, payout, line direction, stale data and disagreement as evidence. Do not present the simulated attachment, remaining strength or target inertia as measured facts.

**[ESTABLISHED: project P7; S04, DD05, DD07 in the project bibliography]** Specific force, optical tracking and attitude are different measurements. **[ASSUMED]** A spring-launched passive grapple on a nonconductive rope has no powered remote telemetry link. A visible latch witness and a gentle proof load can support an attachment hypothesis. They cannot prove the whole abandoned structure will carry the next load. A load cell cannot distinguish a good rail capture from a snag by itself.

**[ASSUMED]** The sensor package draws up to **30 W from payload/main-b**; the local control/command electronics draw **35 W from essential**. These are included in the kit budget, not additional instruments charged a second time. A payload outage therefore removes line sensing even if the essential decoder still accepts release/cut. The spring brake retains its physical preset without either bus; an unpowered controller gains no ideal tension knowledge.

## Measurements and noise

All selected rates, sigmas, biases, ranges and gates in this section are **[ASSUMED]** engineering/play values, not flight instrument specifications. Independent white errors use named seeded streams under `src/lib/`; persistent biases and scale errors belong to saved truth state and remain correlated between observations. Reported uncertainty comes from the nominal instrument model and believed condition, never hidden damage.

| Instrument | Acquired quantity and model | Nominal white noise and acquisition ceiling | Limits and interpretation |
|---|---|---|---|
| Fairlead load cell | `zT = (1+sT) T + bT + eT`, N; T is the force along the local exiting line | Internal generative white noise `20 + 0.005 abs(T)` N at 50 Hz; reported nominal sigma `20 + 0.005 abs(zT)` N; initial calibration priors `bT = 0 ±20 N`, `sT = 0 ±0.01` | 0–20,000 N physical input range. Signed electronic samples near zero remain signed; do not truncate negative noise into a positive mean. Sensor overrange is flagged, not emitted as an exact 20 kN load. This is local fairlead force, not guaranteed equal to remote head force during a transient. |
| Independent payout wheel | `zL = (1+sL) L0 + bL + eL`, m; `L0` is unstretched material paid through the wheel | 0.01 m at 20 Hz; initial `bL = 0 ±0.02 m`, `sL = 0 ±0.001` | Does not read straight-line distance. Compare wheel counts with drum rotation/level-wind position to detect slipping or a jam; neither mechanism identifies hidden contact by itself. Counts survive an ordinary reboot; a lost counter produces an unknown offset, not zero metres of line. |
| Fairlead camera | Two local image-plane angles `u = atan(nx/nz)` and `v = atan(ny/nz)` about the dorsal optical axis; `n = normalize(tan(u), tan(v), 1)` in its calibrated camera frame | 0.002 rad per angle at up to 5 Hz; initial fixed alignment bias 0 ±0.002 rad per angle | 40° half-field, 35° allowed mechanical exit cone; 0.01 s nominal exposure, reject blur above 0.005 rad. Needs illumination, resolved line contrast, clear sightline and calibration. A short illuminated section near the fairlead does not reveal the whole rope. |
| Brake/motor thermistors | Local cold-plate/drum temperatures, K | 1 K at 2 Hz; initial bias 0 ±1 K | Separate temperatures are needed: a cool ship service node cannot certify a cool slipping brake. Dropout preserves the last reading with its age. |
| Local position switches | Launcher cocked, fairlead gate open/closed, cutter fired, cassette retained | 10 Hz status/change events, deterministic nominal logic | A switch reports its own mechanism. A cutter-fired switch does not prove a jammed blade severed the rope. A ship-side gate-open switch does not prove a distal grapple opened. Contradictory switches produce a fault. |
| Existing IMUs | Body-frame nongravitational specific force plus gyro rate | Retain the baseline 50 Hz ceiling and proposed `0.0001 m/s²` acceleration sigma, `0.00005 m/s²` bias scale | For a 30.6 t ship, 6 kN produces approximately 0.196 m/s², easily detectable; nominal IMU white noise is about 3 N equivalent force. Uncertainty in mass, thruster contribution, attitude and local rotational acceleration limits the inferred load well before that white-noise floor. |
| Existing navigation camera and star trackers | Tracked structure features, optical bearings, attitude and derived relative motion | Existing power, exposure, cadence and condition gates apply | Estimate a feature's 3D motion from multiple views; retain ambiguity and covariance. No exact target mass, spin axis, rail location or attachment-point velocity is supplied by content to the belief side. A size prior is a shared scale uncertainty, not fresh independent range noise at every fix. |

The two fairlead camera angles intentionally use the camera's dorsal axis, not inertial azimuth/elevation. **[ASSUMED]** They can be two scalar `telemetry` channels; calibration specifies the camera-to-body rotation. This avoids the azimuth singularity when the line points along body +z. Do not misuse the existing `bearing` kind: that kind means an inertial direction from ship COM to a target centre. A visible rail feature needs its own sensed feature ID and estimated geometry before producing that kind of observation.

**[ASSUMED]** Published noise increases with reduced power and *reported* condition using the same bounded pattern as existing sensors: `sigma = sigma_nominal * (1 + 3(1-cReported)) / sqrt(p)`, for powered fraction `p >= 0.5`; below the acquisition threshold the instrument returns no new sample. For tension, `sigma_nominal` is calculated from the observable signed load-cell reading `zT`, not the exact simulated tension. Thus sigma cannot serve as a second channel encoding hidden T. The physical noise generator may use the actual input and hidden damage, while its published estimate uses only the nominal model and observations. Camera cadence is `5p` Hz, electrical gauges their rated cadence times `p`, each capped by recorder cadence. Saturation and insufficient light are validity failures rather than an opportunity for extra power to produce a perfect sample. Hidden damage may make true errors larger than the published sigma; residual disagreement should expose that.

**[ASSUMED: screening geometry and inherited instrument limits]** Optical tracking can be the limiting resource during a swing. An ideal 30,612 kg point ship circling a fixed point at 500 m with 6 kN centripetal load has `v = sqrt(Tr/M) = 9.90 m/s` and `omega = v/r = 0.0198 rad/s`. If the hull follows that rotation, it exceeds the baseline star tracker's 0.01 rad/s rate limit. The navigation camera's 0.005 s minimum exposure and 0.0001 rad smear limit correspond to only about 0.02 rad/s apparent image motion. Thus this screening case puts even the shortest camera exposure near its motion limit; a separately stabilized target can have different image motion. It is not a prediction of S1's moving, finite-inertia target. S3 must evaluate actual measured viewing geometry and possible outages rather than assuming uninterrupted star fixes and navigation images. Local line-camera readings and IMUs remain useful if powered and within their own gates; gyro-carried attitude uncertainty grows through a star-tracker outage.

**[DEMONSTRATED: reference.py; ASSUMED: fixed-point screening geometry]** The current hands-on rate request also caps at 0.01 rad/s (`HANDS_ON_TURN_RATE`); it cannot directly request the screening case's 0.0198 rad/s follow rate. At 500 m, 0.01 rad/s corresponds to about **1,531 N**, or at 6 kN it requires about **1,960 m** circular radius. These are not universal limits for S1's moving attachment, but they expose a real integration constraint: validate the actual rotation/control sequence, including held roll, saturation and reacquisition. Do not silently raise RCS authority, change the hands-on limit or assume automatic tracking while the player commands another attitude. The hardware's 6 kN nominal rating is not a minimum operating load; a 1–1.5 kN clear-span trial may be the first demonstrable case.

### What the accelerometer actually sees

**[ESTABLISHED: project P7; S04]** A freely falling accelerometer does not directly measure gravity. **[ASSUMED]** For the kit, the COM specific force is

```text
fCOM_body = (Fthrusters_body + Fmechanical_body + Fother_contact_body) / Mship
Fmechanical_body approximately Tlocal n_body in a steady, fixed-payout span
```

where the definition of `Mship` excludes deployed nonrigid line and detached head as specified in the hardware/dynamics split. `Fmechanical` is the complete hull reaction from S1's coupled mechanical solver, including the momentum carried by material entering/leaving the reel and launch/release transients; substituting `Tlocal n` during every transient would omit those terms. The local IMU reads that value plus `alpha × rIMU + omega × (omega × rIMU)` and instrument errors. Either generate the local reading then correct it with estimated lever arm/rates, or retain the baseline's COM-corrected convention and propagate correction uncertainty. Do not add a gravity vector to the accelerometer. Use equal and opposite mechanical forces in the dynamics, not a fictitious thrust command that consumes propellant.

**[ASSUMED]** A thrust-off interval with tension is not a coast for force identification. The present estimator specification §2.2 uses accelerometers only during commanded burns. A tether extension must explicitly use tension-bearing intervals and must prevent their residuals being absorbed into a body's gravity calibration or an engine scale. Before the extension exists, the belief-side adapter excludes potentially loaded arcs using executed tether commands, sensed contacts/load evidence and unexplained nongravitational residuals. It never receives a truth-only `attached` or `unsupported` flag. End a prospective free-flight forecast at the earliest planned tether interaction it cannot model, and a current forecast when sensed evidence/residuals make free flight unsupported; unknown interaction time gets an uncertain horizon. A silent snag may initially remain undiagnosed, so residual detection and uncertainty are essential rather than a hidden perfect exclusion mask.

**[ASSUMED]** For a straight static line, loaded length is approximately `L = L0 (1 + T/EA)`. The 500 m, `EA = 1,000,000 N` line at 6 kN extends **3 m**. That exceeds the centimetre encoder noise by orders of magnitude and must matter in the model. With slack, wrapping or transverse motion, payout plus that correction is still not the endpoint separation. A snag can create multiple tension directions and invalidate the single-span model. These are model boundaries, not corrections from hidden truth.

### Example retained packet

**[ASSUMED]** This is an illustrative noisy packet in the existing `Measurement` shape, not a generated test vector. The values are intentionally different from a nominal 6,000 N, 100 m, near-dorsal case. The retained packet contains observations and reported sigmas only; biases are parameters fitted across samples, not sent as truths.

```json
[
  {"kind":"telemetry","t":12.0,"source":"tether-sensors","channel":"tether-sensors.tension","value":[6042.0],"sigma":[50.21]},
  {"kind":"telemetry","t":12.0,"source":"tether-sensors","channel":"tether-sensors.payout","value":[100.128],"sigma":[0.01]},
  {"kind":"telemetry","t":12.0,"source":"tether-sensors","channel":"tether-sensors.image-u","value":[0.0113],"sigma":[0.002]},
  {"kind":"telemetry","t":12.0,"source":"tether-sensors","channel":"tether-sensors.image-v","value":[-0.0058],"sigma":[0.002]},
  {"kind":"telemetry","t":12.0,"source":"tether-sensors","channel":"tether-brake.temperature","value":[305.4],"sigma":[1.0]},
  {"kind":"accel","t":12.0,"source":"imu-a","value":[0.00209,-0.00102,0.19596],"sigma":[0.0001,0.0001,0.0001]}
]
```

**[ASSUMED]** The actual sample cadence is the minimum of instrument cadence, powered acquisition cadence, recorder capacity and the truth sample rate. A 1 s outer physics tick cannot yield fifty independently observed tension peaks from one force snapshot. Use deterministic inner samples at 0.02 s or faster when a 50 Hz record is requested, with contact events resolved more finely if S1 requires it. Finer physics alone does not imply recorded high-rate data.

**[ASSUMED]** Timestamp force samples against their real acquisition window. `src/ship/README.md` currently passes previous-interval specific force while the returned sample carries the current environment time. Pair IMU samples with the corresponding previous-interval tension average, not the newly commanded brake state. Request an optional acquisition window (`start`, `end`) for interval-averaged measurements, or make this alignment explicit in the game adapter before fitting. Instantaneous camera/encoder samples keep their own time. Never backfill a missed record or retime it to make a maneuver fit.

**[ASSUMED]** For clipped, invalid or stale data, use a separate quality record associated with `(attempt, source, channel, time)`: `overrange`, `underpowered`, `occluded`, `unresolved`, `counter-reset`, or `stale`. Do not encode invalid numbers as `NaN`, sigma zero or a huge-but-apparently-valid sample. The current contract has no quality metadata; the requested contract addition below is explicit. Until then, omit the numeric sample and retain a sensed `equipment-fault` event with the channel/reason. A stale display shows the original reading and original time; it creates no new `Measurement`.

## Belief about the line

**[ASSUMED]** Keep physical states and inferred states separate:

| Available evidence | Permitted display/model statement | Not established by that evidence |
|---|---|---|
| Launcher switch fired; payout rising | Head launched; line paying out | Grapple met or attached to the rail |
| Near-zero tension with payout larger than observed separation | Slack probable; load below sensitivity | Entire rope is clear of all structure |
| Positive tension, IMU agreement and optical line direction | Ship is under a tether/contact load | Good attachment instead of a snag; uniform tension along the line |
| Visible latch witness plus a small sustained proof load | Attachment supported by current evidence; record proof-load maximum | Strength above the applied load; future retention under a changed angle |
| Load collapses, gate-open switch changes and ship acceleration changes | Ship-side release supported | All departing line and cassette cleared the hull |
| Cutter fired but tension persists | Cut not confirmed | Blade actually severed line |
| Camera lost; gauges still live | Local load/payout current; remote geometry uncertain | A perfectly drawn full line or exact target spin |

**[ASSUMED]** A proof load is a player-selected low-force operation, initially recommend **500 N for 2 s** after a geometrically plausible capture. It consumes real payout/brake authority, time, control power and attitude propellant when used. It validates no more than the measured load and configuration. An inferred attachment remains a hypothesis; a later unexplained direction change can reopen it.

## Wear, damage and calibration age (A5)

**[ASSUMED]** Preserve irreversible physical wear separately from model uncertainty. Abrasion reduces rope strength; heat and accumulated sliding work change brake behaviour; distorted rollers change encoder scale; a mount strike changes alignment. The physical degradation laws belong to `src/ship/condition` and the tether dynamics. Calibration age belongs to `src/model/aging.ts`. A player does not receive the exact internal damage variable merely because a condition bar exists.

Use the existing §3.7 variance-growth pattern:

```text
variance_new = variance_last
             + s_time² elapsedShipSeconds / 86400
             + s_use² measuredUse / useReference
             + sum((s_condition * reportedConditionDrop)²)
```

All added rates below are **[ASSUMED]** starting values for tuning. They widen a prior; they are not measurements of a deteriorated component.

| Calibration parameter | Initial prior | `s_time` per sqrt(day) | `s_use`, reference use | `s_condition` per condition lost |
|---|---|---|---|---|
| `sensor.tether-sensors.load-bias` | 0 ±20 N | 5 N | 10 N, 100 m wheel travel | 200 N |
| `sensor.tether-sensors.load-scale` | 1 ±0.01 | 0.001 | 0.002, 100 m wheel travel | 0.05 |
| `sensor.tether-sensors.payout-scale` | 1 ±0.001 | 0.0002 | 0.0005, 100 m wheel travel | 0.01 |
| `sensor.tether-sensors.payout-bias` | 0 ±0.02 m | 0.002 m | 0.005 m, 100 m wheel travel | 0.5 m |
| `sensor.tether-sensors.image-bias-u/v` | 0 ±0.002 rad each | 0.0002 rad | 0.0005 rad, one power cycle | 0.01 rad |
| `tether.line.stiffness-scale` | 1 ±0.10 | 0.002 | 0.01, 100 m wheel travel | 0.20 |
| `tether.brake.force-scale` | 1 ±0.05 | 0.002 | 0.01, 100 kJ estimated sliding work | 0.20 |

**[ASSUMED]** Wheel travel is accumulated absolute measured payout change after accounting for noise, or a conservative bound from executed commands when the encoder is unavailable. Estimated brake work comes from retained tension and payout velocity with their uncertainty, never the truth thermal ledger. Missing use history adds a conservative variance allowance; it cannot age the calibration by zero. Zeroing the cell while slack can constrain its bias, but cannot calibrate gain. A proof load with a calibrated IMU, known mass and negligible propulsion can constrain gain; load-cell/IMU gain and mass are correlated, so do not claim three independent calibrations from one equation.

**[ASSUMED]** A fresh calibration narrows only identified parameters. Low load cannot reveal ultimate rope strength; that remains a conservative engineering prior lowered by inspected damage/history. Estimate stiffness only from loaded length/geometry changes with enough independently observed endpoint motion; encoder readings alone cannot determine it. Rope-condition and attachment-strength uncertainties must appear in structural margin forecasts without pretending they are directly observed Gaussian forces.

**[ASSUMED]** Encounter transitions age the actual surviving hardware; they do not repair or reset it. Recurrence resets physical hardware to arrival state under P8 while retaining records. No wall-clock ageing runs while the app is closed, and no extra wear accrues between independent recurrence histories. Target mass, spin inertia, the gravity exponent and adopted rules are not ship calibrations and do not age. A new structure still needs fresh optical tracking and dynamical evidence.

## Commands and execution semantics

**[ASSUMED]** Add a typed `Command` union branch rather than opaque strings carrying numerical payloads. The following are proposed command payloads, not a patch to the shared contracts:

```ts
type TetherCommand =
  | { kind: 'tether'; action: 'arm' }
  | { kind: 'tether'; action: 'disarm' }
  | { kind: 'tether'; action: 'fire' }
  | { kind: 'tether'; action: 'reel'; rate: number; tensionLimit: number }
  | { kind: 'tether'; action: 'brake'; mode: 'free' | 'hold' }
  | { kind: 'tether'; action: 'brake'; mode: 'slip'; tension: number }
  | { kind: 'tether'; action: 'release' }
  | { kind: 'tether'; action: 'cut' };
```

**[ASSUMED]** `rate` is unstretched material m/s, **positive paying out and negative hauling in**; `tension` and `tensionLimit` are N. A `reel` command persists until replaced, stopped with rate zero, or inhibited. Its commanded powered-travel limit is 1 m/s in magnitude. Brake `free` disengages the capstan for launch payout; `slip` selects a physical slip-force setting; `hold` requests static retention within the healthy 8 kN holding capacity, subject to temperature, wear and actual mechanism force. Hold is neither an infinitely strong constraint nor a guarantee of zero motion. Each setting requires actual actuator travel and available control power; none directly assigns the true line force. Reject nonfinite values and requests beyond hardware command ranges. Applied limits appear in `ExecutedCommand.status = limited`; a rejection contains the actual local reason. Existing manual `power`, `mode`, `point`, `configure`, `recorder` and flight controls remain available.

**[ASSUMED]** With the capstan disengaged, proposed free-payout drag is 0.1 N and rated free-payout speed is 3 m/s. These are unqualified hardware assumptions, with no flight-heritage claim. Free payout is a different mechanical state from powered reel travel: the 1 m/s motor limit does not arrest a 2 m/s launch. Exceeding the 3 m/s free-payout rating produces actual overrun/line-motion consequences in the mechanics; it must not clamp velocity and silently destroy momentum or energy. Drum inertia, friction, line mass and subsequent engagement determine achieved motion.

| Order | Preconditions and actual outcome | Cost/accounting |
|---|---|---|
| Arm | Verify local latch/retention switches, selected payout/brake state and stored release/cutter energy; cock the spring and enable firing after its finite actuation | Spring charging uses 1,000 J input, retaining 32 J (30 J launch and 2 J jaw closure) and depositing 968 J as heat; add actual deployment, capacitor charging, controller and sensor costs from the hardware specification. No spring energy materializes from a mode change. |
| Disarm | With the head still retained, return the launcher to its safe, trigger-inhibited condition | No head/cassette mass is discarded; spring and capacitor energy remain stored. Re-arming charges only missing energy. Disarm is not a cut, release or energy-unloading alias. |
| Fire | Release the spring in the current launcher direction with free payout selected. The player has aligned the ship using observed target motion; the command has no homing target argument | 15 kg head launched at nominal 2 m/s from 30 J; 2 J remains available for passive jaw closure. Spring energy and opposite recoil are handled mechanically. No main propellant charge. Pay out real line through the disengaged capstan; miss detection is observational. |
| Reel | Request signed payout rate and local load limit. Motor current, available power, thermal derating, brake and snag state determine achieved motion | Up to 3,000 W payload motor draw plus controller/sensors; nominal powered shortening satisfies `T abs(rate) <= 0.75 (Pin - 100 W)` after its 100 W overhead. Positive payout can dissipate mechanical energy instead of consuming that same amount electrically. Motor and brake heat are distinct. |
| Brake | Select `free`, finite `slip`, or capacity-bounded `hold`; a zero payout command is not a perfectly rigid or infinitely strong hold | Controller/setting-actuator energy plus local frictional heat `T * positivePayoutRate`; a static passive hold dissipates no `T * rate` heat. The 4 kW rating is an operating friction-power limit into a finite thermal buffer, not sustainable rejection or an instantaneous force clamp. Actual overload heat must still be deposited. |
| Release | Only after head launch, open the ship-side fairlead and disengage/jettison the cassette; this does not remotely open the grapple | 40 J capacitor draw comprises 1 J mechanical cassette ejection and 39 J ultimately deposited as heat. All 40 kg nominal head/line/bobbin inventory departs; 215 kg fixed kit remains from the 255 kg installation. Model the tiny physical eject impulse and its equal/opposite ship reaction, departing momentum and any elastic-energy release. Never add an arbitrary bonus kick or instantly delete the departing collision geometry. |
| Cut | Only after head launch, fire the selected intact ship-side cutter; verify loss of load if measurable | Stored capacitor actuation and one cutter consumed. Paid line plus head depart; wound line and bobbin remain. A cut does not create a new grapple, relaunchable line end or spare cassette. |

**[ASSUMED]** At brake temperature 330 K against service temperature 295 K, the 25 W/K pumped link transfers only 875 W; a 4 kW slip therefore continues heating the finite buffer. With the pumps inactive, use the alternative 5 W/K passive path (175 W at that temperature difference), not 25 + 5 W/K. These selected thermal ratings have no flight-heritage claim. Limits, fade and thermal history remain in the hardware specification.

**[ASSUMED]** Release and cut use the dedicated capacitor and an alive essential decoder; they can operate through a payload outage. Both require an actually launched head under the local launcher/interlock state; before launch, reject either command and offer `disarm`/safe operation instead. Never apply a 40 kg loss to a prelaunch release command. They are explicit player commands, not a prediction service deciding the release time. A low-power or broken decoder can prevent command execution. Passive load protection acts physically on its own thresholds and is reported as a protection event only when sensed. Emergency cut must not be rejected solely because the load exceeds the normal working load or because the camera has no picture; the cutter's own damaged/used/uncharged state can still make it fail. Full command energies, delays and failure limits remain in the hardware specification to avoid two conflicting numerical authorities.

**[ASSUMED]** Successful release sacrifices the head, rope and cassette. The reusable-grapple description refers to recovering a missed or otherwise unattached head before commitment, not remotely recovering a captured head after a swing. No automatic reload or replacement occurs at Stillwater. The spacecraft continues with its actual mass, supplies, damage and heat.

## Model and screens

**[ASSUMED]** The ambitious version forecasts a player's capture/payout/brake/release sequence against a fitted, rotating, finite-inertia structure. It propagates uncertainty in feature geometry, angular velocity, inertia, attachment, rope stiffness, calibration and execution delay. It keeps 3D attitude/lever-arm torque and finite available RCS authority. Fit target inertia only when observed torque/rotation changes make it identifiable; optical spin alone does not determine inertia. Ordinary contact/tether mechanics can be a declared installed-hardware model; adopting an additional rule about the encounter remains an explicit player/model-extension decision under P5. No fit chooses a release plan or silently adopts a rule.

**[ASSUMED]** Ask S3/integrator to settle whether installed tether mechanics starts as an available model capability or a player-enabled `tether-dynamics` extension. Recommended: ordinary installed-hardware mechanics is known, while target properties and attachment hypotheses must be measured; any new hypothesis that changes a physical rule still uses held-out validation. Unknown target inertia or unresolved attachment creates a broad or terminated forecast, not access to truth. P4's inverse-2.5 field with shared `r0 = 1,000,000 m` remains **[FICTIONAL: P4]** and independent of the ordinary tether mechanism; learning the tether does not reveal the gravity law.

**[ASSUMED]** Freeze every issued forecast including commanded release time, calibration version, target estimate, observation age, assumptions and structural/power/thermal margins. A later acquisition produces a new forecast. Show actual measured loads against the originally predicted loads in Black Box. Distinguish a bad capture-speed estimate, force-limit error, brake overheating, lost tracking and release-execution delay rather than reporting generic failure.

**[ASSUMED]** The 2D thread would add:

- **SHIP:** select the real kit assemblies and trace load path, bus feeds and local heat; show current spool inventory, cutter use, stored release energy, worn parts and actual deployment. Use the measured/estimated COM and inertia already available, with a separate nonrigid line depiction.
- **FLIGHT:** local line direction and uncertainty, observed target/rail track, tension/working-limit bands, payout/rate, brake temperature, measurement age and commanded/observed attachment state. Draw an unseen section as unresolved, never as a perfectly known spline. Keep hands-on attitude controls and explicit release/cut available without a modal dialogue stopping the clock.
- **CONSOLE/Black Box:** synchronized optical observations, load, payout, temperature, acceleration and issued forecast; acquisition gaps and saturated samples stay visible. Compare attempts using each attempt's own seed/briefing and observations.

All colours, spacing, line styles and motion use `src/theme/` and its primitives. UI lane requests belong to 2D. **[ASSUMED, A12]** No inspection panel, command confirmation or model fit pauses an active encounter; the player can prepare during transit. Warn from evidence, not hidden future collisions.

## Build requests and approximate scope

The following paths remain outside S2 ownership. **[ASSUMED]** Counts are implementation estimates in nonblank TypeScript lines, excluding tests, generated data and S1's numerical tether/contact solver. They are not deadlines or measured costs.

| Owner/path | Concrete addition | Approximate lines |
|---|---|---:|
| Integrator/2G, `src/contracts/commands.ts`, `ship.ts`, `measurements.ts`, `belief.ts`, `view.ts`, `forecast.ts`, `truth/ship.ts` | Typed tether commands and nominal specs; measured quality/window metadata; line/attachment estimate and forecast margins; truth-only dynamics ports and independent deployed material state | 200–350 |
| 3A/ship, `src/ship/definition.ts`, `state.ts`, `commands.ts`, `power/`, `thermal/`, `massprops/`, new `tether/` and condition integration | Parse accepted fragment; finite state machine; signed motor/payout request; passive brake/capacitor/release/cutter state; power/heat/wear budgets; mounted vs deployed mass ownership | 550–900 |
| 3C/ship, `src/ship/sensors/` | Local instruments, visibility and noise gates; counters/switches; samples and quality records with seeded/saveable biases | 250–450 |
| Encounter/simulation owner, `src/sim/` and `src/game/truth-step.ts`, `environment.ts` | Feed S1's actual local line load and geometry into sensor-only truth ports; sample schedule; apply equal/opposite forces and energy/mass transfer once; retain detached hardware until it exits collision relevance | 200–400 **plus S1 solver** |
| 2C/model, `src/model/adapt.ts`, `dynamics.ts`, `forecast.ts`, `aging.ts`, `settings.ts`, `extensions.ts`, `diagnostics.ts` | Tether-aware arcs and unsupported-arc guards; estimate local calibrations/target properties; freshness; fixed player sequence forecast and evidence-based uncertainty | 600–1,000 |
| Game/Black Box, `src/game/belief/`, `src/blackbox/` | Build only sensed line state; save/restore timeline, detached-inventory observations and quality; immutable forecast inputs and command acknowledgements | 150–300 |
| 2D, `src/console/encounters/borrowed-spin/`, `src/view3d/` and ship equipment view | Panels and observed 3D geometry, uncertainty, command wiring, replay comparison using theme primitives | 400–700 |

**[ASSUMED]** Total integration beyond the S1 solver is approximately **2,350–4,100 lines**, with roughly **1,000–1,800 test lines** for independent acceptance checks. S3 owns authoring, encounter scale, route usefulness and playtests; those are additional work. The baseline loader at this branch still lifts planar equipment positions and does not implement general tether mass transfer. Rebase/reconcile against 2G's final 3D types and physics before writing production code. A decorative line and a scripted velocity change do not satisfy this scope.

**[ASSUMED]** Recommended smaller version: retain the same load path, consumable release, local gauges, power/heat/wear and 3D equal/opposite dynamics, but use one visible surveyed rail, one straight unobstructed line span and no remote latch radio. The belief-side forecast ends when acquired evidence or unexplained residuals make a snag/unresolved attachment incompatible with its model, without receiving hidden contact flags. It loses flexible-line shape inference, wrapping forecasts and recovery maneuvers. The physical solver must still handle contact and its consequences; it cannot ignore a snag simply because the forecast model is smaller. Removing the load cell is a poor saving: it sacrifices the independent evidence needed to distinguish loading from propulsion and encoder faults. Removing the camera loses local angle evidence and weakens torque estimation, especially after a snag.

## Tests that would prove implementation

These are **[ASSUMED] acceptance tests to be implemented**, not claims of passing S2 tests.

1. **Specific force:** coast under nonzero P4 gravity with no contact: both IMUs read only their errors. Apply a known 3D tether force with no thruster: COM specific force is `F/M`; off-centre torque is `r × F`. Check local IMU rotational correction independently and account for previous-window timing. Rotate the entire setup and retain equivalent body measurements.
2. **Independent evidence:** inject a payout scale error while leaving the load cell correct, then a load-cell bias with correct payout. The records disagree in the expected channels; the model cannot fix either by reading a hidden parameter. A slack zero-load trial constrains bias but leaves gain/strength uncertain.
3. **No free geometry:** slack payout never emits a direct range fix. Hide the remote head/rail, then obstruct the local camera; retain only actually acquired local evidence. A fake `captured=true` truth value must not alter the belief snapshot or forecast without new observations.
4. **Timing/data budget:** run the same capture with 50 Hz and 1 Hz recording. High-rate data resolves the load history when sampled by the solver; 1 Hz keeps gaps and cannot report an unsampled peak as a measured value. Power loss/storage saturation stops acquisition without deleting old samples. Saturation is flagged and excluded from ordinary Gaussian fitting.
5. **Mass/energy/authority:** independently check reel electrical input against mechanical work plus heat, passive payout work against brake heat, finite capacitor energy and charge loss, and no phantom regeneration. Verify 32 J stored spring energy divides into 30 J launch and 2 J jaws, and 1,000 J charging input leaves 968 J heat. After launch, successful release transfers nominal 40 kg to detached objects; cut transfers only paid line plus head. Account for the release's 1 J physical eject work and equal/opposite impulse inside its 40 J capacitor draw, leaving 39 J heat; neither event adds an arbitrary bonus ship impulse or erases collision geometry. Overrun beyond the free-payout rating retains physical momentum/energy rather than clamping speed. Check that pumped/passive thermal links are alternatives and 4 kW brake input is not reported as sustainable rejection. S1 supplies the conservation tolerances.
6. **Command failures:** reject invalid ranges/NaNs, prelaunch release/cut, and repeated spent-cutter commands; distinguish rejected versus limited reel. Prelaunch `disarm` preserves head/line/cassette mass. Positive reel rate pays out; negative hauls in. Exercise `free`, `slip` and bounded `hold`, including overcapacity load and power loss. Payload outage kills sensors/motor while the selected passive brake setting remains and charged release/cut can still execute through essential power. Decoder loss prevents electronic commands; reported success never follows just from issuing one.
7. **A5/P8:** known travel/heating/condition drops grow exactly the declared calibration variance; world parameters do not age. New calibration reduces only supported uncertainty. Save/restore and replay preserve counters, seeds, capacitor charge, temperatures, wear, current commands and acquired records bit for bit. Recurrence resets physical kit inventory while keeping the archived attempts separate.
8. **P11/P6:** extend lint/boundary tests so model, Black Box, console and view cannot import tether truth or solver code. Rebuild estimates from retained packets alone, redact unobserved target inertia and compare. Unsupported-arc exclusions must derive from executed commands, sensed contact/load and residuals, with no hidden attachment/snags mask. Reported load sigma must be reproducible from observable readings and the nominal noise model, with no hidden true-tension channel. Model output contains the consequences of the supplied sequence, never an auto-selected release time. Previously issued forecasts remain unchanged after new data or damage.
9. **3D clearance and usability:** capture from an inclined spin plane, change appendage configuration, and verify swept line/cassette/ship clearance. A no-new-measurements replay with carried rules still has uncertain target phase/attachment and stale calibrations. Playtest with live time and hands-on control; passing arithmetic cannot establish playable capture/release windows.
