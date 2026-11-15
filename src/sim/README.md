# src/sim — truth simulation

Owner: 2A (Simulation core); made three-dimensional by 2G (DECISIONS A11). Field implementations go in `fields/` (owned by the section that builds each encounter).

**Truth side only (P11).** `src/game`, `src/content` and `src/ship` may import this; `src/model`, `src/blackbox`, `src/console`, `src/view3d` and `src/theme` may not (lint-enforced). Pure TypeScript: no DOM, no globals, no randomness, safe in a Web Worker.

**Three-dimensional.** Bodies, asteroids and the ship move in space; the ship is a rigid body with a quaternion attitude and a full inertia tensor; its hull is a union of prisms. A planar scene (every z zero, the ship turning about +z about a principal axis) stays exactly planar: every z, the quaternion's x and y and the roll and pitch rates stay exactly 0 [DEMONSTRATED: `determinism-3d.test.ts`], and the numbers are the planar simulation's (all 62 planar tests pass unchanged).

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
| `validateWorld(world)` | List of problems (bad law, non-positive radius, duplicate ids, bodies overlapping or the ship inside a body by their 3D distance, a zero attitude quaternion). |
| `circularBinary(law, a, b, separation, options?)` | Two bodies on a circular mutual orbit under `law`, in any plane, for content. Options: `normal` (the orbit plane's normal; default +z, the x–y plane), `phase`, `sense`, `barycenter`, `barycenterVelocity`. Returns `bodies`, the signed `angularRate` about the normal and the vector `angularVelocity`. |
| `circularBinaryPlane(normal?)` | The plane's unit `normal` and its axes `e1`, `e2`: +x and +y carried by the smallest rotation that takes +z onto the normal. `phase` is measured from `e1` toward `e2`. For the default plane they are +x and +y, and `circularBinary` gives exactly the planar numbers. |
| `sensorTargets(world)`, `hullInWorld(kinematics, mp)`, `bodyPointToWorld(...)` | Geometry for EnvironmentEffects and the view snapshot: relative positions and velocities of every object, the hull's corners prism by prism, a body-frame point in the inertial frame. |
| `coupling`, `inverseDistancePower`, `accelerationFrom`, `potentialFrom` | The gravity law. `accelerationFrom(k, n, source, at)` takes two `Vec3`; the planar form `(k, n, sourceX, sourceY, x, y)` remains. |
| `analytic.*` | Closed forms for one source: circular speed, rate, period, escape speed, epicyclic frequency, radial period, apsidal angle, specific energy. |
| `invariants.*` | Potential; ship orbital energy and angular momentum; bodies' energy, angular momentum, barycentre and its velocity; ship Jacobi constant for a binary in any plane; the ship's rotational energy and spin angular momentum. Angular momenta come as vectors (`shipSpecificAngularMomentumVector`, `bodiesSpecificAngularMomentumVector`, `shipSpinAngularMomentum`); the older scalar names (`shipSpecificAngularMomentum`, `bodiesSpecificAngularMomentum`) are their z components. `shipJacobiConstant(world, omega)` takes the binary's angular-velocity vector, or a number for a binary turning about +z. |

`SimState` is plain JSON: `world` (a `TruthWorld`), `tick` (whole steps; `world.t = t0 + tick·dt`, so time never drifts), `specificForce` (body frame, three components), `contacts` (object ids touching the hull), `closing` (clearance minima still forming). Save it, restore it, hash it.

`StepResult`: the new `state`; `events` (`SimEvent`s in time order: `clearance` minima and `impact`s); `contacts` (`ContactDetail`: time, object, impulse in N·s, hull point and normal in the body frame, relative speed, whether it was a new impact — for the game layer's `ShipEvent` `contact`); `absorbed` (asteroids that reached a body); `minClearance` (smallest clearance to anything during the step).

## Physics

**Units and frames:** SI; one right-handed inertial frame; the ship's `position` is its centre of mass; `attitude` is a unit quaternion taking body-frame vectors to the inertial frame; `angularVelocity` is in the body frame; thrust points, forces, torque and the hull are body frame from the structural datum (`src/contracts/README.md` § Conventions).

**Gravity** (P4 as clarified by 1B, derived independently here): each body pulls with a = (gm / r₀²)(r₀ / r)ⁿ = K / rⁿ along the line between centres, r their distance in three dimensions, K = gm·r₀ⁿ⁻², one shared r₀ (`law.referenceRadius`), any exponent n (`law.exponent`). Point sources; radii are collision envelopes only; no softening. Non-`fixed` bodies move under every other body; asteroids and the ship are test particles that feel every body. Fixed bodies never move (their velocity is treated as zero). For n = 2 and n = 2.5 the arithmetic is `sqrt`, `*` and `/` only.

**Integrator:** fixed-step kick–drift–kick velocity Verlet for every position and velocity (1B §7), one force evaluation per step (accelerations are cached between steps in `run`). Thrust is constant in the body frame during a step and is applied at the attitude of the step's start in the first half-kick and of its end in the second (the trapezoid rule for the turning direction). Second order throughout.

**Ship as a rigid body:** total force = Σ thrusts (rotated to inertial); torque about the centre of mass = Σ (point − CoM) × force + the pure torque vector, all in the body frame, so thrust off the centre of mass turns the ship about whichever axes the offset gives. `ActuatorOutput.massProperties` (or, when coasting, `world.ship.systems.massProperties`) gives mass, CoM, inertia (`{ moments, axes }`: principal moments and the rotation from the principal frame to the body frame) and hull for the whole step.

**Specific force** (`state.specificForce`, body frame, three components): thrust actually applied divided by mass (averaged over the two half-steps when a field modifies thrust), plus contact impulses spread over the step. Gravity and field accelerations are never in it (P7). Feed it to the next `EnvironmentEffects.specificForce`.

**Fields:** `world.fields` specs are instantiated once from the registry, in spec order. `acceleration(p, t)` is asked at each particle's 3D position and added to the ship and asteroids (not to massive bodies) wherever gravity is evaluated. `modifyThrust(f, p, v, t)` is applied, in order, to the ship's total inertial thrust vector at each half-kick (with the half-step velocity at the second), and is not asked when there is no thrust. It changes translation only; torque comes from the unmodified body-frame thrusts [ASSUMED]. [DEMONSTRATED: `fields.test.ts`, `fields-3d.test.ts`]

## Attitude

**State:** the unit quaternion q (body → inertial) and the angular velocity ω in the body frame. Each step: half kick of ω by the torque, the free rigid body for dt, half kick. The torque is constant in the body frame over a step, so the two kicks are equal.

**Scheme** [ASSUMED: the lead's recommendation, used as given]: the free rigid body is split along the principal axes into three exact rotations (the angular-momentum splitting of McLachlan and Reich; also Touma and Wisdom; Dullweber, Leimkuhler and McLachlan). With L = I·ω in the principal frame the kinetic energy is Σ Lᵢ²/(2Iᵢ); the flow of each term alone is exact: L turns about principal axis i by −(Lᵢ/Iᵢ)·τ while the attitude turns about that axis by +(Lᵢ/Iᵢ)·τ, which leaves the inertial angular momentum unchanged. The step composes them symmetrically: x for dt/2, y for dt/2, z for dt, y for dt/2, x for dt/2.

Why this one: it is second order and time-symmetric like the kick–drift–kick around it; every sub-step is a rotation, so |L| and |q| are kept to rounding and the inertial angular-momentum vector is constant to rounding; it is the exact flow of a nearby rigid body, so the energy error oscillates and does not drift; and for a ship turning about its principal z axis it is exactly the planar scheme it replaces (θ += dt·ω, constant torque integrated exactly).

**Details that matter:**

- The state between steps is ω, not L. Each sub-rotation forms the two momentum components it turns, turns them and divides back, so a component that is not turned keeps its exact bits; a sub-rotation through a zero angle is skipped. A torque-free spin about a principal axis therefore keeps its rate exactly, and with principal axes = body axes the planar ω is bit for bit what the planar code gave [DEMONSTRATED: `rigid-body-3d.test.ts`, `invariants.test.ts`].
- When the principal axes are not the body axes, the attitude is turned about each principal axis as it lies in the body frame, and ω gets back P·(change of the principal rates). Neither is carried into the principal frame and back, which would add a rounding error every step.
- **Changing inertia:** mass properties are constant within a step and may change between steps. Because the state is ω, the rates are continuous across a change and the angular momentum I·ω jumps with I. That is right for mass that leaves (propellant carries its own share away) and wrong for mass that only moves (deploying radiators should slow a spin; here they do not) [ASSUMED]. Ship systems would have to pass the correction as a torque if it ever matters.
- **Renormalisation:** only if needed. At the start of a step the quaternion is renormalised if its squared length is more than 10⁻¹² from 1. The integrator never gets there by itself (below), so in practice this only repairs a quaternion handed in from outside.
- The rotation matrix of q is recomputed only when q changes; a ship that is not turning and has no torque on it keeps exactly the attitude it was given.

**Measured, torque-free, tumbling at |ω| = 0.05 rad/s** (rates (0.03, −0.02, 0.035) rad/s, a general starting attitude; errors relative to the initial value, the worst over the run). [DEMONSTRATED: `rigid-body-3d.test.ts` asserts, for these four bodies at dt = 1 s over 4×10⁵ s, energy below 6×10⁻⁶, 4×10⁻⁶, 3×10⁻⁵ and 4.5×10⁻⁵ and the same within 5% in the first and last quarter of the run, L and |q| − 1 below 2×10⁻¹², and the 4× energy scaling at 1, 0.5 and 0.25 s.] The 10⁶ s and 0.25 s rows were measured once with the same code and sampling and are not asserted:

| Body (principal moments, kg·m²) | dt | Run | Rotational energy | Inertial L vector | \|q\| − 1 |
|---|---|---|---|---|---|
| Triaxial (3×10⁴, 1.6×10⁵, 2×10⁵), axes = body | 1 s | 10⁵ s | 5.4×10⁻⁶ | 1.5×10⁻¹³ | 7×10⁻¹⁴ |
| same | 1 s | 10⁶ s | 5.4×10⁻⁶ | 4.1×10⁻¹³ | 2.2×10⁻¹³ |
| same | 0.25 s | 10⁶ s | 3.4×10⁻⁷ | 1.8×10⁻¹² | 5.0×10⁻¹³ |
| Triaxial, principal axes tilted from the body's | 1 s | 10⁶ s | 3.3×10⁻⁶ | 2.7×10⁻¹³ | 1.8×10⁻¹³ |
| same | 0.25 s | 10⁶ s | 2.1×10⁻⁷ | 5.7×10⁻¹³ | 4.4×10⁻¹³ |
| Axisymmetric (3×10⁴, 1.6×10⁵, 1.6×10⁵), axes = body | 1 s | 10⁶ s | 2.5×10⁻⁵ | 3.8×10⁻¹³ | 1.6×10⁻¹³ |
| same | 0.25 s | 10⁶ s | 1.5×10⁻⁶ | 8.2×10⁻¹³ | 2.3×10⁻¹³ |
| Axisymmetric, tilted axes | 1 s | 10⁶ s | 3.9×10⁻⁵ | 6.3×10⁻¹³ | 1.3×10⁻¹³ |

- **Energy:** an oscillation of order (ω·dt)², the same size after 10⁵ s as after 10⁶ s and in every quarter of a run: no secular drift. It falls 4× per halving of dt (2.2×10⁻⁵, 5.3×10⁻⁶, 1.3×10⁻⁶, 3.3×10⁻⁷ at 2, 1, 0.5, 0.25 s) and 100× at a tenth of the rate (below 6×10⁻⁸ at 0.005 rad/s).
- **Angular momentum and quaternion length:** rounding only, growing like a random walk (about 10⁻¹⁶ per step). The renormalisation threshold is not reached in 4×10⁶ steps.
- **Attitude itself (phase) is second order:** against a 1/64 s run, the tilted triaxial body after 500 s (25 rad turned) is off by 3.5×10⁻³, 8.8×10⁻⁴, 2.2×10⁻⁴ and 5.5×10⁻⁵ rad at dt = 2, 1, 0.5 and 0.25 s: 4.0× per halving. The error is in where the body is along its motion, not in the invariants; it scales as (ω·dt)² per radian turned, so at 0.01 rad/s it is 25 times smaller.
- An isotropic body spinning about an axis that is not a body axis shows the same second-order phase error in its body rates, although its exact rates are constant (the splitting singles out the three coordinate axes).

## Step size and accuracy

Use the encounter's `dt`. **1 s** suits the Gravity range scale (r₀ = 1000 km, periods of hours). Warp changes how many steps run per frame, never `dt`.

**Planar reference trajectories** (1B's `tests/vectors/physics.json`, 20,000 s) at dt = 1 s [DEMONSTRATED: `vectors.test.ts`]:

| Case | Ship position error | Ship velocity error | Tolerance |
|---|---|---|---|
| single source, n = 2 | 6.4 mm | 1.2 µm/s | 0.1 m, 10 µm/s |
| single source, n = 2.5 | 11 mm | 2.7 µm/s | 0.1 m, 10 µm/s |
| moving binary, n = 2 | 0.17 mm | 4.6 nm/s | 0.1 m, 10 µm/s |
| moving binary, n = 2.5 | 0.13 mm | 3.5 nm/s | 0.1 m, 10 µm/s |

**Three-dimensional reference trajectories** (`tests/vectors/physics-3d.json`, an independent Python reference, derivation §11.7) at dt = 1 s. All 412 expectations of the eight orbit cases are within the tolerances the file states, including the invariants as vectors, the Jacobi constant with the binary's angular-velocity vector, the node longitude (to 2.7×10⁻⁹ rad after 2×10⁶ s) and the mean nodal rate [DEMONSTRATED: `vectors3d.test.ts`, which also asserts the worst errors below with a little room]:

| Case | Worst ship position error | Worst ship velocity error | Tolerance |
|---|---|---|---|
| inclined single source, n = 2 (20,000 s) | 4.7 mm | 0.91 µm/s | 0.1 m, 10 µm/s |
| inclined single source, n = 2.5 | 9.0 mm | 2.4 µm/s | 0.1 m, 10 µm/s |
| ship crossing the binary's plane, n = 2 | 30 mm | 2.7 µm/s | 1 m, 200 µm/s |
| ship crossing the binary's plane, n = 2.5 (passes 387 km from the primary) | 0.32 m | 48 µm/s | 1 m, 200 µm/s |
| inclined binary, n = 2 | 0.13 mm | 3.6 nm/s | 0.1 m, 10 µm/s |
| inclined binary, n = 2.5 | 0.10 mm | 2.8 nm/s | 0.1 m, 10 µm/s |
| nodal precession, n = 2 (2×10⁶ s, 32 ship orbits) | 0.63 m | 54 µm/s | 5 m, 500 µm/s |
| nodal precession, n = 2.5 | 1.2 m | 142 µm/s | 5 m, 500 µm/s |

These are the same figures the reference's own 1 s velocity-Verlet probe reports (`tools/physics/README.md` § Consumer tolerances), written in another language from the same file. Error falls 4× per halving of dt [DEMONSTRATED: `vectors.test.ts`, `vectors3d.test.ts`]. Scale the step with the dynamics: Verlet's phase error grows like (Ω·dt)² per radian of orbit, so faster orbits (low orbits, close passes) need a smaller `dt`. 1B's resolution guard dt·√(Σ Kᵢ/rᵢⁿ⁺¹) ≤ 0.01 is a minimum, not an accuracy guarantee.

**Rigid-body reference** (the four `spin-*` cases of the same file, 96 expectations; checkpoints to 600 s). Its tolerances (attitude 10⁻⁵ per quaternion component, rates 10⁻⁷ rad/s, energy 10⁻⁴ J, inertial angular momentum 10⁻² kg·m²/s) are an accuracy bar for a refined step, not for 1 s, so the cases are run at the step that meets them, as the GMAT cases are [DEMONSTRATED: `vectors3d.test.ts`]:

| Case | dt = 1/16 s: attitude (per component), rates, energy, L | dt = 1 s: attitude after 600 s, rates, energy, L |
|---|---|---|
| `spin-axisymmetric` (closed form) | 5.9×10⁻⁸, 7.3×10⁻¹⁰ rad/s, 1.5×10⁻⁶ J, 1.0×10⁻⁹ | 3.5×10⁻⁵ rad, 1.9×10⁻⁷ rad/s, 3.9×10⁻⁴ J of 104, 5×10⁻¹¹ |
| `spin-triaxial` (near the unstable axis) | 8.5×10⁻⁷, 4.1×10⁻⁸ rad/s, 3.2×10⁻⁶ J, 4.4×10⁻¹⁰ | 4.8×10⁻⁴ rad, 1.1×10⁻⁵ rad/s, 8.1×10⁻⁴ J of 142, 5×10⁻¹¹ |
| `spin-triaxial-tilted-axes` | 8.2×10⁻⁷, 4.0×10⁻⁸ rad/s, 3.2×10⁻⁶ J, 1.2×10⁻⁹ | 4.8×10⁻⁴ rad, 1.0×10⁻⁵ rad/s, 8.1×10⁻⁴ J of 142, 8×10⁻¹¹ |
| `spin-constant-torque` (closed form) | 1.4×10⁻¹², 1.8×10⁻¹⁴ rad/s | exact to rounding at any step: below 10⁻¹² and 10⁻¹⁴ rad/s |

At 1/16 s every tolerance is met (the tightest by 2.4×, in the triaxial rates). At 1 s the attitude, rate and energy tolerances are not met and are not claimed; the test bounds what the scheme does there (0.5 mrad, 2×10⁻⁵ rad/s, 10⁻³ J, 10⁻⁸ kg·m²/s). The attitude error falls 4× per halving (3.8–4.2 asserted at 1, 0.5, 0.25 s). The reference's own second-order probe (explicit midpoint, not this scheme) is off by 4.5×10⁻³ rad on the axisymmetric case at 1 s; the splitting is about 130 times closer there and the same on the triaxial case.

**NASA GMAT R2026a** (point-mass Earth, every 10 s sample, bounds 0.05 m and 5×10⁻⁵ m/s as norms over every axis, mass 10⁻⁶ kg: P17, `docs/verification/gmat.md`) [DEMONSTRATED: `gmat.test.ts`]:

| Case | dt | Worst position | Worst velocity |
|---|---|---|---|
| C1 circular, 3 periods (18,000 s) | 0.0125 s | 13 mm | 1.4×10⁻⁵ m/s |
| C2 eccentric e ≈ 0.6, 3 periods (72,000 s) | 0.00625 s | 22 mm | 1.8×10⁻⁵ m/s |
| C3 hyperbolic flyby (40,000 s) | 0.025 s | 14 mm | 2.4×10⁻⁶ m/s |
| C4 120 s prograde burn + 6,000 s coast | 0.025 s | 5.7 mm | 5.5×10⁻⁶ m/s |
| C5 inclined eccentric, e = 0.35, i = 55°, 3 periods (36,000 s) | 0.025 s | 13 mm | 1.2×10⁻⁵ m/s |
| C6 inclined, 200 s burn along a fixed inertial direction + 7,000 s coast | 0.0125 s | 13 mm | 1.3×10⁻⁵ m/s |
| C7 inclined retrograde hyperbolic flyby, i = 120° (40,000 s) | 0.025 s | 14 mm | 2.6×10⁻⁶ m/s |

C1–C4 are in the equatorial plane and are unchanged from the planar simulation. C5–C7 use the vectors' own axes; x, y and z each move by thousands of kilometres. These low orbits turn about ten times faster than the Gravity range and the bound is relative 7×10⁻⁹, hence the small steps. Error falls 4× per halving (asserted for C1, C4, C5 and C6), so there is no offset in the law, units or finite-thrust handling in any axis. C5: 4.1 m, 1.0 m, 0.26 m, 62 mm, 13 mm, 3.0 mm at 0.4 s down to 0.0125 s. C6: 2.7 m, 0.68 m, 0.18 m, 52 mm, 21 mm, 13 mm, 11 mm at 0.4 s down to 0.00625 s: it converges to about 10 mm, not to zero, which is the reference's own residual from GMAT's stop timing under thrust (10.2 mm against the ideal solution of the stated model, `gmat.md`). The harness's mass law matches every sample within 4.3×10⁻⁷ kg.

C4's thrust follows the instantaneous velocity through a test harness acting as a perfect attitude controller. C6's engine is fixed in the body: the ship holds one attitude, body +x along the stated direction, and the thrust acts through the centre of mass, so the simulation leaves the attitude exactly alone for the whole burn. Both use the stated mass at the middle of each step.

## Clearance and contact

- **Shapes:** the hull is `MassProperties.hull`, a union of convex prisms (a convex outline in body x–y, extruded from `zMin` to `zMax`); bodies and asteroids are spheres. An empty hull is a point at the centre of mass.
- **Clearance** is hull-to-surface. Within `hullClearanceRange` (+ the hull's reach, `hullReach(hull, centerOfMass)`) it uses the prisms; farther out it is measured from the centre of mass (error at most the hull's size) and costs almost nothing.
- **Distance to a prism is exact:** with d₂ the signed planar distance to the outline and d_z = max(zMin − z, z − zMax), it is d₂ beside the prism, d_z above or below it, hypot(d₂, d_z) off an edge or a corner, and max(d₂, d_z) (negative) inside. The closest point and the outward normal come from the same cases. The hull's distance is the smallest over its prisms.
- **Over a step** the object's centre moves along a straight segment in the body frame (from where it is seen at the starting attitude to where it is seen at the final one). If the segment stays inside a prism's slab (zMin ≤ z ≤ zMax at both ends) the problem is exactly planar and uses the closed forms the planar simulation used, so planar scenes give the same numbers. Otherwise it uses the fact that the distance to a convex prism is a convex function along a line: rising at the start means the minimum is the start, falling at the end means the end (most steps; four distance evaluations); otherwise a golden-section search (40 steps) finds the minimum, with two bisections (26 steps each) for the ends of a flat stretch, whose middle is reported; the first time within the object's radius is a bisection (44 steps) between the start and the minimum. All counts are fixed, so the result is deterministic. Checked against a brute-force scan of some 300 random segments, to 10⁻⁷ m [DEMONSTRATED: `contact-3d.test.ts`].
- **Clearance events:** one `SimEvent` `clearance` per pass. A pass is the centre of mass closing on the object and opening again; the event carries the lowest hull clearance during the pass and when it happened (the middle of a flat stretch when a side or the top slides past). A hull tumbling about all three axes gives one event per pass, not one per half-turn. A pass already under way at the start is reported; an object receding from the start is not.
- **Impacts** are found with the swept test above, so a fast pass cannot tunnel between ticks: a rock crossing the whole hull at 5 km/s, or coming from far outside the clearance range at 20 km/s, in a 1 s step is caught at the time its surface meets the hull [DEMONSTRATED]. The `impact` event gives the contact time inside the step, relative speed and the contact point (body frame): on a side wall, a cap, an edge or a corner.
- **Contact response** [ASSUMED]: bodies and asteroids are immovable (far heavier than the ship). The ship is placed touching the surface and gets an impulse along the contact normal n,
  j = (1 + e)·(u·n) / (1/m + n·((I⁻¹(r × n)) × r)), Δv = −(j/m)·n, Δω = −I⁻¹(r × j·n),
  with r the contact point from the centre of mass, u the hull point's velocity relative to the object (ω × r included) and I the full inertia tensor (r, n and ω in the body frame). An off-centre hit spins the ship about whichever axes r × n gives; the hull point leaves along the normal at e times the speed it arrived with [DEMONSTRATED for faces, edges, corners, a tilted inertia tensor and a tumbling ship]. In the plane, with z a principal axis, this is the planar formula j = (1 + e)·u·n / (1/m + (r × n)²/I). While touching, pushing into the object is resisted without new impact events; contact ends once the hull is 1 mm clear. The impulse appears in the specific force. Whether an impact destroys the ship is the game layer's decision.
- **Asteroids** that reach a massive body's surface (3D distance) leave the world (`StepResult.absorbed`).

[DEMONSTRATED: `contact.test.ts` (planar, unchanged), `contact-3d.test.ts`: a sphere meeting the top face, an edge and a corner with the right time, point, normal and rebound; a pass over the hull that clears a 2 m-tall hull by 1 m and hits a 4 m-tall one; a rock that misses the body and lands on a panel when the hull has one; one clearance event per pass for a tumbling hull.]

## Determinism

Same state and inputs give a bit-identical result on the same JavaScript engine [DEMONSTRATED: `determinism.test.ts`, and `determinism-3d.test.ts` for an inclined binary, asteroids in other planes and a three-prism ship with a tilted inertia tensor burning, turning about all three axes and hitting a rock: repeated runs, step vs run, JSON save and restore before, at and after the impact]. No value the simulation computes is −0 (JSON cannot carry one), so a saved state restores to exactly the same bits. For n = 2 and n = 2.5 the gravity arithmetic uses only `sqrt`, `*` and `/`, which IEEE-754 rounds exactly, so it is also identical across engines; attitude uses `Math.sin`/`Math.cos`, which are not guaranteed to be, so do not compare hashes across browsers (`src/lib/README.md`).

## Performance

Measured on the owner's Windows machine, Node 24, warmed, through `run`, with the planar code (2A) and this code timed alternately in one process while other work was running on the machine (2A measured 15, 50 and 120 ms for the first three rows on a quiet one) [DEMONSTRATED: `performance.test.ts` asserts the first row under 100 ms]:

| Scene, 10⁵ steps | Planar code | This code |
|---|---|---|
| Moving binary + thrusting ship with hull clearance (the ship tumbles in three dimensions here) | 20 ms | 27 ms |
| … + 10 asteroids | 71 ms | 82 ms |
| … + 30 asteroids | 155 ms | 178 ms |
| Moving binary + a ship turning about z only (principal axes = body axes) | 20 ms | 18 ms |
| `step`, 10⁵ calls (it builds a new world object each call) | 51 ms | 63 ms |

A turning ship costs about 80 ns more per step than before (five rotations, ten sine and cosine calls); a ship that is not turning costs nothing extra. Each asteroid costs about 50 ns per step (gravity from both bodies dominates). Hull clearance against an object within range costs about 0.2 µs per prism per step, and about 5 µs per prism in the one step of a pass that holds the minimum; beyond range it is a few nanoseconds. Use `step` for the game loop and `run` for bulk propagation.

## Limits

- Hull clearance and the swept contact test treat the object's path as straight in the body frame over one step, which needs |ω|·dt ≪ 1. A ship tumbling at a good fraction of a radian per step may miss a contact.
- Attitude is second order in (ω·dt): at 0.05 rad/s and 1 s the phase error is of order 10⁻³ rad after 500 s (the invariants hold far better). A burn of Δv made with an attitude error δθ is off by Δv·δθ across the thrust.
- Mass properties are constant within a step. For second-order accuracy during burns, ship systems should report the mass at the middle of the step. The rates, not the angular momentum, are continuous when the inertia changes (§ Attitude).
- No gravity-gradient torque: gravity acts at the centre of mass only (derivation §11.6 estimates up to 0.2 N·m at 400 km from Alpha).
- Hull prisms are taken as convex (the contract says so). A concave outline is still measured exactly while the object stays in the prism's slab, but the search used outside it assumes convexity.
- Massive bodies must not touch (validated at start; not handled during a run). Asteroids are massless; massive asteroids would need the pairwise sum extended to them.
- No `field-boundary` events yet: the simulation does not call `EnvironmentField.inside`.
- Contact resolution moves the ship to the contact point at the end of the step; the remainder of that step's motion is dropped. An object's centre found deeper inside a prism than half its height is pushed out through the nearer cap.
- A full forecast is not this module's job: belief-side code may not import it (P11). The predictive model (2C) propagates its own believed world.

## Files

| File | Holds |
|---|---|
| `simulation.ts` | `createSimulation`, `validateWorld`, the packed state, the step, the attitude update, clearance and contact |
| `types.ts` | `SimOptions`, `SimInput`, `SimState`, `StepResult`, `ContactDetail`, `RunOptions`, `Simulation` |
| `gravity.ts` | The law: coupling K, 1/rⁿ⁺¹, acceleration, potential |
| `analytic.ts` | Closed forms for one source; `circularBinary`, `circularBinaryPlane` |
| `invariants.ts` | Conserved quantities for tests and debugging |
| `geometry.ts` | Point and segment against polygon (planar) and against prisms and hulls (3D) |
| `snapshot.ts` | Hull in world coordinates, sensor targets |
| `*.test.ts`, `test-helpers.ts` | Tests. Planar, unchanged: `vectors`, `gmat` (C1–C4), `rigid-body`, `contact`, `fields`, `determinism`, `invariants`, `performance`. Three-dimensional: `vectors3d`, `gmat` (C5–C7), `rigid-body-3d`, `contact-3d`, `fields-3d`, `determinism-3d`, `inclined`, `snapshot`. `npx vitest run src/sim --silent=false` prints the worst errors of every 3D vector case (at 1 s, and the spin cases at 1/16 s too) and of GMAT C5–C7. |
