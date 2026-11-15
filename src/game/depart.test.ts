/**
 * The `depart` rule after A18 (3) on the real Gravity range: learning at Alpha is free, the
 * exit is judged on the way out, and only a real slingshot round Beta counts. Flights run on
 * the simulation alone (bodies and ship, no rocks, no ship systems), with impulses applied as
 * instantaneous velocity changes, as S8's study does. Also `reach-region`, for 3B and 3C.
 */

import { describe, expect, it } from 'vitest';
import type { TruthWorld } from '../contracts/truth/index.ts';
import { createGravityRange, DEPART } from '../content/gravity-range/index.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { createSimulation, type SimState } from '../sim/index.ts';
import type { ObjectiveRule } from './encounter.ts';
import { innerNeck, jacobiConstant } from './jacobi.ts';
import {
  evaluateObjectives,
  initialObjectiveProgress,
  type ObjectiveProgress,
} from './objectives.ts';

const setup = createGravityRange();
const arrival = setup.definition.world;
const rules = setup.objectiveRules;

/** The arrival world with only the bodies and the ship, its kinematics as given. */
function bare(position?: Vec3, velocity?: Vec3): TruthWorld {
  const k = arrival.ship.kinematics;
  return {
    ...arrival,
    asteroids: [],
    ship: {
      ...arrival.ship,
      kinematics: { ...k, position: position ?? k.position, velocity: velocity ?? k.velocity },
    },
  };
}

/** A velocity change along the ship's velocity relative to Alpha, m/s (negative: retrograde). */
function alongAlpha(world: TruthWorld, dv: number): Vec3 {
  const a = world.bodies[0]!.velocity;
  const v = world.ship.kinematics.velocity;
  const rel = { x: v.x - a.x, y: v.y - a.y, z: v.z - a.z };
  const s = Math.hypot(rel.x, rel.y, rel.z);
  return { x: (dv * rel.x) / s, y: (dv * rel.y) / s, z: (dv * rel.z) / s };
}

interface Impulse {
  readonly t: number;
  /** Inertial velocity change, or a speed change along the velocity relative to Alpha. */
  readonly dv: Vec3 | number;
}

/**
 * Fly impulses from `world` for up to `seconds`, judging the objectives every `every` s with the
 * Δv of each impulse charged to the tick it falls in. Stops when the attempt completes or the
 * ship hits a body.
 */
function fly(
  world: TruthWorld,
  impulses: readonly Impulse[],
  seconds: number,
  objectiveRules: readonly ObjectiveRule[] = rules,
  every = 30,
) {
  const sim = createSimulation(world, { dt: 1 });
  let state: SimState = sim.initial;
  let progress: ObjectiveProgress = initialObjectiveProgress;
  const events = [];
  const pending = [...impulses].sort((a, b) => a.t - b.t);
  let hit = false;
  while (state.world.t < seconds && !progress.completed && !hit) {
    let spent = 0;
    while (pending.length > 0 && pending[0]!.t <= state.world.t) {
      const impulse = pending.shift()!;
      const k = state.world.ship.kinematics;
      const dv = typeof impulse.dv === 'number' ? alongAlpha(state.world, impulse.dv) : impulse.dv;
      spent += Math.hypot(dv.x, dv.y, dv.z);
      state = {
        ...state,
        world: {
          ...state.world,
          ship: {
            ...state.world.ship,
            kinematics: {
              ...k,
              velocity: { x: k.velocity.x + dv.x, y: k.velocity.y + dv.y, z: k.velocity.z + dv.z },
            },
          },
        },
      };
    }
    const next = pending[0]?.t ?? Infinity;
    const steps = Math.max(1, Math.min(every, next - state.world.t, seconds - state.world.t));
    const run = sim.run(state, steps, { stopOnImpact: true });
    state = run.state;
    hit = run.events.some((e) => e.kind === 'impact');
    const judged = evaluateObjectives(objectiveRules, progress, state.world, spent);
    progress = judged.progress;
    events.push(...judged.events);
  }
  return { state, progress, events, hit };
}

const HOUR = 3600;

