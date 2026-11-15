/**
 * The Gravity range flown by hand through the game loop (A6, A8, A11): turn, burn on the
 * throttle, release (a coasting forecast), lift over the ring on the translation controls,
 * release again, and leave the binary on the slingshot past Beta.
 *
 * The pilot is a script that flies like an informed player: it knows the plan from the
 * slingshot study (2G handoff) and flies it through `GameControls` alone (commands, `fly`, the
 * snapshot). Truth is read only to judge, after each step.
 */

import { describe, expect, it } from 'vitest';
import { HANDS_ON_NEUTRAL, type HandsOnInput } from '../../contracts/commands.ts';
import type { TruthWorld } from '../../contracts/truth/index.ts';
import { createBlackBox } from '../../game/belief/blackbox.ts';
import { burnDuration } from '../../game/belief/maneuver.ts';
import { createStandInModel } from '../../game/belief/standin-model.ts';
import { departStatus } from '../../game/objectives.ts';
import { createGameSession } from '../../game/session.ts';
import { quat } from '../../lib/index.ts';
import { distance, length, sub } from '../../lib/vec3.ts';
import { DEPART, LAW, createGravityRange } from './index.ts';

const HOUR = 3600;
const hold = (input: Partial<HandsOnInput>): HandsOnInput => ({ ...HANDS_ON_NEUTRAL, ...input });
const rcs = (w: TruthWorld): number =>
  (w.ship.systems.tanks['rcs-left'] ?? 0) + (w.ship.systems.tanks['rcs-right'] ?? 0);

