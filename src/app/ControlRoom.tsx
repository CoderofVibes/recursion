/**
 * The control room: the game's one screen (DECISIONS A8). It mounts the walkable room and its
 * four views, starts the frame loop (loop.ts), and lays the instruments over the scene: the
 * cursor while walking, the flight, ship and map instruments beside their holograms, the
 * console's screen when the player looks down into it, and the loss screen.
 *
 * Belief side only: the game is reached through `GameControls`.
 */
import { useEffect, useRef, useState } from 'react';
import { ConsoleScreen } from '../console/ConsoleScreen.tsx';
import { Desk, useDesk } from '../console/desk.ts';
import { FlightHud } from '../console/FlightHud.tsx';
import { MapPlate } from '../console/MapPlate.tsx';
import { ShipPanels } from '../console/ShipPanels.tsx';
import type { GameControls } from '../game/belief/controls.ts';
import { applyTheme } from '../theme/index.ts';
import { HOTSPOT_NAME } from '../view3d/room/layout.ts';
import type { ViewMode } from '../view3d/room/layout.ts';
import type { RoomView } from '../view3d/room/RoomView.ts';
import { AVAILABLE } from './hands.ts';
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
    const running = startControlRoom(canvas, labels, game, desk, (change) =>
      setUi((u) => ({ ...u, ...change })),
    );
    setRoom(running.view);
    return () => {
      running.stop();
      setRoom(null);
    };
  }, [game, desk]);

  const status = game.status();
  const title =
    ui.mode === 'map' && ui.region ? `MAP  ›  ${game.briefing.name.toUpperCase()}` : TITLE[ui.mode];
  const dying = ui.loss !== null;

  return (
    <main
      className="cr"
      data-mode={ui.mode}
      data-locked={ui.locked ? '1' : '0'}
      data-dying={ui.loss === 'start' ? '' : undefined}
      data-lost={dying && ui.loss !== 'start' && ui.loss !== 'fade' ? '' : undefined}
    >
      <canvas ref={canvasRef} className="cr-gl" />
      <div ref={labelsRef} className="cr-labels" />

      {/* The only thing on screen while walking: a small dot that opens when it finds something. */}
      <div className="cr-reticle" data-hot={ui.hot ? '' : undefined}>
        <i />
        <span>{ui.hot ? HOTSPOT_NAME[ui.hot] : ''}</span>
      </div>

      <div className="cr-hud" data-hidden={dying ? '' : undefined}>
        <div className="cr-title">{title}</div>
        {ui.mode !== 'room' && ui.mode !== 'console' ? (
          <div className="cr-back">ESC ▸ STEP BACK</div>
        ) : null}
        {ui.mode === 'room' && !ui.locked ? (
          <div className="cr-hint">CLICK TO LOOK · WASD TO WALK · AIM AT THE CONSOLE</div>
        ) : null}
        {ui.mode === 'flight' && room ? (
          <FlightHud
            desk={desk}
            available={AVAILABLE}
            headingUp={room.flight.headingUp()}
            range={room.flight.range()}
            onHeadingUp={() => {
              room.flight.setHeadingUp(!room.flight.headingUp());
              desk.notify();
            }}
          />
        ) : null}
        {ui.mode === 'ship' && room ? <ShipPanels desk={desk} holo={room.ship} /> : null}
        {ui.mode === 'map' && room ? (
          <MapPlate
            desk={desk}
            holo={room.map}
            region={ui.region}
            onRegion={(on) => room.setRegion(on)}
          />
        ) : null}
      </div>

      <ConsoleScreen desk={desk} visible={ui.mode === 'console' && ui.consoleUp && !dying} />

      {/* Loss of the ship: black, then one orange pip that survives. */}
      <div className="cr-black" data-stage={ui.loss ?? undefined}>
        <i />
        <span>ATTEMPT {status.attemptIndex + (status.phase === 'ended' ? 1 : 0)}</span>
      </div>
      <div className="cr-hit" />
    </main>
  );
}
