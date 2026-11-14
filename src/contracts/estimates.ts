import { rotate } from '../lib/quat.ts';
import { principalAxes, type Sym3 } from '../lib/sym3.ts';
import type { Vec3 } from '../lib/vec3.ts';

/** Scalar estimate: mean and one-sigma standard deviation. */
export interface Gaussian {
  readonly mean: number;
  readonly sigma: number;
}

/**
 * Symmetric 3×3 position (or velocity) covariance as its six unique terms,
 * [xx, xy, xz, yy, yz, zz], inertial frame (DECISIONS A11).
 */
export type Cov3 = Sym3;

/** Symmetric 2×2 covariance stored as [xx, xy, yy]: a Cov3 seen in a plane (`projectCov3`). */
export type Cov2 = readonly [number, number, number];

/** Symmetric n×n covariance, row-major, rows and columns labelled by `ids`. */
export interface CovarianceMatrix {
  readonly ids: readonly string[];
  /** Length ids.length², row-major. */
  readonly values: readonly number[];
}

/** Isotropic 3×3 covariance with standard deviation sigma on each axis. */
export const isoCov3 = (sigma: number): Cov3 => [
  sigma * sigma,
  0,
  0,
  sigma * sigma,
  0,
  sigma * sigma,
];

/** Isotropic 2×2 covariance with standard deviation sigma on each axis. */
export const isoCov2 = (sigma: number): Cov2 => [sigma * sigma, 0, sigma * sigma];

/** A planar covariance lifted to 3D with no out-of-plane uncertainty: [xx, xy, 0, yy, 0, 0]. */
export const cov3FromPlanar = (cov: Cov2): Cov3 => [cov[0], cov[1], 0, cov[2], 0, 0];

/** Variance (σ²) of a Cov3 along a unit direction. */
export const varianceAlong = (cov: Cov3, u: Vec3): number =>
  cov[0] * u.x * u.x +
  cov[3] * u.y * u.y +
  cov[5] * u.z * u.z +
  2 * (cov[1] * u.x * u.y + cov[2] * u.x * u.z + cov[4] * u.y * u.z);

/**
 * The 2×2 covariance of a Cov3 seen in the plane spanned by orthonormal `u` and `v`
 * (for example a camera's right and up vectors): [uu, uv, vv].
 */
export const projectCov3 = (cov: Cov3, u: Vec3, v: Vec3): Cov2 => [
  varianceAlong(cov, u),
  cov[0] * u.x * v.x +
    cov[3] * u.y * v.y +
    cov[5] * u.z * v.z +
    cov[1] * (u.x * v.y + u.y * v.x) +
    cov[2] * (u.x * v.z + u.z * v.x) +
    cov[4] * (u.y * v.z + u.z * v.y),
  varianceAlong(cov, v),
];

/**
 * Axes of the k-sigma uncertainty ellipsoid of a Cov3: three semi-axis lengths (longest
 * first) with their unit directions, inertial frame. For drawing envelopes.
 */
export function covEllipsoid(
  cov: Cov3,
  k = 1,
): {
  readonly radii: readonly [number, number, number];
  readonly axes: readonly [Vec3, Vec3, Vec3];
} {
  const p = principalAxes(cov);
  const items = [
    { value: p.values.x, axis: rotate(p.axes, { x: 1, y: 0, z: 0 }) },
    { value: p.values.y, axis: rotate(p.axes, { x: 0, y: 1, z: 0 }) },
    { value: p.values.z, axis: rotate(p.axes, { x: 0, y: 0, z: 1 }) },
  ].sort((a, b) => b.value - a.value);
  const radius = (value: number): number => k * Math.sqrt(Math.max(value, 0));
  return {
    radii: [radius(items[0]!.value), radius(items[1]!.value), radius(items[2]!.value)],
    axes: [items[0]!.axis, items[1]!.axis, items[2]!.axis],
  };
}

/**
 * Axes of the k-sigma uncertainty ellipse of a 2×2 covariance.
 * `major`/`minor` are semi-axis lengths; `angle` is the major axis direction (rad from +x).
 */
export function covEllipse(cov: Cov2, k = 1): { major: number; minor: number; angle: number } {
  const [xx, xy, yy] = cov;
  const mean = (xx + yy) / 2;
  const diff = (xx - yy) / 2;
  const r = Math.hypot(diff, xy);
  const l1 = Math.max(mean + r, 0);
  const l2 = Math.max(mean - r, 0);
  return {
    major: k * Math.sqrt(l1),
    minor: k * Math.sqrt(l2),
    angle: 0.5 * Math.atan2(2 * xy, xx - yy),
  };
}

/** Entry (i, j) of a CovarianceMatrix by parameter id, or undefined if either id is absent. */
export function covEntry(m: CovarianceMatrix, a: string, b: string): number | undefined {
  const i = m.ids.indexOf(a);
  const j = m.ids.indexOf(b);
  if (i < 0 || j < 0) return undefined;
  return m.values[i * m.ids.length + j];
}
