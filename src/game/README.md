# src/game — game loop and integration

Owner: 2F (core loop, environment, recurrence v0); made three-dimensional by 2G (DECISIONS A11). Subfolders `expedition/`, `recurrence/`, `procedures/`, `save/` belong to 3D.

The only code that holds both truth and belief (P11). Files directly in this folder are **truth side**; everything in `belief/` is **belief side** and imports no truth contracts, simulation, ship systems or content (checked by `belief/belief.test.ts`). The console, 3D view and app shell see the game only through `belief/controls.ts`.

**Three dimensions.** Positions, velocities, shadows, lines of sight, objectives and the navigator are all 3D; attitude is a quaternion, angular velocity a body-frame vector, covariances `Cov3`. A planar scene gives the planar game's numbers: the navigator fed planar records reproduces the planar navigator bit for bit (position, velocity, their x–y covariance, Beta, the stand-in forecast), with every z exactly 0.

## The loop

```ts
import { createGravityRange } from '../content/gravity-range/index.ts';
import { createGameSession } from './session.ts';

const session = createGameSession(createGravityRange(), { model, blackBox, rules });
session.setPaused(false);
session.setWarp(1000);
// every animation frame:
session.advance(realSeconds);          // runs whole ticks; warp never changes dt
session.fly(controls);                 // hands-on flying; repeated inputs are ignored
const view = session.snapshot();       // ViewSnapshot for the console and 3D view
```

Prepare → commit plan (forecast issued and frozen) → operate (time warp) → observe → compare → revise → try again. `src/app/game.ts` shows the full wiring.

| Call (`GameControls`) | Does |
|---|---|
| `status()` | Phase (`prepare` / `operate` / `ended`), attempt, time, pause, warp, outcome, pending plan items, `committing` |
| `snapshot()` | `ViewSnapshot` from the believed world, recorded commands and Black Box, plus `window` (what the eye sees, the one part from truth; below) and `coverageEarlier` (what the sensors covered in earlier attempts, from Black Box) |
| `chart()` | `Chart` for the MAP: one region (this encounter) at the origin, its radius, survey coverage and attempts; leads from the archive that carry a bearing |
| `setPaused`, `setWarp`, `advance(realSeconds)` | Time. A new attempt starts paused. `advance` stops after `frameBudget` ms (default 10) and reports `saturated`. `setPaused` is for the shell (a hidden page holds the game); nothing in the loop relies on pausing (A12) |
| `preview(plan)` | Draft forecast, with its `detail`; nothing recorded or scheduled |
| `commit(plan)` | Plan epoch = now; the model's forecast (with its `detail`) is frozen with `issueForecast`; plan and forecast go to Black Box; the plan's items replace any still scheduled. Time holds still until the forecast arrives (§ The commit hold) |
| `command(command)` | Manual command, executed on the next tick |
| `fly(input)` | Hands-on flying (below) |
| `recall()` / `restart()` | Recurrence v0 (below) |
| `setCompare([a, b])`, `setSelection` | Two-attempt overlay and selection in the snapshot |
| `rules` | `test(extension, training, heldOut)`, `adopt`, `revoke`, `report()`, `burns(attempts?)`, `empirical()`: passed through to the model client in its queue. Rules come only from the player (A4) |
| `model`, `blackBox` | The two belief-side services. `blackBox.saveProcedure(procedure)` and `removeProcedure(id)` keep procedures (P9) in the archive's `procedures`, written to the store with everything else, so they are there in the next attempt and after a reload |

`GameSession` adds `stepTicks(n)` (headless), `truth()` and `lastTick()` (tests and tuning only).

### Hands-on flying (A8, A11)

Pass the state of the player's controls (`HandsOnInput`: translation along the body axes, yaw, pitch, throttle) whenever it changes; an input equal to the last one sent this attempt is ignored, and an attempt starts with the controls released. A changed input goes to the ship as a manual `fly` command on the next tick and stays in force until the next one.

