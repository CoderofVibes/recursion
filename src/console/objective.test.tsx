/**
 * The objective on the charts, and the forecast read against it (R51: the screens must show
 * where a plan has to get to). A place to reach is drawn where it is, pointed to from a chart
 * that does not hold it, and the forecast says how near it comes. A departure is read where the
 * forecast ends: how fast, which way, how far out.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { viewSnapshot } from '../contracts/fixtures/index.ts';
import type { Forecast, ModelState, Objective, ViewSnapshot } from '../contracts/index.ts';
import { believedCentre, departForecast, departProgress } from './data.ts';
import { TrajectoryChart, edgePointer } from './instruments/TrajectoryChart.tsx';
import { forecastReach, objectiveRegions, wholeFit } from './regionChart.ts';

const body = (id: string, x: number, vy: number) => ({
  ...viewSnapshot.world.bodies[0]!,
  id,
  position: { x, y: 0, z: 0 },
  velocity: { x: 0, y: vy, z: 0 },
});
/** Two bodies, GM 3 and 1: their centre of mass is at x = 1, drifting at +0.5 in y. */
const bodies = [body('a', 0, 1), body('b', 4, -1)];
const model = {
  parameters: [
    { id: 'body.a.mu', value: 3 },
    { id: 'body.b.mu', value: 1 },
  ],
} as unknown as Pick<ModelState, 'parameters'>;
const depart = {
  id: 'd',
  kind: 'depart',
  label: 'DEPART 50 M/S',
  depart: { beyond: 9_000_000, minSpeed: 50 },
} as unknown as Objective;
const reach = {
  id: 'forward',
  kind: 'reach-region',
  label: 'FORWARD TRANSIT',
  region: { center: { x: 1000, y: 2000, z: 300 }, radius: 350 },
} as unknown as Objective;

describe('the centre the ship believes the bodies turn about', () => {
  it('is their positions and velocities weighted by the model’s GM for each', () => {
    const frame = believedCentre(bodies, model)!;
    expect(frame.centre).toEqual({ x: 1, y: 0, z: 0 });
    expect(frame.drift).toEqual({ x: 0, y: 0.5, z: 0 });
  });

  it('cannot be placed before the model holds a GM for every body, or with no body', () => {
    expect(believedCentre(bodies, { parameters: [model.parameters[0]!] })).toBeNull();
    expect(believedCentre([], model)).toBeNull();
  });
});

describe('where the objectives are, for the chart', () => {
  it('draws a place to reach where it is, and a departure’s gate about the believed centre', () => {
    expect(objectiveRegions([reach, depart], bodies, model)).toEqual([
      { id: 'forward', name: 'FORWARD TRANSIT', x: 1000, y: 2000, radius: 350, kind: 'reach' },
      { id: 'd', name: 'DEPART 50 M/S', x: 1, y: 0, radius: 9_000_000, kind: 'gate' },
    ]);
  });

  it('leaves the gate out while its centre cannot be placed, and invents nothing else', () => {
    expect(objectiveRegions([depart], bodies, { parameters: [] })).toEqual([]);
    const custom = { id: 'c', kind: 'custom', label: 'SURVEY' } as unknown as Objective;
    expect(objectiveRegions([custom], bodies, model)).toEqual([]);
  });

  it('holds bodies and places to reach whole in view, and never the gate', () => {
    const regions = objectiveRegions([reach, depart], bodies, model);
    const fit = wholeFit([{ x: 0, y: 0, radius: 100 }], regions, [[5000, -40]]);
    expect(fit).toEqual([
      [-100, -100],
      [100, 100],
      [650, 1650],
      [1350, 2350],
      [5000, -40],
    ]);
  });
});

/**
 * A forecast flying along +x at 100 m/s from the origin, a sample every 10 s for 100 s. Its
 * position is known to 30 m along x, 40 m along y and 120 m along z (one sigma), uncorrelated.
 */
