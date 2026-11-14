/**
 * Black Box (section 2C): attempt records, persistence, comparison analytics, procedures.
 * Belief side (P11). See README.md.
 */

export {
  AttemptRecorder,
  START_CURSOR,
  attemptId,
  type AttemptHeader,
  type RecordCursor,
} from './recorder.ts';
export {
  attemptsFor,
  emptyArchive,
  nextAttemptIndex,
  reissue,
  withAdoptedExtensions,
  withAttempt,
  withExtensionDecision,
  withExtensionTest,
  withLead,
  withProcedure,
  withoutProcedure,
} from './archive.ts';
export {
  IndexedDbBlackBoxStore,
  MemoryBlackBoxStore,
  createBlackBoxStore,
  type BlackBoxMeta,
  type BlackBoxStore,
  type StoredBlackBox,
} from './store.ts';
export {
  commandFields,
  compareAttempts,
  configurationTimeline,
  diffCommands,
  forecastDivergence,
  type AttemptComparison,
  type AttemptSide,
  type ConfigurationTimeline,
  type DivergencePoint,
  type ForecastDivergence,
  type ItemDiff,
} from './compare.ts';
export {
  configurationAt,
  matchProcedure,
  procedurePlan,
  saveProcedure,
  type ConditionCheck,
  type ProcedureMatch,
  type SaveProcedureInput,
} from './procedures.ts';
