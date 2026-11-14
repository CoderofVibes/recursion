/**
 * Belief-side helpers of the game layer: attitude resolution, telemetry thinning, plan
 * building, and the rule that nothing in this folder reaches truth (P11).
 */

import { describe, expect, it } from 'vitest';
import type { Measurement } from '../../contracts/index.ts';
import { loadShipDefinition } from '../../ship/index.ts';
import { burnDuration, burnSteps } from './maneuver.ts';
import { resolveAttitude, resolveCommand, type NavigationView } from './resolve.ts';
import { createTelemetryFilter } from './telemetry.ts';
import { applyCommanded, initialCommandedState } from './view.ts';

describe('belief side of the game layer stays on its side (P11)', () => {
  const sources = Object.entries(
    import.meta.glob<string>('./*.ts', { query: '?raw', import: 'default', eager: true }),
  ).filter(([file]) => !file.endsWith('.test.ts'));

  it('imports no truth contracts, simulation, ship systems, content or truth-side game code', () => {
    expect(sources.length).toBeGreaterThan(5);
    for (const [file, source] of sources) {
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      for (const path of imports) {
        expect(path, `${file} imports ${path}`).not.toMatch(
          /contracts\/truth|\/sim\/|\/ship\/|\/content\/|fixtures\/(truth|generate)/,
        );
        // Within src/game, only this folder.
        if (path.startsWith('../') && !path.startsWith('../../'))
          throw new Error(`${file} imports truth-side game code: ${path}`);
      }
    }
  });
});

describe('attitude references resolve from the believed navigation solution', () => {
  const nav: NavigationView = {
    ship: { position: { x: -1000, y: 0 }, velocity: { x: 3, y: -100 } },
    bodies: [
      { id: 'alpha', position: { x: 0, y: 0 }, velocity: { x: 3, y: 0 } },
      { id: 'beta', position: { x: 4000, y: 0 }, velocity: { x: 0, y: 40 } },
    ],
    asteroids: [{ id: 'a-01', position: { x: -1000, y: 500 } }],
  };
  const angle = (target: Parameters<typeof resolveAttitude>[0]): number => {
    const resolved = resolveAttitude(target, nav);
    if (resolved?.reference !== 'inertial') throw new Error('not resolved');
    return resolved.angle;
  };

  it('prograde is the velocity relative to the nearest body', () => {
    expect(angle({ reference: 'prograde' })).toBeCloseTo(-Math.PI / 2, 12);
    expect(angle({ reference: 'retrograde' })).toBeCloseTo(Math.PI / 2, 12);
    expect(angle({ reference: 'prograde', offset: 0.1 })).toBeCloseTo(-Math.PI / 2 + 0.1, 12);
  });

  it('toward and away follow the believed position of a body or an asteroid', () => {
    expect(angle({ reference: 'toward', target: 'alpha' })).toBeCloseTo(0, 12);
    expect(Math.abs(angle({ reference: 'away', target: 'alpha' }))).toBeCloseTo(Math.PI, 12);
    expect(angle({ reference: 'toward', target: 'a-01' })).toBeCloseTo(Math.PI / 2, 12);
  });

  it('passes inertial, rate and free through untouched', () => {
    const inertial = { reference: 'inertial', angle: 1 } as const;
    expect(resolveAttitude(inertial, nav)).toBe(inertial);
    expect(resolveAttitude({ reference: 'free' }, nav)).toEqual({ reference: 'free' });
    expect(resolveAttitude({ reference: 'rate', rate: 0.01 }, nav)).toEqual({
      reference: 'rate',
      rate: 0.01,
    });
  });

  it('cannot resolve what the ship does not know', () => {
    expect(resolveAttitude({ reference: 'toward', target: 'nowhere' }, nav)).toBeUndefined();
    const still = { ...nav, ship: { ...nav.ship, velocity: { x: 3, y: 0 } } };
    expect(resolveAttitude({ reference: 'prograde' }, still)).toBeUndefined();
  });

  it('resolves attitude and burn commands and leaves the rest alone', () => {
    const mark = { kind: 'mark', label: 'x' } as const;
    expect(resolveCommand(mark, nav)).toBe(mark);
    expect(
      resolveCommand({ kind: 'attitude', target: { reference: 'toward', target: 'alpha' } }, nav),
    ).toEqual({ kind: 'attitude', target: { reference: 'inertial', angle: 0 } });
    const burn = resolveCommand(
      {
        kind: 'burn',
        thruster: 'main-engine',
        throttle: 1,
        duration: 5,
        attitude: { reference: 'retrograde' },
      },
      nav,
    );
    expect(burn).toMatchObject({ kind: 'burn', duration: 5, attitude: { reference: 'inertial' } });
    expect(
      resolveCommand({ kind: 'attitude', target: { reference: 'away', target: 'nowhere' } }, nav),
    ).toBeUndefined();
  });
});

