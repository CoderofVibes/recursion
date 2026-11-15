/**
 * Sizes for the instrument primitives in `src/theme/components/`. px unless noted.
 * Change a number here and every level bar, trend, schematic and component row follows.
 */
export const instrument = {
  /** Level bar: thickness of the bar itself. */
  barHeight: 6,
  /** How far a limit mark stands above and below the bar. */
  markOverhang: 3,
  /** Columns either side of the bar: its label and its value text. */
  barLabelWidth: 108,
  barValueWidth: 96,
  /** Trend graph plot height. */
  trendHeight: 42,
  /** Schematic: height of one row of boxes, and of a box within it. */
  schematicRowHeight: 38,
  schematicBoxHeight: 30,
  schematicGap: 8,
  /** Component row: status pip and padding. */
  pip: 6,
  rowPadX: 4,
  rowPadY: 3,
  /** Mode chips and toggles. */
  chipPadX: 8,
  chipPadY: 4,
  /** Alert banner. */
  alertPadX: 10,
  alertPadY: 6,
  /** Black Box record lamp. */
  lamp: 8,
  /** Gauge: outer diameter and arc thickness. */
  gaugeSize: 96,
  gaugeStroke: 6,
} as const;

/** Gauge geometry (not px): degrees the arc sweeps, and its radius and tick reach in a 100-unit box. */
export const gaugeArc = { sweep: 240, radius: 40, tick: 7 } as const;

/** Grid divisions behind a trend (counts, not px). */
export const trendGrid = { cols: 6, rows: 3 } as const;
