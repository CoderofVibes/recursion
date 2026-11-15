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
  Chart,
  Command,
  EncounterBriefing,
  Forecast,
  ForecastDraft,
  HandsOnInput,
  PlanId,
  Seconds,
  Selection,
  ShipDefinition,
  ViewSnapshot,
} from '../../contracts/index.ts';
import type { PlanStep } from './maneuver.ts';
import type { BlackBoxPort, ModelPort, RuleControls } from './ports.ts';

/** A plan before it is committed: times are seconds after the moment of commitment. */
export interface PlanDraft {
  readonly name?: string;
  readonly items: readonly PlanStep[];
}

/**
 * What the attitude controller is doing, from the commands the ship executed:
 * - `free`: no control (arrival, or after cutting every thruster);
 * - `hands-on`: the player's yaw and pitch;
 * - `steady`: rotation stopped, attitude free to drift (what releasing the controls leaves);
 * - `hold`: holding an inertial attitude, which the player chose (`holdAttitude`);
 * - `pointing`: turning to, or holding, a direction a plan or command named;
 * - `turning`: a commanded constant rate.
 */
export type AttitudeMode = 'free' | 'hands-on' | 'steady' | 'hold' | 'pointing' | 'turning';

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
  /**
   * True while a committed plan's forecast is still being computed. Time does not wait for it
   * (A12, A18 (1)): the plan runs from the moment of commitment, and the forecast, when it
   * arrives, starts there, so the stretch flown meanwhile shows as past.
   */
  readonly committing: boolean;
  readonly attitude: AttitudeMode;
  readonly outcome: AttemptOutcome;
  /** The plan whose items are still scheduled, if any, and how many remain. */
  readonly planId?: PlanId;
  readonly pending: number;
}

export interface GameControls {
  readonly briefing: EncounterBriefing;
  readonly ship: ShipDefinition;
  readonly model: ModelPort;
  /** Black Box: every attempt's record, and the saved procedures (`saveProcedure`, P9). */
  readonly blackBox: BlackBoxPort;
  /** Testing, adopting and revoking rules, and the model's diagnostics. Absent with a stand-in. */
  readonly rules?: RuleControls;

  status(): SessionStatus;
  /**
   * What the console and 3D view draw this frame: the believed world, and in `window` what
   * the eye sees outside (the one part that needs no instrument).
   */
  snapshot(): ViewSnapshot;
  /** The chart for the MAP: what has been surveyed, the attempts flown here, leads with a bearing. */
  chart(): Chart;

  setPaused(paused: boolean): void;
  /** Choose a warp; snaps to the nearest offered step. Warp never changes the step size. */
  setWarp(warp: number): void;
  /** Call once per frame with the real seconds elapsed. Returns the ticks run. */
  advance(realSeconds: number): number;

  /** A draft forecast of the plan from the present state. Nothing is recorded or scheduled. */
  preview(plan: PlanDraft): Promise<ForecastDraft>;
  /**
   * Commit a plan now: it is recorded at once and its items replace whatever was still
   * scheduled from an earlier plan. Its forecast is computed from this moment and, when ready,
   * frozen, recorded and drawn; time keeps running meanwhile (A12, A18 (1)). The promise gives
   * that forecast, and fails if the attempt ends first.
   */
  commit(plan: PlanDraft): Promise<Forecast>;
  /** A manual command, executed on the next tick. */
  command(command: Command): void;
  /**
   * Hands-on flying (A8, A11): the state of the player's controls. Call it whenever they change
   * (calling it every frame is fine). The ship flies it until the next call. While a control
   * is held the snapshot's `ship.thrust` shows the thrusters it fires, and the believed
   * velocity follows the thrust. Releasing the controls (a neutral input) stops the rotation
   * and nothing more (A18 (6)), and issues a coasting forecast from the present state.
   */
  fly(input: HandsOnInput): void;
  /**
   * Hold the attitude the ship has now (a mode the player chooses; it costs RCS propellant
   * while it lasts), or with `false` go back to stopping the rotation only.
   */
  holdAttitude(hold?: boolean): void;

  /** Voluntary Recall (P8): end this attempt and begin the next at arrival. */
  recall(): void;
  /** After loss or completion: begin the next attempt at arrival. */
  restart(): void;

  /** Overlay two recorded attempts in the snapshot, or clear the overlay. */
  setCompare(pair?: readonly [AttemptId, AttemptId]): void;
  setSelection(selection?: Selection): void;
}
