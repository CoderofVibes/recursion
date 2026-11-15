/**
 * NASA GMAT R2026a reference trajectories (1D, tests/vectors/gmat/): Newtonian point-mass Earth,
 * three coasts and a finite prograde burn in the equatorial plane (C1–C4), and three inclined
 * cases added when flight became three-dimensional (C5–C7, thread 2G): an inclined eccentric
 * orbit, a burn along a fixed inertial direction that turns the orbit plane, and a retrograde
 * hyperbolic flyby. Every 10 s sample of every case must match within the acceptance bounds
 * (DECISIONS P17, docs/verification/gmat.md): 0.05 m and 5e-5 m/s, as norms over every axis.
 *
 * 1D wrote those bounds for RK4 and asked a Verlet integrator to show its own convergence: the
 * error must fall toward GMAT as the step shrinks, with no offset. These low orbits turn about
 * ten times faster than the Gravity range, and 0.05 m on a 7,000 km orbit is a relative 7e-9, so
 * each case uses a step that divides 10 s and meets the bound with margin.
 */

import { describe, expect, it } from 'vitest';
import c1 from '../../tests/vectors/gmat/c1-circular.csv?raw';
import c2 from '../../tests/vectors/gmat/c2-eccentric.csv?raw';
import c3 from '../../tests/vectors/gmat/c3-hyperbolic.csv?raw';
import c4 from '../../tests/vectors/gmat/c4-finite_burn.csv?raw';
import c5 from '../../tests/vectors/gmat/c5-inclined_eccentric.csv?raw';
import c6 from '../../tests/vectors/gmat/c6-inclined_burn.csv?raw';
import c7 from '../../tests/vectors/gmat/c7-inclined_hyperbolic.csv?raw';
import { isotropicInertia, type MassProperties } from '../contracts/ship.ts';
import type { TruthWorld } from '../contracts/truth/index.ts';
import * as quat from '../lib/quat.ts';
import type { Quat } from '../lib/quat.ts';
import { accelerationFrom } from './gravity.ts';
import { createSimulation } from './simulation.ts';
import { systemsWith } from './test-helpers.ts';
import type { SimInput, SimState } from './types.ts';

const POSITION_TOL = 0.05; // m
const VELOCITY_TOL = 5e-5; // m/s
const MASS_TOL = 1e-6; // kg
const SAMPLE = 10; // s

interface Vector {
  header: {
    case: string;
    mu_m3_s2: number;
    burn?: { thrust_N: number; Isp_s: number; g0_mps2: number; start_s: number; stop_s: number };
  };
  /** t, x, y, vx, vy, mass */
  rows: number[][];
}

