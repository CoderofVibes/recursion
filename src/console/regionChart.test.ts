/**
 * What the charts draw of the region: the evidence as bands, and a flight as its record
 * measured it, in the frame of the body it ranged.
 */
import { describe, expect, it } from 'vitest';
import { attempts, models, viewSnapshot } from '../contracts/fixtures/index.ts';
import type { ForecastDraft, Measurement, ModelState } from '../contracts/index.ts';
import {
  chartBodies,
  chartPath,
  chartRocks,
  evidenceBands,
  measuredTrack,
  mostRanged,
  relativeTo,
} from './regionChart.ts';

describe('the region as the charts draw it', () => {
  it('puts bodies and rocks where the ship believes they are, chart up', () => {
    const bodies = chartBodies([
      { id: 'alpha', name: 'Alpha', radius: 250_000, position: { x: 3, y: 4, z: 9 } },
    ]);
    expect(bodies).toEqual([{ id: 'alpha', name: 'Alpha', x: 3, y: 4, radius: 250_000 }]);
    expect(chartRocks([{ position: { x: 1, y: 2, z: 3 } }])).toEqual([[1, 2]]);
    expect(chartPath([{ position: { x: 5, y: 6 } }])).toEqual([[5, 6]]);
    // The fixture world charts without inventing anything.
    expect(chartBodies(viewSnapshot.world.bodies)).toHaveLength(viewSnapshot.world.bodies.length);
  });

  it('draws the evidence as bands: where the pull is measured, where a rule is tested', () => {
    const model = {
      support: {
        distance: {
          alpha: [
            [500_000, 1_000_000],
            [7, 7],
          ],
        },
        powered: [],
      },
      extensions: [
        {
          id: 'distance-law',
          status: 'adopted',
          validatedSpans: [{ body: 'alpha', rMin: 480_000, rMax: 1_020_000, sigmaE: 0.01 }],
        },
        {
          id: 'another',
          status: 'candidate',
          validatedSpans: [{ body: 'alpha', rMin: 1, rMax: 2, sigmaE: 0.01 }],
        },
      ],
    } as unknown as ModelState;
    expect(evidenceBands(model)).toEqual([
      { body: 'alpha', rMin: 500_000, rMax: 1_000_000, kind: 'measured' },
      // Only an adopted rule's spans count; an empty span is not a band.
      { body: 'alpha', rMin: 480_000, rMax: 1_020_000, kind: 'validated' },
    ]);
    expect(evidenceBands(models.distanceLaw).every((b) => b.rMax > b.rMin)).toBe(true);
  });
});

describe('a flight as its record measured it', () => {
  const fix = (t: number, azimuth: number, range: number, target = 'alpha'): Measurement[] => [
    { kind: 'bearing', t, source: 'camera', target, value: [azimuth, 0], sigma: [1e-4, 1e-4] },
    { kind: 'range', t, source: 'camera', target, value: [range], sigma: [100] },
  ];

  it('places the ship back along each line of sight, by the range measured with it', () => {
    const record = {
      measurements: [
        ...fix(10, 0, 1000),
        ...fix(20, Math.PI / 2, 2000),
        // A bearing with no range at that moment gives no position.
        { kind: 'bearing', t: 30, source: 'camera', target: 'alpha', value: [0, 0], sigma: [1e-4] },
        ...fix(40, 0, 500, 'beta'),
      ] as Measurement[],
    };
    const track = measuredTrack(record, 'alpha');
    expect(track.map((p) => p.t)).toEqual([10, 20]);
    // Alpha seen along +x at 1,000 m: the ship is 1,000 m back along −x from it.
    expect(track[0]!.position.x).toBeCloseTo(-1000, 9);
    expect(track[0]!.position.y).toBeCloseTo(0, 9);
    expect(track[1]!.position.x).toBeCloseTo(0, 6);
    expect(track[1]!.position.y).toBeCloseTo(-2000, 9);
    expect(mostRanged(record)).toBe('alpha');
    expect(measuredTrack(record, 'beta')).toHaveLength(1);
    expect(mostRanged({ measurements: [] })).toBeUndefined();
  });

  it('reads the fixture attempts without a NaN', () => {
    for (const a of attempts) {
      const body = mostRanged(a);
      if (!body) continue;
      for (const p of measuredTrack(a, body))
        expect(Number.isFinite(p.position.x + p.position.y + p.position.z)).toBe(true);
    }
  });

  it('sees a forecast from a body: the ship and every body less that body’s own track', () => {
    const forecast = {
      samples: [
        { t: 0, position: { x: 10, y: 0, z: 0 } },
        { t: 1, position: { x: 20, y: 5, z: 0 } },
      ],
      objects: [
        {
          id: 'alpha',
          samples: [
            { t: 0, position: { x: 1, y: 1, z: 0 } },
            { t: 1, position: { x: 2, y: 2, z: 0 } },
          ],
        },
        {
          id: 'beta',
          samples: [
            { t: 0, position: { x: 100, y: 0, z: 0 } },
            { t: 1, position: { x: 100, y: 0, z: 0 } },
          ],
        },
      ],
    } as unknown as ForecastDraft;
    const seen = relativeTo(forecast, 'alpha')!;
    expect(seen.samples.map((s) => s.position)).toEqual([
      { x: 9, y: -1, z: 0 },
      { x: 18, y: 3, z: 0 },
    ]);
    expect(seen.objects[0]!.samples.map((s) => s.position)).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ]);
    expect(seen.objects[1]!.samples[1]!.position).toEqual({ x: 98, y: -2, z: 0 });
    // No track for the body: nothing to be relative to.
    expect(relativeTo(forecast, 'gamma')).toBeUndefined();
  });
});
