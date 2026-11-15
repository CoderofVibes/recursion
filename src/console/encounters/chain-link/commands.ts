import type { Command } from '../../../contracts/index.ts';
import type { Vec3 } from '../../../lib/index.ts';
import type { ReconstructionMode } from './ChainLinkPanel.tsx';

/**
 * Existing installed equipment only. These are requests; actual delivered service is read
 * back from telemetry. Switching off processing leaves the camera and recorder available.
 *
 * `ahead` is the inertial direction the camera's mount looks along, as the ship believes its
 * attitude. The function images what lies ahead, so switching it on takes the camera and holds
 * it there: a camera left on a target elsewhere (ENTER sets the ship up as designed, and the
 * design's default points the camera at the Survey rock, which falls behind) records frames
 * with no strands in them, and the model has nothing to rebuild.
 */
export function latticeModeCommands(mode: ReconstructionMode, ahead?: Vec3): readonly Command[] {
  if (mode === 'off')
    return [
      { kind: 'mode', equipment: 'science-processor', mode: 'idle' },
      { kind: 'power', equipment: 'science-processor', allocation: 40 },
    ];
  return [
    { kind: 'mode', equipment: 'science-processor', mode: 'lattice' },
    { kind: 'power', equipment: 'science-processor', allocation: mode === 'survey' ? 350 : 1000 },
    { kind: 'mode', equipment: 'camera', mode: 'detail' },
    { kind: 'power', equipment: 'camera', allocation: 200 },
    ...(ahead
      ? [{ kind: 'point', sensor: 'camera', target: null, direction: ahead } as const]
      : []),
    { kind: 'recorder', sampleRate: 10 },
  ];
}
