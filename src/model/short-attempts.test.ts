/**
 * Short and cut-off attempts must never stop the model.
 *
 * Control-room report: after three short attempts (about 100 s with a held burn that a page
 * reload cut off 4 s in, about 40 s, then a dive lost at the primary) every model call failed
 * with `luDecompose: singular matrix`, and the model stayed at version 0.
 *
 * Cause: arc growing (1G spec §4.5) fits the first quarter of each arc first. An arc of three or
 * four fixes has one fix in its first quarter; one fix gives a position and no velocity, so that
 * stage's normal matrix had two zero rows, and inverting it threw. The record stayed in Black
 * Box, so every later fit threw as well. The held burn mattered only because the fix taken
 * during it became the arc's third.
 *
 * The records here are synthesised the way a flight makes them: a small reference propagation
 * under Newton's law about one body, a camera fix every 20 s, commands as executed. Truth only
 * builds the inputs.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  HANDS_ON_NEUTRAL,
  cov3FromPlanar,
  isotropicInertia,
  prismHull,
  type AttemptOutcome,
  type AttemptRecord,
  type BelievedBody,
  type ExecutedCommand,
  type MassProperties,
  type Measurement,
  type ModelState,
  type ParameterPrior,
  type ShipEvent,
} from '../contracts/index.ts';
import { hashState } from '../lib/hash.ts';
import * as quat from '../lib/quat.ts';
import { createRng } from '../lib/rng.ts';
import { arcsFromRecord, normalPoints, type Burn } from './adapt.ts';
import {
  compileArc,
  rangeFixTimes,
  simulate,
  type EstMeasurement,
  type Structure,
  type ThrustSegment,
} from './dynamics.ts';
import { modelSpec, tierGProblem, type ModelContext } from './engine.ts';
import { ModelService } from './service.ts';
import { resolveSettings } from './settings.ts';
import { Problem, stagedFit } from './solve.ts';
import { testShip } from './vector-harness.ts';

/**
 * No record is known that fails only when fitted together with others, so that one failure is
 * injected: while `jointFitFails` is set, a fit of more than one arc throws. Otherwise this is
 * the real `stagedFit`.
 */
const injected = vi.hoisted(() => ({ jointFitFails: false }));
vi.mock('./solve.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./solve.ts')>();
  const staged: typeof real.stagedFit = (st, arcs, ...rest) => {
    if (injected.jointFitFails && arcs.length > 1)
      throw new Error('fit: injected failure of the joint fit');
    return real.stagedFit(st, arcs, ...rest);
  };
  return { ...real, stagedFit: staged };
});

// The scenarios in this file are planar (z = 0, yaw-only attitude, flat hull): the model runs
// them in the planar reduction (`planar: 1`, spec Appendix A.3), as the planar model did.
const MASS = 30000;
const THRUST = 4500;
/** Thrust acceleration at full throttle, m/s². */
const U = THRUST / MASS;
const R0 = 1e6;
const MU = 1.0e10;
const RADIUS = 2.5e5;

const primary: BelievedBody = {
  id: 'A',
  name: 'A',
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  positionCov: cov3FromPlanar([0, 0, 0]),
  radius: RADIUS,
  tracked: true,
};
const priors: ParameterPrior[] = [
  { id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 },
];
const context = (extra: Partial<ModelContext> = {}, planar = true): ModelContext => ({
  encounterId: 'range',
  priors,
  bodies: [primary],
  ship: testShip(MASS, THRUST),
  arrival: {
    t: 0,
    position: { x: R0, y: 0, z: 0 },
    velocity: { x: 0, y: 100, z: 0 },
    positionCov: cov3FromPlanar([1500 ** 2, 0, 1500 ** 2]),
    velocityCov: cov3FromPlanar([0.15 ** 2, 0, 0.15 ** 2]),
    attitude: quat.fromYaw(0),
    attitudeSigma: 4e-5,
    angularVelocity: { x: 0, y: 0, z: 0 },
  },
  ...extra,
  settings: { ...(planar ? { planar: 1 } : {}), ...(extra.settings ?? {}) },
});
const massProperties: MassProperties = {
  mass: MASS,
  centerOfMass: { x: 0, y: 0, z: 0 },
  inertia: isotropicInertia(1e5),
  hull: prismHull(
    [
      { x: -5, y: -2 },
      { x: 5, y: -2 },
      { x: 5, y: 2 },
      { x: -5, y: 2 },
    ],
    0,
    0,
  ),
};

type State6 = readonly [number, number, number, number, number, number];
/** Circular orbit at r0 about the primary (100 m/s). */
const CIRCULAR: State6 = [R0, 0, 0, 0, 100, 0];

/** A planar thrust segment along yaw `theta`. */
const along = (t0: number, t1: number, theta: number): ThrustSegment => ({
  t0,
  t1,
  u: U,
  q: quat.fromYaw(theta),
});

/** Ship relative to the primary at the given times, under the true law and thrust. */
function truthAt(start: State6, thrust: readonly ThrustSegment[], times: readonly number[]) {
  const st: Structure = {
    r0: R0,
    n: 2,
    bodies: [{ id: 'A', mu: MU, state: 'gauge' }],
    ship: start,
    dynamicBodies: false,
    engine: { kE: 1, dE: 0, dP: 0 },
    kA: 1,
    camBias: [0, 0, 0],
  };
  return simulate(
    compileArc(st, { id: 'truth', epoch: 0, commands: thrust }, new Map()),
    [],
    times,
    1,
  ).pos.map((p) => [p[3]!, p[4]!, p[5]!] as const);
}

interface Flight {
  readonly id: string;
  readonly index: number;
  /** Times of the recorder's packets: an attitude, a fix on the primary, an accelerometer sample. */
  readonly fixes: readonly number[];
  /** True thrust (the ship's yaw is its direction). */
  readonly thrust?: readonly ThrustSegment[];
  readonly executed?: readonly ExecutedCommand[];
  readonly events?: readonly ShipEvent[];
  readonly outcome: AttemptOutcome;
  /** Time of a last housekeeping reading, when the record ends after its last packet. */
  readonly last?: number;
}

