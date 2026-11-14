/**
 * Determinism (P2): the same start state and command plan give a bit-identical result,
 * whether stepped one at a time, run in bulk, or saved and restored part way.
 */

import { describe, expect, it } from 'vitest';
import { mockTruthWorld } from '../contracts/fixtures/truth.ts';
import type { ActuatorOutput, TruthWorld } from '../contracts/truth/index.ts';
import { createRng } from '../lib/rng.ts';
import { hashState } from '../lib/hash.ts';
import { createSimulation } from './simulation.ts';
import { gravityRangeWorld } from './test-helpers.ts';
import type { SimInput, SimState } from './types.ts';

/**
 * A random plan: burns of the main engine and RCS couples at random times, drawn from a
 * seeded stream, as one SimInput per tick.
 */
function randomPlan(world: TruthWorld, seed: string, steps: number): (SimInput | undefined)[] {
  const rng = createRng(seed).stream('plan');
  const mp = world.ship.systems.massProperties;
  const plan: (SimInput | undefined)[] = [];
  let current: SimInput | undefined;
  for (let i = 0; i < steps; i++) {
    if (rng.chance(0.02)) {
      if (rng.chance(0.4)) {
        current = undefined; // coast
      } else {
        const throttle = rng.range(0.2, 1);
        const actuators: ActuatorOutput = {
          thrusts: [
            {
              source: 'main-engine',
              point: { x: -6, y: rng.range(-0.05, 0.05) },
              force: { x: 4000 * throttle, y: 0 },
            },
            { source: 'rcs-1', point: { x: 5, y: 2 }, force: { x: 0, y: rng.range(-50, 50) } },
          ],
          torque: rng.range(-20, 20),
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

function runBulk(world: TruthWorld, dt: number, plan: (SimInput | undefined)[]) {
  const sim = createSimulation(world, { dt });
  return sim.run(sim.initial, plan.length, { input: (tick) => plan[tick] });
}

function runStepped(world: TruthWorld, dt: number, plan: (SimInput | undefined)[]) {
  const sim = createSimulation(world, { dt });
  let state: SimState = sim.initial;
  const events = [];
  for (const input of plan) {
    const r = sim.step(state, input);
    events.push(...r.events);
    state = r.state;
  }
  return { state, events };
}

describe.each([
  ['mock encounter (fixed bodies)', mockTruthWorld, 0.5],
  ['Gravity range scale (moving binary, 25 asteroids)', gravityRangeWorld(25), 1],
] as const)('%s', (_name, world, dt) => {
  const plan = randomPlan(world, 'seed-a', STEPS);

  it('same seed and plan give an identical state hash', () => {
    const a = runBulk(world, dt, plan);
    const b = runBulk(world, dt, randomPlan(world, 'seed-a', STEPS));
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(a.events)).toBe(hashState(b.events));
  });

  it('a different plan gives a different hash', () => {
    const a = runBulk(world, dt, plan);
    const c = runBulk(world, dt, randomPlan(world, 'seed-b', STEPS));
    expect(hashState(a.state)).not.toBe(hashState(c.state));
  });

  it('stepping one at a time matches bulk propagation bit for bit', () => {
    const a = runBulk(world, dt, plan);
    const s = runStepped(world, dt, plan);
    expect(hashState(s.state)).toBe(hashState(a.state));
    expect(hashState(s.events)).toBe(hashState(a.events));
  });

  it('a saved and restored state continues identically', () => {
    const sim = createSimulation(world, { dt });
    const half = STEPS / 2;
    const first = sim.run(sim.initial, half, { input: (tick) => plan[tick] });
    const saved = JSON.parse(JSON.stringify(first.state)) as SimState;
    const resumed = sim.run(saved, half, { input: (tick) => plan[tick] });
    const straight = sim.run(sim.initial, STEPS, { input: (tick) => plan[tick] });
    expect(resumed.state.world.t).toBe(straight.state.world.t);
    expect(hashState(resumed.state)).toBe(hashState(straight.state));
  });

  it('does not touch its inputs', () => {
    const before = hashState(world);
    runBulk(world, dt, plan);
    runStepped(world, dt, plan.slice(0, 200));
    expect(hashState(world)).toBe(before);
  });
});

describe('sunlight survives stepping (A3)', () => {
  it('step and run carry the sun over unchanged', () => {
    expect(mockTruthWorld.sun).toBeDefined();
    const sim = createSimulation(mockTruthWorld, { dt: 1 });
    const stepped = sim.step(sim.initial, undefined).state;
    expect(stepped.world.sun).toEqual(mockTruthWorld.sun);
    const ran = sim.run(sim.initial, 10).state;
    expect(ran.world.sun).toEqual(mockTruthWorld.sun);
  });
});
