/**
 * Determinism in three dimensions (P2), and exact planarity of planar inputs.
 *
 * The 3D world: a binary on an inclined orbit, asteroids on orbits in other planes, a ship whose
 * inertia has principal axes off its body axes and whose hull is three prisms, burning, turning
 * about all three axes and running into a rock.
 */

import { describe, expect, it } from 'vitest';
import { mockMassProperties, mockShipDefinition } from '../contracts/fixtures/index.ts';
import type { ActuatorOutput, Asteroid, GravityLaw, TruthWorld } from '../contracts/truth/index.ts';
import { hashState } from '../lib/hash.ts';
import * as quat from '../lib/quat.ts';
import { createRng } from '../lib/rng.ts';
import * as v3 from '../lib/vec3.ts';
import { circularBinary, circularSpeed } from './analytic.ts';
import { coupling } from './gravity.ts';
import { createSimulation } from './simulation.ts';
import { asteroid, makeWorld, massProps } from './test-helpers.ts';
import type { ContactDetail, SimInput, SimState } from './types.ts';

const law: GravityLaw = { exponent: 2.5, referenceRadius: 1e6 };

/** A world with nothing in a common plane. */
function world3d(): TruthWorld {
  const { bodies } = circularBinary(
    law,
    { id: 'alpha', name: 'Alpha', gm: 1e10, radius: 250e3 },
    { id: 'beta', name: 'Beta', gm: 2.5e9, radius: 160e3 },
    4e6,
    { normal: { x: 0.3, y: -0.2, z: 0.9 }, phase: 0.7 },
  );
  const primary = bodies[0];
  const k = coupling(primary.gm, law);
  const rng = createRng('determinism-3d').stream('asteroids');
  /** Position and velocity on a circle of radius r about the primary, in a random plane. */
  const onCircle = (r: number) => {
    const normal = v3.normalize({ x: rng.range(-1, 1), y: rng.range(-1, 1), z: rng.range(0.2, 1) });
    const e1 = v3.anyPerpendicular(normal);
    const e2 = v3.cross(normal, e1);
    const phase = rng.range(0, 2 * Math.PI);
    const radial = v3.add(v3.scale(e1, Math.cos(phase)), v3.scale(e2, Math.sin(phase)));
    const along = v3.add(v3.scale(e1, -Math.sin(phase)), v3.scale(e2, Math.cos(phase)));
    return {
      position: v3.addScaled(primary.position, radial, r),
      velocity: v3.addScaled(primary.velocity, along, circularSpeed(k, law.exponent, r)),
    };
  };
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < 12; i++) {
    const state = onCircle(rng.range(500e3, 1500e3));
    asteroids.push({
      id: `a-${String(i + 1).padStart(2, '0')}`,
      ...state,
      radius: rng.range(20, 400),
    });
  }
  const ship = onCircle(1e6);
  // A rock 60 m ahead of the ship, closing at 0.5 m/s: an impact about 95 s in.
  const ahead = v3.normalize(v3.sub(ship.velocity, primary.velocity));
  asteroids.push(
    asteroid(
      'rock',
      v3.addScaled(ship.position, ahead, 60),
      v3.addScaled(ship.velocity, ahead, -0.5),
      6,
    ),
  );
  return makeWorld({
    law,
    bodies: [...bodies],
    asteroids,
    position: ship.position,
    velocity: ship.velocity,
    attitude: quat.normalize({ w: 0.8, x: -0.2, y: 0.4, z: 0.3 }),
    angularRate: { x: 0.004, y: -0.006, z: 0.01 },
    // The mock ship with its radiators out: three prisms, and principal axes off the body axes.
    mp: mockMassProperties(mockShipDefinition, 'radiators-deployed', 900),
  });
}

/**
 * A random plan in three dimensions: main engine, RCS on two axes and wheel torque. It coasts
 * for the first 300 steps, so the ship reaches the rock ahead of it.
 */
function randomPlan3d(world: TruthWorld, seed: string, steps: number): (SimInput | undefined)[] {
  const rng = createRng(seed).stream('plan');
  const mp = world.ship.systems.massProperties;
  const plan: (SimInput | undefined)[] = [];
  let current: SimInput | undefined;
  for (let i = 0; i < steps; i++) {
    if (i >= 300 && rng.chance(0.02)) {
      if (rng.chance(0.4)) {
        current = undefined; // coast
      } else {
        const actuators: ActuatorOutput = {
          thrusts: [
            {
              source: 'main-engine',
              point: { x: -6, y: rng.range(-0.05, 0.05), z: rng.range(-0.05, 0.05) },
              force: { x: 4000 * rng.range(0.2, 1), y: 0, z: 0 },
            },
            {
              source: 'rcs-port',
              point: { x: 5, y: 2, z: 0.5 },
              force: { x: 0, y: rng.range(-50, 50), z: rng.range(-30, 30) },
            },
            {
              source: 'rcs-dorsal',
              point: { x: 2, y: 0, z: 1.8 },
              force: { x: 0, y: 0, z: rng.range(-40, 40) },
            },
          ],
          torque: { x: rng.range(-20, 20), y: rng.range(-20, 20), z: rng.range(-20, 20) },
          massProperties: mp,
        };
        current = { actuators };
      }
    }
    plan.push(current);
  }
  return plan;
}

