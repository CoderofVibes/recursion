/**
 * Two moving bodies in 3D (2F requests 2, 12 and 13; DECISIONS A18 (1)): the present state from
 * whichever body the camera tracked last and a plain report when it is stale, the second body's
 * believed motion inside the envelope, briefing propagation under the law in force, and a
 * forecast computed as of the moment it was asked for while records keep arriving.
 *
 * A synthetic copy of the Gravity range's binary (μ 1e10 and 2.5e9, 4,000 km apart, r₀ 1,000 km,
 * P16), made with the believed-dynamics integrator under the true law at a 15 s step. The ship
 * orbits Alpha at 1.0–1.3 r₀ in a plane inclined 25° to the binary's. The briefing's σ and
 * priors are the Gravity range's (`src/content/gravity-range/briefing.ts`: ship 1.5 km and
 * 0.15 m/s, Beta 5 km, Alpha's μ 1.02e10 ± 3e8, Beta's 2.2e9 ± 8e8). Truth only builds
 * measurements and judges results.
 */

import { describe, expect, it } from 'vitest';
import {
  isoCov3,
  isotropicInertia,
  prismHull,
  type AttemptRecord,
  type Cov3,
  type ExecutedCommand,
  type ForecastDraft,
  type MassProperties,
  type Measurement,
  type Plan,
  type Vec3,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import { createRng } from '../lib/rng.ts';
import { compileArc, simulate, type State6, type Structure } from './dynamics.ts';
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
const THRUST = 150;
const H = 3600;
/** "3σ" for three numbers at once. */
const CHI_3 = 3.763;

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

type V3 = readonly [number, number, number];
interface Truth {
  readonly A: V3;
  readonly B: V3;
  readonly ship: V3;
}

/** A circular binary in the x–y plane under exponent n, and a ship about A; A at rest at t = 0. */
function world(n: number) {
  const aRel = ((MU_A + MU_B) / (R0 * R0)) * Math.pow(R0 / SEP, n);
  const w = Math.sqrt(aRel / SEP);
  const phase = 1.2;
  const B0: State6 = [
    SEP * Math.cos(phase),
    SEP * Math.sin(phase),
    0,
    -w * SEP * Math.sin(phase),
    w * SEP * Math.cos(phase),
    0,
  ];
  const pot = (r: number) => -(MU_A * Math.pow(R0, n - 2)) / ((n - 1) * Math.pow(r, n - 1));
  const vp = Math.sqrt((2 * (pot(1.3 * R0) - pot(R0))) / (1 - (1 / 1.3) ** 2));
  const inc = (25 * Math.PI) / 180;
  const ship0: State6 = [R0, 0, 0, 0, vp * Math.cos(inc), vp * Math.sin(inc)];
  const st: Structure = {
    r0: R0,
    n,
    bodies: [
      { id: 'A', mu: MU_A, state: 'gauge' },
      { id: 'B', mu: MU_B, state: B0 },
    ],
    ship: ship0,
    dynamicBodies: true,
    engine: { kE: 1, dE: 0, dP: 0 },
    kA: 1,
    camBias: [0, 0, 0],
  };
  const ca = compileArc(st, { id: 'truth', epoch: 0, commands: [] }, new Map());
  const at = (times: readonly number[]): Truth[] => {
    const order = times.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0]);
    const tr = simulate(
      ca,
      [],
      order.map((o) => o[0]),
      15,
    );
    const out = new Array<Truth>(times.length);
    order.forEach(([, i], k) => {
      const p = tr.pos[k]!;
      out[i] = { A: [p[0]!, p[1]!, p[2]!], B: [p[3]!, p[4]!, p[5]!], ship: [p[6]!, p[7]!, p[8]!] };
    });
    return out;
  };
  return { B0, ship0, at };
}
type World = ReturnType<typeof world>;

