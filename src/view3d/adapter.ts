/**
 * The one place the views read geometry from the snapshot (DECISIONS A11).
 *
 * Thread 2G is converting the contracts from planar to three-dimensional. Until its lift merges,
 * positions are `{ x, y }`, covariances have three terms and attitude is one yaw angle; afterwards
 * they are `{ x, y, z }`, six terms and a quaternion. Every view draws in 3D from the start and
 * reads through these functions, so the switch is a change here and nowhere else.
 *
 * Scene axes: game (x, y, z) maps to scene (x, z, -y). Game z (out of the old flight plane) is
 * scene "up", and the plane seen from above is not mirrored (visual-direction.md § 9).
 */
import { Quaternion, Vector3 } from 'three';

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

/** Turn rates about the body's up and left axes, rad/s: (yaw, pitch). Planar: yaw only. */
export function turnRates(angularRate: unknown): { yaw: number; pitch: number } {
  if (typeof angularRate === 'number') return { yaw: angularRate, pitch: 0 };
  if (typeof angularRate === 'object' && angularRate !== null) {
    const w = angularRate as { x?: number; y?: number; z?: number };
    return { yaw: w.z ?? 0, pitch: w.y ?? 0 };
  }
  return { yaw: 0, pitch: 0 };
}

/**
 * Axis of a sensor's field of view in the scene. Planar: `center` is an inertial angle in the
 * flight plane. Three-dimensional: the sector carries a direction vector and is a cone.
 */
export function sectorAxis(
  sector: { readonly center?: unknown; readonly direction?: unknown },
  out = new Vector3(),
): Vector3 {
  const d = sector.direction ?? sector.center;
  if (typeof d === 'number') return out.set(Math.cos(d), 0, -Math.sin(d));
  if (typeof d === 'object' && d !== null && typeof (d as GameVec).x === 'number')
    return toScene(d as GameVec, out).normalize();
  return out.set(0, 0, -1);
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
