/**
 * Forecasts (DECISIONS P6, P10).
 *
 * A forecast is the believed world propagated with the player's plan. Once issued it is
 * immutable: the dotted line shows the forecast as issued, never a silently updated one.
 * Use issueForecast() to turn a draft into a frozen Forecast.
 */

import type { Quat } from '../lib/quat.ts';
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
  /**
   * Camera-to-star-tracker misalignment the present state used: values and covariance,
   * including aging (spec revision 3 §8.1). The model records it; stand-ins may omit.
   */
  readonly camera?: {
    readonly values: Readonly<Record<ParameterId, number>>;
    readonly covariance: CovarianceMatrix;
  };
  /**
   * The full attitude each planned burn was forecast with, resolved from its attitude target
   * with roll held (`quat.pointAlong`), so the record shows what the ship was expected to do.
   */
  readonly plannedAttitudes?: readonly { readonly t: Seconds; readonly attitude: Quat }[];
}

/** One-sigma size of each uncertainty source at one forecast sample: its longest axis, m. */
export interface ForecastSigmaBySource {
  readonly t: Seconds;
  /** The present state (tracking). */
  readonly state: Meters;
  /** The calibration profile (measured gravity strength at sampled distances). */
  readonly profile: Meters;
  /** The hedge outside sampled distances (default, or earned inside validated spans). */
  readonly hedge: Meters;
  /** Engine calibration, for planned burns. */
  readonly engine: Meters;
  readonly mass: Meters;
  readonly total: Meters;
}

/** How a tracked asteroid entered the forecast (spec §10). */
export interface AsteroidForecastNote {
  readonly id: ObjectId;
  /** False when its track was too short to forecast; it is then absent from `objects`. */
  readonly forecast: boolean;
  /** Time of its last fix used, and how many normal points its present state came from. */
  readonly tLast?: Seconds;
  readonly fixes?: number;
}

/**
 * What the envelope is made of (spec §8.2–8.3, §9): for the console's forecast detail. Kept with
 * the forecast, so a debrief can say why an old forecast was as wide as it was.
 */
export interface ForecastDetail {
  /** Per sample, in the order of `samples`. */
  readonly sigmaMajor: readonly ForecastSigmaBySource[];
  /** How the present state was obtained (for example `window`, `arrival`, `plan`). */
  readonly presentSource: string;
  readonly presentTime: Seconds;
  /** Tracked asteroids: which were forecast and which had too short a track. */
  readonly asteroids: readonly AsteroidForecastNote[];
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
  /** What the envelope is made of. The model supplies it; stand-ins may omit. */
  readonly detail?: ForecastDetail;
}

declare const issuedBrand: unique symbol;

/** An issued, deeply frozen forecast. Only issueForecast() creates one. */
export type Forecast = DeepReadonly<ForecastDraft> & { readonly [issuedBrand]: true };

/** Copy and deep-freeze a draft. Later changes to the draft do not affect the forecast. */
export function issueForecast(draft: ForecastDraft): Forecast {
  return deepFreeze(structuredClone(draft)) as Forecast;
}
