import { describe, expect, it } from 'vitest';
import { createGravityRange } from '../../src/content/gravity-range/index.ts';
import { createTruthStepper } from '../../src/game/truth-step.ts';
import type { GameTruthState, TickResult } from '../../src/game/truth-step.ts';
import type { Hull } from '../../src/contracts/ship.ts';
import { fromYaw } from '../../src/lib/quat.ts';
import { createMetrics } from './metrics.ts';

describe('production flight metrics', () => {
  it('integrates interval ledgers and observes real recorded packets without changing state', () => {
    const setup = createGravityRange();
    const stepper = createTruthStepper(setup);
    const metrics = createMetrics(setup, stepper.initial);
    const first = stepper.step(
      stepper.initial,
      setup.arrivalCommands.map((command) => ({ command, source: 'procedure' })),
    );
    const before = JSON.stringify(first);
    metrics.sample(first);
    const report = metrics.finish(first.state);
    expect(JSON.stringify(first)).toBe(before);
    expect(report.resources.ledgers['power.generated']!.integral).toBe(
      report.resources.ledgers['power.generated']!.final * setup.definition.dt,
    );
    expect(report.observations.packets).toBe(first.measurements.length);
    expect(report.clearance.wholeFlightSweptMinimumMeters).toBeGreaterThan(0);
    expect(report.clearance.swept.complete).toBe(true);
    expect(report.control.quantifiedReachabilityMargin).toBeNull();
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('rejects missed ticks rather than silently reporting incomplete energy integrals', () => {
    const setup = createGravityRange();
    const stepper = createTruthStepper(setup);
    const metrics = createMetrics(setup, stepper.initial);
    const one = stepper.step(stepper.initial);
    const two = stepper.step(one.state);
    expect(() => metrics.sample(two)).toThrow('every consecutive');
    expect(() => metrics.finish(two.state)).toThrow('last sampled');
  });

  it('does not turn absent exposure or acquisition data into clear space', () => {
    const setup = createGravityRange();
    const stepper = createTruthStepper(setup);
    const state = structuredClone(stepper.initial);
    const initial = {
      ...state,
      sim: {
        ...state.sim,
        world: {
          ...state.sim.world,
          ship: {
            ...state.sim.world.ship,
            systems: { ...state.sim.world.ship.systems, exposure: {} },
          },
        },
      },
    };
    const report = createMetrics(setup, initial).finish(initial);
    expect(report.observations.packets).toBe(0);
    expect(report.observations.byTarget).toEqual({});
    for (const component of Object.values(report.components)) {
      expect(component.finalExposure).toBeNull();
      expect(component.exposureAdded).toBeNull();
    }
  });

  it('keeps pending pass minima, gives a hull bound, and orders failures by event time', () => {
    const setup = createGravityRange();
    const stepper = createTruthStepper(setup);
    const metrics = createMetrics(setup, stepper.initial);
    const tick = stepper.step(stepper.initial);
    metrics.sample({
      ...tick,
      state: {
        ...tick.state,
        sim: { ...tick.state.sim, closing: { approaching: { t: 0.9, distance: 30 } } },
      },
      simEvents: [{ kind: 'clearance', t: 0.5, with: 'far', distance: 12_000 }],
      events: [
        { kind: 'battery-depleted', t: 0.8, equipment: 'battery-a' },
        { kind: 'breaker-trip', t: 0.3, equipment: 'pdu-a' },
      ],
    });
    const report = metrics.finish(tick.state);
    expect(report.clearance.minimumReportedPass).toMatchObject({
      with: 'approaching',
      distance: 30,
      source: 'pending-pass',
    });
    expect(report.clearance.reportedPassHullLowerBoundMeters).toBe(
      30 - report.clearance.maxHullReachMeters,
    );
    expect(report.firstFailedMargin).toMatchObject({
      t: 0.3,
      kind: 'breaker-trip',
      subject: 'pdu-a',
    });
  });

  it('uses the production swept hull to catch a rotating appendage tip between clear endpoints', () => {
    const hull: Hull = [
      {
        outline: [
          { x: -1, y: -1 },
          { x: 1, y: -1 },
          { x: 1, y: 1 },
          { x: -1, y: 1 },
        ],
        zMin: -1,
        zMax: 1,
        part: 'body',
      },
      {
        outline: [
          { x: 8, y: -0.05 },
          { x: 11, y: -0.05 },
          { x: 11, y: 0.05 },
          { x: 8, y: 0.05 },
        ],
        zMin: -0.05,
        zMax: 0.05,
        part: 'appendage',
      },
    ];
    const { setup, initial, tick } = geometryFixture(hull, { x: 10, y: 0.25, z: 0 });
    const coast = createMetrics(setup, initial);
    coast.sample(tick);
    expect(coast.finish(tick.state).clearance.wholeFlightSweptMinimumMeters).toBeGreaterThan(0.1);
    const rotating = {
      ...tick,
      state: {
        ...tick.state,
        sim: {
          ...tick.state.sim,
          world: {
            ...tick.state.sim.world,
            ship: {
              ...tick.state.sim.world.ship,
              kinematics: {
                ...tick.state.sim.world.ship.kinematics,
                attitude: fromYaw(0.05),
                angularVelocity: { x: 0, y: 0, z: 0.05 },
              },
            },
          },
        },
      },
    };
    const metrics = createMetrics(setup, initial);
    metrics.sample(rotating);
    const report = metrics.finish(rotating.state);
    expect(report.clearance.wholeFlightSweptMinimumMeters).toBe(0);
    expect(report.clearance.swept.minimum?.source).toBe('production-geometry');
    expect(report.clearance.swept.coverage.refined).toBe(1);
  });

  it('uses midpoint COM and the terminal deployed hull exactly as the production tick does', () => {
    const hull: Hull = [
      {
        outline: [
          { x: 4, y: -1 },
          { x: 5, y: -1 },
          { x: 5, y: 1 },
          { x: 4, y: 1 },
        ],
        zMin: -1,
        zMax: 1,
      },
    ];
    const { setup, initial, tick } = geometryFixture(hull, { x: 2.5, y: 0, z: 0 }, 0.1);
    const changed = {
      ...tick,
      state: {
        ...tick.state,
        sim: {
          ...tick.state.sim,
          world: {
            ...tick.state.sim.world,
            ship: {
              ...tick.state.sim.world.ship,
              systems: {
                ...tick.state.sim.world.ship.systems,
                massProperties: {
                  ...tick.state.sim.world.ship.systems.massProperties,
                  centerOfMass: { x: 2, y: 0, z: 0 },
                },
              },
            },
          },
        },
      },
    };
    const metrics = createMetrics(setup, initial);
    metrics.sample(changed);
    expect(metrics.finish(changed.state).clearance.wholeFlightSweptMinimumMeters).toBeCloseTo(
      0.4,
      8,
    );
  });

  it('marks missing absorbed endpoints incomplete instead of certifying the whole flight', () => {
    const { setup, initial, tick } = geometryFixture([], { x: 10, y: 0, z: 0 });
    const missing = {
      ...tick,
      state: {
        ...tick.state,
        sim: { ...tick.state.sim, world: { ...tick.state.sim.world, asteroids: [] } },
      },
    };
    const metrics = createMetrics(setup, initial);
    metrics.sample(missing);
    const report = metrics.finish(missing.state);
    expect(report.clearance.wholeFlightSweptMinimumMeters).toBeNull();
    expect(report.clearance.swept.complete).toBe(false);
    expect(report.clearance.swept.coverage.unpairedIds).toEqual(['rock']);
  });
});

/** Synthetic endpoint fixtures test the evaluator; they are not authored production flights. */
function geometryFixture(hull: Hull, position: { x: number; y: number; z: number }, radius = 0.05) {
  const setup = createGravityRange();
  const base = createTruthStepper(setup).initial;
  const initial: GameTruthState = {
    ...base,
    sim: {
      ...base.sim,
      world: {
        ...base.sim.world,
        bodies: [],
        asteroids: [{ id: 'rock', radius, position, velocity: { x: 0, y: 0, z: 0 } }],
        ship: {
          ...base.sim.world.ship,
          kinematics: {
            ...base.sim.world.ship.kinematics,
            position: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            attitude: fromYaw(0),
            angularVelocity: { x: 0, y: 0, z: 0 },
          },
          systems: {
            ...base.sim.world.ship.systems,
            massProperties: {
              ...base.sim.world.ship.systems.massProperties,
              hull,
              centerOfMass: { x: 0, y: 0, z: 0 },
            },
          },
        },
      },
    },
  };
  const tick: TickResult = {
    state: { ...initial, sim: { ...initial.sim, tick: 1, world: { ...initial.sim.world, t: 1 } } },
    executed: [],
    measurements: [],
    events: [],
    simEvents: [],
  };
  return { setup, initial, tick };
}
