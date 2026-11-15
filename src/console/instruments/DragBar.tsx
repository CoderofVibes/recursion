/**
 * A level the player sets by pulling on it: a bar with a handle, for quantities that are truly
 * continuous and the player's to choose (an allocation, a reserve, a throttle). It is a slider
 * to the keyboard and to assistive technology: arrows step it, Page Up and Down step it faster,
 * Home and End take it to its limits.
 *
 * `measured` draws what the ship reports beside what was set, so the setting and its effect are
 * read on one scale (set in the forecast's colour, measured in the ink of the measured world).
 * `vertical` stands it up as a fader, with its named settings (`stops`) beside it.
 */
import { useRef } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';

export interface DragStop {
  readonly at: number;
  readonly label: string;
}

export interface DragBarProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The value as text beside the bar. */
  readonly text: string;
  /** Absent: the bar only shows a level. */
  readonly onChange?: (value: number) => void;
  /** What the ship measures on the same scale. */
  readonly measured?: number;
  readonly marks?: readonly {
    readonly at: number;
    readonly kind: 'caution' | 'warning' | 'target';
    readonly label?: string;
  }[];
  readonly tone?: 'measured' | 'forecast' | 'blackbox' | 'thrust';
  readonly status?: 'nominal' | 'caution' | 'warning' | 'off' | 'stale';
  /** What this setting changes, in the mission's own units. */
  readonly effect?: string;
  /** For a narrow column: the label and value on one line, the bar on its own line below. */
  readonly stacked?: boolean;
  /** A fader: the bar stands upright, filled from the bottom. */
  readonly vertical?: boolean;
  /** Named settings on the scale (a mode's draw): ticks on the bar, and buttons that jump to them. */
  readonly stops?: readonly DragStop[];
  /**
   * Choosing a named setting: called with the setting instead of `onChange` with its place on
   * the scale, for settings that are not told apart by where they sit (two rates that draw the
   * same power). The settings are offered even when the bar itself cannot be pulled.
   */
  readonly onStop?: (stop: DragStop) => void;
  /** The named setting in force, by its label, where the value alone does not say which. */
  readonly stop?: string;
  /**
   * Let the value be typed too, in place of its text: the unit shown after the field. The field
   * takes any value in range, not only the bar's steps.
   */
  readonly typed?: { readonly unit: string; readonly step?: number };
}

/** A value held to the bar's steps and limits. */
export const dragSnap = (value: number, min: number, max: number, step: number): number =>
  Math.min(max, Math.max(min, Math.round((value - min) / step) * step + min));

/**
 * Where a key takes the level: arrows one step, Page Up and Down ten, Home and End the limits.
 * Undefined for a key the bar does not use (it is left for whatever else is listening).
 */
export function dragKey(
  key: string,
  value: number,
  min: number,
  max: number,
  step: number,
): number | undefined {
  const next: Record<string, number> = {
    ArrowRight: value + step,
    ArrowUp: value + step,
    ArrowLeft: value - step,
    ArrowDown: value - step,
    PageUp: value + step * 10,
    PageDown: value - step * 10,
    Home: min,
    End: max,
  };
  const wanted = next[key];
  return wanted === undefined ? undefined : dragSnap(wanted, min, max, step);
}

export function DragBar({
  label,
  value,
  min,
  max,
  step,
  text,
  onChange,
  measured,
  marks = [],
  tone = 'forecast',
  status,
  effect,
  stacked,
  vertical,
  stops = [],
  onStop,
  stop,
  typed,
}: DragBarProps) {
  const track = useRef<HTMLDivElement>(null);
  const span = Math.max(1e-9, max - min);
  const pct = (v: number): string =>
    `${(Math.min(1, Math.max(0, (v - min) / span)) * 100).toFixed(2)}%`;
  /** How far along the bar, and from which edge: left to right, or bottom to top for a fader. */
  const level = (v: number): CSSProperties => (vertical ? { height: pct(v) } : { width: pct(v) });
  const place = (v: number): CSSProperties => (vertical ? { bottom: pct(v) } : { left: pct(v) });
  const snap = (v: number): number => dragSnap(v, min, max, step);
  const fromPointer = (event: PointerEvent<HTMLDivElement>): number => {
    const rect = track.current!.getBoundingClientRect();
    const fraction = vertical
      ? 1 - (event.clientY - rect.top) / Math.max(1, rect.height)
      : (event.clientX - rect.left) / Math.max(1, rect.width);
    return snap(min + fraction * span);
  };
  const down = (event: PointerEvent<HTMLDivElement>): void => {
    if (!onChange) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(fromPointer(event));
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    if (!onChange || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onChange(fromPointer(event));
  };
  const key = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!onChange) return;
    const wanted = dragKey(event.key, value, min, max, step);
    if (wanted === undefined) return;
    event.preventDefault();
    // A focused control keeps its own keys: they never reach the flight controls (S9 R10).
    event.stopPropagation();
    onChange(wanted);
  };
  const at = (s: DragStop): boolean =>
    stop !== undefined ? s.label === stop : Math.abs(value - s.at) < step / 2;
  return (
    <div
      className="ci-drag"
      data-tone={tone}
      data-status={status}
      data-stacked={stacked ? '' : undefined}
      data-vertical={vertical ? '' : undefined}
    >
      <span className="ci-drag__label">{label}</span>
      <div
        ref={track}
        className="ci-drag__track"
        data-fixed={onChange ? undefined : ''}
        {...(onChange
          ? {
              role: 'slider',
              tabIndex: 0,
              'aria-label': label,
              'aria-orientation': vertical ? ('vertical' as const) : ('horizontal' as const),
              'aria-valuemin': min,
              'aria-valuemax': max,
              'aria-valuenow': value,
              'aria-valuetext': text,
              onPointerDown: down,
              onPointerMove: move,
              onKeyDown: key,
            }
          : { role: 'img', 'aria-label': `${label}: ${text}` })}
      >
        <span className="ci-drag__fill" style={level(value)} />
        {measured !== undefined ? (
          <span className="ci-drag__measured" style={level(measured)} />
        ) : null}
        {stops.map((s) => (
          <span key={s.label} className="ci-drag__mark" data-kind="stop" style={place(s.at)} />
        ))}
        {marks.map((m, i) => (
          <span
            key={i}
            className="ci-drag__mark"
            data-kind={m.kind}
            title={m.label}
            style={place(m.at)}
          />
        ))}
        {onChange ? <span className="ci-drag__thumb" style={place(value)} /> : null}
      </div>
      {stops.length ? (
        <div className="ci-drag__stops" role="group" aria-label={`${label} settings`}>
          {(vertical ? [...stops].reverse() : stops).map((s) => (
            <button
              key={s.label}
              type="button"
              className="rx-chip"
              data-on={at(s) ? '' : undefined}
              aria-pressed={at(s)}
              disabled={!onChange && !onStop}
              onClick={() => (onStop ? onStop(s) : onChange?.(s.at))}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      {typed && onChange ? (
        <label className="ci-drag__value ci-drag__typed">
          <input
            type="number"
            aria-label={`${label}, ${typed.unit}`}
            min={min}
            max={max}
            step={typed.step ?? step}
            value={Number.isFinite(value) ? value : ''}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(v))
                onChange(Math.min(max, Math.max(min, v)));
            }}
            // A field being typed in keeps its keys (S9 R10).
            onKeyDown={(e) => e.stopPropagation()}
          />
          <span>{typed.unit}</span>
        </label>
      ) : (
        <span className="ci-drag__value">{text}</span>
      )}
      {effect ? <span className="ci-drag__effect">{effect}</span> : null}
    </div>
  );
}