function parse(csv: string): Vector {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  const header = JSON.parse(lines[0]!.replace(/^# /, '')) as Vector['header'];
  expect(lines[1]).toBe('t_s,x_m,y_m,vx_mps,vy_mps,mass_kg');
  const rows = lines.slice(2).map((l) => l.split(',').map(Number));
  // Missing or altered vectors must fail explicitly (1D).
  expect(rows.length).toBeGreaterThan(100);
  rows.forEach((r, i) => expect(r[0]).toBe(i * SAMPLE));
  return { header, rows };
}

const point = (mass: number): MassProperties => ({
  mass,
  centerOfMass: { x: 0, y: 0, z: 0 },
  inertia: isotropicInertia(1),
  hull: [],
});

function earthWorld(v: Vector): TruthWorld {
  const r = v.rows[0]!;
  return {
    t: 0,
    law: { exponent: 2, referenceRadius: 1e6 }, // Newtonian: r0 drops out
    bodies: [
      {
        id: 'earth',
        name: 'Earth',
        gm: v.header.mu_m3_s2,
        radius: 6_378_136.3,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        fixed: true,
      },
    ],
    asteroids: [],
    ship: {
      kinematics: {
        // The GMAT vectors are planar: lifted into the x–y plane.
        position: { x: r[1]!, y: r[2]!, z: 0 },
        velocity: { x: r[3]!, y: r[4]!, z: 0 },
        attitude: quat.fromYaw(0),
        angularVelocity: { x: 0, y: 0, z: 0 },
      },
      systems: systemsWith(point(r[5]!)),
    },
    fields: [],
    hidden: {},
  };
}

/** Worst position and velocity error over every sample. */
function worst(v: Vector, states: SimState[]): { position: number; velocity: number } {
  expect(states).toHaveLength(v.rows.length);
  let position = 0;
  let velocity = 0;
  v.rows.forEach((r, i) => {
    const k = states[i]!.world.ship.kinematics;
    expect(states[i]!.world.t).toBe(r[0]);
    position = Math.max(position, Math.hypot(k.position.x - r[1]!, k.position.y - r[2]!));
    velocity = Math.max(velocity, Math.hypot(k.velocity.x - r[3]!, k.velocity.y - r[4]!));
  });
  return { position, velocity };
}

function coast(v: Vector, dt: number) {
  const sim = createSimulation(earthWorld(v), { dt });
  const per = Math.round(SAMPLE / dt);
  const states: SimState[] = [sim.initial];
  sim.run(sim.initial, (v.rows.length - 1) * per, {
    sampleEvery: per,
    onSample: (s) => states.push(s),
  });
  expect(states.every((s) => s.contacts.length === 0)).toBe(true);
  return worst(v, states);
}

/**
 * C4: 1000 N along the instantaneous velocity, Isp 320 s, 0–120 s, then coast. The ship's thrust
 * is fixed in its body frame, so the harness acts as a perfect attitude controller: before each
 * powered step it points the ship along the velocity and gives it the velocity direction's turn
 * rate (v × g / |v|²; prograde thrust does not turn the velocity). Mass is the stated mass law
 * at the middle of the step (2A handoff, request to 2B).
 */
function burn(v: Vector, dt: number) {
  const b = v.header.burn!;
  const mdot = b.thrust_N / (b.Isp_s * b.g0_mps2);
  const m0 = v.rows[0]![5]!;
  const massAt = (t: number) =>
    m0 - mdot * Math.min(Math.max(t - b.start_s, 0), b.stop_s - b.start_s);
  const mu = v.header.mu_m3_s2;
  const sim = createSimulation(earthWorld(v), { dt });
  const per = Math.round(SAMPLE / dt);
  const burnSteps = Math.round((b.stop_s - b.start_s) / dt);
  expect(b.start_s).toBe(0);
  const states: SimState[] = [sim.initial];
  let s = sim.initial;
  for (let k = 0; k < (v.rows.length - 1) * per; k++) {
    let input: SimInput | undefined;
    if (k < burnSteps) {
      const kin = s.world.ship.kinematics;
      const { position: p, velocity: vel } = kin;
      const g = accelerationFrom(mu, 2, 0, 0, p.x, p.y);
      const turn = (vel.x * g.y - vel.y * g.x) / (vel.x * vel.x + vel.y * vel.y);
      s = {
        ...s,
        world: {
          ...s.world,
          ship: {
            ...s.world.ship,
            kinematics: {
              ...kin,
              attitude: quat.fromYaw(Math.atan2(vel.y, vel.x)),
              angularVelocity: { x: 0, y: 0, z: turn },
            },
          },
        },
      };
      input = {
        actuators: {
          thrusts: [
            {
              source: 'engine',
              point: { x: 0, y: 0, z: 0 },
              force: { x: b.thrust_N, y: 0, z: 0 },
            },
          ],
          torque: { x: 0, y: 0, z: 0 },
          massProperties: point(massAt((k + 0.5) * dt)),
        },
      };
    }
    s = sim.step(s, input).state;
    if ((k + 1) % per === 0) states.push(s);
  }
  // The harness's mass law is the stated one (a check of the harness, not of the simulation:
  // propellant is ship systems' job).
  for (const r of v.rows) expect(Math.abs(massAt(r[0]!) - r[5]!)).toBeLessThanOrEqual(MASS_TOL);
  return worst(v, states);
}

const cases = {
  c1: parse(c1),
  c2: parse(c2),
  c3: parse(c3),
  c4: parse(c4),
};

describe('GMAT R2026a reference trajectories (Newtonian, point-mass Earth)', () => {
  it('uses exactly the stated GM', () => {
    for (const v of Object.values(cases)) expect(v.header.mu_m3_s2).toBe(398_600_441_500_000);
  });

  it.each([
    ['C1 circular, 3 periods', cases.c1, 0.0125],
    ['C2 eccentric e≈0.6, 3 periods', cases.c2, 0.00625],
    ['C3 hyperbolic flyby', cases.c3, 0.025],
  ] as const)('%s (dt %s s) within 0.05 m and 5e-5 m/s at every sample', (_n, v, dt) => {
    const e = coast(v, dt);
    expect(e.position).toBeLessThanOrEqual(POSITION_TOL);
    expect(e.velocity).toBeLessThanOrEqual(VELOCITY_TOL);
  });

  it('C4 finite prograde burn and coast (dt 0.025 s) within 0.05 m and 5e-5 m/s', () => {
    const e = burn(cases.c4, 0.025);
    expect(e.position).toBeLessThanOrEqual(POSITION_TOL);
    expect(e.velocity).toBeLessThanOrEqual(VELOCITY_TOL);
  });

  it('converges toward GMAT at second order, with no offset (C1 coast, C4 burn)', () => {
    const ratio = (a: { position: number }, b: { position: number }) => a.position / b.position;
    const c1Ratio = ratio(coast(cases.c1, 0.1), coast(cases.c1, 0.05));
    const c4Ratio = ratio(burn(cases.c4, 0.1), burn(cases.c4, 0.05));
    expect(c1Ratio).toBeGreaterThan(3.5);
    expect(c1Ratio).toBeLessThan(4.5);
    expect(c4Ratio).toBeGreaterThan(3.5);
    expect(c4Ratio).toBeLessThan(4.5);
  });
});

// ---------------------------------------------------------------------------------------------
// Inclined cases C5–C7 (2G): the same Earth and bounds on orbits out of the equatorial plane
// ---------------------------------------------------------------------------------------------

interface Vector3 {
  header: {
    case: string;
    mu_m3_s2: number;
    burn: null | {
      thrust_N: number;
      Isp_s: number;
      g0_mps2: number;
      start_s: number;
      stop_s: number;
      direction_unit_EarthMJ2000Eq: number[];
    };
  };
  /** t, x, y, z, vx, vy, vz, mass */
  rows: number[][];
}

function parse3(csv: string): Vector3 {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  const header = JSON.parse(lines[0]!.replace(/^# /, '')) as Vector3['header'];
  expect(lines[1]).toBe('t_s,x_m,y_m,z_m,vx_mps,vy_mps,vz_mps,mass_kg');
  const rows = lines.slice(2).map((l) => l.split(',').map(Number));
  // Missing or altered vectors must fail explicitly (1D).
  expect(rows.length).toBeGreaterThan(100);
  rows.forEach((r, i) => {
    expect(r).toHaveLength(8);
    expect(r[0]).toBe(i * SAMPLE);
  });
  return { header, rows };
}

/** The first row's state about a fixed point-mass Earth, in the vectors' own axes. */
function earthWorld3(v: Vector3, attitude: Quat = quat.IDENTITY): TruthWorld {
  const r = v.rows[0]!;
  return {
    t: 0,
    law: { exponent: 2, referenceRadius: 1e6 }, // Newtonian: r0 drops out
    bodies: [
      {
        id: 'earth',
        name: 'Earth',
        gm: v.header.mu_m3_s2,
        radius: 6_378_136.3,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        fixed: true,
      },
    ],
    asteroids: [],
    ship: {
      kinematics: {
        position: { x: r[1]!, y: r[2]!, z: r[3]! },
        velocity: { x: r[4]!, y: r[5]!, z: r[6]! },
        attitude,
        angularVelocity: { x: 0, y: 0, z: 0 },
      },
      systems: systemsWith(point(r[7]!)),
    },
    fields: [],
    hidden: {},
  };
}

/** Worst position and velocity error over every sample, as three-component norms. */
function worst3(v: Vector3, states: SimState[]): { position: number; velocity: number } {
  expect(states).toHaveLength(v.rows.length);
  let position = 0;
  let velocity = 0;
  v.rows.forEach((r, i) => {
    const k = states[i]!.world.ship.kinematics;
    expect(states[i]!.world.t).toBe(r[0]);
    position = Math.max(
      position,
      Math.hypot(k.position.x - r[1]!, k.position.y - r[2]!, k.position.z - r[3]!),
    );
    velocity = Math.max(
      velocity,
      Math.hypot(k.velocity.x - r[4]!, k.velocity.y - r[5]!, k.velocity.z - r[6]!),
    );
  });
  return { position, velocity };
}

function coast3(v: Vector3, dt: number) {
  const sim = createSimulation(earthWorld3(v), { dt });
  const per = Math.round(SAMPLE / dt);
  const states: SimState[] = [sim.initial];
  sim.run(sim.initial, (v.rows.length - 1) * per, {
    sampleEvery: per,
    onSample: (s) => states.push(s),
  });
  expect(states.every((s) => s.contacts.length === 0)).toBe(true);
  return worst3(v, states);
}

/**
 * C6: 2000 N along the constant inertial unit vector û = (3, −2, 6)/7, Isp 300 s, 0–200 s, then
 * coast (docs/verification/gmat.md § C6 thrust law). The ship's engine is fixed in its body, so
 * the ship holds one attitude, body +x along û, with no rotation: the thrust acts through the
 * centre of mass, so there is no torque and the simulation leaves the attitude alone. Thrust,
 * Isp, direction and cutoff come from the vector's header, and the mass is the stated law at
 * the middle of each step, as in C4's harness.
 */
function burn3(v: Vector3, dt: number) {
  const b = v.header.burn!;
  const [ux, uy, uz] = b.direction_unit_EarthMJ2000Eq as [number, number, number];
  expect(Math.hypot(ux, uy, uz)).toBeCloseTo(1, 15);
  const attitude = quat.pointAlong(quat.IDENTITY, { x: ux, y: uy, z: uz });
  const nose = quat.axisX(attitude);
  expect(Math.hypot(nose.x - ux, nose.y - uy, nose.z - uz)).toBeLessThan(1e-15);
  const mdot = b.thrust_N / (b.Isp_s * b.g0_mps2);
  const m0 = v.rows[0]![7]!;
  const massAt = (t: number) =>
    m0 - mdot * Math.min(Math.max(t - b.start_s, 0), b.stop_s - b.start_s);
  const sim = createSimulation(earthWorld3(v, attitude), { dt });
  const per = Math.round(SAMPLE / dt);
  const burnSteps = Math.round((b.stop_s - b.start_s) / dt);
  expect(b.start_s).toBe(0);
  const states: SimState[] = [sim.initial];
  const r = sim.run(sim.initial, (v.rows.length - 1) * per, {
    sampleEvery: per,
    onSample: (s) => states.push(s),
    input: (tick) =>
      tick < burnSteps
        ? {
            actuators: {
              thrusts: [
                {
                  source: 'engine',
                  point: { x: 0, y: 0, z: 0 },
                  force: { x: b.thrust_N, y: 0, z: 0 },
                },
              ],
              torque: { x: 0, y: 0, z: 0 },
              massProperties: point(massAt((tick + 0.5) * dt)),
            },
          }
        : undefined,
  });
  // The attitude never moved: the thrust direction was û for the whole burn.
  expect(r.state.world.ship.kinematics.attitude).toEqual(attitude);
  expect(r.state.world.ship.kinematics.angularVelocity).toEqual({ x: 0, y: 0, z: 0 });
  // The harness's mass law is the stated one (a check of the harness, not of the simulation:
  // propellant is ship systems' job).
  for (const row of v.rows)
    expect(Math.abs(massAt(row[0]!) - row[7]!)).toBeLessThanOrEqual(MASS_TOL);
  return worst3(v, states);
}

const inclined = {
  c5: parse3(c5),
  c6: parse3(c6),
  c7: parse3(c7),
};

/** Print a case's worst errors (shown by `npx vitest run src/sim --silent=false`). */
function report(name: string, dt: number, e: { position: number; velocity: number }): void {
  console.log(
    `${name} at dt = ${dt} s: worst position ${e.position.toExponential(2)} m, ` +
      `worst velocity ${e.velocity.toExponential(2)} m/s`,
  );
}

describe('GMAT R2026a inclined reference trajectories (three-dimensional)', () => {
  it('uses exactly the stated GM, and every axis carries the motion', () => {
    for (const v of Object.values(inclined)) {
      expect(v.header.mu_m3_s2).toBe(398_600_441_500_000);
      // Not a planar case in disguise: x, y and z all move by thousands of kilometres.
      for (const column of [1, 2, 3]) {
        const values = v.rows.map((r) => r[column]!);
        expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(1e6);
      }
    }
  });

  it.each([
    ['C5 inclined eccentric e=0.35, 3 periods', inclined.c5, 0.025],
    ['C7 inclined retrograde hyperbolic flyby', inclined.c7, 0.025],
  ] as const)(
    '%s (dt %s s) within 0.05 m and 5e-5 m/s at every sample',
    { timeout: 60_000 },
    (name, v, dt) => {
      const e = coast3(v, dt);
      report(name, dt, e);
      expect(e.position).toBeLessThanOrEqual(POSITION_TOL);
      expect(e.velocity).toBeLessThanOrEqual(VELOCITY_TOL);
    },
  );

  it('C6 burn along a fixed inertial direction, then coast (dt 0.0125 s) within 0.05 m and 5e-5 m/s', () => {
    const e = burn3(inclined.c6, 0.0125);
    report('C6 inclined burn', 0.0125, e);
    expect(e.position).toBeLessThanOrEqual(POSITION_TOL);
    expect(e.velocity).toBeLessThanOrEqual(VELOCITY_TOL);
  });

  it('converges toward GMAT at second order, with no offset (C5 coast, C6 burn)', () => {
    const ratio = (a: { position: number }, b: { position: number }) => a.position / b.position;
    const c5Ratio = ratio(coast3(inclined.c5, 0.2), coast3(inclined.c5, 0.1));
    const c6Ratio = ratio(burn3(inclined.c6, 0.4), burn3(inclined.c6, 0.2));
    expect(c5Ratio).toBeGreaterThan(3.5);
    expect(c5Ratio).toBeLessThan(4.5);
    expect(c6Ratio).toBeGreaterThan(3.5);
    expect(c6Ratio).toBeLessThan(4.5);
  });
});
