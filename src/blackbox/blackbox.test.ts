/**
 * Black Box: recorder, storage, rebuild of the model from records (P8), comparison analytics
 * and procedures (P9). Scenario data are 1G's forecast-envelope vector turned into records.
 */

import { describe, expect, it } from 'vitest';
import rawForecast from '../../tests/vectors/estimator/forecast-envelope.json?raw';
import type {
  AttemptRecord,
  MassProperties,
  Measurement,
  ModelState,
  Plan,
} from '../contracts/index.ts';
import { cov3FromPlanar, isotropicInertia, issueForecast, prismHull } from '../contracts/index.ts';
import { hashState } from '../lib/hash.ts';
import * as quat from '../lib/quat.ts';
import type { ModelContext } from '../model/engine.ts';
import { ModelService } from '../model/service.ts';
import { recordFromAttempt, testShip, type VectorJson } from '../model/vector-harness.ts';
import { emptyArchive, nextAttemptIndex, withAttempt, withProcedure } from './archive.ts';
import { compareAttempts, diffCommands, forecastDivergence } from './compare.ts';
import { matchProcedure, procedurePlan, saveProcedure } from './procedures.ts';
import { AttemptRecorder, START_CURSOR, attemptId, type RecordCursor } from './recorder.ts';
import { MemoryBlackBoxStore } from './store.ts';

const MASS = 30000;
const THRUST = 0.15 * MASS;
const v = JSON.parse(rawForecast) as VectorJson;
const recs = v.cases[0]!.attempts.map((a, i) =>
  recordFromAttempt(a, i + 1, { encounterId: 'range', mass: MASS, thrust: THRUST }),
);

const ctx: ModelContext = {
  encounterId: 'range',
  priors: [
    { id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 },
    { id: 'thruster.main.scale', label: 'kE', unit: '', value: 0.97, sigma: 0.003 },
    { id: 'thruster.main.misalignment', label: 'dE', unit: 'rad', value: 0.004, sigma: 0.001 },
  ],
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
  ship: testShip(MASS, THRUST),
  arrival: recs[0]!.start.estimate,
  settings: { dt: 60 },
};

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

const content = (s: ModelState) => {
  const { version: _v, parent: _p, ...rest } = s;
  return rest;
};

function recorderFor(rec: AttemptRecord): AttemptRecorder {
  return new AttemptRecorder({
    id: rec.id,
    index: rec.index,
    encounterId: rec.encounterId,
    startedAt: rec.startedAt,
    start: rec.start,
  });
}

describe('recorder', () => {
  it('appends in acquisition order, refuses out-of-order data and unissued forecasts', () => {
    const r = new AttemptRecorder({
      id: attemptId(1),
      index: 1,
      encounterId: 'range',
      startedAt: 'x',
      start: recs[0]!.start,
    });
    const m = (t: number): Measurement => ({
      kind: 'bearing',
      t,
      source: 'cam',
      target: 'A',
      value: [0, 0],
      sigma: [1e-4, 1e-4],
    });
    r.recordMeasurements([m(0), m(1), m(1)]);
    expect(() => r.recordMeasurements([m(0.5)])).toThrow(/acquisition order/);
    expect(r.snapshot().measurements.map((q) => q.t)).toEqual([0, 1, 1]);
    const draft = {
      id: 'f',
      attemptId: attemptId(1),
      issuedAt: 0,
      modelVersion: 1,
      inputs: {},
      horizon: 0,
      samples: [],
      objects: [],
      closestApproaches: [],
    };
    expect(() => r.recordForecast(draft as never)).toThrow(/issued/);
    r.recordForecast(issueForecast(draft as never));
    const snap = r.snapshot();
    r.recordMeasurements([m(2)]);
    expect(snap.measurements.length).toBe(3);
    const fin = r.end({ kind: 'lost', t: 2, cause: 'collision' }, 7);
    expect(Object.isFrozen(fin)).toBe(true);
    expect(Object.isFrozen(fin.measurements[0])).toBe(true);
    expect(fin.measurements.length).toBe(4); // data up to the moment of loss is kept
    expect(fin.modelVersionAtEnd).toBe(7);
    expect(() => r.recordMeasurements([m(3)])).toThrow(/ended/);
    expect(attemptId(12)).toBe('attempt-0012');
  });
});

