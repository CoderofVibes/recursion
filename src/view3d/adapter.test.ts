/**
 * The adapter reads planar and three-dimensional contracts alike (DECISIONS A11): the views
 * draw in 3D from the start, and the switch at 2G's lift is a change in adapter.ts only.
 */
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  attitudeToScene,
  bodyToDrawing,
  chartView,
  coverageCones,
  distance,
  heading,
  hullOutline,
  pitch,
  sigmaMajor,
  toScene,
  turnRates,
  yawInertia,
} from './adapter.ts';

const close = (a: Vector3, b: [number, number, number]): void => {
  expect(a.x).toBeCloseTo(b[0], 9);
  expect(a.y).toBeCloseTo(b[1], 9);
  expect(a.z).toBeCloseTo(b[2], 9);
};

/** Body-to-inertial quaternion of a yaw about game +z, scalar first as 2G's `fromYaw` gives it. */
const fromYaw = (psi: number) => ({ w: Math.cos(psi / 2), x: 0, y: 0, z: Math.sin(psi / 2) });

describe('positions', () => {
  it('maps game (x, y, z) to scene (x, z, -y), planar or not', () => {
    close(toScene({ x: 1, y: 2 }), [1, 0, -2]);
    close(toScene({ x: 1, y: 2, z: 3 }), [1, 3, -2]);
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 6 })).toBe(7);
  });

  it('puts a body-frame point into the ship drawing: forward is -z, left is -x, up is +y', () => {
    close(bodyToDrawing({ x: 8, y: 0 }), [0, 0, -8]);
    close(bodyToDrawing({ x: 0, y: 2.5 }), [-2.5, 0, 0]);
    close(bodyToDrawing({ x: 0, y: 0, z: 1 }), [0, 1, 0]);
  });

  it('reads the nose pitched up or down, and none for a planar attitude', () => {
    const up = 0.5;
    // Body +x turned toward +z: a rotation about −y.
    expect(pitch({ w: Math.cos(up / 2), x: 0, y: -Math.sin(up / 2), z: 0 })).toBeCloseTo(up, 12);
    expect(pitch(fromYaw(1.2))).toBeCloseTo(0, 12);
    expect(pitch(0.7)).toBe(0);
  });

  it("draws the game's chart on the same axes as everything else", () => {
    const view = chartView({
      regions: [
        {
          id: 'here',
          name: 'HERE',
          position: { x: 1, y: 2, z: 3 },
          radius: 5,
          surveyed: 0.5,
          current: true,
          attempts: [{ index: 1, outcome: 'lost' }],
        },
      ],
      corridors: [],
      leads: [{ id: 'l', name: 'L', from: 'here', direction: { x: 0, y: 1, z: 0 }, spread: 0.1 }],
      reach: 9,
    });
    expect(view.regions[0]?.position).toEqual([1, 3, -2]);
    expect(view.leads[0]?.direction).toEqual([0, 0, -1]);
    expect(view.regions[0]?.attempts).toEqual([{ index: 1, outcome: 'lost' }]);
    expect(view.reach).toBe(9);
  });
});

describe('uncertainty', () => {
  it('gives the longest one-sigma axis of a planar covariance', () => {
    expect(sigmaMajor([25, 0, 9])).toBeCloseTo(5, 9);
    // Rotated 45°: eigenvalues 16 and 4.
    expect(sigmaMajor([10, 6, 10])).toBeCloseTo(4, 9);
  });

  it('gives the same for the six-term covariance the lift brings', () => {
    expect(sigmaMajor([25, 0, 0, 9, 0, 4])).toBeCloseTo(5, 6);
    expect(sigmaMajor([4, 0, 0, 9, 0, 49])).toBeCloseTo(7, 6);
    // A planar covariance lifted with no out-of-plane term agrees with its planar form.
    expect(sigmaMajor([10, 6, 0, 10, 0, 0])).toBeCloseTo(sigmaMajor([10, 6, 10]), 6);
  });
});

