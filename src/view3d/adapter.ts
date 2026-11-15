/**
 * The one place the views and the console read geometry from the game (DECISIONS A11).
 *
 * Thread 2G is converting the contracts from planar to three-dimensional. Until its lift merges,
 * positions are `{ x, y }`, covariances have three terms, attitude is one yaw angle with one
 * turn rate, the ship's outline is a footprint polygon and a sensor covers a planar sector.
 * Afterwards they are `{ x, y, z }`, six terms, a quaternion with an angular-velocity vector,
 * a hull of prisms and a cone. Everything on screen is drawn in 3D from the start and reads
 * through these functions, which accept either shape, so the switch was a change here and
 * in the hands-on controller (src/app/hands.ts), nowhere else.
 *
 * Scene axes: game (x, y, z) maps to scene (x, z, -y). Game z (out of the old flight plane) is
 * scene "up", and the plane seen from above is not mirrored (visual-direction.md § 9).
 */
import { Quaternion, Vector3 } from 'three';
import type { AttitudeTarget, Chart } from '../contracts/index.ts';
import type { Chart as HoloChart } from './map/layout.ts';

/** A game-frame vector, planar or 3D. */
export interface GameVec {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

/** Game position or direction → scene. */
export function toScene(v: GameVec, out = new Vector3()): Vector3 {
  return out.set(v.x, v.z ?? 0, -v.y);
}

/**
 * The game's chart (`GameControls.chart()`: the expedition's frame, metres) as the MAP hologram
 * draws it: the same axes as everything else on screen, so a bearing taken in flight points the
 * same way on the chart.
 */
export function chartView(chart: Chart): HoloChart {
  const v = (p: GameVec): readonly [number, number, number] => [p.x, p.z ?? 0, -p.y];
  return {
    regions: chart.regions.map((r) => ({
      id: r.id,
      name: r.name,
      position: v(r.position),
      radius: r.radius,
      surveyed: r.surveyed,
      current: r.current,
      attempts: r.attempts.map((a) => ({ index: a.index, outcome: a.outcome })),
    })),
    corridors: chart.corridors.map((c) => ({ from: c.from, to: c.to })),
    leads: chart.leads.map((l) => ({
      id: l.id,
      name: l.name,
      from: l.from,
      direction: v(l.direction),
      spread: l.spread,
    })),
    ...(chart.reach !== undefined ? { reach: chart.reach } : {}),
  };
}

/** One phenomenon the eye can see through the window, in its own optical schema. */
export interface WindowField {
  readonly id: string;
  readonly kind: string;
  readonly visual: unknown;
}

/**
 * The window channel's visible phenomena (A19's glowing funnels). Proposed to the integrator as
 * an optional `WindowView.fields` of `{ id, kind, visual }` (the shape of `BelievedField`);
 * until the contract carries it, this reads it if present and otherwise finds none.
 */
export function windowFields(view: object | undefined): readonly WindowField[] {
  const fields = (view as { fields?: unknown } | undefined)?.fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (f): f is WindowField =>
      typeof f === 'object' &&
      f !== null &&
      typeof (f as WindowField).id === 'string' &&
      typeof (f as WindowField).kind === 'string',
  );
}

/** Game position → scene, appended to a flat point list. */
export function pushScene(flat: number[], v: GameVec): void {
  flat.push(v.x, v.z ?? 0, -v.y);
}

export function distance(a: GameVec, b: GameVec): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

export function length(v: GameVec): number {
  return Math.hypot(v.x, v.y, v.z ?? 0);
}

/**
 * One-sigma radius of a position covariance along its longest axis, in metres.
 * Planar: [xx, xy, yy]. Three-dimensional: [xx, xy, xz, yy, yz, zz]. The envelope and every
 * uncertainty mark are drawn as volumes of this radius, so they are right in both.
 */
