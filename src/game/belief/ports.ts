/**
 * BELIEF side (no truth imports). The seams between the game loop and the believed-side
 * services (2C): what the loop needs from the predictive model and from Black Box.
 *
 * - `ModelPort`: `model-bridge.ts` runs the real model (src/model, in its Web Worker) with a
 *   small navigator beside it for the frame-by-frame believed world; `standin-model.ts` alone
 *   is a fast, synchronous stand-in for tests and headless runs.
 * - `BlackBoxPort`: `blackbox.ts`, over src/blackbox's recorder and archive.
 *
 * Everything crossing these interfaces is what the ship sensed, commanded or was briefed with.
 */

import type {
  AttemptId,
  AttemptOutcome,
  AttemptRecord,
  BelievedWorld,
  BlackBoxArchive,
  EncounterBriefing,
  ExecutedCommand,
  ExtensionId,
  Forecast,
  ForecastDraft,
  ForecastId,
  HandsOnInput,
  MassProperties,
  Measurement,
  ModelState,
  Plan,
  Procedure,
  ProcedureId,
  Seconds,
  ShipDefinition,
  ShipEvent,
  ThrustTick,
  Vec3,
} from '../../contracts/index.ts';
import type {
  BurnReport,
  EmpiricalReport,
  ExtensionRecord,
  ModelReport,
} from '../../model/index.ts';

/**
 * The thrust a hands-on input asks of the ship as designed: one entry per thruster that fires,
 * at its point of application, body frame. It uses the nominal design and the mass properties
 * it is given (the believed ones) and nothing else, so it is safe on the believed side. The
 * session supplies it from the ship's own jet allocator (src/ship README § Drawing thrust).
 */
export type HandsOnThrust = (
  input: HandsOnInput,
  massProperties: MassProperties,
) => readonly ThrustTick[];

/**
 * The body rate (rad/s) the ship's flight software turns at for a hands-on yaw and pitch
 * demand, as designed (src/ship `handsOnBodyRate`). Body frame; roll is always zero.
 */
export type HandsOnTurn = (input: Pick<HandsOnInput, 'yaw' | 'pitch'>) => Vec3;

/** A new attempt: at arrival, or after recurrence (P8). */
export interface AttemptStartInfo {
  readonly attemptId: AttemptId;
  /** 1-based count of attempts in this save. */
  readonly index: number;
  readonly briefing: EncounterBriefing;
  readonly ship: ShipDefinition;
  /** Ship mass on arrival from the loading record, kg. */
  readonly arrivalMass?: number;
  /** Wall-clock ISO time, for the record list only. */
  readonly startedAt: string;
  /**
   * Which thrusters a hands-on input fires, as designed. With it the navigator follows RCS
   * translation flown by hand; without it, only the main-engine throttle.
   */
  readonly handsOnThrust?: HandsOnThrust;
  /**
   * The turn a hands-on yaw and pitch demand asks for, as designed. With it the believed
   * attitude follows a stick the moment it moves; without it, from the next gyro reading.
   */
  readonly handsOnTurn?: HandsOnTurn;
}

/** What Black Box recorded for one tick, in acquisition order. */
export interface RecordBatch {
  readonly attemptId: AttemptId;
  /** Start time of the tick: when the measurements were valid and the commands took effect. */
  readonly t: Seconds;
  readonly executed: readonly ExecutedCommand[];
  readonly measurements: readonly Measurement[];
  readonly events: readonly ShipEvent[];
}

export interface ForecastRequest {
  readonly id: ForecastId;
  readonly attemptId: AttemptId;
  /** Sim time of issue; the plan's epoch. */
  readonly issuedAt: Seconds;
  readonly plan: Plan;
  /** Longest look-ahead wanted; the model may end the forecast earlier at its horizon (P10). */
  readonly span: Seconds;
}

/**
 * The predictive model as the loop uses it (A2, P5, P6). It sees only recorded measurements,
 * executed commands and sensed events (P8, 1G), and never plans.
 */
export interface ModelPort {
  /**
   * Arrival or recurrence: the present state returns to the briefing's arrival estimate;
   * everything learned is kept. `record` is the new attempt's (empty) Black Box record.
   */
  beginAttempt(start: AttemptStartInfo, record: AttemptRecord): void;
  /** Records in the order Black Box stored them. Cheap; called once per tick that recorded. */
  ingest(batch: RecordBatch): void;
  /** The attempt ended (loss, Recall, completion): its final record. The model refits. */
  endAttempt(final: AttemptRecord): void;
  /** The believed world extrapolated to `t`. Called every frame and when resolving commands. */
  believedWorld(t: Seconds): BelievedWorld;
  /** The latest model state known on this thread. */
  state(): ModelState;
  /** A forecast of the plan from the present state (a draft; the loop issues and freezes it). */
  forecast(request: ForecastRequest): Promise<ForecastDraft>;
  /** Resolves once everything handed over so far has been taken in. */
  settled(): Promise<void>;
}

/**
 * Rules come only from the player (A4, P5): test an extension against a held-out attempt,
 * adopt one that passed, revoke one. Plus the diagnostics that prompt the question.
 */
export interface RuleControls {
  test(
    extension: ExtensionId,
    training: readonly AttemptId[],
    heldOut: AttemptId,
  ): Promise<ExtensionRecord>;
  adopt(extension: ExtensionId): Promise<ModelState>;
  revoke(extension: ExtensionId): Promise<ModelState>;
  /** Strength against distance, residuals, confounding, coverage (src/model report.ts). */
  report(): Promise<ModelReport>;
  /** Each recorded burn against what the model expected of it, for the given attempts or all. */
  burns(attempts?: readonly AttemptId[]): Promise<BurnReport[]>;
  /** The unexplained acceleration the model has fitted, or null when it has fitted none. */
  empirical(): Promise<EmpiricalReport | null>;
}

/** Black Box (P8): keeps every attempt across recurrence. */
export interface BlackBoxPort {
  /** Start a record; returns it as it stands (empty). */
  beginAttempt(start: AttemptStartInfo, modelVersion: number): AttemptRecord;
  record(batch: RecordBatch): void;
  recordPlan(attemptId: AttemptId, plan: Plan): void;
  recordForecast(attemptId: AttemptId, forecast: Forecast): void;
  /** End the attempt; returns the final, frozen record. */
  endAttempt(
    attemptId: AttemptId,
    outcome: Exclude<AttemptOutcome, { kind: 'in-progress' }>,
    modelVersionAtEnd: number,
  ): AttemptRecord;
  /** A finished attempt's record, or the record so far of the one in progress. */
  attempt(attemptId: AttemptId): AttemptRecord | undefined;
  /**
   * Keep a procedure (P9), replacing one with the same id. It is in `archive().procedures`
   * from now on: in later attempts, and after a reload when Black Box has a store.
   */
  saveProcedure(procedure: Procedure): void;
  /** Forget a saved procedure. Unknown ids are ignored. */
  removeProcedure(id: ProcedureId): void;
  archive(): BlackBoxArchive;
}
