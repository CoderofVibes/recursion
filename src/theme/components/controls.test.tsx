import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { gaugeArc } from '../index.ts';
import {
  Alert,
  AlertStack,
  arcPath,
  arcPoint,
  BlackBoxMark,
  Gauge,
  ModeChips,
  sortAlerts,
  Toggle,
} from './index.ts';

describe('ModeChips', () => {
  it('is a radio group with the mode in force lit', () => {
    const html = renderToStaticMarkup(
      <ModeChips
        label="Camera mode"
        options={[
          'off',
          'standby',
          { value: 'track', label: 'Track' },
          { value: 'detail', disabled: true },
        ]}
        value="track"
        onChange={() => {}}
      />,
    );
    expect(html).toContain('role="radiogroup" aria-label="Camera mode"');
    expect(html.match(/role="radio"/g)).toHaveLength(4);
    expect(html).toContain('aria-checked="true" data-on="true"');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    // Only the mode the equipment cannot enter is disabled.
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toContain('>Track<');
  });

  it('shows the modes without offering them when there is no handler', () => {
    const html = renderToStaticMarkup(
      <ModeChips label="Mode" options={['off', 'on']} value="on" />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true" data-on="true">on</);
  });
});

describe('Toggle', () => {
  it('is a switch that says which way it is', () => {
    const on = renderToStaticMarkup(
      <Toggle label="Bus tie" on onChange={() => {}} onText="CLOSED" offText="OPEN" />,
    );
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('CLOSED');
    const off = renderToStaticMarkup(
      <Toggle label="Bus tie" on={false} onText="CLOSED" offText="OPEN" />,
    );
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('OPEN');
    expect(off).toContain('disabled=""');
  });
});

describe('Alert', () => {
  it('gives each level its own shape, and only a warning interrupts', () => {
    const warning = renderToStaticMarkup(
      <Alert level="warning" text="A-17" detail="CPA 9 km · T−6 s" />,
    );
    expect(warning).toContain('role="alert"');
    expect(warning).toContain('■');
    expect(warning).toContain('CPA 9 km · T−6 s');
    const caution = renderToStaticMarkup(<Alert level="caution" text="Radiators stowed" />);
    expect(caution).toContain('role="status"');
    expect(caution).toContain('▲');
    expect(renderToStaticMarkup(<Alert level="advisory" text="Solar stowed" />)).toContain('○');
  });

  it('puts the most serious first and keeps arrival order within a level', () => {
    const order = sortAlerts([
      { id: 'a', level: 'advisory' as const },
      { id: 'c1', level: 'caution' as const },
      { id: 'w', level: 'warning' as const },
      { id: 'c2', level: 'caution' as const },
    ]).map((a) => a.id);
    expect(order).toEqual(['w', 'c1', 'c2', 'a']);
  });

  it('a stack shows the first few, counts the rest, and is absent when all is well', () => {
    const alerts = [
      { id: '1', level: 'advisory' as const, text: 'one' },
      { id: '2', level: 'caution' as const, text: 'two' },
      { id: '3', level: 'warning' as const, text: 'three' },
      { id: '4', level: 'advisory' as const, text: 'four' },
    ];
    const html = renderToStaticMarkup(<AlertStack alerts={alerts} max={2} />);
    expect(html.match(/class="rx-alert"/g)).toHaveLength(2);
    expect(html.indexOf('three')).toBeLessThan(html.indexOf('two'));
    expect(html).not.toContain('four');
    expect(html).toContain('+2 more');
    expect(renderToStaticMarkup(<AlertStack alerts={[]} />)).toBe('');
  });
});

describe('BlackBoxMark', () => {
  it('names itself and its state', () => {
    const html = renderToStaticMarkup(<BlackBoxMark detail="ATTEMPT 4" />);
    expect(html).toContain('data-state="recording"');
    expect(html).toContain('aria-label="BLACK BOX, recording, ATTEMPT 4"');
    expect(html).toContain('rx-bbx__lamp');
  });

  it('adds a caution shape when the store is full, and can be a lamp alone', () => {
    expect(renderToStaticMarkup(<BlackBoxMark state="full" />)).toContain('▲');
    const lamp = renderToStaticMarkup(<BlackBoxMark state="idle" label="" />);
    expect(lamp).not.toContain('rx-bbx__label');
    expect(lamp).toContain('aria-label="Black Box, idle"');
  });
});

describe('Gauge', () => {
  const { sweep, radius } = gaugeArc;

  it('the arc opens at the bottom and runs over the top', () => {
    const [x0, y0] = arcPoint(0, radius, sweep);
    const [xm, ym] = arcPoint(0.5, radius, sweep);
    const [x1, y1] = arcPoint(1, radius, sweep);
    expect(xm).toBeCloseTo(50);
    expect(ym).toBeCloseTo(50 - radius);
    expect(x0).toBeLessThan(50);
    expect(x1).toBeGreaterThan(50);
    expect(y0).toBeCloseTo(y1);
    expect(y0).toBeGreaterThan(50);
    // The whole sweep is more than a half turn, half of it is not.
    expect(arcPath(0, 1, radius, sweep)).toContain(` 0 1 1 `);
    expect(arcPath(0, 0.5, radius, sweep)).toContain(` 0 0 1 `);
    expect(arcPath(0.3, 0.3, radius, sweep)).toBe('');
  });

  it('is a meter with its fill, limits and forecast on the dial', () => {
    const html = renderToStaticMarkup(
      <Gauge
        label="Main bus"
        value={4211}
        max={7500}
        text="4.2"
        unit="kW"
        forecast={5000}
        marks={[{ at: 6000, kind: 'caution' }]}
        status="caution"
      />,
    );
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="4211"');
    expect(html).toContain('aria-valuetext="4.2 kW, caution"');
    expect(html).toContain('class="rx-gauge__fill"');
    expect(html).toContain('class="rx-gauge__mark" data-kind="caution"');
    expect(html).toContain('class="rx-gauge__forecast"');
    expect(html).toContain('▲');
  });

  it('defaults to a percentage and draws no fill at zero', () => {
    const html = renderToStaticMarkup(<Gauge label="Store" value={0} />);
    expect(html).toContain('aria-valuetext="0 %"');
    expect(html).not.toContain('rx-gauge__fill');
  });
});
