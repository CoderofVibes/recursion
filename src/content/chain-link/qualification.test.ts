import { describe, expect, it } from 'vitest';
import { QUALIFICATION, qualifyChainLink } from './qualification.ts';
import { CONTENT_VERSION, FENCE_COUNT, FORWARD_EXIT_X } from './layout.ts';
import results from './qualification-results.json';

describe('A16 twenty-fence production qualification', () => {
  it('records four complete manual production flights within the stated resource and clearance limits', () => {
    // The standalone runner executes all 60,233 ticks per case. This checks that checked-in
    // evidence meets the declared contract; it is explicitly not another full-flight run.
    expect(results.cases.map((result) => result.catalogueIndex)).toEqual([0, 1, 2, 3]);
    for (const result of results.cases) {
      expect(result.contentVersion).toBe(CONTENT_VERSION);
      expect(result.dt).toBe(0.1);
      expect(result.complete).toBe(true);
      expect(result.fenceCount).toBe(FENCE_COUNT);
      expect(result.elapsed).toBeGreaterThan(6000);
      expect(result.elapsed).toBeLessThan(QUALIFICATION.maximumTime);
      expect(result.rcsUsed).toBeLessThan(QUALIFICATION.rcsBudget);
      expect(result.rcsRemaining).toBeGreaterThan(200);
      expect(result.mainUsed).toBe(0);
      expect(result.minimumContinuousClearance).toBeGreaterThan(16);
      expect(result.minimumRockClearance).toBeGreaterThan(16);
      expect(result.contacts).toBe(0);
      expect(result.faults).toEqual([]);
      expect(result.minimumScannerPower).toEqual({
        camera: 200,
        'science-processor': 1000,
        'black-box': 35,
      });
      expect(result.recordedLatticeFrames).toBeGreaterThan(9000);
      expect(result.recordedBytes).toBeLessThan(8_000_000_000);
      expect(Math.max(...Object.values(result.maximumTemperature))).toBeLessThanOrEqual(295);
      expect(result.finalLocalDatum.x).toBeGreaterThanOrEqual(FORWARD_EXIT_X);
    }
  });

  it('flies the actual entry and deployment with Thread power, real jet consumption and no initial teleport', () => {
    const result = qualifyChainLink({ catalogueIndex: 0, stopAt: 60 });
    expect(result.complete).toBe(false);
    expect(result.commandTicks).toBe(600);
    expect(result.elapsed).toBe(60);
    expect(result.finalLocalDatum.x).toBeGreaterThan(-401);
    expect(result.finalLocalDatum.x).toBeLessThan(-399);
    expect(result.finalLocalDatum.y).toBeGreaterThan(1.5);
    expect(result.finalLocalDatum.z).toBeGreaterThan(1.5);
    expect(result.rcsUsed).toBeGreaterThan(9);
    expect(result.rcsUsed).toBeLessThan(11);
    expect(result.mainUsed).toBe(0);
    expect(result.contacts).toBe(0);
    expect(result.faults).toEqual([]);
    expect(result.minimumScannerPower).toEqual({
      camera: 200,
      'science-processor': 1000,
      'black-box': 35,
    });
    expect(result.recordedLatticeFrames).toBeGreaterThan(0);
    expect(result.maximumTrackingError).toBeLessThan(0.3);
    expect(result.maximumAttitudeError).toBeGreaterThan(0); // real torque/rate correction is active
    expect(result.maximumAttitudeError).toBeLessThan(0.01);
  }, 30000);
});
