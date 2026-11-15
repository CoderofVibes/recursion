/**
 * Two moving bodies (2F requests 2, 12, 13): the present state from whichever body is tracked,
 * a plain report when it is stale, an envelope that covers the bodies' own believed motion, and
 * briefing propagation under the law in force.
 *
 * Synthetic Gravity-range-like binary (μ 1e10 and 2.5e9 at 4,000 km, P16) made with the
 * believed-dynamics integrator under the true law, 15 s step; the ship circles Alpha at
 * 1.0–1.3 r0. Truth only builds measurements and judges results.
 */

import { describe, expect, it } from 'vitest';
import type { AttemptRecord, MassProperties, Measurement } from '../contracts/index.ts';
import { createRng } from '../lib/rng.ts';
import { compileArc, simulate } from './dynamics.ts';
import { briefingBodiesAt, lawInForce, modelSpec, type ModelContext } from './engine.ts';
import { fromRows } from './linalg.ts';
import { ModelService } from './service.ts';
import { mahalanobis } from './tierL.ts';
import { testShip } from './vector-harness.ts';

const R0 = 1e6;
const MU_A = 1e10;
const MU_B = 2.5e9;
const SEP = 4e6;
const MASS = 30000;
const massProperties: MassProperties = {
  mass: MASS,
  centerOfMass: { x: 0, y: 0 },
  inertia: 1e5,
  footprint: [{ x: -5, y: -2 }, { x: 5, y: -2 }, { x: 5, y: 2 }, { x: -5, y: 2 }],
};

/** A circular binary and a ship around A under exponent n; A at the origin and at rest at t = 0. */
function world(n: number) {
  const aRel = ((MU_A + MU_B) / (R0 * R0)) * Math.pow(R0 / SEP, n);
  const w = Math.sqrt(aRel / SEP);
  const phase = 1.2;
  const B0 = [SEP * Math.cos(phase), SEP * Math.sin(phase), -w * SEP * Math.sin(phase), w * SEP * Math.cos(phase)];
  const pot = (r: number) => -(MU_A * Math.pow(R0, n - 2)) / ((n - 1) * Math.pow(r, n - 1));
  const vp = Math.sqrt((2 * (pot(1.3 * R0) - pot(R0))) / (1 - (R0 / (1.3 * R0)) ** 2));
  const ship0 = [R0, 0, 0, vp];
  const at = (times: readonly number[]) => {
    const st = {
      r0: R0,
      n,
      bodies: [
        { id: 'A', mu: MU_A, state: 'gauge' as const },
        { id: 'B', mu: MU_B, state: B0 as unknown as readonly [number, number, number, number] },
      ],
      ship: ship0 as unknown as readonly [number, number, number, number],
      dynamicBodies: true,
      engine: { kE: 1, dE: 0 },
      kA: 1,
      camBias: 0,
    };
    const tr = simulate(compileArc(st, { id: 'truth', epoch: 0, commands: [] }, new Map()), [], times, 15);
    return tr.pos.map((p) => ({ A: [p[0]!, p[1]!], B: [p[2]!, p[3]!], ship: [p[4]!, p[5]!] }));
  };
  return { B0, ship0, at };
}

const H = 3600;
/** Camera fixes every 120 s: on A until tSwitch, then on B (or nothing) until tEnd. */
function record(wd: ReturnType<typeof world>, tSwitch: number, tEnd: number, after: 'B' | 'none' | 'A'): AttemptRecord {
  const rng = createRng(4401).stream(after);
  const times = Array.from({ length: Math.floor(tEnd / 120) + 1 }, (_, i) => i * 120);
  const tr = wd.at(times);
  const ms: Measurement[] = [];
  const sb = 4.1e-5;
  times.forEach((t, k) => {
    const target = t < tSwitch ? 'A' : after;
    if (target === 'none') return;
    const p = tr[k]!;
    const body = target === 'A' ? p.A : p.B;
    const dx = body[0]! - p.ship[0]!;
    const dy = body[1]! - p.ship[1]!;
    const r = Math.hypot(dx, dy);
    ms.push({ kind: 'bearing', t, source: 'cam', target, value: [Math.atan2(dy, dx) + rng.normal(0, sb)], sigma: [sb] });
    ms.push({ kind: 'range', t, source: 'cam', target, value: [r + rng.normal(0, 2e-3 * r)], sigma: [2e-3 * r] });
  });
  return {
    id: 'att1',
    index: 1,
    encounterId: 'range',
    startedAt: '2026-11-14T14:00:00Z',
    start: {
      estimate: { t: 0, position: { x: wd.ship0[0]!, y: 0 }, velocity: { x: 0, y: wd.ship0[3]! }, positionCov: [1e6, 0, 1e6], velocityCov: [1, 0, 1], attitude: 0, attitudeSigma: 1e-3, angularRate: 0 },
      configuration: 'stowed',
      modelVersion: 0,
    },
    plans: [],
    executed: [],
    forecasts: [],
    measurements: ms,
    events: [],
    outcome: { kind: 'in-progress' },
    modelVersionAtEnd: 0,
  };
}

function context(wd: ReturnType<typeof world>): ModelContext {
  const rec = record(wd, 0, 0, 'A');
  return {
    encounterId: 'range',
    priors: [
      { id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 },
      { id: 'body.B.mu', label: 'B μ', unit: 'm³/s²', value: 2.45e9, sigma: 1e8 },
    ],
    bodies: [
      { id: 'A', name: 'Alpha', position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, positionCov: [1e6, 0, 1e6], radius: 2.5e5, tracked: true },
      { id: 'B', name: 'Beta', position: { x: wd.B0[0]!, y: wd.B0[1]! }, velocity: { x: wd.B0[2]!, y: wd.B0[3]! }, positionCov: [1e6, 0, 1e6], radius: 1.6e5, tracked: true },
    ],
    ship: testShip(MASS, 150),
    arrival: rec.start.estimate,
    settings: { dt: 60 },
  };
}

