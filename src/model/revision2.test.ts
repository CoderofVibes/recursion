/**
 * 1G revision 2 (DECISIONS A5) through the game-facing model: ship calibrations age and get a
 * deviation per attempt; a carried rule earns its tighter envelope only inside its validated
 * spans, around every body (A5 "every body"); calibration carried to a later encounter is aged by
 * the transit. Scenario data are 1G's vectors as Black Box records. Truth only judges results.
 */

import { describe, expect, it } from 'vitest';
import rawCarried from '../../tests/vectors/estimator/carried-rule-forecast.json?raw';
import rawAging from '../../tests/vectors/estimator/parameter-aging.json?raw';
import {
  cov3FromPlanar,
  isotropicInertia,
  prismHull,
  type AttemptRecord,
  type MassProperties,
  type ModelState,
  type ParameterPrior,
  type Plan,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import { carriedCalibration, type ModelContext } from './engine.ts';
import type { ExtensionRecord } from './extensions.ts';
import { fromRows } from './linalg.ts';
import { ModelService } from './service.ts';
import { mahalanobis } from './tierL.ts';
import {
  recordFromAttempt,
  testShip,
  type AttemptJson,
  type VectorJson,
} from './vector-harness.ts';

const MASS = 30000;
const V = (raw: string) => JSON.parse(raw) as VectorJson;
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

function context(
  priors: ParameterPrior[],
  thrust: number,
  settings: ModelContext['settings'] = {},
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
        positionCov: cov3FromPlanar([1e6, 0, 1e6]),
        radius: 2.5e5,
        tracked: true,
      },
    ],
    ship: testShip(MASS, thrust),
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
    settings: { dt: 60, ...settings },
  };
}

const perArc = (s: ModelState, id: string, arc: string) =>
  s.parameters.find((p) => p.id === id && p.arc === arc)!;

