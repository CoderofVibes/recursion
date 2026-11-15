/**
 * The ship as a rigid body in three dimensions: torque about every axis from thrust off the
 * centre of mass, inertia whose principal axes are not the body axes, the invariants of
 * torque-free motion over long runs, and the exact reduction to the planar scheme.
 *
 * Reference values for the attitude itself come from tests/vectors/physics-3d.json
 * (vectors3d.test.ts). Here the expected values are closed forms written out in each test.
 */

import { describe, expect, it } from 'vitest';
import type { Inertia } from '../contracts/ship.ts';
import * as quat from '../lib/quat.ts';
import type { Quat } from '../lib/quat.ts';
import type { Vec3 } from '../lib/vec3.ts';
import * as inv from './invariants.ts';
import { createSimulation } from './simulation.ts';
import { actuators, attitudeAngle, makeWorld, massProps, thrust } from './test-helpers.ts';

const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** I⁻¹·v in the body frame, through the principal frame. */
function inverseInertia(inertia: Inertia, v: Vec3): Vec3 {
  const p = quat.rotateInverse(inertia.axes, v);
  return quat.rotate(inertia.axes, {
    x: p.x / inertia.moments.x,
    y: p.y / inertia.moments.y,
    z: p.z / inertia.moments.z,
  });
}

/** A slender ship: roll moment far below pitch and yaw, all three different. */
const TRIAXIAL: Vec3 = { x: 3.0e4, y: 1.6e5, z: 2.0e5 };
/** Symmetric about the long (roll) axis. */
const AXISYMMETRIC: Vec3 = { x: 3.0e4, y: 1.6e5, z: 1.6e5 };
/** Principal frame turned from the body frame about a skew axis. */
const TILT: Quat = quat.normalize({ w: 0.95, x: 0.2, y: 0.1, z: -0.15 });
const START: Quat = quat.normalize({ w: 0.9, x: 0.1, y: -0.3, z: 0.2 });

