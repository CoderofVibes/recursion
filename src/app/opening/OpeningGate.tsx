import { useEffect, useRef, useState } from 'react';
import { ControlRoom, type ControlRoomProps } from '../ControlRoom.tsx';
import {
  claimOpening,
  openingLaunch,
  readMotionPreference,
  resetOpening,
  saveMotionPreference,
} from './launch.ts';
import { playOpening, type OpeningAudio } from './play.ts';
import './opening.css';

interface OpeningGateProps extends ControlRoomProps {
  readonly saveSlot: string;
  /** True if the loaded save has recorded progress, including a pre-opening save. */
  readonly hasProgress: boolean;
  /** An explicit replay requested at launch. Only a previously viewed opening can replay. */
  readonly replay?: boolean;
  readonly openingAudio?: OpeningAudio;
}

/** Mount once per launched save, before mounting live play. Keep it mounted across recurrence. */
export function OpeningGate({
  game,
  modelError,
  erase,
  saveSlot,
  hasProgress,
  replay = false,
  openingAudio,
}: OpeningGateProps) {
  const [launch] = useState(() => openingLaunch(saveSlot, hasProgress, replay));
  const [finished, setFinished] = useState(launch === 'direct');
  const [initialMotion] = useState(readMotionPreference);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const curtain = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const motionOverride = useRef(initialMotion);

  useEffect(() => {
    if (finished || !canvas.current || !labels.current || !curtain.current || !title.current)
      return;
    const fade = curtain.current;
    const heading = title.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    return playOpening({
      game,
      canvas: canvas.current,
      labels: labels.current,
      reduceMotion: () => motionOverride.current ?? preference.matches,
      claim: (signal) =>
        launch === 'first' ? claimOpening(saveSlot, signal) : Promise.resolve(true),
      bypass: () => setFinished(true),
      audio: openingAudio,
      show(frame) {
        fade.style.opacity = String(frame.blackout);
        heading.style.opacity = String(frame.title);
        heading.hidden = frame.beat !== 'title';
        if (frame.beat === 'end') setFinished(true);
      },
    });
  }, [finished, game, launch, openingAudio, saveSlot]);

  if (finished)
    return (
      <ControlRoom
        game={game}
        modelError={modelError}
        erase={
          erase &&
          (async () => {
            await erase();
            resetOpening(saveSlot);
          })
        }
      />
    );

  return (
    <main className="rx-opening" aria-label="Opening cinematic">
      <canvas ref={canvas} className="rx-opening-canvas" aria-hidden="true" />
      <div ref={labels} className="rx-opening-labels" aria-hidden="true" />
      <div ref={curtain} className="rx-opening-black" />
      <h1 ref={title} className="rx-opening-title" hidden>
        RECURSION
      </h1>
      <div className="rx-opening-controls">
        <label>
          <input
            type="checkbox"
            defaultChecked={
              initialMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            }
            onChange={(event) => {
              motionOverride.current = event.currentTarget.checked;
              saveMotionPreference(event.currentTarget.checked);
            }}
          />
          Reduce motion
        </label>
        {launch === 'replay' && (
          <button type="button" onClick={() => setFinished(true)}>
            Skip opening
          </button>
        )}
      </div>
    </main>
  );
}