describe('ship calibrations age and are fitted per attempt (spec §3.7)', () => {
  // parameter-aging case 3: the engine is damaged (condition 1 → 0.75) before attempt 2's burn.
  const v = V(rawAging);
  const c3 = v.cases[2]!;
  const recs: AttemptRecord[] = c3.attempts.map((a, i) => {
    const rec = recordFromAttempt(a as AttemptJson, i + 1, {
      encounterId: 'range',
      mass: MASS,
      thrust: 0.02 * MASS,
    });
    const damaged = a.id === 'att2';
    return damaged
      ? {
          ...rec,
          events: [{ kind: 'condition-changed', t: 3600, equipment: 'main', condition: 0.75 }],
        }
      : rec;
  });
  const svc = new ModelService(
    context(
      [{ id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 }],
      0.02 * MASS,
      { maxSegment: 1200 },
    ),
  );
  const state = svc.load({ attempts: recs });
  type PerArcJson = Record<
    string,
    { kE: number; sigma: number; deviationPriorSigma: Record<string, number> }
  >;
  const ref = (
    c3.fits.find((f) => f.id === 'per-arc-deviation') as unknown as { perArc: PerArcJson }
  ).perArc;

  it('recovers the healthy and the damaged engine scale, each from its own attempt', () => {
    for (const id of ['att1', 'att2']) {
      const p = perArc(state, 'thruster.main.scale', id);
      expect(Math.abs(p.value - ref[id]!.kE), id).toBeLessThan(0.05 * ref[id]!.sigma);
      expect(Math.abs(p.freshness!.sigmaMeasured / ref[id]!.sigma - 1), id).toBeLessThan(0.05);
    }
    expect(state.fit!.chi2 / state.fit!.nu).toBeLessThan(1.2);
  });

  it('sets each deviation prior from that attempt’s aging (time, Δv, condition lost)', () => {
    const prm = svc.snapshot.derived.problem.params;
    for (const id of ['att1', 'att2']) {
      const d = prm.find((q) => q.name === `${id}.thruster.main.scale.d`)!;
      expect(Math.abs(d.priorSigma! / ref[id]!.deviationPriorSigma['engine.kE']! - 1)).toBeLessThan(
        1e-6,
      );
    }
    const f2 = perArc(state, 'thruster.main.scale', 'att2').freshness!;
    expect(f2.lastMeasured).toEqual({ attempt: 'att2', t: 15600 });
    expect(f2.since.shipTime).toBe(0);
  });

  it('ages the engine terms a forecast uses until new data re-earn them', () => {
    const now = new ModelService(
      context(
        [{ id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 }],
        0.02 * MASS,
        { maxSegment: 1200 },
      ),
    );
    now.load({ attempts: [recs[0]!] });
    const burn: Plan = {
      id: 'b',
      epoch: 0,
      items: [
        {
          id: 'i',
          at: 0,
          command: {
            kind: 'burn',
            thruster: 'main',
            throttle: 1,
            duration: 60,
            attitude: { reference: 'inertial', attitude: quat.fromYaw(0) },
          },
        },
      ],
    };
    const sigmaAt = (t: number) => {
      const { draft } = now.forecast({
        id: `f${t}`,
        attemptId: 'att1',
        issuedAt: t,
        plan: { ...burn, epoch: t },
        massProperties,
        step: 600,
        duration: 1200,
      });
      const e = draft.inputs.engine!;
      const i = e.covariance.ids.indexOf('thruster.main.scale');
      return {
        value: e.values['thruster.main.scale']!,
        sigma: Math.sqrt(e.covariance.values[i * e.covariance.ids.length + i]!),
      };
    };
    const soon = sigmaAt(15600);
    const later = sigmaAt(15600 + 10 * 86400);
    expect(Math.abs(soon.value - ref['att1']!.kE)).toBeLessThan(ref['att1']!.sigma);
    expect(soon.sigma).toBeLessThan(2 * ref['att1']!.sigma);
    // Ten days later the scale has loosened by 0.2%/√day: about 0.0063.
    expect(later.sigma).toBeGreaterThan(0.006);
  });

  it('carries the calibration to a later encounter, aged by the transit (spec §11.5)', () => {
    const transit = {
      from: 'att2',
      shipTime: 12 * 86400,
      deltaV: 250,
      powerCycles: 6,
      conditionChanges: [
        { kind: 'condition-changed' as const, t: 0, equipment: 'main', condition: 0.6 },
      ],
    };
    const priors = carriedCalibration(state, transit, { carrying: recs[1]! });
    const kE = priors.find((p) => p.id === 'thruster.main.scale')!;
    const used = perArc(state, 'thruster.main.scale', 'att2');
    expect(kE.value).toBe(used.value);
    // 12 days, 250 m/s, condition 0.75 → 0.6 loses 0.15: σ² grows by 0.002²·12 + 0.005²·2.5 + (0.1·0.15)².
    const added = 0.002 ** 2 * 12 + 0.005 ** 2 * 2.5 + (0.1 * 0.15) ** 2;
    expect(kE.sigma).toBeCloseTo(Math.sqrt(used.sigma ** 2 + added), 10);
    expect(priors.some((p) => p.id.startsWith('body.'))).toBe(false);
  });
});

