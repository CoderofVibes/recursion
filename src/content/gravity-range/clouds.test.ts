/**
 * The radiation crescent (A18 (2) after S21) in the game's own truth step: S21's field, in the
 * binary's turning frame, reaching every equipment item and the raw exposure account.
 */

import { describe, expect, it } from 'vitest';
import type { TruthWorld } from '../../contracts/truth/index.ts';
import { createBlackBox } from '../../game/belief/blackbox.ts';
import { createStandInModel } from '../../game/belief/standin-model.ts';
import { createGameSession } from '../../game/session.ts';
import { createTruthStepper } from '../../game/truth-step.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { binaryAxes, CRESCENT, crescentIntensity } from './clouds.ts';
import { createGravityRange, LAW } from './index.ts';

const setup = createGravityRange();
const w0 = setup.definition.world;
const DEG = Math.PI / 180;

/** A point at range r from Beta, azimuth a and elevation e (degrees) in the binary frame. */
function at(world: TruthWorld, r: number, a: number, e = 0): Vec3 {
  const f = binaryAxes(world);
  const c = Math.cos(e * DEG);
  const u = {
    x: c * Math.cos(a * DEG),
    y: c * Math.sin(a * DEG),
    z: Math.sin(e * DEG),
  };
  return {
    x: f.origin.x + r * (u.x * f.x.x + u.y * f.y.x + u.z * f.z.x),
    y: f.origin.y + r * (u.x * f.x.y + u.y * f.y.y + u.z * f.z.y),
    z: f.origin.z + r * (u.x * f.x.z + u.y * f.y.z + u.z * f.z.z),
  };
}

