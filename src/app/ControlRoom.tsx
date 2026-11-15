/**
 * The control room: the game's one screen (DECISIONS A8). It mounts the walkable room and its
 * four views, starts the frame loop (loop.ts), and lays the instruments over the scene: the
 * cursor while walking, the flight, ship and map instruments beside their holograms, the
 * console's screen when the player looks down into it, and the loss screen.
 *
 * Belief side only: the game is reached through `GameControls`.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ConsoleScreen } from '../console/ConsoleScreen.tsx';
import { Desk, useDesk } from '../console/desk.ts';
import { loadEncounterPanels } from '../console/encounterPanels.ts';
import { FlightHud } from '../console/FlightHud.tsx';
import { MapPlate } from '../console/MapPlate.tsx';
import { ShipPanels } from '../console/ShipPanels.tsx';
import type { GameControls } from '../game/belief/controls.ts';
import { applyTheme } from '../theme/index.ts';
import { HOTSPOT_NAME, PADS } from '../view3d/room/layout.ts';
import type { ViewMode } from '../view3d/room/layout.ts';
import type { RoomView } from '../view3d/room/RoomView.ts';
import { AVAILABLE } from './hands.ts';
import { onSoundMuted, setSoundMuted, soundMuted } from './sound.ts';

/** Before the encounter the flight controls do not answer (A12). */
const NOT_YET = { throttle: false, yaw: false, pitch: false, translate: false } as const;
import { INITIAL_UI, startControlRoom } from './loop.ts';
import type { RoomUi } from './loop.ts';
import '../console/console.css';
import './control-room.css';

export interface ControlRoomProps {
  readonly game: GameControls;
  /** The last failed model call, if any. */
  readonly modelError?: () => string | undefined;
  /** Delete the saved records (the page reloads afterwards). */
  readonly erase?: () => Promise<void>;
}

/** What the scene surface is for, in each view, for assistive technology. */
const SCENE_LABEL: Readonly<Record<ViewMode, string>> = {
  room: 'Control room. W A S D to walk; 1 map, 2 ship, 3 console, 4 flight',
  map: 'Map hologram. Escape steps back',
  ship: 'Ship hologram. Escape steps back',
  console: 'Console',
  flight:
    'Flight hologram. W main engine, S retro, A D sideways, R F up and down, Q E yaw, arrows pitch, X cut; Escape steps back',
};

const TITLE: Readonly<Record<ViewMode, string>> = {
  room: '',
  map: 'MAP',
  ship: 'SHIP',
  console: '',
  flight: 'FLIGHT',
};