const arrivalOf = (wd: World) => ({
  t: 0,
  position: { x: wd.ship0[0], y: wd.ship0[1], z: wd.ship0[2] },
  velocity: { x: wd.ship0[3], y: wd.ship0[4], z: wd.ship0[5] },
  positionCov: isoCov3(1500),
  velocityCov: isoCov3(0.15),
  attitude: quat.IDENTITY,
  attitudeSigma: 1e-3,
  angularVelocity: { x: 0, y: 0, z: 0 },
});

/** Camera fixes every 120 s on whatever `target(t)` names (null: none), to `tEnd`. */
function record(
  wd: World,
  tEnd: number,
  target: (t: number) => 'A' | 'B' | null,
  seed = 'fixes',
): AttemptRecord {
  const rng = createRng(4401).stream(seed);
  const times = Array.from({ length: Math.floor(tEnd / 120) + 1 }, (_, i) => i * 120);
  const tr = wd.at(times);
  const ms: Measurement[] = [];
  const sb = 4.1e-5;
  times.forEach((t, k) => {
    const id = target(t);
    if (!id) return;
    const p = tr[k]!;
    const b = id === 'A' ? p.A : p.B;
    const dx = b[0] - p.ship[0];
    const dy = b[1] - p.ship[1];
    const dz = b[2] - p.ship[2];
    const r = Math.hypot(dx, dy, dz);
    const az = Math.atan2(dy, dx) + rng.normal(0, sb);
    const el = Math.atan2(dz, Math.hypot(dx, dy)) + rng.normal(0, sb);
    ms.push({ kind: 'bearing', t, source: 'cam', target: id, value: [az, el], sigma: [sb, sb] });
    ms.push({
      kind: 'range',
      t,
      source: 'cam',
      target: id,
      value: [r + rng.normal(0, 2e-3 * r)],
      sigma: [2e-3 * r],
    });
  });
  return {
    id: 'att1',
    index: 1,
    encounterId: 'range',
    startedAt: '2026-11-14T22:00:00Z',
    start: { estimate: arrivalOf(wd), configuration: 'stowed', modelVersion: 0 },
    plans: [],
    executed: [],
    forecasts: [],
    measurements: ms,
    events: [],
    outcome: { kind: 'in-progress' },
    modelVersionAtEnd: 0,
  };
}

function context(wd: World, extraPriors: ModelContext['priors'] = []): ModelContext {
  return {
    encounterId: 'range',
    priors: [
      { id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 },
      { id: 'body.B.mu', label: 'B μ', unit: 'm³/s²', value: 2.2e9, sigma: 8e8 },
      ...extraPriors,
    ],
    bodies: [
      {
        id: 'A',
        name: 'Alpha',
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        positionCov: isoCov3(0),
        radius: 2.5e5,
        tracked: true,
      },
      {
        id: 'B',
        name: 'Beta',
        position: { x: wd.B0[0], y: wd.B0[1], z: wd.B0[2] },
        velocity: { x: wd.B0[3], y: wd.B0[4], z: wd.B0[5] },
        positionCov: isoCov3(5000),
        radius: 1.6e5,
        tracked: true,
      },
    ],
    ship: testShip(MASS, THRUST),
    arrival: arrivalOf(wd),
    settings: { dt: 60 },
  };
}

/** The model flying an attempt in progress, with its own global fit (a refit in flight). */
function fly(wd: World, rec: AttemptRecord) {
  const svc = new ModelService(context(wd));
  svc.load({ attempts: [] });
  svc.beginAttempt(rec);
  svc.refit();
  return svc;
}

const coast = (epoch: number): Plan => ({ id: 'p', epoch, items: [] });

const mat3 = (c: Cov3) =>
  fromRows([
    [c[0], c[1], c[2]],
    [c[1], c[3], c[4]],
    [c[2], c[4], c[5]],
  ]);
/** Mahalanobis distance of truth (object − reference) from the forecast's, and the error, m. */
function relErr(
  truthObj: V3,
  truthRef: V3,
  pos: Vec3,
  refPos: Vec3,
  cov: Cov3,
): { m: number; err: number } {
  const dev = [
    truthObj[0] - truthRef[0] - (pos.x - refPos.x),
    truthObj[1] - truthRef[1] - (pos.y - refPos.y),
    truthObj[2] - truthRef[2] - (pos.z - refPos.z),
  ];
  return { m: mahalanobis(dev, mat3(cov)), err: Math.hypot(...dev) };
}
const track = (draft: ForecastDraft, id: string) => draft.objects.find((o) => o.id === id)!.samples;

