import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import type { EnvironmentEffects, ShipSystemsState } from '../../contracts/truth/ship.ts';
import { fromAxisAngle, fromYaw, multiply, yawOf, type Quat } from '../../lib/quat.ts';
import { fromAzEl, type Vec3 } from '../../lib/vec3.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { environment, RESTING } from '../test-helpers.ts';
import { stepThermal } from '../thermal/index.ts';
import { stepPower } from './index.ts';
import { sunIncidence } from './sun.ts';

const definition = loadShipDefinition();
const NORMAL = baseline.generation.solar.arrayNormal;
const deg = Math.PI / 180;
const pitchUp = (angle: number): Quat => fromAxisAngle({ x: 0, y: -1, z: 0 }, angle);
const lit = (
  attitude: Quat,
  direction: Vec3,
  irradiance = 1361,
  state: ShipSystemsState = createShipSystemsState(definition),
): EnvironmentEffects =>
  environment(state, { ...RESTING, attitude }, { sunlight: { direction, irradiance } });

describe('sunlight in three dimensions (A3, C12, C13)', () => {
  it('the wings face along body +x, as the planar ship assumed', () => {
    expect(NORMAL).toEqual([1, 0, 0]);
  });

  it('in the plane is exactly the planar formula, cos(sun azimuth − yaw)', () => {
    for (const yaw of [0, 0.3, -1.2, 2.9, Math.PI]) {
      for (const azimuth of [0, 0.7, -2.2, 3.1, 200 * deg]) {
        const sun = { x: Math.cos(azimuth), y: Math.sin(azimuth), z: 0 };
        const attitude = fromYaw(yaw);
        // 2B's planar expression, to the bit.
        const planar = Math.max(0, Math.cos(Math.atan2(sun.y, sun.x) - yawOf(attitude)));
        expect(sunIncidence(lit(attitude, sun), NORMAL)).toBe(planar);
      }
    }
  });

  it('is the cosine of the angle between the sun and the array normal in space', () => {
    // Sun 30° above the plane, dead ahead of a level ship: cos 30°.
    expect(sunIncidence(lit(fromYaw(0), fromAzEl(0, 30 * deg)), NORMAL)).toBeCloseTo(
      Math.cos(30 * deg),
      14,
    );
    // Off to the side as well: the product of the two cosines (the planar ship would have
    // read cos 40° alone, ignoring the sun's height).
    expect(sunIncidence(lit(fromYaw(10 * deg), fromAzEl(50 * deg, 30 * deg)), NORMAL)).toBeCloseTo(
      Math.cos(30 * deg) * Math.cos(40 * deg),
      14,
    );
    // Pitch the nose up at the sun and the wings face it squarely.
    expect(sunIncidence(lit(pitchUp(30 * deg), fromAzEl(0, 30 * deg)), NORMAL)).toBeCloseTo(1, 14);
    // Yaw and pitch together, against a direct dot product.
    const attitude = multiply(fromYaw(0.8), pitchUp(-0.3));
    const sun = fromAzEl(1.4, 0.5);
    const nose = {
      x: Math.cos(0.8) * Math.cos(-0.3),
      y: Math.sin(0.8) * Math.cos(-0.3),
      z: Math.sin(-0.3),
    };
    expect(sunIncidence(lit(attitude, sun), NORMAL)).toBeCloseTo(
      nose.x * sun.x + nose.y * sun.y + nose.z * sun.z,
      14,
    );
    // Rolling about the nose changes nothing: the normal is the roll axis.
    const rolled = multiply(attitude, fromAxisAngle({ x: 1, y: 0, z: 0 }, 1.1));
    expect(sunIncidence(lit(rolled, sun), NORMAL)).toBeCloseTo(
      sunIncidence(lit(attitude, sun), NORMAL),
      14,
    );
    // The direction to the sun need not be a unit vector.
    expect(
      sunIncidence(lit(attitude, { x: 5 * sun.x, y: 5 * sun.y, z: 5 * sun.z }), NORMAL),
    ).toBeCloseTo(sunIncidence(lit(attitude, sun), NORMAL), 14);
  });

  it('is zero with the sun behind the wings, overhead of a level ship, or in shadow', () => {
    expect(sunIncidence(lit(fromYaw(0), { x: -1, y: 0, z: 0.2 }), NORMAL)).toBe(0);
    expect(sunIncidence(lit(fromYaw(0), { x: 0, y: 0, z: 1 }), NORMAL)).toBeCloseTo(0, 15);
    expect(sunIncidence(lit(pitchUp(90 * deg), { x: 0, y: 0, z: -1 }), NORMAL)).toBe(0);
    expect(sunIncidence(lit(fromYaw(0), { x: 1, y: 0, z: 0 }, 0), NORMAL)).toBe(0);
  });

  it('drives solar output through the same incidence', () => {
    // Wings deployed, dim light, so the wing's whole output is taken by the bus:
    // output = irradiance × area × efficiency × incidence.
    const base = createShipSystemsState(definition);
    const equipment = { ...base.equipment };
    for (const id of ['solar-left', 'solar-right'])
      equipment[id] = {
        ...equipment[id]!,
        mode: 'deployed',
        values: { ...equipment[id]!.values, deployment: 1 },
      };
    const state: ShipSystemsState = { ...base, equipment };
    const solar = baseline.generation.solar;
    const full = 100 * solar.areaPerWing * solar.efficiency;
    const output = (attitude: Quat, direction: Vec3) =>
      stepPower(state, definition, lit(attitude, direction, 100, state), 1).state.equipment[
        'solar-left'
      ]!.values.generatedPower!;
    expect(output(fromYaw(0), { x: 1, y: 0, z: 0 })).toBeCloseTo(full, 9);
    expect(output(fromYaw(0), fromAzEl(0, 60 * deg))).toBeCloseTo(full / 2, 9);
    expect(output(pitchUp(60 * deg), fromAzEl(0, 60 * deg))).toBeCloseTo(full, 9);
    expect(output(pitchUp(60 * deg), { x: 1, y: 0, z: 0 })).toBeCloseTo(full / 2, 9);
    expect(output(fromYaw(0), { x: 0, y: 0, z: 1 })).toBeCloseTo(0, 9);
  });

  it('heats the radiators through the same incidence', () => {
    const state = stepPower(
      createShipSystemsState(definition),
      definition,
      lit(fromYaw(0), { x: 1, y: 0, z: 0 }, 0),
      1,
    ).state;
    const rejected = (attitude: Quat, direction: Vec3, irradiance: number) =>
      (
        stepThermal(state, definition, lit(attitude, direction, irradiance, state), 10).state.ext!
          .thermal as unknown as { radiated: number }
      ).radiated;
    const dark = rejected(fromYaw(0), { x: 1, y: 0, z: 0 }, 0);
    const faced = rejected(fromYaw(0), { x: 1, y: 0, z: 0 }, 1361);
    const above = rejected(fromYaw(0), fromAzEl(0, 60 * deg), 1361);
    const behind = rejected(fromYaw(0), { x: -1, y: 0, z: 0 }, 1361);
    // Absorbed sunlight comes off the net rejection: none behind, and at 60° half of what the
    // wings absorb face on (0.15 × 1361 W/m² × 25 m² a wing; the loop warms a little, so the
    // halves agree to a part in 10⁵, not exactly).
    expect(behind).toBe(dark);
    expect(dark - faced).toBeGreaterThan(10000);
    expect((dark - above) / (dark - faced)).toBeCloseTo(0.5, 5);
  });
});
