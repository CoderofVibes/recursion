import { describe, expect, it } from 'vitest';
import { createTruthStepper } from '../../game/truth-step.ts';
import { createInverseWells } from './index.ts';
import { observeGardenAdmission } from './admission-observer.ts';

describe('content-owned production admission observations', () => {
  it('does not change any truth tick or measurement, including a due precursor and birth', () => {
    const setup = createInverseWells('admission-observer');
    const observed = observeGardenAdmission(setup);
    const plain = createTruthStepper(setup),
      tapped = createTruthStepper(observed.setup);
    let a = plain.initial,
      b = tapped.initial;
    for (let tick = 0; tick < 1201; tick++) {
      const x = plain.step(a),
        y = tapped.step(b);
      // Compare every physical, recorder, event and RNG product; instrumentation is read-only.
      expect(y).toEqual(x);
      a = x.state;
      b = y.state;
      if (a.lost) break;
    }
    const report = observed.finish();
    expect(report.sampledTicks).toBe(1201);
    expect(report.sweptTicks).toBe(1201);
    expect(report.eventCounts.precursor).toBeGreaterThan(0);
    expect(
      (report.eventCounts.birth ?? 0) + (report.eventCounts['birth-veto'] ?? 0),
    ).toBeGreaterThan(0);
    expect(report.fieldRebuilds).toBeGreaterThan(1);
    expect(report.lastStart!.t).toBe(1200);
    expect(report.lastSweep!.t1).toBe(1201);
    expect(report.finalPhases.active).toBeGreaterThan(report.initialPhases.active);
  }, 60_000);
});
