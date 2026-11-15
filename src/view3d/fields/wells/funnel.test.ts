import {
  Group,
  LineSegments,
  Vector3,
  type BufferGeometry,
  type LineBasicMaterial,
  type Mesh,
} from 'three';
import { describe, expect, it } from 'vitest';
import type { BelievedField, JsonValue } from '../../../contracts/index.ts';
import { viewSnapshot } from '../../../contracts/fixtures/index.ts';
import { lineStyles, render } from '../../../theme/index.ts';
import { toScene } from '../../adapter.ts';
import { LineSet } from '../../gfx.ts';
import { makeWellView } from './index.ts';
import {
  makeOpticalFunnelView,
  orientedFunnelGeometry,
  readWellFunnelVisual,
  readWindowFunnelVisual,
  type WellFunnelVisual,
  type WindowFunnelVisual,
} from './funnel.ts';

const acquired: WellFunnelVisual = {
  schema: 'well-funnel-observation-v2',
  phase: 'precursor',
  brightness: 0.3,
  provenance: {
    attemptId: 'A3',
    frameId: 'P03',
    measurementIds: ['image-17'],
    from: 0,
    to: 10,
    current: true,
  },
  validUntil: 20,
  support: 'supported',
  rule: 'ordinary',
  responses: [],
  geometry: {
    mouth: { x: 100, y: 200, z: 300 },
    axis: { x: 0.6, y: 0, z: 0.8 },
    mouthSigma: 3,
    axisSigma: 0.001,
    length: { value: 20_000, sigma: 50 },
    mouthRadius: { value: 2_000, sigma: 10 },
    throatRadius: { value: 100, sigma: 2 },
    stations: [
      { fraction: 0, radius: { value: 2_000, sigma: 10 } },
      { fraction: 0.4, radius: { value: 700, sigma: 5 } },
      { fraction: 1, radius: { value: 100, sigma: 2 } },
    ],
  },
};
const field = (v: unknown = acquired): BelievedField => ({
  id: 'visible-W',
  kind: 'inverse-well',
  detected: true,
  visual: v as JsonValue,
});
const optical: WindowFunnelVisual = {
  schema: 'well-optical-v1',
  observedAt: 10,
  visible: true,
  phase: 'precursor',
  brightness: 0.3,
  segments: [
    { from: { x: 1, y: 0, z: 0 }, to: { x: 0.6, y: 0.8, z: 0 }, depth: 0 },
    { from: { x: 0.6, y: 0.8, z: 0 }, to: { x: 0, y: 0.8, z: 0.6 }, depth: 1 },
  ],
};

