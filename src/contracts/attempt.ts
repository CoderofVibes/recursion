/**
 * Black Box records (DECISIONS P8, P9).
 *
 * An attempt runs from arrival until loss, voluntary Recall or completion. Black Box keeps
 * every attempt, saved procedures, adopted model extensions and the chart of leads across
 * recurrence. The model is rebuilt from these records, so it carries over too.
 * Records contain only what the ship sensed or commanded: no truth.
 */

import type { ShipEstimate } from './belief.ts';
import type { ExecutedCommand, Plan, Procedure } from './commands.ts';
import type { Forecast } from './forecast.ts';
import type { AttemptId, ConfigurationId, EncounterId, ExtensionId, LeadId } from './ids.ts';
import type { LossCause, Measurement, ShipEvent } from './measurements.ts';
import type { MetersPerSecond, Seconds } from './units.ts';

export type AttemptOutcome =
  | { readonly kind: 'in-progress' }
  | { readonly kind: 'lost'; readonly t: Seconds; readonly cause: LossCause }
  | { readonly kind: 'recalled'; readonly t: Seconds }
  | { readonly kind: 'completed'; readonly t: Seconds; readonly objective: string };

/**
 * What happened to the ship between encounters (1G spec §3.7 item 3): the ship time, use and
 * damage that age its calibrations from the carrying attempt's end to this arrival. Written by
 * the expedition layer (3D). Every attempt of one encounter repeats the same transit (P8).
 */
export interface TransitRecord {
  /** The completed attempt that carried the ship onward. */
  readonly from: AttemptId;
  readonly shipTime: Seconds;
  /** Commanded Δv in transit, m/s. */
  readonly deltaV: MetersPerSecond;
  /** Camera power-on transitions in transit. */
  readonly powerCycles: number;
  /** Condition changes in transit, as Black Box would have recorded them. */
  readonly conditionChanges: readonly Extract<ShipEvent, { kind: 'condition-changed' }>[];
}

export interface AttemptStart {
  /** Navigation estimate at arrival. */
  readonly estimate: ShipEstimate;
  readonly configuration: ConfigurationId;
  readonly modelVersion: number;
  /** Absent for the first encounter of a run. */
  readonly transit?: TransitRecord;
}

export interface AttemptRecord {
  readonly id: AttemptId;
  /** 1-based count of attempts in this save. */
  readonly index: number;
  readonly encounterId: EncounterId;
  /** Wall-clock ISO time the attempt began (for the record list only). */
  readonly startedAt: string;
  readonly start: AttemptStart;
  /** Plans committed during the attempt, in order. */
  readonly plans: readonly Plan[];
  /** Commands as they actually reached the ship. */
  readonly executed: readonly ExecutedCommand[];
  /** Forecasts issued during the attempt, as issued. */
  readonly forecasts: readonly Forecast[];
  /** Sorted by t. */
  readonly measurements: readonly Measurement[];
  readonly events: readonly ShipEvent[];
  readonly outcome: AttemptOutcome;
  readonly modelVersionAtEnd: number;
}

export type LeadStatus = 'noticed' | 'investigating' | 'answered' | 'dead-end';

/** A "glimmer" worth investigating, on the chart of leads. */
export interface Lead {
  readonly id: LeadId;
  readonly name: string;
  readonly firstSeen: { readonly attemptId: AttemptId; readonly t: Seconds };
  readonly status: LeadStatus;
}

/** Everything Black Box preserves across recurrence. */
export interface BlackBoxArchive {
  readonly attempts: readonly AttemptRecord[];
  readonly procedures: readonly Procedure[];
  readonly adoptedExtensions: readonly ExtensionId[];
  readonly leads: readonly Lead[];
}