const STEPS = 4000;
const DT = 0.5;

function runBulk(world: TruthWorld, plan: (SimInput | undefined)[]) {
  const sim = createSimulation(world, { dt: DT });
  return sim.run(sim.initial, plan.length, { input: (tick) => plan[tick] });
}

function runStepped(world: TruthWorld, plan: (SimInput | undefined)[]) {
  const sim = createSimulation(world, { dt: DT });
  let state: SimState = sim.initial;
  const events = [];
  const contacts: ContactDetail[] = [];
  for (const input of plan) {
    const r = sim.step(state, input);
    events.push(...r.events);
    contacts.push(...r.contacts);
    state = r.state;
  }
  return { state, events, contacts };
}

describe('determinism in three dimensions', () => {
  const world = world3d();
  const plan = randomPlan3d(world, 'seed-a', STEPS);

  it('the scene really is three-dimensional, with contact', () => {
    const a = runBulk(world, plan);
    const k = a.state.world.ship.kinematics;
    expect(world.ship.systems.massProperties.hull).toHaveLength(3);
    const { axes } = world.ship.systems.massProperties.inertia;
    expect(Math.hypot(axes.x, axes.y, axes.z)).toBeGreaterThan(1e-3);
    for (const b of a.state.world.bodies) expect(Math.abs(b.velocity.z)).toBeGreaterThan(1);
    expect(Math.abs(k.velocity.z)).toBeGreaterThan(1);
    for (const c of [k.angularVelocity.x, k.angularVelocity.y, k.angularVelocity.z])
      expect(Math.abs(c)).toBeGreaterThan(1e-4);
    for (const c of [k.attitude.w, k.attitude.x, k.attitude.y, k.attitude.z])
      expect(Math.abs(c)).toBeGreaterThan(1e-3);
    expect(Math.abs(quat.norm(k.attitude) - 1)).toBeLessThan(1e-12);
    const impacts = a.events.filter((e) => e.kind === 'impact');
    expect(impacts.length).toBeGreaterThan(0);
    expect(impacts[0]!.kind === 'impact' && impacts[0]!.with).toBe('rock');
    expect(a.contacts.length).toBeGreaterThan(0);
  });

  it('same seed and plan give an identical state hash', () => {
    const a = runBulk(world, plan);
    const b = runBulk(world3d(), randomPlan3d(world, 'seed-a', STEPS));
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(a.events)).toBe(hashState(b.events));
    expect(hashState(a.contacts)).toBe(hashState(b.contacts));
  });

  it('a different plan gives a different hash', () => {
    const a = runBulk(world, plan);
    const c = runBulk(world, randomPlan3d(world, 'seed-b', STEPS));
    expect(hashState(a.state)).not.toBe(hashState(c.state));
  });

  it('stepping one at a time matches bulk propagation bit for bit', () => {
    const a = runBulk(world, plan);
    const s = runStepped(world, plan);
    expect(hashState(s.state)).toBe(hashState(a.state));
    expect(hashState(s.events)).toBe(hashState(a.events));
    expect(hashState(s.contacts)).toBe(hashState(a.contacts));
  });

  it('a saved and restored state continues identically, wherever it is saved', () => {
    const sim = createSimulation(world, { dt: DT });
    const straight = sim.run(sim.initial, STEPS, { input: (tick) => plan[tick] });
    // Saved before, at and after the impact with the rock, and later on.
    const impact = straight.events.find((e) => e.kind === 'impact')!;
    const hit = Math.ceil(impact.t / DT);
    expect(hit).toBeGreaterThan(100);
    expect(hit).toBeLessThan(300);
    for (const at of [100, hit - 1, hit, hit + 1, 437, 2000, 3999]) {
      const first = sim.run(sim.initial, at, { input: (tick) => plan[tick] });
      const saved = JSON.parse(JSON.stringify(first.state)) as SimState;
      expect(hashState(saved)).toBe(hashState(first.state)); // nothing JSON cannot carry
      const resumed = sim.run(saved, STEPS - at, { input: (tick) => plan[tick] });
      expect(resumed.state.world.t).toBe(straight.state.world.t);
      expect(hashState(resumed.state)).toBe(hashState(straight.state));
      expect(hashState([...first.events, ...resumed.events])).toBe(hashState(straight.events));
    }
  });

  it('does not touch its inputs', () => {
    const before = hashState(world);
    runBulk(world, plan);
    runStepped(world, plan.slice(0, 200));
    expect(hashState(world)).toBe(before);
  });
});