describe('A19 observed physical funnel', () => {
  it('requires acquired brightness and accepts visible phases without an inhibition diagnosis', () => {
    for (const phase of ['precursor', 'ramping', 'active', 'fading']) {
      expect(readWellFunnelVisual(field({ ...acquired, phase }))?.phase).toBe(phase);
      expect(readWindowFunnelVisual({ ...optical, phase })?.phase).toBe(phase);
    }
    for (const brightness of [undefined, -0.1, 1.1, NaN]) {
      expect(readWellFunnelVisual(field({ ...acquired, brightness }))).toBeUndefined();
      expect(readWindowFunnelVisual({ ...optical, brightness })).toBeUndefined();
    }
    expect(readWindowFunnelVisual({ ...optical, phase: 'cancelled' })).toBeUndefined();
  });
  it('requires acquired profile stations and a unit axis without default physical dimensions', () => {
    expect(readWellFunnelVisual(field())).toEqual(acquired);
    for (const patch of [
      { axis: { x: 0, y: 2, z: 0 } },
      { axisSigma: -1 },
      { mouthSigma: NaN },
      { stations: [] },
      { stations: [...acquired.geometry.stations].reverse() },
      { stations: acquired.geometry.stations.slice(1) },
      { throatRadius: { value: 2_001, sigma: 1 } },
    ])
      expect(
        readWellFunnelVisual(field({ ...acquired, geometry: { ...acquired.geometry, ...patch } })),
      ).toBeUndefined();
    expect(readWellFunnelVisual(field({ ...acquired, geometry: undefined }))).toBeUndefined();
    expect(
      readWellFunnelVisual(
        field({ ...acquired, provenance: { ...acquired.provenance, measurementIds: [] } }),
      ),
    ).toBeUndefined();
  });

  it('uses supplied stations, including the throat, without inventing a taper between observations', () => {
    const geometry = orientedFunnelGeometry(acquired.geometry);
    const positions = geometry.getAttribute('position');
    expect(positions.count).toBe((3 + 2) * render.well.meridians * 2);
    const lengths = new Set<number>();
    for (let i = 0; i < positions.count; i++) lengths.add(positions.getY(i));
    expect([...lengths]).toEqual([0, 8_000, 20_000]);
    geometry.dispose();
  });

  it('orients physical contours from measured mouth toward throat; v2 never uses spherical bounds', () => {
    const group = new Group();
    const lines = new LineSet();
    const view = makeWellView({ group, lines });
    const update = (v: unknown, t = 10) =>
      view.update({
        field: field(v),
        snapshot: { ...viewSnapshot, t },
        scale: 1,
        radius: 1,
        inside: () => true,
        dt: 0.1,
        time: 0,
      });
    update(acquired);
    expect(group.children).toHaveLength(1);
    const pose = group.children[0]!;
    expect(pose).toBeInstanceOf(Group);
    group.updateMatrixWorld(true);
    const throat = new Vector3(0, acquired.geometry.length.value, 0).applyMatrix4(pose.matrixWorld);
    const expected = toScene(acquired.geometry.mouth).addScaledVector(
      toScene(acquired.geometry.axis),
      acquired.geometry.length.value,
    );
    expect(throat.distanceTo(expected)).toBeLessThan(1e-9);
    const wire = pose.children[1] as LineSegments;
    expect(pose.userData.phase).toBe('precursor');
    update({ ...acquired, phase: 'active' });
    expect(pose.userData.phase).toBe('active');
    update(acquired, 21);
    expect(pose.visible).toBe(true);
    expect(wire.visible).toBe(false);
    update({ ...acquired, support: 'unresolved' });
    expect(pose.visible).toBe(false);
    update({ ...acquired, provenance: { ...acquired.provenance, current: false } });
    expect(pose.visible).toBe(false);
    update({ ...acquired, geometry: { axis: [0, 1, 0], radius: 50_000 } });
    expect(group.children).toHaveLength(0);
    view.dispose();
    lines.dispose();
  });

  it('rotates the same measured shape consistently without changing dimensions', () => {
    const group = new Group();
    const lines = new LineSet();
    const view = makeWellView({ group, lines });
    for (const axis of [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: -1, z: 0 },
      { x: -0.8, y: 0, z: 0.6 },
      // Accepted rounding error near the antiparallel branch must not snap away this tilt.
      { x: 0.001, y: 0, z: -1 },
    ]) {
      view.update({
        field: field({ ...acquired, geometry: { ...acquired.geometry, axis } }),
        snapshot: { ...viewSnapshot, t: 10 },
        scale: 1,
        radius: 1,
        inside: () => true,
        dt: 0.1,
        time: 0,
      });
      const pose = group.children[0]!;
      const direction = new Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
      expect(direction.distanceTo(toScene(axis).normalize())).toBeLessThan(1e-12);
    }
    view.dispose();
    lines.dispose();
  });

  it('keeps contour buffers during tracked pose changes and refreshes only changed local geometry', () => {
    const group = new Group();
    const lines = new LineSet();
    const view = makeWellView({ group, lines });
    const update = (geometry: WellFunnelVisual['geometry']) =>
      view.update({
        field: field({ ...acquired, geometry }),
        snapshot: { ...viewSnapshot, t: 10 },
        scale: 1,
        radius: 1,
        inside: () => true,
        dt: 0.1,
        time: 0,
      });
    update(acquired.geometry);
    const pose = group.children[0]!;
    const wire = pose.children[1] as LineSegments;
    const bounds = pose.children[0] as Mesh;
    const originalShape = wire.geometry;
    const originalBounds = bounds.geometry;
    let released = 0;
    originalShape.addEventListener('dispose', () => {
      released++;
    });
    const moved = {
      ...acquired.geometry,
      mouth: { x: 400, y: 500, z: 600 },
      axis: { x: 0, y: 1, z: 0 },
    };
    update(moved);
    expect(wire.geometry).toBe(originalShape);
    expect(bounds.geometry).toBe(originalBounds);
    expect(pose.position.toArray()).toEqual([400, 600, -500]);
    expect(released).toBe(0);
    update({ ...moved, mouthSigma: moved.mouthSigma + 1 });
    expect(wire.geometry).toBe(originalShape);
    expect(bounds.geometry).not.toBe(originalBounds);
    update({ ...moved, length: { ...moved.length, value: moved.length.value + 100 } });
    expect(wire.geometry).not.toBe(originalShape);
    expect(released).toBe(1);
    view.dispose();
    lines.dispose();
  });
});