describe('torque about every axis', () => {
  const mp = massProps({ inertia: { moments: TRIAXIAL, axes: quat.IDENTITY } });

  it.each([
    [
      'roll (+x): a lift force out on the port side',
      { x: 0, y: 1.5, z: 0 },
      { x: 0, y: 0, z: 200 },
    ],
    [
      'pitch (+y): an engine above the centre of mass',
      { x: 0, y: 0, z: 0.8 },
      { x: 300, y: 0, z: 0 },
    ],
    ['yaw (+z): a side force at the nose', { x: 5, y: 0, z: 0 }, { x: 0, y: 150, z: 0 }],
    [
      'negative roll: a side force above the centre of mass',
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 80, z: 0 },
    ],
  ] as const)('%s: ω = I⁻¹ (p − c) × F · t, exactly', (_name, point, force) => {
    const sim = createSimulation(makeWorld({ mp }), { dt: 0.5 });
    const act = actuators([thrust(point, force)], mp);
    const r = sim.run(sim.initial, 8, { input: () => ({ actuators: act }) });
    const torque = cross(point, force);
    // Exactly one component: torque about a principal axis from rest stays about that axis.
    expect([torque.x, torque.y, torque.z].filter((c) => c !== 0)).toHaveLength(1);
    const t = 4;
    const w = r.state.world.ship.kinematics.angularVelocity;
    expect(w.x).toBeCloseTo((torque.x / TRIAXIAL.x) * t, 14);
    expect(w.y).toBeCloseTo((torque.y / TRIAXIAL.y) * t, 14);
    expect(w.z).toBeCloseTo((torque.z / TRIAXIAL.z) * t, 14);
    // Constant angular acceleration about a fixed axis: angle ½αt², integrated exactly.
    const alpha = inverseInertia(mp.inertia, torque);
    const expected = quat.fromRotationVector({
      x: 0.5 * alpha.x * t * t,
      y: 0.5 * alpha.y * t * t,
      z: 0.5 * alpha.z * t * t,
    });
    expect(attitudeAngle(r.state.world.ship.kinematics.attitude, expected)).toBeLessThan(1e-13);
  });

  it('a centre of mass off the engine line in three dimensions: τ = (p − c) × F', () => {
    const off = massProps({
      centerOfMass: { x: 0.2, y: -0.1, z: 0.3 },
      inertia: { moments: TRIAXIAL, axes: quat.IDENTITY },
    });
    const dt = 0.01;
    const sim = createSimulation(makeWorld({ mp: off }), { dt });
    const act = actuators([thrust({ x: -7, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 })], off);
    const r = sim.step(sim.initial, { actuators: act });
    // (−7.2, 0.1, −0.3) × (1000, 0, 0) = (0, −300, −100) N·m.
    const w = r.state.world.ship.kinematics.angularVelocity;
    expect(w.x).toBeCloseTo(0, 12);
    expect(w.y).toBeCloseTo((-300 / TRIAXIAL.y) * dt, 12);
    expect(w.z).toBeCloseTo((-100 / TRIAXIAL.z) * dt, 12);
  });

  it('pure torque about all three axes turns the ship without moving it; couples cancel', () => {
    const sim = createSimulation(makeWorld({ mp }), { dt: 0.01 });
    const wheels = actuators([], mp, { x: 30, y: -80, z: 50 });
    const r = sim.step(sim.initial, { actuators: wheels }).state;
    const w = r.world.ship.kinematics.angularVelocity;
    expect(w.x).toBeCloseTo((30 / TRIAXIAL.x) * 0.01, 12);
    expect(w.y).toBeCloseTo((-80 / TRIAXIAL.y) * 0.01, 12);
    expect(w.z).toBeCloseTo((50 / TRIAXIAL.z) * 0.01, 12);
    expect(r.world.ship.kinematics.position).toEqual({ x: 0, y: 0, z: 0 });
    // Dorsal and ventral jets firing opposite ways along x: a pure pitch couple, no net force.
    const couple = actuators(
      [
        thrust({ x: 3, y: 0, z: 2 }, { x: 100, y: 0, z: 0 }, 'dorsal'),
        thrust({ x: 3, y: 0, z: -2 }, { x: -100, y: 0, z: 0 }, 'ventral'),
      ],
      mp,
    );
    const c = sim.step(sim.initial, { actuators: couple }).state;
    expect(c.world.ship.kinematics.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(c.world.ship.kinematics.angularVelocity.y).toBeCloseTo((400 / TRIAXIAL.y) * 0.01, 12);
    expect(c.world.ship.kinematics.angularVelocity.x).toBe(0);
    expect(c.world.ship.kinematics.angularVelocity.z).toBe(0);
  });

  it('thrust turns with a pitching ship: the analytic spiral in the x–z plane, second order', () => {
    // From rest, pitching at a constant rate ω about body +y (which carries +x toward −z), body
    // force F along +x: v = (F/mω)(sin ωt, 0, cos ωt − 1).
    const iso = massProps();
    const omega = 0.1;
    const F = 1000;
    const T = 50;
    const a = F / iso.mass;
    const exact = {
      x: (a / omega) * ((1 - Math.cos(omega * T)) / omega),
      z: -(a / omega) * (T - Math.sin(omega * T) / omega),
    };
    const err = (dt: number): number => {
      const world = makeWorld({ mp: iso, angularRate: { x: 0, y: omega, z: 0 } });
      const sim = createSimulation(world, { dt });
      const act = actuators([thrust({ x: -7, y: 0 }, { x: F, y: 0 })], iso);
      const k = sim.run(sim.initial, Math.round(T / dt), { input: () => ({ actuators: act }) })
        .state.world.ship.kinematics;
      expect(k.angularVelocity).toEqual({ x: 0, y: omega, z: 0 });
      expect(k.position.y).toBe(0);
      return Math.hypot(k.position.x - exact.x, k.position.z - exact.z);
    };
    const e1 = err(1);
    const e05 = err(0.5);
    expect(e1).toBeLessThan(0.05); // over a 125 m spiral
    expect(e1 / e05).toBeGreaterThan(3.8);
    expect(e1 / e05).toBeLessThan(4.2);
  });

  it('reports specific force on all three body axes, whatever the attitude and spin', () => {
    const world = makeWorld({ mp, attitude: START, angularRate: { x: 0.02, y: -0.03, z: 0.05 } });
    const sim = createSimulation(world, { dt: 1 });
    const act = actuators([thrust({ x: 0, y: 2, z: 1 }, { x: 120, y: -300, z: 75 }, 'rcs')], mp);
    const r = sim.step(sim.initial, { actuators: act });
    expect(r.state.specificForce).toEqual({ x: 120 / mp.mass, y: -300 / mp.mass, z: 75 / mp.mass });
    expect(sim.step(r.state).state.specificForce).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('inertia whose principal axes are not the body axes', () => {
  const inertia: Inertia = { moments: TRIAXIAL, axes: TILT };
  const mp = massProps({ inertia });

  it('a torque about body z turns the ship about all three body axes: ω = J⁻¹τ·t', () => {
    const dt = 0.001; // short: the gyroscopic term grows as t³ and is far below the check
    const sim = createSimulation(makeWorld({ mp }), { dt });
    const r = sim.step(sim.initial, { actuators: actuators([], mp, 400) });
    const expected = inverseInertia(inertia, { x: 0, y: 0, z: 400 });
    const w = r.state.world.ship.kinematics.angularVelocity;
    expect(Math.abs(expected.x * dt)).toBeGreaterThan(1e-7); // genuinely off-axis
    expect(Math.abs(expected.y * dt)).toBeGreaterThan(1e-7);
    expect(w.x).toBeCloseTo(expected.x * dt, 14);
    expect(w.y).toBeCloseTo(expected.y * dt, 14);
    expect(w.z).toBeCloseTo(expected.z * dt, 14);
  });

  it('is the same motion as the body with aligned axes, re-expressed in the tilted frame', () => {
    // Body B is body A with its body frame turned by TILT⁻¹: q_B = q_A ⊗ conj(TILT) and
    // ω_B = R(TILT)·ω_A describe the same physical rotation.
    const rateA: Vec3 = { x: 0.03, y: -0.02, z: 0.035 };
    const worldA = makeWorld({
      mp: massProps({ inertia: { moments: TRIAXIAL, axes: quat.IDENTITY } }),
      attitude: START,
      angularRate: rateA,
    });
    const worldB = makeWorld({
      mp,
      attitude: quat.multiply(START, quat.conjugate(TILT)),
      angularRate: quat.rotate(TILT, rateA),
    });
    const a = createSimulation(worldA, { dt: 1 });
    const b = createSimulation(worldB, { dt: 1 });
    const kA = a.run(a.initial, 500).state.world.ship.kinematics;
    const kB = b.run(b.initial, 500).state.world.ship.kinematics;
    expect(
      attitudeAngle(kB.attitude, quat.multiply(kA.attitude, quat.conjugate(TILT))),
    ).toBeLessThan(1e-12);
    expect(len(sub(kB.angularVelocity, quat.rotate(TILT, kA.angularVelocity)))).toBeLessThan(1e-14);
  });

  it('spin about a principal axis that is not a body axis is steady', () => {
    // About the axis of greatest moment (stable): ω stays put and the attitude turns about it.
    const rate = 0.04;
    const axis = quat.rotate(TILT, { x: 0, y: 0, z: 1 });
    const omega = { x: axis.x * rate, y: axis.y * rate, z: axis.z * rate };
    const sim = createSimulation(makeWorld({ mp, attitude: START, angularRate: omega }), { dt: 1 });
    const k = sim.run(sim.initial, 1000).state.world.ship.kinematics;
    expect(len(sub(k.angularVelocity, omega))).toBeLessThan(1e-15);
    const expected = quat.multiply(START, quat.fromAxisAngle(axis, rate * 1000));
    expect(attitudeAngle(k.attitude, expected)).toBeLessThan(1e-12);
  });
});

describe('torque-free invariants over long runs', () => {
  /** Largest errors over a run: energy (relative, by quarter), L (relative, vector), |q| − 1. */
  function drift(inertia: Inertia, omega: Vec3, dt: number, steps: number) {
    const world = makeWorld({ mp: massProps({ inertia }), attitude: START, angularRate: omega });
    const sim = createSimulation(world, { dt });
    const e0 = inv.shipRotationalEnergy(world);
    const l0 = inv.shipSpinAngularMomentum(world);
    const energy = [0, 0, 0, 0];
    let momentum = 0;
    let norm = 0;
    sim.run(sim.initial, steps, {
      sampleEvery: 97,
      onSample: (s) => {
        const quarter = Math.min(3, Math.floor((s.tick - 1) / (steps / 4)));
        energy[quarter] = Math.max(
          energy[quarter]!,
          Math.abs(inv.shipRotationalEnergy(s.world) / e0 - 1),
        );
        momentum = Math.max(momentum, len(sub(inv.shipSpinAngularMomentum(s.world), l0)) / len(l0));
        norm = Math.max(norm, Math.abs(quat.norm(s.world.ship.kinematics.attitude) - 1));
      },
    });
    return { energy, momentum, norm };
  }

  /** |ω| = 0.0502 rad/s, about no axis in particular. */
  const OMEGA: Vec3 = { x: 0.03, y: -0.02, z: 0.035 };
  const STEPS = 400_000;

  it.each([
    ['triaxial, principal axes = body axes', TRIAXIAL, quat.IDENTITY, 6e-6],
    ['triaxial, tilted principal axes', TRIAXIAL, TILT, 4e-6],
    ['axisymmetric, principal axes = body axes', AXISYMMETRIC, quat.IDENTITY, 3e-5],
    ['axisymmetric, tilted principal axes', AXISYMMETRIC, TILT, 4.5e-5],
  ] as const)(
    '%s at 0.05 rad/s, dt = 1 s: L and |q| to rounding, energy error bounded',
    { timeout: 30_000 },
    (_name, moments, axes, energyBound) => {
      const d = drift({ moments, axes }, OMEGA, 1, STEPS);
      // The inertial angular-momentum vector and the quaternion's length: rounding only.
      expect(d.momentum).toBeLessThan(2e-12);
      expect(d.norm).toBeLessThan(2e-12);
      // Energy: an O(dt²) oscillation, the same size in every quarter of the run (no drift).
      expect(Math.max(...d.energy)).toBeLessThan(energyBound);
      expect(d.energy[3]!).toBeLessThan(1.05 * d.energy[0]!);
      expect(d.energy[3]!).toBeGreaterThan(0.95 * d.energy[0]!);
    },
  );

  it('the energy error falls 4× per halving of the step, and stays rounding-level in L', () => {
    const inertia = { moments: TRIAXIAL, axes: TILT };
    const e1 = drift(inertia, OMEGA, 1, 20_000);
    const e05 = drift(inertia, OMEGA, 0.5, 40_000);
    const e025 = drift(inertia, OMEGA, 0.25, 80_000);
    const worst = (d: { energy: number[] }) => Math.max(...d.energy);
    expect(worst(e1) / worst(e05)).toBeGreaterThan(3.8);
    expect(worst(e1) / worst(e05)).toBeLessThan(4.2);
    expect(worst(e05) / worst(e025)).toBeGreaterThan(3.8);
    expect(worst(e05) / worst(e025)).toBeLessThan(4.2);
    expect(e025.momentum).toBeLessThan(2e-12);
  });

  it('a slow tumble (0.005 rad/s) holds its energy a hundred times better', () => {
    const slow = { x: 0.003, y: -0.002, z: 0.0035 };
    const d = drift({ moments: TRIAXIAL, axes: quat.IDENTITY }, slow, 1, 100_000);
    expect(Math.max(...d.energy)).toBeLessThan(6e-8);
    expect(d.momentum).toBeLessThan(2e-12);
  });
});

describe('reduction to the planar scheme', () => {
  it('turning about a principal z axis is θ += dt·ω with the planar kicks, bit for bit in ω', () => {
    // Moments all different and the principal x–y axes turned about z: still a planar body.
    const inertia: Inertia = { moments: TRIAXIAL, axes: quat.fromYaw(0.4) };
    const mp = massProps({ inertia });
    const dt = 0.5;
    const torque = 37;
    const sim = createSimulation(makeWorld({ mp, attitude: 0.3, angularRate: 0.011 }), { dt });
    const act = actuators([], mp, torque);
    // The planar scheme this replaces (2A): ω += ½dt·α; θ += dt·ω; ω += ½dt·α.
    const alpha = torque / TRIAXIAL.z;
    let theta = 0.3;
    let omega = 0.011;
    let s = sim.initial;
    for (let i = 0; i < 2000; i++) {
      s = sim.step(s, { actuators: act }).state;
      omega += 0.5 * dt * alpha;
      theta += dt * omega;
      omega += 0.5 * dt * alpha;
      const k = s.world.ship.kinematics;
      expect(k.angularVelocity).toEqual({ x: 0, y: 0, z: omega }); // the same number
      expect(k.attitude.x).toBe(0);
      expect(k.attitude.y).toBe(0);
    }
    const q = s.world.ship.kinematics.attitude;
    expect(attitudeAngle(q, quat.fromYaw(theta))).toBeLessThan(1e-12);
    expect(Math.abs(quat.norm(q) - 1)).toBeLessThan(1e-14);
  });

  it('a torque-free yaw spin keeps its rate exactly and its attitude a rotation about z', () => {
    const mp = massProps({ inertia: { moments: TRIAXIAL, axes: quat.IDENTITY } });
    const sim = createSimulation(makeWorld({ mp, angularRate: 0.0123 }), { dt: 1 });
    const k = sim.run(sim.initial, 100_000).state.world.ship.kinematics;
    expect(k.angularVelocity).toEqual({ x: 0, y: 0, z: 0.0123 });
    expect(k.attitude.x).toBe(0);
    expect(k.attitude.y).toBe(0);
    // 1230 rad turned; the angle is right to rounding (mod 2π).
    expect(attitudeAngle(k.attitude, quat.fromYaw(0.0123 * 100_000))).toBeLessThan(1e-11);
  });

  it('a ship that is not turning keeps exactly the attitude it was given', () => {
    const mp = massProps({ inertia: { moments: TRIAXIAL, axes: TILT } });
    const sim = createSimulation(makeWorld({ mp, attitude: START }), { dt: 1 });
    const act = actuators([thrust({ x: 0, y: 0, z: 0 }, { x: 500, y: 0, z: 0 })], mp);
    const k = sim.run(sim.initial, 1000, { input: () => ({ actuators: act }) }).state.world.ship
      .kinematics;
    expect(k.attitude).toEqual(START);
    expect(k.angularVelocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('renormalises a quaternion that is not unit length, and only then', () => {
    const sim = createSimulation(
      makeWorld({ attitude: { w: 2, x: 0, y: 0, z: 2 }, angularRate: { x: 0.01, y: 0, z: 0 } }),
      { dt: 1 },
    );
    const q = sim.step(sim.initial).state.world.ship.kinematics.attitude;
    expect(Math.abs(quat.norm(q) - 1)).toBeLessThan(1e-15);
    // The same attitude (a quarter turn about z), then one step of roll.
    const expected = quat.multiply(
      quat.fromYaw(Math.PI / 2),
      quat.fromAxisAngle({ x: 1, y: 0, z: 0 }, 0.01),
    );
    expect(attitudeAngle(q, expected)).toBeLessThan(1e-14);
    expect(() =>
      createSimulation(makeWorld({ attitude: { w: 0, x: 0, y: 0, z: 0 } }), { dt: 1 }),
    ).toThrow(/attitude quaternion is zero/);
  });

  it('rejects a non-positive principal moment', () => {
    const sim = createSimulation(makeWorld(), { dt: 1 });
    const bad = actuators(
      [],
      massProps({ inertia: { moments: { x: 1, y: 0, z: 1 }, axes: quat.IDENTITY } }),
    );
    expect(() => sim.step(sim.initial, { actuators: bad })).toThrow(/mass properties/);
  });
});
