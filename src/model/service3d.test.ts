/**
 * The game-facing model in three dimensions (spec revision 3): 1G's 3D vectors turned into Black
 * Box records (azimuth and elevation, ranges, star-tracker rotation vectors, three-axis
 * accelerometer, executed burns and hands-on `fly` commands), and a tracked asteroid on an
 * inclined orbit. Truth is used only to judge results.
 */

import { describe, expect, it } from 'vitest';
import rawForecast from '../../tests/vectors/estimator-3d/forecast-envelope-3d.json?raw';
import rawInclined from '../../tests/vectors/estimator-3d/inclined-newton-recovers-gm.json?raw';
import rawThrust from '../../tests/vectors/estimator-3d/thrust-3d-confounded.json?raw';
import {
  HANDS_ON_NEUTRAL,
  isoCov3,
  isotropicInertia,
  prismHull,
  type AttemptRecord,
  type ExecutedCommand,
  type HandsOnInput,
  type MassProperties,
  type Measurement,
  type ModelState,
  type ParameterPrior,
  type Plan,
  type ShipDefinition,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import { createRng } from '../lib/rng.ts';
import { RCS_GROUP, arcsFromRecord } from './adapt.ts';
import { compileArc, simulate, type Structure, type ThrustSegment } from './dynamics.ts';
import type { ModelContext } from './engine.ts';
import { fromRows } from './linalg.ts';
import { ModelService } from './service.ts';
import { resolveSettings, type ModelSettings } from './settings.ts';
import { mahalanobis } from './tierL.ts';
import {
  quatOf,
  testShip,
  type AttemptJson3,
  type CaseJson3,
  type VectorJson3,
} from './vector-harness.ts';

const V = (raw: string) => JSON.parse(raw) as VectorJson3;
const MASS = 30000;
const THRUST = 0.15 * MASS;
/** Nominal RCS force on each body axis for a full deflection, N. */
const RCS_FORCE = 1000;
/** "3σ" for three numbers at once. */
const CHI_3 = 3.763;

/** The test ship with RCS translation as designed (`systems.propulsion.rcs`). */
const ship: ShipDefinition = {
  ...testShip(MASS, THRUST),
  systems: {
    propulsion: {
      rcs: {
        Isp: 0,
        translationForcePerBank: {
          x: [-RCS_FORCE, RCS_FORCE],
          y: [-RCS_FORCE, RCS_FORCE],
          z: [-RCS_FORCE, RCS_FORCE],
        },
      },
    },
  },
};

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
    -1,
    1,
  ),
};

const muPrior: ParameterPrior = {
  id: 'body.A.mu',
  label: 'A μ',
  unit: 'm³/s²',
  value: 1.02e10,
  sigma: 3e8,
};

function context(
  priors: ParameterPrior[] = [muPrior],
  settings: Partial<ModelSettings> = {},
): ModelContext {
  return {
    encounterId: 'range',
    priors,
    bodies: [
      {
        id: 'A',
        name: 'A',
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        positionCov: isoCov3(1e3),
        radius: 2.5e5,
        tracked: true,
      },
    ],
    asteroids: [
      {
        id: 'rock',
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        positionCov: isoCov3(1e5),
        radius: 5e3,
        tracked: true,
      },
    ],
    ship,
    arrival: {
      t: 0,
      position: { x: 1e6, y: 0, z: 0 },
      velocity: { x: 0, y: 100, z: 0 },
      positionCov: isoCov3(1e4),
      velocityCov: isoCov3(10),
      attitude: quat.IDENTITY,
      attitudeSigma: 1e-3,
      angularVelocity: { x: 0, y: 0, z: 0 },
    },
    settings: { dt: 60, ...settings },
  };
}

const attitudeRecord = (t: number, q: quat.Quat): Measurement => {
  const phi = quat.toRotationVector(q);
  return {
    kind: 'attitude',
    t,
    source: 'st',
    value: [phi.x, phi.y, phi.z],
    sigma: [3.88e-5, 3.88e-5, 3.88e-5],
  };
};

