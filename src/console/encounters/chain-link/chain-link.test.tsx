import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChainLinkPanel, recordingDuration } from './ChainLinkPanel.tsx';
import type { ChainLinkPanelState } from './ChainLinkPanel.tsx';
import { latticeModeCommands } from './commands.ts';

const state: ChainLinkPanelState = {
  mode: 'off',
  discovered: false,
  recording: true,
  optionalBytesRemaining: 32_000_000,
  recordingBytesPerSecond: 40_960,
  requestedProcessorW: 0,
  deliveredProcessorW: 0,
  chainHeatW: 270,
  updatesPerSecond: 0,
  retainedFrames: 0,
  supportedFragments: 0,
  coveredPatches: 0,
  latestEvidenceAgeS: null,
  validity: 'Channel available · allocate processing',
};

describe('Black Box lattice instrument', () => {
  it('requests real installed sensor-chain commands without changing flight controls', () => {
    for (const mode of ['survey', 'thread'] as const) {
      const commands = latticeModeCommands(mode);
      expect(commands).toContainEqual({
        kind: 'mode',
        equipment: 'science-processor',
        mode: 'lattice',
      });
      expect(commands).toContainEqual({
        kind: 'power',
        equipment: 'science-processor',
        allocation: mode === 'survey' ? 350 : 1000,
      });
      expect(commands).toContainEqual({ kind: 'mode', equipment: 'camera', mode: 'detail' });
      expect(commands).toContainEqual({ kind: 'power', equipment: 'camera', allocation: 200 });
      expect(commands).toContainEqual({ kind: 'recorder', sampleRate: 10 });
      expect(commands.every((c) => ['mode', 'power', 'recorder'].includes(c.kind))).toBe(true);
    }
    expect(latticeModeCommands('off')).toEqual([
      { kind: 'mode', equipment: 'science-processor', mode: 'idle' },
      { kind: 'power', equipment: 'science-processor', allocation: 40 },
    ]);
  });
  it('offers the processing function before discovery, without revealing a field', () => {
    const html = renderToStaticMarkup(<ChainLinkPanel state={state} onMode={() => undefined} />);
    expect(html).toContain('Black Box · channel 03');
    expect(html).toContain('Black Box processing allocation');
    expect(html).toContain('350 W');
    expect(html).toContain('1,000 W');
    expect(html).not.toContain('Lattice reconstruction');
    expect(html).not.toContain('Covered patches');
  });
  it('labels unresolved space and failed processing without claiming a clear opening', () => {
    const html = renderToStaticMarkup(
      <ChainLinkPanel
        state={{
          ...state,
          discovered: true,
          mode: 'thread',
          requestedProcessorW: 1000,
          deliveredProcessorW: 0,
          validity: 'Payload bus unavailable',
        }}
        onMode={() => undefined}
      />,
    );
    expect(html).toContain('Hatched space is unresolved');
    expect(html).toContain('Processing unavailable');
    expect(html).toContain('Earlier evidence is not fresh coverage');
  });
  it('reports time at the actual stored rate and never implies stopped capture is unlimited', () => {
    expect(recordingDuration(state)).toBe('13 min');
    expect(recordingDuration({ ...state, recordingBytesPerSecond: 1_204_800 })).toBe('26 s');
    expect(recordingDuration({ ...state, recording: false })).toBe('STOPPED');
    expect(recordingDuration({ ...state, optionalBytesRemaining: 0 })).toBe('FULL');
  });
});
