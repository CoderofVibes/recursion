import { describe, expect, it } from 'vitest';
import { CoverageHistory } from './coverageHistory.ts';
import type { SensedSector } from './coverageHistory.ts';

const camera = (center: number, halfWidth = Math.PI / 6, range = 6e6): SensedSector => ({
  sensor: 'camera',
  center,
  halfWidth,
  range,
});

describe('coverage sensed earlier in the attempt', () => {
  it('remembers a sector where the ship was, seen from where it is now', () => {
    const h = new CoverageHistory(7200, 24);
    h.note(100, 1000, 2000, [camera(0.3)]);
    const [e] = h.earlier(100, 1500, 2500);
    expect(e).toMatchObject({ center: 0.3, dx: -500, dy: -500, fresh: 1 });
  });

  it('renews a sector the sensor keeps looking at, and keeps a new one when it turns', () => {
    const h = new CoverageHistory(7200, 24);
    for (let t = 0; t <= 600; t += 10) h.note(t, 0, 0, [camera(0.1 + t * 1e-5)]);
    expect(h.earlier(600, 0, 0)).toHaveLength(1);
    expect(h.earlier(600, 0, 0)[0]!.fresh).toBe(1);
    h.note(610, 0, 0, [camera(0.1 + Math.PI / 6)]);
    expect(h.earlier(610, 0, 0)).toHaveLength(2);
  });

  it('keeps a new sector once the ship has moved a fiftieth of the reach', () => {
    const h = new CoverageHistory(7200, 24);
    h.note(0, 0, 0, [camera(0)]);
    h.note(10, 100_000, 0, [camera(0)]);
    expect(h.earlier(10, 100_000, 0)).toHaveLength(1);
    h.note(20, 130_000, 0, [camera(0)]);
    expect(h.earlier(20, 130_000, 0)).toHaveLength(2);
  });

  it('fades over the memory and then reads as unknown again', () => {
    const h = new CoverageHistory(7200, 24);
    h.note(0, 0, 0, [camera(0)]);
    h.note(10, 0, 0, []);
    expect(h.earlier(3600, 0, 0)[0]!.fresh).toBeCloseTo(0.5, 2);
    h.note(7200, 0, 0, []);
    expect(h.earlier(7200, 0, 0)).toEqual([]);
  });

  it('forgets everything when the clock runs backwards (a new attempt)', () => {
    const h = new CoverageHistory(7200, 24);
    h.note(5000, 0, 0, [camera(0)]);
    h.note(0, 0, 0, []);
    expect(h.earlier(0, 0, 0)).toEqual([]);
  });

  it('drops the stalest first when full, and lists the freshest first', () => {
    const h = new CoverageHistory(7200, 3);
    for (let i = 0; i < 5; i++) h.note(i * 10, 0, 0, [camera(i)]);
    const kept = h.earlier(40, 0, 0);
    expect(kept.map((e) => e.center)).toEqual([4, 3, 2]);
  });

  it('keeps each sensor apart', () => {
    const h = new CoverageHistory(7200, 24);
    h.note(0, 0, 0, [camera(0), { ...camera(0), sensor: 'tracker-b' }]);
    h.note(10, 0, 0, [camera(0), { ...camera(0), sensor: 'tracker-b' }]);
    expect(h.earlier(10, 0, 0)).toHaveLength(2);
  });
});
