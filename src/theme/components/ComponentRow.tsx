import type { ReactElement, ReactNode } from 'react';
import { STATUS_GLYPH } from './scale.ts';
import type { Status, Tone } from './scale.ts';

export interface ComponentRowProps {
  readonly name: string;
  /** Operating mode, e.g. `'FOLLOWING'`. */
  readonly mode?: string;
  /** The one number that matters for this component, already formatted. */
  readonly value?: string;
  readonly status?: Status;
  readonly tone?: Tone;
  readonly selected?: boolean;
  readonly onSelect?: () => void;
}

/**
 * One piece of equipment in a list: a status pip, its name, its mode and one value.
 * The pip is lit when the component is running, hollow when it is off, and is replaced by the
 * alert shape (▲ ■) when it needs attention.
 */
export function ComponentRow({
  name,
  mode,
  value,
  status = 'nominal',
  tone = 'measured',
  selected = false,
  onSelect,
}: ComponentRowProps): ReactElement {
  const glyph = status === 'caution' || status === 'warning' ? STATUS_GLYPH[status] : '';
  const body = (
    <>
      {glyph ? (
        <span className="rx-glyph rx-row__glyph" aria-hidden="true">
          {glyph}
        </span>
      ) : (
        <span className="rx-row__pip" aria-hidden="true" />
      )}
      <span className="rx-row__name">{name}</span>
      {mode !== undefined && <span className="rx-row__mode">{mode}</span>}
      {value !== undefined && <span className="rx-row__value">{value}</span>}
    </>
  );
  const common = {
    className: 'rx-row',
    'data-status': status,
    'data-tone': tone,
    'data-selected': selected ? 'true' : undefined,
  };
  return (
    <li className="rx-row__item">
      {onSelect ? (
        <button
          type="button"
          {...common}
          aria-pressed={selected}
          aria-label={`${name}${mode ? `, ${mode}` : ''}${status === 'nominal' ? '' : `, ${status}`}`}
          onClick={onSelect}
        >
          {body}
        </button>
      ) : (
        <div {...common}>{body}</div>
      )}
    </li>
  );
}

export interface ComponentListProps {
  /** What the list holds, for assistive technology. */
  readonly label: string;
  readonly children: ReactNode;
}

export function ComponentList({ label, children }: ComponentListProps): ReactElement {
  return (
    <ul className="rx-rows" aria-label={label}>
      {children}
    </ul>
  );
}
