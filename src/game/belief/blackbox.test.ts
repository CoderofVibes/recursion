/**
 * Black Box in the loop: records survive in the store, and a save that was cut off mid-attempt
 * is picked up cleanly.
 */

import { describe, expect, it } from 'vitest';
import { MemoryBlackBoxStore } from '../../blackbox/index.ts';
import { createGravityRange, LAW } from '../../content/gravity-range/index.ts';
import { createGameSession } from '../session.ts';
import { createBlackBox } from './blackbox.ts';
import type { AttemptStartInfo } from './ports.ts';
import { createStandInModel } from './standin-model.ts';

const setup = createGravityRange();
const start = (index: number): AttemptStartInfo => ({
  attemptId: `attempt-000${index}`,
  index,
  briefing: setup.definition.briefing,
  ship: setup.definition.ship,
  startedAt: 'now',
});
const fix = (t: number) => ({
  kind: 'bearing' as const,
  t,
  source: 'camera',
  target: 'alpha',
  value: [0.1],
  sigma: [5e-5],
});
/** Let the store's fire-and-forget writes land. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('Black Box in the game loop', () => {
  it('records an attempt in order and files the final record in the archive', () => {
    const box = createBlackBox();
    const empty = box.beginAttempt(start(1), 3);
    expect(empty).toMatchObject({
      id: 'attempt-0001',
      index: 1,
      encounterId: 'gravity-range',
      start: { modelVersion: 3, configuration: 'radiators' },
      outcome: { kind: 'in-progress' },
      measurements: [],
    });
    box.record({
      attemptId: 'attempt-0001',
      t: 0,
      executed: [],
      measurements: [fix(0)],
      events: [],
    });
    box.record({
      attemptId: 'attempt-0001',
      t: 20,
      executed: [],
      measurements: [fix(20)],
      events: [],
    });
    expect(box.attempt('attempt-0001')!.measurements.map((m) => m.t)).toEqual([0, 20]);
    expect(box.archive().attempts).toHaveLength(1);
    // Black Box refuses data that goes back in time, and data for another attempt.
    expect(() =>
      box.record({
        attemptId: 'attempt-0001',
        t: 10,
        executed: [],
        measurements: [fix(10)],
        events: [],
      }),
    ).toThrow(/order/);
    expect(() =>
      box.record({ attemptId: 'attempt-0009', t: 30, executed: [], measurements: [], events: [] }),
    ).toThrow(/not in progress/);

    const final = box.endAttempt('attempt-0001', { kind: 'recalled', t: 25 }, 4);
    expect(Object.isFrozen(final)).toBe(true);
    expect(final).toMatchObject({ outcome: { kind: 'recalled', t: 25 }, modelVersionAtEnd: 4 });
    expect(box.attempt('attempt-0001')).toBe(final);
    expect(() => box.beginAttempt(start(2), 4)).not.toThrow();
    expect(() => box.beginAttempt(start(3), 4)).toThrow(/still in progress/);
  });

  it('saves during an attempt and at its end', async () => {
    const store = new MemoryBlackBoxStore();
    let ms = 0;
    const box = createBlackBox({ store, saveInterval: 1000, clock: () => ms });
    box.beginAttempt(start(1), 0);
    box.record({
      attemptId: 'attempt-0001',
      t: 0,
      executed: [],
      measurements: [fix(0)],
      events: [],
    });
    await flush();
    expect((await store.load()).archive.attempts).toEqual([]);
    ms = 1500;
    box.record({
      attemptId: 'attempt-0001',
      t: 20,
      executed: [],
      measurements: [fix(20)],
      events: [],
    });
    await flush();
    expect((await store.load()).archive.attempts[0]).toMatchObject({
      id: 'attempt-0001',
      outcome: { kind: 'in-progress' },
    });
    box.endAttempt('attempt-0001', { kind: 'lost', t: 30, cause: 'collision' }, 1);
    await flush();
    const saved = (await store.load()).archive.attempts[0]!;
    expect(saved.outcome).toEqual({ kind: 'lost', t: 30, cause: 'collision' });
    expect(saved.measurements).toHaveLength(2);
  });

  it('closes an attempt that was cut off, and the next session numbers on from it', async () => {
    const store = new MemoryBlackBoxStore();
    const first = createBlackBox({ store, saveInterval: 0, clock: () => 0 });
    first.beginAttempt(start(1), 0);
    first.record({
      attemptId: 'attempt-0001',
      t: 40,
      executed: [],
      measurements: [fix(40)],
      events: [],
    });
    await flush();

    // The tab closes here. A later session restores the save.
    const restored = createBlackBox({ archive: (await store.load()).archive, store });
    expect(restored.archive().attempts.map((a) => [a.id, a.outcome])).toEqual([
      ['attempt-0001', { kind: 'recalled', t: 40 }],
    ]);
    const session = createGameSession(setup, {
      model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
      blackBox: restored,
      now: () => 'later',
    });
    expect(session.status()).toMatchObject({ attemptId: 'attempt-0002', attemptIndex: 2 });
    await flush();
    expect((await store.load()).archive.attempts[0]!.outcome).toEqual({ kind: 'recalled', t: 40 });
  });
});
