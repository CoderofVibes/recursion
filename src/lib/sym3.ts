/**
 * Symmetric 3×3 matrices (position covariances, inertia tensors) stored as six unique terms,
 * and their principal axes. Deterministic: fixed arithmetic, no iteration to a tolerance.
 */

import { fromMatrix, toMatrix, type Quat } from './quat.ts';
import type { Vec3 } from './vec3.ts';

/** Symmetric 3×3 as [xx, xy, xz, yy, yz, zz]. */
export type Sym3 = readonly [number, number, number, number, number, number];

export const SYM3_ZERO: Sym3 = Object.freeze([0, 0, 0, 0, 0, 0]) as Sym3;

/** s·I. */
export const isoSym3 = (s: number): Sym3 => [s, 0, 0, s, 0, s];

export const diagSym3 = (xx: number, yy: number, zz: number): Sym3 => [xx, 0, 0, yy, 0, zz];

export const addSym3 = (a: Sym3, b: Sym3): Sym3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
  a[3] + b[3],
  a[4] + b[4],
  a[5] + b[5],
];

export const scaleSym3 = (a: Sym3, s: number): Sym3 => [
  a[0] * s,
  a[1] * s,
  a[2] * s,
  a[3] * s,
  a[4] * s,
  a[5] * s,
];

/** m · v. */
export const mulSym3 = (m: Sym3, v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[1] * v.x + m[3] * v.y + m[4] * v.z,
  z: m[2] * v.x + m[4] * v.y + m[5] * v.z,
});

/** vᵀ m v: for a covariance, the variance along unit vector v. */
export const quadSym3 = (m: Sym3, v: Vec3): number =>
  m[0] * v.x * v.x +
  m[3] * v.y * v.y +
  m[5] * v.z * v.z +
  2 * (m[1] * v.x * v.y + m[2] * v.x * v.z + m[4] * v.y * v.z);

export const traceSym3 = (m: Sym3): number => m[0] + m[3] + m[5];

/** R m Rᵀ for a rotation quaternion q (m given in the frame q rotates from). */
export function rotateSym3(m: Sym3, q: Quat): Sym3 {
  const r = toMatrix(q);
  const a = [m[0], m[1], m[2], m[1], m[3], m[4], m[2], m[4], m[5]];
  // t = R·a
  const t = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      t[3 * i + j] = r[3 * i]! * a[j]! + r[3 * i + 1]! * a[3 + j]! + r[3 * i + 2]! * a[6 + j]!;
  // out = t·Rᵀ
  const e = (i: number, j: number): number =>
    t[3 * i]! * r[3 * j]! + t[3 * i + 1]! * r[3 * j + 1]! + t[3 * i + 2]! * r[3 * j + 2]!;
  return [e(0, 0), e(0, 1), e(0, 2), e(1, 1), e(1, 2), e(2, 2)];
}

/** Point-mass inertia about the origin for mass m at offset d: m (|d|² I − d dᵀ). */
export const pointInertia = (m: number, d: Vec3): Sym3 => [
  m * (d.y * d.y + d.z * d.z),
  -m * d.x * d.y,
  -m * d.x * d.z,
  m * (d.x * d.x + d.z * d.z),
  -m * d.y * d.z,
  m * (d.x * d.x + d.y * d.y),
];

export interface PrincipalAxes {
  /** Eigenvalues: the value along each principal axis (x′, y′, z′). */
  readonly values: Vec3;
  /**
   * Rotation from the principal frame to the frame `m` is given in: column k of its matrix is
   * the k-th principal axis. Chosen close to the identity, so a nearly diagonal matrix keeps
   * x′ ≈ x, y′ ≈ y, z′ ≈ z, and a matrix with xz = yz = 0 keeps z′ = z exactly.
   */
  readonly axes: Quat;
}

/**
 * Principal axes of a symmetric 3×3 by cyclic Jacobi rotations (12 fixed sweeps; converges
 * quadratically, typically in 4–6). The accumulated rotation is proper and near the identity.
 */
export function principalAxes(m: Sym3): PrincipalAxes {
  const a = [m[0], m[1], m[2], m[1], m[3], m[4], m[2], m[4], m[5]];
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const pairs: readonly (readonly [number, number])[] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  for (let sweep = 0; sweep < 12; sweep++) {
    let off = 0;
    for (const [p, q] of pairs) off += Math.abs(a[3 * p + q]!);
    if (off === 0) break;
    for (const [p, q] of pairs) {
      const apq = a[3 * p + q]!;
      if (apq === 0) continue;
      const app = a[3 * p + p]!;
      const aqq = a[3 * q + q]!;
      // Smaller-angle root (|θ| ≤ π/4) keeps the accumulated rotation near the identity.
      const theta = (aqq - app) / (2 * apq);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[3 * k + p]!;
        const akq = a[3 * k + q]!;
        a[3 * k + p] = c * akp - s * akq;
        a[3 * k + q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[3 * p + k]!;
        const aqk = a[3 * q + k]!;
        a[3 * p + k] = c * apk - s * aqk;
        a[3 * q + k] = s * apk + c * aqk;
      }
      a[3 * p + q] = 0;
      a[3 * q + p] = 0;
      for (let k = 0; k < 3; k++) {
        const vkp = v[3 * k + p]!;
        const vkq = v[3 * k + q]!;
        v[3 * k + p] = c * vkp - s * vkq;
        v[3 * k + q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: { x: a[0]!, y: a[4]!, z: a[8]! }, axes: fromMatrix(v) };
}

/** The matrix with principal `values` along `axes`: R diag(values) Rᵀ. */
export const fromPrincipal = (values: Vec3, axes: Quat): Sym3 =>
  rotateSym3(diagSym3(values.x, values.y, values.z), axes);
