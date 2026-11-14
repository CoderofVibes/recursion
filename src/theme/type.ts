/**
 * Typography tokens. One monospace family for everything: labels, values, tags.
 * System fonts only (no font download); Cascadia Mono ships with Windows 11.
 */
export const type = {
  family:
    '"Cascadia Mono", "Cascadia Code", Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", monospace',
  /** px */
  size: {
    /** Axis ticks, units, 3D tags. */
    small: 10,
    /** Panel and field labels (uppercase). */
    label: 11,
    body: 12,
    /** A value inside a detail block. */
    value: 15,
    /** Primary readouts. */
    readout: 18,
    /** Mission elapsed time and other one-per-screen numbers. */
    display: 20,
  },
  tracking: { label: '0.08em', body: '0.04em', tag: '0.06em' },
  weight: { regular: 400, strong: 600 },
  /** Labels are uppercase; values use tabular figures so they do not jitter. */
  labelCase: 'uppercase',
  numeric: 'tabular-nums',
  /** Faint phosphor glow on numbers. */
  numberGlow: '0 0 6px rgba(255, 200, 140, 0.25)',
} as const;