export function sigmaMajor(cov: readonly number[]): number {
  if (cov.length === 3) {
    const [xx = 0, xy = 0, yy = 0] = cov;
    const mean = (xx + yy) / 2;
    return Math.sqrt(Math.max(mean + Math.hypot((xx - yy) / 2, xy), 0));
  }
  if (cov.length >= 6) {
    // Largest eigenvalue of a symmetric 3×3 by power iteration (a dozen steps is ample here).
    const [xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0] = cov;
    let vx = 1;
    let vy = 1;
    let vz = 1;
    let lambda = 0;
    for (let i = 0; i < 12; i++) {
      const ax = xx * vx + xy * vy + xz * vz;
      const ay = xy * vx + yy * vy + yz * vz;
      const az = xz * vx + yz * vy + zz * vz;
      lambda = Math.hypot(ax, ay, az);
      if (lambda < 1e-30) return 0;
      vx = ax / lambda;
      vy = ay / lambda;
      vz = az / lambda;
    }
    return Math.sqrt(Math.max(lambda, 0));
  }
  return 0;
}

const Y = new Vector3(0, 1, 0);
/** Game (x, y, z) → scene (x, z, -y) as a rotation: a quarter turn about x. */
const GAME_TO_SCENE = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const SCENE_TO_GAME = GAME_TO_SCENE.clone().invert();

interface QuaternionLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}
const isQuaternion = (a: unknown): a is QuaternionLike =>
  typeof a === 'object' &&
  a !== null &&
  typeof (a as QuaternionLike).w === 'number' &&
  typeof (a as QuaternionLike).x === 'number';

/**
 * The ship's attitude as a scene rotation of the ship drawing, whose nose is along scene -z
 * and whose left side is along -x (`P()` in src/view3d/ship/model.ts).
 * Planar: `attitude` is the inertial angle of body +x, counter-clockwise from game +x.
 * Three-dimensional: a unit quaternion, body to inertial.
 */
export function attitudeToScene(attitude: unknown, out = new Quaternion()): Quaternion {
  if (typeof attitude === 'number') return out.setFromAxisAngle(Y, attitude - Math.PI / 2);
  if (isQuaternion(attitude)) {
    // Drawing → body is the quarter turn that puts the drawing's nose (-z) on body +x; then body
    // → inertial (the attitude); then game → scene.
    out.set(attitude.x, attitude.y, attitude.z, attitude.w);
    return out.premultiply(GAME_TO_SCENE).multiply(DRAWING_TO_BODY);
  }
  return out.identity();
}
/** Drawing axes (right, up, back) → body axes (forward, left, up): nose -z → +x, up +y → +z. */
const DRAWING_TO_BODY = SCENE_TO_GAME.clone().multiply(
  new Quaternion().setFromAxisAngle(Y, -Math.PI / 2),
);

/**
 * Turn rates about the body's up and left axes, rad/s: (yaw, pitch).
 * Planar: `angularRate`, a yaw rate. Three-dimensional: `angularVelocity`, body frame.
 */
export function turnRates(ship: {
  readonly angularRate?: unknown;
  readonly angularVelocity?: unknown;
}): { yaw: number; pitch: number } {
  const w = ship.angularVelocity ?? ship.angularRate;
  if (typeof w === 'number') return { yaw: w, pitch: 0 };
  if (typeof w === 'object' && w !== null) {
    const v = w as { x?: number; y?: number; z?: number };
    return { yaw: v.z ?? 0, pitch: v.y ?? 0 };
  }
  return { yaw: 0, pitch: 0 };
}

/** Compass heading of the nose in the reference plane, radians counter-clockwise from game +x. */
export function heading(attitude: unknown): number {
  if (typeof attitude === 'number') return attitude;
  if (isQuaternion(attitude)) {
    // Yaw of body +x after rotation by the attitude.
    const { w, x, y, z } = attitude;
    return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  }
  return 0;
}

/** Elevation of the nose (body +x) above the reference plane, rad. Planar: 0. */
export function pitch(attitude: unknown): number {
  if (!isQuaternion(attitude)) return 0;
  const { w, x, y, z } = attitude;
  // The z component of body +x after rotation: 2(xz − wy).
  return Math.asin(Math.max(-1, Math.min(1, 2 * (x * z - w * y))));
}

/** Moment of inertia about the body's up axis, kg·m². Planar: the one scalar. */
export function yawInertia(inertia: unknown): number {
  if (typeof inertia === 'number') return inertia;
  if (typeof inertia === 'object' && inertia !== null) {
    const i = inertia as { z?: number; moments?: { z?: number }; principal?: { z?: number } };
    return i.z ?? i.moments?.z ?? i.principal?.z ?? NaN;
  }
  return NaN;
}

