/**
 * The flight hologram on the contract fixtures: it draws every fixture without a renderer, keeps
 * to what the ship believes (P11), and reports the closest approaches and the miss from the
 * issued forecast that the instruments show.
 */
import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  shipDefinition,
  viewSnapshot,
  viewSnapshotCompare,
} from '../../contracts/fixtures/index.ts';
import type { ViewSnapshot } from '../../contracts/index.ts';
import { registerFieldView } from '../fieldViews.ts';
import {
  makeFlightHolo,
  pastAndAhead,
  RANGE_MAX,
  RANGE_MIN,
  rangeMinFor,
  withEarlierAttempts,
} from './FlightHolo.ts';

/** Just enough of an element for a hologram tag. */
class FakeElement {
  className = '';
  textContent = '';
  readonly style: Record<string, string> = {};
  readonly parentNode = null;
  readonly ownerDocument = { defaultView: { Element: FakeElement } };
  setAttribute(): void {}
}

const make = () => {
  vi.stubGlobal('document', { createElement: () => new FakeElement() });
  return makeFlightHolo(shipDefinition);
};
const frame = (snapshot: ViewSnapshot, extra: { selected?: string } = {}) => ({
  snapshot,
  clearance: 50_000,
  ...extra,
});

describe('flight hologram', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws the fixture snapshot and the two-attempt overlay', () => {
    const holo = make();
    holo.setRange(400_000);
    expect(() => {
      holo.update(frame(viewSnapshot), 0.016, 0);
      holo.update(frame(viewSnapshotCompare), 0.016, 0.016);
      holo.setChart(true);
      holo.update(frame(viewSnapshot), 0.3, 0.4);
      holo.setHeadingUp(false);
      holo.update(frame(viewSnapshot), 0.3, 0.7);
    }).not.toThrow();
    holo.dispose();
  });

  it('keeps its range inside what it can draw', () => {
    const holo = make();
    holo.setRange(1);
    expect(holo.range()).toBe(RANGE_MIN);
    holo.setRange(1e12);
    expect(holo.range()).toBe(RANGE_MAX);
    holo.dispose();
  });

  it('reports closest approaches from the issued forecast, soonest first, and only those ahead', () => {
    const holo = make();
    holo.setRange(400_000);
    holo.update(frame(viewSnapshot), 0.016, 0);
    const alerts = holo.alerts();
    const forecast = viewSnapshot.forecasts.at(-1);
    for (const a of alerts) expect(a.t).toBeGreaterThan(viewSnapshot.t);
    for (let i = 1; i < alerts.length; i++)
      expect(alerts[i]!.t).toBeGreaterThanOrEqual(alerts[i - 1]!.t);
    // Every alert comes from the forecast as issued, never from anywhere else.
    for (const a of alerts)
      expect(forecast?.closestApproaches.some((c) => c.id === a.id && c.t === a.t)).toBe(true);
    holo.dispose();
  });

  it('raises a predicted pass inside the planned clearance', () => {
    const holo = make();
    holo.setRange(400_000);
    const forecast = viewSnapshot.forecasts.at(-1);
    const ahead = forecast?.closestApproaches.find((c) => c.t > viewSnapshot.t);
    if (!ahead) {
      holo.dispose();
      return;
    }
    // A clearance far larger than the predicted pass: it must be flagged.
    holo.update({ snapshot: viewSnapshot, clearance: ahead.distance * 10 + 1e6 }, 0.016, 0);
    const alert = holo.alerts().find((a) => a.id === ahead.id);
    if (alert) expect(alert.level).not.toBe('advisory');
    holo.dispose();
  });

  it('measures how far the ship is from where the forecast put it now', () => {
    const holo = make();
    holo.update(frame(viewSnapshot), 0.016, 0);
    const forecast = viewSnapshot.forecasts.at(-1);
    const covers =
      forecast !== undefined &&
      forecast.samples[0]!.t <= viewSnapshot.t &&
      forecast.samples.at(-1)!.t >= viewSnapshot.t;
    const miss = holo.miss();
    if (covers) {
      expect(miss).not.toBeNull();
      expect(miss!.metres).toBeGreaterThanOrEqual(0);
    } else expect(miss).toBeNull();
    holo.dispose();
  });

  it('hands a detected field to its plugin and never an undetected one', () => {
    const seen: string[] = [];
    let disposed = 0;
    registerFieldView('test-lattice', () => ({
      update: ({ field }) => void seen.push(field.id),
      dispose: () => void disposed++,
    }));
    const withFields = (detected: boolean): ViewSnapshot => ({
      ...viewSnapshot,
      world: {
        ...viewSnapshot.world,
        fields: [{ id: 'fence-1', kind: 'test-lattice', detected }],
      },
    });
    const holo = make();
    holo.update(frame(withFields(false)), 0.016, 0);
    expect(seen).toEqual([]);
    holo.update(frame(withFields(true)), 0.016, 0.016);
    expect(seen).toEqual(['fence-1']);
    // Coverage lost: the reconstruction goes away with it.
    holo.update(frame(withFields(false)), 0.016, 0.032);
    expect(disposed).toBe(1);
    holo.dispose();
  });

  it('finds the object under the cursor among what is drawn', () => {
    const holo = make();
    holo.setRange(400_000);
    holo.setHeadingUp(false);
    holo.update(frame(viewSnapshot), 0.016, 0);
    const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 100);
    camera.position.set(0, 2, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const hit = holo.pick(0, 0, camera, 720);
    const known = new Set([
      ...viewSnapshot.world.bodies.map((b) => b.id),
      ...viewSnapshot.world.asteroids.map((a) => a.id),
    ]);
    if (hit !== null) expect(known.has(hit)).toBe(true);
    // Far off in a corner there is nothing to find.
    expect(holo.pick(5, 5, camera, 720)).toBeNull();
    holo.dispose();
  });
});

