/**
 * Rocks as known-size targets (2D's request, A6): a briefed asteroid the camera is pointed at
 * is ranged as well as seen, so the ship tracks it; it goes stale when the camera looks away;
 * and both the navigator's forecast and the real model's carry its track and its closest
 * approach. Truth is used only to judge.
 */

import { describe, expect, it } from 'vitest';
import { covEllipsoid } from '../contracts/index.ts';
import { createGravityRange, LAW } from '../content/gravity-range/index.ts';
import { v3 } from '../lib/index.ts';
import { createModelClient } from '../model/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { createModelBridge } from './belief/model-bridge.ts';
import { createStandInModel, TRACK_STALE } from './belief/standin-model.ts';
import { createGameSession, type GameSession } from './session.ts';

const setup = createGravityRange();

/** A rock's believed position against the truth, both relative to Alpha. */
function rockError(session: GameSession, id: string) {
  const world = session.truth().sim.world;
  const alpha = world.bodies[0]!;
  const rock = world.asteroids.find((a) => a.id === id)!;
  const believed = session.snapshot().world;
  const seen = believed.asteroids.find((a) => a.id === id)!;
  return {
    seen,
    miss: v3.distance(
      v3.sub(seen.position, believed.bodies[0]!.position),
      v3.sub(rock.position, alpha.position),
    ),
    sigma: covEllipsoid(seen.positionCov).radii[0],
  };
}

describe('a briefed rock the camera is pointed at', () => {
  it(
    'is ranged and tracked, goes stale when the camera looks away, and is in the forecast',
    { timeout: 60_000 },
    async () => {
      // a-12, the nearest catalogued rock on arrival (about 310 km away, 1.2 km across).
      const id = 'a-12';
      expect(setup.definition.briefing.knownAsteroids.some((a) => a.id === id)).toBe(true);
      const session = createGameSession(setup, {
        model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
        blackBox: createBlackBox(),
        now: () => 'test',
      });
      session.stepTicks(60);
      const surveyed = rockError(session, id);
      expect(surveyed.seen.tracked).toBe(false);
      session.command({ kind: 'point', sensor: 'camera', target: id });
      session.stepTicks(2340);

      // Every packet carries an azimuth and elevation and, the rock's size being known, a range.
      const fixes = session.blackBox
        .attempt('attempt-0001')!
        .measurements.filter((m) => m.target === id);
      const bearings = fixes.filter((m) => m.kind === 'bearing');
      const ranges = fixes.filter((m) => m.kind === 'range');
      expect(bearings.length).toBeGreaterThan(100);
      expect(ranges).toHaveLength(bearings.length);
      expect(bearings[0]!.value).toHaveLength(2);

      // Tracked: a fresh fix, a position known to a few hundred metres instead of 5 km, and
      // the truth inside three of the believed sigmas (measured: 364 m against 349 m).
      const tracked = rockError(session, id);
      expect(tracked.seen.tracked).toBe(true);
      expect(tracked.seen.lastSeen).toBe(2380);
      expect(tracked.sigma).toBeLessThan(0.2 * surveyed.sigma);
      expect(tracked.miss).toBeLessThan(3 * tracked.sigma);
      expect(tracked.miss).toBeLessThan(1_000);

      // In the navigator's forecast: a track with a 3D envelope, a closest approach measured
      // to the rock's surface and the hull's reach, and the note of how it was tracked.
      const forecast = await session.preview({ items: [] });
      const track = forecast.objects.find((o) => o.id === id)!;
      expect(track.samples).toHaveLength(forecast.samples.length);
      expect(track.samples[0]!.positionCov[5]).toBeGreaterThan(0);
      const approach = forecast.closestApproaches.find((c) => c.id === id)!;
      expect(approach.distance).toBeGreaterThan(0);
      expect(approach.sigma).toBeGreaterThan(0);
      expect(forecast.detail!.asteroids).toEqual([
        { id, forecast: true, tLast: 2380, fixes: ranges.length },
      ]);

      // The camera goes back to Alpha: the rock keeps its last fix and is no longer tracked
      // once that fix is older than the stated time.
      session.command({ kind: 'point', sensor: 'camera', target: 'alpha' });
      session.stepTicks(TRACK_STALE + 20);
      const stale = rockError(session, id).seen;
      expect(stale.tracked).toBe(false);
      expect(stale.lastSeen).toBe(2380);
      expect(session.snapshot().world.bodies[0]!.tracked).toBe(true);
    },
  );

  it(
    'reaches the real model through Black Box: its forecast carries the track and the pass',
    { timeout: 120_000 },
    async () => {
      const id = 'a-11';
      const model = createModelBridge(createModelClient({ worker: false }), {
        referenceRadius: LAW.referenceRadius,
      });
      const session = createGameSession(setup, {
        model,
        blackBox: createBlackBox(),
        rules: model.rules,
        now: () => 'test',
      });
      session.stepTicks(60);
      session.command({ kind: 'point', sensor: 'camera', target: id });
      session.stepTicks(2400);
      session.command({ kind: 'point', sensor: 'camera', target: 'alpha' });
      session.stepTicks(1200);
      await model.settled();
      const forecast = await session.commit({ items: [] });
      expect(model.lastError()).toBeUndefined();
      const track = forecast.objects.find((o) => o.id === id);
      expect(track).toBeDefined();
      expect(track!.samples.length).toBeGreaterThan(100);
      const approach = forecast.closestApproaches.find((c) => c.id === id)!;
      expect(approach.distance).toBeGreaterThan(0);
      expect(approach.sigma).toBeGreaterThan(0);
      expect(forecast.detail!.asteroids.find((a) => a.id === id)).toMatchObject({
        forecast: true,
      });
    },
  );
});