/** A sensor's field of view as the views draw it: a cone from the ship. */
export interface ViewCone {
  readonly sensor: string;
  /** Unit axis in the scene. */
  readonly axis: Vector3;
  /** Direction of the axis in the reference plane, radians counter-clockwise from game +x. */
  readonly bearing: number;
  readonly halfAngle: number;
  readonly range: number;
  readonly quality: number;
}

/**
 * What the ship can sense right now, as cones. Planar: `sectors`, each an inertial angle and a
 * half-width in the flight plane. Three-dimensional: `cones`, each an axis and a half-angle.
 */
export function coverageCones(coverage: {
  readonly sectors?: readonly {
    readonly sensor: string;
    readonly center: number;
    readonly halfWidth: number;
    readonly range: number;
    readonly quality: number;
  }[];
  readonly cones?: readonly {
    readonly sensor: string;
    readonly axis: GameVec;
    readonly halfAngle: number;
    readonly range: number;
    readonly quality: number;
  }[];
}): ViewCone[] {
  if (coverage.cones)
    return coverage.cones.map((c) => {
      const axis = toScene(c.axis).normalize();
      return {
        sensor: c.sensor,
        axis,
        bearing: Math.atan2(-axis.z, axis.x),
        halfAngle: c.halfAngle,
        range: c.range,
        quality: c.quality,
      };
    });
  return (coverage.sectors ?? []).map((s) => ({
    sensor: s.sensor,
    axis: new Vector3(Math.cos(s.center), 0, -Math.sin(s.center)),
    bearing: s.center,
    halfAngle: s.halfWidth,
    range: s.range,
    quality: s.quality,
  }));
}

/**
 * The outline of the ship in the body x-y plane, for drawing its true hull and footprint.
 * Planar: the `footprint` polygon of the configuration. Three-dimensional: the `hull` is a
 * union of prisms. One prism: its outline. Several (the 3D ship is a pressure hull and four
 * wings): the convex envelope of all of them, counter-clockwise, which is the occupied footprint
 * the planar game drew (2G).
 */
export function hullOutline(source: {
  readonly footprint?: readonly GameVec[];
  readonly hull?: readonly { readonly outline: readonly GameVec[] }[];
}): readonly GameVec[] {
  if (source.footprint) return source.footprint;
  const prisms = source.hull ?? [];
  if (prisms.length <= 1) return prisms[0]?.outline ?? [];
  const points = prisms
    .flatMap((prism) => prism.outline.map((p) => ({ x: p.x, y: p.y })))
    .sort((p, q) => p.x - q.x || p.y - q.y);
  const turn = (o: GameVec, p: GameVec, q: GameVec): number =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const chain = (items: readonly { x: number; y: number }[]): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (const point of items) {
      while (out.length > 1 && turn(out[out.length - 2]!, out[out.length - 1]!, point) <= 0)
        out.pop();
      out.push(point);
    }
    return out.slice(0, -1);
  };
  return [...chain(points), ...chain([...points].reverse())];
}

/**
 * Hold the nose `offset` radians to the left of where it points now: the body axis turned about
 * the body's own up axis, as an inertial direction. Roll is held by the game (A11).
 */
export function holdFromNose(attitude: unknown, offset: number): AttitudeTarget {
  if (isQuaternion(attitude)) {
    const d = new Vector3(Math.cos(offset), Math.sin(offset), 0).applyQuaternion(
      new Quaternion(attitude.x, attitude.y, attitude.z, attitude.w),
    );
    return { reference: 'direction', direction: { x: d.x, y: d.y, z: d.z } };
  }
  const a = heading(attitude) + offset;
  return { reference: 'direction', direction: { x: Math.cos(a), y: Math.sin(a), z: 0 } };
}

/** A body-frame point (x forward, y left, z up) → the ship drawing's frame (metres). */
export function bodyToDrawing(v: GameVec, out = new Vector3()): Vector3 {
  return out.set(-v.y, v.z ?? 0, -v.x);
}

/** hh:mm:ss of mission elapsed time. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** A distance for a tag: metres below 10 km, then kilometres. */
export function range(metres: number): string {
  const m = Math.abs(metres);
  if (m < 10_000) return `${metres.toFixed(0)} m`;
  if (m < 1_000_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${(metres / 1000).toFixed(0)} km`;
}
