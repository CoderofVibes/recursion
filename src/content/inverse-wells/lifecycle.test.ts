import { describe, expect, it } from 'vitest';
import {
  advanceFunnelLifecycle,
  createFunnelLifecycle,
  funnelLifecycleActivation,
  nextFunnelLifecycleEvent,
  restoreFunnelLifecycle,
  type FunnelBirthSample,
  type FunnelLifecycleState,
} from './lifecycle.ts';

// Independent S22 popup fixture, reference.py / vectors.json at study 48309d4.
const CENTER = { x: 320_000, y: 0, z: 0 };
const POPUP = { id: 'popup', center: CENTER, birthOffset: 1200 };
const safeSample = (t: number): FunnelBirthSample => ({
  t,
  position: { x: 100_000, y: 0, z: 0 },
  velocity: { x: 40, y: 0, z: 0 },
  hullRadius: 20,
});
const roundTrip = (state: FunnelLifecycleState): FunnelLifecycleState =>
  restoreFunnelLifecycle(JSON.parse(JSON.stringify(state)));

describe('S22 prototype saved funnel lifecycle', () => {
  it('starts established funnels at full activation and pending funnels on the run clock', () => {
    const initial = createFunnelLifecycle(
      [POPUP, { id: 'established', center: CENTER, birthOffset: null }],
      50_000,
    );
    expect(initial.sites.map((site) => site.id)).toEqual(['established', 'popup']);
    expect(initial.dueCursor).toBe(1);
    expect(initial.sites[1]).toMatchObject({ nominalBirth: 51_200, phase: 'dormant' });
    expect(funnelLifecycleActivation(initial.sites[0]!)).toEqual({ phase: 'initial' });
    expect(nextFunnelLifecycleEvent(initial)).toBe(50_300);
    const precursor = advanceFunnelLifecycle(initial, 50_300);
    expect(precursor.events).toEqual([{ kind: 'precursor', id: 'popup', t: 50_300 }]);
    expect(nextFunnelLifecycleEvent(precursor.state)).toBe(51_200);
    expect(precursor.state.runEpoch).toBe(50_000);
  });

  it('enters the precursor exactly 900 seconds before birth without enabling a field', () => {
    const start = createFunnelLifecycle([POPUP], 0);
    const before = advanceFunnelLifecycle(start, 299.999);
    expect(before.events).toEqual([]);
    expect(before.state.sites[0]?.phase).toBe('dormant');
    const onset = advanceFunnelLifecycle(roundTrip(before.state), 300);
    expect(onset.events).toEqual([{ kind: 'precursor', id: 'popup', t: 300 }]);
    expect(onset.state.sites[0]?.phase).toBe('precursor');
    expect(funnelLifecycleActivation(onset.state.sites[0]!)).toEqual({ phase: 'pending' });
    expect(advanceFunnelLifecycle(onset.state, 1199.999).events).toEqual([]);
  });

  it('matches the independent popup guard and preserves the actual birth epoch through ramp', () => {
    const born = advanceFunnelLifecycle(createFunnelLifecycle([POPUP], 0), 1200, [
      safeSample(1200),
    ]);
    expect(born.events[1]).toMatchObject({ kind: 'birth', id: 'popup', t: 1200 });
    expect(
      born.events[1] && 'guardMargin' in born.events[1] && born.events[1].guardMargin,
    ).toBeCloseTo(103477.69305796656, 8);
    expect(born.state.dueCursor).toBe(1);
    expect(funnelLifecycleActivation(born.state.sites[0]!)).toEqual({
      phase: 'active',
      activeSince: 1200,
    });
    const duringRamp = advanceFunnelLifecycle(roundTrip(born.state), 1260);
    const established = advanceFunnelLifecycle(roundTrip(duringRamp.state), 50_000);
    expect(established.events).toEqual([]);
    expect(established.state.sites[0]?.activeSince).toBe(1200);
    expect(nextFunnelLifecycleEvent(established.state)).toBeNull();
  });

  it.each([
    ['occupied', { ...safeSample(1200), position: CENTER }],
    ['fast outside intercept', { ...safeSample(1200), velocity: { x: 1000, y: 0, z: 0 } }],
    ['current enlarged hull', { ...safeSample(1200), hullRadius: 110_000 }],
  ] as const)(
    'permanently vetoes %s rather than retrying after the ship leaves',
    (_name, sample) => {
      const veto = advanceFunnelLifecycle(createFunnelLifecycle([POPUP], 0), 1200, [sample]);
      expect(veto.events.at(-1)).toMatchObject({ kind: 'birth-veto', id: 'popup', t: 1200 });
      expect(veto.state.sites[0]).toMatchObject({ phase: 'cancelled', activeSince: null });
      expect(funnelLifecycleActivation(veto.state.sites[0]!)).toEqual({ phase: 'cancelled' });
      const later = advanceFunnelLifecycle(roundTrip(veto.state), 100_000);
      expect(later.events).toEqual([]);
      expect(later.state.sites).toEqual(veto.state.sites);
      expect(() => advanceFunnelLifecycle(later.state, 100_001, [safeSample(100_001)])).toThrow(
        'one actual sample',
      );
    },
  );

  it('uses one committed state for simultaneous births in canonical ID order', () => {
    const start = createFunnelLifecycle(
      [
        { ...POPUP, id: 'z-veto', center: safeSample(1200).position },
        { ...POPUP, id: 'a-birth' },
      ],
      0,
    );
    const result = advanceFunnelLifecycle(start, 1200, [safeSample(1200)]);
    expect(result.events.map(({ kind, id }) => [kind, id])).toEqual([
      ['precursor', 'a-birth'],
      ['precursor', 'z-veto'],
      ['birth', 'a-birth'],
      ['birth-veto', 'z-veto'],
    ]);
    expect(result.state.dueCursor).toBe(2);
    expect(result.state.sites.map((site) => site.phase)).toEqual(['active', 'cancelled']);
    expect(advanceFunnelLifecycle(roundTrip(result.state), 1200).events).toEqual([]);
  });

  it('vetoes zero guard clearance rather than accepting boundary contact', () => {
    const bound = Math.hypot(62_500, 20_000);
    const reach = 0.5 * ((24_000 + 40 * 200 + 0.236) / 24_000 + 0.1) * 240 * 240;
    const distance = bound + reach + 20;
    // Construct exact floating-point equality in the guard's subtraction order.
    const hullRadius = distance - bound - reach;
    const result = advanceFunnelLifecycle(
      createFunnelLifecycle([{ ...POPUP, center: { x: 0, y: 0, z: 0 } }], 0),
      1200,
      [
        {
          t: 1200,
          position: { x: distance, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          hullRadius,
        },
      ],
    );
    expect(result.events.at(-1)).toEqual({
      kind: 'birth-veto',
      t: 1200,
      id: 'popup',
      guardMargin: 0,
    });
    expect(result.state.sites[0]?.phase).toBe('cancelled');
  });

  it('replays identically across saves before precursor, before birth and during ramp', () => {
    const start = createFunnelLifecycle(
      [POPUP, { ...POPUP, id: 'later', birthOffset: 1800 }],
      70_000,
    );
    const samples = [safeSample(71_200), safeSample(71_800)];
    const uninterrupted = advanceFunnelLifecycle(start, 72_000, samples);
    let state = start;
    const events = [];
    for (const t of [70_299, 70_300, 70_900, 71_199, 71_200, 71_260, 71_799, 71_800, 72_000]) {
      const result = advanceFunnelLifecycle(
        roundTrip(state),
        t,
        samples.filter((sample) => sample.t > state.t && sample.t <= t),
      );
      events.push(...result.events);
      state = result.state;
    }
    expect(state).toEqual(uninterrupted.state);
    expect(events).toEqual(uninterrupted.events);
  });

  it('requires real due-time samples instead of inferring a missed birth on late arrival', () => {
    const start = createFunnelLifecycle([POPUP, { ...POPUP, id: 'later', birthOffset: 1800 }], 0);
    expect(() => advanceFunnelLifecycle(start, 2000)).toThrow('one actual sample');
    expect(() => advanceFunnelLifecycle(start, 2000, [safeSample(2000)])).toThrow(
      'one actual sample',
    );
    for (const samples of [
      [safeSample(1800), safeSample(1200)],
      [safeSample(1200), safeSample(1200)],
      [safeSample(1200), safeSample(1799.999)],
    ])
      expect(() => advanceFunnelLifecycle(start, 2000, samples)).toThrow('sample epochs');
    expect(start.t).toBe(0);
    expect(start.dueCursor).toBe(0);
  });

  it('does not mutate or retain aliases to caller-owned schedule, save or actual samples', () => {
    const center = { ...CENTER };
    const start = createFunnelLifecycle([{ ...POPUP, center }], 0);
    center.x = 0;
    expect(start.sites[0]?.center).toEqual(CENTER);
    const before = JSON.stringify(start);
    Object.freeze(start.sites[0]!.center);
    Object.freeze(start.sites[0]);
    Object.freeze(start.sites);
    Object.freeze(start);
    const sample = safeSample(1200);
    Object.freeze(sample.position);
    Object.freeze(sample.velocity);
    Object.freeze(sample);
    const result = advanceFunnelLifecycle(start, 1200, [sample]);
    expect(JSON.stringify(start)).toBe(before);
    expect(result.state.sites[0]?.center).not.toBe(start.sites[0]?.center);
    const restored = restoreFunnelLifecycle(result.state);
    expect(restored.sites).not.toBe(result.state.sites);
    expect(restored.sites[0]?.center).not.toBe(result.state.sites[0]?.center);
  });

  it('rejects malformed saved chronology and ordering without repairing or replaying it', () => {
    const start = createFunnelLifecycle([POPUP, { ...POPUP, id: 'later', birthOffset: 1800 }], 0);
    const malformed: unknown[] = [
      null,
      { ...start, version: 'spherical-v1' },
      { ...start, t: Number.NaN },
      { ...start, t: -1 },
      { ...start, dueCursor: 1 },
      { ...start, dueCursor: 0.5 },
      { ...start, sites: [...start.sites].reverse() },
      { ...start, sites: [start.sites[0], start.sites[0]] },
      { ...start, t: 1200 },
      { ...start, sites: [{ ...start.sites[0], phase: 'active', activeSince: 1200 }] },
      { ...start, sites: [{ ...start.sites[0], phase: 'cancelled' }] },
      { ...start, sites: [{ ...start.sites[0], center: { x: Infinity, y: 0, z: 0 } }] },
    ];
    for (const saved of malformed)
      expect(() => restoreFunnelLifecycle(saved)).toThrow('S22 lifecycle');
    const born = advanceFunnelLifecycle(start, 1200, [safeSample(1200)]).state;
    expect(() =>
      restoreFunnelLifecycle({
        ...born,
        sites: [{ ...born.sites[0], activeSince: 1201 }, born.sites[1]],
      }),
    ).toThrow('saved decision');
    expect(() => advanceFunnelLifecycle(born, 1199)).toThrow('backwards');
  });

  it('rejects invalid schedules and nonphysical guard samples', () => {
    for (const birthOffset of [0, -1, Infinity, Number.NaN])
      expect(() => createFunnelLifecycle([{ ...POPUP, birthOffset }], 0)).toThrow('S22 lifecycle');
    expect(() => createFunnelLifecycle([POPUP, POPUP], 0)).toThrow('duplicate');
    expect(() => createFunnelLifecycle([{ ...POPUP, id: '' }], 0)).toThrow('empty');
    expect(() => createFunnelLifecycle([POPUP], Infinity)).toThrow('runEpoch');
    const start = createFunnelLifecycle([POPUP], 0);
    for (const sample of [
      { ...safeSample(1200), hullRadius: -1 },
      { ...safeSample(1200), hullRadius: Number.NaN },
      { ...safeSample(1200), velocity: { x: Infinity, y: 0, z: 0 } },
      { ...safeSample(1200), position: { x: Number.NaN, y: 0, z: 0 } },
    ])
      expect(() => advanceFunnelLifecycle(start, 1200, [sample])).toThrow('S22 lifecycle');
    expect(() => advanceFunnelLifecycle(start, Infinity)).toThrow('advance time');
  });
});