describe('planar inputs stay exactly planar', () => {
  /**
   * Everything in the x–y plane, turning about +z only: a moving binary, asteroids, a ship whose
   * three principal moments differ and whose principal x and y axes are turned about z, a
   * planar burn plan with torque about z, a spin, and a rock in the way.
   */
  function planarWorld(): TruthWorld {
    const { bodies } = circularBinary(
      law,
      { id: 'alpha', name: 'Alpha', gm: 1e10, radius: 250e3 },
      { id: 'beta', name: 'Beta', gm: 2.5e9, radius: 160e3 },
      4e6,
      { phase: 2.2 },
    );
    const primary = bodies[0];
    const k = coupling(primary.gm, law);
    const rng = createRng('planarity').stream('asteroids');
    const asteroids: Asteroid[] = [];
    for (let i = 0; i < 6; i++) {
      const r = rng.range(500e3, 1500e3);
      const phase = rng.range(0, 2 * Math.PI);
      const v = circularSpeed(k, law.exponent, r);
      asteroids.push(
        asteroid(
          `a-${i + 1}`,
          {
            x: primary.position.x + r * Math.cos(phase),
            y: primary.position.y + r * Math.sin(phase),
          },
          {
            x: primary.velocity.x - v * Math.sin(phase),
            y: primary.velocity.y + v * Math.cos(phase),
          },
          rng.range(20, 400),
        ),
      );
    }
    const position = { x: primary.position.x - 1e6, y: primary.position.y };
    const velocity = {
      x: primary.velocity.x,
      y: primary.velocity.y - circularSpeed(k, law.exponent, 1e6),
    };
    // A rock 60 m ahead (the ship moves along −y here), closing at 0.5 m/s.
    asteroids.push(
      asteroid(
        'rock',
        { x: position.x + 1.5, y: position.y - 60 },
        { x: velocity.x, y: velocity.y + 0.5 },
        6,
      ),
    );
    return makeWorld({
      law,
      bodies: [...bodies],
      asteroids,
      position,
      velocity,
      attitude: -1.2,
      angularRate: 0.02,
      mp: massProps({
        inertia: { moments: { x: 3.0e4, y: 1.6e5, z: 2.0e5 }, axes: quat.fromYaw(0.3) },
      }),
    });
  }

  function planarPlan(world: TruthWorld, steps: number): (SimInput | undefined)[] {
    const rng = createRng('planarity').stream('plan');
    const mp = world.ship.systems.massProperties;
    const plan: (SimInput | undefined)[] = [];
    let current: SimInput | undefined;
    for (let i = 0; i < steps; i++) {
      // Coast for the first 150 steps, so the ship reaches the rock ahead of it.
      if (i >= 150 && rng.chance(0.02)) {
        current = rng.chance(0.3)
          ? undefined
          : {
              actuators: {
                thrusts: [
                  {
                    source: 'main-engine',
                    point: { x: -6, y: rng.range(-0.05, 0.05), z: 0 },
                    force: { x: 4000 * rng.range(0.2, 1), y: 0, z: 0 },
                  },
                  {
                    source: 'rcs-1',
                    point: { x: 5, y: 2, z: 0 },
                    force: { x: 0, y: rng.range(-50, 50), z: 0 },
                  },
                ],
                torque: { x: 0, y: 0, z: rng.range(-20, 20) },
                massProperties: mp,
              },
            };
      }
      plan.push(current);
    }
    return plan;
  }

  it('z, the quaternion x and y, and the roll and pitch rates are exactly 0 throughout', () => {
    const world = planarWorld();
    const steps = 20_000;
    const plan = planarPlan(world, steps);
    const sim = createSimulation(world, { dt: 1 });
    let samples = 0;
    let turned = 0;
    let burned = 0;
    const r = sim.run(sim.initial, steps, {
      input: (tick) => plan[tick],
      sampleEvery: 7,
      onSample: (s) => {
        samples++;
        const k = s.world.ship.kinematics;
        // toBe(0) is Object.is: exactly +0, not a small number and not −0.
        expect(k.position.z).toBe(0);
        expect(k.velocity.z).toBe(0);
        expect(k.attitude.x).toBe(0);
        expect(k.attitude.y).toBe(0);
        expect(k.angularVelocity.x).toBe(0);
        expect(k.angularVelocity.y).toBe(0);
        expect(s.specificForce.z).toBe(0);
        for (const b of s.world.bodies) {
          expect(b.position.z).toBe(0);
          expect(b.velocity.z).toBe(0);
        }
        for (const a of s.world.asteroids) {
          expect(a.position.z).toBe(0);
          expect(a.velocity.z).toBe(0);
        }
        turned = Math.max(turned, Math.abs(k.angularVelocity.z));
        burned = Math.max(burned, Math.hypot(s.specificForce.x, s.specificForce.y));
      },
    });
    expect(samples).toBeGreaterThan(2000);
    // It was a busy flight: it turned, burned and hit the rock.
    expect(turned).toBeGreaterThan(0.02);
    expect(burned).toBeGreaterThan(0.1);
    const impacts = r.events.filter((e) => e.kind === 'impact');
    expect(impacts.length).toBeGreaterThan(0);
    expect(r.contacts.length).toBeGreaterThan(0);
    for (const c of r.contacts) {
      expect(c.point.z).toBe(0);
      expect(c.normal.z).toBe(0);
    }
    for (const e of impacts) expect(e.kind === 'impact' && e.point.z).toBe(0);
    expect(Math.abs(quat.norm(r.state.world.ship.kinematics.attitude) - 1)).toBeLessThan(1e-12);
  });
});
