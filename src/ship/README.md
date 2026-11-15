# Ship systems — 2B, three-dimensional (2G)

Pure `ShipSystemsStep` using the [1C baseline](../../data/ship-baseline.json), in three dimensions (DECISIONS A11). Hardware ratings and approximations remain **[ASSUMED]** as labelled by 1C; the values 2G added for the third dimension are listed in [the baseline document](../../docs/engineering/ship-baseline.md) § Three dimensions. Source IDs resolve through [the bibliography](../../References/BIBLIOGRAPHY.md); they support mechanisms, not qualification or playability of this ship.

```ts
import { loadShipDefinition, createShipSystemsState, stepShipSystems } from './index.ts';
const definition = loadShipDefinition();
const initial = createShipSystemsState(definition, 'gravity-range');
const result = stepShipSystems(initial, definition, commands, environment, dt);
// { state, actuators, measurements, events }
```

`step` aliases `stepShipSystems`. Also exported: `computeMassProperties`, and `nominalJets` and `handsOnFirings` (§ Drawing thrust). Use the real definition/state together: contract fixtures describe a different mock ship. The loader projects structure once, 41 other assemblies, seven resource tanks including reactants/product water, four buses, four thermal nodes and four configurations. Full 1C detail is retained under `systems`.

## Frames and geometry

