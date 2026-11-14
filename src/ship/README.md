# Ship systems v1 — 2B

Pure `ShipSystemsStep` using the [1C baseline](../../data/ship-baseline.json). Hardware ratings and approximations remain **[ASSUMED]** as labelled by 1C. Source IDs resolve through [the bibliography](../../References/BIBLIOGRAPHY.md); they support mechanisms, not qualification or playability of this ship.

```ts
import { loadShipDefinition, createShipSystemsState, stepShipSystems } from './index.ts';
const definition = loadShipDefinition();
const initial = createShipSystemsState(definition, 'gravity-range');
const result = stepShipSystems(initial, definition, commands, environment, dt);
// { state, actuators, measurements, events }
```

`step` aliases `stepShipSystems`; `computeMassProperties` is exported too. Use the real definition/state together: contract fixtures describe a different mock ship. The loader projects structure once, 41 other assemblies, seven resource tanks including reactants/product water, four buses, four thermal nodes and four configurations. Full 1C detail is retained under `systems`.

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
| Main / RCS | `off`/`ready`/`heater`; firing modes are managed by burns/control. One selected jet per pod in v1; nominal `fire-two` is deferred. |
| Camera | `off`/`survey`/`track`/`detail`: baseline 60/120/200 W. |
| Science processor | `off`/`idle`/`science`/`lattice`: electrical and thermal loads; no field product yet. |
| Recorder | `off`/`minimum`/`normal`/`high`: 0/1/10/50 Hz targets. |
| Comms / console / exchanger | `off` plus `listen`/`transmit`, `active`/`dim`, `regulated`/`antifreeze` respectively. No receiver is implied. |
| Appendages | Solar `stowed`/`deploying`/`deployed`; radiators `hold`/`moving`; configuration controls geometry. |
| Passive hardware / crew | Passive `off` retains mass and heat; crew remains `occupied`. |

**[ASSUMED]** `reset` is an additional mode-command action, never a persistent operating mode. RCS also exposes `bank-a`, `bank-b`, `jet-0`, `jet-1` actions.

| Command | Behavior |
|---|---|
| `burn` | Main/RCS timed pulse demand with throttle `(0,1]`. Reject unknown/unavailable hardware, invalid durations and total impulse below the baseline minimum bit. Replaces that device's previous manual burn. Ion burns explicitly await Phase 3. |
| `cutoff` | Clears selected/all manual burns and queued pulses immediately. All also selects free attitude. Individual cutoff inhibits that pod's automatic control until a new attitude or its burn command. |
| `attitude` / burn attitude | Support `free`, finite `inertial` angle and angular `rate`. Powered flight CPU and real RCS forces provide control. Belief-relative prograde/retrograde/toward/away must first be resolved by the game from belief; unresolved commands are rejected. |
| `power` | Load allocation ceiling capped at hardware rating; source/battery allocations are ignored. Cannot deliberately starve the last active essential function. |
| `mode` | Select supported mode; direct firing modes require `burn`. Activate and power a healthy spare before disabling its essential peer. Reset requires intact hardware, cleared fault, acceptable temperature and reset delay; resources/condition are preserved. |
| RCS actions | Bank change cancels that manual burn and resets readiness; identical spare geometry requires 20 s powered warm checkout at >=285 K. Jet 0/1 selects the installed axial/transverse direction. |
| `point` | Supplied target lock or finite inertial angle (target null), with baseline settling. Absent/invalid target gives no fix. |
| `configure` | `stowed`, `radiators`, `solar`, `allDeployed`; powered continuous travel, retained partial position. Transition reasserts motor modes; allocation 0 stalls travel. |
| `recorder` | 0–50 Hz target; electrical demand interpolates through baseline 15/35/100 W at 1/10/50 Hz; actual draw limits cadence. |
| `mark` | No physical effect; game records annotation. |

Rejections are `command-rejected` events. Chemical throttles mean pulse duty, not arbitrary deep throttling. Demand accumulates until a minimum pulse can start. A committed pulse can finish after nominal burn end by at most its minimum on-time (main 0.1 s, RCS 0.05 s); explicit cutoff interrupts it. Trailing incomplete demand becomes `unservedImpulse`, never extra thrust. Controller gains 0.04 angle-error and 0.4 rate-error are **[ASSUMED]**; manual burns override control per pod.

## Couplings traced to 1C

