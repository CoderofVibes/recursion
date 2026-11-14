import type { ReactElement } from 'react';
import { STATUS_GLYPH } from './scale.ts';
import type { Status, Tone } from './scale.ts';

export interface SchematicBoxProps {
  readonly label: string;
  /** Second line: a mode or a reading. */
  readonly sub?: string;
  readonly status?: Status;
  readonly tone?: Tone;
  /** A bus or manifold is drawn heavier than a unit. */
  readonly kind?: 'unit' | 'bus';
  readonly selected?: boolean;
  readonly onSelect?: () => void;
}

/** One block of a schematic: a unit or a bus, with its state. Usable on its own. */
export function SchematicBox({
  label,
  sub,
  status = 'nominal',
  tone = 'measured',
  kind = 'unit',
  selected = false,
  onSelect,
}: SchematicBoxProps): ReactElement {
  const glyph = STATUS_GLYPH[status];
  const body = (
    <>
      <span className="rx-box__label">
        {glyph && (
          <span className="rx-glyph" aria-hidden="true">
            {glyph}
          </span>
        )}
        {label}
      </span>
      {sub && <span className="rx-box__sub">{sub}</span>}
    </>
  );
  const common = {
    className: 'rx-box',
    'data-status': status,
    'data-tone': tone,
    'data-kind': kind,
    'data-selected': selected ? 'true' : undefined,
  };
  return onSelect ? (
    <button type="button" {...common} aria-pressed={selected} onClick={onSelect}>
      {body}
    </button>
  ) : (
    <div {...common}>{body}</div>
  );
}

export interface SchematicNode extends Omit<SchematicBoxProps, 'selected' | 'onSelect'> {
  readonly id: string;
  /** Grid cell, from 0 at the left and top. */
  readonly col: number;
  readonly row: number;
  /** Columns the box spans (default 1). */
  readonly span?: number;
}

export interface SchematicLink {
  readonly from: string;
  readonly to: string;
  /** An open breaker, a closed valve or an unpowered path is drawn dashed and dim. */
  readonly state?: 'on' | 'off';
}

export interface SchematicProps {
  /** What the diagram shows, for assistive technology. */
  readonly label: string;
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly SchematicNode[];
  readonly links: readonly SchematicLink[];
  readonly selected?: string;
  readonly onSelect?: (id: string) => void;
}

/**
 * Boxes on a grid joined by right-angled lines: a one-line diagram, a coolant loop, a feed
 * system. Lines run centre to centre and pass behind the boxes.
 */
export function Schematic({
  label,
  cols,
  rows,
  nodes,
  links,
  selected,
  onSelect,
}: SchematicProps): ReactElement {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cx = (n: SchematicNode): number => n.col + (n.span ?? 1) / 2;
  const cy = (n: SchematicNode): number => n.row + 0.5;
  return (
    <div
      className="rx-schematic"
      role="group"
      aria-label={label}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, var(--rx-schematic-row-height))`,
      }}
    >
      <svg
        className="rx-schematic__links"
        viewBox={`0 0 ${cols} ${rows}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {links.map((l) => {
          const a = byId.get(l.from);
          const b = byId.get(l.to);
          if (!a || !b) return null;
          const mid = (cx(a) + cx(b)) / 2;
          const d =
            Math.abs(cx(a) - cx(b)) < 1e-6
              ? `M${cx(a)} ${cy(a)}L${cx(b)} ${cy(b)}`
              : `M${cx(a)} ${cy(a)}L${mid} ${cy(a)}L${mid} ${cy(b)}L${cx(b)} ${cy(b)}`;
          return (
            <path
              key={`${l.from}>${l.to}`}
              className="rx-schematic__link"
              data-state={l.state ?? 'on'}
              d={d}
            />
          );
        })}
      </svg>
      {nodes.map(({ id, col, row, span, ...box }) => (
        <div
          key={id}
          className="rx-schematic__cell"
          style={{ gridColumn: `${col + 1} / span ${span ?? 1}`, gridRow: row + 1 }}
        >
          <SchematicBox
            {...box}
            selected={selected === id}
            onSelect={onSelect ? () => onSelect(id) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
