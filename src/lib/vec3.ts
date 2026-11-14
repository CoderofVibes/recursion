/**
 * Small immutable 3D vector module (DECISIONS A11: flight is three-dimensional).
 *
 * Physics code goes through this module. Vectors are plain JSON-friendly objects. Hot loops may
 * unpack to scalars for speed. `vec2.ts` remains for genuinely planar data (hull outlines, plots).
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
export const UNIT_X: Vec3 = Object.freeze({ x: 1, y: 0, z: 0 });
export const UNIT_Y: Vec3 = Object.freeze({ x: 0, y: 1, z: 0 });
export const UNIT_Z: Vec3 = Object.freeze({ x: 0, y: 0, z: 1 });

/** z defaults to 0, so planar data lifts with `vec3(x, y)`. */
export const vec3 = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const neg = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z });

/** a + b * s, the common integrator update. */
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => ({
  x: a.x + b.x * s,
  y: a.y + b.y * s,
  z: a.z + b.z * s,
});

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** a × b (right-handed). */
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const lengthSq = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const length = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const distanceSq = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};
export const distance = (a: Vec3, b: Vec3): number => Math.sqrt(distanceSq(a, b));

/** Unit vector in the direction of a. Returns ZERO for a zero-length input. */
export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  return len === 0 ? ZERO : { x: a.x / len, y: a.y / len, z: a.z / len };
};

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export const equals = (a: Vec3, b: Vec3, tolerance = 0): boolean =>
  Math.abs(a.x - b.x) <= tolerance &&
  Math.abs(a.y - b.y) <= tolerance &&
  Math.abs(a.z - b.z) <= tolerance;

export const isFinite3 = (a: Vec3): boolean =>
  Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);

/**
 * A unit vector perpendicular to `a` (any one; deterministic). Uses the coordinate axis least
 * aligned with `a`. Returns UNIT_Z for a zero-length input.
 */
export const anyPerpendicular = (a: Vec3): Vec3 => {
  const ax = Math.abs(a.x);
  const ay = Math.abs(a.y);
  const az = Math.abs(a.z);
  if (ax === 0 && ay === 0 && az === 0) return UNIT_Z;
  // Prefer +z as the helper while `a` is not near it, so in-plane vectors get an in-plane or
  // ±z perpendicular (keeps planar cases planar).
  const helper = az <= ax || az <= ay ? UNIT_Z : ax <= ay ? UNIT_X : UNIT_Y;
  return normalize(cross(helper, a));
};

/** Unit vector at azimuth (from +x toward +y) and elevation (toward +z), rad. */
export const fromAzEl = (azimuth: number, elevation = 0, len = 1): Vec3 => {
  const c = Math.cos(elevation);
  return {
    x: Math.cos(azimuth) * c * len,
    y: Math.sin(azimuth) * c * len,
    z: Math.sin(elevation) * len,
  };
};

/** Azimuth of a from +x toward +y, in (−π, π]. 0 for a vector along ±z. */
export const azimuthOf = (a: Vec3): number => Math.atan2(a.y, a.x);

/** Elevation of a above the x–y plane, in [−π/2, π/2]. 0 for a zero-length input. */
export const elevationOf = (a: Vec3): number => Math.atan2(a.z, Math.hypot(a.x, a.y));

/** Angle between two vectors, in [0, π]. 0 if either has zero length. */
export const angleBetween = (a: Vec3, b: Vec3): number => {
  const c = cross(a, b);
  return Math.atan2(length(c), dot(a, b));
};
