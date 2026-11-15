/**
 * The desk: what the console remembers between frames and shares between its views. The game
 * holds the game; this holds only the player's working state at the console: the mission design
 * being prepared, the plan being edited and its draft forecast, the object chosen in the flight
 * view, recent readings for the trend graphs, and the model's last diagnostics report.
 *
 * Belief side (P11): it sees the game only through `GameControls`.
 */
import { useSyncExternalStore } from 'react';
import type {
  AttemptId,
  BlackBoxArchive,
  ForecastDraft,
  ViewSnapshot,
} from '../contracts/index.ts';
import type { GameControls, PlanDraft } from '../game/belief/controls.ts';
import type { BurnReport, EmpiricalReport, ExtensionRecord, ModelReport } from '../model/index.ts';
import { distance, length } from '../view3d/adapter.ts';
import type { ApproachAlert } from '../view3d/flight/FlightHolo.ts';
import { defaultDesign, designMark, setupCommands } from './mission.ts';
import type { MissionDesign } from './mission.ts';
import { settingOf } from './power.ts';
import type { PendingSettings, UnitSetting } from './power.ts';
import { doseRate } from './radiation.ts';

/**
 * The console's pages, in the order of the loop (A26): explore, set the ship up, plan and
 * predict, [fly: the FLIGHT view], compare what happened, learn. Credits stand apart.
 */
export type PageId = 'exploration' | 'systems' | 'plan' | 'blackbox' | 'model' | 'credits';

/**
 * A burn's direction: along or against the believed velocity, toward or away from a body or a
 * place to reach, across the ship's motion (on the side of such a target, which steers the path
 * toward it; or to its left or right in the reference plane, or up or down out of it), or from
 * the body axis.
 */
export type BurnDirection =
  | 'prograde'
  | 'retrograde'
  | 'toward'
  | 'away'
  | 'steer'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'axis';

/** A burn's target that is a place to reach, not a body: the objective's id after this. */
export const OBJECTIVE_TARGET = 'objective:';

/** What the PLAN chart holds in view: the plan's path, the ship as it goes, or the whole region. */
export type ChartFraming = 'plan' | 'follow' | 'region';

/** One burn being planned, as the player typed it. Times are seconds after commitment. */
export interface BurnRow {
  readonly key: number;
  readonly at: number;
  readonly direction: BurnDirection;
  /** What toward, away and steer aim by: a body, or a place to reach (`OBJECTIVE_TARGET` + id). */
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

/** Real milliseconds the console keeps one read of Black Box's archive while an attempt runs. */
const ARCHIVE_PERIOD = 2000;

/** Readings kept for trend graphs: a short ring of samples per channel. */
const HISTORY = 160;
/** Real seconds between samples. */
const SAMPLE_EVERY = 0.5;

const DESIGN_KEY = 'recursion.mission-design';

export class Desk {
  readonly game: GameControls;
  readonly modelError: () => string | undefined;
  readonly erase: (() => Promise<void>) | undefined;

  page: PageId = 'exploration';
  design: MissionDesign;
  /** Sim time the design was last committed in this attempt; undefined until then. */
  designedAt: number | undefined;
  /** The moment of the forecast the PLAN chart shows; undefined is the forecast's end. */
  chartT: number | undefined;
  /**
   * The model's report as it stood before the last rule was adopted in this session: what the
   * evidence looked like against the old law, kept so MODEL can show it beside the new.
   */
  reportBefore: ModelReport | undefined;
  /**
   * The plan being edited: kept across page and view changes, set aside on recurrence (its times
   * meant something only from the conditions it was written in).
   */
  planEdit: PlanEdit = EMPTY_PLAN;
  /** The previous attempt's draft, offered back as an unscheduled draft, never replayed. */
  setAside: { readonly edit: PlanEdit; readonly attempt: number } | undefined;
  /** The draft forecast of the plan as edited, if previewed; cleared by any edit. */
  preview: ForecastDraft | undefined;
  /**
   * The preview the last edit made stale: PLAN draws it faintly, as the forecast of the plan as
   * it was, until the forecast of the plan as it is arrives. Nothing else reads it.
   */
  stalePreview: ForecastDraft | undefined;
  /** A draft forecast is being worked out. */
  previewBusy = false;
  chartFraming: ChartFraming = 'plan';
  /**
   * Stepping through the forecast in the MAP's region view: the moment of it being looked at,
   * and whether the view follows the ship there. Undefined: the region is shown as it is now.
   */
  rehearsal: { readonly t: number; readonly follow: boolean } | undefined;
  /** Object chosen in the flight view. */
  selected: string | null = null;
  compare: readonly [AttemptId, AttemptId] | undefined;
  report: ModelReport | undefined;
  /**
   * The model's look at each recorded burn and at any pull it cannot explain (RuleControls.burns
   * and .empirical), asked for on MODEL: each costs fits, so they run only when asked. Kept with
   * the model version they were worked out on.
   */
  burnCheck: { readonly version: number; readonly burns: readonly BurnReport[] } | undefined;
  unexplained: { readonly version: number; readonly result: EmpiricalReport | null } | undefined;
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
  private archived: { key: string; at: number; value: BlackBoxArchive } | undefined;
  /** Bumped by every change to the design; recording it remembers the change it recorded. */
  private designEdits = 0;
  private recordedDesign = -1;
  /** Bumped by every edit of the plan; a preview or commit remembers the edit it was made from. */
  private edits = 0;
  private previewedEdit = -1;
  private committedEdit = -1;
  private failedEdit = -1;
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

