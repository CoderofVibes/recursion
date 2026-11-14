/**
 * ModelService: the predictive model's live state for one encounter, as the game loop and the
 * console use it. It runs in the model Web Worker (worker.ts) or in-thread (client.ts).
 *
 * - load(): rebuild from Black Box records (recurrence, P8): Tier G + Tier L, new version.
 * - beginAttempt() / append(): the attempt in progress, appended in record order.
 * - refresh(): Tier L and the present state only (cheap, no version change: Tier L is derived).
 * - endAttempt(): the final record replaces the live copy; Tier G runs; new version.
 * - forecast(): a draft for issueForecast() on the caller's side (issued forecasts are frozen).
 * - testExtension() / adopt() / revoke(): rules only from the player (A4, P5).
 *
 * Determinism: every result is a function of the records, the briefing and the extension
 * history, so rebuilding from records equals the live state (spec §11.3).
 */

import type {
  AttemptId,
  AttemptRecord,
  ExecutedCommand,
  ExtensionId,
  Forecast,
  Measurement,
  ModelState,
  Plan,
  ShipEvent,
} from '../contracts/index.ts';
import {
  buildModel,
  modelSpec,
  type ModelContext,
  type ModelSnapshot,
  type TierLCache,
} from './engine.ts';
import {
  adoptExtension,
  extensionStates,
  revokeExtension,
  testExtension,
  validatedHedges,
  type ExtensionRecord,
} from './extensions.ts';
import { buildForecast, type ForecastDetail, type ForecastRequest } from './forecast.ts';
import {
  burnReport,
  empiricalReport,
  modelReport,
  type BurnReport,
  type EmpiricalReport,
  type ModelReport,
} from './report.ts';

export interface AttemptDelta {
  readonly measurements?: readonly Measurement[];
  readonly executed?: readonly ExecutedCommand[];
  readonly events?: readonly ShipEvent[];
  readonly plans?: readonly Plan[];
  readonly forecasts?: readonly Forecast[];
}

