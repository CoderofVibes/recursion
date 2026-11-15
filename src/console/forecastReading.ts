/**
 * A forecast as the console's instruments read it: its path in the chart plane with the
 * envelope's width at each sample, the steps it can be walked through (the plan's own burns and
 * pointings, each closest approach, where the model goes beyond its data, where it stops), how
 * far along it the model stands behind it, where every body is at a moment, and the ship's
 * believed state there with its distance to each body and what its uncertainty is made of.
 *
 * The forecast is the model's, of the player's plan: nothing here plans (P6), and nothing here
 * knows more than the forecast does (P11). Pure: a forecast and the believed bodies in, rows out.
 */
import type {
  BelievedBody,
  Forecast,
  ForecastDraft,
  ForecastSigmaBySource,
} from '../contracts/index.ts';
import { clock, dist, fixed } from './format.ts';
import {
  CHART_UP,
  at,
  onPlane,
  pathOf,
  sigmaAlong,
  sigmaEllipse,
  stepsOf,
} from './instruments/chartMath.ts';
import type { ChartPlane, P2, P3, PathPoint, Step, Sym3 } from './instruments/chartMath.ts';

type AnyForecast = Forecast | ForecastDraft;
type V = { readonly x: number; readonly y: number; readonly z?: number };

const p3 = (v: V): P3 => [v.x, v.y, v.z ?? 0];
const sym3 = (c: readonly number[]): Sym3 => [
  c[0] ?? 0,
  c[1] ?? 0,
  c[2] ?? 0,
  c[3] ?? 0,
  c[4] ?? 0,
  c[5] ?? 0,
];

/** A stretch of the forecast, by how the model stands behind it. */
export interface ForecastSpan {
  readonly from: number;
  readonly to: number;
  readonly kind: 'supported' | 'validated' | 'extrapolating';
}

/** A body where the forecast puts it at a moment. */
export interface BodyAt {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Its forecast path in the chart plane, when the forecast carries one. */
  readonly track?: readonly P2[];
}

/** The ship's distance to one body at a moment of the forecast. */
export interface RangeAt {
  readonly id: string;
  readonly name: string;
  /** Hull-free distance from the centre of mass to the body's surface, m. */
  readonly clearance: number;
  /** One sigma of that distance, m. Null where the forecast gives no basis for one. */
  readonly sigma: number | null;
}

export interface ShipAt {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  /** Direction of travel in the chart plane, radians counter-clockwise from +x. */
  readonly heading: number;
  /** One-sigma ellipse of the position in the chart plane. */
  readonly ellipse: { readonly a: number; readonly b: number; readonly angle: number };
  readonly speed: number;
  readonly ranges: readonly RangeAt[];
  /** What the uncertainty there is made of, where the forecast says. */
  readonly sigma?: ForecastSigmaBySource;
  readonly extrapolating: boolean;
  readonly validated: boolean;
}

export interface ForecastReading {
  readonly issuedAt: number;
  /** Time of the last sample: where the model stops. */
  readonly endsAt: number;
  readonly modelVersion: number;
  /** The forecast's last sample is beyond the model's data: it stopped for lack of evidence. */
  readonly endsBeyondData: boolean;
  readonly path: readonly PathPoint[];
  readonly steps: readonly Step[];
  readonly spans: readonly ForecastSpan[];
  /** The envelope's makeup at every sample, where the forecast carries it. */
  readonly sigma: readonly ForecastSigmaBySource[];
  bodiesAt(t: number): BodyAt[];
  shipAt(t: number): ShipAt;
}

/** A burn in the plan, in the step's words: where it points, how long, how hard. */
function burnWords(command: {
  readonly duration: number;
  readonly throttle: number;
  readonly attitude?: { readonly reference: string; readonly target?: string };
}): string {
  const a = command.attitude;
  const aim = !a
    ? 'as the ship points'
    : a.reference === 'toward' || a.reference === 'away'
      ? `${a.reference === 'away' ? 'away from' : 'toward'} ${a.target ?? 'a body'}`
      : a.reference === 'direction' || a.reference === 'inertial'
        ? 'a held direction'
        : a.reference;
  return `${aim} · ${fixed(command.duration, 1)} s at ${Math.round(command.throttle * 100)}%`;
}

/**
 * Read a forecast for the instruments. `bodies` are the believed bodies (their names and radii,
 * and where they are now for a forecast that carries no track for one).
 */