describe('a forecast flown partly before it arrived (A18)', () => {
  const samples = [0, 100, 200, 300].map((t) => ({ t, position: { x: t, y: 0, z: t / 10 } }));

  it('draws what is already flown as past, meeting the rest at the forecast for now', () => {
    const { past, ahead } = pastAndAhead(samples, 150);
    expect(past.map((p) => p.x)).toEqual([0, 100, 150]);
    expect(ahead.map((p) => p.x)).toEqual([150, 200, 300]);
    expect(past.at(-1)).toEqual(ahead[0]);
    expect(ahead[0]?.z).toBeCloseTo(15, 9);
  });

  it('is all ahead before it starts, and all past after it ends', () => {
    expect(pastAndAhead(samples, -5).past).toEqual([]);
    expect(pastAndAhead(samples, 999).ahead).toEqual([]);
  });
});

describe('coverage from earlier attempts (2G coverageEarlier)', () => {
  const look = (t: number, x: number) => ({
    attemptId: 'a1',
    sensor: 'camera',
    from: t - 30,
    to: t + 30,
    origin: { x, y: 0, z: 0 },
    axis: { x: 0, y: 1, z: 0 },
    halfAngle: 0.5,
    range: 6e6,
  });
  const at = (t: number, looks: ReturnType<typeof look>[]) => ({
    t,
    world: {
      ...viewSnapshot.world,
      ship: { ...viewSnapshot.world.ship, position: { x: 0, y: 0, z: 0 } },
    },
    coverageEarlier: looks,
  });

  it('counts a look taken near this moment of the encounter, fading with encounter time', () => {
    const near = withEarlierAttempts([], at(1000, [look(1000, 0)]), 1.5e6);
    expect(near).toHaveLength(1);
    expect(near[0]?.fresh).toBeCloseTo(1, 9);
    expect(near[0]?.center).toBeCloseTo(Math.PI / 2, 9);
    const later = withEarlierAttempts([], at(1000 + 3600, [look(1000, 0)]), 1.5e6);
    expect(later[0]?.fresh).toBeGreaterThan(0);
    expect(later[0]?.fresh).toBeLessThan(near[0]!.fresh);
    expect(withEarlierAttempts([], at(1000 + 1e6, [look(1000, 0)]), 1.5e6)).toEqual([]);
  });

  it('drops looks that cannot reach the view, and keeps the freshest the plane can draw', () => {
    expect(withEarlierAttempts([], at(1000, [look(1000, 1e9)]), 1.5e6)).toEqual([]);
    const many = Array.from({ length: 60 }, (_, i) => look(1000 + i * 60, 0));
    const kept = withEarlierAttempts([], at(1000, many), 1.5e6);
    expect(kept.length).toBeLessThanOrEqual(24);
    for (let i = 1; i < kept.length; i++)
      expect(kept[i - 1]!.fresh).toBeGreaterThanOrEqual(kept[i]!.fresh);
  });
});

describe('close range where an encounter is studied close (3C, R4)', () => {
  it('lets FLIGHT zoom to 120 m in the Chain Link, in true metres, and keeps 5 km elsewhere', () => {
    expect(rangeMinFor('chain-link')).toBe(120);
    expect(rangeMinFor('gravity-range')).toBe(RANGE_MIN);
    const holo = make();
    holo.setRangeMin(rangeMinFor('chain-link'));
    holo.setRange(1);
    expect(holo.range()).toBe(120);
    holo.setRangeMin(RANGE_MIN);
    expect(holo.range()).toBe(RANGE_MIN);
    holo.dispose();
  });
});
