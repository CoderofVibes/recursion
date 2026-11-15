/** Truth-side clipping of luminous line support to a camera cone and opaque spheres. */
import type { Vec3 } from '../../lib/vec3.ts';
import * as v3 from '../../lib/vec3.ts';

export interface WellCameraOccluder {
  readonly center: Vec3;
  readonly radius: number;
}
export type WellVisibleInterval = readonly [number, number];

function roots(a: number, b: number, c: number): number[] {
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Number.MIN_VALUE);
  a /= scale;
  b /= scale;
  c /= scale;
  if (Math.abs(a) < 1e-15) return Math.abs(b) < 1e-15 ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(d));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
}

/** Endpoints may both be outside. Occluders behind an emitting point never hide it. */
export function visibleWellIntervals(
  from: Vec3,
  to: Vec3,
  eye: Vec3,
  forward: Vec3,
  halfAngle: number,
  occluders: readonly WellCameraOccluder[],
): readonly WellVisibleInterval[] {
  if (
    ![from, to, eye, forward].every(v3.isFinite3) ||
    Math.abs(v3.length(forward) - 1) > 1e-8 ||
    !(halfAngle > 0 && halfAngle < Math.PI / 2) ||
    occluders.some((o) => !v3.isFinite3(o.center) || !Number.isFinite(o.radius) || o.radius < 0)
  )
    throw new Error('invalid well camera clipping geometry');
  const a = v3.sub(from, eye),
    d = v3.sub(to, from);
  const aa = v3.dot(a, a),
    ad = v3.dot(a, d),
    dd = v3.dot(d, d);
  const fa = v3.dot(a, forward),
    fd = v3.dot(d, forward),
    cos2 = Math.cos(halfAngle) ** 2;
  const cuts = [
    0,
    1,
    ...roots(cos2 * dd - fd * fd, 2 * (cos2 * ad - fa * fd), cos2 * aa - fa * fa),
  ];
  if (fd !== 0) cuts.push(-fa / fd);
  const spheres = occluders
    .filter((o) => o.radius > 0)
    .map((o) => ({ c: v3.sub(o.center, eye), radius: o.radius }));
  for (const o of spheres) {
    const ca = v3.dot(o.c, a),
      cd = v3.dot(o.c, d),
      cc = v3.dot(o.c, o.c);
    if (cc <= o.radius ** 2) return [];
    const k = cc - o.radius ** 2;
    cuts.push(...roots(cd * cd - k * dd, 2 * (ca * cd - k * ad), ca * ca - k * aa));
    const offset = v3.sub(a, o.c);
    cuts.push(...roots(dd, 2 * v3.dot(offset, d), v3.dot(offset, offset) - o.radius ** 2));
    if (cd !== 0) cuts.push(-ca / cd);
  }
  const sorted = [...new Set(cuts.filter((t) => Number.isFinite(t) && t >= 0 && t <= 1))].sort(
    (x, y) => x - y,
  );
  const visible = (t: number) => {
    const p = v3.addScaled(a, d, t),
      range = v3.length(p),
      f = v3.dot(p, forward);
    if (!(range > 0 && f > 0 && f * f >= cos2 * range * range)) return false;
    for (const o of spheres) {
      const along = v3.dot(o.c, p) / range;
      const lateral2 = v3.lengthSq(o.c) - along * along;
      if (along > 0 && lateral2 < o.radius ** 2) {
        const entry = along - Math.sqrt(Math.max(0, o.radius ** 2 - lateral2));
        if (entry < range - Number.EPSILON * 64 * (range + v3.length(o.c))) return false;
      }
    }
    return true;
  };
  const result: Array<[number, number]> = [];
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1]!,
      hi = sorted[i]!;
    if (hi > lo && visible((lo + hi) / 2)) {
      const previous = result.at(-1);
      if (previous?.[1] === lo) previous[1] = hi;
      else result.push([lo, hi]);
    }
  }
  return result;
}
