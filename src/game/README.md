# src/game — game loop and integration

Owner: 2F (core loop, environment, recurrence v0). Subfolders `expedition/`, `recurrence/`, `procedures/`, `save/` belong to 3D.

The only code that holds both truth and belief (P11). Files directly in this folder are **truth side**; everything in `belief/` is **belief side** and imports no truth contracts, simulation, ship systems or content (checked by `belief/belief.test.ts`). The console, 3D view and app shell see the game only through `belief/controls.ts`.

## The loop

```ts
import { createGravityRange } from '../content/gravity-range/index.ts';
import { createGameSession } from './session.ts';

const session = createGameSession(createGravityRange(), { model, blackBox, rules });
session.setPaused(false);
session.setWarp(1000);
// every animation frame:
session.advance(realSeconds);          // runs whole ticks; warp never changes dt
const view = session.snapshot();       // ViewSnapshot for the console and 3D view
```

Prepare (safe, paused) → commit plan (forecast issued and frozen) → operate (time warp) → observe → compare → revise → try again. `src/app/game.ts` shows the full wiring.

| Call (`GameControls`) | Does |
|---|---|
| `status()` | Phase (`prepare` / `operate` / `ended`), attempt, time, pause, warp, outcome, pending plan items |
| `snapshot()` | `ViewSnapshot` built from the believed world, recorded commands and Black Box only |
| `setPaused`, `setWarp`, `advance(realSeconds)` | Time. A new attempt starts paused. `advance` stops after `frameBudget` ms (default 10) and reports `saturated` |
| `preview(plan)` | Draft forecast; nothing recorded or scheduled |
| `commit(plan)` | Plan epoch = now; the model's forecast is frozen with `issueForecast`; plan and forecast go to Black Box; the plan's items replace any still scheduled from an earlier plan. Time holds still until the forecast arrives |
| `command(command)` | Manual command, executed on the next tick |
| `recall()` / `restart()` | Recurrence v0 (below) |
| `setCompare([a, b])`, `setSelection` | Two-attempt overlay and selection in the snapshot |
| `rules` | `test(extension, training, heldOut)`, `adopt`, `revoke`, `report()`: rules come only from the player (A4) |
| `model`, `blackBox` | The two belief-side services (below) |

`GameSession` adds `stepTicks(n)` (headless), `truth()` and `lastTick()` (tests and tuning only).

## One tick (`truth-step.ts`)

1. `buildEnvironment` (`environment.ts`): sensor scene, last step's specific force, sunlight with body shadows (A3), and `fieldSignals['ship-environment']`: `visibility` (false for a target in a body's shadow, the night side of a body the ship is behind, within the sun exclusion angle, or behind a body's disc), `knownSizeTargets` (the briefing's bodies), `starsVisible: true` [ASSUMED: trackers look out of the flight plane].
2. Commands due now are resolved from the believed navigation solution (`belief/resolve.ts`) and passed to 2B's `stepShipSystems`. A reference that cannot be resolved is recorded as rejected and never reaches the ship.
3. 2A's `simulation.step`, with the mean of the previous and new mass properties.
4. `StepResult.contacts` become `ShipEvent` `contact` (`with` only if the camera could see the object); a new impact at or above `lossSpeed` loses the ship (`ship-lost`, cause `collision`). Objectives are judged on truth (`objectives.ts`) and reported as `objective` events.

Out of the tick, toward belief: recorded measurements (telemetry thinned on change, `belief/telemetry.ts`), executed commands with status, and ShipEvents. Nothing else.

`GameTruthState` (`sim`, `objectives`, `lost`) is plain JSON; the stepper is pure [DEMONSTRATED: `truth-step.test.ts`, same commands give the same hash, also through a JSON save part way].

## Recurrence v0 (P8)

Loss, completion or a voluntary Recall ends the attempt; the next begins from exactly `EncounterDefinition.world` (ship, tanks, bodies, asteroids, sensor noise streams) and runs the encounter's arrival procedure again. Black Box keeps every attempt; the model refits from the final record and keeps what it learned [DEMONSTRATED: `session.test.ts`: truth hash after Recall equals the arrival hash; the same plan flown again gives the same flight].

## The believed side (`belief/`)

