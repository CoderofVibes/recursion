import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChainLinkPanel, channelIsFresh, recordingDuration } from './ChainLinkPanel.tsx';
import type { ChainLinkPanelState } from './ChainLinkPanel.tsx';
import { latticeModeCommands } from './commands.ts';

const state: ChainLinkPanelState = {
  now: 10,
  readings: {
    processor: { reportedAt: 10, validUntil: 11, available: true },
    recorder: { reportedAt: 10, validUntil: 11, available: true },
    sensors: { reportedAt: 10, validUntil: 11, available: true },
    thermal: { reportedAt: 10, validUntil: 11, available: true },
    reconstruction: { reportedAt: 10, validUntil: 11, available: true },
  },
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
  validity: 'Channel available · allocate processing',
};

describe('Black Box lattice instrument', () => {
  it('keeps last readings and hardened-console controls when instruments go silent', () => {
    const dead = {
      ...state,
      now: 20,
      discovered: true,
      mode: 'thread' as const,
      deliveredProcessorW: 1000,
      requestedProcessorW: 1000,
      updatesPerSecond: 5 / 3,
      firstThreat: { component: 'Camera', marginM: -2, sigmaM: 0.5 },
    };
    const html = renderToStaticMarkup(<ChainLinkPanel state={dead} onMode={() => undefined} />);
    expect(channelIsFresh(dead, 'processor')).toBe(false);
    expect(recordingDuration(dead)).toBe('STALE');
    expect(html).not.toContain('>LIVE<');
    expect(html).toContain('1000 / 1000 W');
    expect(html).toContain('1.67');
    expect(html).toContain('10.0'); // Age advances from the acquisition time, not UI snapshot time.
    expect(html).toContain('Recorder telemetry stale');
    expect(html).toContain('Camera earlier exposure estimate');
    expect(html).toContain('STALE · -2.0 m');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('data-status="stale"');
  });
  it('does not call a dead camera live because processor power and recorder telemetry are fresh', () => {
    const deadCamera = {
      ...state,
      discovered: true,
      mode: 'thread' as const,
      deliveredProcessorW: 1000,
      readings: {
        ...state.readings,
        sensors: { reportedAt: 10, validUntil: 11, available: false },
      },
    };
    const html = renderToStaticMarkup(
      <ChainLinkPanel state={deadCamera} onMode={() => undefined} />,
    );
    expect(html).not.toContain('>LIVE<');
    expect(html).toContain('Sensor readings stale');
    expect(html).toContain('Earlier covered patches');
    expect(channelIsFresh({ ...state, readings: undefined }, 'processor')).toBe(false);
    expect(channelIsFresh({ ...state, now: 9 }, 'processor')).toBe(false);
  });
  it('does not refresh an earlier threat when unrelated reconstruction telemetry updates', () => {
    const html = renderToStaticMarkup(
      <ChainLinkPanel
        state={{
          ...state,
          mode: 'thread',
          deliveredProcessorW: 1000,
          firstThreat: {
            component: 'Radiator tip',
            marginM: -1,
            sigmaM: 0.5,
            reading: { reportedAt: 1, validUntil: 2, available: true },
          },
        }}
        onMode={() => undefined}
      />,
    );
    expect(html).toContain('>LIVE<');
    expect(html).toContain('Radiator tip earlier exposure estimate');
    expect(html).toContain('STALE · -1.0 m');
  });
  it('shows the retained raw clue without turning it into reconstruction evidence', () => {
    const html = renderToStaticMarkup(
      <ChainLinkPanel
        state={{
          ...state,
          diagnosticSnapshot: { recordedAt: 9, bytes: 1024, sampleId: 'retained:raw:9' },
        }}
        onMode={() => undefined}
      />,
    );
    expect(html).toContain('Last channel snapshot');
    expect(html).toContain('1024 B · 1.0 s ago');
    expect(html).not.toContain('Lattice reconstruction');
    expect(html).not.toContain('Supported fragments');
    expect(html).not.toContain('>LIVE<');
  });
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
