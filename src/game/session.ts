/**
 * The game session: the core loop and recurrence v0 (2F). The only object that holds both the
 * true world and the believed side (P11). It runs truth ticks, hands what the ship sensed to
 * the model and Black Box, and gives the console and 3D view a belief-only interface
 * (`GameControls`).
 *
 * Loop: prepare (safe, paused) → commit plan (forecast issued and frozen) → operate (time
 * warp) → observe → compare → revise → try again. Warp changes how many ticks run per frame,
 * never the step size.
 *
 * Recurrence v0 (P8): loss, completion or a voluntary Recall ends the attempt; the next one
 * starts from exactly `EncounterDefinition.world` (ship, bodies, asteroids, noise streams),
 * while Black Box and the model keep everything.
 */

import type {
  AttemptId,
  AttemptOutcome,
  AttemptOverlay,
  Command,
  CommandSource,
  ExecutedCommand,
  Forecast,
  ForecastDraft,
  Plan,
  PlanId,
  PlanItemId,
  Selection,
  ShipEvent,
  TrailPoint,
  ViewSnapshot,
} from '../contracts/index.ts';
import { issueForecast } from '../contracts/index.ts';
import type { GameControls, Phase, PlanDraft, SessionStatus } from './belief/controls.ts';
import type {
  AttemptStartInfo,
  BlackBoxPort,
  ModelPort,
  RecordBatch,
  RuleControls,
} from './belief/ports.ts';
import { navigationView, resolveCommand } from './belief/resolve.ts';
import { createTelemetryFilter } from './belief/telemetry.ts';
import {
  applyCommanded,
  buildViewSnapshot,
  initialCommandedState,
  type CommandedState,
} from './belief/view.ts';
import type { EncounterSetup } from './encounter.ts';
import {
  createTruthStepper,
  type DueCommand,
  type GameTruthState,
  type TickResult,
} from './truth-step.ts';

export interface SessionOptions {
  readonly model: ModelPort;
  readonly blackBox: BlackBoxPort;
  /** Rule testing and diagnostics, when the model offers them (the real one does). */
  readonly rules?: RuleControls;
  /** Wall-clock ISO time for the record list. Default: the system clock. */
  readonly now?: () => string;
  /** Milliseconds, for the per-frame budget. Default: `performance.now`. */
  readonly clock?: () => number;
  /** Longest time `advance` may spend stepping in one call, ms. Default 10. */
  readonly frameBudget?: number;
}

export interface GameSession extends GameControls {
  /** Run exactly `n` ticks regardless of pause and frame budget (headless runs and tests). */
  stepTicks(n: number): number;
  /** TRUTH. For tests and tuning tools only; never hand this to belief-side code. */
  truth(): GameTruthState;
  /** TRUTH. The last tick's full result (including truth-only sim events), if any. */
  lastTick(): TickResult | undefined;
}

interface Scheduled {
  readonly time: number;
  readonly command: Command;
  readonly source: CommandSource;
  readonly planId?: PlanId;
  readonly planItemId?: PlanItemId;
}

const UNRESOLVED = 'Attitude reference cannot be resolved from the navigation solution.';
const pad = (n: number): string => String(n).padStart(4, '0');

