import type { SceneFactory } from '../../scene.ts';
import { roomScene } from '../../rig/index.ts';
import { replay, type Recording } from '../../rig/recording.ts';
import { strainedCamera } from '../../rig/motion.ts';
import capture from './fixture.json';

export const createScene: SceneFactory = () => {
  const flight = replay(capture as unknown as Recording);
  return roomScene('slingshot', (beat, local) => ({
    data: flight.frame(flight.from + ((flight.to - flight.from) * local) / beat.length),
    camera: strainedCamera(local, 0.5),
    range: 1_500_000,
    hologram: false,
  }));
};
