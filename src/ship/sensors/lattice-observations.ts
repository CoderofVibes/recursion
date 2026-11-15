/** Recorded data only. This module deliberately imports no truth or field implementation. */
import type { Measurement } from '../../contracts/measurements.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import type {
  LatticeAngularFragment,
  LatticeObservationFrame,
} from '../../contracts/lattice-acquisition.ts';
export type {
  LatticeAngularFragment,
  LatticeObservationFrame,
} from '../../contracts/lattice-acquisition.ts';

export const LATTICE_CHANNEL = 'lattice.angular-fragments.v2';

const vector = (a: readonly number[], i: number): Vec3 => ({
  x: a[i]!,
  y: a[i + 1]!,
  z: a[i + 2]!,
});

/** Versioned transport inside the existing field-signal contract; no opaque truth JSON. */
export function encodeLatticeFrame(frame: LatticeObservationFrame): Measurement {
  const b = frame.basis;
  const value = [
    2,
    frame.sequence,
    ...frame.acquisition,
    frame.processorPower,
    frame.cameraPower,
    frame.effectiveRate,
    frame.exposure,
    frame.coverage.halfAngle,
    frame.coverage.rangeLimit,
    frame.coverage.angularResolution,
    Number(frame.coverage.truncated),
    b.forward.x,
    b.forward.y,
    b.forward.z,
    b.right.x,
    b.right.y,
    b.right.z,
    b.up.x,
    b.up.y,
    b.up.z,
    frame.basisSigma,
    frame.fragments.length,
    ...frame.fragments.flatMap((f) => [...f.start, ...f.end, f.sigma]),
  ];
  const sigma = value.map(() => 0);
  // Componentwise conservative bounds do not imply independent errors: the scalar angular
  // covariance and common-rotation semantics above govern reconstruction of all frame rays.
  for (let j = 12; j < 21; j++) sigma[j] = frame.basisSigma;
  frame.fragments.forEach((f, i) => {
    for (let j = 0; j < 4; j++) sigma[23 + i * 5 + j] = f.sigma;
  });
  return {
    kind: 'field-signal',
    channel: LATTICE_CHANNEL,
    field: frame.field,
    source: frame.source,
    t: frame.availableAt,
    value,
    sigma,
  };
}

/** Reject malformed/unknown versions rather than guessing a geometry. */
export function decodeLatticeFrame(m: Measurement): LatticeObservationFrame | undefined {
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
  const fragments: LatticeAngularFragment[] = [];
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

/** Age is evaluated by the consumer. Retained geometry is never deleted when power falls. */
export function latticeFrameFreshness(
  frame: LatticeObservationFrame,
  now: number,
  maxAge: number,
): 'fresh' | 'stale' {
  return now >= frame.availableAt && now - frame.acquisition[1] <= maxAge ? 'fresh' : 'stale';
}
