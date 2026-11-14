# src/sim — truth simulation

Owner: 2A (Simulation core). Field implementations go in `fields/` (owned by the section that builds each encounter).

**Truth side only (P11).** `src/game`, `src/content` and `src/ship` may import this; `src/model`, `src/blackbox`, `src/console`, `src/view3d` and `src/theme` may not (lint-enforced). Pure TypeScript: no DOM, no globals, no randomness, safe in a Web Worker.

## API

```ts
import { createSimulation, sensorTargets } from '../sim/index.ts';

const sim = createSimulation(encounter.world, { dt: encounter.dt, registry });
let state = sim.initial;                      // recurrence (P8) restarts from exactly this

// Each tick (src/contracts/README.md § One simulation tick):
const env = {                                  // the game layer builds EnvironmentEffects
  t: state.world.t,
  kinematics: state.world.ship.kinematics,
  specificForce: state.specificForce,          // last step's non-gravitational acceleration
  targets: sensorTargets(state.world),         // filter by what the hardware can see
  intensity: {}, fieldSignals: {},
};
const ship = shipStep(state.world.ship.systems, design, commands, env, sim.dt);
const r = sim.step(state, { actuators: ship.actuators, systems: ship.state });
state = r.state;                               // r.events, r.contacts, r.absorbed, r.minClearance
```

| Call | Does |
|---|---|
| `createSimulation(world, options)` | Checks the world (`validateWorld`), instantiates `world.fields` from `options.registry`, returns a `Simulation`. Options: `dt` (required), `registry`, `restitution` (default 0.2), `hullClearanceRange` (default 5000 m). |
| `sim.step(state, input?)` | One fixed step. Pure: same state and input give the same result. `input.actuators` is this step's `ActuatorOutput` (omit to coast); `input.systems` is stored as the new `world.ship.systems` (omit to carry it over). |
| `sim.run(state, steps, { input, sampleEvery, onSample, stopOnImpact })` | Many steps without building a world per step. `input(tick, t)` supplies each step's input. Bit-identical to calling `step` the same number of times. |
| `validateWorld(world)` | List of problems (bad law, non-positive radius, duplicate ids, overlapping bodies, ship inside a body). |
| `circularBinary(law, a, b, separation, options?)` | Two bodies on a circular mutual orbit under `law`, for content. |
| `sensorTargets(world)`, `hullInWorld(kinematics, mp)`, `bodyPointToWorld(...)` | Geometry for EnvironmentEffects and the view snapshot. |
| `coupling`, `inverseDistancePower`, `accelerationFrom`, `potentialFrom` | The gravity law. |
| `analytic.*` | Closed forms for one source: circular speed, rate, period, escape speed, epicyclic frequency, radial period, apsidal angle, specific energy. |
| `invariants.*` | Potential, ship energy and angular momentum, bodies' energy, angular momentum, barycentre and its velocity, ship Jacobi constant. |

`SimState` is plain JSON: `world` (a `TruthWorld`), `tick` (whole steps; `world.t = t0 + tick·dt`, so time never drifts), `specificForce` (body frame), `contacts` (object ids touching the hull), `closing` (clearance minima still forming). Save it, restore it, hash it.

