/**
 * A budget as one picture: what is supplied against what is asked of it, on one scale, so a
 * change to one load is seen at once as headroom lost to the others. Used for electrical power
 * (sources against loads), and the same shape serves heat (rejection against generation).
 *
 * Supply and demand are drawn as two stacked bars. The loads the player can change carry a
 * handle (`DragBar`) and say what the change buys in the mission's own units.
 */
import { DragBar } from './DragBar.tsx';
import type { DragBarProps } from './DragBar.tsx';

export interface BudgetSource {
  readonly id: string;
  readonly label: string;
  /** What it supplies now. */
  readonly value: number;
  /** What it could supply: drawn as an outline beyond its value. Absent: no more than now. */
  readonly capacity?: number;
  readonly tone?: 'measured' | 'forecast' | 'blackbox';
}

export interface BudgetLoad {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  /** A load the player sets: its segment is lit and it gets a handle below. */
  readonly control?: Pick<DragBarProps, 'min' | 'max' | 'step' | 'marks' | 'effect'> & {
    readonly onChange: (value: number) => void;
    /** Named settings on the same scale (a mode's draw), offered as stops. */
    readonly stops?: readonly { readonly at: number; readonly label: string }[];
  };
  readonly tone?: 'measured' | 'forecast' | 'blackbox' | 'thrust';
}

export interface BudgetBoardProps {
  readonly label: string;
  readonly unit: string;
  readonly sources: readonly BudgetSource[];
  readonly loads: readonly BudgetLoad[];
  /** The id of the load in focus (chosen elsewhere), lit in the demand bar. */
  readonly selected?: string;
  readonly onSelect?: (id: string) => void;
  /** Numbers as the console writes them. */
  readonly format?: (value: number) => string;
  /** What a shortfall means here ("batteries bridge it"). */
  readonly shortfall?: string;
  /** The loads' handles as a bank of upright faders (a desk), instead of rows. */
  readonly faders?: boolean;
}

const whole = (v: number): string => Math.round(v).toLocaleString('en-US');

export function BudgetBoard({
  label,
  unit,
  sources,
  loads,
  selected,
  onSelect,
  format = whole,
  shortfall = 'short',
  faders = false,
}: BudgetBoardProps) {
  const supplied = sources.reduce((n, s) => n + s.value, 0);
  const available = sources.reduce((n, s) => n + Math.max(s.value, s.capacity ?? s.value), 0);
  const asked = loads.reduce((n, l) => n + l.value, 0);
  // The bars share one scale. Where the supply could give far more than is asked, the scale
  // follows the demand, so the loads stay readable, and the supply runs off its edge (marked).
  const scale = Math.max(Math.min(available, asked * 1.7), asked, 1) * 1.04;
  const clipped = available > scale;
  const pct = (v: number): string => `${((Math.min(v, scale) / scale) * 100).toFixed(2)}%`;
  const short = asked - available;
  // Each source from where the one before it ended, cut at the scale's edge.
  const capacityOf = (s: BudgetSource): number => Math.max(s.value, s.capacity ?? s.value);
  const drawn = sources.map((s, i) => {
    const from = sources.slice(0, i).reduce((n, before) => n + capacityOf(before), 0);
    const width = Math.max(0, Math.min(from + capacityOf(s), scale) - Math.min(from, scale));
    return { source: s, width, made: width > 0 ? Math.min(1, s.value / width) : 0 };
  });
  const controls = loads.filter((l) => l.control);
  return (
    <div className="ci-budget" role="group" aria-label={label}>
      <div className="ci-budget__head">
        <span className="ci-budget__figure">
          {format(asked)} <small>{unit} asked</small>
        </span>
        <span className="ci-budget__figure" data-tone="measured">
          {format(available)} <small>{unit} available</small>
        </span>
        <span className="ci-budget__figure" data-status={short > 0 ? 'warning' : 'nominal'}>
          {short > 0 ? `▲ ${format(short)}` : format(available - asked)}{' '}
          <small>
            {unit} {short > 0 ? shortfall : 'headroom'}
          </small>
        </span>
      </div>
      <div className="ci-budget__bars">
        <span className="ci-budget__side">supply</span>
        <div
          className="ci-budget__bar"
          role="img"
          aria-label={`Supply: ${format(supplied)} ${unit}`}
        >
          {drawn
            .filter((d) => d.width > 0)
            .map(({ source: s, width, made }) => (
              <span
                key={s.id}
                className="ci-budget__seg"
                data-kind="source"
                data-tone={s.tone ?? 'measured'}
                title={`${s.label}: ${format(s.value)} of ${format(Math.max(s.value, s.capacity ?? s.value))} ${unit}`}
                style={{ width: pct(width) }}
              >
                <span
                  className="ci-budget__made"
                  style={{ width: `${(made * 100).toFixed(1)}%` }}
                />
                <span className="ci-budget__tag">
                  {s.label} · {format(s.value)}
                </span>
              </span>
            ))}
          {clipped ? (
            <span className="ci-budget__more" title={`${format(available)} ${unit} available`}>
              ▸ {format(available)}
            </span>
          ) : null}
        </div>
        <span className="ci-budget__side">demand</span>
        <div className="ci-budget__bar" role="img" aria-label={`Demand: ${format(asked)} ${unit}`}>
          {loads.map((l) => (
            <button
              key={l.id}
              type="button"
              className="ci-budget__seg"
              data-kind="load"
              data-tone={l.tone ?? 'measured'}
              data-control={l.control ? '' : undefined}
              data-on={selected === l.id ? '' : undefined}
              aria-pressed={selected === l.id}
              tabIndex={onSelect ? 0 : -1}
              title={`${l.label}: ${format(l.value)} ${unit}`}
              style={{ width: pct(l.value) }}
              onClick={() => onSelect?.(l.id)}
            >
              <span className="ci-budget__tag">
                {l.label} · {format(l.value)}
              </span>
            </button>
          ))}
          {short > 0 ? (
            <span className="ci-budget__over" style={{ left: pct(available) }} />
          ) : clipped ? null : (
            <span className="ci-budget__limit" style={{ left: pct(available) }} />
          )}
        </div>
      </div>
      {controls.length ? (
        <div className="ci-budget__controls" data-faders={faders ? '' : undefined}>
          {controls.map((l) => {
            const c = l.control!;
            return (
              <div
                key={l.id}
                className="ci-budget__control"
                data-on={selected === l.id ? '' : undefined}
                onPointerDown={() => onSelect?.(l.id)}
                onFocus={() => onSelect?.(l.id)}
              >
                <DragBar
                  label={l.label}
                  value={l.value}
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  text={`${format(l.value)} ${unit}`}
                  onChange={c.onChange}
                  tone={l.tone === 'measured' || l.tone === undefined ? 'forecast' : l.tone}
                  vertical={faders}
                  {...(c.stops ? { stops: c.stops } : {})}
                  {...(c.marks ? { marks: c.marks } : {})}
                  {...(c.effect ? { effect: c.effect } : {})}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
