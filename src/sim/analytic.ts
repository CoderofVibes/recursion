/**
 * Closed forms for the power law a = K / r^n, derived here from the equations of motion
 * (not copied from 1B), plus a circular-binary set-up helper for content authors.
 *
 * Isolated fixed source, test particle, polar coordinates (r, θ), h = r²θ̇:
 *   r̈ − h²/r³ = −K/r^n,   effective potential V(r) = h²/(2r²) − K/((n−1) r^(n−1)).
 * Circular orbit (V' = 0):          h² = K r^(3−n),  v_c = √(K r^(1−n)),  Ω = √(K / r^(n+1)).
 * Small radial oscillation (V''):   κ² = V''(r_c) = (3 − n) Ω²,  stable for n < 3.
 * Apsidal angle (peri → apo):       ψ = π Ω / κ = π / √(3 − n).
 * Escape (zero energy):             v_esc = √(2K / ((n−1) r^(n−1))) = √(2/(n−1)) · v_c.
 *
 * Angles near-circular are small-amplitude limits; an exactly circular orbit has no periapsis.
 */

import type { GravityLaw, MassiveBody } from '../contracts/truth/index.ts';
import * as quat from '../lib/quat.ts';
import * as v3 from '../lib/vec3.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { coupling, potentialFrom } from './gravity.ts';

export const circularSpeed = (k: number, n: number, r: number): number =>
  Math.sqrt(k * Math.pow(r, 1 - n));

/** Ω = √(K / r^(n+1)), rad/s. */
export const circularAngularRate = (k: number, n: number, r: number): number =>
  Math.sqrt(k / Math.pow(r, n + 1));

export const circularPeriod = (k: number, n: number, r: number): number =>
  (2 * Math.PI) / circularAngularRate(k, n, r);

export const escapeSpeed = (k: number, n: number, r: number): number =>
  Math.sqrt((2 * k) / ((n - 1) * Math.pow(r, n - 1)));

/** κ = √(3 − n) · Ω, rad/s. NaN for n ≥ 3 (no stable circular orbit). */
export const epicyclicFrequency = (k: number, n: number, r: number): number =>
  Math.sqrt(3 - n) * circularAngularRate(k, n, r);

export const radialPeriod = (k: number, n: number, r: number): number =>
  (2 * Math.PI) / epicyclicFrequency(k, n, r);

/** Periapsis to the next apoapsis, small-amplitude limit, rad. */
export const apsidalAngle = (n: number): number => Math.PI / Math.sqrt(3 - n);

/** Specific orbital energy about one fixed source, m²/s². */
export const specificEnergy = (k: number, n: number, r: number, speed: number): number =>
  0.5 * speed * speed + potentialFrom(k, n, r);

export interface CircularBinarySpec {
  readonly id: string;
  readonly name: string;
  readonly gm: number;
  readonly radius: number;
}

export interface CircularBinaryOptions {
  /**
   * Normal of the orbit plane (any length; normalised here). Default +z: the orbit lies in the
   * x–y plane.
   */
  readonly normal?: Vec3;
  /**
   * Angle of the line from body A to body B, measured in the orbit plane from the plane's
   * reference direction toward its second axis (counter-clockwise seen from the tip of the
   * normal), rad. Default 0. The reference direction is where the smallest rotation that takes
   * +z onto the normal carries +x (`circularBinaryPlane`); for the default plane it is +x, so
   * the phase is then the angle from +x in the x–y plane.
   */
  readonly phase?: number;
  /** Barycentre position. Default origin. */
  readonly barycenter?: Vec3;
  /** Barycentre velocity. Default zero. */
  readonly barycenterVelocity?: Vec3;
  /** Orbit sense seen from the tip of the normal: +1 counter-clockwise (default), −1 clockwise. */
  readonly sense?: 1 | -1;
}

