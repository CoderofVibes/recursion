/**
 * Conserved and diagnostic quantities, for tests and debugging. Three-dimensional (A11):
 * distances and speeds use all three components, and angular momenta are vectors.
 *
 * Masses are proportional to gm (one shared r0, P4), so "per unit total mass" quantities use the
 * weights w_i = gm_i / Σ gm. Which quantity is conserved depends on the set-up:
 *  - a single fixed source: the ship's specific energy and angular-momentum vector about it;
 *  - mutually moving bodies: the bodies' total energy, momentum and angular-momentum vector;
 *  - a ship in an exactly circular binary: the Jacobi constant (inertial barycentric form);
 *  - a ship with no torque on it: its rotational energy and its spin angular momentum, as a
 *    vector in the inertial frame.
 * A ship in a moving binary conserves neither its inertial energy nor its angular momentum.
 *
 * The scalar functions `shipSpecificAngularMomentum` and `bodiesSpecificAngularMomentum` are
 * the z components of the vector ones (what they were when flight was planar).
 */

import type { TruthWorld } from '../contracts/truth/index.ts';
import * as quat from '../lib/quat.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { coupling, potentialFrom } from './gravity.ts';

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

const totalGm = (world: TruthWorld): number => world.bodies.reduce((s, b) => s + b.gm, 0);

/** Specific gravitational potential of all bodies at a point, m²/s². */
export function potentialAt(world: TruthWorld, p: Vec3): number {
  const n = world.law.exponent;
  let phi = 0;
  for (const b of world.bodies) {
    phi += potentialFrom(
      coupling(b.gm, world.law),
      n,
      Math.hypot(p.x - b.position.x, p.y - b.position.y, p.z - b.position.z),
    );
  }
  return phi;
}

/** Ship ½v² + Φ, m²/s². Conserved only for fixed sources and no thrust. */
export function shipSpecificEnergy(world: TruthWorld): number {
  const { position, velocity } = world.ship.kinematics;
  return 0.5 * (velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2) + potentialAt(world, position);
}

/** Ship (r − about) × v, m²/s: the orbital angular momentum per unit mass, as a vector. */
export function shipSpecificAngularMomentumVector(world: TruthWorld, about: Vec3 = ORIGIN): Vec3 {
  const { position: p, velocity: v } = world.ship.kinematics;
  const rx = p.x - about.x;
  const ry = p.y - about.y;
  const rz = p.z - about.z;
  return { x: ry * v.z - rz * v.y, y: rz * v.x - rx * v.z, z: rx * v.y - ry * v.x };
}

/** Ship (r − about) × v, z component, m²/s (the whole of it for motion in the x–y plane). */
export function shipSpecificAngularMomentum(world: TruthWorld, about: Vec3 = ORIGIN): number {
  const { position: p, velocity: v } = world.ship.kinematics;
  return (p.x - about.x) * v.y - (p.y - about.y) * v.x;
}

/** gm-weighted mean body position, m. */
export function barycenter(world: TruthWorld): Vec3 {
  const m = totalGm(world);
  let x = 0;
  let y = 0;
  let z = 0;
  for (const b of world.bodies) {
    x += (b.gm / m) * b.position.x;
    y += (b.gm / m) * b.position.y;
    z += (b.gm / m) * b.position.z;
  }
  return { x, y, z };
}

/** gm-weighted mean body velocity, m/s. */
export function barycentricVelocity(world: TruthWorld): Vec3 {
  const m = totalGm(world);
  let x = 0;
  let y = 0;
  let z = 0;
  for (const b of world.bodies) {
    x += (b.gm / m) * b.velocity.x;
    y += (b.gm / m) * b.velocity.y;
    z += (b.gm / m) * b.velocity.z;
  }
  return { x, y, z };
}

/**
 * Bodies' kinetic plus mutual potential energy divided by their total mass, m²/s².
 * Pair term: U_ij / M = −G_n M_i M_j / ((n−1) d^(n−1)) / M = w_i · Φ_j(d), with Φ_j from K_j.
 */
