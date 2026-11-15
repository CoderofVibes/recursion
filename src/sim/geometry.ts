/**
 * Geometry for clearance and contact: a sphere (body or asteroid envelope) against the ship's
 * hull, a union of convex prisms in the body frame (`Hull` in the contracts).
 *
 * Two layers:
 *  - Planar: a circle against a polygon in the body x–y plane (exact closed forms). Polygons are
 *    packed as [x0, y0, x1, y1, ...], counter-clockwise. A polygon of one vertex is a point;
 *    edges of zero length behave as points.
 *  - Prisms: a convex polygon extruded from zMin to zMax. The distance from a point to a prism
 *    is exact. A segment that stays inside the prism's slab (zMin ≤ z ≤ zMax) is exactly the
 *    planar problem and uses the planar code; any other segment is searched, using the fact
 *    that the distance to a convex set is a convex function along a line (fixed iteration
 *    counts, so the result is deterministic).
 *
 * Results go into caller-owned scratch objects so hot loops allocate nothing.
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

// ---------------------------------------------------------------------------------------------
// Prisms (three dimensions)
// ---------------------------------------------------------------------------------------------

/** One convex part of the hull, packed: a convex outline extruded along body z. */
export interface PackedPrism {
  /** Outline [x0, y0, x1, y1, ...], counter-clockwise seen from +z, convex. */
  readonly outline: Float64Array;
  /** Number of outline vertices. */
  readonly n: number;
  readonly zMin: number;
  readonly zMax: number;
}

export interface PrismResult {
  /** Distance, m: signed for a point (negative inside), ≥ 0 for a segment. */
  distance: number;
  /** Parameter along the moving segment where the minimum occurs, 0..1. */
  tau: number;
  /** Earliest parameter at which the segment comes within the asked radius, or −1. */
  hit: number;
  /** Closest point on the hull surface, body frame. */
  qx: number;
  qy: number;
  qz: number;
  /**
   * Outward unit normal of the hull at that point (toward the query point when it is outside).
   * Zero when the point lies exactly on the surface, where the direction is undefined.
   */
  nx: number;
  ny: number;
  nz: number;
}

export const createPrismResult = (): PrismResult => ({
  distance: 0,
  tau: 0,
  hit: -1,
  qx: 0,
  qy: 0,
  qz: 0,
  nx: 0,
  ny: 0,
  nz: 0,
});

/** Pack a hull prism for the functions below. */
export function packPrism(
  outline: readonly { readonly x: number; readonly y: number }[],
  zMin: number,
  zMax: number,
): PackedPrism {
  const packed = new Float64Array(2 * outline.length);
  for (let i = 0; i < outline.length; i++) {
    packed[2 * i] = outline[i]!.x;
    packed[2 * i + 1] = outline[i]!.y;
  }
  return { outline: packed, n: outline.length, zMin, zMax };
}

const planar = createGeometryResult();

/**
 * Signed distance from a point to a prism (exact), its closest surface point and the outward
 * normal there. With d₂ the signed planar distance to the outline and d_z = max(zMin − z,
 * z − zMax):
 *   beside (d_z ≤ 0 < d₂): d₂, to the side wall;    above or below (d₂ ≤ 0 < d_z): d_z, to a cap;
 *   off an edge or corner (both > 0): hypot(d₂, d_z);    inside (both ≤ 0): max(d₂, d_z).
 * `out.tau` and `out.hit` are not used.
 */
export function pointPrism(
  px: number,
  py: number,
  pz: number,
  prism: PackedPrism,
  out: PrismResult,
): PrismResult {
  pointPolygon(px, py, prism.outline, prism.n, planar);
  const d2 = planar.distance;
  const below = prism.zMin - pz;
  const above = pz - prism.zMax;
  const dz = below > above ? below : above;
  const cap = below > above ? prism.zMin : prism.zMax;
  if (d2 > 0 && dz > 0) {
    // Off an edge or a corner of a cap.
    const d = Math.hypot(d2, dz);
    out.distance = d;
    out.qx = planar.qx;
    out.qy = planar.qy;
    out.qz = cap;
    out.nx = (px - planar.qx) / d;
    out.ny = (py - planar.qy) / d;
    out.nz = (pz - cap) / d;
  } else if (dz > 0 || (d2 <= 0 && dz > d2 && below !== above)) {
    // Above or below the outline, or inside and nearest to a cap. (Inside at exactly mid-height
    // the two caps tie, and the side wall is used: a planar scene stays planar.)
    out.distance = dz;
    out.qx = px;
    out.qy = py;
    out.qz = cap;
    out.nx = 0;
    out.ny = 0;
    out.nz = below > above ? -1 : 1;
  } else {
    // Beside the prism within its slab, or inside and nearest to the side wall.
    out.distance = d2;
    out.qx = planar.qx;
    out.qy = planar.qy;
    out.qz = pz;
    const dx = px - planar.qx;
    const dy = py - planar.qy;
    const len = Math.hypot(dx, dy);
    const s = len === 0 ? 0 : (d2 < 0 ? -1 : 1) / len;
    out.nx = dx * s + 0; // + 0: never −0
    out.ny = dy * s + 0;
    out.nz = 0;
  }
  return out;
}