Body frame as in the contracts: origin at the structural datum on the hull axis, +x forward (the main engine's push), +y left, +z up. Attitude is a unit quaternion, body to inertial; angular velocity is in the body frame. Yaw is about +z (positive: nose left). Pitch is about −y (positive: nose up), so a nose-up rate is a negative rate about body +y.

- **Positions.** Every assembly, tank and appendage has `[x, y, z]`. x and y are 1C's; z is the anchor height in 1E's drawing (`prototypes/room/ship-parts.js`) where it has one, so the ship view and the physics agree.
- **Hull.** `MassProperties.hull` is a union of five convex prisms, always in this order: the pressure hull (16 × 5 m outline, z from −2.5 to 2.5), then `radiator-left`, `radiator-right`, `solar-left`, `solar-right`, each a thin prism (0.2 m and 0.1 m thick, centred on z = 0) over the wing's polygon at its current extension. Stowed, a wing lies inside the pressure hull's prism. Nothing between the parts is included: this replaces 1C's single convex outline, which counted the space between the wings and the nose and tail as ship. That is acceptable for clearance because the objects are spheres hundreds of metres across or more. The antenna, camera, engine bell beyond x = −8 and RCS nozzles are not in the envelope.
- **Mass properties.** Mass, centre of mass and the full inertia tensor about it by the parallel-axis theorem over structure, equipment (appendages at their current extension) and tank contents, reported as `Inertia { moments, axes }` (principal moments and the rotation from the principal frame to the body frame, `sym3.principalAxes`). The zz term of the tensor is 1C's yaw inertia and cannot change with heights; `yawInertia()` and `inertiaTensor()` in `massprops/massprops.ts` read the tensor back. **`moments.z` is not the yaw inertia**: the principal axes are tilted 2.5–2.7° from the body axes (heavy life-support gear low and forward gives an xz product of about 10,600 kg·m²).

  | Arrival (`radiators`, full tanks) | Value |
  |---|---|
  | Mass | 30,374 kg |
  | Centre of mass | (−0.3329, 0.0021, −0.1047) m |
  | Ixx, Iyy, Izz | 102,615 / 307,412 / 325,049 kg·m² |
  | Ixy, Ixz, Iyz | 300 / 10,568 / −22 kg·m² |
  | Principal moments | 102,113 / 307,412 / 325,550 kg·m² |

  All four configurations, full and empty, are in the baseline document's appendix (computed independently by `validate_baseline.py`; `massprops.test.ts` compares).

## Timing and acquisition

`dt` must be finite and positive; `environment.t` must equal `state.t`. Resources advance over `[t,t+dt]`; the returned state is at `t+dt`. Instrument samples and tank/charge/temperature telemetry describe the supplied scene at `t`. Power readings are the newly dispatched interval rates. `specificForce` is the previous simulation interval's body-frame COM acceleration, as specified by the contract; 2F/2C must align it with actuator history when fitting propulsion. No gravity or absolute position is emitted as an instrument reading. **[ASSUMED: C05, P7]**

Only acquired measurements are returned. Acquisition deadlines persist; at most one packet is recorded per tick because only one environment snapshot exists. Use `dt <= 0.02 s` for 50 Hz or `dt <= 0.1 s` for normal 10 Hz recording. Missed observations stay missing. Camera cadence is `min(recorder rate, supplied watts / 120)` Hz, IMU ceiling 50 Hz, star trackers 2 Hz. **[ASSUMED: C01/C06/C14 cadence adapter; DEMONSTRATED: sensors/sensors.test.ts]**

Each packet costs `recorder.bytesPerSample`. At `capacity - reservedEventCapacity`, optional acquisition stops with a fault event. Power loss or full storage never deletes old data. Game/Black Box owns command/event serialization, reserved metadata accounting and retention through loss; this step does not guess metadata sizes. Events remain available independently of optional sampling. Raw frames are deferred. **[ASSUMED: recorder.fullPolicy; FICTIONAL: P8 persistence]**

## Modes and commands

All 1C modes and ratings are in the definition (`params["mode.<mode>.<quantity>"]`):

| Assemblies | Modes and meaning |
|---|---|
| Fuel cells / batteries / PDUs | `following`; `idle`/`discharge`/`charge`; `active`; each also supports `off`. Idle batteries bridge shortages and absorb real surplus solar. |
| ECLSS, pumps, flight CPUs | `off`/`standby`/`active`; protect the last active essential function. |
| IMUs / star trackers | `off`/`active`; separate devices and RNG streams. |
| Main / RCS | `off`/`ready`/`heater`; firing modes are managed by burns/control. A pod fires one jet (`fire-one`, 40 W) or two at once (`fire-two`, 65 W). |
| Camera | `off`/`survey`/`track`/`detail`: baseline 60/120/200 W. |
| Science processor | `off`/`idle`/`science`/`lattice`: electrical and thermal loads; no field product yet. |
| Recorder | `off`/`minimum`/`normal`/`high`: 0/1/10/50 Hz targets. |
| Comms / console / exchanger | `off` plus `listen`/`transmit`, `active`/`dim`, `regulated`/`antifreeze` respectively. No receiver is implied. |
| Appendages | Solar `stowed`/`deploying`/`deployed`; radiators `hold`/`moving`; configuration controls geometry. |
| Passive hardware / crew | Passive `off` retains mass and heat; crew remains `occupied`. |

**[ASSUMED]** `reset` is an additional mode-command action, never a persistent operating mode. RCS pods also take the actions `bank-a`, `bank-b` and `jet-0` … `jet-4`.

| Command | Behavior |
|---|---|
| `burn` | Main/RCS timed pulse demand with throttle `(0,1]`. Reject unknown/unavailable hardware, invalid durations and total impulse below the baseline minimum bit. Replaces that device's previous manual burn. A pod burn fires the pod's selected jet and takes the pod from the controller for its duration. Ion burns explicitly await Phase 3. |
| `cutoff` | Clears selected/all manual burns and queued pulses immediately. All also selects free attitude, ends a hands-on hold and stops a hands-on translation. Individual cutoff inhibits that pod's automatic control until a new attitude, a `fly`, or its burn command. |
| `attitude` / burn attitude | `free`, a finite `inertial` attitude (any non-zero quaternion; it is normalised) and a finite body `rate`, on three axes (§ Attitude control). `direction` and belief-relative prograde/retrograde/toward/away must first be resolved by the game; unresolved commands are rejected (P11). |
| `fly` | Hands-on controls, in force until the next `fly` (§ Hands-on flying). Each axis must be within −1..1 and throttle within 0..1; anything else is rejected. |
| `power` | Load allocation ceiling capped at hardware rating; source/battery allocations are ignored. Cannot deliberately starve the last active essential function. |
| `mode` | Select supported mode; direct firing modes require `burn`. Activate and power a healthy spare before disabling its essential peer. Reset requires intact hardware, cleared fault, acceptable temperature and reset delay; resources/condition are preserved. |
| RCS actions | Bank change cancels that manual burn and resets readiness; identical spare geometry requires 20 s powered warm checkout at >=285 K. `jet-<n>` selects which of the pod's five jets a manual pod burn fires. Either cancels queued pulses. |
| `point` | Supplied target lock or finite, non-zero inertial direction in 3D (target null), with baseline settling. Absent/invalid target gives no fix. |
| `configure` | `stowed`, `radiators`, `solar`, `allDeployed`; powered continuous travel, retained partial position. Transition reasserts motor modes; allocation 0 stalls travel. |
| `recorder` | 0–50 Hz target; electrical demand interpolates through baseline 15/35/100 W at 1/10/50 Hz; actual draw limits cadence. |
| `mark` | No physical effect; game records annotation. |

Rejections are `command-rejected` events. Chemical throttles mean pulse duty, not arbitrary deep throttling. Demand accumulates until a minimum pulse can start. A committed pulse can finish after nominal burn end by at most its minimum on-time (main 0.1 s, RCS 0.05 s); explicit cutoff interrupts it. Trailing incomplete demand becomes `unservedImpulse`, never extra thrust.

## Propulsion

### Main engine

24 kN at the mount (−7, 0.08, 0), nominal direction +x. Two mount errors and a two-axis gimbal turn the thrust: **yaw** about body +z (toward +y) and **pitch** about body −y (toward +z); the force direction is `(cos p cos y, cos p sin y, sin p)` with y = mount yaw error + yaw gimbal and p = mount pitch error + pitch gimbal (`tiltDirection`).

- Mount errors (truth): `values.misalignment` (parameter `thruster.<id>.misalignment`, nominal 0.003 rad) and `values.misalignmentPitch` (`thruster.<id>.misalignment-pitch`, nominal 0); `values.thrustScale` scales the thrust.
- Gimbal: while the engine is ready, each axis moves toward the angle that puts the thrust line through the current centre of mass, within ±0.035 rad and 0.02 rad/s per axis (`values.gimbal`, `values.gimbalPitch`). At arrival the centre of mass is 0.08 m to the right of and 0.105 m below the mount's line, so the thrust settles 11.7 mrad to the right and 15.7 mrad down of the body axis: **the thrust line is not the body axis** (1C's point, now in two axes). In a planar game that is 0.012% less in-plane thrust and 1.57% of the thrust out of plane.