export function bodiesSpecificEnergy(world: TruthWorld): number {
  const m = totalGm(world);
  const n = world.law.exponent;
  const bs = world.bodies;
  let e = 0;
  for (let i = 0; i < bs.length; i++) {
    const bi = bs[i]!;
    e += 0.5 * (bi.gm / m) * (bi.velocity.x ** 2 + bi.velocity.y ** 2 + bi.velocity.z ** 2);
    for (let j = i + 1; j < bs.length; j++) {
      const bj = bs[j]!;
      const d = Math.hypot(
        bj.position.x - bi.position.x,
        bj.position.y - bi.position.y,
        bj.position.z - bi.position.z,
      );
      e += (bi.gm / m) * potentialFrom(coupling(bj.gm, world.law), n, d);
    }
  }
  return e;
}

/** Bodies' total angular momentum about the origin divided by their total mass, m²/s. */
export function bodiesSpecificAngularMomentumVector(world: TruthWorld): Vec3 {
  const m = totalGm(world);
  let x = 0;
  let y = 0;
  let z = 0;
  for (const b of world.bodies) {
    const { position: p, velocity: v } = b;
    x += (b.gm / m) * (p.y * v.z - p.z * v.y);
    y += (b.gm / m) * (p.z * v.x - p.x * v.z);
    z += (b.gm / m) * (p.x * v.y - p.y * v.x);
  }
  return { x, y, z };
}

/**
 * Bodies' total angular momentum about the origin divided by their total mass, z component,
 * m²/s (the whole of it for bodies moving in the x–y plane).
 */
export function bodiesSpecificAngularMomentum(world: TruthWorld): number {
  const m = totalGm(world);
  let h = 0;
  for (const b of world.bodies) {
    h += (b.gm / m) * (b.position.x * b.velocity.y - b.position.y * b.velocity.x);
  }
  return h;
}

/**
 * Jacobi constant of the ship in a circular binary that turns with angular velocity `omega`
 * about the origin (which must be the barycentre), inertial form:
 *   C = −2Φ − |v|² + 2 ω⃗·(r × v).
 * Constant for a coasting test particle when the binary is exactly circular. `omega` is the
 * binary's angular-velocity vector (`circularBinary(...).angularVelocity`), or a number for a
 * binary in the x–y plane turning about +z at that rate.
 */
export function shipJacobiConstant(world: TruthWorld, omega: number | Vec3): number {
  const { position: p, velocity: v } = world.ship.kinematics;
  const v2 = v.x * v.x + v.y * v.y + v.z * v.z;
  const hz = p.x * v.y - p.y * v.x;
  if (typeof omega === 'number') return -2 * potentialAt(world, p) - v2 + 2 * omega * hz;
  const hx = p.y * v.z - p.z * v.y;
  const hy = p.z * v.x - p.x * v.z;
  return -2 * potentialAt(world, p) - v2 + 2 * (omega.x * hx + omega.y * hy + omega.z * hz);
}

/** The ship's angular velocity along its principal axes (ω_p = Pᵀ·ω), rad/s. */
function principalRates(world: TruthWorld): Vec3 {
  const { inertia } = world.ship.systems.massProperties;
  return quat.rotateInverse(inertia.axes, world.ship.kinematics.angularVelocity);
}

/**
 * Rotational kinetic energy of the ship about its centre of mass, ½ ω·I·ω = ½ Σ Iᵢ ω_pᵢ², J.
 * Constant while no torque acts and the mass properties do not change.
 */
export function shipRotationalEnergy(world: TruthWorld): number {
  const { moments } = world.ship.systems.massProperties.inertia;
  const o = principalRates(world);
  return 0.5 * (moments.x * o.x * o.x + moments.y * o.y * o.y + moments.z * o.z * o.z);
}

/**
 * The ship's spin angular momentum about its centre of mass in the inertial frame, q·(I·ω),
 * kg·m²/s. A constant vector while no torque acts and the mass properties do not change.
 */
export function shipSpinAngularMomentum(world: TruthWorld): Vec3 {
  const { inertia } = world.ship.systems.massProperties;
  const o = principalRates(world);
  const body = quat.rotate(inertia.axes, {
    x: inertia.moments.x * o.x,
    y: inertia.moments.y * o.y,
    z: inertia.moments.z * o.z,
  });
  return quat.rotate(world.ship.kinematics.attitude, body);
}
