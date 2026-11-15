/**
 * The radiation crescent (A18 (2) after S21) in the game's own truth step: S21's field, in the
 * binary's turning frame, reaching every equipment item and the raw exposure account.
 */

import { describe, expect, it } from 'vitest';
import type { TruthWorld } from '../../contracts/truth/index.ts';
import { createTruthStepper } from '../../game/truth-step.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { binaryAxes, CRESCENT, crescentIntensity } from './clouds.ts';
import { createGravityRange } from './index.ts';

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
});
