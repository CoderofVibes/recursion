/**
 * Geometry helpers for the game layer, in three dimensions: body points and the hull in the
 * inertial frame, and the sensor scene.
 */

import { describe, expect, it } from 'vitest';
import type { HullPrism } from '../contracts/ship.ts';
import * as quat from '../lib/quat.ts';
import * as v3 from '../lib/vec3.ts';
import { bodyPointToWorld, hullInWorld, sensorTargets } from './snapshot.ts';
import { BOX_HULL, asteroid, body, makeWorld, massProps } from './test-helpers.ts';

describe('snapshot helpers in three dimensions', () => {
  /** Nose up: body +x along inertial +z, body +z along inertial −x. */
  const noseUp = quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, -Math.PI / 2);
  const mp = massProps({ centerOfMass: { x: 1, y: 0.5, z: -0.25 } });
  const kinematics = {
    position: { x: 100, y: 200, z: 300 },
    velocity: { x: 0, y: 0, z: 0 },
    attitude: noseUp,
    angularVelocity: { x: 0, y: 0, z: 0 },
  };

  it('a body point goes to position + R·(point − centre of mass)', () => {
    // 6 m ahead of the CoM along the body axis, 2 m above it: 6 m up, 2 m toward −x.
    const p = bodyPointToWorld({ x: 7, y: 0.5, z: 1.75 }, kinematics, mp);
    expect(p.x).toBeCloseTo(100 - 2, 12);
    expect(p.y).toBeCloseTo(200, 12);
    expect(p.z).toBeCloseTo(300 + 6, 12);
    expect(bodyPointToWorld(mp.centerOfMass, kinematics, mp)).toEqual(kinematics.position);
  });

  it('the hull comes back prism by prism, bottom outline then top outline', () => {
    const panel: HullPrism = {
      outline: [
        { x: -4, y: 2 },
        { x: 0, y: 2 },
        { x: 0, y: 6 },
      ],
      zMin: -0.1,
      zMax: 0.1,
    };
    const hull = [{ outline: BOX_HULL, zMin: -2, zMax: 2 }, panel];
    const corners = hullInWorld(kinematics, { ...mp, hull });
    expect(corners.map((c) => c.length)).toEqual([8, 6]);
    // Every corner is where its body point goes, and the box is still 14 × 4 × 4 m.
    hull.forEach((prism, i) => {
      const n = prism.outline.length;
      prism.outline.forEach((o, j) => {
        expect(corners[i]![j]).toEqual(
          bodyPointToWorld({ x: o.x, y: o.y, z: prism.zMin }, kinematics, mp),
        );
        expect(corners[i]![n + j]).toEqual(
          bodyPointToWorld({ x: o.x, y: o.y, z: prism.zMax }, kinematics, mp),
        );
      });
    });
    const box = corners[0]!;
    expect(v3.distance(box[0]!, box[1]!)).toBeCloseTo(14, 12); // along the body axis: now vertical
    expect(Math.abs(box[1]!.z - box[0]!.z)).toBeCloseTo(14, 12);
    expect(v3.distance(box[0]!, box[4]!)).toBeCloseTo(4, 12); // the hull's height: now along x
    expect(Math.abs(box[4]!.x - box[0]!.x)).toBeCloseTo(4, 12);
  });

  it('sensor targets are relative to the ship in all three axes', () => {
    const world = makeWorld({
      position: { x: 10, y: 20, z: 30 },
      velocity: { x: 1, y: 2, z: 3 },
      bodies: [body('alpha', 1e10, 1000, { x: 5e5, y: 0, z: -2e5 }, { x: 0, y: 4, z: 5 }, false)],
      asteroids: [asteroid('a-01', { x: 0, y: 100, z: 900 }, { x: -1, y: 0, z: 7 }, 12)],
    });
    expect(sensorTargets(world)).toEqual([
      {
        id: 'alpha',
        kind: 'body',
        relativePosition: { x: 5e5 - 10, y: -20, z: -2e5 - 30 },
        relativeVelocity: { x: -1, y: 2, z: 2 },
        radius: 1000,
      },
      {
        id: 'a-01',
        kind: 'asteroid',
        relativePosition: { x: -10, y: 80, z: 870 },
        relativeVelocity: { x: -2, y: -2, z: 4 },
        radius: 12,
      },
    ]);
  });
});