### RCS layout

Four pods at (±5, ±2, 0), two banks each (A active, B spare), five jets per pod and bank after 1E's drawing (nozzles fore, aft, up, down and outboard; the force on the ship is opposite the nozzle). 200 N, 220 s, 10 N·s minimum bit per jet; at most two valves open in a pod. All of a pod's jets act at the pod's position.

| Jet | Nozzle | forward-left | forward-right | aft-left | aft-right |
|---|---|---|---|---|---|
| 0 | axial (1C's jet 0) | +x | −x | +x | −x |
| 1 | outboard | −y | +y | −y | +y |
| 2 | axial, the other way | −x | +x | −x | +x |
| 3 | down | +z | +z | +z | +z |
| 4 | up | −z | −z | −z | −z |

Jets 0 and 1 keep 1C's mode names. **Jet 1 of `rcs-forward-left` and `rcs-aft-right` pushes the opposite way to 1C's planar layout** (which had the forward pods both push +y and the aft pods both −y): an outboard nozzle can only push inboard, and with every pod's lateral jet inboard the ship can translate sideways without turning and yaw equally both ways.

| Authority of one bank (arrival) | − / + | Acceleration |
|---|---|---|
| Roll torque (couples, no net force) | ∓1,600 N·m | 0.0156 rad/s² |
| Pitch torque | ∓4,000 N·m | 0.0130 rad/s² |
| Yaw torque | ∓3,600 N·m (1C: −1,600 / +4,000) | 0.0111 rad/s² |
| Force along x | ∓800 N | 0.0263 m/s² |
| Force along y | ∓400 N | 0.0132 m/s² |
| Force along z | ∓800 N installed, 750 N without torque | 0.0247 m/s² |

Cross-coupling: every torque set is a set of couples, so turning pushes nothing. Translation is balanced about the centre of mass by the allocator: along z the forward pods throttle to 88% (the centre of mass is 0.33 m aft of the pods' centre); along y a 33 N axial couple and 10 N of vertical jets cancel 133 N·m of yaw and 42 N·m of roll; along x 8 N of vertical jets cancel 84 N·m of pitch (the centre of mass is 0.105 m below the pods).

### Jet allocator (`propulsion/allocator.ts`)

`allocateJets(jets, centreOfMass, force, torque, options)` returns a duty (0..1) per jet. It is a small linear programme solved exactly by a deterministic simplex: deliver as much of the demanded torque and then of the demanded force as the jets allow, each along its own direction, with the least propellant, every duty at most 1 and at most two jet-seconds per second in a pod. A torque comes back as a couple and a force as a balanced push; a demand beyond the jets' authority is scaled back, not bent. With pods missing it still finds clean couples where they exist, fires a single jet when its side effect is small against its use, and otherwise leaves the demand unmet. Duties feed each jet's own minimum-bit accumulator (`ext['propulsion.pulses']`), so thrust is always whole 10 N·s bits and both jets of a couple fire in the same step.

### Attitude control (`propulsion/control.ts`)

Three axes, body frame, using the truth kinematics in `EnvironmentEffects` (as 2B did), real jets and a powered flight CPU. **[ASSUMED]** play values in `propulsion.attitudeControl`:

| Value | | Meaning |
|---|---|---|
| `rateGain` | 0.4 /s | commanded angular acceleration per unit rate error (2B's value) |
| `attitudeGain` | 0.1 /s | commanded rate per unit attitude error (2B's 0.04 /s² = 0.4 × 0.1) |
| `slewRate` | 0.008 rad/s | largest rate asked when turning to an attitude: 80% of the star trackers' 0.01 rad/s |
| `attitudeDeadband` | 0.002 rad | attitude error per body axis left alone |
| `rateDeadband` | 0.0004 rad/s | rate error per body axis left alone; wider than one minimum bit can cross in any configuration (checked) |
| `handsOnTurnRate` | 0.008 rad/s | body rate of a full yaw or pitch deflection |
| `torquePriority` | 10 | weight of torque over force in the allocator |

Law: for `inertial`, the remaining turn is the rotation vector of `conj(attitude) ⊗ target` (body frame, the short way); the commanded rate is `attitudeGain ×` the error beyond the deadband on each axis, its magnitude capped at `slewRate`. For `rate` the commanded rate is the target. On each axis whose rate error exceeds `rateDeadband`, angular acceleration = `rateGain ×` rate error; torque = inertia tensor × acceleration; the allocator turns it into jets. Manual pod burns override control per pod.

Measured in `propulsion/control.test.ts` with the rigid body integrated in the test (semi-implicit Euler, dt = 1 s; `test-helpers.ts`), arrival mass properties, nothing disturbing the ship:

| Case | Result |
|---|---|
| Hold, ship at rest | 0 kg/h (no firing at all) |
| Hold after a manoeuvre (rates left inside the deadband) | 0.3–1.2 kg/h, attitude within about 0.7° (2B: about 12 kg/h) |
| 90° turn in yaw / pitch | settled in 215 s / 211 s, 0.50 kg / 0.42 kg |
| 180° turn in yaw / pitch | settled in 420 s / 415 s, 0.51 kg / 0.44 kg (2B: 15–29 kg) |
| Peak rate in a turn | 0.0077–0.0084 rad/s, under the star trackers' 0.01 (2B: 0.18) |
| 1° / 5° trim in yaw | 7 s, 0.03 kg / 22 s, 0.38 kg |

A turn costs about the same propellant whatever its angle (spin up to the slew rate, coast, stop); only very small turns are cheaper.

## Hands-on flying (`fly`)

The input stays in force until the next `fly`. All axes are body frame.

- **`translate`** (−1..1 per axis): the jets push along the body axes with the deflection times 800, 400 and 800 N, balanced about the centre of mass, for as long as the control is held. The attitude target in force keeps the ship from turning.
- **`yaw`, `pitch`** (−1..1): a body rate target of `handsOnTurnRate` about +z and −y, with the **roll rate held at zero**. Both together are one turn: the demanded rate never exceeds `handsOnTurnRate` (the stick's travel is a circle, `handsOnRate`), so a diagonal turn also keeps the star trackers' fix. A deflection of 5% or less asks for no more than the rate deadband and does nothing.
- **Sticks centred** (yaw and pitch both 0, whatever the translation and throttle): the rates are nulled, and when every body rate is inside the rate deadband the attitude the ship has **at that moment** becomes an `inertial` target (`ext.handsOnHold`: `'pending'`, then `'held'`). Released controls therefore give a steady ship, which is what the coasting forecast assumes. A later `fly` with the sticks still centred keeps that attitude; turning, an `attitude` command, a burn with an attitude or a cutoff of everything ends the hold.
- **`throttle`** (0..1): a main-engine burn with no planned end, replaced or removed by the next `fly`. It does not cancel a timed burn commanded since, and does not wake an engine that is off, tripped or failed.

What a player can do (arrival mass, `handson.test.ts` and scratch runs with the same integrator):

| Control | Result | RCS propellant |
|---|---|---|
| Translate ±x | 0.0263 m/s² (1.58 m/s per minute) | 22.7 kg/min |
| Translate ±y | 0.0132 m/s² (0.79 m/s per minute) | 13.5 kg/min |
| Translate ±z | 0.0247 m/s² (1.48 m/s per minute) | 20.9 kg/min |
| Yaw or pitch, full deflection | 0.008 rad/s (0.46°/s) reached in 6–7 s | 0.25 kg / 0.22 kg to start, the same to stop |
| Release | rates nulled and attitude held about 7 s later | then as a hold |
| Throttle 1 | 0.79 m/s² (15.8 m/s in 20 s), thrust line 1.1° off the body axis | main: 7.65 kg/s |

The 300 kg of RCS propellant is about 13 minutes of translation, or several hundred turns.

### Drawing thrust

The view is built from recorded commands and the nominal design, not from truth. The design says where every jet is and which way it pushes:

- `nominalJets(definition)`: every jet's id, pod, bank, index, body-frame `point`, unit force `direction` and thrust. The same is in `definition.systems.propulsion.rcs.jets` (`equipmentId`, `direction`, `nozzle`) with the pod positions in `definition.equipment[].mount.position`; a pod's `mount.direction` is its jet 0. The main engine's mount is `definition.equipment['main-engine'].mount`: (−7, 0.08, 0), direction +x.
- `handsOnFirings(definition, input, massProperties?)`: the nominal firings for a `HandsOnInput` as `{ source, jet?, point, direction, force }`, from the same control law and allocator the step uses, for a ship at rest on bank A with every pod available. Pass the believed mass properties; without them the design's arrival loading is used. `nominal.test.ts` checks that it is exactly what the step asks of its jets.

| Demand | Jets that fire (pod:jet), mean force | Small trims |
|---|---|---|
| translate +x | forward-left:0, forward-right:2, aft-left:0, aft-right:2, 200 N each | forward-right:3, aft-right:4 at 8 N |
| translate −x | forward-left:2, forward-right:0, aft-left:2, aft-right:0, 200 N each | forward-left:4, aft-left:3 at 8 N |
| translate +y | forward-right:1, aft-right:1, 200 N each | forward-left:0 and forward-right:0 at 33 N; forward-left:3, forward-right:4 at 10 N |
| translate −y | forward-left:1, aft-left:1, 200 N each | forward-left:2 and forward-right:2 at 33 N; forward-left:4, forward-right:3 at 10 N |
| translate +z | jet 3 of all four pods: 175 N forward, 200 N aft | |
| translate −z | jet 4 of all four pods: 175 N forward, 200 N aft | |
| yaw + (nose left) | forward-right:1, aft-left:1, 104 N each while the turn starts | forward-left:3, forward-right:4 at 8 N |
| yaw − | forward-left:1, aft-right:1 | forward-left:4, forward-right:3 at 8 N |
| pitch + (nose up) | forward-right:3, aft-right:4, 98 N each while the turn starts | |
| pitch − | forward-left:4, aft-left:3 | |
| throttle | main engine at its mount, +x, throttle × 24 kN | |

Translation jets fire for as long as the control is held. Turn jets fire only until the rate is reached (6–7 s), then the ship coasts; on release the opposite couple fires to stop it. Trims under about 1 N also appear in the list (they balance the 2 mm lateral offset of the centre of mass); a view can drop firings below a threshold. Truth differs from this by the hidden mount errors and thrust scale, by pulse quantisation, and where pods are unavailable.

## Sensing

- **Camera.** Boresight `sensing.camera.boresight` (body +x) carried by the attitude; pointed along a 3D direction or locked on an object by `point`. The field of view is a cone of half-angle `fovHalfAngle` (π/6, 2B's value; 1E drew ±26°). A bearing is `[azimuth, elevation]` with an isotropic pointing error: sigma `[σ / cos(elevation), σ]`, guarded at the poles. σ grows linearly to twice its on-axis value at the edge of the cone. Smear uses the apparent angular rate in 3D: the line of sight's rate minus the ship's, less the part about the line of sight. Visibility flags, power, exposure, settling and known-size range as before. A settled target lock assumes ideal camera steering; target drift still incurs smear.
- **Star trackers.** A fix is the rotation vector of the measured attitude: the true attitude times a small rotation with an independent error of `angularSigma` about each body axis. No fix while the **magnitude** of the angular velocity exceeds 0.01 rad/s, or without a visible sky.
- **Inertial units.** Three-axis specific force (body frame, COM, P7: never gravity) with a persistent bias and noise per axis, and three-axis rate with a persistent bias and noise per axis. The lever-arm correction to the COM is taken as done (1C's policy).
- **Noise streams.** Each instrument has two seeded streams. `sensors.<id>` gives the planar components in their old order: azimuth and range; biases x, y and yaw-gyro, then acceleration x, y and yaw rate; the star tracker's error about body z. `sensors.<id>/3d` gives the rest: elevation; bias z and gyro biases x, y, then acceleration z and rates x, y; the star tracker's errors about body x and y. A planar scene therefore records exactly the azimuths, ranges, x–y accelerations and yaw rates it did before (`sensing3d.test.ts` replays the stream); a star tracker's yaw differs from the planar ship's by the second order of the new x and y errors (below 1e-9 rad). Both streams must be in `state.rng` (`createShipSystemsState` makes them); a state without them throws.

## Sunlight (A3)

Solar output and the radiators' absorbed heat use `max(0, cos θ)` between the direction to the sun and `generation.solar.arrayNormal` (body +x: the wings are feathered about their span to face forward, as the planar model assumed) carried into the inertial frame by the attitude (`power/sun.ts`). With the sun and the nose in the inertial x–y plane this is exactly the planar `cos(sun azimuth − yaw)`. A sun 30° above a level ship gives cos 30°; the planar ship ignored the sun's height.

## Couplings traced to 1C

| IDs | Implemented behavior and baseline entries |
|---|---|
| C01, C05, C14 | `sensing.camera`: warmup/calibration/settling, bounded power/exposure/condition quality, a cone field of view and apparent target/body motion smear in 3D. Angular error projects to transverse error proportional to range. Bearing only without a declared known-size prior. `sensing.imu`: persistent seeded biases and noisy COM specific force/rate on three axes; `starTracker`: cadence, rate-magnitude and visible-sky gates. [ESTABLISHED: S04, DD05, DD07] |
| C02 | `propulsion.main/rcs`, `propellant`, `reactants`, equipment mass/position/intrinsic inertia: `F/(Isp*g0)` flow, finite impulse, depletion, mount errors on two axes, bounded two-axis gimbal, direct mass/COM/inertia-tensor sums including retained water. Forces at mounts go to the sim for torque. [ESTABLISHED: S12–S14, S24] |
| C03, C09 | `buses`, `power.loadPriorities/shedOrder/nonSheddable/reserveEnergyPerBattery/rpc`: separate buses, converter losses, optional shedding, protected essential demand and recorder minimum, real shortages, local latched overcurrent, surviving spare priorities and deliberate reset. [ESTABLISHED: S01, S17] |
| C04 | `configuration.appendages`, deployment times: powered interpolation of centroid, polygon and the three intrinsic inertia terms. The hull is the pressure hull's prism plus each wing's prism at its current extension. Same actual extension governs cooling and generation, including asymmetric stalls. [ESTABLISHED: S21, S24] |
| C06 | `recorder`: cadence costs power/heat/storage; no optional acquisition past capacity, no deletion of acquired records. [ESTABLISHED: S20; FICTIONAL: recorder.persistence] |
| C10 | `propulsion.rcs.warmupTime/warmupTemperature/bankPolicy`: bank readiness and minimum impulse per jet; a pod not warm, off, tripped or inhibited is left out of the allocation. Shared service-node temperature; no invented independent cold spare nozzle. [ESTABLISHED: S15, DD09] |
| C11 | `modes.*.heat`, `thermalNodes/Loops/Links`, `radiators`: finite capacities, conservative pump-dependent transport/passive conduction, louvers/net radiation, retained temperatures. Crew metabolism persists; chemical heat follows achieved impulse (100 W per firing jet). Freeze rupture, regulator faults and permanent thermal damage await Phase 3. [ESTABLISHED: S02, S09–S11] |
| C12, C13 | `generation.solar/fuelCell/battery`: measured irradiance, 3D incidence on the array normal, shadow, deployment; ramping sources; HHV fuel balance, H2/O2 into retained water; battery energy, efficiency, temperature and power limits. [ESTABLISHED: S01] |
| C15, C17 | Equipment/communications modes consume power and deposit heat, excluding RF export. No inferred link, free external ranging, lattice reconstruction or correctness-by-vote. [ESTABLISHED: S07, S20, S22, DD10] |

**[DEMONSTRATED: tests under this folder]** Baseline mass/COM values and the inertia tensor per configuration, rocket-equation consistency, nonnegative inventories, electrical/thermal ledgers, bus isolation, shedding, source exhaustion, sensing gates in 3D, acquisition limits, stalled deployment, allocator couples and authority, the gimbal through an off-axis centre of mass, three-axis control with its propellant use, hands-on flying and deterministic JSON replay pass. No route or full spacecraft transient is certified by these tests.

## Integration and state conventions

**[ASSUMED]** Until dedicated environment fields are agreed, `EnvironmentEffects.fieldSignals` optionally carries:

- Sunlight comes from the typed `EnvironmentEffects.sunlight` (direction toward the sun, irradiance after body shadows; DECISIONS A3). `illumination` carries only an optional `{ sinkTemperature }` in K; without it the radiator reference sink is 1C's 3 K.
- `ship-environment`: `{ starsVisible?, opticsValid?, visibility?: { [id]: boolean }, knownSizeTargets?: string[] }`. Present targets are eligible by default; game must remove or invalidate occluded/dark targets. Known-size defaults empty; stars default visible in an assumed locally bootstrapped relative frame, not an Earth catalogue match.

Persistent equipment `values`: battery `charge` (J); source terminal `output` and average `generatedPower` (W); dispatch `requestedPower/unmetPower/heat`; appendage `deployment`; thruster `readyTime/bank/selectedJet/gimbal/gimbalPitch/pendingImpulse/pulseRemaining/impulse/massFlow/unservedImpulse/controlInhibited` (for a pod, `pendingImpulse/pulseRemaining` belong to its manual burn; `impulse/massFlow/heat` are the pod's totals); sensor `readyAt`, accelerometer `biasX/biasY/biasZ`, gyro `gyroBiasX/gyroBiasY/gyroBias` (the last is the z axis); radiator `louverEmission`. True thrust overrides are `misalignment`, `misalignmentPitch` and `thrustScale`; `feed.<tankId> = 0` isolates a thruster feed. These are truth state, not model inputs. The game maps hidden parameters into them (`src/game/arrival.ts`); today it maps `misalignment`, `scale`, `bias-x`, `bias-y` and `bias`, so `misalignment-pitch` and `bias-z` still need mapping to `misalignmentPitch` and `biasZ`.

`ext.power` rates (W) satisfy `generated + discharged = load + charged + conversionLoss`; `batteryLoss` separately reports conversion heat. Per-bus ledgers and `tieClosed` are included. Tie defaults open; no typed tie command exists, so an explicit game adapter must authorize closure. Fault injection uses `values.faultPower`, with persisted overload history and `trippedAt`. `ext.thermal` contains `heatInput`, net `radiated`, `storedEnergyChange`, `energyResidual`. `ext.sensorPointing` and `ext.sensors` retain pointing and acquisition deadlines. `ext['propulsion.control']` is what the controller asked this step (`{ [pod]: { [jet index]: duty } }`); `ext['propulsion.pulses']` is each automatically fired jet's minimum-bit bookkeeping (`{ [jet id]: { pending, pulse } }`, only jets that owe something). `ext.handsOn` holds the last `fly` input, `ext.handsOnBurnUntil` the end time of the burn it started (null when none), and `ext.handsOnHold` whether released controls are nulling the rates (`'pending'`) or holding (`'held'`). The state is plain JSON: no Infinity and no negative zero is stored.

Telemetry channels follow `<equipment|tank|bus|node id>.<quantity>`; resource/node/bus readings identify the recorder as source. Ideal housekeeping gauges have zero sigma; instrument noise remains explicit. No module reads or mutates an archive. The sim owns force-to-torque conversion, Euler's equations and angular momentum during inertia changes. The game/field owner sweeps whole occupied geometry for collision/exposure. Lattice damage/reconstruction, consumable crew hazards, raw imagery, communications delivery and ion thrust remain later-phase work.

## Speed

Geometry and mass properties are functions of the design, the configuration, the appendage extensions and the tank contents only; the last few results are remembered per definition (`getGeometry`, `massDetail`), so a step computes them once where it used to compute them five times. The remembered values are the numbers a recomputation gives; nothing in the memo is state, and a seeded run is bit for bit the same with and without it. The power dispatch fills one working copy of each equipment record instead of copying it for every change. Measured side by side on the same machine: 0.176 ms per tick before 2G's step 3, 0.113 ms after (coasting, recorder at the game's 0.05 Hz); holding an attitude 0.186 → 0.113 ms. A tick with a hands-on translation held costs 0.17 ms (the allocator solves its programme every step).

## Verify

`npm test -- src/ship`, `npm test`, `npm run build`, `npm run lint`, `python docs/engineering/validate_baseline.py`.

Phase 3 ownership: 3A power/thermal/condition/config/massprops/propulsion; 3C sensors. Encounter boundaries must not reset physical state.