  /**
   * Black Box's archive for the console, read at most every ARCHIVE_PERIOD while an attempt runs
   * (S15: reading it copies the whole record in progress). A new attempt, a change of phase or
   * `fresh` (after saving a procedure) reads it at once; the same objects come back in between,
   * so pages can memoize on them.
   */
  archive(fresh = false): BlackBoxArchive {
    const s = this.game.status();
    const key = `${s.attemptId}|${s.phase}`;
    const now = performance.now();
    const c = this.archived;
    if (fresh || !c || c.key !== key || now - c.at > ARCHIVE_PERIOD)
      this.archived = { key, at: now, value: this.game.blackBox.archive() };
    return this.archived!.value;
  }

  setPage(page: PageId): void {
    this.page = page;
    this.notify();
  }
  /** Show a moment of the forecast on the PLAN chart; undefined returns to its end. */
  setChartT(t: number | undefined): void {
    this.chartT = t;
    this.notify();
  }
  /** How many times the plan has been edited: a preview made for one edit is stale for the next. */
  planEdits(): number {
    return this.edits;
  }
  select(id: string | null): void {
    this.selected = id;
    this.notify();
  }
  /** Step to a moment of the forecast, or (undefined) stop stepping. */
  setRehearsal(next: { readonly t: number; readonly follow: boolean } | undefined): void {
    this.rehearsal = next;
    this.notify();
  }

  // ---- Mission design ------------------------------------------------------------------------
  setDesign(patch: Partial<MissionDesign>): void {
    this.design = { ...this.design, ...patch };
    this.designEdits++;
    this.notify();
  }
  /** The design as shown has been recorded in this attempt, unchanged since. */
  designRecorded(): boolean {
    return this.designedAt !== undefined && this.recordedDesign === this.designEdits;
  }

