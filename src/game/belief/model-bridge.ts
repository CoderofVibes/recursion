/**
 * BELIEF side (no truth imports). The predictive model (2C, src/model) plugged into the loop.
 *
 * The model is a batch estimator behind an asynchronous client (a Web Worker in the browser):
 * it owns the numbers, the calibration, the rules and every forecast. It has no "where is the
 * ship this frame", so a small navigator (`standin-model.ts`) runs beside it on this thread for
 * the believed world the view and command resolution need, in the same believed frame and
 * under the law the model has in force.
 *
 * Hand-over: records are passed to the model in order, about once a second of real time while
 * flying (`append`, then `refresh` for Tier L and the present state), all of them before any
 * forecast, and the final record when an attempt ends (Tier G). Calls are queued so they reach
 * the model in order; a failure is kept in `lastError` and does not stop the loop.
 */

import type {
  AttemptRecord,
  ExecutedCommand,
  ForecastDraft,
  Measurement,
  ModelState,
  ShipEvent,
} from '../../contracts/index.ts';
import {
  contextFromBriefing,
  type ExtensionRecord,
  type ModelClient,
  type ModelSettings,
} from '../../model/index.ts';
import type { AttemptStartInfo, ModelPort, RuleControls } from './ports.ts';
import { createStandInModel } from './standin-model.ts';

export interface ModelBridgeOptions {
  /** Shared reference radius of the believed law (P4). */
  readonly referenceRadius: number;
  /** Real milliseconds between hand-overs while flying. Default 1000. */
  readonly handoverInterval?: number;
  /** Milliseconds clock. Default `performance.now`. */
  readonly clock?: () => number;
  /** Overrides of the model's [ASSUMED] settings (src/model settings.ts). */
  readonly settings?: Partial<ModelSettings>;
  /**
   * A restored save: the model is rebuilt from these records (`load`, P8) before the first
   * attempt. Within a session the model keeps its own copy, so recurrence needs no reload:
   * ending an attempt refits it, and a rebuild from records gives the same state (2C, D7).
   */
  readonly restored?: {
    readonly attempts: readonly AttemptRecord[];
    readonly extensions: readonly ExtensionRecord[];
  };
  /** Called with the full history of rule tests after each test, adoption or revocation. */
  readonly onExtensions?: (extensions: readonly ExtensionRecord[]) => void;
}

export interface ModelBridge extends ModelPort {
  readonly rules: RuleControls;
  /** The last failure of a model call, if any (shown by the bench; cleared by the next success). */
  lastError(): string | undefined;
}

export function createModelBridge(client: ModelClient, options: ModelBridgeOptions): ModelBridge {
  const navigator = createStandInModel({ referenceRadius: options.referenceRadius });
  const clock = options.clock ?? (() => performance.now());
  const interval = options.handoverInterval ?? 1000;

  let state: ModelState | undefined;
  let error: string | undefined;
  let initialised = false;
  let attemptId = '';
  let measurements: Measurement[] = [];
  let executed: ExecutedCommand[] = [];
  let events: ShipEvent[] = [];
  let lastHandover = -Infinity;
  let queue: Promise<void> = Promise.resolve();

  /** Run a model call after everything queued before it; keep the loop alive if it fails. */
  const run = <T>(job: () => Promise<T>): Promise<T> => {
    const result = queue.then(job);
    queue = result.then(
      () => {
        error = undefined;
      },
      (reason: unknown) => {
        error = reason instanceof Error ? reason.message : String(reason);
      },
    );
    return result;
  };
  const take = (next: ModelState): ModelState => {
    state = next;
    navigator.adopt(next);
    return next;
  };

  const changed = async (): Promise<void> => {
    if (options.onExtensions) options.onExtensions(await client.extensions());
  };

  /** Pass what was recorded since the last hand-over, then refresh Tier L and the present state. */
  const handover = (): void => {
    lastHandover = clock();
    if (measurements.length === 0 && executed.length === 0 && events.length === 0) return;
    const delta = { measurements, executed, events };
    const id = attemptId;
    measurements = [];
    executed = [];
    events = [];
    void run(async () => {
      await client.append(id, delta);
      take(await client.refresh());
    }).catch(() => undefined);
  };

  return {
    beginAttempt(start: AttemptStartInfo, record: AttemptRecord) {
      navigator.beginAttempt(start, record);
      attemptId = start.attemptId;
      measurements = [];
      executed = [];
      events = [];
      if (!initialised) {
        initialised = true;
        const context = contextFromBriefing(start.briefing, start.ship, {
          ...(start.arrivalMass !== undefined ? { arrivalMass: start.arrivalMass } : {}),
          ...(options.settings ? { settings: options.settings } : {}),
        });
        const restored = options.restored;
        void run(async () => {
          take(await client.init(context));
          if (restored && restored.attempts.length > 0)
            take(
              await client.load({ attempts: restored.attempts, extensions: restored.extensions }),
            );
        }).catch(() => undefined);
      }
      void run(() => client.beginAttempt(record)).catch(() => undefined);
    },

    ingest(batch) {
      navigator.ingest(batch);
      for (const m of batch.measurements) measurements.push(m);
      for (const e of batch.executed) executed.push(e);
      for (const e of batch.events) events.push(e);
      if (clock() - lastHandover >= interval) handover();
    },

    endAttempt(final) {
      // The final record replaces the model's live copy, so nothing pending needs passing.
      measurements = [];
      executed = [];
      events = [];
      navigator.endAttempt(final);
      void run(async () => take(await client.endAttempt(final))).catch(() => undefined);
    },

    believedWorld(t) {
      return navigator.believedWorld(t);
    },

    state() {
      return state ?? navigator.state();
    },

    forecast(request): Promise<ForecastDraft> {
      handover();
      const massProperties = navigator.believedWorld(request.issuedAt).ship.massProperties;
      return run(async () => {
        const { forecast } = await client.forecast({
          id: request.id,
          attemptId: request.attemptId,
          issuedAt: request.issuedAt,
          plan: request.plan,
          massProperties,
          duration: request.span,
        });
        // Already issued by the client; the loop issues its own frozen copy from this.
        return forecast as unknown as ForecastDraft;
      });
    },

    settled() {
      handover();
      return queue;
    },

    rules: {
      test: (extension, training, heldOut) =>
        run(async () => {
          const record = await client.testExtension(extension, training, heldOut);
          take(await client.state());
          await changed();
          return record;
        }),
      adopt: (extension) =>
        run(async () => {
          const next = take(await client.adopt(extension));
          await changed();
          return next;
        }),
      revoke: (extension) =>
        run(async () => {
          const next = take(await client.revoke(extension));
          await changed();
          return next;
        }),
      report: () => run(() => client.report()),
    },

    lastError: () => error,
  };
}
