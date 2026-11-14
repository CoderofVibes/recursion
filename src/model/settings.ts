/**
 * Every [ASSUMED] constant the model uses (1G spec §11.1: they are stored in ModelState.settings).
 * Values follow tools/estimator-ref/assumptions.json where 1G set them; the rest are marked
 * as 2C's own play values. All are tuning values for playtest (2F, 5A).
 */

export interface ModelSettings {
  /** The model's reference length for μ (P4). With n = 2 the value does not matter. m. */
  readonly r0: number;
  /** Integration step of the believed dynamics, s. 1G used 60 s; 30 s keeps close passes accurate. */
  readonly dt: number;
  /** Central finite-difference step, in units of each parameter's scale (§4.3). */
  readonly fdStep: number;
  /** Window rule (§5.1). */
  readonly windowSweep: number;
  readonly windowLnRange: number;
  readonly windowMinFixes: number;
  readonly windowKeepFixes: number;
  /** Profile (§5.4). */
  readonly profileStep: number;
  readonly profileCurvature: number;
  readonly profileRidge: number;
  /** Prior σ of a window's local gravity scale (§5.2). */
  readonly localScalePriorSigma: number;
  /** Present state (§8.1): windows used and prior σ of the local slope. */
  readonly anchorWindows: number;
  readonly anchorSlopePriorSigma: number;
  /** Hedge (§8.2, §7.4) and horizon (§8.4). */
  readonly sigmaH: number;
  readonly sigmaHFloor: number;
  readonly horizonFraction: number;
  /** Held-out test k (§7.2) and the confounding threshold (§9.3). */
  readonly heldOutSigmaK: number;
  readonly confoundedRho: number;
  /** Exclude windows where another body's believed pull exceeds this fraction (§13 item 7). */
  readonly otherBodyPullLimit: number;
  /** Default priors when the briefing gives none (§3.6). */
  readonly priorExponentSigma: number;
  readonly priorThrustScaleSigma: number;
  readonly priorMisalignmentSigma: number;
  readonly priorAccelScaleSigma: number;
  readonly priorCameraBiasSigma: number;
  readonly priorExtraBodyMuSigma: number;
  /** [2C] Prior σ of a secondary body's velocity at an arc epoch, from the briefing, m/s. */
  readonly priorBodyVelocitySigma: number;
  /** [2C] Prior σ of the level of a `limited` burn (contract: a wider prior). */
  readonly limitedBurnLevelSigma: number;
  /** [2C] Accelerometer samples are averaged into bins of this length while thrusting, s. */
  readonly accelBin: number;
  /** [2C] Optical fixes are averaged into normal points over bins of this length, s (0 = off). */
  readonly normalPointInterval: number;
  /** [2C] Accelerometer bias stability floor on a binned sample's σ, m/s² (S04: 3 µg). */
  readonly accelBiasSigma: number;
  /** [2C] Accelerometer samples this close to a burn's start or end are skipped, s (2B reports the previous interval's force). */
  readonly accelEdge: number;
  /** [2C] Thrust segments split at attitude changes above this, rad, and at most this long, s. */
  readonly attitudeSplit: number;
  readonly maxSegment: number;
  /** [2C] Forecast sample spacing and the longest forecast, s. */
  readonly forecastStep: number;
  readonly forecastMaxDuration: number;
  /** [2C] Fixes before and after a burn used for its response (§9.5), s. */
  readonly burnPad: number;
  /** [2C] Standard gravity for propellant flow, m/s². */
  readonly g0: number;
}

export const DEFAULT_SETTINGS: ModelSettings = {
  r0: 1.0e6,
  dt: 30,
  fdStep: 1e-3,
  windowSweep: 0.7,
  windowLnRange: 0.15,
  windowMinFixes: 12,
  windowKeepFixes: 6,
  profileStep: 0.1,
  profileCurvature: 0.01,
  profileRidge: 10,
  localScalePriorSigma: 0.5,
  anchorWindows: 2,
  anchorSlopePriorSigma: 0.2,
  sigmaH: 0.3,
  sigmaHFloor: 0.01,
  horizonFraction: 0.1,
  heldOutSigmaK: 3,
  confoundedRho: 0.9,
  otherBodyPullLimit: 0.2,
  priorExponentSigma: 1,
  priorThrustScaleSigma: 0.05,
  priorMisalignmentSigma: 0.01,
  priorAccelScaleSigma: 1e-3,
  priorCameraBiasSigma: 1e-4,
  priorExtraBodyMuSigma: 1e11,
  priorBodyVelocitySigma: 1,
  limitedBurnLevelSigma: 0.5,
  accelBin: 10,
  normalPointInterval: 60,
  accelBiasSigma: 2.94e-5,
  accelEdge: 1,
  attitudeSplit: 1e-4,
  maxSegment: 10,
  forecastStep: 60,
  forecastMaxDuration: 12 * 3600,
  burnPad: 1200,
  g0: 9.80665,
};

export function resolveSettings(partial?: Partial<ModelSettings>): ModelSettings {
  return { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
}

/** Settings as the plain record stored in ModelState.settings. */
export function settingsRecord(s: ModelSettings): Record<string, number> {
  return { ...s };
}
