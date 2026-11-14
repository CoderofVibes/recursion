/**
 * The gravity law (DECISIONS P4 as clarified by 1B), derived here independently of 1B's tools.
 *
 * Every massive body is a point source. Its pull on anything at distance r is
 *
 *   a = (gm / r0²) · (r0 / r)^n  =  K / r^n,   K = gm · r0^(n−2)   [K in m^(n+1) s⁻²]
 *
 * directed at the body's centre, with one shared, fixed reference radius r0 for every body.
 * Because K_i / M_i = G · r0^(n−2) is the same for every body, the pull of i on j and of j on i
 * are equal and opposite, so a mutually orbiting pair conserves momentum. At r = r0 the law
 * gives the Newtonian acceleration gm / r0²; with n = 2 it is Newtonian at every distance.
 *
 * Potential (zero at infinity, n > 1): Φ = −K / ((n − 1) r^(n−1)), so −∇Φ = −K r̂ / r^n.
 *
 * No softening: radii are collision envelopes only, handled by the simulation's contact code.
 */

import type { GravityLaw } from '../contracts/truth/index.ts';

/** Source coupling K = gm · r0^(n−2), m^(n+1)/s². Exact (no pow) for n = 2 and n = 2.5. */
export function coupling(gm: number, law: GravityLaw): number {
  const n = law.exponent;
  if (n === 2) return gm;
  if (n === 2.5) return gm * Math.sqrt(law.referenceRadius);
  return gm * Math.pow(law.referenceRadius, n - 2);
}

/**
 * 1 / r^(n+1) from r². The acceleration vector is K · (source − x) · inverseDistancePower(r², n).
 *
 * n = 2 and n = 2.5 use only sqrt, multiply and divide, which IEEE-754 rounds exactly, so the
 * gravity arithmetic for this universe is bit-identical on every JavaScript engine (Math.pow is
 * not required to be). Other exponents fall back to Math.pow.
 */
export function inverseDistancePower(r2: number, n: number): number {
  if (n === 2.5) return Math.sqrt(Math.sqrt(r2)) / (r2 * r2); // r^0.5 / r^4 = r^-3.5
  if (n === 2) return 1 / (r2 * Math.sqrt(r2));
  return Math.pow(r2, -0.5 * (n + 1));
}

/** Gravitational acceleration at `(x, y)` from one point source, m/s². */
export function accelerationFrom(
  k: number,
  n: number,
  sourceX: number,
  sourceY: number,
  x: number,
  y: number,
): { x: number; y: number } {
  const dx = sourceX - x;
  const dy = sourceY - y;
  const s = k * inverseDistancePower(dx * dx + dy * dy, n);
  return { x: dx * s, y: dy * s };
}

/** Specific potential of one source at distance r, m²/s² (zero at infinity; needs n > 1). */
export function potentialFrom(k: number, n: number, r: number): number {
  if (n === 2) return -k / r;
  if (n === 2.5) return -k / (1.5 * r * Math.sqrt(r));
  return -k / ((n - 1) * Math.pow(r, n - 1));
}
