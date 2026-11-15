/**
 * The end of a forecast at warp (A6, A12; NIGHT's finding 5): the forecast ended at T+11 h and
 * the ship coasted on 20 h at 2000× into a belt rock, the passing horizon an advisory only. Now
 * the session calls it out as a caution, once per forecast: warp drops to 1× and the frame's
 * run of ticks ends. Warp may be raised again (a long coast is not trapped), and a forecast that
 * reaches past the present clears it.
 */

import { describe, expect, it } from 'vitest';
import { createGravityRange, LAW, PLAY } from '../content/gravity-range/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { createStandInModel } from './belief/standin-model.ts';
import { createGameSession } from './session.ts';

/** The Gravity range with a short forecast span, so a coast outlives its forecast quickly. */
const SPAN = 600;
const setup = { ...createGravityRange(), play: { ...PLAY, forecastSpan: SPAN } };

describe('the end of the forecast in force', () => {
  it('drops warp to 1× once as it ends, and clears when a forecast reaches past now', async () => {
    const s = createGameSession(setup, {
      model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
      blackBox: createBlackBox(),
      now: () => 'now',
      // Frames never run out of time: only an alert can end one early.
      clock: () => 0,
    });
    s.setPaused(false);
    s.stepTicks(10);
    const forecast = await s.commit({ name: 'coast', items: [] });
    const end = forecast.samples.at(-1)!.t;
    expect(end).toBeGreaterThan(s.status().t);
    expect(end).toBeLessThanOrEqual(10 + SPAN);
    const top = s.status().warpSteps.at(-1)!;

    // At full warp the frame runs on to the forecast's end and stops on the tick past it.
    s.setWarp(top);
    s.advance(1);
    expect(s.status().warp).toBe(1);
    expect(s.status().t).toBe(Math.floor(end) + 1);
    const alert = s.status().alerts.find((a) => a.id === 'forecast-ended');
    expect(alert).toMatchObject({ level: 'caution', forecast: forecast.id, endedAt: end });

    // Raised again, warp stays up: the same forecast is not called out twice.
    s.setWarp(top);
    const ran = s.advance(1);
    expect(ran).toBe(top);
    expect(s.status().warp).toBe(top);
    expect(s.status().alerts.some((a) => a.id === 'forecast-ended')).toBe(true);

    // A new forecast from now reaches past the present: the caution goes.
    s.setWarp(1);
    await s.commit({ name: 'coast again', items: [] });
    s.stepTicks(1);
    expect(s.status().alerts.some((a) => a.id === 'forecast-ended')).toBe(false);
  });

  it('says nothing with no forecast issued', () => {
    const s = createGameSession(setup, {
      model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
      blackBox: createBlackBox(),
      now: () => 'now',
      clock: () => 0,
    });
    s.setPaused(false);
    s.setWarp(s.status().warpSteps.at(-1)!);
    s.advance(1);
    expect(s.status().alerts.some((a) => a.id === 'forecast-ended')).toBe(false);
  });
});
