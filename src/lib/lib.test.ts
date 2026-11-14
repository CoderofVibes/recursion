import { describe, expect, it } from 'vitest';
import { createFixedStepClock, createRng, deepFreeze, hashState, v2 } from './index.ts';

describe('vec2', () => {
  it('does basic arithmetic', () => {
    const a = v2.vec2(3, 4);
    expect(v2.length(a)).toBe(5);
    expect(v2.add(a, v2.vec2(1, 1))).toEqual({ x: 4, y: 5 });
    expect(v2.dot(a, v2.UNIT_X)).toBe(3);
    expect(v2.cross(v2.UNIT_X, v2.UNIT_Y)).toBe(1);
    expect(v2.normalize(v2.ZERO)).toEqual(v2.ZERO);
  });

  it('rotates counter-clockwise and round-trips body/inertial frames', () => {
    const r = v2.rotate(v2.UNIT_X, Math.PI / 2);
    expect(v2.equals(r, v2.UNIT_Y, 1e-15)).toBe(true);
    const v = v2.vec2(2, -1);
    const back = v2.inertialToBody(v2.bodyToInertial(v, 0.7), 0.7);
    expect(v2.equals(back, v, 1e-12)).toBe(true);
  });

  it('wraps angles to (-π, π]', () => {
    expect(v2.wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(v2.wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(v2.wrapAngle(0.5)).toBe(0.5);
  });
});

describe('rng', () => {
  it('repeats exactly for the same seed', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-1');
    const xs = Array.from({ length: 100 }, () => a.next());
    const ys = Array.from({ length: 100 }, () => b.next());
    expect(xs).toEqual(ys);
    expect(createRng('seed-2').next()).not.toBe(xs[0]);
  });

  it('gives named streams that do not depend on draw order or other streams', () => {
    const root1 = createRng(42);
    const s1 = root1.stream('sensors.optical');
    const first = [s1.next(), s1.next()];

    const root2 = createRng(42);
    const other = root2.stream('propulsion');
    for (let i = 0; i < 50; i++) other.next();
    root2.next();
    const s2 = root2.stream('sensors.optical');
    expect([s2.next(), s2.next()]).toEqual(first);
    expect(s2.name).toBe('sensors.optical');
    expect(s2.stream('bias').name).toBe('sensors.optical/bias');
  });

  it('saves and restores state exactly', () => {
    const r = createRng('state');
    r.next();
    const saved = r.getState();
    const after = [r.next(), r.normal(), r.int(1, 6)];
    r.setState(saved);
    expect([r.next(), r.normal(), r.int(1, 6)]).toEqual(after);
  });

  it('produces sensible distributions', () => {
    const r = createRng('dist');
    const n = 20000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = r.normal(2, 3);
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(mean).toBeCloseTo(2, 1);
    expect(sd).toBeGreaterThan(2.9);
    expect(sd).toBeLessThan(3.1);
    for (let i = 0; i < 1000; i++) {
      const k = r.int(1, 6);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(6);
      const u = r.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
});

describe('fixed-step clock', () => {
  it('runs whole steps and keeps the remainder', () => {
    const clock = createFixedStepClock({ dt: 0.1 });
    expect(clock.advance(0.25)).toBe(2);
    expect(clock.alpha).toBeCloseTo(0.5, 9);
    expect(clock.advance(0.05)).toBe(1);
    expect(clock.step).toBe(3);
    expect(clock.time).toBeCloseTo(0.3, 12);
  });

  it('applies warp and pause', () => {
    const clock = createFixedStepClock({ dt: 1 });
    expect(clock.advance(0.5, 10)).toBe(5);
    expect(clock.advance(10, 0)).toBe(0);
    expect(clock.step).toBe(5);
  });

  it('derives time from the step count, so it never drifts', () => {
    const clock = createFixedStepClock({ dt: 0.1 });
    clock.advanceSteps(1_000_000);
    expect(clock.time).toBe(1_000_000 * 0.1);
  });

  it('caps steps per advance and reports saturation', () => {
    const clock = createFixedStepClock({ dt: 0.01, maxStepsPerAdvance: 100 });
    expect(clock.advance(60)).toBe(100);
    expect(clock.saturated).toBe(true);
    expect(clock.alpha).toBe(0);
  });
});

describe('hashState', () => {
  it('ignores key order but not values', () => {
    expect(hashState({ a: 1, b: [1, 2] })).toBe(hashState({ b: [1, 2], a: 1 }));
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 1 + Number.EPSILON }));
    expect(hashState([1, 2])).not.toBe(hashState([2, 1]));
    expect(hashState('1')).not.toBe(hashState(1));
  });

  it('treats undefined properties as absent and hashes typed arrays like arrays', () => {
    expect(hashState({ a: 1, b: undefined })).toBe(hashState({ a: 1 }));
    expect(hashState(new Float64Array([1, 2]))).toBe(hashState([1, 2]));
    expect(hashState(NaN)).toBe(hashState(Number('x')));
    expect(hashState(0)).not.toBe(hashState(-0));
  });

  it('rejects cycles and functions', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => hashState(cyclic)).toThrow();
    expect(() => hashState({ f: () => 0 })).toThrow();
  });
});

describe('deepFreeze', () => {
  it('freezes nested objects and arrays', () => {
    const value = deepFreeze({ a: { b: [1, { c: 2 }] } });
    expect(Object.isFrozen(value.a.b)).toBe(true);
    expect(Object.isFrozen(value.a.b[1])).toBe(true);
    expect(() => {
      (value.a as { b: unknown }).b = [];
    }).toThrow();
  });
});
