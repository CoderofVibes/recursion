# S19 — Tidal Orchard magnitude check

**Recommendation: defer A02 in its proposed post-C02 location.** The gravity-gradient effect is real under P4, but at that location it is too small to see or to matter to control resources over S4's 60–300 s experiment. Close to the existing bodies it is measurable, and can turn an uncontrolled ship by degrees over minutes. That is a different location and operating procedure. No multiplier, changed body mass, changed radius, or roll release is recommended.

This is a study for A15 Q21, based on `19a9ada` in `st/s19-tidal-check`. It proposes no new decision. The owner decides through the integrator. It changes no game source or shared data.

## 1. Decision evidence

All numerical results below are **[DEMONSTRATED: `python tools/studies/s19/tidal_check.py --check`]**, conditional on the explicitly identified assumptions. They are independent reference calculations, **not a playable-region test**. Input file hashes are in [results.json](../../../tools/studies/s19/results.json).

| Question | Result |
|---|---|
| Does P4 produce a ship torque? | Yes: `tau = 3.5 GM sqrt(r0) / r^3.5 * (n cross I n)`, summed over bodies, with the actual full inertia tensor. |
| Was 2G's 0.21 N·m at 400 km about this ship? | No. Derivation §11.6 used a reference body with a 480,000 kg·m² principal-moment spread. The actual arrival ship has 223,436 kg·m²: its maximum at 400 km from Alpha is **0.09660 N·m**. The earlier number is not wrong; its inertia was different. |
| What happens in the proposed Orchard? | At 1.05–1.30 times the built 9,000 km barycentric exit radius, the conservative two-body maximum is **3.656 to 1.460 µN·m** for arrival radiators. Even an optimistic angular-displacement bound is only **0.332 to 0.133 arcsec in 300 s**. |
| Could another supported configuration rescue it? | All four configurations and arrival/spent loads are swept. At the pocket's inner edge the largest bound among them is **0.413 arcsec**, still below one healthy star-tracker sample's **8.25 arcsec** noise. |
| What about a generous interpretation of “after the belt”? | At 700 km from Beta, a near-optimal yaw comparison develops **0.02478° in 300 s**, detectable with suitable data, but not a dramatic turn or a control challenge. This is near the belt, before the built C02 departure condition. At 1,650 km it is **0.001233°**. |
| Can roll hold remove the whole effect? | No. Most of the useful torque can be yaw/pitch. An ideal roll-rate constraint leaves the 400 km Alpha yaw response almost unchanged: **0.69473° versus 0.69464°** free. Normal hands-off flight also holds yaw/pitch, however, reducing that case's peak excursion to **0.31386°** in the ideal delivery check. |
| Is tidal torque a threat to healthy control authority? | No. Even 1 km above Beta's collision sphere the maximum is **0.5838 N·m**, against **1,600/4,000/3,600 N·m** roll/pitch/yaw authority. At the Orchard it is about a billionth of healthy yaw authority. |

**[ASSUMED: interpretation of S4]** The region page leaves “C02 exit-radius reference” implicit. This study resolves it to the executable `DEPART.beyond = 9_000_000` in `src/content/gravity-range/briefing.ts`, measured from the binary's centre of mass. It also evaluates the belt and all the way down to the collision surfaces, so a different interpretation does not hide a useful effect.

## 2. Law, frames and the independent check

**[FICTIONAL: P4]** With shared `r0 = 1,000,000 m`, exponent `p = 2.5`, and `K = GM r0^(p-2)`, let `r` run from a source to the ship's centre of mass, `n = r/|r|`. In inertial axes:

```text
a(r) = -K r / |r|^(p+1)
A = da/dr = (K / |r|^(p+1)) [(p+1) n n^T - identity]
tau_body = (p+1) K / |r|^(p+1) [n_body cross (I_body n_body)]
n_body = rotate(conjugate(q_body_to_inertial), n)
```

**[DEMONSTRATED: algebra checks]** For a mass element at centre-of-mass offset `x`, the uniform acceleration cancels in the torque sum because `sum(m x)=0`. In `sum[x cross (m A x)]`, the isotropic part of `A` contributes zero. Substitution of `I = sum m[(x.x) identity - x x^T]` gives the torque above, including its sign. Units are `s^-2 * kg m² = N m`. Reversing `n` leaves the torque unchanged. It vanishes for spherical inertia or alignment with any principal axis; the greatest possible norm is

