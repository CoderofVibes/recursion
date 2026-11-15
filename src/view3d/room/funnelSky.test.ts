/**
 * The wells' funnels in the window, all in one draw: what the walls hide is culled, what looks
 * small keeps fewer segments, and some 2,600 sites fit the budget.
 */
import { LineSegments, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import type { WindowField } from '../adapter.ts';
import { FUNNEL_KIND, makeFunnelSky } from './funnelSky.ts';
import type { FunnelSky, FunnelSkyOptions } from './funnelSky.ts';

type V = { x: number; y: number; z: number };
const unit = (v: V): V => {
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};

/** A funnel seen along `toward` (game frame), of apparent radius `radius` rad: rings of rays. */
function funnel(id: string, toward: V, radius: number, t = 100, brightness = 0.8): WindowField {
  const w = unit(toward);
  const u = unit(Math.abs(w.z) < 0.9 ? { x: -w.y, y: w.x, z: 0 } : { x: 0, y: -w.z, z: w.y });
  const v = { x: w.y * u.z - w.z * u.y, y: w.z * u.x - w.x * u.z, z: w.x * u.y - w.y * u.x };
  const ray = (r: number, a: number): V =>
    unit({
      x: w.x + r * (Math.cos(a) * u.x + Math.sin(a) * v.x),
      y: w.y + r * (Math.cos(a) * u.y + Math.sin(a) * v.y),
      z: w.z + r * (Math.cos(a) * u.z + Math.sin(a) * v.z),
    });
  const segments: { from: V; to: V; depth: number }[] = [];
  const stations = 6;
  const around = 24;
  for (let s = 0; s < stations; s++) {
    const r = radius * (1 - s / stations);
    for (let i = 0; i < around; i++) {
      const a0 = (i / around) * Math.PI * 2;
      const a1 = ((i + 1) / around) * Math.PI * 2;
      segments.push({ from: ray(r, a0), to: ray(r, a1), depth: s / stations });
      segments.push({
        from: ray(r, a0),
        to: ray(radius * (1 - (s + 1) / stations), a0),
        depth: s / stations,
      });
    }
  }
  return {
    id,
    kind: FUNNEL_KIND,
    visual: {
      schema: 'well-optical-v1',
      observedAt: t,
      visible: true,
      phase: 'active',
      brightness,
      segments,
    },
  };
}

const ahead: V = { x: 0, y: 1, z: 0 }; // game +y is scene −z: out of the window
const behind: V = { x: 0, y: -1, z: 0 };
const none = new Quaternion();
/** A sky that finishes each rebuild in one call, for the tests that are not about slicing. */
const whole = (options: Partial<FunnelSkyOptions> = {}): FunnelSky =>
  makeFunnelSky({ displayRadius: 3000, sliceMs: Infinity, ...options });
/** The buffer on show, if any. */
const shownLines = (sky: FunnelSky): LineSegments | undefined =>
  sky.object.children.find((c): c is LineSegments => c instanceof LineSegments && c.visible);

describe('the funnel sky', () => {
  it('draws a funnel out of the window and culls one behind the walls', () => {
    const sky = whole();
    const stats = sky.update([funnel('a', ahead, 0.05), funnel('b', behind, 0.05)], 100, none);
    expect(stats).toMatchObject({ offered: 2, culled: 1, drawn: 1 });
    expect(stats.segments).toBeGreaterThan(0);
    expect(shownLines(sky)?.geometry.drawRange.count).toBe(stats.segments * 2);
    sky.dispose();
  });

  it('draws nothing unlit, unseen in this eye frame, or of another kind', () => {
    const sky = whole();
    const old = funnel('old', ahead, 0.05, 99);
    const dark = funnel('dark', ahead, 0.05, 100, 0);
    const other = { ...funnel('x', ahead, 0.05), kind: 'something-else' };
    const stats = sky.update([old, dark, other], 100, none);
    expect(stats).toMatchObject({ offered: 2, culled: 2, drawn: 0, segments: 0 });
    expect(shownLines(sky)).toBeUndefined();
    sky.dispose();
  });

  it('keeps fewer segments for a funnel that looks small', () => {
    const sky = whole({ segmentsPerDegree: 24, minSegments: 12 });
    const big = sky.update([funnel('big', ahead, 0.2)], 100, none, 0);
    const small = sky.update([funnel('small', ahead, 0.002)], 100, none, 1000);
    expect(small.thinned).toBe(1);
    expect(small.segments).toBeLessThan(big.segments);
    expect(small.segments).toBeGreaterThanOrEqual(12);
    sky.dispose();
  });

  it('rebuilds at most at its rate, holding the buffer in between', () => {
    const sky = whole({ rebuildRate: 10 });
    const first = sky.update([funnel('a', ahead, 0.05)], 100, none, 0);
    // 50 ms later, inside the 100 ms interval: the same buffer, even though the funnel went.
    expect(sky.update([], 101, none, 50)).toBe(first);
    expect(shownLines(sky)).toBeDefined();
    // Once the interval is up, the change shows.
    expect(sky.update([], 102, none, 100)).toMatchObject({ offered: 0, segments: 0 });
    expect(shownLines(sky)).toBeUndefined();
    sky.dispose();
  });

  it('builds in slices into a back buffer, showing the last whole sky until it swaps', () => {
    // No time a frame: each call does the least it can (a chunk of sizing, then one funnel).
    const sky = makeFunnelSky({ displayRadius: 3000, sliceMs: 0, rebuildRate: 1000, share: 1 });
    const sites = Array.from({ length: 100 }, (_, i) =>
      funnel(`s${i}`, { x: Math.sin(i / 100), y: Math.cos(i / 100), z: 0 }, 0.01),
    );
    let calls = 0;
    let stats = sky.update(sites, 100, none, 0);
    while (stats.drawn === 0 && calls < 1000) stats = sky.update(sites, 100, none, ++calls);
    expect(calls).toBeGreaterThan(100); // one funnel written per call, after the sizing
    expect(stats).toMatchObject({ offered: 100, drawn: 100 });
    const first = shownLines(sky);
    expect(first?.geometry.drawRange.count).toBe(stats.segments * 2);
    // The next rebuild goes into the other buffer; the first stays on show until it is done.
    const fewer = sites.slice(0, 10);
    stats = sky.update(fewer, 100, none, ++calls);
    expect(shownLines(sky)).toBe(first);
    while (stats.drawn !== 10 && calls < 2000) stats = sky.update(fewer, 100, none, ++calls);
    expect(stats).toMatchObject({ offered: 10, drawn: 10 });
    expect(shownLines(sky)).not.toBe(first);
    expect(sky.object.children.filter((c) => c.visible)).toHaveLength(1);
    sky.dispose();
  });

  it('fits some 2,600 sites over the whole sky in the budget, culling those behind', () => {
    // A share of time so small that, once built, the sky rests for good.
    const sky = whole({ maxSegments: 60_000, share: 1e-9 });
    const sites: WindowField[] = [];
    for (let i = 0; i < 2600; i++) {
      // Spread over the sphere (golden spiral), apparent radii from 0.05° to 2°.
      const z = 1 - (2 * (i + 0.5)) / 2600;
      const r = Math.sqrt(1 - z * z);
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      const size = (0.05 + (1.95 * ((i * 7919) % 2600)) / 2600) * (Math.PI / 180);
      sites.push(funnel(`w${i}`, { x: r * Math.cos(phi), y: r * Math.sin(phi), z }, size));
    }
    const started = performance.now();
    const stats = sky.update(sites, 100, none);
    const ms = performance.now() - started;
    expect(stats.offered).toBe(2600);
    expect(stats.culled).toBeGreaterThan(500);
    expect(stats.segments).toBeLessThanOrEqual(60_000);
    expect(stats.drawn + stats.culled).toBe(2600);
    expect(ms).toBeGreaterThan(0);
    expect(sky.update([], 101, none, 1e6)).toBe(stats);
    sky.dispose();
  });
});
