/**
 * The Gravity range through the whole loop with the real predictive model (2C) and Black Box:
 * the forecast is wrong, two attempts are compared, the player tests and adopts a rule, and the
 * improved model holds on a dive it has never flown. Truth is used only to judge.
 */

import { describe, expect, it } from 'vitest';
import type { Forecast, ForecastDraft } from '../contracts/index.ts';
import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import { createModelClient } from '../model/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { burnDuration, burnSteps } from './belief/maneuver.ts';
import { createModelBridge } from './belief/model-bridge.ts';
import { createGameSession } from './session.ts';

describe('Gravity range with the real model', () => {
  it(
    'learns the distance law from two dives and forecasts a third it has never flown',
    { timeout: 300_000 },
    async () => {
      const setup = createGravityRange();
      // In-thread client: the same service the browser runs in a Web Worker.
      const model = createModelBridge(createModelClient({ worker: false }), {
        referenceRadius: LAW.referenceRadius,
      });
      const blackBox = createBlackBox();
      const session = createGameSession(setup, {
        model,
        blackBox,
        rules: model.rules,
        now: () => 'test',
      });

      /** Truth, for judging only: distance from Alpha. */
      const trueRange = (): number => {
        const world = session.truth().sim.world;
        const alpha = world.bodies[0]!;
        const p = world.ship.kinematics.position;
        return Math.hypot(p.x - alpha.position.x, p.y - alpha.position.y);
      };
      const dive = (deltaV: number) => ({
        items: burnSteps({
          at: 400,
          duration: burnDuration(
            session.ship,
            session.snapshot().world.ship.massProperties.mass,
            deltaV,
          ),
          attitude: { reference: 'retrograde' as const },
        }),
      });
      /** Lowest distance from Alpha the forecast shows before it ends, km, and when. */
      const lowest = (f: Forecast | ForecastDraft) => {
        const alpha = f.closestApproaches.find((c) => c.id === 'alpha')!;
        const hull = Math.max(
          ...f.inputs.massProperties.footprint.map((p) =>
            Math.hypot(
              p.x - f.inputs.massProperties.centerOfMass.x,
              p.y - f.inputs.massProperties.centerOfMass.y,
            ),
          ),
        );
        return {
          km: (alpha.distance + 250_000 + hull) / 1e3,
          t: alpha.t,
          sigma: alpha.sigma / 1e3,
        };
      };
      /** Commit a dive 300 s after arrival and fly it; returns the forecast and the true low point. */
      const fly = async (deltaV: number) => {
        session.stepTicks(300);
        const forecast = await session.commit(dive(deltaV));
        let low = Infinity;
        let when = 0;
        for (let i = 0; i < 300; i++) {
          session.stepTicks(100);
          const r = trueRange();
          if (r < low) {
            low = r;
            when = session.status().t;
          }
        }
        await model.settled();
        return { forecast, low: low / 1e3, when };
      };

      // Attempt 1. The model is Newtonian and has flown nowhere: its forecast of a dive leaves
      // the distances it knows, widens and ends long before the low point.
      const first = await fly(9.85);
      expect(first.forecast.modelVersion).toBe(0);
      expect(first.low).toBeGreaterThan(495);
      expect(first.low).toBeLessThan(512);
      expect(first.forecast.horizon).toBeLessThan(first.when - 3600);
      expect(lowest(first.forecast).km).toBeGreaterThan(first.low + 100);
      const extrapolating = first.forecast.samples.filter((s) => s.extrapolating).length;
      expect(extrapolating / first.forecast.samples.length).toBeGreaterThan(0.8);
      expect(model.state().calibration[0]!.windows.length).toBeGreaterThan(4);
      session.recall();

      // Attempt 2: a shallower dive, inside distances attempt 1 sampled. The calibration table
      // carries it (A4): nothing is extrapolated and the forecast low point is right.
      const second = await fly(5);
      expect(second.forecast.modelVersion).toBe(1);
      expect(second.forecast.samples.some((s) => s.extrapolating)).toBe(false);
      const shallow = lowest(second.forecast);
      expect(Math.abs(shallow.km - second.low)).toBeLessThan(2 * shallow.sigma);
      expect(Math.abs(shallow.km - second.low)).toBeLessThan(30);
      session.recall();
      await model.settled();

      // A mass-only fix cannot hold at two distances: measured strength at 500 km is about
      // 1.41 times that at 1,000 km (the square root of 2), not equal.
      const profile = model.state().calibration.find((c) => c.body === 'alpha')!;
      const scaleNear = (km: number): number => {
        const i = profile.distances.reduce(
          (best, d, j) =>
            Math.abs(d - km * 1e3) < Math.abs(profile.distances[best]! - km * 1e3) ? j : best,
          0,
        );
        return profile.scale[i]!;
      };
      const ratio = scaleNear(500) / scaleNear(1000);
      expect(ratio).toBeGreaterThan(1.36);
      expect(ratio).toBeLessThan(1.47);
      expect(model.state().extensions.some((e) => e.status === 'adopted')).toBe(false);

      // Attempt 3, before any rule: a deeper dive than anything flown. The table stops where
      // the data stop, so the forecast ends near the deepest sampled distance.
      session.stepTicks(300);
      const tableOnly = lowest(await session.preview(dive(14)));
      expect(tableOnly.km).toBeGreaterThan(490);

      // The player tests the distance law: fitted on the shallow dive, held out on the deep
      // one. It passes, earns a small hedge, and only then can be adopted.
      const test = await model.rules.test('distance-law', ['attempt-0002'], 'attempt-0001');
      expect(test.adoptable).toBe(true);
      expect(test.state.validation).toMatchObject({
        heldOutAttempt: 'attempt-0001',
        verdict: 'better',
      });
      expect(test.fitted!['law.gravity.exponent']!.value).toBeCloseTo(2.5, 1);
      expect(test.earnedHedge).toBeLessThan(0.05);
      expect(model.state().extensions.some((e) => e.status === 'adopted')).toBe(false);

      const adopted = await model.rules.adopt('distance-law');
      expect(adopted.extensions.find((e) => e.id === 'distance-law')!.status).toBe('adopted');
      const value = (id: string): number =>
        adopted.parameters.find((p) => p.id === id && !p.arc)!.value;
      expect(value('law.gravity.exponent')).toBeCloseTo(2.5, 2);
      // From tracking alone, with Beta never looked at: both bodies' true strengths.
      expect(value('body.alpha.mu') / 1e10).toBeCloseTo(1, 2);
      expect(value('body.beta.mu') / 2.5e9).toBeGreaterThan(0.95);
      expect(value('body.beta.mu') / 2.5e9).toBeLessThan(1.05);

      // With the rule the same plan's forecast reaches 100 km deeper before it ends.
      const withRule = await session.commit(dive(14));
      expect(withRule.inputs.extensions).toEqual(['distance-law']);
      const ruled = lowest(withRule);
      expect(ruled.km).toBeLessThan(tableOnly.km - 80);

      // Fly it. The low point is deeper than any earlier attempt, and where the forecast still
      // speaks, the ship is where it said: the improved explanation holds on a different coast.
      let low = Infinity;
      for (let i = 0; i < 300; i++) {
        session.stepTicks(100);
        low = Math.min(low, trueRange());
        if (session.status().t === withRule.horizon - (withRule.horizon % 100)) {
          const sample = withRule.samples.find((s) => s.t >= session.status().t)!;
          const here = session.snapshot().world.ship.position;
          const miss = Math.hypot(sample.position.x - here.x, sample.position.y - here.y);
          const sigma = Math.sqrt(Math.max(sample.positionCov[0] ?? 0, sample.positionCov[2] ?? 0));
          expect(miss).toBeLessThan(3 * sigma);
          expect(miss).toBeLessThan(40_000);
        }
      }
      expect(low / 1e3).toBeLessThan(400);
      expect(low / 1e3).toBeGreaterThan(380);
      expect(ruled.km).toBeLessThan(low / 1e3 + 30);
      expect(model.lastError()).toBeUndefined();
      expect(blackBox.archive().attempts.map((a) => a.outcome.kind)).toEqual([
        'recalled',
        'recalled',
        'in-progress',
      ]);
    },
  );
});
