/**
 * The Gravity range as authored: the world at arrival, what the briefing tells the ship, the
 * mismatch the encounter is built on, the ring about Beta, the slingshot that leaves the binary,
 * and flights through the game loop.
 */

import { describe, expect, it } from 'vitest';
import type { TruthWorld } from '../../contracts/truth/index.ts';
import { burnDuration, burnSteps } from '../../game/belief/maneuver.ts';
import { createBlackBox } from '../../game/belief/blackbox.ts';
import { createStandInModel } from '../../game/belief/standin-model.ts';
import { departStatus } from '../../game/objectives.ts';
import { createGameSession } from '../../game/session.ts';
import { hashState } from '../../lib/hash.ts';
import { axisX } from '../../lib/quat.ts';
import { add, cross, distance, length, scale, sub, type Vec3 } from '../../lib/vec3.ts';
import { createSimulation, validateWorld, type SimState } from '../../sim/index.ts';
import {
  ALPHA,
  ALPHA_FIELD,
  BELT,
  BETA,
  DEPART,
  LAW,
  SEPARATION,
  createGravityRange,
} from './index.ts';

const setup = createGravityRange();
const world = setup.definition.world;
const HOUR = 3600;

const relative = (w: TruthWorld) => {
  const alpha = w.bodies[0]!;
  const k = w.ship.kinematics;
  return {
    r: distance(k.position, alpha.position),
    v: length(sub(k.velocity, alpha.velocity)),
  };
};

/** The state with the ship's velocity changed by `dv` (an instantaneous burn). */
const kicked = (state: SimState, dv: Vec3): SimState => {
  const ship = state.world.ship;
  return {
    ...state,
    world: {
      ...state.world,
      ship: {
        ...ship,
        kinematics: { ...ship.kinematics, velocity: add(ship.kinematics.velocity, dv) },
      },
    },
  };
};

/**
 * Coast the true world (no ship systems) after an instantaneous prograde speed change at
 * arrival; returns the lowest distance from Alpha and when, sampled every 30 s.
 */
function coast(start: TruthWorld, deltaV: number, seconds: number) {
  const sim = createSimulation(start, { dt: 1 });
  const nose = axisX(start.ship.kinematics.attitude);
  let lowest = Infinity;
  let highest = 0;
  let when = 0;
  let asteroids = start.asteroids.length;
  const result = sim.run(kicked(sim.initial, scale(nose, deltaV)), seconds, {
    sampleEvery: 30,
    onSample: (s: SimState) => {
      const { r } = relative(s.world);
      if (r < lowest) {
        lowest = r;
        when = s.world.t;
      }
      highest = Math.max(highest, r);
      asteroids = s.world.asteroids.length;
    },
  });
  return { lowest, highest, when, asteroids, result };
}

interface Flight {
  /** Closest approach to Beta's centre, m, and when, s. */
  readonly pass: number;
  readonly passAt: number;
  /** +1 if the ship went round Beta the way Beta goes round Alpha (and the ring turns). */
  readonly sense: number;
  /** Height above the binary's plane at closest approach, m. */
  readonly passHeight: number;
  /** Speed relative to the pair's centre of mass on crossing `DEPART.beyond`, or undefined. */
  readonly exitSpeed?: number;
  readonly exitAt?: number;
  /** The first hull impact, if any. */
  readonly impact?: { readonly with: string; readonly speed: number; readonly t: number };
}

/**
 * Fly the true world (no ship systems): an instantaneous burn of `dv` along the ship's motion
 * about Alpha at time `at`, optionally a second one straight up out of the binary's plane, then
 * coast until the ship leaves, hits something or `seconds` pass.
 */
