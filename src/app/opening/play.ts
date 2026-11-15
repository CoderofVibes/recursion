import { Euler, Vector3 } from 'three';
import type { GameControls } from '../../game/belief/controls.ts';
import { motion } from '../../theme/index.ts';
import { chartView } from '../../view3d/adapter.ts';
import { createHomeWindow, HOME_SHOT } from '../../view3d/opening/home.ts';
import { createOpeningPanel } from '../../view3d/opening/panel.ts';
import { DOOR, ROOM } from '../../view3d/room/layout.ts';
import { RoomView, type RoomFrame } from '../../view3d/room/RoomView.ts';
import { openingCues, sampleOpening, type OpeningCue, type OpeningFrame } from './sequence.ts';

export interface OpeningAudio {
  cue(id: OpeningCue): void;
  ambience(gain: number): void;
  hold(hidden: boolean): void;
  stop(): void;
}

interface OpeningPlayer {
  readonly game: GameControls;
  readonly canvas: HTMLCanvasElement;
  readonly labels: HTMLElement;
  readonly reduceMotion: () => boolean;
  readonly show: (frame: OpeningFrame) => void;
  readonly claim: (signal: AbortSignal) => Promise<boolean>;
  readonly bypass: () => void;
  readonly audio?: OpeningAudio;
}

/** The room renders a stable arrival snapshot. GameControls.advance is owned by live play. */
export function playOpening({
  game,
  canvas,
  labels,
  reduceMotion,
  show,
  claim,
  bypass,
  audio,
}: OpeningPlayer) {
  const ignore = () => {};
  const room = new RoomView(
    canvas,
    labels,
    game.ship,
    {
      mode: ignore,
      hot: ignore,
      pointerLock: ignore,
      consoleArrived: ignore,
      loss: ignore,
      flightPick: ignore,
      blackBox: ignore,
    },
    { scripted: true },
  );
  const home = createHomeWindow();
  const panel = createOpeningPanel();
  room.setWindowScenery(home.scenery);
  const arrival: RoomFrame = {
    snapshot: game.snapshot(),
    chart: chartView(game.chart()),
    recording: true,
    clearance: 0,
  };
  let raf = 0;
  let elapsed = 0;
  let previous: number | undefined;
  let claimed = false;
  let claiming = false;
  let stopped = false;
  let arrivalInstalled = false;
  const cancel = new AbortController();
  const eye = new Vector3(...HOME_SHOT.position);
  const at = new Vector3();
  const orientation = new Euler(...HOME_SHOT.rotation, 'YXZ');

  const draw = () => {
    const sampled = sampleOpening(elapsed, reduceMotion());
    if ((sampled.beat === 'arrival' && !arrivalInstalled) || sampled.beat === 'wake') {
      if (!arrivalInstalled) {
        arrivalInstalled = true;
        room.setWindowScenery(null);
      }
      const fromPitch = -0.12;
      room.frame(0, arrival, {
        position: [DOOR.x, ROOM.eye, DOOR.z],
        rotation: [fromPitch + (DOOR.pitch - fromPitch) * sampled.wake, DOOR.yaw, 0],
      });
    } else if (sampled.blackout === 0 && sampled.beat !== 'end') {
      const [pitch, yaw, roll] = sampled.rotation;
      at.set(...sampled.translation)
        .applyEuler(orientation)
        .add(eye);
      home.setLensing(sampled.lens);
      room.renderScriptedShot({
        position: [at.x, at.y, at.z],
        rotation: [HOME_SHOT.rotation[0] + pitch, yaw, roll],
        light: sampled.light,
        console: sampled.console === 'off' ? 0 : HOME_SHOT.console,
        alarm: sampled.alarm,
        consoleMap: panel.maps[sampled.console],
      });
    }
    audio?.ambience(sampled.ambience);
    show(sampled);
    return sampled.beat !== 'end';
  };
  const frame = (now: number) => {
    if (!claimed) {
      claiming = true;
      void claim(cancel.signal).then((play) => {
        claiming = false;
        if (cancel.signal.aborted) return;
        if (!play) {
          stopped = true;
          bypass();
          return;
        }
        claimed = true;
        if (!document.hidden) raf = requestAnimationFrame(frame);
      });
      return;
    }
    const before = elapsed;
    if (previous !== undefined) elapsed += Math.max(0, now - previous) / 1000;
    previous = now;
    // On a stalled frame, resume at the current picture and drop overdue one-shots.
    for (const cue of openingCues(Math.max(before, elapsed - motion.fast / 1000), elapsed))
      audio?.cue(cue.id);
    if (draw()) raf = requestAnimationFrame(frame);
    else stopped = true;
  };
  const visibility = () => {
    cancelAnimationFrame(raf);
    previous = undefined;
    audio?.hold(document.hidden);
    if (!document.hidden && !claiming && !stopped) raf = requestAnimationFrame(frame);
  };
  if (!document.hidden) raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', visibility);

  return () => {
    cancel.abort();
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', visibility);
    audio?.stop();
    room.setWindowScenery(null);
    panel.dispose();
    home.dispose();
    room.dispose();
  };
}
