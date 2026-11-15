/**
 * The core loop and recurrence v0 on the Gravity range, with the stand-in model and Black Box.
 */

import { describe, expect, it } from 'vitest';
import { HANDS_ON_NEUTRAL, type HandsOnInput } from '../contracts/index.ts';
import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import { hashState } from '../lib/hash.ts';
import { quat, v3 } from '../lib/index.ts';
import { burnDuration, burnSteps } from './belief/maneuver.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { createStandInModel } from './belief/standin-model.ts';
import type { PlanDraft } from './belief/controls.ts';
import type { BlackBoxPort } from './belief/ports.ts';
import { createGameSession, type GameSession } from './session.ts';

const setup = createGravityRange();

function start(clock?: () => number) {
  const model = createStandInModel({ referenceRadius: LAW.referenceRadius });
  const blackBox = createBlackBox();
  const session = createGameSession(setup, {
    model,
    blackBox,
    now: () => '2026-11-14T13:00:00.000Z',
    ...(clock ? { clock } : {}),
  });
  return { session, model, blackBox };
}

/** The ship's true position relative to Alpha. */
function trueRelative(session: GameSession) {
  const world = session.truth().sim.world;
  const alpha = world.bodies[0]!;
  const k = world.ship.kinematics;
  return { x: k.position.x - alpha.position.x, y: k.position.y - alpha.position.y };
}

/** A retrograde burn of about `deltaV` m/s starting 400 s after commitment. */
function dive(session: GameSession, deltaV: number): PlanDraft {
  const mass = session.snapshot().world.ship.massProperties.mass;
  return {
    name: 'Dive',
    items: burnSteps({
      at: 600,
      duration: burnDuration(session.ship, mass, deltaV),
      attitude: { reference: 'retrograde' },
    }),
  };
}

describe('game session: prepare, operate', () => {
  it('starts a first attempt at arrival, paused and safe', () => {
    const { session, blackBox } = start();
    expect(session.status()).toMatchObject({
      phase: 'prepare',
      attemptId: 'attempt-0001',
      attemptIndex: 1,
      t: 0,
      paused: true,
      outcome: { kind: 'in-progress' },
      pending: 0,
    });
    // Time does not run while paused.
    expect(session.advance(5)).toBe(0);
    expect(session.status().t).toBe(0);
    expect(blackBox.attempt('attempt-0001')).toMatchObject({
      index: 1,
      encounterId: 'gravity-range',
      startedAt: '2026-11-14T13:00:00.000Z',
      outcome: { kind: 'in-progress' },
    });
  });

  it('runs the arrival procedure on the first tick and records it', () => {
    const { session, blackBox } = start();
    session.stepTicks(1);
    expect(session.status().phase).toBe('operate');
    const executed = blackBox.attempt('attempt-0001')!.executed;
    expect(executed.map((e) => [e.t, e.command.kind, e.source, e.status])).toEqual([
      [0, 'recorder', 'procedure', 'executed'],
      [0, 'point', 'procedure', 'executed'],
    ]);
  });

  it('warp changes how many ticks run per frame, never the step', () => {
    const { session } = start(() => 0);
    session.setPaused(false);
    expect(session.advance(0.5)).toBe(0);
    expect(session.advance(0.5)).toBe(1);
    session.setWarp(55);
    expect(session.status().warp).toBe(60);
    expect(session.advance(0.5)).toBe(30);
    expect(session.status().t).toBe(31);
    expect(session.truth().sim.world.t).toBe(31);
    session.setPaused(true);
    expect(session.advance(10)).toBe(0);
  });

  it('gives up the backlog when a frame runs out of time', () => {
    let ms = 0;
    const { session } = start(() => (ms += 20));
    session.setPaused(false);
    session.setWarp(1000);
    // 1000 ticks owed; the fake clock says the 10 ms budget is spent at the first check (8 ticks).
    expect(session.advance(1)).toBe(8);
    expect(session.status().saturated).toBe(true);
    expect(session.advance(0)).toBe(1);
    expect(session.status().saturated).toBe(false);
  });

  it('builds the view from belief: the ship is where the navigator thinks, near the truth', () => {
    const { session } = start();
    session.stepTicks(600);
    const view = session.snapshot();
    const truth = trueRelative(session);
    expect(view.t).toBe(600);
    const about = view.world.bodies[0]!.position;
    expect(
      Math.hypot(
        view.world.ship.position.x - about.x - truth.x,
        view.world.ship.position.y - about.y - truth.y,
      ),
    ).toBeLessThan(5000);
    // The believed frame starts with Alpha at the origin and at rest (it has drifted a few
    // tens of metres by now, pulled by Beta); truth's barycentric frame has it 800 km away.
    const alpha = view.world.bodies[0]!;
    expect(alpha.id).toBe('alpha');
    expect(Math.hypot(alpha.position.x, alpha.position.y)).toBeLessThan(100);
    expect(session.truth().sim.world.bodies[0]!.position.x).toBeLessThan(-600e3);
    expect(view.trail.map((p) => p.t)).toEqual([
      0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600,
    ]);
    expect(view.ship.hull[0]!.outline.length).toBeGreaterThan(3);
    expect(view.coverage.cones[0]).toMatchObject({ sensor: 'camera' });
    // The camera is locked on Alpha, so its cone points along the believed line to it.
    expect(Math.abs(v3.azimuthOf(view.coverage.cones[0]!.axis))).toBeLessThan(0.1);
    // The objective is the briefing's: leave the binary (A6).
    expect(view.objectives[0]).toMatchObject({
      id: 'depart',
      kind: 'depart',
      depart: { minSpeed: 50 },
    });
    expect(view.world.ship.propellant['main-propellant']!.mean).toBe(6000);
  });
});