function fly(
  start: TruthWorld,
  plan: { dv: number; at: number; hop?: { at: number; up: number } },
  seconds: number,
): Flight {
  const sim = createSimulation(start, { dt: 1 });
  let pass = Infinity;
  let passAt = 0;
  let sense = 0;
  let passHeight = 0;
  let exitSpeed: number | undefined;
  let exitAt: number | undefined;
  let impact: Flight['impact'];
  const watch = (s: SimState): void => {
    const beta = s.world.bodies[1]!;
    const k = s.world.ship.kinematics;
    const offset = sub(k.position, beta.position);
    const d = length(offset);
    if (d < pass) {
      pass = d;
      passAt = s.world.t;
      sense = Math.sign(cross(offset, sub(k.velocity, beta.velocity)).z);
      passHeight = k.position.z;
    }
    if (exitSpeed === undefined) {
      const status = departStatus(s.world);
      if (status.distance > DEPART.beyond) {
        exitSpeed = status.speed;
        exitAt = s.world.t;
      }
    }
  };
  const leg = (state: SimState, until: number): SimState => {
    const steps = Math.round(until - state.world.t);
    if (steps <= 0 || impact || exitSpeed !== undefined) return state;
    const result = sim.run(state, steps, { sampleEvery: 20, onSample: watch, stopOnImpact: true });
    const hit = result.events.find((e) => e.kind === 'impact');
    if (hit && hit.kind === 'impact')
      impact = { with: hit.with, speed: hit.relativeSpeed, t: hit.t };
    return result.state;
  };
  let state = leg(sim.initial, plan.at);
  const alpha = state.world.bodies[0]!;
  const k = state.world.ship.kinematics;
  const along = sub(k.velocity, alpha.velocity);
  state = kicked(state, scale(along, plan.dv / length(along)));
  if (plan.hop) {
    state = leg(state, plan.hop.at);
    state = kicked(state, { x: 0, y: 0, z: plan.hop.up });
  }
  // In legs of an hour, so the flight stops soon after the ship has left.
  for (let t = state.world.t + HOUR; t <= seconds && !impact && exitSpeed === undefined; t += HOUR)
    state = leg(state, t);
  return {
    pass,
    passAt,
    sense,
    passHeight,
    ...(exitSpeed !== undefined && exitAt !== undefined ? { exitSpeed, exitAt } : {}),
    ...(impact ? { impact } : {}),
  };
}

const withoutRocks = (w: TruthWorld): TruthWorld => ({ ...w, asteroids: [] });
const ring = (w: TruthWorld) => w.asteroids.filter((a) => a.id.startsWith('b-'));
const field = (w: TruthWorld) => w.asteroids.filter((a) => a.id.startsWith('a-'));

