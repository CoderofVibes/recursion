/**
 * Instrument primitives: React components with no game logic. Owner: 1E, the UI lane.
 *
 * Panels are composed from these (Convention 11). They take plain numbers and strings, so the
 * console decides what to show and the theme decides how it looks. Call `applyTheme()` from
 * `src/theme/index.ts` once at the root so the `--rx-*` tokens these styles use are defined.
 *
 * See them on the contract fixtures in the UI lab: `npm run dev`, then /src/theme/lab/index.html.
 */
import './components.css';

export { LevelBar } from './LevelBar.tsx';
export type { LevelBarProps, LevelMark } from './LevelBar.tsx';
export { Trend } from './Trend.tsx';
export type { TrendProps, TrendLimit } from './Trend.tsx';
export { Readout, ReadoutGrid } from './Readout.tsx';
export type { ReadoutProps, ReadoutGridProps } from './Readout.tsx';
export { Schematic, SchematicBox } from './Schematic.tsx';
export type {
  SchematicProps,
  SchematicNode,
  SchematicLink,
  SchematicBoxProps,
} from './Schematic.tsx';
export { ComponentRow, ComponentList } from './ComponentRow.tsx';
export type { ComponentRowProps, ComponentListProps } from './ComponentRow.tsx';
export { ModeChips, Toggle } from './ModeChips.tsx';
export type { ModeChipsProps, ModeOption, ToggleProps } from './ModeChips.tsx';
export { Alert, AlertStack, sortAlerts, ALERT_GLYPH } from './Alert.tsx';
export type { AlertProps, AlertItem, AlertLevel, AlertStackProps } from './Alert.tsx';
export { BlackBoxMark } from './BlackBoxMark.tsx';
export type { BlackBoxMarkProps, BlackBoxState } from './BlackBoxMark.tsx';
export { Gauge } from './Gauge.tsx';
export type { GaugeProps } from './Gauge.tsx';
export { Panel } from './Panel.tsx';
export type { PanelProps } from './Panel.tsx';
export {
  STATUS_GLYPH,
  fraction,
  percent,
  extent,
  tracePath,
  bandPath,
  arcPoint,
  arcPath,
} from './scale.ts';
export type { Status, Tone, LimitKind } from './scale.ts';
