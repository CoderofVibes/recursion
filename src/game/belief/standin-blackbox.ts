/**
 * BELIEF side (no truth imports). STAND-IN for Black Box until 2C merges: attempt records kept
 * in memory in the contract's shape (src/contracts/attempt.ts). No persistence, no analytics.
 *
 * Measurements are appended in acquisition order (time, then the order the ship step emitted
 * them), which is the canonical order the model relies on (contracts README, 1G spec §11.3).
 */

import type {
  AttemptId,
  AttemptOutcome,
  AttemptRecord,
  BlackBoxArchive,
  ExecutedCommand,
  Forecast,
  Measurement,
  Plan,
  ShipEvent,
} from '../../contracts/index.ts';
import type { AttemptStartInfo, BlackBoxPort, RecordBatch } from './ports.ts';

interface Draft {
  readonly head: Omit<
    AttemptRecord,
    'plans' | 'executed' | 'forecasts' | 'measurements' | 'events' | 'outcome' | 'modelVersionAtEnd'
  >;
  readonly plans: Plan[];
  readonly executed: ExecutedCommand[];
  readonly forecasts: Forecast[];
  readonly measurements: Measurement[];
  readonly events: ShipEvent[];
  outcome: AttemptOutcome;
  modelVersionAtEnd: number;
}

export function createStandInBlackBox(): BlackBoxPort {
  const drafts = new Map<AttemptId, Draft>();
  const order: AttemptId[] = [];

  const draft = (id: AttemptId): Draft => {
    const found = drafts.get(id);
    if (!found) throw new Error(`Black Box has no attempt "${id}"`);
    return found;
  };
  const record = (d: Draft): AttemptRecord => ({
    ...d.head,
    plans: d.plans,
    executed: d.executed,
    forecasts: d.forecasts,
    measurements: d.measurements,
    events: d.events,
    outcome: d.outcome,
    modelVersionAtEnd: d.modelVersionAtEnd,
  });

  return {
    beginAttempt(start: AttemptStartInfo, modelVersion: number) {
      drafts.set(start.attemptId, {
        head: {
          id: start.attemptId,
          index: start.index,
          encounterId: start.briefing.id,
          startedAt: start.startedAt,
          start: {
            estimate: start.briefing.arrivalEstimate,
            configuration: start.briefing.arrivalConfiguration,
            modelVersion,
          },
        },
        plans: [],
        executed: [],
        forecasts: [],
        measurements: [],
        events: [],
        outcome: { kind: 'in-progress' },
        modelVersionAtEnd: modelVersion,
      });
      order.push(start.attemptId);
    },
    record(batch: RecordBatch) {
      const d = draft(batch.attemptId);
      for (const e of batch.executed) d.executed.push(e);
      for (const m of batch.measurements) d.measurements.push(m);
      for (const e of batch.events) d.events.push(e);
    },
    recordPlan(attemptId, plan) {
      draft(attemptId).plans.push(plan);
    },
    recordForecast(attemptId, forecast) {
      draft(attemptId).forecasts.push(forecast);
    },
    endAttempt(attemptId, outcome, modelVersionAtEnd) {
      const d = draft(attemptId);
      d.outcome = outcome;
      d.modelVersionAtEnd = modelVersionAtEnd;
    },
    attempt(attemptId) {
      const d = drafts.get(attemptId);
      return d ? record(d) : undefined;
    },
    archive(): BlackBoxArchive {
      return {
        attempts: order.map((id) => record(draft(id))),
        procedures: [],
        adoptedExtensions: [],
        leads: [],
      };
    },
  };
}
