/**
 * Test records for the lattice, written with 3C's own encoder (`encodeLatticeFrame` in
 * `src/ship/sensors/lattice-observations.ts`): the model's tests read exactly what the ship's
 * sensor records. Test support only.
 */

import type { Measurement, Vec3 } from '../contracts/index.ts';
import { encodeLatticeFrame } from '../ship/sensors/lattice-observations.ts';

/** One v2 frame with test defaults (identity camera basis, 1 kW processing, 5/3 Hz). */
export function encodeFrame(f: {
  field: string;
  sequence: number;
  acquisition: readonly [number, number];
  availableAt: number;
  basis?: { forward: Vec3; right: Vec3; up: Vec3 };
  basisSigma?: number;
  fragments: readonly {
    start: readonly [number, number];
    end: readonly [number, number];
    sigma: number;
  }[];
  processorPower?: number;
  effectiveRate?: number;
  halfAngle?: number;
  rangeLimit?: number;
}): Measurement {
  const id = `${f.field}:frame:${f.sequence}`;
  return encodeLatticeFrame({
    version: 2,
    id,
    field: f.field,
    sequence: f.sequence,
    acquisition: f.acquisition,
    availableAt: f.availableAt,
    source: 'camera',
    processorPower: f.processorPower ?? 1000,
    cameraPower: 200,
    effectiveRate: f.effectiveRate ?? 5 / 3,
    exposure: 0.01,
    basis: f.basis ?? {
      forward: { x: 1, y: 0, z: 0 },
      right: { x: 0, y: 1, z: 0 },
      up: { x: 0, y: 0, z: 1 },
    },
    basisSigma: f.basisSigma ?? 1e-15,
    basisCorrelation: 'frame-common-rotation',
    coverage: {
      status: 'unresolved',
      halfAngle: f.halfAngle ?? Math.PI / 6,
      rangeLimit: f.rangeLimit ?? 1200,
      angularResolution: f.fragments[0]?.sigma ?? 5e-4,
      truncated: false,
    },
    fragments: f.fragments.map((g, i) => ({ id: `${id}:fragment:${i}`, ...g })),
  });
}
