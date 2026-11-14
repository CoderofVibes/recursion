/**
 * Planar geometry for clearance and contact: a circle (body or asteroid envelope) against the
 * ship's footprint polygon (body frame, counter-clockwise, convex or not).
 *
 * Polygons are packed as [x0, y0, x1, y1, ...]. A polygon of one vertex is a point; edges of
 * zero length behave as points. Results go into a caller-owned scratch object so hot loops
 * allocate nothing.
 */

export interface GeometryResult {
  /** Distance (≥ 0, or signed where documented), m. */
  distance: number;
  /** Parameter along the moving segment, 0..1. */
  tau: number;
  /** Closest point on the polygon boundary, body frame. */
  qx: number;
  qy: number;
}

export const createGeometryResult = (): GeometryResult => ({ distance: 0, tau: 0, qx: 0, qy: 0 });

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Even–odd point-in-polygon test. */
export function pointInPolygon(px: number, py: number, poly: Float64Array, n: number): boolean {
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[2 * i]!;
    const yi = poly[2 * i + 1]!;
    const xj = poly[2 * j]!;
    const yj = poly[2 * j + 1]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Signed distance from a point to the polygon boundary: positive outside, negative inside.
 * `out.qx, out.qy` is the closest boundary point; `out.tau` is unused (0).
 */
export function pointPolygon(
  px: number,
  py: number,
  poly: Float64Array,
  n: number,
  out: GeometryResult,
): GeometryResult {
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (let i = 0; i < n; i++) {
    const ax = poly[2 * i]!;
    const ay = poly[2 * i + 1]!;
    const j = i + 1 === n ? 0 : i + 1;
    const ex = poly[2 * j]! - ax;
    const ey = poly[2 * j + 1]! - ay;
    const l2 = ex * ex + ey * ey;
    const u = l2 > 0 ? clamp01(((px - ax) * ex + (py - ay) * ey) / l2) : 0;
    const cx = ax + u * ex;
    const cy = ay + u * ey;
    const d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (d2 < best) {
      best = d2;
      bx = cx;
      by = cy;
    }
  }
  const d = Math.sqrt(best);
  out.distance = pointInPolygon(px, py, poly, n) ? -d : d;
  out.tau = 0;
  out.qx = bx;
  out.qy = by;
  return out;
}

/** Closest approach of segment A→B to the origin-free point P: returns τ in [0, 1]. */
export function pointSegmentTau(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  return l2 > 0 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0;
}

// Scratch for segment–segment results (s on the moving segment, t on the edge). For parallel
// segments at constant distance, [segLo, segHi] is the range of s with that distance.
let segT = 0;
let segLo = 0;
let segHi = 0;

/**
 * Squared distance between segments P1→Q1 (moving path, parameter s) and P2→Q2 (edge, t).
 * After Ericson, Real-Time Collision Detection §5.1.9. For parallel segments the moving
 * parameter is the middle of the overlap, so a plateau's minimum time is its centre.
 */
function segmentSegment2(
  p1x: number,
  p1y: number,
  q1x: number,
  q1y: number,
  p2x: number,
  p2y: number,
  q2x: number,
  q2y: number,
): number {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s: number;
  let t: number;
  let lo = NaN;
  let hi = NaN;
  if (a === 0 && e === 0) {
    s = 0;
    t = 0;
  } else if (a === 0) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e === 0) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;
      if (denom > 1e-12 * a * e) {
        s = clamp01((b * f - c * e) / denom);
      } else {
        // Parallel: middle of the s-range facing the edge.
        const s0 = clamp01(-c / a);
        const s1 = clamp01((b - c) / a);
        lo = Math.min(s0, s1);
        hi = Math.max(s0, s1);
        s = 0.5 * (s0 + s1);
      }
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
        lo = NaN;
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
        lo = NaN;
      }
    }
  }
  segT = t;
  segLo = Number.isNaN(lo) ? s : lo;
  segHi = Number.isNaN(lo) ? s : hi;
  const cx = p1x + d1x * s - (p2x + d2x * t);
  const cy = p1y + d1y * s - (p2y + d2y * t);
  return cx * cx + cy * cy;
}

