/**
 * Flight in three dimensions through the whole loop (A11): the real simulation, the real ship
 * and the navigator. Hands-on flying is believed and drawn; the navigator follows the ship out
 * of the plane; recurrence still restores the world exactly. Truth is used only to judge.
 */

import { describe, expect, it } from 'vitest';
import { covEllipsoid, HANDS_ON_NEUTRAL, type HandsOnInput } from '../contracts/index.ts';
import { briefing } from '../content/gravity-range/briefing.ts';
import { createGravityRange, LAW, SEED } from '../content/gravity-range/index.ts';
import { hashState } from '../lib/hash.ts';
import { quat, v3 } from '../lib/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { createStandInModel } from './belief/standin-model.ts';
import type { EncounterSetup } from './encounter.ts';
import { createGameSession, type GameSession } from './session.ts';

const range = createGravityRange();

function start(setup: EncounterSetup = range) {
  const model = createStandInModel({ referenceRadius: LAW.referenceRadius });
  const blackBox = createBlackBox();
  const session = createGameSession(setup, { model, blackBox, now: () => 'test' });
  return { session, model, blackBox };
}

/** Lets a forecast the navigator has already worked out be issued and recorded. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The ship relative to Alpha, true and believed, with the believed one-sigma sizes. */
function compare(session: GameSession) {
  const world = session.truth().sim.world;
  const alpha = world.bodies[0]!;
  const believed = session.snapshot().world;
  const origin = believed.bodies[0]!;
  return {
    truePosition: v3.sub(world.ship.kinematics.position, alpha.position),
    trueVelocity: v3.sub(world.ship.kinematics.velocity, alpha.velocity),
    position: v3.sub(believed.ship.position, origin.position),
    velocity: v3.sub(believed.ship.velocity, origin.velocity),
    positionCov: believed.ship.positionCov,
    /** Largest one-sigma axis of the position and velocity uncertainty. */
    positionSigma: covEllipsoid(believed.ship.positionCov).radii[0],
    velocitySigma: covEllipsoid(believed.ship.velocityCov).radii[0],
    attitudeError: quat.angleBetween(believed.ship.attitude, world.ship.kinematics.attitude),
    nose: quat.axisX(world.ship.kinematics.attitude),
  };
}

/** The thrust the snapshot draws, by source, rounded to the newton. */
const drawn = (session: GameSession): [string, number][] =>
  session
    .snapshot()
    .ship.thrust.map((tick): [string, number] => [tick.source, Math.round(tick.magnitude)]);

const pitchUp: HandsOnInput = { ...HANDS_ON_NEUTRAL, pitch: 1 };
const fullThrottle: HandsOnInput = { ...HANDS_ON_NEUTRAL, throttle: 1 };