describe('storage and rebuild (P8)', () => {
  it(
    'records survive storage; forecasts come back issued; the rebuilt model equals the live one',
    { timeout: 60_000 },
    async () => {
      const store = new MemoryBlackBoxStore();
      let archive = emptyArchive();
      const live = new ModelService(ctx);
      live.load({ attempts: [] });
      let issued: ReturnType<typeof issueForecast> | null = null;
      for (const rec of recs) {
        const r = recorderFor(rec);
        live.beginAttempt(r.snapshot());
        let cursor: RecordCursor = START_CURSOR;
        const ms = rec.measurements;
        for (let i = 0; i < ms.length; i += 120) {
          r.recordMeasurements(ms.slice(i, i + 120));
          const { delta, cursor: next } = r.since(cursor);
          cursor = next;
          live.append(rec.id, delta);
          live.refresh();
          await store.putAttempt(r.snapshot()); // in-progress saves keep data through a closed tab
        }
        if (rec.id === 'att3') {
          const plan: Plan = { id: 'coast', epoch: 14400, items: [] };
          r.recordPlan(plan);
          const { draft } = live.forecast({
            id: 'f-att3',
            issuedAt: 14400,
            plan,
            massProperties,
            step: 600,
            duration: 7200,
          });
          issued = issueForecast(draft);
          r.recordForecast(issued);
          const d = r.since(cursor);
          live.append(rec.id, d.delta);
        }
        const fin = r.end(
          { kind: 'recalled', t: rec.outcome.kind === 'recalled' ? rec.outcome.t : 0 },
          live.state.version,
        );
        live.endAttempt(fin);
        await store.putAttempt(fin);
        archive = withAttempt(archive, fin);
      }
      expect(nextAttemptIndex(archive)).toBe(4);
      await store.putMeta({ adoptedExtensions: [], leads: [], extensionTests: [] });
      const loaded = await store.load();
      expect(loaded.archive.attempts.map((a) => a.id)).toEqual(['att1', 'att2', 'att3']);
      const f = loaded.archive.attempts[2]!.forecasts[0]!;
      expect(Object.isFrozen(f) && Object.isFrozen(f.samples)).toBe(true);
      expect(hashState(f)).toBe(hashState(issued));
      const rebuilt = new ModelService(ctx);
      rebuilt.load({
        attempts: loaded.archive.attempts,
        extensions: loaded.archive.extensionTests,
        adopted: loaded.archive.adoptedExtensions,
      });
      expect(hashState(content(rebuilt.state))).toBe(hashState(content(live.state)));
    },
  );
});

describe('comparison analytics', () => {
  const svc = new ModelService(ctx);
  svc.load({ attempts: [recs[1]!] });
  // Attempt att1: its forecast at 6 h assumes coasting, which is what happened.
  // Attempt B flies the same arc, but its forecast assumed a burn that was never executed.
  const half = 21600;
  const partial: AttemptRecord = {
    ...recs[0]!,
    measurements: recs[0]!.measurements.filter((m) => m.t <= half),
    outcome: { kind: 'in-progress' },
  };
  svc.beginAttempt(partial);
  svc.refresh();
  const coast: Plan = { id: 'coast', epoch: half, items: [] };
  const burn: Plan = {
    id: 'burn',
    epoch: half,
    items: [
      {
        id: 'b1',
        at: 0,
        command: {
          kind: 'burn',
          thruster: 'main',
          throttle: 0.2,
          duration: 60,
          attitude: { reference: 'prograde' },
        },
      },
    ],
  };
  const fc = (plan: Plan, att: string) =>
    issueForecast({
      ...svc.forecast({
        id: `f-${plan.id}`,
        issuedAt: half,
        plan,
        massProperties,
        step: 300,
        duration: 6 * 3600,
      }).draft,
      attemptId: att,
    });
  const a: AttemptRecord = { ...recs[0]!, plans: [coast], forecasts: [fc(coast, 'att1')] };
  const b: AttemptRecord = {
    ...recs[0]!,
    id: 'B',
    index: 2,
    plans: [burn],
    forecasts: [fc(burn, 'B')],
    events: [{ kind: 'configuration-changed', t: 100, configuration: 'radiators' }],
  };

  it('finds where the outcome left the forecast, and where it did not', () => {
    const da = forecastDivergence(a.forecasts[0]!, a);
    const db = forecastDivergence(b.forecasts[0]!, b);
    expect(da.points.length).toBeGreaterThan(50);
    expect(da.firstBeyond3Sigma).toBeNull();
    expect(db.firstBeyond3Sigma).not.toBeNull();
    expect(db.maxSigmas!).toBeGreaterThan(10);
    expect(da.unmeasured).toBe(false);
  });

  it('diffs configuration and plans, splits residuals, reports missing data', () => {
    svc.endAttempt(recs[0]!);
    const report = svc.report();
    const cmp = compareAttempts(a, b, report);
    expect(cmp.configurationDiffers).toBe(true);
    expect(cmp.plans).toEqual([expect.objectContaining({ kind: 'only-b' })]);
    expect(cmp.a.residuals.coast.length).toBeGreaterThan(0);
    expect(cmp.a.residuals.powered.length).toBe(0);
    expect(cmp.a.strength[0]!.points.length).toBeGreaterThan(0);
    expect(cmp.b.strength[0]!.points.length).toBe(0);
    expect(cmp.b.missing).toContain('no fitted measurements in this attempt');
    const noModel = compareAttempts(a, b);
    expect(noModel.a.missing).toContain('no model report: residuals and strength not available');
  });

  it('pairs commands by kind and equipment and names the fields that changed', () => {
    const d = diffCommands(
      [{ t: 10, command: { kind: 'burn', thruster: 'main', throttle: 1, duration: 60 } }],
      [
        { t: 10, command: { kind: 'burn', thruster: 'main', throttle: 0.5, duration: 60 } },
        { t: 30, command: { kind: 'mark', label: 'x' } },
      ],
    );
    expect(d).toEqual([
      expect.objectContaining({ kind: 'changed', fields: ['throttle'] }),
      expect.objectContaining({ kind: 'only-b' }),
    ]);
  });
});

