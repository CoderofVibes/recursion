import { Group, Vector3 } from 'three';
import type { BelievedField, JsonValue } from '../../../contracts/index.ts';
import { holoSize, motion } from '../../../theme/index.ts';
import { pixelsPerUnit } from '../../../theme/three/index.ts';
import { HOME_SHOT } from '../../../view3d/opening/home.ts';
import { HOLO, VIEW } from '../../../view3d/room/layout.ts';
import { attitudeToScene, toScene } from '../../../view3d/adapter.ts';
import { LineSet } from '../../../view3d/gfx.ts';
import { makeLatticeView } from '../../../view3d/fields/lattice/LatticeView.ts';
import type { LatticeVisual } from '../../../view3d/fields/lattice/data.ts';
import type { SceneFactory } from '../../scene.ts';
import { roomScene } from '../../rig/index.ts';
import { replay, type Recording } from '../../rig/recording.ts';
import { LOCAL_STRIKE } from './light.ts';
import capture from './fixture.json';

const ease = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
};

export const createScene: SceneFactory = () => {
  // Freeze the real final eye state for the look down/up, then play the game's damage at 1x.
  const data = replay(capture as unknown as Recording).frame(capture.provenance.lossAt);
  const range = 900;
  const scale = holoSize.radius / range;
  const overlay = new Group(),
    environment = new Group();
  overlay.position.z = holoSize.radius * holoSize.setBack;
  overlay.quaternion.copy(attitudeToScene(data.snapshot.world.ship.attitude)).invert();
  overlay.add(environment);
  environment.scale.setScalar(scale);
  environment.position.copy(toScene(data.snapshot.world.ship.position)).multiplyScalar(-scale);
  const lines = new LineSet();
  const view = makeLatticeView({ group: environment, lines });
  const t = data.snapshot.t;
  const visual: LatticeVisual = {
    schema: 'lattice-observations-v1',
    attemptId: 'trailer-staged-lattice',
    frameId: 'truth-layout-not-acquired',
    updatedAt: t,
    enabled: true,
    quality: 1,
    processing: { reportedAt: t, validUntil: t, available: true },
    requestedVolume: {
      center: data.snapshot.world.ship.position,
      halfSize: { x: range, y: range, z: range },
    },
    coverage: [],
    strands: capture.layers.flatMap((layer) =>
      layer.strands.map((strand) => ({
        id: strand.id,
        points: [strand.a, strand.b],
        sigmaM: 0,
        confidence: 1,
        sampleIds: ['staged-not-acquired'],
        observedFrom: t,
        observedTo: t,
        validUntil: t,
      })),
    ),
  };
  const field: BelievedField = {
    id: 'tv-lattice',
    kind: 'lattice',
    detected: true,
    visual: visual as unknown as JsonValue,
  };
  const frame = {
    field,
    snapshot: data.snapshot,
    radius: holoSize.radius,
    scale,
    inside: () => false,
    dt: 0,
    time: 0,
  };
  return roomScene(
    'lattice',
    (_beat, local) => {
      const tilt = ease((local - 1.1) / (motion.settle / 1000));
      const camera = {
        ...HOME_SHOT,
        position: [0, 2.65 + (HOME_SHOT.position[1] - 2.65) * tilt, 1.4 - 0.7 * tilt] as const,
        rotation: [-0.58 + 0.62 * tilt, 0, 0] as const,
        alarm: local >= LOCAL_STRIKE ? 1 : 0,
      };
      lines.setResolution(window.innerWidth, window.innerHeight);
      lines.setPixelsPerUnit(
        pixelsPerUnit(
          VIEW.room.fov,
          new Vector3(...camera.position).distanceTo(new Vector3(HOLO.x, HOLO.y, HOLO.z)),
          window.innerHeight,
        ) * scale,
      );
      return {
        data,
        camera,
        range,
        windowLight: overlay,
        ...(local >= LOCAL_STRIKE ? { lossTime: local - LOCAL_STRIKE } : {}),
      };
    },
    () => {
      // The geometry appears fully acquired in the first frame; this is a staged reconstruction.
      view.update(frame);
      view.update({ ...frame, time: motion.settle / 1000 });
      // This explicitly staged truth diagram claims no measured coverage. Keep the strands,
      // but omit the live instrument's unresolved-volume hatching from the room composition.
      const unresolved = environment.getObjectByName('unresolved-volume');
      if (unresolved) unresolved.visible = false;
    },
    () => {
      view.dispose();
      lines.dispose();
    },
  );
};