describe('Gravity range: the world at arrival', () => {
  it('is a valid world at the P16 scale under the inverse-2.5 law', () => {
    expect(validateWorld(world)).toEqual([]);
    expect(world.law).toEqual({ exponent: 2.5, referenceRadius: 1_000_000 });
    expect(world.bodies.map((b) => [b.id, b.gm, b.radius, b.fixed])).toEqual([
      ['alpha', 1e10, 250_000, false],
      ['beta', 2.5e9, 160_000, false],
    ]);
    const [a, b] = world.bodies;
    expect(distance(b!.position, a!.position)).toBeCloseTo(SEPARATION, 3);
    // 1B §6: the pair turns at 39.528 m/s relative speed, in the x–y plane.
    expect(length(sub(b!.velocity, a!.velocity))).toBeCloseTo(39.52847, 4);
    expect([a!.position.z, a!.velocity.z, b!.position.z, b!.velocity.z]).toEqual([0, 0, 0, 0]);
    // One sun, 12° above that plane.
    expect(world.sun!.irradiance).toBe(600);
    expect(length(world.sun!.direction)).toBeCloseTo(1, 12);
    expect(Math.asin(world.sun!.direction.z)).toBeCloseTo((12 * Math.PI) / 180, 12);
    expect([ALPHA.id, BETA.id]).toEqual(['alpha', 'beta']);
  });

  it('puts the real 1C ship on a circular orbit about Alpha at r0, full tanks', () => {
    expect(setup.definition.ship.id).toBe('recursion-return-vehicle');
    const { r, v } = relative(world);
    expect(r).toBeCloseTo(LAW.referenceRadius, 3);
    expect(v).toBeCloseTo(100, 9);
    // In the binary's plane, nose along its path.
    expect(world.ship.kinematics.position.z).toBe(0);
    expect(world.ship.kinematics.velocity.z).toBe(0);
    const alpha = world.bodies[0]!;
    const along = sub(world.ship.kinematics.velocity, alpha.velocity);
    expect(
      length(sub(axisX(world.ship.kinematics.attitude), scale(along, 1 / length(along)))),
    ).toBeLessThan(1e-12);
    expect(world.ship.systems.tanks['main-propellant']).toBe(6000);
    expect(world.ship.systems.tanks['rcs-left']! + world.ship.systems.tanks['rcs-right']!).toBe(
      300,
    );
    expect(world.ship.systems.massProperties.mass).toBeCloseTo(30374, 0);
    expect(world.ship.systems.equipment['main-engine']!.values.thrustScale).toBe(0.975);
    expect(setup.definition.dt).toBe(1);
  });

  it('is the same world every time, and a different one for another seed', () => {
    expect(hashState(createGravityRange().definition)).toBe(hashState(setup.definition));
    expect(hashState(createGravityRange('other').definition.world.asteroids)).not.toBe(
      hashState(world.asteroids),
    );
  });

  it(
    'has a field about Alpha that lasts, is tilted out of the plane and leaves the arrival orbit clear',
    { timeout: 60_000 },
    () => {
      const rocks = field(world);
      expect(rocks).toHaveLength(ALPHA_FIELD.disc + ALPHA_FIELD.dipping);
      const alpha = world.bodies[0]!;
      for (const a of rocks) {
        expect(a.radius).toBeGreaterThanOrEqual(400);
        expect(a.radius).toBeLessThanOrEqual(3500);
        // Each orbit is tilted by at most 6° about its own line of nodes.
        const offset = sub(a.position, alpha.position);
        const normal = cross(offset, sub(a.velocity, alpha.velocity));
        expect(Math.acos(normal.z / length(normal))).toBeLessThanOrEqual(
          ALPHA_FIELD.maxInclination + 1e-9,
        );
      }
      expect(rocks.some((a) => Math.abs(a.position.z) > 10_000)).toBe(true);
      // Two revolutions at r0 (35 h) with no burn: no impact, none of the field lost to a body,
      // and the orbit stays near r0 (Beta's pull makes it wobble a few percent).
      const { lowest, highest, result } = coast(world, 0, 126_000);
      expect(result.events.filter((e) => e.kind === 'impact')).toEqual([]);
      expect(result.absorbed.filter((e) => e.asteroid.startsWith('a-'))).toEqual([]);
      expect(lowest).toBeGreaterThan(950_000);
      expect(highest).toBeLessThan(1_060_000);
      const closest = Math.min(
        ...result.events
          .filter((e) => e.kind === 'clearance' && e.with.startsWith('a-'))
          .map((e) => (e.kind === 'clearance' ? e.distance : Infinity)),
      );
      expect(closest).toBeGreaterThan(5_000);
    },
  );
});