- **Drawn.** While a control is held, `ViewSnapshot.ship.thrust` carries every thruster it fires at its point of application: the main engine at its throttle along its mount, and each RCS jet with its mean force for the translation, yaw and pitch demands. The session works this out with the ship's own nominal answer (`handsOnFirings` from `src/ship`, the same control law and jet allocator the ship step uses, run on the nominal design with the believed mass properties; no truth), dropping trims under 1 N. Turn jets are drawn for as long as the stick is held, though the real ones fire only for the 6–7 s the turn takes to reach its rate. A thruster cut off since stays undrawn until the controls change; empty once released.
- **Believed.** The navigator follows the same thrust: the main engine and RCS translation along the believed attitude with the believed thrust scales, and turns at the rate the flight software asks for (`handsOnBodyRate`) from the moment the stick moves; the gyros and star trackers correct it at the next packet. [DEMONSTRATED: `flight3d.test.ts`: a 12 s burn after pitching 53° up changes the true velocity by 9.25 m/s, 7.4 m/s of it out of the plane; the believed change is within 0.25 m/s of it, and the believed velocity within 0.44 m/s of the truth against a stated 0.48 m/s. A minute of +z translation: within 5% of the true 1.5 m/s. 11 s into a pitch, before any gyro reading, the believed attitude is 0.017 rad off (the ship's spin-up), not 0.07.]
- **Released.** A neutral input also issues a coasting forecast: an empty plan from the present state, frozen and recorded like a committed plan's forecast, but it schedules nothing, leaves a scheduled plan alone and does not hold time. The ship nulls its rates and holds the attitude it has (src/ship README).

## One tick (`truth-step.ts`)

1. `buildEnvironment` (`environment.ts`): sensor scene, last step's specific force, sunlight, and `fieldSignals['ship-environment']` as the ship expects it: `visibility`, `knownSizeTargets`, `starsVisible: true` [ASSUMED: the two star trackers between them always see clear sky], `opticsValid: true`.
   - **Shadows** are cylinders of each body's radius behind it along the sun's 3D direction (A3).
   - **Visibility**: a target is not seen in a body's shadow, as the night side of a body the ship is hiding behind, within the sun exclusion angle (a cone about the direction to the sun), or behind another body's sphere.
   - **Known-size targets**: every briefed body and every briefed asteroid. The camera ranges them, so a rock it is pointed at gives azimuth, elevation and range.
2. Commands due now are resolved from the believed navigation solution (`belief/resolve.ts`) and passed to the ship step. A reference that cannot be resolved is recorded as rejected and never reaches the ship.
3. The simulation step, with mass properties at the middle of the step: mass and centre of mass averaged, and the inertia the mean of the two **tensors** (`sym3.fromPrincipal`, then `sym3.principalAxes`), so it is right when the principal axes turn within a step.
4. `StepResult.contacts` become `ShipEvent` `contact`, with `with` for a body the briefing told the ship about (it knows where those are, looking or not) or for anything the camera could see this tick; a new impact at or above `lossSpeed` loses the ship (`ship-lost`, cause `collision`). Objectives are judged on truth (`objectives.ts`) and reported as `objective` events. The running Δv adds the net thrust force over the mid-step mass each tick: the main engine and RCS translation count, a balanced attitude couple does not [DEMONSTRATED: `truth-step.test.ts`: a 10 s burn matches the rocket equation; a minute of sideways translation is 400 N over the mass; a quarter turn adds under 10⁻³ m/s of trims and a hands-on yaw nothing].

Out of the tick, toward belief: recorded measurements (telemetry thinned on change, `belief/telemetry.ts`), executed commands with status, and ShipEvents. Nothing else.

`GameTruthState` (`sim`, `objectives`, `lost`) is plain JSON with no negative zero; the stepper is pure [DEMONSTRATED: `truth-step.test.ts`, also through a JSON save part way].

### The window (`window.ts`)

`ViewSnapshot.window` is built from the true world each time `snapshot()` is called. **This is the one deliberate place where truth reaches the view without an instrument**: light needs no sensor. It holds only what an eye takes in: the sun's direction and whether it is in view (the ship out of every shadow), whether the ship is sunlit, and for each object a unit direction, its apparent angular radius and whether it is lit. Every body not hidden behind another is listed, lit or dark; every sunlit asteroid whose apparent radius is at least `windowMinAngularRadius` and that no body hides, catalogued or not. Never a range, a velocity, a size in metres or a field. Directions are the same in truth's frame and the briefing's (the two differ by a uniform motion).

## Recurrence v0 (P8)

Loss, completion or a voluntary Recall ends the attempt; the next begins from exactly `EncounterDefinition.world` and runs the encounter's arrival procedure again. Black Box keeps every attempt and the saved procedures; the model refits from the final record and keeps what it learned [DEMONSTRATED: `session.test.ts`; `flight3d.test.ts`: after a flight that pitched, yawed, burned and translated out of the plane, Recall restores the arrival hash and the same flying gives the same hash].

## The believed side (`belief/`)

| Piece | File | What it is |
|---|---|---|
| Predictive model | `model-bridge.ts` | The model's client (a Web Worker in the browser) behind `ModelPort`. It owns the numbers, the calibration table, the rules and every forecast. Its drafts always carry `detail`: inside the draft (the model puts it there), or taken from beside it (older clients) |
| Navigator | `standin-model.ts` | The per-frame believed world (below). Alone, a synchronous stand-in `ModelPort` for tests and headless runs |
| Black Box | `blackbox.ts` | The recorder and archive behind `BlackBoxPort`; with a store, saves the attempt in progress every 30 s and at its end, and each procedure when saved or removed |
| Controls | `controls.ts` | `GameControls`: all the console and 3D view may call |
| Attitude references | `resolve.ts` | prograde, retrograde, toward, away, direction → an inertial attitude, roll held (`quat.pointAlong`) |
| Telemetry policy | `telemetry.ts` | Housekeeping recorded on change |
| View | `view.ts` | `ViewSnapshot` builder: sensor cones, thrust ticks, hull from the believed mass properties |
| Chart | `chart.ts` | `GameControls.chart()` |
| Earlier coverage | `coverage.ts` | `ViewSnapshot.coverageEarlier` from Black Box (below) |
| Plan helpers | `maneuver.ts` | `burnSteps`, `burnDuration` |

### The navigator

The model is a batch estimator with no per-frame state, so the navigator gives the believed world the view and command resolution need, in the same frame and under the law the model has in force (`adopt`: body GMs, and the exponent while the distance law is adopted).

- **Ship**: an extended Kalman filter on seven states, position and velocity relative to the primary in three dimensions and the local strength of the primary's pull, from the camera's azimuth, elevation and range fixes on the primary with their reported per-component sigmas (the azimuth row uses the horizontal distance, so the 1/cos(elevation) is in it; the azimuth innovation is wrapped). Unmodelled acceleration and the law's doubt grow the covariance as before.
- **Attitude**: the star trackers' rotation-vector fixes as a quaternion, carried between fixes at the gyros' body rate while turning (above 10⁻⁴ rad/s), and at the hands-on turn rate from the moment a stick moves.
- **Thrust**: executed `burn` (along its commanded attitude), `cutoff`, and `fly` (main engine and RCS translation from the design's firings, along the believed attitude); while thrust follows a turning ship, its direction doubt grows with the turn made since the last fix.
- **Bodies**: the secondary moves about the primary under their mutual pull; a range fix with its bearing pulls it toward where it was seen.
- **Asteroids**: every briefed asteroid moves in 3D under the law in force, in step with the secondary. The first range fix with its bearing starts a filter of its own (position and velocity, six states, both bodies' tides): `tracked` while its last fix is younger than `TRACK_STALE`, `lastSeen` kept after. Before that its position doubt is the survey's, growing at 1 m/s.
- **Stand-in forecast**: the same propagation with the plan's commands resolved as the ship will resolve them, a full `Cov3` per sample, the P10 horizon on the largest one-sigma axis, tracks of the bodies and of every tracked asteroid, closest approaches measured to the surface less the hull's reach (`hullReach`), `plannedAttitudes`, and a `detail` (all of its envelope is the present state carried on; `presentSource: 'navigator'`). The hands-on controls are taken as released at the epoch.

[DEMONSTRATED: `flight3d.test.ts`: on an orbit tilted 29° out of the plane, up to 476 km above it, the believed position is within 3 of its largest one-sigma everywhere from 600 s to 6 h (worst 2.3σ at 600 s), and its height within 3σ of its own height sigma. `rocks.test.ts`: the camera on a-12 (310 km) records a bearing and a range every packet; after 39 minutes the rock is tracked, known to 350 m (1σ; the survey said 5 km) and about 1σ from the truth (364 m); it is in the forecast with a track and a closest approach; 140 s after the camera looks away it is no longer tracked. The real model's forecast, given the same records through Black Box, carries a-11's track and closest approach too.]

**Feeding the model.** Records go to the model in order: `append` then `refresh` about once a second of real time while flying, everything outstanding before any forecast, and `endAttempt` with the final record when an attempt ends. A restored save is rebuilt with `load` once at start. Model calls are queued; a failure is kept in `lastError()` and the loop goes on.

**Frame.** Everything on the believed side is in the briefing's inertial frame, the one the model's forecasts use: the primary starts at the origin at rest and the two bodies' barycentre moves uniformly. It is not truth's barycentric frame.

**Attitude references.** Prograde and retrograde follow the believed inertial velocity in that frame; toward and away use believed positions (bodies and asteroids); direction is taken as given. Each becomes the attitude that puts the body axis on the direction by the smallest rotation from the believed attitude (roll held), the same function the model's forecasts use.

### Earlier coverage (`coverage.ts`, 2D's R6)

For every earlier attempt of the encounter, a fresh navigator takes the attempt's recorded commands, measurements and events in the order Black Box kept them (the same hands-on design answers the live one had, and the briefing's priors for the law), so where the ship believed it was comes from its own fixes. Every 60 s of ship time the camera's cone is placed as the view places it now: toward its recorded target's believed position, along its recorded direction, or its boresight on the believed attitude, while the camera is on and drawing power. Looks are thinned as `src/view3d/flight/coverageHistory.ts` thins its own: a new look when the cone has turned by more than half its half-angle, its half-angle or reach has changed by a tenth, or the ship has moved more than a fiftieth of the reach (120 km); otherwise the last look is renewed. Oldest first, at most `COVERAGE_EARLIER_MAX` (2,000) looks, the oldest going first. Built once per earlier attempt, the first time `snapshot()` asks (73 ms for an 8.4 h attempt, 26 looks), and from records only, so a restored save gives the same looks [DEMONSTRATED: `coverage.test.ts`].

## Encounters (`encounter.ts`)

Content hands the loop an `EncounterSetup`: the `EncounterDefinition`, an arrival procedure (commands executed at t = 0 of every attempt with source `procedure`), the ship's arrival mass, truth-evaluated `ObjectiveRule`s and `PlayValues`.

| Rule | Judged on truth |
|---|---|
| `orbit-band` | Between `inner` and `outer` from the body's centre (a spherical shell) while sweeping `revolutions` turns about it, counted in 3D: each tick adds the angle between the last and the new direction from the body, signed by whether the turn goes the same way round as the running normal, which follows the plane as it precesses. Polar and inclined orbits count; turning back undoes; leaving the band starts again |
| `depart` | The first time the ship is farther than `beyond` from the bodies' centre of mass (GM-weighted; a fixed body's velocity is left out), in any direction: reached, completing the attempt, if its speed relative to that centre is at least `minSpeed` and, with `maxDeltaV`, the running Δv is no more than that; otherwise missed, once, and the attempt goes on |
| `reserve` | Judged at completion: the tank still holds at least `minimum` |

[DEMONSTRATED: `objectives.test.ts`.]

`arrival.ts` builds the ship's arrival state and maps `world.hidden` into the equipment values the ship reads:

| Hidden parameter | Equipment value |
|---|---|
| `thruster.<id>.scale`, `.misalignment`, `.misalignment-pitch` | `thrustScale`, `misalignment` (about +z), `misalignmentPitch` (about −y) |
| `thruster.rcs.scale` | `thrustScale` on every RCS pod (the ship keeps no group value); a pod's own `thruster.<pod>.scale` overrides it |
| `sensor.<id>.bias-x`, `.bias-y`, `.bias-z` | `biasX`, `biasY`, `biasZ` (accelerometer) |
| `sensor.<id>.bias`, `.rate-bias-x`, `.rate-bias-y` | `gyroBias` (z), `gyroBiasX`, `gyroBiasY` |

`body.*` and `law.*` are skipped; anything else naming ship hardware the ship does not have throws. The ship has no value for a camera misalignment, so `sensor.camera.bias*` cannot be set yet.

## Play values (all [ASSUMED])

| Value | Setting | Why |
|---|---|---|
| Warp steps | 1, 10, 60, 300, 1000, 2000 | A tick costs about 0.24 ms, so about 2,000 ticks a second fit in the frame budget |
| Loss speed | 3 m/s at the hull | Orbital-speed impacts are always fatal; slow bumps are survivable |
| Sun exclusion angle | 20° | Targets inside this cone about the sun are lost in glare |
| Window: smallest asteroid | 2×10⁻⁴ rad apparent radius | A rock of 1 km radius from 5,000 km: 13 of Alpha's rocks on arrival (7 of them not on the survey), about 300 of the ring from 4 h on |
| Trail interval | 60 s | Measured trail point from the believed position |
| Telemetry | kept on a 0.2% change, or every 600 s | About 4% of the ship's 240 readings per packet |
| Recorder rate | 0.05 Hz (arrival procedure) | One packet every 20 s |
| Forecast span | 16 h (the Gravity range asks 48 h) | Longest look-ahead requested at commit; the model may end earlier |
| Model hand-over | every 1 s of real time | `append` + `refresh` |
| Black Box save | every 30 s of real time, and at attempt end | Data up to a closed tab survives |
| Tracked | while the last fix is younger than 120 s (`TRACK_STALE`) | Six recorder periods |
| Hands-on thrust drawn | firings of 1 N or more | The allocator trims the centre of mass's 2 mm offset with jets far below that |
| Earlier coverage | a sample every 60 s, at most 2,000 looks | About 120 looks for a 40 h attempt |

Plan helpers (`belief/maneuver.ts`): `burnSteps` turns to the burn attitude `TURN_LEAD` (480 s) early, because a half turn at the ship's 0.008 rad/s slew limit settles in 420 s; 5 s after the burn it releases to a zero-rate hold (not `free`: a burn leaves the ship turning, and a free ship goes on turning and smears the camera). `burnDuration` sizes a burn from nominal ratings and believed mass.

## The commit hold (A12)

A12 says nothing pauses inside an encounter. `commit` still holds time until its forecast arrives, so the forecast describes the plan from its epoch; the owner decides whether that stays. How long it holds [DEMONSTRATED: scratch runs in Node with the model in-thread, on a machine shared with other work; in the browser the model runs in its Web Worker, so only ship time holds, not the page]:

| When | Held |
|---|---|
| Start of the first attempt (nothing learned) | 0.2 s |
| Start of the second attempt (one 8.4 h attempt recorded) | 0.4 s |
| 4 h into the first attempt, records new since the last refit (a global fit runs first) | 1.1 s |
| 8 h into the first attempt, model settled | 4.1 s |
| 8 h into the second attempt, records new (a global fit over both attempts runs first) | 10.4 s |

So a commit early in an attempt holds a fraction of a second, and one late in a long attempt can hold several seconds, most of it the global fit the bridge runs before a forecast when records arrived more than 5 s of real time after the last one (`forecastRefitAfter`).

## Speed

Measured side by side in one process, the committed planar game layer (`13df747`) against this one, both on the 3D simulation and ship, best of eight alternating runs on a busy machine: a coasting tick 0.242 → 0.238 ms, a tick with a hands-on translation held 0.312 → 0.311 ms (unchanged within noise); a tick plus a snapshot 0.58 → 0.67 ms, the difference being the window (338 objects checked against shadows and bodies). The navigator's share of a tick is under 0.02 ms.

## Limits

- Loss has one cause, collision. Running out of power or propellant does not end an attempt.
- Objectives are judged on truth; the `objective` event is how the ship learns the result.
- The navigator and the model are two estimates of the ship's state. The forecast starts from the model's; the ship marker, the trail, command resolution and earlier coverage use the navigator's. They agree to about a kilometre while the camera has fixes on the primary.
- The navigator's ship covariance carries only the primary's tide; an asteroid's fix adds the ship's position doubt without its correlation, so a rock's stated sigma is slightly optimistic just after a fix (measured up to 1.7σ in the first minutes).
- Hands-on turns are believed at the commanded rate from the moment the stick moves; the ship takes 6–7 s to reach it, so the believed attitude leads by up to 0.03 rad until the next gyro packet.
- The window shows every body even when it is far too small or faint to see, and treats a rock's lit side as visible from any angle.
- Earlier coverage uses the briefing's law and priors, not what the model learned since, so its positions are as good as the navigator's on the first attempt.
- The trails used for the two-attempt overlay are kept in memory, not saved.
- Recurrence replays the sensor noise streams too, so identical flights give identical measurements (see the 2F handoff; A10 changes this per run).
