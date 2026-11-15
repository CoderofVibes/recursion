/**
 * The believed departure progress (S20, R17): what the screens show of a `depart` objective,
 * from belief only. The frame is the bodies' believed centre of mass, not Alpha; the Δv is the
 * gauges'; the verdict is the ship's own `objective` event.
 */

import { describe, expect, it } from 'vitest';
import { createGravityRange, DEPART, LAW } from '../content/gravity-range/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { departureProgress, initialDepartureTrack, recordVerdict } from './belief/departure.ts';
import { burnDuration, burnSteps, DEFAULT_BURN_AT } from './belief/maneuver.ts';
import { createStandInModel } from './belief/standin-model.ts';
import { createGameSession } from './session.ts';

const setup = createGravityRange();
const session = () =>
  createGameSession(setup, {
    model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
    blackBox: createBlackBox(),
    now: () => 'now',
  });

describe('believed departure progress', () => {
  it('at arrival: 1,800 km from the centre of mass, the gate and its conditions, nothing spent', () => {
    const s = session();
    s.stepTicks(60);
    const [d] = s.status().departure;
    expect(d).toMatchObject({
      objective: 'depart',
      status: 'pending',
      beyond: DEPART.beyond,
      minSpeed: DEPART.minSpeed,
      maxDeltaV: DEPART.maxDeltaV,
      gaugedDeltaV: 0,
    });
    // Truly 1,800 km: Alpha's 1,000 km orbit, 800 km from the centre of mass on the far side
    // from Beta. Believed nearer, about 1,710 km: the briefing weighs Beta light (2.2 against
    // 2.5 × 10⁹ m³/s²), which moves the believed centre 90 km toward Alpha.
    expect(d!.distance / 1e3).toBeGreaterThan(1_650);
    expect(d!.distance / 1e3).toBeLessThan(1_850);
    // In orbit about Alpha: barely moving outward.
    expect(Math.abs(d!.outward)).toBeLessThan(20);
    expect(d!.closest.alpha! / 1e3).toBeGreaterThan(990);
    expect(d!.closest.alpha! / 1e3).toBeLessThan(1_010);
  });

  it('the speed it judges is relative to the centre of mass, not to Alpha', () => {
    const s = session();
    s.stepTicks(60);
    const w = s.snapshot().world;
    const alpha = w.bodies.find((b) => b.id === 'alpha')!;
    const relAlpha = Math.hypot(
      w.ship.velocity.x - alpha.velocity.x,
      w.ship.velocity.y - alpha.velocity.y,
      w.ship.velocity.z - alpha.velocity.z,
    );
    const [d] = s.status().departure;
    // Alpha itself moves about the centre of mass, so the two differ by metres per second.
    expect(Math.abs(d!.speed - relAlpha)).toBeGreaterThan(1);
  });

  it('a 5 m/s burn shows on the gauges as about 5 m/s spent', { timeout: 60_000 }, async () => {
    const s = session();
    const mass = s.snapshot().world.ship.massProperties.mass;
    const duration = burnDuration(s.ship, mass, 5);
    await s.commit({
      items: burnSteps({
        at: DEFAULT_BURN_AT,
        duration,
        attitude: { reference: 'prograde' },
      }),
    });
    s.stepTicks(DEFAULT_BURN_AT + Math.ceil(duration) + 180);
    const [d] = s.status().departure;
    // The engine gives about 97.5% of its rating; the turn's RCS adds a little.
    expect(d!.gaugedDeltaV).toBeGreaterThan(4.6);
    expect(d!.gaugedDeltaV).toBeLessThan(5.6);
  });

  it("the verdict is the ship's own, the first one only", () => {
    const objective = setup.definition.briefing.objectives[0]!;
    const world = session().snapshot().world;
    let track = recordVerdict(initialDepartureTrack, 'depart', 'missed');
    track = recordVerdict(track, 'depart', 'reached');
    expect(departureProgress(objective, world, {}, track)?.status).toBe('missed');
  });
});
