import type { ReactElement } from 'react';
import type { Status, Tone } from './scale.ts';

export interface ModeOption {
  readonly value: string;
  /** Shown on the chip; defaults to the value. */
  readonly label?: string;
  /** A mode the equipment has but cannot enter right now. */
  readonly disabled?: boolean;
}

export interface ModeChipsProps {
  /** What is being chosen, for assistive technology. */
  readonly label: string;
  readonly options: readonly (string | ModeOption)[];
  /** The mode in force. */
  readonly value: string;
  /** Leave out to show the modes without letting them be changed. */
  readonly onChange?: (value: string) => void;
  readonly status?: Status;
  readonly tone?: Tone;
}

/**
 * One choice from a short list: an equipment mode, a configuration, a scan power level.
 * The mode in force is lit; the others are quiet. Behaves as a radio group.
 */
export function ModeChips({
  label,
  options,
  value,
  onChange,
  status = 'nominal',
  tone = 'measured',
}: ModeChipsProps): ReactElement {
  return (
    <div
      className="rx-chips"
      role="radiogroup"
      aria-label={label}
      data-status={status}
      data-tone={tone}
    >
      {options.map((o) => {
        const opt: ModeOption = typeof o === 'string' ? { value: o } : o;
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            className="rx-chip"
            aria-checked={on}
            data-on={on ? 'true' : undefined}
            disabled={opt.disabled === true || (onChange === undefined && !on)}
            onClick={onChange && !on ? () => onChange(opt.value) : undefined}
          >
            {opt.label ?? opt.value}
          </button>
        );
      })}
    </div>
  );
}

export interface ToggleProps {
  readonly label: string;
  readonly on: boolean;
  readonly onChange?: (on: boolean) => void;
  /** Words for the two states; default ON and OFF. */
  readonly onText?: string;
  readonly offText?: string;
  readonly status?: Status;
  readonly tone?: Tone;
}

/** One thing that is either on or off: a breaker, a layer, an overlay. Behaves as a switch. */
export function Toggle({
  label,
  on,
  onChange,
  onText = 'ON',
  offText = 'OFF',
  status = 'nominal',
  tone = 'measured',
}: ToggleProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      className="rx-toggle"
      aria-checked={on}
      data-on={on ? 'true' : undefined}
      data-status={status}
      data-tone={tone}
      disabled={onChange === undefined}
      onClick={onChange ? () => onChange(!on) : undefined}
    >
      <span className="rx-toggle__pip" aria-hidden="true" />
      <span className="rx-toggle__label">{label}</span>
      <span className="rx-toggle__state">{on ? onText : offText}</span>
    </button>
  );
}