describe('Gravity range: the ring about Beta (A6)', () => {
  const beta = world.bodies[1]!;

  it('is a thin prograde ring of rocks in the binary plane, where the slingshot goes', () => {
    const rocks = ring(world);
    expect(rocks).toHaveLength(BELT.count);
    for (const rock of rocks) {
      expect(rock.radius).toBeGreaterThanOrEqual(BELT.minRadius);
      expect(rock.radius).toBeLessThanOrEqual(BELT.maxRadius);
      const offset = sub(rock.position, beta.position);
      const flat = Math.hypot(offset.x, offset.y);
      expect(flat).toBeGreaterThan(BELT.inner - 1_000);
      expect(flat).toBeLessThan(BELT.outer + 1_000);
      // A few kilometres thick: about the size of the rocks.
      expect(Math.abs(offset.z)).toBeLessThan(6 * BELT.thickness * BELT.outer);
      // Round Beta the way Beta goes round Alpha (+z angular momentum).
      expect(cross(offset, sub(rock.velocity, beta.velocity)).z).toBeGreaterThan(0);
    }
    const heights = rocks.map((rock) => rock.position.z - beta.position.z);
    const rms = Math.sqrt(heights.reduce((s, z) => s + z * z, 0) / heights.length);
    expect(rms).toBeGreaterThan(2_000);
    expect(rms).toBeLessThan(8_000);
  });

  it('stays bound to Beta for the length of a run', { timeout: 120_000 }, () => {
    // 80 h with the ship parked at Alpha: longer than a slingshot attempt takes.
    const sim = createSimulation(world, { dt: 1 });
    const result = sim.run(sim.initial, 80 * HOUR);
    const end = result.state.world;
    const there = end.bodies[1]!;
    const left = ring(end);
    const near = left.filter((rock) => {
      const d = distance(rock.position, there.position);
      return d > 300_000 && d < 1_500_000;
    });
    const fell = result.absorbed.filter((e) => e.asteroid.startsWith('b-')).length;
    // Alpha's pull makes every orbit breathe, and sheds a few from the outer edge.
    expect(near.length).toBeGreaterThanOrEqual(Math.round(0.97 * BELT.count));
    expect(fell).toBeLessThanOrEqual(Math.round(0.02 * BELT.count));
    // Still a thin ring in the binary's plane.
    const heights = near.map((rock) => rock.position.z - there.position.z);
    const rms = Math.sqrt(heights.reduce((s, z) => s + z * z, 0) / heights.length);
    expect(rms).toBeLessThan(15_000);
  });
});

