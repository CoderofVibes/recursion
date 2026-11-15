/**
 * A forecast as the instruments read it: the plan's own steps in order, how far the model
 * stands behind it, and the ship's believed state at a moment with honest uncertainty.
 */
import { describe, expect, it } from 'vitest';
import { viewSnapshot } from '../contracts/fixtures/index.ts';
import type { ForecastDraft } from '../contracts/index.ts';
import { forecastClock, readForecast } from './forecastReading.ts';

const BODIES = [
  { id: 'alpha', name: 'Alpha', radius: 250_000, position: { x: 0, y: 0, z: 0 } },
  { id: 'beta', name: 'Beta', radius: 160_000, position: { x: 4_000_000, y: 0, z: 0 } },
];

/** σ 100 m along the path (x), 300 m across it (y), 50 m out of the plane. */
const COV = [1e4, 0, 0, 9e4, 0, 2500] as const;

/**
 * Five samples, 100 s apart, flying +x at 10 m/s along y = −1,000 km. A burn at 150 s, a
 * pointing at 50 s, Beta's closest approach at 300 s. The model is beyond its data from 300 s.
 * Beta moves +y at 100 m/s and carries its own uncertainty; Alpha has no track.
 */
const forecast = {
  id: 'forecast-test',
  attemptId: 'attempt-1',
  issuedAt: 0,
  modelVersion: 3,
  horizon: 400,
  inputs: {
    plan: {
      id: 'plan-1',
      epoch: 0,
      items: [
        { id: 'p1', at: 50, command: { kind: 'point', sensor: 'camera', target: 'beta' } },
        {
          id: 'p2',
          at: 150,
          command: {
            kind: 'burn',
            thruster: 'main-engine',
            throttle: 0.5,
            duration: 20,
            attitude: { reference: 'retrograde' },
          },
        },
        { id: 'p3', at: 120, command: { kind: 'attitude', target: { reference: 'retrograde' } } },
      ],
    },
  },
  samples: [0, 100, 200, 300, 400].map((t, i) => ({
    t,
    position: { x: t * 10, y: -1_000_000, z: 0 },
    velocity: { x: 10, y: 0, z: 0 },
    positionCov: COV,
    extrapolating: i >= 3,
  })),
  objects: [
    {
      id: 'beta',
      samples: [0, 100, 200, 300, 400].map((t) => ({
        t,
        position: { x: 4_000_000, y: t * 100, z: 0 },
        positionCov: [4e6, 0, 0, 4e6, 0, 4e6],
      })),
    },
  ],
  closestApproaches: [
    { id: 'beta', t: 300, distance: 3_000_000, sigma: 32_000 },
    { id: 'alpha', t: 400, distance: 750_000, sigma: 9000 },
  ],
  detail: {
    sigmaMajor: [0, 100, 200, 300, 400].map((t) => ({
      t,
      state: 100,
      profile: 0,
      hedge: t,
      engine: 0,
      mass: 0,
      total: Math.hypot(100, t),
    })),
    presentSource: 'arrival',
    presentTime: 0,
    asteroids: [],
  },
} as unknown as ForecastDraft;

