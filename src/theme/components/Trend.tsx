import type { ReactElement } from 'react';
import { trendGrid } from '../instrument.ts';
import { bandPath, extent, fraction, STATUS_GLYPH, tracePath } from './scale.ts';
import type { LimitKind, Status, Tone } from './scale.ts';

export interface TrendLimit {
  /** In the same units as the data. */
  readonly at: number;
  readonly kind?: LimitKind;
}

export interface TrendProps {
  readonly title: string;
  readonly unit?: string;
  /** The latest reading as text, shown beside the title. */
  readonly value?: string;
  /** Measured samples, oldest first, evenly spaced in time. */
  readonly data: readonly number[];
  /** What the model expects next, continuing from the last measured sample. Drawn dotted. */
  readonly forecast?: readonly number[];
  /** Half-width of the forecast's envelope at each forecast sample (2σ), in data units. */
  readonly forecastBand?: readonly number[];
  /** The same quantity from an earlier attempt (Black Box), aligned to `data`. */
  readonly previous?: readonly number[];
  readonly limits?: readonly TrendLimit[];
  /** Fix the vertical scale; otherwise it fits everything drawn. */
  readonly min?: number;
  readonly max?: number;
  readonly status?: Status;
  readonly tone?: Tone;
}

/**
 * A quantity over time. Measured data is a solid trace; a forecast continues it as a dotted
 * teal line inside its envelope, after a rule marking now; an earlier attempt is a thin orange
 * trace; limits are dashed rules. Follows the display semantics of DECISIONS P10.
 */
export function Trend({
  title,
  unit,
  value,
  data,
  forecast,
  forecastBand,
  previous,
  limits = [],
  min,
  max,
  status = 'nominal',
  tone = 'measured',
}: TrendProps): ReactElement {
  const fc = forecast && forecast.length > 0 ? forecast : undefined;
  const last = data[data.length - 1];
  // The forecast starts at the last measured sample so the two lines meet at now.
  const fcLine = fc && last !== undefined ? [last, ...fc] : fc;
  const fcHalf = fc && forecastBand ? [0, ...forecastBand] : undefined;
  const upper = fcLine && fcHalf ? fcLine.map((v, i) => v + (fcHalf[i] ?? 0)) : [];
  const lower = fcLine && fcHalf ? fcLine.map((v, i) => v - (fcHalf[i] ?? 0)) : [];
  const [autoLo, autoHi] = extent([
    data,
    fcLine ?? [],
    upper,
    lower,
    previous ?? [],
    limits.map((l) => l.at),
  ]);
  const lo = min ?? autoLo;
  const hi = max ?? autoHi;
  // Measured data and forecast share the time axis; `now` is where one hands over to the other.
  const steps = Math.max(1, data.length - 1) + (fc ? fc.length : 0);
  const now = fc ? (Math.max(1, data.length - 1) / steps) * 100 : 100;
  const glyph = STATUS_GLYPH[status];
  const summary = `${title}${value ? ` ${value}${unit ? ` ${unit}` : ''}` : ''}${
    status === 'nominal' ? '' : `, ${status}`
  }${fc ? ', with forecast' : ''}`;

  const grid: ReactElement[] = [];
  for (let i = 1; i < trendGrid.cols; i++) {
    const x = (100 * i) / trendGrid.cols;
    grid.push(<line key={`c${i}`} x1={x} y1={0} x2={x} y2={100} />);
  }
  for (let i = 1; i < trendGrid.rows; i++) {
    const y = (100 * i) / trendGrid.rows;
    grid.push(<line key={`r${i}`} x1={0} y1={y} x2={100} y2={y} />);
  }

  return (
    <figure className="rx-trend" data-status={status} data-tone={tone}>
      <figcaption className="rx-trend__head">
        <span className="rx-trend__title">{title}</span>
        {value !== undefined && (
          <span className="rx-trend__value">
            {glyph && (
              <span className="rx-glyph" aria-hidden="true">
                {glyph}
              </span>
            )}
            {value}
            {unit && <span className="rx-trend__unit">{unit}</span>}
          </span>
        )}
      </figcaption>
      <svg
        className="rx-trend__plot"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
      >
        <g className="rx-trend__grid">{grid}</g>
        {limits.map((l) => {
          const y = 100 - fraction(l.at, lo, hi) * 100;
          return (
            <line
              key={`${l.kind ?? 'limit'}-${l.at}`}
              className="rx-trend__limit"
              data-kind={l.kind ?? 'limit'}
              x1={0}
              y1={y}
              x2={100}
              y2={y}
            />
          );
        })}
        {previous && (
          <path className="rx-trend__previous" d={tracePath(previous, lo, hi, 0, now)} />
        )}
        {fcLine && fcHalf && (
          <path className="rx-trend__band" d={bandPath(fcLine, fcHalf, lo, hi, now, 100)} />
        )}
        {fcLine && <line className="rx-trend__now" x1={now} y1={0} x2={now} y2={100} />}
        <path className="rx-trend__data" d={tracePath(data, lo, hi, 0, now)} />
        {fcLine && <path className="rx-trend__forecast" d={tracePath(fcLine, lo, hi, now, 100)} />}
      </svg>
    </figure>
  );
}