export function createGameSession(setup: EncounterSetup, options: SessionOptions): GameSession {
  const { definition, play } = setup;
  const { model, blackBox } = options;
  const stepper = createTruthStepper(setup);
  const dt = stepper.dt;
  const now = options.now ?? (() => new Date().toISOString());
  const clock = options.clock ?? (() => performance.now());
  const frameBudget = options.frameBudget ?? 10;
  const telemetry = createTelemetryFilter(play.telemetryDeadband, play.telemetryKeepalive);
  const trailEvery = Math.max(1, Math.round(play.trailInterval / dt));

  let truth: GameTruthState = stepper.initial;
  let last: TickResult | undefined;
  // Attempts are numbered on from whatever Black Box already holds (a restored save).
  let attemptIndex = blackBox.archive().attempts.reduce((n, a) => Math.max(n, a.index), 0);
  let attemptId: AttemptId = '';
  let tick = 0;
  let paused = true;
  let warp = play.warpSteps[0] ?? 1;
  let debt = 0;
  let saturated = false;
  let committing = false;
  let outcome: AttemptOutcome = { kind: 'in-progress' };
  let queue: Scheduled[] = [];
  let planId: PlanId | undefined;
  let plans = 0;
  let forecastCount = 0;
  let commanded: CommandedState = initialCommandedState;
  let trail: TrailPoint[] = [];
  let forecasts: Forecast[] = [];
  const trails = new Map<AttemptId, TrailPoint[]>();
  let compare: readonly [AttemptId, AttemptId] | undefined;
  let selection: Selection | undefined;

  const time = (): number => tick * dt;
  const running = (): boolean => outcome.kind === 'in-progress';

  function begin(): void {
    attemptIndex += 1;
    attemptId = `attempt-${pad(attemptIndex)}`;
    truth = stepper.initial;
    last = undefined;
    tick = 0;
    paused = true;
    debt = 0;
    saturated = false;
    outcome = { kind: 'in-progress' };
    queue = setup.arrivalCommands.map((command) => ({ time: 0, command, source: 'procedure' }));
    planId = undefined;
    commanded = initialCommandedState;
    trail = [];
    forecasts = [];
    telemetry.reset();
    const start: AttemptStartInfo = {
      attemptId,
      index: attemptIndex,
      briefing: definition.briefing,
      ship: definition.ship,
      arrivalMass: setup.arrivalMass,
      startedAt: now(),
    };
    model.beginAttempt(start, blackBox.beginAttempt(start, model.state().version));
    trails.set(attemptId, trail);
    trail.push({ t: 0, position: model.believedWorld(0).ship.position });
  }

  function record(batch: RecordBatch): void {
    blackBox.record(batch);
    model.ingest(batch);
  }

  function end(result: Exclude<AttemptOutcome, { kind: 'in-progress' }>): void {
    outcome = result;
    paused = true;
    debt = 0;
    queue = [];
    planId = undefined;
    // Black Box keeps the final record; the model refits from it (P8).
    model.endAttempt(blackBox.endAttempt(attemptId, result, model.state().version));
  }

  function tickOnce(): void {
    const t = time();

    // Commands due now: scheduled first, in schedule order.
    const due: Scheduled[] = [];
    while (queue.length > 0 && queue[0]!.time <= t + 1e-9) due.push(queue.shift()!);
    if (planId && !queue.some((item) => item.source === 'plan')) planId = undefined;

    // Belief-relative references become inertial angles from the believed navigation solution.
    const resolved: DueCommand[] = [];
    const refused: ExecutedCommand[] = [];
    const refusals: ShipEvent[] = [];
    if (due.length > 0) {
      const nav = navigationView(model.believedWorld(t));
      for (const item of due) {
        const link = {
          source: item.source,
          ...(item.planId ? { planId: item.planId } : {}),
          ...(item.planItemId ? { planItemId: item.planItemId } : {}),
        };
        const command = resolveCommand(item.command, nav);
        if (command) resolved.push({ command, ...link });
        else {
          refused.push({
            t,
            command: item.command,
            ...link,
            status: 'rejected',
            reason: UNRESOLVED,
          });
          refusals.push({ kind: 'command-rejected', t, command: item.command, reason: UNRESOLVED });
        }
      }
    }

    const result = stepper.step(truth, resolved);
    truth = result.state;
    last = result;
    tick += 1;

    for (const done of result.executed)
      if (done.status !== 'rejected') commanded = applyCommanded(commanded, done.t, done.command);

    const measurements = telemetry.filter(result.measurements);
    const executed = refused.length > 0 ? [...result.executed, ...refused] : result.executed;
    const events = refusals.length > 0 ? [...refusals, ...result.events] : result.events;
    if (executed.length > 0 || measurements.length > 0 || events.length > 0)
      record({ attemptId, t, executed, measurements, events });

    if (tick % trailEvery === 0)
      trail.push({ t: time(), position: model.believedWorld(time()).ship.position });

    if (truth.lost) {
      const lost = result.events.find((e) => e.kind === 'ship-lost');
      end({ kind: 'lost', t: lost?.t ?? time(), cause: truth.lost });
    } else if (truth.objectives.completed) {
      end({ kind: 'completed', t: time(), objective: truth.objectives.completed });
    }
  }

  function toPlan(draft: PlanDraft, epoch: number): Plan {
    plans += 1;
    const id = `plan-${pad(plans)}`;
    const items = [...draft.items]
      .sort((a, b) => a.at - b.at)
      .map((item, i) => ({ id: `${id}-${i + 1}`, at: item.at, command: item.command }));
    return { id, ...(draft.name ? { name: draft.name } : {}), epoch, items };
  }

  function overlay(id: AttemptId): AttemptOverlay | undefined {
    const attempt = blackBox.attempt(id);
    const points = trails.get(id);
    if (!attempt || !points) return undefined;
    const forecast = attempt.forecasts[0];
    return {
      attemptId: id,
      label: `Attempt ${attempt.index}`,
      trail: points,
      ...(forecast ? { forecast } : {}),
    };
  }

  const phase = (): Phase => (!running() ? 'ended' : tick === 0 ? 'prepare' : 'operate');

  const session: GameSession = {
    briefing: definition.briefing,
    ship: definition.ship,
    model,
    blackBox,
    ...(options.rules ? { rules: options.rules } : {}),

    status(): SessionStatus {
      return {
        phase: phase(),
        attemptId,
        attemptIndex,
        t: time(),
        paused,
        warp,
        warpSteps: play.warpSteps,
        saturated,
        committing,
        outcome,
        ...(planId ? { planId } : {}),
        pending: queue.filter((item) => item.source === 'plan').length,
      };
    },

    snapshot(): ViewSnapshot {
      const first = compare ? overlay(compare[0]) : undefined;
      const second = compare ? overlay(compare[1]) : undefined;
      return buildViewSnapshot({
        t: time(),
        paused,
        warp,
        world: model.believedWorld(time()),
        definition: definition.ship,
        commanded,
        trail,
        forecasts,
        objectives: definition.briefing.objectives,
        ...(first && second ? { compare: [first, second] as const } : {}),
        ...(selection ? { selection } : {}),
      });
    },

    setPaused(value) {
      paused = value || !running();
      if (paused) debt = 0;
    },

    setWarp(value) {
      warp = play.warpSteps.reduce(
        (best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best),
        play.warpSteps[0] ?? 1,
      );
    },

    advance(realSeconds) {
      saturated = false;
      if (paused || committing || !running()) return 0;
      debt += Math.max(0, realSeconds) * warp;
      const started = clock();
      let ran = 0;
      while (debt >= dt && running() && !paused) {
        tickOnce();
        debt -= dt;
        ran += 1;
        if (ran % 8 === 0 && clock() - started > frameBudget) {
          // Out of frame time: drop the backlog instead of spiralling.
          saturated = debt >= dt;
          debt = Math.min(debt, dt);
          break;
        }
      }
      return ran;
    },

    stepTicks(n) {
      let ran = 0;
      while (ran < n && running()) {
        tickOnce();
        ran += 1;
      }
      return ran;
    },

    preview(draft): Promise<ForecastDraft> {
      const issuedAt = time();
      return model.forecast({
        id: `preview-${attemptId}`,
        attemptId,
        issuedAt,
        plan: { ...toPreview(draft), epoch: issuedAt },
        span: play.forecastSpan,
      });
    },

    async commit(draft): Promise<Forecast> {
      if (!running()) throw new Error('the attempt has ended; restart before committing a plan');
      if (committing) throw new Error('a plan is already being committed');
      const epoch = time();
      const attempt = attemptId;
      const plan = toPlan(draft, epoch);
      committing = true;
      try {
        forecastCount += 1;
        const forecast = issueForecast(
          await model.forecast({
            id: `forecast-${pad(forecastCount)}`,
            attemptId: attempt,
            issuedAt: epoch,
            plan,
            span: play.forecastSpan,
          }),
        );
        if (attempt !== attemptId || !running())
          throw new Error('the attempt ended before the plan was committed');
        blackBox.recordPlan(attempt, plan);
        blackBox.recordForecast(attempt, forecast);
        forecasts.push(forecast);
        // The new plan replaces whatever was still scheduled from an earlier one.
        queue = [
          ...queue.filter((item) => item.source !== 'plan'),
          ...plan.items.map((item) => ({
            time: epoch + item.at,
            command: item.command,
            source: 'plan' as const,
            planId: plan.id,
            planItemId: item.id,
          })),
        ].sort((a, b) => a.time - b.time);
        planId = plan.items.length > 0 ? plan.id : undefined;
        return forecast;
      } finally {
        committing = false;
      }
    },

    command(command) {
      if (!running()) return;
      // Ahead of anything scheduled later, behind anything already due.
      const at = time();
      const index = queue.findIndex((item) => item.time > at + 1e-9);
      const entry: Scheduled = { time: at, command, source: 'manual' };
      if (index < 0) queue.push(entry);
      else queue.splice(index, 0, entry);
    },

    recall() {
      if (running()) {
        const t = time();
        record({ attemptId, t, executed: [], measurements: [], events: [{ kind: 'recall', t }] });
        end({ kind: 'recalled', t });
      }
      begin();
    },

    restart() {
      if (running()) return;
      begin();
    },

    setCompare(pair) {
      compare = pair;
    },

    setSelection(value) {
      selection = value;
    },

    truth: () => truth,
    lastTick: () => last,
  };

  begin();
  return session;
}

/** A draft as a plan without consuming a plan number (previews are not recorded). */
function toPreview(draft: PlanDraft): Omit<Plan, 'epoch'> {
  const items = [...draft.items]
    .sort((a, b) => a.at - b.at)
    .map((item, i) => ({ id: `preview-${i + 1}`, at: item.at, command: item.command }));
  return { id: 'preview', ...(draft.name ? { name: draft.name } : {}), items };
}