const flying = {
  samples: Array.from({ length: 11 }, (_, i) => ({
    t: i * 10,
    position: { x: i * 1000, y: 0, z: 0 },
    velocity: { x: 100, y: 0, z: 0 },
    positionCov: [30 ** 2, 0, 0, 40 ** 2, 0, 120 ** 2],
  })),
  objects: [],
} as unknown as Forecast;

describe('how near a forecast comes to a place to reach', () => {
  it('gives the first moment it is inside', () => {
    const through = { center: { x: 6000, y: 0, z: 0 }, radius: 1500 };
    // Inside from x = 4500: the first sample there is x = 5000, at t = 50.
    // The region's centre lies along x from there: the position's sigma along that line is x's.
    expect(forecastReach(flying, through)).toEqual({ t: 50, edge: -500, sigma: 30, reached: true });
  });

  it('gives the nearest it comes when it never enters, measured to the region’s edge', () => {
    const beside = { center: { x: 4000, y: 3000, z: 4000 }, radius: 1000 };
    const reachOf = forecastReach(flying, beside)!;
    expect(reachOf.reached).toBe(false);
    expect(reachOf.t).toBe(40);
    // 5 km from its centre in space (3 and 4 km off the path), less its radius.
    expect(reachOf.edge).toBeCloseTo(4000, 9);
    // Its uncertainty is the position's along that line: 0.6 of y's sigma and 0.8 of z's,
    // added in quadrature.
    expect(reachOf.sigma).toBeCloseTo(Math.hypot(0.6 * 40, 0.8 * 120), 9);
    // A forecast that gives no covariance has no uncertainty to show, never a zero.
    const bare = { samples: flying.samples.map(({ t, position }) => ({ t, position })) };
    expect(forecastReach(bare, beside)!.sigma).toBeNull();
  });

  it('says nothing of a forecast with no samples', () => {
    expect(forecastReach({ samples: [] }, { center: { x: 0, y: 0 }, radius: 1 })).toBeUndefined();
  });
});

describe('a departure, where a forecast ends', () => {
  const snapshot = {
    world: { ...viewSnapshot.world, bodies },
    objectives: [depart],
  } as unknown as Pick<ViewSnapshot, 'world' | 'objectives'>;

  it('is the ship’s speed and distance from the centre of mass there, and whether it is going out', () => {
    const at = departForecast(flying, snapshot, model)!;
    // The ship ends at x = 10,000 doing 100 m/s along +x; the centre is at x = 1, drifting
    // at 0.5 m/s in y (no forecast track for the bodies: they stay as believed now).
    expect(at.t).toBe(100);
    expect(at.distance).toBeCloseTo(9999, 9);
    expect(at.speed).toBeCloseTo(Math.hypot(100, 0.5), 9);
    expect(at.outward).toBeCloseTo(100, 9);
    // The distance out is uncertain by the position's sigma along the line from the centre,
    // which here is x's.
    expect(at.distanceSigma).toBeCloseTo(30, 6);
    expect(at.minSpeed).toBe(50);
    expect(at.beyond).toBe(9_000_000);
  });

  it('agrees with the standing now, for a forecast that ends where the ship is', () => {
    const ship = {
      ...viewSnapshot.world.ship,
      position: { x: 3, y: 0, z: 0 },
      velocity: { x: 0, y: 5, z: 0 },
    };
    const now = { ...snapshot, world: { ...snapshot.world, ship } } as typeof snapshot;
    const still = {
      samples: [{ t: 0, position: ship.position, velocity: ship.velocity }],
      objects: [],
    } as unknown as Forecast;
    const standing = departProgress(now, model)!;
    const at = departForecast(still, now, model)!;
    expect(at.speed).toBeCloseTo(standing.speed, 12);
    expect(at.distance).toBeCloseTo(standing.distance, 12);
  });

  it('moves the bodies to where the forecast has them, and takes their speed from its track', () => {
    // Both bodies carried 100 m along +x per second over the last 10 s: the centre and its
    // drift move with them, so a ship doing the same is going nowhere relative to them.
    const carried = {
      ...flying,
      objects: bodies.map((b) => ({
        id: b.id,
        samples: [
          { t: 90, position: { x: b.position.x + 9000, y: 0, z: 0 } },
          { t: 100, position: { x: b.position.x + 10_000, y: 0, z: 0 } },
        ],
      })),
    } as unknown as Forecast;
    const at = departForecast(carried, snapshot, model)!;
    expect(at.speed).toBeCloseTo(0, 9);
    expect(at.distance).toBeCloseTo(1, 9);
  });

  it('says a ship heading back in is, and nothing where there is nothing to say', () => {
    const inbound = {
      samples: [{ t: 0, position: { x: 5000, y: 0, z: 0 }, velocity: { x: -80, y: 0.5, z: 0 } }],
      objects: [],
    } as unknown as Forecast;
    expect(departForecast(inbound, snapshot, model)!.outward).toBeCloseTo(-80, 9);
    expect(departForecast({ ...flying, samples: [] }, snapshot, model)).toBeNull();
    expect(departForecast(flying, { ...snapshot, objectives: [reach] }, model)).toBeNull();
    expect(departForecast(flying, snapshot, { parameters: [] })).toBeNull();
  });
});