describe('the present state follows the tracked body (2F request 12)', () => {
  const wd = world(2); // the model's law is right: only what the camera looks at changes
  const T = 16 * H;

  it('after six hours on Beta, the forecast starts from Beta’s fixes and is honest about Beta', () => {
    const svc = fly(
      wd,
      record(wd, T, (t) => (t < 10 * H ? 'A' : 'B')),
    );
    const { draft, detail } = svc.forecast({
      id: 'f',
      issuedAt: T,
      plan: coast(T),
      massProperties,
      step: 600,
      duration: 4 * H,
    });
    expect(detail.presentBody).toBe('B');
    expect(detail.presentAge).toBeLessThan(600);
    expect(detail.stale).toBe(false);
    expect(draft.samples.length).toBeGreaterThan(20);
    const trackB = track(draft, 'B');
    const trackA = track(draft, 'A');
    const truth = wd.at(draft.samples.map((s) => s.t));
    let worst = 0;
    draft.samples.forEach((s, i) => {
      // Covariances are relative to the reference body, here Beta (whose track carries none).
      expect(trackB[i]!.positionCov).toEqual([0, 0, 0, 0, 0, 0]);
      const { m } = relErr(
        truth[i]!.ship,
        truth[i]!.B,
        s.position,
        trackB[i]!.position,
        s.positionCov,
      );
      worst = Math.max(worst, m);
    });
    expect(worst).toBeLessThan(CHI_3);
    // Alpha, seen from Beta, carries its own uncertainty, and truth lies inside it.
    trackA.forEach((a, i) => {
      const { m } = relErr(
        truth[i]!.A,
        truth[i]!.B,
        a.position,
        trackB[i]!.position,
        a.positionCov,
      );
      expect(m, `Alpha at t=${a.t}`).toBeLessThan(CHI_3);
    });
  });

  it('says plainly that the present state is stale when nothing was tracked lately', () => {
    const svc = fly(
      wd,
      record(wd, T, (t) => (t < 10 * H ? 'A' : null)),
    );
    const { draft, detail } = svc.forecast({
      id: 'g',
      issuedAt: T,
      plan: coast(T),
      massProperties,
      step: 600,
      duration: 2 * H,
    });
    expect(detail.presentBody).toBe('A');
    expect(detail.stale).toBe(true);
    expect(detail.presentAge).toBeGreaterThan(5.9 * H);
    // Carried six hours from the last fixes, the forecast is still honest where it reaches.
    const truth = wd.at(draft.samples.map((s) => s.t));
    const trackA = track(draft, 'A');
    draft.samples.forEach((s, i) => {
      const { m } = relErr(
        truth[i]!.ship,
        truth[i]!.A,
        s.position,
        trackA[i]!.position,
        s.positionCov,
      );
      expect(m, `t=${s.t}`).toBeLessThan(CHI_3);
    });
  });
});

