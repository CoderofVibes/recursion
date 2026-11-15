import {
  Group,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  type LineSegments,
  type Mesh,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it } from 'vitest';
import { viewSnapshot } from '../../contracts/fixtures/index.ts';
import type { ViewSnapshot, WindowFunnel } from '../../contracts/index.ts';
import { buildOutside } from '../room/outside.ts';
import { createDeepSky } from '../sky/index.ts';
import { createCloudLight } from './clouds.ts';
import { makeFunnelLight, precursorCoverage } from './funnels.ts';
import { opticalFields } from './window-light.ts';

const ray = (x: number, z: number) => {
  const d = new Vector3(x, 1, z).normalize();
  return { x: d.x, y: d.y, z: d.z };
};
const funnel: WindowFunnel = {
  kind: 'funnel',
  id: 'optical-only',
  schema: 'well-optical-v1',
  observedAt: 0,
  visible: true,
  phase: 'active',
  brightness: 0.8,
  segments: [
    { from: ray(-0.1, 0), to: ray(0.1, 0), depth: 1 },
    { from: ray(0.02, -0.2), to: ray(0, -0.22), depth: 0 },
  ],
};
describe('window light integration', () => {
  it('preserves a large body’s supplied angular radius, including close passes', () => {
    const scene = new Scene(),
      outside = buildOutside(scene);
    for (const angularRadius of [0.02, 0.5, 1.2]) {
      outside.update({
        ...viewSnapshot,
        window: {
          sunlit: false,
          objects: [
            {
              id: 'limb',
              kind: 'body',
              direction: { x: 1, y: 0, z: 0 },
              angularRadius,
              lit: false,
            },
          ],
        },
      });
      const body = scene.getObjectByName('window-body:limb') as Mesh;
      expect(Math.asin(body.scale.x / body.position.length())).toBeCloseTo(angularRadius, 12);
    }
    outside.dispose();
  });
  it('drops malformed optical arcs without throwing or publishing a partial funnel', () => {
    const renderer = makeFunnelLight({
      displayRadius: 100,
      sliceMs: 100,
      minSegments: 1,
      segmentsPerDegree: 1,
    });
    const malformed = {
      ...funnel,
      segments: [
        funnel.segments[0],
        { from: null },
        ...Array.from({ length: 80 }, () => funnel.segments[0]),
      ],
    };
    expect(() =>
      renderer.update(opticalFields({ fields: [malformed] }), 0, new Quaternion(), 0),
    ).not.toThrow();
    expect(
      renderer.update(opticalFields({ fields: [malformed] }), 0, new Quaternion(), 1000).drawn,
    ).toBe(0);
    renderer.dispose();
  });
  it('renders the promoted contract without using a believed or truth field', () => {
    const renderer = makeFunnelLight({ displayRadius: 100, sliceMs: 100 });
    const fields = opticalFields({ fields: [funnel] });
    expect(fields[0]?.visual).toBe(funnel);
    const stats = renderer.update(fields, 0, new Quaternion(), 0);
    expect(stats.drawn).toBe(1);
    expect(stats.segments).toBe(2);
    const lines = renderer.object.children.find((c) => c.visible) as LineSegments;
    const colours = lines.geometry.getAttribute('color');
    // The published 3B coordinate is 0 at the throat, 1 at the mouth.
    expect(colours.getX(2)).toBeGreaterThan(colours.getX(0));
    expect(colours.getY(2)).toBeGreaterThan(colours.getY(0));
    expect(renderer.update(fields, 1, new Quaternion(), 1000).drawn).toBe(0);
    renderer.dispose();
  });
  it('joins precursor dots monotonically from reported light, with no time animation', () => {
    expect(precursorCoverage('precursor', 1)).toBeLessThan(1);
    expect(precursorCoverage('ramping', 0)).toBe(precursorCoverage('precursor', 0));
    expect(precursorCoverage('ramping', 0.5)).toBeGreaterThan(precursorCoverage('ramping', 0));
    expect(precursorCoverage('ramping', 1)).toBe(precursorCoverage('active', 1));
    expect(precursorCoverage('ramping', 0.5, 1)).toBe(1);
    expect(precursorCoverage('ramping', 0.5, 0)).toBe(0.24);
    for (const depth of [0, 0.25, 0.5, 0.75, 1]) {
      const ramp = [0, 0.25, 0.5, 0.75, 1].map((b) => precursorCoverage('ramping', b, depth));
      expect(ramp).toEqual([...ramp].sort((a, b) => a - b));
      expect(ramp.at(-1)).toBe(1);
    }
  });
  it('removes absent clouds and rejects non-finite optical patches', () => {
    const clouds = createCloudLight(100);
    clouds.update(
      [
        {
          kind: 'cloud-bank',
          id: 'bank',
          patches: [
            { direction: ray(0, 0), angularRadius: 0.1, brightness: 1 },
            { direction: ray(0, 0), angularRadius: NaN, brightness: 1 },
          ],
        },
      ],
      new Quaternion(),
    );
    expect(clouds.object.geometry.instanceCount).toBe(1);
    clouds.update([], new Quaternion());
    expect(clouds.object.visible).toBe(false);
    expect(clouds.object.geometry.instanceCount).toBe(0);
    clouds.dispose();
  });
  it('replaces the whole arrival sky during the home shot and releases the scene', () => {
    const scene = new Scene(),
      outside = buildOutside(scene);
    const snapshot = {
      ...viewSnapshot,
      window: { sunlit: false, objects: [], fields: [] },
    } as ViewSnapshot;
    outside.update(snapshot);
    const sky = scene.getObjectByName('deep-sky')!;
    const setPiece = new Group();
    outside.setScenery(setPiece);
    expect(sky.parent?.visible).toBe(false);
    outside.setScenery(null);
    expect(sky.parent?.visible).toBe(true);
    outside.dispose();
    expect(scene.children).toHaveLength(0);
  });
  it('keeps celestial parallax at zero when walking under a rotated parent', () => {
    const sky = createDeepSky(),
      parent = new Group();
    parent.position.set(0, 1.6, 0);
    parent.rotation.y = 1.2;
    parent.add(sky.object);
    const camera = new PerspectiveCamera();
    camera.position.set(2, 1.7, -1);
    sky.followEye(camera, { getPixelRatio: () => 1 } as WebGLRenderer);
    const position = sky.object.getWorldPosition(new Vector3());
    expect(position.distanceTo(camera.position)).toBeLessThan(1e-12);
    sky.dispose();
  });
});
