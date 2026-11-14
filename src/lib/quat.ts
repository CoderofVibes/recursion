/**
 * Unit quaternions for attitude (DECISIONS A11).
 *
 * Convention used everywhere: an attitude quaternion q rotates **body-frame vectors into the
 * inertial frame**, v_inertial = q ⊗ v_body ⊗ q*. Hamilton product, scalar first (w, x, y, z).
 * Composition: (a ⊗ b) applies b first, then a. Angular velocity ω is expressed in the body
 * frame, so q̇ = ½ q ⊗ (0, ω).
 *
 * A planar attitude (yaw ψ about inertial +z) is `fromYaw(ψ)`; `yawOf` recovers ψ.
 */

import type { Vec3 } from './vec3.ts';

export interface Quat {
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const IDENTITY: Quat = Object.freeze({ w: 1, x: 0, y: 0, z: 0 });

export const quat = (w: number, x: number, y: number, z: number): Quat => ({ w, x, y, z });

/** Hamilton product a ⊗ b (apply b, then a). */
export const multiply = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});

export const conjugate = (q: Quat): Quat => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });

export const norm = (q: Quat): number => Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);

/** Unit quaternion along q. Returns IDENTITY for a zero input. */
export const normalize = (q: Quat): Quat => {
  const n = norm(q);
  return n === 0 ? IDENTITY : { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
};

/** Same rotation with w ≥ 0 (q and −q are the same attitude). */
export const canonical = (q: Quat): Quat =>
  q.w < 0 || (q.w === 0 && (q.x < 0 || (q.x === 0 && (q.y < 0 || (q.y === 0 && q.z < 0)))))
    ? { w: -q.w, x: -q.x, y: -q.y, z: -q.z }
    : q;

/** Rotate v by q (body → inertial for an attitude quaternion). */
export const rotate = (q: Quat, v: Vec3): Vec3 => {
  // v' = v + 2w (u × v) + 2 u × (u × v), u = (x, y, z)
  const cx = q.y * v.z - q.z * v.y;
  const cy = q.z * v.x - q.x * v.z;
  const cz = q.x * v.y - q.y * v.x;
  return {
    x: v.x + 2 * (q.w * cx + q.y * cz - q.z * cy),
    y: v.y + 2 * (q.w * cy + q.z * cx - q.x * cz),
    z: v.z + 2 * (q.w * cz + q.x * cy - q.y * cx),
  };
};

/** Rotate v by the inverse of q (inertial → body for an attitude quaternion). */
export const rotateInverse = (q: Quat, v: Vec3): Vec3 =>
  rotate({ w: q.w, x: -q.x, y: -q.y, z: -q.z }, v);

/** Rotation by `angle` (rad, right-handed) about a unit `axis`. */
export const fromAxisAngle = (axis: Vec3, angle: number): Quat => {
  const h = 0.5 * angle;
  const s = Math.sin(h);
  return { w: Math.cos(h), x: axis.x * s, y: axis.y * s, z: axis.z * s };
};

/** Yaw ψ about +z: the planar attitude "inertial angle of body +x". */
export const fromYaw = (yaw: number): Quat => ({
  w: Math.cos(0.5 * yaw),
  x: 0,
  y: 0,
  z: Math.sin(0.5 * yaw),
});

/**
 * Azimuth of the rotated +x axis in the inertial x–y plane, in (−π, π]: the planar attitude
 * angle. Exactly the yaw for a rotation about z.
 */
export const yawOf = (q: Quat): number =>
  Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));

/** The rotated +x axis (the ship's body axis, inertial, for an attitude quaternion). */
export const axisX = (q: Quat): Vec3 => ({
  x: 1 - 2 * (q.y * q.y + q.z * q.z),
  y: 2 * (q.x * q.y + q.w * q.z),
  z: 2 * (q.x * q.z - q.w * q.y),
});

export const axisY = (q: Quat): Vec3 => ({
  x: 2 * (q.x * q.y - q.w * q.z),
  y: 1 - 2 * (q.x * q.x + q.z * q.z),
  z: 2 * (q.y * q.z + q.w * q.x),
});

export const axisZ = (q: Quat): Vec3 => ({
  x: 2 * (q.x * q.z + q.w * q.y),
  y: 2 * (q.y * q.z - q.w * q.x),
  z: 1 - 2 * (q.x * q.x + q.y * q.y),
});

/**
 * Rotation vector (axis × angle, angle in [0, π]) of q. This is how attitude fixes are stored
 * in measurements: three numbers, one sigma per axis. A yaw ψ in (−π, π] is (0, 0, ψ).
 */
export const toRotationVector = (q: Quat): Vec3 => {
  const c = canonical(q);
  const s = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z);
  if (s < 1e-12) return { x: 2 * c.x, y: 2 * c.y, z: 2 * c.z };
  const k = (2 * Math.atan2(s, c.w)) / s;
  return { x: c.x * k, y: c.y * k, z: c.z * k };
};

export const fromRotationVector = (v: Vec3): Quat => {
  const angle = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (angle < 1e-12) return normalize({ w: 1, x: 0.5 * v.x, y: 0.5 * v.y, z: 0.5 * v.z });
  const k = Math.sin(0.5 * angle) / angle;
  return { w: Math.cos(0.5 * angle), x: v.x * k, y: v.y * k, z: v.z * k };
};

