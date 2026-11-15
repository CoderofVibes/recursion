/**
 * Small builders for sim tests (not exported from index.ts).
 *
 * Every builder takes either full three-dimensional values or the planar shorthand the first
 * tests were written with: `{x, y}` for a vector in the x–y plane (z = 0), a number for an
 * attitude (yaw about +z), an angular rate (about body z) or a torque (about body z).
 */

import { mockShipSystemsState } from '../contracts/fixtures/truth.ts';
import { isotropicInertia, prismHull, type MassProperties } from '../contracts/ship.ts';
import type {
  ActuatorOutput,
  Asteroid,
  GravityLaw,
  MassiveBody,
  ShipSystemsState,
  ThrustOutput,
  TruthWorld,
} from '../contracts/truth/index.ts';
import * as quat from '../lib/quat.ts';
import type { Quat } from '../lib/quat.ts';
import { createRng } from '../lib/rng.ts';
import type { Vec2 } from '../lib/vec2.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { circularBinary, circularSpeed } from './analytic.ts';
import { coupling } from './gravity.ts';

/** A 14 m × 4 m box hull centred on the datum, CoM at the datum. */
export const BOX_HULL: readonly Vec2[] = [
  { x: -7, y: -2 },
  { x: 7, y: -2 },
  { x: 7, y: 2 },
  { x: -7, y: 2 },
];

/** A vector, or a planar one in the x–y plane (z = 0). */
export type VecSpec = Vec2 | Vec3;

const lift = (p: VecSpec): Vec3 => ({ x: p.x, y: p.y, z: 'z' in p ? p.z : 0 });

/**
 * Angle of the rotation that takes attitude `a` to attitude `b`, rad, in [0, π]. Uses the
 * vector part of the relative rotation, so it resolves angles down to rounding and does not
 * mind quaternions a few ulp off unit length (the arccosine of a dot product cannot see below
 * about 3×10⁻⁸ rad).
 */
export function attitudeAngle(a: Quat, b: Quat): number {
  const d = quat.multiply(quat.conjugate(a), b);
  return 2 * Math.atan2(Math.hypot(d.x, d.y, d.z), Math.abs(d.w));
}

/** A vector about each body axis, or a number about body z. */
const aboutZ = (v: number | Vec3): Vec3 => (typeof v === 'number' ? { x: 0, y: 0, z: v } : v);

/** Mass properties; the centre of mass may be given in the body x–y plane. */
export type MassPropsSpec = Partial<Omit<MassProperties, 'centerOfMass'>> & {
  readonly centerOfMass?: VecSpec;
};

export function massProps(over: MassPropsSpec = {}): MassProperties {
  const { centerOfMass = { x: 0, y: 0 }, ...rest } = over;
  return {
    mass: 10_000,
    centerOfMass: lift(centerOfMass),
    inertia: isotropicInertia(2.0e5),
    hull: prismHull(BOX_HULL, -2, 2),
    ...rest,
  };
}

export function systemsWith(mp: MassProperties): ShipSystemsState {
  return { ...mockShipSystemsState, massProperties: mp };
}

export interface WorldSpec {
  law?: GravityLaw;
  bodies?: MassiveBody[];
  asteroids?: Asteroid[];
  position?: VecSpec;
  velocity?: VecSpec;
  /** Attitude quaternion (body to inertial), or a yaw about +z, rad. */
  attitude?: number | Quat;
  /** Angular velocity in the body frame, or a rate about body z, rad/s. */
  angularRate?: number | Vec3;
  mp?: MassProperties;
  t?: number;
}

export function makeWorld(spec: WorldSpec = {}): TruthWorld {
  const attitude = spec.attitude ?? 0;
  return {
    t: spec.t ?? 0,
    law: spec.law ?? { exponent: 2.5, referenceRadius: 1e6 },
    bodies: spec.bodies ?? [],
    asteroids: spec.asteroids ?? [],
    ship: {
      kinematics: {
        position: lift(spec.position ?? { x: 0, y: 0 }),
        velocity: lift(spec.velocity ?? { x: 0, y: 0 }),
        attitude: typeof attitude === 'number' ? quat.fromYaw(attitude) : attitude,
        angularVelocity: aboutZ(spec.angularRate ?? 0),
      },
      systems: systemsWith(spec.mp ?? massProps()),
    },
    fields: [],
    hidden: {},
  };
}

export function body(
  id: string,
  gm: number,
  radius: number,
  position: VecSpec,
  velocity: VecSpec = { x: 0, y: 0 },
  fixed = true,
): MassiveBody {
  return { id, name: id, gm, radius, position: lift(position), velocity: lift(velocity), fixed };
}

export function asteroid(
  id: string,
  position: VecSpec,
  velocity: VecSpec,
  radius: number,
): Asteroid {
  return { id, position: lift(position), velocity: lift(velocity), radius };
}

/** `torque` is the pure torque in the body frame, N·m (a number: about body z). */
export function actuators(
  thrusts: ThrustOutput[],
  mp: MassProperties = massProps(),
  torque: number | Vec3 = 0,
): ActuatorOutput {
  return { thrusts, torque: aboutZ(torque), massProperties: mp };
}

export const thrust = (point: VecSpec, force: VecSpec, source = 'main-engine'): ThrustOutput => ({
  source,
  point: lift(point),
  force: lift(force),
});

/**
 * The Gravity range candidate scale (DECISIONS P16, 1B §6): shared r0 = 1000 km, a circular
 * binary of GM 1e10 and 2.5e9 m³/s² at 4000 km, and `asteroidCount` asteroids on roughly
 * circular orbits about the primary. The ship starts 1000 km from the primary on a circle.
 * Everything lies in the x–y plane except the mock ship itself (its centre of mass and
 * principal axes are off the body axes, so thrust tumbles it in three dimensions).
 */
export function gravityRangeWorld(asteroidCount = 0, seed = 'gravity-range-test'): TruthWorld {
  const law: GravityLaw = { exponent: 2.5, referenceRadius: 1e6 };
  const { bodies } = circularBinary(
    law,
    { id: 'alpha', name: 'Alpha', gm: 1e10, radius: 250e3 },
    { id: 'beta', name: 'Beta', gm: 2.5e9, radius: 160e3 },
    4e6,
  );
  const primary = bodies[0];
  const kPrimary = coupling(primary.gm, law);
  const rng = createRng(seed).stream('asteroids');
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < asteroidCount; i++) {
    const r = rng.range(500e3, 1500e3);
    const phase = rng.range(0, 2 * Math.PI);
    const v = circularSpeed(kPrimary, law.exponent, r);
    asteroids.push({
      id: `a-${String(i + 1).padStart(2, '0')}`,
      position: {
        x: primary.position.x + r * Math.cos(phase),
        y: primary.position.y + r * Math.sin(phase),
        z: 0,
      },
      velocity: {
        x: primary.velocity.x - v * Math.sin(phase),
        y: primary.velocity.y + v * Math.cos(phase),
        z: 0,
      },
      radius: rng.range(20, 400),
    });
  }
  const rShip = 1e6;
  const vShip = circularSpeed(kPrimary, law.exponent, rShip);
  return makeWorld({
    law,
    bodies: [...bodies],
    asteroids,
    position: { x: primary.position.x, y: primary.position.y - rShip },
    velocity: { x: primary.velocity.x + vShip, y: primary.velocity.y },
    attitude: 0,
    mp: mockShipSystemsState.massProperties,
  });
}
