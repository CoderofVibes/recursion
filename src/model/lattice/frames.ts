/**
 * The lattice's recorded channels as the model reads them (DECISIONS A16; 3C's handoff, R9).
 *
 * `lattice.angular-fragments.v2` frames and `lattice.raw-tile.v1` tiles arrive as ordinary
 * `field-signal` measurements. They are decoded with 3C's own decoders
 * (`src/ship/sensors/lattice-observations.ts`, `lattice-diagnostic-observations.ts`, recorded data
 * only), into 3C's typed contracts (`src/contracts/lattice-acquisition.ts`), so the model and the
 * sensor share one definition of the wire format. A malformed or unknown frame is rejected,
 * never guessed at.
 *
 * Recorded data only (P11): an angular frame carries anonymous image fragments in a measured
 * body-frame camera basis, never truth strands, layers, world coordinates or the true pose.
 */

import type {
  AttemptRecord,
  LatticeAngularFragment,
  LatticeObservationFrame,
  Measurement,
} from '../../contracts/index.ts';
import {
  LATTICE_DIAGNOSTIC_CHANNEL,
  decodeLatticeDiagnostic,
} from '../../ship/sensors/lattice-diagnostic-observations.ts';
import { LATTICE_CHANNEL, decodeLatticeFrame } from '../../ship/sensors/lattice-observations.ts';

export { LATTICE_CHANNEL, decodeLatticeFrame };
export const LATTICE_TILE_CHANNEL = LATTICE_DIAGNOSTIC_CHANNEL;

/** 3C's fragment and frame (`src/contracts/lattice-acquisition.ts`). */
export type AngularFragment = LatticeAngularFragment;
export type AngularFrame = LatticeObservationFrame;

/**
 * An attempt's angular frames, decoded, in canonical acquisition order (end of the acquisition
 * interval, then field, then sequence), each with its measurement's place in the record and its
 * size as recorded. Only frames available by `asOf` are returned: a product not yet delivered
 * is not yet known.
 */
export function latticeFrames(
  rec: Pick<AttemptRecord, 'measurements'>,
  asOf = Infinity,
): { readonly frame: AngularFrame; readonly index: number; readonly bytes: number }[] {
  const out: { frame: AngularFrame; index: number; bytes: number }[] = [];
  const enc = new TextEncoder();
  rec.measurements.forEach((m, index) => {
    if (m.t > asOf) return;
    const frame = decodeLatticeFrame(m);
    if (frame) out.push({ frame, index, bytes: enc.encode(JSON.stringify(m)).length });
  });
  return out.sort(
    (p, q) =>
      p.frame.acquisition[1] - q.frame.acquisition[1] ||
      (p.frame.field < q.frame.field ? -1 : p.frame.field > q.frame.field ? 1 : 0) ||
      p.frame.sequence - q.frame.sequence,
  );
}

/** The parts of a raw diagnostic tile a loss review needs. */
export interface TileSummary {
  readonly id: string;
  readonly field: string;
  readonly sequence: number;
  readonly acquisition: readonly [number, number];
  readonly availableAt: number;
  readonly bytes: number;
}

/**
 * A raw tile's identity, times and size, through 3C's decoder. The tile is an 8×8 camera-local
 * diagnostic image (3C): it never becomes a point, a fit or a clear-space certificate here.
 */
export function readTile(m: Measurement): TileSummary | undefined {
  const tile = decodeLatticeDiagnostic(m);
  if (!tile) return;
  return {
    id: tile.id,
    field: tile.field,
    sequence: tile.sequence,
    acquisition: tile.acquisition,
    availableAt: tile.availableAt,
    bytes: new TextEncoder().encode(JSON.stringify(m)).length,
  };
}
