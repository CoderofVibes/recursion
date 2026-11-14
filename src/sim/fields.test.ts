/**
 * The field hook: fields from the registry add acceleration to particles and modify thrust;
 * the reported specific force is the thrust actually applied.
 */

import { describe, expect, it } from 'vitest';
import {
  createFieldRegistry,
  type FieldFactory,
  type TruthWorld,
} from '../contracts/truth/index.ts';
import { createSimulation } from './simulation.ts';
import { actuators, asteroid, makeWorld, massProps, thrust } from './test-helpers.ts';

const uniformPush: FieldFactory = {
  kind: 'uniform-push',
  create: (spec) => ({
    id: spec.id,
    kind: spec.kind,
    acceleration: () => ({ x: 0.01, y: 0 }),
  }),
};

const thrustHalver: FieldFactory = {
  kind: 'thrust-halver',
  create: (spec) => ({
    id: spec.id,
    kind: spec.kind,
    modifyThrust: (f) => ({ x: f.x / 2, y: f.y / 2 }),
  }),
};

const withFields = (world: TruthWorld, kinds: string[]): TruthWorld => ({
  ...world,
  fields: kinds.map((kind, i) => ({ id: `f-${i}`, kind, params: {} })),
});

describe('field hook', () => {
  const registry = createFieldRegistry([uniformPush, thrustHalver]);

  it('needs a registry when the world has fields', () => {
    expect(() => createSimulation(withFields(makeWorld(), ['uniform-push']), { dt: 1 })).toThrow(
      /registry/,
    );
    expect(() =>
      createSimulation(withFields(makeWorld(), ['unknown']), { dt: 1, registry }),
    ).toThrow(/no field factory/);
  });

  it('field acceleration acts on the ship and asteroids, not as specific force', () => {
    const world = withFields(
      makeWorld({ asteroids: [asteroid('a-01', { x: 0, y: 1e5 }, { x: 0, y: 0 }, 5)] }),
      ['uniform-push'],
    );
    const sim = createSimulation(world, { dt: 1, registry });
    expect(sim.fields.map((f) => f.kind)).toEqual(['uniform-push']);
    const r = sim.run(sim.initial, 100);
    expect(r.state.world.ship.kinematics.position.x).toBeCloseTo(0.5 * 0.01 * 100 * 100, 9);
    expect(r.state.world.asteroids[0]!.position.x).toBeCloseTo(50, 9);
    expect(r.state.specificForce).toEqual({ x: 0, y: 0 }); // fields act like gravity here
  });

  it('modified thrust moves the ship and is what the accelerometer feels', () => {
    const mp = massProps();
    const world = withFields(makeWorld({ mp, attitude: 0.7 }), ['thrust-halver']);
    const sim = createSimulation(world, { dt: 1, registry });
    const act = actuators([thrust({ x: -7, y: 0 }, { x: 2000, y: 0 })], mp);
    const r = sim.run(sim.initial, 10, { input: () => ({ actuators: act }) });
    const k = r.state.world.ship.kinematics;
    const a = 1000 / mp.mass;
    expect(Math.hypot(k.velocity.x, k.velocity.y)).toBeCloseTo(a * 10, 12);
    expect(Math.atan2(k.velocity.y, k.velocity.x)).toBeCloseTo(0.7, 12);
    expect(r.state.specificForce.x).toBeCloseTo(a, 15);
    expect(r.state.specificForce.y).toBeCloseTo(0, 15);
  });
});
