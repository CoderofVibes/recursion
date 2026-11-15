/**
 * The three-dimensional reference vectors (tests/vectors/physics-3d.json, written by an
 * independent Python reference: docs/physics/derivation.md §11.7), checked against this
 * implementation: inclined single-source orbits, a ship crossing the binary's plane, an
 * inclined binary, nodal precession over 2×10⁶ s, and torque-free and torqued rigid-body spin.
 *
 * Orbit cases run at the production step (dt = 1 s). The rigid-body tolerances are an accuracy
 * bar (about 4 arcseconds of attitude after 600 s), not a statement about a 1 s step
 * (tools/physics/README.md § Consumer tolerances), so those cases run at the step that meets
 * them (1/16 s), with step-halving convergence shown, as the GMAT cases do; what the scheme
 * does at 1 s is measured and bounded separately.
 *
 * `npx vitest run src/sim/vectors3d.test.ts --silent=false` prints every case's worst errors.
 */

import { describe, expect, it } from 'vitest';
import physics from '../../tests/vectors/physics-3d.json';
import type { GravityLaw, MassiveBody, TruthWorld } from '../contracts/truth/index.ts';
import type { Quat } from '../lib/quat.ts';
import type { Vec3 } from '../lib/vec3.ts';
import * as inv from './invariants.ts';
import { createSimulation } from './simulation.ts';
import { actuators, attitudeAngle, body, makeWorld, massProps } from './test-helpers.ts';
import type { SimState } from './types.ts';

interface Expectation {
  quantity: string;
  at_t: number;
  value: number | number[];
  tolerance: number;
  body?: string;
}

interface VectorCase {
  id: string;
  kind: 'trajectory' | 'rigid_body';
  law: { exponent: number; GM: number; r0: number } | null;
  initial: {
    r?: number[];
    v?: number[];
    bodies?: { id: string; GM: number; r: number[]; v: number[] }[];
    attitude?: number[];
    angular_velocity?: number[];
  };
  source_dynamics?: string;
  binary_angular_velocity?: number[];
  inertia?: { moments: number[]; axes: number[] };
  torque_body?: number[];
  expect: Expectation[];
}

const cases = (physics as unknown as { cases: VectorCase[] }).cases;
const vec = (a: number[]): Vec3 => ({ x: a[0]!, y: a[1]!, z: a[2]! });
const arr = (v: Vec3): number[] => [v.x, v.y, v.z];
const quatOf = (a: number[]): Quat => ({ w: a[0]!, x: a[1]!, y: a[2]!, z: a[3]! });

/** Worst absolute error over the components of one expectation. */
function errorOf(actual: number | number[], e: Expectation): number {
  const a = Array.isArray(actual) ? actual : [actual];
  const v = Array.isArray(e.value) ? e.value : [e.value];
  expect(a.length).toBe(v.length);
  let worst = 0;
  for (let i = 0; i < v.length; i++) worst = Math.max(worst, Math.abs(a[i]! - v[i]!));
  return worst;
}

type Quantity = (c: VectorCase, e: Expectation, s: SimState, first: SimState) => number | number[];

/** The worst absolute error per quantity over every expectation of a case. */
function errors(
  c: VectorCase,
  states: Map<number, SimState>,
  quantity: Quantity,
  assertTolerance = false,
): Record<string, number> {
  const worst: Record<string, number> = {};
  const first = states.get(0)!;
  for (const e of c.expect) {
    const err = errorOf(quantity(c, e, states.get(e.at_t)!, first), e);
    if (assertTolerance)
      expect(
        err,
        `${c.id}: ${e.quantity} at t=${e.at_t}${e.body ? ` (${e.body})` : ''}`,
      ).toBeLessThanOrEqual(e.tolerance);
    worst[e.quantity] = Math.max(worst[e.quantity] ?? 0, err);
  }
  return worst;
}

/** Check every expectation of a case against the tolerance the file states for it. */
const check = (
  c: VectorCase,
  states: Map<number, SimState>,
  quantity: Quantity,
): Record<string, number> => errors(c, states, quantity, true);