describe('game session: commit a plan', () => {
  it('issues a frozen forecast, records plan and forecast, and executes the plan', async () => {
    const { session, blackBox } = start();
    // Committed at 100 s, so the burn (600 s later) is at 700 s as it always was; the turn now
    // starts 480 s before it, because the ship turns no faster than its star trackers allow.
    session.stepTicks(100);
    const forecast = await session.commit(dive(session, 9.85));
    expect(Object.isFrozen(forecast)).toBe(true);
    expect(Object.isFrozen(forecast.samples)).toBe(true);
    expect(forecast).toMatchObject({
      id: 'forecast-0001',
      attemptId: 'attempt-0001',
      issuedAt: 100,
    });
    expect(forecast.samples.length).toBeGreaterThan(20);
    expect(session.status()).toMatchObject({ planId: 'plan-0001', pending: 3 });
    expect(session.snapshot().forecasts).toEqual([forecast]);

    session.stepTicks(650);
    const record = blackBox.attempt('attempt-0001')!;
    expect(record.plans).toHaveLength(1);
    expect(record.plans[0]).toMatchObject({ id: 'plan-0001', name: 'Dive', epoch: 100 });
    expect(record.forecasts).toEqual([forecast]);
    const planned = record.executed.filter((e) => e.source === 'plan');
    expect(planned.map((e) => [e.t, e.command.kind, e.planItemId, e.status])).toEqual([
      [220, 'attitude', 'plan-0001-1', 'executed'],
      [700, 'burn', 'plan-0001-2', 'executed'],
      [718, 'attitude', 'plan-0001-3', 'executed'],
    ]);
    // The plan said "retrograde"; the ship received an inertial angle from the believed velocity.
    const burn = planned[1]!.command;
    if (burn.kind !== 'burn' || burn.attitude?.reference !== 'inertial')
      throw new Error('unresolved');
    // The ship has moved 700 s (0.07 rad) round its orbit since arrival.
    expect(quat.yawOf(burn.attitude.attitude)).toBeCloseTo(Math.PI / 2 + 0.07, 1);
    expect(record.plans[0]!.items[1]!.command).toMatchObject({
      attitude: { reference: 'retrograde' },
    });
    expect(session.status()).toMatchObject({ pending: 0 });
    expect(session.status().planId).toBeUndefined();
    // About 9.6 m/s slower than the 100 m/s arrival orbit (the engine runs 2.5% under rating).
    const world = session.truth().sim.world;
    const speed = Math.hypot(
      world.ship.kinematics.velocity.x - world.bodies[0]!.velocity.x,
      world.ship.kinematics.velocity.y - world.bodies[0]!.velocity.y,
    );
    expect(speed).toBeGreaterThan(90.2);
    expect(speed).toBeLessThan(90.7);
    expect(session.snapshot().ship.thrust).toEqual([]);
  });

  it('a new plan replaces what was still scheduled', async () => {
    const { session, blackBox } = start();
    session.stepTicks(10);
    await session.commit(dive(session, 5));
    session.stepTicks(200);
    expect(session.status()).toMatchObject({ planId: 'plan-0001', pending: 2 });
    await session.commit({ items: [{ at: 30, command: { kind: 'mark', label: 'revised' } }] });
    expect(session.status()).toMatchObject({ planId: 'plan-0002', pending: 1 });
    session.stepTicks(1000);
    const executed = blackBox.attempt('attempt-0001')!.executed.filter((e) => e.source === 'plan');
    expect(executed.map((e) => [e.t, e.command.kind, e.planId])).toEqual([
      [130, 'attitude', 'plan-0001'],
      [240, 'mark', 'plan-0002'],
    ]);
    expect(session.snapshot().forecasts.map((f) => f.id)).toEqual([
      'forecast-0001',
      'forecast-0002',
    ]);
  });

  it('previews a plan without recording or scheduling anything', async () => {
    const { session, blackBox } = start();
    session.stepTicks(100);
    const draft = await session.preview(dive(session, 9.85));
    expect(draft.samples.length).toBeGreaterThan(20);
    expect(session.status().pending).toBe(0);
    expect(blackBox.attempt('attempt-0001')!.plans).toEqual([]);
    expect(blackBox.attempt('attempt-0001')!.forecasts).toEqual([]);
  });

  it('keeps the forecast detail through preview, commit and Black Box', async () => {
    const { session, blackBox } = start();
    session.stepTicks(100);
    const draft = await session.preview(dive(session, 9.85));
    expect(draft.detail!.sigmaMajor).toHaveLength(draft.samples.length);
    expect(draft.detail!.presentSource).toBe('navigator');
    const forecast = await session.commit(dive(session, 9.85));
    expect(forecast.detail!.sigmaMajor).toHaveLength(forecast.samples.length);
    expect(Object.isFrozen(forecast.detail)).toBe(true);
    expect(blackBox.attempt('attempt-0001')!.forecasts[0]!.detail).toEqual(forecast.detail);
    // The planned burn's attitude, resolved as the ship will resolve it, is in the record too.
    expect(forecast.inputs.plannedAttitudes).toHaveLength(1);
    expect(forecast.inputs.plannedAttitudes![0]!.t).toBe(700);
  });

  it('charts the encounter: its attempts, and what the model has measured there', () => {
    const { session } = start();
    expect(session.chart().regions[0]).toMatchObject({
      id: 'gravity-range',
      surveyed: 0,
      current: true,
      attempts: [{ index: 1, outcome: 'in-progress' }],
    });
    session.stepTicks(100);
    session.recall();
    // Alpha's pull has been measured (fixes at r0); Beta's has not, and no rule is adopted.
    expect(session.chart().regions[0]).toMatchObject({
      surveyed: 1 / 3,
      attempts: [
        { index: 1, outcome: 'recalled' },
        { index: 2, outcome: 'in-progress' },
      ],
    });
  });

  it('holds time still while a commit waits for its forecast', async () => {
    const { session } = start(() => 0);
    session.setPaused(false);
    session.advance(5);
    const pending = session.commit({ items: [] });
    expect(session.status().committing).toBe(true);
    expect(session.advance(5)).toBe(0);
    await pending;
    expect(session.status().committing).toBe(false);
    expect(session.advance(5)).toBe(5);
  });

  it('records a manual command, and a reference the navigator cannot resolve as rejected', () => {
    const { session, blackBox } = start();
    session.stepTicks(5);
    session.command({ kind: 'mark', label: 'look' });
    session.command({ kind: 'attitude', target: { reference: 'toward', target: 'nowhere' } });
    session.stepTicks(1);
    const record = blackBox.attempt('attempt-0001')!;
    expect(record.executed.slice(-2).map((e) => [e.t, e.command.kind, e.source, e.status])).toEqual(
      [
        [5, 'mark', 'manual', 'executed'],
        [5, 'attitude', 'manual', 'rejected'],
      ],
    );
    expect(record.events.at(-1)).toMatchObject({ kind: 'command-rejected', t: 5 });
  });
});

