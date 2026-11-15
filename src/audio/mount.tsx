import { useEffect, useMemo } from 'react';
import { ControlRoom, type ControlRoomProps } from '../app/ControlRoom.tsx';
import { OpeningGate } from '../app/opening/OpeningGate.tsx';
import type { appOpening } from '../app/opening/launch.ts';
import type { OpeningAudio } from '../app/opening/play.ts';
import type { AttemptId, ViewSnapshot } from '../contracts/index.ts';
import type { GameControls, SessionStatus } from '../game/belief/controls.ts';
import { sources } from './catalogue.ts';
import { soundAvailable } from './index.ts';
import { startMixer, type Mixer } from './mixer.ts';
import { openingRoomGain, playRoom } from './room.ts';

interface Props {
  readonly room: ControlRoomProps;
  readonly opening: ReturnType<typeof appOpening>;
}

/** Reuse the room's samples instead of building a second snapshot on the audio clock. */
function audioBridge(base: GameControls) {
  let status: SessionStatus | undefined;
  let snapshot: ViewSnapshot | undefined;
  let mixer: Mixer | undefined;

  const game = Object.create(base, {
    status: { value: () => (status = base.status()) },
    snapshot: { value: () => (snapshot = base.snapshot()) },
  }) as GameControls;

  const openingAudio: OpeningAudio = {
    cue: (id) => {
      if (id === 'black-cut') mixer?.stopShots();
      mixer?.shot(id);
    },
    ambience: (gain) => mixer?.bed('room-hum', openingRoomGain(gain)),
    hold: (hidden) => mixer?.hold(hidden),
    stop: () => mixer?.stopShots(),
  };

  function mount(): () => void {
    const audio = startMixer();
    mixer = audio;
    const engine = base.ship.equipment.find((item) => item.id === 'main-engine');
    const live = playRoom(audio, base.briefing.id, engine?.params.thrust || 1);
    const { blackBox } = base;
    const record = blackBox.record;
    let damagedAttempt: AttemptId | undefined;
    // Use the live batches the ship already reports. Reading the growing archive here would
    // copy its measurement history during warp; one pending cue coalesces faults and trips.
    const recordWithDamage: typeof record = (batch) => {
      record.call(blackBox, batch);
      if (
        !document.hidden &&
        batch.events.some((e) => e.kind === 'equipment-fault' || e.kind === 'breaker-trip')
      ) {
        damagedAttempt = batch.attemptId;
      }
    };
    if (sources.has('equipment-damage')) blackBox.record = recordWithDamage;
    const click = (event: MouseEvent): void => {
      if (!(event.target instanceof Element) || !event.isTrusted) return;
      if (event.target.closest('.cr button:not(:disabled)')) audio.shot('console-click');
    };
    document.addEventListener('click', click);

    // The loss overlay exposes the same authored stages the player sees. Audio consumes those
    // edges, so an obscured tab or a stalled frame cannot advance a second cinematic clock.
    const timer = window.setInterval(() => {
      const damaged = damagedAttempt !== undefined && damagedAttempt === status?.attemptId;
      damagedAttempt = undefined;
      if (document.hidden || !status || !snapshot) return;
      const overlay = document.querySelector<HTMLElement>('.cr-black');
      if (overlay) live(status, snapshot, overlay, damaged);
    }, 50);

    return () => {
      clearInterval(timer);
      document.removeEventListener('click', click);
      if (blackBox.record === recordWithDamage) blackBox.record = record;
      audio.dispose();
      mixer = undefined;
    };
  }

  return { game, openingAudio, mount };
}

function WithSound({ room, opening }: Props) {
  const bridge = useMemo(() => audioBridge(room.game), [room.game]);
  useEffect(() => bridge.mount(), [bridge]);
  const props = { ...room, game: bridge.game };
  return opening ? (
    <OpeningGate {...props} {...opening} openingAudio={bridge.openingAudio} />
  ) : (
    <ControlRoom {...props} />
  );
}

export function AudioMount({ room, opening }: Props) {
  if (soundAvailable()) return <WithSound room={room} opening={opening} />;
  return opening ? <OpeningGate {...room} {...opening} /> : <ControlRoom {...room} />;
}