/**
 * Minimum distance between segment A→B and the polygon boundary, with the parameter τ along
 * A→B where it occurs and the closest polygon point. 0 if A is inside the polygon. When the
 * minimum is a flat stretch (A→B parallel to an edge), τ is the middle of the stretch.
 */
export function segmentPolygon(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  poly: Float64Array,
  n: number,
  out: GeometryResult,
): GeometryResult {
  let best = Infinity;
  let lo = 0;
  let hi = 0;
  let qx = 0;
  let qy = 0;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    const ex0 = poly[2 * i]!;
    const ey0 = poly[2 * i + 1]!;
    const ex1 = poly[2 * j]!;
    const ey1 = poly[2 * j + 1]!;
    const d2 = segmentSegment2(ax, ay, bx, by, ex0, ey0, ex1, ey1);
    const tol = best === Infinity ? 0 : 1e-12 * best;
    if (d2 < best - tol) {
      best = d2;
      lo = segLo;
      hi = segHi;
      qx = ex0 + (ex1 - ex0) * segT;
      qy = ey0 + (ey1 - ey0) * segT;
    } else if (d2 <= best + tol) {
      // Tie (a flat stretch meeting its end corners): widen the range.
      lo = Math.min(lo, segLo);
      hi = Math.max(hi, segHi);
    }
  }
  if (pointInPolygon(ax, ay, poly, n)) {
    out.distance = 0;
    out.tau = 0;
  } else {
    out.distance = Math.sqrt(best);
    out.tau = 0.5 * (lo + hi);
  }
  out.qx = qx;
  out.qy = qy;
  return out;
}

/** Earliest τ in [0, 1] at which A + τ(B − A) is within r of point (cx, cy), or Infinity. */
function sweepCircle(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  r: number,
): number {
  const fx = ax - cx;
  const fy = ay - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return Infinity;
  const b = fx * dx + fy * dy; // half of the usual b
  if (b >= 0) return Infinity; // moving away
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const tau = (-b - Math.sqrt(disc)) / a;
  return tau <= 1 ? tau : Infinity;
}

/**
 * Earliest τ in [0, 1] at which the moving point A + τ(B − A) comes within r of the polygon
 * boundary (enters the polygon dilated by r), or −1 if it never does during the segment.
 * Each edge dilated by r is a capsule: two end circles and a side band.
 */
export function sweepPolygon(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  poly: Float64Array,
  n: number,
  r: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    const e0x = poly[2 * i]!;
    const e0y = poly[2 * i + 1]!;
    const e1x = poly[2 * j]!;
    const e1y = poly[2 * j + 1]!;
    const t0 = sweepCircle(ax, ay, dx, dy, e0x, e0y, r);
    if (t0 < best) best = t0;
    const ex = e1x - e0x;
    const ey = e1y - e0y;
    const len = Math.sqrt(ex * ex + ey * ey);
    if (len === 0) continue;
    const ux = ex / len;
    const uy = ey / len;
    // Side band: |lateral offset| ≤ r with projection in [0, len].
    const lat0 = -(ax - e0x) * uy + (ay - e0y) * ux;
    const dlat = -dx * uy + dy * ux;
    const along0 = (ax - e0x) * ux + (ay - e0y) * uy;
    const dalong = dx * ux + dy * uy;
    let tau: number;
    if (Math.abs(lat0) <= r) tau = 0;
    else if (dlat === 0 || Math.sign(dlat) === Math.sign(lat0)) continue;
    else tau = (Math.sign(lat0) * r - lat0) / dlat;
    if (tau > 1 || tau >= best) continue;
    const along = along0 + tau * dalong;
    if (along >= 0 && along <= len) best = tau;
  }
  if (best === Infinity && n === 0) return -1;
  // Starting inside the polygon also counts as contact at τ = 0.
  if (best !== 0 && pointInPolygon(ax, ay, poly, n)) return 0;
  return best === Infinity ? -1 : best;
}
