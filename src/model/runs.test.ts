/**
 * Runs, decisions and probes in rule tests:
 * - DECISIONS A10: each run starts from different geometry; the model takes the bodies' arrival
 *   states and the arrival estimate per attempt from `AttemptStart.briefing`.
 * - The player's adopt and revoke are recorded (`BlackBoxArchive.extensionDecisions`), so a
 *   revoked rule stays revoked after a reload.
 * - A5: asteroid fixes that a passing held-out test fits count toward its validated span,
 *   around the body they were measured from.
 * Scenario data are 1G's vectors as Black Box records; added asteroids are integrated with the
 * believed-dynamics integrator under the true law. Truth only builds inputs and judges results.
 */

import { describe, expect, it } from 'vitest';
import rawValidation from '../../tests/vectors/estimator/extension-validation.json?raw';
import { emptyArchive, withExtensionDecision, withExtensionTest } from '../blackbox/archive.ts';
import { MemoryBlackBoxStore } from '../blackbox/store.ts';
import {
  cov3FromPlanar,
  isotropicInertia,
  prismHull,
  type AttemptRecord,
  type BelievedBody,
  type EncounterBriefing,
  type MassProperties,
  type Measurement,
  type ParameterPrior,
  type ShipEstimate,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import { createRng } from '../lib/rng.ts';
import { compileArc, simulate } from './dynamics.ts';
import type { ModelContext } from './engine.ts';
import { ModelService } from './service.ts';
import { recordFromAttempt, testShip, type CaseJson, type VectorJson } from './vector-harness.ts';

const MASS = 30000;
const R0 = 1e6;
const v = JSON.parse(rawValidation) as VectorJson;
const lawCase = v.cases.find((c) => c.id === 'distance-law')!;
const binaryCase = v.cases.find((c) => c.id === 'overlooked-body')!;
// LIFT(2G): the scenarios in this file are planar (z = 0, yaw-only attitude, flat hull).
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
const arrival: ShipEstimate = {
  t: 0,
  position: { x: 1e6, y: 0, z: 0 },
  velocity: { x: 0, y: 100, z: 0 },
  positionCov: cov3FromPlanar([1e8, 0, 1e8]),
  velocityCov: cov3FromPlanar([100, 0, 100]),
  attitude: quat.fromYaw(0),
  attitudeSigma: 1e-3,
  angularVelocity: { x: 0, y: 0, z: 0 },
};

const body = (id: string, x: number, y: number, vx = 0, vy = 0, sigma = 1e3): BelievedBody => ({
  id,
  name: id,
  position: { x, y, z: 0 },
  velocity: { x: vx, y: vy, z: 0 },
  positionCov: cov3FromPlanar([sigma ** 2, 0, sigma ** 2]),
  radius: id === 'A' ? 2.5e5 : 1.6e5,
  tracked: true,
});

function context(
  priors: ParameterPrior[],
  bodies: BelievedBody[],
  extra: Partial<ModelContext> = {},
): ModelContext {
  return {
    encounterId: 'range',
    priors,
    bodies,
    ship: testShip(MASS, 150),
    arrival,
    settings: { dt: 60 },
    ...extra,
  };
}

const records = (c: CaseJson) =>
  c.attempts.map((a, i) =>
    recordFromAttempt(a, i + 1, { encounterId: 'range', mass: MASS, thrust: 150 }),
  );

// ---------------------------------------------------------------------------------------------
// A10: different geometry per run
// ---------------------------------------------------------------------------------------------

describe('each run starts from different geometry (A10)', () => {
  const tv = binaryCase.truth.values;
  const priors: ParameterPrior[] = [
    { id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 },
    { id: 'body.B.mu', label: 'B μ', unit: 'm³/s²', value: 2.4e9, sigma: 2e8 },
  ];
  /** The geometry each attempt was briefed with: B's arrival state relative to A, ±1 km. */
  const bodiesOf = (att: string, shift = { x: 0, y: 0 }) => [
    body('A', shift.x, shift.y),
    body(
      'B',
      tv[`${att}.B.x`]! + shift.x,
      tv[`${att}.B.y`]! + shift.y,
      tv[`${att}.B.vx`]!,
      tv[`${att}.B.vy`]!,
    ),
  ];
  const briefingOf = (att: string, shift = { x: 0, y: 0 }): EncounterBriefing => ({
    id: 'range',
    name: 'Range',
    objectives: [],
    arrivalEstimate: {
      ...arrival,
      position: { x: arrival.position.x + shift.x, y: arrival.position.y + shift.y, z: 0 },
    },
    arrivalConfiguration: 'stowed',
    priors,
    knownBodies: bodiesOf(att, shift),
    knownAsteroids: [],
  });
  const withBriefing = (r: AttemptRecord, shift?: { x: number; y: number }): AttemptRecord => ({
    ...r,
    start: { ...r.start, briefing: briefingOf(r.id, shift) },
  });
  // The encounter's own briefing carries attempt 1's geometry.
  const ctx = context(priors, bodiesOf('att1'));
  const plain = records(binaryCase);

  it('fits attempts at different binary phases together when each carries its briefing', () => {
    const svc = new ModelService(ctx);
    const s = svc.load({ attempts: plain.map((r) => withBriefing(r)) });
    expect(s.fit!.converged).toBe(true);
    expect(s.fit!.chi2 / s.fit!.nu).toBeLessThan(1.2);
    const mb = s.parameters.find((p) => p.id === 'body.B.mu')!;
    expect(Math.abs(mb.value - tv['truth.muB']!)).toBeLessThan(3 * mb.sigma);
    // Without per-attempt geometry, attempts 2 and 3 are fitted against attempt 1's B.
    const blind = new ModelService(ctx).load({ attempts: plain });
    expect(blind.fit!.chi2 / blind.fit!.nu).toBeGreaterThan(5);
  });

  it('places each attempt’s forecast in that attempt’s geometry', () => {
    const shift = { x: 5e5, y: -2e5 };
    const run = (r: AttemptRecord) => {
      const svc = new ModelService(ctx);
      svc.load({ attempts: [withBriefing(plain[0]!)] });
      svc.beginAttempt({ ...r, outcome: { kind: 'in-progress' } });
      svc.refresh();
      return svc.forecast({
        id: 'f',
        issuedAt: 57600,
        plan: { id: 'p', epoch: 57600, items: [] },
        massProperties,
        step: 600,
        duration: 3600,
      }).draft;
    };
    const a = run(withBriefing(plain[1]!));
    const b = run(withBriefing(plain[1]!, shift));
    expect(b.samples.length).toBe(a.samples.length);
    b.samples.forEach((s, i) => {
      expect(Math.abs(s.position.x - a.samples[i]!.position.x - shift.x)).toBeLessThan(1e-3);
      expect(Math.abs(s.position.y - a.samples[i]!.position.y - shift.y)).toBeLessThan(1e-3);
      expect(s.positionCov).toEqual(a.samples[i]!.positionCov);
    });
    const ta = a.objects.find((o) => o.id === 'B')!.samples[0]!.position;
    const tb = b.objects.find((o) => o.id === 'B')!.samples[0]!.position;
    expect(Math.abs(tb.x - ta.x - shift.x)).toBeLessThan(1e-3);
  });
});

// ---------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------

describe('the player’s adopt and revoke are recorded (BlackBoxArchive.extensionDecisions)', () => {
  it('a revoked rule stays revoked after a reload', async () => {
    const ctx = context(
      [{ id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 }],
      [body('A', 0, 0)],
    );
    const recs = records(lawCase);
    const svc = new ModelService(ctx);
    svc.load({ attempts: recs });
    const test = svc.testExtension('distance-law', ['att1', 'att2'], 'att3');
    expect(() => svc.revoke('distance-law')).toThrow(/not adopted/);
    const adopted = svc.adopt('distance-law', '2026-11-14T13:40:00Z');
    expect(() => svc.adopt('distance-law')).toThrow(/already adopted/);
    const revoked = svc.revoke('distance-law', '2026-11-14T13:41:00Z');
    expect(svc.decisions).toEqual([
      {
        extension: 'distance-law',
        action: 'adopted',
        modelVersion: adopted.version,
        at: '2026-11-14T13:40:00Z',
      },
      {
        extension: 'distance-law',
        action: 'revoked',
        modelVersion: revoked.version,
        at: '2026-11-14T13:41:00Z',
      },
    ]);
    expect(revoked.extensions[0]!.status).toBe('revoked');

    let archive = withExtensionTest(emptyArchive(), test);
    for (const d of svc.decisions) archive = withExtensionDecision(archive, d);
    expect(archive.adoptedExtensions).toEqual([]);
    const store = new MemoryBlackBoxStore();
    for (const r of recs) await store.putAttempt(r);
    await store.putMeta({
      adoptedExtensions: archive.adoptedExtensions,
      leads: [],
      extensionTests: archive.extensionTests as typeof svc.extensions,
      extensionDecisions: archive.extensionDecisions!,
    });
    const loaded = (await store.load()).archive;
    const again = new ModelService(ctx);
    const s = again.load({
      attempts: loaded.attempts,
      extensions: loaded.extensionTests,
      decisions: loaded.extensionDecisions!,
    });
    expect(s.extensions[0]!.status).toBe('revoked');
    expect(again.adopted).toEqual([]);
    expect(s.parameters.some((p) => p.id === 'law.gravity.exponent')).toBe(false);
    // It can be adopted again; the record keeps all three decisions.
    expect(again.adopt('distance-law').extensions[0]!.status).toBe('adopted');
    expect(again.decisions.map((d) => d.action)).toEqual(['adopted', 'revoked', 'adopted']);
  }, 30_000);
});

// ---------------------------------------------------------------------------------------------
// A5: asteroid fixes in a passing held-out test count toward its validated span
// ---------------------------------------------------------------------------------------------

describe('asteroid fixes a passing test fits widen its validated span (A5)', () => {
  const N = 2.5;
  const MU = lawCase.truth.values['truth.muA']!;
  const potential = (r: number) => -(MU * Math.pow(R0, N - 2)) / ((N - 1) * Math.pow(r, N - 1));
  const apsisSpeed = (rFrom: number, rTo: number) =>
    Math.sqrt((2 * (potential(rTo) - potential(rFrom))) / (1 - (rFrom / rTo) ** 2));
  const truthAt = (state: readonly number[], times: readonly number[]) => {
    const st = {
      r0: R0,
      n: N,
      bodies: [{ id: 'A', mu: MU, state: 'gauge' as const }],
      ship: state as unknown as readonly [number, number, number, number],
      dynamicBodies: false,
      engine: { kE: 1, dE: 0 },
      kA: 1,
      camBias: 0,
    };
    return simulate(
      compileArc(st, { id: 'truth', epoch: 0, commands: [] }, new Map()),
      [],
      times,
      15,
    ).pos.map((p) => [p[2]!, p[3]!] as const);
  };
  const tv = lawCase.truth.values;
  /** Add an asteroid seen with the ship's camera at every fix time of the attempt. */
  function withAsteroid(
    rec: AttemptRecord,
    id: string,
    rp: number,
    ra: number,
    angle: number,
    seed: number,
  ): AttemptRecord {
    const rng = createRng(seed).stream(id);
    const times = [
      ...new Set(rec.measurements.filter((m) => m.kind === 'range').map((m) => m.t)),
    ].sort((a, b) => a - b);
    const ship = truthAt(
      [
        tv[`${rec.id}.ship.x`]!,
        tv[`${rec.id}.ship.y`]!,
        tv[`${rec.id}.ship.vx`]!,
        tv[`${rec.id}.ship.vy`]!,
      ],
      times,
    );
    const vp = apsisSpeed(rp, ra);
    const ast = truthAt(
      [rp * Math.cos(angle), rp * Math.sin(angle), -vp * Math.sin(angle), vp * Math.cos(angle)],
      times,
    );
    const sb = 4.1e-5;
    const extra: Measurement[] = times.flatMap((t, k) => {
      const dx = ast[k]![0] - ship[k]![0];
      const dy = ast[k]![1] - ship[k]![1];
      const r = Math.hypot(dx, dy);
      return [
        {
          kind: 'bearing',
          t,
          source: 'cam',
          target: id,
          value: [Math.atan2(dy, dx) + rng.normal(0, sb), 0],
          sigma: [sb, sb],
        },
        {
          kind: 'range',
          t,
          source: 'cam',
          target: id,
          value: [r + rng.normal(0, 2e-3 * r)],
          sigma: [2e-3 * r],
        },
      ] satisfies Measurement[];
    });
    const measurements = [...rec.measurements, ...extra]
      .map((m, i) => [m, i] as const)
      .sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
      .map((p) => p[0]);
    return { ...rec, measurements };
  }
  const ctx = context(
    [{ id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 }],
    [body('A', 0, 0)],
    {
      asteroids: ['ast-far', 'ast-near'].map((id) => ({
        id,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        positionCov: cov3FromPlanar([1e10, 0, 1e10]),
        radius: 5e3,
        tracked: true,
      })),
    },
  );
  const plain = records(lawCase);
  // Training attempt 2 also tracks an asteroid at 1.6–1.9 r0; held-out attempt 3 one at 0.45–0.55 r0.
  const probed = [
    plain[0]!,
    withAsteroid(plain[1]!, 'ast-far', 1.6e6, 1.9e6, 1.0, 11),
    withAsteroid(plain[2]!, 'ast-near', 0.45e6, 0.55e6, 3.0, 12),
  ];
  const test = (attempts: AttemptRecord[]) => {
    const svc = new ModelService(ctx);
    svc.load({ attempts });
    return { svc, rec: svc.testExtension('distance-law', ['att1', 'att2'], 'att3') };
  };
  const without = test(plain);
  const withProbes = test(probed);

  it('the rule still passes, and its span on A now reaches the asteroids’ distances', () => {
    expect(withProbes.svc.snapshot.derived.probes.get('att2')!.map((a) => a.id)).toEqual([
      'att2@ast-far',
    ]);
    expect(withProbes.rec.adoptable).toBe(true);
    expect(withProbes.rec.state.validation!.verdict).toBe('better');
    const plainSpan = without.rec.state.validatedSpans![0]!;
    const span = withProbes.rec.state.validatedSpans![0]!;
    expect(span.body).toBe('A');
    expect(plainSpan.rMin).toBeGreaterThan(0.59e6);
    expect(plainSpan.rMax).toBeLessThan(1.41e6);
    expect(span.rMin).toBeLessThan(0.46e6);
    // The far asteroid climbs from 1.6 to about 1.8 r0 during the 18 h attempt.
    expect(span.rMax).toBeGreaterThan(1.7e6);
    // σ_e still comes from the ship's held-out windows (the asteroids nudge the trained law).
    expect(Math.abs(span.sigmaE / plainSpan.sigmaE - 1)).toBeLessThan(0.05);
  });

  it('once adopted, the earned hedge applies over the wider span', () => {
    withProbes.svc.adopt('distance-law');
    const v2 = withProbes.svc.snapshot.derived.validated['A']!;
    const [lo, hi] = v2.spans[0]!;
    expect(lo).toBeLessThan(0.46e6);
    expect(hi).toBeGreaterThan(1.7e6);
  });
});
