/**
 * The lattice rebuilt through the model service from flight-like records (A16; 3C R9).
 *
 * A 160 m fence of twelve 80 m strands (S5's pitch) in a world with no gravity (a massless
 * survey rock as the primary, as in the chain-link briefing). The ship drifts past at 2 m/s,
 * turning slowly, and the camera points at the fence. Frames are made the way 3C's sensor makes
 * them (`src/ship/sensors/lattice.ts`): strands cut into pieces of at most 12 m, a piece seen
 * only when both its ends are inside the 30° cone and the range limit, each endpoint's slopes
 * drawn with their own noise in every fragment, a measured camera basis turned by one common
 * error per frame. Fragment and node identities are anonymous. The model navigates on its
 * arrival survey alone (0.5 m, 0.01 m/s; no fixes), with the star tracker's attitude records.
 * Truth only builds the records and judges the result (P11).
 */

import { describe, expect, it } from 'vitest';
import {
  isoCov3,
  type AttemptRecord,
  type ExecutedCommand,
  type Measurement,
  type Vec3,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import { createRng } from '../lib/rng.ts';
import type { ModelContext } from './engine.ts';
import { encodeFrame } from './lattice-harness.ts';
import { ModelService } from './service.ts';
import { fromRows } from './linalg.ts';
import { mahalanobis } from './tierL.ts';
import { testShip } from './vector-harness.ts';

const CHI_3 = 3.763;
const MASS = 30000;
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3) => scale(a, 1 / Math.sqrt(dot(a, a)));
const lerp = (a: Vec3, b: Vec3, t: number) => add(a, scale(sub(b, a), t));

// The fence: nodes at y, z ∈ {−80, 0, 80}, x = 0; strands between neighbours.
const NODES = [-80, 0, 80].flatMap((y) => [-80, 0, 80].map((z) => ({ x: 0, y, z })));
const at = (y: number, z: number) => NODES.find((p) => p.y === y && p.z === z)!;
const SEGMENTS: { a: Vec3; b: Vec3 }[] = [];
for (const y of [-80, 0, 80])
  for (const z of [-80, 0]) SEGMENTS.push({ a: at(y, z), b: at(y, z + 80) });
for (const z of [-80, 0, 80])
  for (const y of [-80, 0]) SEGMENTS.push({ a: at(y, z), b: at(y + 80, z) });
/** Truth piece endpoints (3C cuts each strand into pieces of at most 12 m). */
const PIECES = SEGMENTS.flatMap((sg) => {
  const n = Math.ceil(80 / 12);
  return Array.from({ length: n }, (_, k) => ({
    a: lerp(sg.a, sg.b, k / n),
    b: lerp(sg.a, sg.b, (k + 1) / n),
  }));
});
const POINTS = (() => {
  const out: Vec3[] = [];
  for (const p of PIECES.flatMap((q) => [q.a, q.b]))
    if (!out.some((o) => Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) < 1e-6)) out.push(p);
  return out;
})();

const X0: Vec3 = { x: -160, y: -60, z: 10 };
const V: Vec3 = { x: 0.2, y: 2, z: 0 };
const YAW_RATE = 0.002;
const DT = 0.6;
const T_END = 72;
const shipAt = (t: number) => add(X0, scale(V, t));
const attitudeAt = (t: number) => quat.fromYaw(YAW_RATE * t);

