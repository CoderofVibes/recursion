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
import type { Meters, MetersPerSecond, Seconds } from './units.ts';

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
  /**
   * Ship calibrations only (1G spec §3.7): set on the value used in one arc (arrival value plus
   * that attempt's deviation). Absent for the arrival value and for world parameters.
   */
  readonly arc?: AttemptId;
  /** Ship calibrations only: how much of sigma is fresh and how much has aged (spec §9.7). */
  readonly freshness?: CalibrationFreshness;
}

/**
 * Calibration freshness (1G spec §3.7, §9.7, DECISIONS A5). sigma² = sigmaMeasured² + sigmaAged².
 * Ship calibrations loosen with ship time, use and damage until re-measured.
 */
export interface CalibrationFreshness {
  /** Sigma as last measured. */
  readonly sigmaMeasured: number;
  /** Sigma added by aging since then (quadrature). */
  readonly sigmaAged: number;
  /** Ship time of the last measurement that constrained it; absent if never measured. */
  readonly lastMeasured?: { readonly attempt: AttemptId; readonly t: Seconds };
  /** What aged it since, in plain units. */
  readonly since: {
    readonly shipTime: Seconds;
    /** Commanded Δv, m/s. */
    readonly deltaV: MetersPerSecond;
    /** Camera power-on transitions. */
    readonly powerCycles: number;
    /** Sum of drops in reported condition (0 to 1 scale). */
    readonly conditionLost: number;
  };
}

export type ValidationVerdict = 'better' | 'no-better' | 'worse';

/** Result of testing a model version against a held-out attempt's measurements. */
export interface ValidationResult {
  readonly heldOutAttempt: AttemptId;
  readonly modelVersion: number;
  /** Held-out consistency statistic T/ν (1G spec §7.2): about 1 when the rule holds. */
  readonly statistic: number;
  /** Pass when statistic ≤ threshold (1G: about 1.2, set by a 3σ rule). */
  readonly threshold: number;
  /** RMS position residual (m) without and with the change being tested. */
  readonly rmsBefore: Meters;
  readonly rmsAfter: Meters;
  readonly verdict: ValidationVerdict;
}

/**
 * candidate: proposed or being fitted, not used by forecasts; adopted: in the model;
 * rejected: failed its held-out test; revoked: adopted earlier, withdrawn by the player.
 */
export type ExtensionStatus = 'candidate' | 'adopted' | 'rejected' | 'revoked';

/**
 * Distances one passing held-out test covered around one body (1G spec §7.4). The earned hedge
 * applies only inside them. Which bodies a span applies to: DECISIONS A5.
 */
export interface ValidatedSpan {
  /** The body the test's fixes were taken around. */
  readonly body: BodyId;
  readonly rMin: Meters;
  readonly rMax: Meters;
  /** Earned hedge σ_e from the test. */
  readonly sigmaE: number;
  readonly heldOutAttempt: AttemptId;
}

export interface ExtensionState {
  readonly id: ExtensionId;
  readonly status: ExtensionStatus;
  /** Model version at which it was last fitted. */
  readonly fittedAt?: number;
  readonly validation?: ValidationResult;
  /** One per body per passing test; kept when a later test adds new distances (spec §7.4). */
  readonly validatedSpans?: readonly ValidatedSpan[];
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

/** One local fit (1G spec §5.2): gravity scale measured over one window of coasting data. */
export interface CalibrationWindow {
  readonly start: Seconds;
  readonly end: Seconds;
  /** Representative distance from the body over the window (geometric mean), m. */
  readonly distance: Meters;
  /** Measured gravity relative to the reference law (1 = the law is right here). */
  readonly scale: number;
  readonly sigma: number;
}

/**
 * Per-body gravity calibration (1G spec §5.4, DECISIONS A4): numbers at distances the ship has
 * sampled, never a rule. Outside [first node, last node] it holds its edge value and the
 * forecast widens (hedge) and then ends (horizon). Derived from records; cached, not versioned.
 */
export interface CalibrationProfile {
  readonly body: BodyId;
  /** Node distances, ascending, m. */
  readonly distances: readonly Meters[];
  /** Gravity scale at each node. */
  readonly scale: readonly number[];
  /** Node covariance, row-major n×n, inflation included. */
  readonly covariance: readonly number[];
  /** ≈1 when distance alone explains the local fits; ≫1 when direction matters too (§5.4). */
  readonly inflation: number;
  /** The local fits behind it: the "fitted strength against distance" diagnostic (§9.2). */
  readonly windows: readonly CalibrationWindow[];
}

/** Outcome of the latest global fit (1G spec §4.6). */
export interface FitSummary {
  readonly chi2: number;
  readonly nu: number;
  /** Effective number of parameters. */
  readonly pEff: number;
  readonly iterations: number;
  readonly converged: boolean;
}

export interface ModelState {
  readonly version: number;
  /** Version this one was derived from. */
  readonly parent?: number;
  readonly parameters: readonly ParameterEstimate[];
  readonly covariance: CovarianceMatrix;
  readonly extensions: readonly ExtensionState[];
  readonly support: DataSupport;
  readonly residuals: ResidualStats;
  readonly basedOn: {
    readonly attempts: readonly AttemptId[];
    readonly measurementCount: number;
  };
  /** Hash of the sorted record IDs the fit used (1G spec §11.1). */
  readonly dataManifest?: string;
  /** Absent before the first global fit. */
  readonly fit?: FitSummary;
  /** Per-body calibration under this version's reference law (derived, cached). */
  readonly calibration: readonly CalibrationProfile[];
  /**
   * Noise scale s² from the local fits (1G spec §5.3; derived): about 1 when measurements'
   * reported sigmas are right, above 1 when the data are noisier than reported. The hedge is
   * not here: the default is in `settings`, earned values are per rule in `validatedSpans`.
   */
  readonly noiseScale?: number;
  /** Every [ASSUMED] constant the model build uses, by name (1G spec §11.1). */
  readonly settings?: Readonly<Record<string, number>>;
}
