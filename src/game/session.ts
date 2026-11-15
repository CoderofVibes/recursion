/**
 * The game session: the core loop and recurrence v0 (2F). The only object that holds both the
 * true world and the believed side (P11). It runs truth ticks, hands what the ship sensed to
 * the model and Black Box, and gives the console and 3D view a belief-only interface
 * (`GameControls`).
 *
 * Loop: prepare (safe, paused) → commit plan (forecast issued and frozen) → operate (time
 * warp) → observe → compare → revise → try again. Warp changes how many ticks run per frame,
 * never the step size. Nothing holds time inside an encounter (A12): a committed plan runs from
 * the moment of commitment and its forecast, computed from that moment, appears when it is
 * ready (A18 (1)). Hands-on flying (`fly`, A8, A11) sends the controls as manual commands;
 * releasing them stops the rotation only (A18 (6)) and issues a coasting forecast. Holding an
 * attitude is a mode the player chooses (`holdAttitude`).
 *
 * Recurrence v0 (P8): loss, completion or a voluntary Recall ends the attempt; the next one
 * starts from exactly `EncounterDefinition.world` (ship, bodies, asteroids, noise streams),
 * while Black Box and the model keep everything.
 */

import type {
  AttemptId,
  AttemptOutcome,
  AttemptOverlay,
  AttemptRecord,
  BelievedShip,
  BelievedWorld,
  Chart,
  Command,
  CommandSource,
  CoverageLook,
  ExecutedCommand,
  Forecast,
  ForecastDraft,
  HandsOnInput,
  Plan,
  PlanId,
  PlanItemId,
  Selection,
  ShipEvent,
  ThrustTick,
  TrailPoint,
  ViewSnapshot,
  WindowView,
} from '../contracts/index.ts';
import { HANDS_ON_NEUTRAL, isHandsOnNeutral, issueForecast } from '../contracts/index.ts';
import { handsOnBodyRate, handsOnFirings } from '../ship/index.ts';
import { buildChart } from './belief/chart.ts';
import { earlierCoverage, type CoverageReplayOptions } from './belief/coverage.ts';
import type {
  AttitudeMode,
  FrameBudget,
  GameControls,
  Sighting,
  Phase,
  PlanDraft,
  SessionStatus,
} from './belief/controls.ts';
import type {
  AttemptStartInfo,
  BlackBoxPort,
  HandsOnThrust,
  HandsOnTurn,
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
import type { EncounterSetup, EncounterSource } from './encounter.ts';
import {
  createTruthStepper,
  type DueCommand,
  type GameTruthState,
  type TickResult,
} from './truth-step.ts';
import { buildWindowView } from './window.ts';
import {
  bodyWeights,
  departureProgress,
  initialDepartureTrack,
  recordVerdict,
  trackDeparture,
  type DepartureProgress,
  type DepartureTrack,
} from './belief/departure.ts';
import { criticalFault, powerAlerts, type PowerAlert } from './belief/power.ts';
import type { ForecastEnded, RadiationReading, SessionAlert } from './belief/controls.ts';
import {
  decodeRadiationReading,
  radiationCaution,
  type RadiationCautionState,
} from '../ship/sensors/radiation-observations.ts';
import { RADIATION_MONITOR } from '../ship/sensors/radiation-spec.ts';

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
  /** The same while coasting (A20), ms. Default 14 (2D's cadence, approved). Settable with `setFrameBudget`. */
  readonly coastingBudget?: number;
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
/** What releasing the controls leaves: the rotation stopped, the attitude free to drift (A18 (6)). */
const STEADY: Command = {
  kind: 'attitude',
  target: { reference: 'rate', rate: { x: 0, y: 0, z: 0 } },
};
/**
 * [ASSUMED] Firings weaker than this are not drawn or followed, N. The allocator trims the
 * 2 mm sideways offset of the centre of mass with jets at well under a newton.
 */
const FAINTEST_FIRING = 1;
const NO_THRUST: readonly ThrustTick[] = [];
const pad = (n: number): string => String(n).padStart(4, '0');

const sameControls = (a: HandsOnInput, b: HandsOnInput): boolean =>
  a.translate.x === b.translate.x &&
  a.translate.y === b.translate.y &&
  a.translate.z === b.translate.z &&
  a.yaw === b.yaw &&
  a.pitch === b.pitch &&
  a.throttle === b.throttle;

export function createGameSession(source: EncounterSource, options: SessionOptions): GameSession {
  const { model, blackBox } = options;
  /** The encounter as run `run` meets it (A10). */
  const setupFor = (run: number): EncounterSetup =>
    typeof source === 'function' ? source(run) : source;
  // The current attempt's encounter; the ship and the play values are the same for every run.
  // Attempts are numbered on from whatever Black Box already holds (a restored save), and the
  // run is the attempt's index less one.
  const firstRun = blackBox.archive().attempts.reduce((n, a) => Math.max(n, a.index), 0);
  let setupRun = firstRun;
  let setup = setupFor(firstRun);
  let definition = setup.definition;
  const play = setup.play;
  let stepper = createTruthStepper(setup);
  const dt = stepper.dt;
  const now = options.now ?? (() => new Date().toISOString());
  const clock = options.clock ?? (() => performance.now());
  const clampBudget = (ms: number): number => Math.min(1000, Math.max(1, ms));
  let budget: FrameBudget = {
    ms: clampBudget(options.frameBudget ?? 10),
    coastingMs: clampBudget(options.coastingBudget ?? 14),
    coastingFrom: 300,
  };
  const telemetry = createTelemetryFilter(play.telemetryDeadband, play.telemetryKeepalive);
  const trailEvery = Math.max(1, Math.round(play.trailInterval / dt));

  let truth: GameTruthState = stepper.initial;
  let last: TickResult | undefined;
  let attemptIndex = firstRun;
  let attemptId: AttemptId = '';
  let tick = 0;
  let paused = true;
  let warp = play.warpSteps[0] ?? 1;
  let debt = 0;
  let saturated = false;
  /** Committed plans whose forecast is still being computed. Time does not wait for them. */
  let committing = 0;
  /** What the attitude controller was last told, from executed commands. */
  let attitudeMode: AttitudeMode = 'free';
  /** What the gauges, the radiation monitor and the ship's fault reports warn about now (belief only). */
  let alerts: readonly SessionAlert[] = [];
  /** The power gauges' part of them, as last read. */
  let gauged: readonly PowerAlert[] = [];
  /** When the ship first reported a critical function short of power, and which, while it is. */
  let shortSince: number | undefined;
  let shortReported: string[] = [];
  /** The latest such report: the gauges end the warning only with a sample newer than it. */
  let lastFault = -Infinity;
  /**
   * The radiation monitor as recorded this attempt (A24, R37): 3C's caution policy over the
   * readings in record order, and the latest reading. Belief: the record, never the dose.
   */
  let radiation: RadiationCautionState = {};
  let radiationReading: RadiationReading | undefined;
  /** The forecast in force has ended and the ship flies past it (A6, A12), while it does. */
  let ended: ForecastEnded | undefined;
  /** The last forecast whose end was called out: each is called out once. */
  let endedFor: string | undefined;
  /** What the eye has seen through the window, until it is due (a well's precursor). */
  let sightings: Sighting[] = [];
  /** The believed departure account (S20): gauged Δv, closest approaches, the ship's verdicts. */
  let departureTrack: DepartureTrack = initialDepartureTrack;
  const checkEvery = Math.max(1, Math.round(setup.play.power.checkEvery / stepper.dt));
  let outcome: AttemptOutcome = { kind: 'in-progress' };
  let queue: Scheduled[] = [];
  let planId: PlanId | undefined;
  let plans = 0;
  let forecastCount = 0;
  /** The hands-on input last sent to the ship this attempt; the controls start released. */
  let flown: HandsOnInput = HANDS_ON_NEUTRAL;
  let commanded: CommandedState = initialCommandedState;
  /** Finished attempts when this one began, and what their sensors covered (built on demand). */
  let earlierRecords: readonly AttemptRecord[] = [];
  let earlierLooks: readonly CoverageLook[] | undefined;
  const looksByAttempt = new Map<AttemptId, readonly CoverageLook[]>();
  /** The thrust drawn for the controls as held, and what it was worked out from. */
  let drawn: { input: HandsOnInput; mass: number; thrust: readonly ThrustTick[] } | undefined;
  let trail: TrailPoint[] = [];
  let forecasts: Forecast[] = [];
  const trails = new Map<AttemptId, TrailPoint[]>();
  let compare: readonly [AttemptId, AttemptId] | undefined;
  let selection: Selection | undefined;

  const time = (): number => tick * dt;
  const running = (): boolean => outcome.kind === 'in-progress';
  /** A20: high warp and nobody flying by hand. */
  const coasting = (): boolean =>
    running() && !paused && warp >= budget.coastingFrom && sameControls(flown, HANDS_ON_NEUTRAL);
  const sliceNow = (): number => (coasting() ? budget.coastingMs : budget.ms);

  /**
   * Which thrusters a hands-on input fires, as designed: the ship's own control law and jet
   * allocator, run on the nominal design with the mass properties given (the believed ones).
   * It reads nothing of the ship's true state, so the believed side may use the answer: the
   * view draws it and the navigator follows it.
   */
  /** The turn the controls ask for, from the same flight-software law the ship flies. */
  const handsOnTurn: HandsOnTurn = (input) => handsOnBodyRate(definition.ship, input);

  const handsOnThrust: HandsOnThrust = (input, massProperties) =>
    handsOnFirings(definition.ship, input, massProperties)
      .filter((firing) => firing.force >= FAINTEST_FIRING)
      .map((firing) => ({
        source: firing.source,
        point: firing.point,
        direction: firing.direction,
        magnitude: firing.force,
      }));

  /** What a replay of an earlier attempt needs to follow it as the navigator did. */
  const replayOptions = (): CoverageReplayOptions => ({
    ship: definition.ship,
    briefing: definition.briefing,
    referenceRadius:
      definition.briefing.referenceRadius ?? setup.definition.world.law.referenceRadius,
    arrivalMass: setup.arrivalMass,
    handsOnThrust,
    handsOnTurn,
  });

  /** The thrust the controls ask for right now, from the last executed `fly` input. */
  function heldThrust(world: BelievedWorld): readonly ThrustTick[] {
    const held = commanded.handsOn;
    if (!held) return NO_THRUST;
    const massProperties = world.ship.massProperties;
    // Worked out again when the controls change or a kilogram of propellant has gone.
    if (!drawn || drawn.input !== held.input || Math.abs(drawn.mass - massProperties.mass) > 1)
      drawn = {
        input: held.input,
        mass: massProperties.mass,
        thrust: handsOnThrust(held.input, massProperties),
      };
    return drawn.thrust;
  }

  function begin(): void {
    attemptIndex += 1;
    attemptId = `attempt-${pad(attemptIndex)}`;
    if (typeof source === 'function' && attemptIndex - 1 !== setupRun) {
      // A new run: its own geometry and sensor noise (A10). The first is already built.
      const next = setupFor(attemptIndex - 1);
      if (next.definition.dt !== dt) throw new Error('an encounter may not change its step');
      setupRun = attemptIndex - 1;
      setup = next;
      definition = next.definition;
      stepper = createTruthStepper(next);
    }
    truth = stepper.initial;
    last = undefined;
    tick = 0;
    paused = true;
    debt = 0;
    saturated = false;
    outcome = { kind: 'in-progress' };
    queue = setup.arrivalCommands.map((command) => ({ time: 0, command, source: 'procedure' }));
    planId = undefined;
    flown = HANDS_ON_NEUTRAL;
    attitudeMode = 'free';
    alerts = [];
    gauged = [];
    shortSince = undefined;
    shortReported = [];
    lastFault = -Infinity;
    radiation = {};
    radiationReading = undefined;
    ended = undefined;
    endedFor = undefined;
    sightings = [];
    departureTrack = initialDepartureTrack;
    commanded = initialCommandedState;
    drawn = undefined;
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
      handsOnThrust,
      handsOnTurn,
    };
    // Every attempt Black Box holds is finished now; this attempt's own is not among them.
    earlierRecords = blackBox.archive().attempts;
    earlierLooks = undefined;
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

    // Belief-relative references become inertial attitudes from the believed navigation solution.
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

    for (const done of result.executed) {
      if (done.status === 'rejected') continue;
      commanded = applyCommanded(commanded, done.t, done.command);
      attitudeMode = attitudeAfter(attitudeMode, done.command);
    }

    const measurements = telemetry.filter(result.measurements);
    const executed = refused.length > 0 ? [...result.executed, ...refused] : result.executed;
    const events = refusals.length > 0 ? [...refusals, ...result.events] : result.events;
    if (executed.length > 0 || measurements.length > 0 || events.length > 0)
      record({ attemptId, t, executed, measurements, events });

    if (tick % trailEvery === 0)
      trail.push({ t: time(), position: model.believedWorld(time()).ship.position });

    // The power alerts (belief only), read every `checkEvery` and at once when the ship reports
    // a critical function short of power. A new alert, or one that worsened, drops warp to 1×
    // and ends the frame's run of ticks, so the player meets it in real time (A12).
    let fault: number | undefined;
    for (const e of result.events) {
      const group = criticalFault(e, definition.ship);
      if (group === undefined) continue;
      fault ??= e.t;
      if (e.t > lastFault) lastFault = e.t;
      if (!shortReported.includes(group)) shortReported.push(group);
    }
    // What the eye saw this tick (A19): a well's precursor. A new one drops warp to 1× and ends
    // the frame's run of ticks; time keeps running (A12).
    if (sightings.length > 0)
      sightings = sightings.filter((s) => s.until === undefined || s.until > time());
    for (const e of result.dynamics ?? []) {
      if (!e.seen) continue;
      sightings.push({
        kind: e.kind,
        field: e.id,
        seenAt: e.t,
        ...(e.until !== undefined ? { until: e.until } : {}),
      });
      if (warp > 1) {
        warp = 1;
        debt = Math.min(debt, dt);
      }
    }
    for (const e of result.events)
      if (e.kind === 'objective')
        departureTrack = recordVerdict(departureTrack, e.objective, e.status);
    // The radiation monitor's readings, in time order (A24, R37; 3C's policy): every one it sensed
    // on board, recorded or not (R52: the record keeps those at the player's rate and the spikes).
    // A new caution drops warp to 1× and ends the frame's run of ticks at once (A12). Only a fresh
    // low reading clears it; missing or stale readings keep it.
    const cautionBefore = radiation.caution;
    for (const m of result.sensed) {
      const reading = decodeRadiationReading(m);
      if (!reading) continue;
      radiationReading = { ...reading, threshold: RADIATION_MONITOR.hazardThreshold };
      radiation = radiationCaution(m, time(), radiation);
    }
    if (radiation.caution !== cautionBefore) {
      alerts = composed(gauged);
      if (!cautionBefore) {
        warp = 1;
        debt = Math.min(debt, dt);
      }
    }
    // The end of the forecast in force (A6, A12): flying on past it, the ship has no prediction
    // of where it goes. Called out once per forecast, at 1×; it stands until one reaches past now.
    const inForce = forecastInForce();
    const horizon = inForce?.samples.at(-1)?.t;
    const past = inForce !== undefined && horizon !== undefined && time() > horizon;
    if (past && endedFor !== inForce.id) {
      endedFor = inForce.id;
      ended = { id: 'forecast-ended', level: 'caution', forecast: inForce.id, endedAt: horizon };
      alerts = composed(gauged);
      warp = 1;
      debt = Math.min(debt, dt);
    } else if (!past && ended) {
      ended = undefined;
      alerts = composed(gauged);
    }
    // While a critical warning stands the gauges are read every tick, so it ends with them.
    if (fault !== undefined || shortSince !== undefined || tick % checkEvery === 0) {
      const believed = model.believedWorld(time());
      updateAlerts(believed.ship, fault);
      if (tick % checkEvery === 0)
        departureTrack = trackDeparture(departureTrack, believed, definition.ship);
    }

    if (truth.lost) {
      const lost = result.events.find((e) => e.kind === 'ship-lost');
      end({ kind: 'lost', t: lost?.t ?? time(), cause: truth.lost });
    } else if (truth.objectives.completed) {
      end({ kind: 'completed', t: time(), objective: truth.objectives.completed });
    }
  }

  /**
   * Read the gauges. A fault report starts the critical-service warning at once, before the
   * gauges' next sample shows it (they are sampled at the recorder's rate); the gauges end it,
   * once a sample newer than the latest report shows every critical function served.
   */
  function updateAlerts(ship: BelievedShip, fault: number | undefined): void {
    const now = powerAlerts(ship, definition.ship, play.power.cautionLead);
    let critical = now.find((a) => a.id === 'critical-service');
    if (fault !== undefined) shortSince ??= fault;
    if (!critical && shortSince !== undefined) {
      // Not yet in the gauges: keep the warning until they have sampled since the report.
      const sampled = Object.values(ship.telemetry).reduce(
        (latest, r) => Math.max(latest, r.t),
        -1,
      );
      if (sampled <= lastFault) {
        const previous = gauged.find((a) => a.id === 'critical-service');
        const budget = now[0] ?? { stored: 0, demand: 0, drain: 0 };
        critical = previous ?? {
          id: 'critical-service',
          level: 'warning',
          functions: [...shortReported],
          stored: budget.stored,
          demand: budget.demand,
          drain: budget.drain,
        };
      } else {
        shortSince = undefined;
        shortReported = [];
      }
    }
    if (critical) {
      shortSince ??= time();
      critical = { ...critical, since: shortSince, deadline: shortSince + play.power.lossGrace };
    }
    gauged = critical ? [critical, ...now.filter((a) => a.id !== 'critical-service')] : now;
    const next = composed(gauged);
    const before = new Set(alerts.map((a) => `${a.id}:${a.level}`));
    if (next.some((a) => !before.has(`${a.id}:${a.level}`)) && warp > 1) {
      warp = 1;
      debt = Math.min(debt, dt);
    }
    alerts = next;
  }

  /**
   * The gauges' alerts with the radiation monitor's caution and the forecast's end after them,
   * while they stand.
   */
  function composed(list: readonly PowerAlert[]): readonly SessionAlert[] {
    if (!radiation.caution && !ended) return list;
    return [...list, ...(radiation.caution ? [radiation.caution] : []), ...(ended ? [ended] : [])];
  }

  /** The forecast the ship flies by: the one issued latest (by its epoch), if any. */
  function forecastInForce(): Forecast | undefined {
    let latest: Forecast | undefined;
    for (const f of forecasts) if (!latest || f.issuedAt >= latest.issuedAt) latest = f;
    return latest;
  }

  /** What the eye sees through the window: bodies and rocks, and the encounter's visible fields. */
  function windowView(): WindowView {
    const world = truth.sim.world;
    const base = buildWindowView(world, play.windowMinAngularRadius);
    const fields = setup.window?.(world);
    return fields && fields.length > 0 ? { ...base, fields } : base;
  }

  /** Each depart objective as believed now (S20). */
  function departures(): DepartureProgress[] {
    const objectives = definition.briefing.objectives.filter((o) => o.depart);
    if (objectives.length === 0) return [];
    const world = model.believedWorld(time());
    const estimates = model.state().parameters;
    const weights = bodyWeights(
      world,
      estimates.length > 0 ? estimates : definition.briefing.priors,
    );
    const out: DepartureProgress[] = [];
    for (const o of objectives) {
      const p = departureProgress(o, world, weights, departureTrack);
      if (p) out.push(p);
    }
    return out;
  }

  function toPlan(draft: PlanDraft, epoch: number): Plan {
    plans += 1;
    const id = `plan-${pad(plans)}`;
    const items = [...draft.items]
      .sort((a, b) => a.at - b.at)
      .map((item, i) => ({ id: `${id}-${i + 1}`, at: item.at, command: item.command }));
    return { id, ...(draft.name ? { name: draft.name } : {}), epoch, items };
  }

  /**
   * Ask the model for the plan's forecast from its epoch, freeze it, record it and add it to
   * the view. The request goes out now, so the model works from what was recorded up to the
   * epoch; time runs on while it computes, and the forecast keeps its epoch (`issuedAt`), so
   * the stretch flown before it arrived shows as past. Returns undefined, with nothing
   * recorded, when the attempt ended before the forecast arrived.
   */
  async function issue(plan: Plan): Promise<Forecast | undefined> {
    const attempt = attemptId;
    forecastCount += 1;
    const forecast = issueForecast(
      await model.forecast({
        id: `forecast-${pad(forecastCount)}`,
        attemptId: attempt,
        issuedAt: plan.epoch,
        plan,
        span: play.forecastSpan,
      }),
    );
    if (attempt !== attemptId || !running()) return undefined;
    blackBox.recordForecast(attempt, forecast);
    forecasts.push(forecast);
    return forecast;
  }

  /** A manual command: ahead of anything scheduled later, behind anything already due. */
  function manual(command: Command): void {
    const at = time();
    const index = queue.findIndex((item) => item.time > at + 1e-9);
    const entry: Scheduled = { time: at, command, source: 'manual' };
    if (index < 0) queue.push(entry);
    else queue.splice(index, 0, entry);
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
    /** The briefing of the attempt in progress (each run has its own, A10). */
    get briefing() {
      return definition.briefing;
    },
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
        coasting: coasting(),
        frameBudget: sliceNow(),
        committing: committing > 0,
        attitude: attitudeMode,
        alerts,
        ...(radiationReading ? { radiation: radiationReading } : {}),
        departure: departures(),
        sightings,
        outcome,
        ...(planId ? { planId } : {}),
        pending: queue.filter((item) => item.source === 'plan').length,
      };
    },

    snapshot(): ViewSnapshot {
      const first = compare ? overlay(compare[0]) : undefined;
      const second = compare ? overlay(compare[1]) : undefined;
      const world = model.believedWorld(time());
      return buildViewSnapshot({
        t: time(),
        paused,
        warp,
        world,
        definition: definition.ship,
        commanded,
        handsOn: heldThrust(world),
        trail,
        forecasts,
        objectives: definition.briefing.objectives,
        ...(first && second ? { compare: [first, second] as const } : {}),
        ...(selection ? { selection } : {}),
        // The one place truth reaches the view without an instrument: what the eye can see.
        window: windowView(),
        coverageEarlier: (earlierLooks ??= earlierCoverage(
          earlierRecords,
          attemptId,
          replayOptions(),
          looksByAttempt,
        )),
      });
    },

    chart(): Chart {
      return buildChart(definition.briefing, model.state(), blackBox.archive());
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
      if (paused || !running()) return 0;
      debt += Math.max(0, realSeconds) * warp;
      // The slice is chosen once per frame: nothing within it can start hands-on flying, and an
      // alert that drops warp ends the frame's run of ticks anyway.
      const slice = sliceNow();
      const started = clock();
      let ran = 0;
      while (debt >= dt && running() && !paused) {
        tickOnce();
        debt -= dt;
        ran += 1;
        if (ran % 8 === 0 && clock() - started > slice) {
          // Out of frame time: drop the backlog instead of spiralling.
          saturated = debt >= dt;
          debt = Math.min(debt, dt);
          break;
        }
      }
      return ran;
    },

    setFrameBudget(change) {
      budget = {
        ms: change.ms === undefined ? budget.ms : clampBudget(change.ms),
        coastingMs:
          change.coastingMs === undefined ? budget.coastingMs : clampBudget(change.coastingMs),
        coastingFrom:
          change.coastingFrom === undefined
            ? budget.coastingFrom
            : Math.max(1, change.coastingFrom),
      };
      return budget;
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
      const epoch = time();
      const plan = toPlan(draft, epoch);
      // The plan runs from the moment of commitment, whether or not its forecast has arrived
      // (A12, A18 (1)), and replaces whatever was still scheduled from an earlier one.
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
      blackBox.recordPlan(attemptId, plan);
      committing += 1;
      try {
        const forecast = await issue(plan);
        if (!forecast) throw new Error('the attempt ended before the forecast arrived');
        return forecast;
      } finally {
        committing -= 1;
      }
    },

    command(command) {
      if (!running()) return;
      manual(command);
    },

    fly(input) {
      if (!running() || sameControls(input, flown)) return;
      // The input differs from the last one sent, so a neutral one is a release.
      const released = isHandsOnNeutral(input);
      // A copy, so the record does not follow an object the caller goes on changing.
      flown = {
        translate: { x: input.translate.x, y: input.translate.y, z: input.translate.z },
        yaw: input.yaw,
        pitch: input.pitch,
        throttle: input.throttle,
      };
      manual({ kind: 'fly', input: flown });
      if (!released) return;
      // Controls released: the rotation is stopped and nothing more (A18 (6)). Left to itself
      // the ship would go on to hold the attitude it settles at, which costs RCS propellant for
      // as long as it coasts; holding an attitude is the player's choice (`holdAttitude`).
      manual(STEADY);
      // A coasting forecast, which is an empty plan from the present state. It is issued and
      // recorded like a committed plan's, but schedules nothing and leaves a scheduled plan
      // alone. A failed model call is the model's to report; the loop goes on.
      const coast: Plan = {
        id: `coast-${pad(forecastCount + 1)}`,
        name: 'Coast',
        epoch: time(),
        items: [],
      };
      void issue(coast).catch(() => undefined);
    },

    holdAttitude(hold = true) {
      if (!running()) return;
      if (!hold) {
        manual(STEADY);
        return;
      }
      // The attitude the ship believes it has now, held until something else is commanded.
      manual({
        kind: 'attitude',
        target: { reference: 'inertial', attitude: model.believedWorld(time()).ship.attitude },
      });
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

/** The attitude mode after an executed command (the ship's own rules, src/ship commands.ts). */
function attitudeAfter(mode: AttitudeMode, command: Command): AttitudeMode {
  switch (command.kind) {
    case 'fly':
      // A neutral input is followed by the steady command; anything else is the player's hands.
      return isHandsOnNeutral(command.input) ? mode : 'hands-on';
    case 'attitude': {
      const target = command.target;
      if (target.reference === 'free') return 'free';
      if (target.reference === 'inertial') return 'hold';
      if (target.reference === 'rate')
        return target.rate.x === 0 && target.rate.y === 0 && target.rate.z === 0
          ? 'steady'
          : 'turning';
      return 'pointing';
    }
    case 'burn':
      return command.attitude ? 'pointing' : mode;
    case 'cutoff':
      return command.thruster === 'all' ? 'free' : mode;
    default:
      return mode;
  }
}
