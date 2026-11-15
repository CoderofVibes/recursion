/**
 * Small controls the console needs that the theme's primitives do not have yet: an action
 * button, labelled number and choice fields, a row of label and value, and the time controls.
 * Built on theme tokens (console.css); listed in docs/handoffs/2D.md for the UI lane to adopt.
 */
import type { ReactNode } from 'react';
import type { Command, Forecast } from '../contracts/index.ts';
import type { GameControls, SessionStatus } from '../game/belief/controls.ts';
import type { Status, Tone } from '../theme/components/index.ts';
import { clock, name } from './format.ts';

export interface ButtonProps {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  /** The one thing this panel is for. */
  readonly primary?: boolean;
  readonly tone?: Tone;
  readonly status?: Status;
  readonly title?: string;
  /** A name for finding the button again (focus after an edit): rendered as data-mark. */
  readonly mark?: string;
}

export function Button({
  children,
  onClick,
  disabled,
  primary,
  tone,
  status,
  title,
  mark,
}: ButtonProps) {
  return (
    <button
      type="button"
      className="cs-button"
      data-mark={mark}
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

export function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step,
  disabled,
}: NumberFieldProps) {
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

/** Something ahead in ship time that the player may want to coast to. */
export interface TimeMarker {
  readonly label: string;
  readonly t: number;
}

const STEP_NAME: Readonly<Partial<Record<Command['kind'], string>>> = {
  burn: 'burn',
  cutoff: 'cutoff',
  attitude: 'turn',
  point: 'pointing',
  configure: 'reconfigure',
  recorder: 'recorder',
};

/**
 * The next thing ahead (S9 R3): the next command of the plan still scheduled, or else the
 * latest issued forecast's next closest approach, or its end. Only what is scheduled or was
 * forecast: nothing past the forecast's end is guessed.
 */
export function nextMarker(
  status: Pick<SessionStatus, 't' | 'planId'>,
  forecasts: readonly Forecast[],
): TimeMarker | null {
  const { t } = status;
  if (status.planId) {
    const plan = forecasts.findLast((f) => f.inputs.plan.id === status.planId)?.inputs.plan;
    const item = plan?.items.find((i) => plan.epoch + i.at > t);
    if (plan && item)
      return {
        label: `next ${STEP_NAME[item.command.kind] ?? 'command'}`,
        t: plan.epoch + item.at,
      };
  }
  const latest = forecasts.at(-1);
  if (!latest) return null;
  let ahead: Forecast['closestApproaches'][number] | undefined;
  for (const c of latest.closestApproaches) if (c.t > t && (!ahead || c.t < ahead.t)) ahead = c;
  if (ahead) return { label: `closest ${name(ahead.id)}`, t: ahead.t };
  const end = latest.samples.at(-1);
  return end && end.t > t ? { label: 'forecast ends', t: end.t } : null;
}

/** Wall time a span of ship time takes at a warp, nominally: 6:40, 1:02:05, 0.2 s. */
export function wallTime(shipSeconds: number, warp: number): string {
  const s = shipSeconds / Math.max(1, warp);
  if (!Number.isFinite(s) || s < 0) return '—';
  if (s < 10) return `${s.toFixed(1)} s`;
  if (s < 60) return `${Math.round(s)} s`;
  const whole = Math.round(s);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const sec = String(whole % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * Time (DECISIONS A12). Before the encounter the player prepares as long as they like and
 * ENTER starts it. Inside it there is no pause: every adjustment happens in real time, and the
 * warp steps compress long coasts, never slower than 1×. Warp never changes the simulation's step.
 * Beside the steps: how long the next scheduled or forecast event is, in ship time and in wall
 * time at the selected warp (nominal: when the frame budget runs out the ship runs slower).
 */
export function TimeControls({
  game,
  forecasts = [],
  reason,
  compact,
}: {
  readonly game: GameControls;
  readonly forecasts?: readonly Forecast[];
  /** Why warp last dropped to 1×, kept until the player raises it again (S9 R3b). */
  readonly reason?: string | null;
  readonly compact?: boolean;
}) {
  const status = game.status();
  const marker = status.phase === 'ended' ? null : nextMarker(status, forecasts);
  // Before ENTER the encounter starts at 1×, whatever was chosen last time.
  const warp = status.phase === 'prepare' ? 1 : status.warp;
  const etaText = marker
    ? `${marker.label} in ${wallTime(marker.t - status.t, 1)} ship` +
      (warp > 1 ? ` · ${wallTime(marker.t - status.t, warp)} at ${warp}× nominal` : '')
    : '';
  const eta = marker ? (
    <span className="cs-time__eta" data-tone="forecast" title={etaText}>
      {etaText}
    </span>
  ) : null;
  const ended = status.phase === 'ended';
  const dropped =
    reason && status.warp === 1 && !ended ? (
      <span className="cs-time__reason" role="status">
        ▲ warp to 1× · {reason}
      </span>
    ) : null;
  return (
    <div className="cs-time" data-compact={compact ? '' : undefined}>
      <div className="cs-time__row">
        <span className="cs-time__met">T+{clock(status.t)}</span>
        {status.phase === 'prepare' ? (
          <Button primary onClick={() => enter(game)} disabled={status.committing}>
            ENTER {game.briefing.name}
          </Button>
        ) : (
          status.warpSteps.map((step) => (
            <button
              key={step}
              type="button"
              className="rx-chip"
              data-on={step === status.warp ? '' : undefined}
              aria-pressed={step === status.warp}
              disabled={ended}
              onClick={() => game.setWarp(step)}
            >
              {step}×
            </button>
          ))
        )}
        {status.committing ? <span className="cs-time__note">forecasting</span> : null}
        {status.saturated ? (
          <span className="cs-time__note" title="The frame budget ran out: ship time runs slower">
            ▲ limited · slower than {status.warp}×
          </span>
        ) : null}
      </div>
      {dropped}
      {eta}
    </div>
  );
}

/** Enter the encounter: the clock starts at 1×, and from here there is no pause (A12). */
export function enter(game: GameControls): void {
  if (game.status().phase !== 'prepare') return;
  game.setWarp(1);
  game.setPaused(false);
}
