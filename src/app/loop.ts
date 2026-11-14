/**
 * The control room's frame loop. Each animation frame it advances the game, takes `snapshot()`,
 * flies the ship from the flight keys, and hands the room what to draw.
 *
 * - Time runs while the player is in the room (owner, A8): a new attempt is set running at 1×
 *   as the player walks in. The console's HOLD stops it.
 * - Hands off the flight controls: a coasting forecast is issued, frozen (P10).
 * - When an attempt ends, the room plays the way back to the door (A9), and Black Box has the
 *   debrief ready on the console.
 *
 * Belief side only: the game is reached through `GameControls`.
 */
import { buildChart } from '../console/chart.ts';
import type { Desk } from '../console/desk.ts';
import type { GameControls } from '../game/belief/controls.ts';
import type { Chart } from '../view3d/map/MapHolo.ts';
import type { Hotspot, ViewMode } from '../view3d/room/layout.ts';
import { RoomView } from '../view3d/room/RoomView.ts';
import type { LossStage } from '../view3d/room/RoomView.ts';
import { createHandsOn } from './hands.ts';

/** What the room's overlays need to know about the view. */
export interface RoomUi {
  readonly mode: ViewMode;
  readonly region: boolean;
  readonly hot: Hotspot | null;
  readonly locked: boolean;
  /** The console's screen is up (the camera has arrived over it). */
  readonly consoleUp: boolean;
  readonly loss: LossStage | null;
}

export const INITIAL_UI: RoomUi = {
  mode: 'room',
  region: false,
  hot: null,
  locked: false,
  consoleUp: false,
  loss: null,
};

/** Seconds between refreshes of the instruments laid over the scene. */
const INSTRUMENT_PERIOD = 0.2;

export interface RunningRoom {
  readonly view: RoomView;
  stop(): void;
}

export function startControlRoom(
  canvas: HTMLCanvasElement,
  labels: HTMLElement,
  game: GameControls,
  desk: Desk,
  patch: (change: Partial<RoomUi>) => void,
): RunningRoom {
  const view = new RoomView(canvas, labels, game.ship, {
    mode: (mode, region) => patch({ mode, region, consoleUp: false }),
    hot: (hot) => patch({ hot }),
    pointerLock: (locked) => patch({ locked }),
    consoleArrived: () => patch({ consoleUp: true }),
    loss: (stage) => {
      patch({ loss: stage === 'end' ? null : stage });
      // Roguelikes are cruel: at the door again, at the beginning (A9).
      if (stage === 'reset' && game.status().phase === 'ended') game.restart();
    },
    flightPick: (id) => desk.select(id),
    blackBox: () => desk.setPage('blackbox'),
  });
  desk.keys = view.keys;
  const hands = createHandsOn(game);

  let raf = 0;
  let last = performance.now();
  let sinceInstruments = 0;
  let sinceChart = Infinity;
  let chart: Chart = buildChart(game, game.blackBox.archive());
  let attemptSeen = '';
  let endHandled = '';
  let coasting = false;

  /** Hands off the controls: issue the coasting forecast, frozen (P10). */
  const coast = (): void => {
    const status = game.status();
    if (status.committing || coasting || status.phase === 'ended') return;
    if (status.pending > 0) {
      // A plan is still scheduled and committing would cancel it: show a draft instead.
      void game.preview({ name: 'coast', items: [] }).then(
        (draft) => {
          desk.preview = draft;
        },
        () => undefined,
      );
      return;
    }
    coasting = true;
    desk.preview = undefined;
    const done = (): void => {
      coasting = false;
    };
    game.commit({ name: 'coast', items: [] }).then(done, done);
  };

  const frame = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;

    let status = game.status();
    if (status.attemptId !== attemptSeen) {
      const first = attemptSeen === '';
      attemptSeen = status.attemptId;
      desk.newAttempt();
      // Time passes while the player is in the room (owner): start the clock at 1×.
      game.setWarp(1);
      game.setPaused(false);
      if (!first) {
        // The attempt before this one ended: its debrief is on the console, and the player
        // walks back in from the door (A9). A Recall arrives here without a loss sequence.
        const before = game.blackBox.archive().attempts.filter((a) => a.id !== status.attemptId).at(-1);
        if (before) desk.debriefOf = before.id;
        desk.page = 'blackbox';
        if (!view.dying()) view.lose(false);
      }
    }
    if (!view.dying()) game.advance(dt);
    status = game.status();
    const snapshot = game.snapshot();

    const flying = view.mode() === 'flight' && !view.dying() && status.phase !== 'ended';
    const hand = hands.update(view.keys, flying, dt);
    if (hand.coast && flying) coast();

    if (status.phase === 'ended' && endHandled !== status.attemptId) {
      endHandled = status.attemptId;
      hands.release();
      desk.debriefOf = status.attemptId;
      desk.page = 'blackbox';
      // Loss of the ship: shake, black, the door. A completed attempt waits on the console.
      if (status.outcome.kind === 'lost') view.lose(true);
      desk.notify();
    }

    sinceChart += dt;
    if (sinceChart > 1) {
      sinceChart = 0;
      chart = buildChart(game, game.blackBox.archive());
    }
    view.frame(dt, {
      snapshot,
      ...(desk.preview ? { preview: desk.preview } : {}),
      selected: desk.selected,
      clearance: desk.design.clearance,
      hands: { yaw: hand.input.yaw, pitch: hand.input.pitch },
      chart,
      recording: !status.paused && status.phase !== 'ended',
    });

    const miss = view.flight.miss();
    desk.sample(dt, snapshot, miss?.metres ?? null);
    sinceInstruments += dt;
    if (sinceInstruments >= INSTRUMENT_PERIOD) {
      sinceInstruments = 0;
      desk.flightAlerts = view.flight.alerts();
      desk.flightMiss = miss;
      desk.notify();
    }
  };
  const loop = (now: number): void => {
    raf = requestAnimationFrame(loop);
    frame(now);
  };
  raf = requestAnimationFrame(loop);

  // Development only: a handle for the browser console and for scripted checks, and a way to
  // open straight into a view (?view=flight, ?view=console&page=model). `step` runs frames by
  // hand, for when the page is in the background and the browser holds its animation frames.
  if (import.meta.env.DEV) {
    const step = (frames = 1, seconds = 1 / 60): void => {
      for (let i = 0; i < frames; i++) {
        last = performance.now() - seconds * 1000;
        frame(performance.now());
      }
    };
    (window as unknown as { __recursion?: unknown }).__recursion = { game, desk, view, step };
    const query = new URLSearchParams(window.location.search);
    const wanted = query.get('view');
    if (wanted === 'map' || wanted === 'ship' || wanted === 'console' || wanted === 'flight')
      view.go(wanted, true);
    const page = query.get('page');
    if (page === 'mission' || page === 'plan' || page === 'model' || page === 'blackbox' || page === 'systems')
      desk.page = page;
  }

  return {
    view,
    stop() {
      cancelAnimationFrame(raf);
      hands.release();
      view.dispose();
    },
  };
}
