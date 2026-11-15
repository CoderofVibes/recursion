import { describe, expect, it } from 'vitest';
import { fromRotationVector, rotate } from '../../lib/quat.ts';
import * as v3 from '../../lib/vec3.ts';
import { visibleWellIntervals } from './wells-visibility.ts';

const eye = v3.ZERO,
  forward = v3.UNIT_X;
const from = { x: 10, y: -10, z: 0 },
  to = { x: 10, y: 10, z: 0 };
describe('well contour clipping', () => {
  it('keeps the visible middle when both endpoints are outside the field of view', () => {
    const spans = visibleWellIntervals(from, to, eye, forward, Math.atan(0.5), []);
    expect(spans).toHaveLength(1);
    expect(spans[0]![0]).toBeCloseTo(0.25, 14);
    expect(spans[0]![1]).toBeCloseTo(0.75, 14);
  });
  it('splits a contour at the exact sphere silhouette', () => {
    const spans = visibleWellIntervals(from, to, eye, forward, Math.PI / 3, [
      { center: { x: 5, y: 0, z: 0 }, radius: 1 },
    ]);
    const edge = 10 / Math.sqrt(24);
    expect(spans).toHaveLength(2);
    expect(spans[0]![0]).toBe(0);
    expect(spans[0]![1]).toBeCloseTo((10 - edge) / 20, 14);
    expect(spans[1]![0]).toBeCloseTo((10 + edge) / 20, 14);
    expect(spans[1]![1]).toBe(1);
  });
  it('leaves emitters in front of an opaque object visible', () => {
    expect(
      visibleWellIntervals(from, to, eye, forward, Math.PI / 3, [
        { center: { x: 20, y: 0, z: 0 }, radius: 2 },
      ]),
    ).toEqual([[0, 1]]);
  });
  it('clips where an emitting segment enters a sphere, not only its angular silhouette', () => {
    const spans = visibleWellIntervals(
      { x: 1, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      eye,
      forward,
      0.5,
      [{ center: { x: 5, y: 0, z: 0 }, radius: 1 }],
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]![1]).toBeCloseTo(1 / 3, 14);
  });
  it('rejects rear light and an eye inside an opaque body', () => {
    expect(visibleWellIntervals(v3.scale(from, -1), v3.scale(to, -1), eye, forward, 1, [])).toEqual(
      [],
    );
    expect(visibleWellIntervals(from, to, eye, forward, 1, [{ center: eye, radius: 1 }])).toEqual(
      [],
    );
  });
  it('is invariant under a common arbitrary 3D rotation and translation', () => {
    const q = fromRotationVector({ x: 0.7, y: -1.2, z: 0.4 });
    const offset = { x: 70, y: -23, z: 11 };
    const transform = (p: v3.Vec3) => v3.add(rotate(q, p), offset);
    const sphere = { center: { x: 5, y: 0, z: 0 }, radius: 1 };
    const original = visibleWellIntervals(from, to, eye, forward, 1, [sphere]);
    const moved = visibleWellIntervals(
      transform(from),
      transform(to),
      transform(eye),
      rotate(q, forward),
      1,
      [{ ...sphere, center: transform(sphere.center) }],
    );
    expect(moved).toHaveLength(original.length);
    moved.forEach((s, i) => s.forEach((x, j) => expect(x).toBeCloseTo(original[i]![j]!, 12)));
  });
  it('retains a thin visible slit between overlapping silhouette boundaries', () => {
    const spans = visibleWellIntervals(from, to, eye, forward, Math.PI / 3, [
      { center: { x: 5, y: -1.00001, z: 0 }, radius: 1 },
      { center: { x: 5, y: 1.00001, z: 0 }, radius: 1 },
    ]);
    const middle = spans.find(([a, b]) => a < 0.5 && b > 0.5)!;
    expect(middle).toBeDefined();
    expect(middle[1] - middle[0]).toBeGreaterThan(0);
    expect(middle[1] - middle[0]).toBeLessThan(0.00001);
  });
});
