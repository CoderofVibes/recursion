/**
 * BELIEF side (no truth imports). Black Box for the game loop, over 2C's recorder, archive and
 * store (src/blackbox): one `AttemptRecorder` for the attempt in progress, finished attempts in
 * a `BlackBoxArchive`.
 *
 * With a store, the attempt in progress is saved now and then and again when it ends, so data
 * up to the moment of loss survives a closed tab (2C handoff). An attempt that was still in
 * progress when a save was last written is closed as recalled at its last recorded time.
 */

import {
  AttemptRecorder,
  emptyArchive,
  withAttempt,
  type AttemptHeader,
  type BlackBoxStore,
} from '../../blackbox/index.ts';
import type { AttemptId, AttemptRecord, BlackBoxArchive } from '../../contracts/index.ts';
import type { AttemptStartInfo, BlackBoxPort } from './ports.ts';

export interface BlackBoxOptions {
  /** A restored archive to continue from. */
  readonly archive?: BlackBoxArchive;
  /** Where to save. Absent: memory only. */
  readonly store?: BlackBoxStore;
  /** Real milliseconds between saves of the attempt in progress. Default 30,000. */
  readonly saveInterval?: number;
  readonly clock?: () => number;
}

/** Last time anything was recorded in an attempt. */
function lastTime(record: AttemptRecord): number {
  const last = (items: readonly { readonly t: number }[]): number => items.at(-1)?.t ?? 0;
  return Math.max(last(record.measurements), last(record.executed), last(record.events), 0);
}

export function createBlackBox(options: BlackBoxOptions = {}): BlackBoxPort {
  const { store } = options;
  const clock = options.clock ?? (() => performance.now());
  const saveInterval = options.saveInterval ?? 30_000;
  const save = (record: AttemptRecord): void => {
    void store?.putAttempt(record).catch(() => undefined);
  };

  let archive = options.archive ?? emptyArchive();
  for (const record of archive.attempts) {
    if (record.outcome.kind !== 'in-progress') continue;
    const closed: AttemptRecord = { ...record, outcome: { kind: 'recalled', t: lastTime(record) } };
    archive = withAttempt(archive, closed);
    save(closed);
  }

  let recorder: AttemptRecorder | undefined;
  /** The record in progress, copied at most once per change (snapshots copy every array). */
  let snapshot: AttemptRecord | undefined;
  let lastSave = clock();

  const current = (attemptId: AttemptId): AttemptRecorder => {
    if (!recorder || recorder.id !== attemptId)
      throw new Error(`Black Box: attempt "${attemptId}" is not in progress`);
    snapshot = undefined;
    return recorder;
  };
  const inProgress = (): AttemptRecord | undefined =>
    recorder ? (snapshot ??= recorder.snapshot()) : undefined;

  return {
    beginAttempt(start: AttemptStartInfo, modelVersion: number) {
      if (recorder) throw new Error(`Black Box: attempt "${recorder.id}" is still in progress`);
      const header: AttemptHeader = {
        id: start.attemptId,
        index: start.index,
        encounterId: start.briefing.id,
        startedAt: start.startedAt,
        start: {
          estimate: start.briefing.arrivalEstimate,
          configuration: start.briefing.arrivalConfiguration,
          modelVersion,
        },
      };
      recorder = new AttemptRecorder(header);
      snapshot = undefined;
      lastSave = clock();
      return inProgress()!;
    },
    record(batch) {
      const r = current(batch.attemptId);
      if (batch.executed.length > 0) r.recordExecuted(batch.executed);
      if (batch.measurements.length > 0) r.recordMeasurements(batch.measurements);
      if (batch.events.length > 0) r.recordEvents(batch.events);
      if (store && clock() - lastSave >= saveInterval) {
        lastSave = clock();
        save(inProgress()!);
      }
    },
    recordPlan(attemptId, plan) {
      current(attemptId).recordPlan(plan);
    },
    recordForecast(attemptId, forecast) {
      current(attemptId).recordForecast(forecast);
    },
    endAttempt(attemptId, outcome, modelVersionAtEnd) {
      const final = current(attemptId).end(outcome, modelVersionAtEnd);
      archive = withAttempt(archive, final);
      recorder = undefined;
      save(final);
      return final;
    },
    attempt(attemptId) {
      if (recorder?.id === attemptId) return inProgress();
      return archive.attempts.find((a) => a.id === attemptId);
    },
    archive() {
      const live = inProgress();
      return live ? withAttempt(archive, live) : archive;
    },
  };
}