describe('Gravity range: what the ship is told', () => {
  const briefing = setup.definition.briefing;

  it('uses the believed frame: Alpha at the origin and at rest', () => {
    expect(briefing.id).toBe('gravity-range');
    expect(briefing.knownBodies[0]).toMatchObject({
      id: 'alpha',
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      radius: 250_000,
    });
    expect(briefing.referenceRadius).toBe(LAW.referenceRadius);
    // Truth's frame is barycentric: Alpha sits 800 km from its origin, and moves.
    expect(world.bodies[0]!.position.x).toBeCloseTo(
      (-SEPARATION * BETA.gm) / (ALPHA.gm + BETA.gm),
      3,
    );
    expect(length(world.bodies[0]!.velocity)).toBeGreaterThan(7);
  });

  it('gives an arrival estimate that is honest about its error, in three dimensions', () => {
    const alpha = world.bodies[0]!;
    const k = world.ship.kinematics;
    const e = briefing.arrivalEstimate;
    const dp = distance(e.position, sub(k.position, alpha.position));
    const dv = distance(e.velocity, sub(k.velocity, alpha.velocity));
    // Not the truth, but within four of its own sigmas, and it does not claim to know the
    // height above the plane exactly.
    expect(dp).toBeGreaterThan(0);
    expect(dp).toBeLessThan(4 * Math.sqrt(e.positionCov[0] + e.positionCov[3] + e.positionCov[5]));
    expect(dv).toBeLessThan(4 * Math.sqrt(e.velocityCov[0] + e.velocityCov[3] + e.velocityCov[5]));
    expect(e.position.z).not.toBe(0);
    expect(e.positionCov[5]).toBeGreaterThan(0);
    expect(briefing.arrivalConfiguration).toBe('radiators');
  });

  it('starts the model Newtonian: no exponent, a rough Beta, nominal hardware', () => {
    const prior = (id: string) => briefing.priors.find((p) => p.id === id)!;
    expect(prior('body.alpha.mu')).toMatchObject({ value: 1.02e10, sigma: 3e8 });
    expect(prior('body.beta.mu').sigma / prior('body.beta.mu').value).toBeGreaterThan(0.3);
    expect(prior('thruster.main-engine.scale')).toMatchObject({ value: 1 });
    expect(prior('law.gravity.exponent')).toMatchObject({ value: 2, extension: 'distance-law' });
    // The true values (exponent 2.5, thrust scale 0.975, GM 1e10) are in truth only.
    const values = briefing.priors.map((p) => p.value);
    expect(values).not.toContain(world.law.exponent);
    expect(values).not.toContain(world.hidden['thruster.main-engine.scale']);
    expect(values).not.toContain(world.bodies[0]!.gm);
  });

  it('names the objective and surveys the ring and the larger asteroids', () => {
    expect(briefing.objectives).toEqual([
      {
        id: 'depart',
        kind: 'depart',
        label: 'DEPART 50 M/S',
        depart: { beyond: 9_000_000, minSpeed: 50 },
        maxDeltaV: 16,
      },
    ]);
    expect(setup.objectiveRules).toEqual([
      { kind: 'depart', objective: 'depart', beyond: 9_000_000, minSpeed: 50, maxDeltaV: 16 },
    ]);
    // Every ring rock is big enough to be seen on arrival; Alpha's smallest are not.
    const known = briefing.knownAsteroids;
    expect(known.filter((a) => a.id.startsWith('b-'))).toHaveLength(BELT.count);
    expect(known.length).toBeLessThan(world.asteroids.length);
    for (const a of known) expect(a.radius).toBeGreaterThanOrEqual(1000);
    // Surveyed, not known: each is kilometres from where the rock really is, in 3D.
    const alpha = world.bodies[0]!;
    const errors = known.map((a) => {
      const truth = world.asteroids.find((rock) => rock.id === a.id)!;
      return distance(a.position, sub(truth.position, alpha.position));
    });
    expect(Math.min(...errors)).toBeGreaterThan(0);
    expect(errors.reduce((s, d) => s + d, 0) / errors.length).toBeGreaterThan(4_000);
  });
});

describe('Gravity range: the mismatch the encounter is built on', () => {
  const newtonian: TruthWorld = { ...world, law: { ...world.law, exponent: 2 } };

  it(
    'a 9.85 m/s retrograde burn dives to 500 km; a Newtonian world would stop 180 km short',
    { timeout: 60_000 },
    () => {
      const real = coast(world, -9.85, 40_000);
      const forecast = coast(newtonian, -9.85, 40_000);
      expect(real.lowest / 1e3).toBeGreaterThan(485);
      expect(real.lowest / 1e3).toBeLessThan(505);
      expect(forecast.lowest / 1e3).toBeGreaterThan(665);
      expect(forecast.lowest / 1e3).toBeLessThan(690);
      // And the low point comes later than a Newtonian clock says.
      expect(real.when - forecast.when).toBeGreaterThan(1500);
    },
  );

  it(
    'the burn a Newtonian plan asks for (500 km low point) skims Alpha instead',
    { timeout: 60_000 },
    () => {
      const planned = coast(newtonian, -18.35, 40_000);
      const real = coast(world, -18.35, 40_000);
      expect(planned.lowest / 1e3).toBeGreaterThan(485);
      expect(planned.lowest / 1e3).toBeLessThan(505);
      // Within 60 km of the 250 km surface, but not into it.
      expect(real.lowest / 1e3).toBeLessThan(310);
      expect(real.lowest / 1e3).toBeGreaterThan(260);
      expect(real.result.events.filter((e) => e.kind === 'impact' && e.with === 'alpha')).toEqual(
        [],
      );
    },
  );

  it('a deeper Newtonian plan (300 km low point) hits Alpha', { timeout: 60_000 }, () => {
    const real = coast(world, -32.1, 40_000);
    expect(coast(newtonian, -32.1, 40_000).lowest / 1e3).toBeGreaterThan(290);
    expect(real.result.events.some((e) => e.kind === 'impact' && e.with === 'alpha')).toBe(true);
  });
});

