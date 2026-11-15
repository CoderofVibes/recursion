/**
 * The game-facing model (records → Tier G/L → ModelState → forecasts → extensions), checked on
 * 1G's vectors turned into Black Box records: separate bearing and range measurements, burns as
 * executed commands, attitude from star-tracker records. Truth is used only to judge results.
 */

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import rawBurn from '../../tests/vectors/estimator/burn-only-confounded.json?raw';
import rawValidation from '../../tests/vectors/estimator/extension-validation.json?raw';
import rawForecast from '../../tests/vectors/estimator/forecast-envelope.json?raw';
import rawNewton from '../../tests/vectors/estimator/newton-recovers-gm.json?raw';
import { fixtures } from '../contracts/fixtures/index.ts';
import {
  HANDS_ON_NEUTRAL,
  cov3FromPlanar,
  isotropicInertia,
  prismHull,
  type AttemptRecord,
  type BelievedBody,
  type ExecutedCommand,
  type MassProperties,
  type ModelState,
  type ParameterPrior,
  type Plan,
} from '../contracts/index.ts';
import { hashState } from '../lib/hash.ts';
import * as quat from '../lib/quat.ts';
import { arcsFromRecord, burnsFromExecuted, handsOnThrust, mainEngineOf } from './adapt.ts';
import { createModelClient } from './client.ts';
import { contextFromBriefing, type ModelContext } from './engine.ts';
import { fromRows } from './linalg.ts';
import { ModelService } from './service.ts';
import { resolveSettings, type ModelSettings } from './settings.ts';
import { mahalanobis } from './tierL.ts';
import { recordFromAttempt, testShip, type VectorJson } from './vector-harness.ts';

const V = (raw: string) => JSON.parse(raw) as VectorJson;
const MASS = 30000;

