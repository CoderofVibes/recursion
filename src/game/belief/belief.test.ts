/**
 * Belief-side helpers of the game layer: attitude resolution, telemetry thinning, plan
 * building, and the rule that nothing in this folder reaches truth (P11).
 */

import { describe, expect, it } from 'vitest';
import type {
  AttemptRecord,
  BelievedWorld,
  BlackBoxArchive,
  Measurement,
  ModelState,
} from '../../contracts/index.ts';
import { HANDS_ON_NEUTRAL } from '../../contracts/index.ts';
import { createGravityRange, LAW } from '../../content/gravity-range/index.ts';
import { quat, v3 } from '../../lib/index.ts';
import { loadShipDefinition } from '../../ship/index.ts';
import { buildChart } from './chart.ts';
import { burnDuration, burnSteps } from './maneuver.ts';
import { resolveAttitude, resolveCommand, type NavigationView } from './resolve.ts';
import { createStandInModel } from './standin-model.ts';
import { createTelemetryFilter } from './telemetry.ts';
import { applyCommanded, buildViewSnapshot, initialCommandedState, sensorCones } from './view.ts';

describe('belief side of the game layer stays on its side (P11)', () => {
  const sources = Object.entries(
    import.meta.glob<string>('./*.ts', { query: '?raw', import: 'default', eager: true }),
  ).filter(([file]) => !file.endsWith('.test.ts'));

  it('imports no truth contracts, simulation, ship systems, content or truth-side game code', () => {
    expect(sources.length).toBeGreaterThan(5);
    for (const [file, source] of sources) {
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      for (const path of imports) {
        expect(path, `${file} imports ${path}`).not.toMatch(
          /contracts\/truth|\/sim\/|\/ship\/|\/content\/|fixtures\/(truth|generate)/,
        );
        // Within src/game, only this folder.
        if (path.startsWith('../') && !path.startsWith('../../'))
          throw new Error(`${file} imports truth-side game code: ${path}`);
      }
    }
  });
});

