/**
 * The turn allowance (S20, R17): PLAN's default burn time against what the ship's turn needs,
 * checked on the real attitude controller, and a burn planned too soon still allowed.
 */

import { describe, expect, it } from 'vitest';
import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import { angleBetween, axisX, fromAxisAngle, multiply } from '../lib/quat.ts';
import { createBlackBox } from './belief/blackbox.ts';
import {
  burnSteps,
  DEFAULT_BURN_AT,
  TURN_LEAD,
  turnReadiness,
  turnTime,
} from './belief/maneuver.ts';
import { createStandInModel } from './belief/standin-model.ts';
import { createGameSession } from './session.ts';

const setup = createGravityRange();
const ship = setup.definition.ship;
const session = () =>
  createGameSession(setup, {
    model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
    blackBox: createBlackBox(),
    now: () => 'now',
  });

describe('turn allowance', () => {
  it('a half turn needs about 423 s: the 480 s lead covers it, the default burn time more so', () => {
    expect(turnTime(ship, Math.PI)).toBeCloseTo(Math.PI / 0.008 + 30, 6);
    expect(turnTime(ship, Math.PI)).toBeLessThan(TURN_LEAD);
    expect(DEFAULT_BURN_AT).toBeGreaterThanOrEqual(TURN_LEAD + 60);
    const s = session();
    const attitude = s.snapshot().world.ship.attitude;
    const nose = axisX(attitude);
    const back = { x: -nose.x, y: -nose.y, z: -nose.z };
    // PLAN's old 400 s default is too short for a half turn; 600 s is enough.
    expect(turnReadiness(ship, attitude, back, 400)).toMatchObject({ ready: false });
    expect(turnReadiness(ship, attitude, back, DEFAULT_BURN_AT)).toMatchObject({ ready: true });
    // Nearly aligned, 400 s is plenty.
    const near = axisX(fromAxisAngle({ x: 0, y: 0, z: 1 }, 0.1));
    const turned = turnReadiness(ship, attitude, near, 400);
    expect(turned.needed).toBeLessThan(400);
  });

  it('the real controller settles turns inside the allowance', { timeout: 60_000 }, () => {
    // Within 0.01 rad of the goal, and staying within 0.02 (the controller's deadband keeps a
    // small limit cycle going, about 10⁻⁴ rad/s): a half turn takes 418 s against 423.
    for (const angle of [Math.PI, Math.PI / 2, 0.3]) {
      const s = session();
      const start = s.truth().sim.world.ship.kinematics.attitude;
      const goal = multiply(fromAxisAngle({ x: 0, y: 0, z: 1 }, angle), start);
      s.command({ kind: 'attitude', target: { reference: 'inertial', attitude: goal } });
      let settled: number | undefined;
      let strayed = false;
      for (let t = 1; t <= 900; t++) {
        s.stepTicks(1);
        const error = angleBetween(s.truth().sim.world.ship.kinematics.attitude, goal);
        if (settled === undefined && error < 0.01) settled = t;
        if (settled !== undefined && error > 0.02) strayed = true;
      }
      expect(settled).toBeDefined();
      expect(strayed).toBe(false);
      expect(settled!).toBeLessThanOrEqual(turnTime(ship, angle));
      expect(settled!).toBeGreaterThan(angle / 0.008);
    }
  });

  it('a burn planned sooner than its turn is still flown as planned', async () => {
    const s = session();
    const nose = axisX(s.snapshot().world.ship.attitude);
    const back = { x: -nose.x, y: -nose.y, z: -nose.z };
    const steps = burnSteps({
      at: 60,
      duration: 2,
      attitude: { reference: 'direction', direction: back },
    });
    // The turn is clipped to the plan's epoch, and nothing delays the burn.
    expect(steps[0]!.at).toBe(0);
    await s.commit({ items: steps });
    s.stepTicks(70);
    const record = s.blackBox.attempt(s.status().attemptId)!;
    const burns = record.executed.filter((c) => c.command.kind === 'burn');
    expect(burns).toHaveLength(1);
    expect(burns[0]).toMatchObject({ t: 60, status: 'executed' });
  });
});
