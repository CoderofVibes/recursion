/**
 * Shared vocabulary and arithmetic for the instrument primitives. No React, no game logic.
 *
 * Status is what a reading means; tone is what kind of information it is. Both come from
 * docs/design/visual-direction.md: alerts carry a shape as well as a colour (○ ▲ ■), stale data
 * is visibly marked, measured reality is warm ink, predictions are teal, and anything Black Box
 * carried across recurrence is orange.
 */
export type Status = 'nominal' | 'caution' | 'warning' | 'off' | 'stale';
export type Tone = 'measured' | 'forecast' | 'blackbox';
export type LimitKind = 'limit' | 'caution' | 'warning' | 'target';

/** The shape that goes with an alert colour, so colour is never the only cue. */
export const STATUS_GLYPH: Readonly<Record<Status, string>> = {
  nominal: '',
  caution: '▲',
  warning: '■',
  off: '',
  stale: '◌',
};

/** Where `value` sits between `min` and `max`, clamped to 0..1. */
export function fraction(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value) || max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** `0.427` → `'42.7%'`, for CSS widths and offsets. */
export function percent(f: number): string {
  return `${Math.round(f * 1000) / 10}%`;
}

/**
 * The value range a set of series spans, padded so traces do not touch the frame.
 * A flat series still gets a visible band around it.
 */
export function extent(
  series: readonly (readonly number[])[],
  pad = 0.08,
): readonly [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series)
    for (const v of s) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  if (lo === Infinity) return [0, 1];
  if (hi === lo) {
    const d = Math.abs(lo) > 1e-9 ? Math.abs(lo) * 0.05 : 0.5;
    return [lo - d, hi + d];
  }
  const d = (hi - lo) * pad;
  return [lo - d, hi + d];
}

/**
 * SVG path for a series in a 0..100 by 0..100 box (y down). The series occupies x from
 * `x0` to `x1`; values map from [lo, hi] to the box height. Gaps (non-finite values) lift the pen.
 */
export function tracePath(
  values: readonly number[],
  lo: number,
  hi: number,
  x0 = 0,
  x1 = 100,
): string {
  const n = values.length;
  if (n === 0) return '';
  let d = '';
  let pen = false;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === undefined || !Number.isFinite(v)) {
      pen = false;
      continue;
    }
    const x = n === 1 ? x0 : x0 + ((x1 - x0) * i) / (n - 1);
    const y = 100 - fraction(v, lo, hi) * 100;
    d += `${pen ? 'L' : 'M'}${round(x)} ${round(y)}`;
    pen = true;
  }
  return d;
}

/** Closed SVG path for a band of half-width `half[i]` around `centre[i]`. */
export function bandPath(
  centre: readonly number[],
  half: readonly number[],
  lo: number,
  hi: number,
  x0 = 0,
  x1 = 100,
): string {
  const n = Math.min(centre.length, half.length);
  if (n < 2) return '';
  const at = (i: number, v: number): string =>
    `${round(x0 + ((x1 - x0) * i) / (n - 1))} ${round(100 - fraction(v, lo, hi) * 100)}`;
  let d = '';
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${at(i, (centre[i] ?? 0) + (half[i] ?? 0))}`;
  for (let i = n - 1; i >= 0; i--) d += `L${at(i, (centre[i] ?? 0) - (half[i] ?? 0))}`;
  return `${d}Z`;
}

/**
 * A point on a gauge's arc in a 100 by 100 box (y down). `f` runs 0 to 1 along the sweep, which
 * is centred on the top of the dial and opens at the bottom.
 */
export function arcPoint(
  f: number,
  radius: number,
  sweepDegrees: number,
): readonly [number, number] {
  const a = ((90 + (360 - sweepDegrees) / 2 + sweepDegrees * f) * Math.PI) / 180;
  return [round(50 + Math.cos(a) * radius), round(50 + Math.sin(a) * radius)];
}

/** SVG path for the part of a gauge's arc from `f0` to `f1` (each 0 to 1). */
export function arcPath(f0: number, f1: number, radius: number, sweepDegrees: number): string {
  if (f1 <= f0) return '';
  const [x0, y0] = arcPoint(f0, radius, sweepDegrees);
  const [x1, y1] = arcPoint(f1, radius, sweepDegrees);
  const large = sweepDegrees * (f1 - f0) > 180 ? 1 : 0;
  return `M${x0} ${y0}A${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
}

const round = (v: number): number => Math.round(v * 100) / 100;