/** Print a case's worst errors (shown by `npx vitest run src/sim --silent=false`). */
function report(id: string, dt: number, worst: Record<string, number>): void {
  const parts = Object.entries(worst).map(([q, e]) => `${q} ${e.toExponential(2)}`);
  console.log(`${id} at dt = ${dt} s, worst errors: ${parts.join(', ')}`);
}

/** Run a case, returning the state at each checkpoint time. */
function propagate(
  c: VectorCase,
  world: TruthWorld,
  dt: number,
  torque?: Vec3,
): Map<number, SimState> {
  const sim = createSimulation(world, { dt });
  const times = [...new Set(c.expect.map((e) => e.at_t))].sort((a, b) => a - b);
  const act = torque ? actuators([], world.ship.systems.massProperties, torque) : undefined;
  const states = new Map<number, SimState>();
  let state = sim.initial;
  for (const t of times) {
    const steps = Math.round((t - state.world.t) / dt);
    if (steps > 0)
      state = sim.run(state, steps, act ? { input: () => ({ actuators: act }) } : {}).state;
    expect(state.world.t).toBe(t);
    states.set(t, state);
  }
  return states;
}

// ---------------------------------------------------------------------------------------------
// Orbits
// ---------------------------------------------------------------------------------------------

function orbitWorld(c: VectorCase): TruthWorld {
  const law: GravityLaw = { exponent: c.law!.exponent, referenceRadius: c.law!.r0 };
  const bodies: MassiveBody[] =
    c.source_dynamics === 'fixed_origin'
      ? [body('primary', c.law!.GM, 1000, { x: 0, y: 0, z: 0 })]
      : c.initial.bodies!.map((b) => body(b.id, b.GM, 1000, vec(b.r), vec(b.v), false));
  return makeWorld({ law, bodies, position: vec(c.initial.r!), velocity: vec(c.initial.v!) });
}

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / n, y: a.y / n, z: a.z / n };
};

/** Unit normal of the ship's osculating orbit about the primary. */
function normalAboutPrimary(s: SimState): Vec3 {
  const k = s.world.ship.kinematics;
  const p = s.world.bodies.find((b) => b.id === 'primary')!;
  const rho = {
    x: k.position.x - p.position.x,
    y: k.position.y - p.position.y,
    z: k.position.z - p.position.z,
  };
  const u = {
    x: k.velocity.x - p.velocity.x,
    y: k.velocity.y - p.velocity.y,
    z: k.velocity.z - p.velocity.z,
  };
  return unit(cross(rho, u));
}

const nodeLongitude = (n: Vec3): number => Math.atan2(n.x, -n.y);

function orbitQuantity(
  c: VectorCase,
  e: Expectation,
  s: SimState,
  first: SimState,
): number | number[] {
  const w = s.world;
  const k = w.ship.kinematics;
  const named = (id: string) => w.bodies.find((b) => b.id === id)!;
  switch (e.quantity) {
    case 'position':
      return arr(k.position);
    case 'velocity':
      return arr(k.velocity);
    case 'specific_energy':
      return inv.shipSpecificEnergy(w);
    case 'specific_angular_momentum':
      return arr(inv.shipSpecificAngularMomentumVector(w));
    case 'orbit_normal':
      return arr(unit(inv.shipSpecificAngularMomentumVector(w)));
    case 'body_position':
      return arr(named(e.body!).position);
    case 'body_velocity':
      return arr(named(e.body!).velocity);
    case 'binary_specific_energy':
      return inv.bodiesSpecificEnergy(w);
    case 'binary_specific_angular_momentum':
      return arr(inv.bodiesSpecificAngularMomentumVector(w));
    case 'binary_barycenter':
      return arr(inv.barycenter(w));
    case 'binary_barycentric_velocity':
      return arr(inv.barycentricVelocity(w));
    case 'ship_jacobi_constant':
      return inv.shipJacobiConstant(w, vec(c.binary_angular_velocity!));
    case 'ship_orbit_normal_about_primary':
      return arr(normalAboutPrimary(s));
    case 'ship_node_longitude_about_primary':
      return nodeLongitude(normalAboutPrimary(s));
    case 'ship_inclination_about_primary':
      return Math.acos(normalAboutPrimary(s).z);
    case 'ship_mean_nodal_rate_about_primary': {
      let d = nodeLongitude(normalAboutPrimary(s)) - nodeLongitude(normalAboutPrimary(first));
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d <= -Math.PI) d += 2 * Math.PI;
      return d / e.at_t;
    }
    default:
      throw new Error(`unhandled quantity ${e.quantity}`);
  }
}