/**
 * A 3D vector attempt as an AttemptRecord. Fixes become bearing [azimuth, elevation] and range
 * measurements; the attitude a fix carries and the attitude of each command (at its start and
 * its end) become star-tracker records; accelerometer samples keep their three axes. A command
 * with only main-engine thrust is an executed `burn`; one with RCS translation (and any
 * throttle) a hands-on `fly`, released at its end.
 */
function record3(a: AttemptJson3, index: number): AttemptRecord {
  const measurements: Measurement[] = [];
  /** [time, order at that time, record]: a segment's end before the next one's start. */
  const atts: [number, number, Measurement][] = [];
  for (const c of a.commands) {
    atts.push([c.t0, 1, attitudeRecord(c.t0, quatOf(c.q))]);
    atts.push([c.t1, 0, attitudeRecord(c.t1, quatOf(c.q))]);
  }
  for (const m of a.measurements) {
    if (m.kind === 'opnav') {
      if (m.q) atts.push([m.t, 2, attitudeRecord(m.t, quatOf(m.q))]);
      measurements.push({
        kind: 'bearing',
        t: m.t,
        source: 'cam',
        target: m.target!,
        value: [m.z[0]!, m.z[1]!],
        sigma: [m.sigma[0]!, m.sigma[1]!],
      });
      if (m.z.length > 2)
        measurements.push({
          kind: 'range',
          t: m.t,
          source: 'cam',
          target: m.target!,
          value: [m.z[2]!],
          sigma: [m.sigma[2]!],
        });
    } else
      measurements.push({
        kind: 'accel',
        t: m.t,
        source: 'imu',
        value: [m.z[0]!, m.z[1]!, m.z[2]!],
        sigma: [m.sigma[0]!, m.sigma[1]!, m.sigma[2]!],
      });
  }
  const ordered = [
    ...atts.sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((q) => q[2]),
    ...measurements,
  ]
    .map((m, i) => [m, i] as const)
    .sort((x, y) => x[0].t - y[0].t || x[1] - y[1])
    .map((q) => q[0]);
  const executed: ExecutedCommand[] = [];
  for (const c of a.commands) {
    const throttle = (c.u * MASS) / THRUST;
    if (!c.rcs) {
      executed.push({
        t: c.t0,
        command: { kind: 'burn', thruster: 'main', throttle, duration: c.t1 - c.t0 },
        source: 'plan',
        status: 'executed',
      });
      continue;
    }
    const input: HandsOnInput = {
      ...HANDS_ON_NEUTRAL,
      throttle,
      translate: {
        x: (c.rcs[0]! * MASS) / RCS_FORCE,
        y: (c.rcs[1]! * MASS) / RCS_FORCE,
        z: (c.rcs[2]! * MASS) / RCS_FORCE,
      },
    };
    executed.push({
      t: c.t0,
      command: { kind: 'fly', input },
      source: 'manual',
      status: 'executed',
    });
    executed.push({
      t: c.t1,
      command: { kind: 'fly', input: HANDS_ON_NEUTRAL },
      source: 'manual',
      status: 'executed',
    });
  }
  const end = Math.max(a.duration, ...a.measurements.map((m) => m.t));
  return {
    id: a.id,
    index,
    encounterId: 'range',
    startedAt: '2026-11-14T12:00:00Z',
    start: { estimate: context().arrival, configuration: 'stowed', modelVersion: 0 },
    plans: [],
    executed: executed.sort((x, y) => x.t - y.t),
    forecasts: [],
    measurements: ordered,
    events: [],
    outcome: { kind: 'recalled', t: end },
    modelVersionAtEnd: 0,
  };
}

const records = (c: CaseJson3, keep?: (m: AttemptJson3['measurements'][number]) => boolean) =>
  c.attempts.map((a, i) =>
    record3(keep ? { ...a, measurements: a.measurements.filter(keep) } : a, i + 1),
  );

