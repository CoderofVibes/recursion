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
import { distance, length } from '../view3d/adapter.ts';
import type { ApproachAlert } from '../view3d/flight/FlightHolo.ts';
import { defaultDesign, designMark, setupCommands } from './mission.ts';
import type { MissionDesign } from './mission.ts';

export type PageId = 'mission' | 'plan' | 'model' | 'blackbox' | 'systems';

/** A burn's direction: along or against the believed velocity, toward or away from a body, or the body axis. */
export type BurnDirection = 'prograde' | 'retrograde' | 'toward' | 'away' | 'axis';

/** One burn being planned, as the player typed it. Times are seconds after commitment. */
export interface BurnRow {
  readonly key: number;
  readonly at: number;
  readonly direction: BurnDirection;
  /** Body for toward/away. */
  readonly target: string;
  /** For `axis`: degrees to turn the nose to the left of where it points now. */
  readonly offset: number;
  readonly sizing: 'deltaV' | 'duration';
  readonly amount: number;
  readonly throttle: number;
}

/** One camera pointing being planned. */
export interface PointRow {
  readonly key: number;
  readonly at: number;
  readonly target: string;
}

/** The plan as the player is editing it on PLAN (S9 R4). */
export interface PlanEdit {
  readonly burns: readonly BurnRow[];
  readonly points: readonly PointRow[];
}

export const EMPTY_PLAN: PlanEdit = { burns: [], points: [] };

/** Where the draft stands: nothing yet, edited, shown in a preview, or committed as it is. */
export type DraftState = 'empty' | 'edited' | 'previewed' | 'committed';

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
  /**
   * The plan being edited: kept across page and view changes, set aside on recurrence (its times
   * meant something only from the conditions it was written in).
   */
  planEdit: PlanEdit = EMPTY_PLAN;
  /** The previous attempt's draft, offered back as an unscheduled draft, never replayed. */
  setAside: { readonly edit: PlanEdit; readonly attempt: number } | undefined;
  /** The draft forecast of the plan as edited, if previewed; cleared by any edit. */
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
  /**
   * Why warp last dropped to 1× (A12: a new caution or warning, or flying by hand), shown beside
   * the time controls until the player raises warp again (S9 R3b). Never resumes warp itself.
   */
  warpDrop: string | null = null;

  /** The snapshot the frame loop took this frame (`snapshot()`). */
  private frameSnapshot: ViewSnapshot | undefined;
  /** Bumped by every edit of the plan; a preview or commit remembers the edit it was made from. */
  private edits = 0;
  private previewedEdit = -1;
  private committedEdit = -1;
  private rowKey = 1;
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

  /**
   * What the views draw: the frame loop's snapshot of this frame, so the instruments do not
   * each build another (a snapshot costs most of a millisecond). Outside the loop, a fresh one.
   */
  snapshot(): ViewSnapshot {
    return this.frameSnapshot ?? this.game.snapshot();
  }
  /** The frame loop hands over each frame's snapshot. */
  setFrame(snapshot: ViewSnapshot): void {
    this.frameSnapshot = snapshot;
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
  /**
   * A new attempt: the design carries over as the starting point, not yet committed. The plan
   * being edited is set aside, with a visible reason, and offered back: its times were relative
   * to conditions that are gone, so it is never scheduled again by itself.
   */
  newAttempt(): void {
    const { burns, points } = this.planEdit;
    if (burns.length + points.length > 0) {
      this.setAside = {
        edit: this.planEdit,
        attempt: Math.max(1, this.game.status().attemptIndex - 1),
      };
      this.planEdit = EMPTY_PLAN;
      this.edits++;
      this.note = 'plan draft set aside for the new attempt';
    }
    this.designedAt = undefined;
    this.preview = undefined;
    this.warpDrop = null;
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
  /** Change the plan being edited. Any change makes a preview of the old inputs stale. */
  editPlan(change: (edit: PlanEdit) => PlanEdit): void {
    this.planEdit = change(this.planEdit);
    this.edits++;
    if (this.preview) {
      this.preview = undefined;
      this.say('draft changed · preview again');
    } else this.notify();
  }
  /** A key for a new row, unique in this session. */
  newRowKey(): number {
    return this.rowKey++;
  }
  /** Where the draft stands against what was previewed and committed. */
  draftState(): DraftState {
    const { burns, points } = this.planEdit;
    if (this.committedEdit === this.edits) return 'committed';
    if (this.preview && this.previewedEdit === this.edits) return 'previewed';
    return burns.length + points.length === 0 ? 'empty' : 'edited';
  }
  /** Take back the previous attempt's draft, unscheduled. */
  restoreSetAside(): void {
    const kept = this.setAside;
    if (!kept) return;
    this.setAside = undefined;
    this.editPlan(() => kept.edit);
    this.say(`draft from attempt ${kept.attempt} restored · not scheduled`);
  }

  previewPlan(plan: PlanDraft): void {
    const edit = this.edits;
    this.say('forecasting');
    this.game.preview(plan).then(
      (draft) => {
        // Edited while the forecast ran: the preview would describe inputs no longer shown.
        if (edit !== this.edits) return this.say('draft changed while forecasting · preview again');
        this.preview = draft;
        this.previewedEdit = edit;
        this.say(`draft forecast: ${draft.samples.length} samples`);
      },
      (reason: unknown) => this.say(`no forecast · ${message(reason)}`),
    );
  }
  /** Commit a plan: the draft as edited, or (`fromDraft` false) a saved procedure. */
  commitPlan(plan: PlanDraft, fromDraft = true): void {
    const edit = this.edits;
    this.preview = undefined;
    this.say('committing');
    this.game.commit(plan).then(
      (forecast) => {
        // A procedure's commit replaces whatever the draft had scheduled.
        this.committedEdit = fromDraft ? edit : -1;
        this.say(`forecast ${forecast.id} issued on model v${forecast.modelVersion}`);
      },
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

  /** Warp was dropped to 1× for this reason. */
  dropWarp(reason: string): void {
    this.warpDrop = reason;
    this.say(`warp to 1× · ${reason}`);
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
      push(`range:${b.id}`, distance(ship.position, b.position) - b.radius);
    push('speed', length(ship.velocity));
    if (miss !== null) push('miss', miss);
  }
}

const message = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

/** Re-render when the desk says so. Returns the desk's change counter. */
export function useDesk(desk: Desk): number {
  return useSyncExternalStore(desk.subscribe, desk.getVersion, desk.getVersion);
}
