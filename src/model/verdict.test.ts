/**
 * R47: a held-out test says why it failed in plain words, from its own numbers, and the
 * arc-growing stages of a long attempt stay short enough to fit. Synthetic residuals; the real
 * flights are in long-attempts.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng.ts';
import type { ResidualTag } from './solve.ts';
import { stageSpans } from './solve.ts';
import { attemptClock, diagnoseHeldOut, plainLabel, type HeldOutNumbers } from './verdict.ts';

/** A held-out fit of `n` rows over 0..span s; `scale(t, powered)` inflates a row's residual. */
function heldOut(
  scale: (t: number, powered: boolean) => number,
  opts: { span?: number; n?: number; burn?: [number, number]; prior?: number; pass?: boolean } = {},
): HeldOutNumbers {
  const n = opts.n ?? 3000;
  const span = opts.span ?? 30_000;
  const rng = createRng(47).stream('held-out');
  const tags: ResidualTag[] = [];
  const resid = new Float64Array(n);
  let chi2 = 0;
  for (let i = 0; i < n; i++) {
    const t = (span * i) / (n - 1);
    const powered = !!opts.burn && t >= opts.burn[0] && t <= opts.burn[1];
    tags.push({ arc: 'held', t, kind: 'bearing', target: 'alpha', component: i % 2, powered });
    resid[i] = rng.normal(0, 1) * scale(t, powered);
    chi2 += resid[i]! ** 2;
  }
  return {
    pass: opts.pass ?? false,
    chi2Data: chi2,
    priorPenalty: opts.prior ?? 4,
    nu: n - 12,
    globalShiftSigma: { 'law.gravity.exponent': 0.4, 'body.beta.mu': -0.2 },
    fit: { resid, residTags: tags, converged: true },
  };
}

describe('why a held-out test came out as it did (R47)', () => {
  it('a pass says the attempt agrees', () => {
    const d = diagnoseHeldOut(heldOut(() => 1, { pass: true }), true);
    expect(d.cause).toBe('consistent');
    expect(d.why).toMatch(/agrees with the rule/);
  });

  it('a training fit that never settled is named, not blamed on the law', () => {
    const d = diagnoseHeldOut(heldOut(() => 30), false);
    expect(d.cause).toBe('training-unsettled');
    expect(d.why).toMatch(/nothing reliable to test against/);
  });

  it('a held-out fit that never settled is named', () => {
    const h = heldOut(() => 30);
    const d = diagnoseHeldOut({ ...h, fit: { ...h.fit, converged: false } }, true);
    expect(d.cause).toBe('no-fit');
  });

  it('misfit inside the burn points at the burn and its time', () => {
    const d = diagnoseHeldOut(
      heldOut((_, powered) => (powered ? 40 : 1), { burn: [600, 900] }),
      true,
    );
    expect(d.cause).toBe('burn');
    expect(d.from).toBeGreaterThanOrEqual(600);
    expect(d.to).toBeLessThanOrEqual(900);
    expect(d.why).toBe(
      'Most of the misfit is in the held-out attempt’s burn (T+0:10 to T+0:15): the model can’t explain that burn, so this attempt can’t judge the rule. Hold out an attempt whose burns the model already follows.',
    );
  });

  it('misfit in one stretch names the stretch, and says the rest agrees when it does', () => {
    const d = diagnoseHeldOut(
      heldOut((t) => (t > 18_000 && t < 21_000 ? 20 : 1)),
      true,
    );
    expect(d.cause).toBe('span');
    // The stretch named is the disturbed one (T+5:00 to T+5:50), to one bin (625 s).
    expect(d.from).toBeGreaterThanOrEqual(18_000 - 625);
    expect(d.from).toBeLessThanOrEqual(18_000);
    expect(d.to).toBeGreaterThanOrEqual(21_000);
    expect(d.to).toBeLessThanOrEqual(21_000 + 625);
    expect(d.why).toMatch(
      /^Most of the misfit is between T\+(4:5\d|5:00) and T\+(5:5\d|6:0\d) of the held-out attempt/,
    );
    expect(d.why).toMatch(/The rest of the attempt agrees with the rule\.$/);
  });

  it('misfit spread along the attempt says the rule does not hold there', () => {
    const d = diagnoseHeldOut(heldOut(() => 3), true);
    expect(d.cause).toBe('throughout');
    expect(d.why).toMatch(/all along, not at one moment/);
  });

  it('values pulled far from the training are named in plain words', () => {
    const h = heldOut(() => 1.05, { prior: 40_000 });
    const d = diagnoseHeldOut(
      {
        ...h,
        globalShiftSigma: {
          'law.gravity.exponent': 104,
          'body.beta.mu': 258,
          'sensor.camera.bias': -626,
          'thruster.main-engine.scale': -2,
        },
      },
      true,
      (id) => plainLabel(id, { bodies: { beta: 'Beta' }, equipment: { 'main-engine': 'main engine' } }),
    );
    expect(d.cause).toBe('values');
    expect(d.shifted!.map((s) => s.name)).toEqual([
      'sensor.camera.bias',
      'body.beta.mu',
      'law.gravity.exponent',
    ]);
    expect(d.why).toBe(
      'To fit the held-out attempt the model has to move the camera’s alignment, Beta’s mass and the distance exponent 104σ or more from what the training found. One of these attempts holds something the model can’t explain, or the rule doesn’t hold over both.',
    );
  });

  it('labels and clock', () => {
    expect(plainLabel('thruster.main-engine.misalignment-pitch')).toBe('the main engine’s pointing');
    expect(plainLabel('sensor.imu-a.scale', { equipment: { 'imu-a': 'IMU A' } })).toBe(
      'the IMU A’s scale',
    );
    expect(plainLabel('something.else')).toBe('something.else');
    expect(attemptClock(140_400)).toBe('T+39:00');
    expect(attemptClock(3_959)).toBe('T+1:06');
  });
});

describe('arc growing on a long attempt (§4.5, R47)', () => {
  it('an arc whose quarter is within the cap keeps the spec’s stages exactly', () => {
    expect(stageSpans(30_240, undefined, 10_800)).toEqual([7_560, 15_120, Infinity]);
    expect(stageSpans(30_240)).toEqual(stageSpans(30_240, undefined, 10_800));
  });

  it('a 39 h arc starts within the cap and doubles up to the spec’s quarter', () => {
    const s = stageSpans(140_320, undefined, 10_800);
    expect(s).toEqual([8_770, 17_540, 35_080, 70_160, Infinity]);
    expect(s[0]).toBeLessThanOrEqual(10_800);
    // Without the cap the first stage is 10 h of data from the starting values: the R47 failure.
    expect(stageSpans(140_320)[0]).toBe(35_080);
  });
});