/** A world parameter, or a ship calibration as used in attempt `arc`. */
const param = (s: ModelState, id: string, arc?: string) => {
  const p =
    (arc ? s.parameters.find((q) => q.id === id && q.arc === arc) : undefined) ??
    s.parameters.find((q) => q.id === id && q.arc === undefined);
  if (!p) throw new Error(`no parameter ${id}`);
  return p;
};

/** Model parameter ids against the vectors' names (spec §3.6). */
const IDS: Record<string, string> = {
  'mu.A': 'body.A.mu',
  'engine.kE': 'thruster.main.scale',
  'engine.dE': 'thruster.main.misalignment',
  'engine.dP': 'thruster.main.misalignment-pitch',
  'rcs.kR': 'thruster.rcs.scale',
  'accel.kA': 'sensor.imu.scale',
  'camera.bias.x': 'sensor.cam.bias-x',
  'camera.bias.y': 'sensor.cam.bias-y',
  'camera.bias.z': 'sensor.cam.bias',
};

function expectLikeReference(state: ModelState, expected: CaseJson3['fits'][number]['expected']) {
  for (const [ref, mine] of Object.entries(IDS)) {
    const e = expected.estimate[ref];
    if (e === undefined) continue;
    const p = param(state, mine, 'att1');
    const s = expected.sigma[ref]!;
    expect(Math.abs(p.value - e), mine).toBeLessThan(0.05 * s);
    expect(Math.abs(p.sigma / s - 1), `${mine} σ`).toBeLessThan(0.05);
  }
}

describe('Tier G in 3D through Black Box records', () => {
  it('recovers GM and holds the camera at its prior on an inclined orbit (inclined-newton-recovers-gm)', () => {
    const v = V(rawInclined);
    const c = v.cases[0]!;
    const svc = new ModelService(context());
    const state = svc.load({ attempts: records(c) });
    const e = c.fits.find((f) => f.id === 'newtonian')!.expected;
    expectLikeReference(state, e);
    expect(state.fit!.converged).toBe(true);
    expect(state.fit!.nu + state.fit!.pEff).toBe(e.m);
    const mu = param(state, 'body.A.mu');
    expect(Math.abs(mu.value - 1e10)).toBeLessThan(3 * mu.sigma);
    // §9.7: one body, one attitude, no burn: nothing turns the picture, so the camera's three
    // components stay at their prior.
    const cam = svc.report().camera!;
    expect(Math.min(...cam.principalOverPrior)).toBeGreaterThan(0.95);
    // §9.1: residuals along the track, out of the plane and in range, each about 1.
    const rs = svc.report().residualSummary;
    for (const k of ['coast.along', 'coast.normal', 'coast.range'])
      expect(Math.abs(rs[k]!.rms / e.residualSummary[k]!.rms - 1), k).toBeLessThan(1e-3);
  });

  it('both misalignment angles from a plane-change burn with three-axis accelerometer records', () => {
    const v = V(rawThrust);
    const c = v.cases.find((q) => q.id === 'out-of-plane-burn')!;
    const svc = new ModelService(
      context([muPrior], { accelBiasSigma: 0, accelEdge: 0, maxSegment: 60 }),
    );
    const state = svc.load({ attempts: records(c) });
    const e = c.fits.find((f) => f.id === 'with-accelerometer')!.expected;
    expectLikeReference(state, e);
    const report = svc.report();
    expect(report.confounding!.confounded).toBe(false);
    // The accelerometer measures the push in the body frame: both angles, as used in the
    // attempt, are known to under 5% of their prior, and nothing is confounded (§9.3).
    for (const id of ['thruster.main.misalignment', 'thruster.main.misalignment-pitch'])
      expect(param(state, id, 'att1').sigma / 0.01, id).toBeLessThan(0.05);
    const angles = report.engineAngles.find((q) => q.thruster === 'main')!;
    expect(angles.advice).toBeNull();
    expect(report.coverage[0]!.missing).toEqual([]);
  });

  it('hands-on throttle steps and RCS translation, from executed fly commands', () => {
    const v = V(rawThrust);
    const c = v.cases.find((q) => q.id === 'hands-on')!;
    const settings = { accelBiasSigma: 0, accelEdge: 0, maxSegment: 60 };
    const recs = records(c);
    // The adapter: RCS segments carry the commanded body-frame acceleration (demand × the
    // nominal force on that axis ÷ mass), the recorded attitude, and close Tier L windows.
    const built = arcsFromRecord(recs[0]!, {
      ship,
      settings: resolveSettings(settings),
      bodies: ['A'],
      primary: 'A',
    });
    const rcs = built.arcs[0]!.commands.filter((q) => q.thruster === RCS_GROUP);
    expect(rcs.map((q) => [q.t0, q.t1])).toEqual([
      [5400, 5460],
      [5460, 5520],
      [5520, 5580],
      [5580, 5640],
      [5640, 5700],
    ]);
    const vc = c.attempts[0]!.commands;
    for (const seg of rcs) {
      const cmd = vc.find((q) => q.t0 <= seg.t0 && seg.t1 <= q.t1)!;
      for (let k = 0; k < 3; k++) expect(seg.rcs![k]!).toBeCloseTo(cmd.rcs![k]!, 12);
      expect(quat.angleBetween(seg.q, quatOf(cmd.q))).toBeLessThan(1e-9);
    }
    const svc = new ModelService(context([muPrior], settings));
    const state = svc.load({ attempts: recs });
    const e = c.fits.find((f) => f.id === 'segments-modelled')!.expected;
    expectLikeReference(state, e);
    const kR = param(state, 'thruster.rcs.scale', 'att1');
    expect(Math.abs(kR.value - c.truth.values['truth.kR']!)).toBeLessThan(3 * kR.sigma);
    expect(kR.label).toBe('RCS translation scale');
    // Every window closes when anything fires (§5.1).
    const windows = state.calibration[0]!.windows;
    for (const w of windows) for (const q of vc) expect(w.end < q.t0 || w.start >= q.t1).toBe(true);
  });
});

