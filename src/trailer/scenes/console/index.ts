/** A17/A21's own Earth and standing pose; the live FLIGHT ship over it is explicitly staged. */
import type { ViewSnapshot } from '../../../contracts/index.ts';
import { fromYaw } from '../../../lib/quat.ts';
import { roomMotion } from '../../../theme/index.ts';
import { HOME_SHOT, createHomeWindow } from '../../../view3d/opening/home.ts';
import type { RoomFrame } from '../../../view3d/room/RoomView.ts';
import type { SceneFactory } from '../../scene.ts';
import { roomScene } from '../../rig/index.ts';
import capture from '../wells/fixture.json';

const source = capture.snapshot as unknown as ViewSnapshot;
const chart = { regions: [], corridors: [], leads: [] };
function consoleFrame(local: number): RoomFrame {
  return {
    chart,
    recording: false,
    clearance: 0,
    snapshot: {
      ...source,
      t: 0,
      objectives: [],
      forecasts: [],
      trail: [],
      coverage: { cones: [] },
      world: {
        ...source.world,
        fields: [],
        bodies: [],
        asteroids: [],
        ship: {
          ...source.world.ship,
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          angularVelocity: { x: 0, y: 0, z: 0 },
          // Slowly turn the staged ship symbol in a chart-up, level projection.
          attitude: fromYaw(Math.PI / 2 + (local * roomMotion.frameOrbit) / roomMotion.travel),
        },
      },
    },
  };
}

export const createScene: SceneFactory = () => {
  let home: ReturnType<typeof createHomeWindow> | undefined;
  return roomScene(
    'console',
    (_beat, local) => ({
      data: consoleFrame(local),
      camera: HOME_SHOT,
      scenery: home!.scenery,
      range: 160_000,
      headingUp: false,
    }),
    () => {
      home = createHomeWindow();
      home.setLens(null);
    },
    () => home?.dispose(),
  );
};
