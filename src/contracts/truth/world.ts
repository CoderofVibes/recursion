/**
 * TRUTH. The physical world as it really is. Only the simulation (src/sim), ship systems
 * (src/ship), content (src/content) and the game layer (src/game) may import this.
 * Belief-side code (model, Black Box, console, 3D view) is lint-blocked from it (P11).
 */

import type { Vec2 } from '../../lib/vec2.ts';
import type { AsteroidId, BodyId, ParameterId } from '../ids.ts';
import type { Meters, Seconds } from '../units.ts';
import type { FieldInstanceSpec } from './fields.ts';
import type { ShipTruth } from './ship.ts';

/**
 * Gravity law (DECISIONS P4, as clarified by 1B): each body pulls everything toward its centre
 *
 *   a = (gm / r0²) · (r0 / r)^n  =  K / r^n,   K = gm · r0^(n−2)  [m^(n+1)·s⁻²]
 *
 * with one shared, fixed reference radius r0 for every body, so forces between bodies stay
 * equal and opposite. This universe uses n = 2.5 (brief §5). With n = 2 the law is Newtonian
 * for any r0. Bodies are point sources; radius is only a collision envelope.
 */
export interface GravityLaw {
  readonly exponent: number;
  /** Shared reference radius r0, where the law matches Newtonian gravity. Never per body. */
  readonly referenceRadius: Meters;
}

export interface MassiveBody {
  readonly id: BodyId;
  readonly name: string;
  /** Newtonian-equivalent GM at the shared reference radius, m³/s². */
  readonly gm: number;
  /** Collision envelope (not part of the gravity law). */
  readonly radius: Meters;
  readonly position: Vec2;
  readonly velocity: Vec2;
  /** Fixed bodies do not move; others move under the same law. */
  readonly fixed: boolean;
}

/** Massless test particle under the same law (attracts nothing). */
export interface Asteroid {
  readonly id: AsteroidId;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly radius: Meters;
}

/**
 * True values of quantities the model estimates that are not part of the world's physics,
 * keyed by the same parameter IDs the model uses (e.g. "thruster.main-engine.scale").
 */
export type HiddenParameters = Readonly<Record<ParameterId, number>>;

export interface TruthWorld {
  readonly t: Seconds;
  readonly law: GravityLaw;
  readonly bodies: readonly MassiveBody[];
  readonly asteroids: readonly Asteroid[];
  readonly ship: ShipTruth;
  readonly fields: readonly FieldInstanceSpec[];
  readonly hidden: HiddenParameters;
}
