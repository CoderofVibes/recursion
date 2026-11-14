# src/contracts — shared types

Owner: integrator (1A, then 2F/5A). Other sections request changes in their handoff note; they do not edit these files.

Types and tiny helpers only. No game logic. Everything here is plain, JSON-serialisable data unless noted.

## Two worlds (DECISIONS P11)

| Import from | Contains | Who may import |
|---|---|---|
| `src/contracts/index.ts` | Shared and belief-side types: ship design, commands, measurements, believed world, model, forecasts, Black Box records, encounter briefing, view snapshot | Everyone |
| `src/contracts/truth/index.ts` | Truth: the real world, the ship's real systems state, the ship-systems step, environment fields, full encounter definitions | `src/sim`, `src/ship`, `src/content`, `src/game` only |

`src/model`, `src/blackbox`, `src/console` and `src/view3d` are **belief side**. ESLint blocks them from importing `src/sim/`, `src/contracts/truth/`, `fixtures/truth.ts` and `fixtures/generate.ts` (`eslint.config.js`, proven by `boundary.test.ts`). The game layer (`src/game`) is the only code holding both; it turns truth into measurements, events and the view snapshot.

## Conventions

- **Units:** SI everywhere (m, kg, s, N, W, J, K, rad, Gy). `units.ts` aliases document intent; they are plain numbers. Fields carry no unit suffix; the JSDoc says the unit when it is not obvious.
- **Time:** sim seconds since the encounter's arrival (t = 0). Plans use times relative to their epoch.
- **Angles:** radians, counter-clockwise from inertial +x. Attitude is the inertial angle of body +x.
- **Body frame:** origin at the structural datum; +x is the body axis (the direction the main engine pushes the ship); +y is 90° counter-clockwise. Footprints are counter-clockwise polygons in this frame.
- **Vectors:** `Vec2` from `src/lib/vec2.ts` (planar flight, P1).
- **Covariance:** `Cov2 = [xx, xy, yy]` for 2D; `CovarianceMatrix` (row-major with labelled ids) for parameters.
- **IDs:** kebab-case strings, stable across saves (`alpha`, `main-engine`, `attempt-0003`).
- **Immutability:** issued forecasts are deep-frozen (`issueForecast`). Treat all other contract data as immutable too; produce new objects rather than mutating.

### Parameter IDs (proposed; 1G may refine)

Dotted paths, shared by the model's estimates and truth's `HiddenParameters`:

| ID | Meaning | Unit |
|---|---|---|
| `body.<bodyId>.mu` | Body's Newtonian-equivalent GM (at its reference radius, P4) | m³/s² |
| `law.gravity.exponent` | Distance-law exponent n (extension `distance-law`) | — |
| `thruster.<equipmentId>.scale` | Thrust scale factor (true / nominal) | — |
| `thruster.<equipmentId>.misalignment` | Thrust direction error | rad |
| `sensor.<equipmentId>.bias-x`, `.bias-y`, `.bias` | Sensor biases | sensor unit |
| `unmodeled.<n>.mu`, `.x`, `.y` | Extra body (extension `unmodeled-body`) | m³/s², m |
| `empirical.ax`, `empirical.ay` | Constant unexplained acceleration (extension `empirical-acceleration`) | m/s² |

### Telemetry channels

`<equipment|tank|bus|thermal node id>.<quantity>`, SI units: `battery-1.charge` (J), `tank-main.propellant` (kg), `bus-a.load` (W), `node-avionics.temperature` (K), `black-box.bytes` (B).

### Measurement kinds

| Kind | `value` | Needs | Notes |
|---|---|---|---|
| `bearing` | [θ] rad | `target` | Inertial direction from ship to target centre |
| `range` | [ρ] m | `target` | Ship to target centre |
| `relative-position` | [x, y] m | `target` | Ship minus target, inertial |
| `accel` | [ax, ay] m/s² | — | Non-gravitational specific force, **body frame**. Gravity is never sensed (P7) |
| `attitude` | [ψ] rad | — | Star tracker |
| `rate` | [ω] rad/s | — | Gyro |
| `telemetry` | [v] | `channel` | Housekeeping reading |
| `dose-rate` | [Ḋ] Gy/s | — | At the sensing equipment |
| `field-signal` | field-specific | `field` | Processed field product (e.g. lattice reconstruction) |

`sigma` always has the same length as `value` (one-sigma per component).

## Files

### `units.ts`, `ids.ts`
Unit aliases (`Seconds`, `Meters`, `Watts`, `Gray`, …), `JsonValue`, and ID aliases (`BodyId`, `EquipmentId`, `AttemptId`, `ParameterId`, …).

