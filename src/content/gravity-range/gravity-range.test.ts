/**
 * The Gravity range as authored: the world at arrival, what the briefing tells the ship, the
 * mismatch the encounter is built on, and a scripted flight that completes the objective.
 */

import { describe, expect, it } from 'vitest';
import type { TruthWorld } from '../../contracts/truth/index.ts';
import { burnDuration, burnSteps } from '../../game/belief/maneuver.ts';
import { createBlackBox } from '../../game/belief/blackbox.ts';
import { createStandInModel } from '../../game/belief/standin-model.ts';
import { createGameSession } from '../../game/session.ts';
import { hashState } from '../../lib/hash.ts';
import { createSimulation, validateWorld, type SimState } from '../../sim/index.ts';
import { ALPHA, BAND, BETA, LAW, RESERVE, SEPARATION, createGravityRange } from './index.ts';

const setup = createGravityRange();
const world = setup.definition.world;

const relative = (w: TruthWorld) => {
  const alpha = w.bodies[0]!;
  const k = w.ship.kinematics;
  return {
    r: Math.hypot(k.position.x - alpha.position.x, k.position.y - alpha.position.y),
    v: Math.hypot(k.velocity.x - alpha.velocity.x, k.velocity.y - alpha.velocity.y),
  };
};

/**
 * Coast the true world (no ship systems) after an instantaneous prograde speed change at
 * arrival; returns the lowest distance from Alpha and when, sampled every 30 s.
 */
