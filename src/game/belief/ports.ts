/**
 * BELIEF side (no truth imports). The seams where the predictive model and Black Box (2C) plug
 * into the game loop. Until 2C merges, `standin-model.ts` and `standin-blackbox.ts` implement
 * them; afterwards thin adapters over src/model and src/blackbox do.
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
  Forecast,
  ForecastDraft,
  ForecastId,
  Measurement,
  ModelState,
  Plan,
  Seconds,
  ShipDefinition,
  ShipEvent,
} from '../../contracts/index.ts';

/** A new attempt: at arrival, or after recurrence (P8). */
export interface AttemptStartInfo {
  readonly attemptId: AttemptId;
  /** 1-based count of attempts in this save. */
  readonly index: number;
  readonly briefing: EncounterBriefing;
  readonly ship: ShipDefinition;
  /** Wall-clock ISO time, for the record list only. */
  readonly startedAt: string;
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
 * The predictive model (A2, P5, P6). It sees only recorded measurements, executed commands and
 * sensed events (P8, 1G), and never plans.
 */
export interface ModelPort {
  /**
   * Arrival or recurrence: the present state returns to the briefing's arrival estimate;
   * everything learned is kept.
   */
  beginAttempt(start: AttemptStartInfo): void;
  /** Records in the order Black Box stored them. Cheap; called once per tick that recorded. */
  ingest(batch: RecordBatch): void;
  /** The believed world extrapolated to `t`. Called every frame and when resolving commands. */
  believedWorld(t: Seconds): BelievedWorld;
  state(): ModelState;
  /** A draft forecast of the plan from the present state. May run in a worker. */
  forecast(request: ForecastRequest): Promise<ForecastDraft>;
}

/** Black Box (P8): keeps every attempt across recurrence. */
export interface BlackBoxPort {
  beginAttempt(start: AttemptStartInfo, modelVersion: number): void;
  record(batch: RecordBatch): void;
  recordPlan(attemptId: AttemptId, plan: Plan): void;
  recordForecast(attemptId: AttemptId, forecast: Forecast): void;
  endAttempt(attemptId: AttemptId, outcome: AttemptOutcome, modelVersionAtEnd: number): void;
  attempt(attemptId: AttemptId): AttemptRecord | undefined;
  archive(): BlackBoxArchive;
}
