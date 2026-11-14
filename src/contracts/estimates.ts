/** Scalar estimate: mean and one-sigma standard deviation. */
export interface Gaussian {
  readonly mean: number;
  readonly sigma: number;
}

/** Symmetric 2×2 covariance stored as [xx, xy, yy]. */
export type Cov2 = readonly [number, number, number];

/** Symmetric n×n covariance, row-major, rows and columns labelled by `ids`. */
export interface CovarianceMatrix {
  readonly ids: readonly string[];
  /** Length ids.length², row-major. */
  readonly values: readonly number[];
}

/** Isotropic 2×2 covariance with standard deviation sigma on each axis. */
export const isoCov2 = (sigma: number): Cov2 => [sigma * sigma, 0, sigma * sigma];

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