### `estimates.ts`
- `Gaussian` — `{ mean, sigma }`.
- `Cov2`, `CovarianceMatrix`.
- Helpers: `isoCov2(sigma)`, `covEllipse(cov, k)` (semi-axes and angle of the k-sigma ellipse, for envelopes), `covEntry(matrix, idA, idB)`.

### `ship.ts` — nominal design (shared)
What the crew knows from the spec sheets. True deviations live in truth.
- `ShipDefinition` — structure mass/CoM/inertia, `equipment`, `tanks`, `buses`, `thermalNodes`, `configurations`, `defaultConfiguration`. Loaded from `data/ship-baseline.json` (1C) by ship systems (2B).
- `EquipmentSpec` — `kind` (`EquipmentKind`), mass, body-frame position, `ratedPower`, bus, thermal node, `modes`/`defaultMode`, optional `mount` (thruster force direction or sensor boresight), `redundancyGroup`, `sheddable`, and nominal `params` (named SI ratings such as `thrust`, `isp`, `capacity`, `sigmaBearing`; names set by 1C/2B).
- `TankSpec`, `BusSpec`, `ThermalNodeSpec`.
- `ConfigurationSpec` — footprint polygon, equipment that moves, param overrides (`"radiator-1.area"`), transition time.
- `MassProperties` — mass, body-frame centre of mass, inertia about the CoM, current footprint.

### `commands.ts`
- `AttitudeTarget` — inertial angle, prograde/retrograde (believed velocity), toward/away from an object, constant rate, or free.
- `Command` — `burn` (thruster, throttle, duration, optional attitude hold), `cutoff`, `attitude`, `power` (allocation W), `mode`, `point` (sensor at object or angle), `configure`, `recorder` (sample rate, P12), `mark` (annotation).
- `Plan` — `epoch` (sim time it starts) and `items` (`PlanItem`: `at` seconds after epoch, `command`).
- `ExecutedCommand` — what actually reached the ship: time, command, `source` (`plan` / `manual` / `procedure` / `protection`), status (`executed` / `rejected` / `limited`).
- `Procedure`, `ProcedureCondition` — saved command sequence with its start conditions and match tolerances (P9).

### `measurements.ts`
- `Measurement` — `kind`, `t`, `source` equipment, optional `target` / `channel` / `field`, `value[]`, `sigma[]`. See the table above.
- `ShipEvent` — what the ship noticed: contact (with `impulse`; `with` only if it can tell), equipment fault/recovery, breaker trip, load shed, command rejected, propellant low/depleted, thermal limit, battery depleted, exposure, configuration changed, objective, recall, ship lost (`LossCause`).

### `belief.ts` — the believed world
- `ShipEstimate` — navigation estimate: position, velocity, their covariances, attitude (+ sigma), angular rate.
- `BelievedShip` — `ShipEstimate` + configuration, `massProperties` (from design and gauged propellant), `equipment` (`EquipmentStatus`: mode, allocation, measured draw, health estimate, temperature, faults, readings), gauged `propellant`, latest `telemetry`.
- `BelievedBody`, `BelievedAsteroid` — position/velocity with covariance, radius, `tracked`, last fix. Gravity parameters are in the model, not here.
- `BelievedField` — whether the ship perceives a field, plus plugin `visual` data for `src/view3d/fields/`.
- `BelievedWorld` — `t`, `modelVersion`, ship, bodies, asteroids, fields.

### `model.ts` — predictive model state (A2, P5)
- `ParameterPrior` — what the model knows on arrival (from the encounter briefing).
- `ParameterEstimate` — value, sigma, prior, owning `extension`, `support` (0 = prior only, 1 = data-determined).
- `ExtensionState` — enabled, fitted at version, `ValidationResult` against a held-out attempt (`rmsBefore`, `rmsAfter`, verdict).
- `DataSupport` — where evidence exists (distance spans per body, powered time spans); outside it the model is extrapolating.
- `ResidualStats` — RMS residual split into coast and powered.
- `ModelState` — `version`, parameters, covariance, extensions, support, residuals, `basedOn` (attempts, measurement count).
- `KNOWN_EXTENSIONS` — `distance-law`, `unmodeled-body`, `thrust-response-region`, `empirical-acceleration`.

### `forecast.ts` (P6, P10)
- `ForecastDraft` — id, attempt, `issuedAt`, `modelVersion`, `inputs` (initial `ShipEstimate`, mass properties, plan, parameter values, extensions), `horizon`, `samples` (`ForecastSample`: CoM position, velocity, `positionCov`, `extrapolating`), predicted `objects` tracks, `closestApproaches`.
- `Forecast` — an issued forecast: deep-frozen and branded. Only `issueForecast(draft)` creates one; it copies the draft first. When loading from storage, pass records through `issueForecast` again.

