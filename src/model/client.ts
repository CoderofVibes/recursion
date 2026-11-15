/**
 * Main-thread handle on the predictive model. Runs the ModelService in a Web Worker when one is
 * available (browser), else in-thread (tests, SSR). Same promises either way. The in-thread
 * service is loaded only when a client falls back to it (S15 rank 5), so the page's own bundle
 * does not carry the model the worker already has.
 *
 *   const model = createModelClient();
 *   await model.init(contextFromBriefing(briefing, shipDefinition));
 *   await model.load({ attempts: archive.attempts, extensions });
 *   const { forecast } = await model.forecast({ id, issuedAt, plan, massProperties });
 *
 * Forecasts come back issued: deep-frozen by issueForecast() and never recomputed (P10).
 */

import {
  issueForecast,
  type AttemptId,
  type AttemptRecord,
  type BelievedField,
  type ExtensionDecision,
  type ExtensionId,
  type Forecast,
  type ForecastDraft,
  type ModelState,
} from '../contracts/index.ts';
import type { ModelContext } from './engine.ts';
import type { ExtensionRecord } from './extensions.ts';
import type { ForecastRequest, ModelForecastDetail } from './forecast.ts';
import type { BurnReport, EmpiricalReport, ModelReport } from './report.ts';
import type { RpcRequest, RpcResponse, ServiceMethod } from './rpc.ts';
import type { AttemptDelta, LoadInput, ModelService } from './service.ts';

export interface ModelClient {
  init(ctx: ModelContext): Promise<ModelState>;
  load(input: LoadInput): Promise<ModelState>;
  beginAttempt(rec: AttemptRecord): Promise<void>;
  append(attemptId: AttemptId, delta: AttemptDelta): Promise<void>;
  refresh(): Promise<ModelState>;
  endAttempt(rec: AttemptRecord): Promise<ModelState>;
  refit(): Promise<ModelState>;
  /** Builds the forecast in the worker and issues it here (frozen, versioned by model version). */
  forecast(
    req: Omit<ForecastRequest, 'record'> & { attemptId?: AttemptId },
  ): Promise<{ forecast: Forecast; detail: ModelForecastDetail }>;
  testExtension(
    ext: ExtensionId,
    training: readonly AttemptId[],
    heldOut: AttemptId,
  ): Promise<ExtensionRecord>;
  /** `at`: wall-clock ISO time for the decision record (default now). */
  adopt(ext: ExtensionId, at?: string): Promise<ModelState>;
  revoke(ext: ExtensionId, at?: string): Promise<ModelState>;
  state(): Promise<ModelState>;
  extensions(): Promise<readonly ExtensionRecord[]>;
  adopted(): Promise<readonly ExtensionId[]>;
  /** Every adopt and revoke, in order (for BlackBoxArchive.extensionDecisions). */
  decisions(): Promise<readonly ExtensionDecision[]>;
  report(): Promise<ModelReport>;
  burns(attempts?: readonly AttemptId[]): Promise<BurnReport[]>;
  empirical(): Promise<EmpiricalReport | null>;
  /**
   * The lattice rebuilt from an attempt's records (A16): believed fields for
   * `BelievedWorld.fields`, each `visual` in 3C's `lattice-observations-v1` display schema.
   */
  lattice(attemptId?: AttemptId, now?: number): Promise<BelievedField[]>;
  /**
   * What the model is doing now (S20): the call running and since when, how many wait behind
   * it, and how many refreshes or refits were superseded while waiting.
   */
  busy(): ModelBusy;
  terminate(): void;
}

export interface ModelBusy {
  readonly running: ServiceMethod | 'init' | null;
  /** `performance.now()` (ms) when the running call started. */
  readonly since: number | null;
  readonly queued: number;
  readonly coalesced: number;
}

/**
 * One call at a time, in the order made (S20: bound redundant work without dropping records).
 * A refresh or refit still waiting, with only appends queued after it, is superseded by a later
 * refresh or refit: that one rebuilds from everything appended, and the earlier caller gets its
 * result. A refit is superseded only by a refit. Nothing else is ever merged, dropped or
 * reordered: appends always run, and no call crosses a forecast, a load or a rule decision.
 * After `terminate`, waiting calls are refused.
 */