| Piece | File | What it is |
|---|---|---|
| Predictive model | `model-bridge.ts` | 2C's `ModelClient` (a Web Worker in the browser) behind `ModelPort`. It owns the numbers, the calibration table, the rules and every forecast |
| Navigator | `standin-model.ts` | A 5-state filter (position, velocity, local gravity scale) on the recorded bearing and range fixes to the primary. The model is a batch estimator with no per-frame state, so this gives the believed world the view and command resolution need, in the same frame and under the law the model has in force. Alone it is also a synchronous stand-in `ModelPort` for tests and headless runs |
| Black Box | `blackbox.ts` | 2C's `AttemptRecorder` and archive behind `BlackBoxPort`; with a store, saves the attempt in progress every 30 s and at its end |
| Controls | `controls.ts` | `GameControls`: all the console and 3D view may call |
| Attitude references | `resolve.ts` | prograde, retrograde, toward, away → inertial angles |
| Telemetry policy | `telemetry.ts` | Housekeeping recorded on change |
| View | `view.ts` | `ViewSnapshot` builder |
| Plan helpers | `maneuver.ts` | `burnSteps`, `burnDuration` |

**Feeding the model** (2C handoff, item 4). Records go to the model in order: `append` then `refresh` about once a second of real time while flying, everything outstanding before any forecast, and `endAttempt` with the final record when an attempt ends (Tier G). A restored save is rebuilt with `load` once at start; within a session recurrence does not reload, because ending an attempt refits and a rebuild from records gives the same state (D7). Model calls are queued; a failure is kept in `lastError()` and the loop goes on.

**Frame.** Everything on the believed side is in the briefing's inertial frame, the one the model's forecasts use: the primary starts at the origin at rest and the two bodies' barycentre moves uniformly. It is not truth's barycentric frame.

**Attitude references.** Prograde and retrograde follow the believed inertial velocity in that frame, as the model's forecast assumes for planned burns, resolved from the navigator's state when the command executes. Toward and away use believed positions.

## Encounters (`encounter.ts`)

Content hands the loop an `EncounterSetup`: the `EncounterDefinition`, an **arrival procedure** (commands executed at t = 0 of every attempt with source `procedure`, so belief knows how the ship is set up), the ship's arrival mass, truth-evaluated `ObjectiveRule`s (`orbit-band`, `reserve`) and `PlayValues`. `arrival.ts` builds the ship's arrival state and maps `world.hidden` (`thruster.<id>.scale|misalignment`, `sensor.<id>.bias-x|bias-y|bias`) into the equipment values 2B reads.

## Play values (`DEFAULT_PLAY`, all [ASSUMED])

| Value | Setting | Why |
|---|---|---|
| Warp steps | 1, 10, 60, 300, 1000, 2000 | One tick costs about 0.25 ms (0.23 ms of it ship systems), so about 2,000 ticks a second fit in a frame budget |
| Loss speed | 3 m/s at the hull | Orbital-speed impacts are always fatal; slow bumps are survivable |
| Sun exclusion angle | 20° | Targets nearer the sun's direction are lost in glare |
| Trail interval | 60 s | Measured trail point from the believed position |
| Telemetry | kept on a 0.2% change, or every 600 s | 2B offers about 240 readings per packet; this keeps about 4% |
| Recorder rate | 0.05 Hz (arrival procedure) | One packet every 20 s: about 23,000 recorded measurements for a 7.5 h dive |
| Forecast span | 16 h | Longest look-ahead requested at commit; the model may end earlier |
| Model hand-over | every 1 s of real time | `append` + `refresh` take tens of milliseconds in the worker |
| Black Box save | every 30 s of real time, and at attempt end | Data up to a closed tab survives |

Plan helpers (`belief/maneuver.ts`): `burnSteps` turns to the burn attitude 300 s early and lets the attitude go free 5 s after the burn, because holding an attitude costs RCS propellant continuously with 2B's controller; `burnDuration` sizes a burn from nominal ratings and believed mass.

## Limits

- Loss has one cause, collision. Running out of power or propellant does not end an attempt.
- Objectives are judged on truth; the `objective` event is how the ship learns the result.
- The navigator and the model are two estimates of the ship's state. The forecast starts from the model's; the ship marker, the trail and command resolution use the navigator's. They agree to about a kilometre while the camera has fixes on the primary.
- The trails used for the two-attempt overlay are kept in memory, not saved.
- Recurrence replays the sensor noise streams too, so identical flights give identical measurements (see the 2F handoff).
