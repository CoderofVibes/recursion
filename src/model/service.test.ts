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
import type {
  AttemptRecord,
  BelievedBody,
  MassProperties,
  ModelState,
  ParameterPrior,
  Plan,
} from '../contracts/index.ts';
import { hashState } from '../lib/hash.ts';
import { createModelClient } from './client.ts';
import { contextFromBriefing, type ModelContext } from './engine.ts';
import { fromRows } from './linalg.ts';
import { ModelService } from './service.ts';
import type { ModelSettings } from './settings.ts';
import { mahalanobis } from './tierL.ts';
import { recordFromAttempt, testShip, type VectorJson } from './vector-harness.ts';

const V = (raw: string) => JSON.parse(raw) as VectorJson;
const MASS = 30000;

function body(id: string, x = 0, y = 0, posSigma = 1e3): BelievedBody {
  return {
    id,
    name: id,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    positionCov: [posSigma ** 2, 0, posSigma ** 2],
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
      position: { x: 1e6, y: 0 },
      velocity: { x: 0, y: 100 },
      positionCov: [1e8, 0, 1e8],
      velocityCov: [100, 0, 100],
      attitude: 0,
      attitudeSigma: 1e-3,
      angularRate: 0,
    },
    settings: { dt: 60, ...(opts.settings ?? {}) },
  };
}

const records = (v: VectorJson, caseId: string | number, thrust = 150): AttemptRecord[] => {
  const c = typeof caseId === 'number' ? v.cases[caseId]! : v.cases.find((q) => q.id === caseId)!;
  return c.attempts.map((a, i) =>
    recordFromAttempt(a, i + 1, { encounterId: 'range', mass: MASS, thrust }),
  );
};

const param = (s: ModelState, id: string) => {
  const p = s.parameters.find((q) => q.id === id);
  if (!p) throw new Error(`no parameter ${id}`);
  return p;
};

const massProperties: MassProperties = {
  mass: MASS,
  centerOfMass: { x: 0, y: 0 },
  inertia: 1e5,
  footprint: [
    { x: -5, y: -2 },
    { x: 5, y: -2 },
    { x: 5, y: 2 },
    { x: -5, y: 2 },
  ],
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
      const p = param(state, mine);
      expect(Math.abs(p.value - e.estimate[ref]!), mine).toBeLessThan(0.05 * e.sigma[ref]!);
      expect(Math.abs(p.sigma / e.sigma[ref]! - 1), mine).toBeLessThan(0.05);
    }
    expect(svc.report().confounding!.confounded).toBe(false);
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
          attitude: { reference: 'inertial', angle: q.theta },
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
    for (let i = 0; i < 4; i++)
      expect(Math.abs(p.state[i]! - ra.state[i]!)).toBeLessThan(Math.sqrt(C.data[i * 4 + i]!));
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
        [s!.positionCov[1], s!.positionCov[2]],
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
        [s.positionCov[1], s.positionCov[2]],
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
  it('a live model fed in record order equals a rebuild from stored records', () => {
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
  });
});

describe('extensions: rules only from the player (A4, P5)', () => {
  const v = V(rawValidation);

  it('distance law: passes held-out, earns a hedge, is adopted only on request, can be revoked', () => {
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
    expect(Math.abs(rec.state.validation!.statistic / ref.heldOut!.TperNu - 1)).toBeLessThan(0.02);
    expect(rec.state.validation!.rmsAfter).toBeLessThan(rec.state.validation!.rmsBefore);
    expect(Math.abs(rec.earnedHedge! / ref.earnedHedge!.sigmaH - 1)).toBeLessThan(0.05);
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
    expect(svc.snapshot.derived.hedge).toBeCloseTo(rec.earnedHedge!, 12);
    const revoked = svc.revoke('distance-law');
    expect(revoked.parameters.some((p) => p.id === 'law.gravity.exponent')).toBe(false);
    expect(revoked.extensions[0]!.status).toBe('revoked');
  });

  it('overlooked body: the wrong rule fails visibly, the right one passes', () => {
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
  });
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
  it('no file in src/model or src/blackbox imports truth or the simulation', async () => {
    const eslint = new ESLint({ errorOnUnmatchedPattern: false });
    const results = await eslint.lintFiles(['src/model/**/*.ts', 'src/blackbox/**/*.ts']);
    const bad = results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === 'no-restricted-imports')
        .map((m) => `${r.filePath}: ${m.message}`),
    );
    expect(bad).toEqual([]);
    expect(results.length).toBeGreaterThan(10);
  }, 30_000);
});