function serialize(
  call: Call,
  clock: () => number,
): { call: Call; busy: () => ModelBusy; stop: () => void } {
  interface Job {
    readonly method: ServiceMethod | 'init';
    readonly args: readonly unknown[];
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }
  const waiting: Job[] = [];
  let running: Job | null = null;
  let since: number | null = null;
  let coalesced = 0;
  let stopped = false;
  const pump = () => {
    if (running || stopped) return;
    const job = waiting.shift();
    if (!job) return;
    running = job;
    since = clock();
    // Free the slot before the caller hears back, so `busy()` is right the moment it does.
    const settle = () => {
      running = null;
      since = null;
    };
    call(job.method, job.args).then(
      (v) => {
        settle();
        job.resolve(v);
        pump();
      },
      (e: unknown) => {
        settle();
        job.reject(e);
        pump();
      },
    );
  };
  const enqueue: Call = (method, args) =>
    new Promise((resolve, reject) => {
      if (stopped) {
        reject(new Error('model: terminated'));
        return;
      }
      const job: Job = { method, args, resolve, reject };
      if (method === 'refresh' || method === 'refit') {
        for (let i = waiting.length - 1; i >= 0; i--) {
          const w = waiting[i]!;
          if (w.method === 'append') continue;
          if (w.method === 'refresh' || (w.method === 'refit' && method === 'refit')) {
            waiting.splice(i, 1);
            coalesced++;
            const done = job.resolve;
            const failed = job.reject;
            job.resolve = (v) => {
              w.resolve(v);
              done(v);
            };
            job.reject = (e) => {
              w.reject(e);
              failed(e);
            };
          }
          break;
        }
      }
      waiting.push(job);
      pump();
    });
  return {
    call: enqueue,
    busy: () => ({ running: running?.method ?? null, since, queued: waiting.length, coalesced }),
    stop: () => {
      stopped = true;
      for (const w of waiting.splice(0)) w.reject(new Error('model: terminated'));
    },
  };
}

type Call = (method: ServiceMethod | 'init', args: readonly unknown[]) => Promise<unknown>;

function workerCall(): { call: Call; terminate: () => void } {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let next = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  worker.onmessage = (e: MessageEvent<RpcResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if ('error' in e.data) p.reject(new Error(e.data.error));
    else p.resolve(e.data.result);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'model worker failed'));
    pending.clear();
  };
  return {
    call: (method, args) =>
      new Promise((resolve, reject) => {
        const id = next++;
        pending.set(id, { resolve, reject });
        const msg: RpcRequest = { id, method, args };
        worker.postMessage(msg);
      }),
    terminate: () => worker.terminate(),
  };
}

/**
 * The in-thread fallback. The service and its dispatcher are imported on the first call, and
 * every call runs after the ones issued before it, as the worker's queue does: a call made
 * before `init` has resolved waits for it. Once terminated, nothing more runs.
 */
function localCall(): { call: Call; terminate: () => void } {
  let service: ModelService | null = null;
  let terminated = false;
  const modules = import('./service.ts').then(async (svc) => ({
    ...svc,
    ...(await import('./rpc.ts')),
  }));
  let queue: Promise<unknown> = Promise.resolve();
  return {
    call: (method, args) => {
      // Arguments are copied when the call is made, as posting them to a worker would.
      const input = method === 'init' ? args : args.map((a) => structuredClone(a));
      const job = queue.then(async () => {
        const { ModelService: Service, dispatch } = await modules;
        if (terminated) throw new Error('model: terminated');
        if (method === 'init') {
          service = new Service(input[0] as ModelContext);
          return service.state;
        }
        if (!service) throw new Error('model: init first');
        // Round-trip through structuredClone so in-thread behaves like the worker.
        return structuredClone(dispatch(service, method, input));
      });
      queue = job.catch(() => undefined);
      return job;
    },
    terminate: () => {
      terminated = true;
      service = null;
    },
  };
}

export function createModelClient(opts: { worker?: boolean } = {}): ModelClient {
  const useWorker = (opts.worker ?? true) && typeof Worker !== 'undefined';
  const inner = useWorker ? workerCall() : localCall();
  // Arguments are copied when the call is made, as posting them at once would.
  const queue = serialize(
    (method, args) => inner.call(method, args),
    () => performance.now(),
  );
  const c = <T>(method: ServiceMethod | 'init', ...args: unknown[]) =>
    queue.call(
      method,
      method === 'init' ? args : args.map((a) => structuredClone(a)),
    ) as Promise<T>;
  const terminate = () => {
    queue.stop();
    inner.terminate();
  };
  return {
    init: (ctx) => c('init', ctx),
    load: (input) => c('load', input),
    beginAttempt: (rec) => c('beginAttempt', rec),
    append: (id, delta) => c('append', id, delta),
    refresh: () => c('refresh'),
    endAttempt: (rec) => c('endAttempt', rec),
    refit: () => c('refit'),
    forecast: async (req) => {
      const r = await c<{ draft: ForecastDraft; detail: ModelForecastDetail }>('forecast', req);
      return { forecast: issueForecast(r.draft), detail: r.detail };
    },
    testExtension: (ext, training, heldOut) => c('testExtension', ext, training, heldOut),
    adopt: (ext, at) => c('adopt', ext, at),
    revoke: (ext, at) => c('revoke', ext, at),
    state: () => c('state'),
    extensions: () => c('extensions'),
    adopted: () => c('adopted'),
    decisions: () => c('decisions'),
    report: () => c('report'),
    burns: (attempts) => c('burns', attempts),
    empirical: () => c('empirical'),
    lattice: (attemptId, now) => c('lattice', attemptId, now),
    busy: queue.busy,
    terminate,
  };
}
