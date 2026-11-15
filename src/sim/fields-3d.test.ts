/**
 * The field hook in three dimensions: fields are asked at the real 3D position and velocity,
 * and all three components of what they return are used.
 */

import { describe, expect, it } from 'vitest';
import {
  createFieldRegistry,
  type FieldFactory,
  type TruthWorld,
} from '../contracts/truth/index.ts';
import * as quat from '../lib/quat.ts';
import * as v3 from '../lib/vec3.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { createSimulation } from './simulation.ts';
import { actuators, asteroid, makeWorld, massProps, thrust } from './test-helpers.ts';

const withFields = (world: TruthWorld, kinds: string[]): TruthWorld => ({
  ...world,
  fields: kinds.map((kind, i) => ({ id: `f-${i}`, kind, params: {} })),
});

describe('field hook in three dimensions', () => {
  it('field acceleration along z moves the ship and asteroids out of the plane', () => {
    const lift: FieldFactory = {
      kind: 'lift',
      create: (spec) => ({
        id: spec.id,
        kind: spec.kind,
        acceleration: () => ({ x: 0, y: -0.004, z: 0.01 }),
      }),
    };
    const world = withFields(
      makeWorld({ asteroids: [asteroid('a-01', { x: 0, y: 1e5 }, { x: 0, y: 0 }, 5)] }),
      ['lift'],
    );
    const sim = createSimulation(world, { dt: 1, registry: createFieldRegistry([lift]) });
    const r = sim.run(sim.initial, 100);
    const k = r.state.world.ship.kinematics;
    expect(k.position.z).toBeCloseTo(0.5 * 0.01 * 100 * 100, 9);
    expect(k.position.y).toBeCloseTo(-0.5 * 0.004 * 100 * 100, 9);
    expect(k.velocity.z).toBeCloseTo(1, 12);
    expect(r.state.world.asteroids[0]!.position.z).toBeCloseTo(50, 9);
    expect(r.state.specificForce).toEqual({ x: 0, y: 0, z: 0 }); // fields act like gravity here
  });

  it('a field sees the true position, in all three axes, of whatever it acts on', () => {
    // Pulls toward the plane z = 0: a = −k·z along z. A particle released above it oscillates.
    const k = 1e-4;
    const seen: Vec3[] = [];
    const spring: FieldFactory = {
      kind: 'spring',
      create: (spec) => ({
        id: spec.id,
        kind: spec.kind,
        acceleration: (p) => {
          seen.push(p);
          return { x: 0, y: 0, z: -k * p.z };
        },
      }),
    };
    const world = withFields(makeWorld({ position: { x: 3, y: -4, z: 250 } }), ['spring']);
    const sim = createSimulation(world, { dt: 1, registry: createFieldRegistry([spring]) });
    const quarter = Math.round(Math.PI / 2 / Math.sqrt(k)); // 157 s: a quarter period
    const r = sim.run(sim.initial, quarter);
    expect(seen[0]).toEqual({ x: 3, y: -4, z: 250 });
    const kin = r.state.world.ship.kinematics;
    expect(Math.abs(kin.position.z)).toBeLessThan(1); // at the plane after a quarter period
    expect(kin.velocity.z).toBeCloseTo(-250 * Math.sqrt(k), 3); // moving down at A·ω
    expect(kin.position.x).toBe(3);
    expect(kin.position.y).toBe(-4);
  });

  it('modified thrust in three dimensions moves the ship and is what the accelerometer feels', () => {
    // Reverses the part of the thrust along the line from the well's centre (the Inverse Wells
    // rule, derivation §8, with w = 1) for a well centred below the ship.
    const centre = { x: 0, y: 0, z: -1000 };
    const calls: { position: Vec3; velocity: Vec3 }[] = [];
    const well: FieldFactory = {
      kind: 'well',
      create: (spec) => ({
        id: spec.id,
        kind: spec.kind,
        modifyThrust: (f, p, v) => {
          calls.push({ position: p, velocity: v });
          const e = v3.normalize(v3.sub(p, centre));
          return v3.addScaled(f, e, -2 * v3.dot(f, e));
        },
      }),
    };
    const mp = massProps();
    // Nose pitched up 30° and yawed 40°: the thrust has a part along every axis.
    const attitude = quat.multiply(
      quat.fromYaw(0.7),
      quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, -Math.PI / 6),
    );
    const world = withFields(makeWorld({ mp, attitude }), ['well']);
    const sim = createSimulation(world, { dt: 0.1, registry: createFieldRegistry([well]) });
    const act = actuators([thrust({ x: -7, y: 0 }, { x: 2000, y: 0 })], mp);
    const r = sim.step(sim.initial, { actuators: act });
    expect(calls[0]).toEqual({ position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } });
    // At the origin the line from the centre is +z: the thrust's z part is reversed.
    const nose = quat.axisX(attitude);
    expect(nose.z).toBeCloseTo(0.5, 12);
    const a = 2000 / mp.mass;
    const k = r.state.world.ship.kinematics;
    // (To 10⁻⁶ m/s: the ship moves a millimetre during the step, which turns that line a little.)
    expect(k.velocity.x).toBeCloseTo(a * nose.x * 0.1, 6);
    expect(k.velocity.y).toBeCloseTo(a * nose.y * 0.1, 6);
    expect(k.velocity.z).toBeCloseTo(-a * nose.z * 0.1, 6);
    // The accelerometer reads the applied thrust in the body frame: Rᵀ·(modified force)/m.
    const applied = quat.rotateInverse(attitude, { x: a * nose.x, y: a * nose.y, z: -a * nose.z });
    expect(r.state.specificForce.x).toBeCloseTo(applied.x, 6);
    expect(r.state.specificForce.y).toBeCloseTo(applied.y, 6);
    expect(r.state.specificForce.z).toBeCloseTo(applied.z, 6);
    // The field is not asked when there is no thrust.
    const before = calls.length;
    sim.step(r.state);
    expect(calls.length).toBe(before);
  });
});