function coast(start: TruthWorld, deltaV: number, seconds: number) {
  const k = start.ship.kinematics;
  const dir = { x: Math.cos(k.attitude), y: Math.sin(k.attitude) };
  const kicked: TruthWorld = {
    ...start,
    ship: {
      ...start.ship,
      kinematics: {
        ...k,
        velocity: { x: k.velocity.x + dir.x * deltaV, y: k.velocity.y + dir.y * deltaV },
      },
    },
  };
  const sim = createSimulation(kicked, { dt: 1 });
  let lowest = Infinity;
  let highest = 0;
  let when = 0;
  let asteroids = kicked.asteroids.length;
  const result = sim.run(sim.initial, seconds, {
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

describe('Gravity range: the world at arrival', () => {
  it('is a valid world at the P16 scale under the inverse-2.5 law', () => {
    expect(validateWorld(world)).toEqual([]);
    expect(world.law).toEqual({ exponent: 2.5, referenceRadius: 1_000_000 });
    expect(world.bodies.map((b) => [b.id, b.gm, b.radius, b.fixed])).toEqual([
      ['alpha', 1e10, 250_000, false],
      ['beta', 2.5e9, 160_000, false],
    ]);
    const [a, b] = world.bodies;
    expect(Math.hypot(b!.position.x - a!.position.x, b!.position.y - a!.position.y)).toBeCloseTo(
      SEPARATION,
      3,
    );
    // 1B §6: the pair turns at 39.528 m/s relative speed.
    expect(Math.hypot(b!.velocity.x - a!.velocity.x, b!.velocity.y - a!.velocity.y)).toBeCloseTo(
      39.52847,
      4,
    );
    expect(world.sun!.irradiance).toBe(600);
    expect(Math.hypot(world.sun!.direction.x, world.sun!.direction.y)).toBeCloseTo(1, 12);
    expect([ALPHA.id, BETA.id]).toEqual(['alpha', 'beta']);
  });

  it('puts the real 1C ship on a circular orbit about Alpha at r0, full tanks', () => {
    expect(setup.definition.ship.id).toBe('recursion-return-vehicle');
    const { r, v } = relative(world);
    expect(r).toBeCloseTo(LAW.referenceRadius, 3);
    expect(v).toBeCloseTo(100, 9);
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

  it('has an asteroid field that lasts and leaves the arrival orbit clear', () => {
    expect(world.asteroids).toHaveLength(20);
    for (const a of world.asteroids) {
      expect(a.radius).toBeGreaterThanOrEqual(400);
      expect(a.radius).toBeLessThanOrEqual(3500);
    }
    // Two revolutions at r0 (35 h) with no burn: no impact, no asteroid lost to a body, and the
    // orbit stays near r0 (Beta's pull makes it wobble a few percent).
    const { lowest, highest, asteroids, result } = coast(world, 0, 126_000);
    expect(result.events.filter((e) => e.kind === 'impact')).toEqual([]);
    expect(result.absorbed).toEqual([]);
    expect(asteroids).toBe(20);
    expect(lowest).toBeGreaterThan(950_000);
    expect(highest).toBeLessThan(1_060_000);
    const closest = Math.min(
      ...result.events
        .filter((e) => e.kind === 'clearance' && e.with.startsWith('a-'))
        .map((e) => (e.kind === 'clearance' ? e.distance : Infinity)),
    );
    expect(closest).toBeGreaterThan(5_000);
  });
});

describe('Gravity range: what the ship is told', () => {
  const briefing = setup.definition.briefing;

  it('uses the believed frame: Alpha at the origin and at rest', () => {
    expect(briefing.id).toBe('gravity-range');
    expect(briefing.knownBodies[0]).toMatchObject({
      id: 'alpha',
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      radius: 250_000,
    });
    // Truth's frame is barycentric: Alpha sits 800 km from its origin, and moves.
    expect(world.bodies[0]!.position.x).toBeCloseTo(
      (-SEPARATION * BETA.gm) / (ALPHA.gm + BETA.gm),
      3,
    );
    expect(Math.hypot(world.bodies[0]!.velocity.x, world.bodies[0]!.velocity.y)).toBeGreaterThan(7);
  });

  it('gives an arrival estimate that is honest about its error', () => {
    const alpha = world.bodies[0]!;
    const k = world.ship.kinematics;
    const e = briefing.arrivalEstimate;
    const dp = Math.hypot(
      e.position.x - (k.position.x - alpha.position.x),
      e.position.y - (k.position.y - alpha.position.y),
    );
    const dv = Math.hypot(
      e.velocity.x - (k.velocity.x - alpha.velocity.x),
      e.velocity.y - (k.velocity.y - alpha.velocity.y),
    );
    // Not the truth, but within four of its own sigmas.
    expect(dp).toBeGreaterThan(0);
    expect(dp).toBeLessThan(4 * Math.sqrt(e.positionCov[0] + e.positionCov[2]));
    expect(dv).toBeLessThan(4 * Math.sqrt(e.velocityCov[0] + e.velocityCov[2]));
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

  it('names the objective and surveys the larger asteroids', () => {
    expect(briefing.objectives.map((o) => [o.id, o.label])).toEqual([
      ['low-orbit', 'ORBIT 450–550 KM'],
      ['reserve', 'RESERVE 5600 KG'],
    ]);
    expect(briefing.knownAsteroids.length).toBeGreaterThan(5);
    expect(briefing.knownAsteroids.length).toBeLessThan(world.asteroids.length);
    for (const a of briefing.knownAsteroids) expect(a.radius).toBeGreaterThanOrEqual(1000);
    expect(setup.objectiveRules[0]).toMatchObject({
      kind: 'orbit-band',
      inner: BAND.inner,
      outer: BAND.outer,
    });
    expect(setup.objectiveRules[1]).toMatchObject({ kind: 'reserve', minimum: RESERVE.minimum });
  });
});

describe('Gravity range: the mismatch the encounter is built on', () => {
  const newtonian: TruthWorld = { ...world, law: { ...world.law, exponent: 2 } };

  it('a 9.85 m/s retrograde burn reaches the band; a Newtonian world would stop 180 km short', () => {
    const real = coast(world, -9.85, 40_000);
    const forecast = coast(newtonian, -9.85, 40_000);
    expect(real.lowest / 1e3).toBeGreaterThan(485);
    expect(real.lowest / 1e3).toBeLessThan(505);
    expect(forecast.lowest / 1e3).toBeGreaterThan(665);
    expect(forecast.lowest / 1e3).toBeLessThan(690);
    // And the low point comes later than a Newtonian clock says.
    expect(real.when - forecast.when).toBeGreaterThan(1500);
  });

  it('the burn a Newtonian plan asks for (500 km low point) skims Alpha instead', () => {
    const planned = coast(newtonian, -18.35, 40_000);
    const real = coast(world, -18.35, 40_000);
    expect(planned.lowest / 1e3).toBeGreaterThan(485);
    expect(planned.lowest / 1e3).toBeLessThan(505);
    // Below the band, within 60 km of the 250 km surface, but not into it.
    expect(real.lowest / 1e3).toBeLessThan(310);
    expect(real.lowest / 1e3).toBeGreaterThan(260);
    expect(real.result.events.filter((e) => e.kind === 'impact')).toEqual([]);
  });

  it('a deeper Newtonian plan (300 km low point) hits Alpha', () => {
    const real = coast(world, -32.1, 40_000);
    expect(coast(newtonian, -32.1, 40_000).lowest / 1e3).toBeGreaterThan(290);
    expect(real.result.events.some((e) => e.kind === 'impact' && e.with === 'alpha')).toBe(true);
  });
});

describe('Gravity range: flown through the game loop', () => {
  it(
    'a scouting dive, a Recall and a second flight reach and hold the low orbit with the reserve',
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
        const x = s.position.x - a.position.x;
        const y = s.position.y - a.position.y;
        const vx = s.velocity.x - a.velocity.x;
        const vy = s.velocity.y - a.velocity.y;
        const r = Math.hypot(x, y);
        return {
          position: s.position,
          r,
          v: Math.hypot(vx, vy),
          radial: (x * vx + y * vy) / r,
          mass: s.massProperties.mass,
        };
      };
      const dive = () => ({
        name: 'Dive',
        items: burnSteps({
          at: 400,
          duration: burnDuration(session.ship, believed().mass, 9.85),
          attitude: { reference: 'retrograde' as const },
        }),
      });

      // Attempt 1: commit the dive from the Newtonian model and watch where it really goes.
      session.stepTicks(300);
      const forecast = await session.commit(dive());
      session.stepTicks(700);
      const achieved = (100 - believed().v) / 9.85;
      const miss = (t: number): number => {
        session.stepTicks(t - session.status().t);
        const sample = forecast.samples.find((s) => s.t >= t)!;
        const now = believed().position;
        return Math.hypot(sample.position.x - now.x, sample.position.y - now.y);
      };
      // The forecast looks right at first and drifts as the ship leaves the arrival distance:
      // visible from the navigation solution alone, with no truth involved.
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

      // Attempt 2: the same dive, then a burn at the measured low point to the circular speed
      // the inverse-2.5 law gives there, scaled by what the engine actually delivered.
      session.stepTicks(300);
      await session.commit(dive());
      session.stepTicks(lowPoint.t - 1000 - session.status().t);
      const circular = Math.sqrt((ALPHA.gm * Math.sqrt(LAW.referenceRadius)) / lowPoint.r ** 1.5);
      const duration = burnDuration(
        session.ship,
        believed().mass,
        (lowPoint.v - circular) / achieved,
      );
      await session.commit({
        name: 'Circularise',
        items: burnSteps({
          at: lowPoint.t - duration / 2 - session.status().t,
          duration,
          attitude: { reference: 'retrograde' },
        }),
      });
      session.stepTicks(40_000);

      const status = session.status();
      expect(status.outcome).toMatchObject({ kind: 'completed', objective: 'low-orbit' });
      expect(status.phase).toBe('ended');
      const record = blackBox.attempt('attempt-0002')!;
      expect(record.outcome).toEqual(status.outcome);
      expect(
        record.events.filter((e) => e.kind === 'objective').map((e) => [e.objective, e.status]),
      ).toEqual([
        ['low-orbit', 'reached'],
        ['reserve', 'reached'],
      ]);
      expect(record.events.some((e) => e.kind === 'contact')).toBe(false);

      // About 22 m/s of main propellant and one tenth of the RCS load for two turns.
      const tanks = session.truth().sim.world.ship.systems.tanks;
      expect(tanks['main-propellant']).toBeGreaterThan(5_750);
      expect(tanks['main-propellant']).toBeLessThan(5_820);
      expect(tanks['rcs-left']! + tanks['rcs-right']!).toBeGreaterThan(265);
      // Under 12 hours of ship time, on fuel cells alone, with Black Box well within memory.
      expect(status.t).toBeLessThan(43_200);
      expect(tanks['fuel-cell-hydrogen']).toBeGreaterThan(3.5);
      expect(record.measurements.length).toBeLessThan(50_000);
      expect(blackBox.archive().attempts.map((a) => a.outcome.kind)).toEqual([
        'recalled',
        'completed',
      ]);
    },
  );
});