function flight(seed = 1): AttemptRecord {
  const rng = createRng(seed).stream('lattice-flight');
  const ms: Measurement[] = [];
  const sigma = 5e-4;
  const basisSigma = 4e-5;
  for (let k = 0, t = 0; t <= T_END + 1e-9; k++, t = k * DT) {
    const q = attitudeAt(t);
    const o = shipAt(t);
    // The camera aims at the fence's centre; its basis in the body frame (3C's construction).
    const forward = norm(quat.rotateInverse(q, sub({ x: 0, y: 0, z: 0 }, o)));
    const right = norm(
      cross(Math.abs(forward.z) < 0.99 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }, forward),
    );
    const up = cross(forward, right);
    const err = quat.fromRotationVector({
      x: rng.normal(0, basisSigma),
      y: rng.normal(0, basisSigma),
      z: rng.normal(0, basisSigma),
    });
    const basis = {
      forward: quat.rotate(err, forward),
      right: quat.rotate(err, right),
      up: quat.rotate(err, up),
    };
    const half = Math.PI / 6;
    const fragments = [];
    for (const pc of PIECES) {
      const av = quat.rotateInverse(q, sub(pc.a, o));
      const bv = quat.rotateInverse(q, sub(pc.b, o));
      const inCone = (v: Vec3) => dot(v, forward) > 0 && Math.acos(dot(norm(v), forward)) < half;
      if (!inCone(av) || !inCone(bv)) continue;
      const slopes = (v: Vec3): [number, number] => [
        rng.normal(dot(v, right) / dot(v, forward), sigma),
        rng.normal(dot(v, up) / dot(v, forward), sigma),
      ];
      fragments.push({ start: slopes(av), end: slopes(bv), sigma });
    }
    ms.push(
      encodeFrame({
        field: 'fence',
        sequence: k,
        acquisition: [t, t],
        availableAt: t + 0.3,
        basis,
        basisSigma,
        fragments,
      }),
    );
    const phi = quat.toRotationVector(
      quat.multiply(
        q,
        quat.fromRotationVector({
          x: rng.normal(0, 4e-5),
          y: rng.normal(0, 4e-5),
          z: rng.normal(0, 4e-5),
        }),
      ),
    );
    ms.push({
      kind: 'attitude',
      t,
      source: 'st',
      value: [phi.x, phi.y, phi.z],
      sigma: [4e-5, 4e-5, 4e-5],
    });
  }
  ms.sort((a, b) => a.t - b.t);
  const on: ExecutedCommand = {
    t: 0,
    command: { kind: 'mode', equipment: 'science-processor', mode: 'lattice' },
    source: 'manual',
    status: 'executed',
  };
  const rng2 = createRng(seed).stream('arrival');
  const p = shipAt(0);
  return {
    id: `att${seed}`,
    index: seed,
    encounterId: 'cathedral',
    startedAt: '2026-11-15T00:00:00Z',
    start: {
      estimate: {
        t: 0,
        position: {
          x: p.x + rng2.normal(0, 0.5),
          y: p.y + rng2.normal(0, 0.5),
          z: p.z + rng2.normal(0, 0.5),
        },
        velocity: {
          x: V.x + rng2.normal(0, 0.01),
          y: V.y + rng2.normal(0, 0.01),
          z: V.z + rng2.normal(0, 0.01),
        },
        positionCov: isoCov3(0.5),
        velocityCov: isoCov3(0.01),
        attitude: attitudeAt(0),
        attitudeSigma: 4e-5,
        angularVelocity: { x: 0, y: 0, z: YAW_RATE },
      },
      configuration: 'radiators',
      modelVersion: 0,
    },
    plans: [],
    executed: [on],
    forecasts: [],
    measurements: ms,
    events: [],
    outcome: { kind: 'in-progress' },
    modelVersionAtEnd: 0,
  };
}

function context(rec: AttemptRecord): ModelContext {
  const ship = testShip(MASS, 150);
  return {
    encounterId: 'cathedral',
    priors: [{ id: 'body.ref.mu', label: 'Survey rock μ', unit: 'm³/s²', value: 0, sigma: 1e4 }],
    bodies: [
      {
        id: 'ref',
        name: 'Survey rock',
        position: { x: 0, y: 0, z: -2000 },
        velocity: { x: 0, y: 0, z: 0 },
        positionCov: isoCov3(0),
        radius: 24,
        tracked: false,
      },
    ],
    // The frames name the camera `camera`, as the ship's own does.
    ship: {
      ...ship,
      equipment: ship.equipment.map((e) =>
        e.kind === 'optical-tracker' ? { ...e, id: 'camera' } : e,
      ),
    },
    arrival: rec.start.estimate,
    settings: { dt: 30 },
  };
}

interface Strand {
  id: string;
  points: Vec3[];
  sigmaM: number;
  confidence: number;
  sampleIds: string[];
  observedFrom: number;
  observedTo: number;
  validUntil: number;
}
interface Visual {
  schema: string;
  frameId: string;
  attemptId: string;
  enabled: boolean;
  quality: number;
  processing?: { reportedAt: number; validUntil: number; available: boolean };
  strands: Strand[];
  coverage: { status: string; sampleIds: string[] }[];
  reconstruction: {
    version: number;
    frames: number;
    supportedFeatures: number;
    fittedFeatures: number;
  };
}

const nearest = (p: Vec3) => {
  let best = POINTS[0]!;
  for (const q of POINTS)
    if (
      Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) <
      Math.hypot(best.x - p.x, best.y - p.y, best.z - p.z)
    )
      best = q;
  return best;
};