function body(id: string, x = 0, y = 0, posSigma = 1e3): BelievedBody {
  return {
    id,
    name: id,
    position: { x, y, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    positionCov: cov3FromPlanar([posSigma ** 2, 0, posSigma ** 2]),
    radius: id === 'A' ? 2.5e5 : 1.6e5,
    tracked: true,
  };
}

const muPrior = (id: string, value = 1.02e10, sigma = 3e8): ParameterPrior => ({
  id: `body.${id}.mu`,
  label: `${id} μ`,
  unit: 'm³/s²',
  value,
  sigma,
});

function context(opts: {
  thrust?: number;
  priors?: ParameterPrior[];
  bodies?: BelievedBody[];
  settings?: Partial<ModelSettings>;
}): ModelContext {
  return {
    encounterId: 'range',
    priors: opts.priors ?? [muPrior('A')],
    bodies: opts.bodies ?? [body('A')],
    ship: testShip(MASS, opts.thrust ?? 150),
    arrival: {
      t: 0,
      position: { x: 1e6, y: 0, z: 0 },
      velocity: { x: 0, y: 100, z: 0 },
      positionCov: cov3FromPlanar([1e8, 0, 1e8]),
      velocityCov: cov3FromPlanar([100, 0, 100]),
      attitude: quat.fromYaw(0),
      attitudeSigma: 1e-3,
      angularVelocity: { x: 0, y: 0, z: 0 },
    },
    settings: { dt: 60, planar: 1, ...(opts.settings ?? {}) },
  };
}

const records = (v: VectorJson, caseId: string | number, thrust = 150): AttemptRecord[] => {
  const c = typeof caseId === 'number' ? v.cases[caseId]! : v.cases.find((q) => q.id === caseId)!;
  return c.attempts.map((a, i) =>
    recordFromAttempt(a, i + 1, { encounterId: 'range', mass: MASS, thrust }),
  );
};

/** A world parameter, or a ship calibration's arrival value. */
const param = (s: ModelState, id: string) => {
  const p = s.parameters.find((q) => q.id === id && q.arc === undefined);
  if (!p) throw new Error(`no parameter ${id}`);
  return p;
};

// The scenarios in this file are planar (z = 0, yaw-only attitude, flat hull): the model runs
// them in the planar reduction (`planar: 1`, spec Appendix A.3), as the planar model did.
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

/** Everything in a ModelState except its version bookkeeping. */
const content = (s: ModelState) => {
  const { version: _v, parent: _p, ...rest } = s;
  return rest;
};

describe('game layer against the vectors', () => {
  it('recovers GM from records as the reference does (newton-recovers-gm)', () => {
    const v = V(rawNewton);
    const svc = new ModelService(context({}));
    const state = svc.load({ attempts: records(v, 0) });
    const e = v.cases[0]!.fits[0]!.expected;
    const mu = param(state, 'body.A.mu');
    expect(Math.abs(mu.value - e.estimate['mu.A']!)).toBeLessThan(0.05 * e.sigma['mu.A']!);
    expect(Math.abs(mu.sigma / e.sigma['mu.A']! - 1)).toBeLessThan(0.05);
    expect(state.fit!.converged).toBe(true);
    expect(state.basedOn.attempts).toEqual(['att1']);
    expect(mu.support).toBeGreaterThan(0.99);
  });

  it('rebuilds thrust segments and accelerometer records from executed burns (burn-plus-accel)', () => {
    const v = V(rawBurn);
    const svc = new ModelService(
      context({ settings: { accelBiasSigma: 0, accelEdge: 0, maxSegment: 60 } }),
    );
    const state = svc.load({ attempts: records(v, 'burn-plus-accel') });
    const e = v.cases.find((c) => c.id === 'burn-plus-accel')!.fits[0]!.expected;
    for (const [mine, ref] of [
      ['body.A.mu', 'mu.A'],
      ['thruster.main.scale', 'engine.kE'],
      ['thruster.main.misalignment', 'engine.dE'],
      ['sensor.imu.scale', 'accel.kA'],
    ] as const) {
      // Ship calibrations as used in the attempt (arrival value plus its deviation, §3.7).
      const p =
        state.parameters.find((q) => q.id === mine && q.arc === 'att1') ?? param(state, mine);
      expect(Math.abs(p.value - e.estimate[ref]!), mine).toBeLessThan(0.05 * e.sigma[ref]!);
      expect(Math.abs(p.sigma / e.sigma[ref]! - 1), mine).toBeLessThan(0.05);
    }
    expect(svc.report().confounding!.confounded).toBe(false);
  });

  it('turns executed hands-on throttle (fly) into main-engine burns', () => {
    const ship = testShip(MASS, 150);
    const fly = (
      t: number,
      throttle: number,
      status: ExecutedCommand['status'] = 'executed',
    ): ExecutedCommand => ({
      t,
      command: { kind: 'fly', input: { ...HANDS_ON_NEUTRAL, yaw: t === 20 ? 0.5 : 0, throttle } },
      source: 'manual',
      status,
    });
    const cutoff = (t: number, thruster: string): ExecutedCommand => ({
      t,
      command: { kind: 'cutoff', thruster },
      source: 'manual',
      status: 'executed',
    });
    const executed = [
      fly(10, 0.6), // throttle up
      fly(20, 0.6), // the controls change (yaw): the burn ends and a new one starts
      fly(30, 0), // throttle closed
      fly(35, 0.9, 'rejected'), // never reached the ship
      fly(40, 1),
      cutoff(50, 'all'),
      fly(60, 0.5, 'limited'),
      cutoff(70, 'main'),
      fly(80, 0.2), // still open: runs to the end of the record
    ];
    expect(mainEngineOf(ship)).toBe('main');
    const burns = burnsFromExecuted(executed, Infinity, handsOnThrust(ship, 100));
    expect(burns.map((b) => [b.thruster, b.t0, b.t1, b.throttle, b.limited])).toEqual([
      ['main', 10, 20, 0.6, false],
      ['main', 20, 30, 0.6, false],
      ['main', 40, 50, 1, false],
      ['main', 60, 70, 0.5, true],
      ['main', 80, 100, 0.2, false],
    ]);
    // Without a main engine to drive, hands-on input is no burn.
    expect(burnsFromExecuted(executed)).toEqual([]);
    // In a record, an open hands-on burn stops at the last thing recorded.
    const rec: AttemptRecord = {
      ...records(V(rawNewton), 0)[0]!,
      executed: [fly(80, 0.2)],
      measurements: [],
      events: [{ kind: 'recall', t: 95 }],
      outcome: { kind: 'in-progress' },
    };
    const built = arcsFromRecord(rec, {
      ship,
      settings: resolveSettings(),
      bodies: ['A'],
      primary: 'A',
    });
    expect(built.burns.map((b) => [b.t0, b.t1])).toEqual([[80, 95]]);
  });

  it('flags confounding when only burn data exist (burn-only)', () => {
    const v = V(rawBurn);
    const svc = new ModelService(context({}));
    svc.load({ attempts: records(v, 'burn-only') });
    const rep = svc.report();
    expect(rep.confounding!.confounded).toBe(true);
    expect(rep.coverage[0]!.missing).toContain('no coasting fixes');
    expect(rep.coverage[0]!.missing).toContain('no accelerometer record during burns');
  });
});

describe('forecast service (forecast-envelope through the game layer)', () => {
  const v = V(rawForecast);
  const c = v.cases[0]!;
  const recs = records(v, 0, 0.15 * MASS);
  const ctx = context({
    thrust: 0.15 * MASS,
    priors: [
      muPrior('A'),
      { id: 'thruster.main.scale', label: 'kE', unit: '', value: 0.97, sigma: 0.003 },
      { id: 'thruster.main.misalignment', label: 'dE', unit: 'rad', value: 0.004, sigma: 0.001 },
    ],
  });
  const svc = new ModelService(ctx);
  svc.load({ attempts: recs.slice(0, 2) });
  svc.beginAttempt({ ...recs[2]!, outcome: { kind: 'in-progress' } });
  svc.refresh();
  const now = c.now!;
  const plan = (pid: string): Plan => {
    const p = c.plans![pid]!;
    return {
      id: `plan-${pid}`,
      epoch: now,
      items: p.commands.map((q, i) => ({
        id: `i${i}`,
        at: q.t0 - now,
        command: {
          kind: 'burn',
          thruster: 'main',
          throttle: 1,
          duration: q.t1 - q.t0,
          attitude: { reference: 'inertial', attitude: quat.fromYaw(q.theta) },
        },
      })),
    };
  };
  const run = (pid: string) =>
    svc.forecast({
      id: `fc-${pid}`,
      issuedAt: now,
      plan: plan(pid),
      massProperties,
      step: 3600,
      duration: 8 * 3600,
    });
  const truth = (pid: string) => c.forecasts!.find((f) => f.plan === pid)!.points;

  it('present state comes from Tier L on the current attempt', () => {
    const p = svc.snapshot.derived.present!;
    expect(p.source).toBe('anchor');
    expect(p.t).toBe(now);
    const ra = c.anchor!;
    const C = fromRows(ra.covariance);
    // The present state has six numbers (x, y, z, vx, vy, vz); the planar vector's four are
    // x, y, vx, vy. In the planar reduction z and vz are exactly zero.
    const plane = [0, 1, 3, 4];
    for (let i = 0; i < 4; i++)
      expect(Math.abs(p.state[plane[i]!]! - ra.state[i]!)).toBeLessThan(
        Math.sqrt(C.data[i * 4 + i]!),
      );
    expect([p.state[2], p.state[5]]).toEqual([0, 0]);
  });

  it('coasting inside sampled distances: honest at every hour, full horizon', () => {
    const { draft, detail } = run('coast');
    const pts = truth('coast');
    const byT = new Map(draft.samples.map((s) => [s.t, s]));
    for (const p of pts) {
      const s = byT.get(p.t);
      expect(s, `sample at ${p.t}`).toBeDefined();
      const cov = fromRows([
        [s!.positionCov[0], s!.positionCov[1]],
        [s!.positionCov[1], s!.positionCov[3]],
      ]);
      expect(
        mahalanobis([p.truth[0] - s!.position.x, p.truth[1] - s!.position.y], cov),
      ).toBeLessThan(3);
      expect(s!.extrapolating).toBe(false);
    }
    expect(detail.sigmaMajor.every((q) => q.hedge < 1e-6)).toBe(true);
    expect(draft.modelVersion).toBe(svc.state.version);
    expect(draft.inputs.noiseScale).toBeGreaterThanOrEqual(1);
  });

  it('dive below sampled distances: honest until the horizon ends the line', () => {
    const { draft, detail } = run('dive');
    const pts = truth('dive');
    const byT = new Map(draft.samples.map((s) => [s.t, s]));
    let kept = 0;
    for (const p of pts) {
      const s = byT.get(p.t);
      if (!s) continue;
      kept++;
      const cov = fromRows([
        [s.positionCov[0], s.positionCov[1]],
        [s.positionCov[1], s.positionCov[3]],
      ]);
      expect(mahalanobis([p.truth[0] - s.position.x, p.truth[1] - s.position.y], cov)).toBeLessThan(
        3,
      );
    }
    expect(kept).toBeGreaterThanOrEqual(3);
    expect(draft.horizon).toBeLessThan(pts[pts.length - 1]!.t);
    expect(draft.samples.some((s) => s.extrapolating)).toBe(true);
    const deepest = detail.sigmaMajor[detail.sigmaMajor.length - 1]!;
    expect(deepest.hedge).toBeGreaterThan(Math.max(deepest.state, deepest.profile, deepest.engine));
    const a = draft.closestApproaches.find((q) => q.id === 'A')!;
    expect(a.distance).toBeLessThan(0.5e6);
  });
});

describe('rebuild from records equals the live state (P8, spec §11.3)', () => {
  // About 6 s alone; it exceeded the 5 s default when 2F's loop tests ran in parallel.
  it(
    'a live model fed in record order equals a rebuild from stored records',
    { timeout: 60_000 },
    () => {
      const v = V(rawValidation);
      const recs = records(v, 'distance-law');
      const live = new ModelService(context({}));
      live.load({ attempts: [] });
      for (const rec of recs) {
        live.beginAttempt({ ...rec, measurements: [], outcome: { kind: 'in-progress' } });
        const ms = rec.measurements;
        for (let i = 0; i < ms.length; i += 150) {
          live.append(rec.id, { measurements: ms.slice(i, i + 150) });
          live.refresh();
        }
        live.endAttempt(rec);
      }
      const stored = JSON.parse(JSON.stringify(recs)) as AttemptRecord[];
      const rebuilt = new ModelService(context({}));
      rebuilt.load({ attempts: stored });
      expect(hashState(content(rebuilt.state))).toBe(hashState(content(live.state)));
      expect(content(rebuilt.state)).toEqual(content(live.state));
      expect(live.state.version).toBe(4);
      expect(live.state.parent).toBe(3);
    },
  );
});

describe('extensions: rules only from the player (A4, P5)', () => {
  const v = V(rawValidation);

  it(
    'distance law: passes held-out, earns a hedge, is adopted only on request, can be revoked',
    { timeout: 60_000 },
    () => {
      const svc = new ModelService(context({}));
      svc.load({ attempts: records(v, 'distance-law') });
      const before = svc.state;
      expect(() => svc.adopt('distance-law')).toThrow();
      const rec = svc.testExtension('distance-law', ['att1', 'att2'], 'att3');
      const ref = v.cases
        .find((c) => c.id === 'distance-law')!
        .fits.find((f) => f.id === 'exponent')!;
      expect(rec.adoptable).toBe(true);
      expect(rec.state.status).toBe('candidate');
      expect(rec.state.validation!.verdict).toBe('better');
      expect(Math.abs(rec.state.validation!.statistic / ref.heldOut!.TperNu - 1)).toBeLessThan(
        0.02,
      );
      expect(rec.state.validation!.rmsAfter).toBeLessThan(rec.state.validation!.rmsBefore);
      // The earned hedge and the distances its test covered (§7.4).
      const eh = ref.earnedHedge as unknown as { sigmaH: number; validatedRange: [number, number] };
      expect(rec.state.validatedSpans).toHaveLength(1);
      const span = rec.state.validatedSpans![0]!;
      expect(span.body).toBe('A');
      expect(span.heldOutAttempt).toBe('att3');
      expect(Math.abs(span.sigmaE / eh.sigmaH - 1)).toBeLessThan(0.05);
      expect(Math.abs(span.rMin / eh.validatedRange[0] - 1)).toBeLessThan(1e-3);
      expect(Math.abs(span.rMax / eh.validatedRange[1] - 1)).toBeLessThan(1e-3);
      // Testing never adopts.
      expect(svc.state.parameters.some((p) => p.id === 'law.gravity.exponent')).toBe(false);
      expect(svc.state.version).toBe(before.version);
      const after = svc.adopt('distance-law');
      const n = param(after, 'law.gravity.exponent');
      expect(Math.abs(n.value - 2.5)).toBeLessThan(3 * n.sigma);
      expect(after.extensions).toEqual([
        expect.objectContaining({ id: 'distance-law', status: 'adopted' }),
      ]);
      expect(after.version).toBe(before.version + 1);
      // Inside the validated span σ_e applies; elsewhere the default stays (A5).
      expect(svc.snapshot.derived.sigmaH0).toBe(0.3);
      expect(svc.snapshot.derived.validated['A']).toEqual({
        spans: [[span.rMin, span.rMax]],
        sigmaE: span.sigmaE,
      });
      expect(after.extensions[0]!.validatedSpans).toEqual([span]);
      const revoked = svc.revoke('distance-law');
      expect(revoked.parameters.some((p) => p.id === 'law.gravity.exponent')).toBe(false);
      expect(revoked.extensions[0]!.status).toBe('revoked');
    },
  );

  it(
    'overlooked body: the wrong rule fails visibly, the right one passes',
    { timeout: 60_000 },
    () => {
      const recs = records(v, 'overlooked-body');
      const ctx = context({
        bodies: [body('A'), body('B', 4e6, 0, 1e7)],
        settings: { priorBodyVelocitySigma: 1e3 },
      });
      const svc = new ModelService(ctx);
      svc.load({ attempts: recs });
      const wrong = svc.testExtension('distance-law', ['att1', 'att2'], 'att3');
      expect(wrong.adoptable).toBe(false);
      expect(wrong.state.status).toBe('rejected');
      expect(wrong.state.validation!.verdict).toBe('worse');
      expect(() => svc.adopt('distance-law')).toThrow();
      const right = svc.testExtension('unmodeled-body:B', ['att1', 'att2'], 'att3');
      expect(right.adoptable).toBe(true);
      const mb = right.fitted!['body.B.mu']!;
      expect(Math.abs(mb.value - 2.5e9)).toBeLessThan(3 * mb.sigma);
      const s = svc.adopt('unmodeled-body:B');
      expect(param(s, 'body.B.mu').value).toBeGreaterThan(2e9);
      expect(s.fit!.nu > 0 && s.fit!.chi2 / s.fit!.nu).toBeLessThan(1.3);
    },
  );
});

describe('issued forecasts are immutable and versioned', () => {
  it('a forecast is frozen, survives later model changes and carries its model version', async () => {
    const v = V(rawForecast);
    const recs = records(v, 0, 0.15 * MASS);
    const client = createModelClient({ worker: false });
    await client.init(context({ thrust: 0.15 * MASS }));
    await client.load({ attempts: recs.slice(0, 2) });
    await client.beginAttempt({ ...recs[2]!, outcome: { kind: 'in-progress' } });
    const state = await client.refresh();
    const plan: Plan = { id: 'p', epoch: 14400, items: [] };
    const { forecast } = await client.forecast({
      id: 'f1',
      issuedAt: 14400,
      plan,
      massProperties,
      step: 600,
      duration: 3600,
    });
    expect(forecast.modelVersion).toBe(state.version);
    expect(Object.isFrozen(forecast)).toBe(true);
    expect(Object.isFrozen(forecast.samples)).toBe(true);
    expect(Object.isFrozen(forecast.samples[0]!.position)).toBe(true);
    expect(Object.isFrozen(forecast.inputs.calibration)).toBe(true);
    const before = hashState(forecast);
    expect(() => {
      (forecast.samples as unknown as { t: number }[])[0]!.t = 0;
    }).toThrow(TypeError);
    const next = await client.endAttempt(recs[2]!);
    expect(next.version).toBe(state.version + 1);
    expect(hashState(forecast)).toBe(before);
    expect(forecast.modelVersion).toBe(state.version);
    client.terminate();
  });
});

describe('fixtures (mock Gravity range)', () => {
  it('builds a model and a forecast from the contract fixtures', () => {
    const ctx = contextFromBriefing(fixtures.briefing, fixtures.shipDefinition, {
      fixedBodies: true,
    });
    const svc = new ModelService(ctx);
    const state = svc.load({ attempts: fixtures.attempts.slice(0, 1) });
    expect(
      state.parameters.every((p) => Number.isFinite(p.value) && Number.isFinite(p.sigma)),
    ).toBe(true);
    expect(state.calibration.length).toBeGreaterThan(0);
    svc.beginAttempt({ ...fixtures.attempts[1]!, outcome: { kind: 'in-progress' } });
    svc.refresh();
    const { draft } = svc.forecast({
      id: 'fx',
      issuedAt: 600,
      plan: { id: 'p', epoch: 600, items: [] },
      massProperties: fixtures.believedWorld.ship.massProperties,
      step: 60,
      duration: 1800,
    });
    expect(draft.samples.length).toBeGreaterThan(0);
    expect(draft.samples.every((s) => Number.isFinite(s.position.x) && s.positionCov[0] >= 0)).toBe(
      true,
    );
  });
});

describe('truth/belief boundary (P11) holds for the real model and Black Box files', () => {
  it(
    'no file in src/model or src/blackbox imports truth or the simulation',
    { timeout: 60_000 },
    async () => {
      const eslint = new ESLint({ errorOnUnmatchedPattern: false });
      const results = await eslint.lintFiles(['src/model/**/*.ts', 'src/blackbox/**/*.ts']);
      const bad = results.flatMap((r) =>
        r.messages
          .filter((m) => m.ruleId === 'no-restricted-imports')
          .map((m) => `${r.filePath}: ${m.message}`),
      );
      expect(bad).toEqual([]);
      expect(results.length).toBeGreaterThan(10);
    },
  );
});
