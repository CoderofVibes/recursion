/**
 * The control room's frame loop. Each animation frame it advances the game, takes `snapshot()`,
 * flies the ship from the flight keys, and hands the room what to draw.
 *
 * - Time (A12): a new attempt waits at arrival while the player prepares, as long as they
 *   like; ENTER starts the encounter at 1×. Inside it there is no pause, only warp from 1× up.
 *   A hidden page holds the game until it is shown again, and a new alert drops warp to 1×.
 * - Hands off the flight controls: the game issues a coasting forecast, frozen (P10).
 * - When an attempt ends, the room plays the way back to the door (A9), and Black Box has the
 *   debrief ready on the console.
 *
 * Belief side only: the game is reached through `GameControls`.
 */
import { flightAlerts, freshAlerts } from '../console/alerts.ts';
import type { Desk } from '../console/desk.ts';
import { isHandsOnNeutral } from '../contracts/index.ts';
import type { GameControls } from '../game/belief/controls.ts';
import { chartView } from '../view3d/adapter.ts';
import type { Chart } from '../view3d/map/MapHolo.ts';
import type { Hotspot, ViewMode } from '../view3d/room/layout.ts';
import { rangeMinFor } from '../view3d/flight/FlightHolo.ts';
import { RoomView } from '../view3d/room/RoomView.ts';
import type { LossStage } from '../view3d/room/RoomView.ts';
import { coastCadence } from '../theme/index.ts';
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
  // Some encounters are studied at close range: FLIGHT may zoom in that far there (3C, R4).
  view.flight.setRangeMin(rangeMinFor(game.briefing.id));
  const hands = createHandsOn(game);

  let raf = 0;
  let last = performance.now();
  let sinceInstruments = 0;
  let sinceChart = Infinity;
  let chart: Chart = chartView(game.chart());
  let attemptSeen = '';
  let endHandled = '';
  let alertsShowing: ReadonlySet<string> = new Set();

  // A20: while coasting at high warp with nobody at the controls, draw fewer frames so the
  // simulation gets more of each wall second. Any input, or warp dropping, draws every frame.
  let lastInput = performance.now();
  let lastDraw = 0;
  let sinceDraw = 0;
  let sinceNotify = 0;
  const touched = (): void => {
    lastInput = performance.now();
  };
  const inputs = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const;
  for (const type of inputs) window.addEventListener(type, touched, { passive: true });

  // A hidden page holds the game (A12) and lets it go when the page is shown again.
  let heldByPage = false;
  const onVisibility = (): void => {
    const status = game.status();
    if (document.hidden) {
      if (status.phase === 'operate' && !status.paused) {
        game.setPaused(true);
        heldByPage = true;
      }
    } else if (heldByPage) {
      heldByPage = false;
      last = performance.now();
      game.setPaused(false);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const frame = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;

    let status = game.status();
    if (status.attemptId !== attemptSeen) {
      const first = attemptSeen === '';
      attemptSeen = status.attemptId;
      desk.newAttempt();
      // The attempt waits at arrival until the player enters (A12).
      game.setWarp(1);
      alertsShowing = new Set();
      if (!first) {
        // The attempt before this one ended: its debrief is on the console, and the player
        // walks back in from the door (A9). A Recall arrives here without a loss sequence.
        const before = game.blackBox
          .archive()
          .attempts.filter((a) => a.id !== status.attemptId)
          .at(-1);
        if (before) desk.debriefOf = before.id;
        desk.page = 'blackbox';
        if (!view.dying()) view.lose(false);
      }
    }
    if (!view.dying()) game.advance(dt);
    status = game.status();

    // The flight controls answer only inside the encounter.
    const flying = view.mode() === 'flight' && !view.dying() && status.phase === 'operate';
    const warpBefore = status.warp;
    const hand = hands.update(view.keys, flying, dt);
    // Flying by hand runs at 1× (a burn lasts as long as the key is held): say so beside time.
    if (warpBefore > 1 && game.status().warp === 1) desk.dropWarp('flying by hand');
    // The player raised warp again: the last reason it dropped no longer applies.
    else if (desk.warpDrop && game.status().warp > 1) desk.warpDrop = null;

    if (status.phase === 'ended' && endHandled !== status.attemptId) {
      endHandled = status.attemptId;
      hands.release();
      desk.debriefOf = status.attemptId;
      desk.page = 'blackbox';
      // Loss of the ship: shake, black, the door. A completed attempt waits on the console.
      if (status.outcome.kind === 'lost') view.lose(true);
      desk.notify();
    }

    // A20: a quiet coast at high warp draws only every so often; the game, the keys and the
    // alerts above and below run every frame regardless.
    sinceDraw += dt;
    const coasting =
      status.phase === 'operate' &&
      !status.paused &&
      game.status().warp >= coastCadence.warp &&
      isHandsOnNeutral(hand.input) &&
      view.settled() &&
      now - lastInput > coastCadence.quietAfterInput;
    if (coasting && now - lastDraw < 1000 / coastCadence.drawRate) {
      instruments(dt, true);
      return;
    }
    lastDraw = now;
    const drawDt = Math.min(0.1, sinceDraw);
    sinceDraw = 0;
    const snapshot = game.snapshot();
    desk.setFrame(snapshot);

    sinceChart += drawDt;
    if (sinceChart > 1) {
      sinceChart = 0;
      chart = chartView(game.chart());
    }
    view.frame(drawDt, {
      snapshot,
      ...(desk.preview ? { preview: desk.preview } : {}),
      selected: desk.selected,
      clearance: desk.design.clearance,
      hands: { yaw: hand.input.yaw, pitch: hand.input.pitch },
      chart,
      recording: !status.paused && status.phase !== 'ended',
    });

    desk.sample(drawDt, snapshot, view.flight.miss()?.metres ?? null);
    instruments(dt, coasting);
  };

  /** The instruments' refresh and A12's alert rule: every frame, drawn or not. */
  const instruments = (dt: number, coasting: boolean): void => {
    const status = game.status();
    const miss = view.flight.miss();
    sinceInstruments += dt;
    if (sinceInstruments >= INSTRUMENT_PERIOD) {
      sinceInstruments = 0;
      desk.flightAlerts = view.flight.alerts();
      desk.flightMiss = miss;
      // A new alert drops warp to 1× (A12): the player meets it in real time.
      const seen = freshAlerts(alertsShowing, flightAlerts(desk));
      alertsShowing = seen.active;
      const first = seen.fresh[0];
      if (first && status.phase === 'operate' && game.status().warp > 1) {
        game.setWarp(1);
        desk.dropWarp(first.text.toLowerCase());
      }
      // The instruments redraw less often on a quiet coast (A20); an alert above has already
      // dropped warp, so the next refresh is a full one.
      sinceNotify += INSTRUMENT_PERIOD;
      if (!coasting || sinceNotify >= 1 / coastCadence.instrumentRate || game.status().warp === 1) {
        sinceNotify = 0;
        desk.notify();
      }
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
    if (
      page === 'mission' ||
      page === 'plan' ||
      page === 'model' ||
      page === 'blackbox' ||
      page === 'systems' ||
      page === 'credits'
    )
      desk.page = page;
  }

  return {
    view,
    stop() {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const type of inputs) window.removeEventListener(type, touched);
      hands.release();
      view.dispose();
    },
  };
}
