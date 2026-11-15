/**
 * Measured strength of a body's pull against distance (1G spec §9.2): one point per window of
 * coasting data, at the distance it was measured, as a multiple of what the model's law says
 * there. The rule at 1 is the model's law: points on it mean the law holds at that distance;
 * a slope means it does not. Points from a tracked rock are hollow. Where there is no data
 * there are no points. Validated spans of adopted rules, and the distances the flight will
 * visit, are drawn along the bottom.
 *
 * A local primitive on theme tokens (console.css); listed in docs/handoffs/2D.md.
 */
import { extent } from '../theme/components/index.ts';
import { whole } from './format.ts';

export interface StrengthDot {
  /** Distance from the body's centre, m. */
  readonly distance: number;
  /** Measured gravity relative to the model's law, and its one sigma. */
  readonly scale: number;
  readonly sigma: number;
  /** Measured by tracking a rock rather than from the ship's own path. */
  readonly probe: boolean;
  /** From the attempt in progress or the one selected. */
  readonly current: boolean;
}

export interface StrengthPlotProps {
  readonly label: string;
  readonly points: readonly StrengthDot[];
  /** Distance spans where an adopted rule has passed a held-out test (A5). */
  readonly validated?: readonly { readonly rMin: number; readonly rMax: number }[];
  /** Distances the forecast flight visits: [nearest, farthest]. */
  readonly visits?: readonly [number, number];
  /**
   * The slope of strength against distance the model's report gives (d ln strength / d ln
   * distance): drawn as the trend through the points, so a law that does not hold shows as a
   * line leaving ×1.
   */
  readonly slope?: number;
}

/**
 * The trend of measured strength against distance: a power of distance with the reported slope,
 * through the points' weighted centre (in logs, weighted by 1/σ²). Undefined with no points.
 */
export function strengthTrend(
  points: readonly Pick<StrengthDot, 'distance' | 'scale' | 'sigma'>[],
  slope: number,
): ((distance: number) => number) | undefined {
  let w = 0;
  let lnD = 0;
  let lnS = 0;
  for (const p of points) {
    if (!(p.scale > 0) || !(p.distance > 0)) continue;
    const weight = 1 / Math.max(1e-12, (p.sigma / p.scale) ** 2);
    w += weight;
    lnD += weight * Math.log(p.distance);
    lnS += weight * Math.log(p.scale);
  }
  if (!(w > 0)) return undefined;
  const d0 = lnD / w;
  const s0 = lnS / w;
  return (distance) => Math.exp(s0 + slope * (Math.log(distance) - d0));
}

const W = 320;
const H = 150;
const PAD = { l: 34, r: 8, t: 8, b: 26 };

export function StrengthPlot({ label, points, validated = [], visits, slope }: StrengthPlotProps) {
  const distances = [
    ...points.map((p) => p.distance),
    ...validated.flatMap((v) => [v.rMin, v.rMax]),
    ...(visits ?? []),
  ];
  if (distances.length === 0)
    return (
      <div className="cs-plot" role="img" aria-label={`${label}: no measurements yet`}>
        <p className="cs-note">no coasting fixes yet: nothing measured, nothing drawn</p>
      </div>
    );
  const [d0, d1] = extent([distances], 0.06);
  const scales = points.flatMap((p) => [p.scale - p.sigma, p.scale + p.sigma]);
  const [s0, s1] = extent([[...scales, 0.8, 1.2]], 0.08);
  // Distance on a log axis: the law is a power of distance, so it plots as a straight line.
  const lx = (d: number): number =>
    PAD.l +
    ((Math.log(d) - Math.log(d0)) / Math.max(1e-9, Math.log(d1) - Math.log(d0))) *
      (W - PAD.l - PAD.r);
  const ly = (s: number): number =>
    PAD.t + (1 - (s - s0) / Math.max(1e-9, s1 - s0)) * (H - PAD.t - PAD.b);
  const ticks = [d0, Math.sqrt(d0 * d1), d1];
  // The trend, across the distances that were measured (it says nothing beyond them).
  const trend = slope !== undefined && points.length > 1 ? strengthTrend(points, slope) : undefined;
  const reach = points.map((p) => p.distance);
  const from = Math.min(...reach);
  const to = Math.max(...reach);
  const trendPath =
    trend && to > from
      ? Array.from({ length: 25 }, (_, i) => {
          const d = Math.exp(Math.log(from) + (i / 24) * (Math.log(to) - Math.log(from)));
          const s = Math.min(s1, Math.max(s0, trend(d)));
          return `${i ? 'L' : 'M'}${lx(d).toFixed(1)} ${ly(s).toFixed(1)}`;
        }).join('')
      : undefined;
  const bandY = H - PAD.b + 5;

  return (
    <svg className="cs-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line className="cs-plot__axis" x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} />
      <line className="cs-plot__axis" x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} />
      {/* The model's law. */}
      <line className="cs-plot__law" x1={PAD.l} y1={ly(1)} x2={W - PAD.r} y2={ly(1)} />
      <text className="cs-plot__tick" x={PAD.l - 4} y={ly(1) + 3} textAnchor="end">
        ×1
      </text>
      <text className="cs-plot__tick" x={PAD.l - 4} y={ly(s1) + 8} textAnchor="end">
        ×{s1.toFixed(2)}
      </text>
      <text className="cs-plot__tick" x={PAD.l - 4} y={ly(s0)} textAnchor="end">
        ×{s0.toFixed(2)}
      </text>
      {ticks.map((d, i) => (
        <text
          key={d}
          className="cs-plot__tick"
          x={lx(d)}
          y={H - 2}
          textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
        >
          {whole(d / 1000)} km
        </text>
      ))}
      {trendPath ? <path className="cs-plot__trend" d={trendPath} /> : null}
      {validated.map((v, i) => (
        <line
          key={`v${i}`}
          className="cs-plot__validated"
          x1={lx(Math.max(v.rMin, d0))}
          x2={lx(Math.min(v.rMax, d1))}
          y1={bandY}
          y2={bandY}
        />
      ))}
      {visits ? (
        <line
          className="cs-plot__visits"
          x1={lx(Math.max(visits[0], d0))}
          x2={lx(Math.min(visits[1], d1))}
          y1={bandY + 5}
          y2={bandY + 5}
        />
      ) : null}
      {points.map((p, i) => (
        <g key={i} className="cs-plot__point" data-current={p.current ? '' : undefined}>
          <line
            x1={lx(p.distance)}
            x2={lx(p.distance)}
            y1={ly(p.scale - p.sigma)}
            y2={ly(p.scale + p.sigma)}
          />
          <circle
            cx={lx(p.distance)}
            cy={ly(p.scale)}
            r={2.6}
            data-probe={p.probe ? '' : undefined}
          />
        </g>
      ))}
    </svg>
  );
}
