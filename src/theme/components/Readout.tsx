import type { ReactElement, ReactNode } from 'react';
import { STATUS_GLYPH } from './scale.ts';
import type { Status, Tone } from './scale.ts';

export interface ReadoutProps {
  readonly label: string;
  /** Already formatted; a number is shown as given. */
  readonly value: string | number;
  readonly unit?: string;
  /** One-sigma uncertainty, already formatted. Shown as `± …`. */
  readonly sigma?: string;
  /** `value` for a detail block, `readout` for a primary number, `display` for one per screen. */
  readonly size?: 'body' | 'value' | 'readout' | 'display';
  readonly status?: Status;
  readonly tone?: Tone;
}

/** A label over its value: the pair every panel is made of. */
export function Readout({
  label,
  value,
  unit,
  sigma,
  size = 'value',
  status = 'nominal',
  tone = 'measured',
}: ReadoutProps): ReactElement {
  const glyph = STATUS_GLYPH[status];
  return (
    <div className="rx-readout" data-size={size} data-status={status} data-tone={tone}>
      <span className="rx-readout__label">{label}</span>
      <span className="rx-readout__value">
        {glyph && (
          <span className="rx-glyph" aria-hidden="true">
            {glyph}
          </span>
        )}
        {value}
        {unit && <span className="rx-readout__unit">{unit}</span>}
        {sigma && <span className="rx-readout__sigma">± {sigma}</span>}
      </span>
    </div>
  );
}

export interface ReadoutGridProps {
  /** Readouts per row (default 2). */
  readonly columns?: number;
  readonly children: ReactNode;
}

/** Readouts laid out in even columns. */
export function ReadoutGrid({ columns = 2, children }: ReadoutGridProps): ReactElement {
  return (
    <div
      className="rx-readouts"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
