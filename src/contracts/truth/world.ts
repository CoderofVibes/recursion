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
 * Gravity law: each body accelerates everything toward it with a = coupling / r^exponent.
 * This universe uses exponent 2.5 (brief §5). Body couplings then have units m^(n+1)·s⁻².
 * The normalization used to choose couplings (DECISIONS P4) is the physics package's (1B).
 */
export interface GravityLaw {
  readonly exponent: number;
}

export interface MassiveBody {
  readonly id: BodyId;
  readonly name: string;
  /** k in a = k / r^n, m^(n+1)·s⁻². */
  readonly coupling: number;
  readonly radius: Meters;
  readonly position: Vec2;
  readonly velocity: Vec2;
  /** Fixed bodies do not move; others move under the same law. */
  readonly fixed: boolean;
}

/** Test particle under the same law (does not attract anything). */
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
