import type { Command } from '../../../contracts/index.ts';
import type { ReconstructionMode } from './ChainLinkPanel.tsx';

/**
 * Existing installed equipment only. These are requests; actual delivered service is read
 * back from telemetry. Switching off processing leaves the camera and recorder available.
 */
export function latticeModeCommands(mode: ReconstructionMode): readonly Command[] {
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
    { kind: 'recorder', sampleRate: 10 },
  ];
}
