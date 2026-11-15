/**
 * TRUTH side. The Jacobi constant of a test particle in a circular binary, and the value at the
 * neck between the two bodies (L1). Used by the `depart` objective to tell learning burns from
 * departing ones (DECISIONS A18 (3)).
 *
 * In the frame turning with the binary, a coasting particle keeps
 *
 *   C = −2 (E − ω·L),   E = ½|v|² + Σ Uᵢ,   L = r × v,
 *
 * with r and v relative to the bodies' barycentre, Uᵢ each body's potential under the world's
 * law (P4) and ω the binary's angular velocity. C changes only with thrust or a contact. While
 * C is above its value at L1, the zero-velocity surface closes round the body the ship is near:
 * it cannot leave without burning, however long it coasts (S8, `docs/studies/s8/
 * turns-objective.md`, which gives C = 5,826.649 at the Gravity range's arrival and 5,468.317
 * at its L1). This holds for any law with n > 1 and in three dimensions, the binary turning in
 * its own plane (A11).
 */

import type { TruthWorld } from '../contracts/truth/index.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { coupling, potentialFrom } from '../sim/index.ts';

/** The first two bodies' barycentre, its velocity, and the binary's angular velocity. */
export interface BinaryFrame {
  readonly barycentre: Vec3;
  readonly velocity: Vec3;
  readonly omega: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

/** The binary's frame, or undefined when the world has fewer than two massive bodies. */
export function binaryFrame(world: TruthWorld): BinaryFrame | undefined {
  const [a, b] = world.bodies;
  if (!a || !b) return undefined;
  const m = a.gm + b.gm;
  const mix = (p: Vec3, q: Vec3): Vec3 => ({
    x: (a.gm * p.x + b.gm * q.x) / m,
    y: (a.gm * p.y + b.gm * q.y) / m,
    z: (a.gm * p.z + b.gm * q.z) / m,
  });
  const va = a.fixed ? { x: 0, y: 0, z: 0 } : a.velocity;
  const vb = b.fixed ? { x: 0, y: 0, z: 0 } : b.velocity;
  const r = sub(b.position, a.position);
  const v = sub(vb, va);
  const r2 = dot(r, r);
  const h = cross(r, v);
  return {
    barycentre: mix(a.position, b.position),
    velocity: mix(va, vb),
    omega: { x: h.x / r2, y: h.y / r2, z: h.z / r2 },
  };
}

/** The sum of every body's potential at a point, m²/s². */
function potential(world: TruthWorld, at: Vec3): number {
  let u = 0;
  for (const b of world.bodies)
    u += potentialFrom(coupling(b.gm, world.law), world.law.exponent, norm(sub(at, b.position)));
  return u;
}

/** The ship's Jacobi constant, m²/s² (undefined without a binary). */
export function jacobiConstant(world: TruthWorld): number | undefined {
  const frame = binaryFrame(world);
  if (!frame) return undefined;
  const k = world.ship.kinematics;
  const r = sub(k.position, frame.barycentre);
  const v = sub(k.velocity, frame.velocity);
  const energy = 0.5 * dot(v, v) + potential(world, k.position);
  return -2 * (energy - dot(frame.omega, cross(r, v)));
}

/**
 * C at the neck between the first two bodies (L1): the highest effective potential on the line
 * joining them, found by golden-section search. A particle at rest in the turning frame there
 * has this C. Undefined without a binary.
 */
export function innerNeck(world: TruthWorld): number | undefined {
  const frame = binaryFrame(world);
  const [a, b] = world.bodies;
  if (!frame || !a || !b) return undefined;
  const w2 = dot(frame.omega, frame.omega);
  const at = (s: number): Vec3 => ({
    x: a.position.x + s * (b.position.x - a.position.x),
    y: a.position.y + s * (b.position.y - a.position.y),
    z: a.position.z + s * (b.position.z - a.position.z),
  });
  // Effective potential in the turning frame: gravity minus the centrifugal term about the
  // binary's axis through the barycentre (the line lies in the binary's plane).
  const effective = (s: number): number => {
    const p = at(s);
    const r = sub(p, frame.barycentre);
    return potential(world, p) - 0.5 * w2 * dot(r, r);
  };
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = 1e-6;
  let hi = 1 - 1e-6;
  for (let i = 0; i < 200; i++) {
    const m1 = hi - g * (hi - lo);
    const m2 = lo + g * (hi - lo);
    if (effective(m1) < effective(m2)) lo = m1;
    else hi = m2;
  }
  return -2 * effective(0.5 * (lo + hi));
}