/** The production step for the Gravity range scale (1B §7). */
const DT = 1;

/**
 * Measured worst ship errors at dt = 1 s (m, m/s), asserted with a little room so the README's
 * accuracy table cannot drift from what the code does. The file's own tolerances are checked
 * expectation by expectation in `check`.
 */
const MEASURED: Record<string, { position: number; velocity: number }> = {
  'inclined-single-p2': { position: 0.006, velocity: 1.2e-6 },
  'inclined-single-p2p5': { position: 0.011, velocity: 3.0e-6 },
  'binary-crossing-p2': { position: 0.04, velocity: 3.5e-6 },
  'binary-crossing-p2p5': { position: 0.4, velocity: 6.0e-5 },
  'binary-inclined-p2': { position: 2.0e-4, velocity: 5.0e-9 },
  'binary-inclined-p2p5': { position: 1.5e-4, velocity: 4.0e-9 },
  'nodal-precession-p2': { position: 0.8, velocity: 7.0e-5 },
  'nodal-precession-p2p5': { position: 1.6, velocity: 1.8e-4 },
};

describe('three-dimensional orbit vectors at dt = 1 s', () => {
  for (const c of cases.filter((c) => c.kind === 'trajectory')) {
    it(c.id, { timeout: 60_000 }, () => {
      const worst = check(c, propagate(c, orbitWorld(c), DT), orbitQuantity);
      report(c.id, DT, worst);
      const measured = MEASURED[c.id]!;
      expect(worst.position).toBeLessThanOrEqual(measured.position);
      expect(worst.velocity).toBeLessThanOrEqual(measured.velocity);
    });
  }

  it('covers every orbit case in the file', () => {
    expect(
      cases
        .filter((c) => c.kind === 'trajectory')
        .map((c) => c.id)
        .sort(),
    ).toEqual(Object.keys(MEASURED).sort());
  });
});

