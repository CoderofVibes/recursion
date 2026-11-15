/**
 * The trajectory chart: the region seen chart-up, with what the model says will happen (the
 * forecast, dotted, with its 2σ envelope, hatched where the model has no data) against what did
 * happen (the measured trail, solid). Range bands around a body show where its pull has been
 * measured and where an adopted rule has been tested, so the forecast can be read against the
 * evidence it stands on. A cursor walks the forecast step by step.
 *
 * It takes plain numbers in chart metres (`chartMath.ts`); the console decides what to show.
 * Display semantics follow P10: the forecast is frozen and dotted, the trail solid.
 */
import { useId } from 'react';
import { boundsAbout, boundsOf, envelopeRuns, scaleLength } from './chartMath.ts';
import type { Bounds, P2, PathPoint } from './chartMath.ts';

export interface ChartBody {
  readonly id: string;
  readonly name: string;
  /** Where it is drawn (at the cursor's time), chart metres. */
  readonly x: number;
  readonly y: number;
  /** Collision radius, m. */
  readonly radius: number;
  /** Its forecast path, if it moves. */
  readonly track?: readonly P2[];
}

/**
 * Where an objective is: a region to reach, or the gate a departure must pass (a distance from
 * the bodies' centre of mass). Drawn as the theme draws a target: a dashed ring in ink.
 */
export interface ChartRegion {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly kind: 'reach' | 'gate';
}

/** A band of distances around a body: where its pull was measured, or a rule was tested. */
export interface ChartBand {
  readonly body: string;
  readonly rMin: number;
  readonly rMax: number;
  readonly kind: 'measured' | 'validated';
}

export interface ChartMark {
  readonly x: number;
  readonly y: number;
  readonly kind: 'burn' | 'closest' | 'ends' | 'now' | 'left';
  readonly label: string;
}

export interface ChartCursor {
  readonly x: number;
  readonly y: number;
  /** Heading in the chart plane, radians (0 along +x, counter-clockwise). */
  readonly heading: number;
  /** One-sigma ellipse there, metres and radians. */
  readonly ellipse?: { readonly a: number; readonly b: number; readonly angle: number };
  readonly label?: string;
}

export interface TrajectoryChartProps {
  readonly label: string;
  readonly bodies: readonly ChartBody[];
  readonly bands?: readonly ChartBand[];
  /** Where the objectives are. Drawn, and held in view only when `fit` names them. */
  readonly regions?: readonly ChartRegion[];
  /** Small catalogued objects (rocks), as dots where the ship believes they are. */
  readonly rocks?: readonly P2[];
  /** The forecast being read: dotted, with its envelope. */
  readonly forecast?: readonly PathPoint[];
  /** An earlier forecast of the same plan, for comparison: its centre line only. */
  readonly earlier?: readonly PathPoint[];
  /** The measured path of the attempt. */
  readonly trail?: readonly P2[];
  /** An earlier attempt's measured path, kept by Black Box. */
  readonly previousTrail?: readonly P2[];
  /**
   * Indices into `trail` where a new stroke starts: a stretch with nothing measured is left
   * undrawn (missing, not joined up).
   */
  readonly trailBreaks?: readonly number[];
  /** The same for `previousTrail`. */
  readonly previousBreaks?: readonly number[];
  readonly marks?: readonly ChartMark[];
  readonly cursor?: ChartCursor;
  /** Half-width of the view about the cursor, m. Absent: the whole picture is fitted. */
  readonly follow?: number;
  /** Points the view must hold, instead of everything drawn (the plan, not the whole region). */
  readonly fit?: readonly P2[];
  /** Sigmas drawn either side of the forecast. */
  readonly sigmas?: number;
  /** Choose a moment by pointing at the forecast: the chart reports the nearest sample's time. */
  readonly onPick?: (t: number) => void;
  /** Drawing size in SVG units; the chart scales to its container. */
  readonly width?: number;
  readonly height?: number;
}

const kilometres = (m: number): string =>
  m < 1000
    ? `${Math.round(m)} m`
    : `${(m / 1000).toLocaleString('en-US', { maximumFractionDigits: m < 10_000 ? 1 : 0 })} km`;

/**
 * Where on a chart's edge to point at something outside it: on the line from the chart's middle
 * to where the thing would be drawn, a margin inside the edge, with the way it points. Null for
 * something the chart holds.
 */
export function edgePointer(
  px: number,
  py: number,
  width: number,
  height: number,
  margin = 22,
): { x: number; y: number; angle: number } | null {
  if (px >= 0 && px <= width && py >= 0 && py <= height) return null;
  const dx = px - width / 2;
  const dy = py - height / 2;
  const k = Math.min(
    dx === 0 ? Infinity : (width / 2 - margin) / Math.abs(dx),
    dy === 0 ? Infinity : (height / 2 - margin) / Math.abs(dy),
  );
  return { x: width / 2 + dx * k, y: height / 2 + dy * k, angle: Math.atan2(dy, dx) };
}

