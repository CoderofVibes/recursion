/**
 * The lattice as the ship believes it, for FLIGHT and the loss review (DECISIONS A16; 3C R9).
 *
 * `latticeFields` rebuilds an attempt's lattice from its own records (frames up to `now`, poses
 * from the model's believed path) and returns one `BelievedField` per recorded field, whose
 * `visual` follows 3C's display schema `lattice-observations-v1`
 * (`src/view3d/fields/lattice/data.ts`). Nothing in it comes from truth: no layout, no seed, no
 * strand or layer identity, no true pose.
 *
 * - `frameId` and `attemptId` name the run the geometry belongs to: an earlier attempt's lattice
 *   is an archive view in that run's frame, never the current map (S17: new-run invalidation).
 * - Strands are reconstructed chains only; coverage is `unresolved` wherever the camera looked,
 *   and absent elsewhere (unknown). Nothing is certified clear.
 * - `processing` comes from the latest processed frame (its delivery time and processor draw);
 *   no frame, no report: the display then never shows the function as live.
 * - `reconstruction` (outside 3C's schema, which ignores it) records the algorithm version, the
 *   settings' hash and the model version, and what was and was not used.
 */

import type { AttemptRecord, BelievedField, JsonValue } from '../../contracts/index.ts';
import type { ModelContext, ModelSnapshot } from '../engine.ts';
import { latticeFrames } from './frames.ts';
import { believedPoses } from './poses.ts';
import {
  LATTICE_SETTINGS,
  reconstructLattice,
  type LatticeReconstruction,
  type LatticeSettings,
  type PosedFrame,
} from './reconstruct.ts';

/** The processor's mode that runs the function (3C's `latticeModeCommands`). */
const PROCESSOR = 'science-processor';
const LATTICE_MODE = 'lattice';
/** [ASSUMED] Below this draw the processor makes no new features (S17's processor response). */
const MIN_PROCESSOR_W = 350;
const FULL_PROCESSOR_W = 1000;

export interface LatticeFields {
  readonly fields: readonly BelievedField[];
  readonly reconstruction: LatticeReconstruction;
}

/** Whether the function was switched on at `now`: the processor's last commanded mode. */
function enabledAt(rec: AttemptRecord, now: number): boolean {
  let mode: string | undefined;
  for (const e of rec.executed) {
    if (e.t > now || e.status !== 'executed') continue;
    const c = e.command as { kind: string; equipment?: string; mode?: string };
    if (c.kind === 'mode' && c.equipment === PROCESSOR) mode = c.mode;
  }
  return mode === LATTICE_MODE;
}

export function latticeFields(
  snap: ModelSnapshot,
  ctx: ModelContext,
  rec: AttemptRecord,
  now = Infinity,
  settings: LatticeSettings = LATTICE_SETTINGS,
): LatticeFields {
  const frames = latticeFrames(rec, now);
  const bySource = new Map<string, number[]>();
  frames.forEach(({ frame }, i) =>
    bySource.set(frame.source, [...(bySource.get(frame.source) ?? []), i]),
  );
  const poses = new Array<PosedFrame['pose']>(frames.length).fill(null);
  for (const [source, idxs] of bySource) {
    const got = believedPoses(
      snap,
      ctx,
      rec,
      idxs.map((i) => 0.5 * (frames[i]!.frame.acquisition[0] + frames[i]!.frame.acquisition[1])),
      source,
    );
    idxs.forEach((i, k) => (poses[i] = got[k] ?? null));
  }
  const posed: PosedFrame[] = frames.map(({ frame }, i) => ({
    frame,
    pose: poses[i] ?? null,
    sampleId: `${rec.id}/${frame.id}`,
  }));
  const reconstruction = reconstructLattice(posed, rec.id, settings);
  const enabled = enabledAt(rec, now);
  const fields: BelievedField[] = reconstruction.fields.map((f) => {
    const mine = frames.filter((q) => q.frame.field === f.field);
    const latest = mine.reduce(
      (a, q) => (!a || q.frame.availableAt > a.frame.availableAt ? q : a),
      undefined as (typeof mine)[number] | undefined,
    )?.frame;
    const supported = f.nodes.filter((n) => n.supported).length;
    const reasons: Record<string, number> = {};
    for (const n of f.nodes) if (n.reason) reasons[n.reason] = (reasons[n.reason] ?? 0) + 1;
    const limitation = [
      `${supported} of ${f.nodes.length} fitted features supported by held-out frames`,
      f.framesWithoutPose > 0 ? `${f.framesWithoutPose} frames without a believed pose` : null,
      'no calibrated detection model: no space is certified clear',
    ]
      .filter((x): x is string => x !== null)
      .join('; ');
    const visual = {
      schema: 'lattice-observations-v1',
      frameId: `${rec.id}:briefing-inertial`,
      attemptId: rec.id,
      updatedAt: latest?.availableAt ?? 0,
      enabled,
      quality: latest
        ? Math.min(
            1,
            Math.max(
              0,
              (latest.processorPower - MIN_PROCESSOR_W) / (FULL_PROCESSOR_W - MIN_PROCESSOR_W),
            ),
          )
        : 0,
      ...(latest
        ? {
            processing: {
              reportedAt: latest.availableAt,
              validUntil: latest.availableAt + Math.max(2 / latest.effectiveRate, 1),
              available: latest.processorPower >= MIN_PROCESSOR_W,
            },
          }
        : {}),
      requestedVolume: f.viewedVolume ?? {
        center: { x: 0, y: 0, z: 0 },
        halfSize: { x: 1, y: 1, z: 1 },
      },
      strands: f.strands.map((s) => ({
        id: s.id,
        points: s.points,
        sigmaM: s.sigmaM,
        confidence: s.confidence,
        sampleIds: s.sampleIds,
        observedFrom: s.observedFrom,
        observedTo: s.observedTo,
        validUntil: s.validUntil,
      })),
      coverage: f.coverage.map((c) => ({
        id: c.id,
        center: c.center,
        halfSize: c.halfSize,
        status: c.status,
        reason: c.reason,
        sampleIds: c.sampleIds,
        observedFrom: c.observedFrom,
        observedTo: c.observedTo,
        validUntil: c.validUntil,
      })),
      limitation,
      reconstruction: {
        version: reconstruction.version,
        settingsHash: reconstruction.settingsHash,
        modelVersion: snap.state.version,
        frames: f.frames,
        framesWithoutPose: f.framesWithoutPose,
        fragments: f.fragments,
        tracks: f.tracks,
        fittedFeatures: f.nodes.length,
        supportedFeatures: supported,
        rejected: reasons,
      },
    };
    return {
      id: f.field,
      kind: 'lattice',
      detected: f.strands.length > 0,
      visual: JSON.parse(JSON.stringify(visual)) as JsonValue,
    };
  });
  return { fields, reconstruction };
}