describe('the lattice from a flight’s records, through the model', () => {
  const rec = flight();
  const svc = new ModelService(context(rec));
  svc.load({ attempts: [] });
  svc.beginAttempt(rec);
  svc.refresh();
  const [field] = svc.lattice();
  const visual = field!.visual as unknown as Visual;

  it('gives one believed field in 3C’s display schema, named for its own run', () => {
    expect(field!.id).toBe('fence');
    expect(field!.kind).toBe('lattice');
    expect(field!.detected).toBe(true);
    expect(visual.schema).toBe('lattice-observations-v1');
    expect(visual.attemptId).toBe(rec.id);
    expect(visual.frameId).toBe(`${rec.id}:briefing-inertial`);
    expect(visual.enabled).toBe(true);
    expect(visual.quality).toBe(1);
    expect(visual.processing?.available).toBe(true);
    expect(visual.reconstruction.frames).toBe(121);
    // Nothing is certified clear without a calibrated detection model.
    expect(visual.coverage.every((c) => c.status === 'unresolved')).toBe(true);
    for (const s of visual.strands) {
      expect(s.points.length).toBeGreaterThanOrEqual(2);
      expect(s.sampleIds.length).toBeGreaterThan(0);
      expect(s.observedFrom).toBeLessThanOrEqual(s.observedTo);
      expect(s.observedTo).toBeLessThanOrEqual(s.validUntil);
      expect(s.confidence).toBeGreaterThan(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('every supported point is a real strand point, within its stated uncertainty', () => {
    // Each against its own 3×3 covariance (the shared pose included). Over this many points, and
    // points sharing one pose error, the test is the tail: none beyond 5 (p ≈ 2e-5 each), and
    // no more than 2% beyond the 3σ of three numbers (3.76; p = 0.0027 each).
    const detail = svc.latticeDetail()!;
    const all = detail.fields[0]!.nodes;
    const nodes = all.filter((q) => q.supported);
    const m = nodes.map((q) => {
      const t = nearest(q.position);
      const c = q.covariance;
      return mahalanobis(
        [q.position.x - t.x, q.position.y - t.y, q.position.z - t.z],
        fromRows([
          [c[0], c[1], c[2]],
          [c[1], c[3], c[4]],
          [c[2], c[4], c[5]],
        ]),
      );
    });
    expect(nodes.length).toBeGreaterThan(0.6 * POINTS.length);
    expect(Math.max(...m)).toBeLessThan(5);
    expect(m.filter((x) => x > CHI_3).length).toBeLessThanOrEqual(Math.ceil(0.02 * m.length));
    // And every point a strand draws is one of them.
    const drawn = visual.strands.flatMap((s) => s.points);
    for (const p of drawn)
      expect(
        nodes.some((q) => q.position.x === p.x && q.position.y === p.y && q.position.z === p.z),
      ).toBe(true);
  });

  it('a strand joins only points that are neighbours on one real strand', () => {
    for (const s of visual.strands)
      for (let i = 1; i < s.points.length; i++) {
        const a = nearest(s.points[i - 1]!);
        const b = nearest(s.points[i]!);
        const piece = PIECES.some(
          (pc) =>
            (Math.hypot(pc.a.x - a.x, pc.a.y - a.y, pc.a.z - a.z) < 1e-6 &&
              Math.hypot(pc.b.x - b.x, pc.b.y - b.y, pc.b.z - b.z) < 1e-6) ||
            (Math.hypot(pc.a.x - b.x, pc.a.y - b.y, pc.a.z - b.z) < 1e-6 &&
              Math.hypot(pc.b.x - a.x, pc.b.y - a.y, pc.b.z - a.z) < 1e-6),
        );
        expect(piece, `${s.id} ${i}`).toBe(true);
      }
  });

  it('the believed poses carry the arrival survey: σ is not smaller than its 0.5 m', () => {
    for (const s of visual.strands) expect(s.sigmaM).toBeGreaterThan(0.5);
  });

  it('is rebuilt identically from the archived record (P8)', () => {
    const again = new ModelService(context(rec));
    again.load({ attempts: [{ ...rec, outcome: { kind: 'recalled', t: T_END + 1 } }] });
    expect(again.lattice(rec.id)).toEqual(svc.lattice());
  });

  it('uses only frames delivered by `now`, and an earlier run stays in its own frame', () => {
    const early = svc.lattice(undefined, 6)[0]!.visual as unknown as Visual;
    expect(early.reconstruction.frames).toBe(10);
    expect(early.strands).toEqual([]);
    // Recalled, then a new run: the old lattice is an archive view of the old attempt.
    const archive = new ModelService(context(rec));
    archive.load({ attempts: [{ ...rec, outcome: { kind: 'recalled', t: T_END + 1 } }] });
    const next = flight(2);
    archive.beginAttempt({
      ...next,
      measurements: next.measurements.filter((m) => m.kind === 'attitude'),
    });
    expect(archive.lattice()).toEqual([]);
    const old = archive.lattice(rec.id)[0]!.visual as unknown as Visual;
    expect(old.attemptId).toBe(rec.id);
    expect(old.frameId).toBe(`${rec.id}:briefing-inertial`);
  });
});

describe('association stays unresolved where it is ambiguous', () => {
  it('a repeated motif seen from too far for its pieces to separate draws nothing it cannot support', () => {
    // The same flight, but each frame's fragments shuffled and every endpoint noisier than its
    // neighbours' spacing: no node can be followed with confidence.
    const rec = flight(3);
    const noisy: Measurement[] = rec.measurements.map((m) => {
      if (m.kind !== 'field-signal') return m;
      const v = [...m.value];
      const count = v[22]!;
      for (let i = 0; i < count; i++)
        for (let c = 0; c < 4; c++) v[23 + i * 5 + c]! += Math.sin(1e3 * (m.t + i + c)) * 0.08;
      return { ...m, value: v };
    });
    const svc = new ModelService(context(rec));
    svc.load({ attempts: [] });
    svc.beginAttempt({ ...rec, measurements: noisy });
    svc.refresh();
    const visual = svc.lattice()[0]!.visual as unknown as Visual;
    expect(visual.strands).toEqual([]);
    expect(visual.reconstruction.supportedFeatures).toBe(0);
  });
});