| IDs | Implemented behavior and baseline entries |
|---|---|
| C01, C05, C14 | `sensing.camera`: warmup/calibration/settling, bounded power/exposure/condition quality, FOV and apparent target/body motion smear. Angular error projects to transverse error proportional to range. Bearing only without a declared known-size prior. `sensing.imu`: persistent seeded biases and noisy COM specific force/rate; `starTracker`: cadence, yaw-rate and visible-sky gates. [ESTABLISHED: S04, DD05, DD07] |
| C02 | `propulsion.main/rcs`, `propellant`, `reactants`, equipment mass/position/intrinsic inertia: `F/(Isp*g0)` flow, finite impulse, depletion, mount errors, bounded gimbal, direct mass/COM/inertia sums including retained water. Forces at mounts go to the sim for torque. [ESTABLISHED: S12–S14, S24] |
| C03, C09 | `buses`, `power.loadPriorities/shedOrder/nonSheddable/reserveEnergyPerBattery/rpc`: separate buses, converter losses, optional shedding, protected essential demand and recorder minimum, real shortages, local latched overcurrent, surviving spare priorities and deliberate reset. [ESTABLISHED: S01, S17] |
| C04 | `configuration.appendages`, deployment times: powered interpolation of centroid, polygon and intrinsic inertia. Convex hull of hull/current appendages is the common conservative footprint. Same actual extension governs cooling and generation, including asymmetric stalls. [ESTABLISHED: S21, S24] |
| C06 | `recorder`: cadence costs power/heat/storage; no optional acquisition past capacity, no deletion of acquired records. [ESTABLISHED: S20; FICTIONAL: recorder.persistence] |
| C10 | `propulsion.rcs.warmupTime/warmupTemperature/bankPolicy`: bank readiness and minimum impulse. Shared service-node temperature; no invented independent cold spare nozzle. [ESTABLISHED: S15, DD09] |
| C11 | `modes.*.heat`, `thermalNodes/Loops/Links`, `radiators`: finite capacities, conservative pump-dependent transport/passive conduction, louvers/net radiation, retained temperatures. Crew metabolism persists; chemical heat follows achieved impulse. Freeze rupture, regulator faults and permanent thermal damage await Phase 3. [ESTABLISHED: S02, S09–S11] |
| C12, C13 | `generation.solar/fuelCell/battery`: measured irradiance/yaw/shadow/deployment; ramping sources; HHV fuel balance, H2/O2 into retained water; battery energy, efficiency, temperature and power limits. [ESTABLISHED: S01] |
| C15, C17 | Equipment/communications modes consume power and deposit heat, excluding RF export. No inferred link, free external ranging, lattice reconstruction or correctness-by-vote. [ESTABLISHED: S07, S20, S22, DD10] |

**[DEMONSTRATED: tests under this folder]** Baseline mass/COM values, rocket-equation consistency, nonnegative inventories, electrical/thermal ledgers, bus isolation, shedding, source exhaustion, sensing gates, acquisition limits, stalled deployment and deterministic JSON replay pass. No route or full spacecraft transient is certified by these tests.

## Integration and state conventions

**[ASSUMED]** Until dedicated environment fields are agreed, `EnvironmentEffects.fieldSignals` optionally carries:

- `illumination`: `{ irradiance, angle, shadow?, sinkTemperature? }` in W/m², inertial radians and K. Missing light means zero solar; radiator reference sink is 1C's 3 K.
- `ship-environment`: `{ starsVisible?, opticsValid?, visibility?: { [id]: boolean }, knownSizeTargets?: string[] }`. Present targets are eligible by default; game must remove or invalidate occluded/dark targets. Known-size defaults empty; stars default visible in an assumed locally bootstrapped relative frame, not an Earth catalogue match.

Camera half-FOV defaults to `pi/6` (`params.fovHalfAngle` overrides). A settled target lock assumes ideal camera steering; target drift still incurs smear. Detailed gimbal travel/stellar-map acquisition await Phase 3. These are explicit **[ASSUMED]** adapter choices.

Persistent equipment `values`: battery `charge` (J); source terminal `output` and average `generatedPower` (W); dispatch `requestedPower/unmetPower/heat`; appendage `deployment`; thruster `readyTime/bank/selectedJet/gimbal/pendingImpulse/pulseRemaining/impulse/massFlow/unservedImpulse`; sensor `readyAt/biasX/biasY/gyroBias`; radiator `louverEmission`. True thrust overrides are `misalignment` and `thrustScale`; `feed.<tankId> = 0` isolates a thruster feed. These are truth state, not model inputs.

`ext.power` rates (W) satisfy `generated + discharged = load + charged + conversionLoss`; `batteryLoss` separately reports conversion heat. Per-bus ledgers and `tieClosed` are included. Tie defaults open; no typed tie command exists, so an explicit game adapter must authorize closure. Fault injection uses `values.faultPower`, with persisted overload history and `trippedAt`. `ext.thermal` contains `heatInput`, net `radiated`, `storedEnergyChange`, `energyResidual`. `ext.sensorPointing`, `ext.sensors` and `ext['propulsion.control']` retain pointing, acquisition deadlines and controller requests.

Telemetry channels follow `<equipment|tank|bus|node id>.<quantity>`; resource/node/bus readings identify the recorder as source. Ideal housekeeping gauges have zero sigma; instrument noise remains explicit. No module reads or mutates an archive. The sim owns force-to-torque conversion and angular momentum during inertia changes. The game/field owner sweeps whole occupied geometry for collision/exposure. Lattice damage/reconstruction, consumable crew hazards, raw imagery, communications delivery and ion thrust remain later-phase work.

## Verify

`npm test -- src/ship`, `npm test`, `npm run build`, `npm run lint`.

Phase 3 ownership: 3A power/thermal/condition/config/massprops/propulsion; 3C sensors. Encounter boundaries must not reset physical state.
