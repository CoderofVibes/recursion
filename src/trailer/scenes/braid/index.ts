import type { SceneFactory } from '../../scene.ts';
import { roomScene } from '../../rig/index.ts';
import { strainedCamera } from '../../rig/motion.ts';
import { replay, type Recording } from '../../rig/recording.ts';
import { BRAID_ROOM_LEVEL } from '../lattice/light.ts';
import capture from '../lattice/fixture.json';
import { createBraid } from './scenery.ts';

export const createScene: SceneFactory = () => {
  const data = replay(capture as unknown as Recording).frame(capture.provenance.lossAt);
  let braid: ReturnType<typeof createBraid>;
  return roomScene(
    'braid',
    (_beat, local) => {
      braid.sample(local);
      return {
        data,
        camera: { ...strainedCamera(local, 0.25), light: BRAID_ROOM_LEVEL, alarm: 1 },
        scenery: braid.scenery,
        range: 900,
        hologram: false,
      };
    },
    () => {
      braid = createBraid();
    },
    () => braid?.dispose(),
  );
};
