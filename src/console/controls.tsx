/**
 * Small controls the console needs that the theme's primitives do not have yet: an action
 * button, labelled number and choice fields, a row of label and value, and the time controls.
 * Built on theme tokens (console.css); listed in docs/handoffs/2D.md for the UI lane to adopt.
 */
import type { ReactNode } from 'react';
import type { GameControls } from '../game/belief/controls.ts';
import type { Status, Tone } from '../theme/components/index.ts';
import { clock } from './format.ts';

export interface ButtonProps {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  /** The one thing this panel is for. */
  readonly primary?: boolean;
  readonly tone?: Tone;
  readonly status?: Status;
  readonly title?: string;
}

export function Button({ children, onClick, disabled, primary, tone, status, title }: ButtonProps) {
  return (
    <button
      type="button"
      className="cs-button"
      data-primary={primary ? '' : undefined}
      data-tone={tone}
      data-status={status}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly unit?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
}

export function NumberField({ label, value, onChange, unit, min, max, step, disabled }: NumberFieldProps) {
  return (
    <label className="cs-field">
      <span className="cs-field__label">{label}</span>
      <input
        className="cs-field__input"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {unit ? <span className="cs-field__unit">{unit}</span> : null}
    </label>
  );
}

export interface SelectFieldProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
}

export function SelectField({ label, value, options, onChange, disabled }: SelectFieldProps) {
  return (
    <label className="cs-field">
      <span className="cs-field__label">{label}</span>
      <select
        className="cs-field__input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One line: a label on the left, a value on the right. */
export function Line({
  label,
  children,
  status,
  tone,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly status?: Status;
  readonly tone?: Tone;
}) {
  return (
    <div className="cs-line" data-status={status} data-tone={tone}>
      <span className="cs-line__label">{label}</span>
      <span className="cs-line__value">{children}</span>
    </div>
  );
}

/** A caption between groups inside a panel. */
export function Caption({ children }: { readonly children: ReactNode }) {
  return <p className="cs-caption">{children}</p>;
}

/** Buttons in a row. */
export function Actions({ children }: { readonly children: ReactNode }) {
  return <div className="cs-actions">{children}</div>;
}

/**
 * Time. It runs while the player is in the room (A8); HOLD stops it, the warp steps compress it.
 * Warp never changes the simulation's step.
 */
export function TimeControls({ game, compact }: { readonly game: GameControls; readonly compact?: boolean }) {
  const status = game.status();
  const ended = status.phase === 'ended';
  return (
    <div className="cs-time" data-compact={compact ? '' : undefined}>
      <span className="cs-time__met">T+{clock(status.t)}</span>
      <button
        type="button"
        className="rx-chip"
        data-on={status.paused ? '' : undefined}
        disabled={ended}
        onClick={() => game.setPaused(!status.paused)}
      >
        {status.paused ? 'HELD' : 'HOLD'}
      </button>
      {status.warpSteps.map((step) => (
        <button
          key={step}
          type="button"
          className="rx-chip"
          data-on={!status.paused && step === status.warp ? '' : undefined}
          disabled={ended}
          onClick={() => {
            game.setWarp(step);
            game.setPaused(false);
          }}
        >
          {step}×
        </button>
      ))}
      {status.saturated ? <span className="cs-time__note">▲ limited</span> : null}
    </div>
  );
}
