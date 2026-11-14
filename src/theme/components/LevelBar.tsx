import type { ReactElement } from 'react';
import { fraction, percent, STATUS_GLYPH } from './scale.ts';
import type { LimitKind, Status, Tone } from './scale.ts';

/** A mark across the bar at a value: a limit, an alert threshold or a target. */
export interface LevelMark {
  /** In the same units as `value`. */
  readonly at: number;
  readonly kind?: LimitKind;
  /** Read out by assistive technology and shown as a tooltip. */
  readonly label?: string;
}

export interface LevelBarProps {
  readonly label: string;
  /** The reading, and the scale it is read against (default 0 to 1). */
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  /** Text at the right, e.g. `'1,443 / 6,000 W'`. Defaults to a percentage. */
  readonly text?: string;
  readonly marks?: readonly LevelMark[];
  /** Where the model expects the level to be, in value units. Drawn as a teal tick. */
  readonly forecast?: number;
  readonly status?: Status;
  readonly tone?: Tone;
}

/**
 * A level as a bar with its limits marked on it. One row: label, bar, value.
 * An alert state changes the colour and adds its shape (▲ ■) beside the value.
 */
export function LevelBar({
  label,
  value,
  min = 0,
  max = 1,
  text,
  marks = [],
  forecast,
  status = 'nominal',
  tone = 'measured',
}: LevelBarProps): ReactElement {
  const f = fraction(value, min, max);
  const shown = text ?? `${Math.round(f * 100)} %`;
  const glyph = STATUS_GLYPH[status];
  return (
    <div
      className="rx-level"
      data-status={status}
      data-tone={tone}
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Number.isFinite(value) ? value : undefined}
      aria-valuetext={status === 'nominal' ? shown : `${shown}, ${status}`}
    >
      <span className="rx-level__label">{label}</span>
      <span className="rx-level__track">
        <span className="rx-level__fill" style={{ width: percent(f) }} />
        {forecast !== undefined && (
          <span
            className="rx-level__forecast"
            style={{ left: percent(fraction(forecast, min, max)) }}
            title="forecast"
          />
        )}
        {marks.map((m) => (
          <span
            key={`${m.kind ?? 'limit'}-${m.at}`}
            className="rx-level__mark"
            data-kind={m.kind ?? 'limit'}
            style={{ left: percent(fraction(m.at, min, max)) }}
            title={m.label}
          />
        ))}
      </span>
      <span className="rx-level__value">
        {glyph && (
          <span className="rx-glyph" aria-hidden="true">
            {glyph}
          </span>
        )}
        {shown}
      </span>
    </div>
  );
}