/** Signed distance from a point to a hull (the nearest prism), with closest point and normal. */
export function pointHull(
  px: number,
  py: number,
  pz: number,
  hull: readonly PackedPrism[],
  out: PrismResult,
): PrismResult {
  if (hull.length === 1) return pointPrism(px, py, pz, hull[0]!, out);
  let best = Infinity;
  let index = 0;
  for (let i = 0; i < hull.length; i++) {
    const d = pointPrism(px, py, pz, hull[i]!, out).distance;
    if (d < best) {
      best = d;
      index = i;
    }
  }
  return pointPrism(px, py, pz, hull[index]!, out);
}

// The moving point of the search below: A + τ·D against one prism.
const EMPTY_PRISM: PackedPrism = { outline: new Float64Array(0), n: 0, zMin: 0, zMax: 0 };
let searchPrism = EMPTY_PRISM;
let searchAx = 0;
let searchAy = 0;
let searchAz = 0;
let searchDx = 0;
let searchDy = 0;
let searchDz = 0;
const searchOut = createPrismResult();

const distanceAt = (tau: number): number =>
  pointPrism(
    searchAx + tau * searchDx,
    searchAy + tau * searchDy,
    searchAz + tau * searchDz,
    searchPrism,
    searchOut,
  ).distance;

/** (√5 − 1) / 2. */
const GOLDEN = 0.6180339887498949;
/** Golden-section steps for the minimum: the bracket shrinks to 0.618⁴⁰ ≈ 4×10⁻⁹ of the step. */
const MINIMUM_STEPS = 40;
/** Bisection steps for each end of a flat minimum: 2⁻²⁶ ≈ 1.5×10⁻⁸ of the step. */
const FLAT_STEPS = 26;
/** Bisection steps for the first crossing of a radius: 2⁻⁴⁴ ≈ 6×10⁻¹⁴ of the step. */
const HIT_STEPS = 44;
/** Distances within this of the minimum count as the minimum (its flat stretch), m. */
const FLAT_TOLERANCE = 1e-9;
/** How far from an end of the segment its slope is sampled: 2⁻²⁰ of the step. */
const EDGE = 1 / 1048576;

// Results of `searchMinimum`: the parameter and value of the lowest distance found, and the
// parameter to report (the middle of the stretch within FLAT_TOLERANCE of it).
let foundT = 0;
let foundF = 0;
let foundTau = 0;

/**
 * The minimum of the convex function `distanceAt` on [0, 1] when it lies inside the segment:
 * golden-section search, then a bisection for each end of the stretch within FLAT_TOLERANCE of
 * the minimum, whose middle is reported.
 */
function searchMinimum(f0: number, f1: number): void {
  let a = 0;
  let b = 1;
  let x1 = b - GOLDEN * (b - a);
  let x2 = a + GOLDEN * (b - a);
  let y1 = distanceAt(x1);
  let y2 = distanceAt(x2);
  for (let i = 0; i < MINIMUM_STEPS; i++) {
    if (y1 < y2) {
      b = x2;
      x2 = x1;
      y2 = y1;
      x1 = b - GOLDEN * (b - a);
      y1 = distanceAt(x1);
    } else {
      a = x1;
      x1 = x2;
      y1 = y2;
      x2 = a + GOLDEN * (b - a);
      y2 = distanceAt(x2);
    }
  }
  let tMin = y1 < y2 ? x1 : x2;
  let fMin = y1 < y2 ? y1 : y2;
  if (f0 <= fMin) {
    tMin = 0;
    fMin = f0;
  }
  if (f1 < fMin) {
    tMin = 1;
    fMin = f1;
  }
  const level = fMin + FLAT_TOLERANCE;
  let lo = 0;
  if (f0 > level) {
    let u = 0;
    let v = tMin;
    for (let i = 0; i < FLAT_STEPS; i++) {
      const m = 0.5 * (u + v);
      if (distanceAt(m) <= level) v = m;
      else u = m;
    }
    lo = v;
  }
  let hi = 1;
  if (f1 > level) {
    let u = tMin;
    let v = 1;
    for (let i = 0; i < FLAT_STEPS; i++) {
      const m = 0.5 * (u + v);
      if (distanceAt(m) <= level) u = m;
      else v = m;
    }
    hi = u;
  }
  const tMid = 0.5 * (lo + hi);
  const fMid = distanceAt(tMid);
  if (fMid < fMin) {
    tMin = tMid;
    fMin = fMid;
  }
  foundT = tMin;
  foundF = fMin;
  foundTau = tMid;
}

