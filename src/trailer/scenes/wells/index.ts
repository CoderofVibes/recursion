import { HOME_SHOT } from '../../../view3d/opening/home.ts';
import { Group } from 'three';
import { HOLO } from '../../../view3d/room/layout.ts';
import { attitudeToScene, toScene } from '../../../view3d/adapter.ts';
import { makeFunnelLight } from '../../../view3d/fx/funnels.ts';
import { holoSize, motion } from '../../../theme/index.ts';
import { LineSet } from '../../../view3d/gfx.ts';
import type { FieldView } from '../../../view3d/fieldViews.ts';
import type { SceneFactory } from '../../scene.ts';
import { roomScene } from '../../rig/index.ts';
import { stagedFields, wellsFrame } from './state.ts';
import { makeStagedWell } from './hologram.ts';
import { detailedOptics } from './optics.ts';

export const createScene: SceneFactory = () => {
  // Native VX renderer, prebuilt at the centre of the turn. Its 150-degree cull exceeds the
  // camera's whole swept view. Freezing the front buffer removes wall-clock rebuild history.
  const light = makeFunnelLight({ displayRadius: 3030, sliceMs: Number.MAX_SAFE_INTEGER });
  const camera = {
    ...HOME_SHOT,
    position: [0, 1.9, 1.65] as const,
    rotation: [-0.14, 0, 0] as const,
  };
  const middle = wellsFrame(1.25);
  const overlay = new Group();
  const turn = new Group();
  const environment = new Group();
  const range = 600_000;
  const scale = holoSize.radius / range;
  const lines = new LineSet();
  const views: FieldView[] = [];
  overlay.add(light.object, turn);
  turn.add(environment);
  turn.position.z = holoSize.radius * holoSize.setBack;
  environment.scale.setScalar(scale);
  environment.position.copy(toScene(middle.snapshot.world.ship.position)).multiplyScalar(-scale);
  return roomScene(
    'wells',
    (_beat, local) => {
      const data = wellsFrame(local);
      light.object.position.set(
        camera.position[0] - HOLO.x,
        camera.position[1] - HOLO.y,
        camera.position[2] - HOLO.z,
      );
      light.object.quaternion.copy(attitudeToScene(data.snapshot.world.ship.attitude)).invert();
      turn.quaternion.copy(light.object.quaternion);
      return {
        data: {
          ...data,
          snapshot: { ...data.snapshot, world: { ...data.snapshot.world, fields: [] } },
        },
        camera,
        range,
        windowLight: overlay,
      };
    },
    () => {
      for (const field of stagedFields) {
        const group = new Group();
        environment.add(group);
        const view = makeStagedWell({ group, lines });
        view.update({
          field,
          snapshot: middle.snapshot,
          scale,
          radius: holoSize.radius,
          inside: () => true,
          dt: 0,
          time: 0,
        });
        views.push(view);
      }
      light.update(
        detailedOptics(),
        middle.snapshot.t,
        attitudeToScene(middle.snapshot.world.ship.attitude).invert(),
        motion.settle,
      );
    },
    () => {
      light.dispose();
      for (const view of views) view.dispose();
      lines.dispose();
    },
  );
};
