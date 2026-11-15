import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { adaptedExposure } from './adaptation.ts';
import { COVERAGE_DIRECTIONS, DEEP_POLE, DEG, SKY_ATLAS, landmarksInView } from './atlas.ts';
import { atlasStars } from './stars.ts';

describe('fixed celestial atlas', () => {
  it('covers twelve 60-degree cones except the deliberate Deep pole', () => {
    let exempt = 0;
    for (const direction of COVERAGE_DIRECTIONS) {
      if (direction.angleTo(DEEP_POLE) < 30 * DEG) {
        exempt++;
        continue;
      }
      expect(landmarksInView(direction, 60).length, direction.toArray().join(',')).toBeGreaterThan(
        0,
      );
    }
    expect(exempt).toBe(1);
    expect(landmarksInView(DEEP_POLE, 60)).toHaveLength(0);
  });
  it('keeps the two major landmarks separated and every 150-degree view readable', () => {
    // More stringent than checking the as-yet unauthored route: sweep the whole sphere.
    for (let i = 0; i < 1024; i++) {
      const y = 1 - (2 * (i + 0.5)) / 1024,
        a = i * Math.PI * (3 - Math.sqrt(5));
      const d = new Vector3(
        Math.cos(a) * Math.sqrt(1 - y * y),
        y,
        Math.sin(a) * Math.sqrt(1 - y * y),
      );
      expect(landmarksInView(d).filter((l) => l.major).length).toBeLessThanOrEqual(2);
    }
    const major = SKY_ATLAS.filter((l) => l.major);
    expect(major[0]!.direction.angleTo(major[1]!.direction)).toBeGreaterThan(150 * DEG);
    expect(
      SKY_ATLAS.filter((l) => ['needle', 'hollow', 'eye'].includes(l.kind)).every(
        (l) => l.width < 6,
      ),
    ).toBe(true);
  });
  it('regenerates identical finite stars and embers, without a run seed', () => {
    const a = atlasStars(),
      b = atlasStars();
    expect(a).toEqual(b);
    expect(a.positions.length / 3).toBe(a.sizes.length);
    expect(a.colours.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < a.positions.length; i += 3)
      expect(Math.hypot(...a.positions.slice(i, i + 3))).toBeCloseTo(6900, 7);
    const density = (direction: Vector3) => {
      let count = 0;
      for (let i = 0; i < a.positions.length; i += 3)
        if (new Vector3().fromArray(a.positions, i).normalize().angleTo(direction) < 20 * DEG)
          count++;
      return count;
    };
    expect(density(DEEP_POLE)).toBeLessThan(density(DEEP_POLE.clone().negate()) * 0.6);
    expect(density(DEEP_POLE)).toBeGreaterThan(20);
  });
  it('adapts smoothly to a real occultation, independently of frame rate', () => {
    const coast = (fps: number) => {
      let value = 0.58;
      for (let i = 0; i < fps * 6; i++) value = adaptedExposure(value, false, 1 / fps);
      return value;
    };
    expect(coast(30)).toBeCloseTo(coast(144), 10);
    expect(coast(60)).toBeGreaterThan(0.96);
    expect(adaptedExposure(0.58, false, 1 / 60)).toBeLessThan(0.59);
    expect(adaptedExposure(1, true, 1 / 60)).toBeGreaterThan(0.99);
    expect(adaptedExposure(0.58, false, -1)).toBe(0.58);
  });
});