describe('the neck between Alpha and Beta (S8)', () => {
  it('matches S8: C at arrival and at L1', () => {
    // S8 objective.json: arrival 5,826.649268; L1 5,468.317194 (C = −2(E − ω·L)).
    expect(jacobiConstant(arrival)).toBeCloseTo(5826.649268, 3);
    expect(innerNeck(arrival)).toBeCloseTo(5468.317194, 3);
  });

  it('a coast keeps C; a retrograde dive raises it, a prograde departure burn drops it below L1', () => {
    const coast = fly(bare(), [], 6 * HOUR);
    expect(jacobiConstant(coast.state.world)).toBeCloseTo(jacobiConstant(arrival)!, 4);
    const neck = innerNeck(arrival)!;
    const k = arrival.ship.kinematics;
    const dive = alongAlpha(arrival, -9.85);
    const out = alongAlpha(arrival, 14);
    const add = (v: Vec3) => ({
      x: k.velocity.x + v.x,
      y: k.velocity.y + v.y,
      z: k.velocity.z + v.z,
    });
    expect(jacobiConstant(bare(undefined, add(dive)))).toBeGreaterThan(jacobiConstant(arrival)!);
    expect(jacobiConstant(bare(undefined, add(out)))).toBeLessThan(neck);
  });
});

describe('depart after A18 (3)', () => {
  // S8's representative slingshot: 14 m/s prograde at 3,960 s (1.1 h).
  const SLINGSHOT: Impulse = { t: 3_960, dv: 14 };

  it(
    'the representative slingshot is reached; Beta gave it far more than the threshold',
    { timeout: 60_000 },
    () => {
      const run = fly(bare(), [SLINGSHOT], 100 * HOUR);
      expect(run.hit).toBe(false);
      expect(run.progress.completed).toBe('depart');
      const beta = run.progress.assists?.beta;
      expect(beta?.closest).toBeGreaterThan(900e3);
      expect(beta?.closest).toBeLessThan(1_060e3);
      // S8 measured 2,615 m²/s² inside 2,000 km for this route.
      expect(beta?.best).toBeGreaterThan(2_400);
      expect(beta?.best).toBeLessThan(2_800);
      expect(beta!.best!).toBeGreaterThan(DEPART.assist.minGain);
      // An impulse lands in one tick and ends below the neck, so all of it counts. (A real
      // burn takes about 18 s, and its first 2 m/s or so, still inside Alpha's lobe, are free.)
      expect(run.progress.deltaV).toBeCloseTo(14, 9);
      expect(run.progress.counted).toBeCloseTo(14, 9);
    },
  );

  it('a hard direct burn with no Beta pass is missed for speed, or for want of an assist', () => {
    // S8's strongest plain control: 16 m/s prograde at 46,200 s leaves at 38.9 m/s, never
    // within 3,000 km of Beta.
    const run = fly(bare(), [{ t: 46_200, dv: 16 }], 120 * HOUR);
    expect(run.progress.completed).toBeUndefined();
    expect(run.progress.missed).toEqual(['depart']);
    expect(run.progress.why?.depart).toBe('speed');
    expect(run.progress.assists?.beta?.best).toBeUndefined();
    expect(run.progress.assists?.beta?.closest).toBeGreaterThan(2_900e3);
  });

  it('S8’s counterexample: already outside and fast, with nothing spent, is not a slingshot', () => {
    // objective.json `unrestricted_arrival_counterexample`: [9,000,001, 0, 0] m, [51, 0, 0] m/s.
    const world = bare({ x: 9_000_001, y: 0, z: 0 }, { x: 51, y: 0, z: 0 });
    const judged = evaluateObjectives(rules, initialObjectiveProgress, world, 0);
    expect(judged.events).toEqual([
      { kind: 'objective', t: 0, objective: 'depart', status: 'missed' },
    ]);
    expect(judged.progress.why?.depart).toBe('assist');
  });

  it('is judged on the way out only: crossing inward is not a departure', () => {
    const rule: ObjectiveRule[] = [
      { kind: 'depart', objective: 'depart', beyond: 9e6, minSpeed: 50 },
    ];
    // Starting out there moving inward: judged at once, missed as inward.
    const inward = evaluateObjectives(
      rule,
      initialObjectiveProgress,
      bare({ x: 9.5e6, y: 0, z: 0 }, { x: -60, y: 0, z: 0 }),
    );
    expect(inward.progress.why?.depart).toBe('inward');
    // From inside, crossing outward fast enough: reached.
    let progress = evaluateObjectives(
      rule,
      initialObjectiveProgress,
      bare({ x: 8.99e6, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }),
    ).progress;
    const out = evaluateObjectives(rule, progress, {
      ...bare({ x: 9.01e6, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }),
      t: 300,
    });
    expect(out.events).toEqual([
      { kind: 'objective', t: 300, objective: 'depart', status: 'reached' },
    ]);
    progress = out.progress;
    expect(progress.completed).toBe('depart');
  });

  it('learning at Alpha is free: a dive and its recovery count only when learning is not free', () => {
    const strict: ObjectiveRule[] = [
      { kind: 'depart', objective: 'depart', beyond: 9e6, minSpeed: 50, maxDeltaV: 16 },
    ];
    const free: ObjectiveRule[] = [{ ...strict[0]!, learningFree: true } as ObjectiveRule];
    // A dive and its recovery: 3 m/s retrograde, then 3 m/s prograde about half an orbit
    // later. Neither lets the ship leave Alpha's lobe.
    const impulses: Impulse[] = [
      { t: 600, dv: -3 },
      { t: 600 + 31_000, dv: 3 },
    ];
    const strictRun = fly(bare(), impulses, 12 * HOUR, strict);
    const freeRun = fly(bare(), impulses, 12 * HOUR, free);
    expect(strictRun.progress.deltaV).toBeCloseTo(6, 9);
    expect(freeRun.progress.deltaV).toBeCloseTo(6, 9);
    expect(freeRun.progress.counted ?? 0).toBe(0);
    // A 9.85 m/s dive to 500 km is free too.
    const dive = fly(bare(), [{ t: 600, dv: -9.85 }], 10 * HOUR);
    expect(dive.hit).toBe(false);
    expect(dive.progress.deltaV).toBeCloseTo(9.85, 9);
    expect(dive.progress.counted ?? 0).toBe(0);
  });
});

