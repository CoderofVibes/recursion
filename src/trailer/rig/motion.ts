import { lossSequence, motion, roomMotion } from '../../theme/index.ts';
import { HOME_SHOT } from '../../view3d/opening/home.ts';
import type { RoomShot } from '../../view3d/opening/shot.ts';

/** Smooth, continuous hull strain; amplitude and cadence derive from the room's theme. */
export function strainedCamera(local: number, strength = 1): RoomShot {
  const lift =
    lossSequence.shake *
    strength *
    (Math.sin(local * roomMotion.ease * Math.PI * 2) +
      Math.sin((local * Math.PI * 2) / roomMotion.travel) * motion.cameraDamping);
  const roll = lossSequence.roll * strength * Math.sin((local * Math.PI * 2) / roomMotion.travel);
  return {
    ...HOME_SHOT,
    // Forward panes dominate; the console's lip still anchors the bottom of the frame.
    position: [0, HOME_SHOT.position[1] + lift, 0.7],
    rotation: [0.04, 0, roll],
  };
}
