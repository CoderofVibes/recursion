/**
 * Black Box records (DECISIONS P8, P9).
 *
 * An attempt runs from arrival until loss, voluntary Recall or completion. Black Box keeps
 * every attempt, saved procedures, adopted model extensions and the chart of leads across
 * recurrence. The model is rebuilt from these records, so it carries over too.
 * Records contain only what the ship sensed or commanded: no truth.
 */

import type { Vec3 } from '../lib/vec3.ts';
import type { ShipEstimate } from './belief.ts';
import type { ExecutedCommand, Plan, Procedure } from './commands.ts';
import type { Forecast } from './forecast.ts';
import type {
  AttemptId,
  ConfigurationId,
  EncounterId,
  ExtensionId,
  LeadId,
  ParameterId,
} from './ids.ts';
import type { EncounterBriefing } from './encounter.ts';
import type { ExtensionState } from './model.ts';
import type { LossCause, Measurement, ShipEvent } from './measurements.ts';
import type { MetersPerSecond, Radians, Seconds } from './units.ts';

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
  /**
   * The briefing this attempt was given. Each run's starting geometry differs (DECISIONS A10),
   * so the model takes arrival states of bodies and asteroids per attempt from here. Absent:
   * the encounter's one briefing applies.
   */
  readonly briefing?: EncounterBriefing;
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
  /**
   * Where it was seen: a bearing taken from an encounter, with how sure the direction is. Its
   * range is not known (that is what makes it a lead). Chart frame (chart.ts).
   */
  readonly bearing?: {
    readonly from: EncounterId;
    readonly direction: Vec3;
    /** Half-angle of the cone the lead lies in. */
    readonly spread: Radians;
  };
}

/**
 * One test of a candidate rule, with its numbers (1G spec §6.1, §7). Black Box keeps every test,
 * passed or not, and never edits one (spec §11.4).
 */
export interface ExtensionTestRecord {
  /** Status after the test, with its held-out `validation` and `validatedSpans`. */
  readonly state: ExtensionState;
  readonly training: readonly AttemptId[];
  readonly heldOut?: AttemptId;
  /** Training evidence: cost drop against the adoption penalty, and whether it beat it (§7.1). */
  readonly evidence?: {
    readonly deltaCost: number;
    readonly penalty: number;
    readonly evidence: boolean;
  };
  readonly identifiable?: { readonly identifiable: boolean; readonly reasons: readonly string[] };
  /** Fitted values of the parameters the extension adds. */
  readonly fitted?: Readonly<
    Record<ParameterId, { readonly value: number; readonly sigma: number }>
  >;
  /** Passed the held-out test with training evidence and identifiable parameters. */
  readonly adoptable: boolean;
}

/** The player adopting or revoking a rule (1G spec §6.1). Kept in order; never edited. */
export interface ExtensionDecision {
  readonly extension: ExtensionId;
  readonly action: 'adopted' | 'revoked';
  /** Model version the decision produced. */
  readonly modelVersion: number;
  /** Wall-clock ISO time, for the record list only. */
  readonly at: string;
}

/** Everything Black Box preserves across recurrence. */
export interface BlackBoxArchive {
  readonly attempts: readonly AttemptRecord[];
  readonly procedures: readonly Procedure[];
  readonly adoptedExtensions: readonly ExtensionId[];
  readonly leads: readonly Lead[];
  /** Every extension test, in the order run. */
  readonly extensionTests?: readonly ExtensionTestRecord[];
  /** Every adopt and revoke, in order; `adoptedExtensions` is the current result. */
  readonly extensionDecisions?: readonly ExtensionDecision[];
}