/** Packet times: `first`, then every `step` seconds up to `end`. */
const every = (step: number, end: number, first = step): number[] => {
  const out: number[] = [];
  for (let t = first; t <= end + 1e-9; t += step) out.push(t);
  return out;
};

function record(f: Flight): AttemptRecord {
  const times = [...f.fixes].sort((a, b) => a - b);
  const thrust = f.thrust ?? [];
  const pos = times.length > 0 ? truthAt(CIRCULAR, thrust, times) : [];
  const rng = createRng('short-attempts').stream(f.id);
  const sb = 4.1e-5;
  const measurements: Measurement[] = [];
  times.forEach((t, k) => {
    const [x, y, z] = pos[k]!;
    const r = Math.hypot(x, y, z);
    const seg = thrust.find((c) => t >= c.t0 && t < c.t1);
    // The ship is turned to a burn's attitude before it starts and stays there afterwards.
    const q = (thrust.find((c) => c.t1 > t) ?? thrust.at(-1))?.q ?? quat.IDENTITY;
    const phi = quat.toRotationVector(q);
    const el = Math.atan2(-z, Math.hypot(x, y));
    measurements.push(
      {
        kind: 'attitude',
        t,
        source: 'st',
        value: [phi.x, phi.y, phi.z],
        sigma: [3.88e-5, 3.88e-5, 3.88e-5],
      },
      {
        kind: 'bearing',
        t,
        source: 'cam',
        target: 'A',
        value: [Math.atan2(-y, -x) + rng.normal(0, sb), el],
        sigma: [sb, sb],
      },
      {
        kind: 'range',
        t,
        source: 'cam',
        target: 'A',
        value: [r + rng.normal(0, 2e-3 * r)],
        sigma: [2e-3 * r],
      },
      {
        kind: 'accel',
        t,
        source: 'imu',
        value: [seg ? seg.u : 0, 0, 0],
        sigma: [3e-5, 3e-5, 3e-5],
      },
    );
  });
  if (f.last !== undefined)
    measurements.push({
      kind: 'telemetry',
      t: f.last,
      source: 'bus',
      channel: 'bus.voltage',
      value: [28],
      sigma: [0.1],
    });
  return {
    id: f.id,
    index: f.index,
    encounterId: 'range',
    startedAt: '2026-11-14T12:00:00Z',
    start: { estimate: context().arrival, configuration: 'stowed', modelVersion: 0 },
    plans: [],
    executed: [...(f.executed ?? [])],
    forecasts: [],
    measurements,
    events: [...(f.events ?? [])],
    outcome: f.outcome,
    modelVersionAtEnd: 0,
  };
}

/** A held burn: commanded for `duration`, far longer than the key is held. */
const burn = (t: number, duration = 3600): ExecutedCommand => ({
  t,
  command: { kind: 'burn', thruster: 'main', throttle: 1, duration },
  source: 'manual',
  status: 'executed',
});
const fly = (t: number, throttle: number): ExecutedCommand => ({
  t,
  command: { kind: 'fly', input: { ...HANDS_ON_NEUTRAL, throttle } },
  source: 'manual',
  status: 'executed',
});
const cutoff = (t: number): ExecutedCommand => ({
  t,
  command: { kind: 'cutoff', thruster: 'all' },
  source: 'manual',
  status: 'executed',
});

/** The record as it stood at time `t` of the attempt: what a save or a hand-over holds. */
function soFar(rec: AttemptRecord, t: number): AttemptRecord {
  const upTo = <T extends { readonly t: number }>(list: readonly T[]) =>
    list.filter((q) => q.t <= t);
  return {
    ...rec,
    measurements: upTo(rec.measurements),
    executed: upTo(rec.executed),
    events: upTo(rec.events),
    outcome: { kind: 'in-progress' },
  };
}

/** Last time anything was recorded: where a reload closes an attempt as recalled. */
const lastTime = (rec: AttemptRecord): number =>
  Math.max(0, ...[...rec.measurements, ...rec.executed, ...rec.events].map((q) => q.t));

/** Paths of every number that is NaN or infinite. */
function notFinite(v: unknown, path = '$'): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path];
  if (v === null || typeof v !== 'object') return [];
  if (ArrayBuffer.isView(v) || Array.isArray(v))
    return Array.from(v as unknown as ArrayLike<unknown>).flatMap((q, i) =>
      notFinite(q, `${path}[${i}]`),
    );
  return Object.entries(v).flatMap(([k, q]) => notFinite(q, `${path}.${k}`));
}

const forecastAt = (svc: ModelService, t: number, plan: ExecutedCommand['command'][] = []) =>
  svc.forecast({
    id: `forecast-${t}`,
    issuedAt: t,
    plan: {
      id: 'plan',
      epoch: t,
      items: plan.map((command, i) => ({ id: `i${i}`, at: 60, command })),
    },
    massProperties,
    step: 60,
    duration: 1800,
  });

/**
 * Feed a record to the model as the game does while flying (model-bridge.ts): begin, then every
 * `piece` seconds append what was recorded and refresh, a global refit every `refitEvery`, a
 * forecast, and the final record when the attempt ends. Every call must succeed.
 */
function flyLive(svc: ModelService, rec: AttemptRecord, piece: number, refitEvery: number): void {
  const end = lastTime(rec);
  svc.beginAttempt(soFar(rec, -1));
  let lastRefit = 0;
  for (let t0 = 0; t0 <= end; t0 += piece) {
    const inPiece = <T extends { readonly t: number }>(list: readonly T[]) =>
      list.filter((q) => q.t >= t0 && q.t < t0 + piece);
    const delta = {
      measurements: inPiece(rec.measurements),
      executed: inPiece(rec.executed),
      events: inPiece(rec.events),
    };
    if (delta.measurements.length + delta.executed.length + delta.events.length === 0) continue;
    svc.append(rec.id, delta);
    if (t0 - lastRefit >= refitEvery) {
      lastRefit = t0;
      svc.refit();
    } else svc.refresh();
    expect(notFinite(svc.state), `state at ${t0} s of ${rec.id}`).toEqual([]);
  }
  const { draft } = forecastAt(svc, end);
  expect(notFinite(draft), `forecast at the end of ${rec.id}`).toEqual([]);
  if (rec.outcome.kind !== 'in-progress') svc.endAttempt(rec);
}