describe('a carried rule in a later encounter (carried-rule-forecast through the game layer)', () => {
  const v = V(rawCarried);
  const c = v.cases[0]! as unknown as {
    attempts: AttemptJson[];
    now: number;
    plan: {
      commands: { t0: number; t1: number; u: number; theta: number }[];
      checkpoints: number[];
    };
    forecasts: {
      model: string;
      points: {
        t: number;
        truth: [number, number];
        insideValidated: boolean;
        withinHorizon: boolean;
        rangePredicted: number;
      }[];
    }[];
  };
  const rec = {
    ...recordFromAttempt(c.attempts[0]!, 1, {
      encounterId: 'range',
      mass: MASS,
      thrust: 0.115 * MASS,
    }),
    outcome: { kind: 'in-progress' } as const,
  };
  // The rule was tested in an earlier encounter around another body ('alpha').
  const earlier: ExtensionRecord = {
    state: {
      id: 'distance-law',
      status: 'candidate',
      validatedSpans: [
        { body: 'alpha', rMin: 0.6e6, rMax: 1.4e6, sigmaE: 0.0185, heldOutAttempt: 'old-0003' },
      ],
    },
    training: ['old-0001', 'old-0002'],
    heldOut: 'old-0003',
    adoptable: true,
  };
  const priors: ParameterPrior[] = [
    { id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 6.1e9, sigma: 2e8 },
    {
      id: 'law.gravity.exponent',
      label: 'n',
      unit: '',
      value: 2.5,
      sigma: 1.2e-4,
      extension: 'distance-law',
    },
    { id: 'thruster.main.scale', label: 'kE', unit: '', value: 0.97, sigma: 0.003 },
    { id: 'thruster.main.misalignment', label: 'dE', unit: 'rad', value: 0.004, sigma: 0.001 },
  ];
  const run = (tests: ExtensionRecord[], adopted: string[], sharedLaw = 1) => {
    const svc = new ModelService(
      context(priors, 0.115 * MASS, { validatedRangeSharedLaw: sharedLaw }),
    );
    svc.load({ attempts: [], extensions: tests, adopted });
    svc.beginAttempt(rec);
    svc.refresh();
    const plan: Plan = {
      id: 'dive',
      epoch: c.now,
      items: c.plan.commands.map((q, i) => ({
        id: `i${i}`,
        at: q.t0 - c.now,
        command: {
          kind: 'burn',
          thruster: 'main',
          throttle: 1,
          duration: q.t1 - q.t0,
          attitude: { reference: 'inertial', attitude: quat.fromYaw(q.theta) },
        },
      })),
    };
    return svc.forecast({
      id: 'f',
      issuedAt: c.now,
      plan,
      massProperties,
      step: 1800,
      duration: 10 * 3600,
    });
  };
  const carried = run([earlier], ['distance-law']);
  const truth = c.forecasts.find((f) => f.model === 'carried-rule')!.points;

  it('applies the earned hedge inside the validated span around the new body, the default outside', () => {
    const inp = carried.draft.inputs;
    expect(inp.hedge).toBe(0.3);
    expect(inp.earnedHedge).toEqual({ A: { sigma: 0.0185, spans: [[0.6e6, 1.4e6]] } });
    const byT = new Map(carried.draft.samples.map((s) => [s.t, s]));
    let validated = 0;
    for (const p of truth) {
      const s = byT.get(p.t);
      if (!s) continue;
      const r = Math.hypot(s.position.x, s.position.y);
      if (s.validated) {
        validated++;
        expect(s.extrapolating).toBe(true);
        expect(r).toBeGreaterThanOrEqual(0.6e6);
      }
      const cov = fromRows([
        [s.positionCov[0], s.positionCov[1]],
        [s.positionCov[1], s.positionCov[3]],
      ]);
      expect(
        mahalanobis([p.truth[0] - s.position.x, p.truth[1] - s.position.y], cov),
        `t=${p.t}`,
      ).toBeLessThan(3);
    }
    expect(validated).toBeGreaterThanOrEqual(3);
    // It runs through the validated span and ends below it, where the default hedge takes over.
    const last = carried.draft.samples[carried.draft.samples.length - 1]!;
    expect(Math.hypot(last.position.x, last.position.y)).toBeLessThan(0.6e6);
    expect(carried.draft.horizon).toBeLessThan(c.now + 10 * 3600);
  });

  it('without the rule, or with the strict same-body reading, the forecast ends earlier', () => {
    const none = run([], []);
    const strict = run([earlier], ['distance-law'], 0);
    expect(none.draft.horizon).toBeLessThan(carried.draft.horizon);
    expect(strict.draft.inputs.earnedHedge).toBeUndefined();
    expect(strict.draft.samples.some((s) => s.validated)).toBe(false);
  });
});