describe('attitude', () => {
  const nose = (attitude: unknown): Vector3 =>
    new Vector3(0, 0, -1).applyQuaternion(attitudeToScene(attitude));
  const left = (attitude: unknown): Vector3 =>
    new Vector3(-1, 0, 0).applyQuaternion(attitudeToScene(attitude));

  it('turns the drawing so its nose lies along the body axis', () => {
    // Yaw 0: body +x is game +x, which is scene +x.
    close(nose(0), [1, 0, 0]);
    // Yaw 90°: body +x is game +y, which is scene -z.
    close(nose(Math.PI / 2), [0, 0, -1]);
    // The ship's left stays to the left of its nose, seen from above.
    close(left(0), [0, 0, -1]);
  });

  it('reads a quaternion to the same rotation as the yaw it came from', () => {
    for (const psi of [0, 0.3, 1.2, -2.5, Math.PI]) {
      const a = nose(psi);
      const b = nose(fromYaw(psi));
      close(b, [a.x, a.y, a.z]);
      const l = left(fromYaw(psi));
      const m = left(psi);
      close(l, [m.x, m.y, m.z]);
      expect(Math.cos(heading(fromYaw(psi)))).toBeCloseTo(Math.cos(psi), 9);
      expect(Math.sin(heading(fromYaw(psi)))).toBeCloseTo(Math.sin(psi), 9);
    }
  });

  it('pitches the nose up out of the plane for a quaternion that does', () => {
    // Body +x raised 30° toward game +z: a rotation of -30° about body +y.
    const a = -Math.PI / 6;
    const q = { w: Math.cos(a / 2), x: 0, y: Math.sin(a / 2), z: 0 };
    const n = nose(q);
    expect(n.y).toBeCloseTo(0.5, 9);
    expect(n.x).toBeCloseTo(Math.cos(Math.PI / 6), 9);
  });

  it('reads turn rates from either contract', () => {
    expect(turnRates({ angularRate: 0.02 })).toEqual({ yaw: 0.02, pitch: 0 });
    expect(turnRates({ angularVelocity: { x: 0, y: 0.01, z: 0.02 } })).toEqual({
      yaw: 0.02,
      pitch: 0.01,
    });
    expect(yawInertia(3e5)).toBe(3e5);
  });
});

describe('coverage and hull', () => {
  it('turns a planar sector into a cone in the plane', () => {
    const [cone] = coverageCones({
      sectors: [
        { sensor: 'camera', center: Math.PI / 2, halfWidth: 0.5, range: 6e6, quality: 0.6 },
      ],
    });
    expect(cone).toBeDefined();
    close(cone!.axis, [0, 0, -1]);
    expect(cone!.bearing).toBeCloseTo(Math.PI / 2, 9);
    expect(cone!.halfAngle).toBe(0.5);
  });

  it('takes a three-dimensional cone as it is', () => {
    const [cone] = coverageCones({
      cones: [
        { sensor: 'camera', axis: { x: 0, y: 0, z: 2 }, halfAngle: 0.4, range: 1e6, quality: 1 },
      ],
    });
    close(cone!.axis, [0, 1, 0]);
    expect(cone!.halfAngle).toBe(0.4);
  });

  it('draws the footprint, one prism as it is, or the envelope of several', () => {
    const footprint = [
      { x: -8, y: -2.5 },
      { x: 8, y: -2.5 },
      { x: 8, y: 2.5 },
      { x: -8, y: 2.5 },
    ];
    expect(hullOutline({ footprint })).toBe(footprint);
    const wings = [
      { x: -4, y: -10 },
      { x: 1, y: -10 },
      { x: 1, y: 10 },
      { x: -4, y: 10 },
    ];
    // One prism: its own outline. Several (the 3D ship's pressure hull and wings): the convex
    // envelope of them all, counter-clockwise, which is the footprint the planar game drew.
    expect(hullOutline({ hull: [{ outline: wings }] })).toBe(wings);
    expect(hullOutline({ hull: [{ outline: footprint }, { outline: wings }] })).toEqual([
      { x: -8, y: -2.5 },
      { x: -4, y: -10 },
      { x: 1, y: -10 },
      { x: 8, y: -2.5 },
      { x: 8, y: 2.5 },
      { x: 1, y: 10 },
      { x: -4, y: 10 },
      { x: -8, y: 2.5 },
    ]);
    expect(hullOutline({})).toEqual([]);
  });
});
