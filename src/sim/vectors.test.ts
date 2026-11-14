/**
 * 1B's reference vectors (tests/vectors/physics.json), checked against this independent
 * implementation at the production step size, plus step-halving convergence.
 */

import { describe, expect, it } from 'vitest';
import physics from '../../tests/vectors/physics.json';
import type { GravityLaw, MassiveBody, TruthWorld } from '../contracts/truth/index.ts';
import * as analytic from './analytic.ts';
import { accelerationFrom, coupling, potentialFrom } from './gravity.ts';
import * as inv from './invariants.ts';
import { createSimulation } from './simulation.ts';
import { body, makeWorld } from './test-helpers.ts';
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
  kind: 'closed_form' | 'trajectory';
  law: { exponent: number; GM: number; r0: number };
  initial: {
    r: number[];
    v: number[];
    bodies?: { id: string; GM: number; r: number[]; v: number[] }[];
  };
  source_dynamics?: string;
  binary_angular_frequency?: number;
  expect: Expectation[];
}

const cases = (physics as unknown as { cases: VectorCase[] }).cases;
const vec = (a: number[]) => ({ x: a[0]!, y: a[1]! });

/** Componentwise absolute comparison, reporting the worst error relative to tolerance. */
function compare(actual: number | number[], e: Expectation): number {
  const a = Array.isArray(actual) ? actual : [actual];
  const v = Array.isArray(e.value) ? e.value : [e.value];
  expect(a.length).toBe(v.length);
  let worst = 0;
  for (let i = 0; i < v.length; i++) {
    const err = Math.abs(a[i]! - v[i]!);
    expect(
      err,
      `${e.quantity}[${i}] at t=${e.at_t}${e.body ? ` (${e.body})` : ''}`,
    ).toBeLessThanOrEqual(e.tolerance);
    worst = Math.max(worst, err / e.tolerance);
  }
  return worst;
}

describe('closed-form vectors', () => {
  for (const c of cases.filter((c) => c.kind === 'closed_form')) {
    it(c.id, () => {
      const n = c.law.exponent;
      const law: GravityLaw = { exponent: n, referenceRadius: c.law.r0 };
      const k = coupling(c.law.GM, law);
      const r = Math.hypot(c.initial.r[0]!, c.initial.r[1]!);
      const [x, y] = c.initial.r as [number, number];
      const [vx, vy] = c.initial.v as [number, number];
      for (const e of c.expect) {
        let actual: number | number[];
        switch (e.quantity) {
          case 'speed':
            actual = analytic.circularSpeed(k, n, r);
            expect(Math.hypot(vx, vy)).toBeCloseTo(actual, 9); // the case starts on that circle
            break;
          case 'acceleration': {
            const a = accelerationFrom(k, n, 0, 0, x, y);
            actual = [a.x, a.y];
            break;
          }
          case 'specific_potential':
            actual = potentialFrom(k, n, r);
            break;
          case 'specific_energy':
            actual = analytic.specificEnergy(k, n, r, Math.hypot(vx, vy));
            break;
          case 'specific_angular_momentum':
            actual = x * vy - y * vx;
            break;
          case 'circular_period':
            actual = analytic.circularPeriod(k, n, r);
            break;
          case 'period_ratio_to_r0':
            actual = analytic.circularPeriod(k, n, r) / analytic.circularPeriod(k, n, c.law.r0);
            break;
          case 'escape_speed':
            actual = analytic.escapeSpeed(k, n, r);
            break;
          case 'escape_to_circular_ratio':
            actual = analytic.escapeSpeed(k, n, r) / analytic.circularSpeed(k, n, r);
            break;
          case 'epicyclic_frequency':
            actual = analytic.epicyclicFrequency(k, n, r);
            break;
          case 'near_circular_radial_period':
            actual = analytic.radialPeriod(k, n, r);
            break;
          case 'near_circular_apsidal_angle':
            actual = analytic.apsidalAngle(n);
            break;
          case 'near_circular_periapsis_to_periapsis_angle':
            actual = 2 * analytic.apsidalAngle(n);
            break;
          case 'near_circular_precession_per_radial_cycle':
            actual = 2 * analytic.apsidalAngle(n) - 2 * Math.PI;
            break;
          default:
            throw new Error(`unhandled quantity ${e.quantity}`);
        }
        compare(actual, e);
      }
    });
  }
});

