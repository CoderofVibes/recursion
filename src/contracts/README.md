# src/contracts — shared types

Owner: integrator (1A, then 2F/5A); 2G during the 3D conversion (DECISIONS A11). Other sections request changes in their handoff note; they do not edit these files.

**Flight is three-dimensional (A11).** Positions, velocities, attitude, forces, sensing and the model's estimates are 3D. § Conventions says how; § Planar data says how old planar numbers map onto it.

Types and tiny helpers only. No game logic. Everything here is plain, JSON-serialisable data unless noted.

## Two worlds (DECISIONS P11)

| Import from | Contains | Who may import |
|---|---|---|
| `src/contracts/index.ts` | Shared and belief-side types: ship design, commands, measurements, believed world, model, forecasts, Black Box records, encounter briefing, view snapshot | Everyone |
| `src/contracts/truth/index.ts` | Truth: the real world, the ship's real systems state, the ship-systems step, environment fields, full encounter definitions | `src/sim`, `src/ship`, `src/content`, `src/game` only |

`src/model`, `src/blackbox`, `src/console` and `src/view3d` are **belief side**. ESLint blocks them from importing `src/sim/`, `src/contracts/truth/`, `fixtures/truth.ts` and `fixtures/generate.ts` (`eslint.config.js`, proven by `boundary.test.ts`). The game layer (`src/game`) is the only code holding both; it turns truth into measurements, events and the view snapshot.

## Conventions