describe('the objective on the chart', () => {
  it('finds no pointer for what the chart holds, and one on its edge for what it does not', () => {
    expect(edgePointer(100, 100, 640, 400)).toBeNull();
    expect(edgePointer(0, 400, 640, 400)).toBeNull();
    // Straight to the right: on the middle line, a margin inside the right edge, pointing right.
    expect(edgePointer(5000, 200, 640, 400)).toEqual({ x: 640 - 22, y: 200, angle: 0 });
    // Straight up (the chart's y runs down): a margin inside the top edge.
    const up = edgePointer(320, -900, 640, 400)!;
    expect(up.x).toBe(320);
    expect(up.y).toBe(22);
    expect(up.angle).toBeCloseTo(-Math.PI / 2, 12);
    // Off a corner: on the line from the middle, inside both margins.
    const corner = edgePointer(3000, 3000, 640, 400)!;
    expect(corner.x).toBeLessThanOrEqual(640 - 22);
    expect(corner.y).toBeCloseTo(400 - 22, 9);
    expect((corner.y - 200) / (corner.x - 320)).toBeCloseTo((3000 - 200) / (3000 - 320), 9);
  });

  const chart = (fit: [number, number][]) =>
    renderToStaticMarkup(
      <TrajectoryChart
        label="Objectives"
        bodies={[{ id: 'alpha', name: 'Alpha', x: 0, y: 0, radius: 50 }]}
        regions={[
          { id: 'forward', name: 'FORWARD TRANSIT', x: 4000, y: 0, radius: 500, kind: 'reach' },
          { id: 'd', name: 'DEPART', x: 0, y: 0, radius: 90_000, kind: 'gate' },
        ]}
        cursor={{ x: 1000, y: 0, heading: 0 }}
        fit={fit}
      />,
    );

  it('draws a place to reach as a named ring when the chart holds it, with no pointer', () => {
    const html = chart([
      [-500, -2000],
      [5000, 2000],
    ]);
    expect(html).toMatch(/class="ci-chart__region" data-kind="reach"/);
    expect(html).toContain('>FORWARD TRANSIT</text>');
    expect(html).not.toContain('ci-chart__pointer');
  });

  it('points to one the chart does not hold, with how far it is from the ship to its edge', () => {
    const html = chart([
      [-500, -400],
      [1500, 400],
    ]);
    // 4,000 − 1,000 from the ship to its centre, less its 500 m radius.
    expect(html).toMatch(/class="ci-chart__pointer".*>FORWARD TRANSIT · 2\.5 km<\/text>/);
    // The gate is never pointed to: it is all around, not somewhere to steer for.
    expect(html.split('ci-chart__pointer')).toHaveLength(2);
  });
});