describe('step-halving convergence in three dimensions (second order)', () => {
  for (const id of ['inclined-single-p2p5', 'binary-crossing-p2p5', 'binary-inclined-p2p5']) {
    it(id, () => {
      const c = cases.find((x) => x.id === id)!;
      const ref = c.expect.find((e) => e.quantity === 'position' && e.at_t === 20000)!
        .value as number[];
      const err = (dt: number) => {
        const p = propagate(c, orbitWorld(c), dt).get(20000)!.world.ship.kinematics.position;
        return Math.hypot(p.x - ref[0]!, p.y - ref[1]!, p.z - ref[2]!);
      };
      const ratio = err(4) / err(2);
      // Error falls about 4× per halving while it is well above the reference's own error.
      expect(ratio).toBeGreaterThan(3.5);
      expect(ratio).toBeLessThan(4.5);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Rigid body
// ---------------------------------------------------------------------------------------------

function spinWorld(c: VectorCase): TruthWorld {
  const mp = massProps({
    inertia: { moments: vec(c.inertia!.moments), axes: quatOf(c.inertia!.axes) },
  });
  return makeWorld({
    mp,
    attitude: quatOf(c.initial.attitude!),
    angularRate: vec(c.initial.angular_velocity!),
  });
}

function spinQuantity(_c: VectorCase, e: Expectation, s: SimState): number | number[] {
  const k = s.world.ship.kinematics;
  switch (e.quantity) {
    case 'attitude': {
      // q and −q are the same attitude: align the sign with the reference, then compare.
      const ref = e.value as number[];
      const q = k.attitude;
      const dot = q.w * ref[0]! + q.x * ref[1]! + q.y * ref[2]! + q.z * ref[3]!;
      const sign = dot < 0 ? -1 : 1;
      return [sign * q.w, sign * q.x, sign * q.y, sign * q.z];
    }
    case 'angular_velocity':
      return arr(k.angularVelocity);
    case 'rotational_energy':
      return inv.shipRotationalEnergy(s.world);
    case 'angular_momentum_inertial':
      return arr(inv.shipSpinAngularMomentum(s.world));
    default:
      throw new Error(`unhandled quantity ${e.quantity}`);
  }
}

const spin = (c: VectorCase, dt: number): Map<number, SimState> =>
  propagate(c, spinWorld(c), dt, vec(c.torque_body!));

/** Attitude error at the last checkpoint as a rotation angle, rad. */
function attitudeError(c: VectorCase, dt: number): number {
  const last = c.expect.filter((e) => e.quantity === 'attitude').at(-1)!;
  const s = spin(c, dt).get(last.at_t)!;
  return attitudeAngle(s.world.ship.kinematics.attitude, quatOf(last.value as number[]));
}

/** The step at which the scheme meets the rigid-body vectors' tolerances, s. */
const SPIN_DT = 1 / 16;

describe('rigid-body vectors at dt = 1/16 s', () => {
  const spins = cases.filter((c) => c.kind === 'rigid_body');

  it('the file has the four rigid-body cases', () => {
    expect(spins.map((c) => c.id).sort()).toEqual([
      'spin-axisymmetric',
      'spin-constant-torque',
      'spin-triaxial',
      'spin-triaxial-tilted-axes',
    ]);
  });

  for (const c of spins) {
    it(c.id, () => {
      report(c.id, SPIN_DT, check(c, spin(c, SPIN_DT), spinQuantity));
    });
  }

  it('constant torque about a principal axis is exact at any step (dt = 1 s)', () => {
    const c = spins.find((x) => x.id === 'spin-constant-torque')!;
    const worst = check(c, spin(c, 1), spinQuantity);
    expect(worst.attitude).toBeLessThan(1e-12);
    expect(worst.angular_velocity).toBeLessThan(1e-14);
  });

  it('attitude error falls 4× per halving of the step (second order)', () => {
    for (const id of ['spin-axisymmetric', 'spin-triaxial', 'spin-triaxial-tilted-axes']) {
      const c = spins.find((x) => x.id === id)!;
      const e1 = attitudeError(c, 1);
      const e05 = attitudeError(c, 0.5);
      const e025 = attitudeError(c, 0.25);
      expect(e1 / e05, id).toBeGreaterThan(3.8);
      expect(e1 / e05, id).toBeLessThan(4.2);
      expect(e05 / e025, id).toBeGreaterThan(3.8);
      expect(e05 / e025, id).toBeLessThan(4.2);
    }
  });

  it('at the play step (dt = 1 s): attitude within 0.5 mrad after 600 s, invariants held', () => {
    // The file's tolerances are an accuracy bar for a refined step (tools/physics/README.md),
    // so at 1 s they are not asserted; what the scheme does there is measured and bounded here.
    // Rates of 0.03–0.043 rad/s, 18–26 rad turned in 600 s.
    for (const id of ['spin-axisymmetric', 'spin-triaxial', 'spin-triaxial-tilted-axes']) {
      const c = spins.find((x) => x.id === id)!;
      const worst = errors(c, spin(c, 1), spinQuantity);
      report(c.id, 1, worst);
      const angle = attitudeError(c, 1);
      console.log(`${id} at dt = 1 s: attitude error after 600 s ${angle.toExponential(2)} rad`);
      expect(angle, id).toBeLessThan(5e-4);
      expect(worst.attitude, id).toBeLessThan(2.5e-4); // per quaternion component
      expect(worst.angular_velocity, id).toBeLessThan(2e-5); // rad/s, of 0.03–0.043
      expect(worst.rotational_energy, id).toBeLessThan(1e-3); // J, of 104–142
      expect(worst.angular_momentum_inertial, id).toBeLessThan(1e-8); // kg·m²/s, of 7,900–11,200
    }
  });
});
