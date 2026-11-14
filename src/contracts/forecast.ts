/**
 * Forecasts (DECISIONS P6, P10).
 *
 * A forecast is the believed world propagated with the player's plan. Once issued it is
 * immutable: the dotted line shows the forecast as issued, never a silently updated one.
 * Use issueForecast() to turn a draft into a frozen Forecast.
 */

import type { Vec2 } from '../lib/vec2.ts';
import { deepFreeze, type DeepReadonly } from '../lib/freeze.ts';
import type { Plan } from './commands.ts';
import type { Cov2 } from './estimates.ts';
import type { ShipEstimate } from './belief.ts';
import type { AttemptId, ExtensionId, ForecastId, ObjectId, ParameterId } from './ids.ts';
import type { CalibrationProfile } from './model.ts';
import type { MassProperties } from './ship.ts';
import type { Meters, Seconds } from './units.ts';

export interface ForecastSample {
  readonly t: Seconds;
  /** Centre of mass, inertial. */
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly positionCov: Cov2;
  /** True where the model has no supporting data (envelope drawn as extrapolation). */
  readonly extrapolating: boolean;
}

/** Predicted motion of another object (for clearance). */
export interface ForecastObjectTrack {
  readonly id: ObjectId;
  readonly samples: readonly {
    readonly t: Seconds;
    readonly position: Vec2;
    readonly positionCov: Cov2;
  }[];
}

export interface ClosestApproach {
  readonly id: ObjectId;
  readonly t: Seconds;
  /** Predicted hull-to-surface clearance. */
  readonly distance: Meters;
  readonly sigma: Meters;
}

export interface ForecastInputs {
  readonly initial: ShipEstimate;
  readonly massProperties: MassProperties;
  readonly plan: Plan;
  /** Parameter values used (means). */
  readonly parameters: Readonly<Record<ParameterId, number>>;
  readonly extensions: readonly ExtensionId[];
  /** Calibration profiles the forecast used, with their covariances (1G spec §8.6). */
  readonly calibration: readonly CalibrationProfile[];
  /** Measurement noise scale s² applied to the present-state covariance. */
  readonly noiseScale: number;
  /** Hedge σ_h used outside sampled distances (smaller once a rule is validated). */
  readonly hedge: number;
}

export interface ForecastDraft {
  readonly id: ForecastId;
  readonly attemptId: AttemptId;
  /** Sim time of issue. */
  readonly issuedAt: Seconds;
  readonly modelVersion: number;
  readonly inputs: ForecastInputs;
  readonly horizon: Seconds;
  /** Sorted by t. */
  readonly samples: readonly ForecastSample[];
  readonly objects: readonly ForecastObjectTrack[];
  readonly closestApproaches: readonly ClosestApproach[];
}

declare const issuedBrand: unique symbol;

/** An issued, deeply frozen forecast. Only issueForecast() creates one. */
export type Forecast = DeepReadonly<ForecastDraft> & { readonly [issuedBrand]: true };

/** Copy and deep-freeze a draft. Later changes to the draft do not affect the forecast. */
export function issueForecast(draft: ForecastDraft): Forecast {
  return deepFreeze(structuredClone(draft)) as Forecast;
}
