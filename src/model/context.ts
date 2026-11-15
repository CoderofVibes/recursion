/**
 * The model's context from the briefing (`ModelContext`), kept apart from the estimator so the
 * page can build one without loading the model (the model runs in its worker; S15 rank 5).
 */

import type {
  AttemptRecord,
  BelievedAsteroid,
  BelievedBody,
  EncounterBriefing,
  EncounterId,
  ParameterPrior,
  ShipDefinition,
  ShipEstimate,
} from '../contracts/index.ts';
import type { ModelSettings } from './settings.ts';

export interface ModelContext {
  readonly encounterId: EncounterId;
  /** Arrival priors (briefing). `body.<id>.mu` priors define the modelled bodies. */
  readonly priors: readonly ParameterPrior[];
  /** Bodies known on arrival, as believed at t = 0 (briefing). */
  readonly bodies: readonly BelievedBody[];
  /** Asteroids known on arrival (briefing): their radii set forecast clearances. */
  readonly asteroids?: readonly BelievedAsteroid[];
  readonly ship: ShipDefinition;
  /** Navigation estimate on arrival (briefing). */
  readonly arrival: ShipEstimate;
  /** Ship mass on arrival, kg (default: dry plus full tanks). */
  readonly arrivalMass?: number;
  /** Bodies are held fixed instead of attracting each other (mock worlds only). */
  readonly fixedBodies?: boolean;
  readonly settings?: Partial<ModelSettings>;
}

export function contextFromBriefing(
  briefing: EncounterBriefing,
  ship: ShipDefinition,
  opts: { arrivalMass?: number; fixedBodies?: boolean; settings?: Partial<ModelSettings> } = {},
): ModelContext {
  return {
    encounterId: briefing.id,
    priors: briefing.priors,
    bodies: briefing.knownBodies,
    asteroids: briefing.knownAsteroids,
    ship,
    arrival: briefing.arrivalEstimate,
    ...opts,
  };
}

/**
 * The geometry an attempt was given (DECISIONS A10: each run starts from different geometry):
 * the bodies' and asteroids' arrival states and the arrival estimate from the attempt's own
 * briefing when recorded (`AttemptStart.briefing`), else the encounter's. Priors, masses and
 * the ship never vary with it.
 */
export function contextFor(ctx: ModelContext, rec?: Pick<AttemptRecord, 'start'>): ModelContext {
  const b = rec?.start.briefing;
  if (!b) return ctx;
  return { ...ctx, bodies: b.knownBodies, asteroids: b.knownAsteroids, arrival: b.arrivalEstimate };
}