describe('forecast in 3D through Black Box records (forecast-envelope-3d)', () => {
  const v = V(rawForecast);
  const c = v.cases[0]!;
  const recs = records(c);
  const svc = new ModelService(
    context([
      muPrior,
      { id: 'thruster.main.scale', label: 'kE', unit: '', value: 0.97, sigma: 0.003 },
      { id: 'thruster.main.misalignment', label: 'dE', unit: 'rad', value: 0.004, sigma: 0.001 },
      {
        id: 'thruster.main.misalignment-pitch',
        label: 'dP',
        unit: 'rad',
        value: 0.003,
        sigma: 0.001,
      },
    ]),
  );
  svc.load({ attempts: recs.slice(0, 2) });
  svc.beginAttempt({ ...recs[2]!, outcome: { kind: 'in-progress' } });
  svc.refresh();
  const now = c['now'] as number;
  type PlanJson = {
    commands: { t0: number; t1: number; u: number; q: number[] }[];
    checkpoints: number[];
    attitudeResolution?: { qBefore: number[]; direction: number[]; q: number[] };
  };
  const plans = c['plans'] as Record<string, PlanJson>;
  const points = c['forecasts'] as {
    plan: string;
    points: { t: number; truth: number[]; withinHorizon: boolean }[];
  }[];
  const run = (pid: string) => {
    const p = plans[pid]!;
    const ar = p.attitudeResolution;
    const plan: Plan = {
      id: `plan-${pid}`,
      epoch: now,
      items: p.commands.map((q, i) => ({
        id: `i${i}`,
        at: q.t0 - now,
        command: {
          kind: 'burn',
          thruster: 'main',
          throttle: (q.u * MASS) / THRUST,
          duration: q.t1 - q.t0,
          // The plan names a direction; the model resolves it with roll held (§3.3).
          ...(ar
            ? {
                attitude: {
                  reference: 'direction' as const,
                  direction: { x: ar.direction[0]!, y: ar.direction[1]!, z: ar.direction[2]! },
                },
              }
            : {}),
        },
      })),
    };
    return svc.forecast({
      id: `fc-${pid}`,
      issuedAt: now,
      plan,
      massProperties,
      step: 3600,
      duration: 8 * 3600,
    });
  };
  const truth = (pid: string) => points.find((f) => f.plan === pid)!.points;
  const sym = (s: readonly number[]) =>
    fromRows([
      [s[0]!, s[1]!, s[2]!],
      [s[1]!, s[3]!, s[4]!],
      [s[2]!, s[4]!, s[5]!],
    ]);

  it('the present state carries the camera misalignment (§8.1)', () => {
    const p = svc.snapshot.derived.present!;
    expect(p.source).toBe('anchor');
    expect(p.t).toBe(now);
    expect(p.camera?.ids).toEqual(['sensor.cam.bias-x', 'sensor.cam.bias-y', 'sensor.cam.bias']);
    const { draft } = run('coast');
    expect(draft.inputs.camera!.covariance.ids).toEqual(p.camera!.ids);
    expect(draft.detail?.presentSource).toBe('anchor');
    expect(draft.inputs.initial.positionCov[5]).toBeGreaterThan(0);
  });

  it('coasting: honest in three numbers at every hour, a flat ellipsoid, no hedge', () => {
    const { draft, detail } = run('coast');
    expect(draft.detail).toEqual(detail);
    const byT = new Map(draft.samples.map((s) => [s.t, s]));
    // The orbit normal of the present state (the vector's, from the same data).
    const n = (c['forecastInputs'] as { orbitNormalNow: number[] }).orbitNormalNow;
    for (const pt of truth('coast')) {
      const s = byT.get(pt.t)!;
      expect(s, `sample at ${pt.t}`).toBeDefined();
      const dev = [
        pt.truth[0]! - s.position.x,
        pt.truth[1]! - s.position.y,
        pt.truth[2]! - s.position.z,
      ];
      expect(mahalanobis(dev, sym(s.positionCov)), `t ${pt.t}`).toBeLessThan(CHI_3);
    }
    expect(detail.sigmaMajor.every((q) => q.hedge < 1e-6)).toBe(true);
    // +1 h: thin across the orbit plane, but no thinner than the picture's unknown orientation.
    const s1 = byT.get(now + 3600)!;
    const C = sym(s1.positionCov);
    const outOfPlane = Math.sqrt(
      [0, 1, 2].reduce(
        (a, i) => a + [0, 1, 2].reduce((b, j) => b + n[i]! * C.data[3 * i + j]! * n[j]!, 0),
        0,
      ),
    );
    const r = Math.hypot(s1.position.x, s1.position.y, s1.position.z);
    expect(outOfPlane).toBeLessThan(0.5 * detail.sigmaMajor[1]!.total);
    expect(outOfPlane).toBeGreaterThan(0.7 * 1e-4 * r);
  });

  it('a plane change: the burn is resolved with roll held, as the ship will fly it', () => {
    const { draft } = run('plane-change');
    const ar = plans['plane-change']!.attitudeResolution!;
    const flown = draft.inputs.plannedAttitudes!;
    expect(flown).toHaveLength(1);
    expect(flown[0]!.t).toBe(now);
    // The latest recorded attitude, turned onto the direction by the smallest rotation: the
    // vector's own resolution, and `quat.pointAlong` (src/lib), the function the game uses.
    expect(quat.angleBetween(flown[0]!.attitude, quatOf(ar.q))).toBeLessThan(1e-9);
    const [x, y, z] = ar.direction as [number, number, number];
    const before = quatOf(ar.qBefore);
    expect(
      quat.angleBetween(flown[0]!.attitude, quat.pointAlong(before, { x, y, z })),
    ).toBeLessThan(1e-12);
    // The engine terms include the pitch misalignment.
    expect(draft.inputs.engine!.covariance.ids).toContain('thruster.main.misalignment-pitch');
    // Honest across the plane change.
    const byT = new Map(draft.samples.map((s) => [s.t, s]));
    for (const pt of truth('plane-change')) {
      const s = byT.get(pt.t);
      if (!s) continue;
      const dev = [
        pt.truth[0]! - s.position.x,
        pt.truth[1]! - s.position.y,
        pt.truth[2]! - s.position.z,
      ];
      expect(mahalanobis(dev, sym(s.positionCov)), `t ${pt.t}`).toBeLessThan(CHI_3);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// A tracked rock on an inclined orbit (§8.7, §10): its track, envelope and closest approach
// ---------------------------------------------------------------------------------------------

describe('a tracked asteroid in 3D: its track, its envelope and its closest approach', () => {
  const R0 = 1e6;
  const MU = 1e10;
  const N = 2.5;
  const potential = (r: number) => -(MU * Math.pow(R0, N - 2)) / ((N - 1) * Math.pow(r, N - 1));
  const apsisSpeed = (rFrom: number, rTo: number) =>
    Math.sqrt((2 * (potential(rTo) - potential(rFrom))) / (1 - (rFrom / rTo) ** 2));
  /** A state at angle `a` in the plane of inclination `inc` and node `node` (rad), prograde. */
  const inPlane = (r: number, v: number, a: number, inc: number, node: number) => {
    const q = quat.multiply(
      quat.fromAxisAngle({ x: 0, y: 0, z: 1 }, node),
      quat.fromAxisAngle({ x: 1, y: 0, z: 0 }, inc),
    );
    const p = quat.rotate(q, { x: r * Math.cos(a), y: r * Math.sin(a), z: 0 });
    const w = quat.rotate(q, { x: -v * Math.sin(a), y: v * Math.cos(a), z: 0 });
    return [p.x, p.y, p.z, w.x, w.y, w.z] as const;
  };
  const truthAt = (state: readonly number[], times: readonly number[]) => {
    const st: Structure = {
      r0: R0,
      n: N,
      bodies: [{ id: 'A', mu: MU, state: 'gauge' }],
      ship: state as unknown as Structure['ship'],
      dynamicBodies: false,
      engine: { kE: 1, dE: 0, dP: 0 },
      kA: 1,
      camBias: [0, 0, 0],
    };
    const commands: ThrustSegment[] = [];
    return simulate(
      compileArc(st, { id: 'truth', epoch: 0, commands }, new Map()),
      [],
      times,
      15,
    ).pos.map((p) => [p[3]!, p[4]!, p[5]!] as const);
  };
  const SHIP0 = inPlane(R0, apsisSpeed(R0, 1.3 * R0), 0, 0.6, 0.35);
  const ROCK0 = inPlane(0.55 * R0, apsisSpeed(0.55 * R0, 0.7 * R0), -1.5, -0.45, 1.7);
  const STEP = 120;
  const NOW = 24000;
  const times = Array.from({ length: NOW / STEP + 1 }, (_, i) => i * STEP);
  const shipAt = truthAt(SHIP0, times);
  const rockAt = truthAt(ROCK0, times);
  const rng = createRng(3901).stream('rock');
  const sb = 4.1e-5;
  const ms: Measurement[] = [];
  times.forEach((t, k) => {
    const s = shipAt[k]!;
    const fix = (id: string, d: readonly number[]) => {
      const r = Math.hypot(d[0]!, d[1]!, d[2]!);
      const el = Math.asin(d[2]! / r) + rng.normal(0, sb);
      ms.push({
        kind: 'bearing',
        t,
        source: 'cam',
        target: id,
        value: [Math.atan2(d[1]!, d[0]!) + rng.normal(0, sb) / Math.cos(el), el],
        sigma: [sb / Math.cos(el), sb],
      });
      ms.push({
        kind: 'range',
        t,
        source: 'cam',
        target: id,
        value: [r + rng.normal(0, 2e-3 * r)],
        sigma: [2e-3 * r],
      });
    };
    fix('A', [-s[0], -s[1], -s[2]]);
    const a = rockAt[k]!;
    fix('rock', [a[0] - s[0], a[1] - s[1], a[2] - s[2]]);
  });
  const rec: AttemptRecord = {
    id: 'att1',
    index: 1,
    encounterId: 'range',
    startedAt: '2026-11-14T13:00:00Z',
    start: { estimate: context().arrival, configuration: 'stowed', modelVersion: 0 },
    plans: [],
    executed: [],
    forecasts: [],
    measurements: ms,
    events: [],
    outcome: { kind: 'in-progress' },
    modelVersionAtEnd: 0,
  };
  const svc = new ModelService(context([muPrior]));
  svc.load({ attempts: [] });
  svc.beginAttempt(rec);
  svc.refresh();
  const HOURS = 6;
  const { draft, detail } = svc.forecast({
    id: 'rock-forecast',
    issuedAt: NOW,
    plan: { id: 'coast', epoch: NOW, items: [] },
    massProperties,
    step: 600,
    duration: HOURS * 3600,
  });
  const fTimes = draft.samples.map((s) => s.t);
  const shipTrue = truthAt(SHIP0, fTimes);
  const rockTrue = truthAt(ROCK0, fTimes);
  const sym = (s: readonly number[]) =>
    fromRows([
      [s[0]!, s[1]!, s[2]!],
      [s[1]!, s[3]!, s[4]!],
      [s[2]!, s[4]!, s[5]!],
    ]);

  it('the scenario is three-dimensional: the two orbits are inclined against each other', () => {
    const n = (s: readonly number[]) => {
      const c = [
        s[1]! * s[5]! - s[2]! * s[4]!,
        s[2]! * s[3]! - s[0]! * s[5]!,
        s[0]! * s[4]! - s[1]! * s[3]!,
      ];
      const l = Math.hypot(...c);
      return c.map((x) => x / l);
    };
    const a = n(SHIP0);
    const b = n(ROCK0);
    expect(Math.acos(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!)).toBeGreaterThan(0.5);
  });

  it('the rock is forecast: in the objects, in the detail, with an honest 3D envelope', () => {
    const note = detail.asteroids.find((q) => q.id === 'rock')!;
    expect(note.forecast).toBe(true);
    expect(draft.detail!.asteroids).toEqual(detail.asteroids);
    const track = draft.objects.find((o) => o.id === 'rock')!;
    expect(track.samples.length).toBeGreaterThan(10);
    for (const s of track.samples) {
      const k = fTimes.indexOf(s.t);
      const t = rockTrue[k]!;
      // Track positions are in the believed frame, which here is the primary's (at rest).
      const dev = [t[0] - s.position.x, t[1] - s.position.y, t[2] - s.position.z];
      expect(mahalanobis(dev, sym(s.positionCov)), `rock at ${s.t}`).toBeLessThan(CHI_3);
      expect(s.positionCov[5]).toBeGreaterThan(0);
    }
  });

  it('its closest approach: clearance against the truth within its σ, the hull reach in 3D', () => {
    const ca = draft.closestApproaches.find((q) => q.id === 'rock')!;
    expect(ca).toBeDefined();
    const track = draft.objects.find((o) => o.id === 'rock')!;
    const inside = new Set(track.samples.map((s) => s.t));
    let best = Infinity;
    fTimes.forEach((t, k) => {
      if (!inside.has(t)) return;
      const s = shipTrue[k]!;
      const r = rockTrue[k]!;
      best = Math.min(best, Math.hypot(s[0] - r[0], s[1] - r[1], s[2] - r[2]));
    });
    // The hull's farthest corner: (5, 2, 1) from the centre of mass.
    const reach = Math.hypot(5, 2, 1);
    const trueClearance = best - 5e3 - reach;
    expect(ca.sigma).toBeGreaterThan(0);
    expect(Math.abs(ca.distance - trueClearance)).toBeLessThan(3 * ca.sigma + 2000);
    // The ship's own samples are honest too.
    draft.samples.forEach((s, k) => {
      const t = shipTrue[k]!;
      const dev = [t[0] - s.position.x, t[1] - s.position.y, t[2] - s.position.z];
      expect(mahalanobis(dev, sym(s.positionCov)), `ship at ${s.t}`).toBeLessThan(CHI_3);
    });
  });
});