describe('procedures (P9)', () => {
  const rec: AttemptRecord = {
    ...recs[0]!,
    executed: [
      {
        t: 50,
        command: { kind: 'attitude', target: { reference: 'inertial', attitude: quat.fromYaw(1) } },
        source: 'manual',
        status: 'executed',
      },
      {
        t: 100,
        command: { kind: 'burn', thruster: 'main', throttle: 1, duration: 30 },
        source: 'plan',
        status: 'executed',
      },
      {
        t: 120,
        command: { kind: 'burn', thruster: 'main', throttle: 2, duration: 30 },
        source: 'plan',
        status: 'rejected',
      },
      {
        t: 140,
        command: { kind: 'cutoff', thruster: 'all' },
        source: 'protection',
        status: 'executed',
      },
      { t: 900, command: { kind: 'mark', label: 'later' }, source: 'manual', status: 'executed' },
    ],
  };
  const tolerance = { position: 5e3, velocity: 2, attitude: 0.05 };

  it('saves the executed sequence with its start conditions', () => {
    const p = saveProcedure({
      id: 'pr1',
      name: 'Slingshot',
      record: rec,
      from: 0,
      to: 600,
      tolerance,
    });
    expect(p.items.map((i) => [i.at, i.command.kind])).toEqual([
      [50, 'attitude'],
      [100, 'burn'],
    ]);
    expect(p.condition.position).toEqual(rec.start.estimate.position);
    expect(p.origin).toEqual({ attemptId: rec.id, t: 0 });
    expect(() =>
      saveProcedure({ id: 'x', name: 'x', record: rec, from: 60, to: 600, tolerance }),
    ).toThrow(/believed state/);
    const plan = procedurePlan(p, 'plan-9', 0);
    expect(plan.fromProcedure).toBe('pr1');
    expect(plan.items[1]!.at).toBe(100);
    expect(withProcedure(emptyArchive(), p).procedures).toHaveLength(1);
  });

  it('reports whether current conditions match its origin', () => {
    const p = saveProcedure({
      id: 'pr1',
      name: 'Slingshot',
      record: rec,
      from: 0,
      to: 600,
      tolerance,
    });
    const here = { encounterId: 'range', configuration: 'stowed', estimate: rec.start.estimate };
    expect(matchProcedure(p, here).matches).toBe(true);
    const moved = {
      ...here,
      estimate: {
        ...rec.start.estimate,
        position: { x: rec.start.estimate.position.x + 1e4, y: 0, z: 0 },
        velocity: { x: 0, y: 3, z: 0 },
      },
    };
    const m = matchProcedure(p, moved);
    expect(m.matches).toBe(false);
    expect(m.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(['position', 'velocity']);
    expect(
      matchProcedure(p, { ...here, configuration: 'radiators' }).checks.find(
        (c) => c.name === 'configuration',
      )!.ok,
    ).toBe(false);
  });
});