describe('the radiation crescent', () => {
  it('S21’s shape: 1,000–2,600 km out, −90° to −30°, every elevation, and the polar caps', () => {
    const f = binaryAxes(w0);
    const I = (r: number, a: number, e = 0) => crescentIntensity(at(w0, r, a, e), f);
    // Full inside its support, with the peak 0.05 U.
    expect(I(1_500_000, -60)).toBeCloseTo(CRESCENT.peak, 12);
    expect(I(2_000_000, -40, 60)).toBeCloseTo(CRESCENT.peak, 12);
    // The edges: nothing at 1,000 km or at −90°, full by 1,050 km and −85°.
    expect(I(999_000, -60)).toBe(0);
    expect(I(1_050_000, -60)).toBeCloseTo(CRESCENT.peak, 12);
    expect(I(1_500_000, -90.5)).toBe(0);
    expect(I(1_500_000, -85)).toBeCloseTo(CRESCENT.peak, 12);
    expect(I(1_500_000, -29.5)).toBe(0);
    expect(I(2_610_000, -60)).toBe(0);
    // Leading Beta, and at the 830 km target: nothing.
    expect(I(1_500_000, 60)).toBe(0);
    expect(I(830_000, -60)).toBe(0);
    // Over either pole, whatever the azimuth.
    expect(I(1_500_000, 120, 89)).toBeCloseTo(CRESCENT.peak, 12);
    expect(I(1_500_000, 120, -89)).toBeCloseTo(CRESCENT.peak, 12);
    // The frame: +x from Alpha to Beta, +z the orbit normal, right-handed.
    const [alpha, beta] = w0.bodies;
    const d = Math.hypot(
      beta!.position.x - alpha!.position.x,
      beta!.position.y - alpha!.position.y,
      beta!.position.z - alpha!.position.z,
    );
    expect(f.x.x).toBeCloseTo((beta!.position.x - alpha!.position.x) / d, 12);
    expect(f.z.z).toBeCloseTo(1, 9);
  });

  it('turns with the binary, not with the inertial frame', { timeout: 60_000 }, () => {
    const stepper = createTruthStepper(setup);
    let state = stepper.initial;
    for (let i = 0; i < 20_000; i++) state = stepper.step(state).state;
    const before = binaryAxes(w0);
    const after = binaryAxes(state.sim.world);
    // The line from Alpha to Beta has turned; the crescent's middle has turned with it.
    const turned = Math.acos(
      before.x.x * after.x.x + before.x.y * after.x.y + before.x.z * after.x.z,
    );
    expect(turned).toBeGreaterThan(0.1);
    const middle = at(state.sim.world, 1_500_000, -60);
    expect(crescentIntensity(middle, after)).toBeCloseTo(CRESCENT.peak, 12);
  });

  it('reaches every equipment item in the truth step and the raw exposure account', () => {
    const inside = at(w0, 1_500_000, -60);
    const placed = {
      ...setup,
      definition: {
        ...setup.definition,
        world: {
          ...w0,
          ship: { ...w0.ship, kinematics: { ...w0.ship.kinematics, position: inside } },
        },
      },
    };
    const stepper = createTruthStepper(placed);
    let state = stepper.initial;
    for (let i = 0; i < 10; i++) state = stepper.step(state).state;
    const exposure = state.exposure ?? {};
    const ids = setup.definition.ship.equipment.map((e) => e.id);
    expect(Object.keys(exposure).sort()).toEqual([...ids].sort());
    // 0.05 U for 10 s, raw (before susceptibility): S21's units.
    for (const id of ids) expect(exposure[id]).toBeCloseTo(0.5, 9);
    // At arrival, 1,000 km from Alpha and far from Beta: no clouds.
    const home = createTruthStepper(setup);
    expect(home.step(home.initial).state.exposure).toBeUndefined();
  });

  it(
    'harms the ship (3A): the caution first, a latch trips the cooling pumps, lost 120 s later',
    { timeout: 120_000 },
    () => {
      const beta = w0.bodies[1]!;
      const placed = {
        ...setup,
        definition: {
          ...setup.definition,
          world: {
            ...w0,
            ship: {
              ...w0.ship,
              kinematics: {
                ...w0.ship.kinematics,
                position: at(w0, 1_500_000, -60),
                velocity: beta.velocity,
              },
            },
          },
        },
      };
      const blackBox = createBlackBox();
      const s = createGameSession(placed, {
        model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
        blackBox,
        now: () => 'now',
      });
      let cautionAt: number | undefined;
      let warning: { since?: number; deadline?: number } | undefined;
      while (s.status().outcome.kind === 'in-progress' && s.status().t < 4_000) {
        s.stepTicks(1);
        for (const a of s.status().alerts) {
          if (a.id === 'radiation') cautionAt ??= s.status().t;
          if (a.id === 'critical-service') warning = a;
        }
      }
      // The radiation caution must come from the radiation monitor (A24, ledger R37), not from
      // each component's true dose, which 3A removed from the record (R35, P11). Until 2F wires
      // the monitor's caution, none is raised. This tripwire then fails; restore S21's figure,
      // a caution 20 s in (1 U s on a standard part at 0.05 U). Integrator, on merging 2F.
      expect(cautionAt).toBeUndefined();
      const outcome = s.status().outcome;
      expect(outcome).toMatchObject({ kind: 'lost', cause: 'power' });
      if (outcome.kind !== 'lost') throw new Error('not lost');
      // The latch bucket (20 U s) trips the active pumps at 400 s; nothing serves the cooling
      // for 120 s.
      const events = blackBox.attempt(s.status().attemptId)!.events;
      const trip = events.find(
        (e) =>
          e.kind === 'equipment-fault' && e.fault === 'overcurrent' && /pump-a$/.test(e.equipment),
      );
      expect(trip?.t).toBeCloseTo(400, 0);
      expect(outcome.t).toBeGreaterThanOrEqual(trip!.t + 120);
      expect(outcome.t).toBeLessThanOrEqual(trip!.t + 121);
      // The ship warned of it, with the deadline it met.
      expect(warning?.deadline).toBeDefined();
      expect(Math.abs(warning!.deadline! - outcome.t)).toBeLessThanOrEqual(2);
      // Upsets came and went before (reboots of 5 s, no loss).
      expect(events.some((e) => e.kind === 'equipment-recovered')).toBe(true);
    },
  );
});
