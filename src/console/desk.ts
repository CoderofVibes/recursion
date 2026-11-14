/**
 * The desk: what the console remembers between frames and shares between its views. The game
 * holds the game; this holds only the player's working state at the console: the mission design
 * being prepared, the plan being edited and its draft forecast, the object chosen in the flight
 * view, recent readings for the trend graphs, and the model's last diagnostics report.
 *
 * Belief side (P11): it sees the game only through `GameControls`.
 */
import { useSyncExternalStore } from 'react';
import type { AttemptId, ForecastDraft, ViewSnapshot } from '../contracts/index.ts';
import type { GameControls, PlanDraft } from '../game/belief/controls.ts';
import type { ExtensionRecord, ModelReport } from '../model/index.ts';
import type { ApproachAlert } from '../view3d/flight/FlightHolo.ts';
import { defaultDesign, designMark, setupCommands } from './mission.ts';
import type { MissionDesign } from './mission.ts';

export type PageId = 'mission' | 'plan' | 'model' | 'blackbox' | 'systems';

/** Readings kept for trend graphs: a short ring of samples per channel. */
const HISTORY = 160;
/** Real seconds between samples. */
const SAMPLE_EVERY = 0.5;

const DESIGN_KEY = 'recursion.mission-design';

export class Desk {
  readonly game: GameControls;
  readonly modelError: () => string | undefined;
  readonly erase: (() => Promise<void>) | undefined;

  page: PageId = 'mission';
  design: MissionDesign;
  /** Sim time the design was last committed in this attempt; undefined until then. */
  designedAt: number | undefined;
  /** The plan being edited and the draft forecast of it, if previewed. */
  preview: ForecastDraft | undefined;
  /** Object chosen in the flight view. */
  selected: string | null = null;
  compare: readonly [AttemptId, AttemptId] | undefined;
  report: ModelReport | undefined;
  /** The latest test of each rule in this session. */
  readonly tests = new Map<string, ExtensionRecord | { error: string }>();
  /** A short line about the last thing the console did, for its footer. */
  note = '';
  /** An attempt whose debrief Black Box wants to show. */
  debriefOf: AttemptId | undefined;
  /** What the flight view measured last: closest approaches ahead, and the miss from the forecast. */
  flightAlerts: readonly ApproachAlert[] = [];
  flightMiss: { readonly metres: number; readonly sigmas: number } | null = null;
  /** Keys held down in the room (the flight key caps light from this). */
  keys: ReadonlySet<string> = new Set();