describe('hands-on flying, believed and drawn (2D request 1)', () => {
  it('a burn flown by hand: drawn while held, followed by the believed velocity, gone after', () => {
    const { session } = start();
    session.stepTicks(300);
    // Pitch the nose up for two minutes: only the jets that start the turn are drawn.
    session.fly(pitchUp);
    session.stepTicks(1);
    const turning = drawn(session);
    expect(turning.length).toBeGreaterThan(0);
    for (const [source] of turning) expect(source).toMatch(/^rcs-/);
    // The believed attitude turns with the stick from the start, not a recorder period (20 s)
    // late: 11 s in, before the next gyro reading, it is off only by the ship's spin-up (the
    // nose has risen 0.07 rad; measured 0.017 rad apart).
    session.stepTicks(10);
    expect(compare(session).nose.z).toBeGreaterThan(0.05);
    expect(compare(session).attitudeError).toBeLessThan(0.03);
    session.stepTicks(109);
    expect(compare(session).attitudeError).toBeLessThan(1e-3);
    expect(compare(session).nose.z).toBeGreaterThan(0.75);

    // Full throttle for 12 s.
    session.fly(fullThrottle);
    const before = compare(session);
    session.stepTicks(1);
    const burning = session.snapshot().ship.thrust;
    expect(burning).toEqual([
      {
        source: 'main-engine',
        point: { x: -7, y: 0.08, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        magnitude: 24_000,
      },
    ]);
    session.stepTicks(11);
    session.fly(HANDS_ON_NEUTRAL);
    session.stepTicks(1);
    expect(session.snapshot().ship.thrust).toEqual([]);

    const after = compare(session);
    const trueChange = v3.sub(after.trueVelocity, before.trueVelocity);
    const believedChange = v3.sub(after.velocity, before.velocity);
    // About 9.3 m/s, most of it out of the plane.
    expect(v3.length(trueChange)).toBeGreaterThan(9);
    expect(trueChange.z).toBeGreaterThan(7);
    // The navigator saw the burn: its change of velocity is the true one to within 5%, and the
    // believed velocity is within twice its stated one-sigma of the truth (measured: 0.25 m/s
    // apart on 9.25 m/s, 0.44 m/s against 0.48 m/s).
    expect(v3.distance(believedChange, trueChange)).toBeLessThan(0.05 * v3.length(trueChange));
    expect(v3.distance(after.velocity, after.trueVelocity)).toBeLessThan(2 * after.velocitySigma);
  });

  it('an RCS translation by hand: drawn on every jet that pushes, followed by the navigator', () => {
    const { session } = start();
    session.stepTicks(200);
    const before = compare(session);
    session.fly({ ...HANDS_ON_NEUTRAL, translate: { x: 0, y: 0, z: 1 } });
    session.stepTicks(1);
    // The four pods' downward nozzles, pushing the ship up (+z in the body), at the forces the
    // design's allocator gives: the forward pair throttled to balance about the centre of mass.
    const thrust = session.snapshot().ship.thrust;
    expect(thrust.map((tick) => tick.source).sort()).toEqual([
      'rcs-aft-left',
      'rcs-aft-right',
      'rcs-forward-left',
      'rcs-forward-right',
    ]);
    for (const tick of thrust) expect(tick.direction).toEqual({ x: 0, y: 0, z: 1 });
    const total = thrust.reduce((sum, tick) => sum + tick.magnitude, 0);
    expect(total).toBeGreaterThan(740);
    expect(total).toBeLessThan(760);
    session.stepTicks(59);
    session.fly(HANDS_ON_NEUTRAL);
    session.stepTicks(1);
    expect(session.snapshot().ship.thrust).toEqual([]);
    const after = compare(session);
    // A level ship pushed up: the true change is along +z, about 1.5 m/s in a minute.
    const trueRise = after.trueVelocity.z - before.trueVelocity.z;
    const believedRise = after.velocity.z - before.velocity.z;
    expect(trueRise).toBeGreaterThan(1.4);
    expect(trueRise).toBeLessThan(1.6);
    expect(Math.abs(believedRise - trueRise)).toBeLessThan(0.05 * trueRise);
    expect(v3.distance(after.velocity, after.trueVelocity)).toBeLessThan(2 * after.velocitySigma);
  });

  it('pitch up, burn, release: one coasting forecast, frozen, that leaves the plane', async () => {
    const { session, blackBox } = start();
    session.stepTicks(300);
    session.fly(pitchUp);
    session.stepTicks(120);
    session.fly(fullThrottle);
    session.stepTicks(12);
    expect(session.snapshot().forecasts).toEqual([]);
    session.fly(HANDS_ON_NEUTRAL);
    session.fly(HANDS_ON_NEUTRAL);
    session.stepTicks(1);
    await settle();
    const issued = session.snapshot().forecasts;
    expect(issued).toHaveLength(1);
    const forecast = issued[0]!;
    expect(Object.isFrozen(forecast)).toBe(true);
    expect(Object.isFrozen(forecast.samples[0]!.positionCov)).toBe(true);
    expect(forecast).toMatchObject({ issuedAt: 432, inputs: { plan: { epoch: 432, items: [] } } });
    // The coast carries the ship tens of kilometres out of the plane, with a real height doubt.
    const last = forecast.samples.at(-1)!;
    expect(last.position.z).toBeGreaterThan(10_000);
    expect(last.positionCov[5]).toBeGreaterThan(0);
    expect(blackBox.attempt('attempt-0001')!.forecasts).toEqual([forecast]);
    // Time runs on and nothing else is issued; the forecast is the one issued, unchanged.
    session.stepTicks(600);
    await settle();
    expect(session.snapshot().forecasts).toHaveLength(1);
    expect(session.snapshot().forecasts[0]).toBe(forecast);
    // And it described the ship: after 10 minutes the ship is within 3σ of the forecast.
    const there = forecast.samples.find((s) => s.t >= 1032)!;
    const truth = compare(session);
    const alpha = forecast.objects
      .find((o) => o.id === 'alpha')!
      .samples.find((s) => s.t === there.t)!;
    const miss = v3.distance(v3.sub(there.position, alpha.position), truth.truePosition);
    expect(miss).toBeLessThan(3 * covEllipsoid(there.positionCov).radii[0]);
  });
});

/** The Gravity range with the ship arriving on an orbit tilted by `tilt` out of the plane. */
function inclined(tilt: number): EncounterSetup {
  const world = range.definition.world;
  const alpha = world.bodies[0]!;
  const k = world.ship.kinematics;
  const along = v3.sub(k.velocity, alpha.velocity);
  const speed = v3.length(along);
  const velocity = v3.add(alpha.velocity, {
    x: along.x * Math.cos(tilt),
    y: along.y * Math.cos(tilt),
    z: speed * Math.sin(tilt),
  });
  const attitude = quat.pointAlong(k.attitude, v3.sub(velocity, alpha.velocity));
  const tilted = { ...world, ship: { ...world.ship, kinematics: { ...k, velocity, attitude } } };
  return {
    ...range,
    definition: { ...range.definition, world: tilted, briefing: briefing(tilted, SEED) },
  };
}

describe('the navigator in three dimensions', () => {
  it(
    'follows an orbit tilted 29° out of the plane within its stated uncertainty',
    { timeout: 60_000 },
    () => {
      const { session } = start(inclined(0.5));
      let highest = 0;
      let worst = 0;
      for (let t = 600; t <= 6 * 3600; t += 600) {
        session.stepTicks(600);
        const c = compare(session);
        highest = Math.max(highest, c.truePosition.z);
        // The ship is within three of the believed one-sigma (its largest axis) everywhere...
        const miss = v3.distance(c.position, c.truePosition);
        worst = Math.max(worst, miss / c.positionSigma);
        expect(miss).toBeLessThan(3 * c.positionSigma);
        // ...and its height is known as well as the navigator says.
        expect(Math.abs(c.position.z - c.truePosition.z)).toBeLessThan(
          3 * Math.sqrt(c.positionCov[5]),
        );
        expect(Math.sqrt(c.positionCov[5])).toBeGreaterThan(0);
      }
      // It really left the plane: up to 476 km above it (measured worst 2.3σ, at 600 s).
      expect(highest).toBeGreaterThan(450_000);
      expect(worst).toBeLessThan(3);
    },
  );
});

describe('recurrence after flight in three dimensions (P8, D10)', () => {
  it('Recall restores the arrival world bit for bit, and the same flying gives the same flight', () => {
    const { session } = start();
    const arrival = hashState(session.truth());
    const flight = () => {
      session.stepTicks(200);
      session.fly(pitchUp);
      session.stepTicks(60);
      session.fly({ ...HANDS_ON_NEUTRAL, yaw: -0.6, pitch: 0.4 });
      session.stepTicks(40);
      session.fly({ ...fullThrottle, translate: { x: 0, y: 0.5, z: -1 } });
      session.stepTicks(8);
      session.fly(HANDS_ON_NEUTRAL);
      session.stepTicks(300);
      return hashState(session.truth());
    };
    const first = flight();
    const k = session.truth().sim.world.ship.kinematics;
    // The flight went out of the plane and turned about more than one axis.
    expect(Math.abs(k.velocity.z)).toBeGreaterThan(1);
    expect(Math.abs(k.attitude.x) + Math.abs(k.attitude.y)).toBeGreaterThan(0.1);
    session.recall();
    expect(hashState(session.truth())).toBe(arrival);
    expect(flight()).toBe(first);
  });
});