describe('game session: recurrence v0 (P8)', () => {
  it('Recall resets the whole world to arrival; Black Box and the model keep everything', async () => {
    const { session, blackBox, model } = start();
    const arrival = hashState(session.truth());
    session.stepTicks(200);
    await session.commit(dive(session, 9.85));
    session.stepTicks(900);
    const first = hashState(session.truth());
    expect(first).not.toBe(arrival);
    const recorded = blackBox.attempt('attempt-0001')!.measurements.length;
    expect(recorded).toBeGreaterThan(300);

    session.recall();

    expect(session.status()).toMatchObject({
      phase: 'prepare',
      attemptId: 'attempt-0002',
      attemptIndex: 2,
      t: 0,
      paused: true,
      pending: 0,
      outcome: { kind: 'in-progress' },
    });
    // Ship, bodies, asteroids, tanks, noise streams: exactly the arrival world.
    expect(hashState(session.truth())).toBe(arrival);
    expect(session.snapshot().forecasts).toEqual([]);
    expect(session.snapshot().trail).toEqual([
      { t: 0, position: session.snapshot().world.ship.position },
    ]);

    const archive = blackBox.archive();
    expect(archive.attempts.map((a) => [a.id, a.outcome.kind])).toEqual([
      ['attempt-0001', 'recalled'],
      ['attempt-0002', 'in-progress'],
    ]);
    const kept = archive.attempts[0]!;
    expect(kept.outcome).toEqual({ kind: 'recalled', t: 1100 });
    expect(kept.measurements).toHaveLength(recorded);
    expect(kept.events.at(-1)).toEqual({ kind: 'recall', t: 1100 });
    expect(kept.forecasts).toHaveLength(1);
    expect(model.state().basedOn.attempts).toEqual(['attempt-0001', 'attempt-0002']);
    expect(model.state().basedOn.measurementCount).toBeGreaterThanOrEqual(recorded);
  });

  it('the same plan flown again gives the same flight (P2, P9)', async () => {
    const { session } = start();
    session.stepTicks(200);
    await session.commit(dive(session, 9.85));
    session.stepTicks(900);
    const first = hashState(session.truth());
    session.recall();
    session.stepTicks(200);
    await session.commit(dive(session, 9.85));
    session.stepTicks(900);
    expect(hashState(session.truth())).toBe(first);
  });

  it('can overlay two recorded attempts', async () => {
    const { session } = start();
    session.stepTicks(120);
    await session.commit(dive(session, 5));
    session.stepTicks(120);
    session.recall();
    session.stepTicks(180);
    session.setCompare(['attempt-0001', 'attempt-0002']);
    const compare = session.snapshot().compare!;
    expect(compare.map((o) => [o.attemptId, o.label, o.trail.length, o.forecast?.id])).toEqual([
      ['attempt-0001', 'Attempt 1', 5, 'forecast-0001'],
      ['attempt-0002', 'Attempt 2', 4, undefined],
    ]);
    session.setCompare();
    expect(session.snapshot().compare).toBeUndefined();
  });

  it('loss ends the attempt with its records kept; restart begins the next', () => {
    // A rock 300 m ahead, closing at 30 m/s.
    const world = setup.definition.world;
    const k = world.ship.kinematics;
    const yaw = quat.yawOf(k.attitude);
    const dir = { x: Math.cos(yaw), y: Math.sin(yaw) };
    const blocked = {
      ...setup,
      definition: {
        ...setup.definition,
        world: {
          ...world,
          asteroids: [
            ...world.asteroids,
            {
              id: 'rock',
              radius: 50,
              position: { x: k.position.x + dir.x * 300, y: k.position.y + dir.y * 300, z: 0 },
              velocity: { x: k.velocity.x - dir.x * 30, y: k.velocity.y - dir.y * 30, z: 0 },
            },
          ],
        },
      },
    };
    const blackBox = createBlackBox();
    const session = createGameSession(blocked, {
      model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
      blackBox,
      now: () => 'now',
    });
    session.setPaused(false);
    expect(session.stepTicks(100)).toBeLessThan(12);
    const status = session.status();
    expect(status).toMatchObject({
      phase: 'ended',
      paused: true,
      outcome: { kind: 'lost', cause: 'collision' },
    });
    const record = blackBox.attempt('attempt-0001')!;
    expect(record.outcome).toEqual(status.outcome);
    expect(record.events.map((e) => e.kind)).toEqual(['contact', 'ship-lost']);
    // Nothing runs after loss, and a plan cannot be committed.
    expect(session.stepTicks(10)).toBe(0);
    session.setPaused(false);
    expect(session.status().paused).toBe(true);

    session.restart();
    expect(session.status()).toMatchObject({ phase: 'prepare', attemptIndex: 2, t: 0 });
    expect(blackBox.archive().attempts).toHaveLength(2);
  });
});

