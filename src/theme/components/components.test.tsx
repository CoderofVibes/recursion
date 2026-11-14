import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cssVariables } from '../index.ts';
import {
  bandPath,
  ComponentList,
  ComponentRow,
  extent,
  fraction,
  LevelBar,
  Panel,
  Readout,
  ReadoutGrid,
  Schematic,
  tracePath,
  Trend,
} from './index.ts';

// The test runner blanks out CSS imports, so read the stylesheet from disk. The app's TypeScript
// settings carry no Node types, hence the indirect import.
const { readFileSync } = (await import(/* @vite-ignore */ `node:${'fs'}`)) as {
  readFileSync(path: URL, encoding: 'utf8'): string;
};
const css = readFileSync(new URL('./components.css', import.meta.url), 'utf8');

describe('instrument stylesheet', () => {
  it('holds no literal colours or pixel sizes, only theme tokens', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull();
    expect(body.match(/\brgba?\(/g)).toBeNull();
    expect(body.match(/\d+(\.\d+)?px\b/g)).toBeNull();
    expect(body.match(/\d+(\.\d+)?m?s\b/g)).toBeNull();
  });

  it('uses only tokens that applyTheme defines', () => {
    const used = new Set([...css.matchAll(/var\((--rx-[a-z0-9-]+)/g)].map((m) => m[1]));
    const local = new Set(['--rx-tone', '--rx-c']);
    const missing = [...used].filter((v) => v && !local.has(v) && !(v in cssVariables));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(30);
  });
});

describe('scale helpers', () => {
  it('fraction clamps and survives a zero range', () => {
    expect(fraction(5, 0, 10)).toBe(0.5);
    expect(fraction(-1, 0, 10)).toBe(0);
    expect(fraction(99, 0, 10)).toBe(1);
    expect(fraction(3, 2, 2)).toBe(0);
    expect(fraction(Number.NaN)).toBe(0);
  });

  it('extent pads the range and gives a flat series a band', () => {
    const [lo, hi] = extent([[10, 20]], 0.1);
    expect(lo).toBeCloseTo(9);
    expect(hi).toBeCloseTo(21);
    const [a, b] = extent([[295, 295, 295]]);
    expect(a).toBeLessThan(295);
    expect(b).toBeGreaterThan(295);
    expect(extent([[]])).toEqual([0, 1]);
  });

  it('tracePath maps values into the box and lifts the pen over gaps', () => {
    expect(tracePath([0, 10], 0, 10)).toBe('M0 100L100 0');
    expect(tracePath([0, Number.NaN, 10], 0, 10)).toBe('M0 100M100 0');
    expect(tracePath([5, 5], 0, 10, 50, 100)).toBe('M50 50L100 50');
    expect(tracePath([], 0, 1)).toBe('');
  });

  it('bandPath closes around the centre line', () => {
    const d = bandPath([5, 5], [0, 5], 0, 10);
    expect(d.startsWith('M0 50')).toBe(true);
    expect(d).toContain('L100 0');
    expect(d).toContain('L100 100');
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('LevelBar', () => {
  it('is a meter with its value, limits and forecast placed on the scale', () => {
    const html = renderToStaticMarkup(
      <LevelBar
        label="Fuel cell A"
        value={1500}
        max={6000}
        text="1,500 / 6,000 W"
        forecast={3000}
        marks={[{ at: 4800, kind: 'caution', label: 'continuous rating' }]}
      />,
    );
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="1500"');
    expect(html).toContain('aria-valuemax="6000"');
    expect(html).toContain('class="rx-level__fill" style="width:25%"');
    expect(html).toContain('class="rx-level__forecast" style="left:50%"');
    expect(html).toContain('data-kind="caution" style="left:80%"');
    expect(html).toContain('1,500 / 6,000 W');
  });

  it('pairs an alert colour with its shape and says so to a screen reader', () => {
    const html = renderToStaticMarkup(<LevelBar label="Cabin" value={0.9} status="warning" />);
    expect(html).toContain('data-status="warning"');
    expect(html).toContain('■');
    expect(html).toContain('aria-valuetext="90 %, warning"');
  });
});

describe('Trend', () => {
  it('draws measured data solid and nothing else by default', () => {
    const html = renderToStaticMarkup(
      <Trend title="Cabin" unit="K" value="295" data={[1, 2, 3]} />,
    );
    expect(html).toContain('class="rx-trend__data"');
    expect(html).not.toContain('rx-trend__forecast');
    expect(html).not.toContain('rx-trend__now');
    expect(html).toContain('aria-label="Cabin 295 K"');
  });

  it('continues into a forecast with its envelope after a rule at now', () => {
    const html = renderToStaticMarkup(
      <Trend
        title="Range"
        data={[0, 1, 2]}
        forecast={[3, 4]}
        forecastBand={[0.5, 1]}
        previous={[0, 0.5, 1]}
        limits={[{ at: 4, kind: 'warning' }]}
      />,
    );
    // Two measured steps and two forecast steps: now sits half way across.
    expect(html).toContain('class="rx-trend__now" x1="50"');
    expect(html).toMatch(/class="rx-trend__data" d="M0 [\d.]+L25 [\d.]+L50 /);
    expect(html).toMatch(/class="rx-trend__forecast" d="M50 [\d.]+L75 [\d.]+L100 /);
    expect(html).toContain('class="rx-trend__band"');
    expect(html).toContain('class="rx-trend__previous"');
    expect(html).toContain('class="rx-trend__limit" data-kind="warning"');
    expect(html).toContain('with forecast');
  });
});

describe('Readout', () => {
  it('shows the value with its unit and uncertainty', () => {
    const html = renderToStaticMarkup(
      <ReadoutGrid columns={3}>
        <Readout label="M1 · GM" value="1.02e10" unit="m³/s²" sigma="4 %" tone="forecast" />
      </ReadoutGrid>,
    );
    expect(html).toContain('grid-template-columns:repeat(3, minmax(0, 1fr))');
    expect(html).toContain('data-tone="forecast"');
    expect(html).toContain('1.02e10');
    expect(html).toContain('m³/s²');
    expect(html).toContain('± 4 %');
  });
});

describe('Schematic', () => {
  const nodes = [
    { id: 'fc', col: 0, row: 0, label: 'Fuel cell A', sub: '1,443 W' },
    { id: 'bus', col: 1, row: 1, label: 'Main A', kind: 'bus' as const },
    { id: 'sol', col: 0, row: 1, label: 'Solar L', status: 'off' as const },
  ];

  it('places boxes on the grid and joins them with right-angled links', () => {
    const html = renderToStaticMarkup(
      <Schematic
        label="Power"
        cols={2}
        rows={2}
        nodes={nodes}
        links={[
          { from: 'fc', to: 'bus' },
          { from: 'sol', to: 'bus', state: 'off' },
          { from: 'fc', to: 'nowhere' },
        ]}
      />,
    );
    expect(html).toContain('viewBox="0 0 2 2"');
    expect(html).toContain('d="M0.5 0.5L1 0.5L1 1.5L1.5 1.5"');
    expect(html).toContain('data-state="off"');
    expect(html.match(/class="rx-schematic__link"/g)).toHaveLength(2);
    expect(html).toContain('grid-column:2 / span 1;grid-row:2');
    expect(html).toContain('data-kind="bus"');
  });

  it('makes boxes pressable when a selection handler is given', () => {
    const html = renderToStaticMarkup(
      <Schematic
        label="Power"
        cols={2}
        rows={2}
        nodes={nodes}
        links={[]}
        selected="bus"
        onSelect={() => {}}
      />,
    );
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toContain('aria-pressed="true"');
  });
});

describe('ComponentRow', () => {
  it('is a button with a pip when it can be selected', () => {
    const html = renderToStaticMarkup(
      <ComponentList label="Power components">
        <ComponentRow name="Battery A" mode="IDLE" value="81 %" selected onSelect={() => {}} />
      </ComponentList>,
    );
    expect(html).toContain('<ul class="rx-rows" aria-label="Power components">');
    expect(html).toContain('<button type="button" class="rx-row"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('rx-row__pip');
  });

  it('swaps the pip for the alert shape when it needs attention', () => {
    const html = renderToStaticMarkup(<ComponentRow name="Radiator L" status="caution" />);
    expect(html).toContain('▲');
    expect(html).not.toContain('rx-row__pip');
    expect(html).not.toContain('<button');
  });
});

describe('Panel', () => {
  it('frames its content under a header', () => {
    const html = renderToStaticMarkup(
      <Panel title="Black Box" aside="REC" statusLine="Recording · no link" tone="blackbox">
        <Readout label="Store" value="37" unit="%" />
      </Panel>,
    );
    expect(html).toContain('<section class="rx-panel" data-status="nominal" data-tone="blackbox"');
    expect(html).toContain('Recording · no link');
    expect(html).toContain('rx-readout');
  });
});