  private readonly series = new Map<string, number[]>();
  private sinceSample = SAMPLE_EVERY;
  private reportVersion = -1;
  private reportBusy = false;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    game: GameControls,
    modelError: () => string | undefined = () => undefined,
    erase?: () => Promise<void>,
  ) {
    this.game = game;
    this.modelError = modelError;
    this.erase = erase;
    const primary = game.briefing.knownBodies[0]?.id ?? null;
    this.design = { ...defaultDesign(game.ship, primary), ...this.savedDesign() };
  }

  // ---- Subscriptions (React) -----------------------------------------------------------------
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = (): number => this.version;
  /** Tell the views something changed. The frame loop also calls this a few times a second. */
  notify(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  setPage(page: PageId): void {
    this.page = page;
    this.notify();
  }
  select(id: string | null): void {
    this.selected = id;
    this.notify();
  }

  // ---- Mission design ------------------------------------------------------------------------
  setDesign(patch: Partial<MissionDesign>): void {
    this.design = { ...this.design, ...patch };
    this.notify();
  }
  setSetup(patch: Partial<MissionDesign['setup']>): void {
    this.setDesign({ setup: { ...this.design.setup, ...patch } });
  }
  /** Record the design in Black Box and set the ship up as designed. */
  commitDesign(): void {
    const { game } = this;
    game.command(designMark(this.design));
    for (const c of setupCommands(this.design, game.ship)) game.command(c);
    this.designedAt = game.status().t;
    try {
      window.localStorage.setItem(DESIGN_KEY, JSON.stringify(this.design));
    } catch {
      // Storage unavailable: the design still stands for this attempt.
    }
    this.say('design recorded');
  }
  /** A new attempt: the design carries over as the starting point, not yet committed. */
  newAttempt(): void {
    this.designedAt = undefined;
    this.preview = undefined;
    this.selected = null;
    this.compare = undefined;
    this.game.setCompare();
    this.series.clear();
    this.notify();
  }
  private savedDesign(): Partial<MissionDesign> {
    try {
      const raw = window.localStorage.getItem(DESIGN_KEY);
      const d = raw ? (JSON.parse(raw) as MissionDesign) : undefined;
      return d && d.version === 1 ? d : {};
    } catch {
      return {};
    }
  }

  // ---- Plans ---------------------------------------------------------------------------------
  previewPlan(plan: PlanDraft): void {
    this.say('forecasting');
    this.game.preview(plan).then(
      (draft) => {
        this.preview = draft;
        this.say(`draft forecast: ${draft.samples.length} samples`);
      },
      (reason: unknown) => this.say(`no forecast · ${message(reason)}`),
    );
  }
  commitPlan(plan: PlanDraft): void {
    this.preview = undefined;
    this.say('committing');
    this.game.commit(plan).then(
      (forecast) => this.say(`forecast ${forecast.id} issued on model v${forecast.modelVersion}`),
      (reason: unknown) => this.say(`not committed · ${message(reason)}`),
    );
  }

  // ---- Black Box comparison ------------------------------------------------------------------
  setCompare(pair: readonly [AttemptId, AttemptId] | undefined): void {
    this.compare = pair;
    this.game.setCompare(pair);
    this.notify();
  }

  // ---- Model diagnostics ---------------------------------------------------------------------
  /** Fetch the model's report when its version has moved on. Cheap; no new fits. */
  refreshReport(force = false): void {
    const rules = this.game.rules;
    const version = this.game.model.state().version;
    if (!rules || this.reportBusy || (!force && version === this.reportVersion)) return;
    this.reportBusy = true;
    rules.report().then(
      (report) => {
        this.report = report;
        this.reportVersion = version;
        this.reportBusy = false;
        this.notify();
      },
      () => {
        this.reportBusy = false;
      },
    );
  }

  say(text: string): void {
    this.note = text;
    this.notify();
  }

  // ---- History for trends --------------------------------------------------------------------
  history(channel: string): readonly number[] {
    return this.series.get(channel) ?? [];
  }
  /** Called every frame with the real seconds elapsed. */
  sample(dt: number, snapshot: ViewSnapshot, miss: number | null): void {
    this.sinceSample += dt;
    if (this.sinceSample < SAMPLE_EVERY || snapshot.paused) return;
    this.sinceSample = 0;
    const ship = snapshot.world.ship;
    const push = (channel: string, value: number | undefined): void => {
      if (value === undefined || !Number.isFinite(value)) return;
      let s = this.series.get(channel);
      if (!s) this.series.set(channel, (s = []));
      s.push(value);
      if (s.length > HISTORY) s.shift();
    };
    for (const [id, g] of Object.entries(ship.propellant)) push(`tank:${id}`, g.mean);
    for (const [channel, r] of Object.entries(ship.telemetry))
      if (/\.(load|temperature|charge|bytes|output)$/.test(channel)) push(channel, r.value);
    for (const b of snapshot.world.bodies)
      push(
        `range:${b.id}`,
        Math.hypot(ship.position.x - b.position.x, ship.position.y - b.position.y) - b.radius,
      );
    push('speed', Math.hypot(ship.velocity.x, ship.velocity.y));
    if (miss !== null) push('miss', miss);
  }
}

const message = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

/** Re-render when the desk says so. Returns the desk's change counter. */
export function useDesk(desk: Desk): number {
  return useSyncExternalStore(desk.subscribe, desk.getVersion);
}
