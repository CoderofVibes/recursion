import { expect, it } from 'vitest';
import { OPENING_END, openingCues, sampleOpening } from '../app/opening/sequence.ts';
import { lossSequence } from '../theme/index.ts';

it('plays the black-cut cue at the frame that first goes fully black', () => {
  const cues = openingCues(0, OPENING_END);
  const failure = cues.find((cue) => cue.id === 'loss-failure')!.at;
  const cut = cues.find((cue) => cue.id === 'black-cut')!.at;

  expect(cut).toBe(failure + lossSequence.shakeEnd);
  for (const reducedMotion of [false, true]) {
    const before = sampleOpening(cut - 0.001, reducedMotion);
    expect(before.beat).toBe('impact');
    expect(before.blackout).toBeLessThan(1);
    expect(sampleOpening(cut, reducedMotion)).toMatchObject({ beat: 'dark', blackout: 1 });
  }
});