export function readForecast(
  forecast: AnyForecast,
  bodies: readonly Pick<BelievedBody, 'id' | 'name' | 'radius' | 'position'>[],
  plane: ChartPlane = CHART_UP,
): ForecastReading {
  const samples = forecast.samples;
  const path = pathOf(
    plane,
    samples.map((s) => ({
      t: s.t,
      position: p3(s.position),
      cov: sym3(s.positionCov),
      extrapolating: s.extrapolating,
      validated: s.validated === true,
    })),
  );
  const endsAt = samples.at(-1)?.t ?? forecast.issuedAt;
  const nameOf = (id: string): string => bodies.find((b) => b.id === id)?.name ?? id;

  // Each body's forecast track, in the plane and in space, with its own uncertainty.
  const tracks = new Map(
    forecast.objects.map((o) => [
      o.id,
      o.samples.map((s) => {
        const [x, y] = onPlane(plane, p3(s.position));
        return { t: s.t, x, y, p: p3(s.position), cov: sym3(s.positionCov) };
      }),
    ]),
  );
  const bodyAt = (
    body: Pick<BelievedBody, 'id' | 'position'>,
    t: number,
  ): { x: number; y: number; p: P3; cov: Sym3 | null } => {
    const track = tracks.get(body.id);
    const found = track ? at(track, t) : undefined;
    if (!track || !found) {
      const p = p3(body.position);
      const [x, y] = onPlane(plane, p);
      return { x, y, p, cov: null };
    }
    const near = track[found.index]!;
    return { x: found.x, y: found.y, p: near.p, cov: near.cov };
  };

  // The plan's own steps: its burns and pointings, at the times the forecast was given.
  const epoch = forecast.inputs.plan.epoch;
  const burns: { t: number; duration: number; label: string }[] = [];
  const pointings: { t: number; label: string }[] = [];
  for (const item of forecast.inputs.plan.items) {
    const c = item.command;
    if (c.kind === 'burn')
      burns.push({ t: epoch + item.at, duration: c.duration, label: burnWords(c) });
    else if (c.kind === 'point' && c.target)
      pointings.push({ t: epoch + item.at, label: `camera at ${nameOf(c.target)}` });
  }
  const beyondAt = samples.find((s) => s.extrapolating && s.validated !== true)?.t;
  const endsBeyondData =
    samples.at(-1)?.extrapolating === true && samples.at(-1)?.validated !== true;
  const steps = stepsOf({
    issuedAt: forecast.issuedAt,
    endsAt,
    endsEarly: endsBeyondData,
    ...(beyondAt !== undefined ? { beyondAt } : {}),
    burns,
    pointings,
    // A "closest approach" at the last sample is only where the forecast stops, not a pass.
    closest: forecast.closestApproaches
      .filter((c) => c.t < endsAt - 1e-6)
      .map((c) => ({
        id: c.id,
        name: nameOf(c.id),
        t: c.t,
        text: `${dist(c.distance)} ±${dist(c.sigma)} from the surface`,
      })),
  });

  // Runs of samples the model stands behind, has tested, or is beyond its data for.
  const kindOf = (i: number): ForecastSpan['kind'] => {
    const s = samples[i]!;
    return s.extrapolating ? (s.validated === true ? 'validated' : 'extrapolating') : 'supported';
  };
  const spans: ForecastSpan[] = [];
  for (let start = 0, i = 1; i <= samples.length; i++) {
    if (i < samples.length && kindOf(i) === kindOf(start)) continue;
    const last = samples[Math.min(i, samples.length - 1)]!;
    if (last.t > samples[start]!.t || samples.length === 1)
      spans.push({ from: samples[start]!.t, to: last.t, kind: kindOf(start) });
    start = i;
  }

  const sigma = forecast.detail?.sigmaMajor ?? [];
  return {
    issuedAt: forecast.issuedAt,
    endsAt,
    modelVersion: forecast.modelVersion,
    endsBeyondData,
    path,
    steps,
    spans,
    sigma,
    bodiesAt: (t) =>
      bodies.map((b) => {
        const here = bodyAt(b, t);
        const track = tracks.get(b.id);
        return {
          id: b.id,
          name: b.name,
          x: here.x,
          y: here.y,
          radius: b.radius,
          ...(track && track.length > 1 ? { track: track.map((s): P2 => [s.x, s.y]) } : {}),
        };
      }),
    shipAt: (time) => {
      const t = Math.min(endsAt, Math.max(forecast.issuedAt, time));
      const found = at(path, t);
      const index = found?.index ?? 0;
      const s = samples[index];
      if (!found || !s)
        return {
          t,
          x: 0,
          y: 0,
          heading: 0,
          ellipse: { a: 0, b: 0, angle: 0 },
          speed: 0,
          ranges: [],
          extrapolating: false,
          validated: false,
        };
      const cov = sym3(s.positionCov);
      const [vx, vy] = onPlane(plane, p3(s.velocity));
      const here = p3(s.position);
      const part = sigma[index];
      return {
        t,
        x: found.x,
        y: found.y,
        heading: Math.atan2(vy, vx),
        ellipse: sigmaEllipse(plane, cov),
        speed: Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z ?? 0),
        ranges: bodies.map((b) => {
          const body = bodyAt(b, t);
          const line: P3 = [body.p[0] - here[0], body.p[1] - here[1], body.p[2] - here[2]];
          // The model's own figure at a pass it names; elsewhere the ship's uncertainty along the
          // line of sight with the body's own (the two taken as independent), which is the
          // reading the forecast's covariances support between its named passes.
          const pass = forecast.closestApproaches.find(
            (c) => c.id === b.id && Math.abs(c.t - s.t) < 1e-6,
          );
          const along = sigmaAlong(cov, line);
          const own = body.cov ? sigmaAlong(body.cov, line) : 0;
          return {
            id: b.id,
            name: b.name,
            clearance: Math.hypot(line[0], line[1], line[2]) - b.radius,
            sigma: pass ? pass.sigma : Math.hypot(along, own),
          };
        }),
        ...(part ? { sigma: part } : {}),
        extrapolating: s.extrapolating,
        validated: s.validated === true,
      };
    },
  };
}

/** A forecast's time as the console writes it. */
export const forecastClock = (t: number): string => `T+${clock(t)}`;