/**
 * Minimum distance between the segment A→B and a prism, the parameter τ where it occurs (the
 * middle of the stretch when the minimum is flat) and, if `r ≥ 0`, the earliest τ at which the
 * moving point comes within `r` of the prism (`out.hit`, −1 if it never does). `out.distance`
 * is 0 when the segment touches or enters the prism.
 *
 * A segment inside the prism's slab is the planar problem and is solved exactly by
 * `segmentPolygon` and `sweepPolygon`. Any other segment uses convexity (the signed distance to
 * a convex prism is a convex function along a line):
 *  - rising at the start: the minimum is the start; falling at the end: the end. This is most
 *    steps (the object is simply receding or approaching) and costs four distance evaluations;
 *  - otherwise the minimum is inside: a golden-section search, then bisections for the ends of
 *    its flat stretch;
 *  - the first crossing of `r` is a bisection between the start and the minimum.
 */
export function segmentPrism(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  prism: PackedPrism,
  r: number,
  out: PrismResult,
): PrismResult {
  if (az >= prism.zMin && az <= prism.zMax && bz >= prism.zMin && bz <= prism.zMax) {
    segmentPolygon(ax, ay, bx, by, prism.outline, prism.n, planar);
    out.distance = planar.distance;
    out.tau = planar.tau;
    out.hit =
      r >= 0 && planar.distance - r <= 0
        ? sweepPolygon(ax, ay, bx, by, prism.outline, prism.n, r)
        : -1;
    return out;
  }
  searchPrism = prism;
  searchAx = ax;
  searchAy = ay;
  searchAz = az;
  searchDx = bx - ax;
  searchDy = by - ay;
  searchDz = bz - az;
  const f0 = distanceAt(0);
  const f1 = distanceAt(1);
  let tMin: number;
  let fMin: number;
  if (searchDx === 0 && searchDy === 0 && searchDz === 0) {
    // Not moving against the hull: the same distance all step.
    tMin = 0;
    fMin = f0;
    out.tau = 0.5;
  } else if (distanceAt(EDGE) > f0) {
    tMin = 0;
    fMin = f0;
    out.tau = 0;
  } else if (distanceAt(1 - EDGE) > f1) {
    tMin = 1;
    fMin = f1;
    out.tau = 1;
  } else {
    searchMinimum(f0, f1);
    tMin = foundT;
    fMin = foundF;
    out.tau = foundTau;
  }
  out.distance = fMin > 0 ? fMin : 0;
  out.hit = -1;
  if (r >= 0 && fMin - r <= 0) {
    if (f0 <= r) {
      out.hit = 0;
    } else {
      // Convex, above r at the start and at or below it at tMin: one crossing in between.
      let u = 0;
      let v = tMin;
      for (let i = 0; i < HIT_STEPS; i++) {
        const m = 0.5 * (u + v);
        if (distanceAt(m) <= r) v = m;
        else u = m;
      }
      out.hit = v;
    }
  }
  return out;
}

const prismOut = createPrismResult();

/**
 * `segmentPrism` against every prism of a hull: the smallest distance with its τ, and the
 * earliest `hit` of any prism (pass `r < 0` to skip the crossing search).
 */
export function segmentHull(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  hull: readonly PackedPrism[],
  r: number,
  out: PrismResult,
): PrismResult {
  if (hull.length === 1) return segmentPrism(ax, ay, az, bx, by, bz, hull[0]!, r, out);
  let best = Infinity;
  let tau = 0;
  let hit = -1;
  for (let i = 0; i < hull.length; i++) {
    segmentPrism(ax, ay, az, bx, by, bz, hull[i]!, r, prismOut);
    if (prismOut.distance < best) {
      best = prismOut.distance;
      tau = prismOut.tau;
    }
    if (prismOut.hit >= 0 && (hit < 0 || prismOut.hit < hit)) hit = prismOut.hit;
  }
  out.distance = best;
  out.tau = tau;
  out.hit = hit;
  return out;
}