/** Everything in a ModelState except its version bookkeeping. */
const content = (s: ModelState) => {
  const { version: _v, parent: _p, ...rest } = s;
  return rest;
};

const coverageOf = (svc: ModelService, id: string) =>
  svc.report().coverage.find((c) => c.attempt === id)!;

// ---------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------

/**
 * (a) 100 s of coasting at r0, a burn held from 96 s and commanded for an hour, the record
 *     ending at 100 s: recalled by the reload.
 * (b) 40 s, recalled.
 * (c) a retrograde burn, then a fall to the surface of the primary: lost.
 * The camera packets fall 1.5 s before each 20 s mark, so (a)'s last fix is inside the burn.
 */
function reported() {
  const a = record({
    id: 'attempt-0001',
    index: 1,
    fixes: every(20, 100, 18.5),
    thrust: [along(96, 100, 0)],
    executed: [burn(96)],
    last: 100,
    outcome: { kind: 'recalled', t: 100 },
  });
  const b = record({
    id: 'attempt-0002',
    index: 2,
    fixes: every(20, 40, 18.5),
    last: 40,
    outcome: { kind: 'recalled', t: 40 },
  });
  const thrust = [along(200, 600, -Math.PI / 2)];
  const packets = every(20, 16000, 18.5);
  const hit = truthAt(CIRCULAR, thrust, packets).findIndex(
    ([x, y, z]) => Math.hypot(x, y, z) <= RADIUS,
  );
  const tLost = packets[hit]!;
  const c = record({
    id: 'attempt-0003',
    index: 3,
    fixes: packets.slice(0, hit),
    thrust,
    executed: [{ ...burn(200, 400), source: 'plan' }],
    events: [
      { kind: 'contact', t: tLost, with: 'A', impulse: 1e6 },
      { kind: 'ship-lost', t: tLost, cause: 'collision' },
    ],
    outcome: { kind: 'lost', t: tLost, cause: 'collision' },
  });
  return { a, b, c };
}

