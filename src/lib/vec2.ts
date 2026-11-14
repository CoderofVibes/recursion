/**
 * Small immutable 2D vector module (DECISIONS P1: planar flight).
 *
 * Physics code goes through this module so a later move to 3D is a code change, not a rewrite.
 * Vectors are plain JSON-friendly objects. Hot loops may unpack to scalars for speed.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });
export const UNIT_X: Vec2 = Object.freeze({ x: 1, y: 0 });
export const UNIT_Y: Vec2 = Object.freeze({ x: 0, y: 1 });

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const neg = (a: Vec2): Vec2 => ({ x: -a.x, y: -a.y });

/** a + b * s, the common integrator update. */
export const addScaled = (a: Vec2, b: Vec2, s: number): Vec2 => ({
  x: a.x + b.x * s,
  y: a.y + b.y * s,
});

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** z-component of the 3D cross product (a × b). Positive when b is counter-clockwise of a. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const lengthSq = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const distanceSq = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

/** Unit vector in the direction of a. Returns ZERO for a zero-length input. */
export const normalize = (a: Vec2): Vec2 => {
  const len = length(a);
  return len === 0 ? ZERO : { x: a.x / len, y: a.y / len };
};

/** Counter-clockwise perpendicular (rotate by +90°). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

/** Rotate counter-clockwise by angle (rad). */
export const rotate = (a: Vec2, angle: number): Vec2 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};

/** Unit vector at angle (rad) from +x, counter-clockwise. */
export const fromAngle = (angle: number, len = 1): Vec2 => ({
  x: Math.cos(angle) * len,
  y: Math.sin(angle) * len,
});

/** Angle (rad) of a from +x, in (-π, π]. */
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const equals = (a: Vec2, b: Vec2, tolerance = 0): boolean =>
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;

/** Wrap an angle to (-π, π]. */
export const wrapAngle = (angle: number): number => {
  const twoPi = 2 * Math.PI;
  let a = angle % twoPi;
  if (a <= -Math.PI) a += twoPi;
  else if (a > Math.PI) a -= twoPi;
  return a;
};

/** Body frame → inertial frame for a ship with attitude (yaw) angle. */
export const bodyToInertial = (v: Vec2, attitude: number): Vec2 => rotate(v, attitude);

/** Inertial frame → body frame for a ship with attitude (yaw) angle. */
export const inertialToBody = (v: Vec2, attitude: number): Vec2 => rotate(v, -attitude);