### `attempt.ts` — Black Box (P8)
- `AttemptRecord` — id, index, encounter, `start` (arrival estimate, configuration, model version), committed `plans`, `executed` commands, issued `forecasts`, `measurements`, `events`, `outcome` (`AttemptOutcome`: in-progress, lost with cause, recalled, completed), `modelVersionAtEnd`. No truth.
- `Lead`, `LeadStatus` — the chart of leads.
- `BlackBoxArchive` — everything preserved across recurrence: attempts, procedures, adopted extensions, leads.

### `encounter.ts` — player-visible briefing
- `Objective` — kind, short label, optional region / moving target / time window.
- `EncounterBriefing` — objectives, arrival estimate and configuration, model `priors`, objects visible on arrival.

### `view.ts` — what the console and 3D view receive
- `ViewSnapshot` — `t`, paused, warp, `world` (`BelievedWorld`), `ship` (`ShipView`: footprint, CoM, `ThrustTick`s), measured `trail`, issued `forecasts`, sensor `coverage` (`SensorSector`s; everything else is unknown), objectives, optional two-attempt `compare` (`AttemptOverlay`s) and `selection`.

### `truth/` — TRUTH, not for belief-side code
- `world.ts` — `GravityLaw` (`exponent`), `MassiveBody` (`coupling` k in a = k / rⁿ, units m^(n+1)·s⁻²; `fixed`), `Asteroid` (test particle), `HiddenParameters` (true values by parameter ID), `TruthWorld`.
- `ship.ts` — `ShipKinematics` (CoM position, velocity, attitude, rate; integrated by 2A); `ShipSystemsState` (configuration and transition, `EquipmentState`s, tank propellant, thermal node temperatures, recorder, accumulated dose, attitude target, active burns, derived `massProperties`, seeded noise `rng` states, `ext` for subsystem extras); `ShipTruth`; `ThrustOutput` and `ActuatorOutput` (body-frame forces at application points, pure torque, mass properties); `SensorTarget`; `EnvironmentEffects` (kinematics, previous step's specific force, sensor targets, dose rate per equipment, field signals); `ShipStepResult`; and the step signature:

  ```ts
  type ShipSystemsStep = (state, config: ShipDefinition, commands, envEffects, dt)
    => { state, actuators, measurements, events };
  ```
  Pure: noise comes from the `rng` states carried in `state`, so identical inputs give identical outputs and recurrence replays exactly (P2, P9).
- `fields.ts` — `FieldInstanceSpec` (JSON), `EnvironmentField` (optional `acceleration`, `modifyThrust`, `doseRate`, `signal`), `FieldFactory`, `FieldRegistry`, `createFieldRegistry()`. Implementations go in `src/sim/fields/<kind>.ts`.
- `events.ts` — `SimEvent` (true clearance minima, impacts with contact point, field boundary crossings) and `TruthEvent = SimEvent | ShipEvent`.
- `encounter.ts` — `EncounterDefinition`: briefing, ship definition, true world at arrival (recurrence resets to exactly this), root seed, step size.

### One simulation tick (for 2A, 2B, 2F)

1. Game layer builds `EnvironmentEffects` from the truth world.
2. Ship systems: `step(state, shipDefinition, commandsDueNow, envEffects, dt)` → new systems state, actuators, measurements, events.
3. Simulation integrates bodies, asteroids and the ship with the actuators; fields add acceleration or modify thrust; it reports `SimEvent`s.
4. Game layer forwards measurements and sensed events to the model and Black Box, and builds the next `ViewSnapshot`.

## Fixtures (`fixtures/`)

Mock "Gravity range" data so console, 3D view and model work can start before the simulation exists. All values are [FICTIONAL]; the ship is a mock, not the 1C baseline.

| Import | Gives | Belief-safe |
|---|---|---|
| `fixtures/index.ts` | `shipDefinition`, `briefing`, `models` (`prior` v1, `massOnly` v2, `distanceLaw` v3), `attempts` (two `AttemptRecord`s), `trails`, `procedure`, `archive`, `believedWorld`, `viewSnapshot` (attempt 2 at 900 s), `viewSnapshotCompare` (two-attempt overlay), `buildFixtures()`, `mockMassProperties()` | Yes |
| `fixtures/truth.ts` | `mockEncounter`, `mockTruthWorld`, `mockShipSystemsState`, `mockEnvironmentEffects`, `mockTruthTracks` | No |
| `fixtures/generate.ts` | The mock generator (a small integrator, not the simulation) | No |

The story: the world uses the inverse-2.5 law; the model starts Newtonian, calibrated at arrival. Attempt 1 (prograde burn, recalled at 1800 s): its forecast is within tens of metres early and about a kilometre off by the end. Model v2 refits masses only. Attempt 2 (retrograde burn toward Alpha): its forecast predicts a 9 km miss of asteroid a-07; the ship hits it at 1500 s. Model v3 enables the distance-law extension and validates against attempt 2.
