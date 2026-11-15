/**
 * The data 3C's ChainLinkPanel shows (R20), from belief only: telemetry freshness per channel,
 * delivered power against the allocation, the recorder, and Black Box's retained frames.
 */

import { describe, expect, it } from 'vitest';
import { latticeModeCommands } from '../console/encounters/chain-link/commands.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { chainLinkPanelData } from './belief/chain-link-panel.ts';
import { createStandInModel } from './belief/standin-model.ts';
import { encounterEntry } from './encounters.ts';
import { createGameSession } from './session.ts';

describe('ChainLinkPanel data', () => {
  it(
    'reads processor service, the recorder and freshness from telemetry',
    { timeout: 60_000 },
    () => {
      const setup = encounterEntry('chain-link').create(0);
      const blackBox = createBlackBox();
      const s = createGameSession(setup, {
        model: createStandInModel({
          referenceRadius: setup.definition.briefing.referenceRadius ?? 1e6,
        }),
        blackBox,
        now: () => 'now',
      });
      s.stepTicks(20);
      const off = chainLinkPanelData(s.status().t, s.snapshot().world.ship, s.ship);
      expect(off.mode).toBe('off');
      expect(off.readings.recorder?.available).toBe(true);
      expect(off.readings.recorder!.validUntil).toBeGreaterThanOrEqual(s.status().t);
      // The panel's own commands for a survey, then what the gauges say came of them.
      for (const c of latticeModeCommands('survey')) s.command(c);
      s.stepTicks(100);
      const on = chainLinkPanelData(
        s.status().t,
        s.snapshot().world.ship,
        s.ship,
        blackBox.attempt(s.status().attemptId),
      );
      expect(on.mode).toBe('survey');
      expect(on.requestedProcessorW).toBe(350);
      expect(on.deliveredProcessorW).toBeGreaterThan(0);
      expect(on.deliveredProcessorW).toBeLessThanOrEqual(350 + 1e-6);
      expect(on.recording).toBe(true);
      expect(on.updatesPerSecond).toBeCloseTo(10, 6);
      expect(on.recordingBytesPerSecond).toBeGreaterThan(0);
      // No reconstruction yet (2C's): its channel is not reported, so the panel shows it stale.
      expect(on.readings.reconstruction).toBeUndefined();
    },
  );
});
