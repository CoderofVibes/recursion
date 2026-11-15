/**
 * Coverage from earlier attempts (`ViewSnapshot.coverageEarlier`, 2D's R6): rebuilt from Black
 * Box records alone, thinned the way the view thins its own, and the same after a reload.
 */

import { describe, expect, it } from 'vitest';
import type { CoverageLook, Vec3 } from '../contracts/index.ts';
import { MemoryBlackBoxStore } from '../blackbox/index.ts';
import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import { v3 } from '../lib/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { COVERAGE_SAMPLE_INTERVAL, earlierCoverage } from './belief/coverage.ts';
import { createStandInModel } from './belief/standin-model.ts';
import { createGameSession } from './session.ts';

const setup = createGravityRange();
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * An attempt that looks three ways: at Alpha for half an hour, at the rock a-12 for ten
 * minutes, then straight up out of the plane for five; then Recall. Returns where the ship
 * believed it was, every minute, as it flew.
 */
function flyAndRecall(session: ReturnType<typeof createGameSession>) {
  const believed = new Map<number, Vec3>();
  const go = (seconds: number) => {
    for (let i = 0; i < seconds; i += COVERAGE_SAMPLE_INTERVAL) {
      session.stepTicks(COVERAGE_SAMPLE_INTERVAL);
      believed.set(session.status().t, session.snapshot().world.ship.position);
    }
  };
  go(1800);
  session.command({ kind: 'point', sensor: 'camera', target: 'a-12' });
  go(600);
  session.command({
    kind: 'point',
    sensor: 'camera',
    target: null,
    direction: { x: 0, y: 0, z: 2 },
  });
  go(300);
  session.recall();
  return believed;
}

describe('coverage sensed in earlier attempts', () => {
  const store = new MemoryBlackBoxStore();
  const session = createGameSession(setup, {
    model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
    blackBox: createBlackBox({ store, saveInterval: 0, clock: () => 0 }),
    now: () => 'test',
  });
  expect(session.snapshot().coverageEarlier).toBeUndefined();
  const believed = flyAndRecall(session);
  const looks = session.snapshot().coverageEarlier!;

  it('is rebuilt from the earlier attempt: where the ship believed it was, which way it looked', () => {
    expect(looks.length).toBeGreaterThan(3);
    for (const look of looks) {
      expect(look).toMatchObject({
        attemptId: 'attempt-0001',
        sensor: 'camera',
        halfAngle: Math.PI / 6,
        range: 6_000_000,
      });
      expect(v3.length(look.axis)).toBeCloseTo(1, 12);
      expect(look.to).toBeGreaterThanOrEqual(look.from);
      // The origin is where the navigator believed the ship was at the time (to rounding of
      // where its integration steps fell, which differ between the flight and the replay).
      const then = believed.get(look.from);
      if (then) expect(v3.distance(look.origin, then)).toBeLessThan(50);
    }
    // Oldest first, without gaps or overlaps.
    for (let i = 1; i < looks.length; i++) expect(looks[i]!.from).toBeGreaterThan(looks[i - 1]!.to);
    // The camera has power from the first recorded packet (t = 0) to the end of the attempt.
    expect(looks[0]!.from).toBe(0);
    expect(looks.at(-1)!.to).toBe(2700);
  });

  it('follows the recorded pointing: Alpha, then the rock, then the commanded direction', () => {
    const at = (t: number): CoverageLook => looks.find((l) => l.from <= t && t <= l.to)!;
    const alpha = at(900);
    const toAlpha = v3.normalize(v3.neg(at(900).origin));
    // Alpha is at the believed frame's origin (it drifts a few tens of metres an hour).
    expect(v3.angleBetween(alpha.axis, toAlpha)).toBeLessThan(1e-3);
    const rock = at(2100);
    expect(v3.angleBetween(rock.axis, alpha.axis)).toBeGreaterThan(0.5 * (Math.PI / 6));
    expect(at(2640).axis).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('thins as the view does: a new look only when the cone turned or the ship moved far', () => {
    for (let i = 1; i < looks.length; i++) {
      const a = looks[i - 1]!;
      const b = looks[i]!;
      const turned = v3.angleBetween(a.axis, b.axis) > 0.5 * b.halfAngle;
      const moved = v3.distance(a.origin, b.origin) > 0.02 * b.range;
      expect(turned || moved).toBe(true);
    }
    // Locked on Alpha at 100 m/s, a new look every 120 km: about every 20 minutes.
    const onAlpha = looks.filter((l) => l.to <= 1800);
    expect(onAlpha.length).toBeGreaterThanOrEqual(2);
    expect(onAlpha.length).toBeLessThanOrEqual(3);
  });

  it('leaves out the attempt in progress and adds each finished one after the last', () => {
    session.stepTicks(300);
    expect(session.snapshot().coverageEarlier).toEqual(looks);
    session.recall();
    const both = session.snapshot().coverageEarlier!;
    expect(both.slice(0, looks.length)).toEqual(looks);
    expect(both.slice(looks.length).every((l) => l.attemptId === 'attempt-0002')).toBe(true);
    expect(both.length).toBeGreaterThan(looks.length);
  });

  it('is the same after a reload: it is built from the records, not from memory', async () => {
    await flush();
    const restored = createGameSession(setup, {
      model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
      blackBox: createBlackBox({ archive: (await store.load()).archive, store }),
      now: () => 'later',
    });
    const again = restored.snapshot().coverageEarlier!;
    expect(again.filter((l) => l.attemptId === 'attempt-0001')).toEqual(looks);
  });

  it('is capped, the oldest looks going first', () => {
    const records = session.blackBox.archive().attempts;
    const options = {
      ship: setup.definition.ship,
      briefing: setup.definition.briefing,
      referenceRadius: LAW.referenceRadius,
      arrivalMass: setup.arrivalMass,
    };
    const all = earlierCoverage(records, 'attempt-0003', options);
    const capped = earlierCoverage(records, 'attempt-0003', options, new Map(), 3);
    expect(capped).toEqual(all.slice(-3));
  });
});
