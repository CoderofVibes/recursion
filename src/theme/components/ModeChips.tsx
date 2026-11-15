import type { KeyboardEvent, ReactElement } from 'react';
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

const NEXT: Readonly<Record<string, 1 | -1 | 'first' | 'last'>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: 'first',
  End: 'last',
};

/**
 * One choice from a short list: an equipment mode, a configuration, a scan power level.
 * The mode in force is lit; the others are quiet. Behaves as a radio group: one Tab stop (the
 * mode in force), arrows and Home/End to choose another. Without `onChange` the modes are shown
 * as text, with no stop at all.
 */
export function ModeChips({
  label,
  options,
  value,
  onChange,
  status = 'nominal',
  tone = 'measured',
}: ModeChipsProps): ReactElement {
  const opts: ModeOption[] = options.map((o) => (typeof o === 'string' ? { value: o } : o));
  const enabled = opts.filter((o) => o.disabled !== true);
  // The one Tab stop: the mode in force if it can be chosen, else the first that can.
  const stop = enabled.find((o) => o.value === value) ?? enabled[0];
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = NEXT[e.key];
    if (!onChange || step === undefined || enabled.length === 0) return;
    e.preventDefault();
    const at = Math.max(
      0,
      enabled.findIndex((o) => o.value === value),
    );
    const to =
      step === 'first'
        ? 0
        : step === 'last'
          ? enabled.length - 1
          : (at + step + enabled.length) % enabled.length;
    const next = enabled[to]!;
    if (next.value !== value) onChange(next.value);
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus();
  };
  return (
    <div
      className="rx-chips"
      role="radiogroup"
      aria-label={label}
      aria-readonly={onChange === undefined ? true : undefined}
      data-status={status}
      data-tone={tone}
      onKeyDown={onKeyDown}
    >
      {opts.map((opt) => {
        const on = opt.value === value;
        if (onChange === undefined)
          return (
            <span
              key={opt.value}
              role="radio"
              className="rx-chip"
              aria-checked={on}
              aria-disabled={!on || undefined}
              data-on={on ? 'true' : undefined}
              data-readonly=""
            >
              {opt.label ?? opt.value}
            </span>
          );
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            className="rx-chip"
            aria-checked={on}
            data-on={on ? 'true' : undefined}
            data-value={opt.value}
            tabIndex={opt === stop ? 0 : -1}
            disabled={opt.disabled === true}
            onClick={!on ? () => onChange(opt.value) : undefined}
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
