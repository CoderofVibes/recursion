import type { Shot } from './catalogue.ts';

/**
 * How much of a one-shot the game plays, in seconds, where a file runs longer than its cue.
 *
 * R65: the owner's `opening-alarm` take is a 3 s train of pips, and the opening wants one double
 * pip three times (6.60, 7.80 and 8.47 s). Its first double pip ends at 0.38 s and the third pip
 * starts at 0.46 s, so 0.45 s plays exactly the double pip. The long take stays whole for the
 * trailer, which schedules its own sounds.
 */
export const SHOT_CAP: Partial<Record<Shot, number>> = {
  'opening-alarm': 0.45,
};

/** The seconds of `cue` the game plays from a file that lasts `fileSeconds`. */
export function shotLength(cue: Shot, fileSeconds: number): number {
  const cap = SHOT_CAP[cue];
  return cap === undefined ? fileSeconds : Math.min(cap, fileSeconds);
}