describe('Gravity range: the slingshot past Beta (A6)', () => {
  const clear = withoutRocks(world);
  const BURN_AT = 1.1 * HOUR;

  it(
    '14 m/s along the orbit, 1.1 h after arrival, leaves the binary at over 60 m/s',
    { timeout: 120_000 },
    () => {
      const flight = fly(clear, { dv: 14, at: BURN_AT }, 90 * HOUR);
      expect(flight.impact).toBeUndefined();
      // Past Beta at about 980 km, the way the ring turns, 30 h after arrival, in the plane.
      expect(flight.pass / 1e3).toBeGreaterThan(940);
      expect(flight.pass / 1e3).toBeLessThan(1_020);
      expect(flight.passAt / HOUR).toBeGreaterThan(29.5);
      expect(flight.passAt / HOUR).toBeLessThan(30.7);
      expect(flight.sense).toBe(1);
      expect(flight.passHeight).toBe(0);
      expect(flight.exitSpeed).toBeGreaterThan(62);
      expect(flight.exitSpeed).toBeLessThan(70);
      expect(flight.exitAt! / HOUR).toBeLessThan(68);
    },
  );

  it(
    'the same burn without Beta to swing past does not leave fast enough',
    { timeout: 120_000 },
    () => {
      // Half a turn later the ship leaves Alpha away from Beta: it escapes, slowly.
      const flight = fly(clear, { dv: 14, at: BURN_AT + 8.7 * HOUR }, 140 * HOUR);
      expect(flight.impact).toBeUndefined();
      expect(flight.pass / 1e3).toBeGreaterThan(2_000);
      expect(flight.exitSpeed).toBeGreaterThan(20);
      expect(flight.exitSpeed).toBeLessThan(40);
      expect(flight.exitSpeed).toBeLessThan(DEPART.minSpeed);
    },
  );

  it(
    'is aimed by a fraction of a metre per second: the pass moves about 700 km per m/s',
    { timeout: 120_000 },
    () => {
      const short = fly(clear, { dv: 13.8, at: BURN_AT }, 40 * HOUR);
      const long = fly(clear, { dv: 14.2, at: BURN_AT }, 40 * HOUR);
      const perMps = (long.pass - short.pass) / 0.4;
      expect(perMps / 1e3).toBeGreaterThan(550);
      expect(perMps / 1e3).toBeLessThan(900);
    },
  );

  it(
    'a Newtonian plan for the same pass goes somewhere else entirely',
    { timeout: 120_000 },
    () => {
      const newtonian: TruthWorld = { ...clear, law: { ...clear.law, exponent: 2 } };
      const planned = fly(newtonian, { dv: 14, at: BURN_AT }, 60 * HOUR);
      const real = fly(clear, { dv: 14, at: BURN_AT }, 60 * HOUR);
      // What the model's law says this burn does, against what it does.
      expect(Math.abs(planned.pass - real.pass) / 1e3).toBeGreaterThan(300);
    },
  );
});