- **Units:** SI everywhere (m, kg, s, N, W, J, K, rad). The one exception is the fictional lattice exposure (`LatticeIntensity`, `LatticeExposure`), which is not a real radiation dose (1C). `units.ts` aliases document intent; they are plain numbers. Fields carry no unit suffix; the JSDoc says the unit when it is not obvious.
- **Time:** sim seconds since the encounter's arrival (t = 0). Plans use times relative to their epoch.
- **Frames:** one inertial frame per encounter (the briefing's), right-handed. Angles are radians.
- **Body frame:** right-handed, origin at the structural datum; +x is the body axis (the direction the main engine pushes the ship), +y is left, +z is up.
- **Vectors:** `Vec3 {x, y, z}` from `src/lib/vec3.ts` (namespace `v3`). `Vec2` remains for planar data only (hull outlines, plots).
- **Attitude:** a unit quaternion `Quat {w, x, y, z}` from `src/lib/quat.ts` (namespace `quat`), **body to inertial**: `quat.rotate(attitude, bodyVector)` is the inertial vector, and `quat.axisX(attitude)` is where the nose points. `q` and `−q` are the same attitude.
- **Angular velocity:** a `Vec3` in the **body frame**, rad/s (what the gyros sense).
- **Directions as two angles:** azimuth = atan2(y, x) in (−π, π], elevation = angle above the inertial x–y plane (`v3.fromAzEl`, `v3.azimuthOf`, `v3.elevationOf`).
- **Roll held:** the player steers yaw and pitch; nothing commands roll. A pointing target turns the body axis onto its direction by the smallest rotation from the attitude the ship has at that moment (`quat.pointAlong`), adding no roll about the line of sight. The game layer and the model's forecasts both use that function, so the ship flies the attitude that was forecast.
- **Covariance:** `Cov3 = [xx, xy, xz, yy, yz, zz]` for positions and velocities (inertial); `CovarianceMatrix` (row-major with labelled ids) for parameters. `Cov2 = [xx, xy, yy]` is a `Cov3` seen in a plane (`projectCov3`).
- **Inertia:** `Inertia { moments, axes }`: principal moments about the centre of mass and the rotation from the principal frame to the body frame.
- **Hull:** `Hull = HullPrism[]`: a union of convex prisms, each a convex counter-clockwise outline in the body x–y plane extruded from `zMin` to `zMax` (2G's choice: a box is a prism, the planar footprints carry over exactly, and the distance from a point to a prism is exact). A concave ship is several prisms.
- **IDs:** kebab-case strings, stable across saves (`alpha`, `main-engine`, `attempt-0003`).
- **Immutability:** issued forecasts are deep-frozen (`issueForecast`). Treat all other contract data as immutable too; produce new objects rather than mutating.

### Planar data

A planar value lifts with z = 0 and a rotation about +z, and every 3D helper reduces to the planar one exactly:

| Planar | 3D |
|---|---|
| position `(x, y)` | `v3.vec3(x, y)` |
| attitude angle ψ, rate ω | `quat.fromYaw(ψ)` (and back: `quat.yawOf`), `{x: 0, y: 0, z: ω}` |
| `Cov2 [xx, xy, yy]` | `cov3FromPlanar` gives `[xx, xy, 0, yy, 0, 0]`; **yy is index 3, not 2** |
| footprint polygon | `prismHull(polygon, zMin, zMax)` |
| bearing θ | `[θ, 0]` (azimuth, elevation) |
| attitude fix ψ, gyro ω | rotation vector `[0, 0, ψ]`, `[0, 0, ω]` |
| direction to point at, angle a | `v3.fromAzEl(a)`; `quat.pointAlong` then returns exactly `quat.fromYaw(a)` |

### Parameter IDs (proposed; 1G may refine)

Dotted paths, shared by the model's estimates and truth's `HiddenParameters`:

| ID | Meaning | Unit |
|---|---|---|
| `body.<bodyId>.mu` | Body's Newtonian-equivalent GM (at its reference radius, P4) | m³/s² |
| `law.gravity.exponent` | Distance-law exponent n (extension `distance-law`) | — |
| `thruster.<equipmentId>.scale` | Thrust scale factor (true / nominal) | — |
| `thruster.<equipmentId>.misalignment` | Thrust direction error about body +z (tilts the thrust toward +y; the planar parameter) | rad |
| `thruster.<equipmentId>.misalignment-pitch` | Thrust direction error about body −y (tilts the thrust toward +z) | rad |
| `thruster.rcs.scale` | One thrust scale shared by every RCS jet (true / nominal); `rcs` is the group, not an equipment id | — |
| `sensor.<equipmentId>.bias-x`, `.bias-y`, `.bias-z`, `.bias` | Sensor biases, body axes. For an accelerometer: m/s² on each axis. For the camera: its misalignment to the star trackers, a small rotation fixed in the body frame, with `.bias` the part about body +z (the planar parameter) and `.bias-x`, `.bias-y` the other two | sensor unit |
| `sensor.<equipmentId>.scale` | Accelerometer scale factor (true / nominal) | — |
| `unmodeled.<n>.mu`, `.x`, `.y`, `.z` | Extra body never seen (extension `unmodeled-body`, unseen mode) | m³/s², m |
| `empirical.ax`, `empirical.ay`, `empirical.az` | Constant unexplained acceleration (extension `empirical-acceleration`) | m/s² |

Extension ids may carry a target: `unmodeled-body:<bodyId>` is the seen mode, a briefed body the model left out; it fits that body's `body.<bodyId>.mu`.

### Telemetry channels

`<equipment|tank|bus|thermal node id>.<quantity>`, SI units: `battery-1.charge` (J), `tank-main.propellant` (kg), `bus-a.load` (W), `node-avionics.temperature` (K), `black-box.bytes` (B).

### Measurement kinds

| Kind | `value` | Needs | Notes |
|---|---|---|---|
| `bearing` | [azimuth, elevation] rad | `target` | Inertial direction from ship to target centre. The azimuth sigma carries the 1 / cos(elevation) of an isotropic pointing error |
| `range` | [ρ] m | `target` | Ship to target centre |
| `relative-position` | [x, y, z] m | `target` | Ship minus target, inertial |
| `accel` | [ax, ay, az] m/s² | — | Non-gravitational specific force, **body frame**. Gravity is never sensed (P7) |
| `attitude` | [φx, φy, φz] rad | — | Star tracker: rotation vector (axis × angle) of the body-to-inertial rotation; `quat.fromRotationVector` rebuilds the quaternion. Sigma is about each body axis |
| `rate` | [ωx, ωy, ωz] rad/s | — | Gyro, body frame |
| `telemetry` | [v] | `channel` | Housekeeping reading |
| `lattice-intensity` | [I] lattice units | — | Fictional field intensity at the sensing equipment |
| `field-signal` | field-specific | `field` | Processed field product (e.g. lattice reconstruction) |

`sigma` always has the same length as `value` (one-sigma per component).

## Files

### `units.ts`, `ids.ts`
Unit aliases (`Seconds`, `Meters`, `Watts`, `LatticeExposure`, …), `JsonValue`, and ID aliases (`BodyId`, `EquipmentId`, `AttemptId`, `ParameterId`, …).

### `estimates.ts`
- `Gaussian` — `{ mean, sigma }`.
- `Cov3`, `Cov2`, `CovarianceMatrix`.
- Helpers: `isoCov3(sigma)`, `covEllipsoid(cov, k)` (semi-axes and directions of the k-sigma ellipsoid, for envelopes), `varianceAlong(cov, direction)`, `projectCov3(cov, u, v)` (the 2×2 covariance seen in a plane, e.g. a camera's), `cov3FromPlanar`, `isoCov2`, `covEllipse(cov2, k)`, `covEntry(matrix, idA, idB)`.

### `ship.ts` — nominal design (shared)
What the crew knows from the spec sheets. True deviations live in truth.
- `ShipDefinition` — structure mass/CoM/inertia, `equipment`, `tanks`, `buses`, `thermalNodes`, `configurations`, `defaultConfiguration`, and optional `systems` (the full 1C detail, for `src/ship` only). Ship systems (2B) builds it from `data/ship-baseline.json` (1C), whose frame (x forward, y left, z up) matches ours.
- `Inertia`, `isotropicInertia(moment)`; `HullPrism`, `Hull`, `prismHull(outline, zMin, zMax)`, `hullReach(hull, point)` (farthest corner, for bounding spheres).
- `EquipmentSpec` — `kind` (`EquipmentKind`), mass, body-frame position, `ratedPower`, bus, thermal node, `modes`/`defaultMode`, optional `mount` (thruster force direction or sensor boresight), `redundancyGroup`, `sheddable`, and nominal `params` (named SI ratings such as `thrust`, `isp`, `capacity`, `sigmaBearing`; names set by 1C/2B).
- `TankSpec`, `BusSpec`, `ThermalNodeSpec`.
- `ConfigurationSpec` — `hull`, equipment that moves, param overrides (`"radiator-1.area"`), transition time.
- `MassProperties` — mass, body-frame centre of mass, `inertia` about the CoM, current `hull`.

### `commands.ts`
- `AttitudeTarget` — `inertial` (a full attitude quaternion), `direction` (body axis along an inertial direction), prograde/retrograde (believed velocity), toward/away from an object, `rate` (a body-frame angular velocity), or free. All pointing targets hold roll (§ Conventions). The ship accepts only `inertial`, `rate` and `free`; the game layer resolves the rest from the believed world first.
- `HandsOnInput` — hands-on flying (A8, A11): `translate` (−1..1 on each body axis, RCS), `yaw` (−1..1, positive turns the nose left), `pitch` (−1..1, positive raises the nose), `throttle` (0..1, main engine). No roll control: roll rate is held at zero. `HANDS_ON_NEUTRAL`, `isHandsOnNeutral`. The shell sends it through `GameControls.fly(input)` whenever it changes; releasing the controls issues a coasting forecast.
- `Command` — `burn` (thruster, throttle, duration, optional attitude hold), `cutoff`, `attitude`, `fly` (the hands-on controls as they are now, in force until the next `fly`), `power` (allocation W), `mode`, `point` (sensor at object or along an inertial direction), `configure`, `recorder` (sample rate, P12), `mark` (annotation).
- `Plan` — `epoch` (sim time it starts) and `items` (`PlanItem`: `at` seconds after epoch, `command`).
- `ExecutedCommand` — what actually reached the ship: time, command, `source` (`plan` / `manual` / `procedure` / `protection`), status (`executed` / `rejected` / `limited`).
- `Procedure`, `ProcedureCondition` — saved command sequence with its start conditions and match tolerances (P9).

### `measurements.ts`
- `Measurement` — `kind`, `t`, `source` equipment, optional `target` / `channel` / `field`, `value[]`, `sigma[]`. See the table above.
- `ShipEvent` — what the ship noticed: contact (with `impulse`; `with` only if it can tell), equipment fault/recovery, condition changed (new reported condition; drops age ship calibrations, 1G spec §3.7; emitted by the ship step, 3A), breaker trip, load shed, command rejected, propellant low/depleted, thermal limit, battery depleted, exposure, configuration changed, objective, recall, ship lost (`LossCause`).

### `belief.ts` — the believed world
- `ShipEstimate` — navigation estimate: position, velocity, their covariances (`Cov3`), attitude quaternion (+ sigma), body-frame angular velocity.
- `BelievedShip` — `ShipEstimate` + configuration, `massProperties` (from design and gauged propellant), `equipment` (`EquipmentStatus`: mode, allocation, measured draw, health estimate, tripped, temperature, faults, readings), gauged `propellant`, latest `telemetry`.
- `BelievedBody`, `BelievedAsteroid` — position/velocity with covariance, radius, `tracked`, last fix. Gravity parameters are in the model, not here.
- `BelievedField` — whether the ship perceives a field, plus plugin `visual` data for `src/view3d/fields/`.
- `BelievedWorld` — `t`, `modelVersion`, ship, bodies, asteroids, fields.

### `model.ts` — predictive model state (A2, P5)
- `ParameterPrior` — what the model knows on arrival (from the encounter briefing).
- `ParameterEstimate` — value, sigma, prior, owning `extension`, `support` (0 = prior only, 1 = data-determined). Ship calibrations (engine scale and misalignment, accelerometer scale, camera bias) also carry `arc` on per-attempt values and `freshness` (`CalibrationFreshness`: sigma as last measured, sigma added by aging, and the ship time, Δv, power cycles and condition lost since; 1G spec §3.7, §9.7, A5).
- `ExtensionState` — `status` (`candidate`, `adopted`, `rejected`, `revoked`), fitted at version, `ValidationResult` against a held-out attempt (`statistic` T/ν against `threshold`, `rmsBefore`, `rmsAfter`, verdict), and `validatedSpans` (`ValidatedSpan`: body, `rMin`, `rMax`, earned `sigmaE`, held-out attempt; one per body per passing test). The earned hedge applies only inside these spans; which bodies they apply to is DECISIONS A5.
- `DataSupport` — where evidence exists (distance spans per body, powered time spans); outside it the model is extrapolating.
- `ResidualStats` — RMS residual split into coast and powered.
- `CalibrationProfile` (A4, 1G spec §5.4) — per body: node `distances`, gravity `scale` relative to the reference law, node `covariance`, `inflation` diagnostic, and the `CalibrationWindow` local fits behind it (the "measured strength against distance" plot the console shows). Numbers at sampled distances only; never a rule.
- `FitSummary` — χ², ν, effective parameters, iterations, converged.
- `ModelState` — `version`, `parent`, parameters, covariance, extensions, support, residuals, `basedOn` (attempts, measurement count), `dataManifest`, `fit`, `calibration` (derived and cached), `settings`, `noiseScale` s² (derived).
- `KNOWN_EXTENSIONS` — `distance-law`, `unmodeled-body`, `thrust-response-region`, `empirical-acceleration`.

### `forecast.ts` (P6, P10)
- `ForecastDraft` — id, attempt, `issuedAt`, `modelVersion`, `inputs` (initial `ShipEstimate`, mass properties, plan, parameter values, extensions, the `calibration` profiles used, `noiseScale` s², `hedge` = the default σ_h0, `earnedHedge` per body with the spans where σ_e applied instead, `engine` values and aged covariance for planned burns), `horizon`, `camera` (the camera misalignment the present state used), `plannedAttitudes` (the full attitude each planned burn was forecast with, roll held), `samples` (`ForecastSample`: CoM position, velocity, `positionCov` (a 3D uncertainty: the envelope is an ellipsoid along the path), `extrapolating`, and `validated` where an extrapolated sample lies inside a validated span), predicted `objects` tracks, `closestApproaches`.
- `ForecastDetail` (optional `ForecastDraft.detail`) — what the envelope is made of: per sample, the one-sigma size of each uncertainty source (`ForecastSigmaBySource`: present state, calibration profile, hedge, engine, mass, total), how the present state was obtained, and which tracked asteroids were forecast (`AsteroidForecastNote`). It travels with the forecast through `preview` and `commit` and is recorded with it.
- `Forecast` — an issued forecast: deep-frozen and branded. Only `issueForecast(draft)` creates one; it copies the draft first. When loading from storage, pass records through `issueForecast` again.

### `attempt.ts` — Black Box (P8)
- `AttemptRecord` — id, index, encounter, `start` (arrival estimate, configuration, model version, `transit` for a later encounter, and the `briefing` this attempt was given, since run geometry varies, A10), committed `plans`, `executed` commands, issued `forecasts`, `measurements`, `events`, `outcome` (`AttemptOutcome`: in-progress, lost with cause, recalled, completed), `modelVersionAtEnd`. No truth.
  - **Measurement order is canonical:** Black Box appends measurements in acquisition order (time, then the order the ship step emitted them). The array index is the sequence number; the model sorts by (attempt, index), never re-sorts by value (1G spec §11.3).
  - **Thrust segments for the model** are derived belief-side from `executed` burn and cutoff commands × nominal ratings in `ShipDefinition`, with attitude from recorded attitude measurements, never from `ActuatorOutput` (truth). A `limited` burn is a segment whose commanded level is uncertain; give it a wider prior.
- `TransitRecord` — the ship's history between encounters (ship time, commanded Δv, camera power cycles, condition changes) from the completed attempt that carried it onward. 3D writes it on arrival; the model ages ship calibrations with it (1G spec §3.7). Every attempt of an encounter repeats the same transit.
- `Lead`, `LeadStatus` — the chart of leads; a lead may carry the `bearing` it was seen on (from which encounter, direction, spread).
- `BlackBoxArchive` — everything preserved across recurrence: attempts, procedures, adopted extensions, leads, `extensionTests` (`ExtensionTestRecord`: every rule test with its training and held-out attempts, evidence, identifiability, fitted values and resulting state; never edited), and `extensionDecisions` (every adopt and revoke, in order).

### `encounter.ts` — player-visible briefing
- `Objective` — kind (including `depart`), short label, optional region (a sphere) / moving target / time window, a distance `band` about the target (a spherical shell), `depart` (leave beyond a distance in any direction at a minimum speed, e.g. a slingshot exit, A6) and `maxDeltaV`.
- `EncounterBriefing` — objectives, arrival estimate and configuration, model `priors`, objects visible on arrival, and the law's shared `referenceRadius` r₀ (P4). Each run's briefing differs with its geometry (A10); attempts record theirs in `AttemptStart.briefing`.

### `chart.ts` — what the MAP shows
- `Chart` — only what has been charted: `ChartRegion`s (3D position in the chart frame, radius, survey coverage, the attempts Black Box recorded there, whether the ship is there now), `ChartCorridor`s flown between regions, `ChartLead`s (a bearing from a region, range unknown) and the `reach` of the propellant on board. The chart frame is the expedition's own: metres, the first charted region at the origin, no preferred plane. Built by the game layer (`GameControls.chart()`).

### `view.ts` — what the console and 3D view receive
- `ViewSnapshot` — `t`, paused, warp, `world` (`BelievedWorld`), `ship` (`ShipView`: `hull`, CoM, `ThrustTick`s, all body frame), measured `trail`, issued `forecasts`, sensor `coverage` (`SensorCone`s: an inertial axis, a half-angle and a range; everything else is unknown), objectives, optional two-attempt `compare` (`AttemptOverlay`s) and `selection`, and `window`.
- `WindowView` — what the unaided eye sees through the window (A3, A8): the sun's direction and whether it is in view, whether the ship is in sunlight, and each `WindowObject` light shows (a direction, an apparent size and whether it is lit: never a range). It holds nothing that needs an instrument, so it can show a rock the ship has not catalogued and never shows a field.

### `truth/` — TRUTH, not for belief-side code
- `world.ts` — `GravityLaw` (`exponent` n and one shared `referenceRadius` r0), `MassiveBody` (`gm` in m³/s², `radius` as collision envelope only, `fixed`); acceleration toward a body is (gm / r0²)(r0 / r)ⁿ (P4, clarified by 1B); `Asteroid` (massless test particle), `HiddenParameters` (true values by parameter ID), `Sun` (one distant sun, DECISIONS A3: a 3D direction toward it and unobstructed irradiance in W/m²; light only, not in the gravity sum; a body's shadow is a cylinder of its radius behind it), `TruthWorld` (`sun` absent means no sunlight).
- `ship.ts` — `ShipKinematics` (CoM position, velocity, attitude quaternion, body-frame angular velocity; integrated by the simulation); `ShipSystemsState` (configuration and transition, `EquipmentState`s, tank propellant, thermal node temperatures, recorder, accumulated lattice exposure, attitude target, active burns, derived `massProperties`, seeded noise `rng` states, `ext` for subsystem extras); `ShipTruth`; `ThrustOutput` and `ActuatorOutput` (body-frame forces at application points, a body-frame pure torque vector, mass properties); `SensorTarget`; `EnvironmentEffects` (kinematics, previous step's specific force, sensor targets, lattice intensity per equipment, field signals, `sunlight` at the ship after body shadows); `ShipStepResult`; and the step signature:

  ```ts
  type ShipSystemsStep = (state, config: ShipDefinition, commands, envEffects, dt)
    => { state, actuators, measurements, events };
  ```
  Pure: noise comes from the `rng` states carried in `state`, so identical inputs give identical outputs and recurrence replays exactly (P2, P9).
- `fields.ts` — `FieldInstanceSpec` (JSON), `EnvironmentField` (optional `acceleration`, `modifyThrust`, `intensity`, `signal`), `FieldFactory`, `FieldRegistry`, `createFieldRegistry()`. Implementations go in `src/sim/fields/<kind>.ts`.
- `events.ts` — `SimEvent` (true clearance minima, impacts with contact point, field boundary crossings) and `TruthEvent = SimEvent | ShipEvent`.
- `encounter.ts` — `EncounterDefinition`: briefing, ship definition, true world at arrival (recurrence resets to exactly this), root seed, step size.

### One simulation tick (for 2A, 2B, 2F)

1. Game layer builds `EnvironmentEffects` from the truth world, including sunlight: the sun's direction, and its irradiance set to 0 when a massive body blocks the line to the sun (parallel rays, so a body's shadow is a cylinder behind it).
   `specificForce` is the previous step's `SimState.specificForce` (2A).
2. Ship systems: `step(state, shipDefinition, commandsDueNow, envEffects, dt)` → new systems state, actuators, measurements, events. Note: 2B reports end-of-step `massProperties`, while the simulation applies one set for the whole step; the game layer should pass the average of the previous and new mass properties to keep burns second order (relative Δv error otherwise ≈ ṁ·dt / 2m, about 10⁻⁴ for the main engine at 1 s).
3. Simulation integrates bodies, asteroids and the ship with the actuators; fields add acceleration or modify thrust; it reports `SimEvent`s.
4. Game layer forwards measurements and sensed events to the model and Black Box, and builds the next `ViewSnapshot`.

## Fixtures (`fixtures/`)

Mock "Gravity range" data so console, 3D view and model work can start before the simulation exists. All values are [FICTIONAL]; the ship is a mock, not the 1C baseline.

| Import | Gives | Belief-safe |
|---|---|---|
| `fixtures/index.ts` | `shipDefinition`, `briefing`, `models` (`prior` v1, `massOnly` v2, `distanceLaw` v3), `attempts` (two `AttemptRecord`s), `trails`, `procedure`, `archive`, `believedWorld`, `viewSnapshot` (attempt 2 at 900 s), `viewSnapshotCompare` (two-attempt overlay), `buildFixtures()`, `mockMassProperties()` | Yes |
| `fixtures/truth.ts` | `mockEncounter`, `mockTruthWorld`, `mockShipSystemsState`, `mockEnvironmentEffects`, `mockTruthTracks` | No |
| `fixtures/generate.ts` | The mock generator (a small integrator, not the simulation) | No |

The fixtures are three-dimensional where a view needs it: asteroid orbits tilted up to ±12° out of the bodies' plane (a-07 arrives from above), a sun 20° above that plane, an objective sphere off the plane, the camera's cone, forecast uncertainty that is longer along the track than across it, and a mock ship with equipment heights, dorsal and ventral jets, a full inertia and a three-prism hull when its radiators are out. The two bodies and the ship's path lie in the inertial x–y plane.

The story: the world uses the inverse-2.5 law; the model starts Newtonian, calibrated at arrival. Attempt 1 (prograde burn, recalled at 1800 s): its forecast is within tens of metres early and about 3 km off by the end. Model v2 refits masses only. Attempt 2 (retrograde burn toward Alpha): its forecast predicts a 9 km miss of asteroid a-07; the ship hits it at 1500 s. Model v3 enables the distance-law extension and validates against attempt 2.
