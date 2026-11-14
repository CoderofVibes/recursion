/**
 * Predictive model state (DECISIONS A2, P5, P6).
 *
 * The model starts from known physics (Newtonian gravity, nominal ship ratings) and refines
 * parameters from measurements the player acquires. Extensions add structure (a different
 * distance law, an unmodelled body...) when enabled; each is fitted from retained data and
 * validated against a held-out attempt. Version increments whenever forecasts would change.
 */

import type { CovarianceMatrix, Gaussian } from './estimates.ts';
import type { AttemptId, BodyId, ExtensionId, ParameterId } from './ids.ts';
import type { Meters, Seconds } from './units.ts';

/** Extensions proposed in DECISIONS P5. 1G may add more; ExtensionId stays a string. */
export const KNOWN_EXTENSIONS = [
  'distance-law',
  'unmodeled-body',
  'thrust-response-region',
  'empirical-acceleration',
] as const;
export type KnownExtension = (typeof KNOWN_EXTENSIONS)[number];

export interface ParameterPrior {
  readonly id: ParameterId;
  /** Short instrument-style label, e.g. "Alpha μ". */
  readonly label: string;
  /** Unit string for display, e.g. "m³/s²". */
  readonly unit: string;
  readonly value: number;
  readonly sigma: number;
  /** Extension that introduces this parameter, if any. */
  readonly extension?: ExtensionId;
}

export interface ParameterEstimate {
  readonly id: ParameterId;
  readonly label: string;
  readonly unit: string;
  readonly value: number;
  readonly sigma: number;
  readonly prior: Gaussian;
  readonly extension?: ExtensionId;
  /**
   * How much of the estimate comes from data rather than the prior:
   * 0 = prior only, 1 = fully determined by measurements.
   */
  readonly support: number;
}

export type ValidationVerdict = 'better' | 'no-better' | 'worse';

/** Result of testing a model version against a held-out attempt's measurements. */
export interface ValidationResult {
  readonly heldOutAttempt: AttemptId;
  readonly modelVersion: number;
  /** RMS position residual (m) without and with the change being tested. */
  readonly rmsBefore: Meters;
  readonly rmsAfter: Meters;
  readonly verdict: ValidationVerdict;
}

export interface ExtensionState {
  readonly id: ExtensionId;
  readonly enabled: boolean;
  /** Model version at which it was last fitted. */
  readonly fittedAt?: number;
  readonly validation?: ValidationResult;
}

/** Where the model has evidence (local confidence). Outside these spans it is extrapolating. */
export interface DataSupport {
  /** Per body: [min, max] distance spans (m) where tracking data exists. */
  readonly distance: Readonly<Record<BodyId, readonly (readonly [Meters, Meters])[]>>;
  /** Time spans (s) of powered flight with accelerometer data. */
  readonly powered: readonly (readonly [Seconds, Seconds])[];
}

export interface ResidualStats {
  /** RMS position residual (m) and sample count, split by flight phase. */
  readonly coast: { readonly rms: Meters; readonly n: number };
  readonly powered: { readonly rms: Meters; readonly n: number };
}

export interface ModelState {
  readonly version: number;
  readonly parameters: readonly ParameterEstimate[];
  readonly covariance: CovarianceMatrix;
  readonly extensions: readonly ExtensionState[];
  readonly support: DataSupport;
  readonly residuals: ResidualStats;
  readonly basedOn: {
    readonly attempts: readonly AttemptId[];
    readonly measurementCount: number;
  };
}