describe('Gravity range: through the ring', () => {
  const seeds = ['gravity-range-1', 'ring-2', 'ring-3', 'ring-4', 'ring-5', 'ring-6'];
  const BURN = { dv: 13.8, at: 1.1 * HOUR };
  const lostTo = (flight: Flight): boolean =>
    flight.impact !== undefined && flight.impact.with.startsWith('b-') && flight.impact.speed >= 3;

  it(
    'a pass flown in the plane without looking is usually lost to a rock',
    { timeout: 240_000 },
    () => {
      const flights = seeds.map((seed) =>
        // 36 h: the pass is at 30 h and the ring is behind the ship three hours later.
        fly(createGravityRange(seed).definition.world, BURN, 36 * HOUR),
      );
      const lost = flights.filter(lostTo);
      expect(lost.length).toBeGreaterThanOrEqual(3);
      // With the ring's flow: tens of metres per second, not hundreds.
      for (const flight of lost) {
        expect(flight.impact!.speed).toBeGreaterThan(5);
        expect(flight.impact!.speed).toBeLessThan(60);
      }
    },
  );

  it(
    'the same pass lifted over the ring by 1 m/s, eight hours out, usually gets through',
    { timeout: 240_000 },
    () => {
      const flights = seeds.map((seed) =>
        fly(
          createGravityRange(seed).definition.world,
          { ...BURN, hop: { at: 22.2 * HOUR, up: 1 } },
          36 * HOUR,
        ),
      );
      expect(flights.filter(lostTo).length).toBeLessThanOrEqual(1);
      // Above the ring at the pass.
      const through = flights.filter((flight) => !flight.impact);
      for (const flight of through) expect(flight.passHeight).toBeGreaterThan(15_000);
      // And the lifted pass still leaves fast (flown here without the rocks, to the exit).
      const lifted = fly(
        withoutRocks(world),
        { ...BURN, hop: { at: 22.2 * HOUR, up: 1 } },
        90 * HOUR,
      );
      expect(lifted.exitSpeed).toBeGreaterThan(DEPART.minSpeed + 5);
    },
  );
});

describe('Gravity range: flown through the game loop', () => {
  it(
    'a scouting dive shows the forecast drifting and ending early, with no truth involved',
    { timeout: 180_000 },
    async () => {
      const model = createStandInModel({ referenceRadius: LAW.referenceRadius });
      const blackBox = createBlackBox();
      const session = createGameSession(setup, { model, blackBox, now: () => 'test' });
      /** The believed ship: position in the believed frame; r, v and radial speed about Alpha. */
      const believed = () => {
        const w = model.believedWorld(session.status().t);
        const s = w.ship;
        const a = w.bodies[0]!;
        const offset = sub(s.position, a.position);
        const velocity = sub(s.velocity, a.velocity);
        const r = length(offset);
        return {
          position: s.position,
          r,
          v: length(velocity),
          radial: (offset.x * velocity.x + offset.y * velocity.y + offset.z * velocity.z) / r,
          mass: s.massProperties.mass,
        };
      };
      const dive = () => ({
        name: 'Dive',
        items: burnSteps({
          at: 600,
          duration: burnDuration(session.ship, believed().mass, 9.85),
          attitude: { reference: 'retrograde' as const },
        }),
      });

      // Commit the dive from the Newtonian model and watch where it really goes.
      session.stepTicks(300);
      const forecast = await session.commit(dive());
      const miss = (t: number): number => {
        session.stepTicks(t - session.status().t);
        const sample = forecast.samples.find((s) => s.t >= t)!;
        return distance(sample.position, believed().position);
      };
      // The forecast looks right at first and drifts as the ship leaves the arrival distance:
      // visible from the navigation solution alone.
      expect(miss(3600)).toBeLessThan(6_000);
      expect(miss(14_400)).toBeGreaterThan(10_000);
      while (believed().radial < 0) session.stepTicks(20);
      const lowPoint = { t: session.status().t, ...believed() };
      expect(lowPoint.r / 1e3).toBeGreaterThan(490);
      expect(lowPoint.r / 1e3).toBeLessThan(515);
      // The forecast ended (P10 horizon) before the low point instead of guessing.
      expect(forecast.issuedAt + forecast.horizon).toBeLessThan(lowPoint.t - 3600);

      // Recall. The world resets; what was measured is kept.
      session.recall();
      expect(session.status()).toMatchObject({ attemptIndex: 2, t: 0, phase: 'prepare' });
      expect(blackBox.archive().attempts.map((a) => a.outcome.kind)).toEqual([
        'recalled',
        'in-progress',
      ]);
    },
  );
});
