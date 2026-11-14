/**
 * Conserved and diagnostic quantities, for tests and debugging.
 *
 * Masses are proportional to gm (one shared r0, P4), so "per unit total mass" quantities use the
 * weights w_i = gm_i / Σ gm. Which quantity is conserved depends on the set-up:
 *  - a single fixed source: the ship's specific energy and angular momentum about it;
 *  - mutually moving bodies: the bodies' total energy, momentum and angular momentum;
 *  - a ship in an exactly circular binary: the Jacobi constant (inertial barycentric form).
 * A ship in a moving binary conserves neither its inertial energy nor its angular momentum.
 */

import type { TruthWorld } from '../contracts/truth/index.ts';
import type { Vec2 } from '../lib/vec2.ts';
import { coupling, potentialFrom } from './gravity.ts';

const totalGm = (world: TruthWorld): number => world.bodies.reduce((s, b) => s + b.gm, 0);

/** Specific gravitational potential of all bodies at a point, m²/s². */
export function potentialAt(world: TruthWorld, p: Vec2): number {
  const n = world.law.exponent;
  let phi = 0;
  for (const b of world.bodies) {
    phi += potentialFrom(
      coupling(b.gm, world.law),
      n,
      Math.hypot(p.x - b.position.x, p.y - b.position.y),
    );
  }
  return phi;
}

/** Ship ½v² + Φ, m²/s². Conserved only for fixed sources and no thrust. */
export function shipSpecificEnergy(world: TruthWorld): number {
  const { position, velocity } = world.ship.kinematics;
  return 0.5 * (velocity.x ** 2 + velocity.y ** 2) + potentialAt(world, position);
}

/** Ship (r − about) × v, m²/s². */
export function shipSpecificAngularMomentum(
  world: TruthWorld,
  about: Vec2 = { x: 0, y: 0 },
): number {
  const { position: p, velocity: v } = world.ship.kinematics;
  return (p.x - about.x) * v.y - (p.y - about.y) * v.x;
}

/** gm-weighted mean body position, m. */
export function barycenter(world: TruthWorld): Vec2 {
  const m = totalGm(world);
  let x = 0;
  let y = 0;
  for (const b of world.bodies) {
    x += (b.gm / m) * b.position.x;
    y += (b.gm / m) * b.position.y;
  }
  return { x, y };
}

/** gm-weighted mean body velocity, m/s. */
export function barycentricVelocity(world: TruthWorld): Vec2 {
  const m = totalGm(world);
  let x = 0;
  let y = 0;
  for (const b of world.bodies) {
    x += (b.gm / m) * b.velocity.x;
    y += (b.gm / m) * b.velocity.y;
  }
  return { x, y };
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
    e += 0.5 * (bi.gm / m) * (bi.velocity.x ** 2 + bi.velocity.y ** 2);
    for (let j = i + 1; j < bs.length; j++) {
      const bj = bs[j]!;
      const d = Math.hypot(bj.position.x - bi.position.x, bj.position.y - bi.position.y);
      e += (bi.gm / m) * potentialFrom(coupling(bj.gm, world.law), n, d);
    }
  }
  return e;
}

/** Bodies' total angular momentum about the origin divided by their total mass, m²/s. */
export function bodiesSpecificAngularMomentum(world: TruthWorld): number {
  const m = totalGm(world);
  let h = 0;
  for (const b of world.bodies) {
    h += (b.gm / m) * (b.position.x * b.velocity.y - b.position.y * b.velocity.x);
  }
  return h;
}

/**
 * Jacobi constant of the ship in a circular binary rotating at `omega` about the origin
 * (which must be the barycentre), inertial form: C = −2Φ − |v|² + 2ω (x v_y − y v_x).
 * Constant for a coasting test particle when the binary is exactly circular.
 */
export function shipJacobiConstant(world: TruthWorld, omega: number): number {
  const { position: p, velocity: v } = world.ship.kinematics;
  return -2 * potentialAt(world, p) - (v.x * v.x + v.y * v.y) + 2 * omega * (p.x * v.y - p.y * v.x);
}