describe('Gravity range: the slingshot flown by hand', () => {
  it(
    'turns, burns on the throttle, lifts over the ring and leaves the binary at over 50 m/s',
    { timeout: 600_000 },
    async () => {
      const setup = createGravityRange();
      const model = createStandInModel({ referenceRadius: LAW.referenceRadius });
      const blackBox = createBlackBox();
      const session = createGameSession(setup, { model, blackBox, now: () => 'test' });
      const world = () => session.truth().sim.world;
      const believedVelocity = () => session.snapshot().world.ship.velocity;

      // Turn the nose along the believed velocity eight minutes ahead of the burn (a half turn
      // takes about seven), and touch it up just before, so it points where the velocity is then.
      const BURN_AT = 3_960; // 1.1 h, as a whole number of ticks
      session.stepTicks(BURN_AT - 480);
      session.command({ kind: 'attitude', target: { reference: 'prograde' } });
      session.stepTicks(470);
      session.command({ kind: 'attitude', target: { reference: 'prograde' } });
      session.stepTicks(10);

      // The burn, on the throttle: 14.36 m/s by the engine's rating (it delivers about 97.5%).
      const trueBefore = world().ship.kinematics.velocity;
      const believedBefore = believedVelocity();
      const mainBefore = world().ship.systems.tanks['main-propellant']!;
      const seconds = Math.round(
        burnDuration(session.ship, session.snapshot().world.ship.massProperties.mass, 14.36),
      );
      session.fly(hold({ throttle: 1 }));
      session.stepTicks(1);
      // The thrust a held control asks for is drawn while it is held (2D request 1a).
      expect(session.snapshot().ship.thrust.map((t) => t.source)).toContain('main-engine');
      session.stepTicks(seconds - 1);
      session.fly(HANDS_ON_NEUTRAL);
      await model.settled();
      session.stepTicks(1);
      expect(session.snapshot().ship.thrust).toEqual([]);

      // The believed velocity followed the burn (2D request 1b), within the navigator's own
      // uncertainty.
      const trueChange = sub(world().ship.kinematics.velocity, trueBefore);
      const believedChange = sub(believedVelocity(), believedBefore);
      expect(length(trueChange)).toBeGreaterThan(13.5);
      expect(length(trueChange)).toBeLessThan(14.3);
      const cov = session.snapshot().world.ship.velocityCov;
      expect(distance(believedChange, trueChange)).toBeLessThan(
        3 * Math.sqrt(cov[0] + cov[3] + cov[5]),
      );
      // About 135 kg of the 6,000 kg main load.
      expect(mainBefore - world().ship.systems.tanks['main-propellant']!).toBeGreaterThan(120);
      expect(mainBefore - world().ship.systems.tanks['main-propellant']!).toBeLessThan(150);

      // The fuel cells last about 40 hours and the flight about 64, and running out of power
      // is a loss (A18 (5)). So deploy the arrays and point the nose, which they face, at the
      // sun the window shows.
      const facingSun = () => {
        const sun = session.snapshot().window?.sun;
        if (!sun) throw new Error('no sun in the window');
        session.command({
          kind: 'attitude',
          target: { reference: 'direction', direction: sun.direction },
        });
      };
      session.command({ kind: 'configure', configuration: 'solar' });
      facingSun();
      session.stepTicks(1800);
      expect(session.status().alerts).toEqual([]);

      // Releasing the controls stops the rotation only (A18 (6)): over the next 20 hours the
      // attitude drifts within the controller's rate deadband. So level the ship first, nose
      // along the believed velocity and its top up, ten minutes before lifting.
      const LIFT_AT = 79_920; // 22.2 h
      session.stepTicks(LIFT_AT - 600 - session.status().t);
      const tilt = quat.angleBetween(
        world().ship.kinematics.attitude,
        quat.fromYaw(Math.atan2(believedVelocity().y, believedVelocity().x)),
      );
      expect(tilt).toBeGreaterThan(0.05);
      const v = believedVelocity();
      session.command({
        kind: 'attitude',
        target: { reference: 'inertial', attitude: quat.fromYaw(Math.atan2(v.y, v.x)) },
      });
      session.stepTicks(600);
      const vzBefore = world().ship.kinematics.velocity.z;
      const rcsBefore = rcs(world());
      session.fly(hold({ translate: { x: 0, y: 0, z: 1 } }));
      session.stepTicks(40);
      session.fly(HANDS_ON_NEUTRAL);
      await model.settled();
      session.stepTicks(1);
      facingSun();
      const lift = world().ship.kinematics.velocity.z - vzBefore;
      expect(lift).toBeGreaterThan(0.9);
      expect(lift).toBeLessThan(1.1);
      // 40 s of translation on the RCS: about 14 kg of the 300 kg load (measured after the
      // levelling turn).
      expect(rcsBefore - rcs(world())).toBeGreaterThan(10);
      expect(rcsBefore - rcs(world())).toBeLessThan(20);

      // The pass, judged on truth every ten minutes: past Beta the way the ring turns, well
      // above it.
      let pass = Infinity;
      let passAt = 0;
      let height = 0;
      while (session.status().t < 36 * HOUR) {
        session.stepTicks(600);
        const w = world();
        const d = distance(w.ship.kinematics.position, w.bodies[1]!.position);
        if (d < pass) {
          pass = d;
          passAt = session.status().t;
          height = w.ship.kinematics.position.z - w.bodies[1]!.position.z;
        }
      }
      expect(pass / 1e3).toBeGreaterThan(880);
      expect(pass / 1e3).toBeLessThan(1_050);
      expect(passAt / HOUR).toBeGreaterThan(29);
      expect(passAt / HOUR).toBeLessThan(31.5);
      expect(height).toBeGreaterThan(15_000);

      // Coast until the world judges the departure.
      while (session.status().outcome.kind === 'in-progress' && session.status().t < 90 * HOUR)
        session.stepTicks(HOUR);
      const status = session.status();
      expect(status.outcome).toMatchObject({ kind: 'completed', objective: 'depart' });
      expect(status.t / HOUR).toBeGreaterThan(55);
      expect(status.t / HOUR).toBeLessThan(75);
      const judged = departStatus(world());
      expect(judged.distance).toBeGreaterThan(DEPART.beyond);
      expect(judged.speed).toBeGreaterThan(DEPART.minSpeed + 5);
      // The objective's budget: 14 m/s of burn and 1 m/s of lift, inside 16.
      const spent = session.truth().objectives.deltaV ?? 0;
      expect(spent).toBeGreaterThan(14.5);
      expect(spent).toBeLessThanOrEqual(DEPART.maxDeltaV);

      // What Black Box kept: the objective reached, no contact, and one coasting forecast per
      // release of the controls, frozen, each from the moment of release.
      const record = blackBox.attempt(status.attemptId)!;
      expect(
        record.events.filter((e) => e.kind === 'objective').map((e) => [e.objective, e.status]),
      ).toEqual([['depart', 'reached']]);
      expect(record.events.some((e) => e.kind === 'contact')).toBe(false);
      expect(record.forecasts).toHaveLength(2);
      for (const forecast of record.forecasts) {
        expect(Object.isFrozen(forecast)).toBe(true);
        expect(forecast.inputs.plan.items).toEqual([]);
      }
      expect(record.forecasts.map((f) => f.issuedAt)).toEqual([BURN_AT + seconds, LIFT_AT + 40]);
    },
  );
});