describe('a forecast as the instruments read it', () => {
  const reading = readForecast(forecast, BODIES);

  it('walks the plan’s own steps in time order, and stops where the model stops', () => {
    expect(reading.steps.map((s) => [s.label, s.t])).toEqual([
      ['NOW', 0],
      ['POINT', 50],
      ['BURN 1', 150],
      ['COAST 1', 170],
      ['BEYOND THE DATA', 300],
      ['BETA CLOSEST', 300],
      ['FORECAST ENDS', 400],
    ]);
    expect(reading.steps.find((s) => s.kind === 'burn')!.detail).toBe('retrograde · 20.0 s at 50%');
    expect(reading.steps.find((s) => s.kind === 'pointing')!.detail).toBe('camera at Beta');
    // An attitude command is not a step, and the "closest approach" at the last sample is only
    // where the forecast stops: it is not offered as a pass.
    expect(reading.steps.some((s) => s.label === 'ALPHA CLOSEST')).toBe(false);
    expect(reading.endsAt).toBe(400);
    expect(reading.endsBeyondData).toBe(true);
    expect(reading.steps.at(-1)!.detail).toContain('beyond the data');
  });

  it('says how far along the model stands behind the forecast', () => {
    expect(reading.spans).toEqual([
      { from: 0, to: 300, kind: 'supported' },
      { from: 300, to: 400, kind: 'extrapolating' },
    ]);
    // The envelope's half-width is the sigma across the path, not along it.
    expect(reading.path.map((p) => p.sigma)).toEqual([300, 300, 300, 300, 300]);
  });

  it('puts each body where the forecast has it at that moment', () => {
    const [alpha, beta] = reading.bodiesAt(200);
    // No track for Alpha: where it is believed to be now.
    expect(alpha).toMatchObject({ id: 'alpha', x: 0, y: 0, radius: 250_000 });
    expect(alpha!.track).toBeUndefined();
    expect(beta).toMatchObject({ id: 'beta', x: 4_000_000, y: 20_000 });
    expect(beta!.track).toHaveLength(5);
  });

  it('gives the ship’s state at a moment, with its distance to each body and an honest sigma', () => {
    const ship = reading.shipAt(200);
    expect(ship).toMatchObject({ x: 2000, y: -1_000_000, speed: 10, extrapolating: false });
    expect(ship.heading).toBeCloseTo(0, 12);
    expect(ship.ellipse.a).toBeCloseTo(300, 9);
    expect(ship.ellipse.b).toBeCloseTo(100, 9);
    expect(ship.sigma?.hedge).toBe(200);
    const [alpha, beta] = ship.ranges;
    // Alpha is straight "up" the chart from the ship: the sigma is the one across the path.
    expect(alpha!.clearance).toBeCloseTo(Math.hypot(2000, 1_000_000) - 250_000, 3);
    expect(alpha!.sigma!).toBeCloseTo(300, 0);
    // Beta's own track is uncertain too: its sigma adds in quadrature to the ship's.
    expect(beta!.sigma!).toBeGreaterThan(2000);
    expect(beta!.sigma!).toBeLessThan(2100);
  });

  it('uses the model’s own figure at a pass it names', () => {
    const beta = reading.shipAt(300).ranges[1]!;
    expect(beta.sigma).toBe(32_000);
    expect(reading.shipAt(300).extrapolating).toBe(true);
  });

  it('holds to the forecast’s ends: nothing before its issue or past its last sample', () => {
    expect(reading.shipAt(-50).t).toBe(0);
    expect(reading.shipAt(9999)).toMatchObject({ t: 400, x: 4000 });
  });

  it('reads the fixture forecast without inventing anything', () => {
    const issued = viewSnapshot.forecasts.at(-1)!;
    const r = readForecast(issued, viewSnapshot.world.bodies);
    expect(r.path).toHaveLength(issued.samples.length);
    expect(r.steps[0]).toMatchObject({ kind: 'now', t: issued.issuedAt });
    expect(r.steps.at(-1)).toMatchObject({ kind: 'ends', t: issued.samples.at(-1)!.t });
    expect(r.steps.map((s) => s.t)).toEqual([...r.steps.map((s) => s.t)].sort((a, b) => a - b));
    const mid = r.shipAt((r.issuedAt + r.endsAt) / 2);
    expect(Number.isFinite(mid.x) && Number.isFinite(mid.speed)).toBe(true);
    for (const range of mid.ranges) expect(Number.isFinite(range.clearance)).toBe(true);
    expect(r.bodiesAt(r.endsAt).map((b) => b.id)).toEqual(
      viewSnapshot.world.bodies.map((b) => b.id),
    );
  });

  it('writes a forecast time as the console does', () => {
    expect(forecastClock(3661)).toBe('T+01:01:01');
  });
});