function fly(wd: ReturnType<typeof world>, rec: AttemptRecord) {
  const svc = new ModelService(context(wd));
  svc.load({ attempts: [] });
  svc.beginAttempt(rec);
  svc.refit();
  return svc;
}

const relMaha = (truth: readonly number[], pos: { x: number; y: number }, ref: { x: number; y: number }, truthRef: readonly number[], cov: readonly [number, number, number]) => {
  const dx = truth[0]! - truthRef[0]! - (pos.x - ref.x);
  const dy = truth[1]! - truthRef[1]! - (pos.y - ref.y);
  return { m: mahalanobis([dx, dy], fromRows([[cov[0], cov[1]], [cov[1], cov[2]]])), err: Math.hypot(dx, dy) };
};

describe('the present state follows the tracked body (2F request 12)', () => {
  const wd = world(2); // the model's law is right here: only the tracking changes
  const T = 16 * H;

  it('after hours on Beta, the forecast starts from Beta’s fixes and is honest relative to Beta', () => {
    const svc = fly(wd, record(wd, 10 * H, T, 'B'));
    const { draft, detail } = svc.forecast({ id: 'f', issuedAt: T, plan: { id: 'p', epoch: T, items: [] }, massProperties, step: 600, duration: 4 * H });
    expect(detail.presentBody).toBe('B');
    expect(detail.presentAge).toBeLessThan(600);
    expect(detail.stale).toBe(false);
    expect(draft.samples.length).toBeGreaterThan(10);
    const trackB = draft.objects.find((o) => o.id === 'B')!.samples;
    const truth = wd.at(draft.samples.map((s) => s.t));
    draft.samples.forEach((s, i) => {
      // R = B: sample covariances are relative to Beta.
      const { m } = relMaha(truth[i]!.ship, s.position, trackB[i]!.position, truth[i]!.B, s.positionCov);
      expect(m, `t=${s.t}`).toBeLessThan(3);
    });
  });

  it('says plainly that the present state is stale when nothing was tracked lately', () => {
    const svc = fly(wd, record(wd, 10 * H, T, 'none'));
    const { detail } = svc.forecast({ id: 'g', issuedAt: T, plan: { id: 'p', epoch: T, items: [] }, massProperties, step: 600, duration: H });
    expect(detail.presentBody).toBe('A');
    expect(detail.stale).toBe(true);
    expect(detail.presentAge).toBeGreaterThan(5.9 * H);
  });
});

describe('the envelope covers the bodies’ own believed motion (2F request 13)', () => {
  // Inverse-2.5 world, Newtonian model, no rule: the model's binary orbit is wrong.
  const wd = world(2.5);
  const T = 12 * H;
  const svc = fly(wd, record(wd, T + 1, T, 'A'));
  const { draft } = svc.forecast({ id: 'f', issuedAt: T, plan: { id: 'p', epoch: T, items: [] }, massProperties, step: 1800, duration: 12 * H });
  const trackA = draft.objects.find((o) => o.id === 'A')!.samples;
  const trackB = draft.objects.find((o) => o.id === 'B')!.samples;
  const truth = wd.at(trackB.map((s) => s.t));

  it('Beta’s believed position carries its uncertainty, and truth lies inside it', () => {
    let worst = 0;
    trackB.forEach((s, i) => {
      // R = A: Beta's covariance is relative to Alpha.
      const { m, err } = relMaha(truth[i]!.B, s.position, trackA[i]!.position, truth[i]!.A, s.positionCov);
      expect(m, `t=${s.t}`).toBeLessThan(3);
      worst = Math.max(worst, err);
    });
    // The error is real (the model's binary orbit is wrong): the envelope is what makes it honest.
    expect(worst).toBeGreaterThan(50e3);
  });

  it('the ship forecast stays honest relative to Alpha', () => {
    const ship = wd.at(draft.samples.map((s) => s.t));
    draft.samples.forEach((s, i) => {
      const { m } = relMaha(ship[i]!.ship, s.position, trackA[i]!.position, ship[i]!.A, s.positionCov);
      expect(m, `t=${s.t}`).toBeLessThan(3);
    });
  });
});

describe('briefing propagation uses the law in force (2F request 2)', () => {
  it('moves the second body under the fitted law and masses, not Newton and the priors', () => {
    const wd = world(2.5);
    const ctx = context(wd);
    const spec = modelSpec(ctx, ['distance-law']);
    const t = 12 * H;
    const truth = wd.at([t])[0]!;
    const truthRel = [truth.B[0]! - truth.A[0]!, truth.B[1]! - truth.A[1]!];
    const inForce = lawInForce(ctx, spec, { 'law.gravity.exponent': 2.5, 'body.A.mu': MU_A, 'body.B.mu': MU_B });
    const good = briefingBodiesAt(ctx, spec, t, inForce)[0]!;
    const naive = briefingBodiesAt(ctx, modelSpec(ctx, []), t)[0]!;
    expect(Math.hypot(good[0]! - truthRel[0]!, good[1]! - truthRel[1]!)).toBeLessThan(1);
    expect(Math.hypot(naive[0]! - truthRel[0]!, naive[1]! - truthRel[1]!)).toBeGreaterThan(100e3);
  });
});
