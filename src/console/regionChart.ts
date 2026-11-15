/**
 * What the console's charts draw of the region, from what the ship believes and has recorded
 * (P11): the bodies where they are believed to be, the rocks it has catalogued, the distances
 * from each body where its pull has been measured or a rule has been tested, and a flight as
 * its record measured it.
 *
 * A flight is charted from its record, not from the model: each paired bearing and range fix on
 * a body is where the ship measured itself to be relative to that body. So a recorded flight and
 * the forecast issued for it are compared in that body's frame, as Black Box compares them.
 */
import type {
  AttemptRecord,
  BelievedAsteroid,
  BelievedBody,
  Forecast,
  ForecastDraft,
  ModelState,
  Objective,
} from '../contracts/index.ts';
import { believedCentre, validatedSpans } from './data.ts';
import { CHART_UP, onPlane, sigmaAlong } from './instruments/chartMath.ts';
import type { ChartPlane, P2, P3, Sym3 } from './instruments/chartMath.ts';
import type { ChartBand, ChartBody, ChartRegion } from './instruments/TrajectoryChart.tsx';

type V = { readonly x: number; readonly y: number; readonly z?: number };
const p3 = (v: V): P3 => [v.x, v.y, v.z ?? 0];

/** The bodies where the ship believes they are now. */
export function chartBodies(
  bodies: readonly Pick<BelievedBody, 'id' | 'name' | 'radius' | 'position'>[],
  plane: ChartPlane = CHART_UP,
): ChartBody[] {
  return bodies.map((b) => {
    const [x, y] = onPlane(plane, p3(b.position));
    return { id: b.id, name: b.name, x, y, radius: b.radius };
  });
}

/** The rocks the ship has catalogued, where it believes they are. */
export function chartRocks(
  asteroids: readonly Pick<BelievedAsteroid, 'position'>[],
  plane: ChartPlane = CHART_UP,
): P2[] {
  return asteroids.map((a) => onPlane(plane, p3(a.position)));
}

/** A path of believed positions in the chart plane. */
export function chartPath(
  points: readonly { readonly position: V }[],
  plane: ChartPlane = CHART_UP,
): P2[] {
  return points.map((p) => onPlane(plane, p3(p.position)));
}

/**
 * The evidence the model stands on, as bands of distance around each body: where tracking data
 * exists (its pull is measured there), and where an adopted rule has passed a held-out test.
 */
export function evidenceBands(model: Pick<ModelState, 'support' | 'extensions'>): ChartBand[] {
  const bands: ChartBand[] = [];
  for (const [body, spans] of Object.entries(model.support.distance))
    for (const [rMin, rMax] of spans)
      if (rMax > rMin) bands.push({ body, rMin, rMax, kind: 'measured' });
  for (const [body, spans] of validatedSpans(model as ModelState))
    for (const s of spans) bands.push({ body, rMin: s.rMin, rMax: s.rMax, kind: 'validated' });
  return bands;
}

/**
 * Where the objectives are, for the chart: a region to reach where it is; a departure's gate as
 * the distance to pass, about the bodies' centre of mass as the ship believes it (left out
 * until the model holds a GM for every body, when that centre cannot be placed).
 */
export function objectiveRegions(
  objectives: readonly Objective[],
  bodies: readonly Pick<BelievedBody, 'id' | 'position' | 'velocity'>[],
  model: Pick<ModelState, 'parameters'>,
  plane: ChartPlane = CHART_UP,
): ChartRegion[] {
  const out: ChartRegion[] = [];
  for (const o of objectives) {
    if (o.kind === 'reach-region' && o.region) {
      const [x, y] = onPlane(plane, p3(o.region.center));
      out.push({ id: o.id, name: o.label, x, y, radius: o.region.radius, kind: 'reach' });
    } else if (o.depart) {
      const frame = believedCentre(bodies, model);
      if (!frame) continue;
      const [x, y] = onPlane(plane, p3(frame.centre));
      out.push({ id: o.id, name: o.label, x, y, radius: o.depart.beyond, kind: 'gate' });
    }
  }
  return out;
}

/**
 * Points that hold a region in view: each body whole, each place to reach whole, and whatever
 * else is given (paths, rocks). A departure's gate is not among them: it lies far outside what
 * is flown, and would shrink the flight to a dot.
 */
export function wholeFit(
  bodies: readonly Pick<ChartBody, 'x' | 'y' | 'radius'>[],
  regions: readonly ChartRegion[],
  ...more: readonly (readonly P2[])[]
): P2[] {
  const out: P2[] = [];
  for (const c of [...bodies, ...regions.filter((r) => r.kind === 'reach')])
    out.push([c.x - c.radius, c.y - c.radius], [c.x + c.radius, c.y + c.radius]);
  for (const list of more) out.push(...list);
  return out;
}

