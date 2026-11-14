/**
 * The tokens as CSS custom properties, for the console. Apply once at the root:
 *   for (const [k, v] of Object.entries(cssVariables)) document.documentElement.style.setProperty(k, v);
 * Names are `--rx-<role>` in kebab case.
 */
import { colour, opacity, rgba, roomLight } from './colour.ts';
import { instrument } from './instrument.ts';
import { dash, line } from './line.ts';
import { motion } from './motion.ts';
import { space, surface } from './space.ts';
import { type } from './type.ts';

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function build(): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, c] of Object.entries(colour)) v[`--rx-${kebab(k)}`] = c;
  v['--rx-room-light'] = roomLight;
  v['--rx-font'] = type.family;
  for (const [k, px] of Object.entries(type.size)) v[`--rx-size-${k}`] = `${px}px`;
  for (const [k, tr] of Object.entries(type.tracking)) v[`--rx-tracking-${k}`] = tr;
  v['--rx-number-glow'] = type.numberGlow;
  for (const [k, px] of Object.entries(space)) v[`--rx-${kebab(k)}`] = `${px}px`;
  v['--rx-panel-inset'] = surface.panelInset;
  v['--rx-table-shadow'] = surface.tableShadow;
  v['--rx-pip-glow'] = surface.pipGlow;
  for (const k of ['fast', 'base', 'alertIn', 'settle', 'camera', 'breathe'] as const) {
    v[`--rx-t-${kebab(k)}`] = `${motion[k]}ms`;
  }
  v['--rx-ease-out'] = motion.easing.out;
  v['--rx-ease-in-out'] = motion.easing.inOut;
  // Instrument primitives (src/theme/components).
  for (const [k, px] of Object.entries(instrument)) v[`--rx-${kebab(k)}`] = `${px}px`;
  v['--rx-weight-regular'] = String(type.weight.regular);
  v['--rx-weight-strong'] = String(type.weight.strong);
  v['--rx-line-trace'] = `${line.trace}px`;
  v['--rx-line-trace-secondary'] = `${line.traceSecondary}px`;
  v['--rx-line-rule'] = `${line.rule}px`;
  v['--rx-dash-forecast'] = dash.forecast.join(' ');
  v['--rx-dash-connector'] = dash.connector.join(' ');
  v['--rx-dash-envelope-edge'] = dash.envelopeEdge.join(' ');
  v['--rx-wash-hover'] = rgba(colour.ink, opacity.rowHover);
  v['--rx-wash-selected'] = rgba(colour.ink, opacity.rowSelected);
  v['--rx-wash-blackbox'] = rgba(colour.blackbox, opacity.blackboxWash);
  v['--rx-forecast-band'] = rgba(colour.forecast, opacity.envelopeBody);
  v['--rx-forecast-band-extrapolated'] = rgba(colour.forecast, opacity.extrapolatedBody);
  v['--rx-stale'] = String(opacity.staleInstrument);
  return v;
}

export const cssVariables: Readonly<Record<string, string>> = build();

/** Put every token on an element (usually the document root) as a CSS custom property. */
export function applyTheme(target: {
  style: { setProperty(name: string, value: string): void };
}): void {
  for (const [k, v] of Object.entries(cssVariables)) target.style.setProperty(k, v);
}