/**
 * The orbit plane's axes for a normal: unit `normal`, the reference direction `e1` that `phase`
 * is measured from and `e2 = normal × e1`. `e1` and `e2` are +x and +y carried by the smallest
 * rotation that takes +z onto the normal (for a normal of −z: a half-turn about +x), so a plane
 * tilted a little stays close to the x–y axes.
 */
export function circularBinaryPlane(normal: Vec3 = v3.UNIT_Z): {
  readonly normal: Vec3;
  readonly e1: Vec3;
  readonly e2: Vec3;
} {
  const unit = v3.normalize(normal);
  if (unit.x === 0 && unit.y === 0 && unit.z === 0)
    throw new Error('circular binary: the orbit normal must not be zero');
  const tilt = quat.shortestArc(v3.UNIT_Z, unit);
  return { normal: unit, e1: quat.rotate(tilt, v3.UNIT_X), e2: quat.rotate(tilt, v3.UNIT_Y) };
}

/**
 * Two bodies on a circular mutual orbit under `law`, in any plane.
 *
 * Relative motion R = x_B − x_A obeys R̈ = −(K_A + K_B) R / R^(n+1), so a circle of radius d
 * turns at ω = √((K_A + K_B) / d^(n+1)). Masses are proportional to gm (shared r0), so the
 * barycentre splits d in the ratio gm_B : gm_A; each body moves at ω n̂ × (its barycentric
 * offset).
 *
 * Returns the two bodies, the signed rate `angularRate` about the normal (negative for
 * `sense: −1`) and the angular-velocity vector `angularVelocity = angularRate · n̂` (what
 * `invariants.shipJacobiConstant` takes).
 */
export function circularBinary(
  law: GravityLaw,
  a: CircularBinarySpec,
  b: CircularBinarySpec,
  separation: number,
  options: CircularBinaryOptions = {},
): {
  readonly bodies: readonly [MassiveBody, MassiveBody];
  readonly angularRate: number;
  readonly angularVelocity: Vec3;
} {
  const n = law.exponent;
  const kTotal = coupling(a.gm, law) + coupling(b.gm, law);
  const sense = options.sense ?? 1;
  const omega = sense * Math.sqrt(kTotal / Math.pow(separation, n + 1));
  const phase = options.phase ?? 0;
  const c = options.barycenter ?? { x: 0, y: 0, z: 0 };
  const cv = options.barycenterVelocity ?? { x: 0, y: 0, z: 0 };
  const { normal, e1, e2 } = circularBinaryPlane(options.normal);
  const u1 = Math.cos(phase);
  const u2 = Math.sin(phase);
  // Unit vector from A to B. In the default plane (e1 = +x, e2 = +y) this is (cos, sin, 0).
  const ux = u1 * e1.x + u2 * e2.x;
  const uy = u1 * e1.y + u2 * e2.y;
  const uz = u1 * e1.z + u2 * e2.z;
  const qB = b.gm / (a.gm + b.gm);
  const make = (spec: CircularBinarySpec, offset: number): MassiveBody => {
    const px = offset * ux;
    const py = offset * uy;
    const pz = offset * uz;
    return {
      id: spec.id,
      name: spec.name,
      gm: spec.gm,
      radius: spec.radius,
      position: { x: c.x + px, y: c.y + py, z: c.z + pz },
      // ω n̂ × p; for n̂ = +z this is ω (−py, px, 0).
      velocity: {
        x: cv.x + omega * (normal.y * pz - normal.z * py),
        y: cv.y + omega * (normal.z * px - normal.x * pz),
        z: cv.z + omega * (normal.x * py - normal.y * px),
      },
      fixed: false,
    };
  };
  return {
    bodies: [make(a, -qB * separation), make(b, (1 - qB) * separation)],
    angularRate: omega,
    // + 0: a component that is zero is +0, whatever the sense.
    angularVelocity: {
      x: omega * normal.x + 0,
      y: omega * normal.y + 0,
      z: omega * normal.z + 0,
    },
  };
}