describe('telemetry is recorded on change', () => {
  const reading = (t: number, channel: string, value: number): Measurement => ({
    kind: 'telemetry',
    t,
    source: 'black-box',
    channel,
    value: [value],
    sigma: [0],
  });
  const fix = (t: number): Measurement => ({
    kind: 'bearing',
    t,
    source: 'camera',
    target: 'alpha',
    value: [0.1],
    sigma: [5e-5],
  });

  it('keeps the first reading, changes beyond the deadband and a keepalive', () => {
    const filter = createTelemetryFilter(0.01, 100);
    const kept = (m: Measurement[]) => filter.filter(m).map((x) => [x.t, x.channel, x.value[0]]);
    expect(kept([reading(0, 'a.power', 100), reading(0, 'b.power', 0)])).toHaveLength(2);
    expect(kept([reading(20, 'a.power', 100.5), reading(20, 'b.power', 0)])).toEqual([]);
    expect(kept([reading(40, 'a.power', 102), reading(40, 'b.power', 5)])).toEqual([
      [40, 'a.power', 102],
      [40, 'b.power', 5],
    ]);
    // Unchanged, but 100 s since the channel was last kept.
    expect(kept([reading(140, 'a.power', 102)])).toEqual([[140, 'a.power', 102]]);
  });

  it('never drops navigation measurements and keeps their order', () => {
    const filter = createTelemetryFilter(0.01, 100);
    filter.filter([reading(0, 'a.power', 100)]);
    const batch = [fix(20), reading(20, 'a.power', 100), fix(20)];
    expect(filter.filter(batch)).toEqual([batch[0], batch[2]]);
    const untouched = [fix(40), fix(40)];
    expect(filter.filter(untouched)).toBe(untouched);
  });

  it('starts afresh after a reset', () => {
    const filter = createTelemetryFilter(0.01, 100);
    filter.filter([reading(0, 'a.power', 100)]);
    filter.reset();
    expect(filter.filter([reading(20, 'a.power', 100)])).toHaveLength(1);
  });
});

describe('plan helpers', () => {
  const ship = loadShipDefinition();

  it('turns, burns and releases', () => {
    const steps = burnSteps({ at: 400, duration: 12, attitude: { reference: 'retrograde' } });
    expect(steps.map((s) => [s.at, s.command.kind])).toEqual([
      [100, 'attitude'],
      [400, 'burn'],
      [417, 'attitude'],
    ]);
    expect(steps[2]!.command).toEqual({ kind: 'attitude', target: { reference: 'free' } });
  });

  it('clips the turn to the plan epoch and can keep holding', () => {
    const steps = burnSteps({
      at: 50,
      duration: 3,
      attitude: { reference: 'prograde' },
      release: null,
    });
    expect(steps.map((s) => [s.at, s.command.kind])).toEqual([
      [0, 'attitude'],
      [50, 'burn'],
    ]);
  });

  it('sizes a burn with the rocket equation at nominal ratings', () => {
    // 24 kN at 320 s on 30,374 kg: 10 m/s takes about 12.6 s.
    const duration = burnDuration(ship, 30374, 10);
    const exhaust = 320 * 9.80665;
    expect(duration).toBeCloseTo((30374 * (1 - Math.exp(-10 / exhaust)) * exhaust) / 24000, 9);
    expect(duration).toBeGreaterThan(12.6);
    expect(duration).toBeLessThan(12.7);
    expect(burnDuration(ship, 30374, 10, 'no-such-engine')).toBe(0);
  });
});

describe('commanded state follows executed commands', () => {
  it('tracks burns and camera pointing', () => {
    let state = initialCommandedState;
    state = applyCommanded(state, 0, { kind: 'point', sensor: 'camera', target: 'alpha' });
    state = applyCommanded(state, 100, {
      kind: 'burn',
      thruster: 'main-engine',
      throttle: 0.5,
      duration: 10,
    });
    expect(state.pointing.camera).toEqual({ target: 'alpha' });
    expect(state.burns).toEqual([{ thruster: 'main-engine', throttle: 0.5, until: 110 }]);
    expect(applyCommanded(state, 105, { kind: 'cutoff', thruster: 'all' }).burns).toEqual([]);
  });
});