describe('the envelope covers the bodies’ own believed motion (2F request 13)', () => {
  // Inverse-2.5 world, Newtonian model, no rule, Beta never looked at: the model's binary orbit
  // is wrong, and before this change nothing in the envelope said so.
  const wd = world(2.5);
  const T = 12 * H;
  const svc = fly(
    wd,
    record(wd, T, () => 'A'),
  );
  const { draft, detail } = svc.forecast({
    id: 'f',
    issuedAt: T,
    plan: coast(T),
    massProperties,
    step: 1800,
    duration: 12 * H,
  });
  const trackA = track(draft, 'A');
  const trackB = track(draft, 'B');
  const truth = wd.at(trackB.map((s) => s.t));

  it('Beta’s believed position carries its uncertainty, and truth lies inside it', () => {
    expect(detail.presentBody).toBe('A');
    let worst = 0;
    trackB.forEach((b, i) => {
      // Relative to Alpha, the forecast's reference.
      const { m, err } = relErr(
        truth[i]!.B,
        truth[i]!.A,
        b.position,
        trackA[i]!.position,
        b.positionCov,
      );
      expect(m, `t=${b.t}`).toBeLessThan(CHI_3);
      worst = Math.max(worst, err);
    });
    // The error is real (the model moves Beta under Newton): the envelope is what makes it honest.
    expect(worst).toBeGreaterThan(100e3);
  });

  it('the ship forecast stays honest relative to Alpha', () => {
    const ship = wd.at(draft.samples.map((s) => s.t));
    expect(draft.samples.length).toBeGreaterThan(4);
    draft.samples.forEach((s, i) => {
      const { m } = relErr(
        ship[i]!.ship,
        ship[i]!.A,
        s.position,
        trackA[i]!.position,
        s.positionCov,
      );
      expect(m, `t=${s.t}`).toBeLessThan(CHI_3);
    });
  });

  it('the closest approach to Beta states a σ that covers the true distance', () => {
    const ca = draft.closestApproaches.find((c) => c.id === 'B')!;
    const at = wd.at([ca.t])[0]!;
    const trueDist =
      Math.hypot(at.ship[0] - at.B[0], at.ship[1] - at.B[1], at.ship[2] - at.B[2]) - 1.6e5;
    // Hull reach is metres; the clearance's σ is along the line between the centres.
    expect(Math.abs(trueDist - ca.distance) / ca.sigma).toBeLessThan(3);
  });
});

describe('briefing propagation uses the law in force (2F request 2)', () => {
  const wd = world(2.5);
  const t = 12 * H;
  const truth = wd.at([t])[0]!;
  const truthRel = [0, 1, 2].map((c) => truth.B[c]! - truth.A[c]!);
  const off = (r: readonly number[]) =>
    Math.hypot(r[0]! - truthRel[0]!, r[1]! - truthRel[1]!, r[2]! - truthRel[2]!);

  it('carries the second body under the fitted law and masses, not Newton and the priors', () => {
    const ctx = context(wd);
    const spec = modelSpec(ctx, ['distance-law']);
    const inForce = lawInForce(ctx, spec, {
      'law.gravity.exponent': 2.5,
      'body.A.mu': MU_A,
      'body.B.mu': MU_B,
    });
    expect(off(briefingBodiesAt(ctx, spec, t, inForce)[0]!)).toBeLessThan(1);
    expect(off(briefingBodiesAt(ctx, modelSpec(ctx, []), t)[0]!)).toBeGreaterThan(100e3);
  });

  it('an attempt with no global fit yet moves Beta under the adopted law', () => {
    // The exponent is adopted and its value in force is 2.5; the attempt in progress has had no
    // global fit (a refresh only) and has never looked at Beta.
    const svc = new ModelService(
      context(wd, [{ id: 'law.gravity.exponent', label: 'n', unit: '', value: 2.5, sigma: 1e-3 }]),
    );
    svc.load({ attempts: [], adopted: ['distance-law'] });
    svc.beginAttempt(record(wd, t, () => 'A'));
    svc.refresh();
    const { draft } = svc.forecast({
      id: 'f',
      issuedAt: t,
      plan: coast(t),
      massProperties,
      step: 600,
      duration: H,
    });
    const a = track(draft, 'A')[0]!.position;
    const b = track(draft, 'B')[0]!.position;
    // Under the arrival priors' Newton it would be 300 km or more off by now.
    expect(off([b.x - a.x, b.y - a.y, b.z - a.z])).toBeLessThan(20e3);
  });
});

