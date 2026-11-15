/**
 * Test records for the lattice: 3C's `lattice.angular-fragments.v2` layout
 * (`src/ship/sensors/lattice-observations.ts`, `encodeLatticeFrame`), written out here so the
 * model's tests do not depend on 3C's branch. Test support only.
 */

import type { Measurement, Vec3 } from '../contracts/index.ts';
import { LATTICE_CHANNEL } from './lattice/frames.ts';

/** 3C's v2 layout (`encodeLatticeFrame`), for test records. */
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
  const b = f.basis ?? {
    forward: { x: 1, y: 0, z: 0 },
    right: { x: 0, y: 1, z: 0 },
    up: { x: 0, y: 0, z: 1 },
  };
  const value = [
    2,
    f.sequence,
    ...f.acquisition,
    f.processorPower ?? 1000,
    200,
    f.effectiveRate ?? 5 / 3,
    0.01,
    f.halfAngle ?? Math.PI / 6,
    f.rangeLimit ?? 1200,
    f.fragments[0]?.sigma ?? 5e-4,
    0,
    b.forward.x,
    b.forward.y,
    b.forward.z,
    b.right.x,
    b.right.y,
    b.right.z,
    b.up.x,
    b.up.y,
    b.up.z,
    f.basisSigma ?? 1e-15,
    f.fragments.length,
    ...f.fragments.flatMap((g) => [...g.start, ...g.end, g.sigma]),
  ];
  return {
    kind: 'field-signal',
    channel: LATTICE_CHANNEL,
    field: f.field,
    source: 'camera',
    t: f.availableAt,
    value,
    sigma: value.map(() => 0),
  };
}