/** World for a trajectory case: fixed source at the origin, or the listed mutual binary. */
function vectorWorld(c: VectorCase): TruthWorld {
  const law: GravityLaw = { exponent: c.law.exponent, referenceRadius: c.law.r0 };
  const bodies: MassiveBody[] =
    c.source_dynamics === 'fixed_origin'
      ? [body('primary', c.law.GM, 1000, { x: 0, y: 0 })]
      : c.initial.bodies!.map((b) => body(b.id, b.GM, 1000, vec(b.r), vec(b.v), false));
  return makeWorld({ law, bodies, position: vec(c.initial.r), velocity: vec(c.initial.v) });
}

/** Run a trajectory case, returning the state at each checkpoint time. */
function propagate(c: VectorCase, dt: number): Map<number, SimState> {
  const world = vectorWorld(c);
  const sim = createSimulation(world, { dt });
  const times = [...new Set(c.expect.map((e) => e.at_t))].sort((a, b) => a - b);
  const states = new Map<number, SimState>();
  let state = sim.initial;
  for (const t of times) {
    const steps = Math.round((t - state.world.t) / dt);
    if (steps > 0) state = sim.run(state, steps).state;
    expect(state.world.t).toBe(t);
    states.set(t, state);
  }
  return states;
}

function quantity(c: VectorCase, e: Expectation, s: SimState): number | number[] {
  const w = s.world;
  const k = w.ship.kinematics;
  const named = (id: string) => w.bodies.find((b) => b.id === id)!;
  switch (e.quantity) {
    case 'position':
      return [k.position.x, k.position.y];
    case 'velocity':
      return [k.velocity.x, k.velocity.y];
    case 'specific_energy':
      return inv.shipSpecificEnergy(w);
    case 'specific_angular_momentum':
      return inv.shipSpecificAngularMomentum(w);
    case 'body_position':
      return [named(e.body!).position.x, named(e.body!).position.y];
    case 'body_velocity':
      return [named(e.body!).velocity.x, named(e.body!).velocity.y];
    case 'binary_specific_energy':
      return inv.bodiesSpecificEnergy(w);
    case 'binary_specific_angular_momentum':
      return inv.bodiesSpecificAngularMomentum(w);
    case 'binary_barycenter': {
      const b = inv.barycenter(w);
      return [b.x, b.y];
    }
    case 'binary_barycentric_velocity': {
      const b = inv.barycentricVelocity(w);
      return [b.x, b.y];
    }
    case 'ship_jacobi_constant':
      return inv.shipJacobiConstant(w, c.binary_angular_frequency!);
    default:
      throw new Error(`unhandled quantity ${e.quantity}`);
  }
}

/** The production step for the Gravity range scale (1B §7). */
const DT = 1;

describe('trajectory vectors at dt = 1 s', () => {
  for (const c of cases.filter((c) => c.kind === 'trajectory')) {
    it(c.id, () => {
      const states = propagate(c, DT);
      for (const e of c.expect) compare(quantity(c, e, states.get(e.at_t)!), e);
    });
  }
});

describe('step-halving convergence (second order)', () => {
  for (const id of ['single-p2p5', 'binary-p2p5']) {
    it(id, () => {
      const c = cases.find((x) => x.id === id)!;
      const ref = c.expect.find((e) => e.quantity === 'position' && e.at_t === 20000)!
        .value as number[];
      const err = (dt: number) => {
        const p = propagate(c, dt).get(20000)!.world.ship.kinematics.position;
        return Math.hypot(p.x - ref[0]!, p.y - ref[1]!);
      };
      const e4 = err(4);
      const e2 = err(2);
      // Error falls about 4× per halving while it is well above the reference's own error.
      expect(e4 / e2).toBeGreaterThan(3.5);
      expect(e4 / e2).toBeLessThan(4.5);
    });
  }
});