/**
 * How near a forecast comes to a region to reach: the moment it first enters it, or failing
 * that the moment it is nearest, with the distance from the region's edge then (negative
 * inside) and that distance's one sigma: the forecast's own uncertainty in the ship's position
 * there, along the line to the region's centre (null where the forecast gives none).
 * Undefined for a forecast with no samples.
 */
export function forecastReach(
  forecast: {
    readonly samples: readonly {
      readonly t: number;
      readonly position: V;
      readonly positionCov?: readonly number[];
    }[];
  },
  region: { readonly center: V; readonly radius: number },
): { t: number; edge: number; sigma: number | null; reached: boolean } | undefined {
  let best: { t: number; edge: number; sigma: number | null } | undefined;
  for (const s of forecast.samples) {
    const to: P3 = [
      region.center.x - s.position.x,
      region.center.y - s.position.y,
      (region.center.z ?? 0) - (s.position.z ?? 0),
    ];
    const edge = Math.hypot(to[0], to[1], to[2]) - region.radius;
    const sigma =
      s.positionCov?.length === 6 ? sigmaAlong(s.positionCov as unknown as Sym3, to) : null;
    if (edge <= 0) return { t: s.t, edge, sigma, reached: true };
    if (!best || edge < best.edge) best = { t: s.t, edge, sigma };
  }
  return best ? { ...best, reached: false } : undefined;
}

/** One measured fix: where the ship measured itself to be relative to a body, at a time. */
export interface MeasuredPoint {
  readonly t: number;
  /** The ship less the body, m. */
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * The flight as its record measured it, relative to `body`: each bearing fix on that body that
 * has a range fix from the same sensor at the same moment gives the ship's position from it.
 */
export function measuredTrack(
  record: Pick<AttemptRecord, 'measurements'>,
  body: string,
): MeasuredPoint[] {
  const ranges = new Map<string, number>();
  for (const m of record.measurements)
    if (m.kind === 'range' && m.target === body && m.value[0] !== undefined)
      ranges.set(`${m.t}|${m.source}`, m.value[0]);
  const out: MeasuredPoint[] = [];
  for (const m of record.measurements) {
    if (m.kind !== 'bearing' || m.target !== body) continue;
    const range = ranges.get(`${m.t}|${m.source}`);
    const azimuth = m.value[0];
    if (range === undefined || azimuth === undefined) continue;
    const elevation = m.value[1] ?? 0;
    // The line of sight runs from the ship to the body: the ship is back along it.
    const ce = Math.cos(elevation);
    out.push({
      t: m.t,
      position: {
        x: -range * ce * Math.cos(azimuth),
        y: -range * ce * Math.sin(azimuth),
        z: -range * Math.sin(elevation),
      },
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Where a measured track has a stretch with no fix: the indices at which it starts again. A gap
 * is a spacing more than `factor` times the usual one (the median), as Black Box counts them.
 */
export function trackBreaks(track: readonly { readonly t: number }[], factor = 3): number[] {
  if (track.length < 3) return [];
  const steps = track
    .slice(1)
    .map((p, i) => p.t - track[i]!.t)
    .sort((a, b) => a - b);
  const usual = steps[Math.floor(steps.length / 2)]!;
  const out: number[] = [];
  for (let i = 1; i < track.length; i++)
    if (track[i]!.t - track[i - 1]!.t > factor * usual) out.push(i);
  return out;
}

/** The body an attempt ranged most often: the one its flight is best charted against. */
export function mostRanged(record: Pick<AttemptRecord, 'measurements'>): string | undefined {
  const counts = new Map<string, number>();
  for (const m of record.measurements)
    if (m.kind === 'range' && m.target) counts.set(m.target, (counts.get(m.target) ?? 0) + 1);
  let best: string | undefined;
  for (const [id, n] of counts) if (best === undefined || n > counts.get(best)!) best = id;
  return best;
}

/**
 * A forecast seen from a body: every position less that body's own forecast position at the
 * same sample. Uncertainties are unchanged (the forecast's are already relative to the body it
 * was fixed against). Undefined when the forecast carries no track for the body.
 */
export function relativeTo<F extends Forecast | ForecastDraft>(
  forecast: F,
  body: string,
): F | undefined {
  const track = forecast.objects.find((o) => o.id === body);
  if (!track || track.samples.length === 0) return undefined;
  const at = (i: number): V => track.samples[Math.min(i, track.samples.length - 1)]!.position;
  const less = (p: V, origin: V): { x: number; y: number; z: number } => ({
    x: p.x - origin.x,
    y: p.y - origin.y,
    z: (p.z ?? 0) - (origin.z ?? 0),
  });
  return {
    ...forecast,
    samples: forecast.samples.map((s, i) => ({ ...s, position: less(s.position, at(i)) })),
    objects: forecast.objects.map((o) => ({
      ...o,
      samples: o.samples.map((s, i) => ({ ...s, position: less(s.position, at(i)) })),
    })),
  } as F;
}
