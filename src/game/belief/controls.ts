/**
 * BELIEF side (no truth imports). What the console, the 3D view and the app shell may see of
 * the running game: the loop's controls, the view snapshot and the two belief-side services.
 * The session (src/game/session.ts) implements this; nothing here can reach truth.
 *
 * The loop (2F): prepare (safe, paused) → commit plan (forecast issued and frozen) → operate
 * (time warp) → observe → compare → revise → try again.
 */

import type {
  AttemptId,
  AttemptOutcome,
  Command,
  EncounterBriefing,
  Forecast,
  ForecastDraft,
  PlanId,
  Seconds,
  Selection,
  ShipDefinition,
  ViewSnapshot,
} from '../../contracts/index.ts';
import type { PlanStep } from './maneuver.ts';
import type { BlackBoxPort, ModelPort } from './ports.ts';

/** A plan before it is committed: times are seconds after the moment of commitment. */
export interface PlanDraft {
  readonly name?: string;
  readonly items: readonly PlanStep[];
}

/**
 * `prepare`: a fresh attempt at arrival, nothing has run. `operate`: time has run.
 * `ended`: lost, recalled or completed; `restart()` begins the next attempt (recurrence, P8).
 */
export type Phase = 'prepare' | 'operate' | 'ended';

export interface SessionStatus {
  readonly phase: Phase;
  readonly attemptId: AttemptId;
  /** 1-based count of attempts in this session. */
  readonly attemptIndex: number;
  readonly t: Seconds;
  readonly paused: boolean;
  /** Selected warp, sim seconds per real second. */
  readonly warp: number;
  readonly warpSteps: readonly number[];
  /** True when the last `advance` ran out of frame time and ran slower than `warp`. */
  readonly saturated: boolean;
  /** True while a commit waits for its forecast; time holds still. */
  readonly committing: boolean;
  readonly outcome: AttemptOutcome;
  /** The plan whose items are still scheduled, if any, and how many remain. */
  readonly planId?: PlanId;
  readonly pending: number;
}

export interface GameControls {
  readonly briefing: EncounterBriefing;
  readonly ship: ShipDefinition;
  readonly model: ModelPort;
  readonly blackBox: BlackBoxPort;

  status(): SessionStatus;
  /** What the console and 3D view draw this frame. */
  snapshot(): ViewSnapshot;

  setPaused(paused: boolean): void;
  /** Choose a warp; snaps to the nearest offered step. Warp never changes the step size. */
  setWarp(warp: number): void;
  /** Call once per frame with the real seconds elapsed. Returns the ticks run. */
  advance(realSeconds: number): number;

  /** A draft forecast of the plan from the present state. Nothing is recorded or scheduled. */
  preview(plan: PlanDraft): Promise<ForecastDraft>;
  /**
   * Commit a plan now: the forecast is issued and frozen, both are recorded, and the plan's
   * items replace whatever was still scheduled from an earlier plan. Time holds still until
   * the forecast arrives.
   */
  commit(plan: PlanDraft): Promise<Forecast>;
  /** A manual command, executed on the next tick. */
  command(command: Command): void;

  /** Voluntary Recall (P8): end this attempt and begin the next at arrival. */
  recall(): void;
  /** After loss or completion: begin the next attempt at arrival. */
  restart(): void;

  /** Overlay two recorded attempts in the snapshot, or clear the overlay. */
  setCompare(pair?: readonly [AttemptId, AttemptId]): void;
  setSelection(selection?: Selection): void;
}
