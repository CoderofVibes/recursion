/**
 * R47: a judge who flies freely and has the right law gets an honest pass.
 *
 * NIGHT found the distance law failing its held-out test on long or messy attempts though the
 * fitted exponent was right: a 39 h attempt held out, or used as the training. The cause was arc
 * growing (§4.5): a 39 h attempt's first stage was 10 h of data fitted from the starting values,
 * and the fit lost its way (a negative mass, a 0.43 rad engine error), so either its posterior
 * was meaningless or the held-out fit never settled. With the first stage capped
 * (`arcGrowthFirstSpan`) both fits converge.
 *
 * Real game, real ship, real recorder and model; truth (the law's exponent) is used only to
 * judge. The threshold and the statistics are the test's own (§7.2), unchanged.
 */

import { describe, expect, it } from 'vitest';
import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import { createBlackBox } from '../game/belief/blackbox.ts';
import { burnDuration, burnSteps } from '../game/belief/maneuver.ts';
import { createModelBridge } from '../game/belief/model-bridge.ts';
import { createGameSession } from '../game/session.ts';
import { createModelClient } from './index.ts';

describe('long and messy attempts (R47)', () => {
  it(
    'a 39 h dive and a 6 h attempt with a hasty 40 m/s burn each test the law honestly against the other',
    // Two flights (45 h of ship time) and four global fits, two of them on the 39 h arc.
    { timeout: 1_500_000 },
    async () => {
      const range = createGravityRange();
      const setup = { ...range, play: { ...range.play, forecastSpan: 16 * 3600 } };
      const client = createModelClient({ worker: false });
      // A still clock: the bridge hands over only before a forecast and when the test waits.
      const model = createModelBridge(client, {
        referenceRadius: LAW.referenceRadius,
        clock: () => 0,
      });
      const session = createGameSession(setup, {
        model,
        blackBox: createBlackBox(),
        rules: model.rules,
        now: () => 'test',
      });
      /** Commit a retrograde burn 300 s after arrival, fly to `end` and recall. */
      const fly = async (deltaV: number, end: number, lead?: number) => {
        session.stepTicks(300);
        await session.commit({
          items: burnSteps({
            at: 600,
            duration: burnDuration(
              session.ship,
              session.snapshot().world.ship.massProperties.mass,
              deltaV,
            ),
            attitude: { reference: 'retrograde' },
            ...(lead !== undefined ? { lead } : {}),
          }),
        });
        while (session.status().t < end && session.status().outcome.kind === 'in-progress')
          session.stepTicks(100);
        const id = session.status().attemptId;
        expect(session.status().outcome.kind).toBe('in-progress');
        session.recall();
        await model.settled();
        return id;
      };
      try {
        // The judge's long dive, left running at warp for 39 h.
        const long = await fly(9.85, 39 * 3600);
        // A hasty one: 40 m/s with no turn first, so the ship burns while it is still turning.
        const messy = await fly(40, 6 * 3600, 0);

        // NIGHT's first case: the 39 h attempt held out (before: T/ν 7.6 against 1.05).
        const heldLong = await model.rules.test('distance-law', [messy], long);
        // NIGHT's second: the 39 h attempt as the training (before: T/ν 864 against 1.13).
        const trainLong = await model.rules.test('distance-law', [long], messy);
        for (const r of [heldLong, trainLong]) {
          const ho = r.heldOutTest!;
          expect(ho.TperNu).toBeLessThanOrEqual(ho.threshold);
          expect(ho.pass).toBe(true);
          expect(r.adoptable).toBe(true);
          expect(ho.diagnosis?.cause).toBe('consistent');
          // Honest: the fitted exponent is within 3σ of the truth.
          const n = r.fitted['law.gravity.exponent']!;
          expect(Math.abs(n.value - LAW.exponent)).toBeLessThan(3 * n.sigma);
        }
        // The 39 h training fit settles on the law, not on a wild one (before: 2.49996 ± 3e-7).
        expect(trainLong.fitted['law.gravity.exponent']!.sigma).toBeLessThan(1e-5);
      } finally {
        client.terminate();
      }
    },
  );
});
