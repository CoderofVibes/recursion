import { describe, expect, it } from 'vitest';
import { colour, cssVariables, hex, lineStyles } from './index.ts';

// WCAG relative luminance and contrast.
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(c: string): number {
  const n = hex(c);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// CIE L*a*b* ΔE76, enough to catch two roles drifting into the same colour.
function lab(c: string): [number, number, number] {
  const n = hex(c);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(channel) as [
    number,
    number,
    number,
  ];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

describe('theme tokens', () => {
  it('every colour is a #rrggbb hex', () => {
    for (const c of Object.values(colour)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('text that carries information is legible on panels', () => {
    expect(contrast(colour.ink, colour.panel)).toBeGreaterThanOrEqual(7);
    expect(contrast(colour.inkDim, colour.panel)).toBeGreaterThanOrEqual(4.5);
    for (const role of [
      'caution',
      'warning',
      'blackbox',
      'forecast',
      'velocity',
      'thrust',
    ] as const) {
      expect(contrast(colour[role], colour.panel), role).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('roles that must never be confused stay apart', () => {
    const pairs: [keyof typeof colour, keyof typeof colour][] = [
      ['caution', 'blackbox'],
      ['warning', 'blackbox'],
      ['warning', 'thrust'],
      ['caution', 'velocity'],
      ['forecast', 'velocity'],
      ['forecast', 'measured'],
      ['thrust', 'well'],
      ['blackbox', 'bodyRim'],
    ];
    for (const [a, b] of pairs)
      expect(deltaE(colour[a], colour[b]), `${a} vs ${b}`).toBeGreaterThan(20);
  });

  it('the forecast is dotted and the trail is solid', () => {
    expect(lineStyles.forecast.dash).toBeDefined();
    expect('dash' in lineStyles.trail).toBe(false);
  });

  it('exposes CSS variables for the console', () => {
    expect(cssVariables['--rx-ink']).toBe(colour.ink);
    expect(cssVariables['--rx-blackbox']).toBe(colour.blackbox);
    expect(cssVariables['--rx-t-alert-in']).toBe('300ms');
  });
});