describe('attitude references resolve from the believed navigation solution', () => {
  const nav: NavigationView = {
    ship: {
      position: { x: -1000, y: 0, z: 0 },
      velocity: { x: 0, y: -100, z: 0 },
      attitude: quat.fromYaw(0),
    },
    bodies: [
      { id: 'alpha', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
      { id: 'beta', position: { x: 4000, y: 0, z: 0 }, velocity: { x: 0, y: 40, z: 0 } },
    ],
    asteroids: [{ id: 'a-01', position: { x: -1000, y: 500, z: 0 } }],
  };
  const angle = (target: Parameters<typeof resolveAttitude>[0]): number => {
    const resolved = resolveAttitude(target, nav);
    if (resolved?.reference !== 'inertial') throw new Error('not resolved');
    return quat.yawOf(resolved.attitude);
  };

  it('prograde is the believed inertial velocity', () => {
    expect(angle({ reference: 'prograde' })).toBeCloseTo(-Math.PI / 2, 12);
    expect(angle({ reference: 'retrograde' })).toBeCloseTo(Math.PI / 2, 12);
  });

  it('toward and away follow the believed position of a body or an asteroid', () => {
    expect(angle({ reference: 'toward', target: 'alpha' })).toBeCloseTo(0, 12);
    expect(Math.abs(angle({ reference: 'away', target: 'alpha' }))).toBeCloseTo(Math.PI, 12);
    expect(angle({ reference: 'toward', target: 'a-01' })).toBeCloseTo(Math.PI / 2, 12);
  });

  it('points the body axis along a given direction, roll held', () => {
    expect(angle({ reference: 'direction', direction: { x: 0, y: 2, z: 0 } })).toBeCloseTo(
      Math.PI / 2,
      12,
    );
    const up = resolveAttitude({ reference: 'direction', direction: { x: 0, y: 0, z: 3 } }, nav);
    if (up?.reference !== 'inertial') throw new Error('not resolved');
    const axis = quat.axisX(up.attitude);
    expect(axis.x).toBeCloseTo(0, 12);
    expect(axis.y).toBeCloseTo(0, 12);
    expect(axis.z).toBeCloseTo(1, 12);
    const none = { reference: 'direction', direction: { x: 0, y: 0, z: 0 } } as const;
    expect(resolveAttitude(none, nav)).toBeUndefined();
  });

  it('passes inertial, rate and free through untouched', () => {
    const inertial = { reference: 'inertial', attitude: quat.fromYaw(1) } as const;
    expect(resolveAttitude(inertial, nav)).toBe(inertial);
    expect(resolveAttitude({ reference: 'free' }, nav)).toEqual({ reference: 'free' });
    expect(resolveAttitude({ reference: 'rate', rate: { x: 0, y: 0, z: 0.01 } }, nav)).toEqual({
      reference: 'rate',
      rate: { x: 0, y: 0, z: 0.01 },
    });
  });

  it('cannot resolve what the ship does not know', () => {
    expect(resolveAttitude({ reference: 'toward', target: 'nowhere' }, nav)).toBeUndefined();
    const still = { ...nav, ship: { ...nav.ship, velocity: { x: 0, y: 0, z: 0 } } };
    expect(resolveAttitude({ reference: 'prograde' }, still)).toBeUndefined();
  });

  it('resolves attitude and burn commands and leaves the rest alone', () => {
    const mark = { kind: 'mark', label: 'x' } as const;
    expect(resolveCommand(mark, nav)).toBe(mark);
    expect(
      resolveCommand({ kind: 'attitude', target: { reference: 'toward', target: 'alpha' } }, nav),
    ).toEqual({ kind: 'attitude', target: { reference: 'inertial', attitude: quat.fromYaw(0) } });
    const burn = resolveCommand(
      {
        kind: 'burn',
        thruster: 'main-engine',
        throttle: 1,
        duration: 5,
        attitude: { reference: 'retrograde' },
      },
      nav,
    );
    expect(burn).toMatchObject({ kind: 'burn', duration: 5, attitude: { reference: 'inertial' } });
    expect(
      resolveCommand({ kind: 'attitude', target: { reference: 'away', target: 'nowhere' } }, nav),
    ).toBeUndefined();
  });
});

describe('telemetry is recorded on change', () => {
  const reading = (t: number, channel: string, value: number): Measurement => ({
    kind: 'telemetry',
    t,
    source: 'black-box',
    channel,
    value: [value],
    sigma: [0],
  });
  const fix = (t: number): Measurement => ({
    kind: 'bearing',
    t,
    source: 'camera',
    target: 'alpha',
    value: [0.1, 0],
    sigma: [5e-5, 5e-5],
  });

  it('keeps the first reading, changes beyond the deadband and a keepalive', () => {
    const filter = createTelemetryFilter(0.01, 100);
    const kept = (m: Measurement[]) => filter.filter(m).map((x) => [x.t, x.channel, x.value[0]]);
    expect(kept([reading(0, 'a.power', 100), reading(0, 'b.power', 0)])).toHaveLength(2);
    expect(kept([reading(20, 'a.power', 100.5), reading(20, 'b.power', 0)])).toEqual([]);
    expect(kept([reading(40, 'a.power', 102), reading(40, 'b.power', 5)])).toEqual([
      [40, 'a.power', 102],
      [40, 'b.power', 5],
    ]);
    // Unchanged, but 100 s since the channel was last kept.
    expect(kept([reading(140, 'a.power', 102)])).toEqual([[140, 'a.power', 102]]);
  });

  it('never drops navigation measurements and keeps their order', () => {
    const filter = createTelemetryFilter(0.01, 100);
    filter.filter([reading(0, 'a.power', 100)]);
    const batch = [fix(20), reading(20, 'a.power', 100), fix(20)];
    expect(filter.filter(batch)).toEqual([batch[0], batch[2]]);
    const untouched = [fix(40), fix(40)];
    expect(filter.filter(untouched)).toBe(untouched);
  });

  it('starts afresh after a reset', () => {
    const filter = createTelemetryFilter(0.01, 100);
    filter.filter([reading(0, 'a.power', 100)]);
    filter.reset();
    expect(filter.filter([reading(20, 'a.power', 100)])).toHaveLength(1);
  });
});

describe('plan helpers', () => {
  const ship = loadShipDefinition();

  it('turns, burns and releases', () => {
    const steps = burnSteps({ at: 600, duration: 12, attitude: { reference: 'retrograde' } });
    // The turn starts TURN_LEAD (480 s) before the burn: a half turn takes about 420 s.
    expect(steps.map((s) => [s.at, s.command.kind])).toEqual([
      [120, 'attitude'],
      [600, 'burn'],
      [617, 'attitude'],
    ]);
    // Released to a zero-rate hold, not free: a ship left free after a burn keeps turning.
    expect(steps[2]!.command).toEqual({
      kind: 'attitude',
      target: { reference: 'rate', rate: { x: 0, y: 0, z: 0 } },
    });
  });

  it('clips the turn to the plan epoch and can keep holding', () => {
    const steps = burnSteps({
      at: 50,
      duration: 3,
      attitude: { reference: 'prograde' },
      release: null,
    });
    expect(steps.map((s) => [s.at, s.command.kind])).toEqual([
      [0, 'attitude'],
      [50, 'burn'],
    ]);
  });

  it('sizes a burn with the rocket equation at nominal ratings', () => {
    // 24 kN at 320 s on 30,374 kg: 10 m/s takes about 12.6 s.
    const duration = burnDuration(ship, 30374, 10);
    const exhaust = 320 * 9.80665;
    expect(duration).toBeCloseTo((30374 * (1 - Math.exp(-10 / exhaust)) * exhaust) / 24000, 9);
    expect(duration).toBeGreaterThan(12.6);
    expect(duration).toBeLessThan(12.7);
    expect(burnDuration(ship, 30374, 10, 'no-such-engine')).toBe(0);
  });
});

describe('commanded state follows executed commands', () => {
  it('tracks burns and camera pointing', () => {
    let state = initialCommandedState;
    state = applyCommanded(state, 0, { kind: 'point', sensor: 'camera', target: 'alpha' });
    state = applyCommanded(state, 100, {
      kind: 'burn',
      thruster: 'main-engine',
      throttle: 0.5,
      duration: 10,
    });
    expect(state.pointing.camera).toEqual({ target: 'alpha' });
    expect(state.burns).toEqual([{ thruster: 'main-engine', throttle: 0.5, until: 110 }]);
    expect(applyCommanded(state, 105, { kind: 'cutoff', thruster: 'all' }).burns).toEqual([]);
  });

  it('keeps the hands-on controls while held, and a cut-off thruster quiet until they change', () => {
    const input = { ...HANDS_ON_NEUTRAL, throttle: 1, translate: { x: 0, y: 0, z: 1 } };
    let state = applyCommanded(initialCommandedState, 10, { kind: 'fly', input });
    expect(state.handsOn).toEqual({ input, cut: [] });
    state = applyCommanded(state, 12, { kind: 'cutoff', thruster: 'main-engine' });
    expect(state.handsOn).toEqual({ input, cut: ['main-engine'] });
    expect(applyCommanded(state, 13, { kind: 'fly', input: { ...input } }).handsOn!.cut).toEqual(
      [],
    );
    expect(applyCommanded(state, 13, { kind: 'cutoff', thruster: 'all' }).handsOn).toBeUndefined();
    expect(
      applyCommanded(state, 13, { kind: 'fly', input: HANDS_ON_NEUTRAL }).handsOn,
    ).toBeUndefined();
  });
});

describe('the view snapshot in three dimensions', () => {
  const setup = createGravityRange();
  const navigator = createStandInModel({ referenceRadius: LAW.referenceRadius });
  navigator.beginAttempt(
    {
      attemptId: 'attempt-0001',
      index: 1,
      briefing: setup.definition.briefing,
      ship: setup.definition.ship,
      startedAt: 'now',
    },
    undefined as never,
  );
  const believed = navigator.believedWorld(0);
  /** The believed world with the ship pitched nose-up by `pitch`, and the camera drawing power. */
  const world = (pitch = 0): BelievedWorld => ({
    ...believed,
    ship: {
      ...believed.ship,
      attitude: quat.fromAxisAngle({ x: 0, y: -1, z: 0 }, pitch),
      equipment: {
        ...believed.ship.equipment,
        camera: { ...believed.ship.equipment.camera!, powerDraw: 120 },
      },
    },
  });
  const view = (inputs: Partial<Parameters<typeof buildViewSnapshot>[0]>) =>
    buildViewSnapshot({
      t: 0,
      paused: true,
      warp: 1,
      world: world(),
      definition: setup.definition.ship,
      commanded: initialCommandedState,
      trail: [],
      forecasts: [],
      objectives: [],
      ...inputs,
    });

  it('points the camera cone along its 3D axis: at its target, along its direction, or its boresight', () => {
    const rock = believed.asteroids.find((a) => a.position.z > 5_000)!;
    const toRock = v3.normalize(v3.sub(rock.position, believed.ship.position));
    const aimed = applyCommanded(initialCommandedState, 0, {
      kind: 'point',
      sensor: 'camera',
      target: rock.id,
    });
    const atRock = sensorCones(setup.definition.ship, aimed, world()).at(0)!;
    expect(v3.angleBetween(atRock.axis, toRock)).toBeLessThan(1e-12);
    expect(atRock.axis.z).toBeGreaterThan(0);
    expect(atRock.halfAngle).toBeCloseTo(Math.PI / 6, 12);

    const along = applyCommanded(initialCommandedState, 0, {
      kind: 'point',
      sensor: 'camera',
      target: null,
      direction: { x: 0, y: 3, z: 4 },
    });
    expect(sensorCones(setup.definition.ship, along, world())[0]!.axis).toEqual({
      x: 0,
      y: 0.6,
      z: 0.8,
    });

    // Not pointed: the boresight (body +x) carried by the believed attitude, pitched 30° up.
    const boresight = sensorCones(setup.definition.ship, initialCommandedState, world(Math.PI / 6));
    expect(boresight[0]!.axis.x).toBeCloseTo(Math.cos(Math.PI / 6), 12);
    expect(boresight[0]!.axis.z).toBeCloseTo(0.5, 12);
    // An unpowered camera has no cone.
    const off = { ...world(), ship: { ...world().ship, equipment: believed.ship.equipment } };
    expect(sensorCones(setup.definition.ship, aimed, off)).toEqual([]);
  });

  it('draws the hands-on thrust it is given, less a thruster cut off since', () => {
    const input = { ...HANDS_ON_NEUTRAL, throttle: 1 };
    const engine = {
      source: 'main-engine',
      point: { x: -7, y: 0.08, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      magnitude: 24_000,
    };
    const jet = { ...engine, source: 'rcs-aft-left', point: { x: -5, y: 2, z: 0 }, magnitude: 200 };
    let commanded = applyCommanded(initialCommandedState, 0, { kind: 'fly', input });
    expect(view({ commanded, handsOn: [engine, jet] }).ship.thrust).toEqual([engine, jet]);
    commanded = applyCommanded(commanded, 1, { kind: 'cutoff', thruster: 'main-engine' });
    expect(view({ commanded, handsOn: [engine, jet] }).ship.thrust).toEqual([jet]);
    // Hull and centre of mass come from the believed mass properties.
    const ship = view({}).ship;
    expect(ship.hull).toBe(believed.ship.massProperties.hull);
    expect(ship.centerOfMass.z).toBeLessThan(0);
    expect(ship.hull).toHaveLength(5);
  });

  it('passes the window and earlier coverage through, and leaves out an empty history', () => {
    const window = { sunlit: true, objects: [] };
    expect(view({ window }).window).toBe(window);
    expect(view({ coverageEarlier: [] })).not.toHaveProperty('coverageEarlier');
    expect(view({})).not.toHaveProperty('window');
  });
});

describe('the chart (GameControls.chart)', () => {
  const setup = createGravityRange();
  const briefing = setup.definition.briefing;
  const state = (over: Partial<ModelState> = {}): ModelState => ({
    version: 1,
    parameters: [],
    covariance: { ids: [], values: [] },
    extensions: [],
    support: { distance: {}, powered: [] },
    residuals: { coast: { rms: 0, n: 0 }, powered: { rms: 0, n: 0 } },
    basedOn: { attempts: [], measurementCount: 0 },
    calibration: [],
    ...over,
  });
  const attempt = (index: number, outcome: AttemptRecord['outcome'], encounterId = briefing.id) =>
    ({ id: `attempt-000${index}`, index, encounterId, outcome }) as unknown as AttemptRecord;
  const archive = (over: Partial<BlackBoxArchive> = {}): BlackBoxArchive => ({
    attempts: [],
    procedures: [],
    adoptedExtensions: [],
    leads: [],
    ...over,
  });

  it('is one region at the origin as far out as the depart objective, with its attempts', () => {
    const chart = buildChart(
      briefing,
      state(),
      archive({
        attempts: [
          attempt(1, { kind: 'lost', t: 50, cause: 'collision' }),
          attempt(2, { kind: 'in-progress' }),
          attempt(3, { kind: 'recalled', t: 9 }, 'elsewhere'),
        ],
      }),
    );
    expect(chart).toEqual({
      regions: [
        {
          id: 'gravity-range',
          name: 'GRAVITY RANGE',
          position: { x: 0, y: 0, z: 0 },
          radius: 9_000_000,
          surveyed: 0,
          current: true,
          attempts: [
            { index: 1, outcome: 'lost' },
            { index: 2, outcome: 'in-progress' },
          ],
        },
      ],
      corridors: [],
      leads: [],
    });
  });

  it('counts survey coverage: each body whose pull has been measured, and an adopted rule', () => {
    const measured = state({ support: { distance: { alpha: [[5e5, 1e6]] }, powered: [] } });
    expect(buildChart(briefing, measured, archive()).regions[0]!.surveyed).toBeCloseTo(1 / 3, 12);
    const ruled = state({
      support: { distance: { alpha: [[5e5, 1e6]], beta: [[1e6, 2e6]] }, powered: [] },
      extensions: [{ id: 'distance-law', status: 'adopted' }],
    });
    expect(buildChart(briefing, ruled, archive()).regions[0]!.surveyed).toBe(1);
  });

  it('without a depart objective reaches the farthest briefed body', () => {
    const plain = { ...briefing, objectives: [] };
    const beta = briefing.knownBodies[1]!;
    expect(buildChart(plain, state(), archive()).regions[0]!.radius).toBeCloseTo(
      v3.length(beta.position) + beta.radius,
      6,
    );
  });

  it('draws a lead only when it has a bearing, as a unit direction', () => {
    const seen = { attemptId: 'attempt-0001', t: 10 };
    const chart = buildChart(
      briefing,
      state(),
      archive({
        leads: [
          { id: 'glint', name: 'Glint', firstSeen: seen, status: 'noticed' },
          {
            id: 'flash',
            name: 'Flash',
            firstSeen: seen,
            status: 'investigating',
            bearing: { from: briefing.id, direction: { x: 0, y: 0, z: 2 }, spread: 0.1 },
          },
        ],
      }),
    );
    expect(chart.leads).toEqual([
      {
        id: 'flash',
        name: 'Flash',
        from: 'gravity-range',
        direction: { x: 0, y: 0, z: 1 },
        spread: 0.1,
      },
    ]);
  });
});