describe('a forecast computed from the moment of commitment (A18 (1))', () => {
  const wd = world(2);
  const T = 8 * H;
  const later = 9 * H;
  // The committed plan: a 60 s burn 10 minutes after commitment.
  const burnAt = T + 600;
  const plan: Plan = {
    id: 'plan',
    epoch: T,
    items: [
      {
        id: 'b',
        at: 600,
        command: { kind: 'burn', thruster: 'main', throttle: 1, duration: 60 },
      },
    ],
  };
  const full = record(wd, later, () => 'A');
  const atCommit = {
    ...full,
    measurements: full.measurements.filter((m) => m.t <= T),
  };
  const executedBurn: ExecutedCommand = {
    t: burnAt,
    command: { kind: 'burn', thruster: 'main', throttle: 1, duration: 60 },
    source: 'plan',
    planId: 'plan',
    planItemId: 'b',
    status: 'executed',
  };
  const request = { id: 'f', issuedAt: T, plan, massProperties, step: 600, duration: 4 * H };

  it('is the same however much was recorded while it was being computed', () => {
    const svc = new ModelService(context(wd));
    svc.load({ attempts: [] });
    svc.beginAttempt(atCommit);
    svc.refit();
    const before = svc.forecast(request).draft;
    // Time kept running: an hour of fixes and the plan's own burn reached the model first.
    svc.append('att1', {
      measurements: full.measurements.filter((m) => m.t > T),
      executed: [executedBurn],
    });
    const after = svc.forecast(request).draft;
    expect(after).toEqual(before);
    // The burn is in it once, from the plan: the forecast is not the bare coast.
    const coastOnly = svc.forecast({ ...request, plan: coast(T) }).draft;
    // At the first sample after the burn (it ends at T + 660 s).
    const at = (d: ForecastDraft) => d.samples.find((q) => q.t === T + 1200)!.velocity;
    const dv = Math.hypot(
      at(before).x - at(coastOnly).x,
      at(before).y - at(coastOnly).y,
      at(before).z - at(coastOnly).z,
    );
    // 150 N for 60 s on 30 t is 0.30 m/s; counted twice it would be 0.60.
    expect(dv).toBeGreaterThan(0.28);
    expect(dv).toBeLessThan(0.32);
  });

  it('after a refresh with the newer records, its present state is still the one at commitment', () => {
    const svc = new ModelService(context(wd));
    svc.load({ attempts: [] });
    svc.beginAttempt(atCommit);
    svc.refit();
    const before = svc.forecast(request);
    svc.append('att1', {
      measurements: full.measurements.filter((m) => m.t > T),
      executed: [executedBurn],
    });
    svc.refresh();
    const after = svc.forecast(request);
    expect(after.detail.presentTime).toBe(before.detail.presentTime);
    expect(after.detail.presentTime).toBeLessThanOrEqual(T);
    // The refresh refitted the arc alone with an hour more of fixes. Beta, never looked at, then
    // comes from the briefing rather than the global fit, with a wider prior, so the present
    // state as of commitment moves and widens (by about a quarter at its first sample). Both are
    // honest, and they agree within their envelopes. Compared relative to Alpha, which is what
    // the covariances describe (the frame moves with Beta's believed position).
    const relA = (d: ForecastDraft, i: number) => {
      const s = d.samples[i]!.position;
      const a = track(d, 'A')[i]!.position;
      return [s.x - a.x, s.y - a.y, s.z - a.z];
    };
    const truth = wd.at(before.draft.samples.map((q) => q.t));
    for (const f of [before, after])
      f.draft.samples.forEach((q, i) => {
        const tv = [0, 1, 2].map((c) => truth[i]!.ship[c]! - truth[i]!.A[c]!);
        const dev = relA(f.draft, i).map((v, c) => v - tv[c]!);
        expect(mahalanobis(dev, mat3(q.positionCov)), `t=${q.t}`).toBeLessThan(CHI_3);
      });
    after.draft.samples.forEach((q, i) => {
      const b = before.draft.samples[i]!;
      const dev = relA(after.draft, i).map((v, c) => v - relA(before.draft, i)[c]!);
      const sum = q.positionCov.map((v, c) => v + b.positionCov[c]!) as unknown as Cov3;
      expect(mahalanobis(dev, mat3(sum)), `t=${q.t}`).toBeLessThan(CHI_3);
    });
  });
});
