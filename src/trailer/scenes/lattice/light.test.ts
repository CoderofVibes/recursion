import { describe, expect, it } from 'vitest';
import { lossSequence } from '../../../theme/index.ts';
import { sampleLoss } from '../../../view3d/room/loss.ts';
import { BEATS, BRAID_DIPS, TITLE_DIPS, beat } from '../../timeline.ts';
import { BRAID_ROOM_LEVEL, DAMAGE_DIPS, LOCAL_STRIKE, STRIKE } from './light.ts';

describe('the combined room and page flash schedule', () => {
  it('keeps every planned fall and rise to at most three in any closed one-second interval', () => {
    // Conservatively count each authored dip even where the sag reduces its amplitude below
    // 0.1. Include page snaps/black gaps; unlike TR's existing test this also counts room dips.
    const falls = [...TITLE_DIPS, ...DAMAGE_DIPS, ...BRAID_DIPS].map((d) => d.at);
    const rises = [...TITLE_DIPS, ...DAMAGE_DIPS, ...BRAID_DIPS].map((d) => d.at + d.length);
    BEATS.forEach((b, i) => {
      const previous = BEATS[i - 1];
      if (b.scene !== null && previous?.scene === null) rises.push(b.start);
      if (b.scene === null && previous?.scene) falls.push(b.start);
    });
    for (const events of [falls, rises]) {
      for (const from of events) {
        expect(
          events.filter((at) => at >= from && at <= from + 1 + 1e-9).length,
        ).toBeLessThanOrEqual(3);
      }
    }
  });

  it('aligns damage with the strike and holds its last room level through the braid cut', () => {
    expect(beat('lattice').start + LOCAL_STRIKE).toBe(STRIKE);
    expect(DAMAGE_DIPS.map((d) => d.at)).toEqual([9.14, 9.6, 10.1]);
    expect(Math.max(...DAMAGE_DIPS.map((d) => d.at + d.length))).toBeLessThan(beat('braid').start);
    expect(STRIKE + lossSequence.hologramEnd).toBe(10.1);
    expect(BRAID_ROOM_LEVEL).toBeCloseTo(sampleLoss(beat('braid').start - STRIKE, false).light);
  });
});
