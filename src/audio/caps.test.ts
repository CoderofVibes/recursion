import { expect, it } from 'vitest';
import { OPENING_END, openingCues } from '../app/opening/sequence.ts';
import { SHOT_CAP, shotLength } from './caps.ts';

it('plays only the first double pip of a long opening-alarm take (R65)', () => {
  expect(shotLength('opening-alarm', 3)).toBe(0.45);
  // A take already as short as the cue plays in full.
  expect(shotLength('opening-alarm', 0.4)).toBe(0.4);
});

it('leaves every other one-shot at its file length', () => {
  expect(Object.keys(SHOT_CAP)).toEqual(['opening-alarm']);
  expect(shotLength('loss-failure', 1.5)).toBe(1.5);
  expect(shotLength('black-cut', 1.48)).toBe(1.48);
});

it('ends each opening alarm before the next begins, and the last before the failure', () => {
  const cues = openingCues(0, OPENING_END);
  const alarms = cues.filter((cue) => cue.id === 'opening-alarm').map((cue) => cue.at);
  const failure = cues.find((cue) => cue.id === 'loss-failure')!.at;
  const length = shotLength('opening-alarm', 3);

  expect(alarms).toHaveLength(3);
  // The mixer plays one voice per cue, so an alarm still sounding would swallow the next.
  for (const [i, at] of alarms.entries()) {
    const next = alarms[i + 1] ?? failure;
    expect(at + length).toBeLessThan(next);
  }
});
