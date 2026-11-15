/**
 * Predictive model (section 2C): estimator, extensions, forecast service. Belief side (P11).
 * See README.md for the API the console and game loop call.
 *
 * The page talks to the model through the client, which runs it in a Web Worker. So this entry
 * point exports values only from the light modules (the client, the briefing context, the
 * settings) and everything else as types: importing it does not put the estimator in the page's
 * bundle (S15 rank 5). Code that runs the model in-thread (tests, tools) imports the module it
 * needs directly (`./service.ts`, `./engine.ts`, …).
 */

export { createModelClient, type ModelClient } from './client.ts';
export { contextFor, contextFromBriefing, type ModelContext } from './context.ts';
export { DEFAULT_SETTINGS, resolveSettings, type ModelSettings } from './settings.ts';
export type { AttemptDelta, LoadInput, ModelService } from './service.ts';
export type {
  BuildOptions,
  ModelDerived,
  ModelInput,
  ModelSnapshot,
  PresentState,
} from './engine.ts';
export type { ExtensionRecord, ValidatedHedge } from './extensions.ts';
export type {
  ForecastDetail,
  ForecastRequest,
  ModelForecastDetail,
  ModelSigmaBySource,
} from './forecast.ts';
export type {
  BodyStrength,
  BurnReport,
  DataCoverage,
  EmpiricalReport,
  ModelReport,
  ResidualPoint,
  StrengthPoint,
} from './report.ts';