/** Angle of the rotation taking attitude a to attitude b, in [0, π]. */
export const angleBetween = (a: Quat, b: Quat): number => {
  const d = Math.abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z);
  return 2 * Math.acos(d > 1 ? 1 : d);
};

/**
 * The smallest rotation that takes unit vector `from` to unit vector `to`. For opposite vectors
 * the axis is any perpendicular (deterministic: prefers ±z, so planar reversals stay planar).
 */
export const shortestArc = (from: Vec3, to: Vec3): Quat => {
  const d = from.x * to.x + from.y * to.y + from.z * to.z;
  const cx = from.y * to.z - from.z * to.y;
  const cy = from.z * to.x - from.x * to.z;
  const cz = from.x * to.y - from.y * to.x;
  if (d < -1 + 1e-12) {
    // 180°: rotate about an axis perpendicular to `from`.
    const az = Math.abs(from.z);
    const helper =
      az <= Math.abs(from.x) || az <= Math.abs(from.y)
        ? { x: 0, y: 0, z: 1 }
        : Math.abs(from.x) <= Math.abs(from.y)
          ? { x: 1, y: 0, z: 0 }
          : { x: 0, y: 1, z: 0 };
    // Component of helper perpendicular to `from`.
    const h = helper.x * from.x + helper.y * from.y + helper.z * from.z;
    const px = helper.x - h * from.x;
    const py = helper.y - h * from.y;
    const pz = helper.z - h * from.z;
    const n = Math.sqrt(px * px + py * py + pz * pz);
    return { w: 0, x: px / n, y: py / n, z: pz / n };
  }
  return normalize({ w: 1 + d, x: cx, y: cy, z: cz });
};

/**
 * "Roll held" pointing (DECISIONS A11): the attitude that puts body +x along `direction` by the
 * smallest rotation from `current`, so no roll about the line of sight is added. A zero
 * `direction` returns `current`. Shared by the game layer and the model so a commanded
 * direction resolves to the same attitude in flight and in a forecast.
 *
 * Planar case: when `current` is a rotation about z and `direction` lies in the x–y plane, the
 * result is exactly `fromYaw(atan2(direction.y, direction.x))`, so planar flight reproduces the
 * planar game's numbers.
 */
export const pointAlong = (current: Quat, direction: Vec3): Quat => {
  const len = Math.sqrt(
    direction.x * direction.x + direction.y * direction.y + direction.z * direction.z,
  );
  if (len === 0) return current;
  if (direction.z === 0 && current.x === 0 && current.y === 0)
    return fromYaw(Math.atan2(direction.y, direction.x));
  const to = { x: direction.x / len, y: direction.y / len, z: direction.z / len };
  return normalize(multiply(shortestArc(axisX(current), to), current));
};

/** Spherical interpolation from a (t = 0) to b (t = 1) along the shorter way. */
export const slerp = (a: Quat, b: Quat, t: number): Quat => {
  let d = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  const sign = d < 0 ? -1 : 1;
  d *= sign;
  if (d > 1 - 1e-12) {
    return normalize({
      w: a.w + (sign * b.w - a.w) * t,
      x: a.x + (sign * b.x - a.x) * t,
      y: a.y + (sign * b.y - a.y) * t,
      z: a.z + (sign * b.z - a.z) * t,
    });
  }
  const theta = Math.acos(d);
  const s = Math.sin(theta);
  const ka = Math.sin((1 - t) * theta) / s;
  const kb = (sign * Math.sin(t * theta)) / s;
  return {
    w: ka * a.w + kb * b.w,
    x: ka * a.x + kb * b.x,
    y: ka * a.y + kb * b.y,
    z: ka * a.z + kb * b.z,
  };
};

/** q advanced by a body-frame rotation vector (ω·dt): q ⊗ exp(½ φ). Exact for constant ω. */
export const integrateBodyRate = (q: Quat, omega: Vec3, dt: number): Quat =>
  normalize(multiply(q, fromRotationVector({ x: omega.x * dt, y: omega.y * dt, z: omega.z * dt })));

export const isFiniteQuat = (q: Quat): boolean =>
  Number.isFinite(q.w) && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z);

/** Row-major 3×3 rotation matrix of q (columns are the rotated axes). */
export const toMatrix = (
  q: Quat,
): [number, number, number, number, number, number, number, number, number] => {
  const ax = axisX(q);
  const ay = axisY(q);
  const az = axisZ(q);
  return [ax.x, ay.x, az.x, ax.y, ay.y, az.y, ax.z, ay.z, az.z];
};

/** Unit quaternion of a proper rotation matrix (row-major 3×3). Shepperd's method. */
export const fromMatrix = (m: readonly number[]): Quat => {
  const m00 = m[0]!;
  const m01 = m[1]!;
  const m02 = m[2]!;
  const m10 = m[3]!;
  const m11 = m[4]!;
  const m12 = m[5]!;
  const m20 = m[6]!;
  const m21 = m[7]!;
  const m22 = m[8]!;
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    q = { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
  return canonical(normalize(q));
};