export function TrajectoryChart({
  label,
  bodies,
  bands = [],
  regions = [],
  rocks = [],
  forecast = [],
  earlier = [],
  trail = [],
  previousTrail = [],
  trailBreaks = [],
  previousBreaks = [],
  marks = [],
  cursor,
  follow,
  fit,
  sigmas = 2,
  onPick,
  width = 640,
  height = 400,
}: TrajectoryChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const everything: P2[] = [
    ...bodies.map((b): P2 => [b.x, b.y]),
    ...forecast.map((p): P2 => [p.x, p.y]),
    ...earlier.map((p): P2 => [p.x, p.y]),
    ...trail,
    ...previousTrail,
    ...rocks,
  ];
  const box: Bounds =
    follow !== undefined && cursor
      ? boundsAbout(cursor.x, cursor.y, follow)
      : boundsOf(fit && fit.length ? fit : everything, 0.1);
  // One scale for both axes (a chart, not a graph); north up.
  const scale = Math.min(width / (box.x1 - box.x0), height / (box.y1 - box.y0));
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const sx = (x: number): number => width / 2 + (x - cx) * scale;
  const sy = (y: number): number => height / 2 - (y - cy) * scale;
  const line = (points: readonly P2[], breaks?: ReadonlySet<number>): string =>
    points
      .map(
        ([x, y], i) => `${i && !breaks?.has(i) ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`,
      )
      .join('');
  const closed = (points: readonly P2[]): string => (points.length ? `${line(points)}Z` : '');
  const path = (points: readonly PathPoint[]): string => line(points.map((p): P2 => [p.x, p.y]));

  const runs = envelopeRuns(forecast, sigmas);
  const bar = scaleLength((box.x1 - box.x0) * 0.9);
  const bodyOf = (id: string): ChartBody | undefined => bodies.find((b) => b.id === id);

  const pick = onPick
    ? (event: React.PointerEvent<SVGSVGElement>): void => {
        const rect = event.currentTarget.getBoundingClientRect();
        const px = ((event.clientX - rect.left) / rect.width) * width;
        const py = ((event.clientY - rect.top) / rect.height) * height;
        let best: PathPoint | undefined;
        let bestD = Infinity;
        for (const p of forecast) {
          const d = Math.hypot(sx(p.x) - px, sy(p.y) - py);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        if (best) onPick(best.t);
      }
    : undefined;

  return (
    <svg
      className="ci-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
      {...(pick ? { onPointerDown: pick, 'data-pick': '' } : {})}
    >
      <defs>
        {/* Hatch: where the model has no data (the theme's sign for the unknown). */}
        <pattern
          id={`${uid}-hatch`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" className="ci-chart__hatch" />
        </pattern>
        <clipPath id={`${uid}-clip`}>
          <rect x="0" y="0" width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}-clip)`}>
        {/* Evidence: distances from each body where the pull is measured, or a rule tested. */}
        {bands.map((band, i) => {
          const b = bodyOf(band.body);
          if (!b) return null;
          const ring = (r: number): string => {
            const R = r * scale;
            const x = sx(b.x);
            const y = sy(b.y);
            return `M${x - R} ${y}A${R} ${R} 0 1 0 ${x + R} ${y}A${R} ${R} 0 1 0 ${x - R} ${y}Z`;
          };
          return (
            <path
              key={`${band.body}-${band.kind}-${i}`}
              className="ci-chart__band"
              data-kind={band.kind}
              fillRule="evenodd"
              d={`${ring(band.rMax)}${ring(band.rMin)}`}
            />
          );
        })}
        {/* The objective: where to get to, or the distance to get beyond. */}
        {regions.map((r) => (
          <g key={r.id} className="ci-chart__region" data-kind={r.kind}>
            <circle cx={sx(r.x)} cy={sy(r.y)} r={Math.max(4, r.radius * scale)} />
            <text x={sx(r.x)} y={sy(r.y) - Math.max(4, r.radius * scale) - 5} textAnchor="middle">
              {r.name}
            </text>
          </g>
        ))}
        {bodies.map((b) =>
          b.track && b.track.length > 1 ? (
            <path key={`${b.id}-track`} className="ci-chart__track" d={line(b.track)} />
          ) : null,
        )}
        {rocks.length ? (
          <path
            className="ci-chart__rocks"
            d={rocks.map(([x, y]) => `M${sx(x).toFixed(1)} ${sy(y).toFixed(1)}h0.01`).join('')}
          />
        ) : null}

        {previousTrail.length > 1 ? (
          <path
            className="ci-chart__trail"
            data-previous=""
            d={line(previousTrail, new Set(previousBreaks))}
          />
        ) : null}
        {earlier.length > 1 ? <path className="ci-chart__earlier" d={path(earlier)} /> : null}

        {/* The envelope: 2σ either side; hatched where the model is beyond its data. */}
        {runs.map((run, i) => (
          <g key={i}>
            <path className="ci-chart__envelope" data-kind={run.kind} d={closed(run.outline)} />
            {run.kind === 'extrapolating' ? (
              <path
                className="ci-chart__envelope-hatch"
                fill={`url(#${uid}-hatch)`}
                d={closed(run.outline)}
              />
            ) : null}
          </g>
        ))}
        {forecast.length > 1 ? <path className="ci-chart__forecast" d={path(forecast)} /> : null}
        {trail.length > 1 ? (
          <path className="ci-chart__trail" d={line(trail, new Set(trailBreaks))} />
        ) : null}

        {bodies.map((b) => (
          <g key={b.id}>
            <circle
              className="ci-chart__body"
              cx={sx(b.x)}
              cy={sy(b.y)}
              r={Math.max(3, b.radius * scale)}
            />
            <text
              className="ci-chart__name"
              x={sx(b.x)}
              y={sy(b.y) - Math.max(3, b.radius * scale) - 5}
              textAnchor="middle"
            >
              {b.name}
            </text>
          </g>
        ))}

        {marks.map((m, i) => (
          <g key={i} className="ci-chart__mark" data-kind={m.kind}>
            {m.kind === 'burn' ? (
              <path
                d={`M${sx(m.x) - 5} ${sy(m.y) + 4}L${sx(m.x)} ${sy(m.y) - 5}L${sx(m.x) + 5} ${sy(m.y) + 4}Z`}
              />
            ) : m.kind === 'ends' ? (
              <path
                d={`M${sx(m.x) - 6} ${sy(m.y) - 6}L${sx(m.x) + 6} ${sy(m.y) + 6}M${sx(m.x) + 6} ${sy(m.y) - 6}L${sx(m.x) - 6} ${sy(m.y) + 6}`}
              />
            ) : (
              <circle cx={sx(m.x)} cy={sy(m.y)} r="3.5" />
            )}
            {/* Beside its mark, on the side with room; where the flight left the forecast, and
                where it has got to, are set above, clear of the forecast's own end. */}
            <text
              x={sx(m.x) + (sx(m.x) > width * 0.7 ? -9 : 9)}
              y={sy(m.y) + (m.kind === 'left' || m.kind === 'now' ? -8 : 3)}
              textAnchor={sx(m.x) > width * 0.7 ? 'end' : 'start'}
            >
              {m.label}
            </text>
          </g>
        ))}

        {cursor ? (
          <g className="ci-chart__cursor">
            {cursor.ellipse ? (
              <ellipse
                cx={sx(cursor.x)}
                cy={sy(cursor.y)}
                rx={Math.max(2, cursor.ellipse.a * sigmas * scale)}
                ry={Math.max(2, cursor.ellipse.b * sigmas * scale)}
                transform={`rotate(${(-cursor.ellipse.angle * 180) / Math.PI} ${sx(cursor.x)} ${sy(cursor.y)})`}
              />
            ) : null}
            {/* The ship: a dart along its heading. */}
            <path
              className="ci-chart__ship"
              transform={`translate(${sx(cursor.x)} ${sy(cursor.y)}) rotate(${(-cursor.heading * 180) / Math.PI})`}
              d="M9 0L-6 5L-3 0L-6 -5Z"
            />
            {cursor.label ? (
              <text x={sx(cursor.x) + 12} y={sy(cursor.y) - 10}>
                {cursor.label}
              </text>
            ) : null}
          </g>
        ) : null}
      </g>

      {/* A place to reach that lies off the chart: which way, and how far from the ship (or,
          with no ship drawn, from the chart's middle) to its edge. */}
      {regions.map((r) => {
        if (r.kind !== 'reach') return null;
        const at = edgePointer(sx(r.x), sy(r.y), width, height);
        if (!at) return null;
        const from = cursor ?? { x: cx, y: cy };
        const away = Math.max(0, Math.hypot(r.x - from.x, r.y - from.y) - r.radius);
        const right = at.x > width / 2;
        return (
          <g key={`${r.id}-pointer`} className="ci-chart__pointer">
            <path
              transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${((at.angle * 180) / Math.PI).toFixed(1)})`}
              d="M9 0L-5 6L-5 -6Z"
            />
            <text
              x={at.x + (right ? -12 : 12)}
              y={at.y + (at.y > height / 2 ? -10 : 16)}
              textAnchor={right ? 'end' : 'start'}
            >
              {r.name} · {kilometres(away)}
            </text>
          </g>
        );
      })}

      {/* Scale. */}
      <g className="ci-chart__scale">
        <path d={`M12 ${height - 12}h${bar * scale}m0 -4v8m${-bar * scale} -8v8`} />
        <text x={12} y={height - 20}>
          {kilometres(bar)}
        </text>
      </g>
    </svg>
  );
}
