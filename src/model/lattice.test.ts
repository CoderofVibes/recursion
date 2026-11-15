/**
 * The lattice reconstruction (A16; 3C R9; S17 `docs/studies/s17/black-box.md`).
 *
 * First S17's independent reference (`tools/studies/s17/vectors.json`, `reconstruction`): four
 * anonymous junctions seen in 54 frames over 32.4 s from 120 m, the first 48 trained and the
 * last 6 held out, with a 0.5 m pose σ common to every frame. Its fit and covariances must be
 * reproduced, and its negative cases (six frames, no parallax, an occluded corner, no records)
 * must leave what they leave. The frames are encoded in 3C's `lattice.angular-fragments.v2`
 * layout (`src/ship/sensors/lattice-observations.ts`), each observed edge as one fragment.
 */

import { describe, expect, it } from 'vitest';
import rawS17 from '../../tools/studies/s17/vectors.json?raw';
import { isoCov3, type Measurement } from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import { decodeLatticeFrame, latticeFrames } from './lattice/frames.ts';
import { encodeFrame } from './lattice-harness.ts';
import {
  reconstructLattice,
  type CameraPose,
  type PosedFrame,
  type ReconstructedNode,
} from './lattice/reconstruct.ts';

interface S17Frame {
  readonly sequence: number;
  readonly t_s: number;
  readonly camera_position_estimate_m: readonly [number, number, number];
  readonly attitude_xyzw: readonly [number, number, number, number];
  readonly held_out: boolean;
  readonly detections: Readonly<Record<string, readonly [number, number]>>;
}
interface S17Feature {
  readonly position_m: readonly [number, number, number];
  readonly independent_covariance_m2: readonly (readonly [number, number, number])[];
  readonly covariance_with_common_pose_m2: readonly (readonly [number, number, number])[];
  readonly training_count: number;
  readonly held_out_rms_sigma: number;
}
const S17 = (
  JSON.parse(rawS17) as {
    reconstruction: {
      record: {
        slope_sigma: number;
        common_pose_sigma_m: number;
        observed_edges: readonly (readonly [string, string])[];
        frames: readonly S17Frame[];
      };
      expected: { features: Readonly<Record<string, S17Feature>> };
      truth_for_validation_only: Readonly<Record<string, readonly [number, number, number]>>;
    };
  }
).reconstruction;

const rec = S17.record;
const poseSigma = rec.common_pose_sigma_m;

/** S17's frames as records and poses; `edit` may change what each frame saw. */
function s17Frames(edit: (f: S17Frame) => S17Frame | null = (f) => f): {
  measurements: Measurement[];
  poses: Map<number, CameraPose>;
} {
  const measurements: Measurement[] = [];
  const poses = new Map<number, CameraPose>();
  for (const f0 of rec.frames) {
    const f = edit(f0);
    if (!f) continue;
    const fragments = rec.observed_edges
      .filter(([a, b]) => f.detections[a] && f.detections[b])
      .map(([a, b]) => ({
        start: f.detections[a]!,
        end: f.detections[b]!,
        sigma: rec.slope_sigma,
      }));
    measurements.push(
      encodeFrame({
        field: 'lattice',
        sequence: f.sequence,
        acquisition: [f.t_s, f.t_s],
        availableAt: f.t_s,
        fragments,
      }),
    );
    const [x, y, z, w] = f.attitude_xyzw;
    const p = f.camera_position_estimate_m;
    poses.set(f.sequence, {
      origin: { x: p[0], y: p[1], z: p[2] },
      attitude: quat.normalize({ w, x, y, z }),
      attitudeSigma: 0,
      originCov: isoCov3(poseSigma),
    });
  }
  return { measurements, poses };
}

function reconstruct(edit?: (f: S17Frame) => S17Frame | null) {
  const { measurements, poses } = s17Frames(edit);
  const posed: PosedFrame[] = latticeFrames({ measurements }).map(({ frame }) => ({
    frame,
    pose: poses.get(frame.sequence) ?? null,
    sampleId: `att1/${frame.id}`,
  }));
  return reconstructLattice(posed, 'att1');
}

/** The supported node nearest each validation-only truth junction. */
function matchJunctions(nodes: readonly ReconstructedNode[]) {
  const out: Record<string, ReconstructedNode> = {};
  for (const [id, t] of Object.entries(S17.truth_for_validation_only)) {
    let best: ReconstructedNode | undefined;
    let bd = Infinity;
    for (const n of nodes) {
      if (!n.supported) continue;
      const d = Math.hypot(n.position.x - t[0], n.position.y - t[1], n.position.z - t[2]);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best && bd < 10) out[id] = best;
  }
  return out;
}

const asMatrix = (c: readonly number[]) => [
  [c[0]!, c[1]!, c[2]!],
  [c[1]!, c[3]!, c[4]!],
  [c[2]!, c[4]!, c[5]!],
];

