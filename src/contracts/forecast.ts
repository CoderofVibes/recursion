/**
 * Forecasts (DECISIONS P6, P10).
 *
 * A forecast is the believed world propagated with the player's plan. Once issued it is
 * immutable: the dotted line shows the forecast as issued, never a silently updated one.
 * Use issueForecast() to turn a draft into a frozen Forecast.
 */

import type { Vec3 } from '../lib/vec3.ts';
import { deepFreeze, type DeepReadonly } from '../lib/freeze.ts';
import type { Plan } from './commands.ts';
import type { Cov3, CovarianceMatrix } from './estimates.ts';
import type { ShipEstimate } from './belief.ts';
import type { AttemptId, BodyId, ExtensionId, ForecastId, ObjectId, ParameterId } from './ids.ts';
import type { CalibrationProfile } from './model.ts';
import type { MassProperties } from './ship.ts';
import type { Meters, Seconds } from './units.ts';

export interface ForecastSample {
  readonly t: Seconds;
  /** Centre of mass, inertial. */
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** 3D position uncertainty (the envelope is an ellipsoid; `covEllipsoid`). */
  readonly positionCov: Cov3;
  /** True where the model has no supporting data (envelope drawn as extrapolation). */
  readonly extrapolating: boolean;
  /**
   * True where extrapolating but inside an adopted rule's validated span, so the smaller earned
   * hedge applied (1G spec §7.4, DECISIONS A5). Absent or false: sampled, or untested.
   */
  readonly validated?: boolean;
}

/** Earned hedge applied around one body (1G spec §7.4, §8.2). */
export interface EarnedHedge {
  /** σ_e: the largest earned sigma among the rules' passing tests. */
  readonly sigma: number;
  /** Distance spans (m) where σ_e replaced the default hedge. */
  readonly spans: readonly (readonly [Meters, Meters])[];
}

/** Predicted motion of another object (for clearance). */
export interface ForecastObjectTrack {
  readonly id: ObjectId;
  readonly samples: readonly {
    readonly t: Seconds;
    readonly position: Vec3;
    readonly positionCov: Cov3;
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
  /**
   * Default hedge σ_h0 (1G spec §8.2): applied outside sampled distances wherever no validated
   * span applies. It does not shrink when a rule is validated; `earnedHedge` covers that.
   */
  readonly hedge: number;
  /** Per body, where a validated rule's earned hedge applied instead (A5). Absent: none applied. */
  readonly earnedHedge?: Readonly<Record<BodyId, EarnedHedge>>;
  /**
   * Engine terms planned burns used: the current arc's values and covariance, including aging
   * since their last measurement (1G spec §3.7, §8.6). The model records it; stand-ins may omit.
   */
  readonly engine?: {
    readonly values: Readonly<Record<ParameterId, number>>;
    readonly covariance: CovarianceMatrix;
  };
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
