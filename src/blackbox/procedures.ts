/**
 * Saved procedures (DECISIONS P9): a command sequence that worked, saved from an attempt, with
 * the conditions it started from. It replays exactly only when conditions match; otherwise the
 * console says which condition differs and the player adapts it. Passages get faster this way
 * without their rules changing.
 */

import type {
  AttemptRecord,
  ConfigurationId,
  EncounterId,
  Plan,
  PlanId,
  PlanItem,
  Procedure,
  ProcedureCondition,
  ProcedureId,
  ShipEstimate,
} from '../contracts/index.ts';
import { wrapAngle } from '../lib/vec2.ts';
import { configurationTimeline } from './compare.ts';

/** Configuration in force at time t of an attempt (start, then recorded changes). */
export function configurationAt(rec: AttemptRecord, t: number): ConfigurationId {
  let c = rec.start.configuration;
  for (const ch of configurationTimeline(rec).changes) if (ch.t <= t) c = ch.configuration;
  return c;
}

export interface SaveProcedureInput {
  readonly id: ProcedureId;
  readonly name: string;
  readonly record: AttemptRecord;
  /** Start and end of the sequence, sim time in the attempt. */
  readonly from: number;
  readonly to: number;
  /**
   * Believed state at `from` (from the model). Optional when `from` is the attempt's start:
   * the record's arrival estimate is used.
   */
  readonly state?: ShipEstimate;
  readonly tolerance: ProcedureCondition['tolerance'];
}

/**
 * Save the commands that reached the ship between `from` and `to` (excluding rejected ones
 * and protection actions), with times relative to `from`.
 */
export function saveProcedure(input: SaveProcedureInput): Procedure {
  const { record: rec, from, to } = input;
  if (!(to >= from)) throw new Error('procedure: `to` must not precede `from`');
  const state = input.state ?? (from <= rec.start.estimate.t ? rec.start.estimate : undefined);
  if (!state)
    throw new Error(
      'procedure: the believed state at `from` is required unless it starts at arrival',
    );
  const items: PlanItem[] = rec.executed
    .filter((c) => c.t >= from && c.t <= to && c.status !== 'rejected' && c.source !== 'protection')
    .sort((a, b) => a.t - b.t)
    .map((c, k) => ({ id: `${input.id}-${k + 1}`, at: c.t - from, command: c.command }));
  return {
    id: input.id,
    name: input.name,
    origin: { attemptId: rec.id, t: from },
    condition: {
      encounterId: rec.encounterId,
      configuration: configurationAt(rec, from),
      position: state.position,
      velocity: state.velocity,
      positionCov: state.positionCov,
      attitude: state.attitude,
      tolerance: input.tolerance,
    },
    items,
  };
}

export interface ConditionCheck {
  readonly name: 'encounter' | 'configuration' | 'position' | 'velocity' | 'attitude';
  readonly ok: boolean;
  /** The difference found (m, m/s, rad), or the mismatched ids. */
  readonly actual: number | string;
  readonly tolerance: number | null;
}

export interface ProcedureMatch {
  readonly procedure: ProcedureId;
  /** True only when every condition is inside its tolerance: then the procedure replays exactly. */
  readonly matches: boolean;
  readonly checks: readonly ConditionCheck[];
}

/** Do current conditions match the procedure's origin? (P9) */
export function matchProcedure(
  p: Procedure,
  now: {
    readonly encounterId: EncounterId;
    readonly configuration: ConfigurationId;
    readonly estimate: ShipEstimate;
  },
): ProcedureMatch {
  const c = p.condition;
  const tol = c.tolerance;
  const dp = Math.hypot(
    now.estimate.position.x - c.position.x,
    now.estimate.position.y - c.position.y,
  );
  const dv = Math.hypot(
    now.estimate.velocity.x - c.velocity.x,
    now.estimate.velocity.y - c.velocity.y,
  );
  const da = Math.abs(wrapAngle(now.estimate.attitude - c.attitude));
  const checks: ConditionCheck[] = [
    {
      name: 'encounter',
      ok: now.encounterId === c.encounterId,
      actual: `${now.encounterId} vs ${c.encounterId}`,
      tolerance: null,
    },
    {
      name: 'configuration',
      ok: now.configuration === c.configuration,
      actual: `${now.configuration} vs ${c.configuration}`,
      tolerance: null,
    },
    { name: 'position', ok: dp <= tol.position, actual: dp, tolerance: tol.position },
    { name: 'velocity', ok: dv <= tol.velocity, actual: dv, tolerance: tol.velocity },
    { name: 'attitude', ok: da <= tol.attitude, actual: da, tolerance: tol.attitude },
  ];
  return { procedure: p.id, matches: checks.every((q) => q.ok), checks };
}

/** A plan that replays the procedure from `epoch` (the player commits it like any plan). */
export function procedurePlan(p: Procedure, id: PlanId, epoch: number): Plan {
  return {
    id,
    name: p.name,
    epoch,
    items: p.items.map((i) => ({ ...i, id: `${id}-${i.id}` })),
    fromProcedure: p.id,
  };
}
