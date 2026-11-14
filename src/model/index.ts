/**
 * Predictive model (section 2C): estimator, extensions, forecast service. Belief side (P11).
 * See README.md for the API the console and game loop call.
 */

export { createModelClient, type ModelClient } from './client.ts';
export { ModelService, type AttemptDelta, type LoadInput } from './service.ts';
export {
  buildModel,
  carriedCalibration,
  contextFromBriefing,
  modelSpec,
  presentState,
  EXPONENT_ID,
  muId,
  misalignId,
  scaleId,
  type BuildOptions,
  type ModelContext,
  type ModelDerived,
  type ModelInput,
  type ModelSnapshot,
  type PresentState,
} from './engine.ts';
export {
  adoptExtension,
  adoptedOf,
  extensionStates,
  hedgeOf,
  isTestableExtension,
  revokeExtension,
  testExtension,
  type ExtensionRecord,
} from './extensions.ts';
export { buildForecast, plannedBurns, type ForecastDetail, type ForecastRequest } from './forecast.ts';
export {
  burnReport,
  empiricalReport,
  modelReport,
  type BodyStrength,
  type BurnReport,
  type DataCoverage,
  type EmpiricalReport,
  type ModelReport,
  type ResidualPoint,
  type StrengthPoint,
} from './report.ts';
export { DEFAULT_SETTINGS, resolveSettings, type ModelSettings } from './settings.ts';
