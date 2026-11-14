/**
 * Black Box attempt recorder (DECISIONS P8, P12; contracts README § attempt.ts).
 *
 * Appends exactly what the ship sensed or commanded, in acquisition order: the measurement
 * array index is the sequence number the model sorts by. Issued forecasts are kept as issued.
 * Data up to the moment of loss is kept. No truth ever enters a record.
 */

import type {
  AttemptId,
  AttemptOutcome,
  AttemptRecord,
  AttemptStart,
  EncounterId,
  ExecutedCommand,
  Forecast,
  Measurement,
  Plan,
  ShipEvent,
} from '../contracts/index.ts';
import { deepFreeze } from '../lib/freeze.ts';

export interface AttemptHeader {
  readonly id: AttemptId;
  /** 1-based count of attempts in this save. */
  readonly index: number;
  readonly encounterId: EncounterId;
  /** Wall-clock ISO time (for the record list only). */
  readonly startedAt: string;
  readonly start: AttemptStart;
}

/** Positions in the record's arrays, for incremental hand-off to the model (model.append). */
export interface RecordCursor {
  readonly measurements: number;
  readonly executed: number;
  readonly events: number;
  readonly plans: number;
  readonly forecasts: number;
}

export const START_CURSOR: RecordCursor = {
  measurements: 0,
  executed: 0,
  events: 0,
  plans: 0,
  forecasts: 0,
};

export class AttemptRecorder {
  private readonly header: AttemptHeader;
  private readonly m: Measurement[] = [];
  private readonly x: ExecutedCommand[] = [];
  private readonly e: ShipEvent[] = [];
  private readonly p: Plan[] = [];
  private readonly f: Forecast[] = [];
  private outcome: AttemptOutcome = { kind: 'in-progress' };
  private final: AttemptRecord | null = null;
  private modelVersionAtEnd: number;

  constructor(header: AttemptHeader) {
    this.header = header;
    this.modelVersionAtEnd = header.start.modelVersion;
  }

  get id(): AttemptId {
    return this.header.id;
  }

  get ended(): boolean {
    return this.final !== null;
  }

  /** Last recorded time (measurements, commands or events). */
  get lastTime(): number {
    const last = <T extends { t: number }>(a: readonly T[]) =>
      a.length ? a[a.length - 1]!.t : -Infinity;
    return Math.max(last(this.m), last(this.x), last(this.e), 0);
  }

  private open(): void {
    if (this.final) throw new Error(`Black Box: attempt ${this.header.id} has ended`);
  }

  /** Measurements in acquisition order (time, then the order the ship step emitted them). */
  recordMeasurements(ms: readonly Measurement[]): void {
    this.open();
    let last = this.m.length ? this.m[this.m.length - 1]!.t : -Infinity;
    for (const q of ms) {
      if (q.t < last)
        throw new Error(
          `Black Box: measurement at ${q.t} after ${last} (out of acquisition order)`,
        );
      if (q.value.length !== q.sigma.length)
        throw new Error('Black Box: measurement value and sigma lengths differ');
      last = q.t;
    }
    this.m.push(...ms);
  }

  recordExecuted(cs: readonly ExecutedCommand[]): void {
    this.open();
    this.x.push(...cs);
  }

  recordEvents(es: readonly ShipEvent[]): void {
    this.open();
    this.e.push(...es);
  }

  recordPlan(plan: Plan): void {
    this.open();
    this.p.push(plan);
  }

  /** Keep an issued forecast exactly as issued (P10). */
  recordForecast(f: Forecast): void {
    this.open();
    if (!Object.isFrozen(f))
      throw new Error('Black Box: only issued (frozen) forecasts are recorded');
    if (f.attemptId !== this.header.id)
      throw new Error(`Black Box: forecast ${f.id} belongs to ${f.attemptId}`);
    this.f.push(f);
  }

  /** The model version in force, kept up to date while flying. */
  noteModelVersion(v: number): void {
    this.open();
    this.modelVersionAtEnd = v;
  }

  /** The record so far (in progress). A copy: later recording does not change it. */
  snapshot(): AttemptRecord {
    if (this.final) return this.final;
    return {
      ...this.header,
      plans: [...this.p],
      executed: [...this.x],
      forecasts: [...this.f],
      measurements: [...this.m],
      events: [...this.e],
      outcome: this.outcome,
      modelVersionAtEnd: this.modelVersionAtEnd,
    };
  }

  /** What was recorded since `cursor`, and the new cursor (for ModelService.append). */
  since(cursor: RecordCursor): {
    delta: {
      measurements: Measurement[];
      executed: ExecutedCommand[];
      events: ShipEvent[];
      plans: Plan[];
      forecasts: Forecast[];
    };
    cursor: RecordCursor;
  } {
    return {
      delta: {
        measurements: this.m.slice(cursor.measurements),
        executed: this.x.slice(cursor.executed),
        events: this.e.slice(cursor.events),
        plans: this.p.slice(cursor.plans),
        forecasts: this.f.slice(cursor.forecasts),
      },
      cursor: {
        measurements: this.m.length,
        executed: this.x.length,
        events: this.e.length,
        plans: this.p.length,
        forecasts: this.f.length,
      },
    };
  }

  /** End the attempt (loss, recall or completion). The final record is deep-frozen. */
  end(
    outcome: Exclude<AttemptOutcome, { kind: 'in-progress' }>,
    modelVersionAtEnd?: number,
  ): AttemptRecord {
    this.open();
    this.outcome = outcome;
    if (modelVersionAtEnd !== undefined) this.modelVersionAtEnd = modelVersionAtEnd;
    const rec = this.snapshot();
    this.final = deepFreeze(rec) as AttemptRecord;
    return this.final;
  }
}

export const attemptId = (index: number): AttemptId => `attempt-${String(index).padStart(4, '0')}`;