`StepResult`: the new `state`; `events` (`SimEvent`s in time order: `clearance` minima and `impact`s); `contacts` (`ContactDetail`: time, object, impulse in N·s, hull point and normal in the body frame, relative speed, whether it was a new impact — for the game layer's `ShipEvent` `contact`); `absorbed` (asteroids that reached a body); `minClearance` (smallest clearance to anything during the step).

## Physics

**Units and frames:** SI; inertial plane, angles counter-clockwise from +x; the ship's `position` is its centre of mass; thrust points, forces and footprints are body frame from the structural datum (`src/contracts/README.md`).

**Gravity** (P4 as clarified by 1B, derived independently here): each body pulls with a = (gm / r₀²)(r₀ / r)ⁿ = K / rⁿ, K = gm·r₀ⁿ⁻², one shared r₀ (`law.referenceRadius`), any exponent n (`law.exponent`). Point sources; radii are collision envelopes only; no softening. Non-`fixed` bodies move under every other body; asteroids and the ship are test particles that feel every body. Fixed bodies never move (their velocity is treated as zero).

**Integrator:** fixed-step kick–drift–kick velocity Verlet for everything (1B §7), one force evaluation per step (accelerations are cached between steps in `run`). Ship rotation uses the same kick–drift–kick on (θ, ω): constant torque is integrated exactly. Thrust is constant in the body frame during a step and is applied at θₖ in the first half-kick and θₖ₊₁ in the second (the trapezoid rule for the turning direction). Second order throughout.

**Ship as a rigid body:** total force = Σ thrusts (rotated to inertial); torque = Σ (point − CoM) × force + pure torque, so thrust off the centre of mass turns the ship. `ActuatorOutput.massProperties` (or, when coasting, `world.ship.systems.massProperties`) gives mass, CoM, inertia and footprint for the whole step.

**Specific force** (`state.specificForce`, body frame): thrust actually applied divided by mass (averaged over the two half-steps when a field modifies thrust), plus contact impulses spread over the step. Gravity and field accelerations are never in it (P7). Feed it to the next `EnvironmentEffects.specificForce`.

**Fields:** `world.fields` specs are instantiated once from the registry, in spec order. `acceleration(p, t)` is added to the ship and asteroids (not to massive bodies) wherever gravity is evaluated. `modifyThrust(f, p, v, t)` is applied, in order, to the ship's total inertial thrust at each half-kick (with the half-step velocity at the second). It changes translation only; torque comes from the unmodified body-frame thrusts [ASSUMED].

## Step size and accuracy

Use the encounter's `dt`. **1 s** suits the Gravity range scale (r₀ = 1000 km, periods of hours). Warp changes how many steps run per frame, never `dt`.

At dt = 1 s against 1B's 20,000 s reference trajectories [DEMONSTRATED: `vectors.test.ts`]:

| Case | Ship position error | Ship velocity error | Tolerance |
|---|---|---|---|
| single source, n = 2 | 6.4 mm | 1.2 µm/s | 0.1 m, 10 µm/s |
| single source, n = 2.5 | 11 mm | 2.7 µm/s | 0.1 m, 10 µm/s |
| moving binary, n = 2 | 0.17 mm | 4.7 nm/s | 0.1 m, 10 µm/s |
| moving binary, n = 2.5 | 0.13 mm | 3.5 nm/s | 0.1 m, 10 µm/s |

Error falls 4× per halving of dt. Scale the step with the dynamics: Verlet's phase error grows like (Ω·dt)² per radian of orbit, so faster orbits (low orbits, close passes) need a smaller `dt`. 1B's resolution guard dt·√(Σ Kᵢ/rᵢⁿ⁺¹) ≤ 0.01 is a minimum, not an accuracy guarantee.

Against NASA GMAT R2026a (1D's Newtonian point-mass Earth cases, every 10 s sample, bounds 0.05 m and 5×10⁻⁵ m/s from `docs/verification/gmat.md`) [DEMONSTRATED: `gmat.test.ts`]:

| Case | dt | Worst position | Worst velocity |
|---|---|---|---|
| C1 circular, 3 periods (18,000 s) | 0.0125 s | 13 mm | 1.4×10⁻⁵ m/s |
| C2 eccentric e ≈ 0.6, 3 periods (72,000 s) | 0.00625 s | 22 mm | 1.8×10⁻⁵ m/s |
| C3 hyperbolic flyby (40,000 s) | 0.025 s | 14 mm | 2.4×10⁻⁶ m/s |
| C4 120 s prograde burn + 6,000 s coast | 0.025 s | 5.7 mm | 5.5×10⁻⁶ m/s |

These low orbits turn about ten times faster than the Gravity range and the bound is relative 7×10⁻⁹, hence the small steps. Error falls 4× per halving all the way down (C4 at 0.4 s: 2.7 m; at 0.025 s: 5.7 mm), so there is no offset in the law, units or finite-thrust handling. C4's thrust follows the instantaneous velocity through a test harness acting as a perfect attitude controller, with the mass at the middle of each step.

## Clearance and contact

- **Clearance** is hull-to-surface: the footprint polygon (convex or not) against each body's and asteroid's circle. Within `hullClearanceRange` (+ the hull's reach) it uses the polygon; farther out it is measured from the centre of mass (error at most the hull's size) and costs almost nothing.
- **Clearance events:** one `SimEvent` `clearance` per pass. A pass is the centre of mass closing on the object and opening again; the event carries the lowest hull clearance during the pass and when it happened (the middle of a flat stretch when the hull side slides past). A spinning hull gives one event per pass, not one per half-turn. A pass already under way at the start is reported; an object receding from the start is not.
- **Impacts** are found with a swept test (the object's centre moving through the hull dilated by its radius, in the body frame), so a fast pass cannot tunnel between ticks. The `impact` event gives the contact time inside the step, relative speed and the contact point (body frame).
- **Contact response** [ASSUMED]: bodies and asteroids are immovable (far heavier than the ship). The ship is placed touching the surface and gets an impulse j = (1 + e)·u·n / (1/m + (r×n)²/I) along the normal, so off-centre hits also spin it. While touching, pushing into the object is resisted without new impact events; contact ends once the hull is 1 mm clear. Whether an impact destroys the ship is the game layer's decision.
- **Asteroids** that reach a massive body's surface leave the world (`StepResult.absorbed`).

## Determinism

Same state and inputs give a bit-identical result on the same JavaScript engine [DEMONSTRATED: `determinism.test.ts`: repeated runs, step vs run, JSON save/restore part way]. For n = 2 and n = 2.5 the gravity arithmetic uses only `sqrt`, `*` and `/`, which IEEE-754 rounds exactly, so it is also identical across engines; attitude uses `Math.sin`/`Math.cos`, which are not guaranteed to be, so do not compare hashes across browsers (`src/lib/README.md`).

## Performance

Measured on the owner's Windows machine, Node 24, warmed, through `run` [DEMONSTRATED: `performance.test.ts` asserts the first row under 100 ms]:

| Scene | 10⁵ steps |
|---|---|
| Moving binary + thrusting ship with hull clearance | ≈ 15 ms |
| … + 10 asteroids | ≈ 50 ms |
| … + 30 asteroids | ≈ 120 ms |

Each asteroid costs about 35 ns per step (gravity from both bodies dominates). `step` builds a new world object each call (≈ 0.8 µs per step for the binary + ship); use it for the game loop and `run` for bulk propagation.

## Limits

- Hull clearance and the swept contact test treat the object's path as straight in the body frame over one step, which needs |ω|·dt ≪ 1. A ship spinning at radians per step may miss a contact.
- Mass properties are constant within a step. For second-order accuracy during burns, ship systems should report the mass at the middle of the step.
- Massive bodies must not touch (validated at start; not handled during a run). Asteroids are massless; massive asteroids would need the pairwise sum extended to them.
- No `field-boundary` events yet: `EnvironmentField` has no way to say where a field's boundary is (see the 2A handoff's requests).
- Contact resolution moves the ship to the contact point at the end of the step; the remainder of that step's motion is dropped.
- A full forecast is not this module's job: belief-side code may not import it (P11). The predictive model (2C) propagates its own believed world.

## Files

| File | Holds |
|---|---|
| `simulation.ts` | `createSimulation`, `validateWorld`, the packed state, the step, clearance and contact |
| `types.ts` | `SimOptions`, `SimInput`, `SimState`, `StepResult`, `ContactDetail`, `RunOptions`, `Simulation` |
| `gravity.ts` | The law: coupling K, 1/rⁿ⁺¹, acceleration, potential |
| `analytic.ts` | Closed forms for one source; `circularBinary` |
| `invariants.ts` | Conserved quantities for tests and debugging |
| `geometry.ts` | Point and segment against polygon, swept circle against polygon |
| `snapshot.ts` | Hull in world coordinates, sensor targets |
| `*.test.ts`, `test-helpers.ts` | Tests (vectors, rigid body, contact, fields, determinism, invariants, performance) |