describe('the reported failure: a reload during a held burn, then two more attempts', () => {
  const { a, b, c } = reported();

  it('has the shape of the report', () => {
    expect(a.measurements.filter((m) => m.kind === 'range').map((m) => m.t)).toEqual([
      18.5, 38.5, 58.5, 78.5, 98.5,
    ]);
    expect(a.executed.map((e) => [e.t, e.command.kind])).toEqual([[96, 'burn']]);
    expect(lastTime(a)).toBe(100);
    expect(b.measurements.filter((m) => m.kind === 'range')).toHaveLength(2);
    // The dive ends deep in the well: its last fixes are within 15% of the surface.
    const ranges = c.measurements.filter((m) => m.kind === 'range').map((m) => m.value[0]!);
    expect(ranges.length).toBeGreaterThan(500);
    expect(ranges.at(-1)!).toBeLessThan(1.15 * RADIUS);
    expect(c.outcome.kind).toBe('lost');
  });

  it('the cause: a quarter of a three-fix arc holds one fix, which gives no velocity', () => {
    const ctx = context();
    const spec = modelSpec(ctx, []);
    const problem = tierGProblem(ctx, spec, [a]);
    expect(problem.arcs).toHaveLength(1);
    const arc = problem.arcs[0]!;
    // Three normal points: the coasting fixes of each minute, and the fix inside the burn.
    const fixes = rangeFixTimes(arc.meas, 'A');
    expect(fixes).toEqual([38.5, 78.5, 98.5]);
    const opts = { dt: spec.settings.dt, h: spec.settings.fdStep };
    const x0 = problem.params.map((p) => p.init);
    // The first quarter of the arc, as arc growing used to cut it: one fix. The solver refuses,
    // and says what is undetermined, instead of returning numbers.
    const quarter = fixes[0]! + 0.25 * (fixes[2]! - fixes[0]!);
    const cut = new Problem(problem.structure, [arc], problem.params, {
      ...opts,
      tmax: new Map([[arc.id, quarter]]),
    });
    expect(cut.m).toBe(2);
    expect(() => cut.solve(x0)).toThrow(
      'fit: the data do not determine attempt-0001.ship.vx, attempt-0001.ship.vy',
    );
    // Arc growing now leaves the arc the three fixes that determine it.
    const fit = stagedFit(problem.structure, [arc], problem.params, opts);
    expect(fit.converged).toBe(true);
    expect(notFinite([fit.x, fit.P.data, fit.chi2])).toEqual([]);
    expect(fit.m).toBe(8);
  });

  it(
    'every call succeeds in flight, after the reload and after the dive; a rebuild equals the live model',
    { timeout: 120_000 },
    () => {
      // Attempt 1 in flight, fed once a second. The burn is open when the page reloads.
      const first = new ModelService(context());
      first.load({ attempts: [] });
      flyLive(first, soFar(a, 100), 1, 60);
      expect(
        first.snapshot.derived.problem.builds.get(a.id)!.burns.map((q) => [q.t0, q.t1]),
      ).toEqual([[96, 100]]);
      const atReload = first.refit();
      expect(atReload.basedOn.attempts).toEqual([a.id]);

      // The reload: a new model, rebuilt from Black Box, where attempt 1 is now recalled. It
      // is the model the live one had reached.
      const live = new ModelService(context());
      const restored = live.load({ attempts: [a] });
      expect(restored.version).toBe(1);
      expect(restored.basedOn.attempts).toEqual([a.id]);
      expect(restored.fit!.converged).toBe(true);
      expect(hashState(content(restored))).toBe(hashState(content(atReload)));

      // Attempt 2: 40 s, two fixes. It is left out, and the report says why.
      flyLive(live, b, 1, 60);
      expect(live.state.version).toBe(2);
      expect(live.state.basedOn.attempts).toEqual([a.id]);
      expect(coverageOf(live, b.id)).toMatchObject({
        used: false,
        missing: expect.arrayContaining([
          'no fittable tracking (fewer than 3 range fixes on the primary)',
        ]),
      });

      // Attempt 3: the dive, at time warp, refitted in flight, lost at the surface.
      flyLive(live, c, 200, 2000);
      const state = live.state;
      expect(state.version).toBe(2 + 5 + 1);
      expect(state.basedOn.attempts).toEqual([a.id, c.id]);
      expect(state.fit!.converged).toBe(true);
      expect(state.fit!.chi2 / state.fit!.nu).toBeLessThan(1.3);
      expect(state.calibration[0]!.windows.length).toBeGreaterThan(3);
      const mu = state.parameters.find((p) => p.id === 'body.A.mu')!;
      expect(Math.abs(mu.value - MU)).toBeLessThan(3 * mu.sigma);
      expect(mu.support).toBeGreaterThan(0.9);
      expect(notFinite([state, live.report()])).toEqual([]);

      // A reload now rebuilds from all three records and reaches the same state (D7).
      const rebuilt = new ModelService(context());
      rebuilt.load({ attempts: JSON.parse(JSON.stringify([a, b, c])) as AttemptRecord[] });
      expect(hashState(content(rebuilt.state))).toBe(hashState(content(state)));
      expect(rebuilt.report().coverage.map((q) => [q.attempt, q.used])).toEqual([
        [a.id, true],
        [b.id, false],
        [c.id, true],
      ]);

      // Half-way down the dive the forecast stands on Tier L, not on the arrival estimate.
      const mid = new ModelService(context());
      mid.load({ attempts: [a, b] });
      mid.beginAttempt(soFar(c, 6000));
      mid.refresh();
      const dive = forecastAt(mid, 6000);
      expect(dive.detail.presentSource).toBe('anchor');
      expect(dive.draft.samples.length).toBeGreaterThan(5);
      expect(dive.draft.modelVersion).toBe(1);
      expect(notFinite(dive.draft)).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// The family: every way a short or cut-off attempt can look
// ---------------------------------------------------------------------------------------------

describe('attempts too short to determine a path are left out, with the reason', () => {
  const recalled = (id: string, fixes: readonly number[]): AttemptRecord =>
    record({ id, index: 1, fixes, last: 100, outcome: { kind: 'recalled', t: 100 } });
  const oneTime = (() => {
    // Three cameras report the same fix at one time: three fixes, one instant.
    const r = recalled('one-instant', [50]);
    const fix = r.measurements.filter((m) => m.kind === 'bearing' || m.kind === 'range');
    const again = (source: string) => fix.map((m) => ({ ...m, source }));
    return { ...r, measurements: [...r.measurements, ...again('cam2'), ...again('cam3')] };
  })();

  it.each([
    ['no fix at all', recalled('none', [])],
    ['one fix', recalled('one', [20])],
    ['two fixes', recalled('two', [20, 80])],
    ['three fixes at one instant', oneTime],
  ] as const)(
    '%s: not fitted, nothing fails, the forecast starts from the arrival state',
    (_n, rec) => {
      for (const settings of [{}, { normalPointInterval: 0 }]) {
        const svc = new ModelService(context({ settings }));
        const state = svc.load({ attempts: [rec] });
        expect(state.version).toBe(1);
        expect(state.basedOn.attempts).toEqual([]);
        expect(state.fit).toBeUndefined();
        expect(coverageOf(svc, rec.id)).toMatchObject({ used: false });
        expect(coverageOf(svc, rec.id).missing[0]).toMatch(/fewer than 3 range fixes/);
        expect(notFinite([state, svc.report()])).toEqual([]);
        // Flown live, the same.
        const live = new ModelService(context({ settings }));
        flyLive(live, rec, 1, 60);
        expect(hashState(content(live.state))).toBe(hashState(content(state)));
        // The next attempt still gets a forecast, from the best state there is.
        svc.beginAttempt({ ...soFar(rec, 30), id: 'next', index: 2 });
        svc.refresh();
        const { draft, detail } = forecastAt(svc, 30);
        expect(detail.presentSource).toBe('arrival');
        expect(draft.samples.length).toBeGreaterThan(10);
        expect(notFinite(draft)).toEqual([]);
      }
    },
  );

  it('a skipped stretch carries its reason', () => {
    const built = arcsFromRecord(recalled('two', [20, 80]), {
      ship: testShip(MASS, THRUST),
      settings: resolveSettings(),
      bodies: ['A'],
      primary: 'A',
    });
    expect(built.arcs).toEqual([]);
    expect(built.skipped).toEqual([
      {
        arc: 'two',
        reason: '2 range fixes on the primary, 3 at different times are needed to fit a path',
      },
    ]);
  });

  it('from three fixes on, an attempt is fitted, however short', () => {
    // One fix a minute, so the count of fixes is the count of normal points.
    for (let n = 3; n <= 9; n++) {
      const rec = record({
        id: `coast-${n}`,
        index: 1,
        fixes: every(60, 60 * n),
        outcome: { kind: 'recalled', t: 60 * n },
      });
      const svc = new ModelService(context());
      const state = svc.load({ attempts: [rec] });
      expect(state.basedOn.attempts, `${n} fixes`).toEqual([rec.id]);
      expect(state.fit!.converged, `${n} fixes`).toBe(true);
      expect(coverageOf(svc, rec.id).used).toBe(true);
      expect(notFinite([state, svc.report()]), `${n} fixes`).toEqual([]);
      const live = new ModelService(context());
      flyLive(live, rec, 20, 120);
      expect(hashState(content(live.state)), `${n} fixes, live`).toBe(hashState(content(state)));
    }
  });
});

describe('thrust never runs past the end of its record', () => {
  const adaptCtx = {
    ship: testShip(MASS, THRUST),
    settings: resolveSettings(),
    bodies: ['A'],
    primary: 'A',
  };
  const cutOff = (id: string, command: ExecutedCommand): AttemptRecord =>
    record({
      id,
      index: 1,
      fixes: every(20, 100, 18.5),
      thrust: [along(96, 100, 0)],
      executed: [command],
      last: 100,
      outcome: { kind: 'recalled', t: 100 },
    });

  it.each([
    ['a held burn commanded for an hour', burn(96, 3600)],
    ['a held burn commanded for thirty years', burn(96, 1e9)],
    ['a held burn with no end', burn(96, Infinity)],
    ['a hands-on throttle left open', fly(96, 1)],
  ] as const)('%s stops at the last thing recorded', (_name, command) => {
    const closed = cutOff('cut', command);
    // Until something is recorded after the command, there is no thrust on record.
    expect(arcsFromRecord(soFar(closed, 97), adaptCtx).burns).toEqual([]);
    // In flight the burn is open; the arcs are those a reload would rebuild at that moment.
    for (const t of [98.5, 100]) {
      const open = soFar(closed, t);
      const live = arcsFromRecord(open, adaptCtx);
      expect(live.burns.map((q) => [q.t0, q.t1])).toEqual([[96, t]]);
      const reloaded = arcsFromRecord(
        { ...open, outcome: { kind: 'recalled', t: lastTime(open) } },
        adaptCtx,
      );
      expect(live).toEqual(reloaded);
      for (const arc of live.arcs)
        for (const seg of arc.commands) expect(seg.t1).toBeLessThanOrEqual(lastTime(open));
    }
    // Loaded, and flown live with the burn open at every hand-over: the same model.
    const svc = new ModelService(context());
    const state = svc.load({ attempts: [closed] });
    expect(state.basedOn.attempts).toEqual([closed.id]);
    expect(notFinite(state)).toEqual([]);
    const live = new ModelService(context());
    flyLive(live, closed, 1, 60);
    expect(hashState(content(live.state))).toBe(hashState(content(state)));
  });

  it('a burn with no end, executed or planned, does not hold up a forecast', () => {
    const rec = record({
      id: 'held',
      index: 1,
      fixes: every(20, 400, 18.5),
      thrust: [along(96, 400, 0)],
      executed: [burn(96, Infinity)],
      outcome: { kind: 'in-progress' },
    });
    const svc = new ModelService(context());
    svc.beginAttempt(rec);
    svc.refresh();
    svc.refit();
    expect(svc.state.basedOn.attempts).toEqual([rec.id]);
    const coasting = forecastAt(svc, 400);
    const thrusting = forecastAt(svc, 400, [
      { kind: 'burn', thruster: 'main', throttle: 1, duration: Infinity },
    ]);
    for (const f of [coasting, thrusting]) {
      expect(f.draft.samples.length).toBeGreaterThan(10);
      // (The plan is the caller's own, endless burn included.)
      expect(notFinite({ ...f.draft, inputs: { ...f.draft.inputs, plan: null } })).toEqual([]);
    }
    // The executed burn runs on in the forecast as commanded (it is still held).
    const speed = (f: typeof coasting) =>
      Math.hypot(f.draft.samples.at(-1)!.velocity.x, f.draft.samples.at(-1)!.velocity.y);
    expect(speed(coasting)).toBeGreaterThan(100 + 0.5 * U * 1800);
    // Once the attempt has ended, nothing thrusts past its end.
    svc.endAttempt({ ...rec, outcome: { kind: 'recalled', t: 400 } });
    expect(speed(forecastAt(svc, 400))).toBeLessThan(speed(coasting) - 0.5 * U * 1800);
  });

  it('a burn with no fix after it, and one that begins before the first fix', () => {
    const noFixAfter = record({
      id: 'no-fix-after',
      index: 1,
      fixes: every(20, 180, 18.5),
      thrust: [along(182, 190, 0)],
      executed: [burn(182), cutoff(190)],
      last: 195,
      outcome: { kind: 'recalled', t: 195 },
    });
    // Thrust from 5 s: the accelerometer bins start before the first normal point's mean time.
    const fromTheStart = record({
      id: 'from-the-start',
      index: 2,
      fixes: every(20, 190, 18.5),
      thrust: [along(5, 200, 0)],
      executed: [burn(5)],
      last: 200,
      outcome: { kind: 'recalled', t: 200 },
    });
    for (const rec of [noFixAfter, fromTheStart]) {
      const { arcs } = arcsFromRecord(rec, adaptCtx);
      expect(arcs).toHaveLength(1);
      const times = arcs[0]!.meas.map((m) => m.t);
      // An arc's measurements are in time order and its epoch is the first of them (§3.5).
      expect(times).toEqual([...times].sort((p, q) => p - q));
      expect(arcs[0]!.epoch).toBe(times[0]);
      const svc = new ModelService(context());
      const state = svc.load({ attempts: [rec] });
      expect(state.basedOn.attempts, rec.id).toEqual([rec.id]);
      expect(state.fit!.converged, rec.id).toBe(true);
      expect(notFinite(state), rec.id).toEqual([]);
      const live = new ModelService(context());
      flyLive(live, rec, 1, 60);
      expect(hashState(content(live.state)), rec.id).toBe(hashState(content(state)));
    }
  });

  it('coasting fixes on either side of a short burn are not averaged together', () => {
    const fix = (t: number): EstMeasurement => ({
      kind: 'opnav',
      t,
      target: 'A',
      z: [0.001 * t, 1e6 + t],
      sigma: [4e-5, 2000],
    });
    const tap: Burn = { index: 0, thruster: 'main', t0: 30, t1: 40, throttle: 1, limited: false };
    // 17.5 s before the tap, 37.5 s during it, 57.5 s after: one minute, three phases. Averaging
    // the two coasting fixes would put a second point at 37.5 s, on top of the powered one.
    const points = normalPoints([fix(17.5), fix(37.5), fix(57.5)], [tap], 60);
    expect(points.map((p) => p.t)).toEqual([17.5, 37.5, 57.5]);
    // Without a burn between them they are one normal point.
    expect(normalPoints([fix(17.5), fix(37.5), fix(57.5)], [], 60).map((p) => p.t)).toEqual([37.5]);
    // A record of that shape: taps of thrust between fixes, 90 s long. It is fitted.
    const rec = record({
      id: 'taps',
      index: 1,
      fixes: every(20, 90, 17.5),
      thrust: [along(30, 40, 0)],
      executed: [fly(30, 1), fly(40, 0)],
      last: 90,
      outcome: { kind: 'recalled', t: 90 },
    });
    const svc = new ModelService(context());
    const state = svc.load({ attempts: [rec] });
    expect(state.basedOn.attempts).toEqual([rec.id]);
    expect(notFinite(state)).toEqual([]);
  });
});

describe('random short attempts (the whole family at once)', () => {
  it('none fails, none gives a number that is not finite', { timeout: 120_000 }, () => {
    const rng = createRng('short-attempts').stream('random');
    for (let i = 0; i < 150; i++) {
      const end = Math.round(rng.range(0, 420) * 2) / 2;
      const fixes = every(rng.pick([20, 20, 20, 10, 60, 1]), end, Math.round(rng.range(0, 40)) / 2);
      const style = rng.pick(['coast', 'burn', 'fly', 'burn left open', 'fly left open']);
      const executed: ExecutedCommand[] = [];
      const thrust: ThrustSegment[] = [];
      for (let t = rng.range(0, 60); style !== 'coast' && t < end;) {
        const open = style.endsWith('open') && rng.chance(0.4);
        const t1 = open ? end : Math.min(end, t + rng.pick([0.5, 4, 4, 25, 90]));
        if (t1 > t) thrust.push(along(t, t1, 0));
        if (style.startsWith('burn')) executed.push(burn(t, rng.pick([3600, 1e9, Infinity])));
        else executed.push(fly(t, 1));
        if (open) break;
        executed.push(style.startsWith('burn') ? cutoff(t1) : fly(t1, 0));
        t = t1 + rng.range(0, 120);
      }
      const ending = rng.pick(['recalled', 'recalled', 'in progress', 'lost']);
      const events: ShipEvent[] = [];
      if (rng.chance(0.2)) events.push({ kind: 'contact', t: rng.range(0, end), impulse: 10 });
      if (ending === 'lost') events.push({ kind: 'ship-lost', t: end, cause: 'collision' });
      const rec = record({
        id: `random-${i}`,
        index: 1,
        fixes,
        thrust,
        executed: executed.filter((q) => q.t <= end),
        events,
        last: end,
        outcome:
          ending === 'in progress'
            ? { kind: 'in-progress' }
            : ending === 'lost'
              ? { kind: 'lost', t: end, cause: 'collision' }
              : { kind: 'recalled', t: end },
      });
      const label = `${rec.id}: ${style}, ${ending}, ${fixes.length} fixes in ${end} s`;
      const svc = new ModelService(context());
      if (ending === 'in progress') {
        svc.beginAttempt(rec);
        svc.refresh();
        svc.refit();
      } else svc.load({ attempts: [rec] });
      const { draft } = forecastAt(svc, end);
      const all = [svc.state, draft, svc.report(), svc.burns(), svc.empirical()];
      expect(notFinite(all), label).toEqual([]);
      // Nothing here is a bad record: an attempt is either fitted or too short, never refused.
      expect([...svc.snapshot.derived.unusable], label).toEqual([]);
      expect(svc.report().fitFailure, label).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The model as a whole: one bad attempt never stops it
// ---------------------------------------------------------------------------------------------

describe('one bad attempt never stops the model', () => {
  const hour = (id: string, index: number): AttemptRecord =>
    record({ id, index, fixes: every(20, 3600, 18.5), outcome: { kind: 'recalled', t: 3600 } });
  const good1 = hour('good-1', 1);
  const good2 = hour('good-2', 3);
  /** A record with one range that is not a number (a corrupted save, a sensor fault). */
  const bad: AttemptRecord = (() => {
    const r = hour('bad', 2);
    const k = r.measurements.findIndex((m) => m.kind === 'range' && m.t > 1800);
    return {
      ...r,
      measurements: r.measurements.map((m, i) => (i === k ? { ...m, value: [NaN] } : m)),
    };
  })();

  it('it is left out with the reason, the others are fitted, and nothing is NaN', () => {
    const svc = new ModelService(context());
    const state = svc.load({ attempts: [good1, bad, good2] });
    expect(state.version).toBe(1);
    expect(state.basedOn.attempts).toEqual([good1.id, good2.id]);
    expect(state.fit!.converged).toBe(true);
    expect(notFinite([state, svc.report()])).toEqual([]);
    expect([...svc.snapshot.derived.unusable.keys()]).toEqual([bad.id]);
    // The report (what the console shows) says which attempt, and why.
    expect(svc.report().fitFailure).toBeNull();
    expect(coverageOf(svc, bad.id)).toMatchObject({
      used: false,
      missing: expect.arrayContaining([
        'not used by the model: fit: a measurement or a prediction is not a finite number',
      ]),
    });
    expect(coverageOf(svc, good1.id)).toMatchObject({ used: true, missing: [] });
    // The numbers are those of the good attempts alone.
    const alone = new ModelService(context()).load({ attempts: [good1, good2] });
    expect(state.parameters).toEqual(alone.parameters);
    expect(state.calibration).toEqual(alone.calibration);
    const mu = state.parameters.find((p) => p.id === 'body.A.mu')!;
    expect(Math.abs(mu.value - MU)).toBeLessThan(3 * mu.sigma);

    // Flown live in the same order, the model reaches the same state (D7).
    const live = new ModelService(context());
    for (const rec of [good1, bad, good2]) flyLive(live, rec, 600, 1800);
    // One refit in flight and one at the end of each attempt, the bad one included.
    expect(live.state.version).toBe(6);
    expect(hashState(content(live.state))).toBe(hashState(content(state)));
  });

  it('when the attempt in progress is the bad one, refresh and forecast still work', () => {
    const svc = new ModelService(context());
    svc.load({ attempts: [good1] });
    svc.beginAttempt(soFar(bad, 3000));
    const state = svc.refresh();
    expect(state.basedOn.attempts).toEqual([good1.id]);
    expect(svc.snapshot.derived.unusable.has(bad.id)).toBe(true);
    // The best state the model has for it is the arrival estimate.
    const { draft, detail } = forecastAt(svc, 3000);
    expect(detail.presentSource).toBe('arrival');
    expect(draft.samples.length).toBeGreaterThan(10);
    expect(notFinite([state, draft])).toEqual([]);
    // Before the bad fix was recorded, the same attempt was usable.
    const earlier = new ModelService(context());
    earlier.load({ attempts: [good1] });
    earlier.beginAttempt(soFar(bad, 1500));
    earlier.refresh();
    expect(earlier.snapshot.derived.unusable.size).toBe(0);
    expect(forecastAt(earlier, 1500).detail.presentSource).toBe('anchor');
    // Ending it and flying on works; the verdict follows the record, not the call order.
    svc.endAttempt(bad);
    flyLive(svc, good2, 600, 1800);
    expect(svc.state.basedOn.attempts).toEqual([good1.id, good2.id]);
  });

  it('a rule test on it fails with a plain message and leaves the model as it was', () => {
    const svc = new ModelService(context());
    const state = svc.load({ attempts: [good1, bad, good2] });
    expect(() => svc.testExtension('distance-law', [good1.id], bad.id)).toThrow(
      'held-out attempt bad has no fittable arc',
    );
    expect(svc.state).toBe(state);
    expect(svc.extensions).toEqual([]);
    // With the good attempts the test runs.
    const test = svc.testExtension('distance-law', [good1.id], good2.id);
    expect(test.state.validation!.heldOutAttempt).toBe(good2.id);
    expect(svc.state.version).toBe(state.version);
  });

  it('a global fit that cannot be solved holds the priors, keeps Tier L, says why, and recovers', () => {
    const healthy = new ModelService(context());
    const fitted = healthy.load({ attempts: [good1, good2] });
    expect(fitted.fit!.converged).toBe(true);
    const svc = new ModelService(context());
    injected.jointFitFails = true;
    try {
      // The call succeeds: a new version, no global fit, and the reason in the report.
      const held = svc.load({ attempts: [good1, good2] });
      expect(held.version).toBe(1);
      expect(held.fit).toBeUndefined();
      expect(svc.report().fitFailure).toBe('fit: injected failure of the joint fit');
      // No attempt is to blame, so none is left out: each is fitted on its own.
      expect(held.basedOn.attempts).toEqual([good1.id, good2.id]);
      expect(svc.snapshot.derived.unusable.size).toBe(0);
      expect(svc.report().coverage.every((q) => q.used)).toBe(true);
      for (const id of [good1.id, good2.id])
        expect(svc.snapshot.derived.solutions.get(id)!.P).not.toBeNull();
      // The numbers are the arrival priors and say so (§11.2: only a converged Tier G becomes
      // the reference law).
      const mu = held.parameters.find((p) => p.id === 'body.A.mu')!;
      expect(mu).toMatchObject({ value: 1.02e10, sigma: 3e8, support: 0 });
      // Tier L does not wait for Tier G: the strength table is there, on the same windows.
      expect(held.calibration[0]!.windows.map((w) => [w.start, w.end])).toEqual(
        fitted.calibration[0]!.windows.map((w) => [w.start, w.end]),
      );
      expect(notFinite([held, svc.report()])).toEqual([]);
      // A forecast is available, from the last attempt's Tier L state.
      const { draft, detail } = forecastAt(svc, 3600);
      expect(detail.presentSource).toBe('anchor');
      expect(draft.samples.length).toBeGreaterThan(10);
      expect(notFinite(draft)).toEqual([]);
      // While the cause lasts, each call still succeeds.
      expect(svc.refit().version).toBe(2);
      expect(svc.report().fitFailure).not.toBeNull();
    } finally {
      injected.jointFitFails = false;
    }
    // Nothing was poisoned: with the cause gone, the next fit is the healthy one.
    const again = svc.refit();
    expect(again.version).toBe(3);
    expect(svc.report().fitFailure).toBeNull();
    expect(again.parameters).toEqual(fitted.parameters);
    expect(again.calibration).toEqual(fitted.calibration);
  });

  it('a call that fails changes nothing: the version, the state and the decisions stay', () => {
    const svc = new ModelService(context());
    const state = svc.load({ attempts: [good1, good2] });
    expect(() => svc.adopt('distance-law')).toThrow();
    expect(() => svc.revoke('distance-law')).toThrow();
    expect(() => svc.append('nobody', {})).toThrow();
    expect(svc.state).toBe(state);
    expect(svc.decisions).toEqual([]);
    expect(svc.refit().version).toBe(state.version + 1);
  });
});

// ---------------------------------------------------------------------------------------------
// Six state numbers (spec revision 3): the same rule in three dimensions
// ---------------------------------------------------------------------------------------------

describe('six-state attempts: the same rule in three dimensions', () => {
  /** The model in three dimensions (no planar reduction). */
  const context3 = (extra: Partial<ModelContext> = {}) => context(extra, false);
  /** A burn pitched up by `pitch` (a rotation about body −y) from yaw `yaw`. */
  const pitched = (t0: number, t1: number, yaw: number, pitch: number): ThrustSegment => ({
    t0,
    t1,
    u: U,
    q: quat.multiply(quat.fromYaw(yaw), quat.fromAxisAngle({ x: 0, y: -1, z: 0 }, pitch)),
  });

  it('a quarter of a three-fix arc still holds one fix: its velocity, z included, is not determined', () => {
    const { a } = reported();
    const ctx = context3();
    const spec = modelSpec(ctx, []);
    expect(spec.planar).toBe(false);
    const problem = tierGProblem(ctx, spec, [a]);
    const arc = problem.arcs[0]!;
    const fixes = rangeFixTimes(arc.meas, 'A');
    expect(fixes).toEqual([38.5, 78.5, 98.5]);
    const opts = { dt: spec.settings.dt, h: spec.settings.fdStep };
    const x0 = problem.params.map((p) => p.init);
    const quarter = fixes[0]! + 0.25 * (fixes[2]! - fixes[0]!);
    const cut = new Problem(problem.structure, [arc], problem.params, {
      ...opts,
      tmax: new Map([[arc.id, quarter]]),
    });
    // One fix: azimuth, elevation and range.
    expect(cut.m).toBe(3);
    expect(() => cut.solve(x0)).toThrow(
      'fit: the data do not determine attempt-0001.ship.vx, attempt-0001.ship.vy, attempt-0001.ship.vz',
    );
    // Three fixes give nine numbers for the six of the state: the arc is fitted, z included.
    const fit = stagedFit(problem.structure, [arc], problem.params, opts);
    expect(fit.converged).toBe(true);
    expect(notFinite([fit.x, fit.P.data, fit.chi2])).toEqual([]);
    // Three fixes of three rows, and one accelerometer bin of three axes.
    expect(fit.m).toBe(12);
  });

  it('bearings without an elevation cannot place the ship out of the plane: the attempt is left out, with the reason', () => {
    const hour = (id: string, index: number): AttemptRecord =>
      record({ id, index, fixes: every(20, 3600, 18.5), outcome: { kind: 'recalled', t: 3600 } });
    const good = hour('good', 1);
    // The same record with its bearings reduced to an azimuth: range and azimuth are the same
    // for z and −z, so nothing decides z (a planar-era record fed to the 3D model).
    const flat: AttemptRecord = (() => {
      const r = hour('azimuth-only', 2);
      return {
        ...r,
        measurements: r.measurements.map((m) =>
          m.kind === 'bearing' ? { ...m, value: [m.value[0]!], sigma: [m.sigma[0]!] } : m,
        ),
      };
    })();
    const svc = new ModelService(context3());
    const state = svc.load({ attempts: [good, flat] });
    expect(state.basedOn.attempts).toEqual([good.id]);
    expect(state.fit!.converged).toBe(true);
    expect([...svc.snapshot.derived.unusable.keys()]).toEqual([flat.id]);
    expect(svc.snapshot.derived.unusable.get(flat.id)).toBe(
      'fit: the data do not determine azimuth-only.ship.z, azimuth-only.ship.vz',
    );
    expect(coverageOf(svc, flat.id).used).toBe(false);
    expect(notFinite([state, svc.report()])).toEqual([]);
    // The same records flown live give the same model.
    const live = new ModelService(context3());
    for (const rec of [good, flat]) flyLive(live, rec, 600, 1800);
    expect(hashState(content(live.state))).toBe(hashState(content(state)));
    // In the planar reduction the same record is fine: z is held at zero there.
    const planar = new ModelService(context());
    expect(planar.load({ attempts: [good, flat] }).basedOn.attempts).toEqual([good.id, flat.id]);
  });

  it('a record ending inside an out-of-plane burn: thrust stops at the record, rebuild equals live', () => {
    const thrust = [pitched(96, 100, 0.3, 0.5)];
    const rec = record({
      id: 'pitched',
      index: 1,
      fixes: every(20, 100, 18.5),
      thrust,
      executed: [burn(96, 3600)],
      last: 100,
      outcome: { kind: 'recalled', t: 100 },
    });
    const adapt3 = {
      ship: testShip(MASS, THRUST),
      settings: resolveSettings(),
      bodies: ['A'],
      primary: 'A',
    };
    for (const t of [98.5, 100]) {
      const open = soFar(rec, t);
      const live = arcsFromRecord(open, adapt3);
      expect(live.burns.map((q) => [q.t0, q.t1])).toEqual([[96, t]]);
      expect(live).toEqual(
        arcsFromRecord({ ...open, outcome: { kind: 'recalled', t: lastTime(open) } }, adapt3),
      );
      for (const arc of live.arcs)
        for (const seg of arc.commands) {
          expect(seg.t1).toBeLessThanOrEqual(lastTime(open));
          // The recorded attitude, out of the plane: the push has an upward part.
          expect(quat.angleBetween(seg.q, thrust[0]!.q)).toBeLessThan(1e-9);
          expect(quat.axisX(seg.q).z).toBeGreaterThan(0.4);
        }
    }
    const svc = new ModelService(context3());
    const state = svc.load({ attempts: [rec] });
    expect(state.basedOn.attempts).toEqual([rec.id]);
    expect(state.fit!.converged).toBe(true);
    expect(notFinite([state, svc.report()])).toEqual([]);
    const live = new ModelService(context3());
    flyLive(live, rec, 1, 60);
    expect(hashState(content(live.state))).toBe(hashState(content(state)));
    // A longer flight that climbs out of the plane, with forecasts on the way, never fails.
    const climb = record({
      id: 'climb',
      index: 2,
      fixes: every(20, 3600, 18.5),
      thrust: [pitched(600, 900, 1.0, 0.6)],
      executed: [burn(600, 300)],
      outcome: { kind: 'recalled', t: 3600 },
    });
    const z = truthAt(CIRCULAR, [pitched(600, 900, 1.0, 0.6)], [3600]);
    expect(Math.abs(z[0]![2])).toBeGreaterThan(1000);
    const flown = new ModelService(context3());
    flyLive(flown, climb, 300, 1200);
    const rebuilt = new ModelService(context3());
    rebuilt.load({ attempts: [climb] });
    expect(hashState(content(rebuilt.state))).toBe(hashState(content(flown.state)));
    expect(flown.state.basedOn.attempts).toEqual([climb.id]);
    const pitch = flown.state.parameters.find(
      (p) => p.id === 'thruster.main.misalignment-pitch' && p.arc === undefined,
    )!;
    expect(Math.abs(pitch.value)).toBeLessThan(3 * pitch.sigma);
  });
});