describe('visible funnel through the window', () => {
  it('uses supplied brightness and contour completion through precursor, ramp and fade without a local timer', () => {
    const group = new Group();
    const view = makeOpticalFunnelView(group, 300);
    const wire = group.children[0] as LineSegments<BufferGeometry, LineBasicMaterial>;
    view.update(optical, 10);
    const geometry = wire.geometry;
    const dim = lineStyles.wellMouth.opacity * optical.brightness;
    expect(wire.material.opacity).toBe(dim);
    // A long time interval and a phase label alone cannot manufacture brighter light.
    view.update({ ...optical, observedAt: 3_600, phase: 'ramping' }, 3_600);
    expect(wire.material.opacity).toBe(dim);
    expect(wire.geometry).toBe(geometry);
    view.update({ ...optical, phase: 'ramping', brightness: 0.7 }, 10);
    expect(wire.material.opacity).toBe(lineStyles.wellMouth.opacity * 0.7);
    expect(wire.geometry).toBe(geometry);
    view.update({ ...optical, phase: 'active', brightness: 1 }, 10);
    expect(wire.material.opacity).toBe(lineStyles.wellMouth.opacity);
    view.update(
      { ...optical, phase: 'fading', brightness: 0.1, segments: optical.segments.slice(0, 1) },
      10,
    );
    expect(wire.material.opacity).toBe(lineStyles.wellMouth.opacity * 0.1);
    expect(wire.geometry.getAttribute('position').count).toBe(2);
    expect(wire.userData.phase).toBe('fading');
    view.update({ ...optical, phase: 'fading', brightness: 0 }, 10);
    expect(wire.visible).toBe(false);
    view.dispose();
  });

  it('accepts only angular contour rays and never infers range from a measured FLIGHT shape', () => {
    expect(readWindowFunnelVisual(optical)).toEqual(optical);
    expect(readWindowFunnelVisual(acquired)).toBeUndefined();
    expect(
      readWindowFunnelVisual({
        ...optical,
        segments: [{ from: { x: 10, y: 0, z: 0 }, to: { x: 0, y: 1, z: 0 }, depth: 0 }],
      }),
    ).toBeUndefined();
    const group = new Group();
    const view = makeOpticalFunnelView(group, 300);
    view.update({ ...optical, hiddenRange: 9e9 }, 10);
    const wire = group.children[0] as LineSegments;
    expect(wire.visible).toBe(true);
    const positions = wire.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      expect(Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i))).toBeCloseTo(
        300,
        5,
      );
    }
    const before = Array.from(positions.array);
    view.update({ ...optical, hiddenRange: 1 }, 10);
    expect(Array.from(wire.geometry.getAttribute('position').array)).toEqual(before);
    view.dispose();
  });

  it('draws precursor and active states only when observed, then hides occluded or old eye frames', () => {
    const group = new Group();
    const view = makeOpticalFunnelView(group, 300);
    const wire = group.children[0] as LineSegments<BufferGeometry, LineBasicMaterial>;
    view.update(optical, 10);
    expect(wire.material.opacity).toBe(lineStyles.wellMouth.opacity * optical.brightness);
    view.update({ ...optical, phase: 'active' }, 10);
    expect(wire.userData.phase).toBe('active');
    view.update({ ...optical, visible: false }, 10);
    expect(wire.visible).toBe(false);
    view.update(optical, 11);
    expect(wire.visible).toBe(false);
    view.update(optical, 9);
    expect(wire.visible).toBe(false);
    view.dispose();
    expect(group.children).toHaveLength(0);
  });

  it('normalizes accepted rounded rays onto the presentation shell', () => {
    const group = new Group();
    const view = makeOpticalFunnelView(group, 300);
    view.update(
      {
        ...optical,
        segments: [{ from: { x: 0.001, y: -1, z: 0 }, to: { x: 0, y: 1.0000005, z: 0 }, depth: 0 }],
      },
      10,
    );
    const wire = group.children[0] as LineSegments;
    expect(wire.visible).toBe(true);
    const positions = wire.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      expect(
        Math.abs(Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)) - 300),
      ).toBeLessThan(2e-5);
    }
    view.dispose();
  });
});
