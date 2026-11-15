import type { ReactElement } from 'react';
import { gaugeArc } from '../instrument.ts';
import type { LevelMark } from './LevelBar.tsx';
import { arcPath, arcPoint, fraction, STATUS_GLYPH } from './scale.ts';
import type { Status, Tone } from './scale.ts';

export interface GaugeProps {
  readonly label: string;
  /** The reading, and the scale it is read against (default 0 to 1). */
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  /** The number in the middle, already formatted. Defaults to a percentage. */
  readonly text?: string;
  readonly unit?: string;
  /** Limits and thresholds on the dial, in value units. */
  readonly marks?: readonly LevelMark[];
  /** Where the model expects the reading to be, in value units. Drawn as a teal tick. */
  readonly forecast?: number;
  readonly status?: Status;
  readonly tone?: Tone;
}

/**
 * A dial: one important quantity that should be readable at a glance from across the room.
 * Use a LevelBar where several levels are compared in a list.
 */
export function Gauge({
  label,
  value,
  min = 0,
  max = 1,
  text,
  unit,
  marks = [],
  forecast,
  status = 'nominal',
  tone = 'measured',
}: GaugeProps): ReactElement {
  const { sweep, radius, tick } = gaugeArc;
  const f = fraction(value, min, max);
  const shown = text ?? `${Math.round(f * 100)}`;
  const shownUnit = unit ?? (text === undefined ? '%' : undefined);
  const glyph = STATUS_GLYPH[status];
  const radial = (
    at: number,
    reach: number,
  ): { x1: number; y1: number; x2: number; y2: number } => {
    const g = fraction(at, min, max);
    const [x1, y1] = arcPoint(g, radius - reach, sweep);
    const [x2, y2] = arcPoint(g, radius + reach, sweep);
    return { x1, y1, x2, y2 };
  };
  const spoken = `${shown}${shownUnit ? ` ${shownUnit}` : ''}${status === 'nominal' ? '' : `, ${status}`}`;
  return (
    <div
      className="rx-gauge"
      data-status={status}
      data-tone={tone}
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Number.isFinite(value) ? value : undefined}
      aria-valuetext={spoken}
    >
      <div className="rx-gauge__dial">
        <svg className="rx-gauge__arc" viewBox="0 0 100 100" aria-hidden="true">
          <path className="rx-gauge__track" d={arcPath(0, 1, radius, sweep)} />
          {f > 0 && <path className="rx-gauge__fill" d={arcPath(0, f, radius, sweep)} />}
          {marks.map((m) => (
            <line
              key={`${m.kind ?? 'limit'}-${m.at}`}
              className="rx-gauge__mark"
              data-kind={m.kind ?? 'limit'}
              {...radial(m.at, tick)}
            />
          ))}
          {forecast !== undefined && (
            <line className="rx-gauge__forecast" {...radial(forecast, tick)} />
          )}
        </svg>
        <div className="rx-gauge__value">
          {glyph && (
            <span className="rx-glyph" aria-hidden="true">
              {glyph}
            </span>
          )}
          {shown}
          {shownUnit && <span className="rx-gauge__unit">{shownUnit}</span>}
        </div>
      </div>
      <span className="rx-gauge__label">{label}</span>
    </div>
  );
}