describe('the v2 frame decoder', () => {
  it('reads 3C’s layout and rejects malformed or unknown frames', () => {
    const m = encodeFrame({
      field: 'lattice',
      sequence: 4,
      acquisition: [1, 2],
      availableAt: 3,
      fragments: [{ start: [0.1, 0.2], end: [0.3, 0.4], sigma: 5e-4 }],
    });
    const f = decodeLatticeFrame(m)!;
    expect(f.id).toBe('lattice:frame:4');
    expect(f.acquisition).toEqual([1, 2]);
    expect(f.availableAt).toBe(3);
    expect(f.fragments[0]!.id).toBe('lattice:frame:4:fragment:0');
    expect(decodeLatticeFrame({ ...m, value: [3, ...m.value.slice(1)] })).toBeUndefined();
    expect(decodeLatticeFrame({ ...m, value: m.value.slice(0, -1) })).toBeUndefined();
    // Acquired after it became available: impossible, rejected.
    expect(decodeLatticeFrame({ ...m, t: 1.5 })).toBeUndefined();
    expect(decodeLatticeFrame({ ...m, channel: 'other' })).toBeUndefined();
  });
});

describe('S17’s reference reconstruction, from data only', () => {
  const all = reconstruct();
  const field = all.fields[0]!;
  const got = matchJunctions(field.nodes);

  it('resolves all four junctions as S17 does: fit, covariances, held-out test', () => {
    expect(Object.keys(got).sort()).toEqual(['f0', 'f1', 'f2', 'f3']);
    for (const [id, e] of Object.entries(S17.expected.features)) {
      const n = got[id]!;
      expect(n.training, id).toBe(e.training_count);
      expect(n.heldOut, id).toBe(rec.frames.length - e.training_count);
      const p = [n.position.x, n.position.y, n.position.z];
      p.forEach((x, c) =>
        expect(Math.abs(x - e.position_m[c]!), `${id} position ${c}`).toBeLessThan(1e-6),
      );
      const formal = asMatrix(n.formalCovariance);
      const total = asMatrix(n.covariance);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          expect(
            Math.abs(formal[i]![j]! - e.independent_covariance_m2[i]![j]!),
            `${id} C${i}${j}`,
          ).toBeLessThan(1e-6 * Math.abs(e.independent_covariance_m2[i]![i]!) + 1e-12);
          expect(Math.abs(total[i]![j]! - e.covariance_with_common_pose_m2[i]![j]!)).toBeLessThan(
            1e-6,
          );
        }
      expect(Math.abs(n.heldOutRms - e.held_out_rms_sigma), `${id} held-out`).toBeLessThan(1e-6);
      expect(n.supported).toBe(true);
    }
  });

  it('draws the observed quadrilateral as one strand, and nothing clear', () => {
    expect(field.strands).toHaveLength(1);
    const s = field.strands[0]!;
    // Closed: the four junctions and back to the first.
    expect(s.points).toHaveLength(5);
    expect(s.nodes[0]).toBe(s.nodes[4]);
    expect(s.sampleIds).toHaveLength(54);
    expect(s.sampleIds[0]).toBe('att1/lattice:frame:0');
    // About 0.56 m: the shared pose does not average away.
    expect(s.sigmaM).toBeGreaterThan(0.5);
    expect(s.sigmaM).toBeLessThan(0.6);
    // Without a calibrated detection model the opening stays unresolved (S17's check).
    expect(field.coverage.every((c) => c.status === 'unresolved')).toBe(true);
  });

  it('six frames have no held-out support: nothing is resolved', () => {
    const early = reconstruct((f) => (f.sequence < 6 ? f : null)).fields[0]!;
    expect(early.nodes.filter((n) => n.supported)).toEqual([]);
    expect(early.strands).toEqual([]);
    expect(early.nodes.every((n) => n.reason === 'too-few')).toBe(true);
  });

  it('a stationary camera has no parallax: depth stays unresolved', () => {
    const first = rec.frames[0]!;
    const still = reconstruct((f) => ({
      ...f,
      camera_position_estimate_m: first.camera_position_estimate_m,
      detections: first.detections,
    })).fields[0]!;
    expect(still.nodes.filter((n) => n.supported)).toEqual([]);
    expect(still.nodes.every((n) => n.reason === 'no-parallax')).toBe(true);
  });

  it('occluding f3 leaves that corner unresolved and the other three as before', () => {
    const occ = reconstruct((f) => {
      const rest = Object.fromEntries(Object.entries(f.detections).filter(([k]) => k !== 'f3'));
      return { ...f, detections: rest };
    }).fields[0]!;
    const m = matchJunctions(occ.nodes);
    expect(Object.keys(m).sort()).toEqual(['f0', 'f1', 'f2']);
    for (const id of ['f0', 'f1', 'f2']) {
      const e = S17.expected.features[id]!;
      expect(Math.abs(m[id]!.position.x - e.position_m[0])).toBeLessThan(1e-6);
    }
    // f0–f1–f2: an open strand, no edge to the unseen corner.
    expect(occ.strands).toHaveLength(1);
    expect(occ.strands[0]!.points).toHaveLength(3);
  });

  it('no recordings, no reconstruction', () => {
    expect(reconstruct(() => null).fields).toEqual([]);
  });

  it('frames recorded without a believed pose are kept as missing, never guessed', () => {
    const { measurements } = s17Frames();
    const posed = latticeFrames({ measurements }).map(({ frame }) => ({
      frame,
      pose: null,
      sampleId: frame.id,
    }));
    const r = reconstructLattice(posed, 'att1').fields[0]!;
    expect(r.frames).toBe(54);
    expect(r.framesWithoutPose).toBe(54);
    expect(r.nodes).toEqual([]);
  });
});
