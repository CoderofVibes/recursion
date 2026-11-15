/**
 * The lattice's recorded channels as the model reads them (DECISIONS A16; 3C's handoff, R9).
 *
 * `lattice.angular-fragments.v2` frames arrive as ordinary `field-signal` measurements. Their
 * layout is 3C's (`src/ship/sensors/lattice-observations.ts`, `encodeLatticeFrame`); this module
 * decodes it with the same validation, so a malformed or unknown frame is rejected rather than
 * guessed at. The types mirror 3C's frame structurally; when its typed contracts land
 * (`src/contracts/lattice-acquisition.ts`, R15) they can replace these with no change here.
 *
 * Recorded data only (P11): an angular frame carries anonymous image fragments in a measured
 * body-frame camera basis, never truth strands, layers, world coordinates or the true pose.
 */

import type { AttemptRecord, Measurement, Vec3 } from '../../contracts/index.ts';

export const LATTICE_CHANNEL = 'lattice.angular-fragments.v2';
export const LATTICE_TILE_CHANNEL = 'lattice.raw-tile.v1';

export interface AngularFragment {
  /** Observation-local identity (`<frame id>:fragment:<i>`), never a truth strand. */
  readonly id: string;
  /** Gnomonic image slopes (right/forward, up/forward) in the recorded camera basis. */
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly sigma: number;
}

export interface AngularFrame {
  readonly version: 2;
  /** `<field>:frame:<sequence>`. */
  readonly id: string;
  readonly field: string;
  readonly sequence: number;
  /** When the source rays were acquired: the pose that matters (3C). */
  readonly acquisition: readonly [number, number];
  /** When the processed product became available (`Measurement.t`). */
  readonly availableAt: number;
  readonly source: string;
  readonly processorPower: number;
  readonly cameraPower: number;
  readonly effectiveRate: number;
  readonly exposure: number;
  /** Measured camera basis in the body frame; one error rotates every ray of the frame. */
  readonly basis: { readonly forward: Vec3; readonly right: Vec3; readonly up: Vec3 };
  /** One-σ of that common rotation, rad. */
  readonly basisSigma: number;
  readonly basisCorrelation: 'frame-common-rotation';
  readonly coverage: {
    readonly status: 'unresolved';
    readonly halfAngle: number;
    readonly rangeLimit: number;
    readonly angularResolution: number;
    readonly truncated: boolean;
  };
  readonly fragments: readonly AngularFragment[];
}

const vector = (a: readonly number[], i: number): Vec3 => ({
  x: a[i]!,
  y: a[i + 1]!,
  z: a[i + 2]!,
});

/** Decode a v2 frame; undefined for anything else or anything malformed (never a guess). */
export function decodeLatticeFrame(m: Measurement): AngularFrame | undefined {
  if (m.kind !== 'field-signal' || m.channel !== LATTICE_CHANNEL || !m.field) return;
  const a = m.value;
  if (a.length < 23 || a[0] !== 2 || !a.every(Number.isFinite) || !Number.isFinite(m.t)) return;
  const count = a[22]!;
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    count > 128 ||
    a.length !== 23 + count * 5 ||
    !Number.isInteger(a[1]) ||
    a[1]! < 0 ||
    a[2]! > a[3]! ||
    a[3]! > m.t ||
    a[4]! < 0 ||
    a[5]! < 0 ||
    a[6]! <= 0 ||
    a[7]! <= 0 ||
    a[8]! <= 0 ||
    a[8]! >= Math.PI / 2 ||
    a[9]! <= 0 ||
    a[10]! <= 0 ||
    a[21]! <= 0
  )
    return;
  const id = `${m.field}:frame:${a[1]}`;
  const fragments: AngularFragment[] = [];
  for (let i = 0; i < count; i++) {
    const j = 23 + i * 5;
    if (a[j + 4]! <= 0) return;
    fragments.push({
      id: `${id}:fragment:${i}`,
      start: [a[j]!, a[j + 1]!],
      end: [a[j + 2]!, a[j + 3]!],
      sigma: a[j + 4]!,
    });
  }
  return {
    version: 2,
    id,
    field: m.field,
    sequence: a[1]!,
    source: m.source,
    acquisition: [a[2]!, a[3]!],
    availableAt: m.t,
    processorPower: a[4]!,
    cameraPower: a[5]!,
    effectiveRate: a[6]!,
    exposure: a[7]!,
    basis: { forward: vector(a, 12), right: vector(a, 15), up: vector(a, 18) },
    basisSigma: a[21]!,
    basisCorrelation: 'frame-common-rotation',
    coverage: {
      status: 'unresolved',
      halfAngle: a[8]!,
      rangeLimit: a[9]!,
      angularResolution: a[10]!,
      truncated: a[11] !== 0,
    },
    fragments,
  };
}

/**
 * An attempt's angular frames, decoded, in canonical acquisition order (end of the acquisition
 * interval, then field, then sequence), each with its measurement's place in the record. Only
 * frames available by `asOf` are returned: a product not yet delivered is not yet known.
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

/** The parts of a raw diagnostic tile (3C's `lattice.raw-tile.v1`) a loss review needs. */
export interface TileSummary {
  readonly id: string;
  readonly field: string;
  readonly sequence: number;
  readonly acquisition: readonly [number, number];
  readonly availableAt: number;
  readonly bytes: number;
}

/**
 * Read a raw tile's identity and times only. The tile is an 8×8 camera-local diagnostic image
 * (3C): it never becomes a point, a fit or a clear-space certificate here.
 */
export function readTile(m: Measurement): TileSummary | undefined {
  if (m.kind !== 'field-signal' || m.channel !== LATTICE_TILE_CHANNEL || !m.field) return;
  const a = m.value;
  if (
    a.length !== 76 ||
    a[0] !== 1 ||
    !Number.isInteger(a[1]) ||
    a[1]! < 0 ||
    !Number.isFinite(a[2]) ||
    a[2] !== a[3] ||
    a[3]! > m.t
  )
    return;
  return {
    id: `${m.field}:diagnostic:${a[1]}`,
    field: m.field,
    sequence: a[1]!,
    acquisition: [a[2]!, a[3]!],
    availableAt: m.t,
    bytes: new TextEncoder().encode(JSON.stringify(m)).length,
  };
}