describe('reach-region (3B, 3C)', () => {
  const world = (position: Vec3, velocity: Vec3 = { x: 0, y: 0, z: 0 }, t = 100): TruthWorld => ({
    ...bare(position, velocity),
    t,
  });
  const beta = arrival.bodies[1]!;

  it('an inertial sphere is reached when the centre of mass is inside it, and completes the attempt', () => {
    const rule: ObjectiveRule[] = [
      { kind: 'reach-region', objective: 'exit', center: { x: 1e6, y: 0, z: 0 }, radius: 5e3 },
    ];
    const outside = evaluateObjectives(
      rule,
      initialObjectiveProgress,
      world({ x: 1e6 + 6e3, y: 0, z: 0 }),
    );
    expect(outside.events).toEqual([]);
    const inside = evaluateObjectives(rule, outside.progress, world({ x: 1e6, y: 4e3, z: 0 }));
    expect(inside.events).toEqual([
      { kind: 'objective', t: 100, objective: 'exit', status: 'reached' },
    ]);
    expect(inside.progress.completed).toBe('exit');
  });

  it('a sphere carried with a body, two exits: the first reached completes and is named', () => {
    const rules: ObjectiveRule[] = [
      {
        kind: 'reach-region',
        objective: 'forward',
        center: { body: 'beta', offset: { x: 0, y: 0, z: 400e3 } },
        radius: 20e3,
      },
      { kind: 'reach-region', objective: 'cross', center: { x: 0, y: 0, z: 0 }, radius: 20e3 },
    ];
    const near = {
      x: beta.position.x,
      y: beta.position.y,
      z: beta.position.z + 410e3,
    };
    const judged = evaluateObjectives(rules, initialObjectiveProgress, world(near, beta.velocity));
    expect(judged.progress.completed).toBe('forward');
    expect(judged.events).toEqual([
      { kind: 'objective', t: 100, objective: 'forward', status: 'reached' },
    ]);
  });

  it('honours a speed limit relative to the centre, and misses once when its window closes', () => {
    const rule: ObjectiveRule[] = [
      {
        kind: 'reach-region',
        objective: 'exit',
        center: { x: 0, y: 0, z: 0 },
        radius: 5e3,
        maxSpeed: 2,
        window: { from: 0, to: 500 },
      },
    ];
    const fast = evaluateObjectives(
      rule,
      initialObjectiveProgress,
      world({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }),
    );
    expect(fast.progress.completed).toBeUndefined();
    const late = evaluateObjectives(
      rule,
      fast.progress,
      world({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 600),
    );
    expect(late.events).toEqual([
      { kind: 'objective', t: 600, objective: 'exit', status: 'missed' },
    ]);
    const again = evaluateObjectives(
      rule,
      late.progress,
      world({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 700),
    );
    expect(again.events).toEqual([]);
  });
});