```text
|tau|max = (p+1) K / r^(p+1) * (Imax - Imin) / 2.
```

**[ESTABLISHED: NASA SP-8024; Hallock et al., §3.9, Eq. 3.10]** The Newtonian limit is `3 GM/r³ (n cross I n)`, the ordinary gravity-gradient torque of an extended spacecraft. The sources establish that mechanism; they do not establish the fictional exponent or qualify this ship. [NASA SP-8024](https://ntrs.nasa.gov/citations/19700014113), [ACS Without an Attitude](https://ntrs.nasa.gov/api/citations/20180004285/downloads/20180004285.pdf).

**[DEMONSTRATED: `verify_algebra`]** The script checks the general-law acceleration Jacobian against central differences; sums direct P4 forces on six positive masses whose second moment exactly matches the actual tensor; halves their spatial scale to check convergence toward the gradient result; checks the torque's sign against the orientation potential; verifies the Newtonian limit, radius/mass scaling, principal alignment and isotropic limit. The six-mass construction validates the leading multipole, not a detailed reconstruction of the spacecraft's density. The underlying baseline supplies positions and intrinsic inertias, which suffice for this term.

**[ASSUMED: rigid-body approximation]** Constant configuration within each measured coast; no flex, slosh, structural damage, or deployment transient. The ship spans tens of metres while every allowed centre distance is at least 160 km. Higher spatial moments are small, but the symmetric six-point convergence error must not be presented as the exact real ship's truncation error. Internal gravity-gradient loading is also not a new structural hazard claim. Configuration changes require an angular-momentum-consistent transition; 2G lists the existing transition's constant-rate limitation.

## 3. Actual ship and allowed scales

**[ASSUMED: baseline ratings; DEMONSTRATED: independent mass sum]** The generator reads every assembly, appendage and resource from `data/ship-baseline.json`. It includes intrinsic inertias and all products of inertia rather than treating the ship as a 16 m rod. Body axes are +x forward, +y left, +z up. Its arrival mass is 30,374 kg; centre of mass is approximately `(-0.3329, 0.0021, -0.1047) m`. The radiators configuration has:

```text
I_body [kg m²], rounded:
[[102615,   300, 10568],
 [   300,307412,   -22],
 [ 10568,   -22,325049]]
```

| Full-load configuration | Principal moments, kg·m², increasing | Maximum torque at Alpha 400 km, N·m | Free yaw flyby change in 300 s |
|---|---|---|---|
| Stowed | 82,554 / 305,551 / 306,970 | 0.09702 | 0.80884° |
| Radiators | 102,113 / 307,412 / 325,550 | 0.09660 | 0.69464° |
| Solar | 114,665 / 307,460 / 338,150 | 0.09662 | Not dynamically sampled; static tensor/torque included |
| All deployed | 134,224 / 307,902 / 358,149 | 0.09681 | 0.53476° |

The frozen 45° yaw torque depends mostly on `Izz-Ixx`, which barely changes under lateral deployment. Deployment increases yaw inertia and **reduces**, rather than strengthens, the angular response in this comparison. “The long deployed ship turns more” is not supported by this baseline. Other orientations change the allocation between axes; retain the full tensor.

**[ASSUMED: load envelope]** The second loading removes all propulsion propellant and turns the fuel-cell reactants into 54 kg of retained water, giving 24,054 kg. It brackets a depleted ship; it is not a successful C02 arrival state, and its empty RCS cannot operate a hold. It is used only for static magnitudes and optimistic observability bounds. Dynamic hold cases use full tanks. The file still labels four crew despite P14's one-player decision; the study uses the implemented equipment masses without silently changing them.

**[ASSUMED: P16; required by A10]** Alpha's `GM = 1e10 m³/s²`, radius 250 km; Beta's `GM = 2.5e9`, radius 160 km; separation 4,000 km. These are fixed, not seed-dependent mass ranges. A seed can change phase, direction and encounter geometry. Source locations relative to the barycentre have radii 800 and 3,200 km. No extended-body torque is supplied by the massless test asteroids currently used by the game.

### Single-source screening

The torque column is the maximum over all orientations of the arrival radiators tensor. The response column uses an **[ASSUMED]** fixed radial direction initially at 45° in body xy, starting from zero rate: `delta_yaw = 0.5 alpha_z T²`. It is a local short-time estimate, not a static ship suspended above the body. The independent moving cases in §4 replace that approximation.

| Source | Centre distance / surface altitude, km | Maximum torque, N·m | Frozen free yaw change, 300 s | Optimistic 3σ curvature detection, 0.05 Hz / 1 Hz |
|---|---|---|---|---|
| Alpha | 251 / 1 | 0.4936 | 3.581° | 40 / 22 s |
| Alpha | 300 / 50 | 0.2644 | 1.919° | 40 / 28 s |
| Alpha | 400 / 150 | 0.09660 | 0.7009° | 80 / 42 s |
| Alpha | 1,000 / 750 | 0.003910 | 0.02837° | 280 / 153 s |
| Beta | 161 / 1 | 0.5838 | 4.236° | 40 / 20 s |
| Beta | 300 / 140 | 0.06610 | 0.4796° | 80 / 49 s |
| Beta | 700 / 540 | 0.003406 | 0.02472° | 280 / 162 s |
| Beta | 1,000 / 840 | 0.0009775 | 0.007093° | 480 / 267 s |
| Beta | 1,650 / 1,490 | 0.0001694 | 0.001229° | 980 / 539 s |

For arbitrary orientation the signal can be **zero**. These detection times cannot be promised to every seed. The files sweep 176 source/radius/configuration/loading combinations and include signed torque and initial acceleration vectors for xy, xz and oblique directions.

### Post-exit bound, including both bodies

For barycentric radius `R`, distances obey `rAlpha >= R-800 km`, `rBeta >= R-3,200 km`. Adding the two separate torque maxima is conservative: their favourable directions need not coincide. For the angular bound, divide that sum by the smallest principal moment and use the small-angle, initially stationary response. This deliberately overstates the useful pitch/yaw signal.

| Barycentric radius | Minimum Alpha / Beta distance | Torque upper bound, radiators | 300 s free-angle upper bound | Optimistic 3σ time, 0.05 / 1 Hz |
|---|---|---|---|---|
| 9,000 km, built departure | 8,200 / 5,800 km | 4.557 µN·m | 0.414 arcsec | 2,520 / 1,390 s |
| 9,450 km, S4 inner edge | 8,650 / 6,250 km | 3.656 µN·m | 0.332 arcsec | 2,760 / 1,519 s |
| 11,700 km, S4 outer edge | 10,900 / 8,500 km | 1.460 µN·m | 0.133 arcsec | 3,980 / 2,192 s |

These optimistic times assume a stationary, maximum signal throughout, healthy independent sensor errors, and no control impulses. Actual motion, competing torques, geometry uncertainty and residual spin complicate a long observation. A many-minute precision experiment might eventually constrain a signal; that would not demonstrate S4's 60–300 s memorable turn.

The representative **3D moving binary** vector at 9,450 km, radial outward 66 m/s along `(1,1,1)`, changes attitude by only **0.04468 arcsec in 300 s**. The binary continues its mutual circular motion under P4. This initial state is a representative outgoing direction, not a reconstructed successful C02 route. The all-direction bound above is the reason the recommendation does not depend on that particular vector.

## 4. Controller, roll and attitude response

**[ASSUMED: actual software settings]** The baseline/controller use attitude gain 0.1/s, rate gain 0.4/s, slew cap 0.008 rad/s, attitude deadband 0.002 rad (0.1146°), rate deadband 0.0004 rad/s. Hardware clean-couple authority is ±1,600/4,000/3,600 N·m. The controller reads truth kinematics today; sensor noise affects the player's evidence, not its internal feedback.

The angle deadband alone does not describe the observed hold tolerance. From zero rate, the rate loop will not respond until approximately `0.002 + 0.0004/0.1 = 0.006 rad` (0.344°) error; a growing disturbance rate can trigger it earlier. The rate loop then asks for roughly 16–52 N·m on the first active axis. A tiny disturbance is not continuously canceled by a tiny jet.

**[DEMONSTRATED: reference response vectors]** The script integrates translation, quaternion kinematics and `I wdot + w cross Iw = tau` together with RK4. Near-source examples begin at periapsis on an unbound isolated-body pass, `v_infinity = 40 m/s`, full arrival radiators, identity attitude, zero angular rate. The line of sight moves and the field weakens. They are not the binary slingshot or safe encounter designs.

| Moving case, 300 s | Free final angle | Ideal body-roll constraint, final | Normal hold demand law, peak | First hold demand |
|---|---|---|---|---|
| Alpha 251 km, xy 45° | 3.4041° | 3.4046° | 0.3231° | 84 s |
| Beta 161 km, xy 45° | 3.9852° | 3.9858° | 0.4035° | 77 s |
| Alpha 400 km, xy 45° | 0.6946° | 0.6947° | 0.3139° | 201 s |
| Beta 700 km, xy 45° | 0.02478° | 0.02478° | 0.02478° | None |
| Beta 1,650 km, xy 45° | 0.001233° | 0.001233° | 0.001233° | None |
| Beta 161 km, fully oblique | 1.3874° | 0.9493° | 0.4263° | 143 s |

**[ASSUMED: control reference limit]** “Normal hold” reproduces `control.ts`'s demand law at fixed 1 s control ticks, but delivers its torque continuously over the tick. It omits the actual jet allocator, minimum impulse bits, hidden mount errors, depletion, thermal and power dynamics. These hold values demonstrate scale and feedback onset, not exact gameplay peaks or propellant consumption. The unsaturated gravity perturbation is far below authority in every case. The post-exit cases ask for **no control at all** from rest, so pulse allocation cannot rescue their missing signal.

**[ASSUMED: roll diagnostic]** The roll-constrained column imposes `omega_body_x = 0` by a reaction torque and solves coupled yaw/pitch dynamics with the actual off-diagonal inertia. It is not a player-accessible mode and is not identical to `quat.pointAlong`. It answers the physical question: preventing roll does not prevent a gravity-driven yaw/pitch turn. The actual hands-on system commands roll rate zero during manual turns and, on release, nulls rates then holds **all three axes**. A fully free reference therefore must not be sold as default play. No change to A8 is requested.

**[DEMONSTRATED: torque bound and baseline arithmetic]** At the inner Orchard the integrated tidal torque over 300 s is at most 0.00110 N·m·s for arrival radiators. Even the smallest clean two-jet angular impulse at a 2 m arm is 40 N·m·s (10 N·s per jet); one such pair consumes about 9.27 g at 220 s Isp. Tides supply less than 0.000028 of that angular impulse. With residual spin, tides can shift an existing correction's timing, but that is not useful resource pressure. 2G already reports roughly 1 kg/h of ordinary post-turn hold use; that nuisance is much larger. Damage that leaves no useful control does not increase the tidal signal, and no arbitrary degraded-control setting should be added to manufacture difficulty.

## 5. Sensor evidence and observation time

**[ASSUMED: baseline sensor model]** One healthy star tracker has per-axis `sigma_theta = 4e-5 rad` (8.25 arcsec), maximum rate 2 Hz, and loses solutions above 0.01 rad/s or without visible stars. One IMU gyro has `sigma_rate = 1e-5 rad/s` and a persistent seeded bias with 2e-6 rad/s scale. Condition reduces quality as `sigma/condition`. The accelerometer is COM-corrected specific force: it does not directly report this gravity gradient (P7). No torque sensor exists.

The Gravity range starts recording at **0.05 Hz**, one packet per 20 s, despite the sensor's higher capability. The 1 s game tick caps acquired packets at 1 Hz; requesting 2 Hz does not give 2 Hz without a smaller truth step. The 2 Hz statistics in the JSON are a hardware/substep comparison only. Extra recording needs the existing power and storage budget; a forecast cannot reconstruct missing samples as observations.

**[DEMONSTRATED: observation-design calculation]** To distinguish curvature from an unknown initial attitude and rate, fit `theta(t) = theta0 + omega0 t + alpha t²/2`. With `N` equally spaced samples at interval `h` and independent errors:

```text
sigma_alpha² = 720 sigma_theta² / [h⁴ N (N²-1) (N²-4)].
```

The script checks this against the inverse of the explicit least-squares design matrix. This is an expected information threshold, not a simulated detection by the current estimator. Require `|alpha| >= 3 sigma_alpha`; do not assume the initial rate is known perfectly. At 300 s:

| Actual cadence | Samples | 1σ acceleration error | 3σ requirement |
|---|---|---|---|
| 0.05 Hz | 16 | 2.646e-9 rad/s² | 7.939e-9 rad/s² |
| 1 Hz | 301 | 6.828e-10 rad/s² | 2.049e-9 rad/s² |

At 60 s those 1σ errors are 1.000e-7 and 3.696e-8 rad/s². At the inner Orchard the radiators **upper bound** is only 3.580e-11 rad/s²: 0.0135σ at 0.05 Hz, or 0.0524σ at 1 Hz after 300 s. Even the most favourable supported configuration remains below 0.066σ at 1 Hz. Sensor damage makes this worse. A second independent tracker can improve noise by sqrt(2), not the necessary orders of magnitude.

Two endpoint attitude fixes need a 3σ difference of 0.00972°; two gyro fixes need a rate difference of 4.243e-5 rad/s. A constant gyro bias cancels when differencing but initial rate, bias drift and actuator events still need treatment. An inertial hold's pulse history must be recorded before interpreting attitude changes as unforced curvature. No current telemetry channel exposes a measured tidal torque; `ext['propulsion.control']` is truth-side demand bookkeeping, not permission to display truth.

For the belt-side Beta 700 km example, the near-optimal single-configuration yaw signal reaches about 3.6σ in 300 s at current cadence. That does **not** establish S4's stowed/deployed comparison: its smaller difference must exceed the combined uncertainty of two intervals, after accounting for the changed trajectory, pointing, residual rate and any deployment impulse. At Alpha 400 km the stronger pre-control coast could support such an experiment, subject to actual pulse and sensing tests.

## 6. Best version, smaller version, and owner decision

**[ASSUMED: perceptibility criterion]** Use 1° of actual orientation change in 300 s as a screening target for an obvious physical turn, and 3σ curvature as a separate instrument target. One is a play-value judgement; neither substitutes for a player test. No visual angle multiplier is allowed.

For arrival radiators in the favourable yaw geometry, the frozen estimate needs `r <= 361 km` about Alpha or `r <= 243 km` about Beta for 1° in 300 s **without yaw/pitch hold**. A 1° turn in 60 s or 5° in 300 s puts that particular configuration's thresholds inside the existing collision spheres. Other tensors/orientations differ: these are yaw/radiators thresholds, not universal maxima. Near-surface motion is real but leaves little clearance, and full hold reduces the response substantially.

The best credible future version is an instrumented, optional close-pass experiment at the existing fixed bodies: measure torque through attitude curvature and calibrated jet impulses; compare two fixed configurations and yaw/pitch orientations; demonstrate a held-out prediction; show the natural turn at its true scale. Keep normal roll policy and make the required observation/control mode explicit. It must preserve the required belt slingshot, the real outgoing state and the onward reserve ledger. Moving A02 inward changes S4's post-exit placement; returning after departure costs time and propellant. Neither a free relocation nor a safe new route has been shown here.

A smaller version is a retained-data/null-result investigation using a previously flown close coast, with an honest upper bound where the evidence is weak. It loses the advertised visible turn and repeat-run control challenge. With the existing simulation's torque entirely absent, a “null result” cannot yet claim to measure the physical P4 prediction: it can only be an explicitly mathematical comparison until the coupling is implemented.

**Owner question, one decision:** Should A02 be deferred from the current expedition build? **Recommend yes.** Preserve this reference and the name as a future close-pass experiment, after core-route reserves and the actual control/sensor evidence are demonstrated. Do not change Alpha/Beta, weaken the controller, free roll, or amplify tides to preserve this placement. This answers A15 Q21; it does not change the independent tether or gas decisions.

## 7. What building it later would take

These are **[ASSUMED]** estimates of changed/new production lines, excluding generated references. No implementation is authorized by this study alone.

| Owner / paths | Required work | Approximate lines |
|---|---|---|
| Integrator/physics, `src/sim/gravity.ts`, `simulation.ts` | Sum attitude-dependent torque from every massive body at the same evaluation epochs as translation; use current full COM inertia; preserve the point-source force normalization. The present prepared-actuator fast path assumes fixed torque and skips zero-rate torque-free attitude work: both must account for environmental torque. | 140–260 |
| Ship/game, `src/ship/propulsion/`, `src/ship/sensors/`, `src/game/truth-step.ts` | Exercise real pulses and controls; expose acquired/calibrated actuator impulse housekeeping through measurements if needed, with time, uncertainty and outages. Isolate deployment transients; do not call control demand a torque measurement. No new physical sensor. | 100–220 |
| Integrator, `src/contracts/measurements.ts`, `forecast.ts`, model contracts as needed | Agree impulse telemetry and an optional attitude/rate forecast with covariance/support. Ordinary attitude/rate measurements already exist. Keep environmental torque truth on the truth side; do not disguise it as non-gravitational specific force or engine thrust. | 50–100 |
| Model owner, `src/model/dynamics.ts`, `forecast.ts`, `extensions.ts`, diagnostics | Predict rotational dynamics from believed body states, gravity parameters and design/gauged inertia. Fit initial rate, gyro bias and identified actuator errors; propagate uncertainty; compare inherited Newtonian versus adopted P4 torque and held-out coast evidence. The current forecast uses commanded attitudes, not a disturbance-torque integration. A translational empirical-acceleration fit is not attitude support. | 300–550 |
| Black Box/game | Retain measurements, actual configuration, control mode, calibrated impulse observations, gaps, nuisance fits and the original attitude forecast. Resolve recordings independently across attempts; never overwrite the first prediction. | 70–140 |
| 2D/3F, `src/console/`, `src/view3d/` on theme tokens | Time-aligned attitude/rate and control-effort plots with uncertainty, configured inertia, missing-data state, and explicit measured/modelled distinction. Keep physical hologram rotation unscaled. No truth torque gauge. | 180–320 |
| Content/expedition owner, future `src/content/tidal-orchard/`, region/route data | An approved placement and authored 3D arrival geometry; fixed masses/sizes; clearance and abort; A6 belt exit retained; C02→C03 fuel, power, heat and damage continuity. | 120–240 |
| Tests/harness across those owners | Independent physics/reference consumption, actual pulse/sensor integration, estimation and route/recurrence tests below. | 450–850 |

Total: approximately **960–1,830 production lines plus 450–850 tests**, before scene art or an extended-body asteroid attitude system. Full mutually coupled quadrupole translation/attitude energy conservation is additional work if required: a leading torque combined with strictly monopole COM translation neglects the tiny quadrupole force. State that approximation; do not assert exact conservation of the combined orbital-plus-rotational energy. The reference's conservation check instead uses a fixed tidal field, where rotational energy plus orientation potential is a valid invariant.

Acceptance gates for any later builder:

1. Consume the algebra and free-response vectors; prove sign, frames, units, multi-source addition, zero/isotropic/aligned limits, and step convergence. Test no false thruster specific-force signal. Use dynamic torque at force-evaluation epochs, not a cached constant for a whole coast.
2. Compare real game pulses, power availability, damaged pod geometry, hidden mount errors, known residual rates and all configurations. Prove held roll, expected yaw/pitch behavior, no artificial disturbance gain, and an honest fuel ledger. The ideal hold vectors are diagnostic only; they are not exact game-pulse fixtures.
3. Test observation cadence/dropouts/noise, nuisance offset/rate/bias, recorded impulse errors, null/aligned controls, and both stowed/deployed intervals. Require a held-out attitude prediction with an honest envelope; test P11 imports and no truth-valued chart/torque display.
4. Fly the actual selected C02 exit through A02 to C03 with whole-hull clearance, no new spawn/restore, real deployment motion and an abort. Run multiple authored phases/directions and surviving resource states. Record whether measured effects reach 3σ, whether a person sees useful motion, and whether the experiment costs more than it teaches. Repeat after recurrence with only acquired evidence retained.

## 8. Reproduction and limits

From the repository/worktree root:

```powershell
python tools/studies/s19/tidal_check.py
python tools/studies/s19/tidal_check.py --check
```

Python 3.14 and numpy only; no installation. The first command regenerates the two JSON files beside the script; the second reruns the physics/checks and compares outputs without rewriting. No timestamps, machine paths, usernames or unseeded noise are emitted into artifacts. There are no random draws: observation limits use analytic covariance. The sampled directions are explicitly chosen; phase-independent outer bounds cover all geometry.

See [the reference README](../../../tools/studies/s19/README.md) for schema and consumer tolerances. Verification includes direct force/gradient consistency, fourth-order free 3D integration convergence, static-field energy, no control demand in the outgoing case, a roll-only diagnostic, and reproducible JSON. Real game control, noisy estimator detection, safe passage, thermal/electrical reserves and human perceptibility remain untested. This is sufficient to reject the proposed short outer experiment without pretending that a new close-pass region has been built.

Sources read: creative brief; all decisions; study/build conventions; region-proposal README/catalogue; S4 A02 page; S11 Q21; derivation §11.6; 2G handoff §Ship and limits; ship/contracts/model READMEs; baseline JSON; mass, control, sensor, gravity-range and simulator source. External primary references were checked on 2026-11-14 Pacific: NASA SP-8024 (1969) and Hallock et al., *ACS Without an Attitude* (2017), links in §2. No external text is copied into this study.