export interface LoadInput {
  readonly attempts: readonly AttemptRecord[];
  /** Every rule test (BlackBoxArchive.extensionTests). */
  readonly extensions?: readonly ExtensionRecord[];
  /** Adopted rules (BlackBoxArchive.adoptedExtensions). */
  readonly adopted?: readonly ExtensionId[];
  /** Version of the model before this load (0 for a fresh save). */
  readonly version?: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export class ModelService {
  private readonly ctx: ModelContext;
  private attempts: AttemptRecord[] = [];
  private tests: ExtensionRecord[] = [];
  private adoptedRules: ExtensionId[] = [];
  /** Revoked in this session (BlackBoxArchive keeps only the adopted list). */
  private revokedRules: ExtensionId[] = [];
  private current: Mutable<AttemptRecord> | null = null;
  private snap: ModelSnapshot;
  private version = 0;
  private readonly cache: TierLCache = new Map();

  constructor(ctx: ModelContext) {
    this.ctx = ctx;
    this.snap = this.build(0);
  }

  get state(): ModelState {
    return this.snap.state;
  }

  get snapshot(): ModelSnapshot {
    return this.snap;
  }

  /** Every rule test, in the order run (for BlackBoxArchive.extensionTests). */
  get extensions(): readonly ExtensionRecord[] {
    return this.tests;
  }

  /** Adopted rules (for BlackBoxArchive.adoptedExtensions). */
  get adopted(): readonly ExtensionId[] {
    return this.adoptedRules;
  }

  private allAttempts(): AttemptRecord[] {
    return this.current ? [...this.attempts, this.current] : [...this.attempts];
  }

  private build(version: number, parent?: number, reuse?: ModelSnapshot): ModelSnapshot {
    const spec = modelSpec(this.ctx, this.adoptedRules);
    const validated = validatedHedges(
      this.tests,
      this.adoptedRules,
      spec.bodies,
      spec.settings.validatedRangeSharedLaw === 1,
    );
    return buildModel(
      {
        context: this.ctx,
        attempts: this.allAttempts(),
        adopted: this.adoptedRules,
        extensions: extensionStates(this.tests, this.adoptedRules, this.revokedRules),
        validated,
        version,
        ...(parent !== undefined ? { parent } : {}),
        ...(this.current ? { current: this.current.id } : {}),
      },
      { cache: this.cache, ...(reuse ? { reuse: reuse.derived } : {}) },
    );
  }

  private bump(): ModelState {
    const parent = this.version;
    this.version += 1;
    this.snap = this.build(this.version, parent);
    return this.snap.state;
  }

  /** Rebuild from Black Box records (P8). */
  load(input: LoadInput): ModelState {
    this.attempts = input.attempts
      .filter((a) => a.encounterId === this.ctx.encounterId)
      .map((a) => ({ ...a }));
    this.tests = [...(input.extensions ?? [])];
    this.adoptedRules = [...(input.adopted ?? [])];
    this.revokedRules = [];
    this.current = null;
    this.version = input.version ?? 0;
    return this.bump();
  }

  /** Start recording an attempt in progress (its record's arrays are copied). */
  beginAttempt(rec: AttemptRecord): void {
    if (this.current) throw new Error(`attempt ${this.current.id} is still in progress`);
    this.current = {
      ...rec,
      plans: [...rec.plans],
      executed: [...rec.executed],
      forecasts: [...rec.forecasts],
      measurements: [...rec.measurements],
      events: [...rec.events],
    };
  }

  /** Append data to the attempt in progress, in record order. */
  append(attemptId: AttemptId, delta: AttemptDelta): void {
    const c = this.current;
    if (!c || c.id !== attemptId) throw new Error(`attempt ${attemptId} is not in progress`);
    if (delta.measurements) c.measurements = [...c.measurements, ...delta.measurements];
    if (delta.executed) c.executed = [...c.executed, ...delta.executed];
    if (delta.events) c.events = [...c.events, ...delta.events];
    if (delta.plans) c.plans = [...c.plans, ...delta.plans];
    if (delta.forecasts) c.forecasts = [...c.forecasts, ...delta.forecasts];
  }

  /** Tier L and present state with the current Tier G values (§11.2). Version unchanged. */
  refresh(): ModelState {
    this.snap = this.build(this.version, this.snap.state.parent, this.snap);
    return this.snap.state;
  }

  /** The attempt ended: keep the final record and run Tier G (§11.3). */
  endAttempt(final: AttemptRecord): ModelState {
    if (!this.current || this.current.id !== final.id)
      throw new Error(`attempt ${final.id} is not in progress`);
    this.attempts = [...this.attempts, { ...final }];
    this.current = null;
    return this.bump();
  }

  /** Run Tier G now (in flight at most every so often, §11.2). New version. */
  refit(): ModelState {
    return this.bump();
  }

  /** Forecast for the attempt in progress (or the latest attempt). */
  forecast(req: Omit<ForecastRequest, 'record'> & { attemptId?: AttemptId }): {
    draft: ReturnType<typeof buildForecast>['draft'];
    detail: ForecastDetail;
  } {
    const all = this.allAttempts();
    const rec = req.attemptId
      ? all.find((a) => a.id === req.attemptId)
      : (this.current ?? all[all.length - 1]);
    if (!rec) throw new Error('no attempt to forecast from');
    return buildForecast(this.snap, this.ctx, { ...req, record: rec });
  }

  testExtension(
    ext: ExtensionId,
    training: readonly AttemptId[],
    heldOut: AttemptId,
  ): ExtensionRecord {
    const rec = testExtension(
      this.ctx,
      this.attempts,
      this.adoptedRules,
      ext,
      training,
      heldOut,
      this.version,
    );
    this.tests = [...this.tests, rec];
    this.snap = this.build(this.version, this.snap.state.parent, this.snap);
    return rec;
  }

  /** The player adopts a rule that passed its held-out test. New version. */
  adopt(ext: ExtensionId): ModelState {
    this.adoptedRules = adoptExtension(this.tests, this.adoptedRules, ext);
    this.revokedRules = this.revokedRules.filter((e) => e !== ext);
    return this.bump();
  }

  /** The player revokes an adopted rule. New version. */
  revoke(ext: ExtensionId): ModelState {
    this.adoptedRules = revokeExtension(this.adoptedRules, ext);
    this.revokedRules = [...this.revokedRules, ext];
    return this.bump();
  }

  report(): ModelReport {
    return modelReport(this.snap);
  }

  burns(attempts?: readonly AttemptId[]): BurnReport[] {
    return burnReport(this.snap, this.ctx, attempts);
  }

  empirical(): EmpiricalReport | null {
    return empiricalReport(this.snap, this.ctx);
  }
}