  // ---- The ship's settings ------------------------------------------------------------------
  // Before the encounter is entered nothing runs: a command sent then reaches the ship only on
  // ENTER, and the ship reports nothing meanwhile. So while preparing, a setting is part of the
  // design: it shows at once as set, and ENTER sends it. Inside the encounter a setting is a
  // command, sent at once (A12), and the ship's own report is what is shown.
  private preparing(): boolean {
    return this.game.status().phase === 'prepare';
  }
  /** Settings made while preparing that the ship does not have yet, by unit. */
  pendingSettings(): PendingSettings {
    if (!this.preparing()) return {};
    const camera = this.game.ship.equipment.find((e) => e.kind === 'optical-tracker');
    return {
      ...this.design.setup.units,
      ...(camera
        ? {
            [camera.id]: {
              ...this.design.setup.units?.[camera.id],
              mode: this.design.setup.cameraMode,
            },
          }
        : {}),
    };
  }
  /** A unit's mode and allocation as set: the design while preparing, else the ship's report. */
  unitSetting(id: string): UnitSetting | undefined {
    const spec = this.game.ship.equipment.find((e) => e.id === id);
    if (!spec) return undefined;
    return settingOf(spec, this.snapshot().world.ship, this.pendingSettings());
  }
  /** Set a unit's mode, its allocation, or both. */
  setUnit(id: string, patch: Partial<UnitSetting>): void {
    const spec = this.game.ship.equipment.find((e) => e.id === id);
    if (!spec) return;
    if (!this.preparing()) {
      if (patch.mode !== undefined)
        this.game.command({ kind: 'mode', equipment: id, mode: patch.mode });
      if (patch.allocation !== undefined)
        this.game.command({ kind: 'power', equipment: id, allocation: patch.allocation });
      this.notify();
      return;
    }
    const { mode, allocation } = patch;
    const units = { ...this.design.setup.units };
    const was = units[id] ?? {};
    // The camera's mode has its own place in the design; everything else is kept by unit.
    if (spec.kind === 'optical-tracker' && mode !== undefined) {
      if (allocation !== undefined) units[id] = { ...was, allocation };
      this.setSetup({ cameraMode: mode, units });
      return;
    }
    units[id] = {
      ...was,
      ...(mode !== undefined ? { mode } : {}),
      ...(allocation !== undefined ? { allocation } : {}),
    };
    this.setSetup({ units });
  }
  /** The Black Box sample rate as set, Hz. */
  recorderRate(): number {
    if (this.preparing()) return this.design.setup.recorderRate;
    return (
      this.snapshot().world.ship.telemetry['black-box.sample-rate']?.value ??
      this.design.setup.recorderRate
    );
  }
  setRecorderRate(rate: number): void {
    if (this.preparing()) this.setSetup({ recorderRate: rate });
    else {
      this.game.command({ kind: 'recorder', sampleRate: rate });
      this.notify();
    }
  }
  /** The configuration as set. */
  configuration(): string {
    return this.preparing()
      ? this.design.setup.configuration
      : this.snapshot().world.ship.configuration;
  }
  setConfiguration(configuration: string): void {
    if (this.preparing()) this.setSetup({ configuration });
    else {
      this.game.command({ kind: 'configure', configuration });
      this.notify();
    }
  }
  /**
   * Enter the encounter (A12): the design as shown is recorded and sent first, if it has not
   * been, so what the screens showed as set is what flies. Then the clock starts at 1×.
   */
  enter(): void {
    if (!this.preparing()) return;
    if (!this.designRecorded()) this.commitDesign();
    this.game.setWarp(1);
    this.game.setPaused(false);
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
    this.recordedDesign = this.designEdits;
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
    this.recordedDesign = -1;
    this.chartT = undefined;
    this.preview = undefined;
    this.stalePreview = undefined;
    // The forecast being stepped through belonged to the attempt that ended.
    this.rehearsal = undefined;
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
    this.chartT = undefined;
    if (this.preview) {
      this.stalePreview = this.preview;
      this.preview = undefined;
      this.say('draft changed · forecasting again');
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
    this.previewBusy = true;
    this.say('forecasting');
    this.game.preview(plan).then(
      (draft) => {
        this.previewBusy = false;
        // Edited while the forecast ran: the preview would describe inputs no longer shown.
        if (edit !== this.edits) return this.say('draft changed while forecasting');
        this.preview = draft;
        this.stalePreview = undefined;
        this.previewedEdit = edit;
        this.say(`draft forecast: ${draft.samples.length} samples`);
      },
      (reason: unknown) => {
        this.previewBusy = false;
        this.failedEdit = edit;
        this.say(`no forecast · ${message(reason)}`);
      },
    );
  }
  /** The draft as it stands could not be forecast: it is not asked again until it changes. */
  previewFailed(): boolean {
    return this.failedEdit === this.edits;
  }
  /** Choose what the PLAN chart holds in view. */
  setChartFraming(framing: ChartFraming): void {
    this.chartFraming = framing;
    this.notify();
  }
  /** Commit a plan: the draft as edited, or (`fromDraft` false) a saved procedure. */
  commitPlan(plan: PlanDraft, fromDraft = true): void {
    const edit = this.edits;
    this.preview = undefined;
    this.stalePreview = undefined;
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

  /** Ask the model how each recorded burn went against what it expected (costs a fit per burn). */
  checkBurns(): void {
    const rules = this.game.rules;
    if (!rules) return;
    const version = this.game.model.state().version;
    this.say('checking burns');
    rules.burns().then(
      (burns) => {
        this.burnCheck = { version, burns };
        this.say(`burns checked: ${burns.length}`);
      },
      (reason: unknown) => this.say(`no burn check · ${message(reason)}`),
    );
  }
  /** Ask the model for any pull it cannot explain with the law it has. */
  findUnexplained(): void {
    const rules = this.game.rules;
    if (!rules) return;
    const version = this.game.model.state().version;
    this.say('looking for unexplained pull');
    rules.empirical().then(
      (result) => {
        this.unexplained = { version, result };
        this.say(result ? 'unexplained pull: fitted' : 'unexplained pull: nothing to fit yet');
      },
      (reason: unknown) => this.say(`no fit · ${message(reason)}`),
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
      // Each unit's draw too, for its own trend (a unit's history, recent and present).
      if (/\.(load|temperature|charge|bytes|output|power)$/.test(channel)) push(channel, r.value);
    for (const b of snapshot.world.bodies)
      push(`range:${b.id}`, distance(ship.position, b.position) - b.radius);
    push('speed', length(ship.velocity));
    if (miss !== null) push('miss', miss);
    // The radiation monitor (A24), while its reading stands; over range it is a lower limit.
    const dose = doseRate(this.game.status());
    if (dose && snapshot.t <= dose.validUntil)
      push('radiation', dose.saturated ? dose.saturationRate : dose.rate);
  }
}

const message = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

/** Re-render when the desk says so. Returns the desk's change counter. */
export function useDesk(desk: Desk): number {
  return useSyncExternalStore(desk.subscribe, desk.getVersion, desk.getVersion);
}