export function ControlRoom({ game, modelError, erase }: ControlRoomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [desk] = useState(() => new Desk(game, modelError, erase));
  const [room, setRoom] = useState<RoomView | null>(null);
  const [ui, setUi] = useState<RoomUi>(INITIAL_UI);
  useDesk(desk);

  useEffect(() => {
    const canvas = canvasRef.current;
    const labels = labelsRef.current;
    if (!canvas || !labels) return;
    applyTheme(document.documentElement);
    loadEncounterPanels();
    const running = startControlRoom(canvas, labels, game, desk, (change) =>
      setUi((u) => ({ ...u, ...change })),
    );
    setRoom(running.view);
    return () => {
      running.stop();
      setRoom(null);
    };
  }, [game, desk]);

  // Focus follows the view (S9 R9): the console's current page tab once the screen is up, the
  // scene in the holograms, and back in the room the route the player left by, or the room.
  const seen = useRef<{ mode: ViewMode; loss: RoomUi['loss']; route: string | null }>({
    mode: INITIAL_UI.mode,
    loss: null,
    route: null,
  });
  useEffect(() => {
    const was = seen.current;
    seen.current = { mode: ui.mode, loss: ui.loss, route: was.route };
    const canvas = canvasRef.current;
    if (!canvas || ui.loss !== null) return;
    const active = document.activeElement as HTMLElement | null;
    if (was.mode === 'room' && ui.mode !== 'room')
      seen.current.route = active?.closest<HTMLElement>('.cr-route')?.dataset.pad ?? null;
    if (ui.mode === 'console') {
      if (ui.consoleUp)
        document.querySelector<HTMLElement>('.cs-tab[aria-current="page"]')?.focus();
      return;
    }
    if (was.loss !== null) {
      // Back at the door after a loss: the room itself.
      canvas.focus({ preventScroll: true });
      return;
    }
    if (ui.mode === was.mode) return;
    const route =
      ui.mode === 'room' && was.route
        ? document.querySelector<HTMLElement>(`.cr-route[data-pad="${was.route}"]`)
        : null;
    (route ?? canvas).focus({ preventScroll: true });
  }, [ui.mode, ui.consoleUp, ui.loss]);

  // Sound on or off (AU, R24): the switch below, the console's footer, and the M key.
  const muted = useSyncExternalStore(onSoundMuted, soundMuted, soundMuted);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        e.repeat ||
        e.key.toLowerCase() !== 'm' ||
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA'
      )
        return;
      setSoundMuted(!soundMuted());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const soundSwitch = (className: string) => (
    <button
      type="button"
      className={className}
      aria-pressed={muted}
      onClick={() => setSoundMuted(!muted)}
    >
      M ▸ SOUND {muted ? 'OFF' : 'ON'}
    </button>
  );

  const status = game.status();
  const title =
    ui.mode === 'map' && ui.region ? `MAP  ›  ${game.briefing.name.toUpperCase()}` : TITLE[ui.mode];
  const dying = ui.loss !== null;
  // Finished attempts Black Box holds, counted only while the loss screen is up.
  const kept = dying
    ? desk.archive().attempts.filter((a) => a.outcome.kind !== 'in-progress').length
    : 0;

  return (
    <main
      className="cr"
      data-mode={ui.mode}
      data-locked={ui.locked ? '1' : '0'}
      data-dying={ui.loss === 'start' ? '' : undefined}
      data-lost={dying && ui.loss !== 'start' && ui.loss !== 'fade' ? '' : undefined}
    >
      {/* The scene is a surface the keyboard can be on: walking, the stations, flying. */}
      <canvas
        ref={canvasRef}
        className="cr-gl"
        tabIndex={ui.mode === 'console' ? -1 : 0}
        role="application"
        aria-label={SCENE_LABEL[ui.mode]}
      />
      <div ref={labelsRef} className="cr-labels" />
      {/* One polite status line for what the console just did; never the clock (S9 R11). */}
      <div className="cr-status" role="status" aria-live="polite">
        {desk.note}
      </div>

      {/* The only thing on screen while walking: a small dot that opens when it finds something. */}
      <div className="cr-reticle" data-hot={ui.hot ? '' : undefined}>
        <i />
        <span>{ui.hot ? HOTSPOT_NAME[ui.hot] : ''}</span>
      </div>

      <div className="cr-hud" data-hidden={dying ? '' : undefined} inert={dying}>
        <div className="cr-title">{title}</div>
        {ui.mode !== 'console' ? soundSwitch('cr-sound') : null}
        {ui.mode !== 'room' && ui.mode !== 'console' ? (
          <button type="button" className="cr-back" onClick={() => room?.back()}>
            ESC ▸ STEP BACK
          </button>
        ) : null}
        {ui.mode === 'room' ? (
          // The four stations, by key or by click: the same routes as the pads on the console.
          <nav className="cr-routes" aria-label="Stations" data-locked={ui.locked ? '' : undefined}>
            {PADS.map((pad, i) => (
              <button
                key={pad}
                type="button"
                className="cr-route"
                data-pad={pad}
                tabIndex={ui.locked ? -1 : undefined}
                onClick={() => room?.go(pad)}
              >
                <kbd>{i + 1}</kbd>
                {HOTSPOT_NAME[pad]}
              </button>
            ))}
            <span className="cr-routes__hint">
              {ui.locked ? 'ESC FREES THE MOUSE' : 'CLICK TO LOOK · WASD TO WALK'}
            </span>
          </nav>
        ) : null}
        {ui.mode === 'flight' && room ? (
          <FlightHud
            desk={desk}
            available={status.phase === 'operate' ? AVAILABLE : NOT_YET}
            headingUp={room.flight.headingUp()}
            range={room.flight.range()}
            framing={room}
            onHeadingUp={() => {
              room.flight.setHeadingUp(!room.flight.headingUp());
              desk.notify();
            }}
          />
        ) : null}
        {ui.mode === 'ship' && room ? (
          <ShipPanels desk={desk} holo={room.ship} framing={room} />
        ) : null}
        {ui.mode === 'map' && room ? (
          <MapPlate
            desk={desk}
            holo={room.map}
            region={ui.region}
            onRegion={(on) => room.setRegion(on)}
            framing={room}
          />
        ) : null}
      </div>

      <ConsoleScreen
        desk={desk}
        visible={ui.mode === 'console' && ui.consoleUp && !dying}
        onBack={() => room?.back()}
        footerExtra={soundSwitch('cs-foot__back')}
      />

      {/* Loss of the ship: black, then one orange pip that survives. */}
      <div className="cr-black" data-stage={ui.loss ?? undefined}>
        <i />
        <span>
          ATTEMPT {status.attemptIndex + (status.phase === 'ended' ? 1 : 0)}
          {/* What survives, as a measured fact (S9 R6): nothing about what it means. */}
          {kept > 0 ? (
            <small>
              BLACK BOX RETAINED · {kept} ATTEMPT{kept === 1 ? '' : 'S'}
            </small>
          ) : null}
        </span>
      </div>
      <div className="cr-hit" />
    </main>
  );
}
