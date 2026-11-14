/**
 * The tokens as CSS custom properties, for the console. Apply once at the root:
 *   for (const [k, v] of Object.entries(cssVariables)) document.documentElement.style.setProperty(k, v);
 * Names are `--rx-<role>` in kebab case.
 */
import { colour, roomLight } from './colour.ts';
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
  return v;
}

export const cssVariables: Readonly<Record<string, string>> = build();