describe('game session: hands-on flying (A8, A11)', () => {
  const thrust: HandsOnInput = { ...HANDS_ON_NEUTRAL, throttle: 1 };
  const turn: HandsOnInput = { ...HANDS_ON_NEUTRAL, yaw: 0.5 };
  /** Lets a forecast the stand-in model has already worked out be issued and recorded. */
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  /** The `fly` commands in an attempt's record. */
  const flown = (blackBox: BlackBoxPort, attempt = 'attempt-0001') =>
    blackBox.attempt(attempt)!.executed.filter((e) => e.command.kind === 'fly');

  it('sends a changed input to the ship as one executed command, and a repeated one not at all', () => {
    const { session, blackBox } = start();
    session.stepTicks(5);
    // An attempt starts with the controls released, so a neutral input is nothing new.
    session.fly(HANDS_ON_NEUTRAL);
    session.fly(turn);
    session.fly({ ...turn });
    session.stepTicks(1);
    session.fly(turn);
    session.stepTicks(3);
    expect(flown(blackBox).map((e) => [e.t, e.source, e.status])).toEqual([
      [5, 'manual', 'executed'],
    ]);
    expect(flown(blackBox)[0]!.command).toEqual({ kind: 'fly', input: turn });
    session.fly(thrust);
    session.stepTicks(1);
    expect(flown(blackBox).map((e) => [e.t, e.status])).toEqual([
      [5, 'executed'],
      [9, 'executed'],
    ]);
  });

  it('issues one frozen, recorded coasting forecast on release, while time keeps running', async () => {
    const { session, blackBox } = start(() => 0);
    session.setPaused(false);
    session.advance(5);
    session.fly(thrust);
    session.advance(3);
    expect(session.snapshot().forecasts).toEqual([]);
    session.fly(HANDS_ON_NEUTRAL);
    session.fly(HANDS_ON_NEUTRAL);
    // Unlike a commit, a release does not hold time while its forecast is on the way.
    expect(session.status().committing).toBe(false);
    expect(session.advance(4)).toBe(4);
    await settle();

    const issued = session.snapshot().forecasts;
    expect(issued).toHaveLength(1);
    const forecast = issued[0]!;
    expect(Object.isFrozen(forecast)).toBe(true);
    expect(Object.isFrozen(forecast.samples)).toBe(true);
    expect(forecast).toMatchObject({
      id: 'forecast-0001',
      attemptId: 'attempt-0001',
      issuedAt: 8,
    });
    expect(forecast.inputs.plan.epoch).toBe(8);
    expect(forecast.inputs.plan.items).toEqual([]);
    expect(forecast.samples.length).toBeGreaterThan(20);
    const record = blackBox.attempt('attempt-0001')!;
    expect(record.forecasts).toEqual([forecast]);
    // Nothing was committed or scheduled.
    expect(record.plans).toEqual([]);
    expect(session.status()).toMatchObject({ t: 12, pending: 0 });
    expect(session.status().planId).toBeUndefined();
    expect(flown(blackBox).map((e) => [e.t, e.status])).toEqual([
      [5, 'executed'],
      [8, 'executed'],
    ]);
  });

  it('leaves a plan that is still scheduled alone', async () => {
    const { session, blackBox } = start();
    session.stepTicks(10);
    await session.commit({ items: [{ at: 500, command: { kind: 'mark', label: 'later' } }] });
    session.fly(thrust);
    session.stepTicks(2);
    session.fly(HANDS_ON_NEUTRAL);
    session.stepTicks(2);
    await settle();
    expect(session.status()).toMatchObject({ planId: 'plan-0001', pending: 1 });
    expect(session.snapshot().forecasts.map((f) => [f.id, f.inputs.plan.items.length])).toEqual([
      ['forecast-0001', 1],
      ['forecast-0002', 0],
    ]);
    expect(blackBox.attempt('attempt-0001')!.plans.map((p) => p.id)).toEqual(['plan-0001']);
  });

  it('forgets the controls when a new attempt begins', async () => {
    const { session, blackBox } = start();
    session.stepTicks(3);
    session.fly(thrust);
    session.stepTicks(2);
    session.recall();
    // Released again at arrival: a neutral input is nothing new, the same thrust is.
    session.fly(HANDS_ON_NEUTRAL);
    session.fly(thrust);
    session.stepTicks(1);
    await settle();
    expect(flown(blackBox, 'attempt-0002').map((e) => [e.t, e.status])).toEqual([[0, 'executed']]);
    expect(session.snapshot().forecasts).toEqual([]);
  });

  it('carries on when the model cannot forecast the coast', async () => {
    const blackBox = createBlackBox();
    const session = createGameSession(setup, {
      model: {
        ...createStandInModel({ referenceRadius: LAW.referenceRadius }),
        forecast: () => Promise.reject(new Error('model down')),
      },
      blackBox,
      now: () => 'now',
    });
    session.stepTicks(3);
    session.fly(thrust);
    session.stepTicks(2);
    session.fly(HANDS_ON_NEUTRAL);
    expect(session.stepTicks(5)).toBe(5);
    await settle();
    expect(session.snapshot().forecasts).toEqual([]);
    expect(blackBox.attempt('attempt-0001')!.forecasts).toEqual([]);
    expect(session.status()).toMatchObject({ phase: 'operate', t: 10 });
  });
});
